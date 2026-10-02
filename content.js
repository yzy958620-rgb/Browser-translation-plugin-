/* content.js —— 与网页交互：读取选区、替换选区、插入输入框、提示条 */

(() => {
  if (window.__zh2enLoaded) return;
  window.__zh2enLoaded = true;

  let lastEditable = null;
  let lastState = null; // { focusEl, start, end }

  const EDITABLE_TAGS = ['INPUT', 'TEXTAREA'];

  function isEditable(el) {
    if (!el) return false;
    if (EDITABLE_TAGS.includes(el.tagName)) {
      const t = (el.type || 'text').toLowerCase();
      return !['checkbox', 'radio', 'button', 'submit', 'file', 'range', 'color'].includes(t);
    }
    return el.isContentEditable === true;
  }

  document.addEventListener('focusin', (e) => {
    if (isEditable(e.target)) lastEditable = e.target;
  }, true);

  document.addEventListener('focusout', (e) => {
    if (isEditable(e.target)) {
      lastState = {
        focusEl: e.target,
        start: e.target.selectionStart,
        end: e.target.selectionEnd
      };
    }
  }, true);

  /* ---------- 提示条 ---------- */
  let toastEl = null;
  let toastTimer = null;

  function showToast({ text, level = 'info', sticky = false, undoText }) {
    hideToast();
    const colors = {
      info: '#2563eb',
      success: '#16a34a',
      warn: '#d97706',
      error: '#dc2626'
    };
    toastEl = document.createElement('div');
    toastEl.className = 'zh2en-toast';
    toastEl.style.cssText = `
      position: fixed; top: 16px; right: 16px; z-index: 2147483647;
      max-width: 380px; padding: 10px 14px; border-radius: 10px;
      background: ${colors[level] || colors.info}; color: #fff;
      font: 13px/1.5 -apple-system, "Segoe UI", "Microsoft YaHei", sans-serif;
      box-shadow: 0 8px 24px rgba(0,0,0,.24); display: flex; gap: 10px; align-items: center;
    `;
    const span = document.createElement('span');
    span.textContent = text;
    span.style.flex = '1';
    toastEl.appendChild(span);

    if (undoText) {
      const btn = document.createElement('button');
      btn.textContent = '撤销';
      btn.style.cssText = 'background: rgba(255,255,255,.18); border: 1px solid rgba(255,255,255,.5); color:#fff; border-radius:6px; padding:3px 10px; cursor:pointer; font-size:12px;';
      btn.addEventListener('click', () => {
        undoReplace(undoText);
        hideToast();
      });
      toastEl.appendChild(btn);
    }
    document.body.appendChild(toastEl);

    if (!sticky) {
      toastTimer = setTimeout(hideToast, 3200);
    }
  }

  function hideToast() {
    if (toastTimer) { clearTimeout(toastTimer); toastTimer = null; }
    if (toastEl && toastEl.parentNode) toastEl.parentNode.removeChild(toastEl);
    toastEl = null;
  }

  /* ---------- 值写入（兼容 React / Vue 等框架） ---------- */
  function nativeSetValue(el, value) {
    const proto = el.tagName === 'TEXTAREA'
      ? window.HTMLTextAreaElement.prototype
      : (el.tagName === 'INPUT' ? window.HTMLInputElement.prototype : null);
    const desc = proto && Object.getOwnPropertyDescriptor(proto, 'value');
    if (desc && desc.set) desc.set.call(el, value);
    else el.value = value;
  }

  function dispatchUpdate(el) {
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  }

  /* ---------- 替换选区 ---------- */
  let lastUndo = null;

  function replaceInField(el, text) {
    const start = el.selectionStart;
    const end = el.selectionEnd;
    if (start === null || end === null || start === end) return false;
    const oldValue = el.value;
    const newValue = oldValue.slice(0, start) + text + oldValue.slice(end);
    nativeSetValue(el, newValue);
    dispatchUpdate(el);
    const caret = start + text.length;
    try { el.setSelectionRange(caret, caret); } catch (_) { /* ignore */ }
    el.focus();
    lastUndo = { mode: 'field', el, start, end, oldValue, newValue };
    return true;
  }

  function replaceInRange(text) {
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0 || sel.isCollapsed) return false;
    const range = sel.getRangeAt(0);
    const backup = range.cloneContents();
    range.deleteContents();
    const node = document.createTextNode(text);
    range.insertNode(node);

    const newRange = document.createRange();
    newRange.selectNode(node);
    sel.removeAllRanges();
    sel.addRange(newRange);

    lastUndo = { mode: 'range', node, backup };
    return true;
  }

  function undoReplace() {
    if (!lastUndo) return;
    try {
      if (lastUndo.mode === 'field') {
        const { el, oldValue, start, end } = lastUndo;
        nativeSetValue(el, oldValue);
        dispatchUpdate(el);
        el.focus();
        try { el.setSelectionRange(start, end); } catch (_) { /* ignore */ }
      } else if (lastUndo.mode === 'range') {
        const { node, backup } = lastUndo;
        if (!node.parentNode) return;
        const r = document.createRange();
        r.selectNode(node);
        r.deleteContents();
        r.insertNode(backup);
      }
    } catch (_) { /* ignore */ }
    lastUndo = null;
  }

  /* ---------- 插入（供弹窗调用） ---------- */
  function insertText(text) {
    let el = lastEditable;
    if (!el || !document.contains(el)) {
      el = (lastState && document.contains(lastState.focusEl)) ? lastState.focusEl : null;
    }
    if (!el || !isEditable(el)) return { ok: false, reason: 'no-editable' };

    el.focus();
    if (EDITABLE_TAGS.includes(el.tagName)) {
      const start = el.selectionStart ?? el.value.length;
      const end = el.selectionEnd ?? start;
      const newValue = el.value.slice(0, start) + text + el.value.slice(end);
      nativeSetValue(el, newValue);
      dispatchUpdate(el);
      const caret = start + text.length;
      try { el.setSelectionRange(caret, caret); } catch (_) { /* ignore */ }
    } else {
      const sel = window.getSelection();
      let range = null;
      if (sel && sel.rangeCount > 0) range = sel.getRangeAt(0);
      if (!range || !el.contains(range.commonAncestorContainer)) {
        range = document.createRange();
        range.selectNodeContents(el);
        range.collapse(false);
      }
      range.deleteContents();
      const node = document.createTextNode(text);
      range.insertNode(node);
      const nr = document.createRange();
      nr.selectNode(node);
      nr.collapse(false);
      sel.removeAllRanges();
      sel.addRange(nr);
    }
    el.focus();
    showToast({ text: '已插入到网页输入框', level: 'success' });
    return { ok: true };
  }

  async function copyText(text) {
    try {
      await navigator.clipboard.writeText(text);
      showToast({ text: '译文已复制', level: 'success' });
      return { ok: true };
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
      showToast({ text: ok ? '译文已复制' : '复制失败，请手动复制', level: ok ? 'success' : 'error' });
      return { ok };
    }
  }

  function getSelectionText() {
    const el = document.activeElement;
    if (el && EDITABLE_TAGS.includes(el.tagName) && el.selectionStart !== el.selectionEnd) {
      return el.value.slice(el.selectionStart, el.selectionEnd);
    }
    const sel = window.getSelection();
    return sel ? sel.toString() : '';
  }

  /* ================= 全文翻译 ================= */

  const SKIP_TAGS = new Set([
    'SCRIPT', 'STYLE', 'NOSCRIPT', 'TEMPLATE', 'TEXTAREA', 'IFRAME',
    'SVG', 'CANVAS', 'SELECT', 'OPTION', 'HEAD', 'TITLE', 'META', 'LINK'
  ]);
  const ITEM_MAX_CHARS = 2000;  // 单个文本超过该长度时按句拆成多段（参考值 2400）
  const CHUNK_MAX_ITEMS = 8;    // 单批最多条目数：条目过多会让模型丢项错位

  // 译文缓存：相同原文重复翻译（重翻、动态页面）直接复用，省额度
  const CACHE_LIMIT = 500;
  const CACHE_TTL = 30 * 60 * 1000;
  const translationCache = new Map();

  function cacheKey(text, lang) { return `${lang || 'zh'}\n${text}`; }

  function getCached(text, lang) {
    const key = cacheKey(text, lang);
    const hit = translationCache.get(key);
    if (!hit) return null;
    if (Date.now() - hit.time > CACHE_TTL) {
      translationCache.delete(key);
      return null;
    }
    // 命中后移到末尾，维持简单的 LRU 顺序
    translationCache.delete(key);
    translationCache.set(key, hit);
    return hit.text;
  }

  function setCached(text, lang, translated) {
    const key = cacheKey(text, lang);
    translationCache.delete(key);
    translationCache.set(key, { text: translated, time: Date.now() });
    if (translationCache.size > CACHE_LIMIT) {
      const oldest = translationCache.keys().next().value;
      translationCache.delete(oldest);
    }
  }

  let records = [];             // [{ node, original, segs, wrapper }]
  let pageState = null;         // { chunks, cursor, done, failed, mode, running, targetLang }
  let getSettingsCache = null;

  async function fetchSettings() {
    try {
      const res = await chrome.runtime.sendMessage({ type: 'getSettings' });
      if (res) getSettingsCache = res;
    } catch (_) { /* SW 未唤醒时忽略，用缓存 */ }
    return getSettingsCache || {};
  }

  function isVisible(el) {
    if (typeof el.checkVisibility === 'function') {
      try {
        if (!el.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true })) return false;
      } catch (_) { /* 忽略，走下面的兜底 */ }
    }
    const cs = getComputedStyle(el);
    if (!cs) return false;
    return cs.display !== 'none' && cs.visibility !== 'hidden';
  }

  function collectNodes(opts) {
    if (!document.body) return [];
    const maxCount = Math.max(50, Number(opts.maxSegments) || 3000);
    const found = [];
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, {
      acceptNode(node) {
        const text = node.nodeValue;
        if (!text || !text.trim()) return NodeFilter.FILTER_REJECT;
        const parent = node.parentElement;
        if (!parent) return NodeFilter.FILTER_REJECT;
        if (SKIP_TAGS.has(parent.tagName)) return NodeFilter.FILTER_REJECT;
        if (parent.closest('[data-dst-translation]')) return NodeFilter.FILTER_REJECT;
        if (parent.closest('.zh2en-toast')) return NodeFilter.FILTER_REJECT;
        if (opts.skipCode && parent.closest('code, pre, kbd, samp, var')) return NodeFilter.FILTER_REJECT;
        if (!isVisible(parent)) return NodeFilter.FILTER_REJECT;
        return NodeFilter.FILTER_ACCEPT;
      }
    });

    let node;
    while ((node = walker.nextNode())) {
      found.push(node);
      if (found.length >= maxCount) break;
    }
    return found;
  }

  function splitSegments(text, maxLen) {
    if (text.length <= maxLen) return [text];
    const out = [];
    let cur = '';
    for (const ch of text) {
      cur += ch;
      if (cur.length >= maxLen && /[\n.!?。！？；;]/.test(ch)) {
        out.push(cur);
        cur = '';
      } else if (cur.length >= maxLen * 2) {
        out.push(cur);
        cur = '';
      }
    }
    if (cur) out.push(cur);
    return out;
  }

  /* 翻译顺序：视口内的正文先翻（滚动位置附近即时可见），导航/页脚最后 */
  function contentPriority(el) {
    if (el.closest('article, main, [role="main"]')) return 0;
    if (el.closest('nav, aside, header, footer, [role="navigation"]')) return 10;
    return 5;
  }

  function sortByPriority(nodes) {
    const vh = window.innerHeight || 800;
    const scored = nodes.map((node, index) => {
      let score = 0;
      const el = node.parentElement;
      if (el) {
        score += contentPriority(el);
        let offscreen = true;
        try {
          const r = el.getBoundingClientRect();
          if (r) offscreen = r.bottom < 0 || r.top > vh;
        } catch (_) { /* ignore */ }
        if (offscreen) score += 10;
      }
      return { node, index, score };
    });
    scored.sort((a, b) => a.score - b.score || a.index - b.index);
    return scored.map((item) => item.node);
  }

  function buildRecords(nodes) {
    return nodes.map((node) => {
      const original = node.nodeValue;
      return {
        node,
        original,
        segs: splitSegments(original, ITEM_MAX_CHARS).map((text) => ({ text, translated: null })),
        inserted: null
      };
    });
  }

  function buildChunks(recs, chunkChars) {
    const items = [];
    recs.forEach((rec) => rec.segs.forEach((seg, i) => items.push({ rec, i })));

    const chunks = [];
    let buf = [];
    let chars = 0;
    for (const it of items) {
      const len = it.rec.segs[it.i].text.length;
      if (buf.length && (buf.length >= CHUNK_MAX_ITEMS || chars + len > chunkChars)) {
        chunks.push(buf);
        buf = [];
        chars = 0;
      }
      buf.push(it);
      chars += len;
    }
    if (buf.length) chunks.push(buf);
    return chunks;
  }

  /* ---------- DOM 渲染 ---------- */

  function currentText(rec) {
    let out = '';
    for (const seg of rec.segs) out += (seg.translated == null ? seg.text : seg.translated);
    return out;
  }

  function hasAnyTranslation(rec) {
    return rec.segs.some((seg) => seg.translated != null);
  }

  function removeInserted(rec) {
    if (rec.inserted && rec.inserted.parentNode) rec.inserted.remove();
    rec.inserted = null;
  }

  /* 块级容器 → 译文独立成段；内联容器 → 译文紧随其后 */
  function isBlockLike(el) {
    const d = getComputedStyle(el).display;
    return d === 'block' || d === 'flex' || d === 'grid' || d === 'list-item' ||
      d === 'flow-root' || d === 'table' || d === 'table-cell' || d === 'table-caption';
  }

  function insertTranslation(rec, text) {
    if (rec.inserted && rec.inserted.parentNode) {
      rec.inserted.textContent = text;
      return;
    }
    const parent = rec.node.parentNode;
    if (!parent) return;
    const block = isBlockLike(parent);
    const el = document.createElement('span');
    el.className = block ? 'dst-block-translation' : 'dst-inline-translation';
    el.setAttribute('data-dst-translation', '1');
    el.textContent = text;
    if (block) parent.appendChild(el);
    else parent.insertBefore(el, rec.node.nextSibling);
    rec.inserted = el;
  }

  function applyRec(rec, mode) {
    if (!document.contains(rec.node)) {
      removeInserted(rec);
      return;
    }
    const text = currentText(rec);
    if (mode === 'bilingual') {
      // 沉浸式：原文保持不动，译文插入原文下方
      rec.node.nodeValue = rec.original;
      if (hasAnyTranslation(rec)) insertTranslation(rec, text);
      else removeInserted(rec);
    } else {
      removeInserted(rec);
      rec.node.nodeValue = (mode === 'translation' && hasAnyTranslation(rec)) ? text : rec.original;
    }
  }

  function applyAll(mode) {
    for (const rec of records) {
      try { applyRec(rec, mode); } catch (_) { /* 单个节点失败不影响整体 */ }
    }
  }

  function restoreOriginal() {
    for (const rec of records) {
      try {
        removeInserted(rec);
        if (rec.node) rec.node.nodeValue = rec.original;
      } catch (_) { /* ignore */ }
    }
  }

  /* 显示模式归一化：bilingual（沉浸式双语）| translation（只显示译文）| original（保持原文） */
  function normalizeMode(mode) {
    return (mode === 'translation' || mode === 'original') ? mode : 'bilingual';
  }

  /* ---------- 主流程 ---------- */

  async function worker(state, settings) {
    while (state.running) {
      const index = state.cursor++;
      if (index >= state.chunks.length) return;
      const chunk = state.chunks[index];
      const lang = settings.targetLang;

      // 命中缓存的直接回填，剩余部分再交给模型，避免重复消耗额度
      const pending = [];
      for (const it of chunk) {
        const seg = it.rec.segs[it.i];
        const cached = getCached(seg.text, lang);
        if (cached != null) seg.translated = cached;
        else pending.push(it);
      }

      if (pending.length) {
        const texts = pending.map((it) => it.rec.segs[it.i].text);
        let res = null;
        try {
          res = await chrome.runtime.sendMessage({
            type: 'translateBatch',
            items: texts,
            targetLang: lang
          });
        } catch (_) {
          res = { ok: false, error: '与后台通信失败' };
        }

        const aligned = Array.isArray(res?.translations) && res.translations.length === texts.length;
        if (res?.ok && aligned) {
          pending.forEach((it, i) => {
            const val = res.translations[i];
            if (typeof val === 'string' && val.trim()) {
              it.rec.segs[it.i].translated = val;
              setCached(texts[i], lang, val);
            }
          });
          state.done++;
        } else {
          if (res?.error === 'MISSING_KEY') {
            state.running = false;
            state.keyError = true;
            return;
          }
          state.failed++;
          // 译文数量不对时整批作废，避免译文错位显示
          state.lastError = res?.error ||
            (Array.isArray(res?.translations) ? '译文数量不匹配，已跳过该批' : '未知错误');
        }
      } else {
        state.done++;
      }

      chunk.forEach((it) => applyRec(it.rec, state.mode));
      if (!state.running) return;
    }
  }

  async function startPageTranslate() {
    if (pageState?.running) {
      showToast({ text: '正在翻译中，请稍候…', level: 'info' });
      return;
    }

    const settings = await fetchSettings();
    if (!settings.apiKey) {
      showToast({ text: '请先在设置页填写 DeepSeek API Key', level: 'error' });
      chrome.runtime.sendMessage({ type: 'openOptions' }).catch(() => {});
      return;
    }

    // 上一轮译文先还原，避免把译文当成原文再翻一次
    if (records.length) restoreOriginal();
    records = [];

    const nodes = collectNodes({
      skipCode: settings.skipCode !== false,
      maxSegments: settings.maxSegments
    });
    if (!nodes.length) {
      showToast({ text: '这个页面没有检测到可翻译的文字', level: 'warn' });
      return;
    }

    records = buildRecords(sortByPriority(nodes));
    const chunks = buildChunks(records, Number(settings.chunkChars) || 3000);

    const state = {
      chunks,
      cursor: 0,
      done: 0,
      failed: 0,
      running: true,
      mode: normalizeMode(settings.pageMode),
      keyError: false,
      lastError: ''
    };
    pageState = state;

    // 不再弹出悬浮面板，只用一条自动消失的提示条；翻译期间可随时用快捷键还原
    showToast({ text: '开始翻译，请稍候…（Alt+Shift+R 可还原）', level: 'info' });

    const concurrency = Math.min(6, Math.max(1, Number(settings.concurrency) || 3));
    const workers = [];
    for (let i = 0; i < Math.min(concurrency, chunks.length); i++) {
      workers.push(worker(state, settings));
    }

    await Promise.all(workers);

    if (state.keyError) {
      showToast({ text: '未配置 DeepSeek API Key', level: 'error' });
      chrome.runtime.sendMessage({ type: 'openOptions' }).catch(() => {});
      return;
    }

    state.running = false;
    applyAll(state.mode);
    if (state.failed && state.done === 0) {
      showToast({ text: `翻译失败：${state.lastError}`, level: 'error' });
    } else if (state.failed) {
      showToast({ text: `完成，但有 ${state.failed} 批失败（${state.lastError}）`, level: 'warn' });
    } else if (state.mode === 'original') {
      showToast({ text: `已翻译 ${records.length} 段，当前保持原文显示（弹窗或设置里可切换显示样式）`, level: 'success' });
    } else {
      showToast({ text: `已翻译 ${records.length} 段（快捷键 Alt+Shift+R 还原）`, level: 'success' });
    }
  }

  function stopAndRestore() {
    if (pageState) pageState.running = false;
    pageState = null;
    restoreOriginal();
    records = [];
  }

  /* 快捷键页面级兜底：即使 Chrome commands 失效（焦点异常、冲突等），
     只要页面获得焦点就能触发；由 background 统一节流防止双触发。
     注意 Ctrl+T 是浏览器保留快捷键（新建标签页），仍会优先打开新标签页。 */
  document.addEventListener('keydown', (e) => {
    if (e.defaultPrevented || !e.isTrusted) return;
    const k = (e.key || '').toLowerCase();
    const el = document.activeElement;
    const typing = el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable);

    let action = null;
    if ((e.ctrlKey || e.metaKey) && !e.altKey && !e.shiftKey && k === 't') action = 'page';
    else if (e.altKey && e.shiftKey && !e.ctrlKey && !e.metaKey) {
      if (k === 't') action = 'page';
      else if (k === 'r') action = 'restore';
      else if (k === 's') action = 'selection';
    }
    if (!action || typing) return;

    e.preventDefault();
    e.stopPropagation();
    try {
      const p = chrome.runtime.sendMessage({ type: 'shortcut', action });
      if (p && p.catch) p.catch(() => { /* ignore */ });
    } catch (_) { /* ignore */ }
  }, true);

  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    switch (msg?.type) {
      case 'getSelection':
        sendResponse({ text: getSelectionText() });
        break;
      case 'startPageTranslate':
        if (pageState?.running) {
          sendResponse({ ok: true, already: true });
          break;
        }
        (async () => {
          const settings = await fetchSettings();
          if (!settings.apiKey) return sendResponse({ ok: false, reason: 'MISSING_KEY' });
          startPageTranslate();
          sendResponse({ ok: true });
        })();
        return true;
      case 'restorePage':
        stopAndRestore();
        showToast({ text: '已恢复原文', level: 'success' });
        sendResponse({ ok: true });
        break;
      case 'setPageMode':
        // 弹窗 / 设置页切换显示样式：不重新翻译，直接复用已有译文
        if (pageState) {
          pageState.mode = normalizeMode(msg.mode);
          applyAll(pageState.mode);
        }
        sendResponse({ ok: !!pageState, mode: pageState ? pageState.mode : normalizeMode(msg.mode) });
        break;
      case 'replaceSelection': {
        const sel = window.getSelection();
        const hasDocSelection = sel && sel.rangeCount > 0 && !sel.isCollapsed && sel.toString().trim();
        let ok = false;
        if (hasDocSelection) {
          ok = replaceInRange(msg.text);
        }
        if (!ok) {
          let el = document.activeElement;
          if (!isEditable(el)) {
            el = (lastState && document.contains(lastState.focusEl)) ? lastState.focusEl : null;
          }
          if (el && isEditable(el)) ok = replaceInField(el, msg.text);
        }
        sendResponse({ ok });
        break;
      }
      case 'insertText':
        sendResponse(insertText(msg.text));
        break;
      case 'copyText':
        copyText(msg.text).then(sendResponse);
        return true;
      case 'undo':
        undoReplace();
        sendResponse({ ok: true });
        break;
      case 'toast':
        showToast(msg);
        sendResponse({ ok: true });
        break;
      default:
        sendResponse({ ok: false });
    }
    return undefined;
  });
})();
