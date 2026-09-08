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

/** Why a traversal stopped early. */
export type TraversalHalt = "depth" | "budget" | "cycle";

/** Signals that a traversal hit one of its bounds. */
export class TraversalLimitError extends Error {
  constructor(
    readonly halt: TraversalHalt,
    readonly path: string,
    readonly observed: number,
  ) {
    super(`Traversal halted (${halt}) at ${path}`);
    this.name = "TraversalLimitError";
  }
}

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

/** Whether a value has children worth descending into. */
function isContainer(value: unknown): value is object {
  return (
    typeof value === "object" && value !== null && !ArrayBuffer.isView(value)
  );
}

/** The child values of a container, as [pathSegment, value] pairs. */
function childrenOf(value: object): Array<[string, unknown]> {
  if (Array.isArray(value)) {
    return value.map((child, index) => [`[${index}]`, child]);
  }

  if (value instanceof Map) {
    const children: Array<[string, unknown]> = [];
    let index = 0;
    for (const [key, entry] of value) {
      children.push([`.key(${index})`, key], [`[${String(key)}]`, entry]);
      index++;
    }
    return children;
  }

  if (value instanceof Set) {
    return [...value].map((entry, index) => [`.item(${index})`, entry]);
  }

  if (value instanceof Date || value instanceof RegExp) return [];

  const record = value as Record<string, unknown>;
  return Object.keys(record).map((key) => [`.${key}`, record[key]]);
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
  const stack: Frame[] = [{ value: root, depth: 0, path: rootPath }];

  let cost = 0;
  let deepest = 0;

  while (stack.length > 0) {
    const frame = stack.pop()!;

    if (frame.leave) {
      onPath.delete(frame.leave);
      continue;
    }

    const { value, depth, path } = frame;

    cost += visitor.charge?.(value) ?? 0;
    if (cost > maxCost) throw new TraversalLimitError("budget", path, cost);

    if (depth > deepest) deepest = depth;
    if (!isContainer(value)) continue;

    if (onPath.has(value)) {
      if (visitor.failOnCycle) {
        throw new TraversalLimitError("cycle", path, depth);
      }
      continue;
    }

    if (depth >= visitor.maxDepth) {
      throw new TraversalLimitError("depth", path, depth + 1);
    }

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
