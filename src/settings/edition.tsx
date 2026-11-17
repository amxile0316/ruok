// Modified by the RUOK fork on 2026-11-17: rebrand and upstream/Pro cleanup.
import {CreationEnvironment} from '../general/CreationEnvironment';
import {AboutUpdate} from '../standard/ClientUpdate';
import {ConnectionList} from '../studio/components/ConnectionSettings';
import {AgentInstallation} from '../studio/components/AgentInstallation';
import {UNIFIED_AGENTS} from '../general/platform';
import type {ConnectionId,ConnectionMode} from '../studio/connections';
import pkg from '../../package.json';
export const settingsGroups=['general','agents','models','storage','export','backup','about'];
export function AgentRoster(props:{initialAgent?:ConnectionId;initialMode?:ConnectionMode;onDirtyChange?:(value:boolean)=>void;onBusyChange?:(value:boolean)=>void}={}){return UNIFIED_AGENTS?<ConnectionList {...props}/>:<section className="agent-roster"><h2>已接入的 Agent</h2><p className="agent-roster-intro">按运行工作台服务的这台电脑检测。Codex 接入后，可在「工作模块的模型」里选择模型。</p><div className="agent-roster-list"><AgentInstallation kind="codex" {...props} use={<>用于 <b>工作模块</b>（见「工作模块的模型」）</>}/></div></section>}

export function EnhancedAgentSettings(){return null}
export function IntegrationSettings(){return null}
export function PublishDirSetting(){return null}
export function ProjectMigration(_props:{defaultTarget:string;disabled:boolean;onChanged:()=>void}){return null}
export function StandardAbout({environment=true}:{environment?:boolean}={}){return <><AboutUpdate/>{environment&&<CreationEnvironment/>}<section><h3>RUOK</h3><p>版本 {pkg.version}</p><p>通用剪辑与录屏运镜，本地开源创作工作台。基于 OpenTake Standard 1.1.3 分支。</p><p>默认不采集使用行为；更新检查默认关闭。工程保存在本机；使用智能体或第三方接口时，任务内容会发送给你选择的提供方。</p><p>代码采用 AGPL-3.0。OpenTake 名称与图标不随代码授权；RUOK 分支的改动与来源见 NOTICE 和 RUOK-PROVENANCE.md。</p><a href="/NOTICE" target="_blank" rel="noreferrer">开源许可与第三方署名</a></section></>}
export function DesktopSettings({section}:{section?:string}){return section==='about'?<StandardAbout environment={false}/>:null}
