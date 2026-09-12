/**
 * Cleanup manager for test resources.
 *
 * Registers cleanup functions during tests and executes them
 * in reverse order on dispose. Handles errors safely to ensure
 * all cleanups run even if one fails.
 */

/**
 * A registered cleanup function with metadata.
 */
export interface CleanupEntry {
  readonly id: number;
  readonly label: string;
  readonly fn: () => Promise<void> | void;
}

/**
 * Options for the cleanup manager.
 */
export interface CleanupManagerOptions {
  readonly label?: string;
  readonly onError?: (error: unknown, entry: CleanupEntry) => void;
}

/**
 * Manages test resource cleanup.
 *
 * Registers cleanup functions and executes them in reverse order
 * when `dispose()` is called. Protects against open handles,
 * timers, database connections, and other resources leaking
 * after tests complete.
 *
 * Every cleanup runs even if an earlier one fails, and `dispose()` then
 * throws an `AggregateError` describing what failed. A leaked connection
 * matters whether or not the other cleanups succeeded.
 *
 * @example
 * ```ts
 * const cleanup = createCleanupManager();
 *
 * cleanup.register(() => database.close());
 * cleanup.register(() => server.stop());
 *
 * await cleanup.dispose();
 * ```
 */
export interface CleanupManager {
  readonly disposed: boolean;
  readonly count: number;
  register: (fn: () => Promise<void> | void, label?: string) => void;
  dispose: () => Promise<void>;
}

/**
 * Creates a cleanup manager for test resources.
 *
 * @param options - Configuration for the cleanup manager.
 * @returns A new CleanupManager instance.
 */
export function createCleanupManager(
  options: CleanupManagerOptions = {},
): CleanupManager {
  const entries: CleanupEntry[] = [];
  let nextId = 0;
  let disposed = false;
  let inFlight: Promise<void> | undefined;

  const register = (
    fn: () => Promise<void> | void,
    label: string = `cleanup-${nextId}`,
  ): void => {
    if (disposed) {
      throw new Error(
        "Cannot register cleanup after manager has been disposed.",
      );
    }

    entries.push({
      id: nextId++,
      label,
      fn,
    });
  };

  const runCleanups = async (): Promise<void> => {
    const errors: Array<{
      entry: CleanupEntry;
      error: unknown;
    }> = [];

    const reversed = [...entries].reverse();

    for (const entry of reversed) {
      try {
        await entry.fn();
      } catch (error) {
        errors.push({ entry, error });
        options.onError?.(error, entry);
      }
    }

    const attempted = reversed.length;
    entries.length = 0;

    if (errors.length > 0) {
      throw new AggregateError(
        errors.map((entry) => entry.error),
        `${errors.length} of ${attempted} cleanup functions failed: ${errors
          .map((entry) => entry.entry.label)
          .join(", ")}`,
      );
    }
  };

  /**
   * Runs the cleanups once. A second call made while the first is still
   * running shares its promise, so nobody is told "disposed" before the
   * resources are actually released; a call after completion resolves
   * immediately.
   */
  const dispose = (): Promise<void> => {
    if (inFlight) return inFlight;
    if (disposed) return Promise.resolve();

    disposed = true;
    inFlight = runCleanups().finally(() => {
      inFlight = undefined;
    });

    return inFlight;
  };

  return {
    get disposed(): boolean {
      return disposed;
    },
    get count(): number {
      return entries.length;
    },
    register,
    dispose,
  };
}
