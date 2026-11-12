/**
 * Leonardo de Oliveira · Abissal
 * app.js: one requestAnimationFrame loop drives everything that moves.
 *
 * - The loop runs only while the tab is visible, and in reduced-motion mode only
 *   while something is still settling.
 * - Scroll and pointer handlers just store numbers; all DOM writes happen in the loop.
 * - Quality adapts: if frames get slow, the sea drops resolution and density.
 */
(function () {
  'use strict';

  const doc = document.documentElement;
  const $ = (sel, root) => (root || document).querySelector(sel);
  const $$ = (sel, root) => Array.from((root || document).querySelectorAll(sel));
  const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
  const TAU = Math.PI * 2;

  const mqReduce = matchMedia('(prefers-reduced-motion: reduce)');
  const mqDesktop = matchMedia('(min-width: 1025px)');
  const reduced = mqReduce.matches;

  const store = {
    get(key) {
      try { return localStorage.getItem(key); } catch (e) { return null; }
    },
    set(key, value) {
      try { localStorage.setItem(key, value); } catch (e) { /* private mode */ }
    },
  };

  // -------------------------------------------------------------------------
  // Content for the project scenes
  // -------------------------------------------------------------------------
  const PROJECTS = {
    'ai-dlc': {
      title: 'Adoção AI-DLC',
      tag: 'AI-DLC // FRAMEWORK',
      desc: 'Condução da iniciativa de adoção do AI Development Life Cycle na CWI, estruturando agentes de IA sob human oversight, spec-driven development e ciclos de entrega que aceleram o time de desenvolvimento sem remover a decisão e o senso crítico humano.',
      tech: ['AI Agents', 'Spec-Driven Dev', 'ADRs', 'LLMs', 'Mentoring'],
      metrics: [
        'Aumento de até 40% na velocidade de especificação e desenvolvimento',
        'Criação de esteiras e pipelines com validação semiautônoma',
        'Adoção de padrões de documentação contínua baseados em spec',
      ],
      video: 'assets/ai-dlc.mp4',
      poster: 'assets/posters/ai-dlc-960.webp',
    },
    'banco-abc': {
      title: 'Modularização Banco ABC',
      tag: 'MICROFRONTENDS // ANGULAR',
      desc: 'Liderança técnica na transição da plataforma corporativa de Internet Banking para uma arquitetura baseada em Microfrontends com Angular. Foco em modularização, independência de deploy e alta performance.',
      tech: ['Angular', 'Webpack Module Federation', 'Microfrontends', 'RxJS', 'TypeScript'],
      metrics: [
        'Independência completa de deploy para mais de 8 sub-times',
        'Redução do tempo de carregamento inicial (LCP) em 35%',
        'Implementação de Design System unificado e automatizado',
      ],
      video: 'assets/abc.mp4',
      poster: 'assets/posters/abc-960.webp',
    },
    ciee: {
      title: 'Cobrança CIEE',
      tag: 'FINANCIAL ENGINES // SPRING',
      desc: 'Desenvolvimento e projeto de uma engine financeira de alta resiliência e processamento em lote para conciliação bancária, faturamento e emissão de cobranças automáticas para o CIEE.',
      tech: ['Java', 'Spring Boot', 'Spring Batch', 'React', 'Docker'],
      metrics: [
        'Processamento resiliente de mais de 500 mil registros diários',
        'Redução de falhas de integração com bancos para menos de 0.01%',
        'Interface de administração em tempo real desenvolvida em React',
      ],
      video: 'assets/ciee.mp4',
      poster: 'assets/posters/ciee-960.webp',
    },
    'app-ouze': {
      title: 'Reescrita App Ouze',
      tag: 'MOBILE ARCHITECTURE // FLUTTER',
      desc: 'Reengenharia completa do aplicativo de serviços financeiros Ouze utilizando Flutter, substituindo a versão legada e entregando uma interface fluida com animações premium e arquitetura modular de alta testabilidade.',
      tech: ['Flutter', 'Dart', 'Clean Architecture', 'CI/CD Mobile'],
      metrics: [
        'Aumento da nota do aplicativo nas lojas (App Store e Play Store)',
        'Base de código unificada reduzindo custos de manutenção em 45%',
        'Implementação de criptografia local ponta a ponta',
      ],
      video: 'assets/ouze.mp4',
      poster: 'assets/posters/ouze-960.webp',
    },
  };

  // -------------------------------------------------------------------------
  // Elements and layout cache (measured on resize only, never per frame)
  // -------------------------------------------------------------------------
  const el = {
    canvas: $('#abyss'),
    story: $('#historia'),
    work: $('#projetos'),
    contact: $('#contato'),
    items: $$('.tl-item'),
    cards: $$('.tl-card'),
    rail: $$('.rail-year'),
    railBox: $('#story-rail'),
    depth: $('#depth-line'),
    deck: $('#deck'),
    projects: $$('.project'),
    deckIndex: $('#deck-index'),
    deckName: $('#deck-name'),
    deckFill: $('#deck-fill'),
    navLinks: $$('.nav-link'),
    welcome: $('#welcome-dialog'),
    welcomeVideo: $('#welcome-video'),
    detail: $('#project-dialog'),
    detailVideo: $('#detail-video'),
    detailPlay: $('#detail-play'),
    detailRec: $('#detail-rec'),
  };
  const projectNames = el.projects.map((p) => $('.project-title', p).textContent.trim());

  const layout = { vw: 0, vh: 0, desktop: true, story: { top: 0, h: 1 }, work: { top: 0, h: 1 }, contact: { top: 0, h: 1 } };
  // With the guide on a desktop the deck reaches its last card early and holds it while
  // the stage is still pinned: the guide runs off the end of it (avatar-scene.js,
  // DECK_DWELL, the same share of the viewport).
  const DECK_DWELL = 0.4;
  const deckHold = () => (layout.desktop && doc.classList.contains('has-ledge') ? DECK_DWELL * layout.vh : 0);

  function measure() {
    const sy = window.scrollY;
    const box = (node) => {
      const r = node.getBoundingClientRect();
      return { top: r.top + sy, h: r.height };
    };
    layout.vw = window.innerWidth;
    layout.vh = window.innerHeight;
    layout.desktop = mqDesktop.matches;
    layout.story = box(el.story);
    layout.work = box(el.work);
    layout.contact = box(el.contact);
    painted.story = painted.deck = painted.year = -1;
    if (el.depth) {
      const max = Math.max(1, doc.scrollHeight - layout.vh);
      el.depth.style.setProperty('--t1', (layout.story.top / max).toFixed(4));
      el.depth.style.setProperty('--t2', (layout.work.top / max).toFixed(4));
      el.depth.style.setProperty('--t3', (layout.contact.top / max).toFixed(4));
    }
    if (!layout.desktop) clearInlineStyles();
    wake();
  }

  function clearInlineStyles() {
    el.items.concat(el.projects).forEach((node) => {
      node.style.transform = '';
      node.style.opacity = '';
      node.style.visibility = '';
      node.style.pointerEvents = '';
      node.style.zIndex = '';
    });
    markActiveProject();
  }

  // -------------------------------------------------------------------------
  // State
  // -------------------------------------------------------------------------
  const s = {
    scrollY: window.scrollY,
    storyP: 0,
    workP: 0,
    morph: 0,
    detail: false,
    welcome: false,
    hover: null,
    lastInput: performance.now(),
  };
  const painted = { story: -1, gate: -1, deck: -1, year: -1 };

  // -------------------------------------------------------------------------
  // The sea
  // -------------------------------------------------------------------------
  let engine = null;
  let ladder = [];
  let level = 0;

  function startEngine() {
    if (!window.Abyss || !el.canvas) return;
    const dprMax = window.devicePixelRatio || 1;
    const phone = matchMedia('(pointer: coarse)').matches && Math.min(screen.width, screen.height) < 820;
    const weak = (navigator.hardwareConcurrency || 8) < 4 || (navigator.deviceMemory || 8) < 4;
    let base = phone ? { count: 3600, dpr: Math.min(dprMax, 1.5) } : weak ? { count: 4200, dpr: Math.min(dprMax, 1.25) } : { count: 6000, dpr: Math.min(dprMax, 1.5) };

    try {
      engine = window.Abyss.create(el.canvas, { reducedMotion: reduced, count: base.count, dpr: base.dpr });
    } catch (err) {
      console.error(err);
      engine = null;
    }
    if (!engine) {
      doc.classList.add('no-webgl');
      el.canvas.hidden = true;
      return;
    }

    // Software renderers (no GPU) start at the bottom of the ladder.
    try {
      const info = engine.gl.getExtension('WEBGL_debug_renderer_info');
      const name = info ? String(engine.gl.getParameter(info.UNMASKED_RENDERER_WEBGL)) : '';
      if (/swiftshader|llvmpipe|softpipe|basic render/i.test(name)) base = { count: 3000, dpr: Math.min(dprMax, 0.75) };
    } catch (e) { /* ignore */ }

    ladder = [
      base,
      { count: base.count, dpr: Math.min(base.dpr, 1.25) },
      { count: Math.round(base.count * 0.8), dpr: Math.min(base.dpr, 1) },
      { count: Math.round(base.count * 0.65), dpr: Math.min(base.dpr, 0.85) },
      { count: Math.round(base.count * 0.5), dpr: Math.min(base.dpr, 0.75) },
    ];
    level = 0;
    engine.setQuality(ladder[0]);
    sizeCanvas();
    if ('ResizeObserver' in window) new ResizeObserver(sizeCanvas).observe(el.canvas);
    doc.classList.add('has-webgl');
    wake();
  }

  function sizeCanvas() {
    if (!engine) return;
    engine.resize(el.canvas.clientWidth || window.innerWidth, el.canvas.clientHeight || window.innerHeight);
    wake();
  }

  // Frame-time watchdog: step down one rung when frames average slower than ~42 fps.
  const perf = { sum: 0, n: 0, since: 0, cooldown: 0 };
  function watchQuality(ms, now) {
    if (!engine || level >= ladder.length - 1) return;
    if (ms > 120 || now < perf.cooldown) { perf.sum = perf.n = 0; perf.since = now; return; }
    perf.sum += ms;
    perf.n++;
    if (now - perf.since < 1500) return;
    const avg = perf.sum / perf.n;
    perf.sum = perf.n = 0;
    perf.since = now;
    if (avg > 24) {
      level++;
      engine.setQuality(ladder[level]);
      perf.cooldown = now + 2000;
    }
  }

  // -------------------------------------------------------------------------
  // The loop
  // -------------------------------------------------------------------------
  let raf = 0;
  let running = false;
  let last = 0;
  let carry = 0;
  let tick = 0;

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
    const ms = last ? now - last : 16.7;
    last = now;
    let dt = ms / 1000 + carry;
    carry = 0;

    // After 20 s without any input the sea drifts at half the frame rate.
    if (!reduced && now - s.lastInput > 20000 && (tick++ & 1)) {
      carry = dt;
      raf = requestAnimationFrame(frame);
      return;
    }

    const settling = update(dt);
    if (engine) {
      engine.render(dt);
      watchQuality(ms, now);
    }

    const keepGoing = engine ? !reduced || engine.busy || settling : settling;
    if (keepGoing && !document.hidden) {
      raf = requestAnimationFrame(frame);
    } else {
      running = false;
    }
  }

  // Everything scroll-driven, computed from cached layout numbers.
  function update(dt) {
    const L = layout;
    const y = s.scrollY;
    const vh = L.vh;

    const storyIn = clamp01((y + vh - L.story.top) / vh);
    const workIn = clamp01((y + vh - L.work.top) / (vh * 0.5));
    const contactIn = clamp01((y + vh - L.contact.top) / (vh * 0.5));
    s.morph = storyIn * (1 - workIn);
    const matrix = workIn * (1 - contactIn);

    const storyT = clamp01((y - L.story.top) / Math.max(1, L.story.h - vh));
    const workT = clamp01((y - L.work.top) / Math.max(1, L.work.h - vh - deckHold()));
    const k1 = reduced ? 1 : 1 - Math.exp(-dt * 7);
    const k2 = reduced ? 1 : 1 - Math.exp(-dt * 16);
    s.storyP += (storyT - s.storyP) * k1;
    s.workP += (workT - s.workP) * k2;
    if (Math.abs(storyT - s.storyP) < 1e-4) s.storyP = storyT;
    if (Math.abs(workT - s.workP) < 1e-4) s.workP = workT;

    if (engine) {
      const t = engine.target;
      t.morph = s.morph;
      t.matrix = s.detail ? 0 : matrix;
      t.neural = contactIn;
      t.grid = s.detail ? 1 : 0;
      t.welcome = s.welcome ? 1 : 0;
      engine.setSpin(s.storyP * 2 * TAU);
      engine.setCamera(s.detail ? 14 : 0, s.detail ? 8 : 13);
    }

    if (L.desktop) {
      // With the guide's time tunnels the cards hold on a moment as the stage lets go:
      // it flies out through the last one while that is still in view.
      const hold = doc.classList.contains('has-tunnels') ? vh * 0.3 : 0;
      placeStory(s.storyP, hold ? storyIn * (1 - clamp01((y + vh - L.work.top - hold) / (vh * 0.5))) : s.morph);
      placeDeck(s.workP);
    }
    return s.storyP !== storyT || s.workP !== workT;
  }

  // Story cards ride a ring around the spine and descend one by one.
  const N = el.items.length;
  const STEP = 360 / N;
  function placeStory(p, morph) {
    const gate = clamp01((morph - 0.6) / 0.4);
    if (Math.abs(p - painted.story) < 1e-5 && Math.abs(gate - painted.gate) < 1e-4) return;
    painted.story = p;
    painted.gate = gate;

    const spin = -p * (N - 1) * STEP;
    let front = 0;
    let frontDepth = -1;
    for (let i = 0; i < N; i++) {
      const node = el.items[i];
      const deg = i * STEP + spin;
      const rad = (deg * Math.PI) / 180;
      const x = Math.sin(rad) * 360;
      const z = Math.cos(rad) * 360;
      const depth = (z / 360 + 1) / 2;
      const y = (i - p * (N - 1)) * 220;
      let dn = deg % 360;
      if (dn > 180) dn -= 360;
      if (dn < -180) dn += 360;
      const near = clamp01(2.8 - Math.abs(i - p * (N - 1)) * 1.2);
      const opacity = (0.22 + depth * 0.78) * gate * near;
      node.style.transform = `translate(-50%, -50%) translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, ${z.toFixed(1)}px) rotateY(${(dn * 0.3).toFixed(1)}deg)`;
      node.style.opacity = opacity.toFixed(3);
      node.style.visibility = opacity < 0.01 ? 'hidden' : '';
      node.classList.toggle('is-gone', opacity < 0.01);
      // (the card in front and its visible neighbours take the pointer: a click on a neighbour travels to it)
      node.style.pointerEvents = gate > 0.5 && (depth > 0.9 || opacity > 0.12) ? 'auto' : 'none';
      if (depth > frontDepth) {
        frontDepth = depth;
        front = i;
      }
    }
    for (let i = 0; i < N; i++) {
      const on = gate > 0.5 && i === front && frontDepth > 0.92;
      el.items[i].classList.toggle('is-focus', on);
      if (!on && s.hover === el.cards[i]) setHover(null);
    }
    if (el.railBox) el.railBox.style.setProperty('--p', p.toFixed(4));
    const year = Math.round(p * (N - 1));
    if (year !== painted.year) {
      painted.year = year;
      el.rail.forEach((r, i) => {
        r.classList.toggle('is-active', i === year);
        if (i === year) r.setAttribute('aria-current', 'step');
        else r.removeAttribute('aria-current');
      });
    }
  }

  // Projects coverflow: the card nearest the centre is the active one.
  const M = el.projects.length;
  let activeProject = 0;
  function placeDeck(p) {
    if (Math.abs(p - painted.deck) < 1e-5) return;
    painted.deck = p;
    const f = p * (M - 1);
    for (let i = 0; i < M; i++) {
      const node = el.projects[i];
      const rel = i - f;
      const abs = Math.abs(rel);
      const sign = rel < 0 ? -1 : rel > 0 ? 1 : 0;
      const x = sign * Math.min(abs, 2.4) * 280;
      const z = -Math.min(abs, 3) * 250;
      const ry = -sign * Math.min(abs, 1.5) * 22;
      const scale = Math.max(0.48, 1 - Math.min(abs, 2.5) * 0.17);
      node.style.transform = `translate(-50%, -50%) translate3d(${x.toFixed(1)}px, 0, ${z.toFixed(1)}px) rotateY(${ry.toFixed(1)}deg) scale(${scale.toFixed(3)})`;
      node.style.opacity = Math.max(0, 1 - abs * 0.3).toFixed(3);
      node.style.zIndex = String(1000 - Math.round(abs * 100));
      node.classList.toggle('is-active', abs < 0.5);
    }
    setDeckHud(Math.round(f), p);
  }

  function setDeckHud(index, progress) {
    if (index !== activeProject || progress === 0) {
      activeProject = index;
      el.deckIndex.textContent = String(index + 1).padStart(2, '0');
      el.deckName.textContent = projectNames[index] || '';
      if (!layout.desktop) markActiveProject();
    }
    el.deckFill.style.transform = `scaleX(${progress.toFixed(4)})`;
  }

  // Phones and tablets: the channel in the middle of the deck is on air.
  function markActiveProject() {
    el.projects.forEach((node, i) => node.classList.toggle('is-active', i === activeProject));
  }

  // -------------------------------------------------------------------------
  // Input
  // -------------------------------------------------------------------------
  function markInput() {
    s.lastInput = performance.now();
  }

  window.addEventListener(
    'scroll',
    () => {
      s.scrollY = window.scrollY;
      markInput();
      wake();
    },
    { passive: true }
  );

  window.addEventListener(
    'pointermove',
    (e) => {
      if (e.pointerType === 'touch') return;
      markInput();
      if (!engine) return;
      engine.setPointer((e.clientX / layout.vw) * 2 - 1, 1 - (e.clientY / layout.vh) * 2);
      wake();
    },
    { passive: true }
  );

  window.addEventListener('keydown', markInput, { passive: true });

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) sleep();
    else {
      markInput();
      wake();
    }
  });

  let resizeTimer = 0;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(measure, 120);
  });
  if ('ResizeObserver' in window) new ResizeObserver(() => measure()).observe($('main'));
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(measure);

  // Active section in the nav (no scroll math needed for this one).
  const LOOP_HOSTS = '.scroll-cue, .tl-card.is-now, .project-card, .terminal';
  const REVEALS =
    '.story-head .kicker, .work-head .kicker, .contact-info .kicker, .story-title, .work-title, .contact-title, .tl-item, .terminal, .social li';
  if ('IntersectionObserver' in window) {
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          const id = entry.target.id;
          el.navLinks.forEach((a) => {
            if (a.dataset.nav === id) a.setAttribute('aria-current', 'true');
            else a.removeAttribute('aria-current');
          });
        });
      },
      { rootMargin: '-45% 0px -55% 0px' }
    );
    $$('main > section').forEach((sec) => io.observe(sec));

    // Hosts of decorative loops in view: the CSS rests the loops everywhere else.
    const onscreen = new IntersectionObserver((entries) => {
      entries.forEach((entry) => entry.target.classList.toggle('is-onscreen', entry.isIntersecting));
    });
    $$(LOOP_HOSTS).forEach((node) => onscreen.observe(node));

    // One-shot entrances: an element gets .is-in the first time it shows up
    // and its CSS transition plays once. What is already in view (or above it,
    // after a reload mid-page) starts arrived, so nothing flickers.
    if (!reduced) {
      const revealer = new IntersectionObserver(
        (entries) => {
          entries.forEach((entry) => {
            if (!entry.isIntersecting) return;
            entry.target.classList.add('is-in');
            revealer.unobserve(entry.target);
          });
        },
        { rootMargin: '0px 0px -12% 0px' }
      );
      const vh = window.innerHeight;
      $$(REVEALS).forEach((node) => {
        if (node.getBoundingClientRect().top < vh * 0.88) node.classList.add('is-in');
        else revealer.observe(node);
      });
      doc.classList.add('reveals');
    }
  } else {
    $$(LOOP_HOSTS).forEach((node) => node.classList.add('is-onscreen'));
  }

  // Hover tide: motes leave the spine and halo the focused story card.
  function setHover(card) {
    if (s.hover === card) return;
    s.hover = card;
    if (engine) engine.setHalo(card);
    wake();
  }
  el.cards.forEach((card) => {
    card.addEventListener('pointerenter', (e) => {
      if (e.pointerType === 'mouse' && layout.desktop && card.parentElement.classList.contains('is-focus')) setHover(card);
    });
    card.addEventListener('pointerleave', () => {
      if (s.hover === card) setHover(null);
    });
  });

  // Capsules: the edge lights up where the cursor is and the card leans in.
  // One rAF per pointer move at most, and only over the card being touched.
  const finePointer = matchMedia('(hover: hover) and (pointer: fine)');
  const lit = { node: null, x: 0, y: 0, raf: 0 };
  function paintLit() {
    lit.raf = 0;
    const node = lit.node;
    if (!node) return;
    const r = node.getBoundingClientRect();
    if (!r.width || !r.height) return;
    const px = clamp01((lit.x - r.left) / r.width);
    const py = clamp01((lit.y - r.top) / r.height);
    node.style.setProperty('--mx', (px * 100).toFixed(1) + '%');
    node.style.setProperty('--my', (py * 100).toFixed(1) + '%');
    if (!reduced) {
      node.style.setProperty('--rx', ((0.5 - py) * 5).toFixed(2) + 'deg');
      node.style.setProperty('--ry', ((px - 0.5) * 7).toFixed(2) + 'deg');
    }
  }
  $$('.capsule').forEach((node) => {
    node.addEventListener('pointerenter', (e) => {
      if (e.pointerType === 'mouse' && finePointer.matches) node.classList.add('is-lit');
    });
    node.addEventListener(
      'pointermove',
      (e) => {
        if (e.pointerType !== 'mouse' || !finePointer.matches) return;
        lit.node = node;
        lit.x = e.clientX;
        lit.y = e.clientY;
        if (!lit.raf) lit.raf = requestAnimationFrame(paintLit);
      },
      { passive: true }
    );
    node.addEventListener('pointerleave', () => {
      node.classList.remove('is-lit');
      node.style.removeProperty('--rx');
      node.style.removeProperty('--ry');
      if (lit.node === node) lit.node = null;
    });
  });

  // Year rail: travel straight to a year of the story.
  function scrollToStory(i) {
    const L = layout;
    const n = el.items.length;
    const top = L.story.top + (n > 1 ? i / (n - 1) : 0) * (L.story.h - L.vh);
    window.scrollTo({ top: Math.round(top), behavior: reduced ? 'auto' : 'smooth' });
  }
  el.rail.forEach((btn, i) => btn.addEventListener('click', () => scrollToStory(i)));
  // Desktop ring: a click on the card above or below brings that year to the front.
  el.items.forEach((node, i) => {
    node.addEventListener('click', () => {
      if (!layout.desktop || node.classList.contains('is-focus')) return;
      if (String(getSelection()).length) return;
      scrollToStory(i);
    });
  });

  // Projects: centre a side card first, open the active one. On desktop the deck is
  // driven by the page scroll; on phones and tablets it is its own horizontal scroller.
  // (phones and tablets: the scroll that centres card i, as far as the deck allows)
  function deckLeftFor(i) {
    const deck = el.deck.getBoundingClientRect();
    const card = el.projects[i].getBoundingClientRect();
    const left = el.deck.scrollLeft + card.left + card.width / 2 - (deck.left + deck.width / 2);
    return Math.round(Math.max(0, Math.min(el.deck.scrollWidth - el.deck.clientWidth, left)));
  }
  function isCentred(i) {
    if (layout.desktop) return i === activeProject;
    return Math.abs(deckLeftFor(i) - el.deck.scrollLeft) < 8;
  }
  function scrollToProject(i) {
    const L = layout;
    if (!L.desktop) {
      el.deck.scrollTo({ left: deckLeftFor(i), behavior: reduced ? 'auto' : 'smooth' });
      return;
    }
    const top = L.work.top + (M > 1 ? i / (M - 1) : 0) * (L.work.h - L.vh - deckHold());
    window.scrollTo({ top: Math.round(top), behavior: reduced ? 'auto' : 'smooth' });
  }

  // The guide makes a show of opening a case: a few hops on the card, one big jump,
  // and the card gives way under it; the case opens from there. Without the guide on
  // that card (phones, reduced motion, mid-journey) it opens straight away, and a second
  // click opens it at once.
  let caseShow = null;
  function openCase(node) {
    const guide = window.avatarGuide;
    if (caseShow) {
      if (guide && guide.caseNow) guide.caseNow();
      return;
    }
    const show = guide && guide.caseJump ? guide.caseJump(node) : null;
    if (!show) {
      openProject(node.dataset.project, node);
      return;
    }
    caseShow = node;
    show.then((go) => {
      caseShow = null;
      // (the guide goes on to the case and starts the video itself, once it is sat there)
      if (go) openProject(node.dataset.project, node, !!(guide.perching && guide.perching()));
    });
  }
  // (off to another case meanwhile: the show stops and nothing opens)
  function stopCaseShow(node) {
    const guide = window.avatarGuide;
    if (caseShow && caseShow !== node && guide && guide.caseStop) guide.caseStop();
  }

  el.projects.forEach((node, i) => {
    const btn = $('.project-open', node);
    // A click on a side card brings it to the centre (forward or back); only the
    // card in focus opens its case.
    btn.addEventListener('click', () => {
      stopCaseShow(node);
      if (!isCentred(i)) {
        scrollToProject(i);
        return;
      }
      openCase(node);
    });
    btn.addEventListener('focus', () => {
      if (layout.desktop && !node.classList.contains('is-active')) {
        stopCaseShow(node);
        scrollToProject(i);
      }
    });
  });

  // Desktop deck: arrow keys move between channels.
  el.deck.addEventListener('keydown', (e) => {
    if (!layout.desktop || (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft')) return;
    const next = Math.max(0, Math.min(M - 1, activeProject + (e.key === 'ArrowRight' ? 1 : -1)));
    if (next === activeProject) return;
    e.preventDefault();
    stopCaseShow(el.projects[next]);
    scrollToProject(next);
    $('.project-open', el.projects[next]).focus({ preventScroll: true });
  });

  // Phones: the deck is a native horizontal scroller; keep the HUD in sync.
  let deckRaf = 0;
  el.deck.addEventListener(
    'scroll',
    () => {
      if (layout.desktop || deckRaf) return;
      deckRaf = requestAnimationFrame(() => {
        deckRaf = 0;
        const max = el.deck.scrollWidth - el.deck.clientWidth;
        const p = max > 0 ? clamp01(el.deck.scrollLeft / max) : 0;
        setDeckHud(Math.round(p * (M - 1)), p);
      });
    },
    { passive: true }
  );

  // -------------------------------------------------------------------------
  // Video scenes
  // The clicked poster (or the hero button) grows into the video frame through
  // a View Transition, and shrinks back into place on close. Without View
  // Transitions, or with reduced motion, the panel simply fades in and out.
  // -------------------------------------------------------------------------
  const canPortal = typeof document.startViewTransition === 'function' && !reduced;
  let portalBusy = false;
  let openNode = null;

  function portal(from, to, change, closing) {
    if (!canPortal || portalBusy || !from || !to || !from.getClientRects().length) return false;
    portalBusy = true;
    doc.classList.add('vt');
    doc.classList.toggle('vt-close', !!closing);
    from.style.viewTransitionName = 'portal';
    const cleanup = () => {
      from.style.viewTransitionName = '';
      to.style.viewTransitionName = '';
      doc.classList.remove('vt', 'vt-close');
      portalBusy = false;
      wake();
    };
    let t;
    try {
      t = document.startViewTransition(() => {
        from.style.viewTransitionName = '';
        change();
        to.style.viewTransitionName = 'portal';
      });
    } catch (err) {
      cleanup();
      return false;
    }
    t.ready.catch(() => {});
    t.finished.catch(() => {}).then(cleanup);
    return true;
  }

  function openScene(dialog) {
    if (dialog.open) return;
    dialog.classList.remove('is-closing');
    if (typeof dialog.showModal === 'function') dialog.showModal();
    else dialog.setAttribute('open', '');
    doc.classList.add('is-locked');
    wake();
  }

  function sceneTarget(dialog) {
    if (dialog === el.welcome) return $('#hero-welcome-btn');
    return openNode ? $('.project-media', openNode) : null;
  }

  const closing = new Set();
  function closeScene(dialog) {
    if (!dialog.open || closing.has(dialog)) return;
    closing.add(dialog);
    const video = $('video', dialog);
    if (video) video.pause();
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      closing.delete(dialog);
      dialog.classList.remove('is-closing', 'via-portal');
      if (!dialog.open) return;
      if (typeof dialog.close === 'function') dialog.close();
      else {
        dialog.removeAttribute('open');
        sceneClosed(dialog);
      }
    };
    const viaPortal = portal(
      $('.video-frame', dialog),
      sceneTarget(dialog),
      () => {
        sceneClosed(dialog);
        finish();
      },
      true
    );
    if (viaPortal) return;
    sceneClosed(dialog);
    if (reduced) return finish();
    dialog.classList.remove('via-portal');
    dialog.classList.add('is-closing');
    $('.scene-panel', dialog).addEventListener('animationend', finish, { once: true });
    setTimeout(finish, 450);
  }

  // State follows the dialog, whichever way it was closed.
  function sceneClosed(dialog) {
    if (dialog === el.welcome) s.welcome = false;
    if (dialog === el.detail) {
      s.detail = false;
      doc.classList.remove('is-detail');
    }
    const other = dialog === el.welcome ? el.detail : el.welcome;
    if (!other.open) doc.classList.remove('is-locked');
    wake();
  }

  [el.welcome, el.detail].forEach((dialog) => {
    dialog.addEventListener('cancel', (e) => {
      e.preventDefault();
      closeScene(dialog);
    });
    dialog.addEventListener('close', () => {
      const video = $('video', dialog);
      if (video) video.pause();
      sceneClosed(dialog);
      if (dialog === el.detail) {
        holdVideo(false);
        el.detailVideo.removeAttribute('src');
        el.detailVideo.load();
      }
    });
    dialog.addEventListener('click', (e) => {
      // (the guide sat on the case's card is not beside the case: a click on it is its own)
      const guide = window.avatarGuide;
      if (e.target === dialog && guide && guide.perchPoke && guide.perchPoke(e.clientX, e.clientY)) return;
      if (e.target === dialog || e.target.closest('[data-close]')) closeScene(dialog);
    });
    // Scroll up (or pull down on touch) to go back, as before.
    dialog.addEventListener(
      'wheel',
      (e) => {
        if (e.deltaY < -5 && dialog.scrollTop <= 0) closeScene(dialog);
      },
      { passive: true }
    );
    let startY = 0;
    let startTop = 0;
    dialog.addEventListener(
      'touchstart',
      (e) => {
        startY = e.touches[0].clientY;
        startTop = dialog.scrollTop;
      },
      { passive: true }
    );
    dialog.addEventListener(
      'touchmove',
      (e) => {
        if (startTop <= 0 && dialog.scrollTop <= 0 && e.touches[0].clientY - startY > 70) closeScene(dialog);
      },
      { passive: true }
    );
  });

  function openWelcome() {
    const v = el.welcomeVideo;
    if (!v.getAttribute('poster')) v.poster = v.dataset.poster; // fetched on first open, not at page load
    try { v.currentTime = 0; } catch (e) { /* not loaded yet */ }
    const show = () => {
      s.welcome = true;
      openScene(el.welcome);
    };
    if (portal($('#hero-welcome-btn'), $('.video-frame', el.welcome), show)) el.welcome.classList.add('via-portal');
    else show();
    const p = v.play();
    if (p && p.catch) p.catch(() => {});
  }

  $('#hero-welcome-btn').addEventListener('click', openWelcome);
  el.welcomeVideo.addEventListener('ended', () => closeScene(el.welcome));

  // The case's video, held: opened by the guide's show, it waits (its play button up,
  // the HUD on standby) until the guide, sat on the case, fires into that
  // button. A click on the button, or on the player's own, starts it just the same.
  let heldTimer = 0;
  function holdVideo(on) {
    clearTimeout(heldTimer);
    el.detail.classList.toggle('is-held', on);
    if (el.detailPlay) {
      el.detailPlay.classList.remove('is-lit');
      el.detailPlay.hidden = !on;
    }
    if (el.detailRec) el.detailRec.textContent = on ? 'STANDBY [IGNIÇÃO]' : 'REC [PLAYING]';
  }
  if (el.detailPlay) {
    el.detailPlay.addEventListener('click', (e) => {
      const v = el.detailVideo;
      const p = v.play();
      if (!p || !p.catch) return;
      // The guide's shot is no visitor's click: where a video with sound may only be
      // started by one (Safari), it starts without sound instead, and the player's own
      // controls bring the sound back. Refused even so, the button stays up to be clicked.
      p.catch((err) => {
        if (e.isTrusted || !err || err.name !== 'NotAllowedError' || !el.detail.classList.contains('is-held')) return;
        v.muted = true;
        const q = v.play();
        if (q && q.catch) q.catch(() => { v.muted = false; });
      });
    });
    // (started, however it was: the button flares and goes)
    el.detailVideo.addEventListener('play', () => {
      if (!el.detail.classList.contains('is-held')) return;
      el.detail.classList.remove('is-held');
      el.detailPlay.classList.add('is-lit');
      if (el.detailRec) el.detailRec.textContent = 'REC [PLAYING]';
      heldTimer = setTimeout(() => holdVideo(false), 500);
    });
  }

  function openProject(key, node, hold) {
    const data = PROJECTS[key];
    if (!data) return;
    $('#detail-tags').textContent = data.tag;
    $('#detail-title').textContent = data.title;
    $('#detail-desc').textContent = data.desc;
    const tech = $('#detail-tech');
    tech.replaceChildren(...data.tech.map((t) => Object.assign(document.createElement('li'), { textContent: t })));
    const metrics = $('#detail-metrics');
    metrics.replaceChildren(...data.metrics.map((m) => Object.assign(document.createElement('li'), { textContent: m })));

    const v = el.detailVideo;
    v.poster = data.poster;
    v.src = data.video;
    v.muted = false; // (see the play button: a start without sound is for that once)
    openNode = node || null;
    const show = () => {
      s.detail = true;
      doc.classList.add('is-detail');
      openScene(el.detail);
      // (held for a guide that has given up meanwhile, the scene only now up: it starts)
      const guide = window.avatarGuide;
      if (el.detail.classList.contains('is-held') && !(guide && guide.perching && guide.perching())) el.detailPlay.click();
    };
    holdVideo(!!hold && !!el.detailPlay);
    if (portal(node ? $('.project-media', node) : null, $('.video-frame', el.detail), show)) el.detail.classList.add('via-portal');
    else show();
    if (hold && el.detailPlay) return;
    const p = v.play();
    if (p && p.catch) p.catch(() => {});
  }

  // -------------------------------------------------------------------------
  // Contact terminal
  // -------------------------------------------------------------------------
  const form = $('#terminal-form');
  const out = $('#terminal-output');
  const submit = $('#terminal-submit-btn');
  const submitLabel = $('span', submit);
  const COOLDOWN = 60 * 1000;
  const wait = (ms) => new Promise((r) => setTimeout(r, reduced ? 0 : ms));

  function line(text, tone, append) {
    const p = document.createElement('p');
    p.className = tone ? 'out-' + tone : '';
    p.textContent = text;
    if (append) out.append(p);
    else out.replaceChildren(p);
  }

  function invalid(field, bad) {
    if (bad) field.setAttribute('aria-invalid', 'true');
    else field.removeAttribute('aria-invalid');
    return bad;
  }

  form.addEventListener('input', (e) => {
    if (e.target.hasAttribute('aria-invalid')) invalid(e.target, !e.target.checkValidity());
  });

  let sending = false;
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (sending) return;
    const name = $('#form-name');
    const email = $('#form-email');
    const message = $('#form-message');
    const honey = $('#form-honey');

    const bad = [name, email, message].filter((f) => invalid(f, !f.value.trim() || !f.checkValidity()));
    if (bad.length) {
      line('SYSTEM ERROR: PARÂMETROS INCOMPLETOS.', 'error');
      line(bad[0] === email && email.value.trim() ? 'Confira o formato do email de contato.' : 'Preencha nome, email e mensagem para transmitir.', 'muted', true);
      bad[0].focus();
      return;
    }

    const lastSent = parseInt(store.get('quantum_transmission_cooldown') || '0', 10);
    if (lastSent && Date.now() - lastSent < COOLDOWN) {
      const secs = Math.ceil((COOLDOWN - (Date.now() - lastSent)) / 1000);
      line('SYSTEM ERROR: TRANSCEPTOR NEURAL SUPERAQUECIDO!', 'error');
      line(`Aguarde o resfriamento dos servidores quânticos (${secs}s) para evitar sobrecarga de coordenadas.`, 'muted', true);
      return;
    }

    const who = name.value.trim();
    sending = true;

    // The 3D guide (if it's around) turns to mist first; the transmission then
    // comes out of it. Never wait on it for long.
    const guide = window.avatarGuide;
    if (guide) await Promise.race([guide.beginSend(), wait(1800)]);

    submit.disabled = true;
    submitLabel.textContent = 'Transmitindo dados...';

    line('SYSTEM: COMPILANDO PACOTE DE TRANSMISSÃO...', 'amber');
    await wait(700);
    line('SYSTEM: APLICANDO CRIPTOGRAFIA NEURAL QUANTICA...', 'muted', true);
    await wait(700);
    line('SYSTEM: DISPARANDO PACOTE DE DADOS PARA LEONARDO DE OLIVEIRA!', 'teal', true);
    const origin = guide ? guide.fire() : null;

    const done = (ok) => {
      if (ok) {
        line('TRANSMISSÃO CONCLUÍDA COM SUCESSO!', 'teal');
        line(`Obrigado, ${who}. Sua mensagem foi enviada ao terminal do Léo.`, 'muted', true);
        form.reset();
      } else {
        line('FALHA NA TRANSMISSÃO QUANTICA!', 'error');
        line('Erro ao rotear pacote de dados. Por favor, verifique sua conexão e tente novamente.', 'muted', true);
      }
      submit.disabled = false;
      submitLabel.textContent = 'Executar transmissão';
      sending = false;
      if (guide) guide.result(ok);
    };

    // Bots fill the invisible field: pretend it worked, send nothing.
    if (honey.value) {
      await wait(900);
      done(true);
      return;
    }

    if (engine) {
      engine.transmit(origin || $('#terminal').getBoundingClientRect());
      wake();
    }

    try {
      const res = await fetch('https://formsubmit.co/ajax/leonardooliveira.sl@gmail.com', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ Nome: who, Email: email.value.trim(), Mensagem: message.value, _captcha: 'false', _honey: '' }),
      });
      if (!res.ok) throw new Error('FormSubmit ' + res.status);
      await res.json();
      store.set('quantum_transmission_cooldown', String(Date.now()));
      await wait(600);
      done(true);
    } catch (err) {
      console.error('Erro no envio:', err);
      await wait(600);
      done(false);
    }
  });

  // -------------------------------------------------------------------------
  // Boot: paint first, then light the sea.
  // -------------------------------------------------------------------------
  measure();
  const boot = () => setTimeout(startEngine, 0);
  if (document.readyState === 'complete') requestAnimationFrame(boot);
  else requestAnimationFrame(() => requestAnimationFrame(boot));
})();
