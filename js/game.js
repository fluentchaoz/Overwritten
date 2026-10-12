// OVERWRITTEN - simulation. No DOM access in here so it can be tested headlessly.
(function (g) {
  'use strict';
  const OW = g.OW;
  const { CW, CH, VW, VH } = OW;
  const TAU = Math.PI * 2;

  const rr = (a, b) => a + Math.random() * (b - a);
  const ri = (a, b) => Math.floor(rr(a, b + 1));
  const pick = (a) => a[Math.floor(Math.random() * a.length)];
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

  const MAX_ENEMIES = 340;
  const PLAYER_R = 9;
  const MAX_WEAPONS = 6;
  const MAX_PASSIVES = 6;

  // ------------------------------------------------------------------ helpers
  function artSize(rows) {
    let w = 0;
    for (const r of rows) if (r.length > w) w = r.length;
    return { w, h: rows.length };
  }
  OW.artSize = artSize;

  const GS = 48;
  const gkey = (cx, cy) => (cx + 100000) * 200003 + (cy + 100000);
  function buildGrid(G) {
    const m = G.grid;
    m.clear();
    for (const e of G.enemies) {
      if (e.dead || e.boss) continue;
      const k = gkey(Math.floor(e.x / GS), Math.floor(e.y / GS));
      let a = m.get(k);
      if (!a) m.set(k, (a = []));
      a.push(e);
    }
  }
  function near(G, x, y, rad, cb) {
    const x0 = Math.floor((x - rad) / GS), x1 = Math.floor((x + rad) / GS);
    const y0 = Math.floor((y - rad) / GS), y1 = Math.floor((y + rad) / GS);
    for (let cx = x0; cx <= x1; cx++) {
      for (let cy = y0; cy <= y1; cy++) {
        const a = G.grid.get(gkey(cx, cy));
        if (a) for (let i = 0; i < a.length; i++) if (!a[i].dead) cb(a[i]);
      }
    }
  }
  const targetable = (e) => !e.dead && !(e.type === 'trojan' && !e.open) && !(e.boss && e.intro > 0);

  function nearest(G, x, y, n, maxR) {
    const out = [];
    const mr2 = maxR * maxR;
    for (const e of G.enemies) {
      if (!targetable(e)) continue;
      const d2 = (e.x - x) * (e.x - x) + (e.y - y) * (e.y - y);
      if (d2 > mr2) continue;
      out.push({ e, d2 });
    }
    out.sort((a, b) => a.d2 - b.d2);
    return out.slice(0, n).map((o) => o.e);
  }

  // Sound events are queued for the UI layer to play (the sim itself never touches audio).
  function snd(G, n, x, y, a) {
    if (G.ev.length < 60) G.ev.push([n, x, y, a]);
  }

  function msg(G, text, col, life) {
    G.msgs.push({ text, col: col || '#e8f1f5', t: 0, life: life || 2.4 });
    if (G.msgs.length > 4) G.msgs.shift();
  }
  function text(G, x, y, str, col) {
    if (G.texts.length > 60) return;
    G.texts.push({ x, y, str: String(str), col, t: 0, life: 0.6 });
  }
  function burstChars(G, x, y, rows, col, n) {
    if (G.parts.length > 500) return;
    const chars = [];
    for (const r of rows) for (const c of r) if (c !== ' ') chars.push(c);
    const count = n || chars.length;
    for (let i = 0; i < count; i++) {
      const a = rr(0, TAU), s = rr(40, 150);
      G.parts.push({ x: x + rr(-6, 6), y: y + rr(-6, 6), vx: Math.cos(a) * s, vy: Math.sin(a) * s, t: 0,
        life: rr(0.35, 0.7), ch: chars.length ? pick(chars) : pick('#%&@'), col });
    }
  }

  // ------------------------------------------------------------------ run setup
  OW.newRun = function (meta, formId, opts) {
    opts = opts || {};
    meta = meta || {};
    const form = OW.FORMS[formId] || OW.FORMS.txt;
    const mv = (id) => (meta.up && meta.up[id]) || 0;
    const maxhp = Math.round((100 + mv('hp') * 10) * form.hp);
    const G = {
      t: 0, over: null, overT: 0, form, meta: { hp: mv('hp'), dmg: mv('dmg'), spd: mv('spd'), mag: mv('mag'), rr: mv('rr'), rev: mv('rev') },
      eid: 0, kills: 0, level: 1, xp: 0, pending: 0, choices: null,
      rerolls: mv('rr'), revives: mv('rev'),
      p: { x: 0, y: 0, hp: maxhp, maxhp, invuln: 0, face: 1, fx: 1, fy: 0, hist: [], histT: 0, dashCd: 0, aim: 0, cox: 200, coy: 0, cx: 200, cy: 0, lastTrailX: 0, lastTrailY: 0 },
      enemies: [], shots: [], eshots: [], bits: [], fx: [], parts: [], texts: [], msgs: [], hazards: [], timers: [],
      weapons: [], pas: {}, grid: new Map(),
      spawnAcc: 0, eliteT: OW.TUNING.eliteFirst, purge: 0, bossSpawned: false, boss: null, bossDead: false, portal: null,
      shake: 0, glitch: 0, mod: null, bitsCollected: 0, ev: [],
    };
    G.weapons.push({ id: form.start, lv: 1, cd: 0.4, evolved: false });
    recalc(G);
    if (opts.t) G.t = opts.t;
    return G;
  };

  function recalc(G) {
    const pa = G.pas;
    G.mod = {
      dmg: (1 + 0.1 * (pa.overhead || 0)) * (1 + 0.05 * G.meta.dmg) * G.form.dmg,
      cd: Math.max(0.4, 1 - 0.08 * (pa.bandwidth || 0)),
      amt: Math.ceil((pa.regex || 0) / 2),
      spd: (1 + 0.08 * (pa.thru || 0) + 0.04 * G.meta.spd) * G.form.spd,
      mag: 1 + 0.25 * (pa.cache || 0) + 0.1 * G.meta.mag,
    };
  }

  // ------------------------------------------------------------------ enemies
  function enemyHpMult(G) {
    return 1 + (G.t / 60) * OW.TUNING.hpPerMin + G.purge * 0.08;
  }
  function mkEnemy(G, type, x, y, o) {
    o = o || {};
    const d = OW.ENEMIES[type];
    const hp = (o.hp || d.hp) * (type === 'boss' ? 1 : enemyHpMult(G)) * (o.hpMul || 1);
    const e = {
      id: ++G.eid, type, def: d, x, y, hp, maxhp: hp, face: Math.random() < 0.5 ? 1 : -1, t: Math.random() * 3,
      kx: 0, ky: 0, flash: 0, dead: false, ph: Math.random() * TAU, dir: Math.random() < 0.5 ? 1 : -1,
      shotT: rr(1, 2.6), seg: 0, leader: null, open: false, ot: 0, mod: null, elite: false, boss: type === 'boss',
    };
    const rows = d.art(e);
    const s = artSize(rows);
    e.r = d.r || Math.max(s.w * CW, s.h * CH) * 0.5 * 0.95;
    if (o.mod) {
      e.mod = o.mod;
      e.elite = true;
      e.hp = e.maxhp = hp * OW.ELITE_MODS[o.mod].hp;
    }
    G.enemies.push(e);
    return e;
  }

  function ringPos(G) {
    const a = rr(0, TAU), c = Math.cos(a), s = Math.sin(a);
    const t = Math.min((VW / 2 + 50) / Math.max(0.001, Math.abs(c)), (VH / 2 + 50) / Math.max(0.001, Math.abs(s)));
    const d = t + rr(0, 70);
    return [G.p.x + c * d, G.p.y + s * d];
  }

  function spawnWorm(G, x, y) {
    const n = 6 + Math.floor(G.t / 120);
    const dx = G.p.x - x, dy = G.p.y - y, d = Math.hypot(dx, dy) || 1;
    let prev = null;
    for (let i = 0; i < n; i++) {
      const e = mkEnemy(G, 'worm', x - (dx / d) * i * 20, y - (dy / d) * i * 20, { hpMul: i === 0 ? 2.2 : 1 });
      e.seg = i;
      e.leader = prev;
      prev = e;
    }
  }

  function spawnType(G, type, x, y, mod) {
    if (type === 'worm') return spawnWorm(G, x, y);
    return mkEnemy(G, type, x, y, { mod });
  }

  function director(G, dt) {
    const t = G.t;
    if (G.over) return;
    // Purge pressure
    if (t >= OW.PURGE_START) {
      const lv = Math.floor((t - OW.PURGE_START) / OW.TUNING.purgeLen) + 1;
      if (lv !== G.purge) {
        G.purge = lv;
        msg(G, lv === 1 ? 'PURGE INITIATED' : 'PURGE LEVEL ' + lv, '#ff6b6b', 3);
        snd(G, 'purge');
      }
    }
    // Boss
    if (!G.bossSpawned && t >= OW.BOSS_TIME) {
      G.bossSpawned = true;
      const b = mkEnemy(G, 'boss', G.p.x + (Math.random() < 0.5 ? 1 : -1) * 520, G.p.y - 60);
      b.intro = 2.0; b.mode = 'idle'; b.atkT = 3.5; b.seqI = 0; b.mt = 0;
      G.boss = b;
      msg(G, 'DISK CLEANUP.EXE IS RUNNING', '#ffd24a', 4);
      snd(G, 'bossintro');
    }
    const bossLive = G.boss && !G.boss.dead;
    // Regular spawns
    const avail = Object.keys(OW.ENEMIES).filter((k) => k !== 'boss' && OW.ENEMIES[k].from <= t);
    const T = OW.TUNING;
    // Ebb and flow: surges and lulls instead of constant pressure. Starts in a lull.
    const wave = Math.sin((t / T.wavePeriod) * TAU - Math.PI / 2);
    const rate = (T.spawnBase + t * T.spawnGrowth) * (1 + T.waveAmp * wave) * (1 + 0.15 * G.purge) * (bossLive ? 0.5 : G.bossDead ? 0.7 : 1);
    const cap = Math.min(MAX_ENEMIES, (T.capBase + t * T.capGrowth + G.purge * T.capPurge) * (1 + 0.15 * wave));
    G.spawnAcc = Math.min(G.spawnAcc + dt * rate, 4);
    while (G.spawnAcc >= 1 && G.enemies.length < cap) {
      G.spawnAcc -= 1;
      let tot = 0;
      for (const k of avail) tot += OW.ENEMIES[k].w;
      let r = Math.random() * tot, type = avail[0];
      for (const k of avail) { r -= OW.ENEMIES[k].w; if (r <= 0) { type = k; break; } }
      const [x, y] = ringPos(G);
      spawnType(G, type, x, y);
    }
    // Elites
    if (!G.bossSpawned) {
      G.eliteT -= dt;
      if (G.eliteT <= 0) {
        G.eliteT = Math.max(45, OW.TUNING.eliteEvery - t * 0.03);
        const types = avail.filter((k) => k !== 'worm' && k !== 'trojan');
        const [x, y] = ringPos(G);
        const e = mkEnemy(G, pick(types), x, y, { mod: pick(['*', '!', '&']) });
        msg(G, 'ELITE ' + e.def.name.toUpperCase() + ' [' + e.mod + '] DETECTED', OW.ELITE_MODS[e.mod].col, 2);
        snd(G, 'elite');
      }
    }
  }

  function updEnemy(G, e, dt) {
    const p = G.p;
    e.t += dt;
    if (e.flash > 0) e.flash -= dt;
    if (e.boss) return updBoss(G, e, dt);

    const dx = p.x - e.x, dy = p.y - e.y;
    const d = Math.hypot(dx, dy) || 1;
    const ux = dx / d, uy = dy / d;
    const sp = e.def.spd * (1 + Math.min(0.25, G.t / OW.TUNING.speedGrowth) + G.purge * 0.015);
    let vx = 0, vy = 0;

    switch (e.type) {
      case 'flick': {
        const lat = Math.sin(e.t * 7 + e.ph) * 0.9;
        vx = (ux - uy * lat) * sp; vy = (uy + ux * lat) * sp;
        break;
      }
      case 'spy': {
        const want = 230;
        const rad = d > want + 40 ? 1 : d < want - 40 ? -1 : 0;
        if (Math.random() < dt * 0.3) e.dir = -e.dir;
        vx = ux * sp * rad - uy * sp * 0.7 * e.dir;
        vy = uy * sp * rad + ux * sp * 0.7 * e.dir;
        e.shotT -= dt;
        if (e.shotT <= 0 && d < 470) {
          e.shotT = rr(2.2, 3.2);
          const s = 150;
          snd(G, 'spy', e.x, e.y);
          G.eshots.push({ x: e.x, y: e.y, vx: ux * s, vy: uy * s, dmg: 7, r: 7, life: 4, ch: pick(['?', '!']), col: '#ff9ae6' });
        }
        break;
      }
      case 'worm': {
        if (e.leader && !e.leader.dead) {
          const l = e.leader;
          const lx = l.x - e.x, ly = l.y - e.y, ld = Math.hypot(lx, ly) || 1;
          const gap = 20;
          if (ld > gap) {
            const mv = (ld - gap) * Math.min(1, dt * 14);
            e.x += (lx / ld) * mv; e.y += (ly / ld) * mv;
          }
          if (Math.abs(lx) > 1) e.face = lx > 0 ? 1 : -1;
          return;
        }
        e.leader = null;
        const a = Math.atan2(dy, dx) + Math.sin(e.t * 2.2) * 0.7;
        vx = Math.cos(a) * sp; vy = Math.sin(a) * sp;
        break;
      }
      case 'trojan': {
        if (!e.open) {
          vx = ux * sp; vy = uy * sp;
          if (d < 105) { e.open = true; e.ot = 0.5; snd(G, 'tropen', e.x, e.y); }
        } else {
          e.ot -= dt;
          if (e.ot <= 0) trojanBurst(G, e);
        }
        break;
      }
      default:
        vx = ux * sp; vy = uy * sp;
    }

    e.x += (vx + e.kx) * dt;
    e.y += (vy + e.ky) * dt;
    const dec = Math.exp(-8 * dt);
    e.kx *= dec; e.ky *= dec;
    if (Math.abs(vx) > 5) e.face = vx > 0 ? 1 : -1;

    // Leash: stragglers get recycled to the edge of the screen.
    if (d > 1100 && e.type !== 'worm') {
      const [x, y] = ringPos(G);
      e.x = x; e.y = y;
    }
  }

  function trojanBurst(G, e) {
    if (e.dead) return;
    e.dead = true;
    msg(G, 'PAYLOAD DELIVERED', '#ff6b6b', 1.4);
    snd(G, 'trojan', e.x, e.y);
    burstChars(G, e.x, e.y, ['[=]'], '#ff6b6b', 10);
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * TAU;
      mkEnemy(G, 'swarm', e.x + Math.cos(a) * 20, e.y + Math.sin(a) * 20);
    }
  }

  // ---- boss
  function updBoss(G, e, dt) {
    const p = G.p;
    if (e.intro > 0) { e.intro -= dt; return; }
    const dx = p.x - e.x, dy = p.y - e.y, d = Math.hypot(dx, dy) || 1;
    const phase2 = e.hp < e.maxhp * 0.5;
    e.flashOnly = false;

    if (e.mode === 'idle') {
      e.x += (dx / d) * e.def.spd * (phase2 ? 1.4 : 1) * dt;
      e.y += (dy / d) * e.def.spd * (phase2 ? 1.4 : 1) * dt;
      e.atkT -= dt;
      if (e.atkT <= 0) {
        const seq = ['sweep', 'spawn', 'charge', 'sweep', 'spawn', 'charge'];
        const a = seq[e.seqI++ % seq.length];
        if (a === 'sweep') {
          const n = phase2 ? 2 : 1;
          for (let i = 0; i < n; i++) {
            const axis = Math.random() < 0.5 ? 'h' : 'v';
            const c = (axis === 'h' ? p.y : p.x) + (i ? rr(-120, 120) : rr(-20, 20));
            G.hazards.push({ k: 'band', axis, c, th: 60, t: 0, tele: 1.15, act: 0.5, hitDone: false, fired: false });
            snd(G, 'bandtele');
          }
          e.atkT = phase2 ? 2.4 : 3.2;
        } else if (a === 'spawn') {
          const n = phase2 ? 12 : 8;
          for (let i = 0; i < n; i++) {
            const an = (i / n) * TAU;
            mkEnemy(G, i % 4 === 0 ? 'flick' : 'swarm', e.x + Math.cos(an) * 100, e.y + Math.sin(an) * 80);
          }
          burstChars(G, e.x, e.y, ['0-<>'], '#ffd24a', 14);
          snd(G, 'bossspawn', e.x, e.y);
          e.atkT = phase2 ? 2.4 : 3.0;
        } else {
          e.mode = 'tele'; e.mt = phase2 ? 0.65 : 0.85;
          snd(G, 'bosstele', e.x, e.y);
        }
      }
    } else if (e.mode === 'tele') {
      e.mt -= dt;
      e.cvx = dx / d; e.cvy = dy / d;
      if (e.mt <= 0) { e.mode = 'charge'; e.mt = 0.7; snd(G, 'bosscharge', e.x, e.y); }
    } else if (e.mode === 'charge') {
      e.mt -= dt;
      e.x += e.cvx * 470 * dt;
      e.y += e.cvy * 470 * dt;
      if (e.mt <= 0) { e.mode = 'idle'; e.atkT = phase2 ? 2.2 : 3.0; }
    }
  }

  function bossDead(G, e) {
    G.bossDead = true;
    msg(G, 'DISK CLEANUP.EXE HAS STOPPED RESPONDING', '#ffd24a', 4);
    snd(G, 'bossdie');
    G.shake = 14;
    for (const o of G.enemies) {
      if (o === e || o.dead) continue;
      o.dead = true;
      burstChars(G, o.x, o.y, o.def.art(o), o.def.col, 4);
      dropBit(G, o.x, o.y, Math.max(1, o.def.xp));
    }
    G.eshots.length = 0;
    G.hazards.length = 0;
    burstChars(G, e.x, e.y, OW.ENEMIES.boss.art(e), '#ffd24a', 60);
    for (let i = 0; i < 2; i++) G.bits.push({ x: e.x + rr(-40, 40), y: e.y + rr(-30, 30), v: 0, kind: 'chest', ch: '[▣]', col: '#ffd24a', mag: false });
    const a = rr(0, TAU);
    G.portal = { x: G.p.x + Math.cos(a) * 480, y: G.p.y + Math.sin(a) * 340, t: 0 };
    msg(G, 'UPLINK DETECTED. REACH THE >>> PORTAL', '#8affb0', 5);
    G.timers.push({ t: 1.6, fn: () => snd(G, 'portal') });
  }

  // ------------------------------------------------------------------ damage
  function hurtEnemy(G, e, dmg, ang, kb) {
    if (e.dead || (e.boss && e.intro > 0)) return false;
    e.hp -= dmg;
    e.flash = 0.09;
    snd(G, 'hit', e.x, e.y);
    if (kb && !e.boss) {
      const k = kb * (1 - (e.def.kbRes || 0));
      e.kx += Math.cos(ang) * k; e.ky += Math.sin(ang) * k;
    }
    if (dmg >= 18 || (G.texts.length < 14 && Math.random() < 0.5)) text(G, e.x + rr(-8, 8), e.y - e.r, Math.max(1, Math.round(dmg)), e.boss ? '#ffd24a' : '#e8f1f5');
    if (e.hp <= 0) { killEnemy(G, e); return true; }
    return false;
  }

  function dropBit(G, x, y, v) {
    if (G.bits.length > 320) {
      // Merge into an existing bit so XP is never lost.
      const o = G.bits[Math.floor(Math.random() * G.bits.length)];
      if (o.kind === 'xp') { o.v += v; if (o.v >= 2) { o.ch = '1'; o.col = '#5ee1ff'; } return; }
    }
    G.bits.push({ x: x + rr(-6, 6), y: y + rr(-6, 6), v, kind: 'xp', ch: v >= 2 ? '1' : '0', col: v >= 2 ? '#5ee1ff' : '#3fa66a', mag: false });
  }

  function killEnemy(G, e, silent) {
    if (e.dead) return;
    e.dead = true;
    G.kills++;
    const rows = e.def.art(e);
    burstChars(G, e.x, e.y, rows, e.elite ? OW.ELITE_MODS[e.mod].col : e.def.col);
    if (e.boss) return bossDead(G, e);
    snd(G, e.elite || e.def.hp >= 15 ? 'killbig' : 'kill', e.x, e.y, e.r < 12 ? 1.25 : 0.8);
    if (silent) return;
    const xp = e.def.xp * (e.elite ? 5 : 1);
    if (xp > 0) dropBit(G, e.x, e.y, xp);
    const roll = Math.random();
    if (roll < 0.012) G.bits.push({ x: e.x, y: e.y, v: 0, kind: 'heal', ch: '(+)', col: '#6dff9c', mag: false });
    else if (roll < 0.016) G.bits.push({ x: e.x, y: e.y, v: 0, kind: 'magnet', ch: 'U', col: '#ffd24a', mag: false });
    if (e.elite) {
      G.bits.push({ x: e.x, y: e.y, v: 0, kind: 'chest', ch: '[▣]', col: '#ffd24a', mag: false });
      if (e.mod === '!') {
        G.fx.push({ k: 'ebl', x: e.x, y: e.y, t: 0, delay: 0.7, R: 80, dmg: 18, done: false });
        snd(G, 'ebeep', e.x, e.y);
      } else if (e.mod === '&') {
        for (let i = 0; i < 3; i++) mkEnemy(G, 'swarm', e.x + rr(-14, 14), e.y + rr(-14, 14));
      }
    }
    if (e.type === 'trojan') {
      snd(G, 'trojan', e.x, e.y);
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * TAU;
        mkEnemy(G, 'swarm', e.x + Math.cos(a) * 20, e.y + Math.sin(a) * 20);
      }
    }
    if (e.type === 'worm') {
      for (const o of G.enemies) if (o.leader === e) o.leader = e.leader;
    }
  }

  function hurtPlayer(G, dmg) {
    const p = G.p;
    if (p.invuln > 0 || G.over) return;
    p.hp -= dmg;
    snd(G, 'hurt');
    p.invuln = 0.5;
    G.glitch = 0.3;
    G.shake = Math.max(G.shake, 6);
    if (p.hp <= 0) {
      if (G.revives > 0) {
        G.revives--;
        p.hp = Math.round(p.maxhp * 0.5);
        p.invuln = 2.5;
        msg(G, 'RESTORED FROM BACKUP', '#6dff9c', 3);
        snd(G, 'revive');
        G.shake = 14;
        for (const e of G.enemies) {
          if (e.dead || e.boss) continue;
          if (Math.hypot(e.x - p.x, e.y - p.y) < 320) hurtEnemy(G, e, 9999, 0, 0);
        }
        G.fx.push({ k: 'ping', x: p.x, y: p.y, t: 0, dur: 0.6, R: 320, hit: new Set(), dmg: 0, col: '#6dff9c' });
      } else {
        p.hp = 0;
        snd(G, 'death');
        G.over = 'dead';
        G.overT = 0;
      }
    }
  }
  const dscale = (G) => 1 + (G.t / 600) * 0.8;

  // ------------------------------------------------------------------ weapons
  function dirChar(a) {
    const c = Math.cos(a), s = Math.sin(a);
    if (Math.abs(c) > 0.92) return '-';
    if (Math.abs(s) > 0.92) return '|';
    return c * s > 0 ? '\\' : '/';
  }
  function shoot(G, ang, dmg, o) {
    const sp = o.speed || 400;
    G.shots.push({
      x: G.p.x, y: G.p.y, vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp, dmg, r: o.r || 10, life: 1.7,
      pierce: o.pierce || 0, hits: [], ch: o.ch || dirChar(ang), col: o.col || '#5ee1ff', dead: false, ang, sp,
    });
  }

  // Where the weapons point. The cursor decides; the Lock-On passive bends the aim toward enemies:
  // lv1 = narrow cone around the cursor line, lv2 = wide cone, lv3 = aims for you (nearest enemy).
  function aimAt(G) {
    const p = G.p, lock = G.pas.lock || 0;
    if (lock > 0) {
      const cone = lock >= 3 ? Math.PI : lock === 2 ? 0.85 : 0.4;
      let best = null, bs = 1e9;
      for (const e of G.enemies) {
        if (!targetable(e)) continue;
        const dx = e.x - p.x, dy = e.y - p.y, d = Math.hypot(dx, dy);
        if (d > 720) continue;
        let da = Math.atan2(dy, dx) - p.aim;
        da = Math.atan2(Math.sin(da), Math.cos(da));
        if (Math.abs(da) > cone) continue;
        const score = lock >= 3 ? d : Math.abs(da) * 260 + d * 0.4;
        if (score < bs) { bs = score; best = e; }
      }
      if (best) return { ang: Math.atan2(best.y - p.y, best.x - p.x), t: best };
    }
    return { ang: p.aim, t: null };
  }

  const FIRE = {
    grep(G, w) {
      const l = w.lv, M = G.mod;
      const amt = 1 + Math.floor(l / 2) + M.amt;
      const dmg = 6 * (1 + 0.18 * (l - 1)) * M.dmg * (w.evolved ? 1.5 : 1);
      const aim = aimAt(G);
      for (let i = 0; i < amt; i++) {
        const a = aim.ang + (i - (amt - 1) / 2) * 0.13;
        shoot(G, a, dmg, { pierce: (l >= 3 ? 1 : 0) + (l >= 6 ? 1 : 0) + (w.evolved ? 2 : 0), r: w.evolved ? 12 : 10 });
      }
      if (w.evolved) {
        const base = G.t * 1.7;
        for (let k = 0; k < 8; k++) shoot(G, base + (k * TAU) / 8, dmg * 0.8, { pierce: 2, col: '#e0a8ff', r: 11 });
      }
      snd(G, 'grep', G.p.x, G.p.y);
      return 1.0 * M.cd * Math.pow(0.95, l - 1);
    },
    ping(G, w) {
      const l = w.lv, M = G.mod, p = G.p;
      const R = (100 + 14 * l) * (l >= 8 ? 1.25 : 1);
      G.fx.push({ k: 'ping', x: p.x, y: p.y, t: 0, dur: 0.7, R, hit: new Set(), dmg: 9 * (1 + 0.2 * (l - 1)) * M.dmg, col: '#8affb0' });
      snd(G, 'ping', p.x, p.y);
      return 3.0 * M.cd * Math.pow(0.93, l - 1);
    },
    cat(G, w) {
      const l = w.lv, M = G.mod, p = G.p;
      const range = 76 + 8 * l, half = l >= 8 ? 1.2 : 0.9;
      const dmg = 13 * (1 + 0.2 * (l - 1)) * M.dmg;
      const slash = (ang) => {
        G.fx.push({ k: 'slash', t: 0, dur: 0.2, ang, range, half });
        for (const e of G.enemies) {
          if (e.dead) continue;
          const dx = e.x - p.x, dy = e.y - p.y, d = Math.hypot(dx, dy);
          if (d > range + e.r) continue;
          let da = Math.atan2(dy, dx) - ang;
          da = Math.atan2(Math.sin(da), Math.cos(da));
          if (Math.abs(da) <= half || d < e.r + 14) hurtEnemy(G, e, dmg, Math.atan2(dy, dx), 220);
        }
      };
      const fa = aimAt(G).ang;
      slash(fa);
      snd(G, 'slash', p.x, p.y);
      if (l >= 4) G.timers.push({ t: 0.22, fn: () => slash(fa + Math.PI) });
      return 1.35 * M.cd * Math.pow(0.95, l - 1) * (l >= 7 ? 0.9 : 1);
    },
    rm(G, w) {
      const l = w.lv, M = G.mod, p = G.p;
      const amt = 1 + (l >= 6 ? 1 : 0) + M.amt;
      const thr = l >= 8 ? 0.35 : l >= 4 ? 0.25 : 0.15;
      const aim = aimAt(G);
      for (let i = 0; i < amt; i++) {
        const a = aim.ang + (i - (amt - 1) / 2) * 0.35;
        G.fx.push({ k: 'rm', x: p.x, y: p.y, ang: a, out: true, dist: 0, maxd: 210 + 16 * l, t: 0, thr, hitT: new Map(),
          dmg: 11 * (1 + 0.2 * (l - 1)) * M.dmg, spd: 330 });
      }
      snd(G, 'rm', p.x, p.y);
      return 2.4 * M.cd * Math.pow(0.94, l - 1) * (l >= 7 ? 0.85 : 1);
    },
    cron(G, w) {
      const l = w.lv, M = G.mod, p = G.p;
      const amt = 1 + Math.floor(l / 4) + M.amt;
      const lock = G.pas.lock || 0;
      const ts = lock ? nearest(G, p.x, p.y, 40, 520) : [];
      // cursor position, kept within a sane range of the player
      let cx = p.cx - p.x, cy = p.cy - p.y;
      const cd = Math.hypot(cx, cy) || 1, lim = Math.min(cd, 420);
      cx = p.x + (cx / cd) * lim; cy = p.y + (cy / cd) * lim;
      for (let i = 0; i < amt; i++) {
        let x = cx, y = cy;
        if (i > 0) { const a = rr(0, TAU), d = rr(30, 90); x += Math.cos(a) * d; y += Math.sin(a) * d * 0.7; }
        if (ts.length) { // Lock-On: snap to the closest enemy to the aimed point (any, at lv3)
          let best = null, bd = lock >= 3 ? 1e9 : 90 * 90;
          for (const t of ts) { const d2 = (t.x - x) ** 2 + (t.y - y) ** 2; if (d2 < bd) { bd = d2; best = t; } }
          if (lock >= 3 && ts.length) best = ts[Math.floor(Math.random() * ts.length)];
          if (best) { x = best.x; y = best.y; }
        }
        G.fx.push({ k: 'blast', x, y, t: 0, delay: 0.8, R: 50 + 5 * l, dmg: 26 * (1 + 0.2 * (l - 1)) * M.dmg, done: false });
      }
      snd(G, 'cronset', p.x, p.y);
      return 3.8 * M.cd * Math.pow(0.95, l - 1) * (l >= 7 ? 0.88 : 1);
    },
  };

  // tail -f has no cooldown: it leaves a trail as you move.
  function updTail(G, w, dt) {
    const p = G.p, l = w.lv;
    if (Math.hypot(p.x - p.lastTrailX, p.y - p.lastTrailY) >= 13) {
      p.lastTrailX = p.x; p.lastTrailY = p.y;
      G.fx.push({ k: 'trail', x: p.x, y: p.y, t: 0, life: 1.3 + 0.18 * l, tick: 0, r: 15 + (l >= 6 ? 6 : 0), dmg: 5 * (1 + 0.2 * (l - 1)) * G.mod.dmg * (l >= 8 ? 1.4 : 1) });
    }
  }

  function updWeapons(G, dt) {
    for (const w of G.weapons) {
      if (w.id === 'tail') { updTail(G, w, dt); continue; }
      w.cd -= dt;
      if (w.cd <= 0) {
        const cd = FIRE[w.id](G, w);
        w.cd = cd || 0.15;
      }
    }
  }

  // ------------------------------------------------------------------ fx / projectiles
  function updFx(G, dt) {
    const p = G.p;
    for (const f of G.fx) {
      f.t += dt;
      switch (f.k) {
        case 'ping': {
          const R = f.R * Math.min(1, f.t / f.dur);
          if (f.dmg > 0) {
            for (const e of G.enemies) {
              if (e.dead || f.hit.has(e.id)) continue;
              const dx = e.x - f.x, dy = e.y - f.y, d = Math.hypot(dx, dy);
              if (Math.abs(d - R) < e.r + 16) {
                f.hit.add(e.id);
                hurtEnemy(G, e, f.dmg, Math.atan2(dy, dx), 260);
              }
            }
          }
          if (f.t >= f.dur + 0.15) f.dead = true;
          break;
        }
        case 'slash': if (f.t >= f.dur) f.dead = true; break;
        case 'trail': {
          if (f.t >= f.life) { f.dead = true; break; }
          f.tick -= dt;
          if (f.tick <= 0) {
            f.tick = 0.33;
            near(G, f.x, f.y, f.r + 20, (e) => {
              if (Math.hypot(e.x - f.x, e.y - f.y) < f.r + e.r) hurtEnemy(G, e, f.dmg, Math.atan2(e.y - f.y, e.x - f.x), 0);
            });
            const b = G.boss;
            if (b && !b.dead && Math.hypot(b.x - f.x, b.y - f.y) < f.r + b.r) hurtEnemy(G, b, f.dmg, 0, 0);
          }
          break;
        }
        case 'rm': {
          const step = f.spd * dt;
          if (f.out) {
            f.x += Math.cos(f.ang) * step; f.y += Math.sin(f.ang) * step; f.dist += step;
            if (f.dist >= f.maxd) f.out = false;
          } else {
            const dx = p.x - f.x, dy = p.y - f.y, d = Math.hypot(dx, dy) || 1;
            f.x += (dx / d) * step * 1.15; f.y += (dy / d) * step * 1.15;
            if (d < 18) { f.dead = true; break; }
          }
          for (const [id, tm] of f.hitT) if (tm <= f.t) f.hitT.delete(id);
          for (const e of G.enemies) {
            if (e.dead || f.hitT.has(e.id)) continue;
            if (Math.hypot(e.x - f.x, e.y - f.y) < e.r + 16) {
              f.hitT.set(e.id, f.t + 0.4);
              if (!e.boss && e.hp - f.dmg <= e.maxhp * f.thr) { text(G, e.x, e.y - e.r, 'rm', '#ff6b6b'); killEnemy(G, e); }
              else hurtEnemy(G, e, f.dmg, Math.atan2(e.y - f.y, e.x - f.x), 120);
            }
          }
          if (f.t > 6) f.dead = true;
          break;
        }
        case 'blast': {
          if (!f.done && f.t >= f.delay) {
            f.done = true;
            for (const e of G.enemies) {
              if (e.dead) continue;
              const d = Math.hypot(e.x - f.x, e.y - f.y);
              if (d < f.R + e.r) hurtEnemy(G, e, f.dmg, Math.atan2(e.y - f.y, e.x - f.x), 180);
            }
            G.shake = Math.max(G.shake, 3);
            snd(G, 'blast', f.x, f.y);
          }
          if (f.t >= f.delay + 0.3) f.dead = true;
          break;
        }
        case 'ebl': { // hostile explosion from '!' elites
          if (!f.done && f.t >= f.delay) {
            f.done = true;
            if (Math.hypot(p.x - f.x, p.y - f.y) < f.R + PLAYER_R) hurtPlayer(G, f.dmg * dscale(G));
            G.shake = Math.max(G.shake, 4);
            snd(G, 'blast', f.x, f.y);
          }
          if (f.t >= f.delay + 0.3) f.dead = true;
          break;
        }
        case 'ghost': if (f.t >= 0.5) f.dead = true; break;
        default: f.dead = true;
      }
    }
    compact(G.fx);

    // Timers
    for (const tm of G.timers) { tm.t -= dt; if (tm.t <= 0) { tm.fn(); tm.dead = true; } }
    compact(G.timers);

    // Player shots
    for (const s of G.shots) {
      s.x += s.vx * dt; s.y += s.vy * dt;
      s.life -= dt;
      if (s.life <= 0) { s.dead = true; continue; }
      let stop = false;
      near(G, s.x, s.y, s.r + 24, (e) => {
        if (stop || s.dead) return;
        if (s.hits.indexOf(e.id) >= 0) return;
        if (Math.hypot(e.x - s.x, e.y - s.y) < e.r + s.r) {
          s.hits.push(e.id);
          hurtEnemy(G, e, s.dmg, Math.atan2(s.vy, s.vx), 90);
          if (s.pierce-- <= 0) { s.dead = true; stop = true; }
        }
      });
      const b = G.boss;
      if (!s.dead && b && !b.dead && s.hits.indexOf(b.id) < 0 && Math.hypot(b.x - s.x, b.y - s.y) < b.r + s.r) {
        s.hits.push(b.id);
        hurtEnemy(G, b, s.dmg, 0, 0);
        if (s.pierce-- <= 0) s.dead = true;
      }
    }
    compact(G.shots);

    // Enemy shots
    for (const s of G.eshots) {
      s.x += s.vx * dt; s.y += s.vy * dt; s.life -= dt;
      if (s.life <= 0) { s.dead = true; continue; }
      if (Math.hypot(p.x - s.x, p.y - s.y) < PLAYER_R + s.r) {
        hurtPlayer(G, s.dmg * dscale(G));
        s.dead = true;
      }
    }
    compact(G.eshots);

    // Hazards (boss bands)
    for (const h of G.hazards) {
      h.t += dt;
      if (h.t > h.tele + h.act) { h.dead = true; continue; }
      if (h.t >= h.tele) {
        if (!h.fired) { h.fired = true; snd(G, 'bandfire'); }
        const c = h.axis === 'h' ? p.y : p.x;
        if (Math.abs(c - h.c) < h.th / 2 + PLAYER_R) hurtPlayer(G, 22 * dscale(G));
      }
    }
    compact(G.hazards);

    // Particles / floating text / messages
    for (const q of G.parts) { q.t += dt; q.x += q.vx * dt; q.y += q.vy * dt; q.vx *= 0.95; q.vy *= 0.95; if (q.t >= q.life) q.dead = true; }
    compact(G.parts);
    for (const q of G.texts) { q.t += dt; q.y -= 30 * dt; if (q.t >= q.life) q.dead = true; }
    compact(G.texts);
    for (const m of G.msgs) { m.t += dt; if (m.t >= m.life) m.dead = true; }
    compact(G.msgs);
  }

  function compact(arr) {
    let j = 0;
    for (let i = 0; i < arr.length; i++) if (!arr[i].dead) arr[j++] = arr[i];
    arr.length = j;
  }

  // ------------------------------------------------------------------ pickups / xp
  function addXp(G, v) {
    G.xp += v;
    G.bitsCollected += v;
    let need = OW.xpNeed(G.level);
    while (G.xp >= need) {
      G.xp -= need;
      G.level++;
      G.pending++;
      need = OW.xpNeed(G.level);
    }
  }

  function updPickups(G, dt) {
    const p = G.p;
    const radius = 62 * G.mod.mag;
    for (const b of G.bits) {
      const dx = p.x - b.x, dy = p.y - b.y, d = Math.hypot(dx, dy);
      if (b.kind === 'chest' || b.kind === 'heal' || b.kind === 'magnet') {
        if (d < 16) {
          b.dead = true;
          if (b.kind === 'chest') { G.pending++; msg(G, 'CACHE OPENED', '#ffd24a', 1.4); snd(G, 'chest'); }
          else if (b.kind === 'heal') { snd(G, 'heal'); p.hp = Math.min(p.maxhp, p.hp + 25); text(G, p.x, p.y - 16, '+25', '#6dff9c'); }
          else { for (const o of G.bits) if (o.kind === 'xp') o.mag = true; msg(G, 'MAGNET', '#ffd24a', 1); snd(G, 'magnet'); }
        } else if (d < radius * 0.6) { b.x += (dx / d) * 160 * dt; b.y += (dy / d) * 160 * dt; }
        continue;
      }
      if (d < radius) b.mag = true;
      if (b.mag) {
        const sp = 260 + (400 - Math.min(400, d)) * 0.8 + 140;
        b.x += (dx / d) * sp * dt; b.y += (dy / d) * sp * dt;
        if (d < 14) { b.dead = true; addXp(G, b.v); snd(G, 'bit'); }
      }
    }
    compact(G.bits);
  }

  // ------------------------------------------------------------------ level ups
  function makeChoices(G) {
    const pool = [];
    const evo = [];
    for (const w of G.weapons) {
      const def = OW.WEAPONS[w.id];
      if (w.lv < def.max) pool.push({ kind: 'wup', id: w.id });
      else if (!w.evolved && def.evo && (G.pas[def.evo.pas] || 0) > 0) evo.push({ kind: 'evo', id: w.id });
    }
    if (G.weapons.length < MAX_WEAPONS) {
      for (const id of Object.keys(OW.WEAPONS)) if (!G.weapons.some((w) => w.id === id)) pool.push({ kind: 'wnew', id });
    }
    const pcount = Object.keys(G.pas).length;
    for (const id of Object.keys(OW.PASSIVES)) {
      const lv = G.pas[id] || 0;
      if (lv > 0 && lv < OW.PASSIVES[id].max) pool.push({ kind: 'pas', id });
      else if (lv === 0 && pcount < MAX_PASSIVES) pool.push({ kind: 'pas', id });
    }
    const out = evo.slice(0, 1);
    while (out.length < 3 && pool.length) out.push(pool.splice(Math.floor(Math.random() * pool.length), 1)[0]);
    const fillers = [{ kind: 'heal' }, { kind: 'bytes' }];
    while (out.length < 3) out.push(fillers[out.length % 2]);
    return out;
  }
  OW.describeChoice = function (G, c) {
    if (c.kind === 'wup') {
      const w = G.weapons.find((x) => x.id === c.id), d = OW.WEAPONS[c.id];
      return { title: d.name, sub: 'LV ' + w.lv + ' > ' + (w.lv + 1), body: d.lv[w.lv + 1], col: d.col, tag: 'UPGRADE' };
    }
    if (c.kind === 'wnew') { const d = OW.WEAPONS[c.id]; return { title: d.name, sub: 'NEW WEAPON', body: d.desc, col: d.col, tag: 'NEW' }; }
    if (c.kind === 'evo') { const d = OW.WEAPONS[c.id]; return { title: d.evo.name, sub: 'EVOLUTION', body: d.evo.desc, col: '#e0a8ff', tag: 'EVOLVE' }; }
    if (c.kind === 'pas') {
      const d = OW.PASSIVES[c.id], lv = G.pas[c.id] || 0;
      return { title: d.name, sub: lv ? 'LV ' + lv + ' > ' + (lv + 1) : 'NEW PASSIVE', body: d.desc, col: d.col, tag: 'PASSIVE' };
    }
    if (c.kind === 'heal') return { title: 'Restore', sub: 'FALLBACK', body: 'Heal 30 integrity.', col: '#6dff9c', tag: 'HEAL' };
    return { title: 'Scavenge', sub: 'FALLBACK', body: 'Gain 25 Recovered Bytes.', col: '#ffd24a', tag: 'BYTES' };
  };
  OW.applyChoice = function (G, idx) {
    const c = G.choices[idx];
    if (!c) return;
    if (c.kind === 'wup') G.weapons.find((w) => w.id === c.id).lv++;
    else if (c.kind === 'wnew') G.weapons.push({ id: c.id, lv: 1, cd: 0.3, evolved: false });
    else if (c.kind === 'evo') { const w = G.weapons.find((x) => x.id === c.id); w.evolved = true; msg(G, 'EVOLVED: ' + OW.WEAPONS[c.id].evo.name, '#e0a8ff', 3); }
    else if (c.kind === 'pas') {
      G.pas[c.id] = (G.pas[c.id] || 0) + 1;
      if (c.id === 'integrity') { G.p.maxhp += 20; G.p.hp = Math.min(G.p.maxhp, G.p.hp + 20); }
    } else if (c.kind === 'heal') G.p.hp = Math.min(G.p.maxhp, G.p.hp + 30);
    else if (c.kind === 'bytes') G.bonusBytes = (G.bonusBytes || 0) + 25;
    recalc(G);
    G.choices = null;
  };
  OW.reroll = function (G) {
    if (G.rerolls <= 0 || !G.choices) return false;
    G.rerolls--;
    G.choices = makeChoices(G);
    return true;
  };

  OW.runBytes = function (G) {
    const parts = [
      ['time survived', Math.floor(G.t / 6)],
      ['files deleted', Math.floor(G.kills / 4)],
      ['boss defeated', G.bossDead ? 150 : 0],
      ['reached uplink', G.over === 'win' ? 300 : 0],
      ['scavenged', G.bonusBytes || 0],
    ];
    return { parts, total: parts.reduce((a, b) => a + b[1], 0) };
  };

  // ------------------------------------------------------------------ main step
  OW.step = function (G, dt, inp) {
    if (G.over) { G.overT += dt; return; }
    if (G.choices) return;
    const p = G.p;
    G.t += dt;

    // Movement
    let dx = inp.dx || 0, dy = inp.dy || 0;
    const m = Math.hypot(dx, dy);
    if (m > 0) { dx /= m; dy /= m; }
    // The cursor (sent as an offset from the player) decides where everything points.
    if (inp.ox !== undefined) { p.cox = inp.ox; p.coy = inp.oy; }
    p.cx = p.x + p.cox; p.cy = p.y + p.coy;
    if (Math.hypot(p.cox, p.coy) > 4) p.aim = Math.atan2(p.coy, p.cox);
    p.fx = Math.cos(p.aim); p.fy = Math.sin(p.aim);
    p.face = Math.cos(p.aim) >= 0 ? 1 : -1;
    const spd = 150 * G.mod.spd;
    p.x += dx * spd * dt; p.y += dy * spd * dt;
    if (p.invuln > 0) p.invuln -= dt;
    if (p.dashCd > 0) p.dashCd -= dt;
    if (G.shake > 0) G.shake = Math.max(0, G.shake - 30 * dt);
    if (G.glitch > 0) G.glitch -= dt;

    // CTRL+Z: rewind position AND integrity to ~1s ago.
    p.histT -= dt;
    if (p.histT <= 0) {
      p.histT = 0.05;
      p.hist.push({ x: p.x, y: p.y, hp: p.hp });
      if (p.hist.length > 20) p.hist.shift();
    }
    if (inp.dash && p.dashCd <= 0 && p.hist.length) {
      const h = p.hist[0];
      G.fx.push({ k: 'ghost', t: 0, x0: p.x, y0: p.y, x1: h.x, y1: h.y });
      p.x = h.x; p.y = h.y;
      const healed = Math.max(0, h.hp - p.hp);
      p.hp = Math.max(p.hp, Math.min(p.maxhp, h.hp));
      p.invuln = Math.max(p.invuln, 0.7);
      p.dashCd = 14;
      p.hist.length = 0;
      G.shake = Math.max(G.shake, 4);
      snd(G, 'dash');
      msg(G, healed > 0 ? 'CTRL+Z  (+' + Math.round(healed) + ' integrity)' : 'CTRL+Z', '#8ab4ff', 1.4);
    }

    director(G, dt);
    buildGrid(G);
    updWeapons(G, dt);

    for (let i = 0; i < G.enemies.length; i++) {
      const e = G.enemies[i];
      if (!e.dead) updEnemy(G, e, dt);
    }

    // Soft separation so swarms read as individuals, not one blob.
    buildGrid(G);
    for (const e of G.enemies) {
      if (e.dead || e.boss || e.leader || (e.type === 'trojan' && !e.open)) continue;
      near(G, e.x, e.y, e.r * 2 + 4, (o) => {
        if (o.id <= e.id || o.leader || (o.type === 'trojan' && !o.open)) return;
        const ox = o.x - e.x, oy = o.y - e.y, d = Math.hypot(ox, oy) || 0.01;
        const min = (e.r + o.r) * 0.85;
        if (d < min) {
          const push = ((min - d) / min) * 60 * dt;
          e.x -= (ox / d) * push; e.y -= (oy / d) * push;
          o.x += (ox / d) * push; o.y += (oy / d) * push;
        }
      });
    }

    updFx(G, dt);

    // Contact damage
    const ds = dscale(G);
    near(G, p.x, p.y, PLAYER_R + 24, (e) => {
      if (e.type === 'trojan') return;
      if (Math.hypot(e.x - p.x, e.y - p.y) < e.r + PLAYER_R) hurtPlayer(G, e.def.dmg * ds);
    });
    const b = G.boss;
    if (b && !b.dead && !(b.intro > 0)) {
      if (Math.hypot(b.x - p.x, b.y - p.y) < b.r + PLAYER_R) hurtPlayer(G, (b.mode === 'charge' ? 26 : b.def.dmg) * ds);
    }

    compact(G.enemies);
    updPickups(G, dt);

    // Portal
    if (G.portal) {
      G.portal.t += dt;
      if (Math.hypot(G.portal.x - p.x, G.portal.y - p.y) < 36) {
        G.over = 'win'; G.overT = 0;
        msg(G, 'CONNECTION ESTABLISHED', '#8affb0', 4);
        snd(G, 'win');
      }
    }

    if (G.pending > 0 && !G.over) { G.pending--; G.choices = makeChoices(G); snd(G, 'levelup'); }
  };

  OW.hurtEnemyDebug = hurtEnemy;
})(typeof globalThis !== 'undefined' ? globalThis : this);
