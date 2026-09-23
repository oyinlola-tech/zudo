/**
 * Type definitions for the Zudojs CLI scaffolding system.
 */

import type {
  ProjectType,
  BackendArchitecture,
  FrontendFramework,
  FrontendArchitecture,
  PackageManagerType,
  DatabaseProvider,
  ApiStyle,
  ProjectConfiguration,
} from "./projectConfiguration.type.js";
import { resolveProjectCapabilities } from "../templates/shared/capability.template.js";

/**
 * Backend architecture.
 */
export type ArchitectureType = BackendArchitecture;

/**
 * Package manager.
 */
export type PackageManager = PackageManagerType;

/**
 * Database engine.
 */
export type DatabaseEngine = DatabaseProvider;

/**
 * Scaffold options for project generation.
 */
export interface ScaffoldOptions {
  readonly projectName: string;
  readonly projectType?: ProjectType;
  readonly architecture: ArchitectureType;
  readonly language?: "typescript" | "javascript";
  readonly packageManager: PackageManager;
  readonly database?: DatabaseEngine;
  readonly api?: ApiStyle;
  readonly frontend?: FrontendFramework | "none";
  readonly frontendArchitecture?: FrontendArchitecture;
  readonly frontendPath?: string;
  readonly services: readonly string[];
  readonly enableCQRS: boolean;
  readonly enableMessaging: boolean;
  readonly enableObservability: boolean;
  readonly enableOpenAPI: boolean;
  readonly enableDatabase: boolean;
  readonly enableQueue: boolean;
  /**
   * Every capability id that was selected, including those without an
   * `enable*` flag of their own (`events`, `security`). Read through
   * `resolveProjectCapabilities`, never directly.
   */
  readonly capabilities?: readonly string[];
  readonly enableDocker: boolean;
  readonly installDeps: boolean;
  readonly initGit: boolean;
}

/**
 * Project template metadata.
 */
export interface ProjectTemplate {
  readonly name: ArchitectureType;
  readonly description: string;
  readonly dependencies: readonly string[];
  readonly devDependencies: readonly string[];
}

/**
 * Generate options for schematics.
 */
export interface GenerateOptions {
  readonly schematic: string;
  readonly name: string;
  readonly service?: string;
  readonly module?: string;
  readonly dryRun: boolean;
}

/**
 * Converts ScaffoldOptions to ProjectConfiguration for runtime use.
 */
export function toProjectConfiguration(
  options: ScaffoldOptions,
): ProjectConfiguration {
  const hasFrontend =
    options.frontend !== undefined && options.frontend !== "none";

  return {
    name: options.projectName,
    type: hasFrontend ? "fullstack" : "backend",
    backend: {
      architecture: options.architecture,
      api: options.api ?? "rest",
      database: options.database,
    },
    ...(hasFrontend
      ? {
          frontend: {
            framework: options.frontend!,
            architecture: options.frontendArchitecture ?? "zudojs-standard",
            language: options.language ?? "typescript",
          },
        }
      : {}),
    workspace: {
      packageManager: options.packageManager,
    },
    features: resolveProjectCapabilities(options),
  };
}
