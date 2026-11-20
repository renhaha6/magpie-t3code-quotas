// Embedded single-page control UI served by the local adapter HTTP server.
// Uses relative ./api/* endpoints with a per-launch X-UI-Token header so it works
// safely in Magpie Desktop (sandboxed WKWebView/WebView2) and `magpie web`.
// The client script is a real function serialized with toString(), so it needs no
// template-literal escaping. Copy lives in uitext.mjs (zh-CN / zh-TW / en).

import { UI_MESSAGES } from "./uitext.mjs";

function jsonForScript(value) {
  return JSON.stringify(value).replace(/</g, "\\u003c").replace(/\u2028|\u2029/g, " ");
}

const CSS = `
  :root {
    color-scheme: light dark;
    --bg: #ffffff; --fg: #111827; --muted: #6b7280; --card: #f8fafc; --card-2: #f1f5f9;
    --line: #e5e7eb; --accent: #2563eb; --accent-soft: rgba(37, 99, 235, 0.12);
    --ok: #16a34a; --warn: #d97706; --err: #dc2626;
    --font: -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif;
    --mono: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  }
  :root[data-theme="dark"] {
    --bg: #111318; --fg: #f3f4f6; --muted: #9ca3af; --card: #1a1d24; --card-2: #222631;
    --line: #2a2f3a; --accent: #60a5fa; --accent-soft: rgba(96, 165, 250, 0.16);
    --ok: #4ade80; --warn: #fbbf24; --err: #f87171;
  }
  * { box-sizing: border-box; }
  [hidden] { display: none !important; }
  body { margin: 0; padding: 20px 24px 40px; background: var(--bg); color: var(--fg);
    font: 13px/1.5 var(--font); -webkit-font-smoothing: antialiased; }
  .wrap { max-width: 880px; margin: 0 auto; display: grid; gap: 14px; }
  .head { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 10px; }
  h1 { margin: 0; font-size: 18px; font-weight: 600; }
  h2 { margin: 0; font-size: 14px; font-weight: 600; }
  .muted { color: var(--muted); }
  .small { font-size: 12px; }
  .card { background: var(--card); border: 1px solid var(--line); border-radius: 10px; padding: 14px 16px; }
  .row { display: flex; flex-wrap: wrap; align-items: center; gap: 8px 10px; }
  .between { justify-content: space-between; }
  .badge { display: inline-flex; align-items: center; gap: 6px; padding: 2px 9px; border-radius: 999px;
    font-size: 12px; border: 1px solid var(--line); background: var(--bg); }
  .tag { display: inline-block; padding: 0 6px; border-radius: 4px; font-size: 11px; line-height: 17px;
    border: 1px solid var(--line); background: var(--bg); white-space: nowrap; font-weight: 400; }
  .tag.ok { color: var(--ok); border-color: color-mix(in srgb, var(--ok) 45%, var(--line)); }
  .tag.warn { color: var(--warn); border-color: color-mix(in srgb, var(--warn) 45%, var(--line)); }
  .tag.accent { color: var(--accent); border-color: color-mix(in srgb, var(--accent) 45%, var(--line)); }
  .tag.muted { color: var(--muted); }
  .dot { width: 7px; height: 7px; border-radius: 50%; background: var(--muted); display: inline-block; }
  .dot.ok { background: var(--ok); } .dot.warn { background: var(--warn); } .dot.err { background: var(--err); }
  button, input, select { font: inherit; color: inherit; }
  button { background: var(--bg); border: 1px solid var(--line); border-radius: 6px; padding: 5px 11px;
    cursor: pointer; white-space: nowrap; }
  button:hover:not(:disabled) { border-color: var(--muted); }
  button.primary { background: var(--accent-soft); border-color: var(--accent); color: var(--accent); font-weight: 500; }
  button.danger { color: var(--err); border-color: color-mix(in srgb, var(--err) 55%, var(--line)); }
  button.sm { padding: 3px 9px; font-size: 12px; }
  button:disabled { opacity: 0.45; cursor: default; }
  input[type="text"], input[type="number"], select { width: 100%; min-width: 0; height: 30px;
    background: var(--bg); border: 1px solid var(--line); border-radius: 6px; padding: 4px 8px; }
  .inline-input { display: flex; gap: 6px; align-items: center; min-width: 0; }
  .inline-input input { flex: 1 1 auto; }
  .inline-input select { width: 72px; flex: 0 0 auto; }
  .chip-row { display: flex; flex-wrap: wrap; gap: 4px; }
  .chip-btn { padding: 2px 8px; font-size: 12px; }
  .chip-btn.active, .segmented button.active { background: var(--accent-soft); border-color: var(--accent);
    color: var(--accent); font-weight: 500; }
  .kv { display: grid; grid-template-columns: 80px 1fr auto; gap: 8px 10px; align-items: center; margin-top: 10px; }
  .kv code { font-family: var(--mono); font-size: 12px; background: var(--bg); border: 1px solid var(--line);
    border-radius: 6px; padding: 4px 8px; overflow-x: auto; white-space: nowrap; }
  .hint { font-size: 12px; color: var(--muted); margin-top: 6px; }
  .preset-grid { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 8px; margin-top: 10px; }
  .preset-card { text-align: left; display: grid; gap: 3px; align-content: start; padding: 10px 11px;
    border-radius: 8px; white-space: normal; min-width: 0; transition: border-color .12s, background-color .12s; }
  .preset-card.active { border-color: var(--accent); background: var(--accent-soft); box-shadow: inset 0 0 0 1px var(--accent); }
  .preset-head { display: flex; align-items: center; justify-content: space-between; gap: 4px; }
  .preset-title { font-weight: 600; }
  .preset-desc { font-size: 11.5px; line-height: 1.4; color: var(--muted); }
  .preset-live { font-size: 12px; color: var(--accent); margin-top: 8px; }
  .preset-live:empty { display: none; }
  .crowd-banner { margin-top: 8px; padding: 7px 10px; border-radius: 8px; font-size: 12px;
    border: 1px solid color-mix(in srgb, var(--warn) 45%, var(--line));
    background: color-mix(in srgb, var(--warn) 10%, var(--bg));
    display: flex; align-items: center; justify-content: space-between; gap: 8px; flex-wrap: wrap; }
  .reset-row { display: flex; flex-wrap: wrap; align-items: center; gap: 8px 12px; margin-top: 12px;
    padding-top: 12px; border-top: 1px solid var(--line); }
  .segmented { display: inline-flex; gap: 0; }
  .segmented button { border-radius: 0; margin-left: -1px; padding: 3px 10px; font-size: 12px;
    display: inline-flex; align-items: center; gap: 5px; }
  .segmented button:first-child { border-radius: 6px 0 0 6px; margin-left: 0; }
  .segmented button:last-child { border-radius: 0 6px 6px 0; }
  .segmented .tag { font-size: 10px; line-height: 14px; padding: 0 4px; }
  .check { display: inline-flex; align-items: center; gap: 7px; cursor: pointer; }
  .adv-details { margin-top: 12px; padding-top: 10px; border-top: 1px solid var(--line); }
  .adv-summary { cursor: pointer; list-style: none; font-size: 12px; color: var(--muted); display: flex; flex-wrap: wrap;
    align-items: center; justify-content: space-between; gap: 6px; user-select: none; }
  .adv-summary::-webkit-details-marker { display: none; }
  .adv-summary > span:first-child::before, details.card > summary h2::before {
    content: "▸"; display: inline-block; margin-right: 6px; font-size: 11px; color: var(--muted); transition: transform .12s;
  }
  details[open] > .adv-summary > span:first-child::before, details.card[open] > summary h2::before { transform: rotate(90deg); }
  .grid2 { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px 16px; margin-top: 12px; }
  .field { display: grid; gap: 5px; min-width: 0; align-content: start; }
  .field > label { font-size: 12px; color: var(--muted); }
  .field > label[title] { cursor: help; text-decoration: underline dotted color-mix(in srgb, var(--muted) 60%, transparent); text-underline-offset: 3px; }
  .switches { display: flex; flex-wrap: wrap; gap: 8px 18px; margin-top: 12px; padding-top: 12px; border-top: 1px solid var(--line); }
  .dirty-bar { margin-top: 10px; padding: 7px 10px; border-radius: 8px; display: flex; align-items: center;
    justify-content: space-between; gap: 8px; border: 1px solid color-mix(in srgb, var(--accent) 45%, var(--line));
    background: var(--accent-soft); }
  .tabs { display: inline-flex; gap: 3px; padding: 2px; border-radius: 8px; background: var(--card-2); border: 1px solid var(--line); }
  .tab-btn { border: 1px solid transparent; background: transparent; border-radius: 6px; padding: 2px 10px;
    font-size: 12px; color: var(--muted); }
  .tab-btn.active { background: var(--bg); color: var(--fg); border-color: var(--line); font-weight: 500; }
  .quick-bar { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 10px; }
  .warn-box { margin-top: 8px; padding: 7px 10px; border-radius: 8px; font-size: 12px;
    border: 1px solid color-mix(in srgb, var(--warn) 45%, var(--line)); background: color-mix(in srgb, var(--warn) 10%, var(--bg)); }
  .prov-block { border: 1px solid var(--line); border-radius: 8px; background: var(--bg); margin-top: 10px; overflow: hidden; }
  .prov-block.disabled { opacity: 0.55; }
  .prov-head { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 8px;
    padding: 8px 12px; background: var(--card-2); border-bottom: 1px solid var(--line); }
  .plan-group { border-bottom: 1px solid var(--line); }
  .plan-group:last-child { border-bottom: none; }
  .plan-head { display: flex; align-items: center; justify-content: space-between; gap: 8px; padding: 8px 12px; }
  .plan-left { display: flex; flex-wrap: wrap; align-items: center; gap: 6px 10px; min-width: 0; }
  .plan-count { color: var(--muted); font-size: 12px; }
  .acct-list { border-top: 1px dashed var(--line); background: var(--card); }
  .acct-row { display: grid; grid-template-columns: 22px minmax(140px, 1fr) 1.4fr auto; gap: 8px; align-items: center;
    padding: 6px 12px 6px 30px; border-bottom: 1px solid var(--line); }
  .acct-row:last-child { border-bottom: none; }
  .acct-row.dim { opacity: 0.55; }
  .acct-sub { font-size: 11px; color: var(--muted); }
  .model-row { display: grid; grid-template-columns: minmax(160px, 1fr) 1.6fr auto; gap: 8px 10px;
    align-items: center; padding: 8px 12px; border-bottom: 1px solid var(--line); }
  .model-row:last-child { border-bottom: none; }
  .win-chip { display: inline-block; margin: 2px 4px 2px 0; padding: 1px 6px; border-radius: 5px; font-size: 12px;
    font-family: var(--mono); background: var(--bg); border: 1px solid var(--line); }
  details.card > summary { cursor: pointer; list-style: none; display: flex; justify-content: space-between; align-items: center; }
  details.card > summary::-webkit-details-marker { display: none; }
  table { width: 100%; border-collapse: collapse; margin-top: 8px; }
  th { text-align: left; font-size: 12px; font-weight: 500; color: var(--muted); }
  th, td { padding: 6px 8px; border-bottom: 1px solid var(--line); vertical-align: middle; }
  .err-text { color: var(--err); font-size: 12px; }
  .ok-text { color: var(--ok); }
  .warn-text { color: var(--warn); }
  .toast { font-size: 12px; min-height: 18px; }
  @media (max-width: 760px) {
    .preset-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
    .kv, .grid2 { grid-template-columns: 1fr; }
    .acct-row { grid-template-columns: 22px 1fr; padding-left: 14px; }
    .model-row { grid-template-columns: 1fr; }
  }
`;

