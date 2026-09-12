/**
 * Frontend adapter interface for framework-agnostic generation.
 *
 * Every frontend framework implements this contract.
 *
 * @module adapters/frontend
 */

import type { ProjectConfiguration } from "../../types/projectConfiguration.type.js";

/**
 * Context passed to frontend adapters during generation.
 */
export interface FrontendGenerationContext {
  readonly project: ProjectConfiguration;
  readonly projectPath: string;
  readonly framework: string;
  readonly language: "typescript" | "javascript";
  readonly architecture:
    "zudojs-standard" | "feature-based" | "minimal" | "framework-default";
  readonly packageManager: "pnpm" | "npm" | "yarn" | "bun";
  readonly features: FrontendFeatures;
  /**
   * Record resolved dependencies in package.json instead of installing
   * them. Set by `zudojs create --no-install`, which the frontend pipeline
   * used to ignore: it ran the package manager regardless of the flag.
   */
  readonly skipInstall?: boolean;
}

/**
 * Optional frontend features.
 */
export interface FrontendFeatures {
  readonly stateManagement?: string;
  readonly apiClient?: boolean;
  readonly testing?: boolean;
  readonly linting?: boolean;
  readonly formatting?: boolean;
  readonly envValidation?: boolean;
  readonly uiLibrary?: string;
}

/**
 * Dependency requirement from an adapter.
 */
export interface DependencyRequirement {
  readonly name: string;
  readonly version?: string;
  readonly type: "dependency" | "devDependency";
  readonly peerDependencies?: readonly string[];
  readonly conflicts?: readonly string[];
}

/**
 * Frontend adapter contract.
 */
export interface FrontendAdapter {
  readonly name: string;
  readonly framework: string;

  /**
   * Checks if the framework is available (e.g., CLI tools installed).
   */
  isAvailable(): Promise<boolean>;

  /**
   * Gets the latest version of the framework.
   */
  getLatestVersion(): Promise<string>;

  /**
   * Scaffolds the initial project using the official framework tool.
   */
  scaffold(context: FrontendGenerationContext): Promise<void>;

  /**
   * Returns framework dependencies.
   */
  getDependencies(
    context: FrontendGenerationContext,
  ): readonly DependencyRequirement[];

  /**
   * Applies Zudojs architecture structure over the scaffolded project.
   */
  applyZudojsStructure(context: FrontendGenerationContext): Promise<void>;

  /**
   * Generates integration files (API client, env files, etc.).
   */
  generateIntegration(context: FrontendGenerationContext): Promise<void>;

  /**
   * Validates the generated project.
   */
  validate(context: FrontendGenerationContext): Promise<ValidationResult>;
}

/**
 * Validation result from an adapter.
 */
export interface ValidationResult {
  readonly valid: boolean;
  readonly errors: readonly string[];
  readonly warnings: readonly string[];
}
