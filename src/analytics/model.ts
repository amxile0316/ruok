/** 运营分析的本地数据模型：录入、CSV 解析、指标、归因与建议。纯函数，界面与测试共用。 */
export type Work = {
  id: string
  title: string
  platform: string
  publishedAt: string
  durationSec: number
  style: string
  hook: string
  topic: string
  views: number
  likes: number
  comments: number
  shares: number
  saves: number
  follows: number
}

export type WorkMetrics = {
  engagement: number
  interaction: number
  followRate: number
  bucket: string
}

export const PLATFORMS = ['小红书', '抖音', '视频号', 'B 站', 'YouTube', 'X'] as const
export const DURATION_BUCKETS = [
  { id: 'short', label: '≤30s', test: (work: Work) => work.durationSec <= 30 },
  { id: 'mid', label: '31–60s', test: (work: Work) => work.durationSec > 30 && work.durationSec <= 60 },
  { id: 'long', label: '61–120s', test: (work: Work) => work.durationSec > 60 && work.durationSec <= 120 },
  { id: 'epic', label: '>120s', test: (work: Work) => work.durationSec > 120 },
] as const

export const bucketOf = (work: Work) => DURATION_BUCKETS.find(bucket => bucket.test(work))?.label ?? '—'

export function metricsOf(work: Work): WorkMetrics {
  const views = Math.max(1, work.views)
  const interaction = work.likes + work.comments + work.shares + work.saves
  return { engagement: interaction / views, interaction, followRate: work.follows / views, bucket: bucketOf(work) }
}

export function median(values: number[]) {
  if (!values.length) return 0
  const sorted = [...values].sort((a, b) => a - b)
  const middle = Math.floor(sorted.length / 2)
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2
}

export function summarize(works: Work[]) {
  const views = works.reduce((sum, work) => sum + work.views, 0)
  const follows = works.reduce((sum, work) => sum + work.follows, 0)
  const engagement = works.length ? works.reduce((sum, work) => sum + metricsOf(work).engagement, 0) / works.length : 0
  const best = works.reduce<Work | null>((top, work) => (!top || metricsOf(work).engagement > metricsOf(top).engagement ? work : top), null)
  return { count: works.length, views, follows, engagement, best, medianViews: median(works.map(work => work.views)) }
}

export type Group = { key: string; label: string; count: number; views: number; engagement: number }

export function attribute(works: Work[], dimension: 'style' | 'hook' | 'topic' | 'bucket'): Group[] {
  const groups = new Map<string, Work[]>()
  for (const work of works) {
    const key = dimension === 'bucket' ? bucketOf(work) : (work[dimension] || '未标注')
    groups.set(key, [...(groups.get(key) ?? []), work])
  }
  return [...groups.entries()]
    .map(([key, rows]) => ({
      key,
      label: key,
      count: rows.length,
      views: Math.round(rows.reduce((sum, work) => sum + work.views, 0) / rows.length),
      engagement: rows.reduce((sum, work) => sum + metricsOf(work).engagement, 0) / rows.length,
    }))
    .sort((a, b) => b.engagement - a.engagement)
}

export function trend(works: Work[]) {
  return [...works].filter(work => work.publishedAt).sort((a, b) => a.publishedAt.localeCompare(b.publishedAt))
}

/** 规则型建议：只用本地数据，说清依据；没有足够数据时如实说。 */
export function suggestions(works: Work[]): string[] {
  if (!works.length) return ['先录入一条作品，分析会从播放、互动和内容维度给出建议。']
  if (works.length === 1) return ['只有一条作品，先记下它的数据；录入第二条后才能比较。']
  const out: string[] = []
  const stats = summarize(works)
  const lowViews = works.filter(work => work.views < stats.medianViews * 0.6)
  if (lowViews.length && stats.medianViews > 0) out.push(`${lowViews.length} 条播放低于中位数 40% 以上（中位数 ${Math.round(stats.medianViews)}），先从开头钩子和封面标题改起。`)
  if (stats.engagement < 0.02) out.push(`平均互动率 ${(stats.engagement * 100).toFixed(1)}%，低于 2%：正文和结尾缺一个明确的互动动作。`)
  const styles = attribute(works, 'style').filter(group => group.count >= 2)
  if (styles.length >= 2) out.push(`「${styles[0].label}」的平均互动率最高（${(styles[0].engagement * 100).toFixed(1)}%），下一支优先复用这套风格。`)
  const buckets = attribute(works, 'bucket').filter(group => group.count >= 2)
  if (buckets.length >= 2) out.push(`「${buckets[0].label}」的作品平均互动率最高，时长可以往这个区间收。`)
  const hooks = attribute(works, 'hook').filter(group => group.count >= 2)
  if (hooks.length >= 2) out.push(`钩子类型「${hooks[0].label}」表现最好，下一条开头直接照这个结构写。`)
  const topics = attribute(works, 'topic').filter(group => group.count >= 2)
  if (topics.length >= 2) out.push(`题材「${topics[0].label}」最稳，可以排一个系列，而不是每条换题。`)
  if (stats.best) out.push(`当前最佳是「${stats.best.title}」（${stats.best.views} 播放，互动率 ${(metricsOf(stats.best).engagement * 100).toFixed(1)}%），拆它的开头和节奏做模板。`)
  return out.slice(0, 5)
}

