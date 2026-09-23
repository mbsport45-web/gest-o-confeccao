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

  it('preenche papel proprietário em usuarios já existentes', async () => {
    const path = join(mkdtempSync(join(tmpdir(), 'gc-papel-')), 'gestao.sqlite');
    const antigo = new Database(path);
    antigo.exec(`
      CREATE TABLE empresas (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        nome TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'ativa',
        criado_em TEXT NOT NULL DEFAULT (datetime('now'))
      );
      INSERT INTO empresas (id, nome, status) VALUES (1, 'Empresa 1', 'ativa');
      CREATE TABLE usuarios (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        empresa_id INTEGER NOT NULL DEFAULT 1,
        nome TEXT NOT NULL,
        email TEXT NOT NULL UNIQUE,
        senha_hash TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'ativo',
        criado_em TEXT NOT NULL DEFAULT (datetime('now')),
        atualizado_em TEXT NOT NULL DEFAULT (datetime('now'))
      );
      INSERT INTO usuarios (nome, email, senha_hash) VALUES ('Antigo', 'antigo@gestao.local', 'hash');
    `);
    antigo.close();

    db = createDatabase(path);
    const row = db.prepare('SELECT email, papel FROM usuarios').get() as {
      email: string;
      papel: string;
    };
    expect(row).toEqual({ email: 'antigo@gestao.local', papel: 'proprietario' });
  });

  it('migra papéis antigos dono/admin/operador/consulta', async () => {
    const path = join(mkdtempSync(join(tmpdir(), 'gc-papel-mig-')), 'gestao.sqlite');
    const antigo = new Database(path);
    antigo.exec(`
      CREATE TABLE empresas (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        nome TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'ativa',
        criado_em TEXT NOT NULL DEFAULT (datetime('now'))
      );
      INSERT INTO empresas (id, nome, status) VALUES (1, 'Empresa 1', 'ativa');
      CREATE TABLE usuarios (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        empresa_id INTEGER NOT NULL DEFAULT 1,
        nome TEXT NOT NULL,
        email TEXT NOT NULL UNIQUE,
        senha_hash TEXT NOT NULL,
        papel TEXT NOT NULL DEFAULT 'dono',
        status TEXT NOT NULL DEFAULT 'ativo',
        criado_em TEXT NOT NULL DEFAULT (datetime('now')),
        atualizado_em TEXT NOT NULL DEFAULT (datetime('now'))
      );
      INSERT INTO usuarios (nome, email, senha_hash, papel) VALUES
        ('Dono', 'dono@gestao.local', 'hash', 'dono'),
        ('Admin', 'admin@gestao.local', 'hash', 'admin'),
        ('Op', 'op@gestao.local', 'hash', 'operador'),
        ('Consulta', 'consulta@gestao.local', 'hash', 'consulta');
    `);
    antigo.close();

    db = createDatabase(path);
    const papeis = db
      .prepare('SELECT email, papel FROM usuarios ORDER BY email')
      .all() as Array<{ email: string; papel: string }>;
    expect(papeis).toEqual([
      { email: 'admin@gestao.local', papel: 'administrador' },
      { email: 'consulta@gestao.local', papel: 'vendas' },
      { email: 'dono@gestao.local', papel: 'proprietario' },
      { email: 'op@gestao.local', papel: 'producao' },
    ]);
  });
});
