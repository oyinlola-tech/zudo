/**
 * zudojs-cli — CLI Logger
 *
 * A `Logger` whose output is plain terminal text.
 *
 * The CLI used `createDefaultLogger()` from `@zudojs/logger`, whose console
 * transport prints the whole serialised log record. Every line a command
 * wrote to the user came out as a multi-line object literal with a
 * timestamp, a level, a logger name and an empty metadata block wrapped
 * around the message. This logger keeps the `Logger` contract (commands
 * still receive `context.logger`) and writes one line per call: info to
 * stdout, warnings and errors to stderr.
 *
 * @module cliApplication/logger
 */

import {
  createLogger,
  LoggerLevel,
  type Logger,
  type LoggerEntry,
} from "@zudojs/logger";

export interface CLILoggerOptions {
  /** Emit debug and trace lines too. Defaults to `ZUDOJS_DEBUG` being set. */
  readonly verbose?: boolean;
  /** Line writers, overridable for tests. */
  readonly stdout?: (line: string) => void;
  readonly stderr?: (line: string) => void;
}

/** Renders one entry as the single line the user sees. */
export function formatCLILogLine(entry: LoggerEntry): string {
  switch (entry.levelName) {
    case "fatal":
    case "error":
      return `Error: ${entry.message}`;
    case "warn":
      return `Warning: ${entry.message}`;
    case "debug":
    case "trace":
      return `[${entry.levelName}] ${entry.message}`;
    default:
      return entry.message;
  }
}

/** Creates the logger handed to every command as `context.logger`. */
export function createCLILogger(options: CLILoggerOptions = {}): Logger {
  const verbose =
    options.verbose ??
    (process.env["ZUDOJS_DEBUG"] !== undefined &&
      process.env["ZUDOJS_DEBUG"] !== "" &&
      process.env["ZUDOJS_DEBUG"] !== "0");

  const stdout =
    options.stdout ?? ((line: string) => process.stdout.write(`${line}\n`));
  const stderr =
    options.stderr ?? ((line: string) => process.stderr.write(`${line}\n`));

  return createLogger({
    name: "zudojs",
    level: verbose ? LoggerLevel.TRACE : LoggerLevel.INFO,
    // Writes must complete before a command returns; `process.exit` follows
    // an error immediately.
    asynchronous: false,
    formatter: (entry) => formatCLILogLine(entry),
    transports: [
      {
        name: "cli-stdio",
        enabled: true,
        write(entry: LoggerEntry): void {
          // The formatter's output arrives as the entry message.
          const line = entry.message;
          switch (entry.levelName) {
            case "fatal":
            case "error":
            case "warn":
              stderr(line);
              break;
            default:
              stdout(line);
          }
        },
      },
    ],
  });
}
