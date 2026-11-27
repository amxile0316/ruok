// Modified by the RUOK fork on 2026-11-17: rebrand and upstream/Pro cleanup.
import { QuickEditLive, type QuickEditActivity } from '@/workspace/QuickEditLive'
import { QuickEdit } from '@/workspace/QuickEdit'
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type RefObject } from 'react'
import { Link, useSearchParams } from 'react-router'
import { ChevronDown, ChevronRight, X } from 'lucide-react'
import { toast } from 'sonner'
import { GENERAL_EDIT_PATH, MODULE_ONLY_LABELS, groupedModules } from '@/workspace/modules'
import { MODULE_ICONS } from '@/workspace/module-icons'
import { PROJECT_KIND_LABELS, formatProjectDate, isGeneralProject, libraryKey, mergeProjectLibrary, projectKind, recentProjects, type GeneralLibraryProject, type ProjectKindFilter } from '@/workspace/project-kind'
import { generalApi } from '@/general/general-api'
import { GeneralHomeCard } from '@/general/GeneralLibraryCards'
import { mediaUrl } from '@/studio/api'
import type { EditProject } from '@/types'
import { formatProjectDuration } from '@/studio/project-duration'
import '@/workspace/workspace-home.css'
import { DeployStrip } from '@/onboarding/DeployWizard'
import {homeHasKoubo, loadHomeEditorProjects} from '@/workspace/home-edition'

/** Parallax and entrances run only here; reduced motion or a small window lays the page out flat (same query as the CSS). */
const MOTION_QUERY = '(prefers-reduced-motion: no-preference) and (min-width: 760px) and (min-height: 560px)'
const motionOn = () => typeof window.matchMedia === 'function' && window.matchMedia(MOTION_QUERY).matches
const EASE = 'cubic-bezier(.2,.8,.2,1)'
const PROJECT_FILTERS: { value: ProjectKindFilter; label: string }[] = [
  { value: 'all', label: '全部' }, ...(homeHasKoubo ? [{ value: 'koubo' as const, label: PROJECT_KIND_LABELS.koubo }] : []), { value: 'general', label: PROJECT_KIND_LABELS.general },
]
const MODULE_SIDES = { prepare: 'left', make: 'center', review: 'right' } as const

/** One entrance: transform and opacity only, removed once finished so the CSS end state takes over. */
function slideIn(element: Element, from: string, delay: number) {
  const timing = { delay, fill: 'both' as const }
  for (const animation of [
    element.animate([{ transform: from }, { transform: 'translate3d(0,0,0) scale(1)' }], { ...timing, duration: 900, easing: EASE }),
    element.animate([{ opacity: 0 }, { opacity: 1 }], { ...timing, duration: 700, easing: 'ease' }),
  ]) void animation.finished.then(() => animation.cancel(), () => {})
}
function playProjects(root: HTMLElement) {
  root.querySelectorAll('.home-project').forEach((card, index) => slideIn(card, 'translate3d(0,24px,0) scale(1)', index * 70))
}
/** 准备 slides in from the left, 复盘 from the right, then 制作 rises and opens outward from its middle card. */
function playModules(root: HTMLElement) {
  for (const group of root.querySelectorAll<HTMLElement>('[data-side]')) {
    const head = group.querySelector('.home-module-group__head'), cards = [...group.querySelectorAll('.home-module')]
    // far enough to read as coming in from the sides, not as a small settle
    if (group.dataset.side === 'left') {
      if (head) slideIn(head, 'translate3d(-140px,0,0) scale(1)', 0)
      cards.forEach((card, index) => slideIn(card, 'translate3d(-200px,0,0) scale(1)', 60 + index * 70))
    } else if (group.dataset.side === 'right') {
      if (head) slideIn(head, 'translate3d(140px,0,0) scale(1)', 0)
      cards.forEach(card => slideIn(card, 'translate3d(200px,0,0) scale(1)', 60))
    } else {
      if (head) slideIn(head, 'translate3d(0,0,0) scale(.92)', 280)
      const middle = (cards.length - 1) / 2
      cards.forEach((card, index) => slideIn(card, `translate3d(${Math.sign(middle - index) * 96}px,0,0) scale(.92)`, 320 + Math.abs(index - middle) * 90))
    }
  }
}

