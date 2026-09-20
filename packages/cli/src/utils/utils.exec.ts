import { execFile, spawn } from "node:child_process";
import { promisify } from "node:util";

import { CLIValidationError } from "../errors/index.js";

const execFileAsync = promisify(execFile);

export interface ExecResult {
  readonly stdout: string;
  readonly stderr: string;
}

export interface ExecOptions {
  readonly env?: NodeJS.ProcessEnv;
  readonly timeout?: number;
  /** Aborting the signal terminates the child process. */
  readonly signal?: AbortSignal;
}

/**
 * Commands that are `.cmd` shims rather than executables on Windows.
 *
 * Node refuses to spawn a `.cmd`/`.bat` file without a shell (EINVAL since
 * the fix for CVE-2024-27980), and spawning the bare name fails with ENOENT
 * because only `pnpm.cmd` exists. Every `zudojs create` on Windows therefore
 * failed at the install step, and `zudojs dev` never started anything.
 */
const WINDOWS_SHIM_COMMANDS: ReadonlySet<string> = new Set([
  "npm",
  "npx",
  "pnpm",
  "pnpx",
  "yarn",
  "bun",
  "bunx",
  "ng",
  "flutter",
  "tsx",
]);

/** Characters that need quoting when a command line goes through cmd.exe. */
const CMD_UNSAFE = /[\s"&|<>^()%!]/;

/**
 * Characters that cannot be made safe by quoting on the cmd.exe path.
 *
 * `cmd.exe` has no escape character inside a quoted string: it toggles quote
 * state on every `"`, so an embedded quote ends the string and everything
 * after it — `&`, `|`, `>` — is parsed as shell syntax. The C-runtime `\"`
 * escape means nothing to cmd. `%VAR%` and delayed-expansion `!VAR!` are
 * likewise expanded inside quotes. There is no correct escaping, so an
 * argument carrying one of these is rejected instead.
 */
const CMD_UNQUOTABLE = /["%!]/;

/**
 * Quotes one argument for cmd.exe. Arguments are validated before they reach
 * here (project and service names are `[A-Za-z0-9_-]`), so this is defence
 * in depth rather than the only barrier.
 *
 * @throws {CLIValidationError} If the argument contains `"`, `%` or `!`,
 *   none of which cmd.exe can be made to treat as literal text.
 */
export function quoteForWindowsShell(argument: string): string {
  if (CMD_UNQUOTABLE.test(argument)) {
    throw new CLIValidationError(
      `Cannot pass the argument ${JSON.stringify(argument)} to a Windows shell command: ` +
        `the characters ", % and ! cannot be escaped for cmd.exe. Remove them and try again.`,
    );
  }
  if (argument.length === 0) return '""';
  if (!CMD_UNSAFE.test(argument)) return argument;
  return `"${argument}"`;
}

/** The spawn arguments and shell flag a command needs on this platform. */
export function resolveSpawnTarget(
  file: string,
  args: readonly string[],
  platform: NodeJS.Platform = process.platform,
): { readonly file: string; readonly args: string[]; readonly shell: boolean } {
  if (platform === "win32" && WINDOWS_SHIM_COMMANDS.has(file)) {
    return {
      file,
      args: args.map(quoteForWindowsShell),
      shell: true,
    };
  }

  return { file, args: Array.from(args), shell: false };
}

/**
 * The environment a child gets, hardened for the Windows shell path.
 *
 * `cmd.exe` searches the current directory before `PATH`, so a `pnpm.cmd`
 * or `npm.bat` committed into a cloned repository would win over the real
 * package manager. `NoDefaultCurrentDirectoryInExePath` removes the current
 * directory from that search. It is only meaningful on win32 and only when
 * a shell is involved; everywhere else the caller's env is passed through
 * unchanged (POSIX `PATH` lookup never implies the cwd, and `shell` is
 * false there).
 */
export function resolveChildEnv(
  shell: boolean,
  env: NodeJS.ProcessEnv | undefined,
  platform: NodeJS.Platform = process.platform,
): NodeJS.ProcessEnv | undefined {
  if (!shell || platform !== "win32") return env;
  return {
    ...(env ?? process.env),
    NoDefaultCurrentDirectoryInExePath: "1",
  };
}

/**
 * Default timeout for {@link execCommand}, in milliseconds.
 *
 * Sized for quick probes. Anything that downloads from a registry needs an
 * explicit, much larger timeout — see `SCAFFOLD_TIMEOUT_MS`.
 */
export const DEFAULT_EXEC_TIMEOUT_MS = 120000;

/**
 * Runs a short-lived command and buffers its output.
 *
 * Suitable for quick probes (version checks, git commands). Do NOT use this
 * for long-running processes such as dev servers or dependency installs —
 * use {@link runStreaming} instead.
 */
export async function execCommand(
  file: string,
  args: readonly string[],
  cwd: string,
  options: ExecOptions = {},
): Promise<ExecResult> {
  const target = resolveSpawnTarget(file, args);
  const env = resolveChildEnv(target.shell, options.env);

  const { stdout, stderr } = await execFileAsync(target.file, target.args, {
    cwd,
    timeout: options.timeout ?? DEFAULT_EXEC_TIMEOUT_MS,
    shell: target.shell,
    ...(env ? { env } : {}),
    ...(options.signal ? { signal: options.signal } : {}),
  });
  return { stdout, stderr };
}

/**
 * Runs a command with inherited stdio and no timeout.
 *
 * Use for long-running processes (dev servers) and for dependency installs
 * so output streams to the user and slow commands are not killed. Pass a
 * `signal` to stop the process from the outside; an aborted run resolves
 * rather than rejects, since stopping it was the caller's intent.
 */
export function runStreaming(
  file: string,
  args: readonly string[],
  cwd: string,
  options: ExecOptions = {},
): Promise<void> {
  const target = resolveSpawnTarget(file, args);
  const env = resolveChildEnv(target.shell, options.env);

  return new Promise<void>((resolve, reject) => {
    const child = spawn(target.file, target.args, {
      cwd,
      stdio: "inherit",
      shell: target.shell,
      ...(env ? { env } : {}),
      ...(options.signal ? { signal: options.signal } : {}),
    });

    child.on("error", (error: NodeJS.ErrnoException) => {
      if (error.name === "AbortError") {
        resolve();
        return;
      }
      if (error.code === "ENOENT") {
        reject(
          new Error(
            `Command "${file}" was not found. Install it and make sure it is on your PATH.`,
          ),
        );
        return;
      }
      reject(error);
    });

    child.on("exit", (code, signal) => {
      if (code === 0 || options.signal?.aborted) {
        resolve();
      } else {
        reject(
          new Error(
            `Command "${file} ${args.join(" ")}" exited with ${
              signal ? `signal ${signal}` : `code ${code}`
            }`,
          ),
        );
      }
    });
  });
}
