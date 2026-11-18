/** Three themes since 2026-11-18 (S先生): 深色 (original, 墨绿), 浅色 (warm, 石灰灰) and 烟褐 (umbra,
 *  the warm mid-tone between them). 暮石/dusk was retired for its slate-green cast; a saved dusk opens as
 *  烟褐. 磨砂 was retired earlier and opens as 暖雾, the original light theme. */
export type UiTheme = 'original' | 'warm' | 'umbra';
const key = 'linkreader-ui-theme';
export function readUiTheme(): UiTheme {
  try {
    const value = localStorage.getItem(key);
    if (value === 'original' || value === 'warm' || value === 'umbra') return value;
    if (value === 'dusk') return 'umbra';
    if (value === 'frost') return 'warm';
    return 'original';
  } catch { return 'original'; }
}
export function applyUiTheme(theme: UiTheme) {
  document.documentElement.dataset.uiTheme = theme;
  try { localStorage.setItem(key, theme); } catch { /* Preferences may be unavailable. */ }
  window.dispatchEvent(new Event('linkreader-ui-theme'));
}
