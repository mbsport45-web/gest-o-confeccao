import { existsSync } from 'node:fs';
import Database from 'better-sqlite3';
import type { PoolClient } from 'pg';
import { arquivosSql, lerSql, ordemCopia } from './arquivos.js';
import { backupSqlite } from './backupSqlite.js';
import { criarPool } from './conexao.js';
import {
  divergencias,
  identificador,
  lerContagens,
  somaQuantidade,
  somasConferem,
  tabelaExiste,
  type Contagem,
  type Divergencia,
} from './contagens.js';

export type OpcoesCopia = {
  origem: string;
  destinoBackup: string;
  databaseUrl: string;
  substituirPostgres?: boolean;
};

export type RelatorioCopia = {
  backup: string;
  contagens: Contagem[];
  divergencias: Divergencia[];
  somaSaldos: number;
  somaMovimentos: number;
};

type Coluna = { name: string; type: string };

export async function copiarSqliteParaPostgres(opcoes: OpcoesCopia): Promise<RelatorioCopia> {
  if (existsSync(opcoes.destinoBackup)) {
    throw new Error(`O backup já existe e não será sobrescrito: ${opcoes.destinoBackup}`);
  }
  await backupSqlite(opcoes.origem, opcoes.destinoBackup);

  const sqlite = new Database(opcoes.origem, { readonly: true, fileMustExist: true });
  const pool = criarPool(opcoes.databaseUrl);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await aplicarMigracoes(client);
    await prepararDestino(client, Boolean(opcoes.substituirPostgres));
    await copiarTabelas(sqlite, client);
    const relatorio = await conferir(sqlite, client);
    if (relatorio.divergencias.length > 0) {
      throw new Error(
        `Cópia divergente: ${relatorio.divergencias
          .map((item) => `${item.tabela} sqlite=${item.origem} postgres=${item.destino ?? 'ausente'}`)
          .join('; ')}`,
      );
    }
    await client.query('COMMIT');
    return { ...relatorio, backup: opcoes.destinoBackup };
  } catch (erro) {
    await client.query('ROLLBACK');
    throw erro;
  } finally {
    client.release();
    await pool.end();
    sqlite.close();
  }
}

async function aplicarMigracoes(client: PoolClient): Promise<void> {
  await client.query(`
    CREATE TABLE IF NOT EXISTS schema_migracoes (
      arquivo TEXT PRIMARY KEY,
      aplicado_em TEXT NOT NULL DEFAULT (to_char((CURRENT_TIMESTAMP AT TIME ZONE 'UTC'), 'YYYY-MM-DD HH24:MI:SS'))
    )
  `);
  for (const arquivo of arquivosSql()) {
    const aplicado = await client.query<{ arquivo: string }>(
      'SELECT arquivo FROM schema_migracoes WHERE arquivo = $1',
      [arquivo],
    );
    if (aplicado.rowCount) continue;
    await client.query(lerSql(arquivo));
    await client.query('INSERT INTO schema_migracoes (arquivo) VALUES ($1)', [arquivo]);
  }
}

async function prepararDestino(client: PoolClient, substituir: boolean): Promise<void> {
  const ocupado = await client.query<{ n: number }>('SELECT COUNT(*)::int AS n FROM empresas');
  const linhas = ocupado.rows[0]?.n ?? 0;
  if (linhas === 0) return;
  if (!substituir) {
    throw new Error(
      'O PostgreSQL já tem dados em empresas. A cópia foi interrompida e o SQLite permanece intacto. Use --substituir-postgres apenas para limpar o banco PostgreSQL de destino.',
    );
  }
  const tabelas = ordemCopia().map(identificador).join(', ');
  await client.query(`TRUNCATE TABLE ${tabelas} RESTART IDENTITY CASCADE`);
}

async function copiarTabelas(sqlite: Database.Database, client: PoolClient): Promise<void> {
  for (const tabela of ordemCopia()) {
    if (!tabelaExiste(sqlite, tabela)) continue;
    const nome = identificador(tabela);
    const colunas = sqlite.prepare(`PRAGMA table_info(${nome})`).all() as Coluna[];
    if (colunas.length === 0) continue;
    const lista = colunas.map((coluna) => identificador(coluna.name)).join(', ');
    const selecao = colunas
      .map((coluna) => {
        const colunaNome = identificador(coluna.name);
        return coluna.type.toUpperCase() === 'REAL'
          ? `CAST(${colunaNome} AS TEXT) AS ${colunaNome}`
          : colunaNome;
      })
      .join(', ');
    const linhas = sqlite.prepare(`SELECT ${selecao} FROM ${nome}`).all() as Array<
      Record<string, unknown>
    >;
    for (const linha of linhas) {
      const valores = colunas.map((coluna) => linha[coluna.name]);
      const marcadores = valores.map((_, indice) => `$${indice + 1}`).join(', ');
      await client.query(
        `INSERT INTO ${nome} (${lista}) OVERRIDING SYSTEM VALUE VALUES (${marcadores})`,
        valores,
      );
    }
    await client.query(
      `SELECT setval(
         pg_get_serial_sequence('${nome}', 'id'),
         GREATEST(COALESCE((SELECT MAX(id) FROM ${nome}), 1), 1),
         (SELECT MAX(id) IS NOT NULL FROM ${nome})
       )`,
    );
  }
}

async function conferir(
  sqlite: Database.Database,
  client: PoolClient,
): Promise<Omit<RelatorioCopia, 'backup'>> {
  const origem = lerContagens(sqlite, ordemCopia());
  const destino: Contagem[] = [];
  for (const item of origem) {
    const contagem = await client.query<{ n: number }>(
      `SELECT COUNT(*)::int AS n FROM ${identificador(item.tabela)}`,
    );
    destino.push({ tabela: item.tabela, linhas: contagem.rows[0]?.n ?? 0 });
  }
  const achados = divergencias(origem, destino);
  const somaSaldos = somaQuantidade(sqlite, 'estoque_saldos');
  const somaMovimentos = somaQuantidade(sqlite, 'estoque_movimentos');
  await conferirSoma(client, 'estoque_saldos', somaSaldos);
  await conferirSoma(client, 'estoque_movimentos', somaMovimentos);
  return {
    contagens: origem,
    divergencias: achados,
    somaSaldos: somaSaldos ?? 0,
    somaMovimentos: somaMovimentos ?? 0,
  };
}

async function conferirSoma(
  client: PoolClient,
  tabela: string,
  esperado: number | null,
): Promise<void> {
  if (esperado === null) return;
  const nome = identificador(tabela);
  const resultado = await client.query<{ n: string }>(
    `SELECT COALESCE(SUM(quantidade), 0)::text AS n FROM ${nome}`,
  );
  const obtido = Number(resultado.rows[0]?.n ?? '0');
  if (!somasConferem(esperado, obtido)) {
    throw new Error(`Soma de ${nome}.quantidade divergente: sqlite=${esperado} postgres=${obtido}`);
  }
}
