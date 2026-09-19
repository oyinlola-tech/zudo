/**
 * Minimal change notifier for the live registries.
 *
 * @module utils/utils.notifier
 */

/** A set of change listeners. */
export interface ChangeNotifier {
  /** Register a listener. Returns an unsubscribe function. */
  subscribe(listener: () => void): () => void;
  /**
   * Call every listener. All of them run even if one throws; the first
   * error is rethrown afterwards, so one broken subscriber cannot stop an
   * engine further down the list from dropping its stale decisions.
   */
  notify(): void;
}

/** Create a {@link ChangeNotifier}. */
export function createChangeNotifier(): ChangeNotifier {
  const listeners = new Set<() => void>();

  return {
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },

    notify() {
      let failure: { readonly error: unknown } | undefined;
      for (const listener of [...listeners]) {
        try {
          listener();
        } catch (error) {
          failure ??= { error };
        }
      }
      if (failure) throw failure.error;
    },
  };
}
