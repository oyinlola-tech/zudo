---
title: "Events — ZudoJS Academy"
description: "Make a shopping cart respond to clicks, typing and forms with listeners, bubbling and capturing, preventDefault, delegation, custom events and a debounce."
source: https://zudojs.oyinlola.site/learn/browser-events
---

LEVEL 4 · LESSON 11 OF 21

JavaScript in the browser Core

# Events

Make a shopping cart respond to clicks, typing and forms with listeners, bubbling and capturing, preventDefault, delegation, custom events and a debounce.

- **55 min** to read and try
- **You need:** The DOM, this in depth and Closures in depth
- **You build:** A shopping cart driven by three delegated listeners, with custom events, quantity validation and double-submit protection, plus a debounced search box

  [Test yourself](#test)

BY THE END OF THIS LESSON YOU CAN

- Attach and remove listeners, and read the event object (target, currentTarget, type)
- Predict the order listeners run in through the capture, target and bubble phases
- Stop default actions with preventDefault, and explain why stopPropagation is rarely the answer
- Handle a whole list with one delegated listener, including items added later
- Handle forms and typing with submit, input and change events, FormData and a debounce
- Design custom events so separate parts of a page stay in step

## The Remove button that did nothing

A grocery shop's cart page lists what the customer is buying, each line with a Remove button. The developer wrote the obvious code: find every Remove button and give each one a **listener**, a function the browser calls when the button is clicked. It worked in testing. Then customers started complaining that items they had just added could not be removed. Here is a small copy of the page:

index.html

```ts
<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><title>Cart</title></head>
<body>
  <ul id="cart">
    <li data-sku="rice-5kg">Rice 5kg <button type="button" class="remove">Remove</button></li>
    <li data-sku="palm-oil-1l">Palm oil 1L <button type="button" class="remove">Remove</button></li>
  </ul>
</body>
</html>
```

The example clicks the buttons in code with `button.click()`, which fires the same `click` event a mouse click would, so you can see the result without touching anything:

bug.js

```ts
for (const button of document.querySelectorAll(".remove")) {
  button.addEventListener("click", () => {
    const line = button.closest("li");
    console.log("removing", line.dataset.sku);
    line.remove();
  });
}

// Later, the customer adds garri to the cart.
const line = document.createElement("li");
line.dataset.sku = "garri-2kg";
const remove = document.createElement("button");
remove.type = "button";
remove.className = "remove";
remove.textContent = "Remove";
line.append("Garri 2kg ", remove);
document.querySelector("#cart").append(line);

document.querySelector('[data-sku="rice-5kg"] .remove').click();
document.querySelector('[data-sku="garri-2kg"] .remove').click();

const left = [...document.querySelectorAll("#cart li")].map((li) => li.dataset.sku);
console.log("still in the cart:", left);
```

What the browser terminal prints

```ts
removing rice-5kg
still in the cart: [ 'palm-oil-1l', 'garri-2kg' ]
```

Rice was removed. Garri was not: its button was created *after* the loop ran, so it never got a listener. The loop attached listeners to the buttons that existed at that moment, and nothing else. Re-running the loop after every change would fix that, and introduce the opposite bug: the old buttons would get a second listener each time, and one click would remove, or charge, twice.

The real fix uses the way events travel through the DOM tree: a single listener on the `<ul>` can handle clicks on every button inside it, including buttons that do not exist yet. To get there, you need to know exactly what happens between "the user clicks" and "your function runs".

## Listeners and the event object

An **event** is a message that something happened: a click, a key press, a form being submitted, a page finishing loading. Every DOM node is an `EventTarget` (you saw it at the end of the prototype chain in [The DOM](https://zudojs.oyinlola.site/learn/browser-dom#tree)), which gives it three methods: `addEventListener(type, listener, options)`, `removeEventListener(type, listener, options)` and `dispatchEvent(event)`.

When the event happens, the browser calls each listener with an **event object** that describes it:

index.html

```ts
<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><title>Events</title></head>
<body>
  <main id="shop">
    <ul id="cart">
      <li id="line-rice" data-sku="rice-5kg">
        Rice 5kg
        <button type="button" id="remove-rice" data-action="remove"><span class="icon">×</span> Remove</button>
      </li>
    </ul>
    <a id="help" href="https://shop.example/help">Help</a>
    <label><input type="checkbox" id="gift"> Gift wrap</label>
  </main>
</body>
</html>
```

event-object.js

```ts
const button = document.querySelector("#remove-rice");

button.addEventListener("click", (event) => {
  console.log("type:", event.type);
  console.log("constructor:", event.constructor.name);
  console.log("target:", event.target.id, "currentTarget:", event.currentTarget.id);
  console.log("bubbles:", event.bubbles, "cancelable:", event.cancelable);
  console.log("isTrusted:", event.isTrusted);
});

button.click();
```

What the browser terminal prints

```ts
type: click
constructor: PointerEvent
target: remove-rice currentTarget: remove-rice
bubbles: true cancelable: true
isTrusted: false
```

- `type` is the event's name. The constructor tells you what kind of event it is: modern browsers fire `click` as a `PointerEvent`, a kind of `MouseEvent`, which also carries the pointer position and which modifier keys were held.
- `target` is the element the event happened on. `currentTarget` is the element whose listener is running now. Here they are the same button; with delegation they are not.
- `bubbles` and `cancelable` say whether the event travels up the tree and whether its default action can be stopped. Both are explained below.
- `isTrusted` is `false` because code created this click, not a person. Browsers let only trusted events do a few sensitive things, such as opening a pop-up or going full screen.

A second way to listen is an event-handler property: `button.onclick = fn`. It holds exactly one function, so a second assignment silently replaces the first. `addEventListener` can add any number of listeners, which run in the order they were added, and it takes options. Use `addEventListener`.

onclick.js

```ts
const button = document.querySelector("#remove-rice");

button.onclick = () => console.log("analytics: remove clicked");
button.onclick = () => console.log("cart: removing rice");

button.addEventListener("click", () => console.log("listener 1"));
button.addEventListener("click", () => console.log("listener 2"));

button.click();
```

What the browser terminal prints

```ts
cart: removing rice
listener 1
listener 2
```

The analytics handler is gone. In a real page, two scripts written by two teams would never know they were overwriting each other.

> NOTE
>
> Listeners declared with `function` get `this` set to `currentTarget`; arrow functions keep the `this` from outside. [this in depth](https://zudojs.oyinlola.site/learn/js-this#events) covers it. Reading `event.currentTarget` says what you mean in both kinds of function.

## How an event travels: capture, target, bubble

When you click the `×` icon inside the Remove button, which element was clicked? The icon, the button, the list item, the list and the page all contain the pointer. The DOM's answer is to deliver the event to *all* of them, in a fixed order called **propagation**. The browser first works out the **path**: the target and every ancestor up to `window`. Then the event travels that path in three phases:

```ts
                 window
                   │   ▲
1 capture phase    │   │   3 bubble phase
(listeners with    ▼   │   (normal listeners,
 capture: true)  document   from the target
                   │   ▲    back up)
                   ▼   │
                 <ul id="cart">
                   │   ▲
                   ▼   │
                 <li>
                   │   ▲
                   ▼   │
                 <button>
                   │   ▲
                   ▼   │
               <span class="icon">   2 target phase
```

A click on the icon: down from window to the target, then back up.

A listener added normally runs in the **bubble** phase. Pass `{ capture: true }` to run in the **capture** phase instead, on the way down. `event.eventPhase` says which phase is running: 1 for capture, 2 at the target, 3 for bubble:

phases.js

```ts
const phases = { 1: "capture", 2: "target", 3: "bubble" };
const name = (node) => (node === window ? "window" : node === document ? "document" : node.id || node.className);

const path = [window, document, "#cart", "#line-rice", "#remove-rice", ".icon"].map((n) => (typeof n === "string" ? document.querySelector(n) : n));
for (const node of path) {
  node.addEventListener("click", (e) => console.log(`${name(e.currentTarget)} ${phases[e.eventPhase]}`), { capture: true });
  node.addEventListener("click", (e) => console.log(`${name(e.currentTarget)} ${phases[e.eventPhase]}`));
}

document.querySelector(".icon").click();
```

What the browser terminal prints

```ts
window capture
document capture
cart capture
line-rice capture
remove-rice capture
icon target
icon target
remove-rice bubble
line-rice bubble
cart bubble
document bubble
window bubble
```

The event went down through the capture listeners of every ancestor, reached the icon (the target, where both of its listeners run in the target phase), and came back up through the bubble listeners. Every ancestor heard the click, although it happened on a small `<span>` inside the button. Nearly all events bubble; a few don't, notably `focus`, `blur`, `mouseenter`, `mouseleave` and `load`. For focus there are bubbling twins, `focusin` and `focusout`.

### Stopping propagation

`event.stopPropagation()` stops the event from travelling any further: listeners on later nodes of the path do not run. (Other listeners on the *same* node still run; `stopImmediatePropagation()` stops those too.) It sounds useful, and it is usually a bug waiting to happen. A common pattern: a drop-down menu closes when you click anywhere else, using a listener on `document`. Then someone adds a widget that stops propagation "so its clicks don't do anything else":

stop.js

```ts
const menu = { open: true };
document.addEventListener("click", () => {
  menu.open = false;
  console.log("document: click outside, menu closed");
});

const gift = document.querySelector("#gift");
gift.addEventListener("click", (event) => {
  event.stopPropagation();
  console.log("gift checkbox: stopped propagation");
});

gift.click();
console.log("menu open?", menu.open);

document.querySelector("#remove-rice").click();
console.log("menu open?", menu.open);
```

What the browser terminal prints

```ts
gift checkbox: stopped propagation
menu open? true
document: click outside, menu closed
menu open? false
```

Clicking the checkbox left the menu open, because the document never heard about the click. The same thing breaks analytics, keyboard shortcuts and anything else that listens on an ancestor. Instead of stopping the event, let listeners that care check `event.target` and decide for themselves, which is exactly what delegation does.

## Default actions and preventDefault

Many events have a **default action**: what the browser does after your listeners have run. A click on a link navigates; a click on a checkbox ticks it; submitting a form sends it and loads a new page; pressing a key in a text box types a character. If the event is `cancelable`, a listener can call `event.preventDefault()` and the browser skips the default action. The event still propagates; only the browser's own behaviour is cancelled.

prevent.js

```ts
const help = document.querySelector("#help");
help.addEventListener("click", (event) => {
  event.preventDefault();
  console.log("open the help panel instead of leaving the page");
});
help.click();
console.log("still on the page:", location.href);

const gift = document.querySelector("#gift");
gift.addEventListener("click", (event) => {
  if (document.querySelector("#cart").children.length === 1) {
    event.preventDefault();
    console.log("gift wrap needs at least two items");
  }
});
gift.click();
console.log("gift checked?", gift.checked);

const event = new MouseEvent("click", { bubbles: true, cancelable: true });
const notCancelled = help.dispatchEvent(event);
console.log("dispatchEvent returned", notCancelled, "defaultPrevented:", event.defaultPrevented);
```

What the browser terminal prints

```ts
open the help panel instead of leaving the page
still on the page: about:srcdoc
gift wrap needs at least two items
gift checked? false
open the help panel instead of leaving the page
dispatchEvent returned false defaultPrevented: true
```

The preview did not navigate away, and the checkbox stayed unticked. `dispatchEvent` returns `false` when a listener cancelled the event, which is how your own code can offer "cancel this" to its listeners.

Two details prevent confusing bugs. First, `preventDefault()` on a non-cancelable event does nothing. Second, listeners for scrolling and touch events are often added with `{ passive: true }`, a promise that the listener will not call `preventDefault()`. The browser can then scroll straight away instead of waiting for your code, and it ignores `preventDefault()` in such a listener.

## Event delegation

Because clicks bubble, a listener on the list hears every click on every button inside it. `event.target` says what was clicked, and `closest` finds the button and the line it belongs to. That is **event delegation**: one listener on a stable ancestor, instead of one per item. It fixes the bug from the start of the lesson, because a new button is inside the list the moment it is inserted:

delegation.js

```ts
const cart = document.querySelector("#cart");

cart.addEventListener("click", (event) => {
  const button = event.target.closest("button.remove");
  if (!button || !cart.contains(button)) return;
  const line = button.closest("li");
  console.log("removing", line.dataset.sku);
  line.remove();
});

const line = document.createElement("li");
line.dataset.sku = "garri-2kg";
line.innerHTML = 'Garri 2kg <button type="button" class="remove">Remove</button>';
cart.append(line);

document.querySelector('[data-sku="rice-5kg"] .remove').click();
document.querySelector('[data-sku="garri-2kg"] .remove').click();
cart.click();

console.log("still in the cart:", [...cart.children].map((li) => li.dataset.sku));
```

What the browser terminal prints

```ts
removing rice-5kg
removing garri-2kg
still in the cart: [ 'palm-oil-1l' ]
```

Three details make a delegated listener robust:

- **`closest`, not `target`**. A click can land on a child of the button, such as the `×` icon. `event.target.closest("button.remove")` finds the button either way.
- **Ignore everything else**. The click on the list itself (`cart.click()`) found no button, and the listener returned without doing anything.
- **Stay inside**. `cart.contains(button)` makes sure the match is inside the list, not an ancestor above it that happens to match the selector.

(The `innerHTML` above is safe because the string is fixed text written in the code, with no user data in it.)

### Finishing the task list

The task list you built in [The DOM](https://zudojs.oyinlola.site/learn/browser-dom#build) rendered checkboxes and Delete buttons that did nothing. One delegated listener for clicks and one for checkbox changes connect them to `toggleTask` and `removeTask`. They survive every `render()`, because `render()` replaces the rows, not the list:

index.html

```ts
<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><title>Ada's jobs</title></head>
<body>
  <ul id="tasks"></ul>
  <p class="summary"></p>
  <template id="task-row">
    <li class="task">
      <label><input type="checkbox" class="toggle"> <span class="title"></span></label>
      <button type="button" class="delete">Delete</button>
    </li>
  </template>
</body>
</html>
```

task-events.js

```ts
const state = {
  tasks: [
    { id: 1, title: "Buy detergent", done: false },
    { id: 2, title: "Pay the electricity bill", done: false },
    { id: 3, title: "Clean the Okafor flat", done: false },
  ],
};
const list = document.querySelector("#tasks");
const rowTemplate = document.querySelector("#task-row");

function render() {
  const rows = state.tasks.map((task) => {
    const li = rowTemplate.content.firstElementChild.cloneNode(true);
    li.dataset.id = String(task.id);
    li.querySelector(".toggle").checked = task.done;
    li.querySelector(".title").textContent = task.title;
    return li;
  });
  list.replaceChildren(...rows);
  const open = state.tasks.filter((t) => !t.done).length;
  document.querySelector(".summary").textContent = `${open} of ${state.tasks.length} tasks left`;
}

const idOf = (element) => Number(element.closest("li[data-id]").dataset.id);

list.addEventListener("change", (event) => {
  if (!event.target.matches(".toggle")) return;
  const task = state.tasks.find((t) => t.id === idOf(event.target));
  task.done = event.target.checked;
  render();
});

list.addEventListener("click", (event) => {
  const button = event.target.closest(".delete");
  if (!button) return;
  state.tasks = state.tasks.filter((t) => t.id !== idOf(button));
  render();
});

render();
list.querySelector('[data-id="1"] .toggle').click();
list.querySelector('[data-id="2"] .delete').click();
list.querySelector('[data-id="3"] .title').click();
console.log([...list.children].map((li) => `${li.querySelector(".toggle").checked ? "[x]" : "[ ]"} ${li.querySelector(".title").textContent}`));
console.log(document.querySelector(".summary").textContent);
```

What the browser terminal prints

```json
[ '[x] Buy detergent', '[x] Clean the Okafor flat' ]
0 of 2 tasks left
```

The third click landed on the title text, inside the `<label>`. Clicking a label clicks its checkbox (another default action), which fired a `change` event and ticked task 3. The checkbox listener uses `change` rather than `click` because `change` fires for every way of ticking a box: mouse, label, or the space bar.

## Custom events

The shop's header shows a cart badge: "Cart (3)". The cart code could update the badge directly, but then the cart has to know about the header, the mini-cart, the analytics script and whatever gets added next year. Instead, the cart announces what happened with a **custom event**, and anything that cares listens for it. `new CustomEvent(type, { detail, bubbles })` creates one, and `detail` carries your data:

index.html

```ts
<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><title>Shop</title></head>
<body>
  <header>Cart (<span id="badge">0</span>)</header>
  <section id="cart-widget"></section>
</body>
</html>
```

custom.js

```ts
const widget = document.querySelector("#cart-widget");
const lines = new Map();

function addToCart(sku, quantity) {
  lines.set(sku, (lines.get(sku) ?? 0) + quantity);
  const count = [...lines.values()].reduce((a, b) => a + b, 0);
  widget.dispatchEvent(new CustomEvent("cart:change", { bubbles: true, detail: { sku, count } }));
}

document.addEventListener("cart:change", (event) => {
  document.querySelector("#badge").textContent = String(event.detail.count);
});
document.addEventListener("cart:change", (event) => {
  console.log(`analytics: ${event.detail.sku} added, cart has ${event.detail.count}`);
});

addToCart("rice-5kg", 2);
addToCart("palm-oil-1l", 1);
console.log("badge:", document.querySelector("#badge").textContent);
```

What the browser terminal prints

```ts
analytics: rice-5kg added, cart has 2
analytics: palm-oil-1l added, cart has 3
badge: 3
```

The cart knows nothing about badges or analytics; they listen on `document` and hear the event because it bubbles. A namespace in the name, such as `cart:`, avoids clashing with built-in event names. `dispatchEvent` is **synchronous**: all listeners have run by the time it returns, which is why the badge was already up to date on the last line.

`EventTarget` is also a class you can extend, so your own objects can have events without any DOM element. It exists in Node.js too, so this style works on both sides:

event-target.js

```ts
class Cart extends EventTarget {
  #lines = new Map();

  add(sku, quantity) {
    if (!Number.isInteger(quantity) || quantity < 1) throw new RangeError(`bad quantity ${quantity}`);
    this.#lines.set(sku, (this.#lines.get(sku) ?? 0) + quantity);
    this.dispatchEvent(new CustomEvent("change", { detail: { sku, quantity } }));
  }
}

const cart = new Cart();
cart.addEventListener("change", (event) => console.log("changed:", event.detail));
cart.add("rice-5kg", 2);
try {
  cart.add("garri-2kg", 0);
} catch (error) {
  console.log(error.name, error.message);
}
```

Output of `node event-target.js` and of the browser terminal

```ts
changed: { sku: 'rice-5kg', quantity: 2 }
RangeError bad quantity 0
```

## Forms, input and change

Forms have their own events:

| Event | Fires when |
| --- | --- |
| `input` | the value changes, on every keystroke, paste or deletion |
| `change` | the user commits a change: leaves a text field after editing it, ticks a box, picks an option |
| `submit` | on the `<form>`, when it is about to be sent: Enter in a field, a click on a submit button, `form.requestSubmit()` |
| `invalid` | on a field whose value breaks its HTML rules (`required`, `min`, `maxlength`, `type="email"`) when the form is checked |
| `keydown` / `keyup` | a key is pressed or released; `event.key` is `"Enter"`, `"Escape"`, `"a"`, … |
| `focusin` / `focusout` | a field gains or loses focus (the bubbling versions of `focus` and `blur`) |

Handle the `submit` event, not the button's `click`: `submit` also fires when the user presses Enter. Its default action sends the form and loads a new page, so a script that handles the form itself must call `preventDefault()`. `new FormData(form)` collects every named field:

index.html

```ts
<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><title>Delivery</title></head>
<body>
  <form id="delivery" novalidate>
    <label>Name <input name="name" required maxlength="80"></label>
    <label>Phone <input name="phone" type="tel" required pattern="0[789][01][0-9]{8}"></label>
    <label>Deliver on
      <select name="slot">
        <option value="morning">Morning</option>
        <option value="evening">Evening</option>
      </select>
    </label>
    <label><input type="checkbox" name="leaveAtGate"> Leave at the gate</label>
    <button type="submit">Confirm delivery</button>
  </form>
</body>
</html>
```

submit.js

```ts
const form = document.querySelector("#delivery");

form.addEventListener("submit", (event) => {
  event.preventDefault();
  if (!form.checkValidity()) {
    const bad = [...form.elements].filter((field) => field.name && !field.validity.valid);
    console.log("fix these fields:", bad.map((field) => field.name));
    return;
  }
  const data = Object.fromEntries(new FormData(form));
  console.log("send to the server:", data);
});

form.elements.name.value = "Chioma Eze";
form.elements.phone.value = "12345";
form.requestSubmit();

form.elements.phone.value = "08031234567";
form.elements.slot.value = "evening";
form.elements.leaveAtGate.checked = true;
form.requestSubmit();
```

What the browser terminal prints

```ts
fix these fields: [ 'phone' ]
send to the server: {
  name: 'Chioma Eze',
  phone: '08031234567',
  slot: 'evening',
  leaveAtGate: 'on'
}
```

Things to notice:

- `novalidate` on the form turns off the browser's built-in error bubbles, so the code decides how to show errors. The rules in the HTML (`required`, `pattern`, `maxlength`) still work: `checkValidity()` and each field's `validity` use them.
- `FormData` uses each field's `name`. An unticked checkbox is left out entirely, and a ticked one sends the string `"on"`. Every value is a string.
- `form.requestSubmit()` behaves like the user submitting: it fires `submit`. The older `form.submit()` skips both the event and validation, and sends the form immediately.

> WATCH OUT
>
> Checks in the browser are for the user's convenience: quick feedback without a round trip. Anyone can skip them by sending a request straight to your server, so the server must check everything again. [Networking from JavaScript](https://zudojs.oyinlola.site/learn/browser-networking) sends this data to a real API.

## Typing: a debounced search box

The shop has a search box. Searching on every `input` event means that typing "rice" sends four requests, for "r", "ri", "ric" and "rice", and the answers may even arrive in the wrong order. A **debounce** waits until the user has stopped typing for a moment, then acts once. It is a small closure (see [Closures in depth](https://zudojs.oyinlola.site/learn/js-closures)) around a timer:

index.html

```ts
<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><title>Search</title></head>
<body>
  <label>Search products <input type="search" id="search" autocomplete="off"></label>
  <ul id="results"></ul>
</body>
</html>
```

debounce.js

```ts
function debounce(fn, waitMs) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), waitMs);
  };
}

const products = ["Rice 5kg", "Rice 10kg", "Palm oil 1L", "Garri 2kg", "Brown beans 1kg"];
const input = document.querySelector("#search");
let searches = 0;

const search = debounce((term) => {
  searches++;
  const found = products.filter((p) => p.toLowerCase().includes(term.toLowerCase()));
  console.log(`search #${searches} for "${term}":`, found);
}, 300);

input.addEventListener("input", () => search(input.value.trim()));
input.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    input.value = "";
    console.log("cleared");
  }
});

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function type(text) {
  for (const ch of text) {
    input.value += ch;
    input.dispatchEvent(new Event("input", { bubbles: true }));
    await sleep(50);
  }
}

await type("ric");
await sleep(400);
await type("e 1");
await sleep(400);
input.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
console.log("input events: 6, searches:", searches);
```

What the browser terminal prints

```ts
search #1 for "ric": [ 'Rice 5kg', 'Rice 10kg' ]
search #2 for "rice 1": [ 'Rice 10kg' ]
cleared
input events: 6, searches: 2
```

Six input events produced two searches: one when the user paused after "ric", and one after "rice 1". Each keystroke cleared the previous timer, so only the last one in a burst survives. Setting `input.value` from code does not fire any event, which is why the example dispatches `input` itself.

A debounce reduces the number of requests, but the answers can still arrive in the wrong order, and a slow answer for "ric" can land after the answer for "rice 1". The fix is to cancel the previous request with an `AbortController` each time a new search starts; [Networking from JavaScript](https://zudojs.oyinlola.site/learn/browser-networking#abort) adds it to this search box. A related tool, **throttle**, runs a function at most once per period while events keep coming, which suits scroll and resize handlers.

## Removing listeners

A listener stays until you remove it or its element is garbage-collected. On a long-lived page (a single-page app that swaps views without reloading) a view that adds listeners to `window` or `document` and never removes them keeps running its code, and keeps its data in memory, after it has left the screen. To remove a listener, `removeEventListener` needs the *same function* and the same `capture` setting:

remove.js

```ts
const button = document.querySelector("#remove-rice");

button.addEventListener("click", () => console.log("arrow listener"));
button.removeEventListener("click", () => console.log("arrow listener"));

function onRemove() {
  console.log("named listener");
}
button.addEventListener("click", onRemove);
button.removeEventListener("click", onRemove);

button.addEventListener("click", () => console.log("once listener"), { once: true });

const controller = new AbortController();
const { signal } = controller;
window.addEventListener("resize", () => console.log("resize"), { signal });
document.addEventListener("keydown", () => console.log("keydown"), { signal });
button.addEventListener("click", () => console.log("signal listener"), { signal });

button.click();
console.log("--- abort");
controller.abort();
button.click();
document.dispatchEvent(new KeyboardEvent("keydown", { key: "n" }));
```

What the browser terminal prints

```ts
arrow listener
once listener
signal listener
--- abort
arrow listener
```

The first removal did nothing: two arrow functions with the same code are two different objects, so "arrow listener" still runs, even after the abort, and nothing can remove it now. Keep a reference to any listener you want to remove. `{ once: true }` removes the listener after its first call. The `signal` option is the cleanest tool for a whole view: pass one `AbortSignal` to every listener it adds, and a single `controller.abort()` removes them all when the view closes. It is the same `AbortController` that cancels requests, so one abort can stop a view's listeners and its pending fetches together.

## Before you build: the shopping cart

Time to build the grocery shop's cart properly: products with "Add to cart" buttons, cart lines with minus, plus, a quantity box and Remove, a total in naira, a header badge, and a "Place order" button.

REASON IT OUT

### What can go wrong in a cart?

Think through these before reading the code:

- Lines are added and removed all the time. How many listeners do you need, and where do they go?
- A click can land on the button's text, on an icon inside it, or on empty space in the line. How does the code find the right product?
- The customer types into the quantity box: "0", "-3", "2.5", "abc", "999", or clears it. What should happen for each?
- Prices: how do you store ₦8,500 so that adding prices never gives `0.30000000000000004`-style errors?
- The network is slow and the customer clicks "Place order" twice. How many orders arrive?
- The header badge and the total must always match the lines. Who updates them?

**Show the reasoning**

- Three delegated listeners, all on elements that never get replaced: `click` on the products section, `click` on the cart list, `change` on the cart list. Plus `submit` on the form. Rendering replaces the lines, never the containers, so no listener is ever lost or added twice.
- `event.target.closest("[data-action]")` finds the button, and `closest("[data-sku]")` finds the product or line. Everything else is ignored.
- Accept only whole numbers from 1 to 20 (`/^[0-9]+$/` and a range check). Anything else is refused with a message and the box is reset to the current quantity by re-rendering. Removing a line is a separate, explicit action.
- In **kobo**, as integers (₦8,500 is 850,000 kobo), and format only for display. [Mathematical reasoning](https://zudojs.oyinlola.site/learn/logic-math) explains why.
- Without protection, two. Keep a `submitting` flag, disable the button while the order is being sent, and ignore submits while it is set. (The server should also refuse duplicates; that is idempotency, which [a later lesson](https://zudojs.oyinlola.site/learn/api-idempotency) builds.)
- Nobody updates them directly. The cart changes its state, renders, and dispatches a `cart:change` event; the badge listens for it.

## Build: a shopping cart

index.html

```ts
<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><title>Oja Groceries</title></head>
<body>
  <header>Oja Groceries · Cart (<span id="badge">0</span>)</header>
  <section id="products">
    <article data-sku="rice-5kg"><h2>Rice 5kg</h2><button type="button" data-action="add">Add to cart</button></article>
    <article data-sku="palm-oil-1l"><h2>Palm oil 1L</h2><button type="button" data-action="add">Add to cart</button></article>
    <article data-sku="garri-2kg"><h2>Garri 2kg</h2><button type="button" data-action="add">Add to cart</button></article>
  </section>
  <form id="cart-form">
    <ul id="cart"></ul>
    <p id="message" role="status"></p>
    <p id="total"></p>
    <button type="submit" id="checkout">Place order</button>
  </form>
  <template id="cart-line">
    <li class="line">
      <span class="name"></span>
      <button type="button" data-action="decrease" aria-label="One less">−</button>
      <input class="qty" inputmode="numeric" aria-label="Quantity">
      <button type="button" data-action="increase" aria-label="One more">+</button>
      <span class="price"></span>
      <button type="button" data-action="remove">Remove</button>
    </li>
  </template>
</body>
</html>
```

cart.js

```ts
const catalog = {
  "rice-5kg": { name: "Rice 5kg", priceKobo: 850_000 },
  "palm-oil-1l": { name: "Palm oil 1L", priceKobo: 230_000 },
  "garri-2kg": { name: "Garri 2kg", priceKobo: 180_000 },
};
const MAX_QTY = 20;
const lines = new Map();
let submitting = false;

const $ = (selector) => document.querySelector(selector);
const naira = (kobo) => `₦${(kobo / 100).toLocaleString("en-NG")}`;
const say = (text) => ($("#message").textContent = text);

function render() {
  const rows = [...lines].map(([sku, qty]) => {
    const li = $("#cart-line").content.firstElementChild.cloneNode(true);
    li.dataset.sku = sku;
    li.querySelector(".name").textContent = catalog[sku].name;
    li.querySelector(".qty").value = String(qty);
    li.querySelector(".price").textContent = naira(catalog[sku].priceKobo * qty);
    return li;
  });
  $("#cart").replaceChildren(...rows);
  let count = 0;
  let totalKobo = 0;
  for (const [sku, qty] of lines) {
    count += qty;
    totalKobo += catalog[sku].priceKobo * qty;
  }
  $("#total").textContent = `Total: ${naira(totalKobo)}`;
  $("#checkout").disabled = submitting || count === 0;
  document.dispatchEvent(new CustomEvent("cart:change", { detail: { count, totalKobo } }));
}

function setQuantity(sku, qty) {
  if (qty > MAX_QTY) return say(`At most ${MAX_QTY} of each item.`);
  if (qty < 1) lines.delete(sku);
  else lines.set(sku, qty);
  say("");
  render();
}

$("#products").addEventListener("click", (event) => {
  const button = event.target.closest('[data-action="add"]');
  if (!button) return;
  const sku = button.closest("[data-sku]").dataset.sku;
  setQuantity(sku, (lines.get(sku) ?? 0) + 1);
});

$("#cart").addEventListener("click", (event) => {
  const button = event.target.closest("[data-action]");
  if (!button) return;
  const sku = button.closest("[data-sku]").dataset.sku;
  const qty = lines.get(sku);
  if (button.dataset.action === "increase") setQuantity(sku, qty + 1);
  if (button.dataset.action === "decrease") setQuantity(sku, qty - 1);
  if (button.dataset.action === "remove") setQuantity(sku, 0);
});

$("#cart").addEventListener("change", (event) => {
  if (!event.target.matches(".qty")) return;
  const sku = event.target.closest("[data-sku]").dataset.sku;
  const text = event.target.value.trim();
  if (!/^[0-9]+$/.test(text) || Number(text) < 1) {
    say(`"${text}" is not a quantity. Use Remove to take an item out.`);
    return render();
  }
  setQuantity(sku, Number(text));
});

$("#cart-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  if (submitting || lines.size === 0) return console.log("submit ignored");
  submitting = true;
  render();
  const order = Object.fromEntries(lines);
  console.log("sending order:", JSON.stringify(order));
  await new Promise((resolve) => setTimeout(resolve, 100));
  lines.clear();
  submitting = false;
  say("Order placed. Thank you!");
  render();
});

document.addEventListener("cart:change", (event) => {
  $("#badge").textContent = String(event.detail.count);
});

// A customer's visit, click by click.
const click = (selector) => $(selector).click();
const typeQty = (sku, text) => {
  const box = $(`#cart [data-sku="${sku}"] .qty`);
  box.value = text;
  box.dispatchEvent(new Event("change", { bubbles: true }));
};
const show = (label) =>
  console.log(`${label}: ${[...lines].map(([s, q]) => `${s}×${q}`).join(", ") || "(empty)"} | ${$("#total").textContent} | badge ${$("#badge").textContent} | ${$("#message").textContent || "-"}`);

render();
click('[data-sku="rice-5kg"] [data-action="add"]');
click('[data-sku="rice-5kg"] [data-action="add"]');
click('[data-sku="palm-oil-1l"] h2');
click('[data-sku="palm-oil-1l"] [data-action="add"]');
show("added");
click('#cart [data-sku="palm-oil-1l"] [data-action="increase"]');
typeQty("rice-5kg", "abc");
show("bad quantity");
typeQty("rice-5kg", "25");
show("too many");
click('#cart [data-sku="palm-oil-1l"] [data-action="remove"]');
show("removed");
$("#cart-form").requestSubmit();
$("#cart-form").requestSubmit();
await new Promise((resolve) => setTimeout(resolve, 200));
show("after checkout");
```

What the browser terminal prints

```ts
added: rice-5kg×2, palm-oil-1l×1 | Total: ₦19,300 | badge 3 | -
bad quantity: rice-5kg×2, palm-oil-1l×2 | Total: ₦21,600 | badge 4 | "abc" is not a quantity. Use Remove to take an item out.
too many: rice-5kg×2, palm-oil-1l×2 | Total: ₦21,600 | badge 4 | At most 20 of each item.
removed: rice-5kg×2 | Total: ₦17,000 | badge 2 | -
sending order: {"rice-5kg":2}
submit ignored
after checkout: (empty) | Total: ₦0 | badge 0 | Order placed. Thank you!
```

Follow the output line by line:

- A click on the product's heading (`h2`) did nothing: the products listener found no `[data-action]` button and returned.
- "abc" and 25 were refused with a message, and `render()` put the real quantity back in the box, so the page never shows a number the cart does not have.
- The two quick submits produced one order. The second found `submitting` set and was ignored; a real user could not even click, because the button was disabled.
- The badge always matched the cart, although no cart code touches it. It only listens for `cart:change`.

## When event code fails

- **Listeners on elements that get replaced.** The bug that opened this lesson, and its twin: re-attaching listeners after every render so that old elements get two. Delegate to a container that is never replaced.
- **`event.target` is a child of what you expected.** `event.target.dataset.action` is `undefined` when the click landed on an icon inside the button. Use `closest`.
- **A form that reloads the page.** Forgetting `preventDefault()` in a `submit` handler sends the form the old way: the page reloads, your state is gone, and the handler's asynchronous work is cut off. If a page "flashes" and forgets everything on submit, look here first.
- **A listener that cannot be removed.** An inline arrow function passed to `addEventListener` can never be passed to `removeEventListener`. Keep a reference, use `{ once: true }`, or use a `signal`.
- **`stopPropagation` breaking someone else.** Outside-click handlers, analytics and shortcuts on ancestors stop working. Check `event.target` instead.
- **Listening to the wrong event.** `click` on a checkbox misses keyboard toggles in some flows, and `keydown` on a text box misses paste and autofill. Use `change` for committed values and `input` for every edit.

## Testing event code

Every example in this lesson is a test in disguise: it builds the page, fires events with `click()` and `dispatchEvent`, and reads the page back. That is how DOM tests work in Vitest with jsdom or happy-dom. Two things to know:

- A real click is several events: `pointerdown`, `mousedown`, focus changes, `pointerup`, `mouseup`, then `click`. `el.click()` fires only the last one. Testing Library's `user-event` package simulates the whole sequence, including typing character by character, which catches bugs like a handler listening to `keyup` when the code sets the value with `paste`.
- Test through the same doors a user uses: click buttons found by their text, type into fields found by their labels, submit the form. Then check what is on the page. Do not call `setQuantity` directly in a test of the cart; that would skip the delegation code, which is where the bugs live.

For debounced code, tests either wait for real time, as the search example did, or use fake timers (`vi.useFakeTimers()` in Vitest), which let a test jump the clock forward 300 ms instantly.

## In production

- **Keyboard and screen readers.** A `<button>` fires `click` for Enter and Space too, so a click listener on a real button works for keyboard users automatically. A click listener on a `<div>` does not. Handle `submit`, not the submit button's `click`, so Enter works in forms.
- **Performance.** One delegated listener beats a thousand individual ones in memory and setup time. Debounce input that triggers work, throttle scroll and resize handlers, and mark touch and wheel listeners `{ passive: true }` so scrolling never waits for your code.
- **Memory.** Remove listeners on `window`, `document` and long-lived objects when a view goes away; an `AbortController` per view makes that one line.
- **Trust.** Anything in the browser can be changed by the user: the `disabled` attribute, `isTrusted` checks, the prices in the page. The server must recompute the total from its own price list and validate every quantity.
- **Errors.** An exception inside a listener does not stop other listeners or the page, but the action silently fails for the user. Report errors from listeners to your logging (a global `error` event listener on `window` catches uncaught ones).

## Practice

TRY IT YOURSELF

### Close a menu on Escape or an outside click

Write `openMenu(menu)` that shows a menu element and closes it (sets `hidden`) when the user presses Escape or clicks anywhere outside it, but not when they click inside it. Clean up both listeners when the menu closes, and do not use `stopPropagation`.

Write it in the editor, then press **Check**. Hints and the solution open up once you have checked your code.

HINT 1

Decide "inside or outside" with `menu.contains(event.target)`, never `stopPropagation`. Give every listener the same `{ signal }` so one `controller.abort()` removes them all.

HINT 2

`document.addEventListener("click", (event) => { if (!menu.contains(event.target)) close("outside click"); }, { signal: controller.signal });` and the same shape for `"keydown"`, checking `event.key === "Escape"`.

SOLUTION

menu.js

```ts
function openMenu(menu, onClose) {
  menu.hidden = false;
  const controller = new AbortController();
  const close = (reason) => {
    menu.hidden = true;
    controller.abort();
    onClose(reason);
  };
  document.addEventListener("click", (event) => {
    if (!menu.contains(event.target)) close("outside click");
  }, { signal: controller.signal });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") close("Escape");
  }, { signal: controller.signal });
}

