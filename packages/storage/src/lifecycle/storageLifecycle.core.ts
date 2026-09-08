/**
 * @zudojs/storage — Storage Lifecycle Manager
 *
 * Manages the lifecycle phases of storage components:
 * uninitialized → initializing → ready → draining → drained → shutdown
 */

import { StorageError } from "@zudojs/errors";
import type {
  StorageHealth,
  StorageLifecycle,
  StorageLifecyclePhase,
} from "../types/storage.type.js";

/** Runs an operation across components, collecting rather than short-circuiting. */
async function forEachComponent(
  components: readonly StorageLifecycle[],
  operation: string,
  run: (component: StorageLifecycle) => Promise<void>,
): Promise<void> {
  const results = await Promise.allSettled(components.map(run));
  const failures = results.filter(
    (result): result is PromiseRejectedResult => result.status === "rejected",
  );

  if (failures.length === 0) return;

  throw new StorageError(
    `${failures.length} of ${components.length} components failed to ${operation}`,
    {
      code: "STORAGE_LIFECYCLE_OPERATION_FAILED",
      statusCode: 500,
      cause: new AggregateError(
        failures.map((failure) => failure.reason),
        `Component ${operation} failures`,
      ),
    },
  );
}

/**
 * Lifecycle manager that coordinates storage component initialization,
 * draining, and shutdown.
 */
export class StorageLifecycleManager implements StorageLifecycle {
  private phase: StorageLifecyclePhase = "uninitialized";
  private readonly components: StorageLifecycle[] = [];

  /**
   * Register a storage component for lifecycle management.
   *
   * A component registered once the manager is already past `initializing`
   * is initialized immediately, so it cannot sit in the registry un-started.
   */
  async register(component: StorageLifecycle): Promise<void> {
    this.components.push(component);
    if (this.phase === "ready") await component.initialize();
  }

  async initialize(): Promise<void> {
    if (this.phase === "ready") return;
    this.phase = "initializing";

    try {
      for (const component of this.components) {
        await component.initialize();
      }
    } catch (error) {
      this.phase = "uninitialized";
      throw error;
    }

    this.phase = "ready";
  }

  async start(): Promise<void> {
    if (this.phase !== "ready") {
      throw new StorageError(`Cannot start from phase: ${this.phase}`, {
        code: "STORAGE_LIFECYCLE_INVALID_PHASE",
        statusCode: 500,
      });
    }
    for (const component of this.components) {
      await component.start();
    }
  }

  async healthCheck(): Promise<StorageHealth> {
    const results = await Promise.allSettled(
      this.components.map((c) => c.healthCheck()),
    );

    const healthy =
      this.components.length > 0 &&
      results.every((r) => r.status === "fulfilled" && r.value.healthy);

    const latencyMs = results.reduce((max, r) => {
      if (r.status === "fulfilled") return Math.max(max, r.value.latencyMs);
      return max;
    }, 0);

    return {
      healthy,
      latencyMs,
      status: this.phase,
      details: {
        componentCount: this.components.length,
        phases: this.components.map((c) => c.getPhase()),
      },
    };
  }

  async drain(): Promise<void> {
    this.phase = "draining";
    try {
      await forEachComponent(this.components, "drain", (c) => c.drain());
    } finally {
      this.phase = "drained";
    }
  }

  async shutdown(): Promise<void> {
    try {
      await forEachComponent(this.components, "shutdown", (c) => c.shutdown());
    } finally {
      this.phase = "shutdown";
    }
  }

  getPhase(): StorageLifecyclePhase {
    return this.phase;
  }
}
