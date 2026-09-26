#!/usr/bin/env node
/**
 * Screenshots the site with headless Chrome and compares the images pixel by
 * pixel with a baseline. The visual-regression gate for site/ changes: the light
 * theme must not move by a pixel while dark mode is added.
 *
 *   node scripts/site-shots.mjs --out .site-shots/base                 capture the working tree
 *   node scripts/site-shots.mjs --out .site-shots/head --git HEAD      capture a commit instead
 *   node scripts/site-shots.mjs --out .site-shots/now --compare .site-shots/base
 *
 * Options
 *   --theme light|dark        store the site's theme preference before loading (default: none)
 *   --scheme light|dark       emulate the OS prefers-color-scheme (default: light)
 *   --pages home,docs,…       subset of the page ids below (default: all)
 *   --widths 1440,390         viewport widths (default: 1440,390)
 *   --allow <n>               differing pixels tolerated per image when comparing (default: 0)
 *   --mask x,y,w,h            ignore a viewport rectangle when comparing (repeatable)
 *   --port <n>                port for the local server (default: 8123)
 *   --viewport [y]            capture only the 900px viewport, scrolled to y (default: full page)
 *
 * No npm dependency: Chrome is driven over the DevTools protocol with Node's
 * WebSocket, and PNGs are decoded and encoded with node:zlib. A diff image
 * (differences in red over the faded baseline) is written next to each failing
 * screenshot. Chrome is found through CHROME_PATH or the usual Linux paths.
 */
import { execFileSync, spawn } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { deflateSync, inflateSync } from "node:zlib";

const REPO = fileURLToPath(new URL("..", import.meta.url));

/* ---------- pages: id, path, and an optional action run after load ---------- */

const PAGES = [
  { id: "home", path: "/" },
  { id: "docs", path: "/docs/architecture" },
  { id: "themes", path: "/docs/design-themes" },
  { id: "getting-started", path: "/docs/getting-started" },
  { id: "package", path: "/docs/packages-container" },
  { id: "packages", path: "/docs/packages" },
  { id: "roadmap", path: "/docs/roadmap" },
  { id: "learn", path: "/learn" },
  { id: "course", path: "/learn/javascript" },
  { id: "lesson", path: "/learn/logic-math" },
  { id: "theming", path: "/learn/browser-theming" },
  { id: "editor", path: "/learn/logic-math", action: "editor" },
  { id: "playground", path: "/docs/getting-started", action: "click:#zudoTerminalTrigger" },
  { id: "search", path: "/docs/getting-started", action: "click:#zudoSearchTrigger" },
  { id: "brand", path: "/brand" },
  { id: "sponsors", path: "/sponsors" },
  { id: "not-found", path: "/this-page-does-not-exist" },
];

const MAX_HEIGHT = 16000;

/* ---------- arguments ---------- */

function arg(name, fallback) {
  const i = process.argv.indexOf(name);
  return i === -1 ? fallback : process.argv[i + 1];
}
function args(name) {
  const out = [];
  process.argv.forEach((a, i) => a === name && out.push(process.argv[i + 1]));
  return out;
}

const OUT = resolve(arg("--out", ".site-shots/out"));
const COMPARE = arg("--compare", null) && resolve(arg("--compare"));
const GIT = arg("--git", null);
const THEME = arg("--theme", null);
const SCHEME = arg("--scheme", "light");
const WIDTHS = arg("--widths", "1440,390").split(",").map(Number);
const ALLOW = Number(arg("--allow", "0"));
const PORT = Number(arg("--port", "8123"));
const MASKS = args("--mask").map((m) => m.split(",").map(Number));
const VIEWPORT = process.argv.includes("--viewport") ? Number(arg("--viewport", "0")) || 0 : null;
const wanted = arg("--pages", null)?.split(",");
const pages = wanted ? PAGES.filter((p) => wanted.includes(p.id)) : PAGES;

/* ---------- site to serve: the working tree, or a commit ---------- */

let siteDir = join(REPO, "site");
let extracted = null;
if (GIT) {
  extracted = mkdtempSync(join(tmpdir(), "zudo-site-"));
  execFileSync("sh", ["-c", `git archive ${GIT} site | tar -x -C "${extracted}"`], { cwd: REPO, stdio: "inherit" });
  siteDir = join(extracted, "site");
}

