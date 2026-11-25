import {z} from 'zod'
import type {Work} from '../analytics/model.ts'
import {PUBLISH_PLATFORMS, type PublishPlatform} from '../workspace/handoff.ts'
import {createOperationsState, DRAFT_STATUSES, type AccountProfile, type ContentDraft, type OperationsState} from './model.ts'

export const OPERATIONS_STORAGE_KEY = 'ruok.operations.v1'
export const LEGACY_WORKS_STORAGE_KEY = 'ruok.analytics.works.v1'

export interface OperationsStorage {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
}

export type OperationsStorageError = {
  code: 'invalid-json' | 'unsupported-version' | 'invalid-state' | 'storage-read' | 'storage-write'
  message: string
}
export type StorageFailure = {ok: false; error: OperationsStorageError}
export type ParseOperationsResult = {ok: true; state: OperationsState} | StorageFailure
export type LoadOperationsResult = {ok: true; state: OperationsState; migrated: boolean} | StorageFailure
export type SaveOperationsResult = {ok: true} | StorageFailure

const PlatformSchema = z.enum(PUBLISH_PLATFORMS.map(item => item.id) as [PublishPlatform, ...PublishPlatform[]])
const dateText = z.string().refine(value => Boolean(value.trim()) && Number.isFinite(Date.parse(value)), '无效时间')
const externalUrl = z.string().refine(value => {
  try {
    const url = new URL(value)
    return url.protocol === 'http:' || url.protocol === 'https:'
  } catch { return false }
}, '仅支持 http(s) URL')

const MemoryEntrySchema = z.object({
  text: z.string().min(1),
  createdAt: z.string(),
  workId: z.string().min(1).optional(),
  workTitle: z.string().optional(),
}).strict()

const AccountProfileSchema = z.object({
  id: z.string().min(1),
  platform: PlatformSchema,
  displayName: z.string(),
  positioning: z.string(),
  targetAudience: z.string(),
  languageStyle: z.string(),
  contentPillars: z.array(z.string()),
  compliancePreferences: z.array(z.string()),
  memory: z.array(MemoryEntrySchema).optional(),
}).strict() satisfies z.ZodType<AccountProfile>

const ContentDraftSchema = z.object({
  id: z.string().min(1),
  source: z.string(),
  platform: PlatformSchema,
  accountId: z.string().min(1).optional(),
  topic: z.string().optional(),
  tone: z.string().optional(),
  title: z.string(),
  body: z.string(),
  tags: z.array(z.string()),
  hook: z.string(),
  status: z.enum(DRAFT_STATUSES),
  scheduledAt: dateText.optional(),
  publishedAt: dateText.optional(),
  externalUrl: externalUrl.optional(),
  workId: z.string().min(1).optional(),
  createdAt: dateText,
  updatedAt: dateText,
}).strict() satisfies z.ZodType<ContentDraft>

const WorkSchema = z.object({
  id: z.string(),
  title: z.string(),
  platform: z.string(),
  publishedAt: z.string(),
  durationSec: z.number(),
  style: z.string(),
  hook: z.string(),
  topic: z.string(),
  views: z.number(),
  likes: z.number(),
  comments: z.number(),
  shares: z.number(),
  saves: z.number(),
  follows: z.number(),
  draftId: z.string().optional(),
  accountId: z.string().optional(),
  externalUrl: externalUrl.optional(),
  publicationSource: z.enum(['legacy', 'manual-confirmed']).optional(),
  metricsCapturedAt: z.string().optional(),
  metricsSource: z.enum(['manual', 'csv', 'api']).optional(),
}).strict() satisfies z.ZodType<Work>

export const OperationsStateSchema = z.object({
  version: z.literal(1),
  profiles: z.array(AccountProfileSchema),
  drafts: z.array(ContentDraftSchema),
  works: z.array(WorkSchema),
}).strict() satisfies z.ZodType<OperationsState>

const failure = (code: OperationsStorageError['code'], message: string): StorageFailure => ({ok: false, error: {code, message}})

