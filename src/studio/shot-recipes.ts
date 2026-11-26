// Added by the RUOK fork on 2026-11-21: 剪辑台的镜头配方语料，蒸馏自 video-shotcraft（Apache-2.0）。
// 2026-11-26 增补：两条做法蒸馏自 cinematic-skill（MIT）。
/**
 * 剪辑台的 Agent 只吃文字，所以这里把上游的镜头配方卡压成一屏能读完的条目：
 * 一句话、什么时候用、做法要点、已知坑。界面只做展示和复制，不参与渲染。
 */

export type ShotRecipe = {
  readonly id: string
  readonly name: string
  /** 这张配方一句话在做什么。 */
  readonly oneLine: string
  /** 什么段落该用它。 */
  readonly when: string
  /** 做法要点，按时间顺序。 */
  readonly beats: readonly string[]
  /** 上游明确记下的坑。 */
  readonly pitfalls: readonly string[]
  /** 上游文件或章节路径，方便回查原卡。 */
  readonly source: string
  /** 上游仓库，缺省为 video-shotcraft。 */
  readonly repo?: string
  /** 上游许可证，缺省为 Apache-2.0。 */
  readonly license?: string
}

export const SHOT_RECIPE_ATTRIBUTION =
  '配方蒸馏自 video-shotcraft（Apache-2.0，https://github.com/Vincentwei1021/video-shotcraft）与 cinematic-skill（MIT，https://github.com/Moh4696/cinematic-skill）'

