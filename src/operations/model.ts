import type {Work} from '../analytics/model.ts'
import {createId} from '../lib/id.ts'
import {PUBLISH_PLATFORMS, type PublishPlatform} from '../workspace/handoff.ts'

export const DRAFT_STATUSES = ['draft', 'in_review', 'approved', 'scheduled', 'published'] as const
export type DraftStatus = (typeof DRAFT_STATUSES)[number]

/** 一条复盘记忆：写下的结论、写入时间，以及（可选）来源作品。 */
export type ProfileMemoryEntry = {
  text: string
  /** 写入时间；旧版纯文本记忆升级上来时为空字符串，表示早期记录。 */
  createdAt: string
  workId?: string
  workTitle?: string
}

/** 只保存账号画像，不接受 Cookie、密码、Token 等登录凭据。 */
export type AccountProfile = {
  id: string
  platform: PublishPlatform
  displayName: string
  positioning: string
  targetAudience: string
  languageStyle: string
  contentPillars: string[]
  compliancePreferences: string[]
  /** 复盘沉淀的可复用认知（人在回路写入，去重追加）。可选，旧画像缺省为空。 */
  memory?: ProfileMemoryEntry[]
}

/** 成片或封面的本地引用：只记路径与元数据，不复制文件、不上传、不读内容。 */
export type DraftAsset = {
  path: string
  /** 文件名，列表和复制时直接用。 */
  name: string
  /** 字节数。 */
  bytes: number
  /** 视频时长（秒）；没有探测到时省略。 */
  durationSec?: number
  /** 封面建议比例，只用于提示。 */
  ratio?: '3:4' | '9:16' | '16:9'
  addedAt: string
}
export type DraftAssetKind = 'video' | 'cover'
const ASSET_RATIOS = ['3:4', '9:16', '16:9'] as const

export type ContentDraft = {
  id: string
  source: string
  platform: PublishPlatform
  accountId?: string
  topic?: string
  tone?: string
  title: string
  body: string
  tags: string[]
  hook: string
  /** 发布包的素材引用：成片与封面。 */
  video?: DraftAsset
  cover?: DraftAsset
  status: DraftStatus
  scheduledAt?: string
  publishedAt?: string
  externalUrl?: string
  workId?: string
  createdAt: string
  updatedAt: string
}

export type OperationsState = {
  version: 1
  profiles: AccountProfile[]
  drafts: ContentDraft[]
  works: Work[]
}

export type AccountProfileInput = Omit<AccountProfile, 'id'>
export type ContentDraftInput = Pick<ContentDraft, 'source' | 'platform' | 'title' | 'body' | 'tags' | 'hook'> &
  Partial<Pick<ContentDraft, 'accountId' | 'topic' | 'tone' | 'video' | 'cover'>>
export type ContentDraftPatch = Partial<Pick<ContentDraft,
  'source' | 'accountId' | 'topic' | 'tone' | 'title' | 'body' | 'tags' | 'hook'
>>
export type PublicationConfirmation = {
  confirmed: boolean
  publishedAt: string
  externalUrl?: string
}

type EntityOptions = {id?: string; now?: string}
type ChangeOptions = {now?: string}
type TransitionOptions = ChangeOptions & {scheduledAt?: string}
type PublicationOptions = ChangeOptions & {workId?: string}

const now = (options: ChangeOptions) => options.now ?? new Date().toISOString()

function validDate(value: string | undefined, label: string) {
  if (!value?.trim() || !Number.isFinite(Date.parse(value))) throw new Error(`${label}无效`)
  return value.trim()
}

function validExternalUrl(value: string | undefined) {
  if (value === undefined) return undefined
  try {
    const url = new URL(value)
    if (url.protocol !== 'http:' && url.protocol !== 'https:') throw new Error('协议无效')
  } catch {
    throw new Error('外部链接必须是有效的 http(s) URL')
  }
  return value.trim()
}

function findDraft(state: OperationsState, draftId: string) {
  const draft = state.drafts.find(item => item.id === draftId)
  if (!draft) throw new Error('找不到草稿')
  return draft
}

function replaceDraft(state: OperationsState, draft: ContentDraft): OperationsState {
  return {...state, drafts: state.drafts.map(item => item.id === draft.id ? draft : item)}
}

function assertEditable(draft: ContentDraft) {
  if (draft.status === 'published') throw new Error('已发布内容不可再编辑或迁移状态')
}

function sameValue(left: string | string[] | undefined, right: string | string[] | undefined) {
  if (Array.isArray(left) || Array.isArray(right)) {
    return Array.isArray(left) && Array.isArray(right) && left.length === right.length && left.every((item, index) => item === right[index])
  }
  return Object.is(left, right)
}

export function createOperationsState(): OperationsState {
  return {version: 1, profiles: [], drafts: [], works: []}
}

