import test from 'node:test';
import assert from 'node:assert/strict';
import type {Work} from '../src/analytics/model.ts';
import {
  addContentDraft,appendProfileMemory,attachDraftAsset,confirmPublication,createAccountProfile,createContentDraft,createOperationsState,
  removeAccountProfile,removeContentDraft,removeDraftAsset,removeProfileMemory,transitionContentDraft,updateContentDraft,upsertAccountProfile,
  type AccountProfile,type ContentDraft,type DraftAsset,type OperationsState,
} from '../src/operations/model.ts';
import {
  LEGACY_WORKS_STORAGE_KEY,loadOperations,migrateLegacyWorks,OPERATIONS_STORAGE_KEY,
  parseOperationsState,saveOperations,type OperationsStorage,
} from '../src/operations/storage.ts';

const TIME='2026-11-25T08:00:00.000Z';
const input={source:'topic-1',platform:'xiaohongshu' as const,accountId:'account-1',topic:'效率',tone:'真诚',title:'初稿',body:'正文',tags:['效率'],hook:'反常识'};

class MemoryStorage implements OperationsStorage {
  values=new Map<string,string>();
  writes=0;
  failGet=false;
  failSet=false;
  constructor(entries:Record<string,string>={}){this.values=new Map(Object.entries(entries));}
  getItem(key:string){if(this.failGet)throw new Error('read failed');return this.values.get(key)??null;}
  setItem(key:string,value:string){if(this.failSet)throw new Error('write failed');this.writes++;this.values.set(key,value);}
}

function draftState(){
  const draft=createContentDraft(input,{id:'draft-1',now:TIME});
  return addContentDraft(createOperationsState(),draft);
}

function approvedState(){
  let state=transitionContentDraft(draftState(),'draft-1','in_review',{now:TIME});
  state=transitionContentDraft(state,'draft-1','approved',{now:TIME});
  return state;
}

function scheduledState(){
  return transitionContentDraft(approvedState(),'draft-1','scheduled',{scheduledAt:'2020-01-01T00:00:00.000Z',now:TIME});
}

function publishedState(){
  return confirmPublication(approvedState(),'draft-1',{confirmed:true,publishedAt:TIME,externalUrl:'https://example.com/posts/1'},{workId:'work-1',now:TIME}).state;
}

test('账号画像保留运营字段并剔除凭据，upsert 与删除不修改原状态',()=>{
  const withCredentials={platform:'douyin' as const,displayName:'昵称',positioning:'效率工具',targetAudience:'创作者',languageStyle:'简洁',contentPillars:['教程','复盘'],compliancePreferences:['不夸大功效'],cookie:'secret',password:'secret',token:'secret'};
  const profile=createAccountProfile(withCredentials,{id:'profile-1'});
  assert.deepEqual(Object.keys(profile).sort(),['compliancePreferences','contentPillars','displayName','id','languageStyle','memory','platform','positioning','targetAudience']);
  const empty=createOperationsState();
  const state=upsertAccountProfile(empty,{...profile,cookie:'another-secret'} as AccountProfile);
  assert.equal(empty.profiles.length,0);
  assert.equal(state.profiles[0].displayName,'昵称');
  assert.equal('cookie' in state.profiles[0],false);
  assert.equal('password' in state.profiles[0],false);
  assert.equal('token' in state.profiles[0],false);
  assert.equal(removeAccountProfile(state,'profile-1').profiles.length,0);
});

test('状态仅沿审核链路前进，排期可取消且逾期不会自动发布',()=>{
  let state=draftState();
  state=transitionContentDraft(state,'draft-1','in_review');
  state=transitionContentDraft(state,'draft-1','approved');
  state=transitionContentDraft(state,'draft-1','scheduled',{scheduledAt:'2020-01-01T00:00:00.000Z'});
  assert.equal(state.drafts[0].status,'scheduled');
  assert.equal(state.drafts[0].scheduledAt,'2020-01-01T00:00:00.000Z');
  const parsed=parseOperationsState(JSON.stringify(state));
  assert.ok(parsed.ok);
  assert.equal(parsed.state.drafts[0].status,'scheduled');
  assert.equal(parsed.state.drafts[0].publishedAt,undefined);
  state=transitionContentDraft(state,'draft-1','approved');
  assert.equal(state.drafts[0].status,'approved');
  assert.equal('scheduledAt' in state.drafts[0],false);
});

