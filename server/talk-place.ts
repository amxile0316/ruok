/**
 * 口播一键落轨：把口播页的剪切方案写进通用剪辑工程的一个新版本。
 * 不经过 Agent、不新增依赖：
 *   versions/vN/work/index.html       每个保留段一个视频片段（HyperFrames 根页面）
 *   versions/vN/work/compositions/    字幕页（逐句），音频素材时多一张背景卡
 *   versions/vN/work/media/           源素材（优先硬链接）
 *   versions/vN/layers.json           hyperframesToLayers 生成的轨道，通用剪辑直接可编辑
 *   versions/vN.mp4 / vN.jpg          按保留区间剪出的成片与封面
 * 没视频流的口播素材也能落轨：深色背景卡 + 配音轨 + 字幕轨。
 * 所有文件先写进 versions/.talk-vN-* 暂存，成功后一次性改名；失败不留半成品。
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import type {IncomingMessage,ServerResponse} from 'node:http';
import {bodyJson,sendJson} from './http.ts';
import {removeWithRetrySync} from './file-ops.ts';
import {findGeneral,updateGeneral,fileUrl} from './general/store.ts';
import {hyperframesToLayers} from './general/hf-project.ts';
import {ffmpegPath,ffprobePath} from './general/kit-env.ts';
import {exportRunning} from './general/export.ts';
import type {TalkPlaceCaption,TalkPlaceSegment} from '../shared/talk.ts';
import type {GeneralProject} from '../src/general/general-contract.ts';

const exec = promisify(execFile);
const MAX_SEGMENTS = 500, MAX_CAPTIONS = 1000, MAX_TEXT = 500;

export type TalkPlaceStyle = {fontSize: number; position: 'bottom' | 'middle'};
export type TalkPlaceInput = {
  projectId: string; mediaId: string; style: TalkPlaceStyle; title?: string;
  segments: TalkPlaceSegment[]; captions: TalkPlaceCaption[];
};
export type TalkPlaceResult = {
  projectId: string; projectName: string; n: number; duration: number;
  kept: number; captions: number; videoUrl: string; posterUrl: string; layersUrl: string;
};

const bad = (message: string, status = 400) => Object.assign(new Error(message), {status});
const finite = (value: unknown) => typeof value === 'number' && Number.isFinite(value);
const round = (value: number) => Math.round(value * 1000) / 1000;

/** 只接受有限、非负、有长度的片段与字幕；任何一项不对都直接说明原因。 */
export function validatePlace(body: unknown): TalkPlaceInput {
  const raw = (body && typeof body === 'object' ? body : {}) as Record<string, unknown>;
  const projectId = typeof raw.projectId === 'string' ? raw.projectId.trim() : '';
  const mediaId = typeof raw.mediaId === 'string' ? raw.mediaId.trim() : '';
  if (!projectId) throw bad('先选择要写入的通用剪辑工程');
  if (!mediaId) throw bad('落轨需要一段口播素材');
  const styleRaw = (raw.style && typeof raw.style === 'object' ? raw.style : {}) as Record<string, unknown>;
  const fontSize = finite(styleRaw.fontSize) ? Math.round(styleRaw.fontSize as number) : 46;
  const position = styleRaw.position === 'middle' ? 'middle' : 'bottom';
  if (fontSize < 8 || fontSize > 160) throw bad('字幕字号需在 8–160 之间');
  const segments = (Array.isArray(raw.segments) ? raw.segments : []).map((value, index) => {
    const item = (value && typeof value === 'object' ? value : {}) as Record<string, unknown>;
    const start = Number(item.start), duration = Number(item.duration), sourceStart = Number(item.sourceStart);
    if (!finite(start) || !finite(duration) || !finite(sourceStart) || start < 0 || duration <= 0 || sourceStart < 0) throw bad(`第 ${index + 1} 段的起止时间不对`);
    return {start: round(start), duration: round(duration), sourceStart: round(sourceStart), ...(typeof item.label === 'string' && item.label ? {label: item.label.slice(0, 80)} : {})};
  });
  if (!segments.length) throw bad('没有保留段，先留下至少一句再落轨');
  if (segments.length > MAX_SEGMENTS) throw bad(`保留段太多（${segments.length}），最多 ${MAX_SEGMENTS} 段`);
  const captions = (Array.isArray(raw.captions) ? raw.captions : []).map((value, index) => {
    const item = (value && typeof value === 'object' ? value : {}) as Record<string, unknown>;
    const start = Number(item.start), duration = Number(item.duration);
    const text = typeof item.text === 'string' ? item.text.trim() : '';
    if (!text) throw bad(`第 ${index + 1} 条字幕没有文字`);
    if (!finite(start) || !finite(duration) || start < 0 || duration <= 0) throw bad(`第 ${index + 1} 条字幕的时间码不对`);
    return {start: round(start), duration: round(duration), text: text.slice(0, MAX_TEXT)};
  });
  if (captions.length > MAX_CAPTIONS) throw bad(`字幕太多（${captions.length}），最多 ${MAX_CAPTIONS} 条`);
  const title = typeof raw.title === 'string' && raw.title.trim() ? raw.title.trim().slice(0, 80) : undefined;
  return {projectId, mediaId, style: {fontSize, position}, segments, captions, ...(title ? {title} : {})};
}

