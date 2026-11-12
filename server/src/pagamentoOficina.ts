import type { AppDatabase } from './db.js';
import { registrarHistoricoOrdemCorte } from './ordensGrade.js';

export const STATUS_PAGAMENTO_OFICINA = ['pendente', 'parcial', 'pago'] as const;
export type StatusPagamentoOficina = (typeof STATUS_PAGAMENTO_OFICINA)[number];

export type LancamentoPagamentoOficina = {
  id?: number;
  status: string;
  valor: number;
  valor_pago?: number | null;
  data_pagamento?: string | null;
  ordem_corte_id?: number | null;
  ordem_id?: number | null;
};

export type PagamentoOficinaLeitura = {
  lancamento_id: number | null;
  valor: number;
  valor_pago: number;
  saldo: number;
  status: StatusPagamentoOficina;
  data_pagamento: string | null;
};

export type ResumoPagamentosOficina = {
  total_pago: number;
  total_pendente: number;
  total_parcial: number;
  saldo_aberto: number;
};

function dinheiro(valor: number): number {
  return Math.round((valor + Number.EPSILON) * 100) / 100;
}

export function valorPagoEfetivo(lancamento: LancamentoPagamentoOficina): number {
  const total = Number(lancamento.valor) || 0;
  if (lancamento.status === 'pago' || lancamento.status === 'recebido') {
    return dinheiro(total);
  }
  const pago = Number(lancamento.valor_pago) || 0;
  if (pago <= 0) return 0;
  return dinheiro(Math.min(pago, total));
}

export function saldoPagamentoOficina(lancamento: LancamentoPagamentoOficina): number {
  const total = Number(lancamento.valor) || 0;
  return dinheiro(Math.max(total - valorPagoEfetivo(lancamento), 0));
}

export function statusPagamentoOficina(lancamento: LancamentoPagamentoOficina): StatusPagamentoOficina {
  const pago = valorPagoEfetivo(lancamento);
  const saldo = saldoPagamentoOficina(lancamento);
  if (saldo <= 0 && pago > 0) return 'pago';
  if (pago > 0 && saldo > 0) return 'parcial';
  return 'pendente';
}

export function montarPagamentoOficina(
  lancamento: LancamentoPagamentoOficina | null | undefined,
): PagamentoOficinaLeitura | null {
  if (!lancamento) return null;
  return {
    lancamento_id: lancamento.id ?? null,
    valor: dinheiro(Number(lancamento.valor) || 0),
    valor_pago: valorPagoEfetivo(lancamento),
    saldo: saldoPagamentoOficina(lancamento),
    status: statusPagamentoOficina(lancamento),
    data_pagamento: lancamento.data_pagamento ?? null,
  };
}

export function resumoPagamentosOficina(itens: PagamentoOficinaLeitura[]): ResumoPagamentosOficina {
  let totalPago = 0;
  let totalPendente = 0;
  let totalParcial = 0;
  let saldoAberto = 0;
  for (const item of itens) {
    if (item.status === 'pago') totalPago += item.valor_pago;
    else if (item.status === 'parcial') totalParcial += item.valor_pago;
    else totalPendente += item.valor;
    saldoAberto += item.saldo;
  }
  return {
    total_pago: dinheiro(totalPago),
    total_pendente: dinheiro(totalPendente),
    total_parcial: dinheiro(totalParcial),
    saldo_aberto: dinheiro(saldoAberto),
  };
}

export function lerLancamentoOficina(
  db: AppDatabase,
  empresaId: number,
  ordemCorteId: number,
): LancamentoPagamentoOficina | undefined {
  return db
    .prepare(
      `SELECT id, status, valor, valor_pago, data_pagamento, ordem_corte_id, ordem_id
         FROM financeiro_lancamentos
        WHERE empresa_id = ? AND ordem_corte_id = ? AND tipo = 'pagar'
        ORDER BY id ASC LIMIT 1`,
    )
    .get(empresaId, ordemCorteId) as LancamentoPagamentoOficina | undefined;
}

export function pagamentoDaOc(
  db: AppDatabase,
  empresaId: number,
  ordemCorteId: number,
): PagamentoOficinaLeitura | null {
  return montarPagamentoOficina(lerLancamentoOficina(db, empresaId, ordemCorteId));
}

export function registrarEventoLancamento(
  db: AppDatabase,
  empresaId: number,
  lancamentoId: number,
  usuarioId: number | null,
  acao: string,
  valor: number,
  saldo: number,
  resumo: string,
  payload: unknown,
) {
  db.prepare(
    `INSERT INTO financeiro_lancamento_eventos (
       empresa_id, lancamento_id, usuario_id, acao, valor, saldo, resumo, payload
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(empresaId, lancamentoId, usuarioId, acao, valor, saldo, resumo, JSON.stringify(payload ?? {}));
}

export function registrarHistoricoPagamentoOc(
  db: AppDatabase,
  empresaId: number,
  lancamento: LancamentoPagamentoOficina,
  usuarioId: number | null,
  acao: string,
  resumo: string,
  payload: unknown,
) {
  if (!lancamento.ordem_corte_id) return;
  registrarHistoricoOrdemCorte(
    db,
    empresaId,
    lancamento.ordem_corte_id,
    usuarioId,
    acao,
    resumo,
    payload,
  );
}
