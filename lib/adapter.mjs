import crypto from "node:crypto";
import { DEFAULT_AUTO_POOL_THRESHOLD } from "./config.mjs";
import {
  clampPercent,
  DEFAULT_RESET_MERGE_WINDOW_SECS,
  inferWindowSpanMs,
  isStaleWindow,
  poolQuotasByPlan,
  summarizeProviderQuotas,
} from "./pool.mjs";

const T3_PROVIDER_MAP = new Map([
  ["claude", { canonical: "claude", t3Provider: "claude" }],
  ["codex", { canonical: "codex", t3Provider: "codex" }],
  ["chatgpt", { canonical: "codex", t3Provider: "codex" }],
  ["grok", { canonical: "grok", t3Provider: "xai" }],
  ["xai", { canonical: "grok", t3Provider: "xai" }],
  ["antigravity", { canonical: "antigravity", t3Provider: "antigravity" }],
  ["agy-cli", { canonical: "antigravity", t3Provider: "antigravity" }],
  ["agy", { canonical: "antigravity", t3Provider: "antigravity" }],
]);

export function mapProvider(rawProvider) {
  const norm = String(rawProvider || "").trim().toLowerCase();
  return T3_PROVIDER_MAP.get(norm) || null;
}

function shortHash(input) {
  return crypto.createHash("sha256").update(String(input)).digest("hex").slice(0, 12);
}

export function normalizeCodexPlan(plan) {
  const p = String(plan || "").trim().toLowerCase();
  if (!p) return undefined;
  if (p.includes("enterprise")) return "enterprise";
  if (p.includes("business")) return "business";
  if (p.includes("team")) return "team";
  if (p.includes("pro")) return "pro";
  if (p.includes("plus")) return "plus";
  if (p.includes("go")) return "go";
  if (p.includes("free")) return "free";
  return p;
}

export function planKeyFor(canonical, plan) {
  const norm = String(plan || "").trim().toLowerCase() || "default";
  return `${canonical}:${norm}`;
}

function accountDisplayLabel(q) {
  const user = String(q?.user || "").trim();
  const alias = String(q?.alias || "").trim();
  const seat = String(q?.seat || "").trim();
  const from = String(q?.from || "").trim();
  const base = user || alias || seat || String(q?.name || q?.provider || "account").trim();
  return from ? `${base}（来自 ${from}）` : base;
}

/**
 * Inspect Magpie's /v1/magpie/quotas array and assign stable deterministic keys
 * keyed on (provider, user, source) — intentionally omitting `plan` so upgrading
 * a plan (e.g. Plus -> Pro) does not break saved account ticks.
 */
export function classifyMagpieQuotas(rawQuotas) {
  const list = Array.isArray(rawQuotas) ? rawQuotas : [];
  const seen = new Map();
  const t3Accounts = [];
  const otherAccounts = [];

  for (const q of list) {
    if (!q || typeof q !== "object") continue;
    const mapped = mapProvider(q.provider);
    const isBalance = String(q.kind || "").toLowerCase() === "balance";

    if (!mapped || isBalance) {
      otherAccounts.push(q);
      continue;
    }

    const identity = [
      mapped.canonical,
      String(q.user || q.alias || q.seat || q.name || "default").trim().toLowerCase(),
      String(q.from || "").trim().toLowerCase(),
    ].join(":");

    const count = (seen.get(identity) || 0) + 1;
    seen.set(identity, count);
    const key = count === 1 ? identity : `${identity}#${count}`;
    const plan = String(q.plan || "").trim();

    t3Accounts.push({
      key,
      canonical: mapped.canonical,
      t3Provider: mapped.t3Provider,
      plan,
      planKey: planKeyFor(mapped.canonical, plan),
      displayLabel: accountDisplayLabel(q),
      quota: q,
    });
  }

  return { t3Accounts, otherAccounts };
}

/**
 * Evaluate whether a single account passes the 3-level (Provider -> Plan -> Account) filter.
 */
export function isAccountSelected(item, config) {
  const enabledProviders = config?.enabledProviders || {};
  if (enabledProviders[item.canonical] === false) return false;

  const selectionMode = config?.selectionMode || "all-except";
  const selectedPlans = new Set(config?.selectedPlans || []);
  const excludedPlans = new Set(config?.excludedPlans || []);
  const selectedAccounts = new Set(config?.selectedAccounts || []);
  const excludedAccounts = new Set(config?.excludedAccounts || []);

  if (selectionMode === "only-selected") {
    if (excludedAccounts.has(item.key)) return false;
    return selectedAccounts.has(item.key) || selectedPlans.has(item.planKey);
  }

  // Default: "all-except" (new accounts auto-synced unless their plan or account is excluded).
  if (excludedAccounts.has(item.key)) return false;
  if (excludedPlans.has(item.planKey) && !selectedAccounts.has(item.key)) return false;
  return true;
}

