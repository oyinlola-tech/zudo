#!/usr/bin/env node
/**
 * Submits every URL in the live sitemap to IndexNow, which Bing, Yandex,
 * Naver, Seznam and Yep share (Bing's index also feeds DuckDuckGo, Yahoo and
 * ChatGPT search). Google does not take part; submit the sitemap in Search
 * Console for Google.
 *
 * Run it after a deploy has gone live, never before: the search engines fetch
 * the key file from the live site to prove the submission is ours.
 *
 *   node scripts/site-indexnow.mjs            # submit
 *   node scripts/site-indexnow.mjs --dry-run  # list what would be sent
 *   SITE_URL=https://example.com node scripts/site-indexnow.mjs
 *
 * The key is public by design; it lives in site/<key>.txt.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("../site/", import.meta.url));
const BASE = (process.env.SITE_URL || "https://zudojs.oyinlola.site").replace(
  /\/+$/,
  "",
);
const DRY_RUN = process.argv.includes("--dry-run");

const keyFile = readdirSync(ROOT).find((f) => /^[0-9a-f]{32}\.txt$/.test(f));
if (!keyFile) {
  console.error("site-indexnow: no site/<32-hex-key>.txt key file found");
  process.exit(1);
}
const key = readFileSync(join(ROOT, keyFile), "utf8").trim();
const keyLocation = `${BASE}/${keyFile}`;

const live = await fetch(keyLocation);
if (!live.ok || (await live.text()).trim() !== key) {
  console.error(
    `site-indexnow: ${keyLocation} is not live yet (HTTP ${live.status}); deploy first`,
  );
  process.exit(1);
}

const sitemap = await (await fetch(`${BASE}/sitemap.xml`)).text();
const urlList = [...sitemap.matchAll(/<url><loc>([^<]+)<\/loc>/g)].map(
  (m) => m[1],
);
if (urlList.length === 0) {
  console.error("site-indexnow: the live sitemap has no URLs");
  process.exit(1);
}

if (DRY_RUN) {
  console.log(urlList.join("\n"));
  console.log(`site-indexnow: ${urlList.length} URLs (dry run, nothing sent)`);
  process.exit(0);
}

const res = await fetch("https://api.indexnow.org/indexnow", {
  method: "POST",
  headers: { "content-type": "application/json; charset=utf-8" },
  body: JSON.stringify({ host: new URL(BASE).host, key, keyLocation, urlList }),
});
const body = await res.text();
if (res.status !== 200 && res.status !== 202) {
  console.error(`site-indexnow: HTTP ${res.status} ${body}`);
  process.exit(1);
}
console.log(`site-indexnow: ${urlList.length} URLs accepted (HTTP ${res.status})`);
