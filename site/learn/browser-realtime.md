---
title: "Real-time and background work — ZudoJS Academy"
description: "Push live updates to a page with Server-Sent Events and WebSockets, each with a Node.js server, and move heavy page work to Web Workers with messages."
source: https://zudojs.oyinlola.site/learn/browser-realtime
---

LEVEL 4 · LESSON 14 OF 20

JavaScript in the browser Core

# Real-time and background work

Push live updates to a page with Server-Sent Events and WebSockets, each with a Node.js server, and move heavy page work to Web Workers with messages.

- **60 min** to read and try
- **You need:** Networking from JavaScript, Browser APIs, and Streams and buffers
- **You build:** A live order-status feed with Server-Sent Events that survives disconnects, a courier chat over WebSockets with origin checks, and a Web Worker that reports progress

  [Test yourself](#test)

BY THE END OF THIS LESSON YOU CAN

- Explain why polling scales badly and when pushing updates is worth it
- Stream events from node:http with Server-Sent Events, and resume after a disconnect with Last-Event-ID
- Build a WebSocket server with the ws package that checks the Origin, validates every message and routes by room
- Use a Web Worker with message passing, including copies, transfers, errors and progress
- Choose between polling, Server-Sent Events, WebSockets and workers for a given feature

## The order page that keeps asking

Oja Groceries shows each customer a page for their order: *paid*, *packed*, *out for delivery*, *delivered*. The first version uses what you already know: every five seconds, the page calls `fetch("/orders/ORD-1042")` and redraws. This is **polling**, and on a busy evening it hurts:

- With 10,000 customers watching their orders, the server answers 2,000 requests every second. An order changes status four times in about an hour, so almost every answer says "nothing new".
- The customer still waits up to five seconds to see a change. Poll every second to fix that, and the server gets five times the load.
- Each request carries full HTTP headers and cookies, and each answer is a full JSON document, again and again.

What the page really wants is for the server to **push**: "tell me when something changes". HTTP as you have used it cannot do that: the client asks, the server answers, and the exchange is over. This lesson covers the two browser tools for pushing, **Server-Sent Events** and **WebSockets**, each with a Node.js server. It also covers a third tool that is not about the network at all but is often grouped with them, **Web Workers**, which keep a page responsive while it does heavy work in the background.

## Four ways to get updates

| Technique | Direction | How | Good for |
| --- | --- | --- | --- |
| Polling | client asks repeatedly | ordinary `fetch` on a timer | rare checks, simple dashboards, "has my export finished?" |
| Long polling | client asks, server waits to answer | the server holds each request open until there is news (or a timeout), then the client asks again | old browsers and networks that block everything else |
| Server-Sent Events (SSE) | server → client | one long HTTP response that the server keeps writing events into; `EventSource` in the browser | notifications, order status, live scores, progress of a server job |
| WebSocket | both ways | an HTTP request that is upgraded into a two-way connection for messages | chat, multiplayer games, collaborative editing, live location |

Web Workers are not in the table because they do not talk to a server. They run code on another thread inside the page, and the page talks to them with messages, a pattern you will recognise from WebSockets.

## Server-Sent Events

With Server-Sent Events, the page makes one ordinary HTTP request, and the server never finishes its response. It sends the header `Content-Type: text/event-stream`, and then writes **events** whenever it has news, as plain text:

```ts
retry: 2000

id: 1
event: status
data: {"status":"paid"}

: keep-alive

id: 2
event: status
data: {"status":"packed"}
```

- An event is a group of `field: value` lines, ended by a blank line.
- `data:` is the payload (several `data:` lines are joined with line breaks). `event:` names the event type; without it the type is `message`.
- `id:` labels the event. If the connection drops, the browser reconnects by itself and sends the last id it saw in a `Last-Event-ID` request header, so the server can continue from there.
- `retry:` tells the browser how many milliseconds to wait before reconnecting. A line starting with `:` is a comment, used as a heartbeat so that proxies do not close a quiet connection.

In the browser, `EventSource` reads the stream and turns each event into a DOM event. The preview has no server to connect to, so the example serves a recorded stream from a `blob:` URL; the browser parses it exactly as it would a live one, and even reconnects when it ends:

index.html

```ts
<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><title>Order ORD-1042</title></head>
<body>
  <h1>Order ORD-1042</h1>
  <p id="status">Waiting for updates…</p>
  <ol id="timeline"></ol>
  <p id="progress"></p>
</body>
</html>
```

event-source.js

```ts
const recording = [
  "retry: 50", "",
  "id: 1", "event: status", 'data: {"status":"paid"}', "",
  ": keep-alive", "",
  "id: 2", "event: status", 'data: {"status":"packed"}', "",
  "id: 3", "data: Your rider is Musa.", "data: He will call on arrival.", "",
].join("\n") + "\n";
const url = URL.createObjectURL(new Blob([recording], { type: "text/event-stream" }));

const source = new EventSource(url);
await new Promise((resolve) => {
  let errors = 0;
  source.onopen = () => console.log("open, readyState", source.readyState);
  source.addEventListener("status", (event) => {
    console.log(`status event #${event.lastEventId}:`, JSON.parse(event.data).status);
  });
  source.onmessage = (event) => console.log(`message #${event.lastEventId}:`, JSON.stringify(event.data));
  source.onerror = () => {
    errors++;
    console.log("stream ended, readyState", source.readyState, "(reconnecting)");
    if (errors === 2) {
      source.close();
      resolve();
    }
  };
});
console.log("closed, readyState", source.readyState);
URL.revokeObjectURL(url);
```

What the browser terminal prints

```ts
open, readyState 1
status event #1: paid
status event #2: packed
message #3: "Your rider is Musa.\nHe will call on arrival."
stream ended, readyState 0 (reconnecting)
open, readyState 1
status event #1: paid
status event #2: packed
message #3: "Your rider is Musa.\nHe will call on arrival."
stream ended, readyState 0 (reconnecting)
closed, readyState 2
```

Look at what the browser did on its own. It parsed named `status` events and plain messages, joined the two `data:` lines, skipped the comment, and exposed each id as `lastEventId`. When the stream ended, it fired `error`, set `readyState` to 0 (`CONNECTING`), waited the 50 ms from `retry:`, and connected again. A recording cannot resume from `Last-Event-ID`, so the second connection replayed all three events: exactly the duplicates a real server must avoid by honouring that header. `source.close()` (state 2, `CLOSED`) is the only way to stop reconnecting.

### An SSE server in Node.js

The server side needs nothing but `node:http`. A **feed** keeps the history of one order's events and the list of open responses. Publishing writes the event into every open response; a new connection first receives everything after its `Last-Event-ID`:

src/feed.jsNode.js only

```ts
export function createFeed() {
  const history = [];
  const listeners = new Set();

  const format = ({ id, event, data }) => `id: ${id}\nevent: ${event}\ndata: ${JSON.stringify(data)}\n\n`;

  return {
    publish(event, data) {
      const entry = { id: history.length + 1, event, data };
      history.push(entry);
      for (const res of listeners) res.write(format(entry));
    },
    subscribe(req, res) {
      res.writeHead(200, { "Content-Type": "text/event-stream", "Cache-Control": "no-store", Connection: "keep-alive" });
      res.write("retry: 100\n\n");
      const lastId = Number(req.headers["last-event-id"] ?? 0);
      for (const entry of history) if (entry.id > lastId) res.write(format(entry));
      listeners.add(res);
      const heartbeat = setInterval(() => res.write(": keep-alive\n\n"), 15_000);
      req.on("close", () => {
        clearInterval(heartbeat);
        listeners.delete(res);
      });
    },
    dropAll() {
      for (const res of listeners) res.end();
      listeners.clear();
    },
  };
}
```

Node.js has no built-in `EventSource`, so the Node.js client reads the stream with `fetch`: the response body arrives in chunks, `TextDecoderStream` turns bytes into text, and a small parser splits it into events at blank lines. (A chunk can end in the middle of an event, which is why the parser keeps a buffer.) This is what `EventSource` does inside the browser:

src/read-events.jsNode.js only

```ts
export async function* readEvents(response) {
  let buffer = "";
  for await (const chunk of response.body.pipeThrough(new TextDecoderStream())) {
    buffer += chunk;
    let end;
    while ((end = buffer.indexOf("\n\n")) !== -1) {
      const block = buffer.slice(0, end);
      buffer = buffer.slice(end + 2);
      const event = { id: undefined, event: "message", data: [] };
      for (const line of block.split("\n")) {
        if (line === "" || line.startsWith(":")) continue;
        const colon = line.indexOf(":");
        const field = colon === -1 ? line : line.slice(0, colon);
        const value = colon === -1 ? "" : line.slice(colon + 1).replace(/^ /, "");
        if (field === "data") event.data.push(value);
        if (field === "event") event.event = value;
        if (field === "id") event.id = value;
      }
      if (event.data.length > 0) yield { ...event, data: event.data.join("\n") };
    }
  }
}
```

Now a server with one route, `/orders/ORD-1042/events`, and a client that watches it:

sse.jsNode.js only

```ts
import { once } from "node:events";
import { createServer } from "node:http";
import { createFeed } from "./src/feed.js";
import { readEvents } from "./src/read-events.js";

