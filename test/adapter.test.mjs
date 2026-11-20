import assert from "node:assert/strict";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { describe, test } from "node:test";
import {
  buildAntigravitySummaryPayload,
  buildAuthFilesResponse,
  buildClaudeUsagePayload,
  buildCodexCreditsPayload,
  buildCodexUsagePayload,
  buildGrokUsagePayload,
  classifyMagpieQuotas,
  handleManagementApiCall,
  selectExposedAccounts,
} from "../lib/adapter.mjs";
import { defaultConfig, resolveMagpieBaseUrl } from "../lib/config.mjs";
import { poolQuotasByPlan, summarizeProviderQuotas } from "../lib/pool.mjs";
import { startServer } from "../lib/server.mjs";
import {
  inspectT3CodeHub,
  isEphemeralCliPort,
  removeT3CodeHub,
  resolveT3SettingsPath,
  syncT3CodeHub,
  T3_SOURCE_ID,
} from "../lib/t3wire.mjs";

const NOW_ISO = "2026-11-21T00:00:00.000Z";
const NOW_MS = Date.parse(NOW_ISO);

const SAMPLE_QUOTAS = [
  {
    provider: "claude",
    name: "Claude Code",
    kind: "subscription",
    plan: "max",
    user: "alice@example.com",
    last: true,
    windows: [
      { name: "5 hours", used: 32, remaining: 68, resetsAt: "2026-11-21T03:00:00Z" },
      { name: "7 days", used: 45, remaining: 55, resetsAt: "2026-11-26T00:00:00Z" },
      { name: "7 days · Opus", used: 20, remaining: 80, resetsAt: "2026-11-26T00:00:00Z" },
      { name: "7 days · Fable", used: 60, remaining: 40, resetsAt: "2026-11-26T00:00:00Z" },
      { name: "Usage credits", used: 12.5, remaining: 87.5, amount: 25, limit: 200 },
    ],
  },
  {
    provider: "claude",
    name: "Claude Code",
    kind: "subscription",
    plan: "max",
    user: "bob@example.com",
    windows: [
      { name: "5 hours", used: 10, remaining: 90, resetsAt: "2026-11-21T02:00:00Z" },
      { name: "7 days", used: 100, remaining: 0, resetsAt: "2026-11-25T00:00:00Z" },
    ],
  },
  {
    provider: "codex",
    name: "Codex",
    kind: "subscription",
    plan: "Pro",
    user: "codex@example.com",
    last: true,
    windows: [
      { name: "5 hours", used: 25, remaining: 75, resetsAt: "2026-11-21T04:00:00Z" },
      { name: "7 days", used: 40, remaining: 60, resetsAt: "2026-11-27T00:00:00Z" },
    ],
    resets: {
      count: 2,
      until: "2026-12-01T00:00:00Z",
      each: [{ until: "2026-12-01T00:00:00Z" }, { until: "2026-12-15T00:00:00Z" }],
    },
  },
  {
    provider: "agy-cli",
    name: "Antigravity",
    kind: "subscription",
    plan: "pro",
    user: "g@gmail.com",
    windows: [
      { name: "Gemini · 5 hours", pool: "Gemini", used: 30, remaining: 70, resetsAt: "2026-11-21T04:30:00Z" },
      { name: "Claude & GPT · 7 days", pool: "Claude & GPT", used: 50, remaining: 50, resetsAt: "2026-11-25T00:00:00Z" },
    ],
  },
  {
    provider: "grok",
    name: "Grok",
    kind: "subscription",
    plan: "supergrok",
    user: "grok@example.com",
    windows: [
      { name: "Weekly", used: 42, remaining: 58, resetsAt: "2026-11-28T00:00:00Z" },
    ],
  },
  {
    provider: "workbuddy",
    name: "WorkBuddy",
    kind: "subscription",
    plan: "pro",
    user: "wb@example.com",
    windows: [
      { name: "Credits", used: 50, remaining: 50, amount: 500, limit: 1000, unit: "credits" },
    ],
  },
  {
    provider: "deepseek",
    name: "DeepSeek",
    kind: "balance",
    balance: "$12.50",
    windows: [],
  },
];

