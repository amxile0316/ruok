/**
 * 口播剪辑的文本驱动切分：逐字稿 / SRT 拆句、按时长配比、删除句后重排、导出字幕与剪切清单。
 * 纯函数，客户端与服务端共用；不依赖媒体解码，也不调用智能体。
 */
export type TalkSentence = {
  id: string
  text: string
  /** 保留 = 进片；删除 = 静音、口误或不要的句子 */
  keep: boolean
  /** 原素材时间（秒），按句长比例分配，或来自导入的 SRT */
  start: number
  end: number
}

export type TalkCut = { start: number; end: number }

/** 一键落轨：时间线上的一段画面/声音，`start` 是成片时间，`sourceStart` 是原素材切点。 */
export type TalkPlaceSegment = { start: number; duration: number; sourceStart: number; label?: string }
/** 一键落轨：字幕轨的一句，时间是成片时间。 */
export type TalkPlaceCaption = { start: number; duration: number; text: string }

export type TalkPlan = {
  duration: number
  /** 成片实际时长：删除句被挤掉、保留下来的句子首尾相接 */
  keptDuration: number
  /** 全部句子（含被删的，保留原时间），界面按这个顺序显示并可撤回删除 */
  all: TalkSentence[]
  sentences: TalkSentence[]
  /** 未压缩的原时间轴上要保留的区间，可直接交给时间线做剪切 */
  cuts: TalkCut[]
  srt: string
  vtt: string
  /** 删除的句子数、节省的秒数，给界面显示 */
  removed: number
  savedSeconds: number
}

const SENTENCE_END = /[。！？!?；;…]+|\n+/g
const SRT_TIME = /(\d{1,2}):(\d{2}):(\d{2})[,.](\d{1,3})\s*-->\s*(\d{1,2}):(\d{2}):(\d{2})[,.](\d{1,3})/

