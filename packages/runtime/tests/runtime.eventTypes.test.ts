/**
 * `RuntimeEventType` must name every event in `RuntimeEventMap`. The
 * hand-written union lacked "runtime.initialized" and "runtime.starting",
 * which the runtime publishes and the map declares, so code typed against
 * `RuntimeEventType` could not name them. The union is now derived from the
 * map (`keyof RuntimeEventMap`), so the two cannot drift again.
 *
 * Checked by `pnpm typecheck` (tsconfig.test.json) and by Vitest.
 */

import { describe, expect, expectTypeOf, it } from "vitest";

import type {
  RuntimeEventMap,
  RuntimeEventType,
  RuntimeModuleEventPayload,
  RuntimeModuleEventType,
} from "../src/index.js";

describe("RuntimeEventType", () => {
  it("is exactly the set of RuntimeEventMap keys", () => {
    expectTypeOf<RuntimeEventType>().toEqualTypeOf<keyof RuntimeEventMap>();

    const initialized: RuntimeEventType = "runtime.initialized";
    const starting: RuntimeEventType = "runtime.starting";

    expect([initialized, starting]).toEqual([
      "runtime.initialized",
      "runtime.starting",
    ]);
  });

  it("keeps RuntimeModuleEventType to the module events, each with a module payload", () => {
    expectTypeOf<RuntimeModuleEventType>().toEqualTypeOf<
      | "runtime.module.initializing"
      | "runtime.module.initialized"
      | "runtime.module.starting"
      | "runtime.module.started"
      | "runtime.module.stopping"
      | "runtime.module.stopped"
      | "runtime.module.failed"
    >();
    expectTypeOf<
      RuntimeEventMap[RuntimeModuleEventType]
    >().toEqualTypeOf<RuntimeModuleEventPayload>();
  });
});
