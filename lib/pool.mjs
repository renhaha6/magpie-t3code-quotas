// Quota pooling helpers mirroring Magpie's internal/gui/assets/quotaall.js rules:
// - Accounts with errors or no windows are left out (counted as unknown, never 0%).
// - Cached readings (asOf) whose resetsAt has already passed are excluded as stale.
// - A shorter window held by an exhausted longer window (used >= 100% and resetting later)
//   counts as 100% used.
// - Tracks both soonest single-account refill and latest full-reset timestamps so UI and
//   pooled exports never mislead the user into thinking every account resets at once.

const HOUR_MS = 3_600_000;
const DAY_MS = 86_400_000;

export function clampPercent(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(100, n));
}

export function inferWindowSpanMs(win) {
  const name = String(win?.name || "").toLowerCase();
  if (/\b5\s*(?:h|hr|hrs|hour|hours)\b|five.?hour|session/.test(name)) return 5 * HOUR_MS;
  if (/\b(?:1\s*d|24\s*h|daily|day)\b/.test(name)) return DAY_MS;
  if (/\b7\s*(?:d|day|days)\b|weekly|\bweek\b/.test(name)) return 7 * DAY_MS;
  if (/\b(?:30\s*d|monthly|month)\b/.test(name)) return 30 * DAY_MS;
  return 0;
}

export function isStaleWindow(quota, win, nowMs = Date.now()) {
  if (!quota?.asOf || !win?.resetsAt) return false;
  const resetMs = Date.parse(win.resetsAt);
  return Number.isFinite(resetMs) && resetMs <= nowMs;
}

/**
 * Returns true if `win` cannot be spent because a longer overall window on the
 * same account is exhausted (used >= 100) and resets later.
 */
export function isHeldByLongerWindow(windows, win, nowMs = Date.now()) {
  const span = inferWindowSpanMs(win);
  if (span <= 0 || span >= 7 * DAY_MS) return false;
  const winReset = win?.resetsAt ? Date.parse(win.resetsAt) : NaN;

  for (const other of windows || []) {
    if (other === win || other?.text || other?.unlimited) continue;
    const otherName = String(other?.name || "").toLowerCase();
    if (otherName.includes("·") || otherName.includes("extra") || otherName.includes("credit")) {
      continue;
    }
    const otherSpan = inferWindowSpanMs(other);
    if (otherSpan <= span) continue;
    if (clampPercent(other.used) < 100) continue;
    const otherReset = other?.resetsAt ? Date.parse(other.resetsAt) : NaN;
    if (Number.isFinite(otherReset) && otherReset > nowMs) {
      if (!Number.isFinite(winReset) || otherReset >= winReset) return true;
    }
  }
  return false;
}

/**
 * Merge a list of Magpie Quota entries that belong to the same provider into
 * one aggregated window summary (with both earliest single-account refill and
 * latest full-reset times).
 */
