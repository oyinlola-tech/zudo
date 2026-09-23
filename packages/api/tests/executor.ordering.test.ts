/**
 * Interceptors run before input validation: validation is the innermost
 * step, on the input the interceptors finally pass to the handler.
 */
import { describe, expect, it } from "vitest";

import { schema } from "@zudojs/schema";

import {
  createInMemoryQueue,
  createInMemoryQueueEventEmitter,
  createQueueName,
} from "@zudojs/queue";

import {
  createRPCMemoryTransport,
  RPCAuthenticationError,
  RPCClient,
  RPCServer,
} from "@zudojs/rpc";

import {
  APIAuthenticationError,
  APICliExitCode,
  APIExecutor,
  APIValidationError,
  bindApiQueue,
  createAPIContext,
  createApiFetchHandler,
  defineOperation,
  ErrorCode,
  registerApiRpcProcedures,
  runApiCli,
  UserIdContextKey,
  type APIExecutionContext,
  type APIInterceptor,
  type APIResult,
} from "../src/index.js";

const CreateTodo = schema.object({ title: schema.string().min(3) });

const handled: unknown[] = [];

const createTodo = defineOperation({
  name: "todos.create",
  input: CreateTodo,
  handler: async (input) => {
    handled.push(input);
    return { title: input.title };
  },
});

const requireUser: APIInterceptor = {
  async intercept(call, next) {
    if (call.context.get(UserIdContextKey) === undefined) {
      throw new APIAuthenticationError();
    }
    return next();
  },
};

const anonymous = () => createAPIContext("req-anon", {});

describe("APIExecutor runs interceptors before input validation", () => {
  it("answers an anonymous call with invalid input with 401, not 422", async () => {
    const executor = new APIExecutor([requireUser]);

    const result = await executor.execute(createTodo, { title: 42 } as never, anonymous());

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBeInstanceOf(APIAuthenticationError);
      expect(result.error.statusCode).toBe(401);
      expect(result.error).not.toBeInstanceOf(APIValidationError);
    }
  });

  it("still validates an authenticated call", async () => {
    const executor = new APIExecutor([requireUser]);
    const context = anonymous();
    context.set(UserIdContextKey, "u1");

    const result = await executor.execute(createTodo, { title: 42 } as never, context);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBeInstanceOf(APIValidationError);
      expect((result.error as APIValidationError).issues).toEqual(["title: invalid"]);
    }
  });

  it("lets logging interceptors observe invalid calls", async () => {
    const observed: APIResult<unknown>[] = [];
    const logging: APIInterceptor = {
      async intercept(call, next) {
        const result = await next();
        observed.push(result);
        return result;
      },
    };

    const result = await new APIExecutor([logging]).execute(
      createTodo,
      { title: "x" },
      anonymous(),
    );

    expect(result.ok).toBe(false);
    expect(observed).toHaveLength(1);
    expect(observed[0]).toBe(result);
    expect(observed[0]!.ok === false && observed[0]!.error.code).toBe(ErrorCode.API_VALIDATION);
  });

  it("validates the input an interceptor substitutes", async () => {
    handled.length = 0;
    const blanker: APIInterceptor = {
      async intercept(call, next) {
        (call as unknown as APIExecutionContext<{ title: string }, unknown>).input = { title: "" };
        return next();
      },
    };

    const result = await new APIExecutor([blanker]).execute(
      createTodo,
      { title: "valid title" },
      anonymous(),
    );

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBeInstanceOf(APIValidationError);
    expect(handled).toEqual([]);
  });

  it("hands the handler the validated form of a substituted input", async () => {
    const trimmed = defineOperation({
      name: "todos.trimmed",
      input: schema.object({ title: schema.string().trim().min(3) }),
      handler: async (input) => input.title,
    });
    const padder: APIInterceptor = {
      async intercept(call, next) {
        (call as unknown as APIExecutionContext<{ title: string }, unknown>).input = { title: "  abc  " };
        return next();
      },
    };

    const result = await new APIExecutor([padder]).execute(trimmed, { title: "x" }, anonymous());

    expect(result).toEqual({ ok: true, data: "abc" });
  });
});

describe("bindings keep their error shapes with interceptors first", () => {
  const executor = new APIExecutor([requireUser]);

  it("HTTP answers 401 for an anonymous call with invalid input", async () => {
    const response = await createApiFetchHandler([createTodo], { executor })(
      new Request("http://app.test/todos.create", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ title: 42 }),
      }),
    );

    expect(response.status).toBe(401);
    const body = (await response.json()) as { error: Record<string, unknown> };
    expect(body.error).toMatchObject({ code: "ERR_API_AUTHENTICATION", statusCode: 401 });
    expect(body.error).not.toHaveProperty("issues");
  });

  it("RPC rejects with an authentication error", async () => {
    const server = new RPCServer();
    registerApiRpcProcedures(server, [createTodo], { executor });
    const error = await new RPCClient(createRPCMemoryTransport(server))
      .call("todos.create", { title: 42 })
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(RPCAuthenticationError);
  });

  it("the CLI exits with the permission code", async () => {
    const err: string[] = [];
    const code = await runApiCli([createTodo], ["todos.create", "--title", "x"], {
      executor,
      io: { stdout: () => undefined, stderr: (t: string) => err.push(t) },
    });

    expect(code).toBe(APICliExitCode.PERMISSION);
    expect(JSON.parse(err.join(""))).toMatchObject({ error: { code: "ERR_API_AUTHENTICATION" } });
  });

  it("a queue job fails with the authentication error", async () => {
    const events = createInMemoryQueueEventEmitter();
    const queue = createInMemoryQueue<unknown>(createQueueName("todos"), {
      eventEmitter: events,
      pollInterval: 5,
    });
    bindApiQueue(queue, [createTodo], { executor });
    const failed = new Promise<string>((resolve) => {
      events.on("job:failed", ({ error }) => resolve(error.message));
    });

    await queue.add("todos.create", { title: 42 }, { attempts: 1 });
    const message = await failed;
    await queue.close();

    expect(message).toBe(new APIAuthenticationError().message);
  });

  it("refuses a __proto__ key before any interceptor sees the input", async () => {
    let intercepted = false;
    const spy: APIInterceptor = {
      async intercept(_call, next) {
        intercepted = true;
        return next();
      },
    };

    const response = await createApiFetchHandler([createTodo], {
      executor: new APIExecutor([spy]),
    })(
      new Request("http://app.test/todos.create", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: '{"title":"abc","__proto__":{"admin":true}}',
      }),
    );

    expect(response.status).toBe(400);
    expect(intercepted).toBe(false);

    const err: string[] = [];
    const code = await runApiCli(
      [createTodo],
      ["todos.create", "--json", '{"title":"abc","constructor":{"prototype":{"x":1}}}'],
      {
        executor: new APIExecutor([spy]),
        io: { stdout: () => undefined, stderr: (t: string) => err.push(t) },
      },
    );

    expect(code).toBe(APICliExitCode.INVALID_INPUT);
    expect(intercepted).toBe(false);
  });
});
