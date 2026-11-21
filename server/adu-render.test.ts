import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { aduRoot, aduEnv, disableSignature, renderAduProject } from './general/adu-runtime.ts';
import { chromePath, ffprobePath, ffmpegPath } from './general/runtime-tools.ts';

const tempRoot = () => fs.mkdtempSync(path.join(os.tmpdir(), 'adu-test-'));
const cleanup = (dir: string) => { try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* 忽略 */ } };

test('disableSignature 写入无 BOM 的 output-signature.json 且 enabled=false', () => {
  const dir = tempRoot();
  try {
    disableSignature(dir);
    const file = path.join(dir, 'output-signature.json');
    assert.ok(fs.existsSync(file), 'output-signature.json 已写入');
    const bytes = fs.readFileSync(file);
    assert.ok(!(bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf), '不应含 UTF-8 BOM');
    const parsed = JSON.parse(bytes.toString('utf8'));
    assert.equal(parsed.schema, 'adu-output-signature/1');
    assert.equal(parsed.enabled, false);
  } finally {
    cleanup(dir);
  }
});

test('aduRoot 指向包含渲染器和模板的 vendor 目录', () => {
  const root = aduRoot();
  assert.ok(fs.existsSync(path.join(root, 'scripts', 'render_project.mjs')), 'render_project.mjs 存在');
  assert.ok(fs.existsSync(path.join(root, 'scripts', 'color_management.py')), 'color_management.py 存在');
  assert.ok(fs.existsSync(path.join(root, 'template', 'index.html')), 'template/index.html 存在');
});

test('aduEnv 注入运行时变量并把 ffmpeg 目录前置到 PATH', (t) => {
  let env: NodeJS.ProcessEnv;
  try {
    env = aduEnv({ base: { PATH: 'C:\\windows\\system32' } });
  } catch {
    t.skip('运行环境未就绪（无浏览器或 node_modules），跳过 aduEnv 断言');
    return;
  }
  assert.ok(env.CHROME, 'CHROME 已注入');
  assert.ok(env.ADU_PLAYWRIGHT_MODULE?.includes('playwright-core'), 'ADU_PLAYWRIGHT_MODULE 指向 playwright-core');
  assert.ok(env.ADU_PYTHON, 'ADU_PYTHON 已注入');
  const p = env.PATH || '';
  const ffmpegDir = path.dirname(ffmpegPath());
  assert.ok(p.indexOf(ffmpegDir) === 0, 'ffmpeg 目录应在 PATH 最前面');
  assert.ok(p.indexOf('system32') > p.indexOf(ffmpegDir), 'ffmpeg 目录应先于继承的 PATH');
});

test('端到端：用 vendor/adu/template 渲染 2s MP4，角标关闭且含 h264 视频流', async (t) => {
  try {
    chromePath();
  } catch {
    t.skip('无可用浏览器，跳过 adu 端到端渲染');
    return;
  }
  const root = tempRoot();
  const project = path.join(root, 'project');
  const out = path.join(root, 'out.mp4');
  try {
    fs.cpSync(path.join(aduRoot(), 'template'), project, { recursive: true });
    const result = await renderAduProject(project, out, { start: 0, end: 2, fps: 30 });

    assert.ok(fs.existsSync(out), '输出 mp4 存在');
    assert.ok(fs.statSync(out).size > 0, '输出 mp4 非空');

    // 渲染报告：角标应已关闭
    const sig = result.report.signature as { enabled?: boolean } | undefined;
    assert.equal(sig?.enabled, false, '角标应关闭');
    assert.ok(Number(result.report.sourceClocks) >= 1, '模板自带的源 HUD 时码应被隐藏');

    // ffprobe：含 h264 视频流，帧数正确
    const probe = spawnSync(ffprobePath(), [
      '-v', 'error', '-select_streams', 'v:0',
      '-show_entries', 'stream=codec_name,nb_frames,color_space,color_range',
      '-of', 'json', out,
    ], { encoding: 'utf8' });
    assert.equal(probe.status, 0, `ffprobe 应成功: ${probe.stderr}`);
    const info = JSON.parse(probe.stdout) as { streams?: Array<Record<string, unknown>> };
    const stream = info.streams?.[0];
    assert.ok(stream, '存在视频流');
    assert.equal(stream.codec_name, 'h264');
    assert.ok(Number(stream.nb_frames) >= 59, `帧数应约为 60，实际 ${stream.nb_frames}`);
  } finally {
    cleanup(root);
  }
});