const feed = createFeed();
const server = createServer((req, res) => {
  if (req.url === "/orders/ORD-1042/events") return feed.subscribe(req, res);
  res.writeHead(404).end();
});
server.listen(0);
await once(server, "listening");

feed.publish("status", { status: "paid" });

const response = await fetch(`http://localhost:${server.address().port}/orders/ORD-1042/events`);
console.log(response.status, response.headers.get("content-type"));

const events = readEvents(response);
console.log((await events.next()).value);
feed.publish("status", { status: "packed" });
console.log((await events.next()).value);

await events.return();
server.close();
```

Output of `node sse.js`

```ts
200 text/event-stream
{ id: '1', event: 'status', data: '{"status":"paid"}' }
{ id: '2', event: 'status', data: '{"status":"packed"}' }
```

The event published before the client connected arrived first, replayed from the history; the second arrived the moment it was published, over the same response. One request, as many events as the server likes.

## WebSockets

Server-Sent Events only go one way. The courier delivering ORD-1042 shares their location, and the customer wants to reply "the gate is on the left". For messages in both directions, the browser offers **WebSockets**.

A WebSocket starts as an HTTP request with the headers `Connection: Upgrade` and `Upgrade: websocket`. If the server agrees, it answers `101 Switching Protocols`, and from then on the same TCP connection carries **messages** (text or binary, in small frames) in both directions at any time, until either side closes it. The addresses use `ws://`, or `wss://` over TLS, which is what production uses.

