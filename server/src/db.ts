import Database from "better-sqlite3";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";

const dbPath = process.env.DB_PATH
  ? resolve(process.env.DB_PATH)
  : resolve(process.cwd(), "data/gestao.db");

mkdirSync(dirname(dbPath), { recursive: true });

export const db = new Database(dbPath);
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

db.exec(`
  CREATE TABLE IF NOT EXISTS produtos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nome TEXT NOT NULL,
    sku TEXT NOT NULL UNIQUE,
    categoria TEXT NOT NULL DEFAULT 'Geral',
    preco REAL NOT NULL DEFAULT 0,
    criado_em TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS ordens_producao (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    produto_id INTEGER NOT NULL,
    quantidade INTEGER NOT NULL CHECK (quantidade > 0),
    status TEXT NOT NULL DEFAULT 'Pendente'
      CHECK (status IN ('Pendente', 'Em produção', 'Concluída', 'Cancelada')),
    prazo TEXT,
    criado_em TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (produto_id) REFERENCES produtos(id) ON DELETE CASCADE
  );
`);

const seedCount = db.prepare("SELECT COUNT(*) AS n FROM produtos").get() as {
  n: number;
};

if (seedCount.n === 0) {
  const insertProduto = db.prepare(
    "INSERT INTO produtos (nome, sku, categoria, preco) VALUES (?, ?, ?, ?)"
  );
  const seed = [
    ["Camiseta Básica", "CAM-001", "Camisetas", 39.9],
    ["Calça Jeans Slim", "CAL-014", "Calças", 129.9],
    ["Moletom Canguru", "MOL-007", "Moletons", 159.9],
  ] as const;
  const insertMany = db.transaction(() => {
    for (const [nome, sku, categoria, preco] of seed) {
      insertProduto.run(nome, sku, categoria, preco);
    }
  });
  insertMany();
}
