// Added by the RUOK fork on 2026-11-17: 智能选题 module page (local rules, no network).
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { Check, Copy, Lightbulb, PenLine, RefreshCw, Sparkles, Trash2 } from 'lucide-react'
import { TOPIC_ANGLES, TOPIC_PLATFORMS, generateTopics, type Topic, type TopicAngle, type TopicPlatform } from './topic-generator'
import { copyText } from '@/workspace/clipboard'
import { takeTopicsHandoff, topicSource, writePublishHandoff, type TopicsHandoff } from '@/workspace/handoff'
import './topics.css'

const SAVED_KEY = 'ruok-topic-basket'

type SavedTopic = Pick<Topic, 'id' | 'title' | 'hook' | 'angle' | 'platform'> & { readonly savedAt: number }

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
  const handed = useRef(false)

  useEffect(() => { setSaved(loadSaved()) }, [])
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
        <p className="topics-lede">给一个关键词，按平台和角度生成一批可以直接开拍的选题：标题、开场钩子、结构大纲。全部在本机按规则生成，不联网、不调用模型。</p>
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
