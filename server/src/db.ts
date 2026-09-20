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

    CREATE TABLE IF NOT EXISTS clientes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nome TEXT NOT NULL,
      cpf_cnpj TEXT,
      contato TEXT,
      telefone TEXT,
      whatsapp TEXT,
      email TEXT,
      endereco TEXT,
      cidade TEXT,
      estado TEXT,
      cep TEXT,
      condicao_pagamento TEXT,
      limite_credito REAL NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'ativo',
      observacoes TEXT,
      criado_em TEXT NOT NULL DEFAULT (datetime('now')),
      atualizado_em TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE UNIQUE INDEX IF NOT EXISTS clientes_cpf_cnpj_unique
      ON clientes (cpf_cnpj)
      WHERE cpf_cnpj IS NOT NULL AND cpf_cnpj != '';

    -- Cadastro de produtos (base para ficha técnica/BOM, matérias-primas,
    -- estoque, pedidos de venda e ordens de produção).
    CREATE TABLE IF NOT EXISTS produtos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      sku TEXT,
      nome TEXT NOT NULL,
      descricao TEXT,
      categoria TEXT,
      subcategoria TEXT,
      marca TEXT,
      genero TEXT,
      colecao TEXT,
      cores TEXT NOT NULL DEFAULT '[]',
      tamanhos TEXT NOT NULL DEFAULT '[]',
      codigo_barras TEXT,
      unidade TEXT NOT NULL DEFAULT 'UN',
      preco_venda REAL NOT NULL DEFAULT 0,
      preco_atacado REAL NOT NULL DEFAULT 0,
      preco_custo REAL NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'ativo',
      estoque_minimo INTEGER NOT NULL DEFAULT 0,
      imagem TEXT,
      observacoes TEXT,
      criado_em TEXT NOT NULL DEFAULT (datetime('now')),
      atualizado_em TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE UNIQUE INDEX IF NOT EXISTS produtos_sku_unique
      ON produtos (sku)
      WHERE sku IS NOT NULL AND sku != '';

    CREATE UNIQUE INDEX IF NOT EXISTS produtos_codigo_barras_unique
      ON produtos (codigo_barras)
      WHERE codigo_barras IS NOT NULL AND codigo_barras != '';

    -- Variantes cor × tamanho, cada uma com SKU e código de barras únicos.
    -- estoque e pedidos futuros devem apontar para produto_variantes.id.
    CREATE TABLE IF NOT EXISTS produto_variantes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      produto_id INTEGER NOT NULL REFERENCES produtos(id) ON DELETE CASCADE,
      cor TEXT NOT NULL,
      tamanho TEXT NOT NULL,
      sku TEXT NOT NULL,
      codigo_barras TEXT,
      preco_venda REAL,
      preco_atacado REAL,
      preco_custo REAL,
      estoque_minimo INTEGER,
      status TEXT NOT NULL DEFAULT 'ativo',
      criado_em TEXT NOT NULL DEFAULT (datetime('now')),
      atualizado_em TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE (produto_id, cor, tamanho)
    );

    CREATE UNIQUE INDEX IF NOT EXISTS produto_variantes_sku_unique
      ON produto_variantes (sku);

    CREATE UNIQUE INDEX IF NOT EXISTS produto_variantes_codigo_barras_unique
      ON produto_variantes (codigo_barras)
      WHERE codigo_barras IS NOT NULL AND codigo_barras != '';
  `);

  const ordemCols = db
    .prepare(`PRAGMA table_info(ordens_producao)`)
    .all() as { name: string }[];
  if (!ordemCols.some((col) => col.name === 'cliente_id')) {
    db.exec(
      `ALTER TABLE ordens_producao ADD COLUMN cliente_id INTEGER REFERENCES clientes(id)`,
    );
  }
  if (!ordemCols.some((col) => col.name === 'produto_id')) {
    db.exec(
      `ALTER TABLE ordens_producao ADD COLUMN produto_id INTEGER REFERENCES produtos(id)`,
    );
  }
  if (!ordemCols.some((col) => col.name === 'variante_id')) {
    db.exec(
      `ALTER TABLE ordens_producao ADD COLUMN variante_id INTEGER REFERENCES produto_variantes(id)`,
    );
  }

  return db;
}
