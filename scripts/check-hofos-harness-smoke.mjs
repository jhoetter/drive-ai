#!/usr/bin/env node

import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const config = JSON.parse(readFileSync(join(ROOT, "hofos-ui.config.json"), "utf8"));

function fail(message) {
  console.error(`hofos-harness-smoke: ${message}`);
  process.exitCode = 1;
}

for (const route of ["/drive", "/drive/my-drive", "/drive/f/example-folder", "/drive/file/example-file"]) {
  if (!config.harness.requiredRoutes.includes(route)) {
    fail(`missing route smoke coverage for ${route}`);
  }
}

if (config.harness.requiredProxyPrefix !== "/api/drive") {
  fail("expected /api/drive proxy prefix");
}

if (!/Office-AI|officeai|EditAsset/.test(config.harness.officeAiAttachmentContract)) {
  fail("missing Office host capability contract for drive");
}

const app = readFileSync(join(ROOT, "apps/web/src/App.tsx"), "utf8");
if (!/Command|openPalette|Cmd/.test(app)) {
  fail("expected Cmd+K palette wiring in App.tsx");
}
if (!app.includes("/drive")) {
  fail("expected /drive routes in App.tsx");
}

if (!existsSync(join(ROOT, "release-out/hofos-ui/driveai-ui-source/hofos-ui-export-manifest.json"))) {
  console.warn("hofos-harness-smoke warning: run pnpm run export:hofos-ui for manifest.");
}

if (process.exitCode) process.exit(process.exitCode);
console.log("hofos-harness-smoke: ok (driveai)");
