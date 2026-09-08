/**
 * zudojs-cli — Services Prompt
 *
 * Prompts for microservice service names (comma-separated).
 */

import * as p from "@clack/prompts";

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
    message: "Service names (comma-separated)",
    placeholder: "identity,billing,notification",
    validate(input) {
      const services = parseServices(input ?? "");
      if (services.length === 0) {
        return "At least one service name is required.";
      }
      for (const service of services) {
        if (!SERVICE_NAME_PATTERN.test(service)) {
          return `Invalid service name "${service}". Only alphanumeric characters, hyphens, and underscores are allowed.`;
        }
      }
    },
  });

  if (p.isCancel(value)) {
    p.cancel("Operation cancelled.");
    process.exit(0);
  }

  return parseServices(value);
}
