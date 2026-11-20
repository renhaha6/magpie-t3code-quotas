import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { hashSecret } from "./config.mjs";

export const T3_SOURCE_ID = "magpie-quotas";
export const T3_DEFAULT_LABEL = "Magpie";

// Exact marker T3 Code writes into settings.json after moving a literal secret
// into its encrypted ServerSecretStore (apps/server/src/settingsSecrets.ts).
export const T3_SECRET_REDACTED = "\u2022\u2022\u2022\u2022\u2022\u2022";

export function isT3SecretReference(value) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value) && typeof value.provider === "string");
}

export function isT3ManagedSecret(value) {
  return value === T3_SECRET_REDACTED || isT3SecretReference(value);
}

/**
 * Resolve T3 Code's settings.json path identically to Magpie's internal/appdir/t3code.go:
 *   $T3CODE_HOME (expanding leading ~) else ~/.t3, then userdata/settings.json.
 */
export function resolveT3SettingsPath(env = process.env, home = os.homedir()) {
  const raw = String(env?.T3CODE_HOME || "").trim();
  let base;
  if (!raw) {
    base = path.join(home, ".t3");
  } else if (raw === "~") {
    base = home;
  } else if (raw.startsWith("~/") || raw.startsWith("~\\")) {
    base = path.join(home, raw.slice(2));
  } else {
    base = raw;
  }
  return path.join(base, "userdata", "settings.json");
}

function readSettingsObject(settingsPath) {
  if (!settingsPath || !fs.existsSync(settingsPath)) {
    return { exists: false, data: null, error: "" };
  }
  try {
    const raw = fs.readFileSync(settingsPath, "utf8");
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return { exists: true, data: null, error: "T3 Code settings.json 格式异常（非 JSON 对象）" };
    }
    return { exists: true, data: parsed, error: "" };
  } catch (err) {
    return { exists: true, data: null, error: `解析 T3 Code settings.json 失败：${err?.message || err}` };
  }
}

