/**
 * Mocking utilities tests.
 */

import { describe, it, expect } from "vitest";

import { createMockFn, createSpyFn, createStub } from "../src/mocking/index.js";

describe("createMockFn", () => {
  it("should record calls", () => {
    const mock = createMockFn<[string, number], string>();

    mock("hello", 42);

    expect(mock.calls).toHaveLength(1);
    expect(mock.calls[0]).toEqual(["hello", 42]);
    expect(mock.callCount).toBe(1);
    expect(mock.invoked).toBe(true);
  });

  it("should return mock return value", () => {
    const mock = createMockFn<[], string>();
    mock.mockReturnValue("test");

    const result = mock();

    expect(result).toBe("test");
  });

  it("should record results", () => {
    const mock = createMockFn<[], number>();
    mock.mockReturnValue(42);

    mock();
    mock();

    expect(mock.results).toEqual([42, 42]);
  });

  it("should clear calls", () => {
    const mock = createMockFn<[string], void>();

    mock("hello");
    mock.mockClear();

    expect(mock.calls).toHaveLength(0);
    expect(mock.callCount).toBe(0);
  });

  it("should reset all state", () => {
    const mock = createMockFn<[], string>();
    mock.mockReturnValue("test");

    mock();
    mock.mockReset();

    expect(mock.calls).toHaveLength(0);
    expect(mock.results).toHaveLength(0);
    expect(mock.invoked).toBe(false);
  });
});

describe("createSpyFn", () => {
  it("should record calls and return original result", () => {
    const original = (a: number, b: number) => a + b;
    const spy = createSpyFn(original);

    const result = spy(1, 2);

    expect(result).toBe(3);
    expect(spy.calls).toHaveLength(1);
    expect(spy.calls[0]).toEqual([1, 2]);
  });

  it("should reference original function", () => {
    const original = (x: number) => x * 2;
    const spy = createSpyFn(original);

    expect(spy.original).toBe(original);
  });

  it("should reset recorded calls", () => {
    const original = (x: number) => x;
    const spy = createSpyFn(original);

    spy(1);
    spy.reset();

    expect(spy.calls).toHaveLength(0);
  });
});

describe("createStub", () => {
  it("should create a stub object", () => {
    interface UserService {
      find(id: string): string | null;
      create(data: { name: string }): { id: string; name: string };
    }

    const stub = createStub<UserService>({
      find: (id) => `user:${id}`,
    });

    expect(stub.find("123")).toBe("user:123");
  });

  it("should return undefined for unimplemented methods", () => {
    interface Service {
      doSomething(): void;
    }

    const stub = createStub<Service>();

    expect(stub.doSomething()).toBeUndefined();
  });
});