/** 'pending' keeps a block hidden (CSS, motion mode only) until a third of it is on screen; a fast jump past it shows it at once.
 *  Once the block is wholly below the screen again (scrolled back up), it goes back to 'pending' so the entrance plays every time. */
function useReveal(ref: RefObject<HTMLElement | null>, ready: boolean, play: (root: HTMLElement) => void) {
  const [state, setState] = useState<'pending' | 'done'>(() => motionOn() ? 'pending' : 'done')
  useEffect(() => {
    const root = ref.current
    if (!root || !ready || state !== 'done' || !motionOn()) return
    const observer = new IntersectionObserver(entries => {
      if (entries.some(entry => !entry.isIntersecting && entry.boundingClientRect.top >= window.innerHeight)) setState('pending')
    })
    observer.observe(root)
    return () => observer.disconnect()
  }, [ref, ready, state])
  useEffect(() => {
    const root = ref.current
    if (!root || !ready || state === 'done') return
    let finished = false
    const finish = (animate: boolean) => {
      if (finished) return
      finished = true
      if (animate && motionOn()) play(root)
      setState('done')
    }
    const observer = new IntersectionObserver(entries => { if (entries.some(entry => entry.isIntersecting)) finish(true) }, { rootMargin: '0px 0px -10% 0px', threshold: 0.3 })
    observer.observe(root)
    const passed = () => { if (root.getBoundingClientRect().bottom < 0) finish(false) }
    window.addEventListener('scroll', passed, { passive: true })
    return () => { observer.disconnect(); window.removeEventListener('scroll', passed) }
  }, [ref, ready, state, play])
  return state
}

/**
 * The parallax, written once per frame. CSS scroll timelines did not run in the desktop app, so this drives it everywhere,
 * and it reads the scroll from whichever element scrolls the page (the window, or a container around the home page).
 */
function useParallax(ref: RefObject<HTMLElement | null>) {
  useEffect(() => {
    const root = ref.current
    if (!root) return
    root.classList.add('home--js-parallax')
    const pick = (selector: string) => root.querySelector<HTMLElement>(selector)
    const hero = pick('.home-hero'), dim = pick('.home-hero__dim'), hint = pick('.home-hero__hint'), shield = pick('.home-shield')
    const backdrop = pick('.home-ambient')
    // The clips stay whole in their frames (an inner drift would crop the picture-in-picture and the small card).
    const layers = [hero, dim, hint, shield, backdrop].filter((layer): layer is HTMLElement => !!layer)
    const media = window.matchMedia(MOTION_QUERY)
    let frame = 0
    let scroller: Element | null = null
    const paint = () => {
      frame = 0
      if (!media.matches || !hero) { for (const layer of layers) { layer.style.transform = ''; layer.style.opacity = '' } return }
      const top = scroller ? scroller.scrollTop : window.scrollY
      const height = window.innerHeight, y = Math.min(Math.max(top, 0), height), progress = y / height
      hero.style.transform = `translate3d(0,${-0.45 * y}px,0) scale(${1 - 0.06 * progress})`
      // the cards stay nearly opaque (the studio shot behind would show through them); the dim layer does the receding
      hero.style.opacity = String(1 - 0.2 * progress)
      if (dim) dim.style.opacity = String(progress)
      if (hint) hint.style.opacity = String(Math.max(0, 1 - y / (0.22 * height)))
      if (shield) shield.style.opacity = String(Math.min(1, y / (0.15 * height)))
      // three depths: the studio shot drifts at 0.15×, the entrances at 0.45×, the content sheet at full speed
      if (backdrop) { backdrop.style.transform = `translate3d(0,${-0.15 * y}px,0)`; backdrop.style.opacity = String(1 - 0.5 * progress) }    }
    const queue = () => { if (!frame) frame = requestAnimationFrame(paint) }
    // Scroll events of containers do not bubble, so listen in the capture phase; only an ancestor of the home page counts.
    const scrolled = (event: Event) => {
      const target = event.target
      scroller = target instanceof Element && target !== document.documentElement && target.contains(root) ? target : null
      queue()
    }
    document.addEventListener('scroll', scrolled, { capture: true, passive: true }); window.addEventListener('resize', queue); media.addEventListener('change', queue)
    paint()
    return () => {
      cancelAnimationFrame(frame)
      document.removeEventListener('scroll', scrolled, { capture: true }); window.removeEventListener('resize', queue); media.removeEventListener('change', queue)
      root.classList.remove('home--js-parallax')
      for (const layer of layers) { layer.style.transform = ''; layer.style.opacity = '' }
    }
  }, [ref])
}

