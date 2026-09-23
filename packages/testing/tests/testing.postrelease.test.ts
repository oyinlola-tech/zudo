import { describe, it, expect } from "vitest";
import { createSpyMethod, createStub } from "../src/index.js";

interface Mailer {
  send(to: string): string;
  close(): void;
}

describe("post-release — stub overrides are enumerable own properties", () => {
  it("Object.keys lists the stubbed methods", () => {
    const send = (to: string): string => `sent:${to}`;
    const stub = createStub<Mailer>({ send });

    expect(Object.keys(stub)).toEqual(["send"]);
    expect(stub.send("a")).toBe("sent:a");
  });

  it("spreading a stub copies the stubbed methods", () => {
    const send = (to: string): string => `sent:${to}`;
    const copy = { ...createStub<Mailer>({ send }) };

    expect(copy.send).toBe(send);
    expect(Object.keys(copy)).toEqual(["send"]);
  });

  it("expect.objectContaining matches a stub", () => {
    const send = (to: string): string => to;
    const stub = createStub<Mailer>({ send });

    expect(stub).toEqual(expect.objectContaining({ send }));
  });

  it("reports an own, enumerable descriptor for an override only", () => {
    const stub = createStub<Mailer>({ send: (to) => to });

    expect(Object.hasOwn(stub, "send")).toBe(true);
    expect(Object.getOwnPropertyDescriptor(stub, "send")?.enumerable).toBe(
      true,
    );
    expect(Object.hasOwn(stub, "close")).toBe(false);
    expect(typeof stub.close).toBe("function");
  });

  it("a stub without overrides still has no own keys", () => {
    expect(Object.keys(createStub<Mailer>())).toEqual([]);
  });
});

describe("post-release — createSpyMethod.restore keeps the recorded calls", () => {
  it("restore puts the original back and keeps calls, results and errors", () => {
    const original = (value: string): string => {
      if (value === "bad") throw new Error("bad");
      return value.toUpperCase();
    };
    const service = { save: original };
    const spy = createSpyMethod(service, "save");

    service.save("a");
    expect(() => service.save("bad")).toThrow("bad");
    spy.restore();

    expect(service.save).toBe(original);
    expect(spy.calls).toEqual([["a"], ["bad"]]);
    expect(spy.results).toEqual(["A"]);
    expect(spy.errors).toHaveLength(1);
    expect(spy.callCount).toBe(2);
  });

  it("calls after restore are not recorded", () => {
    const service = { save: (value: string): string => value };
    const spy = createSpyMethod(service, "save");

    service.save("a");
    spy.restore();
    service.save("b");

    expect(spy.calls).toEqual([["a"]]);
  });
});
