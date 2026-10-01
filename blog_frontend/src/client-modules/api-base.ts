import ExecutionEnvironment from "@docusaurus/ExecutionEnvironment";
import siteConfig from "@generated/docusaurus.config";

declare global {
  interface Window {
    AMRIT_API_BASE?: string;
  }
}

if (ExecutionEnvironment.canUseDOM) {
  window.AMRIT_API_BASE = String(siteConfig.customFields?.apiBase || "");
}