function readJson(raw: string, label: string) {
  try {
    return {ok: true as const, value: JSON.parse(raw) as unknown}
  } catch {
    return {ok: false as const, error: failure('invalid-json', `${label}不是有效 JSON`).error}
  }
}

/**
 * 旧版画像记忆是纯文本数组，读盘时升级为结构化条目（createdAt 留空表示早期记录）。
 * 只在解析时于内存里转换，不改写存储里的原始数据。
 */
function upgradeLegacyMemory(value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return value
  const state = value as {profiles?: unknown}
  if (!Array.isArray(state.profiles)) return value
  let changed = false
  const profiles = state.profiles.map(profile => {
    if (!profile || typeof profile !== 'object' || Array.isArray(profile)) return profile
    const memory = (profile as {memory?: unknown}).memory
    if (!Array.isArray(memory) || !memory.some(item => typeof item === 'string')) return profile
    changed = true
    return {...profile, memory: memory.map(item => (typeof item === 'string' ? {text: item, createdAt: ''} : item))}
  })
  return changed ? {...state, profiles} : value
}

/** 纯解析入口，不访问浏览器或修改存储。 */
export function parseOperationsState(raw: string): ParseOperationsResult {
  const parsed = readJson(raw, '运营存储')
  if (!parsed.ok) return parsed
  const value = upgradeLegacyMemory(parsed.value)
  if (!value || typeof value !== 'object' || Array.isArray(value)) return failure('invalid-state', '运营存储必须是对象')
  const version = (value as {version?: unknown}).version
  if (version !== 1) {
    return version === undefined
      ? failure('invalid-state', '运营存储缺少 version: 1')
      : failure('unsupported-version', `不支持的运营存储版本：${String(version)}`)
  }
  const result = OperationsStateSchema.safeParse(value)
  return result.success ? {ok: true, state: result.data} : failure('invalid-state', '运营存储字段校验失败')
}

function parseLegacyWorks(raw: string): {ok: true; works: Work[]} | StorageFailure {
  const parsed = readJson(raw, '旧作品存储')
  if (!parsed.ok) return parsed
  const result = z.array(WorkSchema).safeParse(parsed.value)
  return result.success ? {ok: true, works: result.data} : failure('invalid-state', '旧作品存储字段校验失败')
}

export function migrateLegacyWorks(works: Work[]): OperationsState {
  return {...createOperationsState(), works: works.map(work => ({...work, publicationSource: 'legacy' as const}))}
}

/** 只读加载；新键缺失时才在内存中迁移旧作品，绝不改写任一键。 */
export function loadOperations(storage: OperationsStorage): LoadOperationsResult {
  let current: string | null
  try { current = storage.getItem(OPERATIONS_STORAGE_KEY) } catch {
    return failure('storage-read', '无法读取运营存储')
  }
  if (current !== null) {
    const result = parseOperationsState(current)
    return result.ok ? {...result, migrated: false} : result
  }

  let legacy: string | null
  try { legacy = storage.getItem(LEGACY_WORKS_STORAGE_KEY) } catch {
    return failure('storage-read', '无法读取旧作品存储')
  }
  if (legacy === null) return {ok: true, state: createOperationsState(), migrated: false}
  const result = parseLegacyWorks(legacy)
  return result.ok ? {ok: true, state: migrateLegacyWorks(result.works), migrated: true} : result
}

export function saveOperations(storage: OperationsStorage, state: OperationsState): SaveOperationsResult {
  const result = OperationsStateSchema.safeParse(state)
  if (!result.success) return failure('invalid-state', '拒绝保存无效运营状态')
  let serialized: string
  try { serialized = JSON.stringify(result.data) } catch {
    return failure('storage-write', '无法序列化运营存储')
  }
  try { storage.setItem(OPERATIONS_STORAGE_KEY, serialized) } catch {
    return failure('storage-write', '无法写入运营存储')
  }
  return {ok: true}
}
