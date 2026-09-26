/**
 * zudojs-cli — Feature recipes: what `zudojs add <feature>` writes.
 *
 * `add` used to install a package and write no code. Every feature it
 * accepts now has a recipe: an app recipe adds an integration
 * (`src/integrations/<name>.ts`, registered between the markers of
 * `src/integrations/index.ts` and started/stopped with the runtime), its
 * config section, its `.env.example` variables and its dependencies; a
 * project recipe (docker) writes files at the project root.
 */

import type { EnvVariable } from "../templates/backendApp/index.js";
import type { MarkerName } from "../wiring/index.js";

/** What a recipe knows about the app it is applied to. */
export interface RecipeContext {
  /** Project name slug (database name, service names). */
  readonly projectSlug: string;
  /** App name: `app` for a single-app project, `gateway`, a service name. */
  readonly appName: string;
  /** Database engine recorded in the manifest (`postgresql`, ...). */
  readonly database: string;
  /** App root relative to the project root (`""`, `apps/gateway`). */
  readonly appRoot: string;
}

/** A line inserted between the markers of `src/server.ts`. */
export interface ServerLine {
  readonly marker: MarkerName;
  readonly line: string;
}

/** A recipe applied to each backend app. */
export interface AppRecipe {
  readonly scope: "app";
  readonly feature: string;
  /** One line for `zudojs add --help` style listings and the success message. */
  readonly summary: string;
  /** Throws a CLIValidationError when the app cannot take the feature. */
  readonly validate?: (context: RecipeContext) => void;
  readonly dependencies: Readonly<Record<string, string>>;
  readonly devDependencies?: Readonly<Record<string, string>>;
  /** Scripts added when missing; `replace` rewrites an existing value. */
  readonly scripts?: Readonly<Record<string, string>>;
  readonly replaceScripts?: Readonly<Record<string, { from: string; to: string }>>;
  readonly env?: (context: RecipeContext) => readonly EnvVariable[];
  /** Single-line entry for the config markers, e.g. `redis: Object.freeze({...}),`. */
  readonly configSection?: string;
  /** `src/integrations/<file>` exporting `<exportName>: Integration`. */
  readonly integration?: {
    readonly file: string;
    readonly exportName: string;
    readonly source: (context: RecipeContext) => string;
  };
  /** Extra files, relative to the app root, written only when missing. */
  readonly files?: (context: RecipeContext) => Readonly<Record<string, string>>;
  readonly serverLines?: (context: RecipeContext) => readonly ServerLine[];
  /** Lines for the project's .gitignore. */
  readonly gitignore?: (context: RecipeContext) => readonly string[];
  /** Packages allowed to run install scripts (pnpm allowBuilds). */
  readonly allowBuilds?: readonly string[];
  /**
   * Transitive dependencies forced to a range, written at the project root
   * where every package manager reads them (`overrides` in
   * pnpm-workspace.yaml, `overrides` or `resolutions` in package.json).
   */
  readonly overrides?: Readonly<Record<string, string>>;
  /** What to do next, printed after the recipe is applied. */
  readonly nextSteps?: (context: RecipeContext) => readonly string[];
}

/** Everything a project recipe needs to know. */
export interface ProjectRecipeContext {
  readonly root: string;
  readonly projectSlug: string;
  readonly architecture: string;
  readonly packageManager: string;
  readonly database: string;
  /** Features already enabled anywhere in the project (plus this one). */
  readonly features: ReadonlySet<string>;
  /** Backend apps: root-relative directory, name and port. */
  readonly apps: readonly { readonly dir: string; readonly name: string; readonly port: number; readonly prisma: boolean }[];
}

/** A recipe applied once, at the project root. */
export interface ProjectRecipe {
  readonly scope: "project";
  readonly feature: string;
  readonly summary: string;
  /** Files to write (relative to the root); existing files are kept. */
  readonly files: (context: ProjectRecipeContext) => Readonly<Record<string, string>>;
  readonly env?: (context: ProjectRecipeContext) => readonly EnvVariable[];
  readonly nextSteps?: (context: ProjectRecipeContext) => readonly string[];
}

/** Any recipe. */
export type FeatureRecipe = AppRecipe | ProjectRecipe;
