/**
 * @zudojs/events — Round 12 regression tests.
 *
 * One describe block per finding.
 */

import { describe, it, expect, expectTypeOf } from "vitest";

import {
  EventErrorMode,
  createEventBus,
  createEventEmitter,
  createTypedEventBus,
  defineEventTypes,
} from "../src/index.js";
import type {
  Event,
  EventTypeOf,
  EventUnion,
  PayloadOf,
  TypedEvent,
} from "../src/index.js";

interface OrderPlaced {
  readonly orderId: string;
  readonly total: number;
}

interface StockLow {
  readonly sku: string;
}

/** An interface, not a type alias: it has no implicit index signature. */
interface OrderEvents {
  readonly "order.placed": OrderPlaced;
  readonly "stock.low": StockLow;
}

/* ─── #45: bus.on<Event<P>>(type) never checked P against the type ──────── */

describe("#45", () => {
  it("ties the handler's payload type to the event type it subscribes to", async () => {
    const orders = createTypedEventBus<OrderEvents>(createEventBus());
    const totals: number[] = [];
    const skus: string[] = [];

    orders.on("order.placed", (event) => {
      expectTypeOf(event.payload).toEqualTypeOf<OrderPlaced>();
      expectTypeOf(event.type).toEqualTypeOf<"order.placed">();
      totals.push(event.payload.total);
    });
    orders.once("stock.low", { handle: (event) => void skus.push(event.payload.sku) });
    orders.onAny((event) => {
      if (event.type === "stock.low") {
        expectTypeOf(event.payload).toEqualTypeOf<StockLow>();
      }
    });

    const result = await orders.publish("order.placed", { orderId: "o1", total: 42 });
    await orders.publish("stock.low", { sku: "A1" });
    await orders.publish("stock.low", { sku: "B2" });

    expect(totals).toEqual([42]);
    expect(skus).toEqual(["A1"]);
    expect(result.event.type).toBe("order.placed");
    expect(result.event.payload.total).toBe(42);
    expectTypeOf(result.event).toEqualTypeOf<TypedEvent<OrderEvents, "order.placed">>();

    // @ts-expect-error — "stock.low" carries a StockLow, not an OrderPlaced.
    orders.on("stock.low", (event: Event<OrderPlaced>) => void event);
    // @ts-expect-error — not an event type in the map.
    orders.on("order.shipped", () => undefined);
    // @ts-expect-error — payload does not match the event type.
    void orders.publish("order.placed", { sku: "A1" });
  });

  it("forwards publish metadata and exposes the underlying bus", async () => {
    const bus = createEventBus();
    const orders = createTypedEventBus<OrderEvents>(bus);
    let seenSource: string | undefined;

    bus.on("order.placed", (event) => {
      seenSource = event.source;
    });

    const result = await orders.publish(
      "order.placed",
      { orderId: "o2", total: 1 },
      { source: "checkout", correlationId: "corr-1" },
    );

    expect(orders.bus).toBe(bus);
    expect(seenSource).toBe("checkout");
    expect(result.event.correlationId).toBe("corr-1");
    expect(result.handlerCount).toBe(1);
  });
});

/* ─── #46: EventUnion/PayloadOf/EventTypeOf rejected interfaces ─────────── */

describe("#46", () => {
  it("accepts an interface as the payload map", () => {
    expectTypeOf<EventTypeOf<OrderEvents>>().toEqualTypeOf<
      "order.placed" | "stock.low"
    >();
    expectTypeOf<PayloadOf<OrderEvents, "stock.low">>().toEqualTypeOf<StockLow>();

    type Union = EventUnion<OrderEvents>;
    const narrow = (event: Union): string =>
      event.type === "order.placed" ? event.payload.orderId : event.payload.sku;
    expectTypeOf(narrow).parameter(0).toMatchTypeOf<Event>();

    const types = defineEventTypes({
      "order.placed": { orderId: "", total: 0 } as OrderPlaced,
      "stock.low": { sku: "" } as StockLow,
    });
    expectTypeOf<EventTypeOf<typeof types>>().toEqualTypeOf<
      "order.placed" | "stock.low"
    >();
    expect(Object.isFrozen(types)).toBe(true);
  });
});

/* ─── #47: errorMode documented as THROW while the bus defaults CONTINUE ── */

describe("#47", () => {
  it("does not reject publish() for a throwing handler on a default bus", async () => {
    const bus = createEventBus();
    bus.on("doc.claim", () => {
      throw new Error("handler failed");
    });

    const result = await bus.publishEvent({ type: "doc.claim", payload: {} });

    expect(result.failed).toBe(1);
    expect(result.errors).toHaveLength(1);
  });

  it("rejects publish() only when THROW is configured", async () => {
    const bus = createEventBus({
      emitter: { errorMode: EventErrorMode.THROW },
    });
    bus.on("doc.claim", () => {
      throw new Error("handler failed");
    });

    await expect(
      bus.publishEvent({ type: "doc.claim", payload: {} }),
    ).rejects.toThrow();
  });

  it("keeps THROW as the standalone emitter default", async () => {
    const emitter = createEventEmitter();
    emitter.on("doc.claim", () => {
      throw new Error("handler failed");
    });

    await expect(
      emitter.emit({
        id: "evt-1" as never,
        type: "doc.claim",
        payload: {},
        timestamp: new Date().toISOString() as never,
      }),
    ).rejects.toThrow();
  });
});
