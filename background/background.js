/* background.js —— service worker：右键菜单 / 快捷键 / 消息路由 / 内容脚本注入
   翻译能力（提示词与 DeepSeek 调用）在 translate.js，语言表与公共设置/工具在 shared/。 */

importScripts('/shared/langs.js', '/shared/common.js', '/background/translate.js');

/* ---------- 与 content script 通信 ---------- */

/* 内容脚本由 manifest 随页面自动注入，这里只兜底「页面在扩展安装/重载之前就已经打开」的情况。
   注意：content.js 依赖 langs.js 里的 TIGHT_LANGS / RTL_LANGS，必须两者一起注入。 */
async function ensureContentScript(tabId) {
  try {
    await chrome.scripting.insertCSS({ target: { tabId }, files: ['content/content.css'] });
    await chrome.scripting.executeScript({ target: { tabId }, files: ['shared/langs.js', 'content/content.js'] });
  } catch (_) {
    /* chrome:// 等不支持注入的页面：忽略 */
  }
}

/* 优先直接发消息（绝大多数情况内容脚本已经在），发不通才补注入并重试一次 */
async function sendToTab(tabId, message) {
  try {
    return await chrome.tabs.sendMessage(tabId, message);
  } catch (_) {
    /* 落到下面补注入 */
  }
  await ensureContentScript(tabId);
  try {
    return await chrome.tabs.sendMessage(tabId, message);
  } catch (_) {
    return null;
  }
}

function keyHint(error) {
  return error === 'MISSING_KEY' ? '请先在设置页填写 DeepSeek API Key' : error;
}

/* ---------- 选中文字翻译 ---------- */

async function handleSelectionTranslate(tabId) {
  // 选中翻译的目标语言跟随弹窗里「单条翻译」的目标语言，不再固定英语
  const settings = await getSettings();
  const targetLang = settings.popupTargetLang || 'en';
  const targetName = langShort(targetLang);

  const sel = await sendToTab(tabId, { type: 'getSelection' });
  const source = sel?.text || '';
  if (!source.trim()) {
    await sendToTab(tabId, { type: 'toast', text: '请先选中要翻译的文字', level: 'warn' });
    return;
  }

  await sendToTab(tabId, { type: 'toast', text: `正在翻译为${targetName}…`, level: 'info', sticky: true });
  const result = await translate(source, { targetLang, sourceLang: 'auto' });
  if (!result.ok) {
    await sendToTab(tabId, { type: 'toast', text: keyHint(result.error), level: 'error' });
    if (result.error === 'MISSING_KEY') chrome.runtime.openOptionsPage();
    return;
  }

  const replaced = await sendToTab(tabId, { type: 'replaceSelection', text: result.text });
  if (!replaced?.ok) {
    await sendToTab(tabId, { type: 'toast', text: '译文已生成但无法替换原文，已复制到剪贴板', level: 'warn' });
    try {
      await chrome.scripting.executeScript({
        target: { tabId },
        func: (t) => navigator.clipboard?.writeText(t),
        args: [result.text]
      });
    } catch (_) { /* ignore */ }
    return;
  }
  // 带上 undoText，页面提示条里才会出现「撤销」按钮
  await sendToTab(tabId, { type: 'toast', text: `已替换为${targetName}（可撤销）`, level: 'success', undoText: source });
}

/* ---------- 全文翻译入口 ---------- */

/* 成功返回 {ok:true}；未配置 Key 返回 {ok:false, reason:'MISSING_KEY'}；注入失败返回 {ok:false, error} */
async function startPageTranslate(tab) {
  if (!tab?.id) return { ok: false, error: '没有可用的网页' };
  const res = await sendToTab(tab.id, { type: 'startPageTranslate' });
  return res || { ok: false, error: '页面不支持脚本注入（chrome:// 等页面无法翻译）' };
}

async function restorePage(tab) {
  if (!tab?.id) return { ok: false, error: '没有可用的网页' };
  const res = await sendToTab(tab.id, { type: 'restorePage' });
  return res || { ok: false, error: '页面不支持脚本注入（chrome:// 等页面无法翻译）' };
}

/* 统一动作入口：右键菜单、快捷键与页面级快捷键兜底都走这里，
   1.5 秒内同标签页同动作只执行一次，避免「commands + 页面兜底」双触发 */
let lastTrigger = { tabId: -1, action: '', time: 0 };

async function triggerAction(tab, action) {
  if (!tab?.id || !action) return;
  const now = Date.now();
  if (lastTrigger.tabId === tab.id && lastTrigger.action === action && now - lastTrigger.time < 1500) return;
  lastTrigger = { tabId: tab.id, action, time: now };

  if (action === 'restore') {
    await restorePage(tab);
    return;
  }
  if (action === 'selection') {
    await handleSelectionTranslate(tab.id);
    return;
  }
  const res = await startPageTranslate(tab);
  if (!res.ok && res.reason === 'MISSING_KEY') chrome.runtime.openOptionsPage();
}

