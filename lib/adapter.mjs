import crypto from "node:crypto";
import { clampPercent, inferWindowSpanMs, poolQuotasByPlan } from "./pool.mjs";

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

function accountDisplayLabel(q) {
  const user = String(q?.user || "").trim();
  const alias = String(q?.alias || "").trim();
  const seat = String(q?.seat || "").trim();
  const from = String(q?.from || "").trim();
  const base = user || alias || seat || String(q?.name || q?.provider || "account").trim();
  return from ? `${base} (${from})` : base;
}

/**
 * Inspect Magpie's /v1/magpie/quotas array and assign deterministic unique keys.
 * Splits into T3-native-supported accounts vs other Magpie providers (WorkBuddy, Kimi, GLM, etc.).
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
      String(q.plan || "").trim().toLowerCase(),
      String(q.from || "").trim().toLowerCase(),
    ].join(":");

    const count = (seen.get(identity) || 0) + 1;
    seen.set(identity, count);
    const key = count === 1 ? identity : `${identity}#${count}`;

    t3Accounts.push({
      key,
      canonical: mapped.canonical,
      t3Provider: mapped.t3Provider,
      displayLabel: accountDisplayLabel(q),
      quota: q,
    });
  }

  return { t3Accounts, otherAccounts };
}

/**
 * Apply user configuration (enabled providers, account allow/deny list, and output mode)
 * to produce the final list of accounts exposed to T3 Code.
 */
export function selectExposedAccounts(t3Accounts, config, nowMs = Date.now()) {
  const enabledProviders = config?.enabledProviders || {};
  const selectionMode = config?.selectionMode || "all-except";
  const selectedSet = new Set(config?.selectedAccounts || []);
  const excludedSet = new Set(config?.excludedAccounts || []);

  let filtered = t3Accounts.filter((item) => {
    if (enabledProviders[item.canonical] === false) return false;
    if (selectionMode === "only-selected") {
      return selectedSet.has(item.key);
    }
    return !excludedSet.has(item.key);
  });

  const mode = config?.mode || "per-account";
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
        const healthy = group.find((item) => !item.quota?.error);
        picked.push(healthy || group[0]);
      }
    }
    filtered = picked;
  } else if (mode === "pooled") {
    filtered = poolQuotasByPlan(filtered, nowMs);
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
  // Magpie names model-scoped Claude weekly windows like "7 days · Opus", "7 days · Sonnet", "7 days · Fable"
  const m = name.match(/(?:7\s*(?:d|days?)|weekly)\s*[·:\-/]\s*(.+)$/i);
  if (m && m[1]?.trim()) return m[1].trim();
  const rev = name.match(/^([A-Za-z0-9 ._-]+?)\s*[·:\-/]\s*(?:7\s*(?:d|days?)|weekly)$/i);
  if (rev && rev[1]?.trim()) return rev[1].trim();
  return null;
}

/**
 * Translate a Magpie Claude Quota into Anthropic `/api/oauth/usage` JSON shape
 * expected by T3 Code's `ClaudeUsage` schema in `cliproxyApi.ts`.
 */
export function buildClaudeUsagePayload(q) {
  const windows = (q.windows || []).filter((w) => w && !w.text && !w.lane);
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

/**
 * Translate a Magpie Codex Quota into ChatGPT `/backend-api/wham/usage` JSON shape
 * expected by T3 Code's `CodexUsage` schema in `cliproxyApi.ts`.
 */
export function buildCodexUsagePayload(q) {
  const windows = (q.windows || []).filter((w) => w && !w.text && !w.lane);
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

/**
 * Translate a Magpie Grok Quota into Grok `/v1/billing?format=credits` JSON shape
 * expected by T3 Code's `GrokUsageResponse` schema.
 */
export function buildGrokUsagePayload(q, nowMs = Date.now()) {
  const windows = (q.windows || []).filter((w) => w && !w.text && !w.lane);
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
    const durationMs = inferWindowSpanMs(win) || (weekly ? 7 * 86_400_000 : monthly ? 30 * 86_400_000 : 0);
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

/**
 * Translate a Magpie Antigravity Quota into Google `retrieveUserQuotaSummary` JSON shape
 * expected by T3 Code's `antigravitySummaryWindows` parser.
 */
export function buildAntigravitySummaryPayload(q) {
  const windows = (q.windows || []).filter((w) => w && !w.text && !w.lane);
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

/**
 * Handle CLIProxyAPI `POST /v0/management/api-call` request from T3 Code.
 * Always returns `{ status_code, body }` (body is a JSON string).
 */
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
  const hasReadableWindows = Array.isArray(q.windows) && q.windows.some((w) => w && !w.text);

  // For Antigravity userinfo lookup, return 404 so T3 Code keeps the listed email instead of
  // replacing identity with an unlinked synthetic Google sub hash.
  if (targetUrl.includes("googleapis.com/oauth2/v2/userinfo")) {
    return { status_code: 404, body: "{}" };
  }

  // Strictly read-only: refuse credit redemption attempts with a clear message.
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
      body: JSON.stringify(buildClaudeUsagePayload(q)),
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
      body: JSON.stringify(buildCodexUsagePayload(q)),
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
      body: JSON.stringify(buildAntigravitySummaryPayload(q)),
    };
  }

  return {
    status_code: 404,
    body: JSON.stringify({ error: `Unsupported api-call URL: ${targetUrl}` }),
  };
}
