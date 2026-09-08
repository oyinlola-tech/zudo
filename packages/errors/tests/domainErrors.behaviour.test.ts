/**
 * Behavioural regression tests for the round-6 domain error fixes
 * (ERR-B-01 … ERR-B-28). Each block names the finding it guards.
 */

import { describe, it, expect } from "vitest";
import {
  BodyParserError,
  BrokenDocumentationLinkError,
  CronParseError,
  DocumentParseError,
  EventError,
  EventSubscriptionClosedError,
  EventTimeoutError,
  InvalidContentLengthError,
  InvalidDurationError,
  JobNotFoundError,
  JobTimeoutError,
  LifecycleTimeoutError,
  MessageHandlerError,
  MessageHandlerNotFoundError,
  MessageTimeoutError,
  PluginDependencyError,
  PluginStateError,
  PluginTimeoutError,
  QueueError,
  RateLimitError,
  RPCRateLimitedError,
  RPCTimeoutError,
  APIRateLimitError,
  SchedulerJobExecutionError,
  SchedulerJobTimeoutError,
  SchedulerLockError,
  SchedulerStoreError,
  SchemaEnumError,
  SchemaError,
  SchemaLiteralError,
  SchemaTypeError,
  SchemaUnknownKeyError,
  SerializationDepthError,
  SerializationPayloadTooLargeError,
  SerializerNotFoundError,
  UnsupportedBodyTypeError,
  ValidationError,
  WorkerLifecycleError,
  WorkerNotFoundError,
  createDocumentationError,
  createSchemaError,
  invalidDomainState,
  isDocumentationError,
  isSchemaError,
  resourceLockedError,
  toEventError,
  toMessageError,
  toQueueError,
  toSerializationError,
} from "../src/index.js";
import { ErrorCode } from "../src/base/types/errorCode.type.js";
import { ErrorSeverity } from "../src/base/types/errorSeverity.type.js";
import { isErrorMetadataValue } from "../src/base/core/errorMetadata.core.js";

describe("ERR-B-01 QueueError forwards statusCode and every option", () => {
  it("honours an explicit statusCode", () => {
    expect(new QueueError("x", { statusCode: 404 }).statusCode).toBe(404);
    expect(new JobNotFoundError("j").statusCode).toBe(404);
  });
});

describe("ERR-B-03 schema/validation errors never echo submitted values", () => {
  it("does not embed the received value in the message", () => {
    const err = new SchemaLiteralError("admin", { password: "hunter2" }, ["role"]);
    expect(err.message).not.toContain("hunter2");
    expect(err.message).toContain("received object");
    const en = new SchemaEnumError(["a", "b"], "secret-token", ["k"]);
    expect(en.message).not.toContain("secret-token");
  });

  it("redacts values in exposed toJSON output and stays JSON-safe", () => {
    const err = new SchemaEnumError(["a"], { secret: "s" }, ["k"]);
    const json = err.toJSON() as { issues: readonly Record<string, unknown>[] };
    expect(json.issues[0]).not.toHaveProperty("received");
    expect(json.issues[0]).toHaveProperty("receivedType", "object");
    expect(() => JSON.stringify(err)).not.toThrow();

    const v = new ValidationError("bad", {
      issues: [{ field: "password", message: "weak", value: "hunter2" }],
    });
    const vj = JSON.stringify(v.toJSON());
    expect(vj).not.toContain("hunter2");
    expect(vj).toContain('"valueType":"string(7)"');

    // A non-exposed error keeps the value for internal logging.
    const internal = new ValidationError("bad", {
      expose: false,
      issues: [{ field: "password", message: "weak", value: "hunter2" }],
    });
    expect(JSON.stringify(internal.toJSON())).toContain("hunter2");
  });

  it("never throws on BigInt or circular input", () => {
    expect(() => new SchemaLiteralError(1n, 2n)).not.toThrow();
    const circular: Record<string, unknown> = {};
    circular.self = circular;
    const err = new SchemaLiteralError("x", circular);
    expect(() => JSON.stringify(err)).not.toThrow();
    const v = new ValidationError("bad", {
      issues: [{ message: "m", value: 10n }],
    });
    expect(() => JSON.stringify(v.toJSON())).not.toThrow();
  });
});

describe("ERR-B-04/05 dedicated codes are emitted", () => {
  it("distinguishes handler failure from handler not found", () => {
    expect(new MessageHandlerError("x", { handlerId: "h" }).code).toBe(
      ErrorCode.MESSAGE_HANDLER_FAILED,
    );
    expect(new MessageHandlerNotFoundError("h").code).toBe(
      ErrorCode.MESSAGE_HANDLER_NOT_FOUND,
    );
  });
});

