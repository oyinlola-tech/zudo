/**
 * Learn pages: wires each example's "Run in browser" button to the docked
 * terminal (js/playground.js), its "Edit" button to the editor (js/ide.js),
 * and remembers which lessons you finished (a passed test marks it too).
 * Progress bars ([data-progress]) and "continue" buttons ([data-continue])
 * on the academy and course pages are filled in from that same record.
 *
 * Public API (used by scripts/site-learn.mjs --browser):
 *   window.ZudoLearn.run(index) → Promise<{ kind, text }[]>
 *   window.ZudoLearn.edit(index), window.ZudoLearn.markDone(slug)
 *   window.ZudoLearn.runFiles(files, file, { dom, box }) → Promise<{ kind, text }[]>
 */
(function () {
  'use strict';

  var DONE_KEY = 'zudo.learn.done';
  var LAST_KEY = 'zudo.learn.last';

  function readDone() {
    try { return JSON.parse(localStorage.getItem(DONE_KEY) || '[]'); } catch (e) { return []; }
  }

  function writeDone(list) {
    try { localStorage.setItem(DONE_KEY, JSON.stringify(list)); } catch (e) {}
  }

  function source(fig) {
    var s = fig.querySelector('.lx-src');
    return s ? s.textContent.replace(/<\\\/(script)/gi, '</$1') : '';
  }

  /* Every file of this example's project that appears up to and including it. */
  function projectFiles(fig) {
    var project = fig.getAttribute('data-project');
    var files = {};
    if (!project) return files;
    var all = document.querySelectorAll('.lx-example[data-project="' + project + '"]');
    for (var i = 0; i < all.length; i++) {
      files[all[i].getAttribute('data-file')] = source(all[i]);
      if (all[i] === fig) break;
    }
    return files;
  }

  function ready() {
    return new Promise(function (resolve) {
      if (window.ZudoPlayground && window.ZudoPlayground.exec) resolve(window.ZudoPlayground);
      else document.addEventListener('zudo:playground-ready', function () { resolve(window.ZudoPlayground); }, { once: true });
    });
  }

  /* Browser globals a DOM example sees from its preview frame instead of this page. */
  var DOM_GLOBALS = ['window', 'document', 'globalThis', 'self', 'location', 'history', 'navigator',
    'localStorage', 'sessionStorage', 'getComputedStyle', 'requestAnimationFrame', 'cancelAnimationFrame',
    'queueMicrotask', 'structuredClone', 'Node', 'Element', 'HTMLElement', 'HTMLInputElement',
    'HTMLFormElement', 'HTMLButtonElement', 'HTMLTemplateElement', 'HTMLAnchorElement', 'Text', 'Comment',
    'DocumentFragment', 'NodeList', 'HTMLCollection', 'Event', 'CustomEvent', 'MouseEvent', 'KeyboardEvent',
    'InputEvent', 'FocusEvent', 'SubmitEvent', 'EventTarget', 'FormData', 'DOMParser', 'MutationObserver',
    'IntersectionObserver', 'ResizeObserver', 'customElements', 'URL', 'URLSearchParams', 'AbortController',
    'AbortSignal', 'DOMException', 'PopStateEvent', 'HashChangeEvent', 'StorageEvent', 'MessageEvent',
    'PointerEvent', 'ProgressEvent', 'ErrorEvent', 'Blob', 'File', 'FileReader'];

  /* A DOM example runs against a frame built from its project's .html and .css files. */
  function domFrame(fig) {
    var box = fig.querySelector('.lx-preview');
    if (!box) {
      box = document.createElement('div');
      box.className = 'lx-preview';
      box.innerHTML = '<div class="lx-out-label">Preview</div>';
      var out = fig.querySelector('.lx-out');
      fig.insertBefore(box, out || null);
    }
    return frameIn(box, projectFiles(fig), 'Preview of ' + fig.getAttribute('data-file'));
  }

  /* A fresh preview frame inside `box`, built from the .html and .css files in `files`. */
  function frameIn(box, files, title) {
    var html = '<!DOCTYPE html><html><head></head><body></body></html>';
    var css = '';
    Object.keys(files).forEach(function (name) {
      if (/\.html$/.test(name)) html = files[name];
      if (/\.css$/.test(name)) css += files[name] + '\n';
    });
    if (css) html = html.replace(/<\/head>/i, '<style>' + css + '</style></head>');
    var old = box.querySelector('iframe');
    if (old) old.remove();
    var frame = document.createElement('iframe');
    frame.title = title;
    frame.setAttribute('sandbox', 'allow-scripts allow-same-origin allow-forms allow-modals');
    box.appendChild(frame);
    return new Promise(function (resolve) {
      frame.addEventListener('load', function () { resolve(frame.contentWindow); }, { once: true });
      frame.srcdoc = html;
    });
  }

  function domGlobals(win) {
    var values = DOM_GLOBALS.map(function (name) {
      var v = win[name];
      return typeof v === 'function' && /^[a-z]/.test(name) ? v.bind(win) : v;
    });
    return { names: DOM_GLOBALS, values: values };
  }

  function run(index) {
    var fig = document.querySelector('.lx-example[data-index="' + index + '"]');
    if (!fig) return Promise.reject(new Error('no example ' + index));
    return ready().then(function (pg) {
      pg.registerFiles(projectFiles(fig));
      if (fig.getAttribute('data-runtime') !== 'dom') return pg.exec(source(fig), fig.getAttribute('data-file'));
      return domFrame(fig).then(function (win) {
        return pg.exec(source(fig), fig.getAttribute('data-file'), { globals: domGlobals(win) });
      });
    });
  }

  /* Runs `file` from `files` (path → code) the way an example runs: in the terminal, or against
     a preview frame in `box` when opts.dom is set. Used by js/exercise.js. */
  function runFiles(files, file, opts) {
    opts = opts || {};
    return ready().then(function (pg) {
      pg.registerFiles(files);
      if (!opts.dom) return pg.exec(files[file], file, { show: false });
      return frameIn(opts.box, files, 'Preview of ' + file).then(function (win) {
        return pg.exec(files[file], file, { show: false, globals: domGlobals(win) });
      });
    });
  }

  /* "Edit": open this example, and the files of its project up to it, in the editor (js/ide.js). */
  function edit(index) {
    var fig = document.querySelector('.lx-example[data-index="' + index + '"]');
    if (!fig || !window.ZudoIDE) return;
    var project = fig.getAttribute('data-project') || 'examples';
    var files = [];
    var all = fig.getAttribute('data-project')
      ? document.querySelectorAll('.lx-example[data-project="' + project + '"]')
      : [fig];
    for (var i = 0; i < all.length; i++) {
      files.push({ project: project, path: all[i].getAttribute('data-file'), content: source(all[i]) });
      if (all[i] === fig) break;
    }
    window.ZudoIDE.open({ files: files, focus: { project: project, path: fig.getAttribute('data-file') } });
  }

  function markDone(slug) {
    var list = readDone();
    if (list.indexOf(slug) === -1) { list.push(slug); writeDone(list); }
    paintDone();
  }

  function paintProgress(done) {
    document.querySelectorAll('[data-progress]').forEach(function (el) {
      var slugs = el.getAttribute('data-progress').split(' ');
      var n = slugs.filter(function (s) { return done.indexOf(s) !== -1; }).length;
      var bar = el.querySelector('.lx-progress-bar span');
      if (bar) bar.style.width = Math.round((n / slugs.length) * 100) + '%';
      var text = el.querySelector('.lx-progress-text');
      if (text) text.textContent = n + ' of ' + slugs.length + (/lessons done/.test(text.textContent) ? ' lessons done' : ' done');
      el.classList.toggle('is-started', n > 0);
      el.classList.toggle('is-complete', n === slugs.length);
    });
    var last = null;
    try { last = localStorage.getItem(LAST_KEY); } catch (e) {}
    document.querySelectorAll('[data-continue]').forEach(function (a) {
      var slugs = a.getAttribute('data-continue').split(' ');
      var started = slugs.some(function (s) { return done.indexOf(s) !== -1 || s === last; });
      if (!started) return;
      var target = last && slugs.indexOf(last) !== -1 && done.indexOf(last) === -1
        ? last
        : slugs.filter(function (s) { return done.indexOf(s) === -1; })[0];
      if (target) {
        a.href = '/learn/' + target;
        a.textContent = 'Continue where you left off →';
      } else {
        a.href = '/learn/' + slugs[0];
        a.textContent = 'All done. Review from lesson 1 →';
      }
    });
  }

  function paintDone() {
    var done = readDone();
    paintProgress(done);
    document.querySelectorAll('[data-lesson]').forEach(function (el) {
      if (el.classList.contains('lx-main')) return;
      el.classList.toggle('is-done', done.indexOf(el.getAttribute('data-lesson')) !== -1);
    });
    var btn = document.querySelector('.lx-done');
    if (btn) {
      var isDone = done.indexOf(btn.getAttribute('data-lesson')) !== -1;
      btn.textContent = isDone ? '✓ Done. Click to undo' : 'Mark this lesson as done';
      btn.setAttribute('aria-pressed', String(isDone));
    }
  }

  /* components.js puts a floating copy button on every <pre>. In a lesson
     block that button would cover the first line of code, so move it into
     the block's title bar, before "Run in browser". */
  function dockCopyButtons() {
    document.querySelectorAll('.lx-example, .lx-shell').forEach(function (fig) {
      var btn = fig.querySelector('.code-wrap > .copy-btn');
      var bar = fig.querySelector('.lx-bar');
      if (!btn || !bar) return;
      var run = bar.querySelector('.lx-run, .lx-nodeonly');
      bar.insertBefore(btn, run);
      fig.classList.add('has-docked-copy');
    });
  }

  function init() {
    var main = document.querySelector('.lx-main[data-lesson]');
    if (main) { try { localStorage.setItem(LAST_KEY, main.getAttribute('data-lesson')); } catch (e) {} }
    document.addEventListener('click', function (e) {
      var btn = e.target.closest && e.target.closest('.lx-run');
      if (btn) {
        e.preventDefault();
        run(btn.getAttribute('data-index'));
        return;
      }
      var ed = e.target.closest && e.target.closest('.lx-edit');
      if (ed) {
        e.preventDefault();
        edit(ed.getAttribute('data-index'));
        return;
      }
      if (e.target.closest && e.target.closest('.lx-open-ide')) {
        e.preventDefault();
        if (window.ZudoIDE) window.ZudoIDE.open({});
        return;
      }
      var done = e.target.closest && e.target.closest('.lx-done');
      if (done) {
        var slug = done.getAttribute('data-lesson');
        var list = readDone();
        var at = list.indexOf(slug);
        if (at === -1) list.push(slug); else list.splice(at, 1);
        writeDone(list);
        paintDone();
      }
    });
    paintDone();
    dockCopyButtons();
    requestAnimationFrame(dockCopyButtons);
    window.ZudoLearn = { run: run, edit: edit, markDone: markDone, runFiles: runFiles, source: source };
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
