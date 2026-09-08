import { describe, expect, it } from "vitest";

import {
  assertSafeHeaderName,
  assertSafeHeaderValue,
  containsForbiddenHeaderChars,
  escapeHeaderQuotedString,
  isValidHeaderFieldValue,
  sanitizeHeaderValue,
} from "../src/httpHeaders/security/httpHeaders.security.js";
import { HTTPHeaders } from "../src/httpHeaders/http.headers.js";
import { normalizeHeaders } from "../src/httpHeaders/http.headers.js";
import { toHTTPHeaders } from "../src/httpHeaders/conversion/httpHeaders.conversion.js";
import { splitHeaderValues } from "../src/httpHeaders/list/httpHeaders.list.js";
import { etagMatches } from "../src/httpHeaders/etag/httpHeaders.etagMatch.js";
import {
  formatContentDisposition,
  createFormDataDisposition,
  getFilename,
  getRawFilename,
  sanitizeFilename,
} from "../src/httpContentDisposition/httpContentDisposition.core.js";
import { withCharset } from "../src/httpContentType/httpContentType.charset.js";
import { formatContentType } from "../src/httpContentType/httpContentType.formatter.js";
import { getParameter } from "../src/httpContentType/httpContentType.parameter.js";
import { isJSON } from "../src/httpContentType/httpContentType.category.js";
import { isMultipartFormData } from "../src/httpContentType/httpContentType.categoryBinary.js";
import {
  formatEntityTag,
  generateETag,
  parseHTTPDate,
  evaluateConditionalRequest,
  parseEntityTagCondition,
} from "../src/httpConditional/httpConditional.core.js";
import {
  parseCookies,
  serializeCookie,
  signCookieValue,
  parseSignedCookie,
} from "../src/httpCookies/http.cookies.js";
import {
  negotiateAccept,
  negotiateEncoding,
  parseQuality,
  formatQuality,
  parseNegotiationHeader,
} from "../src/httpNegotiation/httpNegotiation.core.js";
import { getMIMEType, parseAcceptHeader } from "../src/httpMime/http.mime.js";
import {
  formatAllowHeader,
  resolveMethodOverride,
} from "../src/httpMethods/http.methods.js";
import { hasResponseBody } from "../src/httpStatus/httpStatus.semantics.js";
import { parseCacheControl } from "../src/httpCacheControl/core/httpCacheControl.parse.js";
import { calculateFreshness } from "../src/httpCacheControl/httpCacheControl.freshness.js";
import { isResponseStorable } from "../src/httpCacheControl/httpCacheControl.responseHelper.js";

const INJECTIONS = [
  ["CRLF", "a\r\nSet-Cookie: evil=1"],
  ["bare CR", "a\rSet-Cookie: evil=1"],
  ["bare LF", "a\nSet-Cookie: evil=1"],
  ["NUL", "a\u0000b"],
] as const;

describe("httpHeaders/security", () => {
  for (const [label, malicious] of INJECTIONS) {
    it(`detects ${label} as forbidden`, () => {
      expect(containsForbiddenHeaderChars(malicious)).toBe(true);
      expect(isValidHeaderFieldValue(malicious)).toBe(false);
      expect(() => assertSafeHeaderValue(malicious)).toThrow(TypeError);
      expect(containsForbiddenHeaderChars(sanitizeHeaderValue(malicious))).toBe(
        false,
      );
    });
  }

  it("permits horizontal tab but rejects DEL", () => {
    expect(containsForbiddenHeaderChars("a\tb")).toBe(false);
    expect(containsForbiddenHeaderChars("a\u007fb")).toBe(true);
  });

  it("rejects leading and trailing whitespace in a field value", () => {
    expect(isValidHeaderFieldValue(" 5")).toBe(false);
    expect(() => assertSafeHeaderValue("5 ")).toThrow(TypeError);
  });

  it("rejects a non-token header name", () => {
    expect(() => assertSafeHeaderName("x a")).toThrow(TypeError);
    expect(() => assertSafeHeaderName("")).toThrow(TypeError);
    expect(() => assertSafeHeaderName("x-ok")).not.toThrow();
  });

  it("rejects rather than escapes control characters in a quoted-string", () => {
    expect(() => escapeHeaderQuotedString("a\r\nb")).toThrow(TypeError);
    expect(escapeHeaderQuotedString('a"b\\c')).toBe('a\\"b\\\\c');
  });
});

