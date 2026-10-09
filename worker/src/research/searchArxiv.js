const BASE_ARXIV_URL = "https://export.arxiv.org/api/query";

/**
 * Sanitizes and single-lines text from XML nodes.
 *
 * @param {string} text
 * @returns {string}
 */
export function collapse(text) {
  return text ? text.replace(/\s+/g, " ").trim() : "";
}

/**
 * Lightweight, zero-dependency Atom 1.0 XML feed parser compatible with Cloudflare Workers isolates and Node.
 *
 * @param {string} xml
 * @returns {{ title: string, id: string, updated: string, totalResults: number, entries: any[], error?: string }}
 */
export function parseAtom(xml) {
  if (!xml || typeof xml !== "string") {
    return { title: "", id: "", updated: "", totalResults: 0, entries: [] };
  }

  const titleMatch = xml.match(/<feed[^>]*>[\s\S]*?<title[^>]*>([\s\S]*?)<\/title>/i);
  const idMatch = xml.match(/<feed[^>]*>[\s\S]*?<id[^>]*>([\s\S]*?)<\/id>/i);
  const updatedMatch = xml.match(/<feed[^>]*>[\s\S]*?<updated[^>]*>([\s\S]*?)<\/updated>/i);
  const totalResultsMatch = xml.match(/<opensearch:totalResults[^>]*>([\s\S]*?)<\/opensearch:totalResults>/i);

  const feed = {
    title: collapse(titleMatch?.[1] || ""),
    id: collapse(idMatch?.[1] || ""),
    updated: collapse(updatedMatch?.[1] || ""),
    totalResults: parseInt(totalResultsMatch?.[1] || "0", 10) || 0,
    entries: [],
  };

  const entryRegex = /<entry[^>]*>([\s\S]*?)<\/entry>/gi;
  let match;

  while ((match = entryRegex.exec(xml)) !== null) {
    const entryXml = match[1];

    const entryIdMatch = entryXml.match(/<id[^>]*>([\s\S]*?)<\/id>/i);
    const entryId = collapse(entryIdMatch?.[1] || "");

    const entryTitleMatch = entryXml.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
    const title = collapse(entryTitleMatch?.[1] || "");

    const entrySummaryMatch = entryXml.match(/<summary[^>]*>([\s\S]*?)<\/summary>/i);
    const summary = collapse(entrySummaryMatch?.[1] || "");

    const publishedMatch = entryXml.match(/<published[^>]*>([\s\S]*?)<\/published>/i);
    const published = collapse(publishedMatch?.[1] || "");

    const updatedMatch2 = entryXml.match(/<updated[^>]*>([\s\S]*?)<\/updated>/i);
    const updated = collapse(updatedMatch2?.[1] || "");

    const isError = title === "Error" || entryId.startsWith("http://arxiv.org/api/errors");
    if (isError) {
      feed.error = summary || title;
      return feed;
    }

    // Extract links
    const links = {};
    const linkRegex = /<link\b([^>]*?)(?:\/>|><\/link>)/gi;
    let linkMatch;
    while ((linkMatch = linkRegex.exec(entryXml)) !== null) {
      const attrs = linkMatch[1];
      const relMatch = attrs.match(/rel="([^"]*)"/i);
      const hrefMatch = attrs.match(/href="([^"]*)"/i);
      const titleAttrMatch = attrs.match(/title="([^"]*)"/i);

      const rel = relMatch?.[1];
      const href = hrefMatch?.[1];
      const t = titleAttrMatch?.[1];

      if (rel === "alternate" && href) links.abstract = href;
      if (t === "pdf" && href) links.pdf = href;
      if (t === "doi" && href) links.doi = href;
    }

    // Default abstract link fallback if not provided via rel="alternate"
    if (!links.abstract && entryId) {
      links.abstract = entryId;
    }

    // Extract authors
    const authors = [];
    const authorRegex = /<author[^>]*>([\s\S]*?)<\/author>/gi;
    let authorMatch;
    while ((authorMatch = authorRegex.exec(entryXml)) !== null) {
      const authorBlock = authorMatch[1];
      const nameMatch = authorBlock.match(/<name[^>]*>([\s\S]*?)<\/name>/i);
      const affMatch = authorBlock.match(/<arxiv:affiliation[^>]*>([\s\S]*?)<\/arxiv:affiliation>/i);
      const name = collapse(nameMatch?.[1] || "");
      if (name) {
        authors.push({
          name,
          affiliation: collapse(affMatch?.[1] || ""),
        });
      }
    }

    // Extract categories
    const categories = [];
    const categoryRegex = /<category\b[^>]*term="([^"]*)"[^>]*>/gi;
    let catMatch;
    while ((catMatch = categoryRegex.exec(entryXml)) !== null) {
      const term = catMatch[1];
      if (term && !categories.includes(term)) categories.push(term);
    }

    const primaryCatMatch = entryXml.match(/<arxiv:primary_category\b[^>]*term="([^"]*)"/i);
    const primaryCategory = primaryCatMatch?.[1] || categories[0] || null;

    const doiMatch = entryXml.match(/<arxiv:doi[^>]*>([\s\S]*?)<\/arxiv:doi>/i);
    const commentMatch = entryXml.match(/<arxiv:comment[^>]*>([\s\S]*?)<\/arxiv:comment>/i);
    const journalRefMatch = entryXml.match(/<arxiv:journal_ref[^>]*>([\s\S]*?)<\/arxiv:journal_ref>/i);

    const id = entryId.replace(/^https?:\/\/arxiv\.org\/abs\//, "");

    // Fallback for pdf if missing
    if (!links.pdf && id) {
      links.pdf = `https://arxiv.org/pdf/${id}`;
    }

    feed.entries.push({
      id,
      entryId,
      title,
      summary,
      published,
      updated,
      authors,
      links,
      categories,
      primaryCategory,
      comment: collapse(commentMatch?.[1] || ""),
      journalRef: collapse(journalRefMatch?.[1] || ""),
      doi: collapse(doiMatch?.[1] || ""),
    });
  }

  return feed;
}

