/**
 * Zudo shared components — header, footer, global search.
 * Renders into <div id="zudo-nav"> and <div id="zudo-footer"> on every page.
 */
(function () {
  'use strict';

  var VERSION = '1.2.4';
  var GITHUB_URL = 'https://github.com/oyinlola-tech/zudo';
  var NPM_URL = 'https://www.npmjs.com/org/zudojs';
  var TWITTER_URL = 'https://x.com/zudojs';
  var SPONSOR_URL = 'https://github.com/sponsors/oyinlola-tech';

  /* ---------- icons ---------- */

  var ICON = {
    github: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/></svg>',
    npm: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M1.763 0C.786 0 0 .786 0 1.763v20.474C0 23.214.786 24 1.763 24h20.474c.977 0 1.763-.786 1.763-1.763V1.763C24 .786 23.214 0 22.237 0zM5.13 5.323l13.837.019v13.49h-3.464V8.393h-3.578v10.44H5.13zm1.434 14.107h3.578V9.671h3.578v9.759h3.578V5.323h-14.31z"/></svg>',
    x: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>',
    search: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="square" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/></svg>',
    menu: '<svg class="ic-open" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="square" aria-hidden="true"><path d="M3 6h18M3 12h18M3 18h18"/></svg><svg class="ic-close" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="square" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>',
    up: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="square" aria-hidden="true"><path d="M12 19V5M5 12l7-7 7 7"/></svg>',
    mark: '<svg class="zh-mark" viewBox="0 0 80 80" aria-hidden="true"><g fill="currentColor"><rect x="6" y="6" width="12" height="12"/><rect x="20" y="6" width="12" height="12"/><rect x="34" y="6" width="12" height="12"/><rect x="48" y="6" width="12" height="12"/><rect x="62" y="6" width="12" height="12"/><rect fill="#C0392B" x="48" y="20" width="12" height="12"/><rect fill="#C0392B" x="34" y="34" width="12" height="12"/><rect fill="#C0392B" x="20" y="48" width="12" height="12"/><rect x="6" y="62" width="12" height="12"/><rect x="20" y="62" width="12" height="12"/><rect x="34" y="62" width="12" height="12"/><rect x="48" y="62" width="12" height="12"/><rect x="62" y="62" width="12" height="12"/></g></svg>',
    word: '<svg class="zh-wordmark" viewBox="0 0 220 44" fill="none" aria-hidden="true"><g stroke="currentColor" stroke-width="12" stroke-linecap="square" stroke-linejoin="miter"><path d="M6 6H34L6 38H34"/><path d="M64 6V38H92V6"/><path d="M122 6H140L150 16V28L140 38H122Z"/><path d="M180 6H208V38H180Z"/></g></svg>',
    giant: '<svg class="zf-giant" viewBox="0 0 220 44" fill="none" aria-hidden="true" focusable="false"><g stroke="currentColor" stroke-width="12" stroke-linecap="square" stroke-linejoin="miter"><path d="M6 6H34M6 38H34"/><polygon fill="#C0392B" stroke="none" points="26,12 40,12 14,32 0,32"/><path d="M64 6V38H92V6"/><path d="M122 6H140L150 16V28L140 38H122Z"/><path d="M180 6H208V38H180Z"/></g></svg>',
  };

  /* ---------- navigation model ---------- */

  var NAV = [
    { key: 'learn', label: 'Learn', href: '/learn', match: ['/learn'] },
    { key: 'docs', label: 'Docs', href: '/docs/getting-started', match: ['/docs/getting-started', '/docs/contributing', '/docs/rules'] },
    { key: 'packages', label: 'Packages', href: '/docs/packages', match: ['/docs/packages'] },
    { key: 'architecture', label: 'Architecture', href: '/docs/architecture', match: ['/docs/architecture'] },
    { key: 'concepts', label: 'Concepts', href: '/docs/concepts', match: ['/docs/concepts'] },
    { key: 'roadmap', label: 'Roadmap', href: '/docs/roadmap', match: ['/docs/roadmap'] },
    { key: 'sponsors', label: 'Sponsors', href: '/sponsors', match: ['/sponsors'] },
  ];

  function activeKey() {
    var path = window.location.pathname.replace(/\.html$/, '').replace(/\/$/, '') || '/';
    for (var i = 0; i < NAV.length; i++) {
      for (var j = 0; j < NAV[i].match.length; j++) {
        if (path.indexOf(NAV[i].match[j]) === 0) return NAV[i].key;
      }
    }
    return path === '/' ? 'home' : '';
  }

  /* ---------- search index (clean URLs, mirrors vercel.json) ---------- */

  var SEARCH_INDEX = [
    /* learn-search:start (generated by scripts/site-learn.mjs) */
    { g: 'Learn', t: "Course: Programming thinking", p: '/learn/programming-thinking', e: "Think like a programmer before you write serious code: break problems down, design algorithms in pseudocode and flowcharts, reason with logic and a little mathematics, and solve problems step by step." },
    { g: 'Learn', t: "Course: JavaScript fundamentals", p: '/learn/javascript', e: "The JavaScript language from your first line: values and types, scope, operators, decisions and loops, functions, arrays and objects, classes, errors, modules and your first asynchronous code." },
    { g: 'Learn', t: "Course: Algorithms and data structures", p: '/learn/algorithms', e: "Measure code with Big O, build the classic data structures in JavaScript, learn the algorithms every engineer uses, and solve problems with named patterns instead of guesswork." },
    { g: 'Learn', t: "Course: Advanced JavaScript", p: '/learn/javascript-advanced', e: "How JavaScript really works: this and prototypes, the built-in objects, iterators, generators and symbols, functional techniques, the event loop and asynchronous code in depth, memory, error design and module systems." },
    { g: 'Learn', t: "Course: JavaScript in the browser and on the server", p: '/learn/javascript-platforms', e: "Use JavaScript where it runs: the DOM, events and browser APIs, networking from the browser, Node.js and its core modules, npm and the tooling around it, professional debugging, and Git." },
    { g: 'Learn', t: "Course: TypeScript", p: '/learn/typescript', e: "Add a type system to JavaScript: what TypeScript is and is not, everyday types and inference, unions and narrowing, interfaces, generics, classes, modules, tsconfig, and where types stop and runtime validation begins." },
    { g: 'Learn', t: "Course: Advanced TypeScript", p: '/learn/typescript-advanced', e: "The type system in depth: type operators, utility, mapped, conditional and template literal types, inference, variance and branded types, then type-safe events, CQRS and dependency injection, decorators, declaration files, packages, monorepos, type-level tests and compiler performance." },
    { g: 'Learn', t: "Course: Backend engineering", p: '/learn/backend', e: "How backends work, framework-free: HTTP in depth, typed Node.js, the BookStore API in TypeScript with PostgreSQL and authentication, layered API design, testing strategies, and the building blocks every backend needs: caches, queues and file storage." },
    { g: 'Learn', t: "Course: Database engineering", p: '/learn/database-engineering', e: "Relational databases in depth with PostgreSQL: SQL, modelling and normalisation, indexes and query plans, transactions, isolation and locks, operations, and typing database code." },
    { g: 'Learn', t: "Course: API engineering", p: '/learn/api-engineering', e: "Design APIs other people can depend on: REST resources and contracts, pagination and versioning, idempotency and safe retries, rate limiting, and contracts that evolve without breaking clients." },
    { g: 'Learn', t: "Course: Security", p: '/learn/security', e: "Protect users and systems: authentication, passwords, sessions and JWTs, OAuth with PKCE, browser attacks and defences, injection and server-side attacks, cryptography and secrets, and why types are not security." },
    { g: 'Learn', t: "Course: Software design and architecture", p: '/learn/software-architecture', e: "Give code a shape that survives growth: design principles, SOLID and design patterns solving real problems, layered and clean architecture, architecture styles, and a small framework you build yourself so no framework is magic." },
    { g: 'Learn', t: "Course: ZudoJS fundamentals", p: '/learn/zudo-fundamentals', e: "Enter ZudoJS knowing what it abstracts: its package architecture, the CLI, the anatomy of a project, the core, runtime and lifecycle, shared types and constants, dependency injection, configuration, errors, HTTP, middleware, schemas and validation." },
    { g: 'Learn', t: "Course: ZudoJS application development", p: '/learn/zudo-applications', e: "Build real applications: data architecture, transactions, storage and file uploads, cryptography, authentication, OAuth, permissions and the security layer, caching, and type-safe application design." },
    { g: 'Learn', t: "Course: ZudoJS advanced systems", p: '/learn/zudo-advanced', e: "Events, messages and CQRS, queues and schedulers, serialization, RPC, API operations and OpenAPI, then testing, logging, observability and documentation, and platform features: feature flags, tenancy, plugins and adapters." },
    { g: 'Learn', t: "Course: ZudoJS architecture", p: '/learn/zudo-architecture', e: "Build the same application as a monolith, a modular monolith and microservices, then build event-driven and full CQRS systems, and compare the trade-offs honestly." },
    { g: 'Learn', t: "Course: Distributed systems", p: '/learn/distributed-systems', e: "What changes when your system spans processes and machines: partial failure, consistency, contracts between services, retries and circuit breakers, and transactions that cross service boundaries." },
    { g: 'Learn', t: "Course: Production engineering", p: '/learn/production', e: "Take a ZudoJS application to production: the production checklist, a security review, performance diagnosis, deployment with Docker, and a CI/CD pipeline." },
    { g: 'Learn', t: "Course: Framework engineering", p: '/learn/framework-engineering', e: "Stop being only a consumer: read ZudoJS's source, create your own ZudoJS package, and build a complete plugin." },
    { g: 'Learn', t: "Course: Real-world projects and capstone", p: '/learn/capstone', e: "Real applications built end to end with ZudoJS: a REST API, an authentication platform, a payment system, a multi-tenant SaaS, a background processing system and a microservice platform, then the capstones." },
    { g: 'Learn', t: "Welcome to ZudoJS Academy (Programming thinking 1)", p: '/learn/welcome', e: "What ZudoJS Academy is, who it is for, its six tracks and 19 levels, the projects you build, how the pages work, and where you should start." },
    { g: 'Learn', t: "Your developer environment (Programming thinking 2)", p: '/learn/dev-environment', e: "Meet the tools a developer uses every day, the terminal, a code editor and the browser's devtools, and learn to move around your files by typing commands." },
    { g: 'Learn', t: "How programs run (Programming thinking 3)", p: '/learn/how-programs-run', e: "What happens between the code you type and the result on the screen, what JavaScript engines and runtimes are, and the difference between a syntax error and a runtime error." },
    { g: 'Learn', t: "How the web works (Programming thinking 4)", p: '/learn/how-the-web-works', e: "Follow a request from your browser to a server and back, and learn what clients, servers, IP addresses, DNS, ports, HTTP, HTTPS, APIs and databases are." },
    { g: 'Learn', t: "What programming is (Programming thinking 5)", p: '/learn/think-programming', e: "Learn what programs, instructions and algorithms are, see every program as input, processing and output, and solve a real problem with the problem-solving loop." },
    { g: 'Learn', t: "Breaking problems down (Programming thinking 6)", p: '/learn/think-decomposition', e: "Split a problem as big as \"build a bank\" into pieces small enough to solve, order them by dependency, and build a money transfer from small, tested steps." },
    { g: 'Learn', t: "Algorithms (Programming thinking 7)", p: '/learn/think-algorithms', e: "Learn what makes a method an algorithm, the three shapes every algorithm is built from, and the everyday algorithms for searching, counting, filtering, transforming and sorting." },
    { g: 'Learn', t: "Pseudocode and flowcharts (Programming thinking 8)", p: '/learn/think-pseudocode', e: "Write an algorithm as pseudocode and as a flowchart, trace it by hand, find its missing paths, and translate it line by line into working JavaScript." },
    { g: 'Learn', t: "Reasoning about programs (Programming thinking 9)", p: '/learn/think-reasoning', e: "Ask what you know, what you assume and what must stay true, build edge-case tables, and use invariants to show a program works for every input, not just a few." },
    { g: 'Learn', t: "Boolean logic (Programming thinking 10)", p: '/learn/logic-boolean', e: "Reduce program decisions to true and false, combine them with AND, OR, NOT and XOR, and let a loop build truth tables that check every case for you." },
    { g: 'Learn', t: "Conditional reasoning (Programming thinking 11)", p: '/learn/logic-conditions', e: "Turn written business rules into exact conditions, invert and simplify them safely with De Morgan's laws, and restructure them as guard clauses that explain every refusal." },
    { g: 'Learn', t: "Sets (Programming thinking 12)", p: '/learn/logic-sets', e: "Reason about groups of things with sets: remove duplicates, test membership, and combine permissions, tags and mailing lists with union, intersection, difference and subsets." },
    { g: 'Learn', t: "Mathematical reasoning (Programming thinking 13)", p: '/learn/logic-math', e: "Use expressions, functions, equations, ratios and percentages to compute discounts, VAT and interest, and keep money exact by counting in kobo instead of decimals." },
    { g: 'Learn', t: "Sequences (Programming thinking 14)", p: '/learn/logic-sequences', e: "Spot the pattern in a list of numbers, compute arithmetic and geometric sequences with loops and formulas, and see why compound interest and exponential growth surprise people." },
    { g: 'Learn', t: "Counting (Programming thinking 15)", p: '/learn/logic-counting', e: "Count things with loops and frequency tables, count possibilities with the multiplication principle, permutations and combinations, and see why trying every option quickly becomes impossible." },
    { g: 'Learn', t: "Problem workshop: beginner (Programming thinking 16)", p: '/learn/solve-beginner', e: "Solve ten everyday problems, from even or odd to a tax calculator, by reasoning about inputs, outputs and edge cases first, then coding and testing each one." },
    { g: 'Learn', t: "Problem workshop: intermediate (Programming thinking 17)", p: '/learn/solve-intermediate', e: "Solve eight problems on lists of real data, from duplicate payments to stock levels, reasoning about edge cases and the amount of work first, then coding and testing." },
    { g: 'Learn', t: "Why doesn't this work? (Programming thinking 18)", p: '/learn/solve-broken', e: "Diagnose broken algorithms that run without errors but give wrong answers, using trace tables, predictions and boundary tests, then fix each root cause." },
    { g: 'Learn', t: "Meet JavaScript (JavaScript fundamentals 1)", p: '/learn/js-intro', e: "Learn where JavaScript comes from, who decides how it changes, how to tell which features you can use, and the syntax rules every line of code follows." },
    { g: 'Learn', t: "Set up your computer (JavaScript fundamentals 2)", p: '/learn/setup', e: "Install Node.js, try JavaScript in the Node.js REPL, write and run your first program, and turn its folder into a project." },
    { g: 'Learn', t: "Values, variables and types (JavaScript fundamentals 3)", p: '/learn/js-values', e: "Store values in variables with const and let, meet the seven primitive types, and learn how JavaScript handles text, numbers, true and false, and \"no value\"." },
    { g: 'Learn', t: "Types in depth (JavaScript fundamentals 4)", p: '/learn/js-types-deep', e: "Map every JavaScript type, see why objects are shared while primitives are copied, and learn how equality and type coercion decide what comparisons return." },
    { g: 'Learn', t: "Operators (JavaScript fundamentals 5)", p: '/learn/js-operators', e: "Calculate, compare and combine values with every JavaScript operator, give missing values safe defaults with ?? and ?., and avoid the precedence traps." },
    { g: 'Learn', t: "Making decisions (JavaScript fundamentals 6)", p: '/learn/js-conditions', e: "Let your program choose what to do with if, else if and else, the ternary operator and switch, and keep decisions readable with guard clauses." },
    { g: 'Learn', t: "Loops (JavaScript fundamentals 7)", p: '/learn/js-loops', e: "Repeat work with for, while, do...while, for...of and for...in, control a loop with break and continue, and build a number guessing game." },
    { g: 'Learn', t: "Functions (JavaScript fundamentals 8)", p: '/learn/js-functions', e: "Package logic into reusable functions, pass values in and get results out, pass functions to other functions, and meet scope, closures and recursion." },
    { g: 'Learn', t: "Arrays (JavaScript fundamentals 9)", p: '/learn/js-arrays', e: "Keep ordered lists in arrays, add, remove and search items, transform them with map, filter, reduce and sort, and build a small student management system." },
    { g: 'Learn', t: "Objects and JSON (JavaScript fundamentals 10)", p: '/learn/js-data', e: "Group related values into objects, read and change their properties, copy and take them apart safely, and turn them into JSON, the text format every API speaks." },
    { g: 'Learn', t: "Objects in depth (JavaScript fundamentals 11)", p: '/learn/js-objects-deep', e: "Lock an object's shape, validate writes with setters, hide fields, and copy and compare objects safely, by building a bank account that cannot be broken." },
    { g: 'Learn', t: "Modern JavaScript (JavaScript fundamentals 12)", p: '/learn/js-modern', e: "Take a piece of old-style JavaScript and rewrite it step by step with the modern syntax a backend uses every day, fixing real bugs on the way." },
    { g: 'Learn', t: "Scope and how code runs (JavaScript fundamentals 13)", p: '/learn/js-scope', e: "Learn where a name can be used, why some names exist before their line runs, and how the call stack and the heap work, so you can read a stack trace." },
    { g: 'Learn', t: "Closures in depth (JavaScript fundamentals 14)", p: '/learn/js-closures', e: "See how closures really work through lexical environments, then use them for private state, function factories, memoization and cleanup, without leaking memory." },
    { g: 'Learn', t: "Recursion (JavaScript fundamentals 15)", p: '/learn/js-recursion', e: "Walk folders, comment threads and org charts of any depth with functions that call themselves, then make them safe against deep and circular data." },
    { g: 'Learn', t: "this, prototypes and classes (JavaScript fundamentals 16)", p: '/learn/js-classes', e: "See what this means in a method and why it gets lost, how objects share methods through prototypes, and write classes with private fields and inheritance." },
    { g: 'Learn', t: "Handling errors (JavaScript fundamentals 17)", p: '/learn/js-errors', e: "Tell syntax, runtime and logic errors apart, throw and catch errors, write your own error classes, and turn every error into a safe answer from an API." },
    { g: 'Learn', t: "Asynchronous JavaScript (JavaScript fundamentals 18)", p: '/learn/js-async', e: "See why a backend waits without blocking, use callbacks, promises and async/await, handle errors in async code, and run work in sequence or in parallel." },
    { g: 'Learn', t: "Modules (JavaScript fundamentals 19)", p: '/learn/js-modules', e: "Split a program into files with ES modules, understand the older CommonJS require, choose between named and default exports, and avoid circular dependencies." },
    { g: 'Learn', t: "Big O and complexity (Algorithms and data structures 1)", p: '/learn/dsa-complexity', e: "Measure how code grows with its input: count steps, state time and space complexity in Big O, Ω and Θ, spot hidden loops and see why push is cheap." },
    { g: 'Learn', t: "Arrays and strings under the hood (Algorithms and data structures 2)", p: '/learn/dsa-arrays-strings', e: "Learn what array and string operations really cost, from indexing to shift and string building, then solve reverse, palindrome, anagram and rotate with tests." },
    { g: 'Learn', t: "Hash maps and sets (Algorithms and data structures 3)", p: '/learn/dsa-hash-maps', e: "Build a hash table from scratch with hashing, buckets, collisions and resizing, then use Map and Set for lookups, counting, dedupe and two-sum." },
    { g: 'Learn', t: "Stacks and queues (Algorithms and data structures 4)", p: '/learn/dsa-stacks-queues', e: "Build stacks, queues, a ring buffer and a deque in JavaScript, then use them for undo and redo, bracket checking and a retrying job queue." },
    { g: 'Learn', t: "Linked lists and the LRU cache (Algorithms and data structures 5)", p: '/learn/dsa-linked-lists', e: "Build singly and doubly linked lists in JavaScript, reverse them, detect cycles, and use one to build an O(1) LRU cache for product lookups." },
    { g: 'Learn', t: "Trees and binary search trees (Algorithms and data structures 6)", p: '/learn/dsa-trees', e: "Turn flat category rows into a tree, walk it four ways, then build, test and balance a binary search tree of orders, with the cost of every operation." },
    { g: 'Learn', t: "Heaps and priority queues (Algorithms and data structures 7)", p: '/learn/dsa-heaps', e: "Build a binary heap on a plain array, use it as a priority job queue, then sort with it, find the top-k products and merge sorted order lists." },
    { g: 'Learn', t: "Graphs and topological sort (Algorithms and data structures 8)", p: '/learn/dsa-graphs', e: "Model packages, roads between cities and followers as graphs, store them as adjacency lists, and compute a safe install order with topological sort." },
    { g: 'Learn', t: "Tries and autocomplete (Algorithms and data structures 9)", p: '/learn/dsa-tries', e: "Build a prefix tree for product search: autocomplete as the user types, count matches per prefix, delete safely, and weigh the memory it costs." },
    { g: 'Learn', t: "Linear and binary search (Algorithms and data structures 10)", p: '/learn/dsa-searching', e: "Find an order among a million by scanning and by halving, write binary search three ways, catch its classic bugs, and use lower and upper bounds for ranges." },
    { g: 'Learn', t: "Sorting algorithms (Algorithms and data structures 11)", p: '/learn/dsa-sorting', e: "Build bubble, selection, insertion, merge and quick sort, count their comparisons, then sort real orders by several keys with a stable, tested sort." },
    { g: 'Learn', t: "Divide and conquer (Algorithms and data structures 12)", p: '/learn/dsa-divide-conquer', e: "Split problems into halves, solve the halves and combine: find delivery-time percentiles with quickselect, compute powers fast, and predict costs with recursion trees." },
    { g: 'Learn', t: "Graph search (Algorithms and data structures 13)", p: '/learn/dsa-graph-search', e: "Route parcels between delivery hubs with breadth-first search, walk a warehouse maze, find cut-off areas and circular transfers with depth-first search, and meet Dijkstra." },
    { g: 'Learn', t: "Greedy algorithms (Algorithms and data structures 14)", p: '/learn/dsa-greedy', e: "Give change in naira notes, book meeting rooms and load a van by always taking the best-looking choice, then prove when that works and catch it failing with tests." },
    { g: 'Learn', t: "Backtracking (Algorithms and data structures 15)", p: '/learn/dsa-backtracking', e: "Search every valid discount combination, gift bundle and delivery route by choosing, exploring and undoing, then prune dead branches to solve puzzles like N-queens and sudoku fast." },
    { g: 'Learn', t: "Dynamic programming (Algorithms and data structures 16)", p: '/learn/dsa-dynamic-programming', e: "Turn exponential searches into fast tables: pack a delivery van, make change in naira, and diff two versions of a text, with memoization, tabulation and space savings." },
    { g: 'Learn', t: "The frequency counter pattern (Algorithms and data structures 17)", p: '/learn/pattern-frequency', e: "Replace nested loops with one counting pass: check anagram usernames, reconcile lists, find the first unmatched entry and the majority, in O(n)." },
    { g: 'Learn', t: "The two pointers pattern (Algorithms and data structures 18)", p: '/learn/pattern-two-pointers', e: "Walk sorted data from both ends or at two speeds: pair refunds, dedupe order ids in place, size a tank, and find loops and midpoints with O(1) extra space." },
    { g: 'Learn', t: "Sliding window and prefix sums (Algorithms and data structures 19)", p: '/learn/pattern-sliding-window', e: "Find the best 7 days of revenue, the longest on-time streak and any range total without re-adding numbers, using sliding windows and prefix sums." },
    { g: 'Learn', t: "Binary search on the answer (Algorithms and data structures 20)", p: '/learn/pattern-binary-search', e: "Use binary search beyond sorted arrays: find the smallest truck capacity, the first failing build and items in rotated lists by halving a range of answers." },
    { g: 'Learn', t: "Pattern practice (Algorithms and data structures 21)", p: '/learn/pattern-practice', e: "Solve eleven unlabelled problems by first naming the pattern and why, then coding, testing and analysing, plus two interview walkthroughs." },
    { g: 'Learn', t: "this in depth (Advanced JavaScript 1)", p: '/learn/js-this', e: "Predict this in every kind of call, fix a lost this with call, apply, bind and arrow functions, and write your own bind and bindAll helpers." },
    { g: 'Learn', t: "Prototypes in depth (Advanced JavaScript 2)", p: '/learn/js-prototypes', e: "Follow the prototype chain step by step, rewrite new, instanceof and extends yourself, see what a class becomes, and block prototype pollution." },
    { g: 'Learn', t: "Inheritance and composition (Advanced JavaScript 3)", p: '/learn/js-composition', e: "See why subclasses break when their parent changes, then build behaviour from small parts with wrappers, delegation, mixins and functions, and use private fields well." },
    { g: 'Learn', t: "Strings in depth (Advanced JavaScript 4)", p: '/learn/js-strings', e: "Measure, cut, normalise, search, sort and format real product names with accents and emoji, using code points, grapheme clusters, Intl.Segmenter and Intl.Collator." },
    { g: 'Learn', t: "Numbers in depth (Advanced JavaScript 5)", p: '/learn/js-numbers', e: "Learn how IEEE-754 doubles store numbers, where precision ends, how to round, parse and format naira amounts exactly, and when to reach for BigInt." },
    { g: 'Learn', t: "Collections in depth (Advanced JavaScript 6)", p: '/learn/js-collections', e: "Choose between Map, Set, WeakMap, WeakSet and WeakRef by how they compare keys, keep order and hold memory, and build a bounded cache and object-keyed memoisation." },
    { g: 'Learn', t: "Dates and time zones (Advanced JavaScript 7)", p: '/learn/js-dates', e: "Understand what a Date really stores, parse and format instants safely across Africa/Lagos and UTC, do calendar arithmetic, and store dates correctly in APIs." },
    { g: 'Learn', t: "Regular expressions (Advanced JavaScript 8)", p: '/learn/js-regexp', e: "Write regular expressions that validate phone numbers and order codes, parse log lines with named groups, rewrite text with replacer functions, and avoid patterns that freeze a server." },
    { g: 'Learn', t: "Iterables and iterators (Advanced JavaScript 9)", p: '/learn/js-iterators', e: "Learn the protocol behind for...of, spread and destructuring, then write your own iterables: a number range and an API paginator that fetches pages lazily." },
    { g: 'Learn', t: "Generators (Advanced JavaScript 10)", p: '/learn/js-generators', e: "Write iterators as ordinary loops with function* and yield, then stream order lines lazily from a paged API into a CSV export, with cleanup that always runs." },
    { g: 'Learn', t: "Symbols (Advanced JavaScript 11)", p: '/learn/js-symbols', e: "Use symbols as keys that never clash, plug your objects into the language with well-known symbols, and build a Money type that refuses to add naira to dollars." },
    { g: 'Learn', t: "Functional JavaScript (Advanced JavaScript 12)", p: '/learn/js-functional', e: "Turn a tangled checkout function into a pipeline of small pure steps, with immutable updates, composition, currying and partial application, and test each step." },
    { g: 'Learn', t: "Promises in depth (Advanced JavaScript 13)", p: '/learn/js-promises', e: "See exactly what a promise guarantees, how chains pass values and errors along, how thenables work, and how to turn a callback SDK into promises safely." },
    { g: 'Learn', t: "Combining promises (Advanced JavaScript 14)", p: '/learn/js-promise-combinators', e: "Run independent work in parallel with Promise.all, allSettled, race and any, put a time limit on a slow provider, and choose sequential, parallel or batched." },
    { g: 'Learn', t: "The event loop (Advanced JavaScript 15)", p: '/learn/js-event-loop', e: "Build an exact model of the call stack, task queue and microtask queue, solve ordering puzzles with it, and keep long jobs from starving timers and requests." },
    { g: 'Learn', t: "Concurrency and cancellation (Advanced JavaScript 16)", p: '/learn/js-concurrency', e: "Limit how many jobs run at once with a pool, cancel unneeded work with AbortController, and find and fix the race conditions of concurrent async code." },
    { g: 'Learn', t: "How JavaScript runs (Advanced JavaScript 17)", p: '/learn/js-execution', e: "Follow your code through the engine, from text to tokens, syntax tree, bytecode and machine code, and read sync and async stack traces with confidence." },
    { g: 'Learn', t: "Memory and garbage collection (Advanced JavaScript 18)", p: '/learn/js-memory', e: "Learn how the garbage collector decides what to free, cause and fix the classic leaks, and measure memory with process.memoryUsage and heap snapshots." },
    { g: 'Learn', t: "Designing error handling (Advanced JavaScript 19)", p: '/learn/js-error-design', e: "Decide which layer handles each error, chain causes, collect failures with AggregateError, and build a payment flow that never loses an error." },
    { g: 'Learn', t: "Module systems in depth (Advanced JavaScript 20)", p: '/learn/js-module-systems', e: "See how ES modules and CommonJS load and interoperate in Node.js 24, resolve packages via exports, load plugins with import(), and untangle circular imports." },
    { g: 'Learn', t: "What Node.js is (JavaScript in the browser and on the server 1)", p: '/learn/node-runtime', e: "Learn what Node.js adds to JavaScript, where its event loop fits, and how a program talks to the computer through arguments, exit codes and environment variables." },
    { g: 'Learn', t: "Files, paths and your computer (JavaScript in the browser and on the server 2)", p: '/learn/node-apis', e: "Build safe file paths, read and write files, handle missing files, make random ids and hashes, and announce events, then save a task list to a JSON file." },
    { g: 'Learn', t: "Streams and buffers (JavaScript in the browser and on the server 3)", p: '/learn/node-streams', e: "Learn what bytes and buffers are, then process files far bigger than memory piece by piece with readable, writable and transform streams, pipeline and readline." },
    { g: 'Learn', t: "Events, processes and workers (JavaScript in the browser and on the server 4)", p: '/learn/node-events-processes', e: "Coordinate a Node.js program with EventEmitter, run other programs as child processes, move heavy work to worker threads, and shut down cleanly on SIGTERM." },
    { g: 'Learn', t: "Cryptography with node:crypto (JavaScript in the browser and on the server 5)", p: '/learn/node-crypto', e: "Use node:crypto correctly: unguessable tokens, hashes and HMAC webhook signatures, timing-safe comparison, scrypt password hashing and AES-256-GCM encryption." },
    { g: 'Learn', t: "npm and packages (JavaScript in the browser and on the server 6)", p: '/learn/npm-packages', e: "Install, update and remove packages with npm, read package.json and the lockfile, use version ranges and scripts, and keep the packages you install safe." },
    { g: 'Learn', t: "The npm ecosystem in depth (JavaScript in the browser and on the server 7)", p: '/learn/npm-ecosystem', e: "Go beyond npm install: exact semver rules, the dependency tree and lockfile, peer dependencies, lifecycle scripts, publishing and supply-chain defence." },
    { g: 'Learn', t: "An HTTP server with no framework (JavaScript in the browser and on the server 8)", p: '/learn/node-http', e: "Build a web server with only node:http: read the method, path, query, headers and body of a request, route by hand and answer JSON with the right status." },
    { g: 'Learn', t: "Build a plain Node.js Task API (JavaScript in the browser and on the server 9)", p: '/learn/node-task-api', e: "Build a complete Task API with no framework: modules, middleware, central error handling, an API key and checked configuration, then see what hurts as it grows." },
    { g: 'Learn', t: "The DOM (JavaScript in the browser and on the server 10)", p: '/learn/browser-dom', e: "Read and change a web page from JavaScript: find, create, update and remove elements safely, avoid innerHTML XSS, and build a task list UI rendered from data." },
    { g: 'Learn', t: "Events (JavaScript in the browser and on the server 11)", p: '/learn/browser-events', e: "Make a shopping cart respond to clicks, typing and forms with listeners, bubbling and capturing, preventDefault, delegation, custom events and a debounce." },
    { g: 'Learn', t: "Browser APIs (JavaScript in the browser and on the server 12)", p: '/learn/browser-apis', e: "Use the browser's tools with their failure modes: fetch, localStorage, URL and URLSearchParams, the History API, timers, requestAnimationFrame and Web Workers." },
    { g: 'Learn', t: "Networking from JavaScript (JavaScript in the browser and on the server 13)", p: '/learn/browser-networking', e: "Connect a browser page to your Node.js Task API: the request lifecycle, headers and JSON, HttpOnly session cookies, the same-origin policy, CORS and preflight, and cancelling stale requests." },
    { g: 'Learn', t: "Real-time and background work (JavaScript in the browser and on the server 14)", p: '/learn/browser-realtime', e: "Push live updates to a page with Server-Sent Events and WebSockets, each with a Node.js server, and move heavy work off the page with Web Workers and message passing." },
    { g: 'Learn', t: "Git and GitHub (JavaScript in the browser and on the server 15)", p: '/learn/git', e: "Track every change to your code with Git, work on branches, merge them and resolve a real conflict, keep node_modules and secrets out of your repository, and share your work through GitHub with remotes and pull requests." },
    { g: 'Learn', t: "Professional Git (JavaScript in the browser and on the server 16)", p: '/learn/git-collaboration', e: "Work like a professional team: issues, pull requests, code review, merge versus rebase, conflicts during a rebase, tags, releases, changelogs and open-source contributions." },
    { g: 'Learn', t: "JavaScript tooling (JavaScript in the browser and on the server 17)", p: '/learn/js-tooling', e: "Learn why each JavaScript tool exists, then run Prettier and ESLint for real, see what a bundler does, map a minified stack trace back to source, and validate environment configuration." },
    { g: 'Learn', t: "The debugging method (JavaScript in the browser and on the server 18)", p: '/learn/debug-method', e: "Find bugs with a repeatable method (observe, reproduce, isolate, hypothesize, test, fix, verify), read stack traces, log well and shrink a bug to a minimal repro." },
    { g: 'Learn', t: "Debugging tools (JavaScript in the browser and on the server 19)", p: '/learn/debug-tools', e: "Pause a running program with breakpoints, step through it, watch values, inspect objects, debug Node.js and browser code, read network traffic and map compiled code back with source maps." },
    { g: 'Learn', t: "Debugging practice (JavaScript in the browser and on the server 20)", p: '/learn/debug-practice', e: "Find a regression with binary search and git bisect run, dig to root causes with the five whys, and work through five complete bug hunts from report to regression test." },
    { g: 'Learn', t: "Why TypeScript exists (TypeScript 1)", p: '/learn/ts-setup', e: "See a bug that JavaScript runs without complaint, install TypeScript, write a tsconfig.json, and learn the three ways to run TypeScript on Node.js 24." },
    { g: 'Learn', t: "What the TypeScript compiler does (TypeScript 2)", p: '/learn/ts-compiler', e: "Follow a TypeScript file through tsc: checking, type erasure, transpiling to older JavaScript, emitted files, watch mode and Node's type stripping." },
    { g: 'Learn', t: "Basic types (TypeScript 3)", p: '/learn/ts-types', e: "Type strings, numbers, booleans, arrays, tuples and objects, handle null and undefined under strict mode, and meet any, unknown, void and never." },
    { g: 'Learn', t: "Type inference in depth (TypeScript 4)", p: '/learn/ts-inference', e: "See how TypeScript works out the types you never wrote (literals, widening, contextual typing, inferred returns) and decide where an annotation pays off." },
    { g: 'Learn', t: "Typing functions (TypeScript 5)", p: '/learn/ts-functions', e: "Type parameters and return values, use optional, default and rest parameters, write function types for callbacks, type async functions, and meet overloads." },
    { g: 'Learn', t: "Interfaces, unions and literal types (TypeScript 6)", p: '/learn/ts-objects', e: "Name object shapes, mark properties optional or readonly, extend and combine them, and model data with several forms using unions and literal types." },
    { g: 'Learn', t: "Union types in depth (TypeScript 7)", p: '/learn/ts-unions', e: "Model real states with discriminated unions, return typed results instead of throwing, combine shapes with intersections, and avoid common union mistakes." },
    { g: 'Learn', t: "Type aliases and interfaces (TypeScript 8)", p: '/learn/ts-aliases-interfaces', e: "Name your domain types once, extend them safely, use declaration merging and recursive types, and learn the real differences between type and interface." },
    { g: 'Learn', t: "Special types: any, unknown, never and friends (TypeScript 9)", p: '/learn/ts-special-types', e: "Learn what any, unknown, never, void, object, {} and Object really mean, watch one any spread, and use unknown at your program's boundaries." },
    { g: 'Learn', t: "Narrowing (TypeScript 10)", p: '/learn/ts-narrowing', e: "Turn wide unions and unknown into precise types with typeof, equality, in, instanceof, discriminants, type guards and assertion functions, and avoid the traps." },
    { g: 'Learn', t: "Type assertions (TypeScript 11)", p: '/learn/ts-assertions', e: "Learn what as, angle brackets, as unknown as and the non-null ! really do, why none of them check or convert anything, and which safer tool to use instead." },
    { g: 'Learn', t: "Enums and their alternatives (TypeScript 12)", p: '/learn/ts-enums', e: "Write numeric, string and const enums, read the JavaScript tsc emits for each, avoid their pitfalls, and replace them with unions and as const objects." },
    { g: 'Learn', t: "Tuples (TypeScript 13)", p: '/learn/ts-tuples', e: "Type fixed-shape arrays with tuples: optional, rest and named elements, readonly tuples and tuple inference, and return tuples the way useState does." },
    { g: 'Learn', t: "Generics (TypeScript 14)", p: '/learn/ts-generics', e: "Write functions, interfaces and classes that work for many types without losing safety, constrain them with extends and keyof, and give them defaults." },
    { g: 'Learn', t: "Designing generic APIs (TypeScript 15)", p: '/learn/ts-generic-design', e: "Design generic APIs that are easy to call and hard to misuse, and build Repository, Result, Page, ApiResponse, Cache and a typed event emitter." },
    { g: 'Learn', t: "Advanced and utility types (TypeScript 16)", p: '/learn/ts-advanced', e: "Build new types from existing ones with keyof, typeof, indexed access, mapped, conditional and template literal types, and use the built-in utility types (Partial, Pick, Omit, Record, ReturnType, Awaited and more) to keep one source of truth." },
    { g: 'Learn', t: "Classes in TypeScript (TypeScript 17)", p: '/learn/ts-classes', e: "Declare typed class properties, use parameter properties and access modifiers, compare private with #private, write abstract classes and classes that implement interfaces, and wire classes together with constructor injection." },
    { g: 'Learn', t: "Modules in TypeScript (TypeScript 18)", p: '/learn/ts-modules', e: "Split a TypeScript project into files, import types with import type, see why verbatimModuleSyntax exists, write .js in import paths, and understand how NodeNext resolution, \"type\" - \"module\" and the \"exports\" field fit together." },
    { g: 'Learn', t: "tsconfig in depth (TypeScript 19)", p: '/learn/ts-tsconfig', e: "Learn what every important tsconfig.json option changes, from target, lib and module to each strict flag and verbatimModuleSyntax, with a real tsc run for each." },
    { g: 'Learn', t: "TypeScript and JavaScript together (TypeScript 20)", p: '/learn/ts-runtime', e: "See exactly what TypeScript becomes when it runs, why types cannot check outside data, and how to close that gap by hand with type guards, assertion functions and a validator that returns a Result." },
    { g: 'Learn', t: "Runtime validation (TypeScript 21)", p: '/learn/ts-validation', e: "See why a type annotation on parsed JSON checks nothing, then validate data at runtime by hand, with a schema you build, with Zod, Valibot and JSON Schema, and infer types from schemas." },
    { g: 'Learn', t: "Typed error handling (TypeScript 22)", p: '/learn/ts-errors', e: "Catch errors as unknown, write error classes with a name, a cause and a literal code, return typed results, and handle async failures in a payments service." },
    { g: 'Learn', t: "Async TypeScript (TypeScript 23)", p: '/learn/ts-async', e: "Type promises and async functions precisely, keep Promise.all tuples intact, narrow allSettled results, use Awaited, and page through an API with typed async generators." },
    { g: 'Learn', t: "Type operators (Advanced TypeScript 1)", p: '/learn/ts-type-operators', e: "Derive types from values and from other types with keyof, typeof and indexed access, learn their edge cases, and build an order workflow from one table." },
    { g: 'Learn', t: "Utility types (Advanced TypeScript 2)", p: '/learn/ts-utility-types', e: "Use and rebuild TypeScript's utility types, from Partial, Pick and Omit to Exclude, ReturnType, InstanceType, Awaited and ThisType, and learn where each one bites." },
    { g: 'Learn', t: "Mapped types (Advanced TypeScript 3)", p: '/learn/ts-mapped-types', e: "Loop over keys at the type level: change modifiers, transform and remap keys with as, filter them, recurse into nested objects, and build a type-safe configuration system." },
    { g: 'Learn', t: "Conditional types (Advanced TypeScript 4)", p: '/learn/ts-conditional-types', e: "Write types that choose a result from their input with extends, infer and recursion, control distribution over unions, and build a retrying payments client." },
    { g: 'Learn', t: "Template literal types (Advanced TypeScript 5)", p: '/learn/ts-template-literals', e: "Build and take apart string types with template literal types, Uppercase and infer, then type routes, permissions and a compile-time safe event name system." },
    { g: 'Learn', t: "Advanced inference (Advanced TypeScript 6)", p: '/learn/ts-inference-deep', e: "Learn how TypeScript infers type arguments, contextual types and return types, use const type parameters, and choose between satisfies, as and as const on a route table." },
    { g: 'Learn', t: "Advanced functions (Advanced TypeScript 7)", p: '/learn/ts-advanced-functions', e: "Type overloads, call and construct signatures, this parameters, callable objects and variadic tuples, learn which callbacks are compatible and why, and build a type-safe command router." },
    { g: 'Learn', t: "Object-oriented TypeScript (Advanced TypeScript 8)", p: '/learn/ts-oop', e: "Use encapsulation, abstraction, inheritance, polymorphism, composition and dependency inversion in TypeScript, then compare object-oriented and functional designs honestly." },
    { g: 'Learn', t: "Functional TypeScript (Advanced TypeScript 9)", p: '/learn/ts-functional', e: "Make signatures tell the truth with readonly data, typed composition, Option, Result and algebraic data types, then build a typed pricing and checkout core." },
    { g: 'Learn', t: "The type system in depth (Advanced TypeScript 10)", p: '/learn/ts-type-system', e: "Learn when one type fits another: structural typing, excess property checks, variance with in and out, computed types, and when a clever type costs too much." },
    { g: 'Learn', t: "Branded types (Advanced TypeScript 11)", p: '/learn/ts-branded-types', e: "Stop swapped ids and naira-for-kobo bugs at compile time with branded types, validating smart constructors, money units and the ids in @zudojs/constants." },
    { g: 'Learn', t: "Type-safe domain modelling (Advanced TypeScript 12)", p: '/learn/ts-domain-modeling', e: "Model a shop's users, roles, products, orders, payments, events and ledger so illegal states cannot be written: no double payment, no refund before capture." },
    { g: 'Learn', t: "A type-safe event system (Advanced TypeScript 13)", p: '/learn/ts-typed-events', e: "Build an event bus where emit(\"order.placed\", payload) only accepts the right payload: typed listeners, unsubscribe, wildcards and their limits." },
    { g: 'Learn', t: "Type-safe CQRS (Advanced TypeScript 14)", p: '/learn/ts-typed-cqrs', e: "Build a command bus and a query bus whose requests, handlers and results are checked from one spec, so a missing handler or a wrong result will not compile." },
    { g: 'Learn', t: "A type-safe dependency injection container (Advanced TypeScript 15)", p: '/learn/ts-typed-di', e: "Build a DI container with typed tokens, factories and singleton, scoped and transient lifetimes, and learn exactly which wiring errors types cannot catch." },
    { g: 'Learn', t: "Decorators (Advanced TypeScript 16)", p: '/learn/ts-decorators', e: "Write TC39 standard decorators for classes, methods, fields and accessors, see the JavaScript tsc really emits, and compare them with legacy experimentalDecorators." },
    { g: 'Learn', t: "Declaration files (Advanced TypeScript 17)", p: '/learn/ts-declarations', e: "Type an untyped JavaScript naira formatter with a .d.ts file, declare modules and globals, augment existing interfaces, install @types and generate declarations." },
    { g: 'Learn', t: "Publishing TypeScript packages (Advanced TypeScript 18)", p: '/learn/ts-publishing', e: "Build a TypeScript library into JavaScript plus declarations, write package.json exports and files, check the tarball like a user, handle ESM and CommonJS, and version types." },
    { g: 'Learn', t: "TypeScript monorepos (Advanced TypeScript 19)", p: '/learn/ts-monorepos', e: "Split a shop backend into core, logger, database, auth and http packages in one repository, link them with workspaces, build them with project references, and enforce dependency direction." },
    { g: 'Learn', t: "Testing TypeScript (Advanced TypeScript 20)", p: '/learn/ts-testing', e: "Test TypeScript code with Vitest, including generics, error paths and typed mocks, then test the types themselves with expectTypeOf, @ts-expect-error and vitest --typecheck." },
    { g: 'Learn', t: "Debugging TypeScript (Advanced TypeScript 21)", p: '/learn/ts-debugging', e: "Read long type errors from the bottom up, make the compiler show you types, fix generic inference, trace module resolution and file inclusion, and tell type bugs from runtime bugs." },
    { g: 'Learn', t: "Compiler performance (Advanced TypeScript 22)", p: '/learn/ts-performance', e: "Measure what tsc spends its work on with --extendedDiagnostics, then keep a large project fast with skipLibCheck, incremental builds, project references, bounded types and cheaper declarations." },
    { g: 'Learn', t: "HTTP in depth (Backend engineering 1)", p: '/learn/http-deep', e: "See the exact bytes of an HTTP request and response, then learn the headers, content types, cookies, methods and status codes every backend relies on." },
    { g: 'Learn', t: "Designing a REST API (Backend engineering 2)", p: '/learn/rest-design', e: "Turn the Task API into a well-designed REST API: resources and URLs, a written contract, filtering, sorting, offset and cursor pagination, versioning and one consistent error format." },
    { g: 'Learn', t: "How databases work (Backend engineering 3)", p: '/learn/databases', e: "Why a backend keeps its data in a database, how relational databases organise it into tables and relationships, and what keys, constraints, indexes, transactions and migrations do, with real PostgreSQL running inside Node.js." },
    { g: 'Learn', t: "SQL with PostgreSQL (Backend engineering 4)", p: '/learn/sql-basics', e: "Install PostgreSQL with an installer or with Docker, talk to it with psql, and learn the SQL every backend uses: create, insert, select, update and delete, with filters, sorting and paging, and parameterized queries that stop SQL injection." },
    { g: 'Learn', t: "Joins, grouping and transactions (Backend engineering 5)", p: '/learn/sql-advanced', e: "Combine tables with joins, summarise data with group by and aggregates, filter groups with having, nest queries, control transactions yourself, measure queries with explain analyze, and connect Node.js to a real PostgreSQL server." },
    { g: 'Learn', t: "Testing fundamentals (Backend engineering 6)", p: '/learn/testing-basics', e: "Why automated tests matter, the difference between unit, integration and end-to-end tests, and how to write them with node:assert and Node's built-in test runner, including mocks, spies, isolated tests and a fresh test database. Then the same tests in Vitest." },
    { g: 'Learn', t: "TypeScript on Node.js (Backend engineering 7)", p: '/learn/ts-node', e: "Type Node.js with @types/node: typed env vars, files, HTTP, buffers, streams, events, child processes and signals, so the compiler catches server bugs early." },
    { g: 'Learn', t: "\"BookStore API: HTTP and routing\" (Backend engineering 8)", p: '/learn/bookstore-http', e: "Start a TypeScript backend with no framework at all. Set up the folder, read configuration from the environment, write a small typed router, JSON helpers and error responses, and serve books and authors over HTTP." },
    { g: 'Learn', t: "\"BookStore API: validation and PostgreSQL\" (Backend engineering 9)", p: '/learn/bookstore-data', e: "Check every request body by hand with type guards, move the BookStore data into PostgreSQL with PGlite, write repositories with parameterized SQL, and map typed errors to 400, 404 and 409." },
    { g: 'Learn', t: "\"BookStore API: authentication and tests\" (Backend engineering 10)", p: '/learn/bookstore-auth', e: "Add users to the BookStore. Hash passwords with scrypt, issue signed log-in tokens with a secret from the environment, protect the order routes, test it all with node:test, and then look honestly at what this hand-built backend now gets wrong." },
    { g: 'Learn', t: "Type-safe API layers (Backend engineering 11)", p: '/learn/ts-api-layers', e: "Refactor the BookStore into typed layers: entities, DTOs, mappers, controllers, services and repositories, with typed errors, cursor paging and role checks." },
    { g: 'Learn', t: "Testing strategies (Backend engineering 12)", p: '/learn/testing-strategies', e: "Plan the tests for a checkout: unit, integration and e2e tests, test doubles, fixtures, isolation, contract, property-based, load and security tests." },
    { g: 'Learn', t: "Caching (Backend engineering 13)", p: '/learn/backend-caching', e: "Build a cache from scratch: cache-aside with TTL, invalidation on writes, stampede protection, stale-while-revalidate, hit-rate metrics and what to cache." },
    { g: 'Learn', t: "Queues and background jobs (Backend engineering 14)", p: '/learn/backend-queues', e: "Move slow, fragile work out of the request: a job queue with retries, backoff, dead letters, at-least-once delivery, idempotent consumers and an outbox." },
    { g: 'Learn', t: "File uploads and storage (Backend engineering 15)", p: '/learn/backend-files', e: "Accept uploads safely with node:http: stream multipart bodies to disk, enforce size limits, sniff real content types and serve files through signed URLs." },
    { g: 'Learn', t: "Modelling data for a shop (Database engineering 1)", p: '/learn/db-modeling', e: "Turn a messy spreadsheet of orders into a normalised PostgreSQL schema for a shop, see each anomaly on real data, add constraints, and walk a category tree." },
    { g: 'Learn', t: "Indexes and query plans (Database engineering 2)", p: '/learn/db-indexes', e: "Read PostgreSQL query plans, see how a B-tree finds rows, and add composite, partial, expression and covering indexes that make a 100,000-order shop fast again." },
    { g: 'Learn', t: "Transactions, isolation and locks (Database engineering 3)", p: '/learn/db-transactions', e: "Make a ₦ wallet transfer correct under concurrency with ACID transactions, isolation levels, row locks, deadlock-free ordering and optimistic version checks." },
    { g: 'Learn', t: "Operating databases (Database engineering 4)", p: '/learn/db-operations', e: "Run PostgreSQL behind a live shop: size connection pools, ship migrations with zero downtime, seed safely, restore from backups, and read from replicas." },
    { g: 'Learn', t: "Typing database code (Database engineering 5)", p: '/learn/db-typescript', e: "Give database rows honest TypeScript types: row types, nullable columns, entities and DTOs, typed repositories, generated types, and when a query builder or ORM helps." },
    { g: 'Learn', t: "Pagination and versioning in depth (API engineering 1)", p: '/learn/api-pagination-versioning', e: "Page through 100,000 orders without skipping or repeating one, design opaque cursors, and change responses without breaking existing clients." },
    { g: 'Learn', t: "Idempotency and safe retries (API engineering 2)", p: '/learn/api-idempotency', e: "Build a ₦10,000 transfer endpoint that survives partial failures, lost responses, double taps and crashes, with transactions and idempotency keys." },
    { g: 'Learn', t: "Rate limiting (API engineering 3)", p: '/learn/api-rate-limiting', e: "Build fixed-window, sliding-window and token-bucket rate limiters, choose what to count, answer 429 with Retry-After, and share limits across servers." },
    { g: 'Learn', t: "API contracts (API engineering 4)", p: '/learn/api-contracts', e: "Write an OpenAPI contract by hand, enforce it with schema validation, catch breaking changes with contract tests, and version events and serialization." },
    { g: 'Learn', t: "Authentication (Security 1)", p: '/learn/sec-authentication', e: "Build log-in from first principles: Argon2id hashes, hashed session tokens, a hand-made JWT, secure cookies, rotation, logout and brute-force limits." },
    { g: 'Learn', t: "OAuth 2.0 and OpenID Connect (Security 2)", p: '/learn/sec-oauth', e: "Implement the OAuth code flow with PKCE and OpenID Connect against your own small authorization server, then attack it with forged states and stolen codes." },
    { g: 'Learn', t: "Browser attacks and defences (Security 3)", p: '/learn/sec-web', e: "Find and fix CSRF, CORS mistakes and XSS in small Node.js apps, add a Content-Security-Policy and security headers, and prove every fix with a test." },
    { g: 'Learn', t: "Writing injection-safe code (Security 4)", p: '/learn/sec-injection', e: "Keep untrusted data from becoming code: parameterized SQL, argument arrays, confined file paths, outbound URL allow-lists, strict HTTP parsing, safe merges and linear-time regexes." },
    { g: 'Learn', t: "Cryptography for developers (Security 5)", p: '/learn/sec-crypto', e: "Choose between hashing, HMAC, encryption and signatures by the problem, sign and verify with Ed25519, run TLS locally, and manage and rotate keys safely." },
    { g: 'Learn', t: "Types are not security (Security 6)", p: '/learn/ts-security', e: "See why a TypeScript type cannot decide who may do what, then build a refund endpoint with runtime validation, explicit authorization, branded ids and unloggable secrets." },
    { g: 'Learn', t: "Design principles through refactoring (Software design and architecture 1)", p: '/learn/design-principles', e: "Refactor a tangled order function step by step into validation, pricing, payment, storage and notification parts, with tests printed after every step." },
    { g: 'Learn', t: "SOLID, DRY, KISS and YAGNI (Software design and architecture 2)", p: '/learn/design-solid', e: "Meet SOLID, DRY, KISS and YAGNI through real invoice, promotion and reminder bugs, then see how each principle goes wrong when it is applied without judgement." },
    { g: 'Learn', t: "Creational patterns (Software design and architecture 3)", p: '/learn/design-patterns-creational', e: "Fix real object-creation bugs with factories, abstract factories and builders, then see why a DI container's singleton lifetime beats the singleton pattern." },
    { g: 'Learn', t: "Structural patterns (Software design and architecture 4)", p: '/learn/design-patterns-structural', e: "Wrap a third-party SMS SDK in an adapter, add retries, logging and caching with decorators, control access with proxies, and hide SQL behind a repository." },
    { g: 'Learn', t: "Behavioural patterns (Software design and architecture 5)", p: '/learn/design-patterns-behavioral', e: "Turn a shipping-fee switch into strategies, decouple order reactions with observers, make admin actions undoable commands, and build middleware as a chain." },
    { g: 'Learn', t: "Backend architecture (Software design and architecture 6)", p: '/learn/backend-architecture', e: "Give backend code a shape. Learn controllers, services, repositories, models and DTOs, middleware, dependency injection and configuration, the difference between domain, application and infrastructure code, and which way dependencies must point. Then refactor the BookStore's orders into those layers." },
    { g: 'Learn', t: "Clean architecture: ports and adapters (Software design and architecture 7)", p: '/learn/arch-clean', e: "Rebuild the BookStore's order flow as domain, use cases, ports and adapters, run it over HTTP and a CLI, and enforce the dependency rule with a checker." },
    { g: 'Learn', t: "Architecture styles (Software design and architecture 8)", p: '/learn/arch-styles', e: "Compare monoliths, modular monoliths, microservices, events, messages, CQRS and gateways by simulating them in-process, with injected latency and failures." },
    { g: 'Learn', t: "What a framework does (Software design and architecture 9)", p: '/learn/frameworks', e: "The difference between a library and a framework, inversion of control, and the jobs a backend framework takes over: lifecycle, dependency injection, routing, configuration, validation, database access, testing and application structure. Build a tiny framework to see how it works inside." },
    { g: 'Learn', t: "Build a mini framework, part 1: the core (Software design and architecture 10)", p: '/learn/framework-build-core', e: "Build the core of a small TypeScript framework (container, config, logger, lifecycle with rollback, application object) and compare each part with ZudoJS." },
    { g: 'Learn', t: "Build a mini framework, part 2: HTTP (Software design and architecture 11)", p: '/learn/framework-build-http', e: "Add a router, middleware, controllers, validation, error responses and an event bus to your mini framework, serve it with node:http, and compare it with ZudoJS." },
    { g: 'Learn', t: "Reading framework source (Software design and architecture 12)", p: '/learn/framework-read-source', e: "Answer questions the docs cannot by reading the published ZudoJS packages: package boundaries, .d.ts files, generics, and a request and a resolution traced through dist code." },
    { g: 'Learn', t: "Welcome to ZudoJS (ZudoJS fundamentals 1)", p: '/learn/zudo-welcome', e: "What ZudoJS is, how its packages are layered, what each of its packages is for, what the zudojs command-line tool does, and the three application shapes it can create. Then run three ZudoJS packages together in your browser." },
    { g: 'Learn', t: "Your first Zudo code (ZudoJS fundamentals 2)", p: '/learn/zudo-first-code', e: "Install your first ZudoJS packages, check untrusted data at runtime with @zudojs/schema, and report failures with the ready-made errors in @zudojs/errors." },
    { g: 'Learn', t: "Create the Task API project (ZudoJS fundamentals 3)", p: '/learn/zudo-create-project', e: "Install the ZudoJS command-line tool, create the Task API project with flags or by answering its questions, start it in development, find your way around the files, use every CLI command, and build and run it for production." },
    { g: 'Learn', t: "The ZudoJS CLI in depth (ZudoJS fundamentals 4)", p: '/learn/zudo-cli', e: "Use every command and option of the zudojs CLI, learn how it finds your project and names and wires generated files, and read its errors before they cost you time." },
    { g: 'Learn', t: "Anatomy of a ZudoJS project (ZudoJS fundamentals 5)", p: '/learn/zudo-project-anatomy', e: "Trace a generated ZudoJS project from src/server.ts through config, runtime and composition root to a controller, service and repository, running the real generated files." },
    { g: 'Learn', t: "The core: applications, modules and context (ZudoJS fundamentals 6)", p: '/learn/zudo-core', e: "Build an application with @zudojs/core, compose it from modules, and carry each request's identity through async code with the execution context." },
    { g: 'Learn', t: "The application runtime and lifecycle (ZudoJS fundamentals 7)", p: '/learn/zudo-runtime', e: "Learn how the ZudoJS runtime starts the parts of your application in dependency order, rolls back when startup fails, reports readiness, and shuts everything down gracefully." },
    { g: 'Learn', t: "Components with @zudojs/lifecycle (ZudoJS fundamentals 8)", p: '/learn/zudo-lifecycle', e: "Start and stop a database, a job queue and an HTTP server in the right order with @zudojs/lifecycle, with retries, timeouts, priorities, optional parts, rollback and graceful shutdown." },
    { g: 'Learn', t: "Types and constants: guards, ids and time (ZudoJS fundamentals 9)", p: '/learn/zudo-types-constants', e: "Check untrusted values with @zudojs/types, keep ids apart with branded types, use the shared HTTP and time constants, and make clocks and randomness testable." },
    { g: 'Learn', t: "Dependency injection with @zudojs/container (ZudoJS fundamentals 10)", p: '/learn/zudo-container', e: "Let a container build and share your services. Learn tokens, class, factory and value providers, the singleton, scoped and transient lifetimes, circular dependency detection, disposal, and swapping real services for fakes in tests." },
    { g: 'Learn', t: "DI architecture with ZudoJS (ZudoJS fundamentals 11)", p: '/learn/zudo-di-architecture', e: "Decide where every object in a ZudoJS app is built. Keep one composition root, choose constructor or factory injection, swap fakes in tests and freeze wiring in production." },
    { g: 'Learn', t: "Routes, requests and responses (ZudoJS fundamentals 12)", p: '/learn/zudo-http', e: "Serve the Task API over HTTP with @zudojs/http. Start a server, add routes with parameters, read query strings, headers, cookies and JSON bodies safely, and answer with the right status codes." },
    { g: 'Learn', t: "Routing in depth (ZudoJS fundamentals 13)", p: '/learn/zudo-routing', e: "Control exactly which handler answers a request in @zudojs/http. Learn path patterns, matching order, route middleware, groups, repeated query keys and canonical request targets." },
    { g: 'Learn', t: "Middleware, CORS, security headers and graceful shutdown (ZudoJS fundamentals 14)", p: '/learn/zudo-middleware', e: "Wrap every Task API route in middleware. Learn how a middleware pipeline runs, then add security headers, a CORS allow-list, rate limits with @zudojs/security, and a graceful shutdown that lets requests in progress finish." },
    { g: 'Learn', t: "Middleware pipelines with @zudojs/middleware (ZudoJS fundamentals 15)", p: '/learn/zudo-middleware-pipelines', e: "Build a transport-independent pipeline with @zudojs/middleware: logging, authentication, authorization, validation, rate limiting, timeouts, error modes and execution tracking." },
    { g: 'Learn', t: "Configuration (ZudoJS fundamentals 16)", p: '/learn/zudo-config', e: "Keep settings out of the code with @zudojs/config. Layer defaults, a config file and environment variables by priority, validate the result with a schema, keep secrets out of logs, and make the Task API's generated configuration stricter in production than in development." },
    { g: 'Learn', t: "Schemas and validation in depth (ZudoJS fundamentals 17)", p: '/learn/zudo-validation', e: "Validate everything that crosses the Task API's boundary with @zudojs/schema. Read issues, coerce query strings, transform and refine values, block unknown fields, validate requests in routes and responses on the way out, and guard against hostile JSON with @zudojs/validation." },
    { g: 'Learn', t: "Validation rules with @zudojs/validation (ZudoJS fundamentals 18)", p: '/learn/zudo-validation-rules', e: "Go beyond data shapes with @zudojs/validation. Use constraints, normalizers, composers, Zod schemas, structural guards and validation errors, and validate requests and responses differently." },
    { g: 'Learn', t: "The ZudoJS error system (ZudoJS fundamentals 19)", p: '/learn/zudo-errors', e: "Handle failures the ZudoJS way. Tell expected errors from bugs, use and extend the error classes in @zudojs/errors, choose codes and categories, serialize errors safely for clients and fully for logs, and turn every error in the Task API into the right HTTP response." },
    { g: 'Learn', t: "Databases with @zudojs/database (ZudoJS application development 1)", p: '/learn/zudo-database', e: "Connect the Task API to PostgreSQL through @zudojs/database, with migrations, seeds, a repository, a query builder, pagination, transactions and health checks, all running against real PostgreSQL." },
    { g: 'Learn', t: "Data architecture with ZudoJS (ZudoJS application development 2)", p: '/learn/zudo-data-architecture', e: "Design the Task API's data layer with @zudojs/database: entities and DTOs, repositories, query services, keyset pagination, indexes and safe concurrent writes." },
    { g: 'Learn', t: "Storage abstractions (ZudoJS application development 3)", p: '/learn/zudo-storage', e: "Use @zudojs/storage's driver-independent contracts for databases, files, serialization, locks, connection pools and start-up and shutdown, with a PostgreSQL adapter and local file storage for the Task API." },
    { g: 'Learn', t: "Transactions (ZudoJS application development 4)", p: '/learn/zudo-transactions', e: "Coordinate transactions across many functions with @zudojs/transactions, with context that follows your code through AsyncLocalStorage, rollbacks, savepoints, after-commit hooks, retries, timeouts and rollback-only state, against real PostgreSQL." },
    { g: 'Learn', t: "\"Project: a file upload system\" (ZudoJS application development 5)", p: '/learn/zudo-file-uploads', e: "Build task attachments for the Task API with @zudojs/http and @zudojs/storage: size limits, sniffed content types, safe keys, metadata, fenced locks and failure recovery." },
    { g: 'Learn', t: "Cryptography with @zudojs/crypto (ZudoJS application development 6)", p: '/learn/zudo-crypto', e: "Use @zudojs/crypto for random ids and tokens, hashes, HMAC, password hashing, AES-GCM encryption with key ids, and constant-time checks, and build reset tokens and signed links." },
    { g: 'Learn', t: "Authentication (ZudoJS application development 7)", p: '/learn/zudo-auth', e: "Let users log in to the Task API. Hash passwords, issue and check JWTs, keep server-side sessions with a real logout, protect routes in @zudojs/http, and stop password guessing with lockouts and rate limits, using @zudojs/auth and @zudojs/crypto." },
    { g: 'Learn', t: "Sign in with OAuth (ZudoJS application development 8)", p: '/learn/zudo-oauth', e: "Add \"Sign in with Google\" to the Task API with @zudojs/auth-oauth. Learn the OAuth 2 authorization code flow, state and PKCE, the provider presets, and the callback, all tested offline against a stand-in provider." },
    { g: 'Learn', t: "Permissions (ZudoJS application development 9)", p: '/learn/zudo-permissions', e: "Decide what each logged-in user may do with @zudojs/permissions. Roles, resource:action permissions, wildcards, role hierarchy, owner rules, deny rules, policies and explain mode, and the mistakes that let a normal user become an admin." },
    { g: 'Learn', t: "Security for every public API (ZudoJS application development 10)", p: '/learn/zudo-security', e: "Protect the Task API from the open internet with @zudojs/security and the security helpers in @zudojs/http. Rate limiting, CORS, CSRF, security headers, HSTS and CSP, secure cookies, body limits, SSRF protection and input checks, each shown blocking a real attack." },
    { g: 'Learn', t: "Caching (ZudoJS application development 11)", p: '/learn/zudo-cache', e: "Keep copies of slow results so the Task API can answer again fast. Learn keys, TTL, namespaces, tags and invalidation, stampede protection, locks and cache metrics with @zudojs/cache." },
    { g: 'Learn', t: "Type-safe application design (ZudoJS application development 12)", p: '/learn/zudo-typed-design', e: "Design a billing module for the Task API where ids, money, order states, DTOs, commands, queries, events, errors, config and DI wiring are all checked by TypeScript." },
    { g: 'Learn', t: "Events (ZudoJS advanced systems 1)", p: '/learn/zudo-events', e: "Announce that something happened and let other parts of the Task API react, without the code that announces it knowing who listens. Handlers, wildcards, priorities, dispatch modes, middleware and handler errors with @zudojs/events." },
    { g: 'Learn', t: "Messaging (ZudoJS advanced systems 2)", p: '/learn/zudo-messaging', e: "Ask another part of the Task API to do something and get an answer back, without importing it. Messages, handlers, middleware, correlation and causation ids, timeouts and cancellation with @zudojs/messaging." },
    { g: 'Learn', t: "Commands and queries (CQRS) (ZudoJS advanced systems 3)", p: '/learn/zudo-cqrs', e: "Split the Task API's operations into commands that change data and queries that only read it. Command and query buses, handlers, middleware, execution context, results, and when CQRS is worth it, with @zudojs/cqrs." },
    { g: 'Learn', t: "Background jobs (ZudoJS advanced systems 4)", p: '/learn/zudo-queue', e: "Move slow and unreliable work out of the request and into a job queue. Queues, jobs, processors, workers, concurrency, retries with exponential backoff, delayed jobs, dead letters and graceful shutdown with @zudojs/queue." },
    { g: 'Learn', t: "Scheduled tasks (ZudoJS advanced systems 5)", p: '/learn/zudo-scheduler', e: "Run work on the clock, not on a request. Intervals, one-off runs and cron expressions, time zones, retries and failed runs, overlapping runs, restarts, and running a schedule on one instance only, with @zudojs/scheduler." },
    { g: 'Learn', t: "Serialization (ZudoJS advanced systems 6)", p: '/learn/zudo-serialization', e: "Turn values into text and back without losing what they were. See exactly what plain JSON loses, keep Dates, BigInts, Maps, Sets, bytes and Errors with @zudojs/serialization, add your own types, read untrusted input safely, and version your payloads with envelopes." },
    { g: 'Learn', t: "Calling services with RPC (ZudoJS advanced systems 7)", p: '/learn/zudo-rpc', e: "Call a function that runs in another service as if it were local. Define procedures with @zudojs/rpc, call them through a client and a transport, and handle validation, errors, identity, timeouts and retries." },
    { g: 'Learn', t: "One operation, many transports (ZudoJS advanced systems 8)", p: '/learn/zudo-api', e: "Write your business logic once as an operation with @zudojs/api, then run it from HTTP, RPC and a queue with the same validation, errors, interceptors and timeouts." },
    { g: 'Learn', t: "OpenAPI documents (ZudoJS advanced systems 9)", p: '/learn/zudo-openapi', e: "Describe the Task API in an OpenAPI document with @zudojs/openapi. Turn your schemas into components, choose between OpenAPI 3.0 and 3.1, validate the document, save it as JSON or YAML, and serve a documentation page." },
    { g: 'Learn', t: "Testing a ZudoJS app (ZudoJS advanced systems 10)", p: '/learn/zudo-testing', e: "Test the Task API with Vitest and @zudojs/testing. Control time with a test clock, replace services with mocks and recording buses, wire fakes through a test container, clean up in the right order, and run integration tests against a real HTTP server." },
    { g: 'Learn', t: "Testing a ZudoJS application layer by layer (ZudoJS advanced systems 11)", p: '/learn/zudo-testing-apps', e: "Test the Task API one layer at a time with Vitest: services, PGlite repositories, auth sessions, events and queues, CQRS buses, HTTP routes and a full workflow." },
    { g: 'Learn', t: "Structured logging (ZudoJS advanced systems 12)", p: '/learn/zudo-logging', e: "Replace console.log with structured log entries that a program can search. Levels, child loggers, request ids, request and error logging, secret redaction and JSON logs for production with @zudojs/logger." },
    { g: 'Learn', t: "Observability (ZudoJS advanced systems 13)", p: '/learn/zudo-observability', e: "See inside a running Task API. Metrics count what happens, traces show where the time goes, and logs, metrics and traces share one trace id across requests and services, with @zudojs/observability." },
    { g: 'Learn', t: "Documentation as data with @zudojs/docs (ZudoJS advanced systems 14)", p: '/learn/zudo-docs', e: "Turn the Task API's Markdown docs into checked data with @zudojs/docs: documents, frontmatter, a registry, link and navigation checks, and generated output." },
    { g: 'Learn', t: "Feature flags (ZudoJS advanced systems 15)", p: '/learn/zudo-feature-flags', e: "Turn features on and off without deploying. Rules, evaluation context, percentage rollouts, A/B variants, kill switches and browser snapshots with @zudojs/feature-flags." },
    { g: 'Learn', t: "Multi-tenancy (ZudoJS advanced systems 16)", p: '/learn/zudo-tenancy', e: "Serve many companies from one Task API without ever mixing their data. Tenant ids, resolvers and trust levels, resolver chains, AsyncLocalStorage context and tenant-scoped queries with @zudojs/tenancy." },
    { g: 'Learn', t: "Plugins (ZudoJS advanced systems 17)", p: '/learn/zudo-plugins', e: "Let other code extend the Task API without editing it. Write plugins, declare dependencies, run their lifecycle, give each one a scoped context, roll back failed starts, read diagnostics and publish a plugin to npm with @zudojs/plugins." },
    { g: 'Learn', t: "Adapters with @zudojs/adapters (ZudoJS advanced systems 18)", p: '/learn/zudo-adapters', e: "Put a payment provider behind an adapter with @zudojs/adapters, then swap a fake for a real HTTP provider without touching checkout." },
    { g: 'Learn', t: "A well-structured monolith (ZudoJS architecture 1)", p: '/learn/zudo-monolith', e: "Build ShopFlow as one ZudoJS application with auth, users, products, orders, payments and notifications, one database and one deploy, and see where it strains." },
    { g: 'Learn', t: "From monolith to modular monolith (ZudoJS architecture 2)", p: '/learn/zudo-modular-monolith', e: "Split one growing application into modules with clear boundaries. Each module has a small public API, owns its data, and talks to the others through that API, events and commands, all inside one deployable app." },
    { g: 'Learn', t: "Microservices (ZudoJS architecture 3)", p: '/learn/zudo-microservices', e: "Why some teams split one application into many services, why you should not start that way, and how services find and call each other, stay consistent without distributed transactions, survive failures and stay observable." },
    { g: 'Learn', t: "Event-driven systems (ZudoJS architecture 4)", p: '/learn/zudo-event-driven', e: "Build an OrderCreated flow whose email, audit and analytics handlers survive retries, duplicates, crashes, dead letters and a v1 to v2 payload change." },
    { g: 'Learn', t: "A CQRS system (ZudoJS architecture 5)", p: '/learn/zudo-cqrs-system', e: "Build ShopFlow orders as a full CQRS system: transactional commands with an outbox, a projected read model, typed buses, an HTTP API and one trace end to end." },
    { g: 'Learn', t: "Distributed systems fundamentals (Distributed systems 1)", p: '/learn/dist-fundamentals', e: "Simulate an unreliable network with a seeded random generator, then reason about partial failure, clocks, consistency, CAP and service discovery." },
    { g: 'Learn', t: "Contracts between services (Distributed systems 2)", p: '/learn/dist-contracts', e: "Keep services that deploy on different days talking: version API, event and message schemas, evolve them safely, and catch breaks with consumer-driven contract tests." },
    { g: 'Learn', t: "Failure engineering (Distributed systems 3)", p: '/learn/dist-reliability', e: "Break ShopFlow on purpose with a seeded fault injector, then keep it serving with timeouts, jittered retries, a circuit breaker, bulkheads, fallbacks and readiness checks." },
    { g: 'Learn', t: "Transactions across services (Distributed systems 4)", p: '/learn/dist-transactions', e: "Keep an order, a payment, stock and a shipment consistent across four services with sagas, compensations, a transactional outbox on PostgreSQL and idempotent consumers." },
    { g: 'Learn', t: "Production engineering (Production engineering 1)", p: '/learn/production-engineering', e: "What changes when real users depend on your app. A checklist for configuration, secrets, logs, metrics, traces, health and readiness checks, graceful shutdown, timeouts, rate limits, caching and database performance, with a small runnable proof for each item." },
    { g: 'Learn', t: "A production security review (Production engineering 2)", p: '/learn/zudo-production-security', e: "Review the Task API before launch: seventeen checks from authentication to log leakage, each with the safe ZudoJS setup and a test that proves it holds." },
    { g: 'Learn', t: "Diagnosing performance (Production engineering 3)", p: '/learn/zudo-performance', e: "Find out why the Task API is slow before changing anything: load tests, event-loop lag, CPU profiles, query plans, pools, caches, workers and memory." },
    { g: 'Learn', t: "Deploying a ZudoJS app (Production engineering 4)", p: '/learn/deployment', e: "Take the Task API from your computer to a server. Build it for production, run it under systemd or in Docker, add PostgreSQL and Redis with Docker Compose, put Caddy in front for HTTPS, run migrations during a deployment, read the logs and back up the database." },
    { g: 'Learn', t: "Reading ZudoJS internals (Framework engineering 1)", p: '/learn/zudo-internals', e: "Open the published @zudojs packages in node_modules, map their boundaries and dependency graph, and trace how routing, scopes, wildcards and caching really work." },
    { g: 'Learn', t: "Creating a ZudoJS package (Framework engineering 2)", p: '/learn/zudo-create-package', e: "Build @mycompany/zudo-payments as a real npm package: public and internal API, ZudoJS errors, a provider adapter, Vitest tests, checked docs, changesets and a verified tarball." },
    { g: 'Learn', t: "Building a complete ZudoJS plugin (Framework engineering 3)", p: '/learn/zudo-create-plugin', e: "Build a production-grade receipts plugin with @zudojs/plugins: metadata, dependencies, capabilities, lifecycle, scoped context, events, diagnostics, rollback and tests." },
    { g: 'Learn', t: "Use case: a REST API for users, products and orders (Real-world projects and capstone 1)", p: '/learn/usecase-rest-api', e: "Build Oja Market's public API from a product brief: resources and status codes, schemas, JWT access, keyset pagination, OpenAPI and contract tests." },
    { g: 'Learn', t: "Use case: an authentication platform (Real-world projects and capstone 2)", p: '/learn/usecase-auth-platform', e: "Build Sabi School's account platform: registration, sessions, JWT rotation, password reset links, roles and sign-in with an OAuth provider, all tested." },
    { g: 'Learn', t: "Use case: a multi-tenant SaaS (Real-world projects and capstone 3)", p: '/learn/usecase-saas', e: "Build InvoiceHub, where many businesses share one app and one database, and prove with tests that one organization can never read another's data." },
    { g: 'Learn', t: "Use case: background processing (Real-world projects and capstone 4)", p: '/learn/usecase-background-jobs', e: "Move invoice e-mails out of the request: a durable job ledger, a queue with retries and concurrency, scheduled reminders, correlation ids and recovery from crashed workers." },
    { g: 'Learn', t: "A whole project through the CLI (Real-world projects and capstone 5)", p: '/learn/zudo-cli-project', e: "Build a hall-booking API from zudojs create to a Docker image, generating each layer with the CLI and fixing the five things the generator gets wrong." },
    { g: 'Learn', t: "Capstone: ShopFlow (Real-world projects and capstone 6)", p: '/learn/capstone-shopflow', e: "The final project. Plan and build ShopFlow, a small online shop, with ZudoJS. A complete, runnable core for accounts, products and a checkout that never oversells, followed by milestones with acceptance criteria that take it to a modular monolith and then to services." },
    { g: 'Learn', t: "Final production challenge (Real-world projects and capstone 7)", p: '/learn/final-challenge', e: "Someone else's gift-card feature works in the demo and fails everything else. Find its architectural problems, then make it production-ready step by step, with acceptance criteria, hints and worked solutions for the key fixes." },
    /* learn-search:end */
    { g: 'Getting started', t: 'Installation', p: '/docs/getting-started', e: 'Install Zudo from npm. Node.js 24 or newer.' },
    { g: 'Getting started', t: 'Your first app', p: '/docs/getting-started-first-app', e: 'Scaffold a project with the CLI and start it.' },
    { g: 'Getting started', t: 'Project structure', p: '/docs/getting-started-project-structure', e: 'Standard layout for a Zudo application.' },
    { g: 'Architecture', t: 'Architecture overview', p: '/docs/architecture', e: 'Five layers, one dependency direction.' },
    { g: 'Architecture', t: 'Module system', p: '/docs/architecture-module-system', e: 'Modules as self-contained units of functionality.' },
    { g: 'Architecture', t: 'Runtime', p: '/docs/architecture-runtime', e: 'The application lifecycle orchestrator.' },
    { g: 'Architecture', t: 'Adapters', p: '/docs/architecture-adapters', e: 'Boundary layer between Zudo and external platforms.' },
    { g: 'Architecture', t: 'Dependency direction', p: '/docs/architecture-dependency-direction', e: 'Dependencies flow inward through five tiers.' },
    { g: 'Concepts', t: 'Application', p: '/docs/concepts', e: 'Top-level container for modules, plugins and infrastructure.' },
    { g: 'Concepts', t: 'Configuration', p: '/docs/concepts-configuration', e: 'Layered configuration with clear precedence.' },
    { g: 'Concepts', t: 'Contexts', p: '/docs/concepts-contexts', e: 'AsyncLocalStorage-based context propagation.' },
    { g: 'Concepts', t: 'Dependency injection', p: '/docs/concepts-dependency-injection', e: 'Token-based container with scoped lifecycles.' },
    { g: 'Concepts', t: 'Lifecycle', p: '/docs/concepts-lifecycle', e: 'State machine for component lifecycle.' },
    { g: 'Concepts', t: 'Modules', p: '/docs/concepts-modules', e: 'Primary building blocks with explicit boundaries.' },
    { g: 'Reference', t: 'All packages', p: '/docs/packages', e: '39 packages across six categories.' },
    { g: 'Reference', t: 'Roadmap', p: '/docs/roadmap', e: 'Implementation status and future direction.' },
    { g: 'Reference', t: 'Changelog', p: '/docs/changelog', e: 'What changed in each release, package by package.' },
    { g: 'Reference', t: 'Package rules', p: '/docs/rules', e: 'Development standards every package follows.' },
    { g: 'Reference', t: 'Contributing', p: '/docs/contributing', e: 'How to contribute to Zudo.' },
    { g: 'Reference', t: 'Sponsors', p: '/sponsors', e: 'Support the ecosystem.' },
  ];

  var PACKAGES = [
    ['adapters', 'Boundary layer for external platforms'], ['api', 'Transport-agnostic operations, interceptors, results'],
    ['auth', 'JWT, sessions, password hashing, RBAC'],
    ['auth-oauth', 'Sign in with Google, GitHub, Microsoft, Apple, Discord'], ['cache', 'Cache abstraction with memory adapter'],
    ['cli', 'Command-line scaffolding and generators'], ['config', 'Layered configuration sources'],
    ['constants', 'Shared constants and enums'], ['container', 'Token-based DI container'],
    ['core', 'Application, modules, lifecycle, runtime'], ['cqrs', 'Commands, queries, handlers'],
    ['crypto', 'Hashing, encryption, signing'], ['database', 'Database abstraction and adapters'],
    ['docs', 'Documentation generation'], ['errors', 'Error base class and utilities'],
    ['events', 'Event bus, emitter, middleware'], ['feature-flags', 'Runtime feature toggles'],
    ['http', 'HTTP server and client primitives'], ['lifecycle', 'Component lifecycle state machine'],
    ['logger', 'Structured logging with transports'], ['messaging', 'Message brokers and channels'],
    ['middleware', 'Composable middleware pipeline'], ['observability', 'Metrics, tracing, health'],
    ['openapi', 'OpenAPI spec generation'], ['permissions', 'Permission and policy checks'],
    ['plugins', 'Plugin system'], ['queue', 'Job queues and workers'],
    ['rpc', 'Remote procedure calls'], ['runtime', 'Runtime orchestration'],
    ['scheduler', 'Cron and interval scheduling'], ['schema', 'Schema definition and parsing'],
    ['security', 'Security headers, CSRF, rate limits'], ['serialization', 'Serializers and codecs'],
    ['storage', 'File and object storage'], ['tenancy', 'Multi-tenant isolation'],
    ['testing', 'Test utilities and harnesses'], ['transactions', 'Unit of work and transactions'],
    ['types', 'Shared TypeScript types'], ['validation', 'Validation rules and pipelines'],
  ];

  PACKAGES.forEach(function (p) {
    SEARCH_INDEX.push({ g: 'Packages', t: '@zudojs/' + p[0], p: '/docs/packages-' + p[0], e: p[1] });
  });

  /* ---------- helpers ---------- */

  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function highlight(text, q) {
    if (!q) return esc(text);
    var re = new RegExp('(' + q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ')', 'ig');
    return esc(text).replace(re, '<mark>$1</mark>');
  }

  /* ---------- header ---------- */

  function renderHeader() {
    var slot = document.getElementById('zudo-nav');
    if (!slot) return;

    var active = activeKey();

    var links = NAV.map(function (n) {
      return '<a class="zh-link' + (active === n.key ? ' is-active' : '') + '" href="' + n.href + '"' +
        (active === n.key ? ' aria-current="page"' : '') + '>' + n.label + '</a>';
    }).join('');

    var mobileLinks = [{ key: 'home', label: 'Home', href: '/' }].concat(NAV).map(function (n) {
      return '<a class="zh-mobile-link' + (active === n.key ? ' is-active' : '') + '" href="' + n.href + '">' + n.label + '</a>';
    }).join('');

    slot.outerHTML =
      '<a class="z-skip" href="#main">Skip to content</a>' +
      '<header class="zh" id="zudoHeader">' +
        '<div class="zh-bar"><div class="zh-inner">' +
          '<a class="zh-brand" href="/" aria-label="Zudo home">' + ICON.mark +
            '<span class="zh-word">' + ICON.word + '<span class="sr-only">Zudo</span></span><span class="zh-ver">v' + VERSION + '</span></a>' +
          '<nav class="zh-nav" aria-label="Primary">' + links + '</nav>' +
          '<div class="zh-actions">' +
            '<button type="button" class="zh-btn zh-search" id="zudoSearchTrigger" aria-label="Search documentation">' +
              ICON.search + '<span class="zh-search-label">Search docs</span><kbd>Ctrl K</kbd></button>' +
            '<button type="button" class="zh-btn zh-btn--icon zh-term" id="zudoTerminalTrigger" title="Open the playground (Ctrl+`)" aria-label="Open the playground">&gt;_</button>' +
            '<a class="zh-btn zh-btn--icon" href="' + GITHUB_URL + '" target="_blank" rel="noopener" aria-label="Zudo on GitHub">' + ICON.github + '</a>' +
            '<a class="zh-cta" href="/learn">Get started</a>' +
            '<button type="button" class="zh-btn zh-btn--icon zh-burger" id="zudoMenuTrigger" aria-label="Open menu" aria-expanded="false" aria-controls="zudoMobileMenu">' + ICON.menu + '</button>' +
          '</div>' +
        '</div></div>' +
        '<div class="zh-mobile" id="zudoMobileMenu">' +
          '<nav class="zh-mobile-inner" aria-label="Mobile">' + mobileLinks +
            '<div class="zh-mobile-cta">' +
              '<a class="zh-cta" href="/learn">Get started</a>' +
              '<a class="zh-btn" href="' + GITHUB_URL + '" target="_blank" rel="noopener">' + ICON.github + ' GitHub</a>' +
            '</div>' +
          '</nav>' +
        '</div>' +
      '</header>';

    var header = document.getElementById('zudoHeader');
    var trigger = document.getElementById('zudoMenuTrigger');
    trigger.addEventListener('click', function () {
      var open = header.classList.toggle('is-menu-open');
      trigger.setAttribute('aria-expanded', open ? 'true' : 'false');
      trigger.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
    });

    document.getElementById('zudoTerminalTrigger').addEventListener('click', function () {
      if (window.ZudoPlayground) window.ZudoPlayground.toggle();
    });

    var onScroll = function () { header.classList.toggle('is-scrolled', window.scrollY > 8); };
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
  }

  /* ---------- footer ---------- */

  function renderFooter() {
    var slot = document.getElementById('zudo-footer');
    if (!slot) return;

    function col(title, cls, items) {
      return '<div class="zf-col"><h2 class="' + cls + '">' + title + '</h2><ul>' + items.map(function (i) {
        var ext = i[2] ? ' target="_blank" rel="noopener"' : '';
        return '<li><a href="' + i[1] + '"' + ext + '>' + i[0] + (i[2] ? '<span class="ext">↗</span>' : '') + '</a></li>';
      }).join('') + '</ul></div>';
    }

    slot.outerHTML =
      '<footer class="zf" id="zudoFooter">' +
        '<div class="zf-inner">' +
          '<div class="zf-cta">' +
            '<div><h2>Start with one package.<br><span>Add the rest later.</span></h2>' +
              '<p>Every @zudojs package installs on its own and shares the same contracts, so adding one later never means rewriting the ones you have.</p></div>' +
            '<div class="zf-cta-actions">' +
              '<div class="zf-install"><code><span class="p">$</span>npm install @zudojs/core</code>' +
                '<button type="button" id="zudoFooterCopy" aria-label="Copy install command">COPY</button></div>' +
              '<a class="zf-docs" href="/docs/getting-started">Read the docs →</a>' +
            '</div>' +
          '</div>' +
          '<div class="zf-grid">' +
            '<div class="zf-brand">' +
              '<a class="zh-brand" href="/" aria-label="Zudo home">' + ICON.mark + '<span class="zh-word">' + ICON.word + '<span class="sr-only">Zudo</span></span><span class="zh-ver">v' + VERSION + '</span></a>' +
              '<p class="zf-tagline">A modular TypeScript framework for scalable, maintainable, production-ready applications.</p>' +
            '</div>' +
            col('Documentation', 'c-red', [
              ['Learn ZudoJS (course)', '/learn'],
              ['Getting started', '/docs/getting-started'],
              ['Your first app', '/docs/getting-started-first-app'],
              ['Architecture', '/docs/architecture'],
              ['Concepts', '/docs/concepts'],
              ['Package rules', '/docs/rules'],
              ['For AI agents (llms.txt)', '/llms.txt'],
            ]) +
            col('Packages', 'c-blue', [
              ['@zudojs/core', '/docs/packages-core'],
              ['@zudojs/http', '/docs/packages-http'],
              ['@zudojs/container', '/docs/packages-container'],
              ['@zudojs/auth', '/docs/packages-auth'],
              ['All 39 packages', '/docs/packages'],
            ]) +
            col('Community', 'c-green', [
              ['Contributing', '/docs/contributing'],
              ['Roadmap', '/docs/roadmap'],
              ['Changelog', '/docs/changelog'],
              ['Sponsors', '/sponsors'],
              ['Brand & logo', '/brand'],
              ['Report an issue', GITHUB_URL + '/issues', true],
              ['Discussions', GITHUB_URL + '/discussions', true],
            ]) +
            col('Project', 'c-yellow', [
              ['GitHub', GITHUB_URL, true],
              ['npm', NPM_URL, true],
              ['MIT license', GITHUB_URL + '/blob/main/LICENSE', true],
              ['Security policy', GITHUB_URL + '/blob/main/SECURITY.md', true],
              ['Code of conduct', GITHUB_URL + '/blob/main/CODE_OF_CONDUCT.md', true],
            ]) +
          '</div>' +
          ICON.giant +
          '<div class="zf-bottom">' +
            '<span>&copy; 2026 Zudo</span><span class="sep">/</span>' +
            '<span>MIT License</span><span class="sep">/</span>' +
            '<span>Built with intention.</span>' +
            '<div class="zf-social">' +
              '<a href="' + GITHUB_URL + '" target="_blank" rel="noopener" aria-label="GitHub">' + ICON.github + '</a>' +
              '<a href="' + NPM_URL + '" target="_blank" rel="noopener" aria-label="npm">' + ICON.npm + '</a>' +
              '<a href="' + TWITTER_URL + '" target="_blank" rel="noopener" aria-label="X (Twitter)">' + ICON.x + '</a>' +
              '<button type="button" class="zf-top" id="zudoBackToTop">' + ICON.up + 'TOP</button>' +
            '</div>' +
          '</div>' +
        '</div>' +
      '</footer>';

    document.getElementById('zudoBackToTop').addEventListener('click', function () {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });

    var copy = document.getElementById('zudoFooterCopy');
    copy.addEventListener('click', function () {
      var done = function () {
        copy.textContent = 'COPIED';
        copy.classList.add('is-done');
        setTimeout(function () { copy.textContent = 'COPY'; copy.classList.remove('is-done'); }, 1600);
      };
      if (navigator.clipboard) navigator.clipboard.writeText('npm install @zudojs/core').then(done, done);
      else done();
    });
  }

  /* ---------- global search ---------- */

  function renderSearch() {
    if (document.getElementById('zudoSearch')) return;

    var wrap = document.createElement('div');
    wrap.className = 'zs-overlay';
    wrap.id = 'zudoSearch';
    wrap.setAttribute('role', 'dialog');
    wrap.setAttribute('aria-modal', 'true');
    wrap.setAttribute('aria-label', 'Search documentation');
    wrap.innerHTML =
      '<div class="zs-panel">' +
        '<div class="zs-head">' + ICON.search +
          '<input class="zs-input" id="zudoSearchInput" type="text" placeholder="Search packages, concepts, guides…" autocomplete="off" spellcheck="false" aria-label="Search">' +
          '<button type="button" class="zs-esc" id="zudoSearchClose">ESC</button>' +
        '</div>' +
        '<div class="zs-results" id="zudoSearchResults" role="listbox"></div>' +
        '<div class="zs-foot"><span><kbd>↑</kbd><kbd>↓</kbd> navigate</span><span><kbd>↵</kbd> open</span><span><kbd>esc</kbd> close</span></div>' +
      '</div>';
    document.body.appendChild(wrap);

    var input = document.getElementById('zudoSearchInput');
    var results = document.getElementById('zudoSearchResults');
    var trigger = document.getElementById('zudoSearchTrigger');
    var closeBtn = document.getElementById('zudoSearchClose');
    var filtered = [];
    var index = -1;

    function open() {
      wrap.classList.add('is-open');
      input.value = '';
      render('');
      setTimeout(function () { input.focus(); }, 0);
    }

    function close() {
      wrap.classList.remove('is-open');
      index = -1;
    }

    function render(q) {
      q = q.trim().toLowerCase();
      index = -1;
      if (!q) {
        filtered = SEARCH_INDEX.filter(function (i) { return i.g !== 'Packages'; }).slice(0, 8);
      } else {
        filtered = SEARCH_INDEX.filter(function (i) {
          return i.t.toLowerCase().indexOf(q) !== -1 ||
                 i.e.toLowerCase().indexOf(q) !== -1 ||
                 i.p.toLowerCase().indexOf(q) !== -1;
        }).slice(0, 24);
      }

      if (!filtered.length) {
        results.innerHTML = '<div class="zs-empty">No results for <strong>' + esc(q) + '</strong>.<br>Try a package name like <strong>http</strong> or a concept like <strong>lifecycle</strong>.</div>';
        return;
      }

      var html = '';
      var lastGroup = null;
      filtered.forEach(function (item, i) {
        if (item.g !== lastGroup) {
          html += '<div class="zs-group">' + esc(item.g) + '</div>';
          lastGroup = item.g;
        }
        html += '<a class="zs-item" role="option" data-i="' + i + '" href="' + item.p + '">' +
          '<div><div class="zs-item-title">' + highlight(item.t, q) + '</div>' +
          '<div class="zs-item-excerpt">' + highlight(item.e, q) + '</div></div>' +
          '<span class="zs-item-path">' + esc(item.p) + '</span></a>';
      });
      results.innerHTML = html;
    }

    function move(delta) {
      var items = results.querySelectorAll('.zs-item');
      if (!items.length) return;
      index = Math.max(0, Math.min(items.length - 1, index + delta));
      items.forEach(function (el, i) { el.classList.toggle('is-active', i === index); });
      items[index].scrollIntoView({ block: 'nearest' });
    }

    if (trigger) trigger.addEventListener('click', open);
    closeBtn.addEventListener('click', close);
    wrap.addEventListener('click', function (e) { if (e.target === wrap) close(); });
    input.addEventListener('input', function () { render(input.value); });
    input.addEventListener('keydown', function (e) {
      if (e.key === 'ArrowDown') { e.preventDefault(); move(1); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); move(-1); }
      else if (e.key === 'Enter') {
        var items = results.querySelectorAll('.zs-item');
        var target = items[index] || items[0];
        if (target) window.location.href = target.getAttribute('href');
      }
    });

    document.addEventListener('keydown', function (e) {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        if (wrap.classList.contains('is-open')) close(); else open();
      } else if (e.key === 'Escape' && wrap.classList.contains('is-open')) {
        close();
      }
    });

    // Deep link from the 404 page: /?q=term
    var q = new URLSearchParams(window.location.search).get('q');
    if (q) { open(); input.value = q; render(q); }

    window.ZudoSearch = { open: open, close: close };
  }

  /* ---------- copy buttons on every code block ---------- */

  var COPY_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="square" aria-hidden="true"><rect x="9" y="9" width="11" height="11"/><path d="M15 9V5H4v11h5"/></svg>';
  var CHECK_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="square" aria-hidden="true"><path d="M5 12l5 5L20 7"/></svg>';

  function copyText(block) {
    if (block.hasAttribute('data-copy')) return block.getAttribute('data-copy');
    var text = block.textContent
      .replace(/^\s*\d+\s{2,}/gm, '')     // strip rendered line numbers
      .replace(/^\$\s+/gm, '')             // strip shell prompts so commands paste clean
      .replace(/\n{3,}/g, '\n\n')
      .trim();
    return text;
  }

  function initCopyButtons() {
    var blocks = document.querySelectorAll('.code-block, .api-signature, pre, .hero-term-code');
    blocks.forEach(function (block) {
      if (block.closest('.pg') || block.closest('.code-wrap') || block.classList.contains('lx-no-copy') || block.querySelector('.code-block, pre')) return;
      if (block.textContent.trim().length < 3) return;
      var wrapper = document.createElement('div');
      wrapper.className = 'code-wrap';
      block.parentNode.insertBefore(wrapper, block);
      wrapper.appendChild(block);

      var isCommand = /^\s*\$\s/m.test(block.textContent);
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'copy-btn';
      btn.innerHTML = COPY_ICON + '<span>' + (isCommand ? 'Copy command' : 'Copy') + '</span>';
      btn.setAttribute('aria-label', isCommand ? 'Copy command' : 'Copy code');
      btn.addEventListener('click', function () {
        var text = copyText(block);
        var done = function (ok) {
          btn.innerHTML = (ok ? CHECK_ICON : COPY_ICON) + '<span>' + (ok ? 'Copied' : 'Press Ctrl+C') + '</span>';
          btn.classList.toggle('is-done', ok);
          setTimeout(function () {
            btn.innerHTML = COPY_ICON + '<span>' + (isCommand ? 'Copy command' : 'Copy') + '</span>';
            btn.classList.remove('is-done');
          }, 1800);
        };
        if (navigator.clipboard && window.isSecureContext) {
          navigator.clipboard.writeText(text).then(function () { done(true); }, function () { fallback(); });
        } else fallback();
        function fallback() {
          var ta = document.createElement('textarea');
          ta.value = text; ta.setAttribute('readonly', ''); ta.style.position = 'fixed'; ta.style.top = '-1000px';
          document.body.appendChild(ta); ta.select();
          var ok = false;
          try { ok = document.execCommand('copy'); } catch (e) {}
          document.body.removeChild(ta);
          done(ok);
        }
      });
      wrapper.appendChild(btn);
    });
  }

  /* ---------- markdown copy of docs pages (for pasting into AI tools) ---------- */

  function initMarkdownActions() {
    var alt = document.querySelector('link[rel="alternate"][type="text/markdown"]');
    var main = document.querySelector('main');
    if (!alt || !main) return;
    var href = alt.getAttribute('href');

    var bar = document.createElement('div');
    bar.className = 'md-actions';
    bar.innerHTML =
      '<button type="button" class="md-btn">' + COPY_ICON + '<span>Copy page as Markdown</span></button>' +
      '<a class="md-btn" href="' + href + '" target="_blank" rel="noopener">View as Markdown</a>';
    main.insertBefore(bar, main.firstChild);

    var btn = bar.querySelector('button');
    var label = btn.querySelector('span');
    function show(text, ok) {
      label.textContent = text;
      btn.classList.toggle('is-done', ok);
      setTimeout(function () { label.textContent = 'Copy page as Markdown'; btn.classList.remove('is-done'); }, 1800);
    }
    btn.addEventListener('click', function () {
      var text = fetch(href).then(function (r) {
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return r.text();
      });
      var write = window.ClipboardItem && navigator.clipboard && navigator.clipboard.write
        ? navigator.clipboard.write([new ClipboardItem({ 'text/plain': text.then(function (t) { return new Blob([t], { type: 'text/plain' }); }) })])
        : text.then(function (t) { return navigator.clipboard.writeText(t); });
      write.then(function () { show('Copied', true); }, function () { show('Copy failed: open View as Markdown', false); });
    });
  }

  /* ---------- vercel analytics + speed insights ---------- */

  /*
   * Plain-HTML integration per Vercel docs — no package, no build step.
   *   Web Analytics : https://vercel.com/docs/analytics/quickstart  (framework: html)
   *   Speed Insights: https://vercel.com/docs/speed-insights/quickstart (framework: html)
   *
   * The queue stubs (window.va / window.si) must exist before the remote scripts
   * load so any early calls are buffered rather than thrown away. Both endpoints
   * are served by Vercel itself at /_vercel/* and only exist on a deployment, so
   * we skip injection on localhost to avoid two guaranteed 404s while developing.
   */
  function injectVercelInsights() {
    var host = window.location.hostname;
    if (host === 'localhost' || host === '127.0.0.1' || host === '' || host === '::1') return;

    window.va = window.va || function () { (window.vaq = window.vaq || []).push(arguments); };
    window.si = window.si || function () { (window.siq = window.siq || []).push(arguments); };

    ['/_vercel/insights/script.js', '/_vercel/speed-insights/script.js'].forEach(function (src) {
      if (document.querySelector('script[src="' + src + '"]')) return;
      var s = document.createElement('script');
      s.src = src;
      s.defer = true;
      document.body.appendChild(s);
    });
  }

  function init() {
    renderHeader();
    renderFooter();
    renderSearch();
    initCopyButtons();
    initMarkdownActions();
    injectVercelInsights();
    var main = document.querySelector('main');
    if (main && !main.id) main.id = 'main';
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
