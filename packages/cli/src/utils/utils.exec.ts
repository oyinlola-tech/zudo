import { execFile, spawn } from "node:child_process";
import { promisify } from "node:util";

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
 * Quotes one argument for cmd.exe. Arguments are validated before they reach
 * here (project and service names are `[A-Za-z0-9_-]`), so this is defence
 * in depth rather than the only barrier.
 */
export function quoteForWindowsShell(argument: string): string {
  if (argument.length === 0) return '""';
  if (!CMD_UNSAFE.test(argument)) return argument;
  return `"${argument.replace(/"/g, '\\"')}"`;
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

  const { stdout, stderr } = await execFileAsync(target.file, target.args, {
    cwd,
    timeout: options.timeout ?? 120000,
    shell: target.shell,
    ...(options.env ? { env: options.env } : {}),
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

  return new Promise<void>((resolve, reject) => {
    const child = spawn(target.file, target.args, {
      cwd,
      stdio: "inherit",
      shell: target.shell,
      ...(options.env ? { env: options.env } : {}),
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
