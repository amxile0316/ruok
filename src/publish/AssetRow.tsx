import {useState} from 'react'
import type {DraftAsset, DraftAssetKind} from '@/operations/model.ts'
import {formatBytes, formatDuration, pickAsset, statAsset} from './assets.ts'

type Props = {
  kind: DraftAssetKind
  label: string
  asset?: DraftAsset
  /** 封面建议比例，写进素材元数据用于提示。 */
  ratio?: NonNullable<DraftAsset['ratio']>
  /** 已发布内容只读。 */
  readOnly?: boolean
  /** 上次检查时找不到文件。 */
  missing?: boolean
  onChange: (asset: DraftAsset | undefined) => void
  onError: (message: string) => void
}

/** 一行素材：成片或封面。只存路径引用，选中后显示文件名、大小与时长。 */
export function AssetRow({kind, label, asset, ratio, readOnly, missing, onChange, onError}: Props) {
  const [busy, setBusy] = useState(false)
  const [manualOpen, setManualOpen] = useState(false)
  const [manualPath, setManualPath] = useState('')

  const accept = (picked: {path: string; name: string; bytes: number; durationSec?: number}) => {
    onChange({
      path: picked.path,
      name: picked.name,
      bytes: picked.bytes,
      ...(picked.durationSec !== undefined ? {durationSec: picked.durationSec} : {}),
      ...(ratio ? {ratio} : {}),
      addedAt: new Date().toISOString(),
    })
  }

  const choose = async () => {
    setBusy(true)
    try {
      const picked = await pickAsset(kind)
      if (picked) accept(picked)
    } catch (error) {
      onError(error instanceof Error ? error.message : String(error))
    } finally { setBusy(false) }
  }

  const useManual = async () => {
    if (!manualPath.trim() || busy) return
    setBusy(true)
    try {
      accept(await statAsset(kind, manualPath.trim()))
      setManualOpen(false)
      setManualPath('')
    } catch (error) {
      onError(error instanceof Error ? error.message : String(error))
    } finally { setBusy(false) }
  }

  return (
    <div className="publish-asset" data-kind={kind} data-missing={missing || undefined}>
      <span className="publish-asset__label">{label}</span>
      {asset ? (
        <>
          <b className="publish-asset__name" title={asset.path}>{asset.name}</b>
          <span className="publish-asset__meta">
            {formatBytes(asset.bytes)}
            {asset.durationSec ? ` · ${formatDuration(asset.durationSec)}` : ''}
            {asset.ratio ? ` · ${asset.ratio}` : ''}
            {missing ? ' · 找不到文件' : ''}
          </span>
          {!readOnly && <button type="button" className="publish-asset__action" onClick={() => { void choose() }} disabled={busy}>{busy ? '选择中…' : '更换'}</button>}
          {!readOnly && <button type="button" className="publish-asset__action" onClick={() => onChange(undefined)}>移除</button>}
        </>
      ) : (
        <>
          <span className="publish-asset__meta">未添加{kind === 'cover' && ratio ? `（建议 ${ratio}）` : ''}</span>
          {!readOnly && <button type="button" className="publish-asset__action publish-asset__action--primary" onClick={() => { void choose() }} disabled={busy}>{busy ? '选择中…' : '选择文件'}</button>}
          {!readOnly && <button type="button" className="publish-asset__action" onClick={() => setManualOpen(open => !open)}>手动填写路径</button>}
        </>
      )}
      {manualOpen && !readOnly && (
        <div className="publish-asset__manual">
          <input
            value={manualPath}
            onChange={event => setManualPath(event.target.value)}
            onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); void useManual() } }}
            placeholder={kind === 'video' ? 'D:\\videos\\final.mp4' : 'D:\\videos\\cover.png'}
            spellCheck={false}
          />
          <button type="button" className="publish-asset__action" onClick={() => { void useManual() }} disabled={busy || !manualPath.trim()}>确认</button>
        </div>
      )}
    </div>
  )
}
