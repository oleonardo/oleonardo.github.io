/**
 * Leonardo Oliveira - 3D Neural Timeline Portfolio
 * WebGL Three.js & GLSL Shaders Engine (timeline3d.js)
 *
 * One single particle system drives the whole background:
 *   - HERO (uMorph = 0): a flat, "linear" field of particles that drifts gently
 *     and reacts to the cursor.
 *   - SCROLL: the same particles travel (linear interpolation) and reassemble
 *     into a horizontal spinal column (double-helix backbone) in section 2.
 *   - TIMELINE: that spine slowly rotates around its horizontal axis as the user
 *     scrolls, while the timeline cards are presented around it.
 */

// ---------------------------------------------------------------------------
// Shaders
// ---------------------------------------------------------------------------
const vertexShader = `
    attribute vec3 aSpine;   // target position on the backbone
    attribute float aRand;   // per-particle randomness (size / shimmer / phase)
    attribute float aType;   // molecular component type: 0=StrandA, 1=StrandB, 2=C, 3=G, 4=A, 5=T, 6=Cloud
    attribute vec3 aNode;     // target position in the neural constellation (a node cluster)
    attribute vec3 aNodeEnd;  // target position B in neural constellation (for flowing synapses)
    attribute float aNodePhase; // per-node hue/pulse phase (shared by every particle of a node)
    attribute float aCore;    // 1 = crisp node-core particle, 0 = faint ambient dust

    uniform float uTime;
    uniform float uMorph;     // 0 = field, 1 = spine
    uniform float uMatrix;    // 0 = normal field/spine, 1 = matrix digital rain
    uniform float uNeural;    // 0 = off, 1 = neural constellation (particles morph into nodes)
    uniform float uPulse;     // transmission shockwave (1 -> 0)
    uniform vec3  uPulseOrigin; // shockwave origin (world space)
    uniform float uSpineRot;  // radians — rotation of the spine around its vertical (Y) axis
    uniform vec2  uCursor;    // normalized cursor (-1..1)
    uniform float uScrollVel; // scroll velocity (motion-blur stretch)
    uniform float uFreeze;     // 1.0 = columns frozen, 0.0 = flowing
    uniform float uFreezeTime; // locked uTime value when freeze started
    uniform float uSize;
    uniform float uPixelRatio;
    uniform float uLoader;    // 1.0 = loading core, 0.0 = regular field
    uniform float uLoadProgress; // 0.0 = dormant spark, 1.0 = fully charged core

    varying vec3  vColor;
    varying float vFade;
    varying float vAlpha;     // varying transparency scaling based on type for high contrast
    varying float vWordIndex;

    const float SPINE_LEN = 20.0; // must match the JS builder
    const float FIELD_H   = 17.0;

    vec3 rotateY(vec3 p, float a) {
        float c = cos(a);
        float s = sin(a);
        return vec3(p.x * c + p.z * s, p.y, -p.x * s + p.z * c);
    }

    void main() {
        // ---- HERO STATE: deep sea volumetric floating field with currents ----
        vec3 heroPos = position;
        
        // Organic marine current shifts (multi-frequency wave simulation)
        float currentX = sin(uTime * 0.16 + position.y * 0.35 + aRand * 6.28) * 0.8;
        float currentY = cos(uTime * 0.12 + position.x * 0.25 + aRand * 6.28) * 0.6;
        float currentZ = sin(uTime * 0.20 + position.z * 0.30 + aRand * 6.28) * 0.7;
        
        heroPos.x += currentX;
        heroPos.y += currentY;
        heroPos.z += currentZ;

        // Map the cursor onto the field plane (cursor creates hydrodynamic ripples)
        vec2 cursorWorld = vec2(uCursor.x * 13.0, uCursor.y * 7.5);
        vec2 toCursor = heroPos.xy - cursorWorld;
        float dC = length(toCursor);
        float push = smoothstep(4.5, 0.0, dC) * (1.0 - uMorph);
        heroPos.xy += normalize(toCursor + 0.0001) * push * 2.8;

        // ---- SPINE STATE: shimmer + rotation around the vertical (Y) axis ----
        vec3 spinePos = aSpine;
        spinePos += 0.05 * vec3(
            sin(uTime * 1.5 + aRand * 30.0),
            cos(uTime * 1.3 + aRand * 25.0),
            sin(uTime * 1.1 + aRand * 20.0)
        );
        spinePos = rotateY(spinePos, uSpineRot);

        // ---- MORPH: smooth hydro-vortex morph between states ----
        float m = smoothstep(0.0, 1.0, uMorph);
        
        // Spiraling swirl vortex that peaks halfway through the transition for high fluidity
        float swirl = sin(m * 3.1415926) * 2.2;
        float radius = mix(length(heroPos.xz), length(spinePos.xz), m);
        float angle = atan(mix(heroPos.z, spinePos.z, m), mix(heroPos.x, spinePos.x, m)) + swirl;
        
        vec3 basePos = mix(heroPos, spinePos, m);
        basePos.x = cos(angle) * radius;
        basePos.z = sin(angle) * radius;

        // ---- LOADER STATE: a central pulsing core receiving outer flowing streams ----
        vec3 loaderPos;
        
        // Locked core and feed dimensions (the physical reactor size does not grow during loading!)
        float coreRadius = 0.65 + 0.06 * sin(uTime * 8.0 + aRand * 12.0);
        float minRadius = 0.5;
        
        if (aRand < 0.35) {
            // 35% core particles forming the central pulsing nucleus (locked size, grows only in particle density)
            loaderPos = normalize(position + 0.0001) * coreRadius + vec3(
                sin(uTime * 2.0 + aRand * 5.0),
                cos(uTime * 1.8 + aRand * 7.0),
                sin(uTime * 2.2 + aRand * 3.0)
            ) * 0.08;
        } else {
            // 65% flowing particles feeding the core (grows only in density)
            // Each particle has a completely unique random starting distance to completely break any geometric shell ("bola")!
            float startDist = 1.0 + fract(aRand * 7.1) * 4.2; // Distributed randomly between 1.0 and 5.2 units
            float flowSpeed = 2.4 + fract(aRand * 13.3) * 2.8; // highly staggered individual speeds
            
            // Looping distance based on its unique startDist
            float streamDist = mod(aRand * 97.0 - uTime * flowSpeed, startDist);
            
            // Random organic swarming offset (buzzing motion) that merges smoothly as they absorb into the core
            vec3 randomSwarmOffset = vec3(
                sin(uTime * 3.0 + aRand * 15.0),
                cos(uTime * 2.7 + aRand * 18.0),
                sin(uTime * 3.3 + aRand * 12.0)
            ) * max(streamDist - minRadius, 0.0) * 0.28;
            
            loaderPos = normalize(position + 0.0001) * max(streamDist, minRadius) + randomSwarmOffset;
        }

        // ---- SHOCKWAVE EXPLOSION TRANSITION (uLoader: 1.0 -> 0.0) ----
        float t = 1.0 - uLoader; // 0.0 = loading core, 1.0 = normal hero
        
        // Outward explosion push peaks when transition is at ~50%
        float pushOut = sin(t * 3.1415926) * 5.8 * (1.0 - t);
        
        // Add shockwave push outwards
        vec3 basePosExploded = basePos + normalize(basePos + vec3(0.0001, 0.0, 0.0)) * pushOut;
        
        // Final position morphs from loaderPos (during loading) to basePosExploded (when done)
        vec3 pos = mix(loaderPos, basePosExploded, t);

        // ---- MATRIX DIGITAL RAIN STATE ----
        // The same particles snap into evenly spaced vertical columns. A bright
        // "head" sweeps down each column and lights a fading trail above it, so the
        // field reads as falling code rain. Particles stay at fixed slots — only the
        // travelling head/trail brightness creates the illusion of motion (cheap + fluid).
        float colWidth = 0.45;
        float colIndex = floor(position.x / colWidth);
        float colX = colIndex * colWidth + colWidth * 0.5;
        float colHash  = fract(sin(colIndex * 12.9898) * 43758.5453);
        float colHash2 = fract(sin(colIndex * 78.2330) * 12345.6789);

        float MRANGE = 26.0;                          // vertical span of a column
        float MTOP   = 13.0;                          // top of the rain
        float colSpeed = 1.6 + colHash * 3.6;         // each column falls at its own pace

        // Use row index to split the column into isolated vertical bins, preventing any overlap of vertical text
        float normY = clamp(position.y / FIELD_H + 0.5, 0.0, 1.0);
        float rIndex = floor(normY * 11.99);          // 12 vertical slots (0 to 11)
        float sectorHeight = MRANGE / 12.0;
        float sectorY = MTOP - (rIndex * sectorHeight);
        float pY = sectorY + (fract(aRand * 13.9) - 0.5) * sectorHeight * 0.6; // slight random jitter inside sector
        
        // Statistical choice: 40% technology words (foreground), 60% binary code (background backdrop)
        float isTech = step(fract(aRand * 73.9), 0.40); // 1.0 if tech, 0.0 if binary
        
        // 1. Assign word index based on category
        float techIndex = floor(fract(aRand * 19.3) * 13.0);                 // 0 to 12 (Pure tech words)
        float binaryIndex = 13.0 + floor(fract(aRand * 31.7) * 12.0);        // 13 to 24 (Binary codes)
        vWordIndex = mix(binaryIndex, techIndex, isTech);
        
        // 2. Map colZ to separate foreground (words) and background (binary backdrop)
        float techZ = colHash2 * 19.5 - 8.0;   // Foreground text layer (-8.0 to +11.5)
        float binaryZ = colHash2 * 27.0 - 35.0; // Dense background binary backdrop (-35.0 to -8.0)
        float colZ = mix(binaryZ, techZ, isTech);

        // Falling columns flow continuously for smooth organic motion (no jarring grid freezes)
        float headFall = mod(uTime * colSpeed + colHash * MRANGE, MRANGE);
        float headY = MTOP - headFall;                // bright head sweeps downward, wraps
        float trailLen = 5.0 + colHash2 * 7.0;
        float dAbove = pY - headY;                    // trail lives ABOVE the head
        if (dAbove < 0.0) dAbove += MRANGE;           // seamless trail wrap-around
        float trail = clamp(1.0 - dAbove / trailLen, 0.0, 1.0);
        float head  = smoothstep(1.4, 0.0, abs(dAbove));
        
        // ---- HIGH-CONTRAST TRUE MATRIX BRIGHTNESS ----
        // Boost the leading heads to be blazing bright, and make the trails fade out exponentially faster
        float matrixGlow = pow(trail, 2.8) * 0.45 + head * 3.8;

        // Harmonic cybernetic rain: Electric Purple -> Cyber Cyan -> Dazzling Pink-White leading head
        vec3 matrixTail  = vec3(0.38, 0.12, 0.85);  // Electric Purple for the fading tail
        vec3 matrixBody  = vec3(0.0, 0.85, 1.0);    // Cyber Cyan for the flowing stream body
        vec3 matrixHead  = vec3(1.0, 0.65, 0.90);   // Dazzling Pink-White for the leading tip
        
        vec3 matrixColor = mix(matrixTail, matrixBody, clamp(trail, 0.0, 1.0));
        matrixColor = mix(matrixColor, matrixHead, smoothstep(0.3, 1.0, head));
        vec3 matrixPos = vec3(colX, pY, colZ);

        // Linear blend from the current field/spine position into the rain columns.
        pos = mix(pos, matrixPos, uMatrix);



        // ---- NEURAL CONSTELLATION STATE ----
        // Cores form node structures, synapse particles flow continuously from node A 
        // to node B, and ambient dust floats in deep space.
        float flowFactor = fract(uTime * 0.12 + aRand);
        vec3 edgePos = mix(aNode, aNodeEnd, flowFactor);
        
        vec3 neuralBase = edgePos + 0.015 * vec3(
            sin(uTime * 1.3 + aRand * 20.0),
            cos(uTime * 1.1 + aRand * 17.0),
            sin(uTime * 1.5 + aRand * 23.0)
        );
        pos = mix(pos, neuralBase, uNeural);

        // Neural glow: idle synaptic breathing + transmission shockwave ring
        float nIdle = 0.55 + 0.45 * sin(uTime * (1.0 + aNodePhase * 2.0) + aNodePhase * 6.2831);
        float nDist = distance(edgePos, uPulseOrigin);
        float nWaveR = (1.0 - uPulse) * 28.0;
        // Make the shockwave wavefront 2x wider (0.25) and exponentially brighter (6.5) for dramatic presence!
        float nRing = exp(-pow((nDist - nWaveR) * 0.25, 2.0)) * uPulse;
        float nGlow = nIdle + nRing * 6.5;
        vec3 nColor = mix(vec3(0.0, 0.85, 1.0), vec3(0.6, 0.35, 1.0), aNodePhase);
        if (aCore > 0.25 && aCore < 0.75) {
            nColor = mix(vec3(0.0, 0.85, 1.0), vec3(0.6, 0.35, 1.0), flowFactor);
        }
        nColor += vec3(0.95, 0.50, 0.85) * nRing * 4.0; // Blazing hot neon pink flare at the wavefront

        vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
        gl_Position = projectionMatrix * mvPosition;
        
        float dist = -mvPosition.z;
        vFade = smoothstep(55.0, 4.0, dist);
        
        // Size factor: Fine, delicate cybernetic components for an elegant deep-sea spine
        float sizeFactor = 1.0;
        
        // Hide particles that haven't spawned yet during loading progress
        // Sensation of charging: start sparse and build up density, then trigger a huge explosion pop!
        // We hash aRand to select particles uniformly across all groups (core and flowing streams)
        float spawnHash = fract(aRand * 43.13);
        float activeProgress = mix(1.0, uLoadProgress * 0.50, uLoader); // Max 50% density during loader
        
        float baseAlpha = 0.95;
        if (aType < 1.5) {
            sizeFactor = 1.3;  // Fine, crisp outer strands
            baseAlpha = 0.95;
        } else if (aType < 5.5) {
            sizeFactor = 0.8;  // Delicate connecting ribs
            baseAlpha = 0.75;
        } else {
            sizeFactor = 1.6;  // Sleek vertebral core discs
            baseAlpha = 0.95;
        }
        
        vAlpha = (spawnHash > activeProgress) ? 0.0 : baseAlpha;
        
        // Dynamic isolated fade-in for stream particles during loading (prevents raw edge popping)
        if (uLoader > 0.01 && aRand >= 0.35) {
            float startDist = 1.0 + fract(aRand * 7.1) * 4.2;
            float flowSpeed = 2.4 + fract(aRand * 13.3) * 2.8;
            float streamDist = mod(aRand * 97.0 - uTime * flowSpeed, startDist);
            
            float lifeProgress = streamDist / startDist; // 1.0 at its unique spawn edge, 0.0 at core
            float spawnFade = smoothstep(1.0, 0.75, lifeProgress); // Fades in smoothly as it materializes
            vAlpha *= spawnFade;
        }
        
        // Sensation of charging: particles start extremely small and pulse larger and faster as they charge!
        // Using a speed frequency that accelerates with uLoadProgress makes the core feel highly energized!
        float chargeSize = mix(0.40, 1.65, uLoadProgress);
        float chargeFrequency = 5.0 + 8.0 * uLoadProgress; // frequency accelerates from 5.0 to 13.0
        float sizePulse = sin(uTime * chargeFrequency + aRand * 6.28);
        float sizeLoaderMultiplier = mix(1.0, chargeSize * (1.0 + 0.55 * sizePulse), uLoader);
        gl_PointSize = uSize * uPixelRatio * (280.0 / (dist + 2.0)) * (0.6 + aRand * 0.9) * sizeFactor * sizeLoaderMultiplier;
        // Scale up particles in Matrix state so that the technology words are easily readable in 3D coverflow!
        gl_PointSize *= mix(1.0, 3.2 * (0.8 + aRand * 0.4), uMatrix);
        // Neural sizes: core nodes are large; flowing particles pulse beautifully; ambient is tiny
        float neuralSizeFactor = 0.45;
        if (aCore > 0.75) {
            neuralSizeFactor = 0.55 + nGlow * 0.6;
        } else if (aCore > 0.25) {
            float pulseAlongEdge = sin(flowFactor * 3.14159);
            // Swell flowing particles up to 4x their normal size when the shockwave ring hits!
            neuralSizeFactor = 0.40 + pulseAlongEdge * 0.35 + nRing * 1.5;
        } else {
            // Ambient dust lights up and grows as the wave traverses deep space!
            neuralSizeFactor = 0.22 + nRing * 0.8;
        }
        gl_PointSize *= mix(1.0, neuralSizeFactor, uNeural);



        // ---- COLOR: solid cybernetic spinal column color mapping ----
        vec3 strandACol  = vec3(0.0, 0.90, 1.0);    // Cyber Cyan
        vec3 strandBCol  = vec3(0.50, 0.30, 0.95);  // Electric Purple
        
        vec3 ribACol     = vec3(0.0, 0.75, 0.88);   // Cyan Rib
        vec3 ribBCol     = vec3(0.45, 0.25, 0.85);   // Purple Rib
        
        vec3 vertebraeCol = vec3(0.35, 0.40, 0.48); // Titanium Grey Vertebrae
        float distToCenter = length(aSpine.xz);
        vec3 centralSpineCol = mix(vec3(0.0, 0.90, 1.0), vertebraeCol, smoothstep(0.18, 1.2, distToCenter));

        vec3 spineCol;
        if (aType < 0.5) {
            spineCol = strandACol;
        } else if (aType < 1.5) {
            spineCol = strandBCol;
        } else if (aType < 2.5) {
            spineCol = ribACol;
        } else if (aType < 5.5) {
            spineCol = ribBCol;
        } else {
            spineCol = centralSpineCol;
        }

        // Field blends from deep electric indigo to cyber cyan over height (Y)
        float fy = clamp(position.y / FIELD_H + 0.5, 0.0, 1.0);
        vec3 deepIndigo = vec3(0.03, 0.02, 0.16);
        vec3 cyberCyan  = vec3(0.0, 0.80, 0.95);
        vec3 fieldCol = mix(deepIndigo, cyberCyan, fy);
        // Slowly pulse bioluminescent violet and cyan accents over time for deep-sea cyber dynamics
        vec3 pulseCol = mix(vec3(0.0, 0.06, 0.08), vec3(0.06, 0.01, 0.10), sin(uTime * 0.4 + aRand * 6.28) * 0.5 + 0.5);
        fieldCol += pulseCol;

        vColor = mix(fieldCol, spineCol, m);

        // ---- LOADER COLOR OVERLAY: Pulsing cybernetic core glowing charging state ----
        if (uLoader > 0.01) {
            vec3 coreGlowCol = mix(
                vec3(0.0, 0.90, 1.0),    // Cyber Cyan
                vec3(0.50, 0.30, 0.95),  // Electric Purple
                aRand
            );
            // Sensation of charging up: scale brightness exponentially from very dim (0.12) to blazing hot (2.8)!
            // Using a power-curve (pow(uLoadProgress, 1.5)) makes the final 30% of charging feel like a sudden quantum energy spike!
            float energyCharge = mix(0.12, 2.8, pow(uLoadProgress, 1.5));
            vec3 chargedColor = coreGlowCol * energyCharge;
            
            float colorFactor = (aRand < 0.35) ? 1.0 : smoothstep(8.0, 0.5, length(loaderPos));
            vColor = mix(vColor, chargedColor, colorFactor * uLoader);
        }

        // ---- MATRIX RAIN COLOR + ALPHA OVERRIDE ----
        // Lit streaks glow green→white at the head; everything off the head fades to
        // nothing so only the falling code remains visible against the dark.
        vColor = mix(vColor, matrixColor * (0.6 + matrixGlow), uMatrix);
        vAlpha = mix(vAlpha, clamp(matrixGlow, 0.0, 1.0), uMatrix);

        // ---- NEURAL COLOR + ALPHA ----
        vec3 nBaseCol = vec3(0.04, 0.08, 0.24);
        float nAlphaFactor = 0.03;
        
        if (aCore > 0.75) {
            nBaseCol = nColor * (0.5 + nGlow);
            nAlphaFactor = clamp(0.22 + nGlow * 0.55, 0.0, 1.3);
        } else if (aCore > 0.25) {
            // Flowing synapse: fades in/out along the edge, pulses beautifully
            float edgeFade = sin(flowFactor * 3.14159);
            nBaseCol = nColor * (0.7 + nGlow * 0.5);
            nAlphaFactor = clamp(0.12 + edgeFade * 0.58 + nGlow * 0.4, 0.0, 1.1);
        } else {
            nBaseCol = vec3(0.04, 0.08, 0.24);
            nAlphaFactor = 0.03;
        }
        
        vColor = mix(vColor, nBaseCol, uNeural);
        vAlpha = mix(vAlpha, nAlphaFactor, uNeural);
    }
`;

