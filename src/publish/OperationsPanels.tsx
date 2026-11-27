import {useEffect, useMemo, useState} from 'react'
import {useNavigate} from 'react-router'
import {PUBLISH_PLATFORMS, writeAnalyticsHandoff, type PublishPlatform} from '@/workspace/handoff'
import type {Work} from '@/analytics/model.ts'
import {
  attachDraftAsset,
  confirmPublication,
  createAccountProfile,
  removeAccountProfile,
  removeDraftAsset,
  removeProfileMemory,
  removeContentDraft,
  transitionContentDraft,
  updateContentDraft,
  upsertAccountProfile,
  type AccountProfile,
  type ContentDraft,
  type DraftAsset,
  type DraftAssetKind,
  type DraftStatus,
} from '@/operations/model.ts'
import type {OperationsCommitResult, OperationsUpdater} from '@/operations/useOperations.ts'
import {AssetRow} from './AssetRow.tsx'
import {assetExists} from './assets.ts'
import {PLATFORM_GUIDANCE, guidanceWarnings, textLength} from './platforms.ts'

type Commit = (updater: OperationsUpdater) => OperationsCommitResult
type CommonProps = {commit: Commit; notify: (message: string) => void}

const STATUS_LABELS: Record<DraftStatus, string> = {
  draft: '草稿',
  in_review: '待审核',
  approved: '已通过',
  scheduled: '已排期',
  published: '已发布',
}

const platformName = (platform: PublishPlatform) => PUBLISH_PLATFORMS.find(item => item.id === platform)?.name ?? platform
const formatLocal = (value: string) => new Intl.DateTimeFormat('zh-CN', {
  year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false,
}).format(new Date(value))

function localInput(value?: string) {
  const date = value ? new Date(value) : new Date()
  if (!Number.isFinite(date.getTime())) return ''
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16)
}

function isoFromLocal(value: string, label: string) {
  const date = new Date(value)
  if (!value || !Number.isFinite(date.getTime())) throw new Error(`${label}无效`)
  return date.toISOString()
}