const BODY = `
<div class="wrap">
  <div class="head">
    <div>
      <h1 data-t="title"></h1>
      <div class="muted small" data-t="subtitle"></div>
    </div>
    <div class="row">
      <span class="badge"><span class="dot" id="statusDot"></span><span id="statusText" data-t="loading"></span></span>
      <button type="button" class="sm" id="refreshBtn" data-t="refresh" data-t-title="refreshTip"></button>
    </div>
  </div>

  <div class="card">
    <div class="row between">
      <div class="row"><h2 data-t="connTitle"></h2><span class="small" id="t3WireStatus"></span></div>
      <div class="row">
        <button type="button" class="sm" id="wireBtn" data-t="sync"></button>
        <button type="button" class="sm" id="unwireBtn" data-t="remove"></button>
      </div>
    </div>
    <details id="manualDetails" style="margin-top:8px">
      <summary class="muted small" style="cursor:pointer" data-t="manual"></summary>
      <div class="kv">
        <span class="muted" data-t="url"></span><code id="hubUrl">-</code>
        <button type="button" class="sm" id="copyUrlBtn" data-t="copy"></button>
        <span class="muted" data-t="key"></span><code id="hubKeyDisplay">••••••••</code>
        <div class="row" style="gap:6px">
          <button type="button" class="sm" id="toggleKeyBtn" data-t="show"></button>
          <button type="button" class="sm" id="copyKeyBtn" data-t="copy"></button>
          <button type="button" class="sm" id="regenKeyBtn" data-t="regen"></button>
        </div>
        <span class="muted" data-t="ssh"></span><code id="sshCmd">-</code>
        <button type="button" class="sm" id="copySshBtn" data-t="copy"></button>
      </div>
      <div class="hint" data-t="manualHint"></div>
      <div class="hint" id="magpieSourceInfo"></div>
    </details>
  </div>

  <div class="card">
    <div class="row between">
      <h2 data-t="modeTitle"></h2>
      <span class="toast" id="saveToast"></span>
    </div>
    <div class="preset-grid">
      <button type="button" class="preset-card" data-preset="auto">
        <span class="preset-head"><span class="preset-title" data-t="modeAuto"></span><span class="tag ok" data-t="recommended"></span></span>
        <span class="preset-desc" id="autoCardDesc"></span>
      </button>
      <button type="button" class="preset-card" data-preset="pooled">
        <span class="preset-head"><span class="preset-title" data-t="modePooled"></span></span>
        <span class="preset-desc" data-t="modePooledDesc"></span>
      </button>
      <button type="button" class="preset-card" data-preset="per-account">
        <span class="preset-head"><span class="preset-title" data-t="modePer"></span><span class="tag warn" id="perAccountBadge" data-t="crowded" hidden></span></span>
        <span class="preset-desc" data-t="modePerDesc"></span>
      </button>
      <button type="button" class="preset-card" data-preset="active-only">
        <span class="preset-head"><span class="preset-title" data-t="modeActive"></span></span>
        <span class="preset-desc" data-t="modeActiveDesc"></span>
      </button>
    </div>
    <div class="preset-live" id="autoPreview"></div>
    <div class="crowd-banner" id="crowdedBanner" hidden>
      <span id="crowdedBannerText"></span>
      <button type="button" class="sm primary" id="switchToAutoBtn" data-t="useSmart"></button>
    </div>

    <div class="reset-row">
      <label class="check" data-t-title="resetToggleTip">
        <input type="checkbox" id="resetToggle"><span data-t="resetToggle"></span>
      </label>
      <div class="segmented" id="resetPicks">
        <button type="button" data-pick="latest" data-t-title="pickLatestTip"><span data-t="pickLatest"></span><span class="tag ok" data-t="recommended"></span></button>
        <button type="button" data-pick="earliest" data-t-title="pickEarliestTip"><span data-t="pickEarliest"></span></button>
        <button type="button" data-pick="average" data-t-title="pickAverageTip"><span data-t="pickAverage"></span></button>
      </div>
      <span class="muted small" id="resetNote"></span>
    </div>

    <details id="advancedDetails" class="adv-details">
      <summary class="adv-summary"><span data-t="advanced"></span><span id="advSummaryHint"></span></summary>
      <div class="grid2">
        <div class="field">
          <label for="autoThresholdInput" data-t="threshold" data-t-title="thresholdTip"></label>
          <div class="inline-input">
            <input id="autoThresholdInput" type="number" min="1" max="50" step="1" placeholder="4">
            <div class="chip-row">
              <button type="button" class="chip-btn" data-ath="2">2</button>
              <button type="button" class="chip-btn" data-ath="4">4</button>
              <button type="button" class="chip-btn" data-ath="6">6</button>
              <button type="button" class="chip-btn" data-ath="8">8</button>
            </div>
          </div>
        </div>
        <div class="field">
          <label for="resetWindowInput" data-t="window" data-t-title="windowTip"></label>
          <div class="inline-input">
            <input id="resetWindowInput" type="number" min="0" max="86400" step="1" placeholder="5">
            <select id="resetWindowUnit">
              <option value="sec" data-t="unitSec"></option>
              <option value="min" data-t="unitMin"></option>
            </select>
          </div>
        </div>
        <div class="field">
          <label for="languageSelect" data-t="language"></label>
          <select id="languageSelect">
            <option value="auto" data-t="langAuto"></option>
            <option value="zh-CN">简体中文</option>
            <option value="zh-TW">繁體中文</option>
            <option value="en">English</option>
          </select>
        </div>
        <div class="field">
          <label for="portInput" data-t="port" data-t-title="portTip"></label>
          <div class="inline-input">
            <input id="portInput" type="number" min="1" max="65535" step="1" placeholder="3478">
            <button type="button" class="sm" id="switchPortBtn" data-t="switchPort"></button>
          </div>
        </div>
        <div class="field" style="grid-column:1/-1">
          <label for="magpieUrlInput" data-t="magpieUrl"></label>
          <input id="magpieUrlInput" type="text" data-t-ph="magpieUrlPh">
        </div>
      </div>
      <div class="dirty-bar" id="dirtyBar" hidden>
        <span class="small" data-t="unsaved"></span>
        <div class="row">
          <button type="button" class="sm" id="discardTextBtn" data-t="discard"></button>
          <button type="button" class="sm primary" id="saveTextBtn" data-t="save"></button>
        </div>
      </div>
      <div class="switches">
        <label class="check" data-t-title="swAutoSyncTip"><input type="checkbox" id="autoSyncNewCheck"><span data-t="swAutoSync"></span></label>
        <label class="check" data-t-title="swAutoWireTip"><input type="checkbox" id="autoWireCheck"><span data-t="swAutoWire"></span></label>
        <label class="check" data-t-title="swKeptTip"><input type="checkbox" id="keptOnlyCheck"><span data-t="swKept"></span></label>
      </div>
    </details>
  </div>

  <div class="card">
    <div class="row between">
      <div class="row">
        <h2 data-t="accTitle"></h2>
        <div class="tabs" role="tablist">
          <button type="button" class="tab-btn active" id="tabProviderBtn" role="tab" data-t="tabProvider"></button>
          <button type="button" class="tab-btn" id="tabModelBtn" role="tab" data-t="tabModel"></button>
        </div>
      </div>
      <span class="muted small" id="t3Count"></span>
    </div>
    <div id="t3Error" class="err-text" style="margin-top:6px"></div>
    <div id="providerView">
      <div class="quick-bar">
        <button type="button" class="sm" id="quickAllBtn" data-t="quickAll" data-t-title="quickAllTip"></button>
        <button type="button" class="sm" id="quickTopPlanBtn" data-t="quickTop" data-t-title="quickTopTip"></button>
        <button type="button" class="sm" id="quickActiveBtn" data-t="quickActive" data-t-title="quickActiveTip"></button>
        <button type="button" class="sm" id="quickNoneBtn" data-t="quickNone" data-t-title="quickNoneTip"></button>
      </div>
      <div id="zeroSelectedWarn" class="warn-box" data-t="zeroSelected" hidden></div>
      <div id="treeWrap"></div>
    </div>
    <div id="modelView" hidden>
      <div class="hint" data-t="modelInfo"></div>
      <div id="modelWrap"></div>
    </div>
  </div>

  <details class="card" id="otherCard">
    <summary><h2 data-t="otherTitle"></h2><span class="muted small" id="otherCount"></span></summary>
    <div id="otherTableWrap"></div>
  </details>
</div>
`;

