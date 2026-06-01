/**
 * Leonardo Oliveira - 3D Neural Timeline Portfolio
 * Core Orchestrator (app.js)
 */

// Global App State
window.PortfolioApp = {
    initialized: false,
    threeEngine: null,
    animations: null,
    mouse: { x: 0, y: 0, targetX: 0, targetY: 0 },
    currentSection: 0,
    lowPerf: false // Central flag for low-performance eco-mode
};

document.addEventListener('DOMContentLoaded', () => {
    // 0. Detect device computational capabilities immediately
    detectDeviceCapability();

    // 1. Initialize interactive custom cursor mapping immediately
    initCursor();

    // 2. Initialize Three.js WebGL Engine immediately so the loading core starts swirling instantly
    if (typeof initThreeEngine === 'function') {
        window.PortfolioApp.threeEngine = initThreeEngine();
    }

    // 3. Start preloader simulation
    initPreloader();
});

/**
 * PRELOADER & INITIALIZATION SEQUENCE
 */
function initPreloader() {
    const loaderPercent = document.getElementById('loader-percent');
    const preloader = document.getElementById('preloader');
    const scrollContainer = document.getElementById('scroll-container');
    
    // Lock scrolling on startup so the user cannot scroll during loading or cinematic entry
    if (scrollContainer) {
        scrollContainer.classList.add('no-scroll');
    }
    
    let progress = 0;
    const duration = 2000; // Perfect 2 seconds linear loader simulation for majestic, progressive charging
    const intervalTime = 20;
    const step = 100 / (duration / intervalTime);
    
    const loadingInterval = setInterval(() => {
        progress += step; // Perfectly linear accumulation for a constant, smooth loading rate
        
        // Feed the linear loading progress to the WebGL particle reactor (makes it grow dynamically!)
        if (window.PortfolioApp.threeEngine && window.PortfolioApp.threeEngine.uniforms) {
            window.PortfolioApp.threeEngine.uniforms.uLoadProgress.value = Math.min(progress / 100, 1.0);
        }

        if (progress >= 100) {
            progress = 100;
            clearInterval(loadingInterval);
            
            // Trigger remaining core system initializations (ScrollTrigger, tilts, etc.)
            initSystem();
            
            // Orchestrate the direct and clean cinematic WebGL explosion!
            if (window.PortfolioApp.threeEngine && window.PortfolioApp.threeEngine.uniforms) {
                const tlExplode = gsap.timeline();

                // Direct explosion dispersion (sprays particles out to base field layout over 1.8s)
                tlExplode.to(window.PortfolioApp.threeEngine.uniforms.uLoader, {
                    value: 0.0,
                    duration: 1.8,
                    ease: "power2.out"
                });

                // Immediately hide preloader overlay exactly when the explosion begins!
                tlExplode.add(() => {
                    preloader.classList.add('fade-out');
                }, 0);

                // Trigger entry animations (reveal headers, titles, actions, scroll indicators) immediately as the explosion bursts!
                tlExplode.add(() => {
                    if (window.PortfolioApp.animations) {
                        window.PortfolioApp.animations.triggerHeroEntry();
                    }
                    
                    // Start monitoring real-time frame rates to protect low-end devices
                    startFPSMonitor();
                    
                    // Unlock scrolling 1.2s later (when the hero text entry animation is fully complete!)
                    setTimeout(() => {
                        if (scrollContainer) {
                            scrollContainer.classList.remove('no-scroll');
                        }
                    }, 1200);
                }, 0.1);
            } else {
                // Fallback fade out if Three.js is not active
                preloader.classList.add('fade-out');
                if (window.PortfolioApp.animations) {
                    window.PortfolioApp.animations.triggerHeroEntry();
                }
                startFPSMonitor();
                if (scrollContainer) {
                    scrollContainer.classList.remove('no-scroll');
                }
            }
        }
        
        const displayPercent = Math.min(Math.floor(progress), 100);
        if (loaderPercent) {
            loaderPercent.textContent = `${displayPercent.toString().padStart(2, '0')}%`;
        }
    }, intervalTime);
}

/**
 * CORE INITIALIZATION
 */
