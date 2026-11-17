// Modified by the RUOK fork on 2026-11-17: rebrand and upstream/Pro cleanup.
/** Eight workspace modules in three groups. The home page and the module dock read this one list, in this order. */
export type WorkspaceModuleGroup = 'prepare' | 'make' | 'review'
export type WorkspaceModuleOnly = 'koubo' | 'general'
export type WorkspaceModuleId = 'topics' | 'library' | 'reader' | 'screen' | 'studio' | 'motion' | 'styles' | 'analytics' | 'talk' | 'publish'
export type WorkspaceModule = {
  readonly id: WorkspaceModuleId
  readonly path: string
  readonly name: string
  readonly shortName: string
  readonly description: string
  /** One short line for the home module card. */
  readonly brief: string
  readonly pro?: boolean
  readonly group: WorkspaceModuleGroup
  /** Set only when the module serves one kind of editing. */
  readonly only?: WorkspaceModuleOnly
}

/** The general-editing entrance: /general starts a new project (① 选风格 → ② 放素材); /general/projects/:id is its work page. */
export const GENERAL_EDIT_PATH = '/general'

export const MODULE_GROUPS: readonly { readonly id: WorkspaceModuleGroup; readonly label: string }[] = [
  { id: 'prepare', label: '准备' },
  { id: 'make', label: '制作' },
  { id: 'review', label: '发布与复盘' },
]

export const MODULE_ONLY_LABELS: Readonly<Record<WorkspaceModuleOnly, string>> = { koubo: '口播专用', general: '通用专用' }

// Modified by the RUOK fork on 2026-11-17: removed upstream Pro-only modules and their /pro entry points.
export const WORKSPACE_MODULES: readonly WorkspaceModule[] = [
  { id: 'topics', path: '/topics', name: '智能选题', shortName: '智能选题', description: '给一个关键词，按平台和角度生成标题、开场钩子与结构大纲。', brief: '一个关键词出一批选题', group: 'prepare' },
  { id: 'reader', path: '/reader', name: '链接读取', shortName: '链接读取', description: '粘贴一个公开网页链接，抓取正文，排成干净的阅读视图。', brief: '粘贴链接读正文', group: 'prepare' },
  { id: 'screen', path: '/screen-motion', name: '录屏运镜工作台', shortName: '录屏运镜', description: '编辑录屏、安排镜头，制作清晰的操作演示。', brief: '剪录屏，排镜头', group: 'prepare' },
  { id: 'studio', path: '/studio', name: '剪辑台', shortName: '剪辑台', description: '通用剪辑工程都在这里。', brief: '通用剪辑和全部工程', group: 'make' },
  { id: 'styles', path: '/styles', name: '风格库', shortName: '风格库', description: '预览和挑选通用剪辑的视频风格。', brief: '57 种视频风格', group: 'make', only: 'general' },
  { id: 'talk', path: '/talk', name: '口播剪辑', shortName: '口播剪辑', description: '按逐字稿切口播：删静音、删口误，导出字幕与剪切清单。', brief: '文字驱动剪口播', group: 'make', only: 'koubo' },
  { id: 'motion', path: '/motion', name: '动效库', shortName: '动效库', description: '预览一组纯 CSS 动效，复制 keyframes 与类名直接用。', brief: '12 个可复制的 CSS 动效', group: 'make' },
  { id: 'publish', path: '/publish', name: '文案发布', shortName: '文案发布', description: '用本机智能体按平台风格生成标题、正文与话题。', brief: '标题、正文、话题', group: 'review' },
  { id: 'analytics', path: '/analytics', name: '运营分析', shortName: '运营分析', description: '录入作品数据，做单条面板、跨作品对比与内容归因。', brief: '记录作品，找规律', group: 'review' },
]

export function workspaceModuleById(id: WorkspaceModuleId) {
  return WORKSPACE_MODULES.find(m => m.id === id)
}

const within = (pathname: string, path: string) => pathname === path || pathname.startsWith(`${path}/`)

export function workspaceModule(pathname: string) {
  // General editing is the second entrance of 剪辑台.
  if (within(pathname, GENERAL_EDIT_PATH)) return workspaceModuleById('studio')
  return WORKSPACE_MODULES.find(m => within(pathname, m.path))
}

/** Groups in display order, each with its modules in list order. */
export function groupedModules() {
  return MODULE_GROUPS
    .map(group => ({ ...group, modules: WORKSPACE_MODULES.filter(m => m.group === group.id) }))
    .filter(group => group.modules.length > 0)
}

/** Arrow-key focus across all module capsules, wrapping at both ends. `current` is -1 when no capsule has focus. */
export function nextModuleIndex(current: number, direction: 'previous' | 'next', total: number) {
  if (total <= 0) return -1
  if (direction === 'previous') return current <= 0 || current >= total ? total - 1 : current - 1
  return current < 0 || current >= total - 1 ? 0 : current + 1
}
