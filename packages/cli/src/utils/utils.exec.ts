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
  const { stdout, stderr } = await execFileAsync(file, args, {
    cwd,
    timeout: options.timeout ?? 120000,
    ...(options.env ? { env: options.env } : {}),
  });
  return { stdout, stderr };
}

/**
 * Runs a command with inherited stdio and no timeout.
 *
 * Use for long-running processes (dev servers) and for dependency installs
 * so output streams to the user and slow commands are not killed.
 */
export function runStreaming(
  file: string,
  args: readonly string[],
  cwd: string,
  options: ExecOptions = {},
): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const child = spawn(file, Array.from(args), {
      cwd,
      stdio: "inherit",
      ...(options.env ? { env: options.env } : {}),
    });

    child.on("error", (error) => {
      reject(error);
    });

    child.on("exit", (code, signal) => {
      if (code === 0) {
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
