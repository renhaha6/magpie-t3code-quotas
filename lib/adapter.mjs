import crypto from "node:crypto";
import { DEFAULT_AUTO_POOL_THRESHOLD } from "./config.mjs";
import { t3Text } from "./i18n.mjs";
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

export const OTHER_CARRIER_KEY = "other:magpie-carrier";
export const OTHER_ANTIGRAVITY_CARRIER_KEY = "other:magpie-antigravity";

export function parseProviderRef(rawProvider) {
  const raw = String(rawProvider || "").trim();
  const norm = raw.toLowerCase();
  const lastSlash = raw.lastIndexOf("/");
  if (lastSlash > 0 && lastSlash < raw.length - 1) {
    return {
      raw,
      norm,
      remotePrefix: raw.slice(0, lastSlash).trim(),
      baseProvider: raw.slice(lastSlash + 1).trim().toLowerCase(),
    };
  }
  return { raw, norm, remotePrefix: "", baseProvider: norm };
}

export function mapProvider(rawProvider) {
  const { norm, remotePrefix, baseProvider } = parseProviderRef(rawProvider);
  const direct = T3_PROVIDER_MAP.get(norm);
  if (direct) return { ...direct, remotePrefix: "" };
  if (remotePrefix) {
    const nested = T3_PROVIDER_MAP.get(baseProvider);
    if (nested) return { ...nested, remotePrefix };
  }
  return null;
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

function inferRemoteLabel(q, remotePrefix = "") {
  const explicit = String(q?.from || "").trim();
  if (explicit) return explicit;
  const prefix = String(remotePrefix || "").trim();
  if (!prefix) return "";
  const name = String(q?.name || "");
  for (const part of name.split("·")) {
    const trimmed = part.trim();
    if (trimmed && trimmed.toLowerCase() === prefix.toLowerCase()) {
      return trimmed;
    }
  }
  return prefix;
}

function accountDisplayLabel(q, lang = "en", remotePrefix = "") {
  const user = String(q?.user || "").trim();
  const alias = String(q?.alias || "").trim();
  const seat = String(q?.seat || "").trim();
  const from = inferRemoteLabel(q, remotePrefix);
  const base = user || alias || seat || String(q?.name || q?.provider || "account").trim();
  return from ? t3Text(lang, "from", { base, from }) : base;
}

/**
 * Inspect Magpie's /v1/magpie/quotas array and assign stable deterministic keys
 * keyed on (provider, user, source) — intentionally omitting `plan` so upgrading
 * a plan (e.g. Plus -> Pro) does not break saved account ticks.
 */
export function classifyMagpieQuotas(rawQuotas, { lang = "en" } = {}) {
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

    const sourceTag = inferRemoteLabel(q, mapped.remotePrefix);
    const identity = [
      mapped.canonical,
      String(q.user || q.alias || q.seat || q.name || "default").trim().toLowerCase(),
      sourceTag.toLowerCase(),
    ].join(":");

    const count = (seen.get(identity) || 0) + 1;
    seen.set(identity, count);
    const key = count === 1 ? identity : `${identity}#${count}`;
    const plan = String(q.plan || "").trim();

    t3Accounts.push({
      key,
      canonical: mapped.canonical,
      t3Provider: mapped.t3Provider,
      remotePrefix: mapped.remotePrefix || "",
      from: sourceTag,
      plan,
      planKey: planKeyFor(mapped.canonical, plan),
      displayLabel: accountDisplayLabel(q, lang, mapped.remotePrefix),
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

function otherWindowUsedPercent(w) {
  if (!w || w.text === true || w.lane || w.unlimited === true) return undefined;
  if (typeof w.used === "number" && Number.isFinite(w.used)) return clampPercent(w.used);
  if (typeof w.remaining === "number" && Number.isFinite(w.remaining)) {
    return clampPercent(100 - w.remaining);
  }
  if (
    typeof w.amount === "number" &&
    Number.isFinite(w.amount) &&
    typeof w.limit === "number" &&
    Number.isFinite(w.limit) &&
    w.limit > 0
  ) {
    return clampPercent((w.amount / w.limit) * 100);
  }
  return undefined;
}

function headlineOtherWindow(q, nowMs) {
  if (!q || q.lapsed) return null;
  let best = null;
  let bestUsed = -Infinity;
  for (const w of q.windows || []) {
    if (!w || isStaleWindow(q, w, nowMs)) continue;
    const used = otherWindowUsedPercent(w);
    if (used === undefined) continue;
    if (used > bestUsed) {
      best = { window: w, used };
      bestUsed = used;
    }
  }
  if (!best && q.error) return null;
  return best;
}

function scopedSlug(label) {
  return String(label || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_");
}

function uniqueScopedLabel(base, seenSlugs) {
  let label = base;
  let suffix = 2;
  while (seenSlugs.has(scopedSlug(label))) {
    label = `${base} #${suffix}`;
    suffix += 1;
  }
  seenSlugs.add(scopedSlug(label));
  return label;
}

function otherWindowResetIso(w, nowMs) {
  const iso = toIsoOrNull(w?.resetsAt);
  if (iso) return iso;
  if (typeof w?.resetSecs === "number" && Number.isFinite(w.resetSecs) && w.resetSecs > 0) {
    return new Date(nowMs + w.resetSecs * 1000).toISOString();
  }
  return null;
}

function collectDrawableOtherAccounts(otherAccounts, nowMs) {
  const list = Array.isArray(otherAccounts) ? otherAccounts : [];
  const drawable = [];
  for (const q of list) {
    const headline = headlineOtherWindow(q, nowMs);
    if (!headline) continue;
    const name = String(q.name || q.provider || "Other").trim();
    drawable.push({ q, headline, name });
  }
  const nameCounts = new Map();
  for (const entry of drawable) {
    nameCounts.set(entry.name, (nameCounts.get(entry.name) || 0) + 1);
  }
  return drawable.map((entry) => {
    const user = String(entry.q.user || entry.q.alias || "").trim();
    const label =
      (nameCounts.get(entry.name) || 0) > 1 && user ? `${entry.name} · ${user}` : entry.name;
    return { ...entry, label };
  });
}

/**
 * Package non-native Magpie providers (WorkBuddy, Qoder CN, MClaw, Devin, etc.)
 * into one synthetic Claude account ("Magpie") using `weekly_scoped` limits so
 * they can be viewed inside T3 Code's Usage -> Limits panel without colliding
 * with native Claude accounts.
 */
export function buildOtherProvidersCarrier(otherAccounts, nowMs = Date.now()) {
  const drawable = collectDrawableOtherAccounts(otherAccounts, nowMs);
  if (drawable.length === 0) return null;

  const seenSlugs = new Set();
  const limits = [];
  for (const { headline, label } of drawable) {
    limits.push({
      kind: "weekly_scoped",
      percent: headline.used,
      resets_at: otherWindowResetIso(headline.window, nowMs),
      scope: { model: { display_name: uniqueScopedLabel(label, seenSlugs) } },
    });
  }

  return {
    key: OTHER_CARRIER_KEY,
    canonical: "claude",
    t3Provider: "claude",
    remotePrefix: "",
    from: "",
    plan: "",
    planKey: "claude:magpie-other",
    displayLabel: "Magpie",
    syntheticOtherCarrier: true,
    carriedCount: limits.length,
    memberKeys: [OTHER_CARRIER_KEY],
    fallbackActive: false,
    quota: {
      provider: "magpie",
      name: "Magpie",
      kind: "subscription",
      windows: [],
      _syntheticLimits: limits,
    },
  };
}

/**
 * Package non-native Magpie providers into one synthetic Antigravity account ("Magpie")
 * using custom `groups` buckets so each row keeps its real provider & window name
 * without any forced `Weekly ·` prefix.
 */
export function buildOtherProvidersAntigravityCarrier(otherAccounts, nowMs = Date.now()) {
  const drawable = collectDrawableOtherAccounts(otherAccounts, nowMs);
  if (drawable.length === 0) return null;

  const groups = drawable.map(({ headline, label }, index) => {
    const w = headline.window;
    const wName = String(w?.name || "").trim();
    const lower = wName.toLowerCase();
    const isWeekly = /\b(?:7\s*(?:d|day|days)|weekly|week)\b/.test(lower);
    const is5h = /\b5\s*(?:h|hr|hrs|hour|hours)\b|five.?hour|^session$/i.test(lower);
    const resetTime = otherWindowResetIso(w, nowMs);
    const remainingFraction = Math.max(0, Math.min(1, (100 - headline.used) / 100));

    return {
      displayName: label,
      buckets: [
        {
          bucketId: `magpie-other-${index}-${shortHash(`${label}:${wName}`)}`,
          displayName: wName || "Quota",
          ...(isWeekly ? { window: "weekly" } : is5h ? { window: "5h" } : {}),
          remainingFraction,
          ...(resetTime ? { resetTime } : {}),
        },
      ],
    };
  });

  return {
    key: OTHER_ANTIGRAVITY_CARRIER_KEY,
    canonical: "antigravity",
    t3Provider: "antigravity",
    remotePrefix: "",
    from: "",
    plan: "",
    planKey: "antigravity:magpie-other",
    displayLabel: "Magpie",
    syntheticOtherCarrier: true,
    carriedCount: groups.length,
    memberKeys: [OTHER_ANTIGRAVITY_CARRIER_KEY],
    fallbackActive: false,
    quota: {
      provider: "magpie",
      name: "Magpie",
      kind: "subscription",
      windows: [],
      _syntheticGroups: groups,
    },
  };
}

/**
 * Export each drawable non-native provider account as an individual Grok (`xai`)
 * entry so users who do not use Grok get a dedicated, clean section in T3 Code
 * where every vendor/account has its own row and accurate period label.
 */
export function buildOtherProvidersGrokAccounts(otherAccounts, nowMs = Date.now()) {
  const drawable = collectDrawableOtherAccounts(otherAccounts, nowMs);
  if (drawable.length === 0) return [];

  const seenLabels = new Map();
  return drawable.map(({ q, headline, label }) => {
    const norm = label.toLowerCase();
    const count = (seenLabels.get(norm) || 0) + 1;
    seenLabels.set(norm, count);
    const uniqueLabel = count === 1 ? label : `${label} #${count}`;
    const key = `other:grok:${shortHash(`${q.provider || ""}:${uniqueLabel}`)}`;

    const w = headline.window;
    const wName = String(w?.name || "").trim();
    const resetIso = otherWindowResetIso(w, nowMs);
    const endMs = resetIso ? Date.parse(resetIso) : NaN;
    // Keep all non-native accounts in the same Grok period bucket ("Subscription")
    // so T3 Code renders one full-width pooled bar instead of fragmented cards with
    // empty column gaps.
    const period = { type: "USAGE_PERIOD_TYPE_CUSTOM" };
    if (Number.isFinite(endMs)) {
      period.end = new Date(endMs).toISOString();
      const weekly = /\b(?:7\s*(?:d|day|days)|weekly|week)\b/i.test(wName);
      const monthly = /\b(?:30\s*(?:d|day|days)|monthly|month)\b/i.test(wName);
      const durationMs =
        inferWindowSpanMs(w) ||
        (weekly ? 7 * 86_400_000 : monthly ? 30 * 86_400_000 : 0);
      // Only supply period.start when the real window duration is known; fabricating
      // start = nowMs makes T3 Code report 0% elapsed and false "Ahead of pace" ticks.
      if (durationMs > 0) {
        period.start = new Date(endMs - durationMs).toISOString();
      }
    }

    return {
      key,
      canonical: "grok",
      t3Provider: "xai",
      remotePrefix: "",
      from: "",
      plan: "",
      planKey: "grok:magpie-other",
      displayLabel: uniqueLabel,
      syntheticOtherGrok: true,
      carriedCount: 1,
      memberKeys: [key],
      fallbackActive: false,
      quota: {
        ...q,
        user: uniqueLabel,
        _syntheticGrokPayload: {
          config: {
            creditUsagePercent: headline.used,
            currentPeriod: period,
          },
        },
      },
    };
  });
}

export function resolveOtherProvidersTarget(config) {
  const raw = config?.otherProvidersT3Target;
  if (raw === "grok" || raw === "claude" || raw === "antigravity" || raw === "off") {
    return raw;
  }
  return config?.includeOtherProvidersInT3 === false ? "off" : "grok";
}

export function buildOtherProviderExports(otherAccounts, target, nowMs = Date.now()) {
  if (target === "off" || !Array.isArray(otherAccounts) || otherAccounts.length === 0) {
    return [];
  }
  if (target === "claude") {
    const carrier = buildOtherProvidersCarrier(otherAccounts, nowMs);
    return carrier ? [carrier] : [];
  }
  if (target === "antigravity") {
    const carrier = buildOtherProvidersAntigravityCarrier(otherAccounts, nowMs);
    return carrier ? [carrier] : [];
  }
  if (target === "grok") {
    return buildOtherProvidersGrokAccounts(otherAccounts, nowMs);
  }
  return [];
}

/**
 * Apply user configuration (provider/plan/account filters + mode + pooled reset strategy)
 * to produce the final list of accounts exposed to T3 Code.
 */
export function selectExposedAccounts(
  t3Accounts,
  config,
  nowMs = Date.now(),
  { lang = "en", otherAccounts = null } = {},
) {
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
      lang,
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
            lang,
          }),
        );
      } else {
        adaptive.push(...group);
      }
    }
    filtered = adaptive;
  }

  const otherTarget = resolveOtherProvidersTarget(config);
  if (otherTarget !== "off" && Array.isArray(otherAccounts) && otherAccounts.length > 0) {
    filtered.push(...buildOtherProviderExports(otherAccounts, otherTarget, nowMs));
  }

  return filtered;
}

