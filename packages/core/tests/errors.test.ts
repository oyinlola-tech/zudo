import { describe, it, expect } from "vitest";
import {
  FrameworkError,
  type FrameworkErrorJSON,
} from "../src/errors/frameworkError.error.js";
import { ErrorCode } from "../src/errors/errorCode.code.js";
import {
  InvalidArgumentError,
  InvalidStateError,
  ProviderNotFoundError,
  ProviderAlreadyRegisteredError,
  ConfigurationNotFoundError,
  ExecutionContextNotFoundError,
  ModuleNotFoundError,
  AdapterNotFoundError,
} from "../src/errors/exceptions.js";

// ─── FrameworkError ─────────────────────────────────────

describe("FrameworkError", () => {
  describe("construction", () => {
    it("should create an error with message", () => {
      const error = new FrameworkError("something went wrong");

      expect(error.message).toBe("something went wrong");
      expect(error.name).toBe("FrameworkError");
      expect(error.code).toBe("ERR_OPERATION_FAILED");
    });

    it("should accept a custom error code", () => {
      const error = new FrameworkError("bad input", {
        code: ErrorCode.INVALID_ARGUMENT,
      });

      expect(error.code).toBe(ErrorCode.INVALID_ARGUMENT);
    });

    it("should accept details", () => {
      const error = new FrameworkError("bad input", {
        details: { field: "name", reason: "required" },
      });

      expect(error.details).toEqual({
        field: "name",
        reason: "required",
      });
    });

    it("should accept status code", () => {
      const error = new FrameworkError("not found", {
        status: 404,
      });

      expect(error.statusCode).toBe(404);
    });

    it("should accept cause", () => {
      const cause = new Error("original");
      const error = new FrameworkError("wrapped", { cause });

      expect(error.cause).toBe(cause);
    });
  });

  describe("instanceof", () => {
    it("should be instanceof Error", () => {
      const error = new FrameworkError("test");
      expect(error).toBeInstanceOf(Error);
    });

    it("should be instanceof FrameworkError", () => {
      const error = new FrameworkError("test");
      expect(error).toBeInstanceOf(FrameworkError);
    });
  });

  describe("toJSON", () => {
    it("should serialize to JSON", () => {
      const error = new FrameworkError("test", {
        code: ErrorCode.INVALID_ARGUMENT,
        status: 400,
        details: { reason: "bad" },
      });

      const json = error.toJSON();

      expect(json.name).toBe("FrameworkError");
      expect(json.message).toBe("test");
      expect(json.code).toBe(ErrorCode.INVALID_ARGUMENT);
      expect(json.statusCode).toBe(400);
      expect(json.details).toEqual({ reason: "bad" });
    });

    it("should omit optional fields when not set", () => {
      const error = new FrameworkError("test");

      const json = error.toJSON();

      expect(json.statusCode).toBe(500);
      expect(json.details).toBeUndefined();
      expect(json).not.toHaveProperty("status");
      expect(json).not.toHaveProperty("details");
    });

    it("should be a valid FrameworkErrorJSON", () => {
      const error = new FrameworkError("test");
      const json: FrameworkErrorJSON = error.toJSON();

      expect(typeof json.name).toBe("string");
      expect(typeof json.message).toBe("string");
      expect(typeof json.code).toBe("string");
    });
  });
});

// ─── Exception classes ──────────────────────────────────

describe("Exception classes", () => {
  describe("InvalidArgumentError", () => {
    it("should have correct code", () => {
      const error = new InvalidArgumentError("bad arg");

      expect(error.code).toBe(ErrorCode.INVALID_ARGUMENT);
      expect(error.message).toBe("bad arg");
      expect(error.name).toBe("InvalidArgumentError");
    });

    it("should accept details", () => {
      const error = new InvalidArgumentError("bad arg", {
        field: "name",
      });

      expect(error.details).toEqual({ field: "name" });
    });

    it("should be instanceof FrameworkError", () => {
      const error = new InvalidArgumentError("test");
      expect(error).toBeInstanceOf(FrameworkError);
      expect(error).toBeInstanceOf(Error);
    });
  });

  describe("InvalidStateError", () => {
    it("should have correct code", () => {
      const error = new InvalidStateError("wrong state");

      expect(error.code).toBe(ErrorCode.INVALID_STATE);
      expect(error.name).toBe("InvalidStateError");
    });
  });

  describe("ProviderNotFoundError", () => {
    it("should include token in message", () => {
      const error = new ProviderNotFoundError("MyService");

      expect(error.code).toBe(ErrorCode.PROVIDER_NOT_FOUND);
      expect(error.message).toContain("MyService");
      expect(error.name).toBe("ProviderNotFoundError");
    });

    it("should handle symbol tokens", () => {
      const token = Symbol("my-token");
      const error = new ProviderNotFoundError(token);

      expect(error.message).toContain("my-token");
    });

    it("should handle function tokens", () => {
      class MyClass {}
      const error = new ProviderNotFoundError(MyClass);

      expect(error.message).toContain("MyClass");
    });
  });

  describe("ProviderAlreadyRegisteredError", () => {
    it("should include token in message", () => {
      const error = new ProviderAlreadyRegisteredError("MyService");

      expect(error.code).toBe(ErrorCode.PROVIDER_ALREADY_REGISTERED);
      expect(error.message).toContain("MyService");
      expect(error.name).toBe("ProviderAlreadyRegisteredError");
    });
  });

  describe("ConfigurationNotFoundError", () => {
    it("should include path in message", () => {
      const error = new ConfigurationNotFoundError("database.host");

      expect(error.code).toBe(ErrorCode.CONFIGURATION_NOT_FOUND);
      expect(error.message).toContain("database.host");
      expect(error.name).toBe("ConfigurationNotFoundError");
    });
  });

  describe("ExecutionContextNotFoundError", () => {
    it("should have correct code", () => {
      const error = new ExecutionContextNotFoundError();

      expect(error.code).toBe(ErrorCode.EXECUTION_CONTEXT_NOT_FOUND);
      expect(error.name).toBe("ExecutionContextNotFoundError");
    });
  });

  describe("ModuleNotFoundError", () => {
    it("should include module name in message", () => {
      const error = new ModuleNotFoundError("auth");

      expect(error.code).toBe(ErrorCode.MODULE_NOT_FOUND);
      expect(error.message).toContain("auth");
      expect(error.name).toBe("ModuleNotFoundError");
    });
  });

  describe("AdapterNotFoundError", () => {
    it("should include adapter name in message", () => {
      const error = new AdapterNotFoundError("http");

      expect(error.code).toBe(ErrorCode.ADAPTER_NOT_FOUND);
      expect(error.message).toContain("http");
      expect(error.name).toBe("AdapterNotFoundError");
    });
  });
});

