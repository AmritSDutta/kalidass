import {useState, useEffect, type CSSProperties, type ReactNode} from "react";
import Layout from "@theme/Layout";
import Link from "@docusaurus/Link";
import StoryBody from "@site/src/components/StoryBody";
import {generateArticle, updateArticle, getAiSearchInsight} from "@site/src/lib/api";
import {useAuth} from "@site/src/lib/auth";
import type {Article, GenerateArticleRequest, QualityEvalResult, AiSearchInsightResponse} from "@site/src/lib/types";
import styles from "./generate_article.module.css";

const ACCENTS = ["#6366f1", "#f97316", "#06b6d4", "#10b981", "#f43f5e", "#eab308"];

const TONES: {key: "research" | "field-notes" | "explainer" | "speculative"; label: string}[] = [
  {key: "research", label: "Systems Research"},
  {key: "field-notes", label: "Field Notes"},
  {key: "explainer", label: "Deep Explainer"},
  {key: "speculative", label: "Speculative Horizons"},
];

const BLOCK_COUNTS = [6, 8, 12, 16];

export default function GenerateArticlePage(): ReactNode {
  const {user, isAuthenticated, isAdmin, isLoading, unlockWithAdminToken} =
    useAuth();

  const [passwordInput, setPasswordInput] = useState("");
  const [authError, setAuthError] = useState("");
  const [authBusy, setAuthBusy] = useState(false);

  // Form State
  const [topic, setTopic] = useState("");
  const [angle, setAngle] = useState("");
  const [tone, setTone] = useState<"research" | "field-notes" | "explainer" | "speculative">("research");
  const [blockCount, setBlockCount] = useState<number>(8);
  const [accent, setAccent] = useState<string>("#6366f1");
  const [runtime, setRuntime] = useState<"python" | "node">("python");

  // AI Search Insight State
  const [insightLoading, setInsightLoading] = useState(false);
  const [insightData, setInsightData] = useState<AiSearchInsightResponse | null>(null);
  const [insightError, setInsightError] = useState<string>("");
  const [showInsight, setShowInsight] = useState(false);

  // Current Date Display
  const [currentDateStr, setCurrentDateStr] = useState<string>("");
  useEffect(() => {
    setCurrentDateStr(
      new Date().toLocaleDateString("en-US", {
        weekday: "long",
        year: "numeric",
        month: "long",
        day: "numeric",
      })
    );
  }, []);

  // Execution State
  const [busy, setBusy] = useState(false);
  const [currentStep, setCurrentStep] = useState<number>(0);
  const [statusMessage, setStatusMessage] = useState<string>("");
  const [errorMessage, setErrorMessage] = useState<string>("");

  // Result State
  const [generatedArticle, setGeneratedArticle] = useState<Article | null>(null);
  const [evalResult, setEvalResult] = useState<QualityEvalResult | null>(null);
  const [publishStatus, setPublishStatus] = useState<string>("");


  const handleAdminUnlock = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!passwordInput.trim()) return;
    setAuthBusy(true);
    setAuthError("");
    try {
      const ok = await unlockWithAdminToken(passwordInput);
      if (!ok) setAuthError("Invalid super-admin token.");
    } catch (err: any) {
      setAuthError(err.message || "Failed to authenticate.");
    } finally {
      setAuthBusy(false);
    }
  };

  const handleInspectInsight = async () => {
    if (!topic.trim() || insightLoading) return;
    setInsightLoading(true);
    setInsightError("");
    setShowInsight(true);
    try {
      const data = await getAiSearchInsight(topic.trim());
      setInsightData(data);
    } catch (err: any) {
      setInsightError(err.message || "Failed to fetch AI Search Insight.");
    } finally {
      setInsightLoading(false);
    }
  };

  const handleGenerate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!topic.trim() || busy) return;

    setBusy(true);
    setErrorMessage("");
    setStatusMessage("");
    setPublishStatus("");
    setGeneratedArticle(null);
    setEvalResult(null);

    try {
      setCurrentStep(1);
      setStatusMessage(`Provisioning isolated Upstash Box (${runtime === "python" ? "Python" : "Node"}) cloud sandbox with attachHeaders...`);

      const payload: GenerateArticleRequest = {
        topic: topic.trim(),
        angle: angle.trim() || undefined,
        tone,
        blockCount,
        accent,
        provider: "upstash-box",
        harness: "custom",
        runtime,
      };

      setCurrentStep(2);
      setStatusMessage("Executing custom in-box agent: hybrid search (Tavily/SerpApi), Gemini/Ollama LLM synthesis, & gpt-image-1 technical infographic cover...");

      const res = await generateArticle(payload);

      setCurrentStep(3);
      setStatusMessage("Parsing polymorphic block schema & running quality/safety audit...");

      if (res?.article) {
        setGeneratedArticle(res.article);
        setEvalResult(res.evaluation || null);
        setCurrentStep(4);
        setStatusMessage("Article successfully generated and saved as unlisted draft in Upstash Blob!");
      } else {
        throw new Error("Invalid response received from generator.");
      }
    } catch (err: any) {
      setErrorMessage(err.message || "Article generation failed.");
      setCurrentStep(0);
    } finally {
      setBusy(false);
    }
  };

  const handlePublishNow = async () => {
    if (!generatedArticle) return;
    setBusy(true);
    setPublishStatus("");
    try {
      await updateArticle(generatedArticle.id, {
        ...generatedArticle,
        published: true,
        private: false,
      });
      setPublishStatus("Article successfully published to public issue index!");
      setGeneratedArticle((prev) => (prev ? {...prev, published: true, private: false} : null));
    } catch (err: any) {
      setErrorMessage(err.message || "Failed to publish article.");
    } finally {
      setBusy(false);
    }
  };

  if (isLoading) {
    return (
      <Layout title="AI Article Generator — Kalidass Journal">
        <main className={styles.page}>
          <p>Verifying admin permissions...</p>
        </main>
      </Layout>
    );
  }

  // Admin Auth Gate
  if (!isAuthenticated || !isAdmin) {
    return (
      <Layout title="Admin Unlock — Kalidass Journal">
        <main className={styles.page}>
          <div className={styles.lockCard}>
            <h2>Studio Admin Unlock</h2>
            <p>
              Autonomous article generation with Upstash Box is restricted to authorized Kalidass
              super-administrators.
            </p>
            {authError && <div className={`${styles.alert} ${styles.alertError}`}>{authError}</div>}
            <form onSubmit={handleAdminUnlock} className={styles.lockForm}>
              <input
                type="password"
                className={styles.input}
                placeholder="Enter Super-Admin Token..."
                value={passwordInput}
                onChange={(e) => setPasswordInput(e.target.value)}
                disabled={authBusy}
                autoFocus
              />
              <button type="submit" className={styles.primary} disabled={authBusy || !passwordInput.trim()}>
                {authBusy ? "Verifying..." : "Unlock Generator"}
              </button>
            </form>
          </div>
        </main>
      </Layout>
    );
  }

  return (
    <Layout
      title="Neural AI Article Generator — Kalidass Journal"
      description="Autonomous containerized systems research article generator powered by Upstash Box.">
      <main className={styles.page}>
        <div className={styles.top}>
          <div>
            <div className={styles.topKicker}>Neural Publisher // Upstash Box Engine</div>
            <h1>AI Article Generator</h1>
          </div>
          <div className={styles.topActions}>
            <Link to="/admin" className={styles.ghost}>
              Open Studio CMS
            </Link>
            <Link to="/magazine" className={styles.ghost}>
              Browse Issue
            </Link>
          </div>
        </div>

        {errorMessage && <div className={`${styles.alert} ${styles.alertError}`}>{errorMessage}</div>}
        {statusMessage && <div className={`${styles.alert} ${styles.alertSuccess}`}>{statusMessage}</div>}
        {publishStatus && <div className={`${styles.alert} ${styles.alertSuccess}`}>{publishStatus}</div>}

        <div className={styles.generatorGrid}>
          {/* Generation Form */}
          <div className={styles.card}>
            <div className={styles.cardHead}>
              <h2>Research Prompt & Invariants</h2>
            </div>
            <form onSubmit={handleGenerate}>
              <div className={styles.formGroup}>
                <label>Research Topic / Headline</label>
                <input
                  type="text"
                  className={styles.input}
                  placeholder="e.g., Latent State Synchronization in Hybrid Transformer-Mamba Topologies"
                  value={topic}
                  onChange={(e) => setTopic(e.target.value)}
                  disabled={busy}
                  required
                />
                <div style={{display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "0.5rem", marginTop: "0.4rem"}}>
                  <div className={styles.formHelp}>The core technical subject or empirical benchmark.</div>
                  {currentDateStr && (
                    <div className={styles.dateBadge}>
                      <span>📅 Current Date:</span>
                      <strong>{currentDateStr}</strong>
                    </div>
                  )}
                </div>

                <div style={{marginTop: "0.6rem"}}>
                  <button
                    type="button"
                    className={styles.ghost}
                    onClick={handleInspectInsight}
                    disabled={insightLoading || !topic.trim()}
                    style={{fontSize: "0.82rem", padding: "0.4rem 0.8rem"}}>
                    {insightLoading ? (
                      <>
                        <span className={styles.spinner} style={{width: 12, height: 12}} />
                        <span>Querying SerpApi SGE Insight...</span>
                      </>
                    ) : (
                      "🔍 Inspect AI Search Insight (Google SGE)"
                    )}
                  </button>
                </div>

                {showInsight && (
                  <div className={styles.insightSection}>
                    <div className={styles.insightHead}>
                      <h3>
                        <span>✨ Google SGE AI Overview & Search Insight</span>
                      </h3>
                      <button
                        type="button"
                        className={styles.ghost}
                        onClick={() => setShowInsight(false)}
                        style={{fontSize: "0.75rem", padding: "0.2rem 0.5rem"}}>
                        Dismiss
                      </button>
                    </div>

                    {insightError && (
                      <div className={`${styles.alert} ${styles.alertError}`} style={{margin: "0.5rem 0", padding: "0.6rem"}}>
                        {insightError}
                      </div>
                    )}

                    {insightData?.ai_overview ? (
                      <div className={styles.insightOverview}>
                        <div style={{fontSize: "0.76rem", fontWeight: 700, color: "var(--chroma-cyan, #06b6d4)", marginBottom: "0.4rem", textTransform: "uppercase"}}>
                          Google AI Overview (SGE)
                        </div>
                        <p style={{margin: 0, whiteSpace: "pre-wrap"}}>
                          {typeof insightData.ai_overview === "string"
                            ? insightData.ai_overview
                            : (insightData.ai_overview as any)?.text || JSON.stringify(insightData.ai_overview, null, 2)}
                        </p>
                      </div>
                    ) : (
                      !insightLoading && insightData && (
                        <div style={{fontSize: "0.82rem", color: "var(--ink-muted)", marginBottom: "0.8rem"}}>
                          No AI Overview returned for this query. Organic search citations shown below:
                        </div>
                      )
                    )}

                    {insightData?.organic_results && insightData.organic_results.length > 0 && (
                      <div>
                        <div style={{fontSize: "0.76rem", fontWeight: 600, color: "var(--ink-secondary)", marginBottom: "0.4rem", textTransform: "uppercase"}}>
                          Top Search Citations ({insightData.organic_results.length})
                        </div>
                        <ul className={styles.insightCitations}>
                          {insightData.organic_results.slice(0, 5).map((r, i) => (
                            <li key={i} className={styles.insightCitationItem}>
                              <a href={r.link} target="_blank" rel="noreferrer" className={styles.insightCitationTitle}>
                                {r.title || r.link} ↗
                              </a>
                              {r.snippet && <div className={styles.insightCitationSnippet}>{r.snippet}</div>}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                )}
              </div>

              <div className={styles.formGroup}>
                <label>Execution Runtime Sandbox</label>
                <div className={styles.tonePicker}>
                  <button
                    type="button"
                    className={`${styles.choiceBtn} ${runtime === "python" ? styles.choiceBtnActive : ""}`}
                    onClick={() => setRuntime("python")}
                    disabled={busy}>
                    🐍 Python 3.11 Sandbox (Modular)
                  </button>
                  <button
                    type="button"
                    className={`${styles.choiceBtn} ${runtime === "node" ? styles.choiceBtnActive : ""}`}
                    onClick={() => setRuntime("node")}
                    disabled={busy}>
                    ⚡ Node.js 20 Sandbox (Modular)
                  </button>
                </div>
                <div className={styles.formHelp}>Select the execution runtime inside the isolated Upstash Box container.</div>
              </div>

              <div className={styles.formGroup}>
                <label>Thesis Angle / Architectural Focus</label>
                <textarea
                  className={`${styles.input} ${styles.textarea}`}
                  placeholder="e.g., Deep dive on memory bandwidth efficiency, KV-cache compression, and zero-trust isolation."
                  value={angle}
                  onChange={(e) => setAngle(e.target.value)}
                  disabled={busy}
                />
              </div>

              <div className={styles.formGroup}>
                <label>Editorial Tone</label>
                <div className={styles.tonePicker}>
                  {TONES.map((t) => (
                    <button
                      type="button"
                      key={t.key}
                      className={`${styles.choiceBtn} ${tone === t.key ? styles.choiceBtnActive : ""}`}
                      onClick={() => setTone(t.key)}
                      disabled={busy}>
                      {t.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className={styles.formGroup}>
                <label>Target Content Blocks</label>
                <div className={styles.blockPicker}>
                  {BLOCK_COUNTS.map((cnt) => (
                    <button
                      type="button"
                      key={cnt}
                      className={`${styles.choiceBtn} ${blockCount === cnt ? styles.choiceBtnActive : ""}`}
                      onClick={() => setBlockCount(cnt)}
                      disabled={busy}>
                      ~{cnt} Blocks
                    </button>
                  ))}
                </div>
              </div>

              <div className={styles.formGroup}>
                <label>Pigment Accent Tint</label>
                <div className={styles.swatches}>
                  {ACCENTS.map((hex) => (
                    <button
                      type="button"
                      key={hex}
                      className={`${styles.swatch} ${accent === hex ? styles.swatchActive : ""}`}
                      style={{backgroundColor: hex}}
                      onClick={() => setAccent(hex)}
                      disabled={busy}
                    />
                  ))}
                </div>
              </div>

              <button
                type="submit"
                className={styles.primary}
                disabled={busy || !topic.trim()}
                style={{width: "100%", justifyContent: "center", marginTop: "1rem"}}>
                {busy ? (
                  <>
                    <span className={styles.spinner} />
                    <span>Executing In-Box Agent ({runtime.toUpperCase()})...</span>
                  </>
                ) : (
                  `Generate with Upstash Box (${runtime === "python" ? "Python" : "Node"})`
                )}
              </button>
            </form>

            {/* Stepper indicator */}
            {busy && (
              <div className={styles.progressCard}>
                <div className={styles.progressTitle}>
                  <span className={styles.spinner} />
                  Container Lifecycle ({runtime.toUpperCase()})
                </div>
                <div className={styles.stepList}>
                  <div className={`${styles.stepItem} ${currentStep > 1 ? styles.stepDone : currentStep === 1 ? styles.stepActive : ""}`}>
                    {currentStep > 1 ? "✓" : "•"} 1. Upstash Box Provisioning ({runtime === "python" ? "Python 3.11" : "Node.js 20"} + attachHeaders)
                  </div>
                  <div className={`${styles.stepItem} ${currentStep > 2 ? styles.stepDone : currentStep === 2 ? styles.stepActive : ""}`}>
                    {currentStep > 2 ? "✓" : "•"} 2. Custom Agent Research (Tavily/SerpApi) & Gemini/Ollama & gpt-image-1 Infographic
                  </div>
                  <div className={`${styles.stepItem} ${currentStep > 3 ? styles.stepDone : currentStep === 3 ? styles.stepActive : ""}`}>
                    {currentStep > 3 ? "✓" : "•"} 3. Quality & Safety Screening (Soft-Pass)
                  </div>
                  <div className={`${styles.stepItem} ${currentStep >= 4 ? styles.stepDone : ""}`}>
                    {currentStep >= 4 ? "✓" : "•"} 4. Stored as Unlisted Draft in Upstash Blob
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Quick Info / Instructions Card */}
          <div className={styles.card}>
            <div className={styles.cardHead}>
              <h2>Container Engine Specs</h2>
            </div>
            <p style={{fontSize: "0.92rem", color: "var(--ink-secondary)", lineHeight: "1.6"}}>
              Each generation request dynamically spawns a secure, isolated <strong>Upstash Box</strong> container.
            </p>
            <ul style={{fontSize: "0.88rem", color: "var(--ink-secondary)", lineHeight: "1.7", paddingLeft: "1.2rem"}}>
              <li>
                <strong>Pluggable Runtime Sandbox:</strong> Runs isolated Python 3.11 or Node.js 20 scripts written directly to the in-container workspace.
              </li>
              <li>
                <strong>Hybrid Search Grounding:</strong> Dynamic weighted search (80% Tavily / 20% SerpApi) with Google SGE AI Overview and organic citations.
              </li>
              <li>
                <strong>Gemini & Ollama Synthesis:</strong> Structured polymorphic blocks generated with dynamic date anchoring and mandatory source attributions.
              </li>
              <li>
                <strong>gpt-image-1 Technical Infographics:</strong> Automated horizontal landscape (1536x1024 WebP) infographic banner with subtle "Kalidass" watermark and zero typography clutter.
              </li>
              <li>
                <strong>attachHeaders Outbound Auth:</strong> Hypervisor-level credential injection preventing ambient in-container token leakage.
              </li>
              <li>
                <strong>Automatic Unlisted Drafts:</strong> Saved directly to Upstash Blob storage under your verified administrator identity.
              </li>
              <li>
                <strong>Strict Container Teardown:</strong> Containers are automatically terminated and destroyed immediately upon completion.
              </li>
            </ul>
          </div>
        </div>

        {/* Results Panel */}
        {generatedArticle && (
          <div className={styles.resultCard}>
            <div className={styles.top}>
              <div>
                <div className={styles.topKicker} style={{color: generatedArticle.accent}}>
                  Unlisted Draft Created // Slug: {generatedArticle.slug}
                </div>
                <h1>{generatedArticle.title}</h1>
              </div>
              <div className={styles.topActions}>
                <Link to={`/admin?mode=compose&edit=${generatedArticle.slug}`} className={styles.primary}>
                  Open in Studio Editor →
                </Link>
                <Link to={`/story/${generatedArticle.slug}`} className={styles.ghost} target="_blank">
                  View Direct Draft Link ↗
                </Link>
                {!generatedArticle.published && (
                  <button type="button" onClick={handlePublishNow} className={styles.ghost} disabled={busy}>
                    Publish Live
                  </button>
                )}
              </div>
            </div>

            {generatedArticle.isFallback && (
              <div className={`${styles.alert} ${styles.alertError}`} style={{marginTop: "1rem", marginBottom: "1.5rem"}}>
                <strong>Notice:</strong> {generatedArticle.fallbackNotice || "Article was generated using the local systems fallback template. Configure ANTHROPIC_API_KEY or OPENAI_API_KEY via attachHeaders for live model synthesis."}
              </div>
            )}

            {/* Quality & Safety Scorecard */}
            {evalResult && (
              <div className={styles.metricsGrid}>
                <div className={styles.metricBox}>
                  <div className={styles.metricLabel}>Safety Verdict</div>
                  <div className={styles.metricValue} style={{color: evalResult.safety.verdict === "safe" ? "#10b981" : "#f43f5e"}}>
                    {evalResult.safety.verdict.toUpperCase()}
                  </div>
                </div>
                <div className={styles.metricBox}>
                  <div className={styles.metricLabel}>AI Detection Prob</div>
                  <div className={styles.metricValue}>
                    {Math.round(evalResult.metrics.isAiWritten.probability * 100)}%
                  </div>
                </div>
                <div className={styles.metricBox}>
                  <div className={styles.metricLabel}>Accuracy Score</div>
                  <div className={styles.metricValue}>
                    {Math.round(evalResult.metrics.accuracy.score * 100)} / 100
                  </div>
                </div>
                <div className={styles.metricBox}>
                  <div className={styles.metricLabel}>Editorial Readiness</div>
                  <div className={styles.metricValue} style={{fontSize: "1.1rem"}}>
                    {evalResult.metrics.editorialReadiness.choice}
                  </div>
                </div>
              </div>
            )}

            {/* Rendered Story Preview */}
            <div style={{marginTop: "2rem", borderTop: "1px solid var(--border-subtle)", paddingTop: "2rem"}}>
              <StoryBody article={generatedArticle} />
            </div>
          </div>
        )}
      </main>
    </Layout>
  );
}
