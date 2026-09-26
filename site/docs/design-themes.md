---
title: "Themes"
description: "Light, dark and system themes on the ZudoJS site: the colour tokens, their values in both themes, how the switch avoids a flash, and the rules for adding colours."
source: https://zudojs.oyinlola.site/docs/design-themes
---

SITE

# Themes

The site has a light theme, a dark theme, and a default that follows your operating system. This page shows every colour token with its value in both themes, explains how the switch works without a flash, and sets the rules for adding a colour.

DESIGN SYSTEM TOKENS DARK MODE

## Try it

The header button cycles System, Light and Dark. These do the same thing, and the line under them reads back what the site stored and what is on screen. Open this page in a second tab and change the theme there: this tab follows.

Preference: … · On screen: …

You can also open any page with `?theme=dark`, `?theme=light` or `?theme=system` in the address; the choice is stored exactly as if you had pressed the button.

## How it works

Every colour on the site is a CSS custom property declared once in `css/site.css`. The names describe a role, not a colour: `--z-surface` is "a card", `--z-ink` is "borders and hard shadows", whatever shade those are today. The dark theme is a second block that gives the same names different values, so no rule anywhere else changes.

What is on screen is one attribute: `<html data-theme="light">` or `"dark"`. The visitor's *preference* is separate and lives in `localStorage` under `zudo.theme`: `"light"`, `"dark"`, or nothing at all, which means follow the operating system. Only `js/theme.js` turns one into the other.

To avoid a flash of the wrong theme, a copy of the boot part of that file is inlined in every page's `<head>` before any stylesheet. It is under half a kilobyte and does one thing: read the preference, ask the OS if there is none, and set the attribute before the first paint.

js/theme.js — the boot block, as inlined in every page

```ts
var saved = null;
try { saved = localStorage.getItem('zudo.theme'); } catch (e) { /* storage blocked: follow the OS */ }
var dark = saved === 'dark' ||
  (saved !== 'light' && window.matchMedia('(prefers-color-scheme: dark)').matches);
document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light');
```

The rest of the file loads deferred and adds `window.zudoTheme` (`get`, `set`, `cycle`, `resolved`, `onChange`), keeps the browser's `theme-color` in step, follows the OS while nothing is stored, and mirrors a change made in one tab into the others. Every change dispatches a `zudo:theme` event on `document`, which is how the Academy editor knows to switch Monaco between its light and dark themes.

Tailwind utilities follow the same tokens. `js/tailwind-config.js` points `bg-zudo-white`, `border-black`, `bg-black/5`, the gray ramp and the tint colours at `var(--z-…)` values, so the hundreds of pages written with those classes changed theme without a single edit. Where one class name plays two roles, the per-utility keys split them: `text-zudo-blue` is lifted for contrast in dark while `bg-zudo-blue` stays the brand blue.