const BARS = [6, 14, 9, 22, 13, 30, 10, 18, 38, 16, 26, 44, 12, 20, 34, 15, 8, 24, 11, 17]

/** Each entrance carries its own line drawing: no shared brand mark, no two cards looking the same. */
function HomeVignette({ kind }: { kind: 'koubo' | 'general' | 'publish' }) {
  return <div className="home-media" aria-hidden="true">
    <div className="home-vignette">
      {kind === 'koubo' && <svg viewBox="0 0 320 180" focusable="false">
        <g fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round">
          <line x1="18" y1="126" x2="302" y2="126" opacity=".4" />
          {BARS.map((height, index) => <line key={index} x1={38 + index * 13} y1={126 - height} x2={38 + index * 13} y2="126" opacity={index === 9 ? 1 : .55} className={index === 9 ? 'home-vignette__accent' : undefined} />)}
          <rect x="20" y="142" width="92" height="16" rx="8" opacity=".35" />
          <line x1="30" y1="150" x2="86" y2="150" opacity=".5" />
        </g>
        <g className="home-vignette__accent" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
          <line x1="200" y1="36" x2="200" y2="126" opacity=".75" />
          <path d="M200 26 l5 9 h-10 z" fill="currentColor" stroke="none" />
          <line x1="20" y1="150" x2="52" y2="150" />
        </g>
      </svg>}
      {kind === 'general' && <svg viewBox="0 0 320 180" focusable="false">
        <g fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round">
          <rect x="24" y="54" width="146" height="80" rx="8" opacity=".28" />
          <rect x="62" y="40" width="146" height="80" rx="8" opacity=".55" />
          <line x1="80" y1="62" x2="140" y2="62" opacity=".5" />
          <line x1="80" y1="74" x2="116" y2="74" opacity=".35" />
        </g>
        <rect x="98" y="26" width="146" height="80" rx="8" fill="none" stroke="currentColor" strokeWidth="1.6" />
        <g fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round">
          <line x1="116" y1="50" x2="184" y2="50" opacity=".6" />
          <line x1="116" y1="62" x2="156" y2="62" opacity=".4" />
          <line x1="116" y1="74" x2="200" y2="74" opacity=".4" />
          {[0, 1, 2, 3].map(row => [0, 1, 2, 3, 4].map(col => <circle key={`${row}-${col}`} cx={40 + col * 9} cy={148 + row * 9} r="1.2" opacity=".3" />))}
        </g>
        <path className="home-vignette__accent" d="M252 92 v26 l7-7 5 10 6-3 -5-10 9-1 z" fill="currentColor" stroke="none" />
      </svg>}
      {kind === 'publish' && <svg viewBox="0 0 320 180" focusable="false">
        <g fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round">
          <rect x="58" y="26" width="116" height="128" rx="10" />
          <line x1="76" y1="56" x2="156" y2="56" opacity=".6" />
          <line x1="76" y1="74" x2="134" y2="74" opacity=".45" />
          <line x1="76" y1="92" x2="150" y2="92" opacity=".45" />
          <line x1="76" y1="110" x2="118" y2="110" opacity=".35" />
          <rect x="76" y="126" width="46" height="12" rx="6" opacity=".4" />
          <rect x="206" y="56" width="62" height="18" rx="9" opacity=".45" />
          <rect x="206" y="84" width="62" height="18" rx="9" opacity=".3" />
          <rect x="206" y="112" width="62" height="18" rx="9" opacity=".3" />
          <circle cx="217" cy="65" r="2.4" opacity=".6" />
          <circle cx="217" cy="93" r="2.4" opacity=".6" />
          <circle cx="217" cy="121" r="2.4" opacity=".6" />
        </g>
        <line className="home-vignette__accent" x1="158" y1="82" x2="158" y2="102" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      </svg>}
    </div>
  </div>
}

