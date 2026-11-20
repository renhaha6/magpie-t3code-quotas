import crypto from "node:crypto";
import http from "node:http";
import {
  buildAuthFilesResponse,
  buildModelGroups,
  classifyMagpieQuotas,
  handleManagementApiCall,
  isAccountSelected,
  selectExposedAccounts,
} from "./adapter.mjs";
import {
  createConfigStore,
  DEFAULT_PORT,
  parsePort,
  resolveMagpieBaseUrl,
  syncPluginPortInMagpie,
} from "./config.mjs";
import { summarizeProviderQuotas } from "./pool.mjs";
import {
  inspectT3CodeHub,
  isEphemeralCliPort,
  removeT3CodeHub,
  resolveT3SettingsPath,
  syncT3CodeHub,
} from "./t3wire.mjs";
import { renderUiHtml } from "./ui.mjs";

const MAX_BODY_BYTES = 256 * 1024;
const KEPT_CACHE_TTL_MS = 2_000;
const LIVE_CACHE_TTL_MS = 30_000;
const FETCH_TIMEOUT_MS = 16_000;
const RETRY_DELAY_MS = 250;
const MAX_BIND_ATTEMPTS = 60;

function timingSafeEqualString(a, b) {
  const bufA = Buffer.from(String(a ?? ""), "utf8");
  const bufB = Buffer.from(String(b ?? ""), "utf8");
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

function isAuthorizedBearer(req, expectedKey) {
  const header = String(req.headers.authorization || "");
  const m = header.match(/^Bearer\s+(.+)$/i);
  if (!m || !expectedKey) return false;
  return timingSafeEqualString(m[1].trim(), expectedKey);
}

/**
 * Strict Host header validation to prevent DNS rebinding attacks.
 * Allows only loopback hosts (127.0.0.1, localhost, [::1]) matching the active port.
 * Note: Magpie's `magpie web` reverse proxy rewrites Host to `127.0.0.1:<port>`.
 */
export function isAllowedHostHeader(hostHeader, activePort) {
  const raw = String(hostHeader || "").trim().toLowerCase();
  if (!raw) return false;
  const allowedHosts = new Set([
    `127.0.0.1:${activePort}`,
    `localhost:${activePort}`,
    `[::1]:${activePort}`,
  ]);
  if (activePort === 80) {
    allowedHosts.add("127.0.0.1");
    allowedHosts.add("localhost");
    allowedHosts.add("[::1]");
  }
  return allowedHosts.has(raw);
}

function isLoopbackOrSandboxOrigin(origin, activePort) {
  if (!origin) return true;
  if (origin === "null") return true; // Magpie desktop WKWebView sandbox="allow-scripts" iframe
  try {
    const u = new URL(origin);
    if (u.protocol !== "http:" && u.protocol !== "https:") return false;
    const hostOk = u.hostname === "127.0.0.1" || u.hostname === "localhost" || u.hostname === "[::1]";
    if (!hostOk) return false;
    const port = u.port ? Number(u.port) : u.protocol === "https:" ? 443 : 80;
    return port === activePort;
  } catch {
    return false;
  }
}

function sendJson(res, status, data, extraHeaders = {}) {
  const body = JSON.stringify(data);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    ...extraHeaders,
  });
  res.end(body);
}

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let bytes = 0;
    const chunks = [];
    req.on("data", (chunk) => {
      bytes += chunk.length;
      if (bytes > MAX_BODY_BYTES) {
        reject(Object.assign(new Error("请求体过大"), { statusCode: 413 }));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => {
      const raw = Buffer.concat(chunks).toString("utf8").trim();
      if (!raw) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(raw));
      } catch {
        reject(Object.assign(new Error("无效的 JSON 请求体"), { statusCode: 400 }));
      }
    });
    req.on("error", (err) => reject(err));
  });
}

function summarizeOtherProviders(otherAccounts, cfg, nowMs) {
  const groups = new Map();
  for (const q of otherAccounts) {
    const id = String(q.provider || q.name || "unknown");
    let g = groups.get(id);
    if (!g) {
      g = { provider: id, name: String(q.name || id), quotas: [] };
      groups.set(id, g);
    }
    g.quotas.push(q);
  }

  const out = [];
  for (const g of groups.values()) {
    const summary = summarizeProviderQuotas(g.quotas, nowMs, {
      resetStrategy: "earliest",
      resetMergeWindowSecs: cfg?.resetMergeWindowSecs,
    });
    const balances = g.quotas
      .map((q) => (q.balance ? `${q.user || q.alias || g.name}: ${q.balance}` : ""))
      .filter(Boolean);
    out.push({
      provider: g.provider,
      name: g.name,
      total: summary.total,
      readable: summary.readable,
      unknown: summary.unknown,
      windows: summary.windows,
      balances,
    });
  }
  return out;
}

