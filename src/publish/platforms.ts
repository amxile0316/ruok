import type {PublishPlatform} from '@/workspace/handoff'

/**
 * 发布包的平台建议值。只用于提示，不阻断——平台规则常变，硬拦会挡住正常发布。
 * 标题上限与文案生成的本地截断口径保持一致（server/publish-api.ts 的 PLATFORMS）。
 */
export type PlatformGuidance = {
  titleMax: number
  bodyMax: number
  tagsMax: number
  coverRatio: '3:4' | '9:16' | '16:9'
  note: string
}

export const PLATFORM_GUIDANCE: Record<PublishPlatform, PlatformGuidance> = {
  xiaohongshu: {titleMax: 20, bodyMax: 1000, tagsMax: 10, coverRatio: '3:4', note: '标题短、正文像分享；封面用 3:4 竖版。'},
  douyin: {titleMax: 30, bodyMax: 300, tagsMax: 5, coverRatio: '9:16', note: '开头一句就是钩子；封面竖版更占位。'},
  shipinhao: {titleMax: 24, bodyMax: 300, tagsMax: 4, coverRatio: '3:4', note: '标题克制，价值点前置。'},
  bilibili: {titleMax: 40, bodyMax: 2000, tagsMax: 10, coverRatio: '16:9', note: '标题信息密度高；封面横版。'},
  youtube: {titleMax: 60, bodyMax: 5000, tagsMax: 15, coverRatio: '16:9', note: '关键词前置；封面横版。'},
  x: {titleMax: 70, bodyMax: 280, tagsMax: 3, coverRatio: '16:9', note: '正文按 280 字符准备。'},
}

/** 按字符（码点）计数，中文一个字算一个。 */
export const textLength = (text: string) => [...text].length

/** 超出建议值时给一行提示；空数组表示都在建议范围内。 */
export function guidanceWarnings(platform: PublishPlatform, title: string, body: string, tags: readonly string[]) {
  const guide = PLATFORM_GUIDANCE[platform]
  const warnings: string[] = []
  const titleLength = textLength(title)
  const bodyLength = textLength(body)
  if (titleLength > guide.titleMax) warnings.push(`标题 ${titleLength} 字，超过建议的 ${guide.titleMax} 字`)
  if (bodyLength > guide.bodyMax) warnings.push(`正文 ${bodyLength} 字，超过建议的 ${guide.bodyMax} 字`)
  if (tags.length > guide.tagsMax) warnings.push(`话题 ${tags.length} 个，超过建议的 ${guide.tagsMax} 个`)
  return warnings
}