const esc = (value: string) => value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const stamp = (value: number) => String(round(value));

/** 根页面：每个保留段一个 <video>（音频素材则是一条 <audio>），字幕宿主单独一条轨道。 */
export function talkFilmHtml(input: {
  width: number; height: number; duration: number; source: string;
  segments: TalkPlaceSegment[]; captions: number; hasVideo: boolean; hasAudio: boolean; title: string;
}) {
  const {width, height, duration, source, segments, captions, hasVideo, hasAudio, title} = input;
  const clips = segments.map((segment, index) => {
    const id = index + 1, label = esc(segment.label || `第 ${id} 段`);
    const common = `data-hf-id="${hasVideo ? 'seg' : 'voice'}-${id}" src="${esc(source)}" data-start="${stamp(segment.start)}" data-duration="${stamp(segment.duration)}" data-media-start="${stamp(segment.sourceStart)}" data-label="${label}"`;
    return hasVideo
      ? `  <video class="clip" ${common}${hasAudio ? ' data-has-audio="true"' : ''}></video>`
      : `  <audio ${common} data-ot-role="voice"></audio>`;
  }).join('\n');
  const background = hasVideo ? '' : `
  <div class="clip" id="talk-bg" data-hf-id="talk-bg" data-composition-id="talk-card" data-composition-src="compositions/background.html"
       data-start="0" data-duration="${stamp(duration)}" data-track-index="1" data-track-kind="graphics" data-label="口播背景"></div>`;
  const captionHost = captions > 0 ? `
  <div class="clip" id="captions-host" data-hf-id="cap-host" data-composition-id="captions" data-composition-src="compositions/captions.html"
       data-start="0" data-duration="${stamp(duration)}" data-track-index="9" data-track-kind="captions" data-label="字幕"></div>` : '';
  return `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<title>${esc(title)}</title>
<style>
  html,body{margin:0;width:${width}px;height:${height}px;background:#0c1211;overflow:hidden;font-family:"Microsoft YaHei","PingFang SC",sans-serif}
  #root{position:relative;width:${width}px;height:${height}px;background:#0c1211;color:#eef4f0}
  #root>.clip{position:absolute}
  #root>video.clip{inset:0;width:100%;height:100%;object-fit:contain;background:#0c1211}
</style>
</head>
<body>
<div id="root" data-composition-id="talk-cut" data-width="${width}" data-height="${height}" data-duration="${stamp(duration)}" data-no-timeline>
${clips}${background}${captionHost}
</div>
</body>
</html>
`;
}

/** 字幕页：每句一个字幕块，字号与位置沿用口播页的档位。 */
export function talkCaptionsHtml(input: {
  width: number; height: number; duration: number; style: TalkPlaceStyle; captions: TalkPlaceCaption[];
}) {
  const {width, height, duration, style, captions} = input;
  const place = style.position === 'middle' ? 'top:50%;transform:translateY(-50%)' : 'bottom:96px';
  const lines = captions.map((caption, index) => {
    const id = index + 1;
    const text = esc(caption.text).replace(/\n/g, '<br>');
    return `  <div class="clip" id="caption-${id}" data-hf-id="cap-${id}" data-start="${stamp(caption.start)}" data-duration="${stamp(caption.duration)}">${text}</div>`;
  }).join('\n');
  return `<!doctype html>
<html lang="zh-CN">
<head><meta charset="utf-8"></head>
<body>
<template>
<style>
  #captions{position:absolute;inset:0;overflow:hidden;background:transparent;font-family:"Microsoft YaHei","PingFang SC",sans-serif;pointer-events:none}
  #captions .clip{position:absolute;left:8%;right:8%;${place};text-align:center;font-size:${style.fontSize}px;line-height:1.45;letter-spacing:.01em;color:#eef4f0;text-shadow:0 2px 18px rgba(0,0,0,.72)}
</style>
<div id="captions" data-composition-id="captions" data-width="${width}" data-height="${height}" data-duration="${stamp(duration)}" data-no-timeline>
${lines}
</div>
</template>
</body>
</html>
`;
}

