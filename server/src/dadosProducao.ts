import type { AppDatabase } from './db.js';

export interface DadosProducao {
  valor_costura: number | null;
  consumo_tecido: number | null;
  unidade_consumo: string | null;
  observacoes_corte: string | null;
  processos: string | null;
  outros_custos: string | null;
}

export const DADOS_PRODUCAO_VAZIOS: DadosProducao = {
  valor_costura: null,
  consumo_tecido: null,
  unidade_consumo: null,
  observacoes_corte: null,
  processos: null,
  outros_custos: null,
};

export function lerDadosProducao(
  db: AppDatabase,
  produtoId: number,
  empresaId: number,
): DadosProducao {
  const row = db
    .prepare(
      `SELECT valor_costura, consumo_tecido, unidade_consumo, observacoes_corte, processos, outros_custos
         FROM produto_dados_producao
        WHERE produto_id = ? AND empresa_id = ?`,
    )
    .get(produtoId, empresaId) as DadosProducao | undefined;
  return row ?? { ...DADOS_PRODUCAO_VAZIOS };
}

export function salvarValorCostura(
  db: AppDatabase,
  produtoId: number,
  empresaId: number,
  valor: number | null,
) {
  db.prepare(
    `INSERT INTO produto_dados_producao (
       produto_id, empresa_id, valor_costura, atualizado_em
     ) VALUES (
       @produto_id, @empresa_id, @valor_costura, datetime('now')
     )
     ON CONFLICT(produto_id) DO UPDATE SET
       valor_costura = excluded.valor_costura,
       empresa_id = excluded.empresa_id,
       atualizado_em = datetime('now')`,
  ).run({
    produto_id: produtoId,
    empresa_id: empresaId,
    valor_costura: valor,
  });
}
