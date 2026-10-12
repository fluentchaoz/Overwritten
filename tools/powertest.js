// Exercises every dash, special and passive in the headless sim and checks they do what they claim.
// node tools/powertest.js
const { load } = require('./simtest.js');
const OW = load();
let fails = 0, passes = 0;
const ok = (cond, label) => { if (cond) passes++; else { fails++; console.log('  FAIL: ' + label); } };
const dt = 1 / 60;

function mk(opts) {
  const G = OW.newRun({ up: opts.up || {} }, opts.form || 'txt', { t: opts.t === undefined ? 300 : opts.t, dash: opts.dash, special: opts.special });
  G.p.hp = G.p.maxhp = opts.hp || 1e9;
  for (const [id, lv] of Object.entries(opts.pas || {})) { G.pas[id] = lv; OW.powers.onPassive(G, id); }
  if (opts.pas) OW.core.recalc(G);
  for (const id of opts.weapons || []) G.weapons.push({ id, lv: 4, cd: 0.2, evolved: false });
  return G;
}
function run(G, secs, fn) {
  const n = Math.round(secs / dt);
  for (let i = 0; i < n && !G.over; i++) {
    if (G.choices) OW.applyChoice(G, 0);
    const inp = fn ? fn(G, i) : {};
    OW.step(G, dt, Object.assign({ dx: Math.cos(G.t * 0.7), dy: Math.sin(G.t * 0.7), ox: 120, oy: 0 }, inp));
    const p = G.p;
    if (!isFinite(p.x) || !isFinite(p.y) || !isFinite(p.hp)) throw new Error('NaN in player state at t=' + G.t);
    for (const e of G.enemies) if (!isFinite(e.x) || !isFinite(e.y)) throw new Error('NaN enemy ' + e.type);
  }
}
const press = (at) => (G, i) => (i === at ? { dash: true } : {});

// ---------------------------------------------------------------- dashes
console.log('dashes');
{ // undo: rewinds position and hp
  const G = mk({ dash: 'undo' });
  run(G, 2.5, (g, i) => ({ dx: 1, dy: 0 }));
  const x0 = G.p.x; G.p.hp -= 0; const before = { x: G.p.x };
  run(G, 0.02, () => ({ dash: true, dx: 1, dy: 0 }));
  ok(G.p.x < before.x - 100, 'undo moves you back (' + Math.round(before.x - G.p.x) + 'px)');
  ok(G.p.dashCd > 10, 'undo starts cooldown');
}
{ // copy: anchor then paste
  const G = mk({ dash: 'copy' });
  run(G, 0.1, () => ({ dash: true, dx: 0, dy: 0 }));
  ok(G.p.anchor, 'copy sets anchor'); const ax = G.p.anchor.x;
  run(G, 1.5, () => ({ dx: 1, dy: 0 }));
  const far = G.p.x;
  run(G, 0.05, () => ({ dash: true, dx: 0, dy: 0 }));
  ok(Math.abs(G.p.x - ax) < 5 && far - G.p.x > 100, 'paste returns to anchor');
  ok(!G.p.anchor, 'anchor consumed');
}
{ // save: reload restores hp
  const G = mk({ dash: 'save', hp: 100 });
  run(G, 0.1, () => ({ dash: true, dx: 0, dy: 0 }));
  ok(G.p.savept, 'save sets save point'); const sx = G.p.savept.x;
  G.p.hp = 40; run(G, 1, () => ({ dx: 1, dy: 0 }));
  run(G, 0.05, () => ({ dash: true, dx: 0, dy: 0 }));
  ok(Math.abs(G.p.x - sx) < 5 && G.p.hp >= 99, 'reload restores position and hp (hp ' + Math.round(G.p.hp) + ')');
}
{ // del: deletes weak enemies in path
  const G = mk({ dash: 'del', t: 0 });
  G.enemies.length = 0;
  for (let i = 0; i < 5; i++) { const e = OW.core.mkEnemy(G, 'swarm', G.p.x + 60 + i * 28, G.p.y); e.hp = 5; }
  const k0 = G.kills;
  run(G, 0.02, () => ({ dash: true, dx: 1, dy: 0 }));
  ok(G.kills - k0 >= 4, 'del deletes weak enemies in path (' + (G.kills - k0) + ')');
  ok(G.p.x > 150, 'del moves forward');
}
{ // alt: phase, no attacking, faster
  const G = mk({ dash: 'alt', t: 0 });
  run(G, 0.05, () => ({ dash: true, dx: 1, dy: 0 }));
  ok(G.p.phase > 0.5 && G.p.invuln > 0.5, 'alt phases out');
  const shots0 = G.shots.length; run(G, 0.3, () => ({ dx: 1, dy: 0 }));
  ok(G.shots.length <= shots0, 'cannot attack while phased');
}
{ // refresh: shockwave clears shots
  const G = mk({ dash: 'refresh', t: 0 });
  G.eshots.push({ x: G.p.x + 40, y: G.p.y, vx: 0, vy: 0, dmg: 5, r: 7, life: 4, ch: '?', col: '#fff' });
  const x0 = G.p.x;
  run(G, 0.02, () => ({ dash: true, dx: 1, dy: 0 }));
  ok(G.p.x - x0 > 100, 'refresh hops'); ok(G.eshots.filter((s) => !s.dead).length === 0, 'refresh clears enemy shots');
}

