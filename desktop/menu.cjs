// Modified by the RUOK fork on 2026-11-17: rebrand and upstream/Pro cleanup.
function applicationMenu({platform,app,recordingMenu}){
 const about={label:'关于 RUOK',click:()=>app.showAboutPanel()};
 if(platform==='darwin')return [{label:'RUOK',submenu:[about,{type:'separator'},{role:'quit'}]},{role:'editMenu'},{role:'viewMenu'},{role:'windowMenu'}];
 return [...(recordingMenu?[{label:'录制',submenu:recordingMenu}]:[]),
  {label:'编辑',role:'editMenu'},{label:'查看',role:'viewMenu'},{label:'窗口',role:'windowMenu'},
  {label:'帮助',submenu:[about,{type:'separator'},{label:'退出',role:'quit'}]}];
}
module.exports={applicationMenu};
