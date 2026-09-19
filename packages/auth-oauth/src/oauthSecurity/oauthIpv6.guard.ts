/**
 * IPv6 literal parsing and embedded-IPv4 extraction for the SSRF guard.
 *
 * @module oauthSecurity/oauthIpv6.guard
 *
 * Mirrors `@zudojs/security`'s `url.ipv6.ts`; this package has no
 * dependency on it yet.
 */

import { isIPv6 } from "node:net";

/**
 * Expands an IPv6 address into its eight 16-bit groups.
 *
 * Accepts the compressed (`::`), dotted-tail (`::ffff:1.2.3.4`) and zoned
 * (`fe80::1%eth0`) forms.
 *
 * @returns The groups, or `undefined` for a non-IPv6 input.
 */
export function expandIpv6(address: string): number[] | undefined {
  let text = address.toLowerCase();
  const zone = text.indexOf("%");
  if (zone !== -1) text = text.slice(0, zone);
  if (!isIPv6(text)) return undefined;
  const lastColon = text.lastIndexOf(":");
  const tail = text.slice(lastColon + 1);
  if (tail.includes(".")) {
    const o = tail.split(".").map(Number) as [number, number, number, number];
    const hi = ((o[0] << 8) | o[1]).toString(16);
    const lo = ((o[2] << 8) | o[3]).toString(16);
    text = `${text.slice(0, lastColon + 1)}${hi}:${lo}`;
  }
  const [head = "", rest] = text.split("::");
  const left = head === "" ? [] : head.split(":");
  const right = rest === undefined || rest === "" ? [] : rest.split(":");
  const fill =
    rest === undefined
      ? []
      : new Array<string>(8 - left.length - right.length).fill("0");
  return [...left, ...fill, ...right].map((group) => parseInt(group, 16));
}

function octetsOf(high: number, low: number): number[] {
  return [high >> 8, high & 0xff, low >> 8, low & 0xff];
}

/**
 * The IPv4 address an IPv6 address stands for, when it is one of the
 * embedding forms, so that it can be judged as that IPv4 address.
 *
 * - `::a.b.c.d` (IPv4-compatible, `::/96`, which also covers `::` and `::1`)
 * - `::ffff:a.b.c.d` (IPv4-mapped, `::ffff:0:0/96`)
 * - `::ffff:0:a.b.c.d` (IPv4-translated, `::ffff:0:0:0/96`)
 * - `64:ff9b::a.b.c.d` (NAT64 well-known prefix, `64:ff9b::/96`)
 * - `2002:aabb:ccdd::` (6to4, `2002::/16`)
 *
 * WHATWG URL parsing rewrites `[::127.0.0.1]` to `[::7f00:1]`, so matching
 * on the dotted spelling (as the old regexes did) missed every one of these.
 *
 * @returns The four octets, or `undefined` when nothing is embedded.
 */
export function embeddedIpv4(groups: readonly number[]): number[] | undefined {
  const [g0, g1, g2, g3, g4, g5, g6 = 0, g7 = 0] = groups;
  const zeroTo = (end: number): boolean =>
    groups.slice(0, end).every((group) => group === 0);
  if (zeroTo(6)) return octetsOf(g6, g7);
  if (zeroTo(5) && g5 === 0xffff) return octetsOf(g6, g7);
  if (zeroTo(4) && g4 === 0xffff && g5 === 0) return octetsOf(g6, g7);
  if (g0 === 0x64 && g1 === 0xff9b && g2 === 0 && g3 === 0 && g4 === 0 && g5 === 0) {
    return octetsOf(g6, g7);
  }
  if (g0 === 0x2002) return octetsOf(g1 ?? 0, g2 ?? 0);
  return undefined;
}

/**
 * True for IPv6 ranges that are never a public unicast destination:
 * unique-local `fc00::/7`, link-local `fe80::/10`, deprecated site-local
 * `fec0::/10`, multicast `ff00::/8`, and the local-use NAT64 prefix
 * `64:ff9b:1::/48`, whose embedded address depends on local configuration.
 */
export function isNonPublicIpv6Range(groups: readonly number[]): boolean {
  const g0 = groups[0] ?? 0;
  if ((g0 & 0xfe00) === 0xfc00) return true;
  if ((g0 & 0xffc0) === 0xfe80) return true;
  if ((g0 & 0xffc0) === 0xfec0) return true;
  if ((g0 & 0xff00) === 0xff00) return true;
  return g0 === 0x64 && groups[1] === 0xff9b && groups[2] === 1;
}
