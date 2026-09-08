import type { Module, ModuleId } from "../module.js";
import type { ModuleContext } from "../moduleContext.context.js";
import type {
  ModuleLifecycleHookName,
  ModuleLifecycleStep,
  ModuleLifecyclePhase,
  ModuleLifecycleState,
  ModuleLifecycleSkip,
  LifecycleStateMap,
} from "./moduleLifecycle.type.js";
import { ModuleLifecycleError } from "./moduleLifecycle.type.js";
import type { ModuleRegistry } from "../moduleRegistry/index.js";
import type { ModuleLoader } from "../moduleLoader/index.js";
import { ModuleNotFoundError } from "../moduleError/moduleError.registration.js";
import type { ContextStorage } from "../../context/provider/contextStorage.storage.js";

/**
 * Ensures lifecycle state is synchronized with the registry.
 *
 * Registered modules gain a "created" state; states belonging to
 * modules that are no longer registered are pruned.
 */
export function ensureStateSynchronized(
  registry: ModuleRegistry,
  states: LifecycleStateMap,
): void {
  const registered = new Set<ModuleId>();

  for (const registration of registry.getAll()) {
    const moduleId = registration.definition.id;
    registered.add(moduleId);
    if (!states.has(moduleId))
      states.set(moduleId, { moduleId, phase: "created" });
  }

  for (const moduleId of [...states.keys()]) {
    if (!registered.has(moduleId)) states.delete(moduleId);
  }
}

export function getLifecycleState(
  moduleId: ModuleId,
  states: LifecycleStateMap,
): ModuleLifecycleState | undefined {
  return states.get(moduleId);
}

export function requireLifecycleState(
  moduleId: ModuleId,
  states: LifecycleStateMap,
): ModuleLifecycleState {
  const state = getLifecycleState(moduleId, states);
  if (!state) throw new ModuleNotFoundError(moduleId);
  return state;
}

export function getAllLifecycleStates(
  states: LifecycleStateMap,
): ReadonlyMap<ModuleId, ModuleLifecycleState> {
  return new Map(states);
}

export function isModuleInitialized(
  moduleId: ModuleId,
  states: LifecycleStateMap,
): boolean {
  const phase = getLifecycleState(moduleId, states)?.phase;
  return phase === "initialized" || phase === "starting" || phase === "started";
}

export function isModuleStarted(
  moduleId: ModuleId,
  states: LifecycleStateMap,
): boolean {
  return getLifecycleState(moduleId, states)?.phase === "started";
}
export function isModuleDestroyed(
  moduleId: ModuleId,
  states: LifecycleStateMap,
): boolean {
  return getLifecycleState(moduleId, states)?.phase === "destroyed";
}

/**
 * Maps each lifecycle step to the hook of the public Module
 * contract (ModuleLifecycle) that the engine invokes for it.
 */
const STEP_HOOKS: Record<ModuleLifecycleStep, ModuleLifecycleHookName> = {
  initialize: "onInitialize",
  start: "onReady",
  stop: "onShutdown",
  destroy: "onDestroy",
};

/**
 * Invokes the lifecycle hook for a step on a module.
 *
 * Only the canonical Module contract hooks are invoked:
 *
 * initialize → onInitialize
 * start      → onReady
 * stop       → onShutdown
 * destroy    → onDestroy
 *
 * Modules that do not implement a hook are skipped for that step.
 *
 * When `contextStorage` holds an active execution context (the
 * runtime's, during bootstrap and shutdown), the hook runs inside a
 * context derived from it: `module` is the module id, `operation`
 * is the hook name, and `{ moduleId, phase }` is merged into the
 * metadata. Everything the hook awaits observes that context.
 */
export async function invokeLifecycleHook(
  module: Module,
  step: ModuleLifecycleStep,
  context: ModuleContext,
  contextStorage?: ContextStorage,
  phase: ModuleLifecyclePhase = STEP_PHASES[step],
): Promise<void> {
  const hookName = STEP_HOOKS[step];
  const handler = module[hookName];

  if (typeof handler !== "function") return;

  const invoke = (): void | Promise<void> => handler.call(module, context);

  if (contextStorage?.has()) {
    await contextStorage.runDerived(
      {
        module: module.id,
        operation: hookName,
        metadata: { moduleId: module.id, phase },
      },
      invoke,
    );
    return;
  }

  await invoke();
}

/**
 * Active phase a module is in while each step's hook runs.
 */
const STEP_PHASES: Record<ModuleLifecycleStep, ModuleLifecyclePhase> = {
  initialize: "initializing",
  start: "starting",
  stop: "stopping",
  destroy: "destroying",
};

export function canModuleEnterPhase(
  moduleId: ModuleId,
  hook: ModuleLifecycleStep,
  states: LifecycleStateMap,
): boolean {
  const state = getLifecycleState(moduleId, states);
  if (!state) return false;
  switch (hook) {
    case "initialize":
      return state.phase === "created";
    case "start":
      return state.phase === "initialized";
    case "stop":
      return state.phase === "started";
    case "destroy":
      return (
        state.phase === "stopped" ||
        state.phase === "initialized" ||
        state.phase === "created" ||
        state.phase === "started" ||
        state.phase === "failed"
      );
    default:
      return false;
  }
}

