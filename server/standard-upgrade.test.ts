import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import {EventEmitter} from 'node:events';
import type {IncomingMessage,ServerResponse} from 'node:http';
// The fork ships upgrade.json without an endpoint and removed the upstream account/Pro endpoints.
// This test pins that contract: state stays local, no request leaves the machine, daily checks skip.
test('public upgrade stays local without an endpoint and daily checks skip without network',async t=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'standard-upgrade-'));const old=process.env.OPENTAKE_STANDARD_USER_DATA;process.env.OPENTAKE_STANDARD_USER_DATA=root;const original=globalThis.fetch;const calls:string[]=[];
 t.after(()=>{globalThis.fetch=original;if(old===undefined)delete process.env.OPENTAKE_STANDARD_USER_DATA;else process.env.OPENTAKE_STANDARD_USER_DATA=old;fs.rmSync(root,{recursive:true,force:true})});
 const {upgradeApi,UPGRADE_URL}=await import('./standard/upgrade.ts');
 const {default:upgradeConfig}=await import('../upgrade.json',{with:{type:'json'}});
 globalThis.fetch=async(input:any)=>{calls.push(String(input));throw Error('network disabled in tests')};
 const request=async(url:string,method='GET',body?:unknown)=>{let text='';const res={statusCode:0,setHeader(){},end(value:string){text=value}};const req=Object.assign(new EventEmitter(),{method,url});const pending=upgradeApi(req as unknown as IncomingMessage,res as unknown as ServerResponse);if(body!==undefined)req.emit('data',Buffer.from(JSON.stringify(body)));req.emit('end');await pending;return {status:res.statusCode,body:text?JSON.parse(text):null}};
 assert.equal(UPGRADE_URL,'','分支不内置更新地址');
 assert.equal(upgradeConfig.endpoint,'');
 const state=await request('/api/upgrade/state');
 assert.equal(state.status,200);
 assert.equal(state.body.upgrade.mode,'beta');
 assert.equal(state.body.upgrade.offline,true);
 assert.match(state.body.upgrade.notice,/RUOK 分支尚未配置更新服务/);
 assert.equal(state.body.account,null);
 assert.equal(state.body.error,'');
 assert.equal(state.body.clientUpdate.offline,true);
 assert.equal(state.body.clientUpdate.notify,false);
 assert.deepEqual(calls,[],'未配置更新源时不得发起网络请求');
 const firstDaily=await request('/api/upgrade/daily');assert.equal(firstDaily.status,200);assert.equal(firstDaily.body.skipped,true,'状态检查已记录当天时间');
 const secondDaily=await request('/api/upgrade/daily');assert.equal(secondDaily.body.skipped,true);
 assert.deepEqual(calls,[]);
 const preferences=await request('/api/upgrade/preferences');assert.deepEqual(preferences.body,{daily:true});
 const saved=await request('/api/upgrade/preferences','PUT',{daily:false});assert.deepEqual(saved.body,{daily:false});
 assert.deepEqual((await request('/api/upgrade/preferences')).body,{daily:false});
 assert.equal((await request('/api/upgrade/daily')).body.skipped,true);
 assert.equal((await request('/api/upgrade/removed')).status,404);
 assert.deepEqual(calls,[]);
});
