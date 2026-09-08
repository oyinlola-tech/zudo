/**
 * Zudo Documentation — page scripts
 * Sidebar (active state + mobile drawer), TOC, code copy, anchor links.
 * Global search lives in components.js.
 */
(function () {
  'use strict';

  /* Normalise "/docs/packages/auth", "/docs/packages-auth.html", "/docs/packages-auth/"
     to "/docs/packages-auth" so links and the live URL can be compared. */
  function normalise(p) {
    p = p.replace(/\.html$/, '').replace(/\/+$/, '');
    var m = p.match(/^\/docs\/([^/]+)\/(.+)$/);
    if (m) p = '/docs/' + m[1] + '-' + m[2];
    return p || '/';
  }

  /* ---------- sidebar ---------- */

  function initSidebar() {
    var mainEl = document.querySelector('main');
    if (mainEl) mainEl.classList.add('doc-main');
    var sidebar = document.querySelector('.doc-sidebar');
    if (!sidebar) return;
    sidebar.id = sidebar.id || 'docSidebar';

    var here = normalise(window.location.pathname);
    var active = null;
    sidebar.querySelectorAll('.sidebar-item').forEach(function (a) {
      var href = a.getAttribute('href') || '';
      var isActive = normalise(href) === here;
      a.classList.toggle('sidebar-item-active', isActive);
      if (isActive) { active = a; a.setAttribute('aria-current', 'page'); }
    });
    if (active) {
      var top = active.offsetTop - sidebar.clientHeight / 2;
      if (top > 0) sidebar.scrollTop = top;
    }

    // Mobile toolbar + drawer
    var h1 = document.querySelector('main h1');
    var bar = document.createElement('div');
    bar.className = 'doc-mobilebar';
    bar.innerHTML =
      '<button type="button" id="docMenuToggle" aria-controls="docSidebar" aria-expanded="false">' +
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="square" aria-hidden="true"><path d="M3 6h18M3 12h18M3 18h18"/></svg>Menu</button>' +
      '<span class="crumb">' + (h1 ? h1.textContent.replace(/#$/, '').trim() : 'Documentation') + '</span>';
    var backdrop = document.createElement('div');
    backdrop.className = 'doc-backdrop';

    var layout = sidebar.parentNode;
    layout.parentNode.insertBefore(bar, layout);
    document.body.appendChild(backdrop);

    var btn = bar.querySelector('#docMenuToggle');
    function setOpen(open) {
      sidebar.classList.toggle('is-open', open);
      backdrop.classList.toggle('is-open', open);
      document.body.classList.toggle('doc-drawer-open', open);
      btn.setAttribute('aria-expanded', open ? 'true' : 'false');
    }
    btn.addEventListener('click', function () { setOpen(!sidebar.classList.contains('is-open')); });
    backdrop.addEventListener('click', function () { setOpen(false); });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && sidebar.classList.contains('is-open')) setOpen(false);
    });
  }

  /* ---------- table of contents (generated when a page has none) ---------- */

  function initToc() {
    var toc = document.querySelector('.doc-toc, .doc-toc-sidebar');
    if (!toc) return;
    var hasLinks = toc.querySelector('.toc-link, .toc-item');
    if (!hasLinks) {
      var headings = document.querySelectorAll('main h2[id], main h3[id]');
      if (!headings.length) return;
      var frag = document.createDocumentFragment();
      headings.forEach(function (h) {
        var a = document.createElement('a');
        a.href = '#' + h.id;
        a.className = 'toc-link';
        a.dataset.level = h.tagName === 'H3' ? '3' : '2';
        a.textContent = h.textContent.replace(/#$/, '').trim();
        frag.appendChild(a);
      });
      (toc.querySelector('div') || toc).appendChild(frag);
    }
  }

  /* ---------- anchor links ---------- */

  function initAnchors() {
    document.querySelectorAll('main h2[id], main h3[id]').forEach(function (h) {
      if (h.querySelector('.anchor-link')) return;
      var a = document.createElement('a');
      a.href = '#' + h.id;
      a.className = 'anchor-link';
      a.textContent = '#';
      a.setAttribute('aria-label', 'Link to ' + h.textContent.trim());
      h.appendChild(a);
    });
  }

  /* ---------- tables scroll instead of overflowing ---------- */

  function initTables() {
    document.querySelectorAll('main table').forEach(function (t) {
      if (t.parentNode.classList.contains('table-wrap')) return;
      var wrap = document.createElement('div');
      wrap.className = 'table-wrap';
      t.parentNode.insertBefore(wrap, t);
      wrap.appendChild(t);
    });
  }

  function init() {
    initSidebar();
    initTables();
    initToc();
    initAnchors();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
