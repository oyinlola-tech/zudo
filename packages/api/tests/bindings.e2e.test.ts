/**
 * One operation, four transports: in-memory RPC, the fetch handler, a
 * queue job and the CLI all produce the same result and the same errors.
 */
import { describe, expect, it } from "vitest";

import { schema } from "@zudojs/schema";

import {
  createInMemoryQueue,
  createInMemoryQueueEventEmitter,
  createQueueName,
  type Job,
} from "@zudojs/queue";

import {
  createRPCMemoryTransport,
  RPCClient,
  RPCError,
  RPCProcedureNotFoundError,
  RPCServer,
  RPCTimeoutError,
  RPCValidationError,
} from "@zudojs/rpc";

import {
  APICliExitCode,
  APIConflictError,
  APIExecutor,
  APIOperationRegistry,
  bindApiQueue,
  createApiFetchHandler,
  defineOperation,
  registerApiRpcProcedures,
  runApiCli,
  TransportContextKey,
  type APIInterceptor,
  type APITransportKind,
} from "../src/index.js";

const add = defineOperation<{ a: number; b: number }, { sum: number }>({
  name: "math.add",
  input: schema.object({ a: schema.number(), b: schema.number() }),
  output: schema.object({ sum: schema.number() }),
  handler: async ({ a, b }) => ({ sum: a + b }),
});

const reserve = defineOperation({
  name: "seats.reserve",
  handler: async () => {
    throw new APIConflictError("Seat already taken.");
  },
});

const slow = defineOperation({
  name: "work.slow",
  timeout: 20,
  handler: () => new Promise((resolve) => setTimeout(resolve, 500)),
});

function setup() {
  const registry = new APIOperationRegistry();
  registry.register(add);
  registry.register(reserve);
  registry.register(slow);
  registry.freeze();

  const seen: APITransportKind[] = [];
  const tracker: APIInterceptor = {
    async intercept(context, next) {
      const transport = context.context.get(TransportContextKey);
      if (transport !== undefined) seen.push(transport);
      return next();
    },
  };
  const executor = new APIExecutor({ interceptors: [tracker] });
  return { registry, executor, seen };
}

function capture() {
  const out: string[] = [];
  const err: string[] = [];
  return { out, err, io: { stdout: (t: string) => out.push(t), stderr: (t: string) => err.push(t) } };
}

async function runJob(registry: APIOperationRegistry, executor: APIExecutor, name: string, data: unknown) {
  const events = createInMemoryQueueEventEmitter();
  const queue = createInMemoryQueue<unknown>(createQueueName("ops"), {
    eventEmitter: events,
    pollInterval: 5,
  });
  bindApiQueue(queue, registry, { executor });
  const outcome = new Promise<{ ok: boolean; value: unknown; job: Job }>((resolve) => {
    events.on("job:completed", ({ job, result }) => resolve({ ok: true, value: result, job }));
    events.on("job:failed", ({ job, error }) => resolve({ ok: false, value: error.message, job }));
  });
  await queue.add(name, data, { attempts: 1 });
  const result = await outcome;
  await queue.close();
  return result;
}

