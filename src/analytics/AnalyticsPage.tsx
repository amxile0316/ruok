import {useEffect,useMemo,useRef,useState} from 'react'
import {Link} from 'react-router'
import {attribute,emptyWork,metricsOf,parseCsv,PLATFORMS,summarize,suggestions,trend,type Work} from './model.ts'
import './analytics.css'

const STORE = 'ruok.analytics.works.v1'
const pct = (value: number) => `${(value * 100).toFixed(1)}%`
const compact = (value: number) => (value >= 10000 ? `${(value / 10000).toFixed(1)} 万` : String(value))

function loadWorks(): Work[] {
  try {
    const raw = localStorage.getItem(STORE)
    const parsed = raw ? JSON.parse(raw) : []
    return Array.isArray(parsed) ? parsed.filter(item => item && typeof item.title === 'string') : []
  } catch { return [] }
}

function BarChart({ works }: { works: Work[] }) {
  const rows = [...works].sort((a, b) => b.views - a.views).slice(0, 8)
  const max = Math.max(1, ...rows.map(work => work.views))
  return <div className="an-bars">
    {rows.map(work => (
      <div key={work.id} className="an-bar">
        <span className="an-bar__label" title={work.title}>{work.title}</span>
        <span className="an-bar__track"><i style={{width: `${Math.max(3, work.views / max * 100)}%`}} /></span>
        <b>{compact(work.views)}</b>
      </div>
    ))}
  </div>
}

function TrendChart({ works }: { works: Work[] }) {
  const rows = trend(works)
  if (rows.length < 2) return <p className="an-empty">至少两条带日期的作品才画趋势。</p>
  const width = 640, height = 200, pad = 22
  const max = Math.max(1, ...rows.map(work => work.views))
  const step = (width - pad * 2) / (rows.length - 1)
  const points = rows.map((work, index) => `${pad + index * step},${height - pad - work.views / max * (height - pad * 2)}`).join(' ')
  return <svg className="an-trend" viewBox={`0 0 ${width} ${height}`} role="img" aria-label="按发布日期排列的播放趋势">
    <line x1={pad} y1={height - pad} x2={width - pad} y2={height - pad} className="an-axis" />
    <polyline points={points} className="an-line" />
    {rows.map((work, index) => (
      <circle key={work.id} cx={pad + index * step} cy={height - pad - work.views / max * (height - pad * 2)} r={3.4} className="an-dot">
        <title>{`${work.publishedAt} · ${work.title} · ${work.views} 播放`}</title>
      </circle>
    ))}
  </svg>
}