export const SHOT_RECIPES: readonly ShotRecipe[] = [
  {
    id: 'crash-zoom-punch',
    name: '急推点名',
    oneLine: '全景一拍急推到目标特写（6 帧），落位可选过冲回弹（弹性）或撞停震屏（重量）。',
    when: '功能段「点名」镜头：把观众视线一拍按到某个按钮、卡片或模块上，强调级用撞停。',
    beats: [
      '急推 6 帧、ease-in（4–8 帧），目标 zoom 2.4–2.8，终点让目标占画面 60–75%。',
      '急推前 6–8 帧先回拉 3–4%，先退后冲；全景 hold 段给 2–3% 极缓 creep。',
      '回弹款：过冲后 5 帧回收 zoom 的 3–6%；撞停款：到位帧起震屏 14px·e^(−t/1.8)，6 帧收干。',
      '前 hold ≥30 帧建立全景，后 hold ≥45 帧读特写；运动模糊只包急推段。',
    ],
    pitfalls: [
      '终点要用高分辨率素材或高清纹理，低倍截图急推后糊字。',
      '回弹和震屏两款别混用，混用读作穿帮。',
      '一条片子里急推不超过 2 次，多了就不叫强调。',
    ],
    source: 'references/shots/camera/crash-zoom-punch.md',
  },
  {
    id: 'scanline-annotate-focus',
    name: '扫描线标注',
    oneLine: '一条匀速扫描线自上而下掠过页面，越过哪块的下缘，哪块就被四角取景框收拢并打出机器标签。',
    when: '「AI 正在读你的页面」的分析镜头、设计规范的拆解介绍、产品能力的自我说明段。',
    beats: [
      '整段约 5 秒（150 帧）；扫描线 74 帧严格匀速、零缓动，从窗内上方扫到下方。',
      '触发帧由目标框下缘反算，按下缘排序，最小间隔 4 帧，先扫到再弹框。',
      '取景框四角从外扩 76px 处弹簧收拢（damping 15），跟随期臂长 40→26px。',
      '标签滞后 5 帧出现，约 2.2 字/帧逐字打出；顶部状态行按已触发数实时计数。',
      '品牌色只在页面内容里，机器色只给扫描线、角标、标签和状态行。',
    ],
    pitfalls: [
      '换页面后目标框要重量，框是手量的、留边 12–16px，不是自动取元素。',
      '亮底页面上要用深而饱和的机器色，浅色辉光线几乎看不见。',
      '标签要按字数估算宽度，词变长先查会不会压住相邻模块。',
    ],
    source: 'references/shots/effects/scanline-annotate-focus.md',
  },
  {
    id: 'before-after-slider-scrub',
    name: '前后对比拉杆',
    oneLine: '处理前后两版叠放，分割杆先猛甩到 70% 再慢扫回 40%，杆过处揭出新版。',
    when: 'AI 增强、优化、重构类功能的「用前 vs 用后」对比段，一镜讲清差别。',
    beats: [
      '静置 0–14 帧：杆停在 8%，12–14 帧先向左回拉到 6.5%。',
      '快甩 12 帧冲到 76%，再 12 帧回弹到 70%，停顿约 18 帧让观众看清新版。',
      '慢扫约 48 帧回到 40%，末段定格 ≥40 帧真静止；快甩与慢扫速度比约 5:1。',
      '新版用 clip-path 跟随杆的位置揭示，杆和揭示边界必须同帧对齐；手柄按速度差做 scaleX 微拉伸（峰值 1.18）。',
    ],
    pitfalls: [
      '两版必须同布局同机位，布局一变就读作两个页面，对比失效。',
      '处理前用真实的旧版或未优化态，别手搓一个故意丑的假 before。',
      '慢扫停在 40% 不归零，留一段新版在画面上当结论。',
    ],
    source: 'references/shots/data/before-after-slider-scrub.md',
  },
  {
    id: 'word-timed-emphasis',
    name: '落词对齐',
    oneLine: '画面上的盖章、划线、数字滚动、大字强调都绑到解说词里的某个词，按那个词真正被说出来的时刻触发，而不是按段落平均分配时间。',
    when: '有配音或口播的讲解段：强调必须跟着「说到那个词」出现，早一点像剧透，晚一点像脱节。',
    beats: [
      '先出配音（草稿音也行），拿到词级时间戳：每个词在音轨上的起止帧。',
      '场景里给元素写词级绑定，元素入场帧取该词起始帧前 1–2 帧做预备，强调峰值落在词结束前一帧。',
      '一句话只给一个主强调元素，同一句里并列强调会读成噪音。',
      '换配音或换音色后，整条时间轴按新时间戳重算，不靠手工拖拽补偿。',
    ],
    pitfalls: [
      '没有词级时间戳时不要用「字数 ÷ 语速」硬算，长句中后段会明显漂移。',
      '强调元素必须与台词同帧级对齐，容差按一两帧控制，否则观感是「贴错了」。',
      '词级对齐依赖 TTS 输出稳定，换引擎要整体重对齐一遍。',
    ],
    source: 'skills/cinematic-film（词级时间轴绑定）',
    repo: 'cinematic-skill',
    license: 'MIT',
  },
  {
    id: 'one-world-contact-strip',
    name: '一镜到底先查静帧',
    oneLine: '整段只在一个设计好的世界里用一个连续镜头推进，交付前先出逐镜头静帧条给人确认，确认后才渲染全片。',
    when: '三十秒以上的叙事或讲解段：既避免多机位拼接的碎感，也避免渲染完才发现取景问题。',
    beats: [
      '先定一个世界：背景、材质、色调、光照一次定死，全片不换场景，只让镜头在世界内移动。',
      '镜头落点按台词排：一句一个落点，句间只做连续位移，不切镜。',
      '交付前渲染每个镜头位移的首、中、尾静帧，拼成静帧联系人表，逐条查构图、遮挡和文字压边。',
      '人确认静帧后才渲染全片；改文案时只重算受影响的段落。',
    ],
    pitfalls: [
      '一镜到底最怕镜头路径穿过不可读区域，位移要沿信息带走，别为了动而动。',
      '静帧确认不能代替成片检查，转场和音频起落仍要完整看听一遍。',
      '单世界不等于单调，靠远中近景别变化制造节奏。',
    ],
    source: 'skills/cinematic-film（beat 表与 draft 确认闸门）',
    repo: 'cinematic-skill',
    license: 'MIT',
  },
]

/** 塞进 Agent 对话的那段文字：短、按顺序、可以直接执行。 */
export function shotRecipeBrief(recipe: ShotRecipe) {
  return [
    `镜头配方：${recipe.name}（${recipe.id}）`,
    `一句话：${recipe.oneLine}`,
    `适用：${recipe.when}`,
    '做法：',
    ...recipe.beats.map(line => `- ${line}`),
    '注意：',
    ...recipe.pitfalls.map(line => `- ${line}`),
    `出处：${recipe.source}（${recipe.repo ?? 'video-shotcraft'}，${recipe.license ?? 'Apache-2.0'}）`,
  ].join('\n')
}