/**
 * Apply user configuration (provider/plan/account filters + mode + pooled reset strategy)
 * to produce the final list of accounts exposed to T3 Code.
 */
export function selectExposedAccounts(t3Accounts, config, nowMs = Date.now()) {
  let filtered = t3Accounts
    .filter((item) => isAccountSelected(item, config))
    .map((item) => ({ ...item, memberKeys: [item.key], fallbackActive: false }));

  const mode = config?.mode || "auto";
  if (mode === "active-only") {
    const byProvider = new Map();
    for (const item of filtered) {
      let arr = byProvider.get(item.canonical);
      if (!arr) {
        arr = [];
        byProvider.set(item.canonical, arr);
      }
      arr.push(item);
    }
    const picked = [];
    for (const group of byProvider.values()) {
      const active = group.filter((item) => item.quota?.last === true);
      if (active.length > 0) {
        picked.push(...active);
      } else {
        const healthy = group.find((item) => !item.quota?.error) || group[0];
        picked.push({ ...healthy, fallbackActive: true });
      }
    }
    filtered = picked;
  } else if (mode === "pooled") {
    filtered = poolQuotasByPlan(filtered, nowMs, {
      resetStrategy: config?.pooledResetStrategy || "when-aligned",
      resetMergeWindowSecs: config?.resetMergeWindowSecs ?? DEFAULT_RESET_MERGE_WINDOW_SECS,
    });
  } else if (mode === "auto") {
    // Per-provider adaptive mode: keep <= threshold accounts expanded so T3 Code's
    // multi-segment bar stays roomy, and auto-pool providers with > threshold accounts.
    const threshold =
      Number.isInteger(config?.autoPoolThreshold) && config.autoPoolThreshold >= 1
        ? config.autoPoolThreshold
        : DEFAULT_AUTO_POOL_THRESHOLD;
    const byProvider = new Map();
    for (const item of filtered) {
      let arr = byProvider.get(item.canonical);
      if (!arr) {
        arr = [];
        byProvider.set(item.canonical, arr);
      }
      arr.push(item);
    }
    const adaptive = [];
    for (const group of byProvider.values()) {
      if (group.length > threshold) {
        adaptive.push(
          ...poolQuotasByPlan(group, nowMs, {
            resetStrategy: config?.pooledResetStrategy || "when-aligned",
            resetMergeWindowSecs:
              config?.resetMergeWindowSecs ?? DEFAULT_RESET_MERGE_WINDOW_SECS,
          }),
        );
      } else {
        adaptive.push(...group);
      }
    }
    filtered = adaptive;
  }

  return filtered;
}

/**
 * Build CLIProxyAPI `GET /v0/management/auth-files` payload matching
 * T3 Code's `apps/server/src/usage/cliproxyApi.ts` AuthFiles schema.
 */
export function buildAuthFilesResponse(exposedAccounts) {
  const files = exposedAccounts.map((item) => {
    const q = item.quota;
    const authIndex = item.key;
    const email = String(q.user || item.displayLabel || "").trim();
    const base = {
      id: authIndex,
      auth_index: authIndex,
      provider: item.t3Provider,
      disabled: false,
      ...(email ? { email } : {}),
    };

    if (item.t3Provider === "antigravity") {
      // cliproxyApi.ts requires a non-empty project_id before calling retrieveUserQuotaSummary.
      base.project_id = `magpie-${shortHash(authIndex)}`;
    } else if (item.t3Provider === "codex") {
      const planType = normalizeCodexPlan(q.plan);
      base.id_token = {
        chatgpt_account_id: `magpie-${shortHash(authIndex)}`,
        ...(planType ? { plan_type: planType, chatgpt_plan_type: planType } : {}),
      };
    }

    return base;
  });

  return { files };
}

function toIsoOrNull(value) {
  if (!value) return null;
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? new Date(ms).toISOString() : null;
}

function toUnixSecondsOrNull(value) {
  if (!value) return null;
  const ms = Date.parse(value);
  return Number.isFinite(ms) && ms > 0 ? Math.floor(ms / 1000) : null;
}

