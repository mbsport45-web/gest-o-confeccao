import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import Database from 'better-sqlite3';

/** Copia consistente, inclusive o WAL, para um arquivo novo. Não altera a origem. */
export async function backupSqlite(origem: string, destino: string): Promise<void> {
  if (origem === destino) {
    throw new Error('O backup precisa ser um arquivo diferente do SQLite original');
  }
  mkdirSync(dirname(destino), { recursive: true });
  const db = new Database(origem, { readonly: true, fileMustExist: true });
  try {
    await db.backup(destino);
  } finally {
    db.close();
  }
}