/**
 * Build a Provider -> Plan -> Account tree with plan-level aggregate remaining %
 * and both soonest single-account refill & latest full-reset timestamps.
 */
function buildAccountTree(t3Accounts, exposed, cfg, nowMs) {
  // Map source account key -> how it appears in `exposed`
  const exposureByKey = new Map();
  for (const item of exposed) {
    const members = Array.isArray(item.memberKeys) ? item.memberKeys : [item.key];
    const isPooled = members.length > 1 || Boolean(item.pooledCount && item.pooledCount > 1);
    for (const k of members) {
      exposureByKey.set(k, {
        exposedKey: item.key,
        exposedLabel: item.displayLabel,
        pooled: isPooled,
        fallbackActive: Boolean(item.fallbackActive),
      });
    }
  }

  const providersMap = new Map();
  for (const acc of t3Accounts) {
    let prov = providersMap.get(acc.canonical);
    if (!prov) {
      prov = {
        id: acc.canonical,
        enabled: cfg.enabledProviders[acc.canonical] !== false,
        plansMap: new Map(),
      };
      providersMap.set(acc.canonical, prov);
    }
    let planGroup = prov.plansMap.get(acc.planKey);
    if (!planGroup) {
      planGroup = {
        planKey: acc.planKey,
        plan: acc.plan || "",
        rawQuotas: [],
        accounts: [],
      };
      prov.plansMap.set(acc.planKey, planGroup);
    }
    planGroup.rawQuotas.push(acc.quota);

    const exp = exposureByKey.get(acc.key);
    const checked = isAccountSelected(acc, cfg);
    planGroup.accounts.push({
      key: acc.key,
      canonical: acc.canonical,
      plan: acc.plan,
      planKey: acc.planKey,
      displayLabel: acc.displayLabel,
      from: acc.quota.from || "",
      last: Boolean(acc.quota.last),
      asOf: acc.quota.asOf || acc.quota.readAt || null,
      error: acc.quota.error || "",
      windows: acc.quota.windows || [],
      checked,
      syncStatus: exp
        ? exp.pooled
          ? "pooled"
          : exp.fallbackActive
            ? "fallback"
            : "synced"
        : "hidden",
      exposedLabel: exp?.exposedLabel || "",
    });
  }

  const tree = [];
  for (const prov of providersMap.values()) {
    const plans = [];
    let totalAccounts = 0;
    let syncedAccounts = 0;

    for (const pg of prov.plansMap.values()) {
      const selectedCount = pg.accounts.filter((a) => a.checked).length;
      const syncedCount = pg.accounts.filter((a) => a.syncStatus !== "hidden").length;
      totalAccounts += pg.accounts.length;
      syncedAccounts += syncedCount;

      const summary = summarizeProviderQuotas(pg.rawQuotas, nowMs, {
        resetStrategy: "earliest",
        resetMergeWindowSecs: cfg?.resetMergeWindowSecs,
      });
      plans.push({
        planKey: pg.planKey,
        plan: pg.plan,
        totalCount: pg.accounts.length,
        selectedCount,
        syncedCount,
        summary,
        accounts: pg.accounts,
      });
    }

    tree.push({
      id: prov.id,
      enabled: prov.enabled,
      totalAccounts,
      syncedAccounts,
      plans,
    });
  }

  return tree;
}