describe("config helpers", () => {
  test("resolveMagpieBaseUrl handles MAGPIE_ADDR, wildcard host and explicit override", () => {
    assert.equal(resolveMagpieBaseUrl("", { MAGPIE_ADDR: "127.0.0.1:4000" }), "http://127.0.0.1:4000");
    assert.equal(resolveMagpieBaseUrl("", { MAGPIE_ADDR: "0.0.0.0:3425" }), "http://127.0.0.1:3425");
    assert.equal(resolveMagpieBaseUrl("http://192.168.1.10:3425/", {}), "http://192.168.1.10:3425");
    assert.equal(resolveMagpieBaseUrl("", {}), "http://127.0.0.1:3425");
  });
});

describe("provider classification & payload translation", () => {
  test("splits T3-native providers from other Magpie providers and deduplicates keys", () => {
    const { t3Accounts, otherAccounts } = classifyMagpieQuotas([
      ...SAMPLE_QUOTAS,
      { ...SAMPLE_QUOTAS[0] }, // duplicate identical key
    ]);
    assert.equal(t3Accounts.length, 6);
    assert.equal(otherAccounts.length, 2);
    assert.equal(t3Accounts[0].key, "claude:alice@example.com:max:");
    assert.equal(t3Accounts[5].key, "claude:alice@example.com:max:#2");
  });

  test("builds CLIProxyAPI auth-files matching T3 Code schema", () => {
    const { t3Accounts } = classifyMagpieQuotas(SAMPLE_QUOTAS);
    const res = buildAuthFilesResponse(t3Accounts);
    assert.equal(res.files.length, 5);

    const codex = res.files.find((f) => f.provider === "codex");
    assert.equal(codex.email, "codex@example.com");
    assert.equal(codex.id_token.plan_type, "pro");
    assert.equal(codex.id_token.chatgpt_plan_type, "pro");

    const agy = res.files.find((f) => f.provider === "antigravity");
    assert.ok(agy.project_id && agy.project_id.length > 0, "antigravity must include non-empty project_id");

    const grok = res.files.find((f) => f.provider === "xai");
    assert.equal(grok.email, "grok@example.com");
  });

  test("translates Claude windows including model-scoped and extra usage", () => {
    const payload = buildClaudeUsagePayload(SAMPLE_QUOTAS[0]);
    assert.deepEqual(payload.five_hour, { utilization: 32, resets_at: "2026-11-21T03:00:00.000Z" });
    assert.deepEqual(payload.seven_day, { utilization: 45, resets_at: "2026-11-26T00:00:00.000Z" });
    assert.equal(payload.limits.length, 2);
    assert.deepEqual(payload.limits[0], {
      kind: "weekly_scoped",
      percent: 20,
      resets_at: "2026-11-26T00:00:00.000Z",
      scope: { model: { display_name: "Opus" } },
    });
    assert.equal(payload.extra_usage.is_enabled, true);
    assert.equal(payload.extra_usage.used_credits, 25);
    assert.equal(payload.extra_usage.monthly_limit, 200);
  });

  test("translates Codex usage with unix-second reset_at and reset credits", () => {
    const usage = buildCodexUsagePayload(SAMPLE_QUOTAS[2]);
    assert.equal(usage.plan_type, "pro");
    assert.equal(usage.rate_limit.primary_window.used_percent, 25);
    assert.equal(usage.rate_limit.primary_window.reset_at, Math.floor(Date.parse("2026-11-21T04:00:00Z") / 1000));
    assert.equal(usage.rate_limit.primary_window.limit_window_seconds, 18000);
    assert.equal(usage.rate_limit.secondary_window.used_percent, 40);
    assert.equal(usage.rate_limit.secondary_window.limit_window_seconds, 604800);

    const credits = buildCodexCreditsPayload(SAMPLE_QUOTAS[2], NOW_MS);
    assert.equal(credits.credits.length, 2);
    assert.equal(credits.credits[0].reset_type, "codex_rate_limits");
    assert.equal(credits.credits[0].status, "available");
    assert.equal(credits.credits[0].expires_at, "2026-12-01T00:00:00.000Z");
  });

  test("translates Antigravity buckets with native prefixes and returns 404 for userinfo", () => {
    const summary = buildAntigravitySummaryPayload(SAMPLE_QUOTAS[3]);
    assert.equal(summary.buckets.length, 2);
    assert.equal(summary.buckets[0].bucketId, "gemini-5h");
    assert.equal(summary.buckets[0].window, "5h");
    assert.equal(summary.buckets[0].remainingFraction, 0.7);
    assert.equal(summary.buckets[1].bucketId, "3p-weekly");
    assert.equal(summary.buckets[1].window, "weekly");
    assert.equal(summary.buckets[1].remainingFraction, 0.5);

    const { t3Accounts } = classifyMagpieQuotas(SAMPLE_QUOTAS);
    const agyKey = t3Accounts.find((a) => a.t3Provider === "antigravity").key;
    const userInfoReply = handleManagementApiCall(
      t3Accounts,
      { auth_index: agyKey, url: "https://www.googleapis.com/oauth2/v2/userinfo" },
      NOW_MS,
    );
    assert.equal(userInfoReply.status_code, 404);
  });

  test("translates Grok weekly usage with ISO start and end", () => {
    const payload = buildGrokUsagePayload(SAMPLE_QUOTAS[4], NOW_MS);
    assert.equal(payload.config.creditUsagePercent, 42);
    assert.equal(payload.config.currentPeriod.type, "USAGE_PERIOD_TYPE_WEEKLY");
    assert.equal(payload.config.currentPeriod.end, "2026-11-28T00:00:00.000Z");
    assert.equal(payload.config.currentPeriod.start, "2026-11-21T00:00:00.000Z");
  });

  test("returns 502 for accounts with error and no readable windows", () => {
    const { t3Accounts } = classifyMagpieQuotas([
      { provider: "claude", user: "broken@example.com", kind: "subscription", error: "401 expired", windows: [] },
    ]);
    const reply = handleManagementApiCall(
      t3Accounts,
      { auth_index: t3Accounts[0].key, url: "https://api.anthropic.com/api/oauth/usage" },
      NOW_MS,
    );
    assert.equal(reply.status_code, 502);
  });
});