function initSystem() {
    // Guard against double initialization (e.g. loader completing more than once),
    // which would create duplicate engines and conflicting ScrollTriggers.
    if (window.PortfolioApp.initialized) return;
    window.PortfolioApp.initialized = true;
    
    // 3. Initialize GSAP Timelines and scroll trigger interactions (animations.js)
    if (typeof initAnimations === 'function') {
        window.PortfolioApp.animations = initAnimations();
    }
    
    // 4. Initialize Diagnostic HUD updates
    initDiagnostics();
    
    // 5. Initialize 3D kinetic card tilt effects (Active Theory style)
    init3DCardTilt();
    
    // 6. Initialize bioluminescent particle stream effect on hover (DNA-to-Card experiences flow)
    initTimelineCardBioluminescence();
    
    // 7. Initialize interactive cybernetic decrypt text scramble on hero
    initInteractiveHeroText();

    // 8. Initialize the immersive 3D coverflow carousel for the Projects section
    initProjects3DCarousel();

    // 9. Initialize custom scroll snapping & section transitions helper for physical mouse wheels
    initScrollSnapHandler();
}

/**
 * CUSTOM INTERACTIVE CURSOR
 */
function initCursor() {
    const cursor = document.getElementById('custom-cursor');
    const cursorDot = document.getElementById('custom-cursor-dot');
    
    // Position interpolation using requestAnimationFrame
    let currentX = 0, currentY = 0;
    
    window.addEventListener('mousemove', (e) => {
        window.PortfolioApp.mouse.targetX = e.clientX;
        window.PortfolioApp.mouse.targetY = e.clientY;
        
        // Map mouse coordinates to normalized device coordinates (-1 to +1) for WebGL Shaders
        window.PortfolioApp.mouse.x = (e.clientX / window.innerWidth) * 2 - 1;
        window.PortfolioApp.mouse.y = -(e.clientY / window.innerHeight) * 2 + 1;
    });
    
    function updateCursor() {
        // Smoothly interpolate the outer cursor ring (elastic follow)
        currentX += (window.PortfolioApp.mouse.targetX - currentX) * 0.15;
        currentY += (window.PortfolioApp.mouse.targetY - currentY) * 0.15;
        
        cursor.style.left = `${currentX}px`;
        cursor.style.top = `${currentY}px`;
        
        // The inner dot follows instantly
        cursorDot.style.left = `${window.PortfolioApp.mouse.targetX}px`;
        cursorDot.style.top = `${window.PortfolioApp.mouse.targetY}px`;
        
        requestAnimationFrame(updateCursor);
    }
    
    requestAnimationFrame(updateCursor);
    
    // Highlight hover states for all interactive nodes
    const hoverElements = document.querySelectorAll('a, button, .timeline-card, .project-card, textarea');
    hoverElements.forEach(elem => {
        elem.addEventListener('mouseenter', () => {
            if (elem.disabled) return;
            cursor.classList.add('hover');
            cursorDot.classList.add('hover');
        });
        
        elem.addEventListener('mouseleave', () => {
            cursor.classList.remove('hover');
            cursorDot.classList.remove('hover');
        });
    });
}

/**
 * DIAGNOSTIC HUD LAYER
 */
function initDiagnostics() {
    const hudLatency = document.getElementById('hud-latency');
    const hudCoords = document.getElementById('hud-coords');
    
    // 1. Simulate active network node latency updates
    if (hudLatency) {
        setInterval(() => {
            const latency = Math.floor(Math.random() * 8) + 10; // 10ms to 18ms
            hudLatency.textContent = `${latency}ms`;
        }, 3000);
    }
    
    // 2. Track mouse coordinate updates on HUD
    if (hudCoords) {
        window.addEventListener('mousemove', () => {
            if (window.PortfolioApp && window.PortfolioApp.mouse) {
                hudCoords.textContent = `X: ${window.PortfolioApp.mouse.x.toFixed(2)} Y: ${window.PortfolioApp.mouse.y.toFixed(2)}`;
            }
        });
    }
}

/**
 * TERMINAL FORM SUBMISSION SIMULATION (TACTILE HUD FEEDBACK)
 */
