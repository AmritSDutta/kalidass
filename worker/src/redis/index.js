import {UpstashAdapter} from "./upstash_adapter.js";
import {MemoryAdapter} from "./memory_adapter.js";

export const PERMANENT_ROOT_PREFIX = "kalidass:";

/**
 * Enforces the permanent "kalidass:" root prefix across all Redis flows.
 * Idempotent: does not double-prefix if already present.
 *
 * @param {string} key
 * @returns {string}
 */
export function formatRedisKey(key) {
  if (typeof key !== "string") return PERMANENT_ROOT_PREFIX;
  const trimmed = key.trim();
  if (trimmed.startsWith(PERMANENT_ROOT_PREFIX)) {
    return trimmed;
  }
  return `${PERMANENT_ROOT_PREFIX}${trimmed.replace(/^:+/, "")}`;
}

/**
 * Factory returning a KeyValueStore provider.
 * Instantiates UpstashAdapter if REST credentials are present, otherwise MemoryAdapter.
 *
 * @param {any} env Cloudflare Worker environment bindings
 * @returns {import("./types").KeyValueStore}
 */
export function getRedisClient(env) {
  const url = env?.UPSTASH_REDIS_REST_URL;
  const token = env?.UPSTASH_REDIS_REST_TOKEN;

  if (url && token) {
    return new UpstashAdapter({url, token}, formatRedisKey);
  }

  return new MemoryAdapter(formatRedisKey);
}