describe("pooling & selection modes", () => {
  test("pooled mode merges same-plan accounts and counts weekly-held session as 100% used", () => {
    const { t3Accounts } = classifyMagpieQuotas(SAMPLE_QUOTAS);
    const claudeOnly = t3Accounts.filter((a) => a.canonical === "claude");
    const pooled = poolQuotasByPlan(claudeOnly, NOW_MS);
    assert.equal(pooled.length, 1);
    const fiveH = pooled[0].quota.windows.find((w) => w.name === "5 hours");
    const sevenD = pooled[0].quota.windows.find((w) => w.name === "7 days");
    // Alice 5h = 32%; Bob 7d = 100% holding 5h -> Bob counts as 100% -> mean = (32 + 100) / 2 = 66
    assert.equal(fiveH.used, 66);
    assert.equal(sevenD.used, 72.5);
    // Earliest reset among 5h windows: Bob's 02:00 < Alice's 03:00
    assert.equal(fiveH.resetsAt, "2026-11-21T02:00:00.000Z");
  });

  test("stale cached windows (asOf + past resetsAt) are ignored in pooling", () => {
    const summary = summarizeProviderQuotas(
      [
        {
          provider: "claude",
          plan: "pro",
          asOf: "2026-11-20T10:00:00Z",
          windows: [{ name: "5 hours", used: 95, resetsAt: "2026-11-20T15:00:00Z" }],
        },
        {
          provider: "claude",
          plan: "pro",
          windows: [{ name: "5 hours", used: 20, resetsAt: "2026-11-21T04:00:00Z" }],
        },
      ],
      NOW_MS,
    );
    assert.equal(summary.windows.length, 1);
    assert.equal(summary.windows[0].used, 20);
    assert.equal(summary.windows[0].stale, 1);
  });

  test("active-only and only-selected selection filters work accurately", () => {
    const { t3Accounts } = classifyMagpieQuotas(SAMPLE_QUOTAS);
    const cfgActive = { ...defaultConfig(), mode: "active-only" };
    const active = selectExposedAccounts(t3Accounts, cfgActive, NOW_MS);
    const claudes = active.filter((a) => a.canonical === "claude");
    assert.equal(claudes.length, 1);
    assert.equal(claudes[0].quota.user, "alice@example.com");

    const bobKey = t3Accounts.find((a) => a.quota.user === "bob@example.com").key;
    const cfgPicked = { ...defaultConfig(), selectionMode: "only-selected", selectedAccounts: [bobKey] };
    const picked = selectExposedAccounts(t3Accounts, cfgPicked, NOW_MS);
    assert.equal(picked.length, 1);
    assert.equal(picked[0].quota.user, "bob@example.com");
  });
});