const seconds = (h: string, m: string, s: string, ms: string) => (+h) * 3600 + (+m) * 60 + (+s) + (+ms.padEnd(3, '0')) / 1000
const clock = (value: number, sep: ',' | '.') => {
  const ms = Math.max(0, Math.round(value * 1000))
  const h = Math.floor(ms / 3_600_000), m = Math.floor(ms / 60_000) % 60, s = Math.floor(ms / 1000) % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}${sep}${String(ms % 1000).padStart(3, '0')}`
}

/** 一句话的长度权重：汉字/字母/数字都算 1，空白与标点不算。 */
export function sentenceWeight(text: string) {
  return Math.max(1, [...text.replace(/[\s\p{P}\p{S}]/gu, '')].length)
}

/** 导入 SRT：有自带时间就保留，句内换行合并成一行。 */
export function parseSrt(source: string): TalkSentence[] {
  const blocks = source.replace(/\r\n/g, '\n').trim().split(/\n{2,}/)
  const out: TalkSentence[] = []
  for (const block of blocks) {
    const lines = block.split('\n')
    const timeIndex = lines.findIndex(line => SRT_TIME.test(line))
    if (timeIndex < 0) continue
    const match = lines[timeIndex].match(SRT_TIME)!
    const text = lines.slice(timeIndex + 1).join(' ').trim()
    if (!text) continue
    out.push({ id: `s${out.length + 1}`, text, keep: true, start: seconds(match[1], match[2], match[3], match[4]), end: seconds(match[5], match[6], match[7], match[8]) })
  }
  return out
}

/** 普通逐字稿：按句末标点与换行拆句，去掉空白句。 */
export function parseTranscript(source: string): TalkSentence[] {
  if (SRT_TIME.test(source)) return parseSrt(source)
  const pieces = source.replace(/\r\n/g, '\n').split(SENTENCE_END).map(piece => piece.trim()).filter(Boolean)
  const sentences = pieces.length ? pieces : [source.trim()].filter(Boolean)
  return sentences.map((text, index) => ({ id: `s${index + 1}`, text, keep: true, start: 0, end: 0 }))
}

/**
 * 给没有时间的句子按「句长 + 停顿」铺到素材时长上：每句后留 0.18s 的呼吸，
 * 总权重不足时按比例压缩，保证最后一句不越过素材末尾。
 */
export function timeSentences(sentences: readonly TalkSentence[], duration: number): TalkSentence[] {
  const timed = sentences.filter(s => s.end > s.start)
  if (timed.length === sentences.length && sentences.length) return sentences.map(s => ({ ...s }))
  const total = Math.max(1, duration)
  const gap = Math.min(0.18, total / Math.max(1, sentences.length) / 6)
  const weights = sentences.map(s => sentenceWeight(s.text))
  const weightSum = weights.reduce((a, b) => a + b, 0) || 1
  const speech = Math.max(0.1, total - gap * Math.max(0, sentences.length - 1))
  let cursor = 0
  return sentences.map((sentence, index) => {
    const span = speech * (weights[index] / weightSum)
    const start = cursor, end = Math.min(total, start + span)
    cursor = end + gap
    return { ...sentence, start, end }
  })
}

const overlaps = (a: TalkCut, b: TalkCut) => a.start < b.end - 1e-6 && b.start < a.end - 1e-6

/**
 * 生成成片计划。`compact` 为真时删掉的句子被完全挤掉（口播成片），
 * 为假时保留原时间轴，只在字幕里给删除句留空。
 */
export function planTranscript(input: {
  sentences: readonly TalkSentence[]
  duration: number
  compact?: boolean
}): TalkPlan {
  const timed = timeSentences(input.sentences, input.duration)
  const compact = input.compact !== false
  const kept = timed.filter(s => s.keep)
  const removed = timed.length - kept.length
  const savedSeconds = Math.round(removed ? timed.filter(s => !s.keep).reduce((sum, s) => sum + (s.end - s.start), 0) : 0)

  const cuts: TalkCut[] = []
  for (const sentence of kept) {
    const cut = { start: +sentence.start.toFixed(3), end: +sentence.end.toFixed(3) }
    const last = cuts.at(-1)
    if (last && Math.abs(last.end - cut.start) < 0.05) last.end = cut.end
    else if (!last || !overlaps(last, cut)) cuts.push(cut)
    else last.end = Math.max(last.end, cut.end)
  }

  let shifted: TalkSentence[]
  if (compact) {
    let cursor = 0
    shifted = kept.map(sentence => {
      const span = sentence.end - sentence.start
      const next = { ...sentence, start: +cursor.toFixed(3), end: +Math.min(Number.MAX_SAFE_INTEGER, cursor + span).toFixed(3) }
      cursor += span
      return next
    })
  } else shifted = kept.map(sentence => ({ ...sentence }))

  const keptDuration = compact ? +(shifted.at(-1)?.end ?? 0).toFixed(3) : +(cuts.at(-1)?.end ?? 0).toFixed(3)
  const byId = new Map(shifted.map(sentence => [sentence.id, sentence]))
  return {
    duration: input.duration,
    keptDuration,
    all: timed.map(sentence => byId.get(sentence.id) ?? { ...sentence }),
    sentences: shifted,
    cuts,
    srt: buildSrt(shifted),
    vtt: buildVtt(shifted),
    removed,
    savedSeconds,
  }
}

export function buildSrt(sentences: readonly TalkSentence[]) {
  return sentences.map((sentence, index) =>
    `${index + 1}\n${clock(sentence.start, ',')} --> ${clock(sentence.end, ',')}\n${sentence.text}\n`).join('\n')
}

export function buildVtt(sentences: readonly TalkSentence[]) {
  return `WEBVTT\n\n${sentences.map(sentence => `${clock(sentence.start, '.')} --> ${clock(sentence.end, '.')}\n${sentence.text}\n`).join('\n')}`
}

/** ASS 字幕：带一套白字深描边的样式，字号和垂直位置可调，方便直接进剪辑软件。 */
export function buildAss(sentences: readonly TalkSentence[], style: { fontSize?: number; position?: 'bottom' | 'middle' } = {}) {
  const size = Math.round(style.fontSize ?? 46)
  const alignment = style.position === 'middle' ? 5 : 2
  const marginV = style.position === 'middle' ? 0 : 96
  const stamp = (value: number) => {
    const cs = Math.max(0, Math.round(value * 100))
    const h = Math.floor(cs / 360000), m = Math.floor(cs / 6000) % 60, s = Math.floor(cs / 100) % 60, c = cs % 100
    return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${String(c).padStart(2, '0')}`
  }
  const head = [
    '[Script Info]', 'ScriptType: v4.00+', 'PlayResX: 1920', 'PlayResY: 1080', '',
    '[V4+ Styles]',
    'Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding',
    `Style: RUOK,Microsoft YaHei,${size},&H00F0F4EE,&H00D6A85F,&H00111A12,&H80000000,0,0,0,0,100,100,0,0,1,2,1,${alignment},120,120,${marginV},1`,
    '', '[Events]', 'Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text',
  ]
  const lines = sentences.map(sentence => `Dialogue: 0,${stamp(sentence.start)},${stamp(sentence.end)},RUOK,,0,0,0,,${sentence.text.replace(/\n/g, '\\N')}`)
  return [...head, ...lines].join('\n')
}

/** 剪切清单：给时间线/导出用的一行一个保留区间。 */
export function cutListText(plan: TalkPlan) {
  return plan.cuts.map(cut => `${cut.start.toFixed(3)}\t${cut.end.toFixed(3)}`).join('\n')
}

/**
 * 把剪辑方案换算成落轨用的片段与字幕。
 * 压缩模式：保留段从 0 开始首尾相接，每段用原素材的切点取画面；
 * 不压缩模式：画面与字幕都放在原时间轴上，删除句的位置留空。
 * 成片时长取所有片段/字幕的最大结束时间，与口播页显示的一致。
 */
export function talkPlacement(plan: TalkPlan, compact = true): { duration: number; segments: TalkPlaceSegment[]; captions: TalkPlaceCaption[] } {
  const round = (value: number) => Math.round(value * 1000) / 1000
  const short = (value: number) => `${String(Math.floor(Math.max(0, value) / 60)).padStart(2, '0')}:${String(Math.floor(Math.max(0, value)) % 60).padStart(2, '0')}`
  let cursor = 0
  const segments = plan.cuts.map((cut, index) => {
    const duration = round(cut.end - cut.start)
    const start = compact ? round(cursor) : round(cut.start)
    if (compact) cursor += duration
    return {
      start,
      duration,
      sourceStart: round(cut.start),
      label: `第 ${index + 1} 段 ${short(cut.start)}–${short(cut.end)}`,
    }
  })
  const captions = plan.sentences.map(sentence => ({
    start: round(sentence.start),
    duration: round(Math.max(0, sentence.end - sentence.start)),
    text: sentence.text,
  })).filter(caption => caption.duration > 0)
  const duration = round(Math.max(0, ...segments.map(s => s.start + s.duration), ...captions.map(c => c.start + c.duration)))
  return {duration, segments, captions}
}