export default function AnalyticsPage() {
  const [works, setWorks] = useState<Work[]>(loadWorks)
  const [selected, setSelected] = useState('')
  const [draft, setDraft] = useState<Omit<Work, 'id'> | null>(null)
  const [dimension, setDimension] = useState<'style' | 'hook' | 'topic' | 'bucket'>('style')
  const [message, setMessage] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => { localStorage.setItem(STORE, JSON.stringify(works)) }, [works])
  useEffect(() => { if (!selected && works.length) setSelected(works[0].id) }, [works, selected])

  const stats = useMemo(() => summarize(works), [works])
  const current = works.find(work => work.id === selected) ?? null
  const groups = useMemo(() => attribute(works, dimension), [works, dimension])
  const advice = useMemo(() => suggestions(works), [works])

  const flash = (text: string) => { setMessage(text); setTimeout(() => setMessage(''), 2600) }

  const save = () => {
    if (!draft) return
    if (!draft.title.trim()) return flash('先填作品标题')
    setWorks(rows => [...rows, {...draft, title: draft.title.trim(), id: crypto.randomUUID()}])
    setDraft(null)
    flash('已录入一条作品')
  }

  const remove = (id: string) => {
    setWorks(rows => rows.filter(work => work.id !== id))
    if (selected === id) setSelected('')
  }

  const importCsv = async (file: File | undefined) => {
    if (!file) return
    const {works: rows, skipped} = parseCsv(await file.text())
    if (!rows.length) return flash('CSV 里没有识别到作品，检查表头是否有「标题」')
    setWorks(current => [...current, ...rows.map(row => ({...row, id: crypto.randomUUID()}))])
    flash(`导入 ${rows.length} 条${skipped ? `，跳过 ${skipped} 行` : ''}`)
  }

  const exportCsv = () => {
    const header = '标题,平台,发布日期,时长,风格,钩子,题材,播放,点赞,评论,转发,收藏,涨粉'
    const body = works.map(work => [work.title, work.platform, work.publishedAt, work.durationSec, work.style, work.hook, work.topic, work.views, work.likes, work.comments, work.shares, work.saves, work.follows].map(value => `"${String(value).replace(/"/g, '""')}"`).join(','))
    const url = URL.createObjectURL(new Blob([[header, ...body].join('\n')], {type: 'text/csv'}))
    const link = document.createElement('a')
    link.href = url; link.download = '作品数据.csv'; link.click()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }

  const field = (label: string, key: keyof Omit<Work, 'id'>, type: 'text' | 'number' | 'date' = 'text') => (
    <label className="an-field">
      <span>{label}</span>
      <input
        type={type}
        value={draft ? String(draft[key] ?? '') : ''}
        onChange={event => setDraft(value => (value ? {...value, [key]: type === 'number' ? Number(event.target.value) : event.target.value} : value))}
      />
    </label>
  )

  return (
    <main className="an-page">
      <header className="an-head">
        <div>
          <p className="an-kicker">运营 · 本地计算</p>
          <h1>运营分析</h1>
          <p className="an-lede">手动录入或导入 CSV，记录每条作品的播放与互动；对比作品、看趋势、按内容维度归因。数据只存本机浏览器。</p>
        </div>
        <div className="an-head__actions">
          <button type="button" className="an-btn" onClick={() => fileRef.current?.click()}>导入 CSV</button>
          <input ref={fileRef} type="file" accept=".csv,text/csv" hidden onChange={event => { void importCsv(event.target.files?.[0]); event.target.value = '' }} />
          <button type="button" className="an-btn an-btn--primary" onClick={() => setDraft(emptyWork())}>录入作品</button>
          <Link className="an-btn" to="/">返回首页</Link>
        </div>
      </header>

      {message && <p className="an-toast" role="status">{message}</p>}

      <section className="an-kpis">
        <div><span>作品</span><b>{stats.count}</b></div>
        <div><span>总播放</span><b>{compact(stats.views)}</b></div>
        <div><span>平均互动率</span><b>{pct(stats.engagement)}</b></div>
        <div><span>播放中位数</span><b>{compact(Math.round(stats.medianViews))}</b></div>
      </section>

      {draft && (
        <section className="an-panel an-form">
          <h2>录入作品</h2>
          <div className="an-fields">
            {field('标题', 'title')}
            <label className="an-field"><span>平台</span>
              <select value={draft.platform} onChange={event => setDraft({...draft, platform: event.target.value})}>
                {PLATFORMS.map(platform => <option key={platform} value={platform}>{platform}</option>)}
              </select>
            </label>
            {field('发布日期', 'publishedAt', 'date')}
            {field('时长（秒）', 'durationSec', 'number')}
            {field('风格', 'style')}
            {field('开头钩子', 'hook')}
            {field('题材', 'topic')}
            {field('播放', 'views', 'number')}
            {field('点赞', 'likes', 'number')}
            {field('评论', 'comments', 'number')}
            {field('转发', 'shares', 'number')}
            {field('收藏', 'saves', 'number')}
            {field('涨粉', 'follows', 'number')}
          </div>
          <div className="an-form__actions">
            <button type="button" className="an-btn an-btn--primary" onClick={save}>保存</button>
            <button type="button" className="an-btn" onClick={() => setDraft(null)}>取消</button>
          </div>
        </section>
      )}

      <div className="an-grid">
        <section className="an-panel">
          <div className="an-panel__head"><h2>作品</h2>{works.length > 0 && <button type="button" className="an-link" onClick={exportCsv}>导出 CSV</button>}</div>
          {!works.length && <p className="an-empty">还没有作品。点「录入作品」，或导入一份带「标题,播放,点赞…」表头的 CSV。</p>}
          {works.length > 0 && (
            <ul className="an-list">
              {works.map(work => (
                <li key={work.id}>
                  <button type="button" className={work.id === selected ? 'is-on' : ''} onClick={() => setSelected(work.id)}>
                    <span className="an-list__title">{work.title}</span>
                    <span className="an-list__meta">{work.publishedAt || '未填日期'} · {work.platform} · {work.durationSec}s</span>
                  </button>
                  <span className="an-list__num">{compact(work.views)}<small>播放</small></span>
                  <span className="an-list__num">{pct(metricsOf(work).engagement)}<small>互动</small></span>
                  <button type="button" className="an-del" onClick={() => remove(work.id)} aria-label={`删除 ${work.title}`}>删除</button>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="an-panel">
          <div className="an-panel__head"><h2>{current ? '单条面板' : '总览'}</h2></div>
          {!current && <p className="an-empty">选一条作品看它的指标、内容维度和可执行建议。</p>}
          {current && (
            <>
              <h3 className="an-work-title">{current.title}</h3>
              <div className="an-metrics">
                <div><b>{compact(current.views)}</b><span>播放</span></div>
                <div><b>{compact(current.likes)}</b><span>点赞</span></div>
                <div><b>{compact(current.comments)}</b><span>评论</span></div>
                <div><b>{compact(current.shares)}</b><span>转发</span></div>
                <div><b>{compact(current.saves)}</b><span>收藏</span></div>
                <div><b>{compact(current.follows)}</b><span>涨粉</span></div>
              </div>
              <dl className="an-facts">
                <div><dt>互动率</dt><dd>{pct(metricsOf(current).engagement)}</dd></div>
                <div><dt>涨粉率</dt><dd>{pct(metricsOf(current).followRate)}</dd></div>
                <div><dt>时长</dt><dd>{current.durationSec}s · {metricsOf(current).bucket}</dd></div>
                <div><dt>风格</dt><dd>{current.style || '未标注'}</dd></div>
                <div><dt>钩子</dt><dd>{current.hook || '未标注'}</dd></div>
                <div><dt>题材</dt><dd>{current.topic || '未标注'}</dd></div>
              </dl>
            </>
          )}
        </section>
      </div>

      <div className="an-grid">
        <section className="an-panel">
          <div className="an-panel__head"><h2>跨作品对比</h2><span className="an-hint">按播放排序，最多 8 条</span></div>
          {works.length ? <BarChart works={works} /> : <p className="an-empty">录入后显示对比。</p>}
          <h2 className="an-sub">发布趋势</h2>
          <TrendChart works={works} />
        </section>

        <section className="an-panel">
          <div className="an-panel__head"><h2>内容归因</h2></div>
          <div className="an-tabs" role="group" aria-label="归因维度">
            {([['style', '风格'], ['hook', '钩子'], ['topic', '题材'], ['bucket', '时长']] as const).map(([id, label]) => (
              <button key={id} type="button" aria-pressed={dimension === id} onClick={() => setDimension(id)}>{label}</button>
            ))}
          </div>
          {groups.length ? (
            <table className="an-table">
              <thead><tr><th>{dimension === 'bucket' ? '时长' : dimension === 'style' ? '风格' : dimension === 'hook' ? '钩子' : '题材'}</th><th>条数</th><th>平均播放</th><th>平均互动率</th></tr></thead>
              <tbody>
                {groups.map(group => (
                  <tr key={group.key} className={group.key === groups[0].key ? 'is-best' : ''}>
                    <td>{group.label}</td><td>{group.count}</td><td>{compact(group.views)}</td><td>{pct(group.engagement)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : <p className="an-empty">录入风格、钩子或题材后，这里按互动率排序。</p>}
        </section>
      </div>

      <section className="an-panel an-advice">
        <div className="an-panel__head"><h2>可执行建议</h2><span className="an-hint">按当前数据自动生成</span></div>
        <ol>{advice.map(line => <li key={line}>{line}</li>)}</ol>
      </section>
    </main>
  )
}