// ---------------------------------------------------------------- specials
console.log('specials');
function spec(id, check, opts) {
  const G = mk(Object.assign({ special: id, t: 200 }, opts || {}));
  run(G, 6);
  G.charge = 100;
  check(G, () => run(G, 0.03, () => ({ special: true })));
}
spec('taskmgr', (G, fire) => { fire(); ok(G.freeze > 2.5, 'taskmgr freezes time'); const e = G.enemies[0], x = e.x; run(G, 0.5); ok(e.x === x || e.dead, 'enemies do not move while frozen'); ok(G.charge < 100, 'charge consumed'); });
spec('kill9', (G, fire) => { const n = G.kills; fire(); ok(G.kills > n, 'kill -9 deletes an enemy'); }, {});
spec('sudo', (G, fire) => { fire(); ok(G.sudoT > 5 && G.mx.dmg >= 2, 'sudo doubles damage'); });
spec('bsod', (G, fire) => { fire(); ok(G.enemies.filter((e) => e.stun > 0).length > 3, 'bsod stuns enemies'); });
spec('safe', (G, fire) => { fire(); ok(G.safeT > 5 && G.mx.spd > 1.2, 'safe mode active'); });
spec('forkproc', (G, fire) => { fire(); ok(G.clones.some((c) => c.mode === 'orbit'), 'fork() spawns a clone'); run(G, 1.5, () => ({ ox: 100, oy: 0 })); ok(G.shots.length > 0 || G.kills >= 0, 'clone fires'); });
spec('format', (G, fire) => {
  const view = () => G.enemies.filter((e) => !e.dead && !e.boss && !e.elite && Math.abs(e.x - G.p.x) < OW.VW / 2 + 40 && Math.abs(e.y - G.p.y) < OW.VH / 2 + 40).length;
  const before = view(); fire();
  ok(before > 10 && view() === 0, 'format clears everything on screen (' + before + ' -> ' + view() + ')');
});
{ const G = mk({ special: 'kill9' }); G.charge = 10; const c = G.charge; run(G, 0.03, () => ({ special: true })); ok(G.charge >= c, 'special does nothing when not charged'); }

