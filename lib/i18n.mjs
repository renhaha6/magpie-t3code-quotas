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
    latest: "（最晚）",
    average: "（平均）",
  },
  "zh-TW": {
    accounts: "{n} 個帳號",
    from: "{base}（來自 {from}）",
    earliest: "（最早）",
    latest: "（最晚）",
    average: "（平均）",
  },
  en: {
    accounts: "{n} accounts",
    from: "{base} (via {from})",
    earliest: " (earliest)",
    latest: " (latest)",
    average: " (average)",
  },
};

export function t3Text(lang, key, vars) {
  const table = T3_TEXT[lang] || T3_TEXT.en;
  return fill(table[key] ?? T3_TEXT.en[key] ?? key, vars);
}

/**
 * T3 Code draws an account chip from the "email" field as
 * `local[0] + domain[0]` (split on "@"). A merged row should show its account
 * count there instead of the first letter of the label, so counts 10-99 append
 * `· @<secondDigit>`: "12 accounts · Max · @2" -> chip "12", keeping the label
 * readable when revealed. Counts 1-9 need no "@" (chip "5"); 100+ caps at "99".
 */
export function countChipEmail(count, label) {
  const n = Math.max(0, Math.floor(Number(count) || 0));
  const text = String(label || "").replace(/@/g, "＠");
  if (n < 10) return text;
  if (n > 99) return `99+ · ${text} · @9`;
  const digits = String(n);
  return text.startsWith(digits[0]) ? `${text} · @${digits[1]}` : `${digits[0]}@${digits[1]} · ${text}`;
}
