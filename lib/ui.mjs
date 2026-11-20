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
  .wrap { max-width: 920px; margin: 0 auto; display: grid; gap: 16px; }
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
    white-space: nowrap;
  }
  .tag.ok { color: var(--ok); border-color: color-mix(in srgb, var(--ok) 45%, var(--line)); }
  .tag.warn { color: var(--warn); border-color: color-mix(in srgb, var(--warn) 45%, var(--line)); }
  .tag.accent { color: var(--accent); border-color: color-mix(in srgb, var(--accent) 45%, var(--line)); }
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
  button.chip-btn { padding: 4px 8px; font-size: 12px; }
  button.chip-btn.active {
    background: var(--accent-soft);
    border-color: var(--accent);
    color: var(--accent);
    font-weight: 500;
  }
  button:disabled { opacity: 0.45; cursor: default; }
  input[type="text"], input[type="number"], select {
    width: 100%; max-width: 100%; min-width: 0; height: 32px;
    background: var(--bg); border: 1px solid var(--line);
    border-radius: 6px; padding: 5px 8px;
    overflow: hidden; text-overflow: ellipsis;
  }
  .inline-input { display: flex; gap: 6px; align-items: center; min-width: 0; }
  .inline-input input { flex: 1 1 auto; }
  .inline-input select.unit-select { width: 78px; flex: 0 0 auto; }
  .chip-row { display: flex; flex-wrap: wrap; gap: 5px; margin-top: 2px; }
  .kv { display: grid; grid-template-columns: 110px 1fr auto; gap: 8px 10px; align-items: center; }
  .kv code {
    font-family: var(--mono); font-size: 12px;
    background: var(--bg); border: 1px solid var(--line);
    border-radius: 6px; padding: 5px 8px; overflow-x: auto; white-space: nowrap;
  }
  .preset-grid {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 10px;
  }
  .preset-card {
    text-align: left;
    display: grid;
    gap: 6px;
    align-content: start;
    padding: 12px 13px;
    border-radius: 9px;
    background: var(--bg);
    border: 1px solid var(--line);
    white-space: normal;
    min-width: 0;
    transition: border-color 0.12s ease, background-color 0.12s ease;
  }
  .preset-card:hover { border-color: var(--muted); }
  .preset-card.active {
    border-color: var(--accent);
    background: var(--accent-soft);
    box-shadow: inset 0 0 0 1px var(--accent);
  }
  .preset-head { display: flex; align-items: center; justify-content: space-between; gap: 6px; }
  .preset-title { font-size: 13px; font-weight: 600; color: var(--fg); }
  .preset-desc { font-size: 12px; line-height: 1.45; color: var(--muted); }
  .adv-details {
    margin-top: 12px;
    padding-top: 10px;
    border-top: 1px solid var(--line);
  }
  .adv-summary {
    cursor: pointer;
    font-size: 12px;
    color: var(--muted);
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: 6px;
    user-select: none;
  }
  .adv-body { margin-top: 12px; }
  .grid2 { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px 16px; }
  .field { display: grid; gap: 5px; min-width: 0; align-content: start; }
  .field label { font-size: 12px; color: var(--muted); }
  .hint { font-size: 12px; color: var(--muted); margin-top: 2px; }
  .info-box {
    margin-top: 10px; padding: 8px 10px; border-radius: 8px;
    border: 1px solid var(--line);
    background: var(--bg);
    color: var(--muted); font-size: 12px;
  }
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
  .tabs {
    display: inline-flex;
    flex-wrap: wrap;
    gap: 4px;
    padding: 3px;
    border-radius: 8px;
    background: var(--card-2);
    border: 1px solid var(--line);
  }
  .tab-btn {
    border: 1px solid transparent;
    background: transparent;
    border-radius: 6px;
    padding: 4px 10px;
    font-size: 12px;
    color: var(--muted);
  }
  .tab-btn:hover { color: var(--fg); border-color: transparent; }
  .tab-btn.active {
    background: var(--bg);
    color: var(--fg);
    border-color: var(--line);
    font-weight: 500;
  }
  .quick-bar {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 6px 8px;
    margin-top: 10px;
    padding: 8px 10px;
    border-radius: 8px;
    background: var(--bg);
    border: 1px solid var(--line);
  }
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
  .model-row {
    display: grid;
    grid-template-columns: minmax(175px, 1.05fr) 1fr auto;
    gap: 8px 10px;
    align-items: center;
    padding: 9px 12px;
    border-bottom: 1px solid var(--line);
  }
  .model-row:last-child { border-bottom: none; }
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
  @media (max-width: 720px) {
    .preset-grid, .kv, .grid2 { grid-template-columns: 1fr; }
    .acct-row { grid-template-columns: 24px 1fr; padding-left: 14px; }
    .model-row { grid-template-columns: 1fr; }
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

  <!-- Card 2: Quick Mode Presets + Collapsible Advanced Settings -->
  <div class="card">
    <div class="row between" style="margin-bottom:10px">
      <div>
        <h2 style="margin:0">2. 选择你的使用方式</h2>
        <div class="muted small">按使用习惯点选一张卡片即可生效，无需研究复杂参数。</div>
      </div>
      <span class="toast" id="saveToast"></span>
    </div>

    <div class="preset-grid" id="presetGrid">
      <button type="button" class="preset-card" data-preset="per-account">
        <div class="preset-head">
          <span class="preset-title">多账号全览</span>
          <span class="tag ok">推荐</span>
        </div>
        <div class="preset-desc">各账号独立传给 T3 Code；同厂商、同模型池自动拼成多段进度条，悬停看每个号各自余量与回血时间，绝不误以为全部重置。</div>
      </button>

      <button type="button" class="preset-card" data-preset="pooled">
        <div class="preset-head">
          <span class="preset-title">同套餐合成一条</span>
          <span class="tag muted">精简</span>
        </div>
        <div class="preset-desc">把同一套餐的多个账号合并成 1 条总余量显示；默认仅当全部账号在合并窗口内一起重置时才显示重置时间，防止误导。</div>
      </button>

      <button type="button" class="preset-card" data-preset="active-only">
        <div class="preset-head">
          <span class="preset-title">只看正在用的号</span>
          <span class="tag muted">轻量</span>
        </div>
        <div class="preset-desc">每家只同步 Magpie 最近刚用过的那一个主力账号；账号很多、只想盯当前在跑的号时最清爽。</div>
      </button>
    </div>

    <details id="advancedDetails" class="adv-details">
      <summary class="adv-summary">
        <span>高级设置（重置时间合并窗口 · 端口 · 缓存 · 远程 Magpie 地址）</span>
        <span class="muted small" id="advSummaryHint"></span>
      </summary>

      <div class="adv-body">
        <div class="grid2">
          <div class="field">
            <label for="resetWindowInput">重置时间合并窗口（支持秒 / 分钟）</label>
            <div class="inline-input">
              <input id="resetWindowInput" type="number" min="0" max="86400" step="1" placeholder="5">
              <select id="resetWindowUnit" class="unit-select" aria-label="合并窗口单位">
                <option value="sec">秒</option>
                <option value="min">分钟</option>
              </select>
            </div>
            <div class="chip-row">
              <button type="button" class="chip-btn" data-rws="0">0秒</button>
              <button type="button" class="chip-btn" data-rws="10">10秒</button>
              <button type="button" class="chip-btn" data-rws="30">30秒</button>
              <button type="button" class="chip-btn" data-rws="60">1分</button>
              <button type="button" class="chip-btn" data-rws="300">5分</button>
              <button type="button" class="chip-btn" data-rws="900">15分</button>
            </div>
            <div class="hint">重置时间相差不超过此窗口的账号会归为同一波（填 0 表示严格不合并）；同时决定「同套餐合成一条」何时判定为全部同步重置。</div>
          </div>

          <div class="field">
            <label for="pooledResetSelect">合并模式的重置时间显示 <span id="pooledResetNote" class="muted"></span></label>
            <select id="pooledResetSelect">
              <option value="when-aligned">全部在合并窗口内同步重置时才显示（推荐）</option>
              <option value="none">始终不显示（最保守，绝不误导）</option>
              <option value="earliest">显示最早单号回血时间</option>
              <option value="latest">显示全部账号最晚重置时间</option>
            </select>
            <div class="hint">仅在「同套餐合成一条」模式生效；单条记录只能带 1 个时间。</div>
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
    </details>
  </div>

  <!-- Card 3: Dual View — Provider/Plan Selection OR Cross-Provider Model View -->
  <div class="card">
    <div class="row between">
      <div class="row" style="gap:10px">
        <h2 style="margin:0">3. 额度与同步范围</h2>
        <div class="tabs" role="tablist">
          <button type="button" class="tab-btn active" id="tabProviderBtn" role="tab">按厂商与套餐（同步选择）</button>
          <button type="button" class="tab-btn" id="tabModelBtn" role="tab">按模型看（跨厂商对照）</button>
        </div>
      </div>
      <span class="muted small" id="t3Count"></span>
    </div>
    <div id="t3Error" class="err-text" style="margin-top:6px"></div>

    <!-- Tab 1: Provider -> Plan -> Account Tree -->
    <div id="providerView">
      <div class="quick-bar" id="quickFilterBar">
        <span class="muted small">快捷筛选：</span>
        <button type="button" class="sm" id="quickAllBtn" title="开启所有支持的厂商并同步全部账号">全部同步</button>
        <button type="button" class="sm" id="quickTopPlanBtn" title="每个厂商只勾最高档套餐（如 Claude Max、Codex Pro），避免不同倍率套餐混算">只选各家主力套餐</button>
        <button type="button" class="sm" id="quickActiveBtn" title="仅勾选 Magpie 最近刚使用过的账号">只选正在用的号</button>
        <button type="button" class="sm" id="quickNoneBtn" title="取消勾选所有账号">全部取消</button>
      </div>
      <div id="zeroSelectedWarn" class="warn-box" style="display:none">
        当前没有任何账号被选中，T3 Code 的 Usage → Limits 将不会显示来自 Magpie 的额度。可点上方「全部同步」或在下方勾选套餐。
      </div>
      <div id="treeWrap"></div>
    </div>

    <!-- Tab 2: Cross-Provider Model Family Comparison -->
    <div id="modelView" style="display:none">
      <div class="info-box">
        不同厂商的额度总量与计费单位不同，无法直接相加；这里按模型家族把各渠道并排对照，方便一眼看出当前还能用哪条渠道。调整 T3 Code 同步开关请切回「按厂商与套餐」。
      </div>
      <div id="modelWrap"></div>
    </div>
  </div>

  <!-- Card 4: Other Magpie Providers (shown under provider tab to avoid duplicating model view) -->
  <div class="card" id="otherCard">
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

const PRESET_TOASTS = {
  "per-account": "已切换为「多账号全览」：T3 Code 会按模型池自动拼多段进度条",
  "pooled": "已切换为「同套餐合成一条」：同套餐将合并显示总余量",
  "active-only": "已切换为「只看正在用的号」：每家只同步当前主力账号",
};

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

const $ = (id) => document.getElementById(id);

function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

function showToast(text, level) {
  const el = $("saveToast");
  el.textContent = text;
  el.className = "toast " + (level === "err" ? "err-text" : level === "warn" ? "warn-text" : "ok-text");
  if (text) setTimeout(() => { if (el.textContent === text) el.textContent = ""; }, 3800);
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
  if (ms < 60000) return Math.max(1, Math.round(ms / 1000)) + " 秒";
  const mins = Math.round(ms / 60000);
  if (mins < 60) return Math.max(1, mins) + " 分钟";
  const hrs = mins / 60;
  if (hrs < 48) return (hrs < 10 ? hrs.toFixed(1).replace(/\\.0$/, "") : Math.round(hrs)) + " 小时";
  return (hrs / 24).toFixed(1).replace(/\\.0$/, "") + " 天";
}

function formatMergeWindow(secs) {
  const s = Math.max(0, Math.round(Number(secs) || 0));
  if (s === 0) return "0 秒（不合并）";
  if (s < 60) return s + " 秒";
  if (s % 60 === 0) return (s / 60) + " 分钟";
  return Math.floor(s / 60) + " 分 " + (s % 60) + " 秒";
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

function buildWaveTooltip(w, mergeWindowSecs) {
  const waves = Array.isArray(w.resetWaves) ? w.resetWaves : [];
  if (waves.length === 0) return "";
  const head = mergeWindowSecs > 0
    ? ("重置合并窗口：" + formatMergeWindow(mergeWindowSecs) + "内归为一波")
    : "重置合并窗口：0 秒（严格不合并）";
  const lines = [head];
  for (let i = 0; i < waves.length; i += 1) {
    const wave = waves[i];
    const when = formatDurationMs(Date.parse(wave.at) - Date.now()) || "即将";
    const restore = wave.restorePercent > 0 ? ("，预计回血 +" + wave.restorePercent + "%") : "";
    lines.push("第 " + (i + 1) + " 波：" + when + "后重置 " + wave.count + "/" + (w.accounts || wave.count) + " 个账号" + restore);
  }
  return lines.join("\\n");
}

function formatSummaryChips(windows, totalAccounts, mergeWindowSecs, maxItems = 4) {
  if (!Array.isArray(windows) || windows.length === 0) {
    return '<span class="muted small">暂无可用读数</span>';
  }
  const chips = windows.slice(0, maxItems).map((w) => {
    const valTag = w.unlimited
      ? "无限"
      : (w.balance != null
          ? (String(w.balance) + " " + (w.unit || ""))
          : ("剩 " + (typeof w.remaining === "number" ? Math.round(w.remaining) + "%" : "-")));
    let resetNote = "";
    const accCount = Number(w.accounts) || Number(totalAccounts) || 1;
    if (accCount > 1 && w.allResetsAligned && w.latestResetAt) {
      const alignedStr = formatDurationMs(Date.parse(w.latestResetAt) - Date.now());
      if (alignedStr) resetNote = " · " + alignedStr + "后全部重置";
    } else if (accCount > 1 && Array.isArray(w.resetWaves) && w.resetWaves.length > 0) {
      const first = w.resetWaves[0];
      const last = w.resetWaves[w.resetWaves.length - 1];
      const firstStr = formatDurationMs(Date.parse(first.at) - Date.now());
      const lastStr = formatDurationMs(Date.parse(last.endAt || last.at) - Date.now());
      if (firstStr) {
        const restoreStr = first.restorePercent > 0 ? (" (+" + first.restorePercent + "%)") : "";
        resetNote = " · " + firstStr + "回血 " + first.count + "/" + accCount + "号" + restoreStr;
        if (w.resetWaves.length > 1 && lastStr && lastStr !== firstStr) {
          resetNote += " / 全重置 " + lastStr;
        }
      }
    } else if (w.soonestResetAt) {
      const soonStr = formatDurationMs(Date.parse(w.soonestResetAt) - Date.now());
      if (soonStr) resetNote = " · " + soonStr + "后重置";
    }
    const tip = buildWaveTooltip(w, mergeWindowSecs);
    const titleAttr = tip ? (' title="' + esc(tip) + '"') : "";
    return '<span class="win-chip"' + titleAttr + ">" + esc(w.name || w.pool || "额度") + " " + esc(valTag) + esc(resetNote) + "</span>";
  });
  return chips.join("");
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
  const toastMsg = pendingToast || "设置已自动保存并生效";
  pendingPatch = null;
  pendingToast = "";
  try {
    await apiFetch("./api/config", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(toSend),
    });
    showToast(toastMsg, "ok");
    await loadStatus(false);
  } catch (err) {
    showToast("保存失败：" + String(err?.message || err), "err");
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
  const mode = cfg.selectionMode || "all-except";
  const selectedPlans = new Set(cfg.selectedPlans || []);
  const excludedPlans = new Set(cfg.excludedPlans || []);
  const selectedAccounts = new Set(cfg.selectedAccounts || []);
  const excludedAccounts = new Set(cfg.excludedAccounts || []);

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
  const mergeSecs = state.config?.resetMergeWindowSecs ?? 300;
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
      summarySpan.innerHTML = formatSummaryChips(pg.summary?.windows || [], pg.totalCount, mergeSecs, 3);

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
          info.innerHTML = "<div>" + esc(a.displayLabel) + "</div>" +
            (sub ? '<div class="muted" style="font-size:11px">' + esc(sub) + "</div>" : "");

          const wins = document.createElement("div");
          wins.innerHTML = a.error ? '<span class="err-text">' + esc(a.error) + "</span>" : formatAccountWindows(a.windows);

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

function renderModelView() {
  const wrap = $("modelWrap");
  const groups = state.modelGroups || [];
  const mergeSecs = state.config?.resetMergeWindowSecs ?? 300;
  if (groups.length === 0) {
    wrap.innerHTML = '<div class="muted" style="padding:10px 0">Magpie 暂未返回任何账号额度。</div>';
    return;
  }

  wrap.innerHTML = "";
  for (const g of groups) {
    const block = document.createElement("div");
    block.className = "prov-block";

    const head = document.createElement("div");
    head.className = "prov-head";
    head.innerHTML = "<b>" + esc(g.label) + '</b><span class="muted small">' + g.channelCount + " 条渠道</span>";
    block.appendChild(head);

    for (const ch of g.channels) {
      const row = document.createElement("div");
      row.className = "model-row";

      const left = document.createElement("div");
      const titleText = ch.providerLabel + (ch.plan ? (" · " + ch.plan) : "");
      const subParts = [ch.totalAccounts + " 个账号"];
      if (ch.sharedPool) subParts.push("与同池模型共享额度");
      if (ch.unknown > 0) subParts.push(ch.unknown + " 个读数异常");
      left.innerHTML = '<div style="font-weight:500">' + esc(titleText) + "</div>" +
        '<div class="muted" style="font-size:11px">' + esc(subParts.join(" · ")) + "</div>";

      const mid = document.createElement("div");
      if (Array.isArray(ch.windows) && ch.windows.length > 0) {
        mid.innerHTML = formatSummaryChips(ch.windows, ch.totalAccounts, mergeSecs, 4);
      } else if (Array.isArray(ch.balances) && ch.balances.length > 0) {
        mid.innerHTML = ch.balances.map((b) => '<span class="win-chip">' + esc(b) + "</span>").join("");
      } else {
        mid.innerHTML = '<span class="muted small">暂无可用读数</span>';
      }

      const right = document.createElement("div");
      if (!ch.t3Supported) {
        right.innerHTML = '<span class="tag muted">T3 暂不支持</span>';
      } else if (ch.syncedAccounts === ch.totalAccounts && ch.totalAccounts > 0) {
        right.innerHTML = '<span class="tag ok">已同步到 T3</span>';
      } else if (ch.syncedAccounts > 0) {
        right.innerHTML = '<span class="tag accent">已同步 ' + ch.syncedAccounts + "/" + ch.totalAccounts + "</span>";
      } else {
        right.innerHTML = '<span class="tag muted">未勾选</span>';
      }

      row.append(left, mid, right);
      block.appendChild(row);
    }

    wrap.appendChild(block);
  }
}

function renderTabs() {
  const isModel = activeTab === "model";
  $("tabProviderBtn").classList.toggle("active", !isModel);
  $("tabModelBtn").classList.toggle("active", isModel);
  $("providerView").style.display = isModel ? "none" : "block";
  $("modelView").style.display = isModel ? "block" : "none";
  $("otherCard").style.display = isModel ? "none" : "block";
}

function syncResetWindowControls(secs) {
  const editing =
    document.activeElement === $("resetWindowInput") ||
    document.activeElement === $("resetWindowUnit");
  if (!editing) {
    if (secs > 0 && secs % 60 === 0) {
      $("resetWindowUnit").value = "min";
      $("resetWindowInput").value = String(secs / 60);
    } else {
      $("resetWindowUnit").value = "sec";
      $("resetWindowInput").value = String(secs);
    }
  }
  document.querySelectorAll("button[data-rws]").forEach((btn) => {
    btn.classList.toggle("active", Number(btn.dataset.rws) === secs);
  });
}

function render() {
  if (!state) return;
  const cfg = state.config;
  const mergeSecs = cfg.resetMergeWindowSecs ?? 300;
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
    twEl.innerHTML = '<span class="muted">本机未检测到 T3 Code（' + esc(tw.settingsPath || "~/.t3/userdata/settings.json") + "）。如 T3 Code 在另一台电脑，请展开下方查看 SSH 隧道接入方式。</span>";
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

  // Highlight active preset card
  document.querySelectorAll(".preset-card").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.preset === cfg.mode);
  });

  // Compact status summary on collapsed Advanced drawer
  $("advSummaryHint").textContent =
    "重置合并 " + formatMergeWindow(mergeSecs) + " · 端口 " + state.port + (cfg.magpieUrl ? " · 自定义地址" : "");

  syncResetWindowControls(mergeSecs);

  $("pooledResetSelect").value = cfg.pooledResetStrategy || "when-aligned";
  $("pooledResetSelect").disabled = cfg.mode !== "pooled";
  $("pooledResetNote").textContent = cfg.mode === "pooled" ? "" : "（仅合并模式生效）";

  if (document.activeElement !== $("portInput")) {
    $("portInput").value = String(state.port);
  }
  if (!magpieUrlDirty && document.activeElement !== $("magpieUrlInput")) {
    $("magpieUrlInput").value = cfg.magpieUrl || "";
  }
  $("dirtyBar").classList.toggle("show", magpieUrlDirty);
  if (magpieUrlDirty) $("advancedDetails").open = true;

  $("autoSyncNewCheck").checked = cfg.selectionMode !== "only-selected";
  $("autoWireCheck").checked = cfg.autoWireT3Code !== false;
  $("keptOnlyCheck").checked = !!cfg.keptOnly;

  $("t3Error").textContent = state.magpieError ? ("读取 Magpie 额度失败：" + state.magpieError) : "";
  const unitLabel = cfg.mode === "pooled" ? "条合并额度" : "个账号";
  $("t3Count").textContent = "共 " + state.totalT3Accounts + " 个账号 · T3 Code 可见 " + state.exposedCount + " " + unitLabel;

  renderTabs();
  renderTree();
  renderModelView();

  const others = state.otherSummary || [];
  $("otherCount").textContent = others.length + " 个厂商";
  const otherWrap = $("otherTableWrap");
  if (others.length === 0) {
    otherWrap.innerHTML = '<div class="muted small" style="padding:4px 0">暂无其他厂商额度。</div>';
  } else {
    const rows = others.map((g) => {
      const detail = g.windows.length > 0
        ? formatSummaryChips(g.windows, g.total, mergeSecs, 4)
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

// Preset cards
document.querySelectorAll(".preset-card").forEach((btn) => {
  btn.onclick = () => {
    if (!state) return;
    const mode = btn.dataset.preset;
    const patch = { mode };
    if (mode === "pooled" && !state.config.pooledResetStrategy) {
      patch.pooledResetStrategy = "when-aligned";
    }
    Object.assign(state.config, patch);
    render();
    queueAutoSave(patch, PRESET_TOASTS[mode] || "已切换使用方式");
  };
});

// Reset merge window input + unit selector + quick buttons
function applyResetWindowFromInputs() {
  if (!state) return;
  const raw = $("resetWindowInput").value.trim();
  if (raw === "") return;
  const val = Number(raw);
  const unit = $("resetWindowUnit").value;
  const maxVal = unit === "min" ? 1440 : 86400;
  if (!Number.isInteger(val) || val < 0 || val > maxVal) {
    showToast("请输入 0 到 " + maxVal + (unit === "min" ? " 分钟" : " 秒") + "之间的整数", "warn");
    return;
  }
  const secs = unit === "min" ? val * 60 : val;
  state.config.resetMergeWindowSecs = secs;
  document.querySelectorAll("button[data-rws]").forEach((btn) => {
    btn.classList.toggle("active", Number(btn.dataset.rws) === secs);
  });
  $("advSummaryHint").textContent =
    "重置合并 " + formatMergeWindow(secs) + " · 端口 " + state.port + (state.config.magpieUrl ? " · 自定义地址" : "");
  queueAutoSave({ resetMergeWindowSecs: secs }, "重置时间合并窗口已设为 " + formatMergeWindow(secs));
}

$("resetWindowInput").oninput = applyResetWindowFromInputs;
$("resetWindowUnit").onchange = applyResetWindowFromInputs;

document.querySelectorAll("button[data-rws]").forEach((btn) => {
  btn.onclick = () => {
    if (!state) return;
    const secs = Number(btn.dataset.rws);
    state.config.resetMergeWindowSecs = secs;
    if (secs > 0 && secs % 60 === 0) {
      $("resetWindowUnit").value = "min";
      $("resetWindowInput").value = String(secs / 60);
    } else {
      $("resetWindowUnit").value = "sec";
      $("resetWindowInput").value = String(secs);
    }
    render();
    queueAutoSave({ resetMergeWindowSecs: secs }, "重置时间合并窗口已设为 " + formatMergeWindow(secs));
  };
});

$("pooledResetSelect").onchange = () => {
  const pooledResetStrategy = $("pooledResetSelect").value;
  state.config.pooledResetStrategy = pooledResetStrategy;
  queueAutoSave({ pooledResetStrategy });
};

$("autoSyncNewCheck").onchange = () => {
  const selectionMode = $("autoSyncNewCheck").checked ? "all-except" : "only-selected";
  const patch = { selectionMode };
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

// View tabs
$("tabProviderBtn").onclick = () => {
  activeTab = "provider";
  renderTabs();
};
$("tabModelBtn").onclick = () => {
  activeTab = "model";
  renderTabs();
};

// Quick selection shortcuts
$("quickAllBtn").onclick = () => {
  if (!state) return;
  const enabledProviders = { claude: true, codex: true, antigravity: true, grok: true };
  const patch = {
    enabledProviders,
    selectionMode: "all-except",
    selectedPlans: [],
    excludedPlans: [],
    selectedAccounts: [],
    excludedAccounts: [],
  };
  Object.assign(state.config, patch);
  queueAutoSave(patch, "已设为全部同步");
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
    const sorted = [...prov.plans].sort(
      (a, b) => planTierRank(b.plan) - planTierRank(a.plan) || b.totalCount - a.totalCount,
    );
    const best = sorted[0];
    selectedPlans.push(best.planKey);
    names.push((PROVIDER_NAMES[prov.id] || prov.id) + (best.plan ? (" " + best.plan) : ""));
  }
  const patch = {
    enabledProviders,
    selectionMode: "only-selected",
    selectedPlans,
    excludedPlans: [],
    selectedAccounts: [],
    excludedAccounts: [],
  };
  Object.assign(state.config, patch);
  queueAutoSave(patch, "已只选各家主力套餐：" + names.join("、"));
};

$("quickActiveBtn").onclick = () => {
  if (!state) return;
  const tree = state.accountTree || [];
  const enabledProviders = { ...state.config.enabledProviders };
  const activeKeys = [];
  for (const prov of tree) {
    for (const pg of prov.plans || []) {
      for (const a of pg.accounts || []) {
        if (a.last) {
          enabledProviders[prov.id] = true;
          activeKeys.push(a.key);
        }
      }
    }
  }
  if (activeKeys.length === 0) {
    showToast("当前 Magpie 暂无近期使用记录，未改动勾选", "warn");
    return;
  }
  const patch = {
    enabledProviders,
    selectionMode: "only-selected",
    selectedPlans: [],
    excludedPlans: [],
    selectedAccounts: activeKeys,
    excludedAccounts: [],
  };
  Object.assign(state.config, patch);
  queueAutoSave(patch, "已只选正在使用的 " + activeKeys.length + " 个账号");
};

$("quickNoneBtn").onclick = () => {
  if (!state) return;
  const patch = {
    selectionMode: "only-selected",
    selectedPlans: [],
    excludedPlans: [],
    selectedAccounts: [],
    excludedAccounts: [],
  };
  Object.assign(state.config, patch);
  queueAutoSave(patch, "已取消勾选所有账号");
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
