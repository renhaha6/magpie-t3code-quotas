// Magpie OpenCode v1 plugin entrypoint.
// Only exports `{ id, server }` so Magpie's Bun host does not treat helper functions as plugins.

import { startServer } from "./lib/server.mjs";

let started = null;

function ensureStarted(input, options) {
  if (!started) {
    started = startServer({
      configDir: input?.directory || "",
      hostOptions: options || {},
    })
      .then((info) => {
        if (info.listening) {
          console.log(`[magpie-t3code-quotas] listening on http://127.0.0.1:${info.port}`);
        } else {
          info.ready.then(
            (p) => p && console.log(`[magpie-t3code-quotas] listening on http://127.0.0.1:${p}`),
            (err) => console.error("[magpie-t3code-quotas] failed to bind:", err?.message || err),
          );
        }
        return info;
      })
      .catch((err) => {
        console.error("[magpie-t3code-quotas] failed to start:", err?.message || err);
        return null;
      });
  }
  return started;
}

export default {
  id: "magpie-t3code-quotas",
  server: async (input, options) => {
    await ensureStarted(input, options);
    // Return empty hooks: registers no new model provider, leaves Magpie's Providers list clean.
    return {};
  },
};
