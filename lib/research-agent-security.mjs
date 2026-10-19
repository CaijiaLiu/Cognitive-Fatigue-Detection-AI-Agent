/**
 * Workers-side stores for the Research Agent demo.
 * Reuses the existing D1 upload_limits table with demo: prefixes.
 * The analysis runtime stays D1-free; this facade injects stores.
 */
import { env } from 'cloudflare:workers';
import {
  createMemoryRateLimitStore,
  createMemorySessionStore,
  loadDemoSecurityConfig,
} from '../analysis/src/neurolens/runtime/demo-security.mjs';

const SESSION_PREFIX = 'demo:sess:';
const RATE_PREFIX = 'demo:rl:';

export function createD1SessionStore(db) {
  return Object.freeze({
    kind: 'd1',
    async put(key, record) {
      await db.prepare(
        'INSERT INTO upload_limits (key,count,expires) VALUES (?,1,?) ON CONFLICT(key) DO UPDATE SET count=1, expires=?',
      ).bind(SESSION_PREFIX + key, record.expires_at, record.expires_at).run();
    },
    async get(key) {
      const row = await db.prepare('SELECT expires FROM upload_limits WHERE key=?')
        .bind(SESSION_PREFIX + key)
        .first();
      if (!row) return null;
      return { expires_at: row.expires };
    },
    async delete(key) {
      await db.prepare('DELETE FROM upload_limits WHERE key=?').bind(SESSION_PREFIX + key).run();
    },
  });
}

export function createD1RateLimitStore(db) {
  return Object.freeze({
    kind: 'd1',
    async increment(key, { now, window_ms }) {
      const expires = now + Math.max(window_ms * 2, 60_000);
      await db.batch([
        db.prepare('DELETE FROM upload_limits WHERE expires < ?').bind(now),
        db.prepare(
          'INSERT INTO upload_limits (key,count,expires) VALUES (?,1,?) ON CONFLICT(key) DO UPDATE SET count=count+1',
        ).bind(RATE_PREFIX + key, expires),
      ]);
      const row = await db.prepare('SELECT count, expires FROM upload_limits WHERE key=?')
        .bind(RATE_PREFIX + key)
        .first();
      return {
        count: row?.count ?? 1,
        reset_at: row?.expires ?? expires,
      };
    },
  });
}

export function createDemoRequestOptions() {
  const security = loadDemoSecurityConfig(env);
  let sessionStore = createMemorySessionStore();
  let rateLimitStore = createMemoryRateLimitStore();
  let sharedStore = false;
  try {
    if (env.DB) {
      sessionStore = createD1SessionStore(env.DB);
      rateLimitStore = createD1RateLimitStore(env.DB);
      sharedStore = true;
    }
  } catch {
    sessionStore = createMemorySessionStore();
    rateLimitStore = createMemoryRateLimitStore();
    sharedStore = false;
  }
  return {
    env,
    security,
    sessionStore,
    rateLimitStore,
    sharedStore,
    logger: (entry) => console.info(JSON.stringify(entry)),
  };
}