function isFiveHourName(name) {
  return /\b5\s*(?:h|hr|hrs|hour|hours)\b|five.?hour|^session$/i.test(name);
}

function isOverallWeeklyName(name) {
  return /^(?:7\s*(?:d|day|days)|weekly|week|all\s*models?\s*\(?7d\)?)$/i.test(name);
}

function isMonthlyName(name) {
  return /\b(?:30\s*d|monthly|month)\b/i.test(name);
}

function extractScopedModelName(name) {
  const m = name.match(/(?:7\s*(?:d|days?)|weekly)\s*[·:\-/]\s*(.+)$/i);
  if (m && m[1]?.trim()) return m[1].trim();
  const rev = name.match(/^([A-Za-z0-9 ._-]+?)\s*[·:\-/]\s*(?:7\s*(?:d|days?)|weekly)$/i);
  if (rev && rev[1]?.trim()) return rev[1].trim();
  return null;
}

function freshWindowsOf(q, nowMs) {
  return (q.windows || []).filter((w) => w && !w.text && !w.lane && !isStaleWindow(q, w, nowMs));
}

export function buildClaudeUsagePayload(q, nowMs = Date.now()) {
  const windows = freshWindowsOf(q, nowMs);
  let fiveHour = null;
  let sevenDay = null;
  const limits = [];
  let extraUsage = null;

  for (const w of windows) {
    const name = String(w.name || "").trim();
    const used = clampPercent(w.used);
    const resetsAt = toIsoOrNull(w.resetsAt);

    if (/extra\s*usage|usage\s*credits|monthly\s*spend/i.test(name)) {
      extraUsage = {
        is_enabled: true,
        monthly_limit: Number(w.limit) > 0 ? Number(w.limit) : null,
        used_credits: Number(w.amount) >= 0 && Number(w.limit) > 0 ? Number(w.amount) : null,
        utilization: used,
      };
      continue;
    }

    if (!fiveHour && isFiveHourName(name)) {
      fiveHour = { utilization: used, resets_at: resetsAt };
      continue;
    }

    if (!sevenDay && isOverallWeeklyName(name)) {
      sevenDay = { utilization: used, resets_at: resetsAt };
      continue;
    }

    const scoped = extractScopedModelName(name);
    if (scoped) {
      limits.push({
        kind: "weekly_scoped",
        percent: used,
        resets_at: resetsAt,
        scope: { model: { display_name: scoped } },
      });
    }
  }

  return {
    ...(fiveHour ? { five_hour: fiveHour } : {}),
    ...(sevenDay ? { seven_day: sevenDay } : {}),
    ...(limits.length > 0 ? { limits } : {}),
    ...(extraUsage ? { extra_usage: extraUsage } : {}),
  };
}

export function buildCodexUsagePayload(q, nowMs = Date.now()) {
  const windows = freshWindowsOf(q, nowMs);
  let primary = null;
  let secondary = null;

  for (const w of windows) {
    const name = String(w.name || "").trim();
    const spanMs = inferWindowSpanMs(w);
    const entry = {
      used_percent: clampPercent(w.used),
      reset_at: toUnixSecondsOrNull(w.resetsAt),
      ...(spanMs > 0 ? { limit_window_seconds: Math.round(spanMs / 1000) } : {}),
    };

    if (!primary && (isFiveHourName(name) || isMonthlyName(name))) {
      primary = entry;
    } else if (!secondary && (isOverallWeeklyName(name) || /week|7\s*d/i.test(name))) {
      secondary = entry;
    } else if (!primary) {
      primary = entry;
    } else if (!secondary) {
      secondary = entry;
    }
  }

  const planType = normalizeCodexPlan(q.plan);
  return {
    ...(planType ? { plan_type: planType } : {}),
    rate_limit: {
      primary_window: primary,
      secondary_window: secondary,
    },
  };
}

export function buildCodexCreditsPayload(q, nowMs = Date.now()) {
  const count = Number(q?.resets?.count) || 0;
  if (count <= 0) return { credits: [] };

  const fallbackExpiry = new Date(nowMs + 30 * 86_400_000).toISOString();
  const each = Array.isArray(q?.resets?.each) ? q.resets.each : [];
  const defaultUntil = toIsoOrNull(q?.resets?.until) || fallbackExpiry;
  const credits = [];

  for (let i = 0; i < count; i += 1) {
    const card = each[i];
    const expiresAt = toIsoOrNull(card?.until) || defaultUntil;
    credits.push({
      id: `magpie-reset-${i + 1}`,
      status: "available",
      reset_type: "codex_rate_limits",
      expires_at: expiresAt,
    });
  }
  return { credits };
}

