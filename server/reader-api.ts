/** 链接读取：抓一个公开网页，抽出标题和正文段落回给界面。只用内置 fetch 和正则，没有新增依赖。 */
import type {IncomingMessage, ServerResponse} from 'node:http';
import {bodyJson, sendJson} from './http.ts';

const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) RUOK/2.0 Reader';
const MAX_BYTES = 2_000_000;
const MAX_HOPS = 4;

export type ReadResult = {
  readonly url: string;
  readonly title: string;
  readonly site: string;
  readonly paragraphs: readonly string[];
  readonly characters: number;
  readonly minutes: number;
};

/** 只允许公开的 http(s) 地址，避免把本机服务当成代理去访问内网。 */
function privateHost(hostname: string) {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, '');
  if (!host) return true;
  if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local') || host.endsWith('.internal')) return true;
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host)) {
    const [a, b] = host.split('.').map(Number);
    return a === 0 || a === 10 || a === 127 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31)
      || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) || a >= 224;
  }
  if (host.includes(':')) return host === '::1' || host.startsWith('fc') || host.startsWith('fd') || host.startsWith('fe80');
  return false;
}

function checkedUrl(raw: string) {
  let url: URL;
  try { url = new URL(raw); } catch { throw new Error('这不像一个完整链接，请带上 https://'); }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') throw new Error('只支持 http 或 https 链接');
  if (privateHost(url.hostname)) throw new Error('不能读取本机或内网地址');
  return url;
}

/** 手动跟跳转，每一跳都重新检查目标，避免 302 到内网。 */
async function fetchPage(start: URL) {
  let url = start;
  for (let hop = 0; hop <= MAX_HOPS; hop += 1) {
    const response = await fetch(url, {
      redirect: 'manual',
      signal: AbortSignal.timeout(15_000),
      headers: { 'user-agent': USER_AGENT, accept: 'text/html,application/xhtml+xml,text/plain;q=0.9,*/*;q=0.5', 'accept-language': 'zh-CN,zh;q=0.9,en;q=0.8' },
    });
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const location = response.headers.get('location');
      if (!location) throw new Error('页面跳转后没有给出地址');
      url = checkedUrl(new URL(location, url).toString());
      continue;
    }
    if (!response.ok) throw new Error(`对方返回 ${response.status}，没有读到内容`);
    const type = response.headers.get('content-type') || '';
    if (!/text\/html|application\/xhtml\+xml|text\/plain/i.test(type)) throw new Error('这个链接不是网页正文，暂时读不了');
    const raw = await response.text();
    return { url, html: raw.slice(0, MAX_BYTES), plain: /text\/plain/i.test(type) };
  }
  throw new Error('跳转次数太多，停在了半路');
}

const ENTITIES: Record<string, string> = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', ensp: ' ', emsp: ' ', thinsp: ' ',
  ldquo: '“', rdquo: '”', lsquo: '‘', rsquo: '’', hellip: '…', mdash: '—', ndash: '–', middot: '·', copy: '©', times: '×',
};

function decode(text: string) {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z][a-z0-9]*);/gi, (whole, name: string) => {
    if (name[0] === '#') {
      const code = name[1] === 'x' || name[1] === 'X' ? Number.parseInt(name.slice(2), 16) : Number.parseInt(name.slice(1), 10);
      return Number.isFinite(code) && code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : whole;
    }
    return ENTITIES[name.toLowerCase()] ?? whole;
  });
}

const match = (html: string, pattern: RegExp) => {
  const found = html.match(pattern);
  return found ? decode(found[1].replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim() : '';
};

/** 优先取 article / main，没有再退回 body；块级标签转行，其余标签去掉。 */
function toParagraphs(html: string) {
  const stripped = html
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<(script|style|noscript|svg|iframe|template|head|form|nav|footer|aside)[^>]*>[\s\S]*?<\/\1>/gi, ' ');
  const body = stripped.match(/<article[^>]*>([\s\S]*?)<\/article>/i)?.[1]
    ?? stripped.match(/<main[^>]*>([\s\S]*?)<\/main>/i)?.[1]
    ?? stripped.match(/<body[^>]*>([\s\S]*?)<\/body>/i)?.[1]
    ?? stripped;
  const text = body
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|section|article|main|li|h[1-6]|blockquote|tr|pre|figcaption)[^>]*>/gi, '\n')
    .replace(/<[^>]+>/g, ' ');
  const lines = decode(text)
    .split('\n')
    .map(line => line.replace(/[ \t\u00a0\u3000]+/g, ' ').trim())
    .filter(line => line.length > 1);
  const paragraphs: string[] = [];
  for (const line of lines) if (paragraphs[paragraphs.length - 1] !== line) paragraphs.push(line);
  return paragraphs.slice(0, 400);
}

/** 一句话摘要：取正文前几句里信息量最大的几句。 */
function summarise(paragraphs: readonly string[], title: string) {
  const sentences = paragraphs.join(' ').split(/(?<=[。！？!?])\s*/).map(line => line.trim()).filter(line => line.length > 12);
  const picked = sentences.filter(sentence => sentence !== title).slice(0, 3);
  return (picked.length ? picked.join('') : paragraphs.slice(0, 2).join(' ')).slice(0, 260);
}

export async function handleReaderApi(req: IncomingMessage, res: ServerResponse) {
  const url = new URL(req.url || '/', 'http://localhost');
  if (url.pathname !== '/read' || req.method !== 'POST') return sendJson(res, 404, { ok: false, error: '链接读取没有这个接口' });
  try {
    const body = await bodyJson(req) as { url?: unknown };
    const raw = typeof body.url === 'string' ? body.url.trim() : '';
    if (!raw) return sendJson(res, 400, { ok: false, error: '先粘贴一个链接' });
    const page = await fetchPage(checkedUrl(raw));
    const extracted = page.plain
      ? decode(page.html).split(/\n{2,}/).map(line => line.replace(/\s+/g, ' ').trim()).filter(line => line.length > 1).slice(0, 400)
      : toParagraphs(page.html);
    if (extracted.length === 0) return sendJson(res, 422, { ok: false, error: '页面里没有抽到正文，可能要点开才会加载' });
    const title = page.plain
      ? (extracted[0] || page.url.hostname).slice(0, 120)
      : match(page.html, /<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i) || match(page.html, /<title[^>]*>([\s\S]*?)<\/title>/i) || page.url.hostname;
    // 标题在正文里重复出现一次是常见的（站点常在标题后加站名），去掉它，阅读视图只留一个标题。
    const bare = title.split(/\s+[-–—|]\s+/)[0].trim();
    const paragraphs = extracted.filter(line => line !== title && line !== bare);
    const characters = paragraphs.join('').length;
    const result: ReadResult = {
      url: page.url.toString(),
      title,
      site: page.url.hostname.replace(/^www\./, ''),
      paragraphs,
      characters,
      minutes: Math.max(1, Math.round(characters / 350)),
    };
    return sendJson(res, 200, { ok: true, result: { ...result, summary: summarise(paragraphs, title) } });
  } catch (error) {
    return sendJson(res, 502, { ok: false, error: error instanceof Error ? error.message : String(error) });
  }
}
