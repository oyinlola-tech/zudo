/**
 * A module failure during startup used to publish `runtime.failed` twice:
 * once from executeStartup (with the failing module) and again from the
 * runtime's own catch.
 */

import { describe, expect, it } from "vitest";
import type { Module } from "@zudojs/core";
import { createLogger } from "@zudojs/logger";
import { createContainer } from "@zudojs/container";
import { createEventBus } from "@zudojs/events";

import { createRuntime } from "../src/index.js";

async function failedEvents(module: Module): Promise<unknown[]> {
  const eventBus = createEventBus();
  const seen: unknown[] = [];
  eventBus.on("runtime.failed", (event: { payload: unknown }) => {
    seen.push(event.payload);
  });
  const runtime = createRuntime(
    {
      modules: new Map([[module.id, module]]),
      logger: createLogger({ name: "startup-once", enabled: false }),
      container: createContainer(),
      eventBus,
    },
    { environment: "test", applicationName: "once", handleSignals: false, handleFatalErrors: false },
  );
  await runtime.start().catch(() => undefined);
  await runtime.stop().catch(() => undefined);
  await new Promise((resolve) => setTimeout(resolve, 20));
  return seen;
}

describe("runtime.failed during startup", () => {
  it("is published once for an onInitialize failure, naming the module", async () => {
    const seen = await failedEvents({
      id: "db",
      name: "Db",
      onInitialize: () => {
        throw new Error("db down");
      },
    } as Module);
    expect(seen).toHaveLength(1);
    expect(seen[0]).toMatchObject({ failedModuleId: "db" });
  });

  it("is published once for an onReady (start step) failure, naming the module", async () => {
    const seen = await failedEvents({
      id: "http",
      name: "Http",
      onReady: () => {
        throw new Error("port in use");
      },
    } as Module);
    expect(seen).toHaveLength(1);
    expect(seen[0]).toMatchObject({ failedModuleId: "http" });
  });
});
