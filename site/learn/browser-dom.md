---
title: "The DOM — ZudoJS Academy"
description: "Read and change a web page from JavaScript: find, create, update and remove elements safely, avoid innerHTML XSS, and build a task list UI rendered from data."
source: https://zudojs.oyinlola.site/learn/browser-dom
---

LEVEL 4 · LESSON 10 OF 20

JavaScript in the browser Core

# The DOM

Read and change a web page from JavaScript: find, create, update and remove elements safely, avoid innerHTML XSS, and build a task list UI rendered from data.

- **50 min** to read and try
- **You need:** JavaScript fundamentals, Recursion and the Advanced JavaScript lessons on this and prototypes
- **You build:** A task list UI rendered from an array of tasks with a template, safe against HTML injection, with checks that read the page back

  [Test yourself](#test)

BY THE END OF THIS LESSON YOU CAN

- Explain how a browser turns HTML into a tree of nodes, and tell nodes from elements
- Find elements with selectors and move around the tree without tripping over text nodes
- Create, update, move and remove elements, and choose between attributes and properties
- Put user text on a page without opening an XSS hole
- Render a list from data with a template and a DocumentFragment, and check the result by reading the page back

## A page that has to change

Ada runs a small cleaning business and keeps her jobs in a task app. The server sends the page as HTML: a heading, a list of three tasks and a line that says how many there are. Then Ada types a new task and presses Enter. The server's HTML cannot change by itself: it was sent once, as text, and the browser has already read it. Yet the new task has to appear, straight away, without reloading the page.

Something between the HTML text and the pixels on the screen must be changeable from JavaScript. That something is the **DOM**, the **Document Object Model**: a tree of JavaScript objects that the browser builds from the HTML, one object for every element and every piece of text. The browser draws the screen from this tree, not from the HTML text. Change the tree, and the screen follows.

Here is Ada's page. Every example in this lesson runs against a real page like it, in a preview frame that appears when you press *Run in browser*:

index.html

```ts
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>Ada's jobs</title>
  <base href="https://tasks.example/">
</head>
<body>
  <main id="app">
    <h1>Today</h1>
    <!-- the server rendered these three tasks -->
    <ul id="tasks" class="task-list">
      <li class="task" data-id="1">Buy detergent</li>
      <li class="task done" data-id="2">Pay the electricity bill</li>
      <li class="task" data-id="3">Clean the Okafor flat</li>
    </ul>
    <p class="summary">3 tasks</p>
    <a id="history" href="jobs/2026?view=list">All jobs</a>
  </main>
</body>
</html>
```

This program adds a fourth task to the tree:

add-task.js

```ts
const list = document.querySelector("#tasks");

const item = document.createElement("li");
item.textContent = "Collect keys from Mrs Bello";
list.append(item);

console.log("items in the list:", list.children.length);
console.log("summary says:", document.querySelector(".summary").textContent);
```

What the browser terminal prints

```ts
items in the list: 4
summary says: 3 tasks
```

The new task shows up in the preview. But look at the second line: the summary still says "3 tasks". The page now contradicts itself. Nothing in the DOM knows that the summary is *about* the list; each element is just an object in a tree. Keeping every part of the page in step with your data is the real work of browser code, and this lesson ends with a design that makes it easy: keep the tasks in an array, and **render** the page from that array every time it changes.

On the way you will learn how the tree is built, how to find things in it, how to change it safely (one wrong property turns a task title into an attack), and how to change a lot of it at once without making the browser do the same work many times.

## The document is a tree of nodes

When the browser receives HTML, it **parses** it: it reads the text from start to end and builds the tree. Every element becomes an object; the text between tags becomes objects too. The global `document` is the root of the tree. The top of Ada's page looks like this:

```ts
document
└── html
    ├── head
    │   ├── meta
    │   ├── title ── "Ada's jobs"
    │   └── base
    └── body
        └── main#app
            ├── "⏎  "                 (text: just whitespace)
            ├── h1 ── "Today"
            ├── "⏎  "
            ├── <!-- comment -->
            ├── "⏎  "
            ├── ul#tasks
            │   ├── "⏎  "
            │   ├── li ── "Buy detergent"
            │   └── …
            └── …
```

Part of the DOM tree for Ada's page. Every box is a node; only some nodes are elements.

Every object in the tree is a **node**. There are several kinds, and each has a number in `nodeType`:

| Kind | `nodeType` | Example |
| --- | --- | --- |
| Element node | 1 | `<li>`, `<ul>`: anything with a tag |
| Text node | 3 | The words inside an element, *and the line breaks and spaces between tags* |
| Comment node | 8 | `<!-- … -->` |
| Document node | 9 | `document` itself |

An **element** is a node that came from a tag. The difference matters because the whitespace you use to indent HTML becomes text nodes. This walks the tree recursively (the technique from [Recursion](https://zudojs.oyinlola.site/learn/js-recursion)) and prints every node under `#app`:

walk.js

```ts
function describe(node) {
  if (node.nodeType === Node.ELEMENT_NODE) return `<${node.tagName.toLowerCase()}>`;
  if (node.nodeType === Node.TEXT_NODE) {
    return node.textContent.trim() === "" ? "(whitespace)" : JSON.stringify(node.textContent);
  }
  if (node.nodeType === Node.COMMENT_NODE) return "<!-- comment -->";
  return node.nodeName;
}

function walk(node, depth = 0) {
  console.log("  ".repeat(depth) + describe(node));
  for (const child of node.childNodes) walk(child, depth + 1);
}

walk(document.querySelector("#tasks"));

const app = document.querySelector("#app");
console.log("childNodes of #app:", app.childNodes.length, "children of #app:", app.children.length);
```

What the browser terminal prints

```ts
<ul>
  (whitespace)
  <li>
    "Buy detergent"
  (whitespace)
  <li>
    "Pay the electricity bill"
  (whitespace)
  <li>
    "Clean the Okafor flat"
  (whitespace)
childNodes of #app: 11 children of #app: 4
```

`childNodes` gives *every* child node, whitespace included; `children` gives only the element children. `#app` has 4 elements (`h1`, `ul`, `p`, `a`) but 11 nodes. Most of the time you want elements, so most of the time you want the properties with `Element` in their name, which you will meet in the section on moving around the tree.

Each node is an object made from a class, and the classes form a prototype chain, as you saw in [Prototypes in depth](https://zudojs.oyinlola.site/learn/js-prototypes). An `<li>` is an `HTMLLIElement`, which is an `HTMLElement`, which is an `Element`, which is a `Node`, which is an `EventTarget`. That is why every element has `textContent` (from `Node`), `querySelector` (from `Element`) and `addEventListener` (from `EventTarget`):

chain.js

```ts
const li = document.querySelector("li");
const chain = [];
for (let proto = Object.getPrototypeOf(li); proto; proto = Object.getPrototypeOf(proto)) {
  chain.push(proto.constructor.name);
}
console.log(chain.join(" -> "));
console.log(li instanceof HTMLElement, li instanceof Node, li instanceof EventTarget);
```

What the browser terminal prints

```ts
HTMLLIElement -> HTMLElement -> Element -> Node -> EventTarget -> Object
true true true
```

> NOTE
>
> The DOM is not part of JavaScript. It is a **Web API**: an interface the browser gives to JavaScript, specified by the WHATWG DOM and HTML standards. Node.js runs the same JavaScript language without a `document`, which is why these examples only run in the browser. [Browser APIs](https://zudojs.oyinlola.site/learn/browser-apis) looks at the other Web APIs.

## Finding elements

Before you can change an element you need a reference to it. The modern tools take a **CSS selector**, the same pattern language you use in stylesheets:

- `document.querySelector(selector)` returns the *first* matching element, or `null`.
- `document.querySelectorAll(selector)` returns *all* matches as a `NodeList`, which you can loop over with `for...of` or turn into an array with `[...list]`.
- `document.getElementById(id)` is the older, direct way to find one element by its `id`.

Both query methods also exist on every element, and then they search only inside that element:

find.js

```ts
const titles = (elements) => [...elements].map((el) => el.textContent);

console.log(document.querySelector("li").textContent);
console.log(titles(document.querySelectorAll("li.task:not(.done)")));
console.log(titles(document.querySelectorAll('[data-id="3"]')));
console.log(document.getElementById("tasks") === document.querySelector("#tasks"));

const list = document.querySelector("#tasks");
console.log(list.querySelectorAll("li").length, document.querySelectorAll("*").length);
console.log(document.querySelector(".invoice"));
```

What the browser terminal prints

```ts
Buy detergent
[ 'Buy detergent', 'Clean the Okafor flat' ]
[ 'Clean the Okafor flat' ]
true
3 14
null
```

The last line is the one that bites. `querySelector` returns `null` when nothing matches, and the very next line, `.textContent` on `null`, throws a `TypeError`. A typo in a selector, or an element that another script removed, fails far away from its cause. For elements your page cannot work without, fail loudly and early with a helper that names the selector:

must-find.js

```ts
function mustFind(selector, root = document) {
  const el = root.querySelector(selector);
  if (el === null) throw new Error(`Page is missing ${selector}`);
  return el;
}

console.log(mustFind("#tasks").id);
try {
  mustFind("#task").textContent;
} catch (error) {
  console.log(error.message);
}
try {
  document.querySelector("#task").textContent;
} catch (error) {
  console.log(error.name + ": " + error.message);
}
```

What the browser terminal prints

```ts
tasks
Page is missing #task
TypeError: Cannot read properties of null (reading 'textContent')
```

Two more selector methods help when you already have an element: `el.matches(selector)` asks "does this element match?", and `el.closest(selector)` walks *up* from the element (starting with itself) and returns the first ancestor that matches. `closest` is the key to event delegation in [the next lesson](https://zudojs.oyinlola.site/learn/browser-events).

closest.js

```ts
const bill = document.querySelector('[data-id="2"]');
console.log(bill.matches(".done"), bill.matches(".task:not(.done)"));
console.log(bill.closest("ul").id, bill.closest("main").id);
console.log(bill.closest("form"));
```

What the browser terminal prints

```ts
true false
tasks app
null
```

### Live and static collections

`querySelectorAll` returns a **static** list: a snapshot of the matches at the moment you called it. The older `getElementsByClassName` and `getElementsByTagName` return a **live** `HTMLCollection` that updates itself whenever the document changes. Watch both after a fourth task is added:

live.js

```ts
const live = document.getElementsByClassName("task");
const snapshot = document.querySelectorAll(".task");

const item = document.createElement("li");
item.className = "task";
item.textContent = "Order new mop heads";
document.querySelector("#tasks").append(item);

console.log("live:", live.length, "snapshot:", snapshot.length);
```

What the browser terminal prints

```ts
live: 4 snapshot: 3
```

A live collection sounds convenient, and it causes one of the classic DOM bugs, which you will see in [When DOM code fails](#failures). Prefer `querySelectorAll`: a snapshot never changes under your feet.

## Moving around the tree

From any node you can reach its relatives. There are two sets of properties, and the difference is the whitespace you saw earlier:

| Any node (includes text) | Elements only |
| --- | --- |
| `parentNode` | `parentElement` |
| `childNodes` | `children` |
| `firstChild`, `lastChild` | `firstElementChild`, `lastElementChild` |
| `nextSibling`, `previousSibling` | `nextElementSibling`, `previousElementSibling` |

traverse.js

```ts
const list = document.querySelector("#tasks");
const first = list.firstElementChild;

console.log(JSON.stringify(list.firstChild.textContent));
console.log(first.textContent);
console.log(first.nextElementSibling.textContent);
console.log(JSON.stringify(first.nextSibling.textContent));
console.log(list.lastElementChild.dataset.id, list.parentElement.id);
console.log(list.previousElementSibling.nodeName, list.nextElementSibling.className);
```

What the browser terminal prints

```ts
"\n      "
Buy detergent
Pay the electricity bill
"\n      "
3 app
H1 summary
```

`firstChild` is the line break and indentation after `<ul>`, not the first task. If code that worked yesterday breaks after someone reformats the HTML, look for a `firstChild` or `nextSibling` that should have been the `Element` version. Better still, don't depend on the exact shape of the tree: find elements by selector, with `closest` and `querySelector`, so that adding a wrapper `<div>` later breaks nothing.

## Reading and changing content

Three properties read and write what is inside an element:

- `textContent`: all the text inside, as plain text. Setting it replaces every child with a single text node. Whatever string you give it is shown as text, even if it looks like HTML.
- `innerHTML`: the inside as an HTML string. Setting it makes the browser *parse* your string as HTML and build new elements from it.
- `innerText`: like `textContent`, but it follows the CSS: it leaves out hidden text and adds line breaks where the layout has them. It has to ask the browser how the page is laid out, which makes it slower. Use `textContent` unless you really want "the text as the user sees it".

content.js

```ts
const summary = document.querySelector(".summary");
summary.textContent = "4 tasks <b>today</b>";
console.log(summary.textContent);
console.log(summary.innerHTML);
console.log(summary.children.length);

summary.innerHTML = "4 tasks <b>today</b>";
console.log(summary.textContent);
console.log(summary.children.length, summary.firstElementChild.tagName);
```

What the browser terminal prints

```ts
4 tasks <b>today</b>
4 tasks &lt;b&gt;today&lt;/b&gt;
0
4 tasks today
1 B
```

With `textContent`, the angle brackets are just characters: `innerHTML` shows them escaped as `&lt;` and `&gt;`, and no `<b>` element exists. With `innerHTML`, the browser built a real `<b>` element. That difference is harmless for a string you wrote. It is dangerous for a string a *user* wrote.

### innerHTML and XSS

Task titles come from users. Suppose someone saves a task with this title. It looks like a broken image tag, and it contains a small program in its `onerror` attribute:

xss.js

```ts
const title = `Fix sink <img src="data:," onerror="window.stolen = 'attacker code ran'">`;

const list = document.querySelector("#tasks");
list.innerHTML += `<li class="task">${title}</li>`;

const img = list.querySelector("img");
await new Promise((resolve) => img.addEventListener("error", resolve));
console.log("images in the list:", list.querySelectorAll("img").length);
console.log(window.stolen);
```

What the browser terminal prints

```ts
images in the list: 1
attacker code ran
```

The browser parsed the title as HTML, created a real `<img>`, failed to load the empty image, and ran the attacker's `onerror` code, in your page, with your page's permissions. This is **cross-site scripting** (**XSS**): an attacker gets their script to run on your site. Here it only set a variable. A real one would read the user's data, send requests as the logged-in user, or replace the login form with one that sends the password elsewhere. Every other user who opens the task list runs it too.

The fix costs nothing: put user text in with `textContent`, on an element you created yourself:

safe.js

```ts
const title = `Fix sink <img src="data:," onerror="window.stolen = 'attacker code ran'">`;

const li = document.createElement("li");
li.className = "task";
li.textContent = title;
document.querySelector("#tasks").append(li);

console.log("images in the list:", document.querySelectorAll("#tasks img").length);
console.log(li.textContent === title);
console.log(window.stolen);
```

What the browser terminal prints

```ts
images in the list: 0
true
undefined
```

The title is stored exactly as the user typed it, shown exactly as they typed it, and nothing runs. Remember the rule as: **data goes in with `textContent` (or `value`, or `setAttribute`), never with `innerHTML`**. `innerHTML` is fine only for HTML you wrote yourself, with no user data in it. Two kinds of attribute are exceptions to the `setAttribute` part: event-handler attributes such as `onclick` run their value as code, and URL attributes such as `href` and `src` accept `javascript:` addresses. Never let user data choose an event attribute, and check a user-supplied URL before you use it, as [Browser APIs](https://zudojs.oyinlola.site/learn/browser-apis#urls) does.

> WATCH OUT
>
> A `<script>` tag inserted with `innerHTML` does not run, which makes people think `innerHTML` is safe. It is not: event-handler attributes such as `onerror` and `onload` run, as you just saw. The same goes for `insertAdjacentHTML`, `outerHTML` and `document.write`. [Browser attacks and defences](https://zudojs.oyinlola.site/learn/sec-web) covers XSS in full, including Content Security Policy, a response header that tells the browser to refuse inline scripts like this one.

Sometimes you really do need to build HTML as a string, for example in a server-side template. Then every piece of data must be **escaped**: the five characters that mean something in HTML are replaced by their entity names:

escape.js

```ts
function escapeHtml(text) {
  return String(text)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

const title = `Fix sink <img src="data:," onerror="alert(1)">`;
const li = document.querySelector("li");
li.innerHTML = `<span class="title">${escapeHtml(title)}</span>`;

console.log(li.querySelector(".title").textContent === title);
console.log(li.querySelectorAll("img").length);
console.log(escapeHtml(`Bello & Sons' "deluxe" <clean>`));
```

What the browser terminal prints

```ts
true
0
Bello &amp; Sons&#39; &quot;deluxe&quot; &lt;clean&gt;
```

The `&` must be replaced first; otherwise the `&` in `&lt;` would be escaped a second time. That kind of ordering detail is why hand-written escaping is a last resort, and `textContent` is the default.

## Creating, inserting, moving and removing

`document.createElement(tag)` makes a new element that is not in the page yet. It appears only when you insert it. The modern insertion methods accept elements and strings (strings become text nodes, never HTML), and several at once:

| Method | Where the new nodes go |
| --- | --- |
| `parent.append(…nodes)` | at the end, inside `parent` |
| `parent.prepend(…nodes)` | at the start, inside `parent` |
| `el.before(…nodes)` / `el.after(…nodes)` | just before or after `el`, as its siblings |
| `el.replaceWith(…nodes)` | in place of `el` |
| `parent.replaceChildren(…nodes)` | replaces all of `parent`'s children |
| `el.remove()` | takes `el` out of the page |

insert.js

```ts
const list = document.querySelector("#tasks");
const titles = () => [...list.children].map((li) => li.textContent).join(" | ");

function taskItem(title) {
  const li = document.createElement("li");
  li.className = "task";
  li.textContent = title;
  return li;
}

list.prepend(taskItem("Urgent: return the Adeyemi deposit"));
list.querySelector('[data-id="2"]').after(taskItem("File the receipt"));
list.querySelector('[data-id="3"]').remove();
console.log(titles());

const first = list.firstElementChild;
list.append(first);
console.log(titles());
console.log(list.children.length);
```

What the browser terminal prints

```ts
Urgent: return the Adeyemi deposit | Buy detergent | Pay the electricity bill | File the receipt
Buy detergent | Pay the electricity bill | File the receipt | Urgent: return the Adeyemi deposit
4
```

The last three lines show something surprising: `append` on an element that is already in the page *moves* it. A node can only be in one place, so inserting it somewhere removes it from where it was. To have a copy, clone it: `el.cloneNode(true)` copies the element and everything inside it (`false` copies only the element itself).

A removed element is not destroyed. It is an ordinary object: as long as a variable refers to it, you can inspect it and insert it again. It is garbage-collected only once nothing refers to it any more.

## Attributes and properties

In the HTML, `class="task done"` and `data-id="2"` are **attributes**: name and text value pairs written in the tag. On the element object, there are **properties**: normal JavaScript properties such as `li.className` or `input.value`. For many attributes the browser keeps a matching property in sync, which makes them look like the same thing. They are not, and three differences cause real bugs.

### 1. Properties have types; attributes are always strings

`getAttribute` returns the text from the tag, or `null` if it is missing. Properties are converted into something useful: `href` becomes a full address, resolved against the page's base URL, and boolean attributes such as `hidden`, `disabled` and `checked` become `true` or `false`:

attr-types.js

```ts
const link = document.querySelector("#history");
console.log(link.getAttribute("href"));
console.log(link.href);

const summary = document.querySelector(".summary");
console.log(summary.hidden, summary.getAttribute("hidden"));
summary.hidden = true;
console.log(summary.hidden, JSON.stringify(summary.getAttribute("hidden")));
summary.setAttribute("hidden", "false");
console.log(summary.hidden);
```

What the browser terminal prints

```ts
jobs/2026?view=list
https://tasks.example/jobs/2026?view=list
false null
true ""
true
```

The last line is the trap: a boolean attribute is on when it is *present*, whatever its value. `hidden="false"` hides the element. To switch it off, use the property (`summary.hidden = false`) or `removeAttribute("hidden")`.

### 2. Form values: the attribute is the starting value

For an `<input>`, the `value` attribute is the *default* value from the HTML. The `value` property is what is in the box right now, including whatever the user typed. Typing changes the property, never the attribute:

index.html

```ts
<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><title>New task</title></head>
<body>
  <form id="new-task">
    <label>Title <input name="title" value="Buy detergent"></label>
    <label><input type="checkbox" name="urgent"> Urgent</label>
  </form>
</body>
</html>
```

value.js

```ts
const input = document.querySelector('input[name="title"]');
input.value = "Buy detergent and gloves";

console.log("property:", input.value);
console.log("attribute:", input.getAttribute("value"));
console.log("defaultValue:", input.defaultValue);

const urgent = document.querySelector('input[name="urgent"]');
urgent.checked = true;
console.log(urgent.checked, urgent.hasAttribute("checked"));

document.querySelector("#new-task").reset();
console.log("after reset:", input.value, urgent.checked);
```

What the browser terminal prints

```ts
property: Buy detergent and gloves
attribute: Buy detergent
defaultValue: Buy detergent
true false
after reset: Buy detergent false
```

Read what the user entered from `input.value` and `checkbox.checked`. Reading `getAttribute("value")` is a common bug: it always returns what the HTML said, so a form handler that uses it ignores everything the user typed.

### 3. class and data-* have their own tools

`class` is a reserved word in JavaScript, so the property is `className` (the whole string). Better is `classList`, which adds, removes and toggles one class without touching the others. Custom `data-*` attributes, the standard place to keep small bits of data on an element such as a task's id, appear on `dataset`, with the name after `data-` turned into camelCase. Their values are always strings:

classes-data.js

```ts
const li = document.querySelector('[data-id="1"]');

li.classList.add("urgent");
li.classList.toggle("done");
console.log(li.className, li.classList.contains("done"));

console.log(li.dataset.id, typeof li.dataset.id);
li.dataset.dueDate = "2026-10-01";
console.log(li.getAttribute("data-due-date"));
console.log(li.outerHTML);
```

What the browser terminal prints

```ts
task urgent done true
1 string
2026-10-01
<li class="task urgent done" data-id="1" data-due-date="2026-10-01">Buy detergent</li>
```

`dataset.id` is the string `"1"`, not the number 1. When you look a task up by the id stored on its element, convert it first (`Number(li.dataset.id)`), or `tasks.find((t) => t.id === li.dataset.id)` will never find anything. `outerHTML` is the element itself as HTML, handy for seeing what your code really produced.

Style works the same way: `el.style.color = "red"` sets an inline style, one property at a time. Prefer toggling a class and keeping the looks in CSS; the stylesheet stays the one place that decides how a "done" task looks, and your code only says *that* it is done.

## Changing many things at once

Every change to the page's tree can make the browser recalculate styles, work out where everything goes (**layout**) and draw the result again (**paint**). Browsers are clever about waiting until your code has finished before they draw, but you can still make them do far more work than needed. You can see how many separate changes a piece of code makes with a `MutationObserver`, a Web API that records changes to a part of the tree. Here, three tasks are added one at a time, then three more in one go with a **`DocumentFragment`**: a lightweight container node that is not part of the page:

fragment.js

```ts
const list = document.querySelector("#tasks");
const observer = new MutationObserver(() => {});
observer.observe(list, { childList: true });

function taskItem(title) {
  const li = document.createElement("li");
  li.className = "task";
  li.textContent = title;
  return li;
}

for (const title of ["Wash windows", "Mop kitchen", "Dust shelves"]) {
  list.append(taskItem(title));
}
console.log("one at a time:", observer.takeRecords().length, "changes");

const fragment = document.createDocumentFragment();
for (const title of ["Iron curtains", "Empty bins", "Water plants"]) {
  fragment.append(taskItem(title));
}
console.log("fragment holds", fragment.childNodes.length, "items");
list.append(fragment);
console.log("with a fragment:", observer.takeRecords().length, "change");
console.log("fragment now holds", fragment.childNodes.length, "items; list has", list.children.length);
observer.disconnect();
```

What the browser terminal prints

```ts
one at a time: 3 changes
fragment holds 3 items
with a fragment: 1 change
fragment now holds 0 items; list has 9
```

When you insert a fragment, its children move into the page in a single operation and the fragment is left empty. Build a list of any size off the page, in a fragment, then insert it once. `parent.append(a, b, c)` and `replaceChildren(…)` with several nodes do the same thing internally.

A second habit matters even more: don't mix *reading* layout with *writing* to the page inside a loop. Properties such as `offsetHeight`, `getBoundingClientRect()` and `innerText` need an up-to-date layout. If you changed the page just before, the browser has to calculate the layout right then, and doing that once per loop turn (called **layout thrashing**) can make a page stutter. Read everything first, then write everything.

## Templates

A task row is not one element but several: a checkbox, the title, a delete button. Building that with `createElement` line by line is long and hides what the row looks like. A **`<template>`** element holds HTML that the browser parses but does not show, does not run, and does not include in searches of the page. You clone its content each time you need a row, then fill in the data with `textContent`:

index.html

```ts
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>Ada's jobs</title>
</head>
<body>
  <main id="app">
    <h1>Today</h1>
    <p class="error" role="alert" hidden></p>
    <ul id="tasks" class="task-list"></ul>
    <p class="summary" aria-live="polite"></p>
  </main>
  <template id="task-row">
    <li class="task">
      <label><input type="checkbox" class="toggle"> <span class="title"></span></label>
      <button type="button" class="delete">Delete</button>
    </li>
  </template>
</body>
</html>
```

app.css

```ts
body { font-family: system-ui, sans-serif; margin: 1rem; }
.task-list { list-style: none; padding: 0; }
.task { display: flex; justify-content: space-between; gap: 0.5rem; padding: 0.4rem 0; border-bottom: 1px solid #ddd; }
.task.done .title { text-decoration: line-through; color: #666; }
.error { color: #b00020; }
```

template.js

```ts
const template = document.querySelector("#task-row");
console.log(template.content.constructor.name);
console.log("rows in the page:", document.querySelectorAll(".task").length);

const row = template.content.firstElementChild.cloneNode(true);
row.querySelector(".title").textContent = "Buy detergent";
row.classList.add("done");
row.querySelector(".toggle").checked = true;
document.querySelector("#tasks").append(row);

console.log("rows in the page:", document.querySelectorAll(".task").length);
console.log("rows in the template:", template.content.querySelectorAll(".task").length);
console.log(getComputedStyle(row.querySelector(".title")).textDecorationLine);
```

What the browser terminal prints

```ts
DocumentFragment
rows in the page: 0
rows in the page: 1
rows in the template: 1
line-through
```

`template.content` is a `DocumentFragment` that lives outside the page. `cloneNode(true)` gives you a fresh copy of the row every time, and the template itself stays untouched for the next one. The last line asks the browser for the **computed style**, the final value after all CSS rules are applied: the `.task.done .title` rule from `app.css` crossed the title out. The code only added a class.

## When DOM code fails

Most DOM bugs fall into a handful of patterns. Each of these runs for real in the preview.

### The script ran before the element existed

The browser builds the tree from top to bottom and runs a plain `<script>` as soon as it reaches it. A script in the `<head>` runs before the `<body>` has been parsed, so its `querySelector` finds nothing. This page records what its head script saw, straight away and after the `DOMContentLoaded` event, which fires once the whole HTML has been parsed:

index.html

```ts
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>Early script</title>
  <script>
    window.foundEarly = document.querySelector("#tasks");
    document.addEventListener("DOMContentLoaded", () => {
      window.foundLater = document.querySelector("#tasks");
    });
  </script>
</head>
<body>
  <ul id="tasks"><li>Buy detergent</li></ul>
</body>
</html>
```

early.js

```ts
console.log("found while parsing the head:", window.foundEarly);
console.log("found after DOMContentLoaded:", window.foundLater.id);
```

What the browser terminal prints

```ts
found while parsing the head: null
found after DOMContentLoaded: tasks
```

The usual fix is to load scripts with `<script src="app.js" defer>` (or `type="module"`, which defers automatically): the file downloads in parallel, and runs after the HTML has been parsed, in order. Putting the script at the end of `<body>` also works.

### Looping over a live collection while changing it

The goal: clear the `done` class from every task. The collection is live, so each removal shrinks it while the loop is still counting:

index.html

```ts
<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><title>Live bug</title></head>
<body>
  <ul id="tasks">
    <li class="task done">Buy detergent</li>
    <li class="task done">Pay the electricity bill</li>
    <li class="task done">Clean the Okafor flat</li>
    <li class="task done">Order mop heads</li>
  </ul>
</body>
</html>
```

live-bug.js

```ts
const done = document.getElementsByClassName("done");
for (let i = 0; i < done.length; i++) {
  done[i].classList.remove("done");
}
console.log("still done:", [...document.querySelectorAll(".done")].map((li) => li.textContent));

for (const li of document.querySelectorAll(".done")) li.classList.remove("done");
console.log("after the static loop:", document.querySelectorAll(".done").length);
```

What the browser terminal prints

```ts
still done: [ 'Pay the electricity bill', 'Order mop heads' ]
after the static loop: 0
```

Removing the class from item 0 drops it out of the collection, so the item that was at index 1 moves to index 0, and the loop, now at `i = 1`, skips it. Every second item survives. The static `NodeList` from `querySelectorAll` does not change while you loop, so the second loop gets them all.

### `innerHTML +=` throws the old elements away

`el.innerHTML += more` reads the whole inside as a string, adds to it, and parses the result into *brand-new* elements. Everything that lived only on the old elements is lost: what the user typed, which checkbox was ticked, focus, and event listeners. Any variable that pointed to an old element now points to one that is no longer in the page:

inner-plus.js

```ts
const input = document.querySelector('input[name="title"]');
input.value = "Buy detergent and gloves";

document.body.innerHTML += "<p>Draft saved</p>";

console.log("old input still in the page?", input.isConnected);
console.log("value in the box now:", document.querySelector('input[name="title"]').value);
```

What the browser terminal prints

```ts
old input still in the page? false
value in the box now: Buy detergent
```

The box shows the default value from the HTML again: the user's typing is gone, silently, and `input` now points to an element nobody can see. Use `append` with a created element, or `insertAdjacentHTML("beforeend", html)` for your own HTML, both of which leave existing elements alone.

## Before you build: rendering from data

You now have every tool for Ada's task list. The design question is where the truth lives. One option is to treat the DOM as the data: to add a task, append an `<li>`; to count open tasks, count elements without a `done` class. That is how the example at the top of the lesson ended up with a summary that lied. The other option is to keep the tasks in an ordinary array, the **state**, and write one `render()` function that makes the page match the state. Every action changes the state and calls `render()`. The DOM becomes an output, never an input.

REASON IT OUT

### What can go wrong in a task list?

Before writing the code, think through these questions:

- A user can type anything as a title. Which inputs should be refused, and which should be stored exactly as typed?
- A title contains `<`, `&` or a whole `<img onerror=…>` tag. What must be true of the code that puts it on the page?
- Two tasks can have the same title. How does a click on a row know *which* task it belongs to?
- `render()` runs after every change. What happens to the previous rows, and can anything be left behind or shown twice?
- How would a test know the page is right, without looking at the screen?

**Show the reasoning**

- **Refuse** what cannot be a task: an empty title, or one that is only spaces (`trim()` first), and absurdly long ones (pick a limit, such as 120 characters). **Store as typed** everything else, including quotes and angle brackets: they are legitimate text.
- Titles must only ever reach the page through `textContent` (or attributes set with `setAttribute`), never through `innerHTML`. Then any title is shown as text and nothing in it can run.
- Give every task an **id** from a counter, store it on the row as `data-id`, and look tasks up by id. Titles are not unique; ids are. Remember that `dataset.id` comes back as a string.
- `replaceChildren(fragment)` removes every old row and inserts the new ones in one operation, so nothing can be duplicated or left over. For a list of a few hundred rows, rebuilding it is fast enough.
- A test can call the actions, then **read the page back**: the titles, the checkbox states and the summary text, the same things a user sees, and compare them with what it expects.

## Build: a task list UI

The page is the `task-ui` project from the templates section: an empty `<ul>`, a summary line, a hidden error box and the row template. The program keeps the tasks in `state`, and every action ends with `render()`. At the bottom it runs a short scenario, including a hostile title and an empty one, and prints the page the way a user would read it:

task-list.js

```ts
const state = {
  tasks: [
    { id: 1, title: "Buy detergent", done: false },
    { id: 2, title: "Pay the electricity bill", done: true },
  ],
  nextId: 3,
};

const list = document.querySelector("#tasks");
const summary = document.querySelector(".summary");
const errorBox = document.querySelector(".error");
const rowTemplate = document.querySelector("#task-row");

function renderTask(task) {
  const li = rowTemplate.content.firstElementChild.cloneNode(true);
  li.dataset.id = String(task.id);
  li.classList.toggle("done", task.done);
  li.querySelector(".toggle").checked = task.done;
  li.querySelector(".title").textContent = task.title;
  li.querySelector(".delete").setAttribute("aria-label", `Delete ${task.title}`);
  return li;
}

function render() {
  const fragment = document.createDocumentFragment();
  for (const task of state.tasks) fragment.append(renderTask(task));
  list.replaceChildren(fragment);
  const open = state.tasks.filter((t) => !t.done).length;
  summary.textContent = `${open} of ${state.tasks.length} tasks left`;
}

function showError(message) {
  errorBox.textContent = message;
  errorBox.hidden = message === "";
}

function addTask(rawTitle) {
  const title = String(rawTitle).trim();
  if (title === "") return showError("A task needs a title.");
  if (title.length > 120) return showError("Keep the title under 120 characters.");
  showError("");
  state.tasks.push({ id: state.nextId++, title, done: false });
  render();
}

function toggleTask(id) {
  const task = state.tasks.find((t) => t.id === id);
  if (!task) return;
  task.done = !task.done;
  render();
}

function removeTask(id) {
  state.tasks = state.tasks.filter((t) => t.id !== id);
  render();
}

function readPage() {
  const rows = [...list.children].map((li) => {
    const box = li.querySelector(".toggle").checked ? "[x]" : "[ ]";
    return `${box} #${li.dataset.id} ${li.querySelector(".title").textContent}`;
  });
  const error = errorBox.hidden ? "(no error)" : `error: ${errorBox.textContent}`;
  return [...rows, summary.textContent, error].join("\n");
}

render();
addTask("  Clean the Okafor flat  ");
addTask(`Fix sink <img src="data:," onerror="window.stolen = 1">`);
toggleTask(1);
removeTask(2);
addTask("   ");
console.log(readPage());
console.log("images:", list.querySelectorAll("img").length, "stolen:", window.stolen);
```

What the browser terminal prints

```json
[x] #1 Buy detergent
[ ] #3 Clean the Okafor flat
[ ] #4 Fix sink <img src="data:," onerror="window.stolen = 1">
2 of 3 tasks left
error: A task needs a title.
images: 0 stolen: undefined
```

Walk through what happened:

- The first title was trimmed before it was stored. The hostile title was stored and shown exactly as typed, as text: no image, no script.
- Toggling task 1 and removing task 2 only changed `state`; `render()` made the page match, summary included. The summary can no longer disagree with the list, because both are drawn from the same array in the same function.
- The blank title was refused with a message in the error box. The box has `role="alert"` so screen readers announce it, and the summary has `aria-live="polite"` so changes to it are read out too.
- Each delete button got an `aria-label` such as "Delete Buy detergent": a screen reader user hears which task the button deletes, not five buttons all called "Delete".

The buttons and checkboxes do nothing yet when clicked. Connecting them to `toggleTask` and `removeTask` takes one event listener on the list, which is the first thing [Events](https://zudojs.oyinlola.site/learn/browser-events) builds.

## Testing DOM code

`readPage()` above is already a test tool: it turns the page into text you can compare. A test for a DOM function sets up the page, calls the function, and checks what a user would see, not how the code did it. It looks at text, checkbox states and attributes, not at private variables. Here `renderTask` is tested on its own, including the hostile title:

render-test.js

```ts
const rowTemplate = document.querySelector("#task-row");

function renderTask(task) {
  const li = rowTemplate.content.firstElementChild.cloneNode(true);
  li.dataset.id = String(task.id);
  li.classList.toggle("done", task.done);
  li.querySelector(".toggle").checked = task.done;
  li.querySelector(".title").textContent = task.title;
  li.querySelector(".delete").setAttribute("aria-label", `Delete ${task.title}`);
  return li;
}

function check(label, actual, expected) {
  console.log(`${actual === expected ? "PASS" : "FAIL"} ${label}: ${JSON.stringify(actual)}`);
}

const done = renderTask({ id: 7, title: "Buy detergent", done: true });
check("id on the row", done.dataset.id, "7");
check("done class", done.classList.contains("done"), true);
check("checkbox ticked", done.querySelector(".toggle").checked, true);
check("button label", done.querySelector(".delete").getAttribute("aria-label"), "Delete Buy detergent");

const hostile = `<b>bold</b> & "quoted"`;
const row = renderTask({ id: 8, title: hostile, done: false });
check("title shown as typed", row.querySelector(".title").textContent, hostile);
check("no elements created from the title", row.querySelector(".title").children.length, 0);
check("not done", row.classList.contains("done"), false);
```

What the browser terminal prints

```ts
PASS id on the row: "7"
PASS done class: true
PASS checkbox ticked: true
PASS button label: "Delete Buy detergent"
PASS title shown as typed: "<b>bold</b> & \"quoted\""
PASS no elements created from the title: 0
PASS not done: false
```

In a real project you run tests like these with a test runner such as Vitest (see [Testing fundamentals](https://zudojs.oyinlola.site/learn/testing-basics)) and a **simulated DOM**, a library such as jsdom or happy-dom that implements `document` in Node.js, so tests run without opening a browser. Libraries like Testing Library add helpers that find elements the way users do, by their visible text and their accessible role ("the button called Delete Buy detergent"), which keeps tests working when you change class names. For behaviour that depends on real layout, such as scrolling or what is visible on a small screen, teams add a few end-to-end tests in a real browser with tools like Playwright.

## In production

- **Security.** Every value that came from outside your code goes in with `textContent`, `value` or `setAttribute`. Search your code base for `innerHTML`, `outerHTML`, `insertAdjacentHTML` and `document.write`, and check each one. Even `setAttribute` needs care with `href` and `src`: a link to `javascript:…` runs code when clicked, so only accept `http:` and `https:` addresses from users. Browsers also offer Trusted Types and Content Security Policy, which block dangerous sinks for the whole page.
- **Performance.** Build off-page (fragments, templates) and insert once; read layout before writing; don't rebuild a list of 10,000 rows on every keystroke. Very long lists show only the rows on screen ("virtual scrolling").
- **Rebuilding loses state.** `replaceChildren` makes new elements, so focus and scroll position inside the list are lost on each render. That is fine here; for large, interactive pages, UI libraries such as React, Vue and Svelte compare the new output with the current page and change only what differs. They are built on exactly the DOM calls in this lesson.
- **Accessibility.** Use the element that means what you want: a `<button>` for actions (keyboard and screen readers support it for free, a clickable `<div>` gets nothing), `<label>` for inputs, and `aria-live` or `role="alert"` for messages that change.
- **Missing elements.** Look up the elements your code depends on once, at start-up, and fail with a clear message if one is missing, as `mustFind` did.

## Practice

TRY IT YOURSELF

### Show only open tasks

Add a filter to the task list without rebuilding any rows. Write `showOnly(filter)`, where `filter` is `"all"`, `"open"` or `"done"`. It sets the `hidden` property of each row and returns how many rows are visible. Test it on three rows made from the template.

**Show a solution**

filter.js

```ts
const list = document.querySelector("#tasks");
const rowTemplate = document.querySelector("#task-row");

for (const [title, done] of [["Buy detergent", false], ["Pay the electricity bill", true], ["Clean the Okafor flat", false]]) {
  const li = rowTemplate.content.firstElementChild.cloneNode(true);
  li.classList.toggle("done", done);
  li.querySelector(".title").textContent = title;
  list.append(li);
}

function showOnly(filter) {
  let visible = 0;
  for (const li of list.children) {
    const isDone = li.classList.contains("done");
    li.hidden = (filter === "open" && isDone) || (filter === "done" && !isDone);
    if (!li.hidden) visible++;
  }
  return visible;
}

console.log("open:", showOnly("open"));
console.log("done:", showOnly("done"));
console.log("all:", showOnly("all"));
```

What the browser terminal prints

```ts
open: 2
done: 1
all: 3
```

Hiding keeps the elements (and anything the user typed in them) and is cheap. In the render-from-state design you would more often store the filter in `state` and let `render()` skip the rows; both are fine, as long as there is one source of truth for which filter is active.

TRY IT YOURSELF

### Highlight a search term safely

Write `highlight(element, text, term)` that shows `text` inside `element` with every case-insensitive match of `term` wrapped in a `<mark>`. It must be safe for any `text`, so no `innerHTML`: build text nodes and `<mark>` elements yourself.

**Show a solution**

highlight.js

```ts
function highlight(element, text, term) {
  const parts = [];
  const lower = text.toLowerCase();
  const needle = term.toLowerCase();
  let from = 0;
  let at = needle === "" ? -1 : lower.indexOf(needle);
  while (at !== -1) {
    parts.push(text.slice(from, at));
    const mark = document.createElement("mark");
    mark.textContent = text.slice(at, at + needle.length);
    parts.push(mark);
    from = at + needle.length;
    at = lower.indexOf(needle, from);
  }
  parts.push(text.slice(from));
  element.replaceChildren(...parts.filter((p) => p !== ""));
}

const box = document.querySelector(".summary");
highlight(box, "Clean the flat, then clean the car", "clean");
console.log(box.innerHTML);

highlight(box, `<img src="data:," onerror="window.stolen = 1"> invoice`, "invoice");
console.log(box.querySelectorAll("img").length, box.querySelector("mark").textContent);
```

What the browser terminal prints

```ts
<mark>Clean</mark> the flat, then <mark>clean</mark> the car
0 invoice
```

Strings passed to `replaceChildren` become text nodes, so the attacker's tag stays text. The marks keep the original capitalisation because the slice comes from `text`, while the search uses the lower-case copy. An empty term would match everywhere, so it is treated as "no match".

TRY IT YOURSELF

### Fix the renderer

A colleague wrote this renderer. Find three problems and rewrite it with the tools from this lesson.

```ts
function render(tasks) {
  const list = document.querySelector("#tasks");
  list.innerHTML = "";
  for (const task of tasks) {
    list.innerHTML += `<li data-id="${task.id}">${task.title}</li>`;
  }
}
```

**Show a solution**

- **XSS**: `task.title` is parsed as HTML. A title with an `onerror` attribute runs code for every user who sees the list.
- **Slow**: every `+=` turns the whole list back into a string and parses all of it again, so rendering *n* tasks does work proportional to *n*², and every earlier row is thrown away and rebuilt each time.
- **Silent failure**: if `#tasks` is missing, the error is a confusing `TypeError` on `null`.

fixed-render.js

```ts
function render(tasks) {
  const list = document.querySelector("#tasks");
  if (!list) throw new Error("Page is missing #tasks");
  const fragment = document.createDocumentFragment();
  for (const task of tasks) {
    const li = document.createElement("li");
    li.dataset.id = String(task.id);
    li.textContent = task.title;
    fragment.append(li);
  }
  list.replaceChildren(fragment);
}

render([
  { id: 1, title: "Buy detergent" },
  { id: 2, title: `<img src="data:," onerror="window.stolen = 1">` },
]);
const list = document.querySelector("#tasks");
console.log(list.children.length, list.querySelectorAll("img").length);
console.log(list.lastElementChild.textContent);
```

What the browser terminal prints

```ts
2 0
<img src="data:," onerror="window.stolen = 1">
```

## Summary

- The browser parses HTML into the DOM, a tree of node objects. Elements are one kind of node; text (including whitespace between tags) and comments are others. Prefer the element-only properties: `children`, `firstElementChild`, `nextElementSibling`, `parentElement`.
- Find elements with `querySelector` and `querySelectorAll` (a static snapshot), `closest` and `matches`. Expect `null`, and fail with a clear message for elements the page needs.
- Create with `createElement`, insert with `append`, `prepend`, `before`, `after`, `replaceChildren`, remove with `remove()`. Inserting an element that is already in the page moves it.
- Attributes are the strings in the HTML; properties are the live, typed values on the object. Read form input from `value` and `checked`. Use `classList` and `dataset`, and remember boolean attributes are on when present.
- User data goes in with `textContent`, never `innerHTML`: otherwise it is an XSS hole.
- Build many nodes off the page in a `DocumentFragment` or from a `<template>`, and insert them once.
- Keep the data in state and render the page from it; test by reading the page back.

Next: [Events](https://zudojs.oyinlola.site/learn/browser-events), where the task list's buttons and a shopping cart come alive with listeners, bubbling and event delegation.

## Test yourself

Five questions, picked at random from this lesson's question bank. Some ask you to choose an answer, some to predict what code prints, and some to write code and run it in the terminal. Get 4 of 5 right to pass. If you don't, read the explanations and try again: you get 5 different questions.
