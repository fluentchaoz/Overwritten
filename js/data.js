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
    archive: {
      name: 'archive', hp: 16, spd: 34, dmg: 9, xp: 0, col: '#e0a8ff', from: 9e9, w: 0, kbRes: 0.5,
      art: () => ['{Z}'],
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
    shadow: { name: 'Shadow Copy', col: '#9fd6e8', max: 3, desc: 'A ghost trails you ~1s behind and fires your aimed weapons (50/70/90% damage). Lv3 adds a second ghost.' },
    forkb: { name: 'Fork Bomb', col: '#ff9ae6', max: 3, desc: 'Bolts split in two on their first hit. Lv2: the children split again. Lv3: splits into three.' },
    undelete: { name: 'Undelete', col: '#8affb0', max: 3, desc: 'Kills have a 4/7/10% chance to be restored as a brief ally ghost that attacks enemies.' },
    zombie: { name: 'Zombie Process', col: '#6dff9c', max: 3, desc: 'Every 14/10/7s the nearest enemy is infected and fights for you for 8s.' },
    readonly: { name: 'Read-Only', col: '#8ab4ff', max: 3, desc: 'No single hit can take more than 8/6/4.5% of your max integrity.' },
    hidden: { name: 'Hidden', col: '#7f98a5', max: 3, desc: 'Stand still for 2/1.4/0.9s and enemies lose track of you. Taking damage or moving reveals you.' },
    gc: { name: 'Garbage Collection', col: '#c3ff8a', max: 3, desc: 'Every 40/32/25s the world pauses briefly, then the oldest 25/35/50% of enemies are swept away.' },
    compress: { name: 'Compression', col: '#e0a8ff', max: 3, desc: 'Every 22/18/14s a dense crowd is zipped into one tough archive that drops big XP.' },
    encrypt: { name: 'Encryption', col: '#5ee1ff', max: 3, desc: 'A ring of cipher characters orbits you. It blocks enemy shots and damages what it touches.' },
    symlink: { name: 'Symlink', col: '#ffb454', max: 3, desc: 'Every 16/12/9s a shortcut pair opens between you and your cursor. You AND enemies can use it.' },
    decoy: { name: 'Spoofed IP', col: '#ffd24a', max: 3, desc: 'Every 18/14/10s drop a decoy that enemies chase for 4/5/6s. Lv3 it explodes.' },
    scan: { name: 'Port Scan', col: '#ff79c6', max: 3, desc: 'Lv1 reveals trojans, chests and elites. Lv2 defuses nearby trojans. Lv3 wider, and pulls in chests.' },
    registry: { name: 'Registry Edit', col: '#ff8a3d', max: 3, desc: 'GAMBLE: rewrites one random game rule (a boon with a cost). Each level rolls another.' },
    leak: { name: 'Memory Leak', col: '#ff6b6b', max: 3, desc: 'You grow stronger the longer the run goes, but the screen gets glitchier and harder to read.' },
    regex: { name: 'Regex', col: '#e0a8ff', max: 5, desc: '+1 projectile/blast per 2 levels. Unlocks grep evolution.' },
  };

  // ---- Dash programs (Space). Pick one at the Recycle Bin. ----
  OW.DASHES = {
    undo: { id: 'undo', name: 'ctrl+z  Undo', short: 'ctrl+z', cost: 0, col: '#8ab4ff', cd: 14,
      desc: 'Rewind about 1s of position AND integrity. 14s cooldown.' },
    copy: { id: 'copy', name: 'ctrl+c/v  Copy-Paste', short: 'ctrl+c/v', cost: 120, col: '#8affb0', cd: 8,
      desc: 'Press once to drop an anchor, press again to teleport back to it. Anchor lasts 12s.' },
    save: { id: 'save', name: 'ctrl+s  Quicksave', short: 'ctrl+s', cost: 150, col: '#ffe08a', cd: 10,
      desc: 'Press once to save position and integrity, again to reload them. The save lasts 10s.' },
    del: { id: 'del', name: 'shift+del  Delete', short: 'shift+del', cost: 180, col: '#ff6b6b', cd: 7,
      desc: 'Dash through enemies, deleting weak ones and hurting the rest. Brief invulnerability.' },
    alt: { id: 'alt', name: 'alt+tab  Switch Window', short: 'alt+tab', cost: 200, col: '#c792ea', cd: 9,
      desc: 'Phase out for 0.7s: invulnerable and twice as fast, but you cannot attack.' },
    refresh: { id: 'refresh', name: 'F5  Refresh', short: 'F5', cost: 220, col: '#5ee1ff', cd: 8,
      desc: 'Hop away and send out a shockwave that shoves enemies back and clears enemy shots.' },
  };

  // ---- Special attacks (right-click / Q). Charged by collecting bits, killing and time. ----
  // need = charge (out of 100) required.
  OW.SPECIALS = {
    taskmgr: { id: 'taskmgr', name: 'Task Manager', short: 'task mgr', cost: 0, need: 100, col: '#8ab4ff',
      desc: 'Suspend every process but you for 3s. Your weapons keep firing.' },
    kill9: { id: 'kill9', name: 'kill -9', short: 'kill -9', cost: 100, need: 45, col: '#ff6b6b',
      desc: 'Instantly deletes the enemy nearest your cursor. Bosses lose 12% of their health. Cheap and fast.' },
    sudo: { id: 'sudo', name: 'sudo !!', short: 'sudo !!', cost: 150, need: 70, col: '#ffe08a',
      desc: 'All weapon damage x2 and weapons fire faster for 6s.' },
    bsod: { id: 'bsod', name: 'Blue Screen', short: 'BSOD', cost: 200, need: 85, col: '#5ee1ff',
      desc: 'Stun everything on screen for 2.2s. Bosses are immune.' },
    safe: { id: 'safe', name: 'Safe Mode', short: 'safe mode', cost: 250, need: 80, col: '#6dff9c',
      desc: 'For 6s enemies lose their special abilities (no shooting, no trojans, no elite effects) and you move faster.' },
    forkproc: { id: 'forkproc', name: 'fork()', short: 'fork()', cost: 300, need: 90, col: '#ff9ae6',
      desc: 'A full copy of you orbits and fires your weapons for 10s.' },
    format: { id: 'format', name: 'format c:', short: 'format c:', cost: 400, need: 100, col: '#ff8a3d',
      desc: 'Wipes the screen of enemies (elites -50%, bosses -6%). It also deletes loose XP on screen.' },
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
    { id: 'dashcd', name: 'Fast Cache', desc: 'Dash cooldown -6%', max: 5, cost: (r) => 35 + r * 35 },
    { id: 'spchg', name: 'Overclock', desc: 'Special charges 8% faster', max: 5, cost: (r) => 35 + r * 35 },
    { id: 'autorun', name: 'Startup Entry', desc: 'Free random passive at start', max: 3, cost: (r) => 120 + r * 120 },
  ];

  // XP needed to go from level l to l+1.
  OW.xpNeed = (l) => Math.floor(18 + l * 9 + l * l * 0.9);
})(typeof globalThis !== 'undefined' ? globalThis : this);