const terminalForm = document.getElementById('terminal-form');
if (terminalForm) {
    terminalForm.addEventListener('submit', (e) => {
        e.preventDefault();
        
        const submitBtn = document.getElementById('terminal-submit-btn');
        const submitBtnText = submitBtn.querySelector('span');
        const output = document.getElementById('terminal-output');
        
        // 1. Rate Limiting Check (Thematic Quantum Cooldown)
        const COOLDOWN_MS = 60 * 1000; // 60 seconds cooldown
        const lastSubmit = localStorage.getItem('quantum_transmission_cooldown');
        if (lastSubmit) {
            const timePassed = Date.now() - parseInt(lastSubmit, 10);
            if (timePassed < COOLDOWN_MS) {
                const remainingSecs = Math.ceil((COOLDOWN_MS - timePassed) / 1000);
                output.innerHTML = `<span class="text-pink">SYSTEM ERROR: TRANSCEPTOR NEURAL SUPERAQUECIDO!</span><br><span class="text-muted">Aguarde o resfriamento dos servidores quânticos (${remainingSecs}s) para evitar sobrecarga de coordenadas.</span>`;
                return;
            }
        }

        const nameVal = document.getElementById('form-name').value;
        const emailVal = document.getElementById('form-email').value;
        const messageVal = document.getElementById('form-message').value;
        const honeyVal = document.getElementById('form-honey').value;
        
        submitBtn.disabled = true;
        if (submitBtnText) submitBtnText.textContent = 'TRANSMITINDO DADOS...';
        const cursor = document.getElementById('custom-cursor');
        const cursorDot = document.getElementById('custom-cursor-dot');
        if (cursor) cursor.classList.remove('hover'); // remove active hover since button is disabled
        if (cursorDot) cursorDot.classList.remove('hover');
        
        // 2. Honeypot check (traps spam bots filling invisible fields)
        if (honeyVal) {
            console.warn("SYSTEM: Spam bot detected and neutralized.");
            output.innerHTML = `<span class="text-pink">SYSTEM: COMPILANDO PACOTE DE TRANSMISSÃO...</span>`;
            setTimeout(() => {
                output.innerHTML += `<br><span class="text-purple">SYSTEM: APLICANDO CRIPTOGRAFIA NEURAL QUANTICA...</span>`;
                setTimeout(() => {
                    output.innerHTML += `<br><span class="text-cyan">SYSTEM: DISPARANDO PACOTE DE DADOS PARA LEONARDO DE OLIVEIRA!</span>`;
                    setTimeout(() => {
                        output.innerHTML = `<span class="text-cyan">TRANSMISSÃO CONCLUÍDA COM SUCESSO!</span><br><span class="text-muted">Obrigado, ${nameVal}. Sua mensagem foi enviada ao terminal do Léo.</span>`;
                        terminalForm.reset();
                        submitBtn.disabled = false;
                        if (submitBtnText) submitBtnText.textContent = 'EXECUTAR TRANSMISSÃO';
                    }, 1000);
                }, 1000);
            }, 1000);
            return;
        }

        output.innerHTML = `<span class="text-pink">SYSTEM: COMPILANDO PACOTE DE TRANSMISSÃO...</span>`;
        
        // Simulates connection handshake, packaging, and digital dispatch
        setTimeout(() => {
            output.innerHTML += `<br><span class="text-purple">SYSTEM: APLICANDO CRIPTOGRAFIA NEURAL QUANTICA...</span>`;
            
            setTimeout(() => {
                output.innerHTML += `<br><span class="text-cyan">SYSTEM: DISPARANDO PACOTE DE DADOS PARA LEONARDO DE OLIVEIRA!</span>`;

                // Fire the neural transmission: shockwave across the net + packet flying out
                if (window.PortfolioApp.threeEngine && typeof window.PortfolioApp.threeEngine.fireTransmission === 'function') {
                    window.PortfolioApp.threeEngine.fireTransmission();
                }

                // Dispatch the real email using FormSubmit AJAX API
                fetch("https://formsubmit.co/ajax/leonardooliveira.sl@gmail.com", {
                    method: "POST",
                    headers: { 
                        'Content-Type': 'application/json',
                        'Accept': 'application/json'
                    },
                    body: JSON.stringify({
                        "Nome": nameVal,
                        "Email": emailVal,
                        "Mensagem": messageVal,
                        "_captcha": "false", // prevents AJAX flow breakage with captcha redirects
                        "_honey": ""         // FormSubmit native honeypot confirmation
                    })
                })
                .then(response => {
                    if (!response.ok) throw new Error("Falha no servidor FormSubmit");
                    return response.json();
                })
                .then(data => {
                    // Set cooldown timestamp inside localStorage
                    localStorage.setItem('quantum_transmission_cooldown', Date.now().toString());
                    
                    setTimeout(() => {
                        output.innerHTML = `<span class="text-cyan">TRANSMISSÃO CONCLUÍDA COM SUCESSO!</span><br><span class="text-muted">Obrigado, ${nameVal}. Sua mensagem foi enviada ao terminal do Léo.</span>`;
                        terminalForm.reset();
                        submitBtn.disabled = false;
                        if (submitBtnText) submitBtnText.textContent = 'EXECUTAR TRANSMISSÃO';
                    }, 1000);
                })
                .catch(error => {
                    console.error("Erro no envio:", error);
                    setTimeout(() => {
                        output.innerHTML = `<span class="text-pink">FALHA NA TRANSMISSÃO QUANTICA!</span><br><span class="text-muted">Erro ao rotear pacote de dados. Por favor, verifique sua conexão e tente novamente.</span>`;
                        submitBtn.disabled = false;
                        if (submitBtnText) submitBtnText.textContent = 'EXECUTAR TRANSMISSÃO';
                    }, 1000);
                });
                
            }, 1000);
            
        }, 1000);
    });
}