/* ---------- 右键菜单 ---------- */

const MENU = {
  pageTranslate: 'dst-page-translate',
  pageRestore: 'dst-page-restore',
  selectionReplace: 'dst-selection-replace',
  selectionCopy: 'dst-selection-copy'
};

async function setupMenus() {
  try {
    await chrome.contextMenus.removeAll();
  } catch (_) { /* ignore */ }
  const settings = await getSettings();
  const target = langShort(settings.targetLang);
  const selTarget = langShort(settings.popupTargetLang || 'en');
  chrome.contextMenus.create({
    id: MENU.pageTranslate,
    title: `DeepSeek 全文翻译此页 → ${target}`,
    contexts: ['page', 'frame']
  });
  chrome.contextMenus.create({
    id: MENU.pageRestore,
    title: '恢复网页原文',
    contexts: ['page', 'frame']
  });
  chrome.contextMenus.create({
    id: MENU.selectionReplace,
    title: `用 AI 翻译为${selTarget}`,
    contexts: ['selection']
  });
  chrome.contextMenus.create({
    id: MENU.selectionCopy,
    title: `翻译为${selTarget}并复制`,
    contexts: ['selection']
  });
}

chrome.runtime.onInstalled.addListener(setupMenus);
chrome.runtime.onStartup.addListener(setupMenus);

/* 改了目标语言 / 模型后重建菜单文案 */
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'sync' && (changes.targetLang || changes.model || changes.popupTargetLang)) {
    setupMenus().catch(() => { /* ignore */ });
  }
});

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  switch (info.menuItemId) {
    case MENU.pageTranslate: {
      const res = await startPageTranslate(tab);
      if (!res.ok && res.reason === 'MISSING_KEY') chrome.runtime.openOptionsPage();
      break;
    }
    case MENU.pageRestore:
      await restorePage(tab);
      break;
    case MENU.selectionReplace:
      if (tab?.id) await handleSelectionTranslate(tab.id);
      break;
    case MENU.selectionCopy: {
      if (!tab?.id) break;
      const sel = await sendToTab(tab.id, { type: 'getSelection' });
      if (!sel?.text?.trim()) break;
      const settings = await getSettings();
      const result = await translate(sel.text, { targetLang: settings.popupTargetLang || 'en', sourceLang: 'auto' });
      if (!result.ok) {
        await sendToTab(tab.id, { type: 'toast', text: keyHint(result.error), level: 'error' });
        break;
      }
      await sendToTab(tab.id, { type: 'copyText', text: result.text });
      break;
    }
    default:
      break;
  }
});

/* ---------- 快捷键（含页面级兜底转发） ---------- */

const COMMAND_ACTION = {
  'translate-page': 'page',
  'restore-page': 'restore',
  'translate-selection': 'selection'
};

chrome.commands.onCommand.addListener(async (command) => {
  const action = COMMAND_ACTION[command];
  if (!action) return;
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  await triggerAction(tab, action);
});

/* ---------- 消息路由（弹窗 / 设置页 / 内容脚本） ---------- */

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  switch (msg?.type) {
    case 'translate':
      translate(msg.text, { style: msg.style, sourceLang: msg.sourceLang, targetLang: msg.targetLang })
        .then(sendResponse)
        .catch((err) => sendResponse({ ok: false, error: err?.message || '翻译失败' }));
      return true;

    case 'translateBatch':
      translateBatch(msg.items, msg.targetLang, msg.sourceLang)
        .then(sendResponse)
        .catch((err) => sendResponse({ ok: false, error: err?.message || '翻译失败' }));
      return true;

    case 'getSettings':
      getSettings()
        .then(sendResponse)
        .catch(() => sendResponse(null));
      return true;

    case 'shortcut':
      // 页面级快捷键兜底（content script 转发），与 commands 共用入口并节流
      triggerAction(sender?.tab, msg.action).then(() => sendResponse({ ok: true }));
      return true;

    case 'pageTranslate':
    case 'restorePage':
      // 弹窗触发：作用在当前标签页
      (async () => {
        try {
          const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
          sendResponse(msg.type === 'pageTranslate' ? await startPageTranslate(tab) : await restorePage(tab));
        } catch (err) {
          sendResponse({ ok: false, error: err?.message || '操作失败' });
        }
      })();
      return true;

    case 'openOptions':
      chrome.runtime.openOptionsPage();
      sendResponse({ ok: true });
      return undefined;

    default:
      return undefined;
  }
});
