/**
 * @zudojs/security — batch 5: cookie Domain and Path are validated by
 * grammar, not by a short deny-list.
 */

import { describe, it, expect } from "vitest";
import { ValidationError } from "@zudojs/errors";

import { createSecureCookie, serializeCookie } from "../src/index.js";

describe("cookie Domain is a hostname", () => {
  it("refuses a literal backslash-escaped CRLF, spaces and colons", () => {
    const hostile = "a\\r\\nX-Evil: 1";
    expect(() => serializeCookie({ name: "sid", value: "v", domain: hostile })).toThrow(
      ValidationError,
    );
    expect(() => serializeCookie({ name: "sid", value: "v", domain: hostile })).toThrow(
      /Cookie Domain .*hostname/,
    );
    for (const domain of [
      "a b.com",
      "a:1.com",
      "example.com\r\nX: 1",
      "exa_mple.com",
      "example..com",
      "example.com.",
      "..example.com",
      "a/b",
      "[::1]",
      `${"a".repeat(64)}.com`,
      `${"a.".repeat(127)}com`,
    ]) {
      expect(() => serializeCookie({ name: "sid", value: "v", domain }), domain).toThrow(
        ValidationError,
      );
    }
  });

  it("accepts hostnames, with or without a leading dot", () => {
    for (const domain of ["example.com", ".example.com", "localhost", "sub-1.Example.co.uk", "127.0.0.1"]) {
      expect(serializeCookie({ name: "sid", value: "v", domain })).toContain(`Domain=${domain}`);
    }
    expect(createSecureCookie("sid", "v", { domain: ".example.com" })).toContain(
      "Domain=.example.com",
    );
  });
});

describe("cookie Path has no control characters or separators", () => {
  it("refuses control characters, DEL and ;", () => {
    for (const path of ["/a;b", "/a\r\nX: 1", "/a\tb", "/a\x7Fb", "/a\x00b", "/a,b"]) {
      expect(() => serializeCookie({ name: "sid", value: "v", path }), JSON.stringify(path)).toThrow(
        /Cookie Path/,
      );
    }
  });

  it("accepts ordinary paths", () => {
    for (const path of ["/", "/app", "/a b/c-d_e.f~g", "/%20x"]) {
      expect(serializeCookie({ name: "sid", value: "v", path })).toContain(`Path=${path}`);
    }
  });
});
