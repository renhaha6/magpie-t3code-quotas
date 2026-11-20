// Bootstrap page inside Magpie's sandboxed iframe (connect-src 'none', frame-src 'none').
// Navigates the frame to the plugin's own local HTTP service (or magpie.service
// when viewed remotely through `magpie web`), forwarding Magpie's theme tokens.
// If the target port is unreachable (plugin off or port busy), offers an inline port
// switcher powered by Magpie's native `magpie.options.set`.

(async () => {
  const DEFAULT_PORT = 3478;
  let port = DEFAULT_PORT;
  let savedOptions = {};
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
    if (o && typeof o === "object") {
      savedOptions = { ...o };
      if (Number.isFinite(Number(o.port)) && Number(o.port) > 0) {
        port = Number(o.port);
      }
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
      if (!said || document.getElementById("boot-fallback")) return;
      said.textContent = "";
      const box = document.createElement("div");
      box.id = "boot-fallback";

      const msg = document.createElement("p");
      msg.textContent =
        "无法连接本地服务（127.0.0.1:" + p + "），可能是插件未启用，或该端口已被其他程序占用。";
      box.appendChild(msg);

      const controls = document.createElement("div");
      controls.style.cssText = "display:flex;gap:8px;justify-content:center;align-items:center;margin-top:10px;flex-wrap:wrap;";

      const retryBtn = document.createElement("button");
      retryBtn.type = "button";
      retryBtn.textContent = "重试";
      retryBtn.onclick = () => location.reload();
      controls.appendChild(retryBtn);

      if (window.magpie?.options?.set) {
        const input = document.createElement("input");
        input.type = "number";
        input.min = "1";
        input.max = "65535";
        input.value = String(p === DEFAULT_PORT ? 13478 : p + 1);
        input.style.cssText = "width:96px;padding:4px 8px;border-radius:6px;";

        const switchBtn = document.createElement("button");
        switchBtn.type = "button";
        switchBtn.textContent = "更换端口并重试";
        let busy = false;
        switchBtn.onclick = async () => {
          if (busy) return;
          const nextPort = Number(input.value);
          if (!Number.isInteger(nextPort) || nextPort < 1 || nextPort > 65535) {
            msg.textContent = "请输入 1 到 65535 之间的有效端口号。";
            return;
          }
          busy = true;
          switchBtn.disabled = true;
          msg.textContent = "正在将端口更新为 " + nextPort + " 并重启服务…";
          try {
            await window.magpie.options.set({ ...savedOptions, port: nextPort });
            setTimeout(() => location.reload(), 1200);
          } catch (err) {
            msg.textContent = "更新端口失败：" + String(err?.message || err);
            busy = false;
            switchBtn.disabled = false;
          }
        };
        controls.append(input, switchBtn);
      }

      box.appendChild(controls);
      said.appendChild(box);
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
  p("服务运行在 Magpie 所在机器的 127.0.0.1:" + port + "，当前浏览器无法直连。");
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