const fragmentShader = `
    varying vec3  vColor;
    varying float vFade;
    varying float vAlpha;
    varying float vWordIndex;

    uniform sampler2D uAtlas;
    uniform float uMatrix;

    void main() {
        // Organic circle glow (for Hero, Spine, and Neural states)
        vec2 c = gl_PointCoord - vec2(0.5);
        float d = length(c);
        float circleAlpha = clamp(1.0 - d * 2.0, 0.0, 1.0);
        circleAlpha = pow(circleAlpha, 3.8);

        // Texture atlas sampler (for Matrix rain technology words)
        // 5 columns by 5 rows grid coordinates (perfectly square cells)
        float colIndex = mod(vWordIndex, 5.0);
        float rowIndex = floor(vWordIndex / 5.0);
        
        // Map gl_PointCoord to the cell coordinates inside the atlas grid
        vec2 textUV = vec2(
            (colIndex + gl_PointCoord.x) / 5.0,
            (rowIndex + (1.0 - gl_PointCoord.y)) / 5.0
        );
        
        vec4 textSample = texture2D(uAtlas, textUV);
        float textAlpha = textSample.r; // Red channel contains text shape

        // Smoothly blend between standard circles and technology words based on matrix morph progress
        float finalAlpha = mix(circleAlpha, textAlpha, uMatrix);

        // Direct blend without pipeline-stalling discards for solid 60/120 FPS performance
        gl_FragColor = vec4(vColor, finalAlpha * vFade * vAlpha * 0.95);
    }
`;

