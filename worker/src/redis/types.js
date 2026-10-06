/**
 * @typedef {Object} SetOptions
 * @property {number} [ex] Expiration time in seconds
 *
 * @typedef {Object} KeyValueStore
 * @property {(key: string) => Promise<any>} get
 * @property {(key: string, value: any, options?: SetOptions) => Promise<void>} set
 * @property {(key: string) => Promise<void>} del
 */

export {};
