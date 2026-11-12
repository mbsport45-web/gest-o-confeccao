import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { createDatabase } from '../db.js';
import { arquivosSql, diretorioMigracoes, ordemCopia } from './arquivos.js';
import { join } from 'node:path';

function sql(arquivo: string): string {
  return readFileSync(join(diretorioMigracoes(), arquivo), 'utf8');
}

function sqlCompleto(): string {
  return arquivosSql()
    .filter((arquivo) => arquivo.endsWith('.sql'))
    .map((arquivo) => sql(arquivo))
    .join('\n');
}

describe('estrutura PostgreSQL', () => {
  it('cobre as tabelas e os índices do SQLite, mais a ficha técnica', () => {
    const estrutura = sqlCompleto();
    const db = createDatabase(':memory:');
    try {
      const tabelas = db
        .prepare(`SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'`)
        .all() as Array<{ name: string }>;
      expect(tabelas.length).toBeGreaterThan(30);
      for (const tabela of tabelas) {
        expect(estrutura).toContain(`CREATE TABLE IF NOT EXISTS ${tabela.name} (`);
      }
      expect(estrutura).toContain('CREATE TABLE IF NOT EXISTS ficha_tecnica_itens (');

      const indices = db
        .prepare(`SELECT name FROM sqlite_master WHERE type = 'index' AND sql IS NOT NULL`)
        .all() as Array<{ name: string }>;
      expect(indices.length).toBeGreaterThanOrEqual(60);
      for (const indice of indices) {
        expect(estrutura).toContain(`INDEX IF NOT EXISTS ${indice.name}`);
      }
      expect(sql('001_estrutura.sql')).not.toContain('ifnull(');
    } finally {
      db.close();
    }
  });

  it('isola por empresa e preserva os catálogos globais', () => {
    const isolamento = sql('002_isolamento.sql');
    const ordem = ordemCopia();
    expect(ordem).toContain('empresas');
    expect(ordem.indexOf('empresas')).toBeLessThan(ordem.indexOf('usuarios'));
    expect(ordem.indexOf('estoque_movimentos')).toBeLessThan(ordem.indexOf('ordem_requisitos'));
    expect(ordem.indexOf('ordens_producao')).toBeLessThan(ordem.indexOf('cortes_infesto'));
    for (const tabela of [
      'empresas',
      'clientes',
      'estoque_saldos',
      'estoque_movimentos',
      'pedidos_compra',
      'ordens_producao',
      'cortes_infesto',
      'sessoes',
    ]) {
      expect(isolamento).toContain(`ALTER TABLE ${tabela} ENABLE ROW LEVEL SECURITY;`);
    }
    expect(isolamento).not.toContain('ALTER TABLE planos ENABLE ROW LEVEL SECURITY;');
    expect(isolamento).not.toContain('ALTER TABLE financeiro_categorias ENABLE ROW LEVEL SECURITY;');
  });
});
