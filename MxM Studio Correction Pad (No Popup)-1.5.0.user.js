// ==UserScript==
// @name         MxM Studio Correction Pad (No Popup)
// @namespace    mxm-tools
// @version      1.5.0
// @description  Vision-accessible Correction Pad with draggable UI, bulk replacements, and SPA-friendly route detection.
// @match        https://curators.musixmatch.com/*
// @match        https://curators-beta.musixmatch.com/*
// @run-at       document-start
// @grant        none
// ==/UserScript==

(function () {
  'use strict';

  /* ===================== THEME (Blue on Gold / Vision Accessible) ===================== */

  const MXM_THEME = {
    bg: '#051525',
    bgSoft: '#0e2a47',
    bgHover: '#163b61',
    bgInput: '#020b16',
    border: '#d4af37',
    text: '#ffffff',
    textSoft: '#e0e0e0',
    textDim: '#aab6c4',
    accent: '#d4af37',
    accentStrong: '#ffd700',
    danger: '#ff4d4d',
    success: '#6ddf8b',
    shadow: '0 8px 32px rgba(0,0,0,0.7)'
  };

  /* ===================== STATE ===================== */

  const STATE_KEY = 'mxmCorrectionPad.session.v6';
  const BTN_ID = 'mxm-cpad-btn';
  const PANEL_ID = 'mxm-cpad-panel';

  function loadState() {
    try {
      const s = JSON.parse(sessionStorage.getItem(STATE_KEY));
      if (s && Array.isArray(s.pairs)) return s;
    } catch {}
    return {
      pairs: [{ from: '', to: '' }],
      open: false,
      pos: { x: 24, y: 120 },
      btnPos: null
    };
  }

  function saveState(s) {
    sessionStorage.setItem(STATE_KEY, JSON.stringify(s));
  }

  /* ===================== ROUTE DETECTION ===================== */

  function isAllowedPage() {
    const url = new URL(window.location.href);
    if (url.pathname !== '/tool' && url.pathname !== '/tool/') return false;
    const mode = url.searchParams.get('mode');
    return mode === 'edit' || mode === 'sync';
  }

  function checkVisibility() {
    const allowed = isAllowedPage();
    const btn = document.getElementById(BTN_ID);
    const panel = document.getElementById(PANEL_ID);

    if (btn) btn.style.display = allowed ? 'block' : 'none';
    if (panel) {
        const s = loadState();
        panel.style.display = (allowed && s.open) ? 'block' : 'none';
    }
  }

  /* ===================== EDITOR DETECTION (PATCHED) ===================== */

  function findEditors() {
    // UPDATED: Now looks for inputs often used in Sync mode lists
    const candidates = [...document.querySelectorAll(
      'textarea, [contenteditable="true"], [role="textbox"], input[type="text"]'
    )];

    const visible = candidates.filter(el => {
      // Ignore our own inputs
      if (el.closest('#' + PANEL_ID)) return false;

      const r = el.getBoundingClientRect();
      
      // Filter out invisible/tiny elements
      if (r.width < 50 || r.height < 10) return false;

      // Logic:
      // 1. "Big" Editor (Studio Mode): usually > 200px wide, > 80px high
      // 2. "Line" Input (Sync Mode): usually > 150px wide, but small height (approx 20-40px)
      return r.width > 150 && r.height > 18; 
    });

    return visible; // Returns an ARRAY of all valid inputs
  }

  function readEditor(el) {
    return el.value !== undefined ? el.value : (el.innerText || el.textContent);
  }

  function writeEditor(el, text) {
    // Try standard value setter first (for inputs/textareas)
    if (el.value !== undefined) {
      const proto = Object.getPrototypeOf(el);
      const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
      
      if (setter) {
          setter.call(el, text);
      } else {
          el.value = text;
      }
      
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
      return true;
    }

    // Try contenteditable method
    try {
      el.focus();
      // Select all content in this specific element
      document.execCommand('selectAll', false, null);
      document.execCommand('insertText', false, text);
      el.dispatchEvent(new Event('input', { bubbles: true }));
      return true;
    } catch (e) {
      return false;
    }
  }

  /* ===================== REPLACEMENT ===================== */

  function applyReplacements(text, pairs) {
    let out = text;
    let total = 0;

    for (const p of pairs) {
      if (!p.from) continue;
      const parts = out.split(p.from);
      const count = parts.length - 1;
      if (count > 0) {
        out = parts.join(p.to);
        total += count;
      }
    }
    return { out, total };
  }

  /* ===================== UI ===================== */

  function autoResize(ta) {
    ta.style.height = 'auto';
    ta.style.height = Math.max(38, Math.min(ta.scrollHeight, 150)) + 'px';
  }

  function createButton() {
    if (document.getElementById(BTN_ID)) return;

    const s = loadState();
    const btn = document.createElement('button');
    btn.id = BTN_ID;
    btn.textContent = 'Correction Pad';

    const initialStyle = s.btnPos
      ? `left:${s.btnPos.x}px; top:${s.btnPos.y}px;`
      : `bottom:18px; right:18px;`;

    btn.style.cssText = `
      position:fixed; ${initialStyle}
      z-index:2147483647;
      padding:12px 16px;
      border-radius:12px;
      background:${MXM_THEME.bgSoft};
      color:${MXM_THEME.accentStrong};
      border:2px solid ${MXM_THEME.border};
      font:700 13px system-ui;
      cursor:move;
      box-shadow:${MXM_THEME.shadow};
      user-select:none;
      transition: transform 0.1s;
      display:none;
    `;

    let drag = false, moved = false, sx, sy, ox, oy;

    btn.onmousedown = e => {
      drag = true;
      moved = false;
      sx = e.clientX;
      sy = e.clientY;
      const r = btn.getBoundingClientRect();
      btn.style.bottom = 'auto';
      btn.style.right = 'auto';
      btn.style.left = r.left + 'px';
      btn.style.top = r.top + 'px';
      ox = r.left;
      oy = r.top;
      e.preventDefault();
    };

    window.addEventListener('mousemove', e => {
      if (!drag) return;
      const dx = e.clientX - sx;
      const dy = e.clientY - sy;
      if (Math.abs(dx) > 3 || Math.abs(dy) > 3) moved = true;
      btn.style.left = ox + dx + 'px';
      btn.style.top = oy + dy + 'px';
    });

    window.addEventListener('mouseup', () => {
      if (!drag) return;
      drag = false;
      const r = btn.getBoundingClientRect();
      const s = loadState();
      s.btnPos = { x: r.left, y: r.top };
      saveState(s);
    });

    btn.onclick = () => {
      if (!moved) togglePanel(true);
    };

    btn.addEventListener('mouseenter', () => btn.style.transform = 'scale(1.05)');
    btn.addEventListener('mouseleave', () => btn.style.transform = 'scale(1)');

    document.documentElement.appendChild(btn);
  }

  function togglePanel(open) {
    const s = loadState();
    s.open = open;
    saveState(s);
    if (open) renderPanel();
    const p = document.getElementById(PANEL_ID);
    if (p) {
        p.style.display = (open && isAllowedPage()) ? 'block' : 'none';
    }
  }

  function renderPanel() {
    let panel = document.getElementById(PANEL_ID);
    if (!panel) {
      panel = document.createElement('div');
      panel.id = PANEL_ID;
      document.documentElement.appendChild(panel);
    } else {
      if (panel.childElementCount > 0) return;
    }

    const s = loadState();

    panel.style.cssText = `
      position:fixed;
      left:${s.pos.x}px;
      top:${s.pos.y}px;
      width:460px;
      max-width:calc(100vw - 40px);
      background:${MXM_THEME.bg};
      color:${MXM_THEME.text};
      border-radius:18px;
      border:2px solid ${MXM_THEME.border};
      z-index:2147483647;
      display:${s.open ? 'block' : 'none'};
      box-shadow:${MXM_THEME.shadow};
      font-family:system-ui;
    `;

    panel.innerHTML = `
      <div id="cpad-header" style="
        padding:14px;
        cursor:move;
        background:${MXM_THEME.bgSoft};
        border-bottom:2px solid ${MXM_THEME.border};
        font:700 14px system-ui;
        display:flex;
        justify-content:space-between;
        align-items:center;
        color:${MXM_THEME.accentStrong};
      ">
        <span>Correction Pad</span>
        <button id="cpad-close"
          style="background:none;border:none;color:${MXM_THEME.accent};
          font-size:20px;cursor:pointer;font-weight:bold;">&times;</button>
      </div>

      <div style="padding:14px">
        <div id="cpad-rows"></div>

        <div style="display:flex;gap:10px;margin-top:14px">
          <button id="cpad-add" style="
            flex:1;padding:10px;border-radius:8px;
            background:${MXM_THEME.bgHover};
            color:${MXM_THEME.text};
            border:1px solid ${MXM_THEME.border};
            cursor:pointer;font-weight:600;">+ Add</button>

          <button id="cpad-replace" style="
            flex:2;padding:10px;border-radius:8px;
            background:${MXM_THEME.bgHover};
            color:${MXM_THEME.accentStrong};
            border:1px solid ${MXM_THEME.border};
            font-weight:700;
            box-shadow:0 2px 6px rgba(0,0,0,0.3);
            cursor:pointer;">Replace All</button>

          <button id="cpad-clear" style="
            flex:0.7;padding:10px;border-radius:8px;
            background:${MXM_THEME.bgHover};
            color:${MXM_THEME.textSoft};
            border:1px solid ${MXM_THEME.border};
            cursor:pointer;">Clear</button>
        </div>

        <div id="cpad-status" style="
          margin-top:12px;font-size:12px;color:${MXM_THEME.accent};font-weight:500;">
          Ready.
        </div>
      </div>
    `;

    const rowsWrap = panel.querySelector('#cpad-rows');

    function drawRows() {
      rowsWrap.innerHTML = '';
      const st = loadState();

      st.pairs.forEach((p, i) => {
        const row = document.createElement('div');
        row.style.cssText = 'display:grid;grid-template-columns:1fr 1fr 30px;gap:10px;margin-bottom:10px;align-items:start;';

        const inputStyle = `
            background:${MXM_THEME.bgInput};
            color:${MXM_THEME.text};
            caret-color:${MXM_THEME.accentStrong};
            border:2px solid ${MXM_THEME.border};
            border-radius:6px;
            padding:8px;
            resize:none;
            font-family:inherit;
            outline:none;
            overflow:hidden;
            display:block;
            user-select: text !important;
            cursor: text !important;
        `;

        row.innerHTML = `
          <textarea rows="1" placeholder="Find..." style="${inputStyle}"></textarea>
          <textarea rows="1" placeholder="Replace..." style="${inputStyle}"></textarea>

          <button style="
            background:none;
            border:none;
            color:${MXM_THEME.accent};
            font-size:24px;
            line-height:1;
            cursor:pointer;
            padding-top:2px;
          ">&times;</button>
        `;

        const [from, to] = row.querySelectorAll('textarea');
        from.value = p.from;
        to.value = p.to;

        [from, to].forEach(el => {
            el.addEventListener('keydown', e => e.stopPropagation());
            el.addEventListener('mousedown', e => e.stopPropagation());

            el.onfocus = () => {
                el.style.borderColor = MXM_THEME.accentStrong;
                el.style.boxShadow = `0 0 0 3px rgba(212,175,55,.35)`;
            };
            el.onblur = () => {
                el.style.borderColor = MXM_THEME.border;
                el.style.boxShadow = 'none';
            };
        });

        row.querySelector('button').onclick = () => {
          st.pairs.splice(i, 1);
          if (!st.pairs.length) st.pairs.push({ from: '', to: '' });
          saveState(st);
          drawRows();
        };

        from.oninput = () => { autoResize(from); st.pairs[i].from = from.value; saveState(st); };
        to.oninput = () => { autoResize(to); st.pairs[i].to = to.value; saveState(st); };

        rowsWrap.appendChild(row);

        autoResize(from);
        autoResize(to);
      });
    }

    drawRows();

    panel.querySelector('#cpad-add').onclick = () => {
      const st = loadState();
      st.pairs.push({ from: '', to: '' });
      saveState(st);
      drawRows();
    };

    panel.querySelector('#cpad-clear').onclick = () => {
      const st = loadState();
      st.pairs = [{ from: '', to: '' }];
      saveState(st);
      drawRows();
      panel.querySelector('#cpad-status').textContent = 'Cleared.';
    };

    panel.querySelector('#cpad-close').onclick = () => togglePanel(false);

    // PATCHED: Replaced singular check with plural iteration
    panel.querySelector('#cpad-replace').onclick = () => {
      const editors = findEditors();
      const status = panel.querySelector('#cpad-status');
      
      if (!editors || editors.length === 0) {
        status.textContent = 'No editable field detected.';
        status.style.color = MXM_THEME.danger;
        return;
      }

      const pairs = loadState().pairs;
      let grandTotal = 0;
      let fieldsUpdated = 0;

      editors.forEach(ed => {
          const currentText = readEditor(ed);
          const { out, total } = applyReplacements(currentText, pairs);
          
          if (total > 0) {
              if (writeEditor(ed, out)) {
                  grandTotal += total;
                  fieldsUpdated++;
              }
          }
      });

      if (grandTotal > 0) {
        status.textContent = `Success: ${grandTotal} replacements in ${fieldsUpdated} fields.`;
        status.style.color = MXM_THEME.success;
      } else {
        status.textContent = 'No matches found.';
        status.style.color = MXM_THEME.textDim;
      }
    };

    const header = panel.querySelector('#cpad-header');
    let drag = false, sx, sy, ox, oy;

    header.onmousedown = e => {
      if (e.target.tagName === 'BUTTON') return;
      drag = true;
      sx = e.clientX;
      sy = e.clientY;
      const r = panel.getBoundingClientRect();
      ox = r.left;
      oy = r.top;
    };

    window.addEventListener('mousemove', e => {
      if (!drag) return;
      const x = ox + e.clientX - sx;
      const y = oy + e.clientY - sy;
      panel.style.left = x + 'px';
      panel.style.top = y + 'px';
      const st = loadState();
      st.pos = { x, y };
      saveState(st);
    });

    window.addEventListener('mouseup', () => drag = false);
  }

  /* ===================== BOOT ===================== */

  function ensureUI() {
    createButton();
    checkVisibility();
    if (loadState().open) renderPanel();
  }

  ensureUI();

  // Re-check visibility on navigation (for SPA support)
  setInterval(checkVisibility, 1000);

})();
