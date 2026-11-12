import type { AppDatabase } from './db.js';
import { registrarMovimentoEstoque } from './estoque.js';

export type ConsumoCorOc = {
  cor: string;
  camadas: number;
  peso_folha: number;
  consumo_total: number;
  unidade: string;
  movimento_id: number | null;
  baixado_em: string | null;
};

export function camadasAutomaticasPorCor(quantidades: Array<number | null | undefined>): number {
  const positivas = quantidades.map((item) => Number(item) || 0).filter((item) => item > 0);
  if (positivas.length === 0) return 0;
  return Math.min(...positivas);
}

export function consumoTotalPorCor(camadas: number, pesoFolha: number): number {
  const folhas = Number(camadas);
  const peso = Number(pesoFolha);
  if (!(folhas > 0) || !(peso > 0)) return 0;
  return Math.round(folhas * peso * 1000) / 1000;
}

function chaveCor(nome: string) {
  return nome.trim().toLocaleLowerCase('pt-BR');
}

export function lerConsumosCoresOc(
  db: AppDatabase,
  empresaId: number,
  ordemCorteId: number,
): ConsumoCorOc[] {
  return db
    .prepare(
      `SELECT cor, camadas, peso_folha, consumo_total, unidade, movimento_id, baixado_em
         FROM ordem_corte_consumo_cores
        WHERE empresa_id = ? AND ordem_corte_id = ?
        ORDER BY id ASC`,
    )
    .all(empresaId, ordemCorteId) as ConsumoCorOc[];
}

export function salvarConsumosCoresOc(
  db: AppDatabase,
  empresaId: number,
  ordemCorteId: number,
  itens: Array<{
    cor: string;
    camadas?: number | null;
    peso_folha?: number | null;
    consumo_total?: number | null;
    unidade?: string | null;
  }>,
) {
  const existentes = lerConsumosCoresOc(db, empresaId, ordemCorteId);
  const baixados = new Set(
    existentes.filter((item) => item.movimento_id).map((item) => chaveCor(item.cor)),
  );
  const upsert = db.prepare(
    `INSERT INTO ordem_corte_consumo_cores (
       empresa_id, ordem_corte_id, cor, cor_chave, camadas, peso_folha, consumo_total, unidade
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(empresa_id, ordem_corte_id, cor_chave) DO UPDATE SET
       cor = excluded.cor,
       camadas = excluded.camadas,
       peso_folha = excluded.peso_folha,
       consumo_total = excluded.consumo_total,
       unidade = excluded.unidade
     WHERE ordem_corte_consumo_cores.movimento_id IS NULL`,
  );
  for (const item of itens) {
    const cor = item.cor.trim();
    if (!cor || baixados.has(chaveCor(cor))) continue;
    const camadas = Math.max(0, Math.floor(Number(item.camadas) || 0));
    const peso = Number(item.peso_folha) > 0 ? Number(item.peso_folha) : 0;
    const consumo = consumoTotalPorCor(camadas, peso) || Number(item.consumo_total) || 0;
    upsert.run(
      empresaId,
      ordemCorteId,
      cor,
      chaveCor(cor),
      camadas,
      peso,
      consumo,
      (item.unidade || 'KG').trim() || 'KG',
    );
  }
}

