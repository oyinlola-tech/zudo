/**
 * zudojs-cli — Services Prompt
 *
 * Prompts for microservice service names (comma-separated).
 */

import * as p from "@clack/prompts";
import { cancelled } from "../cancel.prompt.js";

const SERVICE_NAME_PATTERN = /^[a-zA-Z0-9_-]+$/;

function parseServices(value: string): string[] {
  return value
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

export async function promptServices(
  overrides?: readonly string[],
): Promise<string[]> {
  if (overrides && overrides.length > 0) {
    return [...overrides];
  }

  const value = await p.text({
    message: "Service names (comma-separated, leave blank for none)",
    placeholder: "leave blank, or e.g. billing,search",
    /**
     * Blank is a valid answer and yields a gateway-only project.
     *
     * This used to demand at least one name, and an empty list elsewhere was
     * substituted with four example services, so every project arrived with
     * domains nobody had asked for. Services are created when they are named,
     * here or later with `zudojs generate service <name>`.
     */
    validate(input) {
      const services = parseServices(input ?? "");
      for (const service of services) {
        if (!SERVICE_NAME_PATTERN.test(service)) {
          return `Invalid service name "${service}". Only alphanumeric characters, hyphens, and underscores are allowed.`;
        }
      }
    },
  });

  return parseServices(cancelled(value));
}
