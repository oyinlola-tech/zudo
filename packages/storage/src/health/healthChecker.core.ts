/**
 * @zudojs/storage — Health Checker
 *
 * Aggregates health checks from multiple storage components.
 */

import type { StorageHealth, StorageLifecycle } from "../types/storage.type.js";

/**
 * Result of checking multiple storage components.
 */
export interface StorageHealthReport {
  /** Overall health status. */
  readonly healthy: boolean;
  /** Individual component health results. */
  readonly components: readonly ComponentHealth[];
  /** Total check duration in milliseconds. */
  readonly durationMs: number;
}

/**
 * Health result for a single component.
 */
export interface ComponentHealth {
  /** Component name. */
  readonly name: string;
  /** Health status. */
  readonly health: StorageHealth;
}

/**
 * Aggregates health checks from multiple storage components.
 */
export class HealthChecker {
  private readonly components = new Map<string, StorageLifecycle>();

  /**
   * Register a component for health checking.
   */
  register(name: string, component: StorageLifecycle): void {
    this.components.set(name, component);
  }

  /**
   * Remove a component from health checking.
   */
  unregister(name: string): void {
    this.components.delete(name);
  }

  /**
   * Check health of all registered components.
   *
   * Reports unhealthy when nothing is registered: an empty checker cannot
   * attest to anything, and reporting green there is the most misleading
   * answer it could give.
   */
  async checkAll(): Promise<StorageHealthReport> {
    const start = Date.now();
    const results: ComponentHealth[] = [];

    const checks = Array.from(this.components.entries()).map(
      async ([name, component]) => {
        try {
          const health = await component.healthCheck();
          results.push({ name, health });
        } catch (error) {
          results.push({
            name,
            health: {
              healthy: false,
              latencyMs: 0,
              status: "error",
              details: {
                error: error instanceof Error ? error.message : "Unknown error",
              },
            },
          });
        }
      },
    );

    await Promise.allSettled(checks);

    const healthy =
      results.length > 0 && results.every((r) => r.health.healthy);

    return {
      healthy,
      components: results,
      durationMs: Date.now() - start,
    };
  }

  /**
   * Check health of a single component.
   */
  async checkOne(name: string): Promise<StorageHealth | null> {
    const component = this.components.get(name);
    if (!component) return null;

    try {
      return await component.healthCheck();
    } catch (error) {
      return {
        healthy: false,
        latencyMs: 0,
        status: "error",
        details: {
          error: error instanceof Error ? error.message : "Unknown error",
        },
      };
    }
  }

  /**
   * Get names of all registered components.
   */
  getRegisteredComponents(): readonly string[] {
    return Array.from(this.components.keys());
  }
}