test('非法跃迁和绕过人工确认的发布都会被拒绝',()=>{
  assert.throws(()=>transitionContentDraft(draftState(),'draft-1','approved'),/不允许/);
  assert.throws(()=>transitionContentDraft(draftState(),'draft-1','scheduled',{scheduledAt:TIME}),/不允许/);
  assert.throws(()=>transitionContentDraft(approvedState(),'draft-1','in_review'),/不允许/);
  assert.throws(()=>transitionContentDraft(approvedState(),'draft-1','published'),/人工确认/);
  assert.throws(()=>transitionContentDraft(approvedState(),'draft-1','scheduled'),/排期时间无效/);
  assert.throws(()=>confirmPublication(draftState(),'draft-1',{confirmed:true,publishedAt:TIME}),/approved\/scheduled/);
});

test('审核后排期中的 title/body/tags/hook 修改均失效并清空排期，普通草稿保持 draft',()=>{
  const patches=[{title:'新标题'},{body:'新正文'},{tags:['新标签']},{hook:'新钩子'}];
  for(const patch of patches){
    const state=updateContentDraft(scheduledState(),'draft-1',patch,{now:'2026-11-25T09:00:00.000Z'});
    assert.equal(state.drafts[0].status,'in_review');
    assert.equal('scheduledAt' in state.drafts[0],false);
    assert.equal(state.drafts[0].updatedAt,'2026-11-25T09:00:00.000Z');
  }
  const ordinary=updateContentDraft(draftState(),'draft-1',{title:'普通修改'});
  assert.equal(ordinary.drafts[0].status,'draft');
  const unchanged=updateContentDraft(approvedState(),'draft-1',{title:input.title});
  assert.equal(unchanged.drafts[0].status,'approved');
});

test('人工确认严格校验输入，按草稿幂等创建零指标 Work',()=>{
  const state=approvedState();
  assert.throws(()=>confirmPublication(state,'draft-1',{confirmed:false,publishedAt:TIME}),/confirmed=true/);
  assert.throws(()=>confirmPublication(state,'draft-1',{confirmed:true,publishedAt:'not-a-date'}),/实际发布时间无效/);
  assert.throws(()=>confirmPublication(state,'draft-1',{confirmed:true,publishedAt:TIME,externalUrl:'ftp://example.com/a'}),/http\(s\)/);
  assert.equal(state.works.length,0);
  const confirmation={confirmed:true,publishedAt:TIME,externalUrl:'https://example.com/posts/1'};
  const result=confirmPublication(state,'draft-1',confirmation,{workId:'work-1',now:TIME});
  assert.equal(result.state.drafts[0].status,'published');
  assert.equal(result.state.drafts[0].workId,'work-1');
  assert.deepEqual(result.work,{
    id:'work-1',draftId:'draft-1',accountId:'account-1',externalUrl:'https://example.com/posts/1',publicationSource:'manual-confirmed',
    title:'初稿',platform:'小红书',publishedAt:TIME,durationSec:0,style:'',hook:'反常识',topic:'效率',
    views:0,likes:0,comments:0,shares:0,saves:0,follows:0,
  });
  const repeated=confirmPublication(result.state,'draft-1',confirmation,{workId:'another-work'});
  assert.equal(repeated.work.id,'work-1');
  assert.equal(repeated.state.works.length,1);
  assert.strictEqual(repeated.state,result.state);
  assert.throws(()=>updateContentDraft(result.state,'draft-1',{body:'改写'}),/不可再编辑/);
  assert.throws(()=>transitionContentDraft(result.state,'draft-1','approved'),/不可再编辑/);
  assert.throws(()=>removeContentDraft(result.state,'draft-1'),/不可再编辑/);
});

test('scheduled 也只能通过人工确认发布，并沿用草稿实际发布字段',()=>{
  const result=confirmPublication(scheduledState(),'draft-1',{confirmed:true,publishedAt:'2026-11-24T12:00:00.000Z'},{workId:'work-scheduled'});
  assert.equal(result.state.drafts[0].status,'published');
  assert.equal(result.work.id,'work-scheduled');
  assert.equal(result.work.publishedAt,'2026-11-24T12:00:00.000Z');
  assert.equal(result.state.drafts[0].scheduledAt,'2020-01-01T00:00:00.000Z');
});

const legacyWork:Work={id:'old-id',title:'旧作品',platform:'小红书',publishedAt:'2024/01/02',durationSec:38,style:'教程',hook:'提问',topic:'效率',views:0,likes:2,comments:3,shares:4,saves:5,follows:6};