/**
 * 3D KINETIC TILT EFFECT ON CARDS (ACTIVE THEORY STYLE)
 * The project cards now live inside a 3D coverflow; tilt is restricted to the
 * active (centered) card so the side cards keep their coverflow rotation intact.
 */
function init3DCardTilt() {
    const cards = document.querySelectorAll('.timeline-card, .project-card');

    cards.forEach(card => {
        const projectContainer = card.closest('.project-card-container');

        card.addEventListener('mousemove', (e) => {
            const rect = card.getBoundingClientRect();

            const x = e.clientX - rect.left;
            const y = e.clientY - rect.top;

            const xc = rect.width / 2;
            const yc = rect.height / 2;
            const dx = (x - xc) / xc;
            const dy = (y - yc) / yc;

            const angleY = dx * 12;
            const angleX = -dy * 12;

            card.style.transform = `perspective(1000px) rotateX(${angleX}deg) rotateY(${angleY}deg) translateZ(10px)`;
        });

        card.addEventListener('mouseleave', () => {
            card.style.transform = 'perspective(1000px) rotateX(0deg) rotateY(0deg) translateZ(0px)';
        });
    });
}

/**
 * 3D COVERFLOW PROJECT CAROUSEL
 * Wraps the four project cards in an interactive 3D stage:
 * - The active card sits centered, frontal and crisp.
 * - Neighbors tilt back in perspective, fading & shrinking with distance.
 * - Navigable by arrows, dots, click-on-side-card, keyboard ←/→, drag & swipe.
 */
