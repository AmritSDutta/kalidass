export class ResponseHelper {
  static corsHeaders(origin, extra = {}) {
    return {
      "access-control-allow-origin": origin,
      "access-control-allow-methods": "GET,POST,PUT,DELETE,OPTIONS",
      "access-control-allow-headers": "content-type,authorization,x-admin-token,x-typesafe-key,x-jev-key,x-clef-key,x-eval-provider,x-cf-model",
      "access-control-max-age": "86400",
      ...extra,
    };
  }

  static json(data, status = 200, origin = "*", extraHeaders = {}) {
    return new Response(JSON.stringify(data), {
      status,
      headers: ResponseHelper.corsHeaders(origin, {"content-type": "application/json; charset=utf-8", ...extraHeaders}),
    });
  }

  static options(origin) {
    return new Response(null, {status: 204, headers: ResponseHelper.corsHeaders(origin)});
  }

  static withCors(response, origin) {
    const headers = new Headers(response.headers);
    for (const [key, value] of Object.entries(ResponseHelper.corsHeaders(origin))) {
      headers.set(key, value);
    }
    return new Response(response.body, {status: response.status, headers});
  }

  static resolveOrigin(request, env) {
    const reqOrigin = request.headers.get("origin") || "";
    const allowed = [
      env?.CORS_ORIGIN,
      "https://kalidass.amrit.fyi",
      "https://kalidass.pages.dev",
      "http://localhost:3000",
      "http://127.0.0.1:3000",
    ].filter(Boolean);
    if (allowed.includes(reqOrigin)) return reqOrigin;
    return env?.CORS_ORIGIN || "*";
  }
}
