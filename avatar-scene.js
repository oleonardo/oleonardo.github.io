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
  // Arm chains (upper arm, forearm, hand) used to hold the contact card
  arms: [['UpperArm.L', 'LowerArm.L', 'Palm2.L'], ['UpperArm.R', 'LowerArm.R', 'Palm2.R']],
  // Meshes of the left arm: while holding the card, that hand reaches behind it
  behindCard: ['Hand.L', 'Arm.L'],
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
const N_POOL = 260; // mist pool: click puffs, wake trail, evaporation
const N_MOTE = 36;
const N_ALL = N_TRANSIT + N_POOL + N_MOTE;

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
    uEdge: { value: new THREE.Color(0x9ff3e6) }, // soft sea-glow on the dissolving edge
    uCardRect: { value: new THREE.Vector4() }, // the contact card, in drawing-buffer pixels
    uCardOn: { value: 0 },
  };
  const meshes = [];
  let faceMesh = null;
  let headBone = null;
  let neckBone = null;
  const shins = [];
  const bare = (n) => n.replace(/[.\s]/g, '');
  const bonesByName = {};
  model.traverse((o) => {
    if (o.isBone && !bonesByName[bare(o.name)]) bonesByName[bare(o.name)] = o;
  });
  const arms = MODEL.arms.map((chain) => chain.map((n) => bonesByName[bare(n)])).filter((c) => c.every(Boolean));
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

  const behind = new Set(MODEL.behindCard.map(bare));
  model.traverse((o) => {
    if (!o.isMesh || Array.isArray(o.material) || !o.material.userData.uClip) return;
    for (let n = o; n; n = n.parent) {
      if (behind.has(bare(n.name).replace(/_\d+$/, ''))) { o.material.userData.uClip.value = 1; break; }
    }
  });

  const restPose = [headBone, neckBone, ...shins, ...arms.flat()].filter(Boolean).map((bone) => ({ bone, q: bone.quaternion.clone() }));

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
  mixer.timeScale = 0.82; // everything moves a little slower under water
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
    // A clip's first play saves the bones' current pose as their "original": make
    // sure that is the clean animated pose, not the arms bent around the card.
    for (const r of restPose) r.bone.quaternion.copy(r.q);
    next.play();
    if (current && current !== next) current.crossFadeTo(next, dur, false);
    current = next;
    oneShot = !!once;
  }
  function setBase(name) {
    baseName = name;
    if (!oneShot) fadeTo(name, 0.8);
  }
  function react(name) {
    if (reduced || !actions[name]) return;
    fadeTo(name, 0.45, true);
  }
  mixer.addEventListener('finished', (e) => {
    if (oneShot && e.action === current) {
      oneShot = false;
      fadeTo(baseName, 0.7);
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
    // mist is mostly teal sea-light with amber flecks (the human light)
    pTone[i] = Math.random() < 0.3 ? 1 : 0;
    pSize[i] = i < N_TRANSIT ? 5 + Math.random() * 7 : i < N_TRANSIT + N_POOL ? 3 + Math.random() * 5 : 3 + Math.random() * 3;
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
  const pool = {
    vel: new Float32Array(N_POOL * 3),
    life: new Float32Array(N_POOL),
    age: new Float32Array(N_POOL).fill(1e9),
    a0: new Float32Array(N_POOL),
    next: 0,
    live: 0,
  };
  const phase = new Float32Array(N_TRANSIT * 3);
  for (let i = 0; i < phase.length; i++) phase[i] = Math.random() * Math.PI * 2;
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
        // tucked against the card's lower-left corner, both hands on its edge
        if (r) return { x: r.left - h * 0.2, y: Math.min(r.bottom + h * 0.16, H * 0.96), h, yaw: 0.6, grip: true };
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
  const vel = { x: 0, y: 0 }; // px/s, the drift carries momentum like something adrift
  let trans = null; // { phase, t, toId, fromScale }
  let dirty = true;
  let time = 0;
  let lastInput = performance.now();
  const pointer = { x: -1, y: -1, has: false, at: 0 };
  const glance = { x: 0, y: 0, until: 0 };
  let focusTarget = null; // element the guide looks at when the visitor is still
  const look = { yaw: 0, pitch: 0 };
  const nod = { x: 0, v: 0 }; // keystroke nods: a damped spring on the head pitch
  let shakeT = 9; // seconds since a "no" head shake started
  const grip = { w: 0 }; // how firmly it holds the contact card (0..1)
  const tug = { x: 0, v: 0 }; // a jolt on the card when the focus moves: a springy wobble
  let cardStyled = false;
  let scrollY = window.scrollY, scrollV = 0, lean = 0;

  function snapTo(a) {
    at.x = a.x; at.y = a.y; at.h = a.h; at.yaw = a.yaw;
    vel.x = vel.y = 0;
  }
  function placeRoot() {
    const s = (at.h * view.wpp) / modelH;
    toWorld(at.x, at.y, 0, root.position);
    root.scale.setScalar(s);
    lantern.position.set(0, modelH * 0.1, modelH * 0.35);
    lantern.intensity = 7 * s * s * (1 - shared.uDissolve.value * 0.8);
    // while it travels as mist the motes keep the body's size, even into a small stop
    pMat.uniforms.uScale.value = clamp((trans && trans.kind === 'send' ? trans.fromH : at.h) / 260, 0.55, 1.4);
    root.updateMatrixWorld(true);
    shared.uInvRoot.value.copy(root.matrixWorld).invert();
  }

  // ---------------------------------------------------------------------------
  // Transitions between sections
  // ---------------------------------------------------------------------------
  const OUT = 0.85, TRAVEL = 1.5, IN = 1.0, SPREAD = 0.5;

  // A cheap, smooth flow field: the "current" every mote drifts in.
  // Coordinates are in body heights, so it looks the same at any size.
  const flowV = [0, 0, 0];
  function flow(x, y, z, t) {
    flowV[0] = Math.sin(y * 1.7 + t * 0.6) + 0.5 * Math.sin(z * 2.3 + t * 0.37);
    flowV[1] = 0.45 + 0.6 * Math.sin(z * 1.9 + t * 0.5) + 0.4 * Math.sin(x * 2.1 - t * 0.43);
    flowV[2] = 0.5 * Math.sin(x * 1.3 + t * 0.31);
    return flowV;
  }

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
      if (id !== 'contato') abandonSend();
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
      trans = { phase: 'out', t: 0, toId: id, fromH: at.h, from: prev };
    }
    for (let i = 0; i < N_TRANSIT; i++) tDelay[i] = Math.random() * SPREAD;
    seedCtrl();
    dirty = true;
  }

  // Where the current journey is heading: the section's spot, or a stop on the way.
  function transAnchor() {
    return anchorFor(trans.toId);
  }

  // Sending a message, in beats driven by the terminal:
  //   beginSend()  the guide turns to mist (the form waits for this)
  //   fire()       the transmission bursts out of the cloud churning in its place,
  //                and the mist gathers back into the body
  //   result(ok)   once re-formed: a dance, or a shaken head
  const SEND_TRAVEL = 1.1, SEND_SPREAD = 0.35;
  let sendDone = null; // resolves beginSend()'s promise
  // the centre of the cloud (anchor + half a body up), in world space
  function stopCentre(a, h, out) {
    return toWorld(a.x, a.y - h * 0.45, 0, out);
  }
  function settleSend(v) {
    if (sendDone) { const f = sendDone; sendDone = null; f(v); }
  }
  function cloudRect() {
    if (!trans || !trans.c) return null;
    const [x, y] = toCanvas(trans.c);
    const off = view.dock ? canvas.getBoundingClientRect() : { left: 0, top: 0 };
    return { left: off.left + x - 1, top: off.top + y - 1, width: 2, height: 2 };
  }
  function beginSend() {
    if (reduced || view.dock || trans || section !== 'contato' || !nodes.terminal || shared.uDissolve.value > 0.01) {
      return Promise.resolve(null);
    }
    settleSend(null);
    placeRoot();
    sampleSurface(tStart, tRel);
    trans = { kind: 'send', phase: 'out', t: 0, toId: 'contato', fromH: at.h, c: new THREE.Vector3() };
    for (let i = 0; i < N_TRANSIT; i++) tDelay[i] = Math.random() * SPREAD;
    markInput(); // full frame rate for the show, even after a quiet spell
    return new Promise((res) => { sendDone = res; });
  }
  function sending() {
    return trans && trans.kind === 'send';
  }
  // A send that can't finish here (the visitor scrolled away): carry on as a normal journey.
  function abandonSend() {
    if (!sending()) return;
    settleSend(null);
    trans.kind = null;
    if (trans.phase === 'hold') {
      trans.phase = 'travel';
      trans.t = 0;
      for (let i = 0; i < N_TRANSIT * 3; i++) tStart[i] = pPos[i];
      for (let i = 0; i < N_TRANSIT; i++) tDelay[i] = Math.random() * SPREAD;
      seedCtrl();
    }
  }
  const guide = {
    beginSend,
    fire() {
      if (sending() && trans.phase !== 'in') {
        trans.fire = true;
        return cloudRect();
      }
      if (!reduced) { react('jump'); puff(); }
      return null;
    },
    result(ok) {
      if (sending()) {
        trans.fire = true;
        trans.result = !!ok;
        trans.greet = ok ? 'dance' : 'no';
        return;
      }
      outcome(ok ? 'dance' : 'no');
    },
  };
  function outcome(name) {
    if (name === 'no') { if (!reduced) shakeT = 0; setFace('sad', 1); }
    if (name === 'dance') setFace('surprised', 0.6);
    react(name);
  }
  window.avatarGuide = guide;

  function seedCtrl() {
    const a = transAnchor();
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
    const H = (trans.kind === 'send' ? trans.fromH : at.h) * view.wpp; // one body height in world units
    // A send happens beside the form: motes fade out at the card's left edge, as if
    // they slipped behind it, so none drift over the fields.
    let fence = null;
    if (trans.kind === 'send' && nodes.terminal && !view.dock) {
      const [ex] = clientToCanvas(nodes.terminal.getBoundingClientRect().left, 0);
      fence = (ex - view.w / 2) * view.wpp;
    }
    const fenced = (i, a) => {
      if (fence === null) return a;
      const lim = (fence * (CAM_Z - pPos[i * 3 + 2])) / CAM_Z - H * 0.02;
      return a * clamp01((lim - pPos[i * 3]) / (H * 0.06));
    };
    if (trans.phase === 'out') {
      // the body evaporates from the feet up; motes lift off and start to drift
      const k = clamp01(trans.t / OUT);
      shared.uDissolve.value = ease(k);
      for (let i = 0; i < N_TRANSIT; i++) {
        const own = clamp01((k - tDelay[i] * 0.8) / 0.6);
        const sx = tStart[i * 3], sy = tStart[i * 3 + 1], sz = tStart[i * 3 + 2];
        const f = flow(sx / H, sy / H, sz / H + phase[i * 3], time);
        const d = own * own * H * 0.18;
        pPos[i * 3] = sx + f[0] * d;
        pPos[i * 3 + 1] = sy + f[1] * d + own * H * 0.06;
        pPos[i * 3 + 2] = sz + f[2] * d;
        pAlpha[i] = fenced(i, own * 0.7);
      }
      if (k >= 1) {
        trans.phase = trans.kind === 'send' ? 'hold' : 'travel';
        trans.t = 0;
        for (let i = 0; i < N_TRANSIT * 3; i++) tStart[i] = pPos[i];
        if (trans.kind === 'send') {
          stopCentre(anchorFor('contato'), trans.fromH, trans.c);
          settleSend(cloudRect());
        }
      }
      return;
    }
    if (trans.phase === 'hold') {
      // a churning cloud where it stood (nudged away from the form), while the
      // terminal compiles the message
      stopCentre(anchorFor('contato'), trans.fromH, trans.c);
      trans.c.x -= H * 0.18;
      const c = trans.c;
      const R = H * 0.3;
      const blend = ease(clamp01(trans.t / 0.6));
      const breathe = 1 + 0.12 * Math.sin(time * 3.1);
      for (let i = 0; i < N_TRANSIT; i++) {
        const p0 = phase[i * 3], p1 = phase[i * 3 + 1], p2 = phase[i * 3 + 2];
        const sp = 1.5 * (0.7 + 0.6 * (p1 / (Math.PI * 2)));
        const a = p0 + time * sp;
        const rr = R * breathe * (0.3 + 0.7 * (p2 / (Math.PI * 2)));
        const sx = c.x + Math.cos(a) * rr;
        const sy = c.y + Math.sin(a * 0.8 + p1) * rr * 0.7 + Math.sin(time * 1.3 + p2) * R * 0.08;
        const sz = c.z + Math.sin(a) * rr * 0.6;
        pPos[i * 3] = tStart[i * 3] + (sx - tStart[i * 3]) * blend;
        pPos[i * 3 + 1] = tStart[i * 3 + 1] + (sy - tStart[i * 3 + 1]) * blend;
        pPos[i * 3 + 2] = tStart[i * 3 + 2] + (sz - tStart[i * 3 + 2]) * blend;
        pAlpha[i] = fenced(i, 0.72);
      }
      shared.uDissolve.value = 1;
      // fired (or a lost signal: never strand the guide): the mist is thrown outward
      // with the transmission, then gathers back into the body
      if (trans.fire || trans.t > 5) {
        trans.phase = 'travel';
        trans.t = 0;
        for (let i = 0; i < N_TRANSIT * 3; i++) {
          tStart[i] = pPos[i];
          const d = pPos[i] - (i % 3 === 0 ? c.x : i % 3 === 1 ? c.y : c.z);
          // outward, but only ever away from the form on x
          tCtrl[i] = pPos[i] + (i % 3 === 0 ? -Math.abs(d) : d) * 1.4;
        }
        for (let i = 0; i < N_TRANSIT; i++) tDelay[i] = Math.random() * SEND_SPREAD;
      }
      return;
    }
    // Destination is live, so a moving anchor (the project deck) or a retarget is followed.
    goal = transAnchor();
    snapTo(goal);
    placeRoot();
    root.updateMatrixWorld(true);
    const m = root.matrixWorld.elements;
    if (trans.phase === 'travel') {
      // a loose cloud carried by the current: it billows mid-way and gathers at the end
      const TR = trans.kind === 'send' ? SEND_TRAVEL : TRAVEL;
      const total = TR + (trans.kind === 'send' ? SEND_SPREAD : SPREAD);
      for (let i = 0; i < N_TRANSIT; i++) {
        const raw = clamp01((trans.t - tDelay[i]) / TR);
        const k = ease(raw);
        const rx = tRel[i * 3], ry = tRel[i * 3 + 1], rz = tRel[i * 3 + 2];
        const ex = m[0] * rx + m[4] * ry + m[8] * rz + m[12];
        const ey = m[1] * rx + m[5] * ry + m[9] * rz + m[13];
        const ez = m[2] * rx + m[6] * ry + m[10] * rz + m[14];
        const u = 1 - k;
        const billow = Math.sin(Math.PI * raw) * H * 0.3;
        const p0 = phase[i * 3], p1 = phase[i * 3 + 1], p2 = phase[i * 3 + 2];
        const ox = billow * Math.sin(raw * 4.2 + p0 + time * 0.7);
        const oy = billow * 0.7 * Math.sin(raw * 3.4 + p1 + time * 0.55);
        const oz = billow * 0.6 * Math.sin(raw * 2.7 + p2);
        pPos[i * 3] = u * u * tStart[i * 3] + 2 * u * k * tCtrl[i * 3] + k * k * ex + ox;
        pPos[i * 3 + 1] = u * u * tStart[i * 3 + 1] + 2 * u * k * tCtrl[i * 3 + 1] + k * k * ey + oy;
        pPos[i * 3 + 2] = u * u * tStart[i * 3 + 2] + 2 * u * k * tCtrl[i * 3 + 2] + k * k * ez + oz;
        pAlpha[i] = fenced(i, 0.6 + 0.25 * Math.sin(Math.PI * raw));
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
    // 'in': the mist condenses into the body, swirling inward as it fades
    const k = clamp01(trans.t / IN);
    shared.uDissolve.value = 1 - ease(k);
    const swirl = (1 - k) * (1 - k) * H * 0.1;
    for (let i = 0; i < N_TRANSIT; i++) {
      const rx = tRel[i * 3], ry = tRel[i * 3 + 1], rz = tRel[i * 3 + 2];
      const a = phase[i * 3] + k * 3;
      pPos[i * 3] = m[0] * rx + m[4] * ry + m[8] * rz + m[12] + Math.cos(a) * swirl;
      pPos[i * 3 + 1] = m[1] * rx + m[5] * ry + m[9] * rz + m[13] + swirl * 0.5;
      pPos[i * 3 + 2] = m[2] * rx + m[6] * ry + m[10] * rz + m[14] + Math.sin(a) * swirl;
      pAlpha[i] = fenced(i, Math.pow(1 - k, 1.6) * 0.8);
    }
    if (k >= 1) {
      const cfg = SECTIONS[trans.toId] || SECTIONS.inicio;
      const wasSend = trans.kind === 'send';
      const greet = trans.greet || (wasSend ? null : cfg.greet);
      trans = null;
      pAlpha.fill(0, 0, N_TRANSIT);
      shared.uDissolve.value = 0;
      if (wasSend) { if (greet) outcome(greet); }
      else react(greet);
    }
  }

  // Mist pool: one ring buffer for click puffs, the wake trail and anything that sheds.
  function spawn(x, y, z, vx, vy, vz, life, alpha) {
    const i = pool.next;
    pool.next = (pool.next + 1) % N_POOL;
    const j = N_TRANSIT + i;
    pPos[j * 3] = x; pPos[j * 3 + 1] = y; pPos[j * 3 + 2] = z;
    pool.vel[i * 3] = vx; pool.vel[i * 3 + 1] = vy; pool.vel[i * 3 + 2] = vz;
    pool.life[i] = life;
    pool.age[i] = 0;
    pool.a0[i] = alpha;
    pool.live = N_POOL;
  }

  const sv = new THREE.Vector3();
  function sampleOne(out) {
    const m = meshes[(Math.random() * meshes.length) | 0];
    m.getVertexPosition((Math.random() * m.geometry.attributes.position.count) | 0, out);
    return m.localToWorld(out);
  }

  // Click: a soft cloud breathes out of the chest
  function puff() {
    if (reduced) return;
    root.updateMatrixWorld(true);
    const c = new THREE.Vector3(0, modelH * 0.62, modelH * 0.1).applyMatrix4(root.matrixWorld);
    const H = at.h * view.wpp;
    for (let n = 0; n < 90; n++) {
      const th = Math.random() * Math.PI * 2, ph = Math.acos(2 * Math.random() - 1);
      const sp = H * (0.25 + Math.random() * 0.5);
      spawn(c.x, c.y, c.z,
        Math.sin(ph) * Math.cos(th) * sp, Math.abs(Math.cos(ph)) * sp * 0.6, Math.sin(ph) * Math.sin(th) * sp * 0.5,
        1.2 + Math.random() * 1.2, 0.55);
    }
  }

  // Moving within a section: the body sheds a faint wake that the current takes away
  let shedCarry = 0;
  function shed(dt) {
    if (reduced || trans || shared.uDissolve.value > 0.4) return;
    const speed = Math.hypot(vel.x, vel.y);
    shedCarry += Math.max(0, speed - 25) * dt * 0.09;
    const H = at.h * view.wpp;
    while (shedCarry >= 1) {
      shedCarry -= 1;
      sampleOne(sv);
      spawn(sv.x, sv.y, sv.z,
        -vel.x * view.wpp * 0.15 + (Math.random() - 0.5) * H * 0.05,
        vel.y * view.wpp * 0.15 + H * 0.04,
        (Math.random() - 0.5) * H * 0.05,
        1.0 + Math.random() * 0.9, 0.35);
    }
  }

  function stepPool(dt) {
    if (!pool.live) return;
    const H = Math.max(at.h * view.wpp, 1e-3);
    const drag = Math.exp(-1.6 * dt);
    let alive = 0;
    for (let i = 0; i < N_POOL; i++) {
      const j = N_TRANSIT + i;
      pool.age[i] += dt;
      const k = pool.age[i] / pool.life[i];
      if (k >= 1) { pAlpha[j] = 0; continue; }
      alive++;
      const f = flow(pPos[j * 3] / H, pPos[j * 3 + 1] / H, pPos[j * 3 + 2] / H + i, time);
      pool.vel[i * 3] = pool.vel[i * 3] * drag + f[0] * H * 0.12 * dt;
      pool.vel[i * 3 + 1] = pool.vel[i * 3 + 1] * drag + f[1] * H * 0.12 * dt;
      pool.vel[i * 3 + 2] = pool.vel[i * 3 + 2] * drag + f[2] * H * 0.12 * dt;
      pPos[j * 3] += pool.vel[i * 3] * dt;
      pPos[j * 3 + 1] += pool.vel[i * 3 + 1] * dt;
      pPos[j * 3 + 2] += pool.vel[i * 3 + 2] * dt;
      const fadeIn = Math.min(1, pool.age[i] / 0.15);
      pAlpha[j] = pool.a0[i] * fadeIn * Math.pow(1 - k, 1.5);
    }
    pool.live = alive;
  }

  // Lantern motes: a slow orbit around the feet and knees
  function stepMotes() {
    const vis = 1 - shared.uDissolve.value;
    const s = root.scale.x;
    for (let i = 0; i < N_MOTE; i++) {
      const j = N_TRANSIT + N_POOL + i;
      const a = motePhase[i * 3] + time * motePhase[i * 3 + 1] * 0.55;
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
    const k = reduced ? 1 : damp(3.2, dt);
    look.yaw += (yaw - look.yaw) * k;
    look.pitch += (pitch - look.pitch) * k;
    nod.v += (-nod.x * 110 - nod.v * 11) * dt;
    nod.x += nod.v * dt;
    shakeT += dt;
    const shake = shakeT < 1.4 ? 0.5 * Math.sin(shakeT * 14) * (1 - shakeT / 1.4) : 0;
    const parts = neckBone ? [[neckBone, 0.35], [headBone, 0.65]] : [[headBone, 1]];
    for (const [bone, w] of parts) {
      bone.parent.updateWorldMatrix(true, false);
      bone.parent.getWorldQuaternion(qParent);
      pivot.getWorldQuaternion(qRoot);
      qOff.setFromEuler(eTmp.set((look.pitch + nod.x) * w, (look.yaw + shake) * w, 0, 'YXZ'));
      // offset expressed in the root frame -> bone's parent frame
      qOff.premultiply(qRoot).multiply(qTmp.copy(qRoot).invert());
      qOff.premultiply(qTmp.copy(qParent).invert()).multiply(qParent);
      bone.quaternion.premultiply(qOff);
      bone.updateMatrixWorld(true);
    }
  }

  // Swing a bone so the direction to its child turns toward a target (weighted).
  const vA = new THREE.Vector3();
  const vB = new THREE.Vector3();
  const qSw = new THREE.Quaternion();
  const qId = new THREE.Quaternion();
  function swing(bone, child, target, w) {
    bone.getWorldPosition(vA);
    child.getWorldPosition(vB);
    vB.sub(vA).normalize();
    vA.subVectors(target, vA).normalize();
    qSw.setFromUnitVectors(vB, vA);
    qSw.copy(qId.identity().slerp(qSw, w));
    bone.parent.updateWorldMatrix(true, false);
    bone.parent.getWorldQuaternion(qParent);
    qSw.premultiply(qTmp.copy(qParent).invert()).multiply(qParent);
    bone.quaternion.premultiply(qSw);
    bone.updateMatrixWorld(true);
  }

  // Two-bone reach: place the elbow (bent down and back, away from the card),
  // then lay the forearm onto the target.
  const kS = new THREE.Vector3(), kE = new THREE.Vector3(), kH = new THREE.Vector3();
  const kDir = new THREE.Vector3(), kPole = new THREE.Vector3(), kTo = new THREE.Vector3();
  function reach(arm, target, w) {
    const [upper, lower, hand] = arm;
    upper.getWorldPosition(kS);
    lower.getWorldPosition(kE);
    hand.getWorldPosition(kH);
    const a = kS.distanceTo(kE), b = kE.distanceTo(kH);
    kDir.subVectors(target, kS);
    const full = kDir.length() || 1e-6;
    kDir.divideScalar(full);
    const d = clamp(full, Math.abs(a - b) + 1e-5, (a + b) * 0.995);
    const alpha = Math.acos(clamp((a * a + d * d - b * b) / (2 * a * d), -1, 1));
    kPole.set(-0.35, -1, -0.45);
    kPole.addScaledVector(kDir, -kPole.dot(kDir)).normalize();
    kTo.copy(kS).addScaledVector(kDir, a * Math.cos(alpha)).addScaledVector(kPole, a * Math.sin(alpha));
    swing(upper, lower, kTo, w);
    kTo.copy(kS).addScaledVector(kDir, d);
    swing(lower, hand, kTo, w);
  }

  // world -> canvas px (inverse of toWorld)
  function toCanvas(v) {
    const k = (CAM_Z - v.z) / CAM_Z;
    return [v.x / (view.wpp * k) + view.w / 2, view.h / 2 - v.y / (view.wpp * k)];
  }

  // Contact: it holds the terminal card by its left edge. When the focus moves to
  // another field it gives the card a jolt, as if it had moved the cursor itself.
  const gripTo = new THREE.Vector3();
  function gripCard(dt) {
    tug.v += (-tug.x * 60 - tug.v * 4.2) * dt;
    tug.x += tug.v * dt;
    const card = nodes.terminal;
    const here = section === 'contato' && !view.dock && card;
    // the card wobbles with the jolt (individual transform properties compose with
    // the card's own transform and transitions)
    if (here && !reduced && (Math.abs(tug.x) > 0.002 || Math.abs(tug.v) > 0.02)) {
      card.style.translate = `${(-tug.x * 16).toFixed(2)}px ${(tug.x * 4).toFixed(2)}px`;
      card.style.rotate = `${(-tug.x * 2.6).toFixed(3)}deg`;
      cardStyled = true;
    } else if (cardStyled) {
      card.style.translate = '';
      card.style.rotate = '';
      cardStyled = false;
    }
    const near = goal && Math.hypot(goal.x - at.x, goal.y - at.y) < at.h * 0.25;
    const on = !!(here && goal.grip && near && !trans && !oneShot && arms.length);
    grip.w += ((on ? 1 : 0) - grip.w) * (reduced ? 1 : damp(3.5, dt));
    // The left arm is behind the card whenever the guide stands at it (holding it,
    // waving, dancing, or dissolving on the way out), never flipping sides mid-view:
    // whatever of that arm overlaps the card is hidden.
    const atCard = card && !view.dock && (here ? goal && goal.grip : trans && trans.phase === 'out' && trans.from === 'contato');
    shared.uCardOn.value = atCard ? 1 : 0;
    if (!card || view.dock || (!atCard && grip.w < 0.01)) return;
    const r = card.getBoundingClientRect();
    const [ox, oy] = clientToCanvas(r.left, r.top);
    const pr = renderer.getPixelRatio();
    shared.uCardRect.value.set(ox * pr, (view.h - oy - r.height) * pr, (ox + r.width) * pr, (view.h - oy) * pr);
    // keep reaching while the weight fades (leaving the section), so the arms ease off
    if (grip.w < 0.01 || !arms.length) return;
    const w = grip.w * grip.w * (3 - 2 * grip.w);
    arms.forEach((arm, i) => {
      arm[0].getWorldPosition(kS);
      const [, sy] = toCanvas(kS);
      // left hand reaches round behind the edge, right hand holds it in front, lower
      const y = clamp(sy + at.h * (i === 0 ? 0.02 : 0.12) + tug.x * at.h * 0.03, oy + 18, oy + r.height - 18);
      const x = i === 0 ? ox + at.h * 0.1 : ox + 7;
      toWorld(x, y, kS.z, gripTo);
      reach(arm, gripTo, w);
    });
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
  const form = $('#terminal-form');
  if (out && 'MutationObserver' in window) {
    new MutationObserver((records) => {
      // several lines can land in one go (status + hint), so read every added line
      let txt = '';
      for (const r of records) for (const n of r.addedNodes) txt += ' ' + n.textContent;
      // a form error: shake the head "no" (a failed send is told by result() instead)
      if (/ERROR/i.test(txt) && !sending()) {
        if (!reduced) shakeT = 0;
        setFace('sad', 1);
      }
      markInput();
    }).observe(out, { childList: true, subtree: true });
  }
  if (form) {
    // moving to another field: it jolts the card it holds, as if it moved the cursor
    let lastField = null;
    form.addEventListener('focusin', (e) => {
      const field = e.target.matches('input, textarea') ? e.target : null;
      if (!reduced && field && field !== lastField && grip.w > 0.3) tug.v += 4.6;
      if (field) lastField = field;
      markInput();
    });
    form.addEventListener('focusout', () => markInput());
    // every few keystrokes, a small nod: it is reading along
    let keys = 0;
    form.addEventListener('input', () => {
      if (reduced) return;
      if (++keys % 3 === 0) nod.v += 2.4;
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
    scrollV += (v - scrollV) * damp(4, dt);
    const leanT = reduced ? 0 : clamp(scrollV / 2600, -1, 1);
    lean += (leanT - lean) * damp(2.4, dt);

    pollSection(now);

    if (!trans) {
      goal = anchorFor(section);
      if (reduced) {
        snapTo(goal);
      } else {
        // A soft spring with a little overshoot: it drifts to its spot and settles,
        // instead of sliding on rails. Seated on a card it holds on tight.
        const stiff = goal.seat ? 170 : 11;
        const dampC = 2 * Math.sqrt(stiff) * (goal.seat ? 1 : 0.72);
        const h = Math.min(dt, 1 / 30);
        for (let n = dt; n > 1e-6; n -= h) {
          const st = Math.min(h, n);
          vel.x += ((goal.x - at.x) * stiff - vel.x * dampC) * st;
          vel.y += ((goal.y - at.y) * stiff - vel.y * dampC) * st;
          at.x += vel.x * st;
          at.y += vel.y * st;
        }
        const k = damp(2.6, dt);
        at.h += (goal.h - at.h) * k;
        at.yaw += (goal.yaw - at.yaw) * k;
      }
    }
    stepTransit(dt);
    placeRoot();

    // float, lean, turn toward what it looks at
    const cfg = SECTIONS[section] || SECTIONS.inicio;
    const floating = cfg.float && !reduced;
    // Adrift: layered slow sines (never quite repeating), a body that trails its own
    // motion like something pushed through water, and the scroll current on top.
    const hpx = Math.max(at.h, 1);
    const driftX = clamp(vel.x / (hpx * 3.2), -0.32, 0.32);
    const driftY = clamp(vel.y / (hpx * 4.5), -0.25, 0.25);
    if (floating) {
      pivot.position.x = modelH * (0.035 * Math.sin(time * 0.37) + 0.018 * Math.sin(time * 0.83 + 1.3));
      pivot.position.y = modelH * (0.04 + 0.028 * Math.sin(time * 1.05) + 0.016 * Math.sin(time * 0.47 + 2.1)) - lean * modelH * 0.06;
      pivot.position.z = modelH * 0.03 * Math.sin(time * 0.29 + 0.7);
      pivot.rotation.z = 0.045 * Math.sin(time * 0.61) + 0.025 * Math.sin(time * 1.13 + 0.4) + driftX;
    } else {
      pivot.position.set(0, 0, 0);
      pivot.rotation.z = goal && goal.seat ? 0 : driftX * 0.5;
    }
    pivot.rotation.z += tug.x * 0.25 * grip.w; // leans back with the jolt on the card
    pivot.rotation.x = lean * 0.3 + driftY + (floating ? 0.03 * Math.sin(time * 0.53 + 1.7) : 0);
    pivot.rotation.y = at.yaw + look.yaw * 0.35 + (floating ? 0.06 * Math.sin(time * 0.31) : 0);

    // Bones the current clip doesn't animate keep last frame's look offset: undo it first.
    for (const r of restPose) r.bone.quaternion.copy(r.q);
    if (!reduced) mixer.update(dt);
    else if (!mixer.time) mixer.update(0.5);
    for (const r of restPose) r.q.copy(r.bone.quaternion);
    model.updateMatrixWorld(true);
    dangleLegs(dt, cfg.base === 'sit' && !oneShot);
    aimHead(dt, now);
    gripCard(dt);
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

    shed(dt);
    stepPool(dt);
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
  window.__avatar = { dbg, renderer, react, travelTo, get section() { return section; }, get trans() { return trans; }, get grip() { return { w: grip.w, tug: tug.x }; } };
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
  m.userData.uClip = { value: 0 }; // 1 = this part can pass behind the contact card
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, shared);
    sh.uniforms.uClip = m.userData.uClip;
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
        uniform float uClip; uniform float uCardOn; uniform vec4 uCardRect;
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
        if (uClip * uCardOn > 0.5 && gl_FragCoord.x > uCardRect.x && gl_FragCoord.x < uCardRect.z
            && gl_FragCoord.y > uCardRect.y && gl_FragCoord.y < uCardRect.w) discard;
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
        totalEmissiveRadiance += uRim * aRim * RIM_STRENGTH + uEdge * aEdge * 1.6;`
      );
  };
  m.customProgramCacheKey = () => 'abyssal-avatar';
  return m;
}
