/**
 * Zudo Reusable Components — Header & Footer
 * Injects standardized navbar and footer into placeholder elements.
 */
(function () {
  'use strict';

  var GITHUB_URL = 'https://github.com/oyinlola-tech/zudo';
  var NPM_URL = 'https://www.npmjs.com/org/zudojs';
  var TWITTER_URL = 'https://x.com/zudojs';

  var GITHUB_SVG = '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/></svg>';
  var NPM_SVG = '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M1.763 0C.786 0 0 .786 0 1.763v20.474C0 23.214.786 24 1.763 24h20.474c.977 0 1.763-.786 1.763-1.763V1.763C24 .786 23.214 0 22.237 0zM5.13 5.323l13.837.019v13.49h-3.464V8.393h-3.578v10.44H5.13zm1.434 14.107h3.578V9.671h3.578v9.759h3.578V5.323h-14.31z"/></svg>';
  var TWITTER_SVG = '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>';

  function getActivePage() {
    var path = window.location.pathname;
    if (path.includes('/docs/packages')) return 'packages';
    if (path.includes('/docs/architecture')) return 'architecture';
    if (path.includes('/docs/concepts')) return 'concepts';
    if (path.includes('/docs/getting-started')) return 'docs';
    if (path.includes('/docs/contributing')) return 'docs';
    if (path.includes('/docs/roadmap')) return 'docs';
    if (path.includes('/docs/rules')) return 'docs';
    if (path === '/' || path === '/index.html') return 'home';
    return 'docs';
  }

  function renderNavbar() {
    var placeholder = document.getElementById('zudo-nav');
    if (!placeholder) return;

    var active = getActivePage();
    var isHome = active === 'home';

    if (isHome) {
      placeholder.outerHTML = [
        '<nav class="sticky top-0 z-50 bg-zudo-black text-zudo-white border-b-4 border-zudo-red">',
        '  <div class="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">',
        '    <a href="/" class="flex items-center gap-3">',
        '      <div class="w-10 h-10 bg-zudo-red border-3 border-zudo-white flex items-center justify-center">',
        '        <span class="text-zudo-black font-black text-xl">Z</span>',
        '      </div>',
        '      <span class="text-2xl font-black tracking-tight">ZUDO</span>',
        '    </a>',
        '    <div class="hidden md:flex items-center gap-8">',
        '      <a href="/docs/getting-started" class="nav-link text-sm font-bold uppercase tracking-wider hover:text-zudo-red">Docs</a>',
        '      <a href="/docs/packages" class="nav-link text-sm font-bold uppercase tracking-wider hover:text-zudo-red">Packages</a>',
        '      <a href="/docs/architecture" class="nav-link text-sm font-bold uppercase tracking-wider hover:text-zudo-red">Architecture</a>',
        '      <a href="/docs/contributing" class="nav-link text-sm font-bold uppercase tracking-wider hover:text-zudo-red">Contributing</a>',
        '      <a href="/docs/roadmap" class="nav-link text-sm font-bold uppercase tracking-wider hover:text-zudo-red">Roadmap</a>',
        '    </div>',
        '    <div class="flex items-center gap-4">',
        '      <a href="' + GITHUB_URL + '" target="_blank" rel="noopener" class="p-2 border-2 border-zudo-white hover:border-zudo-blue hover:bg-zudo-blue hover:text-zudo-white">' + GITHUB_SVG + '</a>',
        '      <a href="/docs/getting-started" class="hidden sm:inline-block px-5 py-2 bg-zudo-red text-zudo-black font-bold border-3 border-zudo-white hover:bg-zudo-yellow hover:border-zudo-black">Get Started</a>',
        '      <button id="mobileMenuTrigger" class="md:hidden p-2 border-2 border-zudo-white hover:border-zudo-red">',
        '        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 12h18M3 6h18M3 18h18"></path></svg>',
        '      </button>',
        '    </div>',
        '  </div>',
        '  <div id="mobileMenu" class="hidden md:hidden border-t-2 border-zudo-red px-6 py-4">',
        '    <div class="flex flex-col gap-4">',
        '      <a href="/docs/getting-started" class="text-sm font-bold uppercase tracking-wider hover:text-zudo-red">Docs</a>',
        '      <a href="/docs/packages" class="text-sm font-bold uppercase tracking-wider hover:text-zudo-red">Packages</a>',
        '      <a href="/docs/architecture" class="text-sm font-bold uppercase tracking-wider hover:text-zudo-red">Architecture</a>',
        '      <a href="/docs/contributing" class="text-sm font-bold uppercase tracking-wider hover:text-zudo-red">Contributing</a>',
        '      <a href="/docs/roadmap" class="text-sm font-bold uppercase tracking-wider hover:text-zudo-red">Roadmap</a>',
        '    </div>',
        '  </div>',
        '</nav>',
      ].join('\n');
    } else {
      placeholder.outerHTML = [
        '<nav class="sticky top-0 z-50 bg-black text-white border-b-4 border-zudo-red">',
        '  <div class="max-w-screen-2xl mx-auto px-6 py-3 flex items-center justify-between">',
        '    <a href="/" class="flex items-center gap-2">',
        '      <div class="w-8 h-8 bg-zudo-red border-2 border-white flex items-center justify-center">',
        '        <span class="text-black font-black text-sm">Z</span>',
        '      </div>',
        '      <span class="text-xl font-black">ZUDO</span>',
        '    </a>',
         '    <div class="hidden md:flex items-center gap-6 text-sm font-bold">',
        '      <a href="/docs/getting-started" class="hover:text-zudo-red' + (active === 'docs' ? ' text-zudo-red' : '') + '">Docs</a>',
        '      <a href="/docs/packages" class="hover:text-zudo-red' + (active === 'packages' ? ' text-zudo-red' : '') + '">Packages</a>',
        '      <a href="/docs/architecture" class="hover:text-zudo-red' + (active === 'architecture' ? ' text-zudo-red' : '') + '">Architecture</a>',
        '      <a href="/docs/concepts" class="hover:text-zudo-red' + (active === 'concepts' ? ' text-zudo-red' : '') + '">Concepts</a>',
        '      <a href="/docs/contributing" class="hover:text-zudo-red' + (active === 'contributing' ? ' text-zudo-red' : '') + '">Contributing</a>',
        '      <a href="/docs/roadmap" class="hover:text-zudo-red' + (active === 'roadmap' ? ' text-zudo-red' : '') + '">Roadmap</a>',
        '    </div>',
        '    <a href="' + GITHUB_URL + '" target="_blank" class="p-2 border-2 border-white hover:bg-white hover:text-black">' + GITHUB_SVG + '</a>',
        '  </div>',
        '</nav>',
      ].join('\n');
    }
  }

  function renderFooter() {
    var placeholder = document.getElementById('zudo-footer');
    if (!placeholder) return;

    var active = getActivePage();
    var isHome = active === 'home';

    if (isHome) {
      placeholder.outerHTML = [
        '<footer class="bg-zudo-black text-zudo-white border-t-4 border-zudo-red">',
        '  <div class="max-w-7xl mx-auto px-6 py-16">',
        '    <div class="grid grid-cols-1 md:grid-cols-4 gap-12">',
        '      <div class="md:col-span-1">',
        '        <div class="flex items-center gap-3 mb-4">',
        '          <div class="w-10 h-10 bg-zudo-red border-3 border-zudo-white flex items-center justify-center">',
        '            <span class="text-zudo-black font-black text-xl">Z</span>',
        '          </div>',
        '          <span class="text-2xl font-black">ZUDO</span>',
        '        </div>',
        '        <p class="text-zudo-white/50 text-sm leading-relaxed">Modular TypeScript framework for building scalable, maintainable, and production-ready applications.</p>',
        '      </div>',
        '      <div>',
        '        <h4 class="font-bold text-sm uppercase tracking-wider mb-4 text-zudo-red">Documentation</h4>',
        '        <ul class="space-y-2">',
        '          <li><a href="/docs/getting-started" class="text-sm text-zudo-white/70 hover:text-zudo-white">Getting Started</a></li>',
        '          <li><a href="/docs/architecture" class="text-sm text-zudo-white/70 hover:text-zudo-white">Architecture</a></li>',
        '          <li><a href="/docs/concepts" class="text-sm text-zudo-white/70 hover:text-zudo-white">Concepts</a></li>',
        '          <li><a href="/docs/packages" class="text-sm text-zudo-white/70 hover:text-zudo-white">Packages</a></li>',
        '        </ul>',
        '      </div>',
        '      <div>',
        '        <h4 class="font-bold text-sm uppercase tracking-wider mb-4 text-zudo-blue">Community</h4>',
        '        <ul class="space-y-2">',
        '          <li><a href="/docs/contributing" class="text-sm text-zudo-white/70 hover:text-zudo-white">Contributing</a></li>',
        '          <li><a href="/docs/roadmap" class="text-sm text-zudo-white/70 hover:text-zudo-white">Roadmap</a></li>',
        '          <li><a href="/sponsors" class="text-sm text-zudo-white/70 hover:text-zudo-white">Sponsors</a></li>',
        '          <li><a href="' + GITHUB_URL + '/issues" target="_blank" rel="noopener" class="text-sm text-zudo-white/70 hover:text-zudo-white">Report Issue</a></li>',
        '        </ul>',
        '      </div>',
        '      <div>',
        '        <h4 class="font-bold text-sm uppercase tracking-wider mb-4 text-zudo-yellow">Legal</h4>',
        '        <ul class="space-y-2">',
        '          <li><a href="' + GITHUB_URL + '/blob/main/LICENSE" target="_blank" rel="noopener" class="text-sm text-zudo-white/70 hover:text-zudo-white">MIT License</a></li>',
        '          <li><a href="' + GITHUB_URL + '/blob/main/SECURITY.md" target="_blank" rel="noopener" class="text-sm text-zudo-white/70 hover:text-zudo-white">Security Policy</a></li>',
        '          <li><a href="' + GITHUB_URL + '/blob/main/CONTRIBUTING.md" target="_blank" rel="noopener" class="text-sm text-zudo-white/70 hover:text-zudo-white">Code of Conduct</a></li>',
        '        </ul>',
        '      </div>',
        '    </div>',
        '    <div class="border-t-2 border-zudo-white/10 mt-12 pt-8 flex flex-col md:flex-row items-center justify-between gap-4">',
        '      <div class="text-sm text-zudo-white/50">&copy; 2026 Zudo. MIT License. Built with intention.</div>',
        '      <div class="flex items-center gap-4">',
        '        <a href="' + GITHUB_URL + '" target="_blank" rel="noopener" class="text-zudo-white/50 hover:text-zudo-white">' + GITHUB_SVG + '</a>',
        '        <a href="' + NPM_URL + '" target="_blank" rel="noopener" class="text-zudo-white/50 hover:text-zudo-white">' + NPM_SVG + '</a>',
        '        <a href="' + TWITTER_URL + '" target="_blank" rel="noopener" class="text-zudo-white/50 hover:text-zudo-white">' + TWITTER_SVG + '</a>',
        '      </div>',
        '    </div>',
        '  </div>',
        '</footer>',
      ].join('\n');
    } else {
      placeholder.outerHTML = [
        '<footer class="bg-zudo-black text-white border-t-4 border-zudo-red">',
        '  <div class="max-w-screen-2xl mx-auto px-6 py-12">',
        '    <div class="grid grid-cols-1 md:grid-cols-4 gap-8 mb-8">',
        '      <div>',
        '        <div class="flex items-center gap-2 mb-3">',
        '          <div class="w-8 h-8 bg-zudo-red border-2 border-white flex items-center justify-center">',
        '            <span class="text-white font-black text-sm">Z</span>',
        '          </div>',
        '          <span class="text-lg font-black tracking-tight">ZUDO</span>',
        '        </div>',
        '        <p class="text-white/50 text-xs leading-relaxed">Modular TypeScript framework for building scalable, production-ready applications.</p>',
        '      </div>',
        '      <div>',
        '        <h4 class="font-bold text-xs uppercase tracking-wider mb-3 text-zudo-red">Docs</h4>',
        '        <ul class="space-y-1.5">',
        '          <li><a href="/docs/getting-started" class="text-xs text-white/60 hover:text-white">Getting Started</a></li>',
        '          <li><a href="/docs/architecture" class="text-xs text-white/60 hover:text-white">Architecture</a></li>',
        '          <li><a href="/docs/concepts" class="text-xs text-white/60 hover:text-white">Concepts</a></li>',
        '          <li><a href="/docs/packages" class="text-xs text-white/60 hover:text-white">All Packages</a></li>',
        '        </ul>',
        '      </div>',
        '      <div>',
        '        <h4 class="font-bold text-xs uppercase tracking-wider mb-3 text-zudo-blue">Community</h4>',
        '        <ul class="space-y-1.5">',
        '          <li><a href="/docs/contributing" class="text-xs text-white/60 hover:text-white">Contributing</a></li>',
        '          <li><a href="/docs/roadmap" class="text-xs text-white/60 hover:text-white">Roadmap</a></li>',
        '          <li><a href="/sponsors" class="text-xs text-white/60 hover:text-white">Sponsors</a></li>',
        '          <li><a href="' + GITHUB_URL + '/issues" target="_blank" rel="noopener" class="text-xs text-white/60 hover:text-white">Report Issue</a></li>',
        '        </ul>',
        '      </div>',
        '      <div>',
        '        <h4 class="font-bold text-xs uppercase tracking-wider mb-3 text-zudo-yellow">Legal</h4>',
        '        <ul class="space-y-1.5">',
        '          <li><a href="' + GITHUB_URL + '/blob/main/LICENSE" target="_blank" rel="noopener" class="text-xs text-white/60 hover:text-white">MIT License</a></li>',
        '          <li><a href="' + GITHUB_URL + '/blob/main/SECURITY.md" target="_blank" rel="noopener" class="text-xs text-white/60 hover:text-white">Security Policy</a></li>',
        '        </ul>',
        '      </div>',
        '    </div>',
        '    <div class="border-t border-white/10 pt-6 flex flex-col md:flex-row items-center justify-between gap-4">',
        '      <div class="text-xs text-white/40">&copy; 2026 Zudo. MIT License. Built with intention.</div>',
        '      <div class="flex items-center gap-4">',
        '        <a href="' + GITHUB_URL + '" target="_blank" rel="noopener" class="text-white/40 hover:text-white" aria-label="GitHub">' + GITHUB_SVG + '</a>',
        '        <a href="' + NPM_URL + '" target="_blank" rel="noopener" class="text-white/40 hover:text-white" aria-label="npm">' + NPM_SVG + '</a>',
        '        <a href="' + TWITTER_URL + '" target="_blank" rel="noopener" class="text-white/40 hover:text-white" aria-label="Twitter">' + TWITTER_SVG + '</a>',
        '      </div>',
        '    </div>',
        '  </div>',
        '</footer>',
      ].join('\n');
    }
  }

  function initMobileMenu() {
    var trigger = document.getElementById('mobileMenuTrigger');
    var menu = document.getElementById('mobileMenu');
    if (trigger && menu) {
      trigger.addEventListener('click', function () {
        menu.classList.toggle('hidden');
      });
    }
  }

  // Initialize
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () {
      renderNavbar();
      renderFooter();
      initMobileMenu();
    });
  } else {
    renderNavbar();
    renderFooter();
    initMobileMenu();
  }
})();
