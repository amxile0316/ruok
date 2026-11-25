// Added by the RUOK fork on 2026-11-17: 智能选题 module page (local rules, no network).
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { Check, Copy, Lightbulb, PenLine, RefreshCw, Sparkles, Trash2, TrendingUp } from 'lucide-react'
import { TOPIC_ANGLES, TOPIC_PLATFORMS, generateTopics, type Topic, type TopicAngle, type TopicPlatform } from './topic-generator'
import { copyText } from '@/workspace/clipboard'
import { takeTopicsHandoff, topicSource, writePublishHandoff, type TopicsHandoff } from '@/workspace/handoff'
import './topics.css'

const SAVED_KEY = 'ruok-topic-basket'

type SavedTopic = Pick<Topic, 'id' | 'title' | 'hook' | 'angle' | 'platform'> & { readonly savedAt: number }
type TrendSourceOption = { readonly id: string; readonly name: string; readonly note: string }
type TrendItem = { readonly title: string; readonly link?: string; readonly publishedAt?: string }
type TrendResponse = { ok?: boolean; error?: string; source?: { name: string }; fetchedAt?: string; cached?: boolean; items?: TrendItem[] }

const platformName = (id: TopicPlatform) => TOPIC_PLATFORMS.find(item => item.id === id)?.name ?? id
const angleName = (id: TopicAngle) => TOPIC_ANGLES.find(item => item.id === id)?.name ?? id

function loadSaved(): SavedTopic[] {
  try {
    const raw = window.localStorage.getItem(SAVED_KEY)
    const parsed: unknown = raw ? JSON.parse(raw) : []
    return Array.isArray(parsed) ? parsed.filter((item): item is SavedTopic => !!item && typeof item === 'object' && 'title' in item && typeof item.title === 'string') : []
  } catch {
    return []
  }
}

/** 选题 → 文案发布: the draft carries title, hook and outline, so the writer starts from the chosen topic. */
type HandoffTopic = Pick<Topic, 'title' | 'hook' | 'platform' | 'angle'> & {readonly outline?: readonly string[]}