test('首次加载迁移旧作品，ID、日期和指标不变，旧键保留且 load 不写存储',()=>{
  const oldRaw=JSON.stringify([legacyWork]);
  const storage=new MemoryStorage({[LEGACY_WORKS_STORAGE_KEY]:oldRaw});
  const result=loadOperations(storage);
  assert.ok(result.ok);
  assert.equal(result.migrated,true);
  assert.deepEqual(result.state,{version:1,profiles:[],drafts:[],works:[{...legacyWork,publicationSource:'legacy'}]});
  assert.equal(result.state.works[0].id,'old-id');
  assert.equal(result.state.works[0].publishedAt,'2024/01/02');
  assert.equal(result.state.works[0].views,0);
  assert.equal(storage.getItem(LEGACY_WORKS_STORAGE_KEY),oldRaw);
  assert.equal(storage.getItem(OPERATIONS_STORAGE_KEY),null);
  assert.equal(storage.writes,0);
  assert.deepEqual(migrateLegacyWorks([legacyWork]).works[0].publicationSource,'legacy');
});

test('损坏或不支持的新存储返回明确错误，load 不回退、不覆盖任何键',()=>{
  const oldRaw=JSON.stringify([legacyWork]);
  const cases=[{raw:'{bad',code:'invalid-json'},{raw:JSON.stringify({version:2,profiles:[],drafts:[],works:[]}),code:'unsupported-version'}] as const;
  for(const item of cases){
    const storage=new MemoryStorage({[OPERATIONS_STORAGE_KEY]:item.raw,[LEGACY_WORKS_STORAGE_KEY]:oldRaw});
    const result=loadOperations(storage);
    assert.equal(result.ok,false);
    if(!result.ok)assert.equal(result.error.code,item.code);
    assert.equal(storage.getItem(OPERATIONS_STORAGE_KEY),item.raw);
    assert.equal(storage.getItem(LEGACY_WORKS_STORAGE_KEY),oldRaw);
    assert.equal(storage.writes,0);
  }
  const invalid=createOperationsState() as OperationsState;
  const storage=new MemoryStorage({[OPERATIONS_STORAGE_KEY]:JSON.stringify({...invalid,profiles:[{...createAccountProfile({platform:'x',displayName:'',positioning:'',targetAudience:'',languageStyle:'',contentPillars:[],compliancePreferences:[]},{id:'p'}),cookie:'secret'}]})});
  const result=loadOperations(storage);
  assert.equal(result.ok,false);
  if(!result.ok)assert.equal(result.error.code,'invalid-state');
  assert.equal(storage.writes,0);
});

test('save/load 完整往返；读取和写入异常均返回失败而不伪报成功',()=>{
  let state=publishedState();
  const profile=createAccountProfile({platform:'xiaohongshu',displayName:'账号',positioning:'效率',targetAudience:'创作者',languageStyle:'清晰',contentPillars:['教程'],compliancePreferences:[]},{id:'account-1'});
  state=upsertAccountProfile(state,profile);
  const storage=new MemoryStorage();
  assert.deepEqual(saveOperations(storage,state),{ok:true});
  assert.equal(storage.writes,1);
  const result=loadOperations(storage);
  assert.ok(result.ok);
  assert.equal(result.migrated,false);
  assert.deepEqual(result.state,state);
  assert.equal(storage.writes,1);
  storage.failSet=true;
  const failedSave=saveOperations(storage,state);
  assert.equal(failedSave.ok,false);
  if(!failedSave.ok)assert.equal(failedSave.error.code,'storage-write');
  storage.failGet=true;
  const failedLoad=loadOperations(storage);
  assert.equal(failedLoad.ok,false);
  if(!failedLoad.ok)assert.equal(failedLoad.error.code,'storage-read');
});

test('未发布草稿可删除，不隐式创建作品或改变其他内容',()=>{
  const state=draftState();
  const next=removeContentDraft(state,'draft-1');
  assert.equal(next.drafts.length,0);
  assert.equal(next.works.length,0);
  assert.equal(state.drafts.length,1);
});

const videoAsset:DraftAsset={path:'D:\\videos\\final.mp4',name:'final.mp4',bytes:80*1024*1024,durationSec:47.5,addedAt:TIME};
const coverAsset:DraftAsset={path:'D:\\videos\\cover.png',name:'cover.png',bytes:2048,ratio:'3:4',addedAt:TIME};

