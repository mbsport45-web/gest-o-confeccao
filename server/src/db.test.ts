import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Database from 'better-sqlite3';
import { afterEach, describe, expect, it } from 'vitest';
import { createDatabase, type AppDatabase } from './db.js';

describe('migração empresa_id', () => {
  let db: AppDatabase | undefined;

  afterEach(() => {
    db?.close();
  });

  it('preenche empresa_id = 1 em tabelas já populadas', () => {
    const path = join(mkdtempSync(join(tmpdir(), 'gc-mig-')), 'gestao.sqlite');
    const antigo = new Database(path);
    antigo.exec(`
      CREATE TABLE clientes (
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
      INSERT INTO clientes (nome) VALUES ('Loja antiga');
    `);
    antigo.close();

    db = createDatabase(path);
    const row = db.prepare('SELECT nome, empresa_id FROM clientes').get() as {
      nome: string;
      empresa_id: number;
    };
    expect(row).toEqual({ nome: 'Loja antiga', empresa_id: 1 });
  });
});