function ModuleCard({ module }: { module: ReturnType<typeof groupedModules>[number]['modules'][number] }) {
  const Icon = MODULE_ICONS[module.id]
  const pro = 'pro' in module && module.pro === true
  return <li><Link className="home-module" data-pro={pro || undefined} to={module.path} title={module.description}>
    <span className="home-module__media" aria-hidden="true">
      <Icon size={26} strokeWidth={1.4} />
    </span>
    <span className="home-module__top"><Icon size={18} strokeWidth={1.6} aria-hidden="true" />{module.only && <span className="home-only"><i className="home-dot" data-kind={module.only} aria-hidden="true" />{MODULE_ONLY_LABELS[module.only]}</span>}</span>
    {pro && <span className="home-only standard-pro-badge">未包含</span>}
    <span className="home-module__name">{module.shortName}</span>
    <span className="home-module__brief">{module.brief}</span>
  </Link></li>
}

function projectThumbnail(project: EditProject) {
  const firstClip = project.timeline.tracks.filter(t => !t.hidden && (t.kind === 'video' || t.kind === 'proxy'))
    .flatMap(t => t.clips).filter(c => project.media.some(m => m.id === c.assetId && m.type === 'video'))
    .sort((a, b) => a.start - b.start)[0]
  const asset = project.media.find(m => m.id === firstClip?.assetId)
    || project.media.find(m => m.type === 'video' && m.thumbnailFile)
    || project.media.find(m => m.type === 'image')
  return asset?.thumbnailFile ? mediaUrl(project.id, asset.id, 'thumbnail') : asset?.type === 'image' ? mediaUrl(project.id, asset.id, 'original') : ''
}

function ProjectCard({ project }: { project: EditProject }) {
  const url = projectThumbnail(project)
  const [failedUrl, setFailedUrl] = useState('')
  const kind = projectKind(project)
  return <li className="home-project">
    <Link to={`/studio/projects/${project.id}`} onClick={event => {
      if (!project.storageOffline) return
      event.preventDefault(); toast.info('工程所在硬盘未连接，请重新连接')
    }}>
      <div className="home-thumb">{url && failedUrl !== url ? <img src={url} alt="" loading="lazy" onError={() => setFailedUrl(url)} /> : <span>暂无画面</span>}</div>
      <h3 title={project.name}>{project.name}</h3>
      <p className="home-meta"><i className="home-dot" data-kind={kind} aria-hidden="true" />{PROJECT_KIND_LABELS[kind]}<span aria-hidden="true">·</span>{formatProjectDuration(project.timeline)}<span aria-hidden="true">·</span>{formatProjectDate(project.updatedAt)}</p>
    </Link>
  </li>
}