function writeSettingsAtomic(settingsPath, data) {
  let mode = 0o600;
  try {
    mode = fs.statSync(settingsPath).mode & 0o777;
  } catch { /* default 0600 */ }
  fs.mkdirSync(path.dirname(settingsPath), { recursive: true });
  const tmp = `${settingsPath}.magpie-quotas.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2) + "\n", { mode });
  fs.renameSync(tmp, settingsPath);
}

/**
 * Detect whether Magpie's short-lived CLI (`ServePages(false)`) moved our plugin
 * onto a temporary ephemeral port so it wouldn't collide with the main Magpie app.
 */
export function isEphemeralCliPort({ configDir, runningPort, defaultPort = 3478 }) {
  if (!configDir || !Number.isInteger(runningPort) || runningPort <= 0) return false;
  const pluginsPath = path.join(configDir, "plugins.json");
  if (!fs.existsSync(pluginsPath)) return false;
  try {
    const parsed = JSON.parse(fs.readFileSync(pluginsPath, "utf8"));
    const list = Array.isArray(parsed?.plugins) ? parsed.plugins : [];
    const entry = list.find((e) =>
      String(e?.spec || "").toLowerCase().includes("magpie-t3code-quotas"),
    );
    if (!entry) return false;
    const savedPortRaw = Number(entry?.options?.port);
    const expectedPort =
      Number.isInteger(savedPortRaw) && savedPortRaw >= 1 && savedPortRaw <= 65535
        ? savedPortRaw
        : defaultPort;
    return runningPort !== expectedPort;
  } catch {
    return false;
  }
}

function keyMatchesEntry(entry, managementKey, lastWiredKeyHash) {
  if (!entry || typeof entry !== "object") return false;
  if (entry.managementKey === managementKey) return true;
  if (isT3ManagedSecret(entry.managementKey)) {
    // T3 Code moved our literal key into its encrypted secret store and left "••••••".
    // Treat as matching unless we know the user rotated managementKey since last sync.
    if (!lastWiredKeyHash) return true;
    return lastWiredKeyHash === hashSecret(managementKey);
  }
  return false;
}

/**
 * Inspect whether T3 Code's settings.json already contains this plugin's hub entry
 * and distinguish: connected, disabled in T3 Code, URL/key drift, or not present.
 */
export function inspectT3CodeHub({ settingsPath, url, managementKey, lastWiredKeyHash = "" }) {
  if (!settingsPath) {
    return {
      settingsPath: "",
      exists: false,
      wired: false,
      upToDate: false,
      disabledInT3: false,
      secretManagedByT3: false,
      urlMatches: false,
      keyMatches: false,
      error: "",
    };
  }
  const { exists, data, error } = readSettingsObject(settingsPath);
  if (!exists || !data) {
    return {
      settingsPath,
      exists,
      wired: false,
      upToDate: false,
      disabledInT3: false,
      secretManagedByT3: false,
      urlMatches: false,
      keyMatches: false,
      error,
    };
  }

  const sources = data.usageLimitSources;
  const entry =
    sources && typeof sources === "object" && !Array.isArray(sources)
      ? sources[T3_SOURCE_ID]
      : null;

  if (!entry || typeof entry !== "object") {
    return {
      settingsPath,
      exists: true,
      wired: false,
      upToDate: false,
      disabledInT3: false,
      secretManagedByT3: false,
      urlMatches: false,
      keyMatches: false,
      error: "",
    };
  }

  const disabledInT3 = entry.enabled === false;
  const urlMatches = entry.kind === "cliproxy" && entry.url === url;
  const secretManagedByT3 = isT3ManagedSecret(entry.managementKey);
  const keyMatches = keyMatchesEntry(entry, managementKey, lastWiredKeyHash);

  return {
    settingsPath,
    exists: true,
    wired: true,
    upToDate: urlMatches && keyMatches && !disabledInT3,
    disabledInT3,
    secretManagedByT3,
    urlMatches,
    keyMatches,
    label: typeof entry.label === "string" ? entry.label : T3_DEFAULT_LABEL,
    error: "",
  };
}

/**
 * Register or update `usageLimitSources["magpie-quotas"]` in T3 Code's settings.json.
 *
 * Safety guarantees:
 * - Never creates ~/.t3 when T3 Code is not installed.
 * - Never overwrites invalid JSON.
 * - Preserves all other settings, all other hubs, user-customized label, and (unless
 *   `forceEnable` is true) whether the user manually disabled the hub in T3 Code.
 * - Respects T3 Code's encrypted secret placeholder ("••••••") so restarting Magpie
 *   does not repeatedly rewrite settings.json or show false mismatch warnings.
 */
export function syncT3CodeHub({
  settingsPath,
  url,
  managementKey,
  lastWiredKeyHash = "",
  forceKey = false,
  forceEnable = false,
  label = T3_DEFAULT_LABEL,
}) {
  if (!settingsPath) {
    return { changed: false, wired: false, status: "disabled", wiredKeyHash: "", error: "" };
  }
  const { exists, data, error } = readSettingsObject(settingsPath);
  if (!exists) {
    return { changed: false, wired: false, status: "t3-not-found", wiredKeyHash: "", error: "" };
  }
  if (error || !data) {
    return { changed: false, wired: false, status: "invalid-settings", wiredKeyHash: "", error };
  }

  const sources =
    data.usageLimitSources &&
    typeof data.usageLimitSources === "object" &&
    !Array.isArray(data.usageLimitSources)
      ? { ...data.usageLimitSources }
      : {};

  const prev = sources[T3_SOURCE_ID] && typeof sources[T3_SOURCE_ID] === "object"
    ? sources[T3_SOURCE_ID]
    : null;

  const keptLabel =
    prev && typeof prev.label === "string" && prev.label.trim()
      ? prev.label.trim()
      : label;

  // Respect the user's choice if they disabled this hub inside T3 Code, unless explicitly re-enabling.
  const enabled = forceEnable ? true : prev && typeof prev.enabled === "boolean" ? prev.enabled : true;

  const currentKeyHash = hashSecret(managementKey);
  const prevHasManagedSecret = prev ? isT3ManagedSecret(prev.managementKey) : false;
  const keyAlreadySynced = prev ? keyMatchesEntry(prev, managementKey, lastWiredKeyHash) : false;

  // Keep T3 Code's "••••••" redacted marker when only URL changed and the key is already synced.
  const nextKeyValue =
    !forceKey && prevHasManagedSecret && keyAlreadySynced ? prev.managementKey : managementKey;

  const nextEntry = {
    kind: "cliproxy",
    label: keptLabel,
    url,
    managementKey: nextKeyValue,
    enabled,
  };

  const same =
    prev &&
    prev.kind === nextEntry.kind &&
    prev.label === nextEntry.label &&
    prev.url === nextEntry.url &&
    prev.enabled === nextEntry.enabled &&
    JSON.stringify(prev.managementKey) === JSON.stringify(nextEntry.managementKey);

  if (same) {
    return {
      changed: false,
      wired: true,
      status: enabled ? "up-to-date" : "disabled-in-t3",
      wiredKeyHash: keyAlreadySynced ? currentKeyHash : "",
      error: "",
    };
  }

  sources[T3_SOURCE_ID] = nextEntry;
  writeSettingsAtomic(settingsPath, { ...data, usageLimitSources: sources });
  return {
    changed: true,
    wired: true,
    status: "updated",
    wiredKeyHash: currentKeyHash,
    error: "",
  };
}

/**
 * Remove only `usageLimitSources["magpie-quotas"]` from T3 Code's settings.json.
 */
export function removeT3CodeHub({ settingsPath }) {
  if (!settingsPath) {
    return { changed: false, wired: false, status: "disabled", error: "" };
  }
  const { exists, data, error } = readSettingsObject(settingsPath);
  if (!exists) {
    return { changed: false, wired: false, status: "t3-not-found", error: "" };
  }
  if (error || !data) {
    return { changed: false, wired: false, status: "invalid-settings", error };
  }

  const sources = data.usageLimitSources;
  if (!sources || typeof sources !== "object" || Array.isArray(sources) || !(T3_SOURCE_ID in sources)) {
    return { changed: false, wired: false, status: "not-present", error: "" };
  }

  const nextSources = { ...sources };
  delete nextSources[T3_SOURCE_ID];
  const nextData = { ...data };
  if (Object.keys(nextSources).length === 0) {
    delete nextData.usageLimitSources;
  } else {
    nextData.usageLimitSources = nextSources;
  }
  writeSettingsAtomic(settingsPath, nextData);
  return { changed: true, wired: false, status: "removed", error: "" };
}
