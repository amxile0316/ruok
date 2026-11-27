// 动效令牌检查：CSS 里的 transition 只允许用 --rk-dur-* / --rk-ease-*，不允许写裸时长。
// 关键帧 animation 不受限制（编排节奏与加载指示需要自定义时长）。
import fs from 'node:fs'
import path from 'node:path'

const ROOT = 'src'
const ALLOWED = new Set(['0s', '0ms', '1ms', '.01ms'])
const violations = []

function stripVars(text) {
  let out = '', i = 0
  while (i < text.length) {
    if (text.startsWith('var(', i)) {
      let depth = 0, j = i + 3
      for (; j < text.length; j++) {
        if (text[j] === '(') depth++
        else if (text[j] === ')') { depth--; if (depth === 0) { j++; break } }
      }
      i = j
    } else { out += text[i]; i++ }
  }
  return out
}

function walk(dir) {
  for (const entry of fs.readdirSync(dir, {withFileTypes: true})) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) { walk(full); continue }
    if (!entry.name.endsWith('.css')) continue
    const lines = fs.readFileSync(full, 'utf8').split(/\r?\n/)
    lines.forEach((line, index) => {
      if (line.includes('motion-allow')) return
      const stripped = stripVars(line.replace(/\/\*.*?\*\//g, ''))
      const re = /(?:^|[;{])\s*transition[^:;{}]*:\s*([^;{}]+)/g
      let match
      while ((match = re.exec(stripped))) {
        const value = match[1]
        for (const hit of value.matchAll(/(\d*\.?\d+)(ms|s)\b/g)) {
          if (ALLOWED.has(hit[0])) continue
          violations.push(`${full}:${index + 1}  ${hit[0]}`)
        }
      }
    })
  }
}

walk(ROOT)
if (violations.length) {
  console.error('动效令牌检查未通过：transition 里的裸时长请改用 --rk-dur-1..5（0s / 1ms 除外）')
  for (const line of violations) console.error('  ' + line)
  process.exit(1)
}
console.log('动效令牌检查通过：transition 时长全部来自 --rk-dur-*')