test('发布包素材：挂载与移除不改变审核状态，已发布不可改，确认发布写入成片时长',()=>{
  let state=attachDraftAsset(approvedState(),'draft-1','video',videoAsset,{now:TIME});
  assert.deepEqual(state.drafts[0].video,videoAsset);
  assert.equal(state.drafts[0].status,'approved'); // 换素材不算文案改动
  state=attachDraftAsset(state,'draft-1','cover',coverAsset,{now:TIME});
  assert.deepEqual(state.drafts[0].cover,coverAsset);
  const without=removeDraftAsset(state,'draft-1','cover',{now:TIME});
  assert.equal(without.drafts[0].cover,undefined);
  assert.strictEqual(removeDraftAsset(without,'draft-1','cover'),without); // 没有素材时原样返回
  assert.throws(()=>attachDraftAsset(draftState(),'draft-1','video',{...videoAsset,path:'   '}),/路径/);
  assert.throws(()=>attachDraftAsset(draftState(),'draft-1','cover',{...coverAsset,ratio:'1:1' as never}),/比例/);

  const published=confirmPublication(state,'draft-1',{confirmed:true,publishedAt:TIME},{workId:'work-video',now:TIME});
  assert.equal(published.work.durationSec,47.5);
  assert.throws(()=>attachDraftAsset(published.state,'draft-1','video',videoAsset),/不可再编辑/);
  assert.throws(()=>removeDraftAsset(published.state,'draft-1','video'),/不可再编辑/);
});

test('素材随运营状态一起读写，缺少素材字段的旧数据仍可解析',()=>{
  const state=attachDraftAsset(draftState(),'draft-1','video',videoAsset);
  const storage=new MemoryStorage();
  assert.deepEqual(saveOperations(storage,state),{ok:true});
  const loaded=loadOperations(storage);
  assert.ok(loaded.ok);
  assert.deepEqual(loaded.state.drafts[0].video,videoAsset);

  const plain=JSON.stringify({version:1,profiles:[],drafts:[createContentDraft(input,{id:'d1',now:TIME})],works:[]});
  const parsed=parseOperationsState(plain);
  assert.ok(parsed.ok);
  assert.equal(parsed.state.drafts[0].video,undefined);

  const bad=JSON.stringify({version:1,profiles:[],drafts:[{...createContentDraft(input,{id:'d1',now:TIME}),video:{...videoAsset,bytes:-1}}],works:[]});
  assert.equal(parseOperationsState(bad).ok,false);
});

test('画像记忆：结构化写入时间与关联作品，去重追加，按索引删除，旧纯文本记忆读盘升级',()=>{
  const stamp='2026-11-25T00:00:00.000Z';
  const empty=createOperationsState();
  const base=upsertAccountProfile(empty,createAccountProfile({platform:'xiaohongshu',displayName:'账号',positioning:'',targetAudience:'',languageStyle:'',contentPillars:[],compliancePreferences:[]},{id:'p1'}));
  assert.deepEqual(base.profiles[0].memory,[]);
  let state=appendProfileMemory(base,'p1','   ',stamp);
  assert.equal(state.profiles[0].memory!.length,0); // 空文本忽略
  state=appendProfileMemory(state,'p1','第一条记忆',stamp);
  state=appendProfileMemory(state,'p1','第一条记忆','2026-11-26T00:00:00.000Z'); // 完全相同不重复，也不改时间
  state=appendProfileMemory(state,'p1',{text:'第二条记忆',workId:'work-1',workTitle:'一条作品'},stamp);
  assert.deepEqual(state.profiles[0].memory,[
    {text:'第一条记忆',createdAt:stamp},
    {text:'第二条记忆',createdAt:stamp,workId:'work-1',workTitle:'一条作品'},
  ]);
  assert.equal(base.profiles[0].memory!.length,0); // 纯函数，原状态不变
  state=removeProfileMemory(state,'p1',0);
  assert.deepEqual(state.profiles[0].memory,[{text:'第二条记忆',createdAt:stamp,workId:'work-1',workTitle:'一条作品'}]);
  assert.strictEqual(removeProfileMemory(state,'p1',9),state); // 越界原样返回

  // 旧版纯文本记忆：读盘时升级为条目（createdAt 留空），不丢内容
  const raw=JSON.stringify({version:1,profiles:[{id:'p2',platform:'douyin',displayName:'旧',positioning:'',targetAudience:'',languageStyle:'',contentPillars:[],compliancePreferences:[],memory:['旧记忆']}],drafts:[],works:[]});
  const parsed=parseOperationsState(raw);
  assert.ok(parsed.ok);
  assert.deepEqual(parsed.state.profiles[0].memory,[{text:'旧记忆',createdAt:''}]);
  const after=appendProfileMemory(parsed.state,'p2','旧画像也能记',stamp);
  assert.deepEqual(after.profiles[0].memory,[{text:'旧记忆',createdAt:''},{text:'旧画像也能记',createdAt:stamp}]);
});
