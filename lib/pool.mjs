// Quota pooling helpers mirroring Magpie's internal/gui/assets/quotaall.js rules:
// - Accounts with errors or no windows are left out (counted as unknown, never 0%).
// - Cached readings (asOf) whose resetsAt has already passed are excluded as stale.
// - A shorter window held by an exhausted longer window (used >= 100% and resetting later)
//   counts as 100% used.
// - Clusters nearby account reset timestamps into configurable "waves" (resetMergeWindowMins)
//   so UI and pooled exports accurately distinguish partial refills from full resets.

import { formatMergedLabel, t3Text } from "./i18n.mjs";

const SECOND_MS = 1_000;
const HOUR_MS = 3_600_000;
const DAY_MS = 86_400_000;

export const DEFAULT_RESET_MERGE_WINDOW_SECS = 300;

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
 * Returns the blocking reset timestamp (ms) if `win` cannot be spent because a
 * longer overall window on the same account is exhausted (used >= 100) and resets
 * later; otherwise returns 0.
 */
export function blockingLongerWindowResetMs(windows, win, nowMs = Date.now()) {
  const span = inferWindowSpanMs(win);
  if (span <= 0 || span >= 7 * DAY_MS) return 0;
  const winReset = win?.resetsAt ? Date.parse(win.resetsAt) : NaN;
  let blockUntilMs = 0;

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
      if (!Number.isFinite(winReset) || otherReset >= winReset) {
        if (otherReset > blockUntilMs) blockUntilMs = otherReset;
      }
    }
  }
  return blockUntilMs;
}

export function isHeldByLongerWindow(windows, win, nowMs = Date.now()) {
  return blockingLongerWindowResetMs(windows, win, nowMs) > 0;
}

/**
 * Cluster sorted reset timestamps into refill waves using an anchor-based window
 * (every account in a wave resets within `mergeWindowSecs` of the wave's earliest entry,
 * avoiding transitive chaining across wide spans).
 */
export function clusterResetWaves(
  resetTimes,
  totalAccounts,
  mergeWindowSecs = DEFAULT_RESET_MERGE_WINDOW_SECS,
) {
  if (!Array.isArray(resetTimes) || resetTimes.length === 0) return [];
  const windowMs = Math.max(0, Number(mergeWindowSecs) || 0) * SECOND_MS;
  const sorted = [...resetTimes].sort((a, b) => a.ms - b.ms);
  const denom = Math.max(1, Number(totalAccounts) || sorted.length);
  const rawWaves = [];

  for (const entry of sorted) {
    const last = rawWaves[rawWaves.length - 1];
    if (last && entry.ms - last.anchorMs <= windowMs) {
      last.endMs = entry.ms;
      last.items.push(entry);
    } else {
      rawWaves.push({ anchorMs: entry.ms, endMs: entry.ms, items: [entry] });
    }
  }

  return rawWaves.map((w) => {
    const usedSum = w.items.reduce((sum, item) => sum + clampPercent(item.used), 0);
    return {
      at: new Date(w.anchorMs).toISOString(),
      endAt: new Date(w.endMs).toISOString(),
      count: w.items.length,
      restorePercent: Math.round(usedSum / denom),
    };
  });
}

function resolveMergeWindowSecs({ resetMergeWindowSecs, resetMergeWindowMins } = {}) {
  if (resetMergeWindowSecs !== undefined && resetMergeWindowSecs !== null) {
    return Math.max(0, Number(resetMergeWindowSecs) || 0);
  }
  if (resetMergeWindowMins !== undefined && resetMergeWindowMins !== null) {
    return Math.max(0, Number(resetMergeWindowMins) || 0) * 60;
  }
  return DEFAULT_RESET_MERGE_WINDOW_SECS;
}

/**
 * Merge a list of Magpie Quota entries that belong to the same provider into
 * one aggregated window summary (with configurable reset wave clustering).
 */
