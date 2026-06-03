/**
 * Leonardo Oliveira - 3D Neural Timeline Portfolio
 * GSAP & Interaction System (animations.js)
 */

// Register GSAP ScrollTrigger
gsap.registerPlugin(ScrollTrigger);

function initAnimations() {
    
    // Set default scroller target to our custom snap-scroll container
    ScrollTrigger.defaults({
        scroller: "#scroll-container"
    });
    
    // 1. NAVIGATION HIGHLIGHT SYSTEM
    const navLinks = document.querySelectorAll('.nav-link');
    const sections = document.querySelectorAll('.section');

    // Bootstrap the particle layer + bind hover/active emitters
    initNavLinkParticles(navLinks);

    function updateActiveNav(activeIndex) {
        navLinks.forEach((link, idx) => {
            if (idx === activeIndex) {
                link.classList.add('active');
            } else {
                link.classList.remove('active');
            }
        });
        window.PortfolioApp.currentSection = activeIndex;
    }
    
    // Highlight Nav Links on scroll
    sections.forEach((sec, idx) => {
        ScrollTrigger.create({
            trigger: sec,
            start: "top 45%",
            end: "bottom 45%",
            onEnter: () => updateActiveNav(idx),
            onEnterBack: () => updateActiveNav(idx)
        });
    });
    
    // Nav Click Smooth Scrolling Bindings
    navLinks.forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            const targetId = link.getAttribute('href');
            const targetSec = document.querySelector(targetId);
            const scrollContainer = document.getElementById('scroll-container');
            
            if (targetSec && scrollContainer) {
                const targetTop = targetSec.getBoundingClientRect().top - scrollContainer.getBoundingClientRect().top + scrollContainer.scrollTop;
                scrollContainer.scrollTo({
                    top: targetTop,
                    behavior: 'smooth'
                });
            }
        });
    });
    
    // Logo Click Smooth Scrolling Binding
    const logoLink = document.querySelector('.logo');
    if (logoLink) {
        logoLink.addEventListener('click', (e) => {
            e.preventDefault();
            const targetSec = document.querySelector('#hero');
            const scrollContainer = document.getElementById('scroll-container');
            
            if (targetSec && scrollContainer) {
                const targetTop = targetSec.getBoundingClientRect().top - scrollContainer.getBoundingClientRect().top + scrollContainer.scrollTop;
                scrollContainer.scrollTo({
                    top: targetTop,
                    behavior: 'smooth'
                });
            }
        });
    }
    
    // 2. MAIN 3D TIMELINE SCRUB TIMELINE
    // Bind scroll progression to spline camera coordinate interpolation
    gsap.fromTo({}, {}, {
        scrollTrigger: {
            trigger: "#scroll-container",
            start: "top top",
            end: "bottom bottom",
            scrub: 1.2, // Lag factor for ultra fluid physical camera drag feel
            onUpdate: (self) => {
                const prog = self.progress;
                
                // Expose progress to WebGL core timeline camera
                if (window.PortfolioApp.threeEngine && typeof window.PortfolioApp.threeEngine.updateCamera === 'function') {
                    window.PortfolioApp.threeEngine.updateCamera(prog);
                }
                
                // Transmit scroll velocity to WebGL shader uniforms (motion blur stretch)
                if (window.PortfolioApp.threeEngine && typeof window.PortfolioApp.threeEngine.setScrollVelocity === 'function') {
                    const scrollVel = Math.abs(self.getVelocity()) / 1200; // Normalize velocity
                    window.PortfolioApp.threeEngine.setScrollVelocity(scrollVel);
                }
                
                // Update scroll phase label
                const phaseIndicator = document.getElementById('hud-phase');
                if (phaseIndicator) {
                    phaseIndicator.textContent = prog.toFixed(3);
                }
            }
        }
    });
    
    // 3. (Timeline card motion now handled by the centered "descend & focus"
    //     scrub in section 8 below — Active Theory style.)

    // 4. DYNAMIC HOVER GLOW SYSTEM (Igloo.inc Flashlight style)
    const glassPanels = document.querySelectorAll('.glass-panel');
    glassPanels.forEach(panel => {
        panel.addEventListener('mousemove', (e) => {
            const rect = panel.getBoundingClientRect();
            const x = e.clientX - rect.left;
            const y = e.clientY - rect.top;
            
            // Inject local hover coords in panel's CSS variables
            panel.style.setProperty('--mouse-x', `${x}px`);
            panel.style.setProperty('--mouse-y', `${y}px`);
        });
    });
    
    // 5. PROJECTS SECTION
    //    The 3D coverflow is fully scroll-driven (see initProjects3DCarousel):
    //    the tall #projects section is pinned via CSS sticky and the page scroll
    //    scrubs the carousel. The Matrix-rain morph already provides the dramatic
    //    reveal, so no separate opacity/entry tween is needed here (a gated tween
    //    could otherwise get stuck if the user jumps mid-section).

    // 6. HERO ENTRY SEQUENCE
    function triggerHeroEntry() {
        const tl = gsap.timeline();
        
        tl.fromTo('.hero-cyber-tag', 
            { opacity: 0, y: 12 }, 
            { opacity: 1, y: 0, duration: 0.5, ease: "power3.out" }
        )
        .fromTo('.hero-title', 
            { opacity: 0, y: 15 }, 
            { opacity: 1, y: 0, duration: 0.6, ease: "power4.out" }, 
            "-=0.4"
        )
        .fromTo('.hero-subtitle', 
            { opacity: 0, y: 12 }, 
            { opacity: 1, y: 0, duration: 0.5, ease: "power3.out" }, 
            "-=0.4"
        )
        .fromTo('.hero-actions', 
            { opacity: 0, y: 10 }, 
            { opacity: 1, y: 0, duration: 0.5, ease: "power3.out" }, 
            "-=0.4"
        )
        .fromTo('.main-header', 
            { opacity: 0, y: -12 }, 
            { opacity: 1, y: 0, duration: 0.5, ease: "power3.out" }, 
            "-=0.5"
        )
        .fromTo('.scroll-prompt', 
            { opacity: 0, y: 10 }, 
            { opacity: 0.7, y: 0, duration: 0.5, ease: "power3.out" }, 
            "-=0.4"
        )
        .fromTo('.hud-box', 
            { opacity: 0 }, 
            { opacity: 1, duration: 0.8, stagger: 0.1, ease: "power2.out" }, 
            "-=0.3"
        );
    }

    // 7. PRESET INTERACTION HUD INTEGRATION
    // Clicking hero secondary button jumps smoothly to Experience (timeline) section
    const heroSecBtn = document.getElementById('hero-travel-btn');
    if (heroSecBtn) {
        heroSecBtn.addEventListener('click', (e) => {
            e.preventDefault();
            const targetSec = document.querySelector('#experience');
            const scrollContainer = document.getElementById('scroll-container');
            if (targetSec && scrollContainer) {
                const targetTop = targetSec.getBoundingClientRect().top - scrollContainer.getBoundingClientRect().top + scrollContainer.scrollTop;
                scrollContainer.scrollTo({
                    top: targetTop,
                    behavior: 'smooth'
                });
            }
        });
    }

    // 8. PARTICLE BACKGROUND DRIVERS + TIMELINE CARD CAROUSEL
    //    The particle field morphs into the vertical DNA when the timeline is on
    //    screen, then morphs BACK to the linear field as the next section arrives
    //    (so the particles "travel" onward and no card lingers). While the spine
    //    exists, big 3D cards orbit + descend around it as a clearly-visible
    //    carousel, each landing centered & front-facing at its moment.
    const engine = () => window.PortfolioApp.threeEngine;
    const cardWrappers = gsap.utils.toArray('.timeline-card-wrapper');
    const N = cardWrappers.length;

    // Morph state — combined so the spine forms on the way in and dissolves on the
    // way out: currentMorph = morphIn * (1 - morphOut).
    let morphIn = 0, morphOut = 0, currentMorph = 0, lastP = 0;

    // Matrix-rain state — the field re-assembles into digital rain across the
    // Projects section, then melts back to the calm field at Contact:
    // matrix = matrixIn * (1 - matrixOut).
    let matrixIn = 0, matrixOut = 0;

    // Neural-net state — the final Contact section: the particles settle into a
    // living constellation of nodes + synapses (the "connection established").
    let neuralIn = 0;

    // Carousel config — cards ride a horizontal circle around the vertical DNA.
    const STEP = N > 0 ? 360 / N : 360;  // angular gap between cards on the ring
    const ORBIT_RADIUS = 360;            // px radius of the orbit (front<->back depth)
    const DNA_TURNS = 2;                 // full DNA rotations across the timeline scroll
    const VSPREAD = 220;                 // px vertical separation for the diagonal helix descent
    const clamp01 = (v) => Math.max(0, Math.min(1, v));

    const isDesktop = () => window.matchMedia('(min-width: 1025px)').matches;

    function positionTimeline(p) {
        lastP = p;

        // DNA rotation tied to scroll.
        const e = engine();
        if (e && typeof e.setSpineRotation === 'function') {
            e.setSpineRotation(p * DNA_TURNS * Math.PI * 2);
        }

        if (!isDesktop()) return; // mobile falls back to a plain stacked layout (CSS)

        // Cards exist only while the spine is formed: gate them by the morph so
        // they fully vanish during section transitions (no lingering card).
        const gate = clamp01((currentMorph - 0.6) / 0.4);

        // The whole ring rotates with scroll; the last card ends up at the front.
        const spin = -p * (N - 1) * STEP;

        let frontIdx = 0;
        let frontDepth = -1;

        cardWrappers.forEach((card, i) => {
            const deg = i * STEP + spin;
            const rad = deg * Math.PI / 180;
            const x = Math.sin(rad) * ORBIT_RADIUS;          // horizontal position on the ring
            const z = Math.cos(rad) * ORBIT_RADIUS;          // +front (toward camera), -back (behind spine)
            const depth = (z / ORBIT_RADIUS + 1) / 2;        // 0 = fully behind, 1 = dead front

            // Diagonal helix descent: vertical position spreads out based on scroll progress and card index
            const y = (i - p * (N - 1)) * VSPREAD;

            // Linear Cover-Flow Y-axis 3D tilt: 
            // We use a linear factor of 0.30 of the angle dn (clamped between -180 and 180 degrees).
            // This ensures a smooth, continuous linear rotation from 0° (flat at the front)
            // to a safe, highly visible 54° angle at the deepest point of the orbit behind the spine,
            // preventing the card from turning edge-on (90°) and avoiding any abrupt back-and-forth flipping as it exits.
            let dn = deg % 360; if (dn > 180) dn -= 360; if (dn < -180) dn += 360;
            const tilt = dn * 0.30;

            // Wide vertical fade: ensures cards keep 100% of their opacity while orbiting 
            // and passing behind the DNA spine, only fading out when they are far out-of-focus.
            const verticalDist = Math.abs(i - p * (N - 1));
            const verticalFade = clamp01(2.8 - verticalDist * 1.2);

            // Depth-of-field: disappearance is LINEAR with screen depth — front is
            // sharp & opaque, cards going behind the spine fade out and blur.
            // We use (0.4 + depth * 0.6) so that the card remains highly visible (with soft blur)
            // as it passes behind the DNA spine, completing the 3D orbit.
            const opacity = (0.4 + depth * 0.6) * gate * verticalFade;
            const blur = Math.min(6, Math.max(0, 0.7 - depth) * 10);

            card.style.transform =
                `translate(-50%, -50%) translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, ${z.toFixed(1)}px) rotateY(${tilt.toFixed(1)}deg)`;
            card.style.opacity = opacity.toFixed(3);
            card.style.filter = blur > 0.05 ? `blur(${blur.toFixed(1)}px)` : 'none';
            card.style.zIndex = String(Math.round(z));        // closer to camera = on top
            card.style.pointerEvents = (gate > 0.5 && depth > 0.9) ? 'auto' : 'none';

            if (depth > frontDepth) { frontDepth = depth; frontIdx = i; }
        });

        const milestones = document.querySelectorAll('.milestone-indicator');
        cardWrappers.forEach((card, i) => {
            const isActive = gate > 0.5 && i === frontIdx && frontDepth > 0.92;
            card.classList.toggle('focused-active', isActive);
            if (milestones[i]) {
                milestones[i].classList.toggle('active', isActive);
            }
        });
    }

    function applyMorph() {
        currentMorph = morphIn * (1 - morphOut);
        const matrix = matrixIn * (1 - matrixOut);
        const e = engine();
        if (e && typeof e.setMorph === 'function') e.setMorph(currentMorph);
        if (e && typeof e.setMatrix === 'function') e.setMatrix(matrix);
        if (e && typeof e.setNeural === 'function') e.setNeural(neuralIn);
        positionTimeline(lastP); // re-gate the cards against the new morph value
    }

    if (engine() && typeof engine().setMorph === 'function') engine().setMorph(0);
    if (engine() && typeof engine().setMatrix === 'function') engine().setMatrix(0);
    if (engine() && typeof engine().setNeural === 'function') engine().setNeural(0);

    // (a) Field -> spine as the timeline enters (hero -> section 2).
    ScrollTrigger.create({
        trigger: "#experience",
        start: "top bottom",
        end: "top top",
        scrub: true,
        onUpdate: (self) => { morphIn = self.progress; applyMorph(); }
    });

    // (b) As the Projects section arrives the spine dissolves (cards gate out) and
    //     the very same particles re-assemble — linearly — into a Matrix-style
    //     digital rain that sits behind the project cards.
    ScrollTrigger.create({
        trigger: "#projects",
        start: "top bottom",
        end: "top center",
        scrub: true,
        onUpdate: (self) => { morphOut = self.progress; matrixIn = self.progress; applyMorph(); }
    });

    // (b2) Arriving at Contact, the Matrix rain melts away while the same particles
    //      gather into the neural constellation (rain -> network handoff).
    ScrollTrigger.create({
        trigger: "#contact",
        start: "top bottom",
        end: "top center",
        scrub: true,
        onUpdate: (self) => { matrixOut = self.progress; neuralIn = self.progress; applyMorph(); }
    });

    // (c) The card carousel + DNA rotation, scrubbed across the timeline section.
    const timelineST = ScrollTrigger.create({
        trigger: "#experience",
        start: "top top",
        end: "bottom bottom",
        scrub: 1,
        onUpdate: (self) => positionTimeline(self.progress)
    });

    // Place the first card correctly on load, and re-place on resize (desktop).
    positionTimeline(0);
    window.addEventListener('resize', () => {
        if (isDesktop()) positionTimeline(timelineST.progress);
    });

    return {
        triggerHeroEntry
    };
}

