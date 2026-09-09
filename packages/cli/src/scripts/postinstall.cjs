/**
 * @zudojs/cli — Postinstall Version Check
 *
 * Runs after `npm install -g` to warn users if a newer version is available.
 */

const fs = require("node:fs");
const path = require("node:path");

const packageJsonPath = path.join(__dirname, "..", "..", "package.json");

function getInstalledVersion() {
  try {
    const content = fs.readFileSync(packageJsonPath, "utf-8");
    const pkg = JSON.parse(content);
    return pkg.version || "unknown";
  } catch {
    return "unknown";
  }
}

async function checkLatestVersion(packageName) {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);

    const response = await fetch(
      `https://registry.npmjs.org/${packageName}/latest`,
      { signal: controller.signal },
    );
    clearTimeout(timeout);

    if (!response.ok) {
      return null;
    }

    const data = await response.json();
    return data.version || null;
  } catch {
    return null;
  }
}

/**
 * Whether the update check should be skipped.
 *
 * The check reaches out to registry.npmjs.org on every install. That is
 * unwanted in CI, in Docker builds and on air-gapped machines, and there was
 * previously no way to turn it off.
 */
function shouldSkip() {
  if (process.env.ZUDOJS_NO_UPDATE_CHECK) return true;
  if (process.env.CI) return true;
  if (process.env.NODE_ENV === "test") return true;
  if (process.env.npm_config_offline === "true") return true;
  // Only a global install is the one the user upgrades with `npm i -g`.
  if (process.env.npm_config_global !== "true") return true;
  return false;
}

async function main() {
  if (shouldSkip()) {
    return;
  }

  const installed = getInstalledVersion();
  const latest = await checkLatestVersion("zudojs-cli");

  if (latest && latest !== installed) {
    console.log(
      `\n  zudojs ${installed} is installed, but version ${latest} is available.`,
    );
    console.log(`   Run: npm install -g zudojs-cli@latest\n`);
  }
}

main().catch(() => {});