describe("HTTPHeaders injection resistance", () => {
  for (const [label, malicious] of INJECTIONS) {
    it(`rejects ${label} in a header value`, () => {
      const headers = new HTTPHeaders();

      expect(() => headers.set("x-test", malicious)).toThrow(TypeError);
      expect(() => headers.append("x-test", malicious)).toThrow(TypeError);
      expect(headers.get("x-test")).toBeUndefined();
    });
  }

  it("rejects an obs-folded header value", () => {
    expect(() => new HTTPHeaders().set("x-test", "a\r\n b")).toThrow(TypeError);
  });

  it("rejects a header name containing CRLF", () => {
    expect(() => new HTTPHeaders().set("x\r\ny", "v")).toThrow(TypeError);
  });

  it("never folds Set-Cookie into one comma-joined value", () => {
    const headers = normalizeHeaders({
      "set-cookie": ["a=1; HttpOnly", "b=2; HttpOnly"],
    });

    expect(headers.getSetCookie()).toEqual(["a=1; HttpOnly", "b=2; HttpOnly"]);
    expect(headers.toNodeHeaders()["set-cookie"]).toEqual([
      "a=1; HttpOnly",
      "b=2; HttpOnly",
    ]);
  });

  it("preserves multiple Set-Cookie values across a clone", () => {
    const headers = new HTTPHeaders();

    headers.append("set-cookie", "a=1");
    headers.append("set-cookie", "b=2");

    expect(headers.clone().getSetCookie()).toEqual(["a=1", "b=2"]);
  });

  it("still folds ordinary repeated headers", () => {
    const headers = new HTTPHeaders();

    headers.append("accept", "text/html");
    headers.append("accept", "application/json");

    expect(headers.get("accept")).toBe("text/html, application/json");
  });
});

describe("toHTTPHeaders", () => {
  it("skips a malformed entry instead of throwing on a read path", () => {
    const headers = toHTTPHeaders({
      "x-good": "fine",
      "x-bad": "a\r\nevil: 1",
    });

    expect(headers.get("x-good")).toBe("fine");
    expect(headers.get("x-bad")).toBeUndefined();
  });
});

describe("splitHeaderValues", () => {
  it("honours quoted commas", () => {
    expect(splitHeaderValues('W/"foo,bar", "baz"')).toEqual([
      'W/"foo,bar"',
      '"baz"',
    ]);
  });

  it("caps the element count", () => {
    const header = Array.from({ length: 5000 }, () => "a").join(",");

    expect(splitHeaderValues(header).length).toBeLessThanOrEqual(64);
  });
});

describe("etagMatches", () => {
  it("never matches two weak validators under strong comparison", () => {
    expect(etagMatches('W/"1"', 'W/"1"', false)).toBe(false);
    expect(etagMatches('"1"', '"1"', false)).toBe(true);
  });

  it("accepts the wildcard only from the request side", () => {
    expect(etagMatches("*", '"1"')).toBe(true);
    expect(etagMatches('"1"', "*")).toBe(false);
  });
});

