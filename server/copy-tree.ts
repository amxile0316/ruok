import fs from 'node:fs';
import path from 'node:path';

export type CopyTreeOptions = {
  /** 复制文件时传给 copyFileSync 的标志，例如 COPYFILE_FICLONE。 */
  mode?: number;
  /** 跟随符号链接复制目标；默认同 fs.cpSync，保留链接本身。 */
  dereference?: boolean;
  /** 目标已存在时抛错，而不是覆盖。 */
  errorOnExist?: boolean;
};

const exists = (file: string) => {
  try { fs.lstatSync(file); return true; } catch { return false; }
};

/**
 * 逐项递归复制，替代 fs.cpSync。
 * 当前 Windows 运行时上 fs.cpSync 遇到非 ASCII 源路径会直接让进程崩溃（0xC0000409），
 * 而工程目录名默认是中文，因此统一走这里。
 */
export function copyTreeSync(source: string, target: string, options: CopyTreeOptions = {}) {
  const { mode, dereference = false, errorOnExist = false } = options;
  if (errorOnExist && exists(target)) throw Object.assign(new Error(`复制目标已存在：${target}`), { code: 'ERR_FS_CP_EEXIST' });
  const walk = (from: string, to: string) => {
    const info = dereference ? fs.statSync(from) : fs.lstatSync(from);
    if (info.isSymbolicLink()) {
      fs.mkdirSync(path.dirname(to), { recursive: true });
      fs.symlinkSync(fs.readlinkSync(from), to);
      return;
    }
    if (info.isDirectory()) {
      fs.mkdirSync(to, { recursive: true });
      for (const name of fs.readdirSync(from)) walk(path.join(from, name), path.join(to, name));
      return;
    }
    if (!info.isFile()) throw Object.assign(new Error(`不支持的复制来源：${from}`), { code: 'ERR_FS_CP_UNKNOWN' });
    fs.mkdirSync(path.dirname(to), { recursive: true });
    fs.copyFileSync(from, to, mode);
  };
  walk(source, target);
}
