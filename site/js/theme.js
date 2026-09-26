/**
 * Zudo theme: light, dark, or follow the system.
 *
 * What is on screen is one attribute on <html>: data-theme="light" or "dark".
 * The stylesheet keys its dark tokens off that attribute, so this file never
 * touches a colour. The visitor's *preference* is separate: "light", "dark",
 * or "system" (follow the OS), and only this file turns one into the other.
 *
 * Two parts:
 *
 *   1. The boot block between the boot:start / boot:end marks. Every page
 *      carries a copy of it inline in <head>, before any stylesheet (put there
 *      by scripts/site-theme.mjs), so the first paint is already the right
 *      theme. It must stay tiny, synchronous and free of anything the head
 *      does not have yet.
 *
 *   2. Everything after it loads deferred and adds window.zudoTheme (get, set,
 *      cycle, resolved, onChange), keeps <meta name="theme-color"> in step,
 *      follows OS changes while no preference is stored, and mirrors a choice
 *      made in one tab into the others.
 *
 * A stored preference (localStorage "zudo.theme") exists only for "light" or
 * "dark"; "system" is the absence of a stored value, so a visitor who never
 * touches the toggle keeps following their OS. Appending ?theme=dark,
 * ?theme=light or ?theme=system to any URL stores that choice: handy for
 * sharing a link that opens in a given theme, and for screenshots.
 */

/* boot:start */
(function () {
  var KEY = 'zudo.theme';
  var root = document.documentElement;
  var pick = /[?&]theme=(light|dark|system)\b/.exec(location.search);
  var saved = null;
  try {
    if (pick) {
      if (pick[1] === 'system') localStorage.removeItem(KEY);
      else localStorage.setItem(KEY, pick[1]);
    }
    saved = localStorage.getItem(KEY);
  } catch (e) {
    /* storage blocked (private mode, strict settings): follow the OS */
  }
  var dark = saved === 'dark' || (saved !== 'light' && window.matchMedia('(prefers-color-scheme: dark)').matches);
  root.setAttribute('data-theme', dark ? 'dark' : 'light');
})();
/* boot:end */

(function () {
  'use strict';

  var KEY = 'zudo.theme';
  var ORDER = ['system', 'light', 'dark'];
  var META = { light: '#1A1A2E', dark: '#0F0F1A' };
  var root = document.documentElement;
  var media = window.matchMedia('(prefers-color-scheme: dark)');

  /** The stored preference: 'system' | 'light' | 'dark'. */
  function get() {
    try {
      var v = localStorage.getItem(KEY);
      return v === 'light' || v === 'dark' ? v : 'system';
    } catch (e) {
      return 'system';
    }
  }

  /** What is actually on screen right now: 'light' | 'dark'. */
  function resolved() {
    return root.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
  }

  function apply(pref, persist) {
    var dark = pref === 'dark' || (pref === 'system' && media.matches);
    root.setAttribute('data-theme', dark ? 'dark' : 'light');
    if (persist) {
      try {
        if (pref === 'system') localStorage.removeItem(KEY);
        else localStorage.setItem(KEY, pref);
      } catch (e) {
        /* the choice still applies to this page; it just will not be remembered */
      }
    }
    var meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', META[resolved()]);
    document.dispatchEvent(
      new CustomEvent('zudo:theme', { detail: { preference: pref, resolved: resolved() } })
    );
  }

  var api = {
    KEY: KEY,
    ORDER: ORDER,
    get: get,
    resolved: resolved,
    /** Store and apply a preference; anything unknown means 'system'. */
    set: function (pref) {
      apply(ORDER.indexOf(pref) === -1 ? 'system' : pref, true);
    },
    /** system → light → dark → system. Returns the new preference. */
    cycle: function () {
      var next = ORDER[(ORDER.indexOf(get()) + 1) % ORDER.length];
      api.set(next);
      return next;
    },
    /** fn({ preference, resolved }) after every change, including OS changes. */
    onChange: function (fn) {
      document.addEventListener('zudo:theme', function (e) {
        fn(e.detail);
      });
    },
  };

  window.zudoTheme = api;

  media.addEventListener('change', function () {
    if (get() === 'system') apply('system', false);
  });

  window.addEventListener('storage', function (e) {
    if (e.key === KEY || e.key === null) apply(get(), false);
  });

  apply(get(), false);
})();
