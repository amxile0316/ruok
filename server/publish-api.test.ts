import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {handlePublishApi,localCopy} from './publish-api.ts';

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

test('文案发布没有生成以外的入口',async()=>{
  await withServer(async base => {
    const response=await fetch(`${base}/publish-now`,{method:'POST'});
    assert.equal(response.status,404);
    assert.match((await response.json() as {error:string}).error,/没有这个接口/);
  });
});
