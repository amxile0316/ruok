import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import http from 'node:http';
// The fork removed the author-operated update feed. The HTTP surface now only serves
// local client-update state and daily preferences; nothing may reach a remote host.
test('local upgrade HTTP serves offline state and never contacts a remote feed',async()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'update-http-')),keys=['OPENTAKE_STANDARD_USER_DATA','OPENTAKE_UPGRADE_TEST_URL','OPENTAKE_UPGRADE_FALLBACK_URL','OPENTAKE_MAC_UPDATE_TEST_URL'];const before=Object.fromEntries(keys.map(k=>[k,process.env[k]]));
 const seen:string[]=[];
 const remote=http.createServer((req,res)=>{seen.push(String(req.url));res.setHeader('Content-Type','application/json');res.end('{}')});
 await new Promise<void>(r=>remote.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+(remote.address() as {port:number}).port;
 process.env.OPENTAKE_STANDARD_USER_DATA=root;process.env.OPENTAKE_UPGRADE_TEST_URL=origin;process.env.OPENTAKE_UPGRADE_FALLBACK_URL=origin+'/fallback';process.env.OPENTAKE_MAC_UPDATE_TEST_URL=origin+'/mac-update.json';
 const {upgradeApi}=await import('./standard/upgrade.ts');const local=http.createServer((req,res)=>void upgradeApi(req,res));await new Promise<void>(r=>local.listen(0,'127.0.0.1',r));const client='http://127.0.0.1:'+(local.address() as {port:number}).port+'/api/upgrade';
 try{
  const call=async(route:string,method='GET',body?:unknown)=>{const response=await fetch(client+route,{method,...(body?{headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}:{})});return {status:response.status,body:await response.json()}};
  const state=await call('/state');
  assert.equal(state.status,200);
  assert.equal(state.body.upgrade.offline,true);
  assert.equal(state.body.clientUpdate.offline,true);
  assert.equal(state.body.clientUpdate.notify,false);
  assert.equal(state.body.account,null);
  assert.equal(state.body.error,'');
  assert.deepEqual(seen,[],'不得请求远端更新源');
  const preferences=await call('/preferences');assert.deepEqual(preferences.body,{daily:true});
  await call('/preferences','PUT',{daily:false});assert.deepEqual((await call('/preferences')).body,{daily:false});
  assert.equal((await call('/daily')).body.skipped,true);
  assert.deepEqual(seen,[],'关闭每日检查后更不应有网络请求');
  const missing=await call('/removed');assert.equal(missing.status,404);assert.match(String(missing.body.error),/接口不存在/);
 }finally{await Promise.all([new Promise<void>(r=>local.close(()=>r())),new Promise<void>(r=>remote.close(()=>r()))]);for(const k of keys){if(before[k]===undefined)delete process.env[k];else process.env[k]=before[k]}fs.rmSync(root,{recursive:true,force:true})}
});
