/**
 * @zudojs/validation — Bounded object-graph traversal.
 *
 * The depth, size and circular-reference guards all walk the same graph and
 * all previously got the same three details wrong.
 *
 * The visited set must track the current *path*, not everything ever seen:
 * marking on descent and unmarking on ascent detects a genuine cycle while
 * still counting a shared subtree once per occurrence, the way a serializer
 * would expand it.
 *
 * The walk must be bounded, and abort the moment a bound is passed. A guard
 * that measures the whole input before comparing it to a limit is not a
 * guard — it does the expensive work regardless.
 *
 * And the walk must be iterative. A recursive walker overflows the stack on
 * exactly the deeply nested input the depth guard exists to reject, so the
 * check would fail inside itself before it could report anything.
 */

import { TraversalLimitError } from "@zudojs/errors";

import { childrenOf, isContainer } from "./validationConstraints.children.js";

/**
 * The halt signal is owned by `@zudojs/errors` (round 10 VAL-05/CV-02) and
 * re-exported here, so the depth, size and circular guards keep importing
 * it from this module.
 */
export { TraversalLimitError, type TraversalHalt } from "@zudojs/errors";

/** What the caller wants from each node. */
export interface TraversalVisitor {
  /** Maximum nesting depth to descend before halting. */
  readonly maxDepth: number;
  /** Cumulative budget; halts once `charge` totals more than this. */
  readonly maxCost?: number;
  /** Whether a cycle should halt the walk rather than be skipped. */
  readonly failOnCycle?: boolean;
  /** Cost contributed by a single node, excluding its children. */
  charge?(value: unknown): number;
  /**
   * Maps a node to the value actually walked in its place, e.g. the result
   * of `toJSON()` when measuring what `JSON.stringify` will write.
   */
  resolve?(value: unknown): unknown;
}

/** What a completed traversal observed. */
export interface TraversalReport {
  /** Deepest nesting level reached. */
  readonly depth: number;
  /** Total cost accumulated across every visited node. */
  readonly cost: number;
}

/** A node queued for visiting, or a marker to leave a container. */
interface Frame {
  readonly value: unknown;
  readonly depth: number;
  readonly path: string;
  /** When set, this frame closes the container instead of visiting a value. */
  readonly leave?: object;
}

/**
 * Walk a value graph within explicit depth and cost bounds.
 *
 * @param root - The value to walk.
 * @param visitor - Bounds and per-node cost.
 * @param rootPath - Label for the root node in error paths.
 * @returns What the traversal observed, when it completed within bounds.
 * @throws {TraversalLimitError} as soon as a bound is exceeded.
 */
export function traverse(
  root: unknown,
  visitor: TraversalVisitor,
  rootPath = "root",
): TraversalReport {
  const maxCost = visitor.maxCost ?? Number.POSITIVE_INFINITY;
  const onPath = new Set<object>();
  // Without a per-node charge, a subtree already walked from some depth need
  // not be walked again from the same depth or a shallower one: it holds no
  // cycle (the walk would have halted) and cannot reach deeper than before.
  // Re-walking it made a DAG of n shared `[node, node]` pairs cost 2^n.
  // Only cost accounting must expand every occurrence, as a serializer does.
  const walkedAt = visitor.charge ? undefined : new Map<object, number>();
  const stack: Frame[] = [{ value: root, depth: 0, path: rootPath }];

  let cost = 0;
  let deepest = 0;

  while (stack.length > 0) {
    const frame = stack.pop()!;

    if (frame.leave) {
      onPath.delete(frame.leave);
      continue;
    }

    const { depth, path } = frame;
    const value = visitor.resolve ? visitor.resolve(frame.value) : frame.value;

    cost += visitor.charge?.(value) ?? 0;
    if (cost > maxCost) throw new TraversalLimitError("budget", path, cost);

    if (depth > deepest) deepest = depth;
    if (!isContainer(value)) continue;

    // A container occupies the level below the one it sits at, so an empty
    // `{}` at depth d reaches d + 1 — the same level at which the depth
    // guard below refuses to descend into it. Reporting only leaf depths
    // made `getSerializationDepth({})` 0 while `assertDepthWithinLimit({},
    // 0)` threw.
    if (depth + 1 > deepest) deepest = depth + 1;

    if (onPath.has(value)) {
      if (visitor.failOnCycle) {
        throw new TraversalLimitError("cycle", path, depth);
      }
      continue;
    }

    const previous = walkedAt?.get(value);
    if (previous !== undefined && depth <= previous) continue;

    if (depth >= visitor.maxDepth) {
      throw new TraversalLimitError("depth", path, depth + 1);
    }

    walkedAt?.set(value, depth);
    onPath.add(value);
    stack.push({ value: undefined, depth, path, leave: value });

    const children = childrenOf(value);
    for (let index = children.length - 1; index >= 0; index--) {
      const [segment, child] = children[index]!;
      stack.push({
        value: child,
        depth: depth + 1,
        path: `${path}${segment}`,
      });
    }
  }

  return { depth: deepest, cost };
}
