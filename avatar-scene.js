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
import { mergeGeometries, toCreasedNormals } from 'three/addons/utils/BufferGeometryUtils.js';

const MODEL = {
  url: 'assets/avatar/placeholder-robot.glb',
  // Two faces that meet at less than this (rad) are one curved surface, shaded smooth;
  // sharper than that is an edge of the armor, and stays one.
  crease: 0.9,
  // The suit's build, in body heights (see "The armor"). A chibi: half of it is helmet,
  // an egg taller than it is wide, its chin down on the chest; under that a small slim
  // body, a chest that narrows to the waist, thin arms that end in heavy gauntlets,
  // legs that end in boots (the lower leg is the boot: no foot on the end of it).
  //   head   the helmet: how wide and how deep it is, and how high off the ground its
  //          chin is (its crown is the old head's)
  //   body   how wide and how deep the body is (slimmer than the model's torso), and
  //          how much of that torso's height it keeps, from the hips up (it ends at a
  //          collar, a neck's length under the helmet: the helmet does not sit down
  //          over it); chest: how far its front stands out past that depth
  //   core   the core in the chest: how high up the body, and its radius in the body's width
  //   thigh  the thigh under its plates, at the knee and at the hip
  //   boot   the boot's radius at the knee, down the shin, and at the bell of its foot
  //   arm    the upper arm's sleeve; fore: the forearm under its plates, at the elbow
  //          and at the wrist; pad: a pauldron's reach
  //   reach  the model's forearms are as long as its legs: the suit's are this much of
  //          them; hand: and its hands, which shrink with them, this much bigger again
  suit: { head: { w: 0.46, d: 0.47, chin: 0.548 }, body: [0.22, 0.2, 0.78], chest: 0.06, core: [0.56, 0.15], thigh: [0.04, 0.046], boot: [0.047, 0.056, 0.08], arm: 0.037, fore: [0.031, 0.049], pad: 0.068, reach: 0.6, hand: 1.62 },
  // Abissal palette: trench-blue shell, steel-blue joints, softly glowing teal eyes.
  palette: {
    // (what is left of the model's own shell, its hands, and what was built to match it,
    // the jetpack, the sockets of its cores: the suit's metals, see below)
    Main: { color: 0x0e6f80, metal: 0.92, rough: 0.3, rim: 0.2 },
    Grey: { color: 0x8296ab, metal: 0.95, rough: 0.32, rim: 0.15 },
    Black: { color: 0x050810, emissive: 0x63e6d2, glow: 0.6 },
    Jet: { color: 0x0a0f18, emissive: 0xffb35c, glow: 0 }, // the jetpack's nozzles (glow set by the thrust)
    Pad: { color: 0x0a0f18, metal: 0.15, rough: 0.75 }, // the headphones' cushions
    Beat: { color: 0x050810, emissive: 0x63e6d2, glow: 0 }, // the ring on each cup (glow set by the music)
    // The suit (see "The armor"): painted metal under a clear coat. Its shell is the
    // site's teal, deep; its faceplate and trim the site's amber, as a pale gold.
    // (rim: how much of the body's teal edge-glow a look takes: metal shows its own light)
    Suit: { color: 0x0e6f80, metal: 0.92, rough: 0.3, rim: 0.2 },
    Gold: { color: 0xd9a55c, metal: 0.95, rough: 0.26, rim: 0.12 },
    Steel: { color: 0x8296ab, metal: 0.95, rough: 0.32, rim: 0.15 }, // soles
    Under: { color: 0x05080d, metal: 0.15, rough: 0.8, rim: 0 }, // the under-suit: the dark between the plates, the joints
    Eye: { color: 0x050810, emissive: 0x63e6d2, glow: 1.15 }, // the eyes in it (brightness set by the face)
  },
  // Headphones, measured in the head's own box so another head needs no new numbers:
  // across in half-widths from its middle, up in heights from its underside; sizes in
  // half-widths.
  phones: {
    reach: 1.13, // a cup's middle, out from the head's middle
    ear: 0.46, // the cups' height: where the head is widest (a band would follow the head's outline up from there, and over)
    cup: [0.3, 0.15], // a cup's radius and thickness (slim: the right arm swings close by in Wave and Dance)
    pad: [0.33, 0.06], // its cushion
    ring: [0.19, 0.026], // the glowing ring on its outer face
    band: null, // no band over the head: a cup on each side of it, and that is all (a band: [its radius, how much wider than thick it is], e.g. [0.053, 2.2])
    // where they take shape and where they come apart: at the sides of the head, each
    // cup level with its own place and a little way out from it (open: so much wider
    // than the head), to close in on to it; lift: and so far above it (in heights), none
    hover: { lift: 0, open: 1.24 },
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
  // Meshes of the right arm: sat on an open case, that arm goes down behind the X
  behindX: ['Hand.R', 'Arm.R'],
  // ...and only its fingers come over the X's rim: each from the wrist out (the bone to
  // its knuckle, then the finger's two)
  grip: [['Palm1.R', 'Index.R', 'Index2.R'], ['Palm2.R', 'Middle1.R', 'Middle2.R'], ['Palm3.R', 'Ring1.R', 'Ring2.R']],
  // The palms, where the port it fires from opens: for each hand, its wrist bone and
  // the middle finger's two (the palm lies along the first, and faces the way the finger curls)
  palms: [['Palm2.L', 'Middle1.L', 'Middle2.L'], ['Palm2.R', 'Middle1.R', 'Middle2.R']],
  // ...and the hand opened flat round it: for each hand (by its wrist bone), its fingers,
  // each from the wrist out (the bone to its knuckle, then the finger's two), and its
  // thumb's two
  hands: [
    { wrist: 'Palm2.L', fingers: [['Palm1.L', 'Index.L', 'Index2.L'], ['Palm2.L', 'Middle1.L', 'Middle2.L'], ['Palm3.L', 'Ring1.L', 'Ring2.L']], thumb: ['Thumb.L', 'Thumb2.L'] },
    { wrist: 'Palm2.R', fingers: [['Palm1.R', 'Index.R', 'Index2.R'], ['Palm2.R', 'Middle1.R', 'Middle2.R'], ['Palm3.R', 'Ring1.R', 'Ring2.R']], thumb: ['Thumb.R', 'Thumb2.R'] },
  ],
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

  // What its armor reflects: there is no room round it to mirror, so one is made, the
  // site's own lights hung in the dark (a broad pale key above and in front, the teal
  // rim behind, an amber glow low at one side, a sea-blue lift from under it), and
  // filtered once into an environment for every metal in the scene.
  {
    const pm = new THREE.PMREMGenerator(renderer);
    const room = new THREE.Scene();
    room.add(new THREE.Mesh(new THREE.SphereGeometry(40, 24, 12), new THREE.MeshBasicMaterial({ color: 0x04070d, side: THREE.BackSide })));
    const panel = (w, h, color, k, x, y, z) => {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(k), side: THREE.DoubleSide }));
      m.position.set(x, y, z);
      m.lookAt(0, 0, 0);
      room.add(m);
    };
    panel(26, 12, 0xdbe8f4, 2.4, 6, 17, 14);
    panel(12, 26, 0x63e6d2, 3, -19, 4, -10);
    panel(8, 8, 0xffb35c, 2.2, 17, -7, 7);
    panel(30, 8, 0x2d8da4, 1.1, 0, -15, 2);
    // (and what polished metal needs to look polished: long bright strips to run down it)
    panel(4, 30, 0xffffff, 3.2, -14, 6, 16);
    panel(4, 30, 0xffffff, 2.2, 15, 4, 14);
    panel(40, 3, 0xcfe6ff, 1.6, 0, 24, 0);
    scene.environment = pm.fromScene(room, 0.03).texture;
    pm.dispose();
    room.traverse((o) => { if (o.isMesh) { o.geometry.dispose(); o.material.dispose(); } });
  }

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
    uDisc: { value: new THREE.Vector3() }, // the X of an open case, a disc (middle and radius, drawing-buffer pixels; no radius: none): the right arm passes behind it...
    uGrip: { value: new THREE.Vector3() }, // ...and behind this spot on its rim (and this far round it), where the hand is: all of that arm but its fingers
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
  // (the fingers that grip the X: wrist bone, the two of the finger, and its tip)
  const fingers = MODEL.grip.map((chain) => chain.map((n) => bonesByName[bare(n)])).filter((c) => c.every(Boolean)).map((c) => [...c, c[2].children[0] || null]);
  // (each arm's hand, to open flat: its fingers the same way, and its thumb's two and tip)
  const hands = arms.map((arm) => {
    const H = MODEL.hands.find((h) => bonesByName[bare(h.wrist)] === arm[2]);
    if (!H) return null;
    const chains = [...H.fingers, H.thumb].map((c) => c.map((n) => bonesByName[bare(n)]));
    if (!chains.every((c) => c.every(Boolean))) return null;
    const thumb = chains.pop();
    return { fingers: chains.map((c) => [...c, c[2].children[0] || null]), thumb: [...thumb, thumb[1].children[0] || null] };
  });
  model.traverse((o) => {
    if (o.isBone && o.name === MODEL.headBone && !headBone) headBone = o;
    if (o.isBone && o.name === MODEL.neckBone && !neckBone) neckBone = o;
    if (!o.isMesh) return;
    o.frustumCulled = false;
    // (the model is cut in flat facets: its curves are shaded round, its real edges kept)
    // (the model is cut at a hundredth of its size, finer than that pass can tell two
    // corners apart: it is done at a thousand times that, and put back)
    if (!o.morphTargetDictionary) o.geometry = toCreasedNormals(o.geometry.clone().scale(1e3, 1e3, 1e3), MODEL.crease).scale(1e-3, 1e-3, 1e-3);
    o.material = abyssalize(o.material, shared);
    meshes.push(o);
    if (o.name === MODEL.face.mesh && o.morphTargetDictionary) faceMesh = o;
  });

  const behind = new Set(MODEL.behindCard.map(bare)), behindX = new Set(MODEL.behindX.map(bare));
  model.traverse((o) => {
    if (!o.isMesh || Array.isArray(o.material) || !o.material.userData.uClip) return;
    for (let n = o; n; n = n.parent) {
      if (behind.has(bare(n.name).replace(/_\d+$/, ''))) { o.material.userData.uClip.value = 1; break; }
      if (behindX.has(bare(n.name).replace(/_\d+$/, ''))) {
        o.material.userData.uArm.value = 1;
        // (which of its skeleton's bones are those fingers: told apart in the shader)
        if (o.isSkinnedMesh) fingers.flatMap((c) => [c[1], c[2]]).forEach((b, i) => { o.material.userData.uFing.value[i] = o.skeleton.bones.indexOf(b); });
        break;
      }
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
  // (the core in its chest, built with the jetpack below: its ring, its middle, the
  // light it throws; flare: how hard it is driven just now, by what the palm fires)
  const chest = { group: null, ring: null, mid: null, halo: null, light: null, flare: 0 };
  // (soft light, for what glows past its own edge: white in the middle, thinning out to
  // nothing. Drawn once, for the core's glow and for what the rockets do)
  const glowTex = (() => {
    const cv = document.createElement('canvas');
    cv.width = cv.height = 64;
    const x = cv.getContext('2d'), g = x.createRadialGradient(32, 32, 0, 32, 32, 32);
    [[0, 1], [0.12, 0.8], [0.3, 0.36], [0.6, 0.09], [1, 0]].forEach(([at, a]) => g.addColorStop(at, `rgba(255,255,255,${a})`));
    x.fillStyle = g;
    x.fillRect(0, 0, 64, 64);
    const t = new THREE.CanvasTexture(cv);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  })();
  // (the suit's body is slimmer than the model's: what is built on the torso, the
  // jetpack, the core and the suit's own plates, is built to this: the model's torso
  // box, made so wide and so deep about its own middle)
  const slim = (b) => {
    if (!b) return b;
    const [bw, bd] = MODEL.suit.body.map((k) => k * modelH),  cx = (b.min.x + b.max.x) / 2, cz = (b.min.z + b.max.z) / 2;
    b.min.x = cx - bw / 2;
    b.max.x = cx + bw / 2;
    b.min.z = cz - bd / 2;
    b.max.z = cz + bd / 2;
    b.max.y = b.min.y + (b.max.y - b.min.y) * MODEL.suit.body[2];
    return b;
  };
  {
    let torsoBone = null, torsoMesh = null;
    model.traverse((o) => { if (!torsoBone && o.isBone && /^Torso(_\d+)?$/.test(bare(o.name))) torsoBone = o; });
    torsoBone = torsoBone || rigBody;
    model.traverse((o) => { if (!torsoMesh && !o.isBone && bare(o.name) === 'Torso') torsoMesh = o; }); // (a mesh, or the group of its parts)
    if (torsoBone && torsoMesh) {
      model.updateMatrixWorld(true);
      const tb = new THREE.Box3().setFromObject(torsoMesh);
      const inv = new THREE.Matrix4().copy(model.matrixWorld).invert();
      slim(tb.applyMatrix4(inv));
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
      const r = tw * 0.19, len = th * 0.62;
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
      // The core in its chest: what all of it runs on, and what the port in its palm
      // draws from. Not a drawing of one: a thing with depth, down in a well of the
      // breastplate (the suit sinks the well and sets this on its floor, see "The
      // armor"). On the dark floor, a ring of light, and over the light a ring of gold
      // coils, blocks with a gap between each that the light comes up through; in the
      // middle a steel collar and in it the emitter, a low dome of light, near white;
      // over all of it a lens of glass, domed, which shows only as what it reflects;
      // a soft glow past the housing, and a light of its own, teal, that falls on the
      // chin over it and the plates round it. It breathes slowly, burns up with the
      // jets and flares when the palm fires (see stepChest). Built in model space from
      // the body's own size (front is +z) and handed to the torso bone, like the
      // jetpack; same looks, dissolve and card masks as the body.
      const R = tw * MODEL.suit.core[1];
      const c = new THREE.Group();
      const ringM = look('Black'), midM = look('Black');
      midM.emissive.setHex(0xeafffb);
      const put = (mesh, z = 0) => { mesh.position.z = z; c.add(mesh); return mesh; };
      put(new THREE.Mesh(new THREE.CircleGeometry(R * 0.89, 40), look('Pad')));
      put(new THREE.Mesh(new THREE.RingGeometry(R * 0.44, R * 0.87, 48), ringM), R * 0.012);
      const COILS = 10, half = (TAU / COILS) * 0.36, coil = new THREE.Shape();
      coil.absarc(0, 0, R * 0.84, -half, half, false);
      coil.absarc(0, 0, R * 0.5, half, -half, true);
      const coilG = new THREE.ExtrudeGeometry(coil, { depth: R * 0.07, bevelEnabled: true, bevelThickness: R * 0.03, bevelSize: R * 0.025, bevelSegments: 1, curveSegments: 5 });
      put(new THREE.Mesh(mergeGeometries(Array.from({ length: COILS }, (_, i) => coilG.clone().rotateZ((i / COILS) * TAU))), look('Gold')), R * 0.04);
      put(new THREE.Mesh(new THREE.LatheGeometry([[0.3, 0], [0.43, 0], [0.43, 0.1], [0.39, 0.15], [0.31, 0.15], [0.3, 0.1]].map(([r, y]) => new THREE.Vector2(r * R, y * R)), 36).rotateX(Math.PI / 2), look('Steel')), R * 0.012);
      put(new THREE.Mesh(new THREE.SphereGeometry(R * 0.3, 28, 10, 0, TAU, 0, Math.PI / 2).rotateX(Math.PI / 2).scale(1, 1, 0.55), midM), R * 0.06);
      // (the lens: black glass, added to what is behind it, so that all there is of it
      // is the room and the lights it mirrors. Its rim at this group's z: the suit sets
      // it on the seat of the well)
      const lensM = abyssalize(new THREE.MeshPhysicalMaterial({ name: 'Lens', color: 0x000000, roughness: 0.04, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.03, envMapIntensity: 1.7, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }), shared);
      lensM.userData.uRimK.value = 0.3;
      const sag = R * 0.12, wide = R * 0.92, rho = (wide * wide + sag * sag) / (2 * sag);
      const lens = put(new THREE.Mesh(new THREE.SphereGeometry(rho, 36, 6, 0, TAU, 0, Math.asin(wide / rho)).rotateX(Math.PI / 2).translate(0, 0, sag - rho), lensM), R * 0.2);
      lens.renderOrder = 1;
      const haloM = flame(0x63e6d2, 0);
      haloM.map = glowTex;
      const halo = put(new THREE.Mesh(new THREE.PlaneGeometry(R * 5.2, R * 5.2), haloM), R * 0.3);
      halo.renderOrder = 2;
      const light = new THREE.PointLight(0x63e6d2, 0, 1, 2);
      light.position.z = R * 1.3;
      c.add(light);
      Object.assign(c.userData, { halo, lens });
      c.position.set((tb.min.x + tb.max.x) / 2, tb.min.y + th * MODEL.suit.core[0], tb.max.z + (tb.max.z - tb.min.z) * MODEL.suit.chest);
      model.add(c);
      torsoBone.attach(c);
      c.traverse((o) => { if (o.isMesh) o.frustumCulled = false; });
      Object.assign(chest, { group: c, ring: ringM, mid: midM, halo: haloM, light });
    }
  }

  // The armor. The model is a toy robot cut in flat facets, a box of a head on a stick
  // body: the guide wears a suit over it. Every rigid part of the model is hidden (it
  // stays where it is: everything that measures the body, its floor, its soles, the
  // motes it dissolves into, still reads the old shape) and in its place, on the same
  // bones, is a smooth shell built here from the model's own measures and MODEL.suit: a
  // helmet with a faceplate and two eyes of light, a slim breastplate, pauldrons, arms
  // with heavy cuffs and legs that end in boots: a chibi, nearly half of it helmet. Its
  // hands are the model's own, out of the suit's cuffs. The suit is painted metal under a clear coat (teal,
  // with a pale gold faceplate and steel joints): no pattern on it, only the room's
  // lights running over its curves. Same dissolve and card masks as the body.
  const visor = { eyes: [], mat: null, glow: null, shell: null, y0: 0, blink: 2 + Math.random() * 3 };
  {
    // (the head as every clip holds it at rest, not as the file leaves it, turned, in
    // the middle of a glance: the helmet is built square to the body, and must be so
    // with the head at rest, or it rides turned for good)
    const still = headBone && ((THREE.AnimationClip.findByName(gltf.animations, CLIPS.idle) || {}).tracks || []).find((t) => t.name === `${headBone.name}.quaternion`);
    if (still) headBone.quaternion.fromArray(still.values);
    model.updateMatrixWorld(true);
    const S = MODEL.suit;
    const inv = new THREE.Matrix4().copy(model.matrixWorld).invert();
    const V = (o) => model.worldToLocal(o.getWorldPosition(new THREE.Vector3()));
    const look = (name) => Object.assign(abyssalize(new THREE.MeshPhysicalMaterial({ name, clearcoat: name === 'Under' ? 0 : 1, clearcoatRoughness: 0.14 }), shared), { side: THREE.DoubleSide }); // (the under-suit is matte: no coat on it)
    // (an original part's box, in model space: by its name, or its group's)
    const boxOf = (name) => {
      const b = new THREE.Box3();
      for (const o of meshes) {
        let own = false;
        for (let n = o; n && !n.isBone; n = n.parent) if (bare(n.name).replace(/_\d+$/, '') === bare(name)) own = true;
        if (own) b.union(new THREE.Box3().setFromObject(o));
      }
      return b.isEmpty() ? null : b.applyMatrix4(inv);
    };
    const hang = (bone, obj) => {
      model.add(obj);
      bone.attach(obj);
      obj.traverse((o) => { if (o.isMesh) o.frustumCulled = false; });
      return obj;
    };
    // (an outline as a function: the radius at a height, both 0..1, through a smooth curve)
    const radius = (outline) => {
      const pts = new THREE.SplineCurve(outline.map(([r, y]) => new THREE.Vector2(r, y))).getPoints(120);
      return (y) => {
        let i = 1;
        while (i < pts.length - 1 && pts[i].y < y) i++;
        const a = pts[i - 1], b = pts[i], k = clamp01((y - a.y) / Math.max(1e-6, b.y - a.y));
        return a.x + (b.x - a.x) * k;
      };
    };
    // A patch of shell, cut to any outline: u across and v up it, each 0..1, put where
    // `at(u, v, out)` says, and shaded smooth.
    const patch = (nu, nv, at) => {
      const pos = new Float32Array((nu + 1) * (nv + 1) * 3), idx = [];
      const P = new THREE.Vector3();
      for (let j = 0; j <= nv; j++) for (let i = 0; i <= nu; i++) {
        const k = j * (nu + 1) + i;
        at(i / nu, j / nv, P).toArray(pos, k * 3);
        if (i < nu && j < nv) idx.push(k, k + 1, k + nu + 1, k + 1, k + nu + 2, k + nu + 1);
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      g.setIndex(idx);
      g.computeVertexNormals();
      return g;
    };
    const suit = look('Suit'), gold = look('Gold'), steel = look('Steel'), under = look('Under');
    const T = modelH, UP = new THREE.Vector3(0, 1, 0), O = new THREE.Vector3(); // (T: lengths below are in body heights)
    // (what is turned, or built corner by corner, keeps its edges: two faces that meet
    // at more than this are an edge, not a curve. Done at a thousand times the size, as
    // for the model. Plates need none of it: see plate)
    const crisp = (g) => toCreasedNormals(g.scale(1e3, 1e3, 1e3), 0.5).scale(1e-3, 1e-3, 1e-3);
    // (which way is out of a surface, at a place on it. inside: a point within it, or
    // what gives one for a place: out is away from that)
    const q0 = new THREE.Vector3(), q1 = new THREE.Vector3(), q2 = new THREE.Vector3(), q3 = new THREE.Vector3(), q4 = new THREE.Vector3();
    const outOf = (at, u, v, inside, n) => {
      const e = 1e-3;
      at(Math.min(1, u + e), v, q0).sub(at(Math.max(0, u - e), v, q1));
      at(u, Math.min(1, v + e), q2).sub(at(u, Math.max(0, v - e), q1));
      n.crossVectors(q0, q2);
      at(u, v, q3);
      q3.sub(typeof inside === 'function' ? inside(q3, q4) : inside);
      if (!(n.length() > 1e-3 * q0.length() * q2.length())) n.copy(q3); // (where the surface closes to a point: straight out)
      n.normalize();
      return n.dot(q3) < 0 ? n.negate() : n;
    };
    // A plate of armor: a piece of shell with a thickness, laid on a surface. at(u, v,
    // out) is the surface under it, u across and v up, each 0..1 (any outline: by where
    // it puts them); the plate stands t off that, and its rim is cut in two: a chamfer
    // `edge` wide down most of its thickness, which is what catches the light, then a
    // short wall down into what it lies on (lengths). What makes the suit armor is
    // these: plate over plate, each rim a line of light, the dark between them.
    //   base    it lies on another plate: that one's thickness
    //   keep    sides whose rim is left square (l r b t): where it closes to a point
    //   wrap    it goes all the way round in u (a band: no rim that way)
    //   swell   (u, v) => how much of t, there
    //   solid   (u, v) => no rim there (where two of its sides meet each other)
    //   gap     under it, this much wider all round, a strip of the dark it is laid on
    //   dark    that strip's look (the under-suit's, if not given)
    const plate = (nu, nv, at, t, edge, mat, opt = {}) => {
      const { base = 0, keep = '', wrap = false, inside = O, swell = null, solid = null, gap = 0 } = opt;
      const run = (f) => {
        let L = 0;
        f(0, q0);
        for (let i = 1; i <= 8; i++) { L += q0.distanceTo(f(i / 8, q1)); q0.copy(q1); }
        return Math.max(L, 1e-9);
      };
      // (how far it is across, and up: through its middle, or, where that is too short
      // to carry a rim, a plate that closes to a point there, through its quarters)
      const len = (f) => { const L = run((k, o) => f(k, 0.5, o)); return L * 0.3 > edge ? L : Math.max(L, run((k, o) => f(k, 0.25, o)), run((k, o) => f(k, 0.75, o))); };
      const lenU = len((k, c, o) => at(k, c, o)), lenV = len((k, c, o) => at(c, k, o));
      const rims = { l: !wrap && !keep.includes('l'), r: !wrap && !keep.includes('r'), b: !keep.includes('b'), t: !keep.includes('t') };
      // (the cuts across it. At a rim: the wall's foot and its top, the chamfer's foot and
      // its top, then the face: wall, chamfer and face each have corners of their own, one
      // over the other where they meet, so each is shaded as itself and the line between
      // two of them is an edge)
      const cuts = (n, b, lo, hi) => {
        const a = lo ? b : 0, z = hi ? 1 - b : 1, c = [];
        if (lo) c.push(0, 0, 0, a);
        for (let i = 0; i <= n; i++) c.push(a + (z - a) * (i / n));
        if (hi) c.push(z, 1, 1, 1);
        return c;
      };
      const us = cuts(nu, Math.min(0.3, edge / lenU), rims.l, rims.r), vs = cuts(nv, Math.min(0.3, edge / lenV), rims.b, rims.t);
      const W = us.length, H = vs.length, pos = new Float32Array(W * H * 3), idx = [], n = new THREE.Vector3(), p = new THREE.Vector3();
      const lvl = (d) => (d > 2 ? 2 : d > 0 ? 1 : 0); // (so far in from a rim: 0 the wall's foot, 1 the chamfer's, 2 the face)
      const twin = (c, i) => i > 0 && i < c.length - 2 && c[i] === c[i + 1]; // (two cuts in one place: nothing is drawn between them)
      for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
        const u = us[i], v = vs[j], k = j * W + i;
        const m = solid && solid(u, v) ? 2 : Math.min(rims.l ? lvl(i) : 2, rims.r ? lvl(W - 1 - i) : 2, rims.b ? lvl(j) : 2, rims.t ? lvl(H - 1 - j) : 2), sw = swell ? swell(u, v) : 1;
        outOf(at, u, v, inside, n);
        at(u, v, p).addScaledVector(n, base + (m === 0 ? -0.3 * t : t * sw * (m === 1 && sw > 0 ? 0.4 : 1))).toArray(pos, k * 3);
        if (i < W - 1 && j < H - 1 && !twin(us, i) && !twin(vs, j)) {
          const k1 = wrap && i === W - 2 ? j * W : k + 1; // (a band's last strip closes on its first)
          idx.push(k, k1, k + W, k1, k1 + W, k + W);
        }
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      geo.setIndex(idx);
      geo.computeVertexNormals();
      const mesh = new THREE.Mesh(geo, mat);
      if (!gap) return mesh;
      const mu = wrap ? 0 : (2 * gap) / lenU, mv = (2 * gap) / lenV, g = new THREE.Group();
      g.add(mesh, plate(nu, nv, (u, v, o) => at(0.5 + (u - 0.5) * (1 + mu), 0.5 + (v - 0.5) * (1 + mv), o), t * 0.3, edge * 0.5, opt.dark || under, { base, keep, wrap, inside, solid, swell }));
      return g;
    };
    // (a piece turned round an axis, from its outline: [radius, height] up it)
    const turned = (pts, mat, seg = 40) => new THREE.Mesh(crisp(new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(r, y)), seg)), mat);
    // (a part's pieces made one mesh a look: fewer things to draw. Not those that must
    // stay themselves: the eyes, which blink; the helmet's shell, which is measured)
    const fuse = (root) => {
      root.updateMatrixWorld(true);
      const back = new THREE.Matrix4().copy(root.matrixWorld).invert(), by = new Map(), gone = [];
      root.traverse((o) => {
        if (!o.isMesh || o.userData.own) return;
        const geo = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone();
        for (const k of Object.keys(geo.attributes)) if (k !== 'position' && k !== 'normal') geo.deleteAttribute(k);
        geo.applyMatrix4(new THREE.Matrix4().multiplyMatrices(back, o.matrixWorld));
        if (!by.has(o.material)) by.set(o.material, []);
        by.get(o.material).push(geo);
        gone.push(o);
      });
      for (const o of gone) o.removeFromParent();
      for (const [mat, geos] of by) root.add(new THREE.Mesh(mergeGeometries(geos), mat));
      return root;
    };
    // A limb's own frame: its foot on the joint `lo`, +y up it to the joint `hi` (L
    // long). round: a place on it, so far round (0: its front) and so high (0..1), its
    // radius by height; axis: its middle, there; toward: how far round it a direction
    // of the model's lies.
    const stand = (lo, hi) => {
      const A = V(lo), B = V(hi), g = new THREE.Group();
      g.position.copy(A);
      g.quaternion.setFromUnitVectors(UP, B.clone().sub(A).normalize());
      const back = g.quaternion.clone().invert();
      return { g, L: A.distanceTo(B), toward: (x, y, z) => { const d = new THREE.Vector3(x, y, z).applyQuaternion(back); return Math.atan2(d.x, d.z); } };
    };
    const round = (L, rf) => (phi, y, o) => { const r = rf(y); return o.set(r * Math.sin(phi), y * L, r * Math.cos(phi)); };
    const axis = (p, o) => o.set(0, p.y, 0);
    const EDGE = 0.008 * T;
    // (a band right round a limb, from one height to another; a plate on one side of
    // it; the under-suit of it; a ball of a joint)
    const band = (S0, y0, y1, t, mat, opt) => plate(36, Math.max(2, Math.round((y1 - y0) * 14)), (u, v, o) => S0(u * TAU, y0 + (y1 - y0) * v, o), t * T, EDGE, mat, { wrap: true, inside: axis, ...opt });
    const shield = (S0, phi0, half, y0, y1, t, mat, opt) => plate(16, Math.max(4, Math.round((y1 - y0) * 20)), (u, v, o) => S0(phi0 + (u * 2 - 1) * half(v), y0 + (y1 - y0) * v, o), t * T, EDGE, mat, { inside: axis, ...opt });
    const tube = (S0, mat) => new THREE.Mesh(patch(28, 10, (u, v, o) => S0(u * TAU, v, o)), mat);
    const ball = (r, mat, x = 0, y = 0, z = 0) => new THREE.Mesh(new THREE.SphereGeometry(r * T, 28, 18).translate(x, y, z), mat);

    // The helmet. Not a ball: a helmet's shape, a jaw that runs out to the cheek, sides
    // that stand upright, a crown that turns over quickly, and squarer than round seen
    // from above (the headphones are cut to it, below). Its shell is the suit's teal,
    // closed underneath, a steel ring where the neck goes in. Its face is a friendly
    // one: a wide visor of dark glass, round-cornered, set back in a frame of pale gold
    // that stands proud of the shell; behind the glass two eyes of light, tall and
    // round, soft at the edges (what they do is the face's: see the visor, below), and
    // the glow they throw on the dark round them; the glass itself only as what it
    // mirrors, so the eyes are seen to lie behind it. No brow, no mouth: nothing to
    // frown with. On the shell, plate over plate: a ridge over the crown, a band round
    // the jaw, one round the nape, a plate at each temple. No ears: the headphones sit
    // on its sides.
    const hb = headBone ? boxOf('Head') : null;
    if (hb) {
      // (the old head was a wide flat box: this is narrower than that, its crown where
      // the old one was, its chin clear of the collar, a neck's length over it)
      const y0 = S.head.chin * T, w = S.head.w * T, h = hb.max.y - y0, d = S.head.d * T;
      // (its outline, up it: shut underneath, a chin, a jaw that runs out to the cheek,
      // sides that stand upright from there to the temple, a crown that turns over quickly)
      const R = radius([[0.001, 0], [0.34, 0.006], [0.52, 0.03], [0.8, 0.13], [0.95, 0.26], [1, 0.38], [1, 0.56], [0.985, 0.7], [0.92, 0.82], [0.76, 0.915], [0.5, 0.972], [0.001, 1]]);
      // (and its plan, seen from above: squarer than a circle, a flat face and flat
      // sides with round corners between)
      const SQ = 0.7, sq = (x) => Math.sign(x) * Math.pow(Math.abs(x), SQ);
      // (a place on it: so far round from the front, so high)
      const skin = (phi, y, out) => {
        const r = R(y), jaw = 0.88 + 0.12 * smooth(clamp01(y / 0.3)), c = Math.cos(phi);
        return out.set(r * sq(Math.sin(phi)) * (w / 2) * jaw, y * h, r * sq(c) * (d / 2) * (c > 0 ? 0.94 : 1));
      };
      const g = new THREE.Group(), mid = new THREE.Vector3(0, h * 0.5, 0), n = new THREE.Vector3();
      g.position.set((hb.min.x + hb.max.x) / 2, y0, (hb.min.z + hb.max.z) / 2);
      visor.shell = new THREE.Mesh(patch(72, 48, (u, v, o) => skin((u * 2 - 1) * Math.PI, v, o)), suit); // (what the headphones are cut to)
      visor.shell.userData.own = true;
      g.add(visor.shell);
      g.add(new THREE.Mesh(new THREE.TorusGeometry(0.062 * T, 0.011 * T, 10, 40).rotateX(Math.PI / 2).translate(0, 0.004 * T, 0), steel)); // (the ring round the neck)
      const P = (nu, nv, at, t, mat, opt) => plate(nu, nv, at, t * T, 0.011 * T, mat, { inside: mid, gap: 0.006 * T, ...opt });
      // (a piece of it stood so far off the shell, with its own u and v where something is drawn on it)
      const off = (nu, nv, at, lift, uvOf) => {
        const geo = patch(nu, nv, (u, v, o) => { outOf(at, u, v, mid, n); return at(u, v, o).addScaledVector(n, lift * T); });
        if (uvOf) {
          const uv = new Float32Array((nu + 1) * (nv + 1) * 2);
          for (let j = 0; j <= nv; j++) for (let i = 0; i <= nu; i++) uv.set(uvOf(i / nu, j / nv), (j * (nu + 1) + i) * 2);
          geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
        }
        return geo;
      };
      // The face. Outlines on the helmet about the middle of the face: so far across
      // (round it, rad) and so far up (of its height), with corners so round (2: an
      // oval; more: squarer). ring: how far out the outline is, that way round.
      const FY = 0.46, ring = (A, B, sqr, a) => 1 / Math.pow(Math.pow(Math.abs(Math.cos(a)) / A, sqr) + Math.pow(Math.abs(Math.sin(a)) / B, sqr), 1 / sqr);
      const disc = (A, B, sqr, cx = 0) => (u, v, o) => { const a = u * TAU, r = ring(A, B, sqr, a) * v; return skin(cx + r * Math.cos(a), FY + r * Math.sin(a), o); };
      const round2 = (u, v) => [0.5 + 0.5 * v * Math.cos(u * TAU), 0.5 + 0.5 * v * Math.sin(u * TAU)];
      const VIS = [0.88, 0.19, 4], RIM = [1.06, 0.262, 4];
      // (the frame: a band of gold from the visor's outline out to its own, a rim inside and out)
      g.add(P(96, 5, (u, v, o) => { const a = u * TAU, r = ring(...VIS, a) + (ring(...RIM, a) - ring(...VIS, a)) * v; return skin(r * Math.cos(a), FY + r * Math.sin(a), o); }, 0.015, gold, { wrap: true }));
      g.add(new THREE.Mesh(off(64, 6, disc(VIS[0] * 1.05, VIS[1] * 1.08, 4), 0.002), under)); // (the dark behind the glass)
      const glass = abyssalize(new THREE.MeshPhysicalMaterial({ name: 'Lens', color: 0x000000, roughness: 0.05, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.03, envMapIntensity: 0.7, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }), shared);
      glass.userData.uRimK.value = 0.25;
      const pane = new THREE.Mesh(off(64, 6, disc(VIS[0] * 1.03, VIS[1] * 1.05, 4), 0.0095), glass);
      pane.userData.own = true;
      pane.renderOrder = 2;
      g.add(pane);
      // (the eyes: tall, round, apart; brightest in the middle, ruled across with fine
      // lines, like a lamp behind a grille; and each one's glow on the dark round it)
      const eyeM = look('Eye');
      eyeM.emissiveMap = (() => {
        const cv = document.createElement('canvas');
        cv.width = cv.height = 64;
        const x = cv.getContext('2d'), gr = x.createRadialGradient(32, 32, 4, 32, 32, 32);
        [[0, 1], [0.55, 0.86], [0.85, 0.55], [1, 0.2]].forEach(([at, k]) => gr.addColorStop(at, `rgb(${255 * k},${255 * k},${255 * k})`));
        x.fillStyle = gr;
        x.fillRect(0, 0, 64, 64);
        x.fillStyle = 'rgba(0,0,0,0.22)';
        for (let i = 3; i < 64; i += 5) x.fillRect(0, i, 64, 1.5);
        const t = new THREE.CanvasTexture(cv);
        t.colorSpace = THREE.SRGBColorSpace;
        return t;
      })();
      const glowM = abyssalize(new THREE.MeshBasicMaterial({ name: 'EyeGlow', color: 0x63e6d2, map: glowTex, transparent: true, opacity: 0.3, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }), shared);
      const EYE = [0.1, 0.112, 2.4], APART = 0.215;
      for (const side of [-1, 1]) {
        const glow = new THREE.Mesh(off(24, 4, disc(EYE[0] * 2.3, EYE[1] * 1.7, 2, side * APART), 0.0032, round2), glowM);
        const eye = new THREE.Mesh(off(32, 5, disc(...EYE, side * APART), 0.0042, round2), eyeM);
        glow.userData.own = eye.userData.own = true;
        glow.renderOrder = 1;
        g.add(glow, eye);
        visor.eyes.push(eye);
      }
      visor.glow = glowM;
      // (the ridge over the crown: from over the frame, widening over the top and down
      // the back. So wide, whatever the helmet is there: at the very top, all of it)
      const xw = (v) => w * (0.1 + 0.07 * smooth(clamp01(v / 0.3))) * (1 - 0.25 * smooth(clamp01((v - 0.75) / 0.25)));
      const cy = (v) => Math.min(v > 0.5 ? 1 - (v - 0.5) * 1.3 : 0.75 + v * 0.5, 0.9995);
      const ca = (v) => Math.asin(Math.pow(Math.min(1, xw(v) / Math.max(1e-9, R(cy(v)) * (w / 2))), 1 / SQ));
      g.add(P(10, 48, (u, v, o) => skin(v > 0.5 ? Math.PI - (u * 2 - 1) * ca(v) : (u * 2 - 1) * ca(v), cy(v), o), 0.012, suit, { gap: 0, solid: (u, v) => ca(v) > 1.45 }));
      g.add(P(56, 6, (u, v, o) => skin((u * 2 - 1) * 1.94, 0.04 + 0.15 * v, o), 0.011, suit)); // (the band round the jaw)
      g.add(P(24, 6, (u, v, o) => skin(Math.PI + (u * 2 - 1) * 1.14, 0.04 + 0.17 * v, o), 0.009, suit)); // (the nape's)
      for (const side of [-1, 1]) g.add(P(10, 8, (u, v, o) => skin(side * (1.3 + 0.72 * u), 0.35 + (0.25 - 0.05 * u) * v, o), 0.008, suit)); // (a temple's plate, where an ear would be)
      Object.assign(visor, { mat: eyeM, y0: h * FY });
      hang(headBone, fuse(g));
    }

    // The body: small and slim (slimmer than the model's: see slim), broadest at the
    // chest and drawn in to the waist. Under all of it the dark under-suit; on that, a
    // plate on each side of the chest and between them, over their edges, the sternum
    // plate, the thickest, and in the middle of that the core: in a well countersunk in
    // the plate (so the core is in the armor, not on it); a back plate (the jetpack is
    // on that); under the chest two lames round the waist, the upper over the lower, a
    // gold plate on each flank; then the under-suit, bare, and a plate round the hips;
    // a collar under the helmet's chin.
    const tb = slim(boxOf('Torso')), body = bonesByName.Torso_1 || bonesByName.Torso || rigBody;
    if (tb && body) {
      const w = tb.max.x - tb.min.x, h = tb.max.y - tb.min.y, d0 = tb.max.z - tb.min.z, d = d0 * (1 + S.chest);
      const TR = radius([[0.001, 0], [0.6, 0.015], [0.8, 0.08], [0.72, 0.24], [0.78, 0.36], [0.96, 0.52], [1, 0.66], [0.99, 0.82], [0.8, 0.95], [0.45, 1]]);
      const K = 0.92, STERN = 0.019; // (the under-suit, to the body's size; the sternum plate's thickness: the core is sunk in that)
      const skin = (phi, v, o) => { const r = TR(v) * K; return o.set(r * Math.sin(phi) * (w / 2), v * h, r * Math.cos(phi) * (d / 2)); };
      const g = new THREE.Group();
      g.position.set((tb.min.x + tb.max.x) / 2, tb.min.y, (tb.min.z + tb.max.z) / 2 + (d0 * S.chest) / 2);
      g.add(new THREE.Mesh(patch(64, 36, (u, v, o) => skin((u * 2 - 1) * Math.PI, v, o)), under));
      const P = (nu, nv, at, t, mat, opt) => plate(nu, nv, at, t * T, EDGE, mat, { inside: axis, gap: 0.005 * T, ...opt });
      const dip = (phi) => 0.04 * (1 - smooth(clamp01(Math.abs(phi) / 1.3))); // (a chevron: lowest in the middle)
      [[0.32, 0.43, 0.0095], [0.24, 0.34, 0.0075]].forEach(([a, b, t]) =>
        g.add(P(48, 5, (u, v, o) => { const phi = (u * 2 - 1) * Math.PI; return skin(phi, a + (b - a) * v - dip(phi), o); }, t, suit, { wrap: true }))); // (the lames)
      g.add(P(48, 5, (u, v, o) => skin((u * 2 - 1) * Math.PI, 0.03 + 0.12 * v, o), 0.009, suit, { wrap: true })); // (the plate round the hips: between it and the lames, the under-suit, bare)
      for (const side of [-1, 1]) g.add(P(12, 6, (u, v, o) => skin(side * (1.05 + 0.7 * u), 0.33 + 0.14 * v, o), 0.004, gold, { base: 0.0095 * T, gap: 0 })); // (a flank's)
      const low = (phi) => 0.42 + 0.08 * smooth(clamp01(Math.abs(phi) / 1.25));
      for (const side of [-1, 1]) g.add(P(24, 16, (u, v, o) => { const phi = side * (0.34 + 0.94 * u), lo = low(phi); return skin(phi, lo + (0.965 - lo) * v, o); }, 0.01, suit)); // (a side of the chest)
      // (the core's place on the chest: the sternum plate's face there, its middle, and
      // which way it faces: it is not flat, and it leans back toward the waist)
      const yc = S.core[0] * h, Rc = S.core[1] * w, OUT = 1.4, bp = new THREE.Vector3(), bn = new THREE.Vector3(), top = new THREE.Vector3();
      const face = (x, y, o) => { const v = y / h, r = TR(v) * K * (w / 2); return skin(Math.asin(clamp(x / r, -1, 1)), v, o).setZ(o.z + STERN * T); };
      const mid = face(0, yc, new THREE.Vector3()), nrm = new THREE.Vector3(), rim = [];
      for (let i = 0; i < 48; i++) rim.push(face(Rc * Math.cos((i / 48) * TAU), yc + Rc * Math.sin((i / 48) * TAU), new THREE.Vector3()).sub(mid));
      for (let i = 0; i < 48; i++) nrm.add(top.crossVectors(rim[i], rim[(i + 1) % 48]));
      nrm.normalize();
      if (nrm.z < 0) nrm.negate();
      // (the sternum plate: a keystone, widest at the top, wide enough at the core to
      // carry its well. Sunk to nothing where the well is cut in it: by how far its own
      // face is from the well's axis, so that it is whole again where the well's rim lands)
      const stern = (u, v, o) => skin((u * 2 - 1) * (0.52 + 0.2 * v), 0.34 + 0.625 * v, o);
      const sternP = P(28, 30, stern, STERN, suit, { swell: (u, v) => {
        outOf(stern, u, v, axis, bn);
        stern(u, v, bp).addScaledVector(bn, STERN * T).sub(mid);
        return -0.2 + 1.2 * smooth(clamp01((bp.addScaledVector(nrm, -bp.dot(nrm)).length() / Rc - 1) / (OUT - 1)));
      } });
      g.add(sternP);
      g.add(P(40, 14, (u, v, o) => skin(Math.PI + (u * 2 - 1) * 1.8, 0.42 + 0.545 * v, o), 0.01, suit)); // (the back plate)
      g.add(P(48, 3, (u, v, o) => skin(u * TAU, 0.9 + 0.1 * v, o), 0.014, suit, { wrap: true, gap: 0 })); // (the collar)
      g.add(new THREE.Mesh(new THREE.CylinderGeometry(0.048 * T, 0.054 * T, 0.075 * T, 28).translate(0, h + 0.022 * T, 0), under)); // (the neck: from in the collar up into the helmet, the under-suit, bare)
      // The core's housing. The core is IN the sternum plate: a well countersunk in it,
      // nothing standing above the plate and no other metal round it. From the plate's
      // face a chamfer down and in to the well's mouth, a flat seat round the mouth, and
      // a short wall down to the floor, just over the under-suit: the core lies on that.
      // The plate is not flat, and it leans back toward the waist: the well is sunk
      // square to the plate where the core is (its mouth one flat ring, under the
      // plate's face all round), and the core lies square to that.
      if (chest.group) {
        const c = chest.group, ray = new THREE.Raycaster();
        // (how far out of the plate's face, along that: the floor, and the seat over it)
        const floor = (0.003 - STERN) * T, seat = Math.max(floor + 0.002 * T, Math.min(...rim.map((q) => q.dot(nrm))) - 0.004 * T);
        const e1 = new THREE.Vector3(1, 0, 0).addScaledVector(nrm, -nrm.x).normalize(), e2 = new THREE.Vector3().crossVectors(nrm, e1);
        // (its rings, from the foot of the wall out: how far out, in the core's radius,
        // and how far out of the face; the last, on the plate itself)
        const rings = [[0.9, floor], [0.94, seat], [1, seat], [OUT, null]], N = 56, pos = [], idx = [];
        rings.forEach(([rho, hgt], j) => {
          for (let i = 0; i <= N; i++) {
            const a = (i / N) * TAU;
            top.copy(mid).addScaledVector(e1, Rc * rho * Math.cos(a)).addScaledVector(e2, Rc * rho * Math.sin(a));
            if (hgt === null) { // (dropped on to the plate itself, as it was built)
              ray.set(top.addScaledVector(nrm, 0.05 * T), bn.copy(nrm).negate());
              const hit = ray.intersectObject(sternP.children[0], false)[0];
              (hit ? top.copy(hit.point) : face(top.x, top.y, top)).addScaledVector(nrm, 0.0008 * T);
            } else top.addScaledVector(nrm, hgt);
            pos.push(top.x, top.y, top.z);
            if (i < N && j < rings.length - 1) { const q = j * (N + 1) + i; idx.push(q, q + 1, q + N + 1, q + 1, q + N + 2, q + N + 1); }
          }
        });
        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(pos), 3));
        geo.setIndex(idx);
        g.add(new THREE.Mesh(crisp(geo), suit));
        // (and the core itself, down in it: its face on the well's floor)
        model.attach(c);
        c.position.copy(g.position).add(mid).addScaledVector(nrm, floor);
        c.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), nrm);
        c.userData.lens.position.z = seat - floor;
        c.userData.halo.position.z = 0.003 * T - floor;
        body.attach(c);
      }
      hang(body, fuse(g));
    }

    // The legs. A thigh: plates of the suit's teal over the under-suit, a strip of gold
    // down its outer side, a cap over the hip. A dark knee, a cop over the front of it. And a boot,
    // which is the whole lower leg, from the knee to the ground, in tiers: a slim shin,
    // a guard down the front of it and a plate down the calf, a gold band round the
    // ankle, and under that the bell of the boot, standing well out from the shin on a
    // flat shelf and wider still to the ground, on a flat steel sole. There is no foot
    // on the end of it (the old foot is hidden with the rest: the boot stands where its
    // sole stood).
    legs.forEach((leg) => {
      const F = stand(leg.lower, leg.upper), g = F.g;
      const TH = round(F.L, (y) => (S.thigh[0] + (S.thigh[1] - S.thigh[0]) * y) * T);
      g.add(tube(TH, under), ball(S.thigh[1] * 0.96, under, 0, F.L, 0));
      // (in plates, the under-suit in the seams between: one round the front, from the
      // inside of the leg to its outer side; one behind; and down the outer side between
      // them a strip of gold, lower than they are)
      const ot = F.toward(leg.side, 0, 0);
      g.add(shield(TH, ot - leg.side * 1.7, () => 1.15, 0.1, 0.97, 0.009, suit));
      g.add(shield(TH, ot + leg.side * 1.5, () => 0.95, 0.12, 0.95, 0.009, suit));
      g.add(shield(TH, ot, (v) => 0.44 - 0.06 * v, 0.14, 0.9, 0.0055, gold));
      // (and over the hip, a cap: a piece of a ball, tipped out)
      const hip = new THREE.Group(), hr = S.thigh[1] * 1.0 * T, ho = new THREE.Vector3(leg.side, 0, 0).applyQuaternion(g.quaternion.clone().invert());
      hip.position.set(0, F.L, 0);
      hip.quaternion.setFromUnitVectors(UP, UP.clone().addScaledVector(ho, 0.9).normalize());
      hip.add(plate(28, 8, (u, v, o) => o.set(hr * Math.sin(1.25 * v) * Math.cos(u * TAU), hr * Math.cos(1.25 * v), hr * Math.sin(1.25 * v) * Math.sin(u * TAU)), 0.009 * T, EDGE, suit, { wrap: true, keep: 'b' }));
      g.add(hip);
      hang(leg.upper, fuse(g));
      const B = stand(leg.end, leg.lower), b = B.g, L = B.L, [rk, rs, rf] = S.boot.map((r) => r * T), SK = 0.0075;
      const SH = round(L, (y) => rs - SK * T - (rs - rk) * smooth(clamp01((y - 0.55) / 0.45))); // (the shin, under its plates)
      b.add(new THREE.Mesh(patch(28, 10, (u, v, o) => SH(u * TAU, 0.25 + 0.75 * v, o)), under), ball(S.thigh[0] * 0.98, under, 0, L, 0)); // (and the knee)
      b.add(band(SH, 0.3, 0.93, SK, suit));
      b.add(band(SH, 0.36, 0.5, 0.0075, suit, { base: SK * T })); // (the ankle's collar: the tier between the shin and the bell)
      b.add(shield(SH, 0, (v) => 0.95 - 0.3 * v, 0.5, 0.94, 0.01, suit, { base: SK * T, gap: 0.004 * T }));
      b.add(shield(SH, Math.PI, (v) => 0.8 - 0.1 * v, 0.5, 0.9, 0.007, suit, { base: SK * T }));
      // (the cop over the knee: a piece of a ball round it, in front)
      const kc = new THREE.Vector3(0, L, 0), rc = S.thigh[0] * 1.12 * T;
      b.add(plate(14, 10, (u, v, o) => { const e = -0.6 + 1.35 * v, a = (u * 2 - 1) * (1 - 0.3 * v); return o.set(rc * Math.cos(e) * Math.sin(a), L + rc * 1.15 * Math.sin(e), rc * Math.cos(e) * Math.cos(a)); }, 0.012 * T, EDGE, suit, { inside: kc }));
      // (the bell: turned. Up its wall to a lip, the lip cut back, and a shelf in to the
      // shin. It and the sole stand level, whichever way the shin leans over them, and
      // it leans: they are turned back upright about where the shin meets the shelf, and
      // set down on the floor the old sole stood on)
      const up = UP.clone().applyQuaternion(b.quaternion.clone().invert()), hS = L * 0.375, ground = soles.length ? soleY() : V(leg.end).y, foot = new THREE.Group();
      foot.quaternion.copy(b.quaternion).invert();
      foot.position.set(0, (hS - (V(leg.end).y - ground)) / up.y, 0).addScaledVector(up, -hS);
      foot.add(turned([[rs * 0.8, L * 0.02], [rf * 0.97, L * 0.02], [rf, L * 0.07], [rf * 0.93, L * 0.325], [rf * 0.93 - 0.007 * T, L * 0.325 + 0.007 * T], [rs - 0.002 * T, L * 0.375]], suit));
      foot.add(turned([[0.001, 0], [rf * 0.9, 0], [rf * 0.95, L * 0.012], [rf * 0.95, L * 0.035], [0.001, L * 0.035]], steel));
      b.add(foot);
      hang(leg.lower, fuse(b));
    });
    // The arms. A pauldron over each shoulder, in two layers: a cap, and under its edge
    // a second lame (they ride on the upper arm: its top is always capped). The upper
    // arm a sleeve of gold. A dark elbow. And a gauntlet, which is the forearm: heavy,
    // and heavier toward the wrist; a thick cuff at the end of it, a gold band above
    // that, a long plate down its back from over the elbow; the hand out of its end.
    arms.forEach((arm, i) => {
      // (the left arm goes behind the contact card, the right behind a case's X: so do their shells)
      const side = armSide[i], mine = (name) => { const m = look(name); m.userData[side > 0 ? 'uClip' : 'uArm'].value = 1; return m; };
      const mSuit = mine('Suit'), mGold = mine('Gold'), mUnder = mine('Under');
      const U = stand(arm[1], arm[0]), g = U.g;
      const UA = round(U.L, (y) => (S.arm - 0.008 + 0.003 * y) * T);
      g.add(tube(UA, mUnder), ball(S.arm - 0.003, mUnder));
      g.add(band(UA, 0.14, 0.88, 0.008, mGold));
      // (the pauldron: on the shoulder, set a little out from it and tipped out; flatter than a ball)
      const pg = new THREE.Group(), out = new THREE.Vector3(side, 0, 0).applyQuaternion(g.quaternion.clone().invert());
      pg.position.set(0, U.L - 0.006 * T, 0).addScaledVector(out, 0.014 * T);
      pg.quaternion.setFromUnitVectors(UP, UP.clone().addScaledVector(out, 0.47).normalize());
      const ell = (rx, ry, rz) => (th, az, o) => o.set(rx * T * Math.sin(th) * Math.cos(az), ry * T * Math.cos(th), rz * T * Math.sin(th) * Math.sin(az));
      const E1 = ell(S.pad * 0.92, S.pad * 0.66, S.pad), E2 = ell(S.pad * 0.84, S.pad * 0.7, S.pad * 0.92);
      pg.add(ball(S.pad * 0.5, under));
      pg.add(plate(36, 8, (u, v, o) => E2(1.0 + 0.95 * v, u * TAU, o), 0.008 * T, EDGE, suit, { wrap: true }));
      pg.add(plate(36, 12, (u, v, o) => E1(1.4 * v, u * TAU, o), 0.012 * T, 0.01 * T, suit, { wrap: true, keep: 'b' }));
      g.add(pg);
      hang(arm[0], fuse(g));
      // (the gauntlet is built at the model's forearm, which is then shortened, and it
      // with it: its sizes here are made up for that)
      const F = stand(arm[2], arm[1]), f = F.g, s = 1 / S.reach;
      const FA = round(F.L, (y) => (S.fore[0] + (S.fore[1] - S.fore[0]) * Math.pow(Math.max(0, 1 - y), 1.3)) * T * s);
      f.add(tube(FA, mUnder));
      f.add(band(FA, 0.14, 0.97, 0.009 * s, mSuit));
      f.add(band(FA, 0.14, 0.42, 0.009 * s, mSuit, { base: 0.009 * s * T }));
      f.add(band(FA, 0.4, 0.475, 0.006 * s, mGold, { base: 0.009 * s * T }));
      f.add(shield(FA, F.toward(side, 0.35, -0.2), (v) => 1.0 - 0.4 * v, 0.46, 1.05, 0.011 * s, mSuit, { base: 0.009 * s * T, gap: 0.004 * s * T, dark: mUnder }));
      f.add(new THREE.Mesh(new THREE.CircleGeometry(FA(0, 0.15, new THREE.Vector3()).z, 28).rotateX(Math.PI / 2).translate(0, F.L * 0.15, 0), mUnder)); // (the dark in the cuff's mouth, round the wrist)
      hang(arm[1], fuse(f));
    });
    for (const o of meshes) if (!o.isSkinnedMesh) o.visible = false;
    // Its arms. The model's forearms are great faceted gauntlets as long as its legs:
    // those are not drawn (the suit's cuffs are there instead: only the hands show, out
    // of their ends), and the forearm bones are shortened, hands and cuffs with them,
    // the hands then made up again, so that the arms are a chibi's: down to the hip.
    for (const o of meshes) if (o.isSkinnedMesh) o.material.userData.uSkip.value.set(...arms.map((arm) => o.skeleton.bones.indexOf(arm[1])), -1, -1);
    for (const o of meshes) if (o.isSkinnedMesh) o.material.color.setHex(MODEL.palette.Suit.color); // (gloves: the fingers in the suit's teal, like the gauntlet they come out of)
    for (const arm of arms) {
      arm[1].scale.multiplyScalar(S.reach);
      const wrist = arm[2].position.clone();
      for (const b of arm[1].children) if (b.isBone) {
        b.scale.multiplyScalar(S.hand);
        b.position.sub(wrist).multiplyScalar(S.hand).add(wrist); // (and what is not at the wrist, the thumb's root, as far from it as the bigger hand puts it)
      }
    }
    model.updateMatrixWorld(true);
    // (QA: the old parts' boxes and the joints, in body heights)
    const nb = (b) => (b ? [b.min, b.max].map((v) => v.toArray().map((x) => +(x / modelH).toFixed(3))) : null);
    visor.dbg = { T: modelH, skins: meshes.filter((o) => o.isSkinnedMesh).map((o) => [o.name, o.material.name, '#' + o.material.color.getHexString()]), head: nb(hb), torso: nb(tb), foot: nb(boxOf('Foot.L')), hand: nb(boxOf('Hand.L')), joints: Object.fromEntries([['hip', legs[0]?.upper], ['knee', legs[0]?.lower], ['ankle', legs[0]?.end], ['shoulder', arms[0]?.[0]], ['elbow', arms[0]?.[1]], ['wrist', arms[0]?.[2]]].filter(([, o]) => o).map(([k, o]) => [k, V(o).toArray().map((x) => +(x / modelH).toFixed(3))])) };
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
    const frame = visor.shell ? visor.shell.parent : headBone; // (the helmet's own frame, where it wears one: square to it, whichever way the bone under it is turned)
    const inv = new THREE.Matrix4().copy(frame.matrixWorld).invert();
    const hb = new THREE.Box3(), hv = new THREE.Vector3(), hm = new THREE.Matrix4(), pts = [];
    headBone.traverse((o) => {
      if (!o.isMesh || (visor.shell && o !== visor.shell)) return; // (the helmet, where it wears one: not the old head under it)
      hm.multiplyMatrices(inv, o.matrixWorld);
      const a = o.geometry.attributes.position;
      for (let i = 0; i < a.count; i++) {
        hb.expandByPoint(hv.fromBufferAttribute(a, i).applyMatrix4(hm));
        pts.push(hv.x, hv.y, hv.z);
      }
    });
    if (hb.isEmpty()) console.warn('[avatar] no headphones: no mesh rides on the head bone to measure them from');
    else {
      const hw = (hb.max.x - hb.min.x) / 2, hh = hb.max.y - hb.min.y;
      const mine = { ...shared, uDissolve: { value: 1 } };
      const look = (name) => abyssalize(new THREE.MeshStandardMaterial({ name }), mine);
      const shell = look('Grey'), pad = look('Pad'), glow = look('Beat');
      const g = new THREE.Group();
      // (the head's own axis: across where it is widest, not the middle of its box, which
      // a face flatter than the back of the head puts behind it. And its outline there,
      // seen from in front: how far out it is, by height)
      const cx = (hb.min.x + hb.max.x) / 2, earY = hb.min.y + C.ear * hh, slab = (hb.max.z - hb.min.z) * 0.06;
      let zc = 0, far = -1;
      for (let i = 0; i < pts.length; i += 3) if (Math.abs(pts[i] - cx) > far) { far = Math.abs(pts[i] - cx); zc = pts[i + 2]; }
      const BINS = 18, wide = new Array(BINS + 1).fill(0);
      for (let i = 0; i < pts.length; i += 3) {
        if (Math.abs(pts[i + 2] - zc) > slab || pts[i + 1] < earY) continue;
        const k = Math.round(((pts[i + 1] - earY) / Math.max(1e-9, hb.max.y - earY)) * BINS);
        wide[k] = Math.max(wide[k], Math.abs(pts[i] - cx));
      }
      const rig = new THREE.Group(); // its origin on the line through the ears
      rig.position.set(cx, earY, zc);
      g.add(rig);
      // the band, where they have one: from ear to ear over the top of the head, the
      // head's own outline stood off it by what the cups stand off its sides
      const reach = C.reach * hw;
      let band = null, over = null;
      if (C.band) {
        const clear = Math.max(0, reach - (wide[0] || hw)), half = [];
        for (let k = 0; k <= BINS; k++) if (k === 0 || k === BINS || wide[k] > 0) half.push(new THREE.Vector2(k === BINS ? 0 : wide[k], ((hb.max.y - earY) * k) / BINS));
        const arch = half.map((q, i) => {
          const a = half[Math.max(0, i - 1)], b = half[Math.min(half.length - 1, i + 1)], tx = b.x - a.x, ty = b.y - a.y, tl = Math.hypot(tx, ty) || 1;
          return i === half.length - 1 ? new THREE.Vector3(0, q.y + clear, 0) : new THREE.Vector3(q.x + (ty / tl) * clear, q.y - (tx / tl) * clear, 0);
        });
        arch[0].set(reach, 0, 0);
        for (let i = arch.length - 2; i >= 0; i--) arch.push(new THREE.Vector3(-arch[i].x, arch[i].y, 0));
        over = new THREE.CatmullRomCurve3(arch);
        band = new THREE.Mesh(new THREE.TubeGeometry(over, 64, C.band[0] * hw, 8, false), shell);
        band.scale.z = C.band[1];
        rig.add(band);
      }
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
      // Where their motes belong: places all over the band, if there is one, and the
      // cups, in the rig's frame (part: 0 on the band, else the side of the cup it is on).
      const spots = [];
      for (let i = 0; i < C.motes; i++) {
        if (over && i % 2 === 0) {
          const q = over.getPoint(Math.random()), j = C.band[0] * hw * 1.6;
          spots.push({ part: 0, x: q.x + (Math.random() - 0.5) * j, y: q.y + (Math.random() - 0.5) * j, z: (Math.random() - 0.5) * j * C.band[1] });
        } else {
          const side = (over ? i % 4 === 1 : i % 2 === 1) ? -1 : 1, a = Math.random() * TAU, r = rc * hw * (0.5 + 0.55 * Math.random());
          spots.push({ part: side, x: side * (Math.random() - 0.3) * tc * hw, y: Math.sin(a) * r, z: Math.cos(a) * r });
        }
      }
      g.traverse((o) => { if (o.isMesh) o.frustumCulled = false; });
      frame.add(g);
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
    if (id !== 'transmit' && ((view.dock && formFocused()) || (sceneOpen() && !stage.over))) return;
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
  // Motes in: a cup's, from out at its own side of the head, level with it, in to
  // their places with a little turn (a band's, from round and above the head, swirling
  // in). Motes out: from their places they are thrown clear, a cup's out to its side,
  // and left to the current.
  const pLat = new THREE.Vector3();
  function phonesFx(mode, across) {
    const P = phones;
    if (!hPts || reduced) return;
    const H = Math.max(at.h * view.wpp, 1e-3) * (view.dock ? 0.4 : 1); // (docked: a small cloud, inside its small frame)
    P.rig.updateWorldMatrix(true, false);
    pLat.setFromMatrixColumn(P.rig.matrixWorld, 0).normalize(); // (out to the head's side, the way it is turned)
    for (let i = 0; i < hN; i++) {
      const th = Math.random() * TAU, ph = Math.acos(2 * Math.random() - 1), side = P.spots[i].part;
      const dx = Math.sin(ph) * Math.cos(th), dy = side ? Math.cos(ph) : Math.abs(Math.cos(ph)), dz = Math.sin(ph) * Math.sin(th);
      if (mode === 'in') {
        // (here: how far off it starts)
        if (side) {
          const r = H * (0.14 + 0.32 * Math.random()) * side, j = H * 0.09 * Math.random();
          hVel[i * 3] = pLat.x * r + dx * j; hVel[i * 3 + 1] = pLat.y * r + dy * j; hVel[i * 3 + 2] = pLat.z * r + dz * j;
          hSwirl[i] = 0.2 + Math.random() * 0.5;
        } else {
          const r = H * (0.2 + 0.5 * Math.random());
          hVel[i * 3] = dx * r; hVel[i * 3 + 1] = dy * r * 0.8 + H * 0.05; hVel[i * 3 + 2] = dz * r;
          hSwirl[i] = 1.3 + Math.random() * 1.7;
        }
        hDelay[i] = Math.random() * 0.28;
        hLife[i] = 0.42 + Math.random() * 0.24;
      } else {
        spotWorld(P.spots[i], across, pv);
        hPos[i * 3] = pv.x; hPos[i * 3 + 1] = pv.y; hPos[i * 3 + 2] = pv.z;
        const sp = H * (0.18 + Math.random() * 0.7), out = side * sp * 0.7;
        hVel[i * 3] = dx * sp * (side ? 0.5 : 1) + pLat.x * out; hVel[i * 3 + 1] = dy * sp * (side ? 0.5 : 0.7) + (side ? H * 0.03 : H * 0.12) + pLat.y * out; hVel[i * 3 + 2] = dz * sp * (side ? 0.5 : 0.6) + pLat.z * out;
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
    // (taking shape, they are a little wider than the head; then they close in on it)
    let across = 1 + (V.open - 1) * (view.dock ? 0 : 1 - P.k);
    if (reduced) {
      P.vis = P.visT = there ? 1 : 0;
      P.k = want === 'on' ? 1 : 0;
      P.kv = P.hold = 0;
    } else {
      // The order of things. Coming: the motes first, the headphones taking shape in
      // them a moment later, and only once they are there do they close on the head.
      // Going: off the head first, then to motes.
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
    if (P.band) P.band.scale.set(across, 1, MODEL.phones.band[1]);
    for (const c of P.cups) c.group.position.x = c.side * P.reach * across;
    stepPhonesFx(dt, across);
    // the moment they are on: its head gives a little as they close on it (they come
    // from the sides now, not down on to it: a start, not a dip), and the rings flare
    if (!P.landed && (want === 'on' ? k > 0.9 : k < 0.1)) {
      P.landed = true;
      if (want === 'on' && !reduced) {
        P.flash = 1;
        if (P.dis.value < 0.5 && !maskHides && !tun.hidden) sfx('phones-clamp');
      }
      if (!reduced) nod.v += (want === 'on' ? 3 : -1.6) * (MODEL.phones.hover.lift ? 1 : 0.4);
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
  const restPose = [...new Set([headBone, neckBone, ...arms.flat(), ...fingers.flatMap((c) => c.slice(0, 3)), ...hands.flatMap((h) => (h ? [...h.fingers.flatMap((c) => c.slice(0, 3)), ...h.thumb.slice(0, 2)] : [])), ...cheerBones.map((c) => c.bone), ...rigBones])]
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
  // focus it skips the wave and takes hold of the card straight away; with the card
  // still to fetch and its place in view, bringing it in is the hello.
  function greet(id, name) {
    if (id === 'contato' && (formFocused() || delivSoon())) return;
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
    if (reduced) return; // (the loop sleeps between inputs there: no look is begun that it would be left with)
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
        // (the card's own place, even while it is still out of sight or on its way in:
        // see stepDeliver)
        const r = nodes.terminal ? homeRect() : null;
        const h = Math.min(H * 0.24, 220);
        // tucked against the card's lower-left corner, both hands on its edge
        if (r) {
          const x = r.left - h * 0.2, y = Math.min(r.bottom + h * 0.16, H * 0.96);
          // (with the last video case still held over that spot, it waits off the case's
          // right side, where it dropped, until the case rides up out of the way)
          const c = ledgeMode() ? lastCase().getBoundingClientRect() : null;
          const w = c && c.right > x - h * 0.4 ? smooth(clamp01((c.bottom - (y - h * 0.95)) / (h * 0.12))) : 0;
          // (clear: nothing over the spot; grip: and the card in its place, to hold)
          return { x: x + (Math.max(x, c ? c.right + h * 0.45 : x) - x) * w, y, h, yaw: 0.6, clear: w < 0.01, grip: w < 0.01 && deliv.st === 'home' };
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
    // (sat on an open case, or on its way there: the room over the card is another now)
    if (trans && trans.kind === 'case' && trans.perch && trans.perch.st !== 'wait') {
      sceneEl.style.paddingTop = '';
      const g = perchSpot();
      if (g) trans.perch.hp = perchRoom(g);
    }
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
  let cardTr = '', cardRo = ''; // (what was last written to it, so a still card isn't rewritten every frame)
  let cardDX = 0; // how far off its place the card is drawn right now (deliv.x as last written)
  // The contact card's entrance (see stepDeliver). st: 'home' (in its place), 'parked'
  // (out of sight off the left edge), 'fetch', 'push', 'tuck' (the guide bringing it in),
  // 'slide' (let go midway, it slides on into place by itself); x: how far the card is
  // from its place (px, never right of it); t: time into a leg; X0: where the push set
  // off; from: where the fetch set off
  const deliv = { st: 'home', x: 0, t: 0, X0: 0, from: null };
  // The card's own place: where it is drawn, less how far off it it is drawn (what is on
  // the page, not deliv.x, which may be a frame ahead of it)
  function homeRect() {
    const r = nodes.terminal.getBoundingClientRect();
    return { left: r.left - cardDX, right: r.right - cardDX, top: r.top, bottom: r.bottom, width: r.width, height: r.height };
  }
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
    // (bringing the contact card in, it is on the jets wherever it is)
    const airborne = delivBusy() || (trans && trans.kind === 'enter' ? trans.phase === 'fly' : trans && trans.kind === 'hop' ? jr.air > 0.5 : scrub.mid && (jr.air > 0.5 || jr.fly > 0 || (jr.on && jr.pin < 0.5)));
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
    const from = (trans && trans.kind === 'enter') || onLedge || delivBusy() ? null
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
    perchPoke,
    // (the show goes on to the open case: its video is the guide's to start, see perchBlast)
    perching: () => !!(trans && trans.kind === 'case' && trans.opened),
    beginSend,
    fire() {
      sfx('transmit');
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
    const pi = ORDER.indexOf('projetos');
    if (onLedge && f > LEDGE.edge && scrub.u - Math.floor(t) >= LEDGE.edge - 1e-3) {
      // Run off the end of the last case, it flies down on the clock (a little faster
      // only if the scroll runs ahead) and stays in the next section, until the scroll
      // takes it back onto the card.
      const li = Math.floor(t);
      const s = (scrub.u - li - LEDGE.edge) / (1 - LEDGE.edge); // through the flight
      ledgeWay('down', s);
      const step = (1 - LEDGE.edge) * ledgeRate(s, false) * dt;
      const follow = t > scrub.u ? (t - scrub.u) * damp(FOLLOW, dt) : 0;
      scrub.u = Math.min(li + 1, scrub.u + Math.max(step, Math.min(follow, step * 1.8)));
    } else if (pi >= 0 && pi < ORDER.length - 1 && ledgeMode() && t < pi + LEDGE.edge && scrub.u > pi + LEDGE.edge + 1e-4 && scrub.u <= pi + 1) {
      // Taken back onto the card's hold with it down by the next section (or still on its
      // way there): it flies back up onto the card on the clock, the same way.
      if (delivBusy()) {
        // (out bringing the contact card in, nowhere near the spot that flight sets off
        // from: it goes straight from where it is)
        jumping = true;
        scrub.leap = true;
        scrub.scrolledAt = now;
        travelTo(ORDER[Math.round(t)]);
        scrub.on = false;
        return;
      }
      const s = (scrub.u - pi - LEDGE.edge) / (1 - LEDGE.edge);
      ledgeWay('up', s);
      const step = (1 - LEDGE.edge) * ledgeRate(s, true) * dt;
      const follow = (scrub.u - t) * damp(FOLLOW, dt);
      scrub.u = Math.max(pi + LEDGE.edge, scrub.u - Math.max(step, Math.min(follow, step * 1.8)));
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
  // The moment its feet leave the card it flies, on the clock, whatever the scroll does
  // then (see stepScrub): out level to the right of the case, carried on by its run,
  // down round a wide turn (upright through it, turned to the visitor, banked into it)
  // and back in level, flaring to set down on its feet by the next section. Back up the
  // page it flies the same way the other way up: a crouch and a spring off the floor,
  // out to the right climbing, up round the turn and back in level onto the end of the
  // card, facing along it for the run back. It never hangs in the air, and it never
  // plays the way down backward.
  const DECK_DWELL = 0.4; // the hold, in viewport heights (the same in app.js)
  const RUN_STRIDE = 1.1; // body heights a second the Running clip covers at speed 1 (under the mixer's 0.82)
  const ledgeMode = () => !reduced && !view.dock && !!nodes.deck && nodes.projects.length > 1;
  const lastCase = () => { const n = nodes.projects[nodes.projects.length - 1]; return n.querySelector('.project-card') || n; };
  const LEDGE = { edge: 0.2 }; // the run's share of the zone (the rest is the flight's: s, 0 at the edge, 1 down)
  // The flights, as shares of their own way (r: s down, 1 - s up) and their times in
  // seconds: the crouch before the spring (up only), the flight, the landing.
  const FLY_DN = { T0: 0, L: 0.82, crouch: 0, fly: 1.45, land: 0.5 };
  const FLY_UP = { T0: 0.1, L: 0.88, crouch: 0.2, fly: 1.45, land: 0.28 };
  // how fast s goes on the clock (per second), flying the given way
  function ledgeRate(s, up) {
    const C = up ? FLY_UP : FLY_DN, r = clamp01(up ? 1 - s : s);
    return r < C.T0 ? C.T0 / C.crouch : r < C.L ? (C.L - C.T0) / C.fly : (1 - C.L) / C.land;
  }
  // carry: the card it dropped in behind; mode: the way it flies ('down' | 'up')
  const ledge = { drove: false, was: false, face: 1, lastP: -1, still: 0, v: 0, carry: null, mode: 'down', fromAir: false, B: null, bAt: 0 };
  // (the flight's way changing in mid-air: from where it is, onto the other flight)
  function ledgeWay(mode, s) {
    if (ledge.mode === mode) return;
    if (s > 1e-3 && s < 1 - 1e-3) { snapRig(); jr.lastP = -1; }
    ledge.mode = mode;
  }
  // a cubic Hermite: from a (heading off at va) to b (arriving at vb), at u in 0..1
  const hermite = (a, va, b, vb, u) => {
    const u2 = u * u, u3 = u2 * u;
    return (2 * u3 - 3 * u2 + 1) * a + (u3 - 2 * u2 + u) * va + (3 * u2 - 2 * u3) * b + (u3 - u2) * vb;
  };
  const hermiteD = (a, va, b, vb, u) => {
    const u2 = u * u;
    return (6 * u2 - 6 * u) * a + (3 * u2 - 4 * u + 1) * va + (6 * u - 6 * u2) * b + (3 * u2 - 2 * u) * vb;
  };
  // The way round, from A to Z at k (0..1): out to the right of both, round the turn
  // there (going straight down, or up) and back in from the right. Returns the point and
  // the heading (per unit of k), continuous through the turn.
  const loopPt = { x: 0, y: 0, vx: 0, vy: 0 };
  function loopAt(A, Z, k, up, h) {
    const right = Math.max(A.x, Z.x);
    const xR = Math.max(right + h * 0.75, Math.min(right + h * 2, view.w - h * 0.55));
    const yR = (A.y + Z.y) / 2;
    const d1 = Math.hypot(xR - A.x, yR - A.y), d2 = Math.hypot(Z.x - xR, Z.y - yR);
    const D = (d1 + d2) * 1.15, a = d1 / Math.max(1, d1 + d2);
    const sy = Math.sign(Z.y - A.y) || 1;
    // off A: level and on its way (down, off the edge) or springing up and out (up);
    // round the turn, straight down or up; into Z level, settling onto it from just above
    const tA = up ? [0.35 * D, -0.9 * D] : [1.1 * D, -0.06 * D];
    const tR = [0, sy * D];
    const tZ = up ? [-0.85 * D, 0.3 * D] : [-0.95 * D, 0.14 * D];
    let P0, t0, P1, t1, u, w;
    if (k < a) { P0 = A; t0 = tA; P1 = { x: xR, y: yR }; t1 = tR; u = k / Math.max(1e-4, a); w = a; }
    else { P0 = { x: xR, y: yR }; t0 = tR; P1 = Z; t1 = tZ; u = (k - a) / Math.max(1e-4, 1 - a); w = 1 - a; }
    loopPt.x = hermite(P0.x, t0[0] * w, P1.x, t1[0] * w, u);
    loopPt.y = hermite(P0.y, t0[1] * w, P1.y, t1[1] * w, u);
    loopPt.vx = hermiteD(P0.x, t0[0] * w, P1.x, t1[0] * w, u) / Math.max(1e-4, w);
    loopPt.vy = hermiteD(P0.y, t0[1] * w, P1.y, t1[1] * w, u) / Math.max(1e-4, w);
    return loopPt;
  }
  // E: the end of the card (where its feet leave it); B: the next section's spot.
  function ledgeFlight(s, E, B) {
    const up = ledge.mode === 'up';
    const C = up ? FLY_UP : FLY_DN;
    const r = up ? 1 - s : s; // through this flight, its own way
    const rWas = jr.lastP < 0 ? -1 : up ? 1 - jr.lastP : jr.lastP;
    const A = up ? B : E, Z = up ? E : B; // where it sets off, and where it lands
    const q = clamp01((r - C.T0) / (C.L - C.T0)); // through the flight
    // its pace along the way: down it is already on its way off the edge, up it springs
    // off from a standstill; either way it brakes to land (onto the card with a little
    // way still on)
    const k = up ? hermite(0, 0.55, 1, 0.15, q) : hermite(0, 1.3, 1, 0, q);
    const h = A.h + (Z.h - A.h) * smooth(q);
    const pt = loopAt(A, Z, k, up, h);
    const sp = Math.hypot(pt.vx, pt.vy) || 1;
    const cx = pt.vx / sp, cy = pt.vy / sp; // the way it goes (right +, down +)
    // into the flight off the start, and out of it into the flare
    const flyIn = smooth(clamp01(q / (up ? 0.2 : 0.1)));
    const flare = smooth(clamp01((q - 0.7) / 0.3));
    const lvl = smooth(clamp01(Math.abs(cx) * 1.15)) * flyIn * (1 - flare); // laid out level
    const e = clamp01((r - C.L) / (1 - C.L)); // the landing, once down
    const P = jr.pose || (jr.pose = newPose());
    jr.on = true;
    vel.x = vel.y = 0;
    jr.spin = 0;
    jr.hop = 0;
    jr.pitch = 0;
    jr.squash = 0;

    // where, and which way it faces: the way it goes (turned to the visitor going
    // straight up or down, round the turn), from the way it stood and to the way it will
    let yaw = YAW.fly * clamp(cx * 1.8, -1, 1);
    if (r < C.T0) {
      at.x = A.x; at.y = A.y; at.h = A.h; at.yaw = A.yaw;
    } else if (r < C.L) {
      at.x = pt.x; at.y = pt.y; at.h = h;
      at.yaw = A.yaw + wrapPi(yaw - A.yaw) * smooth(clamp01(q / (up ? 0.22 : 0.12)));
    } else {
      at.x = Z.x; at.y = Z.y; at.h = Z.h;
      at.yaw = yaw + wrapPi(Z.yaw - yaw) * smooth(clamp01(e / (up ? 0.6 : 1)));
    }
    snapAt();

    // how: level in flight, upright round the turn and banked into it, leaning back
    // into the flare; crouched for the spring and for the touchdown
    if (r < C.T0) {
      const u = r / Math.max(1e-4, C.T0);
      mixPose(P, POSE.crouch, POSE.crouch, 0);
      jr.w = smooth(clamp01(u / 0.7));
      jr.pin = 1;
      jr.air = jr.tilt = jr.fly = jr.bank = 0;
      jr.pitch = 0.16 * Math.sin(Math.PI * u);
      jr.squash = 0.07 * Math.sin(Math.PI * u);
      jr.jet = 0.4 * smooth(u);
      jr.floor = A.floor || null;
    } else if (r < C.L) {
      if (up) mixPose(P, POSE.crouch, POSE.hover, smooth(clamp01(q / 0.18)));
      else mixPose(P, POSE.hang, POSE.hover, smooth(clamp01(q / 0.2)));
      if (lvl > 0) mixPose(P, P, POSE.fly, lvl * 0.9);
      const ready = smooth(clamp01((q - 0.72) / 0.28));
      if (ready > 0) mixPose(P, P, POSE.crouch, ready * 0.75);
      // (down, straight out of the run's clip into the flight)
      jr.w = up ? 1 : smooth(clamp01(s / 0.05));
      jr.pin = Math.max(up ? 1 - smooth(clamp01(q / 0.12)) : 0, smooth(clamp01((q - 0.86) / 0.14)));
      jr.tilt = TILT.hover * flyIn * (1 - flare) + (TILT.fly - TILT.hover) * lvl - 0.3 * flare * (1 - smooth(clamp01((q - 0.94) / 0.06)));
      jr.fly = lvl;
      jr.air = (0.25 + 0.25 * lvl) * flyIn * (1 - smooth(clamp01((q - 0.85) / 0.15)));
      // round the turn (going up or down, the turn's middle to its left), leaning into it
      jr.bank = 0.4 * (1 - Math.abs(cx)) * flyIn * (1 - flare);
      // the jets: a hard burn off the floor (or out of the run), a cruise, more climbing,
      // and hard again braking for the touchdown
      const climb = Math.max(0, -cy);
      jr.jet = 0.55 + 0.3 * lvl + 0.35 * climb + 0.45 * (1 - smooth(clamp01(q / 0.2))) + 0.55 * flare;
      jr.floor = r >= C.L - 0.02 && Z.floor ? Z.floor : null;
      // it looks where it is going
      [glance.x, glance.y] = [at.x + cx * h * 2.2, at.y - h * 0.6 + cy * h * 2.2];
      glance.until = performance.now() + 150;
    } else {
      mixPose(P, POSE.crouch, POSE.crouch, 0);
      jr.w = 1 - smooth(e);
      jr.pin = 1;
      jr.air = jr.tilt = jr.fly = jr.bank = 0;
      jr.squash = 0.1 * Math.sin(Math.PI * Math.min(1, e * 2.4)) * (1 - e);
      jr.jet = 0.5 * (1 - smooth(clamp01(e / 0.35)));
      jr.floor = Z.floor || null;
    }
    if (baseName !== 'idle') { baseName = 'idle'; if (!oneShot) fadeTo('idle', 0.12); }
    // heard: the spring off the floor, the touchdown
    if (up && rWas >= 0 && rWas < C.T0 && r >= C.T0) sfx('takeoff');
    if (rWas >= 0 && rWas < C.L && r >= C.L) { touchdown('feet'); sfx('land'); }
    head.face = 0; // (its facing is laid out here: no turning round on its own)
    ledge.fromAir = up && r > C.L - 0.02;
    jr.lastP = s;
  }
  function ledgeExit(p, idB, dt) {
    const F = anchorFor('projetos'); // its footing on the card, held at the deck's resting height
    const node = nodes.projects[nodes.projects.length - 1];
    const card = lastCase();
    const r = card.getBoundingClientRect();
    const h = F.h;
    const xEdge = r.right + h * 0.08; // where its feet leave the card
    const YAW_RUN = 1.15; // facing its way
    if (p > LEDGE.edge) {
      // Off the edge, flying (see above). Whatever of it overlaps the case is hidden
      // behind it (drawn by maskTunnel).
      const s = (p - LEDGE.edge) / (1 - LEDGE.edge);
      const floor = { node, u: clamp01((xEdge - r.left) / Math.max(1, r.width)), x: xEdge, y: F.y, h };
      // (the next section's spot jumps aside once the case rides up off it: the flight
      // eases over to it instead of being thrown across)
      const B = anchorFor(idB, true), now = performance.now();
      if (!ledge.B || now - ledge.bAt > 120) ledge.B = { ...B };
      else {
        const k = damp(s > 0.9 || s < 0.1 ? 9 : 4, dt);
        ledge.B.x += (B.x - ledge.B.x) * k;
        ledge.B.y += (B.y - ledge.B.y) * k;
        ledge.B.h += (B.h - ledge.B.h) * k;
        ledge.B.yaw = B.yaw;
      }
      ledge.bAt = now;
      ledgeFlight(s, { x: xEdge, y: F.y, h, yaw: ledge.mode === 'up' ? -YAW_RUN : YAW_RUN * ledge.face, floor }, ledge.B);
      ledge.carry = card;
      ledge.lastP = -1;
      return;
    }
    ledge.drove = true;
    ledge.carry = null;
    // (back on the card afresh: nothing left over from the last time; landed on it from
    // the flight up, it faces back along it)
    if (ledge.lastP < 0) { ledge.still = 0; ledge.v = 0; ledge.face = ledge.fromAir ? -1 : 1; }
    ledge.fromAir = false;
    ledge.mode = 'down';
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

  // Click: a soft cloud breathes out of the chest (silent: the voice that comes
  // with it is what is heard)
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
      // (the contact card out of its place: where it belongs, not off the screen's edge)
      const r = focusTarget === nodes.terminal ? homeRect() : focusTarget.getBoundingClientRect();
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
    // On an open case (see stepPerch): sat on the top edge of its card, the thighs out
    // over the edge and the shins hanging from the knees, free to swing (dangle: how much
    // of the shins is the swing's: see stepLegs). Its right hand has the X (perchHold).
    perch: { pitch: -0.08, thigh: [0.15, -0.1, 1], shin: [0.08, -1, 0.1], kick: 0, flat: 0, up: 0, back: 0, scull: 0, seat: 0, push: 0, dangle: 1 },
  };
  const POSE_KEYS = ['pitch', 'kick', 'flat', 'up', 'back', 'lead', 'scull', 'seat', 'push', 'dangle'];
  function newPose() { return { pitch: 0, thigh: [0, -1, 0], shin: [0, -1, 0], kick: 0, flat: 0, up: 0, back: 0, lead: 0, scull: 0, seat: 0, push: 0, dangle: 0 }; }
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
    const dangle = P.dangle || 0;
    legs.forEach((leg, i) => {
      const s = leg.side;
      const kick = P.kick * Math.sin(time * 4.4 + (s > 0 ? 0 : Math.PI));
      leg.upper.getWorldPosition(vT).add(modelDir(P.thigh[0] * s, P.thigh[1], P.thigh[2] + 0.22 * kick, vD));
      swing(leg.upper, leg.lower, vT, w);
      // (sat on an edge, the shin hangs from the knee at the angle its swing has it,
      // a touch forward of straight down at rest)
      const a = perch.legs[i].a + PERCH.rest;
      const sx = P.shin[0] * s, sy = P.shin[1], sz = P.shin[2] + 0.3 * kick;
      leg.lower.getWorldPosition(vT).add(modelDir(sx, sy + (-Math.cos(a) - sy) * dangle, sz + (Math.sin(a) - sz) * dangle, vD));
      swing(leg.lower, leg.end, vT, w);
    });
    plantFeet(w, P.flat);
    // (and the foot trails the shin: toes down as it swings forward, up on the way back)
    if (dangle > 0) legs.forEach((leg, i) => turnBone(leg.foot, modelDir(1, 0, 0, vD), clamp(perch.legs[i].v * 0.07, -0.45, 0.45) * dangle * w));
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
  // sat on an edge: what it sits on (just under the hip joints) down onto it, weighted
  function pinSeat(w) {
    if (w < 0.001) return;
    root.updateMatrixWorld(true);
    let y = 0;
    for (const leg of legs) y += root.worldToLocal(leg.upper.getWorldPosition(vPin)).y / legs.length;
    pivot.position.y -= (y - PERCH.pad * modelH) * w;
    pivot.updateMatrixWorld(true);
  }
  function applyRig() {
    if (!rigOK || reduced || view.dock) return;
    if (dbg.pose && POSE[dbg.pose]) { applyPose(POSE[dbg.pose], 1); if (dbg.pose !== 'fly' && dbg.pose !== 'hover') pinToFloor(1); return; } // QA
    if (jr.on && jr.pose) {
      applyPose(jr.pose, jr.w);
      pinToFloor(jr.pin);
      pinSeat(perch.seat);
      if (jr.hop) { pivot.position.y += jr.hop; pivot.updateMatrixWorld(true); }
    }
    blendSnap();
  }

  // world -> canvas px (inverse of toWorld)
  function toCanvas(v) {
    const k = (CAM_Z - v.z) / CAM_Z;
    return [v.x / (view.wpp * k) + view.w / 2, view.h / 2 - v.y / (view.wpp * k)];
  }

  // Contact: the guide brings the card in. Out of sight, the card waits off the left
  // edge of the screen (parked whenever its place is out of view, so it is never seen
  // going). Once the guide is at Conexão with that place in view, it flies off to the
  // left to fetch it (fetch), comes back pushing it across to its place with both
  // hands on its left edge (push), and turns into the hold, its far arm going round
  // behind the card (tuck). Taken away midway (a jump, the scroll back up), it leaves
  // the card to glide on into place by itself, or still parked if none of it shows.
  //   fetch, push, tuck  the legs (s)   gap  hands to feet, across (body heights)
  //   lean  into the push (tilt, rad)   yaw  facing the card as it pushes
  //   show  the place in view enough to bring it in: its top above this share of the screen
  // (show: low enough that its shoulders, kept above the screen's bottom, come level
  // with the card's side rather than its top corner)
  const DELIV = { fetch: 0.62, push: 1.6, tuck: 0.7, gap: 0.37, lean: 0.62, yaw: 1.2, show: 0.6 };
  // pushing on the jets: legs trailing and paddling, the body leaning into the card
  const POSE_PUSH = { pitch: 0.18, thigh: [0.12, -0.95, -0.2], shin: [0.07, -0.98, -0.18], kick: 0.55, flat: 0, up: 0, back: 0, lead: 0, scull: 0, seat: 0, push: 1 };
  const delivBusy = () => deliv.st === 'fetch' || deliv.st === 'push' || deliv.st === 'tuck';
  const delivOn = () => !!nodes.terminal && !reduced && !view.dock;
  const holdH = () => Math.min(view.h * 0.24, 220); // (its size at the card: see anchorFor)
  // parked: far enough off the left edge for the guide behind it to be out of sight too
  const parkX = (home, h) => -(home.right + (DELIV.gap + 0.9) * h);
  // about to be fetched, with its place already in view (see greet)
  function delivSoon() {
    return delivOn() && deliv.st === 'parked' && homeRect().top < window.innerHeight * DELIV.show;
  }
  // a leg cut short with the guide away from its spot (off the left edge, or out
  // pushing): it flies back to it on the jets, not drifting there upright
  function delivReturn() {
    const B = anchorFor('contato');
    if (section === 'contato' && !trans && Math.hypot(B.x - at.x, B.y - at.y) > holdH() * 0.6) hopTo('contato', 'contato', 'fall');
  }
  // a field focused while it is out of sight (the keyboard can't scroll sideways to it):
  // the card straight to its place. (Clicked, or already in view on the card sliding in,
  // the push goes on: the card doesn't jump from under the pointer.)
  function deliverNow(field, byPointer) {
    if (deliv.st === 'home') return;
    if (deliv.st !== 'parked' && deliv.st !== 'fetch') {
      const f = field && field.getBoundingClientRect();
      if (byPointer || (f && f.left >= 0)) return;
    }
    const was = delivBusy();
    deliv.st = 'home';
    deliv.x = 0;
    if (was) delivReturn();
  }
  function stepDeliver(dt) {
    if (!delivOn()) { deliv.st = 'home'; deliv.x = 0; return; }
    const home = homeRect(), vh = window.innerHeight, h = holdH();
    // taken away midway: on into place by itself (at the pace it had), or still parked
    // if none of it shows
    if (delivBusy() && (trans || jr.on || section !== 'contato')) deliv.st = home.right + deliv.x <= 0 ? 'parked' : deliv.st === 'push' ? 'slide' : 'home';
    // its place scrolled back out of view before it got there: parked again (none of it
    // shows; with a field in it focused, on into place instead), and the guide back to
    // its spot to wait
    if ((deliv.st === 'fetch' || deliv.st === 'push' || deliv.st === 'slide') && home.top >= vh) {
      const busy = delivBusy();
      deliv.st = !formFocused() ? 'parked' : deliv.st === 'fetch' ? 'home' : 'slide';
      if (busy) delivReturn();
    }
    if (deliv.st === 'slide') {
      deliv.t += dt;
      const u = clamp01(deliv.t / DELIV.push);
      deliv.x = Math.min(0, hermite(deliv.X0, -deliv.X0 * 1.2, 0, 0, u));
      if (u < 1) return;
      deliv.st = 'home';
      deliv.x = 0;
    }
    if (deliv.st === 'home') {
      if (deliv.x !== 0) {
        deliv.x *= 1 - damp(5, dt);
        if (deliv.x > -0.5) deliv.x = 0;
      }
      // its place out of view: parked off the left edge, ready to be brought in (and
      // its one-shot reveal spent now, so it never plays in the middle of the push)
      if ((home.top >= vh || home.bottom <= 0) && !formFocused()) {
        deliv.st = 'parked';
        nodes.terminal.classList.add('is-in');
      } else return;
    }
    if (deliv.st === 'parked') {
      deliv.x = parkX(home, h);
      const near = goal && Math.hypot(goal.x - at.x, goal.y - at.y) < h * 0.6;
      if (section !== 'contato' || trans || jr.on || scrub.mid || !goal || !goal.clear || !near || home.top >= vh * DELIV.show) return;
      // (a hello still going when the place comes into view: cut short, off it goes)
      if (oneShot) { oneShot = false; fadeTo(baseName, 0.3); }
      deliv.st = 'fetch';
      deliv.t = 0;
      deliv.from = { x: at.x, y: at.y, yaw: at.yaw };
      snapRig(); // (out of the float, the drift and the lean, blended, not in one frame)
    }
    // a leg: it has the frame (no resting spring), on the clock
    deliv.t += dt;
    const holdY = Math.min(home.bottom + h * 0.16, view.h * 0.96);
    const P = jr.pose || (jr.pose = newPose());
    jr.on = true;
    vel.x = vel.y = 0;
    jr.pin = jr.spin = jr.bank = jr.hop = jr.squash = jr.pitch = 0;
    jr.floor = null;
    head.face = 0; // (its facing is laid out here: no turning round on its own)
    at.h = h;
    if (deliv.st === 'fetch') {
      // off to the left from a standstill, turning to face that way and laying itself
      // out level, out past the edge
      const u = clamp01(deliv.t / DELIV.fetch), A = deliv.from, xOut = -h * 1.1;
      at.x = hermite(A.x, 0, xOut, (xOut - A.x) * 1.8, u);
      at.y = A.y + (holdY - A.y) * smooth(u) - h * 0.1 * Math.sin(Math.PI * u);
      at.yaw = A.yaw + wrapPi(-YAW.fly - A.yaw) * smooth(clamp01(u / 0.3));
      const lvl = smooth(clamp01((u - 0.12) / 0.45));
      mixPose(P, POSE.hover, POSE.fly, lvl);
      jr.w = smooth(clamp01(u / 0.15));
      jr.tilt = TILT.hover + (TILT.fly * 0.85 - TILT.hover) * lvl;
      jr.fly = lvl;
      jr.air = 0.3 * lvl;
      jr.jet = 0.55 + 0.45 * smooth(clamp01(u / 0.3));
      [glance.x, glance.y] = [at.x - h * 3, at.y - h * 0.6];
      glance.until = performance.now() + 150;
      if (u < 1) return;
      // (out of sight: round behind the card, facing back the way it came, the card
      // brought up to just off the edge so it shows at once)
      deliv.st = 'push';
      deliv.t = 0;
      deliv.X0 = -(home.right + 0.2 * h);
    }
    if (deliv.st === 'push') {
      // the card: in briskly from just off the left edge, slowing all the way into its
      // place; the guide behind it, hands on its edge, leaning in on the jets and easing
      // off (the start's pace no more than 3x the way's, or it would overshoot)
      const u = clamp01(deliv.t / DELIV.push);
      deliv.x = Math.min(0, hermite(deliv.X0, -deliv.X0 * 1.2, 0, 0, u));
      const ease = smooth(clamp01((u - 0.5) / 0.5)); // (braking into its place)
      at.x = home.left + deliv.x - DELIV.gap * h;
      at.y = holdY;
      at.yaw = DELIV.yaw;
      mixPose(P, POSE_PUSH, POSE_PUSH, 0);
      jr.w = 1;
      jr.tilt = DELIV.lean * (1 - 0.4 * ease);
      jr.fly = 0;
      jr.air = 0.12;
      jr.jet = 0.95 - 0.5 * ease;
      [glance.x, glance.y] = [home.left + deliv.x + h, at.y - h * 0.55];
      glance.until = performance.now() + 150;
      if (u < 1) return;
      // in its place: a last shove carries it a touch on, and it springs back
      deliv.x = 0;
      tug.v -= 3.4;
      sfx('card-tug');
      deliv.st = 'tuck';
      deliv.t = 0;
    }
    // tuck: into the hold, its far arm round behind the card (see gripCard)
    const u = clamp01(deliv.t / DELIV.tuck), k = smooth(u);
    const B = anchorFor('contato');
    at.x = home.left - DELIV.gap * h + (B.x - (home.left - DELIV.gap * h)) * k;
    at.y = holdY;
    at.yaw = DELIV.yaw + wrapPi(B.yaw - DELIV.yaw) * k;
    mixPose(P, POSE_PUSH, POSE_PUSH, 0);
    jr.w = 1 - k;
    jr.tilt = DELIV.lean * 0.6 * (1 - k);
    jr.fly = 0;
    jr.air = 0.12 * (1 - k);
    jr.jet = 0.45 * (1 - smooth(clamp01(u / 0.7)));
    if (u < 1) return;
    // holding it: the rest is gripCard's, as on any arrival (hands already on it)
    deliv.st = 'home';
    goal = anchorFor('contato');
    snapTo(goal);
    grip.w = 1;
  }

  // Contact: it holds the terminal card by its left edge. When the focus moves to
  // another field it gives the card a jolt, as if it had moved the cursor itself.
  const gripTo = new THREE.Vector3();
  function gripCard(dt) {
    tug.v += (-tug.x * 60 - tug.v * 4.2) * dt;
    tug.x += tug.v * dt;
    const card = nodes.terminal;
    const here = section === 'contato' && !view.dock && card;
    // the card wobbles with the jolt, and stands off its place while it is brought in
    // (individual transform properties compose with the card's own transform and
    // transitions; this is the one place that writes them)
    const wobble = here && !reduced && (Math.abs(tug.x) > 0.002 || Math.abs(tug.v) > 0.02);
    if (card && (wobble || deliv.x !== 0)) {
      const tx = deliv.x - (wobble ? tug.x * 16 : 0), ty = wobble ? tug.x * 4 : 0;
      const tr = `${tx.toFixed(2)}px ${ty.toFixed(2)}px`, ro = wobble ? `${(-tug.x * 2.6).toFixed(3)}deg` : '';
      if (tr !== cardTr) { card.style.translate = tr; cardTr = tr; } // (parked, it is the same every frame)
      if (ro !== cardRo) { card.style.rotate = ro; cardRo = ro; }
      cardDX = deliv.x;
      cardStyled = true;
    } else if (cardStyled) {
      card.style.translate = '';
      card.style.rotate = '';
      cardTr = cardRo = '';
      cardDX = 0;
      cardStyled = false;
    }
    if (card) {
      const wc = deliv.st === 'push' || deliv.st === 'slide' ? 'translate' : ''; // (a layer of its own only while it slides)
      if (card.style.willChange !== wc) card.style.willChange = wc;
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
    // (pushing the card in, both hands stay in view on its edge; the far one goes round
    // behind it as it turns into the hold)
    const pushing = here && (deliv.st === 'push' || deliv.st === 'tuck');
    const tk = deliv.st === 'tuck' ? smooth(clamp01(deliv.t / DELIV.tuck)) : 0;
    const atCard = card && !view.dock && (here
      ? (deliv.st === 'tuck' && tk > 0.15) || (goal && goal.grip && !hopFlying && (!jr.on || jr.air < 0.3))
      : trans && trans.from === 'contato' && (trans.phase === 'out' || (hopFlying && jr.air < 0.3)));
    shared.uCardOn.value = atCard ? 1 : 0;
    if (!card || view.dock || (!atCard && !pushing && grip.w < 0.01)) return;
    // (parked as the hands let go, scrolling away, or off to fetch it: they let go of
    // where it was, not reach after it off the left edge)
    const r = deliv.st === 'parked' || deliv.st === 'fetch' ? homeRect() : card.getBoundingClientRect();
    const [ox, oy] = clientToCanvas(r.left, r.top);
    const pr = renderer.getPixelRatio();
    shared.uCardRect.value.set(ox * pr, (view.h - oy - r.height) * pr, (ox + r.width) * pr, (view.h - oy) * pr);
    if (pushing && arms.length) {
      // both hands flat on the card's left edge at shoulder height (the far one just
      // short of it, so none of it is cut off yet), then (tuck) on to where they hold
      // it: the far one round behind the edge, slipping out of sight as it goes (the
      // clip comes on just as it reaches the edge, see atCard), the near one lower, in front
      const k = tk;
      arms.forEach((arm, i) => {
        arm[0].getWorldPosition(kS);
        const [, sy] = toCanvas(kS);
        const yP = sy + at.h * (i === 0 ? -0.01 : 0.05), yH = sy + at.h * (i === 0 ? 0.02 : 0.12);
        const xP = ox + (i === 0 ? -at.h * 0.03 : 3), xH = i === 0 ? ox + at.h * 0.1 : ox + 7;
        toWorld(xP + (xH - xP) * k, clamp(yP + (yH - yP) * k, oy + 18, oy + r.height - 18), kS.z, gripTo);
        reach(arm, gripTo, 1);
      });
      return;
    }
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
  // A step is heard as it is seen, not as the clip has it: the run is held down on the
  // card (see update), so the body hardly leaves it, and what shows of a stride is a foot
  // lifted clear of the card and brought down again. So each foot is followed by how high
  // it stands above the card on the screen (in body heights): once clear of it (up), it is
  // down when it reaches the card (down), or stops coming down just above it (near, at
  // less than still a second: the foot it glides on through the leap).
  const STEP = { up: 0.05, near: 0.035, down: 0.012, still: 0.6 };
  const heard = { x: NaN, y: 0, v: 0, fast: false, feet: [0, 1].map(() => ({ y: NaN, up: false })) };
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
    // a step: a foot that was up off the card, down on it again
    for (let i = 0; i < 2; i++) {
      const F = heard.feet[i];
      if (!strides || !Number.isFinite(footLow[i])) {
        F.y = NaN;
        F.up = false;
        continue;
      }
      // (the sole in the model, and where the body has been put over the card)
      const y = (footLow[i] - footRest + pivot.position.y) / modelH;
      const fall = Number.isNaN(F.y) ? Infinity : (F.y - y) / Math.max(dt, 1e-3);
      F.y = y;
      if (!F.up) {
        if (y > STEP.up) F.up = true;
      } else if (y < STEP.down || (y < STEP.near && fall < STEP.still)) {
        F.up = false;
        sfx('footstep');
      }
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
  // the poster. From there it stays with the case, in plain sight over the open scene
  // (see stageOver): it flies over to the case's card, takes the X off it in its right
  // hand and shoots straight up with it, on the jets and then on its own way: it slows,
  // lets the X go at the top (it drops onto the card's top edge and stands there) and
  // falls back down to sit on the edge beside it, at the corner
  // where the X was, its right arm down behind the X and only its fingers showing over
  // the rim, its legs swinging (stepPerch). The X is still the way to close the case:
  // closed, it flies back down and lands on the deck. The case's video waits for all of
  // that: sat, the guide brings up its left hand, a ring of light opens in its palm, and
  // it fires three quick bolts out of it into the video's play button; the video starts
  // on the last hit (perchBlast).
  // ---------------------------------------------------------------------------
  // The show as a timeline, in seconds: the ignition, the flight round to the front of
  // the card and into it, and hanging there a moment, thrown back.
  const FLY = { t0: 0.42, cross: 1.55, out: 0.6 }; // lift-off; into the poster (seconds after lift-off); thrown back off it, after that
  const STUNT = (() => {
    const segs = [];
    let t = 0;
    const add = (kind, d) => { segs.push({ kind, t0: t, d }); t += d; };
    add('ignite', FLY.t0); add('fly', FLY.cross + FLY.out);
    return { segs, end: t, dip: 0.012 }; // the card's bow (card heights)
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
    // On the last case's hold the scroll has it somewhere along the card, on its run to
    // the card's end: a journey as the scroll sees it, but it is on this card, on its
    // feet, and the show sets off from where it stands.
    const onLedge = scrub.mid && !trans && ledge.drove && jr.on && !!jr.floor && jr.floor.node === node;
    // (no show where the stage could not stay up over the open case: it opens straight away)
    if (reduced || view.dock || !rigOK || !canPerch || trans || (scrub.mid && !onLedge) || jumping || section !== 'projetos' || shared.uDissolve.value > 0.01) return null;
    const F = anchorFor('projetos', true);
    if (!F.floor || F.floor.node !== node) return null;
    const card = node.querySelector('.project-card') || node;
    holdCard(card);
    sink.drive = false;
    sink.target = 0;
    // a hello or a click reaction gives way to the show
    if (oneShot) { oneShot = false; fadeTo(baseName, 0.2); }
    snapRig();
    // (stopped mid-run, its legs come to a stand under the show's own poses)
    if (onLedge && baseName === 'run') { baseName = 'idle'; fadeTo('idle', 0.2); }
    // (x0: the pad, where it stands on the card: the deck's middle, or where its run had it)
    trans = { kind: 'case', t: 0, node, card, media: card.querySelector('.project-media') || card, sy: window.scrollY, x0: onLedge ? at.x : null, hit: false, giveFrom: 0, opened: false, done: null, rnd: Array.from({ length: 8 }, Math.random) };
    markInput(); // full frame rate for the show
    return new Promise((res) => { trans.done = res; });
  }
  // (a second click: open now, wherever the show has got to)
  function caseNow() {
    if (!trans || trans.kind !== 'case' || trans.opened) return;
    stageOver(true); // (it goes over to the case from wherever it is: see stepStunt)
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
    if (S.perch) perchEnd();
    else if (S.opened) playRelease(); // (off between the hit and setting out for the case: the same)
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
    // The case is opening: thrown back off the poster (or from wherever it is, opened by
    // a second click on the way), it goes over to the case's card and sits on it.
    if (S.opened && !S.perch && (!S.burst || S.t >= FLY.t0 + FLY.cross + PERCH.recoil)) beginPerch(S);
    if (S.perch) { stepPerch(S, dt, open); return; }
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
    const x0 = S.x0 != null ? S.x0 : F.x;
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
      const A = fit(x0 + dir * h * 0.2, c0 - h * 0.45, s1, true);
      const B = fit(mx + dir * h * Math.min(1.4 + R[1] * 1.0, room(dir) - 0.7), c0 + h * (R[2] * 0.6 - 0.1), s2);
      const across = R[4] < 0.4; // (round in front of the card to its other side first)
      const C = fit(mx + dir * h * (across ? -(0.6 + R[5] * 0.6) : 0.45 + R[5] * 0.5), my + h * (0.15 + R[7] * 0.5), 1.18);
      const X = FLY.cross;
      S.dir = dir;
      S.push = Math.sign(mx - C[0]) || -dir; // (the way it comes into the poster: the deck is shoved on that way)
      S.path = flightPath([
        [0, x0, c0, 1],
        [0.38, A[0], A[1], s1],
        [0.8, B[0], B[1], s2],
        [1.18, C[0], C[1], 1.18],
        [X - 0.13, mx + (C[0] - mx) * 0.3, my + h * 0.08, 1.07],
        [X, mx, my, 1],
        [X + 0.14, mx + dir * h * 0.3, my - h * 0.3, 1.14], // (thrown back off the poster, toward us)
        [X + FLY.out, mx + dir * h * 0.42, my - h * 0.5, 1.1], // (and hanging there on its jets, should the case be slow to open)
      ], mx, my);
    }
    let cx = x0, cy = F.y - h * BODY_C, size = h, yaw = -0.12, tiltA = 0, spin = 0, bank = 0, thrust = 0, hit = false;
    sink.drive = false;
    sink.target = 0;
    jr.squash = 0;
    if (seg.kind === 'ignite') { // crouched, the jets coughing into life, the card bowing under the thrust
      const sq = smooth(clamp01(u / 0.5));
      mixPose(P, POSE.stand, POSE.squat, sq);
      jr.squash = 0.08 * sq;
      thrust = (0.25 + 0.6 * u) * (u < 0.7 ? 0.55 + 0.45 * Math.abs(Math.sin(time * 31) * Math.sin(time * 17)) : 1);
      sink.target = STUNT.dip * 2.4 * cardH * sq;
      cx = x0 + h * 0.012 * Math.sin(time * 70) * u; // shaking on the pad
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
      thrust = 1 + 0.4 * smooth(clamp01((f - FLY.cross + 0.15) / 0.3)) * (1 - smooth(clamp01((f - FLY.cross - 0.1) / 0.2))); // (full burn into the hit)
      jr.squash = -0.08 * Math.sin(Math.PI * clamp01(f / 0.18)) + 0.1 * Math.sin(Math.PI * clamp01((f - FLY.cross) / 0.16)); // (flattened by the hit)
      if (f >= FLY.cross) sink.target = STUNT.dip * 6 * cardH * (1 - smooth(clamp01((f - FLY.cross) / 0.3))); // (the poster takes the blow)
      hit = f >= FLY.cross;
    }
    holdCard(S.card); // (the spring lets go of a card at rest: in the air, say)
    stepSink(dt);
    // The hit: light bursts out of the poster, the deck is shoved the way it came, and
    // the case opens, all in the same beat; the stage stays up, over the scene.
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
        stageOver(true);
        S.opened = true;
        const f = S.done;
        S.done = null;
        if (f) f(true);
      }
    }
    // (how fast it goes across the screen: the flight over to the case sets off at that)
    const ox = at.x, oy = at.y, moved = S.t > dt && dt > 1e-4;
    at.x = cx;
    at.y = cy + size * BODY_C; // (its feet: what the root is placed by)
    at.h = size;
    at.yaw = seg.kind === 'ignite' ? at.yaw + wrapPi(-0.12 - at.yaw) * damp(5, dt) : yaw;
    snapAt();
    S.vx = moved ? clamp((at.x - ox) / dt, -900, 900) : 0;
    S.vy = moved ? clamp((at.y - oy) / dt, -900, 900) : 0;
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

  // ---------------------------------------------------------------------------
  // On the open case: sat on its card, holding the X
  // ---------------------------------------------------------------------------
  // The stage over an open case. A scene is a modal dialog, in the top layer, over
  // everything else on the page: for the show the stage stays up (is-over: its own layer
  // in the scene's View Transition too) and goes into the top layer itself, as a popover
  // shown after the dialog, so it is drawn over it. It takes no clicks there either.
  const canPerch = typeof canvas.showPopover === 'function';
  const stage = { over: false, top: false };
  function stageLift(on) {
    if (stage.top === on) return;
    stage.top = on;
    try {
      if (on) {
        canvas.setAttribute('popover', 'manual');
        canvas.showPopover();
      } else canvas.removeAttribute('popover'); // (which takes it out of the top layer)
    } catch (e) {
      canvas.removeAttribute('popover');
      stage.top = false;
    }
  }
  function stageOver(on) {
    stage.over = on;
    canvas.classList.toggle('is-over', on);
    if (!on) stageLift(false);
  }
  //   h      its size sat there (px): as big as the room over the card lets it be
  //   top    sat, how far its crown stands above the edge (body heights)
  //   pad    from its hip joints down to what it sits on (body heights)
  //   off    it sits this far to the right of where the X was (body heights; no further
  //          than the card goes)
  //   yaw    sat, turned this far out over the corner: its right arm is the near one, its
  //          legs hang past the card's end and their swing shows from the side
  //   arm    how far out from its shoulder it carries the X, by its rim (body heights)
  //   side   the X stands this far from its middle, against its side (body heights)
  //   lean   how far the X leans toward it, stood on the edge (rad)
  //   rest   where the shins hang at rest, forward of straight down (rad)
  //   recoil thrown back off the poster this long before it sets off (s)
  //   fly    the flight over to the X (s: the least and the most, by how far it is)
  //   grav   what pulls it back down, once it has the X and has shot up with it (px/s²)
  //   drop   how far up that climb it lets the X go (of the time to its top)
  //   wait   how long it waits for the case to open before it goes back down (s)
  const PERCH = { h: [84, 124], top: 0.73, pad: 0.045, off: 0.3, yaw: 0.42, arm: 0.3, side: 0.19, lean: 0.12, rest: 0.14, recoil: 0.16, fly: [0.8, 1.2], grav: 950, drop: 0.92, wait: 0.8 };
  // (seat: how much of its weight is on the edge; legs: each shin's swing, angle and
  // rate; clock: the swing's own time)
  const perch = { seat: 0, legs: [{ a: 0, v: 0 }, { a: 0, v: 0 }], clock: 0 };
  const sceneEl = document.getElementById('project-dialog');
  const infoEl = sceneEl ? sceneEl.querySelector('.detail-info') : null;
  const closeEl = infoEl ? infoEl.querySelector('.close-btn') : null;
  const playEl = sceneEl ? sceneEl.querySelector('.scene-play') : null;
  // Where the X belongs on the case's card (its middle, wherever the guide has it now),
  // the card's top edge and its right end, on the canvas. Null until the scene is laid out.
  function perchSpot() {
    if (!closeEl || !sceneEl.open) return null;
    const r = infoEl.getBoundingClientRect();
    if (r.width < 1) return null;
    const half = closeEl.offsetWidth / 2;
    const [x, y] = clientToCanvas(r.left + infoEl.clientLeft + closeEl.offsetLeft + half, r.top + infoEl.clientTop + closeEl.offsetTop + closeEl.offsetHeight / 2);
    const [right, top] = clientToCanvas(r.right, r.top);
    return { x, y, top, right, half };
  }
  // Room for it over the card: its size there, by how far the card's top is from the
  // screen's. Where even the smallest would not fit (a short window), the scene makes
  // room: its top padding grows until the card is far enough down (the scene scrolls,
  // should that be more than the window has).
  function perchRoom(G) {
    const need = PERCH.top * PERCH.h[0] + 14;
    let top = G.top;
    if (top < need - 0.5) {
      // (centred, the card comes down by half of what is added; once the scene overflows,
      // by all of it: a few goes get it there without ever overshooting)
      let pad = parseFloat(getComputedStyle(sceneEl).paddingTop) || 0;
      for (let n = 0; n < 6 && top < need - 0.5; n++) {
        pad += need - top;
        sceneEl.style.paddingTop = `${pad.toFixed(1)}px`;
        const g = perchSpot();
        if (!g) break;
        top = g.top;
      }
    }
    return clamp((top - 14) / PERCH.top, PERCH.h[0], PERCH.h[1]);
  }
  function beginPerch(S) {
    if (!S.hit) { S.hit = true; touchdown('feet'); sfx('jet-burst'); } // (opened while it was still on the pad: off it goes)
    snapRig(); // (out of the show's flight, not cut from it)
    // (X: the case's X once it has it: where it is, how fast it goes, how far it leans
    // and turns; free: let go of; down: it has hit the edge)
    S.perch = { st: 'wait', t: 0, u: 0, A: null, hp: at.h, dur: 1, v0: 0, up: 1, bx: 0, rk: null, fired: false, vx: S.vx || 0, vy: S.vy || 0, px: at.x, pv: 0, ax: 0, reach: 0, got: false, take: 0, set: 0, sq: 0, sqv: 0, sat: 0, X: { x: 0, y: 0, vx: 0, vy: 0, a: 0, va: 0, free: false, down: false } };
    for (const L of perch.legs) L.a = L.v = 0;
  }
  // (the scene as it was: the X back where it belongs, no room made over the card)
  function perchEnd() {
    perch.seat = 0;
    shared.uDisc.value.z = 0;
    blastOff();
    // (off before it fired, the case still open: the video starts all the same)
    playRelease();
    if (closeEl) closeEl.style.translate = closeEl.style.rotate = '';
    if (sceneEl) sceneEl.style.paddingTop = '';
  }
  // The case shut again (or it never opened): back down onto the deck, on the jets, a
  // journey like any other.
  function leavePerch() {
    const back = section === 'projetos' && !view.dock && !reduced;
    endStunt(false);
    if (back) hopTo('projetos', 'projetos', 'hover');
  }
  // A click on it, sat on the case (the stage takes none: the page asks, so that one on
  // the guide is not one beside the case, which would close it): it starts, and its legs
  // with it. True if the click was on it.
  function perchPoke(x, y) {
    const Q = trans && trans.kind === 'case' ? trans.perch : null;
    if (!Q || Q.st === 'wait') return false;
    const [cx, cy] = clientToCanvas(x, y);
    if (Math.abs(cx - at.x) > at.h * 0.36 || cy < at.y - at.h * 0.82 || cy > at.y + at.h * 0.32) return false;
    if (Q.st === 'sit') {
      Q.sqv += 1.3;
      perch.legs.forEach((L, i) => { L.v += i ? -2 : 2.4; });
      setFace('surprised', 0.8);
    }
    return true;
  }
  // The legs, sat on the edge: each shin is a pendulum hung from its knee. Gravity brings
  // it back down, the joint slows it, the seat's own motion throws it (acc: the seat's
  // pace changing, along the way the guide faces, over the shin's length), and the guide
  // kicks them idly (kick: how much it does), one a little after the other and never
  // quite in step, harder and softer by turns: pushed near the pace gravity gives them,
  // so they swing wide on little, and die down by themselves when it lets them be.
  // (g: gravity over the shin's length, 1/s²: a swing a second; drag: what slows it, 1/s;
  // push: its kick, rad/s²; stop: as far as the knee lets it go, rad, a soft stop there)
  const LEGS = { g: 38, drag: 1.5, push: 4.4, stop: 0.85 };
  function stepLegs(dt, acc, kick) {
    for (let n = dt; n > 1e-6; n -= 1 / 240) {
      const h = Math.min(n, 1 / 240);
      perch.clock += h;
      perch.legs.forEach((L, i) => {
        const push = kick * LEGS.push * (0.7 + 0.3 * Math.sin(perch.clock * 0.37 + i * 2.1)) * Math.sin(perch.clock * (5.85 + 0.25 * i) + i * Math.PI);
        const over = Math.max(0, Math.abs(L.a) - LEGS.stop) * Math.sign(L.a);
        L.v += (-LEGS.g * Math.sin(L.a) - LEGS.drag * L.v - acc * Math.cos(L.a) + push - over * 400 - (over ? L.v * 12 : 0)) * h;
        L.a += L.v * h;
      });
    }
  }
  function stepPerch(S, dt, open) {
    const Q = S.perch;
    Q.t += dt;
    if (open) S.seen = true;
    if (S.seen ? !open : Q.t > PERCH.wait) { leavePerch(); return; }
    let G = perchSpot();
    const P = jr.pose || (jr.pose = newPose());
    let thrust = 0.8, lean = 0, air = 0.5, seat = 0;
    if (Q.st === 'wait') {
      // the scene not laid out yet: it hangs on its jets where the poster threw it,
      // drifting to a stop
      const k = Math.exp(-4 * dt);
      at.x += Q.vx * dt;
      at.y += Q.vy * dt;
      Q.vx *= k;
      Q.vy *= k;
      mixPose(P, POSE.hover, POSE.hover, 0);
      if (G) {
        stageLift(false); // (over the scene, which has only just gone up itself)
        stageLift(true);
        Q.hp = perchRoom(G);
        G = perchSpot();
        if (G) {
          Q.A = { x: at.x, y: at.y, h: at.h, yaw: at.yaw, vx: Q.vx, vy: Q.vy };
          Q.dur = clamp(PERCH.fly[0] + Math.hypot(G.x - at.x, G.y - at.y) / 1500, PERCH.fly[0], PERCH.fly[1]);
          Q.st = 'fly';
        }
      }
    }
    if (Q.st !== 'wait' && !G) { leavePerch(); return; } // (the scene gone from under it)
    if (Q.st !== 'wait') {
      const hp = Q.hp;
      // Beside the X and a little under it, on its right, where its right hand comes to
      // its rim, rising past it. Then, the X in that hand, straight up on that line: a
      // burn that throws it up, and from there it is a thrown thing, slowing as it
      // climbs, stopped a moment at the top (as high as there is room for over the
      // card), and falling back, onto the card's top edge at the corner: to the right of
      // where the X was (it eases over to that on the way down).
      const gx = Math.min(G.x + hp * 0.38, view.w - hp * 0.35), gy = G.y + hp * 0.5; // (all but over where it will sit)
      const bx = Q.bx = Math.min(G.x + Math.max(G.half + 12, hp * PERCH.off), G.right - hp * 0.1), by = G.top;
      const rise = clamp(by - hp - 8, hp * 0.3, hp * 0.8); // (its head stays on the screen, where it can)
      const v0 = Math.sqrt(2 * PERCH.grav * (gy - by + rise)); // (thrown up at this, it tops out that far over the edge)
      const yawG = 0.15;
      if (Q.st === 'fly') {
        Q.u = Math.min(1, Q.u + dt / Q.dur);
        const u = Q.u, D = Q.dur, A = Q.A;
        at.x = hermite(A.x, A.vx * D, gx, 0, u);
        at.y = hermite(A.y, A.vy * D, gy, -0.6 * v0 * D, u); // (already on its way up as it takes it)
        at.h = A.h + (hp - A.h) * smooth(u);
        at.yaw = A.yaw + wrapPi(yawG - A.yaw) * smooth(clamp01(u / 0.8));
        mixPose(P, POSE.hover, POSE.hover, 0);
        Q.reach = smooth(clamp01((u - 0.5) / 0.45)); // (its right hand out to it as it comes up)
        lean = 0.3 * Math.sin(Math.PI * u);
        if (u >= 1) { // (it has it)
          Q.st = 'lift';
          Q.u = 0;
          Q.got = true;
          Q.v0 = v0;
          Q.up = v0 / PERCH.grav; // (the time to the top; and on down to the edge)
          Q.dur = Q.up + Math.sqrt((2 * rise) / PERCH.grav);
          sfx('card-tug');
        }
      } else if (Q.st === 'lift') {
        Q.u = Math.min(1, Q.u + dt / Q.dur);
        const u = Q.u, t = u * Q.dur, top = clamp01(t / Q.up);
        // (the throw, as it was set off; the card under it may have moved a little since)
        const y = gy - Q.v0 * t + 0.5 * PERCH.grav * t * t;
        at.x = gx + (bx - gx) * smooth(clamp01((t - Q.up) / Math.max(1e-3, Q.dur - Q.up)));
        at.y = u < 1 ? Math.min(y, gy) : by;
        at.h = hp;
        at.yaw = yawG + (PERCH.yaw - yawG) * smooth(clamp01((u - 0.3) / 0.6));
        seat = smooth(clamp01((t - Q.up) / Math.max(1e-3, Q.dur - Q.up) / 0.9));
        mixPose(P, POSE.hover, POSE.perch, seat);
        Q.take = smooth(clamp01(t / 0.16)); // (the X off its place, into the hand)
        if (top >= PERCH.drop) Q.X.free = true; // (let go of, all but at the top: it drops onto the edge)
        Q.set = smooth(clamp01((t - Q.up) / Math.max(1e-3, Q.dur - Q.up))); // (and the hand comes down behind it, onto its rim)
        // (the jets: a hard burn off the mark, dying as it climbs; nothing but its weight after)
        thrust = 1.1 * (1 - smooth(clamp01(top / 0.45)));
        air = 0.5 * (1 - seat);
        if (u >= 1) {
          // down on the edge: the body gives, the card under it too, and its legs are
          // carried on forward
          Q.st = 'sit';
          sfx('land');
          setFace('surprised', 0.5);
          Q.sqv = 2.4;
          holdCard(infoEl);
          sink.drive = false;
          sink.target = 0;
          sink.v += 230;
          perch.legs.forEach((L, i) => { L.v += 2 - 1.3 * i; }); // (one more than the other: out of step from the start)
        }
      } else {
        Q.sat += dt;
        at.x = bx;
        at.y = by;
        at.h = hp;
        at.yaw = PERCH.yaw;
        seat = 1;
        mixPose(P, POSE.perch, POSE.perch, 0);
        Q.take = Q.set = 1;
        Q.X.free = true;
        thrust = 0;
        air = 0;
      }
    }
    // the bump of sitting down, a stiff spring
    for (let n = dt; n > 1e-6; n -= 1 / 120) {
      const h = Math.min(n, 1 / 120);
      Q.sqv += (-Q.sq * 240 - Q.sqv * 15) * h;
      Q.sq += Q.sqv * h;
    }
    // its legs: thrown by the seat's motion, kicked idly once it has settled; and the
    // body rocks back a little against them
    const pv = dt > 1e-4 ? (at.x - Q.px) / dt : Q.pv;
    Q.ax += ((dt > 1e-4 ? (pv - Q.pv) / dt : 0) - Q.ax) * damp(18, dt);
    Q.px = at.x;
    Q.pv = pv;
    // (in flight they are the pose's, not the swing's: only what is on the edge is thrown)
    stepLegs(dt, seat * clamp((Q.ax * Math.sin(at.yaw)) / (0.2 * Q.hp), -40, 40), smooth(clamp01((Q.sat - 0.5) / 1.6)));
    P.pitch -= 0.035 * seat * (perch.legs[0].a + perch.legs[1].a);
    perch.seat = seat;
    stepSink(dt);
    vel.x = vel.y = 0;
    jr.on = true;
    jr.w = 1;
    jr.pin = 0;
    jr.air = air;
    jr.tilt = lean;
    jr.spin = 0;
    jr.bank = 0;
    jr.fly = 0;
    jr.pitch = 0;
    jr.squash = Q.sq;
    jr.hop = 0;
    jr.jet = thrust;
    jr.floor = null;
    seatLift = 0;
    // it has eyes for the X until it has it; sat, for the visitor (or their pointer)
    if (G && !Q.got) {
      [glance.x, glance.y] = [G.x, G.y];
      glance.until = performance.now() + 150;
    }
  }
  // What starts the case's video. Sat on the case, the guide brings its left hand up at
  // its side, clear of its head, and turns its palm out, between us and the video. In
  // the middle of the palm a port opens, set in the hand itself: a small iris, six
  // blades of the hand's own steel that turn as they draw back, a dark hole behind them
  // and a core in it that comes up white as it charges. Then three bolts out of it, one
  // after the other, straight off the palm and quick, each a streak with a trail of
  // motes, into the video's play button; the hand kicks with each. The last hit is a
  // click on that button: the page starts the video (app.js: holdVideo). Then the iris
  // shuts and the hand comes down: closed, nothing of it shows. Not fired at all if the
  // video is already running (the visitor started it); a click on the button meanwhile
  // is as good as the hit, and what is in the air fizzles out.
  //   wait   sat this long before the hand comes up (s);  open: the iris opening (s)
  //   charge the core coming up, before the first bolt (s);  gap: between bolts (s)
  //   pace   px a second;  len: a bolt's length; r: the port's radius (body heights: a
  //          hole in the palm, a good deal smaller than the hand);  at: where it is in
  //          the palm, from the wrist to the middle knuckle
  //   arc    how far each bolt goes over the straight line (a share of the distance)
  const BLAST = { wait: 0.5, open: 0.5, charge: 0.2, gap: 0.12, pace: 2300, len: 0.22, r: 0.036, at: 0.3, arc: [0.07, -0.03, 0.12], shut: 0.3 };
  const blast = (() => {
    const lit = (color, opacity) => new THREE.MeshBasicMaterial({ color, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false, side: THREE.DoubleSide });
    // (drawn over the hand it is set in, back to front in this order)
    const over = (m) => Object.assign(m, { transparent: true, depthTest: false, depthWrite: false, side: THREE.DoubleSide });
    const WHITE = 0xeafffb;
    // The port, one unit across its rim, facing +z: a hatch in the middle of the palm,
    // in the hand's own plating, and behind it an energy core, the way a repulsor is.
    // From the back: the bottom of a shallow round well sunk into the hand; the core in
    // it (a wide soft glow, a bright ring, a white-hot middle); the well's wall (seen
    // from inside, so the far side shows as the hand turns); the iris that covers it
    // (six blades of the same shell as the hand, a hair's gap between them, redrawn as
    // they draw back); a raised round rim of the joints' steel; and the light the core
    // throws out past it. The shell and steel are the body's own looks (same light, same
    // glow on the edges, same dissolve). One in each palm, set there at the bones' own
    // measure and handed to the wrist bone, so it is part of the hand in every pose
    // (they share their looks: only one is ever open).
    const plate = (name, side) => Object.assign(abyssalize(new THREE.MeshStandardMaterial({ name }), shared), { transparent: true, depthTest: false, depthWrite: false, side });
    const holeM = over(new THREE.MeshBasicMaterial({ color: 0x02040a }));
    const glowM = lit(TEAL, 0), ringM = lit(0xa6f5ea, 0), coreM = lit(WHITE, 0), haloM = lit(TEAL, 0);
    const wallM = plate('Grey', THREE.BackSide), irisM = plate('Main', THREE.DoubleSide), rimM = plate('Grey', THREE.DoubleSide);
    rimM.emissive.copy(TEAL);
    rimM.emissiveIntensity = 0;
    const irisGeo = new THREE.BufferGeometry();
    irisGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(54), 3));
    irisGeo.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(54).map((_, i) => (i % 3 === 2 ? 1 : 0)), 3));
    const DEEP = 0.5; // (how deep the well is, in its own radius)
    const parts = [
      [new THREE.CircleGeometry(0.82, 28).translate(0, 0, -DEEP), holeM],
      [new THREE.CircleGeometry(0.8, 28).translate(0, 0, -DEEP * 0.96), glowM],
      [new THREE.RingGeometry(0.44, 0.6, 36).translate(0, 0, -DEEP * 0.92), ringM],
      [new THREE.CircleGeometry(0.33, 24).translate(0, 0, -DEEP * 0.88), coreM],
      [new THREE.CylinderGeometry(0.88, 0.82, DEEP, 28, 1, true).rotateX(Math.PI / 2).translate(0, 0, -DEEP / 2), wallM],
      [irisGeo, irisM],
      [new THREE.TorusGeometry(0.94, 0.09, 8, 36), rimM],
      [new THREE.CircleGeometry(1.45, 28).translate(0, 0, 0.02), haloM],
    ];
    model.updateMatrixWorld(true);
    // (for each arm: the port in its palm, or none where the hand's bones are not found)
    const ports = arms.map((arm) => {
      const chain = (MODEL.palms.find((c) => bonesByName[bare(c[0])] === arm[2]) || []).map((n) => bonesByName[bare(n)]);
      if (chain.length < 3 || !chain.every(Boolean)) return null;
      const [wrist, k1, k2] = chain;
      const port = new THREE.Group();
      parts.forEach(([geo, mat], i) => {
        const o = new THREE.Mesh(geo, mat);
        o.renderOrder = 3 + i;
        o.frustumCulled = false;
        port.add(o);
      });
      port.visible = false;
      const W = model.worldToLocal(wrist.getWorldPosition(new THREE.Vector3()));
      const along = model.worldToLocal(k1.getWorldPosition(new THREE.Vector3())).sub(W);
      const face = model.worldToLocal(k2.getWorldPosition(new THREE.Vector3())).sub(W).sub(along);
      const L = along.length() || 1;
      along.divideScalar(L);
      face.addScaledVector(along, -face.dot(along));
      if (face.lengthSq() < 1e-10) face.set(-Math.sign(W.x) || -1, 0, 0); // (a palm faces the body)
      face.normalize();
      port.position.copy(W).addScaledVector(along, L * BLAST.at).addScaledVector(face, modelH * 0.012);
      port.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), face);
      port.scale.setScalar(modelH * BLAST.r);
      model.add(port);
      wrist.attach(port);
      return port;
    });
    // a bolt: one unit long, along +y: a white core in a teal sheath
    const bolts = BLAST.arc.map(() => {
      const g = new THREE.Group();
      const sheath = new THREE.Mesh(new THREE.SphereGeometry(0.5, 12, 8), lit(TEAL, 0.5));
      sheath.scale.set(0.26, 1, 0.26);
      const hot = new THREE.Mesh(new THREE.SphereGeometry(0.5, 10, 6), lit(WHITE, 1));
      hot.scale.set(0.11, 0.82, 0.11);
      g.add(sheath, hot);
      g.traverse((o) => { o.frustumCulled = false; o.renderOrder = 9; });
      g.visible = false;
      scene.add(g);
      return g;
    });
    // (the iris at k, 0 shut to 1 open: each blade from its two corners on the rim to a
    // tip that turns out from the middle to the rim between them, leaving a six-sided hole)
    const drawIris = (k) => {
      const a = irisGeo.attributes.position, r = 0.866 * k, GAP = 0.06; // (the seam between two blades)
      for (let i = 0; i < 6; i++) {
        const a0 = (i / 6) * TAU, a1 = ((i + 1) / 6) * TAU, at = a0 + TAU / 12 + (1 - k) * 1.1;
        const xs = [Math.cos(a0), Math.cos(a1), Math.cos(at) * r], ys = [Math.sin(a0), Math.sin(a1), Math.sin(at) * r];
        const mx = (xs[0] + xs[1] + xs[2]) / 3, my = (ys[0] + ys[1] + ys[2]) / 3;
        for (let v = 0; v < 3; v++) a.setXYZ(i * 3 + v, xs[v] + (mx - xs[v]) * GAP, ys[v] + (my - ys[v]) * GAP, 0);
      }
      a.needsUpdate = true;
    };
    drawIris(0);
    return { ports, glow: glowM, ring: ringM, core: coreM, rim: rimM, halo: haloM, bolts, drawIris };
  })();
  function blastOff() {
    for (const P of blast.ports) if (P) P.visible = false;
    for (const g of blast.bolts) g.visible = false;
    if (fx) for (const K of fx.rockets) K.g.visible = false;
  }
  // A hand opened flat (weighted): each finger laid straight out along its own bone of
  // the palm, bent back a touch (off the way the palm faces), and the thumb out to its
  // side. The palm's facing is the port's.
  const oD = new THREE.Vector3(), oN = new THREE.Vector3(), oA = new THREE.Vector3(), oB = new THREE.Vector3();
  function openHand(i, w) {
    const Hd = hands[i], P = blast.ports[i];
    if (!Hd || w < 0.001) return;
    P.updateWorldMatrix(true, false);
    oN.set(0, 0, 1).transformDirection(P.matrixWorld);
    const lay = (bone, next, dir) => {
      if (!next) return;
      const l = bone.getWorldPosition(oA).distanceTo(next.getWorldPosition(oB));
      swing(bone, next, oB.copy(oA).addScaledVector(dir, l), w);
    };
    for (const [wrist, f1, f2, tip] of Hd.fingers) {
      oD.subVectors(f1.getWorldPosition(oA), wrist.getWorldPosition(oB)).normalize().addScaledVector(oN, -0.14).normalize();
      lay(f1, f2, oD);
      lay(f2, tip, oD);
    }
    // (the thumb: out the way it already leaves the palm, square to the fingers, and a little along them)
    const [t1, t2, tip] = Hd.thumb, mid = Hd.fingers[1];
    oD.subVectors(mid[1].getWorldPosition(oA), mid[0].getWorldPosition(oB)).normalize(); // (along the palm)
    hTo.subVectors(t2.getWorldPosition(oA), t1.getWorldPosition(oB));
    hTo.addScaledVector(oD, -hTo.dot(oD)).addScaledVector(oN, -hTo.dot(oN));
    if (hTo.lengthSq() < 1e-10) return;
    oD.multiplyScalar(0.45).add(hTo.normalize()).addScaledVector(oN, -0.1).normalize();
    lay(t1, t2, oD);
    lay(t2, tip, oD);
  }
  // The hand set square (weighted): turned at the wrist until its palm faces the way
  // `to` and its fingers point up, the way a hand is held up to say stop.
  const mA = new THREE.Matrix4(), mB = new THREE.Matrix4(), qA = new THREE.Quaternion(), qB = new THREE.Quaternion(), qI = new THREE.Quaternion();
  function palmUp(i, to, w) {
    const Hd = hands[i], P = blast.ports[i];
    if (!Hd || w < 0.001) return;
    const mid = Hd.fingers[1];
    P.updateWorldMatrix(true, false);
    oN.set(0, 0, 1).transformDirection(P.matrixWorld); // (the way it faces now, and its fingers lie)
    oD.subVectors(mid[1].getWorldPosition(oA), mid[0].getWorldPosition(oB));
    oD.addScaledVector(oN, -oD.dot(oN)).normalize();
    mA.makeBasis(oD, oN, oA.crossVectors(oD, oN));
    oB.copy(to).normalize(); // (wanted: facing that way, and up, square to it)
    hTo.set(0, 1, 0).addScaledVector(oB, -oB.y);
    if (hTo.lengthSq() < 1e-6) return;
    hTo.normalize();
    mB.makeBasis(hTo, oB, oA.crossVectors(hTo, oB));
    qB.setFromRotationMatrix(mB).multiply(qA.setFromRotationMatrix(mA).invert());
    qB.copy(qI.identity().slerp(qB, w));
    for (const [wrist] of Hd.fingers) { // (the palm's bones all turn about the wrist)
      wrist.parent.updateWorldMatrix(true, false);
      wrist.parent.getWorldQuaternion(qParent);
      wrist.quaternion.premultiply(qSw.copy(qB).premultiply(qTmp.copy(qParent).invert()).multiply(qParent));
      wrist.updateMatrixWorld(true);
    }
    // (the thumb hangs off the forearm, beside the palm's bones, not off them: it is
    // carried round the wrist with them, the same turn)
    const t1 = Hd.thumb[0], piv = mid[0];
    if (t1.parent === piv.parent) {
      t1.parent.getWorldQuaternion(qParent);
      qSw.copy(qB).premultiply(qTmp.copy(qParent).invert()).multiply(qParent);
      t1.quaternion.premultiply(qSw);
      t1.position.sub(piv.position).applyQuaternion(qSw).add(piv.position);
      t1.updateMatrixWorld(true);
    }
  }
  // A hand up and its palm out: arm i raised at its side, a little forward, clear of the
  // head, the elbow under it so that the forearm stands up, by as much as the port is
  // open; the forearm rolled about its own length, and the hand turned at the wrist,
  // until the palm faces the way `to` (in the world) with its fingers up; the hand
  // opened flat; and the port drawn in the palm, its iris so far open and its core as
  // bright as the charge. Each bolt kicks the hand back. Returns where the port is, in
  // the world.
  function palmOut(i, open, kick, to, charge) {
    const arm = arms[i], s = armSide[i], P = blast.ports[i];
    model.worldToLocal(arm[0].getWorldPosition(hTo));
    // (out to the side, up and forward, by the arm's own length: within its reach, so that the elbow bends under the hand)
    const len = hTo.distanceTo(model.worldToLocal(arm[1].getWorldPosition(bP))) + bP.distanceTo(model.worldToLocal(arm[2].getWorldPosition(bQ)));
    hTo.set(hTo.x + s * (0.68 + 0.1 * kick) * len, hTo.y + (0.42 - 0.19 * kick) * len, hTo.z + (0.32 - 0.16 * kick) * len);
    reach(arm, model.localToWorld(hTo), open, hPole.set(s * 0.6, -1, -0.15).normalize().transformDirection(model.matrixWorld));
    P.updateWorldMatrix(true, false);
    bN.set(0, 0, 1).transformDirection(P.matrixWorld);
    arm[2].getWorldPosition(bP);
    hA.subVectors(bP, arm[1].getWorldPosition(bQ)).normalize(); // (along the forearm)
    hB.copy(to);
    bN.addScaledVector(hA, -bN.dot(hA));
    hB.addScaledVector(hA, -hB.dot(hA));
    if (bN.lengthSq() > 1e-8 && hB.lengthSq() > 1e-8) turnBone(arm[1], hA, Math.atan2(hA.dot(bQ.crossVectors(bN, hB)), bN.dot(hB)) * open);
    // the hand comes square and opens first, flat, fingers up and thumb out; then the
    // hatch in its palm
    palmUp(i, to, open);
    openHand(i, smooth(clamp01(open / 0.55)));
    const iris = smooth(clamp01((open - 0.35) / 0.65));
    blast.drawIris(iris);
    chest.flare = Math.max(chest.flare, charge); // (what the palm draws, the chest gives)
    // (the core: alight as it charges, breathing a little, flaring with each bolt)
    const beat = 0.86 + 0.14 * Math.sin(time * 9);
    blast.glow.opacity = 0.5 * charge;
    blast.ring.opacity = Math.min(1, charge * 1.1) * beat;
    blast.core.opacity = Math.min(1, charge * 1.25);
    blast.halo.opacity = 0.3 * charge * beat;
    blast.rim.emissiveIntensity = 0.9 * charge;
    for (const O of blast.ports) if (O) O.visible = O === P && iris > 0.01;
    P.updateWorldMatrix(true, false);
    return P.getWorldPosition(bP);
  }
  const armL = armSide.indexOf(Math.max(...armSide)); // (the model's own left)
  // (waiting: the button up and not yet lit, the case open and not on its way out)
  const playWaits = () => !!playEl && !playEl.hidden && !playEl.classList.contains('is-lit') && doc.classList.contains('is-detail');
  // the video's play button while the video waits on it (its middle, on the canvas)
  function playSpot() {
    if (!playWaits() || !sceneEl.open) return null;
    const r = playEl.getBoundingClientRect();
    return r.width > 0 ? clientToCanvas(r.left + r.width / 2, r.top + r.height / 2) : null;
  }
  // The held video let go without a shot (the guide off before it fired). Should the
  // scene not be up yet, the page starts it itself as it opens (app.js: openProject).
  function playRelease() {
    if (playWaits()) playEl.click();
  }
  const bP = new THREE.Vector3(), bQ = new THREE.Vector3(), bN = new THREE.Vector3(), bT = new THREE.Vector3(), bY = new THREE.Vector3(0, 1, 0);
  function sparks(x, y, n, speed, H) {
    const o = toWorld(x, y, 0.6, bQ);
    for (let i = 0; i < n; i++) {
      const a = (i / n) * TAU + Math.random() * 0.4, sp = H * speed * (0.5 + Math.random());
      spawn(o.x, o.y, o.z, Math.cos(a) * sp, Math.sin(a) * sp, (Math.random() - 0.4) * H * 0.3, 0.3 + Math.random() * 0.4, 0.8);
    }
  }
  function perchBlast(Q, dt) {
    const T = playSpot();
    let R = Q.rk;
    if (!R) {
      if (Q.st !== 'sit' || Q.fired || Q.sat < BLAST.wait || !T || armL < 0 || !blast.ports[armL] || salvo.st) return;
      R = Q.rk = { st: 'open', t: 0, to: T, shots: [], next: 0, last: -9 };
    }
    R.t += dt;
    const hp = Q.hp, H = hp * view.wpp, arm = arms[armL];
    // The visitor started the video meanwhile, or the case is closing: no need of it.
    // What is in the air fizzles out where it is, and the iris shuts (from as far open
    // and as bright as it had got).
    if (!T && R.st !== 'shut') {
      for (const S of R.shots) if (!S.hit) { S.hit = true; sparks(S.x, S.y, 6, 0.3, H); }
      Q.fired = true;
      R.w = R.st === 'open' ? smooth(clamp01(R.t / BLAST.open)) : 1;
      R.c = R.st === 'open' ? 0 : R.st === 'charge' ? smooth(clamp01(R.t / BLAST.charge)) : 0.5;
      R.st = 'shut';
      R.t = 0;
    }
    if (T) R.to = T;
    // how far open the iris is (the hand up with it), how bright its core, and the palm
    // turned between us and the button
    const fade = R.st === 'shut' ? 1 - smooth(clamp01(R.t / BLAST.shut)) : 1;
    const open = R.st === 'open' ? smooth(clamp01(R.t / BLAST.open)) : R.st === 'shut' ? (R.w ?? 1) * fade : 1;
    const kick = Math.exp(-(R.t - R.last) / 0.07) * (R.st === 'fire' ? 1 : 0);
    const charge = R.st === 'open' ? 0 : R.st === 'charge' ? smooth(clamp01(R.t / BLAST.charge)) : R.st === 'fire' ? 0.6 + 0.4 * kick : (R.c ?? 0.5) * fade;
    const [qx, qy] = toCanvas(arm[0].getWorldPosition(bP));
    const qd = Math.hypot(R.to[0] - qx, R.to[1] - qy) || 1;
    const [px, py] = toCanvas(palmOut(armL, open, kick, bT.set(((R.to[0] - qx) / qd) * 0.7, (-(R.to[1] - qy) / qd) * 0.7, 0.75).normalize(), charge)); // (where the bolts come out)
    const d = Math.hypot(R.to[0] - px, R.to[1] - py) || 1;
    if (R.st !== 'shut') {
      [glance.x, glance.y] = R.to;
      glance.until = performance.now() + 150;
    }
    if (R.st === 'open' && R.t >= BLAST.open) { R.st = 'charge'; R.t = 0; sfx('jet-ignite', { gain: 0.5 }); }
    else if (R.st === 'charge' && R.t >= BLAST.charge) { R.st = 'fire'; R.t = 0; R.next = 0; }
    else if (R.st === 'shut' && R.t >= BLAST.shut) {
      blastOff();
      Q.rk = null;
      return;
    }
    if (R.st === 'fire') {
      // the next bolt off the hand
      if (R.shots.length < blast.bolts.length && R.t >= R.next) {
        R.shots.push({ t: 0, x: px, y: py, from: [px, py], arc: BLAST.arc[R.shots.length], dur: clamp(d / BLAST.pace, 0.22, 0.42), hit: false });
        R.next = R.t + BLAST.gap;
        R.last = R.t;
        if (R.shots.length === 1) sfx('jet-burst', { gain: 0.5 });
        sparks(px, py, 5, 0.35, H);
        Q.sqv += 0.45; // (it rocks back with each)
        perch.legs.forEach((L) => { L.v -= 0.8; });
      }
    }
    // the bolts in the air: a shallow arc from where each left the hand to the button
    let flying = 0;
    R.shots.forEach((S, i) => {
      const g = blast.bolts[i];
      if (S.hit) { g.visible = false; return; }
      S.t += dt;
      const u = clamp01(S.t / S.dur), q = 1 - u;
      const [x0, y0] = S.from, [x1, y1] = R.to;
      const far = Math.hypot(x1 - x0, y1 - y0);
      const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2 - far * S.arc;
      const tx = 2 * q * (cx - x0) + 2 * u * (x1 - cx), ty = 2 * q * (cy - y0) + 2 * u * (y1 - cy), tl = Math.hypot(tx, ty) || 1;
      S.x = q * q * x0 + 2 * q * u * cx + u * u * x1;
      S.y = q * q * y0 + 2 * q * u * cy + u * u * y1;
      const len = hp * BLAST.len * (0.5 + 0.5 * smooth(clamp01(u / 0.2))); // (it draws out as it leaves)
      toWorld(S.x - (tx / tl) * len * 0.4, S.y - (ty / tl) * len * 0.4, 0.6, g.position);
      g.scale.setScalar(len * view.wpp);
      g.rotation.set(0, 0, Math.atan2(-ty, tx) - Math.PI / 2);
      g.visible = true;
      const tail = toWorld(S.x - (tx / tl) * len, S.y - (ty / tl) * len, 0.6, bQ);
      for (let n = 2; n > 0; n--) spawn(tail.x, tail.y, tail.z, (Math.random() - 0.5) * 0.25 * H, (Math.random() - 0.5) * 0.25 * H, 0, 0.25 + Math.random() * 0.3, 0.85);
      if (u < 1) { flying++; return; }
      // the hit: sparks off the button; on the last one, the video starts
      S.hit = true;
      g.visible = false;
      const last = i === blast.bolts.length - 1;
      sparks(x1, y1, last ? 44 : 12, last ? 1.1 : 0.6, H);
      if (!last) return;
      sfx('stunt-impact', { gain: 0.6 });
      Q.fired = true;
      playEl.click();
      // (and the guide is pleased with itself)
      setFace('surprised', 0.7);
      Q.sqv += 1.1;
      perch.legs.forEach((L, k) => { L.v += k ? 2.6 : -2.2; });
    });
    if (R.st === 'fire' && R.shots.length === blast.bolts.length && !flying) { R.st = 'shut'; R.t = 0; }
  }

  // What the salvo is made of (see stepSalvo), all of it in the scene, in depth, between
  // the guide and the camera. Rockets: small, of metal the room shows in, a gold nose,
  // fins, a band of light, a flame out of the nozzle. The smoke they leave, puff after
  // puff. And what each does to the glass: a flash; a ball of fire, which is a ball of
  // cloud that boils, white-hot in its hollows and going dark from the outside in, till
  // it is smoke, and rises; a ring of pressure running out; sparks thrown off, that
  // fall; more smoke after; and for that moment the light of it on the guide itself.
  let fx = null; // (made by the first salvo: where there can be none, the dock, reduced motion, it never is)
  const makeFx = () => {
    // (smoke: a soft uneven puff, drawn once)
    const smokeTex = (() => {
      const cv = document.createElement('canvas');
      cv.width = cv.height = 128;
      const x = cv.getContext('2d');
      for (let i = 0; i < 28; i++) {
        const a = Math.random() * TAU, d = Math.random() * 22, r = 14 + Math.random() * 26, px = 64 + Math.cos(a) * d, py = 64 + Math.sin(a) * d;
        const g = x.createRadialGradient(px, py, 0, px, py, r);
        g.addColorStop(0, 'rgba(255,255,255,0.2)');
        g.addColorStop(1, 'rgba(255,255,255,0)');
        x.fillStyle = g;
        x.fillRect(0, 0, 128, 128);
      }
      const t = new THREE.CanvasTexture(cv);
      t.colorSpace = THREE.SRGBColorSpace;
      return t;
    })();
    // (the ring of pressure: a soft band of light, sharpest at its outer edge)
    const ringTex = (() => {
      const cv = document.createElement('canvas');
      cv.width = cv.height = 256;
      const x = cv.getContext('2d'), g = x.createRadialGradient(128, 128, 0, 128, 128, 128);
      [[0, 0], [0.62, 0], [0.86, 0.16], [0.955, 0.75], [0.985, 0.3], [1, 0]].forEach(([at, a]) => g.addColorStop(at, `rgba(255,255,255,${a})`));
      x.fillStyle = g;
      x.fillRect(0, 0, 256, 256);
      const t = new THREE.CanvasTexture(cv);
      t.colorSpace = THREE.SRGBColorSpace;
      return t;
    })();
    const metal = (color, rough = 0.32) => new THREE.MeshStandardMaterial({ color, metalness: 0.9, roughness: rough });
    const add = (color, opacity) => new THREE.MeshBasicMaterial({ color, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
    const glowing = (color, opacity) => new THREE.SpriteMaterial({ map: glowTex, color, opacity, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
    const V2 = (pts) => pts.map(([x, y]) => new THREE.Vector2(x, y));
    // a rocket: one unit long, along +y, its nose at the top
    const finG = new THREE.ExtrudeGeometry(new THREE.Shape(V2([[0, 0.04], [0.11, -0.05], [0.11, -0.17], [0, -0.13]])), { depth: 0.012, bevelEnabled: false }).translate(0.07, -0.26, -0.006);
    const parts = [
      [new THREE.CylinderGeometry(0.075, 0.075, 0.56, 24).translate(0, -0.03, 0), metal(0x22323c)],
      [new THREE.LatheGeometry(V2([[0.075, 0], [0.071, 0.07], [0.054, 0.15], [0.028, 0.21], [0.001, 0.25]]), 24).translate(0, 0.25, 0), metal(0xd9a55c, 0.26)],
      [mergeGeometries([0, 1, 2, 3].map((i) => finG.clone().rotateY((i / 4) * TAU + 0.4))), metal(0x0e6f80)],
      [new THREE.CylinderGeometry(0.079, 0.079, 0.03, 24).translate(0, 0.15, 0), new THREE.MeshStandardMaterial({ color: 0x050810, emissive: 0x63e6d2, emissiveIntensity: 2.2 })],
      [new THREE.CylinderGeometry(0.079, 0.079, 0.02, 24).translate(0, -0.12, 0), metal(0xd9a55c, 0.26)],
      [new THREE.CylinderGeometry(0.05, 0.07, 0.07, 20, 1, true).translate(0, -0.345, 0), Object.assign(metal(0x8296ab), { side: THREE.DoubleSide })],
      [new THREE.CircleGeometry(0.05, 20).rotateX(Math.PI / 2).translate(0, -0.36, 0), new THREE.MeshBasicMaterial({ color: 0xfff0d8 })],
    ];
    const flameG = (r, len) => new THREE.ConeGeometry(r, len, 14, 1, true).rotateX(Math.PI).translate(0, -0.38 - len / 2, 0); // (out of the nozzle, down its axis)
    const flames = [[flameG(0.058, 0.55), add(0xffb35c, 0.55)], [flameG(0.03, 0.34), add(0xfff0d8, 0.9)]];
    const rockets = [0, 1, 2].map(() => {
      const g = new THREE.Group(), flame = new THREE.Group();
      for (const [geo, mat] of parts) g.add(new THREE.Mesh(geo, mat));
      for (const [geo, mat] of flames) flame.add(new THREE.Mesh(geo, mat));
      const glow = new THREE.Sprite(glowing(0xffc98a, 1));
      glow.position.y = -0.44;
      glow.scale.setScalar(0.6);
      g.add(flame, glow);
      g.traverse((o) => { o.frustumCulled = false; });
      g.visible = false;
      scene.add(g);
      return { g, flame };
    });
    // the smoke: a ring of puffs, each its own while it lasts
    const puffs = Array.from({ length: 288 }, () => {
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: smokeTex, transparent: true, opacity: 0, depthWrite: false }));
      sp.visible = false;
      sp.frustumCulled = false;
      scene.add(sp);
      return { sp, t: 1, life: 1, v: new THREE.Vector3(), r0: 0, r1: 0, a: 0, turn: 0 };
    });
    let np = 0;
    // (a puff: there, drifting so, from so big to so big (across), for so long, so dense, of this shade)
    const puff = (at, vx, vy, vz, r0, r1, life, a, color) => {
      const q = puffs[np];
      np = (np + 1) % puffs.length;
      q.sp.position.copy(at);
      q.v.set(vx, vy, vz);
      Object.assign(q, { t: 0, life, r0, r1, a, turn: (Math.random() - 0.5) * 1.6 });
      q.sp.material.color.setHex(color);
      q.sp.material.rotation = Math.random() * TAU;
      q.sp.material.opacity = 0;
      q.sp.scale.setScalar(r0);
      q.sp.visible = true;
    };
    // the sparks: lines, each from where a spark is back along the way it came
    const NS = 132, sPos = new Float32Array(NS * 6), sCol = new Float32Array(NS * 6), sP = new Float32Array(NS * 3), sV = new Float32Array(NS * 3), sAge = new Float32Array(NS).fill(1), sLife = new Float32Array(NS).fill(1);
    const sparkG = new THREE.BufferGeometry();
    sparkG.setAttribute('position', new THREE.BufferAttribute(sPos, 3).setUsage(THREE.DynamicDrawUsage));
    sparkG.setAttribute('color', new THREE.BufferAttribute(sCol, 3).setUsage(THREE.DynamicDrawUsage));
    // (added to what is there, colour only: the canvas's own alpha is left alone, so a spark that has gone out is nothing, not a black hair over the page)
    const sparks = new THREE.LineSegments(sparkG, new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneFactor, blendSrcAlpha: THREE.ZeroFactor, blendDstAlpha: THREE.OneFactor, depthWrite: false, depthTest: false }));
    sparks.frustumCulled = false;
    sparks.visible = false;
    sparks.renderOrder = 11;
    scene.add(sparks);
    let ns = 0, sparkG9 = 1;
    const spark = (at, vx, vy, vz, life) => {
      const i = ns;
      ns = (ns + 1) % NS;
      sP[i * 3] = at.x; sP[i * 3 + 1] = at.y; sP[i * 3 + 2] = at.z;
      sV[i * 3] = vx; sV[i * 3 + 1] = vy; sV[i * 3 + 2] = vz;
      sAge[i] = 0;
      sLife[i] = life;
      sparks.visible = true;
    };
    // the fire: a ball whose skin is pushed out by a cloud that drifts through it, and
    // coloured by how far out each bit of it stands and how old it all is
    const NOISE = `
      float hash(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
      float noise(vec3 x) {
        vec3 i = floor(x); vec3 f = fract(x); f = f * f * (3.0 - 2.0 * f);
        return mix(mix(mix(hash(i), hash(i + vec3(1,0,0)), f.x), mix(hash(i + vec3(0,1,0)), hash(i + vec3(1,1,0)), f.x), f.y),
                   mix(mix(hash(i + vec3(0,0,1)), hash(i + vec3(1,0,1)), f.x), mix(hash(i + vec3(0,1,1)), hash(i + vec3(1,1,1)), f.x), f.y), f.z);
      }
      float fbm(vec3 p) { float a = 0.5; float s = 0.0; for (int i = 0; i < 4; i++) { s += a * noise(p); p = p * 2.03 + vec3(17.1, 3.7, 9.2); a *= 0.5; } return s / 0.9375; }`;
    const FIRE_V = `
      uniform float uT; uniform float uSeed;
      varying float vOut; varying float vFace;
      ${NOISE}
      void main() {
        vec3 p = normalize(position);
        float big = fbm(p * 1.9 + vec3(uSeed, -uT * 0.55, uSeed * 1.7));
        float fine = fbm(p * 5.2 + vec3(uT * 1.3, uSeed, -uT * 0.8));
        vOut = big * 0.72 + fine * 0.28;
        vec4 mv = modelViewMatrix * vec4(p * (0.5 + 0.95 * vOut), 1.0);
        vFace = abs(dot(normalize(normalMatrix * p), normalize(-mv.xyz)));
        gl_Position = projectionMatrix * mv;
      }`;
    const FIRE_F = `
      uniform float uAge;
      varying float vOut; varying float vFace;
      vec3 ramp(float t) {
        vec3 c = mix(vec3(0.025, 0.027, 0.032), vec3(0.5, 0.05, 0.008), smoothstep(0.0, 0.22, t));
        c = mix(c, vec3(1.5, 0.4, 0.03), smoothstep(0.18, 0.46, t));
        c = mix(c, vec3(2.3, 1.25, 0.28), smoothstep(0.42, 0.74, t));
        return mix(c, vec3(3.4, 3.0, 2.3), smoothstep(0.74, 1.0, t));
      }
      void main() {
        float heat = 1.18 - vOut * 1.3 - uAge * 1.4 + 0.25 * (1.0 - vFace) * (1.0 - uAge);
        vec3 col = ramp(clamp(heat, 0.0, 1.0));
        col = mix(col, vec3(1.4, 3.6, 3.3), 0.55 * (1.0 - smoothstep(0.0, 0.09, uAge)));
        float alpha = (1.0 - smoothstep(0.55, 1.0, uAge)) * smoothstep(0.0, 0.3, vFace) * (0.62 + 0.38 * smoothstep(0.0, 0.5, heat + 0.2));
        gl_FragColor = vec4(col, alpha);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`;
    const fireG = new THREE.IcosahedronGeometry(1, 18);
    fireG.deleteAttribute('normal');
    fireG.deleteAttribute('uv');
    { // (its faces, far side first: it is see-through, never turned, and looked at down -z, so the nearer must be drawn after)
      const A = fireG.attributes.position.array, src = A.slice(), n = A.length / 9, far = (t) => src[t * 9 + 2] + src[t * 9 + 5] + src[t * 9 + 8];
      Array.from({ length: n }, (_, i) => i).sort((a, b) => far(a) - far(b)).forEach((t, i) => A.set(src.subarray(t * 9, t * 9 + 9), i * 9));
    }
    const blasts = [0, 1, 2].map(() => {
      const g = new THREE.Group();
      const fire = new THREE.Mesh(fireG, new THREE.ShaderMaterial({ uniforms: { uT: { value: 0 }, uAge: { value: 0 }, uSeed: { value: 0 } }, vertexShader: FIRE_V, fragmentShader: FIRE_F, transparent: true, depthWrite: false }));
      const ring = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), add(0xffd9a0, 0));
      ring.material.map = ringTex;
      ring.material.depthTest = false;
      const flash = new THREE.Sprite(glowing(0xdffcf6, 0));
      flash.material.depthTest = false;
      fire.renderOrder = 9;
      ring.renderOrder = 10;
      flash.renderOrder = 12;
      g.add(fire, ring, flash);
      g.traverse((o) => { o.frustumCulled = false; });
      g.visible = false;
      scene.add(g);
      return { g, fire, ring, flash, t: -1, R: 1, smoke: 0 };
    });
    // (the flash at the palm as one leaves it)
    const muzzle = new THREE.Sprite(glowing(0xffe2b8, 0));
    muzzle.material.depthTest = false;
    muzzle.renderOrder = 12;
    muzzle.visible = false;
    muzzle.userData.t = 1;
    scene.add(muzzle);
    // (and the light of a burst, on everything: no nearer, no further, as bright)
    const light = new THREE.PointLight(0xffc98a, 0, 0, 0);
    scene.add(light);
    const pv = new THREE.Vector3();
    // (a rocket's burst: this one, there, so big)
    const boom = (i, at, R) => {
      const B = blasts[i];
      Object.assign(B, { t: 0, R, smoke: 0 });
      B.g.position.copy(at);
      B.g.visible = true;
      // (as it is at its first instant: the frame it is first drawn in comes before step sees it)
      B.fire.scale.setScalar(R * 0.4);
      B.fire.position.y = 0;
      B.fire.material.uniforms.uT.value = 0;
      B.fire.material.uniforms.uAge.value = 0;
      B.flash.visible = B.ring.visible = true;
      B.flash.scale.setScalar(R * 3);
      B.flash.material.opacity = 1;
      B.ring.scale.setScalar(R * 0.5);
      B.ring.material.opacity = 0.42;
      B.fire.material.uniforms.uSeed.value = Math.random() * 40;
      sparkG9 = R * 11;
      for (let m = 0; m < 44; m++) {
        const a = Math.random() * TAU, e = (Math.random() - 0.35) * 1.4, sp = R * (2.5 + Math.random() * 7.5);
        spark(at, Math.cos(a) * Math.cos(e) * sp, Math.sin(a) * Math.cos(e) * sp + R * 1.5, Math.sin(e) * sp * 0.5, 0.35 + Math.random() * 0.6);
      }
    };
    const fire = (at, size) => {
      muzzle.position.copy(at);
      muzzle.scale.setScalar(size);
      muzzle.userData.t = 0;
      muzzle.visible = true;
    };
    // every frame: whatever of it is live
    const step = (dt, life) => {
      let lit = 0;
      for (const B of blasts) {
        if (B.t < 0) continue;
        B.t += dt;
        const a = B.t / life, R = B.R;
        if (a >= 1) { B.t = -1; B.g.visible = false; continue; }
        B.fire.scale.setScalar(R * (0.4 + 1.25 * (1 - Math.pow(1 - a, 3))));
        B.fire.position.y = R * 0.6 * a * a; // (it rises as it cools)
        B.fire.material.uniforms.uT.value = B.t;
        B.fire.material.uniforms.uAge.value = a;
        const f = clamp01(B.t / 0.14), r = clamp01(B.t / 0.42);
        B.flash.scale.setScalar(R * (3 + 6 * f));
        B.flash.material.opacity = (1 - f) * (1 - f);
        B.flash.visible = f < 1; // (done, they are not drawn: each is a screen of nothing otherwise)
        B.ring.scale.setScalar(R * (0.5 + 3.4 * (1 - (1 - r) * (1 - r))));
        B.ring.material.opacity = 0.42 * Math.pow(1 - r, 1.6);
        B.ring.visible = r < 1;
        while (B.smoke < 7 && B.t > 0.12 + B.smoke * 0.07) { // (the smoke it leaves: dark, slow, going up)
          B.smoke++;
          const a2 = Math.random() * TAU, d = R * (0.2 + Math.random() * 0.7);
          pv.set(Math.cos(a2) * d, Math.sin(a2) * d * 0.7 + R * 0.2, -R * 0.3 * Math.random()).add(B.g.position);
          puff(pv, Math.cos(a2) * R * 0.5, R * (0.35 + Math.random() * 0.5), 0, R * 1.0, R * (2.0 + Math.random() * 0.7), 0.7 + Math.random() * 0.45, 0.34, 0x232a31);
        }
        lit += 8 * Math.exp(-B.t / 0.08) + 1.6 * (1 - a) * (1 - a);
        light.position.copy(B.g.position);
      }
      light.intensity = lit;
      if (muzzle.visible) {
        const k = (muzzle.userData.t += dt) / 0.09;
        muzzle.visible = k < 1;
        muzzle.material.opacity = (1 - k) * (1 - k);
      }
      for (const q of puffs) {
        if (!q.sp.visible) continue;
        q.t += dt;
        const k = q.t / q.life;
        if (k >= 1) { q.sp.visible = false; continue; }
        q.v.multiplyScalar(Math.exp(-1.8 * dt));
        q.sp.position.addScaledVector(q.v, dt);
        q.sp.scale.setScalar(q.r0 + (q.r1 - q.r0) * (1 - (1 - k) * (1 - k)));
        q.sp.material.opacity = q.a * Math.min(1, k / 0.08) * Math.pow(1 - k, 1.5);
        q.sp.material.rotation += q.turn * dt;
      }
      if (sparks.visible) {
        let any = false;
        const drag = Math.exp(-1.6 * dt);
        for (let i = 0; i < NS; i++) {
          const j = i * 3, o = i * 6;
          if (sAge[i] >= sLife[i]) { sCol.fill(0, o, o + 6); continue; }
          any = true;
          sAge[i] += dt;
          sV[j] *= drag; sV[j + 1] = sV[j + 1] * drag - sparkG9 * dt; sV[j + 2] *= drag;
          sP[j] += sV[j] * dt; sP[j + 1] += sV[j + 1] * dt; sP[j + 2] += sV[j + 2] * dt;
          const k = Math.max(0, 1 - sAge[i] / sLife[i]);
          sPos[o] = sP[j]; sPos[o + 1] = sP[j + 1]; sPos[o + 2] = sP[j + 2];
          sPos[o + 3] = sP[j] - sV[j] * 0.03; sPos[o + 4] = sP[j + 1] - sV[j + 1] * 0.03; sPos[o + 5] = sP[j + 2] - sV[j + 2] * 0.03;
          sCol[o] = 3.2 * k; sCol[o + 1] = 2.3 * k; sCol[o + 2] = 1.2 * k;
          sCol[o + 3] = 1.3 * k; sCol[o + 4] = 0.45 * k; sCol[o + 5] = 0.06 * k;
        }
        sparkG.attributes.position.needsUpdate = true;
        sparkG.attributes.color.needsUpdate = true;
        sparks.visible = any;
      }
    };
    return { rockets, puff, spark, boom, fire, step };
  };

  // Clicked four times running, it has had enough of being poked: up comes the hand on
  // the near side, palm to the visitor, the port opens, and it lets fly at the screen.
  // Three rockets, one after the other, straight at us: each leaves the palm small and
  // far off, with a flash and a puff, and comes on at the glass, turning, a flame behind
  // it and a line of smoke, growing all the way (they are flown in depth, toward the
  // camera, so it is the lens that makes them big), and bursts on it (see fx): fire,
  // smoke, sparks, its light on the guide, and the stage itself shaken. Then the port
  // shuts, the hand comes down, and a thumbs-up, no hard feelings. (Where it cannot be
  // done, a journey under way, the dock, a scene open, it dances as it always did.)
  //   open, charge, gap, shut  as for the case's (s);  fly: a rocket's way to the glass (s)
  //   near   how far short of the camera it bursts (world: the closer, the bigger)
  //   len    a rocket's length where it leaves the hand (px, at most);  r: the burst's
  //          size (screen heights);  boom: how long its fire lasts (s)
  const SALVO = { open: 0.5, charge: 0.18, gap: 0.22, fly: 0.62, near: 3, len: 52, r: 0.15, boom: 1.25, shut: 0.4 };
  const salvo = { st: null, t: 0, arm: 0, shots: [], next: 0, last: -9, w: 1, c: 0.5, shake: 0 };
  function startSalvo() {
    // (nor through the time tunnels, where it flies behind the cards)
    if (salvo.st || reduced || view.dock || !rigOK || trans || scrub.mid || delivBusy() || sceneOpen() || tun.active || maskHides || shared.uClipAll.value > 0.5 || shared.uDissolve.value > 0.01) return false; // (all that stepSalvo would stop it for at once)
    const i = pivot.rotation.y > 0.15 ? armR : armL; // (the hand on our side of it)
    if (i < 0 || !blast.ports[i]) return false;
    if (oneShot) { oneShot = false; fadeTo(baseName, 0.25); } // (whatever it was doing about the last click)
    if (!fx) { // (the port takes its time to open: what the rockets are drawn with is made ready meanwhile)
      fx = makeFx();
      renderer.compileAsync(scene, camera);
    }
    Object.assign(salvo, { st: 'open', t: 0, arm: i, shots: [], next: 0, last: -9, w: 1, c: 0.5 });
    markInput();
    return true;
  }
  // The core in its chest, every frame: a slow breath, brighter with the jets' thrust and
  // with whatever the palm is firing.
  function stepChest(dt) {
    if (!chest.ring) return;
    chest.flare = Math.max(0, chest.flare - dt * 2.5);
    const beat = 0.85 + 0.15 * Math.sin(time * 2.6), k = beat + 1.6 * chest.flare + 0.5 * Math.min(1, jet.thrust);
    const s = root.scale.x;
    chest.ring.emissiveIntensity = 1.5 * k;
    chest.mid.emissiveIntensity = 2.2 * k;
    chest.halo.opacity = 0.3 * beat + 0.5 * chest.flare;
    // (its light on the plates round it: as far as the body is big, gone with the body)
    chest.light.distance = 2.2 * modelH * s;
    chest.light.intensity = 0.6 * k * s * s * (1 - shared.uDissolve.value);
  }
  const easeOut = (x) => 1 - (1 - x) * (1 - x);
  function stepSalvo(dt) {
    const Z = salvo;
    // what is in the air and what has burst, each on its own clock, and the shake a
    // burst gives the stage
    const R0 = SALVO.r * view.h * view.wpp * (SALVO.near / CAM_Z);
    if (fx) fx.step(dt, SALVO.boom);
    if (Z.shake > 0 || canvas.style.translate) {
      Z.shake = Math.max(0, Z.shake - dt);
      const k = Z.shake / 0.3, amp = 10 * k * k;
      canvas.style.translate = Z.shake > 0 ? `${(Math.sin(time * 91) * amp).toFixed(1)}px ${(Math.cos(time * 77) * amp).toFixed(1)}px` : '';
    }
    if (!Z.st) return;
    Z.t += dt;
    const H = at.h * view.wpp;
    // Off on a journey (timed or scrolled), into a tunnel, to fetch the contact card, to
    // the dock, or a scene up over it: no more of it. What is in the air goes out, and
    // the port shuts from as far open as it had got.
    const hidden = tun.hidden || maskHides || shared.uClipAll.value > 0.5 || shared.uDissolve.value > 0.01;
    const off = !!trans || view.dock || sceneOpen() || scrub.mid || delivBusy() || tun.active || hidden;
    if (off && Z.st !== 'shut') {
      Z.shots.forEach((S, i) => { if (!S.hit) { S.hit = true; fx.rockets[i].g.visible = false; } });
      Z.w = Z.st === 'open' ? smooth(clamp01(Z.t / SALVO.open)) : 1;
      Z.c = Z.st === 'open' ? 0 : Z.st === 'charge' ? smooth(clamp01(Z.t / SALVO.charge)) : 0.5;
      Z.st = 'shut';
      Z.t = 0;
    }
    const fade = Z.st === 'shut' ? 1 - smooth(clamp01(Z.t / SALVO.shut)) : 1;
    const open = Z.st === 'open' ? smooth(clamp01(Z.t / SALVO.open)) : Z.st === 'shut' ? Z.w * fade : 1;
    const kick = Math.exp(-(Z.t - Z.last) / 0.07) * (Z.st === 'fire' ? 1 : 0);
    const charge = Z.st === 'open' ? 0 : Z.st === 'charge' ? smooth(clamp01(Z.t / SALVO.charge)) : Z.st === 'fire' ? 0.6 + 0.4 * kick : Z.c * fade;
    const P = palmOut(Z.arm, open, kick, bT.set(0, 0.05, 1).normalize(), charge); // (the palm to us)
    const px = P.x, py = P.y, pz = P.z;
    if (hidden) blast.ports[Z.arm].visible = false; // (its lights are not the body's to hide behind a card: gone with it)
    if (Z.st === 'open' && Z.t >= SALVO.open) { Z.st = 'charge'; Z.t = 0; sfx('jet-ignite', { gain: 0.5 }); }
    else if (Z.st === 'charge' && Z.t >= SALVO.charge) { Z.st = 'fire'; Z.t = 0; Z.next = 0; Z.w = 1; Z.c = 0.5; }
    else if (Z.st === 'shut' && Z.t >= SALVO.shut) {
      blastOff();
      Z.st = null;
      if (!off) react('thumbs');
      return;
    }
    if (Z.st === 'fire' && Z.shots.length < fx.rockets.length && Z.t >= Z.next) {
      // the next rocket: from the palm to a place on the glass, spread across it
      const n = Z.shots.length;
      const to = toWorld(view.w * (0.5 + (n - 1) * 0.23 + (Math.random() - 0.5) * 0.1), view.h * (0.36 + Math.random() * 0.26), CAM_Z - SALVO.near, new THREE.Vector3());
      Z.shots.push({ t: 0, from: new THREE.Vector3(px, py, pz), at: new THREE.Vector3(px, py, pz), to, hit: false, ph: Math.random() * TAU });
      Z.next = Z.t + SALVO.gap;
      Z.last = Z.t;
      if (!n) sfx('jet-burst', { gain: 0.5 });
      // (as it leaves: a flash at the palm, a puff of smoke, a few sparks)
      fx.fire(P, H * 0.5);
      fx.puff(P, (Math.random() - 0.5) * H * 0.2, H * 0.12, H * 0.2, H * 0.1, H * 0.34, 0.5, 0.3, 0xa9bccb);
      for (let i = 0; i < 6; i++) fx.spark(P, (Math.random() - 0.5) * H * 1.6, (Math.random() - 0.5) * H * 1.6, H * (0.4 + Math.random()), 0.15 + Math.random() * 0.2);
    }
    let flying = 0;
    Z.shots.forEach((S, i) => {
      const K = fx.rockets[i], g = K.g;
      if (S.hit) return;
      S.t += dt;
      // (how far along: so that its distance from the camera falls by the same share
      // every instant. Flown evenly it would hang small and far for most of its way and
      // be on the glass in a frame: this way it grows the whole way in)
      const u = clamp01(S.t / SALVO.fly), d0 = CAM_Z - S.from.z, d1 = CAM_Z - S.to.z, k = d0 - d1 > 1e-6 ? (d0 - d0 * Math.pow(d1 / d0, Math.pow(u, 1.15))) / (d0 - d1) : u;
      // (its way: straight for its place on the glass, with a turn of a screw to it that
      // dies out as it gets there; it points the way it is going)
      zN.subVectors(S.to, S.from).normalize();
      zA.crossVectors(zN, bY).normalize();
      zB.crossVectors(zN, zA);
      const L = Math.min(SALVO.len, at.h * 0.22) * view.wpp, wob = L * 0.55 * Math.sin(Math.PI * Math.min(1, u * 1.15)) * (1 - u), ph = S.ph + S.t * 9;
      zP.copy(S.from).lerp(S.to, k).addScaledVector(zA, Math.cos(ph) * wob).addScaledVector(zB, Math.sin(ph) * wob);
      zD.subVectors(zP, S.at);
      const went = zD.length();
      if (went < 1e-6) zD.copy(zN);
      zD.normalize();
      const sc = L * (0.35 + 0.65 * smooth(clamp01(u / 0.18)));
      g.position.copy(zP);
      g.quaternion.setFromUnitVectors(bY, zD).multiply(zQ.setFromAxisAngle(bY, S.t * 11));
      g.scale.setScalar(sc);
      g.visible = true;
      const lick = 0.75 + 0.5 * Math.random(); // (the flame, never the same length twice)
      K.flame.scale.set(1, lick, 1);
      K.flame.position.y = -0.38 * (1 - lick);
      // (and its smoke, left where its tail has been since the last frame: a puff every
      // so far along its way, each over the last, so that it is a line and not a string of beads)
      const every = sc * 0.5, n = Math.min(4, Math.ceil(went / every));
      for (let j = 1; j <= n; j++) {
        zS.copy(S.at).lerp(zP, j / n).addScaledVector(zD, -0.55 * sc);
        fx.puff(zS, (Math.random() - 0.5) * sc * 0.4, (Math.random() - 0.3) * sc * 0.4, (Math.random() - 0.5) * sc * 0.4, sc * 0.5, sc * (0.9 + Math.random() * 0.45), 0.4 + Math.random() * 0.3, 0.17, 0xa9bccb);
      }
      S.at.copy(zP);
      if (u < 1) { flying++; return; }
      // on the glass: the burst, and the shake
      S.hit = true;
      g.visible = false;
      fx.boom(i, S.to, R0);
      Z.shake = 0.3;
      sfx(i ? 'salvo-burst' : 'stunt-impact', { gain: 0.7, rate: i ? 0.7 : 1 });
      setFace('surprised', 0.6);
    });
    if (Z.st === 'fire' && Z.shots.length === fx.rockets.length && !flying) { Z.st = 'shut'; Z.t = 0; }
  }
  const zN = new THREE.Vector3(), zA = new THREE.Vector3(), zB = new THREE.Vector3(), zP = new THREE.Vector3(), zD = new THREE.Vector3(), zS = new THREE.Vector3(), zQ = new THREE.Quaternion();

  // Its right hand, after the poses, and the X with it. The hand goes out to the X's rim
  // where it belongs on the card, as it comes up beside it; then the X goes where that
  // hand goes, held by its rim out at its side. Let go of up there, the X is a thing of
  // its own: it falls (drawn over to where it is to stand as it does), hits the card's
  // top edge, bounces, rocks and settles, stood on the edge against the guide's side,
  // leaning its way. The guide comes down beside it with that arm behind it, as far round
  // it from the far side as the arm is long: the arm is not drawn where the X is (uDisc)
  // nor the hand at its rim (uGrip), only the three fingers, posed one by one, hooked
  // over the rim onto the X's face. The X is the page's own button all along, moved,
  // never drawn here.
  const hTo = new THREE.Vector3(), hA = new THREE.Vector3(), hB = new THREE.Vector3(), hIn = new THREE.Vector3(), hPole = new THREE.Vector3();
  const armR = armSide.indexOf(Math.min(...armSide)); // (the model's own right)
  const XFALL = { g: 2600, pull: 50, drag: 11, bounce: 0.38, rock: 130, calm: 9 }; // px/s²; toward its spot (1/s², 1/s); kept of a bounce; its rocking (1/s², 1/s)
  function perchHold(dt) {
    const Q = trans && trans.kind === 'case' ? trans.perch : null;
    if (Q) perchBlast(Q, dt);
    const G = Q && armR >= 0 && (Q.got || Q.reach >= 0.01) ? perchSpot() : null;
    if (!G) { shared.uDisc.value.z = 0; return; }
    const half = G.half, hp = Q.hp, arm = arms[armR], X = Q.X;
    const GRIP = 1.12; // (carrying it, its palm is just off the rim, the fingers on it)
    arm[0].getWorldPosition(kS);
    const [sx, sy] = toCanvas(kS);
    let masked = false;
    if (!Q.got) {
      toWorld(G.x + half * GRIP, G.y, kS.z, hTo);
      reach(arm, hTo, Q.reach);
      return;
    }
    if (!X.free) {
      // carried: from its place, out at the guide's side
      toWorld(G.x + half * GRIP + (sx - hp * PERCH.arm - G.x - half * GRIP) * Q.take, G.y + (sy + hp * 0.03 - G.y) * Q.take, kS.z, hTo);
      reach(arm, hTo, 1);
      const [px, py] = toCanvas(arm[2].getWorldPosition(hTo)); // (by where the hand really is)
      const nx = G.x + (px - half * GRIP - G.x) * Q.take, ny = G.y + (py - G.y) * Q.take;
      if (dt > 1e-4 && Q.take > 0.05) { // (how fast it goes: let go of, it goes on at that)
        X.vx += (clamp((nx - X.x) / dt, -900, 900) - X.vx) * damp(20, dt);
        X.vy += (clamp((ny - X.y) / dt, -900, 900) - X.vy) * damp(20, dt);
      }
      X.x = nx;
      X.y = ny;
    } else {
      // on its own: down onto the edge, where it stands
      const xf = Q.bx - hp * PERCH.side - half, yf = G.top - half + 1;
      if (!X.down && X.va === 0) X.va = -5; // (it tumbles a little as it goes)
      for (let n = dt; n > 1e-6; n -= 1 / 240) {
        const h = Math.min(n, 1 / 240);
        X.vy += XFALL.g * h;
        X.vx += ((xf - X.x) * XFALL.pull - X.vx * XFALL.drag) * h;
        X.x += X.vx * h;
        X.y += X.vy * h;
        if (X.y >= yf) {
          X.y = yf;
          if (X.vy > 70) {
            if (!X.down) sfx('card-tug', { gain: 0.6 });
            X.va += 0.012 * X.vy; // (it rocks with the knock)
            X.vy *= -XFALL.bounce;
          } else X.vy = 0;
          X.down = true;
        }
        X.va += ((PERCH.lean - X.a) * XFALL.rock - X.va * XFALL.calm) * h;
        X.a += X.va * h;
      }
      // The hand: behind it, at its rim, and the fingers over the rim. Where on the rim:
      // from the far side round toward the near one, the first place its arm is long
      // enough for (o: out from the X's middle there, on the screen).
      const wpp = (view.wpp * (CAM_Z - kS.z)) / CAM_Z, z0 = kS.z; // (a pixel, at its shoulder's distance)
      const armLen = (arm[0].getWorldPosition(hA).distanceTo(arm[1].getWorldPosition(hB)) + hB.distanceTo(arm[2].getWorldPosition(hA))) / wpp;
      const palm = fingers.length ? fingers[Math.min(1, fingers.length - 1)][0].getWorldPosition(hA).distanceTo(fingers[Math.min(1, fingers.length - 1)][1].getWorldPosition(hB)) / wpp : half * 0.4;
      const L = armLen * 0.92; // (as far as it reaches, less a little)
      let ox = -1, oy = 0;
      for (let deg = 180; deg >= 30; deg -= 10) {
        ox = Math.cos((deg * Math.PI) / 180);
        oy = -Math.sin((deg * Math.PI) / 180);
        if (Math.hypot(X.x + (half - palm) * ox - sx, X.y + (half - palm) * oy - sy) <= L) break;
      }
      const rx = X.x + half * ox, ry = X.y + half * oy;
      // (the wrist a palm's length in from the rim, behind the X; the elbow back, out of sight)
      toWorld(rx - (palm - 2) * ox, ry - (palm - 2) * oy, z0, hTo);
      reach(arm, hTo, Q.set, hPole.set(0, 0.15, -1).normalize());
      // The fingers: side by side along the rim, their knuckles at it; each comes
      // round the edge toward us and lies back over the X's face.
      hIn.set(-ox, oy, 0); // (in toward the X's middle, in the world: up is up there)
      fingers.forEach(([wrist, f1, f2, tip], i) => {
        const along = (i - (fingers.length - 1) / 2) * hp * 0.036;
        toWorld(rx + ox - along * oy, ry + oy + along * ox, z0, hTo);
        swing(wrist, f1, hTo, Q.set);
        const l1 = f1.getWorldPosition(hA).distanceTo(f2.getWorldPosition(hB));
        hTo.copy(hA).addScaledVector(hIn, l1 * 0.85).z += l1 * 0.55;
        swing(f1, f2, hTo, Q.set);
        if (!tip) return;
        const l2 = f2.getWorldPosition(hA).distanceTo(tip.getWorldPosition(hB));
        hTo.copy(hA).addScaledVector(hIn, l2).z += l2 * 0.1;
        swing(f2, tip, hTo, Q.set);
      });
      const pr = renderer.getPixelRatio();
      shared.uDisc.value.set(X.x * pr, (view.h - X.y) * pr, half * pr);
      shared.uGrip.value.set(rx * pr, (view.h - ry) * pr, half * 0.8 * pr);
      masked = true;
    }
    if (!masked) shared.uDisc.value.z = 0;
    const tr = `${(X.x - G.x).toFixed(1)}px ${(X.y - G.y).toFixed(1)}px`, ro = `${X.a.toFixed(3)}rad`;
    if (closeEl.style.translate !== tr) closeEl.style.translate = tr;
    if (closeEl.style.rotate !== ro) closeEl.style.rotate = ro;
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
    if (delivBusy()) return; // (busy bringing the contact card in)
    if (salvo.st) return; // (its hand is up: see stepSalvo)
    const now = performance.now();
    clicks.push(now);
    while (clicks.length && now - clicks[0] > 2500) clicks.shift();
    setFace('surprised', 1);
    puff();
    if (clicks.length >= 4) {
      // (poked four times running: it fires back at the screen, or dances where it can't)
      clicks.length = 0;
      if (!startSalvo()) react('dance');
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
    let pressed = -1e9; // (a field reached with the pointer, not the keyboard)
    form.addEventListener('pointerdown', () => { pressed = performance.now(); }, { passive: true });
    form.addEventListener('focusin', (e) => {
      // (the card not in its place yet: there now, where the field can be seen)
      deliverNow(e.target, performance.now() - pressed < 600);
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
  let begun = false; // (nothing is drawn before the guide's entrance: see Go)
  function wake() {
    if (!begun || running || document.hidden) return;
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
    stepDeliver(dt); // (bringing the contact card in, it has the frame: no resting spring)

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
    stepTransit(dt);
    // (the stage is over a scene for the show alone: with any other scene open it is out
    // of the way again at once; with none, once the scene's way out has run, which it is
    // a layer of)
    if (stage.over && !(trans && trans.kind === 'case') && (sceneOpen() || !doc.classList.contains('vt'))) stageOver(false);
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
    perchHold(dt);
    applyCheer(dt); // (before the salvo: the hand that fires is posed over a cheer, not under it)
    stepSalvo(dt);
    stepChest(dt);
    maskTunnel();
    stepPhones(dt);
    updateSeatMark();

    // face
    face.surprised = Math.max(0, face.surprised - dt * 1.2);
    face.sad = Math.max(0, face.sad - dt * 0.5);
    if (faceMesh) {
      const d = faceMesh.morphTargetDictionary;
      const inf = faceMesh.morphTargetInfluences;
      if (d[MODEL.face.surprised] !== undefined) inf[d[MODEL.face.surprised]] = face.surprised;
      if (d[MODEL.face.sad] !== undefined) inf[d[MODEL.face.sad]] = face.sad;
    }
    // (the same face on the helmet: its eyes open tall when startled, narrow and dim
    // when sad, and blink now and then)
    if (visor.mat) {
      // (no blink with reduced motion: the loop sleeps there, and would sleep on shut eyes)
      if (!reduced) {
        visor.blink -= dt;
        if (visor.blink < -0.13) visor.blink = 2.5 + Math.random() * 4;
      }
      const shut = !reduced && visor.blink < 0 ? Math.sin((-visor.blink / 0.13) * Math.PI) : 0;
      const k = clamp(1 + 0.45 * face.surprised - 0.5 * face.sad, 0.35, 1.5) * (1 - 0.92 * shut); // (wide with surprise, low when sad, shut in a blink: never taller than the visor)
      for (const eye of visor.eyes) { eye.scale.y = k; eye.position.y = visor.y0 * (1 - k); }
      visor.mat.emissiveIntensity = (1.7 + 1.2 * face.surprised) * (1 - 0.5 * face.sad);
      if (visor.glow) visor.glow.opacity = 0.26 * (0.8 + 0.5 * face.surprised) * (1 - 0.5 * face.sad) * (1 - 0.9 * shut); // (its glow on the mask, out with the light)
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
  // The sound gate first (sound.js): the guide comes in once the visitor has said with
  // sound or without, so its entrance is already heard (or already quiet), headphones on.
  if (window.abissalGate) await window.abissalGate;
  begun = true;
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
  window.__avatar = { dbg, renderer, react, travelTo, get phones() { return { want: phones.want, k: phones.k, vis: phones.vis, shown: !!(phones.group && phones.group.visible), glow: phones.glow ? phones.glow.emissiveIntensity : 0, fx: phones.fx ? phones.fx.mode : null }; }, get section() { return section; }, get trans() { return trans; }, get grip() { return { w: grip.w, tug: tug.x }; }, get deliv() { return { st: deliv.st, x: Math.round(deliv.x), t: +deliv.t.toFixed(3) }; }, get scrub() { return { on: scrub.on, u: +scrub.u.toFixed(3), mid: scrub.mid, jumping, d: +shared.uDissolve.value.toFixed(2) }; }, get jr() { return { on: jr.on, p: +jr.lastP.toFixed(3), w: +jr.w.toFixed(2), pin: +jr.pin.toFixed(2), air: +jr.air.toFixed(2), hop: trans && trans.kind === 'hop' ? +(trans.t / trans.dur).toFixed(3) : null, at: [Math.round(at.x), Math.round(at.y), Math.round(at.h), +at.yaw.toFixed(2)] }; }, get head() { return { m: +head.m.toFixed(3), to: head.to, vx: Math.round(head.vx), yaw: +pivot.rotation.y.toFixed(2), tilt: +tilt.rotation.x.toFixed(2) }; }, get tun() { return { on: tun.active, g: +tun.g.toFixed(3), f: +storyF().toFixed(3), mask: !!tun.mask, carry: !!tun.carry, clip: shared.uClipAll.value, hidden: tun.hidden, tilt: +jr.tilt.toFixed(2), fly: +jr.fly.toFixed(2) }; }, get runner() { return { on: runner.on, v: +runner.v.toFixed(2), dir: runner.dir, idx: runner.idx, yaw: +runner.yaw.toFixed(2), cheer: +cheer.t.toFixed(2), base: baseName, at: [Math.round(at.x), Math.round(at.y), Math.round(at.h)] }; }, cheer: () => startCheer(), get suit() { return visor.dbg; }, get perch() { const Q = trans && trans.kind === 'case' ? trans.perch : null; return { st: Q ? Q.st : null, u: Q ? +Q.u.toFixed(2) : 0, hp: Q ? Math.round(Q.hp) : 0, seat: +perch.seat.toFixed(2), legs: perch.legs.map((L) => +L.a.toFixed(3)), over: stage.over, top: stage.top }; }, get heard() { return { v: +heard.v.toFixed(2), fast: heard.fast, lit: jet.lit, feet: footLow.map((y) => +((y - footRest) / modelH).toFixed(4)), seen: heard.feet.map((F) => +F.y.toFixed(4)) }; } };
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
  m.userData.uArm = { value: 0 }; // 1 = this part can pass behind an open case's X...
  m.userData.uFing = { value: [-1, -1, -1, -1, -1, -1] }; // ...all but what these bones of its skeleton move: the fingers
  m.userData.uRimK = { value: look && look.rim != null ? look.rim : 1 }; // how much of the teal edge-glow this look takes
  m.userData.uSkip = { value: new THREE.Vector2(-1, -1) }; // two bones of its skeleton whose part of the mesh is not drawn (none: -1)
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, shared);
    sh.uniforms.uClip = m.userData.uClip;
    sh.uniforms.uArm = m.userData.uArm;
    sh.uniforms.uFing = m.userData.uFing;
    sh.uniforms.uRimK = m.userData.uRimK;
    sh.uniforms.uSkip = m.userData.uSkip;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vDPos;\nvarying float vFing;\nvarying float vSkip;\nuniform mat4 uInvRoot;\nuniform float uFing[6];\nuniform vec2 uSkip;')
      .replace('#include <skinning_vertex>', `#include <skinning_vertex>
        vDPos = (uInvRoot * modelMatrix * vec4(transformed, 1.0)).xyz;
        vFing = 0.0;
        vSkip = 0.0;
        #ifdef USE_SKINNING
        for (int i = 0; i < 6; i++) vFing += dot(skinWeight, vec4(lessThan(abs(skinIndex - uFing[i]), vec4(0.5))));
        vSkip = dot(skinWeight, vec4(lessThan(abs(skinIndex - uSkip.x), vec4(0.5)))) + dot(skinWeight, vec4(lessThan(abs(skinIndex - uSkip.y), vec4(0.5))));
        #endif`);
    sh.fragmentShader = sh.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
        varying vec3 vDPos;
        varying float vFing;
        varying float vSkip;
        uniform float uDissolve; uniform float uTime; uniform float uNoiseScale; uniform float uHeight;
        uniform vec3 uRim; uniform vec3 uEdge; uniform float uRimK;
        uniform float uClip; uniform float uClipAll; uniform float uCardOn; uniform vec4 uCardRect; uniform vec4 uAllRect;
        uniform float uArm; uniform vec3 uDisc; uniform vec3 uGrip;
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
        if (vSkip > 0.5) discard;
        if (uClip * uCardOn > 0.5 && gl_FragCoord.x > uCardRect.x && gl_FragCoord.x < uCardRect.z
            && gl_FragCoord.y > uCardRect.y && gl_FragCoord.y < uCardRect.w) discard;
        if (uArm > 0.5 && uDisc.z > 0.0 && vFing < 0.5
            && (distance(gl_FragCoord.xy, uDisc.xy) < uDisc.z || distance(gl_FragCoord.xy, uGrip.xy) < uGrip.z)) discard;
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
        totalEmissiveRadiance += uRim * aRim * RIM_STRENGTH * uRimK + uEdge * aEdge * 1.6;`
      );
  };
  m.customProgramCacheKey = () => 'abyssal-avatar';
  return m;
}