describe("ERR-B-06 queue errors serialize queue/job/worker ids", () => {
  it("includes ids in toJSON and metadata", () => {
    const json = new WorkerLifecycleError("x", {
      workerId: "w",
      queueName: "q",
    }).toJSON() as Record<string, unknown>;
    expect(json.workerId).toBe("w");
    expect(json.queueName).toBe("q");
    expect(new WorkerNotFoundError("w").workerId).toBe("w");
  });
});

describe("ERR-B-07 caller metadata is preserved", () => {
  it("merges caller metadata with class fields", () => {
    const meta = { requestId: "r1" };
    expect(
      new PluginStateError("p", "a", "b", { metadata: meta }).getMetadata(
        "requestId",
      ),
    ).toBe("r1");
    expect(
      new PluginTimeoutError("p", 5, { metadata: meta }).getMetadata("requestId"),
    ).toBe("r1");
    expect(
      new PluginDependencyError("p", "d", { metadata: meta }).getMetadata(
        "requestId",
      ),
    ).toBe("r1");
    expect(
      new BrokenDocumentationLinkError("s", "t", { metadata: meta }).getMetadata(
        "requestId",
      ),
    ).toBe("r1");
    expect(
      new CronParseError("*", "bad", { metadata: meta }).getMetadata("requestId"),
    ).toBe("r1");
  });
});

describe("ERR-B-08 serialization diagnostics are serialized", () => {
  it("emits depth/size fields", () => {
    const depth = new SerializationDepthError(5, 3).toJSON() as Record<
      string,
      unknown
    >;
    expect(depth.depth).toBe(5);
    expect(depth.maxDepth).toBe(3);
    const size = new SerializationPayloadTooLargeError(10, 5).toJSON() as Record<
      string,
      unknown
    >;
    expect(size.size).toBe(10);
    expect(size.maxSize).toBe(5);
    const nf = new SerializerNotFoundError("json").toJSON() as Record<
      string,
      unknown
    >;
    expect(nf.serializerName).toBe("json");
  });
});

describe("ERR-B-10 untrusted header/input strings are bounded and clean", () => {
  it("truncates and strips control characters", () => {
    const huge = "x".repeat(100_000);
    const err = new UnsupportedBodyTypeError(huge);
    expect(err.message.length).toBeLessThan(400);
    expect(err.contentType.length).toBeLessThanOrEqual(1100);
    const injected = new InvalidContentLengthError("12\n[FAKE LOG LINE]\u001b[31m");
    expect(injected.message).not.toContain("\n");
    expect(injected.message).not.toContain("\u001b");
    const cron = new CronParseError("* *\n*", "bad");
    expect(cron.message).not.toContain("\n");
    const dur = new InvalidDurationError("5\rx");
    expect(dur.message).not.toContain("\r");
    const key = new SchemaUnknownKeyError("a\nb");
    expect(key.message).not.toContain("\n");
  });
});

describe("ERR-B-11 server-side misconfiguration is not a client error", () => {
  it("reports plugin/handler registry problems as internal", () => {
    const err = new PluginStateError("p", "a", "b");
    expect(err.statusCode).toBe(500);
    expect(err.expose).toBe(false);
    expect(err.isOperational).toBe(false);
    expect(new MessageHandlerNotFoundError("h").expose).toBe(false);
  });
});

describe("ERR-B-12 SchemaError is a full domain error", () => {
  it("accepts metadata, freezes issues and serializes them", () => {
    const issues: unknown[] = [{ code: "x" }];
    const err = new SchemaError("m", {
      issues,
      metadata: { requestId: "r1" },
      statusCode: 422,
    });
    issues.push({ code: "y" });
    expect(err.issues).toHaveLength(1);
    expect(Object.isFrozen(err.issues)).toBe(true);
    expect(err.getMetadata("requestId")).toBe("r1");
    expect(err.statusCode).toBe(422);
    expect((err.toJSON() as { issues: readonly unknown[] }).issues).toHaveLength(1);
    expect(new SchemaTypeError("string", "number").severity).toBe(
      ErrorSeverity.WARNING,
    );
  });
});

describe("ERR-B-13 helper exports", () => {
  it("exports create/is helpers for schema and documentation", () => {
    expect(isSchemaError(createSchemaError("m"))).toBe(true);
    expect(isDocumentationError(createDocumentationError("m"))).toBe(true);
  });
});

describe("ERR-B-14 scheduler execution errors accept a cause", () => {
  it("preserves cause through the trailing options", () => {
    const cause = new Error("db down");
    expect(new SchedulerStoreError("m", "s", { cause }).cause).toBe(cause);
    expect(new SchedulerLockError("m", "s", { cause }).cause).toBe(cause);
    expect(new SchedulerJobExecutionError("m", "j", "s", { cause }).cause).toBe(
      cause,
    );
    expect(new SchedulerJobTimeoutError(5, "j", { cause }).cause).toBe(cause);
  });
});

