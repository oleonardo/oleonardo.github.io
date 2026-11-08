/**
 * Leonardo de Oliveira · Abissal
 * avatar.js: decides whether the guide should appear, and starts it right away.
 *
 * The guide is always on the page: it is fetched as soon as the page is parsed (the
 * model alongside the code, not after it), not after a quiet moment, so it is there
 * from the first seconds without the visitor doing anything. Never on save-data
 * connections, and never without WebGL.
 */
(function () {
  'use strict';

  const doc = document.documentElement;
  const conn = navigator.connection || {};
  if (conn.saveData || /(^|-)2g$/.test(conn.effectiveType || '')) return;
  if (new URLSearchParams(location.search).has('noavatar')) return;

  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

  // the model downloads while the code does (the loader's fetch picks this one up)
  const pre = document.createElement('link');
  pre.rel = 'preload';
  pre.as = 'fetch';
  pre.crossOrigin = 'anonymous';
  pre.href = 'assets/avatar/placeholder-robot.glb';
  document.head.appendChild(pre);

  import('./avatar-scene.js')
    .then((m) => { if (!doc.classList.contains('no-webgl')) m.start({ reduced }); })
    .catch((err) => console.warn('[avatar] not started:', err));
})();
