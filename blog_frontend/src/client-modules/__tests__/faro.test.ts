import {describe, it, expect} from "vitest";
import {getFaro, resolveFaroCollectorUrl} from "../faro";

describe("Faro Client Module", () => {
  it("exports getFaro helper safely without runtime errors", () => {
    // In test environment without FARO_COLLECTOR_URL, getFaro returns null cleanly
    expect(typeof getFaro).toBe("function");
    expect(getFaro()).toBeNull();
  });

  describe("resolveFaroCollectorUrl", () => {
    it("returns explicit FARO_COLLECTOR_URL when provided", () => {
      const result = resolveFaroCollectorUrl({
        FARO_COLLECTOR_URL: "https://custom-collector.net/collect/123",
      });
      expect(result).toBe("https://custom-collector.net/collect/123");
    });

    it("auto-derives collector URL from FARO_ENDPOINT and FARO_APP_ID", () => {
      const result = resolveFaroCollectorUrl({
        FARO_ENDPOINT: "https://faro-api-example.grafana.net/faro/api/v1",
        FARO_APP_ID: "1234",
      });
      expect(result).toBe("https://faro-collector-example.grafana.net/collect/1234");
    });

    it("returns empty string when required parameters are missing", () => {
      expect(resolveFaroCollectorUrl({})).toBe("");
      expect(resolveFaroCollectorUrl({FARO_ENDPOINT: "https://faro-api-prod.net"})).toBe("");
      expect(resolveFaroCollectorUrl({FARO_APP_ID: "1234"})).toBe("");
    });
  });
});
