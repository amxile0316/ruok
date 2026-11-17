// Added by the RUOK fork on 2026-11-17: 动效库 module page. Live CSS previews, copyable snippets.
import { useMemo, useState } from 'react'
import { Link } from 'react-router'
import { Check, Copy, Play } from 'lucide-react'
import { MOTION_GROUPS, MOTION_PRESETS, motionStyleSheet, presetSnippet, type MotionGroup } from './presets'
import { copyText } from '@/workspace/clipboard'
import './motion.css'

type Filter = 'all' | MotionGroup


function MotionTile({ preset, onCopy, copied }: { preset: (typeof MOTION_PRESETS)[number]; onCopy: (preset: (typeof MOTION_PRESETS)[number]) => void; copied: boolean }) {
  const [run, setRun] = useState(0)
  return <li className="motion-card">
    <button type="button" className="motion-stage" onClick={() => setRun(value => value + 1)} aria-label={`重播：${preset.name}`}>
      <span className="motion-stage__grid" aria-hidden="true" />
      <span key={run} className={`motion-demo mv-${preset.id}`}>
        <span className="motion-demo__mark">RUOK</span>
      </span>
      <span className="motion-stage__hint"><Play size={11} aria-hidden="true" />重播</span>
    </button>
    <div className="motion-card__body">
      <div className="motion-card__top">
        <h3>{preset.name}</h3>
        <span className="motion-tag">{preset.group}</span>
      </div>
      <p>{preset.description}</p>
      <p className="motion-spec">{preset.duration} ms<i aria-hidden="true">·</i>{preset.easing}{preset.infinite ? <><i aria-hidden="true">·</i>循环</> : null}</p>
      <button type="button" className="motion-copy" data-done={copied || undefined} onClick={() => onCopy(preset)}>
        {copied ? <Check size={13} aria-hidden="true" /> : <Copy size={13} aria-hidden="true" />}
        {copied ? '已复制 CSS' : '复制 CSS'}
      </button>
    </div>
  </li>
}

export default function MotionPage() {
  const [filter, setFilter] = useState<Filter>('all')
  const [copied, setCopied] = useState('')
  const [notice, setNotice] = useState('')
  const style = useMemo(motionStyleSheet, [])
  const visible = filter === 'all' ? MOTION_PRESETS : MOTION_PRESETS.filter(preset => preset.group === filter)

  const copy = (preset: (typeof MOTION_PRESETS)[number]) => {
    void copyText(presetSnippet(preset)).then(ok => {
      setCopied(ok ? preset.id : '')
      setNotice(ok ? `已复制「${preset.name}」的 CSS` : '复制失败，请手动选择')
      window.setTimeout(() => { setCopied(''); setNotice('') }, 1800)
    })
  }

  return <main className="motion-page">
    <style>{style}</style>
    <header className="motion-head">
      <div>
        <p className="motion-kicker">动效 · 纯 CSS</p>
        <h1>动效库</h1>
        <p className="motion-lede">一组可以直接抄走的 CSS 动效：入场、强调、循环。点预览重播，点「复制 CSS」拿走 keyframes 和类名，粘到自己的页面里就能用。不依赖任何动画库。</p>
      </div>
      <Link className="motion-ghost" to="/">返回首页</Link>
    </header>

    <div className="motion-filters" role="group" aria-label="按动效类型筛选">
      {(['all', ...MOTION_GROUPS] as Filter[]).map(value => <button key={value} type="button" aria-pressed={filter === value} onClick={() => setFilter(value)}>
        {value === 'all' ? '全部' : value}
        <span className="motion-count">{value === 'all' ? MOTION_PRESETS.length : MOTION_PRESETS.filter(preset => preset.group === value).length}</span>
      </button>)}
    </div>

    <ul className="motion-grid">{visible.map(preset => <MotionTile key={preset.id} preset={preset} onCopy={copy} copied={copied === preset.id} />)}</ul>

    <section className="motion-usage">
      <h2>怎么用</h2>
      <p>复制的片段里已经有 <code>@keyframes</code> 和类名，把类名加到元素上就会播放一次（循环类的会一直播放）。需要延迟时在 <code>animation-delay</code> 上让步，不要改 keyframes。</p>
      <p>系统开启「减少动态效果」时，记得用 <code>@media (prefers-reduced-motion: reduce)</code> 关掉动画，和本应用其他动效一致。</p>
    </section>
    {notice && <p className="motion-notice" role="status">{notice}</p>}
  </main>
}
