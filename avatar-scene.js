/**
 * Leonardo de Oliveira · Abissal
 * avatar-scene.js: the guide. A small 3D character that lives in the particle sea,
 * follows the visitor with its eyes, reacts to scroll and clicks, and moves between
 * the sections by dissolving into motes and re-forming where the reader is.
 *
 * Proof of concept: the model is a CC0 placeholder (RobotExpressive by Tomás Laulhé)
 * that will be swapped for Léo's own avatar. Everything that depends on the model
 * lives in MODEL and CLIPS below.
 *
 * Loaded lazily by avatar.js once the page is idle, so it never competes with the
 * first paint or the sea's intro.
 */
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const MODEL = {
  url: 'assets/avatar/placeholder-robot.glb',
  // Abissal palette: trench-blue shell, steel-blue joints, softly glowing teal eyes.
  palette: {
    Main: { color: 0x1b2b44, metal: 0.5, rough: 0.38 },
    Grey: { color: 0x3d5a78, metal: 0.4, rough: 0.42 },
    Black: { color: 0x050810, emissive: 0x63e6d2, glow: 0.6 },
  },
  headBone: 'Head',
  neckBone: 'Neck',
  face: { mesh: 'Head', surprised: 'Surprised', sad: 'Sad' },
  // Shins that dangle over the card edge while seated (knee bend + idle swing)
  shins: ['LowerLeg.L', 'LowerLeg.R'],
};

const CLIPS = {
  idle: 'Idle',
  sit: 'Sitting',
  wave: 'Wave',
  yes: 'Yes',
  no: 'No',
  thumbs: 'ThumbsUp',
  jump: 'Jump',
  dance: 'Dance',
};

// What the guide does in each section of the page.
const SECTIONS = {
  inicio: { base: 'idle', greet: 'wave', float: true },
  historia: { base: 'idle', greet: 'yes', float: true },
  projetos: { base: 'sit', greet: 'thumbs', float: false },
  contato: { base: 'idle', greet: 'wave', float: true },
};

const TEAL = new THREE.Color(0x63e6d2);
const AMBER = new THREE.Color(0xffb35c);

const N_TRANSIT = 720;
const N_BURST = 120;
const N_MOTE = 36;
const N_ALL = N_TRANSIT + N_BURST + N_MOTE;

const CAM_Z = 20;
const RIM_STRENGTH = '0.5'; // teal fresnel rim (GLSL literal)
const SEAT_KNEE = 1.2; // radians the shins fold down from the sitting pose
const SEAT_DROP = 0.2; // how far below the card edge the feet origin sits (x height)
const FOV = 30;

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const clamp01 = (v) => clamp(v, 0, 1);
const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const damp = (k, dt) => 1 - Math.exp(-k * dt);