export function buildGrokUsagePayload(q, nowMs = Date.now()) {
  const windows = freshWindowsOf(q, nowMs);
  const win = windows[0];
  if (!win) {
    return { config: {} };
  }

  const name = String(win.name || "").trim();
  const weekly = /week|7\s*d/i.test(name);
  const monthly = /month|30\s*d/i.test(name);
  const type = weekly
    ? "USAGE_PERIOD_TYPE_WEEKLY"
    : monthly
      ? "USAGE_PERIOD_TYPE_MONTHLY"
      : "USAGE_PERIOD_TYPE_CUSTOM";

  const endMs = win.resetsAt ? Date.parse(win.resetsAt) : NaN;
  const period = { type };
  if (Number.isFinite(endMs)) {
    period.end = new Date(endMs).toISOString();
    const durationMs =
      inferWindowSpanMs(win) ||
      (weekly ? 7 * 86_400_000 : monthly ? 30 * 86_400_000 : 0);
    if (durationMs > 0) {
      period.start = new Date(endMs - durationMs).toISOString();
    } else if (endMs > nowMs) {
      period.start = new Date(nowMs).toISOString();
    }
  }

  return {
    config: {
      creditUsagePercent: clampPercent(win.used),
      currentPeriod: period,
    },
  };
}

function deriveAntigravityBucketId(w, index) {
  const pool = String(w.pool || "").toLowerCase();
  const name = String(w.name || "").toLowerCase();
  const combined = `${pool} ${name}`;
  const isWeekly = /week|7\s*d/.test(combined);
  const is5h = /5\s*h|five.?hour|session/.test(combined);
  const suffix = isWeekly ? "weekly" : is5h ? "5h" : `slot-${index}`;

  if (combined.includes("argon")) return `gemini-argon-${suffix}`;
  if (combined.includes("carbon")) return `gemini-carbon-${suffix}`;
  if (combined.includes("gemini")) return `gemini-${suffix}`;
  if (combined.includes("claude") || combined.includes("gpt") || combined.includes("3p")) {
    return `3p-${suffix}`;
  }

  const slug = combined
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 32);
  return slug ? `${slug}-${suffix}` : `bucket-${index}`;
}

export function buildAntigravitySummaryPayload(q, nowMs = Date.now()) {
  const windows = freshWindowsOf(q, nowMs);
  const buckets = windows.map((w, index) => {
    const combined = `${w.pool || ""} ${w.name || ""}`.toLowerCase();
    const isWeekly = /week|7\s*d/.test(combined);
    const is5h = /5\s*h|five.?hour|session/.test(combined);
    const used = clampPercent(w.used);
    const remainingFraction = Math.max(0, Math.min(1, (100 - used) / 100));
    const resetTime = toIsoOrNull(w.resetsAt);

    return {
      bucketId: deriveAntigravityBucketId(w, index),
      displayName: String(w.pool || w.name || `Bucket ${index + 1}`).trim(),
      ...(isWeekly ? { window: "weekly" } : is5h ? { window: "5h" } : {}),
      remainingFraction,
      ...(resetTime ? { resetTime } : {}),
    };
  });

  return { buckets };
}

export function handleManagementApiCall(exposedAccounts, requestBody, nowMs = Date.now()) {
  const authIndex = String(requestBody?.auth_index || "");
  const targetUrl = String(requestBody?.url || "");
  const account = exposedAccounts.find((a) => a.key === authIndex);

  if (!account) {
    return {
      status_code: 404,
      body: JSON.stringify({ error: `Account ${authIndex} not found in Magpie snapshot` }),
    };
  }

  const q = account.quota;
  const hasReadableWindows = freshWindowsOf(q, nowMs).length > 0;

  if (targetUrl.includes("googleapis.com/oauth2/v2/userinfo")) {
    return { status_code: 404, body: "{}" };
  }

  if (targetUrl.includes("/rate-limit-reset-credits/consume")) {
    return {
      status_code: 501,
      body: JSON.stringify({ error: "Read-only adapter: redeem reset credits inside Magpie." }),
    };
  }

  if (q.error && !hasReadableWindows) {
    return {
      status_code: 502,
      body: JSON.stringify({ error: q.error }),
    };
  }

  if (account.t3Provider === "claude" || targetUrl.includes("/api/oauth/usage")) {
    return {
      status_code: 200,
      body: JSON.stringify(buildClaudeUsagePayload(q, nowMs)),
    };
  }

  if (account.t3Provider === "codex") {
    if (targetUrl.includes("/rate-limit-reset-credits")) {
      return {
        status_code: 200,
        body: JSON.stringify(buildCodexCreditsPayload(q, nowMs)),
      };
    }
    return {
      status_code: 200,
      body: JSON.stringify(buildCodexUsagePayload(q, nowMs)),
    };
  }

  if (account.t3Provider === "xai" || targetUrl.includes("grok.com/v1/billing")) {
    return {
      status_code: 200,
      body: JSON.stringify(buildGrokUsagePayload(q, nowMs)),
    };
  }

  if (account.t3Provider === "antigravity" || targetUrl.includes("retrieveUserQuotaSummary")) {
    return {
      status_code: 200,
      body: JSON.stringify(buildAntigravitySummaryPayload(q, nowMs)),
    };
  }

  return {
    status_code: 404,
    body: JSON.stringify({ error: `Unsupported api-call URL: ${targetUrl}` }),
  };
}

