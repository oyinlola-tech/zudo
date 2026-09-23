/**
 * Learn pages: wires each example's "Run in browser" button to the docked
 * terminal (js/playground.js), its "Edit" button to the editor (js/ide.js),
 * and remembers which lessons you finished (a passed test marks it too).
 *
 * Public API (used by scripts/site-learn.mjs --browser):
 *   window.ZudoLearn.run(index) → Promise<{ kind, text }[]>
 *   window.ZudoLearn.edit(index), window.ZudoLearn.markDone(slug)
 */
(function () {
  'use strict';

  var DONE_KEY = 'zudo.learn.done';

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

  function run(index) {
    var fig = document.querySelector('.lx-example[data-index="' + index + '"]');
    if (!fig) return Promise.reject(new Error('no example ' + index));
    return ready().then(function (pg) {
      pg.registerFiles(projectFiles(fig));
      return pg.exec(source(fig), fig.getAttribute('data-file'));
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

  function paintDone() {
    var done = readDone();
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
    window.ZudoLearn = { run: run, edit: edit, markDone: markDone };
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
