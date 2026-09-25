---
title: "Browser APIs — ZudoJS Academy"
description: "Use the browser's tools with their failure modes: fetch, localStorage, URL and URLSearchParams, the History API, timers, requestAnimationFrame and Web Workers."
source: https://zudojs.oyinlola.site/learn/browser-apis
---

LEVEL 4 · LESSON 12 OF 20

JavaScript in the browser Core

# Browser APIs

Use the browser's tools with their failure modes: fetch, localStorage, URL and URLSearchParams, the History API, timers, requestAnimationFrame and Web Workers.

- **55 min** to read and try
- **You need:** The DOM, Events and Promises in depth
- **You build:** A task page that loads its data with fetch, remembers tasks across reloads with versioned storage, keeps its filter in the URL and stays in step across tabs

  [Test yourself](#test)

BY THE END OF THIS LESSON YOU CAN

- Explain what a Web API is and detect whether one is available
- Load data with fetch, check the status, read the body once, and tell HTTP errors from network errors
- Build and read URLs and query strings with URL and URLSearchParams instead of string concatenation
- Store data in localStorage safely: strings only, versioned, validated, and never secrets
- Keep a page's view in the URL with the History API, and animate with requestAnimationFrame
- Move heavy work off the main thread with a Web Worker

## The page that forgets

Ada's task list from [The DOM](https://zudojs.oyinlola.site/learn/browser-dom) and [Events](https://zudojs.oyinlola.site/learn/browser-events) works, until she uses it for a day. Four complaints arrive:

1. "I pressed reload and all my tasks were gone." The tasks live in a JavaScript array, and a reload starts the program again from nothing.
2. "I filtered to show only open tasks and sent the link to my assistant, but she saw everything." The filter lives in a variable, not in the address.
3. "The first time the page opens, the list is empty." The tasks should come from a server, not be written into the code.
4. "When I open the yearly report, the whole page freezes for two seconds." The report adds up thousands of invoices on the same thread that handles clicks.

None of these can be fixed with the JavaScript language alone. Each needs something that only the environment around it can offer: a network, a place on disk, the address bar, a second thread. The browser offers these as **Web APIs**. This lesson takes the most important ones in turn, shows how each fails, and ends by fixing all four complaints in one page.

## What a Web API is

JavaScript the language gives you values, functions, objects, promises and a few built-ins like `Math`, `JSON` and `Map`. Everything that touches the outside world comes from the **host**, the program that runs your JavaScript. In a browser, the host provides `document`, `fetch`, `localStorage`, `setTimeout` and hundreds more. These are **Web APIs**: interfaces written down in open standards (by the WHATWG and the W3C) so that every browser implements them the same way. MDN, the Mozilla Developer Network, documents them all.

Node.js is a different host. It has no `document` or `localStorage`, but it implements many Web APIs so that the same code runs in both places: `fetch`, `Response`, `URL`, `URLSearchParams`, `AbortController`, `EventTarget`, `Blob`, `TextEncoder`, `structuredClone`, `setTimeout` and `WebSocket`. That is why many examples in this lesson run in Node.js as well.

Not every browser has every API, and some are only available on HTTPS pages (a **secure context**) or after the user grants a permission, like the camera or location. So code checks before it uses a newer API. That is **feature detection**:

index.html

```ts
<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><title>Tasks</title></head>
<body>
  <main id="app">
    <p>Progress: <span id="bar-label">0%</span></p>
    <div id="track"><div id="bar"></div></div>
  </main>
</body>
</html>
```

detect.js

```ts
const features = {
  fetch: typeof fetch === "function",
  localStorage: "localStorage" in window,
  history: typeof history.pushState === "function",
  workers: typeof Worker === "function",
  clipboard: "clipboard" in navigator,
  geolocation: "geolocation" in navigator,
  "made-up API": "teleport" in navigator,
};
for (const [name, available] of Object.entries(features)) {
  console.log(`${name}: ${available ? "yes" : "no"}`);
}
```

What the browser terminal prints

```ts
fetch: yes
localStorage: yes
history: yes
workers: yes
clipboard: yes
geolocation: yes
made-up API: no
```

Feature detection asks "does this exist?" rather than "which browser is this?". Checking the browser's name is unreliable: new versions add features, and browsers pretend to be each other in their identification strings. When a feature is missing, fall back to something simpler, or tell the user.

## fetch: loading data

`fetch(url, options)` sends an HTTP request and returns a promise of a **`Response`**. You met `fetch` on the server side in [An HTTP server with no framework](https://zudojs.oyinlola.site/learn/node-http), where Node.js called its own server. In the browser it is the same API. A response arrives in two steps, and each step can fail differently:

1. The promise from `fetch` fulfils as soon as the **headers** arrive: the status code and headers are available, the body may still be downloading. It rejects only when no HTTP response arrived at all: no network, the server could not be reached, the request was blocked or cancelled.
2. Reading the **body** (`response.json()`, `.text()`, `.blob()`) returns a second promise. `json()` rejects if the body is not valid JSON.

This site keeps every lesson's test questions in a JSON file. The preview can fetch it like any page on this site would:

fetch-json.js

```ts
const response = await fetch("/learn/quiz/browser-dom.json");
console.log("status:", response.status, "ok:", response.ok);
console.log("JSON?", response.headers.get("content-type").startsWith("application/json"));

const bank = await response.json();
console.log("questions per test:", bank.size, "needed to pass:", bank.pass);
console.log("first question type:", bank.questions[0].type);
console.log("body used:", response.bodyUsed);
```

What the browser terminal prints

```ts
status: 200 ok: true
JSON? true
questions per test: 5 needed to pass: 4
first question type: choice
body used: true
```

Now the three ways it goes wrong. The file does not exist; the reply is not JSON; the server cannot be reached at all:

fetch-errors.js

```ts
const missing = await fetch("/learn/quiz/no-such-lesson.json");
console.log("missing file:", missing.status, "ok:", missing.ok);

try {
  await missing.json();
} catch (error) {
  console.log("parsing the 404 page as JSON:", error.name);
}

try {
  await fetch("http://127.0.0.1:1/tasks");
} catch (error) {
  console.log("no server:", error.name, "-", error.message);
}
```

What the browser terminal prints

```ts
missing file: 404 ok: false
parsing the 404 page as JSON: SyntaxError
no server: TypeError - Failed to fetch
```

The 404 did *not* reject: from `fetch`'s point of view, the server answered, so the request worked. Your code must check `response.ok` (true for statuses 200 to 299) itself. Forgetting that check is the most common `fetch` bug: the code goes on to parse an error page as data. Here the 404 page is HTML, so `json()` threw a `SyntaxError`. Only the unreachable server made `fetch` itself reject, with a `TypeError` whose message tells you almost nothing ("Failed to fetch" in Chromium; other browsers word it differently, and all of them hide the details on purpose). A helper that handles all three cases, and gives each a clear message, pays for itself:

get-json.js

```ts
async function getJson(url) {
  let response;
  try {
    response = await fetch(url, { headers: { Accept: "application/json" } });
  } catch (cause) {
    throw new Error(`Could not reach the server for ${url}`, { cause });
  }
  if (!response.ok) throw new Error(`${url} answered ${response.status}`);
  try {
    return await response.json();
  } catch (cause) {
    throw new Error(`${url} did not return valid JSON`, { cause });
  }
}

for (const url of ["/learn/quiz/browser-dom.json", "/learn/quiz/no-such-lesson.json", "http://127.0.0.1:1/tasks"]) {
  try {
    const data = await getJson(url);
    console.log("loaded", Object.keys(data).join(", "));
  } catch (error) {
    console.log(error.message);
  }
}
```

What the browser terminal prints

```ts
loaded size, pass, questions
/learn/quiz/no-such-lesson.json answered 404
Could not reach the server for http://127.0.0.1:1/tasks
```

### Response objects without a server

`Response` is an ordinary class. You can make one yourself, with any body and status, and `fetch` can read `data:` URLs (the data is inside the address) and `blob:` URLs (data held in the browser's memory). That is useful for tests, and for trying code before the real API exists:

response.js

```ts
const fake = new Response(JSON.stringify([{ id: 1, title: "Buy detergent" }]), {
  status: 200,
  headers: { "Content-Type": "application/json" },
});
console.log(fake.ok, fake.headers.get("content-type"));
console.log(await fake.json());

try {
  await fake.json();
} catch (error) {
  console.log("second read:", error.name);
}

const fromData = await fetch("data:application/json,%7B%22open%22%3A2%7D");
console.log(await fromData.json());

const blob = new Blob(["Invoice total: ₦45,000"], { type: "text/plain" });
console.log(await new Response(blob).text());
```

Output of `node response.js` and of the browser terminal

```ts
true application/json
[ { id: 1, title: 'Buy detergent' } ]
second read: TypeError
{ open: 2 }
Invoice total: ₦45,000
```

A body is a **stream**: it can be read once. The second `json()` call failed because the body was already consumed. If two parts of your code need the body, read it once into a variable, or call `response.clone()` before reading.

## URL and URLSearchParams

Search pages, filters and API calls all build addresses like `/products?q=rice&sort=price`. Building them by gluing strings together breaks as soon as a value contains a character that means something in a URL:

url-bug.js

```ts
const supplier = "Bello & Sons";
const glued = `https://shop.example/products?supplier=${supplier}&page=2`;
const params = new URL(glued).searchParams;
console.log(params.get("supplier"));
console.log([...params.keys()]);
```

Output of `node url-bug.js` and of the browser terminal

```ts
Bello
[ 'supplier', ' Sons', 'page' ]
```

The `&` in the name split the query in two, and the server would search for the supplier "Bello " (with a space) and a strange parameter called " Sons". `URL` and `URLSearchParams` parse and build addresses correctly, encoding every value for you:

url.js

```ts
const url = new URL("https://shop.example/products");
url.searchParams.set("supplier", "Bello & Sons");
url.searchParams.set("q", "rice 5kg");
url.searchParams.append("tag", "grains");
url.searchParams.append("tag", "local");
console.log(url.href);

console.log(url.searchParams.get("supplier"));
console.log(url.searchParams.getAll("tag"));
console.log(url.searchParams.get("page"));

const back = new URL(url.href);
console.log(back.hostname, back.pathname, back.search.length > 0);
console.log(new URL("../orders/17", "https://shop.example/products/rice").href);
```

Output of `node url.js` and of the browser terminal

```ts
https://shop.example/products?supplier=Bello+%26+Sons&q=rice+5kg&tag=grains&tag=local
Bello & Sons
[ 'grains', 'local' ]
null
shop.example /products true
https://shop.example/orders/17
```

- `set` replaces a parameter; `append` adds another value with the same name, and `getAll` reads them all. `get` returns `null` for a missing parameter, and always a string otherwise: `Number(params.get("page") ?? 1)`.
- Spaces become `+` and `&` becomes `%26` in the query, and come back unchanged when you read them.
- `new URL(relative, base)` resolves a relative address the way a link on a page does.

`new URL(text)` throws a `TypeError` for text that is not a URL. When the text comes from a user, check it first with `URL.canParse(text)`, or catch the error, and then check the protocol, as [The DOM](https://zudojs.oyinlola.site/learn/browser-dom#production) warned about `javascript:` links:

url-check.js

```ts
function safeLink(text) {
  if (!URL.canParse(text)) return null;
  const url = new URL(text);
  return url.protocol === "https:" || url.protocol === "http:" ? url.href : null;
}

console.log(safeLink("https://bello-sons.example/catalogue"));
console.log(safeLink("bello-sons.example"));
console.log(safeLink("javascript:alert(document.cookie)"));
```

Output of `node url-check.js` and of the browser terminal

```ts
https://bello-sons.example/catalogue
null
null
```

## Storage: localStorage and sessionStorage

**`localStorage`** keeps small amounts of data in the browser, per **origin** (the combination of protocol, host and port, such as `https://tasks.example`), and keeps it after the tab is closed and the computer restarts. **`sessionStorage`** has the same methods but lasts only as long as the tab. Both are simple key-value stores where keys and values are **strings**:

| Method | What it does |
| --- | --- |
| `setItem(key, value)` | stores `String(value)` under the key |
| `getItem(key)` | returns the string, or `null` if the key is missing |
| `removeItem(key)` | deletes one key |
| `clear()` | deletes *every* key of this origin |

> NOTE
>
> The preview frames on this page share this website's storage, and ZudoJS Academy keeps your lesson progress in `localStorage`. So the examples use keys starting with `academy-demo:` and remove them when they finish. That is a good habit on any site: several scripts share one origin's storage, so give your keys a prefix and never call `clear()` unless you own everything in it.

storage.js

```ts
const KEY = "academy-demo:tasks";

localStorage.setItem("academy-demo:count", 3);
console.log(typeof localStorage.getItem("academy-demo:count"));

localStorage.setItem("academy-demo:task", { id: 1, title: "Buy detergent" });
console.log(localStorage.getItem("academy-demo:task"));

const tasks = [{ id: 1, title: "Buy detergent", due: new Date("2026-10-01T09:00:00Z") }];
localStorage.setItem(KEY, JSON.stringify(tasks));
const restored = JSON.parse(localStorage.getItem(KEY));
console.log(restored[0].title, typeof restored[0].due, restored[0].due);

console.log(localStorage.getItem("academy-demo:nothing-here"));

for (const key of ["academy-demo:count", "academy-demo:task", KEY]) localStorage.removeItem(key);
console.log(localStorage.getItem(KEY));
```

What the browser terminal prints

```ts
string
[object Object]
Buy detergent string 2026-10-01T09:00:00.000Z
null
null
```

Three surprises in five lines. A number comes back as a string. An object is stored as the useless text `[object Object]`, because `setItem` calls `String()` on it. And a `Date` goes through `JSON.stringify` as a string and does not come back as a `Date`. Store JSON, and convert dates back yourself.

### What can go wrong with stored data

Data in storage outlives the code that wrote it, and anyone with access to the browser can edit it in the developer tools. So reading it is reading **untrusted input**: it may be missing, broken, or in last year's format. Writing it can fail too: each origin gets a quota (around 5 MB for `localStorage` in most browsers), and some browsers refuse storage entirely in private modes or when the user disabled it:

storage-fail.js

```ts
localStorage.setItem("academy-demo:tasks", "[{ broken json");
try {
  JSON.parse(localStorage.getItem("academy-demo:tasks"));
} catch (error) {
  console.log("reading:", error.name);
}
localStorage.removeItem("academy-demo:tasks");

try {
  localStorage.setItem("academy-demo:report", "x".repeat(6_000_000));
  console.log("stored 6 million characters");
} catch (error) {
  console.log("writing:", error.name);
} finally {
  localStorage.removeItem("academy-demo:report");
}
```

What the browser terminal prints

```ts
reading: SyntaxError
writing: QuotaExceededError
```

Both failures are exceptions, and an exception at start-up means a blank page. Wrap storage in a small module that catches them, checks what it reads, and falls back to a default. You will build one in the project at the end.

### Keeping tabs in step: the storage event

If Ada has the task list open in two tabs and adds a task in one, the other still shows the old list. When one page changes `localStorage`, the browser fires a **`storage`** event in every *other* page of the same origin, not in the page that made the change. The example opens a second page inside the preview to play the other tab:

storage-event.js

```ts
const otherTab = document.createElement("iframe");
document.body.append(otherTab);
await new Promise((resolve) => {
  otherTab.addEventListener("load", resolve, { once: true });
  otherTab.srcdoc = "<p>Second tab</p>";
});

const heard = new Promise((resolve) => {
  otherTab.contentWindow.addEventListener("storage", (event) => {
    resolve(`other tab: ${event.key} changed from ${event.oldValue} to ${event.newValue}`);
  });
});
let sameTabHeard = false;
window.addEventListener("storage", () => (sameTabHeard = true));

localStorage.setItem("academy-demo:filter", "open");
console.log(await heard);
console.log("this tab heard its own change:", sameTabHeard);
localStorage.removeItem("academy-demo:filter");
```

What the browser terminal prints

```ts
other tab: academy-demo:filter changed from null to open
this tab heard its own change: false
```

> WATCH OUT
>
> Never store passwords, session tokens or API keys in `localStorage`. Any script that runs on your page can read all of it, including an attacker's script injected through an XSS hole like the one in [The DOM](https://zudojs.oyinlola.site/learn/browser-dom#content). Sessions belong in cookies the page's JavaScript cannot read at all, which [Networking from JavaScript](https://zudojs.oyinlola.site/learn/browser-networking#cookies) explains.

For more than a few hundred kilobytes, or for structured data you want to query, browsers offer **IndexedDB**, an asynchronous database in the browser. It is more work to use directly; small libraries such as `idb-keyval` wrap it in a `get`/`set` interface.

## The History API: the view in the address

A **single-page application** (SPA) changes what the page shows without loading a new page from the server. If it does not also change the address, the Back button leaves the app, a reload returns to the start, and a shared link shows the wrong view. The History API fixes that:

- `history.pushState(state, "", url)` adds an entry to the tab's history and changes the address bar to `url`, *without* loading anything. `state` is any data you want back later.
- `history.replaceState(state, "", url)` does the same but replaces the current entry, for changes that should not create a Back step (like each keystroke in a search box).
- When the user presses Back or Forward, the page gets a **`popstate`** event with the entry's `state`. Your code must then show the view for the new address. The browser does not do it for you.

The new URL must have the same origin as the page. That rule shows up in this preview, whose page has no real address of its own (it is an `about:srcdoc` frame):

history.js

```ts
console.log("this page's address:", location.href);

try {
  history.pushState({ filter: "open" }, "", "?filter=open");
} catch (error) {
  console.log(error.name);
}

history.pushState({ filter: "open" }, "");
console.log("state only:", JSON.stringify(history.state));
history.replaceState({ filter: "done" }, "");
console.log("replaced:", JSON.stringify(history.state));

window.addEventListener("popstate", (event) => {
  console.log("popstate, show the view for", JSON.stringify(event.state));
});
window.dispatchEvent(new window.PopStateEvent("popstate", { state: { filter: "all" } }));
```

What the browser terminal prints

```ts
this page's address: about:srcdoc
SecurityError
state only: {"filter":"open"}
replaced: {"filter":"done"}
popstate, show the view for {"filter":"all"}
```

Changing the address of a frame without one is refused with a `SecurityError`; on a normal page served from a web address, the same `pushState` call changes the address bar to `…?filter=open`. Saving only the state works anywhere. The last lines fire `popstate` by hand, because pressing Back inside this preview would also move the lesson page. (Also note: a real `popstate` is not fired by `pushState` itself, only by Back and Forward.)

Because the real calls need a real page, well-designed routing code talks to the history through a small interface. The browser version uses `history` and `location`; tests and non-browser environments use a **memory history**, a list of entries in an array. Routing libraries such as React Router ship both for exactly this reason:

browser-history.js

```ts
// The real version, for a page with its own address.
export function browserHistory(onChange) {
  window.addEventListener("popstate", () => onChange(new URL(location.href)));
  return {
    current: () => new URL(location.href),
    push(url) {
      history.pushState(null, "", url);
      onChange(new URL(location.href));
    },
  };
}
```

router.js

```ts
function memoryHistory(start, onChange) {
  const entries = [new URL(start)];
  let index = 0;
  return {
    current: () => entries[index],
    push(url) {
      entries.splice(index + 1, Infinity, new URL(url, entries[index]));
      index++;
      onChange(entries[index]);
    },
    back() {
      if (index > 0) onChange(entries[--index]);
    },
  };
}

function showTasks(url) {
  const filter = url.searchParams.get("filter") ?? "all";
  console.log(`render ${url.pathname} with filter=${filter}`);
}

const nav = memoryHistory("https://tasks.example/tasks", showTasks);
showTasks(nav.current());
nav.push("?filter=open");
nav.push("/tasks/7");
nav.back();
nav.back();
console.log("address now:", nav.current().href);
```

Output of `node router.js` and of the browser terminal

```ts
render /tasks with filter=all
render /tasks with filter=open
render /tasks/7 with filter=all
render /tasks with filter=open
render /tasks with filter=all
address now: https://tasks.example/tasks
```

`showTasks` reads everything it needs from the URL, so the view can be rebuilt from an address alone. That is the property that makes reloads, Back and shared links work.

## Timers

`setTimeout(fn, ms)` runs a function once, after *at least* `ms` milliseconds. `setInterval(fn, ms)` runs it repeatedly. Both return an id that `clearTimeout` and `clearInterval` use to cancel them. "At least" is the key phrase: the timer puts your function in a queue, and it runs when the main thread is free. The order below is always the same, whatever the timings:

timers.js

```ts
console.log("1. synchronous code runs to the end first");
setTimeout(() => console.log("4. timer (0 ms) runs after the microtasks"), 0);
Promise.resolve().then(() => console.log("3. promise callbacks (microtasks) run next"));
console.log("2. still synchronous");

let reminders = 0;
const id = setInterval(() => {
  reminders++;
  console.log(`reminder ${reminders}: invoice INV-204 is due`);
  if (reminders === 3) clearInterval(id);
}, 20);
```

Output of `node timers.js` and of the browser terminal

```ts
1. synchronous code runs to the end first
2. still synchronous
3. promise callbacks (microtasks) run next
4. timer (0 ms) runs after the microtasks
reminder 1: invoice INV-204 is due
reminder 2: invoice INV-204 is due
reminder 3: invoice INV-204 is due
```

[The event loop](https://zudojs.oyinlola.site/learn/js-event-loop) explains that order in detail. For browser code, remember three facts:

- Busy code delays every timer. A 100 ms timer set before two seconds of calculation fires after two seconds.
- Browsers slow timers down in background tabs, often to once a second or less, to save battery. Never use a timer to measure time; compare timestamps (`Date.now()`, `performance.now()`) instead.
- Every timer and interval you start must be stopped when it is no longer needed; a forgotten `setInterval` in a view that was closed keeps running forever.

## requestAnimationFrame

To animate something smoothly, change it once per screen refresh, just before the browser draws. `requestAnimationFrame(callback)` asks for exactly that: the browser calls `callback` once before the next repaint (usually 60 times a second, more on fast screens), passing a timestamp. Unlike a timer, it pauses automatically in hidden tabs. An animation that must last 300 ms computes its progress from the timestamp, never from a frame count, because the number of frames per second varies from screen to screen:

animate.js

```ts
const bar = document.querySelector("#bar");
const label = document.querySelector("#bar-label");
bar.style.height = "8px";
bar.style.background = "currentColor";

function animateTo(percent, durationMs) {
  return new Promise((resolve) => {
    let start;
    let frames = 0;
    function step(now) {
      start ??= now;
      frames++;
      const progress = Math.min((now - start) / durationMs, 1);
      const value = Math.round(progress * percent);
      bar.style.width = `${value}%`;
      label.textContent = `${value}%`;
      if (progress < 1) requestAnimationFrame(step);
      else resolve(frames);
    }
    requestAnimationFrame(step);
  });
}

const frames = await animateTo(100, 300);
console.log("finished at", bar.style.width, "label", label.textContent);
console.log("used several frames:", frames > 5);
```

What the browser terminal prints

```ts
finished at 100% label 100%
used several frames: true
```

For simple transitions (fading, sliding, changing colour), CSS transitions and the Web Animations API (`element.animate()`) are easier and run even more smoothly. Use `requestAnimationFrame` when JavaScript must compute every frame: drawing on a `<canvas>`, counting up a number, following the pointer. `cancelAnimationFrame(id)` stops a requested frame.

## Web Workers: a second thread

The page's JavaScript runs on one thread, the **main thread**, which also handles clicks, typing, layout and drawing. While your code adds up 100,000 invoices, none of that happens: the page freezes. A **Web Worker** runs a script on a separate thread. It has no access to the DOM; it talks to the page only by sending **messages**, which are copied between the threads with `structuredClone`'s rules. Normally the worker's code lives in its own file (`new Worker("report-worker.js")`). The example builds that file in memory as a `Blob`, so it can run inside the preview:

worker.js

```ts
const workerSource = `
  self.onmessage = (event) => {
    let totalKobo = 0;
    let largest = 0;
    for (const invoice of event.data) {
      totalKobo += invoice.amountKobo;
      largest = Math.max(largest, invoice.amountKobo);
    }
    self.postMessage({ count: event.data.length, totalKobo, largest });
  };
`;
const url = URL.createObjectURL(new Blob([workerSource], { type: "text/javascript" }));
const worker = new Worker(url);

const invoices = Array.from({ length: 100_000 }, (_, i) => ({ id: i + 1, amountKobo: 150_000 + (i % 7) * 25_000 }));
const report = await new Promise((resolve, reject) => {
  worker.onmessage = (event) => resolve(event.data);
  worker.onerror = (event) => reject(new Error(event.message));
  worker.postMessage(invoices);
  console.log("main thread: request sent, still free for clicks");
});

console.log(report);
console.log(`total: ₦${(report.totalKobo / 100).toLocaleString("en-NG")}`);
worker.terminate();
URL.revokeObjectURL(url);
```

What the browser terminal prints

```ts
main thread: request sent, still free for clicks
{ count: 100000, totalKobo: 22499875000, largest: 300000 }
total: ₦224,998,750
```

The "request sent" line was printed before the report came back: the main thread carried on while the worker did the adding. Copying 100,000 objects to the worker is not free either, so workers pay off for work that is heavy compared with the data sent: parsing a large file, resizing images, searching a big list, generating a PDF. [Real-time and background work](https://zudojs.oyinlola.site/learn/browser-realtime#workers) goes further with workers, and they are the browser's version of the worker threads you used in [Events, processes and workers](https://zudojs.oyinlola.site/learn/node-events-processes#workers).

## Before you build: a page that remembers

Now fix Ada's four complaints in one page. The tasks load from "the server" the first time, then live in `localStorage` so a reload keeps them; the filter lives in the URL; and a second tab stays in step through the `storage` event.

REASON IT OUT

### What can the page find in storage?

Before writing the storage code, list what `localStorage.getItem("tasks-app:v1")` can return on a real user's browser, and what the page should do in each case:

- What if it is the first visit?
- What if the saved data was written by last month's version of the app, with a different shape?
- What if it is not valid JSON, or valid JSON of the wrong type (a number, `null`, an object with tasks missing titles)?
- What if `setItem` throws because storage is full or disabled?
- What if the filter in the URL is `?filter=everything`?
- What if another tab saves at the same moment?

**Show the reasoning**

- **First visit**: `null`. Load the starting tasks from the server, then save them.
- **Old version**: store an object with a `version` number, not a bare array. If the version is not the one this code understands, either convert it (a **migration**) or ignore it and reload from the server. Never guess at a shape.
- **Broken or wrong type**: catch the `JSON.parse` error, then check the shape (an array of objects with a numeric `id`, a string `title`, a boolean `done`). Anything else counts as "nothing saved", and the problem is logged.
- **Write fails**: catch it and keep working in memory. Tell the user that changes will not survive a reload, rather than crashing.
- **Unknown filter**: URLs are user input too. Accept only `all`, `open` and `done`, and treat anything else as `all`.
- **Two tabs**: the last write wins. The `storage` event lets the other tab reload the new data, so it does not overwrite a newer list with its old one on its next save. (Merging real conflicts needs a server, which the next lessons add.)

## Build: a task page that remembers

index.html

```ts
<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><title>Ada's jobs</title></head>
<body>
  <nav><a href="?filter=all">All</a> <a href="?filter=open">Open</a> <a href="?filter=done">Done</a></nav>
  <ul id="tasks"></ul>
  <p id="status" role="status"></p>
</body>
</html>
```

remember.js

```ts
const STORAGE_KEY = "academy-demo:tasks-app";
const VERSION = 1;
const FILTERS = ["all", "open", "done"];

// "The server": a JSON file held in memory, served through a blob: URL.
const serverData = [
  { id: 1, title: "Buy detergent", done: false },
  { id: 2, title: "Pay the electricity bill", done: true },
];
const serverUrl = URL.createObjectURL(new Blob([JSON.stringify(serverData)], { type: "application/json" }));

function isTask(t) {
  return t !== null && typeof t === "object" && Number.isInteger(t.id) && typeof t.title === "string" && typeof t.done === "boolean";
}

function createTaskStore(storage, key) {
  return {
    load() {
      let saved;
      try {
        saved = JSON.parse(storage.getItem(key));
      } catch {
        console.log("store: saved data is not JSON, ignoring it");
        return null;
      }
      if (saved === null) return null;
      if (saved.version !== VERSION || !Array.isArray(saved.tasks) || !saved.tasks.every(isTask)) {
        console.log("store: saved data has an unknown shape, ignoring it");
        return null;
      }
      return saved.tasks;
    },
    save(tasks) {
      try {
        storage.setItem(key, JSON.stringify({ version: VERSION, tasks }));
        return true;
      } catch (error) {
        console.log("store: could not save:", error.name);
        return false;
      }
    },
  };
}

function readFilter(url) {
  const filter = url.searchParams.get("filter");
  return FILTERS.includes(filter) ? filter : "all";
}

function render(tasks, filter) {
  const shown = tasks.filter((t) => filter === "all" || (filter === "open") === !t.done);
  document.querySelector("#tasks").replaceChildren(
    ...shown.map((t) => {
      const li = document.createElement("li");
      li.textContent = `${t.done ? "[x]" : "[ ]"} ${t.title}`;
      return li;
    }),
  );
  return shown.map((t) => t.title);
}

async function start(store, url) {
  let tasks = store.load();
  if (tasks === null) {
    const response = await fetch(serverUrl);
    if (!response.ok) throw new Error(`server answered ${response.status}`);
    tasks = await response.json();
    store.save(tasks);
    console.log("loaded", tasks.length, "tasks from the server");
  } else {
    console.log("restored", tasks.length, "tasks from storage");
  }
  return { tasks, shown: render(tasks, readFilter(url)) };
}

const store = createTaskStore(localStorage, STORAGE_KEY);

// Visit 1: nothing saved yet. Ada adds a task.
let page = await start(store, new URL("https://tasks.example/tasks"));
page.tasks.push({ id: 3, title: "Clean the Okafor flat", done: false });
store.save(page.tasks);

// Visit 2: a reload with a shared link that filters to open tasks.
page = await start(store, new URL("https://tasks.example/tasks?filter=open"));
console.log("shown:", page.shown);

// Visit 3: a hand-edited address and a corrupted save.
localStorage.setItem(STORAGE_KEY, JSON.stringify({ version: 1, tasks: [{ id: "one" }] }));
page = await start(store, new URL("https://tasks.example/tasks?filter=everything"));
console.log("shown:", page.shown);

// Storage that refuses every write, like a full disk or a locked-down browser.
const full = createTaskStore({ getItem: () => null, setItem() { throw new DOMException("full", "QuotaExceededError"); } }, STORAGE_KEY);
page = await start(full, new URL("https://tasks.example/tasks?filter=done"));
console.log("shown:", page.shown);

localStorage.removeItem(STORAGE_KEY);
URL.revokeObjectURL(serverUrl);
```

What the browser terminal prints

```ts
loaded 2 tasks from the server
restored 3 tasks from storage
shown: [ 'Buy detergent', 'Clean the Okafor flat' ]
store: saved data has an unknown shape, ignoring it
loaded 2 tasks from the server
shown: [ 'Buy detergent', 'Pay the electricity bill' ]
store: could not save: QuotaExceededError
loaded 2 tasks from the server
shown: [ 'Pay the electricity bill' ]
```

What the page now survives:

- **Reload**: the second visit restored three tasks, including the one Ada added, and never asked the server again.
- **Shared link**: the filter came from the URL, so the link showed only open tasks.
- **Bad input**: the corrupted save was ignored and replaced from the server; `?filter=everything` fell back to `all`.
- **No storage**: the page still loaded and worked; the failed save was reported, not thrown.

The storage module takes the storage object as a parameter (`createTaskStore(localStorage, key)`) instead of reaching for the global. That is what made the "full disk" case a two-line test with a fake object. To finish the job in the real page, the filter links call `history.pushState` and re-render instead of reloading, a `popstate` listener re-renders on Back, and a `storage` listener calls `store.load()` and re-renders when another tab saves.

## When browser API code fails

- **Treating a 404 as data.** `fetch` only rejects when there is no response. Check `response.ok` every time, or use a helper like `getJson`.
- **Reading a body twice.** The second read throws. Read once, or `clone()` first.
- **Building URLs with template strings.** A value with `&`, `#`, `?` or a space breaks the query or changes its meaning. Use `URLSearchParams`.
- **Trusting storage.** A parse error or an old shape at start-up gives a blank page. Validate, version, and fall back.
- **Storing secrets.** Tokens in `localStorage` are one XSS bug away from being stolen.
- **Forgetting `popstate`.** `pushState` changes the address, but Back then changes it again and nothing re-renders, so the address and the page disagree.
- **Timers for timing.** Counting interval ticks to measure time drifts, and stops in background tabs. Use timestamps.
- **Heavy work on the main thread.** Anything that takes more than about 50 ms makes the page feel stuck. Split it up or move it to a worker.

## Testing code that uses browser APIs

The build shows the main technique: **pass the API in** instead of reaching for the global. A function that takes a `storage`, a `fetch` function or a history object can be tested with simple fakes:

- A fake `fetch` is a function that returns `new Response(…)` with whatever status and body the test needs, including 500s and broken JSON. Libraries such as MSW (Mock Service Worker) intercept real `fetch` calls at the network level for bigger test suites.
- A fake storage is an object with `getItem` and `setItem`, which can also throw on purpose.
- A memory history replaces `history` and `location`.
- Fake timers (`vi.useFakeTimers()` in Vitest) let a test jump over a debounce or an interval instantly.

Keep the thin layer that touches the real globals small, and check it with a few tests in a real browser.

## In production

- **Storage limits and eviction.** Quotas differ between browsers, and a browser short of disk space may delete a site's data, especially for sites the user rarely visits. `navigator.storage.persist()` asks to keep it. Treat browser storage as a cache of data that lives on a server, unless losing it is acceptable.
- **Private browsing and partitioning.** Private windows throw storage away when they close. Browsers also partition storage for embedded third-party frames, so an iframe from another site sees different storage than the same site opened directly.
- **Versions.** Once real users have data stored, the shape is a contract. Change it only with a version number and a migration.
- **Performance.** `localStorage` is synchronous and blocks the main thread while it reads and writes; keep what you store small and do not write on every keystroke (debounce saves). Offload heavy computation to workers, and animate with CSS or `requestAnimationFrame`.
- **Offline.** **Service workers**, a special kind of worker that sits between the page and the network, together with the Cache API, let a site load and work without a connection. They are the basis of installable web apps.

## Practice

TRY IT YOURSELF

### Build a search address

Write `searchUrl(base, filters)` that returns the address for a product search. `filters` has optional `q` (text), `tags` (an array), `maxPriceKobo` (a number) and `page` (a number, left out when it is 1). Leave out empty values.

**Show a solution**

search-url.js

```ts
function searchUrl(base, { q, tags = [], maxPriceKobo, page = 1 } = {}) {
  const url = new URL("/search", base);
  if (q?.trim()) url.searchParams.set("q", q.trim());
  for (const tag of tags) url.searchParams.append("tag", tag);
  if (maxPriceKobo !== undefined) url.searchParams.set("max", String(maxPriceKobo));
  if (page !== 1) url.searchParams.set("page", String(page));
  return url.href;
}

console.log(searchUrl("https://shop.example", { q: " palm oil ", tags: ["local", "5L & up"], page: 2 }));
console.log(searchUrl("https://shop.example/products/rice", { q: "", maxPriceKobo: 900_000 }));
console.log(searchUrl("https://shop.example"));
```

Output of `node search-url.js` and of the browser terminal

```ts
https://shop.example/search?q=palm+oil&tag=local&tag=5L+%26+up&page=2
https://shop.example/search?max=900000
https://shop.example/search
```

`new URL("/search", base)` starts from the site's root whatever page `base` points to. The tag containing `&` is encoded as `%26`, so it stays one value.

TRY IT YOURSELF

### A storage helper that never throws

Write `readJson(storage, key, fallback)` and `writeJson(storage, key, value)`. Reading returns `fallback` when the key is missing or holds invalid JSON; writing returns `true` or `false` instead of throwing. Test them with a fake storage object.

**Show a solution**

safe-storage.js

```ts
function readJson(storage, key, fallback) {
  try {
    const text = storage.getItem(key);
    return text === null ? fallback : JSON.parse(text);
  } catch {
    return fallback;
  }
}

function writeJson(storage, key, value) {
  try {
    storage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

const data = new Map([["prefs", '{"theme":"dark"}'], ["broken", "{oops"]]);
const fakeStorage = {
  getItem: (key) => data.get(key) ?? null,
  setItem(key, value) {
    if (value.length > 20) throw new Error("QuotaExceededError");
    data.set(key, value);
  },
};

console.log(readJson(fakeStorage, "prefs", {}));
console.log(readJson(fakeStorage, "broken", { theme: "light" }));
console.log(readJson(fakeStorage, "missing", []));
console.log(writeJson(fakeStorage, "cart", { rice: 2 }));
console.log(writeJson(fakeStorage, "cart", { rice: 2, garri: 1, palmOil: 3 }));
console.log(readJson(fakeStorage, "cart", null));
```

Output of `node safe-storage.js` and of the browser terminal

```json
{ theme: 'dark' }
{ theme: 'light' }
[]
true
false
{ rice: 2 }
```

The fake storage made both failures easy to produce. In the browser you would call `readJson(localStorage, "tasks-app:prefs", {})`. A real app would also validate the shape of what `readJson` returns, as the build did.

TRY IT YOURSELF

### Count up a total

A checkout page shows the order total counting up from ₦0 to the final amount in 400 ms. Write `countUp(element, totalKobo, durationMs)` with `requestAnimationFrame`, so the last frame always shows the exact total.

**Show a solution**

count-up.js

```ts
const naira = (kobo) => `₦${(kobo / 100).toLocaleString("en-NG", { minimumFractionDigits: 2 })}`;

function countUp(element, totalKobo, durationMs) {
  return new Promise((resolve) => {
    let start;
    requestAnimationFrame(function step(now) {
      start ??= now;
      const progress = Math.min((now - start) / durationMs, 1);
      element.textContent = naira(Math.round(totalKobo * progress));
      if (progress < 1) requestAnimationFrame(step);
      else resolve();
    });
  });
}

const label = document.querySelector("#bar-label");
await countUp(label, 4_530_050, 400);
console.log(label.textContent);
```

What the browser terminal prints

```ts
₦45,300.50
```

Because progress is capped at 1 and the last frame uses it, the final value is exactly the total, not one step short. Money stays in kobo until the moment it is formatted.

## Summary

- Web APIs are what the browser (the host) adds to JavaScript: DOM, network, storage, history, timers, workers and more. Detect features before using newer ones. Many also exist in Node.js.
- `fetch` resolves when headers arrive and rejects only when no response arrived. Check `response.ok`, read the body once, and handle broken JSON.
- Build and read addresses with `URL` and `URLSearchParams`; values are encoded for you and always come back as strings.
- `localStorage` stores strings per origin, permanently; `sessionStorage` per tab. Store versioned JSON, validate what you read, catch write failures, prefix your keys, and never store secrets. The `storage` event tells other tabs about changes.
- `pushState` and `replaceState` change the address without a reload; `popstate` tells you about Back and Forward. Render from the URL.
- Timers run after *at least* their delay; use timestamps to measure time. Animate with `requestAnimationFrame` and time-based progress.
- Web Workers run code on another thread and talk by messages; use them for heavy work that would freeze the page.

Next: [Networking from JavaScript](https://zudojs.oyinlola.site/learn/browser-networking), where the page talks to the real Task API you built with Node.js, and meets headers, cookies and CORS.

## Test yourself

Five questions, picked at random from this lesson's question bank. Some ask you to choose an answer, some to predict what code prints, and some to write code and run it in the terminal. Get 4 of 5 right to pass. If you don't, read the explanations and try again: you get 5 different questions.
