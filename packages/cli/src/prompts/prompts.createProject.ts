/**
 * zudojs-cli — Prompts
 *
 * Interactive prompt utilities for the CLI.
 */

import type { ScaffoldOptions } from "../types/index.js";

export interface CreateProjectPrompts {
  readonly projectName: string;
  readonly projectType: ScaffoldOptions["projectType"];
  readonly architecture: ScaffoldOptions["architecture"];
  readonly packageManager: ScaffoldOptions["packageManager"];
  readonly database: ScaffoldOptions["database"];
  readonly api: ScaffoldOptions["api"];
  readonly frontend: ScaffoldOptions["frontend"];
  readonly frontendArchitecture: ScaffoldOptions["frontendArchitecture"];
  readonly language: ScaffoldOptions["language"];
  readonly enableCQRS: boolean;
  readonly enableMessaging: boolean;
  readonly enableObservability: boolean;
  readonly enableOpenAPI: boolean;
  readonly enableDatabase: boolean;
  readonly enableQueue: boolean;
  readonly enableDocker: boolean;
  readonly installDeps: boolean;
  readonly initGit: boolean;
  readonly services: readonly string[];
}

export interface PromptChoice {
  readonly value: string;
  readonly label: string;
}

export async function promptCreateProject(
  overrides?: Partial<CreateProjectPrompts>,
): Promise<CreateProjectPrompts> {
  const { stdin, stdout } = process;
  const ask = (query: string): Promise<string> =>
    new Promise((resolve) => {
      stdout.write(query);
      stdin.resume();
      stdin.once("data", (data) => {
        stdin.pause();
        resolve(data.toString().trim());
      });
    });

  const askChoice = async (
    query: string,
    choices: readonly PromptChoice[],
    defaultValue: string,
  ): Promise<string> => {
    stdout.write(`\n${query}\n`);
    choices.forEach((c, i) => {
      stdout.write(`  ${i + 1}) ${c.label}\n`);
    });
    const answer = await ask(
      `\nSelect (1-${choices.length}, default ${defaultValue}): `,
    );
    const idx = Number.parseInt(answer, 10) - 1;
    if (idx >= 0 && idx < choices.length) {
      return choices[idx]!.value;
    }
    return defaultValue;
  };

  const askConfirm = async (
    query: string,
    defaultValue: boolean,
  ): Promise<boolean> => {
    const answer = await ask(`\n${query} (y/N): `);
    if (answer === "") return defaultValue;
    return answer.toLowerCase().startsWith("y");
  };

  const projectName = overrides?.projectName ?? (await ask(`\nProject name: `));

  const projectType = (overrides?.projectType ??
    (await askChoice(
      "Select project type",
      [
        { value: "backend", label: "Backend" },
        { value: "frontend", label: "Frontend" },
        { value: "fullstack", label: "Full Stack" },
      ],
      "backend",
    ))) as CreateProjectPrompts["projectType"];

  const architecture = (overrides?.architecture ??
    (await askChoice(
      "Select backend architecture",
      [
        { value: "monolith", label: "Monolith" },
        { value: "modular-monolith", label: "Modular Monolith" },
        { value: "microservice", label: "Microservice" },
      ],
      "monolith",
    ))) as CreateProjectPrompts["architecture"];

  const frontendOptions = [
    { value: "react", label: "React" },
    { value: "next", label: "Next.js" },
    { value: "vue", label: "Vue" },
    { value: "nuxt", label: "Nuxt" },
    { value: "angular", label: "Angular" },
    { value: "svelte", label: "Svelte" },
    { value: "sveltekit", label: "SvelteKit" },
    { value: "astro", label: "Astro" },
    { value: "vanilla", label: "Vanilla HTML" },
    { value: "flutter", label: "Flutter" },
    { value: "react-native", label: "React Native" },
  ];

  const frontend = (overrides?.frontend ??
    (await askChoice(
      "Select frontend framework",
      projectType === "frontend"
        ? frontendOptions
        : [{ value: "none", label: "None" }, ...frontendOptions],
      "none",
    ))) as CreateProjectPrompts["frontend"];

  const frontendArchitecture = (overrides?.frontendArchitecture ??
    (await askChoice(
      "Select frontend architecture",
      [
        { value: "zudojs-standard", label: "Zudojs Standard" },
        { value: "feature-based", label: "Feature Based" },
        { value: "minimal", label: "Minimal" },
        { value: "framework-default", label: "Framework Default" },
      ],
      "zudojs-standard",
    ))) as CreateProjectPrompts["frontendArchitecture"];

  const language = (overrides?.language ??
    (await askChoice(
      "Select language",
      [
        { value: "typescript", label: "TypeScript" },
        { value: "javascript", label: "JavaScript" },
      ],
      "typescript",
    ))) as CreateProjectPrompts["language"];

  const packageManager = (overrides?.packageManager ??
    (await askChoice(
      "Select package manager",
      [
        { value: "pnpm", label: "pnpm" },
        { value: "npm", label: "npm" },
        { value: "yarn", label: "yarn" },
        { value: "bun", label: "bun" },
      ],
      "pnpm",
    ))) as CreateProjectPrompts["packageManager"];

  const database = (overrides?.database ??
    (await askChoice(
      "Select database",
      [
        { value: "postgresql", label: "PostgreSQL" },
        { value: "mysql", label: "MySQL" },
        { value: "sqlite", label: "SQLite" },
      ],
      "postgresql",
    ))) as CreateProjectPrompts["database"];

  const api = (overrides?.api ??
    (await askChoice(
      "Select API style",
      [
        { value: "rest", label: "REST" },
        { value: "graphql", label: "GraphQL" },
        { value: "rpc", label: "RPC" },
      ],
      "rest",
    ))) as CreateProjectPrompts["api"];

  let services: string[] = [];

  if (
    architecture === "microservice" ||
    architecture === "modular-monolith"
  ) {
    const serviceAnswer = await ask(
      `\nEnter ${architecture === "microservice" ? "service" : "module"} names (comma-separated): `,
    );

    if (serviceAnswer) {
      services = serviceAnswer
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
    }

    if (services.length === 0) {
      services = ["identity"];
    }
  } else if (architecture === "monolith") {
    const serviceAnswer = await ask(
      "\nEnter service name (default: app): ",
    );

    services = serviceAnswer
      ? [serviceAnswer.trim()]
      : [projectName.toLowerCase().replace(/[^a-z0-9-]+/gi, "-")];
  }

  const enableCQRS =
    overrides?.enableCQRS ?? (await askConfirm("\nEnable CQRS?", true));
  const enableMessaging =
    overrides?.enableMessaging ??
    (await askConfirm("\nEnable messaging?", true));
  const enableObservability =
    overrides?.enableObservability ??
    (await askConfirm("\nEnable observability?", true));
  const enableOpenAPI =
    overrides?.enableOpenAPI ?? (await askConfirm("\nEnable OpenAPI?", true));
  const enableDatabase =
    overrides?.enableDatabase ?? (await askConfirm("\nEnable database?", true));
  const enableQueue =
    overrides?.enableQueue ?? (await askConfirm("\nEnable job queue?", false));
  const enableDocker =
    overrides?.enableDocker ??
    (await askConfirm("\nEnable Docker?", architecture === "microservice"));

  const installDeps =
    overrides?.installDeps ??
    (await askConfirm("\nInstall dependencies?", true));
  const initGit =
    overrides?.initGit ?? (await askConfirm("\nInitialize git?", true));

  return {
    projectName,
    projectType,
    architecture,
    packageManager,
    database,
    api,
    frontend,
    frontendArchitecture,
    language,
    enableCQRS,
    enableMessaging,
    enableObservability,
    enableOpenAPI,
    enableDatabase,
    enableQueue,
    enableDocker,
    installDeps,
    initGit,
    services,
  };
}
