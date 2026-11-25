import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {handleTrendApi,parseFeed,TREND_SOURCES} from './trend-api.ts';

const RSS=`<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0"><channel><title>示例源</title>
<item><title><![CDATA[把长视频剪成 3 条短片的流程]]></title><link>https://example.com/a</link><pubDate>24 Nov 2026 08:00:00 GMT</pubDate></item>
<item><title>效率工具 &amp; 工作流盘点</title><link>https://example.com/b</link></item>
<item><title>   </title><link>https://example.com/empty</link></item>
<item><title>把长视频剪成 3 条短片的流程</title><link>https://example.com/dup</link></item>
</channel></rss>`;

const ATOM=`<?xml version="1.0" encoding="utf-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
<entry><title>每周工具周刊 第 100 期</title><link rel="alternate" href="https://example.com/weekly"/><updated>2026-11-20T10:00:00Z</updated></entry>
<entry><title>录屏转场怎么做更稳</title><link href="https://example.com/screen"/><published>2026-11-19T09:30:00Z</published></entry>
</feed>`;

test('热点源解析：RSS 与 Atom 都取标题、链接和发布时间，空标题和重复标题跳过',()=>{
  const rss=parseFeed(RSS);
  assert.equal(rss.length,2);
  assert.equal(rss[0].title,'把长视频剪成 3 条短片的流程');
  assert.equal(rss[0].link,'https://example.com/a');
  assert.equal(rss[0].publishedAt,'2026-11-24T08:00:00.000Z');
  assert.equal(rss[1].title,'效率工具 & 工作流盘点');
  assert.equal(rss[1].publishedAt,undefined);

  const atom=parseFeed(ATOM);
  assert.deepEqual(atom.map(item=>item.title),['每周工具周刊 第 100 期','录屏转场怎么做更稳']);
  assert.equal(atom[0].link,'https://example.com/weekly');
  assert.equal(atom[1].publishedAt,'2026-11-19T09:30:00.000Z');

  assert.equal(parseFeed(RSS,1).length,1);
  assert.deepEqual(parseFeed('不是订阅源'),[]);
});

type ServerDeps=Parameters<typeof handleTrendApi>[2];

async function withServer(deps:ServerDeps,run:(base:string)=>Promise<void>){
  const server=http.createServer((req,res)=>{void handleTrendApi(req,res,deps)});
  await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));
  const {port}=server.address() as {port:number};
  try{await run(`http://127.0.0.1:${port}`)}finally{await new Promise<void>(resolve=>server.close(()=>resolve()))}
}

const reply=(text:string,status=200)=>({ok:status>=200&&status<300,status,text:async()=>text});

test('热点源清单只暴露 id、名称与说明，未知源和错误路径都明确拒绝',async()=>{
  await withServer({},async base=>{
    const sources=await fetch(`${base}/sources`);
    assert.equal(sources.status,200);
    const payload=await sources.json() as {ok:boolean;sources:{id:string;name:string;note:string;url?:string}[]};
    assert.ok(payload.ok);
    assert.equal(payload.sources.length,TREND_SOURCES.length);
    assert.equal(payload.sources[0].id,'sspai');
    assert.equal(payload.sources[0].url,undefined);

    const unknown=await fetch(`${base}/fetch`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({sourceId:'myspace'})});
    assert.equal(unknown.status,400);
    assert.match((await unknown.json() as {error:string}).error,/热点源/);

    const missing=await fetch(`${base}/fetch`,{method:'GET'});
    assert.equal(missing.status,404);
  });
});

test('热点取数：成功返回条目与采集时间，10 分钟内走缓存，上游失败报 502 且不污染缓存',async()=>{
  let clock=1_700_000_000_000;
  let calls=0;
  const okFeed={fetchImpl:async()=>{calls+=1;return reply(RSS)},now:()=>clock};
  await withServer(okFeed,async base=>{
    const first=await fetch(`${base}/fetch`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({sourceId:'sspai'})});
    assert.equal(first.status,200);
    const payload=await first.json() as {ok:boolean;cached:boolean;fetchedAt:string;source:{name:string};items:{title:string}[]};
    assert.ok(payload.ok);
    assert.equal(payload.cached,false);
    assert.equal(payload.source.name,'少数派');
    assert.equal(payload.fetchedAt,new Date(clock).toISOString());
    assert.equal(payload.items.length,2);
    assert.equal(calls,1);

    clock+=60_000;
    const second=await fetch(`${base}/fetch`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({sourceId:'sspai'})});
    const cached=await second.json() as {cached:boolean;items:{title:string}[]};
    assert.equal(cached.cached,true);
    assert.equal(cached.items.length,2);
    assert.equal(calls,1);
  });

  const broken={fetchImpl:async()=>reply('维护中',503),now:()=>clock+60*60*1000};
  await withServer(broken,async base=>{
    const failed=await fetch(`${base}/fetch`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({sourceId:'sspai'})});
    assert.equal(failed.status,502);
    assert.match((await failed.json() as {error:string}).error,/少数派 暂时取不到/);
  });

  const empty={fetchImpl:async()=>reply('<rss><channel></channel></rss>'),now:()=>clock+2*60*60*1000};
  await withServer(empty,async base=>{
    const noItems=await fetch(`${base}/fetch`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({sourceId:'v2ex'})});
    assert.equal(noItems.status,502);
    assert.match((await noItems.json() as {error:string}).error,/没有解析到可用条目/);
  });
});
