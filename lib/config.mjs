import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

export const DEFAULT_PORT = 3478;
export const SUPPORTED_T3_PROVIDERS = ["claude", "codex", "antigravity", "grok"];
export const VALID_MODES = ["per-account", "pooled", "active-only"];
export const VALID_SELECTION_MODES = ["all-except", "only-selected"];
export const VALID_POOLED_RESET_STRATEGIES = ["none", "earliest", "latest"];

export function generateManagementKey() {
  return `mgp_${crypto.randomBytes(18).toString("base64url")}`;
}

export function hashSecret(value) {
  return crypto.createHash("sha256").update(String(value || "")).digest("hex");
}

export function defaultConfig() {
  return {
    port: DEFAULT_PORT,
    managementKey: "",
    magpieUrl: "",
    magpieApiKey: "",
    keptOnly: true,
    autoWireT3Code: true,
    mode: "per-account",
    pooledResetStrategy: "none",
    selectionMode: "all-except",
    enabledProviders: {
      claude: true,
      codex: true,
      antigravity: true,
      grok: true,
    },
    selectedPlans: [],
    excludedPlans: [],
    selectedAccounts: [],
    excludedAccounts: [],
    lastWiredKeyHash: "",
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
    if (
      u.hostname === "0.0.0.0" ||
      u.hostname === "::" ||
      u.hostname === "[::]" ||
      u.hostname === ""
    ) {
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

export function parsePort(value) {
  const n = Number(value);
  return Number.isInteger(n) && n >= 1 && n <= 65535 ? n : null;
}

export function normalizeConfig(input, base = defaultConfig()) {
  const src = input && typeof input === "object" ? input : {};
  const port = parsePort(src.port) ?? base.port;

  let managementKey = base.managementKey;
  if (src.regenerateKey === true) {
    managementKey = generateManagementKey();
  } else if (typeof src.managementKey === "string") {
    const trimmed = src.managementKey.trim();
    managementKey = trimmed || generateManagementKey();
  } else if (typeof src.key === "string") {
    const trimmed = src.key.trim();
    managementKey = trimmed || generateManagementKey();
  }

  const magpieUrl =
    typeof src.magpieUrl === "string" ? src.magpieUrl.trim() : base.magpieUrl;

  let magpieApiKey = base.magpieApiKey;
  if (src.clearMagpieApiKey === true) {
    magpieApiKey = "";
  } else if (typeof src.magpieApiKey === "string" && src.magpieApiKey.trim() !== "") {
    magpieApiKey = src.magpieApiKey.trim();
  }

  const keptOnly = typeof src.keptOnly === "boolean" ? src.keptOnly : base.keptOnly;
  const autoWireT3Code =
    typeof src.autoWireT3Code === "boolean" ? src.autoWireT3Code : base.autoWireT3Code;
  const mode = VALID_MODES.includes(src.mode) ? src.mode : base.mode;
  const pooledResetStrategy = VALID_POOLED_RESET_STRATEGIES.includes(src.pooledResetStrategy)
    ? src.pooledResetStrategy
    : base.pooledResetStrategy;
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

  const selectedPlans =
    src.selectedPlans !== undefined
      ? normalizeStringList(src.selectedPlans)
      : [...base.selectedPlans];
  const excludedPlans =
    src.excludedPlans !== undefined
      ? normalizeStringList(src.excludedPlans)
      : [...base.excludedPlans];
  const selectedAccounts =
    src.selectedAccounts !== undefined
      ? normalizeStringList(src.selectedAccounts)
      : [...base.selectedAccounts];
  const excludedAccounts =
    src.excludedAccounts !== undefined
      ? normalizeStringList(src.excludedAccounts)
      : [...base.excludedAccounts];
  const lastWiredKeyHash =
    typeof src.lastWiredKeyHash === "string" ? src.lastWiredKeyHash : base.lastWiredKeyHash;

  return {
    port,
    managementKey,
    magpieUrl,
    magpieApiKey,
    keptOnly,
    autoWireT3Code,
    mode,
    pooledResetStrategy,
    selectionMode,
    enabledProviders,
    selectedPlans,
    excludedPlans,
    selectedAccounts,
    excludedAccounts,
    lastWiredKeyHash,
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
 * Sync this plugin's `options.port` inside Magpie's `plugins.json` (if present),
 * so Magpie's boot.js, `magpie.page.service`, and future restarts all follow the new port.
 * Only touches this plugin's own entry and never alters other plugins.
 */
export function syncPluginPortInMagpie({ configDir, port }) {
  if (!configDir || !parsePort(port)) return { updated: false, reason: "no-config-dir" };
  const pluginsPath = path.join(configDir, "plugins.json");
  if (!fs.existsSync(pluginsPath)) return { updated: false, reason: "no-plugins-json" };
  try {
    const parsed = JSON.parse(fs.readFileSync(pluginsPath, "utf8"));
    if (!parsed || typeof parsed !== "object" || !Array.isArray(parsed.plugins)) {
      return { updated: false, reason: "invalid-plugins-json" };
    }
    const idx = parsed.plugins.findIndex((e) =>
      String(e?.spec || "").toLowerCase().includes("magpie-t3code-quotas"),
    );
    if (idx < 0) return { updated: false, reason: "entry-not-found" };
    const entry = parsed.plugins[idx];
    const prevOpts = entry.options && typeof entry.options === "object" ? entry.options : {};
    if (Number(prevOpts.port) === port) {
      return { updated: false, reason: "up-to-date" };
    }
    parsed.plugins[idx] = {
      ...entry,
      options: { ...prevOpts, port },
    };
    writeJsonAtomic(pluginsPath, parsed);
    return { updated: true, reason: "saved" };
  } catch (err) {
    return { updated: false, reason: String(err?.message || err) };
  }
}

/**
 * Config store merging:
 *   defaultConfig -> hostOptions (Magpie plugins.json) -> local persisted overrides.
 * Ensures a high-entropy random managementKey is generated & persisted on first start
 * rather than shipping a shared hardcoded default.
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
  const hostExplicitPort = parsePort(hostOptions?.port);

  let current = saved
    ? normalizeConfig(
        {
          ...saved,
          // When Magpie launches a short-lived CLI with an ephemeral port, honor hostOptions.port.
          ...(hostExplicitPort ? { port: hostExplicitPort } : {}),
        },
        fromHost,
      )
    : fromHost;

  let needsInitialSave = false;
  if (!current.managementKey) {
    current = { ...current, managementKey: generateManagementKey() };
    needsInitialSave = true;
  }

  if (needsInitialSave && filePath) {
    try {
      writeJsonAtomic(filePath, current);
    } catch {
      // Ignore write failures in read-only test environments.
    }
  }

  return {
    filePath,
    configDir: configDir || "",
    get() {
      return {
        ...current,
        enabledProviders: { ...current.enabledProviders },
        selectedPlans: [...current.selectedPlans],
        excludedPlans: [...current.excludedPlans],
        selectedAccounts: [...current.selectedAccounts],
        excludedAccounts: [...current.excludedAccounts],
      };
    },
    getPublic() {
      const c = this.get();
      const hasMagpieApiKey = Boolean(c.magpieApiKey);
      delete c.magpieApiKey;
      return {
        ...c,
        hasMagpieApiKey,
      };
    },
    update(patch, { allowPortChange = false } = {}) {
      const safePatch = { ...(patch && typeof patch === "object" ? patch : {}) };
      if (!allowPortChange) {
        delete safePatch.port;
      }
      current = normalizeConfig(safePatch, current);
      if (filePath) {
        writeJsonAtomic(filePath, current);
      }
      return this.get();
    },
  };
}
