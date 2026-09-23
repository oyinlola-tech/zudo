#!/usr/bin/env node
/**
 * `zudojs` is the short install name for the ZudoJS command-line interface.
 * `npm install -g zudojs` and `npx zudojs` both run zudojs-cli; this file only
 * forwards to it, so the two can never disagree.
 */
import "zudojs-cli/bin";