function initProjects3DCarousel() {
    const stage = document.getElementById('projects-stage');
    const track = document.getElementById('projects-carousel');
    const section = document.getElementById('projects');
    if (!stage || !track || !section) return;

    const cards = Array.from(track.querySelectorAll('.project-card-container'));
    if (cards.length === 0) return;

    const n = cards.length;
    const labels = cards.map(c => c.querySelector('.project-title')?.textContent.trim().toUpperCase() || '');

    // HUD elements
    const fillEl = document.getElementById('projects-scroll-fill');
    const indexEl = document.getElementById('projects-scroll-index');
    const nameEl = document.getElementById('projects-scroll-name');

    // Bail out on mobile — CSS flattens the stage into a plain vertical column.
    const isDesktop = () => window.matchMedia('(min-width: 1025px)').matches;



    // Continuous coverflow placement for a signed, fractional distance-from-center.
    // rel = 0 → centered/frontal; |rel| grows → pushed sideways, back in Z, rotated
    // toward the camera, shrunk, dimmed & blurred. Everything is a smooth function
    // of rel so the whole wheel scrubs fluidly with scroll (no snapping).
    function place(rel) {
        const abs = Math.abs(rel);
        const sign = rel < 0 ? -1 : (rel > 0 ? 1 : 0);
        
        // Increased lateral spacing (280px) and depth separation (250px) combined with
        // a premium, gentle tilt (22deg) to completely prevent 3D clipping/intersection.
        const x = sign * Math.min(abs, 2.4) * 280;          // lateral fan-out
        const z = -Math.min(abs, 3) * 250 + 460;            // depth shift
        const ry = -sign * Math.min(abs, 1.5) * 22;         // coverflow tilt
        const scale = Math.max(0.48, 1 - Math.min(abs, 2.5) * 0.17);
        const brightness = Math.max(0.35, 1.0 - abs * 0.28); // slightly darken side cards
        const blur = Math.min(3.5, abs * 0.9);
        return { x, z, ry, scale, brightness, blur, zi: Math.round(1000 - abs * 100) };
    }

    // Map a scroll progress (0→1) to the carousel state and paint it.
    function render(progress) {
        const activeFloat = progress * (n - 1);   // 0 = AI-DLC … (n-1) = last card

        cards.forEach((card, i) => {
            const rel = i - activeFloat;
            const p = place(rel);
            card.style.transform =
                `translate3d(${p.x.toFixed(1)}px, 0, ${p.z.toFixed(1)}px) rotateY(${p.ry.toFixed(1)}deg) scale(${p.scale.toFixed(3)})`;
            card.style.opacity = '1'; // Fully opaque cards to completely block background particles
            
            // Build dynamic high-performance GPU filter combining brightness and blur
            let filterStr = `brightness(${p.brightness.toFixed(3)})`;
            if (p.blur > 0.05) {
                filterStr += ` blur(${p.blur.toFixed(2)}px)`;
            }
            card.style.filter = filterStr;
            card.style.zIndex = String(p.zi);
            
            // The card nearest the center gets the active glow + clickable link.
            const isActive = Math.abs(rel) < 0.5;
            card.classList.toggle('is-active', isActive);
            card.setAttribute('aria-hidden', isActive ? 'false' : 'true');
        });
        // HUD: progress fill, current index, current project name.
        const activeIdx = Math.round(activeFloat);
        if (fillEl) fillEl.style.width = (progress * 100).toFixed(1) + '%';
        if (indexEl) indexEl.textContent = String(activeIdx + 1).padStart(2, '0');
        if (nameEl && labels[activeIdx]) nameEl.textContent = labels[activeIdx];
    }

    const scroller = document.getElementById('scroll-container');

    const st = ScrollTrigger.create({
        trigger: section,
        start: 'top top',
        end: 'bottom bottom',
        scrub: 0.1, // Near-instant tracking (reduced to 0.1s for ultimate responsiveness)
        onUpdate: (self) => {
            if (!isDesktop()) return;
            render(self.progress);

            // Transmit signed scroll velocity to the background particles for wind-sway stretch.
            const engine = window.PortfolioApp.threeEngine;
            if (engine && typeof engine.setScrollVelocity === 'function') {
                const v = self.getVelocity();
                engine.setScrollVelocity(v / 1000); // signed → direction (+/-)
            }
        }
    });

    // The exact scrollTop that parks card `idx` dead-center.
    const scrollTopForIndex = (idx) => {
        const frac = n > 1 ? idx / (n - 1) : 0;
        return st.start + frac * (st.end - st.start);
    };

    // Click a side card → smooth scroll the page to center it.
    cards.forEach((card, i) => {
        card.addEventListener('click', (e) => {
            if (!isDesktop()) return;
            if (card.classList.contains('is-active')) return; // active card → follow its link
            e.preventDefault();
            const targetTop = scrollTopForIndex(i);
            scroller.scrollTo({
                top: targetTop,
                behavior: 'smooth'
            });
        });
    });

    // Initial paint, and recompute trigger positions now that the section is tall.
    render(st.progress || 0);
    ScrollTrigger.refresh();
    window.addEventListener('resize', () => { if (isDesktop()) render(st.progress || 0); });
}

/**
 * BIOLUMINESCENT PARTICLE FLOW FROM DNA ON HOVER
 * Spawns glowing energy threads that shoot out from the central DNA spine direction,
 * hit the hovered card boundary, and run along its borders in a glowing loop.
 */
