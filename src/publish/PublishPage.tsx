import {useEffect, useMemo, useRef, useState} from 'react'
import {Link} from 'react-router'
import {PUBLISH_PLATFORMS as PLATFORMS, takePublishHandoff, type PublishHandoff, type PublishPlatform} from '@/workspace/handoff'
import {addContentDraft, createContentDraft, transitionContentDraft} from '@/operations/model.ts'
import {useOperations} from '@/operations/useOperations.ts'
import {ContentCalendar, DraftCenter, ProfileManager} from './OperationsPanels.tsx'
import './publish.css'

type Copy = {title: string; body: string; tags: string[]; hook: string; platformName: string; local?: boolean; warning?: string}
type PublishView = 'write' | 'center' | 'calendar' | 'profiles'
type GenerationMeta = {
  source: string
  platform: PublishPlatform
  accountId?: string
  topic?: string
  tone?: string
}

const VIEWS: {id: PublishView; label: string}[] = [
  {id: 'write', label: '写稿'},
  {id: 'center', label: '发布中心'},
  {id: 'calendar', label: '内容日历'},
  {id: 'profiles', label: '账号画像'},
]

const copyText = async (text: string) => {
  try { await navigator.clipboard.writeText(text); return true } catch { return false }
}

function downloadMarkdown(name: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], {type: 'text/markdown'}))
  const link = document.createElement('a')
  link.href = url
  link.download = name
  link.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export default function PublishPage() {
  const operations = useOperations()
  const [view, setView] = useState<PublishView>('write')
  const [selectedDraftId, setSelectedDraftId] = useState('')
  const [source, setSource] = useState('')
  const [platform, setPlatform] = useState<PublishPlatform>('xiaohongshu')
  const [tone, setTone] = useState('')
  const [accountId, setAccountId] = useState('')
  const [copy, setCopy] = useState<Copy | null>(null)
  const [generatedMeta, setGeneratedMeta] = useState<GenerationMeta | null>(null)
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

  const availableProfiles = useMemo(
    () => operations.state.profiles.filter(profile => profile.platform === platform),
    [operations.state.profiles, platform],
  )
  const selectedProfile = availableProfiles.find(profile => profile.id === accountId)

  const generate = async () => {
    if (!source.trim() || busy) return
    setBusy(true); setError(''); setNotice('')
    try {
      const response = await fetch('/api/publish/generate', {
        method: 'POST',
        headers: {'content-type': 'application/json'},
        body: JSON.stringify({source, platform, tone, ...(selectedProfile ? {profile: selectedProfile} : {})}),
      })
      const body = await response.json() as {ok: boolean; result?: Copy; error?: string}
      if (!response.ok || !body.ok || !body.result) throw new Error(body.error || '生成失败')
      setCopy(body.result)
      setGeneratedMeta({
        source,
        platform,
        ...(selectedProfile ? {accountId: selectedProfile.id} : {}),
        ...(origin?.angle || origin?.title ? {topic: origin.angle || origin.title} : {}),
        ...(tone.trim() ? {tone: tone.trim()} : {}),
      })
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : String(failure))
    } finally {
      setBusy(false)
    }
  }

  const update = (patch: Partial<Copy>) => setCopy(current => (current ? {...current, ...patch} : current))
  const markdown = copy ? `${copy.title}\n\n${copy.body}\n\n${copy.tags.map(tag => `#${tag}`).join(' ')}` : ''

  const saveDraft = (sendToReview: boolean) => {
    if (!copy || !generatedMeta) return
    setError(''); setNotice('')
    if (!copy.title.trim()) {
      setError('保存前请填写标题')
      return
    }
    let draftId = ''
    const result = operations.commit(current => {
      const draft = createContentDraft({
        source: generatedMeta.source,
        platform: generatedMeta.platform,
        ...(generatedMeta.accountId ? {accountId: generatedMeta.accountId} : {}),
        ...(generatedMeta.topic ? {topic: generatedMeta.topic} : {}),
        ...(generatedMeta.tone ? {tone: generatedMeta.tone} : {}),
        title: copy.title.trim(),
        body: copy.body,
        tags: copy.tags.map(tag => tag.trim()).filter(Boolean),
        hook: copy.hook,
      })
      draftId = draft.id
      const added = addContentDraft(current, draft)
      return sendToReview ? transitionContentDraft(added, draft.id, 'in_review') : added
    })
    if (!result.ok && !result.committed) return
    setSelectedDraftId(draftId)
    setView('center')
    if (result.ok) setNotice(sendToReview ? '草稿已保存并送审' : '草稿已保存，可在发布中心继续编辑和送审')
  }

  return (
    <main className="publish-page">
      <header className="publish-head">
        <div>
          <p className="publish-kicker">文案 · 本地草稿与人工发布</p>
          <h1>文案发布</h1>
          <p className="publish-lede">在本机生成并保存草稿，完成审核、排期与人工发布确认，也可维护内容日历和账号画像。不接第三方自动发布，RUOK 不会替你登录或向平台发布。</p>
        </div>
        <Link className="publish-ghost" to="/">返回首页</Link>
      </header>

      <nav className="publish-tabs" aria-label="文案发布视图" role="tablist">
        {VIEWS.map(item => (
          <button
            key={item.id}
            id={`publish-tab-${item.id}`}
            type="button"
            role="tab"
            aria-selected={view === item.id}
            aria-controls={`publish-view-${item.id}`}
            className="publish-tab"
            onClick={() => setView(item.id)}
          >{item.label}</button>
        ))}
      </nav>

      <div className="publish-messages">
        {operations.loadError && <p className="publish-error" role="alert">运营数据读取失败：{operations.loadError.message}。为避免覆盖原数据，本地更改已停用；页面不会自动修复或覆盖损坏的新键。</p>}
        {operations.saveError && <p className="publish-error" role="alert">本地写入失败：{operations.saveError.message}。本次更改仍保留在当前页面内存中，刷新可能丢失。</p>}
        {operations.operationError && <p className="publish-error" role="alert">操作未完成：{operations.operationError.message}</p>}
        {notice && <p className="publish-notice" role="status">{notice}</p>}
      </div>

      <div id={`publish-view-${view}`} role="tabpanel" aria-labelledby={`publish-tab-${view}`}>
        {view === 'write' && (
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
                <span>账号画像（可选）</span>
                <select value={selectedProfile?.id ?? ''} onChange={event => setAccountId(event.target.value)}>
                  <option value="">不使用画像</option>
                  {availableProfiles.map(profile => <option key={profile.id} value={profile.id}>{profile.displayName}</option>)}
                </select>
              </label>
              <p className="publish-hint">只列出与当前平台一致的画像；画像提供写作上下文，不代表平台登录。</p>
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
              {!copy && <p className="publish-empty">生成后可以逐项改，再复制、导出，或保存为本地草稿。</p>}
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
                  <label className="publish-field">
                    <span>开场钩子</span>
                    <input value={copy.hook} onChange={event => update({hook: event.target.value})} />
                  </label>
                  <div className="publish-exports">
                    <button type="button" className="publish-btn publish-btn--primary" onClick={() => { void copyText(markdown).then(ok => setNotice(ok ? '已复制全文' : '复制失败，请手动选择')) }}>复制全文</button>
                    <button type="button" className="publish-btn" onClick={() => { void copyText(copy.tags.map(tag => `#${tag}`).join(' ')).then(ok => setNotice(ok ? '已复制话题' : '复制失败')) }}>复制话题</button>
                    <button type="button" className="publish-btn" onClick={() => { downloadMarkdown(`发布文案-${copy.platformName}.md`, markdown); setNotice('已导出 Markdown') }}>导出 Markdown</button>
                    <button type="button" className="publish-btn" onClick={() => saveDraft(false)}>保存草稿</button>
                    <button type="button" className="publish-btn publish-btn--primary" onClick={() => saveDraft(true)}>保存并送审</button>
                  </div>
                  {copy.local && <p className="publish-local">本机智能体未接通，已按素材摘句生成；接通后可在设置里让智能体改写。{copy.warning ? `（${copy.warning}）` : ''}</p>}
                </>
              )}
            </section>
          </div>
        )}

        {view === 'center' && (
          <DraftCenter
            drafts={operations.state.drafts}
            works={operations.state.works}
            selectedId={selectedDraftId}
            onSelect={setSelectedDraftId}
            commit={operations.commit}
            notify={setNotice}
          />
        )}
        {view === 'calendar' && <ContentCalendar drafts={operations.state.drafts} />}
        {view === 'profiles' && <ProfileManager profiles={operations.state.profiles} commit={operations.commit} notify={setNotice} />}
      </div>
    </main>
  )
}
