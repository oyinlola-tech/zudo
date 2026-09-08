/**
 * IP address and CIDR primitives for trust-proxy evaluation.
 *
 * `trustProxy` decides whether a socket peer may dictate the client's identity
 * via `X-Forwarded-*`. That decision has to be made by comparing real
 * addresses, so this module parses IPv4, IPv6 and IPv4-mapped IPv6 into bytes
 * and performs prefix matching. String equality is not sufficient: `10.0.0.1`,
 * `::ffff:10.0.0.1` and `[::ffff:10.0.0.1]%eth0` are the same peer.
 *
 * @module httpTrustProxy/ip
 */

export type IpFamily = 4 | 6;

export interface ParsedIp {
  readonly family: IpFamily;
  readonly bytes: Uint8Array;
}

export interface ParsedCidr {
  readonly family: IpFamily;
  readonly bytes: Uint8Array;
  readonly prefix: number;
}

/**
 * Strips the decorations Node and proxies add to an address literal:
 * surrounding brackets, an IPv6 zone identifier, and surrounding whitespace.
 */
export function normalizeIpAddress(value: string): string {
  let result = value.trim();

  if (result.startsWith("[")) {
    const end = result.indexOf("]");

    if (end !== -1) {
      result = result.slice(1, end);
    }
  }

  const zone = result.indexOf("%");

  if (zone !== -1) {
    result = result.slice(0, zone);
  }

  return result.toLowerCase();
}

function parseIPv4Bytes(value: string): Uint8Array | undefined {
  const parts = value.split(".");

  if (parts.length !== 4) {
    return undefined;
  }

  const bytes = new Uint8Array(4);

  let index = 0;

  for (const part of parts) {
    if (!/^\d{1,3}$/.test(part)) {
      return undefined;
    }

    const octet = Number(part);

    if (octet > 255) {
      return undefined;
    }

    bytes[index] = octet;
    index += 1;
  }

  return bytes;
}

function expandIPv6Groups(groups: readonly string[], out: number[]): boolean {
  const last = groups.length - 1;

  let index = 0;

  for (const group of groups) {
    if (index === last && group.includes(".")) {
      const embedded = parseIPv4Bytes(group);

      if (!embedded) {
        return false;
      }

      out.push(
        embedded[0] ?? 0,
        embedded[1] ?? 0,
        embedded[2] ?? 0,
        embedded[3] ?? 0,
      );

      index += 1;
      continue;
    }

    if (!/^[0-9a-f]{1,4}$/.test(group)) {
      return false;
    }

    const word = Number.parseInt(group, 16);

    out.push((word >> 8) & 0xff, word & 0xff);

    index += 1;
  }

  return true;
}

function parseIPv6Bytes(value: string): Uint8Array | undefined {
  if (!value.includes(":")) {
    return undefined;
  }

  const compression = value.indexOf("::");

  if (compression !== value.lastIndexOf("::")) {
    return undefined;
  }

  const headText = compression === -1 ? value : value.slice(0, compression);

  const tailText = compression === -1 ? "" : value.slice(compression + 2);

  const head: number[] = [];

  const tail: number[] = [];

  if (
    !expandIPv6Groups(headText.length > 0 ? headText.split(":") : [], head) ||
    !expandIPv6Groups(tailText.length > 0 ? tailText.split(":") : [], tail)
  ) {
    return undefined;
  }

  const bytes = new Uint8Array(16);

  if (compression === -1) {
    if (head.length !== 16) {
      return undefined;
    }

    bytes.set(head);

    return bytes;
  }

  /* `::` stands for at least one all-zero group. */
  if (head.length + tail.length > 14) {
    return undefined;
  }

  bytes.set(head, 0);
  bytes.set(tail, 16 - tail.length);

  return bytes;
}

function unmapIPv4(bytes: Uint8Array): Uint8Array | undefined {
  for (let index = 0; index < 10; index += 1) {
    if (bytes[index] !== 0) {
      return undefined;
    }
  }

  if (bytes[10] !== 0xff || bytes[11] !== 0xff) {
    return undefined;
  }

  return bytes.slice(12);
}

/**
 * Parses an address literal. IPv4-mapped IPv6 addresses collapse to IPv4 so
 * that `::ffff:127.0.0.1` matches a `127.0.0.0/8` rule.
 */