/** 音频素材的背景卡：只负责给配音和字幕一个稳定的深色底。 */
export function talkBackgroundHtml(input: {width: number; height: number; duration: number; title: string}) {
  const {width, height, duration, title} = input;
  return `<!doctype html>
<html lang="zh-CN">
<head><meta charset="utf-8"></head>
<body>
<template>
<style>
  #talk-card{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;background:linear-gradient(135deg,#0c1211 0%,#111a12 60%,#16211a 100%);color:#eef4f0;font-family:"Microsoft YaHei","PingFang SC",sans-serif}
  #talk-card .wrap{text-align:center}
  #talk-card b{display:block;font-size:64px;font-weight:600;letter-spacing:.08em;color:#d6a85f}
  #talk-card span{display:block;margin-top:24px;font-size:26px;color:#9fb3a8;letter-spacing:.18em}
</style>
<div id="talk-card" data-composition-id="talk-card" data-width="${width}" data-height="${height}" data-duration="${stamp(duration)}" data-no-timeline>
  <div class="wrap"><b>口播剪辑</b><span>${esc(title)}</span></div>
</div>
</template>
</body>
</html>
`;
}

type Probe = {width: number; height: number; fps: number; hasVideo: boolean; hasAudio: boolean};

async function probeMedia(file: string): Promise<Probe> {
  const {stdout} = await exec(ffprobePath(), ['-v', 'error', '-show_entries', 'stream=codec_type,width,height,r_frame_rate:stream_tags=rotate:stream_side_data=rotation', '-of', 'json', file], {maxBuffer: 4 << 20});
  const info = JSON.parse(stdout) as {
    streams?: {codec_type?: string; width?: number; height?: number; r_frame_rate?: string; tags?: {rotate?: string}; side_data_list?: {rotation?: number}[]}[];
  };
  const streams = info.streams ?? [];
  const video = streams.find(stream => stream.codec_type === 'video');
  const hasAudio = streams.some(stream => stream.codec_type === 'audio');
  const fps = (() => {
    const [num, den] = String(video?.r_frame_rate || '30/1').split('/').map(Number);
    const value = num / (den || 1);
    return Number.isFinite(value) && value > 1 ? Math.min(60, Math.max(12, Math.round(value * 100) / 100)) : 30;
  })();
  const rotation = Math.abs(Number(video?.tags?.rotate ?? video?.side_data_list?.find(data => data.rotation !== undefined)?.rotation ?? 0));
  const swapped = Math.round(rotation) % 180 === 90;
  const rawWidth = video?.width || 1920, rawHeight = video?.height || 1080;
  return {
    width: swapped ? rawHeight : rawWidth,
    height: swapped ? rawWidth : rawHeight,
    fps, hasVideo: !!video, hasAudio,
  };
}

