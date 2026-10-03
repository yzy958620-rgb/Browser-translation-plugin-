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
  chunkChars: 3000,          // 每批送出的字符数
  concurrency: 3,            // 并发请求数
  skipCode: true,            // 跳过代码块
  maxSegments: 3000,         // 单页最多翻译的段落数
  // 弹窗单条翻译：源/目标语言（与全文翻译目标语言相互独立）
  popupSourceLang: 'auto',
  popupTargetLang: 'en'
};

const STYLE_DESC = {
  natural: '自然流畅的日常表达（默认）',
  formal: '正式专业的商务风格',
  academic: '严谨的学术风格',
  casual: '简短随意的口语风格',
  email: '礼貌得体的邮件风格'
};

async function getSettings() {
  const saved = await chrome.storage.sync.get(DEFAULT_SETTINGS);
  return { ...DEFAULT_SETTINGS, ...saved };
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
  module.exports = { DEFAULT_SETTINGS, STYLE_DESC, getSettings, writeClipboard };
}
