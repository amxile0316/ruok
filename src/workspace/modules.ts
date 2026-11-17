// Modified by the RUOK fork on 2026-11-17: rebrand and upstream/Pro cleanup.
/** Eight workspace modules in three groups. The home page and the module dock read this one list, in this order. */
export type WorkspaceModuleGroup = 'prepare' | 'make' | 'review'
export type WorkspaceModuleOnly = 'koubo' | 'general'
export type WorkspaceModuleId = 'topics' | 'library' | 'reader' | 'screen' | 'studio' | 'motion' | 'styles' | 'analytics'
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
  { id: 'screen', path: '/screen-motion', name: '录屏运镜工作台', shortName: '录屏运镜', description: '编辑录屏、安排镜头，制作清晰的操作演示。', brief: '剪录屏，排镜头', group: 'prepare' },
  { id: 'studio', path: '/studio', name: '剪辑台', shortName: '剪辑台', description: '通用剪辑工程都在这里。', brief: '通用剪辑和全部工程', group: 'make' },
  { id: 'styles', path: '/styles', name: '风格库', shortName: '风格库', description: '预览和挑选通用剪辑的视频风格。', brief: '56 种视频风格', group: 'make', only: 'general' },
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
