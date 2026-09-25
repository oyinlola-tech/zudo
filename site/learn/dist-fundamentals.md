---
title: "Distributed systems fundamentals — ZudoJS Academy"
description: "Simulate an unreliable network with a seeded random generator, then reason about partial failure, clocks, consistency, CAP and service discovery."
source: https://zudojs.oyinlola.site/learn/dist-fundamentals
---

LEVEL 16 · LESSON 1 OF 4

Distributed systems Advanced

# Distributed systems fundamentals

Simulate an unreliable network with a seeded random generator, then reason about partial failure, clocks, consistency, CAP and service discovery.

- **55 min** to read and try
- **You need:** The ZudoJS architecture course, especially Microservices and A CQRS system
- **You build:** A deterministic network simulator for ShopFlow, with a failure detector, Lamport and vector clocks, replicas with session consistency, a quorum under partition, a TTL service registry and a seed-sweep test

  [Test yourself](#test)

BY THE END OF THIS LESSON YOU CAN

- Explain partial failure and why a timeout cannot tell a lost request from a lost reply
- Simulate latency, loss, duplication and reordering deterministically with a seeded random generator
- Order events with Lamport clocks and detect concurrent changes with vector clocks, instead of trusting wall clocks
- Recognise consistency anomalies (stale reads, going back in time) and fix them with session guarantees
- Reason about a partition with CAP and quorums, and about service discovery with heartbeats and TTLs

## Did the payment go through?

ShopFlow's orders service asks the payments service to charge Ada ₦25,000 and waits up to 200 ms for an answer. No answer comes. What happened?

In a single program that question never comes up: a function call either returns or throws. Across a network there are several possible worlds, and they look exactly the same to the caller. This lesson runs the network inside your program, in **simulated time**, so you can see all of them. Here are four runs of one checkout:

sim.ts

```ts
/** mulberry32: a small seeded generator. Same seed, same sequence, every run. */
export function seeded(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface Message {
  readonly id: number;
  readonly from: string;
  readonly to: string;
  readonly body: unknown;
}

export interface Faults {
  readonly latency: readonly [number, number];
  readonly loss?: number;
  readonly duplicate?: number;
}

type Handler = (message: Message) => void;

/** A network simulated in virtual time: nothing waits, and a seed makes every run identical. */
export class Sim {
  now = 0;
  readonly stats = { sent: 0, lost: 0, duplicated: 0, delivered: 0 };
  /** Return "drop" to lose a message, or a number to add that much delay. */
  intercept: (message: Message) => "drop" | number | undefined = () => undefined;
  private readonly timeline: { at: number; order: number; run: () => void }[] = [];
  private readonly handlers = new Map<string, Handler>();
  private readonly cut = new Set<string>();
  private readonly random: () => number;
  private order = 0;
  private nextId = 1;

  constructor(seed: number, private readonly faults: Faults) {
    this.random = seeded(seed);
  }

  node(name: string, handler: Handler): void {
    this.handlers.set(name, handler);
  }

  /** Runs `run` after `delay` ms of simulated time. */
  after(delay: number, run: () => void): void {
    this.timeline.push({ at: this.now + delay, order: this.order++, run });
    this.timeline.sort((a, b) => a.at - b.at || a.order - b.order);
  }

  send(from: string, to: string, body: unknown): Message {
    const message: Message = { id: this.nextId++, from, to, body };
    this.stats.sent++;
    const rule = this.intercept(message);
    if (rule === "drop" || this.cut.has(`${from}|${to}`) || this.random() < (this.faults.loss ?? 0)) {
      this.stats.lost++;
      return message;
    }
    const copies = this.random() < (this.faults.duplicate ?? 0) ? 2 : 1;
    if (copies === 2) this.stats.duplicated++;
    for (let i = 0; i < copies; i++) {
      const [min, max] = this.faults.latency;
      const delay = min + Math.floor(this.random() * (max - min + 1)) + (typeof rule === "number" ? rule : 0);
      this.after(delay, () => {
        this.stats.delivered++;
        this.handlers.get(to)?.(message);
      });
    }
    return message;
  }

  /** Messages between a and b are lost, in both directions, until heal(). */
  partition(a: string, b: string): void {
    this.cut.add(`${a}|${b}`).add(`${b}|${a}`);
  }

  heal(): void {
    this.cut.clear();
  }

  run(until = Infinity): void {
    for (let next = this.timeline[0]; next && next.at <= until; next = this.timeline[0]) {
      this.timeline.shift();
      this.now = next.at;
      next.run();
    }
    if (until !== Infinity) this.now = until;
  }
}
```

did-it-pay.ts

```ts
import { Sim } from "./sim.js";
import type { Message } from "./sim.js";

type World = "healthy" | "request lost" | "response lost" | "payments slow";

function checkout(world: World): string {
  const sim = new Sim(1, { latency: [20, 40] });
  let charged = 0;
  let outcome = "waiting";
  sim.intercept = (m: Message) => {
    if (world === "request lost" && m.to === "payments") return "drop";
    if (world === "response lost" && m.to === "orders") return "drop";
    if (world === "payments slow" && m.to === "payments") return 400;
    return undefined;
  };
  sim.node("payments", (m) => {
    charged++;
    sim.send("payments", "orders", { chargeId: `ch_${m.id}` });
  });
  sim.node("orders", () => {
    if (outcome === "waiting") outcome = `paid at t=${sim.now}ms`;
  });
  sim.send("orders", "payments", { orderId: "ORD-1042", amountKobo: 2_500_000 });
  sim.after(200, () => {
    if (outcome === "waiting") outcome = "timeout at t=200ms";
  });
  sim.run();
  return `${world.padEnd(14)} caller sees: ${outcome.padEnd(18)} | card charged: ${charged} time(s)`;
}

for (const world of ["healthy", "request lost", "response lost", "payments slow"] as const) console.log(checkout(world));
```

Output of `npx tsx did-it-pay.ts` and of the browser terminal

```ts
healthy        caller sees: paid at t=56ms     | card charged: 1 time(s)
request lost   caller sees: timeout at t=200ms | card charged: 0 time(s)
response lost  caller sees: timeout at t=200ms | card charged: 1 time(s)
payments slow  caller sees: timeout at t=200ms | card charged: 1 time(s)
```

The last three worlds are identical from where the orders service stands: a timeout at 200 ms. In one of them Ada was not charged; in the other two she was, once while orders was still waiting and once long after it gave up. This is **partial failure**: some parts of the system worked (payments charged the card) while others did not (the reply never arrived), and the caller cannot tell which. It is the defining problem of a **distributed system**, a system whose parts run on different machines (**nodes**) and cooperate only by sending **messages** over a network.

You have met the practical fixes in earlier lessons: idempotency keys in [Architecture styles](https://zudojs.oyinlola.site/learn/arch-styles#failures), retries and breakers in [Microservices](https://zudojs.oyinlola.site/learn/zudo-microservices#failures), the outbox in [Event-driven systems](https://zudojs.oyinlola.site/learn/zudo-event-driven). This lesson is about the reasons underneath them, the facts about networks, time and replicas that every distributed design has to respect. The next three lessons build on it: [contracts](https://zudojs.oyinlola.site/learn/dist-contracts), [failure engineering](https://zudojs.oyinlola.site/learn/dist-reliability) and [transactions across services](https://zudojs.oyinlola.site/learn/dist-transactions).

## Before you trust the network

REASON IT OUT

### What can you actually know about another machine?

1. You sent a message and got no reply. List everything that could have happened.
2. You sent messages 1, 2, 3 to the same service. In which order will they arrive? How many times?
3. Two servers write the same record and each stamps it with `Date.now()`. Can you use the stamps to decide which write came last?
4. A replica says "the stock is 3". How old might that answer be?
5. The network between Lagos and Abuja breaks for ten minutes. Both sides keep receiving orders for the last bag of rice. What are your options?
6. A payments server crashed a second ago. How does the orders service find out, and what happens to requests sent to it in the meantime?

**Show the reasoning**

1. The request was lost; the other side crashed before, during or after doing the work; the work was done and the reply was lost; the other side is just slow and will answer later; the network is fine and the other side is overloaded. You cannot know which without asking again, and asking again must be safe.
2. Any order, possibly several times, possibly never. Networks reorder, duplicate and drop messages. Order and "exactly once" are things you build on top, with sequence numbers and ids.
3. No. Clocks on different machines differ by milliseconds to seconds, and can jump. A later write can carry an earlier stamp. Ordering needs a logical clock or one authority that assigns the order.
4. As old as the replication lag, which is usually milliseconds and occasionally minutes. Any read from a copy is a read from the past.
5. Refuse orders on at least one side (stay consistent, lose availability), or accept them on both sides and sort out the oversold bag later (stay available, lose consistency). No design gets both during a partition. That is the CAP theorem.
6. Only by not hearing from it: missed heartbeats, failed calls. Until then it stays in the list of servers and receives requests that fail. Detection is always a guess made after a delay.

The [fallacies of distributed computing](https://zudojs.oyinlola.site/learn/arch-styles#microservices) are the famous list of assumptions that break these answers: the network is reliable, latency is zero, the topology does not change, and so on. Each section below turns one of them into something you can run.

## An unreliable network, simulated

Look back at `sim.ts`. It is a tiny **discrete-event simulation**: instead of waiting for real time to pass, it keeps a timeline of things that will happen, sorted by their simulated time, and runs them in order, moving `now` forward as it goes. That makes a thousand network round trips take a millisecond of real time, and it makes timing exact.

Every `send` draws random numbers to decide the message's fate: lost with probability `loss`, delivered twice with probability `duplicate`, and delayed by a latency between the two bounds. The numbers come from `seeded`, a **pseudo-random generator**: it produces numbers that look random, but the same seed always gives the same sequence. So a run can be repeated exactly, in Node and in the browser. Here orders sends inventory ten numbered messages, 10 ms apart:

network.ts

```ts
import { Sim } from "./sim.js";

for (const seed of [7, 8]) {
  const sim = new Sim(seed, { latency: [10, 120], loss: 0.1, duplicate: 0.1 });
  const arrived: number[] = [];
  sim.node("inventory", (m) => arrived.push((m.body as { n: number }).n));
  for (let n = 1; n <= 10; n++) sim.after(n * 10, () => sim.send("orders", "inventory", { n }));
  sim.run();
  console.log(`seed ${seed}: sent 1..10, arrived ${arrived.join(" ")}`);
  console.log("  ", sim.stats);
}
```

Output of `npx tsx network.ts` and of the browser terminal

```ts
seed 7: sent 1..10, arrived 4 5 3 7 9 6 10 8
   { sent: 10, lost: 2, duplicated: 0, delivered: 8 }
seed 8: sent 1..10, arrived 1 2 5 3 9 5 8 6 8 10
   { sent: 10, lost: 2, duplicated: 2, delivered: 10 }
```

Everything a real network does is in those two lines. Messages arrive out of order, because each takes its own path and time. Some never arrive. Some arrive twice, which real networks do when a sender's retry and the original both get through, or a broker redelivers. Change the seed and you get a different, equally legal, history.

What this means for code that receives messages:

| Delivery guarantee | How you get it | What the receiver must do |
| --- | --- | --- |
| **At most once** | Send once, never retry | Accept that some messages are lost |
| **At least once** | Retry until acknowledged | Recognise duplicates (idempotency) |
| **Exactly once** | Not available from a network | At least once + deduplication gives "effectively once" processing |

Order is the same story. If the receiver needs messages in order, the sender numbers them and the receiver holds back a message until the ones before it arrived, which is what TCP does inside one connection and what the projector's version check did in [A CQRS system](https://zudojs.oyinlola.site/learn/zudo-cqrs-system#read).

## Partial failure and failure detection

If a node cannot tell "dead" from "slow", how does anything decide that a server is down? With a **failure detector**: every node sends a small **heartbeat** message at a fixed interval, and a monitor suspects a node when it has not heard from it for longer than a **timeout**. The payments service below sends a heartbeat every 100 ms. At t=1000 it stops for half a second, as a process does during a long garbage-collection pause, and at t=2500 it crashes for real:

detector.ts

```ts
import { Sim } from "./sim.js";

function watch(timeoutMs: number): void {
  const sim = new Sim(3, { latency: [10, 60] });
  let lastHeard = 0;
  let suspected = false;
  const events: string[] = [];

  sim.node("monitor", () => {
    lastHeard = sim.now;
    if (suspected) events.push(`t=${sim.now} payments alive again`);
    suspected = false;
  });
  for (let t = 100; t < 2500; t += 100) {
    const pausedForGc = t >= 1000 && t < 1500;
    if (!pausedForGc) sim.after(t, () => sim.send("payments", "monitor", "heartbeat"));
  }
  for (let t = 50; t <= 3500; t += 50) {
    sim.after(t, () => {
      if (!suspected && sim.now - lastHeard > timeoutMs) {
        suspected = true;
        events.push(`t=${sim.now} payments suspected dead`);
      }
    });
  }
  sim.run();
  console.log(`timeout ${timeoutMs} ms: ${events.join(", ")}`);
}

watch(250);
watch(600);
```

Output of `npx tsx detector.ts` and of the browser terminal

```ts
timeout 250 ms: t=1250 payments suspected dead, t=1546 payments alive again, t=2700 payments suspected dead
timeout 600 ms: t=3050 payments suspected dead
```

With a 250 ms timeout the monitor declared a live server dead during the pause (a **false positive**), and noticed the real crash about 200 ms after it happened. With 600 ms it made no false accusation, but needed more than half a second to notice the crash. There is no timeout that is both fast and never wrong, because a slow node and a dead node send exactly the same thing: nothing. Real systems pick a timeout from measured latencies, require several missed heartbeats, and design for both mistakes: a node wrongly declared dead must not cause damage when it comes back (for example two servers both believing they are the leader), and a dead node must not be waited for forever.

> NOTE
>
> A false positive is not harmless. If the payments server that "died" during its pause is replaced, and then wakes up and finishes the charges it was working on, you have two servers doing the same work. Techniques such as leases and **fencing tokens** (a number that increases with each new owner, checked by the storage) stop the old owner's late writes. [Storage](https://zudojs.oyinlola.site/learn/zudo-storage#locking) shows fencing tokens on locks.

## Time and clocks

Every server has a clock, and every clock is a little wrong. Crystal oscillators drift by some milliseconds per hour; a protocol called **NTP** (Network Time Protocol) corrects them by asking time servers over the same unreliable network. The difference between two machines' clocks at the same moment is called **clock skew**. After a correction, a clock can even jump backwards.

### Wall clocks cannot order events across machines

Ada updates her delivery address twice: once through the Lagos server, then, a second and a half later, through the Abuja server, whose clock runs two seconds slow. Both servers stamp the change with their own clock, and replication keeps the change with the highest stamp, a strategy called **last write wins**:

skew.ts

```ts
interface Write { readonly value: string; readonly timestamp: number; readonly server: string }

const offsets: Record<string, number> = { lagos: 0, abuja: -2_000 };
const clock = (server: string, realTime: number) => realTime + offsets[server]!;

const writes: Write[] = [
  { value: "12 Awolowo Road, Ikoyi", timestamp: clock("lagos", 10_000), server: "lagos" },
  { value: "5 Aminu Kano Crescent, Wuse", timestamp: clock("abuja", 11_500), server: "abuja" },
];

const lastWriteWins = writes.reduce((a, b) => (b.timestamp > a.timestamp ? b : a));
console.log("Ada's real last change: 5 Aminu Kano Crescent, Wuse (at real t=11500)");
for (const w of writes) console.log(`  ${w.server} stamped "${w.value}" with t=${w.timestamp}`);
console.log("last-write-wins keeps:", lastWriteWins.value);
```

Output of `npx tsx skew.ts` and of the browser terminal

```ts
Ada's real last change: 5 Aminu Kano Crescent, Wuse (at real t=11500)
  lagos stamped "12 Awolowo Road, Ikoyi" with t=10000
  abuja stamped "5 Aminu Kano Crescent, Wuse" with t=9500
last-write-wins keeps: 12 Awolowo Road, Ikoyi
```

Her rice goes to the old address, and no error was raised anywhere. Last write wins with wall-clock stamps silently throws away writes whenever the skew is larger than the gap between them.

### Wall clocks are not for measuring durations either

A **wall clock** (`Date.now()`) tells the time of day and may be corrected. A **monotonic clock** (`performance.now()` in JavaScript) only counts forward from some start point, is never adjusted, and is the right tool for timeouts and durations:

durations.ts

```ts
const wall = { now: 1_758_700_000_000 };
const monotonic = { now: 5_000 };
const pass = (ms: number) => {
  wall.now += ms;
  monotonic.now += ms;
};

const startWall = wall.now;
const startMono = monotonic.now;
pass(80);
wall.now -= 1_000; // NTP steps the wall clock back by one second
pass(40);

console.log("request took (wall clock):     ", wall.now - startWall, "ms");
console.log("request took (monotonic clock):", monotonic.now - startMono, "ms");
```

Output of `npx tsx durations.ts` and of the browser terminal

```ts
request took (wall clock):      -880 ms
request took (monotonic clock): 120 ms
```

A negative duration is harmless in a log, but the same mistake in a timeout ("give up when `Date.now()` passes the deadline") can fire a second early or wait an extra second. In Node and browsers, `setTimeout` and `AbortSignal.timeout` already use a monotonic clock; hand-written deadlines should use `performance.now()`.

### Logical clocks: order without trusting time

Often you do not need to know *when* something happened, only *what happened before what*. Event A **happened before** event B when A could have influenced B: they happened in that order on one node, or A was sending a message that B received. A **Lamport clock**, named after Leslie Lamport, gives every event a number that respects this relation, using three rules:

lamport.ts

```ts
export class LamportClock {
  private time = 0;
  /** A local event: count it. */
  tick(): number {
    return ++this.time;
  }
  /** Sending is an event; the message carries the new time. */
  send(): number {
    return this.tick();
  }
  /** Receiving: jump past the sender's time, then count the event. */
  receive(remote: number): number {
    this.time = Math.max(this.time, remote);
    return this.tick();
  }
}
```

Three ShopFlow services log what they do. Their wall clocks disagree: payments runs 900 ms slow, shipping 300 ms fast:

lamport-demo.ts

```ts
import { LamportClock } from "./lamport.js";

interface LogLine { readonly service: string; readonly what: string; readonly wall: number; readonly lamport: number }

const wallOffset: Record<string, number> = { orders: 0, payments: -900, shipping: 300 };
const clocks = { orders: new LamportClock(), payments: new LamportClock(), shipping: new LamportClock() };
const log: LogLine[] = [];
const record = (service: keyof typeof clocks, what: string, realTime: number, lamport: number) =>
  log.push({ service, what, wall: realTime + wallOffset[service]!, lamport });

record("orders", "order ORD-7 placed", 1_000, clocks.orders.tick());
const m1 = clocks.orders.send();
record("orders", "asked payments to charge", 1_010, m1);
record("payments", "card charged", 1_200, clocks.payments.receive(m1));
const m2 = clocks.payments.send();
record("payments", "told shipping to ship", 1_210, m2);
record("shipping", "warehouse restocked rice", 1_050, clocks.shipping.tick());
record("shipping", "label printed", 1_400, clocks.shipping.receive(m2));

const byWall = [...log].sort((a, b) => a.wall - b.wall);
const byLamport = [...log].sort((a, b) => a.lamport - b.lamport || a.service.localeCompare(b.service));
console.log("by wall clock:");
for (const l of byWall) console.log(`  ${String(l.wall).padStart(4)} ${l.service.padEnd(8)} ${l.what}`);
console.log("by Lamport time:");
for (const l of byLamport) console.log(`  ${String(l.lamport).padStart(4)} ${l.service.padEnd(8)} ${l.what}`);
```

Output of `npx tsx lamport-demo.ts` and of the browser terminal

```ts
by wall clock:
   300 payments card charged
   310 payments told shipping to ship
  1000 orders   order ORD-7 placed
  1010 orders   asked payments to charge
  1350 shipping warehouse restocked rice
  1700 shipping label printed
by Lamport time:
     1 orders   order ORD-7 placed
     1 shipping warehouse restocked rice
     2 orders   asked payments to charge
     3 payments card charged
     4 payments told shipping to ship
     5 shipping label printed
```

Sorted by wall clock, the card was charged before the order existed. Sorted by Lamport time, cause always comes before effect: the order, then the charge, then the label. Every message carried its sender's counter, and the receiver jumped past it.

Look at the two events with Lamport time 1. "Order placed" and "warehouse restocked rice" had nothing to do with each other: they were **concurrent**. A Lamport clock still puts them in *some* order (here by service name), and from the numbers alone you cannot tell "A happened before B" from "A and B were concurrent". When you need that difference, use a **vector clock**: each node keeps one counter *per node*, and two clocks can be compared entry by entry.

vector.ts

```ts
type VectorClock = Readonly<Record<string, number>>;

function compare(a: VectorClock, b: VectorClock): "before" | "after" | "equal" | "concurrent" {
  const nodes = new Set([...Object.keys(a), ...Object.keys(b)]);
  let aLess = false;
  let bLess = false;
  for (const node of nodes) {
    if ((a[node] ?? 0) < (b[node] ?? 0)) aLess = true;
    if ((b[node] ?? 0) < (a[node] ?? 0)) bLess = true;
  }
  if (aLess && bLess) return "concurrent";
  if (aLess) return "before";
  if (bLess) return "after";
  return "equal";
}

const synced = { phone: 1, laptop: 1 };
const phoneAddsRice = { phone: 2, laptop: 1 };
const laptopRemovesOil = { phone: 1, laptop: 2 };
const merged = { phone: 2, laptop: 2 };

console.log("synced vs phone edit:     ", compare(synced, phoneAddsRice));
console.log("phone edit vs laptop edit:", compare(phoneAddsRice, laptopRemovesOil));
console.log("merged vs laptop edit:    ", compare(merged, laptopRemovesOil));
```

Output of `npx tsx vector.ts` and of the browser terminal

```ts
synced vs phone edit:      before
phone edit vs laptop edit: concurrent
merged vs laptop edit:     after
```

Ada edited her cart on her phone and her laptop while both were offline. The vector clocks prove the two edits were concurrent, so neither may silently overwrite the other: the app must merge them (keep the added rice *and* the removed oil) or ask Ada. That is exactly the information last write wins throws away.

## Consistency models

To survive a crashed machine, data is kept on several machines: **replicas**. The usual setup has one **leader** that accepts writes and sends each change to **followers**, which serve reads. Sending takes time, the **replication lag**, and during it the replicas disagree. A **consistency model** is the promise a system makes about what reads can return while that happens.

replicas.ts

```ts
import type { Sim } from "./sim.js";

export interface Versioned { readonly value: string; readonly version: number }

/** One leader takes writes and replicates them; followers apply what arrives. */
export function createReplicas(sim: Sim, lagMs: Record<string, number>) {
  const data = new Map<string, Versioned>([["leader", { value: "12 Awolowo Road, Ikoyi", version: 1 }]]);
  for (const follower of Object.keys(lagMs)) data.set(follower, data.get("leader")!);
  sim.intercept = (m) => lagMs[m.to];
  for (const follower of Object.keys(lagMs)) {
    sim.node(follower, (m) => {
      const update = m.body as Versioned;
      if (update.version > data.get(follower)!.version) data.set(follower, update);
    });
  }
  return {
    write(value: string): number {
      const next = { value, version: data.get("leader")!.version + 1 };
      data.set("leader", next);
      for (const follower of Object.keys(lagMs)) sim.send("leader", follower, next);
      return next.version;
    },
    read(replica: string): Versioned {
      return data.get(replica)!;
    },
  };
}
```

Follower 1 is close to the leader. Follower 2 is in another data centre and 300 ms behind. Ada saves a new address, then the app reads it from whichever follower the load balancer picks:

anomalies.ts

```ts
import { createReplicas } from "./replicas.js";
import { Sim } from "./sim.js";

const sim = new Sim(5, { latency: [20, 40] });
const db = createReplicas(sim, { "follower-1": 0, "follower-2": 300 });
const show = (label: string, replica: string) => {
  const r = db.read(replica);
  console.log(`t=${String(sim.now).padStart(3)} ${label.padEnd(24)} ${replica.padEnd(10)} v${r.version} ${r.value}`);
};

sim.after(0, () => {
  db.write("5 Aminu Kano Crescent, Wuse");
  console.log("t=  0 Ada saves her new address (v2) on the leader");
});
sim.after(10, () => show("checkout page", "follower-2"));
sim.after(100, () => show("profile page", "follower-1"));
sim.after(120, () => show("checkout page, reloaded", "follower-2"));
sim.after(400, () => show("checkout page, later", "follower-2"));
sim.run();
```

Output of `npx tsx anomalies.ts` and of the browser terminal

```ts
t=  0 Ada saves her new address (v2) on the leader
t= 10 checkout page            follower-2 v1 12 Awolowo Road, Ikoyi
t=100 profile page             follower-1 v2 5 Aminu Kano Crescent, Wuse
t=120 checkout page, reloaded  follower-2 v1 12 Awolowo Road, Ikoyi
t=400 checkout page, later     follower-2 v2 5 Aminu Kano Crescent, Wuse
```

Two different anomalies happened:

- At t=10, Ada did not see the change she had just made. That violates **read-your-writes**.
- At t=100 she saw v2, and at t=120 she saw v1 again: the data went back in time. That violates **monotonic reads**.

By t=400 every replica agreed. A system that only promises this, "if writes stop, all replicas eventually return the same value", is **eventually consistent**. It is the weakest useful promise, and it is what you get from followers by default. The main models, from strongest to weakest:

| Model | Promise | ShopFlow example that needs it |
| --- | --- | --- |
| **Linearizable** (strong) | The system behaves like one copy: once a write is done, every later read anywhere sees it | Stock of the last bag, a bank balance before a transfer |
| **Causal** | If A could have influenced B, everyone sees A before B; unrelated writes may appear in any order | A reply to a review never appears without the review |
| **Read-your-writes** | A client always sees its own writes | Ada sees her new address after saving it |
| **Monotonic reads** | A client never sees older data after newer data | An order status never goes from "shipped" back to "paid" |
| **Eventual** | Replicas agree once writes stop | "Customers also bought", view counters |

The middle two are **session guarantees**: promises to one client, cheap to provide. The client remembers the highest version it has seen and never accepts an older one; a replica that is behind is skipped in favour of the leader. It is the `minVersion` idea from [A CQRS system](https://zudojs.oyinlola.site/learn/zudo-cqrs-system#api), applied to replicas:

session.ts

```ts
import { createReplicas } from "./replicas.js";
import type { Versioned } from "./replicas.js";
import { Sim } from "./sim.js";

const sim = new Sim(5, { latency: [20, 40] });
const db = createReplicas(sim, { "follower-1": 0, "follower-2": 300 });
let seen = 0;

function sessionRead(preferred: string): Versioned & { from: string } {
  const replica = db.read(preferred).version >= seen ? preferred : "leader";
  const result = db.read(replica);
  seen = Math.max(seen, result.version);
  return { ...result, from: replica };
}

sim.after(0, () => (seen = db.write("5 Aminu Kano Crescent, Wuse")));
for (const [t, replica] of [[10, "follower-2"], [100, "follower-1"], [120, "follower-2"], [400, "follower-2"]] as const) {
  sim.after(t, () => {
    const r = sessionRead(replica);
    console.log(`t=${String(sim.now).padStart(3)} asked ${replica}, answered by ${r.from.padEnd(10)} v${r.version}`);
  });
}
sim.run();
```

Output of `npx tsx session.ts` and of the browser terminal

```ts
t= 10 asked follower-2, answered by leader     v2
t=100 asked follower-1, answered by follower-1 v2
t=120 asked follower-2, answered by leader     v2
t=400 asked follower-2, answered by follower-2 v2
```

Every read now returns v2. The lagging follower was bypassed until it caught up, and then used again, so the leader only takes the reads that really need it. In a web app, `seen` lives in the session or travels with the request, for example as the version returned by the last command.

## Partitions and the CAP theorem

A **network partition** is a break that splits the nodes into groups that cannot reach each other, while each group keeps running and keeps receiving requests. The **CAP theorem** says that during a partition a replicated system must give up one of two things:

- **Consistency** (in the linearizable sense): every read sees the latest write.
- **Availability**: every request to a working node gets a non-error answer.

The P, **partition tolerance**, is not a choice: partitions happen, so the real question is what each operation does when one does. ShopFlow keeps its stock on three replicas, two in Lagos and one in Abuja, and the link between the cities breaks just as two customers try to buy the last bag of rice. In **AP** mode each side keeps selling from the replicas it can reach. In **CP** mode a change needs a **majority** of the replicas, two of three:

cap.ts

```ts
type Mode = "AP" | "CP";
const replicas = ["lagos-1", "lagos-2", "abuja-1"] as const;
type Replica = (typeof replicas)[number];

function lastBagOfRice(mode: Mode): void {
  const stock = new Map<Replica, number>(replicas.map((r) => [r, 1]));
  const sold: string[] = [];
  const reachableFrom = (side: Replica): Replica[] => (side === "abuja-1" ? ["abuja-1"] : ["lagos-1", "lagos-2"]);

  function buy(customer: string, via: Replica): string {
    const reachable = reachableFrom(via);
    if (mode === "CP" && reachable.length < 2) return `${customer}: 503, cannot reach a majority of replicas`;
    const current = Math.min(...reachable.map((r) => stock.get(r)!));
    if (current < 1) return `${customer}: sold out`;
    for (const r of reachable) stock.set(r, current - 1);
    sold.push(customer);
    return `${customer}: bought the last bag`;
  }

  console.log(`${mode}, during a partition between Lagos and Abuja:`);
  console.log("  " + buy("Ada (Lagos)", "lagos-1"));
  console.log("  " + buy("Bola (Abuja)", "abuja-1"));
  console.log(`  after the partition heals: ${sold.length} bag(s) sold, 1 bag in the warehouse`);
}

lastBagOfRice("AP");
lastBagOfRice("CP");
```

Output of `npx tsx cap.ts` and of the browser terminal

```ts
AP, during a partition between Lagos and Abuja:
  Ada (Lagos): bought the last bag
  Bola (Abuja): bought the last bag
  after the partition heals: 2 bag(s) sold, 1 bag in the warehouse
CP, during a partition between Lagos and Abuja:
  Ada (Lagos): bought the last bag
  Bola (Abuja): 503, cannot reach a majority of replicas
  after the partition heals: 1 bag(s) sold, 1 bag in the warehouse
```

AP stayed available and sold a bag that did not exist; someone now has to call Bola and refund her. CP stayed correct and turned Bola away with an error, although nothing was wrong with her request. Neither is "right": they are different products.

- For the last bag of rice, a payment, or a username that must be unique, a wrong answer is expensive: choose CP for that operation, and show a clear "try again" message.
- For a product page, a review count or a shopping cart, an old or merged answer is fine: choose AP, and repair afterwards (merge the carts as the vector clocks allowed, or apologise for the rare oversold item).

The choice is made per operation, not per system. And when there is no partition, which is most of the time, the same trade-off appears in a milder form: waiting for a majority makes every write slower than writing to the nearest replica. That extension is called **PACELC**: under a partition choose availability or consistency, *else* choose latency or consistency.

### Quorums

The CP mode above is a **quorum** system. With *N* replicas, a write waits for *W* of them to confirm and a read asks *R* of them and keeps the answer with the highest version. If *R + W > N*, every read set overlaps every write set in at least one replica, so a read always sees the latest confirmed write. With N = 3, W = 2 and R = 2, the system survives one replica being down or cut off, for both reads and writes. PostgreSQL's synchronous replication, Cassandra and etcd are built on variations of this idea.

## Service discovery

Before orders can call payments, it needs payments' address, and in a system where servers are added, replaced and crash, that address keeps changing. **Service discovery** answers "where are the healthy instances of payments right now?". [Microservices](https://zudojs.oyinlola.site/learn/zudo-microservices#boundaries) showed the simplest answers, configuration and DNS names. At larger scale there is a **service registry** (Consul, etcd, Kubernetes' own endpoints list): each instance registers itself and keeps renewing its entry with heartbeats; an entry that is not renewed within its **TTL** (time to live) expires.

A crashed instance cannot unregister itself, so for up to one TTL the registry still lists it. Two instances of payments heartbeat every second; payments-2 crashes at t=2500; a client sends a request every 100 ms, taking turns between the instances the registry lists:

discovery.ts

```ts
import { Sim } from "./sim.js";

/** A registry: instances register and renew; entries not renewed within the TTL expire. */
class Registry {
  private readonly lastSeen = new Map<string, number>();
  constructor(private readonly sim: Sim, private readonly ttlMs: number) {}
  heartbeat(instance: string): void {
    this.lastSeen.set(instance, this.sim.now);
  }
  healthy(): string[] {
    return [...this.lastSeen].filter(([, at]) => this.sim.now - at <= this.ttlMs).map(([name]) => name).sort();
  }
}

function run(ttlMs: number): void {
  const sim = new Sim(11, { latency: [5, 15] });
  const registry = new Registry(sim, ttlMs);
  const alive = new Set(["payments-1", "payments-2"]);
  let failed = 0;
  let served = 0;
  let turn = 0;

  for (let t = 0; t < 8_000; t += 1_000) {
    sim.after(t, () => alive.forEach((instance) => registry.heartbeat(instance)));
  }
  sim.after(2_500, () => alive.delete("payments-2"));
  for (let t = 100; t < 8_000; t += 100) {
    sim.after(t, () => {
      const instances = registry.healthy();
      const target = instances[turn++ % instances.length]!;
      if (alive.has(target)) served++;
      else failed++;
    });
  }
  sim.run();
  console.log(`TTL ${ttlMs} ms: ${served} requests served, ${failed} sent to the crashed instance`);
}

run(5_000);
run(1_500);
```

Output of `npx tsx discovery.ts` and of the browser terminal

```ts
TTL 5000 ms: 56 requests served, 23 sent to the crashed instance
TTL 1500 ms: 74 requests served, 5 sent to the crashed instance
```

With a 5-second TTL, almost half the requests for four and a half seconds went to a dead server. A 1.5-second TTL cut that to a handful, at the cost of more heartbeat traffic and a higher chance of expiring an instance that was only slow, the same trade-off as the failure detector. Two consequences for your code:

- **Discovery is always a little out of date**, so every call still needs a timeout, and a failed call to one instance should be retried on another (when the operation is idempotent). The circuit breakers and retries of [Failure engineering](https://zudojs.oyinlola.site/learn/dist-reliability) exist for exactly this window.
- **Health is more than "the process is up".** A registry that only checks heartbeats keeps sending traffic to an instance whose database connection is broken. Instances should report **readiness**, and stop renewing (or deregister) when they cannot serve, including during a graceful shutdown.

Where the lookup happens is the other design choice. In **client-side discovery** the caller asks the registry and picks an instance itself, as above. In **server-side discovery** the caller sends every request to a load balancer or service mesh proxy, which does the lookup; the application code only knows one name. Kubernetes Services and DNS names work this way, which is why most applications never talk to a registry directly.

## Testing distributed behaviour: sweep the seeds

A distributed bug usually needs an unlucky combination: this message lost, that one duplicated, this retry just before that reply. Such combinations are rare in a test run and common in production. The seeded simulator turns that around: run the same scenario under hundreds of seeds, check a **property** (a rule that must hold in every run) and report the seeds that break it. Any failing seed reproduces the bug exactly, every time, on every machine. The property here: Ada's card is never charged twice, whatever the network does:

sweep.ts

```ts
import { Sim } from "./sim.js";

/** One checkout over a lossy network; returns how many times the card was charged. */
function checkout(seed: number, deduplicate: boolean): { charges: number; confirmed: boolean } {
  const sim = new Sim(seed, { latency: [20, 120], loss: 0.2, duplicate: 0.05 });
  const seenKeys = new Set<string>();
  let charges = 0;
  let confirmed = false;

  sim.node("payments", (m) => {
    const { key } = m.body as { key: string };
    if (!deduplicate || !seenKeys.has(key)) charges++;
    seenKeys.add(key);
    sim.send("payments", "orders", { key });
  });
  sim.node("orders", () => (confirmed = true));
  for (let attempt = 0; attempt < 5; attempt++) {
    sim.after(attempt * 150, () => {
      if (!confirmed) sim.send("orders", "payments", { key: "charge-ORD-7" });
    });
  }
  sim.run();
  return { charges, confirmed };
}

for (const deduplicate of [false, true]) {
  const bad: number[] = [];
  let unconfirmed = 0;
  for (let seed = 1; seed <= 500; seed++) {
    const { charges, confirmed } = checkout(seed, deduplicate);
    if (charges > 1) bad.push(seed);
    if (!confirmed) unconfirmed++;
  }
  const label = deduplicate ? "with idempotency keys" : "naive retries";
  console.log(`${label.padEnd(21)}: charged twice in ${bad.length} of 500 runs, first failing seed ${bad[0] ?? "none"}, never confirmed in ${unconfirmed}`);
}
```

Output of `npx tsx sweep.ts` and of the browser terminal

```ts
naive retries        : charged twice in 237 of 500 runs, first failing seed 1, never confirmed in 0
with idempotency keys: charged twice in 0 of 500 runs, first failing seed none, never confirmed in 0
```

The naive version double-charges in almost half the runs: its retry timer (150 ms) is shorter than a slow round trip (up to 240 ms), and duplicates add more. With the payment keyed by an idempotency key and remembered by payments, no seed breaks the property. This style, **deterministic simulation testing**, is how databases such as FoundationDB are tested: the whole cluster runs in one simulated process, and a nightly job sweeps millions of seeds. For real services, the same idea appears as fault injection against a test environment, which [Failure engineering](https://zudojs.oyinlola.site/learn/dist-reliability#injector) builds.

> TIP
>
> Keep the simulator honest. It only finds bugs in behaviour it can produce: this one never crashes a node halfway through a handler or delivers a message after a partition heals from an old buffer. Add those faults when your design depends on surviving them.

## In production

- **Assume every remote call can hang, fail, or succeed without telling you.** Timeouts on every call, idempotency on every retried operation, and a way to find out the real outcome later (a status query, a reconciliation job).
- **Never order events across machines by wall clock.** Use a sequence from one authority (a database sequence, the leader of a partition, an aggregate version) or logical clocks. Run NTP (or chrony) on every host and alert on skew, because logs, certificates and token expiry still need roughly correct time.
- **Choose consistency per operation.** Money and scarce stock: linearizable, through one leader or a quorum, even if it sometimes answers "try again". Pages and counters: eventual, with session guarantees so users never see their own changes vanish.
- **Measure replication lag and alert on it**, the same way as the projection lag of [A CQRS system](https://zudojs.oyinlola.site/learn/zudo-cqrs-system). A lagging replica is a consistency problem that looks like a bug report.
- **Keep discovery short-lived and health-aware.** Short TTLs, readiness checks, deregistration on shutdown, and retries on another instance for idempotent calls.
- **Follow requests across nodes.** With messages reordered and retried, only a correlation id or trace id (from [Observability](https://zudojs.oyinlola.site/learn/zudo-observability)) lets you reconstruct what happened to one order.

## Practice

TRY IT YOURSELF

### In-order delivery on top of an unordered network

Using the simulator with seed 8 (loss 0 this time, duplicates 0.1), make the inventory service process messages 1 to 10 exactly once and in order, whatever order they arrive in. Hold back a message until the one before it has been processed, and ignore numbers already processed.

**Show a solution**

in-order.ts

```ts
import { Sim } from "./sim.js";

const sim = new Sim(8, { latency: [10, 120], duplicate: 0.1 });
const arrived: number[] = [];
const processed: number[] = [];
const waiting = new Set<number>();
let next = 1;

sim.node("inventory", (m) => {
  const n = (m.body as { n: number }).n;
  arrived.push(n);
  if (n < next) return;
  waiting.add(n);
  while (waiting.has(next)) {
    waiting.delete(next);
    processed.push(next);
    next++;
  }
});
for (let n = 1; n <= 10; n++) sim.after(n * 10, () => sim.send("orders", "inventory", { n }));
sim.run();
console.log("arrived:  ", arrived.join(" "));
console.log("processed:", processed.join(" "));
```

Output of `npx tsx in-order.ts` and of the browser terminal

```ts
arrived:   1 4 5 2 6 8 3 10 7 7 9
processed: 1 2 3 4 5 6 7 8 9 10
```

The `waiting` set is a reorder buffer, and `next` is the sequence number the receiver expects. A duplicate is either already processed (`n < next`) or already in the buffer (adding it to a `Set` twice changes nothing). With loss, this receiver would wait forever for a missing number, so real protocols add acknowledgements and retransmission, which is what TCP does.

TRY IT YOURSELF

### Pick N, W and R

ShopFlow's wallet balances live on 5 replicas. (a) Which W and R make every read see the latest confirmed write while tolerating 2 unavailable replicas for both reads and writes? (b) The product catalogue is read 1,000 times more often than it is written and may be a little stale. What would you choose, and what do you give up?

**Show a solution**

(a) W = 3 and R = 3: 3 + 3 > 5, so every read overlaps every write, and with 2 replicas down 3 are still reachable for both. W = 5, R = 1 would make reads cheap but a single down replica would block every write. (b) For example W = 5, R = 1, or simply asynchronous replication with reads from any follower. Reads become as cheap as possible. You give up linearizable reads (a follower may be slightly behind), and with W = 5 you give up write availability when any replica is down, which is acceptable for data edited by staff a few times a day. Add session guarantees for the staff member who just edited a product.

TRY IT YOURSELF

### Lamport clocks by hand

Three services start with Lamport clocks at 0. Orders has a local event (a), then sends message m1 to payments. Payments has a local event (b), then receives m1 (c), then sends m2 to shipping. Shipping has two local events (d, e), then receives m2 (f). Write down the Lamport time of every event. Which pairs of events are concurrent?

**Show a solution**

by-hand.ts

```ts
import { LamportClock } from "./lamport.js";

const orders = new LamportClock();
const payments = new LamportClock();
const shipping = new LamportClock();

const a = orders.tick();
const m1 = orders.send();
const b = payments.tick();
const c = payments.receive(m1);
const m2 = payments.send();
const d = shipping.tick();
const e = shipping.tick();
const f = shipping.receive(m2);
console.log({ a, m1, b, c, m2, d, e, f });
```

Output of `npx tsx by-hand.ts` and of the browser terminal

```json
{ a: 1, m1: 2, b: 1, c: 3, m2: 4, d: 1, e: 2, f: 5 }
```

Two events are concurrent when neither could have influenced the other. On the orders side, a and the send of m1 are concurrent with b (payments had not heard from orders yet). Everything payments did (b, c and the send of m2) and everything orders did are concurrent with d and e (shipping had heard from nobody yet). Note that d = 1 and a = 1 have equal times, and e = 2 is smaller than c = 3 although e and c are concurrent: equal or smaller Lamport times do not mean "happened before". Only the rule "if A happened before B, then A's time is smaller" holds, not the reverse.

## Summary

- A distributed system is nodes cooperating through messages. Its defining problem is partial failure: a missing reply cannot tell you whether the work happened.
- Networks lose, delay, duplicate and reorder messages. At-least-once delivery plus deduplication gives effectively-once processing; order needs sequence numbers.
- Failure detectors are timeouts on heartbeats. Short timeouts give false alarms, long ones slow detection; design for both.
- Wall clocks skew and jump: never order cross-machine events by them, and measure durations with a monotonic clock. Lamport clocks order causes before effects; vector clocks also detect concurrent changes.
- Replicas lag. Eventual consistency allows stale and backwards reads; session guarantees (read-your-writes, monotonic reads) fix what users notice; linearizability costs a leader or a quorum.
- During a partition, choose per operation: consistent and sometimes unavailable, or available and sometimes wrong. Quorums with R + W > N give consistency while tolerating failed replicas.
- Service discovery is always a little stale: short TTLs, readiness, timeouts and retries on another instance cover the gap.
- Seeded, deterministic simulation turns rare distributed bugs into repeatable test failures.

Next, [Contracts between services](https://zudojs.oyinlola.site/learn/dist-contracts) deals with the other thing that changes between machines: the code on each side, deployed on different days.

## Test yourself

Five questions, picked at random from this lesson's question bank. Some ask you to choose an answer, some to predict what code prints, and some to write code and run it in the terminal. Get 4 of 5 right to pass. If you don't, read the explanations and try again: you get 5 different questions.
