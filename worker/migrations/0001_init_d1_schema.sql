-- 0001_init_d1_schema.sql
-- Canonical schema for Cloudflare D1 (kalidass-journal-db)

CREATE TABLE IF NOT EXISTS articles (
  id TEXT PRIMARY KEY,
  slug TEXT UNIQUE NOT NULL,
  title TEXT NOT NULL,
  author_email TEXT NOT NULL,
  published INTEGER NOT NULL DEFAULT 1,
  private INTEGER NOT NULL DEFAULT 1,
  featured INTEGER NOT NULL DEFAULT 0,
  read_time INTEGER NOT NULL DEFAULT 5,
  published_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  summary TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS article_tags (
  article_id TEXT NOT NULL,
  tag TEXT NOT NULL COLLATE NOCASE,
  PRIMARY KEY (article_id, tag),
  FOREIGN KEY (article_id) REFERENCES articles(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_articles_feed 
  ON articles (published, private, published_at DESC);

CREATE INDEX IF NOT EXISTS idx_articles_author 
  ON articles (author_email, published, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_tags_lookup 
  ON article_tags (tag);