describe("HTTP server end-to-end", () => {
  test("serves T3 Code CLIProxyAPI endpoints, enforces Bearer auth, and updates config live", async () => {
    let magpieHits = 0;
    const mockMagpie = http.createServer((req, res) => {
      magpieHits += 1;
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ object: "list", data: SAMPLE_QUOTAS }));
    });
    await new Promise((r) => mockMagpie.listen(0, "127.0.0.1", r));
    const magpiePort = mockMagpie.address().port;

    const app = await startServer({
      configDir: null,
      portOverride: 0,
      hostOptions: {
        managementKey: "secret-test-key",
        magpieUrl: `http://127.0.0.1:${magpiePort}`,
        keptOnly: true,
      },
    });

    try {
      const base = `http://127.0.0.1:${app.port}`;

      // Unauthorized rejected
      const unauth = await fetch(`${base}/v0/management/auth-files`);
      assert.equal(unauth.status, 401);

      // Auth-files succeeds with Bearer token
      const filesRes = await fetch(`${base}/v0/management/auth-files`, {
        headers: { Authorization: "Bearer secret-test-key" },
      });
      assert.equal(filesRes.status, 200);
      const { files } = await filesRes.json();
      assert.equal(files.length, 5);

      // Parallel api-call hits snapshot cache (Magpie still hit only once)
      const claudeFile = files.find((f) => f.provider === "claude");
      const apiRes = await fetch(`${base}/v0/management/api-call`, {
        method: "POST",
        headers: {
          Authorization: "Bearer secret-test-key",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          auth_index: claudeFile.auth_index,
          method: "GET",
          url: "https://api.anthropic.com/api/oauth/usage",
          header: {},
        }),
      });
      assert.equal(apiRes.status, 200);
      const apiBody = await apiRes.json();
      assert.equal(apiBody.status_code, 200);
      const parsedClaude = JSON.parse(apiBody.body);
      assert.equal(parsedClaude.five_hour.utilization, 32);
      assert.equal(magpieHits, 1, "auth-files + api-call within TTL should share one Magpie fetch");

      // Switch to pooled mode via /api/config -> takes effect immediately
      const saveRes = await fetch(`${base}/api/config`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "pooled" }),
      });
      assert.equal(saveRes.status, 200);

      const pooledFilesRes = await fetch(`${base}/v0/management/auth-files`, {
        headers: { Authorization: "Bearer secret-test-key" },
      });
      const pooledFiles = (await pooledFilesRes.json()).files;
      assert.equal(
        pooledFiles.filter((f) => f.provider === "claude").length,
        1,
        "two Claude Max accounts should collapse into 1 pooled entry",
      );

      // /api/status returns other Magpie providers (WorkBuddy + DeepSeek)
      const statusRes = await fetch(`${base}/api/status`);
      const status = await statusRes.json();
      assert.equal(status.otherSummary.length, 2);
      assert.equal(status.magpieError, "");
    } finally {
      await app.close();
      await new Promise((r) => mockMagpie.close(r));
    }
  });

  test("auto-wires and removes usageLimitSources in T3 Code settings.json safely", async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "magpie-t3wire-"));
    const settingsPath = path.join(tmpDir, "userdata", "settings.json");
    fs.mkdirSync(path.dirname(settingsPath), { recursive: true });
    fs.writeFileSync(
      settingsPath,
      JSON.stringify(
        {
          providerInstances: { magpie: { driver: "claudeAgent", enabled: true } },
          usageLimitSources: {
            "other-hub": { kind: "cliproxy", url: "http://127.0.0.1:9999", managementKey: "k", enabled: true },
          },
        },
        null,
        2,
      ),
    );

    const app = await startServer({
      configDir: null,
      portOverride: 0,
      t3SettingsPath: settingsPath,
      hostOptions: {
        managementKey: "initial-key",
        autoWireT3Code: true,
      },
    });

    try {
      const saved = JSON.parse(fs.readFileSync(settingsPath, "utf8"));
      assert.ok(saved.providerInstances.magpie, "existing providerInstances must stay untouched");
      assert.ok(saved.usageLimitSources["other-hub"], "other hubs must stay untouched");
      assert.deepEqual(saved.usageLimitSources[T3_SOURCE_ID], {
        kind: "cliproxy",
        label: "Magpie",
        url: `http://127.0.0.1:${app.port}`,
        managementKey: "initial-key",
        enabled: true,
      });

      // Second sync is a no-op (no unnecessary file write)
      const second = syncT3CodeHub({
        settingsPath,
        url: `http://127.0.0.1:${app.port}`,
        managementKey: "initial-key",
      });
      assert.equal(second.changed, false);
      assert.equal(second.status, "up-to-date");

      // Changing managementKey via /api/config updates T3 Code settings automatically
      const base = `http://127.0.0.1:${app.port}`;
      const upd = await fetch(`${base}/api/config`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ managementKey: "rotated-key" }),
      });
      assert.equal(upd.status, 200);
      const afterKey = JSON.parse(fs.readFileSync(settingsPath, "utf8"));
      assert.equal(afterKey.usageLimitSources[T3_SOURCE_ID].managementKey, "rotated-key");

      // Unwire removes only magpie-quotas and leaves other-hub intact
      const unwire = await fetch(`${base}/api/t3/unwire`, { method: "POST" });
      assert.equal(unwire.status, 200);
      const afterRemove = JSON.parse(fs.readFileSync(settingsPath, "utf8"));
      assert.equal(afterRemove.usageLimitSources[T3_SOURCE_ID], undefined);
      assert.ok(afterRemove.usageLimitSources["other-hub"]);
    } finally {
      await app.close();
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});

