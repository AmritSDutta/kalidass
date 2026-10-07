import ExecutionEnvironment from "@docusaurus/ExecutionEnvironment";
import siteConfig from "@generated/docusaurus.config";
import {initializeFaro, getWebInstrumentations, type Faro} from "@grafana/faro-web-sdk";
import {TracingInstrumentation} from "@grafana/faro-web-tracing";
import {ReactIntegration} from "@grafana/faro-react";

let faroInstance: Faro | null = null;

export function resolveFaroCollectorUrl(env: Record<string, string | undefined> = {}): string {
  if (env.FARO_COLLECTOR_URL) {
    return env.FARO_COLLECTOR_URL.trim();
  }
  const endpoint = (env.FARO_ENDPOINT || "").trim();
  const appId = (env.FARO_APP_ID || "").trim();
  if (endpoint && appId) {
    try {
      const parsed = new URL(endpoint);
      const host = parsed.hostname.replace(/^faro-api-/, "faro-collector-");
      return `${parsed.protocol}//${host}/collect/${appId}`;
    } catch {
      return "";
    }
  }
  return "";
}

export function getFaro(): Faro | null {
  return faroInstance;
}

if (ExecutionEnvironment.canUseDOM) {
  const customFields = (siteConfig.customFields || {}) as Record<string, unknown>;
  // Resolved at build time in docusaurus.config.ts (explicit FARO_COLLECTOR_URL or auto-derived).
  // Empty string keeps telemetry safely inactive.
  const collectorUrl = typeof customFields.faroCollectorUrl === "string" ? customFields.faroCollectorUrl.trim() : "";
  const appName = (customFields.faroAppName as string) || "kalidass";
  const appVersion = (customFields.faroAppVersion as string) || "1.0.0";
  const environment = (customFields.faroEnvironment as string) || "production";

  if (collectorUrl) {
    try {
      faroInstance = initializeFaro({
        url: collectorUrl,
        paused: process.env.NODE_ENV === "development" && !collectorUrl.includes("force=true"),
        app: {
          name: appName,
          version: appVersion,
          environment,
        },
        instrumentations: [
          ...getWebInstrumentations({
            captureConsole: true,
          }),
          new TracingInstrumentation({
            instrumentationOptions: {
              propagateTraceHeaderCorsUrls: [
                /^\/api/,
                /kalidass\.amrit\.fyi/,
                /127\.0\.0\.1:8787/,
              ],
            },
          }),
          new ReactIntegration(),
        ],
      });
    } catch (err) {
      console.warn("[Faro] Failed to initialize Grafana Faro telemetry:", err);
    }
  }
}