export default function TopicsPage() {
  const navigate = useNavigate()
  const [keyword, setKeyword] = useState('')
  const [platform, setPlatform] = useState<TopicPlatform>('xiaohongshu')
  const [angle, setAngle] = useState<TopicAngle>('checklist')
  const [seed, setSeed] = useState(1)
  const [batch, setBatch] = useState<Topic[]>([])
  const [saved, setSaved] = useState<SavedTopic[]>([])
  const [notice, setNotice] = useState('')
  const [origin, setOrigin] = useState<TopicsHandoff | null>(null)
  const [trendSources, setTrendSources] = useState<TrendSourceOption[]>([])
  const [trendSourceId, setTrendSourceId] = useState('')
  const [trendItems, setTrendItems] = useState<TrendItem[]>([])
  const [trendMeta, setTrendMeta] = useState<{ name: string; fetchedAt: string; cached: boolean } | null>(null)
  const [trendError, setTrendError] = useState('')
  const [trendBusy, setTrendBusy] = useState(false)
  const handed = useRef(false)

  useEffect(() => { setSaved(loadSaved()) }, [])
  useEffect(() => {
    let alive = true
    void fetch('/api/trends/sources')
      .then(response => response.ok ? response.json() as Promise<{ ok?: boolean; sources?: TrendSourceOption[] }> : null)
      .then(payload => {
        if (!alive || !payload?.ok || !payload.sources?.length) return
        setTrendSources(payload.sources)
        setTrendSourceId(current => current || payload.sources![0].id)
      })
      .catch(() => { /* 热点源清单取不到时，选题仍按本机规则可用 */ })
    return () => { alive = false }
  }, [])
  useEffect(() => {
    try { window.localStorage.setItem(SAVED_KEY, JSON.stringify(saved)) } catch { /* a full disk only costs the basket */ }
  }, [saved])

  const flash = useCallback((text: string) => {
    setNotice(text)
    window.setTimeout(() => setNotice(''), 1600)
  }, [])

  const generate = (nextSeed = seed) => {
    setBatch(generateTopics(keyword, platform, angle, nextSeed))
    setSeed(nextSeed)
  }

  /** 热点取词只拿公开 RSS 的标题，填进关键词由人决定要不要用。 */
  const fetchTrend = async () => {
    if (!trendSourceId || trendBusy) return
    setTrendBusy(true)
    setTrendError('')
    try {
      const response = await fetch('/api/trends/fetch', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ sourceId: trendSourceId }),
      })
      const payload = await response.json() as TrendResponse
      if (!payload.ok) throw new Error(payload.error || '热点源暂时取不到')
      setTrendItems(payload.items ?? [])
      setTrendMeta({ name: payload.source?.name ?? '', fetchedAt: payload.fetchedAt ?? new Date().toISOString(), cached: !!payload.cached })
    } catch (error) {
      setTrendItems([])
      setTrendMeta(null)
      setTrendError(error instanceof Error ? error.message : '热点源暂时取不到')
    } finally {
      setTrendBusy(false)
    }
  }

  /** 运营复盘 hands over a keyword and platform; without it the first batch is ready on arrival, so the page is never an empty form. */
  useEffect(() => {
    if (handed.current) return
    handed.current = true
    const handoff = takeTopicsHandoff()
    if (!handoff) { setBatch(generateTopics('', 'xiaohongshu', 'checklist', 1)); return }
    setOrigin(handoff)
    setKeyword(handoff.keyword)
    setPlatform(handoff.platform)
    setBatch(generateTopics(handoff.keyword, handoff.platform, 'checklist', 1))
  }, [])

  const keep = (topic: Topic) => {
    setSaved(current => current.some(item => item.title === topic.title)
      ? current
      : [{ id: topic.id, title: topic.title, hook: topic.hook, angle: topic.angle, platform: topic.platform, savedAt: Date.now() }, ...current].slice(0, 60))
    flash('已存进选题篮')
  }

  const keptTitles = useMemo(() => new Set(saved.map(item => item.title)), [saved])

  const toPublish = (topic: HandoffTopic) => {
    writePublishHandoff({ source: topicSource(topic), platform: topic.platform, title: topic.title, angle: angleName(topic.angle) })
    navigate('/publish')
  }

  return <main className="topics-page">
    <header className="topics-head">
      <div>
        <p className="topics-kicker">选题 · 本机规则</p>
        <h1>智能选题</h1>
        <p className="topics-lede">给一个关键词，按平台和角度生成一批可以直接开拍的选题：标题、开场钩子、结构大纲。选题在本机按规则生成，不调用模型；「热点取词」只读取公开 RSS 的标题来填关键词，不写稿、不发布。</p>
      </div>
      <Link className="topics-ghost" to="/">返回首页</Link>
    </header>

    <div className="topics-grid">
      <section className="topics-panel" aria-label="选题条件">
        {origin && <p className="topics-origin">来自运营复盘：{origin.reason ?? `上次做的是「${origin.keyword}」。`}关键词和平台已按复盘填好，可以直接换一批或改条件。</p>}
        <h2>关键词</h2>
        <label className="topics-field">
          <span>这一条讲什么</span>
          <input value={keyword} onChange={event => setKeyword(event.target.value)} placeholder="例如：口播录制、录屏转场、选题方法" spellCheck={false} />
        </label>

        <h2>热点取词</h2>
        <div className="topics-trend">
          <div className="topics-trend__row">
            <select value={trendSourceId} onChange={event => setTrendSourceId(event.target.value)} aria-label="热点源">
              {trendSources.length === 0
                ? <option value="">{trendError ? '热点源清单取不到' : '读取热点源…'}</option>
                : trendSources.map(source => <option key={source.id} value={source.id}>{source.name}</option>)}
            </select>
            <button type="button" className="topics-btn" disabled={trendBusy || !trendSourceId} onClick={() => void fetchTrend()}>
              <TrendingUp size={13} aria-hidden="true" />{trendBusy ? '取词中…' : '取热点'}
            </button>
          </div>
          {trendMeta && <p className="topics-note">{trendMeta.name}<i aria-hidden="true">·</i>采集于 {new Date(trendMeta.fetchedAt).toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}{trendMeta.cached ? ' · 缓存' : ''}</p>}
          {trendError && <p className="topics-trend__error" role="status">{trendError}</p>}
          {trendItems.length > 0
            ? <ul className="topics-trend__list">{trendItems.slice(0, 8).map(item => <li key={item.title}>
              <button type="button" onClick={() => { setKeyword(item.title); flash('已填入关键词') }} title={item.title}>{item.title}</button>
            </li>)}</ul>
            : !trendError && <p className="topics-hint">取来的只是标题，用哪条做选题由你决定；不会自动写稿或发布。</p>}
        </div>

        <h2>平台</h2>
        <div className="topics-chips" role="group" aria-label="发布平台">
          {TOPIC_PLATFORMS.map(item => <button key={item.id} type="button" className="topics-chip" aria-pressed={platform === item.id} onClick={() => setPlatform(item.id)}>{item.name}</button>)}
        </div>
        <p className="topics-note">{TOPIC_PLATFORMS.find(item => item.id === platform)?.note}</p>

        <h2>角度</h2>
        <div className="topics-chips" role="group" aria-label="内容角度">
          {TOPIC_ANGLES.map(item => <button key={item.id} type="button" className="topics-chip" aria-pressed={angle === item.id} onClick={() => setAngle(item.id)}>{item.name}</button>)}
        </div>
        <p className="topics-note">{TOPIC_ANGLES.find(item => item.id === angle)?.line}</p>

        <div className="topics-actions">
          <button type="button" className="topics-go" onClick={() => generate(seed + 1)}><Sparkles size={15} aria-hidden="true" />生成一批选题</button>
          <button type="button" className="topics-btn" onClick={() => generate(seed + 1)}><RefreshCw size={14} aria-hidden="true" />换一批</button>
        </div>
        <p className="topics-hint">同一关键词换一批会给不同的标题骨架；满意的那条存进选题篮，点「去写稿」会带着标题、钩子和大纲进入文案发布。</p>
      </section>

      <section className="topics-result" aria-labelledby="topics-result-title">
        <div className="topics-result__head">
          <h2 id="topics-result-title">这一批 · {batch.length} 条</h2>
          <span className="topics-tag">{platformName(platform)} · {angleName(angle)}</span>
        </div>
        {batch.length === 0
          ? <p className="topics-empty">填一个关键词，再点「生成一批选题」。</p>
          : <ul className="topics-list">{batch.map((topic, index) => <li key={topic.id} className="topics-card">
            <div className="topics-card__top">
              <span className="topics-index">{String(index + 1).padStart(2, '0')}</span>
              <span className="topics-mini">{angleName(topic.angle)}<i aria-hidden="true">·</i>{topic.duration}</span>
            </div>
            <h3>{topic.title}</h3>
            <p className="topics-hook"><Lightbulb size={13} aria-hidden="true" />{topic.hook}</p>
            <ol className="topics-outline">{topic.outline.map((line, lineIndex) => <li key={lineIndex}>{line}</li>)}</ol>
            <div className="topics-card__actions">
              <button type="button" className="topics-btn" onClick={() => { void copyText(topic.title).then(ok => flash(ok ? '已复制标题' : '复制失败，请手动选择')) }}><Copy size={13} aria-hidden="true" />复制标题</button>
              <button type="button" className="topics-btn" onClick={() => { void copyText(topicSource(topic)).then(ok => flash(ok ? '已复制整条脚本' : '复制失败，请手动选择')) }}><Copy size={13} aria-hidden="true" />复制脚本</button>
              <button type="button" className="topics-btn topics-btn--keep" data-kept={keptTitles.has(topic.title) || undefined} onClick={() => keep(topic)}>
                {keptTitles.has(topic.title) ? <Check size={13} aria-hidden="true" /> : <Sparkles size={13} aria-hidden="true" />}
                {keptTitles.has(topic.title) ? '已在选题篮' : '存进选题篮'}
              </button>
              <button type="button" className="topics-btn topics-btn--go" onClick={() => toPublish(topic)}><PenLine size={13} aria-hidden="true" />去写稿</button>
            </div>
          </li>)}</ul>}
        {notice && <p className="topics-notice" role="status">{notice}</p>}
      </section>
    </div>

    <section className="topics-basket" aria-labelledby="topics-basket-title">
      <div className="topics-result__head">
        <h2 id="topics-basket-title">选题篮</h2>
        <div className="topics-basket__tools">
          <span className="topics-tag">{saved.length} 条 · 只存在本机</span>
          {saved.length > 0 && <button type="button" className="topics-btn" onClick={() => { setSaved([]); flash('选题篮已清空') }}>清空</button>}
        </div>
      </div>
      {saved.length === 0
        ? <p className="topics-empty">还没有存下的选题。存下来的会一直留在这台机器上。</p>
        : <ul className="topics-basket__list">{saved.map(item => <li key={`${item.id}-${item.savedAt}`}>
          <div>
            <p className="topics-basket__title">{item.title}</p>
            <p className="topics-basket__meta">{platformName(item.platform)}<i aria-hidden="true">·</i>{angleName(item.angle)}<i aria-hidden="true">·</i>{new Date(item.savedAt).toLocaleDateString('zh-CN')}</p>
          </div>
          <div className="topics-basket__actions">
            <button type="button" className="topics-icon topics-icon--go" aria-label={`写稿：${item.title}`} title="带去文案发布" onClick={() => toPublish(item)}><PenLine size={14} aria-hidden="true" /></button>
            <button type="button" className="topics-icon" aria-label={`复制：${item.title}`} title="复制标题" onClick={() => { void copyText(item.title).then(ok => flash(ok ? '已复制标题' : '复制失败')) }}><Copy size={14} aria-hidden="true" /></button>
            <button type="button" className="topics-icon" aria-label={`删除：${item.title}`} title="从选题篮删除" onClick={() => setSaved(current => current.filter(entry => entry.savedAt !== item.savedAt))}><Trash2 size={14} aria-hidden="true" /></button>
          </div>
        </li>)}</ul>}
    </section>
  </main>
}
