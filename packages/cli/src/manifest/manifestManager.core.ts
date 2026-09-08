/**
 * zudojs-cli — Manifest System
 *
 * Machine-managed project manifest for Zudojs projects.
 */

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

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

  async create(
    manifest: Omit<ZudojsManifest, "generatedAt" | "updatedAt">,
  ): Promise<void> {
    const now = new Date().toISOString();
    const fullManifest: ZudojsManifest = {
      ...manifest,
      generatedAt: now,
      updatedAt: now,
    };

    await this.write(fullManifest);
  }

  async read(): Promise<ZudojsManifest | null> {
    if (!existsSync(this.manifestPath)) {
      return null;
    }

    try {
      const content = readFileSync(this.manifestPath, "utf-8");
      return JSON.parse(content) as ZudojsManifest;
    } catch {
      return null;
    }
  }

  async update(updates: Partial<ZudojsManifest>): Promise<void> {
    const existing = await this.read();

    if (!existing) {
      return;
    }

    const updated: ZudojsManifest = {
      ...existing,
      ...updates,
      updatedAt: new Date().toISOString(),
    };

    await this.write(updated);
  }

  async addCapability(capability: string): Promise<void> {
    const existing = await this.read();

    if (!existing) {
      return;
    }

    const capabilities = existing.capabilities.includes(capability)
      ? existing.capabilities
      : [...existing.capabilities, capability];

    await this.update({ capabilities });
  }

  private async write(manifest: ZudojsManifest): Promise<void> {
    const dir = join(this.manifestPath, "..");
    const { mkdir } = await import("node:fs/promises");
    await mkdir(dir, { recursive: true });
    writeFileSync(this.manifestPath, JSON.stringify(manifest, null, 2));
  }
}
