import { Composer } from "grammy";
import { createBot, type BotContext } from "./toolkit/index.js";
import { resolveSessionStorage } from "./toolkit/session/redis.js";
import type { StorageAdapter } from "grammy";

// ─── Domain storage (shared across handlers) ─────────────────────────────
// Handlers import this to read/write durable domain data (tasks, users, etc.).
// Initialized by buildBot() — handlers MUST NOT access before buildBot runs.
let _domainStorage: StorageAdapter<Record<string, unknown>> | null = null;

/** Get the domain storage adapter. Only safe to call after buildBot(). */
export function getStorage(): StorageAdapter<Record<string, unknown>> {
  if (!_domainStorage) throw new Error("Storage not initialized — call buildBot() first");
  return _domainStorage;
}

// The per-chat session shape (ephemeral conversation state only). Extend as the
// bot grows. Durable domain data must NOT live here — use the toolkit's
// persistent storage (see AGENTS.md).
export interface Session {
  /** Current wizard step (null = idle, no active flow). */
  wizard_step: string | null;
  /** Draft task data collected during the creation wizard. */
  draft?: {
    title?: string;
    description?: string;
    assignee_id?: number;
    assignee_name?: string;
    due_date?: string;
    project_tag?: string;
  };
}

export type Ctx = BotContext<Session>;

/**
 * BuildBotOptions lets a runtime-specific ENTRY POINT (never a feature handler)
 * override how the bot is assembled:
 *
 *  - `handlers`: a pre-loaded list of feature Composers. The Cloudflare Workers
 *    entry (src/worker.ts) passes these from a BUILD-TIME manifest, because the
 *    Workers runtime has no filesystem — `readdirSync` + dynamic `import()` only
 *    work under Node (dev, the test harness, and the Fly/long-poll entry). When
 *    omitted, buildBot falls back to the Node disk scan, so nothing on the Node
 *    path changes.
 *  - `storage`: an explicit grammY session StorageAdapter (Workers passes a
 *    Durable-Object-backed one; Node auto-selects Redis/in-memory).
 */
export interface BuildBotOptions {
  handlers?: Composer<Ctx>[];
  storage?: StorageAdapter<Session>;
}

/**
 * buildBot — assembles the bot, AUTO-LOADS every feature handler from
 * src/handlers/, then registers the global fallback. Does NOT start the bot.
 * Add a feature by creating src/handlers/<name>.ts that default-exports a grammY
 * Composer — NEVER edit this file (concurrent feature PRs would conflict).
 *
 * Runtime-agnostic: the Node entry (src/index.ts) and the test harness call
 * `buildBot(token)` and get the disk-scanned handlers; the Workers entry
 * (src/worker.ts) calls `buildBot(token, { handlers, storage })` with a
 * build-time manifest because Workers has no filesystem.
 */
export async function buildBot(token: string, opts: BuildBotOptions = {}) {
  // Initialize domain storage for durable data (tasks, users, etc.)
  _domainStorage = resolveSessionStorage<Record<string, unknown>>(
    undefined, // no explicit adapter — use auto-detect (Redis or in-memory)
  );

  const bot = createBot<Session>(token, {
    initial: () => ({ wizard_step: null }),
    storage: opts.storage,
  });

  const handlers = opts.handlers ?? (await loadHandlersFromDisk());
  for (const h of handlers) bot.use(h);

  bot.on("message", (ctx) => ctx.reply("Sorry, I didn't understand that. Try /help."));

  return bot;
}

/**
 * loadHandlersFromDisk — the Node/dev/harness path: scan src/handlers/ and
 * import each Composer. Never CALLED in the Workers bundle (worker.ts always
 * passes an explicit manifest) — and `node:fs` must be imported DYNAMICALLY
 * here, not at the top of the file: Cloudflare validates the bundle's static
 * import graph at upload and rejects any static node:* import, even one whose
 * code never runs.
 */
async function loadHandlersFromDisk(): Promise<Composer<Ctx>[] > {
  const { readdirSync } = await import("node:fs");
  const dir = new URL("./handlers/", import.meta.url);
  let files: string[] = [];
  try {
    files = readdirSync(dir).filter(
      (f) =>
        (f.endsWith(".js") || f.endsWith(".ts")) &&
        !f.endsWith(".d.ts") &&
        !f.includes(".test.") &&
        !f.includes(".spec."),
    );
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
    files = []; // no handlers/ dir yet → nothing to load
  }
  const out: Composer<Ctx>[] = [];
  for (const file of files.sort()) {
    const mod = (await import(new URL(file, dir).href)) as { default?: Composer<Ctx> };
    if (!mod.default) {
      throw new Error(`handler ${file} must default-export a grammY Composer`);
    }
    out.push(mod.default);
  }
  return out;
}
