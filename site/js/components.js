/**
 * Zudo shared components — header, footer, global search.
 * Renders into <div id="zudo-nav"> and <div id="zudo-footer"> on every page.
 */
(function () {
  'use strict';

  var VERSION = '0.1.0';
  var GITHUB_URL = 'https://github.com/oyinlola-tech/zudo';
  var NPM_URL = 'https://www.npmjs.com/org/zudojs';
  var TWITTER_URL = 'https://x.com/zudojs';
  var SPONSOR_URL = 'https://github.com/sponsors/oyinlola-tech';

  /* ---------- icons ---------- */

  var ICON = {
    github: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/></svg>',
    npm: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M1.763 0C.786 0 0 .786 0 1.763v20.474C0 23.214.786 24 1.763 24h20.474c.977 0 1.763-.786 1.763-1.763V1.763C24 .786 23.214 0 22.237 0zM5.13 5.323l13.837.019v13.49h-3.464V8.393h-3.578v10.44H5.13zm1.434 14.107h3.578V9.671h3.578v9.759h3.578V5.323h-14.31z"/></svg>',
    x: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>',
    search: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="square" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/></svg>',
    menu: '<svg class="ic-open" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="square" aria-hidden="true"><path d="M3 6h18M3 12h18M3 18h18"/></svg><svg class="ic-close" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="square" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>',
    up: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="square" aria-hidden="true"><path d="M12 19V5M5 12l7-7 7 7"/></svg>',
    mark: '<svg class="zh-mark" viewBox="0 0 80 80" fill="none" aria-hidden="true"><rect x="3" y="3" width="74" height="74" fill="#C0392B" stroke="#FAFAF9" stroke-width="6"/><path d="M20 24h40L20 56h40" stroke="#FAFAF9" stroke-width="10" stroke-linecap="square" stroke-linejoin="miter" fill="none"/></svg>',
    word: '<svg class="zh-wordmark" viewBox="0 0 220 44" fill="none" aria-hidden="true"><g stroke="currentColor" stroke-width="12" stroke-linecap="square" stroke-linejoin="miter"><path d="M6 6H34L6 38H34"/><path d="M64 6V38H92V6"/><path d="M122 6H140L150 16V28L140 38H122Z"/><path d="M180 6H208V38H180Z"/></g></svg>',
  };

  /* ---------- navigation model ---------- */

  var NAV = [
    { key: 'docs', label: 'Docs', href: '/docs/getting-started', match: ['/docs/getting-started', '/docs/contributing', '/docs/rules'] },
    { key: 'packages', label: 'Packages', href: '/docs/packages', match: ['/docs/packages'] },
    { key: 'architecture', label: 'Architecture', href: '/docs/architecture', match: ['/docs/architecture'] },
    { key: 'concepts', label: 'Concepts', href: '/docs/concepts', match: ['/docs/concepts'] },
    { key: 'roadmap', label: 'Roadmap', href: '/docs/roadmap', match: ['/docs/roadmap'] },
    { key: 'sponsors', label: 'Sponsors', href: '/sponsors', match: ['/sponsors'] },
  ];

  function activeKey() {
    var path = window.location.pathname.replace(/\.html$/, '').replace(/\/$/, '') || '/';
    for (var i = 0; i < NAV.length; i++) {
      for (var j = 0; j < NAV[i].match.length; j++) {
        if (path.indexOf(NAV[i].match[j]) === 0) return NAV[i].key;
      }
    }
    return path === '/' ? 'home' : '';
  }

  /* ---------- search index (clean URLs, mirrors vercel.json) ---------- */

  var SEARCH_INDEX = [
    { g: 'Getting started', t: 'Installation', p: '/docs/getting-started', e: 'Install Zudo from npm. Node.js 24 or newer.' },
    { g: 'Getting started', t: 'Your first app', p: '/docs/getting-started/first-app', e: 'Scaffold a project with the CLI and start it.' },
    { g: 'Getting started', t: 'Project structure', p: '/docs/getting-started/project-structure', e: 'Standard layout for a Zudo application.' },
    { g: 'Architecture', t: 'Architecture overview', p: '/docs/architecture', e: 'Five layers, one dependency direction.' },
    { g: 'Architecture', t: 'Module system', p: '/docs/architecture/module-system', e: 'Modules as self-contained units of functionality.' },
    { g: 'Architecture', t: 'Runtime', p: '/docs/architecture/runtime', e: 'The application lifecycle orchestrator.' },
    { g: 'Architecture', t: 'Adapters', p: '/docs/architecture/adapters', e: 'Boundary layer between Zudo and external platforms.' },
    { g: 'Architecture', t: 'Dependency direction', p: '/docs/architecture/dependency-direction', e: 'Dependencies flow inward through five tiers.' },
    { g: 'Concepts', t: 'Application', p: '/docs/concepts', e: 'Top-level container for modules, plugins and infrastructure.' },
    { g: 'Concepts', t: 'Configuration', p: '/docs/concepts/configuration', e: 'Layered configuration with clear precedence.' },
    { g: 'Concepts', t: 'Contexts', p: '/docs/concepts/contexts', e: 'AsyncLocalStorage-based context propagation.' },
    { g: 'Concepts', t: 'Dependency injection', p: '/docs/concepts/dependency-injection', e: 'Token-based container with scoped lifecycles.' },
    { g: 'Concepts', t: 'Lifecycle', p: '/docs/concepts/lifecycle', e: 'State machine for component lifecycle.' },
    { g: 'Concepts', t: 'Modules', p: '/docs/concepts/modules', e: 'Primary building blocks with explicit boundaries.' },
    { g: 'Reference', t: 'All packages', p: '/docs/packages', e: '38 packages across six categories.' },
    { g: 'Reference', t: 'Roadmap', p: '/docs/roadmap', e: 'Implementation status and future direction.' },
    { g: 'Reference', t: 'Package rules', p: '/docs/rules', e: 'Development standards every package follows.' },
    { g: 'Reference', t: 'Contributing', p: '/docs/contributing', e: 'How to contribute to Zudo.' },
    { g: 'Reference', t: 'Sponsors', p: '/sponsors', e: 'Support the ecosystem.' },
  ];

  var PACKAGES = [
    ['adapters', 'Boundary layer for external platforms'], ['api', 'Transport-agnostic operations, interceptors, results'],
    ['auth', 'JWT, sessions, password hashing, RBAC'], ['cache', 'Cache abstraction with memory adapter'],
    ['cli', 'Command-line scaffolding and generators'], ['config', 'Layered configuration sources'],
    ['constants', 'Shared constants and enums'], ['container', 'Token-based DI container'],
    ['core', 'Application, modules, lifecycle, runtime'], ['cqrs', 'Commands, queries, handlers'],
    ['crypto', 'Hashing, encryption, signing'], ['database', 'Database abstraction and adapters'],
    ['docs', 'Documentation generation'], ['errors', 'Error base class and utilities'],
    ['events', 'Event bus, emitter, middleware'], ['feature-flags', 'Runtime feature toggles'],
    ['http', 'HTTP server and client primitives'], ['lifecycle', 'Component lifecycle state machine'],
    ['logger', 'Structured logging with transports'], ['messaging', 'Message brokers and channels'],
    ['middleware', 'Composable middleware pipeline'], ['observability', 'Metrics, tracing, health'],
    ['openapi', 'OpenAPI spec generation'], ['permissions', 'Permission and policy checks'],
    ['plugins', 'Plugin system'], ['queue', 'Job queues and workers'],
    ['rpc', 'Remote procedure calls'], ['runtime', 'Runtime orchestration'],
    ['scheduler', 'Cron and interval scheduling'], ['schema', 'Schema definition and parsing'],
    ['security', 'Security headers, CSRF, rate limits'], ['serialization', 'Serializers and codecs'],
    ['storage', 'File and object storage'], ['tenancy', 'Multi-tenant isolation'],
    ['testing', 'Test utilities and harnesses'], ['transactions', 'Unit of work and transactions'],
    ['types', 'Shared TypeScript types'], ['validation', 'Validation rules and pipelines'],
  ];

  PACKAGES.forEach(function (p) {
    SEARCH_INDEX.push({ g: 'Packages', t: '@zudojs/' + p[0], p: '/docs/packages/' + p[0], e: p[1] });
  });

  /* ---------- helpers ---------- */

  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function highlight(text, q) {
    if (!q) return esc(text);
    var re = new RegExp('(' + q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ')', 'ig');
    return esc(text).replace(re, '<mark>$1</mark>');
  }

  /* ---------- header ---------- */

  function renderHeader() {
    var slot = document.getElementById('zudo-nav');
    if (!slot) return;

    var active = activeKey();

    var links = NAV.map(function (n) {
      return '<a class="zh-link' + (active === n.key ? ' is-active' : '') + '" href="' + n.href + '"' +
        (active === n.key ? ' aria-current="page"' : '') + '>' + n.label + '</a>';
    }).join('');

    var mobileLinks = [{ key: 'home', label: 'Home', href: '/' }].concat(NAV).map(function (n) {
      return '<a class="zh-mobile-link' + (active === n.key ? ' is-active' : '') + '" href="' + n.href + '">' + n.label + '</a>';
    }).join('');

    slot.outerHTML =
      '<a class="z-skip" href="#main">Skip to content</a>' +
      '<header class="zh" id="zudoHeader">' +
        '<div class="zh-inner">' +
          '<a class="zh-brand" href="/" aria-label="Zudo home">' + ICON.mark +
            '<span class="zh-word">' + ICON.word + '<span class="sr-only">Zudo</span></span><span class="zh-ver">v' + VERSION + '</span></a>' +
          '<nav class="zh-nav" aria-label="Primary">' + links + '</nav>' +
          '<div class="zh-actions">' +
            '<button type="button" class="zh-btn zh-search" id="zudoSearchTrigger" aria-label="Search documentation">' +
              ICON.search + '<span class="zh-search-label">Search docs</span><kbd>Ctrl K</kbd></button>' +
            '<button type="button" class="zh-btn zh-btn--icon zh-term" id="zudoTerminalTrigger" title="Open the playground (Ctrl+`)" aria-label="Open the playground">&gt;_</button>' +
            '<a class="zh-btn zh-btn--icon" href="' + GITHUB_URL + '" target="_blank" rel="noopener" aria-label="Zudo on GitHub">' + ICON.github + '</a>' +
            '<a class="zh-cta" href="/docs/getting-started">Get started</a>' +
            '<button type="button" class="zh-btn zh-btn--icon zh-burger" id="zudoMenuTrigger" aria-label="Open menu" aria-expanded="false" aria-controls="zudoMobileMenu">' + ICON.menu + '</button>' +
          '</div>' +
        '</div>' +
        '<div class="zh-mobile" id="zudoMobileMenu">' +
          '<nav class="zh-mobile-inner" aria-label="Mobile">' + mobileLinks +
            '<div class="zh-mobile-cta">' +
              '<a class="zh-cta" href="/docs/getting-started">Get started</a>' +
              '<a class="zh-btn" href="' + GITHUB_URL + '" target="_blank" rel="noopener">' + ICON.github + ' GitHub</a>' +
            '</div>' +
          '</nav>' +
        '</div>' +
      '</header>';

    var header = document.getElementById('zudoHeader');
    var trigger = document.getElementById('zudoMenuTrigger');
    trigger.addEventListener('click', function () {
      var open = header.classList.toggle('is-menu-open');
      trigger.setAttribute('aria-expanded', open ? 'true' : 'false');
      trigger.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
    });

    document.getElementById('zudoTerminalTrigger').addEventListener('click', function () {
      if (window.ZudoPlayground) window.ZudoPlayground.toggle();
    });
  }

  /* ---------- footer ---------- */

  function renderFooter() {
    var slot = document.getElementById('zudo-footer');
    if (!slot) return;

    function col(title, cls, items) {
      return '<div class="zf-col"><h4 class="' + cls + '">' + title + '</h4><ul>' + items.map(function (i) {
        var ext = i[2] ? ' target="_blank" rel="noopener"' : '';
        return '<li><a href="' + i[1] + '"' + ext + '>' + i[0] + (i[2] ? '<span class="ext">↗</span>' : '') + '</a></li>';
      }).join('') + '</ul></div>';
    }

    slot.outerHTML =
      '<footer class="zf" id="zudoFooter">' +
        '<div class="zf-inner">' +
          '<div class="zf-grid">' +
            '<div class="zf-brand">' +
              '<a class="zh-brand" href="/" aria-label="Zudo home">' + ICON.mark + '<span class="zh-word">' + ICON.word + '<span class="sr-only">Zudo</span></span><span class="zh-ver">v' + VERSION + '</span></a>' +
              '<p class="zf-tagline">A modular TypeScript framework for scalable, maintainable, production-ready applications.</p>' +
              '<div class="zf-install"><code><span class="p">$</span> npm install @zudojs/core</code>' +
                '<button type="button" id="zudoFooterCopy" aria-label="Copy install command">COPY</button></div>' +
            '</div>' +
            col('Documentation', 'c-red', [
              ['Getting started', '/docs/getting-started'],
              ['Your first app', '/docs/getting-started/first-app'],
              ['Architecture', '/docs/architecture'],
              ['Concepts', '/docs/concepts'],
              ['Package rules', '/docs/rules'],
            ]) +
            col('Packages', 'c-blue', [
              ['@zudojs/core', '/docs/packages/core'],
              ['@zudojs/http', '/docs/packages/http'],
              ['@zudojs/container', '/docs/packages/container'],
              ['@zudojs/auth', '/docs/packages/auth'],
              ['All 38 packages', '/docs/packages'],
            ]) +
            col('Community', 'c-green', [
              ['Contributing', '/docs/contributing'],
              ['Roadmap', '/docs/roadmap'],
              ['Sponsors', '/sponsors'],
              ['Report an issue', GITHUB_URL + '/issues', true],
              ['Discussions', GITHUB_URL + '/discussions', true],
            ]) +
            col('Project', 'c-yellow', [
              ['GitHub', GITHUB_URL, true],
              ['npm', NPM_URL, true],
              ['MIT license', GITHUB_URL + '/blob/main/LICENSE', true],
              ['Security policy', GITHUB_URL + '/blob/main/SECURITY.md', true],
              ['Code of conduct', GITHUB_URL + '/blob/main/CODE_OF_CONDUCT.md', true],
            ]) +
          '</div>' +
          '<div class="zf-bottom">' +
            '<span>&copy; 2026 Zudo</span><span class="sep">/</span>' +
            '<span>MIT License</span><span class="sep">/</span>' +
            '<span>Built with intention.</span>' +
            '<div class="zf-social">' +
              '<a href="' + GITHUB_URL + '" target="_blank" rel="noopener" aria-label="GitHub">' + ICON.github + '</a>' +
              '<a href="' + NPM_URL + '" target="_blank" rel="noopener" aria-label="npm">' + ICON.npm + '</a>' +
              '<a href="' + TWITTER_URL + '" target="_blank" rel="noopener" aria-label="X (Twitter)">' + ICON.x + '</a>' +
              '<button type="button" class="zf-top" id="zudoBackToTop">' + ICON.up + 'TOP</button>' +
            '</div>' +
          '</div>' +
        '</div>' +
      '</footer>';

    document.getElementById('zudoBackToTop').addEventListener('click', function () {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });

    var copy = document.getElementById('zudoFooterCopy');
    copy.addEventListener('click', function () {
      var done = function () {
        copy.textContent = 'COPIED';
        copy.classList.add('is-done');
        setTimeout(function () { copy.textContent = 'COPY'; copy.classList.remove('is-done'); }, 1600);
      };
      if (navigator.clipboard) navigator.clipboard.writeText('npm install @zudojs/core').then(done, done);
      else done();
    });
  }

  /* ---------- global search ---------- */

  function renderSearch() {
    if (document.getElementById('zudoSearch')) return;

    var wrap = document.createElement('div');
    wrap.className = 'zs-overlay';
    wrap.id = 'zudoSearch';
    wrap.setAttribute('role', 'dialog');
    wrap.setAttribute('aria-modal', 'true');
    wrap.setAttribute('aria-label', 'Search documentation');
    wrap.innerHTML =
      '<div class="zs-panel">' +
        '<div class="zs-head">' + ICON.search +
          '<input class="zs-input" id="zudoSearchInput" type="text" placeholder="Search packages, concepts, guides…" autocomplete="off" spellcheck="false" aria-label="Search">' +
          '<button type="button" class="zs-esc" id="zudoSearchClose">ESC</button>' +
        '</div>' +
        '<div class="zs-results" id="zudoSearchResults" role="listbox"></div>' +
        '<div class="zs-foot"><span><kbd>↑</kbd><kbd>↓</kbd> navigate</span><span><kbd>↵</kbd> open</span><span><kbd>esc</kbd> close</span></div>' +
      '</div>';
    document.body.appendChild(wrap);

    var input = document.getElementById('zudoSearchInput');
    var results = document.getElementById('zudoSearchResults');
    var trigger = document.getElementById('zudoSearchTrigger');
    var closeBtn = document.getElementById('zudoSearchClose');
    var filtered = [];
    var index = -1;

    function open() {
      wrap.classList.add('is-open');
      input.value = '';
      render('');
      setTimeout(function () { input.focus(); }, 0);
    }

    function close() {
      wrap.classList.remove('is-open');
      index = -1;
    }

    function render(q) {
      q = q.trim().toLowerCase();
      index = -1;
      if (!q) {
        filtered = SEARCH_INDEX.filter(function (i) { return i.g !== 'Packages'; }).slice(0, 8);
      } else {
        filtered = SEARCH_INDEX.filter(function (i) {
          return i.t.toLowerCase().indexOf(q) !== -1 ||
                 i.e.toLowerCase().indexOf(q) !== -1 ||
                 i.p.toLowerCase().indexOf(q) !== -1;
        }).slice(0, 24);
      }

      if (!filtered.length) {
        results.innerHTML = '<div class="zs-empty">No results for <strong>' + esc(q) + '</strong>.<br>Try a package name like <strong>http</strong> or a concept like <strong>lifecycle</strong>.</div>';
        return;
      }

      var html = '';
      var lastGroup = null;
      filtered.forEach(function (item, i) {
        if (item.g !== lastGroup) {
          html += '<div class="zs-group">' + esc(item.g) + '</div>';
          lastGroup = item.g;
        }
        html += '<a class="zs-item" role="option" data-i="' + i + '" href="' + item.p + '">' +
          '<div><div class="zs-item-title">' + highlight(item.t, q) + '</div>' +
          '<div class="zs-item-excerpt">' + highlight(item.e, q) + '</div></div>' +
          '<span class="zs-item-path">' + esc(item.p) + '</span></a>';
      });
      results.innerHTML = html;
    }

    function move(delta) {
      var items = results.querySelectorAll('.zs-item');
      if (!items.length) return;
      index = Math.max(0, Math.min(items.length - 1, index + delta));
      items.forEach(function (el, i) { el.classList.toggle('is-active', i === index); });
      items[index].scrollIntoView({ block: 'nearest' });
    }

    if (trigger) trigger.addEventListener('click', open);
    closeBtn.addEventListener('click', close);
    wrap.addEventListener('click', function (e) { if (e.target === wrap) close(); });
    input.addEventListener('input', function () { render(input.value); });
    input.addEventListener('keydown', function (e) {
      if (e.key === 'ArrowDown') { e.preventDefault(); move(1); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); move(-1); }
      else if (e.key === 'Enter') {
        var items = results.querySelectorAll('.zs-item');
        var target = items[index] || items[0];
        if (target) window.location.href = target.getAttribute('href');
      }
    });

    document.addEventListener('keydown', function (e) {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        if (wrap.classList.contains('is-open')) close(); else open();
      } else if (e.key === 'Escape' && wrap.classList.contains('is-open')) {
        close();
      }
    });

    // Deep link from the 404 page: /?q=term
    var q = new URLSearchParams(window.location.search).get('q');
    if (q) { open(); input.value = q; render(q); }

    window.ZudoSearch = { open: open, close: close };
  }

  function init() {
    renderHeader();
    renderFooter();
    renderSearch();
    var main = document.querySelector('main');
    if (main && !main.id) main.id = 'main';
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
