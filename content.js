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

  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    switch (msg?.type) {
      case 'getSelection':
        sendResponse({ text: getSelectionText() });
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
