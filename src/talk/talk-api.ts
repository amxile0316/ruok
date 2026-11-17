/**
 * 口播落轨的页面侧接口：POST /api/talk/place。回应沿用 {ok, result} / {ok:false, error}。
 */
import {GeneralApiError} from '../general/general-api'
import type {TalkPlaceCaption, TalkPlaceSegment} from '../../shared/talk'

export type TalkPlaceStyle = {fontSize: number; position: 'bottom' | 'middle'}
export type TalkPlaceInput = {
  projectId: string
  mediaId: string
  style: TalkPlaceStyle
  title?: string
  segments: TalkPlaceSegment[]
  captions: TalkPlaceCaption[]
}
export type TalkPlaceResult = {
  projectId: string
  projectName: string
  n: number
  duration: number
  kept: number
  captions: number
  videoUrl: string
  posterUrl: string
  layersUrl: string
}

export async function placeTalk(input: TalkPlaceInput): Promise<TalkPlaceResult> {
  let response: Response
  try {
    response = await fetch('/api/talk/place', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify(input),
      cache: 'no-store',
    })
  } catch {
    throw new GeneralApiError('连不上本机服务，落轨没有开始', 0)
  }
  let data: unknown
  try { data = await response.json() } catch { data = undefined }
  const envelope = (data && typeof data === 'object' ? data : {}) as {ok?: boolean; result?: TalkPlaceResult; error?: string}
  if (!response.ok || envelope.ok === false || !envelope.result) {
    throw new GeneralApiError(envelope.error || `落轨失败（${response.status}）`, response.status)
  }
  return envelope.result
}
