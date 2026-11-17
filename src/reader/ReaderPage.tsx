// Added by the RUOK fork on 2026-11-17: 链接读取 module page.
import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router'
import { ArrowRight, Clock, Copy, FileText, Link2, Loader2, Trash2 } from 'lucide-react'
import { copyText } from '@/workspace/clipboard'
import './reader.css'

type ReadResult = {
  readonly url: string
  readonly title: string
  readonly site: string
  readonly paragraphs: readonly string[]
  readonly characters: number
  readonly minutes: number
  readonly summary: string
}

type Recent = { readonly url: string; readonly title: string; readonly site: string; readonly at: number }

const HISTORY_KEY = 'ruok-reader-history'

function loadHistory(): Recent[] {
  try {
    const raw = window.localStorage.getItem(HISTORY_KEY)
    const parsed: unknown = raw ? JSON.parse(raw) : []
    return Array.isArray(parsed) ? parsed.filter((item): item is Recent => !!item && typeof item === 'object' && 'url' in item && typeof item.url === 'string').slice(0, 8) : []
  } catch {
    return []
  }
}

export default function ReaderPage() {
  const [input, setInput] = useState('')
  const [result, setResult] = useState<ReadResult | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [history, setHistory] = useState<Recent[]>([])

  useEffect(() => { setHistory(loadHistory()) }, [])
  useEffect(() => {
    try { window.localStorage.setItem(HISTORY_KEY, JSON.stringify(history)) } catch { /* history is a convenience only */ }
  }, [history])

  const flash = useCallback((text: string) => {
    setNotice(text)
    window.setTimeout(() => setNotice(''), 1600)
  }, [])

  const read = async (raw: string) => {
    const target = raw.trim()
    if (!target || busy) return
    setInput(target); setBusy(true); setError(''); setNotice('')
    try {
      const response = await fetch('/api/reader/read', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ url: target }),
      })
      const body = await response.json() as { ok: boolean; result?: ReadResult; error?: string }
      if (!response.ok || !body.ok || !body.result) throw new Error(body.error || '读取失败')
      setResult(body.result)
      setHistory(current => [{ url: body.result!.url, title: body.result!.title, site: body.result!.site, at: Date.now() }, ...current.filter(item => item.url !== body.result!.url)].slice(0, 8))
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : String(failure))
      setResult(null)
    } finally {
      setBusy(false)
    }
  }

  const plainText = result ? [result.title, '', ...result.paragraphs].join('\n\n') : ''
  const summaryText = result ? `${result.title}\n${result.summary}\n${result.url}` : ''

  return <main className="reader-page">
    <header className="reader-head">
      <div>
        <p className="reader-kicker">阅读 · 本机抓取</p>
        <h1>链接读取</h1>
        <p className="reader-lede">粘贴一个公开网页链接，由本机服务抓取并抽出正文，排成干净的阅读视图。只读取一次，不留副本，不接第三方服务。</p>
      </div>
      <Link className="reader-ghost" to="/">返回首页</Link>
    </header>

    <form className="reader-bar" onSubmit={event => { event.preventDefault(); void read(input) }}>
      <Link2 size={16} aria-hidden="true" />
      <input value={input} onChange={event => setInput(event.target.value)} placeholder="https://…" spellCheck={false} aria-label="网页链接" />
      <button type="submit" className="reader-go" disabled={busy || !input.trim()}>
        {busy ? <><Loader2 size={15} className="reader-spin" aria-hidden="true" />正在读取</> : <>读取正文<ArrowRight size={15} aria-hidden="true" /></>}
      </button>
    </form>
    <p className="reader-hint">支持普通文章页；需要登录、靠脚本加载或只给内网地址的页面读不到。</p>
    {error && <p className="reader-error" role="alert">{error}</p>}

    {result && <div className="reader-grid">
      <article className="reader-article" aria-labelledby="reader-title">
        <p className="reader-meta"><span className="reader-site">{result.site}</span><i aria-hidden="true">·</i><Clock size={12} aria-hidden="true" />{result.minutes} 分钟<i aria-hidden="true">·</i>{result.characters.toLocaleString('zh-CN')} 字</p>
        <h2 id="reader-title">{result.title}</h2>
        <div className="reader-body">{result.paragraphs.map((paragraph, index) => <p key={index}>{paragraph}</p>)}</div>
        <div className="reader-actions">
          <button type="button" className="reader-btn reader-btn--primary" onClick={() => { void copyText(plainText).then(ok => flash(ok ? '已复制正文' : '复制失败，请手动选择')) }}><Copy size={14} aria-hidden="true" />复制正文</button>
          <button type="button" className="reader-btn" onClick={() => { void copyText(summaryText).then(ok => flash(ok ? '已复制摘要' : '复制失败')) }}><FileText size={14} aria-hidden="true" />复制摘要</button>
          <a className="reader-btn" href={result.url} target="_blank" rel="noreferrer noopener">打开原网页</a>
        </div>
        {notice && <p className="reader-notice" role="status">{notice}</p>}
      </article>

      <aside className="reader-side" aria-label="摘要与最近读取">
        <section className="reader-card">
          <h3>摘要</h3>
          <p className="reader-summary">{result.summary}</p>
        </section>
        <section className="reader-card">
          <div className="reader-card__head">
            <h3>最近读取</h3>
            {history.length > 0 && <button type="button" className="reader-clear" onClick={() => setHistory([])}><Trash2 size={12} aria-hidden="true" />清空</button>}
          </div>
          {history.length === 0
            ? <p className="reader-empty">读过的链接会记在这里，只存在本机。</p>
            : <ul className="reader-history">{history.map(item => <li key={item.url}>
              <button type="button" onClick={() => { void read(item.url) }}>
                <span className="reader-history__title">{item.title}</span>
                <span className="reader-history__meta">{item.site}<i aria-hidden="true">·</i>{new Date(item.at).toLocaleDateString('zh-CN')}</span>
              </button>
            </li>)}</ul>}
        </section>
      </aside>
    </div>}

    {!result && !busy && <p className="reader-placeholder">还没有读取内容。上面粘一个链接试试。</p>}
  </main>
}
