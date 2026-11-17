// Added by the RUOK fork on 2026-11-17: 智能选题, local rules only (no network, no model call).
/** The rule engine behind 智能选题: a keyword, a platform and an angle become a batch of shootable topics. */

export type TopicPlatform = 'xiaohongshu' | 'douyin' | 'shipinhao' | 'bilibili'
export type TopicAngle = 'checklist' | 'review' | 'contrarian' | 'pitfall' | 'tutorial'

export type Topic = {
  readonly id: string
  readonly title: string
  readonly hook: string
  readonly outline: readonly string[]
  readonly angle: TopicAngle
  readonly platform: TopicPlatform
  /** How long the finished clip should run. */
  readonly duration: string
}

export const TOPIC_PLATFORMS: readonly { readonly id: TopicPlatform; readonly name: string; readonly note: string }[] = [
  { id: 'xiaohongshu', name: '小红书', note: '标题带数字，正文分点，结尾引导收藏' },
  { id: 'douyin', name: '抖音', note: '三秒给结论，节奏快，一句一个动作' },
  { id: 'shipinhao', name: '视频号', note: '口播为主，先讲判断再说方法' },
  { id: 'bilibili', name: 'B 站', note: '标题写清范围，内容按流程完整拆' },
]

export const TOPIC_ANGLES: readonly { readonly id: TopicAngle; readonly name: string; readonly line: string }[] = [
  { id: 'checklist', name: '干货清单', line: '把方法拆成能照做的几条' },
  { id: 'review', name: '亲测复盘', line: '用自己的过程和结果说话' },
  { id: 'contrarian', name: '反常识观点', line: '先摆常见说法，再给不同判断' },
  { id: 'pitfall', name: '避坑提醒', line: '讲踩过的坑和怎么修' },
  { id: 'tutorial', name: '流程演示', line: '从头到尾演示一遍操作' },
]

const DURATIONS: Readonly<Record<TopicPlatform, string>> = {
  xiaohongshu: '45–60 秒',
  douyin: '30–45 秒',
  shipinhao: '60–90 秒',
  bilibili: '3–5 分钟',
}

const ANGLE_WORDS: Readonly<Record<TopicAngle, readonly string[]>> = {
  checklist: ['清单', '步骤', '检查表', '方法'],
  review: ['复盘', '实测记录', '真实过程', '经验'],
  contrarian: ['不同看法', '反常识结论', '纠正', '另一种做法'],
  pitfall: ['避坑清单', '踩坑记录', '注意事项', '翻车点'],
  tutorial: ['完整演示', '全流程', '操作步骤', '上手过程'],
}

const STEPS = ['定方向', '做准备', '执行', '收尾', '复盘', '发布', '对标', '打磨'] as const

const HOOKS = [
  '先说结论，再讲过程，前 3 秒把结果摆出来。',
  '如果你也在这里反复返工，这条先存着。',
  '这条不讲理论，只讲我实际做过的几步。',
  '几个做法里，真正有效的其实只有一个。',
  '大多数人顺序做反了，先把判断标准讲清。',
  '我把过程和结果都放出来，你自己对照。',
] as const

/** `{a}` / `{b}` become two different steps, `{k}` the keyword, so two topics of one angle never read the same. */
const OUTLINES: Readonly<Record<TopicAngle, readonly string[]>> = {
  checklist: ['开场：一句话给出{k}的结论，前 3 秒看到结果', '主体：从{a}到{b}，三条并列讲清', '每条后面跟一个可以立刻照做的动作', '结尾：一句总结，给一个收藏的理由'],
  review: ['开场：我做{k}做了什么、做了多久', '过程：从{a}到{b}，三个节点各讲一个决定', '结果：给出数字和前后对比', '结尾：如果重来，我会改哪一步'],
  contrarian: ['开场：先摆出大家关于{k}都信的说法', '转折：我为什么不同意，用{a}和{b}作证据', '给出替代做法和适用条件', '结尾：留一个反例给评论区'],
  pitfall: ['开场：直接说{k}里踩过的坑，不铺垫', '逐个讲：{a}和{b}上的现象 → 原因 → 怎么修', '给一张自查清单', '结尾：请观众对照自己的情况'],
  tutorial: ['开场：先展示{k}的最终效果', '拆步骤：{a} → {b} → 收尾', '每一步给参数或口径', '结尾：常见问题快问快答'],
}