const HEADER_ALIASES: Record<keyof Omit<Work, 'id'>, string[]> = {
  title: ['标题', '作品', 'title', 'name'],
  platform: ['平台', 'platform'],
  publishedAt: ['发布日期', '发布时间', '日期', 'date', 'published'],
  durationSec: ['时长', '时长秒', '秒', 'duration', 'length'],
  style: ['风格', 'style'],
  hook: ['钩子', '开头', 'hook'],
  topic: ['题材', '主题', 'topic'],
  views: ['播放', '播放量', '观看', 'views', 'plays'],
  likes: ['点赞', '赞', 'likes'],
  comments: ['评论', 'comments'],
  shares: ['转发', '分享', 'shares'],
  saves: ['收藏', 'saves', 'favorites'],
  follows: ['涨粉', '新增粉丝', 'follows', 'fans'],
}

const number = (value: string | undefined) => {
  if (!value) return 0
  const cleaned = value.replace(/[,，\s]/g, '')
  const match = cleaned.match(/-?\d+(?:\.\d+)?/)
  if (!match) return 0
  const parsed = Number(match[0])
  return cleaned.includes('万') ? Math.round(parsed * 10_000) : Math.round(parsed)
}

const isoDate = (value: string) => {
  const text = (value || '').trim().replace(/[./]/g, '-')
  const match = text.match(/(\d{4})-(\d{1,2})-(\d{1,2})/)
  if (!match) return ''
  return `${match[1]}-${match[2].padStart(2, '0')}-${match[3].padStart(2, '0')}`
}

/** 一行拆成单元格，支持引号与逗号转义。 */
export function splitCsvLine(line: string) {
  const cells: string[] = []
  let cell = '', quoted = false
  for (let index = 0; index < line.length; index++) {
    const char = line[index]
    if (quoted) {
      if (char === '"' && line[index + 1] === '"') { cell += '"'; index++ }
      else if (char === '"') quoted = false
      else cell += char
    } else if (char === '"') quoted = true
    else if (char === ',') { cells.push(cell.trim()); cell = '' }
    else cell += char
  }
  cells.push(cell.trim())
  return cells
}

/** 导入 CSV：按中文/英文表头名对齐，缺列按 0 或空处理。返回作品与跳过行数。 */
export function parseCsv(text: string) {
  const lines = text.replace(/\r\n?/g, '\n').split('\n').filter(line => line.trim())
  if (!lines.length) return { works: [] as Omit<Work, 'id'>[], skipped: 0 }
  const headers = splitCsvLine(lines[0]).map(header => header.replace(/^[\uFEFF\s]+|[\s]+$/g, '').toLowerCase())
  const column = (name: keyof Omit<Work, 'id'>) => headers.findIndex(header => HEADER_ALIASES[name].some(alias => header === alias.toLowerCase()))
  const index = Object.fromEntries(Object.keys(HEADER_ALIASES).map(name => [name, column(name as keyof Omit<Work, 'id'>)])) as Record<keyof Omit<Work, 'id'>, number>
  let skipped = 0
  const works: Omit<Work, 'id'>[] = []
  for (const line of lines.slice(1)) {
    const cells = splitCsvLine(line)
    const title = index.title >= 0 ? (cells[index.title] || '').trim() : ''
    if (!title) { skipped++; continue }
    const cell = (name: keyof Omit<Work, 'id'>) => (index[name] >= 0 ? cells[index[name]] || '' : '')
    works.push({
      title,
      platform: cell('platform') || '小红书',
      publishedAt: isoDate(cell('publishedAt')),
      durationSec: number(cell('durationSec')),
      style: cell('style'),
      hook: cell('hook'),
      topic: cell('topic'),
      views: number(cell('views')),
      likes: number(cell('likes')),
      comments: number(cell('comments')),
      shares: number(cell('shares')),
      saves: number(cell('saves')),
      follows: number(cell('follows')),
    })
  }
  return { works, skipped }
}

export const emptyWork = (): Omit<Work, 'id'> => ({
  title: '', platform: '小红书', publishedAt: new Date().toISOString().slice(0, 10),
  durationSec: 45, style: '', hook: '', topic: '',
  views: 0, likes: 0, comments: 0, shares: 0, saves: 0, follows: 0,
})
