/**
 * `defineOperation` infers the handler's input from the input schema,
 * including inline in `registry.register(...)` and operation lists, where
 * the `AnyAPIOperation` contextual type used to infer `never`.
 */
import { execFile } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

import { describe, expect, expectTypeOf, it } from "vitest";

import { schema } from "@zudojs/schema";

import {
  APIOperationRegistry,
  createApiFetchHandler,
  defineOperation,
  type APIOperation,
  type InferAPISchemaOutput,
} from "../src/index.js";

const TodoInput = schema.object({ title: schema.string() });

describe("defineOperation input inference (types)", () => {
  it("infers the input from a @zudojs/schema schema", () => {
    const op = defineOperation({
      name: "todos.create",
      input: TodoInput,
      handler: async (input) => {
        expectTypeOf(input).toEqualTypeOf<{ title: string }>();
        return input.title;
      },
    });

    expectTypeOf(op).toEqualTypeOf<APIOperation<{ title: string }, string>>();
  });

  it("infers the input inline inside registry.register", () => {
    const registry = new APIOperationRegistry();
    registry.register(
      defineOperation({
        name: "todos.inline",
        input: TodoInput,
        handler: async (input) => {
          expectTypeOf(input).toEqualTypeOf<{ title: string }>();
          return input.title;
        },
      }),
    );
    expect(registry.has("todos.inline")).toBe(true);
  });

  it("infers the input inline inside an operation list", () => {
    const handle = createApiFetchHandler([
      defineOperation({
        name: "todos.list",
        input: TodoInput,
        handler: async (input) => input.title.length,
      }),
    ]);
    expect(typeof handle).toBe("function");
  });

  it("infers from a Standard Schema's declared output type", () => {
    const standard = {
      "~standard": {
        version: 1 as const,
        vendor: "test",
        validate: (value: unknown) => ({ value: value as { n: number } }),
        types: undefined as { input: unknown; output: { n: number } } | undefined,
      },
    };
    expectTypeOf<InferAPISchemaOutput<typeof standard>>().toEqualTypeOf<{ n: number }>();

    const op = defineOperation({ name: "n", input: standard, handler: async (input) => input.n });
    expectTypeOf(op).toEqualTypeOf<APIOperation<{ n: number }, number>>();
  });

  it("keeps explicit type arguments and schema-less operations working", () => {
    const explicit = defineOperation<{ id: string }, string>({
      name: "users.get",
      input: TodoInput,
      handler: async (input) => input.id,
    });
    expectTypeOf(explicit).toEqualTypeOf<APIOperation<{ id: string }, string>>();

    const registry = new APIOperationRegistry();
    registry.register(
      defineOperation({
        name: "health",
        handler: async (input) => {
          expectTypeOf(input).toEqualTypeOf<unknown>();
          return "ok";
        },
      }),
    );
  });
});

const execFileAsync = promisify(execFile);
const PACKAGE_DIR = join(dirname(fileURLToPath(import.meta.url)), "..");
const TSC = join(PACKAGE_DIR, "node_modules", ".bin", "tsc");

/** Type-checks `source` as a module of this package and returns tsc's output. */
async function compile(source: string): Promise<{ code: number; output: string }> {
  const dir = await mkdtemp(join(PACKAGE_DIR, ".compile-"));
  try {
    await writeFile(join(dir, "case.ts"), source);
    await writeFile(
      join(dir, "tsconfig.json"),
      JSON.stringify({
        extends: "../../../tsconfig.base.json",
        compilerOptions: { noEmit: true, composite: false, incremental: false },
        include: ["case.ts"],
      }),
    );
    try {
      const { stdout } = await execFileAsync(TSC, ["-p", join(dir, "tsconfig.json")]);
      return { code: 0, output: stdout };
    } catch (error) {
      const failure = error as { code?: number; stdout?: string };
      return { code: failure.code ?? 1, output: failure.stdout ?? String(error) };
    }
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

const PRELUDE = `
import { schema } from "@zudojs/schema";
import { APIOperationRegistry, defineOperation } from "../src/index.js";
const Schema = schema.object({ title: schema.string() });
const registry = new APIOperationRegistry();
`;

describe("defineOperation input inference (compiler)", () => {
  it("compiles the inline registry.register form", async () => {
    const result = await compile(`${PRELUDE}
registry.register(defineOperation({ name: "a", input: Schema, handler: async (input) => input.title }));
`);
    expect(result.output).toBe("");
    expect(result.code).toBe(0);
  }, 60_000);

  it("reports a misspelt field against the schema's type, not never", async () => {
    const result = await compile(`${PRELUDE}
registry.register(defineOperation({ name: "a", input: Schema, handler: async (input) => input.titel }));
`);
    expect(result.code).not.toBe(0);
    expect(result.output).toContain("Property 'titel' does not exist on type '{ title: string; }'");
  }, 60_000);
});