describe("ERR-B-15 normalizers never throw on exotic values", () => {
  it("handles null-prototype objects and throwing toString", () => {
    const nullProto = Object.create(null) as object;
    expect(() => toEventError(nullProto)).not.toThrow();
    expect(() => toMessageError(nullProto)).not.toThrow();
    expect(() => toQueueError(nullProto)).not.toThrow();
    expect(() => toSerializationError(nullProto)).not.toThrow();
    const hostile = {
      toString() {
        throw new Error("nope");
      },
    };
    expect(toQueueError(hostile).cause).toBe(hostile);
    expect(toEventError(42n).message).toBe("42n");
  });
});

describe("ERR-B-16 retryAfter metadata", () => {
  it("omits the key when absent and uses retryAfterSeconds", () => {
    const none = new RPCRateLimitedError();
    expect("retryAfter" in none.metadata).toBe(false);
    expect("retryAfterSeconds" in none.metadata).toBe(false);
    const some = new APIRateLimitError("m", 1.2);
    expect(some.retryAfterSeconds).toBe(2);
    expect(some.getMetadata("retryAfterSeconds")).toBe(2);
    expect(() => new RPCRateLimitedError("m", -1)).toThrow(RangeError);
  });
});

describe("ERR-B-17 middlewareId is stored and serialized", () => {
  it("keeps middlewareId on the base class", () => {
    const err = new EventError("m", { middlewareId: "mw" });
    expect(err.middlewareId).toBe("mw");
    expect((err.toJSON() as Record<string, unknown>).middlewareId).toBe("mw");
  });
});

describe("ERR-B-18 downstream subclasses keep their own name", () => {
  it("does not hard-code name in domain constructors", () => {
    class MyBody extends BodyParserError {}
    class MyRpc extends RPCTimeoutError {}
    class MyDoc extends DocumentParseError {}
    expect(new MyBody("m").name).toBe("MyBody");
    expect(new MyRpc(5).name).toBe("MyRpc");
    expect(new MyDoc("m").name).toBe("MyDoc");
  });
});

describe("ERR-B-19 timeout/duration arguments are validated", () => {
  it("rejects NaN, negative and infinite values", () => {
    expect(() => new EventTimeoutError(Number.NaN)).toThrow(RangeError);
    expect(() => new MessageTimeoutError(-5)).toThrow(RangeError);
    expect(() => new JobTimeoutError("j", Number.POSITIVE_INFINITY)).toThrow(
      RangeError,
    );
    expect(() => new LifecycleTimeoutError("c", "start", Number.NaN)).toThrow(
      RangeError,
    );
    expect(() => new RPCTimeoutError(-1)).toThrow(RangeError);
    expect(() => new PluginTimeoutError("p", Number.NaN)).toThrow(RangeError);
    expect(() => new SchedulerJobTimeoutError(-1)).toThrow(RangeError);
    const ok = new EventTimeoutError(5);
    expect(isErrorMetadataValue(ok.getMetadata("timeoutMs"))).toBe(true);
  });
});

describe("ERR-B-20 RateLimitError validates before construction and rounds up", () => {
  it("rounds fractional seconds up and rejects invalid values", () => {
    expect(new RateLimitError("m", { retryAfterSeconds: 1.5 }).retryAfterSeconds).toBe(2);
    expect(new RateLimitError("m", { retryAfterSeconds: 1.5 }).getMetadata("retryAfterSeconds")).toBe(2);
    expect(() => new RateLimitError("m", { retryAfterSeconds: -1 })).toThrow(RangeError);
    expect(() => new RateLimitError("m", { retryAfterSeconds: Number.NaN })).toThrow(RangeError);
  });
});

describe("ERR-B-22 status codes match their semantics", () => {
  it("uses 412 for PRECONDITION_FAILED and 423 for locked resources", () => {
    const pre = invalidDomainState("bad state");
    expect(pre.code).toBe(ErrorCode.PRECONDITION_FAILED);
    expect(pre.statusCode).toBe(412);
    expect(resourceLockedError("Order", 1).statusCode).toBe(423);
  });
});

describe("ERR-B-23 identifiers are recorded in metadata", () => {
  it("stores subscriptionId", () => {
    const err = new EventSubscriptionClosedError("s1");
    expect(err.subscriptionId).toBe("s1");
    expect(err.getMetadata("subscriptionId")).toBe("s1");
  });
});

describe("ERR-B-24 client-input errors default to WARNING severity", () => {
  it("does not log 4xx input errors at ERROR level", () => {
    expect(new BodyParserError("m").severity).toBe(ErrorSeverity.WARNING);
    expect(new DocumentParseError("m").severity).toBe(ErrorSeverity.WARNING);
  });
});
