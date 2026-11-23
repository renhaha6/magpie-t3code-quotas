// Embedded single-page control UI served by the local adapter HTTP server.
// Matches Magpie's own visual tokens and controls (cards, .segs pill tracks,
// .sw toggle switches, quiet pill buttons, soft badges). Copy lives in uitext.mjs.

import { UI_MESSAGES } from "./uitext.mjs";

function jsonForScript(value) {
  return JSON.stringify(value).replace(/</g, "\\u003c").replace(/\u2028|\u2029/g, " ");
}

const CSS = `
  :root {
    color-scheme: light dark;
    --bg: #f4f4f6; --card: #ffffff; --card-2: #f9f9fb;
    --pill: #f1f1f4; --pill-hover: #e9e9ee;
    --seg-track: #e6e6eb; --seg-thumb: var(--card);
    --seg-edge: 0 1px 2px rgba(0, 0, 0, .14), 0 0 0 .5px rgba(0, 0, 0, .08);
    --line: #e3e3e8; --line-2: #ececf0;
    --fg: #1c1c21; --fg-2: #4b4b53; --muted: #85858d; --faint: #b9b9c2; --ctl-fg: #63636b;
    --accent: #4f46e5; --accent-soft: #eeedfd; --accent-fg: #ffffff;
    --green: #189a58; --green-soft: #e4f6ec;
    --amber: #b45309; --amber-soft: #fbf0df;
    --red: #d64545; --red-soft: #fbe9e9;
    --shadow: 0 10px 28px rgba(20, 22, 30, .14), 0 1px 4px rgba(20, 22, 30, .06), 0 0 0 .5px rgba(20, 22, 30, .08);
    --font: -apple-system, BlinkMacSystemFont, "SF Pro Text", "Segoe UI", system-ui, sans-serif;
    --code: ui-monospace, "SF Mono", Menlo, Consolas, monospace;
    --ease: cubic-bezier(.22, 1, .36, 1);
  }
  :root[data-theme="light"] { color-scheme: light only; }
  :root[data-theme="dark"] {
    color-scheme: dark;
    --bg: #1a1a1e; --card: #232327; --card-2: #1f1f23;
    --pill: #2d2d33; --pill-hover: #36363d;
    --seg-track: rgba(255, 255, 255, .055); --seg-thumb: rgba(255, 255, 255, .15);
    --seg-edge: inset 0 .5px 0 rgba(255, 255, 255, .08), 0 1px 2px rgba(0, 0, 0, .3);
    --line: #333339; --line-2: #2c2c32;
    --fg: #ededf1; --fg-2: #b9b9c1; --muted: #9c9ca6; --faint: #90909a; --ctl-fg: #a1a1aa;
    --accent: #a5b4fc; --accent-soft: #2b2c47; --accent-fg: #14142a;
    --green: #6fd99b; --green-soft: #1e3a2b;
    --amber: #f2b544; --amber-soft: #3f3220;
    --red: #f28b82; --red-soft: #45272a;
    --shadow: 0 12px 32px rgba(0, 0, 0, .48), 0 2px 6px rgba(0, 0, 0, .28), 0 0 0 .5px rgba(255, 255, 255, .1);
  }
  * { box-sizing: border-box; }
  [hidden] { display: none !important; }
  body {
    margin: 0; padding: 18px 22px 56px;
    background: var(--bg); color: var(--fg);
    font: 13px/1.45 var(--font);
    -webkit-font-smoothing: antialiased;
    user-select: none; -webkit-user-select: none;
  }
  :where(code, pre, input, textarea, .err-text, .hint) { user-select: text; -webkit-user-select: text; }
  .wrap { max-width: 880px; margin: 0 auto; display: grid; gap: 12px; }
  .head { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 10px; padding: 0 2px; }
  h1 { margin: 0; font-size: 16px; font-weight: 600; letter-spacing: -.01em; }
  h2 { margin: 0; font-size: 13.5px; font-weight: 600; letter-spacing: -.005em; }
  .muted { color: var(--muted); }
  .small { font-size: 12px; }

  /* Magpie card (.list surface) */
  .card {
    background: var(--card); border: 1px solid var(--line);
    border-radius: 12px; padding: 12px 14px;
  }
  .row { display: flex; flex-wrap: wrap; align-items: center; gap: 8px 10px; }
  .between { justify-content: space-between; }

  /* Magpie status pill & soft badges */
  .status-pill {
    display: inline-flex; align-items: center; gap: 6px;
    height: 26px; padding: 0 10px; border-radius: 999px;
    font-size: 12px; color: var(--fg-2);
    background: var(--card); border: 1px solid var(--line);
    font-variant-numeric: tabular-nums;
  }
  .dot { width: 7px; height: 7px; border-radius: 50%; background: var(--faint); display: inline-block; flex: none; }
  .dot.ok { background: var(--green); }
  .dot.warn { background: var(--amber); }
  .dot.err { background: var(--red); }

  .tag {
    display: inline-flex; align-items: center; padding: 0 5px;
    border-radius: 4px; font-size: 10px; line-height: 16px; font-weight: 600;
    letter-spacing: .01em; white-space: nowrap;
    background: var(--pill); color: var(--muted);
  }
  .tag.ok { background: var(--green-soft); color: var(--green); }
  .tag.warn { background: var(--amber-soft); color: var(--amber); }
  .tag.accent { background: var(--accent-soft); color: var(--accent); }
  .tag.muted { background: var(--pill); color: var(--muted); }

  /* Magpie buttons (.text.action / .pill / .text.primary / .text.danger) */
  button, input, select { font: inherit; color: inherit; }
  button {
    appearance: none; -webkit-appearance: none;
    background: var(--card); border: 1px solid var(--line); border-radius: 7px;
    height: 27px; padding: 0 10px; font-size: 12px; color: var(--fg-2);
    display: inline-flex; align-items: center; justify-content: center; gap: 5px;
    box-shadow: 0 1px 1px rgba(0, 0, 0, .04);
    cursor: pointer; white-space: nowrap;
    transition: background .12s, border-color .12s, color .12s, filter .12s, transform .08s;
  }
  button:hover:not(:disabled) { border-color: var(--muted); background: var(--card-2); color: var(--fg); }
  button:active:not(:disabled) { transform: scale(.98); }
  button:focus-visible, input:focus-visible, select:focus-visible { outline: 2px solid var(--accent); outline-offset: 1px; }
  button:disabled { opacity: .45; cursor: default; box-shadow: none; }

  button.quiet {
    height: 24px; padding: 0 9px; border: 0; border-radius: 6px;
    background: var(--pill); color: var(--fg-2); box-shadow: none;
  }
  button.quiet:hover:not(:disabled) { background: var(--pill-hover); color: var(--fg); }
  button.quiet.active { background: var(--accent-soft); color: var(--accent); font-weight: 500; }

  button.primary {
    border-color: transparent; background: var(--accent); color: var(--accent-fg);
    font-weight: 500; box-shadow: none;
  }
  button.primary:hover:not(:disabled) { background: var(--accent); color: var(--accent-fg); filter: brightness(1.08); }

  button.danger {
    border-color: transparent; background: var(--red-soft); color: var(--red); box-shadow: none;
  }
  button.danger:hover:not(:disabled) { background: var(--red-soft); color: var(--red); border-color: transparent; }

  /* Magpie segmented control (.segs) — elevated thumb on pill track, zero border seam */
  .segs {
    display: inline-flex; align-items: center; gap: 1px;
    padding: 2px; border-radius: 8px; background: var(--seg-track);
    transition: opacity .15s;
  }
  .segs.off { opacity: .48; }
  .segs button {
    height: 24px; padding: 0 10px; border: 0; border-radius: 6px;
    background: transparent; color: var(--ctl-fg); box-shadow: none;
    font-size: 12px; font-weight: 400;
  }
  .segs button:hover:not(:disabled):not(.active) { background: transparent; color: var(--fg); }
  .segs button:active:not(:disabled) { transform: none; }
  .segs button.active {
    background: var(--seg-thumb); color: var(--fg); font-weight: 500;
    box-shadow: var(--seg-edge);
  }
  .segs button:disabled { opacity: 1; }
  .segs .tag { font-size: 9.5px; line-height: 14px; padding: 0 4px; }

  /* Magpie pill toggle switch (.sw matching .lib-switch) */
  input[type="checkbox"].sw {
    appearance: none; -webkit-appearance: none;
    position: relative; flex: none; margin: 0;
    width: 30px; height: 17px; border-radius: 999px; border: 0;
    background: var(--line); cursor: pointer;
    transition: background .18s var(--ease);
  }
  input[type="checkbox"].sw::after {
    content: ""; position: absolute; top: 2px; left: 2px;
    width: 13px; height: 13px; border-radius: 50%;
    background: #ffffff;
    box-shadow: 0 1px 2px rgba(0, 0, 0, .24);
    transition: transform .18s var(--ease);
  }
  input[type="checkbox"].sw:checked { background: var(--accent); }
  input[type="checkbox"].sw:checked::after { transform: translateX(13px); }
  input[type="checkbox"].sw:disabled { opacity: .45; cursor: default; }

  /* Native tick checkboxes tinted with Magpie accent */
  input[type="checkbox"]:not(.sw) {
    accent-color: var(--accent); width: 14px; height: 14px; margin: 0; cursor: pointer; flex: none;
  }
  input[type="checkbox"]:not(.sw):disabled { cursor: default; }

  /* Magpie inputs & selects */
  input[type="text"], input[type="number"], select {
    width: 100%; min-width: 0; height: 28px; padding: 0 9px;
    border: 1px solid var(--line); border-radius: 7px;
    background: var(--card); color: var(--fg); font-size: 12.5px;
  }
  .inline-input { display: flex; gap: 6px; align-items: center; min-width: 0; }
  .inline-input input { flex: 1 1 auto; }
  .inline-input select { width: 72px; flex: 0 0 auto; }

  .kv { display: grid; grid-template-columns: 76px 1fr auto; gap: 8px 10px; align-items: center; margin-top: 10px; }
  .kv code {
    font: 12px/1.4 var(--code); background: var(--pill);
    box-shadow: inset 0 0 0 1px var(--line-2); border-radius: 7px;
    padding: 4px 8px; overflow-x: auto; white-space: nowrap;
  }
  .hint { font-size: 12px; color: var(--muted); margin-top: 6px; }

  /* Mode preset tiles */
  .preset-grid { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 8px; margin-top: 10px; }
  .preset-card {
    height: auto; text-align: left; display: grid; gap: 3px; align-content: start;
    justify-content: stretch; padding: 9px 11px; border-radius: 10px;
    background: var(--card-2); border: 1px solid var(--line-2); box-shadow: none;
    white-space: normal; min-width: 0;
    transition: border-color .14s, background .14s;
  }
  .preset-card:hover:not(:disabled):not(.active) { background: var(--pill); border-color: var(--line); }
  .preset-card.active {
    background: var(--accent-soft);
    border-color: color-mix(in srgb, var(--accent) 42%, transparent);
    color: var(--fg);
  }
  .preset-card.active:hover:not(:disabled) {
    background: var(--accent-soft);
    border-color: color-mix(in srgb, var(--accent) 55%, transparent);
  }
  .preset-head { display: flex; align-items: center; justify-content: space-between; gap: 4px; width: 100%; }
  .preset-title { font-size: 12.5px; font-weight: 600; color: var(--fg); }
  .preset-card.active .preset-title { color: var(--accent); }
  .preset-desc { font-size: 11.5px; line-height: 1.4; color: var(--muted); font-weight: 400; }

  .preset-live { font-size: 12px; color: var(--accent); margin-top: 8px; }
  .preset-live:empty { display: none; }

  .crowd-banner {
    margin-top: 8px; padding: 7px 10px; border-radius: 8px; font-size: 12px;
    background: var(--amber-soft); color: var(--fg);
    display: flex; align-items: center; justify-content: space-between; gap: 8px; flex-wrap: wrap;
  }

  .reset-box {
    margin-top: 12px; padding: 10px 12px; border-radius: 9px;
    background: var(--card-2); border: 1px solid var(--line-2);
    display: grid; gap: 6px;
  }
  .reset-row { display: flex; flex-wrap: wrap; align-items: center; gap: 8px 12px; }
  .reset-warn { font-size: 11.5px; line-height: 1.45; color: var(--muted); }
  .check { display: inline-flex; align-items: center; gap: 8px; cursor: pointer; font-size: 12.5px; }

  /* Collapsible drawers */
  .adv-details { margin-top: 11px; padding-top: 10px; border-top: 1px solid var(--line-2); }
  .adv-summary {
    cursor: pointer; list-style: none; font-size: 12px; color: var(--muted);
    display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 6px;
  }
  .adv-summary::-webkit-details-marker { display: none; }
  .adv-summary > span:first-child::before, details.card > summary h2::before {
    content: "▸"; display: inline-block; margin-right: 6px; font-size: 11px; color: var(--muted);
    transition: transform .14s var(--ease);
  }
  details[open] > .adv-summary > span:first-child::before,
  details.card[open] > summary h2::before { transform: rotate(90deg); }

  .grid2 { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px 16px; margin-top: 12px; }
  .field { display: grid; gap: 5px; min-width: 0; align-content: start; }
  .field > label { font-size: 12px; color: var(--muted); }
  .field > label[title] {
    cursor: help; text-decoration: underline dotted color-mix(in srgb, var(--muted) 55%, transparent);
    text-underline-offset: 3px;
  }
  .switches {
    display: flex; flex-wrap: wrap; gap: 10px 18px;
    margin-top: 12px; padding-top: 11px; border-top: 1px solid var(--line-2);
  }
  .dirty-bar {
    margin-top: 10px; padding: 7px 10px; border-radius: 8px;
    display: flex; align-items: center; justify-content: space-between; gap: 8px;
    background: var(--accent-soft);
  }

  .quick-bar { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 10px; }
  .warn-box {
    margin-top: 8px; padding: 7px 10px; border-radius: 8px; font-size: 12px;
    background: var(--amber-soft); color: var(--fg);
  }

  /* Provider -> Plan -> Account list */
  .prov-block {
    border: 1px solid var(--line); border-radius: 10px;
    background: var(--card); margin-top: 10px; overflow: hidden;
  }
  .prov-block.disabled { opacity: .55; }
  .prov-head {
    display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between;
    gap: 8px; padding: 8px 12px; background: var(--card-2);
    border-bottom: 1px solid var(--line-2);
  }
  .plan-group { border-bottom: 1px solid var(--line-2); }
  .plan-group:last-child { border-bottom: none; }
  .plan-head { display: flex; align-items: center; justify-content: space-between; gap: 8px; padding: 8px 12px; }
  .plan-left { display: flex; flex-wrap: wrap; align-items: center; gap: 6px 10px; min-width: 0; }
  .plan-count { color: var(--muted); font-size: 12px; font-variant-numeric: tabular-nums; }
  .acct-list { border-top: 1px solid var(--line-2); background: var(--card-2); }
  .acct-row {
    display: grid; grid-template-columns: 20px minmax(140px, 1fr) 1.4fr auto;
    gap: 8px; align-items: center; padding: 6px 12px 6px 28px;
    border-bottom: 1px solid var(--line-2);
  }
  .acct-row:last-child { border-bottom: none; }
  .acct-row.dim { opacity: .55; }
  .acct-sub { font-size: 11px; color: var(--muted); }

  .model-row {
    display: grid; grid-template-columns: minmax(160px, 1fr) 1.6fr auto;
    gap: 8px 10px; align-items: center; padding: 8px 12px;
    border-bottom: 1px solid var(--line-2);
  }
  .model-row:last-child { border-bottom: none; }

  .win-chip {
    display: inline-block; margin: 2px 4px 2px 0; padding: 2px 7px;
    border-radius: 6px; font: 11.5px/1.4 var(--code);
    font-variant-numeric: tabular-nums;
    background: var(--pill); color: var(--fg-2);
  }

  details.card > summary { cursor: pointer; list-style: none; display: flex; justify-content: space-between; align-items: center; }
  details.card > summary::-webkit-details-marker { display: none; }
  table { width: 100%; border-collapse: collapse; margin-top: 8px; }
  th { text-align: left; font-size: 11.5px; font-weight: 500; color: var(--muted); }
  th, td { padding: 6px 8px; border-bottom: 1px solid var(--line-2); vertical-align: middle; }
  tr:last-child td { border-bottom: none; }

  .err-text { color: var(--red); font-size: 12px; }
  .ok-text { color: var(--green); }
  .warn-text { color: var(--amber); }

  /* Floating bottom toast (always visible regardless of scroll position) */
  .toast-pop {
    position: fixed; left: 50%; bottom: 18px; z-index: 50;
    transform: translate(-50%, 10px); opacity: 0; pointer-events: none;
    padding: 6px 14px; border-radius: 999px; font-size: 12px; font-weight: 500;
    background: var(--card); color: var(--fg);
    border: 1px solid var(--line); box-shadow: var(--shadow);
    transition: opacity .16s var(--ease), transform .16s var(--ease);
    max-width: calc(100vw - 32px); white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  }
  .toast-pop.show { opacity: 1; transform: translate(-50%, 0); }
  .toast-pop.err { color: var(--red); }
  .toast-pop.warn { color: var(--amber); }

  @media (max-width: 760px) {
    .preset-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
    .kv, .grid2 { grid-template-columns: 1fr; }
    .acct-row { grid-template-columns: 20px 1fr; padding-left: 14px; }
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
      <span class="status-pill"><span class="dot" id="statusDot"></span><span id="statusText" data-t="loading"></span></span>
      <button type="button" id="refreshBtn" data-t="refresh" data-t-title="refreshTip"></button>
    </div>
  </div>

  <div class="card">
    <div class="row between">
      <div class="row"><h2 data-t="connTitle"></h2><span class="small" id="t3WireStatus"></span></div>
      <div class="row">
        <button type="button" id="wireBtn" data-t="sync"></button>
        <button type="button" id="unwireBtn" data-t="remove"></button>
      </div>
    </div>
    <details id="manualDetails" style="margin-top:8px">
      <summary class="muted small" style="cursor:pointer" data-t="manual"></summary>
      <div class="kv">
        <span class="muted" data-t="url"></span><code id="hubUrl">-</code>
        <button type="button" class="quiet" id="copyUrlBtn" data-t="copy"></button>
        <span class="muted" data-t="key"></span><code id="hubKeyDisplay">••••••••</code>
        <div class="row" style="gap:6px">
          <button type="button" class="quiet" id="toggleKeyBtn" data-t="show"></button>
          <button type="button" class="quiet" id="copyKeyBtn" data-t="copy"></button>
          <button type="button" class="quiet" id="regenKeyBtn" data-t="regen"></button>
        </div>
        <span class="muted" data-t="ssh"></span><code id="sshCmd">-</code>
        <button type="button" class="quiet" id="copySshBtn" data-t="copy"></button>
      </div>
      <div class="hint" data-t="manualHint"></div>
      <div class="hint" id="magpieSourceInfo"></div>
    </details>
  </div>

  <div class="card">
    <div class="row between"><h2 data-t="modeTitle"></h2></div>
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
      <button type="button" class="primary" id="switchToAutoBtn" data-t="useSmart"></button>
    </div>

    <details id="advancedDetails" class="adv-details">
      <summary class="adv-summary"><span data-t="advanced"></span><span id="advSummaryHint"></span></summary>
      <div class="reset-box">
        <div class="reset-row">
          <label class="check" data-t-title="resetToggleTip">
            <input type="checkbox" class="sw" id="resetToggle"><span data-t="resetToggle"></span>
          </label>
          <div class="segs" id="resetPicks">
            <button type="button" data-pick="latest" data-t-title="pickLatestTip"><span data-t="pickLatest"></span><span class="tag ok" data-t="recommended"></span></button>
            <button type="button" data-pick="earliest" data-t-title="pickEarliestTip"><span data-t="pickEarliest"></span></button>
            <button type="button" data-pick="average" data-t-title="pickAverageTip"><span data-t="pickAverage"></span></button>
          </div>
          <span class="muted small" id="resetNote"></span>
        </div>
        <div class="reset-warn" data-t="resetWarn"></div>
      </div>
      <div class="grid2">
        <div class="field">
          <label for="autoThresholdInput" data-t="threshold" data-t-title="thresholdTip"></label>
          <div class="inline-input">
            <input id="autoThresholdInput" type="number" min="1" max="50" step="1" placeholder="4">
            <div class="segs" id="athChips">
              <button type="button" data-ath="2">2</button>
              <button type="button" data-ath="4">4</button>
              <button type="button" data-ath="6">6</button>
              <button type="button" data-ath="8">8</button>
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
            <button type="button" id="switchPortBtn" data-t="switchPort"></button>
          </div>
        </div>
        <div class="field" style="grid-column:1/-1">
          <label for="advOtherTargetSelect" data-t="otherTargetLabel" data-t-title="otherTargetTip"></label>
          <select id="advOtherTargetSelect">
            <option value="grok" data-t="otherTargetGrok"></option>
            <option value="claude" data-t="otherTargetClaude"></option>
            <option value="antigravity" data-t="otherTargetAntigravity"></option>
            <option value="off" data-t="otherTargetOff"></option>
          </select>
        </div>
        <div class="field" style="grid-column:1/-1">
          <label for="magpieUrlInput" data-t="magpieUrl"></label>
          <input id="magpieUrlInput" type="text" data-t-ph="magpieUrlPh">
        </div>
      </div>
      <div class="dirty-bar" id="dirtyBar" hidden>
        <span class="small" data-t="unsaved"></span>
        <div class="row">
          <button type="button" class="quiet" id="discardTextBtn" data-t="discard"></button>
          <button type="button" class="primary" id="saveTextBtn" data-t="save"></button>
        </div>
      </div>
      <div class="switches">
        <label class="check" data-t-title="swAutoSyncTip"><input type="checkbox" class="sw" id="autoSyncNewCheck"><span data-t="swAutoSync"></span></label>
        <label class="check" data-t-title="swAutoWireTip"><input type="checkbox" class="sw" id="autoWireCheck"><span data-t="swAutoWire"></span></label>
        <label class="check" data-t-title="swKeptTip"><input type="checkbox" class="sw" id="keptOnlyCheck"><span data-t="swKept"></span></label>
        <label class="check" data-t-title="swShowNamesTip"><input type="checkbox" class="sw" id="showNamesCheck"><span data-t="swShowNames"></span></label>
      </div>
    </details>
  </div>

  <div class="card">
    <div class="row between">
      <div class="row">
        <h2 data-t="accTitle"></h2>
        <div class="segs" role="tablist">
          <button type="button" class="active" id="tabProviderBtn" role="tab" data-t="tabProvider"></button>
          <button type="button" id="tabModelBtn" role="tab" data-t="tabModel"></button>
        </div>
      </div>
      <span class="muted small" id="t3Count"></span>
    </div>
    <div id="t3Error" class="err-text" style="margin-top:6px"></div>
    <div id="providerView">
      <div class="quick-bar">
        <button type="button" class="quiet" id="quickAllBtn" data-t="quickAll" data-t-title="quickAllTip"></button>
        <button type="button" class="quiet" id="quickTopPlanBtn" data-t="quickTop" data-t-title="quickTopTip"></button>
        <button type="button" class="quiet" id="quickActiveBtn" data-t="quickActive" data-t-title="quickActiveTip"></button>
        <button type="button" class="quiet" id="quickNoneBtn" data-t="quickNone" data-t-title="quickNoneTip"></button>
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
    <summary>
      <div class="row" style="gap:8px"><h2 data-t="otherTitle"></h2><span class="tag muted" id="otherCarrierTag"></span></div>
      <div class="row" style="gap:10px" id="otherTargetWrap">
        <select id="otherTargetSelect" data-t-title="otherTargetTip" style="max-width:260px">
          <option value="grok" data-t="otherTargetGrok"></option>
          <option value="claude" data-t="otherTargetClaude"></option>
          <option value="antigravity" data-t="otherTargetAntigravity"></option>
          <option value="off" data-t="otherTargetOff"></option>
        </select>
        <span class="muted small" id="otherCount"></span>
      </div>
    </summary>
    <div id="otherTableWrap"></div>
  </details>
</div>
<div class="toast-pop" id="saveToast" role="status" aria-live="polite"></div>
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
  let liveMagpieLang = normLang(query.get("lang"));
  let lang = liveMagpieLang || normLang(navigator.language) || "en";

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

  const THEME_KEYS = ["bg", "card", "fg", "fg-2", "muted", "faint", "line", "accent", "accent-soft", "accent-fg", "green", "red", "amber", "font", "code"];
  function applyThemeData(data) {
    const root = document.documentElement;
    if (typeof data?.dark === "boolean") {
      root.dataset.theme = data.dark ? "dark" : "light";
      root.style.colorScheme = data.dark ? "dark" : "light only";
    }
    if (data?.tokens && typeof data.tokens === "object") {
      for (const k of THEME_KEYS) {
        if (data.tokens[k]) root.style.setProperty("--" + k, data.tokens[k]);
      }
    }
  }

  (function applyThemeFromQuery() {
    const theme = query.get("theme");
    const dark = theme === "dark" ? true : theme === "light" ? false : matchMedia("(prefers-color-scheme: dark)").matches;
    let tokens = null;
    const rawTokens = query.get("tokens");
    if (rawTokens) {
      try { tokens = JSON.parse(decodeURIComponent(escape(atob(rawTokens)))); } catch { /* keep defaults */ }
    }
    applyThemeData({ dark, tokens });
  })();

  let state = null;
  let confirmedState = null;
  let activeTab = "provider";
  let keyVisible = false;
  let unwireArmed = false;
  let unwireTimer = null;
  let toastTimer = null;
  let debounceTimer = null;
  let debouncedPatch = null;
  let debouncedToast = "";
  let inflightSave = false;
  let queuedPatch = null;
  let queuedToast = "";
  let editEpoch = 0;
  let loadReqId = 0;
  let magpieUrlDirty = false;
  const expandedPlans = new Set();

  function cloneState(s) {
    return s ? JSON.parse(JSON.stringify(s)) : null;
  }

  function hasPendingEdits() {
    return Boolean(inflightSave || queuedPatch || debouncedPatch);
  }

  function syncMagpieLangIfNeeded() {
    if (!liveMagpieLang || !state?.config) return;
    if (state.config.magpieLang === liveMagpieLang) return;
    state.config.magpieLang = liveMagpieLang;
    saveNow({ magpieLang: liveMagpieLang });
  }

  // Receive live theme & language updates from Magpie's host window (pluginpages.js).
  window.addEventListener("message", (e) => {
    if (e.source !== parent) return;
    const m = e.data;
    if (!m || m.magpie !== 1 || m.event !== "theme" || !m.data) return;
    applyThemeData(m.data);
    const nextMagpieLang = normLang(m.data.lang);
    if (nextMagpieLang && nextMagpieLang !== liveMagpieLang) {
      liveMagpieLang = nextMagpieLang;
      if (state) {
        render();
        syncMagpieLangIfNeeded();
      } else if (lang !== nextMagpieLang) {
        lang = nextMagpieLang;
        applyStatic();
      }
    }
  });

  function esc(s) {
    return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }
  const errText = (err) => String(err?.message || err);
  const provName = (id) => PROVIDER_NAMES[id] || id;

  function showToast(text, level) {
    const el = $("saveToast");
    clearTimeout(toastTimer);
    if (!text) {
      el.className = "toast-pop";
      return;
    }
    el.textContent = text;
    el.className = "toast-pop show" + (level === "err" ? " err" : level === "warn" ? " warn" : "");
    toastTimer = setTimeout(() => { el.classList.remove("show"); }, 2400);
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

  // Mirror backend selection & exposure rules locally so clicks update badges/counts in 0ms.
  function applyLocalSelection() {
    if (!state?.accountTree) return;
    const cfg = state.config || {};
    const enabled = cfg.enabledProviders || {};
    const selMode = cfg.selectionMode || "all-except";
    const dispMode = cfg.mode || "auto";
    const threshold = Number.isInteger(cfg.autoPoolThreshold) && cfg.autoPoolThreshold >= 1 ? cfg.autoPoolThreshold : 4;
    const selPlans = new Set(cfg.selectedPlans || []);
    const excPlans = new Set(cfg.excludedPlans || []);
    const selAccts = new Set(cfg.selectedAccounts || []);
    const excAccts = new Set(cfg.excludedAccounts || []);
    let exposedCount = 0;

    for (const prov of state.accountTree) {
      prov.enabled = enabled[prov.id] !== false;
      let provSelected = 0;
      const selectedList = [];
      for (const pg of prov.plans || []) {
        let planSelected = 0;
        for (const a of pg.accounts || []) {
          let checked = false;
          if (prov.enabled) {
            if (selMode === "only-selected") {
              checked = !excAccts.has(a.key) && (selAccts.has(a.key) || selPlans.has(a.planKey));
            } else {
              checked = !excAccts.has(a.key) && (!excPlans.has(a.planKey) || selAccts.has(a.key));
            }
          }
          a.checked = checked;
          a.syncStatus = "hidden";
          if (checked) {
            planSelected += 1;
            selectedList.push(a);
          }
        }
        pg.selectedCount = planSelected;
        provSelected += planSelected;
      }
      prov.selectedAccounts = provSelected;
      prov.effectiveMode = !prov.enabled ? "disabled"
        : dispMode === "pooled" ? "pooled"
        : dispMode === "active-only" ? "active-only"
        : dispMode === "auto" ? (provSelected > threshold ? "auto-pooled" : "auto-per-account")
        : "per-account";

      let provSynced = 0;
      if (prov.enabled && selectedList.length > 0) {
        if (dispMode === "active-only") {
          const active = selectedList.filter((a) => a.last);
          if (active.length > 0) {
            active.forEach((a) => { a.syncStatus = "synced"; });
            provSynced = active.length;
            exposedCount += active.length;
          } else {
            const fb = selectedList.find((a) => !a.error) || selectedList[0];
            fb.syncStatus = "fallback";
            provSynced = 1;
            exposedCount += 1;
          }
        } else if (dispMode === "pooled" || (dispMode === "auto" && provSelected > threshold)) {
          for (const pg of prov.plans || []) {
            const checkedInPlan = (pg.accounts || []).filter((a) => a.checked);
            if (checkedInPlan.length === 0) continue;
            const st = checkedInPlan.length > 1 ? "pooled" : "synced";
            checkedInPlan.forEach((a) => { a.syncStatus = st; });
            provSynced += checkedInPlan.length;
            exposedCount += 1;
          }
        } else {
          selectedList.forEach((a) => { a.syncStatus = "synced"; });
          provSynced = selectedList.length;
          exposedCount += selectedList.length;
        }
      }
      prov.syncedAccounts = provSynced;
    }
    const otherTarget = cfg.otherProvidersT3Target || (cfg.includeOtherProvidersInT3 === false ? "off" : "grok");
    const avail = state.carriedOtherAvailable || 0;
    const otherExposed = otherTarget === "off" || avail === 0 ? 0 : otherTarget === "grok" ? avail : 1;
    state.carriedOtherCount = otherTarget !== "off" ? avail : 0;
    state.exposedCount = exposedCount + otherExposed;
  }

  // Unified immediate save: folds any pending debounced edits underneath the new
  // patch so newer clicks always win, and rolls back to confirmedState on failure.
  function saveNow(patch, toastMsg) {
    editEpoch += 1;
    clearTimeout(debounceTimer);
    debounceTimer = null;
    const base = debouncedPatch || {};
    debouncedPatch = null;
    const carryToast = debouncedToast;
    debouncedToast = "";
    queuedPatch = { ...base, ...(queuedPatch || {}), ...patch };
    if (toastMsg) queuedToast = toastMsg;
    else if (!queuedToast && carryToast) queuedToast = carryToast;
    if (!inflightSave) drainSaves();
  }

  function saveDebounced(patch, toastMsg) {
    editEpoch += 1;
    debouncedPatch = { ...(debouncedPatch || {}), ...patch };
    if (toastMsg) debouncedToast = toastMsg;
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      debounceTimer = null;
      const p = debouncedPatch;
      const msg = debouncedToast;
      debouncedPatch = null;
      debouncedToast = "";
      if (p) {
        queuedPatch = { ...(queuedPatch || {}), ...p };
        if (msg) queuedToast = msg;
        if (!inflightSave) drainSaves();
      }
    }, 220);
  }

  async function drainSaves() {
    inflightSave = true;
    try {
      while (queuedPatch) {
        const toSend = queuedPatch;
        const toastMsg = queuedToast;
        const sentEpoch = editEpoch;
        queuedPatch = null;
        queuedToast = "";
        try {
          const res = await postJson("./api/config", toSend);
          if (res.status) {
            confirmedState = cloneState(res.status);
            if (sentEpoch === editEpoch && !queuedPatch && !debouncedPatch) {
              state = res.status;
              render();
            }
          } else {
            if (confirmedState && res.config) confirmedState.config = res.config;
            if (sentEpoch === editEpoch && !queuedPatch && !debouncedPatch) {
              await loadStatus(false);
            }
          }
          if (toastMsg && sentEpoch === editEpoch) showToast(toastMsg, "ok");
        } catch (err) {
          showToast(t("saveFail", { e: errText(err) }), "err");
          if (confirmedState && !queuedPatch && !debouncedPatch) {
            state = cloneState(confirmedState);
            render();
          }
        }
      }
    } finally {
      inflightSave = false;
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
    applyLocalSelection();
    render();
    saveNow(patch);
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
    applyLocalSelection();
    render();
    saveNow(patch);
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
    const anySelected = tree.some((p) => p.enabled && p.selectedAccounts > 0);
    $("zeroSelectedWarn").hidden = !(tree.length > 0 && (!anySelected || state.exposedCount === 0));
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
        applyLocalSelection();
        render();
        saveNow({ enabledProviders: next });
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
        const expandBtn = el("button", "quiet", isOpen ? t("collapse") : t("expand"));
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
    const target = state.config?.otherProvidersT3Target || (state.config?.includeOtherProvidersInT3 === false ? "off" : "grok");
    const carried = state.carriedOtherCount || 0;
    $("otherCount").textContent = t("otherCount", { n: others.length });
    $("otherTargetSelect").value = target;
    $("advOtherTargetSelect").value = target;
    const tag = $("otherCarrierTag");
    if (target !== "off" && carried > 0) {
      tag.className = "tag ok";
      const key = target === "grok" ? "otherCarrierGrok" : target === "antigravity" ? "otherCarrierAntigravity" : "otherCarrierClaude";
      tag.textContent = t(key, { n: carried });
    } else {
      tag.className = "tag muted";
      tag.textContent = t("otherCarrierOff");
    }
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
    return liveMagpieLang || normLang(state?.autoLang) || normLang(navigator.language) || "en";
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
    $("resetPicks").classList.toggle("off", !usesPool || !showReset);
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
    $("showNamesCheck").checked = cfg.showAccountNamesInT3 !== false;

    $("t3Error").textContent = state.magpieError ? t("magpieError", { e: state.magpieError }) : "";
    $("t3Count").textContent = t("accCount", { total: state.totalT3Accounts, n: state.exposedCount });

    renderTabs();
    renderTree();
    renderModelView();
    renderOthers(mergeSecs);
  }

  async function loadStatus(refresh) {
    const myReq = ++loadReqId;
    const reqEpoch = editEpoch;
    $("refreshBtn").disabled = true;
    try {
      const fresh = await apiFetch("./api/status" + (refresh ? "?refresh=1" : ""));
      // Discard superseded or stale refresh responses that arrived after newer edits.
      if (myReq !== loadReqId) return;
      if (reqEpoch !== editEpoch || hasPendingEdits()) return;
      confirmedState = cloneState(fresh);
      state = fresh;
      render();
      syncMagpieLangIfNeeded();
    } catch (err) {
      if (myReq !== loadReqId) return;
      $("statusDot").className = "dot err";
      $("statusText").textContent = t("statusServiceDown");
      $("t3Error").textContent = errText(err);
    } finally {
      if (myReq === loadReqId) $("refreshBtn").disabled = false;
    }
  }

  function setMode(mode) {
    if (!state) return;
    state.config.mode = mode;
    applyLocalSelection();
    render();
    saveNow({ mode }, t("switchedTo", { m: t(MODE_KEYS[mode] || "modeAuto") }));
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
      const res = await postJson("./api/config", { regenerateKey: true });
      keyVisible = true;
      const wr = res.t3WireResult;
      if (wr?.error) showToast(t("regenWireFail", { e: wr.error }), "warn");
      else if (wr?.wired) showToast(t("regenOk"), "ok");
      else showToast(t("regenOnly"), "ok");
      if (res.status) {
        confirmedState = cloneState(res.status);
        if (!hasPendingEdits()) {
          state = res.status;
          render();
        }
      } else if (!hasPendingEdits()) {
        await loadStatus(false);
      }
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
    saveNow({ pooledResetStrategy, pooledResetPick: pick });
  };

  document.querySelectorAll("#resetPicks button").forEach((btn) => {
    btn.onclick = () => {
      if (!state) return;
      const pick = btn.dataset.pick;
      const patch = { pooledResetPick: pick, pooledResetStrategy: pick };
      Object.assign(state.config, patch);
      render();
      saveNow(patch);
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
    state.config.autoPoolThreshold = n;
    document.querySelectorAll("button[data-ath]").forEach((btn) => btn.classList.toggle("active", Number(btn.dataset.ath) === n));
    saveDebounced({ autoPoolThreshold: n });
  };
  document.querySelectorAll("button[data-ath]").forEach((btn) => {
    btn.onclick = () => {
      if (!state) return;
      const n = Number(btn.dataset.ath);
      state.config.autoPoolThreshold = n;
      $("autoThresholdInput").value = String(n);
      applyLocalSelection();
      render();
      saveNow({ autoPoolThreshold: n });
    };
  });

  function applyResetWindowFromInputs(immediate) {
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
    if (immediate) saveNow({ resetMergeWindowSecs: secs });
    else saveDebounced({ resetMergeWindowSecs: secs });
  }
  $("resetWindowInput").oninput = () => applyResetWindowFromInputs(false);
  $("resetWindowUnit").onchange = () => applyResetWindowFromInputs(true);

  $("languageSelect").onchange = () => {
    if (!state) return;
    const language = $("languageSelect").value;
    state.config.language = language;
    render();
    saveNow({ language });
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
    applyLocalSelection();
    render();
    saveNow(patch);
  };
  $("autoWireCheck").onchange = () => {
    state.config.autoWireT3Code = $("autoWireCheck").checked;
    saveNow({ autoWireT3Code: state.config.autoWireT3Code });
  };
  $("keptOnlyCheck").onchange = () => {
    state.config.keptOnly = $("keptOnlyCheck").checked;
    saveNow({ keptOnly: state.config.keptOnly });
  };
  $("showNamesCheck").onchange = () => {
    state.config.showAccountNamesInT3 = $("showNamesCheck").checked;
    saveNow({ showAccountNamesInT3: state.config.showAccountNamesInT3 });
  };
  function setOtherTarget(target) {
    if (!state) return;
    state.config.otherProvidersT3Target = target;
    state.config.includeOtherProvidersInT3 = target !== "off";
    applyLocalSelection();
    render();
    saveNow({ otherProvidersT3Target: target });
  }
  $("advOtherTargetSelect").onchange = () => setOtherTarget($("advOtherTargetSelect").value);
  $("otherTargetSelect").onchange = () => setOtherTarget($("otherTargetSelect").value);
  $("otherTargetSelect").onclick = (e) => e.stopPropagation();
  $("otherTargetWrap").onclick = (e) => e.stopPropagation();

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
    applyLocalSelection();
    render();
    saveNow(patch, t("allSelected", { n: state.totalT3Accounts || 0 }));
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
    applyLocalSelection();
    render();
    saveNow(patch, t("topSelected", { list: names.join(t("listSep")) }));
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
    applyLocalSelection();
    render();
    saveNow(patch, t("activeSelected", { n: activeKeys.length }));
  };

  $("quickNoneBtn").onclick = () => {
    if (!state) return;
    const patch = { selectionMode: "only-selected", selectedPlans: [], excludedPlans: [], selectedAccounts: [], excludedAccounts: [] };
    Object.assign(state.config, patch);
    applyLocalSelection();
    render();
    saveNow(patch, t("noneSelected"));
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
