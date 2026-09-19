import Database from 'better-sqlite3';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

export type AppDatabase = ReturnType<typeof createDatabase>;

/**
 * Creates and initializes a SQLite database connection.
 *
 * Pass `:memory:` for an ephemeral database (used by tests). For normal runs a
 * file path is used so production orders survive server restarts.
 */
export function createDatabase(location: string) {
  if (location !== ':memory:') {
    mkdirSync(dirname(location), { recursive: true });
  }

  const db = new Database(location);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  db.exec(`
    CREATE TABLE IF NOT EXISTS ordens_producao (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      cliente TEXT NOT NULL,
      produto TEXT NOT NULL,
      tamanho TEXT NOT NULL,
      quantidade INTEGER NOT NULL,
      status TEXT NOT NULL DEFAULT 'pendente',
      criado_em TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);

  return db;
}
