// Build-time Tailwind config for the static site.
// The theme lives in js/tailwind-config.js (kept as the single source of truth);
// this file evaluates it and points Tailwind at every page and script.
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const sandbox = { tailwind: {} };
vm.runInNewContext(
  fs.readFileSync(path.join(__dirname, "js/tailwind-config.js"), "utf8"),
  sandbox,
);

module.exports = {
  ...sandbox.tailwind.config,
  content: [
    path.join(__dirname, "**/*.html"),
    path.join(__dirname, "js/**/*.js"),
  ],
};
