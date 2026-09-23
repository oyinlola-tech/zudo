import { createSerializer } from "@zudojs/serialization";

import type { APIOperation } from "../../operation/operation.type.js";

import type { APIBindingOptions, APIOperationSource } from "../shared/apiBinding.type.js";

import type { APICliExitCodeValue } from "./apiCli.exitCode.js";

import { createOperationRunner, listOperations } from "../shared/apiBinding.helper.js";

import { toApiWireResult } from "../shared/apiWireResult.helper.js";

import { normalizeAPIError } from "../../executor/executor.core.js";

import { parseApiCliArgs } from "./apiCli.argv.js";

import { APICliExitCode, apiCliExitCodeForStatus } from "./apiCli.exitCode.js";

/**
 * One CLI call as the `state` hook sees it.
 */
export interface APICliInvocation {
  readonly argv: readonly string[];
  readonly input: unknown;
}

/**
 * Where the CLI writes. Defaults to `process.stdout` / `process.stderr`.
 */
export interface APICliIO {
  readonly stdout: (text: string) => void;
  readonly stderr: (text: string) => void;
}

/**
 * Options for {@link runApiCli}. `state` receives the invocation.
 */
export interface APICliOptions extends APIBindingOptions<APICliInvocation> {
  readonly io?: APICliIO;
  /** Cancels the running operation (wire it to SIGINT). */
  readonly signal?: AbortSignal;
  /**
   * Run this operation instead of reading its name from `argv[0]` — for a
   * single-purpose binary.
   */
  readonly operation?: string;
  /** Program name shown in help. Defaults to `"cli"`. */
  readonly programName?: string;
}

const PRETTY = createSerializer("json", { pretty: true });

/**
 * Runs an operation from command-line arguments and returns the exit code.
 *
 * `argv` is `process.argv.slice(2)`: the operation name first (unless
 * `options.operation` fixes it), then `--field value` options and/or
 * `--json '{...}'` (see `parseApiCliArgs`). On success the output is
 * printed to stdout as JSON and the exit code is 0. On failure the same
 * client-safe `{ ok: false, error }` body the HTTP binding sends is
 * printed to stderr, and the exit code reflects the failure (see
 * {@link APICliExitCode}). Never calls `process.exit`, and never throws
 * for a failed call — only for an invalid operation list.
 */
export async function runApiCli(
  operations: APIOperationSource,
  argv: readonly string[],
  options: APICliOptions = {},
): Promise<APICliExitCodeValue> {
  const io = options.io ?? defaultIO();
  const known = listOperations(operations);
  const fixed = options.operation;
  const parsed = parseApiCliArgs(argv, fixed === undefined);

  if (!parsed.ok) {
    io.stderr(`${parsed.message}\n`);
    return APICliExitCode.USAGE;
  }

  const name = fixed ?? parsed.operation;
  if (parsed.help || name === undefined) {
    (parsed.help ? io.stdout : io.stderr)(usage(known, options.programName ?? "cli", fixed));
    return parsed.help ? APICliExitCode.OK : APICliExitCode.USAGE;
  }

  const operation = known.find((candidate) => candidate.name === name);
  if (operation === undefined) {
    io.stderr(`Unknown operation "${name}". Run with --help to list operations.\n`);
    return APICliExitCode.USAGE;
  }

  const run = createOperationRunner(options);
  const { result, requestId } = await run({
    operation,
    input: parsed.input,
    source: { argv, input: parsed.input },
    transport: "cli",
    ...(options.signal !== undefined ? { signal: options.signal } : {}),
  });

  const wire = toApiWireResult(result, requestId);
  if (!wire.ok) {
    io.stderr(`${PRETTY.serialize(wire)}\n`);
    return apiCliExitCodeForStatus(wire.error.statusCode);
  }

  try {
    if (wire.data !== undefined) {
      io.stdout(`${PRETTY.serialize(wire.data)}\n`);
    }
    return APICliExitCode.OK;
  } catch (error) {
    const failure = normalizeAPIError(error, operation.name);
    options.onInternalError?.(failure, requestId);
    io.stderr(`${PRETTY.serialize(toApiWireResult({ ok: false, error: failure }, requestId))}\n`);
    return APICliExitCode.INTERNAL;
  }
}

function usage(operations: readonly APIOperation[], program: string, fixed?: string): string {
  const shown = fixed === undefined ? operations : operations.filter((op) => op.name === fixed);
  const lines = shown.map((op) =>
    `  ${op.name}${op.metadata?.description !== undefined ? `  ${op.metadata.description}` : ""}`,
  );
  const call = fixed === undefined ? `${program} <operation>` : program;
  return `Usage: ${call} [--field value ...] [--json '<input>']\n\nOperations:\n${lines.join("\n")}\n`;
}

function defaultIO(): APICliIO {
  return {
    stdout: (text) => void process.stdout.write(text),
    stderr: (text) => void process.stderr.write(text),
  };
}
