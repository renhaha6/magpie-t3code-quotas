// Embedded single-page control UI served by the local adapter HTTP server.
// Uses relative ./api/* endpoints so it works identically in Magpie Desktop
// (127.0.0.1:<port>) and behind `magpie web` reverse proxy (`magpie.service`).

export function renderUiHtml() {
  return `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>T3 Code 额度适配 · Magpie</title>
<style>
  :root {
    color-scheme: light dark;
    --bg: #ffffff;
    --fg: #111827;
    --muted: #6b7280;
    --card: #f8fafc;
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
    padding: 20px 24px 36px;
    background: var(--bg);
    color: var(--fg);
    font: 13px/1.5 var(--font);
    -webkit-font-smoothing: antialiased;
  }
  .wrap { max-width: 880px; margin: 0 auto; display: grid; gap: 16px; }
  .head { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 10px; }
  h1 { margin: 0; font-size: 18px; font-weight: 600; }
  h2 { margin: 0 0 10px; font-size: 14px; font-weight: 600; }
  .muted { color: var(--muted); }
  .card {
    background: var(--card);
    border: 1px solid var(--line);
    border-radius: 10px;
    padding: 14px 16px;
  }
  .row { display: flex; flex-wrap: wrap; align-items: center; gap: 10px; }
  .between { justify-content: space-between; }
  .badge {
    display: inline-flex; align-items: center; gap: 6px;
    padding: 2px 8px; border-radius: 999px; font-size: 12px;
    border: 1px solid var(--line); background: var(--bg);
  }
  .dot { width: 7px; height: 7px; border-radius: 50%; background: var(--muted); }
  .dot.ok { background: var(--ok); }
  .dot.err { background: var(--err); }
  button, input, select { font: inherit; color: inherit; }
  button {
    background: var(--bg); border: 1px solid var(--line);
    border-radius: 6px; padding: 5px 11px; cursor: pointer;
  }
  button:hover:not(:disabled) { border-color: var(--muted); }
  button.primary {
    background: var(--accent-soft);
    border-color: var(--accent);
    color: var(--accent);
    font-weight: 500;
  }
  button.primary:hover:not(:disabled) {
    filter: brightness(1.08);
    border-color: var(--accent);
  }
  button:disabled { opacity: 0.5; cursor: default; }
  input[type="text"], input[type="password"], select {
    width: 100%;
    max-width: 100%;
    min-width: 0;
    height: 32px;
    background: var(--bg);
    border: 1px solid var(--line);
    border-radius: 6px;
    padding: 5px 8px;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .kv { display: grid; grid-template-columns: 140px 1fr auto; gap: 8px 10px; align-items: center; }
  .kv code {
    font-family: var(--mono); font-size: 12px;
    background: var(--bg); border: 1px solid var(--line);
    border-radius: 6px; padding: 5px 8px; overflow-x: auto;
  }
  .grid2 { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px 16px; }
  .field { display: grid; gap: 5px; min-width: 0; align-content: start; }
  .field label { font-size: 12px; color: var(--muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .checks { display: flex; flex-wrap: wrap; gap: 12px; }
  .check { display: inline-flex; align-items: center; gap: 6px; cursor: pointer; }
  table { width: 100%; border-collapse: collapse; margin-top: 6px; }
  th { text-align: left; font-size: 12px; font-weight: 500; color: var(--muted); }
  th, td { padding: 7px 8px; border-bottom: 1px solid var(--line); vertical-align: middle; }
  .win-chip {
    display: inline-block; margin: 2px 4px 2px 0; padding: 2px 6px;
    border-radius: 5px; font-size: 12px; font-family: var(--mono);
    background: var(--bg); border: 1px solid var(--line);
  }
  .err-text { color: var(--err); font-size: 12px; }
  .ok-text { color: var(--ok); font-size: 12px; }
  .toast { font-size: 12px; min-height: 18px; }
  @media (max-width: 640px) {
    .kv { grid-template-columns: 1fr; }
    .grid2 { grid-template-columns: 1fr; }
  }
</style>
</head>
<body>
<div class="wrap">
  <div class="head">
    <div>
      <h1>T3 Code 额度适配</h1>
      <div class="muted">将 Magpie 额度通过 T3 Code 原生 Usage Hub（CLIProxyAPI 协议）共享给 T3 Code</div>
    </div>
    <div class="row">
      <span class="badge" id="statusBadge"><span class="dot" id="statusDot"></span><span id="statusText">加载中…</span></span>
      <button type="button" id="refreshBtn">刷新</button>
    </div>
  </div>

  <div class="card">
    <div class="row between" style="margin-bottom:8px">
      <h2 style="margin:0">1. T3 Code 自动接入状态</h2>
      <div class="row">
        <button type="button" id="wireBtn">同步到 T3 Code</button>
        <button type="button" id="unwireBtn">从 T3 Code 移除</button>
      </div>
    </div>
    <div id="t3WireStatus" style="margin-bottom:10px"></div>
    <details>
      <summary class="muted" style="cursor:pointer;font-size:12px">远程设备或手动接入参数（Hub URL / Management Key）</summary>
      <div class="kv" style="margin-top:8px">
        <span class="muted">Hub URL</span>
        <code id="hubUrl">-</code>
        <button type="button" id="copyUrlBtn">复制</button>
        <span class="muted">Management Key</span>
        <code id="hubKey">-</code>
        <button type="button" id="copyKeyBtn">复制</button>
      </div>
    </details>
    <div class="muted" style="margin-top:8px;font-size:12px" id="magpieSourceInfo"></div>
  </div>

  <div class="card">
    <div class="row between" style="margin-bottom:10px">
      <h2 style="margin:0">2. 适配模式与过滤</h2>
      <span class="toast" id="saveToast"></span>
    </div>
    <div class="grid2">
      <div class="field">
        <label for="modeSelect">同步模式</label>
        <select id="modeSelect">
          <option value="per-account">逐账号明细（推荐 · T3 原生按套餐汇总）</option>
          <option value="pooled">按同套餐预汇总（Magpie 规则合并）</option>
          <option value="active-only">仅活跃账号（每厂商最近服务的账号）</option>
        </select>
      </div>
      <div class="field">
        <label for="selectionModeSelect">账号筛选策略</label>
        <select id="selectionModeSelect">
          <option value="all-except">默认全量（排除下方取消勾选的账号）</option>
          <option value="only-selected">仅同步下方明确勾选的账号</option>
        </select>
      </div>
      <div class="field">
        <label for="keyInput">Management Key</label>
        <input id="keyInput" type="text" placeholder="magpie-t3code-local">
      </div>
      <div class="field">
        <label for="magpieUrlInput">Magpie 网关地址（留空自动跟随 MAGPIE_ADDR）</label>
        <input id="magpieUrlInput" type="text" placeholder="自动（如 http://127.0.0.1:3425）">
      </div>
    </div>

    <div class="row between" style="margin-top:12px">
      <div class="checks" id="providerChecks"></div>
      <div class="checks">
        <label class="check">
          <input type="checkbox" id="autoWireCheck">
          <span>自动写入 T3 Code 配置</span>
        </label>
        <label class="check">
          <input type="checkbox" id="keptOnlyCheck">
          <span>仅读 Magpie 缓存（?kept=1，避免触发厂商 429）</span>
        </label>
      </div>
    </div>

    <div class="row" style="margin-top:12px">
      <button type="button" class="primary" id="saveBtn">保存设置（立即生效）</button>
      <span class="muted" style="font-size:12px">监听端口在 Magpie 的 Plugins → 选项（port）中修改。</span>
    </div>
  </div>

  <div class="card">
    <div class="row between">
      <h2 style="margin:0">3. T3 Code 原生支持账号（Claude / Codex / Antigravity / Grok）</h2>
      <span class="muted" id="t3Count"></span>
    </div>
    <div id="t3Error" class="err-text" style="margin-top:6px"></div>
    <div id="t3TableWrap"></div>
  </div>

  <div class="card">
    <div class="row between">
      <h2 style="margin:0">4. Magpie 其他厂商额度（T3 Hub 协议白名单暂不识别）</h2>
      <span class="muted" id="otherCount"></span>
    </div>
    <div class="muted" style="font-size:12px;margin-bottom:6px">
      T3 Code 服务端目前只接收 Claude、Codex、Antigravity、Grok 四类 Hub 账号；以下厂商已在 Magpie 内读取并在此汇总展示。
    </div>
    <div id="otherTableWrap"></div>
  </div>
</div>

<script>
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

const PROVIDERS = [
  { id: "claude", label: "Claude" },
  { id: "codex", label: "Codex" },
  { id: "antigravity", label: "Antigravity" },
  { id: "grok", label: "Grok" },
];

let state = null;
let draft = null;

const $ = (id) => document.getElementById(id);

function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

function showToast(text, isErr) {
  const el = $("saveToast");
  el.textContent = text;
  el.className = "toast " + (isErr ? "err-text" : "ok-text");
  if (text) setTimeout(() => { if (el.textContent === text) el.textContent = ""; }, 3000);
}

async function copyText(text, btn) {
  try {
    await navigator.clipboard.writeText(text);
    const old = btn.textContent;
    btn.textContent = "已复制";
    setTimeout(() => { btn.textContent = old; }, 1200);
  } catch {
    showToast("复制失败，请手动选中复制", true);
  }
}

function isAccountChecked(key) {
  if (!draft) return true;
  if (draft.selectionMode === "only-selected") {
    return draft.selectedAccounts.includes(key);
  }
  return !draft.excludedAccounts.includes(key);
}

function toggleAccount(key, checked) {
  if (!draft) return;
  if (draft.selectionMode === "only-selected") {
    const s = new Set(draft.selectedAccounts);
    if (checked) s.add(key); else s.delete(key);
    draft.selectedAccounts = [...s];
  } else {
    const s = new Set(draft.excludedAccounts);
    if (checked) s.delete(key); else s.add(key);
    draft.excludedAccounts = [...s];
  }
}

function formatWindows(windows) {
  if (!Array.isArray(windows) || windows.length === 0) return '<span class="muted">无窗口数据</span>';
  return windows.map((w) => {
    const left = typeof w.remaining === "number" ? Math.round(w.remaining) + "%" : (w.display || "-");
    const tag = w.unlimited ? "无限" : (w.balance != null ? String(w.balance) + " " + (w.unit || "") : ("剩 " + left));
    return '<span class="win-chip">' + esc(w.name || w.pool || "quota") + ": " + esc(tag) + "</span>";
  }).join("");
}

function render() {
  if (!state || !draft) return;
  const dot = $("statusDot");
  const statusText = $("statusText");
  if (state.magpieError) {
    dot.className = "dot err";
    statusText.textContent = "Magpie 连接异常";
  } else {
    dot.className = "dot ok";
    statusText.textContent = "运行中 · 已输出 " + state.exposed.length + " 项";
  }

  $("hubUrl").textContent = state.hubUrl;
  $("hubKey").textContent = draft.managementKey;
  $("magpieSourceInfo").textContent = "上游 Magpie 网关：" + state.resolvedMagpieUrl + (draft.keptOnly ? "（缓存模式 ?kept=1）" : "（实时模式）");

  const tw = state.t3Wire || {};
  const twEl = $("t3WireStatus");
  if (tw.error) {
    twEl.innerHTML = '<span class="err-text">读取 T3 Code 配置失败：' + esc(tw.error) + '</span>';
  } else if (!tw.exists) {
    twEl.innerHTML = '<span class="muted">未检测到本机 T3 Code 配置文件（' + esc(tw.settingsPath || "~/.t3/userdata/settings.json") + '）。如 T3 Code 在另一台机器，请展开下方参数手动添加。</span>';
  } else if (tw.wired && tw.upToDate) {
    twEl.innerHTML = '<span class="ok-text">● 已自动接入 T3 Code</span> <span class="muted">（' + esc(tw.settingsPath) + '，无需在 T3 Code 手动添加，打开 Usage → Limits 即可查看）</span>';
  } else if (tw.wired) {
    twEl.innerHTML = '<span class="err-text">● T3 Code 中已存在配置，但端口或 Key 与当前不一致</span> <span class="muted">（点击右上角「同步到 T3 Code」立即更新）</span>';
  } else {
    twEl.innerHTML = '<span class="muted">尚未写入 T3 Code（' + esc(tw.settingsPath) + '）。点击右上角「同步到 T3 Code」即可自动接入。</span>';
  }
  $("unwireBtn").disabled = !tw.wired;

  $("modeSelect").value = draft.mode;
  $("selectionModeSelect").value = draft.selectionMode;
  $("keyInput").value = draft.managementKey;
  $("magpieUrlInput").value = draft.magpieUrl;
  $("autoWireCheck").checked = draft.autoWireT3Code !== false;
  $("keptOnlyCheck").checked = !!draft.keptOnly;

  const pc = $("providerChecks");
  pc.innerHTML = "";
  for (const p of PROVIDERS) {
    const label = document.createElement("label");
    label.className = "check";
    const cb = document.createElement("input");
    cb.type = "checkbox";
    cb.checked = draft.enabledProviders[p.id] !== false;
    cb.onchange = () => { draft.enabledProviders[p.id] = cb.checked; };
    label.append(cb, document.createTextNode(p.label));
    pc.appendChild(label);
  }

  $("t3Error").textContent = state.magpieError ? ("拉取 Magpie 失败：" + state.magpieError) : "";
  $("t3Count").textContent = "发现 " + state.t3Accounts.length + " 个 · 当前输出 " + state.exposed.length + " 项";

  const t3Wrap = $("t3TableWrap");
  if (state.t3Accounts.length === 0) {
    t3Wrap.innerHTML = '<div class="muted" style="padding:8px 0">暂无 Claude / Codex / Antigravity / Grok 订阅账号。</div>';
  } else {
    const rows = state.t3Accounts.map((a) => {
      const checked = isAccountChecked(a.key);
      const status = a.error ? '<span class="err-text">' + esc(a.error) + "</span>" : formatWindows(a.windows);
      const flags = [a.plan, a.last ? "活跃" : "", a.from ? ("远端:" + a.from) : ""].filter(Boolean).join(" · ");
      return '<tr>' +
        '<td><input type="checkbox" data-acct="' + esc(a.key) + '"' + (checked ? " checked" : "") + '></td>' +
        '<td><b>' + esc(a.canonical) + '</b></td>' +
        '<td>' + esc(a.displayLabel) + (flags ? '<div class="muted" style="font-size:11px">' + esc(flags) + '</div>' : '') + '</td>' +
        '<td>' + status + '</td>' +
      '</tr>';
    }).join("");
    t3Wrap.innerHTML = '<table><thead><tr><th style="width:36px">同步</th><th style="width:105px">厂商</th><th>账号 / 套餐</th><th>当前额度</th></tr></thead><tbody>' + rows + '</tbody></table>';
    t3Wrap.querySelectorAll("input[data-acct]").forEach((cb) => {
      cb.onchange = () => toggleAccount(cb.dataset.acct, cb.checked);
    });
  }

  $("otherCount").textContent = state.otherSummary.length + " 个厂商";
  const otherWrap = $("otherTableWrap");
  if (state.otherSummary.length === 0) {
    otherWrap.innerHTML = '<div class="muted" style="padding:4px 0">无其他厂商额度。</div>';
  } else {
    const rows = state.otherSummary.map((g) => {
      const detail = g.windows.length > 0 ? formatWindows(g.windows) : (g.balances.length ? g.balances.map((b) => '<span class="win-chip">' + esc(b) + '</span>').join("") : '<span class="muted">暂无读数</span>');
      return '<tr><td><b>' + esc(g.name) + '</b></td><td>' + g.total + ' 账号</td><td>' + detail + '</td></tr>';
    }).join("");
    otherWrap.innerHTML = '<table><thead><tr><th style="width:160px">厂商</th><th style="width:90px">数量</th><th>汇总额度</th></tr></thead><tbody>' + rows + '</tbody></table>';
  }
}

async function loadStatus(refresh) {
  $("refreshBtn").disabled = true;
  try {
    const res = await fetch("./api/status" + (refresh ? "?refresh=1" : ""), { cache: "no-store" });
    if (!res.ok) throw new Error("HTTP " + res.status);
    state = await res.json();
    draft = JSON.parse(JSON.stringify(state.config));
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
$("copyKeyBtn").onclick = () => draft && copyText(draft.managementKey, $("copyKeyBtn"));
$("modeSelect").onchange = () => { if (draft) draft.mode = $("modeSelect").value; };
$("selectionModeSelect").onchange = () => {
  if (!draft) return;
  draft.selectionMode = $("selectionModeSelect").value;
  if (draft.selectionMode === "only-selected" && draft.selectedAccounts.length === 0 && state) {
    draft.selectedAccounts = state.t3Accounts.map((a) => a.key);
  }
  render();
};
$("keyInput").oninput = () => { if (draft) { draft.managementKey = $("keyInput").value.trim() || "magpie-t3code-local"; $("hubKey").textContent = draft.managementKey; } };
$("magpieUrlInput").oninput = () => { if (draft) draft.magpieUrl = $("magpieUrlInput").value.trim(); };
$("autoWireCheck").onchange = () => { if (draft) draft.autoWireT3Code = $("autoWireCheck").checked; };
$("keptOnlyCheck").onchange = () => { if (draft) draft.keptOnly = $("keptOnlyCheck").checked; };

$("wireBtn").onclick = async () => {
  $("wireBtn").disabled = true;
  try {
    const res = await fetch("./api/t3/wire", { method: "POST" });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || ("HTTP " + res.status));
    showToast("已写入 T3 Code 配置，T3 Code 会自动热加载", false);
    await loadStatus(false);
  } catch (err) {
    showToast("同步失败：" + String(err?.message || err), true);
  } finally {
    $("wireBtn").disabled = false;
  }
};

$("unwireBtn").onclick = async () => {
  $("unwireBtn").disabled = true;
  try {
    const res = await fetch("./api/t3/unwire", { method: "POST" });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || ("HTTP " + res.status));
    showToast("已从 T3 Code 移除", false);
    await loadStatus(false);
  } catch (err) {
    showToast("移除失败：" + String(err?.message || err), true);
  } finally {
    $("unwireBtn").disabled = false;
  }
};

$("saveBtn").onclick = async () => {
  if (!draft) return;
  $("saveBtn").disabled = true;
  try {
    const res = await fetch("./api/config", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(draft),
    });
    if (!res.ok) throw new Error(await res.text());
    showToast("已保存并立即生效", false);
    await loadStatus(true);
  } catch (err) {
    showToast("保存失败：" + String(err?.message || err), true);
  } finally {
    $("saveBtn").disabled = false;
  }
};

loadStatus(false);
</script>
</body>
</html>
`;
}
