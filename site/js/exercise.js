/**
 * "Try it yourself" exercises on Learn pages (built by scripts/learn/exercise.mjs).
 *
 * "Try it in the editor" opens the editor (js/ide.js) with the exercise's
 * starter code, plus the files of the lesson project it builds on. The
 * editor's Check button runs the learner's code (or compares terminal output
 * they paste, for Node.js-only exercises) with the solution's real output.
 *
 * Hints open one at a time, each after a failed check. The solution opens
 * after a pass, or after SOLUTION_AFTER failed checks. Exercises with nothing
 * to check (a written answer, or code without output) unlock without a check.
 * Progress is kept in this browser only.
 *
 * Public API (used by scripts/site-learn.mjs --browser):
 *   ZudoExercise.check(n) → Promise<{ starter: result, solution: result }>
 */
(function () {
  'use strict';

  var KEY = 'zudo.learn.exercises';
  var SOLUTION_AFTER = 3;

  function readAll() {
    try { return JSON.parse(localStorage.getItem(KEY) || '{}') || {}; } catch (e) { return {}; }
  }

  function writeState(key, st) {
    try {
      var all = readAll();
      all[key] = st;
      localStorage.setItem(KEY, JSON.stringify(all));
    } catch (e) {}
  }

  /* ---------------- comparing output (same rules as the checker) ---------------- */

  var MASKS = {
    ms: [/\b\d+(?:\.\d+)?\s?ms\b/g, '<ms>'],
    s: [/\b\d+(?:\.\d+)?s\b/g, '<s>'],
    iso: [/\b\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})?/g, '<iso>'],
    time: [/\b\d{1,2}:\d{2}:\d{2}(?:\.\d+)?(?:\s?[AP]M)?/g, '<time>'],
    epoch: [/\b1\d{9}(?:\d{3})?\b/g, '<epoch>'],
    uuid: [/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi, '<uuid>'],
    hex: [/\b[0-9a-f]{16,}\b/gi, '<hex>'],
    b64: [/[A-Za-z0-9_\-+/]{20,}={0,2}/g, '<b64>'],
    jwt: [/\beyJ[\w-]+\.[\w-]+\.[\w-]+/g, '<jwt>'],
    port: [/:\d{4,5}\b/g, ':<port>'],
    pid: [/\bpid[:= ]\s*\d+/gi, 'pid <pid>'],
    num: [/\b\d+(?:\.\d+)?\b/g, '<n>'],
  };

  function applyMasks(text, mask) {
    if (!mask) return text;
    mask.split(',').forEach(function (name) {
      var m = MASKS[name.trim()];
      if (m) text = text.replace(m[0], m[1]);
    });
    return text;
  }

  /* No ANSI colours or \r, no trailing spaces, no blank lines at either end, common indentation removed. */
  function normalize(text) {
    var lines = String(text).replace(/\u001b\[[0-9;]*m/g, '').replace(/\r/g, '').split('\n')
      .map(function (l) { return l.replace(/\s+$/, ''); })
      .join('\n').replace(/\n+$/, '').replace(/^\n+/, '').split('\n');
    var cut = Infinity;
    lines.forEach(function (l) { if (l.trim()) cut = Math.min(cut, l.match(/^ */)[0].length); });
    if (!isFinite(cut)) cut = 0;
    return lines.map(function (l) { return l.slice(cut); }).join('\n');
  }

  function compare(text, expected, mask, command) {
    var got = normalize(text);
    /* A pasted terminal often starts with the command itself. */
    if (command) got = got.replace(/^[$>%#]\s*(?:node|npx|tsx|pnpm|npm)\b[^\n]*\n?/, '');
    got = applyMasks(normalize(got), mask);
    var want = applyMasks(normalize(expected), mask);
    if (got === want) return { ok: true };
    var g = got.split('\n');
    var w = want.split('\n');
    for (var i = 0; i < Math.max(g.length, w.length); i++) {
      if (g[i] !== w[i]) return { ok: false, line: i + 1, want: w[i], got: g[i] };
    }
    return { ok: false };
  }

  /* ---------------- one exercise ---------------- */

  function Exercise(card, slug) {
    this.card = card;
    this.n = Number(card.getAttribute('data-exercise'));
    this.key = slug + '#' + this.n;
    this.slug = slug;
    this.mode = card.getAttribute('data-mode');
    this.file = card.getAttribute('data-file');
    this.project = card.getAttribute('data-project');
    this.command = card.getAttribute('data-command');
    this.hints = card.querySelectorAll('.lx-ex-hint');
    this.solution = card.querySelector('.lx-ex-solution');
    this.status = card.querySelector('.lx-ex-status');
    this.moreBtn = card.querySelector('.lx-ex-more');
    this.revealBtn = card.querySelector('.lx-ex-reveal');
    this.state = readAll()[this.key] || { tries: 0, solved: false, hints: 0, solution: false, opened: false };
    this.paint();
  }

  Exercise.prototype.save = function () {
    writeState(this.key, this.state);
    this.paint();
  };

  Exercise.prototype.checked = function () { return this.mode === 'run' || this.mode === 'paste'; };

  /* How many hints, and whether the solution, may be opened now. */
  Exercise.prototype.allowed = function () {
    var st = this.state;
    var total = this.hints.length;
    if (!this.checked()) {
      var ready = this.mode === 'think' || st.opened;
      return { hints: ready ? total : 0, solution: ready && st.hints >= total };
    }
    if (st.solved) return { hints: total, solution: true };
    return { hints: Math.min(st.tries, total), solution: st.tries >= SOLUTION_AFTER };
  };

  Exercise.prototype.paint = function () {
    var st = this.state;
    var can = this.allowed();
    for (var i = 0; i < this.hints.length; i++) this.hints[i].hidden = i >= st.hints;
    if (this.solution) this.solution.hidden = !st.solution;
    var left = this.hints.length - st.hints;
    if (this.moreBtn) {
      this.moreBtn.hidden = left <= 0;
      this.moreBtn.disabled = st.hints >= can.hints;
      this.moreBtn.textContent = (st.hints ? 'Show another hint' : 'Show a hint') + (left > 1 ? ' (' + left + ' left)' : '');
      this.moreBtn.title = this.moreBtn.disabled
        ? (this.checked() ? 'Check your code in the editor first. Each check that does not pass opens one hint.' : 'Open the editor and try it first.')
        : '';
    }
    if (this.revealBtn) {
      this.revealBtn.hidden = st.solution;
      this.revealBtn.disabled = !can.solution;
      this.revealBtn.title = this.revealBtn.disabled
        ? (this.checked()
          ? 'Opens when your code passes, or after ' + SOLUTION_AFTER + ' checks.'
          : this.hints.length ? 'Look at the hints first.' : 'Open the editor and try it first.')
        : '';
    }
    this.card.classList.toggle('is-solved', !!st.solved);
    var msg = '';
    if (st.solved) msg = '✓ Solved' + (st.tries ? ' after ' + (st.tries + 1) + ' checks' : ' on the first check') + '.';
    else if (st.tries) {
      msg = st.tries + (st.tries === 1 ? ' check' : ' checks') + ', not solved yet.';
      if (!can.solution) msg += ' The solution opens after ' + (SOLUTION_AFTER - st.tries) + ' more.';
    }
    this.status.textContent = msg;
  };

  Exercise.prototype.showHint = function () {
    if (this.state.hints >= this.allowed().hints) return;
    this.state.hints++;
    this.save();
    var shown = this.hints[this.state.hints - 1];
    if (shown) shown.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  };

  Exercise.prototype.showSolution = function () {
    if (!this.allowed().solution) return;
    this.state.solution = true;
    this.save();
  };

  function source(fig) { return window.ZudoLearn.source(fig); }

  /* What the editor shows under the task: the hints opened so far, and what can open next. */
  Exercise.prototype.hintState = function () {
    var shown = [];
    for (var i = 0; i < this.state.hints; i++) {
      var copy = this.hints[i].cloneNode(true);
      var label = copy.querySelector('.lx-ex-hint-label');
      if (label) label.remove();
      shown.push(copy.innerHTML);
    }
    var can = this.allowed();
    return {
      shown: shown,
      canMore: this.state.hints < can.hints,
      left: this.hints.length - this.state.hints,
      solutionReady: can.solution,
      solved: !!this.state.solved,
    };
  };

  /* The solution figure the exercise is checked against. */
  Exercise.prototype.target = function () {
    if (!this.solution) return null;
    return this.solution.querySelectorAll('.lx-example')[Number(this.card.getAttribute('data-target'))] || null;
  };

  Exercise.prototype.starters = function () {
    var out = {};
    var self = this;
    this.card.querySelectorAll('.lx-ex-starter').forEach(function (s) {
      out[s.getAttribute('data-file') || self.file] = s.textContent.replace(/<\\\/(script)/gi, '</$1');
    });
    return out;
  };

  /* The files the editor gets: the lesson project up to here, then the starters (or, with
     useSolution, the solution's own code). */
  Exercise.prototype.files = function (useSolution) {
    var files = {};
    var card = this.card;
    var sol = this.solution;
    var starters = this.starters();
    var figs = this.project
      ? document.querySelectorAll('.lx-example[data-project="' + this.project + '"]')
      : (sol ? sol.querySelectorAll('.lx-example') : []);
    for (var i = 0; i < figs.length; i++) {
      var fig = figs[i];
      var inside = card.contains(fig);
      if (!inside && (card.compareDocumentPosition(fig) & Node.DOCUMENT_POSITION_FOLLOWING)) break;
      var name = fig.getAttribute('data-file');
      if (inside && !useSolution && Object.prototype.hasOwnProperty.call(starters, name)) continue;
      files[name] = source(fig);
    }
    if (!useSolution) Object.keys(starters).forEach(function (name) { files[name] = starters[name]; });
    if (this.file && !Object.prototype.hasOwnProperty.call(files, this.file)) files[this.file] = '// Write your code here\n';
    return files;
  };

  Exercise.prototype.expected = function () {
    var t = this.target();
    var out = t && t.querySelector('.lx-out');
    return { text: out ? out.querySelector('pre').textContent : '', mask: out ? out.getAttribute('data-mask') : null };
  };

  Exercise.prototype.frameBox = function () {
    var box = this.card.querySelector('.lx-ex-frame');
    if (!box) {
      box = document.createElement('div');
      box.className = 'lx-ex-frame';
      box.setAttribute('aria-hidden', 'true');
      this.card.appendChild(box);
    }
    return box;
  };

  Exercise.prototype.run = function (files) {
    return window.ZudoLearn.runFiles(files, this.file, {
      dom: this.card.getAttribute('data-runtime') === 'dom',
      box: this.frameBox(),
    });
  };

  Exercise.prototype.verify = function (text) {
    var exp = this.expected();
    return compare(text, exp.text, exp.mask, this.mode === 'paste' ? this.command : null);
  };

  /* A run that failed because the terminal itself could not start is not the learner's miss. */
  var TOOL_FAILURE = /^(?:Error: )?(?:Babel did not initialise|Could not load the TypeScript compiler|The terminal is still loading)/;

  Exercise.prototype.onResult = function (ok, output) {
    if (this.state.solved) return;
    if (!ok && output && TOOL_FAILURE.test(output)) return;
    if (ok) {
      this.state.solved = true;
      this.state.solution = true;
    } else {
      this.state.tries++;
    }
    this.save();
  };

  Exercise.prototype.openEditor = function () {
    if (!window.ZudoIDE) return;
    var self = this;
    var project = this.slug + '-exercise-' + this.n;
    var files = this.files(false);
    var list = Object.keys(files).map(function (path) { return { project: project, path: path, content: files[path] }; });
    var title = this.card.getAttribute('data-title') || this.card.querySelector('h3').textContent;
    var task = this.card.querySelector('.lx-ex-task');
    this.state.opened = true;
    this.save();
    window.ZudoIDE.open({
      files: list,
      focus: { project: project, path: this.file || list[0].path },
      check: this.checked()
        ? {
          title: title,
          task: task ? task.innerHTML : '',
          mode: this.mode,
          project: project,
          file: this.file,
          command: this.command,
          run: function (f) { return self.run(f); },
          verify: function (text) { return self.verify(text); },
          onResult: function (ok, output) { self.onResult(ok, output); },
          hints: function () { return self.hintState(); },
          showHint: function () { self.showHint(); return self.hintState(); },
        }
        : null,
    });
  };

  /* The checker: the starter must not pass already, the solution must. */
  Exercise.prototype.selfCheck = function () {
    var self = this;
    var text = function (lines) {
      return lines.filter(function (l) { return l.kind !== 'stack'; }).map(function (l) { return l.text; }).join('\n');
    };
    var outcome = function (files) {
      return self.run(files).then(function (lines) {
        var t = text(lines);
        return Object.assign({ output: t }, self.verify(t));
      }, function (e) { return { ok: false, output: String(e && e.message || e) }; });
    };
    return outcome(this.files(false)).then(function (starter) {
      return outcome(self.files(true)).then(function (solution) { return { starter: starter, solution: solution }; });
    });
  };

  /* ---------------- page ---------------- */

  var list = [];

  function init() {
    var main = document.querySelector('.lx-main[data-lesson]');
    if (!main) return;
    var slug = main.getAttribute('data-lesson');
    document.querySelectorAll('.lx-exercise[data-exercise]').forEach(function (card) {
      list.push(new Exercise(card, slug));
    });
    document.addEventListener('click', function (e) {
      var card = e.target.closest && e.target.closest('.lx-exercise[data-exercise]');
      if (!card) return;
      var ex = list[Number(card.getAttribute('data-exercise')) - 1];
      if (!ex) return;
      if (e.target.closest('.lx-ex-try')) ex.openEditor();
      else if (e.target.closest('.lx-ex-more')) ex.showHint();
      else if (e.target.closest('.lx-ex-reveal')) ex.showSolution();
    });
    window.ZudoExercise = {
      check: function (n) { return list[n - 1].selfCheck(); },
      count: function () { return list.length; },
    };
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
