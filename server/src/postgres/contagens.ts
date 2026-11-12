import type Database from 'better-sqlite3';

export type Contagem = {
  tabela: string;
  linhas: number;
};

export type Divergencia = {
  tabela: string;
  origem: number;
  destino: number | null;
};

const IDENTIFICADOR = /^[a-z_][a-z0-9_]*$/;

export function identificador(nome: string): string {
  if (!IDENTIFICADOR.test(nome)) {
    throw new Error(`Identificador de tabela inválido: ${nome}`);
  }
  return nome;
}

export function tabelaExiste(db: Database.Database, tabela: string): boolean {
  const nome = identificador(tabela);
  const row = db
    .prepare(`SELECT 1 AS ok FROM sqlite_master WHERE type = 'table' AND name = ?`)
    .get(nome) as { ok: number } | undefined;
  return Boolean(row);
}

export function lerContagens(db: Database.Database, tabelas: string[]): Contagem[] {
  return tabelas.filter((tabela) => tabelaExiste(db, tabela)).map((tabela) => {
    const nome = identificador(tabela);
    const row = db.prepare(`SELECT COUNT(*) AS n FROM ${nome}`).get() as { n: number };
    return { tabela: nome, linhas: row.n };
  });
}

export function divergencias(origem: Contagem[], destino: Contagem[]): Divergencia[] {
  const mapa = new Map(destino.map((item) => [item.tabela, item.linhas]));
  const achados: Divergencia[] = [];
  for (const item of origem) {
    const linhas = mapa.get(item.tabela);
    if (linhas === undefined || linhas !== item.linhas) {
      achados.push({ tabela: item.tabela, origem: item.linhas, destino: linhas ?? null });
    }
  }
  return achados;
}

export function somaQuantidade(db: Database.Database, tabela: string): number | null {
  if (!tabelaExiste(db, tabela)) return null;
  const nome = identificador(tabela);
  const colunas = db.prepare(`PRAGMA table_info(${nome})`).all() as Array<{ name: string }>;
  if (!colunas.some((coluna) => coluna.name === 'quantidade')) return null;
  const row = db.prepare(`SELECT COALESCE(SUM(quantidade), 0) AS n FROM ${nome}`).get() as {
    n: number;
  };
  return row.n;
}

export function somasConferem(origem: number | null, destino: number | null): boolean {
  if (origem === null || destino === null) return origem === destino;
  return Math.abs(origem - destino) < 0.0001;
}
