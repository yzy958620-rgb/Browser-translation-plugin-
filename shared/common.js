/* common.js —— 后台 / 弹窗 / 设置页共用的默认设置与小工具
   注意：本文件既被 service worker（importScripts）加载，也被扩展页面 <script> 加载，
   因此顶层代码不能访问 document / window。 */

const DEFAULT_SETTINGS = {
  apiKey: '',
  model: 'deepseek-chat',
  temperature: 0.3,
  style: 'natural',
  glossary: '',
  customPrompt: '',
  // 全文翻译相关
  targetLang: 'zh',
  pageSourceLang: 'auto',    // 全文翻译源语言，auto = 自动检测
  pageMode: 'bilingual',     // bilingual（沉浸式双语）| translation（只显示译文）
  chunkChars: 3600,          // 每批送出的字符数（略大 = 请求更少 = 提示词开销摊得更薄）
  concurrency: 3,            // 并发请求数
  skipCode: true,            // 跳过代码块
  maxSegments: 3000,         // 单页最多翻译的段落数
  // 省 token 相关
  tokenSaver: true,          // 省流模式：精简提示词、收紧输出上限、照抄补救只重问问题条目
  skipSameScript: true,      // 跳过「已经是目标语言文字」的段落（如中文页里的中文标题）
  persistCache: true,        // 译文缓存跨页面 / 刷新复用，避免重复内容反复计费
  // 弹窗单条翻译：源/目标语言（与全文翻译目标语言相互独立）
  popupSourceLang: 'auto',
  popupTargetLang: 'en'
};

/* 风格只有一份映射：写进提示词用英文短句（中文界面文案塞给模型只会白白烧 token），
   界面上的中文名直接写在 options.html 的 <option> 里，不在 JS 里留第二份。 */
const STYLE_EN = {
  natural: 'natural and fluent',
  formal: 'formal and professional',
  academic: 'rigorous academic',
  casual: 'brief and colloquial',
  email: 'polite email'
};

async function getSettings() {
  const saved = await chrome.storage.sync.get(DEFAULT_SETTINGS);
  return { ...DEFAULT_SETTINGS, ...saved };
}

/* 缓存指纹：模型 / 风格 / 术语表 / 提示词变了，旧译文就失效，不能拿来凑数 */
function cacheFingerprint(s) {
  return [
    s?.model || '',
    s?.style || '',
    s?.targetLang || '',
    s?.pageSourceLang || '',
    (s?.glossary || '').trim(),
    (s?.customPrompt || '').trim()
  ].join('|');
}

/* 用量展示：超过 1 万 token 用 k 记 */
function formatTokens(n) {
  const v = Number(n) || 0;
  return v >= 10000 ? `${(v / 1000).toFixed(1)}k` : String(v);
}

const $ = (sel) => document.querySelector(sel);

/* 写剪贴板：优先 Clipboard API，失败退回 execCommand（弹窗 / 设置页里同样适用） */
async function writeClipboard(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch (_) {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    let ok = false;
    try { ok = document.execCommand('copy'); } catch (_) { ok = false; }
    ta.remove();
    return ok;
  }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    DEFAULT_SETTINGS, STYLE_EN, getSettings, writeClipboard,
    cacheFingerprint, formatTokens
  };
}