Want the full walkthrough with runnable code? The Academy lesson [Theming a site with CSS variables](https://zudojs.oyinlola.site/learn/browser-theming) builds this switch from scratch and ends with an exercise.

## Rules for adding colour

- **Never write a hex value in a page stylesheet.** Use a token from the table below. If none fits, add one to both blocks in `css/site.css`, then use it. `node scripts/site-tokenize.mjs --check` fails on any literal it does not know.
- **Pick by role, not by shade.** Text on the page is `--z-text`; a card is `--z-surface`; a block that must stay dark in both themes (the footer, a table head) is `--z-inverse` with `--z-paper` text.
- **Code panels keep Catppuccin Mocha in both themes.** Their colours are invariant on purpose, so a learner's colour associations never reset. Only the frame around a panel follows the theme.
- **Yellow keeps dark text.** Anything on `--z-yellow` uses `--z-on-yellow`; the Tailwind class `bg-zudo-yellow` pins it for you.
- **Accent text is lifted in dark.** `--z-red-text`, `--z-blue-text` and `--z-green-text` pass 4.5:1 on the dark surfaces; the plain `--z-red`, `--z-blue`, `--z-green` are for fills with white text and do not change.
- **Prove the light theme did not move.** `pnpm site:shots --out .site-shots/now --compare .site-shots/base` renders fifteen pages at two widths and fails on a single changed pixel. Add `--theme dark` to review the dark theme.

## Every token

Generated from `css/site.css` by `pnpm site:theme`; do not edit the table by hand. The last column uses the token itself, so it shows the value for the theme you are looking at right now.

| Token | Light | Dark | Now |
| --- | --- | --- | --- |
| Brand |  |  |  |
| `--z-red` | #C0392B | same |  |
| `--z-red-hover` | #A93226 | same |  |
| `--z-red-rgb` | 192 57 43 | same |  |
| `--z-red-text` red as text or a border: lifted in dark | #C0392B | #E6675A |  |
| `--z-red-light` | #F1948A | #F5A79E |  |
| `--z-red-soft` | #E35D4F | same |  |
| `--z-red-700` | #B91C1C | #F28B82 |  |
| `--z-blue` | #2471A3 | same |  |
| `--z-blue-hover` | #1A5276 | same |  |
| `--z-blue-rgb` | 36 113 163 | 127 179 224 |  |
| `--z-blue-text` blue as text or a border: lifted in dark | #2471A3 | #7FB3E0 |  |
| `--z-blue-deep` | #1B4F9C | #8EC0EA |  |
| `--z-blue-deep-2` | #1A5276 | #8EC0EA |  |
| `--z-blue-focus` | #2E86C1 | #7FB3E0 |  |
| `--z-blue-700` | #1D4ED8 | #8EC0EA |  |
| `--z-yellow` | #D4AC0D | same |  |
| `--z-yellow-rgb` | 212 172 13 | same |  |
| `--z-yellow-text` | #D4AC0D | #E0BC3A |  |
| `--z-yellow-dark` | #7D6608 | #F2D06B |  |
| `--z-yellow-ink` | #6B5705 | #F2D06B |  |
| `--z-yellow-ink-2` | #5D4E0B | #E8C55A |  |
| `--z-on-yellow` text placed on --z-yellow; the same in both themes | #1A1A2E | same |  |
| `--z-green` | #1E8449 | same |  |
| `--z-green-text` | #1E8449 | #52BE80 |  |
| `--z-green-deep` | #14683A | #6FD39A |  |
| `--z-pink` | #A569BD | same |  |
| `--z-pink-text` | #A569BD | #C39BD3 |  |
| `--z-purple` | #6B2FA0 | #C9A3F0 |  |
| `--z-gray` | #6B7280 | #9AA0B4 |  |
| Surfaces |  |  |  |
| `--z-bg` the page | #FAFAF9 | #0F0F1A |  |
| `--z-bg-rgb` | 250 250 249 | 15 15 26 |  |
| `--z-surface` cards, sidebars, table cells | #FFFFFF | #16213E |  |
| `--z-surface-rgb` | 255 255 255 | 22 33 62 |  |
| `--z-surface-alt` hover states, subtle panels | #F5F5F0 | #1A1A2E |  |
| `--z-inverse` a block that is deliberately dark on the page: footer, table heads | #1A1A2E | #07070F |  |
| `--z-inverse-rgb` | 26 26 46 | 7 7 15 |  |
| `--z-ink` borders, hard shadows, the mark | #1A1A2E | #FAFAF9 |  |
| `--z-ink-2` navy; brand, the same in both themes | #16213E | same |  |
| `--z-ink-rgb` --z-ink as a triplet, for rgb(... / alpha) | 26 26 46 | 250 250 249 |  |
| `--z-black-rgb` Tailwind's black at any opacity (bg-black/5) | 0 0 0 | 250 250 249 |  |
| `--z-paper` off-white text on dark blocks; the same in both themes | #FAFAF9 | same |  |
| `--z-paper-rgb` | 250 250 249 | same |  |
| `--z-on-accent` white text on red, green, blue and inverse blocks; the same in both themes | #FFFFFF | same |  |
| `--z-scrim-rgb` overlays behind search and the mobile drawer | 26 26 46 | 0 0 0 |  |
| `--z-shadow` | #1A1A2E | #FAFAF9 |  |
| `--z-stage` the checkerboard behind logos on /brand | #ECECEA | #22273D |  |
| `--z-code-inline-bg` inline code in Academy prose | #EEF0F3 | #232842 |  |
| `--z-code-inline-border` | #E1E4E8 | #343A5A |  |
| Text |  |  |  |
| `--z-text` | #1A1A2E | #F0EFEA |  |
| `--z-text-2` | #4B5563 | #B4B8C5 |  |
| `--z-text-3` | #9CA3AF | #7C8194 |  |
| `--z-text-muted-2` | #7F8C8D | #8A90A8 |  |
| Borders |  |  |  |
| `--z-border` | #E5E7EB | #2A2F45 |  |
| `--z-border-strong` | #D1D5DB | #3A4060 |  |
| `--z-border-mid` | #BDC3C7 | #4A5070 |  |
| Gray ramp |  |  |  |
| `--z-gray-50` | #F9FAFB | #1A1F33 |  |
| `--z-gray-100` | #F3F4F6 | #222842 |  |
| `--z-gray-200` | #E5E7EB | #2E3552 |  |
| `--z-gray-300` | #D1D5DB | #3E4666 |  |
| `--z-gray-400` | #9CA3AF | #7C8194 |  |
| `--z-gray-500` | #6B7280 | #9AA0B4 |  |
| `--z-gray-600` | #4B5563 | #B4B8C5 |  |
| `--z-gray-700` | #374151 | #CDD0DA |  |
| `--z-gray-800` | #1F2937 | #E1E3E9 |  |
| `--z-gray-900` | #111827 | #F0EFEA |  |
| Tints |  |  |  |
| `--z-tint-yellow` | #FEFCE8 | #2E2814 |  |
| `--z-tint-yellow-2` | #FEF9E7 | #2E2814 |  |
| `--z-tint-yellow-3` | #FFFBEA | #2E2814 |  |
| `--z-tint-red` | #FEF2F2 | #2E1614 |  |
| `--z-tint-red-2` | #FDF2F2 | #2E1614 |  |
| `--z-tint-red-3` | #FEF3F2 | #2E1614 |  |
| `--z-tint-red-4` | #FDECEA | #2E1614 |  |
| `--z-tint-blue` | #EFF6FF | #14213A |  |
| `--z-tint-blue-2` | #E8F0FB | #14213A |  |
| `--z-tint-blue-3` | #EAF2F8 | #14213A |  |
| `--z-tint-blue-4` | #EEF4FB | #14213A |  |
| `--z-tint-green` | #F0FDF4 | #12291C |  |
| `--z-tint-green-2` | #F0FFF4 | #12291C |  |
| `--z-tint-green-3` | #E8F6EE | #12291C |  |
| `--z-tint-green-4` | #F0FAF3 | #12291C |  |
| `--z-tint-pink` | #FDF2F8 | #2E1A2A |  |
| `--z-tint-purple` | #F3EBFA | #2B2140 |  |
| Code |  |  |  |
| `--z-code-bg` | #1E1E2E | same |  |
| `--z-code-mantle` | #181825 | same |  |
| `--z-code-crust` | #11111B | same |  |
| `--z-code-surface` | #313244 | same |  |
| `--z-code-surface-2` | #45475A | same |  |
| `--z-code-overlay` | #6C7086 | same |  |
| `--z-code-text` | #CDD6F4 | same |  |
| `--z-code-subtext` | #A6ADC8 | same |  |
