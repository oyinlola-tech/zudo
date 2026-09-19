import { describe, expect, it } from "vitest";

import { schema } from "@zudojs/schema";

import {
  APIExecutor,
  APIOperationRegistry,
  createAPIContext,
  defineOperation,
  isAPISchema,
} from "../src/index.js";

describe("edge/API-01", () => {
  const input = schema.object({
    id: schema.string().uuid(),
    amount: schema.number().min(1).max(100),
  });
  const output = schema.object({ ok: schema.boolean() });

  it("validates input against a @zudojs/schema schema", async () => {
    let reached = false;
    const op = defineOperation({
      name: "payments.charge",
      input,
      handler: async () => {
        reached = true;
        return {};
      },
    });

    const result = await new APIExecutor().execute(
      op,
      { id: "not-a-uuid", amount: -1e9 },
      createAPIContext("req-1", {}),
    );

    expect(reached).toBe(false);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.statusCode).toBe(422);
  });

  it("validates and strips output with a @zudojs/schema schema", async () => {
    const bad = defineOperation({
      name: "payments.bad",
      output,
      handler: async () => ({ ok: "yes" }) as unknown as { ok: boolean },
    });
    const leaky = defineOperation({
      name: "payments.leaky",
      output,
      handler: async () => ({ ok: true, passwordHash: "$2b$..." }),
    });
    const executor = new APIExecutor();

    const badResult = await executor.execute(
      bad,
      {},
      createAPIContext("r", {}),
    );
    const leakyResult = await executor.execute(
      leaky,
      {},
      createAPIContext("r", {}),
    );

    expect(badResult.ok).toBe(false);
    if (!badResult.ok) expect(badResult.error.statusCode).toBe(500);
    expect(leakyResult).toMatchObject({ ok: true, data: { ok: true } });
    if (leakyResult.ok)
      expect(leakyResult.data).not.toHaveProperty("passwordHash");
  });

  it("recognises @zudojs/schema and Standard Schema, nothing else", () => {
    expect(isAPISchema(input)).toBe(true);
    expect(
      isAPISchema({ "~standard": { validate: () => ({ value: 1 }) } }),
    ).toBe(true);
    expect(isAPISchema({ parse: () => ({}) })).toBe(false);
    expect(isAPISchema({ type: "object" })).toBe(false);
  });

  it("rejects an unrecognised schema at definition and registration", () => {
    const handler = async (): Promise<unknown> => ({});
    expect(() =>
      defineOperation({ name: "a.in", input: { type: "object" }, handler }),
    ).toThrow(TypeError);
    expect(() =>
      defineOperation({
        name: "a.out",
        output: { parse: () => ({}) },
        handler,
      }),
    ).toThrow(TypeError);
    expect(() =>
      new APIOperationRegistry().register({
        name: "a.reg",
        input: {},
        handler,
      }),
    ).toThrow(TypeError);
  });

  it("fails closed in the executor for a hand-rolled unrecognised schema", async () => {
    let reached = false;
    const op = {
      name: "raw.op",
      input: { type: "object" },
      handler: async () => {
        reached = true;
        return {};
      },
    };

    const result = await new APIExecutor().execute(
      op,
      {},
      createAPIContext("r", {}),
    );

    expect(result.ok).toBe(false);
    expect(reached).toBe(false);
  });

  it("fails closed on a safeParse result in an unknown shape", async () => {
    const op = defineOperation({
      name: "weird.op",
      input: { safeParse: () => ({ valid: true }) },
      handler: async () => ({}),
    });

    const result = await new APIExecutor().execute(
      op,
      {},
      createAPIContext("r", {}),
    );

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.statusCode).toBe(500);
  });
});
