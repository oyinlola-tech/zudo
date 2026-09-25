---
title: "Graph search — ZudoJS Academy"
description: "Route parcels with breadth-first search, solve a warehouse maze, find cut-off areas and circular transfers with depth-first search, and meet Dijkstra."
source: https://zudojs.oyinlola.site/learn/dsa-graph-search
---

LEVEL 3 · LESSON 13 OF 21

Algorithms Core

# Graph search

Route parcels with breadth-first search, solve a warehouse maze, find cut-off areas and circular transfers with depth-first search, and meet Dijkstra.

- **55 min** to read and try
- **You need:** Graphs and topological sort, Stacks and queues, Heaps and priority queues, and Recursion
- **You build:** A tested route finder for a delivery network (fewest hops with BFS, shortest distance with Dijkstra), a warehouse maze solver, and detectors for cut-off areas and circular money transfers

  [Test yourself](#test)

BY THE END OF THIS LESSON YOU CAN

- Find the shortest path by number of hops with breadth-first search and rebuild the route from parent links
- Explore a graph depth first, recursively and with an explicit stack, and explain when each search fits
- Solve grid problems such as mazes and flood fills by treating cells as vertices
- Find connected components and detect cycles in undirected and directed graphs
- Find shortest weighted routes with Dijkstra's algorithm and explain why it fails with negative weights

## The problem: how many days to Maiduguri?

A parcel company moves parcels between hubs in Nigerian cities. Every night a truck runs along each route between two hubs, so each hop costs one day. A customer in Lagos books a delivery to Maiduguri and asks the obvious question: how many days will it take, and through which hubs?

In [Graphs](https://zudojs.oyinlola.site/learn/dsa-graphs) you stored networks like this as an adjacency list: a `Map` from each hub (a **vertex**) to the hubs it has routes to (its **edges**). You also saw that walking a graph needs a visited set. This lesson turns that walk into the two fundamental searches, **breadth-first search** (BFS) and **depth-first search** (DFS), and uses them to answer questions like "fastest route", "which areas are cut off", and "is money going round in circles". It finishes with **Dijkstra's algorithm**, for when the hops do not all cost the same.

Here is the network. Each pair is a route that runs in both directions, so the graph is undirected.

network.js

```ts
export function graphFrom(routes, hubs = []) {
  const graph = new Map(hubs.map((hub) => [hub, []]));
  for (const [a, b] of routes) {
    if (!graph.has(a)) graph.set(a, []);
    if (!graph.has(b)) graph.set(b, []);
    graph.get(a).push(b);
    graph.get(b).push(a);
  }
  return graph;
}

export const routes = [
  ["Lagos", "Ibadan"], ["Lagos", "Benin"], ["Ibadan", "Ilorin"], ["Ilorin", "Abuja"],
  ["Ilorin", "Sokoto"], ["Benin", "Onitsha"], ["Benin", "Warri"], ["Warri", "Port Harcourt"],
  ["Onitsha", "Enugu"], ["Onitsha", "Owerri"], ["Owerri", "Port Harcourt"], ["Enugu", "Abuja"],
  ["Abuja", "Kaduna"], ["Abuja", "Jos"], ["Kaduna", "Kano"], ["Kaduna", "Sokoto"],
  ["Jos", "Bauchi"], ["Kano", "Bauchi"], ["Bauchi", "Maiduguri"], ["Port Harcourt", "Calabar"],
];
```

## Breadth-first search: ripples from the start

Think of dropping a stone in water at Lagos. The first ripple reaches every hub one hop away (Ibadan, Benin). The second reaches every hub two hops away that the first did not reach (Ilorin, Onitsha, Warri). And so on. Breadth-first search explores the graph exactly like that, in **layers** of increasing distance:

1. Put the start in a **queue** (first in, first out) and record its distance as 0.
2. Take the hub at the front of the queue. For each neighbour that has not been seen yet, record its distance (one more than the current hub's), record which hub it was reached from, and add it to the back of the queue.
3. Repeat until the queue is empty.

Because the queue is first in, first out, every hub at distance 1 is taken out before any hub at distance 2, and so on. So the first time BFS reaches a hub, it has reached it by a shortest route: if a shorter route existed, the hub would have been reached in an earlier layer. That argument only works if every hop costs the same, which is the key limitation of BFS.

REASON IT OUT

### Before you write BFS

Think about these before looking at the code. When should a hub be marked as seen: when it is added to the queue, or when it is taken out? What should happen if the start and the destination are the same hub? What if the destination cannot be reached at all, or is not in the network (a typo, "Maidugri")? The network has loops (Lagos, Benin, Onitsha, Enugu, Abuja, Ilorin, Ibadan, back to Lagos): what stops the search going round forever? And how do you get the actual route, not just the number of days?

**Show the reasoning**

- **Mark when added**. If you only mark a hub when it is taken out, it can be added to the queue several times in between, once by each neighbour that discovers it. The answer stays right but the queue fills with duplicates. Marking on add means every hub enters the queue exactly once.
- **Start equals destination**: distance 0, route of one hub. The code gets this for free if the start is recorded with distance 0 before the loop.
- **Unreachable**: a valid question with a valid answer ("no route"), so return `null` rather than throwing, and let the caller show "we do not deliver there". **Unknown hub** is different: it is a bug or bad input, so throw with the name in the message.
- **Loops**: the seen set. A hub that has been seen is never added again, so every hub is processed once and every route is looked at twice (once from each end).
- **The route**: when a hub is discovered, remember its **parent**, the hub it was reached from. Following parents back from the destination to the start gives the route in reverse.

bfs.js

```ts
export function bfs(graph, start) {
  if (!graph.has(start)) throw new Error(`unknown hub: ${start}`);
  const dist = new Map([[start, 0]]);
  const parent = new Map([[start, null]]);
  const queue = [start];
  let head = 0;
  let edgesChecked = 0;
  while (head < queue.length) {
    const hub = queue[head++];
    for (const next of graph.get(hub)) {
      edgesChecked++;
      if (dist.has(next)) continue;
      dist.set(next, dist.get(hub) + 1);
      parent.set(next, hub);
      queue.push(next);
    }
  }
  return { dist, parent, order: queue, edgesChecked };
}

export function pathTo(parent, goal) {
  if (!parent.has(goal)) return null;
  const path = [];
  for (let at = goal; at !== null; at = parent.get(at)) path.push(at);
  return path.reverse();
}
```

The queue is a plain array with a `head` index instead of `shift()`: on a large queue, `shift` moves every remaining item, which would make the search O(V²) ([Stacks and queues](https://zudojs.oyinlola.site/learn/dsa-stacks-queues#queue) explains why). The `dist` map doubles as the seen set.

days.js

```ts
import { bfs, pathTo } from "./bfs.js";
import { graphFrom, routes } from "./network.js";

const graph = graphFrom(routes);
const { dist, parent, order, edgesChecked } = bfs(graph, "Lagos");

console.log("visit order:", order.join(", "));
console.log("Maiduguri:", dist.get("Maiduguri"), "days via", pathTo(parent, "Maiduguri").join(" -> "));
console.log("Calabar:", dist.get("Calabar"), "days via", pathTo(parent, "Calabar").join(" -> "));
console.log("Lagos:", dist.get("Lagos"), "days via", pathTo(parent, "Lagos").join(" -> "));
console.log(`${graph.size} hubs, ${routes.length} routes, ${edgesChecked} neighbour checks`);

const layers = new Map();
for (const [hub, d] of dist) layers.set(d, [...(layers.get(d) ?? []), hub]);
for (const [d, hubs] of layers) console.log(`day ${d}: ${hubs.join(", ")}`);
```

Output of `node days.js` and of the browser terminal

```ts
visit order: Lagos, Ibadan, Benin, Ilorin, Onitsha, Warri, Abuja, Sokoto, Enugu, Owerri, Port Harcourt, Kaduna, Jos, Calabar, Kano, Bauchi, Maiduguri
Maiduguri: 6 days via Lagos -> Ibadan -> Ilorin -> Abuja -> Jos -> Bauchi -> Maiduguri
Calabar: 4 days via Lagos -> Benin -> Warri -> Port Harcourt -> Calabar
Lagos: 0 days via Lagos
17 hubs, 20 routes, 40 neighbour checks
day 0: Lagos
day 1: Ibadan, Benin
day 2: Ilorin, Onitsha, Warri
day 3: Abuja, Sokoto, Enugu, Owerri, Port Harcourt
day 4: Kaduna, Jos, Calabar
day 5: Kano, Bauchi
day 6: Maiduguri
```

The visit order is the layers in sequence. Each hub was taken out of the queue once, and each route was checked twice, once from each end (40 checks for 20 routes). That makes BFS O(V + E): linear in the size of the graph. Here each shortest route happens to be unique. When several routes take the same number of days, which one BFS reports depends on the order of the neighbour lists. If that matters, make it deterministic on purpose, for example by sorting neighbour lists.

### Failure case: marking too late

The reasoning box said to mark a hub as seen when it is *added* to the queue. Here is what happens on an open warehouse floor, where every cell has up to four neighbours, if you only mark it when it is *taken out*:

mark-late.js

```ts
function openFloor(size) {
  const graph = new Map();
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      const next = [];
      if (r > 0) next.push(`${r - 1},${c}`);
      if (r < size - 1) next.push(`${r + 1},${c}`);
      if (c > 0) next.push(`${r},${c - 1}`);
      if (c < size - 1) next.push(`${r},${c + 1}`);
      graph.set(`${r},${c}`, next);
    }
  }
  return graph;
}

function markOnAdd(graph, start) {
  const seen = new Set([start]);
  const queue = [start];
  for (let head = 0; head < queue.length; head++) {
    for (const next of graph.get(queue[head])) {
      if (!seen.has(next)) {
        seen.add(next);
        queue.push(next);
      }
    }
  }
  return queue.length;
}

function markOnTake(graph, start) {
  const seen = new Set();
  const queue = [start];
  for (let head = 0; head < queue.length; head++) {
    const cell = queue[head];
    if (seen.has(cell)) continue;
    seen.add(cell);
    for (const next of graph.get(cell)) {
      if (!seen.has(next)) queue.push(next);
    }
  }
  return queue.length;
}

for (const size of [10, 100]) {
  const floor = openFloor(size);
  console.log(`${size * size} cells: mark on add ${markOnAdd(floor, "0,0")} queue entries, mark on take ${markOnTake(floor, "0,0")}`);
}
```

Output of `node mark-late.js` and of the browser terminal

```ts
100 cells: mark on add 100 queue entries, mark on take 181
10000 cells: mark on add 10000 queue entries, mark on take 19801
```

Both versions find the same distances, but marking late puts almost every cell in the queue twice, once by each neighbour that discovers it before it is taken out. On a grid that doubles the memory. On a social network where people have hundreds of friends, the queue grows to one entry per *edge* instead of one per vertex, which can be hundreds of times larger.

### Stopping early

If you only need one destination, you can stop as soon as it is discovered: every hub discovered later is at least as far away. On a national network that is a small saving; on a social network with millions of accounts, "how are Ada and Tunde connected?" can stop after two or three layers instead of visiting everyone. Exercise 1 does this with a depth limit.

## Depth-first search: go deep, then back up

Depth-first search makes the other choice: from the current hub, go to an unvisited neighbour, and from there to *its* unvisited neighbour, as far as possible. Only when a hub has no unvisited neighbours left does it **backtrack** to the previous hub and try that hub's next neighbour. Recursion ([Recursion](https://zudojs.oyinlola.site/learn/js-recursion)) expresses this naturally, because the call stack remembers where to go back to:

dfs.js

```ts
import { bfs, pathTo } from "./bfs.js";
import { graphFrom, routes } from "./network.js";

const graph = graphFrom(routes);

function dfs(graph, start) {
  const parent = new Map([[start, null]]);
  const order = [];
  function visit(hub) {
    order.push(hub);
    for (const next of graph.get(hub)) {
      if (parent.has(next)) continue;
      parent.set(next, hub);
      visit(next);
    }
  }
  visit(start);
  return { parent, order };
}

const deep = dfs(graph, "Lagos");
console.log("visit order:", deep.order.join(", "));

const dfsRoute = pathTo(deep.parent, "Maiduguri");
const bfsRoute = pathTo(bfs(graph, "Lagos").parent, "Maiduguri");
console.log(`DFS route: ${dfsRoute.length - 1} hops: ${dfsRoute.join(" -> ")}`);
console.log(`BFS route: ${bfsRoute.length - 1} hops: ${bfsRoute.join(" -> ")}`);
```

Output of `node dfs.js` and of the browser terminal

```ts
visit order: Lagos, Ibadan, Ilorin, Abuja, Enugu, Onitsha, Benin, Warri, Port Harcourt, Owerri, Calabar, Kaduna, Kano, Bauchi, Jos, Maiduguri, Sokoto
DFS route: 7 hops: Lagos -> Ibadan -> Ilorin -> Abuja -> Kaduna -> Kano -> Bauchi -> Maiduguri
BFS route: 6 hops: Lagos -> Ibadan -> Ilorin -> Abuja -> Jos -> Bauchi -> Maiduguri
```

DFS visits every hub too, in O(V + E), but its routes are whatever path the search happened to wander down first. The DFS route to Maiduguri takes a detour through Kaduna and Kano, 7 hops instead of 6; on a bigger network the difference can be enormous. **DFS does not find shortest paths.** It is the right tool when you need to visit everything, or to know *whether* something is reachable, or to understand the structure of the graph: components, cycles, and the topological order you built in [Graphs](https://zudojs.oyinlola.site/learn/dsa-graphs#topo).

### DFS with an explicit stack

Recursion has a limit. Each nested call takes a frame on the call stack, and a graph shaped like a long chain makes DFS recurse once per vertex. A chain of 100,000 connected accounts (each referred by the previous one) is enough:

deep-chain.js

```ts
const chain = new Map();
for (let i = 0; i < 100000; i++) chain.set(i, i + 1 < 100000 ? [i + 1] : []);

function countRecursive(graph, start) {
  const seen = new Set([start]);
  function visit(v) {
    for (const next of graph.get(v)) {
      if (!seen.has(next)) {
        seen.add(next);
        visit(next);
      }
    }
  }
  visit(start);
  return seen.size;
}

function countIterative(graph, start) {
  const seen = new Set([start]);
  const stack = [start];
  while (stack.length > 0) {
    const v = stack.pop();
    for (const next of graph.get(v)) {
      if (!seen.has(next)) {
        seen.add(next);
        stack.push(next);
      }
    }
  }
  return seen.size;
}

try {
  countRecursive(chain, 0);
} catch (error) {
  console.log(`recursive: ${error.name}: ${error.message}`);
}
console.log("iterative:", countIterative(chain, 0), "accounts reached");
```

Output of `node deep-chain.js` and of the browser terminal

```ts
recursive: RangeError: Maximum call stack size exceeded
iterative: 100000 accounts reached
```

Replacing the call stack with your own array stack removes the limit: the array lives on the heap and can hold millions of entries. The only difference between this iterative DFS and BFS is one line: `stack.pop()` takes the *newest* entry, `queue[head++]` the *oldest*. The iterative version visits neighbours in a slightly different order from the recursive one (it pushes all neighbours, then continues from the last), which is fine for reachability and counting.

## Grids are graphs: a warehouse maze

A picking robot in a warehouse drives from its charging station `S` to a shelf `E`. The floor plan is a grid: `#` is a shelf the robot cannot pass, `.` is free floor. It moves one cell up, down, left or right per step. Which way is fastest?

You do not need to build a `Map` for this. Each cell is a vertex, and its neighbours are the free cells next to it, which you compute on the fly from the row and column. BFS works unchanged.

maze.js

```ts
export function solveMaze(rows) {
  const grid = rows.map((row) => [...row]);
  const height = grid.length;
  const width = grid[0].length;
  const find = (ch) => {
    for (let r = 0; r < height; r++) {
      const c = grid[r].indexOf(ch);
      if (c !== -1) return [r, c];
    }
    throw new Error(`no ${ch} on the map`);
  };
  const [sr, sc] = find("S");
  const [er, ec] = find("E");
  const key = (r, c) => r * width + c;

  const parent = new Map([[key(sr, sc), null]]);
  const queue = [[sr, sc]];
  let head = 0;
  while (head < queue.length) {
    const [r, c] = queue[head++];
    if (r === er && c === ec) break;
    for (const [dr, dc] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
      const nr = r + dr;
      const nc = c + dc;
      if (nr < 0 || nr >= height || nc < 0 || nc >= width) continue;
      if (grid[nr][nc] === "#" || parent.has(key(nr, nc))) continue;
      parent.set(key(nr, nc), key(r, c));
      queue.push([nr, nc]);
    }
  }

  if (!parent.has(key(er, ec))) return { steps: null, explored: head, drawing: rows.join("\n") };
  let steps = 0;
  for (let at = parent.get(key(er, ec)); at !== key(sr, sc); at = parent.get(at)) {
    grid[Math.floor(at / width)][at % width] = "*";
    steps++;
  }
  return { steps: steps + 1, explored: head, drawing: grid.map((row) => row.join("")).join("\n") };
}
```

Three details: the cell key `r * width + c` turns a position into a single number so it can live in a `Map`; the bounds check comes before the grid lookup, so the robot never reads outside the map; and the search stops as soon as it takes `E` out of the queue.

robot.js

```ts
import { solveMaze } from "./maze.js";

const floor = [
  "S..#......",
  ".#.#.####.",
  ".#...#....",
  ".####.#.#.",
  "......#.#E",
];

const { steps, explored, drawing } = solveMaze(floor);
console.log(drawing);
console.log(`${steps} steps, ${explored} cells explored`);

const blocked = [...floor];
blocked[3] = ".####.#.##";
const none = solveMaze(blocked);
console.log("with E walled in:", none.steps, `(${none.explored} cells explored)`);
```

Output of `node robot.js` and of the browser terminal

```ts
S**#******
.#*#*####*
.#***#...*
.####.#.#*
......#.#E
17 steps, 29 cells explored
with E walled in: null (31 cells explored)
```

The stars mark the route. When `E` is walled in, BFS explores every reachable cell and then reports `null`, which is the proof that no route exists: it looked everywhere it could go. On a grid of R rows and C columns, BFS is O(R × C), because each cell has at most four neighbours.

> TIP
>
> The same code finds the nearest free parking space, the fewest moves for a game piece, or how far a flood spreads per hour. Change the neighbour rule (diagonals, knight moves, one-way ramps) and nothing else changes.

## Connected components: which areas are cut off?

Heavy rain closes several roads. Operations needs to know which hubs can still reach each other, so they can plan separate truck schedules for each part of the network. A **connected component** is a group of vertices that can all reach each other and cannot reach anything outside the group. To find them all: start a search from any unvisited hub; everything it reaches is one component. Then start again from the next unvisited hub, until every hub has been visited. Either BFS or DFS works; the total is still O(V + E), because every vertex and edge is handled once across all the searches.

components.js

```ts
import { graphFrom, routes } from "./network.js";

function components(graph) {
  const seen = new Set();
  const groups = [];
  for (const start of graph.keys()) {
    if (seen.has(start)) continue;
    const group = [start];
    seen.add(start);
    let edgeEnds = 0;
    for (let i = 0; i < group.length; i++) {
      for (const next of graph.get(group[i])) {
        edgeEnds++;
        if (!seen.has(next)) {
          seen.add(next);
          group.push(next);
        }
      }
    }
    groups.push({ hubs: group, routes: edgeEnds / 2 });
  }
  return groups;
}

const closed = new Set(["Ilorin|Abuja", "Enugu|Abuja", "Bauchi|Maiduguri", "Ilorin|Sokoto"]);
const open = routes.filter(([a, b]) => !closed.has(`${a}|${b}`));
const allHubs = [...graphFrom(routes).keys()];
const groups = components(graphFrom(open, allHubs));

for (const { hubs, routes: count } of groups) {
  const loop = count >= hubs.length ? "has a spare route" : "no spare route";
  const plural = (n, word) => `${n} ${word}${n === 1 ? "" : "s"}`;
  console.log(`${plural(hubs.length, "hub")}, ${plural(count, "route")}, ${loop}: ${hubs.join(", ")}`);
}
```

Output of `node components.js` and of the browser terminal

```ts
10 hubs, 10 routes, has a spare route: Lagos, Ibadan, Benin, Ilorin, Onitsha, Warri, Enugu, Owerri, Port Harcourt, Calabar
6 hubs, 6 routes, has a spare route: Abuja, Kaduna, Jos, Kano, Sokoto, Bauchi
1 hub, 0 routes, no spare route: Maiduguri
```

The network split into three parts: the south, the north, and Maiduguri on its own. Notice `graphFrom(open, allHubs)`: a graph built only from the open routes would not contain Maiduguri at all, because it has no open route left, and the report would silently leave it out. Build the vertex list from the list of hubs, not from the edges.

The last column uses a fact about undirected graphs: a connected group of V vertices needs at least V − 1 edges, and with exactly V − 1 it is a tree, with no loops at all. Every extra edge creates a **cycle**, a way to go round and come back. For a delivery network a cycle is good news: it means one more road can close without cutting the group in two. Both large groups still have one; Maiduguri needs the Bauchi road back before anything can reach it.

> NOTE
>
> For networks that change constantly (roads closing and reopening all day), rerunning the search for every question is wasteful. A structure called union-find (disjoint sets) answers "are these two connected?" almost in O(1) as roads are added. It cannot handle removals cheaply, so real systems often rebuild it periodically.

## Cycles in directed graphs: circular transfers

The bank's fraud team watches for money that goes round in a circle: account A pays B, B pays C, and C pays A again, often to make fake turnover look real. Transfers have a direction, so this is a **directed** graph, and the counting trick above does not apply. Meeting an already-seen account is not enough evidence either: A → B, A → C, B → C reaches C twice without any loop.

The DFS answer uses the three states from the depth-first topological sort in [Graphs](https://zudojs.oyinlola.site/learn/dsa-graphs#topo) (not visited, in progress, done). They are traditionally called colours: **white** (not visited), **grey** (visit started, still on the current path) and **black** (finished, and everything reachable from it explored). An edge to a *grey* vertex points back into the current path: that is a cycle. An edge to a black vertex is just a second way to reach something already fully explored.

cycles.js

```ts
export function findCycle(transfers) {
  const graph = new Map();
  for (const [from, to] of transfers) {
    if (!graph.has(from)) graph.set(from, []);
    if (!graph.has(to)) graph.set(to, []);
    graph.get(from).push(to);
  }

  const colour = new Map();
  const path = [];

  function visit(account) {
    colour.set(account, "grey");
    path.push(account);
    for (const next of graph.get(account)) {
      if (colour.get(next) === "grey") return [...path.slice(path.indexOf(next)), next];
      if (!colour.has(next)) {
        const found = visit(next);
        if (found) return found;
      }
    }
    path.pop();
    colour.set(account, "black");
    return null;
  }

  for (const account of graph.keys()) {
    if (!colour.has(account)) {
      const found = visit(account);
      if (found) return found;
    }
  }
  return null;
}
```

`path` mirrors the grey vertices in order, so when a back edge is found, the cycle is the part of the path from the grey vertex to the end, plus the grey vertex again to close the loop. Returning the actual accounts matters: "a cycle exists somewhere among 40,000 accounts" is not something an investigator can act on.

fraud.js

```ts
import { findCycle } from "./cycles.js";

const today = [
  ["Ada", "Bola"], ["Ada", "Chidi"], ["Bola", "Chidi"],
  ["Chidi", "Dayo"], ["Emeka", "Dayo"],
];
console.log("today:", findCycle(today) ?? "no circular transfers");

const later = [...today, ["Dayo", "Femi"], ["Femi", "Bola"]];
const loop = findCycle(later);
console.log("later:", loop.join(" -> "));
```

Output of `node fraud.js` and of the browser terminal

```ts
today: no circular transfers
later: Bola -> Chidi -> Dayo -> Femi -> Bola
```

In the first list, Chidi is reached twice (from Ada directly and through Bola) but money never comes back to where it started. After two more transfers, Bola → Chidi → Dayo → Femi → Bola is a loop. DFS with colours is O(V + E). Real fraud systems add conditions (amounts roughly equal, all within a few days), but the graph search underneath is this one. This recursive version shares the depth limit you saw above; for millions of accounts, rewrite it with an explicit stack.

## Dijkstra: when hops have different costs

Parcel days count hops, and every hop is one night. A courier driving a van cares about kilometres, and routes differ a lot in length. BFS finds the route with the fewest roads, which is not the same thing:

roads.js

```ts
export function weightedGraph(roads) {
  const graph = new Map();
  for (const [a, b, km] of roads) {
    if (!graph.has(a)) graph.set(a, []);
    if (!graph.has(b)) graph.set(b, []);
    graph.get(a).push([b, km]);
    graph.get(b).push([a, km]);
  }
  return graph;
}

export const roads = [
  ["Lagos", "Benin", 312], ["Benin", "Abuja", 480], ["Lagos", "Ibadan", 128],
  ["Ibadan", "Ilorin", 160], ["Ilorin", "Abuja", 470], ["Benin", "Onitsha", 140],
  ["Onitsha", "Enugu", 110], ["Enugu", "Abuja", 390], ["Abuja", "Kaduna", 190],
  ["Ilorin", "Kaduna", 520], ["Kaduna", "Kano", 230],
];
```

**Dijkstra's algorithm** (published by Edsger Dijkstra in 1959) generalises BFS. Instead of a queue ordered by arrival, it keeps a **priority queue** ordered by distance travelled so far, and always continues from the closest city it has not finalised yet. When a city comes out of the priority queue for the first time, its distance is final. The reason is the same ripple argument as BFS: every other city still waiting is at least as far away, and roads have non-negative lengths, so going through any of them cannot produce a shorter route.

The priority queue is the binary heap from [Heaps and priority queues](https://zudojs.oyinlola.site/learn/dsa-heaps), here in a compact version:

heap.js

```ts
export class MinHeap {
  #items = [];
  #before;

  constructor(before) {
    this.#before = before;
  }

  get size() {
    return this.#items.length;
  }

  push(item) {
    const a = this.#items;
    a.push(item);
    let i = a.length - 1;
    while (i > 0) {
      const p = Math.floor((i - 1) / 2);
      if (!this.#before(a[i], a[p])) break;
      [a[i], a[p]] = [a[p], a[i]];
      i = p;
    }
  }

  pop() {
    const a = this.#items;
    const top = a[0];
    const last = a.pop();
    if (a.length > 0) {
      a[0] = last;
      let i = 0;
      while (true) {
        const l = 2 * i + 1;
        const r = l + 1;
        let first = i;
        if (l < a.length && this.#before(a[l], a[first])) first = l;
        if (r < a.length && this.#before(a[r], a[first])) first = r;
        if (first === i) break;
        [a[i], a[first]] = [a[first], a[i]];
        i = first;
      }
    }
    return top;
  }
}
```

dijkstra.js

```ts
import { MinHeap } from "./heap.js";

export function dijkstra(graph, start) {
  if (!graph.has(start)) throw new Error(`unknown city: ${start}`);
  const dist = new Map([[start, 0]]);
  const parent = new Map([[start, null]]);
  const done = new Set();
  const heap = new MinHeap((a, b) => a.km < b.km);
  heap.push({ city: start, km: 0 });
  let pops = 0;

  while (heap.size > 0) {
    const { city, km } = heap.pop();
    pops++;
    if (done.has(city)) continue;
    done.add(city);
    for (const [next, length] of graph.get(city)) {
      if (!(length >= 0)) throw new RangeError(`road ${city}-${next} has length ${length}`);
      const candidate = km + length;
      if (!dist.has(next) || candidate < dist.get(next)) {
        dist.set(next, candidate);
        parent.set(next, city);
        heap.push({ city: next, km: candidate });
      }
    }
  }
  return { dist, parent, pops };
}

export function routeTo(parent, goal) {
  if (!parent.has(goal)) return null;
  const route = [];
  for (let at = goal; at !== null; at = parent.get(at)) route.push(at);
  return route.reverse();
}
```

- When a shorter route to `next` is found, the code pushes a new entry instead of updating the old one (a binary heap cannot find an entry quickly). The old, longer entry stays in the heap and is skipped by the `done` check when it comes out. This is the **lazy deletion** mentioned in the heaps lesson.
- `!(length >= 0)` rejects negative lengths and also `NaN` and `undefined`, which would otherwise poison every comparison.

van.js

```ts
import { dijkstra, routeTo } from "./dijkstra.js";
import { roads, weightedGraph } from "./roads.js";

const graph = weightedGraph(roads);
const { dist, parent, pops } = dijkstra(graph, "Lagos");

for (const city of ["Abuja", "Kano", "Enugu"]) {
  console.log(`${city}: ${dist.get(city)} km via ${routeTo(parent, city).join(" -> ")}`);
}
console.log(`${graph.size} cities, ${pops} heap pops`);

function hopsRoute(graph, start, goal) {
  const parent = new Map([[start, null]]);
  const queue = [start];
  for (let head = 0; head < queue.length; head++) {
    for (const [next] of graph.get(queue[head])) {
      if (!parent.has(next)) {
        parent.set(next, queue[head]);
        queue.push(next);
      }
    }
  }
  return routeTo(parent, goal);
}

const fewest = hopsRoute(graph, "Lagos", "Abuja");
let km = 0;
for (let i = 1; i < fewest.length; i++) km += graph.get(fewest[i - 1]).find(([c]) => c === fewest[i])[1];
console.log(`BFS (fewest roads) to Abuja: ${fewest.join(" -> ")}, ${km} km`);
```

Output of `node van.js` and of the browser terminal

```ts
Abuja: 758 km via Lagos -> Ibadan -> Ilorin -> Abuja
Kano: 1038 km via Lagos -> Ibadan -> Ilorin -> Kaduna -> Kano
Enugu: 562 km via Lagos -> Benin -> Onitsha -> Enugu
9 cities, 9 heap pops
BFS (fewest roads) to Abuja: Lagos -> Benin -> Abuja, 792 km
```

BFS picks the two-road route to Abuja through Benin, 792 km. Dijkstra finds a route with three roads that is 34 km shorter. Here every city came out of the heap exactly once; in denser networks, the stale entries left by lazy deletion make the number of pops larger than the number of cities.

### Cost and limits

Every edge can push at most one heap entry, so the heap holds at most E entries, and each push or pop costs O(log E). Dijkstra with a binary heap is O((V + E) log V). (log E is at most 2 log V, since E < V².) Two limits to remember:

- **Negative weights break it.** Suppose a route earns the driver a ₦ rebate that you model as a negative cost. Dijkstra finalises a city as soon as it comes out of the heap; a negative edge discovered later could make a finalised city cheaper, and the algorithm never goes back. The code above refuses negative lengths rather than give wrong answers. The Bellman-Ford algorithm handles negative weights in O(V × E).
- **It explores in all directions.** Searching Lagos to Kano also explores cities to the south and east, because they are close to Lagos. Map apps use **A***, which adds an estimate of the remaining distance (such as the straight-line distance to the goal) to each priority, so the search leans towards the destination.

Dijkstra is a **greedy** algorithm: it always takes the closest unfinished city and never reconsiders. The next lesson, [Greedy algorithms](https://zudojs.oyinlola.site/learn/dsa-greedy), is about when that kind of choice is safe, as it is here, and when it is not.

## Which search, when

| Question | Use | Cost |
| --- | --- | --- |
| Fewest hops, moves or transfers (every step costs the same) | BFS | O(V + E) |
| Shortest route with non-negative lengths, prices or times | Dijkstra | O((V + E) log V) |
| Can A reach B at all? Everything reachable from A? | BFS or DFS | O(V + E) |
| Which parts of the network are connected? | BFS or DFS from every unvisited vertex | O(V + E) |
| Does a directed graph contain a loop, and where? | DFS with three colours | O(V + E) |
| Order tasks so dependencies come first | Topological sort ([Graphs](https://zudojs.oyinlola.site/learn/dsa-graphs#topo)) | O(V + E) |
| Every possible route, or the best under complex rules | Backtracking ([Backtracking](https://zudojs.oyinlola.site/learn/dsa-backtracking)) | exponential |

BFS keeps a whole layer in its queue, which can be very wide (a social network's second layer may be millions of accounts). Recursive DFS keeps only the current path, which can be very deep; the explicit-stack version also keeps the neighbours waiting on its stack. When memory is tight and depth is known to be small, DFS is lighter; when you need shortest paths, you need BFS or Dijkstra regardless.

## Testing graph searches

A shortest-path result has properties you can check without knowing the answer in advance:

- The route starts at the start, ends at the goal, and every consecutive pair is joined by an edge.
- The route has exactly `dist` hops (or its lengths add up to `dist` km).
- No edge can be used to improve a distance: for every edge u–v, `dist(v) ≤ dist(u) + 1` (or + the edge's length). If one could, the result was not shortest.

Random graphs make good tests, especially small, sparse ones that are often disconnected. As a second opinion, run Dijkstra with every length set to 1: it must agree with BFS everywhere.

search-test.js

```ts
import { dijkstra, routeTo } from "./dijkstra.js";

function bfsDist(graph, start) {
  const dist = new Map([[start, 0]]);
  const queue = [start];
  for (let head = 0; head < queue.length; head++) {
    for (const [next] of graph.get(queue[head])) {
      if (!dist.has(next)) {
        dist.set(next, dist.get(queue[head]) + 1);
        queue.push(next);
      }
    }
  }
  return dist;
}

let seed = 42;
const random = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
let failures = 0;
let checks = 0;

for (let t = 0; t < 200; t++) {
  const n = 2 + Math.floor(random() * 12);
  const graph = new Map(Array.from({ length: n }, (_, i) => [i, []]));
  const edges = Math.floor(random() * 2 * n);
  for (let e = 0; e < edges; e++) {
    const a = Math.floor(random() * n);
    const b = Math.floor(random() * n);
    const km = Math.floor(random() * 20);
    graph.get(a).push([b, km]);
    graph.get(b).push([a, km]);
  }

  const { dist, parent } = dijkstra(graph, 0);
  for (const [v, d] of dist) {
    checks++;
    const route = routeTo(parent, v);
    let total = 0;
    for (let i = 1; i < route.length; i++) {
      const edge = graph.get(route[i - 1]).filter(([w]) => w === route[i]);
      if (edge.length === 0) failures++;
      else total += Math.min(...edge.map(([, km]) => km));
    }
    if (route[0] !== 0 || total !== d) failures++;
    for (const [w, km] of graph.get(v)) if (dist.get(w) > d + km) failures++;
  }

  const unit = new Map([...graph].map(([v, list]) => [v, list.map(([w]) => [w, 1])]));
  const hops = bfsDist(unit, 0);
  const viaDijkstra = dijkstra(unit, 0).dist;
  if ([...hops].some(([v, d]) => viaDijkstra.get(v) !== d) || hops.size !== viaDijkstra.size) failures++;
}
console.log(`${failures === 0 ? "PASS" : "FAIL"} ${checks} shortest routes checked on 200 random graphs, ${failures} failures`);

try {
  dijkstra(new Map([["A", [["B", -5]]], ["B", []]]), "A");
} catch (error) {
  console.log("PASS negative length rejected:", error.message);
}
```

Output of `node search-test.js` and of the browser terminal

```ts
PASS 900 shortest routes checked on 200 random graphs, 0 failures
PASS negative length rejected: road A-B has length -5
```

The random graphs include self-loops (a == b) and parallel roads between the same pair with different lengths, both of which real data contains and both of which break naive code. The route check takes the shortest of any parallel roads, because that is the one Dijkstra would have used.

## Graph search in production

- **Road maps are huge.** Nigeria's road network has millions of junctions. Plain Dijkstra on every request is too slow, so routing engines precompute shortcuts (contraction hierarchies) and use A* at query time. You will almost always call such an engine, or a service built on one, rather than write it yourself.
- **Weights change.** Traffic, closures and ferry timetables change the costs during the day. Cache routes with a short lifetime, and treat the result as an estimate.
- **Limit the search.** On social or payment graphs a BFS from a popular account can touch most of the database. Cap the depth ("friends of friends" is depth 2), cap the number of vertices visited, and time out, so one request cannot exhaust the server.
- **Graphs in databases.** Relational databases can search graphs with recursive queries (`WITH RECURSIVE` in PostgreSQL), which is often enough for org charts, category trees and referral chains. Graph databases specialise in multi-hop queries on large, highly connected data.
- **Recursion depth.** Recursive DFS is fine for trees of known small depth. For user data, which can form long chains, use an explicit stack.
- **Determinism.** Search results depend on neighbour order. When results are shown to people or compared in tests, sort neighbour lists or break ties explicitly, so the same input always gives the same route.

## Practice

TRY IT YOURSELF

### Next-day and two-day delivery zones

Marketing wants to advertise "next-day delivery" and "two-day delivery" from Lagos. Write `zones(graph, start, maxDays)` that runs BFS but never expands a hub at distance `maxDays`, and returns the hubs grouped by day. How much of the network does it look at for `maxDays = 2`?

**Show a solution**

zones.js

```ts
import { graphFrom, routes } from "./network.js";

function zones(graph, start, maxDays) {
  const dist = new Map([[start, 0]]);
  const queue = [start];
  let expanded = 0;
  for (let head = 0; head < queue.length; head++) {
    const hub = queue[head];
    if (dist.get(hub) === maxDays) continue;
    expanded++;
    for (const next of graph.get(hub)) {
      if (!dist.has(next)) {
        dist.set(next, dist.get(hub) + 1);
        queue.push(next);
      }
    }
  }
  const byDay = [];
  for (const [hub, d] of dist) (byDay[d] ??= []).push(hub);
  return { byDay, expanded };
}

const graph = graphFrom(routes);
const { byDay, expanded } = zones(graph, "Lagos", 2);
byDay.forEach((hubs, day) => console.log(`day ${day}: ${hubs.join(", ")}`));
console.log(`expanded ${expanded} of ${graph.size} hubs`);
```

Output of `node zones.js` and of the browser terminal

```ts
day 0: Lagos
day 1: Ibadan, Benin
day 2: Ilorin, Onitsha, Warri
expanded 3 of 17 hubs
```

Hubs at the limit are discovered (so they get a distance) but never expanded. Only the start and the day-1 hubs are expanded. This depth limit is how "people you may know" features stay cheap on social networks with hundreds of millions of accounts.

TRY IT YOURSELF

### Nearest pickup point for every street

A town grid has several parcel lockers (`L`) and buildings (`#`). For every free cell, compute the number of steps to the *nearest* locker. Running one BFS per cell would be O((R × C)²). Instead, start a single BFS with *all* lockers in the queue at distance 0 (a multi-source BFS), and print the distances as a map.

**Show a solution**

lockers.js

```ts
function nearestLocker(rows) {
  const height = rows.length;
  const width = rows[0].length;
  const dist = rows.map((row) => [...row].map(() => -1));
  const queue = [];
  for (let r = 0; r < height; r++) {
    for (let c = 0; c < width; c++) {
      if (rows[r][c] === "L") {
        dist[r][c] = 0;
        queue.push([r, c]);
      }
    }
  }
  for (let head = 0; head < queue.length; head++) {
    const [r, c] = queue[head];
    for (const [dr, dc] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
      const nr = r + dr;
      const nc = c + dc;
      if (nr < 0 || nr >= height || nc < 0 || nc >= width) continue;
      if (rows[nr][nc] === "#" || dist[nr][nc] !== -1) continue;
      dist[nr][nc] = dist[r][c] + 1;
      queue.push([nr, nc]);
    }
  }
  return dist.map((row, r) => row.map((d, c) => (rows[r][c] === "#" ? "#" : d === -1 ? "?" : String(d))).join("")).join("\n");
}

console.log(nearestLocker([
  "L....#...",
  ".##..#.#.",
  "....##.#L",
  ".#......#",
  "...#.L...",
]));
```

Output of `node lockers.js` and of the browser terminal

```ts
01234#432
1##45#4#1
2344##3#0
3#432123#
455#10123
```

All lockers start in the first layer, so the ripples spread from all of them at once and each cell is claimed by whichever ripple arrives first: the nearest locker. It is still one BFS, O(R × C). A cell that no ripple reaches would print `?`. The same trick finds the nearest hospital for every district, or how far every cell is from a fire.

TRY IT YOURSELF

### Cheapest delivery with tolls

Each road has a fuel cost and some have a toll, both in naira. Find the cheapest route from Lagos to Enugu using Dijkstra with cost = fuel + toll, and print the cost of each leg. Reuse `dijkstra` and `routeTo` by building a graph whose weights are the total cost.

**Show a solution**

tolls.js

```ts
import { dijkstra, routeTo } from "./dijkstra.js";
import { weightedGraph } from "./roads.js";

const legs = [
  ["Lagos", "Benin", 18000, 1500], ["Benin", "Onitsha", 8500, 0], ["Onitsha", "Enugu", 6500, 800],
  ["Lagos", "Ibadan", 7500, 1200], ["Ibadan", "Ilorin", 9500, 0], ["Ilorin", "Abuja", 28000, 0],
  ["Abuja", "Enugu", 23500, 0], ["Benin", "Asaba", 8000, 0], ["Asaba", "Enugu", 9500, 0],
];
const cost = new Map(legs.map(([a, b, fuel, toll]) => [`${a}|${b}`, fuel + toll]));
const graph = weightedGraph(legs.map(([a, b, fuel, toll]) => [a, b, fuel + toll]));

const { dist, parent } = dijkstra(graph, "Lagos");
const route = routeTo(parent, "Enugu");
for (let i = 1; i < route.length; i++) {
  const a = route[i - 1];
  const b = route[i];
  console.log(`${a} -> ${b}: ₦${cost.get(`${a}|${b}`) ?? cost.get(`${b}|${a}`)}`);
}
console.log(`total: ₦${dist.get("Enugu")}`);
```

Output of `node tolls.js` and of the browser terminal

```ts
Lagos -> Benin: ₦19500
Benin -> Onitsha: ₦8500
Onitsha -> Enugu: ₦7300
total: ₦35300
```

Dijkstra does not care what the weight means, only that it is non-negative and that costs add up along a route. The route through Onitsha pays a toll on its last leg, but its total is still cheaper than the toll-free leg through Asaba. Keeping money in whole naira (or kobo) keeps the sums exact.

## Summary

- BFS explores in layers with a queue, and the first time it reaches a vertex is by a route with the fewest edges. Mark vertices when they are added, keep parent links to rebuild the route, and use a head index instead of `shift`. O(V + E).
- DFS goes as deep as possible and backtracks. It reaches everything BFS reaches, but not by shortest routes. Recursive DFS is limited by the call stack; an explicit stack removes the limit.
- Grids are graphs whose neighbours you compute from row and column: mazes, flood fills and multi-source "nearest" questions are BFS on a grid.
- Connected components come from repeated searches over unvisited vertices. In an undirected component, more than V − 1 edges means a cycle. In a directed graph, an edge to a grey (in-progress) vertex is a cycle; report the vertices on it.
- Dijkstra replaces the queue with a priority queue by distance, finalises the closest unfinished vertex each time, and needs non-negative weights. O((V + E) log V) with a binary heap and lazy deletion.
- Test searches with properties: valid routes, distances that match route lengths, no edge that could improve a distance, and agreement between BFS and Dijkstra on unit weights.

Next: [Greedy algorithms](https://zudojs.oyinlola.site/learn/dsa-greedy) looks at the idea behind Dijkstra, always taking the choice that looks best right now, and shows where it gives the best answer (meeting rooms, some coin systems) and where it quietly fails (making change with the wrong notes).

## Test yourself

Five questions, picked at random from this lesson's question bank. Some ask you to choose an answer, some to predict what code prints, and some to write code and run it in the terminal. Get 4 of 5 right to pass. If you don't, read the explanations and try again: you get 5 different questions.
