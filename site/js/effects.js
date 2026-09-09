/**
 * Zudo motion layer
 *
 * Two things, both optional and both cheap to skip:
 *
 *  1. A three.js hero backdrop — a lattice of wireframe modules with a red
 *     diagonal traced through it, the same idea as the logo: structure, with
 *     one path running through the layers.
 *  2. jQuery interactions — scroll reveals, animated counters, ticker control
 *     and card tilt.
 *
 * Both libraries are loaded from a CDN only when the page can actually use
 * them. Everything degrades to the plain static page if a load fails, if the
 * viewer prefers reduced motion, or if the device looks too small or too slow.
 *
 * Design brief: motion 2/10. Slow, structural, never decorative.
 */
(function () {
  'use strict';

  var THREE_URL = 'https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js';
  var JQUERY_URL = 'https://cdnjs.cloudflare.com/ajax/libs/jquery/3.7.1/jquery.min.js';

  var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var lowPower =
    (navigator.hardwareConcurrency && navigator.hardwareConcurrency <= 4) ||
    (navigator.deviceMemory && navigator.deviceMemory <= 4) ||
    (navigator.connection && /(^|-)2g$/.test(navigator.connection.effectiveType || ''));

  var docEl = document.documentElement;

  // Content is visible by default. Only once this script is running — and only
  // when motion is wanted — do we opt the page into the hidden-then-revealed
  // state. A blocked CDN, a JS error or reduced motion therefore leaves every
  // section readable instead of blank.
  var wantsReveal = !reduceMotion && 'IntersectionObserver' in window;
  if (wantsReveal) docEl.classList.add('reveal-armed');

  // Last-resort failsafe: if anything below throws, nothing stays hidden.
  var failsafe = setTimeout(function () { docEl.classList.remove('reveal-armed'); }, 4000);

  function loadScript(src) {
    return new Promise(function (resolve, reject) {
      var s = document.createElement('script');
      s.src = src;
      s.async = true;
      s.onload = resolve;
      s.onerror = function () { reject(new Error('could not load ' + src)); };
      document.head.appendChild(s);
    });
  }

  /* ======================================================================
     1. Hero backdrop
     ====================================================================== */

  function initHero() {
    var host = document.querySelector('[data-zudo-scene]');
    if (!host) return;
    if (reduceMotion && lowPower) return;            // not worth the bytes
    if (window.innerWidth < 768) return;             // phones keep the flat hero
    if (!window.WebGLRenderingContext) return;

    loadScript(THREE_URL).then(function () {
      if (!window.THREE) return;
      build(host);
    }).catch(function () {
      /* No backdrop. The hero is designed to look right without it. */
    });
  }

  function build(host) {
    var THREE = window.THREE;

    var canvas = document.createElement('canvas');
    canvas.className = 'hero-canvas';
    canvas.setAttribute('aria-hidden', 'true');
    host.insertBefore(canvas, host.firstChild);

    var renderer;
    try {
      renderer = new THREE.WebGLRenderer({
        canvas: canvas,
        alpha: true,
        antialias: window.devicePixelRatio < 2,
        powerPreference: 'low-power',
      });
    } catch (e) {
      canvas.remove();
      return;
    }

    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));

    var scene = new THREE.Scene();
    scene.fog = new THREE.Fog(0x1a1a2e, 12, 30);

    var camera = new THREE.PerspectiveCamera(42, 1, 0.1, 100);
    camera.position.set(0, 0, 26);

    var world = new THREE.Group();
    scene.add(world);

    // ---- the lattice -------------------------------------------------
    // A 5×5 grid of module cubes on five depth layers: the architecture
    // diagram, essentially, seen at an angle.
    var COLS = 5, ROWS = 5, LAYERS = 5, GAP = 2.7, SIZE = 1.15;

    var box = new THREE.BoxGeometry(SIZE, SIZE, SIZE);
    var edges = new THREE.EdgesGeometry(box);

    // Deliberately faint: this sits behind a headline and must never compete
    // with it. The red path is the only thing that reads at a glance.
    var lineMat = new THREE.LineBasicMaterial({
      color: 0xfafaf9, transparent: true, opacity: 0.10,
    });
    var lineMatBright = new THREE.LineBasicMaterial({
      color: 0xfafaf9, transparent: true, opacity: 0.22,
    });
    var solidMat = new THREE.MeshBasicMaterial({
      color: 0xc0392b, transparent: true, opacity: 0.30,
    });
    var solidEdge = new THREE.LineBasicMaterial({ color: 0xc0392b, opacity: 0.55, transparent: true });

    var nodes = [];

    // The red path: down the top row, diagonally back, along the bottom row —
    // the Z from the mark, drawn through the depth of the lattice.
    function onPath(c, r, l) {
      if (r === 0 && l === 0) return true;                    // top bar
      if (r === ROWS - 1 && l === LAYERS - 1) return true;     // bottom bar
      return c === ROWS - 1 - r && r === l;                    // the diagonal
    }

    for (var l = 0; l < LAYERS; l++) {
      for (var r = 0; r < ROWS; r++) {
        for (var c = 0; c < COLS; c++) {
          var lit = onPath(c, r, l);
          // Thin the lattice out so it reads as structure, not as a solid block.
          if (!lit && (c + r + l) % 2 !== 0) continue;

          var mesh;
          if (lit) {
            mesh = new THREE.Mesh(box, solidMat);
            mesh.add(new THREE.LineSegments(edges, solidEdge));
          } else {
            mesh = new THREE.LineSegments(edges, (c + r) % 3 === 0 ? lineMatBright : lineMat);
          }

          mesh.position.set(
            (c - (COLS - 1) / 2) * GAP,
            ((ROWS - 1) / 2 - r) * GAP,
            (l - (LAYERS - 1) / 2) * GAP - 3
          );
          mesh.userData = {
            phase: (c * 0.7 + r * 1.1 + l * 0.45),
            baseY: mesh.position.y,
            lit: lit,
          };
          world.add(mesh);
          nodes.push(mesh);
        }
      }
    }

    world.rotation.x = -0.18;
    world.rotation.y = 0.62;

    // ---- sizing --------------------------------------------------------
    function resize() {
      var w = host.clientWidth || 1;
      var h = host.clientHeight || 1;
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      // Pull the camera back on narrow viewports so the lattice still fits.
      camera.position.z = w < 1100 ? 30 : 26;
      camera.updateProjectionMatrix();
    }
    resize();

    var resizeTimer;
    window.addEventListener('resize', function () {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(resize, 150);
    });

    // ---- pointer parallax ---------------------------------------------
    var targetX = 0, targetY = 0, curX = 0, curY = 0;
    if (window.matchMedia('(pointer: fine)').matches) {
      window.addEventListener('pointermove', function (e) {
        targetX = (e.clientX / window.innerWidth - 0.5) * 0.34;
        targetY = (e.clientY / window.innerHeight - 0.5) * 0.2;
      }, { passive: true });
    }

    // ---- run / pause ---------------------------------------------------
    var running = true;
    var frame = null;
    var start = performance.now();

    var io = new IntersectionObserver(function (entries) {
      running = entries[0].isIntersecting && !document.hidden;
      if (running && frame === null) tick();
    }, { threshold: 0 });
    io.observe(host);

    document.addEventListener('visibilitychange', function () {
      running = !document.hidden;
      if (running && frame === null) tick();
    });

    function draw(t) {
      curX += (targetX - curX) * 0.045;
      curY += (targetY - curY) * 0.045;

      world.rotation.y = 0.62 + curX + t * 0.016;
      world.rotation.x = -0.18 + curY;

      for (var i = 0; i < nodes.length; i++) {
        var n = nodes[i];
        var d = n.userData;
        n.position.y = d.baseY + Math.sin(t * 0.5 + d.phase) * 0.12;
        if (d.lit) {
          n.rotation.y = t * 0.24 + d.phase;
        }
      }
      renderer.render(scene, camera);
    }

    function tick() {
      if (!running) { frame = null; return; }
      var t = (performance.now() - start) / 1000;
      draw(t);
      frame = requestAnimationFrame(tick);
    }

    host.classList.add('has-scene');

    if (reduceMotion) {
      draw(0);                                  // one still frame, no loop
    } else {
      tick();
    }

    window.addEventListener('pagehide', function () {
      if (frame) cancelAnimationFrame(frame);
      io.disconnect();
      nodes.length = 0;
      box.dispose(); edges.dispose();
      lineMat.dispose(); lineMatBright.dispose(); solidMat.dispose(); solidEdge.dispose();
      renderer.dispose();
    });
  }

  /* ======================================================================
     2. jQuery interactions
     ====================================================================== */

  function initReveals() {
    var items = document.querySelectorAll('[data-reveal]');
    if (!items.length) return;

    if (!wantsReveal) return;   // already visible; nothing to do

    var observer = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        var el = entry.target;
        var delay = Number(el.getAttribute('data-reveal-delay') || 0);
        setTimeout(function () { el.classList.add('is-revealed'); }, delay);
        observer.unobserve(el);
      });
    }, { rootMargin: '0px 0px -12% 0px', threshold: 0.08 });

    Array.prototype.forEach.call(items, function (el) {
      if (!el.getAttribute('data-reveal-delay')) {
        var siblings = el.parentNode ? el.parentNode.querySelectorAll(':scope > [data-reveal]') : [];
        var idx = Array.prototype.indexOf.call(siblings, el);
        if (idx > 0) el.setAttribute('data-reveal-delay', String(Math.min(idx, 5) * 70));
      }
      observer.observe(el);
    });
  }

  function initCounters() {
    var counters = document.querySelectorAll('[data-count]');
    if (!counters.length) return;

    Array.prototype.forEach.call(counters, function (el) {
      var target = Number(el.getAttribute('data-count'));
      if (!isFinite(target)) return;

      if (reduceMotion || !('IntersectionObserver' in window)) {
        el.textContent = String(target);
        return;
      }

      el.textContent = '0';
      var io = new IntersectionObserver(function (entries) {
        if (!entries[0].isIntersecting) return;
        io.disconnect();
        var DURATION = 900;
        var started = null;
        function step(now) {
          if (started === null) started = now;
          var p = Math.min(1, (now - started) / DURATION);
          el.textContent = String(Math.round(target * (1 - Math.pow(1 - p, 3))));
          if (p < 1) requestAnimationFrame(step);
          else el.textContent = String(target);
        }
        requestAnimationFrame(step);
      }, { threshold: 0.4 });
      io.observe(el);
    });
  }

  function initInteractions() {
    var wants =
      document.querySelector('[data-reveal]') ||
      document.querySelector('[data-count]') ||
      document.querySelector('.ticker') ||
      document.querySelector('.doc-sidebar');   // docs pages get the progress bar
    if (!wants) return;

    loadScript(JQUERY_URL).then(function () {
      var $ = window.jQuery;
      if (!$) return;
      $(function () {
        tickerControls($);
        cardTilt($);
        activeNavProgress($);
      });
    }).catch(function () {
      /* Ticker pause, tilt and the progress bar are optional polish. */
    });
  }

  function tickerControls($) {
    var $ticker = $('.ticker');
    if (!$ticker.length) return;
    // Pause while a pointer is over it, so a name can actually be read.
    $ticker.on('mouseenter focusin', function () { $(this).addClass('is-paused'); })
           .on('mouseleave focusout', function () { $(this).removeClass('is-paused'); });
  }

  function cardTilt($) {
    if (reduceMotion || !window.matchMedia('(pointer: fine)').matches) return;
    // A 2px shift towards the cursor. Enough to feel alive, not enough to wobble.
    $('.feature-card, .pkg-card').on('pointermove', function (e) {
      var r = this.getBoundingClientRect();
      var dx = (e.clientX - r.left) / r.width - 0.5;
      var dy = (e.clientY - r.top) / r.height - 0.5;
      this.style.setProperty('--tilt-x', (dx * 4).toFixed(2) + 'px');
      this.style.setProperty('--tilt-y', (dy * 4).toFixed(2) + 'px');
    }).on('pointerleave', function () {
      this.style.removeProperty('--tilt-x');
      this.style.removeProperty('--tilt-y');
    });
  }

  function activeNavProgress($) {
    // .doc-sidebar is in the served HTML; .doc-main is added later by docs.js,
    // so keying off it here would race.
    if (!document.querySelector('.doc-sidebar')) return;
    var $bar = $('<div class="read-progress" aria-hidden="true"><i></i></div>');
    $('body').append($bar);
    var $fill = $bar.find('i');

    function update() {
      var h = document.documentElement;
      var max = h.scrollHeight - h.clientHeight;
      var pct = max > 0 ? (h.scrollTop || document.body.scrollTop) / max : 0;
      $fill.css('transform', 'scaleX(' + Math.min(1, Math.max(0, pct)) + ')');
    }
    $(window).on('scroll resize', update);
    update();
  }

  /* ---------------------------------------------------------------- */

  function init() {
    clearTimeout(failsafe);
    initReveals();
    initCounters();
    initHero();
    initInteractions();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
