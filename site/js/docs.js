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
    // Static markup only; the heading text is assigned as text so a heading
    // containing markup characters can never be reinterpreted as HTML.
    bar.innerHTML =
      '<button type="button" id="docMenuToggle" aria-controls="docSidebar" aria-expanded="false">' +
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="square" aria-hidden="true"><path d="M3 6h18M3 12h18M3 18h18"/></svg>Menu</button>' +
      '<span class="crumb"></span>';
    bar.querySelector('.crumb').textContent =
      h1 ? h1.textContent.replace(/#$/, '').trim() : 'Documentation';
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

  /* ---------- table of contents: build when missing, always scroll-spy ---------- */

  function initToc() {
    var main = document.querySelector('main');
    if (!main || !document.querySelector('.doc-sidebar')) return;
    var toc = document.querySelector('.doc-toc');
    // Entries come from <section id> blocks (their first h2/h3 is the label),
    // from headings that already carry an id, and — so that every page gets a
    // usable table of contents — from headings we give an id to here.
    function slug(text) {
      return text.toLowerCase().trim()
        .replace(/[^\w\s-]/g, '')
        .replace(/\s+/g, '-')
        .replace(/-+/g, '-')
        .slice(0, 60);
    }

    var entries = [];
    var seen = {};
    var used = {};
    Array.prototype.slice.call(main.querySelectorAll('section[id], h2, h3')).forEach(function (el) {
      var text, level = 2, id;
      if (el.tagName === 'SECTION') {
        var h = el.querySelector('h2, h3');
        if (!h) return;
        text = h.textContent; level = h.tagName === 'H3' ? 3 : 2; id = el.id;
      } else {
        if (el.closest('.pg')) return;
        var owner = el.closest('section[id]');
        if (owner && seen[owner.id]) return;      // already represented by its section
        text = el.textContent; level = el.tagName === 'H3' ? 3 : 2;
        id = el.id;
        if (!id) {
          var base = slug(text.replace(/#$/, ''));
          if (!base) return;
          id = base;
          while (document.getElementById(id) || used[id]) id = base + '-' + (used[base] = (used[base] || 1) + 1);
          el.id = id;
        }
      }
      text = text.replace(/#$/, '').trim();
      if (!text || !id || seen[id]) return;
      used[id] = 1;
      seen[id] = true;
      entries.push({ id: id, text: text, level: level });
    });
    var headings = entries;

    if (!toc) {
      if (headings.length < 2) return;
      toc = document.createElement('aside');
      toc.className = 'doc-toc';
      toc.setAttribute('aria-label', 'On this page');
      main.parentNode.insertBefore(toc, main.nextSibling);
    }

    // Fill the table of contents: keep any hand-written links, then append one
    // for every section that is missing, in document order.
    var host = toc.querySelector('div:not([class*="text-xs"])') || toc;
    var linked = {};
    toc.querySelectorAll('.toc-link, .toc-item').forEach(function (a) {
      linked[(a.getAttribute('href') || '').slice(1)] = true;
    });

    if (!toc.querySelector('.text-xs') && !Object.keys(linked).length) {
      var label = document.createElement('div');
      label.className = 'text-xs font-bold uppercase tracking-wider mb-4 text-black/40';
      label.textContent = 'On this page';
      host.appendChild(label);
    }

    headings.forEach(function (h) {
      if (linked[h.id]) return;
      var a = document.createElement('a');
      a.href = '#' + h.id;
      a.className = 'toc-link' + (h.level === 3 ? ' toc-link-nested' : '');
      a.textContent = h.text;
      // Insert in document order relative to the links already there.
      var existing = Array.prototype.slice.call(toc.querySelectorAll('.toc-link, .toc-item'));
      var before = null;
      for (var i = 0; i < existing.length; i++) {
        var id = (existing[i].getAttribute('href') || '').slice(1);
        var target = document.getElementById(id);
        var mine = document.getElementById(h.id);
        if (target && mine && (target.compareDocumentPosition(mine) & Node.DOCUMENT_POSITION_PRECEDING)) {
          before = existing[i];
          break;
        }
      }
      if (before) before.parentNode.insertBefore(a, before);
      else host.appendChild(a);
      linked[h.id] = true;
    });

    // Scroll spy over whatever the links point at (sections or headings).
    var links = Array.prototype.slice.call(toc.querySelectorAll('.toc-link, .toc-item'));
    var targets = [];
    links.forEach(function (a) {
      var id = (a.getAttribute('href') || '').slice(1);
      var el = id && document.getElementById(id);
      if (el) targets.push({ el: el, link: a });
    });
    if (!targets.length) return;

    function activate(link) {
      links.forEach(function (l) { l.classList.remove('toc-link-active', 'toc-item-active'); });
      link.classList.add(link.classList.contains('toc-item') ? 'toc-item-active' : 'toc-link-active');
      var r = link.getBoundingClientRect(), t = toc.getBoundingClientRect();
      if (r.top < t.top + 40 || r.bottom > t.bottom - 40) link.scrollIntoView({ block: 'center' });
    }

    var navH = 64;
    function update() {
      var y = window.scrollY + navH + 24;
      var current = targets[0];
      for (var i = 0; i < targets.length; i++) {
        if (targets[i].el.offsetTop <= y) current = targets[i];
      }
      if (window.innerHeight + window.scrollY >= document.body.offsetHeight - 2) current = targets[targets.length - 1];
      activate(current.link);
    }
    var ticking = false;
    window.addEventListener('scroll', function () {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(function () { update(); ticking = false; });
    }, { passive: true });
    update();
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
