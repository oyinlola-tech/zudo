/**
 * @zudojs/cqrs — Round 12 regression tests.
 *
 * One describe block per finding.
 */

import { describe, it, expect, expectTypeOf } from "vitest";

import {
  CommandHandlerFor,
  HandlerConfigurationError,
  HandlerRegistry,
  QueryHandlerFor,
  collectDecoratedHandlers,
  createCommand,
  createCommandBus,
  createCqrsEvent,
  createQuery,
  createQueryBus,
  errorMiddleware,
  getCommandHandlerMetadata,
  getCqrsType,
  isCqrsHandler,
  registerDecoratedHandlers,
  toCqrsError,
} from "../src/index.js";
import type { CommandOf, CqrsEvent, QueryOf } from "../src/index.js";

/* ─── #108: instanceof BaseError missed errors from a second errors copy ── */

/**
 * What a `BaseError` from another installed copy of `@zudojs/errors` looks
 * like: the same brand and shape, a different prototype chain.
 */
class ForeignBaseError extends Error {
  readonly code = "ERR_FOREIGN_TEAPOT";
  readonly category = "domain";
  readonly severity = "warning";
  readonly statusCode = 418;
  readonly expose = true;
  readonly isOperational = true;
  readonly metadata = Object.freeze({ teapot: true });

  constructor() {
    super("I am a teapot");
    Object.defineProperty(this, Symbol.for("@zudojs/errors.BaseError"), {
      value: true,
      enumerable: false,
    });
  }

  toJSON(): Record<string, unknown> {
    return { code: this.code, message: this.message };
  }
}

describe("#108", () => {
  it("lets a foreign BaseError through errorMiddleware unchanged", async () => {
    const foreign = new ForeignBaseError();
    const bus = createCommandBus({ middleware: [errorMiddleware()] });
    bus.register("Brew", () => {
      throw foreign;
    });

    await expect(bus.execute({ type: "Brew" })).rejects.toBe(foreign);
  });

  it("keeps a foreign BaseError's code and status in toCqrsError", () => {
    const converted = toCqrsError(new ForeignBaseError());

    expect(converted.code).toBe("ERR_FOREIGN_TEAPOT");
    expect(converted.statusCode).toBe(418);
    expect(converted.expose).toBe(true);
    expect(converted.metadata).toMatchObject({ teapot: true });
  });

  it("still wraps a plain Error as a non-operational 500", () => {
    const converted = toCqrsError(new Error("boom"));

    expect(converted.statusCode).toBe(500);
    expect(converted.isOperational).toBe(false);
    expect(converted.message).toBe("boom");
  });
});

/* ─── #89: CommandOf/QueryOf rejected interface payloads (TS2344) ───────── */

interface PlaceOrderPayload {
  readonly orderId: string;
  readonly quantity: number;
}

describe("#89", () => {
  it("accepts an interface as the payload of CommandOf, QueryOf and CqrsEvent", () => {
    type PlaceOrder = CommandOf<"PlaceOrder", PlaceOrderPayload>;
    type FindOrder = QueryOf<"FindOrder", PlaceOrderPayload>;

    const command = createCommand("PlaceOrder", {
      orderId: "o1",
      quantity: 2,
    } as PlaceOrderPayload);
    const query = createQuery("FindOrder", { orderId: "o1", quantity: 2 } as PlaceOrderPayload);
    const event = createCqrsEvent<PlaceOrderPayload>({
      type: "order.placed",
      payload: { orderId: "o1", quantity: 2 },
    });

    expectTypeOf(command).toMatchTypeOf<PlaceOrder>();
    expectTypeOf(query).toMatchTypeOf<FindOrder>();
    expectTypeOf(event).toMatchTypeOf<CqrsEvent<PlaceOrderPayload>>();
    expectTypeOf<PlaceOrder["orderId"]>().toEqualTypeOf<string>();

    expect(command).toEqual({ type: "PlaceOrder", orderId: "o1", quantity: 2 });
    expect(event.payload.quantity).toBe(2);
  });
});

/* ─── #44: decorators only marked classes; marks leaked to subclasses ───── */

@CommandHandlerFor("PlaceOrder")
class PlaceOrderHandler {
  execute(command: { readonly type: string; readonly orderId?: string }) {
    return `placed:${command.orderId ?? "?"}`;
  }
}

@QueryHandlerFor("FindOrder")
class FindOrderHandler {
  execute() {
    return { found: true };
  }
}

class SpecialisedPlaceOrderHandler extends PlaceOrderHandler {}

class UndecoratedHandler {
  execute() {
    return undefined;
  }
}

describe("#44", () => {
  it("does not report a subclass as decorated unless it is decorated itself", () => {
    expect(getCqrsType(PlaceOrderHandler)).toBe("PlaceOrder");
    expect(getCqrsType(SpecialisedPlaceOrderHandler)).toBeUndefined();
    expect(getCommandHandlerMetadata(SpecialisedPlaceOrderHandler)).toBeUndefined();
    expect(isCqrsHandler(SpecialisedPlaceOrderHandler)).toBe(false);
  });

  it("keeps the literal type argument", () => {
    const decorator = CommandHandlerFor("PlaceOrder");
    expectTypeOf(decorator).toEqualTypeOf<ClassDecorator>();
    expectTypeOf(CommandHandlerFor<"PlaceOrder">).parameter(0).toEqualTypeOf<"PlaceOrder">();
  });

  it("registers decorated instances on the buses under their decorated type", async () => {
    const commandBus = createCommandBus();
    const queryBus = createQueryBus();

    const entries = registerDecoratedHandlers({ commandBus, queryBus }, [
      new PlaceOrderHandler(),
      new FindOrderHandler(),
    ]);

    expect(entries.map((entry) => `${entry.kind}:${entry.type}`)).toEqual([
      "command:PlaceOrder",
      "query:FindOrder",
    ]);
    await expect(
      commandBus.execute<{ type: "PlaceOrder"; orderId: string }, string>({
        type: "PlaceOrder",
        orderId: "o9",
      }),
    ).resolves.toBe("placed:o9");
    await expect(queryBus.execute({ type: "FindOrder" })).resolves.toEqual({
      found: true,
    });
  });

  it("registers decorated instances on a HandlerRegistry", () => {
    const registry = new HandlerRegistry();

    registerDecoratedHandlers(registry, [new PlaceOrderHandler()]);

    expect(registry.hasCommand("PlaceOrder")).toBe(true);
  });

  it("refuses an undecorated instance and a missing bus loudly", () => {
    expect(() => collectDecoratedHandlers([new UndecoratedHandler()])).toThrow(
      HandlerConfigurationError,
    );
    expect(() =>
      registerDecoratedHandlers({ commandBus: createCommandBus() }, [
        new FindOrderHandler(),
      ]),
    ).toThrow(HandlerConfigurationError);
  });
});
