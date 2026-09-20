/**
 * zudojs-cli — Framework Prompt
 *
 * Prompts for frontend framework selection.
 */

import * as p from "@clack/prompts";
import { cancelled } from "../cancel.prompt.js";
import type { FrontendFramework } from "../../types/projectConfiguration.type.js";

const FRONTEND_OPTIONS: readonly {
  readonly value: FrontendFramework;
  readonly label: string;
  readonly hint: string;
}[] = [
  { value: "react", label: "React", hint: "SPA with Vite" },
  { value: "next", label: "Next.js", hint: "Full React framework" },
  { value: "vue", label: "Vue", hint: "SPA with Vite" },
  { value: "nuxt", label: "Nuxt", hint: "Full Vue framework" },
  { value: "angular", label: "Angular", hint: "Enterprise framework" },
  { value: "svelte", label: "Svelte", hint: "Compiler-based UI" },
  { value: "sveltekit", label: "SvelteKit", hint: "Full Svelte framework" },
  { value: "astro", label: "Astro", hint: "Content-focused islands" },
  { value: "vanilla", label: "Vanilla HTML", hint: "No framework" },
  { value: "flutter", label: "Flutter", hint: "Cross-platform mobile" },
  { value: "react-native", label: "React Native", hint: "Mobile with React" },
];

export async function promptFramework(
  projectType: string,
  overrides?: FrontendFramework | "none",
): Promise<FrontendFramework | "none"> {
  const options =
    projectType === "frontend"
      ? FRONTEND_OPTIONS
      : [
          { value: "none", label: "None", hint: "Skip frontend" },
          ...FRONTEND_OPTIONS,
        ];

  const value =
    overrides ??
    (await p.select({
      message: "Select frontend framework",
      options: [...options].map((opt) => ({
        value: opt.value,
        label: opt.label,
        hint: opt.hint,
      })),
    }));

  return cancelled(value) as FrontendFramework | "none";
}
