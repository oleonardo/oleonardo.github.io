/**
 * Leonardo de Oliveira · Abissal
 * avatar-scene.js: the guide. A small 3D character that lives in the particle sea,
 * follows the visitor with its eyes, reacts to scroll and clicks, and moves between
 * the sections in plain sight on its jetpack: it flies in and lands at the hero on its
 * rockets, then flies from section to section and sets down on its feet. Through the
 * timeline every card is a time tunnel: it flies in at one end, behind the card, and
 * out of the portal at the other.
 *
 * Proof of concept: the model is a CC0 placeholder (RobotExpressive by Tomás Laulhé)
 * that will be swapped for Léo's own avatar. Everything that depends on the model
 * lives in MODEL and CLIPS below.
 *
 * Started by avatar.js as soon as the page is parsed: it is always on the page.
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
    Jet: { color: 0x0a0f18, emissive: 0xffb35c, glow: 0 }, // the jetpack's nozzles (glow set by the thrust)
    Pad: { color: 0x0a0f18, metal: 0.15, rough: 0.75 }, // the headphones' cushions
    Beat: { color: 0x050810, emissive: 0x63e6d2, glow: 0 }, // the ring on each cup (glow set by the music)
  },
  // Headphones, measured in the head's own box so another head needs no new numbers:
  // across in half-widths from its middle, up in heights from its underside; sizes in
  // half-widths.
  phones: {
    reach: 1.13, // a cup's middle, out from the head's middle
    ear: 0.36, // the ears' height
    crown: 1.13, // the top of the band's arch
    cup: [0.3, 0.15], // a cup's radius and thickness (slim: the right arm swings close by in Wave and Dance)
    pad: [0.33, 0.06], // its cushion
    ring: [0.19, 0.026], // the glowing ring on its outer face
    band: [0.053, 2.2], // the band's radius, and how much wider than thick it is
    // hovering over the ears, where they take shape and where they come apart: lifted
    // (in heights) and opened out a little wider than the head
    hover: { lift: 0.36, open: 1.09 },
    motes: 320, // the particles they are made of, coming and going
  },
  headBone: 'Head',
  neckBone: 'Neck',
  face: { mesh: 'Head', surprised: 'Surprised', sad: 'Sad' },
  // Arm chains (upper arm, forearm, hand) used to hold the contact card
  arms: [['UpperArm.L', 'LowerArm.L', 'Palm2.L'], ['UpperArm.R', 'LowerArm.R', 'Palm2.R']],
  // The cheer on a new video card, posed from the clips' own right arm: the raised
  // arm of Wave with the index pointing up, then the fist and thumb of ThumbsUp.
  cheer: {
    arm: ['Shoulder.R', 'UpperArm.R', 'LowerArm.R'],
    index: ['Index.R', 'Index2.R'],
    curl: ['Middle1.R', 'Middle2.R', 'Ring1.R', 'Ring2.R'],
    thumb: ['Thumb.R', 'Thumb2.R'],
    point: ['Wave', 0.7], // clip and time of the raised arm
    up: ['ThumbsUp', 0.9], // clip and time of the thumbs-up
  },
  // Meshes of the left arm: while holding the card, that hand reaches behind it
  behindCard: ['Hand.L', 'Arm.L'],
};

const CLIPS = {
  idle: 'Idle',
  run: 'Running',
  wave: 'Wave',
  yes: 'Yes',
  no: 'No',
  thumbs: 'ThumbsUp',
  jump: 'Jump',
  dance: 'Dance',
};

// What the guide does in each section of the page.
const SECTIONS = {
  inicio: { base: 'idle', greet: 'wave', float: false }, // (it lands on the hero's floor and stands there)
  historia: { base: 'idle', greet: 'yes', float: true }, // (on desktop it flies through the cards instead)
  projetos: { base: 'idle', greet: 'thumbs', float: false },
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
const FOV = 30;

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const clamp01 = (v) => clamp(v, 0, 1);
const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const smooth = (x) => x * x * (3 - 2 * x);
const TAU = Math.PI * 2;
const wrapPi = (a) => a - TAU * Math.round(a / TAU);
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
  const tilt = new THREE.Group(); // flying level: pitched about the middle of the body, in its own frame
  tilt.add(model);
  pivot.add(tilt);
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
    uCardRect: { value: new THREE.Vector4() }, // the contact card (or a story card), in drawing-buffer pixels
    uCardOn: { value: 0 },
    uClipAll: { value: 0 }, // 1 = the whole body passes behind a card (a time tunnel, the case it fell into, the last case)...
    uAllRect: { value: new THREE.Vector4() }, // ...this one (its own rect: the contact card's arm clip stays as it is)
  };
  const meshes = [];
  let faceMesh = null;
  let headBone = null;
  let neckBone = null;
  const bare = (n) => n.replace(/[.\s]/g, '');
  const bonesByName = {};
  model.traverse((o) => {
    if (o.isBone && !bonesByName[bare(o.name)]) bonesByName[bare(o.name)] = o;
  });
  const arms = MODEL.arms.map((chain) => chain.map((n) => bonesByName[bare(n)])).filter((c) => c.every(Boolean));
  model.traverse((o) => {
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

  // The cheer's poses, sampled from the clips: for each bone, where it is while
  // pointing up and while giving the thumbs-up.
  const cheerBones = [];
  {
    const C = MODEL.cheer;
    const sample = ([clipName, at], bone) => {
      const clip = THREE.AnimationClip.findByName(gltf.animations, clipName);
      const tr = clip && clip.tracks.find((t) => t.name === `${bone.name}.quaternion`);
      if (!tr) return bone.quaternion.clone();
      const v = tr.createInterpolant(new Float32Array(4)).evaluate(at);
      return new THREE.Quaternion(v[0], v[1], v[2], v[3]);
    };
    const add = (names, point) => names.forEach((n) => {
      const bone = bonesByName[bare(n)];
      if (bone) cheerBones.push({ bone, point: point(bone), up: sample(C.up, bone) });
    });
    add(C.arm, (b) => sample(C.point, b));
    add(C.index, (b) => sample(C.point, b)); // open: the index straight up
    add(C.curl, (b) => sample(C.up, b)); // curled into the fist
    add(C.thumb, (b) => b.quaternion.clone()); // relaxed
  }

  // The soles: the vertices of the rigid foot meshes riding on the foot bones
  // (the ankle bone itself sits well above the toes).
  const soles = [];
  for (const [foot, n] of ['Foot.L', 'Foot.R'].entries()) {
    const bone = bonesByName[bare(n)];
    if (!bone) continue;
    bone.traverse((o) => {
      if (!o.isMesh || o.isSkinnedMesh) return;
      const a = o.geometry.attributes.position;
      const step = Math.max(1, Math.ceil(a.count / 160));
      const pts = [];
      for (let i = 0; i < a.count; i += step) pts.push(new THREE.Vector3().fromBufferAttribute(a, i));
      soles.push({ mesh: o, pts, foot });
    });
  }
  const vSole = new THREE.Vector3();
  const footLow = [Infinity, Infinity]; // each foot's lowest point, as soleY last found it (see stepHeard)
  function soleY() {
    footLow[0] = footLow[1] = Infinity;
    for (const s of soles) for (const p of s.pts) footLow[s.foot] = Math.min(footLow[s.foot], model.worldToLocal(vSole.copy(p).applyMatrix4(s.mesh.matrixWorld)).y);
    return Math.min(footLow[0], footLow[1]);
  }


  // Measure the model once to map "pixels tall" to a scale.
  model.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(model);
  const size = box.getSize(new THREE.Vector3());
  const modelH = size.y || 1;
  model.position.y = -box.min.y;
  shared.uNoiseScale.value = 7 / modelH;
  // how high the soles sit when standing (model space): the run is pinned to it
  const footRest = soles.length ? soleY() : 0;
  shared.uHeight.value = modelH;
  // Flying level, the body turns about its middle (as a fraction of its height), so a
  // pitch doesn't swing it round its feet.
  const BODY_C = 0.46;
  // (spin: about its own long axis, head to feet, applied first; bank: sideways. Both 0
  // outside the case launch and the hero entrance.)
  const vTilt = new THREE.Vector3();
  function setTilt(a, spin = 0, bank = 0) {
    tilt.rotation.set(a, spin, bank);
    vTilt.set(0, BODY_C * modelH, 0).applyEuler(tilt.rotation);
    tilt.position.set(-vTilt.x, BODY_C * modelH - vTilt.y, -vTilt.z);
  }

  // Rig for the poses the clips don't have: the take-off, the fall, hovering and flying
  // through the time tunnels, landing on its backside and getting up. A pose is a set
  // of aims in model space (forward +z, up +y, x mirrored per side), so it doesn't
  // depend on the bones' own axes. The feet are free IK targets in this rig; in these poses they ride on the
  // shins instead, the way they hang in the bind pose.
  const nodeByBare = {};
  model.traverse((o) => {
    const k = bare(o.name);
    if (!nodeByBare[k] || (o.isBone && !nodeByBare[k].isBone)) nodeByBare[k] = o;
  });
  model.updateMatrixWorld(true);
  const sideOf = (o) => Math.sign(model.worldToLocal(o.getWorldPosition(new THREE.Vector3())).x) || 1;
  const rigBody = bonesByName.Body || null;
  const rigHips = bonesByName.Hips || null;
  const legs = [['UpperLeg.L', 'LowerLeg.L', 'LowerLeg.L_end', 'Foot.L'], ['UpperLeg.R', 'LowerLeg.R', 'LowerLeg.R_end', 'Foot.R']]
    .map((c) => c.map((n) => nodeByBare[bare(n)]))
    .filter((c) => c.every(Boolean))
    .map(([upper, lower, end, foot]) => ({
      upper, lower, end, foot,
      side: sideOf(upper),
      rel: new THREE.Matrix4().copy(lower.matrixWorld).invert().multiply(foot.matrixWorld), // foot on the shin
      flatQ: model.getWorldQuaternion(new THREE.Quaternion()).invert().multiply(foot.getWorldQuaternion(new THREE.Quaternion())), // flat, in model space
    }));
  const armSide = arms.map((a) => sideOf(a[0]));
  const rigOK = !!(rigBody && rigHips && legs.length === 2 && arms.length === 2);
  const rigBones = rigOK ? [...new Set([rigBody, rigHips, ...legs.flatMap((l) => [l.upper, l.lower, l.foot]), ...arms.flat()])] : [];
  // A sparse cloud of points on the rigid parts: whatever is lowest touches the floor.
  const floorPts = [];
  for (const o of meshes) {
    if (o.isSkinnedMesh || bare(o.name) === bare(MODEL.face.mesh)) continue;
    const a = o.geometry.attributes.position;
    const step = Math.max(1, Math.ceil(a.count / 90));
    for (let i = 0; i < a.count; i += step) floorPts.push([o, new THREE.Vector3().fromBufferAttribute(a, i)]);
  }

  // The jetpack: two tanks on a back plate, strapped to the torso so it follows every
  // pose, with a nozzle under each tank. Built in model space from the torso's own size
  // (back is -z), then handed to the torso bone. Its parts take the same Abissal look,
  // dissolve and card masks as the body; the nozzles' amber glow follows the thrust.
  const jet = { group: null, nozzles: [], flames: [], glow: null, thrust: 0, boost: 0, lit: false };
  {
    let torsoBone = null, torsoMesh = null;
    model.traverse((o) => { if (!torsoBone && o.isBone && /^Torso(_\d+)?$/.test(bare(o.name))) torsoBone = o; });
    torsoBone = torsoBone || rigBody;
    model.traverse((o) => { if (!torsoMesh && !o.isBone && bare(o.name) === 'Torso') torsoMesh = o; }); // (a mesh, or the group of its parts)
    if (torsoBone && torsoMesh) {
      model.updateMatrixWorld(true);
      const tb = new THREE.Box3().setFromObject(torsoMesh);
      const inv = new THREE.Matrix4().copy(model.matrixWorld).invert();
      tb.applyMatrix4(inv);
      const tw = tb.max.x - tb.min.x, th = tb.max.y - tb.min.y;
      const look = (name) => abyssalize(new THREE.MeshStandardMaterial({ name }), shared);
      const shell = look('Main'), metal = look('Grey'), glow = look('Jet');
      const flame = (color, opacity) => {
        const m = abyssalize(new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }), shared);
        m.customProgramCacheKey = () => 'abyssal-flame';
        return m;
      };
      const flameOut = flame(0xffb35c, 0.5), flameIn = flame(0xfff0d8, 0.85);
      const g = new THREE.Group();
      const r = tw * 0.17, len = th * 0.62;
      const plate = new THREE.Mesh(new THREE.BoxGeometry(tw * 0.62, len * 1.05, r * 0.5), metal);
      g.add(plate);
      for (const sx of [-1, 1]) {
        const tank = new THREE.Mesh(new THREE.CapsuleGeometry(r, len - 2 * r, 6, 16), shell);
        tank.position.set(sx * tw * 0.2, 0, -r * 0.95);
        g.add(tank);
        // a band round each tank, in the joints' steel
        const band = new THREE.Mesh(new THREE.CylinderGeometry(r * 1.06, r * 1.06, len * 0.1, 16), metal);
        band.position.copy(tank.position).setY(len * 0.18);
        g.add(band);
        const nozzle = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.62, r * 0.86, r * 0.75, 16, 1, true), metal);
        nozzle.position.set(tank.position.x, -len / 2 - r * 0.25, tank.position.z);
        nozzle.material.side = THREE.DoubleSide;
        g.add(nozzle);
        const core = new THREE.Mesh(new THREE.CircleGeometry(r * 0.6, 16), glow);
        core.rotation.x = Math.PI / 2; // facing down, out of the nozzle
        core.position.set(0, -r * 0.2, 0);
        nozzle.add(core);
        // where the exhaust leaves: the nozzle's mouth, pointing down its axis
        const mouth = new THREE.Object3D();
        mouth.position.set(0, -r * 0.45, 0);
        nozzle.add(mouth);
        jet.nozzles.push(mouth);
        // the flame: a white-hot core in an amber plume, stretched by the thrust
        for (const [rad, ln, mat] of [[r * 0.58, r * 3.2, flameOut], [r * 0.32, r * 2.0, flameIn]]) {
          const cone = new THREE.Mesh(new THREE.ConeGeometry(rad, ln, 14, 1, true).rotateX(Math.PI).translate(0, -ln / 2, 0), mat);
          cone.renderOrder = 1;
          mouth.add(cone);
          jet.flames.push(cone);
        }
      }
      g.position.set((tb.min.x + tb.max.x) / 2, tb.min.y + th * 0.52, tb.min.z - r * 0.15);
      g.rotation.x = -0.12; // its nozzles tipped a little back, away from the legs
      model.add(g);
      torsoBone.attach(g);
      g.traverse((o) => { if (o.isMesh) o.frustumCulled = false; });
      jet.group = g;
      jet.glow = glow;
    }
  }

  // The headphones: there while the sound is on, and only then. Switched on, they take
  // shape out of a swirl of motes, hovering open over its ears, and clamp down on to
  // them; switched off, they lift off and come apart into motes that the current takes
  // away. Built in the head bone's own frame from the head's box, the way the jetpack is
  // from the torso's, so they follow every turn of the head. Same Abissal look and card
  // masks as the body, but a dissolve of their own, and a ring on each cup that glows
  // with the music.
  const phones = { group: null, rig: null, band: null, cups: [], spots: [], glow: null, dis: null, reach: 0, y0: 0, lift: 0, want: 'gone', k: 0, kv: 0, vis: 0, visT: 0, hold: 0, lvl: 0, flash: 0, landed: true, fx: null };
  if (headBone && MODEL.phones) {
    const C = MODEL.phones;
    model.updateMatrixWorld(true);
    const inv = new THREE.Matrix4().copy(headBone.matrixWorld).invert();
    const hb = new THREE.Box3(), hv = new THREE.Vector3(), hm = new THREE.Matrix4();
    headBone.traverse((o) => {
      if (!o.isMesh) return;
      hm.multiplyMatrices(inv, o.matrixWorld);
      const a = o.geometry.attributes.position;
      for (let i = 0; i < a.count; i++) hb.expandByPoint(hv.fromBufferAttribute(a, i).applyMatrix4(hm));
    });
    if (hb.isEmpty()) console.warn('[avatar] no headphones: no mesh rides on the head bone to measure them from');
    else {
      const hw = (hb.max.x - hb.min.x) / 2, hh = hb.max.y - hb.min.y;
      const mine = { ...shared, uDissolve: { value: 1 } };
      const look = (name) => abyssalize(new THREE.MeshStandardMaterial({ name }), mine);
      const shell = look('Grey'), pad = look('Pad'), glow = look('Beat');
      const g = new THREE.Group();
      const rig = new THREE.Group(); // its origin on the line through the ears
      rig.position.set((hb.min.x + hb.max.x) / 2, hb.min.y + C.ear * hh, (hb.min.z + hb.max.z) / 2);
      g.add(rig);
      // the band: an arch from ear to ear over the top of the head
      const reach = C.reach * hw, rise = (C.crown - C.ear) * hh;
      const arch = [];
      for (let i = 0; i <= 24; i++) {
        const a = (i / 24) * Math.PI;
        arch.push(new THREE.Vector3(Math.cos(a) * reach, Math.sin(a) * rise, 0));
      }
      const band = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(arch), 48, C.band[0] * hw, 8, false), shell);
      band.scale.z = C.band[1];
      rig.add(band);
      const [rc, tc] = C.cup, [rp, tp] = C.pad, [rr, rt] = C.ring;
      for (const side of [-1, 1]) {
        const cup = new THREE.Group();
        cup.position.x = side * reach;
        const body = new THREE.Mesh(new THREE.CylinderGeometry(rc * hw * 0.9, rc * hw, tc * hw, 28).rotateZ(-side * Math.PI / 2), shell); // (narrower on the outside)
        cup.add(body);
        const cushion = new THREE.Mesh(new THREE.CylinderGeometry(rp * hw, rp * hw, tp * hw, 28).rotateZ(Math.PI / 2), pad);
        cushion.position.x = -side * (tc + tp) * hw * 0.5;
        cup.add(cushion);
        const ring = new THREE.Mesh(new THREE.TorusGeometry(rr * hw, rt * hw, 10, 36).rotateY(Math.PI / 2), glow);
        ring.position.x = side * tc * hw * 0.5;
        cup.add(ring);
        rig.add(cup);
        phones.cups.push({ group: cup, side });
      }
      // Where their motes belong: places all over the band and the cups, in the rig's
      // frame (part: 0 on the band, else the side of the cup it is on).
      const spots = [];
      for (let i = 0; i < C.motes; i++) {
        if (i % 2 === 0) {
          const a = Math.random() * Math.PI, j = C.band[0] * hw * 1.6;
          spots.push({ part: 0, x: Math.cos(a) * reach + (Math.random() - 0.5) * j, y: Math.sin(a) * rise + (Math.random() - 0.5) * j, z: (Math.random() - 0.5) * j * C.band[1] });
        } else {
          const side = i % 4 === 1 ? -1 : 1, a = Math.random() * TAU, r = rc * hw * (0.5 + 0.55 * Math.random());
          spots.push({ part: side, x: side * (Math.random() - 0.3) * tc * hw, y: Math.sin(a) * r, z: Math.cos(a) * r });
        }
      }
      g.traverse((o) => { if (o.isMesh) o.frustumCulled = false; });
      headBone.add(g);
      Object.assign(phones, { group: g, rig, band, spots, glow, dis: mine.uDissolve, reach, y0: rig.position.y, lift: C.hover.lift * hh });
    }
  }
  // What it does can be heard (sound.js): an effect, by its id. Nothing happens while the
  // sound is off, where the page has none, or for an id that has no file yet.
  function sfx(id, opt) {
    const a = window.abissalAudio;
    if (!a || !a.play) return;
    // (nothing of the guide's while the page hides it: docked with a form field in
    // focus, or under an open scene. The transmission is the page's own event.)
    if (id !== 'transmit' && ((view.dock && formFocused()) || (sceneOpen() && !canvas.classList.contains('is-exit')))) return;
    a.play(id, opt);
  }
  // Where the sound stands (sound.js: off, armed, loading, on): on, or about to be,
  // and they are on it; anything else and it has none.
  function soundState(s, quiet) {
    const P = phones;
    if (!P.group) return;
    const next = s === 'on' || s === 'loading' ? 'on' : 'gone';
    if (quiet) { // (as the guide is set up: they are simply where they belong)
      P.want = next;
      P.k = P.vis = P.visT = next === 'on' ? 1 : 0;
      return;
    }
    if (next === P.want) return;
    P.want = next;
    P.landed = next === 'on' ? false : P.k < 0.5; // (nothing to lift off if they never got on)
    dirty = true; // (with reduced motion the loop sleeps between inputs: draw them now)
    markInput();
  }
  // One of their motes' places, in the world, as the headphones are right now.
  const pv = new THREE.Vector3();
  function spotWorld(s, across, out) {
    return out.set(s.part ? s.part * phones.reach * across + s.x : s.x * across, s.y, s.z).applyMatrix4(phones.rig.matrixWorld);
  }
  // Motes in: scattered round and above the head, they swirl in to their places. Motes
  // out: from their places they are thrown clear and left to the current.
  function phonesFx(mode, across) {
    const P = phones;
    if (!hPts || reduced) return;
    const H = Math.max(at.h * view.wpp, 1e-3) * (view.dock ? 0.4 : 1); // (docked: a small cloud, inside its small frame)
    P.rig.updateWorldMatrix(true, false);
    for (let i = 0; i < hN; i++) {
      const th = Math.random() * TAU, ph = Math.acos(2 * Math.random() - 1);
      const dx = Math.sin(ph) * Math.cos(th), dy = Math.abs(Math.cos(ph)), dz = Math.sin(ph) * Math.sin(th);
      if (mode === 'in') {
        const r = H * (0.2 + 0.5 * Math.random());
        hVel[i * 3] = dx * r; hVel[i * 3 + 1] = dy * r * 0.8 + H * 0.05; hVel[i * 3 + 2] = dz * r; // (here: how far off it starts)
        hDelay[i] = Math.random() * 0.28;
        hLife[i] = 0.42 + Math.random() * 0.24;
        hSwirl[i] = 1.3 + Math.random() * 1.7;
      } else {
        spotWorld(P.spots[i], across, pv);
        hPos[i * 3] = pv.x; hPos[i * 3 + 1] = pv.y; hPos[i * 3 + 2] = pv.z;
        const sp = H * (0.18 + Math.random() * 0.7);
        hVel[i * 3] = dx * sp; hVel[i * 3 + 1] = dy * sp * 0.7 + H * 0.12; hVel[i * 3 + 2] = dz * sp * 0.6;
        hDelay[i] = Math.random() * 0.14;
        hLife[i] = 0.9 + Math.random() * 1.0;
      }
      hA0[i] = 0.6 + Math.random() * 0.4;
      hAlpha[i] = 0;
    }
    P.fx = { mode, t: 0 };
    hPts.visible = true;
  }
  function stepPhonesFx(dt, across) {
    const P = phones, F = P.fx;
    if (!F) return;
    F.t += dt;
    const H = Math.max(at.h * view.wpp, 1e-3);
    let alive = 0;
    if (F.mode === 'in') {
      P.rig.updateWorldMatrix(true, false);
      for (let i = 0; i < hN; i++) {
        const u = (F.t - hDelay[i]) / hLife[i];
        if (u >= 1) { hAlpha[i] = 0; continue; }
        alive++;
        if (u <= 0) continue;
        // (fast at first, easing in to its place, turning round the head as it comes)
        const far = Math.pow(1 - u, 3), a = hSwirl[i] * far, ca = Math.cos(a), sa = Math.sin(a);
        const ox = hVel[i * 3], oy = hVel[i * 3 + 1], oz = hVel[i * 3 + 2];
        spotWorld(P.spots[i], across, pv);
        hPos[i * 3] = pv.x + (ox * ca + oz * sa) * far;
        hPos[i * 3 + 1] = pv.y + oy * far;
        hPos[i * 3 + 2] = pv.z + (oz * ca - ox * sa) * far;
        hAlpha[i] = hA0[i] * smooth(clamp01(u / 0.25)) * (1 - smooth(clamp01((u - 0.8) / 0.2)));
      }
    } else {
      const drag = Math.exp(-2.2 * dt);
      for (let i = 0; i < hN; i++) {
        const age = F.t - hDelay[i];
        if (age >= hLife[i]) { hAlpha[i] = 0; continue; }
        alive++;
        if (age <= 0) continue;
        const f = flow(hPos[i * 3] / H, hPos[i * 3 + 1] / H, hPos[i * 3 + 2] / H + i, time);
        for (let c = 0; c < 3; c++) {
          hVel[i * 3 + c] = hVel[i * 3 + c] * drag + f[c] * H * 0.16 * dt;
          hPos[i * 3 + c] += hVel[i * 3 + c] * dt;
        }
        hAlpha[i] = hA0[i] * Math.min(1, age / 0.06) * Math.pow(1 - age / hLife[i], 1.5);
      }
    }
    hPts.geometry.attributes.position.needsUpdate = true;
    hPts.geometry.attributes.aAlpha.needsUpdate = true;
    if (!alive) {
      P.fx = null;
      hPts.visible = false;
    }
  }
  function stepPhones(dt) {
    const P = phones;
    if (!P.group) return;
    const want = dbg.phones || P.want; // (QA: pin them 'on', 'up' (hovering) or 'gone')
    const V = MODEL.phones.hover;
    const there = want !== 'gone';
    // (hovering, they are open a little wider than the head; coming down they close on it)
    let across = 1 + (V.open - 1) * (view.dock ? 0 : 1 - P.k);
    if (reduced) {
      P.vis = P.visT = there ? 1 : 0;
      P.k = want === 'on' ? 1 : 0;
      P.kv = P.hold = 0;
    } else {
      // The order of things. Coming: the motes first, the headphones taking shape in
      // them a moment later, and only once they are there do they come down on the ears.
      // Going: up off the ears first, then to motes.
      const visT = there || P.k > 0.3 ? 1 : 0;
      if (visT !== P.visT) {
        P.visT = visT;
        P.hold = visT ? 0.3 * (1 - P.vis) : 0.04;
        // (no motes for headphones nobody can see: behind a card, the body in mist, or
        // gone again before they had taken shape)
        if (maskHides || tun.hidden || shared.uDissolve.value > 0.5 || (!visT && P.vis < 0.3)) {
          P.fx = null;
          if (hPts) hPts.visible = false;
        } else {
          phonesFx(visT ? 'in' : 'out', across);
          sfx(visT ? 'phones-gather' : 'phones-away');
        }
      }
      P.hold = Math.max(0, P.hold - dt);
      if (!P.hold) {
        P.vis += (visT - P.vis) * damp(visT ? 7 : 10, dt);
        if (Math.abs(visT - P.vis) < 0.004) P.vis = visT;
      }
      // a spring that runs a little past: they clamp on to the ears, and spring up off them
      const onT = want === 'on' && P.vis > 0.7 ? 1 : 0;
      P.kv += ((onT - P.k) * 170 - P.kv * 19) * dt;
      P.k += P.kv * dt;
    }
    // (the body's own dissolve takes them with it; theirs is on top of that)
    P.dis.value = Math.max(shared.uDissolve.value, 1 - P.vis);
    P.group.visible = P.dis.value < 0.999;
    const k = P.k, kc = clamp01(k);
    const hov = view.dock ? 0 : 1 - k; // (no room to hover in the dock's small frame: there they take shape on the ears)
    across = 1 + (V.open - 1) * hov;
    P.rig.position.y = P.y0 + P.lift * hov;
    P.band.scale.set(across, 1, MODEL.phones.band[1]);
    for (const c of P.cups) c.group.position.x = c.side * P.reach * across;
    stepPhonesFx(dt, across);
    // the moment they are on: its head dips under them, and the rings flare
    if (!P.landed && (want === 'on' ? k > 0.9 : k < 0.1)) {
      P.landed = true;
      if (want === 'on' && !reduced) {
        P.flash = 1;
        if (P.dis.value < 0.5 && !maskHides && !tun.hidden) sfx('phones-clamp');
      }
      if (!reduced) nod.v += want === 'on' ? 3 : -1.6;
    }
    P.flash = Math.max(0, P.flash - dt * 2.2);
    // the rings glow with the music
    const audio = window.abissalAudio;
    const lv = !reduced && want === 'on' && audio ? audio.level() : 0; // (a steady ring where nothing may move)
    P.lvl += (lv - P.lvl) * damp(lv > P.lvl ? 18 : 5, dt);
    P.glow.emissiveIntensity = (0.3 + (0.25 + 2.6 * P.lvl) * kc + 2.4 * P.flash * P.flash) * P.vis;
  }

  // Bones posed on top of the clips: reset to the clean clip pose before every update
  // (bones a clip doesn't animate would otherwise keep last frame's offsets).
  const restPose = [...new Set([headBone, neckBone, ...arms.flat(), ...cheerBones.map((c) => c.bone), ...rigBones])]
    .filter(Boolean).map((bone) => ({ bone, q: bone.quaternion.clone(), p: bone.position.clone() }));

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
    next.setLoop(once ? THREE.LoopOnce : THREE.LoopRepeat, Infinity);
    next.clampWhenFinished = !!once;
    // A clip's first play saves the bones' current pose as their "original": make
    // sure that is the clean animated pose, not the arms bent around the card.
    for (const r of restPose) { r.bone.quaternion.copy(r.q); r.bone.position.copy(r.p); }
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
    if (reduced || !actions[name] || (trans && (trans.kind === 'enter' || trans.kind === 'case' || trans.kind === 'pop'))) return;
    fadeTo(name, 0.45, true);
    sfx('chirp-' + name); // (its voice: a phrase for each)
  }
  // The hello on reaching a section. At the contact card with a field already in
  // focus it skips the wave and takes hold of the card straight away.
  function greet(id, name) {
    if (id === 'contato' && formFocused()) return;
    react(name);
  }
  function formFocused() {
    const f = document.getElementById('terminal-form');
    return !!(f && f.contains(document.activeElement));
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

  // The headphones' own motes (see stepPhones): the same sea-light, drawn the same way.
  const hN = phones.spots.length;
  const hPos = new Float32Array(hN * 3), hVel = new Float32Array(hN * 3), hAlpha = new Float32Array(hN);
  const hDelay = new Float32Array(hN), hLife = new Float32Array(hN), hSwirl = new Float32Array(hN), hA0 = new Float32Array(hN);
  let hPts = null;
  if (hN) {
    const hGeo = new THREE.BufferGeometry();
    const hSize = new Float32Array(hN), hTone = new Float32Array(hN);
    for (let n = 0; n < hN; n++) {
      hSize[n] = 3.5 + Math.random() * 6;
      hTone[n] = Math.random() < 0.18 ? 1 : 0;
    }
    hGeo.setAttribute('position', new THREE.BufferAttribute(hPos, 3).setUsage(THREE.DynamicDrawUsage));
    hGeo.setAttribute('aAlpha', new THREE.BufferAttribute(hAlpha, 1).setUsage(THREE.DynamicDrawUsage));
    hGeo.setAttribute('aSize', new THREE.BufferAttribute(hSize, 1));
    hGeo.setAttribute('aTone', new THREE.BufferAttribute(hTone, 1));
    hPts = new THREE.Points(hGeo, pMat);
    hPts.frustumCulled = false;
    hPts.renderOrder = 2;
    hPts.visible = false;
    scene.add(hPts);
  }

  // Jet exhaust: its own small pool, drawn after the body and hidden by it (depth-tested),
  // white-hot at the nozzle, cooling to amber and dying out as teal sea-light. A puff
  // born while the body is behind a card stays behind that card.
  const N_JET = 360;
  const jGeo = new THREE.BufferGeometry();
  const jPos = new Float32Array(N_JET * 3);
  const jAlpha = new Float32Array(N_JET);
  const jSize = new Float32Array(N_JET);
  const jHeat = new Float32Array(N_JET);
  const jClip = new Float32Array(N_JET);
  jGeo.setAttribute('position', new THREE.BufferAttribute(jPos, 3).setUsage(THREE.DynamicDrawUsage));
  jGeo.setAttribute('aAlpha', new THREE.BufferAttribute(jAlpha, 1).setUsage(THREE.DynamicDrawUsage));
  jGeo.setAttribute('aSize', new THREE.BufferAttribute(jSize, 1).setUsage(THREE.DynamicDrawUsage));
  jGeo.setAttribute('aHeat', new THREE.BufferAttribute(jHeat, 1).setUsage(THREE.DynamicDrawUsage));
  jGeo.setAttribute('aClip', new THREE.BufferAttribute(jClip, 1).setUsage(THREE.DynamicDrawUsage));
  const jMat = new THREE.ShaderMaterial({
    uniforms: { uPx: pMat.uniforms.uPx, uScale: pMat.uniforms.uScale, uRect: { value: new THREE.Vector4() }, uAmber: { value: AMBER }, uTeal: { value: TEAL } },
    vertexShader: /* glsl */ `
      attribute float aAlpha; attribute float aSize; attribute float aHeat; attribute float aClip;
      uniform float uPx; uniform float uScale;
      varying float vAlpha; varying float vHeat; varying float vClip;
      void main() {
        vAlpha = aAlpha; vHeat = aHeat; vClip = aClip;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        gl_PointSize = aAlpha > 0.002 ? aSize * uScale * uPx : 0.0;
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uAmber; uniform vec3 uTeal; uniform vec4 uRect;
      varying float vAlpha; varying float vHeat; varying float vClip;
      void main() {
        if (vClip > 0.5 && gl_FragCoord.x > uRect.x && gl_FragCoord.x < uRect.z
            && gl_FragCoord.y > uRect.y && gl_FragCoord.y < uRect.w) discard;
        float d = length(gl_PointCoord - 0.5);
        float a = smoothstep(0.5, 0.0, d);
        a = a * a * vAlpha;
        if (a < 0.004) discard;
        vec3 hot = mix(uAmber, vec3(1.0, 0.95, 0.85), smoothstep(0.75, 1.0, vHeat));
        vec3 c = mix(uTeal, hot, smoothstep(0.1, 0.55, vHeat)) * (1.0 + smoothstep(0.2, 0.0, d) * vHeat);
        gl_FragColor = vec4(min(c, vec3(1.0)), a); // (additive: the colour times a, once)
      }`,
    transparent: true,
    depthWrite: false,
    depthTest: true,
    blending: THREE.AdditiveBlending,
  });
  const jetPoints = new THREE.Points(jGeo, jMat);
  jetPoints.frustumCulled = false;
  jetPoints.renderOrder = 1;
  scene.add(jetPoints);
  const jp = { vel: new Float32Array(N_JET * 3), life: new Float32Array(N_JET), age: new Float32Array(N_JET).fill(1e9), a0: new Float32Array(N_JET), s0: new Float32Array(N_JET), next: 0, live: 0, carry: 0 };

  // Dust: the jets' blast on the hero's floor. Where the exhaust meets the ground it
  // spreads out flat every way at once, a ring of dust and spent heat rolling outward,
  // slowing and billowing up a little as it slows, hot near the jets and cooling to the
  // sea-light as it goes. It lives in the scene's own perspective (the near side lower
  // and bigger, the far side behind the body), and a glow on the floor marks where the
  // blast hits. (The floor is the plane under the hero's spot, at its distance.)
  const N_DUST = 640;
  const dGeo = new THREE.BufferGeometry();
  const dPos = new Float32Array(N_DUST * 3);
  const dAlpha = new Float32Array(N_DUST);
  const dSize = new Float32Array(N_DUST);
  const dHeat = new Float32Array(N_DUST);
  dGeo.setAttribute('position', new THREE.BufferAttribute(dPos, 3).setUsage(THREE.DynamicDrawUsage));
  dGeo.setAttribute('aAlpha', new THREE.BufferAttribute(dAlpha, 1).setUsage(THREE.DynamicDrawUsage));
  dGeo.setAttribute('aSize', new THREE.BufferAttribute(dSize, 1).setUsage(THREE.DynamicDrawUsage));
  dGeo.setAttribute('aHeat', new THREE.BufferAttribute(dHeat, 1).setUsage(THREE.DynamicDrawUsage));
  const dMat = new THREE.ShaderMaterial({
    uniforms: { uPx: pMat.uniforms.uPx, uCam: { value: CAM_Z }, uAmber: { value: AMBER }, uTeal: { value: TEAL } },
    vertexShader: /* glsl */ `
      attribute float aAlpha; attribute float aSize; attribute float aHeat;
      uniform float uPx; uniform float uCam;
      varying float vAlpha; varying float vHeat;
      void main() {
        vAlpha = aAlpha; vHeat = aHeat;
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        gl_Position = projectionMatrix * mv;
        gl_PointSize = aAlpha > 0.002 ? aSize * uPx * uCam / max(1.0, -mv.z) : 0.0; // (nearer, bigger)
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uAmber; uniform vec3 uTeal;
      varying float vAlpha; varying float vHeat;
      void main() {
        float d = length(gl_PointCoord - 0.5);
        float a = smoothstep(0.5, 0.04, d);
        a = a * a * vAlpha;
        if (a < 0.003) discard;
        vec3 hot = mix(uAmber, vec3(1.0, 0.93, 0.8), smoothstep(0.75, 1.0, vHeat));
        vec3 c = mix(uTeal * 0.85, hot, smoothstep(0.08, 0.6, vHeat));
        gl_FragColor = vec4(c, a);
      }`,
    transparent: true,
    depthWrite: false,
    depthTest: true,
    blending: THREE.AdditiveBlending,
  });
  const dustPoints = new THREE.Points(dGeo, dMat);
  dustPoints.frustumCulled = false;
  dustPoints.renderOrder = 1;
  scene.add(dustPoints);
  const glowMat = new THREE.ShaderMaterial({
    uniforms: { uI: { value: 0 }, uAmber: { value: AMBER } },
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: /* glsl */ `
      uniform float uI; uniform vec3 uAmber;
      varying vec2 vUv;
      void main() {
        float r = length(vUv - 0.5) * 2.0;
        float a = pow(max(0.0, 1.0 - r), 2.4) * uI;
        if (a < 0.003) discard;
        gl_FragColor = vec4(mix(uAmber, vec3(1.0, 0.95, 0.86), smoothstep(0.6, 1.0, 1.0 - r)), a);
      }`,
    transparent: true,
    depthWrite: false,
    depthTest: true,
    blending: THREE.AdditiveBlending,
  });
  const glowDisk = new THREE.Mesh(new THREE.CircleGeometry(1, 48), glowMat);
  glowDisk.rotation.x = -Math.PI / 2; // lying on the floor
  glowDisk.renderOrder = 1;
  glowDisk.frustumCulled = false;
  glowDisk.visible = false;
  scene.add(glowDisk);
  const dust = {
    vel: new Float32Array(N_DUST * 3), life: new Float32Array(N_DUST), age: new Float32Array(N_DUST).fill(1e9),
    a0: new Float32Array(N_DUST), s0: new Float32Array(N_DUST), h0: new Float32Array(N_DUST),
    next: 0, live: 0, carry: 0, on: false, k: 0, floor: 0, H: 1, glow: 0, light: 0, // (k: how much the floor is there)
    hit: new THREE.Vector3(), push: new THREE.Vector3(), gp: new THREE.Vector3(), gs: new THREE.Vector3(), // (gp: where the glow is, gs: where it was last lit in full)
  };

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

  const dbg = { noLook: false, timeScale: 1, yaw: null, pose: null, tunG: null, head: null, jet: null, phones: null };
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
    workStage: $('.work-stage'),
    storySec: $('#historia'),
    storyStage: $('.story-stage'),
    tlItems: $$('.tl-item'),
  };

  // The card it stands on lights up along its edge under its feet. It lives
  // inside the card's own 3D transform, so it tilts and recedes with the deck for free.
  const seatMark = document.createElement('span');
  seatMark.className = 'avatar-seat';
  seatMark.setAttribute('aria-hidden', 'true');
  let seatHost = null;

  // Video cases: it runs on top of the deck, at the centre of the screen, while the
  // cards slide by underneath. The floor is the top edge of whichever card is under
  // the centre, read from the transform app.js writes:
  // translate3d(x, 0, z) rotateY(ry) scale(s), inside the deck's perspective.
  const DECK_RE = /translate3d\(([-\d.]+)px,\s*0(?:px)?,\s*([-\d.]+)px\)\s*rotateY\(([-\d.]+)deg\)\s*scale\(([\d.]+)\)/;
  let deckPersp = 1600, barBottom = 68;
  function deckFloor(live) {
    if (!nodes.deck || !nodes.projects.length) return null;
    const d = nodes.deck.getBoundingClientRect();
    const ox = d.left + d.width / 2, oy = d.top + d.height / 2;
    let best = null;
    for (const node of nodes.projects) {
      const m = DECK_RE.exec(node.style.transform || '');
      if (!m) continue;
      const X = +m[1], Z = +m[2], ry = (+m[3] * Math.PI) / 180, s = +m[4];
      const hw = (node.offsetWidth / 2) * s, hh = (node.offsetHeight / 2) * s;
      const c = Math.cos(ry), sn = Math.sin(ry);
      // the card's top corners (u = -hw, +hw), projected
      const ka = deckPersp / Math.max(1, deckPersp - (Z + hw * sn));
      const kb = deckPersp / Math.max(1, deckPersp - (Z - hw * sn));
      const xa = ox + (X - hw * c) * ka, xb = ox + (X + hw * c) * kb;
      if (ox < Math.min(xa, xb) || ox > Math.max(xa, xb)) continue;
      const t = (ox - xa) / (xb - xa || 1);
      const z = Z + hw * sn * (1 - 2 * t);
      if (best && z <= best.z) continue;
      best = { node, z, u: t, y: oy - hh * (ka + (kb - ka) * t) };
    }
    if (!best) return null;
    // Where a card's top sits at rest while the deck holds still on screen. It sizes
    // the guide (as tall as fits under the top bar), and it is as high as it goes:
    // once the deck scrolls away it stays put and jumps off instead of riding up.
    const stageTop = nodes.workStage ? nodes.workStage.getBoundingClientRect().top : 0;
    const restTop = oy - stageTop - nodes.projects[0].offsetHeight / 2;
    const h = clamp(restTop - barBottom + 6, view.h * 0.12, 200); // (the model box has headroom over the head)
    // (on a journey, and with reduced motion, it is on the card wherever that goes)
    return { node: best.node, u: best.u, x: ox, y: (reduced || live ? best.y : Math.max(best.y, restTop)) + 1, h };
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

  // The timeline: every card is a time tunnel, with a portal at each end. It follows the
  // scroll straight through: at the left portal of the card in front, it dives in, glides
  // behind the card, shoots out of the right portal and across the screen, and comes
  // flying back in from the left to the next card's portal, in one unbroken flight (its
  // pace eases from leg to leg, never jumping). Stopped anywhere, it stays right there.
  // Out of the last one it falls onto the video cases instead (see tunnelExit).
  // Positions come from the cards' live rects: app.js turns them on a ring around the
  // spine, and their vertical edges stay vertical on screen, so the box is exact where it
  // matters, at the ends.
  let storyPersp = 2000, storyCardH = 0;
  const tunnelMode = () => !reduced && !view.dock && !!nodes.storyStage && tunnels.length > 1;
  const tunnelOn = () => section === 'historia' && tunnelMode();
  const tunnels = nodes.storyStage && nodes.tlItems.length > 1 ? nodes.tlItems.map((li) => {
    const mk = (cls, rings) => {
      const el = document.createElement('span');
      el.className = cls;
      el.setAttribute('aria-hidden', 'true');
      for (let n = 0; n < rings; n++) el.appendChild(document.createElement('i'));
      li.appendChild(el);
      return el;
    };
    return { li, card: li.querySelector('.tl-card') || li, pin: mk('tl-portal is-in', 4), pout: mk('tl-portal is-out', 4), wake: mk('tl-wake', 0), near: [false, false], wo: -1, wx: -1 };
  }) : [];
  // (the legs of a pass, as the fraction of a card's scroll where each one ends: into the
  // left portal, through the card, off the right edge of the screen, and in from the left
  // to the next card's portal; out of the last card it only clears its right portal, by last.
  // far: how far ahead of it the cards may be, in cards, for it to catch up along the pass;
  // fast: the pace, in cards a second, from which the page is leaping past them)
  const TUN = { dive: 0.15, inside: 0.46, off: 0.73, last: 0.6, far: 0.33, fast: 4 };
  const TILT = { hover: 0.22, fly: 1.32 }; // forward lean, at the portal and flying level
  const YAW = { hover: 0.9, fly: 1.25 }; // facing right, toward the way it flies
  let PORTAL = 0.033; // half a portal's width, in card widths (read from .tl-portal's --pw on resize)
  // Flying, it faces the way it goes. The passes (and the leg out of the last tunnel)
  // are laid out facing right, the way the page reads; scrolled back up they run
  // backward, so it turns round to face left instead of flying backward. m: 0 as laid
  // out, 1 turned round (see stepHeading).
  const head = { m: 0, to: 0, x: NaN, vx: 0, g: 0, pg: NaN, gw: 1, wasTun: false, along: NaN, lo: 0, hi: 1, face: NaN, mode: 0 };
  // Which arm reaches out ahead in flight: the one on the visitor's side (the right
  // arm flying right, the left one turned round), so the big head doesn't hide it.
  const leadOf = (s) => (s < 0 ? 1 - head.m : head.m);
  function storyPos() {
    const sec = nodes.storySec;
    if (!sec) return 0;
    const r = sec.getBoundingClientRect();
    return clamp01(-r.top / Math.max(1, r.height - window.innerHeight)) * (tunnels.length - 1);
  }
  // How fast the page is taking the cards on, in cards a second: by this frame's step and
  // by the scroll's pace over the last moments, whichever says more (see scrollPace).
  function storyPace(dt) {
    const sec = nodes.storySec;
    if (!sec) return 0;
    const v = Math.max(Math.abs(scrollD) / Math.max(dt, 1e-3), Math.abs(pace.v));
    return (v * (tunnels.length - 1)) / Math.max(1, sec.getBoundingClientRect().height - window.innerHeight);
  }
  // Where the cards are drawn: app.js eases its progress and writes it on the year rail.
  function storyF() {
    const v = nodes.rail ? parseFloat(nodes.rail.style.getPropertyValue('--p')) : NaN;
    return Number.isFinite(v) ? clamp01(v) * (tunnels.length - 1) : storyPos();
  }
  const tunH = () => clamp(storyCardH * 0.36, view.h * 0.12, 170);
  function cardBox(k) {
    const r = tunnels[k].card.getBoundingClientRect();
    return { l: r.left, r: r.right, t: r.top, b: r.bottom, cy: (r.top + r.bottom) / 2, w: r.width, h: r.height };
  }
  const hoverX = (c, h) => c.l - c.w * PORTAL - h * 0.36;
  // a card it can park at: its portal still clear of the screen's left edge (the
  // card in front always is; one turning away round the ring soon isn't)
  function hoverOK(k) {
    const rail = nodes.rail ? nodes.rail.getBoundingClientRect().left : 0;
    return hoverX(cardBox(k), tunH()) >= rail + tunH() * 0.25;
  }
  // The spot at the first portal (any card's, at the front of the ring): where it flies to
  // into the timeline, rising with the stage until it pins (as the hover on the card
  // there does) and riding up with it once the section scrolls away.
  function tunnelFront() {
    const r = nodes.storyStage.getBoundingClientRect();
    if (r.height < 10 || !storyCardH) return null;
    // (with the stage pinned and the page at rest, between two cards: the portal it
    // will park at; while the page still scrolls there, the front, which holds still.
    // The front too while it is still flying in from the hero: the pass takes it on from
    // there, where a spot that moved under the flight would be a jump)
    if (r.top <= 0 && r.bottom >= view.h - 1 && performance.now() - scrub.scrolledAt > 450 && !scrub.mid) {
      const st = tunnelAt(restCard(storyF()));
      return { x: st.x, y: st.cy + st.h * BODY_C, h: st.h, yaw: st.yaw, tun: true };
    }
    const top = r.top;
    const s = storyPersp / Math.max(1, storyPersp - 360);
    const w = tunnels[0].li.offsetWidth * s;
    const h = tunH();
    const x = hoverX({ l: r.left + r.width / 2 - w / 2, w }, h);
    return { x, y: top + r.height / 2 + h * BODY_C, h, yaw: YAW.hover, tun: true };
  }
  // How far the first card's portal has gone from the front, with the page already on
  // into the timeline (the ring turns its card away, up and to the left): the flight in
  // from the hero ends at the portal, not in front of the card. Up to a quarter of the
  // way to the next card, that is, and back at the front by half way: from there on the
  // front holds still. (No further than the portal can go and stay in view, nor than a
  // third of the way back to the edge: the flight in never turns back.)
  function frontDrift(v, room) {
    const w = 1 - smooth(clamp01((storyF() - 0.25) / 0.25));
    if (w <= 0) return { x: 0, y: 0 };
    const c = cardBox(0);
    const rail = nodes.rail ? nodes.rail.getBoundingClientRect().left : 0;
    return { x: Math.max((Math.max(hoverX(c, v.h), rail + v.h * 0.25) - v.x) * w, -room / 3), y: (c.cy + v.h * BODY_C - v.y) * w };
  }
  // The pass at g (card index + how far through it): the middle of the body, its size,
  // facing and lean, and whether it is behind the card.
  function tunnelAt(g, exiting) {
    const n = tunnels.length;
    const k = Math.min(Math.floor(g), n - 1);
    const ph = g - k;
    const h = tunH();
    const c = cardBox(k);
    const xIn = c.l + h * 0.55; // just inside: the feet past the left edge
    const xOut = c.r - h * 0.65; // the head at the right edge, still hidden
    const glide = (xOut - xIn) / (TUN.inside - TUN.dive); // its pace through the card
    let x, y = c.cy;
    if (ph < TUN.dive) {
      // from rest at the portal, speeding up into it until it reaches the glide's pace
      const u = ph / TUN.dive, D = xIn - hoverX(c, h), v = glide * TUN.dive;
      x = hoverX(c, h) + (3 * D - v) * u * u + (v - 2 * D) * u * u * u;
    } else if (ph < TUN.inside) {
      x = xIn + glide * (ph - TUN.dive);
    } else if (exiting) {
      // out of the last card: clear of the portal, where the fall takes over
      x = xOut + (c.r + c.w * PORTAL + h * 0.5 - xOut) * clamp01((ph - TUN.inside) / (TUN.last - TUN.inside));
    } else {
      // Across the screen: out of the right portal speeding up to a cruise, off the right
      // edge, and in from the left edge at that same cruise, braking at the next portal.
      // Each leg is a cubic matched in pace at its ends, so the flight never lurches.
      const L1 = TUN.off - TUN.inside, L2 = 1 - TUN.off;
      const c2 = cardBox(k + 1);
      const xEnd = view.w + h * 0.9, x0 = -h * 0.9, x1 = hoverX(c2, h);
      const D1 = Math.max(1, xEnd - xOut), D2 = Math.max(1, x1 - x0);
      const cruise = Math.min(1.6 * D2 / L2, 2.4 * D1 / L1); // px per unit of the card's scroll
      const herm = (p0, v0, p1, v1, u) => {
        const u2 = u * u, u3 = u2 * u;
        return (2 * u3 - 3 * u2 + 1) * p0 + (u3 - 2 * u2 + u) * v0 + (3 * u2 - 2 * u3) * p1 + (u3 - u2) * v1;
      };
      if (ph < TUN.off) {
        x = herm(xOut, glide * L1, xEnd, cruise * L1, (ph - TUN.inside) / L1);
      } else {
        x = herm(x0, cruise * L2, x1, 0, (ph - TUN.off) / L2);
        y = c2.cy;
      }
    }
    const fly = smooth(clamp01(ph / 0.07)) * (exiting ? 1 : 1 - smooth(clamp01((ph - 0.86) / 0.14)));
    const inLeg = ph < TUN.off || exiting;
    // how far it reaches ahead (the head, the fist under its chin) and behind (the
    // feet), upright or flying level; to the right and left (front, back) as it faces
    const ahead = h * (0.3 + 0.28 * fly), behind = h * (0.3 + 0.22 * fly);
    const front = ahead + (behind - ahead) * head.m, back = behind + (ahead - behind) * head.m;
    // behind the card (any part of it, or all of it)
    const over = inLeg && x + front > c.l && x - back < c.r;
    const hidden = inLeg && x - back > c.l && x + front < c.r;
    return { k, ph, x, cy: y, h, c, fly, front, back, tilt: TILT.hover + (TILT.fly - TILT.hover) * fly, yaw: YAW.hover + (YAW.fly - YAW.hover) * fly, over, hidden, inside: inLeg ? clamp01((x - c.l) / Math.max(1, c.r - c.l)) : -1 };
  }

  // Running state, kept here because the deck anchor reads its heading.
  const runner = { f: -1, v: 0, dir: 1, run: 0, on: false, still: 0, yaw: -0.1, idx: -1 };

  function anchorFor(id, live) {
    const W = view.w, H = view.h;
    if (view.dock) return { x: W / 2, y: H * 0.98, h: H * 0.9, yaw: -0.25 };
    switch (id) {
      case 'historia': {
        const v = tunnelMode() && tunnelFront();
        if (v) return v;
        const r = nodes.rail ? nodes.rail.getBoundingClientRect() : null;
        const h = Math.min(H * 0.3, 270);
        return { x: Math.max(r ? r.left + 64 : 0, h * 0.4), y: H * 0.94, h, yaw: 0.55 };
      }
      case 'projetos': {
        const floor = deckFloor(live);
        if (floor) return { x: floor.x, y: floor.y, h: floor.h, yaw: runner.yaw, floor };
        const h = Math.min(H * 0.18, 170);
        const r = frontCard();
        if (r) return { x: r.left + r.width / 2, y: r.top, h, yaw: runner.yaw };
        return { x: W * 0.5, y: H * 0.3, h, yaw: runner.yaw };
      }
      case 'contato': {
        const r = nodes.terminal ? nodes.terminal.getBoundingClientRect() : null;
        const h = Math.min(H * 0.24, 220);
        // tucked against the card's lower-left corner, both hands on its edge
        if (r) {
          const x = r.left - h * 0.2, y = Math.min(r.bottom + h * 0.16, H * 0.96);
          // (with the last video case still held over that spot, it waits off the case's
          // right side, where it dropped, until the case rides up out of the way)
          const c = ledgeMode() ? lastCase().getBoundingClientRect() : null;
          const w = c && c.right > x - h * 0.4 ? smooth(clamp01((c.bottom - (y - h * 0.95)) / (h * 0.12))) : 0;
          return { x: x + (Math.max(x, c ? c.right + h * 0.45 : x) - x) * w, y, h, yaw: 0.6, grip: w < 0.01 };
        }
        return { x: W * 0.5, y: H * 0.85, h, yaw: 0.4 };
      }
      default: {
        const h = Math.min(H * 0.46, 420);
        return { x: W * 0.74, y: H * 0.84, h, yaw: -0.4 };
      }
    }
  }

  function resize() {
    scrubReset();
    if (nodes.deck) deckPersp = parseFloat(getComputedStyle(nodes.deck).perspective) || 1600;
    if (nodes.storyStage) storyPersp = parseFloat(getComputedStyle(nodes.storyStage).perspective) || 2000;
    storyCardH = Math.max(0, ...nodes.tlItems.map((n) => n.offsetHeight));
    const bar = $('.topbar');
    if (bar) barBottom = bar.getBoundingClientRect().bottom;
    view.dock = mqDock.matches;
    doc.classList.toggle('has-tunnels', tunnelMode());
    if (tunnels.length && tunnels[0].pin.offsetWidth) PORTAL = tunnels[0].pin.offsetWidth / 2 / Math.max(1, tunnels[0].li.offsetWidth);
    doc.classList.toggle('has-ledge', ledgeMode());
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
    clearDust(); // (laid out for the old screen)
    if (view.dock && trans && (trans.kind === 'hop' || trans.kind === 'enter')) trans = null;
    if (view.dock || (trans && trans.kind === 'case' && !trans.opened)) endShow(true); // (a show drawn for the old layout: the case opens now)
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
  let tugAsked = 0; // when a pull was asked for before the hands were on the card
  let cardStyled = false;
  let scrollY = window.scrollY, scrollD = 0, scrollV = 0, lean = 0; // (scrollD: how far the page went in this frame)
  // The scroll's pace right now (px a second), quicker to tell than scrollV, which is
  // smoothed for the lean: the way it went after the earliest step of the last moments,
  // over the time since that step. So a wheel's notches count as what they are (a notch
  // on its own says nothing of a pace), and a steady scroll reads true from its second
  // frame.
  const pace = { t: new Float64Array(48), d: new Float64Array(48), i: 0, v: 0 }; // (48 frames: the last moments at any refresh rate)
  function scrollPace(now, d) {
    const n = pace.t.length;
    pace.i = (pace.i + 1) % n;
    pace.t[pace.i] = now;
    pace.d[pace.i] = d;
    let acc = 0, dir = 0, v = 0;
    for (let k = 0; k < n; k++) {
      const j = (pace.i - k + n) % n, dj = pace.d[j];
      if (now - pace.t[j] > 140) break;
      if (dj) {
        if (!dir) dir = Math.sign(dj);
        else if (Math.sign(dj) !== dir) break; // (it turned round: another go)
        if (k) v = (acc * 1000) / (now - pace.t[j]);
      }
      acc += dj;
    }
    pace.v = v;
  }

  function snapTo(a) {
    at.x = a.x; at.y = a.y; at.h = a.h; at.yaw = a.yaw;
    vel.x = vel.y = 0;
  }
  function placeRoot() {
    const s = (at.h * view.wpp) / modelH;
    toWorld(at.x, at.y, 0, root.position);
    root.scale.setScalar(s);
    lantern.position.set(0, modelH * 0.1, modelH * 0.35);
    lantern.intensity = (7 + 26 * dust.light) * s * s * (1 - shared.uDissolve.value * 0.8); // (and the blast on the floor lights it from below)
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
    endShow(false);
    const prev = section;
    section = id;
    goal = anchorFor(id);
    const cfg = SECTIONS[id] || SECTIONS.inicio;
    if (reduced || view.dock) {
      // No journey: a puff in place (dock) or a plain cut (reduced motion).
      if (trans && (trans.kind === 'hop' || trans.kind === 'enter')) trans = null;
      snapTo(goal);
      setBase(cfg.base);
      if (!reduced && prev !== id) { puff(); greet(id, cfg.greet); }
      dirty = true;
      wake(); // (with reduced motion the loop sleeps between inputs: draw the new spot now)
      return;
    }
    if (trans && trans.kind !== 'hop' && trans.kind !== 'enter' && trans.phase !== 'in' && !fromScatter) {
      // the first appearance or a send, still in mist: bend it toward the new spot
      if (id !== 'contato') abandonSend();
      trans.toId = id;
      return;
    }
    placeRoot();
    if (fromScatter && id === 'inicio' && rigOK) {
      // First appearance at the hero: it comes flying in from the right.
      enterFlying(id);
      return;
    }
    if (fromScatter) {
      // First appearance elsewhere: motes rise out of the sea around the destination.
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
      for (let i = 0; i < N_TRANSIT; i++) tDelay[i] = Math.random() * SPREAD;
      seedCtrl();
      dirty = true;
      return;
    }
    hopTo(id, prev);
  }

  // A timed journey (menu links, leaps, a retarget): the same jump, fall and landing
  // as the scrolled ones, run by the clock from wherever the guide is right now.
  function hopTo(id, prev, skForce) {
    // (flying through a tunnel, or off its spot on a scrolled flight, it sets off from
    // there, still in the air)
    const airborne = trans && trans.kind === 'enter' ? trans.phase === 'fly' : trans && trans.kind === 'hop' ? jr.air > 0.5 : scrub.mid && (jr.air > 0.5 || jr.fly > 0);
    if (trans && trans.kind === 'send') settleSend(null);
    // (off the end of the last case it springs from where it is on the card, or drops
    // from where it hangs past it: not from the deck's middle)
    const onLedge = !trans && (ledge.drove || ledge.was);
    const sk = skForce || (tun.active ? 'hover' : airborne || (onLedge && !jr.floor) ? 'fall' : 'stand');
    const ek = endKind(id);
    // (turned round on a flight laid out the other way, it sets off facing the way it is)
    if (head.m > 0) { at.yaw = wrapPi(at.yaw * (1 - 2 * head.m)); head.m = head.to = 0; }
    const A = { x: at.x, y: at.y, h: at.h, yaw: at.yaw, tilt: wrapPi(tilt.rotation.x), floor: onLedge && jr.floor ? jr.floor : undefined }; // (the tilt unwound, so it always rights itself the short way)
    const B = anchorFor(id, true);
    const dist = Math.hypot(B.x - A.x, clamp(B.y, 0, view.h) - A.y);
    const tk = sk === 'stand' ? 0.32 : 0;
    const tf = 0.75 + Math.min(dist / 2200, 0.55);
    const ts = ek === 'butt' ? 0.45 : 0;
    const tg = ek === 'butt' ? 1.0 : ek === 'feet' ? 0.45 : 0;
    const dur = tk + tf + ts + tg;
    // Whose spot is it on? Still crouching, or only just sprung off (it crouches again
    // only while low over that spot): the one it was leaving. In mid-air: none, so it
    // keeps the snapshot. Nearly or fully down: the one it was heading to.
    const pq = trans && trans.kind === 'hop' ? trans.t / trans.dur : -1;
    const from = (trans && trans.kind === 'enter') || onLedge ? null
      : pq < 0 ? prev
      : pq < trans.ph.T0 ? trans.from
      : sk === 'fall' ? null
      : pq < (trans.ph.T0 + trans.ph.L) / 2 ? trans.from
      : prev;
    snapRig();
    trans = { kind: 'hop', phase: 'travel', t: 0, dur, toId: id, from, A, sk, ek, ph: { T0: tk / dur, L: (tk + tf) / dur, S: (tk + tf + ts) / dur } };
    jr.lastP = -1;
    scrub.mid = false;
    scrub.on = false;
    pAlpha.fill(0, 0, N_TRANSIT);
    shared.uDissolve.value = 0;
    dirty = true;
  }

  // The first appearance at the hero, flown for real. The guide is a rigid body on a
  // jetpack: gravity pulls it down, the air drags on it, and the jets push along its own
  // long axis (the only force it controls), building up and dying down in a few
  // hundredths of a second; it turns that axis with inertia (a damped spring with a top
  // rate), never in an instant. The flight plan is a smooth path, one quintic per axis
  // from beyond the right edge (far off and high) to a gate over its spot, then one
  // straight down onto it, timed so the push it asks for stays well within what the jets
  // can give. The flight computer follows it the way a lander does: it points the thrust
  // where the path's acceleration (a moment ahead), gravity and drag say, plus whatever
  // the closed loop has to correct. So it leans into the dive, flares back to brake and
  // rights itself over the spot because the physics needs it to; nothing else turns it.
  // Over the spot it sinks on the jets at a walking pace, the blast hitting the ground and
  // raising a ring of dust (see stepDust), and touches down on its feet, the knees taking
  // the weight; then the jets cut and it turns to the visitor and waves. Scrolling or a
  // menu link meanwhile turns it into a journey from wherever it is.
  // Units: body heights and seconds, from its spot (y up from the floor, z toward the
  // camera), drawn through the camera's own perspective.
  const FLIGHT = {
    G: 4.4, // gravity (a body this size, at the site's pace)
    drag: 0.08, // air drag, quadratic, per body height
    tMax: 2.4, tMin: 0.25, // the thrust's range, in g
    spool: 0.07, // how fast the thrust follows the throttle (s)
    wn: 10, zeta: 0.85, wMax: 5, // turning its axis: natural frequency, damping, top rate (rad/s)
    cone: 1.05, // the most it leans off upright (rad)
    kp: 9, kd: 6.5, lead: 0.15, // following the path: stiffness, damping, and how far ahead it leans for a push (s)
    step: 1 / 240, // the physics step (s)
    gate: 0.35, vGate: 0.75, touch: 0.28, // the descent: from this high over the spot, sinking at most this fast, down to this at the touchdown
    from: { x: 1.07, y: 0.3, k: 0.46 }, // where it comes in: beyond the right edge, a third down, far off (under half its size)
    pace: [1.7, 1.8, 1.2], // its speed coming in (across, down, toward us), as shares of the average to the gate
    lean: 0.75, // leaning into the dive as it comes in (rad)
    settle: 0.5, turn: 0.45, // down: the knees taking the weight, then the turn to the visitor (s)
  };
  const fHelp = { P: [0, 0, 0], V: [0, 0, 0], A: [0, 0, 0], S: [0, 0, 0], c: [0, 0, 0], uc: [0, 1, 0] };
  // the camera's distance from the spot's plane, in body heights
  const flightDr = (h) => view.h / (2 * Math.tan(THREE.MathUtils.degToRad(FOV / 2))) / h;
  function flightFrom(B, sx, sy, k) {
    const h = B.h;
    return [((sx - view.w / 2) / k + view.w / 2 - B.x) / h, (B.y - ((sy - view.h / 2) / k + view.h / 2)) / h, flightDr(h) * (1 - 1 / k)];
  }
  // where a point of the flight is drawn: screen x, y, and how big (its scale)
  function flightTo(B, p, out) {
    const Dr = flightDr(B.h), k = Dr / Math.max(0.05, Dr - p[2]);
    out[0] = view.w / 2 + (B.x + p[0] * B.h - view.w / 2) * k;
    out[1] = view.h / 2 + (B.y - p[1] * B.h - view.h / 2) * k;
    out[2] = k;
    return out;
  }
  // the plan at time t: position, velocity, acceleration (quintic Hermite between keys)
  function planAt(keys, t, P, V, A) {
    const last = keys[keys.length - 1];
    if (t >= last.t) {
      for (let j = 0; j < 3; j++) { P[j] = last.p[j] + last.v[j] * (t - last.t); V[j] = last.v[j]; A[j] = 0; }
      return;
    }
    t = Math.max(t, keys[0].t);
    let i = 0;
    while (keys[i + 1].t < t) i++;
    const a = keys[i], b = keys[i + 1], T = b.t - a.t, s = (t - a.t) / T;
    const s2 = s * s, s3 = s2 * s, s4 = s3 * s, s5 = s4 * s;
    const h0 = 1 - 10 * s3 + 15 * s4 - 6 * s5, h1 = s - 6 * s3 + 8 * s4 - 3 * s5, h2 = 0.5 * s2 - 1.5 * s3 + 1.5 * s4 - 0.5 * s5;
    const h3 = 0.5 * s3 - s4 + 0.5 * s5, h4 = -4 * s3 + 7 * s4 - 3 * s5, h5 = 10 * s3 - 15 * s4 + 6 * s5;
    const d0 = -30 * s2 + 60 * s3 - 30 * s4, d1 = 1 - 18 * s2 + 32 * s3 - 15 * s4, d2 = s - 4.5 * s2 + 6 * s3 - 2.5 * s4;
    const d3 = 1.5 * s2 - 4 * s3 + 2.5 * s4, d4 = -12 * s2 + 28 * s3 - 15 * s4, d5 = 30 * s2 - 60 * s3 + 30 * s4;
    const e0 = -60 * s + 180 * s2 - 120 * s3, e1 = -36 * s + 96 * s2 - 60 * s3, e2 = 1 - 9 * s + 18 * s2 - 10 * s3;
    const e3 = 3 * s - 12 * s2 + 10 * s3, e4 = -24 * s + 84 * s2 - 60 * s3, e5 = 60 * s - 180 * s2 + 120 * s3;
    for (let j = 0; j < 3; j++) {
      const p0 = a.p[j], v0 = a.v[j] * T, a0 = a.a[j] * T * T, p1 = b.p[j], v1 = b.v[j] * T, a1 = b.a[j] * T * T;
      P[j] = h0 * p0 + h1 * v0 + h2 * a0 + h3 * a1 + h4 * v1 + h5 * p1;
      V[j] = (d0 * p0 + d1 * v0 + d2 * a0 + d3 * a1 + d4 * v1 + d5 * p1) / T;
      A[j] = (e0 * p0 + e1 * v0 + e2 * a0 + e3 * a1 + e4 * v1 + e5 * p1) / (T * T);
    }
  }
  // The plan: in at a share of the average pace toward the gate, leaning into the dive,
  // losing height early, while it is still far off (coming nearer, the perspective lifts
  // whatever is high up the screen, toward the top bar); at the gate upright (no push but
  // the one against gravity), sinking at that average; on the spot sinking at the
  // touchdown pace. The time to the gate is the shortest that keeps the thrust it asks for
  // under 85% of the most and over 1.6x the least, and the lean under 80% of the most.
  // Where the screen is short, the way in is lowered until the head stays under the top
  // bar all the way (while the descent still keeps some height to lose).
  const fPlan = [0, 0, 0];
  function flightPlan(B) {
    const F = FLIGHT, fr = F.from, { P, V, A } = fHelp, s = fPlan;
    const gate = [0, BODY_C + F.gate, 0];
    const make = (p0, T1) => {
      const v0 = p0.map((x, j) => (F.pace[j] * (gate[j] - x)) / T1);
      const vG = clamp((p0[1] - gate[1]) / T1, F.touch, F.vGate);
      const T2 = (2 * F.gate) / (vG + F.touch);
      const hz = Math.hypot(v0[0], v0[2]) || 1, push = Math.tan(F.lean) * F.G;
      return [
        { t: 0, p: p0, v: v0, a: [(push * v0[0]) / hz, 0, (push * v0[2]) / hz] },
        { t: T1, p: gate, v: [0, -vG, 0], a: [0, 0, 0] },
        { t: T1 + T2, p: [0, BODY_C, 0], v: [0, -F.touch, 0], a: [0, (0.5 * (vG - F.touch)) / T2, 0] },
      ];
    };
    let keys = null;
    for (let sy = fr.y * view.h, n = 0; n < 30; sy += view.h * 0.02, n++) {
      const p0 = flightFrom(B, fr.x * view.w, sy, fr.k);
      for (let T1 = 1.6; T1 < 4; T1 += 0.05) {
        keys = make(p0, T1);
        let worst = 0;
        for (let t = 0; t <= T1; t += 0.02) {
          planAt(keys, t, P, V, A);
          const up = A[1] + F.G, thrust = Math.hypot(A[0], up, A[2]);
          worst = Math.max(worst, up <= 0 ? 9 : 0, thrust / (F.tMax * 0.85 * F.G), (F.tMin * 1.6 * F.G) / thrust, Math.atan2(Math.hypot(A[0], A[2]), up) / (F.cone * 0.8));
        }
        if (worst <= 1) break;
      }
      // the head (about 0.53 of its height over its middle) while any of it is on screen
      let high = false;
      for (let t = 0; t <= keys[1].t && !high; t += 0.03) {
        planAt(keys, t, P, V, A);
        flightTo(B, P, s);
        const size = B.h * s[2];
        high = s[0] - size * 0.45 < view.w && s[1] - size * 0.53 < barBottom + 8;
      }
      if (!high || p0[1] < gate[1] + 0.45) break;
    }
    return keys;
  }
  // what the flight computer asks for now: the thrust's direction (fHelp.uc) and size
  function flightCommand(E) {
    const F = FLIGHT, { P, V, A, S, c, uc } = fHelp;
    planAt(E.keys, E.ft + F.lead, S, S, A); // the push the path asks for, a moment ahead
    planAt(E.keys, E.ft, P, V, S); // where it should be now, and how fast
    const sp = Math.hypot(E.v[0], E.v[1], E.v[2]);
    for (let j = 0; j < 3; j++) c[j] = A[j] + F.kp * (P[j] - E.p[j]) + F.kd * (V[j] - E.v[j]) + (j === 1 ? F.G : 0) + F.drag * sp * E.v[j];
    let m = Math.hypot(c[0], c[1], c[2]);
    if (m < 1e-6) { uc[0] = 0; uc[1] = 1; uc[2] = 0; m = 0; } else { uc[0] = c[0] / m; uc[1] = c[1] / m; uc[2] = c[2] / m; }
    const cc = Math.cos(F.cone);
    if (uc[1] < cc) {
      // (beyond the most it leans: as far as it goes that way, with what that axis can give)
      const hz = Math.hypot(uc[0], uc[2]) || 1, sn = Math.sin(F.cone);
      uc[0] = (uc[0] / hz) * sn; uc[2] = (uc[2] / hz) * sn; uc[1] = cc;
      m = Math.max(0, c[0] * uc[0] + c[1] * uc[1] + c[2] * uc[2]);
    }
    return clamp(m, F.tMin * F.G, F.tMax * F.G);
  }
  function flightStep(E, dt) {
    const F = FLIGHT, uc = fHelp.uc, u = E.u, w = E.w;
    const Tc = flightCommand(E);
    // turning: a damped spring pulling its axis toward the command, with a top rate and
    // no spin about the axis itself
    const dot = clamp(u[0] * uc[0] + u[1] * uc[1] + u[2] * uc[2], -1, 1);
    let ax = u[1] * uc[2] - u[2] * uc[1], ay = u[2] * uc[0] - u[0] * uc[2], az = u[0] * uc[1] - u[1] * uc[0];
    const sn = Math.hypot(ax, ay, az), ang = Math.acos(dot);
    if (sn > 1e-9) { ax /= sn; ay /= sn; az /= sn; } else ax = ay = az = 0;
    const k2 = F.wn * F.wn, c2 = 2 * F.zeta * F.wn;
    w[0] += (k2 * ang * ax - c2 * w[0]) * dt;
    w[1] += (k2 * ang * ay - c2 * w[1]) * dt;
    w[2] += (k2 * ang * az - c2 * w[2]) * dt;
    const wu = w[0] * u[0] + w[1] * u[1] + w[2] * u[2];
    w[0] -= wu * u[0]; w[1] -= wu * u[1]; w[2] -= wu * u[2];
    const wm = Math.hypot(w[0], w[1], w[2]);
    if (wm > F.wMax) { w[0] *= F.wMax / wm; w[1] *= F.wMax / wm; w[2] *= F.wMax / wm; }
    const nx = u[0] + (w[1] * u[2] - w[2] * u[1]) * dt, ny = u[1] + (w[2] * u[0] - w[0] * u[2]) * dt, nz = u[2] + (w[0] * u[1] - w[1] * u[0]) * dt;
    const nl = Math.hypot(nx, ny, nz);
    u[0] = nx / nl; u[1] = ny / nl; u[2] = nz / nl;
    // the thrust: throttled back while its axis is well off the command, lagging the throttle
    const align = clamp01((u[0] * uc[0] + u[1] * uc[1] + u[2] * uc[2] - 0.3) / 0.65);
    E.T += (Math.max(F.tMin * F.G, Tc * smooth(align)) - E.T) * (1 - Math.exp(-dt / F.spool));
    // and Newton: thrust along its axis, gravity, drag
    const sp = Math.hypot(E.v[0], E.v[1], E.v[2]);
    for (let j = 0; j < 3; j++) {
      E.v[j] += (E.T * u[j] - (j === 1 ? F.G : 0) - F.drag * sp * E.v[j]) * dt;
      E.p[j] += E.v[j] * dt;
    }
    E.ft += dt;
  }
  function enterFlying(id) {
    goal = anchorFor(id);
    const B = goal;
    const keys = flightPlan(B);
    const E = {
      kind: 'enter', phase: 'fly', t: 0, ft: 0, acc: 0, toId: id, keys,
      p: keys[0].p.slice(), v: keys[0].v.slice(), u: [0, 1, 0], w: [0, 0, 0], T: FLIGHT.G,
      yaw: 0, downT: 0, sp: 0, from: [0, 0], ready: 0,
    };
    // it comes in already steering: its axis on the first command
    E.T = flightCommand(E);
    E.u = fHelp.uc.slice();
    E.yaw = Math.atan2(E.v[0], E.v[2]);
    trans = E;
    flightDraw(E, B);
    vel.x = vel.y = 0;
    shared.uDissolve.value = 0;
    pAlpha.fill(0, 0, N_TRANSIT);
    baseName = (SECTIONS[id] || SECTIONS.inicio).base;
    floatW = 0;
    dirty = true;
  }
  const fS = [0, 0, 0];
  // the body where the physics has it: its middle on screen (the root is at its feet), its
  // size, facing, and the lean and bank that point its axis where it is
  function flightDraw(E, B) {
    const s = flightTo(B, E.p, fS), size = B.h * s[2];
    at.x = s[0];
    at.y = s[1] + size * BODY_C;
    at.h = size;
    at.yaw = E.yaw;
    const yaw = E.yaw + look.yaw * 0.35; // (the pivot's turn, as update() sets it)
    const fx = Math.sin(yaw), fz = Math.cos(yaw);
    const u = E.u;
    jr.tilt = Math.atan2(u[0] * fx + u[2] * fz, u[1]);
    jr.bank = -Math.asin(clamp(u[0] * fz - u[2] * fx, -1, 1));
  }
  // how far the legs are ready for the touchdown: from the gate to the planned touchdown
  const flightReady = (E) => smooth(clamp01((E.ft - E.keys[1].t) / Math.max(0.1, E.keys[2].t - E.keys[1].t)));
  function stepEnter(dt) {
    const E = trans, F = FLIGHT;
    const B = anchorFor(E.toId);
    goal = B;
    if (E.phase === 'fly') {
      E.acc += dt;
      while (E.acc >= F.step && E.phase === 'fly') {
        E.acc -= F.step;
        flightStep(E, F.step);
        // touchdown: the feet (half a body below its middle, along its axis) on the floor
        if (E.ft > E.keys[1].t && (E.p[1] - BODY_C * E.u[1] <= 0 || E.ft > E.keys[2].t + 1.5)) {
          E.phase = 'down';
          E.downT = 0;
          E.vTouch = -E.v[1];
          E.from = [E.p[0], E.p[2]];
          E.ready = flightReady(E); // (how far the legs had got ready: the pose and the feet go on from there)
          dustBurst(1);
          sfx('land');
        }
      }
    } else E.downT += dt;
    const sp = Math.hypot(E.v[0], E.v[1], E.v[2]);
    const hz = Math.hypot(E.v[0], E.v[2]);
    const down = E.phase === 'down';
    const g = down ? clamp01(E.downT / F.settle) : 0; // down: the knees taking the weight
    const tn = down ? clamp01((E.downT - F.settle * 0.4) / F.turn) : 0; // and turning to the visitor
    // Facing: the way it flies (with the turn's inertia), held while it hangs nearly still;
    // over the spot, round to the visitor.
    const desc = clamp01((E.ft - E.keys[1].t + 0.3) / 0.6);
    let want = hz > 0.35 ? Math.atan2(E.v[0], E.v[2]) : E.yaw;
    want = want + wrapPi(B.yaw - want) * Math.max(smooth(desc) * 0.6, smooth(tn));
    E.yaw += clamp(wrapPi(want - E.yaw) * damp(down ? 6 : 4, dt), -3 * dt, 3 * dt);
    if (down) {
      // on its feet: the axis settles upright, the body on the spot (the last few pixels
      // of the path's error taken up as it settles), the jets dying out
      const k = smooth(g);
      E.p[0] = E.from[0] * (1 - k);
      E.p[2] = E.from[1] * (1 - k);
      E.p[1] = BODY_C;
      const r = damp(10, dt);
      E.u[0] += (0 - E.u[0]) * r; E.u[2] += (0 - E.u[2]) * r; E.u[1] = Math.sqrt(Math.max(0, 1 - E.u[0] * E.u[0] - E.u[2] * E.u[2]));
      E.T *= Math.exp(-dt / 0.12);
      E.v[0] = E.v[1] = E.v[2] = 0;
    }
    flightDraw(E, B);
    if (down) jr.tilt *= 1 - smooth(g);
    vel.x = vel.y = 0;
    jr.on = true;
    jr.spin = 0;
    jr.fly = 0;
    jr.pitch = 0;
    jr.hop = 0;
    jr.floor = null;
    jr.air = 0;
    // the pose: flying into the dive, arms swept back; braking or hanging on the jets,
    // upright with the arms out to steer; legs bent ready for the touchdown, the soles
    // brought down to where its feet will meet the floor; on its feet, straightening up
    const P = jr.pose || (jr.pose = newPose());
    const fwd = jr.tilt; // (leaning forward: pushing on; back: braking)
    const dive = smooth(clamp01((sp - 1.6) / 1.8)) * smooth(clamp01(fwd / 0.35));
    E.sp = dive;
    const ready = down ? E.ready : flightReady(E);
    if (!down) {
      mixPose(P, POSE.hover, POSE.fly, dive * 0.85);
      if (ready > 0) mixPose(P, P, POSE.crouch, ready * 0.75);
    } else {
      mixPose(P, POSE.hover, POSE.crouch, 0.75 * ready);
      mixPose(P, P, POSE.stand, smooth(clamp01((g - 0.25) / 0.75)));
    }
    jr.w = down ? 1 - smooth(clamp01((E.downT - F.settle) / F.turn)) : 1;
    jr.pin = down ? ready + (1 - ready) * smooth(clamp01(E.downT / 0.08)) : ready;
    // the touchdown's give: the knees take up the speed it came down at (the head goes on
    // down at that speed and stops, no faster), and spring back
    jr.squash = down ? (E.vTouch / 0.95) * E.downT * Math.exp(-E.downT / 0.1) : 0;
    // the jets: the flame follows the thrust (hovering on 1 g, a full flame), and on its
    // feet the pilot flame goes out with the thrust
    jr.jet = clamp((E.T / F.G) * 0.8 + 0.2 * (down ? 1 - smooth(g) : 1), 0, 1.5);
    // it looks the way it is going, then at the visitor
    if (!down || g < 0.3) {
      const s = flightTo(B, [E.p[0] + E.v[0] * 0.5, E.p[1] + E.v[1] * 0.5 + 0.35, E.p[2] + E.v[2] * 0.5], fS);
      [glance.x, glance.y] = [s[0], s[1]];
    } else [glance.x, glance.y] = [view.w / 2, view.h / 2];
    glance.until = performance.now() + 150;
    if (down && E.downT >= F.settle + F.turn) {
      trans = null;
      greet(E.toId, (SECTIONS[E.toId] || SECTIONS.inicio).greet);
    }
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
    sfx('dissolve');
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
    caseJump,
    caseNow,
    caseStop: () => endStunt(false),
    beginSend,
    fire() {
      sfx('transmit');
      if (sending() && trans.phase !== 'in') {
        trans.fire = true;
        return cloudRect();
      }
      if (!reduced) { react('jump'); puff(true); } // (quiet: the transmission is what is heard)
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
    if (trans.kind === 'enter') { stepEnter(dt); return; }
    if (trans.kind === 'case') { stepStunt(dt); return; }
    if (trans.kind === 'hop') {
      const p = clamp01(trans.t / trans.dur);
      const B = anchorFor(trans.toId, true);
      // while the page is still scrolling there, aim for the part of it on screen
      if (p < trans.ph.L) B.y = clamp(B.y, B.h * 0.9, view.h * 0.97);
      goal = B;
      // crouching for the take-off it stays on its card, which may already be moving
      if (p < trans.ph.T0 && trans.from && trans.from !== trans.toId) {
        const S = anchorFor(trans.from, true);
        trans.A.x = S.x;
        trans.A.y = clamp(S.y, S.h * 0.9, view.h * 0.97);
        // (its card, while it really stands on it: not once the card slid off screen)
        trans.A.floor = S.floor && Math.abs(trans.A.y - S.y) < 0.5 ? S.floor : null;
      }
      if (trans.phase === 'travel' && p >= trans.ph.L) {
        trans.phase = 'in';
        setBase((SECTIONS[trans.toId] || SECTIONS.inicio).base);
      }
      journeyAt(trans.A, B, p, trans.sk, trans.ek, trans.ph);
      if (p >= 1) {
        const toId = trans.toId;
        trans = null;
        if (toId === 'historia') setBase((SECTIONS[toId] || SECTIONS.inicio).base);
        greet(toId, (SECTIONS[toId] || SECTIONS.inicio).greet);
      }
      return;
    }
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
        sfx('reform');
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
      const hello = trans.greet || (wasSend ? null : cfg.greet);
      const toId = trans.toId;
      trans = null;
      pAlpha.fill(0, 0, N_TRANSIT);
      shared.uDissolve.value = 0;
      if (wasSend) { if (hello) outcome(hello); }
      else greet(toId, hello);
    }
  }

  // ---------------------------------------------------------------------------
  // Journeys scrubbed by the scroll
  // ---------------------------------------------------------------------------
  // Between two sections the journey is a pure function of the scroll position:
  // scroll down and the guide jumps (or falls) to the next spot and lands there;
  // scroll back and it all plays in reverse. u is a continuous section index:
  // whole numbers are plateaus (solid at that section), fractions are partway.
  // Time-based journeys (first appearance, menu jumps, the send) take over while
  // they run and hand back here when they're done.
  const ORDER = $$('main > section').map((el) => el.id).filter((id) => SECTIONS[id]);
  const ZONE = 0.3; // half-length of a journey, in viewport heights
  const FOLLOW = 7; // how closely a journey follows the scroll (per second)
  // (t: where the scroll itself is; span: the first zone's length in px)
  const scrub = { on: false, u: 0, t: 0, span: 1, mid: false, zone: -1, leap: false, greeted: null, tops: null, topsAt: 0, scrolledAt: 0, dir: 0, lastY: 0 };
  // section tops are cached: drop them whenever the layout changes
  if ('ResizeObserver' in window && document.querySelector('main')) {
    new ResizeObserver(() => { scrub.tops = null; }).observe(document.querySelector('main'));
  }
  let jumping = false;
  function scrubReset() { scrub.tops = null; }
  function scrubbing() {
    return !reduced && !view.dock && !trans && !jumping && ORDER.length > 1;
  }
  function scrubTarget(now) {
    const vh = window.innerHeight, sy = window.scrollY;
    if (!scrub.tops || now - scrub.topsAt > 1500) {
      scrub.tops = ORDER.map((id) => document.getElementById(id).getBoundingClientRect().top + sy);
      scrub.topsAt = now;
    }
    const tops = scrub.tops;
    const end = document.documentElement.scrollHeight;
    const maxS = end - vh;
    for (let i = 0; i < ORDER.length - 1; i++) {
      const next = i + 2 < tops.length ? tops[i + 2] : end;
      let z = Math.min(vh * ZONE, (tops[i + 1] - tops[i]) * 0.45, (next - tops[i + 1]) * 0.45);
      // the section line the menu uses: 45% down the viewport. Off the video cases it
      // stands on the deck, so it sets off as soon as the deck starts to scroll away.
      let b = tops[i + 1] - vh * 0.45;
      if (ORDER[i] === 'projetos') b = Math.min(b, tops[i + 1] - vh + z);
      // Into the timeline it reaches the first portal just as the stage pins (before
      // that the card is still rising into place). Out of it, it flies through the last
      // card as soon as the stage lets go, while that card is still in view.
      if (ORDER[i + 1] === 'historia' && tunnelMode()) b = Math.max(b, tops[i + 1] - z);
      if (ORDER[i] === 'historia' && tunnelMode()) b = tops[i + 1] - vh + z;
      // Off the video cases: the first half of the zone is the deck's hold on its last
      // card (the run to its edge, then it falls on the clock), the second the stage
      // letting go.
      if (ORDER[i] === 'projetos' && ledgeMode()) { b = tops[i + 1] - vh; z = DECK_DWELL * vh; }
      z = Math.max(24, Math.min(z, maxS - b));
      if (!i) scrub.span = 2 * z;
      if (sy <= b - z) return i;
      if (sy < b + z) return i + (sy - (b - z)) / (2 * z);
    }
    return ORDER.length - 1;
  }
  function stepScrub(dt, now) {
    if (jumping && now - scrub.scrolledAt > 320 && !trans) { jumping = false; scrub.leap = false; }
    // a leap (keyboard, scrollbar) keeps steering toward the section under the scroll
    if (jumping && scrub.leap && trans && trans.phase !== 'in') {
      const id = ORDER[Math.round(scrubTarget(now))];
      if (id && id !== trans.toId) travelTo(id);
    }
    if (!scrubbing()) {
      if (scrub.on) {
        scrub.on = false;
        scrub.mid = false;
      }
      return;
    }
    const t = scrub.t = scrubTarget(now);
    if (!scrub.on) {
      // hand-over: start solid where the last journey left it
      scrub.on = true;
      scrub.u = Math.max(0, ORDER.indexOf(section));
      scrub.greeted = section;
    }
    // A leap the scroll can't show (keyboard, find-in-page, scrollbar): travel directly.
    if (Math.abs(t - scrub.u) > 1.25) {
      const id = ORDER[Math.round(t)];
      jumping = true;
      scrub.leap = true;
      scrub.scrolledAt = now;
      travelTo(id);
      scrub.on = false;
      return;
    }
    // (Out of the timeline again with the pass still inside the last card, where it was
    // handed it on the way back up: the way out goes on from there, not from the portal.)
    const hi = ORDER.indexOf('historia');
    if (hi >= 0 && scrub.u === hi && t > hi && tunnelMode() && tun.active && tun.g > tunnels.length - 1) {
      scrub.u = hi + EXIT_PASS * (tun.g - (tunnels.length - 1)) / TUN.last;
    }
    // Left halfway: settle softly at the nearer section. Otherwise follow the scroll
    // closely, smoothing out the steps of a mouse wheel. (Leaving the video cases, the
    // deck it stands on is already scrolling away: it goes on instead of back.)
    const f = t - Math.floor(t);
    const idle = now - scrub.scrolledAt > 450 && f > 0 && f < 1;
    const onward = ORDER[Math.floor(t)] === 'projetos' && nodes.workStage && nodes.workStage.getBoundingClientRect().top < -40;
    const onLedge = ORDER[Math.floor(t)] === 'projetos' && ledgeMode();
    if (onLedge && f > LEDGE.edge && scrub.u - Math.floor(t) >= LEDGE.edge - 1e-3) {
      // Run off the end of the last case, it flies down on the clock (faster only
      // if the scroll runs ahead) and stays in the next section, until the scroll
      // takes it back onto the card.
      const li = Math.floor(t);
      const s = (scrub.u - li - LEDGE.edge) / (1 - LEDGE.edge); // through the fall
      const L = scrubPhases('fall', endKind(ORDER[li + 1])).L;
      const rate = (1 - LEDGE.edge) * (s < L ? L / LEDGE.fall : (1 - L) / LEDGE.up);
      const follow = t > scrub.u ? (t - scrub.u) * damp(FOLLOW, dt) : 0;
      scrub.u = Math.min(li + 1, scrub.u + Math.max(rate * dt, follow));
    } else {
      // (on the last case's hold it stays where the scroll left it, on the card)
      const held = onLedge && f <= LEDGE.edge;
      let target = idle && !held ? (onward ? Math.ceil(t) : Math.round(t)) : t;
      // Once it has settled ahead, scrolling on the same way doesn't pull it back into
      // the air: it waits there for the scroll to catch up. (With the page outside the
      // zone there is nothing to wait for: it comes to rest on that end. A nudge the
      // other way as it arrived would otherwise leave it short of it, half crouched.)
      if (!idle && f > 0 && scrub.dir > 0 && t < scrub.u && scrub.u <= Math.floor(t) + 1) target = scrub.u;
      if (!idle && f > 0 && scrub.dir < 0 && t > scrub.u && scrub.u >= Math.ceil(t) - 1) target = scrub.u;
      scrub.u += (target - scrub.u) * damp(idle ? 2.4 : FOLLOW, dt);
      if (Math.abs(target - scrub.u) < 2e-4) scrub.u = target;
      // (Into the timeline it has arrived once it is all but at the first portal, with
      // the page at the pin or past it: the pass takes it on from there. The last of the
      // brake is a long while, and the card would be turning away under it meanwhile.)
      if (t >= 1 && scrub.u < 1 && scrub.u > 1 - CROSS.DONE && ORDER[1] === 'historia' && tunnelMode()) scrub.u = 1;
    }

    const N = ORDER.length;
    let i = Math.min(Math.floor(scrub.u), N - 2);
    let p = clamp01(scrub.u - i);
    const side = p < 0.5 ? ORDER[i] : ORDER[i + 1];
    if (side !== section) {
      // halfway there it belongs to the next section (its clips, what it looks at)
      section = side;
      focusKey = null;
      goal = anchorFor(section);
      setBase((SECTIONS[section] || SECTIONS.inicio).base);
    }
    if (p < 1e-3 || p > 1 - 1e-3) {
      scrub.mid = false;
      if (scrub.greeted !== section) {
        scrub.greeted = section;
        greet(section, (SECTIONS[section] || SECTIONS.inicio).greet);
      }
      return;
    }
    // In between, the body travels in plain sight, as a pure function of the scroll.
    // (Straight from one zone's flight into the next one's, a leap of the page with no
    // rest between them, is a new journey as well: from wherever it is.)
    if (!scrub.mid || scrub.zone !== i) {
      scrub.mid = true;
      scrub.zone = i;
      jr.lastP = -1;
      snapRig();
    }
    const idA = ORDER[i], idB = ORDER[i + 1];
    if (idA === 'inicio' && idB === 'historia' && tunnelMode()) { heroCross(p, idB, dt); return; }
    if (idA === 'historia' && tunnelMode()) {
      // Back up into the timeline, it is the pass's again as soon as the page is there and
      // it is in the last card, no further behind the cards than the pass can make up
      // calmly (TUN.far): the pass goes on from where it is, with the cards. (The zone's
      // own way back to the portal is a long while: the cards would have turned away
      // meanwhile, and the pass be left to catch up with them in a streak.) With the cards
      // already well ahead (a fling, a leap of the page) it comes out of the last card
      // first, and goes to them from its portal (tun.leap: see stepTunnel). So too while
      // the page is still leaping (TUN.fast): the pass would be flung along with it, round
      // the screen and back, and the page may be past the timeline before it is anywhere.
      const g0 = head.g; // (where it is along the pass, as of the last frame)
      const gap = g0 - storyF();
      const out = TUN.last * (p / EXIT_PASS) < 0.02; // all but back at the portal
      const calm = storyPace(dt) < TUN.fast;
      if (t <= i && tun.active && g0 < tunnels.length - 1 + TUN.inside && ((calm && gap <= TUN.far) || out)) {
        tun.g = g0;
        tun.wait = false;
        tun.ease = 1;
        tun.leap = gap > TUN.far;
        scrub.u = i;
        scrub.mid = false;
        return;
      }
      tunnelExit(p, idB);
      return;
    }
    if (idA === 'projetos' && ledgeMode()) { ledgeExit(p, idB, dt); return; }
    const sk = 'stand', ek = endKind(idB);
    journeyAt(anchorFor(idA, true), anchorFor(idB, true), p, sk, ek, scrubPhases(sk, ek));
  }

  // Into the timeline (scrubbed by the scroll, like the pass itself): off its spot on the
  // jets and flat out to the left, straight off the left edge of the screen; out of sight
  // it brakes hard and turns round, and comes back in by that same edge, flying right to
  // the first card's portal and braking to hover there, facing it (the pass takes over
  // from that hover). Out it speeds up evenly and in it brakes evenly, at one pace at the
  // edge both ways (the legs share the zone by their lengths), so the flight never
  // lurches. Scrolled back, it is the same way in reverse.
  // (T0: the lift-off's share of the zone; LT: the turn's out of sight, of the rest; V: the
  // fastest it flies out to the edge, in its own heights a second, and BRAKE: the fastest
  // it can still stop from; DONE: the last of the zone, where it is as good as arrived)
  const CROSS = { T0: 0.1, LT: 0.07, V: 50, BRAKE: 15, DONE: 0.025 };
  // Into the zone from wherever it was. The flight is kept as laid out, the turn out of
  // sight included: only how far off that end's spot it was is carried along, fading out
  // as the rig's blend does and as the flight nears the turn (measured from the spot, not
  // from the flight, so a first frame that is already well on its way doesn't drag the
  // turn back on screen). Two things are not flown that way (skip): from far off the
  // hero's spot, or with the first frame already past the turn, it glides onto the flight
  // as any journey taking over does. And taken back up from the timeline faster than it
  // could fly out to the edge and round (heroCross: rush), it doesn't follow the flight
  // out at all, which would be a streak across the screen and back, or a loop in
  // mid-screen. It brakes and waits where it is (hold), turning to fly on to its spot,
  // and is taken along when the flight comes past (rush 1). With its spot on its way, or
  // all but, it goes straight there instead, facing the way it flies (rush 2). Either
  // way its facing is its own from there, not the flight's (see heroCross).
  const crossOff = { x: 0, y: 0, h: 0, yaw: 0, p: -1, far: false, x0: 0, hold: NaN, soft: 0, rush: 0, v: 0 }; // (p: the last frame's, to tell a new entry; v: its pace, px a second)
  function crossPlace(x, y, h, yaw, E, paged, skip, xTurn, to, again) {
    if (!again && (jr.lastP < 0 || jr.lastP !== crossOff.p)) {
      const k = snap.k < 1 ? 1 : 0;
      let dy = snap.at.y - E.y;
      // (the portal's end moves with the page: what the page went by in this frame is
      // not how far off it was, so at the portal it stays with it)
      if (paged) dy += clamp(-dy, Math.min(0, -scrollD), Math.max(0, -scrollD));
      crossOff.x = (snap.at.x - E.x) * k;
      crossOff.y = dy * k;
      crossOff.h = (snap.at.h - E.h) * k;
      crossOff.yaw = wrapPi(snap.at.yaw - E.yaw) * k;
      crossOff.x0 = x;
      crossOff.far = skip || (!to && Math.abs(crossOff.x) > E.h * 0.5);
      crossOff.hold = NaN;
      crossOff.rush = 0;
      if (crossOff.far && k && to) {
        // (it brakes within half its height, and in view; it starts off again as the
        // flight nears)
        crossOff.hold = Math.min(Math.max(snap.at.x - snap.at.h * 0.5, Math.min(snap.at.x, snap.at.h * 0.45)), to.x);
        crossOff.soft = Math.min(to.h * 0.6, to.x - crossOff.hold);
        crossOff.rush = 1;
        if (crossOff.soft < to.h * 0.25) { crossOff.hold = to.x; crossOff.soft = 0; crossOff.rush = 2; }
        // From here its facing is read as on the leg it will fly, the one from the edge
        // to its spot: the mirror image of the other leg's, turned round, is the same
        // facing, so nothing shows.
        head.m = 1 - head.m;
        head.to = 1 - head.to;
        head.vx = 0;
        snap.at.yaw = -snap.at.yaw;
        snap.hm = 1 - snap.hm;
      }
    }
    if (crossOff.far) {
      if (Number.isFinite(crossOff.hold)) {
        const b = crossOff.hold, s = crossOff.soft, u = x - b;
        if (u >= s) crossOff.hold = NaN; // (the flight has come past: with it from here)
        else x = b + (u <= -s ? 0 : ((u + s) * (u + s)) / (4 * s));
      }
      Object.assign(at, { x, y, h, yaw });
      snapAt();
      return;
    }
    const r = (1 - Math.min(1, snap.k)) * clamp01((x - xTurn) / Math.max(1, crossOff.x0 - xTurn));
    at.x = x + crossOff.x * r;
    at.y = y + crossOff.y * r;
    at.h = h + crossOff.h * r;
    at.yaw = yaw + crossOff.yaw * r;
  }
  function heroCross(p, idB, dt) {
    const A = anchorFor('inicio', true), B = anchorFor(idB, true);
    // (the flight is laid out to the front, which holds still; its end goes with the
    // first card's portal: see frontDrift)
    const bx = B.x, by = B.y;
    if (B.tun) { const d = frontDrift(B, B.x + B.h * 0.9); B.x += d.x; B.y += d.y; }
    const P = jr.pose || (jr.pose = newPose());
    jr.on = true;
    vel.x = vel.y = 0;
    jr.pitch = jr.squash = jr.hop = 0;
    jr.floor = null;
    jr.w = 1;
    if (p < CROSS.T0) { // lifting off: a crouch, the jets lighting
      const u = p / CROSS.T0;
      crossPlace(A.x, A.y, A.h, A.yaw, A, false, false, -A.h * 0.9, null, false);
      mixPose(P, POSE.crouch, POSE.crouch, 0);
      jr.w = smooth(clamp01(u / 0.7));
      jr.pin = 1;
      jr.air = jr.tilt = jr.fly = 0;
      jr.pitch = 0.16 * Math.sin(Math.PI * u);
      jr.squash = 0.07 * Math.sin(Math.PI * u);
      jr.jet = 0.4 * smooth(u);
      jr.lastP = crossOff.p = p;
      crossOff.v = 0;
      head.along = 0;
      return;
    }
    const q = (p - CROSS.T0) / (1 - CROSS.T0);
    // the legs: out to just past the left edge, and back in from there to the portal
    const D1 = Math.max(1, A.x + A.h * 0.9), D2 = Math.max(1, bx + B.h * 0.9);
    const LT = CROSS.LT, L1 = ((1 - LT) * D1) / (D1 + D2), L2 = 1 - LT - L1, back = L1 + LT;
    const cruise = (2 * (D1 + D2)) / (1 - LT); // px per unit of the zone, at the edge
    const h = A.h + (B.h - A.h) * smooth(clamp01(q / 0.9));
    const xOff = -h * 0.9; // clear of the edge
    const herm = (p0, v0, p1, v1, u) => {
      const u2 = u * u, u3 = u2 * u;
      return (2 * u3 - 3 * u2 + 1) * p0 + (u3 - 2 * u2 + u) * v0 + (3 * u2 - 2 * u3) * p1 + (u3 - u2) * v1;
    };
    let x;
    if (q < L1) x = herm(A.x, 0, xOff, -cruise * L1, q / L1);
    else if (q < back) x = herm(xOff, -cruise * LT, xOff, cruise * LT, (q - L1) / LT); // (out of sight: a hard brake and back)
    else x = herm(xOff, cruise * L2, B.x, 0, (q - back) / L2);
    // its height: up off the spot to fly level with the portal (as the stage rises
    // into place), and onto the portal at the end
    const yL = Math.min(A.y - A.h * 0.15, Math.max(by, barBottom + h * 0.7));
    let y = A.y + (yL - A.y) * smooth(clamp01(q / (L1 * 0.5)));
    y += (B.y - y) * smooth(clamp01((q - back) / L2));
    // flat out in between: head first to the left, the jets burning hard; turned round
    // out of sight; head first back in, righting itself to the hover at the portal
    const up = smooth(clamp01(q / 0.15)), turn = smooth(clamp01((q - L1) / LT));
    const endK = smooth(clamp01((q - (1 - L2 * 0.52)) / (L2 * 0.52)));
    const fly = up * (1 - endK);
    let yaw = A.yaw + wrapPi(-YAW.fly - A.yaw) * up;
    yaw += (YAW.fly - yaw) * turn;
    yaw += (B.yaw - yaw) * endK;
    const way = jr.lastP < 0 ? (scrub.dir < 0 ? -1 : 1) : Math.sign(p - jr.lastP); // (on to the timeline, back, or held)
    const qWas = jr.lastP < 0 ? (way < 0 ? 1 : 0) : (jr.lastP - CROSS.T0) / (1 - CROSS.T0); // (where it was a frame ago)
    const ox = at.x, oy = at.y, oh = at.h;
    // Taken back up faster than it could fly out to the edge and round, going by the
    // scroll's pace and by how far ahead the page already is (the time the flight has
    // to the turn, against the way there at about its own length a frame): then it is
    // not flown at all (see crossPlace). So too when the first frame is past the turn,
    // or the page is already so far past it that the flight, following it, would go by
    // the edge faster than that (it is slowest at the portal, so the time it has says
    // too little of a single leap).
    const dp = p - (CROSS.T0 + (1 - CROSS.T0) * back), gap = scrub.u - scrub.t;
    const tTurn = Math.min(gap > dp ? -Math.log(1 - dp / gap) / FOLLOW : Infinity, (dp * scrub.span) / Math.max(1, -Math.min(scrollV, pace.v)));
    const hEdge = A.h + (B.h - A.h) * smooth(clamp01(L1 / 0.9));
    const fresh = jr.lastP < 0;
    const rush = dp <= 0 || Math.abs(snap.at.x - B.x) + x - xOff > CROSS.V * hEdge * tTurn
      || (cruise / (1 - CROSS.T0)) * FOLLOW * (gap - dp) > CROSS.V * hEdge;
    // The scroll may only pick up once it is on its way (a wheel spun from rest at the
    // portal, whose first notch says little): then too, as a new entry from where it
    // is, while it is still slow enough to brake and has the room to do it in view.
    const flown = !crossOff.far || (!crossOff.rush && !Number.isFinite(crossOff.hold) && snap.k >= 1);
    const late = !fresh && way < 0 && dp > 0 && flown && ox >= at.h * 0.45
      && Math.abs(crossOff.v) <= CROSS.BRAKE * at.h && ox - xOff > CROSS.V * hEdge * tTurn;
    if (late) { snapRig(); crossOff.p = -1; }
    crossPlace(x, y, h, yaw, p < 0.5 ? A : B, p >= 0.5, late || (fresh && (way < 0 ? rush : q >= back)), xOff, way < 0 ? A : null, false);
    // Round the turn, out of sight (in this frame, or between the last one and this):
    // whatever was still blending in is done with, and it is turned the way it goes
    // by the time it comes back into view.
    if (!crossOff.far && Math.min(q, qWas) < back && Math.max(q, qWas) >= L1) {
      if (snap.k < 1) { snap.t = snap.k = 1; crossPlace(x, y, h, yaw, p < 0.5 ? A : B, p >= 0.5, false, xOff, null, true); }
      if (way) head.m = head.to = way < 0 ? 1 : 0;
      head.vx = 0;
    }
    // Not flown as laid out (rush): its facing is its own. Waiting for the flight it
    // turns to fly on to its spot, on the clock; going straight there it stays as it
    // flies (that leg's facing all the way, the other leg's and the turn's mirrored).
    // Should the scroll turn back, it is onto the flight again from where it is, as any
    // journey taking over (read as on the leg the flight is then on; from where it was a
    // frame ago, that is: the flight's own step in this one is not its).
    if (crossOff.rush) {
      crossPlace(x, y, h, q >= back ? -yaw : q >= L1 ? -YAW.fly : yaw, p < 0.5 ? A : B, p >= 0.5, false, xOff, null, true);
      if (way > 0) {
        if (q >= back) { at.yaw = -at.yaw; head.m = 1 - head.m; head.to = 1 - head.to; }
        else head.to = 0; // (it turns to fly on before it has any pace to tell by)
        crossOff.rush = 0;
        crossOff.hold = NaN;
        head.vx = 0;
        at.x = ox; at.y = oy; at.h = oh;
        snapRig();
      }
    }
    head.along = crossOff.rush ? 0 : Math.hypot(at.x - ox, at.y - oy) * way; // (see stepHeading)
    // How far round it has to be, as part of the flight (see stepHeading). Scrolled back
    // out of the hover at the portal: turned to fly off, by a third of the way to the edge.
    // And taken back in from just off the edge, before the turn (the scroll changed its
    // mind): the way it now goes by the time it shows, not tail first.
    const show = smooth(clamp01((at.x + at.h * 0.9) / (at.h * 0.3)));
    if (crossOff.rush) head.face = crossOff.rush === 1 && up > 0.25 ? 1 : 0;
    else if (way < 0 && q >= back) head.lo = smooth(clamp01((1 - (q - back) / L2) / 0.35));
    else if (way < 0 && q < L1 && show < 1) head.lo = show;
    else if (way > 0 && q >= back && show < 1) head.hi = 1 - show;
    else if (way > 0 && q < L1 && at.x > at.h * 0.45) head.hi = smooth(clamp01((at.x - at.h * 0.45) / (at.h * 1.5)));
    const lift = smooth(clamp01(q / 0.2)); // (up out of the crouch, the feet letting go of the floor)
    jr.pin = 1 - lift;
    jr.air = 0.45 * fly;
    jr.tilt = up * (TILT.fly + (TILT.hover - TILT.fly) * endK);
    jr.fly = fly;
    jr.jet = 0.4 + 0.6 * fly + 0.4 * smooth(clamp01((q - 0.1) / 0.1)) * (1 - turn);
    mixPose(P, POSE.crouch, POSE.hover, lift);
    if (fly > 0) mixPose(P, P, POSE.fly, fly);
    const dir = fly > 0.5 && q < L1 + LT / 2 ? -1 : 1; // (it looks the way it flies, then at the portal)
    [glance.x, glance.y] = [x + h * 2 * dir, y - h * 0.6];
    glance.until = performance.now() + 150;
    if (jr.lastP >= 0 && jr.lastP < CROSS.T0) sfx('takeoff'); // (off the floor, this frame)
    jr.lastP = crossOff.p = p;
    crossOff.v = (at.x - ox) / Math.max(dt, 1e-3);
  }

  // Out of the timeline: through the last card's tunnel, then out of its right portal
  // it drops onto the next section's card.
  const EXIT_PASS = 0.37; // the share of the zone spent inside the last tunnel
  function tunnelExit(p, idB) {
    const last = tunnels.length - 1;
    if (p < EXIT_PASS) {
      jr.lastP = 0; // (so the bump still counts if the fall starts on the next frame)
      tun.g = last; // (back up on the timeline, the plateau carries on from the last portal)
      applyTunnel(tunnelAt(last + TUN.last * (p / EXIT_PASS), true));
      return;
    }
    const o = tunnelAt(last + TUN.last, true); // the way out, riding up with the stage
    const ek = endKind(idB);
    journeyAt({ x: o.x, y: o.cy + o.h * BODY_C, h: o.h, yaw: o.yaw, tilt: o.tilt }, anchorFor(idB, true),
      (p - EXIT_PASS) / (1 - EXIT_PASS), 'fly', ek, scrubPhases('fly', ek));
  }

  // Off the last video case: the deck holds its last card a while (app.js, under
  // html.has-ledge) and it runs on to the end of the card, the scroll pacing its run.
  // The moment its feet leave the card the jets kick in: turned to the visitor (no
  // running on thin air), it flies down into the next section on the clock, whatever
  // the scroll does then (see stepScrub), and sets down on its feet: it never hangs in
  // the air.
  const DECK_DWELL = 0.4; // the hold, in viewport heights (the same in app.js)
  const RUN_STRIDE = 1.1; // body heights a second the Running clip covers at speed 1 (under the mixer's 0.82)
  const ledgeMode = () => !reduced && !view.dock && !!nodes.deck && nodes.projects.length > 1;
  const lastCase = () => { const n = nodes.projects[nodes.projects.length - 1]; return n.querySelector('.project-card') || n; };
  const LEDGE = { edge: 0.2, fall: 0.62, up: 0.9 }; // the run's share of the zone; the fall and the getting up, in seconds
  const ledge = { drove: false, was: false, face: 1, lastP: -1, still: 0, v: 0, carry: null }; // carry: the card it dropped in behind
  function ledgeExit(p, idB, dt) {
    const F = anchorFor('projetos'); // its footing on the card, held at the deck's resting height
    const node = nodes.projects[nodes.projects.length - 1];
    const card = lastCase();
    const r = card.getBoundingClientRect();
    const h = F.h;
    const xEdge = r.right + h * 0.08; // where its feet leave the card
    const YAW_RUN = 1.15, YAW_LOOK = 0.15; // facing its way, and (nearly) the visitor
    if (p > LEDGE.edge) {
      // Off the edge: the jets carry it (an even flight, see journeyAt),
      // carried on a little by its run, down beside the case to the next section's
      // spot (while the case is held there, just off its right side: see anchorFor).
      // Whatever of it overlaps the case is hidden behind it (drawn by maskTunnel).
      const s = (p - LEDGE.edge) / (1 - LEDGE.edge);
      const ek = endKind(idB);
      const ph = scrubPhases('fall', ek);
      journeyAt({ x: xEdge, y: F.y, h, yaw: YAW_LOOK, hang: true }, anchorFor(idB, true), s, 'fall', ek, ph);
      const q = clamp01(s / ph.L);
      // (straight into the hang: from its run to the visitor in a flash)
      const k = smooth(clamp01(s / 0.1));
      at.yaw = YAW_RUN + (at.yaw - YAW_RUN) * k;
      jr.w *= smooth(clamp01(s / 0.06));
      if (baseName !== 'idle') { baseName = 'idle'; if (!oneShot) fadeTo('idle', 0.12); }
      if (q < 1) {
        // (it looks where it is flying to)
        [glance.x, glance.y] = [at.x, at.y - h * 0.75];
        glance.until = performance.now() + 150;
      }
      ledge.carry = card;
      ledge.lastP = -1;
      return;
    }
    ledge.drove = true;
    ledge.carry = null;
    // (back on the card afresh: nothing left over from the last time)
    if (ledge.lastP < 0) { ledge.still = 0; ledge.v = 0; ledge.face = 1; }
    // the run: at an even pace to the end of the card, a pure function of the scroll
    const v = (xEdge - F.x) / LEDGE.edge;
    const x = F.x + v * p;
    // which way it faces: the way it goes along the card (back up the page it turns
    // round)
    const dp = ledge.lastP >= 0 ? p - ledge.lastP : 0;
    const moving = Math.abs(dp) > 1e-5;
    ledge.still = moving ? 0 : ledge.still + dt;
    const dir = moving ? Math.sign(dp) : Math.sign(ledge.face) || 1;
    ledge.face += (dir - ledge.face) * damp(7, dt);
    at.x = x;
    at.y = F.y;
    at.h = h;
    at.yaw = YAW_RUN * ledge.face;
    snapAt();
    vel.x = vel.y = 0;
    jr.on = true;
    const P = jr.pose || (jr.pose = newPose());
    mixPose(P, POSE.hang, POSE.hang, 0);
    jr.w = 0;
    jr.pin = 1;
    jr.air = 0;
    jr.tilt = 0;
    jr.fly = 0;
    jr.pitch = 0;
    jr.squash = 0;
    jr.hop = 0;
    jr.floor = { node, u: clamp01((x - r.left) / Math.max(1, r.width)), x, y: F.y, h };
    jr.lastP = 0; // (so the bump counts once the drop starts)
    seatLift = 0;
    // The legs: the Running clip while it covers ground (standing still on the card when
    // the scroll stops), paced to its speed.
    const speed = moving ? Math.abs(dp * v) / Math.max(dt, 1e-3) : 0;
    ledge.v += (speed - ledge.v) * damp(8, dt);
    const want = ledge.still > 0.35 ? 'idle' : 'run';
    if (baseName !== want) { baseName = want; if (!oneShot || want === 'run') fadeTo(want, 0.22); }
    if (current === actions.run) actions.run.setEffectiveTimeScale(clamp(ledge.v / (h * RUN_STRIDE) + 0.4, 0.8, 2.2));
    // what it looks at: ahead along the card
    [glance.x, glance.y] = [x + Math.sign(ledge.face || 1) * h * 3, F.y - h * 0.6];
    glance.until = performance.now() + 150;
    ledge.lastP = p;
  }

  // ---------------------------------------------------------------------------
  // Journeys in plain sight
  // ---------------------------------------------------------------------------
  // From spot A to spot B at progress p (0..1), the same whether the scroll scrubs it
  // or a clock runs it:
  //   take-off  (off a floor) a crouch and a spring
  //   flight    an arc from A to B (setting off in the air, it drops from there; out
  //             of a portal it keeps flying on a moment first)
  //   landing   at a portal it stays in the air, leaning in; anywhere else the jets
  //             brake it and it sets down on its feet (the backside landing below is
  //             kept for a body without the jetpack)
  // sk (start): 'stand' | 'fall' | 'hover' | 'fly'      ek (end): 'hover' | 'feet' | 'butt'
  // (with the jetpack it never drops onto its backside any more: it flies down and lands on
  // its feet, the jets braking it)
  const endKind = (id) => (id === 'historia' && tunnelMode() ? 'hover' : 'feet');
  function scrubPhases(sk, ek) {
    const T0 = sk === 'stand' ? 0.14 : 0;
    const L = ek === 'hover' ? 1 : ek === 'feet' ? 0.8 : 0.58;
    return { T0, L, S: ek === 'butt' ? L + 0.12 : L };
  }
  // what a journey asks of the frame: pose (and its weight over the clips), floor
  // pinning, airborne-ness, body lean, flying tilt, squash, a little bounce, the card it
  // sits on (tun: the tunnel drives it, so it may float and look around)
  const jr = { on: false, tun: false, w: 0, pin: 0, air: 0, pitch: 0, tilt: 0, spin: 0, bank: 0, fly: 0, squash: 0, hop: 0, jet: 0, pose: null, floor: null, lastP: -1 };
  function journeyAt(A, B, p, sk, ek, ph) {
    const { T0, L, S } = ph;
    jr.on = true;
    vel.x = vel.y = 0;
    const q = clamp01((p - T0) / Math.max(1e-4, L - T0)); // flight progress
    const kq = smooth(q);
    const airEnd = ek === 'hover';
    const aloft = sk !== 'stand';

    // where: still at A for the take-off, an arc in flight, then B
    if (p < T0) { at.x = A.x; at.y = A.y; }
    else if (p < L || airEnd) {
      // (A.lag: it drops straight down at first and only then drifts over)
      const kx = A.lag ? smooth(clamp01((q - A.lag) / (1 - A.lag))) : kq;
      at.x = A.x + (B.x - A.x) * kx + (sk === 'fly' ? A.h * 1.5 * Math.sin(Math.PI * q) * (1 - q) : 0);
      // (the jets carry it: no free fall, an even flight that eases in and out)
      const ky = aloft || airEnd ? kq : q;
      const apex = sk === 'stand' ? Math.max(A.h, B.h) * 0.32 + Math.max(0, A.y - B.y) * 0.25 : 0;
      at.y = A.y + (B.y - A.y) * ky - apex * Math.sin(Math.PI * q);
    } else { at.x = B.x; at.y = B.y; }
    at.h = p < T0 ? A.h : A.h + (B.h - A.h) * kq;
    // it lands three-quarters on (so the sit reads), then turns to its spot
    const landYaw = ek === 'butt' ? 0.62 : B.yaw;
    at.yaw = p < L || airEnd
      ? A.yaw + wrapPi(landYaw - A.yaw) * kq
      : landYaw + wrapPi(B.yaw - landYaw) * smooth(clamp01((p - S) / Math.max(1e-4, 1 - S)));
    snapAt();

    // how: airborne in flight, pinned to the floor at both ends, leaning back into
    // the landing, squashed by the bump; flying level, it rights itself as it drops,
    // and arriving at a portal it leans in
    jr.air = (aloft ? (sk === 'fly' ? 0.45 + 0.55 * smooth(clamp01(q / 0.25)) : 1) : smooth(clamp01(q / 0.12))) * (1 - (airEnd ? smooth(clamp01((q - 0.7) / 0.3)) : smooth(clamp01((q - 0.82) / 0.18))));
    jr.pin = Math.max(sk === 'stand' ? 1 - smooth(clamp01(q / 0.25)) : 0, airEnd ? 0 : smooth(clamp01((q - 0.55) / 0.45)));
    jr.tilt = (A.tilt || 0) * (1 - smooth(clamp01(q / 0.45))) + (airEnd ? TILT.hover * smooth(clamp01((q - 0.55) / 0.45)) : 0);
    jr.fly = 0;
    jr.pitch = 0;
    if (sk === 'stand' && p < T0) jr.pitch += 0.16 * Math.sin(Math.PI * p / T0);
    if (ek === 'butt') jr.pitch -= 0.45 * smooth(clamp01((q - 0.5) / 0.5)) * (1 - smooth(clamp01((p - L) / Math.max(1e-4, (S - L) * 0.6))));
    jr.squash = 0;
    jr.hop = 0;
    if (sk === 'stand' && p < T0) jr.squash = 0.07 * Math.sin(Math.PI * p / T0);
    if (!airEnd && p >= L) {
      const e = clamp01((p - L) / Math.max(1e-4, (ek === 'butt' ? S : 1) - L));
      jr.squash = (ek === 'butt' ? 0.2 : 0.1) * Math.sin(Math.PI * Math.min(1, e * 2.4)) * (1 - e);
      if (ek === 'butt' && e > 0.42) jr.hop = modelH * 0.045 * Math.sin(Math.PI * clamp01((e - 0.42) / 0.4));
    }

    // the pose, over the clips
    const P = jr.pose || (jr.pose = newPose());
    let w = 1;
    if (p < T0) {
      mixPose(P, POSE.crouch, POSE.crouch, 0);
      w = smooth(clamp01(p / Math.max(1e-4, T0 * 0.7)));
    } else if (p < L || airEnd) {
      // springing off (or setting off in the air), arms up in flight
      // (on the jets: upright, legs hanging easy and arms out to steer, never a flail)
      if (sk === 'fall') mixPose(P, A.hang ? POSE.hang : POSE.hover, POSE.hover, A.hang ? smooth(clamp01(q / 0.25)) : 1);
      else if (aloft) mixPose(P, sk === 'fly' ? POSE.fly : POSE.hover, POSE.hover, smooth(clamp01(q / 0.35)));
      else mixPose(P, POSE.crouch, POSE.hover, smooth(clamp01(q / 0.2)));
      // and ready for what's coming: the portal, the feet, or the backside
      const ready = smooth(clamp01((q - 0.62) / 0.38));
      if (ready > 0) mixPose(P, P, airEnd ? POSE.hover : ek === 'feet' ? POSE.crouch : POSE.seat, ready);
    } else if (ek === 'butt') {
      const g = clamp01((p - S) / Math.max(1e-4, 1 - S)); // getting up
      if (g < 0.4) mixPose(P, POSE.seat, POSE.push, smooth(g / 0.4));
      else mixPose(P, POSE.push, POSE.crouch, smooth(clamp01((g - 0.4) / 0.35)));
      w = 1 - smooth(clamp01((g - 0.72) / 0.28));
    } else {
      mixPose(P, POSE.crouch, POSE.crouch, 0);
      w = 1 - smooth(clamp01((p - L) / Math.max(1e-4, 1 - L)));
    }
    jr.w = w;
    // (the card under it: the one it takes off from, then the one it lands on)
    jr.floor = !airEnd && p >= L - 0.02 && B.floor ? B.floor : sk === 'stand' && p < T0 && A.floor ? A.floor : null;
    // the jets: lit in the crouch, a hard burn lifting off, easing to a cruise and burning
    // hard again to brake for the landing; off once it is down (at a portal it hovers on)
    jr.jet = p < T0 ? 0.35 * smooth(p / Math.max(1e-4, T0))
      : p < L || airEnd ? Math.max(1 - 0.45 * smooth(clamp01(q / 0.35)), airEnd ? 0.35 + 0.4 * (1 - smooth(clamp01((q - 0.75) / 0.25))) : smooth(clamp01((q - 0.55) / 0.4)))
      : 0;
    // the bump: once, on the way down (and, as heard, the spring off the floor before it)
    if (!airEnd && jr.lastP >= 0 && jr.lastP < L && p >= L) {
      touchdown(ek);
      sfx('land');
    }
    if (sk === 'stand' && jr.lastP >= 0 && jr.lastP < T0 && p >= T0) sfx('takeoff');
    jr.lastP = p;
  }
  // Facing the way it flies (see head): flying (laid out level) and moving the other
  // way it turns round, through the front and rising out of the level flight while it
  // turns. Slowed to a stop in mid-air it keeps its heading; hovering at a portal,
  // standing or landing, the journey's own facing holds.
  function stepHeading(dt) {
    const flyW = jr.on ? clamp01((jr.tilt - TILT.hover) / (TILT.fly - TILT.hover)) : 0;
    // which way it goes: through the tunnels, along the pass (the cards slide round the
    // ring under it, and it wraps round the screen's edges); anywhere else, on screen
    let v = 0;
    const along = Number.isFinite(head.along);
    if (tun.drove) {
      if (head.wasTun && Number.isFinite(head.pg)) v = (head.g - head.pg) * head.gw;
      head.pg = head.g;
    } else if (along) {
      // (into the timeline: how far it went along the flight as laid out, back if negative;
      // the flight turns round by itself out of sight, so on screen it never runs backward)
      v = head.along;
    } else {
      const dx = Number.isFinite(head.x) ? at.x - head.x : 0;
      v = Math.abs(dx) < view.w * 0.3 ? dx : 0;
    }
    head.wasTun = tun.drove;
    head.x = at.x;
    // (along a flight and across the screen are not the same measure: one taking over
    // from the other starts from none)
    const mode = tun.drove ? 0 : along ? 1 : 2;
    if (mode + head.mode === 3) head.vx = 0;
    head.mode = mode;
    head.vx += ((dt > 0 ? v / dt : 0) - head.vx) * damp(9, dt);
    // (a timed journey rights itself as it sets off, facing the way it was: no turn-round
    // would be done before it is upright, only begun and taken back)
    if (Number.isFinite(head.face)) head.to = head.face; // (the flight's own call: see heroCross)
    else if (flyW < 0.25 || reduced || view.dock || trans) head.to = 0;
    else if (Math.abs(head.vx) > at.h * 0.5) head.to = along ? (head.vx > 0 ? 0 : 1) : (head.vx > 0) === (Math.sin(at.yaw) >= 0) ? 0 : 1;
    head.m += (head.to - head.m) * damp(6, dt);
    if (Math.abs(head.to - head.m) < 1e-3) head.m = head.to;
    // Where the turn is part of the flight as laid out (heroCross), it is not left to the
    // clock: scrolled back out of the hover at the first portal at a wheel's pace, it was
    // off the screen, tail first, before it had turned.
    if (head.m < head.lo) { head.to = 1; head.m = Math.min(head.lo, head.m + dt * 12); }
    else if (head.m > head.hi) { head.to = 0; head.m = Math.max(head.hi, head.m - dt * 12); }
    if (dbg.head != null) head.m = head.to = dbg.head; // (QA: pin the heading)
  }
  // (a journey taking over mid-way starts from where the body was: see snapRig)
  function snapAt() {
    if (snap.k >= 1) return;
    at.x = snap.at.x + (at.x - snap.at.x) * snap.k;
    at.y = snap.at.y + (at.y - snap.at.y) * snap.k;
    at.h = snap.at.h + (at.h - snap.at.h) * snap.k;
    at.yaw = snap.at.yaw + wrapPi(at.yaw - snap.at.yaw) * snap.k;
  }
  function touchdown(ek) {
    if (section === 'inicio') dustBurst(0.6);
    setFace('surprised', 1);
    if (ek === 'butt') shakeT = 0.25; // a dazed little head shake
    // dust off the card around it
    root.updateMatrixWorld(true);
    const c = new THREE.Vector3(0, 0, 0).applyMatrix4(root.matrixWorld);
    const H = at.h * view.wpp;
    for (let n = 0; n < 34; n++) {
      const a = Math.random() * TAU, sp = H * (0.35 + Math.random() * 0.45);
      spawn(c.x + Math.cos(a) * H * 0.12, c.y + H * 0.02, c.z + Math.sin(a) * H * 0.08,
        Math.cos(a) * sp, H * (0.05 + Math.random() * 0.12), Math.sin(a) * sp * 0.4, 0.5 + Math.random() * 0.5, 0.5);
    }
  }

  // ---------------------------------------------------------------------------
  // Time tunnels: the timeline's plateau
  // ---------------------------------------------------------------------------
  // On the timeline the pass follows the cards (g: card index + how far through it),
  // straight from the scroll: stopped mid-way, it stays where it is (inside a card too)
  // instead of flying off to a portal on its own.
  const tun = { g: 0, active: false, drove: false, mask: null, maskK: -1, carry: null, hidden: false, wake: -1, edge: null, wait: false, ease: 1, leap: false };
  // (the portal it parks at when it arrives from elsewhere with the page at rest)
  function restCard(f) {
    const last = tunnels.length - 1;
    const lo = Math.min(Math.floor(f), last), hi = Math.min(lo + 1, last);
    return (f - lo < 0.5 && (f - lo < 0.15 || hoverOK(lo))) || hi === lo ? lo : hi;
  }
  function stepTunnel(dt, now) {
    const f = storyF();
    const idle = now - scrub.scrolledAt > 450;
    // taking over (from a journey, a jump): with the page still moving, straight onto
    // the pass under the scroll; at rest, from the nearer portal, gliding on to it.
    // Where the pass is behind a card, by that card's portal as well: put there from in
    // front of the card, it would be gone in one frame. And a portal it is not at yet
    // (off the flight in from the hero, which ends where the first card's stood before
    // the page went on) it reaches first, in the open: the pass waits there for it,
    // and sets off gently. So too with the pass left far behind the page (taken back up
    // through the last card while the page went on to the first ones): flown through
    // them all at once it would be a streak from one side of the screen to the other,
    // so it goes to the nearer portal from where it is.
    const far = tun.active && dbg.tunG == null && (tun.leap || Math.abs(f - tun.g) > 1.25);
    tun.leap = false;
    if (!tun.active || far) {
      const st = tunnelAt(f);
      tun.g = idle || far ? restCard(f) : st.over && hoverOK(st.k) ? st.k : f;
      tun.edge = null;
      const s0 = tun.g === f ? st : tunnelAt(tun.g);
      tun.wait = tun.g !== f && Math.hypot(at.x - s0.x, at.y - s0.cy - s0.h * BODY_C) > s0.h * 0.2;
      tun.ease = tun.wait || (tun.g !== f && !idle) ? 0 : 1;
      if (far) { head.pg = NaN; head.vx = 0; } // (no pace along the pass from a leap of its own)
      snapRig();
    }
    if (snap.k >= 1) tun.wait = false;
    if (!tun.wait) {
      tun.ease = Math.min(1, tun.ease + dt / 0.35);
      tun.g += (f - tun.g) * damp(idle ? 3 : 10, dt) * smooth(tun.ease);
    }
    if (Math.abs(f - tun.g) < 2e-4) tun.g = f;
    // (QA: pin the pass. Past the last portal it is only as it comes back up through the
    // last card: see stepScrub)
    tun.g = clamp(dbg.tunG != null ? dbg.tunG : tun.g, 0, tunnels.length - 1 + TUN.inside - 1e-3);
    applyTunnel(tunnelAt(tun.g));
  }
  function applyTunnel(st) {
    jr.on = true;
    jr.tun = true;
    vel.x = vel.y = 0;
    at.x = st.x;
    at.y = st.cy + st.h * BODY_C;
    at.h = st.h;
    at.yaw = st.yaw;
    if (snap.k < 1) {
      at.x = snap.at.x + (at.x - snap.at.x) * snap.k;
      at.y = snap.at.y + (at.y - snap.at.y) * snap.k;
      at.h = snap.at.h + (at.h - snap.at.h) * snap.k;
      at.yaw = snap.at.yaw + wrapPi(at.yaw - snap.at.yaw) * snap.k;
    }
    goal = { x: at.x, y: at.y, h: at.h, yaw: at.yaw, tun: true };
    head.g = st.k + st.ph; // (where along the pass, for the heading)
    head.gw = st.c.w;
    jr.tilt = st.tilt;
    jr.fly = st.fly;
    jr.air = 0.45 * st.fly; // a little buffeting in flight
    jet.boost = st.ph > TUN.inside && st.ph < TUN.off + 0.15 ? 1 : 0; // (burning hard across the screen)
    jr.pin = jr.pitch = jr.squash = jr.hop = 0;
    jr.floor = null;
    jr.w = 1;
    mixPose(jr.pose || (jr.pose = newPose()), POSE.hover, POSE.fly, st.fly);
    tun.mask = st.over ? st.c : null;
    tun.maskK = st.k;
    tun.carry = null;
    tun.hidden = st.hidden;
    tun.drove = true;
    portalFx(st);
  }
  // The portals light up as it nears them, a wake of light runs through the card while
  // it is inside, and motes swirl into the way in and burst out of the way out.
  function portalFx(st) {
    tunnels.forEach((T, j) => {
      const nearIn = (j === st.k && st.ph > 0.005 && st.ph < TUN.dive + 0.05) || (j === st.k + 1 && st.ph > 0.84);
      const nearOut = j === st.k && st.ph > TUN.inside - 0.08 && st.ph < TUN.inside + 0.12;
      if (nearIn !== T.near[0]) { T.near[0] = nearIn; T.pin.classList.toggle('is-near', nearIn); }
      if (nearOut !== T.near[1]) { T.near[1] = nearOut; T.pout.classList.toggle('is-near', nearOut); }
    });
    const wo = st.inside >= 0 ? smooth(clamp01((st.x - st.c.l) / (st.h * 0.6))) * smooth(clamp01((st.c.r - st.x) / (st.h * 0.6))) : 0;
    setWake(wo > 0.01 ? st.k : -1, wo, st.inside);
    // the head going in at the left edge, the feet clearing the right edge
    const edge = st.inside < 0 ? 2 : st.x + st.front < st.c.l ? 0 : st.x - st.back > st.c.r ? 2 : 1;
    if (tun.edge && tun.edge.k === st.k && tun.edge.e !== edge) {
      // (in at the left and out at the right; scrolled back, in at the right and out at
      // the left, the motes going its way)
      const fwd = edge > tun.edge.e;
      if ((tun.edge.e === 0) !== (edge === 0)) portalBurst(st.c.l, st.c, st.h, fwd, fwd ? 1 : -1);
      if ((tun.edge.e === 2) !== (edge === 2)) portalBurst(st.c.r, st.c, st.h, !fwd, fwd ? 1 : -1);
    }
    tun.edge = { k: st.k, e: edge };
  }
  function setWake(k, wo, frac) {
    if (tun.wake >= 0 && tun.wake !== k) {
      const T = tunnels[tun.wake];
      T.wake.style.setProperty('--wo', '0');
      T.wake.classList.remove('is-on');
      T.wo = 0;
    }
    if (k >= 0 && tun.wake !== k) tunnels[k].wake.classList.add('is-on');
    tun.wake = k;
    if (k < 0) return;
    const T = tunnels[k];
    const wx = Math.round(frac * T.li.offsetWidth);
    if (Math.abs(wo - T.wo) > 0.02 || wx !== T.wx) {
      T.wo = wo;
      T.wx = wx;
      T.wake.style.setProperty('--wo', wo.toFixed(2));
      T.wake.style.setProperty('--wx', `${wx}px`);
    }
  }
  function portalBurst(x, c, h, inward, dir) {
    setFace('surprised', 0.6);
    sfx(inward ? 'portal-in' : 'portal-out');
    const H = h * view.wpp;
    const o = toWorld(x, c.cy, 0, new THREE.Vector3());
    const R = c.h * 0.32 * view.wpp; // half the portal's height
    for (let n = 0; n < 30; n++) {
      const a = (Math.random() * 2 - 1) * Math.PI * 0.5;
      const y = Math.sin(a) * R, xx = Math.cos(a) * H * 0.2;
      // in: drawn off the rim toward the heart and into the card; out: thrown clear
      const sp = H * (0.4 + Math.random() * 0.6);
      spawn(o.x - xx * (inward ? 1 : -1) * dir, o.y + y, o.z,
        (inward ? sp * 0.7 : sp) * dir, inward ? -y * 1.6 : y * 0.5 + H * 0.05, (Math.random() - 0.5) * H * 0.2,
        inward ? 0.35 + Math.random() * 0.25 : 0.6 + Math.random() * 0.5, 0.6);
    }
  }
  // Off the tunnel (a jump away, a resize to the dock): portals and wake back at rest.
  // Leaving from behind a card, it stays behind that card until it is clear of it.
  function leaveTunnel() {
    tun.carry = tun.mask && !view.dock ? { k: tun.maskK, until: time + 1.6 } : null;
    tunnels.forEach((T) => {
      if (T.near[0]) { T.near[0] = false; T.pin.classList.remove('is-near'); }
      if (T.near[1]) { T.near[1] = false; T.pout.classList.remove('is-near'); }
    });
    setWake(-1, 0, 0);
    tun.mask = null;
    tun.hidden = false;
    tun.edge = null;
  }
  // Behind a card: the whole body is masked by its box (a rect of its own: gripCard's
  // contact card clip for the left arm is untouched). A body behind a card it left keeps
  // being masked by it until it is clear of it, so nothing pops out in front.
  let maskHides = false; // the body's middle is behind the mask (no clicking it there)
  const rectOf = (el) => { const r = el.getBoundingClientRect(); return { l: r.left, t: r.top, w: r.width, h: r.height, r: r.right, b: r.bottom }; };
  function maskTunnel() {
    const cy = at.y - at.h * BODY_C, rad = at.h * 0.7;
    const overlaps = (b) => !(at.x + rad < b.l || at.x - rad > b.l + b.w || cy + rad < b.t || cy - rad > b.t + b.h);
    let c = tun.mask;
    if (!c && tun.carry) {
      const box = cardBox(tun.carry.k);
      if (!overlaps(box) || time > tun.carry.until || view.dock) tun.carry = null;
      else c = box;
    }
    if (!c && ledge.carry) {
      const box = rectOf(ledge.carry);
      if (!overlaps(box) || view.dock || reduced || (trans && trans.kind !== 'hop') || section !== 'contato') ledge.carry = null;
      else c = box;
    }
    shared.uClipAll.value = c ? 1 : 0;
    maskHides = !!c && at.x > c.l && at.x < c.l + c.w && cy > c.t && cy < c.t + c.h;
    if (!c) return;
    const [ox, oy] = clientToCanvas(c.l, c.t);
    const pr = renderer.getPixelRatio();
    shared.uAllRect.value.set(ox * pr, (view.h - oy - c.h) * pr, (ox + c.w) * pr, (view.h - oy) * pr);
  }

  // A pose change that can't be continuous (a journey taking over mid-way, a new
  // target): blend from where everything was over a quarter of a second.
  const snap = { t: 1, k: 1, at: { x: 0, y: 0, h: 1, yaw: 0 }, hm: 0, tilt: 0, spin: 0, bank: 0, pp: new THREE.Vector3(), pr: new THREE.Vector3(), ps: new THREE.Vector3(1, 1, 1), q: rigBones.map(() => new THREE.Quaternion()), p: rigBones.map(() => new THREE.Vector3()) };
  function snapRig() {
    snap.t = 0;
    snap.k = 0;
    Object.assign(snap.at, { x: at.x, y: at.y, h: at.h, yaw: at.yaw });
    snap.hm = head.m;
    snap.tilt = tilt.rotation.x;
    snap.spin = tilt.rotation.y;
    snap.bank = tilt.rotation.z;
    snap.pp.copy(pivot.position);
    snap.pr.set(pivot.rotation.x, pivot.rotation.y, pivot.rotation.z);
    snap.ps.copy(pivot.scale);
    rigBones.forEach((b, i) => { snap.q[i].copy(b.quaternion); snap.p[i].copy(b.position); });
  }
  const qSnap = new THREE.Quaternion();
  function blendSnap() {
    if (snap.k >= 1) return;
    const k = snap.k;
    // (turning round has a pace of its own, not held back by the blend: what blends is
    // the facing it turns from, and the rest of the yaw, the look and the sway)
    const turn = 1 - 2 * head.m;
    const more = pivot.rotation.y - at.yaw * turn, more0 = snap.pr.y - snap.at.yaw * (1 - 2 * snap.hm);
    pivot.position.lerpVectors(snap.pp, pivot.position, k);
    pivot.rotation.set(
      snap.pr.x + (pivot.rotation.x - snap.pr.x) * k,
      (at.yaw - wrapPi(at.yaw - snap.at.yaw) * (1 - k)) * turn + more0 + wrapPi(more - more0) * k,
      snap.pr.z + (pivot.rotation.z - snap.pr.z) * k);
    pivot.scale.lerpVectors(snap.ps, pivot.scale, k);
    setTilt(snap.tilt + (tilt.rotation.x - snap.tilt) * k, snap.spin + (tilt.rotation.y - snap.spin) * k, snap.bank + (tilt.rotation.z - snap.bank) * k);
    rigBones.forEach((b, i) => {
      b.quaternion.copy(qSnap.copy(snap.q[i]).slerp(b.quaternion, k));
      b.position.lerpVectors(snap.p[i], b.position, k);
    });
    pivot.updateMatrixWorld(true);
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
  function puff(quiet) {
    if (reduced) return;
    if (!quiet) sfx('mist-puff');
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

  // The jetpack fires through the time tunnels: a low flame hovering at a portal, full
  // flight level through the cards, and a hard burn across the screen to the next portal.
  const jv = new THREE.Vector3(), jd = new THREE.Vector3();
  function stepJet(dt) {
    if (!jet.group) return;
    const vis = clamp01(1 - shared.uDissolve.value * 2.5);
    let want = reduced || view.dock || !jr.on ? 0 : (jr.tun ? Math.max(0.35 + 0.65 * jr.fly, jet.boost) : jr.jet) * vis;
    if (dbg.jet != null) want = dbg.jet; // (QA: pin the thrust)
    jet.thrust += (want - jet.thrust) * damp(want > jet.thrust ? 8 : 4, dt);
    const T = jet.thrust;
    // heard: a loop as loud as the thrust, a cough as the jets light and a sigh as they die
    const snd = window.abissalAudio;
    if (snd && snd.on && snd.jet) {
      snd.jet(T);
      if (!jet.lit && T > 0.12) { jet.lit = true; sfx('jet-ignite'); }
      else if (jet.lit && T < 0.05) { jet.lit = false; sfx('jet-off'); }
    } else jet.lit = T > 0.12; // (switched on in mid-flight, the jets are simply lit already)
    const flick = 1 + 0.18 * Math.sin(time * 41) * Math.sin(time * 27 + 1);
    jet.glow.emissiveIntensity = T * 2.4 * flick;
    jet.flames.forEach((f, n) => {
      const on = T > 0.03;
      f.visible = on;
      if (on) f.scale.set(0.7 + 0.3 * T, T * flick * (n & 1 ? 1.08 : 0.94), 0.7 + 0.3 * T);
    });
    // (where a puff born behind a card is hidden: that card, wherever it has moved to)
    const masked = shared.uClipAll.value > 0.5;
    if (masked) jMat.uniforms.uRect.value.copy(shared.uAllRect.value);
    else if (tun.active && tun.maskK >= 0 && jp.live) {
      const c = cardBox(tun.maskK);
      const [ox, oy] = clientToCanvas(c.l, c.t);
      const pr = renderer.getPixelRatio();
      jMat.uniforms.uRect.value.set(ox * pr, (view.h - oy - c.h) * pr, (ox + c.w) * pr, (view.h - oy) * pr);
    }
    const H = Math.max(at.h * view.wpp, 1e-3);
    if (T > 0.04) {
      jp.carry += T * 140 * dt * jet.nozzles.length;
      while (jp.carry >= 1) {
        jp.carry -= 1;
        const m = jet.nozzles[(Math.random() * jet.nozzles.length) | 0];
        m.getWorldPosition(jv);
        jd.setFromMatrixColumn(m.matrixWorld, 1).normalize().negate(); // out of the mouth
        const i = jp.next;
        jp.next = (jp.next + 1) % N_JET;
        const sp = H * (1.3 + Math.random() * 1.0) * (0.45 + 0.55 * T);
        const sx = (Math.random() - 0.5) * H * 0.22, sy = (Math.random() - 0.5) * H * 0.22, sz = (Math.random() - 0.5) * H * 0.22;
        const back = Math.random() * dt; // (spread along the frame, not in clumps)
        jPos[i * 3] = jv.x + jd.x * sp * back; jPos[i * 3 + 1] = jv.y + jd.y * sp * back; jPos[i * 3 + 2] = jv.z + jd.z * sp * back;
        jp.vel[i * 3] = jd.x * sp + sx; jp.vel[i * 3 + 1] = jd.y * sp + sy; jp.vel[i * 3 + 2] = jd.z * sp + sz;
        jp.life[i] = (0.35 + Math.random() * 0.4) * (0.6 + 0.4 * T);
        jp.age[i] = 0;
        jp.a0[i] = (0.7 + Math.random() * 0.3) * Math.min(1, T * 1.6);
        jp.s0[i] = 8 + Math.random() * 9;
        jClip[i] = masked ? 1 : 0;
        jp.live = N_JET;
      }
    }
    if (!jp.live) return;
    const drag = Math.exp(-3.2 * dt);
    let alive = 0;
    for (let i = 0; i < N_JET; i++) {
      jp.age[i] += dt;
      const k = jp.age[i] / jp.life[i];
      if (k >= 1) { jAlpha[i] = 0; continue; }
      alive++;
      jp.vel[i * 3] *= drag; jp.vel[i * 3 + 1] = jp.vel[i * 3 + 1] * drag + H * 0.5 * dt; // spent exhaust drifts up, like bubbles
      jp.vel[i * 3 + 2] *= drag;
      const y0 = jPos[i * 3 + 1];
      jPos[i * 3] += jp.vel[i * 3] * dt; jPos[i * 3 + 1] += jp.vel[i * 3 + 1] * dt; jPos[i * 3 + 2] += jp.vel[i * 3 + 2] * dt;
      if (dust.on && y0 >= dust.floor && jPos[i * 3 + 1] < dust.floor) {
        // (exhaust reaching the hero's floor splashes out flat along it)
        const vy = -jp.vel[i * 3 + 1], hx = jp.vel[i * 3], hz = jp.vel[i * 3 + 2], hl = Math.hypot(hx, hz);
        const a = hl > vy * 0.15 ? Math.atan2(hz, hx) + (Math.random() - 0.5) * 1.6 : Math.random() * TAU;
        jPos[i * 3 + 1] = dust.floor;
        jp.vel[i * 3] = hx * 0.5 + Math.cos(a) * vy * 0.8;
        jp.vel[i * 3 + 2] = hz * 0.5 + Math.sin(a) * vy * 0.8;
        jp.vel[i * 3 + 1] = vy * 0.08;
      }
      jHeat[i] = 1 - k;
      jSize[i] = jp.s0[i] * (0.55 + 1.3 * k);
      jAlpha[i] = jp.a0[i] * Math.min(1, jp.age[i] / 0.04) * Math.pow(1 - k, 1.3);
    }
    jp.live = alive;
    jGeo.attributes.position.needsUpdate = true;
    jGeo.attributes.aAlpha.needsUpdate = true;
    jGeo.attributes.aSize.needsUpdate = true;
    jGeo.attributes.aHeat.needsUpdate = true;
    jGeo.attributes.aClip.needsUpdate = true;
  }

  // Where the blast meets the hero's floor: along each nozzle's axis from its mouth. Within
  // reach it raises dust, more the nearer and the harder the jets push, and lights the
  // floor there (and, a little, the body from below).
  const dV = new THREE.Vector3(), dD = new THREE.Vector3(), dHit = new THREE.Vector3();
  function dustSpawn(x, y, z, vx, vy, vz, life, alpha, size, heat) {
    const i = dust.next;
    dust.next = (dust.next + 1) % N_DUST;
    dPos[i * 3] = x; dPos[i * 3 + 1] = y; dPos[i * 3 + 2] = z;
    dust.vel[i * 3] = vx; dust.vel[i * 3 + 1] = vy; dust.vel[i * 3 + 2] = vz;
    dust.life[i] = life;
    dust.age[i] = 0;
    dust.a0[i] = alpha;
    dust.s0[i] = size;
    dust.h0[i] = heat;
    dust.live = N_DUST;
  }
  // the touchdown: a ring blown out from under its feet all at once
  function dustBurst(k) {
    if (!dust.on || reduced) return;
    root.updateMatrixWorld(true);
    const c = dV.set(0, 0, 0).applyMatrix4(root.matrixWorld);
    if (0.9 * k > dust.glow) { dust.glow = 0.9 * k; dust.gs.copy(c); } // (the flash, under its feet)
    const H = dust.H;
    for (let n = 0; n < 110 * k; n++) {
      const a = Math.random() * TAU, sp = H * (1.4 + Math.random() * 1.6) * k;
      const r = H * (0.08 + Math.random() * 0.1);
      dustSpawn(c.x + Math.cos(a) * r, dust.floor + H * 0.01, c.z + Math.sin(a) * r, Math.cos(a) * sp, H * (0.04 + Math.random() * 0.1), Math.sin(a) * sp,
        1.0 + Math.random() * 1.1, 0.3 + Math.random() * 0.2, 18 + Math.random() * 22, 0.5 + 0.45 * Math.random());
    }
  }
  function clearDust() {
    dust.age.fill(1e9);
    dAlpha.fill(0);
    dGeo.attributes.aAlpha.needsUpdate = true;
    dust.live = dust.carry = dust.glow = dust.light = 0;
    glowDisk.visible = false;
  }
  function stepDust(dt) {
    // The floor is the hero's, under its spot: there while the hero is the guide's place.
    // On a timed journey (a link, a leap) the page scrolls by on its own, so there the
    // floor comes and goes with the hero itself, whichever way the guide is heading: in
    // full once the hero's lower edge is under its line, gone with that edge halfway up
    // the screen.
    const hop = trans && trans.kind === 'hop';
    const B = !reduced && !view.dock && rigOK && (hop ? !!nodes.storySec : section === 'inicio') ? anchorFor('inicio') : null;
    let there = B ? 1 : 0;
    if (B && hop) {
      const mid = view.h * 0.5;
      there = smooth(clamp01((nodes.storySec.getBoundingClientRect().top - mid) / Math.max(1, B.y - mid)));
    }
    // (it comes and goes softly, and what dust was left on it goes with it)
    dust.k += (there - dust.k) * (1 - Math.exp(-dt / 0.08));
    if (!there && dust.k < 0.02 && (dust.live || dust.glow > 0)) clearDust();
    // It takes a blast only from over it (not across the legs of a guide setting off
    // from lower down).
    const on = there > 0 && at.y <= B.y + at.h * 0.02;
    dust.on = on;
    let I = 0;
    if (on) {
      dust.floor = (view.h / 2 - B.y) * view.wpp;
      dust.H = Math.max(at.h * view.wpp, 1e-3);
      if (jet.group && jet.thrust > 0.04 && shared.uDissolve.value < 0.5) {
        let n = 0, w = 0, reach = 0;
        dHit.set(0, 0, 0);
        dust.push.set(0, 0, 0);
        for (const m of jet.nozzles) {
          m.getWorldPosition(dV);
          if (dV.y < dust.floor) continue; // (not over it)
          n++;
          dD.setFromMatrixColumn(m.matrixWorld, 1).normalize().negate(); // out of the mouth
          // a blast that only grazes the floor spreads thin along it: all of it counts
          // steeper than about 50 degrees, none of it under about 17
          const g = smooth(clamp01((-dD.y - 0.3) / 0.5));
          if (g <= 0) continue;
          const s = (dust.floor - dV.y) / dD.y; // how far down its axis the floor is
          dHit.addScaledVector(dD, s * g).addScaledVector(dV, g);
          dust.push.x += dD.x * g; dust.push.z += dD.z * g;
          reach += s * g;
          w += g;
        }
        if (w > 0) {
          dust.hit.copy(dHit).divideScalar(w);
          dust.push.divideScalar(w);
          reach /= w;
          const R = 1.9 * dust.H; // the blast's reach
          I = Math.pow(clamp01(1 - reach / R), 2.4) * Math.min(1.5, jet.thrust * 1.35) * (w / n);
        }
      }
    }
    // The floor's glow follows the blast (and a flash on the touchdown fades out). Lit by
    // the blast, it is where the blast hits. Once the jets lift or swing away it stays
    // where it was last lit in full, fading there, drawn toward the hit only as far as
    // the blast still feeds it.
    const stale = dust.glow * Math.exp(-dt / 0.35);
    if (I > 0 && I * 0.8 >= stale) { dust.glow = I * 0.8; dust.gs.copy(dust.hit); }
    else dust.glow = stale;
    if (I > 0) dust.gp.lerpVectors(dust.gs, dust.hit, (I * 0.8) / dust.glow);
    else dust.gp.copy(dust.gs);
    dust.light = dust.glow * dust.k;
    glowDisk.visible = dust.light > 0.01;
    if (glowDisk.visible) {
      glowDisk.position.set(dust.gp.x, dust.floor + dust.H * 0.002, dust.gp.z);
      glowDisk.scale.setScalar(dust.H * (0.4 + 0.45 * Math.min(1, dust.glow)));
      glowMat.uniforms.uI.value = Math.min(1, dust.glow) * 0.9 * dust.k;
    }
    if (I > 0.03) {
      dust.carry += 460 * Math.min(1.2, I) * dt;
      const H = dust.H;
      while (dust.carry >= 1) {
        dust.carry -= 1;
        const a = Math.random() * TAU;
        const sp = H * (0.9 + Math.random() * 1.7) * (0.45 + 0.55 * Math.min(1, I));
        // flat out along the floor every way, more of it the way the jets lean
        const vx = Math.cos(a) * sp + dust.push.x * sp * 0.9, vz = Math.sin(a) * sp + dust.push.z * sp * 0.9;
        const r = H * 0.06 * Math.random();
        if (Math.random() < 0.14) {
          // grit: a hot spark skipping out fast and low
          dustSpawn(dust.hit.x, dust.floor + H * 0.01, dust.hit.z, vx * 1.9, H * (0.05 + 0.25 * Math.random()), vz * 1.9,
            0.35 + Math.random() * 0.35, 0.7, 4 + Math.random() * 3, 0.95);
          continue;
        }
        dustSpawn(dust.hit.x + Math.cos(a) * r, dust.floor + H * 0.01, dust.hit.z + Math.sin(a) * r, vx, H * (0.02 + 0.1 * Math.random()), vz,
          0.8 + Math.random() * 1.0, (0.24 + 0.2 * Math.random()) * (0.55 + 0.45 * Math.min(1, I)), 16 + Math.random() * 20, 0.4 + 0.6 * Math.random() * Math.min(1, I));
      }
    } else dust.carry = 0;
    if (!dust.live) return;
    const drag = Math.exp(-2.6 * dt);
    let alive = 0;
    for (let i = 0; i < N_DUST; i++) {
      dust.age[i] += dt;
      const k = dust.age[i] / dust.life[i];
      if (k >= 1) { dAlpha[i] = 0; continue; }
      alive++;
      const H = dust.H;
      dust.vel[i * 3] *= drag;
      dust.vel[i * 3 + 2] *= drag;
      // slowing down, it billows up a little
      dust.vel[i * 3 + 1] = dust.vel[i * 3 + 1] * drag + H * 0.3 * dt * smooth(k);
      dPos[i * 3] += dust.vel[i * 3] * dt;
      dPos[i * 3 + 1] = Math.max(dust.floor, dPos[i * 3 + 1] + dust.vel[i * 3 + 1] * dt);
      dPos[i * 3 + 2] += dust.vel[i * 3 + 2] * dt;
      dHeat[i] = dust.h0[i] * (1 - k) * (1 - k);
      dSize[i] = dust.s0[i] * (0.6 + 2.4 * k);
      dAlpha[i] = dust.a0[i] * Math.min(1, dust.age[i] / 0.05) * Math.pow(1 - k, 1.4) * dust.k;
    }
    dust.live = alive;
    dGeo.attributes.position.needsUpdate = true;
    dGeo.attributes.aAlpha.needsUpdate = true;
    dGeo.attributes.aSize.needsUpdate = true;
    dGeo.attributes.aHeat.needsUpdate = true;
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

  // Lantern motes: a slow orbit around the feet and knees. Falling, they become the
  // wind: streaming up past the body, faster while the scroll moves. Flying level
  // through the tunnels, the wind comes from ahead and streams back along it.
  let windW = 0, windT = 0, windA = Math.PI / 2;
  function stepMotes(dt, air, level) {
    const vis = 1 - shared.uDissolve.value;
    const s = root.scale.x;
    windW += (air - windW) * damp(4, dt);
    windT += dt * (0.5 + Math.min(1.4, Math.abs(scrollV) / 1100));
    // (which way the wind streams: up, or back along a body facing right)
    windA += (Math.PI / 2 + (Math.PI / 2) * level - windA) * damp(5, dt);
    const dx = Math.cos(windA), dy = Math.sin(windA);
    for (let i = 0; i < N_MOTE; i++) {
      const j = N_TRANSIT + N_POOL + i;
      const a = motePhase[i * 3] + time * motePhase[i * 3 + 1] * 0.55;
      const r = modelH * (0.3 + 0.12 * Math.sin(time * 0.7 + i)) * s;
      const y = modelH * (0.05 + 0.5 * motePhase[i * 3 + 2] + 0.04 * Math.sin(time * 1.3 + i * 2.1)) * s;
      let x = Math.cos(a) * r, yy = y, z = Math.sin(a) * r * 0.6;
      let alpha = (0.25 + 0.35 * (0.5 + 0.5 * Math.sin(time * 2 + i))) * (Math.sin(a) > -0.2 ? 1 : 0.35);
      if (windW > 0.01) {
        const f = (motePhase[i * 3 + 2] + windT * (0.8 + motePhase[i * 3 + 1])) % 1;
        const wr = modelH * (0.28 + 0.4 * ((i * 0.618) % 1)) * s;
        // along the wind from below the body to beyond it, spread across it, round the
        // middle of the body
        const a = (f * 1.7 - 0.85) * modelH * s, c = Math.cos(motePhase[i * 3]) * wr;
        x += (a * dx + c * dy - x) * windW;
        yy += (BODY_C * modelH * s + a * dy - c * dx - yy) * windW;
        z += (Math.sin(motePhase[i * 3]) * wr * 0.6 - z) * windW;
        alpha += (0.55 * Math.sin(Math.PI * f) - alpha) * windW;
      }
      pPos[j * 3] = root.position.x + x;
      pPos[j * 3 + 1] = root.position.y + yy;
      pPos[j * 3 + 2] = root.position.z + z;
      pAlpha[j] = vis * alpha;
    }
  }

  // ---------------------------------------------------------------------------
  // Look-at: head and neck turn toward the pointer (or what matters in the section)
  // ---------------------------------------------------------------------------
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

  
  function aimHead(dt, now, level) {
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
      const a = Math.atan2(tgtW.x, tgtW.z);
      yaw = Math.abs(a) <= 1.05 ? a : Math.sign(a) * 1.05 * (1 - smooth(clamp01((Math.abs(a) - 1.05) / (Math.PI - 1.05))));
      pitch = clamp(-Math.atan2(tgtW.y, Math.hypot(tgtW.x, tgtW.z)), -0.5, 0.6);
    }
    // running or flying, it watches where it goes; cheering, it looks up at the card it
    // points to, then out at the visitor for the thumbs-up
    const runW = Math.max(runner.run, trans && trans.kind === 'enter' ? trans.sp : 0, level);
    yaw *= 1 - runW * 0.85;
    pitch *= 1 - runW * 0.6;
    // laid out level, chin up: it looks ahead, the way it flies
    if (jr.on) pitch -= 0.8 * clamp01((tilt.rotation.x - TILT.hover) / (TILT.fly - TILT.hover));
    const cw = cheerWeight();
    if (cw > 0) {
      yaw += (-at.yaw * 0.8 * cheer.mix - yaw) * cw;
      pitch += (-0.42 * (1 - cheer.mix) - pitch) * cw;
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
  function reach(arm, target, w, pole) {
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
    if (pole) kPole.copy(pole);
    else kPole.set(-0.35, -1, -0.45);
    kPole.addScaledVector(kDir, -kPole.dot(kDir)).normalize();
    kTo.copy(kS).addScaledVector(kDir, a * Math.cos(alpha)).addScaledVector(kPole, a * Math.sin(alpha));
    swing(upper, lower, kTo, w);
    kTo.copy(kS).addScaledVector(kDir, d);
    swing(lower, hand, kTo, w);
  }

  // ---------------------------------------------------------------------------
  // Rig poses: aims in model space, applied over whatever the clips did
  // ---------------------------------------------------------------------------
  //   pitch   upper body lean (+ forward)
  //   thigh   where the knee points from the hip; shin: where the ankle points
  //   kick    legs pedalling in the air;  flat: feet kept flat (else on the shins)
  //   up / back / scull / seat / push: where the hands go (weights; none = the clip's arms)
  //     up    raised and flailing, in the air
  //     back  swept back along the body: flying level, head first like a dart
  //     lead  of the arms swept back, one reaches out ahead instead (flying; see leadOf)
  //     scull out in front, paddling slowly, to hold itself at a portal
  //     seat  on the card beside the hips;  push: on the card in front, to get up
  // The time tunnels: hover (at a portal, legs paddling) and fly (level, legs trailing);
  // the lean that lays it level is the tilt (see setTilt), not part of the pose.
  const POSE = {
    air: { pitch: -0.1, thigh: [0.4, -0.62, 0.62], shin: [0.2, -0.6, -0.75], kick: 1, flat: 0, up: 1, back: 0, scull: 0, seat: 0, push: 0 },
    // caught in mid-air off the end of the last case: arms up, the legs just dangling
    hang: { pitch: -0.1, thigh: [0.4, -0.62, 0.62], shin: [0.2, -0.6, -0.75], kick: 0.2, flat: 0, up: 1, back: 0, scull: 0, seat: 0, push: 0 },
    hover: { pitch: 0.06, thigh: [0.16, -0.86, 0.42], shin: [0.08, -0.92, -0.3], kick: 0.45, flat: 0, up: 0, back: 0, scull: 1, seat: 0, push: 0 },
    fly: { pitch: -0.12, thigh: [0.1, -1, -0.12], shin: [0.07, -1, -0.22], kick: 0.3, flat: 0, up: 0, back: 1, lead: 1, scull: 0, seat: 0, push: 0 },
    seat: { pitch: -0.14, thigh: [0.17, -0.06, 1], shin: [0.13, -0.16, 1], kick: 0, flat: 0, up: 0, back: 0, scull: 0, seat: 1, push: 0 },
    crouch: { pitch: 0.32, thigh: [0.2, -0.5, 0.85], shin: [0.06, -0.92, -0.38], kick: 0, flat: 1, up: 0, back: 0, scull: 0, seat: 0.5, push: 0 },
    push: { pitch: 0.45, thigh: [0.22, -0.32, 0.92], shin: [0.06, -0.96, -0.28], kick: 0, flat: 1, up: 0, back: 0, scull: 0, seat: 0, push: 1 },
    // Opening a case (see stepStunt): standing tall, a springy crouch with the arms
    // swinging back, a hop with the knees tucked, the deep wind-up for the big one, the
    // knees pulled up at the top of it, and the legs stamped down for the landing.
    stand: { pitch: 0, thigh: [0.06, -1, 0.04], shin: [0.03, -1, -0.04], kick: 0, flat: 1, up: 0, back: 0, scull: 0, seat: 0, push: 0 },
    squat: { pitch: 0.3, thigh: [0.2, -0.5, 0.85], shin: [0.06, -0.92, -0.38], kick: 0, flat: 1, up: 0, back: 0.6, scull: 0, seat: 0, push: 0 },
    hopAir: { pitch: 0.04, thigh: [0.16, -0.78, 0.55], shin: [0.08, -0.9, -0.45], kick: 0, flat: 1, up: 0.5, back: 0, scull: 0, seat: 0, push: 0 },
    wind: { pitch: 0.45, thigh: [0.22, -0.4, 0.9], shin: [0.06, -0.94, -0.34], kick: 0, flat: 1, up: 0, back: 1, scull: 0, seat: 0, push: 0 },
    tuck: { pitch: 0.12, thigh: [0.2, -0.3, 0.95], shin: [0.08, -0.95, -0.3], kick: 0, flat: 1, up: 1, back: 0, scull: 0, seat: 0, push: 0 },
    stomp: { pitch: -0.05, thigh: [0.12, -1, 0.1], shin: [0.06, -1, -0.02], kick: 0, flat: 1, up: 1, back: 0, scull: 0, seat: 0, push: 0 },
  };
  const POSE_KEYS = ['pitch', 'kick', 'flat', 'up', 'back', 'lead', 'scull', 'seat', 'push'];
  function newPose() { return { pitch: 0, thigh: [0, -1, 0], shin: [0, -1, 0], kick: 0, flat: 0, up: 0, back: 0, lead: 0, scull: 0, seat: 0, push: 0 }; }
  function mixPose(out, a, b, k) {
    for (const key of POSE_KEYS) { const x = a[key] || 0; out[key] = x + ((b[key] || 0) - x) * k; }
    for (let j = 0; j < 3; j++) {
      out.thigh[j] = a.thigh[j] + (b.thigh[j] - a.thigh[j]) * k;
      out.shin[j] = a.shin[j] + (b.shin[j] - a.shin[j]) * k;
    }
    return out;
  }
  const vD = new THREE.Vector3(), vT = new THREE.Vector3(), vS = new THREE.Vector3(), vHip = new THREE.Vector3(), vPo = new THREE.Vector3();
  const mFoot = new THREE.Matrix4(), mInv = new THREE.Matrix4(), pF = new THREE.Vector3(), qF = new THREE.Quaternion(), sF = new THREE.Vector3(), qFlat = new THREE.Quaternion();
  function modelDir(x, y, z, out) { return out.set(x, y, z).normalize().transformDirection(model.matrixWorld); }
  // turn a bone about a world axis
  function turnBone(bone, axis, angle) {
    qSw.setFromAxisAngle(axis, angle);
    bone.parent.updateWorldMatrix(true, false);
    bone.parent.getWorldQuaternion(qParent);
    qSw.premultiply(qTmp.copy(qParent).invert()).multiply(qParent);
    bone.quaternion.premultiply(qSw);
    bone.updateMatrixWorld(true);
  }
  // the feet ride on the shins (and are kept flat on a floor), weighted
  function plantFeet(w, flat) {
    for (const leg of legs) {
      leg.lower.updateWorldMatrix(true, false);
      leg.foot.parent.updateWorldMatrix(true, false);
      mFoot.multiplyMatrices(leg.lower.matrixWorld, leg.rel).premultiply(mInv.copy(leg.foot.parent.matrixWorld).invert());
      mFoot.decompose(pF, qF, sF);
      if (flat > 0) {
        model.getWorldQuaternion(qFlat).multiply(leg.flatQ);
        leg.foot.parent.getWorldQuaternion(qTmp);
        qF.slerp(qFlat.premultiply(qTmp.invert()), flat);
      }
      leg.foot.position.lerp(pF, w);
      leg.foot.quaternion.slerp(qF, w);
      leg.foot.updateMatrixWorld(true);
    }
  }
  function applyPose(P, w) {
    if (w < 0.001) return;
    model.updateMatrixWorld(true);
    // the upper body leans (the legs are re-aimed below, so they don't lean with it)
    if (P.pitch) turnBone(rigBody, modelDir(1, 0, 0, vD), P.pitch * w);
    for (const leg of legs) {
      const s = leg.side;
      const kick = P.kick * Math.sin(time * 4.4 + (s > 0 ? 0 : Math.PI));
      leg.upper.getWorldPosition(vT).add(modelDir(P.thigh[0] * s, P.thigh[1], P.thigh[2] + 0.22 * kick, vD));
      swing(leg.upper, leg.lower, vT, w);
      leg.lower.getWorldPosition(vT).add(modelDir(P.shin[0] * s, P.shin[1], P.shin[2] + 0.3 * kick, vD));
      swing(leg.lower, leg.end, vT, w);
    }
    plantFeet(w, P.flat);
    // hands
    const sum = P.up + P.back + P.scull + P.seat + P.push;
    if (sum < 1e-3) return;
    const Hm = modelH;
    rigHips.getWorldPosition(vHip);
    model.worldToLocal(vHip);
    arms.forEach((arm, i) => {
      const s = armSide[i];
      arm[0].getWorldPosition(vS);
      model.worldToLocal(vS);
      vT.set(0, 0, 0);
      vPo.set(0, 0, 0);
      const fl = Math.sin(time * 5.2 + i * 2.4);
      const add = (k, x, y, z, px, py, pz) => { vT.x += k * x; vT.y += k * y; vT.z += k * z; vPo.x += k * px; vPo.y += k * py; vPo.z += k * pz; };
      if (P.up) add(P.up, vS.x + s * 0.16 * Hm, vS.y + (0.3 + 0.06 * fl) * Hm, vS.z + 0.06 * Hm, s, 0.15, -0.5);
      if (P.back) {
        // flying, one of them reaches out ahead instead: up past the shoulder in model
        // space, which laid level is the way it flies, and a little forward (down, laid
        // level) to clear the big head, the fist out in front under its chin
        const ld = P.lead ? P.lead * leadOf(s) : 0;
        if (ld < 1) add(P.back * (1 - ld), vS.x + s * (0.1 + 0.01 * fl) * Hm, vS.y - 0.34 * Hm, vS.z - 0.14 * Hm, s, 0.2, 1);
        if (ld > 0) add(P.back * ld, vS.x + s * 0.08 * Hm, vS.y + 0.55 * Hm, vS.z + (0.25 + 0.015 * fl) * Hm, s, 0, -1);
      }
      if (P.scull) {
        const sc = Math.sin(time * 2.6 + i * Math.PI);
        add(P.scull, vS.x + s * (0.18 + 0.05 * sc) * Hm, vS.y - (0.07 - 0.06 * sc) * Hm, vS.z + (0.2 + 0.04 * sc) * Hm, s, -0.6, -0.4);
      }
      if (P.seat) add(P.seat, vHip.x + s * 0.32 * Hm, vHip.y + 0.03 * Hm, vHip.z - 0.12 * Hm, s * 0.5, 0.1, -1);
      if (P.push) add(P.push, vHip.x + s * 0.24 * Hm, vHip.y - 0.14 * Hm, vHip.z + 0.2 * Hm, s, 0.1, -0.6);
      vT.divideScalar(sum);
      model.localToWorld(vT);
      reach(arm, vT, Math.min(1, sum) * w, vPo.lengthSq() > 1e-6 ? vPo.normalize().transformDirection(model.matrixWorld) : null);
    });
  }
  // the lowest point of the body down onto the floor (the anchor), weighted
  const vPin = new THREE.Vector3();
  function pinToFloor(w) {
    if (w < 0.001 || !floorPts.length) return;
    root.updateMatrixWorld(true);
    let low = Infinity;
    for (const [o, pt] of floorPts) low = Math.min(low, root.worldToLocal(vPin.copy(pt).applyMatrix4(o.matrixWorld)).y);
    pivot.position.y -= low * w;
    pivot.updateMatrixWorld(true);
  }
  function applyRig() {
    if (!rigOK || reduced || view.dock) return;
    if (dbg.pose && POSE[dbg.pose]) { applyPose(POSE[dbg.pose], 1); if (dbg.pose !== 'fly' && dbg.pose !== 'hover') pinToFloor(1); return; } // QA
    if (jr.on && jr.pose) {
      applyPose(jr.pose, jr.w);
      pinToFloor(jr.pin);
      if (jr.hop) { pivot.position.y += jr.hop; pivot.updateMatrixWorld(true); }
    }
    blendSnap();
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
    const on = !!(here && goal.grip && near && !trans && !scrub.mid && !oneShot && arms.length);
    // a pull asked for while it was arriving or waving: take hold quickly, then pull
    // (asked from afar, it pulls on arrival, as long as the field still has focus)
    if (tugAsked && (performance.now() - tugAsked > 6000 || !formFocused())) tugAsked = 0;
    grip.w += ((on ? 1 : 0) - grip.w) * (reduced ? 1 : damp(tugAsked && on ? 9 : 3.5, dt));
    if (tugAsked && on && grip.w > 0.3) { tug.v += 4.6; tugAsked = 0; sfx('card-tug'); }
    // The left arm is behind the card whenever the guide stands at it (holding it,
    // waving, dancing, or dissolving on the way out), never flipping sides mid-view:
    // whatever of that arm overlaps the card is hidden.
    // (not while it flies in or away: then the whole arm stays in view)
    const hopFlying = trans && trans.kind === 'hop' && trans.phase === 'travel';
    const atCard = card && !view.dock && (here
      ? goal && goal.grip && !hopFlying && (!jr.on || jr.air < 0.3)
      : trans && trans.from === 'contato' && (trans.phase === 'out' || (hopFlying && jr.air < 0.3)));
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

  // ---------------------------------------------------------------------------
  // Video cases: running along with the deck, and a cheer for every new card
  // ---------------------------------------------------------------------------
  // The deck position (in cards) straight from the scroll, as app.js computes it.
  const workSec = document.getElementById('projetos');
  function deckPos() {
    if (!workSec) return 0;
    const r = workSec.getBoundingClientRect();
    // (with the ledge, the last card holds a while before the stage lets go)
    const hold = ledgeMode() ? DECK_DWELL * window.innerHeight : 0;
    return clamp01(-r.top / Math.max(1, r.height - window.innerHeight - hold)) * Math.max(0, nodes.projects.length - 1);
  }
  function stepRunner(dt) {
    const here = section === 'projetos' && !view.dock && !reduced && !trans && !scrub.mid && !!nodes.deck;
    const f = deckPos();
    const v = runner.f < 0 ? 0 : (f - runner.f) / Math.max(dt, 1e-3);
    runner.f = f;
    runner.v += (v - runner.v) * damp(8, dt);
    const speed = Math.abs(runner.v);
    if (speed > 0.06) runner.dir = runner.v > 0 ? 1 : -1; // down the page: the cards go left, it runs right
    // it runs while the cards move, and stops a beat after they do
    if (!runner.on && speed > 0.22) runner.on = true;
    runner.still = runner.on && speed < 0.1 ? runner.still + dt : 0;
    if (runner.still > 0.35 || !here) runner.on = false;
    runner.run += ((runner.on ? 1 : 0) - runner.run) * damp(6, dt);
    // which way it faces: where it runs; half toward the viewer to cheer; else at them
    const cheering = cheer.t >= 0 && cheer.t < CHEER_END - 0.25;
    // (standing, it turns a touch to its right so the thumbs-up clears the big head)
    const yawT = runner.on ? runner.dir * (cheering ? 0.75 : 1.15) : cheering ? -0.35 : -0.1;
    runner.yaw += (yawT - runner.yaw) * damp(runner.on ? 7 : 4, dt);
    if (here) {
      const want = runner.on ? 'run' : 'idle';
      if (baseName !== want) {
        baseName = want;
        // a hello or a click reaction gives way to the run
        if (runner.on || !oneShot) fadeTo(want, runner.on ? 0.22 : 0.3);
      }
      // the stride keeps pace with the cards
      if (current === actions.run) actions.run.setEffectiveTimeScale(clamp(0.75 + speed * 0.55, 0.85, 1.9));
    } else if (baseName === 'run' && !(trans && trans.kind === 'enter') && !ledge.drove) {
      setBase((SECTIONS[section] || SECTIONS.inicio).base);
    }
    // a new card in the middle: point up at it, then a thumbs-up
    const idx = Math.round(f);
    if (here && runner.idx >= 0 && idx !== runner.idx) startCheer();
    runner.idx = here ? idx : -1;
  }

  // Heard (sound.js): where it is across the page (and whether behind a card), the rush
  // of a fast level flight going by, and each foot coming down on the cards as it runs.
  const heard = { x: NaN, y: 0, v: 0, fast: false, feet: [0, 1].map(() => ({ lo: Infinity, hi: -Infinity, up: false })) };
  function stepHeard(dt, left, strides) {
    const snd = window.abissalAudio;
    const on = !!(snd && snd.on && snd.place);
    if (on) snd.place(((left + at.x) / Math.max(1, window.innerWidth)) * 2 - 1, tun.hidden || maskHides);
    // its pace across the screen, in body heights a second (a cut from one place to
    // another is no flight)
    const d = Number.isNaN(heard.x) ? 0 : Math.hypot(at.x - heard.x, at.y - heard.y) / Math.max(at.h, 1);
    heard.x = at.x;
    heard.y = at.y;
    const v = d / Math.max(dt, 1e-3);
    heard.v += ((v > 30 ? 0 : v) - heard.v) * damp(9, dt);
    const level = jr.on && jr.fly > 0.5 && shared.uDissolve.value < 0.5;
    if (!heard.fast && level && heard.v > 2.4) {
      heard.fast = true;
      sfx('fly-by');
    } else if (heard.fast && (!level || heard.v < 1.2)) heard.fast = false;
    // a step: a foot that was up in its stride, down again (its own low point, within
    // the range it has moved through on this run)
    for (let i = 0; i < 2; i++) {
      const F = heard.feet[i], y = footLow[i];
      if (!strides || !Number.isFinite(y)) {
        F.lo = Infinity;
        F.hi = -Infinity;
        F.up = false;
        continue;
      }
      F.lo = Math.min(F.lo, y);
      F.hi = Math.max(F.hi, y);
      const r = F.hi - F.lo;
      if (r < modelH * 0.02) continue; // (no stride seen yet)
      const k = (y - F.lo) / r;
      if (F.up && k < 0.12) {
        F.up = false;
        sfx('footstep');
      } else if (!F.up && k > 0.55) F.up = true;
    }
  }

  // The cheer: the right arm goes up with the index pointing, holds, comes down to a
  // thumbs-up and lets go. Another new card while it cheers sends the arm back up,
  // so a fast scroll through the deck ends on a single thumbs-up.
  const CHEER_END = 2.1;
  const cheer = { t: -1, mix: 0, w: 0 };
  const qPose = new THREE.Quaternion();
  function startCheer() {
    if (reduced || !cheerBones.length) return;
    if (cheer.t < 0) { cheer.t = 0; cheer.mix = 0; sfx('cheer'); } // (heard once, however many cards go by)
    else cheer.t = Math.min(cheer.t, 0.4);
    setFace('surprised', 0.8);
  }
  function cheerWeight() {
    return cheer.t < 0 ? 0 : cheer.w;
  }
  function applyCheer(dt) {
    if (cheer.t < 0) return;
    cheer.t += dt;
    // Eased, never cut: jumping off (or a new card halfway down) moves the arm
    // there, it doesn't snap.
    const away = section !== 'projetos' || !!trans || scrub.mid;
    const shape = smooth(clamp01(cheer.t / 0.28)) * (1 - smooth(clamp01((cheer.t - 1.75) / 0.3)));
    const target = away || cheer.t >= CHEER_END ? 0 : shape;
    cheer.w += (target - cheer.w) * damp(away ? 9 : 16, dt);
    if (target === 0 && cheer.w < 0.01) { cheer.t = -1; cheer.w = 0; return; }
    if (!away) cheer.mix += (smooth(clamp01((cheer.t - 0.85) / 0.27)) - cheer.mix) * damp(14, dt);
    for (const c of cheerBones) {
      qPose.copy(c.point).slerp(c.up, cheer.mix);
      c.bone.quaternion.slerp(qPose, cheer.w);
    }
  }

  // ---------------------------------------------------------------------------
  // Opening a case: a rocket launch, shot like a film. The jetpack sputters into life on
  // the card (the card bowing under the thrust) and it lifts off, up and toward us,
  // turning its back to us; then it flies out to the side and on, away from us, round in
  // front of the card and straight at the poster, on a path drawn afresh each time (which
  // side, how wide, how high and how near, whether it crosses in front of the card
  // first). The path is a curve in depth as well as across, and it faces the way it flies
  // (its back more or less to us throughout), leaning and banking with the turns. It hits
  // the poster with its whole weight: light bursts out, the card gives, and the case opens
  // in that same beat (caseJump's promise resolves true: app.js slides the deck away the
  // way it was shoved and grows the poster into the video), while it is thrown back off
  // the poster and blasts away off the top of the screen, in plain sight the whole way
  // (the stage stays up until it is gone: see is-exit). Closed again, it flies back in
  // from where it went and sets down on the card.
  // ---------------------------------------------------------------------------
  // The show as a timeline, in seconds: the ignition, the flight round to the front of
  // the card and into it, and the way out off the screen.
  const FLY = { t0: 0.42, cross: 1.55, out: 0.6 }; // lift-off; into the poster (seconds after lift-off); off the screen, after that
  const STUNT = (() => {
    const segs = [];
    let t = 0;
    const add = (kind, d) => { segs.push({ kind, t0: t, d }); t += d; };
    add('ignite', FLY.t0); add('fly', FLY.cross); add('exit', FLY.out);
    return { segs, end: t, dip: 0.012, trail: 0.9 }; // the card's bow (card heights); the trail it leaves dying out up there (s)
  })();
  // A flight through timed keys, [seconds, x, y, size] in screen terms, as three curves
  // in the world: X and Y, its offset from the poster's middle at the card's distance,
  // and q, the log of its distance (0 at the card; its size is e^-q). Each is a monotone
  // cubic (Fritsch-Carlson): smooth, never overshooting a key (so it stays where the keys
  // keep it, and only ever goes one way in depth between them), from rest at the first.
  function flightPath(keys, mx, my) {
    const T = keys.map((k) => k[0]), n = T.length;
    const ch = [keys.map((k) => (k[1] - mx) / k[3]), keys.map((k) => (k[2] - my) / k[3]), keys.map((k) => -Math.log(k[3]))];
    const tan = ch.map((V) => {
      const d = [];
      for (let i = 0; i < n - 1; i++) d.push((V[i + 1] - V[i]) / (T[i + 1] - T[i]));
      const M = new Array(n).fill(0);
      for (let i = 1; i < n - 1; i++) {
        if (d[i - 1] * d[i] <= 0) continue; // (a turning point: flat there)
        const cr = (V[i + 1] - V[i - 1]) / (T[i + 1] - T[i - 1]);
        M[i] = Math.sign(cr) * Math.min(Math.abs(cr), 3 * Math.abs(d[i - 1]), 3 * Math.abs(d[i]));
      }
      M[n - 1] = d[n - 2];
      return M;
    });
    return { T, ch, tan, end: T[n - 1] };
  }
  function pathAt(P, t, out) {
    const T = P.T;
    t = clamp(t, 0, P.end);
    let i = 0;
    while (i < T.length - 2 && t > T[i + 1]) i++;
    const d = T[i + 1] - T[i], w = (t - T[i]) / d, w2 = w * w, w3 = w2 * w;
    const a = 2 * w3 - 3 * w2 + 1, b = (w3 - 2 * w2 + w) * d, c = 3 * w2 - 2 * w3, e = (w3 - w2) * d;
    for (let k = 0; k < 3; k++) out[k] = a * P.ch[k][i] + b * P.tan[k][i] + c * P.ch[k][i + 1] + e * P.tan[k][i + 1];
    return out;
  }
  // its velocity in the world, in pixels a second: across, down, and away from us (D: how
  // far the camera is from the card)
  const fP = [0, 0, 0], fA = [0, 0, 0], fB = [0, 0, 0], fV = [0, 0, 0];
  function flightVel(P, t, D, out) {
    const e = 0.008;
    pathAt(P, t - e, fA);
    pathAt(P, t + e, fB);
    out[0] = (fB[0] - fA[0]) / (2 * e);
    out[1] = (fB[1] - fA[1]) / (2 * e);
    out[2] = (D * Math.exp((fA[2] + fB[2]) / 2) * (fB[2] - fA[2])) / (2 * e);
    return out;
  }
  // The card's give, on its own translate (it composes with the deck's transform): a
  // stiff, bouncy spring under the hops, or driven straight as it falls away.
  const sink = { card: null, px: 0, v: 0, target: 0, drive: false };
  let seatLift = 0; // how high off the card it is, in body heights (the shadow shrinks)
  function holdCard(card) {
    if (sink.card && sink.card !== card) sink.card.style.translate = '';
    if (sink.card !== card) { sink.card = card; sink.px = sink.v = 0; }
  }
  function stepSink(dt) {
    if (!sink.card) return;
    if (!sink.drive) {
      const h = Math.min(dt, 1 / 60);
      for (let n = dt; n > 1e-6; n -= h) {
        const st = Math.min(h, n);
        sink.v += ((sink.target - sink.px) * 900 - sink.v * 21) * st;
        sink.px += sink.v * st;
      }
    }
    const rest = !sink.drive && sink.target === 0 && Math.abs(sink.px) < 0.1 && Math.abs(sink.v) < 2;
    sink.card.style.translate = rest ? '' : `0 ${sink.px.toFixed(2)}px`;
    if (rest) { sink.card = null; sink.px = sink.v = 0; }
  }
  function caseJump(node) {
    if (reduced || view.dock || !rigOK || trans || scrub.mid || jumping || section !== 'projetos' || shared.uDissolve.value > 0.01) return null;
    const F = anchorFor('projetos', true);
    if (!F.floor || F.floor.node !== node) return null;
    const card = node.querySelector('.project-card') || node;
    holdCard(card);
    sink.drive = false;
    sink.target = 0;
    // a hello or a click reaction gives way to the show
    if (oneShot) { oneShot = false; fadeTo(baseName, 0.2); }
    snapRig();
    trans = { kind: 'case', t: 0, node, card, media: card.querySelector('.project-media') || card, sy: window.scrollY, hit: false, giveFrom: 0, opened: false, done: null, rnd: Array.from({ length: 8 }, Math.random) };
    markInput(); // full frame rate for the show
    return new Promise((res) => { trans.done = res; });
  }
  // (a second click: open now, wherever the show has got to)
  function caseNow() {
    if (!trans || trans.kind !== 'case' || trans.opened) return;
    trans.opened = true;
    const f = trans.done;
    trans.done = null;
    if (f) f(true);
  }
  function endStunt(open) {
    if (!trans || trans.kind !== 'case') return;
    const S = trans;
    at.yaw = -0.12 + wrapPi(at.yaw + 0.12); // (it flies off facing ±π: unwound, or the springs after it settle a whole turn off)
    snapRig(); // (cut short in mid-air, it comes down to the card instead of jumping there)
    trans = null;
    retDir = S.dir || retDir;
    canvas.classList.remove('is-exit');
    sink.drive = false;
    sink.target = 0;
    seatLift = 0;
    if (S.done) { const f = S.done; S.done = null; f(!!open); }
  }
  // A show in progress gives way to a journey (or to the dock): the case still opens if
  // asked to and still in front.
  function endShow(open) {
    if (!trans) return;
    if (trans.kind === 'case') endStunt(open && section === 'projetos' && trans.node.classList.contains('is-active'));

  }
  // (a case is open until its scene is gone, not only closing)
  function sceneOpen() {
    return doc.classList.contains('is-detail') || !!document.querySelector('dialog.scene[open]');
  }
  function stepStunt(dt) {
    const S = trans;
    const F = anchorFor('projetos', true);
    const open = sceneOpen();
    // Opened before it got there (a second click on the way): the scene covers it now, so
    // the show ends out of sight (it comes back when the case closes).
    if (S.opened && !S.burst && open) {
      const node = S.node;
      sink.px = sink.v = 0;
      endStunt(false);
      popFrom = node;
      return;
    }
    // Off the screen with the case open, once the trail it left up there has died out (it
    // flies back in when the case closes); or the case didn't open after all, or is closed
    // again already: the show is over, and it comes straight back. (Closed while it is
    // still flying out, it flies on out first: taken back from there it would be gone
    // from mid-air.)
    if (S.opened && S.t >= STUNT.end + (open ? STUNT.trail : 0)) {
      const node = S.node;
      sink.px = sink.v = 0;
      endStunt(false);
      if (open) popFrom = node; // (it comes back when the case closes)
      else startReturn(node);
      return;
    }
    // Anything else first (a scroll, the deck moving on, another section) ends it early:
    // the case still opens straight away if it is still the one in front.
    if (!S.opened && (section !== 'projetos' || !F.floor || F.floor.node !== S.node || Math.abs(window.scrollY - S.sy) > 24)) {
      endStunt(section === 'projetos' && S.node.classList.contains('is-active'));
      return;
    }
    const t = Math.min(S.t, STUNT.end);
    let seg = STUNT.segs[STUNT.segs.length - 1];
    for (const s of STUNT.segs) if (t < s.t0 + s.d) { seg = s; break; }
    const u = clamp01((t - seg.t0) / seg.d);
    const cardH = S.card.offsetHeight;
    const P = jr.pose || (jr.pose = newPose());
    // (the poster as it was at the start: the card bows under the thrust, and opening,
    // the page moves under the case)
    const m = S.m0 || (S.m0 = S.media.getBoundingClientRect());
    const [mx, my] = clientToCanvas(m.left + m.width / 2, m.top + m.height / 2);
    const h = S.h0 || (S.h0 = F.h);
    // The flight, drawn from this show's dice the first time round and kept on the
    // screen: off the pad, up and toward us, turning its back on the way; out to one side
    // and on, further from us all the time; round in front of the card (or across it
    // first); and on into the poster, through it at FLY.cross and away into the picture.
    // Keys are [seconds from lift-off, x, y, size] (its middle; the size is one over its
    // distance), joined in depth as well as across (flightPath).
    if (!S.path) {
      const R = S.rnd;
      const room = (d) => (d < 0 ? mx : view.w - mx) / h;
      const dir = room(1) > 1.6 && room(-1) > 1.6 ? (R[0] < 0.5 ? -1 : 1) : room(1) > room(-1) ? 1 : -1;
      // (kept below the top bar, all but the lift-off: that rises from the card even
      // where there is little room above it, over the bar if need be, its head on screen)
      const fit = (x, y, sz, over = false) => [clamp(x, sz * h * 0.45 + 12, view.w - sz * h * 0.45 - 12), clamp(y, over ? sz * h * (1 - BODY_C) + 6 : barBottom + sz * h * 0.6, view.h - sz * h * 0.55)];
      const s1 = 1.3 + R[3] * 0.15, s2 = s1 - 0.06 - R[6] * 0.06;
      const c0 = F.y - h * BODY_C;
      const A = fit(F.x + dir * h * 0.2, c0 - h * 0.45, s1, true);
      const B = fit(mx + dir * h * Math.min(1.4 + R[1] * 1.0, room(dir) - 0.7), c0 + h * (R[2] * 0.6 - 0.1), s2);
      const across = R[4] < 0.4; // (round in front of the card to its other side first)
      const C = fit(mx + dir * h * (across ? -(0.6 + R[5] * 0.6) : 0.45 + R[5] * 0.5), my + h * (0.15 + R[7] * 0.5), 1.18);
      const X = FLY.cross;
      S.dir = dir;
      S.push = Math.sign(mx - C[0]) || -dir; // (the way it comes into the poster: the deck is shoved on that way)
      S.path = flightPath([
        [0, F.x, c0, 1],
        [0.38, A[0], A[1], s1],
        [0.8, B[0], B[1], s2],
        [1.18, C[0], C[1], 1.18],
        [X - 0.13, mx + (C[0] - mx) * 0.3, my + h * 0.08, 1.07],
        [X, mx, my, 1],
        [X + 0.14, mx + dir * h * 0.3, my - h * 0.3, 1.14], // (thrown back off the poster, toward us)
        [X + FLY.out, mx + dir * h * 1.3, -h * 1.1, 1.4], // (and away off the top, on the side it came round)
      ], mx, my);
    }
    let cx = F.x, cy = F.y - h * BODY_C, size = h, yaw = -0.12, tiltA = 0, spin = 0, bank = 0, thrust = 0, hit = false;
    sink.drive = false;
    sink.target = 0;
    jr.squash = 0;
    if (seg.kind === 'ignite') { // crouched, the jets coughing into life, the card bowing under the thrust
      const sq = smooth(clamp01(u / 0.5));
      mixPose(P, POSE.stand, POSE.squat, sq);
      jr.squash = 0.08 * sq;
      thrust = (0.25 + 0.6 * u) * (u < 0.7 ? 0.55 + 0.45 * Math.abs(Math.sin(time * 31) * Math.sin(time * 17)) : 1);
      sink.target = STUNT.dip * 2.4 * cardH * sq;
      cx = F.x + h * 0.012 * Math.sin(time * 70) * u; // shaking on the pad
      cy += sink.px;
      if (Math.random() < u * 0.9) { // smoke rolling off the card
        root.updateMatrixWorld(true);
        const c = new THREE.Vector3(0, 0, 0).applyMatrix4(root.matrixWorld);
        const H = h * view.wpp, a = Math.random() * TAU, sp = H * (0.3 + Math.random() * 0.5);
        spawn(c.x, c.y + H * 0.03, c.z, Math.cos(a) * sp, H * (0.04 + Math.random() * 0.1), Math.sin(a) * sp * 0.4, 0.6 + Math.random() * 0.6, 0.45);
      }
    } else { // in flight
      if (!S.hit) { S.hit = true; touchdown('feet'); sfx('jet-burst'); } // (the blast kicks up the dust)
      const f = t - FLY.t0;
      const p = pathAt(S.path, f, fP);
      const s = Math.exp(-p[2]);
      cx = mx + p[0] * s;
      cy = my + p[1] * s;
      size = h * s;
      // It faces the way it flies, but always with its back more or less to us; it leans
      // into the flight (more in a dive, less climbing) and banks into its turns. Lifting
      // off it turns from us to that, upright.
      // (both through a stiff spring, so that a sharp turn on the curve is a swing)
      const D = view.h / (2 * Math.tan(THREE.MathUtils.degToRad(FOV / 2))); // (how far the camera is, in pixels at the card)
      const v = flightVel(S.path, f, D, fV);
      const lift = smooth(clamp01(f / 0.4));
      const off = Math.atan2(-v[0], Math.max(v[2], Math.abs(v[0])) + 1e-3); // (from straight away from us: 45° at most)
      const aim = -0.12 + (S.dir * Math.PI + off + 0.12) * lift;
      const elev = Math.atan2(-v[1], Math.hypot(v[0], v[2]));
      const brace = 0.3 * smooth(clamp01((f - FLY.cross + 0.25) / 0.25)) * (1 - smooth(clamp01((f - FLY.cross) / 0.2))); // (head down into the hit)
      const pitch = 0.1 + (clamp(0.8 - elev * 0.55, 0.3, 1.2) + brace - 0.1) * lift;
      const A = S.aim || (S.aim = { yaw: -0.12 + wrapPi(at.yaw + 0.12), yv: 0, tilt: 0.1, tv: 0 }); // (whatever turns it has made before)
      for (let n = dt; n > 1e-6; n -= 1 / 120) {
        const st = Math.min(n, 1 / 120);
        A.yv += (144 * (aim - A.yaw) - 24 * A.yv) * st;
        A.yaw += A.yv * st;
        A.tv += (100 * (pitch - A.tilt) - 20 * A.tv) * st;
        A.tilt += A.tv * st;
      }
      yaw = A.yaw;
      tiltA = A.tilt;
      const roll = clamp(-A.yv * 0.2, -0.45, 0.45); // (into the turn: a roll about its length when it flies flat, a lean when upright)
      spin = roll * Math.sin(tiltA);
      bank = roll * Math.cos(tiltA);
      const gone = smooth(clamp01((f - FLY.cross) / 0.25));
      mixPose(P, POSE.hover, POSE.fly, smooth(clamp01((f - 0.12) / 0.4)) * (1 - 0.5 * gone)); // (arms out, braced, as it hits)
      thrust = S.t < STUNT.end ? 1 + 0.4 * smooth(clamp01((f - FLY.cross + 0.15) / 0.3)) : 0; // (full burn into the hit and away; off the screen, cut)
      jr.squash = -0.08 * Math.sin(Math.PI * clamp01(f / 0.18)) + 0.1 * Math.sin(Math.PI * clamp01((f - FLY.cross) / 0.16)); // (flattened by the hit)
      if (f >= FLY.cross) sink.target = STUNT.dip * 6 * cardH * (1 - smooth(clamp01((f - FLY.cross) / 0.3))); // (the poster takes the blow)
      hit = f >= FLY.cross;
    }
    holdCard(S.card); // (the spring lets go of a card at rest: in the air, say)
    stepSink(dt);
    // The hit: light bursts out of the poster, the deck is shoved the way it came, and
    // the case opens, all in the same beat; the stage stays up while it flies out.
    if (hit && !S.burst) {
      S.burst = true;
      sfx('stunt-impact');
      const o = toWorld(mx, my, 0, new THREE.Vector3());
      const H = h * view.wpp, R = Math.min(m.width, m.height) * 0.5 * view.wpp;
      for (let n = 0; n < 70; n++) {
        const a = (n / 70) * TAU + Math.random() * 0.2, sp = H * (0.9 + Math.random() * 0.9);
        spawn(o.x + Math.cos(a) * R * 0.35, o.y + Math.sin(a) * R * 0.35, o.z, Math.cos(a) * sp, Math.sin(a) * sp, (Math.random() - 0.3) * H * 0.4, 0.45 + Math.random() * 0.4, 0.7);
      }
      setFace('surprised', 0.8);
      if (!S.opened) {
        doc.style.setProperty('--guide-push', `${S.push * 14}vw`);
        canvas.classList.add('is-exit');
        S.opened = true;
        const f = S.done;
        S.done = null;
        if (f) f(true);
      }
    }
    at.x = cx;
    at.y = cy + size * BODY_C; // (its feet: what the root is placed by)
    at.h = size;
    at.yaw = seg.kind === 'ignite' ? at.yaw + wrapPi(-0.12 - at.yaw) * damp(5, dt) : yaw;
    snapAt();
    vel.x = vel.y = 0;
    jr.on = true;
    jr.w = smooth(clamp01(S.t / 0.12)); // (the pose eases in over the clips)
    jr.pin = seg.kind === 'ignite' ? 1 : 0;
    jr.air = seg.kind === 'fly' ? 0.5 : 0;
    jr.tilt = tiltA;
    jr.spin = spin;
    jr.bank = bank;
    jr.fly = 0;
    jr.pitch = 0;
    jr.hop = 0;
    jr.jet = thrust;
    jr.floor = seg.kind === 'ignite' ? F.floor : null;
    seatLift = 0;
    // it eyes the poster on the pad, and where it flies after that
    [glance.x, glance.y] = seg.kind === 'ignite' ? [mx, my] : [cx + Math.sin(yaw) * h * 3, cy];
    glance.until = performance.now() + 150;
  }

  // Closed again (see update): it flies back in from off the top of the screen, on the
  // side it left by, and sets down on the card on its jets (a journey, like any other).
  let popFrom = null, wasDetail = false, retDir = 1;
  function startReturn(node) {
    const F = anchorFor('projetos', true);
    if (reduced || view.dock || !rigOK || trans || scrub.mid || section !== 'projetos' || !F.floor || F.floor.node !== node) return;
    const h = F.h;
    Object.assign(at, { x: clamp(F.x + retDir * h * 1.3, h * 0.6, view.w - h * 0.6), y: -h * 0.6, h, yaw: -retDir * 0.9 });
    vel.x = vel.y = 0;
    snap.t = snap.k = 1; // (from there, not blended from wherever the body was)
    placeRoot();
    hopTo('projetos', 'projetos', 'hover');
  }

  function updateSeatMark() {
    // standing on a video card, or landed on one at the end of a journey
    const floor = jr.on ? jr.floor : goal && goal.floor;
    const on = !!floor && (jr.on || (section === 'projetos' && !trans && !scrub.mid)) && shared.uDissolve.value < 0.2;
    const host = floor ? floor.node.querySelector('.project-card') || floor.node : null;
    if (host && host !== seatHost) {
      seatHost = host;
      seatHost.appendChild(seatMark);
    }
    if (on) {
      // the card's edge lights up under its feet, a little tighter while it runs
      seatMark.style.setProperty('--u', `${(floor.u * 100).toFixed(2)}%`);
      seatMark.style.setProperty('--w', `${(at.h * (1.1 - 0.2 * runner.run)).toFixed(0)}px`);
      seatMark.style.setProperty('--lift', (jr.on ? Math.min(1, seatLift) : 0).toFixed(3));
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
        // a new card in front: a nod (flying through the tunnels, the flight says it all)
        if (focusKey && !scrub.mid && !tunnelOn()) react('yes');
        focusKey = item;
      }
      focusTarget = item;
    } else if (section === 'projetos') {
      // standing on the cards: it looks out at the visitor (cheers are the runner's)
      focusTarget = null;
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
          if (SECTIONS[id] && id !== section && !scrubbing() && !jumping) {
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

  // The sound switch (sound.js): the headphones follow it. Where the page has no sound
  // to offer (html without .snd) there is no switch, and so no headphones.
  const soundNow = () => (doc.classList.contains('snd') && window.abissalAudio ? window.abissalAudio.state : null);
  document.addEventListener('abissal:sound', () => soundState(soundNow()));

  window.addEventListener('pointermove', (e) => {
    if (e.pointerType === 'touch') return;
    pointer.x = e.clientX; pointer.y = e.clientY; pointer.has = true; pointer.at = performance.now();
    markInput();
  }, { passive: true });

  window.addEventListener('scroll', () => {
    const y = window.scrollY;
    if (y !== scrub.lastY) scrub.dir = y > scrub.lastY ? 1 : -1;
    scrub.lastY = y;
    scrub.scrolledAt = performance.now();
    markInput();
  }, { passive: true });
  // Menu links smooth-scroll across sections: one direct journey to the destination
  // instead of passing through every section on the way.
  document.addEventListener('click', (e) => {
    const a = e.target.closest && e.target.closest('a[href^="#"]');
    const id = a ? a.getAttribute('href').slice(1) : '';
    // (any menu link stops a case show, without opening it: even the one to this section)
    if (a && trans && trans.kind === 'case') endStunt(false);
    // (a link to the section it is in scrolls within reach: the scrub handles that)
    if (!SECTIONS[id] || reduced || view.dock || id === section) return;
    jumping = true;
    scrub.leap = false;
    scrub.scrolledAt = performance.now();
    travelTo(id);
    scrub.on = false;
  }, true);

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
  function pullCard() {
    if (grip.w > 0.3) { tug.v += 4.6; sfx('card-tug'); return; }
    // not holding it yet: still arriving, or waving hello. Cut the wave short so the
    // hands go to the card now, and pull as soon as they are on it.
    tugAsked = performance.now();
    if (section === 'contato' && oneShot && !sending()) { oneShot = false; fadeTo(baseName, 0.3); }
  }

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
    // entering a field, the first one included: it pulls the card it holds, as if
    // it moved the cursor there itself
    let lastField = null;
    form.addEventListener('focusin', (e) => {
      const field = e.target.matches('input, textarea') ? e.target : null;
      if (!reduced && field && field !== lastField) pullCard();
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

  let floatW = 1;
  function update(dt, now) {
    time += dt;
    shared.uTime.value = time;
    const wasOn = jr.on;
    jr.on = false; // a journey (or the tunnels) claims the frame again below
    jr.jet = 0;
    jr.spin = jr.bank = 0;
    jr.tun = false;
    tun.drove = false;
    head.along = NaN;
    head.lo = 0;
    head.hi = 1;
    head.face = NaN;
    if (!ledge.drove) ledge.lastP = -1;
    ledge.was = ledge.drove;
    ledge.drove = false;
    if (snap.t < 1) { snap.t = Math.min(1, snap.t + dt / 0.28); snap.k = smooth(snap.t); }

    // scroll velocity -> lean (the guide is dragged by the current)
    const sy = window.scrollY;
    const v = (sy - scrollY) / Math.max(dt, 1e-3);
    scrollD = sy - scrollY;
    scrollY = sy;
    scrollV += (v - scrollV) * damp(4, dt);
    scrollPace(now, scrollD);
    const leanT = reduced ? 0 : clamp(scrollV / 2600, -1, 1);
    lean += (leanT - lean) * damp(2.4, dt);

    pollSection(now);
    stepScrub(dt, now);
    stepRunner(dt);

    if (!trans && !jr.on && tunnelOn()) stepTunnel(dt, now);
    if (!trans && !jr.on) {
      goal = anchorFor(section);
      if (reduced) {
        snapTo(goal);
      } else {
        // A soft spring with a little overshoot: it drifts to its spot and settles,
        // instead of sliding on rails. On the cards it keeps its feet on the edge.
        const stiff = goal.floor ? 170 : 11;
        const dampC = 2 * Math.sqrt(stiff) * (goal.floor ? 1 : 0.72);
        const h = Math.min(dt, 1 / 30);
        // At the contact card it goes no further than the spot where it holds the card.
        // A fast scroll carries the card up while the spring trails it, and on a tall
        // screen that left it well below the card (then overshooting on the way back).
        // So it never sinks below that spot (the card's corner takes it along) and,
        // reaching it from anywhere, it stops there instead of sailing past.
        const noPass = section === 'contato';
        for (let n = dt; n > 1e-6; n -= h) {
          const st = Math.min(h, n);
          const dx = goal.x - at.x, dy = goal.y - at.y;
          vel.x += (dx * stiff - vel.x * dampC) * st;
          vel.y += (dy * stiff - vel.y * dampC) * st;
          at.x += vel.x * st;
          at.y += vel.y * st;
          if (noPass) {
            if (dx * (goal.x - at.x) <= 0) { at.x = goal.x; vel.x = 0; }
            if (dy * (goal.y - at.y) <= 0 || at.y > goal.y) { at.y = goal.y; vel.y = 0; }
          }
        }
        if (goal.floor) {
          at.y = goal.y;
          vel.y = 0;
          snapAt(); // (a show cut short in mid-air comes down to it, not in one frame)
        }
        const k = damp(2.6, dt);
        at.h += (goal.h - at.h) * k;
        at.yaw += wrapPi(goal.yaw - at.yaw) * k;
      }
    }
    // a case it opened was closed again (the scene gone, not only closing): it flies back
    // down onto the card
    const detail = sceneOpen();
    if (wasDetail && !detail && popFrom) startReturn(popFrom);
    if (!detail) popFrom = null;
    wasDetail = detail;
    stepTransit(dt);
    if (!(trans && trans.kind === 'case')) stepSink(dt); // (the card it dented springs back)
    // (off the tunnels: portals and wake at rest, nothing behind the cards)
    if (tun.active && !tun.drove) leaveTunnel();
    tun.active = tun.drove;
    // A journey just handed back (lean, drift and the float return, the pin lets go):
    // blend from its last frame instead of jumping.
    if (wasOn && !jr.on && !reduced && !view.dock) snapRig();
    placeRoot();
    stepHeading(dt);

    // float, lean, turn toward what it looks at
    const cfg = SECTIONS[section] || SECTIONS.inicio;
    const floating = !reduced && (cfg.float || (section === 'inicio' && (view.dock || !rigOK))); // (the hero's stand is for the landing)
    // (the float eases out for a journey and back in after it; at a portal it bobs,
    // flying level it doesn't)
    const floatT = floating && (!jr.on || jr.tun) && !(trans && (trans.kind === 'hop' || trans.kind === 'enter')) ? (jr.tun ? 1 - jr.fly : 1) : 0;
    floatW += (floatT - floatW) * (reduced ? 1 : damp(2.2, dt));
    // the scroll drives a journey, so no lean or drift into it
    const calm = jr.on ? 0 : 1;
    // airborne: buffeted by the fall (and a little, flying through the tunnels)
    const air = jr.on ? jr.air : 0;
    // flying level: how much (the wind of it streams back past the body)
    const level = jr.on ? clamp01(jr.tilt / TILT.fly) : 0;
    // Adrift: layered slow sines (never quite repeating), a body that trails its own
    // motion like something pushed through water, and the scroll current on top.
    const hpx = Math.max(at.h, 1);
    const driftX = clamp(vel.x / (hpx * 3.2), -0.32, 0.32);
    const driftY = clamp(vel.y / (hpx * 4.5), -0.25, 0.25);
    const fw = floatW;
    pivot.position.set(
      fw * modelH * (0.035 * Math.sin(time * 0.37) + 0.018 * Math.sin(time * 0.83 + 1.3)) + air * modelH * 0.03 * Math.sin(time * 1.9),
      fw * (modelH * (0.04 + 0.028 * Math.sin(time * 1.05) + 0.016 * Math.sin(time * 0.47 + 2.1)) - lean * modelH * 0.06) + air * modelH * 0.025 * Math.sin(time * 2.7 + 1),
      fw * modelH * 0.03 * Math.sin(time * 0.29 + 0.7));
    // a little hop of excitement as it points up (standing; running it is in the air anyway)
    if (!floating && cheer.t >= 0 && cheer.t < 0.34) pivot.position.y += modelH * 0.07 * Math.sin((Math.PI * cheer.t) / 0.34) * (1 - runner.run) * Math.min(1, cheer.w * 2);
    const onFloor = goal && goal.floor;
    pivot.rotation.z = fw * (0.045 * Math.sin(time * 0.61) + 0.025 * Math.sin(time * 1.13 + 0.4))
      + calm * (floating ? driftX : onFloor ? 0 : driftX * 0.5)
      + air * (0.07 * Math.sin(time * 2.3) + 0.03 * Math.sin(time * 5.1 + 0.6))
      + tug.x * 0.25 * grip.w; // leans back with the jolt on the card
    // (on the cards the scroll moves the deck, not the guide: no lean into the current)
    pivot.rotation.x = calm * (onFloor ? 0 : lean * 0.3 + driftY) + fw * 0.03 * Math.sin(time * 0.53 + 1.7)
      + air * (0.05 + 0.04 * Math.sin(time * 1.6)) + (jr.on ? jr.pitch : 0);
    pivot.rotation.y = at.yaw * (1 - 2 * head.m) + look.yaw * 0.35 + fw * 0.06 * Math.sin(time * 0.31);
    if (dbg.yaw != null) pivot.rotation.y = dbg.yaw;
    const sq = jr.on ? jr.squash : 0;
    pivot.scale.set(1 + sq * 0.5, 1 - sq, 1 + sq * 0.5);
    // (turning round in flight, it rises out of the level flight and lies down again)
    setTilt(jr.on ? jr.tilt - Math.max(0, jr.tilt - TILT.hover) * 0.85 * Math.sin(Math.PI * head.m) : 0, jr.on ? jr.spin : 0, jr.on ? jr.bank : 0);

    // Bones the current clip doesn't animate keep last frame's offsets: undo them first.
    for (const r of restPose) { r.bone.quaternion.copy(r.q); r.bone.position.copy(r.p); }
    if (!reduced) mixer.update(dt);
    else if (!mixer.time) mixer.update(0.5);
    for (const r of restPose) { r.q.copy(r.bone.quaternion); r.p.copy(r.bone.position); }
    model.updateMatrixWorld(true);
    applyRig();
    // The Running clip bounds high: keep most of each stride down on the card.
    const wRun = actions.run && actions.run.isRunning() ? actions.run.getEffectiveWeight() : 0;
    const stride = !jr.on && wRun > 0.01 && soles.length > 0;
    const ledgeRun = ledge.drove && wRun > 0.01 && soles.length > 0; // (the run to the end of the last card)
    if (stride) {
      pivot.position.y -= (soleY() - footRest) * 0.75 * wRun;
      pivot.updateMatrixWorld(true);
    } else if (ledgeRun) soleY(); // (only to know where its feet are: see stepHeard)
    aimHead(dt, now, level);
    gripCard(dt);
    maskTunnel();
    applyCheer(dt);
    stepPhones(dt);
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
    stepJet(dt);
    stepDust(dt);
    stepMotes(dt, Math.max(air, level), level);
    pGeo.attributes.position.needsUpdate = true;
    pGeo.attributes.aAlpha.needsUpdate = true;

    // the clickable area follows the body (lying along it, flying level; none while it
    // is behind a card)
    const visible = shared.uDissolve.value < 0.6 && !tun.hidden && !maskHides;
    const w = at.h * (0.5 + 0.45 * level), hh = at.h * (0.95 - 0.55 * level);
    const off = view.dock ? canvas.getBoundingClientRect() : { left: 0, top: 0 };
    hit.style.transform = `translate(${(off.left + at.x - w / 2).toFixed(1)}px, ${(off.top + at.y - at.h * BODY_C - hh / 2).toFixed(1)}px)`;
    hit.style.width = `${w.toFixed(0)}px`;
    hit.style.height = `${hh.toFixed(0)}px`;
    hit.style.visibility = visible ? 'visible' : 'hidden';
    stepHeard(dt, off.left, ((stride && runner.on) || ledgeRun) && wRun > 0.6);
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
  soundState(soundNow(), true);
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
  window.__avatar = { dbg, renderer, react, travelTo, get phones() { return { want: phones.want, k: phones.k, vis: phones.vis, shown: !!(phones.group && phones.group.visible), glow: phones.glow ? phones.glow.emissiveIntensity : 0, fx: phones.fx ? phones.fx.mode : null }; }, get section() { return section; }, get trans() { return trans; }, get grip() { return { w: grip.w, tug: tug.x }; }, get scrub() { return { on: scrub.on, u: +scrub.u.toFixed(3), mid: scrub.mid, jumping, d: +shared.uDissolve.value.toFixed(2) }; }, get jr() { return { on: jr.on, p: +jr.lastP.toFixed(3), w: +jr.w.toFixed(2), pin: +jr.pin.toFixed(2), air: +jr.air.toFixed(2), hop: trans && trans.kind === 'hop' ? +(trans.t / trans.dur).toFixed(3) : null, at: [Math.round(at.x), Math.round(at.y), Math.round(at.h), +at.yaw.toFixed(2)] }; }, get head() { return { m: +head.m.toFixed(3), to: head.to, vx: Math.round(head.vx), yaw: +pivot.rotation.y.toFixed(2), tilt: +tilt.rotation.x.toFixed(2) }; }, get tun() { return { on: tun.active, g: +tun.g.toFixed(3), f: +storyF().toFixed(3), mask: !!tun.mask, carry: !!tun.carry, clip: shared.uClipAll.value, hidden: tun.hidden, tilt: +jr.tilt.toFixed(2), fly: +jr.fly.toFixed(2) }; }, get runner() { return { on: runner.on, v: +runner.v.toFixed(2), dir: runner.dir, idx: runner.idx, yaw: +runner.yaw.toFixed(2), cheer: +cheer.t.toFixed(2), base: baseName, at: [Math.round(at.x), Math.round(at.y), Math.round(at.h)] }; }, cheer: () => startCheer(), get heard() { return { v: +heard.v.toFixed(2), fast: heard.fast, lit: jet.lit, feet: footLow.map((y) => +((y - footRest) / modelH).toFixed(4)) }; } };
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
        uniform float uClip; uniform float uClipAll; uniform float uCardOn; uniform vec4 uCardRect; uniform vec4 uAllRect;
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
        if (uClipAll > 0.5) {
          bool aIn = gl_FragCoord.x > uAllRect.x && gl_FragCoord.x < uAllRect.z && gl_FragCoord.y > uAllRect.y && gl_FragCoord.y < uAllRect.w;
          if (aIn) discard;
        }
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
