import crypto from "node:crypto";
import http from "node:http";
import {
  buildAuthFilesResponse,
  classifyMagpieQuotas,
  handleManagementApiCall,
  selectExposedAccounts,
} from "./adapter.mjs";
import { createConfigStore, resolveMagpieBaseUrl } from "./config.mjs";
import { summarizeProviderQuotas } from "./pool.mjs";
import { renderUiHtml } from "./ui.mjs";

const MAX_BODY_BYTES = 256 * 1024;
const SNAPSHOT_TTL_MS = 2000;
const FETCH_TIMEOUT_MS = 12_000;
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
  if (!m) return false;
  return timingSafeEqualString(m[1].trim(), expectedKey);
}

function isAllowedUiOrigin(origin) {
  if (!origin || origin === "null") return true;
  try {
    const u = new URL(origin);
    return (
      u.hostname === "127.0.0.1" ||
      u.hostname === "localhost" ||
      u.hostname === "[::1]" ||
      u.hostname.endsWith(".localhost")
    );
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
        reject(Object.assign(new Error("Request body too large"), { statusCode: 413 }));
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
        reject(Object.assign(new Error("Invalid JSON body"), { statusCode: 400 }));
      }
    });
    req.on("error", (err) => reject(err));
  });
}

function summarizeOtherProviders(otherAccounts, nowMs) {
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
    const summary = summarizeProviderQuotas(g.quotas, nowMs);
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

export function createAdapterHandler({
  configStore,
  getListeningPort,
  fetchImpl = globalThis.fetch,
  env = process.env,
  now = () => Date.now(),
} = {}) {
  let cache = { at: 0, key: "", quotas: null };
  const uiHtml = renderUiHtml();

  async function fetchMagpieQuotas(cfg, { bypassCache = false } = {}) {
    const baseUrl = resolveMagpieBaseUrl(cfg.magpieUrl, env);
    const url = `${baseUrl}/v1/magpie/quotas${cfg.keptOnly ? "?kept=1" : ""}`;
    const cacheKey = `${url}|${cfg.magpieApiKey || ""}`;
    const nowMs = now();

    if (!bypassCache && cache.quotas && cache.key === cacheKey && nowMs - cache.at < SNAPSHOT_TTL_MS) {
      return { baseUrl, quotas: cache.quotas };
    }

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
        throw new Error(`Magpie /v1/magpie/quotas HTTP ${res.status}${text ? `: ${text.slice(0, 160)}` : ""}`);
      }
      const payload = await res.json();
      const quotas = Array.isArray(payload?.data)
        ? payload.data
        : Array.isArray(payload)
          ? payload
          : [];
      cache = { at: nowMs, key: cacheKey, quotas };
      return { baseUrl, quotas };
    } finally {
      clearTimeout(timer);
    }
  }

  return async function handleRequest(req, res) {
    const url = new URL(req.url || "/", "http://127.0.0.1");
    const pathname = url.pathname;
    const method = (req.method || "GET").toUpperCase();
    const cfg = configStore.get();
    const activePort = getListeningPort ? getListeningPort() : cfg.port;
    const origin = req.headers.origin;
    const uiCorsHeaders =
      origin && isAllowedUiOrigin(origin)
        ? {
            "Access-Control-Allow-Origin": origin,
            "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
            "Access-Control-Allow-Headers": "Content-Type",
          }
        : {};

    if (method === "OPTIONS" && pathname.startsWith("/api/")) {
      res.writeHead(204, uiCorsHeaders);
      res.end();
      return;
    }

    // 1. Health check
    if (method === "GET" && pathname === "/health") {
      sendJson(res, 200, {
        ok: true,
        port: activePort,
        magpieUrl: resolveMagpieBaseUrl(cfg.magpieUrl, env),
      });
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

    // 3. Control UI (served to Magpie desktop frame and magpie web reverse proxy)
    if (method === "GET" && (pathname === "/" || pathname === "/index.html")) {
      res.writeHead(200, {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "no-cache",
        "Content-Security-Policy": `default-src 'self' 'unsafe-inline'; connect-src 'self' http://127.0.0.1:${activePort}; img-src 'self' data:`,
      });
      res.end(uiHtml);
      return;
    }

    // 4. Control UI APIs (loopback / sandboxed Magpie frame only)
    if (pathname.startsWith("/api/")) {
      if (origin && !isAllowedUiOrigin(origin)) {
        sendJson(res, 403, { error: "Forbidden origin" });
        return;
      }

      if (method === "GET" && pathname === "/api/status") {
        const refresh = url.searchParams.get("refresh") === "1";
        const resolvedMagpieUrl = resolveMagpieBaseUrl(cfg.magpieUrl, env);
        const nowMs = now();
        let t3Accounts = [];
        let exposed = [];
        let otherSummary = [];
        let magpieError = "";

        try {
          const { quotas } = await fetchMagpieQuotas(cfg, { bypassCache: refresh });
          const classified = classifyMagpieQuotas(quotas);
          t3Accounts = classified.t3Accounts.map((a) => ({
            key: a.key,
            canonical: a.canonical,
            t3Provider: a.t3Provider,
            displayLabel: a.displayLabel,
            plan: a.quota.plan || "",
            from: a.quota.from || "",
            last: !!a.quota.last,
            error: a.quota.error || "",
            windows: a.quota.windows || [],
          }));
          exposed = selectExposedAccounts(classified.t3Accounts, cfg, nowMs).map((a) => ({
            key: a.key,
            canonical: a.canonical,
            displayLabel: a.displayLabel,
          }));
          otherSummary = summarizeOtherProviders(classified.otherAccounts, nowMs);
        } catch (err) {
          magpieError = String(err?.message || err);
        }

        sendJson(
          res,
          200,
          {
            hubUrl: `http://127.0.0.1:${activePort}`,
            resolvedMagpieUrl,
            config: cfg,
            magpieError,
            t3Accounts,
            exposed,
            otherSummary,
          },
          uiCorsHeaders,
        );
        return;
      }

      if (method === "POST" && pathname === "/api/config") {
        try {
          const body = await readJsonBody(req);
          const updated = configStore.update(body);
          cache = { at: 0, key: "", quotas: null };
          sendJson(res, 200, { ok: true, config: updated }, uiCorsHeaders);
        } catch (err) {
          sendJson(res, err?.statusCode || 400, { error: String(err?.message || err) }, uiCorsHeaders);
        }
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
 * If EADDRINUSE occurs during a Magpie plugin host restart, does not throw synchronously;
 * retries binding in the background until the previous host exits.
 */
export async function startServer({
  configDir,
  hostOptions = {},
  fetchImpl = globalThis.fetch,
  env = process.env,
  now = () => Date.now(),
  portOverride,
} = {}) {
  const configStore = createConfigStore({ configDir, hostOptions });
  const targetPort = portOverride !== undefined ? portOverride : configStore.get().port;
  let boundPort = targetPort;
  const handler = createAdapterHandler({
    configStore,
    getListeningPort: () => boundPort,
    fetchImpl,
    env,
    now,
  });
  const server = http.createServer((req, res) => {
    Promise.resolve(handler(req, res)).catch((err) => {
      if (!res.headersSent) {
        sendJson(res, 500, { error: String(err?.message || err) });
      }
    });
  });

  const close = () =>
    new Promise((resolve) => {
      if (!server.listening) return resolve();
      server.close(() => resolve());
    });

  try {
    boundPort = await tryListen(server, targetPort, "127.0.0.1");
    return {
      listening: true,
      port: boundPort,
      server,
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
          boundPort = await tryListen(server, targetPort, "127.0.0.1");
          return boundPort;
        } catch (retryErr) {
          if (retryErr?.code !== "EADDRINUSE") throw retryErr;
        }
      }
      throw new Error(`Port 127.0.0.1:${targetPort} remained busy after ${MAX_BIND_ATTEMPTS} retries`);
    })();

    return {
      listening: false,
      port: targetPort,
      server,
      configStore,
      ready,
      close: async () => {
        cancelled = true;
        await close();
      },
    };
  }
}