export function summarizeProviderQuotas(
  quotas,
  nowMs = Date.now(),
  {
    resetStrategy = "earliest",
    resetMergeWindowSecs,
    resetMergeWindowMins,
  } = {},
) {
  const read = quotas.filter(
    (q) => !q?.error && ((Array.isArray(q?.windows) && q.windows.length > 0) || q?.balance),
  );
  const unknown = quotas.length - read.length;
  const plans = new Set(read.map((q) => String(q.plan || "").trim().toLowerCase()));
  const mergeWindowSecs = resolveMergeWindowSecs({ resetMergeWindowSecs, resetMergeWindowMins });
  const mergeWindowMs = mergeWindowSecs * SECOND_MS;
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
          unclockedUsedCount: 0,
        };
        byKey.set(key, acc);
      }

      if (isStaleWindow(q, w, nowMs)) {
        acc.stale += 1;
        continue;
      }

      acc.count += 1;
      const heldUntilMs =
        kind !== "u" && kind !== "b" ? blockingLongerWindowResetMs(q.windows, w, nowMs) : 0;
      const held = heldUntilMs > 0;
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

      const rawResetMs = w.resetsAt ? Date.parse(w.resetsAt) : NaN;
      const effectiveResetMs = held
        ? Math.max(heldUntilMs, Number.isFinite(rawResetMs) ? rawResetMs : 0)
        : rawResetMs;
      if (Number.isFinite(effectiveResetMs) && effectiveResetMs > nowMs) {
        acc.resetTimes.push({ ms: effectiveResetMs, used: effectiveUsed });
      } else if (effectiveUsed > 0) {
        acc.unclockedUsedCount += 1;
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
      const latestMs = sorted[sorted.length - 1].ms;
      const resetWaves = clusterResetWaves(sorted, acc.count, mergeWindowSecs);
      const firstWave = resetWaves[0];
      const resetCoverageComplete =
        acc.unclockedUsedCount === 0 && acc.stale === 0 && unknown === 0;
      const allResetsAligned =
        resetCoverageComplete && latestMs - earliestMs <= mergeWindowMs;

      base.soonestResetAt = firstWave.at;
      base.soonestResetCount = firstWave.count;
      base.soonestRestorePercent = firstWave.restorePercent;
      base.latestResetAt = new Date(latestMs).toISOString();
      base.averageResetAt = new Date(
        Math.round(sorted.reduce((sum, r) => sum + r.ms, 0) / sorted.length),
      ).toISOString();
      base.resetWaves = resetWaves;
      base.resetCoverageComplete = resetCoverageComplete;
      base.allResetsAligned = allResetsAligned;

      if (resetStrategy === "when-aligned") {
        if (allResetsAligned) {
          base.resetsAt = base.latestResetAt;
        }
      } else if (resetStrategy === "earliest") {
        base.resetsAt = base.soonestResetAt;
      } else if (resetStrategy === "latest") {
        // Only promise a full-refill timestamp when every consumed account in the
        // pool has a known, fresh reset time.
        if (resetCoverageComplete) {
          base.resetsAt = base.latestResetAt;
        }
      } else if (resetStrategy === "average") {
        base.resetsAt = base.averageResetAt;
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
  {
    resetStrategy = "when-aligned",
    resetMergeWindowSecs,
    resetMergeWindowMins,
    lang = "en",
  } = {},
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
    const summary = summarizeProviderQuotas(quotas, nowMs, {
      resetStrategy,
      resetMergeWindowSecs,
      resetMergeWindowMins,
    });
    const hasUnalignedResets = summary.windows.some(
      (w) => Boolean(w.resetsAt) && !w.allResetsAligned,
    );
    const resetHint =
      hasUnalignedResets && ["earliest", "latest", "average"].includes(resetStrategy)
        ? t3Text(lang, resetStrategy)
        : "";
    const label = formatMergedLabel({
      count: quotas.length,
      plan: group.plan,
      resetHint,
      lang,
    });

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