const MODEL_FAMILIES = [
  { id: "claude", label: "Claude" },
  { id: "codex", label: "Codex / GPT" },
  { id: "gemini", label: "Gemini" },
  { id: "grok", label: "Grok" },
  { id: "other", label: "其他模型 / 通用额度" },
];

const PROVIDER_DISPLAY = {
  claude: "Claude",
  codex: "Codex (ChatGPT)",
  antigravity: "Antigravity",
  grok: "Grok",
  gemini: "Gemini CLI",
};

function familiesForWindow(providerId, win) {
  const p = String(providerId || "").trim().toLowerCase();
  const combined = `${win?.pool || ""} ${win?.name || ""}`.toLowerCase();

  if (p === "claude") return ["claude"];
  if (p === "codex" || p === "chatgpt") return ["codex"];
  if (p === "grok" || p === "xai") return ["grok"];
  if (p === "gemini") return ["gemini"];

  if (p === "antigravity" || p === "agy-cli" || p === "agy") {
    const out = [];
    if (/gemini|argon|carbon/.test(combined)) out.push("gemini");
    if (/claude|sonnet|opus|haiku|3p/.test(combined)) out.push("claude");
    if (/gpt|codex|openai|3p/.test(combined)) out.push("codex");
    return out.length > 0 ? [...new Set(out)] : ["other"];
  }

  const out = [];
  if (/claude|sonnet|opus|haiku/.test(combined)) out.push("claude");
  if (/gpt|codex|openai/.test(combined)) out.push("codex");
  if (/gemini/.test(combined)) out.push("gemini");
  if (/grok/.test(combined)) out.push("grok");
  return out.length > 0 ? [...new Set(out)] : ["other"];
}

function defaultFamilyForProvider(providerId) {
  const p = String(providerId || "").trim().toLowerCase();
  if (p === "claude") return "claude";
  if (p === "codex" || p === "chatgpt") return "codex";
  if (p === "gemini") return "gemini";
  if (p === "grok" || p === "xai") return "grok";
  return "other";
}

/**
 * Group all Magpie quotas (T3-supported + other providers) by model family for the
 * cross-provider comparison view inside the plugin UI. Never sums percentages across
 * different vendors because their quota scales are not comparable.
 */