describe("Content-Disposition", () => {
  for (const [label, malicious] of INJECTIONS) {
    it(`rejects ${label} in the name parameter`, () => {
      expect(() =>
        formatContentDisposition({ type: "attachment", name: malicious }),
      ).toThrow(TypeError);

      expect(() => createFormDataDisposition(malicious, undefined)).toThrow(
        TypeError,
      );
    });

    it(`rejects ${label} in an arbitrary parameter`, () => {
      expect(() =>
        formatContentDisposition({
          type: "inline",
          parameters: { creation: malicious },
        }),
      ).toThrow(TypeError);
    });
  }

  it("neutralises the traversal names", () => {
    expect(sanitizeFilename("..")).toBe("_");
    expect(sanitizeFilename(".")).toBe("_");
    expect(sanitizeFilename("C:evil.txt")).toBe("evil.txt");
    expect(sanitizeFilename("../../etc/passwd")).toBe(".._.._etc_passwd");
  });

  it("truncates an over-long filename", () => {
    expect(sanitizeFilename("a".repeat(5000)).length).toBe(255);
  });

  it("sanitises a percent-encoded traversal from filename*", () => {
    const header = "attachment; filename*=UTF-8''..%2F..%2Fetc%2Fpasswd";

    expect(getFilename(header)).toBe(".._.._etc_passwd");
    expect(getRawFilename(header)).toBe("../../etc/passwd");
  });
});

describe("Content-Type", () => {
  for (const [label, malicious] of INJECTIONS) {
    it(`rejects ${label} in a charset`, () => {
      expect(() => withCharset("text/html", malicious)).toThrow(TypeError);
    });
  }

  it("rejects a malformed parameter name on format", () => {
    expect(() =>
      formatContentType({
        type: "text",
        subtype: "html",
        parameters: { "a\r\nevil": "1" },
      }),
    ).toThrow(TypeError);
  });

  it("returns undefined rather than a prototype member for __proto__", () => {
    expect(
      getParameter("text/plain; charset=utf-8", "__proto__"),
    ).toBeUndefined();
    expect(getParameter("text/plain", "constructor")).toBeUndefined();
  });

  it("does not honour a wildcard from the observed content type", () => {
    expect(isJSON("*/*")).toBe(false);
    expect(isJSON("application/*")).toBe(false);
    expect(isMultipartFormData("*/*")).toBe(false);
    expect(isJSON("application/json")).toBe(true);
  });
});

describe("httpConditional", () => {
  for (const [label, malicious] of INJECTIONS) {
    it(`rejects ${label} in an entity tag`, () => {
      expect(() => formatEntityTag(malicious)).toThrow(TypeError);
    });
  }

  it("rejects a DQUOTE inside an entity tag", () => {
    expect(() => formatEntityTag('a"b')).toThrow(TypeError);
  });

  it("generates a 128-bit ETag", () => {
    const tag = generateETag("hello");

    expect(tag).toMatch(/^"[0-9a-f]{32}"$/);
    expect(tag).not.toBe(generateETag("hellp"));
  });

  it("parses only the three RFC 9110 date formats, all as UTC", () => {
    const expected = Date.UTC(1994, 10, 6, 8, 49, 37);

    expect(parseHTTPDate("Sun, 06 Nov 1994 08:49:37 GMT")?.getTime()).toBe(
      expected,
    );
    expect(parseHTTPDate("Sunday, 06-Nov-94 08:49:37 GMT")?.getTime()).toBe(
      expected,
    );
    expect(parseHTTPDate("Sun Nov  6 08:49:37 1994")?.getTime()).toBe(expected);
    expect(parseHTTPDate("2024-01-01")).toBeUndefined();
    expect(parseHTTPDate("Dec 25")).toBeUndefined();
  });

  it("reports a non-matching If-Range as making Range inapplicable", () => {
    const resource = { etag: '"current"' };

    expect(
      evaluateConditionalRequest("GET", { ifRange: '"stale"' }, resource)
        .rangeApplicable,
    ).toBe(false);

    expect(
      evaluateConditionalRequest("GET", { ifRange: '"current"' }, resource)
        .rangeApplicable,
    ).toBe(true);

    expect(
      evaluateConditionalRequest("GET", {}, resource).rangeApplicable,
    ).toBe(true);
  });

  it("distinguishes the wildcard precondition from an empty tag list", () => {
    expect(parseEntityTagCondition("*")).toEqual({
      present: true,
      wildcard: true,
      tags: [],
    });

    expect(parseEntityTagCondition(undefined).present).toBe(false);
  });
});