export async function start({ reduced = false } = {}) {
  const doc = document.documentElement;
  const $ = (sel, root) => (root || document).querySelector(sel);
  const $$ = (sel, root) => Array.from((root || document).querySelectorAll(sel));
  const mqDock = matchMedia('(max-width: 1024px)');

  // ---------------------------------------------------------------------------
  // DOM: one transparent canvas (never takes clicks) + one button over the body
  // ---------------------------------------------------------------------------
  const canvas = document.createElement('canvas');
  canvas.className = 'avatar-stage';
  canvas.setAttribute('aria-hidden', 'true');
  const hit = document.createElement('button');
  hit.type = 'button';
  hit.className = 'avatar-hit';
  hit.setAttribute('aria-label', 'Interagir com o guia do site');
  document.body.append(canvas, hit);

  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({
      canvas,
      alpha: true,
      antialias: (window.devicePixelRatio || 1) < 2,
      powerPreference: 'high-performance',
      failIfMajorPerformanceCaveat: true,
    });
  } catch (err) {
    canvas.remove();
    hit.remove();
    return null;
  }
  renderer.setClearColor(0x000000, 0);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(FOV, 1, 1, 60);
  camera.position.set(0, 0, CAM_Z);

  // Deep-sea light: dim blue fill, warm key from the reader, strong teal rim from behind.
  scene.add(new THREE.HemisphereLight(0x2d8da4, 0x050810, 1.1));
  const key = new THREE.DirectionalLight(0xdbe8f4, 1.8);
  key.position.set(3, 4, 8);
  scene.add(key);
  const rimLight = new THREE.DirectionalLight(0x63e6d2, 3.2);
  rimLight.position.set(-4, 3, -6);
  scene.add(rimLight);

  // ---------------------------------------------------------------------------
  // Model
  // ---------------------------------------------------------------------------
  const gltf = await new GLTFLoader().loadAsync(MODEL.url);
  const model = gltf.scene;
  const root = new THREE.Group(); // feet at the origin, scaled to pixels
  const pivot = new THREE.Group(); // float, lean and turn
  pivot.add(model);
  root.add(pivot);
  scene.add(root);

  // Amber lantern at the guide's feet: the human light in the sea of agents.
  const lantern = new THREE.PointLight(0xffb35c, 0, 0, 1.4);
  root.add(lantern);

  const shared = {
    uDissolve: { value: 1 },
    uTime: { value: 0 },
    uNoiseScale: { value: 1 },
    uHeight: { value: 1 },
    uInvRoot: { value: new THREE.Matrix4() },
    uRim: { value: TEAL.clone() },
    uEdge: { value: AMBER.clone() },
  };
  const meshes = [];
  let faceMesh = null;
  let headBone = null;
  let neckBone = null;
  const shins = [];
  model.traverse((o) => {
    if (o.isBone && MODEL.shins.includes(o.name) && !shins.some((b) => b.name === o.name)) shins.push(o);
    if (o.isBone && o.name === MODEL.headBone && !headBone) headBone = o;
    if (o.isBone && o.name === MODEL.neckBone && !neckBone) neckBone = o;
    if (!o.isMesh) return;
    o.frustumCulled = false;
    o.material = abyssalize(o.material, shared);
    meshes.push(o);
    if (o.name === MODEL.face.mesh && o.morphTargetDictionary) faceMesh = o;
  });

  const restPose = [headBone, neckBone, ...shins].filter(Boolean).map((bone) => ({ bone, q: bone.quaternion.clone() }));

  // Measure the model once to map "pixels tall" to a scale.
  model.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(model);
  const size = box.getSize(new THREE.Vector3());
  const modelH = size.y || 1;
  model.position.y = -box.min.y;
  shared.uNoiseScale.value = 7 / modelH;
  shared.uHeight.value = modelH;

  // Animation
  const mixer = new THREE.AnimationMixer(model);
  const actions = {};
  for (const [k, name] of Object.entries(CLIPS)) {
    const clip = THREE.AnimationClip.findByName(gltf.animations, name);
    if (clip) actions[k] = mixer.clipAction(clip);
  }
  let current = null;
  let baseName = 'idle';
  let oneShot = false;

  function fadeTo(name, dur, once) {
    const next = actions[name];
    if (!next) return;
    if (next === current && !once) return;
    next.reset();
    next.enabled = true;
    next.setEffectiveTimeScale(1);
    next.setEffectiveWeight(1);
    const holdLast = once || name === 'sit'; // "Sitting" is a sit-down move: hold its last frame
    next.setLoop(holdLast ? THREE.LoopOnce : THREE.LoopRepeat, Infinity);
    next.clampWhenFinished = holdLast;
    next.play();
    if (current && current !== next) current.crossFadeTo(next, dur, false);
    current = next;
    oneShot = !!once;
  }
  function setBase(name) {
    baseName = name;
    if (!oneShot) fadeTo(name, 0.4);
  }
  function react(name) {
    if (reduced || !actions[name]) return;
    fadeTo(name, 0.2, true);
  }
  mixer.addEventListener('finished', (e) => {
    if (oneShot && e.action === current) {
      oneShot = false;
      fadeTo(baseName, 0.35);
    }
  });

  // Facial morphs (decay back to neutral)
  const face = { surprised: 0, sad: 0 };
  function setFace(k, v) {
    face[k] = Math.max(face[k], v);
  }

  // ---------------------------------------------------------------------------
  // Particles: transit motes, click bursts and the lantern's orbiting motes
  // ---------------------------------------------------------------------------
  const pGeo = new THREE.BufferGeometry();
  const pPos = new Float32Array(N_ALL * 3);
  const pAlpha = new Float32Array(N_ALL);
  const pSize = new Float32Array(N_ALL);
  const pTone = new Float32Array(N_ALL);
  for (let i = 0; i < N_ALL; i++) {
    pTone[i] = Math.random() < 0.72 ? 1 : 0; // mostly amber, some teal
    pSize[i] = 3.5 + Math.random() * 5.5;
  }
  pGeo.setAttribute('position', new THREE.BufferAttribute(pPos, 3).setUsage(THREE.DynamicDrawUsage));
  pGeo.setAttribute('aAlpha', new THREE.BufferAttribute(pAlpha, 1).setUsage(THREE.DynamicDrawUsage));
  pGeo.setAttribute('aSize', new THREE.BufferAttribute(pSize, 1));
  pGeo.setAttribute('aTone', new THREE.BufferAttribute(pTone, 1));
  const pMat = new THREE.ShaderMaterial({
    uniforms: { uPx: { value: 1 }, uScale: { value: 1 }, uAmber: { value: AMBER }, uTeal: { value: TEAL } },
    vertexShader: /* glsl */ `
      attribute float aAlpha; attribute float aSize; attribute float aTone;
      uniform float uPx; uniform float uScale;
      varying float vAlpha; varying float vTone;
      void main() {
        vAlpha = aAlpha; vTone = aTone;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        gl_PointSize = aAlpha > 0.002 ? aSize * uScale * uPx : 0.0;
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uAmber; uniform vec3 uTeal;
      varying float vAlpha; varying float vTone;
      void main() {
        float d = length(gl_PointCoord - 0.5);
        float a = smoothstep(0.5, 0.0, d);
        a = a * a * vAlpha;
        if (a < 0.004) discard;
        vec3 c = mix(uTeal, uAmber, vTone) * (1.0 + smoothstep(0.18, 0.0, d));
        gl_FragColor = vec4(min(c, vec3(1.0)) * a, a);
      }`,
    transparent: true,
    depthWrite: false,
    depthTest: false,
    blending: THREE.AdditiveBlending,
  });
  const points = new THREE.Points(pGeo, pMat);
  points.frustumCulled = false;
  points.renderOrder = 2;
  scene.add(points);

  // Transit state (sampled from the skinned surface, so motes leave from the body)
  const tStart = new Float32Array(N_TRANSIT * 3);
  const tRel = new Float32Array(N_TRANSIT * 3); // position relative to the root, in model units
  const tCtrl = new Float32Array(N_TRANSIT * 3);
  const tDelay = new Float32Array(N_TRANSIT);
  const burst = { t: -1, vel: new Float32Array(N_BURST * 3), life: new Float32Array(N_BURST) };
  const motePhase = new Float32Array(N_MOTE * 3);
  for (let i = 0; i < N_MOTE; i++) {
    motePhase[i * 3] = Math.random() * Math.PI * 2;
    motePhase[i * 3 + 1] = 0.25 + Math.random() * 0.6; // speed
    motePhase[i * 3 + 2] = Math.random(); // height
  }

  const dbg = { noLook: false, timeScale: 1 };
  const v3 = new THREE.Vector3();
  function sampleSurface(intoWorld, intoRel) {
    root.updateMatrixWorld(true);
    const inv = new THREE.Matrix4().copy(root.matrixWorld).invert();
    for (let i = 0; i < N_TRANSIT; i++) {
      const m = meshes[(Math.random() * meshes.length) | 0];
      const count = m.geometry.attributes.position.count;
      m.getVertexPosition((Math.random() * count) | 0, v3);
      m.localToWorld(v3);
      if (intoWorld) {
        intoWorld[i * 3] = v3.x;
        intoWorld[i * 3 + 1] = v3.y;
        intoWorld[i * 3 + 2] = v3.z;
      }
      v3.applyMatrix4(inv);
      intoRel[i * 3] = v3.x;
      intoRel[i * 3 + 1] = v3.y;
      intoRel[i * 3 + 2] = v3.z;
    }
  }

  // ---------------------------------------------------------------------------
  // Layout: where the guide stands in each section (CSS px, feet point)
  // ---------------------------------------------------------------------------
  const view = { w: 1, h: 1, dpr: 1, wpp: 1, dock: mqDock.matches };
  const nodes = {
    rail: $('#story-rail'),
    terminal: $('#terminal'),
    projectCards: $$('.project-card'),
    projects: $$('.project'),
    deck: $('#deck'),
  };

  // Contact shadow + lantern spill on the card's top edge. It lives inside the
  // card's own 3D transform, so it tilts and recedes with the deck for free.
  const seatMark = document.createElement('span');
  seatMark.className = 'avatar-seat';
  seatMark.setAttribute('aria-hidden', 'true');
  let seatHost = null;

  // The card in front of the deck, read from the transform app.js writes:
  // translate3d(x, 0, z) rotateY(ry) scale(s), inside the deck's perspective.
  const DECK_RE = /translate3d\(([-\d.]+)px,\s*0(?:px)?,\s*([-\d.]+)px\)\s*rotateY\(([-\d.]+)deg\)\s*scale\(([\d.]+)\)/;
  const SEAT_U = 0.3; // seat at 80% of the card's width (0.3 right of centre)
  function deckSeat() {
    if (!nodes.deck) return null;
    let best = null;
    for (const node of nodes.projects) {
      const m = DECK_RE.exec(node.style.transform || '');
      if (!m) continue;
      const t = { node, x: +m[1], z: +m[2], ry: (+m[3] * Math.PI) / 180, s: +m[4] };
      if (!best || t.s > best.s) best = t;
    }
    if (!best) return null;
    const d = nodes.deck.getBoundingClientRect();
    const persp = parseFloat(getComputedStyle(nodes.deck).perspective) || 1600;
    const ox = d.left + d.width / 2, oy = d.top + d.height / 2;
    const W = best.node.offsetWidth, H = best.node.offsetHeight;
    const u = W * SEAT_U * best.s, v = (-H / 2) * best.s;
    const X = best.x + u * Math.cos(best.ry);
    const Z = best.z - u * Math.sin(best.ry);
    const k = persp / Math.max(1, persp - Z);
    return { node: best.node, x: ox + X * k, y: oy + v * k, k: k * best.s, ry: best.ry, H };
  }

  function frontCard() {
    let best = null, bestW = 0;
    for (const c of nodes.projectCards) {
      const r = c.getBoundingClientRect();
      if (r.bottom < 0 || r.top > view.h) continue;
      if (r.width > bestW) { bestW = r.width; best = r; }
    }
    return best;
  }

  function anchorFor(id) {
    const W = view.w, H = view.h;
    if (view.dock) return { x: W / 2, y: H * 0.98, h: H * 0.9, yaw: -0.25 };
    switch (id) {
      case 'historia': {
        const r = nodes.rail ? nodes.rail.getBoundingClientRect() : null;
        const h = Math.min(H * 0.3, 270);
        return { x: Math.max(r ? r.left + 64 : 0, h * 0.4), y: H * 0.94, h, yaw: 0.55 };
      }
      case 'projetos': {
        const seat = deckSeat();
        if (seat) {
          const h = Math.min(seat.H * 0.4, H * 0.24, 210) * seat.k;
          // the feet origin sits below the hips: drop it so the hips land on the edge
          return { x: seat.x, y: seat.y + h * SEAT_DROP, h, yaw: seat.ry * 0.9 - 0.12, seat };
        }
        const h = Math.min(H * 0.24, 210);
        const r = frontCard();
        if (r) return { x: r.left + r.width * 0.8, y: r.top + h * 0.17, h, yaw: -0.15 };
        return { x: W * 0.12, y: H * 0.8, h, yaw: 0.5 };
      }
      case 'contato': {
        const r = nodes.terminal ? nodes.terminal.getBoundingClientRect() : null;
        const h = Math.min(H * 0.24, 220);
        if (r) return { x: r.left - h * 0.34, y: Math.min(r.bottom + h * 0.35, H * 0.93), h, yaw: 0.55 };
        return { x: W * 0.5, y: H * 0.85, h, yaw: 0.4 };
      }
      default: {
        const h = Math.min(H * 0.46, 420);
        return { x: W * 0.74, y: H * 0.84, h, yaw: -0.4 };
      }
    }
  }

  function resize() {
    view.dock = mqDock.matches;
    canvas.classList.toggle('is-dock', view.dock);
    hit.classList.toggle('is-dock', view.dock);
    const r = canvas.getBoundingClientRect();
    view.w = Math.max(1, r.width);
    view.h = Math.max(1, r.height);
    view.dpr = Math.min(window.devicePixelRatio || 1, view.dock ? 2 : 1.5);
    renderer.setPixelRatio(view.dpr);
    renderer.setSize(view.w, view.h, false);
    camera.aspect = view.w / view.h;
    camera.updateProjectionMatrix();
    view.wpp = (2 * CAM_Z * Math.tan(THREE.MathUtils.degToRad(FOV / 2))) / view.h;
    pMat.uniforms.uPx.value = view.dpr;
    goal = anchorFor(section);
    if (!trans) snapTo(goal);
    dirty = true;
  }

  // px (canvas space) -> world on the plane z
  function toWorld(px, py, z, out) {
    const k = (CAM_Z - z) / CAM_Z;
    out.set((px - view.w / 2) * view.wpp * k, (view.h / 2 - py) * view.wpp * k, z);
    return out;
  }
  function clientToCanvas(cx, cy) {
    if (!view.dock) return [cx, cy];
    const r = canvas.getBoundingClientRect();
    return [cx - r.left, cy - r.top];
  }

  // ---------------------------------------------------------------------------
  // State
  // ---------------------------------------------------------------------------
  let section = 'inicio';
  let goal = null; // anchor we're heading to
  const at = { x: 0, y: 0, h: 1, yaw: 0 }; // eased, what is drawn
  let trans = null; // { phase, t, toId, fromScale }
  let dirty = true;
  let time = 0;
  let lastInput = performance.now();
  const pointer = { x: -1, y: -1, has: false, at: 0 };
  const glance = { x: 0, y: 0, until: 0 };
  let focusTarget = null; // element the guide looks at when the visitor is still
  const look = { yaw: 0, pitch: 0 };
  let scrollY = window.scrollY, scrollV = 0, lean = 0;

  function snapTo(a) {
    at.x = a.x; at.y = a.y; at.h = a.h; at.yaw = a.yaw;
  }
  function placeRoot() {
    const s = (at.h * view.wpp) / modelH;
    toWorld(at.x, at.y, 0, root.position);
    root.scale.setScalar(s);
    lantern.position.set(0, modelH * 0.1, modelH * 0.35);
    lantern.intensity = 7 * s * s * (1 - shared.uDissolve.value * 0.8);
    pMat.uniforms.uScale.value = clamp(at.h / 260, 0.55, 1.4);
    root.updateMatrixWorld(true);
    shared.uInvRoot.value.copy(root.matrixWorld).invert();
  }

  // ---------------------------------------------------------------------------
  // Transitions between sections
  // ---------------------------------------------------------------------------
  const OUT = 0.45, TRAVEL = 0.95, IN = 0.55, SPREAD = 0.3;

  function travelTo(id, fromScatter) {
    const prev = section;
    section = id;
    goal = anchorFor(id);
    const cfg = SECTIONS[id] || SECTIONS.inicio;
    if (reduced || view.dock) {
      // No journey: a puff in place (dock) or a plain cut (reduced motion).
      snapTo(goal);
      setBase(cfg.base);
      if (!reduced && prev !== id) { puff(); react(cfg.greet); }
      dirty = true;
      return;
    }
    if (trans && trans.phase !== 'in') {
      trans.toId = id; // retarget mid-flight: the motes just bend toward the new spot
      return;
    }
    placeRoot();
    if (fromScatter) {
      // First appearance: motes rise out of the sea around the destination.
      snapTo(goal);
      placeRoot();
      sampleSurface(null, tRel);
      const c = toWorld(goal.x, goal.y - goal.h / 2, 0, new THREE.Vector3());
      const R = goal.h * view.wpp;
      for (let i = 0; i < N_TRANSIT; i++) {
        tStart[i * 3] = c.x + (Math.random() - 0.5) * R * 3;
        tStart[i * 3 + 1] = c.y + (Math.random() - 0.7) * R * 2;
        tStart[i * 3 + 2] = (Math.random() - 0.5) * R;
      }
      trans = { phase: 'travel', t: 0, toId: id, fromH: goal.h };
      shared.uDissolve.value = 1;
    } else {
      sampleSurface(tStart, tRel);
      trans = { phase: 'out', t: 0, toId: id, fromH: at.h };
    }
    for (let i = 0; i < N_TRANSIT; i++) tDelay[i] = Math.random() * SPREAD;
    seedCtrl();
    dirty = true;
  }

  function seedCtrl() {
    const a = anchorFor(trans.toId);
    const from = new THREE.Vector3(root.position.x, root.position.y, 0);
    const to = toWorld(a.x, a.y, 0, new THREE.Vector3());
    const dist = from.distanceTo(to);
    const lift = Math.max(dist * 0.35, a.h * view.wpp * 0.6);
    for (let i = 0; i < N_TRANSIT; i++) {
      tCtrl[i * 3] = (tStart[i * 3] + to.x) / 2 + (Math.random() - 0.5) * dist * 0.12;
      tCtrl[i * 3 + 1] = (tStart[i * 3 + 1] + to.y) / 2 + lift * (0.75 + Math.random() * 0.4);
      tCtrl[i * 3 + 2] = (Math.random() - 0.3) * dist * 0.15;
    }
  }

  function stepTransit(dt) {
    if (!trans) return;
    trans.t += dt;
    const sNow = (at.h * view.wpp) / modelH;
    if (trans.phase === 'out') {
      const k = clamp01(trans.t / OUT);
      shared.uDissolve.value = ease(k);
      for (let i = 0; i < N_TRANSIT; i++) {
        pAlpha[i] = clamp01(k * 1.6 - tDelay[i]);
        pPos[i * 3] = tStart[i * 3];
        pPos[i * 3 + 1] = tStart[i * 3 + 1] + k * k * 0.15 * sNow * modelH;
        pPos[i * 3 + 2] = tStart[i * 3 + 2];
      }
      if (k >= 1) {
        trans.phase = 'travel';
        trans.t = 0;
        for (let i = 0; i < N_TRANSIT * 3; i++) tStart[i] = pPos[i];
      }
      return;
    }
    // Destination is live, so a moving anchor (the project deck) or a retarget is followed.
    goal = anchorFor(trans.toId);
    snapTo(goal);
    placeRoot();
    root.updateMatrixWorld(true);
    const m = root.matrixWorld.elements;
    if (trans.phase === 'travel') {
      const total = TRAVEL + SPREAD;
      for (let i = 0; i < N_TRANSIT; i++) {
        const k = ease(clamp01((trans.t - tDelay[i]) / TRAVEL));
        const rx = tRel[i * 3], ry = tRel[i * 3 + 1], rz = tRel[i * 3 + 2];
        const ex = m[0] * rx + m[4] * ry + m[8] * rz + m[12];
        const ey = m[1] * rx + m[5] * ry + m[9] * rz + m[13];
        const ez = m[2] * rx + m[6] * ry + m[10] * rz + m[14];
        const u = 1 - k;
        for (let c = 0; c < 3; c++) {
          const s0 = tStart[i * 3 + c], s1 = tCtrl[i * 3 + c], s2 = c === 0 ? ex : c === 1 ? ey : ez;
          pPos[i * 3 + c] = u * u * s0 + 2 * u * k * s1 + k * k * s2;
        }
        pAlpha[i] = 0.75 + 0.25 * Math.sin(Math.PI * k);
      }
      shared.uDissolve.value = 1;
      if (trans.t >= total) {
        trans.phase = 'in';
        trans.t = 0;
        const cfg = SECTIONS[trans.toId] || SECTIONS.inicio;
        setBase(cfg.base);
      }
      return;
    }
    // 'in': the body re-forms from the feet up while the motes sink into it
    const k = clamp01(trans.t / IN);
    shared.uDissolve.value = 1 - ease(k);
    for (let i = 0; i < N_TRANSIT; i++) pAlpha[i] = Math.max(0, (1 - k * 1.4)) * 0.9;
    if (k >= 1) {
      const cfg = SECTIONS[trans.toId] || SECTIONS.inicio;
      trans = null;
      pAlpha.fill(0, 0, N_TRANSIT);
      shared.uDissolve.value = 0;
      react(cfg.greet);
    }
  }

  // Click burst from the chest
  function puff() {
    if (reduced) return;
    burst.t = 0;
    root.updateMatrixWorld(true);
    const c = new THREE.Vector3(0, modelH * 0.62, modelH * 0.1).applyMatrix4(root.matrixWorld);
    const sp = at.h * view.wpp;
    for (let i = 0; i < N_BURST; i++) {
      const j = N_TRANSIT + i;
      pPos[j * 3] = c.x; pPos[j * 3 + 1] = c.y; pPos[j * 3 + 2] = c.z;
      const th = Math.random() * Math.PI * 2, ph = Math.acos(2 * Math.random() - 1);
      const sp2 = sp * (0.5 + Math.random() * 0.9);
      burst.vel[i * 3] = Math.sin(ph) * Math.cos(th) * sp2;
      burst.vel[i * 3 + 1] = Math.abs(Math.cos(ph)) * sp2 * 0.9;
      burst.vel[i * 3 + 2] = Math.sin(ph) * Math.sin(th) * sp2 * 0.5;
      burst.life[i] = 0.6 + Math.random() * 0.7;
    }
  }
  function stepBurst(dt) {
    if (burst.t < 0) return;
    burst.t += dt;
    let alive = false;
    for (let i = 0; i < N_BURST; i++) {
      const j = N_TRANSIT + i;
      const k = burst.t / burst.life[i];
      if (k >= 1) { pAlpha[j] = 0; continue; }
      alive = true;
      const drag = Math.exp(-2.6 * dt);
      burst.vel[i * 3] *= drag; burst.vel[i * 3 + 1] *= drag; burst.vel[i * 3 + 2] *= drag;
      pPos[j * 3] += burst.vel[i * 3] * dt;
      pPos[j * 3 + 1] += burst.vel[i * 3 + 1] * dt;
      pPos[j * 3 + 2] += burst.vel[i * 3 + 2] * dt;
      pAlpha[j] = (1 - k) * (1 - k);
    }
    if (!alive) burst.t = -1;
  }

  // Lantern motes: a slow orbit around the feet and knees
  function stepMotes() {
    const vis = 1 - shared.uDissolve.value;
    const s = root.scale.x;
    for (let i = 0; i < N_MOTE; i++) {
      const j = N_TRANSIT + N_BURST + i;
      const a = motePhase[i * 3] + time * motePhase[i * 3 + 1];
      const r = modelH * (0.3 + 0.12 * Math.sin(time * 0.7 + i)) * s;
      const y = modelH * (0.05 + 0.5 * motePhase[i * 3 + 2] + 0.04 * Math.sin(time * 1.3 + i * 2.1)) * s;
      pPos[j * 3] = root.position.x + Math.cos(a) * r;
      pPos[j * 3 + 1] = root.position.y + y;
      pPos[j * 3 + 2] = root.position.z + Math.sin(a) * r * 0.6;
      pAlpha[j] = vis * (0.25 + 0.35 * (0.5 + 0.5 * Math.sin(time * 2 + i))) * (Math.sin(a) > -0.2 ? 1 : 0.35);
    }
  }

  // ---------------------------------------------------------------------------
  // Look-at: head and neck turn toward the pointer (or what matters in the section)
  // ---------------------------------------------------------------------------
  const AXIS_X = new THREE.Vector3(1, 0, 0);
  const qTmp = new THREE.Quaternion();
  const qRoot = new THREE.Quaternion();
  const qParent = new THREE.Quaternion();
  const qOff = new THREE.Quaternion();
  const eTmp = new THREE.Euler();
  const headW = new THREE.Vector3();
  const tgtW = new THREE.Vector3();

  function lookTarget(now) {
    if (now < glance.until) return [glance.x, glance.y];
    const idle = !pointer.has || now - pointer.at > 1800;
    if (idle && focusTarget && focusTarget.isConnected) {
      const r = focusTarget.getBoundingClientRect();
      return clientToCanvas(r.left + r.width / 2, r.top + r.height / 2);
    }
    if (pointer.has) return clientToCanvas(pointer.x, pointer.y);
    return null;
  }

  
  function aimHead(dt, now) {
    if (!headBone) return;
    const t = dbg.noLook ? null : lookTarget(now);
    let yaw = 0, pitch = 0;
    if (t) {
      headBone.getWorldPosition(headW);
      toWorld(t[0], t[1], 6, tgtW);
      tgtW.sub(headW);
      // into the root's turned frame
      pivot.getWorldQuaternion(qRoot);
      tgtW.applyQuaternion(qTmp.copy(qRoot).invert());
      yaw = clamp(Math.atan2(tgtW.x, tgtW.z), -1.05, 1.05);
      pitch = clamp(-Math.atan2(tgtW.y, Math.hypot(tgtW.x, tgtW.z)), -0.5, 0.6);
    }
    const k = reduced ? 1 : damp(7, dt);
    look.yaw += (yaw - look.yaw) * k;
    look.pitch += (pitch - look.pitch) * k;
    const parts = neckBone ? [[neckBone, 0.35], [headBone, 0.65]] : [[headBone, 1]];
    for (const [bone, w] of parts) {
      bone.parent.updateWorldMatrix(true, false);
      bone.parent.getWorldQuaternion(qParent);
      pivot.getWorldQuaternion(qRoot);
      qOff.setFromEuler(eTmp.set(look.pitch * w, look.yaw * w, 0, 'YXZ'));
      // offset expressed in the root frame -> bone's parent frame
      qOff.premultiply(qRoot).multiply(qTmp.copy(qRoot).invert());
      qOff.premultiply(qTmp.copy(qParent).invert()).multiply(qParent);
      bone.quaternion.premultiply(qOff);
      bone.updateMatrixWorld(true);
    }
  }

  // Seated on a card: shins hang over the edge and swing, a little out of phase.
  let dangle = 0;
  function dangleLegs(dt, seated) {
    dangle += ((seated ? 1 : 0) - dangle) * (reduced ? 1 : damp(4, dt));
    if (dangle < 0.01 || !shins.length) return;
    pivot.getWorldQuaternion(qRoot);
    shins.forEach((bone, i) => {
      const swing = reduced ? 0 : 0.22 * Math.sin(time * 2.1 + i * 1.9);
      const a = dangle * (SEAT_KNEE + swing);
      bone.parent.updateWorldMatrix(true, false);
      bone.parent.getWorldQuaternion(qParent);
      qOff.setFromAxisAngle(AXIS_X, a);
      qOff.premultiply(qRoot).multiply(qTmp.copy(qRoot).invert());
      qOff.premultiply(qTmp.copy(qParent).invert()).multiply(qParent);
      bone.quaternion.premultiply(qOff);
      bone.updateMatrixWorld(true);
    });
  }

  function updateSeatMark() {
    const seat = goal && goal.seat;
    const on = !!seat && section === 'projetos' && !trans && !oneShot && shared.uDissolve.value < 0.2;
    const host = seat ? seat.node.querySelector('.project-card') || seat.node : null;
    if (host && host !== seatHost) {
      seatHost = host;
      seatHost.appendChild(seatMark);
    }
    seatMark.classList.toggle('is-on', on);
  }

  // ---------------------------------------------------------------------------
  // Section awareness
  // ---------------------------------------------------------------------------
  let focusKey = null;
  let pollAt = 0;
  function pollSection(now) {
    if (now < pollAt) return;
    pollAt = now + 250;
    if (section === 'historia') {
      const item = $('.tl-item.is-focus .tl-card') || $('.tl-item.is-focus');
      if (item && item !== focusKey) {
        if (focusKey) react('yes');
        focusKey = item;
      }
      focusTarget = item;
    } else if (section === 'projetos') {
      const seat = deckSeat();
      const media = seat ? $('.project-media', seat.node) : null;
      if (media && media !== focusKey) {
        if (focusKey && !trans) { react('jump'); puff(); } // hop onto the next card
        focusKey = media;
      }
      focusTarget = media;
    } else if (section === 'contato') {
      focusTarget = document.activeElement && document.activeElement.closest && document.activeElement.closest('.terminal-form')
        ? document.activeElement
        : nodes.terminal;
    } else {
      focusTarget = $('#hero-title');
    }
  }

  if ('IntersectionObserver' in window) {
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          const id = entry.target.id;
          if (SECTIONS[id] && id !== section) {
            focusKey = null;
            travelTo(id);
          }
        });
      },
      { rootMargin: '-45% 0px -55% 0px' }
    );
    $$('main > section').forEach((sec) => io.observe(sec));
  }

  // ---------------------------------------------------------------------------
  // Input
  // ---------------------------------------------------------------------------
  const markInput = () => { lastInput = performance.now(); wake(); };

  window.addEventListener('pointermove', (e) => {
    if (e.pointerType === 'touch') return;
    pointer.x = e.clientX; pointer.y = e.clientY; pointer.has = true; pointer.at = performance.now();
    markInput();
  }, { passive: true });

  window.addEventListener('scroll', () => markInput(), { passive: true });

  // A click anywhere: a quick glance at it.
  window.addEventListener('pointerdown', (e) => {
    if (e.target === hit) return;
    const [x, y] = clientToCanvas(e.clientX, e.clientY);
    glance.x = x; glance.y = y; glance.until = performance.now() + 1400;
    markInput();
  }, { passive: true });

  // Clicking the guide itself: a reaction, rotating so it never feels canned.
  const REACTIONS = ['jump', 'wave', 'yes', 'thumbs'];
  let reactIdx = 0;
  const clicks = [];
  hit.addEventListener('click', () => {
    const now = performance.now();
    clicks.push(now);
    while (clicks.length && now - clicks[0] > 2500) clicks.shift();
    setFace('surprised', 1);
    puff();
    if (clicks.length >= 4) {
      clicks.length = 0;
      react('dance');
    } else {
      react(REACTIONS[reactIdx++ % REACTIONS.length]);
    }
    markInput();
  });

  // Hero CTA and contact terminal hooks
  const welcomeBtn = $('#hero-welcome-btn');
  if (welcomeBtn) welcomeBtn.addEventListener('click', () => react('thumbs'));
  const out = $('#terminal-output');
  if (out && 'MutationObserver' in window) {
    new MutationObserver(() => {
      const last = out.lastElementChild;
      const txt = last ? last.textContent : '';
      if (/ERROR|FALHA/i.test(txt)) { react('no'); setFace('sad', 1); }
      else if (/DISPARANDO/i.test(txt)) { react('jump'); puff(); }
      else if (/CONCLU[ÍI]DA/i.test(txt)) { react('dance'); setFace('surprised', 0.6); puff(); }
      markInput();
    }).observe(out, { childList: true, subtree: true });
  }
  const form = $('#terminal-form');
  if (form) {
    const greeted = new WeakSet();
    form.addEventListener('focusin', (e) => {
      if (!greeted.has(e.target)) { greeted.add(e.target); react('yes'); }
      markInput();
    });
  }

  mqDock.addEventListener('change', () => { resize(); travelTo(section); });
  window.addEventListener('resize', resize);
  document.addEventListener('visibilitychange', () => (document.hidden ? sleep() : wake()));

  // ---------------------------------------------------------------------------
  // Loop
  // ---------------------------------------------------------------------------
  let raf = 0, running = false, last = 0, tick = 0;
  function wake() {
    if (running || document.hidden) return;
    running = true;
    last = 0;
    raf = requestAnimationFrame(frame);
  }
  function sleep() {
    running = false;
    cancelAnimationFrame(raf);
  }

  function frame(now) {
    let dt = last ? (now - last) / 1000 : 1 / 60;
    last = now;
    dt = Math.min(dt, 0.05) * dbg.timeScale;

    // After 20 s without input: half rate, like the sea.
    if (!reduced && now - lastInput > 20000 && (tick++ & 1)) {
      raf = requestAnimationFrame(frame);
      return;
    }

    update(dt, now);
    renderer.render(scene, camera);
    dirty = false;

    if (!reduced || trans || dirty) {
      raf = requestAnimationFrame(frame);
    } else {
      running = false;
    }
  }

  function update(dt, now) {
    time += dt;
    shared.uTime.value = time;

    // scroll velocity -> lean (the guide is dragged by the current)
    const sy = window.scrollY;
    const v = (sy - scrollY) / Math.max(dt, 1e-3);
    scrollY = sy;
    scrollV += (v - scrollV) * damp(6, dt);
    const leanT = reduced ? 0 : clamp(scrollV / 2600, -1, 1);
    lean += (leanT - lean) * damp(5, dt);

    pollSection(now);

    if (!trans) {
      goal = anchorFor(section);
      const k = reduced ? 1 : damp(6, dt);
      at.x += (goal.x - at.x) * k;
      at.y += (goal.y - at.y) * k;
      at.h += (goal.h - at.h) * k;
      at.yaw += (goal.yaw - at.yaw) * k;
    }
    stepTransit(dt);
    placeRoot();

    // float, lean, turn toward what it looks at
    const cfg = SECTIONS[section] || SECTIONS.inicio;
    const floating = cfg.float && !reduced;
    pivot.position.y = floating ? modelH * (0.03 + 0.025 * Math.sin(time * 1.6)) - lean * modelH * 0.05 : 0;
    pivot.rotation.z = floating ? 0.04 * Math.sin(time * 0.9) : 0;
    pivot.rotation.x = lean * 0.28;
    pivot.rotation.y = at.yaw + look.yaw * 0.35;

    // Bones the current clip doesn't animate keep last frame's look offset: undo it first.
    for (const r of restPose) r.bone.quaternion.copy(r.q);
    if (!reduced) mixer.update(dt);
    else if (!mixer.time) mixer.update(0.5);
    for (const r of restPose) r.q.copy(r.bone.quaternion);
    model.updateMatrixWorld(true);
    dangleLegs(dt, cfg.base === 'sit' && !oneShot);
    aimHead(dt, now);
    updateSeatMark();

    // face
    if (faceMesh) {
      const d = faceMesh.morphTargetDictionary;
      const inf = faceMesh.morphTargetInfluences;
      face.surprised = Math.max(0, face.surprised - dt * 1.2);
      face.sad = Math.max(0, face.sad - dt * 0.5);
      if (d[MODEL.face.surprised] !== undefined) inf[d[MODEL.face.surprised]] = face.surprised;
      if (d[MODEL.face.sad] !== undefined) inf[d[MODEL.face.sad]] = face.sad;
    }

    stepBurst(dt);
    stepMotes();
    pGeo.attributes.position.needsUpdate = true;
    pGeo.attributes.aAlpha.needsUpdate = true;

    // the clickable area follows the body
    const visible = shared.uDissolve.value < 0.6;
    const w = at.h * 0.5, hh = at.h * (cfg.base === 'sit' ? 0.7 : 0.95);
    const off = view.dock ? canvas.getBoundingClientRect() : { left: 0, top: 0 };
    hit.style.transform = `translate(${(off.left + at.x - w / 2).toFixed(1)}px, ${(off.top + at.y - hh).toFixed(1)}px)`;
    hit.style.width = `${w.toFixed(0)}px`;
    hit.style.height = `${hh.toFixed(0)}px`;
    hit.style.visibility = visible ? 'visible' : 'hidden';
  }

  // ---------------------------------------------------------------------------
  // Go
  // ---------------------------------------------------------------------------
  const visibleSection = $$('main > section').find((s) => {
    const r = s.getBoundingClientRect();
    return r.top <= window.innerHeight * 0.45 && r.bottom > window.innerHeight * 0.45;
  });
  section = visibleSection && SECTIONS[visibleSection.id] ? visibleSection.id : 'inicio';
  resize();
  setBase((SECTIONS[section] || SECTIONS.inicio).base);
  doc.classList.add('has-avatar');
  if (reduced || view.dock) {
    shared.uDissolve.value = 0;
    snapTo(goal);
    if (!reduced) react((SECTIONS[section] || SECTIONS.inicio).greet);
  } else {
    const id = section;
    section = '';
    travelTo(id, true);
  }
  wake();

  // Debug/QA handle (harmless in production)
  window.__avatar = { dbg, renderer, react, travelTo, get section() { return section; }, get trans() { return trans; } };
  return window.__avatar;
}

