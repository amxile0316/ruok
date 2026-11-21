// Modified by the RUOK fork on 2026-11-17: rebrand and upstream/Pro cleanup.
const windowsFiles=process.platform==='win32'?['native/windows/wgc-capture.exe','native/windows/build.json','native/windows/LICENSE']:[];
module.exports = {
 appId:'top.ruok.app',productName:'RUOK',asar:false,
 directories:{output:'release'},electronDist:'node_modules/electron/dist',
 files:['release-source.json','desktop/**','dist/**','server/**','src/**','shared/**','!vendor/**','vendor/adu/**',...windowsFiles,'public/**','upgrade.json','vite.config.ts','package.json','LICENSE','NOTICE','TRADEMARK.md','THIRD-PARTY-LICENSES.json','licenses/**','!**/*.test.*','!server/test-support/**','!desktop/build-app.mjs','!desktop/builder.config.cjs','!desktop/brand/**'],
 extraResources:[{from:'node_modules/electron/dist/LICENSE',to:'electron-LICENSE'},{from:'node_modules/electron/dist/LICENSES.chromium.html',to:'LICENSES.chromium.html'}],
 npmRebuild:false,
 win:{target:['dir'],icon:'public/ruok.ico',signAndEditExecutable:true,signExecutable:false},
 // build-app.mjs keeps the upstream ad-hoc signing/verification finalizer.
 mac:{target:['dir'],identity:null,icon:'public/ruok.icns',category:'public.app-category.video',extendInfo:{CFBundleDisplayName:'RUOK',CFBundleName:'RUOK',NSScreenCaptureUsageDescription:'录制你选择的屏幕或窗口，制作演示视频。'}},
};
