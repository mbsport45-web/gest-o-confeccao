import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Database from 'better-sqlite3';
import { afterEach, describe, expect, it } from 'vitest';
import { createDatabase, type AppDatabase } from '../db.js';
import { backupSqlite } from './backupSqlite.js';
import { lerDatabaseUrl } from './conexao.js';
import { divergencias, lerContagens, somasConferem } from './contagens.js';
import { ordemCopia } from './arquivos.js';
import { copiarSqliteParaPostgres } from './copiar.js';
import { criarPool } from './conexao.js';

describe('cópia SQLite sem trocar a API', () => {
  const abertos: AppDatabase[] = [];

  afterEach(() => {
    for (const db of abertos) db.close();
    abertos.length = 0;
  });

  it('mantém a API no DB_PATH e fora de DATABASE_URL', () => {
    const fonte = readFileSync(new URL('../index.ts', import.meta.url), 'utf8');
    expect(fonte).toContain('DB_PATH');
    expect(fonte).toContain('createDatabase(DB_PATH)');
    expect(fonte).not.toContain('DATABASE_URL');
  });

  it('exige DATABASE_URL no ambiente e rejeita outro esquema', () => {
    expect(() => lerDatabaseUrl({})).toThrow(/DATABASE_URL não está definida/);
    expect(lerDatabaseUrl({ DATABASE_URL: 'postgres://servidor/gestao' })).toBe(
      'postgres://servidor/gestao',
    );
    expect(() => lerDatabaseUrl({ DATABASE_URL: 'mysql://servidor/gestao' })).toThrow(
      /postgres:\/\//,
    );
  });

  it('faz backup sem alterar a origem e detecta divergência de contagem', async () => {
    const pasta = mkdtempSync(join(tmpdir(), 'gc-backup-'));
    const origem = join(pasta, 'origem.sqlite');
    const destino = join(pasta, 'backup.sqlite');
    const db = createDatabase(origem);
    abertos.push(db);
    db.prepare(
      `INSERT INTO materias_primas (empresa_id, nome, unidade, custo) VALUES (1, 'Malha', 'KG', 10)`,
    ).run();
    db.prepare(
      `INSERT INTO estoque_saldos (empresa_id, tipo, materia_prima_id, quantidade)
       VALUES (1, 'materia', 1, 8.5)`,
    ).run();

    await backupSqlite(origem, destino);
    const copia = new Database(destino, { readonly: true });
    const origemContagem = lerContagens(db, ordemCopia());
    const copiaContagem = lerContagens(copia, ordemCopia());
    expect(divergencias(origemContagem, copiaContagem)).toEqual([]);
    expect(
      (copia.prepare('SELECT quantidade FROM estoque_saldos').get() as { quantidade: number })
        .quantidade,
    ).toBe(8.5);
    copia.close();

    db.prepare(`INSERT INTO clientes (empresa_id, nome) VALUES (1, 'Cliente novo')`).run();
    const backupClientes = new Database(destino, { readonly: true });
    try {
      expect(divergencias(lerContagens(db, ['clientes']), lerContagens(backupClientes, ['clientes']))).toEqual(
        [{ tabela: 'clientes', origem: 1, destino: 0 }],
      );
    } finally {
      backupClientes.close();
    }
    expect(somasConferem(998.65, 998.6500001)).toBe(true);
    expect(somasConferem(10, 10.1)).toBe(false);
  });

  it.skipIf(!process.env.DATABASE_URL_TEST)(
    'copia compra, saldo e corte para o PostgreSQL de teste',
    async () => {
      const pasta = mkdtempSync(join(tmpdir(), 'gc-pg-'));
      const origem = join(pasta, 'origem.sqlite');
      const backup = join(pasta, 'backup.sqlite');
      const db = createDatabase(origem);
      abertos.push(db);
      const materia = db
        .prepare(
          `INSERT INTO materias_primas (empresa_id, nome, unidade, custo) VALUES (1, 'Dry Fit', 'KG', 12.5)`,
        )
        .run();
      const materiaId = Number(materia.lastInsertRowid);
      const saldo = db
        .prepare(
          `INSERT INTO estoque_saldos (empresa_id, tipo, materia_prima_id, quantidade)
           VALUES (1, 'materia', ?, 8.5)`,
        )
        .run(materiaId);
      db.prepare(
        `INSERT INTO estoque_movimentos (
           empresa_id, saldo_id, tipo, quantidade, saldo_anterior, saldo_posterior,
           motivo, materia_prima_id
         ) VALUES (1, ?, 'entrada', 10, 0, 10, 'Compra CP-0001', ?)`,
      ).run(Number(saldo.lastInsertRowid), materiaId);
      const saida = db
        .prepare(
          `INSERT INTO estoque_movimentos (
             empresa_id, saldo_id, tipo, quantidade, saldo_anterior, saldo_posterior,
             motivo, materia_prima_id
           ) VALUES (1, ?, 'saida', 1.5, 10, 8.5, 'Corte OP-0007', ?)`,
        )
        .run(Number(saldo.lastInsertRowid), materiaId);
      const ordem = db
        .prepare(
          `INSERT INTO ordens_producao (empresa_id, cliente, produto, tamanho, quantidade, codigo)
           VALUES (1, 'MB', 'Raglan', 'M', 10, 'OP-0007')`,
        )
        .run();
      db.prepare(
        `INSERT INTO cortes_infesto (
           empresa_id, ordem_id, materia_prima_id, cor, quantidade_pecas, camadas,
           metragem, peso_real, quantidade_baixada, unidade_baixa, movimento_id
         ) VALUES (1, ?, ?, 'PRETO', 10, 2, 0, 1.5, 1.5, 'KG', ?)`,
      ).run(Number(ordem.lastInsertRowid), materiaId, Number(saida.lastInsertRowid));

      const relatorio = await copiarSqliteParaPostgres({
        origem,
        destinoBackup: backup,
        databaseUrl: process.env.DATABASE_URL_TEST ?? '',
        substituirPostgres: true,
      });
      expect(relatorio.divergencias).toEqual([]);

      const pool = criarPool(process.env.DATABASE_URL_TEST ?? '');
      try {
        const saldos = await pool.query<{ quantidade: string }>(
          `SELECT quantidade::text AS quantidade FROM estoque_saldos ORDER BY id`,
        );
        const movimentos = await pool.query<{ tipo: string; quantidade: string }>(
          `SELECT tipo, quantidade::text AS quantidade FROM estoque_movimentos ORDER BY id`,
        );
        const cortes = await pool.query<{ quantidade_baixada: string }>(
          `SELECT quantidade_baixada::text AS quantidade_baixada FROM cortes_infesto ORDER BY id`,
        );
        expect(saldos.rows.map((linha) => Number(linha.quantidade))).toEqual([8.5]);
        expect(movimentos.rows.map((linha) => ({ tipo: linha.tipo, quantidade: Number(linha.quantidade) }))).toEqual([
          { tipo: 'entrada', quantidade: 10 },
          { tipo: 'saida', quantidade: 1.5 },
        ]);
        expect(cortes.rows.map((linha) => Number(linha.quantidade_baixada))).toEqual([1.5]);
        const papel = await pool.query(`SELECT 1 FROM pg_roles WHERE rolname = 'leitor_teste'`);
        if (!papel.rowCount) return;
        await pool.query('GRANT SELECT ON ALL TABLES IN SCHEMA public TO leitor_teste');
        const cliente = await pool.connect();
        try {
          await cliente.query('BEGIN');
          await cliente.query('SET LOCAL ROLE leitor_teste');
          const semEmpresa = await cliente.query<{ n: number }>(
            'SELECT COUNT(*)::int AS n FROM estoque_saldos',
          );
          const planos = await cliente.query<{ n: number }>('SELECT COUNT(*)::int AS n FROM planos');
          await cliente.query("SELECT set_config('app.empresa_id', '1', true)");
          const comEmpresa = await cliente.query<{ n: number }>(
            'SELECT COUNT(*)::int AS n FROM estoque_saldos',
          );
          expect(semEmpresa.rows[0]?.n).toBe(0);
          expect(planos.rows[0]?.n).toBeGreaterThan(0);
          expect(comEmpresa.rows[0]?.n).toBe(1);
          await cliente.query('ROLLBACK');
        } finally {
          cliente.release();
        }
      } finally {
        await pool.end();
      }
    },
    60_000,
  );
});