export function summarizeProviderQuotas(
  quotas,
  nowMs = Date.now(),
  { resetStrategy = "earliest" } = {},
) {
  const read = quotas.filter(
    (q) => !q?.error && ((Array.isArray(q?.windows) && q.windows.length > 0) || q?.balance),
  );
  const unknown = quotas.length - read.length;
  const plans = new Set(read.map((q) => String(q.plan || "").trim().toLowerCase()));
  const byKey = new Map();

  for (const q of read) {
    const planKey = String(q.plan || "").trim().toLowerCase();
    for (const w of q.windows || []) {
      if (w?.text) continue;
      const kind = w.unlimited
        ? "u"
        : Number(w.limit) > 0
          ? "c"
          : w.balance != null
            ? "b"
            : w.used != null
              ? `p:${planKey}`
              : "";
      if (!kind) continue;

      const key = JSON.stringify([w.name || "", w.pool || "", w.lane || "", w.unit || "", kind]);
      let acc = byKey.get(key);
      if (!acc) {
        acc = {
          sample: w,
          kind,
          plan: String(q.plan || "").trim(),
          count: 0,
          stale: 0,
          held: 0,
          amount: 0,
          limit: 0,
          balance: 0,
          usedSum: 0,
          resetTimes: [],
        };
        byKey.set(key, acc);
      }

      if (isStaleWindow(q, w, nowMs)) {
        acc.stale += 1;
        continue;
      }

      acc.count += 1;
      const held = kind !== "u" && kind !== "b" && isHeldByLongerWindow(q.windows, w, nowMs);
      if (held) acc.held += 1;

      const effectiveUsed = held ? 100 : clampPercent(w.used);
      if (kind === "c") {
        acc.amount += held ? Number(w.limit) : Math.max(0, Number(w.amount) || 0);
        acc.limit += Number(w.limit);
      } else if (kind === "b") {
        acc.balance += Number(w.balance) || 0;
      } else if (kind !== "u") {
        acc.usedSum += effectiveUsed;
      }

      const resetMs = w.resetsAt ? Date.parse(w.resetsAt) : NaN;
      if (Number.isFinite(resetMs) && resetMs > nowMs) {
        acc.resetTimes.push({ ms: resetMs, used: effectiveUsed });
      }
    }
  }

  const windows = [];
  for (const acc of byKey.values()) {
    if (acc.count === 0) continue;
    if (acc.kind === "u" && acc.count < read.length) continue;
    const base = {
      name: acc.sample.name,
      pool: acc.sample.pool || undefined,
      lane: acc.sample.lane || undefined,
      unit: acc.sample.unit || undefined,
      accounts: acc.count,
      stale: acc.stale,
      held: acc.held,
    };
    if (acc.kind === "u") {
      base.unlimited = true;
      base.used = 0;
      base.remaining = 100;
    } else if (acc.kind === "c") {
      const used = acc.limit > 0 ? Math.round((1000 * acc.amount) / acc.limit) / 10 : 0;
      base.amount = acc.amount;
      base.limit = acc.limit;
      base.used = clampPercent(used);
      base.remaining = clampPercent(100 - base.used);
    } else if (acc.kind === "b") {
      base.balance = acc.balance;
      base.used = 0;
      base.remaining = 100;
    } else {
      const used = Math.round((10 * acc.usedSum) / acc.count) / 10;
      base.used = clampPercent(used);
      base.remaining = clampPercent(100 - base.used);
      if (plans.size > 1 && acc.plan) base.plan = acc.plan;
    }

    if (acc.resetTimes.length > 0) {
      const sorted = [...acc.resetTimes].sort((a, b) => a.ms - b.ms);
      const earliestMs = sorted[0].ms;
      // Count accounts resetting within 2 minutes of the earliest reset as one refill wave.
      const soonestResetCount = sorted.filter((r) => r.ms - earliestMs <= 120_000).length;
      const latestMs = sorted[sorted.length - 1].ms;

      base.soonestResetAt = new Date(earliestMs).toISOString();
      base.soonestResetCount = soonestResetCount;
      base.latestResetAt = new Date(latestMs).toISOString();

      if (resetStrategy === "earliest") {
        base.resetsAt = base.soonestResetAt;
      } else if (resetStrategy === "latest") {
        base.resetsAt = base.latestResetAt;
      }
      // resetStrategy === "none" intentionally omits resetsAt so a single merged row
      // never misleads the user into thinking all accounts reset together.
    }

    windows.push(base);
  }

  return {
    total: quotas.length,
    readable: read.length,
    unknown,
    windows,
  };
}

/**
 * Group accounts by (canonicalProvider, plan) and collapse each group into one
 * pooled synthetic Magpie Quota entry suitable for forwarding to T3 Code.
 */
export function poolQuotasByPlan(
  items,
  nowMs = Date.now(),
  { resetStrategy = "none" } = {},
) {
  const groups = new Map();
  for (const item of items) {
    const planNorm = String(item.quota.plan || "").trim().toLowerCase();
    const groupKey = `${item.canonical}:${planNorm}`;
    let group = groups.get(groupKey);
    if (!group) {
      group = {
        canonical: item.canonical,
        t3Provider: item.t3Provider,
        plan: String(item.quota.plan || "").trim(),
        planKey: item.planKey || `${item.canonical}:${planNorm || "default"}`,
        items: [],
      };
      groups.set(groupKey, group);
    }
    group.items.push(item);
  }

  const out = [];
  for (const group of groups.values()) {
    const quotas = group.items.map((x) => x.quota);
    if (quotas.length === 1) {
      out.push({
        ...group.items[0],
        memberKeys: [group.items[0].key],
      });
      continue;
    }
    const summary = summarizeProviderQuotas(quotas, nowMs, { resetStrategy });
    const planLabel = group.plan ? ` · ${group.plan}` : "";
    const resetHint =
      resetStrategy === "earliest"
        ? "（最早单号重置）"
        : resetStrategy === "latest"
          ? "（全部重置）"
          : "";
    const label = `全部 ${quotas.length} 个账号${planLabel}${resetHint}`;

    const totalResets = quotas.reduce(
      (sum, q) => sum + (Number(q?.resets?.count) > 0 ? Number(q.resets.count) : 0),
      0,
    );
    const allResetCards = quotas.flatMap((q) =>
      Array.isArray(q?.resets?.each) ? q.resets.each : [],
    );

    const syntheticQuota = {
      provider: group.canonical,
      name: group.items[0].quota.name || group.canonical,
      kind: "subscription",
      plan: group.plan,
      user: label,
      alias: label,
      windows: summary.windows,
      error: summary.readable === 0 ? quotas.find((q) => q.error)?.error || "unavailable" : "",
      ...(totalResets > 0
        ? {
            resets: {
              count: totalResets,
              each: allResetCards,
            },
          }
        : {}),
    };

    out.push({
      key: `pooled:${group.canonical}:${group.plan.toLowerCase() || "default"}`,
      canonical: group.canonical,
      t3Provider: group.t3Provider,
      planKey: group.planKey,
      displayLabel: label,
      quota: syntheticQuota,
      pooledCount: quotas.length,
      memberKeys: group.items.map((x) => x.key),
    });
  }
  return out;
}
