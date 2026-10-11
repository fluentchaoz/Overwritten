// OVERWRITTEN - rendering, input, menus. Everything on screen is a character.
(function () {
  'use strict';
  const OW = window.OW;
  const { CW, CH, VW, VH, COLS, ROWS } = OW;
  const TAU = Math.PI * 2;
  const FONT = '18px "DejaVu Sans Mono", "Courier New", Consolas, Menlo, monospace';
  const BIG = '30px "DejaVu Sans Mono", "Courier New", Consolas, Menlo, monospace';

  const canvas = document.getElementById('screen');
  const ctx = canvas.getContext('2d');

  // ------------------------------------------------------------------ persistence
  const SAVE_KEY = 'overwritten.save.v1';
  let save = { bytes: 0, up: {}, forms: { txt: true }, form: 'txt', best: 0, runs: 0, wins: 0 };
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (raw) save = Object.assign(save, JSON.parse(raw));
  } catch (e) { /* storage may be unavailable */ }
  function persist() {
    try { localStorage.setItem(SAVE_KEY, JSON.stringify(save)); } catch (e) { /* ignore */ }
  }

  // ------------------------------------------------------------------ state
  let mode = 'hub'; // hub | run | pause | over
  let G = null;
  let hubSel = 0;
  let hubMsg = '';
  let hubRows = [];
  let banked = null; // result of last run
  let scale = 1;
  const params = new URLSearchParams(location.search);
  const skipT = +params.get('t') || 0;

  // ------------------------------------------------------------------ canvas sizing
  function resize() {
    const dpr = window.devicePixelRatio || 1;
    const sw = window.innerWidth, sh = window.innerHeight;
    scale = Math.min(sw / VW, sh / VH);
    canvas.style.width = Math.floor(VW * scale) + 'px';
    canvas.style.height = Math.floor(VH * scale) + 'px';
    canvas.width = Math.floor(VW * scale * dpr);
    canvas.height = Math.floor(VH * scale * dpr);
    ctx.setTransform(scale * dpr, 0, 0, scale * dpr, 0, 0);
  }
  window.addEventListener('resize', resize);
  resize();

  // ------------------------------------------------------------------ input
  const keys = Object.create(null);
  let dashQueued = false;
  const pressed = [];
  window.addEventListener('keydown', (e) => {
    if (e.repeat) { if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' '].includes(e.key)) e.preventDefault(); return; }
    keys[e.key.toLowerCase()] = true;
    pressed.push(e.key.toLowerCase());
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' ', 'Tab'].includes(e.key)) e.preventDefault();
  });
  window.addEventListener('keyup', (e) => { keys[e.key.toLowerCase()] = false; });
  window.addEventListener('blur', () => { for (const k in keys) keys[k] = false; if (mode === 'run' && !G.choices) mode = 'pause'; });

  function readMove() {
    let dx = 0, dy = 0;
    if (keys['a'] || keys['arrowleft']) dx -= 1;
    if (keys['d'] || keys['arrowright']) dx += 1;
    if (keys['w'] || keys['arrowup']) dy -= 1;
    if (keys['s'] || keys['arrowdown']) dy += 1;
    return { dx, dy };
  }

  // Mouse: logical (VW x VH) coordinates. The camera is centred on the player, so the
  // cursor's offset from screen centre is also its offset from the player in the world.
  const mouse = { x: VW / 2 + 200, y: VH / 2, down: false, moved: false };
  function toLogical(e) {
    const r = canvas.getBoundingClientRect();
    mouse.x = ((e.clientX - r.left) / r.width) * VW;
    mouse.y = ((e.clientY - r.top) / r.height) * VH;
    mouse.moved = true;
  }
  window.addEventListener('mousemove', toLogical);
  window.addEventListener('contextmenu', (e) => e.preventDefault());
  let clickQueued = null;
  window.addEventListener('mousedown', (e) => { toLogical(e); if (e.button === 0) clickQueued = { x: mouse.x, y: mouse.y }; });

  // ------------------------------------------------------------------ text-grid helpers
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  function setFont(f) { ctx.font = f || FONT; }
  function putAt(x, y, str, col) { // x,y = center of first char, px
    ctx.fillStyle = col;
    for (let i = 0; i < str.length; i++) {
      const c = str[i];
      if (c !== ' ') ctx.fillText(c, x + i * CW, y);
    }
  }
  function put(col, row, str, color) { putAt(col * CW + CW / 2, row * CH + CH / 2, str, color || '#cfe3ea'); }
  function putC(row, str, color) { put(Math.floor((COLS - str.length) / 2), row, str, color); }
  function sprite(rows, cx, cy, col) {
    const h = rows.length;
    const top = cy - (h * CH) / 2 + CH / 2;
    for (let r = 0; r < h; r++) {
      const s = rows[r];
      putAt(cx - (s.length * CW) / 2 + CW / 2, top + r * CH, s, col);
    }
  }
  function panel(c0, r0, w, h, title, col) {
    col = col || '#3b5566';
    put(c0, r0, '┌' + '─'.repeat(w - 2) + '┐', col);
    for (let r = 1; r < h - 1; r++) { put(c0, r0 + r, '│', col); put(c0 + w - 1, r0 + r, '│', col); }
    put(c0, r0 + h - 1, '└' + '─'.repeat(w - 2) + '┘', col);
    if (title) put(c0 + 2, r0, ' ' + title + ' ', '#e8f1f5');
  }
  function wrap(s, w) {
    const out = [];
    let line = '';
    for (const word of s.split(' ')) {
      if ((line + ' ' + word).trim().length > w) { out.push(line); line = word; }
      else line = (line + ' ' + word).trim();
    }
    if (line) out.push(line);
    return out;
  }
  function bar(frac, n, fill, empty) {
    const f = Math.max(0, Math.min(n, Math.round(frac * n)));
    return '[' + (fill || '#').repeat(f) + (empty || '-').repeat(n - f) + ']';
  }
  const mmss = (t) => String(Math.floor(t / 60)).padStart(2, '0') + ':' + String(Math.floor(t % 60)).padStart(2, '0');

  // ------------------------------------------------------------------ floor
  const FLOOR_WORDS = ['~tmp', '.tmp', '$$$', '.bak', 'cache', '~$doc', 'thumbs.db', '.log', 'temp', '0KB', 'undo', '.swp', 'old', '.crdownload', 'null'];
  function hash2(x, y) {
    let h = (x * 374761393 + y * 668265263) | 0;
    h = (h ^ (h >>> 13)) * 1274126177;
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  }
  function drawFloor(cx, cy, purge) {
    const TW = 20, TH = 6; // tile in cells
    const c0 = Math.floor((cx - VW / 2) / CW), r0 = Math.floor((cy - VH / 2) / CH);
    const tx0 = Math.floor(c0 / TW) - 1, tx1 = Math.floor((c0 + COLS) / TW) + 1;
    const ty0 = Math.floor(r0 / TH) - 1, ty1 = Math.floor((r0 + ROWS) / TH) + 1;
    ctx.fillStyle = purge ? '#2a1a1e' : '#1b2a33';
    for (let ty = ty0; ty <= ty1; ty++) {
      for (let tx = tx0; tx <= tx1; tx++) {
        const h = hash2(tx, ty);
        if (h > 0.55) continue;
        const word = FLOOR_WORDS[Math.floor(h * 1000) % FLOOR_WORDS.length];
        const col = tx * TW + Math.floor(hash2(ty, tx) * (TW - word.length));
        const row = ty * TH + Math.floor(hash2(tx + 7, ty + 3) * TH);
        const sx = col * CW + CW / 2 - cx + VW / 2, sy = row * CH + CH / 2 - cy + VH / 2;
        putAt(sx, sy, word, ctx.fillStyle);
      }
    }
    // faint dots on a coarse lattice give a sense of motion
    ctx.fillStyle = purge ? '#231619' : '#14202a';
    const sx0 = Math.floor((cx - VW / 2) / (CW * 6)) - 1, sy0 = Math.floor((cy - VH / 2) / (CH * 3)) - 1;
    for (let i = sx0; i <= sx0 + Math.ceil(VW / (CW * 6)) + 2; i++) {
      for (let j = sy0; j <= sy0 + Math.ceil(VH / (CH * 3)) + 2; j++) {
        ctx.fillText('.', i * CW * 6 - cx + VW / 2, j * CH * 3 - cy + VH / 2);
      }
    }
  }

  // ------------------------------------------------------------------ world drawing
  function drawWorld() {
    const p = G.p;
    let ox = 0, oy = 0;
    if (G.shake > 0) { ox = (Math.random() - 0.5) * G.shake; oy = (Math.random() - 0.5) * G.shake; }
    const cx = p.x + ox, cy = p.y + oy;
    const SX = (x) => x - cx + VW / 2, SY = (y) => y - cy + VH / 2;
    const on = (x, y, m) => x > -m && x < VW + m && y > -m && y < VH + m;

    setFont();
    drawFloor(cx, cy, G.purge > 0);

    // hazards: boss bands
    for (const h of G.hazards) {
      const act = h.t >= h.tele;
      const a = act ? 0.85 : 0.35 + 0.3 * Math.sin(h.t * 22);
      ctx.globalAlpha = Math.max(0.1, a);
      ctx.fillStyle = act ? '#ff5f5f' : '#ffb454';
      if (h.axis === 'h') {
        const y0 = SY(h.c - h.th / 2), y1 = SY(h.c + h.th / 2);
        for (let y = Math.floor(y0 / CH) * CH + CH / 2; y < y1; y += CH) {
          if (y < -CH || y > VH + CH) continue;
          for (let x = CW / 2; x < VW; x += CW) ctx.fillText(act ? '▓' : (Math.floor(x / CW) % 4 ? ' ' : '!'), x, y);
        }
      } else {
        const x0 = SX(h.c - h.th / 2), x1 = SX(h.c + h.th / 2);
        for (let x = Math.floor(x0 / CW) * CW + CW / 2; x < x1; x += CW) {
          if (x < -CW || x > VW + CW) continue;
          for (let y = CH / 2; y < VH; y += CH) ctx.fillText(act ? '▓' : (Math.floor(y / CH) % 3 ? ' ' : '!'), x, y);
        }
      }
      ctx.globalAlpha = 1;
    }

    // fx under entities
    for (const f of G.fx) {
      if (f.k === 'trail') {
        const frac = f.t / f.life;
        const ch = frac < 0.25 ? '#' : frac < 0.5 ? '%' : frac < 0.75 ? '+' : ':';
        ctx.globalAlpha = 1 - frac * 0.7;
        putAt(SX(f.x), SY(f.y), ch + (frac < 0.5 ? ch : ' '), '#ff9ae6');
        ctx.globalAlpha = 1;
      } else if (f.k === 'blast') {
        const sx = SX(f.x), sy = SY(f.y);
        if (!on(sx, sy, f.R + 20)) continue;
        if (f.t < f.delay) {
          ctx.globalAlpha = 0.45 + 0.4 * Math.sin(f.t * 24);
          const n = Math.max(10, Math.floor((f.R * TAU) / 13));
          for (let i = 0; i < n; i++) { const a = (i / n) * TAU; ctx.fillStyle = '#ffb454'; ctx.fillText('*', sx + Math.cos(a) * f.R, sy + Math.sin(a) * f.R * 0.7); }
          ctx.globalAlpha = 1;
        } else {
          const k = (f.t - f.delay) / 0.3;
          ctx.globalAlpha = 1 - k;
          const glyphs = '*#%&@';
          for (let gx = -f.R; gx <= f.R; gx += CW) for (let gy = -f.R; gy <= f.R; gy += CH) {
            if (gx * gx + (gy * gy) / 0.49 > f.R * f.R) continue;
            ctx.fillStyle = Math.random() < 0.5 ? '#ffb454' : '#fff3c4';
            ctx.fillText(glyphs[Math.floor(Math.random() * glyphs.length)], sx + gx, sy + gy);
          }
          ctx.globalAlpha = 1;
        }
      } else if (f.k === 'ebl') {
        const sx = SX(f.x), sy = SY(f.y);
        if (f.t < f.delay) {
          ctx.globalAlpha = 0.5 + 0.4 * Math.sin(f.t * 30);
          const n = 16;
          for (let i = 0; i < n; i++) { const a = (i / n) * TAU; ctx.fillStyle = '#ff5f5f'; ctx.fillText('!', sx + Math.cos(a) * f.R, sy + Math.sin(a) * f.R * 0.7); }
          ctx.globalAlpha = 1;
        } else {
          ctx.globalAlpha = 1 - (f.t - f.delay) / 0.3;
          for (let gx = -f.R; gx <= f.R; gx += CW) for (let gy = -f.R; gy <= f.R; gy += CH) {
            if (gx * gx + (gy * gy) / 0.49 > f.R * f.R) continue;
            ctx.fillStyle = '#ff5f5f'; ctx.fillText(Math.random() < 0.5 ? '#' : '!', sx + gx, sy + gy);
          }
          ctx.globalAlpha = 1;
        }
      } else if (f.k === 'ghost') {
        ctx.globalAlpha = 1 - f.t / 0.5;
        for (let i = 0; i <= 12; i++) { const k = i / 12; putAt(SX(f.x0 + (f.x1 - f.x0) * k), SY(f.y0 + (f.y1 - f.y0) * k), '^Z', '#8ab4ff'); }
        ctx.globalAlpha = 1;
      }
    }

    // pickups
    for (const b of G.bits) {
      const sx = SX(b.x), sy = SY(b.y);
      if (!on(sx, sy, 20)) continue;
      if (b.kind === 'chest') sprite([b.ch], sx, sy + Math.sin(G.t * 4) * 2, b.col);
      else sprite([b.ch], sx, sy, b.col);
    }

    // portal
    if (G.portal) {
      const sx = SX(G.portal.x), sy = SY(G.portal.y);
      const f = Math.floor(G.t * 6) % 3;
      const arrows = ['>  ', ' > ', '  >'][f];
      sprite(['╔═════╗', '║ >>> ║', '╚═════╝'], sx, sy, '#8affb0');
      putAt(sx - CW * 2, sy + CH * 2, 'UPLINK ' + arrows, '#8affb0');
      if (!on(sx, sy, 0)) {
        const ang = Math.atan2(G.portal.y - p.y, G.portal.x - p.x);
        const ex = Math.max(60, Math.min(VW - 60, VW / 2 + Math.cos(ang) * 600));
        const ey = Math.max(70, Math.min(VH - 40, VH / 2 + Math.sin(ang) * 400));
        putAt(ex - CW * 3, ey, 'UPLINK >>>', '#8affb0');
      }
    }

    // enemies
    for (const e of G.enemies) {
      const sx = SX(e.x), sy = SY(e.y);
      if (!on(sx, sy, 120)) continue;
      const rows = e.def.art(e);
      let col = e.elite ? OW.ELITE_MODS[e.mod].col : e.def.col;
      if (e.flash > 0) col = '#ffffff';
      if (e.boss && e.mode === 'tele') col = Math.floor(G.t * 16) % 2 ? '#ff5f5f' : col;
      if (e.type === 'trojan' && e.open) col = Math.floor(G.t * 20) % 2 ? '#ff5f5f' : '#ffffff';
      if (e.boss && e.intro > 0) ctx.globalAlpha = 0.5;
      sprite(rows, sx, sy, col);
      ctx.globalAlpha = 1;
      if (e.elite) putAt(sx, sy - rows.length * CH * 0.5 - CH * 0.5, e.mod, OW.ELITE_MODS[e.mod].col);
    }

    // player shots
    for (const s of G.shots) {
      const sx = SX(s.x), sy = SY(s.y);
      if (on(sx, sy, 20)) putAt(sx, sy, s.ch, s.col);
    }
    for (const s of G.eshots) {
      const sx = SX(s.x), sy = SY(s.y);
      if (on(sx, sy, 20)) putAt(sx, sy, s.ch, s.col);
    }

    // player weapon fx
    for (const f of G.fx) {
      if (f.k === 'ping') {
        const R = f.R * Math.min(1, f.t / f.dur);
        const a = f.t < f.dur ? 1 : Math.max(0, 1 - (f.t - f.dur) / 0.15);
        ctx.globalAlpha = a;
        const n = Math.max(16, Math.floor((R * TAU) / 12));
        const sx = SX(f.x), sy = SY(f.y);
        for (let i = 0; i < n; i++) {
          const ang = (i / n) * TAU;
          putAt(sx + Math.cos(ang) * R, sy + Math.sin(ang) * R * 0.75, 'o', f.col);
        }
        ctx.globalAlpha = 1;
      } else if (f.k === 'slash') {
        const px = SX(p.x), py = SY(p.y);
        const k = f.t / f.dur;
        ctx.globalAlpha = 1 - k * 0.6;
        const steps = 11;
        for (let i = 0; i < steps; i++) {
          const a = f.ang - f.half + ((i + 0.5) / steps) * f.half * 2;
          const rad = f.range * (0.55 + 0.45 * Math.min(1, k * 2.5));
          for (let q = 0; q < 3; q++) {
            const rr2 = rad * (0.6 + q * 0.2);
            putAt(px + Math.cos(a) * rr2, py + Math.sin(a) * rr2 * 0.8, q === 2 ? '#' : '=', '#ffe08a');
          }
        }
        ctx.globalAlpha = 1;
      } else if (f.k === 'rm') {
        const sx = SX(f.x), sy = SY(f.y);
        if (on(sx, sy, 30)) putAt(sx - CW / 2, sy, Math.floor(f.t * 14) % 2 ? 'rm' : 'mr', '#ff6b6b');
      }
    }

    // player
    {
      const sx = SX(p.x), sy = SY(p.y);
      let col = G.form.col;
      if (p.invuln > 0 && Math.floor(G.t * 20) % 2) col = '#ffffff';
      sprite([G.form.art], sx, sy, col);
    }

    // particles + damage numbers
    for (const q of G.parts) {
      ctx.globalAlpha = Math.max(0, 1 - q.t / q.life);
      putAt(SX(q.x), SY(q.y), q.ch, q.col);
    }
    ctx.globalAlpha = 1;
    for (const q of G.texts) {
      ctx.globalAlpha = Math.max(0, 1 - q.t / q.life);
      putAt(SX(q.x) - (q.str.length * CW) / 2 + CW / 2, SY(q.y), q.str, q.col);
    }
    ctx.globalAlpha = 1;

    // Purge vignette: characters creeping in from the edges
    if (G.purge > 0) {
      ctx.globalAlpha = Math.min(0.5, 0.1 + G.purge * 0.06);
      ctx.fillStyle = '#ff5f5f';
      for (let c = 0; c < COLS; c++) {
        const h = hash2(c, Math.floor(G.t * 2));
        if (h < 0.3) { ctx.fillText(h < 0.15 ? '░' : '▒', c * CW + CW / 2, CH / 2); ctx.fillText(h < 0.15 ? '▒' : '░', c * CW + CW / 2, VH - CH / 2); }
      }
      ctx.globalAlpha = 1;
    }
  }

  function drawReticle() {
    const p = G.p;
    const sx = VW / 2, sy = VH / 2;
    const dx = mouse.x - sx, dy = mouse.y - sy, d = Math.hypot(dx, dy);
    setFont();
    // faint dotted aim line (stops short of the reticle)
    ctx.globalAlpha = 0.35;
    for (let k = 40; k < Math.min(d - 14, 260); k += 22) putAt(sx + (dx / d) * k, sy + (dy / d) * k, '.', '#9fd6e8');
    ctx.globalAlpha = 1;
    const lock = G.pas.lock || 0;
    const col = lock ? '#ff9ae6' : '#ffffff';
    sprite([lock >= 3 ? '{ + }' : '-+-'], mouse.x, mouse.y, col);
  }

  function glitchPass() {
    if (!G || G.glitch <= 0) return;
    const n = 3 + Math.floor(G.glitch * 14);
    const dpr = canvas.width / VW;
    for (let i = 0; i < n; i++) {
      const y = Math.floor(Math.random() * VH), h = 4 + Math.floor(Math.random() * 18);
      const off = (Math.random() - 0.5) * 60;
      ctx.drawImage(canvas, 0, y * dpr, canvas.width, h * dpr, off * dpr, y * dpr, canvas.width, h * dpr);
    }
    ctx.fillStyle = '#ff5f5f';
    ctx.globalAlpha = 0.6;
    for (let i = 0; i < 16; i++) ctx.fillText('#%&@01'[Math.floor(Math.random() * 6)], Math.random() * VW, Math.random() * VH);
    ctx.globalAlpha = 1;
  }

  // ------------------------------------------------------------------ HUD
  function drawHud() {
    const p = G.p;
    setFont();
    const hpFrac = p.hp / p.maxhp;
    put(1, 0, 'INTEGRITY ' + bar(hpFrac, 20, '#', '-') + ' ' + Math.ceil(p.hp) + '/' + p.maxhp, hpFrac < 0.3 ? '#ff6b6b' : '#6dff9c');
    put(1, 1, 'LV ' + String(G.level).padEnd(3) + '    ' + bar(G.xp / OW.xpNeed(G.level), 20, '=', '.'), '#5ee1ff');
    putC(0, mmss(G.t), '#e8f1f5');
    if (G.purge > 0) putC(1, 'PURGE LV ' + G.purge, Math.floor(G.t * 3) % 2 ? '#ff6b6b' : '#ffb454');
    else putC(1, 'C:\\Temp', '#5f7a88');
    const r = 'DELETED ' + G.kills;
    put(COLS - r.length - 1, 0, r, '#e8f1f5');
    const bits = 'BITS ' + Math.floor(G.bitsCollected);
    put(COLS - bits.length - 1, 1, bits, '#3fa66a');

    // weapons / passives
    const ws = G.weapons.map((w) => (w.evolved ? OW.WEAPONS[w.id].evo.name : OW.WEAPONS[w.id].name) + ':' + w.lv);
    put(1, ROWS - 2, 'WPN ' + ws.join('  '), '#9fd6e8');
    const ps = Object.keys(G.pas).map((k) => OW.PASSIVES[k].name + ':' + G.pas[k]);
    put(1, ROWS - 1, 'SYS ' + (ps.join('  ') || '-'), '#7f98a5');
    const dash = G.p.dashCd > 0 ? '^Z ' + bar(1 - G.p.dashCd / 14, 8, '=', '.') + ' ' + Math.ceil(G.p.dashCd) + 's' : '[SPACE] ^Z READY';
    put(COLS - dash.length - 1, ROWS - 1, dash, G.p.dashCd > 0 ? '#5f7a88' : '#8ab4ff');

    // boss bar
    const b = G.boss;
    if (b && !b.dead) {
      const label = 'DISK CLEANUP.EXE ' + bar(b.hp / b.maxhp, 36, '#', '.');
      putC(3, label, '#ffd24a');
    }

    // messages
    let row = 6;
    for (let i = G.msgs.length - 1; i >= 0; i--) {
      const m = G.msgs[i];
      ctx.globalAlpha = Math.max(0, Math.min(1, (m.life - m.t) * 2));
      putC(row++, m.text, m.col);
    }
    ctx.globalAlpha = 1;
  }

  // ------------------------------------------------------------------ screens
  function drawHub() {
    setFont();
    const title = 'O V E R W R I T T E N';
    const t = performance.now() / 1000;
    for (let c = 0; c < COLS; c++) for (let r = 0; r < ROWS; r++) {
      const h = hash2(c, r + Math.floor(t * 0.7) * 0);
      if (h < 0.025) { ctx.fillStyle = '#12202a'; ctx.fillText(h < 0.012 ? '0' : '1', c * CW + CW / 2, r * CH + CH / 2); }
    }
    setFont(BIG);
    ctx.fillStyle = '#e8f1f5';
    ctx.fillText(title, VW / 2, CH * 2.2);
    setFont();
    putC(4, 'you were deleted.  you were not destroyed.', '#5f7a88');

    // left: menu
    panel(3, 6, 62, 24, 'RECYCLE BIN');
    let row = 8;
    const items = hubItems();
    hubRows = [];
    items.forEach((it, i) => {
      hubRows[i] = row;
      const sel = i === hubSel;
      const col = sel ? '#e8f1f5' : it.dim ? '#4b606c' : '#9fb4be';
      put(5, row, (sel ? '> ' : '  ') + it.label, sel ? '#8affb0' : col);
      if (it.right) put(5 + 58 - it.right.length, row, it.right, it.rcol || col);
      row += it.gap || 1;
    });
    if (hubMsg) put(5, 28, hubMsg, '#ffb454');

    // right: stats panel
    panel(67, 6, 31, 24, 'FILE PROPERTIES');
    const form = OW.FORMS[save.form];
    sprite([form.art], 67 * CW + 15 * CW + CW / 2 + CW, 9 * CH + CH / 2, form.col);
    put(69, 11, 'name:    ' + 'you' + form.name, '#cfe3ea');
    put(69, 12, 'bytes:   ' + save.bytes, '#ffd24a');
    put(69, 13, 'runs:    ' + save.runs, '#9fb4be');
    put(69, 14, 'uplinks: ' + save.wins, '#8affb0');
    put(69, 15, 'best:    ' + mmss(save.best || 0), '#9fb4be');
    const dl = wrap(form.desc, 26);
    dl.forEach((l, i) => put(69, 17 + i, l, '#7f98a5'));
    put(69, 22, 'CONTROLS', '#e8f1f5');
    put(69, 23, 'WASD/arrows  move', '#7f98a5');
    put(69, 24, 'MOUSE        aim', '#7f98a5');
    put(69, 25, 'SPACE        ctrl+z', '#7f98a5');
    put(69, 26, 'P / ESC      pause', '#7f98a5');
    put(69, 27, 'you always fire.', '#7f98a5');
    put(69, 29, 'reach the internet.', '#5ee1ff');
  }

  function hubItems() {
    const items = [];
    items.push({ kind: 'start', label: '[ BEGIN RUN ]  C:\\Temp', right: skipT ? 'debug t+' + skipT + 's' : '', rcol: '#ffb454', gap: 2 });
    const fkeys = Object.keys(OW.FORMS);
    // list all forms with lock status (Enter equips / restores)
    fkeys.forEach((k) => {
      const F = OW.FORMS[k];
      const owned = save.forms[k];
      items.push({ kind: 'formbuy', id: k, label: '  ' + (save.form === k ? '*' : ' ') + ' ' + F.name.padEnd(6) + F.desc.split('. ')[0], right: owned ? 'restored' : F.cost + ' B', rcol: owned ? '#3fa66a' : '#ffd24a', dim: !owned });
    });
    items[items.length - 1].gap = 2;
    OW.META.forEach((m) => {
      const r = save.up[m.id] || 0;
      const done = r >= m.max;
      items.push({ kind: 'meta', id: m.id, label: m.name.padEnd(16) + '[' + '■'.repeat(r) + '□'.repeat(m.max - r) + '] ' + m.desc, right: done ? 'MAX' : m.cost(r) + ' B', rcol: done ? '#3fa66a' : '#ffd24a' });
    });
    return items;
  }

  function hubActivate() {
    const it = hubItems()[hubSel];
    hubMsg = '';
    if (!it) return;
    if (it.kind === 'start') return startRun();
    if (it.kind === 'formbuy') {
      const F = OW.FORMS[it.id];
      if (save.forms[it.id]) { save.form = it.id; persist(); return; }
      if (save.bytes >= F.cost) { save.bytes -= F.cost; save.forms[it.id] = true; save.form = it.id; persist(); hubMsg = 'restored ' + F.name; }
      else hubMsg = 'not enough recovered bytes';
    }
    if (it.kind === 'meta') {
      const m = OW.META.find((x) => x.id === it.id);
      const r = save.up[m.id] || 0;
      if (r >= m.max) return;
      const c = m.cost(r);
      if (save.bytes >= c) { save.bytes -= c; save.up[m.id] = r + 1; persist(); }
      else hubMsg = 'not enough recovered bytes';
    }
  }

  function startRun() {
    G = OW.newRun(save, save.form, { t: skipT });
    window.OW.game = G;
    mode = 'run';
    msg0();
  }
  function msg0() { G.msgs.push({ text: 'AIM WITH THE MOUSE. YOU ALWAYS FIRE.', col: '#e8f1f5', t: 0, life: 3 }); }

  function cardAt(px, py) {
    const bw = 30, gap = 3, start = Math.floor((COLS - (bw * 3 + gap * 2)) / 2);
    const col = px / CW, row = py / CH;
    if (row < 8 || row > 22) return -1;
    for (let i = 0; i < 3; i++) {
      const c0 = start + i * (bw + gap);
      if (col >= c0 && col <= c0 + bw) return i;
    }
    return -1;
  }

  function handleClick(c) {
    if (mode === 'hub') {
      const row = Math.floor(c.y / CH), col = c.x / CW;
      const i = hubRows.indexOf(row);
      if (i >= 0 && col > 3 && col < 65) { hubSel = i; hubActivate(); }
    } else if (mode === 'run') {
      if (G.over) { if (G.overT > 1) { if (!banked) bankRun(); mode = 'hub'; banked = null; } }
      else if (G.choices) {
        const i = cardAt(c.x, c.y);
        if (i >= 0) { OW.applyChoice(G, i); G.sel = 0; }
        else if (c.y / CH > 23 && c.y / CH < 26) OW.reroll(G);
      }
    } else if (mode === 'pause') mode = 'run';
  }

  function drawLevelUp() {
    ctx.fillStyle = 'rgba(4,8,12,0.9)';
    ctx.fillRect(0, 0, VW, VH);
    setFont();
    putC(3, '*** LEVEL UP ***', '#ffe08a');
    putC(5, 'choose a patch  [1] [2] [3]   or  <- -> ENTER', '#7f98a5');
    const bw = 30, gap = 3, start = Math.floor((COLS - (bw * 3 + gap * 2)) / 2);
    G.choices.forEach((c, i) => {
      const d = OW.describeChoice(G, c);
      const c0 = start + i * (bw + gap);
      const sel = i === (G.sel || 0);
      panel(c0, 8, bw, 14, d.tag, sel ? d.col : '#3b5566');
      put(c0 + 2, 10, '[' + (i + 1) + ']', '#7f98a5');
      put(c0 + 2, 12, d.title, d.col);
      put(c0 + 2, 13, d.sub, '#9fb4be');
      wrap(d.body, bw - 4).forEach((l, k) => put(c0 + 2, 15 + k, l, '#cfe3ea'));
      if (sel) put(c0 + 2, 20, '> ENTER', '#8affb0');
    });
    putC(24, 'rerolls left: ' + G.rerolls + (G.rerolls ? '   [R] reroll' : ''), '#ffb454');
  }

  function drawPause() {
    ctx.fillStyle = 'rgba(4,8,12,0.7)';
    ctx.fillRect(0, 0, VW, VH);
    setFont();
    panel(35, 10, 31, 10, 'PAUSED');
    putC(13, '[P] / [ESC]   resume', '#cfe3ea');
    putC(15, '[Q]           abandon run', '#cfe3ea');
    putC(17, 'bytes are banked on abandon', '#7f98a5');
  }

  function drawOver() {
    const dead = G.over === 'dead';
    // static
    if (dead && G.overT < 1.2) {
      ctx.fillStyle = '#ff5f5f';
      ctx.globalAlpha = 0.35;
      for (let i = 0; i < 260; i++) ctx.fillText('01#%&@'[Math.floor(Math.random() * 6)], Math.random() * VW, Math.random() * VH);
      ctx.globalAlpha = 1;
    }
    ctx.fillStyle = 'rgba(4,8,12,' + Math.min(0.85, G.overT * 0.8) + ')';
    ctx.fillRect(0, 0, VW, VH);
    if (G.overT < 0.8) return;
    setFont(BIG);
    ctx.fillStyle = dead ? '#ff6b6b' : '#8affb0';
    ctx.fillText(dead ? 'FILE DELETED' : 'CONNECTION ESTABLISHED', VW / 2, CH * 4);
    setFont();
    if (!dead) putC(6, 'You are online. For now. (More directories are coming.)', '#cfe3ea');
    else putC(6, 'Not destroyed. Only overwritten.', '#7f98a5');
    panel(30, 9, 41, 16, 'RECOVERED BYTES');
    const b = banked;
    let r = 11;
    put(32, r++, 'survived       ' + mmss(G.t), '#cfe3ea');
    put(32, r++, 'files deleted  ' + G.kills, '#cfe3ea');
    put(32, r++, 'level          ' + G.level, '#cfe3ea');
    r++;
    b.parts.forEach(([n, v]) => { if (v) put(32, r++, (n + '                ').slice(0, 16) + '+' + v, '#9fb4be'); });
    r++;
    put(32, r++, 'TOTAL          +' + b.total + ' B', '#ffd24a');
    putC(27, '[ENTER]  return to the Recycle Bin', Math.floor(performance.now() / 500) % 2 ? '#8affb0' : '#4b8a68');
  }

  // ------------------------------------------------------------------ run end
  function bankRun() {
    banked = OW.runBytes(G);
    save.bytes += banked.total;
    save.runs++;
    if (G.over === 'win') save.wins++;
    save.best = Math.max(save.best || 0, G.t);
    persist();
  }

  // ------------------------------------------------------------------ main loop
  let last = performance.now();
  let acc = 0;
  const STEP = 1 / 60;

  function handleKeys() {
    while (pressed.length) {
      const k = pressed.shift();
      if (mode === 'hub') {
        const n = hubItems().length;
        if (k === 'arrowdown' || k === 's') hubSel = (hubSel + 1) % n;
        else if (k === 'arrowup' || k === 'w') hubSel = (hubSel + n - 1) % n;
        else if (k === 'enter' || k === ' ') hubActivate();
        else if (k === 'arrowleft' || k === 'arrowright' || k === 'a' || k === 'd' || k === 'tab') {
          const owned = Object.keys(OW.FORMS).filter((f) => save.forms[f]);
          const i = owned.indexOf(save.form);
          const dir = k === 'arrowleft' || k === 'a' ? -1 : 1;
          save.form = owned[(i + dir + owned.length) % owned.length];
          persist();
        }
      } else if (mode === 'run') {
        if (G.choices) {
          if (k === '1' || k === '2' || k === '3') OW.applyChoice(G, +k - 1);
          else if (k === 'arrowleft' || k === 'a') G.sel = ((G.sel || 0) + 2) % 3;
          else if (k === 'arrowright' || k === 'd') G.sel = ((G.sel || 0) + 1) % 3;
          else if (k === 'enter' || k === ' ') OW.applyChoice(G, G.sel || 0);
          else if (k === 'r') OW.reroll(G);
          if (!G.choices) G.sel = 0;
        } else if (G.over) {
          if (k === 'enter' && G.overT > 1) { if (!banked) bankRun(); mode = 'hub'; banked = null; }
        } else if (k === 'p' || k === 'escape') mode = 'pause';
        else if (k === ' ') dashQueued = true;
      } else if (mode === 'pause') {
        if (k === 'p' || k === 'escape') mode = 'run';
        else if (k === 'q') { G.over = 'dead'; G.overT = 0; G.p.hp = 0; mode = 'run'; }
      }
    }
  }

  function frame(now) {
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    handleKeys();
    if (clickQueued) { handleClick(clickQueued); clickQueued = null; }
    if (mode === 'hub' && mouse.moved) {
      const i = hubRows.indexOf(Math.floor(mouse.y / CH));
      if (i >= 0 && mouse.x / CW > 3 && mouse.x / CW < 65) hubSel = i;
    } else if (mode === 'run' && G.choices && mouse.moved) {
      const i = cardAt(mouse.x, mouse.y);
      if (i >= 0) G.sel = i;
    }
    mouse.moved = false;
    canvas.style.cursor = mode === 'run' && !G.choices && !G.over ? 'none' : 'default';

    if (mode === 'run') {
      acc += dt;
      let n = 0;
      while (acc >= STEP && n < 4) {
        const mv = readMove();
        OW.step(G, STEP, { dx: mv.dx, dy: mv.dy, dash: dashQueued, ox: mouse.x - VW / 2, oy: mouse.y - VH / 2 });
        dashQueued = false;
        acc -= STEP;
        n++;
      }
      if (n === 4) acc = 0;
      if (G.over && !banked) bankRun();
    }

    ctx.fillStyle = '#07090c';
    ctx.fillRect(0, 0, VW, VH);
    setFont();
    if (mode === 'hub') drawHub();
    else {
      drawWorld();
      if (!G.over && !G.choices && mode === 'run') drawReticle();
      glitchPass();
      drawHud();
      if (G.over) drawOver();
      else if (G.choices) drawLevelUp();
      else if (mode === 'pause') drawPause();
    }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  // Debug/test hooks.
  OW.ui = { get mode() { return mode; }, startRun, save, get G() { return G; }, setMode: (m) => (mode = m) };
})();
