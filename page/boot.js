// Bootstrap page inside Magpie's sandboxed iframe (connect-src 'none').
// Navigates the frame to the plugin's own local HTTP service (or magpie.service
// when viewed remotely through `magpie web`), forwarding Magpie's theme tokens.

(async () => {
  const DEFAULT_PORT = 3478;
  let port = DEFAULT_PORT;
  let theme = "";
  let tokens = null;
  let service = "";

  try {
    const t = await window.magpie?.ready;
    if (t) {
      if (typeof t.dark === "boolean") theme = t.dark ? "dark" : "light";
      if (t.tokens && typeof t.tokens === "object") tokens = t.tokens;
    }
  } catch { /* fallback to default theme */ }

  try {
    const s = window.magpie?.service;
    if (typeof s === "string" && /^https?:\/\//.test(s)) service = s;
  } catch { /* desktop or older magpie */ }

  try {
    const o = await window.magpie?.options?.get?.();
    if (o && Number.isFinite(Number(o.port)) && Number(o.port) > 0) {
      port = Number(o.port);
    }
  } catch { /* default port */ }

  const q = new URLSearchParams();
  if (theme) q.set("theme", theme);
  const slim = {};
  for (const [k, v] of Object.entries(tokens || {})) {
    const s = String(v ?? "").trim();
    if (s) slim[k] = s;
  }
  if (Object.keys(slim).length > 0) {
    try {
      q.set("tokens", btoa(unescape(encodeURIComponent(JSON.stringify(slim)))));
    } catch { /* skip tokens if encoding fails */ }
  }

  function armTimeout(p) {
    setTimeout(() => {
      const said = document.getElementById("said");
      if (!said) return;
      said.textContent = "本地适配服务未响应（127.0.0.1:" + p + "），请确认插件已开启。";
      if (document.getElementById("boot-retry")) return;
      const btn = document.createElement("button");
      btn.id = "boot-retry";
      btn.type = "button";
      btn.textContent = "重试";
      btn.addEventListener("click", () => location.reload());
      said.parentNode.appendChild(btn);
    }, 5000);
  }

  const query = q.toString();
  if (service) {
    armTimeout(port);
    location.replace(service + (query ? "?" + query : ""));
    return;
  }

  const target = "http://127.0.0.1:" + port + "/" + (query ? "?" + query : "");
  if (!isLoopback(location.hostname)) {
    showRemote(port, target);
    return;
  }
  armTimeout(port);
  location.replace(target);
})();

function isLoopback(host) {
  const h = String(host || "").toLowerCase().replace(/^\[|\]$/g, "");
  return h === "" || h === "localhost" || h.endsWith(".localhost") || h === "::1" || /^127\./.test(h);
}

function showRemote(port, target) {
  const said = document.getElementById("said");
  if (!said) return;
  const host = location.hostname.replace(/^\[|\]$/g, "");
  said.textContent = "";
  const p = (text) => {
    const el = document.createElement("p");
    el.textContent = text;
    said.appendChild(el);
    return el;
  };
  p("适配服务运行在 Magpie 所在机器的 127.0.0.1:" + port + "，当前浏览器无法直连。");
  p("请建立 SSH 端口转发后点击「继续」：");
  const code = p("ssh -N -L " + port + ":127.0.0.1:" + port + " <user>@" + host);
  code.style.fontFamily = "ui-monospace, Menlo, Consolas, monospace";
  code.style.userSelect = "all";
  const go = document.createElement("button");
  go.type = "button";
  go.textContent = "继续";
  go.addEventListener("click", () => location.replace(target));
  said.appendChild(go);
}