const splitValues = (value: string) => value.split(/[,，\r\n]+/).map(item => item.trim()).filter(Boolean)
const splitTags = (value: string) => value.split(/[,，\s]+/).map(tag => tag.replace(/^#/, '').trim()).filter(Boolean)
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

function StatusBadge({status}: {status: DraftStatus}) {
  return <span className={`publish-status publish-status--${status}`}>{STATUS_LABELS[status]}</span>
}

type Editor = {title: string; body: string; tags: string; hook: string}
const editorFrom = (draft: ContentDraft | undefined): Editor => draft ? {
  title: draft.title,
  body: draft.body,
  tags: draft.tags.join('，'),
  hook: draft.hook,
} : {title: '', body: '', tags: '', hook: ''}

export function DraftCenter({drafts, works, selectedId, onSelect, commit, notify}: CommonProps & {
  drafts: ContentDraft[]
  works: Work[]
  selectedId: string
  onSelect: (id: string) => void
}) {
  const navigate = useNavigate()
  const sorted = useMemo(() => [...drafts].sort((left, right) => right.updatedAt.localeCompare(left.updatedAt)), [drafts])
  const current = sorted.find(draft => draft.id === selectedId) ?? sorted[0]
  const [editor, setEditor] = useState<Editor>(() => editorFrom(current))
  const [reviewChecked, setReviewChecked] = useState(false)
  const [scheduleInput, setScheduleInput] = useState(localInput(current?.scheduledAt))
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [publishedAtInput, setPublishedAtInput] = useState(localInput())
  const [externalUrl, setExternalUrl] = useState('')
  const [publishChecked, setPublishChecked] = useState(false)
  const [assetError, setAssetError] = useState('')
  const [missing, setMissing] = useState<{video?: boolean; cover?: boolean}>({})

  useEffect(() => {
    setEditor(editorFrom(current))
    setReviewChecked(false)
    setScheduleInput(localInput(current?.scheduledAt))
    setConfirmOpen(false)
    setPublishedAtInput(localInput())
    setExternalUrl('')
    setPublishChecked(false)
    setAssetError('')
  }, [current?.id, current?.updatedAt])

  // 每次切换草稿或素材变化时确认文件还在；找不到只提示，不删除记录。
  useEffect(() => {
    let alive = true
    setMissing({})
    const check = async () => {
      const next: {video?: boolean; cover?: boolean} = {}
      if (current?.video) next.video = !(await assetExists(current.video.path))
      if (current?.cover) next.cover = !(await assetExists(current.cover.path))
      if (alive) setMissing(next)
    }
    void check()
    return () => { alive = false }
  }, [current?.id, current?.video?.path, current?.cover?.path])

  if (!current) {
    return <section className="publish-panel publish-empty-panel"><h2>发布中心</h2><p className="publish-empty">还没有本地草稿。回到「写稿」生成内容，再选择「保存草稿」或「保存并送审」。</p></section>
  }

  const dirty = editor.title !== current.title || editor.body !== current.body || editor.hook !== current.hook || splitTags(editor.tags).join('\n') !== current.tags.join('\n')
  const linkedWork = works.find(work => work.id === current.workId && work.draftId === current.id)
  const guide = PLATFORM_GUIDANCE[current.platform]
  const warnings = guidanceWarnings(current.platform, editor.title, editor.body, splitTags(editor.tags))
  const packageText = () => [
    `# ${editor.title}`,
    '',
    editor.body,
    '',
    splitTags(editor.tags).map(tag => `#${tag}`).join(' '),
    '',
    '---',
    `平台：${platformName(current.platform)}`,
    `成片：${current.video?.name ?? '未添加'}`,
    `封面：${current.cover?.name ?? '未添加'}`,
  ].join('\n')

  /** 素材只改引用，不触发重新审核；已发布草稿由模型层拒绝修改。 */
  const setAsset = (kind: DraftAssetKind, asset: DraftAsset | undefined) => {
    setAssetError('')
    const result = commit(state => asset ? attachDraftAsset(state, current.id, kind, asset) : removeDraftAsset(state, current.id, kind))
    if (!result.ok && !result.committed) return
    if (result.ok) notify(asset ? `${kind === 'video' ? '成片' : '封面'}已更新` : `已移除${kind === 'video' ? '成片' : '封面'}`)
  }

  const saveEditor = () => {
    notify('')
    const result = commit(state => {
      if (!editor.title.trim()) throw new Error('标题不能为空')
      return updateContentDraft(state, current.id, {
        title: editor.title.trim(),
        body: editor.body,
        tags: splitTags(editor.tags),
        hook: editor.hook,
      })
    })
    if (result.ok) notify(current.status === 'approved' || current.status === 'scheduled' ? '内容已保存；如有实质改动，已回到待审核并清空原排期' : '草稿内容已保存')
  }

  const sendToReview = () => {
    notify('')
    const result = commit(state => transitionContentDraft(state, current.id, 'in_review'))
    if (result.ok) notify('已送审，请完成事实、素材授权和平台规范核对')
  }

  const approve = () => {
    notify('')
    const result = commit(state => transitionContentDraft(state, current.id, 'approved'))
    if (result.ok) notify('审核已通过，可以排期或人工确认发布')
  }

  const schedule = () => {
    notify('')
    const wasScheduled = current.status === 'scheduled'
    const result = commit(state => {
      const scheduledAt = isoFromLocal(scheduleInput, '排期时间')
      const ready = wasScheduled ? transitionContentDraft(state, current.id, 'approved') : state
      return transitionContentDraft(ready, current.id, 'scheduled', {scheduledAt})
    })
    if (result.ok) notify(wasScheduled ? '排期已修改' : '排期已保存；到期仍需人工在平台发布并回来确认')
  }

  const cancelSchedule = () => {
    notify('')
    const result = commit(state => transitionContentDraft(state, current.id, 'approved'))
    if (result.ok) notify('已取消排期，草稿回到已通过状态')
  }

  const publish = () => {
    notify('')
    let workId = ''
    const result = commit(state => {
      const confirmed = confirmPublication(state, current.id, {
        confirmed: publishChecked,
        publishedAt: isoFromLocal(publishedAtInput, '实际发布时间'),
        ...(externalUrl.trim() ? {externalUrl: externalUrl.trim()} : {}),
      })
      workId = confirmed.work.id
      return confirmed.state
    })
    if (!result.ok && !result.committed) return
    setConfirmOpen(false)
    if (result.ok) notify(`已人工确认发布，并关联作品 ${workId}`)
  }

  const remove = () => {
    if (!window.confirm(`确定删除本地草稿《${current.title}》吗？此操作不可撤销。`)) return
    notify('')
    const result = commit(state => removeContentDraft(state, current.id))
    if (!result.ok && !result.committed) return
    onSelect('')
    if (result.ok) notify('本地草稿已删除')
  }

  return (
    <div className="publish-center">
      <section className="publish-panel publish-drafts-panel">
        <div className="publish-panel-head"><h2>草稿</h2><span>{drafts.length} 条</span></div>
        <div className="publish-draft-list" role="listbox" aria-label="本地草稿">
          {sorted.map(draft => (
            <button
              key={draft.id}
              type="button"
              role="option"
              aria-selected={draft.id === current.id}
              className="publish-draft-item"
              onClick={() => onSelect(draft.id)}
            >
              <span className="publish-draft-item__top"><StatusBadge status={draft.status} /><span>{platformName(draft.platform)}</span></span>
              <b>{draft.title || '无标题草稿'}</b>
              <small>更新 {formatLocal(draft.updatedAt)}</small>
              {draft.scheduledAt && <small>排期 {formatLocal(draft.scheduledAt)}</small>}
              {draft.publishedAt && <small>发布 {formatLocal(draft.publishedAt)}</small>}
            </button>
          ))}
        </div>
      </section>

      <section className="publish-panel publish-draft-detail">
        <div className="publish-panel-head">
          <div><h2>{current.status === 'published' ? '已发布内容' : '编辑草稿'}</h2><p>{platformName(current.platform)} · 更新 {formatLocal(current.updatedAt)}</p></div>
          <StatusBadge status={current.status} />
        </div>

        {current.status !== 'published' ? (
          <>
            <label className="publish-field"><span>标题</span><input value={editor.title} onChange={event => setEditor({...editor, title: event.target.value})} /></label>
            <label className="publish-field"><span>正文</span><textarea className="publish-body" value={editor.body} onChange={event => setEditor({...editor, body: event.target.value})} /></label>
            <label className="publish-field"><span>话题（逗号分隔）</span><input value={editor.tags} onChange={event => setEditor({...editor, tags: event.target.value})} /></label>
            <label className="publish-field"><span>开场钩子</span><input value={editor.hook} onChange={event => setEditor({...editor, hook: event.target.value})} /></label>
            <div className="publish-exports">
              <button type="button" className="publish-btn publish-btn--primary" onClick={saveEditor} disabled={!dirty}>保存修改</button>
              {current.status === 'draft' && <button type="button" className="publish-btn" onClick={sendToReview} disabled={dirty}>送审</button>}
              <button type="button" className="publish-btn" onClick={() => {
                const text = `${editor.title}\n\n${editor.body}\n\n${splitTags(editor.tags).map(tag => `#${tag}`).join(' ')}`
                void copyText(text).then(ok => notify(ok ? '已复制全文；未改变发布状态' : '复制失败，请手动选择'))
              }}>复制全文</button>
              <button type="button" className="publish-btn publish-btn--danger" onClick={remove}>删除草稿</button>
            </div>
            {dirty && current.status === 'draft' && <p className="publish-hint">送审前请先保存修改。</p>}
            {(current.status === 'approved' || current.status === 'scheduled') && <p className="publish-hint">审核后的标题、正文、话题或钩子如有改动，保存后会重新进入待审核，并清空旧排期。</p>}
          </>
        ) : (
          <div className="publish-published-copy">
            <h3>{current.title}</h3>
            <pre>{current.body}</pre>
            <p>{current.tags.map(tag => `#${tag}`).join(' ')}</p>
            {current.hook && <p><b>开场钩子：</b>{current.hook}</p>}
          </div>
        )}

        {current.status === 'in_review' && (
          <section className="publish-subsection">
            <h3>人工审核</h3>
            <label className="publish-check"><input type="checkbox" checked={reviewChecked} onChange={event => setReviewChecked(event.target.checked)} /><span>事实、素材授权、平台规范已核对</span></label>
            <button type="button" className="publish-btn publish-btn--primary" disabled={!reviewChecked || dirty} onClick={approve}>审核通过</button>
            {dirty && <p className="publish-hint">有未保存修改，请先保存再审核。</p>}
          </section>
        )}

        {(current.status === 'approved' || current.status === 'scheduled') && (
          <>
            <section className="publish-subsection">
              <h3>{current.status === 'scheduled' ? '修改排期' : '本地排期'}</h3>
              {current.scheduledAt && <p className="publish-hint">当前排期：{formatLocal(current.scheduledAt)}</p>}
              <label className="publish-field"><span>计划发布时间（本地时间）</span><input type="datetime-local" value={scheduleInput} onChange={event => setScheduleInput(event.target.value)} disabled={dirty} /></label>
              <div className="publish-exports">
                <button type="button" className="publish-btn" onClick={schedule} disabled={!scheduleInput || dirty}>{current.status === 'scheduled' ? '保存新排期' : '确认排期'}</button>
                {current.status === 'scheduled' && <button type="button" className="publish-btn" onClick={cancelSchedule} disabled={dirty}>取消排期</button>}
              </div>
              <p className="publish-hint">排期只用于本地提醒，不会自动发布，也不会创建作品记录。</p>
            </section>
            <section className="publish-subsection">
              <h3>人工发布确认</h3>
              {!confirmOpen ? (
                <button type="button" className="publish-btn publish-btn--primary" onClick={() => { setPublishedAtInput(localInput()); setExternalUrl(''); setPublishChecked(false); setConfirmOpen(true) }} disabled={dirty}>我已在平台发布</button>
              ) : (
                <div className="publish-confirm-box">
                  <p className="publish-local">人工填报，RUOK 未向平台核验。确认后会将草稿标记为已发布，并创建一条零指标作品记录。</p>
                  <p className="publish-hint">
                    发布包：成片 {current.video ? current.video.name : '未添加'}；封面 {current.cover ? current.cover.name : '未添加'}。
                    {!current.video && '还没有成片，确认后作品时长会是 0。'}
                  </p>
                  <label className="publish-field"><span>实际发布时间（本地时间）</span><input type="datetime-local" value={publishedAtInput} onChange={event => setPublishedAtInput(event.target.value)} /></label>
                  <label className="publish-field"><span>作品链接（可选，http/https）</span><input type="url" value={externalUrl} onChange={event => setExternalUrl(event.target.value)} placeholder="https://example.com/post/123" /></label>
                  <label className="publish-check"><input type="checkbox" checked={publishChecked} onChange={event => setPublishChecked(event.target.checked)} /><span>我已在平台完成发布</span></label>
                  <div className="publish-exports">
                    <button type="button" className="publish-btn publish-btn--primary" onClick={publish} disabled={!publishChecked || !publishedAtInput}>确认发布并关联作品</button>
                    <button type="button" className="publish-btn" onClick={() => setConfirmOpen(false)}>取消</button>
                  </div>
                </div>
              )}
            </section>
          </>
        )}

        <section className="publish-subsection publish-package">
          <h3>发布包</h3>
          <div className="publish-assets">
            <AssetRow kind="video" label="成片" asset={current.video} readOnly={current.status === 'published'} missing={missing.video}
              onChange={asset => setAsset('video', asset)} onError={setAssetError} />
            <AssetRow kind="cover" label="封面" asset={current.cover} ratio={guide.coverRatio} readOnly={current.status === 'published'} missing={missing.cover}
              onChange={asset => setAsset('cover', asset)} onError={setAssetError} />
          </div>
          {assetError && <p className="publish-error" role="alert">{assetError}</p>}
          <p className="publish-hint">只记本机路径，不复制文件、不上传。{guide.note}</p>
          <p className="publish-limits">
            标题 {textLength(editor.title)}/{guide.titleMax} · 正文 {textLength(editor.body)}/{guide.bodyMax} · 话题 {splitTags(editor.tags).length}/{guide.tagsMax}
          </p>
          {warnings.length > 0 && <ul className="publish-limits publish-limits--over">{warnings.map(item => <li key={item}>{item}</li>)}</ul>}
          <div className="publish-exports">
            <button type="button" className="publish-btn" onClick={() => { void copyText(editor.title).then(ok => notify(ok ? '已复制标题' : '复制失败')) }}>复制标题</button>
            <button type="button" className="publish-btn" onClick={() => { void copyText(editor.body).then(ok => notify(ok ? '已复制正文' : '复制失败')) }}>复制正文</button>
            <button type="button" className="publish-btn" onClick={() => { void copyText(splitTags(editor.tags).map(tag => `#${tag}`).join(' ')).then(ok => notify(ok ? '已复制话题' : '复制失败')) }}>复制话题</button>
            {current.video && <button type="button" className="publish-btn" onClick={() => { void copyText(current.video!.path).then(ok => notify(ok ? '已复制成片路径' : '复制失败')) }}>复制成片路径</button>}
            {current.cover && <button type="button" className="publish-btn" onClick={() => { void copyText(current.cover!.path).then(ok => notify(ok ? '已复制封面路径' : '复制失败')) }}>复制封面路径</button>}
            <button type="button" className="publish-btn publish-btn--primary" onClick={() => {
              downloadMarkdown(`发布包-${platformName(current.platform)}-${editor.title || '未命名'}.md`, packageText())
              notify('已导出发布包；未改变发布状态')
            }}>导出发布包</button>
          </div>
        </section>

        {current.status === 'published' && (
          <section className="publish-subsection publish-work-result">
            <h3>已关联作品</h3>
            <p><b>{linkedWork?.title ?? current.title}</b></p>
            <p>作品 ID：{current.workId}</p>
            <p>实际发布时间：{current.publishedAt ? formatLocal(current.publishedAt) : '未记录'}</p>
            {current.externalUrl && <a href={current.externalUrl} target="_blank" rel="noreferrer">打开平台作品链接</a>}
            {linkedWork && <div className="publish-exports"><button type="button" className="publish-btn publish-btn--primary" onClick={() => {
              writeAnalyticsHandoff({
                title: linkedWork.title,
                platform: linkedWork.platform,
                ...(linkedWork.hook ? {hook: linkedWork.hook} : {}),
                ...(linkedWork.topic ? {topic: linkedWork.topic} : {}),
                workId: linkedWork.id,
                draftId: current.id,
                ...(linkedWork.accountId ? {accountId: linkedWork.accountId} : {}),
              })
              navigate('/analytics')
            }}>去运营分析补数据</button></div>}
            <p className="publish-hint">来源：人工填报，RUOK 未向平台核验。已发布内容不可再编辑或删除，重复确认不会重复创建作品。</p>
          </section>
        )}
      </section>
    </div>
  )
}

export function ContentCalendar({drafts}: {drafts: ContentDraft[]}) {
  const items = useMemo(() => drafts.flatMap(draft => {
    if (draft.status === 'scheduled' && draft.scheduledAt) return [{draft, at: draft.scheduledAt}]
    if (draft.status === 'published' && draft.publishedAt) return [{draft, at: draft.publishedAt}]
    return []
  }).sort((left, right) => Date.parse(left.at) - Date.parse(right.at)), [drafts])

  return (
    <section className="publish-panel publish-calendar">
      <div className="publish-panel-head"><div><h2>内容日历</h2><p>按计划发布时间、实际发布时间升序排列</p></div><span>{items.length} 条</span></div>
      {!items.length && <p className="publish-empty">还没有已排期或已发布的内容。审核通过后可添加本地排期；平台发布完成后，再到发布中心人工确认。</p>}
      {items.length > 0 && (
        <ol className="publish-calendar-list">
          {items.map(({draft, at}) => {
            const overdue = draft.status === 'scheduled' && Date.parse(at) < Date.now()
            return (
              <li key={draft.id}>
                <time dateTime={at}>{formatLocal(at)}</time>
                <div><b>{draft.title}</b><span>{platformName(draft.platform)}</span></div>
                <div className="publish-calendar-status"><StatusBadge status={draft.status} />{draft.status === 'scheduled' && <span className={overdue ? 'publish-overdue' : ''}>{overdue ? '待人工发布/已逾期' : '待人工发布'}</span>}</div>
              </li>
            )
          })}
        </ol>
      )}
      <p className="publish-hint">日历不会自动更改状态。逾期排期仍保留为待人工发布，只有人工确认后才会成为已发布作品。</p>
    </section>
  )
}

type ProfileForm = {
  id?: string
  platform: PublishPlatform
  displayName: string
  positioning: string
  targetAudience: string
  languageStyle: string
  contentPillars: string
  compliancePreferences: string
}

const emptyProfile = (): ProfileForm => ({
  platform: 'xiaohongshu', displayName: '', positioning: '', targetAudience: '', languageStyle: '', contentPillars: '', compliancePreferences: '',
})

const profileForm = (profile: AccountProfile): ProfileForm => ({
  id: profile.id,
  platform: profile.platform,
  displayName: profile.displayName,
  positioning: profile.positioning,
  targetAudience: profile.targetAudience,
  languageStyle: profile.languageStyle,
  contentPillars: profile.contentPillars.join('，'),
  compliancePreferences: profile.compliancePreferences.join('\n'),
})

export function ProfileManager({profiles, commit, notify}: CommonProps & {profiles: AccountProfile[]}) {
  const [form, setForm] = useState<ProfileForm | null>(() => profiles.length ? null : emptyProfile())
  const [formError, setFormError] = useState('')

  const save = () => {
    if (!form) return
    notify(''); setFormError('')
    if (!form.displayName.trim()) {
      setFormError('显示名为必填项')
      return
    }
    const wasEditing = Boolean(form.id)
    const result = commit(state => {
      // 编辑时保留已有复盘记忆：表单不含 memory 字段，重建画像必须显式带回，否则会被清空。
      const existing = form.id ? state.profiles.find(item => item.id === form.id) : undefined
      const profile = createAccountProfile({
        platform: form.platform,
        displayName: form.displayName.trim(),
        positioning: form.positioning.trim(),
        targetAudience: form.targetAudience.trim(),
        languageStyle: form.languageStyle.trim(),
        contentPillars: splitValues(form.contentPillars),
        compliancePreferences: splitValues(form.compliancePreferences),
        memory: existing?.memory,
      }, form.id ? {id: form.id} : {})
      return upsertAccountProfile(state, profile)
    })
    if (!result.ok && !result.committed) return
    setForm(null)
    if (result.ok) notify(wasEditing ? '账号画像已更新' : '账号画像已创建')
  }

  const remove = (profile: AccountProfile) => {
    if (!window.confirm(`确定删除账号画像「${profile.displayName}」吗？已有草稿不会被删除。`)) return
    notify(''); setFormError('')
    const result = commit(state => removeAccountProfile(state, profile.id))
    if (!result.ok && !result.committed) return
    if (form?.id === profile.id) setForm(null)
    if (result.ok) notify('账号画像已删除')
  }

  const removeMemory = (profileId: string, index: number) => {
    notify('')
    const result = commit(state => removeProfileMemory(state, profileId, index))
    if (result.ok || result.committed) notify('已删除一条画像记忆')
  }

  return (
    <div className="publish-profiles">
      <section className="publish-panel">
        <div className="publish-panel-head"><h2>本地画像</h2><button type="button" className="publish-btn" onClick={() => { setForm(emptyProfile()); setFormError('') }}>新建画像</button></div>
        <p className="publish-local">仅是内容画像，不是平台登录，不保存 Cookie、密码或 Token。</p>
        {!profiles.length && <p className="publish-empty">还没有账号画像。显示名必填，其余字段用于给本机智能体提供写作背景。</p>}
        <div className="publish-profile-list">
          {profiles.map(profile => (
            <article key={profile.id} className="publish-profile-card">
              <div className="publish-panel-head"><div><h3>{profile.displayName}</h3><p>{platformName(profile.platform)}</p></div><div className="publish-card-actions"><button type="button" className="publish-btn" onClick={() => { setForm(profileForm(profile)); setFormError('') }}>编辑</button><button type="button" className="publish-btn publish-btn--danger" onClick={() => remove(profile)}>删除</button></div></div>
              {profile.positioning && <p>{profile.positioning}</p>}
              {profile.contentPillars.length > 0 && <small>内容支柱：{profile.contentPillars.join('、')}</small>}
              {(profile.memory?.length ?? 0) > 0 && (
                <div className="publish-profile-memory">
                  <p>复盘记忆（{profile.memory!.length}）</p>
                  <ul>
                    {profile.memory!.map((entry, i) => (
                      <li key={`${profile.id}-mem-${i}`}>
                        <span>
                          {entry.text}
                          {(entry.createdAt || entry.workTitle) && (
                            <em className="publish-profile-memory__meta">
                              {[entry.createdAt ? entry.createdAt.slice(0, 10) : '早期记录', entry.workTitle ? `关联《${entry.workTitle}》` : ''].filter(Boolean).join(' · ')}
                            </em>
                          )}
                        </span>
                        <button type="button" className="publish-btn" onClick={() => removeMemory(profile.id, i)}>删除</button>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </article>
          ))}
        </div>
      </section>

      <section className="publish-panel">
        <h2>{form?.id ? '编辑画像' : form ? '新建画像' : '画像字段'}</h2>
        {!form && <p className="publish-empty">选择一条画像编辑，或点「新建画像」。这里不会要求任何平台凭据。</p>}
        {form && (
          <>
            <div className="publish-profile-fields">
              <label className="publish-field"><span>平台</span><select value={form.platform} onChange={event => setForm({...form, platform: event.target.value as PublishPlatform})}>{PUBLISH_PLATFORMS.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
              <label className="publish-field"><span>显示名（必填）</span><input required value={form.displayName} onChange={event => setForm({...form, displayName: event.target.value})} /></label>
              <label className="publish-field publish-field--wide"><span>定位</span><textarea className="publish-profile-textarea" value={form.positioning} onChange={event => setForm({...form, positioning: event.target.value})} /></label>
              <label className="publish-field publish-field--wide"><span>目标受众</span><textarea className="publish-profile-textarea" value={form.targetAudience} onChange={event => setForm({...form, targetAudience: event.target.value})} /></label>
              <label className="publish-field publish-field--wide"><span>语言风格</span><input value={form.languageStyle} onChange={event => setForm({...form, languageStyle: event.target.value})} /></label>
              <label className="publish-field publish-field--wide"><span>内容支柱（逗号或换行分隔）</span><textarea className="publish-profile-textarea" value={form.contentPillars} onChange={event => setForm({...form, contentPillars: event.target.value})} /></label>
              <label className="publish-field publish-field--wide"><span>合规偏好（逗号或换行分隔）</span><textarea className="publish-profile-textarea" value={form.compliancePreferences} onChange={event => setForm({...form, compliancePreferences: event.target.value})} /></label>
            </div>
            {formError && <p className="publish-error" role="alert">{formError}</p>}
            <div className="publish-exports"><button type="button" className="publish-btn publish-btn--primary" onClick={save}>保存画像</button><button type="button" className="publish-btn" onClick={() => { setForm(null); setFormError('') }}>取消</button></div>
          </>
        )}
      </section>
    </div>
  )
}