/** 按保留区间剪出成片：深色底，每段按落轨时间叠加；声音按同样的时间贴回去。 */
async function renderCut(input: {
  source: string; output: string; probe: Probe; duration: number; segments: TalkPlaceSegment[];
}) {
  const {source, output, probe, duration, segments} = input;
  const width = Math.max(2, Math.round(probe.width / 2) * 2), height = Math.max(2, Math.round(probe.height / 2) * 2);
  const graph: string[] = [`color=c=0x0c1211:s=${width}x${height}:r=${probe.fps}:d=${duration}[base]`];
  let last = 'base';
  if (probe.hasVideo) segments.forEach((segment, index) => {
    const from = stamp(segment.sourceStart), to = stamp(segment.sourceStart + segment.duration), at = stamp(segment.start);
    graph.push(`[0:v]trim=start=${from}:end=${to},setpts=PTS-STARTPTS+${at}/TB,fps=${probe.fps},scale=${width}:${height}:force_original_aspect_ratio=decrease,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2,setsar=1[v${index}]`);
    const next = `o${index}`;
    graph.push(`[${last}][v${index}]overlay=eof_action=pass:shortest=0[${next}]`);
    last = next;
  });
  let audioOut = '';
  if (probe.hasAudio) {
    const chains = segments.map((segment, index) => {
      const from = stamp(segment.sourceStart), to = stamp(segment.sourceStart + segment.duration);
      const delay = Math.max(0, Math.round(segment.start * 1000));
      return `[0:a]atrim=start=${from}:end=${to},asetpts=PTS-STARTPTS,adelay=${delay}|${delay}[a${index}]`;
    });
    graph.push(...chains);
    graph.push(`${segments.map((_, index) => `[a${index}]`).join('')}amix=inputs=${segments.length}:normalize=0:duration=longest,aresample=48000,apad,atrim=duration=${duration}[aout]`);
    audioOut = '[aout]';
  }
  const args = ['-hide_banner', '-loglevel', 'error', '-y', '-i', source, '-filter_complex', graph.join(';'), '-map', `[${last}]`];
  if (audioOut) args.push('-map', audioOut, '-c:a', 'aac', '-b:a', '160k');
  args.push('-t', String(duration), '-r', String(probe.fps), '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '20', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', output);
  try {
    await exec(ffmpegPath(), args, {maxBuffer: 16 << 20});
  } catch (error) {
    const detail = error && typeof error === 'object' && 'stderr' in error ? String((error as {stderr?: unknown}).stderr).trim().split('\n').slice(-2).join(' ') : '';
    throw new Error(`按保留区间剪视频失败${detail ? `：${detail}` : ''}`);
  }
}

function activeRun(project: GeneralProject) {
  return !!project.run && ['running', 'stopping', 'needs-network'].includes(project.run.state);
}