describe("httpCookies", () => {
  it("never throws on a malformed Cookie header", () => {
    expect(() => parseCookies("a b=c")).not.toThrow();
    expect(() => parseCookies("a,b=c")).not.toThrow();

    const jar = parseCookies("theme=dark; a b=c");

    expect(jar.get("theme")).toBe("dark");
  });

  it("does not let an unbalanced quote swallow later cookies", () => {
    const jar = parseCookies('sid="; other=value');

    expect(jar.get("sid")).toBe('"');
    expect(jar.get("other")).toBe("value");
  });

  it("keeps the first occurrence of a duplicated cookie name", () => {
    expect(parseCookies("sid=good; sid=evil").get("sid")).toBe("good");
  });

  it("returns a null-prototype record from toObject", () => {
    const parsed = parseCookies("__proto__=owned; a=1").toObject();

    expect(Object.getPrototypeOf(parsed)).toBeNull();
    expect(({} as Record<string, unknown>)["owned"]).toBeUndefined();
    expect(parsed["a"]).toBe("1");
  });

  it("caps the number of parsed cookies", () => {
    const header = Array.from({ length: 5000 }, (_, i) => `c${i}=1`).join("; ");

    expect(parseCookies(header).size).toBeLessThanOrEqual(128);
  });

  it("rejects a NUL or DEL in a serialized cookie name", () => {
    expect(() => serializeCookie("a\u0000b", "v")).toThrow(TypeError);
    expect(() => serializeCookie("a\u007fb", "v")).toThrow(TypeError);
  });

  it("keeps spaces percent-encoded in the value", () => {
    expect(serializeCookie("a", "x y")).toBe("a=x%20y");
  });

  it("enforces the __Host- prefix rules", () => {
    expect(() =>
      serializeCookie("__Host-sid", "v", { domain: "evil.com", path: "/x" }),
    ).toThrow(TypeError);

    expect(() =>
      serializeCookie("__Host-sid", "v", { secure: true }),
    ).not.toThrow();

    expect(() =>
      serializeCookie("__Host-sid", "v", { secure: true, path: "/x" }),
    ).toThrow(TypeError);

    expect(() => serializeCookie("__Secure-sid", "v")).toThrow(TypeError);
  });

  it("signs with a keyed MAC and verifies in constant time", () => {
    const signature = signCookieValue("admin", "secret");

    expect(signature.length).toBeGreaterThan(20);
    expect(signCookieValue("admin", "other")).not.toBe(signature);
    expect(parseSignedCookie(`admin.${signature}`, "secret")).toBe("admin");
    expect(parseSignedCookie("admin.deadbeef", "secret")).toBeUndefined();
  });
});

describe("httpNegotiation", () => {
  it("honours an explicit q=0 over a wildcard", () => {
    expect(
      negotiateAccept("*/*, text/html;q=0", ["text/html"]),
    ).toBeUndefined();
    expect(
      negotiateAccept("*/*, text/html;q=0", ["text/html", "application/json"]),
    ).toBe("application/json");
  });

  it("treats an empty Accept-Encoding as identity only", () => {
    expect(negotiateEncoding("", ["br", "gzip"])).toBeUndefined();
    expect(negotiateEncoding("", ["br", "identity"])).toBe("identity");
    expect(negotiateEncoding(undefined, ["br", "gzip"])).toBe("br");
  });

  it("treats a malformed q-value as unacceptable, not maximal", () => {
    expect(parseQuality("abc")).toBe(0);
    expect(parseQuality("")).toBe(0);
    expect(parseQuality("2")).toBe(0);
    expect(parseQuality("0.5")).toBe(0.5);
    expect(negotiateAccept("text/html;q=abc", ["text/html"])).toBeUndefined();
  });

  it('never emits the malformed q-value "0."', () => {
    expect(formatQuality(0.0001)).toBe("0");
    expect(formatQuality(0.5)).toBe("0.5");
  });

  it("splits the alternative list outside quoted strings", () => {
    const parsed = parseNegotiationHeader(
      'text/html;v="a,b", application/json',
    );

    expect(parsed).toHaveLength(2);
  });

  it("caps the number of alternatives", () => {
    const header = Array.from({ length: 5000 }, () => "text/html").join(",");

    expect(parseNegotiationHeader(header).length).toBeLessThanOrEqual(64);
  });
});

