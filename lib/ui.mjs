// Embedded single-page control UI served by the local adapter HTTP server.
// Uses relative ./api/* endpoints with a per-launch X-UI-Token header so it works
// safely in Magpie Desktop (sandboxed WKWebView/WebView2) and `magpie web`.

export function renderUiHtml({ uiToken = "" } = {}) {
  const safeToken = JSON.stringify(String(uiToken || ""));
  return `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>T3 Code 额度 · Magpie</title>
<style>
  :root {
    color-scheme: light dark;
    --bg: #ffffff;
    --fg: #111827;
    --muted: #6b7280;
    --card: #f8fafc;
    --card-2: #f1f5f9;
    --line: #e5e7eb;
    --accent: #2563eb;
    --accent-soft: rgba(37, 99, 235, 0.12);
    --ok: #16a34a;
    --warn: #d97706;
    --err: #dc2626;
    --font: -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif;
    --mono: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  }
  :root[data-theme="dark"] {
    --bg: #111318;
    --fg: #f3f4f6;
    --muted: #9ca3af;
    --card: #1a1d24;
    --card-2: #222631;
    --line: #2a2f3a;
    --accent: #60a5fa;
    --accent-soft: rgba(96, 165, 250, 0.16);
    --ok: #4ade80;
    --warn: #fbbf24;
    --err: #f87171;
  }
  * { box-sizing: border-box; }
  body {
    margin: 0;
    padding: 20px 24px 40px;
    background: var(--bg);
    color: var(--fg);
    font: 13px/1.5 var(--font);
    -webkit-font-smoothing: antialiased;
  }
  .wrap { max-width: 900px; margin: 0 auto; display: grid; gap: 16px; }
  .head { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 10px; }
  h1 { margin: 0; font-size: 18px; font-weight: 600; }
  h2 { margin: 0 0 10px; font-size: 14px; font-weight: 600; }
  .muted { color: var(--muted); }
  .small { font-size: 12px; }
  .card {
    background: var(--card);
    border: 1px solid var(--line);
    border-radius: 10px;
    padding: 14px 16px;
  }
  .row { display: flex; flex-wrap: wrap; align-items: center; gap: 8px 10px; }
  .between { justify-content: space-between; }
  .badge {
    display: inline-flex; align-items: center; gap: 6px;
    padding: 2px 9px; border-radius: 999px; font-size: 12px;
    border: 1px solid var(--line); background: var(--bg);
  }
  .tag {
    display: inline-block; padding: 1px 6px; border-radius: 4px;
    font-size: 11px; border: 1px solid var(--line); background: var(--bg);
  }
  .tag.ok { color: var(--ok); border-color: color-mix(in srgb, var(--ok) 45%, var(--line)); }
  .tag.warn { color: var(--warn); border-color: color-mix(in srgb, var(--warn) 45%, var(--line)); }
  .tag.muted { color: var(--muted); }
  .dot { width: 7px; height: 7px; border-radius: 50%; background: var(--muted); }
  .dot.ok { background: var(--ok); }
  .dot.warn { background: var(--warn); }
  .dot.err { background: var(--err); }
  button, input, select { font: inherit; color: inherit; }
  button {
    background: var(--bg); border: 1px solid var(--line);
    border-radius: 6px; padding: 5px 11px; cursor: pointer;
    white-space: nowrap;
  }
  button:hover:not(:disabled) { border-color: var(--muted); }
  button.primary {
    background: var(--accent-soft);
    border-color: var(--accent);
    color: var(--accent);
    font-weight: 500;
  }
  button.danger {
    color: var(--err);
    border-color: color-mix(in srgb, var(--err) 55%, var(--line));
  }
  button.sm { padding: 3px 8px; font-size: 12px; }
  button:disabled { opacity: 0.45; cursor: default; }
  input[type="text"], input[type="number"], select {
    width: 100%; max-width: 100%; min-width: 0; height: 32px;
    background: var(--bg); border: 1px solid var(--line);
    border-radius: 6px; padding: 5px 8px;
    overflow: hidden; text-overflow: ellipsis;
  }
  .inline-input { display: flex; gap: 6px; align-items: center; min-width: 0; }
  .inline-input input { flex: 1 1 auto; }
  .kv { display: grid; grid-template-columns: 110px 1fr auto; gap: 8px 10px; align-items: center; }
  .kv code {
    font-family: var(--mono); font-size: 12px;
    background: var(--bg); border: 1px solid var(--line);
    border-radius: 6px; padding: 5px 8px; overflow-x: auto; white-space: nowrap;
  }
  .grid2 { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px 16px; }
  .field { display: grid; gap: 5px; min-width: 0; align-content: start; }
  .field label { font-size: 12px; color: var(--muted); }
  .hint { font-size: 12px; color: var(--muted); margin-top: 2px; }
  .warn-box {
    margin-top: 8px; padding: 8px 10px; border-radius: 8px;
    border: 1px solid color-mix(in srgb, var(--warn) 45%, var(--line));
    background: color-mix(in srgb, var(--warn) 10%, var(--bg));
    color: var(--fg); font-size: 12px;
  }
  .dirty-bar {
    display: none; margin-top: 12px; padding: 8px 10px; border-radius: 8px;
    border: 1px solid color-mix(in srgb, var(--accent) 45%, var(--line));
    background: var(--accent-soft);
    align-items: center; justify-content: space-between; gap: 8px;
  }
  .dirty-bar.show { display: flex; }
  .switches { display: grid; gap: 8px; margin-top: 12px; padding-top: 12px; border-top: 1px solid var(--line); }
  .check { display: inline-flex; align-items: center; gap: 7px; cursor: pointer; }
  .prov-block {
    border: 1px solid var(--line); border-radius: 8px;
    background: var(--bg); margin-top: 10px; overflow: hidden;
  }
  .prov-block.disabled { opacity: 0.55; }
  .prov-head {
    display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between;
    gap: 8px; padding: 9px 12px; background: var(--card-2);
    border-bottom: 1px solid var(--line);
  }
  .plan-group { border-bottom: 1px solid var(--line); }
  .plan-group:last-child { border-bottom: none; }
  .plan-head {
    display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between;
    gap: 8px; padding: 9px 12px;
  }
  .plan-left { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; min-width: 0; }
  .plan-meta { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; }
  .acct-list { border-top: 1px dashed var(--line); background: var(--card); }
  .acct-row {
    display: grid; grid-template-columns: 24px minmax(150px, 1.1fr) 1fr auto;
    gap: 8px; align-items: center;
    padding: 7px 12px 7px 30px;
    border-bottom: 1px solid var(--line);
  }
  .acct-row:last-child { border-bottom: none; }
  .acct-row.dim { opacity: 0.55; }
  .win-chip {
    display: inline-block; margin: 2px 4px 2px 0; padding: 2px 6px;
    border-radius: 5px; font-size: 12px; font-family: var(--mono);
    background: var(--bg); border: 1px solid var(--line);
  }
  table { width: 100%; border-collapse: collapse; margin-top: 6px; }
  th { text-align: left; font-size: 12px; font-weight: 500; color: var(--muted); }
  th, td { padding: 7px 8px; border-bottom: 1px solid var(--line); vertical-align: middle; }
  .err-text { color: var(--err); font-size: 12px; }
  .ok-text { color: var(--ok); font-size: 12px; }
  .warn-text { color: var(--warn); font-size: 12px; }
  .toast { font-size: 12px; min-height: 18px; }
  @media (max-width: 680px) {
    .kv, .grid2 { grid-template-columns: 1fr; }
    .acct-row { grid-template-columns: 24px 1fr; padding-left: 14px; }
  }
</style>
</head>
<body>
<div class="wrap">
  <div class="head">
    <div>
      <h1>T3 Code 额度</h1>
      <div class="muted">让 T3 Code 的 Usage → Limits 直接显示 Magpie 各账号剩余额度</div>
    </div>
    <div class="row">
      <span class="badge"><span class="dot" id="statusDot"></span><span id="statusText">加载中…</span></span>
      <button type="button" id="refreshBtn" title="重新读取 Magpie 当前额度">重新读取</button>
    </div>
  </div>

  <!-- Card 1: Connection to T3 Code -->
  <div class="card">
    <div class="row between" style="margin-bottom:8px">
      <h2 style="margin:0">1. 连接 T3 Code</h2>
      <div class="row">
        <button type="button" id="wireBtn">同步到 T3 Code</button>
        <button type="button" id="unwireBtn">从 T3 Code 移除</button>
      </div>
    </div>
    <div id="t3WireStatus" style="margin-bottom:10px"></div>

    <details id="manualDetails">
      <summary class="muted small" style="cursor:pointer">连接密钥与远程设备手动接入（SSH 隧道）</summary>
      <div class="kv" style="margin-top:10px">
        <span class="muted">本机地址</span>
        <code id="hubUrl">-</code>
        <button type="button" class="sm" id="copyUrlBtn">复制</button>

        <span class="muted">连接密钥</span>
        <code id="hubKeyDisplay">••••••••</code>
        <div class="row" style="gap:6px">
          <button type="button" class="sm" id="toggleKeyBtn">显示</button>
          <button type="button" class="sm" id="copyKeyBtn">复制</button>
          <button type="button" class="sm" id="regenKeyBtn">重新生成</button>
        </div>

        <span class="muted">远程 SSH 隧道</span>
        <code id="sshCmd">-</code>
        <button type="button" class="sm" id="copySshBtn">复制</button>
      </div>
      <div class="hint" style="margin-top:6px">
        服务仅监听本机 127.0.0.1。若 T3 Code 装在另一台电脑，请先在那台电脑执行上方 SSH 隧道命令，再在 T3 Code → Settings → Providers → Usage providers → Add hub 填入上方本机地址与连接密钥。
      </div>
    </details>
    <div class="muted small" style="margin-top:8px" id="magpieSourceInfo"></div>
  </div>

  <!-- Card 2: Sync Settings -->
  <div class="card">
    <div class="row between" style="margin-bottom:10px">
      <h2 style="margin:0">2. 同步设置</h2>
      <span class="toast" id="saveToast"></span>
    </div>

    <div class="grid2">
      <div class="field">
        <label for="modeSelect">T3 Code 里怎么显示</label>
        <select id="modeSelect">
          <option value="per-account">每个账号单独显示（推荐）</option>
          <option value="pooled">同套餐合并成 1 条</option>
          <option value="active-only">每家只显示正在用的账号</option>
        </select>
        <div class="hint" id="modeHint"></div>
      </div>

      <div class="field" id="pooledResetField" style="display:none">
        <label for="pooledResetSelect">合并后的重置时间显示</label>
        <select id="pooledResetSelect">
          <option value="none">不显示重置时间（推荐，避免误以为全部重置）</option>
          <option value="earliest">最早单号回血时间（仅代表最近 1 个账号）</option>
          <option value="latest">全部重置时间（最晚恢复满血）</option>
        </select>
        <div class="hint">单条记录只能带 1 个时间；如需看每个号各自回血进度，请选「每个账号单独显示」。</div>
      </div>

      <div class="field">
        <label for="portInput">监听端口</label>
        <div class="inline-input">
          <input id="portInput" type="number" min="1" max="65535" step="1" placeholder="3478">
          <button type="button" id="switchPortBtn">切换端口</button>
        </div>
        <div class="hint">切换后自动同步到 Magpie 与 T3 Code；端口被占时不会影响当前运行。</div>
      </div>

      <div class="field">
        <label for="magpieUrlInput">Magpie 地址（一般留空）</label>
        <input id="magpieUrlInput" type="text" placeholder="留空自动使用本机 Magpie">
        <div class="hint">仅当要读取另一台机器的 Magpie 时才需填写。</div>
      </div>
    </div>

    <div class="dirty-bar" id="dirtyBar">
      <span class="small">Magpie 地址有未保存修改</span>
      <div class="row">
        <button type="button" class="sm" id="discardTextBtn">放弃</button>
        <button type="button" class="sm primary" id="saveTextBtn">保存</button>
      </div>
    </div>

    <div class="switches">
      <label class="check">
        <input type="checkbox" id="autoSyncNewCheck">
        <span>新加入的账号自动同步</span>
        <span class="muted small">（关闭后仅同步下方勾选的套餐或账号）</span>
      </label>
      <label class="check">
        <input type="checkbox" id="autoWireCheck">
        <span>自动写入 T3 Code 配置</span>
        <span class="muted small">（取消勾选不会删除已写入的配置，移除请点上方「从 T3 Code 移除」）</span>
      </label>
      <label class="check">
        <input type="checkbox" id="keptOnlyCheck">
        <span>只用 Magpie 已读到的额度（推荐）</span>
        <span class="muted small">（关闭后每次刷新都会让 Magpie 去厂商查询，账号多时可能触发限流）</span>
      </label>
    </div>
  </div>

  <!-- Card 3: Provider -> Plan -> Account 3-level Tree -->
  <div class="card">
    <div class="row between">
      <div>
        <h2 style="margin:0">3. 选择要同步的厂商与套餐</h2>
        <div class="muted small">支持按厂商、按套餐一键勾选，也可展开微调单个账号；勾选立即生效。</div>
      </div>
      <span class="muted small" id="t3Count"></span>
    </div>
    <div id="t3Error" class="err-text" style="margin-top:6px"></div>
    <div id="zeroSelectedWarn" class="warn-box" style="display:none">
      当前没有任何账号被选中，T3 Code 的 Usage → Limits 将不会显示来自 Magpie 的额度。请在下方勾选至少一个套餐或账号。
    </div>
    <div id="treeWrap"></div>
  </div>

  <!-- Card 4: Other Magpie Providers -->
  <div class="card">
    <div class="row between">
      <h2 style="margin:0">4. 其他厂商额度（T3 Code 暂不支持显示，这里仅供查看）</h2>
      <span class="muted small" id="otherCount"></span>
    </div>
    <div id="otherTableWrap"></div>
  </div>
</div>

<script>
const UI_TOKEN = ${safeToken};

(function applyThemeFromQuery() {
  const q = new URLSearchParams(location.search);
  const theme = q.get("theme");
  if (theme === "dark" || theme === "light") {
    document.documentElement.dataset.theme = theme;
  } else if (matchMedia("(prefers-color-scheme: dark)").matches) {
    document.documentElement.dataset.theme = "dark";
  }
  const rawTokens = q.get("tokens");
  if (rawTokens) {
    try {
      const tokens = JSON.parse(decodeURIComponent(escape(atob(rawTokens))));
      const map = { bg: "--bg", fg: "--fg", muted: "--muted", card: "--card", line: "--line", accent: "--accent" };
      for (const [k, cssVar] of Object.entries(map)) {
        if (tokens[k]) document.documentElement.style.setProperty(cssVar, tokens[k]);
      }
    } catch {}
  }
})();

const PROVIDER_NAMES = {
  claude: "Claude",
  codex: "Codex (ChatGPT)",
  antigravity: "Antigravity",
  grok: "Grok",
};

const MODE_HINTS = {
  "per-account": "T3 Code 会自动按套餐拼成分段进度条，并标出下次重置具体回血哪一段、回多少，不会误以为全部重置。",
  "pooled": "把同一套餐下选中的账号合并成 1 条传给 T3 Code；注意单条无法同时表达多个账号各自不同的重置时间。",
  "active-only": "每个厂商仅同步 Magpie 最近实际服务过请求的账号；若暂无使用记录则兜底取第一个可用账号。",
};

let state = null;
let keyVisible = false;
let unwireArmed = false;
let unwireTimer = null;
let saveDebounce = null;
let pendingPatch = null;
let magpieUrlDirty = false;
const expandedPlans = new Set();

const $ = (id) => document.getElementById(id);

function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

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

async function copyText(text, btn) {
  try {
    await navigator.clipboard.writeText(text);
    const old = btn.textContent;
    btn.textContent = "已复制";
    setTimeout(() => { btn.textContent = old; }, 1200);
  } catch {
    showToast("复制失败，请手动选中复制", "err");
  }
}

function formatDurationMs(ms) {
  if (!Number.isFinite(ms) || ms <= 0) return "";
  const mins = Math.round(ms / 60000);
  if (mins < 60) return Math.max(1, mins) + " 分钟";
  const hrs = mins / 60;
  if (hrs < 48) return (hrs < 10 ? hrs.toFixed(1).replace(/\\.0$/, "") : Math.round(hrs)) + " 小时";
  return (hrs / 24).toFixed(1).replace(/\\.0$/, "") + " 天";
}

function formatResetRelative(iso) {
  if (!iso) return "";
  const diff = Date.parse(iso) - Date.now();
  if (!Number.isFinite(diff) || diff <= 0) return "";
  return formatDurationMs(diff) + "后重置";
}

function formatAge(iso) {
  if (!iso) return "";
  const diff = Date.now() - Date.parse(iso);
  if (!Number.isFinite(diff) || diff < 0) return "";
  if (diff < 60000) return "刚刚读数";
  return formatDurationMs(diff) + "前读数";
}

function formatAccountWindows(windows) {
  if (!Array.isArray(windows) || windows.length === 0) return '<span class="muted small">无窗口数据</span>';
  return windows.map((w) => {
    const left = typeof w.remaining === "number" ? Math.round(w.remaining) + "%" : (w.display || "-");
    const tag = w.unlimited ? "无限" : (w.balance != null ? String(w.balance) + " " + (w.unit || "") : ("剩 " + left));
    const reset = formatResetRelative(w.resetsAt);
    return '<span class="win-chip">' + esc(w.name || w.pool || "额度") + ": " + esc(tag) + (reset ? " · " + esc(reset) : "") + "</span>";
  }).join("");
}

function formatPlanSummary(planGroup) {
  const ws = planGroup.summary?.windows || [];
  if (ws.length === 0) return '<span class="muted small">暂无可用读数</span>';
  const chips = ws.slice(0, 3).map((w) => {
    const left = typeof w.remaining === "number" ? Math.round(w.remaining) + "%" : "-";
    let resetNote = "";
    if (w.soonestResetAt && planGroup.totalCount > 1) {
      const soonStr = formatDurationMs(Date.parse(w.soonestResetAt) - Date.now());
      const lateStr = w.latestResetAt ? formatDurationMs(Date.parse(w.latestResetAt) - Date.now()) : "";
      if (soonStr) {
        resetNote = " · 最早 " + soonStr + "回血(" + (w.soonestResetCount || 1) + "/" + planGroup.totalCount + "号)";
        if (lateStr && lateStr !== soonStr) resetNote += " / 全重置 " + lateStr;
      }
    } else if (w.soonestResetAt) {
      const soonStr = formatDurationMs(Date.parse(w.soonestResetAt) - Date.now());
      if (soonStr) resetNote = " · " + soonStr + "后重置";
    }
    return '<span class="win-chip">' + esc(w.name || w.pool || "额度") + " 剩 " + esc(left) + esc(resetNote) + "</span>";
  });
  return chips.join("");
}

function queueAutoSave(patch) {
  pendingPatch = { ...(pendingPatch || {}), ...patch };
  clearTimeout(saveDebounce);
  saveDebounce = setTimeout(flushAutoSave, 220);
}

async function flushAutoSave() {
  if (!pendingPatch) return;
  const toSend = pendingPatch;
  pendingPatch = null;
  try {
    await apiFetch("./api/config", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(toSend),
    });
    showToast("设置已自动保存并生效", "ok");
    await loadStatus(false);
  } catch (err) {
    showToast("保存失败：" + String(err?.message || err), "err");
  }
}

function togglePlan(planGroup, checked) {
  const cfg = state.config;
  const mode = cfg.selectionMode || "all-except";
  const selectedPlans = new Set(cfg.selectedPlans || []);
  const excludedPlans = new Set(cfg.excludedPlans || []);
  const selectedAccounts = new Set(cfg.selectedAccounts || []);
  const excludedAccounts = new Set(cfg.excludedAccounts || []);

  // Clear per-account overrides inside this plan so the plan-level toggle takes clean effect.
  for (const a of planGroup.accounts) {
    selectedAccounts.delete(a.key);
    excludedAccounts.delete(a.key);
  }

  if (mode === "only-selected") {
    if (checked) selectedPlans.add(planGroup.planKey);
    else selectedPlans.delete(planGroup.planKey);
  } else {
    if (checked) excludedPlans.delete(planGroup.planKey);
    else excludedPlans.add(planGroup.planKey);
  }

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
  const mode = cfg.selectionMode || "all-except";
  const selectedAccounts = new Set(cfg.selectedAccounts || []);
  const excludedAccounts = new Set(cfg.excludedAccounts || []);
  const excludedPlans = new Set(cfg.excludedPlans || []);

  if (mode === "only-selected") {
    if (checked) {
      selectedAccounts.add(acct.key);
      excludedAccounts.delete(acct.key);
    } else {
      selectedAccounts.delete(acct.key);
      excludedAccounts.add(acct.key);
    }
  } else {
    if (checked) {
      excludedAccounts.delete(acct.key);
      if (excludedPlans.has(acct.planKey)) selectedAccounts.add(acct.key);
    } else {
      selectedAccounts.delete(acct.key);
      excludedAccounts.add(acct.key);
    }
  }

  const patch = {
    selectedAccounts: [...selectedAccounts],
    excludedAccounts: [...excludedAccounts],
  };
  Object.assign(state.config, patch);
  queueAutoSave(patch);
}

function renderStatusBadge(acct) {
  if (acct.syncStatus === "synced") return '<span class="tag ok">T3 可见</span>';
  if (acct.syncStatus === "pooled") return '<span class="tag ok">已合并</span>';
  if (acct.syncStatus === "fallback") return '<span class="tag warn" title="该厂商暂无活跃使用记录，自动兜底选择第一个可用账号">兜底选中</span>';
  return '<span class="tag muted">未同步</span>';
}

function renderTree() {
  const wrap = $("treeWrap");
  const tree = state.accountTree || [];
  if (tree.length === 0) {
    wrap.innerHTML = '<div class="muted" style="padding:10px 0">Magpie 里暂未检测到 Claude / Codex / Antigravity / Grok 订阅账号。</div>';
    $("zeroSelectedWarn").style.display = "none";
    return;
  }

  $("zeroSelectedWarn").style.display = state.exposedCount === 0 ? "block" : "none";
  wrap.innerHTML = "";

  for (const prov of tree) {
    const block = document.createElement("div");
    block.className = "prov-block" + (prov.enabled ? "" : " disabled");

    const head = document.createElement("div");
    head.className = "prov-head";
    const leftLabel = document.createElement("label");
    leftLabel.className = "check";
    const provCb = document.createElement("input");
    provCb.type = "checkbox";
    provCb.checked = prov.enabled;
    provCb.onchange = () => {
      const next = { ...state.config.enabledProviders, [prov.id]: provCb.checked };
      state.config.enabledProviders = next;
      queueAutoSave({ enabledProviders: next });
    };
    const provTitle = document.createElement("b");
    provTitle.textContent = PROVIDER_NAMES[prov.id] || prov.id;
    leftLabel.append(provCb, provTitle);

    const provStat = document.createElement("span");
    provStat.className = "muted small";
    provStat.textContent = prov.enabled
      ? ("共 " + prov.totalAccounts + " 个账号 · 已同步 " + prov.syncedAccounts + " 个")
      : "已关闭（不向 T3 Code 同步）";
    head.append(leftLabel, provStat);
    block.appendChild(head);

    for (const pg of prov.plans) {
      // Auto-expand small groups by default on first render
      if (!expandedPlans.has("init:" + pg.planKey)) {
        expandedPlans.add("init:" + pg.planKey);
        if (pg.totalCount <= 4) expandedPlans.add(pg.planKey);
      }
      const isOpen = expandedPlans.has(pg.planKey);

      const pDiv = document.createElement("div");
      pDiv.className = "plan-group";

      const pHead = document.createElement("div");
      pHead.className = "plan-head";

      const pLeft = document.createElement("div");
      pLeft.className = "plan-left";

      const planLabel = document.createElement("label");
      planLabel.className = "check";
      const planCb = document.createElement("input");
      planCb.type = "checkbox";
      planCb.disabled = !prov.enabled;
      planCb.checked = pg.selectedCount === pg.totalCount && pg.totalCount > 0;
      planCb.indeterminate = pg.selectedCount > 0 && pg.selectedCount < pg.totalCount;
      planCb.onchange = () => togglePlan(pg, planCb.checked);

      const planName = document.createElement("span");
      planName.style.fontWeight = "500";
      planName.textContent = (pg.plan ? pg.plan + " 套餐" : "默认套餐") + "（" + pg.totalCount + " 个账号）";
      planLabel.append(planCb, planName);

      const summarySpan = document.createElement("div");
      summarySpan.className = "plan-meta";
      summarySpan.innerHTML = formatPlanSummary(pg);

      pLeft.append(planLabel, summarySpan);

      const expandBtn = document.createElement("button");
      expandBtn.type = "button";
      expandBtn.className = "sm";
      expandBtn.textContent = isOpen ? "收起明细" : "展开明细";
      expandBtn.onclick = () => {
        if (expandedPlans.has(pg.planKey)) expandedPlans.delete(pg.planKey);
        else expandedPlans.add(pg.planKey);
        renderTree();
      };

      pHead.append(pLeft, expandBtn);
      pDiv.appendChild(pHead);

      if (isOpen) {
        const list = document.createElement("div");
        list.className = "acct-list";
        for (const a of pg.accounts) {
          const row = document.createElement("div");
          row.className = "acct-row" + (!prov.enabled || !a.checked ? " dim" : "");

          const cb = document.createElement("input");
          cb.type = "checkbox";
          cb.disabled = !prov.enabled;
          cb.checked = a.checked;
          cb.onchange = () => toggleSingleAccount(a, cb.checked);

          const info = document.createElement("div");
          const sub = [a.last ? "正在使用" : "", formatAge(a.asOf)].filter(Boolean).join(" · ");
          info.innerHTML = '<div>' + esc(a.displayLabel) + '</div>' +
            (sub ? '<div class="muted" style="font-size:11px">' + esc(sub) + '</div>' : '');

          const wins = document.createElement("div");
          wins.innerHTML = a.error ? '<span class="err-text">' + esc(a.error) + '</span>' : formatAccountWindows(a.windows);

          const badge = document.createElement("div");
          badge.innerHTML = renderStatusBadge(a);

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

function render() {
  if (!state) return;
  const cfg = state.config;
  const dot = $("statusDot");
  const statusText = $("statusText");

  if (state.magpieError) {
    dot.className = "dot err";
    statusText.textContent = "无法连接 Magpie";
  } else {
    dot.className = "dot ok";
    const unit = cfg.mode === "pooled" ? "条合并额度" : "个账号";
    statusText.textContent = "运行中 · T3 Code 可见 " + state.exposedCount + " " + unit;
  }

  $("hubUrl").textContent = state.hubUrl;
  $("hubKeyDisplay").textContent = keyVisible ? cfg.managementKey : "••••••••••••••••";
  $("toggleKeyBtn").textContent = keyVisible ? "隐藏" : "显示";
  $("sshCmd").textContent = "ssh -N -L " + state.port + ":127.0.0.1:" + state.port + " <用户名>@<Magpie机器地址>";
  $("magpieSourceInfo").textContent =
    "数据来源：" + state.resolvedMagpieUrl + (cfg.keptOnly ? "（使用 Magpie 已读额度）" : "（实时向厂商查询）");

  const tw = state.t3Wire || {};
  const twEl = $("t3WireStatus");
  if (tw.error) {
    twEl.innerHTML = '<span class="err-text">读取 T3 Code 配置失败：' + esc(tw.error) + "</span>";
  } else if (!tw.exists) {
    twEl.innerHTML = '<span class="muted">本机未检测到 T3 Code（' + esc(tw.settingsPath || "~/.t3/userdata/settings.json") + '）。如 T3 Code 在另一台电脑，请展开下方查看 SSH 隧道接入方式。</span>';
  } else if (tw.disabledInT3) {
    twEl.innerHTML = '<span class="warn-text">● 已在 T3 Code 设置中停用</span> <span class="muted">（如需重新开启，点上方「同步到 T3 Code」或在 T3 Code 设置里启用）</span>';
  } else if (tw.wired && tw.upToDate) {
    twEl.innerHTML = '<span class="ok-text">● 已自动连接 T3 Code</span> <span class="muted">（在 T3 Code 按 ⌘U 打开 Usage → Limits 即可查看）</span>';
  } else if (tw.wired) {
    const why = !tw.urlMatches ? "端口地址已变化" : "连接密钥已更新";
    twEl.innerHTML = '<span class="warn-text">● 待更新到 T3 Code（' + why + '）</span> <span class="muted">（点上方「同步到 T3 Code」立即更新）</span>';
  } else {
    twEl.innerHTML = '<span class="muted">尚未写入 T3 Code 配置。点上方「同步到 T3 Code」即可自动接入。</span>';
  }

  $("wireBtn").disabled = !tw.exists;
  $("wireBtn").title = tw.exists ? "写入或更新 T3 Code 配置" : "本机未找到 T3 Code 配置文件";
  $("unwireBtn").disabled = !tw.wired;

  $("modeSelect").value = cfg.mode;
  $("modeHint").textContent = MODE_HINTS[cfg.mode] || "";
  $("pooledResetField").style.display = cfg.mode === "pooled" ? "grid" : "none";
  $("pooledResetSelect").value = cfg.pooledResetStrategy || "none";

  if (document.activeElement !== $("portInput")) {
    $("portInput").value = String(state.port);
  }
  if (!magpieUrlDirty && document.activeElement !== $("magpieUrlInput")) {
    $("magpieUrlInput").value = cfg.magpieUrl || "";
  }
  $("dirtyBar").classList.toggle("show", magpieUrlDirty);

  $("autoSyncNewCheck").checked = cfg.selectionMode !== "only-selected";
  $("autoWireCheck").checked = cfg.autoWireT3Code !== false;
  $("keptOnlyCheck").checked = !!cfg.keptOnly;

  $("t3Error").textContent = state.magpieError ? ("读取 Magpie 额度失败：" + state.magpieError) : "";
  const unitLabel = cfg.mode === "pooled" ? "条合并额度" : "个账号";
  $("t3Count").textContent = "共 " + state.totalT3Accounts + " 个账号 · T3 Code 可见 " + state.exposedCount + " " + unitLabel;
  renderTree();

  const others = state.otherSummary || [];
  $("otherCount").textContent = others.length + " 个厂商";
  const otherWrap = $("otherTableWrap");
  if (others.length === 0) {
    otherWrap.innerHTML = '<div class="muted small" style="padding:4px 0">暂无其他厂商额度。</div>';
  } else {
    const rows = others.map((g) => {
      const detail = g.windows.length > 0
        ? formatAccountWindows(g.windows)
        : (g.balances.length ? g.balances.map((b) => '<span class="win-chip">' + esc(b) + "</span>").join("") : '<span class="muted small">暂无读数</span>');
      return "<tr><td><b>" + esc(g.name) + "</b></td><td>" + g.total + " 账号</td><td>" + detail + "</td></tr>";
    }).join("");
    otherWrap.innerHTML = '<table><thead><tr><th style="width:160px">厂商</th><th style="width:85px">数量</th><th>汇总额度</th></tr></thead><tbody>' + rows + "</tbody></table>";
  }
}

async function loadStatus(refresh) {
  $("refreshBtn").disabled = true;
  try {
    state = await apiFetch("./api/status" + (refresh ? "?refresh=1" : ""));
    render();
  } catch (err) {
    $("statusDot").className = "dot err";
    $("statusText").textContent = "无法连接插件服务";
    $("t3Error").textContent = String(err?.message || err);
  } finally {
    $("refreshBtn").disabled = false;
  }
}

$("refreshBtn").onclick = () => loadStatus(true);
$("copyUrlBtn").onclick = () => state && copyText(state.hubUrl, $("copyUrlBtn"));
$("copyKeyBtn").onclick = () => state && copyText(state.config.managementKey, $("copyKeyBtn"));
$("copySshBtn").onclick = () => copyText($("sshCmd").textContent, $("copySshBtn"));
$("toggleKeyBtn").onclick = () => {
  keyVisible = !keyVisible;
  render();
};

$("regenKeyBtn").onclick = async () => {
  $("regenKeyBtn").disabled = true;
  try {
    await apiFetch("./api/config", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ regenerateKey: true }),
    });
    keyVisible = true;
    showToast("已重新生成连接密钥并同步到 T3 Code", "ok");
    await loadStatus(false);
  } catch (err) {
    showToast("重新生成失败：" + String(err?.message || err), "err");
  } finally {
    $("regenKeyBtn").disabled = false;
  }
};

$("modeSelect").onchange = () => {
  const mode = $("modeSelect").value;
  state.config.mode = mode;
  render();
  queueAutoSave({ mode });
};

$("pooledResetSelect").onchange = () => {
  const pooledResetStrategy = $("pooledResetSelect").value;
  state.config.pooledResetStrategy = pooledResetStrategy;
  queueAutoSave({ pooledResetStrategy });
};

$("autoSyncNewCheck").onchange = () => {
  const selectionMode = $("autoSyncNewCheck").checked ? "all-except" : "only-selected";
  const patch = { selectionMode };
  // When switching to explicit selection for the first time, pre-select currently visible plans.
  if (
    selectionMode === "only-selected" &&
    (state.config.selectedPlans || []).length === 0 &&
    (state.config.selectedAccounts || []).length === 0
  ) {
    const planKeys = [];
    for (const p of state.accountTree || []) {
      if (!p.enabled) continue;
      for (const pg of p.plans) {
        if (pg.selectedCount > 0) planKeys.push(pg.planKey);
      }
    }
    patch.selectedPlans = planKeys;
  }
  Object.assign(state.config, patch);
  queueAutoSave(patch);
};

$("autoWireCheck").onchange = () => {
  const autoWireT3Code = $("autoWireCheck").checked;
  state.config.autoWireT3Code = autoWireT3Code;
  queueAutoSave({ autoWireT3Code });
};

$("keptOnlyCheck").onchange = () => {
  const keptOnly = $("keptOnlyCheck").checked;
  state.config.keptOnly = keptOnly;
  queueAutoSave({ keptOnly });
};

$("magpieUrlInput").oninput = () => {
  magpieUrlDirty = ($("magpieUrlInput").value.trim() !== (state?.config?.magpieUrl || ""));
  $("dirtyBar").classList.toggle("show", magpieUrlDirty);
};

$("discardTextBtn").onclick = () => {
  magpieUrlDirty = false;
  $("magpieUrlInput").value = state?.config?.magpieUrl || "";
  $("dirtyBar").classList.remove("show");
};

$("saveTextBtn").onclick = async () => {
  $("saveTextBtn").disabled = true;
  try {
    await apiFetch("./api/config", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ magpieUrl: $("magpieUrlInput").value.trim() }),
    });
    magpieUrlDirty = false;
    showToast("Magpie 地址已保存", "ok");
    await loadStatus(true);
  } catch (err) {
    showToast("保存失败：" + String(err?.message || err), "err");
  } finally {
    $("saveTextBtn").disabled = false;
  }
};

$("switchPortBtn").onclick = async () => {
  const nextPort = Number($("portInput").value);
  if (!Number.isInteger(nextPort) || nextPort < 1 || nextPort > 65535) {
    showToast("请输入 1 到 65535 之间的端口号", "err");
    return;
  }
  if (state && nextPort === state.port) {
    showToast("当前已经监听在端口 " + nextPort, "ok");
    return;
  }
  $("switchPortBtn").disabled = true;
  try {
    const res = await apiFetch("./api/port", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ port: nextPort }),
    });
    showToast("已切换到端口 " + res.port + "，正在跳转…", "ok");
    if (location.hostname === "127.0.0.1" || location.hostname === "localhost") {
      setTimeout(() => {
        location.replace("http://127.0.0.1:" + res.port + "/" + location.search);
      }, 120);
    } else {
      // Behind magpie web reverse proxy: user reloads the Magpie tab so proxy picks up the new port.
      showToast("已切换到端口 " + res.port + " 并同步 T3 Code，请刷新当前浏览器页面", "ok");
    }
  } catch (err) {
    showToast("切换端口失败：" + String(err?.message || err), "err");
    $("switchPortBtn").disabled = false;
  }
};

$("wireBtn").onclick = async () => {
  $("wireBtn").disabled = true;
  try {
    await apiFetch("./api/t3/wire", { method: "POST" });
    showToast("已写入 T3 Code。在 T3 Code 按 ⌘U 打开 Usage → Limits 查看", "ok");
    await loadStatus(false);
  } catch (err) {
    showToast("同步失败：" + String(err?.message || err), "err");
  } finally {
    $("wireBtn").disabled = false;
  }
};

$("unwireBtn").onclick = async () => {
  if (!unwireArmed) {
    unwireArmed = true;
    $("unwireBtn").textContent = "确认移除？";
    $("unwireBtn").classList.add("danger");
    clearTimeout(unwireTimer);
    unwireTimer = setTimeout(() => {
      unwireArmed = false;
      $("unwireBtn").textContent = "从 T3 Code 移除";
      $("unwireBtn").classList.remove("danger");
    }, 3500);
    return;
  }
  unwireArmed = false;
  clearTimeout(unwireTimer);
  $("unwireBtn").textContent = "从 T3 Code 移除";
  $("unwireBtn").classList.remove("danger");
  $("unwireBtn").disabled = true;
  try {
    await apiFetch("./api/t3/unwire", { method: "POST" });
    showToast("已从 T3 Code 移除", "ok");
    await loadStatus(false);
  } catch (err) {
    showToast("移除失败：" + String(err?.message || err), "err");
  } finally {
    $("unwireBtn").disabled = false;
  }
};

loadStatus(false);
</script>
</body>
</html>
`;
}
