/**
 * @zudojs/events — wildcard depth.
 *
 * Pins the documented semantics: a namespace wildcard is multi-level, so
 * "task.*" matches "task.sub.created" as well as "task.created" and the
 * bare "task". There is no single-level wildcard.
 */

import { describe, expect, it } from "vitest";

import {
  createEventBus,
  getEventTypeSegments,
  isValidEventTypePattern,
  matchesEventType,
} from "../src/index.js";

describe("namespace wildcards are multi-level", () => {
  it("matches every depth under the namespace and the namespace itself", () => {
    expect(matchesEventType("task", "task.*")).toBe(true);
    expect(matchesEventType("task.created", "task.*")).toBe(true);
    expect(matchesEventType("task.sub.created", "task.*")).toBe(true);
  });

  it("matches whole segments, not string prefixes", () => {
    expect(matchesEventType("tasks.created", "task.*")).toBe(false);
    expect(matchesEventType("task.created.v2", "task.created")).toBe(false);
  });

  it("has no single-level or mid-pattern wildcard", () => {
    expect(isValidEventTypePattern("task.*.created")).toBe(false);
    expect(isValidEventTypePattern("task.cre*")).toBe(false);
  });

  it("delivers nested events to a namespace subscriber, filterable by depth", async () => {
    const bus = createEventBus();
    const all: string[] = [];
    const direct: string[] = [];
    bus.on("task.*", (event) => {
      all.push(event.type);
      if (getEventTypeSegments(event.type).length === 2) direct.push(event.type);
    });

    await bus.publishEvent({ type: "task.created", payload: {} });
    await bus.publishEvent({ type: "task.sub.created", payload: {} });

    expect(all).toEqual(["task.created", "task.sub.created"]);
    expect(direct).toEqual(["task.created"]);
  });
});