/* ==========================================================================
   NAV LINK PARTICLE EMITTERS
   - Hover  -> "Quantum Probe": short cyan burst + horizontal scan line.
   - Active -> "Neural Beacon": persistent anchor + continuous cyan/purple
                                ascending stream + animated gradient underline.
   Both effects compose with the existing underline (::after) without
   disturbing the header's mix-blend-mode: difference visual mixing.
   ========================================================================== */
function initNavLinkParticles(navLinks) {
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduceMotion) return;

    const beaconState = new WeakMap(); // link -> { intervalId, anchorEl }

    function ensureParticleLayer(link) {
        let layer = link.querySelector(':scope > .nav-link-particles');
        if (!layer) {
            layer = document.createElement('span');
            layer.className = 'nav-link-particles';
            link.appendChild(layer);
        }
        return layer;
    }

    function spawnHoverBurst(link) {
        const layer = ensureParticleLayer(link);
        const width = link.offsetWidth || 80;

        // Burst of cyan probe particles rising from behind the label (matches @keyframes navHoverProbe = 0.95s).
        const count = 8;
        for (let i = 0; i < count; i++) {
            const p = document.createElement('span');
            p.className = 'nav-hover-particle';
            const x0 = (Math.random() - 0.5) * width * 0.85;
            const x1 = x0 + (Math.random() - 0.5) * 22;
            const delay = i * 28;
            p.style.setProperty('--p-x0', `${x0.toFixed(2)}px`);
            p.style.setProperty('--p-x1', `${x1.toFixed(2)}px`);
            p.style.animationDelay = `${delay}ms`;
            layer.appendChild(p);
            setTimeout(() => p.remove(), 1000 + delay);
        }
    }

    function startActiveBeacon(link) {
        if (beaconState.has(link)) return;
        const layer = ensureParticleLayer(link);

        // Persistent anchor dot sitting on the underline.
        const anchor = document.createElement('span');
        anchor.className = 'nav-beacon-anchor';
        layer.appendChild(anchor);

        // Continuous ascending bicolor particle stream (matches @keyframes navActiveAscend = 2.6s).
        const intervalId = setInterval(() => {
            // Pause spawning when the document is hidden to save cycles.
            if (document.hidden) return;
            const width = link.offsetWidth || 80;
            const p = document.createElement('span');
            const isCyan = Math.random() > 0.4;
            p.className = `nav-active-particle ${isCyan ? 'cyan' : 'purple'}`;
            const x0 = (Math.random() - 0.5) * width * 0.7;
            const x1 = x0 + (Math.random() - 0.5) * 14;
            p.style.setProperty('--p-x0', `${x0.toFixed(2)}px`);
            p.style.setProperty('--p-x1', `${x1.toFixed(2)}px`);
            layer.appendChild(p);
            setTimeout(() => p.remove(), 2700);
        }, 260);

        beaconState.set(link, { intervalId, anchorEl: anchor });
    }

    function stopActiveBeacon(link) {
        const state = beaconState.get(link);
        if (!state) return;
        clearInterval(state.intervalId);
        if (state.anchorEl && state.anchorEl.parentNode) {
            state.anchorEl.remove();
        }
        beaconState.delete(link);
    }

    navLinks.forEach(link => {
        // Throttle hover bursts to avoid spamming on jittery mouse moves.
        let lastBurst = 0;
        link.addEventListener('mouseenter', () => {
            const now = performance.now();
            if (now - lastBurst < 320) return;
            lastBurst = now;
            spawnHoverBurst(link);
        });

        // Observe class changes (.active toggled by ScrollTrigger or click).
        const observer = new MutationObserver(() => {
            if (link.classList.contains('active')) {
                startActiveBeacon(link);
            } else {
                stopActiveBeacon(link);
            }
        });
        observer.observe(link, { attributes: true, attributeFilter: ['class'] });

        // Initialize for the link that boots in the active state (#hero).
        if (link.classList.contains('active')) {
            startActiveBeacon(link);
        }
    });
}
