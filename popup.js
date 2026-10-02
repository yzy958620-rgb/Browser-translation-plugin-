/* popup.js —— 弹窗交互 */

const $ = (sel) => document.querySelector(sel);

const inputEl = $('#input');
const outputEl = $('#output');
const styleEl = $('#style');
const countEl = $('#count');
const statusEl = $('#status');
const translateBtn = $('#translateBtn');
const copyBtn = $('#copyBtn');
const insertBtn = $('#insertBtn');
const clearBtn = $('#clearBtn');
const settingsBtn = $('#settingsBtn');
const warnEl = $('#warn');
const warnBtn = $('#warnBtn');
const targetLangEl = $('#targetLang');
const pageBtn = $('#pageBtn');
const restoreBtn = $('#restoreBtn');

let apiKey = '';

function fillTargetLang(current) {
  targetLangEl.innerHTML = '';
  Object.keys(LANGUAGES).forEach((code) => {
    const opt = document.createElement('option');
    opt.value = code;
    opt.textContent = LANGUAGES[code];
    targetLangEl.appendChild(opt);
  });
  targetLangEl.value = LANGUAGES[current] ? current : 'zh';
}

function setStatus(text, kind = '') {
  statusEl.textContent = text || '';
  statusEl.className = 'status' + (kind ? ` ${kind}` : '');
}

function updateCount() {
  countEl.textContent = `${inputEl.value.length} 字`;
}

async function init() {
  const cfg = await chrome.storage.sync.get({ apiKey: '', style: 'natural', targetLang: 'zh' });
  apiKey = cfg.apiKey || '';
  if (cfg.style) styleEl.value = cfg.style;
  fillTargetLang(cfg.targetLang);
  warnEl.classList.toggle('hidden', !!apiKey);
  updateCount();
  inputEl.focus();
}

inputEl.addEventListener('input', updateCount);

inputEl.addEventListener('keydown', (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
    e.preventDefault();
    runTranslate();
  }
});

translateBtn.addEventListener('click', runTranslate);

clearBtn.addEventListener('click', () => {
  inputEl.value = '';
  outputEl.value = '';
  updateCount();
  setStatus('');
  inputEl.focus();
});

settingsBtn.addEventListener('click', () => chrome.runtime.openOptionsPage());
warnBtn.addEventListener('click', () => chrome.runtime.openOptionsPage());

styleEl.addEventListener('change', () => {
  chrome.storage.sync.set({ style: styleEl.value });
});

targetLangEl.addEventListener('change', () => {
  chrome.storage.sync.set({ targetLang: targetLangEl.value });
});

pageBtn.addEventListener('click', async () => {
  if (!apiKey) {
    setStatus('请先配置 API Key', 'error');
    warnEl.classList.remove('hidden');
    return;
  }
  await chrome.storage.sync.set({ targetLang: targetLangEl.value });
  pageBtn.disabled = true;
  pageBtn.textContent = '启动中…';
  try {
    const res = await chrome.runtime.sendMessage({ type: 'pageTranslate' });
    if (res?.ok) {
      window.close();
      return;
    }
    if (res?.reason === 'MISSING_KEY') {
      setStatus('请先配置 API Key', 'error');
      chrome.runtime.openOptionsPage();
      return;
    }
    setStatus(res?.error || '翻译失败', 'error');
  } catch (err) {
    setStatus(err?.message || '翻译失败', 'error');
  } finally {
    pageBtn.disabled = false;
    pageBtn.textContent = '翻译此页';
  }
});

restoreBtn.addEventListener('click', async () => {
  try {
    await chrome.runtime.sendMessage({ type: 'restorePage' });
  } catch (_) { /* ignore */ }
  window.close();
});

async function runTranslate() {
  const text = inputEl.value.trim();
  if (!text) {
    setStatus('请先输入中文', 'error');
    inputEl.focus();
    return;
  }
  if (!apiKey) {
    setStatus('请先配置 API Key', 'error');
    warnEl.classList.remove('hidden');
    return;
  }

  translateBtn.disabled = true;
  translateBtn.textContent = '翻译中…';
  setStatus('正在调用 DeepSeek…');
  outputEl.value = '';

  try {
    const res = await chrome.runtime.sendMessage({
      type: 'translate',
      text,
      style: styleEl.value
    });
    if (res?.ok) {
      outputEl.value = res.text;
      setStatus('完成', 'ok');
    } else {
      setStatus(res?.error || '翻译失败', 'error');
      if (res?.error === 'MISSING_KEY') warnEl.classList.remove('hidden');
    }
  } catch (err) {
    setStatus(err?.message || '翻译失败', 'error');
  } finally {
    translateBtn.disabled = false;
    translateBtn.textContent = '翻译';
  }
}

copyBtn.addEventListener('click', async () => {
  if (!outputEl.value) return;
  const ok = await writeClipboard(outputEl.value);
  setStatus(ok ? '已复制' : '复制失败', ok ? 'ok' : 'error');
});

insertBtn.addEventListener('click', async () => {
  if (!outputEl.value) return;
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) return setStatus('没有可用的网页', 'error');

  try {
    const res = await chrome.tabs.sendMessage(tab.id, { type: 'insertText', text: outputEl.value });
    if (res?.ok) {
      setStatus('已填入网页输入框', 'ok');
      window.close();
      return;
    }
  } catch (_) {
    /* 页面未注入脚本，走下面的兜底 */
  }
  const ok = await writeClipboard(outputEl.value);
  setStatus(ok ? '该页面不支持直接填入，已复制' : '填入失败，请手动复制', ok ? 'ok' : 'error');
});

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

init();
