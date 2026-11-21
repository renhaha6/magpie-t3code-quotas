// Language handling shared by the T3 Code export and the control page.
// Supported: zh-CN, zh-TW, en. "auto" follows Magpie's UI language (reported by
// the control page), then the system locale, then English.

export const SUPPORTED_LANGS = ["zh-CN", "zh-TW", "en"];
export const VALID_LANGUAGE_SETTINGS = ["auto", ...SUPPORTED_LANGS];

export function normalizeLang(raw) {
  const s = String(raw || "").trim().replace(/_/g, "-").toLowerCase();
  if (!s || s === "c" || s === "posix") return "";
  if (s.startsWith("zh")) {
    return /(?:-tw|-hk|-mo|-hant)/.test(s) ? "zh-TW" : "zh-CN";
  }
  return s.startsWith("en") ? "en" : s.length >= 2 ? "en" : "";
}

export function systemLang(env = process.env) {
  for (const k of ["LC_ALL", "LC_MESSAGES", "LANG", "LANGUAGE"]) {
    const v = normalizeLang(String(env?.[k] || "").split(/[.:@]/)[0]);
    if (v) return v;
  }
  try {
    return normalizeLang(Intl.DateTimeFormat().resolvedOptions().locale) || "en";
  } catch {
    return "en";
  }
}

export function resolveLang(cfg, env = process.env) {
  if (SUPPORTED_LANGS.includes(cfg?.language)) return cfg.language;
  return normalizeLang(cfg?.magpieLang) || systemLang(env);
}

function fill(template, vars = {}) {
  return String(template).replace(/\{(\w+)\}/g, (_, k) => (vars[k] ?? `{${k}}`));
}

// Strings that end up inside T3 Code (account labels of merged rows).
const T3_TEXT = {
  "zh-CN": {
    accounts: "{n} 个账号",
    from: "{base}（来自 {from}）",
    earliest: "（最早）",
    latest: "（全回血）",
    average: "（平均）",
  },
  "zh-TW": {
    accounts: "{n} 個帳號",
    from: "{base}（來自 {from}）",
    earliest: "（最早）",
    latest: "（全回血）",
    average: "（平均）",
  },
  en: {
    accounts: "{n} accounts",
    from: "{base} (via {from})",
    earliest: " (earliest)",
    latest: " (full refill)",
    average: " (average)",
  },
};

export function t3Text(lang, key, vars) {
  const table = T3_TEXT[lang] || T3_TEXT.en;
  return fill(table[key] ?? T3_TEXT.en[key] ?? key, vars);
}

/**
 * Format the display label / email for a merged row without any synthetic "@" hacks.
 * T3 Code's chip takes `local[0]` when there is no "@":
 * - 1..9 accounts: "5 accounts · Max" -> chip "5" (exact count).
 * - 10+ accounts: putting "12 ..." first would truncate the chip to a misleading "1",
 *   so we lead with an ASCII plan name ("Max · 12 accounts" -> chip "M") or "×" ("×12 accounts").
 */
export function formatMergedLabel({ count, plan = "", resetHint = "", lang = "en" }) {
  const n = Math.max(0, Math.floor(Number(count) || 0));
  const cleanPlan = String(plan || "").trim().replace(/@/g, "＠");
  const countText = t3Text(lang, "accounts", { n });

  if (n < 10) {
    return `${countText}${cleanPlan ? ` · ${cleanPlan}` : ""}${resetHint}`;
  }
  if (/^[A-Za-z]/.test(cleanPlan)) {
    return `${cleanPlan} · ${countText}${resetHint}`;
  }
  return `×${countText}${cleanPlan ? ` · ${cleanPlan}` : ""}${resetHint}`;
}
