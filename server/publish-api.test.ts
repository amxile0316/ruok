import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {buildPublishPrompt,handlePublishApi,localCopy,validatePublishProfile} from './publish-api.ts';

async function withServer(run: (base: string) => Promise<void>) {
  const server = http.createServer((req, res) => { void handlePublishApi(req, res) });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const {port} = server.address() as {port: number};
  try { await run(`http://127.0.0.1:${port}`) } finally { await new Promise<void>(resolve => server.close(() => resolve())) }
}

test('文案发布：空素材与不支持的平台直接拒绝，不启动智能体',async()=>{
  await withServer(async base => {
    const empty=await fetch(`${base}/generate`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({source:'   '})});
    assert.equal(empty.status,400);
    assert.match((await empty.json() as {error:string}).error,/粘贴/);
    const platform=await fetch(`${base}/generate`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({source:'一段可以写的稿子',platform:'myspace'})});
    assert.equal(platform.status,400);
    assert.match((await platform.json() as {error:string}).error,/平台/);
  });
});

test('本机智能体未接通时的本地稿：标题不超平台上限，要点和话题来自素材',()=>{
  const copy=localCopy('把长视频变短的方法。第一步删停顿。第二步删口误。#剪辑 #效率','xiaohongshu');
  assert.ok(copy.title.length<=20);
  assert.equal(copy.title,'把长视频变短的方法');
  assert.match(copy.body,/· 第一步删停顿/);
  assert.deepEqual(copy.tags,['剪辑','效率']);
  assert.ok(copy.hook.endsWith('方法'));
});

test('有效账号画像只把非凭据上下文加入提示词',()=>{
  const checked=validatePublishProfile({
    id:'profile-id-not-in-prompt',
    platform:'douyin',
    timestamp:'2026-01-02T03:04:05.000Z',
    displayName:'  小若  ',
    positioning:'  分享真实剪辑经验  ',
    targetAudience:'  独立创作者  ',
    languageStyle:'  直接、温和  ',
    contentPillars:['  剪辑方法  ','','创作复盘'],
    compliancePreferences:['  不夸大效果  ',''],
  });
  assert.ok(checked.ok);
  assert.deepEqual(checked.profile,{
    displayName:'小若',
    positioning:'分享真实剪辑经验',
    targetAudience:'独立创作者',
    languageStyle:'直接、温和',
    contentPillars:['剪辑方法','创作复盘'],
    compliancePreferences:['不夸大效果'],
  });
  const prompt=buildPublishPrompt({source:'只有这一条事实。',platform:'xiaohongshu',tone:'  轻松  ',profile:checked.profile});
  for(const expected of ['昵称/显示名：小若','定位：分享真实剪辑经验','目标受众：独立创作者','语言风格：直接、温和','内容支柱：剪辑方法、创作复盘','合规偏好：不夸大效果','语气偏好：轻松。','只使用素材里的事实']){
    assert.ok(prompt.includes(expected),expected);
  }
  assert.ok(!prompt.includes('profile-id-not-in-prompt'));
  assert.ok(!prompt.includes('2026-01-02T03:04:05.000Z'));
  assert.ok(!prompt.includes('抖音'));
});

test('空白画像字段被忽略且不产生画像提示',()=>{
  const blankProfile={
    displayName:'   ',
    positioning:'\n\t',
    targetAudience:' ',
    languageStyle:'',
    contentPillars:[' ','\n'],
    compliancePreferences:[''],
  };
  const checked=validatePublishProfile(blankProfile);
  assert.ok(checked.ok);
  assert.deepEqual(checked.profile,{});
  assert.deepEqual(validatePublishProfile(undefined),{ok:true,profile:{}});
  const prompt=buildPublishPrompt({source:'只有素材。',platform:'xiaohongshu',profile:blankProfile});
  for(const unexpected of ['账号画像','昵称/显示名：','定位：','目标受众：','语言风格：','内容支柱：','合规偏好：']){
    assert.ok(!prompt.includes(unexpected),unexpected);
  }
});

test('未知凭据字段被拒绝且不会进入提示词',()=>{
  const secrets={cookie:'cookie-secret',password:'password-secret',token:'token-secret'};
  const checked=validatePublishProfile({displayName:'小若',...secrets});
  assert.ok(!checked.ok);
  assert.match(checked.error,/未知字段/);
  const prompt=buildPublishPrompt({source:'只有素材。',platform:'xiaohongshu',profile:{displayName:'小若',...secrets}});
  assert.ok(prompt.includes('昵称/显示名：小若'));
  for(const secret of Object.values(secrets)) assert.ok(!prompt.includes(secret));
});

test('画像类型错误、字段超长和未知字段都返回 400',async()=>{
  const long='长'.repeat(1201);
  const cases:Array<[string,unknown]>=[
    ['画像不是对象','bad'],
    ['画像是数组',[]],
    ['ID 类型',{id:1}],
    ['画像平台类型',{platform:{}}],
    ['时间元数据超长',{timestamp:long}],
    ['显示名类型',{displayName:1}],
    ['定位类型',{positioning:1}],
    ['目标受众类型',{targetAudience:['创作者']}],
    ['语言风格类型',{languageStyle:null}],
    ['内容支柱不是数组',{contentPillars:'剪辑'}],
    ['内容支柱项目类型',{contentPillars:['剪辑',1]}],
    ['合规偏好不是数组',{compliancePreferences:{}}],
    ['合规偏好项目类型',{compliancePreferences:[false]}],
    ['显示名超长',{displayName:'名'.repeat(121)}],
    ['定位超长',{positioning:long}],
    ['目标受众超长',{targetAudience:long}],
    ['语言风格超长',{languageStyle:long}],
    ['内容支柱超长',{contentPillars:[long]}],
    ['合规偏好超长',{compliancePreferences:[long]}],
    ['未知凭据字段',{cookie:'cookie-secret'}],
  ];
  await withServer(async base => {
    for(const [name,profile] of cases){
      const response=await fetch(`${base}/generate`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({source:'一段可以写的稿子',profile})});
      const payload=await response.json() as {ok:boolean;error:string};
      assert.equal(response.status,400,`${name}: ${JSON.stringify(payload)}`);
      assert.equal(payload.ok,false,name);
      assert.match(payload.error,/画像/,name);
    }
  });
});

test('文案发布没有生成以外的入口',async()=>{
  await withServer(async base => {
    const response=await fetch(`${base}/publish-now`,{method:'POST'});
    assert.equal(response.status,404);
    assert.match((await response.json() as {error:string}).error,/没有这个接口/);
  });
});