/**
 * Build CLIProxyAPI `GET /v0/management/auth-files` payload matching
 * T3 Code's `apps/server/src/usage/cliproxyApi.ts` AuthFiles schema.
 *
 * Note: T3 Code abbreviates `email` into 1-2 initials (privacy chip) and only
 * renders full plain-text names when `email` is omitted and the label is placed
 * in `id` (`displayName: account.email ? null : hubAccountName(account)`).
 */
export function buildAuthFilesResponse(exposedAccounts, { showAccountNames = false } = {}) {
  const seenIds = new Set();
  const uniqueId = (base) => {
    const clean = String(base || "Account").trim() || "Account";
    let candidate = clean;
    let suffix = 2;
    while (seenIds.has(candidate.toLowerCase())) {
      candidate = `${clean} #${suffix}`;
      suffix += 1;
    }
    seenIds.add(candidate.toLowerCase());
    return candidate;
  };

  const files = exposedAccounts.map((item) => {
    const q = item.quota;
    const authIndex = item.key;

    if (item.syntheticOtherCarrier) {
      return {
        id: uniqueId("Magpie"),
        auth_index: authIndex,
        provider: item.t3Provider,
        disabled: false,
        ...(item.t3Provider === "antigravity" ? { project_id: "magpie-other-providers" } : {}),
      };
    }

    if (item.syntheticOtherGrok) {
      return {
        id: uniqueId(item.displayLabel),
        auth_index: authIndex,
        provider: "xai",
        disabled: false,
      };
    }

    const hasRemoteSource = Boolean(item.from || q.from || item.remotePrefix);
    const label = hasRemoteSource
      ? String(item.displayLabel || q.user || "").trim()
      : String(q.user || item.displayLabel || "").trim();
    const base = showAccountNames && label
      ? {
          id: uniqueId(label),
          auth_index: authIndex,
          provider: item.t3Provider,
          disabled: false,
        }
      : {
          id: authIndex,
          auth_index: authIndex,
          provider: item.t3Provider,
          disabled: false,
          ...(label ? { email: label } : {}),
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
  if (Array.isArray(q?._syntheticLimits)) {
    return {
      five_hour: null,
      seven_day: null,
      limits: q._syntheticLimits,
    };
  }
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
  if (q?._syntheticGrokPayload) {
    return q._syntheticGrokPayload;
  }
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
  if (Array.isArray(q?._syntheticGroups)) {
    return { groups: q._syntheticGroups };
  }
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
  const hasReadableWindows =
    freshWindowsOf(q, nowMs).length > 0 ||
    (Array.isArray(q?._syntheticLimits) && q._syntheticLimits.length > 0) ||
    (Array.isArray(q?._syntheticGroups) && q._syntheticGroups.length > 0) ||
    Boolean(q?._syntheticGrokPayload);

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
  { id: "other", label: "Other" },
];

const PROVIDER_DISPLAY = {
  claude: "Claude",
  codex: "Codex (ChatGPT)",
  antigravity: "Antigravity",
  grok: "Grok",
  gemini: "Gemini CLI",
};

function familiesForWindow(providerId, win) {
  const p = parseProviderRef(providerId).baseProvider;
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
  const p = parseProviderRef(providerId).baseProvider;
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
    const providerLabel = PROVIDER_DISPLAY[providerId] || String(q.name || q.provider || "Other");
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
