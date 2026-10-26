// Hexlands sound: every effect and both beat themes are synthesized live with Web Audio.
(function () {
  const pref = (k, d) => { try { const v = localStorage.getItem('hexlands.' + k); return v == null ? d : v === 'on'; } catch { return d; } };
  const save = (k, v) => { try { localStorage.setItem('hexlands.' + k, v ? 'on' : 'off'); } catch {} };
  const state = { sfx: pref('sfx', true), music: pref('music', true) };
  let ctx = null, out, sfxBus, musicBus, noiseBuf, themeNodes = [], themeEnd = 0;

  function ensure() {
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      ctx = new AC();
      out = ctx.createDynamicsCompressor();
      out.threshold.value = -14; out.ratio.value = 4;
      out.connect(ctx.destination);
      sfxBus = ctx.createGain(); sfxBus.gain.value = 0.55; sfxBus.connect(out);
      musicBus = ctx.createGain(); musicBus.gain.value = 0.42; musicBus.connect(out);
      noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
      const d = noiseBuf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    }
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  }
  // Browsers only allow audio after the first tap or key press.
  ['pointerdown', 'keydown'].forEach(ev => addEventListener(ev, ensure, { capture: true, passive: true }));

  const track = n => { themeNodes.push(n); return n; };
  function envGain(bus, t, peak, attack, decay, music) {
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
    g.connect(bus);
    if (music) track(g);
    return g;
  }
  function tone(bus, type, f, t, peak, attack, decay, { to, filter, music } = {}) {
    const o = ctx.createOscillator(); o.type = type;
    o.frequency.setValueAtTime(f, t);
    if (to) o.frequency.exponentialRampToValueAtTime(to, t + attack + decay);
    let node = envGain(bus, t, peak, attack, decay, music);
    if (filter) { const fl = ctx.createBiquadFilter(); fl.type = 'lowpass'; fl.frequency.value = filter; fl.connect(node); node = fl; if (music) track(fl); }
    o.connect(node); o.start(t); o.stop(t + attack + decay + 0.05);
    if (music) track(o);
  }
  function noise(bus, t, peak, dur, type, freq, q = 1, music) {
    const s = ctx.createBufferSource(); s.buffer = noiseBuf;
    const f = ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
    s.connect(f); f.connect(envGain(bus, t, peak, 0.002, dur, music));
    s.start(t, Math.random() * 0.5); s.stop(t + dur + 0.05);
    if (music) { track(s); track(f); }
  }

  // ---------- effects ----------
  const NOTE = { wood: 293.66, brick: 329.63, sheep: 392.0, wheat: 440.0, ore: 523.25 };
  const fx = {
    click(t) { tone(sfxBus, 'triangle', 1700, t, 0.22, 0.002, 0.035, { to: 1100 }); noise(sfxBus, t, 0.08, 0.02, 'highpass', 5000); },
    res(t, k) { fx.click(t); const f = NOTE[k] || 440; tone(sfxBus, 'sine', f, t + 0.01, 0.35, 0.004, 0.28); tone(sfxBus, 'sine', f * 4, t + 0.01, 0.06, 0.002, 0.08); },
    place(t) { tone(sfxBus, 'sine', 210, t, 0.5, 0.003, 0.12, { to: 95 }); noise(sfxBus, t, 0.18, 0.05, 'lowpass', 900); },
    dice(t) {
      for (let i = 0; i < 7; i++) noise(sfxBus, t + i * 0.055 + Math.random() * 0.03, 0.22 - i * 0.02, 0.03, 'bandpass', 2200 + Math.random() * 1800, 4);
      tone(sfxBus, 'sine', 160, t + 0.42, 0.3, 0.002, 0.08, { to: 90 });
    },
    gain(t) { [659.25, 880, 1318.5].forEach((f, i) => tone(sfxBus, 'sine', f, t + i * 0.07, 0.22, 0.004, 0.35)); },
    card(t) { const s = ctx.createBufferSource(); s.buffer = noiseBuf; const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.Q.value = 2; f.frequency.setValueAtTime(800, t); f.frequency.exponentialRampToValueAtTime(5000, t + 0.18); s.connect(f); f.connect(envGain(sfxBus, t, 0.25, 0.02, 0.18)); s.start(t); s.stop(t + 0.25); },
    turn(t) { tone(sfxBus, 'sine', 880, t, 0.25, 0.005, 0.5); tone(sfxBus, 'sine', 1318.5, t + 0.12, 0.2, 0.005, 0.6); },
    error(t) { tone(sfxBus, 'square', 150, t, 0.12, 0.004, 0.09, { filter: 900 }); tone(sfxBus, 'square', 120, t + 0.11, 0.12, 0.004, 0.12, { filter: 900 }); },
    tick(t) { tone(sfxBus, 'square', 1500, t, 0.1, 0.002, 0.03, { filter: 3000 }); },
    robber(t) { tone(sfxBus, 'sawtooth', 110, t, 0.18, 0.02, 0.5, { to: 70, filter: 600 }); },
  };

  // ---------- beat themes ----------
  // A 16-step drum grid per bar plus bass and lead lines. Four bars at 116 bpm (about 8 seconds).
  const hz = n => 440 * Math.pow(2, (n - 69) / 12); // MIDI note to frequency
  const THEMES = {
    start: {
      bpm: 116,
      kick: '1000001010000000', snare: '0000100000001000', hat: '1010101010101011',
      chords: [[50, 57, 62], [46, 53, 58], [48, 55, 60], [50, 57, 62]], // Dm, Bb, C, Dm: setting sail
      bass: [[0, 50], [6, 50], [10, 57], [12, 50]],
      lead: [[[0, 74, 2], [3, 77, 1], [4, 79, 3], [8, 81, 2], [12, 79, 4]], [[0, 77, 2], [4, 74, 2], [8, 72, 4], [12, 74, 4]],
             [[0, 76, 2], [3, 79, 1], [4, 81, 3], [8, 84, 2], [12, 81, 4]], [[0, 86, 6], [8, 81, 2], [12, 74, 4]]],
      fill: '1010101011111111',
    },
    finish: {
      bpm: 124,
      kick: '1000100010001010', snare: '0000100000001001', hat: '1111111111111111',
      chords: [[53, 57, 60], [48, 55, 60], [46, 53, 58], [48, 52, 55]], // F, C, Bb, C: victory
      bass: [[0, 41], [4, 41], [8, 48], [10, 41], [12, 41], [14, 48]],
      lead: [[[0, 72, 2], [2, 77, 2], [4, 81, 4], [8, 79, 2], [10, 77, 2], [12, 79, 4]], [[0, 76, 4], [4, 79, 4], [8, 84, 8]],
             [[0, 82, 2], [2, 81, 2], [4, 77, 4], [8, 74, 2], [10, 77, 2], [12, 82, 4]], [[0, 84, 3], [3, 84, 1], [4, 84, 4], [8, 88, 8]]],
      fill: '1011101111111111',
      coda: [53, 60, 65, 69, 72, 77],
    },
  };
  function playTheme(name) {
    const th = THEMES[name]; if (!th) return;
    stopTheme();
    musicBus.gain.cancelScheduledValues(ctx.currentTime);
    musicBus.gain.setValueAtTime(0.42, ctx.currentTime);
    const s16 = 60 / th.bpm / 4, t0 = ctx.currentTime + 0.08;
    for (let bar = 0; bar < 4; bar++) {
      const tb = t0 + bar * 16 * s16, last = bar === 3;
      for (let i = 0; i < 16; i++) {
        const t = tb + i * s16;
        if (th.kick[i] === '1') tone(musicBus, 'sine', 140, t, 0.9, 0.002, 0.22, { to: 42, music: true });
        const sn = last ? th.fill : th.snare;
        if (sn[i] === '1') { noise(musicBus, t, last && th.snare[i] !== '1' ? 0.18 : 0.38, 0.12, 'bandpass', 1900, 0.8, true); tone(musicBus, 'triangle', 190, t, 0.18, 0.002, 0.07, { music: true }); }
        if (th.hat[i] === '1') noise(musicBus, t, i % 4 === 0 ? 0.09 : 0.05, i === 15 ? 0.14 : 0.035, 'highpass', 7500, 1, true);
      }
      th.chords[bar].forEach(n => tone(musicBus, 'triangle', hz(n + 12), tb, 0.06, 0.04, 16 * s16 * 0.95, { filter: 1800, music: true }));
      th.bass.forEach(([st, n]) => tone(musicBus, 'sawtooth', hz(n - 12 + (th.chords[bar][0] - th.chords[0][0])), tb + st * s16, 0.22, 0.005, s16 * 1.8, { filter: 420, music: true }));
      th.lead[bar].forEach(([st, n, len]) => tone(musicBus, 'square', hz(n), tb + st * s16, 0.08, 0.008, len * s16 * 0.95, { filter: 2600, music: true }));
    }
    let end = t0 + 64 * s16;
    // Closing hit: kick, crash and the tonic chord.
    tone(musicBus, 'sine', 140, end, 0.9, 0.002, 0.4, { to: 40, music: true });
    noise(musicBus, end, 0.25, 1.4, 'highpass', 5000, 0.7, true);
    (th.coda || th.chords[0].map(n => n + 12)).forEach(n => tone(musicBus, 'triangle', hz(n + (th.coda ? 0 : 12)), end, 0.07, 0.01, 1.8, { filter: 2400, music: true }));
    themeEnd = end + 2;
  }
  function stopTheme() {
    if (!ctx) return;
    const now = ctx.currentTime;
    musicBus.gain.cancelScheduledValues(now);
    musicBus.gain.setValueAtTime(musicBus.gain.value, now);
    musicBus.gain.linearRampToValueAtTime(0, now + 0.15);
    const old = themeNodes; themeNodes = [];
    setTimeout(() => { old.forEach(n => { try { n.stop && n.stop(); } catch {} try { n.disconnect(); } catch {} }); if (ctx) musicBus.gain.setValueAtTime(0.42, ctx.currentTime); }, 200);
  }

  window.Sound = {
    play(name, arg) { if (!state.sfx || !ensure() || !fx[name]) return; try { fx[name](ctx.currentTime + 0.005, arg); } catch {} },
    theme(name) { if (!state.music || !ensure()) return; try { playTheme(name); } catch {} },
    stopTheme,
    playing: () => !!ctx && ctx.currentTime < themeEnd,
    get sfx() { return state.sfx; },
    get music() { return state.music; },
    setSfx(on) { state.sfx = on; save('sfx', on); if (on) Sound.play('click'); },
    setMusic(on) { state.music = on; save('music', on); if (!on) stopTheme(); },
    _themes: THEMES,
  };
})();