In the browser the API is small:

```ts
const socket = new WebSocket("wss://live.oja.example/orders/ORD-1042/live");
socket.addEventListener("open", () => socket.send(JSON.stringify({ type: "chat", text: "Gate is on the left" })));
socket.addEventListener("message", (event) => console.log(JSON.parse(event.data)));
socket.addEventListener("close", (event) => console.log("closed", event.code, event.wasClean));
```

Node.js 24 has the same `WebSocket` class built in, so the clients below use it unchanged. For the server, the de-facto standard package is `ws` (install it with `npm install ws`).

> WATCH OUT
>
> WebSockets are not covered by CORS. Any web page can open a WebSocket to your server, and the browser will attach the user's cookies to the handshake. The browser does send an honest `Origin` header, so the server **must check it** during the upgrade, or a malicious site can talk to your server as the logged-in user. This attack is called cross-site WebSocket hijacking.

The server accepts connections to `/orders/<id>/live`, checks the origin before upgrading, and puts every socket for the same order in a **room**. Every message is untrusted input: it is parsed inside `try`, checked for its type and fields, and only then sent on to the others in the room:

src/live.jsNode.js only

```ts
import { createServer } from "node:http";
import { WebSocketServer } from "ws";

const isNumberIn = (value, min, max) => typeof value === "number" && value >= min && value <= max;

export function createLiveServer({ allowedOrigins }) {
  const server = createServer((req, res) => res.writeHead(404).end());
  const wss = new WebSocketServer({ noServer: true, maxPayload: 4096 });
  const rooms = new Map();

  server.on("upgrade", (req, socket, head) => {
    const url = new URL(req.url, "http://localhost");
    const match = url.pathname.match(/^\/orders\/(ORD-[0-9]+)\/live$/);
    const role = url.searchParams.get("role");
    if (!match || !allowedOrigins.includes(req.headers.origin) || !["customer", "courier"].includes(role)) {
      socket.end("HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n");
      return;
    }
    wss.handleUpgrade(req, socket, head, (ws) => join(ws, match[1], role));
  });

  function join(ws, orderId, role) {
    if (!rooms.has(orderId)) rooms.set(orderId, new Set());
    const room = rooms.get(orderId);
    room.add(ws);
    const reply = (message) => ws.send(JSON.stringify(message));

    ws.on("message", (data) => {
      let message;
      try {
        message = JSON.parse(String(data));
      } catch {
        return reply({ type: "error", error: "Messages must be JSON" });
      }
      if (message?.type === "chat" && typeof message.text === "string" && message.text.trim() !== "" && message.text.length <= 500) {
        return broadcast(room, ws, { type: "chat", from: role, text: message.text.trim() });
      }
      if (message?.type === "location" && role === "courier" && isNumberIn(message.lat, -90, 90) && isNumberIn(message.lng, -180, 180)) {
        return broadcast(room, ws, { type: "location", lat: message.lat, lng: message.lng });
      }
      reply({ type: "error", error: `Not allowed: ${String(message?.type)} from ${role}` });
    });

    ws.on("close", () => {
      room.delete(ws);
      if (room.size === 0) rooms.delete(orderId);
    });
  }

  function broadcast(room, sender, message) {
    const text = JSON.stringify(message);
    for (const peer of room) {
      if (peer !== sender && peer.readyState === peer.OPEN) peer.send(text);
    }
  }

  return server;
}
```

A customer and a courier join the room for ORD-1042 and exchange messages. Node.js's `WebSocket` accepts a `headers` option (browsers do not have it) that the example uses to send the `Origin` a browser would send by itself:

ws-demo.jsNode.js only

```ts
import { once } from "node:events";
import { createLiveServer } from "./src/live.js";

const server = createLiveServer({ allowedOrigins: ["https://oja.example"] });
server.listen(0);
await once(server, "listening");
const base = `ws://localhost:${server.address().port}/orders/ORD-1042/live`;

function connect(role, origin = "https://oja.example") {
  const socket = new WebSocket(`${base}?role=${role}`, { headers: { Origin: origin } });
  return new Promise((resolve, reject) => {
    socket.addEventListener("open", () => resolve(socket), { once: true });
    socket.addEventListener("close", (event) => reject(new Error(`closed with code ${event.code}`)), { once: true });
  });
}