/** Small deterministic PRNG so 换一批 gives a different but reproducible batch. */
function random(seed: number) {
  let state = seed >>> 0
  return () => {
    state = (state + 0x6d2b79f5) >>> 0
    let t = state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const pick = <T,>(items: readonly T[], next: () => number) => items[Math.floor(next() * items.length) % items.length]

const TITLE_PATTERNS: Readonly<Record<TopicPlatform, readonly ((k: string, n: number, word: string, step: string, step2: string, next: () => number) => string)[]>> = {
  xiaohongshu: [
    (k, n, word, _step, _step2, next) => `${k}｜${n}个${word}，第 ${1 + Math.floor(next() * n)} 个我现在还在用`,
    (k, n, word) => `做${k}前先看这篇：${n}条${word}，少返工两个月`,
    (k, n) => `关于${k}，很少有人讲清的 ${n} 件事`,
    (k, n, word, step) => `${k}卡在${step}？这 ${n} 个${word}照着改`,
    (k, _n, word, step, step2) => `${k}的${word}，从${step}到${step2}我重排了一遍`,
  ],
  douyin: [
    (k, _n, _word, step) => `${k}别急着${step}，先看这 30 秒`,
    (k, _n, _word, step) => `大部分做${k}的人，都卡在${step}`,
    (k, n, _word, _step, step2) => `${k}最快的一条路，其实只剩 ${n} 步到${step2}`,
    (k, _n, _word, _step, _step2, next) => `${k}做不好，${50 + Math.floor(next() * 4) * 10}% 是因为这一个动作`,
    (k, n) => `${k}，我踩过的 ${n} 个坑都在这了`,
  ],
  shipinhao: [
    (k, _n, _word, step) => `${k}这件事，很多人第一步就错了：${step}`,
    (k, _n, word, step) => `做${k}这么久，我才明白${word}要从${step}开始`,
    (k) => `如果你也在做${k}，这条能省下不少弯路`,
    (k, n, word, step) => `${k}的${word}：${n} 个判断标准，先看${step}`,
    (k, n) => `把${k}讲清楚：${n} 个环节，一个不落`,
  ],
  bilibili: [
    (k, _n, _word, step, step2) => `【${k}】从${step}到${step2}，完整拆解一遍`,
    (k, n) => `${k}全流程：${n} 个环节，逐个演示`,
    (k, n) => `${k}到底怎么做？${n} 个问题一次讲完`,
    (k, n) => `${k}避坑指南：${n} 个常见错误与修正`,
    (k, _n, word, step) => `【${k}】${word}，从${step}开始重做`,
  ],
}

export function generateTopics(keyword: string, platform: TopicPlatform, angle: TopicAngle, seed: number): Topic[] {
  const key = keyword.trim() || '这个主题'
  const next = random(seed + 17)
  const patterns = TITLE_PATTERNS[platform]
  const words = ANGLE_WORDS[angle]
  const outline = OUTLINES[angle]
  const used = new Set<string>()
  const topics: Topic[] = []
  for (let index = 0; topics.length < 6 && index < 40; index += 1) {
    const count = 3 + Math.floor(next() * 4)
    const step = pick(STEPS, next)
    const step2 = pick(STEPS.filter(item => item !== step), next)
    const pattern = patterns[(seed + index) % patterns.length]
    const title = pattern(key, count, pick(words, next), step, step2, next)
    if (used.has(title)) continue
    used.add(title)
    topics.push({
      id: `${seed}-${index}-${platform}-${angle}`,
      title,
      hook: pick(HOOKS, next),
      outline: outline.map(line => line.replaceAll('{k}', key).replaceAll('{a}', step).replaceAll('{b}', step2)),
      angle,
      platform,
      duration: DURATIONS[platform],
    })
  }
  return topics
}