// -----------------------------------------------------------------------------
// Material: palette, teal fresnel rim, and the particle dissolve
// -----------------------------------------------------------------------------
function abyssalize(source, shared) {
  const m = source.clone();
  const look = MODEL.palette[source.name];
  if (look && m.color) {
    m.color.setHex(look.color);
    if (m.emissive) {
      m.emissive.setHex(look.emissive || 0x000000);
      m.emissiveIntensity = look.glow || 1;
    }
    if ('metalness' in m) { m.metalness = look.metal ?? 0.2; m.roughness = look.rough ?? 0.5; }
  }
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, shared);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vDPos;\nuniform mat4 uInvRoot;')
      .replace('#include <skinning_vertex>', '#include <skinning_vertex>\nvDPos = (uInvRoot * modelMatrix * vec4(transformed, 1.0)).xyz;');
    sh.fragmentShader = sh.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
        varying vec3 vDPos;
        uniform float uDissolve; uniform float uTime; uniform float uNoiseScale; uniform float uHeight;
        uniform vec3 uRim; uniform vec3 uEdge;
        float aHash(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
        float aNoise(vec3 x) {
          vec3 i = floor(x); vec3 f = fract(x); f = f * f * (3.0 - 2.0 * f);
          return mix(mix(mix(aHash(i), aHash(i + vec3(1,0,0)), f.x), mix(aHash(i + vec3(0,1,0)), aHash(i + vec3(1,1,0)), f.x), f.y),
                     mix(mix(aHash(i + vec3(0,0,1)), aHash(i + vec3(1,0,1)), f.x), mix(aHash(i + vec3(0,1,1)), aHash(i + vec3(1,1,1)), f.x), f.y), f.z);
        }
        float aEdge = 0.0;`
      )
      .replace(
        '#include <clipping_planes_fragment>',
        `#include <clipping_planes_fragment>
        if (uDissolve > 0.001) {
          vec3 q = vDPos * uNoiseScale;
          float n = 0.65 * (aNoise(q) * 0.65 + aNoise(q * 2.3 + 7.1) * 0.35) + 0.35 * clamp(vDPos.y / uHeight, 0.0, 1.0);
          float cut = uDissolve * 1.12 - 0.06;
          if (n < cut) discard;
          aEdge = 1.0 - smoothstep(0.0, 0.07, n - cut);
        }`
      )
      .replace(
        '#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>
        #define RIM_STRENGTH ${RIM_STRENGTH}
        float aRim = pow(1.0 - saturate(dot(normalize(normal), normalize(vViewPosition))), 2.6);
        totalEmissiveRadiance += uRim * aRim * RIM_STRENGTH + uEdge * aEdge * 4.0;`
      );
  };
  m.customProgramCacheKey = () => 'abyssal-avatar';
  return m;
}