// ─── Error serialization ────────────────────────────────

describe("Error serialization", () => {
  it("should serialize exception to JSON", () => {
    const error = new ProviderNotFoundError("test");
    const json = error.toJSON();

    expect(json.name).toBe("ProviderNotFoundError");
    expect(json.code).toBe(ErrorCode.PROVIDER_NOT_FOUND);
    expect(typeof json.message).toBe("string");
  });

  it("should be catchable as FrameworkError", () => {
    function throwSpecific(): never {
      throw new InvalidArgumentError("test");
    }

    try {
      throwSpecific();
      expect.fail("Should have thrown");
    } catch (error) {
      expect(error).toBeInstanceOf(FrameworkError);
      expect(error).toBeInstanceOf(InvalidArgumentError);

      if (error instanceof FrameworkError) {
        expect(error.code).toBe(ErrorCode.INVALID_ARGUMENT);
      }
    }
  });

  it("should preserve error chain with cause", () => {
    const original = new Error("original");
    const wrapped = new FrameworkError("wrapped", {
      cause: original,
    });

    expect(wrapped.cause).toBe(original);
  });
});

// ─── ErrorCode constants ────────────────────────────────

describe("ErrorCode", () => {
  it("should have all expected error codes", () => {
    expect(ErrorCode.UNKNOWN_ERROR).toBe("CORE_UNKNOWN_ERROR");
    expect(ErrorCode.INVALID_ARGUMENT).toBe("CORE_INVALID_ARGUMENT");
    expect(ErrorCode.PROVIDER_NOT_FOUND).toBe("CORE_PROVIDER_NOT_FOUND");
    expect(ErrorCode.MODULE_NOT_FOUND).toBe("CORE_MODULE_NOT_FOUND");
    expect(ErrorCode.CONFIGURATION_NOT_FOUND).toBe(
      "CORE_CONFIGURATION_NOT_FOUND",
    );
  });

  it("should have unique error codes", () => {
    const values = Object.values(ErrorCode);
    const unique = new Set(values);

    expect(unique.size).toBe(values.length);
  });

  it("should have all string values", () => {
    for (const value of Object.values(ErrorCode)) {
      expect(typeof value).toBe("string");
      expect(value.length).toBeGreaterThan(0);
    }
  });
});

// ─── Barrel exports ─────────────────────────────────────

import {
  ModuleNotFoundError as CoreModuleNotFoundError,
  DependencyResolutionError as BarrelDependencyResolutionError,
  InvalidProviderError as BarrelInvalidProviderError,
  describeToken,
} from "../src/errors/index.js";
import { ModuleNotFoundError as RootModuleNotFoundError } from "../src/index.js";

describe("errors barrel", () => {
  it("exports ModuleNotFoundError from @zudojs/core/errors", () => {
    const error = new CoreModuleNotFoundError("users");
    expect(error.code).toBe(ErrorCode.MODULE_NOT_FOUND);
    expect(error.details).toEqual({ module: "users" });
  });

  it("resolves the root ModuleNotFoundError to the module subsystem's class", () => {
    const error = new RootModuleNotFoundError("users");
    expect(error.name).toBe("ModuleNotFoundError");
    expect(error).not.toBeInstanceOf(CoreModuleNotFoundError);
  });

  it("exports the container diagnostics errors and describeToken", () => {
    expect(new BarrelInvalidProviderError("x").code).toBe(
      ErrorCode.INVALID_PROVIDER,
    );
    expect(new BarrelDependencyResolutionError("m", ["a"]).chain).toEqual([
      "a",
    ]);
    expect(describeToken(Symbol("sym"))).toBe("sym");
    expect(describeToken(class Foo {})).toBe("Foo");
  });

  it("FrameworkErrorJSON matches toJSON() output", () => {
    const json = new FrameworkError("x", {
      code: "C",
      details: { a: 1 },
    }).toJSON();
    expect(json.category).toBeDefined();
    expect(json.severity).toBeDefined();
    expect(json.details).toEqual({ a: 1 });
    expect(json.metadata).toEqual({});
  });
});
