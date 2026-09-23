/**
 * CLI binding: argument parsing, help, and exit codes.
 */
import { describe, expect, it } from "vitest";

import {
  APICliExitCode,
  createAPIError,
  defineOperation,
  parseApiCliArgs,
  runApiCli,
} from "../src/index.js";

describe("parseApiCliArgs", () => {
  const parse = (...argv: string[]) => parseApiCliArgs(argv, true);

  it("builds input from flags", () => {
    expect(
      parse("users.create", "--name", "Ann", "--age=42", "--first-name", "A", "--address.city", "Paris", "--admin", "--no-verified"),
    ).toEqual({
      ok: true,
      operation: "users.create",
      help: false,
      input: { name: "Ann", age: 42, firstName: "A", address: { city: "Paris" }, admin: true, verified: false },
    });
  });

  it("parses JSON-looking values and keeps lossy numbers as strings", () => {
    const result = parse("x", "--n", "-5", "--big", "12345678901234567890", "--list", "[1,2]", "--id", "007");
    expect(result).toMatchObject({ input: { n: -5, big: "12345678901234567890", list: [1, 2], id: "007" } });
  });

  it("collects repeated flags and merges over --json", () => {
    expect(parse("x", "--json", '{"a":1,"tag":"z"}', "--tag", "p", "--tag", "q")).toMatchObject({
      input: { a: 1, tag: ["p", "q"] },
    });
    expect(parse("x", "--json", "[1,2]")).toMatchObject({ input: [1, 2] });
  });

  it("reports malformed command lines", () => {
    expect(parse("x", "extra")).toMatchObject({ ok: false });
    expect(parse("x", "--json", "{bad")).toMatchObject({ ok: false });
    expect(parse("x", "--json", "[1]", "--a", "1")).toMatchObject({ ok: false });
    expect(parse("x", "--__proto__.polluted", "1")).toMatchObject({ ok: false });
    expect(parse("x", "--a", "1", "--a.b", "2")).toMatchObject({ ok: false });
    expect(({} as Record<string, unknown>)["polluted"]).toBeUndefined();
  });

  it("does not collide with Object.prototype members", () => {
    expect(parse("x", "--to-string", "a", "--constructor-name", "b")).toMatchObject({
      ok: true,
      input: { toString: "a", constructorName: "b" },
    });
  });
});

describe("runApiCli", () => {
  const greet = defineOperation({
    name: "greet",
    metadata: { description: "Say hello" },
    handler: async (input: { name: string }) => `hello ${input.name}`,
  });
  const locked = defineOperation({
    name: "locked",
    handler: async () => {
      throw createAPIError("No.", { statusCode: 403, expose: true });
    },
  });
  const quiet = defineOperation({ name: "quiet", handler: async () => undefined });

  const run = async (argv: string[], options = {}) => {
    const out: string[] = [];
    const err: string[] = [];
    const code = await runApiCli([greet, locked, quiet], argv, {
      io: { stdout: (t) => out.push(t), stderr: (t) => err.push(t) },
      ...options,
    });
    return { code, out: out.join(""), err: err.join("") };
  };

  it("prints the result as JSON", async () => {
    expect(await run(["greet", "--name", "Ann"])).toEqual({ code: 0, out: '"hello Ann"\n', err: "" });
    expect(await run(["quiet"])).toEqual({ code: 0, out: "", err: "" });
  });

  it("serves a single fixed operation", async () => {
    const result = await run(["--name", "Bo"], { operation: "greet" });
    expect(result.out).toBe('"hello Bo"\n');
  });

  it("prints help and usage errors", async () => {
    const help = await run(["--help"], { programName: "app" });
    expect(help.code).toBe(APICliExitCode.OK);
    expect(help.out).toContain("Usage: app <operation>");
    expect(help.out).toContain("greet  Say hello");

    expect((await run([])).code).toBe(APICliExitCode.USAGE);
    expect((await run(["greet", "--json"])).code).toBe(APICliExitCode.USAGE);
  });

  it("maps failures to exit codes and prints the wire error", async () => {
    const result = await run(["locked"]);
    expect(result.code).toBe(APICliExitCode.PERMISSION);
    expect(JSON.parse(result.err)).toMatchObject({ ok: false, error: { message: "No.", statusCode: 403 } });
  });

  it("cancels through the signal", async () => {
    const controller = new AbortController();
    controller.abort();
    expect((await run(["greet", "--name", "x"], { signal: controller.signal })).code).toBe(
      APICliExitCode.CANCELLED,
    );
  });
});
