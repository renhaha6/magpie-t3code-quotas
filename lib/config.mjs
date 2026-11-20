import fs from "node:fs";
import os from "node:os";
import path from "node:path";

export const DEFAULT_PORT = 3478;
export const DEFAULT_MANAGEMENT_KEY = "magpie-t3code-local";
export const SUPPORTED_T3_PROVIDERS = ["claude", "codex", "antigravity", "grok"];
export const VALID_MODES = ["per-account", "pooled", "active-only"];
export const VALID_SELECTION_MODES = ["all-except", "only-selected"];

export function defaultConfig() {
  return {
    port: DEFAULT_PORT,
    managementKey: DEFAULT_MANAGEMENT_KEY,
    magpieUrl: "",
    magpieApiKey: "",
    keptOnly: true,
    mode: "per-account",
    selectionMode: "all-except",
    enabledProviders: {
      claude: true,
      codex: true,
      antigravity: true,
      grok: true,
    },
    selectedAccounts: [],
    excludedAccounts: [],
  };
}

/**
 * Resolve Magpie's gateway base URL.
 * Prefers explicit config -> process.env.MAGPIE_ADDR (injected by Magpie's Bun host) -> 127.0.0.1:3425.
 */
export function resolveMagpieBaseUrl(magpieUrlOption, env = process.env) {
  let raw = String(magpieUrlOption || "").trim();
  if (!raw) {
    raw = String(env?.MAGPIE_ADDR || "").trim() || "127.0.0.1:3425";
  }
  if (!/^https?:\/\//i.test(raw)) {
    raw = `http://${raw}`;
  }
  try {
    const u = new URL(raw);
    if (u.hostname === "0.0.0.0" || u.hostname === "::" || u.hostname === "[::]" || u.hostname === "") {
      u.hostname = "127.0.0.1";
    }
    return `${u.protocol}//${u.host}${u.pathname.replace(/\/+$/, "")}`;
  } catch {
    return "http://127.0.0.1:3425";
  }
}

function normalizeStringList(list) {
  if (!Array.isArray(list)) return [];
  const seen = new Set();
  const out = [];
  for (const item of list) {
    const s = String(item ?? "").trim();
    if (s && !seen.has(s)) {
      seen.add(s);
      out.push(s);
    }
  }
  return out;
}

export function normalizeConfig(input, base = defaultConfig()) {
  const src = input && typeof input === "object" ? input : {};
  const portRaw = Number(src.port);
  const port =
    Number.isInteger(portRaw) && portRaw >= 1 && portRaw <= 65535
      ? portRaw
      : base.port;

  const keyRaw = typeof src.managementKey === "string"
    ? src.managementKey.trim()
    : typeof src.key === "string"
      ? src.key.trim()
      : "";
  const managementKey = keyRaw || base.managementKey;

  const magpieUrl =
    typeof src.magpieUrl === "string" ? src.magpieUrl.trim() : base.magpieUrl;
  const magpieApiKey =
    typeof src.magpieApiKey === "string" ? src.magpieApiKey.trim() : base.magpieApiKey;
  const keptOnly =
    typeof src.keptOnly === "boolean" ? src.keptOnly : base.keptOnly;
  const mode = VALID_MODES.includes(src.mode) ? src.mode : base.mode;
  const selectionMode = VALID_SELECTION_MODES.includes(src.selectionMode)
    ? src.selectionMode
    : base.selectionMode;

  const enabledProviders = { ...base.enabledProviders };
  if (src.enabledProviders && typeof src.enabledProviders === "object") {
    for (const p of SUPPORTED_T3_PROVIDERS) {
      if (typeof src.enabledProviders[p] === "boolean") {
        enabledProviders[p] = src.enabledProviders[p];
      }
    }
  } else if (Array.isArray(src.providers)) {
    const allowed = new Set(src.providers.map((p) => String(p).trim().toLowerCase()));
    for (const p of SUPPORTED_T3_PROVIDERS) {
      enabledProviders[p] = allowed.has(p);
    }
  }

  const selectedAccounts =
    src.selectedAccounts !== undefined
      ? normalizeStringList(src.selectedAccounts)
      : [...base.selectedAccounts];
  const excludedAccounts =
    src.excludedAccounts !== undefined
      ? normalizeStringList(src.excludedAccounts)
      : [...base.excludedAccounts];

  return {
    port,
    managementKey,
    magpieUrl,
    magpieApiKey,
    keptOnly,
    mode,
    selectionMode,
    enabledProviders,
    selectedAccounts,
    excludedAccounts,
  };
}

function readJsonSafe(filePath) {
  if (!filePath) return null;
  try {
    const raw = fs.readFileSync(filePath, "utf8");
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

function writeJsonAtomic(filePath, data) {
  if (!filePath) return;
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const tmp = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2) + "\n", { mode: 0o600 });
  fs.renameSync(tmp, filePath);
}

/**
 * Config store merging:
 *   defaultConfig -> hostOptions (Magpie plugins.json) -> local persisted UI overrides.
 * Port always stays pinned to hostOptions.port (if set) when managed by Magpie,
 * because Magpie's page.service and boot.js route to plugins.json's port.
 */
export function createConfigStore({ configDir, hostOptions = {} } = {}) {
  const filePath =
    configDir === null
      ? null
      : path.join(
          configDir || path.join(os.homedir(), ".config", "magpie-t3code-quotas"),
          "t3code-quotas.json",
        );

  const fromHost = normalizeConfig(hostOptions, defaultConfig());
  const saved = readJsonSafe(filePath);
  let current = saved ? normalizeConfig({ ...saved, port: fromHost.port }, fromHost) : fromHost;

  return {
    filePath,
    get() {
      return {
        ...current,
        enabledProviders: { ...current.enabledProviders },
        selectedAccounts: [...current.selectedAccounts],
        excludedAccounts: [...current.excludedAccounts],
      };
    },
    update(patch) {
      const next = normalizeConfig({ ...patch, port: current.port }, current);
      current = next;
      if (filePath) {
        const toSave = { ...current };
        delete toSave.port;
        writeJsonAtomic(filePath, toSave);
      }
      return this.get();
    },
  };
}
