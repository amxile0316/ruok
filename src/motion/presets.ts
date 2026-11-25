// Added by the RUOK fork on 2026-11-17: 动效库的预设清单（纯 CSS，复制即可用）。
/** Every preset is one @keyframes rule plus one class. Only transform / opacity / filter are animated. */
export type MotionGroup = '入场' | '强调' | '循环'

export type MotionPreset = {
  readonly id: string
  readonly name: string
  readonly group: MotionGroup
  /** What the motion does, in one line. */
  readonly description: string
  readonly duration: number
  readonly easing: string
  readonly infinite?: boolean
  readonly keyframes: string
}

const EASE = 'cubic-bezier(.2,.8,.2,1)'

export const MOTION_PRESETS: readonly MotionPreset[] = [
  {
    id: 'fade-up', name: '上浮淡入', group: '入场', description: '向上 16px 浮起并淡入，适合正文卡片。', duration: 620, easing: EASE,
    keyframes: '@keyframes ruok-fade-up{from{opacity:0;transform:translate3d(0,16px,0)}to{opacity:1;transform:translate3d(0,0,0)}}',
  },
  {
    id: 'slide-left', name: '左侧滑入', group: '入场', description: '从左侧 28px 滑入，用于模块或列表条目。', duration: 560, easing: EASE,
    keyframes: '@keyframes ruok-slide-left{from{opacity:0;transform:translate3d(-28px,0,0)}to{opacity:1;transform:translate3d(0,0,0)}}',
  },
  {
    id: 'scale-in', name: '缩放进入', group: '入场', description: '从 0.92 放大到原尺寸，用于弹窗或封面。', duration: 520, easing: EASE,
    keyframes: '@keyframes ruok-scale-in{from{opacity:0;transform:scale(.92)}to{opacity:1;transform:scale(1)}}',
  },
  {
    id: 'blur-in', name: '虚化聚焦', group: '入场', description: '由模糊到清晰，用于强调标题。', duration: 720, easing: EASE,
    keyframes: '@keyframes ruok-blur-in{from{opacity:0;filter:blur(10px)}to{opacity:1;filter:blur(0)}}',
  },
  {
    id: 'bounce-in', name: '弹性入场', group: '入场', description: '带一次回弹的放大淡入，用于成功提示与浮层。', duration: 760, easing: 'cubic-bezier(.22,1.2,.36,1)',
    keyframes: '@keyframes ruok-bounce-in{0%{opacity:0;transform:scale(.82)}55%{opacity:1;transform:scale(1.04)}78%{transform:scale(.985)}100%{opacity:1;transform:scale(1)}}',
  },
  {
    id: 'flip-in-y', name: '纵向翻入', group: '入场', description: '绕横轴翻开，用于卡片首次出现在视口。', duration: 680, easing: EASE,
    keyframes: '@keyframes ruok-flip-in-y{from{opacity:0;transform:perspective(720px) rotateX(-52deg)}to{opacity:1;transform:perspective(720px) rotateX(0)}}',
  },
  {
    id: 'wipe', name: '横向擦除', group: '入场', description: '从左往右揭开，用于图文段落。', duration: 700, easing: EASE,
    keyframes: '@keyframes ruok-wipe{from{clip-path:inset(0 100% 0 0)}to{clip-path:inset(0 0 0 0)}}',
  },
  {
    id: 'pulse', name: '呼吸放大', group: '强调', description: '轻微放大再回落，用于按钮或标记。', duration: 1200, easing: 'ease-in-out', infinite: true,
    keyframes: '@keyframes ruok-pulse{0%,100%{transform:scale(1)}50%{transform:scale(1.05)}}',
  },
  {
    id: 'shake', name: '轻震提醒', group: '强调', description: '左右小幅抖动，用于错误或需要确认的提示。', duration: 460, easing: 'ease-in-out',
    keyframes: '@keyframes ruok-shake{0%,100%{transform:translate3d(0,0,0)}20%{transform:translate3d(-5px,0,0)}40%{transform:translate3d(5px,0,0)}60%{transform:translate3d(-3px,0,0)}80%{transform:translate3d(3px,0,0)}}',
  },
  {
    id: 'heartbeat', name: '双拍心跳', group: '强调', description: '两次轻微放大后停顿，用于待办或待补指标角标。', duration: 1400, easing: 'ease-in-out', infinite: true,
    keyframes: '@keyframes ruok-heartbeat{0%,28%,70%,100%{transform:scale(1)}14%,42%{transform:scale(1.06)}}',
  },
  {
    id: 'press', name: '按压回弹', group: '强调', description: '按下时缩小，松开回到原尺寸。', duration: 420, easing: EASE,
    keyframes: '@keyframes ruok-press{0%{transform:scale(1)}40%{transform:scale(.94)}100%{transform:scale(1)}}',
  },
  {
    id: 'glow', name: '金光呼吸', group: '强调', description: '金色外发光缓慢明暗，用于主要按钮。', duration: 1800, easing: 'ease-in-out', infinite: true,
    keyframes: '@keyframes ruok-glow{0%,100%{box-shadow:0 0 0 0 rgba(216,160,94,0)}50%{box-shadow:0 0 26px 2px rgba(216,160,94,.42)}}',
  },
  {
    id: 'float', name: '悬浮漂移', group: '循环', description: '上下 6px 缓慢浮动，用于装饰元素。', duration: 2600, easing: 'ease-in-out', infinite: true,
    keyframes: '@keyframes ruok-float{0%,100%{transform:translate3d(0,0,0)}50%{transform:translate3d(0,-6px,0)}}',
  },
  {
    id: 'marquee', name: '横向巡游', group: '循环', description: '整块匀速横向移动，用于跑马灯或标签条。', duration: 2600, easing: 'linear', infinite: true,
    keyframes: '@keyframes ruok-marquee{0%{transform:translate3d(-14px,0,0)}50%{transform:translate3d(14px,0,0)}100%{transform:translate3d(-14px,0,0)}}',
  },
  {
    id: 'orbit', name: '缓慢旋转', group: '循环', description: '匀速自转，用于加载指示或光圈。', duration: 5200, easing: 'linear', infinite: true,
    keyframes: '@keyframes ruok-orbit{from{transform:rotate(0)}to{transform:rotate(360deg)}}',
  },
]

export const MOTION_GROUPS: readonly MotionGroup[] = ['入场', '强调', '循环']

/** `.mv-<id>` drives the preview; the copied snippet renames it to `.ruok-<id>` so it will not collide. */
export function previewRule(preset: MotionPreset) {
  return `.mv-${preset.id}{animation:ruok-${preset.id} ${preset.duration}ms ${preset.easing} ${preset.infinite ? 'infinite' : 'both'}}`
}

export function presetSnippet(preset: MotionPreset) {
  const iterations = preset.infinite ? 'infinite' : 'both'
  return `${preset.keyframes}\n.ruok-${preset.id}{animation:ruok-${preset.id} ${preset.duration}ms ${preset.easing} ${iterations}}`
}

export const motionStyleSheet = () => MOTION_PRESETS.map(preset => `${preset.keyframes}\n${previewRule(preset)}`).join('\n')
