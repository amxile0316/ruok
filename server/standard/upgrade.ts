// Modified by the RUOK fork on 2026-11-17:
// - removed the upstream Pro application/login/download endpoints and author-operated update service;
// - kept only local client-update and preferences routes;
// - when upgrade.json has no endpoint, no update network request is made.
import {updateView,dismissUpdate,macFeed} from './client-update.ts';
import {windowsUpdateApi} from './windows-update.ts';
import platform from '../platform.ts';
import {atomicJsonSync} from '../file-ops.ts';
import fs from 'node:fs';import path from 'node:path';import type {IncomingMessage,ServerResponse} from 'node:http';import {bodyJson,sendJson} from '../http.ts';
import upgradeConfig from '../../upgrade.json' with {type:'json'};
export const UPGRADE_URL=upgradeConfig.endpoint;
const root=platform.standardDataRoot();
const file=path.join(root,'upgrade-session.json');
type Saved={daily?:boolean;checkedDay?:string};let saved:Saved={};try{saved=JSON.parse(fs.readFileSync(file,'utf8'))}catch{/* fresh profile */}
function save(){fs.mkdirSync(root,{recursive:true,mode:0o700});atomicJsonSync(file,saved,{mode:0o600})}
function config(){return {mode:upgradeConfig.mode||'beta',notice:upgradeConfig.notice||'',offline:!UPGRADE_URL}}
const offlineUpdate=()=>({...updateView(),notify:false,offline:true,message:'本分支尚未配置更新源。'});
export async function upgradeApi(req:IncomingMessage,res:ServerResponse){const route=new URL(req.url||'/','http://localhost').pathname.replace('/api/upgrade','');try{
 if(route.startsWith('/windows/'))return await windowsUpdateApi(req,res,route.slice('/windows'.length));
 if(req.method==='GET'&&route==='/client')return sendJson(res,200,UPGRADE_URL?updateView():offlineUpdate());
 if(req.method==='POST'&&route==='/dismiss'){const b=await bodyJson(req) as {action:string};return sendJson(res,200,dismissUpdate(b.action))}
 if(req.method==='GET'&&route==='/preferences')return sendJson(res,200,{daily:saved.daily!==false});
 if(req.method==='PUT'&&route==='/preferences'){const b=await bodyJson(req) as {daily?:boolean};saved.daily=b.daily!==false;save();return sendJson(res,200,{daily:saved.daily})}
 if(req.method==='GET'&&(route==='/state'||route==='/daily')){const day=new Date().toLocaleDateString('en-CA');if(route==='/daily'&&(saved.daily===false||saved.checkedDay===day))return sendJson(res,200,{skipped:true});const upgrade=config();if(!UPGRADE_URL){saved.checkedDay=day;save();return sendJson(res,200,{upgrade,account:null,error:'',clientUpdate:offlineUpdate()})}const release=await macFeed(undefined);saved.checkedDay=day;save();return sendJson(res,200,{upgrade,account:null,error:'',clientUpdate:release===undefined?{...updateView(),notify:false,offline:true}:updateView(release,route==='/state')})}
 return sendJson(res,404,{error:'接口不存在'});
 }catch(e){return sendJson(res,(e as {status?:number}).status||503,{error:e instanceof Error?e.message:'服务暂时不可用'})}}