describe("T3 Code auto-wire safety guards", () => {
  test("never creates missing ~/.t3 and refuses to overwrite invalid JSON", () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "magpie-t3wire-guard-"));
    try {
      const missingPath = path.join(tmpDir, "missing", "userdata", "settings.json");
      const r1 = syncT3CodeHub({ settingsPath: missingPath, url: "http://127.0.0.1:3478", managementKey: "k" });
      assert.equal(r1.status, "t3-not-found");
      assert.equal(fs.existsSync(missingPath), false);

      const corruptPath = path.join(tmpDir, "corrupt.json");
      fs.writeFileSync(corruptPath, "{ not valid json");
      const r2 = syncT3CodeHub({ settingsPath: corruptPath, url: "http://127.0.0.1:3478", managementKey: "k" });
      assert.equal(r2.status, "invalid-settings");
      assert.equal(fs.readFileSync(corruptPath, "utf8"), "{ not valid json");

      assert.equal(
        resolveT3SettingsPath({ T3CODE_HOME: "~/custom-t3" }, "/Users/test"),
        "/Users/test/custom-t3/userdata/settings.json",
      );

      // Ephemeral CLI port detection
      fs.writeFileSync(
        path.join(tmpDir, "plugins.json"),
        JSON.stringify({ plugins: [{ spec: "github:uiuing/magpie-t3code-quotas", options: { port: 3478 } }] }),
      );
      assert.equal(isEphemeralCliPort({ configDir: tmpDir, runningPort: 3478 }), false);
      assert.equal(isEphemeralCliPort({ configDir: tmpDir, runningPort: 54321 }), true);

      // Remove on missing entry is safe no-op
      assert.equal(removeT3CodeHub({ settingsPath: missingPath }).status, "t3-not-found");
      assert.equal(inspectT3CodeHub({ settingsPath: missingPath, url: "http://127.0.0.1:3478", managementKey: "k" }).exists, false);
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});
