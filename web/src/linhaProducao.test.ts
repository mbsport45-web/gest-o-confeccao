import { describe, expect, it } from 'vitest';
import {
  ETAPAS_LINHA,
  etapaLinhaProducao,
  filtrarOrdensDaEtapa,
  normalizarEtapaLinha,
} from './linhaProducao';

describe('etapa da linha de produção', () => {
  it('não lista planejada sem OC enviada', () => {
    expect(etapaLinhaProducao('planejada')).toBeNull();
    expect(etapaLinhaProducao('planejada', 'em_preenchimento')).toBeNull();
    expect(etapaLinhaProducao('pendente')).toBeNull();
  });

  it('mostra OC enviada ao enfesto como corte em andamento', () => {
    expect(etapaLinhaProducao('planejada', 'aguardando_enfesto')).toBe('corte');
    expect(etapaLinhaProducao('planejada', 'em_enfesto')).toBe('corte');
    expect(etapaLinhaProducao('planejada', 'em_corte')).toBe('corte');
    expect(etapaLinhaProducao('corte', 'aguardando_enfesto')).toBe('corte');
  });

  it('coloca cada status de andamento na etapa certa e tira entregues', () => {
    expect(etapaLinhaProducao('planejada', 'corte_concluido')).toBe('costura');
    expect(etapaLinhaProducao('corte', 'corte_concluido')).toBe('costura');
    expect(etapaLinhaProducao('costura')).toBe('costura');
    expect(etapaLinhaProducao('qualidade')).toBe('estamparia');
    expect(etapaLinhaProducao('acabamento')).toBe('acabamento');
    expect(etapaLinhaProducao('embalagem')).toBe('expedicao');
    expect(etapaLinhaProducao('concluida')).toBeNull();
    expect(etapaLinhaProducao('cancelada', 'aguardando_enfesto')).toBeNull();
    expect(etapaLinhaProducao('costura', 'encaminhado')).toBe('costura');
    expect(etapaLinhaProducao('costura', 'entregue')).toBeNull();
    expect(etapaLinhaProducao('costura', 'expedicao')).toBeNull();
    expect(etapaLinhaProducao('costura', 'encaminhado', true)).toBeNull();
    expect(etapaLinhaProducao('planejada')).toBeNull();
  });

  it('nunca coloca a mesma OP em duas etapas', () => {
    const casos: Array<[string, string | null]> = [
      ['planejada', null],
      ['planejada', 'em_preenchimento'],
      ['planejada', 'aguardando_enfesto'],
      ['corte', 'em_corte'],
      ['corte', 'corte_concluido'],
      ['costura', 'corte_concluido'],
      ['qualidade', null],
      ['acabamento', null],
      ['embalagem', null],
      ['concluida', 'encaminhado'],
    ];
    for (const [status, oc] of casos) {
      const etapa = etapaLinhaProducao(status, oc);
      if (etapa) expect(ETAPAS_LINHA).toContain(etapa);
    }
  });

  it('não conta de novo a OP só porque existe ficha de corte', () => {
    const ops = [
      { id: 1, status: 'planejada', oc: null },
      { id: 2, status: 'planejada', oc: 'em_corte' },
      { id: 2, status: 'planejada', oc: 'em_corte' },
      { id: 3, status: 'concluida', oc: 'encaminhado' },
      { id: 4, status: 'costura', oc: 'corte_concluido' },
    ];
    const vistos = new Set<number>();
    const andamento: Array<{ id: number; etapa: string }> = [];
    let entregues = 0;
    for (const op of ops) {
      if (vistos.has(op.id)) continue;
      vistos.add(op.id);
      if (op.status === 'concluida') entregues += 1;
      const etapa = etapaLinhaProducao(op.status, op.oc);
      if (etapa) andamento.push({ id: op.id, etapa });
    }
    expect(vistos.size).toBe(4);
    expect(andamento.map((item) => item.id)).toEqual([2, 4]);
    expect(andamento.map((item) => item.etapa)).toEqual(['corte', 'costura']);
    expect(entregues).toBe(1);
  });

  it('filtra a aba para não misturar setores nem duplicar OP', () => {
    const ordens = [
      { id: 10, etapa_linha: 'corte' },
      { id: 11, etapa_linha: 'costura' },
      { id: 10, etapa_linha: 'corte' },
      { id: 4, etapa_linha: 'acabamento' },
      { id: 9, etapa_linha: 'estamparia' },
      { id: 3, etapa_linha: 'expedicao' },
    ];
    expect(filtrarOrdensDaEtapa(ordens, 'corte').map((item) => item.id)).toEqual([10]);
    expect(filtrarOrdensDaEtapa(ordens, 'costura').map((item) => item.id)).toEqual([11]);
    expect(filtrarOrdensDaEtapa(ordens, 'acabamento').map((item) => item.id)).toEqual([4]);
    expect(filtrarOrdensDaEtapa(ordens, 'estamparia').map((item) => item.id)).toEqual([9]);
    expect(filtrarOrdensDaEtapa(ordens, 'expedicao').map((item) => item.id)).toEqual([3]);
    expect(ETAPAS_LINHA).toEqual(['corte', 'costura', 'acabamento', 'estamparia', 'expedicao']);
  });

  it('aceita os nomes das abas na consulta', () => {
    expect(normalizarEtapaLinha('corte')).toBe('corte');
    expect(normalizarEtapaLinha('Costura')).toBe('costura');
    expect(normalizarEtapaLinha('acabamento')).toBe('acabamento');
    expect(normalizarEtapaLinha('estampa')).toBe('estamparia');
    expect(normalizarEtapaLinha('estamparia')).toBe('estamparia');
    expect(normalizarEtapaLinha('expedição')).toBe('expedicao');
    expect(normalizarEtapaLinha('planejada')).toBeNull();
  });
});