function nextMessage(socket) {
  return new Promise((resolve) => {
    socket.addEventListener("message", (event) => resolve(JSON.parse(event.data)), { once: true });
  });
}

const customer = await connect("customer");
const courier = await connect("courier");
console.log("both connected, readyState", customer.readyState);

customer.send(JSON.stringify({ type: "chat", text: "Gate is on the left" }));
console.log("courier got:", await nextMessage(courier));

courier.send(JSON.stringify({ type: "location", lat: 6.5244, lng: 3.3792 }));
console.log("customer got:", await nextMessage(customer));

customer.send(JSON.stringify({ type: "location", lat: 0, lng: 0 }));
console.log("customer got:", await nextMessage(customer));

customer.send("hello?");
console.log("customer got:", await nextMessage(customer));

try {
  await connect("customer", "https://evil.example");
} catch (error) {
  console.log("page on evil.example:", error.message);
}

const closed = [customer, courier].map((socket) => new Promise((resolve) => {
  socket.addEventListener("close", (event) => resolve(`${event.code} ${event.reason}`), { once: true });
}));
customer.close(1000, "order delivered");
courier.close(1000, "order delivered");
console.log("closed:", await Promise.all(closed));
server.close();
```

Output of `node ws-demo.js`

```ts
both connected, readyState 1
courier got: { type: 'chat', from: 'customer', text: 'Gate is on the left' }
customer got: { type: 'location', lat: 6.5244, lng: 3.3792 }
customer got: { type: 'error', error: 'Not allowed: location from customer' }
customer got: { type: 'error', error: 'Messages must be JSON' }
page on evil.example: closed with code 1006
closed: [ '1000 order delivered', '1000 order delivered' ]
```

Each rule showed up: the chat reached only the other member of the room, the courier's location was relayed, the customer was not allowed to send a location, text that is not JSON was refused with a message instead of crashing the server, and a page on another site was turned away before the upgrade, with close code 1006 ("closed abnormally", the code a browser also reports when a handshake is refused). A normal close uses code 1000.

### Keeping a WebSocket healthy

- **Dead connections.** A phone that loses signal does not say goodbye; the server may think it is connected for minutes. Servers send a **ping** every 30 seconds or so (`ws` has `socket.ping()`, and the other side answers with a pong automatically) and close sockets that stop answering.
- **Reconnecting.** Unlike `EventSource`, a browser `WebSocket` never reconnects by itself. Your code listens for `close` and reconnects with increasing delays (exercise 2), and then asks the server for anything it missed, because messages sent while it was away are gone.
- **Backpressure.** `send` never blocks. If you send faster than the network carries, messages pile up in memory; `socket.bufferedAmount` tells you how many bytes are waiting. Slow down or drop old updates (a location that is 10 seconds old is worthless anyway).
- **Size limits.** `maxPayload: 4096` makes `ws` close any connection that sends a larger message, so nobody can fill the server's memory with one giant message.

## Web Workers and message passing

[Browser APIs](https://zudojs.oyinlola.site/learn/browser-apis#workers) introduced workers: a script on its own thread, with no DOM, talking to the page through `postMessage`. The details of that message passing decide whether worker code is correct.

### Messages are copies, unless you transfer

`postMessage` copies its data with the **structured clone** algorithm: objects, arrays, `Map`, `Set`, `Date`, typed arrays and more, but not functions or DOM nodes. The worker gets its own copy; changing it does not change the page's object. Copying a large buffer takes time, so some objects, such as an `ArrayBuffer`, can be **transferred** instead: ownership moves to the worker, instantly, and the sender's buffer becomes empty:

worker-copy.js

```ts
function startWorker(source) {
  const url = URL.createObjectURL(new Blob([source], { type: "text/javascript" }));
  const worker = new Worker(url);
  URL.revokeObjectURL(url);
  return worker;
}
const reply = (worker) => new Promise((resolve) => worker.addEventListener("message", (e) => resolve(e.data), { once: true }));

const worker = startWorker(`
  self.onmessage = (event) => {
    const order = event.data;
    if (order.items) order.items.push("changed by the worker");
    self.postMessage({ items: order.items, bytes: order.photo?.byteLength });
  };
`);

const order = { id: "ORD-1042", items: ["Rice 5kg"] };
worker.postMessage(order);
console.log("worker saw:", (await reply(worker)).items);
console.log("page still has:", order.items);

const photo = new ArrayBuffer(2_000_000);
worker.postMessage({ photo }, [photo]);
console.log("worker received bytes:", (await reply(worker)).bytes);
console.log("page's buffer after transfer:", photo.byteLength);

