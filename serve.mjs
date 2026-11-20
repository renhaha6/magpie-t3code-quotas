#!/usr/bin/env bun
// Standalone runner (works with `bun serve.mjs` or `node serve.mjs`).

import { startServer } from "./lib/server.mjs";

const hostOptions = {};
if (process.env.PORT) hostOptions.port = Number(process.env.PORT);
if (process.env.MANAGEMENT_KEY) hostOptions.managementKey = process.env.MANAGEMENT_KEY;
if (process.env.MAGPIE_URL) hostOptions.magpieUrl = process.env.MAGPIE_URL;
if (process.env.MAGPIE_API_KEY) hostOptions.magpieApiKey = process.env.MAGPIE_API_KEY;
if (process.env.KEPT_ONLY !== undefined) hostOptions.keptOnly = process.env.KEPT_ONLY !== "false";

const info = await startServer({
  configDir: process.env.MAGPIE_T3CODE_QUOTAS_DIR || "",
  hostOptions,
});

const port = info.listening ? info.port : await info.ready;
const cfg = info.configStore.get();
console.log(`[magpie-t3code-quotas] listening on http://127.0.0.1:${port}`);
console.log(`[magpie-t3code-quotas] T3 Code Hub URL: http://127.0.0.1:${port}`);
console.log(`[magpie-t3code-quotas] Management Key:  ${cfg.managementKey}`);

const shutdown = async () => {
  await info.close();
  process.exit(0);
};
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