/**
 * Searches arXiv using search_query parameters.
 *
 * @param {Object} [options]
 * @param {string} [options.searchQuery]
 * @param {string} [options.idList]
 * @param {number} [options.start=0]
 * @param {number} [options.maxResults=10]
 * @param {string} [options.sortBy="relevance"]
 * @param {string} [options.sortOrder="descending"]
 * @returns {Promise<{ title: string, id: string, updated: string, totalResults: number, entries: any[], error?: string }>}
 */
export async function searchArxiv({
  searchQuery,
  idList,
  start = 0,
  maxResults = 10,
  sortBy = "relevance",
  sortOrder = "descending",
} = {}) {
  const params = new URLSearchParams({
    start: String(start),
    max_results: String(maxResults),
    sortBy,
    sortOrder,
  });

  if (searchQuery) params.set("search_query", searchQuery);
  if (idList) params.set("id_list", idList);

  const res = await fetch(`${BASE_ARXIV_URL}?${params.toString()}`, {
    method: "GET",
    headers: {
      "User-Agent": "kalidass-journal/1.0 (mailto:contact@kalidass.amrit.fyi)",
      Accept: "application/atom+xml, application/xml",
    },
  });

  if (!res.ok) {
    const errorText = await res.text().catch(() => "");
    throw new Error(`arXiv HTTP ${res.status}: ${errorText || res.statusText}`);
  }

  const xml = await res.text();
  return parseAtom(xml);
}

/**
 * Queries arXiv for papers matching a given topic.
 *
 * @param {string} topic
 * @param {any} [env]
 * @returns {Promise<{ query: string, topic: string, rawItems: any[] }>}
 */
export async function fetchArxivPapers(topic, env) {
  const cleanTopic = String(topic || "")
    .replace(/[\r\n\t]+/g, " ")
    .trim()
    .slice(0, 150);

  const sanitized = cleanTopic.replace(/[^\w\s-]/g, " ").trim();
  const tokens = sanitized.split(/\s+/).filter((t) => t.length > 2).slice(0, 8);
  const searchQuery = tokens.length > 0 ? `all:${tokens.join(" AND all:")}` : `all:${sanitized || "technology"}`;

  const feed = await searchArxiv({
    searchQuery,
    start: 0,
    maxResults: 10,
    sortBy: "relevance",
    sortOrder: "descending",
  });

  if (feed.error) {
    throw new Error(`arXiv error: ${feed.error}`);
  }

  return {
    query: searchQuery,
    topic: cleanTopic,
    rawItems: feed.entries || [],
  };
}
