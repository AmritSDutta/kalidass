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
import {emptyDraft, formatDate} from "@site/src/lib/media";
import type {ArticleDraft, ArticleSummary, Block} from "@site/src/lib/types";
import styles from "./admin.module.css";

const ACCENTS = ["#22d3ee", "#a78bfa", "#c4f542", "#fb7185", "#38bdf8", "#f472b6"];

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

function fromArticle(article: {
  title: string;
  subtitle: string;
  excerpt: string;
  coverImage: string;
  videoUrl: string;
  author: ArticleDraft["author"];
  tags: string[];
  accent: string;
  featured: boolean;
  blocks: Block[];
  slug: string;
  published: boolean;
  private: boolean;
  aiGenerated: boolean;
}): ArticleDraft {
  return {
    title: article.title,
    subtitle: article.subtitle,
    excerpt: article.excerpt,
    coverImage: article.coverImage,
    videoUrl: article.videoUrl,
    author: article.author,
    tags: article.tags,
    accent: article.accent,
    featured: article.featured,
    blocks: article.blocks?.length ? article.blocks : [{type: "paragraph", text: ""}],
    slug: article.slug,
    published: article.published ?? true,
    private: article.private ?? true,
    aiGenerated: article.aiGenerated ?? false,
  };
}

export default function Admin(): ReactNode {
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

  const refresh = () => {
    const current = MODES.find((m) => m.key === mode);
    if (!current?.status) return;
    listArticles(current.status).then(setArticles).catch(() => setArticles([]));
  };

  useEffect(() => {
    setQuery("");
    refresh();
  }, [mode]);

  useEffect(() => {
    if (!editSlug) return;
    getArticle(editSlug)
      .then((article) => {
        setEditingId(article.id);
        setDraft(fromArticle(article));
        setTagInput((article.tags || []).join(", "));
      })
      .catch(() => setStatus("Could not load that story."));
  }, [editSlug]);

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
    const next: Block =
      type === "image"
        ? {type, url: "", caption: ""}
        : type === "video"
          ? {type, url: "", caption: ""}
          : type === "quote"
            ? {type, text: "", cite: ""}
            : {type, text: ""};
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
    const payload: ArticleDraft = {
      ...draft,
      published: publish,
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
    setDraft(emptyDraft());
    setTagInput("");
    setStatus("");
  };

  const load = async (slug: string) => {
    const article = await getArticle(slug);
    setEditingId(article.id);
    setDraft(fromArticle(article));
    setTagInput((article.tags || []).join(", "));
    setStatus(`Editing ${article.title}`);
    setMode("compose");
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
    await removeArticle(id);
    if (editingId === id) startNew();
    refresh();
  };

  const filtered = articles.filter((article) => {
    const q = query.trim().toLowerCase();
    if (!q) return true;
    return [article.title, article.subtitle, article.excerpt, ...(article.tags || [])]
      .join(" ")
      .toLowerCase()
      .includes(q);
  });

  return (
    <Layout title="Studio" description="Compose and publish Amrit Journal briefs.">
      <main className={styles.page}>
        <header className={styles.top}>
          <div>
            <p>Worker studio / Upstash Blob</p>
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
                onChange={(event) => setField("title", event.target.value)}
                placeholder="A systems sentence"
                required
              />
            </label>
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
                Author
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
              <div key={`${block.type}-${index}`} className={styles.block}>
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
              placeholder="Search title, subtitle, or tags"
            />
            <div className={styles.stack}>
              {filtered.map((article) => (
                <article key={article.id} className={styles.mini}>
                  <strong>{article.title}</strong>
                  <span>
                    {article.publishedAt ? formatDate(article.publishedAt) : "Unpublished draft"}
                    {article.private ? " · Private" : ""}
                  </span>
                  <div>
                    {mode !== "delete" ? (
                      <button type="button" onClick={() => load(article.slug)}>
                        Edit
                      </button>
                    ) : null}
                    {mode === "drafts" ? (
                      <button type="button" onClick={() => publish(article.slug)} disabled={busy}>
                        Publish
                      </button>
                    ) : null}
                    {mode !== "drafts" ? (
                      <Link to={`/story/${article.slug}`}>View</Link>
                    ) : null}
                    {mode !== "published" ? (
                      <button type="button" onClick={() => destroy(article.id)}>
                        Delete
                      </button>
                    ) : null}
                  </div>
                </article>
              ))}
              {filtered.length === 0 ? (
                <p className={styles.status}>Nothing here yet.</p>
              ) : null}
            </div>
          </section>
        )}
      </main>
    </Layout>
  );
}
