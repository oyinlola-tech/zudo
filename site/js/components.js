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
    { g: 'Learn', t: "Course: JavaScript in the browser and on the server", p: '/learn/javascript-platforms', e: "Use JavaScript where it runs: the DOM, events and browser APIs, networking from the browser, Node.js and its core modules, npm and the tooling around it, professional debugging, and Git." },
    { g: 'Learn', t: "Course: TypeScript", p: '/learn/typescript', e: "Add a type system to JavaScript: what TypeScript is and is not, everyday types and inference, unions and narrowing, interfaces, generics, classes, modules, tsconfig, and where types stop and runtime validation begins." },
    { g: 'Learn', t: "Course: Backend engineering", p: '/learn/backend', e: "How backends work, framework-free: HTTP in depth, typed Node.js, the BookStore API in TypeScript with PostgreSQL and authentication, layered API design, testing strategies, and the building blocks every backend needs: caches, queues and file storage." },
    { g: 'Learn', t: "Course: Software design and architecture", p: '/learn/software-architecture', e: "Give code a shape that survives growth: design principles, SOLID and design patterns solving real problems, layered and clean architecture, architecture styles, and a small framework you build yourself so no framework is magic." },
    { g: 'Learn', t: "Course: ZudoJS fundamentals", p: '/learn/zudo-fundamentals', e: "Enter ZudoJS knowing what it abstracts: its package architecture, the CLI, the anatomy of a project, the core, runtime and lifecycle, shared types and constants, dependency injection, configuration, errors, HTTP, middleware, schemas and validation." },
    { g: 'Learn', t: "Course: ZudoJS application development", p: '/learn/zudo-applications', e: "Build real applications: security primitives, cryptography, authentication, OAuth and permissions, databases, transactions, storage and uploads, caching, OpenAPI, and type-safe application design." },
    { g: 'Learn', t: "Course: ZudoJS advanced systems", p: '/learn/zudo-advanced', e: "Events, messages and CQRS, queues and schedulers, serialization, RPC and API operations, adapters, plugins, feature flags and tenancy, then testing, logging, observability and documentation infrastructure." },
    { g: 'Learn', t: "Course: ZudoJS architecture", p: '/learn/zudo-architecture', e: "Build the same application as a monolith, a modular monolith and microservices, then build event-driven and full CQRS systems, and compare the trade-offs honestly." },
    { g: 'Learn', t: "Course: Production engineering", p: '/learn/production', e: "Take a ZudoJS application to production: the production checklist, a security review, performance diagnosis, deployment with Docker, and a CI/CD pipeline." },
    { g: 'Learn', t: "Course: Real-world projects and capstone", p: '/learn/capstone', e: "Real applications built end to end with ZudoJS: a REST API, an authentication platform, a payment system, a multi-tenant SaaS, a background processing system and a microservice platform, then the capstones." },
    { g: 'Learn', t: "Welcome to ZudoJS Academy (Programming thinking 1)", p: '/learn/welcome', e: "What ZudoJS Academy is, who it is for, its six tracks and 19 levels, the projects you build, how the pages work, and where you should start." },
    { g: 'Learn', t: "Your developer environment (Programming thinking 2)", p: '/learn/dev-environment', e: "Meet the tools a developer uses every day, the terminal, a code editor and the browser's developer tools, and learn to move around your files by typing commands." },
    { g: 'Learn', t: "How programs run (Programming thinking 3)", p: '/learn/how-programs-run', e: "What happens between the code you type and the result on the screen, what JavaScript engines and runtimes are, and the difference between a syntax error and a runtime error." },
    { g: 'Learn', t: "How the web works (Programming thinking 4)", p: '/learn/how-the-web-works', e: "Follow a request from your browser to a server and back, and learn what clients, servers, IP addresses, DNS, ports, HTTP, HTTPS, APIs and databases are." },
    { g: 'Learn', t: "What programming is (Programming thinking 5)", p: '/learn/think-programming', e: "Learn what programs, instructions and algorithms are, see every program as input, processing and output, and solve a real problem with the problem-solving loop." },
    { g: 'Learn', t: "Breaking problems down (Programming thinking 6)", p: '/learn/think-decomposition', e: "Split a problem as big as \"build a bank\" into pieces small enough to solve, order them by dependency, and build a money transfer from small, tested steps." },
    { g: 'Learn', t: "Algorithms (Programming thinking 7)", p: '/learn/think-algorithms', e: "Learn what makes a method an algorithm, the three shapes every algorithm is built from, and the everyday algorithms for searching, counting, filtering, transforming and sorting." },
    { g: 'Learn', t: "Pseudocode and flowcharts (Programming thinking 8)", p: '/learn/think-pseudocode', e: "Write an algorithm as pseudocode and as a flowchart, trace it by hand, find its missing paths, and translate it line by line into working JavaScript." },
    { g: 'Learn', t: "Boolean logic (Programming thinking 9)", p: '/learn/logic-boolean', e: "Reduce program decisions to true and false, combine them with AND, OR, NOT and XOR, and let a loop build truth tables that check every case for you." },
    { g: 'Learn', t: "Conditional reasoning (Programming thinking 10)", p: '/learn/logic-conditions', e: "Turn written business rules into exact conditions, invert and simplify them safely with De Morgan's laws, and restructure them as guard clauses that explain every refusal." },
    { g: 'Learn', t: "Sets (Programming thinking 11)", p: '/learn/logic-sets', e: "Reason about groups of things with sets: remove duplicates, test membership, and combine permissions, tags and mailing lists with union, intersection, difference and subsets." },
    { g: 'Learn', t: "Mathematical reasoning (Programming thinking 12)", p: '/learn/logic-math', e: "Use expressions, functions, equations, ratios and percentages to compute discounts, VAT and interest, and keep money exact by counting in kobo instead of decimals." },
    { g: 'Learn', t: "Problem workshop: beginner (Programming thinking 13)", p: '/learn/solve-beginner', e: "Solve ten everyday problems, from even or odd to a tax calculator, by reasoning about inputs, outputs and edge cases first, then coding and testing each one." },
    { g: 'Learn', t: "Problem workshop: intermediate (Programming thinking 14)", p: '/learn/solve-intermediate', e: "Solve eight problems on lists of real data, from duplicate payments to stock levels, reasoning about edge cases and the amount of work first, then coding and testing." },
    { g: 'Learn', t: "Why doesn't this work? (Programming thinking 15)", p: '/learn/solve-broken', e: "Diagnose broken algorithms that run without errors but give wrong answers, using trace tables, predictions and boundary tests, then fix each root cause." },
    { g: 'Learn', t: "Meet JavaScript (JavaScript fundamentals 1)", p: '/learn/js-intro', e: "Learn where JavaScript comes from, who decides how it changes, how to tell which features you can use, and the syntax rules every line of code follows." },
    { g: 'Learn', t: "Set up your computer (JavaScript fundamentals 2)", p: '/learn/setup', e: "Install Node.js, try JavaScript in the Node.js REPL, write and run your first program, and turn its folder into a project." },
    { g: 'Learn', t: "Values, variables and types (JavaScript fundamentals 3)", p: '/learn/js-values', e: "Store values in variables with const and let, meet the seven primitive types, and learn how JavaScript handles text, numbers, true and false, and \"no value\"." },
    { g: 'Learn', t: "Operators (JavaScript fundamentals 4)", p: '/learn/js-operators', e: "Calculate, compare and combine values with JavaScript's operators, give missing values safe defaults with ?? and ?., and avoid the classic precedence traps." },
    { g: 'Learn', t: "Making decisions (JavaScript fundamentals 5)", p: '/learn/js-conditions', e: "Let your program choose what to do with if, else if and else, the ternary operator and switch, and keep decisions readable with guard clauses." },
    { g: 'Learn', t: "Loops (JavaScript fundamentals 6)", p: '/learn/js-loops', e: "Repeat work with for, while, do...while, for...of and for...in, control a loop with break and continue, and build a number guessing game." },
    { g: 'Learn', t: "Functions (JavaScript fundamentals 7)", p: '/learn/js-functions', e: "Package logic into reusable functions, pass values in and get results out, pass functions to other functions, and meet scope, closures and recursion." },
    { g: 'Learn', t: "Arrays (JavaScript fundamentals 8)", p: '/learn/js-arrays', e: "Keep ordered lists in arrays, add and remove items, search them, and transform them with map, filter, reduce and sort, then build a small student management system." },
    { g: 'Learn', t: "Objects and JSON (JavaScript fundamentals 9)", p: '/learn/js-data', e: "Group related values into objects, read and change their properties, copy and take them apart safely, and turn them into JSON, the text format every API speaks." },
    { g: 'Learn', t: "Objects in depth (JavaScript fundamentals 10)", p: '/learn/js-objects-deep', e: "Control exactly how an object behaves: lock its shape, validate writes with setters, hide fields, copy it safely and compare it, by building a bank account that cannot be broken." },
    { g: 'Learn', t: "Modern JavaScript (JavaScript fundamentals 11)", p: '/learn/js-modern', e: "Take a piece of old-style JavaScript and rewrite it step by step with the modern syntax a backend uses every day, fixing real bugs on the way." },
    { g: 'Learn', t: "Scope and how code runs (JavaScript fundamentals 12)", p: '/learn/js-scope', e: "Learn where a name can be used, how closures remember values, why some names exist before their line runs, and how the call stack and the heap work, so you can read error messages and debug real programs." },
    { g: 'Learn', t: "Closures in depth (JavaScript fundamentals 13)", p: '/learn/js-closures', e: "See how closures really work through lexical environments, then use them for private state, function factories, memoization and cleanup, without leaking memory." },
    { g: 'Learn', t: "Recursion (JavaScript fundamentals 14)", p: '/learn/js-recursion', e: "Solve problems on nested data of any depth by letting a function call itself: folder sizes, comment threads and org charts, then make it safe against deep and circular data." },
    { g: 'Learn', t: "this, prototypes and classes (JavaScript fundamentals 15)", p: '/learn/js-classes', e: "Understand what this means inside a method and why it gets lost, how objects share methods through prototypes, and how to write classes with private fields, getters, static methods and inheritance." },
    { g: 'Learn', t: "Handling errors (JavaScript fundamentals 16)", p: '/learn/js-errors', e: "Tell syntax, runtime and logic errors apart, throw and catch errors, read an Error object's name, message, cause and stack, write your own error classes, and turn errors into safe API answers." },
    { g: 'Learn', t: "Asynchronous JavaScript (JavaScript fundamentals 17)", p: '/learn/js-async', e: "Learn why a backend waits without blocking, how callbacks, promises and async/await work, how errors travel through asynchronous code, and how to run work in sequence or in parallel." },
    { g: 'Learn', t: "Modules (JavaScript fundamentals 18)", p: '/learn/js-modules', e: "Split a program into files with ES modules, understand the older CommonJS require, choose between named and default exports, and avoid circular dependencies." },
    { g: 'Learn', t: "Big O and complexity (Algorithms and data structures 1)", p: '/learn/dsa-complexity', e: "Measure how code grows with its input: count steps, state time and space complexity in Big O, Ω and Θ, spot hidden loops and see why push is cheap." },
    { g: 'Learn', t: "Arrays and strings under the hood (Algorithms and data structures 2)", p: '/learn/dsa-arrays-strings', e: "Learn what array and string operations really cost, from indexing to shift and string building, then solve reverse, palindrome, anagram and rotate with tests." },
    { g: 'Learn', t: "Trees and binary search trees (Algorithms and data structures 3)", p: '/learn/dsa-trees', e: "Turn flat category rows into a tree, walk it four ways, then build, test and balance a binary search tree of orders, with the cost of every operation." },
    { g: 'Learn', t: "Heaps and priority queues (Algorithms and data structures 4)", p: '/learn/dsa-heaps', e: "Build a binary heap on a plain array, use it as a priority job queue, then sort with it, find the top-k products and merge sorted order lists." },
    { g: 'Learn', t: "Graphs and topological sort (Algorithms and data structures 5)", p: '/learn/dsa-graphs', e: "Model packages, roads between cities and followers as graphs, store them as adjacency lists, and compute a safe install order with topological sort." },
    { g: 'Learn', t: "What Node.js is (JavaScript in the browser and on the server 1)", p: '/learn/node-runtime', e: "Learn what Node.js adds to JavaScript, how its event loop decides what runs next, and how a program talks to the computer through process, exit codes and environment variables." },
    { g: 'Learn', t: "Files, paths and your computer (JavaScript in the browser and on the server 2)", p: '/learn/node-apis', e: "Use Node.js's built-in modules to build safe file paths, read and write files and folders, learn about the computer, make random ids and hashes, and announce events. Then save tasks to a JSON file." },
    { g: 'Learn', t: "Streams and buffers (JavaScript in the browser and on the server 3)", p: '/learn/node-streams', e: "Learn what the bytes behind text really are, then handle data piece by piece with readable, writable and transform streams, pipeline and readline, so a program can process files far bigger than its memory." },
    { g: 'Learn', t: "npm and packages (JavaScript in the browser and on the server 4)", p: '/learn/npm-packages', e: "Install, update and remove packages with npm, read package.json and package-lock.json, understand version ranges, write npm scripts, share code with workspaces, see what publishing would send, and keep the packages you install safe." },
    { g: 'Learn', t: "An HTTP server with no framework (JavaScript in the browser and on the server 5)", p: '/learn/node-http', e: "Build a web server with nothing but Node.js's node:http module. Read the method, path, headers, query and body of each request, send JSON back with the right status code, and route requests by hand." },
    { g: 'Learn', t: "Build a plain Node.js Task API (JavaScript in the browser and on the server 6)", p: '/learn/node-task-api', e: "Finish a complete Task API with no framework, split into modules, with middleware, centralized error handling, API-key protection and configuration from the environment. Then look honestly at what hurts when it grows to 20,000 lines." },
    { g: 'Learn', t: "Git and GitHub (JavaScript in the browser and on the server 7)", p: '/learn/git', e: "Track every change to your code with Git, work on branches, merge them and resolve a real conflict, keep node_modules and secrets out of your repository, and share your work through GitHub with remotes and pull requests." },
    { g: 'Learn', t: "Why TypeScript exists (TypeScript 1)", p: '/learn/ts-setup', e: "See a bug that JavaScript runs without complaint, install TypeScript, write a tsconfig.json, and learn the three ways to run TypeScript on Node.js 24." },
    { g: 'Learn', t: "What the TypeScript compiler does (TypeScript 2)", p: '/learn/ts-compiler', e: "Follow a TypeScript file through tsc: checking, type erasure, transpiling to older JavaScript, emitted files, watch mode and Node's type stripping." },
    { g: 'Learn', t: "Basic types (TypeScript 3)", p: '/learn/ts-types', e: "The everyday types of TypeScript - strings, numbers, booleans, arrays, tuples and object types - plus any vs unknown, null and undefined under strict mode, void, and never for exhaustive checks." },
    { g: 'Learn', t: "Type inference in depth (TypeScript 4)", p: '/learn/ts-inference', e: "Learn how TypeScript works out types you never wrote - literal types, widening, contextual typing, inferred returns - and decide where an annotation really pays off." },
    { g: 'Learn', t: "Typing functions (TypeScript 5)", p: '/learn/ts-functions', e: "Give functions parameter and return types, use optional, default and rest parameters, describe functions and callbacks as types, type async functions with Promise, and meet overloads." },
    { g: 'Learn', t: "Interfaces, unions and literal types (TypeScript 6)", p: '/learn/ts-objects', e: "Name object shapes with interfaces and type aliases, mark properties optional or readonly, extend and combine shapes, and model data that can take several forms with unions, literal types and discriminated unions." },
    { g: 'Learn', t: "Narrowing (TypeScript 7)", p: '/learn/ts-narrowing', e: "Turn wide union and unknown types into precise ones with typeof, truthiness, equality, in, instanceof, discriminants, type guards and assertion functions, and learn where narrowing lies." },
    { g: 'Learn', t: "Type assertions (TypeScript 8)", p: '/learn/ts-assertions', e: "Learn what as, angle-bracket assertions, as unknown as and the non-null ! really do, see why none of them check or convert anything, and replace them with safer tools." },
    { g: 'Learn', t: "Enums and their alternatives (TypeScript 9)", p: '/learn/ts-enums', e: "Write numeric, string and const enums, read the exact JavaScript tsc emits for each, learn the pitfalls and erasableSyntaxOnly, and replace enums with unions and as const objects." },
    { g: 'Learn', t: "Generics (TypeScript 10)", p: '/learn/ts-generics', e: "Write one function, interface or class that works for many types without losing type safety, set rules with constraints and keyof, give type parameters defaults, and build a Result type and a generic repository." },
    { g: 'Learn', t: "Advanced and utility types (TypeScript 11)", p: '/learn/ts-advanced', e: "Build new types from existing ones with keyof, typeof, indexed access, mapped, conditional and template literal types, and use the built-in utility types (Partial, Pick, Omit, Record, ReturnType, Awaited and more) to keep one source of truth." },
    { g: 'Learn', t: "Classes in TypeScript (TypeScript 12)", p: '/learn/ts-classes', e: "Declare typed class properties, use parameter properties and access modifiers, compare private with #private, write abstract classes and classes that implement interfaces, and wire classes together with constructor injection." },
    { g: 'Learn', t: "Modules in TypeScript (TypeScript 13)", p: '/learn/ts-modules', e: "Split a TypeScript project into files, import types with import type, see why verbatimModuleSyntax exists, write .js in import paths, and understand how NodeNext resolution, \"type\" - \"module\" and the \"exports\" field fit together." },
    { g: 'Learn', t: "TypeScript and JavaScript together (TypeScript 14)", p: '/learn/ts-runtime', e: "See exactly what TypeScript becomes when it runs, why types cannot check outside data, and how to close that gap by hand with type guards, assertion functions and a validator that returns a Result." },
    { g: 'Learn', t: "HTTP in depth (Backend engineering 1)", p: '/learn/http-deep', e: "See the exact bytes of an HTTP request and response, then learn the parts every backend developer uses daily: headers, cookies, content types, methods and status codes." },
    { g: 'Learn', t: "Designing a REST API (Backend engineering 2)", p: '/learn/rest-design', e: "Turn the Task API into a well-designed REST API: resources and URLs, a written contract, filtering, sorting, offset and cursor pagination, versioning and one consistent error format." },
    { g: 'Learn', t: "How databases work (Backend engineering 3)", p: '/learn/databases', e: "Why a backend keeps its data in a database, how relational databases organise it into tables and relationships, and what keys, constraints, indexes, transactions and migrations do, with real PostgreSQL running inside Node.js." },
    { g: 'Learn', t: "SQL with PostgreSQL (Backend engineering 4)", p: '/learn/sql-basics', e: "Install PostgreSQL with an installer or with Docker, talk to it with psql, and learn the SQL every backend uses: create, insert, select, update and delete, with filters, sorting and paging, and parameterized queries that stop SQL injection." },
    { g: 'Learn', t: "Joins, grouping and transactions (Backend engineering 5)", p: '/learn/sql-advanced', e: "Combine tables with joins, summarise data with group by and aggregates, filter groups with having, nest queries, control transactions yourself, measure queries with explain analyze, and connect Node.js to a real PostgreSQL server." },
    { g: 'Learn', t: "Testing fundamentals (Backend engineering 6)", p: '/learn/testing-basics', e: "Why automated tests matter, the difference between unit, integration and end-to-end tests, and how to write them with node:assert and Node's built-in test runner, including mocks, spies, isolated tests and a fresh test database. Then the same tests in Vitest." },
    { g: 'Learn', t: "\"BookStore API: HTTP and routing\" (Backend engineering 7)", p: '/learn/bookstore-http', e: "Start a TypeScript backend with no framework at all. Set up the folder, read configuration from the environment, write a small typed router, JSON helpers and error responses, and serve books and authors over HTTP." },
    { g: 'Learn', t: "\"BookStore API: validation and PostgreSQL\" (Backend engineering 8)", p: '/learn/bookstore-data', e: "Check every request body by hand with type guards, move the BookStore data into PostgreSQL with PGlite, write repositories with parameterized SQL, and map typed errors to 400, 404 and 409." },
    { g: 'Learn', t: "\"BookStore API: authentication and tests\" (Backend engineering 9)", p: '/learn/bookstore-auth', e: "Add users to the BookStore. Hash passwords with scrypt, issue signed log-in tokens with a secret from the environment, protect the order routes, test it all with node:test, and then look honestly at what this hand-built backend now gets wrong." },
    { g: 'Learn', t: "Backend architecture (Software design and architecture 1)", p: '/learn/backend-architecture', e: "Give backend code a shape. Learn controllers, services, repositories, models and DTOs, middleware, dependency injection and configuration, the difference between domain, application and infrastructure code, and which way dependencies must point. Then refactor the BookStore's orders into those layers." },
    { g: 'Learn', t: "What a framework does (Software design and architecture 2)", p: '/learn/frameworks', e: "The difference between a library and a framework, inversion of control, and the jobs a backend framework takes over: lifecycle, dependency injection, routing, configuration, validation, database access, testing and application structure. Build a tiny framework to see how it works inside." },
    { g: 'Learn', t: "Welcome to ZudoJS (ZudoJS fundamentals 1)", p: '/learn/zudo-welcome', e: "What ZudoJS is, how its packages are layered, what each of its packages is for, what the zudojs command-line tool does, and the three application shapes it can create. Then run three ZudoJS packages together in your browser." },
    { g: 'Learn', t: "Your first Zudo code (ZudoJS fundamentals 2)", p: '/learn/zudo-first-code', e: "Install your first ZudoJS packages, check untrusted data at runtime with @zudojs/schema, and report failures with the ready-made errors in @zudojs/errors." },
    { g: 'Learn', t: "Create the Task API project (ZudoJS fundamentals 3)", p: '/learn/zudo-create-project', e: "Install the ZudoJS command-line tool, create the Task API project with flags or by answering its questions, start it in development, find your way around the files, use every CLI command, and build and run it for production." },
    { g: 'Learn', t: "The application runtime and lifecycle (ZudoJS fundamentals 4)", p: '/learn/zudo-runtime', e: "Learn how the ZudoJS runtime starts the parts of your application in dependency order, rolls back when startup fails, reports readiness, and shuts everything down gracefully." },
    { g: 'Learn', t: "Dependency injection with @zudojs/container (ZudoJS fundamentals 5)", p: '/learn/zudo-container', e: "Let a container build and share your services. Learn tokens, class, factory and value providers, the singleton, scoped and transient lifetimes, circular dependency detection, disposal, and swapping real services for fakes in tests." },
    { g: 'Learn', t: "Routes, requests and responses (ZudoJS fundamentals 6)", p: '/learn/zudo-http', e: "Serve the Task API over HTTP with @zudojs/http. Start a server, add routes with parameters, read query strings, headers, cookies and JSON bodies safely, and answer with the right status codes." },
    { g: 'Learn', t: "Middleware, CORS, security headers and graceful shutdown (ZudoJS fundamentals 7)", p: '/learn/zudo-middleware', e: "Wrap every Task API route in middleware. Learn how a middleware pipeline runs, then add security headers, a CORS allow-list, rate limits with @zudojs/security, and a graceful shutdown that lets requests in progress finish." },
    { g: 'Learn', t: "Configuration (ZudoJS fundamentals 8)", p: '/learn/zudo-config', e: "Keep settings out of the code with @zudojs/config. Layer defaults, a config file and environment variables by priority, validate the result with a schema, keep secrets out of logs, and make the Task API's generated configuration stricter in production than in development." },
    { g: 'Learn', t: "Schemas and validation in depth (ZudoJS fundamentals 9)", p: '/learn/zudo-validation', e: "Validate everything that crosses the Task API's boundary with @zudojs/schema. Read issues, coerce query strings, transform and refine values, block unknown fields, validate requests in routes and responses on the way out, and guard against hostile JSON with @zudojs/validation." },
    { g: 'Learn', t: "The ZudoJS error system (ZudoJS fundamentals 10)", p: '/learn/zudo-errors', e: "Handle failures the ZudoJS way. Tell expected errors from bugs, use and extend the error classes in @zudojs/errors, choose codes and categories, serialize errors safely for clients and fully for logs, and turn every error in the Task API into the right HTTP response." },
    { g: 'Learn', t: "Databases with @zudojs/database (ZudoJS application development 1)", p: '/learn/zudo-database', e: "Connect the Task API to PostgreSQL through @zudojs/database, with migrations, seeds, a repository, a query builder, pagination, transactions and health checks, all running against real PostgreSQL." },
    { g: 'Learn', t: "Storage abstractions (ZudoJS application development 2)", p: '/learn/zudo-storage', e: "Use @zudojs/storage's driver-independent contracts for databases, files, serialization, locks, connection pools and start-up and shutdown, with a PostgreSQL adapter and local file storage for the Task API." },
    { g: 'Learn', t: "Transactions (ZudoJS application development 3)", p: '/learn/zudo-transactions', e: "Coordinate transactions across many functions with @zudojs/transactions, with context that follows your code through AsyncLocalStorage, rollbacks, savepoints, after-commit hooks, retries, timeouts and rollback-only state, against real PostgreSQL." },
    { g: 'Learn', t: "Authentication (ZudoJS application development 4)", p: '/learn/zudo-auth', e: "Let users log in to the Task API. Hash passwords, issue and check JWTs, keep server-side sessions with a real logout, protect routes in @zudojs/http, and stop password guessing with lockouts and rate limits, using @zudojs/auth and @zudojs/crypto." },
    { g: 'Learn', t: "Sign in with OAuth (ZudoJS application development 5)", p: '/learn/zudo-oauth', e: "Add \"Sign in with Google\" to the Task API with @zudojs/auth-oauth. Learn the OAuth 2 authorization code flow, state and PKCE, the provider presets, and the callback, all tested offline against a stand-in provider." },
    { g: 'Learn', t: "Permissions (ZudoJS application development 6)", p: '/learn/zudo-permissions', e: "Decide what each logged-in user may do with @zudojs/permissions. Roles, resource:action permissions, wildcards, role hierarchy, owner rules, deny rules, policies and explain mode, and the mistakes that let a normal user become an admin." },
    { g: 'Learn', t: "Security for every public API (ZudoJS application development 7)", p: '/learn/zudo-security', e: "Protect the Task API from the open internet with @zudojs/security and the security helpers in @zudojs/http. Rate limiting, CORS, CSRF, security headers, HSTS and CSP, secure cookies, body limits, SSRF protection and input checks, each shown blocking a real attack." },
    { g: 'Learn', t: "Caching (ZudoJS application development 8)", p: '/learn/zudo-cache', e: "Keep copies of slow results so the Task API can answer again fast. Learn keys, TTL, namespaces, tags and invalidation, stampede protection, locks and cache metrics with @zudojs/cache." },
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
    { g: 'Learn', t: "Structured logging (ZudoJS advanced systems 11)", p: '/learn/zudo-logging', e: "Replace console.log with structured log entries that a program can search. Levels, child loggers, request ids, request and error logging, secret redaction and JSON logs for production with @zudojs/logger." },
    { g: 'Learn', t: "Observability (ZudoJS advanced systems 12)", p: '/learn/zudo-observability', e: "See inside a running Task API. Metrics count what happens, traces show where the time goes, and logs, metrics and traces share one trace id across requests and services, with @zudojs/observability." },
    { g: 'Learn', t: "Feature flags (ZudoJS advanced systems 13)", p: '/learn/zudo-feature-flags', e: "Turn features on and off without deploying. Rules, evaluation context, percentage rollouts, A/B variants, kill switches and browser snapshots with @zudojs/feature-flags." },
    { g: 'Learn', t: "Multi-tenancy (ZudoJS advanced systems 14)", p: '/learn/zudo-tenancy', e: "Serve many companies from one Task API without ever mixing their data. Tenant ids, resolvers and trust levels, resolver chains, AsyncLocalStorage context and tenant-scoped queries with @zudojs/tenancy." },
    { g: 'Learn', t: "Plugins (ZudoJS advanced systems 15)", p: '/learn/zudo-plugins', e: "Let other code extend the Task API without editing it. Write plugins, declare dependencies, run their lifecycle, give each one a scoped context, roll back failed starts, read diagnostics and publish a plugin to npm with @zudojs/plugins." },
    { g: 'Learn', t: "From monolith to modular monolith (ZudoJS architecture 1)", p: '/learn/zudo-modular-monolith', e: "Split one growing application into modules with clear boundaries. Each module has a small public API, owns its data, and talks to the others through that API, events and commands, all inside one deployable app." },
    { g: 'Learn', t: "Microservices (ZudoJS architecture 2)", p: '/learn/zudo-microservices', e: "Why some teams split one application into many services, why you should not start that way, and how services find and call each other, stay consistent without distributed transactions, survive failures and stay observable." },
    { g: 'Learn', t: "Production engineering (Production engineering 1)", p: '/learn/production-engineering', e: "What changes when real users depend on your app. A checklist for configuration, secrets, logs, metrics, traces, health and readiness checks, graceful shutdown, timeouts, rate limits, caching and database performance, with a small runnable proof for each item." },
    { g: 'Learn', t: "Deploying a ZudoJS app (Production engineering 2)", p: '/learn/deployment', e: "Take the Task API from your computer to a server. Build it for production, run it under systemd or in Docker, add PostgreSQL and Redis with Docker Compose, put Caddy in front for HTTPS, run migrations during a deployment, read the logs and back up the database." },
    { g: 'Learn', t: "Capstone: ShopFlow (Real-world projects and capstone 1)", p: '/learn/capstone-shopflow', e: "The final project. Plan and build ShopFlow, a small online shop, with ZudoJS. A complete, runnable core for accounts, products and a checkout that never oversells, followed by milestones with acceptance criteria that take it to a modular monolith and then to services." },
    { g: 'Learn', t: "Final production challenge (Real-world projects and capstone 2)", p: '/learn/final-challenge', e: "Someone else's gift-card feature works in the demo and fails everything else. Find its architectural problems, then make it production-ready step by step, with acceptance criteria, hints and worked solutions for the key fixes." },
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
