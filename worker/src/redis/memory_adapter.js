/**
 * In-memory adapter implementing KeyValueStore for hermetic local testing and offline execution.
 *
 * @implements {import("./types").KeyValueStore}
 */
export class MemoryAdapter {
  /**
   * @param {(key: string) => string} keyFormatter
   */
  constructor(keyFormatter) {
    this.store = globalThis.__kalidass_redis_memory || (globalThis.__kalidass_redis_memory = new Map());
    this.formatKey = keyFormatter;
  }

  /**
   * @param {string} key
   * @returns {Promise<any>}
   */
  async get(key) {
    const formatted = this.formatKey(key);
    const entry = this.store.get(formatted);
    if (!entry) return null;
    if (entry.expires && Date.now() > entry.expires) {
      this.store.delete(formatted);
      return null;
    }
    return entry.value;
  }

  /**
   * @param {string} key
   * @param {any} value
   * @param {import("./types").SetOptions} [opts]
   * @returns {Promise<void>}
   */
  async set(key, value, opts = {}) {
    const formatted = this.formatKey(key);
    let expires = null;
    if (opts?.ex) {
      expires = Date.now() + opts.ex * 1000;
    }
    this.store.set(formatted, {value, expires});
  }

  /**
   * @param {string} key
   * @returns {Promise<void>}
   */
  async del(key) {
    const formatted = this.formatKey(key);
    this.store.delete(formatted);
  }
}
