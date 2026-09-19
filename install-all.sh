#!/usr/bin/env bash
# Installs every published Zudo package into the current project.
#
# One `pnpm add` call, so a bad name fails the whole install up front instead
# of leaving a half-installed project. The CLI is published as `zudojs-cli`
# (not `@zudojs/cli`) and is added as a dev dependency.
#
# The package list is checked against packages/*/package.json by
# `pnpm architect:check`, so it cannot drift from what is published.
set -euo pipefail

PM="${PM:-pnpm}"

PACKAGES=(
  "@zudojs/adapters"
  "@zudojs/api"
  "@zudojs/auth"
  "@zudojs/auth-oauth"
  "@zudojs/cache"
  "@zudojs/config"
  "@zudojs/constants"
  "@zudojs/container"
  "@zudojs/core"
  "@zudojs/cqrs"
  "@zudojs/crypto"
  "@zudojs/database"
  "@zudojs/docs"
  "@zudojs/errors"
  "@zudojs/events"
  "@zudojs/feature-flags"
  "@zudojs/http"
  "@zudojs/lifecycle"
  "@zudojs/logger"
  "@zudojs/messaging"
  "@zudojs/middleware"
  "@zudojs/observability"
  "@zudojs/openapi"
  "@zudojs/permissions"
  "@zudojs/plugins"
  "@zudojs/queue"
  "@zudojs/rpc"
  "@zudojs/runtime"
  "@zudojs/scheduler"
  "@zudojs/schema"
  "@zudojs/security"
  "@zudojs/serialization"
  "@zudojs/storage"
  "@zudojs/tenancy"
  "@zudojs/testing"
  "@zudojs/transactions"
  "@zudojs/types"
  "@zudojs/validation"
)

DEV_PACKAGES=(
  "zudojs-cli"
)

echo "Installing ${#PACKAGES[@]} Zudo packages with $PM..."
"$PM" add "${PACKAGES[@]}"
"$PM" add -D "${DEV_PACKAGES[@]}"

echo ""
echo "All Zudo packages installed."
