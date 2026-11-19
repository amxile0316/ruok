// Modified by the RUOK fork on 2026-11-19: 接住智能选题的交接，并能把生成结果带进运营分析。
import {useEffect, useRef, useState} from 'react'
import {Link, useNavigate} from 'react-router'
import {PUBLISH_PLATFORMS as PLATFORMS, analyticsHandoffFromCopy, takePublishHandoff, writeAnalyticsHandoff, type PublishHandoff, type PublishPlatform} from '@/workspace/handoff'
import './publish.css'

type Copy = {title: string; body: string; tags: string[]; hook: string; platformName: string; local?: boolean; warning?: string}

const copyText = async (text: string) => {
  try { await navigator.clipboard.writeText(text); return true } catch { return false }
}

function save(name: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], {type: 'text/markdown'}))
  const link = document.createElement('a')
  link.href = url
  link.download = name
  link.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export default function PublishPage() {
  const navigate = useNavigate()
  const [source, setSource] = useState('')
  const [platform, setPlatform] = useState<PublishPlatform>('xiaohongshu')
  const [tone, setTone] = useState('')
  const [copy, setCopy] = useState<Copy | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [origin, setOrigin] = useState<PublishHandoff | null>(null)
  // One-shot: consume the handoff once, not again on the second StrictMode mount.
  const handed = useRef(false)
  useEffect(() => {
    if (handed.current) return
    handed.current = true
    const handoff = takePublishHandoff()
    if (!handoff) return
    setOrigin(handoff)
    setSource(handoff.source)
    setPlatform(handoff.platform)
  }, [])

  const generate = async () => {
    if (!source.trim() || busy) return
    setBusy(true); setError(''); setNotice('')
    try {
      const response = await fetch('/api/publish/generate', {
        method: 'POST',
        headers: {'content-type': 'application/json'},
        body: JSON.stringify({source, platform, tone}),
      })
      const body = await response.json() as {ok: boolean; result?: Copy; error?: string}
      if (!response.ok || !body.ok || !body.result) throw new Error(body.error || '生成失败')
      setCopy(body.result)
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : String(failure))
    } finally {
      setBusy(false)
    }
  }

  const update = (patch: Partial<Copy>) => setCopy(current => (current ? {...current, ...patch} : current))
  const markdown = copy ? `${copy.title}\n\n${copy.body}\n\n${copy.tags.map(tag => `#${tag}`).join(' ')}` : ''
  const flash = (text: string) => { setNotice(text); setTimeout(() => setNotice(''), 1600) }

  /** 文案发布 → 运营分析: carry the title, platform, hook and topic; metrics are filled in on that page. */
  const toAnalytics = () => {
    if (!copy) return
    writeAnalyticsHandoff(analyticsHandoffFromCopy({title: copy.title, platform, hook: copy.hook, topic: origin?.angle}))
    navigate('/analytics')
  }

  return (
    <main className="publish-page">
      <header className="publish-head">
        <div>
          <p className="publish-kicker">文案 · 本机生成</p>
          <h1>文案发布</h1>
          <p className="publish-lede">把成片标题、口播稿或要点交给已接通的本机智能体，按平台风格生成标题、正文和话题。不接第三方发布接口，内容只留在本机。</p>
        </div>
        <Link className="publish-ghost" to="/">返回首页</Link>
      </header>

      <div className="publish-grid">
        <section className="publish-panel">
          <h2>素材</h2>
          {origin && <p className="publish-origin" role="status">来自选题：<b>{origin.title}</b>{origin.angle ? ` · ${origin.angle}` : ''}</p>}
          <textarea
            className="publish-textarea"
            value={source}
            onChange={event => setSource(event.target.value)}
            placeholder="成片标题、口播稿、功能点或一段文稿。事实越具体，文案越像你写的。"
            spellCheck={false}
          />
          <h2>平台</h2>
          <div className="publish-chips" role="group" aria-label="发布平台">
            {PLATFORMS.map(item => (
              <button key={item.id} type="button" className="publish-chip" aria-pressed={platform === item.id} onClick={() => setPlatform(item.id)}>{item.name}</button>
            ))}
          </div>
          <label className="publish-field">
            <span>语气偏好（可选）</span>
            <input value={tone} onChange={event => setTone(event.target.value)} placeholder="例如：冷静、克制，不要感叹号" />
          </label>
          <button type="button" className="publish-go" onClick={() => { void generate() }} disabled={busy || !source.trim()}>
            {busy ? '正在生成…' : '生成发布文案'}
          </button>
          <p className="publish-hint">使用「设置 → 发布文案」里接通的本机智能体；没有接通时会把原因显示出来。</p>
          {error && <p className="publish-error" role="alert">{error}</p>}
        </section>

        <section className="publish-panel publish-panel--out">
          <h2>结果</h2>
          {!copy && <p className="publish-empty">生成后可以逐项改，再复制或导出 Markdown。</p>}
          {copy && (
            <>
              <label className="publish-field">
                <span>标题 · {copy.platformName}</span>
                <input value={copy.title} onChange={event => update({title: event.target.value})} />
              </label>
              <label className="publish-field">
                <span>正文</span>
                <textarea className="publish-body" value={copy.body} onChange={event => update({body: event.target.value})} />
              </label>
              <label className="publish-field">
                <span>话题（逗号分隔）</span>
                <input value={copy.tags.join('，')} onChange={event => update({tags: event.target.value.split(/[,，\s]+/).map(tag => tag.replace(/^#/, '')).filter(Boolean)})} />
              </label>
              {copy.hook && (
                <label className="publish-field">
                  <span>开场钩子</span>
                  <input value={copy.hook} onChange={event => update({hook: event.target.value})} />
                </label>
              )}
              <div className="publish-exports">
                <button type="button" className="publish-btn publish-btn--primary" onClick={() => { void copyText(markdown).then(ok => flash(ok ? '已复制全文' : '复制失败，请手动选择')) }}>复制全文</button>
                <button type="button" className="publish-btn" onClick={() => { void copyText(copy.tags.map(tag => `#${tag}`).join(' ')).then(ok => flash(ok ? '已复制话题' : '复制失败')) }}>复制话题</button>
                <button type="button" className="publish-btn" onClick={() => save(`发布文案-${copy.platformName}.md`, markdown)}>导出 Markdown</button>
                <button type="button" className="publish-btn" onClick={toAnalytics}>记入运营分析</button>
              </div>
              {copy.local && <p className="publish-local">本机智能体未接通，已按素材摘句生成；接通后可在设置里让智能体改写。{copy.warning ? `（${copy.warning}）` : ''}</p>}
              {notice && <p className="publish-notice" role="status">{notice}</p>}
            </>
          )}
        </section>
      </div>
    </main>
  )
}