export function createAccountProfile(input: AccountProfileInput, options: EntityOptions = {}): AccountProfile {
  return {
    id: options.id ?? createId(),
    platform: input.platform,
    displayName: input.displayName,
    positioning: input.positioning,
    targetAudience: input.targetAudience,
    languageStyle: input.languageStyle,
    contentPillars: [...input.contentPillars],
    compliancePreferences: [...input.compliancePreferences],
    memory: input.memory ? input.memory.map(entry => ({...entry})) : [],
  }
}

export function upsertAccountProfile(state: OperationsState, profile: AccountProfile): OperationsState {
  const clean = createAccountProfile(profile, {id: profile.id})
  const exists = state.profiles.some(item => item.id === profile.id)
  return {
    ...state,
    profiles: exists ? state.profiles.map(item => item.id === profile.id ? clean : item) : [...state.profiles, clean],
  }
}

export function removeAccountProfile(state: OperationsState, profileId: string): OperationsState {
  return {...state, profiles: state.profiles.filter(item => item.id !== profileId)}
}

export type ProfileMemoryInput = string | {text: string; workId?: string; workTitle?: string}

/** 向画像追加一条复盘记忆：空文本忽略，完全相同的文本不重复写入（人在回路，防流水账）。 */
export function appendProfileMemory(state: OperationsState, profileId: string, entry: ProfileMemoryInput, now: string = new Date().toISOString()): OperationsState {
  const input = typeof entry === 'string' ? {text: entry} : entry
  const text = input.text.trim()
  if (!text) return state
  const profile = state.profiles.find(item => item.id === profileId)
  if (!profile) throw new Error('找不到账号画像')
  const memory = profile.memory ?? []
  if (memory.some(item => item.text.trim() === text)) return state
  const next: ProfileMemoryEntry = {
    text,
    createdAt: now,
    ...(input.workId ? {workId: input.workId} : {}),
    ...(input.workTitle ? {workTitle: input.workTitle} : {}),
  }
  return {
    ...state,
    profiles: state.profiles.map(item => (item.id === profileId ? {...item, memory: [...memory, next]} : item)),
  }
}

/** 删除画像记忆的某一条；越界索引原样返回。 */
export function removeProfileMemory(state: OperationsState, profileId: string, index: number): OperationsState {
  const profile = state.profiles.find(item => item.id === profileId)
  if (!profile) throw new Error('找不到账号画像')
  const memory = profile.memory ?? []
  if (index < 0 || index >= memory.length) return state
  return {
    ...state,
    profiles: state.profiles.map(item => (item.id === profileId ? {...item, memory: memory.filter((_, i) => i !== index)} : item)),
  }
}

/** 素材引用只做格式校验：不访问磁盘，路径存在性由界面在打开时检查。 */
function normalizeAsset(asset: DraftAsset): DraftAsset {
  const filePath = typeof asset.path === 'string' ? asset.path.trim() : ''
  if (!filePath) throw new Error('素材路径无效')
  const name = typeof asset.name === 'string' ? asset.name.trim() : ''
  if (!name) throw new Error('素材文件名无效')
  if (!Number.isFinite(asset.bytes) || asset.bytes < 0) throw new Error('素材大小无效')
  if (asset.durationSec !== undefined && (!Number.isFinite(asset.durationSec) || asset.durationSec < 0)) throw new Error('素材时长无效')
  if (asset.ratio !== undefined && !ASSET_RATIOS.includes(asset.ratio)) throw new Error('封面比例无效')
  return {
    path: filePath,
    name,
    bytes: asset.bytes,
    ...(asset.durationSec !== undefined ? {durationSec: asset.durationSec} : {}),
    ...(asset.ratio !== undefined ? {ratio: asset.ratio} : {}),
    addedAt: validDate(asset.addedAt, '素材添加时间'),
  }
}

export function createContentDraft(input: ContentDraftInput, options: EntityOptions = {}): ContentDraft {
  const timestamp = now(options)
  return {
    id: options.id ?? createId(),
    source: input.source,
    platform: input.platform,
    ...(input.accountId !== undefined ? {accountId: input.accountId} : {}),
    ...(input.topic !== undefined ? {topic: input.topic} : {}),
    ...(input.tone !== undefined ? {tone: input.tone} : {}),
    title: input.title,
    body: input.body,
    tags: [...input.tags],
    hook: input.hook,
    ...(input.video !== undefined ? {video: normalizeAsset(input.video)} : {}),
    ...(input.cover !== undefined ? {cover: normalizeAsset(input.cover)} : {}),
    status: 'draft',
    createdAt: timestamp,
    updatedAt: timestamp,
  }
}

export function addContentDraft(state: OperationsState, draft: ContentDraft): OperationsState {
  if (state.drafts.some(item => item.id === draft.id)) throw new Error('草稿 ID 已存在')
  return {...state, drafts: [...state.drafts, {...draft, tags: [...draft.tags]}]}
}