/** 写第 n 版。任何一步失败都删掉暂存与临时文件，工程 JSON 不动。 */
export async function placeTalk(input: TalkPlaceInput): Promise<TalkPlaceResult> {
  const {dir, project} = findGeneral(input.projectId);
  if (activeRun(project)) throw bad('这个工程正在出片，等它结束或先停止再落轨', 409);
  if (exportRunning(project.id)) throw bad('这个工程正在导出，等导出结束再落轨', 409);
  const media = project.inputs.media.find(item => item.id === input.mediaId);
  if (!media?.file) throw bad('这个工程里找不到这段素材，先重新上传', 404);
  const source = path.join(dir, 'media', media.file);
  if (!fs.existsSync(source)) throw bad('素材文件已经不在工程目录里了', 404);

  const probe = await probeMedia(source);
  if (!probe.hasVideo && !probe.hasAudio) throw bad('这段素材里没有可用的画面或声音');
  const segments = input.segments;
  const duration = round(Math.max(0, ...segments.map(segment => segment.start + segment.duration), ...input.captions.map(caption => caption.start + caption.duration)));
  if (!Number.isFinite(duration) || duration <= 0) throw bad('成片时长为 0，先保留至少一句');
  if (probe.hasVideo && media.duration > 0) {
    const over = segments.find(segment => segment.sourceStart + segment.duration > media.duration + 0.15);
    if (over) throw bad(`第 ${segments.indexOf(over) + 1} 段超出了素材时长（${media.duration.toFixed(1)} 秒）`);
  }

  const n = project.versions.reduce((max, version) => Math.max(max, version.n), 0) + 1;
  const versions = path.join(dir, 'versions');
  fs.mkdirSync(versions, {recursive: true});
  const id = crypto.randomBytes(6).toString('hex');
  const staging = path.join(versions, `.talk-v${n}-${id}`);
  const videoTmp = path.join(versions, `.talk-v${n}-${id}.mp4`);
  const posterTmp = path.join(versions, `.talk-v${n}-${id}.jpg`);
  const title = input.title || `口播剪辑 · ${segments.length} 段`;
  const base = `versions/v${n}/work`;
  const commit: string[] = [];
  try {
    const work = path.join(staging, 'work');
    fs.mkdirSync(path.join(work, 'compositions'), {recursive: true});
    fs.mkdirSync(path.join(work, 'media'), {recursive: true});
    const linked = path.join(work, 'media', media.file);
    try { fs.linkSync(source, linked); }
    catch { fs.copyFileSync(source, linked); }
    const sourceSrc = `media/${media.file}`;
    fs.writeFileSync(path.join(work, 'index.html'), talkFilmHtml({
      width: probe.width, height: probe.height, duration, source: sourceSrc,
      segments, captions: input.captions.length, hasVideo: probe.hasVideo, hasAudio: probe.hasAudio, title,
    }));
    if (input.captions.length) fs.writeFileSync(path.join(work, 'compositions', 'captions.html'), talkCaptionsHtml({
      width: probe.width, height: probe.height, duration, style: input.style, captions: input.captions,
    }));
    if (!probe.hasVideo) fs.writeFileSync(path.join(work, 'compositions', 'background.html'), talkBackgroundHtml({
      width: probe.width, height: probe.height, duration, title: `音频素材 · ${segments.length} 段`,
    }));

    // 轨道与页面同源：通用剪辑打开这一版时读到的就是上面的页面
    const layers = await hyperframesToLayers(work, base, project.inputs.media, probe.fps);
    fs.writeFileSync(path.join(staging, 'layers.json'), JSON.stringify(layers, null, 1));

    await renderCut({source, output: videoTmp, probe, duration, segments});
    await exec(ffmpegPath(), ['-hide_banner', '-loglevel', 'error', '-y', '-ss', String(Math.min(1, duration / 3)), '-i', videoTmp, '-frames:v', '1', '-vf', 'scale=640:-2', '-q:v', '3', posterTmp]);

    const folder = path.join(versions, `v${n}`);
    fs.renameSync(staging, folder);
    commit.push(folder);
    const video = path.join(versions, `v${n}.mp4`), poster = path.join(versions, `v${n}.jpg`);
    fs.renameSync(videoTmp, video);
    commit.push(video);
    fs.renameSync(posterTmp, poster);
    commit.push(poster);
    const now = new Date().toISOString();
    const versionStamp = Math.round(fs.statSync(video).mtimeMs);
    const segmentsMeta = segments.map((segment, index) => ({id: `seg-${index + 1}`, name: segment.label || `第 ${index + 1} 段`, start: segment.start, end: round(segment.start + segment.duration)}));
    const result: TalkPlaceResult = {
      projectId: project.id, projectName: project.name, n, duration, kept: segments.length, captions: input.captions.length,
      videoUrl: fileUrl(project.id, path.relative(dir, video), versionStamp),
      posterUrl: fileUrl(project.id, path.relative(dir, poster), versionStamp),
      layersUrl: fileUrl(project.id, `versions/v${n}/layers.json`, versionStamp),
    };
    updateGeneral(project.id, current => {
      current.versions.push({
        n, createdAt: now, duration, videoUrl: result.videoUrl, posterUrl: result.posterUrl, segments: segmentsMeta,
        note: `口播落轨 · 保留 ${segments.length} 段 · 字幕 ${input.captions.length} 条`, layersUrl: result.layersUrl,
      });
      current.current = n;
      current.messages.push({
        id: crypto.randomUUID(), role: 'system', at: now, version: n,
        text: `口播剪切已经落到第 ${n} 版：保留 ${segments.length} 段、成片 ${duration.toFixed(1)} 秒、字幕 ${input.captions.length} 条。轨道可以在下面继续编辑。`,
      });
    });
    return result;
  } catch (error) {
    if (commit.length) for (const target of commit.reverse()) removeWithRetrySync(target, {recursive: true, force: true});
    removeWithRetrySync(staging, {recursive: true, force: true});
    removeWithRetrySync(videoTmp, {force: true});
    removeWithRetrySync(posterTmp, {force: true});
    throw error;
  }
}

/** /api/talk：目前只有落轨一个动作。 */
export async function handleTalkApi(req: IncomingMessage, res: ServerResponse) {
  const url = new URL(req.url || '/', 'http://local');
  try {
    if (url.pathname === '/place' && req.method === 'POST') {
      const result = await placeTalk(validatePlace(await bodyJson(req)));
      return sendJson(res, 201, {ok: true, result});
    }
    return sendJson(res, 404, {ok: false, error: '口播没有这个接口'});
  } catch (error) {
    const status = (error as {status?: number}).status || 500;
    return sendJson(res, status, {ok: false, error: error instanceof Error ? error.message : String(error)});
  }
}