function chromeBinary() {
  const candidates = [
    process.env.CHROME_PATH,
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
    "/usr/bin/google-chrome",
    "/usr/bin/google-chrome-stable",
  ].filter(Boolean);
  const found = candidates.find((p) => existsSync(p));
  if (!found) throw new Error("No Chrome/Chromium found. Set CHROME_PATH and re-run.");
  return found;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function startServer() {
  const child = spawn(process.execPath, [join(siteDir, "serve.mjs"), String(PORT)], { stdio: "ignore" });
  for (let i = 0; i < 50; i++) {
    try {
      await fetch(`http://127.0.0.1:${PORT}/`);
      return child;
    } catch {
      await sleep(100);
    }
  }
  child.kill();
  throw new Error(`site server did not start on ${PORT}`);
}

/* ---------- a tiny DevTools protocol client ---------- */

async function startChrome() {
  const profile = mkdtempSync(join(tmpdir(), "zudo-chrome-"));
  const child = spawn(
    chromeBinary(),
    [
      "--headless=new",
      "--no-sandbox",
      "--disable-gpu",
      "--hide-scrollbars",
      "--force-device-scale-factor=1",
      "--font-render-hinting=none",
      "--disable-lcd-text",
      "--remote-debugging-port=0",
      `--user-data-dir=${profile}`,
      "--window-size=1440,900",
      "about:blank",
    ],
    { stdio: ["ignore", "ignore", "pipe"] },
  );
  const wsUrl = await new Promise((resolveUrl, reject) => {
    let buf = "";
    child.stderr.on("data", (d) => {
      buf += d;
      const m = buf.match(/DevTools listening on (ws:\/\/\S+)/);
      if (m) resolveUrl(m[1]);
    });
    child.on("exit", () => reject(new Error("Chrome exited before DevTools was ready\n" + buf)));
    setTimeout(() => reject(new Error("Chrome did not expose DevTools in time\n" + buf)), 15000);
  });
  const ws = new WebSocket(wsUrl);
  await new Promise((r, j) => ((ws.onopen = r), (ws.onerror = j)));
  let nextId = 1;
  const pending = new Map();
  const listeners = new Set();
  ws.onmessage = (ev) => {
    const msg = JSON.parse(ev.data);
    if (msg.id && pending.has(msg.id)) {
      const { res, rej } = pending.get(msg.id);
      pending.delete(msg.id);
      msg.error ? rej(new Error(msg.error.message)) : res(msg.result);
    } else if (msg.method) {
      listeners.forEach((fn) => fn(msg));
    }
  };
  const send = (method, params = {}, sessionId) =>
    new Promise((res, rej) => {
      const id = nextId++;
      pending.set(id, { res, rej });
      ws.send(JSON.stringify({ id, method, params, sessionId }));
    });
  const once = (method, sessionId) =>
    new Promise((res) => {
      const fn = (msg) => {
        if (msg.method === method && msg.sessionId === sessionId) {
          listeners.delete(fn);
          res(msg.params);
        }
      };
      listeners.add(fn);
    });
  const close = async () => {
    ws.close();
    const exited = new Promise((r) => child.once("exit", r));
    child.kill();
    await Promise.race([exited, sleep(3000)]);
    rmSync(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  };
  return { send, once, close };
}

/* ---------- one screenshot ---------- */

const SETTLE_JS = `new Promise((done) => {
  const fonts = document.fonts ? document.fonts.ready : Promise.resolve();
  fonts.then(() => requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(done, 250))));
})`;

const FREEZE_CSS = `*, *::before, *::after { animation: none !important; transition: none !important; caret-color: transparent !important; }
.monaco-editor .cursors-layer, .monaco-editor .current-line { visibility: hidden !important; }`;

async function openAction(cdp, s, action) {
  if (!action) return;
  if (action.startsWith("click:")) {
    const sel = JSON.stringify(action.slice(6));
    await cdp.send("Runtime.evaluate", { expression: `document.querySelector(${sel})?.click(); true` }, s);
  } else if (action === "editor") {
    await cdp.send(
      "Runtime.evaluate",
      {
        expression: `(() => {
          const btn = document.querySelector('.lx-edit');
          if (btn) btn.click();
          return !!btn;
        })()`,
      },
      s,
    );
  }
  await sleep(action === "editor" ? 4000 : 1500);
  await cdp.send("Runtime.evaluate", { expression: SETTLE_JS, awaitPromise: true }, s);
}

async function shoot(cdp, page, width) {
  const { targetId } = await cdp.send("Target.createTarget", { url: "about:blank" });
  const { sessionId: s } = await cdp.send("Target.attachToTarget", { targetId, flatten: true });
  await cdp.send("Page.enable", {}, s);
  await cdp.send("Runtime.enable", {}, s);
  await cdp.send("Emulation.setDeviceMetricsOverride", { width, height: 900, deviceScaleFactor: 1, mobile: width < 700 }, s);
  await cdp.send(
    "Emulation.setEmulatedMedia",
    {
      features: [
        { name: "prefers-color-scheme", value: SCHEME },
        { name: "prefers-reduced-motion", value: "reduce" },
      ],
    },
    s,
  );
  const boot = [
    `try { localStorage.clear(); } catch (e) {}`,
    THEME ? `try { localStorage.setItem('zudo.theme', ${JSON.stringify(THEME)}); } catch (e) {}` : "",
    `document.addEventListener('DOMContentLoaded', () => { const st = document.createElement('style'); st.textContent = ${JSON.stringify(FREEZE_CSS)}; document.head.appendChild(st); });`,
  ].join("\n");
  await cdp.send("Page.addScriptToEvaluateOnNewDocument", { source: boot }, s);
  const loaded = cdp.once("Page.loadEventFired", s);
  await cdp.send("Page.navigate", { url: `http://127.0.0.1:${PORT}${page.path}` }, s);
  await loaded;
  await cdp.send("Runtime.evaluate", { expression: SETTLE_JS, awaitPromise: true }, s);
  await openAction(cdp, s, page.action);
  const { result } = await cdp.send(
    "Runtime.evaluate",
    { expression: `Math.min(${MAX_HEIGHT}, Math.max(900, document.documentElement.scrollHeight))`, returnByValue: true },
    s,
  );
  const height = page.action || VIEWPORT !== null ? 900 : result.value;
  if (VIEWPORT) await cdp.send("Runtime.evaluate", { expression: `window.scrollTo(0, ${VIEWPORT})` }, s);
  await cdp.send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile: width < 700 }, s);
  await cdp.send("Runtime.evaluate", { expression: SETTLE_JS, awaitPromise: true }, s);
  const shot = await cdp.send(
    "Page.captureScreenshot",
    page.action || VIEWPORT !== null
      ? { format: "png", clip: { x: 0, y: VIEWPORT || 0, width, height: 900, scale: 1 } }
      : { format: "png", captureBeyondViewport: true },
    s,
  );
  await cdp.send("Target.closeTarget", { targetId });
  return Buffer.from(shot.data, "base64");
}

