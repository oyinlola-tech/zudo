/**
 * The recording doubles record at the bus, message bus and queue level,
 * so every path records, and each double stands in for the real type.
 * createTestApplication is quiet and deterministic by default.
 */

import { afterEach, describe, expect, expectTypeOf, it, vi } from "vitest";

import { EventBus, type Event, type EventId } from "@zudojs/events";
import type { MessageBus } from "@zudojs/messaging";
import { createQueueName, type Queue } from "@zudojs/queue";
import { createLogger } from "@zudojs/logger";

import {
  createSpyLogger,
  createTestApplication,
  createTestClock,
  createTestEventBus,
  createTestMessageBus,
  createTestQueue,
  DEFAULT_TEST_APPLICATION_TIME,
} from "../src/index.js";

/** Code under test that takes the real EventBus type. */
async function registerUser(events: EventBus, id: string): Promise<void> {
  await events.publishEvent({ type: "user.created", payload: { id } });
}

describe("createTestEventBus records every publish path", () => {
  it("records publishEvent called on bus", async () => {
    const events = createTestEventBus();

    await events.bus.publishEvent({ type: "user.created", payload: { id: "1" } });

    expect(events.published).toHaveLength(1);
    expect(events.findByType("user.created")[0]!.event.payload).toEqual({ id: "1" });
    events.dispose();
  });

  it("records publish of a full Event, emit, and publish of an EventInput, once each", async () => {
    const events = createTestEventBus();
    const full: Event<{ n: number }> = {
      id: "evt_fixed" as EventId,
      type: "n.full",
      payload: { n: 1 },
      timestamp: new Date(),
    };

    await events.bus.publish(full);
    await events.emit({ type: "n.emit", payload: { n: 2 } });
    await events.emit({ ...full, id: "evt_emit_full" as EventId, type: "n.emitFull" });
    await events.publish({ type: "n.input", payload: { n: 3 } });

    expect(events.published.map((r) => r.event.type)).toEqual([
      "n.full",
      "n.emit",
      "n.emitFull",
      "n.input",
    ]);
    expect(events.published[0]!.event.id).toBe("evt_fixed");
    events.dispose();
  });

  it("stands in for an EventBus and still runs handlers", async () => {
    const events = createTestEventBus();
    const seen: unknown[] = [];
    events.on("user.created", (event) => {
      seen.push(event.payload);
    });

    await registerUser(events, "ann");

    expectTypeOf(events).toMatchTypeOf<EventBus>();
    expect(events).toBeInstanceOf(EventBus);
    expect(events.bus).toBe(events);
    expect(seen).toEqual([{ id: "ann" }]);
    expect(events.findByType("user.created")).toHaveLength(1);
    events.dispose();
  });

  it("keeps destructured methods working", async () => {
    const { publish, findByType, clear, dispose } = createTestEventBus();

    await publish({ type: "a", payload: null });
    expect(findByType("a")).toHaveLength(1);
    clear();
    expect(findByType("a")).toHaveLength(0);
    dispose();
  });
});

describe("createTestMessageBus records every dispatch path", () => {
  it("records send and dispatch called on bus", async () => {
    const messages = createTestMessageBus();
    messages.on("email.send", async () => "sent");

    await messages.bus.send({ type: "email.send", payload: { to: "a@b.c" } });
    await messages.dispatch({
      id: "msg_1" as never,
      type: "email.send",
      payload: { to: "d@e.f" },
      timestamp: new Date(),
    });
    await messages.send({ type: "email.send", payload: { to: "g@h.i" } });

    expect(messages.dispatched).toHaveLength(3);
    expect(messages.findByType("email.send").map((d) => d.message.payload)).toEqual([
      { to: "a@b.c" },
      { to: "d@e.f" },
      { to: "g@h.i" },
    ]);
    messages.dispose();
  });

  it("stands in for a MessageBus", () => {
    const messages = createTestMessageBus();
    const asBus: MessageBus = messages;

    expectTypeOf(messages).toMatchTypeOf<MessageBus>();
    expect(asBus).toBe(messages.bus);
    messages.dispose();
  });
});

describe("createTestQueue records every add", () => {
  it("records add called on the underlying queue", async () => {
    const reminders = createTestQueue<{ taskId: number }>(createQueueName("reminders"));

    await reminders.queue.add("remind", { taskId: 1 });
    await reminders.add("remind", { taskId: 2 });

    expect(reminders.jobs.map((r) => r.job.data)).toEqual([{ taskId: 1 }, { taskId: 2 }]);
    expect(reminders.findByName("remind")).toHaveLength(2);
    await reminders.close();
  });

  it("stands in for a Queue and survives destructuring", async () => {
    const testQueue = createTestQueue<string>(createQueueName("q"));
    const schedule = (queue: Queue<string>) => queue.add("job", "payload");
    const { add, findByName, close } = testQueue;

    await schedule(testQueue);
    await add("job", "again");

    expectTypeOf(testQueue).toMatchTypeOf<Queue<string>>();
    expect(findByName("job")).toHaveLength(2);
    expect((await testQueue.getStats()).waiting).toBe(2);
    await close();
  });
});

describe("createTestApplication defaults", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("uses a silent recording logger", async () => {
    const stdout = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    const stderr = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    const app = createTestApplication({ name: "quiet" });

    app.logger.info("hello", { id: 1 });
    app.logger.error("boom");
    await app.dispose();

    expect(stdout).not.toHaveBeenCalled();
    expect(stderr).not.toHaveBeenCalled();
    expect(app.logger.calls.map((c) => c.message)).toEqual(["hello", "boom"]);
  });

  it("pins the clock at a fixed instant", async () => {
    const app = createTestApplication();

    expect(app.clock.timestamp).toBe(DEFAULT_TEST_APPLICATION_TIME);
    expect(app.clock.now.toISOString()).toBe("2026-01-01T00:00:00.000Z");
    await app.dispose();
  });

  it("opts back into a chosen start time, clock or logger", async () => {
    const started = createTestApplication({ startTime: "2030-05-05T00:00:00Z" });
    expect(started.clock.now.toISOString()).toBe("2030-05-05T00:00:00.000Z");

    const clock = createTestClock(42);
    const spy = createSpyLogger("mine");
    const custom = createTestApplication({ clock, logger: spy });
    expect(custom.clock).toBe(clock);
    expect(custom.logger).toBe(spy);

    const real = createLogger({ name: "loud", transports: [] });
    const loud = createTestApplication({ logger: real });
    expectTypeOf(loud.logger).toEqualTypeOf(real);
    expect(loud.logger).toBe(real);

    await Promise.all([started.dispose(), custom.dispose(), loud.dispose()]);
  });
});
