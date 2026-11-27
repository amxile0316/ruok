const {randomUUID}=require('node:crypto');
const path=require('node:path');
/** 每种请求对应的对话框：标题、Electron properties 与可选的文件类型过滤。 */
const KINDS={
 folder:{title:'选择文件夹',properties:['openDirectory']},
 executable:{title:'选择智能体程序',properties:['openFile'],filters:[{name:'Windows 程序',extensions:['exe','cmd','bat']}]},
 media:{title:'选择成片',properties:['openFile'],filters:[{name:'视频',extensions:['mp4','mov','m4v','mkv','webm','avi']}]},
 image:{title:'选择封面',properties:['openFile'],filters:[{name:'图片',extensions:['png','jpg','jpeg','webp','bmp']}]},
};
function installFileDialogBridge(child,dialog,parent){
 let busy=false;
 const receive=async message=>{
  const request=message?.fileDialogRequest;
  const kind=KINDS[request?.kind];
  if(!request||!kind||!/^[a-f\d-]{36}$/.test(request.id)||!child.connected)return;
  const send=value=>{try{if(child.connected)child.send({fileDialogResponse:{id:request.id,...value}},()=>{})}catch{}};
  if(busy)return send({error:'还有一个文件选择窗口未关闭'});
  busy=true;
  try{
   const result=await dialog.showOpenDialog(parent(),{title:kind.title,properties:kind.properties,...(kind.filters?{filters:kind.filters}:{})});
   send({path:result.canceled?null:result.filePaths[0]||null});
  }catch{send({error:'无法打开文件选择窗口'})}finally{busy=false}
 };
 child.on('message',receive);child.once('exit',()=>child.off('message',receive));
}
function requestFileDialog(kind,channel=process,timeoutMs=120000){
 return new Promise((resolve,reject)=>{
  if(!channel.connected||typeof channel.send!=='function')return reject(Error('文件选择器需要桌面窗口，请输入绝对路径'));
  const id=randomUUID();let timer,settled=false;
  const finish=(error,value)=>{if(settled)return;settled=true;clearTimeout(timer);channel.off('message',receive);channel.off('disconnect',disconnected);error?reject(error):resolve(value)};
  const receive=message=>{const response=message?.fileDialogResponse;if(response?.id!==id)return;if(response.error)return finish(Error(response.error));if(response.path!==null&&(typeof response.path!=='string'||!path.isAbsolute(response.path)))return finish(Error('文件选择结果无效'));finish(null,response.path)};
  const disconnected=()=>finish(Error('桌面窗口已断开'));
  channel.on('message',receive);channel.once('disconnect',disconnected);timer=setTimeout(()=>finish(Error('文件选择超时，请重试')),timeoutMs);
  try{channel.send({fileDialogRequest:{id,kind}},error=>{if(error)finish(error)})}catch(error){finish(error)}
 });
}
module.exports={installFileDialogBridge,requestFileDialog};
