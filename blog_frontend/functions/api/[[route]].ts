interface Env {
  WORKER_URL: string;
  CF_ACCESS_CLIENT_ID: string;
  CF_ACCESS_CLIENT_SECRET: string;
}

export const onRequest: PagesFunction<Env> = async (context) => {
  const { request, env } = context;
  const url = new URL(request.url);

  const targetBase = env.WORKER_URL || "https://api.kalidass.amrit.fyi";
  const workerUrl = `${targetBase}${url.pathname}${url.search}`;

  const headers = new Headers(request.headers);
  if (env.CF_ACCESS_CLIENT_ID) {
    headers.set("CF-Access-Client-Id", env.CF_ACCESS_CLIENT_ID);
  }
  if (env.CF_ACCESS_CLIENT_SECRET) {
    headers.set("CF-Access-Client-Secret", env.CF_ACCESS_CLIENT_SECRET);
  }

  return fetch(workerUrl, {
    method: request.method,
    headers,
    body: ["GET", "HEAD"].includes(request.method) ? null : request.body,
  });
};