export function baixarConsumosCoresOc(
  db: AppDatabase,
  empresaId: number,
  ordemId: number,
  ordemCorteId: number,
  codigoOc: string,
  materiaPrimaId: number,
  usuarioId: number | null,
): Array<{
  cor: string;
  quantidade: number;
  unidade: string;
  movimento_id: number | null;
  baixou: boolean;
  saldo_anterior: number;
  saldo_posterior: number;
}> {
  const materia = db
    .prepare(
      `SELECT id, nome, unidade, tipo, status FROM materias_primas
        WHERE id = ? AND empresa_id = ?`,
    )
    .get(materiaPrimaId, empresaId) as
    | { id: number; nome: string; unidade: string; tipo: string; status: string }
    | undefined;
  if (!materia || materia.status !== 'ativo' || (materia.tipo !== 'tecido' && materia.tipo !== 'forro')) {
    throw Object.assign(new Error('Tecido não encontrado'), { status: 400 });
  }

  const linhas = db
    .prepare(
      `SELECT id, cor, camadas, peso_folha, consumo_total, unidade, movimento_id
         FROM ordem_corte_consumo_cores
        WHERE empresa_id = ? AND ordem_corte_id = ?
        ORDER BY id ASC`,
    )
    .all(empresaId, ordemCorteId) as Array<{
    id: number;
    cor: string;
    camadas: number;
    peso_folha: number;
    consumo_total: number;
    unidade: string;
    movimento_id: number | null;
  }>;

  const resultados: Array<{
    cor: string;
    quantidade: number;
    unidade: string;
    movimento_id: number | null;
    baixou: boolean;
    saldo_anterior: number;
    saldo_posterior: number;
  }> = [];

  const marcar = db.prepare(
    `UPDATE ordem_corte_consumo_cores
        SET movimento_id = ?, baixado_em = datetime('now'), baixado_por = ?, consumo_total = ?, unidade = ?
      WHERE id = ? AND empresa_id = ? AND movimento_id IS NULL`,
  );

  for (const linha of linhas) {
    const quantidade = consumoTotalPorCor(linha.camadas, linha.peso_folha) || Number(linha.consumo_total) || 0;
    if (!(quantidade > 0)) continue;
    if (linha.movimento_id) {
      resultados.push({
        cor: linha.cor,
        quantidade,
        unidade: linha.unidade || materia.unidade,
        movimento_id: linha.movimento_id,
        baixou: false,
        saldo_anterior: 0,
        saldo_posterior: 0,
      });
      continue;
    }

    const saldoAtual = db
      .prepare(
        `SELECT quantidade FROM estoque_saldos
          WHERE empresa_id = ? AND tipo = 'materia' AND materia_prima_id = ?`,
      )
      .get(empresaId, materia.id) as { quantidade: number } | undefined;
    const saldoAnterior = Number(saldoAtual?.quantidade) || 0;
    const saldoPosterior = saldoAnterior - quantidade;
    const observacoes = `OC ${codigoOc} · ${linha.cor} · ${linha.camadas} camadas × ${linha.peso_folha} ${materia.unidade}/folha = ${quantidade} ${materia.unidade}${
      saldoPosterior < 0 ? ` · estoque insuficiente (saldo ${saldoAnterior} → ${saldoPosterior})` : ''
    }`;
    const movimento = registrarMovimentoEstoque(db, empresaId, {
      tipo: 'saida',
      quantidade,
      materia_prima_id: materia.id,
      motivo: `Corte ${codigoOc} · ${linha.cor}`,
      observacoes,
      permitir_saldo_negativo: true,
    });
    if (!movimento.ok) throw Object.assign(new Error(movimento.erro), { status: movimento.status });
    marcar.run(movimento.movimentoId, usuarioId, quantidade, materia.unidade, linha.id, empresaId);
    resultados.push({
      cor: linha.cor,
      quantidade,
      unidade: materia.unidade,
      movimento_id: movimento.movimentoId,
      baixou: true,
      saldo_anterior: saldoAnterior,
      saldo_posterior: saldoPosterior,
    });
  }

  const soma = resultados.reduce((acc, item) => acc + item.quantidade, 0);
  if (soma > 0) {
    const requisito = db
      .prepare(
        `SELECT id, movimento_id FROM ordem_requisitos
          WHERE empresa_id = ? AND ordem_id = ? AND materia_prima_id = ?
          ORDER BY id ASC`,
      )
      .all(empresaId, ordemId, materia.id) as Array<{ id: number; movimento_id: number | null }>;
    const primeiroMovimento = resultados.find((item) => item.movimento_id)?.movimento_id ?? null;
    if (requisito.length === 0 && primeiroMovimento) {
      db.prepare(
        `INSERT INTO ordem_requisitos (
           empresa_id, ordem_id, materia_prima_id, quantidade_unitaria, quantidade_total, unidade, movimento_id
         ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      ).run(empresaId, ordemId, materia.id, soma, soma, materia.unidade, primeiroMovimento);
    } else if (requisito.length > 0) {
      db.prepare(
        `UPDATE ordem_requisitos SET quantidade_total = ?, movimento_id = COALESCE(movimento_id, ?)
          WHERE id = ? AND empresa_id = ?`,
      ).run(soma, primeiroMovimento, requisito[0].id, empresaId);
    }
  }

  return resultados;
}
