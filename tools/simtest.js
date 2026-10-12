// Headless smoke/balance test: node tools/simtest.js [seconds] [form] [seed-runs]
// A simple bot kites away from the nearest enemies and picks random upgrades.
const fs = require('fs');
const vm = require('vm');
const path = require('path');

function load() {
  const ctx = { console, Math, Set, Map };
  ctx.globalThis = ctx;
  vm.createContext(ctx);
  for (const f of ['data.js', 'game.js', 'powers.js']) {
    vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'js', f), 'utf8'), ctx, { filename: f });
  }
  return ctx.OW;
}

function runOnce(OW, secs, form, opts) {
  const G = OW.newRun({ up: opts.meta || {} }, form, { t: opts.t0 || 0 });
  const dt = 1 / 60;
  let stats = { maxEnemies: 0, levels: [], simMs: 0 };
  let steps = 0;
  const t0 = Date.now();
  while (G.t < secs && !G.over) {
    // bot: flee from enemy centroid within 220px, otherwise drift toward the portal / orbit
    let fx = 0, fy = 0;
    for (const e of G.enemies) {
      const dx = G.p.x - e.x, dy = G.p.y - e.y, d = Math.hypot(dx, dy);
      if (d < 220 && d > 0) { const w = (220 - d) / d / d; fx += dx * w; fy += dy * w; }
    }
    for (const s of G.eshots) {
      const dx = G.p.x - s.x, dy = G.p.y - s.y, d = Math.hypot(dx, dy);
      if (d < 120 && d > 0) { fx += (dx / d) * 0.01; fy += (dy / d) * 0.01; }
    }
    // pull toward nearest pickup
    let best = null, bd = 1e9;
    for (const b of G.bits) { const d = Math.hypot(b.x - G.p.x, b.y - G.p.y); if (d < bd) { bd = d; best = b; } }
    if (best && bd < 500) { fx += ((best.x - G.p.x) / bd) * 0.004; fy += ((best.y - G.p.y) / bd) * 0.004; }
    if (G.portal) { const d = Math.hypot(G.portal.x - G.p.x, G.portal.y - G.p.y); fx += ((G.portal.x - G.p.x) / d) * 0.01; fy += ((G.portal.y - G.p.y) / d) * 0.01; }
    // tangential drift so the bot keeps moving (needed for tail -f)
    fx += -Math.sin(G.t * 0.7) * 0.0006; fy += Math.cos(G.t * 0.7) * 0.0006;
    // aim at the nearest enemy (stands in for the mouse)
    let ne = null, nd = 1e9;
    for (const e of G.enemies) { const d = Math.hypot(e.x - G.p.x, e.y - G.p.y); if (d < nd) { nd = d; ne = e; } }
    const inp = { dx: fx, dy: fy, dash: G.p.hp < G.p.maxhp * 0.35, ox: ne ? ne.x - G.p.x : 200, oy: ne ? ne.y - G.p.y : 0 };
    if (G.choices) {
      const i = Math.floor(Math.random() * G.choices.length);
      stats.levels.push(Math.round(G.t));
      OW.applyChoice(G, i);
    }
    OW.step(G, dt, inp);
    steps++;
    if (G.enemies.length > stats.maxEnemies) stats.maxEnemies = G.enemies.length;
  }
  stats.simMs = Date.now() - t0;
  stats.steps = steps;
  return { G, stats };
}

if (require.main === module) {
  const OW = load();
  const secs = +process.argv[2] || 700;
  const form = process.argv[3] || 'txt';
  const runs = +process.argv[4] || 3;
  for (let i = 0; i < runs; i++) {
    const { G, stats } = runOnce(OW, secs, form, {});
    const bytes = OW.runBytes(G);
    console.log(
      `run ${i}: ${G.over || 'alive'} @ ${G.t.toFixed(0)}s  lvl ${G.level}  kills ${G.kills}  maxEnemies ${stats.maxEnemies}  ` +
        `weapons ${G.weapons.map((w) => w.id + w.lv).join(',')}  bytes ${bytes.total}  ` +
        `sim ${(stats.simMs / (steps(stats) / 60)).toFixed(1)}ms/sim-s  boss ${G.bossDead ? 'dead' : G.boss ? 'alive' : '-'}`
    );
    console.log('  level-up times:', stats.levels.slice(0, 14).join(' '));
  }
}
function steps(s) { return s.steps; }

module.exports = { load, runOnce };
