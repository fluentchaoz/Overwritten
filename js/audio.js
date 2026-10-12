// OVERWRITTEN - procedural sound effects in the spirit of the Atari 2600's TIA chip.
// No audio files: every effect is a few "voices" (square / pulse / buzz / noise) whose pitch and
// 4-bit volume are rewritten once per 60Hz frame, then crushed to a coarse sample resolution.
(function (g) {
  'use strict';
  const OW = (g.OW = g.OW || {});
  const FR = 1 / 60;
  const BUF_SR = 44100;
  const VOICE = 0.45; // per-voice gain at TIA volume 15
  const MASTER = 0.8;

  let ctx = null, bus = null, master = null;
  let muted = false;
  let voices = 0;
  const buffers = {};
  let pulseWave = null;
  const lastPlay = Object.create(null);
  let combo = 0, comboT = 0;

  // ---------------------------------------------------------------- frame-sequence helpers
  const sw = (n, f0, f1, v0, v1) => { // exponential pitch sweep + linear volume ramp
    const a = [];
    for (let i = 0; i < n; i++) {
      const k = n > 1 ? i / (n - 1) : 0;
      a.push([f0 * Math.pow(f1 / f0, k), Math.round(v0 + (v1 - v0) * k)]);
    }
    return a;
  };
  const hold = (f, n, v0, v1) => {
    const a = [];
    for (let i = 0; i < n; i++) a.push([f, Math.round(v0 + ((v1 === undefined ? v0 : v1) - v0) * (n > 1 ? i / (n - 1) : 0))]);
    return a;
  };
  const rest = (n) => hold(100, n, 0, 0);
  const cat = (...xs) => [].concat(...xs);
  const arp = (fs, per, v) => cat(...fs.map((f) => hold(f, per, v, Math.max(0, v - 5))));
  const warble = (frames, depth, rate) => frames.map(([f, v], i) => [f * (1 + depth * Math.sin(i * rate)), v]);
  const beeps = (f, n, on, off, v) => cat(...Array.from({ length: n }, () => cat(hold(f, on, v), rest(off))));

  // ---------------------------------------------------------------- the effects
  // Each returns layers: { w: 'sq' | 'pulse' | 'p4' | 'p5' | 'nz', frames: [[freq, vol0..15], ...] }
  // 'p4'/'p5' are TIA-style short-period buzzy tones; 'nz' is noise (freq/1000 = playback rate).
  const S = {
    grep: () => [{ w: 'pulse', frames: sw(6, 1500 + Math.random() * 200, 520, 9, 0) }, { w: 'nz', frames: [[2200, 6], [1200, 3]] }],
    ping: () => [{ w: 'sq', frames: cat(hold(988, 4, 8, 6), hold(1319, 9, 6, 0)) }, { w: 'p4', frames: cat(rest(2), hold(660, 8, 4, 0)) }],
    slash: () => [{ w: 'nz', frames: sw(8, 5000, 900, 9, 0) }, { w: 'sq', frames: sw(8, 260, 90, 6, 0) }],
    rm: () => [{ w: 'p5', frames: warble(sw(12, 240, 120, 8, 0), 0.14, 2.1) }, { w: 'nz', frames: sw(6, 2400, 800, 3, 0) }],
    cronset: () => [{ w: 'sq', frames: cat(hold(1400, 1, 6), rest(2), hold(1000, 1, 5)) }],
    blast: () => [
      { w: 'nz', frames: sw(24, 900, 60, 13, 0) },
      { w: 'sq', frames: sw(18, 140, 35, 12, 0) },
      { w: 'p4', frames: sw(10, 300, 60, 9, 0) },
    ],
    ebeep: () => [{ w: 'sq', frames: beeps(1500, 4, 2, 2, 6) }],
    hit: () => [{ w: 'sq', frames: hold(180 + Math.random() * 160, 2, 6, 3) }, { w: 'nz', frames: [[3000, 5]] }],
    kill: (a) => [{ w: 'nz', frames: sw(6, 3500, 800, 8, 0) }, { w: 'sq', frames: sw(7, 700 * (a || 1), 160, 8, 0) }],
    killbig: () => [
      { w: 'nz', frames: sw(14, 2200, 300, 12, 0) },
      { w: 'sq', frames: sw(12, 420, 60, 11, 0) },
      { w: 'p4', frames: sw(10, 200, 50, 8, 0) },
    ],
    hurt: () => [
      { w: 'p5', frames: Array.from({ length: 16 }, (_, i) => [(i % 2 ? 110 : 160) * (1 - i * 0.02), Math.round(15 - i * 0.8)]) },
      { w: 'nz', frames: sw(16, 2500, 300, 14, 0) },
      { w: 'sq', frames: sw(16, 90, 40, 12, 0) },
    ],
    bit: (a) => [{ w: 'sq', frames: hold(700 * Math.pow(2, (a || 0) / 12), 2, 7, 4) }],
    chest: () => [{ w: 'sq', frames: arp([523, 659, 784, 1047], 3, 9) }, { w: 'pulse', frames: arp([1047, 1319, 1568, 2093], 3, 5) }],
    heal: () => [{ w: 'sq', frames: arp([392, 523, 659], 3, 8) }, { w: 'p4', frames: arp([196, 262, 330], 3, 4) }],
    magnet: () => [{ w: 'p4', frames: sw(16, 150, 1800, 9, 3) }, { w: 'sq', frames: sw(16, 300, 1200, 5, 0) }],
    levelup: () => [
      { w: 'pulse', frames: arp([523, 659, 784, 1047, 784, 1047, 1319, 1568], 4, 10) },
      { w: 'sq', frames: arp([262, 330, 392, 523, 392, 523, 659, 784], 4, 6) },
    ],
    dash: () => [
      { w: 'sq', frames: Array.from({ length: 12 }, (_, i) => [150 * Math.pow(2, i * 0.5), 3 + i * 0.6]) },
      { w: 'nz', frames: cat(rest(10), hold(4000, 2, 8, 0)) },
    ],
    spy: () => [{ w: 'pulse', frames: cat(hold(1800, 2, 6, 4), hold(1100, 3, 4, 0)) }],
    tropen: () => [{ w: 'sq', frames: cat(...Array.from({ length: 5 }, () => cat(hold(740, 2, 9), hold(520, 2, 9)))) }],
    trojan: () => [
      { w: 'nz', frames: sw(10, 3000, 500, 12, 0) },
      { w: 'sq', frames: sw(10, 900, 100, 10, 0) },
      { w: 'p5', frames: sw(6, 300, 900, 8, 0) },
    ],
    elite: () => [
      { w: 'p5', frames: cat(hold(80, 8, 10), hold(70, 10, 10, 6), hold(60, 14, 8, 0)) },
      { w: 'sq', frames: arp([220, 185, 147], 6, 7) },
    ],
    purge: () => [
      { w: 'sq', frames: Array.from({ length: 50 }, (_, i) => [380 + 240 * Math.sin(i * 0.36), i > 40 ? 11 - (i - 40) : 11]) },
      { w: 'nz', frames: hold(300, 50, 5, 3) },
      { w: 'p4', frames: hold(110, 50, 6, 4) },
    ],
    bossintro: () => [
      { w: 'p5', frames: sw(70, 38, 95, 10, 12) },
      { w: 'sq', frames: hold(55, 70, 6, 9) },
      { w: 'nz', frames: hold(250, 70, 4, 8) },
    ],
    bosstele: () => [{ w: 'sq', frames: beeps(1200, 3, 4, 4, 10) }],
    bosscharge: () => [{ w: 'sq', frames: sw(14, 120, 900, 6, 12) }, { w: 'p4', frames: sw(14, 80, 600, 6, 10) }],
    bandtele: () => [{ w: 'sq', frames: Array.from({ length: 22 }, (_, i) => [700 + 300 * Math.sin(i * 0.8), 6]) }],
    bandfire: () => [
      { w: 'nz', frames: sw(14, 2500, 150, 13, 0) },
      { w: 'sq', frames: sw(14, 2200, 90, 12, 0) },
      { w: 'p4', frames: sw(14, 600, 70, 10, 0) },
    ],
    bossspawn: () => [{ w: 'sq', frames: arp([196, 147, 110, 82], 4, 9) }, { w: 'p5', frames: hold(60, 16, 8, 0) }],
    bossdie: () => [
      { w: 'nz', frames: sw(70, 900, 40, 15, 0) },
      { w: 'sq', frames: sw(60, 520, 30, 14, 0) },
      { w: 'p4', frames: sw(50, 260, 40, 11, 0) },
    ],
    portal: () => [{ w: 'pulse', frames: arp([392, 494, 587, 784, 988, 1175], 5, 8) }, { w: 'sq', frames: arp([196, 247, 294, 392, 494, 587], 5, 4) }],
    win: () => [
      { w: 'pulse', frames: arp([523, 659, 784, 1047, 784, 1047, 1319, 1568, 2093], 6, 11) },
      { w: 'sq', frames: arp([262, 330, 392, 523, 392, 523, 659, 784, 1047], 6, 6) },
    ],
    death: () => [
      { w: 'p5', frames: warble(sw(54, 420, 28, 13, 0), 0.1, 1.3) },
      { w: 'nz', frames: sw(54, 2000, 100, 11, 0) },
      { w: 'sq', frames: sw(40, 220, 30, 9, 0) },
    ],
    revive: () => [{ w: 'pulse', frames: arp([262, 330, 392, 523, 659, 784, 1047], 3, 10) }, { w: 'nz', frames: sw(10, 500, 4000, 6, 0) }],
    uimove: () => [{ w: 'sq', frames: hold(1500, 2, 5, 2) }],
    uiok: () => [{ w: 'sq', frames: cat(hold(880, 3, 7, 4), hold(1320, 4, 7, 0)) }],
    uino: () => [{ w: 'sq', frames: cat(hold(180, 5, 8, 6), hold(140, 6, 8, 0)) }],
  };

  // gap = minimum ms between plays, pri = how important when the mixer is busy (0 low .. 3 vital)
  const META = {
    hit: { gap: 40, pri: 0 }, kill: { gap: 30, pri: 0 }, killbig: { gap: 60, pri: 1 }, bit: { gap: 22, pri: 0 },
    grep: { gap: 25, pri: 1 }, slash: { gap: 40, pri: 1 }, rm: { gap: 40, pri: 1 }, ping: { gap: 40, pri: 1 },
    spy: { gap: 80, pri: 0 }, blast: { gap: 45, pri: 1 }, cronset: { gap: 60, pri: 0 }, ebeep: { gap: 80, pri: 1 },
    hurt: { gap: 80, pri: 3 }, levelup: { gap: 100, pri: 3 }, death: { gap: 100, pri: 3 }, win: { gap: 100, pri: 3 },
    bossdie: { gap: 100, pri: 3 }, bossintro: { gap: 100, pri: 3 }, purge: { gap: 100, pri: 3 },
  };
  const CAP = [14, 20, 26, 36];

  // ---------------------------------------------------------------- engine
  function lfsrBuffer(period, repeat, seed) {
    const len = period * repeat;
    const b = ctx.createBuffer(1, len, BUF_SR);
    const d = b.getChannelData(0);
    // deterministic pseudo-random pattern of +/-1 with the requested period
    let x = seed || 0x1b;
    const pat = [];
    for (let i = 0; i < period; i++) { x = (x * 73 + 41) & 0xffff; pat.push((x >> 3) & 1 ? 1 : -1); }
    for (let i = 0; i < len; i++) d[i] = pat[i % period];
    return b;
  }
  function whiteBuffer() {
    const b = ctx.createBuffer(1, BUF_SR, BUF_SR);
    const d = b.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() < 0.5 ? -1 : 1; // 1-bit noise, like the TIA
    return b;
  }

  function build(c) {
    ctx = c;
    voices = 0;
    for (const k in lastPlay) delete lastPlay[k];
    master = ctx.createGain();
    master.gain.value = muted ? 0 : MASTER;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -20; comp.ratio.value = 8; comp.knee.value = 6; comp.attack.value = 0.002; comp.release.value = 0.12;
    // coarse output quantiser (5-bit): the crunch. Fine enough that quiet voices still survive.
    const shaper = ctx.createWaveShaper();
    const N = 8192, curve = new Float32Array(N);
    for (let i = 0; i < N; i++) { const x = (i / (N - 1)) * 2 - 1; curve[i] = Math.round(x * 31) / 31; }
    shaper.curve = curve;
    bus = ctx.createGain();
    // many voices -> compressor (so a big fight doesn't hard-clip) -> bit crusher -> master
    bus.connect(comp); comp.connect(shaper); shaper.connect(master); master.connect(ctx.destination);
    buffers.p4 = lfsrBuffer(15, 200, 0x2d);
    buffers.p5 = lfsrBuffer(31, 100, 0x5b);
    buffers.nz = whiteBuffer();
    const re = new Float32Array(65), im = new Float32Array(65);
    for (let n = 1; n < 65; n++) re[n] = (2 / (n * Math.PI)) * Math.sin(n * Math.PI * 0.25);
    pulseWave = ctx.createPeriodicWave(re, im);
  }

  function voice(layer, t0, vscale) {
    const fr = layer.frames;
    if (!fr.length) return;
    let src, param, conv;
    if (layer.w === 'sq' || layer.w === 'pulse') {
      src = ctx.createOscillator();
      if (layer.w === 'sq') src.type = 'square'; else src.setPeriodicWave(pulseWave);
      param = src.frequency;
      conv = (f) => Math.max(20, Math.min(12000, f));
    } else {
      src = ctx.createBufferSource();
      src.buffer = buffers[layer.w];
      src.loop = true;
      param = src.playbackRate;
      if (layer.w === 'nz') conv = (f) => Math.max(0.05, Math.min(8, f / 1000));
      else {
        const period = layer.w === 'p4' ? 15 : 31;
        conv = (f) => Math.max(0.05, Math.min(16, f / (BUF_SR / period)));
      }
    }
    const gn = ctx.createGain();
    gn.gain.value = 0;
    src.connect(gn); gn.connect(bus);
    for (let i = 0; i < fr.length; i++) {
      const t = t0 + i * FR;
      param.setValueAtTime(conv(fr[i][0]), t);
      gn.gain.setValueAtTime((Math.max(0, Math.min(15, Math.round(fr[i][1]))) / 15) * VOICE * vscale, t);
    }
    const end = t0 + fr.length * FR;
    gn.gain.setValueAtTime(0, end);
    src.start(t0);
    src.stop(end + 0.02);
    voices++;
    src.onended = () => { voices--; try { gn.disconnect(); } catch (e) { /* ignore */ } };
  }

  const audio = {
    names: Object.keys(S),
    init() {
      if (ctx) { if (ctx.state === 'suspended' && ctx.resume) ctx.resume(); return true; }
      try {
        const AC = g.AudioContext || g.webkitAudioContext;
        if (!AC) return false;
        build(new AC());
        if (ctx.state === 'suspended') ctx.resume();
        return true;
      } catch (e) { ctx = null; return false; }
    },
    // For tests: build the engine on any (e.g. Offline) AudioContext.
    initWith(c) { build(c); },
    get ready() { return !!ctx; },
    get muted() { return muted; },
    setMuted(m) { muted = !!m; if (master) master.gain.value = muted ? 0 : MASTER; },
    // vol 0..1 (distance falloff), a = effect-specific parameter
    play(name, vol, a) {
      if (!ctx || muted || !S[name]) return;
      const m = META[name] || { gap: 0, pri: 2 };
      const now = (g.performance ? g.performance.now() : Date.now());
      if (m.gap && lastPlay[name] && now - lastPlay[name] < m.gap) return;
      if (voices >= CAP[m.pri]) return;
      lastPlay[name] = now;
      vol = vol === undefined ? 1 : vol;
      if (name === 'bit') { // pickups climb in pitch while you keep scooping
        const t = now / 1000;
        combo = t - comboT < 0.45 ? Math.min(combo + 1, 14) : 0;
        comboT = t;
        a = combo;
      }
      const layers = S[name](a);
      const t0 = ctx.currentTime + 0.005;
      for (const l of layers) voice(l, t0, vol);
    },
  };
  OW.audio = audio;
})(typeof globalThis !== 'undefined' ? globalThis : this);
