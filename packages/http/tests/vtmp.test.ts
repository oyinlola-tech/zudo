import { test } from "vitest";
import { serializeCookie, parseCookies } from "../src/httpCookies/http.cookies.js";
import { HTTPHeaders, normalizeHeaders } from "../src/httpHeaders/http.headers.js";
import { parseQuery } from "../src/httpQuery/http.query.js";

test("cookie name validation", () => {
  const nul = "a" + String.fromCharCode(0) + "b";
  try { console.log("NUL name ->", JSON.stringify(serializeCookie(nul, "v"))); } catch (e: any) { console.log("NUL throws:", e.message); }
  try { console.log("space name ->", JSON.stringify(serializeCookie("a b", "v"))); } catch (e: any) { console.log("space throws:", e.message); }
  console.log("space value ->", JSON.stringify(serializeCookie("a", "x y")));
  console.log("host prefix ->", JSON.stringify(serializeCookie("__Host-sid", "v", { domain: "evil.com", path: "/x" })));
  const del = "a" + String.fromCharCode(0x7f) + "b";
  try { console.log("DEL name ->", JSON.stringify(serializeCookie(del, "v"))); } catch (e: any) { console.log("DEL throws", e.message); }
});

test("header value control chars", () => {
  const h = new HTTPHeaders();
  const nul = "x" + String.fromCharCode(0) + "y";
  try { h.set("x-a", nul); console.log("NUL header value accepted:", JSON.stringify(h.get("x-a"))); } catch (e: any) { console.log("NUL hv throws:", e.message); }
  try { h.set("x-b", "ab"); console.log("NEL accepted"); } catch { console.log("NEL rejected"); }
  const n = normalizeHeaders({ "set-cookie": ["a=1; HttpOnly", "b=2; HttpOnly"] });
  console.log("set-cookie folded ->", JSON.stringify(n.get("set-cookie")));
  console.log("toObject ->", JSON.stringify(n.toNodeHeaders()));
});

test("query depth dos", () => {
  const key = "a" + "[b]".repeat(20000);
  try { parseQuery(key + "=1"); console.log("deep ok"); } catch (e: any) { console.log("DEPTH CRASH:", e.constructor.name, e.message.slice(0, 60)); }
});

test("cookie dos", () => {
  try { parseCookies("theme=dark; a b=c"); console.log("no throw"); } catch (e: any) { console.log("PARSE THROWS on valid-ish cookie jar:", e.message); }
});
