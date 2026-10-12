// OVERWRITTEN - static game data: enemies, weapons, passives, forms, meta upgrades.
(function (g) {
  'use strict';
  const OW = (g.OW = g.OW || {});

  // One world cell is 11x20 px: a monospace character. 2 chars wide x 1 tall is roughly square.
  OW.CW = 11;
  OW.CH = 20;
  OW.COLS = 101;
  OW.ROWS = 32;
  OW.VW = OW.COLS * OW.CW;
  OW.VH = OW.ROWS * OW.CH;

  // ---- Timeline (seconds) ----
  OW.PURGE_START = 240;

  // ---- Difficulty knobs (the "onslaught"). Tweak these to taste. ----
  OW.TUNING = {
    spawnBase: 1.8,      // enemies spawned per second at t=0
    spawnGrowth: 0.02,   // + this per second of run time
    capBase: 12,         // max enemies alive at t=0
    capGrowth: 0.5,      // + this per second of run time
    capPurge: 10,        // + this per Purge level
    purgeLen: 75,        // seconds per Purge level
    hpPerMin: 0.14,      // enemy HP grows this fraction per minute
    speedGrowth: 3000,   // enemies gain +1/(this) speed per second (capped at +25%)
    waveAmp: 0.45,       // ebb and flow: spawn rate swings +/- this fraction ...
    wavePeriod: 28,      // ... over this many seconds (lulls let you breathe and collect)
    eliteFirst: 90,      // first elite after this many seconds
    eliteEvery: 85,      // then roughly this often (drifts down slowly)
  };
  OW.BOSS_TIME = 540;

  // ---- Enemies ----
  // art(e) returns an array of rows. Nothing hostile is smaller than 2 characters.
  OW.ENEMIES = {
    swarm: {
      name: 'swarmer', hp: 3, spd: 74, dmg: 6, xp: 1, col: '#ff6b6b', from: 0, w: 6,
      art: (e) => [e.face > 0 ? '-0' : '0-'],
    },
    flick: {
      name: 'flicker', hp: 4, spd: 88, dmg: 6, xp: 1, col: '#ffb454', from: 45, w: 3,
      art: (e) => [(Math.floor(e.t * 8) & 1) ? '<>' : '><'],
    },
    brick: {
      name: 'bloat', hp: 18, spd: 46, dmg: 11, xp: 3, col: '#c792ea', from: 150, w: 2, kbRes: 0.6,
      art: () => ['[#]'],
    },
    spy: {
      name: 'spyware', hp: 9, spd: 78, dmg: 7, xp: 2, col: '#ff79c6', from: 240, w: 1.6,
      art: (e) => [e.shotT < 0.35 ? '(O)' : '(o)'],
    },
    worm: {
      name: 'worm', hp: 6, spd: 66, dmg: 8, xp: 1, col: '#4be0c4', from: 330, w: 0.5,
      art: (e) =>
        !e.leader
          ? [e.face > 0 ? '=@' : '@=']
          : [((Math.floor(e.t * 6) + e.seg) & 1) ? '~=' : '=~'],
    },
    trojan: {
      name: 'trojan', hp: 10, spd: 22, dmg: 0, xp: 3, col: '#6dff9c', from: 420, w: 0.7,
      art: (e) => (e.open ? ['[=]'] : (e.t % 4 < 0.12 ? ['(=)'] : ['(+)'])),
    },
    boss: {
      name: 'DISK CLEANUP.EXE', hp: 3000, spd: 40, dmg: 16, xp: 0, col: '#ffd24a', from: 9e9, w: 0,
      r: 62,
      art: (e) => {
        const frac = Math.max(0, e.hp / e.maxhp);
        const n = 10;
        const f = Math.round(frac * n);
        const bar = '[' + '#'.repeat(f) + '.'.repeat(n - f) + ']';
        const pct = String(Math.round(frac * 100)).padStart(3, ' ') + '%';
        const status = e.mode === 'tele' ? '!! CHARGING !!' : e.mode === 'charge' ? '>>> PURGING >>>' : ' ' + pct + ' remains  ';
        return [
          '╔══════════════╗',
          '║ DISK CLEANUP ║',
          '║ ' + bar + ' ║',
          '║' + status.padEnd(14, ' ').slice(0, 14) + '║',
          '╚══════════════╝',
        ];
      },
    },
  };

  // Elite modifiers: glyph rides above the sprite.
  OW.ELITE_MODS = {
    '*': { col: '#ffd24a', desc: 'tough', hp: 6 },
    '!': { col: '#ff8a3d', desc: 'explodes', hp: 3 },
    '&': { col: '#4be0c4', desc: 'splits', hp: 3 },
  };

  // ---- Weapons ----
  OW.WEAPONS = {
    grep: {
      name: 'grep', col: '#5ee1ff', max: 8,
      desc: 'Piercing character bolts fired where you aim.',
      lv: ['', 'Fires 1 bolt.', '+1 bolt.', 'Bolts pierce 1 enemy.', '+1 bolt, faster.', '+25% damage.', '+1 bolt. Pierce 2.', '+damage.', '+1 bolt. Ready to evolve.'],
      evo: { pas: 'regex', name: 'grep -r', desc: 'Recursive: also fires 8 bolts in every direction. Bigger, piercing bolts.' },
    },
    ping: {
      name: 'ping', col: '#8affb0', max: 8,
      desc: 'Expanding pulse that damages and shoves everything it crosses.',
      lv: ['', 'Pulse every 3s.', 'Larger pulse.', '+damage.', 'Faster pulses.', 'Larger pulse.', '+damage.', 'Faster pulses.', 'Huge pulse.'],
    },
    cat: {
      name: 'cat', col: '#ffe08a', max: 8,
      desc: 'Short-range sweep toward your cursor.',
      lv: ['', 'Sweeps ahead.', 'Longer reach.', '+damage.', 'Also sweeps behind.', 'Longer reach.', '+damage.', 'Faster sweeps.', 'Wide arc.'],
    },
    tail: {
      name: 'tail -f', col: '#ff9ae6', max: 8,
      desc: 'Leaves a damaging stream of characters behind you.',
      lv: ['', 'Short trail.', 'Longer trail.', '+damage.', 'Longer trail.', 'Wider trail.', '+damage.', 'Longer trail.', 'Burning trail.'],
    },
    rm: {
      name: 'rm', col: '#ff6b6b', max: 8,
      desc: 'Boomerang thrown at your cursor. Deletes weakened enemies outright.',
      lv: ['', 'Throws 1 boomerang.', 'Longer reach.', '+damage.', 'Deletes below 25% HP.', '+1 boomerang.', '+damage.', 'Faster throws.', 'Deletes below 35% HP.'],
    },
    cron: {
      name: 'cron', col: '#ffb454', max: 8,
      desc: 'Scheduled explosions that land on your cursor.',
      lv: ['', '1 blast every 4s.', 'Bigger blasts.', '+damage.', '+1 blast.', 'Bigger blasts.', '+damage.', 'Faster schedule.', '+1 blast.'],
    },
  };

  // ---- Passives ----
  OW.PASSIVES = {
    overhead: { name: 'Overhead', col: '#ff8a8a', max: 5, desc: '+10% damage per level.' },
    bandwidth: { name: 'Bandwidth', col: '#8ab4ff', max: 5, desc: '-8% weapon cooldowns per level.' },
    cache: { name: 'Cache', col: '#c3ff8a', max: 5, desc: '+25% pickup radius per level.' },
    integrity: { name: 'Integrity', col: '#6dff9c', max: 5, desc: '+20 max integrity per level (and heals 20).' },
    thru: { name: 'Throughput', col: '#ffe08a', max: 5, desc: '+8% movement speed per level.' },
    lock: { name: 'Lock-On', col: '#ff9ae6', max: 3, desc: 'Aim assist. Lv1 snaps to enemies near your cursor line, Lv2 a wide cone, Lv3 aims for you.' },
    regex: { name: 'Regex', col: '#e0a8ff', max: 5, desc: '+1 projectile/blast per 2 levels. Unlocks grep evolution.' },
  };

  // ---- Forms (what kind of file you are) ----
  OW.FORMS = {
    txt: { id: 'txt', name: '.txt', art: '[@]', col: '#e8f1f5', cost: 0, start: 'grep', hp: 1, dmg: 1, spd: 1,
      desc: 'Balanced and easy to read. Starts with grep.' },
    exe: { id: 'exe', name: '.exe', art: '<@>', col: '#ff8a8a', cost: 150, start: 'cat', hp: 0.8, dmg: 1.25, spd: 1,
      desc: '+25% damage, -20% integrity. Starts with cat.' },
    tmp: { id: 'tmp', name: '.tmp', art: '(@)', col: '#ffe08a', cost: 300, start: 'tail', hp: 0.85, dmg: 1, spd: 1.2,
      desc: '+20% speed, -15% integrity. Starts with tail -f.' },
  };

  // ---- Permanent (Recycle Bin) upgrades, paid in Recovered Bytes ----
  OW.META = [
    { id: 'hp', name: 'Integrity', desc: '+10 max integrity', max: 5, cost: (r) => 30 + r * 30 },
    { id: 'dmg', name: 'Overhead', desc: '+5% damage', max: 5, cost: (r) => 40 + r * 40 },
    { id: 'spd', name: 'Throughput', desc: '+4% move speed', max: 5, cost: (r) => 30 + r * 30 },
    { id: 'mag', name: 'Cache', desc: '+10% pickup radius', max: 5, cost: (r) => 25 + r * 25 },
    { id: 'rr', name: 'Reroll', desc: '+1 level-up reroll per run', max: 3, cost: (r) => 60 + r * 60 },
    { id: 'rev', name: 'Restore Backup', desc: 'Revive once per run', max: 1, cost: () => 250 },
  ];

  // XP needed to go from level l to l+1.
  OW.xpNeed = (l) => Math.floor(18 + l * 9 + l * l * 0.9);
})(typeof globalThis !== 'undefined' ? globalThis : this);
