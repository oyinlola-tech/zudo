---
title: "Graphs and topological sort — ZudoJS Academy"
description: "Model packages, roads between cities and followers as graphs, store them as adjacency lists, and compute a safe install order with topological sort."
source: https://zudojs.oyinlola.site/learn/dsa-graphs
---

LEVEL 3 · LESSON 8 OF 21

Data structures Core

# Graphs and topological sort

Model packages, roads between cities and followers as graphs, store them as adjacency lists, and compute a safe install order with topological sort.

- **55 min** to read and try
- **You need:** Trees and binary search trees, Hash maps and sets, and Stacks and queues
- **You build:** A Graph class, a dependency resolver that finds install order, parallel stages and cycles, and a tested topological sort

  [Test yourself](#test)

BY THE END OF THIS LESSON YOU CAN

- Name the parts of a graph and choose directed or undirected, weighted or unweighted for a real problem
- Store a graph as an adjacency list or matrix and state the cost of each operation
- Find everything reachable from a vertex without visiting anything twice
- Order dependencies with topological sort (Kahn's algorithm and depth-first), group them into parallel stages, and report cycles
- Test a topological sort with a property check on random graphs

## The problem: what to install first

A shop's code lives in a monorepo of small packages. `@shop/api` uses `@shop/orders` and `@shop/auth`; `@shop/orders` uses `@shop/catalog`; almost everything uses `@shop/db`. Before a package can be built, every package it uses must already be built. In what order do you build them?

A first attempt: keep going round the list, and build any package whose dependencies are all built, until everything is done. It needs a guard: if a whole round builds nothing, something is wrong.

naive-order.js

```ts
const packages = {
  "@shop/api": ["@shop/auth", "@shop/orders", "@shop/logger"],
  "@shop/orders": ["@shop/catalog", "@shop/users", "@shop/money"],
  "@shop/auth": ["@shop/users", "@shop/config"],
  "@shop/catalog": ["@shop/db", "@shop/money"],
  "@shop/users": ["@shop/db"],
  "@shop/db": ["@shop/config", "@shop/logger"],
  "@shop/config": [],
  "@shop/logger": [],
  "@shop/money": [],
};

function naiveOrder(packages) {
  const built = new Set();
  const order = [];
  let checks = 0;
  while (order.length < Object.keys(packages).length) {
    let progress = false;
    for (const [name, deps] of Object.entries(packages)) {
      if (built.has(name)) continue;
      checks += deps.length;
      if (deps.every((dep) => built.has(dep))) {
        built.add(name);
        order.push(name);
        progress = true;
      }
    }
    if (!progress) return { order, stuck: true, checks };
  }
  return { order, stuck: false, checks };
}

const result = naiveOrder(packages);
console.log(result.order.join("\n"));
console.log(`dependency checks: ${result.checks}, stuck: ${result.stuck}`);

packages["@shop/db"].push("@shop/users");
const broken = naiveOrder(packages);
console.log(`after db starts using users: built ${broken.order.join(", ")}, stuck: ${broken.stuck}`);
```

Output of `node naive-order.js` and of the browser terminal

```ts
@shop/config
@shop/logger
@shop/money
@shop/db
@shop/catalog
@shop/users
@shop/orders
@shop/auth
@shop/api
dependency checks: 48, stuck: false
after db starts using users: built @shop/config, @shop/logger, @shop/money, stuck: true
```

It finds a correct order, and it notices the loop the last line created: `db` needs `users`, which needs `db`, so neither can ever be built. But it is wasteful. Each round rechecks every unbuilt package, and in the worst case (a long chain listed in reverse) only one package gets built per round: O(V) rounds of O(V + E) work, where V is the number of packages and E the number of dependency links. And when it gets stuck, it cannot say *which* packages form the loop.

The shape of this data is a **graph**. This lesson gives you the vocabulary, two ways to store a graph, and **topological sort**: an O(V + E) algorithm that finds a build order, finds which packages can be built in parallel, and names the loop when there is one.

## What a graph is

A **graph** is a set of **vertices** (also called nodes: packages, cities, people) and a set of **edges** connecting pairs of them (dependencies, roads, "follows"). That is the whole definition. A tree from [the trees lesson](https://zudojs.oyinlola.site/learn/dsa-trees) is a graph with extra rules (one root, one parent each, no loops); a general graph has none of those rules.

- In an **undirected** graph an edge has no direction: a road between Lagos and Ibadan can be driven both ways. In a **directed** graph each edge goes *from* one vertex *to* another: "`@shop/api` uses `@shop/auth`" is not the same as the reverse.
- In a **weighted** graph each edge carries a number: a distance in km, a travel time, a price. In an **unweighted** graph an edge just exists or not.
- Two vertices joined by an edge are **adjacent**, or **neighbours**. The **degree** of a vertex is how many edges touch it. In a directed graph, the **out-degree** counts edges leaving it (how many packages it uses) and the **in-degree** counts edges arriving (how many packages use it).
- A **path** is a sequence of vertices where each consecutive pair is joined by an edge. A **cycle** is a path that returns to where it started, like `db → users → db`.
- A directed graph with no cycles is a **DAG** (directed acyclic graph). Dependency graphs must be DAGs, or nothing can be built.
- An undirected graph is **connected** if there is a path between every pair of vertices.
- A graph is **sparse** when it has far fewer edges than the maximum possible (every vertex linked to every other: about V² edges), and **dense** when it is close to that maximum. Real graphs are almost always sparse: a city has a few roads out, not roads to every other city.

Here is the package graph, written as one line per package with arrows to the packages it uses:

```ts
api      ──► auth, orders, logger
orders   ──► catalog, users, money
auth     ──► users, config
catalog  ──► db, money
users    ──► db
db       ──► config, logger
config, logger, money use nothing
```

The package graph as one line per package: an arrow to each package it uses.

Drawn as boxes and arrows, even these nine packages become a tangle of crossing lines, which is one reason to think about graphs as data. And that list *is* already the most common way to store a graph, as the next section shows.

REASON IT OUT

### Choosing the model

A delivery app needs a map of a city to plan routes for riders. Before any code: what should a vertex be? What should an edge be? Directed or undirected? Weighted, and by what? Can the weights change during the day? What else in the app could be a graph?

**Show the reasoning**

- **Vertices**: road junctions (plus the shop and the customers' addresses, snapped to the nearest junction). Using whole streets as vertices would lose the information about where you can turn.
- **Edges**: a stretch of road between two junctions.
- **Directed**, because one-way streets exist. A two-way street becomes two edges, one each way. An undirected graph would happily send a rider the wrong way down a one-way street.
- **Weighted**, and the useful weight is *travel time*, not distance: a short road through a market at noon is slower than a longer expressway. Travel time changes with traffic, so the weights must be updatable, and a route planned at 8:00 may be wrong at 8:30.
- **Other graphs in the same app**: customers referring customers (directed), which products are bought together (undirected, weighted by how often), which services call which (directed, a dependency graph again).

The same algorithm gives very different answers depending on these choices, so the modelling is where most graph bugs are born.

## Storing a graph: matrix or list

There are two classic representations.

An **adjacency matrix** is a V × V grid: the cell in row *a*, column *b* holds the weight of the edge from *a* to *b*, or 0 when there is none. Checking one edge is a single array access, but the grid has V² cells whatever the number of edges.

An **adjacency list** stores, for each vertex, only its neighbours. In JavaScript the natural form is a `Map` from vertex to a `Map` of neighbour to weight. Its size is proportional to V + E.

representations.js

```ts
const cities = ["Lagos", "Ibadan", "Benin", "Abuja", "Kano"];
const roads = [
  ["Lagos", "Ibadan", 128], ["Lagos", "Benin", 312], ["Ibadan", "Abuja", 640],
  ["Benin", "Abuja", 480], ["Abuja", "Kano", 430],
];

const index = new Map(cities.map((city, i) => [city, i]));
const matrix = cities.map(() => cities.map(() => 0));
for (const [a, b, km] of roads) {
  matrix[index.get(a)][index.get(b)] = km;
  matrix[index.get(b)][index.get(a)] = km;
}

const list = new Map(cities.map((city) => [city, new Map()]));
for (const [a, b, km] of roads) {
  list.get(a).set(b, km);
  list.get(b).set(a, km);
}

console.log("matrix:");
for (const [i, row] of matrix.entries()) {
  console.log(cities[i].padEnd(7), row.map((km) => String(km).padStart(4)).join(""));
}
console.log("list:");
for (const [city, next] of list) {
  console.log(city.padEnd(7), [...next].map(([to, km]) => `${to} ${km}`).join(", "));
}

for (const [v, e] of [[5, 5], [1000, 3000], [100000, 300000]]) {
  console.log(`${v} cities, ${e} roads: matrix ${v * v} cells, list ${v + 2 * e} entries`);
}
```

Output of `node representations.js` and of the browser terminal

```ts
matrix:
Lagos      0 128 312   0   0
Ibadan   128   0   0 640   0
Benin    312   0   0 480   0
Abuja      0 640 480   0 430
Kano       0   0   0 430   0
list:
Lagos   Ibadan 128, Benin 312
Ibadan  Lagos 128, Abuja 640
Benin   Lagos 312, Abuja 480
Abuja   Ibadan 640, Benin 480, Kano 430
Kano    Abuja 430
5 cities, 5 roads: matrix 25 cells, list 15 entries
1000 cities, 3000 roads: matrix 1000000 cells, list 7000 entries
100000 cities, 300000 roads: matrix 10000000000 cells, list 700000 entries
```

The distances are approximate road distances in km. For 5 cities the matrix is fine. For 100,000 junctions it would need 10 billion cells, almost all zero; the list needs 700,000 entries (each undirected road is stored twice, once from each end).

| Operation | Adjacency matrix | Adjacency list (`Map` of `Map`s) |
| --- | --- | --- |
| Memory | O(V²) | O(V + E) |
| Is there an edge a → b? | O(1) | O(1) average (O(degree) if neighbours are an array) |
| List the neighbours of a | O(V): scan a whole row | O(degree of a) |
| Visit every edge | O(V²) | O(V + E) |
| Add a vertex | O(V²): grow the grid | O(1) |

Most graph algorithms spend their time listing neighbours, so the adjacency list is the default. A matrix earns its place for small, dense graphs, or when you mostly ask "are these two connected?".

### A Graph class

graph.js

```ts
export class Graph {
  #adjacency = new Map();
  #directed;
  #edges = 0;

  constructor({ directed = false } = {}) {
    this.#directed = directed;
  }

  addVertex(v) {
    if (!this.#adjacency.has(v)) this.#adjacency.set(v, new Map());
  }

  addEdge(from, to, weight = 1) {
    this.addVertex(from);
    this.addVertex(to);
    if (!this.#adjacency.get(from).has(to)) this.#edges++;
    this.#adjacency.get(from).set(to, weight);
    if (!this.#directed) this.#adjacency.get(to).set(from, weight);
  }

  removeEdge(from, to) {
    if (!this.#adjacency.get(from)?.delete(to)) return false;
    if (!this.#directed) this.#adjacency.get(to).delete(from);
    this.#edges--;
    return true;
  }

  hasEdge(from, to) {
    return this.#adjacency.get(from)?.has(to) ?? false;
  }

  weight(from, to) {
    return this.#adjacency.get(from)?.get(to);
  }

  neighbours(v) {
    return [...(this.#adjacency.get(v)?.keys() ?? [])];
  }

  vertices() {
    return [...this.#adjacency.keys()];
  }

  get vertexCount() { return this.#adjacency.size; }
  get edgeCount() { return this.#edges; }
  get directed() { return this.#directed; }
}
```

`addEdge` creates missing vertices, ignores a repeated edge when counting, and for an undirected graph stores the edge in both directions. `neighbours` returns a copy, so callers cannot change the graph by accident. Map iteration follows insertion order, which makes every result below repeatable.

roads.js

```ts
import { Graph } from "./graph.js";

const roads = new Graph();
for (const [a, b, km] of [
  ["Lagos", "Ibadan", 128], ["Lagos", "Benin", 312], ["Ibadan", "Abuja", 640],
  ["Benin", "Abuja", 480], ["Abuja", "Kano", 430], ["Benin", "Enugu", 250],
]) {
  roads.addEdge(a, b, km);
}

console.log(`${roads.vertexCount} cities, ${roads.edgeCount} roads`);
console.log("from Benin:", roads.neighbours("Benin").join(", "));
console.log("Abuja to Benin:", roads.weight("Abuja", "Benin"), "km");

function tripLength(graph, stops) {
  let total = 0;
  for (let i = 1; i < stops.length; i++) {
    const km = graph.weight(stops[i - 1], stops[i]);
    if (km === undefined) throw new Error(`no road from ${stops[i - 1]} to ${stops[i]}`);
    total += km;
  }
  return total;
}

console.log("Lagos-Benin-Abuja-Kano:", tripLength(roads, ["Lagos", "Benin", "Abuja", "Kano"]), "km");
try {
  tripLength(roads, ["Lagos", "Kano"]);
} catch (error) {
  console.log(error.message);
}
```

Output of `node roads.js` and of the browser terminal

```ts
6 cities, 6 roads
from Benin: Lagos, Abuja, Enugu
Abuja to Benin: 480 km
Lagos-Benin-Abuja-Kano: 1222 km
no road from Lagos to Kano
```

Checking a planned trip is easy. *Finding* the shortest trip is a search problem, with its own lesson: [Graph search](https://zudojs.oyinlola.site/learn/dsa-graph-search) covers breadth-first search and Dijkstra's algorithm on exactly this kind of weighted graph.

## Directed graphs: followers and dependencies

On a social network, "Ada follows Tunde" does not mean Tunde follows Ada, so follows are directed edges. An adjacency list answers "who does Ada follow?" in O(her out-degree). The reverse question, "who follows Tunde?", has no direct answer: you would have to check every vertex's list, O(V + E). If you ask it often, keep a second, **reversed** graph as well, updated on every follow and unfollow. That trade (twice the memory, both directions fast) is exactly what the `@zudojs/lifecycle` graph you will meet below does with its `getDependencies` and `getDependents`.

follows.js

```ts
import { Graph } from "./graph.js";

const follows = new Graph({ directed: true });
const followers = new Graph({ directed: true });

function follow(a, b) {
  follows.addEdge(a, b);
  followers.addEdge(b, a);
}

follow("Ada", "Tunde");
follow("Tunde", "Ada");
follow("Chioma", "Tunde");
follow("Emeka", "Tunde");
follow("Ada", "Chioma");

console.log("Ada follows:", follows.neighbours("Ada").join(", "));
console.log("Tunde's followers:", followers.neighbours("Tunde").join(", "));

const mutual = follows.neighbours("Ada").filter((other) => follows.hasEdge(other, "Ada"));
console.log("Ada's mutual follows:", mutual.join(", "));
```

Output of `node follows.js` and of the browser terminal

```ts
Ada follows: Tunde, Chioma
Tunde's followers: Ada, Chioma, Emeka
Ada's mutual follows: Tunde
```

The mutual-follow check is O(out-degree), because each `hasEdge` is an O(1) `Map` lookup. With neighbour *arrays* it would be O(out-degree × degree), a difference you would feel for an account with a million followers.

## What does a package pull in?

Installing `@shop/orders` installs its dependencies, and theirs, and so on. The set of packages you can reach by following edges is its **transitive dependencies**. Walking a graph looks like walking a tree, with one crucial difference: in a graph the same vertex can be reached by more than one path. Both `catalog` and `users` lead to `db`. A walk that does not remember where it has been visits `db` twice, and `db`'s dependencies twice, and it gets worse with every shared dependency.

The fix is a **visited set**: before expanding a vertex, check whether you have seen it. To show how much it matters, here is a graph of 20 "diamonds", each layer depending on two packages that both depend on the next layer. There are only 61 packages, but 220 different paths from the top to the bottom:

diamonds.js

```ts
import { Graph } from "./graph.js";

const deps = new Graph({ directed: true });
for (let i = 0; i < 20; i++) {
  deps.addEdge(`layer${i}`, `left${i}`);
  deps.addEdge(`layer${i}`, `right${i}`);
  deps.addEdge(`left${i}`, `layer${i + 1}`);
  deps.addEdge(`right${i}`, `layer${i + 1}`);
}

function walkWithoutMemory(graph, start) {
  let visits = 0;
  const stack = [start];
  while (stack.length > 0) {
    const v = stack.pop();
    visits++;
    for (const next of graph.neighbours(v)) stack.push(next);
  }
  return visits;
}

function reachable(graph, start) {
  const seen = new Set([start]);
  const stack = [start];
  while (stack.length > 0) {
    const v = stack.pop();
    for (const next of graph.neighbours(v)) {
      if (!seen.has(next)) {
        seen.add(next);
        stack.push(next);
      }
    }
  }
  return seen;
}

console.log("packages:", deps.vertexCount, "links:", deps.edgeCount);
console.log("visits without a visited set:", walkWithoutMemory(deps, "layer0"));
console.log("reachable with a visited set:", reachable(deps, "layer0").size);
```

Output of `node diamonds.js` and of the browser terminal

```ts
packages: 61 links: 80
visits without a visited set: 4194301
reachable with a visited set: 61
```

Without memory the walk made millions of visits to a 61-package graph, and each extra layer doubles it. With the visited set every vertex is pushed once and every edge is looked at once: O(V + E). In a graph with a cycle, the walk without memory would never end at all. **Every graph walk needs a visited set.**

This is a **depth-first** walk (it uses a stack). With a queue it would be **breadth-first**, visiting vertices in order of distance from the start. [Graph search](https://zudojs.oyinlola.site/learn/dsa-graph-search) builds both properly, with paths, shortest routes and connected components.

## Topological sort

A **topological order** of a directed graph lists every vertex so that for every edge *u → v*, *u* comes before *v*. For building packages you want each dependency before the packages that use it, so the edges should point from a dependency to the package that **needs** it: `db → users` means "db must be built before users". That is the reverse of the "uses" arrows in the drawing above; getting the direction wrong gives you the order exactly backwards.

A topological order exists if and only if the graph is a DAG. If there is a cycle, every vertex on it is waiting for another one, forever.

REASON IT OUT

### Before writing the sort

Think about the inputs before the algorithm. The dependency lists come from each package's `package.json`, written by people. What if a package lists a dependency that is not in the monorepo at all? What if it lists itself? What if two packages have no relation to each other: which goes first, and is the answer unique? If there is a cycle, should the function throw, or return what it could order? And what does the caller need from the error to fix it?

**Show the reasoning**

- **Unknown dependency**: it may be an external npm package (fine, not your job to build) or a typo like `@shop/userz`. Silently adding it as an empty vertex hides the typo. Better: only order known packages, and report unknown names so the caller can decide.
- **Self-dependency**: a cycle of length one. The sort must reject it like any other cycle.
- **Unrelated packages**: either order is correct, so topological order is usually *not unique*. Build tools want the same order on every machine, so make ties deterministic (for example, process ready packages in the order they were declared, or alphabetically).
- **Cycles**: a partial order is dangerous if the caller does not notice it is partial. Return it clearly marked, or throw, and in both cases *name the packages involved*, ideally the actual loop (`db → users → db`). "Cycle detected" alone sends someone searching through 200 package files.

### Kahn's algorithm

The idea is the naive loop from the start, done efficiently. A package is ready when it has no unbuilt dependencies, that is, when its **in-degree** (counting only unbuilt dependencies) is 0. So:

1. Count the in-degree of every vertex. Put every vertex with in-degree 0 into a queue.
2. Take a vertex from the queue and append it to the order. For each vertex it points to, decrease that vertex's in-degree by 1; if it reaches 0, it is now ready, so add it to the queue.
3. When the queue is empty, stop. If the order has fewer vertices than the graph, the rest are on a cycle, or depend on one.

topo.js

```ts
export function dependencyGraph(packages) {
  const needs = new Map(Object.keys(packages).map((name) => [name, []]));
  const unknown = [];
  for (const [name, deps] of Object.entries(packages)) {
    for (const dep of deps) {
      if (needs.has(dep)) needs.get(dep).push(name);
      else unknown.push(`${name} -> ${dep}`);
    }
  }
  return { needs, unknown };
}

export function topoSort(needs) {
  const inDegree = new Map([...needs.keys()].map((v) => [v, 0]));
  for (const targets of needs.values()) {
    for (const t of targets) inDegree.set(t, inDegree.get(t) + 1);
  }
  const queue = [...needs.keys()].filter((v) => inDegree.get(v) === 0);
  const order = [];
  for (let head = 0; head < queue.length; head++) {
    const v = queue[head];
    order.push(v);
    for (const t of needs.get(v)) {
      inDegree.set(t, inDegree.get(t) - 1);
      if (inDegree.get(t) === 0) queue.push(t);
    }
  }
  const blocked = [...needs.keys()].filter((v) => inDegree.get(v) > 0);
  return { order, blocked };
}
```

`dependencyGraph` turns the "uses" lists into a `needs` map pointing the other way (from a dependency to the packages that need it), and collects unknown names instead of inventing vertices for them. `topoSort` works on any such map. Every vertex enters the queue once and every edge is followed once: O(V + E) time and O(V) extra memory.

install-order.js

```ts
import { dependencyGraph, topoSort } from "./topo.js";

const packages = {
  "@shop/api": ["@shop/auth", "@shop/orders", "@shop/logger", "express"],
  "@shop/orders": ["@shop/catalog", "@shop/users", "@shop/money"],
  "@shop/auth": ["@shop/users", "@shop/config"],
  "@shop/catalog": ["@shop/db", "@shop/money"],
  "@shop/users": ["@shop/db"],
  "@shop/db": ["@shop/config", "@shop/logger"],
  "@shop/config": [],
  "@shop/logger": [],
  "@shop/money": [],
};

const { needs, unknown } = dependencyGraph(packages);
const { order, blocked } = topoSort(needs);
order.forEach((name, i) => console.log(`${i + 1}. ${name}`));
console.log("blocked:", blocked.length === 0 ? "none" : blocked.join(", "));
console.log("not in the monorepo:", unknown.join(", "));
```

Output of `node install-order.js` and of the browser terminal

```ts
1. @shop/config
2. @shop/logger
3. @shop/money
4. @shop/db
5. @shop/catalog
6. @shop/users
7. @shop/orders
8. @shop/auth
9. @shop/api
blocked: none
not in the monorepo: @shop/api -> express
```

`express` is reported, not ordered: it comes from npm. Now break the graph the same way as at the start:

install-cycle.js

```ts
import { dependencyGraph, topoSort } from "./topo.js";

const packages = {
  "@shop/api": ["@shop/orders"],
  "@shop/orders": ["@shop/users", "@shop/money"],
  "@shop/users": ["@shop/db"],
  "@shop/db": ["@shop/config", "@shop/users"],
  "@shop/config": [],
  "@shop/money": [],
};

const { order, blocked } = topoSort(dependencyGraph(packages).needs);
console.log("can build:", order.join(", "));
console.log("blocked:", blocked.join(", "));
```

Output of `node install-cycle.js` and of the browser terminal

```ts
can build: @shop/config, @shop/money
blocked: @shop/api, @shop/orders, @shop/users, @shop/db
```

Kahn's algorithm tells you *which* packages are blocked, but not which of them form the loop: `orders` and `api` are only blocked because they depend on it. The depth-first version below finds the loop itself.

### Parallel stages

Packages that do not depend on each other can be built at the same time. Run Kahn's algorithm one "wave" at a time: everything ready now is a stage; finishing a stage makes the next stage ready. Monorepo tools such as Turborepo and pnpm schedule parallel builds from the same in-degree bookkeeping; they usually go one step further and start each package as soon as its *own* dependencies finish, instead of waiting for the whole stage.

stages.js

```ts
import { dependencyGraph } from "./topo.js";

const packages = {
  "@shop/api": ["@shop/auth", "@shop/orders", "@shop/logger"],
  "@shop/orders": ["@shop/catalog", "@shop/users", "@shop/money"],
  "@shop/auth": ["@shop/users", "@shop/config"],
  "@shop/catalog": ["@shop/db", "@shop/money"],
  "@shop/users": ["@shop/db"],
  "@shop/db": ["@shop/config", "@shop/logger"],
  "@shop/config": [],
  "@shop/logger": [],
  "@shop/money": [],
};

function stages(needs) {
  const inDegree = new Map([...needs.keys()].map((v) => [v, 0]));
  for (const targets of needs.values()) for (const t of targets) inDegree.set(t, inDegree.get(t) + 1);
  let ready = [...needs.keys()].filter((v) => inDegree.get(v) === 0);
  const result = [];
  while (ready.length > 0) {
    result.push(ready);
    const next = [];
    for (const v of ready) {
      for (const t of needs.get(v)) {
        inDegree.set(t, inDegree.get(t) - 1);
        if (inDegree.get(t) === 0) next.push(t);
      }
    }
    ready = next;
  }
  return result;
}

stages(dependencyGraph(packages).needs).forEach((stage, i) => {
  console.log(`stage ${i + 1}: ${stage.join(", ")}`);
});
```

Output of `node stages.js` and of the browser terminal

```ts
stage 1: @shop/config, @shop/logger, @shop/money
stage 2: @shop/db
stage 3: @shop/catalog, @shop/users
stage 4: @shop/orders, @shop/auth
stage 5: @shop/api
```

Nine packages, five stages. If every build takes a minute, the parallel build takes five minutes instead of nine. The number of stages is the length of the longest dependency chain (here config → db → users → auth or orders → api), which is called the **critical path**: no amount of parallel workers can beat it.

### Depth-first topological sort, with the cycle named

The second classic method uses depth-first search. Visit a package, first visit (recursively) everything it uses, and only then add the package to the output. That is a post-order walk, from [the trees lesson](https://zudojs.oyinlola.site/learn/dsa-trees#traversals), and in post-order every dependency is written before the package that uses it. The edges here are the natural "uses" direction, so no reversing is needed.

To detect cycles, each vertex has one of three states: not visited yet, **in progress** (on the current path), and done. Reaching an in-progress vertex again means you have walked in a circle, and the current path from that vertex onwards *is* the cycle.

dfs-topo.js

```ts
function buildOrder(packages) {
  const state = new Map();
  const path = [];
  const order = [];

  function visit(name) {
    if (state.get(name) === "done") return;
    if (state.get(name) === "in progress") {
      const loop = [...path.slice(path.indexOf(name)), name];
      throw new Error(`dependency cycle: ${loop.join(" -> ")}`);
    }
    state.set(name, "in progress");
    path.push(name);
    for (const dep of packages[name] ?? []) visit(dep);
    path.pop();
    state.set(name, "done");
    order.push(name);
  }

  for (const name of Object.keys(packages)) visit(name);
  return order;
}

const packages = {
  "@shop/api": ["@shop/orders", "@shop/auth"],
  "@shop/orders": ["@shop/users", "@shop/money"],
  "@shop/auth": ["@shop/users"],
  "@shop/users": ["@shop/db"],
  "@shop/db": ["@shop/config"],
  "@shop/config": [],
  "@shop/money": [],
};
console.log(buildOrder(packages).join(", "));

packages["@shop/db"].push("@shop/auth");
try {
  buildOrder(packages);
} catch (error) {
  console.log(error.message);
}
```

Output of `node dfs-topo.js` and of the browser terminal

```ts
@shop/config, @shop/db, @shop/users, @shop/money, @shop/orders, @shop/auth, @shop/api
dependency cycle: @shop/users -> @shop/db -> @shop/auth -> @shop/users
```

The order differs from Kahn's, and both are correct: remember that topological order is usually not unique. The cycle message names the exact loop, which is what a developer needs. The `?? []` treats unknown packages (external ones) as having no dependencies here; the recursion depth is the longest dependency chain, which is small for packages but could overflow the stack for a huge generated graph, where Kahn's loop is the safer choice.

|  | Kahn (in-degrees and a queue) | Depth-first (post-order) |
| --- | --- | --- |
| Time, memory | O(V + E), O(V) | O(V + E), O(V) |
| On a cycle | Lists all blocked vertices | Names the exact loop |
| Parallel stages | Natural (process in waves) | Needs extra work |
| Recursion | None | Depth = longest chain (or use an explicit stack) |

## The same idea inside a framework

An application has the same problem at startup: the database connection needs the config loaded, the job queue needs the database, the HTTP server needs the queue. Shutdown is the mirror image: stop accepting requests first, close the database last. The ZudoJS lifecycle package solves it with exactly this lesson's tools: a dependency graph with both directions stored (`getDependencies` and `getDependents`), and a topological sort that returns **stages** of components that can start in parallel. It exports both, so you can try them directly (this example needs Node):

zudo-stages.jsNode.js only

```ts
import { DependencyGraph, topologicalSort, reverseTopologicalSort } from "@zudojs/lifecycle";

const graph = new DependencyGraph();
for (const id of ["config", "logger", "database", "cache", "queue", "http"]) graph.addNode(id);
graph.addEdge("logger", "config");
graph.addEdge("database", "config");
graph.addEdge("database", "logger");
graph.addEdge("cache", "config");
graph.addEdge("queue", "database");
graph.addEdge("http", "database");
graph.addEdge("http", "cache");

console.log("start:", topologicalSort(graph).map((stage) => stage.join(" + ")).join("  then  "));
console.log("stop: ", reverseTopologicalSort(graph).map((stage) => stage.join(" + ")).join("  then  "));

graph.addEdge("config", "http");
try {
  graph.validate();
} catch (error) {
  console.log(error.name + ": " + error.message);
}
```

Output of `node zudo-stages.js`

```ts
start: config  then  logger + cache  then  database  then  queue + http
stop:  http + queue  then  database  then  cache + logger  then  config
LifecycleDependencyError: Circular lifecycle dependency detected: config -> http -> database -> config.
```

Here `addEdge(from, to)` means "from depends on to", the "uses" direction. `validate()` reports the loop as a path, like the depth-first version. In an application you rarely call these yourself: you register components with `dependsOn` and the lifecycle manager orders them, which [the runtime lesson](https://zudojs.oyinlola.site/learn/zudo-runtime) shows.

## Testing a topological sort

Hand-written cases are a start, but a sort that passes three examples can still fail on the fourth shape. A **property** that every correct answer must have is easy to state and check: the output contains every vertex exactly once, and for every edge *u → v*, *u* comes before *v*. Generate many random DAGs (a simple trick guarantees no cycles: shuffle the vertices, and only add edges from earlier to later in that shuffled order) and check the property on each. Then check that graphs *with* a cycle are always rejected.

topo-test.js

```ts
import { topoSort } from "./topo.js";

function check(label, ok) {
  console.log(`${ok ? "PASS" : "FAIL"} ${label}`);
}

function isTopological(needs, order) {
  if (order.length !== needs.size || new Set(order).size !== order.length) return false;
  const position = new Map(order.map((v, i) => [v, i]));
  for (const [v, targets] of needs) {
    for (const t of targets) if (position.get(v) > position.get(t)) return false;
  }
  return true;
}

let seed = 11;
const random = () => (seed = (seed * 16807) % 2147483647) / 2147483647;

function randomDag(size, density) {
  const names = Array.from({ length: size }, (_, i) => `pkg${i}`);
  for (let i = names.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [names[i], names[j]] = [names[j], names[i]];
  }
  const needs = new Map(names.map((n) => [n, []]));
  for (let i = 0; i < size; i++) {
    for (let j = i + 1; j < size; j++) if (random() < density) needs.get(names[i]).push(names[j]);
  }
  return { needs, names };
}

function reaches(needs, from, to) {
  const seen = new Set([from]);
  const stack = [from];
  while (stack.length > 0) {
    for (const next of needs.get(stack.pop())) {
      if (next === to) return true;
      if (!seen.has(next)) {
        seen.add(next);
        stack.push(next);
      }
    }
  }
  return false;
}

check("empty graph", topoSort(new Map()).order.length === 0);
check("self-dependency is blocked", topoSort(new Map([["a", ["a"]]])).blocked.join() === "a");

let dagFailures = 0;
let cycleFailures = 0;
let cyclesMade = 0;
for (let round = 0; round < 300; round++) {
  const { needs, names } = randomDag(2 + Math.floor(random() * 30), random() * 0.3);
  const { order, blocked } = topoSort(needs);
  if (!isTopological(needs, order) || blocked.length > 0) dagFailures++;
  const first = names[0];
  const last = names[names.length - 1];
  const makesCycle = reaches(needs, first, last);
  needs.get(last).push(first);
  const caught = topoSort(needs).blocked.length > 0;
  if (caught !== makesCycle) cycleFailures++;
  if (makesCycle) cyclesMade++;
}
check("300 random DAGs are ordered correctly", dagFailures === 0);
check(`a back edge is rejected exactly when it closes a cycle (${cyclesMade} of 300 did)`, cycleFailures === 0);
```

Output of `node topo-test.js` and of the browser terminal

```ts
PASS empty graph
PASS self-dependency is blocked
PASS 300 random DAGs are ordered correctly
PASS a back edge is rejected exactly when it closes a cycle (137 of 300 did)
```

The second half of the loop adds one edge from the last vertex in the shuffled order back to the first. That creates a cycle only if there was already a path from the first to the last, so the test first works out, with a reachability walk like the one earlier, whether a cycle *should* appear, and then demands that the sort agrees: a rejection when it should, a clean order when it should not. Stating the property precisely, rather than "it probably makes a cycle", is often the hardest part of property-based testing. A looser version, "expect a rejection whenever the first vertex has any outgoing edges", sounds plausible and fails on some of these random graphs: an edge out of the first vertex does not mean a path to the last one.

## Graphs in production

- **Everywhere you look.** Package managers resolve dependency graphs. Build tools, spreadsheets (recalculate a cell after the cells it reads) and database migration tools run topological sorts. Workflow schedulers such as Apache Airflow call their jobs "DAGs". ES modules form an import graph, and circular imports are cycles in it (see [Modules](https://zudojs.oyinlola.site/learn/js-modules)). Maps, social networks, fraud rings and recommendation systems are graphs of millions of vertices.
- **Make ties deterministic.** If two machines build in different orders, a bug that depends on order appears on one and not the other. Iterate in a fixed order (declaration order, as here, or sorted names).
- **Report cycles well.** Name the loop. Many tools also show the path from the thing you asked for to the loop, because the loop is often deep inside someone else's package.
- **Validate edges.** A typo in a dependency name must not become a silent new vertex. Check names against the known set, as `dependencyGraph` did.
- **Big graphs need compact storage.** A `Map` of `Map`s costs dozens of bytes per edge. Graphs with millions of edges are stored with integer vertex ids and flat typed arrays (a format called compressed sparse row), or in a graph database. The algorithms stay the same.
- **Weights change.** Travel times, prices and link latencies change all the time. Route results should carry the time they were computed, and be recomputed rather than cached forever.

## Practice

TRY IT YOURSELF

### People you may know

Friendships are an undirected graph. Suggest people for Ada: friends of her friends who are not Ada and not already her friends, ranked by how many mutual friends they share (ties alphabetically). What is the cost in terms of degrees?

**Show a solution**

suggest.js

```ts
import { Graph } from "./graph.js";

const friends = new Graph();
for (const [a, b] of [
  ["Ada", "Tunde"], ["Ada", "Chioma"], ["Ada", "Emeka"], ["Tunde", "Bola"],
  ["Chioma", "Bola"], ["Chioma", "Yusuf"], ["Emeka", "Yusuf"], ["Emeka", "Bola"], ["Tunde", "Chioma"],
]) {
  friends.addEdge(a, b);
}

function suggestions(graph, person) {
  const mutual = new Map();
  for (const friend of graph.neighbours(person)) {
    for (const candidate of graph.neighbours(friend)) {
      if (candidate === person || graph.hasEdge(person, candidate)) continue;
      mutual.set(candidate, (mutual.get(candidate) ?? 0) + 1);
    }
  }
  return [...mutual].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
}

for (const [name, count] of suggestions(friends, "Ada")) console.log(`${name}: ${count} mutual friends`);
```

Output of `node suggest.js` and of the browser terminal

```ts
Bola: 3 mutual friends
Yusuf: 2 mutual friends
```

For each of Ada's d friends you look at their friends: the sum of their degrees, then a sort of the candidates. Tunde and Chioma are skipped because they are already Ada's friends. This is why social networks can suggest friends instantly even with a billion users: the work depends on the neighbourhood, not on the size of the graph.

TRY IT YOURSELF

### What breaks if money changes?

Someone changes `@shop/money`. Which packages must be rebuilt and retested? Build the reversed graph (from each package to the packages that use it) and find everything reachable from `@shop/money`, without visiting anything twice.

**Show a solution**

affected.js

```ts
const packages = {
  "@shop/api": ["@shop/auth", "@shop/orders"],
  "@shop/orders": ["@shop/catalog", "@shop/users", "@shop/money"],
  "@shop/auth": ["@shop/users"],
  "@shop/catalog": ["@shop/db", "@shop/money"],
  "@shop/users": ["@shop/db"],
  "@shop/invoices": ["@shop/money"],
  "@shop/db": [],
  "@shop/money": [],
};

const usedBy = new Map(Object.keys(packages).map((name) => [name, []]));
for (const [name, deps] of Object.entries(packages)) {
  for (const dep of deps) usedBy.get(dep).push(name);
}

function affectedBy(start) {
  const seen = new Set([start]);
  const queue = [start];
  for (let head = 0; head < queue.length; head++) {
    for (const user of usedBy.get(queue[head])) {
      if (!seen.has(user)) {
        seen.add(user);
        queue.push(user);
      }
    }
  }
  seen.delete(start);
  return [...seen];
}

console.log("rebuild after money changes:", affectedBy("@shop/money").join(", "));
console.log("rebuild after auth changes:", affectedBy("@shop/auth").join(", "));
```

Output of `node affected.js` and of the browser terminal

```ts
rebuild after money changes: @shop/orders, @shop/catalog, @shop/invoices, @shop/api
rebuild after auth changes: @shop/api
```

Reversing takes O(V + E) and the walk is O(V + E) at most. `@shop/users` and `@shop/db` are untouched by a money change, so a CI system that knows this graph can skip their tests. Monorepo tools call this "affected" or "dependents" filtering.

TRY IT YOURSELF

### Course plan

An academy lists which lessons each lesson requires. Print a valid study order, and the smallest number of weeks needed if a student can take any number of lessons in one week but only after all their prerequisites are done. Then add a prerequisite that creates a cycle and show the error.

**Show a solution**

course-plan.js

```ts
import { topoSort } from "./topo.js";

function plan(requires) {
  const needs = new Map(Object.keys(requires).map((lesson) => [lesson, []]));
  for (const [lesson, before] of Object.entries(requires)) {
    for (const b of before) needs.get(b).push(lesson);
  }
  const { order, blocked } = topoSort(needs);
  if (blocked.length > 0) throw new Error(`impossible plan, stuck on: ${blocked.join(", ")}`);
  const week = new Map();
  for (const lesson of order) {
    week.set(lesson, 1 + Math.max(0, ...requires[lesson].map((b) => week.get(b))));
  }
  return { order, weeks: Math.max(...week.values()) };
}

const requires = {
  javascript: [],
  recursion: ["javascript"],
  trees: ["recursion", "hash maps"],
  "hash maps": ["javascript"],
  heaps: ["trees"],
  graphs: ["trees", "hash maps"],
  tries: ["trees"],
};

const { order, weeks } = plan(requires);
console.log(order.join(" -> "));
console.log(`at least ${weeks} weeks`);

requires.javascript.push("graphs");
try {
  plan(requires);
} catch (error) {
  console.log(error.message);
}
```

Output of `node course-plan.js` and of the browser terminal

```ts
javascript -> recursion -> hash maps -> trees -> heaps -> graphs -> tries
at least 4 weeks
impossible plan, stuck on: javascript, recursion, trees, hash maps, heaps, graphs, tries
```

The week of each lesson is one more than the latest week among its prerequisites, computed in topological order so the prerequisites are always known first. That is the longest path in the DAG, the critical path from the parallel-stages section, and it takes O(V + E) because the order is topological. Finding the longest path in a graph *with* cycles is a much harder problem; DAGs make it easy.

## Recap

- A graph is vertices plus edges, with no other rules. Edges can be directed or undirected, weighted or not. Choosing what the vertices, edges, direction and weights mean is most of the work.
- An adjacency list (a `Map` of `Map`s) uses O(V + E) memory and lists neighbours in O(degree); an adjacency matrix uses O(V²) and checks one edge in O(1). Real graphs are sparse, so lists are the default. Keep a reversed graph when you need "who points at me?" quickly.
- Every graph walk needs a visited set: shared dependencies make the number of paths explode, and cycles make it infinite. With the set, reachability is O(V + E).
- A topological order puts every edge's source before its target; it exists only for DAGs and is usually not unique. Kahn's algorithm (in-degrees and a queue) is O(V + E), lists blocked vertices and gives parallel stages; the depth-first version (post-order with an "in progress" state) names the exact cycle.
- Test a topological sort with properties on random DAGs: every vertex once, every edge forwards, and every cycle rejected.

Next: [Tries and autocomplete](https://zudojs.oyinlola.site/learn/dsa-tries): trees whose edges are letters, built to answer "which product names start with *sam*?" as fast as the user types.

## Test yourself

Five questions, picked at random from this lesson's question bank. Some ask you to choose an answer, some to predict what code prints, and some to write code and run it in the terminal. Get 4 of 5 right to pass. If you don't, read the explanations and try again: you get 5 different questions.