/** 审核后的内容修改会回到待审核，并清除旧排期；普通草稿仍是草稿。 */
export function updateContentDraft(state: OperationsState, draftId: string, patch: ContentDraftPatch, options: ChangeOptions = {}): OperationsState {
  const draft = findDraft(state, draftId)
  assertEditable(draft)
  const contentKeys = ['title', 'body', 'tags', 'hook'] as const
  const contentChanged = contentKeys.some(key => key in patch && !sameValue(draft[key], patch[key]))
  const next: ContentDraft = {
    ...draft,
    ...patch,
    tags: patch.tags ? [...patch.tags] : [...draft.tags],
    updatedAt: now(options),
  }
  for (const key of ['accountId', 'topic', 'tone'] as const) if (next[key] === undefined) delete next[key]
  if (contentChanged && (draft.status === 'approved' || draft.status === 'scheduled')) {
    next.status = 'in_review'
    delete next.scheduledAt
  }
  return replaceDraft(state, next)
}

/** 仅处理非发布跃迁；发布必须走 confirmPublication 进行人工确认。 */
export function transitionContentDraft(state: OperationsState, draftId: string, target: DraftStatus, options: TransitionOptions = {}): OperationsState {
  const draft = findDraft(state, draftId)
  assertEditable(draft)
  if (target === 'published') throw new Error('发布必须显式人工确认')
  const allowed =
    (draft.status === 'draft' && target === 'in_review') ||
    (draft.status === 'in_review' && target === 'approved') ||
    (draft.status === 'approved' && target === 'scheduled') ||
    (draft.status === 'scheduled' && target === 'approved')
  if (!allowed) throw new Error(`不允许从 ${draft.status} 迁移到 ${target}`)
  const next: ContentDraft = {...draft, status: target, updatedAt: now(options)}
  if (target === 'scheduled') next.scheduledAt = validDate(options.scheduledAt, '排期时间')
  if (draft.status === 'scheduled' && target === 'approved') delete next.scheduledAt
  return replaceDraft(state, next)
}

export function removeContentDraft(state: OperationsState, draftId: string): OperationsState {
  const draft = findDraft(state, draftId)
  assertEditable(draft)
  return {...state, drafts: state.drafts.filter(item => item.id !== draftId)}
}

/** 挂上成片或封面。素材变化不算文案改动，因此不重置审核状态。 */
export function attachDraftAsset(state: OperationsState, draftId: string, kind: DraftAssetKind, asset: DraftAsset, options: ChangeOptions = {}): OperationsState {
  const draft = findDraft(state, draftId)
  assertEditable(draft)
  return replaceDraft(state, {...draft, [kind]: normalizeAsset(asset), updatedAt: now(options)})
}

export function removeDraftAsset(state: OperationsState, draftId: string, kind: DraftAssetKind, options: ChangeOptions = {}): OperationsState {
  const draft = findDraft(state, draftId)
  assertEditable(draft)
  if (draft[kind] === undefined) return state
  const next: ContentDraft = {...draft, updatedAt: now(options)}
  delete next[kind]
  return replaceDraft(state, next)
}

/** 人工确认后原子地发布草稿并创建零指标 Work；重复确认只返回原 Work。 */
export function confirmPublication(state: OperationsState, draftId: string, confirmation: PublicationConfirmation, options: PublicationOptions = {}) {
  const draft = findDraft(state, draftId)
  if (confirmation.confirmed !== true) throw new Error('必须显式 confirmed=true 才能确认发布')
  const publishedAt = validDate(confirmation.publishedAt, '实际发布时间')
  const externalUrl = validExternalUrl(confirmation.externalUrl)

  if (draft.status === 'published') {
    const work = state.works.find(item => item.id === draft.workId && item.draftId === draft.id)
    if (!work) throw new Error('已发布草稿缺少关联作品')
    return {state, work}
  }
  if (draft.status !== 'approved' && draft.status !== 'scheduled') throw new Error('只有 approved/scheduled 草稿可确认发布')

  const workId = options.workId ?? createId()
  if (state.works.some(item => item.id === workId)) throw new Error('作品 ID 已存在')
  const publishedDraft: ContentDraft = {
    ...draft,
    status: 'published',
    publishedAt,
    ...(externalUrl !== undefined ? {externalUrl} : {}),
    workId,
    updatedAt: now(options),
  }
  const work: Work = {
    id: workId,
    draftId: draft.id,
    ...(draft.accountId !== undefined ? {accountId: draft.accountId} : {}),
    ...(externalUrl !== undefined ? {externalUrl} : {}),
    publicationSource: 'manual-confirmed',
    title: draft.title,
    platform: PUBLISH_PLATFORMS.find(item => item.id === draft.platform)?.name ?? draft.platform,
    publishedAt,
    durationSec: draft.video?.durationSec ?? 0,
    style: '',
    hook: draft.hook,
    topic: draft.topic ?? '',
    views: 0,
    likes: 0,
    comments: 0,
    shares: 0,
    saves: 0,
    follows: 0,
  }
  const next = replaceDraft(state, publishedDraft)
  return {state: {...next, works: [...state.works, work]}, work}
}
