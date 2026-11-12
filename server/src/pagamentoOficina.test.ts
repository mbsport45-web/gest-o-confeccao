import { describe, expect, it } from 'vitest';
import {
  montarPagamentoOficina,
  resumoPagamentosOficina,
  saldoPagamentoOficina,
  statusPagamentoOficina,
  valorPagoEfetivo,
} from './pagamentoOficina.js';

describe('status de pagamento da oficina', () => {
  it('trata conta já paga pelo status, sem exigir backfill de valor_pago', () => {
    const paga = { status: 'pago', valor: 240, valor_pago: 0, data_pagamento: '2026-11-08' };
    expect(valorPagoEfetivo(paga)).toBe(240);
    expect(saldoPagamentoOficina(paga)).toBe(0);
    expect(statusPagamentoOficina(paga)).toBe('pago');
    expect(montarPagamentoOficina(paga)?.status).toBe('pago');
  });

  it('calcula parcial e pendente sem misturar valores', () => {
    const parcial = { status: 'pendente', valor: 18, valor_pago: 10 };
    const pendente = { status: 'pendente', valor: 24, valor_pago: 0 };
    expect(statusPagamentoOficina(parcial)).toBe('parcial');
    expect(saldoPagamentoOficina(parcial)).toBe(8);
    expect(statusPagamentoOficina(pendente)).toBe('pendente');
    expect(resumoPagamentosOficina([montarPagamentoOficina(parcial)!, montarPagamentoOficina(pendente)!])).toEqual({
      total_pago: 0,
      total_pendente: 24,
      total_parcial: 10,
      saldo_aberto: 32,
    });
  });
});