function initTimelineCardBioluminescence() {
    const timelineCards = document.querySelectorAll('.timeline-card-wrapper .timeline-card');
    
    timelineCards.forEach((card, index) => {
        let particleInterval;
        
        card.addEventListener('mouseenter', () => {
            // 1. Notify the WebGL shader system
            if (window.PortfolioApp.threeEngine && typeof window.PortfolioApp.threeEngine.setHoveredCard === 'function') {
                window.PortfolioApp.threeEngine.setHoveredCard(index);
            }
            
            // 2. Launch real-time CSS/DOM particle stream ascending around the tilted 3D space
            const wrapper = card.closest('.timeline-card-wrapper');
            if (wrapper) {
                const rect = card.getBoundingClientRect();
                particleInterval = setInterval(() => {
                    const p = document.createElement('span');
                    const isCyan = Math.random() > 0.5;
                    p.className = `card-border-particle ${isCyan ? 'cyan' : 'purple'}`;
                    
                    // Position at the bottom edge of the card
                    p.style.left = `${10 + Math.random() * 80}%`;
                    p.style.top = `${rect.height}px`;
                    
                    // Set custom drifting vectors fed to the GPU CSS transform
                    p.style.setProperty('--drift-x', `${(Math.random() - 0.5) * 80}px`);
                    p.style.setProperty('--float-y', `-${rect.height + 60}px`);
                    p.style.animation = 'cardParticleFloat 2.2s cubic-bezier(0.1, 0.8, 0.2, 1) forwards';
                    
                    wrapper.appendChild(p);
                    
                    // Cleanup particle once animated
                    p.addEventListener('animationend', () => p.remove());
                }, 100);
            }
        });
        
        card.addEventListener('mouseleave', () => {
            // 1. Notify the WebGL shader system
            if (window.PortfolioApp.threeEngine && typeof window.PortfolioApp.threeEngine.setHoveredCard === 'function') {
                window.PortfolioApp.threeEngine.setHoveredCard(null);
            }
            
            // 2. Stop the continuous DOM particle stream
            if (particleInterval) {
                clearInterval(particleInterval);
            }
        });
    });
}

/**
 * CUSTOM SCROLL SNAPPING & SECTION TRANSITIONS
 * Specifically addresses physical mouse wheel scrolls to prevent "stucking"
 * between sections, while keeping trackpad smooth inertia native scroll.
 */
function initScrollSnapHandler() {
    const scrollContainer = document.getElementById('scroll-container');
    if (!scrollContainer) return;

    let isTransitioning = false;

    // Cross-browser helper to get absolute scroll top of a section relative to the container
    function getSectionScrollTop(sec) {
        return sec.getBoundingClientRect().top - scrollContainer.getBoundingClientRect().top + scrollContainer.scrollTop;
    }

    const isDesktop = () => window.matchMedia('(min-width: 1025px)').matches;

    scrollContainer.addEventListener('wheel', (e) => {
        if (!isDesktop()) return;

        // If we are currently transitioning, block any further wheel inputs to prevent jitter
        if (isTransitioning) {
            e.preventDefault();
            return;
        }

        // Heuristic to detect a physical mouse wheel notch:
        // Safari and Chrome might emit lower deltaY for gentle mouse scrolls, so we use a lower threshold of >= 10
        const isPhysicalWheel = Math.abs(e.deltaY) >= 10 || e.deltaMode !== 0;
        if (!isPhysicalWheel) return; // Keep trackpad scrolling 100% native

        const scrollTop = scrollContainer.scrollTop;
        const containerHeight = scrollContainer.clientHeight;
        const maxScroll = scrollContainer.scrollHeight - containerHeight;
        
        // Clamp scrollTop to prevent Safari rubber-banding (negative or beyond maxScroll values) from breaking calculations
        const clampedScrollTop = Math.max(0, Math.min(scrollTop, maxScroll));
        
        const sections = Array.from(document.querySelectorAll('.section'));
        if (sections.length === 0) return;

        // Detect current section index using getBoundingClientRect positions with clamped scroll top
        let currentSecIdx = 0;
        for (let i = 0; i < sections.length; i++) {
            const sec = sections[i];
            const secTop = getSectionScrollTop(sec);
            const secHeight = sec.offsetHeight;
            
            if (clampedScrollTop >= secTop - 10 && clampedScrollTop < secTop + secHeight - 10) {
                currentSecIdx = i;
                break;
            }
        }

        const currentSec = sections[currentSecIdx];
        const secTop = getSectionScrollTop(currentSec);
        const secHeight = currentSec.offsetHeight;
        const isTall = secHeight > containerHeight + 50;
        const scrollDirection = e.deltaY > 0 ? 'down' : 'up';

        if (!isTall) {
            // Shorter 100vh sections (Hero and Contact)
            if (scrollDirection === 'down' && currentSecIdx < sections.length - 1) {
                e.preventDefault();
                smoothScrollToSection(currentSecIdx + 1, 'down');
            } else if (scrollDirection === 'up' && currentSecIdx > 0) {
                e.preventDefault();
                smoothScrollToSection(currentSecIdx - 1, 'up');
            }
        } else {
            // Tall sections (Experience timeline and Projects coverflow)
            const isAtTop = clampedScrollTop <= secTop + 5;
            const isAtBottom = clampedScrollTop >= secTop + secHeight - containerHeight - 5;

            if (scrollDirection === 'up' && isAtTop && currentSecIdx > 0) {
                e.preventDefault();
                smoothScrollToSection(currentSecIdx - 1, 'up');
            } else if (scrollDirection === 'down' && isAtBottom && currentSecIdx < sections.length - 1) {
                e.preventDefault();
                smoothScrollToSection(currentSecIdx + 1, 'down');
            }
            // If in the middle of a tall section, do nothing (allow natural scrub scrolling)
        }
    }, { passive: false });

    function smoothScrollToSection(index, direction = 'down') {
        const sections = document.querySelectorAll('.section');
        if (index < 0 || index >= sections.length) return;

        const targetSec = sections[index];
        let targetTop = getSectionScrollTop(targetSec);

        // If we are moving UP (backwards) into a section, we want to land at its bottom
        // so that the scroll transitions naturally and smoothly without huge EOL-jumps!
        const containerHeight = scrollContainer.clientHeight;
        const targetHeight = targetSec.offsetHeight;
        
        if (direction === 'up') {
            targetTop = targetTop + targetHeight - containerHeight;
        }

        // If we are already at the target scroll position (or extremely close), do nothing
        if (Math.abs(scrollContainer.scrollTop - targetTop) < 3) {
            isTransitioning = false;
            return;
        }

        isTransitioning = true;

        // Use custom object tweening to animate scrollTop directly: 
        // 100% cross-browser compatible, ultra-smooth, bypasses Safari's native smooth-scroll bugs.
        // Uses "power2.inOut" to eliminate the abrupt start-jolt ("pularem") and make transitions
        // feel exceptionally luxurious and fluid, matching high-end creative agency aesthetics!
        const scrollObj = { y: scrollContainer.scrollTop };
        gsap.to(scrollObj, {
            y: targetTop,
            duration: 1.0,
            ease: "power2.inOut",
            overwrite: "auto",
            onUpdate: () => {
                scrollContainer.scrollTop = scrollObj.y;
            },
            onComplete: () => {
                isTransitioning = false;
            }
        });
    }
}

