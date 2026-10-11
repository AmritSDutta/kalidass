import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import path from "node:path";

const SCHEMA_PATH = path.resolve(
  path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Z]:)/i, "$1")),
  "../../migrations/0001_init_d1_schema.sql"
);

export function createTestD1() {
  const sqlite = new DatabaseSync(":memory:");
  sqlite.exec("PRAGMA foreign_keys = ON;");

  const schema = fs.readFileSync(SCHEMA_PATH, "utf-8");
  sqlite.exec(schema);

  const createStatement = (sql, boundParams = []) => {
    return {
      _sql: sql,
      _params: boundParams,
      bind(...params) {
        return createStatement(sql, params);
      },
      async all() {
        const stmt = sqlite.prepare(sql);
        const rows = stmt.all(...this._params);
        return { results: rows, success: true };
      },
      async first(col) {
        const stmt = sqlite.prepare(sql);
        const row = stmt.get(...this._params);
        if (!row) return null;
        if (col && typeof col === "string") return row[col] ?? null;
        return row;
      },
      async run() {
        const stmt = sqlite.prepare(sql);
        const info = stmt.run(...this._params);
        return {
          success: true,
          meta: { changes: info.changes, last_row_id: info.lastInsertRowid },
        };
      },
    };
  };

  return {
    _rawSqlite: sqlite,
    prepare(sql) {
      return createStatement(sql);
    },
    async batch(statements) {
      sqlite.exec("BEGIN");
      try {
        const results = [];
        for (const s of statements) {
          const stmt = sqlite.prepare(s._sql);
          if (s._sql.trim().toUpperCase().startsWith("SELECT")) {
            const rows = stmt.all(...s._params);
            results.push({ results: rows, success: true });
          } else {
            const info = stmt.run(...s._params);
            results.push({
              success: true,
              meta: { changes: info.changes, last_row_id: info.lastInsertRowid },
            });
          }
        }
        sqlite.exec("COMMIT");
        return results;
      } catch (err) {
        sqlite.exec("ROLLBACK");
        throw err;
      }
    },
    async exec(sql) {
      sqlite.exec(sql);
      return { count: 1, duration: 0 };
    },
  };
}
