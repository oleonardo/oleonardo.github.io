/**
 * Leonardo de Oliveira · Abissal
 * sound.js: the site's sound. Off until the visitor asks for it: no audio file is
 * fetched and no AudioContext exists before the first switch-on, and nothing at all
 * happens on save-data connections (the switch stays hidden there). A visitor who left
 * it on finds it on again: by itself where the browser allows, else at their first click.
 *
 * All of it is Web Audio, with no media element: on phones that makes it ambient sound,
 * which mixes with the visitor's own music and keeps quiet when the ringer switch says
 * so. The audio session's type is left alone, so the videos keep playing the way they
 * always did.
 *
 *   music bed   one decoded buffer, looped by crossfading two sources over it
 *   effects     what the guide does, heard: one-shots (play), and the jetpack's loop,
 *               which follows its thrust (jet); all from where it is on the page (place)
 *   buses       music, amb, ui -> duck -> tone -> master -> limiter -> out
 *               (guide joins at tone: its effects are not ducked)
 *   duck        steps aside while a case or welcome video plays with sound
 *   tone        a low-pass that opens as the sound comes on, like headphones going on
 *
 * The rest of the page talks to it through window.abissalAudio and hears about its
 * state in the "abissal:sound" event on document (detail: { state, on }).
 */
(function () {
  'use strict';

  const doc = document.documentElement;
  const btn = document.getElementById('sound-toggle');
  const AC = window.AudioContext || window.webkitAudioContext;
  // (the page's head decides whether there is a switch at all, and keeps its place in
  // the bar before this file runs: html.snd)
  const able = doc.classList.contains('snd');

  const SOUND = {
    // (gain: the file sits near -14 LUFS, and the bed belongs some 10 dB under that;
    // xfade: seconds of crossfade at the loop)
    bed: { src: 'assets/audio/bed.mp3', gain: 0.3, xfade: 4 },
    // Effects: one file each, <dir><id>.mp3, all levelled to the same peak, so gain is
    // its place in the mix.
    //   cool   the least time between two of it (s): a scroll held on an edge, or a quick
    //          hand on the guide, never makes a machine gun of one
    //   vary   how far its pitch and level stray each time (a share of each)
    //   voice  the guide's own voice: one phrase at a time, the next cuts the last short
    //   edge   heard as the sound itself comes on or goes off (the headphones), so it
    //          does not pass through the master fade
    //   file   another name for its file, when ids share one (the voice's phrases)
    // (an id the page asks for that is not listed here is simply not heard)
    dir: 'assets/audio/',
    fx: {
      'jet-ignite': { gain: 0.4, cool: 0.6 },
      'jet-burst': { gain: 0.4, cool: 0.9 },
      'fly-by': { gain: 0.38, cool: 1.5 },
      footstep: { gain: 0.16, cool: 0.07, vary: 0.08 }, // (its run comes down on two feet close together)
      dissolve: { gain: 0.36, cool: 0.8 },
      reform: { gain: 0.36, cool: 0.8 },
      'portal-in': { gain: 0.38, cool: 0.3 },
      'stunt-impact': { gain: 0.52, cool: 1 },
      transmit: { gain: 0.42, cool: 1 },
      'card-tug': { gain: 0.3, cool: 0.2, vary: 0.05 },
      takeoff: { gain: 0.36, cool: 0.8 },
      land: { gain: 0.34, cool: 0.4 },
      'portal-out': { gain: 0.38, cool: 0.3 },
      'jet-off': { gain: 0.4, cool: 0.6 },
      'phones-gather': { gain: 0.3, cool: 0.5, edge: true },
      'phones-clamp': { gain: 0.3, cool: 0.5, edge: true },
      'phones-away': { gain: 0.3, cool: 0.5, edge: true },
      // The voice: one take, cut into its phrases (voice-1 to voice-5), so it is the
      // same robot in every mood. 1 hello, up and back down; 2 a step down, held (sad);
      // 3 a little tune; 4 an excited jumble; 5 one even note
      'chirp-wave': { file: 'voice-1', gain: 0.38, cool: 0.4, voice: true },
      'chirp-yes': { file: 'voice-5', gain: 0.38, cool: 0.4, voice: true },
      'chirp-thumbs': { file: 'voice-5', gain: 0.38, cool: 0.4, voice: true },
      'chirp-no': { file: 'voice-2', gain: 0.38, cool: 0.4, voice: true },
      'chirp-jump': { file: 'voice-4', gain: 0.34, cool: 0.4, voice: true },
      'chirp-dance': { file: 'voice-3', gain: 0.36, cool: 0.4, voice: true },
      cheer: { file: 'voice-4', gain: 0.36, cool: 0.4, voice: true },
    },
    // The jetpack: a loop under the one-shots, as loud and as bright as the thrust
    // (lo, hi: where its low-pass sits with the jets barely lit and at full burn).
    jet: { id: 'jet-loop', gain: 0.34, xfade: 0.6, lo: 420, hi: 5200 },
  };
  const KEY = 'abissal_sound';
  const RATE = 44100; // the sample rate the audio files are made at
  const OPEN_HZ = 18000, SHUT_HZ = 320;
  const LABEL = { off: 'OFF', armed: 'CLIQUE', loading: '···', on: 'ON' };
  const HINT = { armed: 'O som volta no primeiro clique na página' }; // (the switch's tooltip)

  const store = {
    get(key) {
      try { return localStorage.getItem(key); } catch (e) { return null; }
    },
    set(key, value) {
      try { localStorage.setItem(key, value); } catch (e) { /* private mode */ }
    },
  };

  // off      nothing plays, nothing is loaded
  // armed    asked for on an earlier visit, and the browser will not let the page start
  //          it by itself (see autostart): it waits for the first click or tap
  // loading  switched on, the bed is on its way
  // on       audible
  let state = 'off';
  const label = btn ? btn.querySelector('.sound-state') : null;

  function setState(next) {
    if (next === state) return;
    state = next;
    doc.dataset.sound = next;
    if (btn) {
      btn.setAttribute('aria-pressed', next === 'on' || next === 'loading' ? 'true' : 'false');
      if (next === 'loading') btn.setAttribute('aria-busy', 'true');
      else btn.removeAttribute('aria-busy');
    }
    if (label) label.textContent = LABEL[next];
    if (btn) {
      if (HINT[next]) btn.title = HINT[next];
      else btn.removeAttribute('title');
    }
    document.dispatchEvent(new CustomEvent('abissal:sound', { detail: { state: next, on: next === 'on' } }));
  }

  // The page's way in. Safe to call whatever happens below: without Web Audio, or on a
  // save-data connection, it stays this inert shell.
  const api = {
    get state() { return state; },
    get on() { return state === 'on'; },
    toggle() {},
    enable() {},
    disable() {},
    level() { return 0; },
    play() { return false; }, // an effect by its id (see SOUND.fx)
    jet() {}, // the jetpack's thrust, 0 to 1 and a little over: told every frame
    place() {}, // where the guide is across the page (-1 to 1), and whether behind a card
  };
  window.abissalAudio = api;
  doc.dataset.sound = state;

  // The gate (html.gate, set in the head once per visit): with sound or without, asked
  // before anything moves. window.abissalGate settles once it has been answered and the
  // sound is as asked (on and its effects in, or off), so the guide waits on it and
  // comes in already as chosen. No gate: it is settled from the start.
  const gateEl = document.getElementById('sound-gate');
  let gateDone;
  window.abissalGate = new Promise((res) => { gateDone = res; });
  const gated = doc.classList.contains('gate') && !!gateEl;
  if (!gated || !AC || !btn || !able) {
    doc.classList.remove('gate');
    gateDone();
  }
  if (!AC || !btn || !able) return;

  // ---------------------------------------------------------------------------
  // The graph (built inside the first gesture, never before)
  // ---------------------------------------------------------------------------
  let ctx = null, master = null, tone = null, duck = null, analyser = null, levelBuf = null, limiter = null;
  let fxIn = null, fxPan = null, fxTone = null, edge = null, jetGain = null, jetTone = null;
  const buses = {};

  function graph() {
    if (ctx) return;
    // At the files' own rate, whatever the output device runs at: the decoded bed is
    // then no bigger than it has to be (a 96 kHz device would double it in memory).
    try { ctx = new AC({ latencyHint: 'interactive', sampleRate: RATE }); } catch (e) { ctx = new AC(); }
    limiter = ctx.createDynamicsCompressor(); // a ceiling for effects piling up over the music
    limiter.threshold.value = -6;
    limiter.knee.value = 6;
    limiter.ratio.value = 12;
    limiter.attack.value = 0.003;
    limiter.release.value = 0.25;
    master = ctx.createGain();
    master.gain.value = 0;
    tone = ctx.createBiquadFilter();
    tone.type = 'lowpass';
    tone.Q.value = 0.7;
    tone.frequency.value = SHUT_HZ;
    duck = ctx.createGain();
    duck.gain.value = ducked ? 0 : 1;
    for (const name of ['music', 'amb', 'guide', 'ui']) {
      buses[name] = ctx.createGain();
      // (the guide's effects go round the duck: the hit that opens a case, and its flight
      // out, would be cut off by the very video they start. While a scene is open the
      // page asks for none of them: see sfx in avatar-scene.js)
      buses[name].connect(name === 'guide' ? tone : duck);
    }
    buses.music.gain.value = SOUND.bed.gain;
    duck.connect(tone);
    tone.connect(master);
    master.connect(limiter);
    limiter.connect(ctx.destination);
    analyser = ctx.createAnalyser(); // how loud the music is right now (see level)
    analyser.fftSize = 256;
    levelBuf = new Float32Array(analyser.fftSize);
    buses.music.connect(analyser);
    // The guide's effects: panned to where it is, dulled when it is behind a card. The
    // jetpack's loop joins them through a gain and a low-pass of its own.
    fxTone = ctx.createBiquadFilter();
    fxTone.type = 'lowpass';
    fxTone.Q.value = 0.5;
    fxTone.frequency.value = OPEN_HZ;
    fxTone.connect(buses.guide);
    fxPan = ctx.createStereoPanner ? ctx.createStereoPanner() : null; // (none on an old Safari: straight ahead there)
    if (fxPan) fxPan.connect(fxTone);
    fxIn = fxPan || fxTone;
    jetGain = ctx.createGain();
    jetGain.gain.value = 0;
    jetTone = ctx.createBiquadFilter();
    jetTone.type = 'lowpass';
    jetTone.Q.value = 0.6;
    jetTone.frequency.value = SOUND.jet.lo;
    jetTone.connect(jetGain);
    jetGain.connect(fxIn);
    edge = ctx.createGain(); // (round the master fade: see SOUND.fx)
    edge.connect(limiter);
    ctx.addEventListener('statechange', onCtxState);
  }

  // Every move of a gain or of the filter is an exponential approach from wherever it
  // is: it can be redirected halfway (a quick off and on again) without a jump.
  function approach(param, value, tau) {
    const t = ctx.currentTime;
    param.cancelScheduledValues(t);
    param.setTargetAtTime(value, t, tau);
  }
  function open() {
    approach(master.gain, 1, 0.35);
    approach(tone.frequency, OPEN_HZ, 0.5);
  }
  function shut() {
    approach(tone.frequency, SHUT_HZ, 0.16);
    approach(master.gain, 0, 0.22);
  }

  // ---------------------------------------------------------------------------
  // A loop with no seam: two sources crossfading over one buffer. Each fades in over its
  // first seconds and out over its last (equal power), and the next one starts as the
  // fade-out begins. They chain off the audio clock ("ended"), not off timers.
  // ---------------------------------------------------------------------------
  const CURVE_N = 33;
  const FADE_IN = new Float32Array(CURVE_N), FADE_OUT = new Float32Array(CURVE_N);
  for (let i = 0; i < CURVE_N; i++) {
    const a = (i / (CURVE_N - 1)) * Math.PI * 0.5;
    FADE_IN[i] = Math.sin(a);
    FADE_OUT[i] = Math.cos(a);
  }

  // (out: the node it plays into, asked for when it starts: the graph is built late)
  function looper(out) {
    let list = [], run = 0; // (a stopped loop's "ended" events schedule nothing)
    function voice(buffer, X, at) {
      const D = buffer.duration;
      const src = ctx.createBufferSource();
      const g = ctx.createGain();
      src.buffer = buffer;
      g.gain.value = 0;
      g.gain.setValueCurveAtTime(FADE_IN, at, X);
      g.gain.setValueCurveAtTime(FADE_OUT, at + D - X, X);
      src.connect(g);
      g.connect(out());
      src.start(at);
      const v = { src, g }, mine = run;
      list.push(v);
      src.onended = () => {
        g.disconnect();
        list = list.filter((o) => o !== v);
        if (mine !== run) return;
        // (the one after it is already playing: line up the one after that. Told too late
        // for that, the page having stood still for longer than the lead: start afresh)
        const next = at + 2 * (D - X);
        if (next < ctx.currentTime + 0.02) {
          stop();
          start(buffer, X);
        } else voice(buffer, X, next);
      };
    }
    function start(buffer, xfade) {
      if (list.length) return; // (asked again before the last ones were let go)
      const X = Math.min(xfade, buffer.duration / 3);
      const t0 = ctx.currentTime + 0.06;
      voice(buffer, X, t0);
      voice(buffer, X, t0 + buffer.duration - X);
    }
    function stop() {
      run++;
      for (const v of list) {
        v.src.onended = null;
        try { v.src.stop(); } catch (e) { /* not started yet */ }
        v.g.disconnect();
      }
      list = [];
    }
    return { start, stop, get n() { return list.length; } };
  }

  // ---------------------------------------------------------------------------
  // The music bed
  // ---------------------------------------------------------------------------
  let bed = null; // the decoded buffer
  let bedBytes = null, bedLoad = null; // in flight: the file, and the file decoded
  const music = looper(() => buses.music);

  function fetchBed() {
    if (bed) return Promise.resolve(); // (already here and decoded: nothing to warm up)
    if (!bedBytes) {
      bedBytes = fetch(SOUND.bed.src).then((r) => {
        if (!r.ok) throw new Error('bed: HTTP ' + r.status);
        return r.arrayBuffer();
      });
      bedBytes.catch(() => { bedBytes = null; }); // (another try at the next switch-on)
    }
    return bedBytes;
  }
  function decode(bytes) {
    return new Promise((res, rej) => {
      const p = ctx.decodeAudioData(bytes, res, rej);
      if (p && p.catch) p.catch(rej);
    });
  }
  function loadBed() {
    if (bed) return Promise.resolve(bed);
    if (!bedLoad) {
      bedLoad = fetchBed().then(decode).then((buffer) => {
        bed = buffer;
        bedBytes = bedLoad = null;
        return buffer;
      });
      bedLoad.catch(() => { bedBytes = bedLoad = null; });
    }
    return bedLoad;
  }
  const startMusic = () => music.start(bed, SOUND.bed.xfade);
  const stopMusic = () => music.stop();

  // ---------------------------------------------------------------------------
  // Effects. Their files come once the sound is on (the headphones' own a little sooner,
  // with the bed: they are heard as it comes on); until one is here, asking for it does
  // nothing.
  // ---------------------------------------------------------------------------
  const fx = {}; // id -> its decoded buffer
  const fxLoad = {}; // id -> the load in flight (or done)
  const late = {}; // an edge effect asked for before its file was here: when (ms)
  const LATE_MS = 500; // (how long after the ask it is still worth playing)
  function loadFx(id) {
    if (!fxLoad[id]) {
      const def = SOUND.fx[id];
      fxLoad[id] = fetch(SOUND.dir + ((def && def.file) || id) + '.mp3')
        .then((r) => {
          if (!r.ok) throw new Error(id + ': HTTP ' + r.status);
          return r.arrayBuffer();
        })
        .then(decode)
        .then((buffer) => {
          fx[id] = buffer;
          replayLate();
        });
      fxLoad[id].catch((err) => {
        console.warn('[sound] effect not loaded:', err);
        fxLoad[id] = null; // (another try at the next switch-on)
      });
    }
    return fxLoad[id];
  }
  // What was asked for a moment too soon (its file on the way, or the context not
  // running yet) is heard now, if it is still worth it.
  function replayLate() {
    if (!ctx || ctx.state !== 'running') return;
    const now = performance.now();
    for (const id of Object.keys(late)) {
      if (!late[id] || !fx[id]) continue;
      const fresh = now - late[id] < LATE_MS;
      late[id] = 0;
      if (fresh) play(id);
    }
  }
  function forgetLate() {
    for (const id of Object.keys(late)) late[id] = 0;
  }
  function loadEffects(edgeOnly) {
    for (const id of Object.keys(SOUND.fx)) if (!edgeOnly || SOUND.fx[id].edge) loadFx(id);
    if (!edgeOnly) loadFx(SOUND.jet.id);
  }

  const live = []; // the one-shots sounding now
  const lastAt = {}; // id (or 'voice') -> when it last started, on the audio clock
  const MAX_LIVE = 10;
  function letGo(one, t) { // early, and without a click
    one.g.gain.cancelScheduledValues(t);
    one.g.gain.setTargetAtTime(0, t, 0.015);
    try { one.src.stop(t + 0.09); } catch (e) { /* already stopped */ }
  }
  // An effect, by its id. opt: { gain, rate } on top of its own. True if it was heard.
  function play(id, opt) {
    const def = SOUND.fx[id];
    if (!def || !ctx || document.hidden) return false;
    if (def.edge ? state === 'armed' : state !== 'on') return false;
    const buffer = fx[id];
    if (!buffer || ctx.state !== 'running') {
      // (the switch only just thrown: its file on the way, or the context not running
      // yet. Heard a moment late, if that comes in time: see replayLate)
      if (def.edge) {
        late[id] = performance.now();
        if (!buffer) loadFx(id);
      }
      return false;
    }
    const t = ctx.currentTime, key = def.voice ? 'voice' : id;
    if (lastAt[key] != null && t - lastAt[key] < (def.cool || 0.06)) return false;
    lastAt[key] = t;
    if (def.voice) for (const o of live) if (o.voice) letGo(o, t);
    if (live.length >= MAX_LIVE) letGo(live.shift(), t);
    const v = def.vary || 0;
    const src = ctx.createBufferSource();
    const g = ctx.createGain();
    src.buffer = buffer;
    src.playbackRate.value = ((opt && opt.rate) || 1) * (1 + (Math.random() * 2 - 1) * v);
    g.gain.value = def.gain * (opt && opt.gain != null ? opt.gain : 1) * (1 - Math.random() * 2 * v);
    src.connect(g);
    g.connect(def.edge ? edge : fxIn);
    src.start(t);
    const one = { src, g, voice: !!def.voice };
    live.push(one);
    src.onended = () => {
      g.disconnect();
      const i = live.indexOf(one);
      if (i >= 0) live.splice(i, 1);
    };
    return true;
  }

  // The jetpack: its loop runs while there is thrust, behind a gain and a low-pass that
  // follow it. Told every frame by the page; should the telling stop (the page asleep),
  // the loop dies away by itself.
  const jetLoop = looper(() => jetTone);
  let jetV = 0, jetAt = -1;
  function jet(v) {
    const J = SOUND.jet, buffer = fx[J.id];
    if (state !== 'on' || !ctx || !buffer) return;
    v = Math.max(0, Math.min(1.5, +v || 0));
    const t = ctx.currentTime;
    if (v < 0.02 && jetV < 0.02) { // (off, and said so already: the loop is let go after a while)
      if (jetLoop.n && t - jetAt > 1.5) jetLoop.stop();
      return;
    }
    if (t - jetAt < 0.04 || (Math.abs(v - jetV) < 0.02 && t - jetAt < 0.12)) return;
    jetV = v;
    jetAt = t;
    if (v >= 0.02 && !jetLoop.n) jetLoop.start(buffer, J.xfade);
    const k = Math.min(1, v);
    jetGain.gain.cancelScheduledValues(t);
    jetGain.gain.setTargetAtTime(J.gain * Math.pow(k, 1.3) * (1 + 0.3 * (v - k)), t, 0.07);
    jetGain.gain.setTargetAtTime(0, t + 0.5, 0.12);
    jetTone.frequency.cancelScheduledValues(t);
    jetTone.frequency.setTargetAtTime(J.lo + (J.hi - J.lo) * k * k, t, 0.09);
  }

  // Where the guide is across the page (-1 left, 1 right) and whether it is behind a
  // card: its effects come from there, never hard to one side.
  let panNow = 0, hidNow = 0;
  function place(pan, hidden) {
    if (state !== 'on' || !ctx) return;
    pan = Math.max(-1, Math.min(1, +pan || 0)) * 0.6;
    const hid = hidden ? 1 : 0;
    if (Math.abs(pan - panNow) < 0.02 && hid === hidNow) return;
    panNow = pan;
    hidNow = hid;
    if (fxPan) approach(fxPan.pan, pan, 0.08);
    approach(fxTone.frequency, hid ? 900 : OPEN_HZ, 0.1);
  }

  // Everything of the guide's let go at once (the sound going to sleep: nothing is left
  // hanging to sound on when it wakes).
  function stopEffects() {
    jetLoop.stop();
    jetV = 0;
    if (jetGain) {
      jetGain.gain.cancelScheduledValues(0);
      jetGain.gain.value = 0;
    }
    for (const one of live.splice(0)) {
      one.src.onended = null;
      try { one.src.stop(); } catch (e) { /* already stopped */ }
      one.g.disconnect();
    }
  }

  // ---------------------------------------------------------------------------
  // On and off
  // ---------------------------------------------------------------------------
  let want = 0; // a switch-on overtaken by a switch-off (or by another on) gives up
  let restT = 0;
  const REST_MS = 1600; // (the fade, and the headphones' last sound round it)
  const within = (p, ms) => Promise.race([p, new Promise((r) => setTimeout(r, ms))]);

  function enable() {
    if (state === 'on' || state === 'loading') return;
    disarm();
    clearTimeout(restT);
    store.set(KEY, '1');
    graph();
    // The context has to be asked to run right here, inside the click; the file can
    // come afterwards (a running context needs no further gesture). Asked whatever its
    // state reads: a suspend of ours still on its way is then followed by this.
    const running = ctx.resume();
    setState('loading');
    loadEffects(true);
    const mine = ++want;
    Promise.all([within(running, 3000), loadBed()]).then(() => {
      if (mine !== want || state !== 'loading') return;
      if (ctx.state !== 'running') {
        // not allowed to start from here (no gesture behind this call): the next click
        // will. Or only slow to start (an output still waking up): then as soon as it has.
        setState('armed');
        arm();
        running.then(() => { if (mine === want && state === 'armed') enable(); }, () => {});
        return;
      }
      startMusic();
      open();
      setState('on');
      loadEffects(false);
      if (document.hidden) hush();
    }).catch((err) => {
      console.warn('[sound] not started:', err);
      if (mine === want && state === 'loading') {
        setState('off');
        rest();
      }
    });
  }

  function disable() {
    want++;
    disarm();
    forgetLate();
    store.set(KEY, '0');
    if (state === 'off') return;
    const was = state;
    setState('off');
    if (!ctx) return;
    clearTimeout(restT);
    if (was === 'on') {
      shut();
      restT = setTimeout(rest, REST_MS); // (once the fade is through)
    } else rest();
  }
  // Off for good: the sources are let go and the context put to sleep.
  function rest() {
    if (state !== 'off' || !ctx) return;
    stopMusic();
    stopEffects();
    // (asked for whatever its state: a resume still on its way from a switch-on taken
    // back at once is then followed by this, instead of leaving it running)
    ctx.suspend().catch(() => {});
  }

  function toggle() {
    if (state === 'on' || state === 'loading') disable();
    else enable();
  }

  // Armed: the first click or tap anywhere on the page starts it. Never a key press:
  // someone finding their way round with the keyboard (and a screen reader talking)
  // gets sound only from the switch itself.
  let armed = false;
  function arm() {
    if (armed) return;
    armed = true;
    document.addEventListener('click', onFirstClick, true);
  }
  function disarm() {
    if (!armed) return;
    armed = false;
    document.removeEventListener('click', onFirstClick, true);
  }
  function onFirstClick(e) {
    if (btn.contains(e.target)) return; // (the switch answers for its own clicks)
    // a click made with the keyboard, or by a script (each browser tells it its own way)
    if (e.detail === 0 || e.pointerType === '' || e.mozInputSource === 6 || e.mozInputSource === 0) return;
    enable();
  }

  // Left on at an earlier visit: the browser may let this page start it by itself (it
  // knows the visitor has been using the site: a reload, mostly). Asked quietly, the
  // switch still reading armed: a context that runs before any gesture is that leave, and
  // the sound simply comes back. One that only starts at a later gesture is put back to
  // sleep: a click starts the sound by its own road (onFirstClick), and a key press is
  // not to.
  function autostart() {
    if (state !== 'armed') return;
    graph();
    const t0 = performance.now();
    ctx.resume().then(() => {
      if (state !== 'armed' || ctx.state !== 'running') return;
      const ua = navigator.userActivation;
      if (ua ? !ua.hasBeenActive : performance.now() - t0 < 3000) enable();
      else ctx.suspend().catch(() => {});
    }, () => {});
  }

  // ---------------------------------------------------------------------------
  // Videos: the cases and the welcome have sound of their own. While one plays out
  // loud the music steps aside, and comes back a moment after it stops (a seek or a
  // quick pause doesn't pump it in and out). The guide's effects are not ducked: the
  // page asks for none while a scene is open.
  // ---------------------------------------------------------------------------
  const videos = Array.from(document.querySelectorAll('dialog.scene video'));
  let ducked = false, duckT = 0;
  const loud = (v) => !v.paused && !v.ended && !v.muted && v.volume > 0;
  function setDuck(v) {
    ducked = v;
    if (ctx) approach(duck.gain, v ? 0 : 1, v ? 0.07 : 0.5);
  }
  function reduck() {
    const playing = videos.some(loud);
    clearTimeout(duckT);
    if (playing) { if (!ducked) setDuck(true); }
    else if (ducked) duckT = setTimeout(() => setDuck(false), 600);
  }
  for (const v of videos) {
    for (const type of ['play', 'playing', 'pause', 'ended', 'emptied', 'volumechange']) v.addEventListener(type, reduck);
  }

  // ---------------------------------------------------------------------------
  // The tab going away and coming back, and the system taking the output from us
  // ---------------------------------------------------------------------------
  let hushT = 0;
  function hush() {
    if (!ctx || state !== 'on') return;
    approach(master.gain, 0, 0.03);
    clearTimeout(hushT);
    hushT = setTimeout(() => {
      if (!document.hidden || state !== 'on') return;
      stopEffects();
      if (ctx.state === 'running') ctx.suspend();
    }, 160);
  }
  function unhush() {
    clearTimeout(hushT);
    if (!ctx || state !== 'on') return;
    const up = () => { if (state === 'on' && !document.hidden) approach(master.gain, 1, 0.25); };
    // (frozen by the system before the timer above could let them go, a phone taking the
    // output away: no tail of an old effect sounds on as it wakes)
    if (ctx.state !== 'running') stopEffects();
    ctx.resume().then(up, () => {}); // (whatever its state reads: see enable)
  }
  document.addEventListener('visibilitychange', () => (document.hidden ? hush() : unhush()));
  window.addEventListener('pagehide', hush);
  window.addEventListener('pageshow', (e) => { if (e.persisted && !document.hidden) unhush(); });

  // Interrupted (a call, another app) or put to sleep under us while the page is in
  // view: it comes back by itself, or else at the visitor's next click.
  function onCtxState() {
    replayLate();
    if (state !== 'on' || document.hidden) return;
    if (ctx.state === 'running') approach(master.gain, 1, 0.25);
    else document.addEventListener('click', revive, { capture: true, once: true });
  }
  function revive() {
    if (state === 'on' && ctx.state !== 'running') ctx.resume().catch(() => {});
  }

  // How loud the music is right now, 0 to 1 (for whatever wants to move with it).
  function level() {
    if (!analyser || state !== 'on' || !analyser.getFloatTimeDomainData) return 0; // (no such reader on an old Safari)
    analyser.getFloatTimeDomainData(levelBuf);
    let sum = 0;
    for (let i = 0; i < levelBuf.length; i++) sum += levelBuf[i] * levelBuf[i];
    return Math.min(1, Math.sqrt(sum / levelBuf.length) * 4);
  }

  // ---------------------------------------------------------------------------
  // Go
  // ---------------------------------------------------------------------------
  api.toggle = toggle;
  api.enable = enable;
  api.disable = disable;
  api.level = level;
  api.play = play;
  api.jet = jet;
  api.place = place;

  btn.hidden = false;
  btn.addEventListener('click', toggle);
  // (the pointer on the switch: the file sets off, so the click finds it on its way)
  btn.addEventListener('pointerenter', (e) => { if (e.pointerType === 'mouse') fetchBed().catch(() => {}); }, { once: true });

  // ---------------------------------------------------------------------------
  // The gate: the visitor's answer is the gesture the browser wants, so "with sound"
  // starts it right there, and the gate waits (a little, never long) for the bed and the
  // guide's effects, so its entrance is heard from the first ignition.
  // ---------------------------------------------------------------------------
  const GATE_KEY = 'abissal_gate';
  const GATE_WAIT_MS = 4000; // (a slow line: the gate lifts anyway, and the sound catches up)
  const GATE_OUT_MS = 700; // (its fade: see .sound-gate in style.css)
  function runGate() {
    const onBtn = gateEl.querySelector('[data-gate="on"]');
    const offBtn = gateEl.querySelector('[data-gate="off"]');
    const label = onBtn.querySelector('.gate-label');
    const behind = Array.from(document.querySelectorAll('body > header, body > main, body > .skip-link'));
    for (const el of behind) el.inert = true;
    gateEl.hidden = false;
    let answered = false;

    function lift() {
      try { sessionStorage.setItem(GATE_KEY, '1'); } catch (e) { /* private mode */ }
      for (const el of behind) el.inert = false;
      gateEl.classList.add('is-leaving');
      doc.classList.remove('gate'); // (the page's own entrance plays as the gate fades)
      document.removeEventListener('keydown', onKey);
      gateDone();
      setTimeout(() => { gateEl.hidden = true; }, GATE_OUT_MS);
    }
    // on, with the guide's effects in: or as far as it got in the time allowed
    function settled() {
      return new Promise((res) => {
        const t = setTimeout(res, GATE_WAIT_MS);
        const done = () => { clearTimeout(t); res(); };
        const check = () => {
          if (state === 'loading') return;
          document.removeEventListener('abissal:sound', check);
          if (state !== 'on') return done(); // (off, or armed: not to be had right now)
          loadEffects(false);
          Promise.all(Object.values(fxLoad).map((p) => p && p.catch(() => {}))).then(done);
        };
        document.addEventListener('abissal:sound', check);
        check();
      });
    }
    function answer(on) {
      if (answered) return;
      answered = true;
      onBtn.disabled = offBtn.disabled = true;
      if (!on) {
        disable();
        lift();
        return;
      }
      onBtn.setAttribute('aria-busy', 'true');
      label.textContent = 'Afinando…';
      enable(); // (inside the click: the browser lets it start)
      loadEffects(false);
      settled().then(lift);
    }
    function onKey(e) {
      if (e.key === 'Escape') { e.preventDefault(); answer(false); }
    }
    onBtn.addEventListener('click', () => answer(true));
    offBtn.addEventListener('click', () => answer(false));
    document.addEventListener('keydown', onKey);
    // (the bed sets off at once: most of it is here by the time the visitor has read)
    fetchBed().catch(() => {});
    (store.get(KEY) === '0' ? offBtn : onBtn).focus({ preventScroll: true });
  }

  if (gated) runGate();
  else if (store.get(KEY) === '1') {
    setState('armed');
    arm();
    // (by itself, where it may: tried once the page is in view)
    if (!document.hidden) autostart();
    else {
      const shown = () => {
        if (document.hidden) return;
        document.removeEventListener('visibilitychange', shown);
        autostart();
      };
      document.addEventListener('visibilitychange', shown);
    }
    const warm = () => fetchBed().catch(() => {});
    if ('requestIdleCallback' in window) requestIdleCallback(warm, { timeout: 4000 });
    else setTimeout(warm, 1500);
  }

  // Debug/QA handle (harmless in production)
  window.__sound = {
    get ctx() { return ctx; },
    get master() { return master; },
    get tone() { return tone; },
    get duck() { return duck; },
    get limiter() { return limiter; },
    get voices() { return music.n; },
    get ducked() { return ducked; },
    get effects() { return { loaded: Object.keys(fx), live: live.length, jet: { v: jetV, voices: jetLoop.n }, pan: panNow, hidden: hidNow }; },
    buses,
    table: SOUND,
  };
})();