try {
  worker.postMessage({ onDone: () => console.log("done") });
} catch (error) {
  console.log("sending a function:", error.name);
}
worker.terminate();
```

What the browser terminal prints

```ts
worker saw: [ 'Rice 5kg', 'changed by the worker' ]
page still has: [ 'Rice 5kg' ]
worker received bytes: 2000000
page's buffer after transfer: 0
sending a function: DataCloneError
```

### Requests, replies and errors

A worker is like a tiny server inside the page: the page sends requests, the worker answers. With several requests in flight, the page needs to know which answer belongs to which request, so each request carries an **id**, the same idea as the `id:` of an SSE event. A small wrapper turns that into promises, and turns errors inside the worker into rejections, because an exception on the worker's thread cannot reach a `try` on the page's thread by itself:

worker-rpc.js

```ts
const source = `
  const handlers = {
    totalKobo: (lines) => lines.reduce((sum, line) => sum + line.priceKobo * line.qty, 0),
    slowest: (orders) => orders.reduce((a, b) => (b.minutes > a.minutes ? b : a)).id,
  };
  self.onmessage = ({ data: { id, method, args } }) => {
    try {
      if (!handlers[method]) throw new Error("unknown method " + method);
      self.postMessage({ id, result: handlers[method](args) });
    } catch (error) {
      self.postMessage({ id, error: error.message });
    }
  };
`;
const worker = new Worker(URL.createObjectURL(new Blob([source], { type: "text/javascript" })));

let nextId = 1;
const pending = new Map();
worker.onmessage = ({ data }) => {
  const call = pending.get(data.id);
  pending.delete(data.id);
  if ("error" in data) call.reject(new Error(data.error));
  else call.resolve(data.result);
};
function callWorker(method, args) {
  return new Promise((resolve, reject) => {
    const id = nextId++;
    pending.set(id, { resolve, reject });
    worker.postMessage({ id, method, args });
  });
}

const [total, slowest] = await Promise.all([
  callWorker("totalKobo", [{ priceKobo: 850_000, qty: 2 }, { priceKobo: 230_000, qty: 1 }]),
  callWorker("slowest", [{ id: "ORD-1040", minutes: 35 }, { id: "ORD-1042", minutes: 52 }]),
]);
console.log(`total: ₦${total / 100}, slowest delivery: ${slowest}`);

for (const [method, args] of [["slowest", []], ["refund", {}]]) {
  try {
    await callWorker(method, args);
  } catch (error) {
    console.log(`${method} failed:`, error.message);
  }
}
worker.terminate();
```

What the browser terminal prints

```ts
total: ₦19300, slowest delivery: ORD-1042
slowest failed: Reduce of empty array with no initial value
refund failed: unknown method refund
```

The empty list made `reduce` throw inside the worker; the wrapper caught it there and sent it back as an error message, so the page's `await` rejected normally. An error the worker does not catch fires an `error` event on the `Worker` object instead, and any promises waiting for it would hang; so catch inside the worker, and give calls a timeout. Libraries such as Comlink build this wrapper for you.

### Progress from long work

A worker can post as many messages as it likes while it works, which is how a page shows a progress bar for a long job. The worker adds up a year of invoices in chunks and reports after each quarter:

worker-progress.js

```ts
const source = `
  self.onmessage = ({ data: count }) => {
    let totalKobo = 0;
    for (let i = 1; i <= count; i++) {
      totalKobo += 100_000 + (i % 13) * 5_000;
      if (i % (count / 4) === 0) self.postMessage({ type: "progress", percent: (i / count) * 100 });
    }
    self.postMessage({ type: "done", totalKobo });
  };
`;
const worker = new Worker(URL.createObjectURL(new Blob([source], { type: "text/javascript" })));
const bar = document.querySelector("#progress");

