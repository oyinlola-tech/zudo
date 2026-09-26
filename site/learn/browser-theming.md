---
title: "Theming a site with CSS variables — ZudoJS Academy"
description: "Build a light, dark and system theme switch the way this site does it: colour tokens in CSS, one attribute on the root element, a boot script that stops the flash, a preference that survives reloads and follows other tabs, and an event other code can listen to."
source: https://zudojs.oyinlola.site/learn/browser-theming
---

LEVEL 4 · LESSON 13 OF 21

JavaScript in the browser Core

# Theming a site with CSS variables

Build a light, dark and system theme switch the way this site does it: colour tokens in CSS, one attribute on the root element, a boot script that stops the flash, a preference that survives reloads and follows other tabs, and an event other code can listen to.

- **45 min** to read and try
- **You need:** The DOM and Browser APIs
- **You build:** The three-state theme switch this very site uses, then a fourth state of your own

  [Test yourself](#test)

BY THE END OF THIS LESSON YOU CAN

- Explain why colours are tokens with roles instead of hex values in rules
- Switch a whole page with one attribute on the root element and no other CSS change
- Resolve a stored preference and the OS setting into what is on screen, and store only what the visitor chose
- Stop the flash of the wrong theme with a small inline script that runs before the first paint
- Follow OS changes and other tabs with matchMedia and the storage event, and tell other code with a CustomEvent

## The page that flashes

Ada's task list from [The DOM](https://zudojs.oyinlola.site/learn/browser-dom) and [Browser APIs](https://zudojs.oyinlola.site/learn/browser-apis) gets its first design request: "a dark mode, please, my eyes hurt at night." Her first version takes an afternoon. She copies every rule that mentions a colour, wraps the copies in `body.dark { … }`, swaps white for black and black for white, and adds a button that toggles the class. It works in the demo. Then the complaints arrive:

1. "Every time I reload, the page is white for a moment, then goes dark." The class is added by JavaScript, which runs after the browser has already painted the page in its default colours.
2. "The grey hint text is unreadable now." Swapping black for white also swapped the greys, and a grey that is readable on white is not the same grey that is readable on black.
3. "I have the list open in two tabs and only one of them changed." Each tab has its own copy of the page and nobody told the other.
4. "My laptop goes dark at sunset by itself, but your page does not." The operating system has an opinion, and the page never asks for it.

Each complaint points at a design decision, not a bug in a line. This lesson makes those decisions one at a time, ending with the switch this site uses. Press the theme button in the header while you read: everything below is what happens when you do.

## Colours are roles, not values

The copied rules were the first mistake. A stylesheet with two copies of every colour rule has two places to forget, and "swap black for white" is not what a dark theme is. The fix is to name what a colour *does* and let a rule use the name. In CSS the tool for that is a **custom property**, a variable you declare with two leading dashes and read with `var()`. A set of them chosen this way is called **design tokens**.

index.html

```ts
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Tasks</title>
<style>
  :root {
    color-scheme: light;
    --bg: #FAFAF9;        /* the page */
    --surface: #FFFFFF;   /* a card */
    --text: #1A1A2E;      /* words */
    --text-muted: #6B7280;
    --ink: #1A1A2E;       /* borders */
    --accent: #C0392B;    /* the one red */
  }
  :root[data-theme="dark"] {
    color-scheme: dark;
    --bg: #0F0F1A;
    --surface: #16213E;
    --text: #F0EFEA;
    --text-muted: #9AA0B4; /* lifted, not inverted */
    --ink: #FAFAF9;
    /* --accent is not redefined: it stays the same red */
  }
  body { background: var(--bg); color: var(--text); font-family: sans-serif; }
  .card { background: var(--surface); border: 2px solid var(--ink); padding: 1rem; }
  .hint { color: var(--text-muted); }
  .due { color: var(--accent); font-weight: bold; }
</style>
</head>
<body>
  <div class="card" id="card">
    <p>Buy detergent <span class="due" id="due">due today</span></p>
    <p class="hint" id="hint">Tap a task to mark it done</p>
  </div>
</body>
</html>
```

Read the names, not the values. `--surface` is "a card", whatever shade a card is today. `--ink` is "borders". The dark block redefines the same names, and every rule that reads them changes with it. Not one rule was copied. Notice two things the naive swap got wrong:

- **The muted grey is lifted, not inverted.** `#6B7280` on white passes the 4.5:1 contrast rule for body text; its mirror image on navy would not. The dark value is chosen by measuring, not by arithmetic.
- **The accent is not redefined at all.** A red button stays the same red in both themes; only its surroundings move. Deciding which tokens change and which stay is most of the design work.

> NOTE
>
> `color-scheme` is a one-line bonus: it tells the browser which theme the page is, so scrollbars, form controls and the default focus ring match without any rules of yours.

## One attribute switches everything

With tokens in place, switching the theme means changing one attribute on the root element. The rules do not know it happened; they just read different values the next time the browser computes styles.

apply.js

```ts
const root = document.documentElement;

function colours() {
  const body = getComputedStyle(document.body).backgroundColor;
  const card = getComputedStyle(document.getElementById("card")).backgroundColor;
  const due = getComputedStyle(document.getElementById("due")).color;
  return `${body} | card ${card} | due ${due}`;
}

root.setAttribute("data-theme", "light");
console.log("light:", colours());

root.setAttribute("data-theme", "dark");
console.log("dark: ", colours());

root.removeAttribute("data-theme");
```

What the browser terminal prints

```ts
light: rgb(250, 250, 249) | card rgb(255, 255, 255) | due rgb(192, 57, 43)
dark:  rgb(15, 15, 26) | card rgb(22, 33, 62) | due rgb(192, 57, 43)
```

The page, the card and the words all moved with one line, and the due date stayed red in both, because its token was not redefined. This is the whole mechanism. Everything that follows is about deciding *which* value to put in that attribute, and *when*.

## A preference is not what is on screen

Ada's toggle had two states, on and off. Complaint four shows why two is not enough: some people want the page to follow the operating system, which is a third state. So there are two separate things:

- The **preference**: what the visitor asked for. `"light"`, `"dark"`, or `"system"` (follow the OS).
- The **resolved theme**: what is actually on screen right now, which is only ever `"light"` or `"dark"`.

Turning one into the other is a pure function, so write it as one and test it without a browser:

resolve.js

```ts
function resolveTheme(preference, osPrefersDark) {
  if (preference === "dark") return "dark";
  if (preference === "light") return "light";
  return osPrefersDark ? "dark" : "light";
}

const cases = [
  ["system", false],
  ["system", true],
  ["light", true],
  ["dark", false],
  [null, true],
  ["banana", false],
];
for (const [preference, osDark] of cases) {
  console.log(String(preference).padEnd(7), "os dark:", String(osDark).padEnd(5), "→", resolveTheme(preference, osDark));
}
```

Output of `node resolve.js` and of the browser terminal

```ts
system  os dark: false → light
system  os dark: true  → dark
light   os dark: true  → light
dark    os dark: false → dark
null    os dark: true  → dark
banana  os dark: false → light
```

Anything that is not exactly `"dark"` or `"light"`, including a missing value and a typo, means "follow the OS". That is the safe default: a corrupted stored value can never trap someone in a theme they did not choose.

The OS setting itself comes from a media query. The same `prefers-color-scheme` that CSS can test in an `@media` block is available to JavaScript through `window.matchMedia`, which returns an object whose `matches` is true or false right now, and which fires a `change` event when the answer changes.

## Remembering safely

The preference has to survive a reload, so it goes in `localStorage`, which [Browser APIs](https://zudojs.oyinlola.site/learn/browser-apis) covered. Two rules from that lesson matter here. Storage can throw, in a private window or when the visitor has blocked site data, and a theme switch must never crash a page over that. And store only what was chosen: "system" is the *absence* of a stored value, so a visitor who never touches the toggle keeps following their OS forever, and clearing the value is how you go back to it.

safe-pref.js

```ts
const KEY = "academy-demo:theme";

function readPreference(storage) {
  try {
    const value = storage.getItem(KEY);
    return value === "light" || value === "dark" ? value : "system";
  } catch {
    return "system";
  }
}

function writePreference(storage, preference) {
  try {
    if (preference === "light" || preference === "dark") storage.setItem(KEY, preference);
    else storage.removeItem(KEY);
    return true;
  } catch {
    return false;
  }
}

// A fake storage: the same interface, so the functions cannot tell the difference.
function fakeStorage({ broken = false } = {}) {
  const data = new Map();
  const fail = () => { throw new Error("storage is disabled"); };
  return {
    getItem: (k) => (broken ? fail() : (data.has(k) ? data.get(k) : null)),
    setItem: (k, v) => (broken ? fail() : void data.set(k, String(v))),
    removeItem: (k) => (broken ? fail() : void data.delete(k)),
  };
}

const ok = fakeStorage();
console.log("fresh:", readPreference(ok));
console.log("write dark:", writePreference(ok, "dark"), "→", readPreference(ok));
console.log("write system:", writePreference(ok, "system"), "→", readPreference(ok));
ok.setItem(KEY, "banana");
console.log("garbage:", readPreference(ok));

const blocked = fakeStorage({ broken: true });
console.log("blocked read:", readPreference(blocked));
console.log("blocked write:", writePreference(blocked, "dark"));
```

Output of `node safe-pref.js` and of the browser terminal

```ts
fresh: system
write dark: true → dark
write system: true → system
garbage: system
blocked read: system
blocked write: false
```

Both helpers turn every failure into a value the caller can live with: a preference of "system", or `false` from a write. The page still switches theme for the rest of the visit; it just will not be remembered, which is the right amount of failure.

## Stopping the flash

Now complaint one, the white flash. Follow what the browser does with Ada's page. It reads the HTML from the top. When it meets a stylesheet it fetches it, and it will not paint until the CSS has arrived, so the first paint already has the right rules. But the theme attribute is set by JavaScript, and her script is at the bottom of the page with `defer`, so it runs after that first paint. For a moment the page is painted with the default (light) tokens; then the script runs, the attribute appears, and everything repaints. That moment is the flash.

The fix is to set the attribute *before* the first paint, which means before the stylesheet: a small inline script in `<head>`, above the `<link>` tags. Inline scripts block parsing, which is exactly what we want here and why everything else is deferred. It has to be tiny, synchronous, and unable to fail:

head.html

```ts
<head>
  <meta charset="utf-8">
  <script>
    (function () {
      var saved = null;
      try { saved = localStorage.getItem("theme"); } catch (e) { /* follow the OS */ }
      var dark = saved === "dark" ||
        (saved !== "light" && window.matchMedia("(prefers-color-scheme: dark)").matches);
      document.documentElement.setAttribute("data-theme", dark ? "dark" : "light");
    })();
  </script>
  <link rel="stylesheet" href="theme.css">
  <script src="theme.js" defer></script>
</head>
```

Three details carry the weight. It reads storage inside `try`, because the boot script must never throw: an error here would leave the page unthemed and print a red line in the console of every visit. It resolves "system" on the spot with `matchMedia`, so the attribute is always `"light"` or `"dark"` and the CSS needs one dark block, not one for the attribute and another for the media query. And it uses `var` and a function expression, plain old JavaScript, because a syntax error in a script this early would be the one thing worse than a flash.

You can watch it work. This runs the same logic against a stored value and reads the attribute back:

boot.js

```ts
const KEY = "academy-demo:theme";

function boot() {
  let saved = null;
  try { saved = localStorage.getItem(KEY); } catch { /* follow the OS */ }
  const dark = saved === "dark" ||
    (saved !== "light" && window.matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.setAttribute("data-theme", dark ? "dark" : "light");
  return document.documentElement.getAttribute("data-theme");
}

localStorage.setItem(KEY, "dark");
console.log("stored dark  →", boot());

localStorage.setItem(KEY, "light");
console.log("stored light →", boot());

localStorage.removeItem(KEY);
const os = window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
console.log("nothing stored → same as the OS:", boot() === os);

document.documentElement.removeAttribute("data-theme");
```

What the browser terminal prints

```ts
stored dark  → dark
stored light → light
nothing stored → same as the OS: true
```

> TIP
>
> The site you are reading keeps the boot block inside `js/theme.js` between two comment marks, and a build script copies it into every page's `<head>`. One source, hundreds of copies, none of them typed by hand. You can see it with "view source" on this page.

## Following the OS and other tabs

Complaints three and four are the same shape: something changed elsewhere and this page did not hear about it. Both have an event.

When the OS switches theme, the `MediaQueryList` from `matchMedia` fires `change`. The page should react only while the preference is "system"; a visitor who chose dark stays dark at sunrise. When another tab writes to `localStorage`, every *other* tab with the same origin receives a `storage` event on `window`, with the key and the new value. The tab that wrote it gets nothing, which is fine: it already knows.

follow.js

```ts
const KEY = "academy-demo:theme";
const media = window.matchMedia("(prefers-color-scheme: dark)");
console.log("OS answer is a", typeof media.matches);

function apply(preference) {
  const dark = preference === "dark" || (preference !== "light" && media.matches);
  document.documentElement.setAttribute("data-theme", dark ? "dark" : "light");
  console.log("applied", preference, "→ on screen:", dark ? "dark" : "light");
}

media.addEventListener("change", () => {
  const preference = localStorage.getItem(KEY) ?? "system";
  if (preference === "system") apply("system");
});

window.addEventListener("storage", (event) => {
  if (event.key !== KEY && event.key !== null) return;
  console.log("another tab chose", event.newValue ?? "system");
  apply(event.newValue ?? "system");
});

// Another tab writing "dark", then "light", looks exactly like this to us:
window.dispatchEvent(new StorageEvent("storage", { key: KEY, newValue: "dark" }));
window.dispatchEvent(new StorageEvent("storage", { key: KEY, newValue: "light" }));

document.documentElement.removeAttribute("data-theme");
```

What the browser terminal prints

```ts
OS answer is a boolean
another tab chose dark
applied dark → on screen: dark
another tab chose light
applied light → on screen: light
```

Had the other tab removed the value instead, `newValue` would be `null`, the handler would apply "system", and the result would depend on the OS: dark at night on a laptop set to follow the sun. That is not a bug; it is the whole point of the state. A `key` of `null` means the other tab called `localStorage.clear()`, so treat it as "our value may be gone too".

## Telling the rest of the page

Other code cares when the theme changes. A code editor wants to swap its own colour scheme; a chart wants to redraw its axes. None of that belongs in the theme module, and the theme module should not know those things exist. The DOM already has the tool: dispatch a `CustomEvent` on `document` with the details, and anyone can listen.

event.js

```ts
function announce(preference, resolved) {
  document.dispatchEvent(new CustomEvent("theme:change", {
    detail: { preference, resolved },
  }));
}

// Somewhere else entirely: a widget that only cares about the resolved theme.
document.addEventListener("theme:change", (event) => {
  const { preference, resolved } = event.detail;
  console.log(`widget: ${resolved} palette (visitor asked for ${preference})`);
});

announce("system", "light");
announce("dark", "dark");
```

What the browser terminal prints

```ts
widget: light palette (visitor asked for system)
widget: dark palette (visitor asked for dark)
```

The theme module has one job and one event. The editor on this site listens to `zudo:theme` exactly like this and calls Monaco's `setTheme`; the theme code has never heard of Monaco.

## How this site does it

Everything above is running on the page you are reading. The parts, in case you want to read real code:

- `css/site.css` declares about ninety tokens in a `:root` block, and a `:root[data-theme="dark"]` block that redefines the ones that change. [Themes](https://zudojs.oyinlola.site/docs/design-themes.md) in the docs lists every token with both values.
- `js/theme.js` is the boot block plus `window.zudoTheme`, with `get`, `set`, `cycle`, `resolved` and `onChange`. Try `zudoTheme.cycle()` in the browser console.
- The header button in `js/components.js` draws a monitor, sun or moon for the current preference and calls `cycle()`. It does not store anything itself.
- The Tailwind utilities the pages use (`bg-zudo-white`, `border-black`, `bg-black/5`) point at the same tokens, so 350 pages changed theme with no edits.
- Code blocks keep their dark palette in both themes on purpose: the colour a keyword has should not depend on what time of day you study.

> WATCH OUT
>
> Do not copy the "swap every colour" idea into a real project, even as a first step. The tokens are the cheap part; the expensive part is deciding which roles exist, and a copied stylesheet hides that decision until it is too late to make it well.

## Practice

TRY IT YOURSELF

### Add a high-contrast state

The switch cycles System, Light, Dark. Add a fourth preference, `"contrast"`, after Dark: it resolves to itself (the CSS would have a `[data-theme="contrast"]` block), everything else keeps working, and unknown values still mean "system". Write `nextPreference(current)` and update `resolveTheme`.

Write it in the editor, then press **Check**. Hints and the solution open up once you have checked your code.

HINT 1

`ORDER.indexOf(current)` is `-1` for an unknown value, and `(-1 + 1) % 4` is `0`, which is exactly the "system" entry. The wrap at the end comes from the remainder operator.

HINT 2

`function nextPreference(current) { return ORDER[(ORDER.indexOf(current) + 1) % ORDER.length]; }` and one extra line in the resolver: `if (preference === "contrast") return "contrast";`

SOLUTION

theme-cycle.js

```ts
const ORDER = ["system", "light", "dark", "contrast"];

function nextPreference(current) {
  return ORDER[(ORDER.indexOf(current) + 1) % ORDER.length];
}

function resolveTheme(preference, osPrefersDark) {
  if (preference === "dark") return "dark";
  if (preference === "light") return "light";
  if (preference === "contrast") return "contrast";
  return osPrefersDark ? "dark" : "light";
}

let pref = "system";
for (let i = 0; i < 5; i++) {
  pref = nextPreference(pref);
  console.log(pref.padEnd(8), "→", resolveTheme(pref, true));
}
console.log(nextPreference("banana"), resolveTheme("banana", false));
```

Output of `node theme-cycle.js` and of the browser terminal

```ts
light    → light
dark     → dark
contrast → contrast
system   → dark
light    → light
system light
```

The fifth step shows the cycle wrapping back to "system", which on a dark OS resolves to dark. An unknown value cycles to "system" and resolves to the OS answer, so a bad stored value can never strand anyone.

## Recap

- Name colours by role with custom properties and redefine them under one attribute; never copy rules.
- Dark values are chosen by measuring contrast: lift muted greys, keep accents, decide which tokens change.
- Keep the preference (system, light, dark) apart from what is on screen (light, dark); resolving one into the other is a pure function with "system" as the safe default.
- Store only an explicit choice, inside `try`, and treat a missing or broken value as "system".
- Set the attribute from a tiny inline script in `<head>`, before the stylesheet, so the first paint is already right.
- Listen to `matchMedia` for the OS and to `storage` for other tabs; tell everyone else with one `CustomEvent`.

Next: [Networking from the browser](https://zudojs.oyinlola.site/learn/browser-networking), where the page starts talking to Ada's Task API.

## Test yourself

Five questions, picked at random from this lesson's question bank. Some ask you to choose an answer, some to predict what code prints, and some to write code and run it in the terminal. Get 4 of 5 right to pass. If you don't, read the explanations and try again: you get 5 different questions.