/**
 * TEXT SHUFFLE / SCRAMBLER CLASS FOR CYBERNETIC INTEGRITY
 */
class TextScrambler {
    constructor(el) {
        this.el = el;
        this.chars = '!<>-_\\/[]{}—=+*^?#________';
        this.update = this.update.bind(this);
    }
    setText(newText) {
        const oldText = this.el.innerText;
        const length = Math.max(oldText.length, newText.length);
        const promise = new Promise((resolve) => this.resolve = resolve);
        this.queue = [];
        for (let i = 0; i < length; i++) {
            const from = oldText[i] || '';
            const to = newText[i] || '';
            const start = Math.floor(Math.random() * 20);
            const end = start + Math.floor(Math.random() * 25);
            this.queue.push({ from, to, start, end });
        }
        cancelAnimationFrame(this.frameId);
        this.frame = 0;
        this.update();
        return promise;
    }
    update() {
        let output = '';
        let complete = 0;
        for (let i = 0, n = this.queue.length; i < n; i++) {
            let { from, to, start, end, char } = this.queue[i];
            if (this.frame >= end) {
                complete++;
                output += to;
            } else if (this.frame >= start) {
                if (!char || Math.random() < 0.28) {
                    char = this.randomChar();
                    this.queue[i].char = char;
                }
                output += `<span class="scramble-char text-cyan">${char}</span>`;
            } else {
                output += from;
            }
        }
        this.el.innerHTML = output;
        if (complete === this.queue.length) {
            this.resolve();
        } else {
            this.frameId = requestAnimationFrame(this.update);
            this.frame++;
        }
    }
    randomChar() {
        return this.chars[Math.floor(Math.random() * this.chars.length)];
    }
}

function initInteractiveHeroText() {
    const revealTexts = document.querySelectorAll('.hero-title .reveal-text');
    revealTexts.forEach(el => {
        const scrambler = new TextScrambler(el);
        const originalText = el.getAttribute('data-text') || el.innerText;
        
        // Initial decrypt animation on page load
        setTimeout(() => {
            scrambler.setText(originalText);
        }, 1200 + Math.random() * 400);
        
        // Interactive decryption on mouse hover!
        el.addEventListener('mouseenter', () => {
            scrambler.setText(originalText);
        });
    });
}

