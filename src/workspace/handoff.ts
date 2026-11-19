// Added by the RUOK fork on 2026-11-19: 选题 → 文案发布 → 运营分析的模块间交接。
/** One prepared draft handed from one module to the next. It lives in sessionStorage, so a reload does not resurrect stale text. */

export const PUBLISH_PLATFORMS = [
  {id: 'xiaohongshu', name: '小红书'},
  {id: 'douyin', name: '抖音'},
  {id: 'shipinhao', name: '视频号'},
  {id: 'bilibili', name: 'B 站'},
  {id: 'youtube', name: 'YouTube'},
  {id: 'x', name: 'X'},
] as const

export type PublishPlatform = (typeof PUBLISH_PLATFORMS)[number]['id']

/** 选题 → 文案发布: the source text plus where it came from, shown above the textarea. */
export type PublishHandoff = {
  readonly source: string
  readonly platform: PublishPlatform
  readonly title: string
  readonly angle?: string
}

/** 文案发布 → 运营分析: the copy's title and platform become a work entry with metrics left at 0. */
export type AnalyticsHandoff = {
  readonly title: string
  readonly platform: string
  readonly hook?: string
  readonly topic?: string
}

const KEYS = {publish: 'ruok.handoff.publish.v1', analytics: 'ruok.handoff.analytics.v1'} as const
const platformIds: readonly string[] = PUBLISH_PLATFORMS.map(item => item.id)

function write(key: string, value: unknown) {
  try { window.sessionStorage.setItem(key, JSON.stringify(value)) } catch { /* a full disk only costs the handoff */ }
}

function take(key: string): Record<string, unknown> | null {
  try {
    const raw = window.sessionStorage.getItem(key)
    if (!raw) return null
    window.sessionStorage.removeItem(key)
    const parsed: unknown = JSON.parse(raw)
    return parsed && typeof parsed === 'object' ? parsed as Record<string, unknown> : null
  } catch { return null }
}

const text = (value: unknown) => (typeof value === 'string' && value.trim() ? value : undefined)

export function writePublishHandoff(value: PublishHandoff) {
  write(KEYS.publish, value)
}

/** Returns and clears the draft. Dirty storage falls back to null instead of prefilling a half-broken page. */
export function takePublishHandoff(): PublishHandoff | null {
  const value = take(KEYS.publish)
  const source = text(value?.source), title = text(value?.title), platform = text(value?.platform)
  if (!source || !title || !platform || !platformIds.includes(platform)) return null
  return {source, title, platform: platform as PublishPlatform, ...(text(value?.angle) ? {angle: text(value?.angle)} : {})}
}

export function writeAnalyticsHandoff(value: AnalyticsHandoff) {
  write(KEYS.analytics, value)
}

export function takeAnalyticsHandoff(): AnalyticsHandoff | null {
  const value = take(KEYS.analytics)
  const title = text(value?.title), platform = text(value?.platform)
  if (!title || !platform) return null
  return {title, platform, ...(text(value?.hook) ? {hook: text(value?.hook)} : {}), ...(text(value?.topic) ? {topic: text(value?.topic)} : {})}
}

/** A topic becomes publish-ready source: title, hook and the numbered outline. */
export function topicSource(topic: {readonly title: string; readonly hook: string; readonly outline?: readonly string[]}) {
  const outline = (topic.outline ?? []).map((line, index) => `${index + 1}. ${line}`)
  return [topic.title, '', topic.hook, ...(outline.length ? ['', ...outline] : [])].join('\n')
}

export function analyticsHandoffFromCopy(copy: {readonly title: string; readonly platform: PublishPlatform; readonly hook?: string; readonly topic?: string}): AnalyticsHandoff {
  return {
    title: copy.title,
    platform: PUBLISH_PLATFORMS.find(item => item.id === copy.platform)?.name ?? copy.platform,
    ...(copy.hook ? {hook: copy.hook} : {}),
    ...(copy.topic ? {topic: copy.topic} : {}),
  }
}
