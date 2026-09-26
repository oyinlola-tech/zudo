/**
 * The Learn editor: a VS Code-style workspace on every lesson page.
 *
 * - Explorer with one folder per example project, tabs, a terminal panel and
 *   a status bar. The editor is Monaco (the editor inside VS Code), loaded from
 *   jsDelivr the first time the workspace opens; without it, a plain text area.
 * - Files are saved in localStorage as you type, one workspace per lesson.
 * - Run (Ctrl/Cmd+Enter) runs the active file in the browser terminal
 *   (js/playground.js). Files in the same folder can import each other.
 *
 * - An exercise (js/exercise.js) opens it with `check`: a task bar and a Check
 *   button appear. "run" checks run the learner's code and compare what it
 *   prints; "paste" checks compare terminal output the learner pastes in.
 *
 * Public API:
 *   ZudoIDE.open({ files?: [{ project, path, content, origin? }], focus?: { project, path }, onChange?: fn,
 *                  check?: { title, mode: "run"|"paste", project, file, command?, run(files) → Promise<lines>,
 *                            verify(text) → { ok, line?, want?, got? }, onResult(ok) } })
 *   ZudoIDE.close()
 */
(function () {
  'use strict';

  var MONACO = 'https://cdn.jsdelivr.net/npm/monaco-editor@0.52.2/min';
  var KEY = 'zudo.ide.v1.' + (location.pathname.replace(/^\/+|\/+$/g, '').replace(/[^\w-]+/g, '.') || 'home');

  /* ---------------- storage ---------------- */

  /* { projects: { name: { path: { content, origin } } }, tabs: ["project/path"], active: "project/path" } */
  function load() {
    try {
      var ws = JSON.parse(localStorage.getItem(KEY) || 'null');
      if (ws && ws.projects) return ws;
    } catch (e) {}
    return { projects: {}, tabs: [], active: null };
  }
  var ws = load();
  var saveTimer = null;
  function save(now) {
    clearTimeout(saveTimer);
    var write = function () {
      try { localStorage.setItem(KEY, JSON.stringify(ws)); setStatus('Saved in this browser'); }
      catch (e) { setStatus('Could not save: browser storage is full or blocked'); }
    };
    if (now) write(); else { setStatus('Saving…'); saveTimer = setTimeout(write, 300); }
  }

  function id(project, path) { return project + '/' + path; }
  function split(fileId) { var i = fileId.indexOf('/'); return { project: fileId.slice(0, i), path: fileId.slice(i + 1) }; }
  function fileOf(fileId) { var p = split(fileId); return ws.projects[p.project] && ws.projects[p.project][p.path]; }

  function escapeHtml(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function language(path) {
    if (/\.(ts|mts|cts)$/.test(path)) return 'typescript';
    if (/\.(js|mjs|cjs)$/.test(path)) return 'javascript';
    if (/\.json$/.test(path)) return 'json';
    if (/\.(html?)$/.test(path)) return 'html';
    if (/\.css$/.test(path)) return 'css';
    if (/\.md$/.test(path)) return 'markdown';
    if (/\.ya?ml$/.test(path)) return 'yaml';
    return 'plaintext';
  }
  var LANG_LABEL = { typescript: 'TypeScript', javascript: 'JavaScript', json: 'JSON', html: 'HTML', css: 'CSS', markdown: 'Markdown', yaml: 'YAML', plaintext: 'Plain Text' };
  function runnable(path) { return /\.(m?js|ts|mts)$/.test(path); }

  /* ---------------- DOM ---------------- */

  var root, treeEl, tabsEl, editorEl, termEl, statusEl, posEl, langEl, noticeEl, titleEl, taskEl, checkBtn;
  var check = null;
  var lastFocus = null;
  var onChangeHook = null;

  var ICON = {
    files: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M14 2v6h6" fill="none" stroke="currentColor" stroke-width="1.6"/></svg>',
    run: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 4l13 8-13 8z" fill="currentColor"/></svg>',
    check: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 12.5l5 5L20 6.5" fill="none" stroke="currentColor" stroke-width="2.6"/></svg>',
    newFile: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M13 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V10z M12 11v6 M9 14h6" fill="none" stroke="currentColor" stroke-width="1.6"/></svg>',
    reset: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 12a8 8 0 1 0 3-6.3M4 4v5h5" fill="none" stroke="currentColor" stroke-width="1.8"/></svg>',
    download: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 4v11m0 0l-4-4m4 4l4-4M5 20h14" fill="none" stroke="currentColor" stroke-width="1.8"/></svg>',
    close: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" stroke="currentColor" stroke-width="2"/></svg>',
    folder: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 6a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" fill="currentColor"/></svg>',
    trash: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 7h14M10 7V4h4v3M7 7l1 13h8l1-13" fill="none" stroke="currentColor" stroke-width="1.6"/></svg>',
    rename: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20h4L19 9l-4-4L4 16z" fill="none" stroke="currentColor" stroke-width="1.6"/></svg>',
  };

  function build() {
    root = document.createElement('div');
    root.className = 'ide';
    root.setAttribute('role', 'dialog');
    root.setAttribute('aria-modal', 'true');
    root.setAttribute('aria-label', 'Code editor');
    root.hidden = true;
    root.innerHTML =
      '<div class="ide-titlebar">' +
      '  <span class="ide-title"></span>' +
      '  <div class="ide-title-actions">' +
      '    <button type="button" class="ide-check" data-act="check" title="Check your answer" hidden>' + ICON.check + '<span>Check</span></button>' +
      '    <button type="button" class="ide-run" data-act="run" title="Run the active file (Ctrl+Enter)">' + ICON.run + '<span>Run</span></button>' +
      '    <button type="button" class="ide-icon" data-act="close" title="Close the editor" aria-label="Close the editor">' + ICON.close + '</button>' +
      '  </div>' +
      '</div>' +
      '<div class="ide-main">' +
      '  <nav class="ide-activity" aria-label="Editor views">' +
      '    <button type="button" class="ide-activity-btn is-active" data-act="toggle-side" title="Explorer" aria-label="Show or hide the explorer">' + ICON.files + '</button>' +
      '    <button type="button" class="ide-activity-btn" data-act="run" title="Run (Ctrl+Enter)" aria-label="Run the active file">' + ICON.run + '</button>' +
      '  </nav>' +
      '  <aside class="ide-side" aria-label="Explorer">' +
      '    <div class="ide-side-head"><span>EXPLORER</span><span class="ide-side-actions">' +
      '      <button type="button" class="ide-icon" data-act="new" title="New file" aria-label="New file">' + ICON.newFile + '</button>' +
      '      <button type="button" class="ide-icon" data-act="download" title="Download the active file" aria-label="Download the active file">' + ICON.download + '</button>' +
      '    </span></div>' +
      '    <div class="ide-tree" role="tree"></div>' +
      '    <p class="ide-side-note">Your files are saved in this browser only. Clearing site data removes them.</p>' +
      '  </aside>' +
      '  <section class="ide-center">' +
      '    <div class="ide-tabs" role="tablist"></div>' +
      '    <div class="ide-task" hidden></div>' +
      '    <div class="ide-notice" hidden></div>' +
      '    <div class="ide-editor"></div>' +
      '    <div class="ide-panel">' +
      '      <div class="ide-panel-head"><span class="ide-panel-tab">TERMINAL</span><button type="button" class="ide-icon" data-act="clear" title="Clear the terminal" aria-label="Clear the terminal">' + ICON.trash + '</button></div>' +
      '      <div class="ide-term" role="log" aria-live="polite"></div>' +
      '    </div>' +
      '  </section>' +
      '</div>' +
      '<footer class="ide-status"><span class="ide-status-left"><span class="ide-status-item">⎇ main</span><span class="ide-status-item ide-status-msg"></span></span>' +
      '<span class="ide-status-right"><span class="ide-status-item ide-pos"></span><span class="ide-status-item">Spaces: 2</span><span class="ide-status-item">UTF-8</span><span class="ide-status-item ide-lang"></span></span></footer>';
    document.body.appendChild(root);
    if (window.innerWidth < 760) {
      root.classList.add('side-hidden');
      root.querySelector('[data-act="toggle-side"]').classList.remove('is-active');
    }
    treeEl = root.querySelector('.ide-tree');
    tabsEl = root.querySelector('.ide-tabs');
    editorEl = root.querySelector('.ide-editor');
    termEl = root.querySelector('.ide-term');
    statusEl = root.querySelector('.ide-status-msg');
    posEl = root.querySelector('.ide-pos');
    langEl = root.querySelector('.ide-lang');
    noticeEl = root.querySelector('.ide-notice');
    titleEl = root.querySelector('.ide-title');
    taskEl = root.querySelector('.ide-task');
    checkBtn = root.querySelector('.ide-check');
    titleEl.textContent = (document.querySelector('.lx-hero h1') || document.querySelector('h1') || { textContent: 'Workspace' }).textContent + ' — Zudo Editor';
    root.addEventListener('click', onClick);
    root.addEventListener('keydown', onKey);
    termLine('sys', 'Press Run or Ctrl+Enter to run the active file. Output appears here.');
  }

  function setStatus(msg) { if (statusEl) statusEl.textContent = msg; }

  /* ---------------- tree and tabs ---------------- */

  function renderTree() {
    var names = Object.keys(ws.projects).sort();
    if (!names.length) {
      treeEl.innerHTML = '<p class="ide-empty">No files yet. Press "Edit" on any example, or create a new file.</p>';
      return;
    }
    var html = '';
    names.forEach(function (project) {
      html += '<div class="ide-folder" role="treeitem" aria-expanded="true"><span class="ide-folder-name">' + ICON.folder + escapeHtml(project) + '</span></div>';
      Object.keys(ws.projects[project]).sort().forEach(function (path) {
        var fid = id(project, path);
        var f = ws.projects[project][path];
        var changed = f.origin !== undefined && f.origin !== f.content;
        html += '<div class="ide-file' + (fid === ws.active ? ' is-active' : '') + '" role="treeitem" data-file="' + escapeHtml(fid) + '" tabindex="0">' +
          '<span class="ide-file-icon ide-lang-' + language(path) + '"></span><span class="ide-file-name">' + escapeHtml(path) + '</span>' +
          (changed ? '<span class="ide-file-mod" title="Changed from the example">M</span>' : '') +
          '<span class="ide-file-actions">' +
          (f.origin !== undefined ? '<button type="button" class="ide-icon" data-act="reset" data-file="' + escapeHtml(fid) + '" title="Reset to the example" aria-label="Reset ' + escapeHtml(path) + ' to the example">' + ICON.reset + '</button>' : '') +
          '<button type="button" class="ide-icon" data-act="rename" data-file="' + escapeHtml(fid) + '" title="Rename" aria-label="Rename ' + escapeHtml(path) + '">' + ICON.rename + '</button>' +
          '<button type="button" class="ide-icon" data-act="delete" data-file="' + escapeHtml(fid) + '" title="Delete" aria-label="Delete ' + escapeHtml(path) + '">' + ICON.trash + '</button>' +
          '</span></div>';
      });
    });
    treeEl.innerHTML = html;
  }

  function renderTabs() {
    ws.tabs = ws.tabs.filter(fileOf);
    tabsEl.innerHTML = ws.tabs.map(function (fid) {
      var p = split(fid);
      var name = p.path.split('/').pop();
      return '<div class="ide-tab' + (fid === ws.active ? ' is-active' : '') + '" role="tab" aria-selected="' + (fid === ws.active) + '" data-file="' + escapeHtml(fid) + '" title="' + escapeHtml(fid) + '">' +
        '<span class="ide-file-icon ide-lang-' + language(p.path) + '"></span><span>' + escapeHtml(name) + '</span>' +
        '<button type="button" class="ide-tab-close" data-act="close-tab" data-file="' + escapeHtml(fid) + '" aria-label="Close ' + escapeHtml(name) + '">×</button></div>';
    }).join('');
  }

  /* ---------------- editor (Monaco, or a text area) ---------------- */

  var monaco = null;
  var editor = null;
  var models = {};
  var viewStates = {};
  var plain = null;
  var monacoPromise = null;

  function loadMonaco() {
    if (monacoPromise) return monacoPromise;
    monacoPromise = new Promise(function (resolve, reject) {
      window.MonacoEnvironment = {
        getWorkerUrl: function () {
          return 'data:text/javascript;charset=utf-8,' + encodeURIComponent(
            "self.MonacoEnvironment = { baseUrl: '" + MONACO + "/' };" +
            "importScripts('" + MONACO + "/vs/base/worker/workerMain.js');");
        },
      };
      var s = document.createElement('script');
      s.src = MONACO + '/vs/loader.js';
      s.async = true;
      s.onload = function () {
        window.require.config({ paths: { vs: MONACO + '/vs' } });
        window.require(['vs/editor/editor.main'], function () { resolve(window.monaco); }, reject);
      };
      s.onerror = reject;
      document.head.appendChild(s);
    });
    return monacoPromise;
  }

  function createEditor() {
    return loadMonaco().then(function (m) {
      monaco = m;
      /* Imports of @zudojs packages are not known here, so keep only syntax errors. */
      [m.languages.typescript.typescriptDefaults, m.languages.typescript.javascriptDefaults].forEach(function (d) {
        d.setDiagnosticsOptions({ noSemanticValidation: true, noSyntaxValidation: false });
        d.setCompilerOptions({ target: m.languages.typescript.ScriptTarget.ESNext, module: m.languages.typescript.ModuleKind.ESNext, allowNonTsExtensions: true, allowJs: true });
      });
      editor = m.editor.create(editorEl, {
        theme: 'vs-dark',
        automaticLayout: true,
        fontSize: 14,
        fontFamily: "'JetBrains Mono', 'Fira Code', Menlo, Consolas, monospace",
        tabSize: 2,
        minimap: { enabled: window.innerWidth > 900 },
        scrollBeyondLastLine: false,
        renderWhitespace: 'selection',
        wordWrap: 'off',
      });
      editor.onDidChangeCursorPosition(function (e) { posEl.textContent = 'Ln ' + e.position.lineNumber + ', Col ' + e.position.column; });
      editor.addCommand(m.KeyMod.CtrlCmd | m.KeyCode.Enter, runActive);
      editor.addCommand(m.KeyMod.CtrlCmd | m.KeyCode.KeyS, function () { save(true); });
    }).catch(function () {
      plain = document.createElement('textarea');
      plain.className = 'ide-plain';
      plain.spellcheck = false;
      plain.setAttribute('aria-label', 'Code');
      editorEl.appendChild(plain);
      plain.addEventListener('input', function () { onEdit(plain.value); });
      plain.addEventListener('keydown', function (e) {
        if (e.key === 'Tab' && !e.shiftKey) { e.preventDefault(); plain.setRangeText('  ', plain.selectionStart, plain.selectionEnd, 'end'); onEdit(plain.value); }
      });
      noticeEl.hidden = false;
      noticeEl.textContent = 'The full editor could not load (are you offline?). You can still edit, save and run your files here.';
    });
  }

  function onEdit(content) {
    var f = ws.active && fileOf(ws.active);
    if (!f) return;
    f.content = content;
    save();
    if (onChangeHook && onChangeHook.file === ws.active) onChangeHook.fn(content);
    var row = treeEl.querySelector('.ide-file[data-file="' + cssEscape(ws.active) + '"]');
    if (row && f.origin !== undefined && !row.querySelector('.ide-file-mod') && f.origin !== content) renderTree();
  }

  function cssEscape(s) { return window.CSS && CSS.escape ? CSS.escape(s) : s.replace(/"/g, '\\"'); }

  function modelFor(fid) {
    if (models[fid]) return models[fid];
    var p = split(fid);
    var uri = monaco.Uri.parse('file:///' + encodeURI(fid));
    var model = monaco.editor.getModel(uri) || monaco.editor.createModel(fileOf(fid).content, language(p.path), uri);
    model.onDidChangeContent(function () { if (ws.active === fid) onEdit(model.getValue()); });
    models[fid] = model;
    return model;
  }

  function activate(fid) {
    if (!fileOf(fid)) return;
    if (editor && ws.active && models[ws.active]) viewStates[ws.active] = editor.saveViewState();
    ws.active = fid;
    if (ws.tabs.indexOf(fid) === -1) ws.tabs.push(fid);
    var f = fileOf(fid);
    if (editor) {
      var model = modelFor(fid);
      if (model.getValue() !== f.content) model.setValue(f.content);
      editor.setModel(model);
      if (viewStates[fid]) editor.restoreViewState(viewStates[fid]);
      editor.focus();
    } else if (plain) {
      plain.value = f.content;
      plain.focus();
    }
    langEl.textContent = LANG_LABEL[language(split(fid).path)];
    renderTabs();
    renderTree();
    save(true);
  }

  function closeTab(fid) {
    ws.tabs = ws.tabs.filter(function (t) { return t !== fid; });
    if (ws.active === fid) {
      ws.active = ws.tabs[ws.tabs.length - 1] || null;
      if (ws.active) activate(ws.active);
      else {
        if (editor) editor.setModel(null);
        if (plain) plain.value = '';
        renderTabs();
        renderTree();
      }
    } else renderTabs();
    save(true);
  }

  function dropModel(fid) {
    if (models[fid]) { models[fid].dispose(); delete models[fid]; }
    delete viewStates[fid];
  }

  /* ---------------- files ---------------- */

  function validName(path) {
    return /^[\w.-]+(\/[\w.-]+)*$/.test(path) && !/(^|\/)\.\.?(\/|$)/.test(path);
  }

  function newFile() {
    var project = ws.active ? split(ws.active).project : 'scratch';
    var name = window.prompt('New file name (for example utils.js or src/app.ts). It goes in the folder "' + project + '".', 'scratch.js');
    if (!name) return;
    name = name.trim();
    if (!validName(name)) { window.alert('Use letters, digits, dots, dashes and / only.'); return; }
    ws.projects[project] = ws.projects[project] || {};
    if (ws.projects[project][name]) { activate(id(project, name)); return; }
    ws.projects[project][name] = { content: '' };
    activate(id(project, name));
  }

  function renameFile(fid) {
    var p = split(fid);
    var name = window.prompt('Rename ' + p.path + ' to:', p.path);
    if (!name || name === p.path) return;
    name = name.trim();
    if (!validName(name)) { window.alert('Use letters, digits, dots, dashes and / only.'); return; }
    if (ws.projects[p.project][name]) { window.alert('A file with that name already exists.'); return; }
    ws.projects[p.project][name] = ws.projects[p.project][p.path];
    delete ws.projects[p.project][p.path];
    var nid = id(p.project, name);
    dropModel(fid);
    ws.tabs = ws.tabs.map(function (t) { return t === fid ? nid : t; });
    if (ws.active === fid) ws.active = null;
    activate(nid);
  }

  function deleteFile(fid) {
    var p = split(fid);
    if (!window.confirm('Delete ' + p.path + ' from this browser? This cannot be undone.')) return;
    delete ws.projects[p.project][p.path];
    if (!Object.keys(ws.projects[p.project]).length) delete ws.projects[p.project];
    dropModel(fid);
    closeTab(fid);
    renderTree();
    save(true);
  }

  function resetFile(fid) {
    var f = fileOf(fid);
    if (!f || f.origin === undefined) return;
    if (f.content !== f.origin && !window.confirm('Replace your changes with the example code?')) return;
    f.content = f.origin;
    if (models[fid]) models[fid].setValue(f.origin);
    if (ws.active === fid && plain) plain.value = f.origin;
    renderTree();
    save(true);
  }

  function download() {
    if (!ws.active) return;
    var f = fileOf(ws.active);
    var a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([f.content], { type: 'text/plain' }));
    a.download = split(ws.active).path.split('/').pop();
    document.body.appendChild(a);
    a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 0);
  }

  /* Add files from the page. A file you have not changed follows the example;
     one you changed is kept, and the notice offers the example version. */
  function addFiles(files) {
    var kept = [];
    (files || []).forEach(function (f) {
      ws.projects[f.project] = ws.projects[f.project] || {};
      var cur = ws.projects[f.project][f.path];
      var origin = f.origin !== undefined ? f.origin : f.content;
      if (!cur) ws.projects[f.project][f.path] = { content: f.content, origin: origin };
      else if (cur.origin === undefined || cur.content === cur.origin) {
        cur.content = f.content;
        cur.origin = origin;
        if (models[id(f.project, f.path)]) models[id(f.project, f.path)].setValue(f.content);
      } else if (cur.origin !== origin) {
        cur.origin = origin;
        kept.push(id(f.project, f.path));
      }
    });
    if (kept.length) {
      noticeEl.hidden = false;
      noticeEl.innerHTML = 'You changed <strong>' + escapeHtml(kept.join(', ')) + '</strong> before, so your version is open. ' +
        '<button type="button" class="ide-link" data-act="reset" data-file="' + escapeHtml(kept[0]) + '">' + (check ? 'Start again from the starter code' : 'Use the example code instead') + '</button>';
    } else if (!plain) {
      noticeEl.hidden = true;
    }
    save(true);
  }

  /* ---------------- terminal ---------------- */

  function termLine(kind, text, sig) {
    var div = document.createElement('div');
    div.className = 'ide-line pg-line-' + kind;
    div.innerHTML = '<span class="ide-sig">' + escapeHtml(sig || '') + '</span><span></span>';
    div.lastChild.textContent = text;
    termEl.appendChild(div);
    termEl.scrollTop = termEl.scrollHeight;
  }

  var running = false;
  function runActive() {
    if (running || !ws.active) return;
    var p = split(ws.active);
    if (!runnable(p.path)) { termLine('warn', p.path + ' is not a JavaScript or TypeScript file, so it cannot run.', '▲'); return; }
    var pg = window.ZudoPlayground;
    if (!pg || !pg.exec) { termLine('error', 'The terminal is still loading. Try again in a moment.', '✗'); return; }
    save(true);
    running = true;
    root.classList.add('is-running');
    termEl.innerHTML = '';
    var files = {};
    Object.keys(ws.projects[p.project]).forEach(function (path) { files[path] = ws.projects[p.project][path].content; });
    pg.registerFiles(files);
    var off = pg.onLine(function (ev) {
      if (ev.kind === 'clear') return;
      termLine(ev.kind, ev.text, ev.sig);
    });
    pg.exec(files[p.path], p.path, { show: false }).catch(function (e) {
      termLine('error', String(e && e.message || e), '✗');
    }).then(function () {
      off();
      running = false;
      root.classList.remove('is-running');
    });
  }

  /* ---------------- exercise check ---------------- */

  function renderTask() {
    checkBtn.hidden = !check;
    taskEl.hidden = !check;
    if (!check) { taskEl.innerHTML = ''; return; }
    var how = check.mode === 'paste'
      ? 'This one runs on your computer. Run <code>' + escapeHtml(check.command || '') + '</code> there, then press <strong>Check</strong> and paste what it printed.'
      : 'Write your answer in <code>' + escapeHtml(check.file) + '</code>, then press <strong>Check</strong>. It runs your code and compares what it prints with the expected output.';
    taskEl.innerHTML =
      '<div class="ide-task-head"><span class="ide-task-label">EXERCISE</span> <span class="ide-task-title"></span>' +
      '<button type="button" class="ide-link ide-task-toggle" data-act="toggle-task">Hide the task</button></div>' +
      '<div class="ide-task-body"><div class="ide-task-text">' + (check.task || '') + '</div>' +
      '<p class="ide-task-how">' + how + '</p></div>' +
      '<div class="ide-task-result" role="status" aria-live="polite"></div>' +
      '<div class="ide-task-hints"></div>' +
      (check.mode === 'paste'
        ? '<div class="ide-paste" hidden><textarea class="ide-paste-box" rows="5" spellcheck="false" aria-label="What your terminal printed" placeholder="Paste the output here"></textarea>' +
          '<button type="button" class="ide-check ide-paste-go" data-act="compare">' + ICON.check + '<span>Compare</span></button></div>'
        : '');
    taskEl.querySelector('.ide-task-title').textContent = check.title;
    renderHints();
  }

  /* Hints opened so far, a button for the next one, and whether the solution is ready. */
  function renderHints() {
    var box = taskEl.querySelector('.ide-task-hints');
    if (!box || !check || !check.hints) return;
    var h = check.hints();
    var html = h.shown.map(function (hint, i) {
      return '<div class="ide-hint"><span class="ide-task-label">HINT ' + (i + 1) + '</span>' + hint + '</div>';
    }).join('');
    if (h.canMore) {
      html += '<button type="button" class="ide-hint-btn" data-act="hint">' + (h.shown.length ? 'Show another hint' : 'Show a hint') +
        (h.left > 1 ? ' (' + h.left + ' left)' : '') + '</button>';
    }
    if (h.solutionReady && !h.solved) html += '<p class="ide-task-how">The solution is now open on the lesson page. Close the editor to compare, or keep trying.</p>';
    box.innerHTML = html;
  }

  var TOOL_FAILURE = /^(?:Error: )?(?:Babel did not initialise|Could not load the TypeScript compiler)/;

  function showResult(r, output) {
    var box = taskEl.querySelector('.ide-task-result');
    if (!r.ok && output && TOOL_FAILURE.test(output)) {
      box.className = 'ide-task-result is-fail';
      box.textContent = 'The terminal could not start (' + output + '). Check your connection and press Check again. This did not count as a try.';
      if (check.onResult) check.onResult(false, output);
      return;
    }
    box.className = 'ide-task-result ' + (r.ok ? 'is-pass' : 'is-fail');
    if (r.ok) {
      box.textContent = '✓ Correct. Your output matches. The solution is open on the lesson page, so you can compare.';
      termLine('ok', 'Correct: the output matches.', '✓');
    } else {
      box.textContent = '✗ Not yet. ' + (r.line ? 'Line ' + r.line + ' is different.' : 'The output is different.') + ' Details are in the terminal.';
      termLine('error', 'Not yet: ' + (r.line ? 'line ' + r.line + ' is different.' : 'the output is different.'), '✗');
      if (r.line) {
        termLine('sys', 'expected: ' + (r.want === undefined ? '(no more lines)' : r.want));
        termLine('sys', 'yours:    ' + (r.got === undefined ? '(no more lines)' : r.got));
      }
    }
    if (check.onResult) check.onResult(r.ok, output);
    renderHints();
  }

  function projectFilesOf(project) {
    var files = {};
    Object.keys(ws.projects[project] || {}).forEach(function (path) { files[path] = ws.projects[project][path].content; });
    return files;
  }

  function runCheck() {
    if (!check || running) return;
    save(true);
    if (check.mode === 'paste') {
      var paste = taskEl.querySelector('.ide-paste');
      paste.hidden = false;
      paste.querySelector('textarea').focus();
      return;
    }
    var pg = window.ZudoPlayground;
    if (!pg || !pg.onLine) { termLine('error', 'The terminal is still loading. Try again in a moment.', '✗'); return; }
    running = true;
    root.classList.add('is-running');
    termEl.innerHTML = '';
    termLine('sys', 'Checking ' + check.file + '…');
    var off = pg.onLine(function (ev) { if (ev.kind !== 'clear') termLine(ev.kind, ev.text, ev.sig); });
    var output = '';
    check.run(projectFilesOf(check.project)).then(function (lines) {
      output = (lines || []).filter(function (l) { return l.kind !== 'stack'; }).map(function (l) { return l.text; }).join('\n');
      return check.verify(output);
    }, function (e) {
      output = String(e && e.message || e);
      termLine('error', output, '✗');
      return check.verify(output);
    }).then(function (r) {
      off();
      running = false;
      root.classList.remove('is-running');
      showResult(r, output);
    });
  }

  function comparePaste() {
    var text = taskEl.querySelector('.ide-paste-box').value;
    termEl.innerHTML = '';
    termLine('sys', 'Comparing what you pasted with the expected output…');
    showResult(check.verify(text), '');
  }

  /* ---------------- open / close ---------------- */

  var ready = null;
  function open(opts) {
    opts = opts || {};
    if (!root) build();
    lastFocus = document.activeElement;
    check = opts.check || null;
    addFiles(opts.files);
    onChangeHook = opts.onChange && opts.focus ? { file: id(opts.focus.project, opts.focus.path), fn: opts.onChange } : null;
    renderTask();
    root.hidden = false;
    document.body.classList.add('ide-open');
    renderTree();
    renderTabs();
    if (!ready) ready = createEditor();
    ready.then(function () {
      var target = opts.focus ? id(opts.focus.project, opts.focus.path) : ws.active || ws.tabs[0];
      if (!target || !fileOf(target)) {
        var first = Object.keys(ws.projects)[0];
        target = first ? id(first, Object.keys(ws.projects[first])[0]) : null;
      }
      if (target) activate(target);
      else root.querySelector('[data-act="new"]').focus();
      if (editor) editor.layout();
    });
  }

  function close() {
    if (!root || root.hidden) return;
    if (editor && ws.active && models[ws.active]) viewStates[ws.active] = editor.saveViewState();
    save(true);
    root.hidden = true;
    document.body.classList.remove('ide-open');
    onChangeHook = null;
    if (lastFocus && lastFocus.focus) lastFocus.focus();
  }

  function onClick(e) {
    var btn = e.target.closest('[data-act]');
    if (btn && root.contains(btn)) {
      var act = btn.getAttribute('data-act');
      var fid = btn.getAttribute('data-file');
      e.stopPropagation();
      if (act === 'close') close();
      else if (act === 'run') runActive();
      else if (act === 'check') runCheck();
      else if (act === 'hint') { if (check && check.showHint) { check.showHint(); renderHints(); } }
      else if (act === 'toggle-task') {
        var body = taskEl.querySelector('.ide-task-body');
        body.hidden = !body.hidden;
        btn.textContent = body.hidden ? 'Show the task' : 'Hide the task';
      }
      else if (act === 'compare') comparePaste();
      else if (act === 'new') newFile();
      else if (act === 'download') download();
      else if (act === 'clear') termEl.innerHTML = '';
      else if (act === 'toggle-side') { root.classList.toggle('side-hidden'); btn.classList.toggle('is-active'); if (editor) editor.layout(); }
      else if (act === 'close-tab') closeTab(fid);
      else if (act === 'reset') { resetFile(fid); noticeEl.hidden = true; }
      else if (act === 'rename') renameFile(fid);
      else if (act === 'delete') deleteFile(fid);
      return;
    }
    var item = e.target.closest('.ide-file, .ide-tab');
    if (item) {
      activate(item.getAttribute('data-file'));
      if (window.innerWidth < 760 && item.classList.contains('ide-file')) root.classList.add('side-hidden');
    }
  }

  function onKey(e) {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); runActive(); }
    else if (e.key === 'Escape' && !(e.target.closest && e.target.closest('.monaco-editor'))) close();
    else if (e.key === 'Enter' && e.target.classList && e.target.classList.contains('ide-file')) activate(e.target.getAttribute('data-file'));
  }

  window.ZudoIDE = { open: open, close: close };
  document.dispatchEvent(new CustomEvent('zudo:ide-ready'));
})();