export function parseIpAddress(value: string): ParsedIp | undefined {
  const normalized = normalizeIpAddress(value);

  if (normalized.length === 0) {
    return undefined;
  }

  const v4 = parseIPv4Bytes(normalized);

  if (v4) {
    return { family: 4, bytes: v4 };
  }

  const v6 = parseIPv6Bytes(normalized);

  if (!v6) {
    return undefined;
  }

  const mapped = unmapIPv4(v6);

  if (mapped) {
    return { family: 4, bytes: mapped };
  }

  return { family: 6, bytes: v6 };
}

export function isIpAddress(value: string): boolean {
  return parseIpAddress(value) !== undefined;
}

/**
 * Parses `address/prefix`. Returns `undefined` when the value is not CIDR
 * notation or the prefix is out of range for the address family.
 */
export function parseCidr(value: string): ParsedCidr | undefined {
  const slash = value.lastIndexOf("/");

  if (slash === -1) {
    return undefined;
  }

  const address = parseIpAddress(value.slice(0, slash));

  const prefixText = value.slice(slash + 1).trim();

  if (!address || !/^\d{1,3}$/.test(prefixText)) {
    return undefined;
  }

  const prefix = Number(prefixText);

  if (prefix > (address.family === 4 ? 32 : 128)) {
    return undefined;
  }

  return { family: address.family, bytes: address.bytes, prefix };
}

export function ipMatchesCidr(address: ParsedIp, cidr: ParsedCidr): boolean {
  if (address.family !== cidr.family) {
    return false;
  }

  let remaining = cidr.prefix;

  let index = 0;

  while (remaining >= 8) {
    if (address.bytes[index] !== cidr.bytes[index]) {
      return false;
    }

    remaining -= 8;
    index += 1;
  }

  if (remaining === 0) {
    return true;
  }

  const mask = (0xff << (8 - remaining)) & 0xff;

  return (
    ((address.bytes[index] ?? 0) & mask) === ((cidr.bytes[index] ?? 0) & mask)
  );
}

export function ipEquals(left: ParsedIp, right: ParsedIp): boolean {
  if (
    left.family !== right.family ||
    left.bytes.length !== right.bytes.length
  ) {
    return false;
  }

  for (let index = 0; index < left.bytes.length; index += 1) {
    if (left.bytes[index] !== right.bytes[index]) {
      return false;
    }
  }

  return true;
}

function compileRanges(ranges: readonly string[]): ParsedCidr[] {
  const result: ParsedCidr[] = [];

  for (const range of ranges) {
    const parsed = parseCidr(range);

    if (parsed) {
      result.push(parsed);
    }
  }

  return result;
}

export const LOOPBACK_RANGES: readonly string[] = Object.freeze([
  "127.0.0.0/8",
  "::1/128",
]);

export const LINK_LOCAL_RANGES: readonly string[] = Object.freeze([
  "169.254.0.0/16",
  "fe80::/10",
]);

export const UNIQUE_LOCAL_RANGES: readonly string[] = Object.freeze([
  "10.0.0.0/8",
  "172.16.0.0/12",
  "192.168.0.0/16",
  "fc00::/7",
]);

const LOOPBACK_CIDRS = compileRanges(LOOPBACK_RANGES);

const LINK_LOCAL_CIDRS = compileRanges(LINK_LOCAL_RANGES);

const UNIQUE_LOCAL_CIDRS = compileRanges(UNIQUE_LOCAL_RANGES);

function matchesAny(value: string, cidrs: readonly ParsedCidr[]): boolean {
  const address = parseIpAddress(value);

  if (!address) {
    return false;
  }

  return cidrs.some((cidr) => ipMatchesCidr(address, cidr));
}

/** `127.0.0.0/8` and `::1/128` — exact, not `startsWith("::1")`. */
export function isLoopbackAddress(value: string): boolean {
  return matchesAny(value, LOOPBACK_CIDRS);
}

/** `169.254.0.0/16` and `fe80::/10` — the actual link-local ranges. */
export function isLinkLocalAddress(value: string): boolean {
  return matchesAny(value, LINK_LOCAL_CIDRS);
}

/** RFC 1918 plus `fc00::/7`. */
export function isUniqueLocalAddress(value: string): boolean {
  return matchesAny(value, UNIQUE_LOCAL_CIDRS);
}
