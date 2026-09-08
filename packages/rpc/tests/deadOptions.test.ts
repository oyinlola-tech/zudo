import { describe, it, expect } from "vitest";

import { RPCServer } from "../src/rpc/server/rpcServer.core.js";
import { createRPCProcedure } from "../src/rpc/procedure/rpcProcedure.type.js";
import { createRPCRequest } from "../src/rpc/types/rpcRequest.type.js";
import { createNoopRPCInterceptor } from "../src/rpc/interceptor/rpcInterceptor.type.js";

describe("declared options are honoured", () => {
  it("interceptors wrap every dispatch", async () => {
    const order: string[] = [];

    const s = new RPCServer(undefined, undefined, {
      dispatch: {
        interceptors: [
          {
            async intercept(_ctx, next) {
              order.push("outer:before");
              const result = await next();
              order.push("outer:after");
              return result;
            },
          },
          {
            async intercept(_ctx, next) {
              order.push("inner:before");
              const result = await next();
              order.push("inner:after");
              return result;
            },
          },
        ],
      },
    });

    s.register(
      createRPCProcedure("a.b", async () => {
        order.push("handler");
        return 1;
      }),
    );

    const res = await s.handle(
      createRPCRequest({ id: "1", procedure: "a.b", payload: {} }),
    );

    expect(res.success).toBe(true);
    expect(order).toEqual([
      "outer:before",
      "inner:before",
      "handler",
      "inner:after",
      "outer:after",
    ]);
  });

  it("an interceptor can short-circuit the handler", async () => {
    let ran = false;
    const s = new RPCServer(undefined, undefined, {
      dispatch: {
        interceptors: [
          {
            async intercept() {
              return "intercepted";
            },
          },
        ],
      },
    });
    s.register(
      createRPCProcedure("a.b", async () => {
        ran = true;
        return 1;
      }),
    );

    const res = await s.handle(
      createRPCRequest({ id: "1", procedure: "a.b", payload: {} }),
    );

    expect(res.result).toBe("intercepted");
    expect(ran).toBe(false);
  });

  it("an interceptor calling next() twice is rejected", async () => {
    let runs = 0;
    const s = new RPCServer(undefined, undefined, {
      dispatch: {
        interceptors: [
          {
            async intercept(_ctx, next) {
              await next();
              return next();
            },
          },
        ],
      },
    });
    s.register(
      createRPCProcedure("a.b", async () => {
        runs++;
        return 1;
      }),
    );

    const res = await s.handle(
      createRPCRequest({ id: "1", procedure: "a.b", payload: {} }),
    );

    expect(runs).toBe(1);
    expect(res.success).toBe(false);
  });

  it("the noop interceptor passes through", async () => {
    const s = new RPCServer(undefined, undefined, {
      dispatch: { interceptors: [createNoopRPCInterceptor()] },
    });
    s.register(createRPCProcedure("a.b", async () => "ok"));

    const res = await s.handle(
      createRPCRequest({ id: "1", procedure: "a.b", payload: {} }),
    );

    expect(res.result).toBe("ok");
  });
});