const result = await new Promise((resolve) => {
  worker.onmessage = ({ data }) => {
    if (data.type === "progress") {
      bar.textContent = `Adding up invoices… ${data.percent}%`;
      console.log(bar.textContent);
    } else {
      resolve(data);
    }
  };
  worker.postMessage(400_000);
});
bar.textContent = `Year total: ₦${(result.totalKobo / 100).toLocaleString("en-NG")}`;
console.log(bar.textContent);
worker.terminate();
```

What the browser terminal prints

```ts
Adding up invoices… 25%
Adding up invoices… 50%
Adding up invoices… 75%
Adding up invoices… 100%
Year total: ₦519,999,400
```

While the worker counted, the page's thread was free to update the bar and answer clicks. Two relatives are worth knowing by name: a **SharedWorker** is one worker shared by all tabs of an origin (one WebSocket for all open tabs, for example), and a **service worker** sits between the page and the network for offline support and push notifications. On the server, Node.js has worker threads with the same message-passing design ([Events, processes and workers](https://zudojs.oyinlola.site/learn/node-events-processes#workers)).

## Choosing the right tool

- Updates only flow from server to client, a few per minute or second: **Server-Sent Events**. It is plain HTTP, so cookies, proxies, HTTP/2 and your existing authentication all just work, and reconnecting with resume is built in.
- Both sides send often, or you need low latency both ways (chat, games, collaborative editing, live location): **WebSockets**, with your own reconnection, heartbeats and message format.
- Updates are rare, or a few seconds late does not matter: plain **polling**, which needs no extra infrastructure. Add an `ETag` so unchanged answers are tiny `304`s.
- The page freezes because of its own work (parsing, image processing, big calculations): a **Web Worker**. Pushing updates will not help with that.

Other tools exist for special cases: **WebRTC** for audio, video and peer-to-peer data between browsers, and **WebTransport**, a newer two-way transport over HTTP/3.

## Before you build: a feed that survives the real world

The order page will use Server-Sent Events: only the server has news, and the news is a handful of status changes. The happy path is easy. The real work is everything around it.

REASON IT OUT

### What can go wrong with a live feed?

- The customer's phone switches from Wi-Fi to mobile data for three seconds, and the order goes "out for delivery" during those seconds. What does the page show afterwards?
- The browser reconnects and the server replays the history. Can the page end up showing an event twice, or a status going backwards?
- The page is opened long after the order was paid. What does it show first?
- The server restarts. What happens to the open connections and the history?
- Who may subscribe to `/orders/ORD-1042/events`?

**Show the reasoning**

- With `id:` on every event, the browser reconnects with `Last-Event-ID`, and the server sends what was missed. Without ids, the event is simply lost, and the page shows a stale status until the next change.
- Only if the client is careless. Remember the last id handled and ignore anything not newer. Each status event carries the whole new status (not "move one step forward"), so applying one twice does no harm; such events are **idempotent**.
- The history replay (everything after id 0) brings a new page up to date. For long histories, a server sends a **snapshot** (the current state) first, then only new events.
- Connections drop and the browser reconnects to the new process. If the history lived only in memory, it is gone: real servers keep events in a database or a message broker, and use ids that survive restarts.
- Only the customer who placed the order (and staff). The SSE request is an ordinary HTTP request, so it carries the session cookie; the server checks that the session's user owns the order, exactly like the Task API checked task owners.

## Build: a live order-status feed

The client side of the feed does what `EventSource` does, written out so you can see every step: connect, handle events, remember the last id, and when the stream breaks, wait and reconnect with `Last-Event-ID`. It ignores events it has already applied, and stops for good when the order is delivered:

src/watch.jsNode.js only

```ts
import { readEvents } from "./read-events.js";

export async function watchOrder(url, { onStatus, onReconnect, retryMs = 100, signal }) {
  let lastId = 0;
  for (;;) {
    try {
      const response = await fetch(url, { headers: lastId ? { "Last-Event-ID": String(lastId) } : {}, signal });
      if (!response.ok) throw new Error(`feed answered ${response.status}`);
      for await (const event of readEvents(response)) {
        const id = Number(event.id);
        if (id <= lastId) continue;
        lastId = id;
        const { status } = JSON.parse(event.data);
        onStatus(status, id);
        if (status === "delivered") return;
      }
    } catch (error) {
      if (error.name === "AbortError") return;
      throw error;
    }
    onReconnect(lastId);
    await new Promise((resolve) => setTimeout(resolve, retryMs));
  }
}
```

Now the whole evening of order ORD-1042, including a dropped connection with an update in the middle of it:

order-feed.jsNode.js only

```ts
import { once } from "node:events";
import { createServer } from "node:http";
import { createFeed } from "./src/feed.js";
import { watchOrder } from "./src/watch.js";

const feed = createFeed();
const server = createServer((req, res) => {
  if (req.url === "/orders/ORD-1042/events") return feed.subscribe(req, res);
  res.writeHead(404).end();
});
server.listen(0);
await once(server, "listening");

let waiting;
const nextStatus = () => new Promise((resolve) => (waiting = resolve));

feed.publish("status", { status: "paid" });
const watching = watchOrder(`http://localhost:${server.address().port}/orders/ORD-1042/events`, {
  onStatus(status, id) {
    console.log(`page shows: ${status} (event ${id})`);
    waiting?.(status);
  },
  onReconnect(lastId) {
    console.log(`connection lost, reconnecting with Last-Event-ID: ${lastId}`);
  },
});

await nextStatus();
feed.publish("status", { status: "packed" });
await nextStatus();

console.log("--- the phone loses signal");
feed.dropAll();
feed.publish("status", { status: "out for delivery" });
await nextStatus();

feed.publish("status", { status: "delivered" });
await watching;
console.log("feed finished; the page stopped listening");
server.close();
```

Output of `node order-feed.js`

```ts
page shows: paid (event 1)
page shows: packed (event 2)
--- the phone loses signal
connection lost, reconnecting with Last-Event-ID: 2
page shows: out for delivery (event 3)
page shows: delivered (event 4)
feed finished; the page stopped listening
```

"Out for delivery" was published while the client was disconnected. When it reconnected, it sent `Last-Event-ID: 2`, the server replayed only event 3, and the page caught up without a duplicate or a gap. After "delivered", the client stopped instead of reconnecting forever.

In the browser, the page uses `EventSource`, which does the reconnecting for you, and renders a timeline from the events. The example feeds it a recording that includes a duplicate and an event that arrives out of order after a reconnect, to show why the page checks ids:

status-page.js

```ts
const recording = [
  "retry: 50", "",
  "id: 1", "event: status", 'data: {"status":"paid"}', "",
  "id: 2", "event: status", 'data: {"status":"packed"}', "",
  "id: 2", "event: status", 'data: {"status":"packed"}', "",
  "id: 1", "event: status", 'data: {"status":"paid"}', "",
  "id: 3", "event: status", 'data: {"status":"out for delivery"}', "",
  "id: 4", "event: status", 'data: {"status":"delivered"}', "",
].join("\n") + "\n";
const url = URL.createObjectURL(new Blob([recording], { type: "text/event-stream" }));

