/**
 * zudojs-cli — Capabilities Prompt
 *
 * Prompts for selecting Zudojs capabilities.
 */

import * as p from "@clack/prompts";
import { cancelled } from "../cancel.prompt.js";

export interface CapabilityOption {
  readonly value: string;
  readonly label: string;
  readonly hint?: string;
}

const CAPABILITY_OPTIONS: readonly CapabilityOption[] = [
  {
    value: "cqrs",
    label: "CQRS",
    hint: "Command Query Responsibility Segregation",
  },
  { value: "events", label: "Events", hint: "Event bus and middleware" },
  { value: "messaging", label: "Messaging", hint: "In-process message bus" },
  { value: "queue", label: "Queue", hint: "Background job processing" },
  {
    value: "observability",
    label: "Observability",
    hint: "Logging, metrics, tracing",
  },
  { value: "openapi", label: "OpenAPI", hint: "API documentation" },
  { value: "database", label: "Database", hint: "Database abstraction" },
  {
    value: "security",
    label: "Security",
    hint: "Input validation, CORS, CSRF",
  },
];

export async function promptCapabilities(
  selected: readonly string[] = [],
): Promise<string[]> {
  const value = await p.multiselect({
    message: "Select capabilities",
    options: CAPABILITY_OPTIONS.map((opt) => ({
      value: opt.value,
      label: opt.label,
      hint: opt.hint,
    })),
    required: false,
    initialValues: Array.from(selected),
  });

  return cancelled(value) as string[];
}
