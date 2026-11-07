/**
 * Leonardo de Oliveira · Abissal
 * avatar.js: decides whether the guide should appear, and loads it late.
 *
 * The 3D guide (avatar-scene.js + three.js + the model) is ~330 KB gzipped, so it
 * is only fetched after the page has loaded and the browser is idle, never on
 * save-data connections, and never without WebGL.
 */
(function () {
  'use strict';

  const doc = document.documentElement;
  const conn = navigator.connection || {};
  if (conn.saveData || /(^|-)2g$/.test(conn.effectiveType || '')) return;
  if (new URLSearchParams(location.search).has('noavatar')) return;

  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const idle = window.requestIdleCallback || ((fn) => setTimeout(fn, 1200));

  function boot() {
    if (doc.classList.contains('no-webgl')) return;
    import('./avatar-scene.js')
      .then((m) => m.start({ reduced }))
      .catch((err) => console.warn('[avatar] not started:', err));
  }

  function later() {
    // Give the sea its intro burst first (~1.5 s), then wait for a quiet moment.
    setTimeout(() => idle(boot, { timeout: 4000 }), 1600);
  }

  if (document.readyState === 'complete') later();
  else window.addEventListener('load', later, { once: true });
})();
