/**
 * zudojs-cli — Manifest System
 *
 * Machine-managed project manifest for Zudojs projects.
 */

import { existsSync, readFileSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { CLIGenerationError } from "../errors/index.js";
import {
  parseManifest,
  withManifestLock,
  writeManifestFile,
  type ManifestReadResult,
} from "./manifestFile.helper.js";

export interface ZudojsManifest {
  readonly version: string;
  readonly projectType?: string;
  readonly architecture: string;
  /** Service names for microservice projects. */
  readonly services?: readonly string[];
  readonly backend?: {
    readonly architecture: string;
    readonly api: string;
  };
  readonly frontend?: {
    readonly framework: string;
    readonly architecture: string;
  };
  readonly database?: {
    readonly provider: string;
  };
  readonly workspace?: {
    readonly packageManager: string;
  };
  readonly capabilities: readonly string[];
  readonly generatedAt: string;
  readonly updatedAt: string;
}

export class ManifestManager {
  private readonly manifestPath: string;

  constructor(cwd: string) {
    this.manifestPath = join(cwd, ".zudojs", "manifest.json");
  }

  /** Absolute path of the manifest this manager owns. */
  get path(): string {
    return this.manifestPath;
  }

  async create(
    manifest: Omit<ZudojsManifest, "generatedAt" | "updatedAt">,
  ): Promise<void> {
    const now = new Date().toISOString();

    await withManifestLock(this.manifestPath, async () => {
      await this.write({ ...manifest, generatedAt: now, updatedAt: now });
    });
  }

  /**
   * Reads the manifest, keeping "there is none" and "there is one but it is
   * corrupt" apart. A blanket catch used to report both as missing.
   */
  async readResult(): Promise<ManifestReadResult> {
    if (!existsSync(this.manifestPath)) {
      return { status: "missing", manifest: null };
    }

    let content: string;
    try {
      content = readFileSync(this.manifestPath, "utf-8");
    } catch (error) {
      return {
        status: "invalid",
        manifest: null,
        reason: `could not be read (${error instanceof Error ? error.message : String(error)})`,
      };
    }

    return parseManifest(content);
  }

  async read(): Promise<ZudojsManifest | null> {
    return (await this.readResult()).manifest;
  }

  /**
   * Applies `updates` to the manifest on disk.
   *
   * Throws when there is no usable manifest: returning silently made
   * `zudojs add` report success while nothing had been recorded.
   */
  async update(updates: Partial<ZudojsManifest>): Promise<void> {
    await withManifestLock(this.manifestPath, async () => {
      const existing = this.require(await this.readResult());

      await this.write({
        ...existing,
        ...updates,
        updatedAt: new Date().toISOString(),
      });
    });
  }

  /** Adds `capability` to the manifest if it is not already recorded. */
  async addCapability(capability: string): Promise<void> {
    await withManifestLock(this.manifestPath, async () => {
      const existing = this.require(await this.readResult());

      if (existing.capabilities.includes(capability)) {
        return;
      }

      await this.write({
        ...existing,
        capabilities: [...existing.capabilities, capability],
        updatedAt: new Date().toISOString(),
      });
    });
  }

  private require(result: ManifestReadResult): ZudojsManifest {
    if (result.status === "ok" && result.manifest) {
      return result.manifest;
    }

    throw new CLIGenerationError(
      result.status === "missing"
        ? `No project manifest at ${this.manifestPath}.`
        : `The project manifest at ${this.manifestPath} is unusable: ${result.reason ?? "unknown reason"}.`,
    );
  }

  private async write(manifest: ZudojsManifest): Promise<void> {
    await mkdir(dirname(this.manifestPath), { recursive: true });
    await writeManifestFile(this.manifestPath, manifest);
  }
}