describe("httpMime", () => {
  it("never returns a prototype member for an attacker-chosen extension", () => {
    expect(getMIMEType("evil.constructor")).toBe("application/octet-stream");
    expect(getMIMEType("a.__proto__")).toBe("application/octet-stream");
  });

  it("honours q-values in Accept", () => {
    expect(
      parseAcceptHeader("text/html;q=0.1, application/json;q=0.9")[0],
    ).toBe("application/json");

    expect(parseAcceptHeader("text/html;q=0")).toEqual([]);
  });
});

describe("httpMethods", () => {
  for (const [label, malicious] of INJECTIONS) {
    it(`drops ${label} from an Allow header`, () => {
      expect(formatAllowHeader(["GET", malicious])).toBe("GET");
    });
  }

  it("only allows an override to PUT, PATCH or DELETE", () => {
    expect(resolveMethodOverride("POST", "DELETE")).toBe("DELETE");
    expect(resolveMethodOverride("POST", "GET")).toBe("POST");
    expect(resolveMethodOverride("POST", "TRACE")).toBe("POST");
    expect(resolveMethodOverride("POST", "FOO")).toBe("POST");
  });
});

describe("httpStatus", () => {
  it("forbids a body on 1xx responses", () => {
    expect(hasResponseBody(103)).toBe(false);
    expect(hasResponseBody(100)).toBe(false);
    expect(hasResponseBody(204)).toBe(false);
    expect(hasResponseBody(200)).toBe(true);
  });
});

describe("httpCacheControl", () => {
  it("parses the qualified no-cache field list", () => {
    const parsed = parseCacheControl(
      'no-cache="Set-Cookie, Authorization", max-age=60',
    );

    expect(parsed.noCacheHeaders).toEqual(["Set-Cookie", "Authorization"]);
    expect(parsed.maxAge).toBe(60);
  });

  it("rejects malformed delta-seconds", () => {
    expect(parseCacheControl("max-age=-1").maxAge).toBeUndefined();
    expect(parseCacheControl("max-age=100abc").maxAge).toBeUndefined();
    expect(parseCacheControl("max-age=99999999999999999999").maxAge).toBe(
      2_147_483_648,
    );
  });

  it("drops a conflicting duplicate directive", () => {
    expect(
      parseCacheControl("max-age=0, max-age=99999").maxAge,
    ).toBeUndefined();
  });

  it("ignores a negative Age header", () => {
    const freshness = calculateFreshness({
      "cache-control": "max-age=60",
      age: "-100000",
    });

    expect(freshness.age).toBe(0);
    expect(freshness.remaining).toBe(60);
  });

  it("forces no-cache responses stale", () => {
    expect(
      calculateFreshness({ "cache-control": "no-cache, max-age=600" }).stale,
    ).toBe(true);
  });

  it("honours Expires when no max-age is present", () => {
    const date = new Date("2024-01-01T00:00:00Z");

    const freshness = calculateFreshness(
      { expires: new Date(date.getTime() + 3_600_000).toUTCString() },
      date,
    );

    expect(freshness.stale).toBe(false);
    expect(freshness.remaining).toBe(3600);
  });

  it("does not store an authenticated response marked private", () => {
    expect(
      isResponseStorable(
        { "cache-control": "private" },
        { authorization: "Bearer token" },
      ),
    ).toBe(false);

    expect(
      isResponseStorable(
        { "cache-control": "public" },
        { authorization: "Bearer token" },
      ),
    ).toBe(true);
  });
});