export function buildModelGroups(
  t3Accounts,
  otherAccounts,
  exposed,
  cfg,
  nowMs = Date.now(),
) {
  const exposedKeys = new Set();
  for (const item of exposed || []) {
    const members = Array.isArray(item.memberKeys) ? item.memberKeys : [item.key];
    for (const k of members) exposedKeys.add(k);
  }

  const mergeWindowSecs = cfg?.resetMergeWindowSecs ?? DEFAULT_RESET_MERGE_WINDOW_SECS;
  const familyMaps = new Map(MODEL_FAMILIES.map((f) => [f.id, new Map()]));

  const addEntry = ({ familyId, channelKey, meta, quotaForSummary, balanceText, isSynced }) => {
    const map = familyMaps.get(familyId) || familyMaps.get("other");
    let ch = map.get(channelKey);
    if (!ch) {
      ch = {
        ...meta,
        totalAccounts: 0,
        syncedAccounts: 0,
        quotas: [],
        balances: [],
      };
      map.set(channelKey, ch);
    }
    ch.totalAccounts += 1;
    if (isSynced) ch.syncedAccounts += 1;
    if (quotaForSummary) ch.quotas.push(quotaForSummary);
    if (balanceText) ch.balances.push(balanceText);
  };

  for (const acc of t3Accounts || []) {
    const q = acc.quota;
    const isSynced = exposedKeys.has(acc.key);
    const providerLabel = PROVIDER_DISPLAY[acc.canonical] || q.name || acc.canonical;
    const planLabel = acc.plan || "";
    const windows = Array.isArray(q.windows) ? q.windows : [];

    const byFamily = new Map();
    for (const w of windows) {
      if (w?.text) continue;
      const fams = familiesForWindow(acc.canonical, w);
      const shared = fams.length > 1;
      for (const f of fams) {
        let bucket = byFamily.get(f);
        if (!bucket) {
          bucket = { windows: [], shared: false };
          byFamily.set(f, bucket);
        }
        bucket.windows.push(w);
        if (shared) bucket.shared = true;
      }
    }

    if (byFamily.size === 0) {
      const f = defaultFamilyForProvider(acc.canonical);
      byFamily.set(f, { windows: [], shared: false });
    }

    for (const [familyId, bucket] of byFamily.entries()) {
      const channelKey = `t3:${acc.canonical}:${acc.planKey}:${bucket.shared ? "shared" : "direct"}`;
      addEntry({
        familyId,
        channelKey,
        meta: {
          channelKey,
          provider: acc.canonical,
          providerLabel,
          plan: planLabel,
          t3Supported: true,
          sharedPool: bucket.shared,
        },
        quotaForSummary: { ...q, windows: bucket.windows },
        balanceText: "",
        isSynced,
      });
    }
  }

  for (const q of otherAccounts || []) {
    const providerId = String(q.provider || q.name || "other").trim().toLowerCase();
    const providerLabel = PROVIDER_DISPLAY[providerId] || String(q.name || q.provider || "其他");
    const planLabel = String(q.plan || "").trim();
    const windows = Array.isArray(q.windows) ? q.windows : [];

    const byFamily = new Map();
    for (const w of windows) {
      if (w?.text) continue;
      const fams = familiesForWindow(providerId, w);
      const shared = fams.length > 1;
      for (const f of fams) {
        let bucket = byFamily.get(f);
        if (!bucket) {
          bucket = { windows: [], shared: false };
          byFamily.set(f, bucket);
        }
        bucket.windows.push(w);
        if (shared) bucket.shared = true;
      }
    }

    if (byFamily.size === 0) {
      const f = defaultFamilyForProvider(providerId);
      byFamily.set(f, { windows: [], shared: false });
    }

    const bal = q.balance ? `${q.user || q.alias || providerLabel}: ${q.balance}` : "";
    for (const [familyId, bucket] of byFamily.entries()) {
      const channelKey = `other:${providerId}:${planLabel.toLowerCase() || "default"}`;
      addEntry({
        familyId,
        channelKey,
        meta: {
          channelKey,
          provider: providerId,
          providerLabel,
          plan: planLabel,
          t3Supported: false,
          sharedPool: bucket.shared,
        },
        quotaForSummary: { ...q, windows: bucket.windows },
        balanceText: bal,
        isSynced: false,
      });
    }
  }

  const groups = [];
  for (const fam of MODEL_FAMILIES) {
    const map = familyMaps.get(fam.id);
    if (!map || map.size === 0) continue;
    const channels = [];
    for (const ch of map.values()) {
      const summary = summarizeProviderQuotas(ch.quotas, nowMs, {
        resetStrategy: "earliest",
        resetMergeWindowSecs: mergeWindowSecs,
      });
      channels.push({
        provider: ch.provider,
        providerLabel: ch.providerLabel,
        plan: ch.plan,
        t3Supported: ch.t3Supported,
        sharedPool: ch.sharedPool,
        totalAccounts: ch.totalAccounts,
        syncedAccounts: ch.syncedAccounts,
        windows: summary.windows,
        unknown: summary.unknown,
        balances: ch.balances,
      });
    }
    // Order: T3-supported synced channels first, then other T3-supported, then non-T3.
    channels.sort(
      (a, b) =>
        Number(b.syncedAccounts > 0) - Number(a.syncedAccounts > 0) ||
        Number(b.t3Supported) - Number(a.t3Supported) ||
        a.providerLabel.localeCompare(b.providerLabel),
    );
    groups.push({
      id: fam.id,
      label: fam.label,
      channelCount: channels.length,
      channels,
    });
  }

  return groups;
}