export function setLifecycleState(
  moduleId: ModuleId,
  phase: ModuleLifecyclePhase,
  states: LifecycleStateMap,
  error?: unknown,
): void {
  const previous = states.get(moduleId);
  const now = new Date();
  states.set(
    moduleId,
    Object.freeze({
      moduleId,
      phase,
      error,
      initializedAt: phase === "initialized" ? now : previous?.initializedAt,
      startedAt: phase === "started" ? now : previous?.startedAt,
      stoppedAt: phase === "stopped" ? now : previous?.stoppedAt,
      destroyedAt: phase === "destroyed" ? now : previous?.destroyedAt,
    }),
  );
}

/**
 * Phases that count as "already satisfied" for a hook: modules
 * in these phases are silently skipped rather than reported.
 */
const SATISFIED_PHASES: Record<
  ModuleLifecycleStep,
  readonly ModuleLifecyclePhase[]
> = {
  initialize: ["initialized", "starting", "started"],
  start: ["started"],
  stop: ["created", "initialized", "stopped", "destroying", "destroyed"],
  destroy: ["destroyed"],
};

/**
 * Phases a required dependency must be in before a dependent
 * module may enter a forward phase.
 */
const REQUIRED_DEPENDENCY_PHASES: Partial<
  Record<ModuleLifecycleStep, readonly ModuleLifecyclePhase[]>
> = {
  initialize: ["initialized", "starting", "started"],
  start: ["started"],
};

export async function executeLifecyclePhase(
  order: readonly ModuleId[],
  hook: ModuleLifecycleStep,
  activePhase: ModuleLifecyclePhase,
  completedPhase: ModuleLifecyclePhase,
  continueOnError: boolean,
  registry: ModuleRegistry,
  loader: ModuleLoader,
  states: LifecycleStateMap,
  contextStorage?: ContextStorage,
): Promise<{
  readonly completed: readonly ModuleId[];
  readonly failed: readonly ModuleId[];
  readonly skipped: readonly ModuleLifecycleSkip[];
}> {
  const completed: ModuleId[] = [];
  const failed: ModuleId[] = [];
  const skipped: ModuleLifecycleSkip[] = [];
  const blocked = new Set<ModuleId>();
  const requiredDependencyPhases = REQUIRED_DEPENDENCY_PHASES[hook];

  for (const moduleId of order) {
    const registration = registry.get(moduleId);
    if (!registration?.instance) continue;
    const module = registration.instance;
    const context = loader.getContext(moduleId);

    if (!context) {
      failed.push(moduleId);
      setLifecycleState(moduleId, "failed", states);
      if (!continueOnError)
        throw new ModuleLifecycleError(
          moduleId,
          activePhase,
          new Error(`Module "${moduleId}" does not have a ModuleContext.`),
        );
      continue;
    }

    const currentPhase = getLifecycleState(moduleId, states)?.phase;

    if (!canModuleEnterPhase(moduleId, hook, states)) {
      if (
        currentPhase !== undefined &&
        SATISFIED_PHASES[hook].includes(currentPhase)
      ) {
        continue;
      }

      skipped.push({
        moduleId,
        reason: `Module is in phase "${currentPhase ?? "unknown"}" and cannot enter ${hook}.`,
      });
      blocked.add(moduleId);
      continue;
    }

    /*
     * Forward phases only run when every required dependency
     * reached the requisite state. Modules whose dependencies
     * failed (or were skipped) are skipped with a reason instead
     * of being initialized against a broken dependency.
     */
    if (requiredDependencyPhases) {
      const blockingDependency = registry
        .getDependencies(moduleId)
        .find((dependency) => {
          if (dependency.optional) return false;
          if (blocked.has(dependency.id) || failed.includes(dependency.id))
            return true;
          const dependencyPhase = getLifecycleState(
            dependency.id,
            states,
          )?.phase;
          return (
            dependencyPhase === undefined ||
            !requiredDependencyPhases.includes(dependencyPhase)
          );
        });

      if (blockingDependency) {
        skipped.push({
          moduleId,
          reason: `Dependency "${blockingDependency.id}" is not ready for ${hook}.`,
        });
        blocked.add(moduleId);
        continue;
      }
    }

    setLifecycleState(moduleId, activePhase, states);
    try {
      await invokeLifecycleHook(
        module,
        hook,
        context,
        contextStorage,
        activePhase,
      );
      setLifecycleState(moduleId, completedPhase, states);
      completed.push(moduleId);
    } catch (error) {
      setLifecycleState(moduleId, "failed", states, error);
      failed.push(moduleId);
      if (!continueOnError)
        throw new ModuleLifecycleError(moduleId, activePhase, error);
    }
  }

  return {
    completed: Object.freeze([...completed]),
    failed: Object.freeze([...failed]),
    skipped: Object.freeze([...skipped]),
  };
}
