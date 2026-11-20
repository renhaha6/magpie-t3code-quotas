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
import { createConfigStore, defaultConfig, resolveMagpieBaseUrl } from "../lib/config.mjs";
import { poolQuotasByPlan, summarizeProviderQuotas } from "../lib/pool.mjs";
import { isAllowedHostHeader, startServer } from "../lib/server.mjs";
import {
  inspectT3CodeHub,
  isEphemeralCliPort,
  removeT3CodeHub,
  resolveT3SettingsPath,
  syncT3CodeHub,
  T3_SECRET_REDACTED,
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
    provider: "claude",
    name: "Claude Code",
    kind: "subscription",
    plan: "pro",
    user: "carol@example.com",
    windows: [
      { name: "5 hours", used: 15, remaining: 85, resetsAt: "2026-11-21T04:00:00Z" },
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

describe("config & security helpers", () => {
  test("generates random managementKey on first start and regenerates on empty/flag", () => {
    const store = createConfigStore({ configDir: null });
    const k1 = store.get().managementKey;
    assert.ok(k1.startsWith("mgp_") && k1.length >= 24, "should generate random key");
    assert.notEqual(k1, "magpie-t3code-local");

    const k2 = store.update({ managementKey: "" }).managementKey;
    assert.ok(k2.startsWith("mgp_") && k2 !== k1, "clearing key must regenerate a fresh random key");

    const k3 = store.update({ regenerateKey: true }).managementKey;
    assert.ok(k3.startsWith("mgp_") && k3 !== k2);
  });

  test("resolveMagpieBaseUrl and strict Host header validation", () => {
    assert.equal(resolveMagpieBaseUrl("", { MAGPIE_ADDR: "127.0.0.1:4000" }), "http://127.0.0.1:4000");
    assert.equal(resolveMagpieBaseUrl("", { MAGPIE_ADDR: "0.0.0.0:3425" }), "http://127.0.0.1:3425");
    assert.equal(resolveMagpieBaseUrl("http://192.168.1.10:3425/", {}), "http://192.168.1.10:3425");

    assert.equal(isAllowedHostHeader("127.0.0.1:3478", 3478), true);
    assert.equal(isAllowedHostHeader("localhost:3478", 3478), true);
    assert.equal(isAllowedHostHeader("[::1]:3478", 3478), true);
    assert.equal(isAllowedHostHeader("evil.example:3478", 3478), false);
    assert.equal(isAllowedHostHeader("sub.localhost:3478", 3478), false);
    assert.equal(isAllowedHostHeader("127.0.0.1:9999", 3478), false);
  });
});

describe("provider classification & payload translation", () => {
  test("keys omit plan so Plus->Pro upgrades preserve account identity", () => {
    const a1 = classifyMagpieQuotas([
      { provider: "codex", user: "u@example.com", plan: "plus", kind: "subscription", windows: [] },
    ]).t3Accounts[0];
    const a2 = classifyMagpieQuotas([
      { provider: "codex", user: "u@example.com", plan: "pro", kind: "subscription", windows: [] },
    ]).t3Accounts[0];
    assert.equal(a1.key, "codex:u@example.com:");
    assert.equal(a2.key, a1.key);
    assert.equal(a1.planKey, "codex:plus");
    assert.equal(a2.planKey, "codex:pro");
  });

  test("builds CLIProxyAPI auth-files and translates all 4 providers accurately", () => {
    const { t3Accounts, otherAccounts } = classifyMagpieQuotas(SAMPLE_QUOTAS);
    assert.equal(t3Accounts.length, 6);
    assert.equal(otherAccounts.length, 2);

    const res = buildAuthFilesResponse(t3Accounts);
    assert.equal(res.files.length, 6);
    const agy = res.files.find((f) => f.provider === "antigravity");
    assert.ok(agy.project_id);

    const claude = buildClaudeUsagePayload(SAMPLE_QUOTAS[0], NOW_MS);
    assert.deepEqual(claude.five_hour, { utilization: 32, resets_at: "2026-11-21T03:00:00.000Z" });
    assert.equal(claude.limits.length, 2);
    assert.equal(claude.extra_usage.used_credits, 25);

    const codex = buildCodexUsagePayload(SAMPLE_QUOTAS[3], NOW_MS);
    assert.equal(codex.plan_type, "pro");
    assert.equal(codex.rate_limit.primary_window.reset_at, Math.floor(Date.parse("2026-11-21T04:00:00Z") / 1000));
    const credits = buildCodexCreditsPayload(SAMPLE_QUOTAS[3], NOW_MS);
    assert.equal(credits.credits.length, 2);

    const agySummary = buildAntigravitySummaryPayload(SAMPLE_QUOTAS[4], NOW_MS);
    assert.equal(agySummary.buckets[0].bucketId, "gemini-5h");
    assert.equal(agySummary.buckets[1].bucketId, "3p-weekly");

    const grok = buildGrokUsagePayload(SAMPLE_QUOTAS[5], NOW_MS);
    assert.equal(grok.config.creditUsagePercent, 42);
    assert.equal(grok.config.currentPeriod.start, "2026-11-21T00:00:00.000Z");

    // Stale asOf window dropped in per-account payload too
    const staleClaude = buildClaudeUsagePayload(
      {
        provider: "claude",
        asOf: "2026-11-20T00:00:00Z",
        windows: [{ name: "5 hours", used: 99, resetsAt: "2026-11-20T05:00:00Z" }],
      },
      NOW_MS,
    );
    assert.equal(staleClaude.five_hour, undefined);
  });

  test("returns 502 for broken accounts and 404 for Antigravity userinfo", () => {
    const { t3Accounts } = classifyMagpieQuotas([
      { provider: "claude", user: "broken@example.com", kind: "subscription", error: "401", windows: [] },
      SAMPLE_QUOTAS[4],
    ]);
    assert.equal(
      handleManagementApiCall(
        t3Accounts,
        { auth_index: t3Accounts[0].key, url: "https://api.anthropic.com/api/oauth/usage" },
        NOW_MS,
      ).status_code,
      502,
    );
    assert.equal(
      handleManagementApiCall(
        t3Accounts,
        { auth_index: t3Accounts[1].key, url: "https://www.googleapis.com/oauth2/v2/userinfo" },
        NOW_MS,
      ).status_code,
      404,
    );
  });
});

describe("3-level plan/account filtering & pooled reset strategies", () => {
  test("plan-level exclusion and explicit plan selection work with per-account exceptions", () => {
    const { t3Accounts } = classifyMagpieQuotas(SAMPLE_QUOTAS);

    // Exclude entire claude:pro plan
    const cfgExclPlan = { ...defaultConfig(), excludedPlans: ["claude:pro"] };
    const out1 = selectExposedAccounts(t3Accounts, cfgExclPlan, NOW_MS);
    assert.equal(out1.some((a) => a.quota.user === "carol@example.com"), false);
    assert.equal(out1.some((a) => a.quota.user === "alice@example.com"), true);

    // Exclude claude:max plan, but explicitly keep alice
    const aliceKey = t3Accounts.find((a) => a.quota.user === "alice@example.com").key;
    const cfgExcept = {
      ...defaultConfig(),
      excludedPlans: ["claude:max"],
      selectedAccounts: [aliceKey],
    };
    const out2 = selectExposedAccounts(t3Accounts, cfgExcept, NOW_MS);
    assert.equal(out2.some((a) => a.quota.user === "alice@example.com"), true);
    assert.equal(out2.some((a) => a.quota.user === "bob@example.com"), false);

    // Only-selected mode selecting claude:max plan picks both alice and bob
    const cfgOnlyPlan = {
      ...defaultConfig(),
      selectionMode: "only-selected",
      selectedPlans: ["claude:max"],
    };
    const out3 = selectExposedAccounts(t3Accounts, cfgOnlyPlan, NOW_MS);
    assert.deepEqual(
      out3.map((a) => a.quota.user).sort(),
      ["alice@example.com", "bob@example.com"],
    );
  });

  test("pooled reset strategies: none omits resetsAt, earliest vs latest pick exact bounds", () => {
    const { t3Accounts } = classifyMagpieQuotas(SAMPLE_QUOTAS);
    const claudeMax = t3Accounts.filter((a) => a.planKey === "claude:max");

    const pooledNone = poolQuotasByPlan(claudeMax, NOW_MS, { resetStrategy: "none" });
    assert.equal(pooledNone.length, 1);
    assert.equal(pooledNone[0].displayLabel, "全部 2 个账号 · max");
    const wNone = pooledNone[0].quota.windows.find((w) => w.name === "5 hours");
    assert.equal(wNone.used, 66); // alice 32 + bob held 100 -> 66
    assert.equal(wNone.resetsAt, undefined, "none strategy must omit misleading single resetsAt");
    assert.equal(wNone.soonestResetAt, "2026-11-21T02:00:00.000Z");
    assert.equal(wNone.latestResetAt, "2026-11-21T03:00:00.000Z");
    assert.equal(wNone.soonestResetCount, 1);

    const pooledEarliest = poolQuotasByPlan(claudeMax, NOW_MS, { resetStrategy: "earliest" });
    assert.equal(
      pooledEarliest[0].quota.windows.find((w) => w.name === "5 hours").resetsAt,
      "2026-11-21T02:00:00.000Z",
    );

    const pooledLatest = poolQuotasByPlan(claudeMax, NOW_MS, { resetStrategy: "latest" });
    assert.equal(
      pooledLatest[0].quota.windows.find((w) => w.name === "5 hours").resetsAt,
      "2026-11-21T03:00:00.000Z",
    );

    // Stale asOf still excluded in summary
    const summary = summarizeProviderQuotas(
      [
        { provider: "claude", plan: "pro", asOf: "2026-11-20T10:00:00Z", windows: [{ name: "5 hours", used: 95, resetsAt: "2026-11-20T15:00:00Z" }] },
        { provider: "claude", plan: "pro", windows: [{ name: "5 hours", used: 20, resetsAt: "2026-11-21T04:00:00Z" }] },
      ],
      NOW_MS,
    );
    assert.equal(summary.windows[0].used, 20);
  });
});

describe("T3 Code settings wiring, SECRET_REDACTED handling, and live port switch", () => {
  test("recognizes T3 Code SECRET_REDACTED placeholder and preserves disabled state", () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "magpie-t3wire-redact-"));
    const settingsPath = path.join(tmpDir, "userdata", "settings.json");
    fs.mkdirSync(path.dirname(settingsPath), { recursive: true });
    fs.writeFileSync(settingsPath, JSON.stringify({ providerInstances: { magpie: {} } }, null, 2));

    try {
      // Initial sync writes literal key
      const r1 = syncT3CodeHub({
        settingsPath,
        url: "http://127.0.0.1:3478",
        managementKey: "mgp_key_one",
      });
      assert.equal(r1.changed, true);
      assert.ok(r1.wiredKeyHash);

      // Simulate T3 Code moving key to encrypted secret store and writing "••••••"
      const afterT3 = JSON.parse(fs.readFileSync(settingsPath, "utf8"));
      afterT3.usageLimitSources[T3_SOURCE_ID].managementKey = T3_SECRET_REDACTED;
      fs.writeFileSync(settingsPath, JSON.stringify(afterT3, null, 2));

      // On Magpie restart: inspect sees upToDate=true and sync is a no-op!
      const insp = inspectT3CodeHub({
        settingsPath,
        url: "http://127.0.0.1:3478",
        managementKey: "mgp_key_one",
        lastWiredKeyHash: r1.wiredKeyHash,
      });
      assert.equal(insp.upToDate, true);
      assert.equal(insp.secretManagedByT3, true);

      const r2 = syncT3CodeHub({
        settingsPath,
        url: "http://127.0.0.1:3478",
        managementKey: "mgp_key_one",
        lastWiredKeyHash: r1.wiredKeyHash,
      });
      assert.equal(r2.changed, false);
      assert.equal(r2.status, "up-to-date");

      // If user rotates key -> detected as mismatch and re-written
      const inspRotated = inspectT3CodeHub({
        settingsPath,
        url: "http://127.0.0.1:3478",
        managementKey: "mgp_key_two",
        lastWiredKeyHash: r1.wiredKeyHash,
      });
      assert.equal(inspRotated.upToDate, false);
      assert.equal(inspRotated.keyMatches, false);

      // If user disables hub in T3 Code -> auto sync preserves enabled: false
      const disabledData = JSON.parse(fs.readFileSync(settingsPath, "utf8"));
      disabledData.usageLimitSources[T3_SOURCE_ID].enabled = false;
      fs.writeFileSync(settingsPath, JSON.stringify(disabledData, null, 2));

      const rDisabled = syncT3CodeHub({
        settingsPath,
        url: "http://127.0.0.1:3478",
        managementKey: "mgp_key_one",
        lastWiredKeyHash: r1.wiredKeyHash,
      });
      assert.equal(rDisabled.changed, false);
      assert.equal(rDisabled.status, "disabled-in-t3");
      const inspDisabled = inspectT3CodeHub({
        settingsPath,
        url: "http://127.0.0.1:3478",
        managementKey: "mgp_key_one",
        lastWiredKeyHash: r1.wiredKeyHash,
      });
      assert.equal(inspDisabled.disabledInT3, true);
      assert.equal(inspDisabled.upToDate, false);
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  test("enforces X-UI-Token + Host check, coalesces live fetches, and hot-switches port", async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "magpie-e2e-"));
    const settingsPath = path.join(tmpDir, "t3", "userdata", "settings.json");
    const magpieDir = path.join(tmpDir, "magpie");
    fs.mkdirSync(path.dirname(settingsPath), { recursive: true });
    fs.mkdirSync(magpieDir, { recursive: true });
    fs.writeFileSync(settingsPath, JSON.stringify({}, null, 2));
    fs.writeFileSync(
      path.join(magpieDir, "plugins.json"),
      JSON.stringify({ plugins: [{ spec: "github:uiuing/magpie-t3code-quotas", options: { port: 3478 } }] }),
    );

    let magpieHits = 0;
    const mockMagpie = http.createServer((req, res) => {
      magpieHits += 1;
      setTimeout(() => {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ object: "list", data: SAMPLE_QUOTAS }));
      }, 20);
    });
    await new Promise((r) => mockMagpie.listen(0, "127.0.0.1", r));
    const magpiePort = mockMagpie.address().port;

    // Reserve a busy port to test 409 conflict handling
    const busyServer = http.createServer((_req, res) => res.end());
    await new Promise((r) => busyServer.listen(0, "127.0.0.1", r));
    const busyPort = busyServer.address().port;

    // Pick a free port for hot-rebind
    const probeServer = http.createServer();
    await new Promise((r) => probeServer.listen(0, "127.0.0.1", r));
    const nextFreePort = probeServer.address().port;
    await new Promise((r) => probeServer.close(r));

    const app = await startServer({
      configDir: magpieDir,
      portOverride: 0,
      t3SettingsPath: settingsPath,
      hostOptions: {
        magpieUrl: `http://127.0.0.1:${magpiePort}`,
        magpieApiKey: "super-secret-magpie-key",
        keptOnly: false,
      },
    });

    try {
      const base = `http://127.0.0.1:${app.port}`;
      const key = app.configStore.get().managementKey;

      // Missing X-UI-Token rejected with 403
      const noTok = await fetch(`${base}/api/status`);
      assert.equal(noTok.status, 403);

      // Valid X-UI-Token succeeds and never leaks magpieApiKey
      const statusRes = await fetch(`${base}/api/status`, {
        headers: { "X-UI-Token": app.uiToken },
      });
      assert.equal(statusRes.status, 200);
      const status = await statusRes.json();
      assert.equal(status.config.magpieApiKey, undefined);
      assert.equal(status.config.hasMagpieApiKey, true);
      assert.ok(Array.isArray(status.accountTree) && status.accountTree.length === 4);

      // Parallel management api-call requests coalesce into a single Magpie fetch
      magpieHits = 0;
      const filesRes = await fetch(`${base}/v0/management/auth-files`, {
        headers: { Authorization: `Bearer ${key}` },
      });
      const { files } = await filesRes.json();
      await Promise.all(
        files.slice(0, 3).map((f) =>
          fetch(`${base}/v0/management/api-call`, {
            method: "POST",
            headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
            body: JSON.stringify({
              auth_index: f.auth_index,
              method: "GET",
              url: "https://api.anthropic.com/api/oauth/usage",
              header: {},
            }),
          }),
        ),
      );
      assert.equal(magpieHits, 0, "live cache (30s) should serve follow-up management calls without hitting Magpie again");

      // Busy port returns 409 without disturbing active port
      const busyRes = await fetch(`${base}/api/port`, {
        method: "POST",
        headers: { "X-UI-Token": app.uiToken, "Content-Type": "application/json" },
        body: JSON.stringify({ port: busyPort }),
      });
      assert.equal(busyRes.status, 409);

      // Simulate T3 Code redacting managementKey before port switch
      const t3Before = JSON.parse(fs.readFileSync(settingsPath, "utf8"));
      if (t3Before.usageLimitSources?.[T3_SOURCE_ID]) {
        t3Before.usageLimitSources[T3_SOURCE_ID].managementKey = T3_SECRET_REDACTED;
        fs.writeFileSync(settingsPath, JSON.stringify(t3Before, null, 2));
      }

      // Live switch to nextFreePort succeeds, updates plugins.json & T3 Code settings.json
      const switchRes = await fetch(`${base}/api/port`, {
        method: "POST",
        headers: { "X-UI-Token": app.uiToken, "Content-Type": "application/json" },
        body: JSON.stringify({ port: nextFreePort }),
      });
      assert.equal(switchRes.status, 200);
      assert.equal(app.port, nextFreePort);

      const newHealth = await fetch(`http://127.0.0.1:${nextFreePort}/health`);
      assert.equal(newHealth.status, 200);
      assert.equal((await newHealth.json()).port, nextFreePort);

      const updatedPlugins = JSON.parse(fs.readFileSync(path.join(magpieDir, "plugins.json"), "utf8"));
      assert.equal(updatedPlugins.plugins[0].options.port, nextFreePort);

      const t3After = JSON.parse(fs.readFileSync(settingsPath, "utf8"));
      assert.equal(t3After.usageLimitSources[T3_SOURCE_ID].url, `http://127.0.0.1:${nextFreePort}`);
      assert.equal(t3After.usageLimitSources[T3_SOURCE_ID].managementKey, T3_SECRET_REDACTED);
    } finally {
      await app.close();
      await new Promise((r) => mockMagpie.close(r));
      await new Promise((r) => busyServer.close(r));
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  test("guards: missing T3 settings returns 404 on /api/t3/wire, invalid JSON untouched, ephemeral CLI detected", async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "magpie-guard-"));
    const missingPath = path.join(tmpDir, "missing", "settings.json");
    const app = await startServer({
      configDir: null,
      portOverride: 0,
      t3SettingsPath: missingPath,
    });
    try {
      const res = await fetch(`http://127.0.0.1:${app.port}/api/t3/wire`, {
        method: "POST",
        headers: { "X-UI-Token": app.uiToken },
      });
      assert.equal(res.status, 404);
      assert.equal(fs.existsSync(missingPath), false);

      const corruptPath = path.join(tmpDir, "corrupt.json");
      fs.writeFileSync(corruptPath, "{ invalid");
      assert.equal(
        syncT3CodeHub({ settingsPath: corruptPath, url: "http://127.0.0.1:3478", managementKey: "k" }).status,
        "invalid-settings",
      );
      assert.equal(fs.readFileSync(corruptPath, "utf8"), "{ invalid");

      assert.equal(
        resolveT3SettingsPath({ T3CODE_HOME: "~/my-t3" }, "/Users/test"),
        "/Users/test/my-t3/userdata/settings.json",
      );
      fs.writeFileSync(
        path.join(tmpDir, "plugins.json"),
        JSON.stringify({ plugins: [{ spec: "github:uiuing/magpie-t3code-quotas", options: { port: 3478 } }] }),
      );
      assert.equal(isEphemeralCliPort({ configDir: tmpDir, runningPort: 3478 }), false);
      assert.equal(isEphemeralCliPort({ configDir: tmpDir, runningPort: 59999 }), true);
      assert.equal(removeT3CodeHub({ settingsPath: missingPath }).status, "t3-not-found");
    } finally {
      await app.close();
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});
