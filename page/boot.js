// Bootstrap page inside Magpie's sandboxed iframe (connect-src 'none', frame-src 'none').
// Navigates the frame to the plugin's own local HTTP service (or magpie.service
// when viewed remotely through `magpie web`), forwarding Magpie's theme tokens,
// language, and any `_o` browser-origin parameter used by reverse-proxy CSP.

(async () => {
  const DEFAULT_PORT = 3478;
  const BRIDGE_TIMEOUT_MS = 2500;
  let port = DEFAULT_PORT;
  let savedOptions = {};
  let theme = "";
  let tokens = null;
  let service = "";
  let lang = "";

  const applyWords = (rawLang) => {
    const say = words(rawLang || navigator.language);
    const said0 = document.getElementById("said");
    if (said0 && !document.getElementById("boot-fallback")) said0.textContent = say.connecting;
    const title0 = document.getElementById("bootTitle");
    if (title0) title0.textContent = say.title;
    return say;
  };

  // Paint localized status immediately before awaiting Magpie's bridge.
  let say = applyWords("");

  const withTimeout = (promise, ms) =>
    Promise.race([
      Promise.resolve(promise),
      new Promise((_, reject) => setTimeout(() => reject(new Error("bridge-timeout")), ms)),
    ]);

  try {
    if (window.magpie?.ready) {
      const t = await withTimeout(window.magpie.ready, BRIDGE_TIMEOUT_MS);
      if (t) {
        if (typeof t.dark === "boolean") theme = t.dark ? "dark" : "light";
        if (t.tokens && typeof t.tokens === "object") tokens = t.tokens;
        if (typeof t.lang === "string" && t.lang.trim()) lang = t.lang.trim();
      }
    }
  } catch { /* fallback to browser defaults */ }

  say = applyWords(lang);

  try {
    const s = window.magpie?.service;
    if (typeof s === "string" && /^https?:\/\//.test(s)) service = s;
  } catch { /* desktop or older magpie */ }

  try {
    if (window.magpie?.options?.get) {
      const o = await withTimeout(window.magpie.options.get(), BRIDGE_TIMEOUT_MS);
      if (o && typeof o === "object") {
        savedOptions = { ...o };
        if (Number.isFinite(Number(o.port)) && Number(o.port) > 0) {
          port = Number(o.port);
        }
      }
    }
  } catch { /* default port */ }

  const pageParams = new URLSearchParams(location.search);
  const ownOrigin = pageParams.get("_o");

  const applyParams = (u) => {
    if (theme) u.searchParams.set("theme", theme);
    if (lang) u.searchParams.set("lang", lang);
    if (ownOrigin && !u.searchParams.has("_o")) u.searchParams.set("_o", ownOrigin);
    const slim = {};
    for (const [k, v] of Object.entries(tokens || {})) {
      const s = String(v ?? "").trim();
      if (s) slim[k] = s;
    }
    if (Object.keys(slim).length > 0) {
      try {
        u.searchParams.set("tokens", btoa(unescape(encodeURIComponent(JSON.stringify(slim)))));
      } catch { /* skip tokens if encoding fails */ }
    }
    return u.toString();
  };

  function armTimeout(p) {
    setTimeout(() => {
      const said = document.getElementById("said");
      if (!said || document.getElementById("boot-fallback")) return;
      said.textContent = "";
      const box = document.createElement("div");
      box.id = "boot-fallback";

      const msg = document.createElement("p");
      msg.textContent = say.unreachable.replace("{p}", String(p));
      box.appendChild(msg);

      const controls = document.createElement("div");
      controls.style.cssText = "display:flex;gap:8px;justify-content:center;align-items:center;margin-top:10px;flex-wrap:wrap;";

      const retryBtn = document.createElement("button");
      retryBtn.type = "button";
      retryBtn.textContent = say.retry;
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
        switchBtn.textContent = say.switchPort;
        let busy = false;
        switchBtn.onclick = async () => {
          if (busy) return;
          const nextPort = Number(input.value);
          if (!Number.isInteger(nextPort) || nextPort < 1 || nextPort > 65535) {
            msg.textContent = say.badPort;
            return;
          }
          busy = true;
          switchBtn.disabled = true;
          msg.textContent = say.switching.replace("{p}", String(nextPort));
          try {
            await window.magpie.options.set({ ...savedOptions, port: nextPort });
            setTimeout(() => location.reload(), 1200);
          } catch (err) {
            msg.textContent = say.switchFail + String(err?.message || err);
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

  if (service) {
    let targetService = service;
    try {
      targetService = applyParams(new URL(service, location.href));
    } catch { /* fallback to raw service URL */ }
    armTimeout(port);
    location.replace(targetService);
    return;
  }

  const target = applyParams(new URL("http://127.0.0.1:" + port + "/"));
  if (!isLoopback(location.hostname)) {
    showRemote(port, target, say);
    return;
  }
  armTimeout(port);
  location.replace(target);
})();

function words(raw) {
  const s = String(raw || "").toLowerCase();
  const tw = s.startsWith("zh") && /(?:-tw|-hk|-mo|-hant)/.test(s);
  if (s.startsWith("zh") && !tw) {
    return {
      title: "T3 Code 额度", connecting: "正在连接本地服务…",
      unreachable: "连不上本地服务（127.0.0.1:{p}）：插件可能没开，或端口被占用。",
      retry: "重试", switchPort: "换端口重试", badPort: "端口需为 1–65535。",
      switching: "正在切换到端口 {p}…", switchFail: "切换失败：",
      remote1: "服务在 Magpie 所在机器的 127.0.0.1:{p}，当前浏览器无法直连。",
      remote2: "建立 SSH 端口转发后点「继续」：", go: "继续",
    };
  }
  if (tw) {
    return {
      title: "T3 Code 額度", connecting: "正在連線本機服務…",
      unreachable: "連不上本機服務（127.0.0.1:{p}）：外掛可能沒開，或連接埠被占用。",
      retry: "重試", switchPort: "換連接埠重試", badPort: "連接埠需為 1–65535。",
      switching: "正在切換到連接埠 {p}…", switchFail: "切換失敗：",
      remote1: "服務在 Magpie 所在機器的 127.0.0.1:{p}，目前瀏覽器無法直連。",
      remote2: "建立 SSH 連接埠轉發後按「繼續」：", go: "繼續",
    };
  }
  return {
    title: "T3 Code Quotas", connecting: "Connecting to the local service…",
    unreachable: "Can't reach the local service (127.0.0.1:{p}): the plugin may be off or the port is busy.",
    retry: "Retry", switchPort: "Switch port and retry", badPort: "Port must be 1–65535.",
    switching: "Switching to port {p}…", switchFail: "Switch failed: ",
    remote1: "The service runs on 127.0.0.1:{p} of the Magpie machine; this browser can't reach it directly.",
    remote2: "Set up an SSH port forward, then press Continue:", go: "Continue",
  };
}

function isLoopback(host) {
  const h = String(host || "").toLowerCase().replace(/^\[|\]$/g, "");
  return h === "" || h === "localhost" || h.endsWith(".localhost") || h === "::1" || /^127\./.test(h);
}

function showRemote(port, target, say) {
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
  p(say.remote1.replace("{p}", String(port)));
  p(say.remote2);
  const code = p("ssh -N -L " + port + ":127.0.0.1:" + port + " <user>@" + host);
  code.style.fontFamily = "ui-monospace, Menlo, Consolas, monospace";
  code.style.userSelect = "all";
  const go = document.createElement("button");
  go.type = "button";
  go.textContent = say.go;
  go.addEventListener("click", () => location.replace(target));
  said.appendChild(go);
}