describe("one operation over RPC, HTTP, a queue and the CLI", () => {
  it("produces the same result on every binding", async () => {
    const { registry, executor, seen } = setup();

    const server = new RPCServer();
    registerApiRpcProcedures(server, registry, { executor });
    const viaRpc = await new RPCClient(createRPCMemoryTransport(server)).call("math.add", { a: 2, b: 3 });

    const fetchHandler = createApiFetchHandler(registry, { executor });
    const response = await fetchHandler(
      new Request("http://app.test/math.add", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ a: 2, b: 3 }),
      }),
    );
    const viaHttp = ((await response.json()) as { data: unknown }).data;

    const viaQueue = await runJob(registry, executor, "math.add", { a: 2, b: 3 });

    const cli = capture();
    const code = await runApiCli(registry, ["math.add", "--a", "2", "--b", "3"], { executor, io: cli.io });
    const viaCli = JSON.parse(cli.out.join(""));

    const expected = { sum: 5 };
    expect(response.status).toBe(200);
    expect(viaRpc).toEqual(expected);
    expect(viaHttp).toEqual(expected);
    expect(viaQueue).toMatchObject({ ok: true, value: expected });
    expect(code).toBe(APICliExitCode.OK);
    expect(viaCli).toEqual(expected);
    expect(seen).toEqual(["rpc", "http", "queue", "cli"]);
  });

  it("reports a validation failure on every binding", async () => {
    const { registry, executor } = setup();
    const bad = { a: "two", b: 3 };

    const server = new RPCServer();
    registerApiRpcProcedures(server, registry, { executor });
    const rpcError = await new RPCClient(createRPCMemoryTransport(server))
      .call("math.add", bad)
      .catch((e: unknown) => e);
    expect(rpcError).toBeInstanceOf(RPCValidationError);
    expect((rpcError as RPCValidationError).issues).toEqual(["a: invalid"]);

    const response = await createApiFetchHandler(registry, { executor })(
      new Request("http://app.test/math.add", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(bad),
      }),
    );
    expect(response.status).toBe(422);
    expect(await response.json()).toMatchObject({
      ok: false,
      error: { code: "ERR_API_VALIDATION", statusCode: 422, issues: ["a: invalid"] },
    });

    const job = await runJob(registry, executor, "math.add", bad);
    expect(job).toMatchObject({ ok: false, value: 'Invalid input for operation "math.add".' });

    const cli = capture();
    const code = await runApiCli(registry, ["math.add", "--a", "two", "--b", "3"], { executor, io: cli.io });
    expect(code).toBe(APICliExitCode.INVALID_INPUT);
    expect(JSON.parse(cli.err.join(""))).toMatchObject({ ok: false, error: { issues: ["a: invalid"] } });
  });

  it("carries a thrown domain error's code across every binding", async () => {
    const { registry, executor } = setup();

    const server = new RPCServer();
    registerApiRpcProcedures(server, registry, { executor });
    const rpcError = (await new RPCClient(createRPCMemoryTransport(server))
      .call("seats.reserve", {})
      .catch((e: unknown) => e)) as RPCError;
    expect(rpcError.code).toBe("ERR_API_CONFLICT");
    expect(rpcError.message).toBe("Seat already taken.");

    const response = await createApiFetchHandler(registry, { executor })(
      new Request("http://app.test/seats.reserve", { method: "POST" }),
    );
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({
      error: { code: "ERR_API_CONFLICT", message: "Seat already taken." },
    });

    const job = await runJob(registry, executor, "seats.reserve", {});
    expect(job).toMatchObject({ ok: false, value: "Seat already taken." });

    const cli = capture();
    expect(await runApiCli(registry, ["seats.reserve"], { executor, io: cli.io })).toBe(
      APICliExitCode.FAILURE,
    );
  });

  it("reports unknown operations and timeouts", async () => {
    const { registry, executor } = setup();

    const server = new RPCServer();
    registerApiRpcProcedures(server, registry, { executor });
    const client = new RPCClient(createRPCMemoryTransport(server));
    await expect(client.call("math.nope", {})).rejects.toBeInstanceOf(RPCProcedureNotFoundError);
    await expect(client.call("work.slow", {})).rejects.toBeInstanceOf(RPCTimeoutError);

    const handler = createApiFetchHandler(registry, { executor });
    expect((await handler(new Request("http://app.test/math.nope", { method: "POST" }))).status).toBe(404);
    const timedOut = await handler(new Request("http://app.test/work.slow", { method: "POST" }));
    expect(timedOut.status).toBe(504);
    expect(await timedOut.json()).toMatchObject({
      error: { code: "ERR_API_TIMEOUT", message: "An internal error occurred." },
    });

    const cli = capture();
    expect(await runApiCli(registry, ["math.nope"], { executor, io: cli.io })).toBe(APICliExitCode.USAGE);
    expect(await runApiCli(registry, ["work.slow"], { executor, io: cli.io })).toBe(APICliExitCode.TIMEOUT);
  });
});
