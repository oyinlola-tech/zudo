/**
 * @zudojs/validation — Child enumeration for the structural guards.
 */

/** Whether a value has children worth descending into. */
export function isContainer(value: unknown): value is object {
  return (
    typeof value === "object" && value !== null && !ArrayBuffer.isView(value)
  );
}

/**
 * The child values of a container, as [pathSegment, value] pairs.
 *
 * Arrays are read by index. `Array.prototype.map` skips holes and returns a
 * sparse result, so `[1, , 3]` used to yield an `undefined` pair that crashed
 * every guard with a raw TypeError; a hole is now an `undefined` child, which
 * is also how `JSON.stringify` writes it (as `null`).
 */
export function childrenOf(value: object): Array<[string, unknown]> {
  if (Array.isArray(value)) {
    const children: Array<[string, unknown]> = [];
    for (let index = 0; index < value.length; index++) {
      children.push([`[${index}]`, value[index] as unknown]);
    }
    return children;
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
