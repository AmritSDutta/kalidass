interface Fetcher {
  fetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response>;
}

interface Env {
  JOURNAL_WORKER: Fetcher;
}

interface PagesContext {
  request: Request;
  env: Env;
  params: Record<string, string | string[]>;
  data: Record<string, unknown>;
  next: (input?: Request | string, init?: RequestInit) => Promise<Response>;
  waitUntil: (promise: Promise<unknown>) => void;
}

export const onRequest = async (context: PagesContext): Promise<Response> => {
  const { request, env } = context;

  if (!env.JOURNAL_WORKER) {
    return new Response(
      JSON.stringify({
        ok: false,
        error: "JOURNAL_WORKER service binding is not configured in Cloudflare Pages settings.",
      }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }

  return env.JOURNAL_WORKER.fetch(request);
};


