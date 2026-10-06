import React, {useState} from "react";
import type {AiIntelligence} from "@site/src/lib/types";
import styles from "./IntelligencePanel.module.css";

interface IntelligencePanelProps {
  intelligence: AiIntelligence | null;
  onFetch: (forceRefresh?: boolean) => Promise<void>;
  loading: boolean;
  error?: string | null;
}

export function IntelligencePanel({
  intelligence,
  onFetch,
  loading,
  error,
}: IntelligencePanelProps) {
  // Collapsible accordion disclosure state
  const [openSections, setOpenSections] = useState<Record<string, boolean>>({
    overview: true,
    kg: true,
    trends: true,
    videos: false,
    books: false,
    jobs: false,
    paa: true,
    forums: false,
  });

  const toggleSection = (key: string) => {
    setOpenSections((prev) => ({...prev, [key]: !prev[key]}));
  };

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <div className={styles.headerTitle}>
          <span className={styles.badge}>SERP Intelligence</span>
          {intelligence ? (
            <span className={styles.cachedBadge}>
              Active {intelligence.fetchedAt ? `(${new Date(intelligence.fetchedAt).toLocaleDateString()})` : ""}
            </span>
          ) : (
            <span className={styles.cachedBadge}>Unfetched</span>
          )}
        </div>
        <div style={{display: "flex", gap: "0.5rem", alignItems: "center"}}>
          {intelligence && (
            <button
              type="button"
              className={styles.ghostButton}
              onClick={() => onFetch(true)}
              disabled={loading}
              title="Bypass Redis and Blob cache to re-run Box and SerpApi"
            >
              Force Refresh
            </button>
          )}
          <button
            type="button"
            className={styles.fetchButton}
            onClick={() => onFetch(false)}
            disabled={loading}
          >
            {loading ? "Querying Box & SerpApi..." : intelligence ? "Reload" : "Fetch Intelligence"}
          </button>
        </div>
      </div>

      {error && <div className={styles.errorNotice}>{error}</div>}

      {!intelligence && !loading && (
        <div className={styles.unfetchedNotice}>
          No intelligence block loaded yet. Click <strong>Fetch Intelligence</strong> to run an ephemeral Upstash Box and query SerpApi.
        </div>
      )}

      {intelligence && (
        <div className={styles.body}>
          {/* 1. AI Overview & Source Citations */}
          {intelligence.ai_overview && (
            <div className={styles.section}>
              <button
                type="button"
                className={styles.sectionHeaderClickable}
                aria-expanded={Boolean(openSections.overview)}
                onClick={() => toggleSection("overview")}
              >
                <div className={styles.sectionTitle}>
                  {openSections.overview ? "▼" : "▶"} Google AI Overview
                </div>
              </button>
              {openSections.overview && (
                <>
                  <div className={styles.overviewText}>
                    {intelligence.ai_overview.text || intelligence.ai_overview.snippet || "No text overview returned."}
                  </div>
                  {intelligence.ai_overview.references && intelligence.ai_overview.references.length > 0 && (
                    <div style={{marginTop: "0.85rem"}}>
                      <span className={styles.cardMeta}>Cited Sources:</span>
                      <ul className={styles.citationsList}>
                        {intelligence.ai_overview.references.map((ref, idx) => (
                          <li key={idx}>
                            {ref.link ? (
                              <a href={ref.link} target="_blank" rel="noopener noreferrer">
                                {ref.title || ref.source || ref.link}
                              </a>
                            ) : (
                              ref.title || ref.source
                            )}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {/* 2. Knowledge Graph */}
          {intelligence.knowledge_graph && (
            <div className={styles.section}>
              <button
                type="button"
                className={styles.sectionHeaderClickable}
                aria-expanded={Boolean(openSections.kg)}
                onClick={() => toggleSection("kg")}
              >
                <div className={styles.sectionTitle}>
                  {openSections.kg ? "▼" : "▶"} Knowledge Graph: {intelligence.knowledge_graph.title} ({intelligence.knowledge_graph.type || "Entity"})
                </div>
              </button>
              {openSections.kg && (
                <>
                  <div className={styles.overviewText}>
                    {intelligence.knowledge_graph.description || ""}
                  </div>
                  {intelligence.knowledge_graph.website && (
                    <div style={{marginTop: "0.5rem"}}>
                      <a href={intelligence.knowledge_graph.website} target="_blank" rel="noopener noreferrer">
                        Official Website ↗
                      </a>
                    </div>
                  )}
                  {intelligence.knowledge_graph.attributes && (
                    <div className={styles.attributesGrid}>
                      {Object.entries(intelligence.knowledge_graph.attributes).map(([k, v]) => (
                        <div key={k} className={styles.attrItem}>
                          <span className={styles.attrKey}>{k}:</span>{" "}
                          <span className={styles.attrVal}>{String(v)}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {/* 3. Google Trends (Findings 4 & R2 Resolution) */}
          {intelligence.trends && (
            <div className={styles.section}>
              <button
                type="button"
                className={styles.sectionHeaderClickable}
                aria-expanded={Boolean(openSections.trends)}
                onClick={() => toggleSection("trends")}
              >
                <div className={styles.sectionTitle}>
                  {openSections.trends ? "▼" : "▶"} Google Trends & Velocity Data
                </div>
              </button>
              {openSections.trends && (
                <div className={styles.trendsContainer}>
                  {/* Timeline / Interest Over Time */}
                  {(() => {
                    const rawIot = intelligence.trends.interest_over_time;
                    if (!rawIot) return null;
                    if (Array.isArray(rawIot) && typeof rawIot[0] === "number") {
                      return (
                        <div>
                          <span className={styles.cardMeta}>Interest Over Time:</span>
                          <div className={styles.tagWrap}>
                            {(rawIot as number[]).map((val, i) => (
                              <span key={i} className={styles.trendTag}>
                                Index {i + 1}: {val}
                              </span>
                            ))}
                          </div>
                        </div>
                      );
                    }
                    const points = Array.isArray(rawIot)
                      ? rawIot
                      : rawIot.timeline_data || [];
                    if (points.length === 0) return null;
                    return (
                      <div>
                        <span className={styles.cardMeta}>Interest Over Time:</span>
                        <div className={styles.tagWrap}>
                          {points.slice(-8).map((pt, i) => {
                            if (typeof pt === "number") {
                              return (
                                <span key={i} className={styles.trendTag}>
                                  Index {i + 1}: {pt}
                                </span>
                              );
                            }
                            const val = pt.extracted_value ?? pt.value ?? pt.values?.[0]?.extracted_value ?? pt.values?.[0]?.value;
                            return (
                              <span key={i} className={styles.trendTag}>
                                {pt.date || `Point ${i + 1}`}: {val !== undefined ? String(val) : "—"}
                              </span>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })()}

                  {/* Interest by Region */}
                  {intelligence.trends.interest_by_region && intelligence.trends.interest_by_region.length > 0 && (
                    <div style={{marginTop: "0.6rem"}}>
                      <span className={styles.cardMeta}>Interest by Region:</span>
                      <div className={styles.tagWrap}>
                        {intelligence.trends.interest_by_region.slice(0, 8).map((r, i) => (
                          <span key={i} className={styles.trendTag}>
                            {r.location || "Region"}: {r.extracted_value ?? r.value ?? "—"}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Rising Queries */}
                  {intelligence.trends.related_queries?.rising && intelligence.trends.related_queries.rising.length > 0 && (
                    <div style={{marginTop: "0.6rem"}}>
                      <span className={styles.cardMeta}>Rising Search Queries:</span>
                      <div className={styles.tagWrap}>
                        {intelligence.trends.related_queries.rising.slice(0, 6).map((q, i) => (
                          <span key={i} className={styles.trendTag}>
                            {q.query} {q.value ? `(+${q.value})` : ""}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Related Topics */}
                  {intelligence.trends.related_topics?.top && intelligence.trends.related_topics.top.length > 0 && (
                    <div style={{marginTop: "0.6rem"}}>
                      <span className={styles.cardMeta}>Top Related Topics:</span>
                      <div className={styles.tagWrap}>
                        {intelligence.trends.related_topics.top.slice(0, 6).map((t, i) => (
                          <span key={i} className={styles.trendTag}>
                            {t.topic?.title || t.query}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* 4. Inline Videos */}
          {intelligence.inline_videos && intelligence.inline_videos.length > 0 && (
            <div className={styles.section}>
              <button
                type="button"
                className={styles.sectionHeaderClickable}
                aria-expanded={Boolean(openSections.videos)}
                onClick={() => toggleSection("videos")}
              >
                <div className={styles.sectionTitle}>
                  {openSections.videos ? "▼" : "▶"} Inline Video References ({intelligence.inline_videos.length})
                </div>
              </button>
              {openSections.videos && (
                <div className={styles.grid}>
                  {intelligence.inline_videos.map((vid, i) => (
                    <div key={i} className={styles.card}>
                      <a href={vid.link} target="_blank" rel="noopener noreferrer">
                        {vid.title || "Video"}
                      </a>
                      <span className={styles.cardMeta}>
                        {vid.channel} {vid.duration ? `• ${vid.duration}` : ""}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* 5. Book Recommendations / Shopping */}
          {intelligence.books_shopping && intelligence.books_shopping.length > 0 && (
            <div className={styles.section}>
              <button
                type="button"
                className={styles.sectionHeaderClickable}
                aria-expanded={Boolean(openSections.books)}
                onClick={() => toggleSection("books")}
              >
                <div className={styles.sectionTitle}>
                  {openSections.books ? "▼" : "▶"} Curated Books & Literature ({intelligence.books_shopping.length})
                </div>
              </button>
              {openSections.books && (
                <div className={styles.grid}>
                  {intelligence.books_shopping.map((book, i) => (
                    <div key={i} className={styles.card}>
                      <a href={book.link} target="_blank" rel="noopener noreferrer">
                        {book.title || "Book"}
                      </a>
                      <span className={styles.cardMeta}>
                        {book.source} {book.price ? `• ${book.price}` : ""}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* 6. Jobs & Industry Roles */}
          {intelligence.jobs_results && intelligence.jobs_results.length > 0 && (
            <div className={styles.section}>
              <button
                type="button"
                className={styles.sectionHeaderClickable}
                aria-expanded={Boolean(openSections.jobs)}
                onClick={() => toggleSection("jobs")}
              >
                <div className={styles.sectionTitle}>
                  {openSections.jobs ? "▼" : "▶"} Industry Opportunities ({intelligence.jobs_results.length})
                </div>
              </button>
              {openSections.jobs && (
                <div className={styles.grid}>
                  {intelligence.jobs_results.map((job, i) => (
                    <div key={i} className={styles.card}>
                      <strong>{job.title}</strong>
                      <span className={styles.cardMeta}>
                        {job.company_name} • {job.location} ({job.via})
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* 7. People Also Ask */}
          {intelligence.people_also_ask && intelligence.people_also_ask.length > 0 && (
            <div className={styles.section}>
              <button
                type="button"
                className={styles.sectionHeaderClickable}
                aria-expanded={Boolean(openSections.paa)}
                onClick={() => toggleSection("paa")}
              >
                <div className={styles.sectionTitle}>
                  {openSections.paa ? "▼" : "▶"} People Also Ask ({intelligence.people_also_ask.length})
                </div>
              </button>
              {openSections.paa && (
                <div className={styles.grid}>
                  {intelligence.people_also_ask.map((paa, i) => (
                    <div key={i} className={styles.card}>
                      <strong>{paa.question}</strong>
                      {paa.snippet && <span className={styles.overviewText}>{paa.snippet}</span>}
                      {paa.link && (
                        <a href={paa.link} target="_blank" rel="noopener noreferrer">
                          Read source ↗
                        </a>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* 8. Discussions & Forums */}
          {intelligence.discussions_and_forums && intelligence.discussions_and_forums.length > 0 && (
            <div className={styles.section}>
              <button
                type="button"
                className={styles.sectionHeaderClickable}
                aria-expanded={Boolean(openSections.forums)}
                onClick={() => toggleSection("forums")}
              >
                <div className={styles.sectionTitle}>
                  {openSections.forums ? "▼" : "▶"} Community Discussions & Forums ({intelligence.discussions_and_forums.length})
                </div>
              </button>
              {openSections.forums && (
                <div className={styles.grid}>
                  {intelligence.discussions_and_forums.map((disc, i) => (
                    <div key={i} className={styles.card}>
                      <a href={disc.link} target="_blank" rel="noopener noreferrer">
                        {disc.title || "Discussion"}
                      </a>
                      <span className={styles.cardMeta}>{disc.forum || "Community"}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
export default IntelligencePanel;
