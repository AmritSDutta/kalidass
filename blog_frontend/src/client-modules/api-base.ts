import ExecutionEnvironment from "@docusaurus/ExecutionEnvironment";
import siteConfig from "@generated/docusaurus.config";

declare global {
  interface Window {
    KALIDASS_API_BASE?: string;
  }
}

if (ExecutionEnvironment.canUseDOM) {
  window.KALIDASS_API_BASE = String(siteConfig.customFields?.apiBase || "");
}
