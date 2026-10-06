import React, {useState} from "react";
import type {AiIntelligence} from "@site/src/lib/types";
import styles from "./IntelligencePanel.module.css";

interface IntelligencePanelProps {
  intelligence: AiIntelligence | null;
  onFetch?: (forceRefresh?: boolean) => Promise<void>;
  loading?: boolean;
  error?: string | null;
  readOnly?: boolean;
}

export function IntelligencePanel({
  intelligence,
  onFetch,
  loading = false,
  error,
  readOnly = false,
}: IntelligencePanelProps) {
  // Collapsible accordion disclosure state — sections render lazily on expand,
  // so only the overview mounts by default.
  const [openSections, setOpenSections] = useState<Record<string, boolean>>({
    overview: true,
    kg: false,
    organic: false,
    answer_box: false,
    news: false,
    videos: false,
    books: false,
    jobs: false,
    paa: false,
    forums: false,
  });

  const toggleSection = (key: string) => {
    setOpenSections((prev) => ({...prev, [key]: !prev[key]}));
  };

  const overviewReferences =
    intelligence?.ai_overview?.expanded?.references ||
    intelligence?.ai_overview?.references ||
    [];

  const textBlocks = intelligence?.ai_overview?.expanded?.text_blocks;

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
        {!readOnly && onFetch && (
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
        )}
      </div>

      {error && <div className={styles.errorNotice}>{error}</div>}

      {!intelligence && !loading && (
        <div className={styles.unfetchedNotice}>
          {readOnly
            ? "No AI intelligence dossier compiled for this dispatch yet."
            : "No intelligence block loaded yet. Click Fetch Intelligence to run an ephemeral Upstash Box and query SerpApi."}
        </div>
      )}

      {intelligence && (
        <div className={styles.body}>
          {/* 1. Google AI Overview & Citations */}
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
                  {Array.isArray(textBlocks) && textBlocks.length > 0 ? (
                    <div className={styles.aiBlocks}>
                      {textBlocks.map((block, bIdx) => {
                        if (block.type === "heading") {
                          return <h4 key={bIdx} className={styles.aiHeading}>{block.snippet || block.text}</h4>;
                        }
                        if (block.type === "list" && Array.isArray(block.list)) {
                          return (
                            <ul key={bIdx} className={styles.aiList}>
                              {block.list.map((item, lIdx) => (
                                <li key={lIdx} className={styles.aiListItem}>{item.snippet}</li>
                              ))}
                            </ul>
                          );
                        }
                        return (
                          <div key={bIdx}>
                            <p className={styles.aiParagraph}>{block.snippet || block.text}</p>
                            {block.snippet_links && block.snippet_links.length > 0 && (
                              <div className={styles.aiLinks}>
                                {block.snippet_links.map((lnk, lkIdx) => (
                                  <a key={lkIdx} href={lnk.link} target="_blank" rel="noopener noreferrer" className={styles.aiLinkBadge}>
                                    {lnk.text} ↗
                                  </a>
                                ))}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <div className={styles.overviewText}>
                      {intelligence.ai_overview.text || intelligence.ai_overview.snippet || "No text overview returned."}
                    </div>
                  )}

                  {overviewReferences.length > 0 && (
                    <div style={{marginTop: "1rem"}}>
                      <span className={styles.cardMeta}>Cited Sources:</span>
                      <div className={styles.referenceGrid}>
                        {overviewReferences.map((ref, idx) => (
                          <div key={idx} className={styles.referenceCard}>
                            <div className={styles.referenceHeader}>
                              {ref.source_icon && (
                                <img src={ref.source_icon} alt="" loading="lazy" className={styles.referenceFavicon} />
                              )}
                              <span className={styles.referenceSource}>{ref.source || "Source"}</span>
                            </div>
                            {ref.link ? (
                              <a href={ref.link} target="_blank" rel="noopener noreferrer" className={styles.referenceTitle}>
                                {ref.title || ref.link}
                              </a>
                            ) : (
                              <span className={styles.referenceTitle}>{ref.title}</span>
                            )}
                            {ref.snippet && (
                              <div className={styles.referenceSnippet}>{ref.snippet}</div>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {/* 2. Answer Box / Featured Snippet */}
          {intelligence.answer_box && (
            <div className={styles.section}>
              <button
                type="button"
                className={styles.sectionHeaderClickable}
                aria-expanded={Boolean(openSections.answer_box)}
                onClick={() => toggleSection("answer_box")}
              >
                <div className={styles.sectionTitle}>
                  {openSections.answer_box ? "▼" : "▶"} Featured Answer Box
                </div>
              </button>
              {openSections.answer_box && (
                <div className={styles.organicCard}>
                  {intelligence.answer_box.title && <strong>{intelligence.answer_box.title}</strong>}
                  <p className={styles.overviewText}>
                    {intelligence.answer_box.answer || intelligence.answer_box.snippet}
                  </p>
                  {intelligence.answer_box.link && (
                    <a href={intelligence.answer_box.link} target="_blank" rel="noopener noreferrer" className={styles.organicTitle}>
                      View source ↗
                    </a>
                  )}
                </div>
              )}
            </div>
          )}

          {/* 3. Knowledge Graph */}
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

          {/* 4. Organic Search Results (Top 10 Citations) */}
          {intelligence.organic_results && intelligence.organic_results.length > 0 && (
            <div className={styles.section}>
              <button
                type="button"
                className={styles.sectionHeaderClickable}
                aria-expanded={Boolean(openSections.organic)}
                onClick={() => toggleSection("organic")}
              >
                <div className={styles.sectionTitle}>
                  {openSections.organic ? "▼" : "▶"} Organic Citations & Industry Grounding ({intelligence.organic_results.length})
                </div>
              </button>
              {openSections.organic && (
                <div className={styles.organicGrid}>
                  {intelligence.organic_results.map((item, idx) => (
                    <div key={idx} className={styles.organicCard}>
                      <a href={item.link} target="_blank" rel="noopener noreferrer" className={styles.organicTitle}>
                        {item.title} ↗
                      </a>
                      <span className={styles.organicDomain}>
                        {(() => {
                          try {
                            return new URL(item.link).hostname;
                          } catch {
                            return item.link;
                          }
                        })()}
                      </span>
                      {item.snippet && <p className={styles.organicSnippet}>{item.snippet}</p>}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* 5. News & Top Stories */}
          {intelligence.news && intelligence.news.length > 0 && (
            <div className={styles.section}>
              <button
                type="button"
                className={styles.sectionHeaderClickable}
                aria-expanded={Boolean(openSections.news)}
                onClick={() => toggleSection("news")}
              >
                <div className={styles.sectionTitle}>
                  {openSections.news ? "▼" : "▶"} News & Top Stories ({intelligence.news.length})
                </div>
              </button>
              {openSections.news && (
                <div className={styles.grid}>
                  {intelligence.news.map((item, i) => (
                    <div key={i} className={styles.card}>
                      <a href={item.link} target="_blank" rel="noopener noreferrer">
                        {item.title || "News Story"}
                      </a>
                      <span className={styles.cardMeta}>
                        {item.source} {item.date ? `• ${item.date}` : ""}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* 6. People Also Ask */}
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

          {/* 7. Inline Videos */}
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

          {/* 8. Books Shopping */}
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

          {/* 9. Jobs & Industry Opportunities */}
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

          {/* 10. Discussions & Forums */}
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
