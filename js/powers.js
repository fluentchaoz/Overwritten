// OVERWRITTEN - dash programs, special attacks, and the "sentient file" passives.
// Loaded after game.js. No DOM access. Everything here acts on the run state G through the
// helpers game.js exports as OW.core.
(function (g) {
  'use strict';
  const OW = g.OW;
  const C = OW.core;
  const { snd, msg, text, burstChars, hurtEnemy, killEnemy, mkEnemy, nearest, targetable, addXp, dropBit, compact, recalc, rr, pick, TAU } = C;
  const VW = OW.VW, VH = OW.VH;
  const P = (OW.powers = {});

  // ---------------------------------------------------------------- Registry Edit rules (boon + cost)
  const RULES = [
    { id: 'slow', text: 'ENEMIES -25% SPEED / YOUR SHOTS -35% SPEED', f: (m) => { m.espd *= 0.75; m.shotSpd *= 0.65; } },
    { id: 'xp2', text: 'XP x2 / ENEMY HP +40% (new spawns)', f: (m) => { m.xp *= 2; m.ehp *= 1.4; } },
    { id: 'vamp', text: 'HEAL 1 PER KILL / TAKE +30% DAMAGE', f: (m) => { m.killHeal += 1; m.takeDmg *= 1.3; } },
    { id: 'haste', text: 'WEAPONS +33% FASTER / TAKE +25% DAMAGE', f: (m) => { m.cdSpd *= 1.33; m.takeDmg *= 1.25; } },
    { id: 'magnet', text: 'PICKUP RADIUS x2 / MOVE SPEED -15%', f: (m) => { m.mag *= 2; m.spd *= 0.85; } },
    { id: 'wild', text: 'DAMAGE +35% / AIM JITTER', f: (m) => { m.dmg *= 1.35; m.jitter += 0.22; } },
  ];
  P.RULES = RULES;

  const AUTORUN_POOL = ['shadow', 'forkb', 'undelete', 'zombie', 'readonly', 'hidden', 'gc', 'compress', 'encrypt', 'decoy', 'overhead', 'bandwidth', 'cache', 'thru', 'integrity'];

  // ---------------------------------------------------------------- setup
  P.init = function (G, opts) {
    opts = opts || {};
    G.dashId = OW.DASHES[opts.dash] ? opts.dash : 'undo';
    G.specId = OW.SPECIALS[opts.special] ? opts.special : 'taskmgr';
    G.charge = 0;
    G.specRdy = false;
    G.pt = { gc: 40, comp: 22, zomb: 14, decoy: 18, link: 16 };
    G.orbit = 0;
    // Startup Entry: begin with free random passives.
    for (let i = 0; i < (G.meta.autorun || 0); i++) {
      const free = AUTORUN_POOL.filter((id) => !G.pas[id]);
      if (!free.length) break;
      const id = pick(free);
      G.pas[id] = 1;
      if (id === 'integrity') { G.p.maxhp += 20; G.p.hp += 20; }
      P.onPassive(G, id);
    }
    recalc(G);
  };

  P.onPassive = function (G, id) {
    if (id === 'registry') rollRule(G);
    if (id === 'leak' && !G.leakStart) G.leakStart = G.t || 0.001;
  };

  function rollRule(G) {
    const free = RULES.filter((r) => !G.rules.some((x) => x.id === r.id));
    if (!free.length) return;
    const r = pick(free);
    G.rules.push(r);
    msg(G, 'REGISTRY EDIT: ' + r.text, '#ff8a3d', 4);
    snd(G, 'rule');
  }

  // ---------------------------------------------------------------- damage / events
  P.filterDamage = function (G, dmg) {
    const lv = G.pas.readonly || 0;
    if (lv) dmg = Math.min(dmg, G.p.maxhp * [0, 0.08, 0.06, 0.045][lv]);
    return dmg * G.mx.takeDmg;
  };

  const chargeMul = (G) => 1 + 0.08 * G.meta.spchg;
  P.onBit = function (G, v) {
    G.charge = Math.min(100, G.charge + 0.35 * v * chargeMul(G));
  };
  P.onKill = function (G, e) {
    G.charge = Math.min(100, G.charge + (e.elite ? 3 : 0.2) * chargeMul(G));
    if (G.mx.killHeal) G.p.hp = Math.min(G.p.maxhp, G.p.hp + G.mx.killHeal);
    const ul = G.pas.undelete || 0;
    if (ul && !e.boss && Math.random() < [0, 0.04, 0.07, 0.10][ul]) addAlly(G, e, 5 + ul, 8 + ul * 4);
  };

  // ---------------------------------------------------------------- per-frame (before movement)
  P.pre = function (G, dt, inp) {
    const p = G.p, mx = G.mx;
    if (G.freeze > 0) G.freeze -= dt;
    if (G.safeT > 0) G.safeT -= dt;
    if (G.sudoT > 0) G.sudoT -= dt;
    if (p.phase > 0) p.phase -= dt;

    // Hidden: stand still long enough and enemies lose you.
    const moving = Math.hypot(inp.dx || 0, inp.dy || 0) > 0.1;
    G.stillT = moving ? 0 : G.stillT + dt;
    const hl = G.pas.hidden || 0;
    const need = hl ? [0, 2.0, 1.4, 0.9][hl] : 1e9;
    const was = G.hidden;
    G.hidden = hl > 0 && G.stillT >= need && !(p.phase > 0);
    if (G.hidden && !was) { msg(G, 'HIDDEN', '#7f98a5', 1.2); snd(G, 'hide'); }

    // Special charge: time trickle (bits and kills add more elsewhere).
    const spec = OW.SPECIALS[G.specId];
    G.charge = Math.min(100, G.charge + 0.6 * chargeMul(G) * dt);
    const rdy = G.charge >= spec.need;
    if (rdy && !G.specRdy) { G.specRdy = true; msg(G, 'SPECIAL READY: ' + spec.name, spec.col, 1.6); snd(G, 'ready'); }
    if (!rdy) G.specRdy = false;

    // Multipliers from rules, Memory Leak, sudo, Safe Mode.
    mx.dmg = 1; mx.cdSpd = 1; mx.espd = 1; mx.shotSpd = 1; mx.xp = 1; mx.killHeal = 0; mx.takeDmg = 1;
    mx.jitter = 0; mx.mag = 1; mx.spd = 1; mx.ehp = 1;
    for (const r of G.rules) r.f(mx);
    const ll = G.pas.leak || 0;
    if (ll) {
      const mins = Math.max(0, (G.t - G.leakStart) / 60);
      mx.dmg *= 1 + Math.min([0, 0.5, 0.8, 1.2][ll], mins * [0, 0.10, 0.16, 0.22][ll]);
      G.leakVis = Math.min(1, mins / 3) * (0.35 + 0.25 * ll);
    } else G.leakVis = 0;
    if (G.sudoT > 0) { mx.dmg *= 2; mx.cdSpd *= 1.7; }
    if (G.safeT > 0) mx.spd *= 1.25;
    p.spdMul = p.phase > 0 ? 2.2 : 1;
    G.mod.dmg = G.mod.dmgBase * mx.dmg;

    // Dash anchors expire.
    if (p.anchor && (p.anchor.t -= dt) <= 0) { p.anchor = null; p.dashCd = Math.max(p.dashCd, dashCd(G, 4)); }
    if (p.savept && (p.savept.t -= dt) <= 0) { p.savept = null; p.dashCd = Math.max(p.dashCd, dashCd(G, 4)); }

    if (inp.dash) dash(G, inp);
    if (inp.special) special(G);
  };

  // ---------------------------------------------------------------- dash programs
  const dashCd = (G, base) => base * (1 - 0.06 * G.meta.dashcd);
  const histAt = (G, sec) => {
    const h = G.p.hist;
    if (!h.length) return null;
    return h[Math.max(0, h.length - 1 - Math.round(sec / 0.05))];
  };
  P.histAt = histAt;

  function moveDir(G, inp, fallbackBack) {
    const p = G.p;
    let ax = inp.dx || 0, ay = inp.dy || 0;
    const m = Math.hypot(ax, ay);
    if (m < 0.1) { const s = fallbackBack ? -1 : 1; return [Math.cos(p.aim) * s, Math.sin(p.aim) * s]; }
    return [ax / m, ay / m];
  }
  function ghost(G, x0, y0, x1, y1, ch, col) {
    G.fx.push({ k: 'ghost', t: 0, x0, y0, x1, y1, ch, col });
  }

  function dash(G, inp) {
    const p = G.p;
    const ready = p.dashCd <= 0;
    switch (G.dashId) {
      case 'undo': {
        if (!ready) return;
        const h = histAt(G, 1.0);
        if (!h) return;
        ghost(G, p.x, p.y, h.x, h.y);
        p.x = h.x; p.y = h.y;
        const healed = Math.max(0, h.hp - p.hp);
        p.hp = Math.max(p.hp, Math.min(p.maxhp, h.hp));
        p.invuln = Math.max(p.invuln, 0.7);
        p.dashCd = dashCd(G, 14);
        p.hist.length = 0;
        G.shake = Math.max(G.shake, 4);
        snd(G, 'dash');
        msg(G, healed > 0 ? 'CTRL+Z  (+' + Math.round(healed) + ' integrity)' : 'CTRL+Z', '#8ab4ff', 1.4);
        break;
      }
      case 'copy': {
        if (!ready) return;
        if (!p.anchor) {
          p.anchor = { x: p.x, y: p.y, t: 12 };
          p.dashCd = 0.35;
          snd(G, 'anchor');
          msg(G, 'CTRL+C  anchor set. press again to paste', '#8affb0', 1.6);
        } else {
          ghost(G, p.x, p.y, p.anchor.x, p.anchor.y, 'V', '#8affb0');
          p.x = p.anchor.x; p.y = p.anchor.y;
          p.anchor = null;
          p.invuln = Math.max(p.invuln, 0.5);
          p.dashCd = dashCd(G, 8);
          G.shake = Math.max(G.shake, 4);
          snd(G, 'dash');
          msg(G, 'CTRL+V', '#8affb0', 1);
        }
        break;
      }
      case 'save': {
        if (!ready) return;
        if (!p.savept) {
          p.savept = { x: p.x, y: p.y, hp: p.hp, t: 10 };
          p.dashCd = 0.35;
          snd(G, 'savept');
          msg(G, 'CTRL+S  saved. press again to reload', '#ffe08a', 1.6);
        } else {
          const s = p.savept;
          ghost(G, p.x, p.y, s.x, s.y, 'S', '#ffe08a');
          p.x = s.x; p.y = s.y;
          const healed = Math.max(0, s.hp - p.hp);
          p.hp = Math.max(p.hp, Math.min(p.maxhp, s.hp));
          p.savept = null;
          p.invuln = Math.max(p.invuln, 0.6);
          p.dashCd = dashCd(G, 10);
          G.shake = Math.max(G.shake, 4);
          snd(G, 'dash');
          msg(G, healed > 0 ? 'LOADED SAVE  (+' + Math.round(healed) + ' integrity)' : 'LOADED SAVE', '#ffe08a', 1.4);
        }
        break;
      }
      case 'del': {
        if (!ready) return;
        const [ax, ay] = moveDir(G, inp, false);
        const dist = 170, steps = 17, hit = new Set();
        let deleted = 0;
        for (let i = 1; i <= steps; i++) {
          const px = p.x + ax * (dist / steps) * i, py = p.y + ay * (dist / steps) * i;
          for (const e of G.enemies) {
            if (e.dead || hit.has(e.id)) continue;
            if (Math.hypot(e.x - px, e.y - py) < e.r + 16) {
              hit.add(e.id);
              if (!e.boss && !e.elite && e.hp <= 50) { killEnemy(G, e); deleted++; }
              else hurtEnemy(G, e, 22 * G.mod.dmg, Math.atan2(ay, ax), 220);
            }
          }
        }
        ghost(G, p.x, p.y, p.x + ax * dist, p.y + ay * dist, 'D', '#ff6b6b');
        p.x += ax * dist; p.y += ay * dist;
        p.invuln = Math.max(p.invuln, 0.4);
        p.dashCd = dashCd(G, 7);
        G.shake = Math.max(G.shake, 5);
        snd(G, 'delmove');
        msg(G, 'SHIFT+DEL' + (deleted ? '  (' + deleted + ' deleted)' : ''), '#ff6b6b', 1.2);
        break;
      }
      case 'alt': {
        if (!ready) return;
        p.phase = 0.7;
        p.invuln = Math.max(p.invuln, 0.8);
        p.dashCd = dashCd(G, 9);
        snd(G, 'altab');
        msg(G, 'ALT+TAB', '#c792ea', 1);
        break;
      }
      case 'refresh': {
        if (!ready) return;
        const [ax, ay] = moveDir(G, inp, true);
        ghost(G, p.x, p.y, p.x + ax * 120, p.y + ay * 120, 'F', '#5ee1ff');
        p.x += ax * 120; p.y += ay * 120;
        G.fx.push({ k: 'ping', x: p.x, y: p.y, t: 0, dur: 0.45, R: 170, hit: new Set(), dmg: 8 * G.mod.dmg, col: '#5ee1ff' });
        for (const s of G.eshots) if (Math.hypot(s.x - p.x, s.y - p.y) < 170) s.dead = true;
        p.invuln = Math.max(p.invuln, 0.35);
        p.dashCd = dashCd(G, 8);
        G.shake = Math.max(G.shake, 6);
        snd(G, 'refresh');
        msg(G, 'F5', '#5ee1ff', 1);
        break;
      }
    }
  }

  // For the HUD.
  P.dashStatus = function (G) {
    const d = OW.DASHES[G.dashId], p = G.p;
    if (G.dashId === 'copy' && p.anchor) return { name: d.short, text: 'PASTE ' + Math.ceil(p.anchor.t) + 's', ready: true, col: d.col };
    if (G.dashId === 'save' && p.savept) return { name: d.short, text: 'LOAD ' + Math.ceil(p.savept.t) + 's', ready: true, col: d.col };
    if (p.dashCd > 0) return { name: d.short, text: Math.ceil(p.dashCd) + 's', ready: false, frac: 1 - p.dashCd / dashCd(G, d.cd), col: '#5f7a88' };
    return { name: d.short, text: 'READY', ready: true, col: d.col };
  };
  P.specialStatus = function (G) {
    const s = OW.SPECIALS[G.specId];
    return { name: s.short, need: s.need, charge: G.charge, ready: G.charge >= s.need, col: s.col };
  };

  // ---------------------------------------------------------------- special attacks
  function inView(G, e, pad) {
    return Math.abs(e.x - G.p.x) < VW / 2 + (pad || 40) && Math.abs(e.y - G.p.y) < VH / 2 + (pad || 40);
  }

  const SPEC = {
    taskmgr(G) {
      G.freeze = 3;
      G.fx.push({ k: 'flash', t: 0, dur: 0.3, col: '#8ab4ff' });
      snd(G, 'taskmgr');
      msg(G, 'TASK MANAGER: ALL PROCESSES SUSPENDED', '#8ab4ff', 2.4);
    },
    kill9(G) {
      const p = G.p;
      let best = null, bd = 1e9;
      for (const e of G.enemies) {
        if (!targetable(e)) continue;
        const d = Math.hypot(e.x - p.cx, e.y - p.cy);
        if (d < bd) { bd = d; best = e; }
      }
      if (!best || Math.hypot(best.x - p.x, best.y - p.y) > 900) { msg(G, 'kill -9: NO PROCESS FOUND', '#7f98a5', 1); return false; }
      G.fx.push({ k: 'beam', t: 0, dur: 0.35, x0: p.x, y0: p.y, x1: best.x, y1: best.y, ch: '9', col: '#ff6b6b' });
      snd(G, 'kill9');
      if (best.boss) hurtEnemy(G, best, best.maxhp * 0.12, 0, 0);
      else killEnemy(G, best);
      text(G, best.x, best.y - best.r - 8, 'kill -9', '#ff6b6b');
      G.shake = Math.max(G.shake, 5);
    },
    sudo(G) {
      G.sudoT = 6;
      G.fx.push({ k: 'flash', t: 0, dur: 0.25, col: '#ffe08a' });
      snd(G, 'sudo');
      msg(G, 'sudo !!  ROOT ACCESS: DAMAGE x2 FOR 6s', '#ffe08a', 2.4);
    },
    bsod(G) {
      let n = 0;
      for (const e of G.enemies) if (!e.dead && !e.boss && inView(G, e, 60)) { e.stun = 2.2; n++; }
      G.fx.push({ k: 'bsod', t: 0, dur: 1.3 });
      snd(G, 'bsod');
      msg(G, 'A PROBLEM HAS BEEN DETECTED: ' + n + ' PROCESSES STUNNED', '#5ee1ff', 2.4);
    },
    safe(G) {
      G.safeT = 6;
      G.eshots.length = 0;
      snd(G, 'safe');
      msg(G, 'SAFE MODE: ENEMY ABILITIES DISABLED', '#6dff9c', 2.4);
    },
    forkproc(G) {
      if (G.clones.filter((c) => c.mode === 'orbit').length >= 2) return false;
      G.clones.push({ mode: 'orbit', ang: rr(0, TAU), t: 10, dmg: 0.9, x: G.p.x, y: G.p.y });
      snd(G, 'forkcast');
      msg(G, 'fork(): PROCESS SPAWNED', '#ff9ae6', 2);
    },
    format(G) {
      const p = G.p;
      let n = 0, xp = 0;
      for (const e of G.enemies) {
        if (e.dead || !inView(G, e)) continue;
        if (e.boss) { hurtEnemy(G, e, e.maxhp * 0.06, 0, 0); continue; }
        if (e.elite) { hurtEnemy(G, e, e.maxhp * 0.5, 0, 0); continue; }
        xp += e.def.xp * 0.5;
        killEnemy(G, e, true);
        n++;
      }
      G.eshots.length = 0;
      for (const b of G.bits) if (b.kind === 'xp' && inView(G, b)) b.dead = true; // the cost
      compact(G.bits);
      if (xp > 0) addXp(G, xp);
      G.fx.push({ k: 'wipe', t: 0, dur: 0.9 });
      G.shake = 14;
      snd(G, 'format');
      msg(G, 'FORMAT C:  ' + n + ' FILES REMOVED', '#ff8a3d', 2.6);
    },
  };

  function special(G) {
    const sp = OW.SPECIALS[G.specId];
    if (G.charge < sp.need) { snd(G, 'uino'); return; }
    if (SPEC[G.specId](G) === false) return;
    G.charge = Math.max(0, G.charge - sp.need);
    G.specRdy = G.charge >= sp.need;
  }

  // ---------------------------------------------------------------- allies (Undelete / Zombie Process)
  function addAlly(G, e, life, dmg) {
    if (G.allies.length >= 12) return;
    G.allies.push({ x: e.x, y: e.y, rows: e.def.art(e).slice(), col: e.def.col, t: life, life, dmg, tick: 0, r: e.r || 10 });
    snd(G, 'ally', e.x, e.y);
  }

  function updAllies(G, dt) {
    for (const a of G.allies) {
      a.t -= dt;
      if (a.t <= 0) { a.dead = true; burstChars(G, a.x, a.y, a.rows, '#8affb0', 4); continue; }
      let best = null, bd = 520 * 520;
      for (const e of G.enemies) {
        if (!targetable(e)) continue;
        const d2 = (e.x - a.x) ** 2 + (e.y - a.y) ** 2;
        if (d2 < bd) { bd = d2; best = e; }
      }
      if (best) {
        const d = Math.sqrt(bd) || 1;
        a.x += ((best.x - a.x) / d) * 135 * dt; a.y += ((best.y - a.y) / d) * 135 * dt;
        a.tick -= dt;
        if (d < a.r + best.r + 6 && a.tick <= 0) {
          a.tick = 0.35;
          hurtEnemy(G, best, a.dmg * G.mod.dmg, Math.atan2(best.y - a.y, best.x - a.x), 140);
        }
      } else { // nothing to fight: drift back toward you
        const dx = G.p.x - a.x, dy = G.p.y - a.y, d = Math.hypot(dx, dy) || 1;
        if (d > 70) { a.x += (dx / d) * 110 * dt; a.y += (dy / d) * 110 * dt; }
      }
    }
    compact(G.allies);
  }

  // ---------------------------------------------------------------- the rest of the passives (after the world moves)
  P.post = function (G, dt) {
    const p = G.p;

    // Clones: Shadow Copy trails you; fork() orbits you.
    const sl = G.pas.shadow || 0;
    const wantDelay = sl >= 3 ? 2 : sl >= 1 ? 1 : 0;
    let delayed = G.clones.filter((c) => c.mode === 'delay').length;
    while (delayed < wantDelay) { G.clones.push({ mode: 'delay', delay: delayed ? 2.0 : 1.0, dmg: 0.5, x: p.x, y: p.y }); delayed++; }
    for (const c of G.clones) {
      if (c.mode === 'delay') {
        c.dmg = [0, 0.5, 0.7, 0.9][sl];
        const h = histAt(G, c.delay);
        c.x = h ? h.x : p.x; c.y = h ? h.y : p.y;
      } else {
        c.ang += 1.4 * dt; c.t -= dt;
        c.x = p.x + Math.cos(c.ang) * 64; c.y = p.y + Math.sin(c.ang) * 64 * 0.8;
        if (c.t <= 0) c.dead = true;
      }
    }
    compact(G.clones);

    updAllies(G, dt);

    // Encryption: orbiting cipher ring.
    const el = G.pas.encrypt || 0;
    G.orbitPts.length = 0;
    if (el) {
      const n = [0, 4, 6, 8][el];
      G.orbit += 2.2 * dt;
      const glyphs = '#%$&@*';
      for (let i = 0; i < n; i++) {
        const a = G.orbit + (i * TAU) / n;
        G.orbitPts.push({ x: p.x + Math.cos(a) * 46, y: p.y + Math.sin(a) * 46 * 0.8, ch: glyphs[(i + Math.floor(G.t * 7)) % glyphs.length] });
      }
      for (const s of G.eshots) {
        for (const o of G.orbitPts) {
          if (Math.hypot(s.x - o.x, s.y - o.y) < 16) { s.dead = true; snd(G, 'shield', o.x, o.y); burstChars(G, s.x, s.y, [s.ch], '#5ee1ff', 3); break; }
        }
      }
      for (const e of G.enemies) {
        if (e.dead || (e.encT || 0) > G.t) continue;
        for (const o of G.orbitPts) {
          if (Math.hypot(e.x - o.x, e.y - o.y) < e.r + 9) {
            e.encT = G.t + 0.5;
            hurtEnemy(G, e, 7 * (1 + 0.25 * (el - 1)) * G.mod.dmg, Math.atan2(e.y - p.y, e.x - p.x), 170);
            break;
          }
        }
      }
    }

    // Symlink: shortcut pair between you and your cursor.
    const sy = G.pas.symlink || 0;
    if (sy) {
      G.pt.link -= dt;
      if (G.pt.link <= 0) {
        G.pt.link = [0, 16, 12, 9][sy];
        let bx = p.cx, by = p.cy;
        const d = Math.hypot(bx - p.x, by - p.y);
        if (d < 120) { bx = p.x + Math.cos(p.aim) * 260; by = p.y + Math.sin(p.aim) * 260; }
        else if (d > 380) { bx = p.x + ((bx - p.x) / d) * 380; by = p.y + ((by - p.y) / d) * 380; }
        G.links = [{ a: { x: p.x, y: p.y }, b: { x: bx, y: by }, t: 12 }];
        p.lk = 1.2; // don't instantly re-trigger
        snd(G, 'link');
        msg(G, 'SYMLINK CREATED', '#ffb454', 1.4);
      }
    }
    p.lk = (p.lk || 0) - dt;
    for (const l of G.links) {
      l.t -= dt;
      if (l.t <= 0) { l.dead = true; continue; }
      if (p.lk <= 0) {
        const da = Math.hypot(p.x - l.a.x, p.y - l.a.y), db = Math.hypot(p.x - l.b.x, p.y - l.b.y);
        if (da < 18 || db < 18) {
          const to = da < 18 ? l.b : l.a;
          ghost(G, p.x, p.y, to.x, to.y, '@', '#ffb454');
          p.x = to.x; p.y = to.y; p.lk = 1.2; p.invuln = Math.max(p.invuln, 0.3);
          snd(G, 'link');
        }
      }
      for (const e of G.enemies) {
        if (e.dead || e.boss) continue;
        e.lk = (e.lk || 0) - dt;
        if (e.lk > 0) continue;
        if (Math.hypot(e.x - l.a.x, e.y - l.a.y) < 18) { e.x = l.b.x + rr(-8, 8); e.y = l.b.y + rr(-8, 8); e.lk = 1.5; }
        else if (Math.hypot(e.x - l.b.x, e.y - l.b.y) < 18) { e.x = l.a.x + rr(-8, 8); e.y = l.a.y + rr(-8, 8); e.lk = 1.5; }
      }
    }
    compact(G.links);

    // Spoofed IP: a decoy that enemies chase.
    const dl = G.pas.decoy || 0;
    if (dl) {
      G.pt.decoy -= dt;
      if (G.pt.decoy <= 0) {
        G.pt.decoy = [0, 18, 14, 10][dl];
        G.decoy = { x: p.x, y: p.y, t: [0, 4, 5, 6][dl], max: [0, 4, 5, 6][dl], boom: dl >= 3 };
        snd(G, 'decoy');
        msg(G, 'DECOY DEPLOYED', '#ffd24a', 1.2);
      }
    }
    if (G.decoy) {
      G.decoy.t -= dt;
      if (G.decoy.t <= 0) {
        if (G.decoy.boom) G.fx.push({ k: 'blast', x: G.decoy.x, y: G.decoy.y, t: 0, delay: 0.05, R: 95, dmg: 30 * G.mod.dmg, done: false });
        G.decoy = null;
      }
    }

    // Garbage Collection: stop the world, then sweep the oldest processes.
    const gl = G.pas.gc || 0;
    if (gl) {
      G.pt.gc -= dt;
      if (G.pt.gc <= 0) {
        G.pt.gc = [0, 40, 32, 25][gl];
        G.freeze = Math.max(G.freeze, 0.35);
        snd(G, 'gc');
        msg(G, 'GARBAGE COLLECTION', '#c3ff8a', 1.2);
        G.timers.push({ t: 0.35, fn: () => gcSweep(G) });
      }
    }

    // Compression: zip a dense crowd into one fat archive.
    const cl = G.pas.compress || 0;
    if (cl) {
      G.pt.comp -= dt;
      if (G.pt.comp <= 0) G.pt.comp = compressNow(G, cl) ? [0, 22, 18, 14][cl] : 4;
    }

    // Zombie Process: infect the nearest enemy.
    const zl = G.pas.zombie || 0;
    if (zl) {
      G.pt.zomb -= dt;
      if (G.pt.zomb <= 0) {
        const cands = nearest(G, p.x, p.y, 8, 420).filter((e) => !e.boss && !e.elite);
        if (cands.length) {
          const e = cands[0];
          e.dead = true;
          text(G, e.x, e.y - e.r, 'ZOMBIE', '#6dff9c');
          addAlly(G, e, 8, 10 + zl * 3);
          G.pt.zomb = [0, 14, 10, 7][zl];
        } else G.pt.zomb = 2;
      }
    }

    // Port Scan: defuse trojans (lv2+), vacuum chests (lv3).
    const pl = G.pas.scan || 0;
    if (pl >= 2) {
      const R = pl >= 3 ? 420 : 240;
      for (const e of G.enemies) {
        if (e.dead || e.type !== 'trojan' || e.open) continue;
        if (Math.hypot(e.x - p.x, e.y - p.y) < R) {
          killEnemy(G, e, true);
          dropBit(G, e.x, e.y, 3);
          text(G, e.x, e.y - e.r, 'DEFUSED', '#ff79c6');
          snd(G, 'scan', e.x, e.y);
        }
      }
    }
    if (pl >= 3) {
      for (const b of G.bits) {
        if (b.kind !== 'chest') continue;
        const dx = p.x - b.x, dy = p.y - b.y, d = Math.hypot(dx, dy) || 1;
        if (d < 380) { b.x += (dx / d) * 200 * dt; b.y += (dy / d) * 200 * dt; }
      }
    }
  };

  function gcSweep(G) {
    const gl = G.pas.gc || 1;
    const list = G.enemies.filter((e) => !e.dead && !e.boss && !e.elite).sort((a, b) => a.id - b.id);
    const n = Math.floor(list.length * [0, 0.25, 0.35, 0.5][gl]);
    for (let i = 0; i < n; i++) killEnemy(G, list[i]);
    G.shake = Math.max(G.shake, 5);
    if (n) msg(G, n + ' PROCESSES COLLECTED', '#c3ff8a', 1.6);
  }

  function compressNow(G, lv) {
    const p = G.p;
    const cands = G.enemies.filter((e) => !e.dead && !e.boss && !e.elite && e.type !== 'worm' && e.type !== 'trojan' && e.type !== 'archive'
      && Math.hypot(e.x - p.x, e.y - p.y) < 600);
    if (cands.length < 6) return false;
    let best = null, bn = 0;
    const samples = cands.length > 60 ? cands.filter(() => Math.random() < 60 / cands.length) : cands;
    for (const c of samples) {
      let n = 0;
      for (const o of cands) if (Math.hypot(o.x - c.x, o.y - c.y) < 100) n++;
      if (n > bn) { bn = n; best = c; }
    }
    if (!best || bn < 5) return false;
    const group = cands.filter((o) => Math.hypot(o.x - best.x, o.y - best.y) < 100)
      .sort((a, b) => Math.hypot(a.x - best.x, a.y - best.y) - Math.hypot(b.x - best.x, b.y - best.y))
      .slice(0, [0, 8, 12, 16][lv]);
    let xp = 0, cx = 0, cy = 0;
    for (const o of group) { xp += o.def.xp; cx += o.x; cy += o.y; killEnemy(G, o, true); }
    cx /= group.length; cy /= group.length;
    const a = mkEnemy(G, 'archive', cx, cy, { hpMul: 1 + group.length * 0.18 });
    a.xpOverride = Math.max(3, Math.ceil(xp * 1.8));
    burstChars(G, cx, cy, ['{Z}'], '#e0a8ff', 12);
    snd(G, 'compress', cx, cy);
    msg(G, 'COMPRESSED ' + group.length + ' FILES', '#e0a8ff', 1.4);
    return true;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