const statusLine = document.querySelector("#status");
const timeline = document.querySelector("#timeline");
let lastId = 0;

const source = new EventSource(url);
await new Promise((resolve) => {
  source.addEventListener("status", (event) => {
    const id = Number(event.lastEventId);
    if (id <= lastId) {
      console.log(`ignored event ${id}: already applied`);
      return;
    }
    lastId = id;
    const { status } = JSON.parse(event.data);
    statusLine.textContent = `Your order is ${status}.`;
    const item = document.createElement("li");
    item.textContent = status;
    timeline.append(item);
    if (status === "delivered") {
      source.close();
      resolve();
    }
  });
});
console.log(statusLine.textContent);
console.log("timeline:", [...timeline.children].map((li) => li.textContent));
URL.revokeObjectURL(url);
```

What the browser terminal prints

```ts
ignored event 2: already applied
ignored event 1: already applied
Your order is delivered.
timeline: [ 'paid', 'packed', 'out for delivery', 'delivered' ]
```

The status text uses `textContent`, because event data comes from the network, and closing the source after "delivered" stops the browser from reconnecting to a feed that has nothing more to say.

## When real-time code fails

- **Buffering proxies.** A reverse proxy or compression middleware that collects the whole response before passing it on turns an event stream into nothing at all, until it times out. Turn buffering and compression off for event-stream routes (for nginx, the `X-Accel-Buffering: no` header), and send heartbeat comments.
- **Idle timeouts.** Load balancers close connections that are quiet for 60 seconds or so. Heartbeats (SSE comments, WebSocket pings) keep them open and detect dead ones.
- **Connection limits.** Over HTTP/1.1, a browser allows only six connections per host, and each open `EventSource` uses one. Seven tabs of your site and the seventh hangs. HTTP/2 removes this limit; otherwise share one connection between tabs.
- **Missed messages.** WebSockets have no replay. After a reconnect, fetch the current state before applying new messages, or give messages ids and let the client ask for what it missed.
- **Trusting messages.** A WebSocket message is input from a stranger, like a request body. Parse it safely, check its shape and size, check that this user may send it, and never put it in `innerHTML`.
- **Worker errors that vanish.** An uncaught exception in a worker fires `error` on the `Worker`, not in your page's `try`. Catch inside the worker and send the error back.

## Testing real-time code

- **Parsers and message handlers are pure functions.** Test `readEvents` with a `Response` made from a string, including an event split across two chunks. Test the WebSocket message validation with good and bad messages, without a network.
- **Servers on port 0.** Every Node.js example in this lesson is an integration test: start the server on a free port, connect real clients, assert on what they receive, and close everything. Wait for specific messages (as `nextMessage` did), never for fixed amounts of time.
- **Failure injection.** The build called `dropAll()` to cut connections on purpose. Test reconnection, duplicates and out-of-order delivery the same way, because in production they are not rare.
- **Browser tests** with Playwright can intercept WebSocket and event-stream traffic to replay recorded sessions against the real page.

## In production

- **Authentication.** An SSE request carries cookies like any request. A WebSocket handshake carries cookies too (checked during the `upgrade`), but the demo's `?role=` is for teaching only: a real server decides the role from the session, never from the URL. For WebSockets across origins, a common pattern is a short-lived, single-use ticket fetched over authenticated HTTP.
- **Many servers.** With two server processes behind a load balancer, the customer may be connected to one and the courier to the other. Rooms then need a shared message bus (Redis pub/sub, NATS, a message broker) so every process sees every message. The ZudoJS lesson [Messaging](https://zudojs.oyinlola.site/learn/zudo-messaging) and the distributed systems lessons build on this.
- **Connections cost memory.** Each open connection holds a socket and buffers. Plan capacity in connections, not only requests per second, and close idle ones.
- **Mobile networks.** Expect connections to drop constantly. Reconnect with exponential backoff and random jitter, and pause feeds in hidden tabs (the `visibilitychange` event) to save battery.
- **Graceful shutdown.** When a server restarts, close WebSockets with code 1012 ("service restart") and end event streams, so clients reconnect promptly to the new process.

## Practice

TRY IT YOURSELF

### Parse one event block

Write `parseEvent(block)` for a single SSE event block (the text between two blank lines). It returns `{ event, id, data, retry }`, joins several `data` lines with `"\n"`, removes one space after the colon, ignores comments, and returns `null` when there is no data.

**Show a solution**

parse-event.js

```ts
function parseEvent(block) {
  const result = { event: "message", id: undefined, data: [], retry: undefined };
  for (const line of block.split("\n")) {
    if (line === "" || line.startsWith(":")) continue;
    const colon = line.indexOf(":");
    const field = colon === -1 ? line : line.slice(0, colon);
    const value = colon === -1 ? "" : line.slice(colon + 1).replace(/^ /, "");
    if (field === "data") result.data.push(value);
    else if (field === "event") result.event = value;
    else if (field === "id") result.id = value;
    else if (field === "retry" && /^[0-9]+$/.test(value)) result.retry = Number(value);
  }
  return result.data.length === 0 ? null : { ...result, data: result.data.join("\n") };
}