const menu = document.querySelector("#cart");
const log = (reason) => console.log("closed by", reason, "| hidden:", menu.hidden);

openMenu(menu, log);
document.querySelector("#remove-rice").click();
console.log("after inside click, hidden:", menu.hidden);
document.querySelector("#help").addEventListener("click", (e) => e.preventDefault());
document.querySelector("#help").click();

openMenu(menu, log);
document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
document.querySelector("#help").click();
```

What the browser terminal prints

```ts
after inside click, hidden: false
closed by outside click | hidden: true
closed by Escape | hidden: true
```

`menu.contains(event.target)` decides "inside or outside" without stopping anyone's event. The last click printed nothing: the abort removed both listeners when the menu closed, so a closed menu does not keep reacting.

TRY IT YOURSELF

### Write a throttle

Write `throttle(fn, periodMs)`: the first call runs straight away, and further calls within `periodMs` of the last run are ignored. Test it with calls every 40 ms for 400 ms and a 100 ms period.

Write it in the editor, then press **Check**. Hints and the solution open up once you have checked your code.

HINT 1

Keep `last` in the closure, the same way the worked example does. Compare `performance.now() - last` with `periodMs` before deciding to call `fn`.

HINT 2

`return (...args) => { const now = performance.now(); if (now - last < periodMs) return; last = now; fn(...args); };`

SOLUTION

throttle.js

```ts
function throttle(fn, periodMs) {
  let last = -Infinity;
  return (...args) => {
    const now = performance.now();
    if (now - last < periodMs) return;
    last = now;
    fn(...args);
  };
}

