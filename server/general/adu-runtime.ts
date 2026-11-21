import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import platform from '../platform.ts';
import { ffmpegPath, chromePath, pythonPath } from './runtime-tools.ts';
import { nodeModulesPath } from './kit-env.ts';

/**
 * adu-motion-video 接线层：把上游 vendor 的渲染器变成 RUOK 内可调用的后端。
 *
 * 设计要点（与 kit-env.ts / prepareWork() 同构）：
 *  - 复用 RUOK 自带的 ffmpeg / Chrome / python / node_modules，不另装运行时；
 *  - adu 的三个外部依赖全部通过环境变量注入（CHROME / ADU_PLAYWRIGHT_MODULE / ADU_PYTHON），
 *    ffmpeg/ffprobe 靠 PATH 前置命中 RUOK 自带版本；
 *  - 角标通过写无 BOM 的 output-signature.json 关闭；
 *  - H.264 编码器由 render_project.mjs 自动探测（libx264 优先，回退 libopenh264），
 *    因为 RUOK 自带的是 LGPL ffmpeg，不含 libx264。
 *
 * 注意：aduEnv() / renderAduProject() 会调用 chromePath()、nodeModulesPath()，
 * 环境未就绪（无浏览器、无 node_modules）时抛错——调用方应转成「跳过」或明确报错，
 * 而不是让进程崩溃。
 */

/** 上游 adu-motion-video 在本仓库中的 vendor 根目录。 */
export function aduRoot(): string {
  return fileURLToPath(new URL('../../vendor/adu', import.meta.url));
}

/**
 * bare template 引用了这些由 pipeline.py build 生成的可选场景模块；直接渲染 template
 * 时它们缺失，需通过 --optional-data 列入白名单（render_project.mjs 会忽略其加载失败）。
 */
export const TEMPLATE_OPTIONAL_MODULES = ['talkmap.js', 'face.js', 'subs.js', 'wall.js'];

/**
 * 工程目录中实际缺失的模板可选模块。
 * render_project.mjs 的 --optional-data 只接受「确实缺失」的脚本，已存在的文件不能列入，
 * 否则上游直接拒绝渲染（Optional allow-list is only for missing data scripts）。
 */
export function missingOptionalModules(projectDir: string): string[] {
  return TEMPLATE_OPTIONAL_MODULES.filter(name => !fs.existsSync(path.join(projectDir, name)));
}

export interface AduEnvOptions {
  /** 基础环境，默认 process.env。 */
  base?: NodeJS.ProcessEnv;
  /** 强制指定 H.264 编码器（默认让 adu 自动探测）。 */
  videoEncoder?: string;
  videoEncoderOpts?: string;
}

/**
 * 组装运行 adu 渲染子进程所需的环境变量。
 *  - CHROME               → chromePath()
 *  - ADU_PLAYWRIGHT_MODULE → <nodeModulesPath>/playwright-core
 *  - ADU_PYTHON           → pythonPath()
 *  - PATH                 → 前置 ffmpeg 所在目录，使裸 ffmpeg/ffprobe 命中 RUOK 自带版本
 *  - ADU_VIDEO_ENCODER / ADU_VIDEO_ENCODER_OPTS → 可选编码器覆盖
 */
export function aduEnv(options: AduEnvOptions = {}): NodeJS.ProcessEnv {
  const base = options.base ?? process.env;
  const ffmpegDir = path.dirname(ffmpegPath());
  const chrome = chromePath();
  const pwDir = path.join(nodeModulesPath(), 'playwright-core');
  const env: NodeJS.ProcessEnv = {
    ...base,
    CHROME: chrome,
    ADU_PLAYWRIGHT_MODULE: pwDir,
    ADU_PYTHON: pythonPath(),
    PYTHONDONTWRITEBYTECODE: '1',
  };
  if (options.videoEncoder) {
    env.ADU_VIDEO_ENCODER = options.videoEncoder;
    if (options.videoEncoderOpts) env.ADU_VIDEO_ENCODER_OPTS = options.videoEncoderOpts;
  }
  const inherited = platform.environmentPath(base) || (process.platform === 'win32' ? '' : '/usr/bin:/bin:/usr/sbin:/sbin');
  return platform.environmentWithPath(env, `${ffmpegDir}${path.delimiter}${inherited}`);
}