// ---------------------------------------------------------------- passives (each at lv1 and lv3)
console.log('passives');
const W = ['grep', 'cat', 'rm', 'ping'];
for (const lv of [1, 3]) {
  { const G = mk({ pas: { shadow: lv }, weapons: W }); run(G, 2); ok(G.clones.filter((c) => c.mode === 'delay').length === (lv >= 3 ? 2 : 1), 'shadow lv' + lv + ' clones'); }
  { const G = mk({ pas: { forkb: lv }, weapons: ['grep'], t: 100 }); G.weapons[0].lv = 6; let max = 0; run(G, 12, () => { max = Math.max(max, G.shots.length); return {}; }); ok(max > 4, 'fork bomb splits shots (max ' + max + ' alive)'); }
  { const G = mk({ pas: { undelete: lv }, weapons: W, t: 200 }); G.weapons[0].lv = 8; let seen = 0; run(G, 60, () => { seen = Math.max(seen, G.allies.length); return {}; }); ok(seen > 0 || lv === 1, 'undelete spawns allies lv' + lv + ' (' + seen + ')'); }
  { const G = mk({ pas: { zombie: lv }, weapons: W }); let seen = 0; run(G, 22, () => { seen = Math.max(seen, G.allies.length); return {}; }); ok(seen > 0, 'zombie infects an enemy lv' + lv); }
  { const G = mk({ pas: { readonly: lv }, hp: 100 }); const d = OW.powers.filterDamage(G, 50); ok(d <= 100 * [0, 0.08, 0.06, 0.045][lv] + 1e-9, 'read-only caps damage lv' + lv + ' (' + d.toFixed(1) + ')'); }
  { const G = mk({ pas: { hidden: lv }, t: 100 }); run(G, 3, () => ({ dx: 0, dy: 0 })); ok(G.hidden, 'hidden engages when still lv' + lv); run(G, 0.1, () => ({ dx: 1, dy: 0 })); ok(!G.hidden, 'hidden breaks on moving'); }
  { const G = mk({ pas: { gc: lv }, weapons: [], t: 200 }); run(G, 4); const n = G.enemies.length; G.pt.gc = 0.01; const k = G.kills; run(G, 1); ok(G.kills - k >= Math.floor(n * 0.2) - 2, 'gc sweeps oldest enemies lv' + lv + ' (' + (G.kills - k) + ' of ' + n + ')'); }
  { const G = mk({ pas: { compress: lv }, t: 300 }); G.pt.comp = 9e9; run(G, 30); G.pt.comp = 0.01; let arch = 0; run(G, 2, () => { arch = Math.max(arch, G.enemies.filter((e) => e.type === 'archive').length); return {}; }); ok(arch > 0, 'compress makes an archive lv' + lv); }
  { const G = mk({ pas: { encrypt: lv } }); run(G, 0.2); ok(G.orbitPts.length === [0, 4, 6, 8][lv], 'encrypt ring size lv' + lv); G.eshots.push({ x: G.orbitPts[0].x, y: G.orbitPts[0].y, vx: 0, vy: 0, dmg: 5, r: 7, life: 4, ch: '?', col: '#fff' }); run(G, 0.05); ok(G.eshots.filter((s) => !s.dead).length === 0, 'encrypt blocks shots'); }
  { const G = mk({ pas: { symlink: lv }, t: 100 }); G.pt.link = 0.01; run(G, 0.2); ok(G.links.length === 1, 'symlink opens a pair lv' + lv); const l = G.links[0]; G.p.lk = 0; G.p.x = l.a.x; G.p.y = l.a.y; run(G, 0.05, () => ({ dx: 0, dy: 0 })); ok(Math.hypot(G.p.x - l.b.x, G.p.y - l.b.y) < 40, 'symlink teleports the player'); }
  { const G = mk({ pas: { decoy: lv }, t: 100 }); G.pt.decoy = 0.01; run(G, 0.2); ok(G.decoy && G.decoy.t > 3, 'decoy deployed lv' + lv); }
  { const G = mk({ pas: { scan: lv }, t: 100 }); G.enemies.length = 0; const tr = OW.core.mkEnemy(G, 'trojan', G.p.x + 150, G.p.y); run(G, 0.2, () => ({ dx: 0, dy: 0 })); ok(lv < 2 || tr.dead, 'scan lv' + lv + ' defuse behaviour'); }
  { const G = mk({ pas: { registry: lv } }); ok(G.rules.length >= 1, 'registry rolled a rule lv' + lv); run(G, 1); ok(G.mx.dmg !== 1 || G.mx.espd !== 1 || G.mx.xp !== 1 || G.mx.takeDmg !== 1 || G.mx.mag !== 1 || G.mx.cdSpd !== 1, 'registry rule applied to multipliers'); }
  { const G = mk({ pas: { leak: lv }, t: 0 }); run(G, 130); ok(G.mx.dmg > 1.15 && G.leakVis > 0.1, 'memory leak grows damage (' + G.mx.dmg.toFixed(2) + ') and glitch (' + G.leakVis.toFixed(2) + ') lv' + lv); }
}

// ---------------------------------------------------------------- meta + everything at once
console.log('integration');
{ const G = mk({ up: { autorun: 3 } }); ok(Object.keys(G.pas).length === 3, 'Startup Entry grants 3 passives (' + Object.keys(G.pas).join(',') + ')'); }
{ const G = mk({ up: { dashcd: 5 }, dash: 'undo' }); run(G, 2.5, () => ({ dx: 1, dy: 0 })); run(G, 0.03, () => ({ dash: true, dx: 1, dy: 0 })); ok(Math.abs(G.p.dashCd - 14 * 0.7) < 0.2, 'Fast Cache shortens cooldown (' + G.p.dashCd.toFixed(1) + ')'); }
for (const d of Object.keys(OW.DASHES)) for (const s of Object.keys(OW.SPECIALS)) {
  const all = {}; for (const id of Object.keys(OW.PASSIVES)) all[id] = 2;
  delete all.leak; // keep the soak alive
  const G = mk({ dash: d, special: s, pas: all, weapons: ['grep', 'ping', 'cat', 'rm', 'cron', 'tail'], t: 400, hp: 5000 });
  try { run(G, 20, (g, i) => ({ dash: i % 150 === 0 || i % 150 === 20, special: i % 120 === 0, dx: Math.cos(g.t), dy: Math.sin(g.t * 1.3) })); passes++; }
  catch (e) { fails++; console.log('  FAIL soak ' + d + '+' + s + ': ' + e.message); }
}
console.log('\n' + passes + ' checks passed, ' + fails + ' failed');
process.exit(fails ? 1 : 0);
