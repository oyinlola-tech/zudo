/**
 * "Test yourself" at the end of every lesson (frontend only).
 *
 * Each lesson has a bank of 30 to 50 questions (site/learn/quiz/<slug>.json,
 * built from site-src/learn/quiz by scripts/site-learn.mjs). A test shows 5 of
 * them at random. Pass with 4 or more; otherwise try again with 5 others.
 * Code questions run in the browser terminal (js/playground.js), exactly like
 * the lesson examples. Progress is kept in localStorage.
 *
 * A course page has a "Course checkpoint" (.lx-exam): the same test, drawn
 * from the banks of every lesson in the course, with data-size questions
 * and a pass mark of 80%. Its result is stored under "exam:<course id>".
 */
(function () {
  'use strict';

  var STORE = 'zudo.learn.tests';

  function readAll() {
    try { return JSON.parse(localStorage.getItem(STORE) || '{}') || {}; } catch (e) { return {}; }
  }
  function writeAll(all) {
    try { localStorage.setItem(STORE, JSON.stringify(all)); } catch (e) {}
  }
  function stateFor(slug) {
    var all = readAll();
    return all[slug] || { passed: false, best: 0, attempts: 0, seen: [] };
  }
  function saveState(slug, st) {
    var all = readAll();
    all[slug] = st;
    writeAll(all);
  }

  function escapeHtml(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  /* Same rules as the checker: no \r, no trailing spaces, no blank lines at either end. */
  function normalize(text) {
    return String(text).replace(/\r/g, '').split('\n').map(function (l) { return l.replace(/\s+$/, ''); })
      .join('\n').replace(/\n+$/, '').replace(/^\n+/, '');
  }

  function shuffle(list) {
    var a = list.slice();
    for (var i = a.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  }

  /* Five questions the learner has not seen lately; when the bank runs low, start over. */
  function pick(bank, st, size) {
    var seen = st.seen || [];
    var fresh = bank.filter(function (q) { return seen.indexOf(q.id) === -1; });
    if (fresh.length < size) { seen = []; fresh = bank.slice(); st.seen = []; }
    var chosen = shuffle(fresh).slice(0, size);
    st.seen = seen.concat(chosen.map(function (q) { return q.id; }));
    return chosen;
  }

  function playground() {
    return new Promise(function (resolve) {
      if (window.ZudoPlayground && window.ZudoPlayground.exec) resolve(window.ZudoPlayground);
      else document.addEventListener('zudo:playground-ready', function () { resolve(window.ZudoPlayground); }, { once: true });
    });
  }

  function highlight(code) {
    return window.ZudoPlayground && window.ZudoPlayground.highlight ? window.ZudoPlayground.highlight(code) : escapeHtml(code);
  }

  function runCode(code, file) {
    return playground().then(function (pg) {
      pg.registerFiles({});
      return pg.exec(code, file, { show: false });
    }).then(function (lines) {
      return lines.filter(function (l) { return l.kind !== 'stack'; }).map(function (l) { return l.text; }).join('\n');
    });
  }

  var TYPE_LABEL = { choice: 'Choose one answer', output: 'What does this code print?', code: 'Write code, then run it' };

  var EXAM_PASS_RATIO = 0.8;

  function Test(root) {
    this.root = root;
    this.exam = root.getAttribute('data-exam');
    this.slug = this.exam ? 'exam:' + root.getAttribute('data-course') : root.getAttribute('data-lesson');
    this.url = root.getAttribute('data-quiz');
    this.size = Number(root.getAttribute('data-size')) || 5;
    this.body = root.querySelector('.lx-quiz-body');
    this.data = null;
    this.current = [];
    this.paintIntro();
    var self = this;
    root.addEventListener('click', function (e) { self.onClick(e); });
    root.addEventListener('keydown', function (e) {
      if (e.target.matches && e.target.matches('.lx-q-editor') && e.key === 'Tab' && !e.shiftKey) {
        e.preventDefault();
        var ta = e.target, s = ta.selectionStart;
        ta.setRangeText('  ', s, ta.selectionEnd, 'end');
      }
    });
  }

  Test.prototype.paintIntro = function () {
    var st = stateFor(this.slug);
    var of = ' of ' + this.size;
    var status = st.passed
      ? '<p class="lx-quiz-status is-passed">✓ Passed. Best score ' + st.best + of + ', after ' + st.attempts + ' attempt' + (st.attempts === 1 ? '' : 's') + '.</p>'
      : st.attempts
        ? '<p class="lx-quiz-status">Not passed yet. Best score ' + st.best + of + ', ' + st.attempts + ' attempt' + (st.attempts === 1 ? '' : 's') + '.</p>'
        : '';
    var what = this.exam ? 'checkpoint' : 'test';
    this.body.innerHTML = status +
      '<button type="button" class="lx-quiz-btn" data-act="start">' + (st.attempts ? 'Take a new ' + what : 'Start the ' + what) + '</button>';
  };

  Test.prototype.load = function () {
    var self = this;
    if (this.data) return Promise.resolve(this.data);
    var get = function (url) {
      return fetch(url).then(function (r) {
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return r.json();
      });
    };
    if (!this.exam) return get(this.url).then(function (d) { self.data = d; return d; });
    var urls = this.exam.split(' ');
    return Promise.all(urls.map(get)).then(function (banks) {
      var questions = [];
      banks.forEach(function (b, i) {
        var lesson = urls[i].replace(/^.*\/|\.json$/g, '');
        b.questions.forEach(function (q) { questions.push(Object.assign({}, q, { id: lesson + '/' + q.id })); });
      });
      var size = Math.min(self.size, questions.length);
      self.data = { questions: questions, size: size, pass: Math.round(size * EXAM_PASS_RATIO) };
      return self.data;
    });
  };

  Test.prototype.start = function () {
    var self = this;
    this.body.innerHTML = '<p class="lx-quiz-status">Loading the questions…</p>';
    this.load().then(function (data) {
      var st = stateFor(self.slug);
      self.current = pick(data.questions, st, data.size);
      saveState(self.slug, st);
      self.paintQuestions();
    }).catch(function () {
      self.body.innerHTML = '<p class="lx-quiz-status is-failed">Could not load the questions. Check your connection and try again.</p>' +
        '<button type="button" class="lx-quiz-btn" data-act="start">Try again</button>';
    });
  };

  Test.prototype.paintQuestions = function () {
    var html = '<ol class="lx-q-list">';
    this.current.forEach(function (q, i) {
      html += '<li class="lx-q" data-i="' + i + '" data-type="' + q.type + '">' +
        '<p class="lx-q-kind">Question ' + (i + 1) + ' of ' + this.current.length + ' · ' + TYPE_LABEL[q.type] + '</p>' +
        '<div class="lx-q-text">' + q.q + '</div>';
      if (q.code) {
        html += '<div class="lx-q-code"><div class="lx-q-file">' + escapeHtml(q.file) + '</div><pre><code>' + highlight(q.code) + '</code></pre></div>';
      }
      if (q.options) {
        html += '<div class="lx-q-options" role="radiogroup">';
        q.options.forEach(function (opt, k) {
          var content = q.type === 'output' ? '<pre class="lx-q-out">' + opt + '</pre>' : '<span>' + opt + '</span>';
          html += '<label class="lx-q-option"><input type="radio" name="q-' + i + '" value="' + k + '">' + content + '</label>';
        });
        html += '</div>';
      }
      if (q.type === 'code') {
        html += '<div class="lx-q-code"><div class="lx-q-file">' + escapeHtml(q.file) + '</div>' +
          '<textarea class="lx-q-editor" spellcheck="false" autocapitalize="off" autocomplete="off" rows="' +
          Math.min(18, Math.max(6, q.starter.split('\n').length + 2)) + '" aria-label="Your code for question ' + (i + 1) + '">' +
          escapeHtml(q.starter) + '</textarea></div>' +
          '<div class="lx-q-actions"><button type="button" class="lx-quiz-btn is-small" data-act="run" data-i="' + i + '">▶ Run</button>' +
          '<button type="button" class="lx-quiz-link" data-act="reset" data-i="' + i + '">Reset</button>' +
          (window.ZudoIDE ? '<button type="button" class="lx-quiz-link" data-act="ide" data-i="' + i + '">Open in the editor</button>' : '') +
          '</div><div class="lx-q-run" hidden></div>';
      }
      html += '<div class="lx-q-feedback" hidden></div></li>';
    }, this);
    html += '</ol><div class="lx-quiz-foot"><button type="button" class="lx-quiz-btn" data-act="submit">Check my answers</button>' +
      '<span class="lx-quiz-note">You need ' + this.data.pass + ' of ' + this.current.length + ' to pass.</span></div>';
    this.body.innerHTML = html;
    var first = this.body.querySelector('.lx-q');
    if (first) first.scrollIntoView({ block: 'nearest' });
  };

  Test.prototype.card = function (i) { return this.body.querySelector('.lx-q[data-i="' + i + '"]'); };

  Test.prototype.runCard = function (i) {
    var q = this.current[i];
    var card = this.card(i);
    var src = card.querySelector('.lx-q-editor').value;
    var out = card.querySelector('.lx-q-run');
    out.hidden = false;
    out.innerHTML = '<div class="lx-q-run-label">Running <code>' + escapeHtml(q.file) + '</code>…</div>';
    return runCode(src, q.file).then(function (text) {
      out.innerHTML = '<div class="lx-q-run-label">Your code printed</div><pre>' + (escapeHtml(text) || '<em>(nothing)</em>') + '</pre>';
      return text;
    });
  };

  Test.prototype.submit = function () {
    var self = this;
    var btn = this.body.querySelector('[data-act="submit"]');
    btn.disabled = true;
    btn.textContent = 'Checking…';
    var score = 0;
    var chain = Promise.resolve();
    this.current.forEach(function (q, i) {
      chain = chain.then(function () {
        var card = self.card(i);
        if (q.type === 'code') {
          return self.runCard(i).then(function (text) {
            var ok = normalize(text) === normalize(q.expected);
            if (ok) score++;
            self.feedback(card, q, ok);
          });
        }
        var picked = card.querySelector('input:checked');
        var ok = !!picked && Number(picked.value) === q.answer;
        if (ok) score++;
        self.feedback(card, q, ok, picked ? Number(picked.value) : -1);
      });
    });
    chain.then(function () { self.finish(score); });
  };

  Test.prototype.feedback = function (card, q, ok, picked) {
    card.classList.add(ok ? 'is-right' : 'is-wrong');
    card.querySelectorAll('input, textarea, [data-act="run"], [data-act="reset"]').forEach(function (el) { el.disabled = true; });
    if (q.options) {
      card.querySelectorAll('.lx-q-option').forEach(function (label, k) {
        if (k === q.answer) label.classList.add('is-answer');
        else if (k === picked) label.classList.add('is-picked-wrong');
      });
    }
    var fb = card.querySelector('.lx-q-feedback');
    var html = '<p class="lx-q-verdict">' + (ok ? '✓ Correct' : (picked === -1 ? '✗ Not answered' : '✗ Not quite')) + '</p>';
    if (q.type === 'code' && !ok) {
      html += '<div class="lx-q-run-label">A correct answer prints</div><pre>' + escapeHtml(q.expected) + '</pre>';
    }
    html += '<div class="lx-q-explain">' + q.explain + '</div>';
    if (q.type === 'code') {
      html += '<details class="lx-solution"><summary>Show a solution</summary><pre><code>' + highlight(q.solution) + '</code></pre></details>';
    }
    if (q.type === 'output') {
      html += '<button type="button" class="lx-quiz-link" data-act="try" data-code="' + escapeHtml(q.code) + '" data-file="' + escapeHtml(q.file) + '">Run this code in the terminal</button>';
    }
    fb.innerHTML = html;
    fb.hidden = false;
  };

  Test.prototype.finish = function (score) {
    var st = stateFor(this.slug);
    var total = this.current.length;
    var passed = score >= this.data.pass;
    st.attempts = (st.attempts || 0) + 1;
    st.best = Math.max(st.best || 0, score);
    if (passed) st.passed = true;
    saveState(this.slug, st);
    if (passed && !this.exam && window.ZudoLearn && window.ZudoLearn.markDone) window.ZudoLearn.markDone(this.slug);
    var foot = this.body.querySelector('.lx-quiz-foot');
    var passedNote = this.exam ? ' You have passed this course checkpoint.' : ' This lesson is now marked as done.';
    var failedNote = this.exam
      ? ' Read the explanations, revisit the lessons they come from, then take a new checkpoint with different questions.'
      : ' Read the explanations, look at the lesson again, then take a new test with 5 different questions.';
    foot.innerHTML =
      '<p class="lx-quiz-score ' + (passed ? 'is-passed' : 'is-failed') + '">' +
      (passed ? '✓ Passed: ' : '✗ Not passed: ') + score + ' of ' + total + ' correct.' +
      (passed ? passedNote : failedNote) +
      '</p><button type="button" class="lx-quiz-btn" data-act="start">' + (passed ? 'Take another one' : 'Try again with new questions') + '</button>';
    foot.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    document.dispatchEvent(new CustomEvent('zudo:test-finished', { detail: { slug: this.slug, score: score, passed: passed } }));
  };

  Test.prototype.onClick = function (e) {
    var el = e.target.closest && e.target.closest('[data-act]');
    if (!el || !this.root.contains(el)) return;
    var act = el.getAttribute('data-act');
    var i = Number(el.getAttribute('data-i'));
    if (act === 'start') this.start();
    else if (act === 'submit') this.submit();
    else if (act === 'run') this.runCard(i);
    else if (act === 'reset') this.card(i).querySelector('.lx-q-editor').value = this.current[i].starter;
    else if (act === 'try') {
      var pg = window.ZudoPlayground;
      if (pg) { pg.registerFiles({}); pg.exec(el.getAttribute('data-code'), el.getAttribute('data-file')); }
    } else if (act === 'ide' && window.ZudoIDE) {
      var q = this.current[i];
      var ta = this.card(i).querySelector('.lx-q-editor');
      window.ZudoIDE.open({
        files: [{ project: 'tests', path: q.id + '/' + q.file, content: ta.value, origin: q.starter }],
        focus: { project: 'tests', path: q.id + '/' + q.file },
        onChange: function (content) { ta.value = content; },
      });
    }
  };

  function init() {
    document.querySelectorAll('.lx-quiz[data-quiz], .lx-quiz[data-exam]').forEach(function (root) { new Test(root); });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
