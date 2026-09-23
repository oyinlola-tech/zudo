/**
 * Console logger transport.
 */

import type {
  LoggerTransport,
  LoggerTransportOptions,
  RegisteredLoggerTransport,
} from "../loggerTransport.type.js";

import { createLoggerTransport } from "../loggerTransport.core.js";

import { formatTransportLine } from "../loggerTransportHelpers/loggerTransportHelpers.js";

/**
 * Creates a simple console transport.
 *
 * Prints one line per record through the standard console methods (no
 * Node.js-specific APIs): `entry.formatted` when the logger's formatter
 * produced it, otherwise the entry as a single JSON line.
 */
export function createConsoleLoggerTransport(
  options: LoggerTransportOptions = {},
): RegisteredLoggerTransport {
  const transport: LoggerTransport = {
    name: options.name ?? "console",

    enabled: options.enabled ?? true,

    write(entry): void {
      // One line per record: the formatter's line (text or JSON), or the
      // entry as JSON. Printing the record object showed the timestamp and
      // level twice beside a text line, and spread a structured record over
      // several lines of console output.
      const payload = formatTransportLine(entry);

      switch (entry.levelName) {
        case "fatal":
        case "error":
          console.error(payload);
          break;

        case "warn":
          console.warn(payload);
          break;

        case "debug":
        case "trace":
          console.debug(payload);
          break;

        case "info":
        default:
          console.info(payload);
          break;
      }
    },
  };

  return createLoggerTransport(transport, options);
}