console.log(parseEvent('id: 7\nevent: status\ndata: {"status":"packed"}'));
console.log(parseEvent("data: line one\ndata:line two\n: a comment"));
console.log(parseEvent("retry: 3000"));
console.log(parseEvent("data:  two spaces"));
```

Output of `node parse-event.js` and of the browser terminal

```json
{
  event: 'status',
  id: '7',
  data: '{"status":"packed"}',
  retry: undefined
}
{
  event: 'message',
  id: undefined,
  data: 'line one\nline two',
  retry: undefined
}
null
{
  event: 'message',
  id: undefined,
  data: ' two spaces',
  retry: undefined
}
```

Only one space is removed after the colon, so data that starts with a space keeps it. A block with only `retry` sets the reconnect delay but is not an event, which is why the browser never fires an event for it.

TRY IT YOURSELF

### Reconnect with backoff and jitter

A browser `WebSocket` does not reconnect by itself. Write `reconnectDelay(attempt, random)`: the base delay doubles from 500 ms for attempt 1, is capped at 30 seconds, and the actual delay is a random amount between half the base and the full base. `random` is a function returning a number from 0 to 1, so tests can control it.

**Show a solution**

backoff.js

```ts
function reconnectDelay(attempt, random = Math.random) {
  const base = Math.min(30_000, 500 * 2 ** (attempt - 1));
  return Math.round(base / 2 + random() * (base / 2));
}

for (const attempt of [1, 2, 3, 6, 7, 20]) {
  console.log(attempt, reconnectDelay(attempt, () => 0), reconnectDelay(attempt, () => 1));
}
```

Output of `node backoff.js` and of the browser terminal

```ts
1 250 500
2 500 1000
3 1000 2000
6 8000 16000
7 15000 30000
20 15000 30000
```

Without the cap, attempt 20 would wait almost three days. Without jitter, when a server restarts, every client reconnects at exactly the same moments and knocks it over again; spreading them out randomly avoids that "thundering herd".

TRY IT YOURSELF

### Batch fast updates for the screen

The courier's location arrives up to 20 times a second, but redrawing the map more often than the screen refreshes is wasted work. Write `latestPerFrame(render)`: it returns a function that stores each new value and makes sure `render` runs at most once per animation frame, with the latest value.

**Show a solution**

per-frame.js

```ts
function latestPerFrame(render) {
  let latest;
  let scheduled = false;
  return (value) => {
    latest = value;
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => {
      scheduled = false;
      render(latest);
    });
  };
}

const renders = [];
const showLocation = latestPerFrame((point) => renders.push(point));
for (let update = 1; update <= 5; update++) showLocation({ update, lat: 6.5244, lng: 3.3792 });
await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
console.log("updates received: 5, renders:", renders.length);
console.log("rendered update", renders[0].update);
```

What the browser terminal prints

```ts
updates received: 5, renders: 1
rendered update 5
```

Five updates in the same frame produced one render with the newest position. The same pattern works for any fast feed: prices, scores, progress.

## Summary

- Polling is simple but wasteful and late at scale. Push when updates matter quickly and many clients watch.
- Server-Sent Events: one long `text/event-stream` response from `node:http`, events of `id:`, `event:`, `data:` lines. `EventSource` parses them and reconnects with `Last-Event-ID`; the server replays what was missed and the client ignores ids it has seen.
- WebSockets: an HTTP upgrade to a two-way message connection. Check the `Origin` during the upgrade (no CORS protects you), validate every message, and handle heartbeats, reconnection, missed messages and backpressure yourself.
- Web Workers: another thread with messages that are copied (or transferred), requests matched to replies by id, errors sent back explicitly, progress reported as messages.
- Choose by direction and frequency: SSE for server-to-client news, WebSockets for two-way traffic, polling for rare checks, workers for heavy work in the page.

That completes the browser module: you have built pages with the DOM, wired them with events, used the browser's APIs, connected them to your own Node.js API, and made them live. Next: [Git and GitHub](https://zudojs.oyinlola.site/learn/git), where you put a project like this one under version control, work on branches and share it through GitHub.

## Test yourself

Five questions, picked at random from this lesson's question bank. Some ask you to choose an answer, some to predict what code prints, and some to write code and run it in the terminal. Get 4 of 5 right to pass. If you don't, read the explanations and try again: you get 5 different questions.
