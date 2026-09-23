/**
 * zudojs-cli — Marker comments in generated files.
 *
 * Generated projects keep every list the CLI appends to (route
 * registrations, container entries, integrations, config sections) between
 * a pair of comments such as `// zudojs:routes:start` and
 * `// zudojs:routes:end`. `generate` and `add` only ever insert between
 * those markers; a file without them is left untouched and the caller is
 * told what to add by hand.
 */

/** Every marker pair the CLI writes into generated projects. */
export const MARKERS = Object.freeze({
  routeImports: "route-imports",
  routes: "routes",
  containerImports: "container-imports",
  container: "container",
  integrationImports: "integration-imports",
  integrations: "integrations",
  config: "config",
  serverImports: "server-imports",
  serverMounts: "server-mounts",
  serverMiddleware: "server-middleware",
} as const);

/** A marker pair name. */
export type MarkerName = (typeof MARKERS)[keyof typeof MARKERS];

/** The opening comment of a marker pair. */
export function markerStart(name: MarkerName): string {
  return `// zudojs:${name}:start`;
}

/** The closing comment of a marker pair. */
export function markerEnd(name: MarkerName): string {
  return `// zudojs:${name}:end`;
}

/**
 * Renders a marker block: the start comment, `lines`, the end comment, each
 * indented by `indent`.
 */
export function renderMarkerBlock(
  name: MarkerName,
  lines: readonly string[],
  indent = "",
): string {
  return [markerStart(name), ...lines, markerEnd(name)]
    .map((line) => `${indent}${line}`)
    .join("\n");
}

/** Outcome of {@link insertBetweenMarkers}. */
export type MarkerInsertStatus = "inserted" | "present" | "missing-markers";

/** Result of {@link insertBetweenMarkers}. */
export interface MarkerInsertResult {
  readonly status: MarkerInsertStatus;
  /** The updated source; the original when nothing was inserted. */
  readonly source: string;
}

/**
 * Inserts `line` just before the end marker of `name`, indented like the
 * marker. Idempotent: a line already present between the markers (compared
 * trimmed) is not added again. Exactly one start and one end marker, in
 * that order, are required; anything else is reported as missing markers
 * rather than guessed at.
 */
export function insertBetweenMarkers(
  source: string,
  name: MarkerName,
  line: string,
): MarkerInsertResult {
  const start = markerStart(name);
  const end = markerEnd(name);
  const startAt = source.indexOf(start);
  const endAt = source.indexOf(end);

  if (
    startAt === -1 ||
    endAt === -1 ||
    endAt < startAt ||
    source.indexOf(start, startAt + 1) !== -1 ||
    source.indexOf(end, endAt + 1) !== -1
  ) {
    return { status: "missing-markers", source };
  }

  const between = source.slice(startAt + start.length, endAt);
  const wanted = line.trim();
  if (between.split("\n").some((existing) => existing.trim() === wanted)) {
    return { status: "present", source };
  }

  const lineStart = source.lastIndexOf("\n", endAt) + 1;
  const indent = source.slice(lineStart, endAt);
  const safeIndent = /^[ \t]*$/.test(indent) ? indent : "";

  return {
    status: "inserted",
    source:
      source.slice(0, lineStart) +
      `${safeIndent}${wanted}\n` +
      source.slice(lineStart),
  };
}

/** The lines currently between the markers of `name`, trimmed. */
export function linesBetweenMarkers(
  source: string,
  name: MarkerName,
): readonly string[] {
  const start = source.indexOf(markerStart(name));
  const end = source.indexOf(markerEnd(name));
  if (start === -1 || end === -1 || end < start) return [];
  return source
    .slice(start + markerStart(name).length, end)
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}