let runs = 0;
const onScroll = throttle(() => runs++, 100);
let calls = 0;
await new Promise((resolve) => {
  const timer = setInterval(() => {
    calls++;
    onScroll();
    if (calls === 10) {
      clearInterval(timer);
      resolve();
    }
  }, 40);
});
console.log("calls:", calls, "runs between 3 and 5:", runs >= 3 && runs <= 5);
```

Output of `node throttle.js` and of the browser terminal

```ts
calls: 10 runs between 3 and 5: true
```

Timers are never exact, so the test checks a range rather than an exact count. A debounce would have run once, after the calls stopped; a throttle runs regularly while they continue, which is what a scroll position indicator needs.

TRY IT YOURSELF

### A keyboard shortcut that respects typing

Pressing n anywhere on the task page should focus the "new task" box, but not when the user is already typing in a text field (they want the letter n). Write the listener and test both cases.

Write it in the editor, then press **Check**. Hints and the solution open up once you have checked your code.

HINT 1

One `if` with several conditions joined by `||` covers every reason to do nothing; only when none of them is true do you `preventDefault()` and focus.

HINT 2

`const typing = event.target.closest("input, textarea, select, [contenteditable]"); if (event.key !== "n" || typing || event.ctrlKey || event.metaKey || event.altKey) return; event.preventDefault(); nameBox.focus();`

SOLUTION

shortcut.js

```ts
const nameBox = document.querySelector('input[name="name"]');
const phone = document.querySelector('input[name="phone"]');

