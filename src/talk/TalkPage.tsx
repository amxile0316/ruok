import {useEffect,useMemo,useRef,useState} from 'react'
import {Link} from 'react-router'
import {parseTranscript,planTranscript,cutListText,buildAss,talkPlacement,type TalkSentence} from '../../shared/talk.ts'
import {generalApi,announceGeneralChange,errorText} from '../general/general-api'
import type {GeneralProjectSummary} from '../general/general-contract'
import {placeTalk,type TalkPlaceResult} from './talk-api'
import './talk.css'

const clock = (value: number) => {
  const total = Math.max(0, Math.round(value))
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`
}

function download(name: string, text: string, type: string) {
  const url = URL.createObjectURL(new Blob([text], {type}))
  const link = document.createElement('a')
  link.href = url
  link.download = name
  link.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export default function TalkPage() {
  const [source, setSource] = useState('')
  const [duration, setDuration] = useState(0)
  const [mediaName, setMediaName] = useState('')
  const [mediaFile, setMediaFile] = useState<File | null>(null)
  const [mediaSize, setMediaSize] = useState({width: 0, height: 0})
  const [compact, setCompact] = useState(true)
  const [fontSize, setFontSize] = useState(46)
  const [position, setPosition] = useState<'bottom' | 'middle'>('bottom')
  const [sentences, setSentences] = useState<TalkSentence[]>([])
  const [parsed, setParsed] = useState(false)
  const [projects, setProjects] = useState<GeneralProjectSummary[]>([])
  const [projectsError, setProjectsError] = useState('')
  const [target, setTarget] = useState('')
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [placing, setPlacing] = useState(false)
  const [stage, setStage] = useState('')
  const [progress, setProgress] = useState(0)
  const [placeError, setPlaceError] = useState('')
  const [placed, setPlaced] = useState<TalkPlaceResult | null>(null)
  const mediaRef = useRef<HTMLInputElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const plan = useMemo(() => (sentences.length && duration > 0 ? planTranscript({sentences, duration, compact}) : null), [sentences, duration, compact])
  const placement = useMemo(() => (plan ? talkPlacement(plan, compact) : null), [plan, compact])

  useEffect(() => {
    let alive = true
    generalApi.list().then(
      list => { if (alive) { setProjects(list.filter(project => !project.deletedAt)); setProjectsError('') } },
      failure => { if (alive) setProjectsError(errorText(failure)) },
    )
    return () => { alive = false }
  }, [])

  useEffect(() => {
    if (!source.trim()) { setSentences([]); setParsed(false); return }
    setSentences(parseTranscript(source))
    setParsed(false)
  }, [source])

  const toggle = (id: string) => {
    setSentences(rows => rows.map(row => (row.id === id ? {...row, keep: !row.keep} : row)))
    setParsed(true)
  }

  const readMedia = (file: File | undefined) => {
    if (!file) return
    setMediaName(file.name)
    setMediaFile(file)
    setMediaSize({width: 0, height: 0})
    const element = document.createElement(file.type.startsWith('audio') ? 'audio' : 'video')
    element.preload = 'metadata'
    element.onloadedmetadata = () => {
      if (Number.isFinite(element.duration)) setDuration(Math.round(element.duration * 10) / 10)
      const video = element as HTMLVideoElement
      if (video.videoWidth > 0 && video.videoHeight > 0) setMediaSize({width: video.videoWidth, height: video.videoHeight})
      URL.revokeObjectURL(element.src)
    }
    element.src = URL.createObjectURL(file)
  }

  const importText = async (file: File | undefined) => {
    if (!file) return
    setSource(await file.text())
    if (file.name.endsWith('.srt')) {
      const parsed = parseTranscript(await file.text())
      const last = parsed.at(-1)
      if (last && last.end > 0 && !duration) setDuration(Math.ceil(last.end))
    }
  }

  const openPlace = () => {
    setTarget('')
    setPlaceError('')
    setProgress(0)
    setStage('')
    setConfirmOpen(true)
  }

  const runPlacement = async () => {
    if (!placement || !mediaFile || placing) return
    setPlacing(true)
    setPlaceError('')
    setProgress(0)
    setStage('准备工程…')
    let createdId: string | undefined
    let projectId = target
    let uploadedId: string | undefined
    try {
      if (!projectId) {
        setStage('新建通用剪辑工程…')
        const now = new Date()
        const name = `口播剪辑 ${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`
        const created = await generalApi.create({
          styleId: 'free',
          settings: {aspect: mediaSize.width > 0 && mediaSize.width < mediaSize.height ? '9:16' : '16:9', length: 'auto'},
          inputs: {kind: 'footage', text: '', note: ''},
        })
        projectId = created.id
        createdId = created.id
        await generalApi.patch(projectId, {name}).catch(() => undefined)
      }
      setStage('上传口播素材…')
      const media = await generalApi.upload(projectId, mediaFile, ratio => setProgress(ratio))
      uploadedId = media.id
      setStage('写轨道与字幕…')
      const result = await placeTalk({
        projectId,
        mediaId: media.id,
        style: {fontSize, position},
        title: `口播剪辑 · ${placement.segments.length} 段`,
        segments: placement.segments,
        captions: placement.captions,
      })
      setPlaced(result)
      setConfirmOpen(false)
      setStage('')
      announceGeneralChange()
      generalApi.list().then(list => setProjects(list.filter(project => !project.deletedAt)), () => undefined)
    } catch (failure) {
      const reason = errorText(failure)
      if (projectId && uploadedId) await generalApi.removeMedia(projectId, uploadedId).catch(() => undefined)
      if (createdId) await generalApi.remove(createdId).catch(() => undefined)
      setPlaceError(reason)
      setStage('')
    } finally {
      setPlacing(false)
    }
  }

  const kept = plan?.sentences.length ?? 0
  const total = sentences.length

  return (
    <main className="talk-page">
      <header className="talk-head">
        <div>
          <p className="talk-kicker">口播 · 文字驱动</p>
          <h1>口播剪辑</h1>
          <p className="talk-lede">粘贴逐字稿或导入 SRT，按句删除静音与口误，导出字幕和剪切清单。素材只在本机读取时长，不上传。</p>
        </div>
        <Link className="talk-ghost" to="/">返回首页</Link>
      </header>

      <div className="talk-grid">
        <section className="talk-panel">
          <h2>1 · 逐字稿</h2>
          <div className="talk-actions">
            <button type="button" className="talk-btn" onClick={() => fileRef.current?.click()}>导入 .txt / .srt</button>
            <input ref={fileRef} type="file" accept=".txt,.srt,text/plain" hidden onChange={event => { void importText(event.target.files?.[0]); event.target.value = '' }} />
            <span className="talk-hint">{parsed ? `${kept} / ${total} 句进片` : '按句末标点自动拆句'}</span>
          </div>
          <textarea
            className="talk-textarea"
            value={source}
            onChange={event => setSource(event.target.value)}
            placeholder={'把口播稿粘在这里，例如：\n今天讲一个把长视频变短的方法。先说结论，只留有用的句子。然后按句删掉停顿和口误。'}
            spellCheck={false}
          />

          <h2>2 · 素材时长</h2>
          <div className="talk-row">
            <button type="button" className="talk-btn" onClick={() => mediaRef.current?.click()}>选择口播素材</button>
            <input ref={mediaRef} type="file" accept="video/*,audio/*" hidden onChange={event => { readMedia(event.target.files?.[0]); event.target.value = '' }} />
            <input
              className="talk-number"
              type="number"
              min={1}
              step={0.1}
              value={duration || ''}
              onChange={event => setDuration(Number(event.target.value))}
              aria-label="素材时长（秒）"
              placeholder="秒"
            />
            <span className="talk-hint">{mediaName || '也可以直接填秒数'}</span>
          </div>

          <label className="talk-switch">
            <input type="checkbox" checked={compact} onChange={event => setCompact(event.target.checked)} />
            <span>删除静音与口误（把删除句的空白挤掉）</span>
          </label>
        </section>

        <section className="talk-panel talk-panel--out">
          <h2>3 · 剪辑方案</h2>
          {!plan && <p className="talk-empty">先给逐字稿和素材时长，方案会出现在这里。</p>}
          {plan && (
            <>
              <div className="talk-stats">
                <div><b>{clock(duration)}</b><span>原素材</span></div>
                <div><b>{clock(plan.keptDuration)}</b><span>成片</span></div>
                <div><b>{plan.removed}</b><span>删句</span></div>
              </div>
              <ol className="talk-lines">
                {plan.all.map((sentence, index) => (
                  <li key={sentence.id} className={sentence.keep ? '' : 'is-cut'}>
                    <button type="button" className="talk-toggle" onClick={() => toggle(sentence.id)} aria-pressed={sentence.keep}>
                      {sentence.keep ? '保留' : '已删'}
                    </button>
                    <time>{clock(sentence.start)} – {clock(sentence.end)}</time>
                    <p>{sentence.text}</p>
                    <span className="talk-index">{String(index + 1).padStart(2, '0')}</span>
                  </li>
                ))}
              </ol>
              {!compact && <p className="talk-hint">未挤压空白：字幕按原时间轴排，删除句留空。</p>}
              <div className="talk-exports">
                <button type="button" className="talk-btn talk-btn--primary" onClick={() => download('口播字幕.srt', plan.srt, 'text/plain')}>导出 SRT</button>
                <button type="button" className="talk-btn" onClick={() => download('口播字幕.vtt', plan.vtt, 'text/vtt')}>导出 VTT</button>
                <button type="button" className="talk-btn" onClick={() => download('口播字幕.ass', buildAss(plan.sentences, {fontSize, position}), 'text/plain')}>导出 ASS</button>
                <button type="button" className="talk-btn" onClick={() => download('剪切清单.txt', cutListText(plan), 'text/plain')}>剪切清单</button>
                <button type="button" className="talk-btn" onClick={() => { void navigator.clipboard.writeText(plan.srt) }}>复制 SRT</button>
              </div>
              <div className="talk-style">
                <label>字号
                  <select value={fontSize} onChange={event => setFontSize(Number(event.target.value))}>
                    <option value={36}>小 36</option>
                    <option value={46}>中 46</option>
                    <option value={58}>大 58</option>
                  </select>
                </label>
                <label>位置
                  <select value={position} onChange={event => setPosition(event.target.value as 'bottom' | 'middle')}>
                    <option value="bottom">底部</option>
                    <option value="middle">居中</option>
                  </select>
                </label>
                <span className="talk-hint">ASS 用白字深描边，直接进剪辑软件或通用剪辑。</span>
              </div>
              <div className="talk-place">
                <div>
                  <b>一键落轨</b>
                  <p className="talk-hint">
                    把 {placement?.segments.length ?? 0} 段、{placement?.captions.length ?? 0} 条字幕写进通用剪辑的新版本；
                    已有工程不会被覆盖，导出文件仍然保留。
                  </p>
                </div>
                <button
                  type="button"
                  className="talk-btn talk-btn--primary"
                  onClick={openPlace}
                  disabled={!placement || !mediaFile}
                  title={!mediaFile ? '先选择一段口播素材' : undefined}
                >
                  一键落轨
                </button>
              </div>
              {!mediaFile && <p className="talk-hint">落轨需要先选择一段口播素材；只导出字幕或剪切清单不需要素材。</p>}
              {placed && (
                <div className="talk-placed">
                  <div>
                    <b>已落轨到《{placed.projectName}》第 {placed.n} 版</b>
                    <span>{placed.kept} 段 · {clock(placed.duration)} · 字幕 {placed.captions} 条</span>
                  </div>
                  <div className="talk-placed-actions">
                    <Link className="talk-btn talk-btn--primary" to={`/general/projects/${placed.projectId}`}>在通用剪辑里打开</Link>
                    <button type="button" className="talk-btn" onClick={() => setPlaced(null)}>知道了</button>
                  </div>
                </div>
              )}
              <p className="talk-hint">SRT 可直接拖进通用剪辑的字幕轨；剪切清单是「保留区间 起→止」，按行接给时间线。</p>
            </>
          )}
        </section>
      </div>

      {confirmOpen && placement && (
        <div className="talk-dialog-mask" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget && !placing) setConfirmOpen(false) }}>
          <div className="talk-dialog" role="dialog" aria-modal="true" aria-labelledby="talk-place-title">
            <h2 id="talk-place-title">落轨到通用剪辑</h2>
            <p className="talk-hint">会写成一个新版本：删除的句子跳过，保留段按顺序拼接，字幕进字幕轨，落轨后可以继续编辑。</p>
            <div className="talk-stats talk-stats--dialog">
              <div><b>{placement.segments.length}</b><span>保留段</span></div>
              <div><b>{clock(placement.duration)}</b><span>成片时长</span></div>
              <div><b>{placement.captions.length}</b><span>字幕条</span></div>
              <div><b>{fontSize}</b><span>字号</span></div>
              <div><b>{position === 'bottom' ? '底部' : '居中'}</b><span>字幕位置</span></div>
            </div>
            <label className="talk-field">目标工程
              <select value={target} onChange={event => setTarget(event.target.value)} disabled={placing}>
                <option value="">新建工程（用这段素材建轨）</option>
                {projects.map(project => <option key={project.id} value={project.id}>{project.name}（{project.versions} 版）</option>)}
              </select>
            </label>
            {projectsError && <p className="talk-hint">读取已有工程失败：{projectsError}。仍然可以新建工程。</p>}
            {placing && <p className="talk-hint">{stage}{progress > 0 && progress < 1 ? ` ${Math.round(progress * 100)}%` : ''}</p>}
            {placeError && <p className="talk-error">落轨没有完成：{placeError}</p>}
            <div className="talk-dialog-actions">
              <button type="button" className="talk-btn" onClick={() => setConfirmOpen(false)} disabled={placing}>取消</button>
              <button type="button" className="talk-btn talk-btn--primary" onClick={() => void runPlacement()} disabled={placing}>
                {placing ? '正在落轨…' : '确认落轨'}
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  )
}
