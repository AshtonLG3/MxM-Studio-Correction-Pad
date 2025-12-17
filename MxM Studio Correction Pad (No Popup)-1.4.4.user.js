// ==UserScript==
// @name         MxM Studio Correction Pad (No Popup)
// @namespace    mxm-tools
// @version      1.4.4
// @description  Combines the robust replacement logic of v1.0 with the SPA features and UI of v1.3. Draggable Button & Panel. Visible Cursor. No Clear Confirmation.
// @match        https://curators.musixmatch.com/*
// @match        https://curators-beta.musixmatch.com/*
// @run-at       document-start
// @grant        none
// ==/UserScript==

(function () {
  'use strict';

  const STATE_KEY = 'mxmCorrectionPad.session.v4';
  const BTN_ID = 'mxm-cpad-btn';
  const PANEL_ID = 'mxm-cpad-panel';

  /* -------------------- STATE -------------------- */
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

  /* -------------------- EDITOR LOGIC -------------------- */
  function findEditor() {
    const candidates = [...document.querySelectorAll('textarea, [contenteditable="true"], [role="textbox"]')];
    const visible = candidates.filter(el => {
      const r = el.getBoundingClientRect();
      return r.width > 200 && r.height > 100;
    });

    if (!visible.length) return null;

    return visible.sort((a, b) => {
        const ra = a.getBoundingClientRect();
        const rb = b.getBoundingClientRect();
        return (rb.width * rb.height) - (ra.width * ra.height);
    })[0];
  }

  function readEditor(el) {
    return el.value !== undefined ? el.value : (el.innerText || el.textContent);
  }

  function writeEditor(el, text) {
    el.focus();
    if (el.value !== undefined) {
      const prototype = Object.getPrototypeOf(el);
      const prototypeValueSetter = Object.getOwnPropertyDescriptor(prototype, 'value').set;

      if (prototypeValueSetter) {
          prototypeValueSetter.call(el, text);
      } else {
          el.value = text;
      }
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
      return true;
    } else {
      try {
          document.execCommand('selectAll', false, null);
          document.execCommand('insertText', false, text);
          el.dispatchEvent(new Event('input', { bubbles: true }));
          return true;
      } catch (e) {
          console.error("MxM Pad: execCommand failed", e);
          return false;
      }
    }
  }

  /* -------------------- REPLACEMENT -------------------- */
  function applyReplacements(text, pairs) {
    let out = text;
    const stats = [];

    for (const p of pairs) {
      if (!p.from) continue;
      const parts = out.split(p.from);
      const count = parts.length - 1;
      if (count > 0) {
        out = parts.join(p.to);
        stats.push({ from: p.from, count: count });
      }
    }
    return { out, stats };
  }

  /* -------------------- UI -------------------- */
  function autoResize(ta) {
    ta.style.height = 'auto';
    ta.style.height = Math.min(ta.scrollHeight, 150) + 'px';
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
      padding:10px 14px;
      border-radius:12px;
      background:#1f1f23;
      color:#fff;
      border:1px solid rgba(255,255,255,.2);
      font:600 13px system-ui;
      cursor:move;
      box-shadow:0 10px 30px rgba(0,0,0,.4);
      user-select:none;
    `;

    let isDragging = false;
    let drag = false, sx, sy, ox, oy;

    btn.onmousedown = e => {
        drag = true;
        isDragging = false;
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

    const moveHandler = e => {
        if (!drag) return;
        const dx = e.clientX - sx;
        const dy = e.clientY - sy;
        if (Math.abs(dx) > 3 || Math.abs(dy) > 3) isDragging = true;
        const newX = ox + dx;
        const newY = oy + dy;
        btn.style.left = newX + 'px';
        btn.style.top = newY + 'px';
    };

    const upHandler = () => {
        if(drag) {
            drag = false;
            const r = btn.getBoundingClientRect();
            const state = loadState();
            state.btnPos = { x: r.left, y: r.top };
            saveState(state);
        }
    };

    window.addEventListener('mousemove', moveHandler);
    window.addEventListener('mouseup', upHandler);

    btn.onclick = () => {
        if (!isDragging) togglePanel(true);
    };

    document.documentElement.appendChild(btn);
  }

  function togglePanel(open) {
    const s = loadState();
    s.open = open;
    saveState(s);

    if (open) renderPanel();

    const p = document.getElementById(PANEL_ID);
    if (p) {
        p.style.display = open ? 'block' : 'none';
    }
  }

  function renderPanel() {
    let panel = document.getElementById(PANEL_ID);

    if (!panel) {
        panel = document.createElement('div');
        panel.id = PANEL_ID;
        document.documentElement.appendChild(panel);
    }

    const s = loadState();
    panel.style.cssText = `
      position:fixed;
      left:${s.pos.x}px;
      top:${s.pos.y}px;
      width:460px;
      max-width:calc(100vw - 40px);
      background:#121214;
      color:#fff;
      border-radius:16px;
      border:1px solid rgba(255,255,255,.15);
      z-index:2147483647;
      display:${s.open ? 'block' : 'none'};
      box-shadow:0 16px 50px rgba(0,0,0,.5);
      font-family: system-ui, -apple-system, sans-serif;
    `;

    panel.innerHTML = `
      <div id="cpad-header" style="
        padding:12px; cursor:move;
        background:rgba(255,255,255,.06);
        font:700 13px system-ui;
        display:flex; justify-content:space-between; align-items:center;">
        <span>Correction Pad</span>
        <button id="cpad-head-close" style="background:none; border:none; color:#aaa; cursor:pointer; font-size:16px;">&times;</button>
      </div>

      <div style="padding:12px">
        <div style="display:grid; grid-template-columns: 1fr 1fr 30px; gap:8px; margin-bottom:5px; font-size:10px; opacity:0.7; font-weight:bold; padding-left:4px;">
            <span>FIND</span>
            <span>REPLACE WITH</span>
            <span></span>
        </div>
        <div id="cpad-rows" style="max-height:60vh; overflow-y:auto; padding-right:5px;"></div>

        <div style="display:flex; gap:8px; margin-top:15px">
          <button id="cpad-add" style="flex:1; padding:8px; background:#333; color:white; border:none; border-radius:6px; cursor:pointer;">+ Add</button>
          <button id="cpad-replace" style="flex:2; padding:8px; background:#ff5353; color:white; border:none; border-radius:6px; cursor:pointer; font-weight:bold;">Replace All</button>
          <button id="cpad-clear" style="flex:0.5; padding:8px; background:#333; color:white; border:none; border-radius:6px; cursor:pointer;">Clear</button>
        </div>

        <div id="cpad-status" style="margin-top:12px; font-size:11px; color:#ccc; min-height:1.2em; white-space: pre-wrap;">
          Ready.
        </div>
      </div>
    `;

    const rowsWrap = panel.querySelector('#cpad-rows');

    function drawRows() {
      rowsWrap.innerHTML = '';
      const state = loadState();

      state.pairs.forEach((p, i) => {
        const row = document.createElement('div');
        row.style.cssText =
          'display:grid; grid-template-columns:1fr 1fr 30px; gap:8px; margin-bottom:8px';

        row.innerHTML = `
          <textarea placeholder="Find..." rows="1" style="resize:none; min-height:36px; background:#222; color:#fff; caret-color:#fff; border:1px solid #444; border-radius:4px; padding:6px; font-family:inherit;">${p.from}</textarea>
          <textarea placeholder="Replace..." rows="1" style="resize:none; min-height:36px; background:#222; color:#fff; caret-color:#fff; border:1px solid #444; border-radius:4px; padding:6px; font-family:inherit;">${p.to}</textarea>
          <button style="font-weight:900; background:transparent; border:none; color:#666; cursor:pointer; font-size:18px;">&times;</button>
        `;

        const [from, to] = row.querySelectorAll('textarea');
        const delBtn = row.querySelector('button');

        autoResize(from);
        autoResize(to);

        from.oninput = () => {
          autoResize(from);
          state.pairs[i].from = from.value;
          saveState(state);
        };

        to.oninput = () => {
          autoResize(to);
          state.pairs[i].to = to.value;
          saveState(state);
        };

        delBtn.onclick = () => {
          state.pairs.splice(i, 1);
          if (!state.pairs.length) state.pairs.push({ from: '', to: '' });
          saveState(state);
          drawRows();
        };

        rowsWrap.appendChild(row);
      });
    }

    drawRows();

    // -- Event Handlers --
    panel.querySelector('#cpad-add').onclick = () => {
      const s = loadState();
      s.pairs.push({ from: '', to: '' });
      saveState(s);
      drawRows();
      setTimeout(() => {
          const textareas = rowsWrap.querySelectorAll('textarea');
          if(textareas.length >= 2) textareas[textareas.length-2].focus();
      }, 50);
    };

    panel.querySelector('#cpad-head-close').onclick = () => togglePanel(false);

    // CHANGED: Removed the confirm() check
    panel.querySelector('#cpad-clear').onclick = () => {
        const s = loadState();
        s.pairs = [{ from: '', to: '' }];
        saveState(s);
        drawRows();
        panel.querySelector('#cpad-status').textContent = 'Cleared.';
    };

    panel.querySelector('#cpad-replace').onclick = () => {
      const editor = findEditor();
      const statusEl = panel.querySelector('#cpad-status');

      if (!editor) {
          statusEl.textContent = '❌ Error: Could not find editor.';
          statusEl.style.color = '#ff5353';
          return;
      }

      const state = loadState();
      const original = readEditor(editor);
      const { out, stats } = applyReplacements(original, state.pairs);

      if (stats.length > 0) {
        const success = writeEditor(editor, out);
        if(success) {
            const total = stats.reduce((sum, item) => sum + item.count, 0);
            statusEl.textContent = `✅ Success! Replaced ${total} items.`;
            statusEl.style.color = '#8f8';
        } else {
             statusEl.textContent = `❌ Write Failed. Check console.`;
        }
      } else {
        statusEl.textContent = '⚠️ No matches found.';
        statusEl.style.color = '#fb8';
      }
    };

    // --- Panel Drag Logic ---
    const header = panel.querySelector('#cpad-header');
    let drag = false, sx, sy, ox, oy;
    header.onmousedown = e => {
      if(e.target.tagName === 'BUTTON') return;
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

  /* -------------------- BOOT -------------------- */
  const bootInterval = setInterval(() => {
    const editor = findEditor();
    if (editor) {
        clearInterval(bootInterval);
        createButton();
        if(loadState().open) renderPanel();
    }
  }, 1000);

})();