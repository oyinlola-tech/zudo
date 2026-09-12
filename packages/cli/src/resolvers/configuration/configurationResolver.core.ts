/**
 * zudojs-cli — Configuration Resolver
 *
 * Resolves project configuration from the sources `zudojs create` writes.
 */

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { resolveProjectLayout } from "../layout/projectLayout.core.js";

export interface ResolvedConfiguration {
  readonly projectName: string;
  readonly projectType: string;
  readonly architecture: string;
  readonly packageManager: string;
  readonly database: string;
  readonly api: string;
  readonly frontend?: string;
  readonly frontendArchitecture?: string;
  readonly language?: string;
  readonly features: readonly string[];
}

interface ManifestShape {
  readonly backend?: { readonly api?: string };
  readonly frontend?: { readonly architecture?: string };
  readonly database?: { readonly provider?: string };
  readonly capabilities?: readonly string[];
}

export class ConfigurationResolver {
  /**
   * Resolves the configuration of the project at `cwd`, or `null` when the
   * directory is not a Zudojs project.
   *
   * Only `zudojs.config.ts` used to be consulted, so every project created
   * since the manifest became the source of truth resolved to `null`.
   */
  resolve(cwd: string): ResolvedConfiguration | null {
    const layout = resolveProjectLayout(cwd);
    if (!layout) return null;

    const manifest = this.readJson<ManifestShape>(
      join(cwd, ".zudojs", "manifest.json"),
    );
    const pkg = this.readJson<{
      name?: string;
      zudojs?: { features?: unknown };
    }>(join(cwd, "package.json"));
    const legacy = this.readLegacyConfig(cwd);

    const features =
      manifest?.capabilities ??
      (Array.isArray(pkg?.zudojs?.features)
        ? pkg.zudojs.features.filter(
            (feature): feature is string => typeof feature === "string",
          )
        : undefined) ??
      this.extractArray(legacy, "features") ??
      [];

    const frontendArchitecture =
      manifest?.frontend?.architecture ??
      this.extractValue(legacy, "architecture", "frontend");
    const language = this.extractValue(legacy, "language");

    return {
      projectName: this.extractValue(legacy, "name") ?? pkg?.name ?? "unknown",
      projectType: layout.projectType,
      architecture: layout.architecture,
      packageManager: layout.packageManager,
      database:
        manifest?.database?.provider ??
        this.extractValue(legacy, "provider") ??
        "postgresql",
      api: manifest?.backend?.api ?? this.extractValue(legacy, "api") ?? "rest",
      ...(layout.frontendFramework !== undefined
        ? { frontend: layout.frontendFramework }
        : {}),
      ...(frontendArchitecture !== undefined ? { frontendArchitecture } : {}),
      ...(language !== undefined ? { language } : {}),
      features,
    };
  }

  private readJson<T>(path: string): T | null {
    if (!existsSync(path)) return null;
    try {
      return JSON.parse(readFileSync(path, "utf-8")) as T;
    } catch {
      return null;
    }
  }

  private readLegacyConfig(cwd: string): string {
    for (const name of ["zudojs.config.ts", "zudojs.config.js"]) {
      const path = join(cwd, name);
      if (!existsSync(path)) continue;
      try {
        return readFileSync(path, "utf-8");
      } catch {
        return "";
      }
    }
    return "";
  }

  private extractValue(
    content: string,
    key: string,
    section?: string,
  ): string | undefined {
    if (content.length === 0) return undefined;

    const pattern = section
      ? new RegExp(`${section}[\\s\\S]*?${key}:\\s*["']([^"']+)["']`)
      : new RegExp(`(?<![\\w])${key}:\\s*["']([^"']+)["']`);

    return content.match(pattern)?.[1];
  }

  private extractArray(content: string, key: string): string[] | undefined {
    if (content.length === 0) return undefined;

    const match = content.match(new RegExp(`${key}:\\s*\\[([^\\]]+)\\]`));
    if (!match?.[1]) return undefined;

    return match[1]
      .split(",")
      .map((s) => s.trim().replace(/["']/g, ""))
      .filter(Boolean);
  }
}