document.addEventListener("keydown", (event) => {
  const typing = event.target.closest("input, textarea, select, [contenteditable]");
  if (event.key !== "n" || typing || event.ctrlKey || event.metaKey || event.altKey) return;
  event.preventDefault();
  nameBox.focus();
});

function press(target, options = {}) {
  const event = new KeyboardEvent("keydown", { key: "n", bubbles: true, cancelable: true, ...options });
  target.dispatchEvent(event);
  return event.defaultPrevented ? "shortcut ran" : "left alone";
}

console.log("n on the page:", press(document.body));
console.log("n in the phone box:", press(phone));
console.log("Ctrl+n on the page:", press(document.body, { ctrlKey: true }));
```

What the browser terminal prints

```ts
n on the page: shortcut ran
n in the phone box: left alone
Ctrl+n on the page: left alone
```

The listener sits on `document` and uses the target to decide. The test reads `defaultPrevented` to see whether the shortcut ran; in the real page, `preventDefault()` also stops the "n" from being typed into the box it just focused. Ignoring presses with Ctrl, Cmd or Alt keeps browser shortcuts working.

## Summary

- `addEventListener(type, listener, options)` adds any number of listeners. The event object says what happened: `type`, `target` (where it happened), `currentTarget` (whose listener is running), `isTrusted`.
- Events travel down from `window` to the target (capture), then back up (bubble). Normal listeners run while bubbling. Avoid `stopPropagation`; decide with `event.target` instead.
- `preventDefault()` cancels the browser's default action (navigate, tick, submit); it does not stop propagation.
- Event delegation: one listener on a container, `event.target.closest(selector)` to find the element, `dataset` to find the data. It covers elements added later.
- Custom events (`CustomEvent` with `detail`, or your own `EventTarget` subclass) let parts of a page react to each other without knowing about each other. `dispatchEvent` runs the listeners synchronously.
- Handle `submit` with `preventDefault()` and `FormData`; use `input` for every edit, `change` for committed values; debounce work triggered by typing.
- Remove listeners with the same function reference, `{ once: true }`, or an `AbortSignal`.

Next: [Browser APIs](https://zudojs.oyinlola.site/learn/browser-apis): fetch, storage, URLs, the History API, timers and workers, the other tools the browser gives your code.

## Test yourself

Five questions, picked at random from this lesson's question bank. Some ask you to choose an answer, some to predict what code prints, and some to write code and run it in the terminal. Get 4 of 5 right to pass. If you don't, read the explanations and try again: you get 5 different questions.
