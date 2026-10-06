const store = new Map();

function toBytes(body) {
  if (typeof body === "string") return new TextEncoder().encode(body);
  if (body instanceof Uint8Array) return body;
  if (body instanceof ArrayBuffer) return new Uint8Array(body);
  return null;
}

export function memoryBucket() {
  return {
    async get(path) {
      const item = store.get(path);
      if (!item) {
        const error = new Error("not_found");
        error.code = "not_found";
        throw error;
      }
      return {
        path,
        size: item.bytes.byteLength,
        contentType: item.contentType,
        url: item.url,
        body: new Blob([item.bytes], {type: item.contentType}).stream(),
      };
    },
    async put(path, body, options = {}) {
      let bytes = toBytes(body);
      if (!bytes) {
        const buffer = await new Response(body).arrayBuffer();
        bytes = new Uint8Array(buffer);
      }
      const contentType = options.contentType || "application/octet-stream";
      const url = `/api/blob/${path.split("/").map(encodeURIComponent).join("/")}`;
      store.set(path, {bytes, contentType, url});
      return {path, url, size: bytes.byteLength, contentType};
    },
    async del(path) {
      store.delete(path);
    },
    async list(options = {}) {
      const prefix = options.prefix || "";
      const matches = [];
      for (const [key, item] of store.entries()) {
        if (key.startsWith(prefix)) {
          matches.push({
            path: key,
            size: item.bytes.byteLength,
            contentType: item.contentType,
            url: item.url,
          });
        }
      }
      return {blobs: matches, cursor: undefined};
    },
  };
}

export function getMemoryObject(path) {
  return store.get(path) || null;
}

export function clearMemoryStore() {
  store.clear();
}

