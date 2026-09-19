// Zudo Homepage Scripts
// Search, navigation and the playground are provided by components.js and playground.js.
// This file is reserved for homepage-only behaviour.

(function () {
  'use strict';

  var picker = document.querySelector('[data-picker]');
  if (!picker) return;

  var chips = picker.querySelectorAll('[data-pkg]');
  var cmd = picker.querySelector('[data-picker-cmd]');
  var count = picker.querySelector('[data-picker-count]');
  var copy = picker.querySelector('[data-picker-copy]');

  function command() {
    var names = [];
    chips.forEach(function (chip) {
      if (chip.getAttribute('aria-pressed') === 'true') names.push('@zudojs/' + chip.getAttribute('data-pkg'));
    });
    return names;
  }

  function render() {
    var names = command();
    cmd.innerHTML = '<span class="picker-prompt">$</span> ' +
      (names.length ? 'npm install ' + names.join(' ') : '<span style="color:#6C7086">pick at least one package</span>');
    count.textContent = names.length + ' of 39';
    copy.disabled = !names.length;
  }

  chips.forEach(function (chip) {
    chip.addEventListener('click', function () {
      chip.setAttribute('aria-pressed', chip.getAttribute('aria-pressed') === 'true' ? 'false' : 'true');
      render();
    });
  });

  copy.addEventListener('click', function () {
    var names = command();
    if (!names.length) return;
    var text = 'npm install ' + names.join(' ');
    var done = function () {
      copy.textContent = 'Copied';
      copy.classList.add('is-done');
      setTimeout(function () { copy.textContent = 'Copy'; copy.classList.remove('is-done'); }, 1600);
    };
    if (navigator.clipboard && window.isSecureContext) navigator.clipboard.writeText(text).then(done, done);
    else done();
  });

  render();
})();
