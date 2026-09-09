#!/usr/bin/env bash
#
# Publishes every public Zudojs package to npm.
#
# Uses `pnpm -r publish`, which is deliberate on three counts:
#
#   1. It rewrites "workspace:*" into the concrete version of each
#      sibling as it packs. Plain `npm publish` does NOT understand the
#      workspace protocol and would upload a literal "workspace:*"
#      range, producing packages that cannot be installed.
#   2. It publishes in dependency order, so a package is never on the
#      registry before something it depends on.
#   3. It enumerates the workspace itself. The previous version of this
#      script carried a hand-written list that had drifted to 14 of 39
#      packages; anything added since was silently never published.
#
# Every package under examples/ is marked "private": true and is skipped
# automatically.
#
# Usage:
#   ./publish-all.sh              # publish
#   ./publish-all.sh --dry-run    # pack and validate, upload nothing
#
set -euo pipefail

cd "$(dirname "$0")"

DRY_RUN=""
if [[ "${1:-}" == "--dry-run" ]]; then
  DRY_RUN="--dry-run"
  echo "DRY RUN — nothing will be uploaded."
fi

echo "==> Verifying architecture boundaries"
node scripts/architect-check.js

echo "==> Building all packages"
pnpm -r --filter "./packages/**" run build

echo "==> Verifying every declared entry point resolves"
node scripts/check-exports.js

echo "==> Typechecking"
pnpm -r run typecheck

# Constrained concurrency: each package spawns its own vitest worker pool,
# so an unbounded recursive run oversubscribes the CPU and slow transforms
# trip vitest's 5s default timeout on tests that are not actually slow.
echo "==> Running tests"
pnpm -r --workspace-concurrency=2 run test

echo "==> Packages to publish"
pnpm -r --filter "./packages/**" exec node -p \
  '`  ${require("./package.json").name}@${require("./package.json").version}`' \
  2>/dev/null || true

echo
read -r -p "Publish these to npm? [y/N] " reply
if [[ ! "$reply" =~ ^[Yy]$ ]]; then
  echo "Aborted."
  exit 1
fi

# --no-git-checks: this repo publishes from a working tree that carries
# in-flight changes, and the release is cut from local state rather than
# from a tagged commit. Remove this flag once releases are tagged.
echo "==> Publishing"
pnpm -r --filter "./packages/**" publish \
  --access public \
  --no-git-checks \
  ${DRY_RUN}

echo
echo "Done."
