import test from 'node:test';import assert from 'node:assert/strict';
import fs from 'node:fs';import {fileURLToPath} from 'node:url';
// The fork removed the upstream Pro upgrade flow (Upgrade.tsx / ProStyleDialog.tsx / modules.ts).
// The previous UI test rendered those components, so it could not resolve them any more.
// This test guards the removal itself: no dangling imports, no /pro routes, no upgrade triggers.
const root=fileURLToPath(new URL('../',import.meta.url));
const exists=(rel:string)=>fs.existsSync(new URL('../'+rel,import.meta.url));
const read=(rel:string)=>fs.readFileSync(new URL('../'+rel,import.meta.url),'utf8');
const dangling=/ProStyleDialog|UpgradeDialog|UpgradeButton|openUpgrade|EntranceUpgrade|from ['"]\.{1,2}\/(?:standard\/)?Upgrade['"]|from ['"]\.{1,2}\/(?:standard\/)?ProStyleDialog['"]/;
test('RUOK 分支已移除 Pro 升级入口与风格购买弹窗，代码中不再引用已删除模块',()=>{
  for(const rel of ['src/standard/Upgrade.tsx','src/standard/ProStyleDialog.tsx','src/standard/modules.ts'])assert.equal(exists(rel),false,rel+' 应在分支中删除');
  for(const rel of ['src/App.tsx','src/desktop/DesktopSession.tsx','src/workspace/style-library/StyleLibrary.tsx','src/workspace/style-library/style-library.ts','src/general/GeneralEntrance.tsx','src/general/entrance-edition.tsx','src/pages/WorkspaceHome.tsx','src/workspace/QuickEdit.tsx','src/workspace/modules.ts']){
    const text=read(rel);
    assert.doesNotMatch(text,dangling,rel+' 仍在引用已删除的 Pro 组件');
    assert.doesNotMatch(text,/['"]\/pro\//,rel+' 仍保留 /pro 路由');
  }
  assert.match(read('src/workspace/style-library/StyleLibrary.tsx'),/未包含/,'不可用风格应标记为未包含');
});
