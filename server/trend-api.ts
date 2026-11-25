import type {IncomingMessage,ServerResponse} from 'node:http';
import {bodyJson,sendJson} from './http.ts';

/** 热点源只从固定清单取数，不接受任意 URL，避免本地服务被当成跳板。 */
export type TrendSource = {readonly id:string;readonly name:string;readonly url:string;readonly note:string};

export const TREND_SOURCES:readonly TrendSource[]=[
  {id:'sspai',name:'少数派',url:'https://sspai.com/feed',note:'效率工具与创作方法'},
  {id:'36kr',name:'36氪',url:'https://36kr.com/feed',note:'科技与商业动态'},
  {id:'v2ex',name:'V2EX',url:'https://www.v2ex.com/index.xml',note:'开发者社区热帖'},
  {id:'ruanyf',name:'阮一峰周刊',url:'https://www.ruanyifeng.com/blog/atom.xml',note:'每周技术与工具周刊'},
];

export type TrendItem={readonly title:string;readonly link?:string;readonly publishedAt?:string};

const LIMIT=20;
const CACHE_MS=10*60*1000;
const TIMEOUT_MS=8000;
const MAX_BYTES=2*1024*1024;

const cache=new Map<string,{at:number;items:TrendItem[]}>();

const decodeEntities=(text:string)=>text
  .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g,'$1')
  .replace(/&#x([0-9a-f]+);/gi,(_,code:string)=>String.fromCodePoint(parseInt(code,16)))
  .replace(/&#(\d+);/g,(_,code:string)=>String.fromCodePoint(Number(code)))
  .replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"').replace(/&apos;/g,"'").replace(/&amp;/g,'&');

const plainText=(text:string)=>decodeEntities(text.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g,'$1').replace(/<[^>]*>/g,' ')).replace(/\s+/g,' ').trim();

function tagText(block:string,tag:string){
  const match=new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)</${tag}>`,'i').exec(block);
  return match?plainText(match[1]):'';
}

function isoDate(value:string){
  if(!value)return undefined;
  const time=Date.parse(value);
  return Number.isNaN(time)?undefined:new Date(time).toISOString();
}

/**
 * 只取选题需要的字段：标题、链接、发布时间。RSS 2.0 的 <item> 和 Atom 的 <entry> 都支持，
 * 解析失败或字段缺失时跳过该条，不因为一条脏数据让整批失败。
 */
export function parseFeed(xml:string,limit=LIMIT):TrendItem[] {
  const items:TrendItem[]=[];
  const seen=new Set<string>();
  const rss=[...xml.matchAll(/<item(?:\s[^>]*)?>[\s\S]*?<\/item>/gi)].map(match=>match[0]);
  const blocks=rss.length?rss:[...xml.matchAll(/<entry(?:\s[^>]*)?>[\s\S]*?<\/entry>/gi)].map(match=>match[0]);
  for(const block of blocks){
    if(items.length>=limit)break;
    const title=tagText(block,'title');
    if(!title||seen.has(title))continue;
    const link=((tagText(block,'link')||/<link\b[^>]*href="([^"]+)"/i.exec(block)?.[1])??'').trim()||undefined;
    const publishedAt=isoDate(tagText(block,'pubDate')||tagText(block,'published')||tagText(block,'updated')||tagText(block,'dc:date'));
    seen.add(title);
    items.push({title,...(link?{link}:{}),...(publishedAt?{publishedAt}:{})});
  }
  return items;
}

type FetchLike=(input:string,init?:{signal?:AbortSignal;headers?:Record<string,string>})=>Promise<{ok:boolean;status:number;text():Promise<string>}>;

export type TrendDeps={fetchImpl?:FetchLike;now?:()=>number};

/**
 * 热点取词：GET /sources 给清单，POST /fetch 按 sourceId 取标题。
 * 只读公开 RSS/Atom，10 分钟内存缓存，失败不覆盖旧缓存，也不写任何本地文件。
 */
export async function handleTrendApi(req:IncomingMessage,res:ServerResponse,deps:TrendDeps={}) {
  const url=new URL(req.url||'/','http://localhost');
  if(url.pathname==='/sources'&&req.method==='GET'){
    return sendJson(res,200,{ok:true,sources:TREND_SOURCES.map(({id,name,note})=>({id,name,note}))});
  }
  if(url.pathname!=='/fetch'||req.method!=='POST'){
    return sendJson(res,404,{ok:false,error:'热点取词没有这个接口'});
  }

  let sourceId='';
  try{
    const body=await bodyJson(req) as {sourceId?:unknown};
    sourceId=typeof body.sourceId==='string'?body.sourceId.trim():'';
  }catch{
    return sendJson(res,400,{ok:false,error:'请求格式不正确'});
  }
  const source=TREND_SOURCES.find(item=>item.id===sourceId);
  if(!source)return sendJson(res,400,{ok:false,error:'先选择一个热点源'});

  const now=deps.now??Date.now;
  const cached=cache.get(source.id);
  if(cached&&now()-cached.at<CACHE_MS){
    return sendJson(res,200,{ok:true,source:{id:source.id,name:source.name},fetchedAt:new Date(cached.at).toISOString(),cached:true,items:cached.items});
  }

  try{
    const doFetch=deps.fetchImpl??(fetch as unknown as FetchLike);
    const response=await doFetch(source.url,{
      signal:AbortSignal.timeout(TIMEOUT_MS),
      headers:{accept:'application/rss+xml, application/atom+xml, application/xml, text/xml;q=0.9, */*;q=0.8','user-agent':'RUOK/2.1 (+local trend reader)'},
    });
    if(!response.ok)throw new Error(`上游返回 ${response.status}`);
    const text=await response.text();
    if(text.length>MAX_BYTES)throw new Error('上游返回内容过大');
    const items=parseFeed(text);
    if(!items.length)throw new Error('没有解析到可用条目');
    const at=now();
    cache.set(source.id,{at,items});
    return sendJson(res,200,{ok:true,source:{id:source.id,name:source.name},fetchedAt:new Date(at).toISOString(),cached:false,items});
  }catch(error){
    return sendJson(res,502,{ok:false,error:`${source.name} 暂时取不到：${error instanceof Error?error.message:String(error)}`});
  }
}
