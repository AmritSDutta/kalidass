import {useEffect, useMemo, useState, type CSSProperties, type ReactNode} from "react";
import Layout from "@theme/Layout";
import Link from "@docusaurus/Link";
import {useLocation} from "@docusaurus/router";
import {
  createArticle,
  getArticle,
  listArticles,
  removeArticle,
  updateArticle,
  uploadObject,
} from "@site/src/lib/api";
import {useAuth} from "@site/src/lib/auth";
import {emptyDraft, formatDate} from "@site/src/lib/media";
import type {ArticleDraft, ArticleSummary, Block} from "@site/src/lib/types";
import styles from "./admin.module.css";

const ACCENTS = ["#6366f1", "#f97316", "#06b6d4", "#10b981", "#f43f5e", "#eab308"];

type BlockType = Block["type"];

type Mode = "compose" | "drafts" | "published" | "delete";

const MODES: {key: Mode; label: string; status: "draft" | "published" | "all" | undefined}[] = [
  {key: "compose", label: "Compose", status: undefined},
  {key: "drafts", label: "Drafts", status: "draft"},
  {key: "published", label: "Published", status: "published"},
  {key: "delete", label: "Delete", status: "all"},
];

function blockLabel(type: BlockType) {
  return type[0].toUpperCase() + type.slice(1);
}

function ensureBlockId(block: Block): Block {
  return block._id ? block : {...block, _id: crypto.randomUUID()};
}

function fromArticle(article: {
  title: string;
  subtitle: string;
  excerpt: string;
  coverImage: string;
  videoUrl: string;
  author: ArticleDraft["author"];
  authorEmail?: string;
  tags: string[];
  accent: string;
  featured: boolean;
  blocks: Block[];
  slug: string;
  published: boolean;
  private: boolean;
  aiGenerated: boolean;
  userId?: string;
}): ArticleDraft {
  return {
    title: article.title,
    subtitle: article.subtitle,
    excerpt: article.excerpt,
    coverImage: article.coverImage,
    videoUrl: article.videoUrl,
    author: article.author,
    authorEmail: article.authorEmail,
    tags: article.tags,
    accent: article.accent,
    featured: article.featured,
    blocks: article.blocks?.length
      ? article.blocks.map(ensureBlockId)
      : [{type: "paragraph", text: "", _id: crypto.randomUUID()}],
    slug: article.slug,
    published: article.published ?? true,
    private: article.private ?? true,
    aiGenerated: article.aiGenerated ?? false,
    userId: article.userId,
  };
}

