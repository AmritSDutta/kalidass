/**
 * Direct HTTPS fetcher for SerpApi Amazon Search Engine (amazon.in).
 *
 * @param {string} topic - Article topic or title to query
 * @param {any} env - Cloudflare Worker environment bindings
 * @returns {Promise<{ query: string, topic: string, amazon_domain: string, rawItems: any[] }>}
 */
export async function fetchAmazonBooks(topic, env) {
  const apiKey = env?.SERPAPI_API_KEY || env?.SERP_API_KEY;
  if (!apiKey) {
    throw new Error("SERPAPI_API_KEY is not configured in worker environment.");
  }

  const cleanTopic = String(topic || "")
    .replace(/[\r\n\t]+/g, " ")
    .trim()
    .slice(0, 150);

  const query = `Books on: ${cleanTopic}`;
  const params = new URLSearchParams({
    engine: "amazon",
    k: query,
    amazon_domain: "amazon.in",
    api_key: apiKey,
  });

  const url = `https://serpapi.com/search.json?${params.toString()}`;
  const response = await fetch(url, {
    method: "GET",
    headers: {
      "User-Agent": "kalidass-books/1.0",
      Accept: "application/json",
    },
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => "");
    throw new Error(`SerpApi Amazon HTTP ${response.status}: ${errorText || response.statusText}`);
  }

  const data = await response.json();
  if (data?.error) {
    throw new Error(`SerpApi Amazon returned error: ${data.error}`);
  }

  const rawList = Array.isArray(data?.organic_results)
    ? data.organic_results
    : Array.isArray(data?.amazon_results)
      ? data.amazon_results
      : [];

  const rawItems = rawList.map((item) => {
    const rawPrice =
      item?.price_string ||
      (typeof item?.price === "object" ? item?.price?.raw || item?.price?.value : item?.price) ||
      (item?.extracted_price ? `₹${item.extracted_price}` : "");

    const authors = Array.isArray(item?.authors)
      ? item.authors.map((a) => (typeof a === "object" ? a.name : String(a))).filter(Boolean)
      : typeof item?.author === "string"
        ? [item.author]
        : [];

    return {
      title: String(item?.title || "").trim(),
      asin: item?.asin || "",
      link: item?.link || (item?.asin ? `https://www.amazon.in/dp/${item.asin}` : ""),
      thumbnail: item?.thumbnail || item?.image || "",
      price: String(rawPrice || "").trim(),
      rating: typeof item?.rating === "number" ? item.rating : parseFloat(item?.rating) || 0,
      reviews_count:
        typeof item?.reviews_count === "number"
          ? item.reviews_count
          : parseInt(item?.ratings_total || item?.reviews_count, 10) || 0,
      authors,
      badge: item?.badge || item?.bestseller ? "Best Seller" : item?.amazons_choice ? "Amazon's Choice" : "",
    };
  }).filter((item) => item.title && item.link);

  return {
    query,
    topic: cleanTopic,
    amazon_domain: "amazon.in",
    rawItems,
  };
}
