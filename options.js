/* options.js —— 设置页 */

const $ = (sel) => document.querySelector(sel);

const apiKeyEl = $('#apiKey');
const modelEl = $('#model');
const styleEl = $('#style');
const tempEl = $('#temperature');
const tempValEl = $('#tempVal');
const glossaryEl = $('#glossary');
const customPromptEl = $('#customPrompt');
const statusEl = $('#status');
const saveBtn = $('#saveBtn');
const testBtn = $('#testBtn');
const toggleKeyBtn = $('#toggleKey');
const targetLangEl = $('#targetLang');
const pageModeEl = $('#pageMode');
const chunkEl = $('#chunkChars');
const chunkValEl = $('#chunkVal');
const concEl = $('#concurrency');
const concValEl = $('#concVal');
const maxSegEl = $('#maxSegments');
const skipCodeEl = $('#skipCode');

const DEFAULTS = {
  apiKey: '',
  model: 'deepseek-chat',
  temperature: 0.3,
  style: 'natural',
  glossary: '',
  customPrompt: '',
  targetLang: 'zh',
  pageMode: 'bilingual',
  chunkChars: 3000,
  concurrency: 3,
  skipCode: true,
  maxSegments: 3000
};

function setStatus(text, kind = '') {
  statusEl.textContent = text || '';
  statusEl.className = 'status' + (kind ? ` ${kind}` : '');
}

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

async function load() {
  const cfg = await chrome.storage.sync.get(DEFAULTS);
  apiKeyEl.value = cfg.apiKey || '';
  modelEl.value = cfg.model || 'deepseek-chat';
  styleEl.value = cfg.style || 'natural';
  tempEl.value = cfg.temperature ?? 0.3;
  tempValEl.textContent = tempEl.value;
  glossaryEl.value = cfg.glossary || '';
  customPromptEl.value = cfg.customPrompt || '';

  fillTargetLang(cfg.targetLang);
  pageModeEl.value = cfg.pageMode === 'translation' ? 'translation' : 'bilingual';
  chunkEl.value = cfg.chunkChars || 3000;
  chunkValEl.textContent = chunkEl.value;
  concEl.value = cfg.concurrency || 3;
  concValEl.textContent = concEl.value;
  maxSegEl.value = cfg.maxSegments || 3000;
  skipCodeEl.checked = cfg.skipCode !== false;
}

function collect() {
  return {
    apiKey: apiKeyEl.value.trim(),
    model: modelEl.value,
    style: styleEl.value,
    temperature: Number(tempEl.value),
    glossary: glossaryEl.value,
    customPrompt: customPromptEl.value,
    targetLang: targetLangEl.value,
    pageMode: pageModeEl.value,
    chunkChars: Number(chunkEl.value) || 3000,
    concurrency: Math.min(6, Math.max(1, Number(concEl.value) || 3)),
    skipCode: skipCodeEl.checked,
    maxSegments: Number(maxSegEl.value) || 3000
  };
}

tempEl.addEventListener('input', () => {
  tempValEl.textContent = tempEl.value;
});

chunkEl.addEventListener('input', () => {
  chunkValEl.textContent = chunkEl.value;
});

concEl.addEventListener('input', () => {
  concValEl.textContent = concEl.value;
});

toggleKeyBtn.addEventListener('click', () => {
  const isPwd = apiKeyEl.type === 'password';
  apiKeyEl.type = isPwd ? 'text' : 'password';
  toggleKeyBtn.textContent = isPwd ? '隐藏' : '显示';
});

saveBtn.addEventListener('click', async () => {
  await chrome.storage.sync.set(collect());
  setStatus('已保存', 'ok');
  setTimeout(() => setStatus(''), 2500);
});

testBtn.addEventListener('click', async () => {
  const cfg = collect();
  if (!cfg.apiKey) {
    setStatus('请先填写 API Key', 'error');
    return;
  }
  await chrome.storage.sync.set(cfg);
  testBtn.disabled = true;
  testBtn.textContent = '测试中…';
  setStatus('正在请求 DeepSeek…');
  try {
    const res = await chrome.runtime.sendMessage({ type: 'translate', text: '你好，世界！这是一个连接测试。' });
    if (res?.ok) {
      setStatus(`连接成功：${res.text}`, 'ok');
    } else {
      setStatus(`连接失败：${res?.error || '未知错误'}`, 'error');
    }
  } catch (err) {
    setStatus(`连接失败：${err?.message || '未知错误'}`, 'error');
  } finally {
    testBtn.disabled = false;
    testBtn.textContent = '测试连接';
  }
});

const shortcutsLink = $('#shortcutsLink');
if (shortcutsLink) {
  shortcutsLink.addEventListener('click', (e) => {
    e.preventDefault();
    chrome.tabs.create({ url: 'chrome://extensions/shortcuts' });
  });
}

load();
