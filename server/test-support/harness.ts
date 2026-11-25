import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root = fileURLToPath(new URL('../../', import.meta.url));

/**
 * 在工程内创建临时目录，直接复用本工程的 node_modules。
 * 不用软链接：Windows 上创建链接可能失败，或链接目标无法解析。
 */
export function harnessDir(prefix: string) {
  const base = path.join(root, '.build');
  fs.mkdirSync(base, {recursive: true});
  return fs.mkdtempSync(path.join(base, prefix));
}