function HomeProjects({ refreshKey }: { refreshKey: number }) {
  const [projects, setProjects] = useState<(EditProject | GeneralLibraryProject)[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [filter, setFilter] = useState<ProjectKindFilter>('all')
  const row = useRef<HTMLDivElement>(null)
  useEffect(() => {
    let active = true
    // Both kinds share one row. Any library failure remains visible instead of impersonating an empty library.
    const load = () => void Promise.all([loadHomeEditorProjects(), generalApi.list()])
      .then(([koubo, general]) => { if (active) { setProjects(mergeProjectLibrary(koubo, general)); setError('') } })
      .catch(e => { if (active) setError(e instanceof Error ? e.message : String(e)) })
      .finally(() => { if (active) setLoading(false) })
    load(); window.addEventListener('workspace-projects-changed', load)
    return () => { active = false; window.removeEventListener('workspace-projects-changed', load) }
  }, [refreshKey])
  const reveal = useReveal(row, !loading, playProjects)
  const visible = recentProjects(projects, filter, 6)
  return <section className="home-section home-projects" aria-labelledby="home-projects-title">
    <div className="home-section__head">
      <h2 id="home-projects-title">我的工程</h2>
      <div className="home-tools">
        <div className="home-filter" role="group" aria-label="按工程类型筛选">{PROJECT_FILTERS.map(item =>
          <button key={item.value} type="button" aria-pressed={filter === item.value} onClick={() => setFilter(item.value)}>
            {item.value !== 'all' && <i className="home-dot" data-kind={item.value} aria-hidden="true" />}{item.label}
          </button>)}
        </div>
        <Link className="home-all" to="/studio">查看全部<ChevronRight size={16} aria-hidden="true" /></Link>
      </div>
    </div>
    <div ref={row} className="home-projects__body" data-reveal={reveal}>
      {loading ? <p className="home-empty" role="status">正在读取工程…</p>
        : error ? <p className="home-empty" role="alert">工程暂时无法读取：{error}</p>
        : visible.length ? <ul className="home-project-row">{visible.map(project => isGeneralProject(project)
          ? <GeneralHomeCard key={libraryKey(project)} project={project} />
          : <ProjectCard key={libraryKey(project)} project={project as EditProject} />)}</ul>
        : <p className="home-empty">{filter === 'general' ? '还没有通用工程。' : '还没有工程，从上方新建一个。'}</p>}
    </div>
  </section>
}

/** One column per module, an 8px track between groups; built from the group sizes so moving a module keeps the rows aligned. */
function moduleColumns(groups: ReturnType<typeof groupedModules>) {
  return {
    '--home-module-cols': groups.map(group => `repeat(${group.modules.length},minmax(0,1fr))`).join(' 8px '),
    '--home-module-max': Math.max(...groups.map(group => group.modules.length)),
  } as CSSProperties
}
function groupSpan(groups: ReturnType<typeof groupedModules>, index: number) {
  const start = groups.slice(0, index).reduce((line, group) => line + group.modules.length + 1, 1)
  return `${start} / ${start + groups[index].modules.length}`
}

function HomeModules() {
  const grid = useRef<HTMLDivElement>(null)
  const groups = groupedModules()
  const reveal = useReveal(grid, true, playModules)
  return <section className="home-section home-modules" aria-labelledby="home-modules-title">
    <div className="home-section__head"><h2 id="home-modules-title">全部模块</h2></div>
    <div ref={grid} className="home-module-groups" data-reveal={reveal} style={moduleColumns(groups)}>
      {groups.map((group, index) => <section key={group.id} className="home-module-group" data-group={group.id} data-side={MODULE_SIDES[group.id]} style={{ '--home-group-cols': groupSpan(groups, index) } as CSSProperties} aria-labelledby={`home-group-${group.id}`}>
        <h3 id={`home-group-${group.id}`} className="home-module-group__head">{group.label}</h3>
        <ul className="home-module-list">{group.modules.map(module => <ModuleCard key={module.id} module={module} />)}</ul>
      </section>)}
    </div>
  </section>
}

/** The existing 一键剪辑 intake, unchanged, in a sheet under the top bar. It stays mounted while the home page is open,
 *  so closing the sheet only hides it and a running job keeps going exactly as it did on the old home page. */
function HomeIntake({ open, onClose, onActivity, activity }: { open: boolean; onClose: () => void; onActivity: (value: QuickEditActivity | null) => void; activity: QuickEditActivity | null }) {
  const panel = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    document.documentElement.classList.add('home-intake-open')
    panel.current?.focus({ preventScroll: true })
    return () => document.documentElement.classList.remove('home-intake-open')
  }, [open])
  return <div id="home-intake" className="home-intake" hidden={!open}>
    <div className="home-intake__backdrop" aria-hidden="true" onClick={onClose} />
    <div ref={panel} className="home-intake__panel" role="dialog" aria-modal="false" aria-label="新建口播工程 · 一键剪辑" tabIndex={-1}
      onKeyDown={event => {
        // Escape inside nested dialogs (portals) or the live panel is theirs to handle.
        if (event.key !== 'Escape' || event.defaultPrevented || !panel.current?.contains(event.target as Node)) return
        event.preventDefault(); onClose()
      }}>
      <div className="home-intake__bar"><button type="button" className="home-intake__close" onClick={onClose}><X size={16} aria-hidden="true" />收起</button></div>
      <div className="home-intake__body">
        <QuickEdit onActivity={onActivity} />
        <div className="home-intake__live"><QuickEditLive activity={activity} /></div>
      </div>
    </div>
  </div>
}