function AdminInner(): ReactNode {
  const {
    user,
    isAuthenticated,
    isAdmin,
    isSuperuserEligible,
    isLoading,
    isAuth0Configured,
    loginWithAuth0,
    logout,
    elevateToSuperuser,
    dropSuperuser,
    unlockWithAdminToken,
  } = useAuth();

  const location = useLocation();
  const params = useMemo(() => new URLSearchParams(location.search), [location.search]);
  const editSlug = params.get("edit") || "";
  const modeParam = params.get("mode") || "compose";
  const initialMode = MODES.some((m) => m.key === modeParam) ? (modeParam as Mode) : "compose";

  const [mode, setMode] = useState<Mode>(initialMode);
  const [articles, setArticles] = useState<ArticleSummary[]>([]);
  const [draft, setDraft] = useState<ArticleDraft>(emptyDraft());
  const [editingId, setEditingId] = useState("");
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  const [tagInput, setTagInput] = useState("");
  const [query, setQuery] = useState("");
  const [passwordInput, setPasswordInput] = useState("");
  const [authError, setAuthError] = useState("");
  const [showAdminTokenInput, setShowAdminTokenInput] = useState(false);
  const [showElevationModal, setShowElevationModal] = useState(false);
  const [elevationInput, setElevationInput] = useState("");
  const [elevationError, setElevationError] = useState("");
  const [elevationBusy, setElevationBusy] = useState(false);

  const refresh = () => {
    const current = MODES.find((m) => m.key === mode);
    if (!current?.status) return;
    listArticles(current.status)
      .then(setArticles)
      .catch((err) => {
        setStatus((err as Error).message);
        setArticles([]);
      });
  };

  useEffect(() => {
    if (isAuthenticated) {
      setQuery("");
      refresh();
    }
  }, [mode, isAuthenticated]);

  useEffect(() => {
    if (!editSlug || !isAuthenticated) return;
    getArticle(editSlug)
      .then((article) => {
        setEditingId(article.id);
        setDraft(fromArticle(article));
        setTagInput((article.tags || []).join(", "));
      })
      .catch(() => setStatus("Could not load that story."));
  }, [editSlug, isAuthenticated]);

  // Pre-fill author info for new drafts from user profile
  useEffect(() => {
    if (isAuthenticated && user && !editingId && !draft.title && !draft.author.name) {
      setDraft((current) => ({
        ...current,
        author: {
          name: user.name || "Author",
          role: user.role === "admin" ? "Editor" : "Writer",
          avatar: user.avatar || "",
        },
      }));
    }
  }, [isAuthenticated, user, editingId]);

  const handleUnlockToken = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError("");
    setBusy(true);
    const candidate = passwordInput.trim();
    if (!candidate) {
      setAuthError("Please enter your admin token.");
      setBusy(false);
      return;
    }
    const success = await unlockWithAdminToken(candidate);
    if (success) {
      setPasswordInput("");
      setAuthError("");
    } else {
      setAuthError("Invalid admin token or unauthorized.");
    }
    setBusy(false);
  };

  const handleElevateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setElevationError("");
    setElevationBusy(true);
    const candidate = elevationInput.trim();
    if (!candidate) {
      setElevationError("Please enter the admin passphrase.");
      setElevationBusy(false);
      return;
    }

    const success = await elevateToSuperuser(candidate);
    setElevationBusy(false);
    if (success) {
      setShowElevationModal(false);
      setElevationInput("");
      refresh();
    } else {
      setElevationError("Invalid superuser credentials. Please try again.");
    }
  };

  const slugifyText = (value: string) =>
    String(value || "")
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[^\w\s-]/g, "")
      .trim()
      .replace(/[\s_-]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 72);

  const onTitleChange = (newTitle: string) => {
    const oldSlug = draft.slug;
    const autoOld = slugifyText(draft.title);
    const nextSlug = !oldSlug || oldSlug === autoOld ? slugifyText(newTitle) : oldSlug;
    setDraft((current) => ({...current, title: newTitle, slug: nextSlug}));
  };

  const setField = <K extends keyof ArticleDraft>(key: K, value: ArticleDraft[K]) => {
    setDraft((current) => ({...current, [key]: value}));
  };

  const updateBlock = (index: number, patch: Partial<Block>) => {
    setDraft((current) => ({
      ...current,
      blocks: current.blocks.map((block, i) =>
        i === index ? ({...block, ...patch} as Block) : block
      ),
    }));
  };

  const addBlock = (type: BlockType) => {
    const _id = crypto.randomUUID();
    const next: Block =
      type === "image"
        ? {type, url: "", caption: "", _id}
        : type === "video"
          ? {type, url: "", caption: "", _id}
          : type === "quote"
            ? {type, text: "", cite: "", _id}
            : {type, text: "", _id};
    setDraft((current) => ({...current, blocks: [...current.blocks, next]}));
  };

  const moveBlock = (index: number, dir: number) => {
    setDraft((current) => {
      const next = [...current.blocks];
      const target = index + dir;
      if (target < 0 || target >= next.length) return current;
      [next[index], next[target]] = [next[target], next[index]];
      return {...current, blocks: next};
    });
  };

  const dropBlock = (index: number) => {
    setDraft((current) => ({
      ...current,
      blocks: current.blocks.filter((_, i) => i !== index),
    }));
  };

  const onUpload = async (
    file: File | undefined,
    apply: (url: string) => void
  ) => {
    if (!file) return;
    setBusy(true);
    try {
      const object = await uploadObject(file);
      apply(object.url);
      setStatus("Uploaded to Upstash Blob.");
    } catch (err) {
      setStatus((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const save = async (publish: boolean) => {
    setBusy(true);
    setStatus("");
    const cleanBlocks = draft.blocks.map(({_id, ...block}) => block as Block);
    const payload: ArticleDraft = {
      ...draft,
      published: publish,
      blocks: cleanBlocks,
      tags: tagInput
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean),
    };
    try {
      const saved = editingId
        ? await updateArticle(editingId, payload)
        : await createArticle(payload);
      setEditingId(saved.id);
      setDraft(fromArticle(saved));
      setTagInput((saved.tags || []).join(", "));
      setStatus(
        editingId
          ? "Brief updated in blob storage."
          : publish
            ? "Brief published to Upstash Blob."
            : "Brief saved as draft."
      );
      refresh();
    } catch (err) {
      setStatus((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const startNew = () => {
    setEditingId("");
    setDraft({
      ...emptyDraft(),
      author: {
        name: user?.name || "Author",
        role: user?.role === "admin" ? "Editor" : "Writer",
        avatar: user?.avatar || "",
      },
    });
    setTagInput("");
    setStatus("");
  };

  const load = async (slug: string) => {
    try {
      const article = await getArticle(slug);
      setEditingId(article.id);
      setDraft(fromArticle(article));
      setTagInput((article.tags || []).join(", "));
      setStatus(`Editing ${article.title}`);
      setMode("compose");
    } catch (err) {
      setStatus((err as Error).message);
    }
  };

  const publish = async (slug: string) => {
    setBusy(true);
    try {
      const article = await getArticle(slug);
      const saved = await updateArticle(article.id, {...fromArticle(article), published: true});
      setStatus(`Published ${saved.title}.`);
      refresh();
    } catch (err) {
      setStatus((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const destroy = async (id: string) => {
    if (!window.confirm("Remove this brief from blob storage?")) return;
    try {
      await removeArticle(id);
      if (editingId === id) startNew();
      refresh();
    } catch (err) {
      setStatus((err as Error).message);
    }
  };

  const filtered = articles.filter((article) => {
    const q = query.trim().toLowerCase();
    if (!q) return true;
    return [
      article.title,
      article.subtitle,
      article.excerpt,
      article.authorEmail || "",
      ...(article.tags || []),
    ]
      .join(" ")
      .toLowerCase()
      .includes(q);
  });

  if (isLoading) {
    return (
      <Layout title="Studio" description="Compose and publish Kalidass Journal briefs.">
        <main className={styles.page}>
          <div className={styles.lockContainer}>
            <p className={styles.status}>Checking authentication...</p>
          </div>
        </main>
      </Layout>
    );
  }

  if (!isAuthenticated) {
    return (
      <Layout title="Studio — Sign In" description="Authentication required to access Studio CMS.">
        <main className={styles.page}>
          <div className={styles.lockContainer}>
            <div className={styles.lockCard}>
              <div className={styles.lockBadge}>🔒 Kalidass Studio</div>
              <h2>Sign in to Publish</h2>
              <p>Sign in with your Auth0 account to write, manage drafts, and publish research essays.</p>

              {isAuth0Configured ? (
                <button
                  type="button"
                  className={styles.auth0Button}
                  onClick={loginWithAuth0}>
                  🚀 Sign in with Auth0
                </button>
              ) : null}

              <div className={styles.authDivider}>
                {isAuth0Configured ? "or unlock with admin token" : "enter admin token"}
              </div>

              {!isAuth0Configured || showAdminTokenInput ? (
                <form onSubmit={handleUnlockToken} className={styles.lockForm}>
                  <input
                    type="password"
                    className={styles.lockInput}
                    placeholder="Enter ADMIN_TOKEN"
                    value={passwordInput}
                    onChange={(event) => setPasswordInput(event.target.value)}
                    autoFocus={!isAuth0Configured}
                    required
                  />
                  <button type="submit" className={styles.primary} disabled={busy}>
                    {busy ? "Verifying..." : "Unlock Studio"}
                  </button>
                </form>
              ) : (
                <button
                  type="button"
                  className={styles.adminTokenToggle}
                  onClick={() => setShowAdminTokenInput(true)}>
                  Developer: Unlock with ADMIN_TOKEN
                </button>
              )}

              {authError ? <p className={styles.authError}>{authError}</p> : null}
            </div>
          </div>
        </main>
      </Layout>
    );
  }

  const currentUserEmail = (user?.email || "").toLowerCase();

  return (
    <Layout title="Studio" description="Compose and publish Kalidass Journal briefs.">
      <main className={styles.page}>
        <div className={styles.userBar}>
          <div className={styles.userInfo}>
            {user?.avatar ? (
              <img src={user.avatar} alt="" className={styles.userAvatar} />
            ) : (
              <div className={styles.userAvatarFallback}>
                {(user?.name || user?.email || "U")[0].toUpperCase()}
              </div>
            )}
            <div className={styles.userMeta}>
              <span className={styles.userName}>{user?.name || "Author"}</span>
              <span className={styles.userEmail}>{user?.email || ""}</span>
            </div>
            <span className={isAdmin ? styles.roleBadgeAdmin : styles.roleBadgeAuthor}>
              {isAdmin ? "Super Admin" : "Author"}
            </span>
          </div>
          <div className={styles.userBarActions}>
            {isSuperuserEligible && !isAdmin && (
              <button
                type="button"
                className={styles.elevateBtn}
                onClick={() => setShowElevationModal(true)}>
                ⚡ Login as Superuser
              </button>
            )}
            {isAdmin && isSuperuserEligible && (
              <button
                type="button"
                className={styles.dropBtn}
                onClick={async () => {
                  await dropSuperuser();
                  refresh();
                }}>
                Exit Superuser
              </button>
            )}
            <button type="button" className={styles.ghost} onClick={logout}>
              Log out
            </button>
          </div>
        </div>

        <header className={styles.top}>
          <div>
            <p className={styles.topKicker}>Studio // Edge Storage</p>
            <h1>{editingId ? "Revise a brief" : "Compose a brief"}</h1>
          </div>
          <div className={styles.topActions}>
            {mode === "compose" ? (
              <>
                <button type="button" className={styles.ghost} onClick={startNew}>
                  New article
                </button>
                {editingId ? (
                  <button
                    type="button"
                    className={styles.primary}
                    onClick={() => save(draft.published ?? true)}
                    disabled={busy}>
                    {busy ? "Saving..." : "Update"}
                  </button>
                ) : (
                  <>
                    <button type="button" className={styles.ghost} onClick={() => save(false)} disabled={busy}>
                      {busy ? "Saving..." : "Save draft"}
                    </button>
                    <button type="button" className={styles.primary} onClick={() => save(true)} disabled={busy}>
                      {busy ? "Saving..." : "Publish"}
                    </button>
                  </>
                )}
              </>
            ) : null}
          </div>
        </header>

        <nav className={styles.tabs}>
          {MODES.map((item) => (
            <button
              key={item.key}
              type="button"
              className={mode === item.key ? styles.tabOn : styles.tab}
              onClick={() => setMode(item.key)}>
              {item.label}
            </button>
          ))}
        </nav>

        {status ? <p className={styles.status}>{status}</p> : null}

        {mode === "compose" ? (
          <div className={styles.layout}>
            <form
              className={styles.editor}
              onSubmit={(event) => {
                event.preventDefault();
                save(editingId ? draft.published ?? true : true);
              }}>
              <label>
                Title
                <input
                  value={draft.title}
                  onChange={(event) => onTitleChange(event.target.value)}
                  placeholder="A systems sentence"
                  required
                />
              </label>

              <label>
                Slug (/story/{draft.slug || "auto"})
                <input
                  value={draft.slug || ""}
                  onChange={(event) => setField("slug", slugifyText(event.target.value))}
                  placeholder="custom-slug-or-auto"
                />
              </label>

              <div className={styles.readOnlyEmailBadge}>
                Author Email: <strong>{draft.authorEmail || user?.email || "author"}</strong> (inferred automatically from login)
              </div>

              <label>
                Subtitle
                <input
                  value={draft.subtitle}
                  onChange={(event) => setField("subtitle", event.target.value)}
                  placeholder="The line under the masthead"
                />
              </label>

              <label>
                Excerpt
                <textarea
                  value={draft.excerpt}
                  onChange={(event) => setField("excerpt", event.target.value)}
                  placeholder="A short deck for cards and search"
                  rows={3}
                />
              </label>

              <div className={styles.row}>
                <label>
                  Author Name
                  <input
                    value={draft.author.name}
                    onChange={(event) =>
                      setField("author", {...draft.author, name: event.target.value})
                    }
                    placeholder="Name"
                  />
                </label>
                <label>
                  Role
                  <input
                    value={draft.author.role}
                    onChange={(event) =>
                      setField("author", {...draft.author, role: event.target.value})
                    }
                    placeholder="Essayist"
                  />
                </label>
              </div>

              <label>
                Tags
                <input
                  value={tagInput}
                  onChange={(event) => setTagInput(event.target.value)}
                  placeholder="Agents, Evals, Systems"
                />
              </label>

              <div className={styles.accents}>
                {ACCENTS.map((color) => (
                  <button
                    key={color}
                    type="button"
                    className={draft.accent === color ? styles.swatchOn : styles.swatch}
                    style={{"--swatch": color} as CSSProperties}
                    onClick={() => setField("accent", color)}
                    aria-label={`Accent ${color}`}
                  />
                ))}
                <label className={styles.feature}>
                  <input
                    type="checkbox"
                    checked={draft.featured}
                    onChange={(event) => setField("featured", event.target.checked)}
                  />
                  Feature on cover
                </label>
                <label className={styles.feature}>
                  <input
                    type="checkbox"
                    checked={draft.private ?? true}
                    onChange={(event) => setField("private", event.target.checked)}
                  />
                  Private (unlisted)
                </label>
                <label className={styles.feature}>
                  <input
                    type="checkbox"
                    checked={draft.aiGenerated ?? false}
                    onChange={(event) => setField("aiGenerated", event.target.checked)}
                  />
                  AI generated
                </label>
              </div>

              <div className={styles.mediaBox}>
                <div>
                  <p>Cover image</p>
                  <input
                    value={draft.coverImage}
                    onChange={(event) => setField("coverImage", event.target.value)}
                    placeholder="https:// or upload"
                  />
                  <input
                    type="file"
                    accept="image/*"
                    onChange={(event) =>
                      onUpload(event.target.files?.[0], (url) => setField("coverImage", url))
                    }
                  />
                </div>
                {draft.coverImage ? <img src={draft.coverImage} alt="" /> : <div className={styles.ph} />}
              </div>

              <label>
                Lead video link
                <input
                  value={draft.videoUrl}
                  onChange={(event) => setField("videoUrl", event.target.value)}
                  placeholder="YouTube, Vimeo, or uploaded file URL"
                />
              </label>
              <input
                type="file"
                accept="video/*"
                onChange={(event) =>
                  onUpload(event.target.files?.[0], (url) => setField("videoUrl", url))
                }
              />

              <div className={styles.blocksHead}>
                <h2>Body</h2>
                <div>
                  {(["paragraph", "heading", "quote", "image", "video"] as BlockType[]).map(
                    (type) => (
                      <button key={type} type="button" onClick={() => addBlock(type)}>
                        + {blockLabel(type)}
                      </button>
                    )
                  )}
                </div>
              </div>

              {draft.blocks.map((block, index) => (
                <div key={block._id || `${block.type}-${index}`} className={styles.block}>
                  <div className={styles.blockBar}>
                    <strong>{blockLabel(block.type)}</strong>
                    <div>
                      <button type="button" onClick={() => moveBlock(index, -1)}>
                        Up
                      </button>
                      <button type="button" onClick={() => moveBlock(index, 1)}>
                        Down
                      </button>
                      <button type="button" onClick={() => dropBlock(index)}>
                        Remove
                      </button>
                    </div>
                  </div>
                  {block.type === "paragraph" || block.type === "heading" ? (
                    <textarea
                      value={block.text}
                      rows={block.type === "heading" ? 2 : 5}
                      onChange={(event) => updateBlock(index, {text: event.target.value})}
                    />
                  ) : null}
                  {block.type === "quote" ? (
                    <>
                      <textarea
                        value={block.text}
                        rows={3}
                        onChange={(event) => updateBlock(index, {text: event.target.value})}
                      />
                      <input
                        value={block.cite || ""}
                        placeholder="Citation"
                        onChange={(event) => updateBlock(index, {cite: event.target.value})}
                      />
                    </>
                  ) : null}
                  {block.type === "image" || block.type === "video" ? (
                    <>
                      <input
                        value={block.url}
                        placeholder={block.type === "video" ? "Video URL" : "Image URL"}
                        onChange={(event) => updateBlock(index, {url: event.target.value})}
                      />
                      <input
                        type="file"
                        accept={block.type === "video" ? "video/*" : "image/*"}
                        onChange={(event) =>
                          onUpload(event.target.files?.[0], (url) =>
                            updateBlock(index, {url})
                          )
                        }
                      />
                      <input
                        value={block.caption || ""}
                        placeholder="Caption"
                        onChange={(event) =>
                          updateBlock(index, {caption: event.target.value})
                        }
                      />
                    </>
                  ) : null}
                </div>
              ))}
            </form>
          </div>
        ) : (
          <section className={styles.rail}>
            <h2>{MODES.find((item) => item.key === mode)?.label}</h2>
            <input
              className={styles.search}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search title, subtitle, author email, or tags"
            />
            <div className={styles.stack}>
              {filtered.map((article) => {
                const isOwner =
                  Boolean(article.authorEmail) &&
                  article.authorEmail.toLowerCase() === currentUserEmail;
                const canModify = isAdmin || isOwner;

                return (
                  <article key={article.id} className={styles.mini}>
                    <strong>{article.title}</strong>
                    <span>
                      {article.publishedAt ? formatDate(article.publishedAt) : "Unpublished draft"}
                      {article.private ? " · Private" : ""}
                      {article.authorEmail ? (
                        <> · <span className={styles.authorEmailBadge}>{article.authorEmail}</span></>
                      ) : null}
                      {isOwner ? (
                        <> · <span className={styles.myStoryBadge}>My Story</span></>
                      ) : null}
                    </span>
                    <div>
                      {mode !== "delete" && canModify ? (
                        <button type="button" onClick={() => load(article.slug)}>
                          Edit
                        </button>
                      ) : null}
                      {mode === "drafts" && canModify ? (
                        <button type="button" onClick={() => publish(article.slug)} disabled={busy}>
                          Publish
                        </button>
                      ) : null}
                      {mode !== "drafts" ? (
                        <Link to={`/story/${article.slug}`}>View</Link>
                      ) : null}
                      {canModify ? (
                        <button type="button" onClick={() => destroy(article.id)}>
                          Delete
                        </button>
                      ) : null}
                    </div>
                  </article>
                );
              })}
              {filtered.length === 0 ? (
                <p className={styles.status}>Nothing here yet.</p>
              ) : null}
            </div>
          </section>
        )}
        {/* Superuser Elevation Passphrase Modal */}
        {showElevationModal && (
          <div className={styles.modalOverlay} onClick={() => setShowElevationModal(false)}>
            <div className={styles.modalCard} onClick={(e) => e.stopPropagation()}>
              <div className={styles.modalHeader}>
                <span className={styles.modalIcon}>⚡</span>
                <h3 className={styles.modalTitle}>Superuser Elevation</h3>
              </div>
              <p className={styles.modalDesc}>
                Enter your administrative passphrase to elevate your session and unlock superuser privileges across all briefs and drafts.
              </p>
              <form onSubmit={handleElevateSubmit}>
                <input
                  type="password"
                  className={styles.modalInput}
                  placeholder="Enter ADMIN_TOKEN"
                  value={elevationInput}
                  onChange={(e) => setElevationInput(e.target.value)}
                  autoFocus
                  required
                />
                {elevationError && <p className={styles.modalError}>{elevationError}</p>}
                <div className={styles.modalActions}>
                  <button
                    type="button"
                    className={styles.cancelBtn}
                    onClick={() => setShowElevationModal(false)}>
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className={styles.confirmBtn}
                    disabled={elevationBusy}>
                    {elevationBusy ? "Verifying..." : "Elevate"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </main>
    </Layout>
  );
}

export default function Admin(): ReactNode {
  return <AdminInner />;
}
