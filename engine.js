/**
 * Leonardo de Oliveira · Abissal
 * engine.js: the particle sea behind the page, in plain WebGL (no libraries).
 *
 * One point cloud morphs between every scene of the site, entirely on the GPU:
 *   field (hero) -> DNA spine (story) -> code rain (projects) -> neural net (contact)
 *   plus the detail grid (project video), the welcome vortex (intro video) and the
 *   intro burst. The CPU only sends a handful of uniforms per frame: time, eased
 *   scene weights, the camera and the pointer. Nothing is uploaded per particle.
 *
 * Colour language: teal light = agents, amber = human decisions.
 */
(function () {
  'use strict';

  const TAU = Math.PI * 2;

  // ---------------------------------------------------------------------------
  // Shaders
  // ---------------------------------------------------------------------------
  const PARTICLE_VS = `
precision highp float;
attribute vec3 aField;    // hero field position (also drives rain columns and grid lines)
attribute vec3 aSpine;    // DNA spine position
attribute vec3 aNode;     // neural net: start of the synapse (or the node itself)
attribute vec3 aNodeEnd;  // neural net: end of the synapse
attribute vec4 aData;     // x rand, y type (0..1 strands, 2..5 ribs, 6 vertebrae), z node phase, w core (0 dust, .5 synapse, 1 node)

uniform mat4 uProj;
uniform mat4 uView;
uniform float uTime;
uniform float uMorph;
uniform mediump float uMatrix; // shared with the fragment shader, so same precision
uniform float uNeural;
uniform float uGrid;
uniform float uWelcome;
uniform float uLoader;
uniform float uLoad;
uniform float uPulse;
uniform vec3 uPulseOrigin;
uniform float uSpin;
uniform vec2 uCursor;
uniform float uPx;
uniform float uTide;
uniform vec4 uHalo;       // xy centre, zw half extents (world units)
uniform float uHaloZ;
uniform vec3 uHaloCursor;

varying vec3 vColor;
varying float vAlpha;
varying float vWord;

const float FIELD_H = 17.0;
const float PI = 3.14159265;
const float TAU = 6.2831853;

const vec3 TEAL  = vec3(0.388, 0.902, 0.824);
const vec3 SEA   = vec3(0.176, 0.553, 0.643);
const vec3 DEEP  = vec3(0.030, 0.090, 0.180);
const vec3 AMBER = vec3(1.000, 0.702, 0.361);
const vec3 FOAM  = vec3(0.914, 0.945, 0.969);
const vec3 MIST  = vec3(0.576, 0.631, 0.710);

vec3 rotY(vec3 p, float a) {
  float c = cos(a);
  float s = sin(a);
  return vec3(p.x * c + p.z * s, p.y, -p.x * s + p.z * c);
}

void main() {
  float r = aData.x;
  float type = aData.y;
  float human = step(0.985, fract(r * 91.7));            // ~1.5%: human decisions, in amber
  float beat = 0.55 + 0.45 * sin(uTime * 2.2 + r * 40.0);
  float m = smoothstep(0.0, 1.0, uMorph);

  vec3 pos;
  float glow = 0.0;
  float sizeMul = 1.0;
  float word = -1.0;

  // ---- hero field: a drifting sea that parts and lights up around the cursor ----
  vec3 hero = aField;
  if (m < 0.999) {
    hero.x += sin(uTime * 0.16 + aField.y * 0.35 + r * TAU) * 0.8;
    hero.y += cos(uTime * 0.12 + aField.x * 0.25 + r * TAU) * 0.6;
    hero.z += sin(uTime * 0.20 + aField.z * 0.30 + r * TAU) * 0.7;
    vec2 toCursor = hero.xy - vec2(uCursor.x * 13.0, uCursor.y * 7.5);
    float near = smoothstep(4.5, 0.0, length(toCursor)) * (1.0 - m);
    hero.xy += normalize(toCursor + 0.0001) * near * 2.8;
    glow = near;
  }

  // ---- DNA spine, turned by the scroll ----
  vec3 spine = aSpine;
  if (m > 0.001) {
    spine += 0.05 * vec3(sin(uTime * 1.5 + r * 30.0), cos(uTime * 1.3 + r * 25.0), sin(uTime * 1.1 + r * 20.0));
    spine = rotY(spine, uSpin);
  }

  if (m <= 0.001) {
    pos = hero;
  } else if (m >= 0.999) {
    pos = spine;
  } else {
    // a swirl that peaks halfway, so the sea pours into the helix
    vec3 b = mix(hero, spine, m);
    float rad = mix(length(hero.xz), length(spine.xz), m);
    float ang = atan(b.z, b.x) + sin(m * PI) * 2.2;
    pos = vec3(cos(ang) * rad, b.y, sin(ang) * rad);
  }

  float fy = clamp(aField.y / FIELD_H + 0.5, 0.0, 1.0);
  vec3 fieldCol = mix(DEEP, TEAL * 0.85, fy) + TEAL * 0.06 * sin(uTime * 0.4 + r * TAU);

  vec3 spineCol;
  if (type < 0.5) spineCol = TEAL;
  else if (type < 1.5) spineCol = SEA * 1.3;
  else if (type < 2.5) spineCol = TEAL * 0.62;
  else if (type < 5.5) spineCol = SEA * 0.9;
  else spineCol = mix(TEAL * 0.9, MIST * 0.42, smoothstep(0.18, 1.2, length(aSpine.xz)));

  vec3 col = mix(fieldCol, spineCol, m);
  col = mix(col, AMBER * (0.75 + 0.6 * beat), human);

  float sizeF = 1.6;
  float alpha = 0.95;
  if (type < 1.5) { sizeF = 1.3; }
  else if (type < 5.5) { sizeF = 0.8; alpha = 0.75; }

  // ---- intro: a charging core that bursts into the field ----
  if (uLoader > 0.001) {
    vec3 dir = normalize(aField + vec3(0.0001));
    float startDist = 1.0 + fract(r * 7.1) * 4.2;
    float flowSpeed = 2.4 + fract(r * 13.3) * 2.8;
    float stream = mod(r * 97.0 - uTime * flowSpeed, startDist);
    vec3 lp;
    if (r < 0.35) {
      float core = 0.65 + 0.06 * sin(uTime * 8.0 + r * 12.0);
      lp = dir * core + vec3(sin(uTime * 2.0 + r * 5.0), cos(uTime * 1.8 + r * 7.0), sin(uTime * 2.2 + r * 3.0)) * 0.08;
    } else {
      vec3 swarm = vec3(sin(uTime * 3.0 + r * 15.0), cos(uTime * 2.7 + r * 18.0), sin(uTime * 3.3 + r * 12.0));
      lp = dir * max(stream, 0.5) + swarm * max(stream - 0.5, 0.0) * 0.28;
      alpha *= mix(1.0, smoothstep(1.0, 0.75, stream / startDist), uLoader);
    }
    float t = 1.0 - uLoader;
    float burst = sin(t * PI) * 5.8 * (1.0 - t);
    pos = mix(lp, pos + normalize(pos + vec3(0.0001, 0.0, 0.0)) * burst, t);
    if (fract(r * 43.13) > mix(1.0, uLoad * 0.5, uLoader)) alpha = 0.0;
    float energy = mix(0.12, 2.6, pow(uLoad, 1.5));
    vec3 charged = mix(mix(TEAL, FOAM, r * 0.6), AMBER, human) * energy;
    float k = r < 0.35 ? 1.0 : smoothstep(8.0, 0.5, length(lp));
    col = mix(col, charged, k * uLoader);
    sizeMul *= mix(1.0, mix(0.4, 1.65, uLoad) * (1.0 + 0.55 * sin(uTime * (5.0 + 8.0 * uLoad) + r * TAU)), uLoader);
  }

  // ---- code rain behind the projects ----
  if (uMatrix > 0.001) {
    float colW = 0.45;
    float ci = floor(aField.x / colW);
    float cx = ci * colW + colW * 0.5;
    float h1 = fract(sin(ci * 12.9898) * 43758.5453);
    float h2 = fract(sin(ci * 78.2330) * 12345.6789);
    float slot = floor(fy * 11.99);
    float secH = 26.0 / 12.0;
    float py = 13.0 - slot * secH + (fract(r * 13.9) - 0.5) * secH * 0.6;
    float isWord = step(fract(r * 73.9), 0.40);
    word = mix(13.0 + floor(fract(r * 31.7) * 12.0), floor(fract(r * 19.3) * 13.0), isWord);
    float cz = mix(h2 * 27.0 - 35.0, h2 * 19.5 - 8.0, isWord);
    float headY = 13.0 - mod(uTime * (1.6 + h1 * 3.6) + h1 * 26.0, 26.0);
    float above = py - headY;
    if (above < 0.0) above += 26.0;
    float trail = clamp(1.0 - above / (5.0 + h2 * 7.0), 0.0, 1.0);
    float head = smoothstep(1.4, 0.0, abs(above));
    float rain = pow(trail, 2.2) * 0.65 + head * 3.8;
    vec3 rc = mix(SEA * 0.55, TEAL, trail);
    rc = mix(rc, FOAM, smoothstep(0.3, 1.0, head));
    rc = mix(rc, AMBER, human);
    pos = mix(pos, vec3(cx, py, cz), uMatrix);
    col = mix(col, rc * (0.6 + rain), uMatrix);
    alpha = mix(alpha, clamp(rain, 0.0, 1.0), uMatrix);
    sizeMul *= mix(1.0, 3.2 * (0.8 + r * 0.4), uMatrix);
  }

  // ---- neural constellation behind the contact form ----
  if (uNeural > 0.001) {
    float core = aData.w;
    float ph = aData.z;
    float flow = fract(uTime * 0.12 + r);
    vec3 edge = mix(aNode, aNodeEnd, flow);
    vec3 nb = edge + 0.015 * vec3(sin(uTime * 1.3 + r * 20.0), cos(uTime * 1.1 + r * 17.0), sin(uTime * 1.5 + r * 23.0));
    pos = mix(pos, nb, uNeural);
    float idle = 0.55 + 0.45 * sin(uTime * (1.0 + ph * 2.0) + ph * TAU);
    float ring = exp(-pow((distance(edge, uPulseOrigin) - (1.0 - uPulse) * 28.0) * 0.25, 2.0)) * uPulse;
    float ng = idle + ring * 6.5;
    vec3 nc = mix(TEAL, SEA * 1.3, core > 0.25 && core < 0.75 ? flow : ph);
    nc = mix(nc, AMBER, human);
    nc += AMBER * ring * 3.5;                 // a sent message is a human decision: the wave is amber
    vec3 ncol;
    float na;
    float ns;
    if (core > 0.75) {
      ncol = nc * (0.5 + ng);
      na = clamp(0.22 + ng * 0.55, 0.0, 1.3);
      ns = 0.55 + ng * 0.6;
    } else if (core > 0.25) {
      float along = sin(flow * PI);
      ncol = nc * (0.7 + ng * 0.5);
      na = clamp(0.12 + along * 0.58 + ng * 0.4, 0.0, 1.1);
      ns = 0.40 + along * 0.35 + ring * 1.5;
    } else {
      ncol = DEEP * 1.4 + AMBER * ring;
      na = 0.04 + ring * 0.4;
      ns = 0.22 + ring * 0.8;
    }
    col = mix(col, ncol, uNeural);
    alpha = mix(alpha, na, uNeural);
    sizeMul *= mix(1.0, ns, uNeural);
  }

  // ---- holographic floor under an open project ----
  if (uGrid > 0.001) {
    float nx = aField.x / 30.0 + 0.5;
    float ny = aField.y / 17.0 + 0.5;
    float isX = step(nx, 0.5);
    float snap = floor(ny * 23.99) / 23.0;
    float gx = mix(14.0 + (snap - 0.5) * 36.0, 14.0 + (nx * 2.0 - 0.5) * 36.0, isX);
    float gz = mix(((nx - 0.5) * 2.0 - 0.5) * 24.0, (snap - 0.5) * 24.0, isX);
    float gy = -3.5 - gz * 0.12 + sin(uTime * 2.5 + (gx + gz) * 0.15) * 0.04;
    float pv = sin(mix(gz, gx, isX) * 0.25 - uTime * 4.8 + r * PI) * 0.5 + 0.5;
    float pg = pow(pv, 5.0) * 1.8;
    float radial = smoothstep(18.0, 6.0, distance(vec2(gx, gz), vec2(14.0, 0.0)));
    vec3 gc = mix(mix(TEAL, SEA * 1.2, fract(r * 17.3)), FOAM, pg * 0.4);
    gc = mix(gc, AMBER, human);
    pos = mix(pos, vec3(gx, gy, gz), uGrid);
    col = mix(col, gc, uGrid);
    alpha = mix(alpha, max(0.0, 0.28 + 0.38 * sin(uTime * 1.5 + r * TAU) + pg * 0.42) * radial, uGrid);
    sizeMul *= mix(1.0, 1.45 * (0.8 + r * 0.4) * (1.0 + pg * 0.65), uGrid);
  }

  // ---- vortex around the "who am I" video ----
  if (uWelcome > 0.001) {
    float wa = r * TAU + uTime * 0.28 + r * 0.5;
    float wr = 8.6 + 4.8 * fract(r * 7.3);
    vec3 wp = vec3(cos(wa) * wr, sin(wa) * wr * 0.52, -2.0 + sin(uTime * 1.5 + r * TAU) * 0.4);
    vec3 wc = mix(TEAL, SEA * 1.3, fract(r * 19.3)) * (1.0 + 0.35 * sin(uTime * 2.0 + r * TAU));
    wc = mix(wc, AMBER, human);
    pos = mix(pos, wp, uWelcome);
    col = mix(col, wc, uWelcome);
    alpha = mix(alpha, max(0.0, 0.28 + 0.48 * sin(uTime * 1.8 + r * TAU)), uWelcome);
    sizeMul *= mix(1.0, 1.35 * (0.8 + r * 0.4) * (1.0 + 0.35 * sin(uTime * 3.0 + r * TAU)), uWelcome);
  }

  // ---- tide: ~4% of the spine drifts off and haloes the hovered story card ----
  float tide = 0.0;
  if (uTide > 0.001 && fract(r * 53.17) < 0.04) {
    float seed = fract(r * 7.77) * TAU;
    float band = fract(r * 3.31) * 0.36 + step(0.82, fract(r * 5.93)) * 0.5;
    float freq = 0.6 + fract(r * 2.71) * 0.8;
    float ang = seed + uTime * (fract(r * 11.1) - 0.5) * 0.12;
    float reach = (1.0 + band) * (1.0 + 0.05 * sin(uTime * 0.9)) * (1.0 + 0.16 * sin(uTime * freq + seed));
    vec3 halo = vec3(uHalo.xy + vec2(cos(ang) * uHalo.z, sin(ang) * uHalo.w) * reach,
                     uHaloZ + 0.18 + sin(uTime * freq * 0.7 + seed) * 0.12);
    float lag = fract(r * 4.13) * 0.45;
    float e = clamp((uTide - lag) / (1.0 - lag), 0.0, 1.0);
    e = e * e * (3.0 - 2.0 * e);
    float swell = sin(e * PI);
    halo += vec3(sin(uTime * 0.6 + seed) * 0.55, cos(uTime * 0.5 + seed * 1.3) * 0.45, sin(uTime * 0.7 + seed * 0.7) * 0.4) * swell;
    vec3 away = halo - uHaloCursor;
    float d = length(away) + 0.0001;
    float lens = max(0.0, 1.0 - d / 2.4);
    halo += away / d * lens * lens * 1.7;
    pos = mix(pos, halo, e);
    tide = e;
    float sweep = 0.5 + 0.5 * sin(uTime * 0.5 + seed * 3.0);
    col = mix(col, mix(TEAL, FOAM, sweep * 0.6) * (0.85 + 0.15 * sin(uTime * 0.9 + seed)), e);
    alpha = mix(alpha, 1.0, e);
  }

  vec4 mv = uView * vec4(pos, 1.0);
  gl_Position = uProj * mv;
  float dist = -mv.z;
  float fade = smoothstep(55.0, 10.0, dist) * smoothstep(1.5, 3.5, dist);

  float size = 0.5 * uPx * (280.0 / (dist + 2.0)) * (0.6 + r * 0.9) * sizeF * sizeMul;
  size *= 1.0 + human * beat * (1.0 - uMatrix) * 0.9;
  size += (glow * 1.6 + tide * 1.2) * uPx;
  gl_PointSize = clamp(size, 1.0, (40.0 + 16.0 * uMatrix * step(0.0, word)) * uPx);

  vColor = col + FOAM * glow * 0.55;
  vAlpha = alpha * fade;
  vWord = word;
}
`;

  const PARTICLE_FS = `
precision mediump float;
uniform sampler2D uAtlas;
uniform float uMatrix;
varying vec3 vColor;
varying float vAlpha;
varying float vWord;

void main() {
  float d = length(gl_PointCoord - 0.5);
  float a = clamp(1.0 - d * 2.0, 0.0, 1.0);
  a *= a;
  a *= a;
  if (uMatrix > 0.001 && vWord >= 0.0) {
    float c = mod(vWord, 5.0);
    float row = floor(vWord / 5.0);
    vec2 uv = vec2((c + gl_PointCoord.x) / 5.0, (row + 1.0 - gl_PointCoord.y) / 5.0);
    a = mix(a, texture2D(uAtlas, uv).a, uMatrix);
  }
  gl_FragColor = vec4(vColor * (a * vAlpha * 0.95), 1.0);
}
`;

  const STAR_VS = `
precision highp float;
attribute vec3 aPos;
uniform mat4 uProj;
uniform mat4 uView;
uniform float uRot;
uniform float uScale;
varying float vA;
void main() {
  float c = cos(uRot);
  float s = sin(uRot);
  vec3 p = vec3(aPos.x * c + aPos.z * s, aPos.y, -aPos.x * s + aPos.z * c);
  vec4 mv = uView * vec4(p, 1.0);
  gl_Position = uProj * mv;
  float dist = -mv.z;
  // Dust, a pixel or two across. The field turns slowly, and one drifting right past the
  // camera would otherwise grow into a big grey square: capped, and faded out up close.
  gl_PointSize = clamp(0.05 * uScale / max(dist, 0.1), 1.0, 0.006 * uScale);
  vA = smoothstep(1.5, 4.0, dist);
}
`;

  const STAR_FS = `
precision mediump float;
varying float vA;
void main() {
  vec2 q = gl_PointCoord - 0.5;
  if (dot(q, q) > 0.25) discard; // (round, not square)
  gl_FragColor = vec4(vec3(0.26, 0.29, 0.32) * vA, 1.0);
}
`;

  // Sparks fired when the contact form is sent: analytic flight, no CPU simulation.
  const SPARK_VS = `
precision highp float;
attribute vec4 aSeed;
uniform mat4 uProj;
uniform mat4 uView;
uniform float uT;
uniform vec3 uOrigin;
uniform float uScale;
uniform float uPx;
varying vec3 vC;
void main() {
  float ang = aSeed.x * 6.2831853;
  float th = aSeed.y * 0.4538;
  float speed = 12.0 + aSeed.z * 16.0;
  vec3 v0 = vec3(cos(ang) * sin(th), sin(ang) * sin(th), cos(th)) * speed + vec3(0.0, 1.2 + aSeed.w * 2.2, 4.0);
  float k = 3.08;
  float travel = (1.0 - exp(-k * uT)) / k;
  vec3 wobble = vec3(sin(uT * 10.0 + aSeed.x * 50.0), cos(uT * 8.0 + aSeed.y * 50.0), 0.0) * 0.3 * uT;
  vec3 p = uOrigin + vec3(aSeed.x - 0.5, aSeed.y - 0.5, 0.0) * 0.4 + v0 * travel + wobble;
  vec4 mv = uView * vec4(p, 1.0);
  gl_Position = uProj * mv;
  float dist = -mv.z;
  float life = clamp(1.0 - uT / (1.0 + aSeed.w * 0.6), 0.0, 1.0);
  gl_PointSize = clamp(0.88 * uScale / max(dist, 0.5), 1.0, 48.0 * uPx);
  vC = mix(vec3(0.914, 0.945, 0.969), vec3(1.0, 0.702, 0.361), clamp(uT * 1.6, 0.0, 1.0)) * life * smoothstep(0.8, 3.0, dist);
}
`;

  const SPARK_FS = `
precision mediump float;
varying vec3 vC;
void main() {
  float d = length(gl_PointCoord - 0.5);
  float g = clamp(1.0 - d * 2.0, 0.0, 1.0);
  gl_FragColor = vec4(vC * g * g, 1.0);
}
`;

  // ---------------------------------------------------------------------------
  // Small helpers
  // ---------------------------------------------------------------------------
  function mulberry32(seed) {
    return function () {
      seed |= 0;
      seed = (seed + 0x6d2b79f5) | 0;
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);

  function perspective(out, fovy, aspect, near, far) {
    const f = 1 / Math.tan(fovy / 2);
    const nf = 1 / (near - far);
    out.fill(0);
    out[0] = f / aspect;
    out[5] = f;
    out[10] = (far + near) * nf;
    out[11] = -1;
    out[14] = 2 * far * near * nf;
    return out;
  }

  // Writes the view matrix and keeps the camera basis for unprojecting rays.
  function lookAt(out, basis, eye, target) {
    let zx = eye[0] - target[0], zy = eye[1] - target[1], zz = eye[2] - target[2];
    let len = Math.hypot(zx, zy, zz) || 1;
    zx /= len; zy /= len; zz /= len;
    // x = normalize(cross(up(0,1,0), z))
    let xx = zz, xy = 0, xz = -zx;
    len = Math.hypot(xx, xy, xz) || 1;
    xx /= len; xy /= len; xz /= len;
    // y = cross(z, x)
    const yx = zy * xz - zz * xy;
    const yy = zz * xx - zx * xz;
    const yz = zx * xy - zy * xx;
    out[0] = xx; out[1] = yx; out[2] = zx; out[3] = 0;
    out[4] = xy; out[5] = yy; out[6] = zy; out[7] = 0;
    out[8] = xz; out[9] = yz; out[10] = zz; out[11] = 0;
    out[12] = -(xx * eye[0] + xy * eye[1] + xz * eye[2]);
    out[13] = -(yx * eye[0] + yy * eye[1] + yz * eye[2]);
    out[14] = -(zx * eye[0] + zy * eye[1] + zz * eye[2]);
    out[15] = 1;
    basis.x[0] = xx; basis.x[1] = xy; basis.x[2] = xz;
    basis.y[0] = yx; basis.y[1] = yy; basis.y[2] = yz;
    basis.z[0] = zx; basis.z[1] = zy; basis.z[2] = zz;
    return out;
  }

  function compile(gl, type, src) {
    const s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    return s;
  }

  function program(gl, vsSrc, fsSrc) {
    const vs = compile(gl, gl.VERTEX_SHADER, vsSrc);
    const fs = compile(gl, gl.FRAGMENT_SHADER, fsSrc);
    const p = gl.createProgram();
    gl.attachShader(p, vs);
    gl.attachShader(p, fs);
    gl.linkProgram(p);
    return { p, vs, fs };
  }

  function checkProgram(gl, prog) {
    if (gl.getProgramParameter(prog.p, gl.LINK_STATUS)) return true;
    console.error('[abyss]', gl.getShaderInfoLog(prog.vs) || '', gl.getShaderInfoLog(prog.fs) || '', gl.getProgramInfoLog(prog.p) || '');
    return false;
  }

  function uniforms(gl, p, names) {
    const u = {};
    names.forEach((n) => { u[n] = gl.getUniformLocation(p, n); });
    return u;
  }

  // ---------------------------------------------------------------------------
  // Geometry: every target layout is baked once into one interleaved buffer.
  // The order is shuffled so that drawing the first N vertices is a fair sample,
  // which is how quality drops on slow devices without rebuilding anything.
  // ---------------------------------------------------------------------------
  const STRIDE = 16; // aField 3, aSpine 3, aNode 3, aNodeEnd 3, aData 4

  function buildParticles(count, rnd) {
    const ROWS = 12;
    const COLS = Math.max(2, Math.round(count / ROWS));
    count = COLS * ROWS;
    const FIELD_W = 30, FIELD_H = 17;
    const SPINE_LEN = 20, SPINE_TURNS = 4, SPINE_RADIUS = 3.6;

    const field = new Float32Array(count * 3);
    const spine = new Float32Array(count * 3);
    const node = new Float32Array(count * 3);
    const nodeEnd = new Float32Array(count * 3);
    const data = new Float32Array(count * 4);

    let k = 0;
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        field[k * 3] = (c / (COLS - 1) - 0.5) * FIELD_W;
        field[k * 3 + 1] = (r / (ROWS - 1) - 0.5) * FIELD_H;
        field[k * 3 + 2] = (rnd() - 0.5) * 12;
        data[k * 4] = rnd();
        k++;
      }
    }

    for (let i = 0; i < count; i++) {
      const t = i / (count - 1);
      const yb = (t - 0.5) * SPINE_LEN;
      const ang = t * TAU * SPINE_TURNS;
      const taper = SPINE_RADIUS * (0.5 + 0.5 * Math.sin(t * Math.PI));
      const bucket = i % 8;
      let x, y = yb, z, type;
      if (bucket < 6) {
        const off = bucket < 3 ? 0 : 2.2;
        const th = rnd() * TAU;
        const ro = rnd() * 0.15;
        x = Math.sin(ang + off) * taper + Math.cos(th) * ro;
        z = Math.cos(ang + off) * taper + Math.sin(th) * ro;
        y += (rnd() - 0.5) * 0.06;
        type = bucket < 3 ? 0 : 1;
      } else if (bucket === 6) {
        const PLATES = 60;
        const plateY = (Math.floor(t * PLATES) / (PLATES - 1) - 0.5) * SPINE_LEN;
        const a = rnd() * TAU;
        const rr = Math.sqrt(rnd()) * 1.3 * (0.5 + 0.5 * Math.sin(t * Math.PI));
        x = Math.sin(a) * rr;
        z = Math.cos(a) * rr;
        y = plateY + (rnd() - 0.5) * 0.04;
        type = 6;
      } else {
        const strand = i % 2;
        const a = ang + (strand ? 2.2 : 0);
        const f = rnd();
        x = Math.sin(a) * taper * f;
        z = Math.cos(a) * taper * f;
        y = yb + (rnd() - 0.5) * 0.02;
        type = strand ? 4 : 2;
      }
      spine[i * 3] = x;
      spine[i * 3 + 1] = y;
      spine[i * 3 + 2] = z;
      data[i * 4 + 1] = type;
    }

    // Neural net: nodes on a jittered grid, each linked to its 3-5 nearest neighbours.
    const NC = 16, NR = 6;
    const nodes = [];
    for (let r = 0; r < NR; r++) {
      for (let c = 0; c < NC; c++) {
        nodes.push([
          (c / (NC - 1) - 0.5) * 48 + (rnd() - 0.5) * 1.5,
          (r / (NR - 1) - 0.5) * 26 + (rnd() - 0.5) * 1.5,
          (rnd() - 0.5) * 16 - 0.5,
        ]);
      }
    }
    const edges = [];
    const seen = new Set();
    for (let i = 0; i < nodes.length; i++) {
      const d = [];
      for (let j = 0; j < nodes.length; j++) {
        if (i !== j) d.push([Math.hypot(nodes[i][0] - nodes[j][0], nodes[i][1] - nodes[j][1], nodes[i][2] - nodes[j][2]), j]);
      }
      d.sort((a, b) => a[0] - b[0]);
      const links = 3 + (rnd() < 0.5 ? 2 : 0);
      for (let q = 0; q < links; q++) {
        const j = d[q][1];
        const key = i < j ? i + '_' + j : j + '_' + i;
        if (!seen.has(key)) { seen.add(key); edges.push([i, j]); }
      }
    }
    const phase = nodes.map(() => rnd());
    let cores = 0;
    for (let i = 0; i < count; i++) {
      const pick = rnd();
      let a, b, ph, core;
      if (pick < 0.3) {
        const id = cores++ % nodes.length;
        const u = rnd() * 2 - 1, th = rnd() * TAU, s = Math.sqrt(Math.max(0, 1 - u * u));
        const rad = 0.006 + data[i * 4] * data[i * 4] * 0.03;
        const n = nodes[id];
        a = b = [n[0] + s * Math.cos(th) * rad, n[1] + u * rad, n[2] + s * Math.sin(th) * rad];
        ph = phase[id];
        core = 1;
      } else if (pick < 0.9) {
        const e = edges[i % edges.length];
        a = nodes[e[0]];
        b = nodes[e[1]];
        ph = phase[e[0]];
        core = 0.5;
      } else {
        a = b = [(rnd() - 0.5) * 52, (rnd() - 0.5) * 30, (rnd() - 0.5) * 20 - 2];
        ph = rnd();
        core = 0;
      }
      node.set(a, i * 3);
      nodeEnd.set(b, i * 3);
      data[i * 4 + 2] = ph;
      data[i * 4 + 3] = core;
    }

    // Interleave in a shuffled order.
    const order = new Uint32Array(count);
    for (let i = 0; i < count; i++) order[i] = i;
    for (let i = count - 1; i > 0; i--) {
      const j = Math.floor(rnd() * (i + 1));
      const tmp = order[i]; order[i] = order[j]; order[j] = tmp;
    }
    const out = new Float32Array(count * STRIDE);
    for (let n = 0; n < count; n++) {
      const i = order[n];
      const o = n * STRIDE;
      out[o] = field[i * 3]; out[o + 1] = field[i * 3 + 1]; out[o + 2] = field[i * 3 + 2];
      out[o + 3] = spine[i * 3]; out[o + 4] = spine[i * 3 + 1]; out[o + 5] = spine[i * 3 + 2];
      out[o + 6] = node[i * 3]; out[o + 7] = node[i * 3 + 1]; out[o + 8] = node[i * 3 + 2];
      out[o + 9] = nodeEnd[i * 3]; out[o + 10] = nodeEnd[i * 3 + 1]; out[o + 11] = nodeEnd[i * 3 + 2];
      out[o + 12] = data[i * 4]; out[o + 13] = data[i * 4 + 1]; out[o + 14] = data[i * 4 + 2]; out[o + 15] = data[i * 4 + 3];
    }
    return { data: out, count };
  }

  // Words for the code rain: 13 technologies, then 12 binary strings.
  const WORDS = [
    'ANGULAR', 'CSHARP', 'JAVA', 'REACT', 'PYTHON',
    'AMAZON', 'GOOGLE', 'AI', 'NODE', 'DOCKER',
    'TYPESCRIPT', 'KUBERNETES', 'NEXTJS',
    '10110', '01001', '11010', '00111', '10100',
    '11001', '01101', '10011', '00010', '11100',
    '01010', '10111',
  ];

  function drawAtlas() {
    const size = 1024;
    const cvs = document.createElement('canvas');
    cvs.width = size;
    cvs.height = size;
    const ctx = cvs.getContext('2d');
    const cell = size / 5;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#fff';
    WORDS.forEach((w, i) => {
      const x = (i % 5) * cell + cell / 2;
      const y = Math.floor(i / 5) * cell + cell / 2;
      const n = w.length;
      const fs = n > 8 ? 20 : n > 5 ? 24 : 32;
      ctx.font = `500 ${fs}px "JetBrains Mono", ui-monospace, "Courier New", monospace`;
      const y0 = y - ((n - 1) * fs) / 2;
      for (let c = 0; c < n; c++) ctx.fillText(w[c], x, y0 + c * fs);
    });
    return cvs;
  }

  // ---------------------------------------------------------------------------
  // Engine
  // ---------------------------------------------------------------------------
  function create(canvas, opts) {
    opts = opts || {};
    // No GPU (software rendering) means a slow, hot page: those visitors get the static sea instead.
    const gl = canvas.getContext('webgl', {
      failIfMajorPerformanceCaveat: true,
      alpha: false,
      antialias: false,
      depth: false,
      stencil: false,
      premultipliedAlpha: true,
      preserveDrawingBuffer: false,
      powerPreference: 'high-performance',
    });
    if (!gl) return null;

    const reduced = !!opts.reducedMotion;
    const maxCount = opts.count || 6000;
    const parallel = gl.getExtension('KHR_parallel_shader_compile');

    // Scene weights ease toward their targets. Rates are per second.
    const keys = ['morph', 'matrix', 'neural', 'grid', 'welcome', 'tide'];
    const value = { morph: 0, matrix: 0, neural: 0, grid: 0, welcome: 0, tide: 0 };
    const target = { morph: 0, matrix: 0, neural: 0, grid: 0, welcome: 0, tide: 0 };
    const rate = { morph: 12, matrix: 10, neural: 10, grid: 6, welcome: 5, tide: 2.4 };

    const cam = { x: 0, y: 0, z: 13 };          // eased camera position
    const rig = { x: 0, y: 0, z: 13 };          // camera target (detail view moves it)
    const pointer = { x: 0, y: 0, sx: 0, sy: 0 };
    let spinTarget = 0, spin = 0, lookX = 0;
    let time = reduced ? 7.0 : 0;
    let loader = reduced ? 0 : 1;
    let load = reduced ? 1 : 0;
    let introClock = 0;
    let pulse = 0;
    let shake = 0;
    let sparkT = -1;
    const pulseOrigin = [0, 0, 0];
    const sparkOrigin = [0, 0, 0];
    let haloEl = null;
    const halo = [0, 0, 2, 1.2];
    const haloCursor = [0, 0, 100];
    const HALO_Z = 6;

    let cssW = 1, cssH = 1, dpr = 1, aspect = 1;
    let quality = { dpr: opts.dpr || 1, count: maxCount };
    const FOV = (60 * Math.PI) / 180;

    const proj = new Float32Array(16);
    const view = new Float32Array(16);
    const basis = { x: [1, 0, 0], y: [0, 1, 0], z: [0, 0, 1] };
    const eye = [0, 0, 13];
    const look = [0, 0, 0];

    let ready = false, lost = false;
    let P, S, K, pBuf, sBuf, kBuf, atlas, atlasReady = false, count = 0;
    let uP, uS, uK, aP, aS, aK;

    function init() {
      const rnd = mulberry32(20131015);
      P = program(gl, PARTICLE_VS, PARTICLE_FS);
      S = program(gl, STAR_VS, STAR_FS);
      K = program(gl, SPARK_VS, SPARK_FS);

      const built = buildParticles(maxCount, rnd);
      count = built.count;
      quality.count = Math.min(quality.count, count);
      pBuf = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, pBuf);
      gl.bufferData(gl.ARRAY_BUFFER, built.data, gl.STATIC_DRAW);

      const stars = new Float32Array(500 * 3);
      for (let i = 0; i < 500; i++) {
        stars[i * 3] = (rnd() - 0.5) * 55;
        stars[i * 3 + 1] = (rnd() - 0.5) * 45;
        stars[i * 3 + 2] = (rnd() - 0.5) * 40 - 12;
      }
      sBuf = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, sBuf);
      gl.bufferData(gl.ARRAY_BUFFER, stars, gl.STATIC_DRAW);

      const sparks = new Float32Array(320 * 4);
      for (let i = 0; i < sparks.length; i++) sparks[i] = rnd();
      kBuf = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, kBuf);
      gl.bufferData(gl.ARRAY_BUFFER, sparks, gl.STATIC_DRAW);

      // 1x1 placeholder until the word atlas is drawn (only needed by the projects rain).
      atlas = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, atlas);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.ALPHA, 1, 1, 0, gl.ALPHA, gl.UNSIGNED_BYTE, new Uint8Array([0]));
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      atlasReady = false;

      gl.disable(gl.DEPTH_TEST);
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.ONE, gl.ONE);
      gl.clearColor(5 / 255, 8 / 255, 16 / 255, 1);
      ready = false;
    }

    // Programs link in the background when the browser supports it, so the first
    // frames never stall the main thread; until then the canvas simply stays dark.
    function finishInit() {
      if (parallel && !gl.getProgramParameter(P.p, parallel.COMPLETION_STATUS_KHR)) return false;
      if (!checkProgram(gl, P) || !checkProgram(gl, S) || !checkProgram(gl, K)) {
        lost = true;
        return false;
      }
      uP = uniforms(gl, P.p, ['uProj', 'uView', 'uTime', 'uMorph', 'uMatrix', 'uNeural', 'uGrid', 'uWelcome', 'uLoader', 'uLoad', 'uPulse', 'uPulseOrigin', 'uSpin', 'uCursor', 'uPx', 'uTide', 'uHalo', 'uHaloZ', 'uHaloCursor', 'uAtlas']);
      uS = uniforms(gl, S.p, ['uProj', 'uView', 'uRot', 'uScale']);
      uK = uniforms(gl, K.p, ['uProj', 'uView', 'uT', 'uOrigin', 'uScale', 'uPx']);
      aP = ['aField', 'aSpine', 'aNode', 'aNodeEnd', 'aData'].map((n) => gl.getAttribLocation(P.p, n));
      aS = gl.getAttribLocation(S.p, 'aPos');
      aK = gl.getAttribLocation(K.p, 'aSeed');
      ready = true;
      return true;
    }

    function ensureAtlas() {
      if (atlasReady) return;
      atlasReady = true;
      const paint = () => {
        if (lost) return;
        gl.bindTexture(gl.TEXTURE_2D, atlas);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.ALPHA, gl.ALPHA, gl.UNSIGNED_BYTE, drawAtlas());
      };
      if (document.fonts && document.fonts.load) {
        document.fonts.load('500 32px "JetBrains Mono"').then(paint, paint);
      } else {
        paint();
      }
    }

    function applySize() {
      dpr = quality.dpr;
      const w = Math.max(1, Math.round(cssW * dpr));
      const h = Math.max(1, Math.round(cssH * dpr));
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
      }
      gl.viewport(0, 0, w, h);
      aspect = cssW / cssH;
      perspective(proj, FOV, aspect, 0.1, 100);
    }

    function resize(w, h) {
      cssW = Math.max(1, w);
      cssH = Math.max(1, h);
      applySize();
    }

    // Screen point (CSS px) -> world point on the plane z = planeZ.
    function unproject(px, py, planeZ, out) {
      const nx = (px / cssW) * 2 - 1;
      const ny = 1 - (py / cssH) * 2;
      const tan = Math.tan(FOV / 2);
      const dx = -basis.z[0] + basis.x[0] * nx * tan * aspect + basis.y[0] * ny * tan;
      const dy = -basis.z[1] + basis.x[1] * nx * tan * aspect + basis.y[1] * ny * tan;
      const dz = -basis.z[2] + basis.x[2] * nx * tan * aspect + basis.y[2] * ny * tan;
      const t = Math.abs(dz) < 1e-5 ? 0 : (planeZ - eye[2]) / dz;
      out[0] = eye[0] + dx * t;
      out[1] = eye[1] + dy * t;
      out[2] = eye[2] + dz * t;
      return out;
    }

    function updateHalo() {
      if (!haloEl) return;
      const r = haloEl.getBoundingClientRect();
      const c = unproject(r.left + r.width / 2, r.top + r.height / 2, HALO_Z, [0, 0, 0]);
      const depth = Math.abs(eye[2] - HALO_Z);
      const worldPerPx = (2 * Math.tan(FOV / 2) * depth) / cssH;
      halo[0] = c[0];
      halo[1] = c[1];
      halo[2] = (r.width / 2) * worldPerPx;
      halo[3] = (r.height / 2) * worldPerPx;
      unproject(((pointer.x + 1) / 2) * cssW, ((1 - pointer.y) / 2) * cssH, HALO_Z, haloCursor);
    }

    function render(dt) {
      if (lost) return;
      if (!ready && !finishInit()) return;
      dt = Math.min(Math.max(dt, 0), 0.05);
      if (!reduced) time += dt;

      // intro: charge for 0.55 s, then burst into the field
      if (loader > 0) {
        introClock += dt;
        load = clamp01(introClock / 0.55);
        if (introClock > 0.55) {
          const t = clamp01((introClock - 0.55) / 0.9);
          loader = Math.pow(1 - t, 3);
          if (t >= 1) loader = 0;
        }
      }

      for (let i = 0; i < keys.length; i++) {
        const k = keys[i];
        const a = reduced ? 1 : 1 - Math.exp(-rate[k] * dt);
        value[k] += (target[k] - value[k]) * a;
        if (Math.abs(target[k] - value[k]) < 1e-4) value[k] = target[k];
      }
      if (value.matrix > 0.001) ensureAtlas();

      const follow = reduced ? 1 : 1 - Math.exp(-8 * dt);
      spin += (spinTarget - spin) * (reduced ? 1 : 1 - Math.exp(-14 * dt));
      pointer.sx += (pointer.x - pointer.sx) * follow;
      pointer.sy += (pointer.y - pointer.sy) * follow;
      pulse = Math.max(0, pulse - dt * 0.7);

      const parallax = (1 - value.morph) * (reduced ? 0 : 1);
      const camK = reduced ? 1 : 1 - Math.exp(-5 * dt);
      cam.x += (rig.x + pointer.sx * 0.6 * parallax - cam.x) * camK;
      cam.y += (rig.y + pointer.sy * 0.4 * parallax - cam.y) * camK;
      cam.z += (rig.z - cam.z) * camK;
      eye[0] = cam.x; eye[1] = cam.y; eye[2] = cam.z;
      if (shake > 0.01) {
        eye[0] += (Math.random() - 0.5) * shake;
        eye[1] += (Math.random() - 0.5) * shake;
        eye[2] += (Math.random() - 0.5) * shake * 0.5;
        shake *= Math.exp(-6.3 * dt);
      }
      lookX += (rig.x * 0.5 - lookX) * camK;
      look[0] = lookX;
      lookAt(view, basis, eye, look);
      if (value.tide > 0.001) updateHalo();

      gl.clear(gl.COLOR_BUFFER_BIT);

      // stars
      gl.useProgram(S.p);
      gl.uniformMatrix4fv(uS.uProj, false, proj);
      gl.uniformMatrix4fv(uS.uView, false, view);
      gl.uniform1f(uS.uRot, -time * 0.005);
      gl.uniform1f(uS.uScale, cssH * 0.5 * dpr);
      gl.bindBuffer(gl.ARRAY_BUFFER, sBuf);
      gl.enableVertexAttribArray(aS);
      gl.vertexAttribPointer(aS, 3, gl.FLOAT, false, 0, 0);
      gl.drawArrays(gl.POINTS, 0, 500);
      gl.disableVertexAttribArray(aS);

      // the sea
      gl.useProgram(P.p);
      gl.uniformMatrix4fv(uP.uProj, false, proj);
      gl.uniformMatrix4fv(uP.uView, false, view);
      gl.uniform1f(uP.uTime, time);
      gl.uniform1f(uP.uMorph, value.morph);
      gl.uniform1f(uP.uMatrix, value.matrix);
      gl.uniform1f(uP.uNeural, value.neural);
      gl.uniform1f(uP.uGrid, value.grid);
      gl.uniform1f(uP.uWelcome, value.welcome);
      gl.uniform1f(uP.uLoader, loader);
      gl.uniform1f(uP.uLoad, load);
      gl.uniform1f(uP.uPulse, pulse);
      gl.uniform3fv(uP.uPulseOrigin, pulseOrigin);
      gl.uniform1f(uP.uSpin, spin);
      gl.uniform2f(uP.uCursor, pointer.sx, pointer.sy);
      gl.uniform1f(uP.uPx, dpr);
      gl.uniform1f(uP.uTide, value.tide);
      gl.uniform4fv(uP.uHalo, halo);
      gl.uniform1f(uP.uHaloZ, HALO_Z);
      gl.uniform3fv(uP.uHaloCursor, haloCursor);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, atlas);
      gl.uniform1i(uP.uAtlas, 0);
      gl.bindBuffer(gl.ARRAY_BUFFER, pBuf);
      const sizes = [3, 3, 3, 3, 4];
      let off = 0;
      for (let i = 0; i < 5; i++) {
        if (aP[i] >= 0) {
          gl.enableVertexAttribArray(aP[i]);
          gl.vertexAttribPointer(aP[i], sizes[i], gl.FLOAT, false, STRIDE * 4, off * 4);
        }
        off += sizes[i];
      }
      gl.drawArrays(gl.POINTS, 0, Math.min(quality.count, count));
      for (let i = 0; i < 5; i++) if (aP[i] >= 0) gl.disableVertexAttribArray(aP[i]);

      // sparks of a sent message
      if (sparkT >= 0) {
        sparkT += dt;
        if (sparkT > 1.8) {
          sparkT = -1;
        } else {
          gl.useProgram(K.p);
          gl.uniformMatrix4fv(uK.uProj, false, proj);
          gl.uniformMatrix4fv(uK.uView, false, view);
          gl.uniform1f(uK.uT, sparkT);
          gl.uniform3fv(uK.uOrigin, sparkOrigin);
          gl.uniform1f(uK.uScale, cssH * 0.5 * dpr);
          gl.uniform1f(uK.uPx, dpr);
          gl.bindBuffer(gl.ARRAY_BUFFER, kBuf);
          gl.enableVertexAttribArray(aK);
          gl.vertexAttribPointer(aK, 4, gl.FLOAT, false, 0, 0);
          gl.drawArrays(gl.POINTS, 0, 320);
          gl.disableVertexAttribArray(aK);
        }
      }
    }

    canvas.addEventListener('webglcontextlost', (e) => {
      e.preventDefault();
      lost = true;
      ready = false;
    });
    canvas.addEventListener('webglcontextrestored', () => {
      lost = false;
      init();
      applySize();
    });

    init();

    return {
      gl,
      target,
      value,
      get busy() {
        // true while anything is still moving toward its target (used by reduced motion)
        if (!ready || loader > 0 || pulse > 0 || sparkT >= 0 || shake > 0.01) return true;
        for (let i = 0; i < keys.length; i++) if (value[keys[i]] !== target[keys[i]]) return true;
        return Math.abs(spin - spinTarget) > 1e-3 || Math.abs(cam.x - rig.x) > 1e-3 || Math.abs(cam.z - rig.z) > 1e-3 || Math.abs(lookX - rig.x * 0.5) > 1e-3;
      },
      get quality() { return quality; },
      setQuality(q) {
        quality = { dpr: q.dpr, count: Math.min(q.count, count || q.count) };
        applySize();
      },
      resize,
      render,
      setSpin(rad) { spinTarget = rad; },
      setPointer(nx, ny) { pointer.x = nx; pointer.y = ny; },
      setCamera(x, z) { rig.x = x; rig.z = z; },
      setHalo(el) {
        haloEl = el || null;
        target.tide = el ? 1 : 0;
        if (el) updateHalo();
      },
      transmit(rect) {
        if (!ready) return;
        const o = rect
          ? unproject(rect.left + rect.width / 2, rect.top + rect.height / 2, 0, [0, 0, 0])
          : [6, -1, 0];
        pulseOrigin[0] = sparkOrigin[0] = o[0];
        pulseOrigin[1] = sparkOrigin[1] = o[1];
        pulseOrigin[2] = sparkOrigin[2] = o[2];
        if (reduced) return;
        pulse = 1;
        shake = 1.8;
        sparkT = 0;
      },
    };
  }

  window.Abyss = { create };
})();