export default function WorkspaceHome() {
  const root = useRef<HTMLElement>(null)
  const kouboButton = useRef<HTMLButtonElement>(null)
  const [activity, setActivity] = useState<QuickEditActivity | null>(null)
  // ?intake=1 opens 一键剪辑 at once (拿去剪 › 口播剪辑 from 文案发布)
  const [params, setParams] = useSearchParams()
  const [intakeOpen, setIntakeOpen] = useState(() => homeHasKoubo && params.get('intake') === '1')
  useEffect(() => { if (params.has('intake')) setParams({}, { replace: true }) }, [params, setParams])
  const [projectsKey, setProjectsKey] = useState(0)
  useLayoutEffect(() => { window.scrollTo(0, 0) }, [])
  useParallax(root)
  const closeIntake = useCallback(() => {
    setIntakeOpen(false); setProjectsKey(key => key + 1)
    requestAnimationFrame(() => kouboButton.current?.focus({ preventScroll: true }))
  }, [])
  const status = activity ? activity.busy ? '一键剪辑正在处理' : activity.error ? '一键剪辑已暂停' : '一键剪辑等待继续' : ''
  return <main ref={root} className="home">
    {/* a drawn ground, not a photograph: two faint glows over near-black, so the entrances sit on a calm surface */}
    <div className="home-ambient" aria-hidden="true" />
    <h1 className="sr-only">RUOK 首页</h1>
    <div className="home-shield" aria-hidden="true" />
    <div className="home-hero" inert={intakeOpen}>
      <DeployStrip />
      <div className="home-entries">
        <section className="home-entry" data-pro={!homeHasKoubo || undefined} data-kind="koubo" aria-labelledby="home-entry-koubo">
          <div>
            <p className="home-entry__eyebrow"><i className="home-dot" data-kind="koubo" aria-hidden="true" />专业 · 极致可控</p>
            <h2 id="home-entry-koubo">口播剪辑{!homeHasKoubo && <span className="home-only standard-pro-badge">未包含</span>}</h2>
            <p className="home-entry__line">导入口播原片，粗剪、动效、配乐，每一步都能精细调整。</p>
            <div className="home-entry__actions">
              {homeHasKoubo ? <button ref={kouboButton} type="button" className="home-entry__button" aria-haspopup="dialog" aria-expanded={intakeOpen} aria-controls="home-intake" onClick={() => setIntakeOpen(true)}>新建口播工程<ChevronRight size={16} aria-hidden="true" /></button> : <button type="button" className="home-entry__button" disabled>本分支未包含口播剪辑</button>}
              {status && <span className="home-entry__status" role="status"><i className="home-dot" data-kind="koubo" aria-hidden="true" />{status}</span>}
            </div>
          </div>
          <HomeVignette kind="koubo" />
        </section>
        <section className="home-entry" data-kind="general" aria-labelledby="home-entry-general">
          <div>
            <p className="home-entry__eyebrow"><i className="home-dot" data-kind="general" aria-hidden="true" />简单 · 一句话出片</p>
            <h2 id="home-entry-general">通用剪辑</h2>
            <p className="home-entry__line">选一个风格，放进视频或文案，Agent 帮你做成片。</p>
            <div className="home-entry__actions">
              <Link className="home-entry__button" to={GENERAL_EDIT_PATH}>新建通用工程<ChevronRight size={16} aria-hidden="true" /></Link>
            </div>
          </div>
          <HomeVignette kind="general" />
        </section>
        <section className="home-entry" data-pro={!homeHasKoubo || undefined} data-kind="publish" aria-labelledby="home-entry-publish">
          <div>
            <p className="home-entry__eyebrow"><i className="home-dot" data-kind="publish" aria-hidden="true" />写好 · 发出去</p>
            <h2 id="home-entry-publish">文案发布{!homeHasKoubo && <span className="home-only standard-pro-badge">未包含</span>}</h2>
            <p className="home-entry__line">写稿、审核、标题简介、封面，一键填进各平台发布页。</p>
            <div className="home-entry__actions">
              {homeHasKoubo ? <Link className="home-entry__button" to="/publish">新建稿子<ChevronRight size={16} aria-hidden="true" /></Link> : <button type="button" className="home-entry__button" disabled>本分支未包含文案发布</button>}
            </div>
          </div>
          <HomeVignette kind="publish" />
        </section>
      </div>
      <div className="home-hero__dim" aria-hidden="true" />
      <div className="home-hero__hint" aria-hidden="true"><span>向下滚动<ChevronDown size={16} /></span></div>
    </div>
    <div className="home-spacer" aria-hidden="true" />
    <div className="home-sheet" inert={intakeOpen}>
      <HomeProjects refreshKey={projectsKey} />
      <HomeModules />
    </div>
    {homeHasKoubo && <HomeIntake open={intakeOpen} onClose={closeIntake} onActivity={setActivity} activity={activity} />}
  </main>
}
