import {useEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent, type ReactNode} from "react";
import Layout from "@theme/Layout";
import Link from "@docusaurus/Link";
import {useLocation} from "@docusaurus/router";
import StoryBody, {headingSlug} from "@site/src/components/StoryBody";
import VideoEmbed from "@site/src/components/VideoEmbed";
import {evaluateQuality, getArticle, getArticleIntelligence, getArticleBooks, triggerArticleBooks, getArticleResearch, triggerArticleResearch, updateArticle} from "@site/src/lib/api";
import {useAuth} from "@site/src/lib/auth";
import {formatDate} from "@site/src/lib/media";
import type {Article, QualityEvalResult, AiIntelligence, BooksSuggestionData, ResearchSuggestionData} from "@site/src/lib/types";
import {IntelligencePanel} from "@site/src/components/IntelligencePanel/IntelligencePanel";
import {BooksPanel} from "@site/src/components/BooksPanel/BooksPanel";
import {ResearchPanel} from "@site/src/components/ResearchPanel/ResearchPanel";
import styles from "./StoryPage.module.css";

interface HeadingItem {
  id: string;
  text: string;
  wordCount: number;
}

export default function StoryPage(): ReactNode {
  const {user, isAdmin, isAuthenticated} = useAuth();
  const location = useLocation();
  const slug = location.pathname.replace(/^\/story\//, "").replace(/\/$/, "");
  const [article, setArticle] = useState<Article | null>(null);
  const [error, setError] = useState("");
  const [activeHeadingId, setActiveHeadingId] = useState<string>("");
  const [evalResult, setEvalResult] = useState<QualityEvalResult | null>(null);
  const [evaluating, setEvaluating] = useState<boolean>(false);
  const [evalError, setEvalError] = useState<string>("");

  // Staged enhancement state
  const [stagedArticle, setStagedArticle] = useState<Article | null>(null);
  const [stagedDirtyIndices, setStagedDirtyIndices] = useState<number[]>([]);
  const [stagedInstruction, setStagedInstruction] = useState<string>("");
  const [stagedError, setStagedError] = useState<string>("");
  const [isSavingStaged, setIsSavingStaged] = useState<boolean>(false);

  // Tab navigation state for left reading column
  const [activeTab, setActiveTab] = useState<"article" | "intel" | "books" | "research">("article");
  const [intelligence, setIntelligence] = useState<AiIntelligence | null>(null);
  const [loadingIntel, setLoadingIntel] = useState<boolean>(false);
  const [intelError, setIntelError] = useState<string | null>(null);
  const [booksData, setBooksData] = useState<BooksSuggestionData | null>(null);
  const [loadingBooks, setLoadingBooks] = useState<boolean>(false);
  const [booksError, setBooksError] = useState<string | null>(null);
  const [researchData, setResearchData] = useState<ResearchSuggestionData | null>(null);
  const [loadingResearch, setLoadingResearch] = useState<boolean>(false);
  const [researchError, setResearchError] = useState<string | null>(null);
  const articleTabRef = useRef<HTMLButtonElement>(null);
  const intelTabRef = useRef<HTMLButtonElement>(null);
  const booksTabRef = useRef<HTMLButtonElement>(null);
  const researchTabRef = useRef<HTMLButtonElement>(null);
  const intelRequested = useRef<boolean>(false);
  const booksRequested = useRef<boolean>(false);
  const researchRequested = useRef<boolean>(false);

  useEffect(() => {
    const handleStageEvent = (e: Event) => {
      const customEvent = e as CustomEvent<{
        stagedArticle: Article;
        dirtyIndices: number[];
        instruction: string;
      }>;
      if (customEvent.detail?.stagedArticle) {
        // Defense-in-depth: ignore events not targeting this mounted story
        if (customEvent.detail.stagedArticle.slug && customEvent.detail.stagedArticle.slug !== slug) {
          return;
        }
        setStagedArticle(customEvent.detail.stagedArticle);
        setStagedDirtyIndices(customEvent.detail.dirtyIndices || []);
        setStagedInstruction(customEvent.detail.instruction || "");
        setStagedError("");
      }
    };

    window.addEventListener("kalidass:stage-enhancement", handleStageEvent);
    return () => {
      window.removeEventListener("kalidass:stage-enhancement", handleStageEvent);
    };
  }, [slug]);

  useEffect(() => {
    if (!slug) return;
    setStagedArticle(null);
    setStagedDirtyIndices([]);
    setStagedInstruction("");
    setStagedError("");
    if (typeof window !== "undefined") {
      window.dispatchEvent(new Event("kalidass:stage-clear"));
    }
    getArticle(slug)
      .then((art) => {
        setArticle(art);
        if (art.evaluation) {
          setEvalResult(art.evaluation);
        }
      })
      .catch((err: Error) => setError(err.message));
  }, [slug]);

  const handleRunAudit = async () => {
    if (!article || evaluating) return;
    setEvaluating(true);
    setEvalError("");
    try {
      const res = await evaluateQuality({
        title: article.title,
        subtitle: article.subtitle,
        excerpt: article.excerpt,
        blocks: article.blocks,
        slug: article.slug,
      });
      setEvalResult(res);
    } catch (err: any) {
      setEvalError(err?.message || "Audit failed");
    } finally {
      setEvaluating(false);
    }
  };

  const headingsAnalysis = useMemo(() => {
    if (!article?.blocks) {
      return {headings: [] as HeadingItem[], totalWords: 0, blockCounts: {p: 0, h: 0, q: 0, img: 0, vid: 0, code: 0}};
    }

    const headings: HeadingItem[] = [];
    let currentHeading: HeadingItem | null = null;
    let totalWords = 0;
    const blockCounts = {p: 0, h: 0, q: 0, img: 0, vid: 0, code: 0};

    article.blocks.forEach((block, index) => {
      const text =
        block.type === "quote" || block.type === "paragraph" || block.type === "heading" || block.type === "code"
          ? block.text || ""
          : block.caption || "";
      const words = text.trim() ? text.trim().split(/\s+/).length : 0;
      totalWords += words;

      if (block.type === "heading") {
        blockCounts.h += 1;
        const id = headingSlug(block.text, index);
        currentHeading = {id, text: block.text, wordCount: 0};
        headings.push(currentHeading);
      } else if (block.type === "paragraph") {
        blockCounts.p += 1;
        if (currentHeading) currentHeading.wordCount += words;
      } else if (block.type === "quote") {
        blockCounts.q += 1;
        if (currentHeading) currentHeading.wordCount += words;
      } else if (block.type === "code") {
        blockCounts.code += 1;
        if (currentHeading) currentHeading.wordCount += words;
      } else if (block.type === "image") {
        blockCounts.img += 1;
      } else if (block.type === "video") {
        blockCounts.vid += 1;
      }
    });

    return {headings, totalWords, blockCounts};
  }, [article]);

  // Track active heading with IntersectionObserver
  useEffect(() => {
    if (!headingsAnalysis.headings.length || typeof window === "undefined") return;

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            setActiveHeadingId(entry.target.id);
          }
        });
      },
      {rootMargin: "0px 0px -65% 0px", threshold: 0.1}
    );

    headingsAnalysis.headings.forEach((h) => {
      const el = document.getElementById(h.id);
      if (el) observer.observe(el);
    });

    return () => observer.disconnect();
  }, [headingsAnalysis]);

  if (error) {
    return (
      <Layout title="Missing story">
        <main className={styles.page}>
          <p>{error}</p>
          <Link to="/magazine">Back to issue</Link>
        </main>
      </Layout>
    );
  }

  if (!article) {
    return (
      <Layout title="Loading">
        <main className={styles.page}>
          <div className={styles.loadingContainer}>
            <p>Setting type...</p>
          </div>
        </main>
      </Layout>
    );
  }

  const storyAccent = article.accent || "var(--chroma-neel)";
  const userEmail = (user?.email || "").toLowerCase().trim();
  const authorEmail = (article.authorEmail || "").toLowerCase().trim();
  const canEdit = Boolean(
    isAuthenticated && (isAdmin || (authorEmail && userEmail === authorEmail))
  );

  const scrollToHeading = (id: string) => {
    const el = document.getElementById(id);
    if (el) {
      el.scrollIntoView({behavior: "smooth", block: "start"});
      setActiveHeadingId(id);
    }
  };

  const handleFetchIntelligence = async (forceRefresh: boolean = false) => {
    if (!slug) return;
    setLoadingIntel(true);
    setIntelError(null);
    try {
      const full = await getArticle(slug, true, forceRefresh);
      if (full.ai_intelligence) {
        setIntelligence(full.ai_intelligence);
        setArticle((prev) => (prev ? {...prev, ai_intelligence: full.ai_intelligence} : null));
      } else {
        setIntelError("No intelligence dossier returned.");
      }
    } catch (err) {
      setIntelError(err instanceof Error ? err.message : "Failed to fetch intelligence.");
    } finally {
      setLoadingIntel(false);
    }
  };

  // Lazy public fetch: the dossier loads once, on first AI Intel tab activation.
  const loadIntelligenceOnce = () => {
    if (intelRequested.current || !slug) return;
    intelRequested.current = true;
    setLoadingIntel(true);
    getArticleIntelligence(slug)
      .then((intel) => {
        setIntelligence(intel);
        setArticle((prev) => (prev ? {...prev, ai_intelligence: intel} : null));
      })
      // 404 simply means no dossier is compiled; readers see the Unfetched notice.
      .catch(() => undefined)
      .finally(() => setLoadingIntel(false));
  };

  const handleFetchBooks = async () => {
    if (!slug) return;
    setLoadingBooks(true);
    setBooksError(null);
    try {
      const data = await triggerArticleBooks(slug);
      setBooksData(data);
      setArticle((prev) => (prev ? {...prev, books_suggestions: data, has_books: true} : null));
    } catch (err) {
      setBooksError(err instanceof Error ? err.message : "Failed to fetch book suggestions.");
    } finally {
      setLoadingBooks(false);
    }
  };

  // Lazy public fetch: books load once, on first Books suggestion tab activation.
  const loadBooksOnce = () => {
    if (booksRequested.current || !slug) return;
    booksRequested.current = true;
    setLoadingBooks(true);
    getArticleBooks(slug)
      .then((data) => {
        setBooksData(data);
        setArticle((prev) => (prev ? {...prev, books_suggestions: data, has_books: true} : null));
      })
      .catch(() => undefined)
      .finally(() => setLoadingBooks(false));
  };

  const handleFetchResearch = async () => {
    if (!slug) return;
    setLoadingResearch(true);
    setResearchError(null);
    try {
      const data = await triggerArticleResearch(slug);
      setResearchData(data);
      setArticle((prev) => (prev ? {...prev, research_suggestions: data, has_research: true} : null));
    } catch (err) {
      setResearchError(err instanceof Error ? err.message : "Failed to fetch research papers.");
    } finally {
      setLoadingResearch(false);
    }
  };

  // Lazy public fetch: research papers load once, on first Research tab activation.
  const loadResearchOnce = () => {
    if (researchRequested.current || !slug) return;
    researchRequested.current = true;
    setLoadingResearch(true);
    getArticleResearch(slug)
      .then((data) => {
        setResearchData(data);
        setArticle((prev) => (prev ? {...prev, research_suggestions: data, has_research: true} : null));
      })
      .catch(() => undefined)
      .finally(() => setLoadingResearch(false));
  };

  const tabsList: Array<"article" | "intel" | "books" | "research"> = ["article", "intel", "books", "research"];

  const switchTab = (tab: "article" | "intel" | "books" | "research") => {
    setActiveTab(tab);
    if (tab === "intel") {
      loadIntelligenceOnce();
    } else if (tab === "books") {
      loadBooksOnce();
    } else if (tab === "research") {
      loadResearchOnce();
    }
    const targetRef =
      tab === "article"
        ? articleTabRef
        : tab === "intel"
        ? intelTabRef
        : tab === "books"
        ? booksTabRef
        : researchTabRef;
    targetRef.current?.focus();
  };

  const handleTabKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const currentIndex = tabsList.indexOf(activeTab);
    if (event.key === "ArrowRight") {
      event.preventDefault();
      const nextIndex = (currentIndex + 1) % tabsList.length;
      switchTab(tabsList[nextIndex]);
    } else if (event.key === "ArrowLeft") {
      event.preventDefault();
      const prevIndex = (currentIndex - 1 + tabsList.length) % tabsList.length;
      switchTab(tabsList[prevIndex]);
    }
  };

  const handleSaveStaged = async () => {
    if (!stagedArticle || isSavingStaged) return;
    setIsSavingStaged(true);
    setStagedError("");
    try {
      const updated = await updateArticle(
        stagedArticle.id,
        {
          title: stagedArticle.title,
          subtitle: stagedArticle.subtitle,
          excerpt: stagedArticle.excerpt,
          coverImage: stagedArticle.coverImage,
          videoUrl: stagedArticle.videoUrl,
          author: stagedArticle.author,
          authorEmail: stagedArticle.authorEmail,
          tags: stagedArticle.tags,
          accent: stagedArticle.accent,
          published: stagedArticle.published,
          private: stagedArticle.private,
          featured: stagedArticle.featured,
          slug: stagedArticle.slug,
          blocks: stagedArticle.blocks,
        },
        {invalidateFeed: false}
      );
      // PUT responses don't carry has_intelligence; preserve the flag so the AI Intel badge survives staged saves
      setArticle({...updated, has_intelligence: updated.has_intelligence ?? article.has_intelligence});
      setStagedArticle(null);
      setStagedDirtyIndices([]);
      setStagedInstruction("");
      setStagedError("");
      if (typeof window !== "undefined") {
        window.dispatchEvent(new Event("kalidass:stage-clear"));
      }
    } catch (err) {
      setStagedError(`Failed to save: ${err instanceof Error ? err.message : "unknown error"}`);
    } finally {
      setIsSavingStaged(false);
    }
  };

  const handleDiscardStaged = () => {
    setStagedArticle(null);
    setStagedDirtyIndices([]);
    setStagedInstruction("");
    setStagedError("");
    if (typeof window !== "undefined") {
      window.dispatchEvent(new Event("kalidass:stage-clear"));
    }
  };

  // Blocks-only staging: the body/Layout read the staged article while the hero
  // (cover, kicker, byline) intentionally renders the saved one — enhancements
  // never target hero fields today.
  const displayedArticle = stagedArticle || article;

  return (
    <Layout title={displayedArticle.title} description={displayedArticle.excerpt}>
      <main
        className={styles.page}
        style={{"--story-accent": storyAccent} as CSSProperties}>
        {stagedArticle ? (
          <div className={styles.previewBar}>
            <div className={styles.previewInfo}>
              <span className={styles.previewBadge}>Staged Preview</span>
              <span className={styles.previewDetails}>
                {stagedInstruction || "AI Content Enhancement"} (
                {stagedDirtyIndices.length} block{stagedDirtyIndices.length === 1 ? "" : "s"} modified)
              </span>
              {stagedError ? (
                <span className={styles.stagedError} role="alert">
                  {stagedError}
                </span>
              ) : null}
            </div>
            <div className={styles.previewActions}>
              <button
                type="button"
                className={styles.saveBtn}
                disabled={isSavingStaged}
                onClick={handleSaveStaged}
              >
                {isSavingStaged ? "Saving..." : "Save Changes"}
              </button>
              <button
                type="button"
                className={styles.discardBtn}
                disabled={isSavingStaged}
                onClick={handleDiscardStaged}
              >
                Discard
              </button>
            </div>
          </div>
        ) : null}
        <div className={styles.hero}>
          {article.coverImage ? (
            <img className={styles.cover} src={article.coverImage} alt="" />
          ) : null}
          <div className={styles.veil} />
          <div className={styles.heroInner}>
            <div className={styles.heroCopy}>
              <p className={styles.kicker}>
                {(article.tags || []).join(" · ") || "Essay"}
              </p>
              <h1>{article.title}</h1>
              {article.subtitle ? <p className={styles.sub}>{article.subtitle}</p> : null}
              <div className={styles.byline}>
                {article.author?.avatar ? (
                  <img src={article.author.avatar} alt="" />
                ) : (
                  <span className={styles.initial}>
                    {(article.author?.name || "K").slice(0, 1)}
                  </span>
                )}
                <div>
                  <strong>{article.author?.name || "Kalidass Author"}</strong>
                  <span>
                    {article.author?.role || "Research Note"} · {formatDate(article.publishedAt)} ·{" "}
                    {article.readTime} min
                    {article.aiGenerated ? (
                      <>
                        {" · "}
                        <span className={styles.aiTag}>AI</span>
                      </>
                    ) : null}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className={styles.layoutWrap}>
          <div className={styles.layout}>
            {/* Left 80% Main Reading Pane with 2 Tabs */}
            <article className={styles.article}>
              {/* Tab Navigation: Article (Default) vs AI Intel */}
              <div className={styles.tabBar} role="tablist" aria-label="Article views" onKeyDown={handleTabKeyDown}>
                <button
                  ref={articleTabRef}
                  type="button"
                  role="tab"
                  id="story-tab-article"
                  aria-controls="story-panel-article"
                  aria-selected={activeTab === "article"}
                  tabIndex={activeTab === "article" ? 0 : -1}
                  className={`${styles.tabBtn} ${activeTab === "article" ? styles.tabBtnActive : ""}`}
                  onClick={() => switchTab("article")}
                >
                  Article
                </button>
                <button
                  ref={intelTabRef}
                  type="button"
                  role="tab"
                  id="story-tab-intel"
                  aria-controls="story-panel-intel"
                  aria-selected={activeTab === "intel"}
                  tabIndex={activeTab === "intel" ? 0 : -1}
                  className={`${styles.tabBtn} ${activeTab === "intel" ? styles.tabBtnActive : ""}`}
                  onClick={() => switchTab("intel")}
                >
                  AI Intel
                  {(intelligence || article.has_intelligence) && (
                    <span className={styles.tabBadge} title="Intelligence dossier available">
                      ✓
                    </span>
                  )}
                </button>
                <button
                  ref={booksTabRef}
                  type="button"
                  role="tab"
                  id="story-tab-books"
                  aria-controls="story-panel-books"
                  aria-selected={activeTab === "books"}
                  tabIndex={activeTab === "books" ? 0 : -1}
                  className={`${styles.tabBtn} ${activeTab === "books" ? styles.tabBtnActive : ""}`}
                  onClick={() => switchTab("books")}
                >
                  Books suggestion
                  {(booksData || article.has_books) && (
                    <span className={styles.tabBadge} title="Book suggestions available">
                      ✓
                    </span>
                  )}
                </button>
                <button
                  ref={researchTabRef}
                  type="button"
                  role="tab"
                  id="story-tab-research"
                  aria-controls="story-panel-research"
                  aria-selected={activeTab === "research"}
                  tabIndex={activeTab === "research" ? 0 : -1}
                  className={`${styles.tabBtn} ${activeTab === "research" ? styles.tabBtnActive : ""}`}
                  onClick={() => switchTab("research")}
                >
                  Research
                  {(researchData || article.has_research) && (
                    <span className={styles.tabBadge} title="Research papers available">
                      ✓
                    </span>
                  )}
                </button>
              </div>

              {activeTab === "article" ? (
                <div role="tabpanel" id="story-panel-article" aria-labelledby="story-tab-article">
                  {article.aiGenerated ? (
                    <div className={styles.aiBanner} role="note">
                      <span className={styles.aiBannerIcon}>AI</span>
                      Ai generated content, verify before applying in real life
                    </div>
                  ) : null}
                  <p className={styles.deck}>{article.excerpt}</p>
                  {article.videoUrl ? (
                    <VideoEmbed url={article.videoUrl} title={article.title} />
                  ) : null}
                  <StoryBody article={displayedArticle} dirtyIndices={stagedDirtyIndices} />
                  {article.aiGenerated ? (
                    <div className={`${styles.aiBanner} ${styles.aiBannerBottom}`} role="note">
                      <span className={styles.aiBannerIcon}>AI</span>
                      Ai generated content, verify before applying in real life
                    </div>
                  ) : null}
                </div>
              ) : activeTab === "intel" ? (
                <div
                  className={styles.intelTabWrap}
                  role="tabpanel"
                  id="story-panel-intel"
                  aria-labelledby="story-tab-intel"
                >
                  <IntelligencePanel
                    intelligence={intelligence || article.ai_intelligence || null}
                    onFetch={canEdit ? handleFetchIntelligence : undefined}
                    loading={loadingIntel}
                    error={intelError}
                    readOnly={!canEdit}
                  />
                </div>
              ) : activeTab === "books" ? (
                <div
                  className={styles.intelTabWrap}
                  role="tabpanel"
                  id="story-panel-books"
                  aria-labelledby="story-tab-books"
                >
                  <BooksPanel
                    booksData={booksData || article.books_suggestions || null}
                    loading={loadingBooks}
                    error={booksError}
                    readOnly={true}
                  />
                </div>
              ) : (
                <div
                  className={styles.intelTabWrap}
                  role="tabpanel"
                  id="story-panel-research"
                  aria-labelledby="story-tab-research"
                >
                  <ResearchPanel
                    researchData={researchData || article.research_suggestions || null}
                    onFetch={canEdit ? handleFetchResearch : undefined}
                    loading={loadingResearch}
                    error={researchError}
                    readOnly={!canEdit}
                  />
                </div>
              )}

              <div className={styles.footer}>
                <Link to="/magazine" className={styles.footerLink}>
                  ← All briefs
                </Link>
                {canEdit ? (
                  <Link to={`/admin?edit=${article.slug}`} className={styles.footerLink}>
                    Edit in studio →
                  </Link>
                ) : null}
              </div>
            </article>

            {/* Right 20% Heading Analysis & Heuristics Panel */}
            <aside className={styles.sidebar}>
              <div className={styles.analysisCard}>
                <div className={styles.auditCard}>
                  <div className={styles.analysisHeader}>
                    <span className={styles.analysisKicker}>Article Heuristics</span>
                    <h3>Quality & Safety Audit</h3>
                  </div>

                  {evalResult ? (
                    <div className={styles.auditResults}>
                      <div
                        className={`${styles.safetyBadge} ${
                          evalResult.safety.verdict === "safe"
                            ? styles.safetySafe
                            : styles.safetyFlagged
                        }`}>
                        <span>
                          {evalResult.safety.verdict === "safe"
                            ? "✓ Safety Verified"
                            : "⚠ Content Flagged"}
                        </span>
                        {evalResult.safety.violations.length > 0 ? (
                          <small className={styles.violationText}>
                            {evalResult.safety.violations.join(", ")}
                          </small>
                        ) : null}
                      </div>

                      <div className={styles.auditGrid}>
                        <div className={styles.auditItem}>
                          <span className={styles.auditItemLabel}>AI Detection</span>
                          <strong className={styles.auditItemVal}>
                            {Math.round(evalResult.metrics.isAiWritten.probability * 100)}%
                          </strong>
                          <span className={styles.auditSub}>{evalResult.metrics.isAiWritten.label}</span>
                        </div>
                        <div className={styles.auditItem}>
                          <span className={styles.auditItemLabel}>Technical Rigor</span>
                          <strong className={styles.auditItemVal}>
                            {evalResult.metrics.accuracy.score.toFixed(1)}/5
                          </strong>
                          <span className={styles.auditSub}>{evalResult.metrics.accuracy.level}</span>
                        </div>
                        <div className={styles.auditItem}>
                          <span className={styles.auditItemLabel}>Engagement</span>
                          <strong className={styles.auditItemVal}>
                            {evalResult.metrics.engagement.score.toFixed(1)}/5
                          </strong>
                          <span className={styles.auditSub}>{evalResult.metrics.engagement.level}</span>
                        </div>
                      </div>

                      {evalResult.summary ? (
                        <p className={styles.evalSummaryText}>{evalResult.summary}</p>
                      ) : null}

                      {evalResult.judging_model ? (
                        <div className={styles.judgingModelRow}>
                          <span className={styles.judgingModelLabel}>
                            Evaluated by: {evalResult.judging_model}
                          </span>
                        </div>
                      ) : null}
                    </div>
                  ) : isAuthenticated ? (
                    <button
                      type="button"
                      className={styles.auditBtn}
                      disabled={evaluating}
                      onClick={handleRunAudit}>
                      {evaluating ? "Evaluating heuristics..." : "⚡ Run Quality Audit"}
                    </button>
                  ) : (
                    <p className={styles.auditSub}>Sign in to run a live quality audit.</p>
                  )}
                  {evalError ? <p className={styles.evalError}>{evalError}</p> : null}
                </div>

                <div className={styles.structureSection}>
                  <div className={styles.analysisHeader}>
                    <span className={styles.analysisKicker}>Heading Analysis</span>
                    <h3>Structure & Outline</h3>
                  </div>

                  <div className={styles.metricsGrid}>
                    <div className={styles.metric}>
                      <span className={styles.metricVal}>{headingsAnalysis.headings.length}</span>
                      <span className={styles.metricLabel}>Sections</span>
                    </div>
                    <div className={styles.metric}>
                      <span className={styles.metricVal}>{headingsAnalysis.totalWords}</span>
                      <span className={styles.metricLabel}>Words</span>
                    </div>
                    <div className={styles.metric}>
                      <span className={styles.metricVal}>{article.readTime}m</span>
                      <span className={styles.metricLabel}>Pace</span>
                    </div>
                  </div>

                  {headingsAnalysis.headings.length > 0 ? (
                    <div className={styles.tocSection}>
                      <p className={styles.tocTitle}>Document Flow</p>
                      <nav className={styles.tocNav}>
                        {headingsAnalysis.headings.map((h, i) => (
                          <button
                            key={h.id}
                            type="button"
                            onClick={() => scrollToHeading(h.id)}
                            className={`${styles.tocItem} ${
                              activeHeadingId === h.id ? styles.tocItemActive : ""
                            }`}>
                            <span className={styles.tocNum}>0{i + 1}</span>
                            <span className={styles.tocText}>{h.text}</span>
                            {h.wordCount > 0 ? (
                              <span className={styles.tocWords}>{h.wordCount}w</span>
                            ) : null}
                          </button>
                        ))}
                      </nav>
                    </div>
                  ) : (
                    <p className={styles.noHeadings}>Single continuous dispatch</p>
                  )}

                  <div className={styles.distribution}>
                    <p className={styles.tocTitle}>Element Density</p>
                    <div className={styles.tagsList}>
                      <span>{headingsAnalysis.blockCounts.p} paragraphs</span>
                      {headingsAnalysis.blockCounts.q > 0 ? (
                        <span>{headingsAnalysis.blockCounts.q} quotes</span>
                      ) : null}
                      {headingsAnalysis.blockCounts.img > 0 ? (
                        <span>{headingsAnalysis.blockCounts.img} images</span>
                      ) : null}
                      {headingsAnalysis.blockCounts.vid > 0 ? (
                        <span>{headingsAnalysis.blockCounts.vid} video</span>
                      ) : null}
                      {headingsAnalysis.blockCounts.code > 0 ? (
                        <span>{headingsAnalysis.blockCounts.code} code</span>
                      ) : null}
                    </div>
                  </div>
                </div>

                <button
                  type="button"
                  className={styles.scrollTopBtn}
                  onClick={() => window.scrollTo({top: 0, behavior: "smooth"})}>
                  ↑ Back to masthead
                </button>
              </div>
            </aside>
          </div>
        </div>
      </main>
    </Layout>
  );
}
