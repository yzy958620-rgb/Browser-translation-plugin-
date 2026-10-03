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

  let records = [];             // [{ idx, node, original, segs, target, group }]，按视口优先级排序
  let pageState = null;         // { alive, queue, orderDirty, mode, running, pumping, done, failed, ... }
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

  /* 无意义文本：纯数字 / 纯符号 / 孤立单个西文字母。
     单个字母（如列表标号 “A”、“T.”）翻出来只会变成“一个”这类废话，
     而 t-shirt、don't 这类多字符词不受影响，照常翻译。 */
  function isTrivialText(text) {
    const t = text.trim();
    if (!t) return true;
    if (!/\p{L}/u.test(t)) return true;                       // 没有任何字母或汉字
    const core = t.replace(/[\d\p{P}\p{S}\s]/gu, '');         // 剥掉数字、标点、符号
    return /^[A-Za-z]$/.test(core);                           // 只剩一个西文字母
  }

  let seenNodes = new WeakSet();   // 已纳入翻译范围的文本节点（含动态新增的）

  function textFilter(opts) {
    return function accept(node) {
      const text = node.nodeValue;
      if (!text || !text.trim()) return false;
      if (isTrivialText(text)) return false;
      const parent = node.parentElement;
      if (!parent) return false;
      if (SKIP_TAGS.has(parent.tagName)) return false;
      if (parent.closest('[data-dst-translation]')) return false;
      if (parent.closest('.zh2en-toast')) return false;
      if (opts.skipCode && parent.closest('code, pre, kbd, samp, var')) return false;
      if (!isVisible(parent)) return false;
      if (seenNodes.has(node)) return false;
      return true;
    };
  }

  function walkText(root, accept, limit) {
    const found = [];
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode(node) {
        return accept(node) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
      }
    });
    let node;
    while ((node = walker.nextNode())) {
      found.push(node);
      if (limit && found.length >= limit) break;
    }
    return found;
  }

  function collectNodes(opts) {
    if (!document.body) return [];
    const maxCount = Math.max(50, Number(opts.maxSegments) || 3000);
    return walkText(document.body, textFilter(opts), maxCount);
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

  function buildRecords(nodes, baseIdx) {
    return nodes.map((node, i) => {
      const original = node.nodeValue;
      seenNodes.add(node);
      return {
        idx: (baseIdx || 0) + i,
        node,
        original,
        segs: splitSegments(original, ITEM_MAX_CHARS).map((text) => ({ text, translated: null })),
        target: null,
        group: null,
        inserted: null
      };
    });
  }

  /* ---------- 翻译队列：视口优先，随滚动实时重排 ---------- */

  const SCROLL_REORDER_DELAY = 200;   // 滚动停下多久后才重排，避免滚动中反复回流

  function pushToQueue(recs, state) {
    recs.forEach((rec) => rec.segs.forEach((seg, i) => state.queue.push({ rec, i })));
  }

  /* 分档：0 = 正在视口里（马上要读）；1 = 视口下方（马上会读到）；2 = 视口上方；3 = 已脱离文档 */
  function bandOf(el) {
    if (!el || !el.isConnected) return { band: 3, dist: 0 };
    const vh = window.innerHeight || 800;
    let r = null;
    try { r = el.getBoundingClientRect(); } catch (_) { return { band: 3, dist: 0 }; }
    if (!r) return { band: 3, dist: 0 };
    if (r.bottom >= 0 && r.top <= vh) return { band: 0, dist: 0 };
    if (r.top > vh) return { band: 1, dist: r.top - vh };
    return { band: 2, dist: -r.bottom };
  }

  /* 一次性算完所有矩形再排序，避免逐条读取导致强制回流 */
  function sortQueue(state) {
    const q = state.queue;
    state.orderDirty = false;
    if (q.length < 2) return;
    const scored = q.map((it, index) => {
      const el = it.rec.node.parentElement;
      const { band, dist } = bandOf(el);
      return { it, index, band, dist, region: el ? contentPriority(el) : 5 };
    });
    scored.sort((a, b) =>
      a.band - b.band ||
      a.dist - b.dist ||
      a.region - b.region ||
      a.index - b.index
    );
    state.queue = scored.map((s) => s.it);
  }

  function takeBatch(state) {
    if (state.orderDirty) sortQueue(state);
    const q = state.queue;
    const batch = [];
    let chars = 0;
    while (q.length) {
      const it = q[0];
      const len = it.rec.segs[it.i].text.length;
      if (batch.length && (batch.length >= CHUNK_MAX_ITEMS || chars + len > state.chunkChars)) break;
      batch.push(q.shift());
      chars += len;
    }
    return batch;
  }

  /* 滚动 / 视口变化 → 下一批优先取当前视野内的内容（“跟着滚动翻”） */
  let reorderTimer = null;
  let scrollWatchBound = false;

  function bindScrollWatch() {
    if (scrollWatchBound) return;
    scrollWatchBound = true;
    const schedule = () => {
      if (!pageState || !pageState.queue.length) return;
      if (reorderTimer) return;
      reorderTimer = setTimeout(() => {
        reorderTimer = null;
        if (pageState) pageState.orderDirty = true;
      }, SCROLL_REORDER_DELAY);
    };
    window.addEventListener('scroll', schedule, { passive: true, capture: true });
    window.addEventListener('resize', schedule, { passive: true });
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

  /* 块级容器判定：inline-block 系（按钮、行内块链接等）同样算容器，
     避免译文被推到很远的外层元素里。 */
  function isBlockLike(el) {
    if (!el || el.nodeType !== 1) return false;
    const d = getComputedStyle(el).display;
    return d === 'block' || d === 'flex' || d === 'grid' || d === 'list-item' ||
      d === 'flow-root' || d === 'table' || d === 'table-cell' || d === 'table-caption' ||
      d === 'inline-block' || d === 'inline-flex' || d === 'inline-grid';
  }

  /* 译文统一挂在最近的块级容器末尾，同一容器内的多段译文合并成一段。
     这样双语模式下每处译文的样式与位置完全一致：不会有的带分隔线、有的贴在原文行内。 */
  function blockTarget(node) {
    const fallback = node.parentElement;
    let el = fallback;
    while (el && el !== document.body && !isBlockLike(el)) el = el.parentElement;
    return el || fallback || document.body;
  }

  /* 中日韩等不使用空格分词的语言，合并译文时不补空格 */
  const TIGHT_LANGS = new Set(['zh', 'zh-TW', 'ja']);
  let curTargetLang = 'zh';
  const groups = new Map();   // 块级容器 -> { el, recs: [] }

  function groupSep() {
    return TIGHT_LANGS.has(curTargetLang) ? '' : ' ';
  }

  function groupEl(target) {
    let g = groups.get(target);
    if (!g) {
      g = { el: null, recs: [] };
      groups.set(target, g);
    }
    if (!g.el || !g.el.isConnected) {
      g.el = document.createElement('span');
      g.el.className = 'dst-translation';
      g.el.setAttribute('data-dst-translation', '1');
      target.appendChild(g.el);
    }
    return g;
  }

  function refreshGroup(g) {
    const parts = g.recs
      .filter(hasAnyTranslation)
      .sort((a, b) => a.idx - b.idx)
      .map((rec) => currentText(rec).trim())
      .filter(Boolean);
    if (!parts.length) {
      if (g.el && g.el.isConnected) g.el.remove();
      return;
    }
    if (g.el && g.el.isConnected) g.el.textContent = parts.join(groupSep());
  }

  function removeInserted(rec) {
    const g = rec.group;
    rec.group = null;
    rec.inserted = null;
    if (!g) return;
    const i = g.recs.indexOf(rec);
    if (i >= 0) g.recs.splice(i, 1);
    refreshGroup(g);
  }

  function resetInserted() {
    for (const g of groups.values()) {
      if (g.el && g.el.isConnected) g.el.remove();
    }
    groups.clear();
    for (const rec of records) {
      rec.group = null;
      rec.inserted = null;
    }
  }

  function insertTranslation(rec) {
    if (!document.contains(rec.node)) return;
    if (!rec.target || !document.contains(rec.target)) rec.target = blockTarget(rec.node);
    const g = groupEl(rec.target);
    if (!g.recs.includes(rec)) g.recs.push(rec);
    rec.group = g;
    rec.inserted = g.el;
    refreshGroup(g);
  }

  function applyRec(rec, mode) {
    if (!document.contains(rec.node)) {
      removeInserted(rec);
      return;
    }
    const text = currentText(rec);
    if (mode === 'bilingual') {
      // 沉浸式：原文保持不动，译文以统一段落追加到原文所在块级容器末尾
      rec.node.nodeValue = rec.original;
      if (hasAnyTranslation(rec)) insertTranslation(rec);
      else removeInserted(rec);
    } else {
      removeInserted(rec);
      rec.node.nodeValue = (mode === 'translation' && hasAnyTranslation(rec)) ? text : rec.original;
    }
  }

  function applyAll(mode) {
    resetInserted();   // 重新分组，切换显示样式后顺序与样式保持一致
    for (const rec of records) {
      try { applyRec(rec, mode); } catch (_) { /* 单个节点失败不影响整体 */ }
    }
  }

  function restoreOriginal() {
    resetInserted();
    for (const rec of records) {
      try {
        if (rec.node) rec.node.nodeValue = rec.original;
      } catch (_) { /* ignore */ }
    }
  }

  /* 显示模式归一化：bilingual（沉浸式双语）| translation（只显示译文）| original（保持原文） */
  function normalizeMode(mode) {
    return (mode === 'translation' || mode === 'original') ? mode : 'bilingual';
  }

  /* ---------- 主流程 ---------- */

  /* 翻译一批：命中缓存的直接回填，剩余部分交给模型，避免重复消耗额度 */
  async function runBatch(state, batch) {
    const lang = state.targetLang;
    const pending = [];
    for (const it of batch) {
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

    if (!state.alive) return;   // 期间被“恢复原文”了，不要再往回写译文
    batch.forEach((it) => {
      try { applyRec(it.rec, state.mode); } catch (_) { /* 单个节点失败不影响整体 */ }
    });
  }

  /* 动态调度：保持 concurrency 个批次在飞，每次取批都按“当前滚动位置”重排，
     所以上下拖动时新进入视野的内容会被插到队首优先翻译。 */
  async function runQueue(state) {
    if (state.pumping) return;
    state.pumping = true;
    state.running = true;
    const inflight = new Set();

    while (state.running) {
      const batch = takeBatch(state);
      if (!batch.length) {
        if (!inflight.size) break;          // 队列空了且没有在飞的请求
        await Promise.race(inflight);
        continue;
      }
      const p = runBatch(state, batch)
        .catch(() => { /* 单批异常不影响整页 */ })
        .finally(() => inflight.delete(p));
      inflight.add(p);
      if (inflight.size >= state.concurrency) await Promise.race(inflight);
    }

    await Promise.all(inflight);
    state.pumping = false;
    state.running = false;

    if (state.keyError) {
      if (!state.notified) {
        state.notified = true;
        showToast({ text: '未配置 DeepSeek API Key', level: 'error' });
        chrome.runtime.sendMessage({ type: 'openOptions' }).catch(() => {});
      }
      return;
    }
    // 失败只在首次出现时提示一次；成功不弹窗（页面本身已经能看到译文）
    if (state.failed && !state.notified) {
      state.notified = true;
      showToast({ text: `部分段落翻译失败：${state.lastError}`, level: 'warn' });
    }
  }

  /* ---------- 动态加载的内容（无限滚动、懒加载）也跟着翻 ---------- */

  let domObserver = null;
  let domTimer = null;
  let pendingRoots = new Set();

  function startDomWatch() {
    if (domObserver || !document.body) return;
    domObserver = new MutationObserver((mutations) => {
      for (const m of mutations) {
        for (const n of m.addedNodes) {
          if (n.nodeType === 1) {
            if (n.closest && n.closest('[data-dst-translation], .zh2en-toast')) continue;
            pendingRoots.add(n);
          } else if (n.nodeType === 3 && n.parentElement &&
            !n.parentElement.closest('[data-dst-translation], .zh2en-toast')) {
            pendingRoots.add(n.parentElement);
          }
        }
      }
      if (!pendingRoots.size || domTimer) return;
      domTimer = setTimeout(() => { domTimer = null; absorbNewContent(); }, 350);
    });
    domObserver.observe(document.body, { childList: true, subtree: true });
  }

  function stopDomWatch() {
    if (domTimer) { clearTimeout(domTimer); domTimer = null; }
    pendingRoots.clear();
    if (domObserver) { domObserver.disconnect(); domObserver = null; }
  }

  /* 新增子树里的文字并入队列：滚到哪翻到哪，不会漏掉无限滚动加载出的内容 */
  function absorbNewContent() {
    const state = pageState;
    const roots = Array.from(pendingRoots);
    pendingRoots.clear();
    if (!state || !state.alive || !roots.length) return;

    const accept = textFilter({ skipCode: state.skipCode });
    const freshNodes = [];
    const localSeen = new Set();
    for (const root of roots) {
      if (!root.isConnected) continue;
      if (root.nodeType === 3) {
        if (accept(root) && !localSeen.has(root)) { localSeen.add(root); freshNodes.push(root); }
        continue;
      }
      for (const n of walkText(root, accept, 0)) {
        if (localSeen.has(n)) continue;
        localSeen.add(n);
        freshNodes.push(n);
      }
    }
    if (!freshNodes.length) return;

    const fresh = buildRecords(freshNodes, records.length);
    records = records.concat(fresh);
    pushToQueue(fresh, state);
    state.orderDirty = true;
    if (!state.running) runQueue(state);   // 上一轮队列已跑完，重新拉起来
  }

  async function startPageTranslate() {
    if (pageState?.running) return;   // 正在翻译中：静默忽略，不再弹提示条

    const settings = await fetchSettings();
    if (!settings.apiKey) {
      showToast({ text: '请先在设置页填写 DeepSeek API Key', level: 'error' });
      chrome.runtime.sendMessage({ type: 'openOptions' }).catch(() => {});
      return;
    }

    // 上一轮译文先还原，避免把译文当成原文再翻一次
    stopDomWatch();
    restoreOriginal();   // 内部会先清掉已插入的译文，再把各节点写回原文
    records = [];
    seenNodes = new WeakSet();
    curTargetLang = settings.targetLang || 'zh';

    const nodes = collectNodes({
      skipCode: settings.skipCode !== false,
      maxSegments: settings.maxSegments
    });
    if (!nodes.length) {
      showToast({ text: '这个页面没有检测到可翻译的文字', level: 'warn' });
      return;
    }

    const state = {
      alive: true,
      queue: [],
      orderDirty: true,
      chunkChars: Number(settings.chunkChars) || 3000,
      concurrency: Math.min(6, Math.max(1, Number(settings.concurrency) || 3)),
      skipCode: settings.skipCode !== false,
      maxSegments: settings.maxSegments,
      targetLang: settings.targetLang,
      mode: normalizeMode(settings.pageMode),
      done: 0,
      failed: 0,
      running: false,
      pumping: false,
      keyError: false,
      notified: false,
      lastError: ''
    };
    pageState = state;

    records = buildRecords(sortByPriority(nodes));
    pushToQueue(records, state);

    bindScrollWatch();
    startDomWatch();
    runQueue(state);   // 不 await：后台推进，滚动到哪就优先翻哪
  }

  function stopAndRestore() {
    if (pageState) {
      pageState.alive = false;
      pageState.running = false;
      pageState.queue = [];
    }
    stopDomWatch();
    pageState = null;
    restoreOriginal();
    records = [];
    seenNodes = new WeakSet();
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
