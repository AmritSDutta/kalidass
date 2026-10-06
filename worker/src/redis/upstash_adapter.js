import {Redis} from "@upstash/redis";

/**
 * Adapter implementing KeyValueStore on top of @upstash/redis.
 *
 * @implements {import("./types").KeyValueStore}
 */
export class UpstashAdapter {
  /**
   * @param {{ url: string, token: string }} config
   * @param {(key: string) => string} keyFormatter
   */
  constructor(config, keyFormatter) {
    this.client = new Redis({
      url: config.url,
      token: config.token,
    });
    this.formatKey = keyFormatter;
  }

  /**
   * @param {string} key
   * @returns {Promise<any>}
   */
  async get(key) {
    try {
      const formatted = this.formatKey(key);
      return await this.client.get(formatted);
    } catch (err) {
      console.warn("[UpstashAdapter] GET failed:", err.message);
      return null;
    }
  }

  /**
   * @param {string} key
   * @param {any} value
   * @param {import("./types").SetOptions} [opts]
   * @returns {Promise<void>}
   */
  async set(key, value, opts = {}) {
    try {
      const formatted = this.formatKey(key);
      await this.client.set(formatted, value, opts);
    } catch (err) {
      console.warn("[UpstashAdapter] SET failed:", err.message);
    }
  }

  /**
   * @param {string} key
   * @returns {Promise<void>}
   */
  async del(key) {
    try {
      const formatted = this.formatKey(key);
      await this.client.del(formatted);
    } catch (err) {
      console.warn("[UpstashAdapter] DEL failed:", err.message);
    }
  }
}