/**
 * PERFORMANCE SCALING ENGINE (ECO / LOW-PERFORMANCE MODE)
 * Dynamically adjusts styling and WebGL settings to match the user's hardware.
 */
function detectDeviceCapability() {
    let reason = "";

    // 1. Check logical CPU cores (e.g. dual-core processors are flagged as low-perf)
    if (navigator.hardwareConcurrency && navigator.hardwareConcurrency < 4) {
        reason = `CPU_CORES_${navigator.hardwareConcurrency}`;
    }

    // 2. Check system RAM (e.g. less than 4GB RAM)
    if (navigator.deviceMemory && navigator.deviceMemory < 4) {
        reason = `RAM_${navigator.deviceMemory}GB`;
    }

    // 3. WebGL GPU vendor/renderer inspection (identifies weak integrated or software GPUs)
    if (!reason) {
        try {
            const canvas = document.createElement('canvas');
            const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
            if (gl) {
                const debugInfo = gl.getExtension('WEBGL_debug_renderer_info');
                if (debugInfo) {
                    const renderer = gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL) || "";
                    // Identify weak / basic integrated graphics or virtual software rasterizers
                    const isWeakGPU = /Intel|HD Graphics|Iris|UHD|Microsoft Basic Render Driver|SwiftShader|llvmpipe/i.test(renderer);
                    if (isWeakGPU) {
                        reason = "INTEGRATED_GPU";
                    }
                }
            } else {
                reason = "NO_WEBGL";
            }
        } catch (e) {
            reason = "WEBGL_ERR";
        }
    }

    // If a bottleneck is detected, bootstrap the site in Eco / Low-Performance Mode
    if (reason) {
        enableLowPerfMode(reason);
    }
}

function enableLowPerfMode(reason) {
    if (window.PortfolioApp.lowPerf) return; // already active
    
    window.PortfolioApp.lowPerf = true;
    document.body.classList.add('low-perf');

    // Update WebGL renderer pixel ratio dynamically if already initialized
    const engine = window.PortfolioApp.threeEngine;
    if (engine && engine.renderer) {
        engine.renderer.setPixelRatio(1.0);
        if (engine.uniforms && engine.uniforms.uPixelRatio) {
            engine.uniforms.uPixelRatio.value = 1.0;
        }
        console.log("[Performance Engine] Dynamic WebGL pixel ratio downgraded to 1.0x.");
    }

    // Update the glowing status text on the header to match the cybernetic diagnostic theme
    const statusText = document.querySelector('.status-text');
    if (statusText) {
        statusText.innerHTML = `SYS_ONLINE: ECO_MODE_ACTIVE <span style="font-size:0.55rem;color:var(--color-cyan);opacity:0.75;letter-spacing:0.5px;">[${reason}]</span>`;
    }

    // Add CSS transition smoothing to prevent layout snap
    document.body.style.transition = "background-color 0.8s ease, backdrop-filter 0.8s ease";

    console.warn(`[Performance Engine] Eco / Low-Performance Mode enabled. Reason: ${reason}`);
}

function startFPSMonitor() {
    if (window.PortfolioApp.lowPerf) return; // already in eco mode

    let frameCount = 0;
    let startTime = performance.now();
    const monitorStartTime = performance.now();
    const MONITOR_DURATION = 6500; // monitor during first 6.5s of intense visuals
    let lastTime = performance.now();

    function loop() {
        frameCount++;
        const now = performance.now();
        lastTime = now;

        // Stop the monitor loop once the window is past target duration
        if (now - monitorStartTime > MONITOR_DURATION) {
            const totalDuration = (now - monitorStartTime) / 1000;
            const avgFPS = frameCount / totalDuration;
            console.log(`[Performance Engine] Finished FPS monitoring. Avg FPS: ${avgFPS.toFixed(1)}`);
            return;
        }

        // Check frame rate every 1.5 seconds
        if (now - startTime >= 1500) {
            const elapsed = (now - startTime) / 1000;
            const fps = frameCount / elapsed;
            
            console.log(`[Performance Engine] Current FPS: ${fps.toFixed(1)}`);

            // If the PC drops below 36 FPS, immediately downgrade the visual quality to keep interactions buttery smooth
            if (fps < 36) {
                enableLowPerfMode("LOW_FPS");
                return;
            }

            frameCount = 0;
            startTime = now;
        }

        requestAnimationFrame(loop);
    }

    requestAnimationFrame(loop);
}
