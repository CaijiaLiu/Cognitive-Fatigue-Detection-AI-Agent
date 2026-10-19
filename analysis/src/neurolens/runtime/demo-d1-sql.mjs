/**
 * D1 SQL for demo sessions and rate-limit buckets.
 * Prefixes keep Research Agent rows out of collection ticket keys.
 * Cleanup is scoped so expired demo rows cannot sweep upload_limits used by collection.
 */
export const DEMO_SESSION_PREFIX = 'demo:sess:';
export const DEMO_RATE_PREFIX = 'demo:rl:';
export const DEMO_D1_CLEANUP_SQL = "DELETE FROM upload_limits WHERE expires < ? AND (key LIKE 'demo:sess:%' OR key LIKE 'demo:rl:%')";
export const DEMO_D1_INCREMENT_SQL = 'INSERT INTO upload_limits (key,count,expires) VALUES (?,1,?) ON CONFLICT(key) DO UPDATE SET count=count+1 RETURNING count, expires';
