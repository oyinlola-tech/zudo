/**
 * Child-process fixture for the SIGTERM keep-alive regression.
 *
 * Runs under plain `node` against the built `dist/`, with nothing but the
 * runtime to keep the event loop alive. Argument:
 *
 * - "clean": signals itself after start; `onShutdown` succeeds.
 * - "fail": signals itself after start; `onShutdown` throws.
 * - "external": holds a server open until signalled by the parent, and
 *   closes it first thing in `onShutdown`, before its async work.
 */

import { createServer } from "node:net";

import { createContainer } from "@zudojs/container";
import { createEventBus } from "@zudojs/events";
import { createLogger } from "@zudojs/logger";

import { createRuntime } from "../../dist/index.js";

const mode = process.argv[2] ?? "clean";
const events = [];

const pause = (ms) =>
  new Promise((resolve) => {
    setTimeout(resolve, ms).unref();
  });

const server = createServer();

const module = {
  id: "worker",
  name: "worker",
  dependencies: [],
  onInitialize: async () => undefined,
  onReady: async () => {
    if (mode === "external") {
      await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
    }
  },
  onShutdown: async () => {
    if (server.listening) server.close();
    await pause(50);
    events.push("onShutdown");
    if (mode === "fail") throw new Error("shutdown failed");
  },
  onDestroy: async () => undefined,
};

const runtime = createRuntime(
  {
    modules: new Map([["worker", module]]),
    logger: createLogger({ name: "fixture", level: "fatal" }),
    container: createContainer(),
    eventBus: createEventBus(),
  },
  {
    environment: "test",
    applicationName: "fixture",
    handleSignals: true,
    handleFatalErrors: false,
  },
);

process.on("exit", (code) => {
  process.stdout.write(
    JSON.stringify({ code, state: runtime.state, events }) + "\n",
  );
});

await runtime.start();

if (mode === "external") {
  process.stdout.write("ready\n");
} else {
  process.kill(process.pid, "SIGTERM");
}