/* eslint-disable no-undef */
function clientMain(UI_TOKEN, MESSAGES) {
  const $ = (id) => document.getElementById(id);
  const PROVIDER_NAMES = { claude: "Claude", codex: "Codex", antigravity: "Antigravity", grok: "Grok" };
  const MODE_KEYS = { auto: "modeAuto", pooled: "modePooled", "per-account": "modePer", "active-only": "modeActive" };
  const PICKS = ["latest", "earliest", "average"];

  function normLang(raw) {
    const s = String(raw || "").trim().replace(/_/g, "-").toLowerCase();
    if (!s) return "";
    if (s.startsWith("zh")) return /(?:-tw|-hk|-mo|-hant)/.test(s) ? "zh-TW" : "zh-CN";
    return "en";
  }

  const query = new URLSearchParams(location.search);
  const magpieLang = normLang(query.get("lang"));
  let lang = magpieLang || normLang(navigator.language) || "en";
  let magpieLangReported = false;

  function t(key, vars) {
    const table = MESSAGES[lang] || MESSAGES.en;
    const raw = table[key] ?? MESSAGES.en[key] ?? key;
    return vars ? raw.replace(/\{(\w+)\}/g, (_, k) => (vars[k] ?? "")) : raw;
  }

  function applyStatic() {
    document.documentElement.lang = lang;
    document.title = t("title") + " · Magpie";
    document.querySelectorAll("[data-t]").forEach((el) => { el.textContent = t(el.dataset.t); });
    document.querySelectorAll("[data-t-title]").forEach((el) => { el.title = t(el.dataset.tTitle); });
    document.querySelectorAll("[data-t-ph]").forEach((el) => { el.placeholder = t(el.dataset.tPh); });
  }

  (function applyTheme() {
    const theme = query.get("theme");
    if (theme === "dark" || theme === "light") document.documentElement.dataset.theme = theme;
    else if (matchMedia("(prefers-color-scheme: dark)").matches) document.documentElement.dataset.theme = "dark";
    const rawTokens = query.get("tokens");
    if (!rawTokens) return;
    try {
      const tokens = JSON.parse(decodeURIComponent(escape(atob(rawTokens))));
      const map = { bg: "--bg", fg: "--fg", muted: "--muted", card: "--card", line: "--line", accent: "--accent" };
      for (const [k, cssVar] of Object.entries(map)) {
        if (tokens[k]) document.documentElement.style.setProperty(cssVar, tokens[k]);
      }
    } catch { /* keep defaults */ }
  })();

  let state = null;
  let activeTab = "provider";
  let keyVisible = false;
  let unwireArmed = false;
  let unwireTimer = null;
  let saveDebounce = null;
  let pendingPatch = null;
  let pendingToast = "";
  let magpieUrlDirty = false;
  const expandedPlans = new Set();

  function esc(s) {
    return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }
  const errText = (err) => String(err?.message || err);
  const provName = (id) => PROVIDER_NAMES[id] || id;

  function showToast(text, level) {
    const el = $("saveToast");
    el.textContent = text;
    el.className = "toast " + (level === "err" ? "err-text" : level === "warn" ? "warn-text" : "ok-text");
    if (text) setTimeout(() => { if (el.textContent === text) el.textContent = ""; }, 3500);
  }

  async function apiFetch(path, opts = {}) {
    const headers = { "X-UI-Token": UI_TOKEN, ...(opts.headers || {}) };
    const res = await fetch(path, { cache: "no-store", ...opts, headers });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || ("HTTP " + res.status));
    return data;
  }

  const postJson = (path, body) => apiFetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body || {}),
  });

  async function copyText(text, btn) {
    try {
      await navigator.clipboard.writeText(text);
      btn.textContent = t("copied");
      setTimeout(() => { btn.textContent = t("copy"); }, 1200);
    } catch {
      showToast(t("copyFail"), "err");
    }
  }

  function dur(ms) {
    if (!Number.isFinite(ms) || ms <= 0) return "";
    if (ms < 60000) return t("secs", { n: Math.max(1, Math.round(ms / 1000)) });
    const mins = Math.round(ms / 60000);
    if (mins < 60) return t("mins", { n: Math.max(1, mins) });
    const hrs = mins / 60;
    if (hrs < 48) return t("hours", { n: hrs < 10 ? hrs.toFixed(1).replace(/\.0$/, "") : Math.round(hrs) });
    return t("days", { n: (hrs / 24).toFixed(1).replace(/\.0$/, "") });
  }
  const until = (iso) => dur(Date.parse(iso) - Date.now());

  function mergeWindowText(secs) {
    const s = Math.max(0, Math.round(Number(secs) || 0));
    if (s === 0) return t("windowOff");
    if (s < 60) return t("secs", { n: s });
    if (s % 60 === 0) return t("mins", { n: s / 60 });
    return t("mins", { n: Math.floor(s / 60) }) + " " + t("secs", { n: s % 60 });
  }

  function valueTag(w) {
    if (w.unlimited) return t("unlimited");
    if (w.balance != null) return String(w.balance) + (w.unit ? " " + w.unit : "");
    return t("left", { p: typeof w.remaining === "number" ? Math.round(w.remaining) + "%" : (w.display || "-") });
  }

  function accountChips(windows) {
    if (!Array.isArray(windows) || windows.length === 0) return '<span class="muted small">' + esc(t("noData")) + "</span>";
    return windows.map((w) => {
      const reset = w.resetsAt ? until(w.resetsAt) : "";
      return '<span class="win-chip">' + esc(w.name || w.pool || t("quota")) + " " + esc(valueTag(w)) +
        (reset ? " · " + esc(t("resetIn", { d: reset })) : "") + "</span>";
    }).join("");
  }

  function waveTooltip(w, mergeSecs) {
    const waves = Array.isArray(w.resetWaves) ? w.resetWaves : [];
    if (waves.length === 0) return "";
    const lines = [t("waveHead", { w: mergeWindowText(mergeSecs) })];
    waves.forEach((wave, i) => {
      lines.push(t("waveLine", {
        i: i + 1,
        d: until(wave.at) || t("soon"),
        c: wave.count,
        n: w.accounts || wave.count,
        r: wave.restorePercent > 0 ? " +" + wave.restorePercent + "%" : "",
      }));
    });
    return lines.join("\n");
  }

  function summaryChips(windows, totalAccounts, mergeSecs, maxItems) {
    if (!Array.isArray(windows) || windows.length === 0) return '<span class="muted small">' + esc(t("noData")) + "</span>";
    return windows.slice(0, maxItems).map((w) => {
      const n = Number(w.accounts) || Number(totalAccounts) || 1;
      let note = "";
      if (n > 1 && w.allResetsAligned && w.latestResetAt) {
        const d = until(w.latestResetAt);
        if (d) note = t("allResetIn", { d });
      } else if (n > 1 && Array.isArray(w.resetWaves) && w.resetWaves.length > 0) {
        const first = w.resetWaves[0];
        const last = w.resetWaves[w.resetWaves.length - 1];
        const firstD = until(first.at);
        const lastD = until(last.endAt || last.at);
        if (firstD) {
          note = t("waveIn", { d: firstD, c: first.count, n }) + (first.restorePercent > 0 ? " +" + first.restorePercent + "%" : "");
          if (w.resetWaves.length > 1 && lastD && lastD !== firstD) note += " / " + t("allIn", { d: lastD });
        }
      } else if (w.soonestResetAt) {
        const d = until(w.soonestResetAt);
        if (d) note = t("resetIn", { d });
      }
      const tip = waveTooltip(w, mergeSecs);
      return '<span class="win-chip"' + (tip ? ' title="' + esc(tip) + '"' : "") + ">" +
        esc(w.name || w.pool || t("quota")) + " " + esc(valueTag(w)) + (note ? " · " + esc(note) : "") + "</span>";
    }).join("");
  }

  function queueAutoSave(patch, toastMsg) {
    pendingPatch = { ...(pendingPatch || {}), ...patch };
    if (toastMsg) pendingToast = toastMsg;
    clearTimeout(saveDebounce);
    saveDebounce = setTimeout(flushAutoSave, 220);
  }

  async function flushAutoSave() {
    if (!pendingPatch) return;
    const toSend = pendingPatch;
    const toastMsg = pendingToast || t("saved");
    pendingPatch = null;
    pendingToast = "";
    try {
      await postJson("./api/config", toSend);
      showToast(toastMsg, "ok");
      await loadStatus(false);
    } catch (err) {
      showToast(t("saveFail", { e: errText(err) }), "err");
    }
  }

  function planTierRank(plan) {
    const p = String(plan || "").trim().toLowerCase();
    if (!p) return 25;
    if (/ultra|promax|500|20x/.test(p)) return 60;
    if (/enterprise/.test(p)) return 55;
    if (/\bmax\b|pro\s*200|pro200|heavy/.test(p)) return 50;
    if (/supergrok|\bpro\b|prolite|business|team/.test(p)) return 40;
    if (/plus|standard|basic/.test(p)) return 30;
    if (/\bgo\b|starter|mini/.test(p)) return 20;
    if (/free|trial/.test(p)) return 10;
    return 25;
  }

  function togglePlan(planGroup, checked) {
    const cfg = state.config;
    const selectedPlans = new Set(cfg.selectedPlans || []);
    const excludedPlans = new Set(cfg.excludedPlans || []);
    const selectedAccounts = new Set(cfg.selectedAccounts || []);
    const excludedAccounts = new Set(cfg.excludedAccounts || []);
    for (const a of planGroup.accounts) {
      selectedAccounts.delete(a.key);
      excludedAccounts.delete(a.key);
    }
    if ((cfg.selectionMode || "all-except") === "only-selected") {
      if (checked) selectedPlans.add(planGroup.planKey); else selectedPlans.delete(planGroup.planKey);
    } else if (checked) excludedPlans.delete(planGroup.planKey);
    else excludedPlans.add(planGroup.planKey);
    const patch = {
      selectedPlans: [...selectedPlans],
      excludedPlans: [...excludedPlans],
      selectedAccounts: [...selectedAccounts],
      excludedAccounts: [...excludedAccounts],
    };
    Object.assign(state.config, patch);
    queueAutoSave(patch);
  }

  function toggleSingleAccount(acct, checked) {
    const cfg = state.config;
    const selectedAccounts = new Set(cfg.selectedAccounts || []);
    const excludedAccounts = new Set(cfg.excludedAccounts || []);
    const excludedPlans = new Set(cfg.excludedPlans || []);
    if ((cfg.selectionMode || "all-except") === "only-selected") {
      if (checked) { selectedAccounts.add(acct.key); excludedAccounts.delete(acct.key); }
      else { selectedAccounts.delete(acct.key); excludedAccounts.add(acct.key); }
    } else if (checked) {
      excludedAccounts.delete(acct.key);
      if (excludedPlans.has(acct.planKey)) selectedAccounts.add(acct.key);
    } else {
      selectedAccounts.delete(acct.key);
      excludedAccounts.add(acct.key);
    }
    const patch = { selectedAccounts: [...selectedAccounts], excludedAccounts: [...excludedAccounts] };
    Object.assign(state.config, patch);
    queueAutoSave(patch);
  }

  function statusBadge(acct) {
    if (acct.syncStatus === "synced") return '<span class="tag ok">' + esc(t("badgeSynced")) + "</span>";
    if (acct.syncStatus === "pooled") return '<span class="tag ok">' + esc(t("badgePooled")) + "</span>";
    if (acct.syncStatus === "fallback") return '<span class="tag warn" title="' + esc(t("badgeFallbackTip")) + '">' + esc(t("badgeFallback")) + "</span>";
    return '<span class="tag muted">' + esc(t("badgeHidden")) + "</span>";
  }

  function el(tag, cls, text) {
    const node = document.createElement(tag);
    if (cls) node.className = cls;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  function renderTree() {
    const wrap = $("treeWrap");
    const tree = state.accountTree || [];
    const mergeSecs = state.config?.resetMergeWindowSecs ?? 300;
    $("zeroSelectedWarn").hidden = !(tree.length > 0 && state.exposedCount === 0);
    if (tree.length === 0) {
      wrap.innerHTML = '<div class="muted" style="padding:10px 0">' + esc(t("treeEmpty")) + "</div>";
      return;
    }
    wrap.innerHTML = "";
    for (const prov of tree) {
      const block = el("div", "prov-block" + (prov.enabled ? "" : " disabled"));
      const head = el("div", "prov-head");
      const left = el("label", "check");
      const provCb = el("input");
      provCb.type = "checkbox";
      provCb.checked = prov.enabled;
      provCb.onchange = () => {
        const next = { ...state.config.enabledProviders, [prov.id]: provCb.checked };
        state.config.enabledProviders = next;
        queueAutoSave({ enabledProviders: next });
      };
      left.append(provCb, el("b", "", provName(prov.id)));
      const modeTag = prov.effectiveMode === "auto-pooled" ? t("provMerged")
        : prov.effectiveMode === "auto-per-account" ? t("provEach") : "";
      const stat = el("span", "muted small", prov.enabled
        ? t("provSynced", { s: prov.syncedAccounts, t: prov.totalAccounts }) + (modeTag ? " · " + modeTag : "")
        : t("provOff"));
      head.append(left, stat);
      block.appendChild(head);

      for (const pg of prov.plans) {
        if (!expandedPlans.has("init:" + pg.planKey)) {
          expandedPlans.add("init:" + pg.planKey);
          if (pg.totalCount <= 4) expandedPlans.add(pg.planKey);
        }
        const isOpen = expandedPlans.has(pg.planKey);
        const pDiv = el("div", "plan-group");
        const pHead = el("div", "plan-head");
        const pLeft = el("div", "plan-left");
        const planLabel = el("label", "check");
        const planCb = el("input");
        planCb.type = "checkbox";
        planCb.disabled = !prov.enabled;
        planCb.checked = pg.selectedCount === pg.totalCount && pg.totalCount > 0;
        planCb.indeterminate = pg.selectedCount > 0 && pg.selectedCount < pg.totalCount;
        planCb.onchange = () => togglePlan(pg, planCb.checked);
        const planName = el("span", "", pg.plan || t("defaultPlan"));
        planName.style.fontWeight = "500";
        planLabel.append(planCb, planName, el("span", "plan-count", "×" + pg.totalCount));
        const chips = el("div");
        chips.innerHTML = summaryChips(pg.summary?.windows || [], pg.totalCount, mergeSecs, 3);
        pLeft.append(planLabel, chips);
        const expandBtn = el("button", "sm", isOpen ? t("collapse") : t("expand"));
        expandBtn.type = "button";
        expandBtn.onclick = () => {
          if (expandedPlans.has(pg.planKey)) expandedPlans.delete(pg.planKey); else expandedPlans.add(pg.planKey);
          renderTree();
        };
        pHead.append(pLeft, expandBtn);
        pDiv.appendChild(pHead);

        if (isOpen) {
          const list = el("div", "acct-list");
          for (const a of pg.accounts) {
            const row = el("div", "acct-row" + (!prov.enabled || !a.checked ? " dim" : ""));
            const cb = el("input");
            cb.type = "checkbox";
            cb.disabled = !prov.enabled;
            cb.checked = a.checked;
            cb.onchange = () => toggleSingleAccount(a, cb.checked);
            const info = el("div");
            const age = a.asOf ? Date.now() - Date.parse(a.asOf) : NaN;
            const ageText = !Number.isFinite(age) || age < 0 ? "" : age < 60000 ? t("ageNow") : t("ago", { d: dur(age) });
            const sub = [a.last ? t("inUse") : "", ageText].filter(Boolean).join(" · ");
            info.innerHTML = "<div>" + esc(a.displayLabel) + "</div>" + (sub ? '<div class="acct-sub">' + esc(sub) + "</div>" : "");
            const wins = el("div");
            wins.innerHTML = a.error ? '<span class="err-text">' + esc(a.error) + "</span>" : accountChips(a.windows);
            const badge = el("div");
            badge.innerHTML = statusBadge(a);
            row.append(cb, info, wins, badge);
            list.appendChild(row);
          }
          pDiv.appendChild(list);
        }
        block.appendChild(pDiv);
      }
      wrap.appendChild(block);
    }
  }

  function renderModelView() {
    const wrap = $("modelWrap");
    const groups = state.modelGroups || [];
    const mergeSecs = state.config?.resetMergeWindowSecs ?? 300;
    if (groups.length === 0) {
      wrap.innerHTML = '<div class="muted" style="padding:10px 0">' + esc(t("modelEmpty")) + "</div>";
      return;
    }
    wrap.innerHTML = "";
    for (const g of groups) {
      const block = el("div", "prov-block");
      const head = el("div", "prov-head");
      head.append(el("b", "", g.id === "other" ? t("familyOther") : g.label), el("span", "muted small", t("channels", { n: g.channelCount })));
      block.appendChild(head);
      for (const ch of g.channels) {
        const row = el("div", "model-row");
        const left = el("div");
        const sub = [t("nAccounts", { n: ch.totalAccounts })];
        if (ch.sharedPool) sub.push(t("sharedPool"));
        if (ch.unknown > 0) sub.push(t("nErrors", { n: ch.unknown }));
        left.innerHTML = '<div style="font-weight:500">' + esc(ch.providerLabel + (ch.plan ? " · " + ch.plan : "")) + "</div>" +
          '<div class="acct-sub">' + esc(sub.join(" · ")) + "</div>";
        const mid = el("div");
        if (Array.isArray(ch.windows) && ch.windows.length > 0) mid.innerHTML = summaryChips(ch.windows, ch.totalAccounts, mergeSecs, 4);
        else if (Array.isArray(ch.balances) && ch.balances.length > 0) mid.innerHTML = ch.balances.map((b) => '<span class="win-chip">' + esc(b) + "</span>").join("");
        else mid.innerHTML = '<span class="muted small">' + esc(t("noData")) + "</span>";
        const right = el("div");
        if (!ch.t3Supported) right.innerHTML = '<span class="tag muted">' + esc(t("tagNotT3")) + "</span>";
        else if (ch.syncedAccounts === ch.totalAccounts && ch.totalAccounts > 0) right.innerHTML = '<span class="tag ok">' + esc(t("tagSynced")) + "</span>";
        else if (ch.syncedAccounts > 0) right.innerHTML = '<span class="tag accent">' + esc(t("tagPartial", { a: ch.syncedAccounts, b: ch.totalAccounts })) + "</span>";
        else right.innerHTML = '<span class="tag muted">' + esc(t("tagOff")) + "</span>";
        row.append(left, mid, right);
        block.appendChild(row);
      }
      wrap.appendChild(block);
    }
  }

  function renderOthers(mergeSecs) {
    const others = state.otherSummary || [];
    $("otherCount").textContent = t("otherCount", { n: others.length });
    $("otherCard").hidden = activeTab === "model" || others.length === 0;
    if (others.length === 0) {
      $("otherTableWrap").innerHTML = '<div class="muted small">' + esc(t("otherEmpty")) + "</div>";
      return;
    }
    const rows = others.map((g) => {
      const detail = g.windows.length > 0
        ? summaryChips(g.windows, g.total, mergeSecs, 4)
        : (g.balances.length ? g.balances.map((b) => '<span class="win-chip">' + esc(b) + "</span>").join("") : '<span class="muted small">' + esc(t("noData")) + "</span>");
      return "<tr><td><b>" + esc(g.name) + "</b></td><td>" + g.total + "</td><td>" + detail + "</td></tr>";
    }).join("");
    $("otherTableWrap").innerHTML = '<table><thead><tr><th style="width:150px">' + esc(t("colProvider")) +
      '</th><th style="width:70px">' + esc(t("colAccounts")) + "</th><th>" + esc(t("colQuota")) + "</th></tr></thead><tbody>" + rows + "</tbody></table>";
  }

  function renderTabs() {
    const isModel = activeTab === "model";
    $("tabProviderBtn").classList.toggle("active", !isModel);
    $("tabModelBtn").classList.toggle("active", isModel);
    $("providerView").hidden = isModel;
    $("modelView").hidden = !isModel;
    if (state) $("otherCard").hidden = isModel || (state.otherSummary || []).length === 0;
  }

  function syncResetWindowControls(secs) {
    const editing = document.activeElement === $("resetWindowInput") || document.activeElement === $("resetWindowUnit");
    if (editing) return;
    if (secs > 0 && secs % 60 === 0) {
      $("resetWindowUnit").value = "min";
      $("resetWindowInput").value = String(secs / 60);
    } else {
      $("resetWindowUnit").value = "sec";
      $("resetWindowInput").value = String(secs);
    }
  }

  function wantedLang() {
    const setting = state?.config?.language;
    if (setting && setting !== "auto") return setting;
    return magpieLang || normLang(state?.lang) || lang;
  }

  function render() {
    if (!state) return;
    const next = wantedLang();
    if (next !== lang) {
      lang = next;
      applyStatic();
    }
    const cfg = state.config;
    const mergeSecs = cfg.resetMergeWindowSecs ?? 300;
    const threshold = cfg.autoPoolThreshold ?? 4;

    $("statusDot").className = "dot " + (state.magpieError ? "err" : "ok");
    $("statusText").textContent = state.magpieError ? t("statusMagpieDown") : t("statusOk", { n: state.exposedCount });

    $("hubUrl").textContent = state.hubUrl;
    $("hubKeyDisplay").textContent = keyVisible ? cfg.managementKey : "••••••••••••••••";
    $("toggleKeyBtn").textContent = keyVisible ? t("hide") : t("show");
    $("sshCmd").textContent = "ssh -N -L " + state.port + ":127.0.0.1:" + state.port + " " + t("sshHost");
    $("magpieSourceInfo").textContent = t("source", { url: state.resolvedMagpieUrl });

    const tw = state.t3Wire || {};
    const wire = $("t3WireStatus");
    wire.title = tw.settingsPath || "";
    if (tw.error) wire.innerHTML = '<span class="err-text">' + esc(t("wireError", { e: tw.error })) + "</span>";
    else if (!tw.exists) wire.innerHTML = '<span class="muted">' + esc(t("wireMissing")) + "</span>";
    else if (tw.disabledInT3) wire.innerHTML = '<span class="warn-text">● ' + esc(t("wireDisabled")) + "</span>";
    else if (tw.wired && tw.upToDate) wire.innerHTML = '<span class="ok-text">● ' + esc(t("wireOk")) + "</span>";
    else if (tw.wired) wire.innerHTML = '<span class="warn-text">● ' + esc(t(!tw.urlMatches ? "wireStalePort" : "wireStaleKey")) + "</span>";
    else wire.innerHTML = '<span class="muted">' + esc(t("wireNone")) + "</span>";
    $("wireBtn").disabled = !tw.exists;
    $("wireBtn").title = tw.exists ? t("syncTip") : t("syncTipMissing");
    $("unwireBtn").disabled = !tw.wired;

    // Display mode cards + live preview
    document.querySelectorAll(".preset-card").forEach((btn) => btn.classList.toggle("active", btn.dataset.preset === cfg.mode));
    $("autoCardDesc").textContent = t("modeAutoDesc", { n: threshold });
    const picked = (state.accountTree || []).filter((p) => p.enabled && p.selectedAccounts > 0);
    const crowded = picked.filter((p) => p.selectedAccounts > threshold);
    const sep = t("listSep");
    $("autoPreview").textContent = cfg.mode === "auto" && picked.length > 0
      ? picked.map((p) => t(p.selectedAccounts > threshold ? "previewMerged" : "previewEach", { p: provName(p.id), n: p.selectedAccounts })).join(sep)
      : "";
    $("perAccountBadge").hidden = crowded.length === 0;
    $("crowdedBanner").hidden = !(cfg.mode === "per-account" && crowded.length > 0);
    $("crowdedBannerText").textContent = t("crowdText", {
      list: crowded.map((p) => t("crowdItem", { p: provName(p.id), n: p.selectedAccounts })).join(sep),
    });

    // Reset time on merged bars
    const usesPool = cfg.mode === "pooled" || cfg.mode === "auto";
    const strategy = cfg.pooledResetStrategy || "when-aligned";
    const showReset = PICKS.includes(strategy);
    const pick = PICKS.includes(cfg.pooledResetPick) ? cfg.pooledResetPick : "latest";
    $("resetToggle").checked = showReset;
    $("resetToggle").disabled = !usesPool;
    document.querySelectorAll("#resetPicks button").forEach((btn) => {
      btn.classList.toggle("active", btn.dataset.pick === pick);
      btn.disabled = !usesPool || !showReset;
    });
    $("resetNote").textContent = usesPool ? "" : t("resetOnlyMerged");

    // Advanced
    $("advSummaryHint").textContent = t("advSummary", { n: threshold, w: mergeWindowText(mergeSecs), p: state.port });
    if (document.activeElement !== $("autoThresholdInput")) $("autoThresholdInput").value = String(threshold);
    document.querySelectorAll("button[data-ath]").forEach((btn) => btn.classList.toggle("active", Number(btn.dataset.ath) === threshold));
    syncResetWindowControls(mergeSecs);
    $("languageSelect").value = cfg.language || "auto";
    if (document.activeElement !== $("portInput")) $("portInput").value = String(state.port);
    if (!magpieUrlDirty && document.activeElement !== $("magpieUrlInput")) $("magpieUrlInput").value = cfg.magpieUrl || "";
    $("dirtyBar").hidden = !magpieUrlDirty;
    if (magpieUrlDirty) $("advancedDetails").open = true;
    $("autoSyncNewCheck").checked = cfg.selectionMode !== "only-selected";
    $("autoWireCheck").checked = cfg.autoWireT3Code !== false;
    $("keptOnlyCheck").checked = !!cfg.keptOnly;

    $("t3Error").textContent = state.magpieError ? t("magpieError", { e: state.magpieError }) : "";
    $("t3Count").textContent = t("accCount", { total: state.totalT3Accounts, n: state.exposedCount });

    renderTabs();
    renderTree();
    renderModelView();
    renderOthers(mergeSecs);
  }

  async function loadStatus(refresh) {
    $("refreshBtn").disabled = true;
    try {
      state = await apiFetch("./api/status" + (refresh ? "?refresh=1" : ""));
      render();
      // Remember Magpie's language so merged labels inside T3 Code follow it.
      if (magpieLang && !magpieLangReported && state.config.magpieLang !== magpieLang) {
        magpieLangReported = true;
        postJson("./api/config", { magpieLang }).catch(() => {});
      }
    } catch (err) {
      $("statusDot").className = "dot err";
      $("statusText").textContent = t("statusServiceDown");
      $("t3Error").textContent = errText(err);
    } finally {
      $("refreshBtn").disabled = false;
    }
  }

  function setMode(mode) {
    if (!state) return;
    state.config.mode = mode;
    render();
    queueAutoSave({ mode }, t("switchedTo", { m: t(MODE_KEYS[mode] || "modeAuto") }));
  }

  function setThreshold(n) {
    state.config.autoPoolThreshold = n;
    queueAutoSave({ autoPoolThreshold: n });
  }

  // ---- wiring ----
  applyStatic();

  $("refreshBtn").onclick = () => loadStatus(true);
  $("copyUrlBtn").onclick = () => state && copyText(state.hubUrl, $("copyUrlBtn"));
  $("copyKeyBtn").onclick = () => state && copyText(state.config.managementKey, $("copyKeyBtn"));
  $("copySshBtn").onclick = () => copyText($("sshCmd").textContent, $("copySshBtn"));
  $("toggleKeyBtn").onclick = () => { keyVisible = !keyVisible; render(); };

  $("regenKeyBtn").onclick = async () => {
    $("regenKeyBtn").disabled = true;
    try {
      await postJson("./api/config", { regenerateKey: true });
      keyVisible = true;
      showToast(t("regenOk"), "ok");
      await loadStatus(false);
    } catch (err) {
      showToast(t("regenFail", { e: errText(err) }), "err");
    } finally {
      $("regenKeyBtn").disabled = false;
    }
  };

  document.querySelectorAll(".preset-card").forEach((btn) => { btn.onclick = () => setMode(btn.dataset.preset); });
  $("switchToAutoBtn").onclick = () => setMode("auto");

  $("resetToggle").onchange = () => {
    if (!state) return;
    const pick = PICKS.includes(state.config.pooledResetPick) ? state.config.pooledResetPick : "latest";
    const pooledResetStrategy = $("resetToggle").checked ? pick : "when-aligned";
    Object.assign(state.config, { pooledResetStrategy, pooledResetPick: pick });
    render();
    queueAutoSave({ pooledResetStrategy, pooledResetPick: pick });
  };

  document.querySelectorAll("#resetPicks button").forEach((btn) => {
    btn.onclick = () => {
      if (!state) return;
      const pick = btn.dataset.pick;
      const patch = { pooledResetPick: pick, pooledResetStrategy: pick };
      Object.assign(state.config, patch);
      render();
      queueAutoSave(patch);
    };
  });

  $("autoThresholdInput").oninput = () => {
    if (!state) return;
    const raw = $("autoThresholdInput").value.trim();
    if (raw === "") return;
    const n = Number(raw);
    if (!Number.isInteger(n) || n < 1 || n > 50) {
      showToast(t("thresholdBad"), "warn");
      return;
    }
    setThreshold(n);
  };
  document.querySelectorAll("button[data-ath]").forEach((btn) => {
    btn.onclick = () => {
      if (!state) return;
      const n = Number(btn.dataset.ath);
      setThreshold(n);
      $("autoThresholdInput").value = String(n);
      render();
    };
  });

  function applyResetWindowFromInputs() {
    if (!state) return;
    const raw = $("resetWindowInput").value.trim();
    if (raw === "") return;
    const val = Number(raw);
    const unit = $("resetWindowUnit").value;
    const maxVal = unit === "min" ? 1440 : 86400;
    if (!Number.isInteger(val) || val < 0 || val > maxVal) {
      showToast(t("windowBad", { max: maxVal }), "warn");
      return;
    }
    const secs = unit === "min" ? val * 60 : val;
    state.config.resetMergeWindowSecs = secs;
    queueAutoSave({ resetMergeWindowSecs: secs });
  }
  $("resetWindowInput").oninput = applyResetWindowFromInputs;
  $("resetWindowUnit").onchange = applyResetWindowFromInputs;

  $("languageSelect").onchange = () => {
    if (!state) return;
    const language = $("languageSelect").value;
    state.config.language = language;
    render();
    queueAutoSave({ language });
  };

  $("autoSyncNewCheck").onchange = () => {
    const selectionMode = $("autoSyncNewCheck").checked ? "all-except" : "only-selected";
    const patch = { selectionMode };
    if (selectionMode === "only-selected" && (state.config.selectedPlans || []).length === 0 && (state.config.selectedAccounts || []).length === 0) {
      const planKeys = [];
      for (const p of state.accountTree || []) {
        if (!p.enabled) continue;
        for (const pg of p.plans) if (pg.selectedCount > 0) planKeys.push(pg.planKey);
      }
      patch.selectedPlans = planKeys;
    }
    Object.assign(state.config, patch);
    queueAutoSave(patch);
  };
  $("autoWireCheck").onchange = () => {
    state.config.autoWireT3Code = $("autoWireCheck").checked;
    queueAutoSave({ autoWireT3Code: state.config.autoWireT3Code });
  };
  $("keptOnlyCheck").onchange = () => {
    state.config.keptOnly = $("keptOnlyCheck").checked;
    queueAutoSave({ keptOnly: state.config.keptOnly });
  };

  $("magpieUrlInput").oninput = () => {
    magpieUrlDirty = $("magpieUrlInput").value.trim() !== (state?.config?.magpieUrl || "");
    $("dirtyBar").hidden = !magpieUrlDirty;
  };
  $("discardTextBtn").onclick = () => {
    magpieUrlDirty = false;
    $("magpieUrlInput").value = state?.config?.magpieUrl || "";
    $("dirtyBar").hidden = true;
  };
  $("saveTextBtn").onclick = async () => {
    $("saveTextBtn").disabled = true;
    try {
      await postJson("./api/config", { magpieUrl: $("magpieUrlInput").value.trim() });
      magpieUrlDirty = false;
      showToast(t("magpieSaved"), "ok");
      await loadStatus(true);
    } catch (err) {
      showToast(t("saveFail", { e: errText(err) }), "err");
    } finally {
      $("saveTextBtn").disabled = false;
    }
  };

  $("tabProviderBtn").onclick = () => { activeTab = "provider"; renderTabs(); };
  $("tabModelBtn").onclick = () => { activeTab = "model"; renderTabs(); };

  $("quickAllBtn").onclick = () => {
    if (!state) return;
    const patch = {
      enabledProviders: { claude: true, codex: true, antigravity: true, grok: true },
      selectionMode: "all-except",
      selectedPlans: [], excludedPlans: [], selectedAccounts: [], excludedAccounts: [],
    };
    Object.assign(state.config, patch);
    queueAutoSave(patch, t("allSelected"));
  };

  $("quickTopPlanBtn").onclick = () => {
    if (!state) return;
    const tree = state.accountTree || [];
    if (tree.length === 0) return;
    const enabledProviders = { ...state.config.enabledProviders };
    const selectedPlans = [];
    const names = [];
    for (const prov of tree) {
      if (!prov.plans || prov.plans.length === 0) continue;
      enabledProviders[prov.id] = true;
      const best = [...prov.plans].sort((a, b) => planTierRank(b.plan) - planTierRank(a.plan) || b.totalCount - a.totalCount)[0];
      selectedPlans.push(best.planKey);
      names.push(provName(prov.id) + (best.plan ? " " + best.plan : ""));
    }
    const patch = {
      enabledProviders, selectionMode: "only-selected", selectedPlans,
      excludedPlans: [], selectedAccounts: [], excludedAccounts: [],
    };
    Object.assign(state.config, patch);
    queueAutoSave(patch, t("topSelected", { list: names.join(t("listSep")) }));
  };

  $("quickActiveBtn").onclick = () => {
    if (!state) return;
    const enabledProviders = { ...state.config.enabledProviders };
    const activeKeys = [];
    for (const prov of state.accountTree || []) {
      for (const pg of prov.plans || []) {
        for (const a of pg.accounts || []) {
          if (a.last) { enabledProviders[prov.id] = true; activeKeys.push(a.key); }
        }
      }
    }
    if (activeKeys.length === 0) {
      showToast(t("activeNone"), "warn");
      return;
    }
    const patch = {
      enabledProviders, selectionMode: "only-selected", selectedPlans: [],
      excludedPlans: [], selectedAccounts: activeKeys, excludedAccounts: [],
    };
    Object.assign(state.config, patch);
    queueAutoSave(patch, t("activeSelected", { n: activeKeys.length }));
  };

  $("quickNoneBtn").onclick = () => {
    if (!state) return;
    const patch = { selectionMode: "only-selected", selectedPlans: [], excludedPlans: [], selectedAccounts: [], excludedAccounts: [] };
    Object.assign(state.config, patch);
    queueAutoSave(patch, t("noneSelected"));
  };

  $("switchPortBtn").onclick = async () => {
    const nextPort = Number($("portInput").value);
    if (!Number.isInteger(nextPort) || nextPort < 1 || nextPort > 65535) {
      showToast(t("portBad"), "err");
      return;
    }
    if (state && nextPort === state.port) {
      showToast(t("portSame", { p: nextPort }), "ok");
      return;
    }
    $("switchPortBtn").disabled = true;
    try {
      const res = await postJson("./api/port", { port: nextPort });
      if (location.hostname === "127.0.0.1" || location.hostname === "localhost") {
        showToast(t("portSwitched", { p: res.port }), "ok");
        setTimeout(() => location.replace("http://127.0.0.1:" + res.port + "/" + location.search), 120);
      } else {
        showToast(t("portSwitchedReload", { p: res.port }), "ok");
      }
    } catch (err) {
      showToast(t("portFail", { e: errText(err) }), "err");
      $("switchPortBtn").disabled = false;
    }
  };

  $("wireBtn").onclick = async () => {
    $("wireBtn").disabled = true;
    try {
      await postJson("./api/t3/wire", {});
      showToast(t("wireDone"), "ok");
      await loadStatus(false);
    } catch (err) {
      showToast(t("wireFail", { e: errText(err) }), "err");
    } finally {
      $("wireBtn").disabled = false;
    }
  };

  function disarmUnwire() {
    unwireArmed = false;
    clearTimeout(unwireTimer);
    $("unwireBtn").textContent = t("remove");
    $("unwireBtn").classList.remove("danger");
  }

  $("unwireBtn").onclick = async () => {
    if (!unwireArmed) {
      unwireArmed = true;
      $("unwireBtn").textContent = t("removeConfirm");
      $("unwireBtn").classList.add("danger");
      clearTimeout(unwireTimer);
      unwireTimer = setTimeout(disarmUnwire, 3500);
      return;
    }
    disarmUnwire();
    $("unwireBtn").disabled = true;
    try {
      await postJson("./api/t3/unwire", {});
      showToast(t("unwireDone"), "ok");
      await loadStatus(false);
    } catch (err) {
      showToast(t("unwireFail", { e: errText(err) }), "err");
    } finally {
      $("unwireBtn").disabled = false;
    }
  };

  loadStatus(false);
}
/* eslint-enable no-undef */

export function renderUiHtml({ uiToken = "" } = {}) {
  const script = `(${clientMain.toString()})(${jsonForScript(String(uiToken || ""))}, ${jsonForScript(UI_MESSAGES)});`;
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>T3 Code Quotas · Magpie</title>
<style>${CSS}</style>
</head>
<body>
${BODY}
<script>${script}</script>
</body>
</html>
`;
}
