import type {IncomingMessage,ServerResponse} from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {bodyJson,sendJson} from './http.ts';
import {resolveAgent,runAgent} from './agent-runtime.ts';
import type {AccountProfile} from '../src/operations/model.ts';

const PLATFORMS = {
  xiaohongshu: { name: '小红书', limit: 20, tags: ['创作日常', '效率工具', '视频剪辑'], cta: '先把素材留好，再决定怎么剪。', rule: '第一人称、口语、真诚分享；标题不超过 20 字；正文 200–600 字，可用短段落；话题 5–8 个，不加无关热词。' },
  douyin: { name: '抖音', limit: 30, tags: ['剪辑技巧', '效率', '干货'], cta: '收藏这条，下次直接照做。', rule: '开头 1 句就是钩子；短句、强节奏；标题不超过 30 字；正文不超过 300 字；话题 3–5 个。' },
  shipinhao: { name: '视频号', limit: 24, tags: ['内容创作', '工作方法'], cta: '把方法用起来，比看完更重要。', rule: '稳重、价值点清晰；标题不超过 24 字；正文 100–300 字；话题 2–4 个。' },
  bilibili: { name: 'B 站', limit: 40, tags: ['剪辑', '效率工具', '经验分享'], cta: '细节都在片子里，欢迎按章节看。', rule: '信息密度高、有观点；标题不超过 40 字；正文可列 2–4 个要点；话题 3–6 个。' },
  youtube: { name: 'YouTube', limit: 60, tags: ['editing', 'workflow', 'productivity'], cta: 'Watch the full walkthrough for the details.', rule: '标题关键词前置，不超过 60 字；简介 2–4 句；话题 3–5 个。' },
  x: { name: 'X', limit: 70, tags: ['editing', 'workflow'], cta: 'Notes in the thread.', rule: '正文不超过 280 字；一句一个意思；话题 1–3 个。' },
} as const;