export function createAdapterHandler({
  configStore,
  getListeningPort,
  rebindPort,
  t3SettingsPath = null,
  ephemeralCli = false,
  uiToken = crypto.randomBytes(24).toString("hex"),
  fetchImpl = globalThis.fetch,
  env = process.env,
  now = () => Date.now(),
} = {}) {
  let cache = { at: 0, key: "", quotas: null };
  const inflight = new Map();
  const uiHtml = renderUiHtml({ uiToken });

  async function fetchMagpieQuotas(cfg, { bypassCache = false, forceLive = false } = {}) {
    const baseUrl = resolveMagpieBaseUrl(cfg.magpieUrl, env);
    const useKept = forceLive ? false : cfg.keptOnly;
    const url = `${baseUrl}/v1/magpie/quotas${useKept ? "?kept=1" : ""}`;
    const cacheKey = `${url}|${cfg.magpieApiKey || ""}`;
    const ttl = useKept ? KEPT_CACHE_TTL_MS : LIVE_CACHE_TTL_MS;
    const nowMs = now();

    if (!bypassCache && cache.quotas && cache.key === cacheKey && nowMs - cache.at < ttl) {
      return { baseUrl, quotas: cache.quotas };
    }

    // Coalesce concurrent fetches so N parallel api-call requests only query Magpie once.
    if (!bypassCache && inflight.has(cacheKey)) {
      return inflight.get(cacheKey);
    }

    const work = (async () => {
      const headers = { Accept: "application/json" };
      if (cfg.magpieApiKey) {
        headers.Authorization = `Bearer ${cfg.magpieApiKey}`;
      }
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
      try {
        const res = await fetchImpl(url, { headers, signal: controller.signal });
        if (!res.ok) {
          const text = await res.text().catch(() => "");
          throw new Error(
            `Magpie 接口返回 HTTP ${res.status}${text ? `: ${text.slice(0, 160)}` : ""}`,
          );
        }
        const payload = await res.json();
        const quotas = Array.isArray(payload?.data)
          ? payload.data
          : Array.isArray(payload)
            ? payload
            : [];
        cache = { at: now(), key: cacheKey, quotas };
        return { baseUrl, quotas };
      } finally {
        clearTimeout(timer);
        inflight.delete(cacheKey);
      }
    })();

    inflight.set(cacheKey, work);
    return work;
  }

  function runT3Sync(cfg, activePort, { forceKey = false, forceEnable = false } = {}) {
    if (!t3SettingsPath || ephemeralCli) {
      return { changed: false, wired: false, status: "disabled", wiredKeyHash: "", error: "" };
    }
    const result = syncT3CodeHub({
      settingsPath: t3SettingsPath,
      url: `http://127.0.0.1:${activePort}`,
      managementKey: cfg.managementKey,
      lastWiredKeyHash: cfg.lastWiredKeyHash,
      forceKey,
      forceEnable,
    });
    if (result.wiredKeyHash && result.wiredKeyHash !== cfg.lastWiredKeyHash) {
      configStore.update({ lastWiredKeyHash: result.wiredKeyHash });
    }
    return result;
  }

  return async function handleRequest(req, res) {
    const cfg = configStore.get();
    const activePort = getListeningPort ? getListeningPort() : cfg.port;

    // Anti-DNS-rebinding: reject requests with non-loopback Host headers.
    if (!isAllowedHostHeader(req.headers.host, activePort)) {
      sendJson(res, 403, { error: "Forbidden Host header" });
      return;
    }

    const url = new URL(req.url || "/", `http://127.0.0.1:${activePort}`);
    const pathname = url.pathname;
    const method = (req.method || "GET").toUpperCase();
    const origin = req.headers.origin;
    const originAllowed = isLoopbackOrSandboxOrigin(origin, activePort);
    const uiCorsHeaders =
      origin && originAllowed
        ? {
            "Access-Control-Allow-Origin": origin,
            "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
            "Access-Control-Allow-Headers": "Content-Type, X-UI-Token",
          }
        : {};

    if (method === "OPTIONS" && pathname.startsWith("/api/")) {
      if (!originAllowed) {
        sendJson(res, 403, { error: "Forbidden origin" });
        return;
      }
      res.writeHead(204, uiCorsHeaders);
      res.end();
      return;
    }

    // 1. Health check (loopback-only, no secrets)
    if (method === "GET" && pathname === "/health") {
      sendJson(res, 200, { ok: true, port: activePort });
      return;
    }

    // 2. CLIProxyAPI Management endpoints consumed by T3 Code UsageLimitSources
    if (pathname.startsWith("/v0/management/")) {
      if (!isAuthorizedBearer(req, cfg.managementKey)) {
        sendJson(res, 401, { error: "Unauthorized: invalid management key" });
        return;
      }

      if (method === "GET" && pathname === "/v0/management/auth-files") {
        try {
          const { quotas } = await fetchMagpieQuotas(cfg);
          const { t3Accounts } = classifyMagpieQuotas(quotas);
          const exposed = selectExposedAccounts(t3Accounts, cfg, now());
          sendJson(res, 200, buildAuthFilesResponse(exposed));
        } catch (err) {
          sendJson(res, 502, { error: String(err?.message || err) });
        }
        return;
      }

      if (method === "POST" && pathname === "/v0/management/api-call") {
        try {
          const body = await readJsonBody(req);
          const { quotas } = await fetchMagpieQuotas(cfg);
          const { t3Accounts } = classifyMagpieQuotas(quotas);
          const exposed = selectExposedAccounts(t3Accounts, cfg, now());
          const reply = handleManagementApiCall(exposed, body, now());
          sendJson(res, 200, reply);
        } catch (err) {
          const status = err?.statusCode || 502;
          sendJson(res, status, { error: String(err?.message || err) });
        }
        return;
      }

      if (method === "POST" && pathname === "/v0/management/reset-quota") {
        sendJson(res, 501, { error: "Read-only adapter: reset credits in Magpie." });
        return;
      }

      sendJson(res, 404, { error: "Unknown management route" });
      return;
    }

    // 3. Control UI (no Access-Control-Allow-Origin so foreign origins cannot read UI_TOKEN)
    if (method === "GET" && (pathname === "/" || pathname === "/index.html")) {
      res.writeHead(200, {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "no-store",
        "Content-Security-Policy": `default-src 'self' 'unsafe-inline'; connect-src 'self' http://127.0.0.1:${activePort}; img-src 'self' data:`,
      });
      res.end(uiHtml);
      return;
    }

    // 4. Control UI APIs — require valid Origin + per-launch X-UI-Token
    if (pathname.startsWith("/api/")) {
      if (!originAllowed) {
        sendJson(res, 403, { error: "Forbidden origin" });
        return;
      }
      const presentedToken = String(req.headers["x-ui-token"] || "");
      if (!timingSafeEqualString(presentedToken, uiToken)) {
        sendJson(res, 403, { error: "Missing or invalid UI token" }, uiCorsHeaders);
        return;
      }

      if (method === "GET" && pathname === "/api/status") {
        const refresh = url.searchParams.get("refresh") === "1";
        const forceLive = url.searchParams.get("live") === "1";
        const resolvedMagpieUrl = resolveMagpieBaseUrl(cfg.magpieUrl, env);
        const nowMs = now();
        let t3Accounts = [];
        let exposed = [];
        let accountTree = [];
        let modelGroups = [];
        let otherSummary = [];
        let magpieError = "";

        try {
          const { quotas } = await fetchMagpieQuotas(cfg, {
            bypassCache: refresh || forceLive,
            forceLive,
          });
          const classified = classifyMagpieQuotas(quotas);
          exposed = selectExposedAccounts(classified.t3Accounts, cfg, nowMs);
          accountTree = buildAccountTree(classified.t3Accounts, exposed, cfg, nowMs);
          modelGroups = buildModelGroups(
            classified.t3Accounts,
            classified.otherAccounts,
            exposed,
            cfg,
            nowMs,
          );
          t3Accounts = classified.t3Accounts.map((a) => ({
            key: a.key,
            canonical: a.canonical,
            plan: a.plan,
            planKey: a.planKey,
            displayLabel: a.displayLabel,
          }));
          otherSummary = summarizeOtherProviders(classified.otherAccounts, cfg, nowMs);
        } catch (err) {
          magpieError = String(err?.message || err);
        }

        const hubUrl = `http://127.0.0.1:${activePort}`;
        const t3Wire = inspectT3CodeHub({
          settingsPath: t3SettingsPath,
          url: hubUrl,
          managementKey: cfg.managementKey,
          lastWiredKeyHash: cfg.lastWiredKeyHash,
        });

        sendJson(
          res,
          200,
          {
            hubUrl,
            port: activePort,
            resolvedMagpieUrl,
            config: configStore.getPublic(),
            t3Wire,
            magpieError,
            totalT3Accounts: t3Accounts.length,
            exposedCount: exposed.length,
            exposed: exposed.map((a) => ({
              key: a.key,
              canonical: a.canonical,
              displayLabel: a.displayLabel,
              pooledCount: a.pooledCount || 1,
            })),
            accountTree,
            modelGroups,
            otherSummary,
          },
          uiCorsHeaders,
        );
        return;
      }

      if (method === "POST" && pathname === "/api/config") {
        try {
          const body = await readJsonBody(req);
          const prevKey = cfg.managementKey;
          const updated = configStore.update(body);
          cache = { at: 0, key: "", quotas: null };
          const keyChanged = updated.managementKey !== prevKey;

          let t3WireResult = null;
          if (updated.autoWireT3Code && t3SettingsPath && !ephemeralCli) {
            t3WireResult = runT3Sync(updated, activePort, { forceKey: keyChanged });
          }

          sendJson(
            res,
            200,
            { ok: true, config: configStore.getPublic(), t3WireResult },
            uiCorsHeaders,
          );
        } catch (err) {
          sendJson(
            res,
            err?.statusCode || 400,
            { error: String(err?.message || err) },
            uiCorsHeaders,
          );
        }
        return;
      }

      if (method === "POST" && pathname === "/api/port") {
        try {
          const body = await readJsonBody(req);
          const nextPort = parsePort(body?.port);
          if (!nextPort) {
            sendJson(res, 400, { error: "请输入 1 到 65535 之间的有效端口号" }, uiCorsHeaders);
            return;
          }
          if (nextPort === activePort) {
            sendJson(
              res,
              200,
              { ok: true, changed: false, port: activePort, url: `http://127.0.0.1:${activePort}/` },
              uiCorsHeaders,
            );
            return;
          }
          if (!rebindPort) {
            sendJson(res, 501, { error: "当前运行环境不支持在线切换端口" }, uiCorsHeaders);
            return;
          }

          const switched = await rebindPort(nextPort);
          sendJson(res, 200, switched, uiCorsHeaders);
        } catch (err) {
          const status = err?.code === "EADDRINUSE" ? 409 : err?.statusCode || 500;
          const msg =
            err?.code === "EADDRINUSE"
              ? `端口已被其他程序占用，请换一个端口`
              : String(err?.message || err);
          sendJson(res, status, { error: msg }, uiCorsHeaders);
        }
        return;
      }

      if (method === "POST" && pathname === "/api/t3/wire") {
        if (!t3SettingsPath) {
          sendJson(res, 400, { error: "未配置本机 T3 Code 路径" }, uiCorsHeaders);
          return;
        }
        const body = await readJsonBody(req).catch(() => ({}));
        const patch = { autoWireT3Code: true };
        if (typeof body?.managementKey === "string" && body.managementKey.trim()) {
          patch.managementKey = body.managementKey.trim();
        }
        const updated = configStore.update(patch);
        const result = runT3Sync(updated, activePort, { forceKey: true, forceEnable: true });
        if (result.status === "t3-not-found") {
          sendJson(
            res,
            404,
            { ok: false, error: `未找到本机 T3 Code 配置文件（${t3SettingsPath}）`, result },
            uiCorsHeaders,
          );
          return;
        }
        sendJson(
          res,
          result.error ? 400 : 200,
          { ok: !result.error, result, config: configStore.getPublic() },
          uiCorsHeaders,
        );
        return;
      }

      if (method === "POST" && pathname === "/api/t3/unwire") {
        if (!t3SettingsPath) {
          sendJson(res, 400, { error: "未配置本机 T3 Code 路径" }, uiCorsHeaders);
          return;
        }
        const updated = configStore.update({ autoWireT3Code: false, lastWiredKeyHash: "" });
        const result = removeT3CodeHub({ settingsPath: t3SettingsPath });
        sendJson(
          res,
          result.error ? 400 : 200,
          { ok: !result.error, result, config: configStore.getPublic() },
          uiCorsHeaders,
        );
        return;
      }
    }

    sendJson(res, 404, { error: "Not Found" });
  };
}