function initThreeEngine() {
    const canvas = document.getElementById('webgl-canvas');
    if (!canvas) return null;

    let width = window.innerWidth;
    let height = window.innerHeight;

    // 1. Core scene, camera, renderer
    const scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(0x02040b, 0.006); // Highly transparent, crisp fog

    const camera = new THREE.PerspectiveCamera(60, width / height, 0.1, 100);
    camera.position.set(0, 0, 13);

    const renderer = new THREE.WebGLRenderer({
        canvas: canvas,
        antialias: true,
        alpha: true,
        powerPreference: "high-performance"
    });
    renderer.setSize(width, height);
    const pixelRatio = Math.min(window.devicePixelRatio, 2);
    renderer.setPixelRatio(pixelRatio);

    // 2. Build the dual-target particle buffer (field positions + spine targets)
    //    Many columns / few rows => the field reads as distinct horizontal lines.
    const COLS = 500;
    const ROWS = 12;
    const COUNT = COLS * ROWS; // 6,000 particles (extreme cinematic density!)
    const FIELD_W = 30.0;
    const FIELD_H = 17.0;
    const SPINE_LEN = 20.0; // keep in sync with the shader constant (vertical extent, Y)
    const SPINE_TURNS = 4;   // Reduced from 10 to 4 turns for a clear, perfectly recognizable DNA double helix structure
    const SPINE_RADIUS = 3.6; // Widen helix to 3.6 for a highly harmonious, immersive widescreen desktop scaling

    const positions = new Float32Array(COUNT * 3); // hero / field layout
    const spine = new Float32Array(COUNT * 3);      // backbone target layout
    const rand = new Float32Array(COUNT);
    const aType = new Float32Array(COUNT);          // molecular type attribute

    // Field layout: a regular lattice of horizontal lines (reads as "linear")
    let k = 0;
    for (let r = 0; r < ROWS; r++) {
        for (let c = 0; c < COLS; c++) {
            positions[k * 3]     = (c / (COLS - 1) - 0.5) * FIELD_W;
            positions[k * 3 + 1] = (r / (ROWS - 1) - 0.5) * FIELD_H;
            positions[k * 3 + 2] = (Math.random() - 0.5) * 12.0; // deep sea 3D volumetric field
            rand[k] = Math.random();
            k++;
        }
    }

    // Spine layout: a VERTICAL mechanical spinal column along the Y axis, composed
    // of stacked circular vertebrae plates, wrapping cords, and connecting structural ribs.
    for (let i = 0; i < COUNT; i++) {
        const t = i / (COUNT - 1);
        const y_base = (t - 0.5) * SPINE_LEN; // long axis runs vertically
        const angle = t * Math.PI * 2.0 * SPINE_TURNS;
        const taper = SPINE_RADIUS * (0.5 + 0.5 * Math.sin(t * Math.PI)); // tapered ends

        let x, y = y_base, z;
        const bucket = i % 8; // 8 buckets
        
        if (bucket < 3) {
            // BACKBONE STRAND A: Tubular double helix Strand A
            const tubeRadius = 0.15;
            const theta = Math.random() * Math.PI * 2.0;
            const rOffset = Math.random() * tubeRadius;
            
            x = Math.sin(angle) * taper + Math.cos(theta) * rOffset;
            z = Math.cos(angle) * taper + Math.sin(theta) * rOffset;
            y += (Math.random() - 0.5) * 0.06;
            
            aType[i] = 0.0;
        } else if (bucket < 6) {
            // BACKBONE STRAND B: Tubular double helix Strand B
            const tubeRadius = 0.15;
            const theta = Math.random() * Math.PI * 2.0;
            const rOffset = Math.random() * tubeRadius;
            
            x = Math.sin(angle + 2.2) * taper + Math.cos(theta) * rOffset;
            z = Math.cos(angle + 2.2) * taper + Math.sin(theta) * rOffset;
            y += (Math.random() - 0.5) * 0.06;
            
            aType[i] = 1.0;
        } else if (bucket === 6) {
            // CENTRAL SPINAL VERTEBRAE CORE: Stacked vertebrae disks along Y-axis!
            const TOTAL_PLATES = 60; // 60 plates along the spine
            const plateIndex = Math.floor(t * TOTAL_PLATES);
            const plateY = (plateIndex / (TOTAL_PLATES - 1) - 0.5) * SPINE_LEN;
            
            const angle_plate = Math.random() * Math.PI * 2.0;
            // Circular disc vertebrae plates of radius 1.3 tapered horizontally
            const plateRadius = 1.3 * (0.5 + 0.5 * Math.sin(t * Math.PI));
            const r_plate = Math.sqrt(Math.random()) * plateRadius;
            
            x = Math.sin(angle_plate) * r_plate;
            z = Math.cos(angle_plate) * r_plate;
            y = plateY + (Math.random() - 0.5) * 0.04; // thin disc layers
            
            aType[i] = 6.0; // Vertebrae Plate type
        } else {
            // STRUCTURAL CONNECTING RIBS (Rungs)
            const strandId = (i % 2 === 0) ? 0 : 1;
            const off = strandId === 0 ? 0.0 : 2.2;
            
            const ribAngle = angle + off;
            const ribTaper = taper;
            
            const bx = Math.sin(ribAngle) * ribTaper;
            const bz = Math.cos(ribAngle) * ribTaper;
            
            // Interpolate from central axis (0, y, 0) to outer backbone (bx, y, bz)
            const f = Math.random();
            x = bx * f;
            z = bz * f;
            y = y_base + (Math.random() - 0.5) * 0.02;
            
            aType[i] = strandId === 0 ? 2.0 : 4.0; // Rib A (Cyan) or Rib B (Purple)
        }

        spine[i * 3]     = x;
        spine[i * 3 + 1] = y;
        spine[i * 3 + 2] = z;
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('aSpine', new THREE.BufferAttribute(spine, 3));
    geometry.setAttribute('aRand', new THREE.BufferAttribute(rand, 1));
    geometry.setAttribute('aType', new THREE.BufferAttribute(aType, 1));

    function createTechTextureAtlas() {
        const words = [
            // Cells 0-12: Pure technology words (highly visible foreground)
            "ANGULAR", "CSHARP", "JAVA", "REACT", "PYTHON", 
            "AMAZON", "GOOGLE", "AI", "NODE", "DOCKER", 
            "TYPESCRIPT", "KUBERNETES", "NEXTJS",
            // Cells 13-24: Pure binary code strings (dense background backdrop)
            "10110", "01001", "11010", "00111", "10100", 
            "11001", "01101", "10011", "00010", "11100", 
            "01010", "10111"
        ];
        const numCols = 5;
        const numRows = 5;
        
        const canvas = document.createElement('canvas');
        canvas.width = 1024;
        canvas.height = 1024;
        const ctx = canvas.getContext('2d');
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        
        const cellW = canvas.width / numCols;
        const cellH = canvas.height / numRows;
        
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        
        words.forEach((word, index) => {
            const col = index % numCols;
            const row = Math.floor(index / numCols);
            const x = col * cellW + cellW / 2;
            const y = row * cellH + cellH / 2;
            
            ctx.fillStyle = '#ffffff';
            
            const letters = word.split('');
            // Dynamic character spacing and sizing to center longer words vertically inside square cells
            const fontSize = letters.length > 8 ? 20 : (letters.length > 5 ? 24 : 32);
            const charSpacing = letters.length > 8 ? 20 : (letters.length > 5 ? 24 : 32);
            
            ctx.font = `bold ${fontSize}px "Courier New", Courier, monospace`;
            
            const startY = y - ((letters.length - 1) * charSpacing) / 2;
            letters.forEach((char, charIdx) => {
                ctx.fillText(char, x, startY + charIdx * charSpacing);
            });
        });
        
        const texture = new THREE.CanvasTexture(canvas);
        texture.minFilter = THREE.LinearFilter;
        texture.magFilter = THREE.LinearFilter;
        return texture;
    }

    const uniforms = {
        uTime:       { value: 0 },
        uMorph:      { value: 0 },
        uMatrix:     { value: 0 },
        uNeural:     { value: 0 },
        uPulse:      { value: 0 },                       // transmission shockwave (1 -> 0 decay)
        uPulseOrigin:{ value: new THREE.Vector3(0, 0, 0) }, // terminal world point (neural-group local space)
        uSpineRot:   { value: 0 },
        uCursor:     { value: new THREE.Vector2(0, 0) },
        uScrollVel:  { value: 0 },
        uFreeze:     { value: 0 },
        uFreezeTime: { value: 0 },
        uSize:       { value: 0.5 },
        uPixelRatio: { value: pixelRatio },
        uLoader:     { value: 1.0 },
        uLoadProgress: { value: 0.0 },
        uReactorExpand: { value: 0.0 },
        uAtlas:      { value: createTechTextureAtlas() }
    };

    const shaderMaterial = new THREE.ShaderMaterial({
        vertexShader: vertexShader,
        fragmentShader: fragmentShader,
        uniforms: uniforms,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending
    });

    const particles = new THREE.Points(geometry, shaderMaterial);
    scene.add(particles);

    // 3. Faint ambient star layer for depth
    const starCount = 500;
    const starGeo = new THREE.BufferGeometry();
    const starPositions = new Float32Array(starCount * 3);
    for (let i = 0; i < starCount; i++) {
        starPositions[i * 3]     = (Math.random() - 0.5) * 55;
        starPositions[i * 3 + 1] = (Math.random() - 0.5) * 45;
        starPositions[i * 3 + 2] = (Math.random() - 0.5) * 40 - 12;
    }
    starGeo.setAttribute('position', new THREE.BufferAttribute(starPositions, 3));
    const starField = new THREE.Points(starGeo, new THREE.PointsMaterial({
        size: 0.05,
        color: 0xffffff,
        transparent: true,
        opacity: 0.3
    }));
    scene.add(starField);

    // 3a. 3D Hover particles system (bioluminescent energy shooting from DNA and orbiting card borders)
    const HOVER_PARTICLE_COUNT = 150;
    const hoverGeo = new THREE.BufferGeometry();
    const hoverPositions = new Float32Array(HOVER_PARTICLE_COUNT * 3);
    const hoverColors = new Float32Array(HOVER_PARTICLE_COUNT * 3);
    
    hoverGeo.setAttribute('position', new THREE.BufferAttribute(hoverPositions, 3));
    hoverGeo.setAttribute('color', new THREE.BufferAttribute(hoverColors, 3));
    
    function createGlowTexture() {
        const canvas = document.createElement('canvas');
        canvas.width = 32;
        canvas.height = 32;
        const ctx = canvas.getContext('2d');
        
        const gradient = ctx.createRadialGradient(16, 16, 0, 16, 16, 16);
        gradient.addColorStop(0, 'rgba(255, 255, 255, 1)');
        gradient.addColorStop(0.2, 'rgba(255, 255, 255, 0.85)');
        gradient.addColorStop(0.5, 'rgba(0, 243, 255, 0.45)');
        gradient.addColorStop(1, 'rgba(0, 0, 0, 0)');
        
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, 32, 32);
        
        return new THREE.CanvasTexture(canvas);
    }
    
    const hoverMaterial = new THREE.PointsMaterial({
        size: 0.24,
        map: createGlowTexture(),
        vertexColors: true,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending
    });
    
    const hoverPoints = new THREE.Points(hoverGeo, hoverMaterial);
    scene.add(hoverPoints);
    
    const hoverParticlesData = [];
    for (let i = 0; i < HOVER_PARTICLE_COUNT; i++) {
        hoverParticlesData.push({
            x: 0, y: 0, z: 0,
            vx: 0, vy: 0, vz: 0, // 3D Velocity vectors for reactive hover physics!
            progress: 0,
            speed: 0.015 + Math.random() * 0.015,
            seed: Math.random() * 100,
            orbitProgress: Math.random(),
            orbitSpeed: 0.06 + Math.random() * 0.08,
            isCyan: Math.random() > 0.5,
            spawnY: (Math.random() - 0.5) * 16.0,
            swirlOffset: (Math.random() - 0.5) * 2.0
        });
    }

    // 3c. NEURAL CONSTELLATION (contact section) — a living mesh of glowing nodes
    //     and synapse lines that emerges as the journey ends. Built as its own
    //     group so nodes + lines always stay aligned while the network gently sways.
    //     Submitting the contact form fires a shockwave across it + a flying packet.
    // Nodes sit on a jittered grid so they spread evenly across the view (instead of
    // piling up in the centre) and read as distinct points connected into a mesh.
    const NEURAL_COLS = 12, NEURAL_ROWS = 5;
    const NEURAL_NODES = NEURAL_COLS * NEURAL_ROWS; // 60 — few + well spaced reads as a NET
    const nodeVecs = [];
    for (let r = 0; r < NEURAL_ROWS; r++) {
        for (let c = 0; c < NEURAL_COLS; c++) {
            nodeVecs.push(new THREE.Vector3(
                (c / (NEURAL_COLS - 1) - 0.5) * 28.0 + (Math.random() - 0.5) * 1.5,
                (r / (NEURAL_ROWS - 1) - 0.5) * 15.5 + (Math.random() - 0.5) * 1.5,
                (Math.random() - 0.5) * 5.0 - 0.5
            ));
        }
    }

    // Synapse edges: link each node to its 2–3 nearest neighbours (deduplicated).
    const edgeSet = new Set();
    const neuralEdges = [];
    for (let i = 0; i < NEURAL_NODES; i++) {
        const dists = [];
        for (let j = 0; j < NEURAL_NODES; j++) {
            if (i !== j) dists.push([nodeVecs[i].distanceTo(nodeVecs[j]), j]);
        }
        dists.sort((a, b) => a[0] - b[0]);
        const links = 2 + (Math.random() < 0.4 ? 1 : 0);
        for (let k = 0; k < links; k++) {
            const j = dists[k][1];
            const key = i < j ? i + '_' + j : j + '_' + i;
            if (!edgeSet.has(key)) { edgeSet.add(key); neuralEdges.push([i, j]); }
        }
    }

    // Shared uniform refs so node/line materials animate in lockstep with the field.
    const neuralUniforms = {
        uTime:        uniforms.uTime,
        uNeural:      uniforms.uNeural,
        uPulse:       uniforms.uPulse,
        uPulseOrigin: uniforms.uPulseOrigin,
        uPixelRatio:  uniforms.uPixelRatio,
        uSize:        uniforms.uSize
    };

    // The nodes are formed by the MAIN particle field itself: every particle is
    // assigned a node or a synapse path and morphs there (a true spatial morph,
    // like the spine/rain) — no separate cross-faded layer. We bake the
    // per-particle node targets (aNode, aNodeEnd) + the shared node phase (aNodePhase).
    const nodePhase = new Float32Array(NEURAL_NODES);
    for (let i = 0; i < NEURAL_NODES; i++) nodePhase[i] = Math.random();

    const aNodeArr = new Float32Array(COUNT * 3);
    const aNodeEndArr = new Float32Array(COUNT * 3);
    const aNodePhaseArr = new Float32Array(COUNT);
    const aCoreArr = new Float32Array(COUNT);
    let coreCount = 0;
    for (let i = 0; i < COUNT; i++) {
        const u = Math.random() * 2.0 - 1.0;
        const th = Math.random() * Math.PI * 2.0;
        const s = Math.sqrt(Math.max(0.0, 1.0 - u * u));
        
        const spawnTypeRand = Math.random();
        if (spawnTypeRand < 0.30) {
            // CORE: A near-point cluster forming the nucleus of a node (30% of particles)
            const nodeId = coreCount % NEURAL_NODES;
            coreCount++;
            const nv = nodeVecs[nodeId];
            const radius = 0.006 + rand[i] * rand[i] * 0.03;
            const px = nv.x + s * Math.cos(th) * radius;
            const py = nv.y + u * radius;
            const pz = nv.z + s * Math.sin(th) * radius;
            
            aNodeArr[i * 3]     = px;
            aNodeArr[i * 3 + 1] = py;
            aNodeArr[i * 3 + 2] = pz;
            
            aNodeEndArr[i * 3]     = px;
            aNodeEndArr[i * 3 + 1] = py;
            aNodeEndArr[i * 3 + 2] = pz;
            
            aNodePhaseArr[i] = nodePhase[nodeId];
            aCoreArr[i] = 1.0; // Core Node type
        } else if (spawnTypeRand < 0.90) {
            // SYNAPSE FLOW: Flowing particles along neural synapse pathways (60% of particles)
            const edgeId = i % neuralEdges.length;
            const edge = neuralEdges[edgeId];
            const nvA = nodeVecs[edge[0]];
            const nvB = nodeVecs[edge[1]];
            
            aNodeArr[i * 3]     = nvA.x;
            aNodeArr[i * 3 + 1] = nvA.y;
            aNodeArr[i * 3 + 2] = nvA.z;
            
            aNodeEndArr[i * 3]     = nvB.x;
            aNodeEndArr[i * 3 + 1] = nvB.y;
            aNodeEndArr[i * 3 + 2] = nvB.z;
            
            aNodePhaseArr[i] = nodePhase[edge[0]]; // starting node phase
            aCoreArr[i] = 0.5; // Synapse path flow type
        } else {
            // AMBIENT: Faint dust spread wide for depth (10% of particles)
            const ax = (Math.random() - 0.5) * 30.0;
            const ay = (Math.random() - 0.5) * 17.0;
            const az = (Math.random() - 0.5) * 9.0 - 1.0;
            
            aNodeArr[i * 3]     = ax;
            aNodeArr[i * 3 + 1] = ay;
            aNodeArr[i * 3 + 2] = az;
            
            aNodeEndArr[i * 3]     = ax;
            aNodeEndArr[i * 3 + 1] = ay;
            aNodeEndArr[i * 3 + 2] = az;
            
            aNodePhaseArr[i] = Math.random();
            aCoreArr[i] = 0.0; // Ambient dust type
        }
    }
    geometry.setAttribute('aNode', new THREE.BufferAttribute(aNodeArr, 3));
    geometry.setAttribute('aNodeEnd', new THREE.BufferAttribute(aNodeEndArr, 3));
    geometry.setAttribute('aNodePhase', new THREE.BufferAttribute(aNodePhaseArr, 1));
    geometry.setAttribute('aCore', new THREE.BufferAttribute(aCoreArr, 1));

    // Synapse lines are retired — the main particle field now forms the edges 
    // and streams continuously between node pairs for a premium, unified cyber-neural web.

    // --- Data packet burst (fired on form submit) ---
    const PACKET_COUNT = 320; // 320 high-energy particles for a dramatic quantum dispatch!
    const packetGeo = new THREE.BufferGeometry();
    const packetPositions = new Float32Array(PACKET_COUNT * 3);
    const packetColors = new Float32Array(PACKET_COUNT * 3);
    packetGeo.setAttribute('position', new THREE.BufferAttribute(packetPositions, 3));
    packetGeo.setAttribute('color', new THREE.BufferAttribute(packetColors, 3));
    const packetMaterial = new THREE.PointsMaterial({
        size: 0.88, // Swelled up for a rich volumetric ember particle effect
        map: createGlowTexture(),
        vertexColors: true,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending
    });
    const packetPoints = new THREE.Points(packetGeo, packetMaterial);
    scene.add(packetPoints);
    const packetData = [];
    for (let i = 0; i < PACKET_COUNT; i++) {
        packetData.push({ x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, life: 0 });
    }

    // 4. State + public API
    let morphTarget = 0;     // 0 = field, 1 = spine
    let matrixTarget = 0;    // 0 = normal, 1 = matrix digital rain
    let neuralTarget = 0;    // 0 = off, 1 = neural-net contact backdrop
    let spineRotTarget = 0;  // scroll-driven base rotation (radians)
    let scrollProgress = 0;
    let hoveredCardIndex = null;
    let cameraShakeIntensity = 0.0;

    function setMorph(value) {
        morphTarget = Math.max(0, Math.min(value, 1));
    }
    function setMatrix(value) {
        matrixTarget = Math.max(0, Math.min(value, 1));
    }
    function setNeural(value) {
        neuralTarget = Math.max(0, Math.min(value, 1));
    }

    // Fire a "transmission": shockwave across the neural net + a packet flying out.
    function fireTransmission(customOrigin) {
        // Project the contact terminal's screen position to a world point at z = 0.
        let origin = new THREE.Vector3(6.0, -1.0, 0.0); // sensible fallback
        if (customOrigin) {
            origin.copy(customOrigin);
        } else {
            const term = document.querySelector('.contact-terminal');
            if (term) {
                const r = term.getBoundingClientRect();
                const ndcX = ((r.left + r.width / 2) / window.innerWidth) * 2 - 1;
                const ndcY = -((r.top + r.height / 2) / window.innerHeight) * 2 + 1;
                const v = new THREE.Vector3(ndcX, ndcY, 0.5).unproject(camera);
                const dir = v.sub(camera.position).normalize();
                const tt = (0.0 - camera.position.z) / dir.z;
                origin = camera.position.clone().add(dir.multiplyScalar(tt));
            }
        }

        // Shockwave ripples outward from the terminal across the whole network
        uniforms.uPulseOrigin.value.copy(origin);
        uniforms.uPulse.value = 1.0; // Trigger expansions
        
        // Trigger a high-energy screen shake kick!
        cameraShakeIntensity = 1.8;

        // Launch a massive, high-velocity conical burst of cyber sparks towards the viewer!
        for (let i = 0; i < PACKET_COUNT; i++) {
            const p = packetData[i];
            p.x = origin.x + (Math.random() - 0.5) * 0.4;
            p.y = origin.y + (Math.random() - 0.5) * 0.4;
            p.z = origin.z;
            
            const ang = Math.random() * Math.PI * 2.0;
            const speed = 12.0 + Math.random() * 16.0; // high speed rocket fire
            const theta = (Math.random() * 26.0) * Math.PI / 180.0; // tight forward cone spread
            
            p.vx = Math.cos(ang) * Math.sin(theta) * speed;
            p.vy = Math.sin(ang) * Math.sin(theta) * speed + (1.2 + Math.random() * 2.2); // slight lift
            p.vz = Math.cos(theta) * speed + 4.0; // shoots directly towards camera!
            p.life = 1.0;
        }
    }
    function setSpineRotation(radians) {
        spineRotTarget = radians;
    }
    function setScrollVelocity(vel) {
        uniforms.uScrollVel.value = Math.max(Math.min(vel, 3.5), -3.5);
    }
    function updateCamera(progress) {
        scrollProgress = Math.max(0, Math.min(progress, 1.0));
    }
    function setHoveredCard(index) {
        hoveredCardIndex = index;
    }

    // 5. Render loop
    const clock = new THREE.Clock();
    let spineRotCurrent = 0;
    let lastElapsedTime = 0;

    function tick() {
        const elapsedTime = clock.getElapsedTime();
        const deltaTime = Math.min(elapsedTime - lastElapsedTime, 0.03);
        lastElapsedTime = elapsedTime;

        uniforms.uTime.value = elapsedTime;

        // Smooth cursor follow
        uniforms.uCursor.value.lerp(new THREE.Vector2(
            window.PortfolioApp.mouse.x,
            window.PortfolioApp.mouse.y
        ), 0.1);

        // Ease morph (field <-> spine) - increased from 0.08 to 0.28 for instant responsiveness
        uniforms.uMorph.value += (morphTarget - uniforms.uMorph.value) * 0.28;

        // Ease matrix rain transition (field/spine <-> digital rain) - increased from 0.08 to 0.28 for instant responsiveness
        uniforms.uMatrix.value += (matrixTarget - uniforms.uMatrix.value) * 0.28;

        // Ease neural-net contact backdrop, and decay the transmission shockwave - increased from 0.08 to 0.28 for instant responsiveness
        uniforms.uNeural.value += (neuralTarget - uniforms.uNeural.value) * 0.28;
        uniforms.uPulse.value = Math.max(0.0, uniforms.uPulse.value - deltaTime * 0.7);

        // The vertical DNA's rotation is driven by scroll (set via setSpineRotation
        // from animations.js); eased here for smoothness. - increased from 0.12 to 0.28 for instant response
        spineRotCurrent += (spineRotTarget - spineRotCurrent) * 0.28;
        uniforms.uSpineRot.value = spineRotCurrent;

        // ---- 3D HOVER PARTICLES SYSTEM UPDATE ----
        const N = 4;
        const STEP_DEG = 90;
        
        let targetX_card = 0;
        let targetY_card = 0;
        let targetZ_card = 0;
        let targetTilt = 0;
        let angleX_mouse = 0;
        let translateZ_webgl = 0;
        let cardWebGLWidth = 4.2;
        let cardWebGLHeight = 2.4;
        const cursorWorld = new THREE.Vector3();
        
        if (hoveredCardIndex !== null) {
            // Calculate active hovered card WebGL position in the 3D orbit
            const spin = -scrollProgress * (N - 1) * STEP_DEG;
            const deg = hoveredCardIndex * STEP_DEG + spin;
            const rad = deg * Math.PI / 180;
            targetZ_card = Math.cos(rad) * 8.2;
            
            // Calculate card Y-axis tilt
            let dn = deg % 360;
            if (dn > 180) dn -= 360;
            if (dn < -180) dn += 360;
            targetTilt = dn * 0.30 * Math.PI / 180; // in radians
            
            // Query DOM card to get exact screen coordinates and dimensions
            const timelineCards = document.querySelectorAll('.timeline-card-wrapper .timeline-card');
            if (timelineCards && timelineCards[hoveredCardIndex]) {
                const rect = timelineCards[hoveredCardIndex].getBoundingClientRect();
                
                // Convert screen center to Normalized Device Coordinates (NDC)
                const cx_screen = rect.left + rect.width / 2;
                const cy_screen = rect.top + rect.height / 2;
                const ndcX = (cx_screen / window.innerWidth) * 2 - 1;
                const ndcY = -(cy_screen / window.innerHeight) * 2 + 1;
                
                // Ray-plane intersection to get exact world coordinates of card center
                const ndc = new THREE.Vector3(ndcX, ndcY, 0.5);
                ndc.unproject(camera);
                const rayOrigin = camera.position;
                const rayDir = ndc.clone().sub(rayOrigin).normalize();
                const t = (targetZ_card - rayOrigin.z) / rayDir.z;
                const worldPos = rayOrigin.clone().add(rayDir.multiplyScalar(t));
                
                targetX_card = worldPos.x;
                targetY_card = worldPos.y;
                
                // Calculate dynamic pixel-to-WebGL scale at this card's depth
                const fovRad = (camera.fov * Math.PI) / 180;
                const d = camera.position.z - targetZ_card;
                const visibleHeightWebGL = 2 * Math.tan(fovRad / 2) * d;
                const pixelToWebGLScale = visibleHeightWebGL / window.innerHeight;
                
                cardWebGLWidth = rect.width * pixelToWebGLScale;
                cardWebGLHeight = rect.height * pixelToWebGLScale;
                
                // Calculate mouse tilt relative to card center (to match app.js init3DCardTilt!)
                const clientX = (window.PortfolioApp.mouse.x + 1) * window.innerWidth / 2;
                const clientY = (1 - window.PortfolioApp.mouse.y) * window.innerHeight / 2;
                const mx = clientX - rect.left;
                const my = clientY - rect.top;
                const xc = rect.width / 2;
                const yc = rect.height / 2;
                const dx = (mx - xc) / xc;
                const dy = (my - yc) / yc;
                
                angleX_mouse = -dy * 12 * Math.PI / 180; // in radians
                const angleY_mouse = dx * 12 * Math.PI / 180; // in radians
                
                targetTilt = targetTilt + angleY_mouse; // Combine scroll Y rotation and mouse Y tilt
                translateZ_webgl = 10 * pixelToWebGLScale; // 10px translateZ forward along local Z axis
                
                // Get exact 3D world position of the mouse cursor at card's depth
                const cursorNDC = new THREE.Vector3(window.PortfolioApp.mouse.x, window.PortfolioApp.mouse.y, 0.5);
                cursorNDC.unproject(camera);
                const cRayDir = cursorNDC.clone().sub(rayOrigin).normalize();
                const cT = (targetZ_card - rayOrigin.z) / cRayDir.z;
                cursorWorld.copy(rayOrigin).add(cRayDir.multiplyScalar(cT));
            }
        }

        const W = cardWebGLWidth; 
        const H = cardWebGLHeight;

        const posArr = hoverGeo.attributes.position.array;
        const colArr = hoverGeo.attributes.color.array;
        
        for (let i = 0; i < HOVER_PARTICLE_COUNT; i++) {
            const pData = hoverParticlesData[i];
            
            // DNA Spine source coordinates at y = pData.spawnY (perfectly aligned with double-helix backbone strands!)
            const t_dna = (pData.spawnY / 20.0) + 0.5; // vertical DNA length is 20.0
            const off = pData.isCyan ? 0.0 : 2.2; // major/minor groove offset matching backbone strands
            const angle_dna = t_dna * Math.PI * 2.0 * 4 + spineRotCurrent + off; // 4 turns
            const taper_dna = 3.6 * (0.5 + 0.5 * Math.sin(t_dna * Math.PI)); // radius 3.6
            const dnaX = Math.sin(angle_dna) * taper_dna;
            const dnaY = pData.spawnY;
            const dnaZ = Math.cos(angle_dna) * taper_dna;
            
            if (hoveredCardIndex !== null) {
                // Fly to card: increase progress
                pData.progress += pData.speed * (deltaTime * 60);
                if (pData.progress > 1.0) pData.progress = 1.0;
            } else {
                // Fly back to DNA: decrease progress
                pData.progress -= pData.speed * 1.5 * (deltaTime * 60);
                if (pData.progress < 0.0) pData.progress = 0.0;
                
                // Reset physical velocity when flying back
                pData.vx *= 0.8;
                pData.vy *= 0.8;
                pData.vz *= 0.8;
            }
            
            // Calculate position based on progress
            if (pData.progress <= 0.0) {
                pData.x = dnaX;
                pData.y = dnaY;
                pData.z = dnaZ;
            } else {
                // 1. DYNAMIC PHYSICAL FLOATING CLOUD:
                // Smooth Brownian-like noise floating around the card
                const floatX = Math.sin(elapsedTime * 1.2 + pData.seed) * 2.4;
                const floatY = Math.cos(elapsedTime * 1.0 + pData.seed * 1.3) * 1.5;
                const floatZ = Math.sin(elapsedTime * 1.4 + pData.seed * 0.7) * 0.8;
                
                // Rotate local positions to match the card's tilted 3D space
                const y1 = floatY * Math.cos(angleX_mouse) - floatZ * Math.sin(angleX_mouse);
                const z1 = floatY * Math.sin(angleX_mouse) + floatZ * Math.cos(angleX_mouse);
                const x1 = floatX;
                
                const rx = x1 * Math.cos(targetTilt) + z1 * Math.sin(targetTilt);
                const ry = y1;
                const rz = -x1 * Math.sin(targetTilt) + z1 * Math.cos(targetTilt);
                
                // Natural target position (incorporates CSS translateZ)
                const natX = targetX_card + rx;
                const natY = targetY_card + ry;
                const natZ = targetZ_card + rz + translateZ_webgl;
                
                // Calculate physical cursor repulsion
                let pushX = 0, pushY = 0, pushZ = 0;
                if (hoveredCardIndex !== null) {
                    const dx = pData.x - cursorWorld.x;
                    const dy = pData.y - cursorWorld.y;
                    const dz = pData.z - cursorWorld.z;
                    const dist = Math.sqrt(dx*dx + dy*dy + dz*dz);
                    
                    const pushRadius = 4.0;
                    if (dist < pushRadius && dist > 0.01) {
                        // Repulsive push force: stronger when closer
                        const pushStrength = (1.0 - dist / pushRadius) * 4.5;
                        pushX = (dx / dist) * pushStrength;
                        pushY = (dy / dist) * pushStrength;
                        pushZ = (dz / dist) * pushStrength;
                    }
                }
                
                // Damped Spring-Mass system updates
                const springStrength = 4.5; // pull towards home position
                const damping = 0.85; // friction/damping to prevent unstable oscillation
                
                const forceX = (natX - pData.x) * springStrength + pushX;
                const forceY = (natY - pData.y) * springStrength + pushY;
                const forceZ = (natZ - pData.z) * springStrength + pushZ;
                
                // Integrate velocity and position
                pData.vx = (pData.vx + forceX * deltaTime) * damping;
                pData.vy = (pData.vy + forceY * deltaTime) * damping;
                pData.vz = (pData.vz + forceZ * deltaTime) * damping;
                
                let targetX_final = pData.x + pData.vx * deltaTime;
                let targetY_final = pData.y + pData.vy * deltaTime;
                let targetZ_final = pData.z + pData.vz * deltaTime;
                
                // Beautiful spiraling swirl motion in flight during transition
                const t = pData.progress;
                
                // Interpolate base coordinates from DNA to the final physical simulated target
                let bx = dnaX + (targetX_final - dnaX) * t;
                let by = dnaY + (targetY_final - dnaY) * t;
                let bz = dnaZ + (targetZ_final - dnaZ) * t;
                
                // Add a volumetric spiral swirl (peaks in middle of flight, fully vanishes at t = 1)
                const swirlVal = Math.sin(t * Math.PI); 
                const swirlAngle = (1.0 - t) * Math.PI * 1.5 + pData.seed;
                const swirlRad = swirlVal * 2.0;
                
                bx += Math.cos(swirlAngle) * swirlRad;
                bz += Math.sin(swirlAngle) * swirlRad;
                by += swirlVal * pData.swirlOffset;
                
                pData.x = bx;
                pData.y = by;
                pData.z = bz;
            }
            
            // Set position inside Float32Array
            posArr[i * 3]     = pData.x;
            posArr[i * 3 + 1] = pData.y;
            posArr[i * 3 + 2] = pData.z;
            
            // Color mapping: interpolate color from DNA/ambient values to bright glowing accents
            let activeColorCyan = new THREE.Color(0.0, 0.95, 1.0);
            let activeColorPurple = new THREE.Color(0.55, 0.35, 1.0);
            
            let finalColor = new THREE.Color();
            let baseColor = pData.isCyan ? activeColorCyan : activeColorPurple;
            
            // Cybermatic bicolorous running gradient sweeps around the cloud!
            let cardColor = new THREE.Color();
            const colorProgress = (i / HOVER_PARTICLE_COUNT) + (elapsedTime * 0.4);
            const colorWave = Math.sin(colorProgress * Math.PI * 4.0) * 0.5 + 0.5; 
            cardColor.copy(activeColorCyan).lerp(activeColorPurple, colorWave);
            
            // Blend from base DNA color to target card color over progress
            finalColor.copy(baseColor).lerp(cardColor, pData.progress);
            
            // Set RGB values inside Float32Array
            colArr[i * 3]     = finalColor.r;
            colArr[i * 3 + 1] = finalColor.g;
            colArr[i * 3 + 2] = finalColor.b;
            
            // Make the particles glow and fade out near DNA when inactive
            const alpha = Math.min(1.0, pData.progress / 0.15);
            colArr[i * 3]     *= alpha;
            colArr[i * 3 + 1] *= alpha;
            colArr[i * 3 + 2] *= alpha;
        }
        
        hoverGeo.attributes.position.needsUpdate = true;
        hoverGeo.attributes.color.needsUpdate = true;

        // ---- NEURAL CONSTELLATION: transmission packet ----
        // (No group sway: lines must stay locked to the particle clusters. The net
        //  stays alive via per-particle breathing, signal flow + camera parallax.)
        if (uniforms.uPulse.value > 0.0 || packetData[0].life > 0.0) {
            const pPos = packetGeo.attributes.position.array;
            const pCol = packetGeo.attributes.color.array;
            for (let i = 0; i < PACKET_COUNT; i++) {
                const p = packetData[i];
                if (p.life > 0.0) {
                    p.life -= deltaTime / 1.6; // slightly slower decay for full flight
                    p.vx *= 0.992; p.vy *= 0.992; p.vz *= 0.988; // subtle drag
                    
                    // Add beautiful volumetric swirl turbulence!
                    p.vx += Math.sin(elapsedTime * 9.0 + i * 0.5) * 0.22;
                    p.vy += Math.cos(elapsedTime * 7.5 + i * 0.5) * 0.22;
                    
                    p.x += p.vx * deltaTime;
                    p.y += p.vy * deltaTime;
                    p.z += p.vz * deltaTime;
                }
                const k = Math.max(0.0, p.life);
                const age = 1.0 - k;
                pPos[i * 3]     = p.x;
                pPos[i * 3 + 1] = p.y;
                pPos[i * 3 + 2] = p.z;
                // Cyan (0.0, 0.9, 1.0) -> Neon Pink (1.0, 0.5, 0.85) over its age lifetime
                pCol[i * 3]     = (0.0 + age * 1.0) * k;
                pCol[i * 3 + 1] = (0.9 - age * 0.4) * k;
                pCol[i * 3 + 2] = (1.0 - age * 0.15) * k;
            }
            packetGeo.attributes.position.needsUpdate = true;
            packetGeo.attributes.color.needsUpdate = true;
        }

        // Subtle parallax: the field reacts to the mouse, the spine stays framed
        const parallax = 1.0 - uniforms.uMorph.value;
        const camX = window.PortfolioApp.mouse.x * 0.6 * parallax;
        const camY = window.PortfolioApp.mouse.y * 0.4 * parallax;
        camera.position.x += (camX - camera.position.x) * 0.04;
        camera.position.y += (camY - camera.position.y) * 0.04;
        
        // Dynamic camera shake energy kick decay!
        if (cameraShakeIntensity > 0.01) {
            camera.position.x += (Math.random() - 0.5) * cameraShakeIntensity;
            camera.position.y += (Math.random() - 0.5) * cameraShakeIntensity;
            camera.position.z += (Math.random() - 0.5) * cameraShakeIntensity * 0.5;
            cameraShakeIntensity *= 0.90; // decay exponentially
        }
        
        camera.lookAt(0, 0, 0);

        // Drifting starfield
        starField.rotation.y = -elapsedTime * 0.005;

        // Friction decay on the scroll-velocity uniform
        uniforms.uScrollVel.value *= 0.92;

        // Automatic Freeze/Melt (Bullet-Time) logic for Projects section
        const isScrolling = Math.abs(uniforms.uScrollVel.value) > 0.05;
        const inProjects = uniforms.uMatrix.value > 0.9;
        
        if (inProjects && !isScrolling) {
            // Smoothly freeze the rain behind the fanned card
            if (uniforms.uFreeze.value === 0.0) {
                uniforms.uFreezeTime.value = uniforms.uTime.value; // lock the freeze frame time
            }
            uniforms.uFreeze.value += (1.0 - uniforms.uFreeze.value) * 0.12; // smoothly transition to frozen
        } else {
            // Smoothly melt the frozen columns and let them flow again
            uniforms.uFreeze.value += (0.0 - uniforms.uFreeze.value) * 0.12; // melt back to normal
        }

        renderer.render(scene, camera);
        requestAnimationFrame(tick);
    }
    tick();

    // 6. Resize handling
    window.addEventListener('resize', () => {
        width = window.innerWidth;
        height = window.innerHeight;
        camera.aspect = width / height;
        camera.updateProjectionMatrix();
        renderer.setSize(width, height);
        const pr = Math.min(window.devicePixelRatio, 2);
        renderer.setPixelRatio(pr);
        uniforms.uPixelRatio.value = pr;
    });

    return {
        scene,
        camera,
        renderer,
        setMorph,
        setMatrix,
        setNeural,
        fireTransmission,
        setSpineRotation,
        setScrollVelocity,
        updateCamera,
        setHoveredCard,
        uniforms
    };
}