/** 没有接通智能体时的本地兜底：从原素材里摘句，按平台限制收口。 */
export function localCopy(source: string, platform: PublishPlatform) {
  const style = PLATFORMS[platform];
  const lines = source.replace(/\r\n/g, '\n').split(/\n+/).map(line => line.trim()).filter(Boolean)
  const sentences = lines.flatMap(line => line.split(/(?<=[。！？!?；;])/)).map(line => line.trim()).filter(Boolean)
  const strip = (text: string) => text.replace(/[。！？!?；;，,、\s]+$/, '')
  const title = strip(sentences[0] || lines[0] || '一条新片').slice(0, style.limit)
  const points = sentences.slice(1, 4).map(strip).filter(Boolean)
  const hashtags = [...source.matchAll(/#([^\s#]{1,20})/g)].map(match => match[1])
  const body = [points.length ? points.map(point => `· ${point}`).join('\n') : strip(sentences[0] || ''), style.cta].filter(Boolean).join('\n\n')
  return { title, body, tags: (hashtags.length ? hashtags : style.tags).slice(0, 8), hook: strip(sentences[0] || title) }
}

export type PublishPlatform = keyof typeof PLATFORMS;

const PROFILE_TEXT_FIELDS = [
  { key: 'displayName', label: '昵称/显示名', limit: 120 },
  { key: 'positioning', label: '定位', limit: 1200 },
  { key: 'targetAudience', label: '目标受众', limit: 1200 },
  { key: 'languageStyle', label: '语言风格', limit: 1200 },
] as const;
const PROFILE_LIST_FIELDS = [
  { key: 'contentPillars', label: '内容支柱', limit: 1200 },
  { key: 'compliancePreferences', label: '合规偏好', limit: 1200 },
] as const;
const PROFILE_IGNORED_FIELDS = new Set(['id', 'platform', 'timestamp', 'createdAt', 'updatedAt']);
const PROFILE_KNOWN_FIELDS = new Set<string>([
  ...PROFILE_TEXT_FIELDS.map(field => field.key),
  ...PROFILE_LIST_FIELDS.map(field => field.key),
  ...PROFILE_IGNORED_FIELDS,
  'memory', // 画像记忆是运营复盘的内部字段，不注入文案生成 prompt，这里仅放行不报错
]);

export type PublishProfile = Partial<Pick<AccountProfile,
  (typeof PROFILE_TEXT_FIELDS)[number]['key'] | (typeof PROFILE_LIST_FIELDS)[number]['key']
>>;
export type PublishProfileValidation =
  | { ok: true; profile: PublishProfile }
  | { ok: false; error: string };

/** 只保留可公开给文案智能体的画像上下文，拒绝未知字段以免凭据混入。 */
export function validatePublishProfile(value: unknown): PublishProfileValidation {
  if (value === undefined) return { ok: true, profile: {} };
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return { ok: false, error: '账号画像必须是对象' };
  }
  const input = value as Record<string, unknown>;
  for (const key of Object.keys(input)) {
    if (!PROFILE_KNOWN_FIELDS.has(key)) return { ok: false, error: `账号画像包含未知字段：${key}` };
  }
  for (const key of PROFILE_IGNORED_FIELDS) {
    if (!(key in input)) continue;
    const metadata = input[key];
    if (typeof metadata !== 'string') return { ok: false, error: `账号画像的${key}必须是字符串` };
    if (metadata.trim().length > 1200) return { ok: false, error: `账号画像的${key}不能超过 1200 字` };
  }

  const profile: PublishProfile = {};
  for (const field of PROFILE_TEXT_FIELDS) {
    if (!(field.key in input)) continue;
    const raw = input[field.key];
    if (typeof raw !== 'string') return { ok: false, error: `账号画像的${field.label}必须是字符串` };
    const text = raw.trim();
    if (!text) continue;
    if (text.length > field.limit) return { ok: false, error: `账号画像的${field.label}不能超过 ${field.limit} 字` };
    profile[field.key] = text;
  }
  for (const field of PROFILE_LIST_FIELDS) {
    if (!(field.key in input)) continue;
    const raw = input[field.key];
    if (!Array.isArray(raw) || raw.some(item => typeof item !== 'string')) {
      return { ok: false, error: `账号画像的${field.label}必须是字符串数组` };
    }
    const items = raw.map(item => item.trim()).filter(Boolean);
    if (items.reduce((length, item) => length + item.length, 0) > field.limit) {
      return { ok: false, error: `账号画像的${field.label}总长度不能超过 ${field.limit} 字` };
    }
    if (items.length) profile[field.key] = items;
  }
  return { ok: true, profile };
}

export function buildPublishPrompt({ source, platform, tone = '', profile = {} }: {
  source: string;
  platform: PublishPlatform;
  tone?: string;
  profile?: PublishProfile;
}) {
  const style = PLATFORMS[platform];
  const profileLines: string[] = [];
  for (const field of PROFILE_TEXT_FIELDS) {
    const value = profile[field.key]?.trim();
    if (value) profileLines.push(`${field.label}：${value}`);
  }
  for (const field of PROFILE_LIST_FIELDS) {
    const values = profile[field.key]?.map(item => item.trim()).filter(Boolean);
    if (values?.length) profileLines.push(`${field.label}：${values.join('、')}`);
  }

  return [
    `你是中文内容编辑。根据下面的素材，为「${style.name}」写一条发布文案。`,
    `平台要求：${style.rule}`,
    tone.trim() ? `语气偏好：${tone.trim()}。` : '',
    profileLines.length ? ['账号画像（仅用于表达与受众适配，不能作为事实来源）：', ...profileLines].join('\n') : '',
    '规则：只使用素材里的事实，不编造数据、亲历或评价；不要提“本视频”“本期节目”；不要输出代码块或解释，只返回符合 JSON Schema 的 JSON。',
    '素材：',
    source.slice(0, 6000),
  ].filter(Boolean).join('\n');
}

const schema = {
  type: 'object',
  additionalProperties: false,
  required: ['title', 'body', 'tags', 'hook'],
  properties: {
    title: { type: 'string', description: '平台风格的标题，单行' },
    body: { type: 'string', description: '正文，可含换行' },
    tags: { type: 'array', items: { type: 'string' }, description: '不带 # 的话题标签' },
    hook: { type: 'string', description: '一句可放在视频开头的钩子文案' },
  },
};

function parseAnswer(text: string) {
  const cleaned = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
  const start = cleaned.indexOf('{'), end = cleaned.lastIndexOf('}');
  const value = JSON.parse(start >= 0 && end > start ? cleaned.slice(start, end + 1) : cleaned) as Record<string, unknown>;
  const title = typeof value.title === 'string' ? value.title.trim() : '';
  const body = typeof value.body === 'string' ? value.body.trim() : '';
  const tags = Array.isArray(value.tags) ? value.tags.map(tag => String(tag).replace(/^#/, '').trim()).filter(Boolean) : [];
  const hook = typeof value.hook === 'string' ? value.hook.trim() : '';
  if (!title || !body) throw new Error('智能体没有给出可用的标题和正文');
  return { title, body, tags, hook };
}

/**
 * 文案发布：把成片标题或文稿交给用户已经接通的本机智能体，按平台风格生成
 * 标题 / 正文 / 话题。不接第三方发布接口，结果只回给界面，由用户复制或导出。
 */
export async function handlePublishApi(req: IncomingMessage, res: ServerResponse) {
  const url = new URL(req.url || '/', 'http://localhost');
  if (url.pathname !== '/generate' || req.method !== 'POST') {
    return sendJson(res, 404, { ok: false, error: '文案发布没有这个接口' });
  }
  let work = '';
  try {
    const body = await bodyJson(req) as { source?: unknown; platform?: unknown; tone?: unknown; profile?: unknown };
    const source = typeof body.source === 'string' ? body.source.trim() : '';
    const platform = (typeof body.platform === 'string' ? body.platform : 'xiaohongshu') as PublishPlatform;
    if (!source) return sendJson(res, 400, { ok: false, error: '先粘贴成片标题、口播稿或要点' });
    const style = PLATFORMS[platform];
    if (!style) return sendJson(res, 400, { ok: false, error: '还不支持这个平台' });
    const checkedProfile = validatePublishProfile(body.profile);
    if (!checkedProfile.ok) return sendJson(res, 400, { ok: false, error: checkedProfile.error });
    const tone = typeof body.tone === 'string' ? body.tone : '';

    work = fs.mkdtempSync(path.join(os.tmpdir(), 'ruok-publish-'));
    const schemaFile = path.join(work, 'schema.json');
    const output = path.join(work, 'answer.json');
    fs.writeFileSync(schemaFile, JSON.stringify(schema));

    const prompt = buildPublishPrompt({ source, platform, tone, profile: checkedProfile.profile });

    try {
      const agent = await resolveAgent('publishCopy');
      const result = await runAgent(agent, ['--output-schema', schemaFile, '--output-last-message', output, prompt], { timeout: 180_000, env: process.env });
      const raw = fs.existsSync(output) ? fs.readFileSync(output, 'utf8') : result.stdout;
      return sendJson(res, 200, { ok: true, result: { ...parseAnswer(raw), platform, platformName: style.name } });
    } catch (agentError) {
      // 没接通智能体时也给出可编辑的本地稿，并把原因一并显示，不让页面停在空状态。
      return sendJson(res, 200, {
        ok: true,
        result: { ...localCopy(source, platform), platform, platformName: style.name, local: true, warning: agentError instanceof Error ? agentError.message : String(agentError) },
      });
    }
  } catch (error) {
    return sendJson(res, 500, { ok: false, error: error instanceof Error ? error.message : String(error) });
  } finally {
    if (work) fs.rmSync(work, { recursive: true, force: true });
  }
}