function tryListen(server, port, host = "127.0.0.1") {
  return new Promise((resolve, reject) => {
    const onError = (err) => {
      server.removeListener("listening", onListening);
      reject(err);
    };
    const onListening = () => {
      server.removeListener("error", onError);
      const addr = server.address();
      resolve(typeof addr === "object" && addr ? addr.port : port);
    };
    server.once("error", onError);
    server.once("listening", onListening);
    server.listen(port, host);
  });
}

/**
 * Start the local HTTP server on 127.0.0.1:<port>.
 * Supports safe live port rebinding (`POST /api/port`) and background EADDRINUSE
 * handoff during Magpie plugin host restarts.
 */
export async function startServer({
  configDir,
  hostOptions = {},
  t3SettingsPath,
  uiToken = crypto.randomBytes(24).toString("hex"),
  fetchImpl = globalThis.fetch,
  env = process.env,
  now = () => Date.now(),
  portOverride,
} = {}) {
  const configStore = createConfigStore({ configDir, hostOptions });
  const targetPort = portOverride !== undefined ? portOverride : configStore.get().port;
  let boundPort = targetPort;
  const resolvedT3Path =
    t3SettingsPath !== undefined
      ? t3SettingsPath
      : configDir === null
        ? null
        : resolveT3SettingsPath(env);
  const ephemeralCli = isEphemeralCliPort({
    configDir,
    runningPort: targetPort,
    defaultPort: DEFAULT_PORT,
  });

  const autoWireOnReady = (port) => {
    const cfg = configStore.get();
    if (!cfg.autoWireT3Code || !resolvedT3Path || ephemeralCli) return null;
    const res = syncT3CodeHub({
      settingsPath: resolvedT3Path,
      url: `http://127.0.0.1:${port}`,
      managementKey: cfg.managementKey,
      lastWiredKeyHash: cfg.lastWiredKeyHash,
    });
    if (res.wiredKeyHash && res.wiredKeyHash !== cfg.lastWiredKeyHash) {
      configStore.update({ lastWiredKeyHash: res.wiredKeyHash });
    }
    if (res.error) {
      console.error("[magpie-t3code-quotas] T3 Code auto-wire skipped:", res.error);
    } else if (res.changed) {
      console.log(`[magpie-t3code-quotas] auto-wired T3 Code hub in ${resolvedT3Path}`);
    }
    return res;
  };

  let activeServer = null;
  let requestHandler = null;

  const makeHttpServer = () =>
    http.createServer((req, res) => {
      Promise.resolve(requestHandler(req, res)).catch((err) => {
        if (!res.headersSent) {
          sendJson(res, 500, { error: String(err?.message || err) });
        }
      });
    });

  const rebindPort = async (nextPort) => {
    const candidate = makeHttpServer();
    const newBoundPort = await tryListen(candidate, nextPort, "127.0.0.1");
    const oldServer = activeServer;
    activeServer = candidate;
    boundPort = newBoundPort;

    const updated = configStore.update({ port: newBoundPort }, { allowPortChange: true });
    const magpieSync = syncPluginPortInMagpie({ configDir, port: newBoundPort });
    let t3WireResult = null;
    if (updated.autoWireT3Code && resolvedT3Path && !ephemeralCli) {
      t3WireResult = syncT3CodeHub({
        settingsPath: resolvedT3Path,
        url: `http://127.0.0.1:${newBoundPort}`,
        managementKey: updated.managementKey,
        lastWiredKeyHash: updated.lastWiredKeyHash,
      });
    }

    // Close old listener shortly after sending the HTTP response on the old port.
    if (oldServer && oldServer.listening) {
      setTimeout(() => {
        try {
          oldServer.close();
        } catch {}
      }, 400);
    }

    return {
      ok: true,
      changed: true,
      port: newBoundPort,
      url: `http://127.0.0.1:${newBoundPort}/`,
      magpiePluginsUpdated: magpieSync.updated,
      t3WireResult,
    };
  };

  requestHandler = createAdapterHandler({
    configStore,
    getListeningPort: () => boundPort,
    rebindPort,
    t3SettingsPath: resolvedT3Path,
    ephemeralCli,
    uiToken,
    fetchImpl,
    env,
    now,
  });

  activeServer = makeHttpServer();

  const close = () =>
    new Promise((resolve) => {
      if (!activeServer || !activeServer.listening) return resolve();
      activeServer.close(() => resolve());
    });

  try {
    boundPort = await tryListen(activeServer, targetPort, "127.0.0.1");
    autoWireOnReady(boundPort);
    return {
      listening: true,
      get port() {
        return boundPort;
      },
      uiToken,
      get server() {
        return activeServer;
      },
      configStore,
      ready: Promise.resolve(boundPort),
      close,
    };
  } catch (err) {
    if (err?.code !== "EADDRINUSE" || targetPort === 0) {
      throw err;
    }

    let cancelled = false;
    const ready = (async () => {
      for (let attempt = 1; attempt <= MAX_BIND_ATTEMPTS && !cancelled; attempt += 1) {
        await new Promise((r) => setTimeout(r, RETRY_DELAY_MS));
        if (cancelled) return null;
        try {
          boundPort = await tryListen(activeServer, targetPort, "127.0.0.1");
          autoWireOnReady(boundPort);
          return boundPort;
        } catch (retryErr) {
          if (retryErr?.code !== "EADDRINUSE") throw retryErr;
        }
      }
      throw new Error(`端口 127.0.0.1:${targetPort} 持续被占用，请换一个端口`);
    })();

    return {
      listening: false,
      get port() {
        return boundPort;
      },
      uiToken,
      get server() {
        return activeServer;
      },
      configStore,
      ready,
      close: async () => {
        cancelled = true;
        await close();
      },
    };
  }
}