/* ---------- PNG decode / encode (8-bit RGB or RGBA, non-interlaced) ---------- */

const CRC_TABLE = new Int32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c;
});
function crc32(buf) {
  let c = -1;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}

function decodePng(buf) {
  let pos = 8;
  let width = 0, height = 0, channels = 4;
  const idat = [];
  while (pos < buf.length) {
    const len = buf.readUInt32BE(pos);
    const type = buf.toString("ascii", pos + 4, pos + 8);
    const data = buf.subarray(pos + 8, pos + 8 + len);
    if (type === "IHDR") {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      const depth = data[8], color = data[9], interlace = data[12];
      if (depth !== 8 || interlace !== 0 || (color !== 6 && color !== 2)) throw new Error("unsupported PNG layout");
      channels = color === 6 ? 4 : 3;
    } else if (type === "IDAT") idat.push(data);
    pos += 12 + len;
  }
  const raw = inflateSync(Buffer.concat(idat));
  const stride = width * channels;
  const out = Buffer.alloc(width * height * 4);
  let prev = Buffer.alloc(stride);
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)];
    const line = Buffer.from(raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1)));
    for (let i = 0; i < stride; i++) {
      const a = i >= channels ? line[i - channels] : 0;
      const b = prev[i];
      const c = i >= channels ? prev[i - channels] : 0;
      let add = 0;
      if (filter === 1) add = a;
      else if (filter === 2) add = b;
      else if (filter === 3) add = (a + b) >> 1;
      else if (filter === 4) {
        const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
        add = pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      }
      line[i] = (line[i] + add) & 0xff;
    }
    for (let x = 0; x < width; x++) {
      const o = (y * width + x) * 4, i = x * channels;
      out[o] = line[i]; out[o + 1] = line[i + 1]; out[o + 2] = line[i + 2];
      out[o + 3] = channels === 4 ? line[i + 3] : 255;
    }
    prev = line;
  }
  return { width, height, data: out };
}

