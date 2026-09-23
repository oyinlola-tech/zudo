/**
 * Zudo Terminal Playground
 * A docked terminal for writing and running TypeScript in the browser.
 *
 *  - Live syntax highlighting (overlay technique, no dependencies)
 *  - TypeScript compiled on demand via Babel standalone (lazy-loaded on first run)
 *  - Top-level await, console capture, timing, structured output
 *  - Resizable, maximizable, side-by-side layout, persisted between visits
 *
 * Public API: window.ZudoPlayground { open, close, toggle, load(code, name), run }
 * Shortcut:   Ctrl+`  toggle   ·   Ctrl+Enter  run   ·   Esc  close
 */
(function () {
  'use strict';

  var BABEL_URL = 'https://cdnjs.cloudflare.com/ajax/libs/babel-standalone/7.26.4/babel.min.js';
  var LS = { code: 'zudo.pg.code', size: 'zudo.pg.size', layout: 'zudo.pg.layout', example: 'zudo.pg.example' };

  /* ======================================================================
     Examples — plain TypeScript that mirrors Zudo's patterns
     ====================================================================== */

  var EXAMPLES = [
    {
      id: 'hello', name: 'Hello, Zudo', file: 'hello.ts',
      code: [
        '// Zudo playground — TypeScript, compiled in your browser.',
        '// Press Ctrl+Enter (or Run) to execute. Try editing anything.',
        '',
        'type Greeting = { name: string; framework: "Zudo" };',
        '',
        'const greet = ({ name, framework }: Greeting): string =>',
        '  `Hello, ${name}. Welcome to ${framework}.`;',
        '',
        'console.log(greet({ name: "Developer", framework: "Zudo" }));',
        '',
        'const packages = ["core", "http", "container", "auth"];',
        'console.info(`${packages.length} packages loaded:`, packages);',
        '',
        '// Top-level await works too.',
        'await new Promise((r) => setTimeout(r, 120));',
        'console.log("Ready.");',
      ].join('\n'),
    },
    {
      id: 'result', name: 'Typed Result', file: 'result.ts',
      code: [
        '// Zudo returns Results instead of throwing across boundaries.',
        'type Ok<T>  = { ok: true;  value: T };',
        'type Err<E> = { ok: false; error: E };',
        'type Result<T, E = Error> = Ok<T> | Err<E>;',
        '',
        'const ok  = <T,>(value: T): Ok<T> => ({ ok: true, value });',
        'const err = <E,>(error: E): Err<E> => ({ ok: false, error });',
        '',
        'function parsePort(raw: string): Result<number, string> {',
        '  const n = Number(raw);',
        '  if (!Number.isInteger(n)) return err(`"${raw}" is not an integer`);',
        '  if (n < 1 || n > 65535) return err(`${n} is out of range`);',
        '  return ok(n);',
        '}',
        '',
        'for (const input of ["3000", "80.5", "99999"]) {',
        '  const result = parsePort(input);',
        '  if (result.ok) console.log("port =", result.value);',
        '  else console.warn("invalid:", result.error);',
        '}',
      ].join('\n'),
    },
    {
      id: 'container', name: 'DI container', file: 'container.ts',
      code: [
        '// A miniature token-based container, the shape @zudojs/container uses.',
        'class Token<T> { constructor(public readonly name: string) {} }',
        'type Factory<T> = (c: Container) => T;',
        'type Scope = "singleton" | "transient";',
        '',
        'class Container {',
        '  private factories = new Map<Token<any>, { make: Factory<any>; scope: Scope }>();',
        '  private cache = new Map<Token<any>, unknown>();',
        '',
        '  register<T>(token: Token<T>, make: Factory<T>, scope: Scope = "singleton") {',
        '    this.factories.set(token, { make, scope });',
        '    return this;',
        '  }',
        '',
        '  resolve<T>(token: Token<T>): T {',
        '    const entry = this.factories.get(token);',
        '    if (!entry) throw new Error(`No provider for ${token.name}`);',
        '    if (entry.scope === "transient") return entry.make(this);',
        '    if (!this.cache.has(token)) this.cache.set(token, entry.make(this));',
        '    return this.cache.get(token) as T;',
        '  }',
        '}',
        '',
        'const LOGGER = new Token<{ log: (m: string) => void }>("Logger");',
        'const CLOCK  = new Token<() => number>("Clock");',
        '',
        'const c = new Container()',
        '  .register(LOGGER, () => ({ log: (m) => console.log("[app]", m) }))',
        '  .register(CLOCK, () => () => Date.now(), "transient");',
        '',
        'c.resolve(LOGGER).log("resolved a singleton");',
        'console.log("same instance:", c.resolve(LOGGER) === c.resolve(LOGGER));',
        'console.log("clock:", c.resolve(CLOCK)());',
        'c.resolve(new Token("Missing"));',
      ].join('\n'),
    },
    {
      id: 'events', name: 'Event bus', file: 'events.ts',
      code: [
        '// Typed events with middleware, like @zudojs/events.',
        'type Events = {',
        '  "user.created": { id: string; email: string };',
        '  "order.paid":   { orderId: string; amount: number };',
        '};',
        '',
        'type Handler<E> = (payload: E) => void | Promise<void>;',
        '',
        'class EventBus {',
        '  private handlers: { [K in keyof Events]?: Handler<Events[K]>[] } = {};',
        '',
        '  on<K extends keyof Events>(name: K, handler: Handler<Events[K]>) {',
        '    (this.handlers[name] ??= []).push(handler);',
        '  }',
        '',
        '  async emit<K extends keyof Events>(name: K, payload: Events[K]) {',
        '    console.debug("emit", name, payload);',
        '    for (const h of this.handlers[name] ?? []) await h(payload);',
        '  }',
        '}',
        '',
        'const bus = new EventBus();',
        'bus.on("user.created", ({ email }) => console.log("send welcome email to", email));',
        'bus.on("order.paid", async ({ orderId, amount }) => {',
        '  await new Promise((r) => setTimeout(r, 50));',
        '  console.log(`order ${orderId} settled: $${amount.toFixed(2)}`);',
        '});',
        '',
        'await bus.emit("user.created", { id: "u_1", email: "dev@example.com" });',
        'await bus.emit("order.paid", { orderId: "o_42", amount: 19.5 });',
      ].join('\n'),
    },
    {
      id: 'lifecycle', name: 'Lifecycle', file: 'lifecycle.ts',
      code: [
        '// Every Zudo component moves through an explicit lifecycle.',
        'type State = "registered" | "initialized" | "started" | "stopped" | "disposed";',
        '',
        'class Component {',
        '  state: State = "registered";',
        '  constructor(public name: string, private delay = 30) {}',
        '',
        '  private async transition(to: State) {',
        '    await new Promise((r) => setTimeout(r, this.delay));',
        '    console.log(`${this.name.padEnd(9)} ${this.state} → ${to}`);',
        '    this.state = to;',
        '  }',
        '  init()    { return this.transition("initialized"); }',
        '  start()   { return this.transition("started"); }',
        '  stop()    { return this.transition("stopped"); }',
        '  dispose() { return this.transition("disposed"); }',
        '}',
        '',
        'const components = [new Component("database"), new Component("cache"), new Component("http")];',
        '',
        'for (const c of components) await c.init();',
        'for (const c of components) await c.start();',
        '',
        'console.info("app is running");',
        '',
        '// Stop in reverse order, then dispose.',
        'for (const c of [...components].reverse()) await c.stop();',
        'for (const c of components) await c.dispose();',
        '',
        'console.table(components.map((c) => ({ component: c.name, state: c.state })));',
      ].join('\n'),
    },
    {
      id: 'middleware', name: 'Middleware pipeline', file: 'middleware.ts',
      code: [
        '// Composable middleware, the pattern behind @zudojs/middleware.',
        'type Ctx = { path: string; user?: string; status?: number; body?: unknown };',
        'type Next = () => Promise<void>;',
        'type Middleware = (ctx: Ctx, next: Next) => Promise<void>;',
        '',
        'const compose = (stack: Middleware[]) => (ctx: Ctx) => {',
        '  const run = (i: number): Promise<void> =>',
        '    i < stack.length ? stack[i](ctx, () => run(i + 1)) : Promise.resolve();',
        '  return run(0);',
        '};',
        '',
        'const timing: Middleware = async (ctx, next) => {',
        '  const t = performance.now();',
        '  await next();',
        '  console.debug(`${ctx.path} took ${(performance.now() - t).toFixed(2)}ms`);',
        '};',
        '',
        'const auth: Middleware = async (ctx, next) => {',
        '  if (ctx.path.startsWith("/admin") && !ctx.user) {',
        '    ctx.status = 401; ctx.body = { error: "unauthenticated" };',
        '    return; // short-circuit',
        '  }',
        '  await next();',
        '};',
        '',
        'const handler: Middleware = async (ctx) => {',
        '  ctx.status = 200; ctx.body = { hello: ctx.user ?? "anonymous" };',
        '};',
        '',
        'const app = compose([timing, auth, handler]);',
        '',
        'for (const ctx of [{ path: "/" }, { path: "/admin" }, { path: "/admin", user: "ada" }] as Ctx[]) {',
        '  await app(ctx);',
        '  console.log(ctx.status, ctx.path, ctx.body);',
        '}',
      ].join('\n'),
    },
  ];

  /* ======================================================================
     Syntax highlighter
     ====================================================================== */

  /* highlight:start */
  var KEYWORDS = 'abstract|as|async|await|break|case|catch|class|const|continue|debugger|declare|default|delete|do|else|enum|export|extends|finally|for|from|function|get|if|implements|import|in|instanceof|interface|is|keyof|let|namespace|new|of|override|private|protected|public|readonly|return|satisfies|set|static|super|switch|this|throw|try|type|typeof|var|void|while|with|yield';
  var TYPES = 'string|number|boolean|unknown|any|never|void|object|symbol|bigint|null|undefined';

  var TOKEN_RE = new RegExp([
    '(\\/\\/[^\\n]*|\\/\\*[\\s\\S]*?\\*\\/)',                          // 1 comment
    '(`(?:\\\\[\\s\\S]|[^`\\\\])*`)',                                     // 2 template
    '("(?:\\\\.|[^"\\\\\\n])*"|\'(?:\\\\.|[^\'\\\\\\n])*\')',             // 3 string
    '(@[A-Za-z_$][\\w$]*)',                                               // 4 decorator
    '(\\b(?:0x[\\da-fA-F_]+|0b[01_]+|\\d[\\d_]*(?:\\.\\d[\\d_]*)?(?:[eE][+-]?\\d+)?)n?\\b)', // 5 number
    '(\\b(?:' + KEYWORDS + ')\\b)',                                       // 6 keyword
    '(\\b(?:true|false|null|undefined|NaN|Infinity)\\b|\\b[A-Z][A-Z0-9_]{2,}\\b)', // 7 constant
    '(\\b(?:' + TYPES + ')\\b|\\b[A-Z][\\w$]*\\b)',                       // 8 type / class
    '([A-Za-z_$][\\w$]*(?=\\s*\\())',                                     // 9 function call
    '((?<=\\.)[A-Za-z_$][\\w$]*)',                                        // 10 property
    '(=>|\\.\\.\\.|[+\\-*/%=<>!&|^~?:]+)',                                // 11 operator
    '([{}()\\[\\];,.])',                                                  // 12 punctuation
  ].join('|'), 'g');

  var CLASSES = [null, 't-cmt', 't-tpl', 't-str', 't-dec', 't-num', 't-kw', 't-cn', 't-ty', 't-fn', 't-prop', 't-op', 't-pn'];

  function escapeHtml(s) {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function highlightTemplate(src) {
    // colour ${...} interpolations inside template strings
    return escapeHtml(src).replace(/(\$\{)([^}]*)(\})/g, function (_, o, inner, c) {
      return '<span class="t-op">' + o + '</span><span class="t-prop">' + inner + '</span><span class="t-op">' + c + '</span>';
    });
  }

  function highlight(src) {
    var out = '';
    var last = 0;
    var m;
    TOKEN_RE.lastIndex = 0;
    while ((m = TOKEN_RE.exec(src)) !== null) {
      if (m.index > last) out += escapeHtml(src.slice(last, m.index));
      var cls = null;
      for (var g = 1; g < m.length; g++) { if (m[g] !== undefined) { cls = CLASSES[g]; break; } }
      out += cls === 't-tpl'
        ? '<span class="t-tpl">' + highlightTemplate(m[0]) + '</span>'
        : '<span class="' + cls + '">' + escapeHtml(m[0]) + '</span>';
      last = TOKEN_RE.lastIndex;
      if (m[0].length === 0) TOKEN_RE.lastIndex++;
    }
    if (last < src.length) out += escapeHtml(src.slice(last));
    return out + '\n';
  }
  /* highlight:end */

  /* ======================================================================
     Value inspector for console output
     ====================================================================== */

  /* node-inspect:start
     A port of the parts of Node's util.inspect that console.log uses, so the
     browser terminal prints values exactly as `node file.js` does. Checked
     against util.inspect by scripts/site-learn-check.mjs --inspect. */

  var INSPECT_DEFAULTS = { depth: 2, breakLength: 80, compact: 3, maxArrayLength: 100 };
  var META = ['\\x00', '\\x01', '\\x02', '\\x03', '\\x04', '\\x05', '\\x06', '\\x07', '\\b', '\\t', '\\n', '\\x0B', '\\f', '\\r',
    '\\x0E', '\\x0F', '\\x10', '\\x11', '\\x12', '\\x13', '\\x14', '\\x15', '\\x16', '\\x17', '\\x18', '\\x19', '\\x1A', '\\x1B',
    '\\x1C', '\\x1D', '\\x1E', '\\x1F'];

  function strEscape(str) {
    var quote = "'";
    if (str.indexOf("'") !== -1) {
      if (str.indexOf('"') === -1) quote = '"';
      else if (str.indexOf('`') === -1 && str.indexOf('${') === -1) quote = '`';
    }
    var out = '';
    for (var i = 0; i < str.length; i++) {
      var c = str.charCodeAt(i);
      var ch = str[i];
      if (ch === quote || ch === '\\') out += '\\' + ch;
      else if (c < 32) out += META[c];
      else if (c === 127) out += '\\x7F';
      else out += ch;
    }
    return quote + out + quote;
  }

  function repeat(s, n) { return new Array(n + 1).join(s); }

  function formatKey(key) {
    if (typeof key === 'symbol') return key.toString();
    return /^[a-zA-Z_][a-zA-Z_0-9]*$/.test(key) ? key : strEscape(key);
  }

  function ctorName(v) {
    var proto = Object.getPrototypeOf(v);
    if (proto === null) return null;
    var c = proto.constructor;
    return c && typeof c === 'function' && c.name ? c.name : 'Object';
  }

  function fnBase(v) {
    var src = '';
    try { src = Function.prototype.toString.call(v); } catch (e) {}
    if (/^class\b/.test(src)) {
      var ext = Object.getPrototypeOf(v);
      return '[class ' + (v.name || '(anonymous)') + (ext && ext.name ? ' extends ' + ext.name : '') + ']';
    }
    var kind = 'Function';
    var tag = v[Symbol.toStringTag];
    if (tag === 'AsyncFunction') kind = 'AsyncFunction';
    else if (tag === 'GeneratorFunction') kind = 'GeneratorFunction';
    else if (tag === 'AsyncGeneratorFunction') kind = 'AsyncGeneratorFunction';
    return '[' + kind + (v.name ? ': ' + v.name : ' (anonymous)') + ']';
  }

  function isBelowBreakLength(ctx, output, start, base) {
    var total = output.length + start;
    if (total + output.length > ctx.breakLength) return false;
    for (var i = 0; i < output.length; i++) {
      total += output[i].length;
      if (total > ctx.breakLength) return false;
    }
    return base === '' || base.indexOf('\n') === -1;
  }

  function groupArrayElements(ctx, output, value) {
    var totalLength = 0, maxLength = 0, i = 0;
    var outputLength = output.length;
    if (ctx.extraItems) outputLength--;
    var separatorSpace = 2;
    var dataLen = new Array(outputLength);
    for (; i < outputLength; i++) {
      var len = output[i].length;
      dataLen[i] = len;
      totalLength += len + separatorSpace;
      if (maxLength < len) maxLength = len;
    }
    var actualMax = maxLength + separatorSpace;
    if (actualMax * 3 + ctx.indentationLvl < ctx.breakLength &&
        (totalLength / actualMax > 5 || maxLength <= 6)) {
      var averageBias = Math.sqrt(actualMax - totalLength / output.length);
      var biasedMax = Math.max(actualMax - 3 - averageBias, 1);
      var columns = Math.min(
        Math.round(Math.sqrt(2.5 * biasedMax * outputLength) / biasedMax),
        Math.floor((ctx.breakLength - ctx.indentationLvl) / actualMax),
        ctx.compact * 4,
        15
      );
      if (columns <= 1) return output;
      var tmp = [];
      var maxLineLength = [];
      for (var c = 0; c < columns; c++) {
        var lineLength = 0;
        for (var j = c; j < output.length; j += columns) if (dataLen[j] > lineLength) lineLength = dataLen[j];
        maxLineLength.push(lineLength + separatorSpace);
      }
      var padStart = true;
      if (value !== undefined) {
        for (var k = 0; k < output.length; k++) {
          if (typeof value[k] !== 'number' && typeof value[k] !== 'bigint') { padStart = false; break; }
        }
      }
      for (var r = 0; r < outputLength; r += columns) {
        var max = Math.min(r + columns, outputLength);
        var str = '';
        var m = r;
        for (; m < max - 1; m++) {
          var cell = output[m] + ', ';
          var width = maxLineLength[m - r];
          str += padStart ? repeat(' ', Math.max(0, width - cell.length)) + cell : cell + repeat(' ', Math.max(0, width - cell.length));
        }
        if (padStart) {
          var w = maxLineLength[m - r] - separatorSpace;
          str += repeat(' ', Math.max(0, w - output[m].length)) + output[m];
        } else {
          str += output[m];
        }
        tmp.push(str);
      }
      if (ctx.extraItems) tmp.push(output[outputLength]);
      output = tmp;
    }
    return output;
  }

  function reduceToSingleString(ctx, output, base, braces, isArrayType, recurseTimes, value) {
    var entries = output.length;
    if (isArrayType && entries > 6) output = groupArrayElements(ctx, output, value);
    if (ctx.currentDepth - recurseTimes < ctx.compact && entries === output.length) {
      var start = output.length + ctx.indentationLvl + braces[0].length + base.length + 10;
      if (isBelowBreakLength(ctx, output, start, base)) {
        var joined = output.join(', ');
        if (joined.indexOf('\n') === -1) {
          return (base ? base + ' ' : '') + braces[0] + ' ' + joined + ' ' + braces[1];
        }
      }
    }
    var indentation = '\n' + repeat(' ', ctx.indentationLvl);
    return (base ? base + ' ' : '') + braces[0] + indentation + '  ' + output.join(',' + indentation + '  ') + indentation + braces[1];
  }

  function formatPrimitive(ctx, v) {
    var t = typeof v;
    if (t === 'string') {
      if (v.length > 16 && v.length > ctx.breakLength - ctx.indentationLvl - 4 && v.indexOf('\n') !== -1 && v.indexOf('\n') < v.length - 1) {
        var parts = v.split(/(?<=\n)/);
        return parts.map(strEscape).join(' +\n' + repeat(' ', ctx.indentationLvl + 2));
      }
      return strEscape(v);
    }
    if (t === 'number') return Object.is(v, -0) ? '-0' : String(v);
    if (t === 'bigint') return v + 'n';
    if (t === 'boolean') return String(v);
    if (t === 'undefined') return 'undefined';
    return v.toString();
  }

  function formatProperty(ctx, obj, key, recurseTimes, isArrayEntry) {
    var desc = Object.getOwnPropertyDescriptor(obj, key) || { value: obj[key], enumerable: true };
    var str;
    if (desc.value !== undefined || !('get' in desc || 'set' in desc)) {
      ctx.indentationLvl += 2;
      str = formatValue(ctx, desc.value, recurseTimes);
      ctx.indentationLvl -= 2;
    } else if (desc.get !== undefined) {
      str = desc.set !== undefined ? '[Getter/Setter]' : '[Getter]';
    } else {
      str = desc.set !== undefined ? '[Setter]' : 'undefined';
    }
    if (isArrayEntry) return str;
    return formatKey(key) + ': ' + str;
  }

  function formatValue(ctx, v, recurseTimes) {
    if (v === null) return 'null';
    if (typeof v !== 'object' && typeof v !== 'function') return formatPrimitive(ctx, v);
    if (ctx.seen.indexOf(v) !== -1) return '[Circular *1]';
    return formatRaw(ctx, v, recurseTimes);
  }

  function ownKeys(v) {
    var keys = Object.keys(v);
    var syms = Object.getOwnPropertySymbols(v).filter(function (s) {
      var d = Object.getOwnPropertyDescriptor(v, s);
      return d && d.enumerable;
    });
    return keys.concat(syms);
  }

  function formatRaw(ctx, v, recurseTimes) {
    var name = ctorName(v);
    var keys, braces, base = '', isArrayType = false, formatter = null, noEntries = false;
    var prefix = name === null ? '[Object: null prototype] ' : '';

    if (Array.isArray(v)) {
      keys = Object.keys(v).filter(function (k) { return !/^(0|[1-9]\d*)$/.test(k); });
      braces = [(name !== 'Array' ? prefix + (name || '') + '(' + v.length + ') ' : '') + '[', ']'];
      if (v.length === 0 && keys.length === 0) return braces[0] + ']';
      isArrayType = true;
      formatter = function () {
        var out = [];
        var n = Math.min(v.length, ctx.maxArrayLength);
        for (var i = 0; i < n; i++) out.push(i in v ? formatProperty(ctx, v, i, recurseTimes, true) : '<1 empty item>');
        if (v.length > n) { ctx.extraItems = true; out.push('... ' + (v.length - n) + ' more item' + (v.length - n > 1 ? 's' : '')); }
        return out;
      };
    } else if (ArrayBuffer.isView(v) && !(v instanceof DataView)) {
      keys = [];
      braces = [name + '(' + v.length + ') [', ']'];
      if (v.length === 0) return braces[0] + ']';
      isArrayType = true;
      formatter = function () {
        var out = [];
        for (var i = 0; i < Math.min(v.length, ctx.maxArrayLength); i++) out.push(formatPrimitive(ctx, v[i]));
        return out;
      };
    } else if (v instanceof Map) {
      keys = Object.keys(v);
      braces = [prefix + name + '(' + v.size + ') {', '}'];
      if (v.size === 0 && keys.length === 0) return braces[0] + '}';
      formatter = function () {
        var out = [];
        ctx.indentationLvl += 2;
        v.forEach(function (val, k) {
          out.push(formatValue(ctx, k, recurseTimes) + ' => ' + formatValue(ctx, val, recurseTimes));
        });
        ctx.indentationLvl -= 2;
        return out;
      };
    } else if (v instanceof Set) {
      keys = Object.keys(v);
      braces = [prefix + name + '(' + v.size + ') {', '}'];
      if (v.size === 0 && keys.length === 0) return braces[0] + '}';
      formatter = function () {
        var out = [];
        ctx.indentationLvl += 2;
        v.forEach(function (val) { out.push(formatValue(ctx, val, recurseTimes)); });
        ctx.indentationLvl -= 2;
        return out;
      };
    } else {
      keys = ownKeys(v);
      if (typeof v === 'function') {
        base = fnBase(v);
        keys = keys.filter(function (k) { return k !== 'prototype'; });
        if (keys.length === 0) return base;
        braces = ['{', '}'];
      } else if (v instanceof Error) {
        var stackless = '[' + (v.name || 'Error') + (v.message ? ': ' + v.message : '') + ']';
        keys = keys.filter(function (k) { return k !== 'stack' && k !== 'message'; });
        base = stackless;
        if (keys.length === 0) return base;
        braces = ['{', '}'];
      } else if (v instanceof Date) {
        base = isNaN(v.getTime()) ? 'Invalid Date' : v.toISOString();
        if (keys.length === 0) return base;
        braces = ['{', '}'];
      } else if (v instanceof RegExp) {
        base = RegExp.prototype.toString.call(v);
        if (keys.length === 0) return base;
        braces = ['{', '}'];
      } else if (typeof Promise !== 'undefined' && v instanceof Promise) {
        base = 'Promise';
        braces = ['Promise {', '}'];
        base = '';
        formatter = function () { return ['<pending>']; };
        noEntries = true;
      } else {
        var tag = v[Symbol.toStringTag];
        var label = name === null ? '[Object: null prototype]' : (name === 'Object' ? '' : name);
        if (typeof tag === 'string' && tag !== '' && tag !== name) label = (label ? label + ' ' : 'Object ') + '[' + tag + ']';
        braces = [(label ? label + ' ' : '') + '{', '}'];
        if (keys.length === 0) return (label ? label + ' ' : '') + '{}';
      }
    }

    if (recurseTimes > ctx.depth) {
      if (Array.isArray(v)) return '[Array]';
      return '[' + (name === null ? 'Object: null prototype' : name) + ']';
    }

    recurseTimes += 1;
    ctx.seen.push(v);
    ctx.currentDepth = recurseTimes;
    var output = formatter ? formatter() : [];
    for (var i = 0; i < keys.length && !noEntries; i++) output.push(formatProperty(ctx, v, keys[i], recurseTimes, false));
    ctx.seen.pop();
    var res = reduceToSingleString(ctx, output, base, braces, isArrayType, recurseTimes, v);
    ctx.extraItems = false;
    return res;
  }

  function inspect(v) {
    var ctx = {
      seen: [], indentationLvl: 0, currentDepth: 0, extraItems: false,
      depth: INSPECT_DEFAULTS.depth, breakLength: INSPECT_DEFAULTS.breakLength,
      compact: INSPECT_DEFAULTS.compact, maxArrayLength: INSPECT_DEFAULTS.maxArrayLength,
    };
    return formatValue(ctx, v, 0);
  }

  /* console.log(a, b, …): strings print raw, %s/%d/%i/%f/%j/%o/%O/%c/%% are honoured. */
  function formatArgs(args) {
    if (!args.length) return '';
    var first = args[0];
    var rest = 1;
    var out = '';
    if (typeof first === 'string' && args.length > 1 && first.indexOf('%') !== -1) {
      var i = 0;
      while (i < first.length) {
        if (first[i] === '%' && i + 1 < first.length) {
          var f = first[i + 1];
          if (f === '%') { out += '%'; i += 2; continue; }
          if ('sdifjoOc'.indexOf(f) !== -1) {
            if (rest >= args.length) { out += '%' + f; i += 2; continue; }
            var a = args[rest++];
            if (f === 's') out += typeof a === 'string' ? a : (typeof a === 'bigint' ? a + 'n' : (typeof a === 'object' && a !== null ? inspect(a) : String(a)));
            else if (f === 'd' || f === 'i') out += typeof a === 'bigint' ? a + 'n' : (typeof a === 'object' ? 'NaN' : String(f === 'i' ? parseInt(a, 10) : Number(a)));
            else if (f === 'f') out += String(parseFloat(a));
            else if (f === 'j') { try { out += JSON.stringify(a); } catch (e) { out += '[Circular]'; } }
            else if (f === 'o' || f === 'O') out += inspect(a);
            i += 2;
            continue;
          }
        }
        out += first[i];
        i++;
      }
    } else {
      out = typeof first === 'string' ? first : inspect(first);
    }
    for (; rest < args.length; rest++) {
      var v = args[rest];
      out += ' ' + (typeof v === 'string' ? v : inspect(v));
    }
    return out;
  }
  /* node-inspect:end */

  /* ======================================================================
     Console capture (installed once; routed to the active run session)
     ====================================================================== */

  var session = null;
  var METHODS = ['log', 'info', 'warn', 'error', 'debug', 'table', 'group', 'groupEnd', 'time', 'timeEnd', 'timeLog', 'count', 'assert', 'clear', 'dir', 'trace'];
  var native = {};

  METHODS.forEach(function (m) {
    native[m] = console[m] ? console[m].bind(console) : function () {};
    console[m] = function () {
      var args = Array.prototype.slice.call(arguments);
      if (session) session.handle(m, args);
      native[m].apply(null, args);
    };
  });

  /* ======================================================================
     Compiler (Babel standalone, lazy)
     ====================================================================== */

  var babelPromise = null;

  function loadBabel() {
    if (window.Babel) return Promise.resolve(window.Babel);
    if (babelPromise) return babelPromise;
    babelPromise = new Promise(function (resolve, reject) {
      var s = document.createElement('script');
      s.src = BABEL_URL;
      s.async = true;
      s.onload = function () { window.Babel ? resolve(window.Babel) : reject(new Error('Babel did not initialise')); };
      s.onerror = function () { babelPromise = null; reject(new Error('Could not load the TypeScript compiler')); };
      document.head.appendChild(s);
    });
    return babelPromise;
  }

  function compile(src) {
    var wrapped = 'async function __zudo_main__() {\n' + src + '\n}';
    return loadBabel().then(function (Babel) {
      var out = Babel.transform(wrapped, {
        filename: 'playground.ts',
        presets: [['typescript', { allExtensions: true, isTSX: false, onlyRemoveTypeImports: true }]],
        sourceType: 'script',
        retainLines: true,
      });
      return out.code;
    });
  }

  /* ======================================================================
     Modules: import/export inside the browser terminal
       @zudojs/<pkg>  → the browser build under /learn/lib (manifest.json)
       ./file.js      → another file registered by the page (registerFiles)
       node:*, npm    → a clear "run this on your computer" message
     Rewrites keep every line where it was, so error line numbers still match.
     ====================================================================== */

  var LIB_BASE = '/learn/lib/';
  var NODE_BUILTINS = /^(node:|(assert|buffer|child_process|cluster|crypto|dgram|dns|events|fs|http|http2|https|net|os|path|perf_hooks|process|querystring|readline|stream|string_decoder|timers|tls|tty|url|util|v8|vm|worker_threads|zlib)(\/|$))/;
  var manifestPromise = null;
  var virtualFiles = {};
  var moduleCache = {};

  function hintError(message, hint) {
    var e = new Error(message);
    e.name = 'ModuleNotAvailable';
    e.__zudoHint = hint;
    return e;
  }

  function loadManifest() {
    if (!manifestPromise) {
      manifestPromise = fetch(LIB_BASE + 'manifest.json').then(function (r) {
        if (!r.ok) throw new Error('manifest ' + r.status);
        return r.json();
      }).catch(function (e) {
        manifestPromise = null;
        throw hintError('Could not load the Zudo packages for the browser terminal.', 'Check your connection and run again.');
      });
    }
    return manifestPromise;
  }

  function keepLines(match, text) {
    var n = (match.match(/\n/g) || []).length;
    return text + new Array(n + 1).join('\n');
  }

  function rewriteModules(src, exportsList) {
    var out = src
      .replace(/^([ \t]*)import\s+type\s[\s\S]*?\sfrom\s*(['"])[^'"\n]+\2[ \t]*;?/gm, function (m) { return keepLines(m, ''); })
      .replace(/^([ \t]*)import\s+(?:([A-Za-z_$][\w$]*)\s*,?\s*)?(?:\*\s*as\s+([A-Za-z_$][\w$]*)|(\{[\s\S]*?\}))?\s*from\s*(['"])([^'"\n]+)\5[ \t]*;?/gm,
        function (m, indent, def, ns, named, q, spec) {
          var target = '__zudo_import__(' + JSON.stringify(spec) + ')';
          var bindings = [];
          var stmts = [];
          if (named) {
            named.slice(1, -1).split(',').forEach(function (part) {
              part = part.trim();
              if (!part || /^type\s/.test(part)) return;
              bindings.push(part.replace(/\s+as\s+/, ': '));
            });
          }
          if (def) bindings.unshift('default: ' + def);
          if (ns) stmts.push('const ' + ns + ' = await ' + target + ';');
          if (bindings.length) stmts.push('const { ' + bindings.join(', ') + ' } = await ' + target + ';');
          return keepLines(m, stmts.length ? indent + stmts.join(' ') : '');
        })
      .replace(/^([ \t]*)import\s*(['"])([^'"\n]+)\2[ \t]*;?/gm, function (m, indent, q, spec) {
        return indent + 'await __zudo_import__(' + JSON.stringify(spec) + ');';
      });
    out = out.replace(/^([ \t]*)export\s*(type\s*)?\{([^}]*)\}(\s*from\s*(['"])[^'"\n]+\5)?[ \t]*;?/gm, function (m, indent, typeOnly, names, from) {
      if (!from && !typeOnly && exportsList) {
        names.split(',').forEach(function (p) {
          p = p.trim();
          if (!p || /^type\s/.test(p)) return;
          var parts = p.split(/\s+as\s+/);
          exportsList.push(parts[1] ? parts[1] + ': ' + parts[0] : parts[0]);
        });
      }
      return keepLines(m, '');
    });
    out = out.replace(/^([ \t]*)export\s+(?:declare\s+)?((?:async\s+)?function\*?|abstract\s+class|class|const|let|var|enum|interface|type)\s+([A-Za-z_$][\w$]*)/gm,
      function (m, indent, kind, name) {
        if (exportsList && !/^(interface|type)$/.test(kind)) exportsList.push(name);
        return indent + kind + ' ' + name;
      });
    out = out.replace(/^([ \t]*)export\s+default\s+/gm, function (m, indent) {
      if (exportsList) exportsList.push('default: __zudo_default__');
      return indent + 'const __zudo_default__ = ';
    });
    return out;
  }

  function importVirtual(spec) {
    var name = spec.replace(/^\.\//, '');
    if (virtualFiles[name] === undefined && /\.js$/.test(name) && virtualFiles[name.replace(/\.js$/, '.ts')] !== undefined) {
      name = name.replace(/\.js$/, '.ts');
    }
    if (virtualFiles[name] === undefined) {
      return Promise.reject(hintError('Cannot find the file "' + spec + '".',
        'The browser terminal only knows the files shown on this page. On your computer, make sure ' + spec + ' sits next to the file you run.'));
    }
    if (!moduleCache[name]) {
      var exportsList = [];
      var body = rewriteModules(virtualFiles[name], exportsList);
      moduleCache[name] = compile(body + '\nreturn { ' + exportsList.join(', ') + ' };').then(function (js) {
        return new Function(js + '\nreturn __zudo_main__();')();
      });
    }
    return moduleCache[name];
  }

  window.__zudo_import__ = function (spec) {
    if (spec.charAt(0) === '.') return importVirtual(spec);
    if (NODE_BUILTINS.test(spec)) {
      return Promise.reject(hintError('"' + spec + '" is part of Node.js, so it does not exist in the browser.',
        'Run this example on your computer with Node.js. The lesson shows the command and the output you should see.'));
    }
    return loadManifest().then(function (m) {
      var entry = m.packages[spec];
      if (!entry) {
        if (/^@zudojs\//.test(spec)) {
          throw hintError(spec + ' needs Node.js, so it does not run in the browser terminal.',
            'Install it on your computer with: npm install ' + spec);
        }
        throw hintError('The browser terminal cannot load "' + spec + '".',
          'Only @zudojs packages are available here. Install it on your computer with: npm install ' + spec);
      }
      return import(LIB_BASE + entry.file);
    });
  };

  /* ======================================================================
     UI
     ====================================================================== */

  function el(id) { return document.getElementById(id); }

  function build() {
    if (el('zudoPlayground')) return;

    var launch = document.createElement('button');
    launch.type = 'button';
    launch.className = 'pg-launch';
    launch.id = 'pgLaunch';
    launch.setAttribute('aria-label', 'Open the Zudo playground');
    launch.innerHTML = '<span class="pg-launch-prompt">$</span> playground <span class="pg-launch-cursor"></span><kbd>Ctrl `</kbd>';

    var panel = document.createElement('section');
    panel.className = 'pg';
    panel.id = 'zudoPlayground';
    panel.setAttribute('role', 'region');
    panel.setAttribute('aria-label', 'Zudo playground');
    panel.innerHTML =
      '<div class="pg-rz pg-rz-t" data-rz="t"></div><div class="pg-rz pg-rz-l" data-rz="l"></div><div class="pg-rz pg-rz-c" data-rz="c"></div>' +
      '<div class="pg-bar">' +
        '<div class="pg-dots" aria-hidden="true"><span></span><span></span><span></span></div>' +
        '<div class="pg-title">Terminal <span class="pg-file" id="pgFile">hello.ts</span></div>' +
        '<div class="pg-tools">' +
          '<select class="pg-select pg-hide-sm" id="pgExamples" aria-label="Load an example">' +
            EXAMPLES.map(function (e) { return '<option value="' + e.id + '">' + e.name + '</option>'; }).join('') +
          '</select>' +
          '<button type="button" class="pg-btn pg-btn--run" id="pgRun" title="Run (Ctrl+Enter)">' +
            '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M6 4l14 8-14 8z"/></svg>Run</button>' +
          '<button type="button" class="pg-btn pg-hide-sm" id="pgReset" title="Reset to the example">Reset</button>' +
          '<button type="button" class="pg-btn pg-btn--icon pg-hide-sm" id="pgLayout" title="Toggle side-by-side layout" aria-label="Toggle side-by-side layout">' +
            '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" aria-hidden="true"><rect x="3" y="4" width="18" height="16"/><path d="M12 4v16"/></svg></button>' +
          '<button type="button" class="pg-btn pg-btn--icon" id="pgMax" title="Maximize" aria-label="Maximize">' +
            '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="square" aria-hidden="true"><path d="M4 10V4h6M20 14v6h-6M20 4l-7 7M4 20l7-7"/></svg></button>' +
          '<button type="button" class="pg-btn pg-btn--icon pg-btn--close" id="pgClose" title="Close (Esc)" aria-label="Close playground">' +
            '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="square" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg></button>' +
        '</div>' +
      '</div>' +
      '<div class="pg-body">' +
        '<div class="pg-editor">' +
          '<div class="pg-gutter" id="pgGutter" aria-hidden="true"></div>' +
          '<div class="pg-code">' +
            '<pre class="pg-hl" aria-hidden="true"><code id="pgHl"></code></pre>' +
            '<textarea class="pg-ta" id="pgTa" spellcheck="false" autocapitalize="off" autocorrect="off" autocomplete="off" aria-label="TypeScript editor" placeholder="// Write TypeScript here…"></textarea>' +
          '</div>' +
        '</div>' +
        '<div class="pg-out">' +
          '<div class="pg-out-head"><span class="pg-out-label">Output</span><span class="pg-out-count" id="pgCount"></span>' +
            '<button type="button" class="pg-btn" id="pgClearOut">Clear</button></div>' +
          '<div class="pg-term" id="pgTerm" role="log" aria-live="polite"></div>' +
        '</div>' +
      '</div>' +
      '<div class="pg-status">' +
        '<span class="pg-lang">TS</span>' +
        '<span class="pg-state" id="pgState" data-state="ready">Ready</span>' +
        '<span id="pgPos">Ln 1, Col 1</span>' +
        '<span class="pg-hint"><span><kbd>Ctrl</kbd>+<kbd>↵</kbd> run</span><span><kbd>Ctrl</kbd>+<kbd>/</kbd> comment</span><span><kbd>Tab</kbd> indent</span><span><kbd>Esc</kbd> close</span></span>' +
      '</div>' +
      '<div class="pg-toast" id="pgToast" aria-live="polite"></div>';

    document.body.appendChild(launch);
    document.body.appendChild(panel);
  }

  /* ---------- state ---------- */

  var panel, ta, hl, gutter, term, stateEl, posEl, fileEl, countEl, runBtn, toastEl, examplesSel;
  var currentExample = EXAMPLES[0];
  var lineCount = 0;
  var toastTimer;

  function store(k, v) { try { localStorage.setItem(k, typeof v === 'string' ? v : JSON.stringify(v)); } catch (e) {} }
  function read(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }

  function toast(msg) {
    toastEl.textContent = msg;
    toastEl.classList.add('is-on');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { toastEl.classList.remove('is-on'); }, 1400);
  }

  function setState(state, label) {
    stateEl.dataset.state = state;
    stateEl.textContent = label;
  }

  /* ---------- editor ---------- */

  function render() {
    var code = ta.value;
    hl.innerHTML = highlight(code);
    var n = code.split('\n').length;
    if (n !== lineCount) {
      lineCount = n;
      var g = '';
      for (var i = 1; i <= n; i++) g += '<div>' + i + '</div>';
      gutter.innerHTML = g;
    }
    syncScroll();
    updateCursor();
  }

  function syncScroll() {
    hl.parentNode.scrollTop = ta.scrollTop;
    hl.parentNode.scrollLeft = ta.scrollLeft;
    gutter.scrollTop = ta.scrollTop;
  }

  function updateCursor() {
    var before = ta.value.slice(0, ta.selectionStart);
    var lines = before.split('\n');
    var ln = lines.length;
    var col = lines[lines.length - 1].length + 1;
    posEl.textContent = 'Ln ' + ln + ', Col ' + col;
    var rows = gutter.children;
    for (var i = 0; i < rows.length; i++) rows[i].classList.toggle('is-cur', i === ln - 1);
  }

  function setCode(code, markDirty) {
    ta.value = code;
    render();
    fileEl.classList.toggle('is-dirty', !!markDirty);
    store(LS.code, code);
  }

  function replaceSelection(text, selStart, selEnd) {
    var s = ta.selectionStart, e = ta.selectionEnd;
    ta.setRangeText(text, s, e, 'end');
    if (selStart !== undefined) ta.setSelectionRange(selStart, selEnd === undefined ? selStart : selEnd);
    ta.dispatchEvent(new Event('input', { bubbles: true }));
  }

  function lineRange() {
    var v = ta.value, s = ta.selectionStart, e = ta.selectionEnd;
    var start = v.lastIndexOf('\n', s - 1) + 1;
    var end = v.indexOf('\n', e === s ? e : e - 1);
    if (end === -1) end = v.length;
    return { start: start, end: end };
  }

  function indentLines(outdent) {
    var r = lineRange();
    var block = ta.value.slice(r.start, r.end);
    var s = ta.selectionStart, e = ta.selectionEnd;
    var lines = block.split('\n');
    var delta0 = 0, deltaAll = 0;
    var next = lines.map(function (l, i) {
      var nl;
      if (outdent) {
        var m = l.match(/^( {1,2}|\t)/);
        nl = m ? l.slice(m[0].length) : l;
      } else {
        nl = '  ' + l;
      }
      var d = nl.length - l.length;
      if (i === 0) delta0 = d;
      deltaAll += d;
      return nl;
    }).join('\n');
    ta.setRangeText(next, r.start, r.end, 'preserve');
    ta.setSelectionRange(Math.max(r.start, s + delta0), Math.max(r.start, e + deltaAll));
    ta.dispatchEvent(new Event('input', { bubbles: true }));
  }

  function toggleComment() {
    var r = lineRange();
    var block = ta.value.slice(r.start, r.end);
    var lines = block.split('\n');
    var allCommented = lines.every(function (l) { return /^\s*\/\//.test(l) || !l.trim(); });
    var next = lines.map(function (l) {
      if (!l.trim()) return l;
      if (allCommented) return l.replace(/^(\s*)\/\/ ?/, '$1');
      var ws = l.match(/^\s*/)[0];
      return ws + '// ' + l.slice(ws.length);
    }).join('\n');
    ta.setRangeText(next, r.start, r.end, 'select');
    ta.dispatchEvent(new Event('input', { bubbles: true }));
  }

  var PAIRS = { '(': ')', '[': ']', '{': '}', '"': '"', "'": "'", '`': '`' };

  function onKeydown(e) {
    var k = e.key;
    var mod = e.ctrlKey || e.metaKey;

    if (mod && k === 'Enter') { e.preventDefault(); run(); return; }
    if (mod && k === '/') { e.preventDefault(); toggleComment(); return; }
    if (mod && k.toLowerCase() === 's') { e.preventDefault(); store(LS.code, ta.value); toast('Saved locally'); return; }
    if (k === 'Escape') { e.preventDefault(); close(); return; }

    if (k === 'Tab') {
      e.preventDefault();
      if (ta.selectionStart !== ta.selectionEnd || e.shiftKey) indentLines(e.shiftKey);
      else replaceSelection('  ');
      return;
    }

    if (k === 'Enter') {
      e.preventDefault();
      var s = ta.selectionStart;
      var before = ta.value.slice(0, s);
      var after = ta.value.slice(ta.selectionEnd);
      var line = before.slice(before.lastIndexOf('\n') + 1);
      var indent = line.match(/^\s*/)[0];
      var prev = before[before.length - 1];
      var nextCh = after[0];
      var opens = prev === '{' || prev === '(' || prev === '[';
      var closes = (prev === '{' && nextCh === '}') || (prev === '(' && nextCh === ')') || (prev === '[' && nextCh === ']');
      var insert = '\n' + indent + (opens ? '  ' : '');
      if (closes) {
        replaceSelection(insert + '\n' + indent, s + insert.length);
      } else {
        replaceSelection(insert);
      }
      return;
    }

    if (k === 'Backspace' && ta.selectionStart === ta.selectionEnd) {
      var p = ta.selectionStart;
      var a = ta.value[p - 1], b = ta.value[p];
      if (a && PAIRS[a] === b && ta.value[p - 1] !== undefined) {
        e.preventDefault();
        ta.setRangeText('', p - 1, p + 1, 'end');
        ta.dispatchEvent(new Event('input', { bubbles: true }));
        return;
      }
    }

    if (PAIRS[k] && !mod && !e.altKey) {
      var start = ta.selectionStart, end = ta.selectionEnd;
      var sel = ta.value.slice(start, end);
      var following = ta.value[end];
      // Skip over an existing closing char
      if (start === end && (k === ')' || k === ']' || k === '}' || k === '"' || k === "'" || k === '`') && following === k && PAIRS[k] === k) {
        e.preventDefault();
        ta.setSelectionRange(start + 1, start + 1);
        updateCursor();
        return;
      }
      if (sel) {
        e.preventDefault();
        ta.setRangeText(k + sel + PAIRS[k], start, end, 'select');
        ta.setSelectionRange(start + 1, end + 1);
        ta.dispatchEvent(new Event('input', { bubbles: true }));
        return;
      }
      if (k === '(' || k === '[' || k === '{' || (!/[\w$]/.test(ta.value[start - 1] || '') && (following === undefined || /[\s)\]};,]/.test(following)))) {
        e.preventDefault();
        ta.setRangeText(k + PAIRS[k], start, end, 'start');
        ta.setSelectionRange(start + 1, start + 1);
        ta.dispatchEvent(new Event('input', { bubbles: true }));
        return;
      }
    }

    if ((k === ')' || k === ']' || k === '}') && ta.value[ta.selectionStart] === k && ta.selectionStart === ta.selectionEnd) {
      e.preventDefault();
      ta.setSelectionRange(ta.selectionStart + 1, ta.selectionStart + 1);
      updateCursor();
    }
  }

  /* ---------- terminal output ---------- */

  var lineTotal = 0;

  function line(kind, text, sig) {
    var div = document.createElement('div');
    div.className = 'pg-line pg-line-' + kind;
    var s = document.createElement('span');
    s.className = 'pg-sig';
    s.textContent = sig || '';
    var body = document.createElement('span');
    body.textContent = text;
    div.appendChild(s);
    div.appendChild(body);
    term.appendChild(div);
    lineTotal++;
    countEl.textContent = lineTotal + (lineTotal === 1 ? ' line' : ' lines');
    term.scrollTop = term.scrollHeight;
    return div;
  }

  function table(data) {
    var rows = Array.isArray(data) ? data : Object.keys(data || {}).map(function (k) { return Object.assign({ '(index)': k }, data[k]); });
    if (!rows.length) { line('log', inspect(data), '│'); return; }
    var cols = [];
    if (Array.isArray(data)) cols.push('(index)');
    rows.forEach(function (r) {
      if (r && typeof r === 'object') Object.keys(r).forEach(function (k) { if (cols.indexOf(k) === -1) cols.push(k); });
      else if (cols.indexOf('Value') === -1) cols.push('Value');
    });
    var t = document.createElement('table');
    t.className = 'pg-table';
    var thead = '<tr>' + cols.map(function (c) { return '<th>' + escapeHtml(c) + '</th>'; }).join('') + '</tr>';
    var tbody = rows.map(function (r, i) {
      return '<tr>' + cols.map(function (c) {
        var v;
        if (c === '(index)' && Array.isArray(data)) v = i;
        else if (r && typeof r === 'object') v = r[c];
        else v = c === 'Value' ? r : undefined;
        return '<td>' + escapeHtml(v === undefined ? '' : inspect(v, 1)) + '</td>';
      }).join('') + '</tr>';
    }).join('');
    t.innerHTML = thead + tbody;
    term.appendChild(t);
    term.scrollTop = term.scrollHeight;
  }

  function clearTerm() {
    term.innerHTML = '';
    lineTotal = 0;
    countEl.textContent = '';
  }

  function makeSession() {
    var timers = {};
    var counts = {};
    var depth = 0;
    var pad = function () { return new Array(depth + 1).join('  '); };
    var fmt = function (args) {
      var p = pad();
      return formatArgs(args).split('\n').map(function (l) { return p + l; }).join('\n');
    };
    return {
      handle: function (m, args) {
        switch (m) {
          case 'log': case 'dir': line('log', fmt(args), '│'); break;
          case 'info': line('info', fmt(args), 'i'); break;
          case 'debug': line('debug', fmt(args), '·'); break;
          case 'warn': line('warn', fmt(args), '▲'); break;
          case 'error': line('error', fmt(args), '✗'); break;
          case 'trace': line('debug', fmt(['trace:'].concat(args)), '·'); break;
          case 'table': table(args[0]); break;
          case 'group': line('info', fmt(args.length ? args : ['group']), '▸'); depth++; break;
          case 'groupEnd': depth = Math.max(0, depth - 1); break;
          case 'time': timers[args[0] || 'default'] = performance.now(); break;
          case 'timeLog':
          case 'timeEnd': {
            var label = args[0] || 'default';
            if (timers[label] !== undefined) {
              line('debug', pad() + label + ': ' + (performance.now() - timers[label]).toFixed(2) + 'ms', '⏱');
              if (m === 'timeEnd') delete timers[label];
            }
            break;
          }
          case 'count': {
            var l = args[0] || 'default';
            counts[l] = (counts[l] || 0) + 1;
            line('debug', pad() + l + ': ' + counts[l], '#');
            break;
          }
          case 'assert': if (!args[0]) line('error', fmt(['Assertion failed:'].concat(args.slice(1))), '✗'); break;
          case 'clear': clearTerm(); break;
        }
      },
    };
  }

  /* ---------- run ---------- */

  var running = false;
  var runPromise = null;

  // User line N lives at wrapped line N+1 (our async wrapper) and at
  // eval line N+3 once new Function() adds its own two-line prologue.
  var WRAP_OFFSET = 1;
  var EVAL_OFFSET = 3;

  function fileName() { return fileEl.textContent || 'playground.ts'; }

  function codeFrame(src, lineNo, col) {
    var lines = src.split('\n');
    var out = [];
    for (var i = Math.max(0, lineNo - 3); i < Math.min(lines.length, lineNo + 2); i++) {
      var n = i + 1;
      var mark = n === lineNo ? '>' : ' ';
      out.push(mark + ' ' + String(n).padStart(3) + ' │ ' + lines[i]);
      if (n === lineNo && col !== undefined) out.push('      │ ' + new Array(Math.max(0, col)).join(' ') + '^');
    }
    return out;
  }

  function syntaxErrorReport(err, src) {
    var msg = (err.message || String(err)).split('\n')[0].replace(/\s*\(\d+:\d+\)\s*$/, '').replace(/^\/?playground\.ts:\s*/, '');
    var loc = err.loc || null;
    var lineNo = loc ? loc.line - WRAP_OFFSET : null;
    var col = loc ? loc.column : undefined;
    line('error', 'SyntaxError: ' + msg + (lineNo ? '  (' + fileName() + ':' + lineNo + ':' + (col + 1) + ')' : ''), '✗');
    if (lineNo && lineNo >= 1) codeFrame(src, lineNo, col).forEach(function (l) { line('stack', l); });
  }

  function cleanStack(err, src) {
    if (!err || !err.stack) return [];
    var name = fileName();
    var total = src ? src.split('\n').length : Infinity;
    return err.stack.split('\n').slice(1)
      .filter(function (l) { return /<anonymous>:\d+:\d+/.test(l) && !/playground\.js/.test(l.replace(/\(eval at [^)]*\)/, '')); })
      .map(function (l) {
        var fn = (l.match(/^\s*at\s+([^(]+?)\s*\(/) || [])[1];
        var pos = l.match(/<anonymous>:(\d+):(\d+)/);
        var ln = pos ? +pos[1] - EVAL_OFFSET : 0;
        if (ln < 1 || ln > total) return null;
        var where = name + ':' + ln + ':' + pos[2];
        return 'at ' + (fn && fn !== '__zudo_main__' && fn !== 'eval' ? fn + ' (' + where + ')' : where);
      })
      .filter(Boolean)
      .slice(0, 4);
  }

  function run() {
    if (running) return runPromise || Promise.resolve();
    var src = ta.value;
    store(LS.code, src);

    clearTerm();
    var file = fileEl.textContent || 'playground.ts';
    line('cmd', (/\.(m?js)$/.test(file) ? 'node ' : 'npx tsx ') + file, '$');

    moduleCache = {};
    running = true;
    runBtn.disabled = true;
    setState('busy', window.Babel ? 'Compiling' : 'Loading compiler');
    var sysLine = window.Babel ? null : line('sys', 'Loading the TypeScript compiler (first run only)…');

    var t0 = performance.now();
    runPromise = compile(rewriteModules(src, null)).then(function (js) {
      if (sysLine) sysLine.remove();
      setState('busy', 'Running');
      session = makeSession();
      var fn;
      try {
        fn = new Function(js + '\nreturn __zudo_main__();');
      } catch (e) {
        throw Object.assign(e, { __phase: 'compile' });
      }
      var start = performance.now();
      return Promise.resolve().then(fn).then(function (result) {
        var ms = (performance.now() - start).toFixed(2);
        if (result !== undefined) line('ret', inspect(result), '←');
        line('ok', 'done in ' + ms + 'ms', '✓');
        setState('ready', 'Ready');
      });
    }).catch(function (err) {
      if (sysLine) sysLine.remove();
      if (err && err.message === 'Could not load the TypeScript compiler') {
        line('error', 'Could not load the TypeScript compiler. Check your connection and run again.', '✗');
      } else if (err && err.__zudoHint) {
        line('error', err.message, '✗');
        line('sys', err.__zudoHint);
      } else if (err && (err.code === 'BABEL_PARSE_ERROR' || err.__phase === 'compile' || (err instanceof SyntaxError))) {
        syntaxErrorReport(err, src);
      } else {
        line('error', ((err && err.name) || 'Error') + ': ' + ((err && err.message) || String(err)), '✗');
        cleanStack(err, src).forEach(function (l) { line('stack', l); });
      }
      line('sys', 'failed after ' + (performance.now() - t0).toFixed(0) + 'ms');
      setState('error', 'Failed');
    }).then(function () {
      running = false;
      runBtn.disabled = false;
      runPromise = null;
    });
    return runPromise;
  }

  /* Lines the last run printed, without the command, timing and system lines. */
  function output() {
    return Array.prototype.map.call(term.querySelectorAll('.pg-line'), function (d) {
      return { kind: d.className.replace(/^.*pg-line-/, ''), text: d.lastChild.textContent };
    }).filter(function (l) { return ['cmd', 'ok', 'sys', 'ret'].indexOf(l.kind) === -1; });
  }

  function exec(code, name) {
    load(code, name);
    return Promise.resolve(run()).then(output);
  }

  function registerFiles(files) {
    Object.keys(files || {}).forEach(function (k) { virtualFiles[k] = files[k]; });
  }

  /* ---------- panel controls ---------- */

  var openedOnce = false;
  function open() {
    panel.classList.add('is-open');
    document.body.classList.add('pg-open');
    render();
    if (!openedOnce) { openedOnce = true; ta.setSelectionRange(0, 0); }
    ta.focus({ preventScroll: true });
    updateCursor();
  }

  function close() {
    panel.classList.remove('is-open');
    document.body.classList.remove('pg-open');
    var launch = el('pgLaunch');
    if (launch) launch.focus();
  }

  function toggle() { panel.classList.contains('is-open') ? close() : open(); }

  function loadExample(ex, force) {
    currentExample = ex;
    examplesSel.value = ex.id;
    setFile(ex.file);
    store(LS.example, ex.id);
    setCode(ex.code, false);
    if (force) toast('Loaded ' + ex.name);
  }

  function setFile(name) {
    fileEl.textContent = name;
    var lang = panel.querySelector('.pg-lang');
    if (lang) lang.textContent = /\.(m?js)$/.test(name) ? 'JS' : 'TS';
  }

  function load(code, name) {
    setFile(name || 'snippet.ts');
    setCode(code, true);
    open();
  }

  function applySize(w, h) {
    if (w) panel.style.setProperty('--pg-w', Math.round(w) + 'px');
    if (h) panel.style.setProperty('--pg-h', Math.round(h) + 'px');
  }

  function initResize() {
    var startX, startY, startW, startH, mode;
    function onMove(e) {
      var w = startW, h = startH;
      if (mode === 'l' || mode === 'c') w = Math.max(380, Math.min(window.innerWidth, startW + (startX - e.clientX)));
      if (mode === 't' || mode === 'c') h = Math.max(300, Math.min(window.innerHeight - 64, startH + (startY - e.clientY)));
      applySize(w, h);
    }
    function onUp() {
      document.removeEventListener('pointermove', onMove);
      document.removeEventListener('pointerup', onUp);
      document.body.classList.remove('pg-resizing');
      store(LS.size, { w: panel.offsetWidth, h: panel.offsetHeight });
    }
    panel.querySelectorAll('.pg-rz').forEach(function (h) {
      h.addEventListener('pointerdown', function (e) {
        if (panel.classList.contains('is-max')) return;
        e.preventDefault();
        mode = h.dataset.rz;
        startX = e.clientX; startY = e.clientY;
        startW = panel.offsetWidth; startH = panel.offsetHeight;
        document.body.classList.add('pg-resizing');
        document.addEventListener('pointermove', onMove);
        document.addEventListener('pointerup', onUp);
      });
    });
  }

  /* ---------- init ---------- */

  function init() {
    build();
    panel = el('zudoPlayground');
    ta = el('pgTa'); hl = el('pgHl'); gutter = el('pgGutter'); term = el('pgTerm');
    stateEl = el('pgState'); posEl = el('pgPos'); fileEl = el('pgFile'); countEl = el('pgCount');
    runBtn = el('pgRun'); toastEl = el('pgToast'); examplesSel = el('pgExamples');

    // restore
    var savedExample = read(LS.example);
    var ex = EXAMPLES.filter(function (e) { return e.id === savedExample; })[0] || EXAMPLES[0];
    currentExample = ex;
    examplesSel.value = ex.id;
    fileEl.textContent = ex.file;
    var savedCode = read(LS.code);
    ta.value = savedCode !== null ? savedCode : ex.code;
    fileEl.classList.toggle('is-dirty', savedCode !== null && savedCode !== ex.code);
    try {
      var size = JSON.parse(read(LS.size) || 'null');
      if (size && size.w && size.h) applySize(size.w, size.h);
    } catch (e) {}
    if (read(LS.layout) === 'side') panel.classList.add('is-side');
    render();
    line('sys', 'Press Run or Ctrl+Enter to execute. Output appears here.');

    // editor events
    ta.addEventListener('input', function () {
      render();
      fileEl.classList.toggle('is-dirty', ta.value !== currentExample.code);
      store(LS.code, ta.value);
    });
    ta.addEventListener('scroll', syncScroll);
    ta.addEventListener('keydown', onKeydown);
    ta.addEventListener('keyup', updateCursor);
    ta.addEventListener('click', updateCursor);
    ta.addEventListener('select', updateCursor);

    // toolbar
    el('pgLaunch').addEventListener('click', open);
    el('pgClose').addEventListener('click', close);
    runBtn.addEventListener('click', run);
    el('pgClearOut').addEventListener('click', function () { clearTerm(); session = null; });
    el('pgReset').addEventListener('click', function () { loadExample(currentExample, true); clearTerm(); });
    examplesSel.addEventListener('change', function () {
      var next = EXAMPLES.filter(function (e) { return e.id === examplesSel.value; })[0];
      if (next) { loadExample(next, true); clearTerm(); ta.focus(); }
    });
    el('pgMax').addEventListener('click', function () {
      var max = panel.classList.toggle('is-max');
      el('pgMax').setAttribute('aria-label', max ? 'Restore size' : 'Maximize');
      el('pgMax').title = max ? 'Restore size' : 'Maximize';
      if (max && window.innerWidth >= 900) panel.classList.add('is-side');
      else if (read(LS.layout) !== 'side') panel.classList.remove('is-side');
    });
    el('pgLayout').addEventListener('click', function () {
      var side = panel.classList.toggle('is-side');
      store(LS.layout, side ? 'side' : 'stack');
    });

    initResize();

    // global shortcut
    document.addEventListener('keydown', function (e) {
      if ((e.ctrlKey || e.metaKey) && e.key === '`') { e.preventDefault(); toggle(); }
    });

    // "Run in playground" links anywhere on the site: <a data-playground="hello">
    document.addEventListener('click', function (e) {
      var a = e.target.closest && e.target.closest('[data-playground]');
      if (!a) return;
      e.preventDefault();
      var id = a.getAttribute('data-playground');
      var target = EXAMPLES.filter(function (x) { return x.id === id; })[0];
      if (target) { loadExample(target, false); clearTerm(); }
      open();
    });

    window.ZudoPlayground = {
      open: open, close: close, toggle: toggle, load: load, run: run, examples: EXAMPLES,
      exec: exec, output: output, registerFiles: registerFiles, highlight: highlight, inspect: inspect,
    };
    document.dispatchEvent(new CustomEvent('zudo:playground-ready'));
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
