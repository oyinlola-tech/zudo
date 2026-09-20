/**
 * zudojs-cli — Manifest File Helpers
 *
 * Parsing, validation, atomic writes and locking for
 * `.zudojs/manifest.json`. Kept apart from the manager so the manager stays
 * a thin read/modify/write API over them.
 */

import { open, rename, rm, stat, writeFile } from "node:fs/promises";
import type { ZudojsManifest } from "./manifestManager.core.js";

/** How a manifest read turned out. */
export type ManifestReadStatus = "ok" | "missing" | "invalid";

/** The outcome of reading a manifest, with missing and corrupt kept apart. */
export interface ManifestReadResult {
  readonly status: ManifestReadStatus;
  readonly manifest: ZudojsManifest | null;
  /** Why an `invalid` manifest could not be used. */
  readonly reason?: string;
}

const LOCK_TIMEOUT_MS = 5_000;
const LOCK_STALE_MS = 30_000;
const LOCK_RETRY_MS = 20;

/**
 * Parses manifest text, filling in the fields an older CLI (or a hand edit)
 * may have left out.
 *
 * `capabilities` used to be read straight off an unvalidated cast, so a
 * manifest without it threw a TypeError from inside `addCapability`.
 */
export function parseManifest(content: string): ManifestReadResult {
  let parsed: unknown;

  try {
    parsed = JSON.parse(content);
  } catch (error) {
    return {
      status: "invalid",
      manifest: null,
      reason: `not valid JSON (${error instanceof Error ? error.message : String(error)})`,
    };
  }

  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    return {
      status: "invalid",
      manifest: null,
      reason: "the top level is not a JSON object",
    };
  }

  const raw = parsed as Record<string, unknown>;

  if (raw.capabilities !== undefined && !Array.isArray(raw.capabilities)) {
    return {
      status: "invalid",
      manifest: null,
      reason: '"capabilities" is not an array',
    };
  }

  const capabilities = Array.isArray(raw.capabilities)
    ? raw.capabilities.filter((item): item is string => typeof item === "string")
    : [];

  return {
    status: "ok",
    manifest: {
      ...raw,
      version: typeof raw.version === "string" ? raw.version : "",
      architecture:
        typeof raw.architecture === "string" ? raw.architecture : "monolith",
      capabilities,
      generatedAt: typeof raw.generatedAt === "string" ? raw.generatedAt : "",
      updatedAt: typeof raw.updatedAt === "string" ? raw.updatedAt : "",
    } as ZudojsManifest,
  };
}

/**
 * Writes the manifest through a sibling temp file and `rename`.
 *
 * Writing in place truncated the real file first, so an interrupted or
 * failing write left an empty or half-written manifest behind.
 */
export async function writeManifestFile(
  manifestPath: string,
  manifest: ZudojsManifest,
): Promise<void> {
  const tempPath = `${manifestPath}.${process.pid}.${Math.random()
    .toString(36)
    .slice(2)}.tmp`;

  await writeFile(tempPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf-8");

  try {
    await rename(tempPath, manifestPath);
  } catch (error) {
    await rm(tempPath, { force: true });
    throw error;
  }
}

const queues = new Map<string, Promise<unknown>>();

/**
 * Serializes a read-modify-write of one manifest.
 *
 * Concurrent `zudojs add` runs lost each other's updates: each read the
 * manifest, added its own capability and wrote the whole file back. The
 * queue orders calls inside one process and the lock file orders them
 * across processes.
 */
export async function withManifestLock<T>(
  manifestPath: string,
  operation: () => Promise<T>,
): Promise<T> {
  const previous = queues.get(manifestPath) ?? Promise.resolve();

  const run = previous.then(async () => {
    const release = await acquireLock(`${manifestPath}.lock`);
    try {
      return await operation();
    } finally {
      await release();
    }
  });

  queues.set(
    manifestPath,
    run.then(
      () => undefined,
      () => undefined,
    ),
  );

  return run;
}

async function acquireLock(lockPath: string): Promise<() => Promise<void>> {
  const deadline = Date.now() + LOCK_TIMEOUT_MS;
  const noop = async (): Promise<void> => {};

  while (true) {
    try {
      const handle = await open(lockPath, "wx");
      await handle.close();
      return async () => {
        await rm(lockPath, { force: true }).catch(() => undefined);
      };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") {
        // The lock itself cannot be created (read-only or missing
        // directory). The write is still attempted; failing here would be
        // worse than an unserialized write.
        return noop;
      }

      if (await isStale(lockPath)) {
        await rm(lockPath, { force: true }).catch(() => undefined);
        continue;
      }

      if (Date.now() >= deadline) {
        return noop;
      }

      await new Promise((resolve) => setTimeout(resolve, LOCK_RETRY_MS));
    }
  }
}

async function isStale(lockPath: string): Promise<boolean> {
  try {
    const stats = await stat(lockPath);
    return Date.now() - stats.mtimeMs > LOCK_STALE_MS;
  } catch {
    return false;
  }
}
