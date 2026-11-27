/** 发布包素材：只向本机服务要路径与元数据，不读内容、不上传。 */
export type PickedAsset = {path: string; name: string; bytes: number; durationSec?: number}
export type AssetRequestKind = 'video' | 'cover'

type AssetPayload = {ok: boolean; asset?: PickedAsset | null; exists?: boolean; error?: string}

async function requestAsset(body: Record<string, unknown>): Promise<AssetPayload> {
  const response = await fetch('/api/publish/asset', {
    method: 'POST',
    headers: {'content-type': 'application/json'},
    body: JSON.stringify(body),
  })
  const payload = await response.json() as AssetPayload
  if (!response.ok || !payload.ok) throw new Error(payload.error || '选择文件失败')
  return payload
}

/** 打开原生文件选择；取消时返回 null。 */
export async function pickAsset(kind: AssetRequestKind): Promise<PickedAsset | null> {
  return (await requestAsset({kind})).asset ?? null
}

/** 手动填写的绝对路径：用于浏览器预览或原生窗口不可用的时候。 */
export async function statAsset(kind: AssetRequestKind, path: string): Promise<PickedAsset> {
  const asset = (await requestAsset({kind, path})).asset
  if (!asset) throw new Error('文件不可用')
  return asset
}

/** 每次打开发布包时确认文件还在；服务不可用时按“未知”处理，不误报缺失。 */
export async function assetExists(path: string): Promise<boolean> {
  try { return (await requestAsset({kind: 'video', path, check: true})).exists === true } catch { return true }
}

export function formatBytes(bytes: number) {
  if (bytes >= 1024 ** 3) return `${(bytes / 1024 ** 3).toFixed(2)} GB`
  if (bytes >= 1024 ** 2) return `${(bytes / 1024 ** 2).toFixed(1)} MB`
  if (bytes >= 1024) return `${Math.round(bytes / 1024)} KB`
  return `${bytes} B`
}

export function formatDuration(seconds: number) {
  const total = Math.max(0, Math.round(seconds))
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`
}