function encodePng({ width, height, data }) {
  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0;
    data.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }
  const chunk = (type, body) => {
    const len = Buffer.alloc(4); len.writeUInt32BE(body.length);
    const tb = Buffer.concat([Buffer.from(type, "ascii"), body]);
    const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(tb));
    return Buffer.concat([len, tb, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0); ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

/* ---------- compare ---------- */

function masked(x, y) {
  return MASKS.some(([mx, my, mw, mh]) => x >= mx && x < mx + mw && y >= my && y < my + mh);
}

function compare(aBuf, bBuf, diffFile) {
  const a = decodePng(aBuf), b = decodePng(bBuf);
  if (a.width !== b.width || a.height !== b.height) {
    return { differing: Infinity, note: `size ${a.width}x${a.height} vs ${b.width}x${b.height}` };
  }
  const diff = Buffer.alloc(a.data.length);
  let differing = 0;
  let minX = a.width, minY = a.height, maxX = -1, maxY = -1;
  for (let y = 0; y < a.height; y++) {
    for (let x = 0; x < a.width; x++) {
      const o = (y * a.width + x) * 4;
      const same =
        a.data[o] === b.data[o] && a.data[o + 1] === b.data[o + 1] && a.data[o + 2] === b.data[o + 2] && a.data[o + 3] === b.data[o + 3];
      if (same || masked(x, y)) {
        diff[o] = 255 - ((255 - a.data[o]) >> 2);
        diff[o + 1] = 255 - ((255 - a.data[o + 1]) >> 2);
        diff[o + 2] = 255 - ((255 - a.data[o + 2]) >> 2);
      } else {
        differing++;
        if (x < minX) minX = x; if (x > maxX) maxX = x; if (y < minY) minY = y; if (y > maxY) maxY = y;
        diff[o] = 220; diff[o + 1] = 30; diff[o + 2] = 30;
      }
      diff[o + 3] = 255;
    }
  }
  if (differing > 0) {
    writeFileSync(diffFile, encodePng({ width: a.width, height: a.height, data: diff }));
    writeCrop(a, b, { width: a.width, height: a.height, data: diff }, [minX, minY, maxX, maxY], diffFile.replace(/\.diff\.png$/, ".crop.png"));
  }
  return { differing, total: a.width * a.height, box: differing ? [minX, minY, maxX - minX + 1, maxY - minY + 1] : null };
}

/* baseline | current | diff, cropped to the differing area with 24px of context */
function writeCrop(a, b, d, [x0, y0, x1, y1], file) {
  const pad = 24;
  const cx = Math.max(0, x0 - pad), cy = Math.max(0, y0 - pad);
  const cw = Math.min(a.width - cx, x1 - x0 + 1 + pad * 2, 1400);
  const ch = Math.min(a.height - cy, y1 - y0 + 1 + pad * 2, 1400);
  const gap = 8;
  const W = cw * 3 + gap * 2, H = ch;
  const out = Buffer.alloc(W * H * 4, 255);
  [a, b, d].forEach((img, i) => {
    for (let y = 0; y < ch; y++) {
      const src = ((cy + y) * img.width + cx) * 4;
      img.data.copy(out, (y * W + i * (cw + gap)) * 4, src, src + cw * 4);
    }
  });
  writeFileSync(file, encodePng({ width: W, height: H, data: out }));
}

/* ---------- main ---------- */

const server = await startServer();
const cdp = await startChrome();
mkdirSync(OUT, { recursive: true });
const report = [];
let failed = 0;
try {
  for (const page of pages) {
    for (const width of WIDTHS) {
      const name = `${page.id}-${width}.png`;
      const png = await shoot(cdp, page, width);
      writeFileSync(join(OUT, name), png);
      const row = { name };
      if (COMPARE) {
        const base = join(COMPARE, name);
        if (!existsSync(base)) row.result = "no baseline";
        else {
          const r = compare(readFileSync(base), png, join(OUT, name.replace(/\.png$/, ".diff.png")));
          row.result = r.differing === 0 ? "same" : r.note ?? `${r.differing} px (${((100 * r.differing) / r.total).toFixed(3)}%) at ${r.box.join(",")}`;
          if (r.differing > ALLOW) failed++;
        }
      }
      report.push(row);
      console.log(`${name.padEnd(28)} ${row.result ?? "captured"}`);
    }
  }
} finally {
  await cdp.close();
  server.kill();
  if (extracted) rmSync(extracted, { recursive: true, force: true });
}
writeFileSync(join(OUT, "report.json"), JSON.stringify({ theme: THEME, scheme: SCHEME, compare: COMPARE, report }, null, 2));
if (COMPARE) {
  console.log(failed ? `\n${failed} screenshot(s) differ from ${COMPARE}` : `\nAll screenshots match ${COMPARE}`);
  process.exit(failed ? 1 : 0);
}
