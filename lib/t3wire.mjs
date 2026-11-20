import fs from "node:fs";
import os from "node:os";
import path from "node:path";

export const T3_SOURCE_ID = "magpie-quotas";
export const T3_DEFAULT_LABEL = "Magpie";

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
      return { exists: true, data: null, error: "T3 Code settings.json is not a JSON object" };
    }
    return { exists: true, data: parsed, error: "" };
  } catch (err) {
    return { exists: true, data: null, error: `Failed to parse T3 Code settings.json: ${err?.message || err}` };
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
 * In that case we must NOT overwrite T3 Code's settings.json with the temporary port.
 */
export function isEphemeralCliPort({ configDir, runningPort, defaultPort = 3478 }) {
  if (!configDir || !Number.isInteger(runningPort)) return false;
  const pluginsPath = path.join(configDir, "plugins.json");
  if (!fs.existsSync(pluginsPath)) return false;
  try {
    const parsed = JSON.parse(fs.readFileSync(pluginsPath, "utf8"));
    const list = Array.isArray(parsed?.plugins) ? parsed.plugins : [];
    const entry = list.find((e) => {
      const spec = String(e?.spec || "").toLowerCase();
      return spec.includes("magpie-t3code-quotas");
    });
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

/**
 * Inspect whether T3 Code's settings.json already contains this plugin's hub entry.
 */
export function inspectT3CodeHub({ settingsPath, url, managementKey }) {
  if (!settingsPath) {
    return { settingsPath: "", exists: false, wired: false, upToDate: false, error: "" };
  }
  const { exists, data, error } = readSettingsObject(settingsPath);
  if (!exists || !data) {
    return { settingsPath, exists, wired: false, upToDate: false, error };
  }
  const sources = data.usageLimitSources;
  const entry =
    sources && typeof sources === "object" && !Array.isArray(sources)
      ? sources[T3_SOURCE_ID]
      : null;

  if (!entry || typeof entry !== "object") {
    return { settingsPath, exists: true, wired: false, upToDate: false, error: "" };
  }

  const upToDate =
    entry.kind === "cliproxy" &&
    entry.url === url &&
    entry.managementKey === managementKey &&
    entry.enabled !== false;

  return {
    settingsPath,
    exists: true,
    wired: true,
    upToDate,
    label: typeof entry.label === "string" ? entry.label : T3_DEFAULT_LABEL,
    error: "",
  };
}

/**
 * Automatically register or update `usageLimitSources["magpie-quotas"]` in
 * T3 Code's `~/.t3/userdata/settings.json` (which T3 Code watches and hot-reloads).
 *
 * Safety guarantees:
 * - Never creates a ~/.t3 folder if T3 Code is not installed.
 * - Never overwrites an unreadable or invalid JSON file.
 * - Preserves all other settings, all other hubs, and a user-customized label.
 * - Skips writing when the entry is already up to date (prevents watch loops).
 */
export function syncT3CodeHub({ settingsPath, url, managementKey, label = T3_DEFAULT_LABEL }) {
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

  const sources =
    data.usageLimitSources &&
    typeof data.usageLimitSources === "object" &&
    !Array.isArray(data.usageLimitSources)
      ? { ...data.usageLimitSources }
      : {};

  const prev = sources[T3_SOURCE_ID];
  const keptLabel =
    prev && typeof prev === "object" && typeof prev.label === "string" && prev.label.trim()
      ? prev.label.trim()
      : label;

  const nextEntry = {
    kind: "cliproxy",
    label: keptLabel,
    url,
    managementKey,
    enabled: true,
  };

  if (
    prev &&
    typeof prev === "object" &&
    prev.kind === nextEntry.kind &&
    prev.label === nextEntry.label &&
    prev.url === nextEntry.url &&
    prev.managementKey === nextEntry.managementKey &&
    prev.enabled === nextEntry.enabled
  ) {
    return { changed: false, wired: true, status: "up-to-date", error: "" };
  }

  sources[T3_SOURCE_ID] = nextEntry;
  writeSettingsAtomic(settingsPath, { ...data, usageLimitSources: sources });
  return { changed: true, wired: true, status: "updated", error: "" };
}

/**
 * Remove only this plugin's `usageLimitSources["magpie-quotas"]` entry from
 * T3 Code's settings.json, leaving all other keys and hubs untouched.
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