/** 写入无 BOM 的 output-signature.json，关闭 adu 右上角角标（时间码 + Circle Logo）。 */
export function disableSignature(projectDir: string): void {
  fs.mkdirSync(projectDir, { recursive: true });
  const file = path.join(projectDir, 'output-signature.json');
  // 直接写 Buffer，确保无 BOM。某些工具（含 PowerShell 默认 utf8）会加 BOM，
  // 导致 adu 的 JSON.parse 抛 "Unexpected token '﻿'"。
  fs.writeFileSync(file, Buffer.from('{"schema":"adu-output-signature/1","enabled":false}', 'utf8'));
}

export interface AduRenderOptions {
  /** 子进程基础环境，默认 process.env。 */
  base?: NodeJS.ProcessEnv;
  start?: number;
  end?: number;
  fps?: number;
  width?: number;
  height?: number;
  /** 缺失的可选本地脚本白名单；默认只放行工程中确实缺失的模板可选模块。传 [] 表示不允许缺失。 */
  optionalData?: string[];
  audio?: string;
  /** 默认 false：渲染前关闭角标。传 true 保留 adu 角标。 */
  keepSignature?: boolean;
  onProgress?: (done: number, total: number) => void;
}

export interface AduRenderResult {
  output: string;
  report: Record<string, unknown>;
}

/**
 * 渲染一个 adu 工程为 MP4。工程目录需包含 index.html（通常由 pipeline.py build 生成，
 * 或直接复用 vendor/adu/template）。
 */
export async function renderAduProject(
  projectDir: string,
  outMp4: string,
  options: AduRenderOptions = {},
): Promise<AduRenderResult> {
  const entry = path.join(projectDir, 'index.html');
  if (!fs.existsSync(entry)) throw new Error(`adu 工程入口不存在: ${entry}`);
  if (!options.keepSignature) disableSignature(projectDir);
  fs.mkdirSync(path.dirname(outMp4) || '.', { recursive: true });
  if (fs.existsSync(outMp4)) fs.rmSync(outMp4, { force: true });

  const script = path.join(aduRoot(), 'scripts', 'render_project.mjs');
  const args = [script, entry, '--output', outMp4];
  if (options.start !== undefined) args.push('--start', String(options.start));
  if (options.end !== undefined) args.push('--end', String(options.end));
  if (options.fps !== undefined) args.push('--fps', String(options.fps));
  if (options.width) args.push('--width', String(options.width));
  if (options.height) args.push('--height', String(options.height));
  const optionalData = options.optionalData ?? missingOptionalModules(projectDir);
  if (optionalData.length) args.push('--optional-data', optionalData.join(','));
  if (options.audio) args.push('--audio', options.audio);

  const env = { ...aduEnv({ base: options.base }), ELECTRON_RUN_AS_NODE: '1' };
  const node = process.platform === 'win32' ? (process.env.OPENTAKE_EXPORT_NODE || process.execPath) : process.execPath;
  const child = spawn(node, args, { cwd: aduRoot(), env, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });

  let stdout = '';
  let stderr = '';
  child.stdout?.setEncoding('utf8');
  child.stdout?.on('data', chunk => { stdout += chunk; });
  child.stderr?.setEncoding('utf8');
  child.stderr?.on('data', chunk => {
    stderr += chunk;
    if (options.onProgress) {
      const match = /Rendered (\d+)\/(\d+) frames/.exec(chunk);
      if (match) options.onProgress(Number(match[1]), Number(match[2]));
    }
  });

  const code = await new Promise<number>((resolve, reject) => {
    child.on('error', reject);
    child.on('close', resolve);
  });
  if (code !== 0) {
    throw new Error(`adu 渲染失败 (exit ${code}): ${stderr.slice(-4000) || stdout.slice(-4000)}`);
  }
  if (!fs.existsSync(outMp4)) throw new Error('adu 渲染完成但未找到输出文件');

  // render_project.mjs 把渲染报告以单行 JSON 打到 stdout。
  const reportLine = stdout.split(/\r?\n/).reverse().find(line => line.trimStart().startsWith('{'));
  let report: Record<string, unknown> = {};
  if (reportLine) {
    try { report = JSON.parse(reportLine) as Record<string, unknown>; } catch { /* 忽略解析失败，产物已存在 */ }
  }
  return { output: outMp4, report };
}
