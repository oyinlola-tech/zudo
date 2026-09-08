import { describe, it, expect, vi } from "vitest";
import {
  Lifecycle,
  LifecycleState,
  InvalidStateError,
  type LifecycleParticipant,
} from "../src/index.js";

// ─── Helpers ────────────────────────────────────────────

function createParticipant(
  name: string,
  hooks?: {
    initialize?: () => Promise<void> | void;
    start?: () => Promise<void> | void;
    stop?: () => Promise<void> | void;
    dispose?: () => Promise<void> | void;
  },
): LifecycleParticipant {
  return {
    name,
    initialize: hooks?.initialize,
    start: hooks?.start,
    stop: hooks?.stop,
    dispose: hooks?.dispose,
  };
}

// ─── Tests ──────────────────────────────────────────────

describe("Lifecycle", () => {
  describe("initial state", () => {
    it("should start in CREATED state", () => {
      const lifecycle = new Lifecycle();
      expect(lifecycle.getState()).toBe(LifecycleState.CREATED);
    });

    it("should have no participants initially", () => {
      const lifecycle = new Lifecycle();
      expect(lifecycle.getParticipants()).toEqual([]);
    });
  });

  describe("register", () => {
    it("should register a participant", () => {
      const lifecycle = new Lifecycle();
      const participant = createParticipant("test");

      lifecycle.register(participant);

      expect(lifecycle.getParticipants()).toHaveLength(1);
      expect(lifecycle.getParticipants()[0]!.name).toBe("test");
    });

    it("should register multiple participants in order", () => {
      const lifecycle = new Lifecycle();

      lifecycle.register(createParticipant("first"));
      lifecycle.register(createParticipant("second"));
      lifecycle.register(createParticipant("third"));

      const names = lifecycle.getParticipants().map((p) => p.name);
      expect(names).toEqual(["first", "second", "third"]);
    });

    it("should throw when registering during RUNNING state", async () => {
      const lifecycle = new Lifecycle();

      await lifecycle.initialize();
      await lifecycle.start();

      expect(() => lifecycle.register(createParticipant("late"))).toThrow(
        "Cannot register",
      );
    });

    it("should throw when registering once initialization has begun", async () => {
      const lifecycle = new Lifecycle();
      const late = vi.fn();

      lifecycle.register(
        createParticipant("registrar", {
          initialize: () => {
            lifecycle.register(createParticipant("late", { initialize: late }));
          },
        }),
      );

      await expect(lifecycle.initialize()).rejects.toThrow(InvalidStateError);
      expect(late).not.toHaveBeenCalled();

      const initialized = new Lifecycle();
      await initialized.initialize();
      expect(() => initialized.register(createParticipant("late"))).toThrow(
        InvalidStateError,
      );
    });
  });

  describe("initialize", () => {
    it("should transition to INITIALIZED", async () => {
      const lifecycle = new Lifecycle();

      await lifecycle.initialize();

      expect(lifecycle.getState()).toBe(LifecycleState.INITIALIZED);
    });

    it("should call participant.initialize()", async () => {
      const initFn = vi.fn();
      const lifecycle = new Lifecycle();

      lifecycle.register(createParticipant("test", { initialize: initFn }));
      await lifecycle.initialize();

      expect(initFn).toHaveBeenCalledOnce();
    });

    it("should call participants in registration order", async () => {
      const order: string[] = [];
      const lifecycle = new Lifecycle();

      lifecycle.register(
        createParticipant("first", {
          initialize: async () => {
            order.push("first");
          },
        }),
      );
      lifecycle.register(
        createParticipant("second", {
          initialize: async () => {
            order.push("second");
          },
        }),
      );

      await lifecycle.initialize();

      expect(order).toEqual(["first", "second"]);
    });

    it("should be idempotent", async () => {
      const initFn = vi.fn();
      const lifecycle = new Lifecycle();

      lifecycle.register(createParticipant("test", { initialize: initFn }));
      await lifecycle.initialize();
      await lifecycle.initialize();

      expect(initFn).toHaveBeenCalledOnce();
    });

    it("should let concurrent callers await a slow initialization (>1s)", async () => {
      vi.useFakeTimers();
      try {
        const lifecycle = new Lifecycle();
        lifecycle.register(
          createParticipant("slow", {
            initialize: () =>
              new Promise<void>((resolve) => setTimeout(resolve, 3_000)),
          }),
        );

        const first = lifecycle.initialize();
        const second = lifecycle.initialize();
        const third = lifecycle.start();

        await vi.advanceTimersByTimeAsync(3_000);
        await Promise.all([first, second, third]);

        expect(lifecycle.getState()).toBe(LifecycleState.RUNNING);
      } finally {
        vi.useRealTimers();
      }
    });

    it("should retry initialization from the failed participant", async () => {
      const initialized: string[] = [];
      let fail = true;
      const lifecycle = new Lifecycle();

      lifecycle.register(
        createParticipant("first", {
          initialize: () => {
            initialized.push("first");
          },
        }),
      );
      lifecycle.register(
        createParticipant("flaky", {
          initialize: () => {
            if (fail) throw new Error("flaky init");
            initialized.push("flaky");
          },
        }),
      );

      await expect(lifecycle.initialize()).rejects.toThrow("flaky init");
      fail = false;
      await lifecycle.initialize();

      expect(lifecycle.getState()).toBe(LifecycleState.INITIALIZED);
      expect(initialized).toEqual(["first", "flaky"]);
    });

    it("should transition to FAILED on error", async () => {
      const lifecycle = new Lifecycle();

      lifecycle.register(
        createParticipant("failing", {
          initialize: async () => {
            throw new Error("init failed");
          },
        }),
      );

      await expect(lifecycle.initialize()).rejects.toThrow("init failed");
      expect(lifecycle.getState()).toBe(LifecycleState.FAILED);
    });
  });

  describe("start", () => {
    it("should auto-initialize if in CREATED state", async () => {
      const initFn = vi.fn();
      const startFn = vi.fn();
      const lifecycle = new Lifecycle();

      lifecycle.register(
        createParticipant("test", {
          initialize: initFn,
          start: startFn,
        }),
      );

      await lifecycle.start();

      expect(initFn).toHaveBeenCalledOnce();
      expect(startFn).toHaveBeenCalledOnce();
      expect(lifecycle.getState()).toBe(LifecycleState.RUNNING);
    });

    it("should call participant.start()", async () => {
      const startFn = vi.fn();
      const lifecycle = new Lifecycle();

      lifecycle.register(createParticipant("test", { start: startFn }));
      await lifecycle.initialize();
      await lifecycle.start();

      expect(startFn).toHaveBeenCalledOnce();
    });

    it("should restart from STOPPED without re-initializing", async () => {
      const initFn = vi.fn();
      const startFn = vi.fn();
      const stopFn = vi.fn();
      const lifecycle = new Lifecycle();

      lifecycle.register(
        createParticipant("test", {
          initialize: initFn,
          start: startFn,
          stop: stopFn,
        }),
      );

      await lifecycle.start();
      await lifecycle.stop();
      await lifecycle.start();

      expect(lifecycle.getState()).toBe(LifecycleState.RUNNING);
      expect(initFn).toHaveBeenCalledOnce();
      expect(startFn).toHaveBeenCalledTimes(2);
      expect(stopFn).toHaveBeenCalledOnce();
    });

    it("should refuse to start after dispose", async () => {
      const lifecycle = new Lifecycle();

      await lifecycle.start();
      await lifecycle.shutdown();

      await expect(lifecycle.start()).rejects.toThrow(InvalidStateError);
      await expect(lifecycle.start()).rejects.toThrow(
        'Cannot start application while state is "stopped"',
      );
    });

    it("should share the in-flight promise between concurrent start() calls", async () => {
      const startFn = vi.fn(
        () => new Promise<void>((resolve) => setTimeout(resolve, 20)),
      );
      const lifecycle = new Lifecycle();
      lifecycle.register(createParticipant("slow", { start: startFn }));

      const first = lifecycle.start();
      const second = lifecycle.start();

      expect(lifecycle.getState()).toBe(LifecycleState.INITIALIZING);
      await Promise.all([first, second]);

      expect(startFn).toHaveBeenCalledOnce();
      expect(lifecycle.getState()).toBe(LifecycleState.RUNNING);
    });

    it("should resume startup from the failed participant on retry", async () => {
      const order: string[] = [];
      let fail = true;
      const lifecycle = new Lifecycle();

      lifecycle.register(
        createParticipant("first", {
          start: () => {
            order.push("first");
          },
        }),
      );
      lifecycle.register(
        createParticipant("flaky", {
          start: () => {
            order.push("flaky");
            if (fail) throw new Error("flaky start");
          },
        }),
      );
      lifecycle.register(
        createParticipant("third", {
          start: () => {
            order.push("third");
          },
        }),
      );

      await expect(lifecycle.start()).rejects.toThrow("flaky start");
      expect(lifecycle.getState()).toBe(LifecycleState.FAILED);

      fail = false;
      await lifecycle.start();

      expect(lifecycle.getState()).toBe(LifecycleState.RUNNING);
      expect(order).toEqual(["first", "flaky", "flaky", "third"]);
    });

    it("should throw on error during start", async () => {
      const lifecycle = new Lifecycle();

      lifecycle.register(
        createParticipant("failing", {
          start: async () => {
            throw new Error("start failed");
          },
        }),
      );

      await lifecycle.initialize();
      await expect(lifecycle.start()).rejects.toThrow("start failed");
      expect(lifecycle.getState()).toBe(LifecycleState.FAILED);
    });
  });

  describe("stop", () => {
    it("should stop participants in reverse order", async () => {
      const order: string[] = [];
      const lifecycle = new Lifecycle();

      lifecycle.register(
        createParticipant("first", {
          stop: async () => {
            order.push("first");
          },
        }),
      );
      lifecycle.register(
        createParticipant("second", {
          stop: async () => {
            order.push("second");
          },
        }),
      );

      await lifecycle.initialize();
      await lifecycle.start();
      await lifecycle.stop();

      expect(order).toEqual(["second", "first"]);
    });

    it("should transition to STOPPED", async () => {
      const lifecycle = new Lifecycle();

      await lifecycle.initialize();
      await lifecycle.start();
      await lifecycle.stop();

      expect(lifecycle.getState()).toBe(LifecycleState.STOPPED);
    });

    it("should be safe to call multiple times", async () => {
      const stopFn = vi.fn();
      const lifecycle = new Lifecycle();

      lifecycle.register(createParticipant("test", { stop: stopFn }));

      await lifecycle.initialize();
      await lifecycle.start();
      await lifecycle.stop();
      await lifecycle.stop();

      expect(stopFn).toHaveBeenCalledOnce();
      expect(lifecycle.getState()).toBe(LifecycleState.STOPPED);
    });

    it("should stop cleanly from INITIALIZED without running stop hooks", async () => {
      const stopFn = vi.fn();
      const lifecycle = new Lifecycle();

      lifecycle.register(createParticipant("test", { stop: stopFn }));
      await lifecycle.initialize();
      await lifecycle.stop();

      expect(stopFn).not.toHaveBeenCalled();
      expect(lifecycle.getState()).toBe(LifecycleState.STOPPED);
    });

    it("should only stop participants that actually started", async () => {
      const stops: string[] = [];
      const lifecycle = new Lifecycle();

      lifecycle.register(
        createParticipant("first", {
          stop: () => {
            stops.push("first");
          },
        }),
      );
      lifecycle.register(
        createParticipant("broken", {
          start: () => {
            throw new Error("boom");
          },
          stop: () => {
            stops.push("broken");
          },
        }),
      );

      await expect(lifecycle.start()).rejects.toThrow("boom");
      await lifecycle.stop();

      expect(stops).toEqual(["first"]);
      expect(lifecycle.getState()).toBe(LifecycleState.STOPPED);
    });

    it("should wait for an in-flight start before stopping", async () => {
      const order: string[] = [];
      const lifecycle = new Lifecycle();

      lifecycle.register(
        createParticipant("slow", {
          start: async () => {
            await new Promise((resolve) => setTimeout(resolve, 10));
            order.push("start");
          },
          stop: () => {
            order.push("stop");
          },
        }),
      );

      const starting = lifecycle.start();
      await lifecycle.stop();
      await starting;

      expect(order).toEqual(["start", "stop"]);
      expect(lifecycle.getState()).toBe(LifecycleState.STOPPED);
    });

    it("should continue stopping other participants on error when continueOnShutdownError is true", async () => {
      const order: string[] = [];
      const lifecycle = new Lifecycle({
        continueOnShutdownError: true,
      });

      lifecycle.register(
        createParticipant("failing", {
          stop: async () => {
            throw new Error("stop failed");
          },
        }),
      );
      lifecycle.register(
        createParticipant("second", {
          stop: async () => {
            order.push("second");
          },
        }),
      );

      await lifecycle.initialize();
      await lifecycle.start();

      await expect(lifecycle.stop()).rejects.toThrow(
        "One or more lifecycle participants failed to stop",
      );
      expect(order).toEqual(["second"]);
    });

    it("should abort and leave FAILED when continueOnShutdownError is false", async () => {
      const order: string[] = [];
      const lifecycle = new Lifecycle({
        continueOnShutdownError: false,
      });

      // Register so "failing" is processed first in reverse order
      lifecycle.register(
        createParticipant("second", {
          stop: async () => {
            order.push("second");
          },
        }),
      );
      lifecycle.register(
        createParticipant("first", {
          stop: async () => {
            throw new Error("stop failed");
          },
        }),
      );

      await lifecycle.initialize();
      await lifecycle.start();

      await expect(lifecycle.stop()).rejects.toThrow(AggregateError);
      expect(order).toEqual([]);
      expect(lifecycle.getState()).toBe(LifecycleState.FAILED);
    });
  });

  describe("dispose", () => {
    it("should dispose participants in reverse order", async () => {
      const order: string[] = [];
      const lifecycle = new Lifecycle();

      lifecycle.register(
        createParticipant("first", {
          dispose: async () => {
            order.push("first");
          },
        }),
      );
      lifecycle.register(
        createParticipant("second", {
          dispose: async () => {
            order.push("second");
          },
        }),
      );

      await lifecycle.dispose();

      expect(order).toEqual(["second", "first"]);
    });

    it("should collect and throw AggregateError on multiple failures", async () => {
      const lifecycle = new Lifecycle();

      lifecycle.register(
        createParticipant("first", {
          dispose: async () => {
            throw new Error("first error");
          },
        }),
      );
      lifecycle.register(
        createParticipant("second", {
          dispose: async () => {
            throw new Error("second error");
          },
        }),
      );

      await expect(lifecycle.dispose()).rejects.toThrow(AggregateError);
    });
  });

  describe("shutdown", () => {
    it("should perform stop then dispose", async () => {
      const order: string[] = [];
      const lifecycle = new Lifecycle();

      lifecycle.register(
        createParticipant("test", {
          stop: async () => {
            order.push("stop");
          },
          dispose: async () => {
            order.push("dispose");
          },
        }),
      );

      await lifecycle.initialize();
      await lifecycle.start();
      await lifecycle.shutdown();

      expect(order).toEqual(["stop", "dispose"]);
    });
  });

  describe("dispose", () => {
    it("should finish initialization when restarting after a failed initialize", async () => {
      const initialized: string[] = [];
      let fail = true;
      const lifecycle = new Lifecycle();

      lifecycle.register(
        createParticipant("first", {
          initialize: () => {
            initialized.push("first");
          },
        }),
      );
      lifecycle.register(
        createParticipant("flaky", {
          initialize: () => {
            if (fail) throw new Error("flaky init");
            initialized.push("flaky");
          },
        }),
      );

      await expect(lifecycle.start()).rejects.toThrow("flaky init");
      await lifecycle.stop();
      expect(lifecycle.getState()).toBe(LifecycleState.STOPPED);

      fail = false;
      await lifecycle.start();

      expect(lifecycle.getState()).toBe(LifecycleState.RUNNING);
      expect(initialized).toEqual(["first", "flaky"]);
    });

    it("should be idempotent", async () => {
      const disposeFn = vi.fn();
      const lifecycle = new Lifecycle();

      lifecycle.register(createParticipant("test", { dispose: disposeFn }));
      await lifecycle.dispose();
      await lifecycle.dispose();

      expect(disposeFn).toHaveBeenCalledOnce();
      expect(lifecycle.isDisposed()).toBe(true);
    });
  });

  describe("options", () => {
    it("should log through the supplied logger", async () => {
      const logger = {
        trace: vi.fn(),
        debug: vi.fn(),
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
        fatal: vi.fn(),
        child: vi.fn(),
      };

      const lifecycle = new Lifecycle({ logger: logger as never });
      lifecycle.register(createParticipant("test"));
      await lifecycle.start();

      expect(logger.debug).toHaveBeenCalledWith(
        "Lifecycle participant registered",
        { participant: "test" },
      );
      expect(logger.info).toHaveBeenCalledWith("Application startup completed");
    });

    it("should keep going after a failed stop when continueOnShutdownError is true", async () => {
      const stopFn = vi.fn();
      const lifecycle = new Lifecycle({ continueOnShutdownError: true });

      lifecycle.register(createParticipant("ok", { stop: stopFn }));
      lifecycle.register(
        createParticipant("bad", {
          stop: () => {
            throw new Error("bad stop");
          },
        }),
      );

      await lifecycle.start();
      await expect(lifecycle.stop()).rejects.toThrow(AggregateError);

      expect(stopFn).toHaveBeenCalledOnce();
      expect(lifecycle.getState()).toBe(LifecycleState.STOPPED);
    });
  });
});
