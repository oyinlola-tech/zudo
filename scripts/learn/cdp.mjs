/**
 * Minimal Chrome DevTools Protocol driver for the Learn checks.
 *
 * Launches headless Chromium, opens one page, and exposes `goto` and
 * `evaluate`. Uses Node's built-in WebSocket, so it needs no dependencies.
 */

import { spawn } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const CHROME_CANDIDATES = [process.env.CHROME_PATH, "/usr/bin/chromium", "/usr/bin/chromium-browser", "/usr/bin/google-chrome"];

async function waitForJson(url, timeoutMs) {
  const until = Date.now() + timeoutMs;
  for (;;) {
    try {
      const res = await fetch(url);
      if (res.ok) return await res.json();
    } catch {
      /* browser still starting */
    }
    if (Date.now() > until) throw new Error("Chromium did not start: " + url);
    await new Promise((r) => setTimeout(r, 100));
  }
}

export async function launchBrowser({ width = 1280, height = 900 } = {}) {
  const chrome = CHROME_CANDIDATES.find(Boolean);
  const port = 9300 + Math.floor(Math.random() * 500);
  const profile = mkdtempSync(join(tmpdir(), "zudo-learn-chrome-"));
  const proc = spawn(
    chrome,
    [
      "--headless=new",
      "--no-sandbox",
      "--disable-gpu",
      "--no-first-run",
      "--no-default-browser-check",
      `--remote-debugging-port=${port}`,
      `--user-data-dir=${profile}`,
      `--window-size=${width},${height}`,
      "about:blank",
    ],
    { stdio: "ignore" },
  );

  const targets = await waitForJson(`http://127.0.0.1:${port}/json/list`, 15000);
  const page = targets.find((t) => t.type === "page");
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    ws.onopen = resolve;
    ws.onerror = reject;
  });

  let nextId = 1;
  const pending = new Map();
  const listeners = [];
  ws.onmessage = (event) => {
    const msg = JSON.parse(event.data);
    if (msg.id && pending.has(msg.id)) {
      const { resolve, reject } = pending.get(msg.id);
      pending.delete(msg.id);
      msg.error ? reject(new Error(msg.error.message)) : resolve(msg.result);
    } else if (msg.method) {
      for (const l of listeners.slice()) l(msg);
    }
  };

  function send(method, params = {}) {
    const id = nextId++;
    ws.send(JSON.stringify({ id, method, params }));
    return new Promise((resolve, reject) => pending.set(id, { resolve, reject }));
  }

  function once(method, timeoutMs = 30000) {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("timed out waiting for " + method)), timeoutMs);
      const l = (msg) => {
        if (msg.method !== method) return;
        clearTimeout(timer);
        listeners.splice(listeners.indexOf(l), 1);
        resolve(msg.params);
      };
      listeners.push(l);
    });
  }

  const consoleErrors = [];
  listeners.push((msg) => {
    if (msg.method === "Runtime.exceptionThrown") {
      consoleErrors.push(msg.params.exceptionDetails.exception?.description || msg.params.exceptionDetails.text);
    }
  });

  await send("Page.enable");
  await send("Runtime.enable");

  return {
    consoleErrors,
    async goto(url) {
      const loaded = once("Page.loadEventFired");
      await send("Page.navigate", { url });
      await loaded;
    },
    async evaluate(expression, timeoutMs = 60000) {
      const result = await Promise.race([
        send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true }),
        new Promise((_, reject) => setTimeout(() => reject(new Error("evaluate timed out")), timeoutMs)),
      ]);
      if (result.exceptionDetails) {
        throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
      }
      return result.result.value;
    },
    async screenshot(width, height) {
      await send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile: width < 600 });
      const { data } = await send("Page.captureScreenshot", { format: "png", captureBeyondViewport: false });
      return Buffer.from(data, "base64");
    },
    async close() {
      try {
        ws.close();
      } catch {
        /* already closed */
      }
      proc.kill("SIGKILL");
      await new Promise((r) => setTimeout(r, 200));
      rmSync(profile, { recursive: true, force: true });
    },
  };
}
