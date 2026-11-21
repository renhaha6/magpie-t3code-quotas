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
  buildModelGroups,
  classifyMagpieQuotas,
  handleManagementApiCall,
  selectExposedAccounts,
} from "../lib/adapter.mjs";
import { createConfigStore, defaultConfig, normalizeConfig, resolveMagpieBaseUrl } from "../lib/config.mjs";
import { formatMergedLabel, normalizeLang, resolveLang } from "../lib/i18n.mjs";
import { renderUiHtml } from "../lib/ui.mjs";
import { clusterResetWaves, poolQuotasByPlan, summarizeProviderQuotas } from "../lib/pool.mjs";
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
    assert.equal(pooledNone[0].displayLabel, "2 accounts · max");
    assert.equal(pooledNone[0].quota.user, "2 accounts · max");
    const wNone = pooledNone[0].quota.windows.find((w) => w.name === "5 hours");
    assert.equal(wNone.used, 66); // alice 32 + bob held 100 -> 66
    assert.equal(wNone.resetsAt, undefined, "none strategy must omit misleading single resetsAt");
    // Bob's 5h window is held by his exhausted 7-day window (2026-11-25T00:00:00Z),
    // so Alice (03:00) refills soonest and full refill isn't until Bob's 7-day reset.
    assert.equal(wNone.soonestResetAt, "2026-11-21T03:00:00.000Z");
    assert.equal(wNone.latestResetAt, "2026-11-25T00:00:00.000Z");
    assert.equal(wNone.soonestResetCount, 1);

    const pooledEarliest = poolQuotasByPlan(claudeMax, NOW_MS, { resetStrategy: "earliest" });
    assert.equal(
      pooledEarliest[0].quota.windows.find((w) => w.name === "5 hours").resetsAt,
      "2026-11-21T03:00:00.000Z",
    );

    const pooledLatest = poolQuotasByPlan(claudeMax, NOW_MS, { resetStrategy: "latest" });
    assert.equal(
      pooledLatest[0].quota.windows.find((w) => w.name === "5 hours").resetsAt,
      "2026-11-25T00:00:00.000Z",
    );

    const pooledAverage = poolQuotasByPlan(claudeMax, NOW_MS, { resetStrategy: "average", lang: "zh-CN" });
    assert.equal(
      pooledAverage[0].quota.windows.find((w) => w.name === "5 hours").resetsAt,
      new Date(
        Math.round((Date.parse("2026-11-21T03:00:00.000Z") + Date.parse("2026-11-25T00:00:00.000Z")) / 2),
      ).toISOString(),
    );
    assert.equal(pooledAverage[0].displayLabel, "2 个账号 · max（平均）");

    // Incomplete reset coverage (unclocked consumed account, stale or unreadable account)
    // must NOT promise a full-refill ("latest") or aligned timestamp.
    const unclocked = summarizeProviderQuotas(
      [
        { provider: "claude", plan: "pro", windows: [{ name: "5 hours", used: 40, resetsAt: "2026-11-21T03:00:00Z" }] },
        { provider: "claude", plan: "pro", windows: [{ name: "5 hours", used: 60 }] },
      ],
      NOW_MS,
      { resetStrategy: "latest" },
    );
    assert.equal(unclocked.windows[0].resetCoverageComplete, false);
    assert.equal(unclocked.windows[0].allResetsAligned, false);
    assert.equal(unclocked.windows[0].resetsAt, undefined, "latest must omit resetsAt when consumed accounts lack reset times");

    const withUnknown = summarizeProviderQuotas(
      [
        { provider: "claude", plan: "pro", windows: [{ name: "5 hours", used: 40, resetsAt: "2026-11-21T03:00:00Z" }] },
        { provider: "claude", plan: "pro", error: "429", windows: [] },
      ],
      NOW_MS,
      { resetStrategy: "when-aligned" },
    );
    assert.equal(withUnknown.windows[0].resetCoverageComplete, false);
    assert.equal(withUnknown.windows[0].allResetsAligned, false);
    assert.equal(withUnknown.windows[0].resetsAt, undefined);

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

  test("configurable resetMergeWindowSecs (seconds & minutes) clusters nearby waves and controls when-aligned strategy", () => {
    const closeQuotas = [
      {
        provider: "claude",
        plan: "max",
        user: "a@example.com",
        windows: [{ name: "5 hours", used: 60, resetsAt: "2026-11-21T02:00:00Z" }],
      },
      {
        provider: "claude",
        plan: "max",
        user: "b@example.com",
        windows: [{ name: "5 hours", used: 80, resetsAt: "2026-11-21T02:00:25Z" }],
      },
    ];
    const itemsClose = classifyMagpieQuotas(closeQuotas).t3Accounts;

    // 25s apart <= 30s window -> aligned, emits latestResetAt
    const aligned = poolQuotasByPlan(itemsClose, NOW_MS, {
      resetStrategy: "when-aligned",
      resetMergeWindowSecs: 30,
    });
    const wAligned = aligned[0].quota.windows[0];
    assert.equal(wAligned.allResetsAligned, true);
    assert.equal(wAligned.resetWaves.length, 1);
    assert.equal(wAligned.resetWaves[0].count, 2);
    assert.equal(wAligned.resetWaves[0].restorePercent, 70);
    assert.equal(wAligned.resetsAt, "2026-11-21T02:00:25.000Z");

    // 25s apart > 10s window -> NOT aligned, when-aligned omits resetsAt
    const split10s = poolQuotasByPlan(itemsClose, NOW_MS, {
      resetStrategy: "when-aligned",
      resetMergeWindowSecs: 10,
    });
    const wSplit = split10s[0].quota.windows[0];
    assert.equal(wSplit.allResetsAligned, false);
    assert.equal(wSplit.resetWaves.length, 2);
    assert.equal(wSplit.resetsAt, undefined);

    // Anchor-based clustering prevents chaining (0s, +20s, +40s with 30s window -> [2, 1])
    const waves = clusterResetWaves(
      [
        { ms: NOW_MS + 3_600_000, used: 100 },
        { ms: NOW_MS + 3_620_000, used: 100 },
        { ms: NOW_MS + 3_640_000, used: 100 },
      ],
      3,
      30,
    );
    assert.equal(waves.length, 2);
    assert.equal(waves[0].count, 2);
    assert.equal(waves[0].restorePercent, 67);
    assert.equal(waves[1].count, 1);
    assert.equal(waves[1].restorePercent, 33);

    // Config validation for resetMergeWindowSecs + legacy resetMergeWindowMins conversion
    const store = createConfigStore({ configDir: null });
    assert.equal(store.get().resetMergeWindowSecs, 300);
    assert.equal(store.update({ resetMergeWindowSecs: 0 }).resetMergeWindowSecs, 0);
    assert.equal(store.update({ resetMergeWindowSecs: 30 }).resetMergeWindowSecs, 30);
    assert.equal(store.update({ resetMergeWindowMins: 2 }).resetMergeWindowSecs, 120);
    assert.equal(store.update({ resetMergeWindowSecs: -5 }).resetMergeWindowSecs, 120);
    assert.equal(store.update({ resetMergeWindowSecs: 99999 }).resetMergeWindowSecs, 120);
  });

  test("buildModelGroups groups channels across providers by model family without summing scales", () => {
    const { t3Accounts, otherAccounts } = classifyMagpieQuotas(SAMPLE_QUOTAS);
    const cfg = { ...defaultConfig(), excludedPlans: ["claude:pro"] };
    const exposed = selectExposedAccounts(t3Accounts, cfg, NOW_MS);
    const groups = buildModelGroups(t3Accounts, otherAccounts, exposed, cfg, NOW_MS);

    const claudeGroup = groups.find((g) => g.id === "claude");
    assert.ok(claudeGroup);
    // Claude max (synced), Antigravity 3P shared pool (synced), Claude pro (unchecked)
    assert.equal(claudeGroup.channels.some((c) => c.provider === "claude" && c.plan === "max" && c.syncedAccounts === 2), true);
    assert.equal(claudeGroup.channels.some((c) => c.provider === "claude" && c.plan === "pro" && c.syncedAccounts === 0), true);
    const agyClaude = claudeGroup.channels.find((c) => c.provider === "antigravity");
    assert.ok(agyClaude);
    assert.equal(agyClaude.sharedPool, true);
    assert.equal(agyClaude.windows.every((w) => !/gemini/i.test(w.name)), true);

    const codexGroup = groups.find((g) => g.id === "codex");
    assert.ok(codexGroup);
    assert.equal(codexGroup.channels.some((c) => c.provider === "codex"), true);
    assert.equal(codexGroup.channels.some((c) => c.provider === "antigravity" && c.sharedPool), true);

    const geminiGroup = groups.find((g) => g.id === "gemini");
    assert.ok(geminiGroup);
    assert.equal(geminiGroup.channels.length, 1);
    assert.equal(geminiGroup.channels[0].provider, "antigravity");
    assert.equal(geminiGroup.channels[0].windows.every((w) => /gemini/i.test(w.name)), true);

    const otherGroup = groups.find((g) => g.id === "other");
    assert.ok(otherGroup);
    assert.equal(otherGroup.channels.some((c) => c.provider === "workbuddy" && !c.t3Supported), true);
    assert.equal(otherGroup.channels.some((c) => c.provider === "deepseek" && c.balances.length === 1), true);
  });

  test("adaptive auto mode pools providers exceeding threshold while keeping smaller providers expanded", () => {
    const many = [
      ...Array.from({ length: 6 }, (_, i) => ({
        provider: "claude",
        plan: "pro",
        user: `c${i + 1}@example.com`,
        kind: "subscription",
        windows: [{ name: "5 hours", used: 20, resetsAt: "2026-11-21T03:00:00Z" }],
      })),
      {
        provider: "codex",
        plan: "plus",
        user: "x1@example.com",
        kind: "subscription",
        windows: [{ name: "5 hours", used: 10, resetsAt: "2026-11-21T03:00:00Z" }],
      },
      {
        provider: "codex",
        plan: "plus",
        user: "x2@example.com",
        kind: "subscription",
        windows: [{ name: "5 hours", used: 40, resetsAt: "2026-11-21T04:00:00Z" }],
      },
    ];
    const { t3Accounts } = classifyMagpieQuotas(many);

    // Default threshold = 4 -> 6 Claude accounts auto-pool to 1; 2 Codex accounts stay expanded (2)
    const cfg4 = { ...defaultConfig(), mode: "auto", autoPoolThreshold: 4 };
    const exp4 = selectExposedAccounts(t3Accounts, cfg4, NOW_MS);
    const claudeOut = exp4.filter((a) => a.canonical === "claude");
    const codexOut = exp4.filter((a) => a.canonical === "codex");
    assert.equal(claudeOut.length, 1);
    assert.equal(claudeOut[0].pooledCount, 6);
    assert.equal(codexOut.length, 2);

    // Threshold = 6 -> 6 Claude accounts stay expanded too
    const cfg6 = { ...defaultConfig(), mode: "auto", autoPoolThreshold: 6 };
    const exp6 = selectExposedAccounts(t3Accounts, cfg6, NOW_MS);
    assert.equal(exp6.filter((a) => a.canonical === "claude").length, 6);

    // Threshold = 1 -> both Claude (6) and Codex (2) auto-pool
    const cfg1 = { ...defaultConfig(), mode: "auto", autoPoolThreshold: 1 };
    const exp1 = selectExposedAccounts(t3Accounts, cfg1, NOW_MS);
    assert.equal(exp1.filter((a) => a.canonical === "claude").length, 1);
    assert.equal(exp1.filter((a) => a.canonical === "codex").length, 1);

    // Config store validates autoPoolThreshold bounds (1..50)
    const store = createConfigStore({ configDir: null });
    assert.equal(store.get().mode, "auto");
    assert.equal(store.get().autoPoolThreshold, 4);
    assert.equal(store.update({ autoPoolThreshold: 6 }).autoPoolThreshold, 6);
    assert.equal(store.update({ autoPoolThreshold: 0 }).autoPoolThreshold, 6);
    assert.equal(store.update({ autoPoolThreshold: 99 }).autoPoolThreshold, 6);
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
      assert.equal(status.config.mode, "auto");
      assert.equal(status.config.autoPoolThreshold, 4);
      assert.equal(status.config.resetMergeWindowSecs, 300);
      assert.ok(Array.isArray(status.accountTree) && status.accountTree.length === 4);
      assert.equal(status.accountTree[0].effectiveMode, "auto-per-account");
      assert.ok(Array.isArray(status.modelGroups) && status.modelGroups.length >= 4);

      // Persist resetMergeWindowSecs (e.g., 30 seconds) & autoPoolThreshold via /api/config.
      // Display-only config changes reuse cached quotas and return updated status inline without hitting Magpie.
      magpieHits = 0;
      const rwRes = await fetch(`${base}/api/config`, {
        method: "POST",
        headers: { "X-UI-Token": app.uiToken, "Content-Type": "application/json" },
        body: JSON.stringify({ resetMergeWindowSecs: 30, autoPoolThreshold: 6 }),
      });
      assert.equal(rwRes.status, 200);
      const rwJson = await rwRes.json();
      assert.equal(rwJson.config.resetMergeWindowSecs, 30);
      assert.equal(rwJson.config.autoPoolThreshold, 6);
      assert.equal(rwJson.status.config.resetMergeWindowSecs, 30);
      assert.equal(rwJson.status.totalT3Accounts, 6);
      assert.equal(magpieHits, 0, "display config changes must not re-fetch Magpie");

      // Changing fetch source (keptOnly) invalidates cache; parallel management calls coalesce into 1 fetch.
      await fetch(`${base}/api/config`, {
        method: "POST",
        headers: { "X-UI-Token": app.uiToken, "Content-Type": "application/json" },
        body: JSON.stringify({ keptOnly: true }),
      });
      await fetch(`${base}/api/config`, {
        method: "POST",
        headers: { "X-UI-Token": app.uiToken, "Content-Type": "application/json" },
        body: JSON.stringify({ keptOnly: false }),
      });
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
      assert.equal(magpieHits, 1, "live cache (30s) should serve follow-up management calls without hitting Magpie again");

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

describe("i18n, count chip and reset pick", () => {
  // Mirrors T3 Code's accountInitials() in UsageLimitsPooled.tsx.
  const initials = (email) => {
    const [local = "", domain = ""] = email.split("@");
    return `${local[0] ?? ""}${domain[0] ?? ""}`.toUpperCase() || "?";
  };

  test("merged rows use clean labels without synthetic @ placeholders", () => {
    const label5 = formatMergedLabel({ count: 5, plan: "Max", lang: "en" });
    assert.equal(label5, "5 accounts · Max");
    assert.equal(initials(label5), "5");
    assert.ok(!label5.includes("@"));

    const label12Plan = formatMergedLabel({ count: 12, plan: "pro", lang: "zh-CN" });
    assert.equal(label12Plan, "pro · 12 个账号");
    assert.equal(initials(label12Plan), "P");
    assert.ok(!label12Plan.includes("@"));

    const label12NoPlan = formatMergedLabel({ count: 12, plan: "", lang: "zh-TW" });
    assert.equal(label12NoPlan, "×12 個帳號");
    assert.equal(initials(label12NoPlan), "×");
    assert.ok(!label12NoPlan.includes("@"));

    const many = Array.from({ length: 12 }, (_, i) => ({
      provider: "claude", plan: "max", user: `u${i}@example.com`,
      windows: [{ name: "5 hours", used: 10, resetsAt: i === 0 ? "2026-11-21T02:00:00Z" : "2026-11-21T05:00:00Z" }],
    }));
    const { t3Accounts } = classifyMagpieQuotas(many, { lang: "zh-CN" });
    const exposed = selectExposedAccounts(
      t3Accounts,
      { ...defaultConfig(), mode: "auto", pooledResetStrategy: "latest" },
      NOW_MS,
      { lang: "zh-CN" },
    );
    assert.equal(exposed.length, 1);
    assert.equal(exposed[0].displayLabel, "max · 12 个账号（全回血）");
    const files = buildAuthFilesResponse(exposed).files;
    assert.equal(files[0].email, "max · 12 个账号（全回血）");
    assert.equal(initials(files[0].email), "M");
  });

  test("language resolution and reset pick normalization", () => {
    assert.equal(normalizeLang("zh"), "zh-CN");
    assert.equal(normalizeLang("zh-Hant-TW"), "zh-TW");
    assert.equal(normalizeLang("zh_HK.UTF-8"), "zh-TW");
    assert.equal(normalizeLang("ja"), "en");
    assert.equal(resolveLang({ language: "zh-TW", magpieLang: "en" }, {}), "zh-TW");
    assert.equal(resolveLang({ language: "auto", magpieLang: "zh" }, {}), "zh-CN");
    assert.equal(resolveLang({ language: "auto" }, { LANG: "en_US.UTF-8" }), "en");

    const base = defaultConfig();
    assert.equal(base.pooledResetStrategy, "when-aligned");
    assert.equal(base.pooledResetPick, "latest");
    assert.equal(base.language, "auto");
    const on = normalizeConfig({ pooledResetStrategy: "average" }, base);
    assert.equal(on.pooledResetPick, "average");
    const off = normalizeConfig({ pooledResetStrategy: "when-aligned" }, on);
    assert.equal(off.pooledResetPick, "average", "switching off remembers the pick");
    assert.equal(normalizeConfig({ language: "xx", magpieLang: "zh-TW" }, base).language, "auto");
    assert.equal(normalizeConfig({ magpieLang: "zh-Hant" }, base).magpieLang, "zh-TW");
  });

  test("control page script parses and ships all three languages", () => {
    const html = renderUiHtml({ uiToken: "tok</script>" });
    const script = html.match(/<script>([\s\S]*)<\/script>/)[1];
    assert.doesNotThrow(() => new Function(script));
    assert.ok(!script.includes("tok</script>"));
    for (const word of ["显示方式", "顯示方式", "Display"]) assert.ok(html.includes(word));
  });
});

describe("cache source safety & mutation serialization", () => {
  test("rejects superseded old-source fetches, isolates ?live=1, and preserves 503 error on display save", async () => {
    let releaseOldFetch;
    const oldFetchDone = new Promise((r) => { releaseOldFetch = r; });
    let failNew = false;

    const fakeFetch = async (url) => {
      if (url.startsWith("http://old-magpie.local")) {
        await oldFetchDone;
        return {
          ok: true,
          status: 200,
          json: async () => ({
            data: [{ provider: "claude", plan: "pro", user: "old@example.com", windows: [{ name: "5 hours", used: 10 }] }],
          }),
        };
      }
      if (failNew) {
        return { ok: false, status: 503, text: async () => "down" };
      }
      const isLive = !url.includes("kept=1");
      return {
        ok: true,
        status: 200,
        json: async () => ({
          data: [{
            provider: "claude",
            plan: isLive ? "max" : "pro",
            user: isLive ? "live@example.com" : "kept@example.com",
            windows: [{ name: "5 hours", used: 20 }],
          }],
        }),
      };
    };

    const app = await startServer({
      configDir: null,
      portOverride: 0,
      t3SettingsPath: null,
      fetchImpl: fakeFetch,
      hostOptions: { magpieUrl: "http://old-magpie.local", keptOnly: true },
    });

    try {
      const base = `http://127.0.0.1:${app.port}`;
      const hdr = { "X-UI-Token": app.uiToken };
      const jsonHdr = { ...hdr, "Content-Type": "application/json" };

      // Start a slow fetch on old-magpie.local
      const oldStatusPromise = fetch(`${base}/api/status`, { headers: hdr });
      await new Promise((r) => setTimeout(r, 15));

      // Switch to new-magpie.local BEFORE old fetch finishes
      const swRes = await fetch(`${base}/api/config`, {
        method: "POST",
        headers: jsonHdr,
        body: JSON.stringify({ magpieUrl: "http://new-magpie.local" }),
      });
      const swJson = await swRes.json();
      assert.equal(swJson.status, undefined, "source change must not inline old status");

      // Let the old fetch finish late — it must NOT pollute the new source's cache
      releaseOldFetch();
      const oldStatus = await (await oldStatusPromise).json();
      assert.equal(oldStatus.config.magpieUrl, "http://old-magpie.local", "GET status must pair its tree with the same request config snapshot");

      // Display save now must NOT inline old-magpie accounts under new-magpie URL
      const saveAfterOld = await (await fetch(`${base}/api/config`, {
        method: "POST",
        headers: jsonHdr,
        body: JSON.stringify({ mode: "pooled" }),
      })).json();
      assert.equal(saveAfterOld.status, undefined, "superseded old-source fetch must not populate cache for new source");

      // ?live=1 must NOT populate the keptOnly cache used by inline config status
      const liveStatus = await (await fetch(`${base}/api/status?live=1`, { headers: hdr })).json();
      assert.equal(liveStatus.exposed[0].displayLabel, "live@example.com");
      const saveAfterLive = await (await fetch(`${base}/api/config`, {
        method: "POST",
        headers: jsonHdr,
        body: JSON.stringify({ mode: "auto" }),
      })).json();
      assert.equal(saveAfterLive.status, undefined, "?live=1 cache must not be mistaken for keptOnly snapshot");

      // Warm keptOnly cache, then trigger a 503 manual refresh
      const warm = await (await fetch(`${base}/api/status`, { headers: hdr })).json();
      assert.equal(warm.exposed[0].displayLabel, "kept@example.com");
      failNew = true;
      const errStatus = await (await fetch(`${base}/api/status?refresh=1`, { headers: hdr })).json();
      assert.match(errStatus.magpieError, /503/);

      // Follow-up display save must preserve the 503 error instead of reviving stale quotas
      const saveAfterErr = await (await fetch(`${base}/api/config`, {
        method: "POST",
        headers: jsonHdr,
        body: JSON.stringify({ mode: "per-account" }),
      })).json();
      assert.match(saveAfterErr.status.magpieError, /503/);
      assert.equal(saveAfterErr.status.exposedCount, 0);
    } finally {
      await app.close();
    }
  });

  test("serializes concurrent /api/port and /api/config key rotation so T3 settings keep new port + new key", async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "magpie-race-"));
    const settingsPath = path.join(tmpDir, "settings.json");
    fs.writeFileSync(settingsPath, JSON.stringify({ usageLimitSources: {} }));

    const probe = http.createServer();
    await new Promise((r) => probe.listen(0, "127.0.0.1", r));
    const nextPort = probe.address().port;
    await new Promise((r) => probe.close(r));

    const app = await startServer({
      configDir: tmpDir,
      portOverride: 0,
      t3SettingsPath: settingsPath,
      hostOptions: { autoWireT3Code: true },
    });

    try {
      const oldPort = app.port;
      const oldUrl = `http://127.0.0.1:${oldPort}`;
      const jsonHdr = { "X-UI-Token": app.uiToken, "Content-Type": "application/json" };

      // Start key rotation request on oldPort (passes Host check), hold its body open
      // until /api/port finishes switching to nextPort, then finish sending the body.
      const keyReqPromise = new Promise((resolve, reject) => {
        const req = http.request(
          {
            hostname: "127.0.0.1",
            port: oldPort,
            path: "/api/config",
            method: "POST",
            headers: jsonHdr,
          },
          (res) => {
            const chunks = [];
            res.on("data", (c) => chunks.push(c));
            res.on("end", () =>
              resolve({ status: res.statusCode, json: JSON.parse(Buffer.concat(chunks).toString("utf8")) }),
            );
          },
        );
        req.on("error", reject);
        req.write('{"regenerateKey":');
        setTimeout(() => {
          req.end("true}");
        }, 40);
      });

      await new Promise((r) => setTimeout(r, 10));
      const portRes = await fetch(`${oldUrl}/api/port`, {
        method: "POST",
        headers: jsonHdr,
        body: JSON.stringify({ port: nextPort }),
      });
      const keyRes = await keyReqPromise;
      assert.equal(portRes.status, 200);
      assert.equal(keyRes.status, 200);
      const keyJson = keyRes.json;

      const t3 = JSON.parse(fs.readFileSync(settingsPath, "utf8"));
      const src = t3.usageLimitSources[T3_SOURCE_ID];
      assert.equal(src.url, `http://127.0.0.1:${nextPort}`, "T3 Code settings must never regress to the old port");
      assert.equal(src.managementKey, keyJson.config.managementKey, "T3 Code settings must keep the rotated key");
    } finally {
      await app.close();
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});
