import { describe, expect, it } from 'vitest';
import {
  ETAPAS_LINHA,
  etapaLinhaProducao,
  filtrarOrdensDaEtapa,
  normalizarEtapaLinha,
} from './linhaProducao.js';

describe('filtro da linha de produção', () => {
  it('a consulta da aba não mistura nem duplica ordens de outro setor', () => {
    const ordens = [
      { id: 10, etapa_linha: 'corte' as const },
      { id: 11, etapa_linha: 'costura' as const },
      { id: 10, etapa_linha: 'corte' as const },
      { id: 4, etapa_linha: 'acabamento' as const },
      { id: 9, etapa_linha: 'estamparia' as const },
      { id: 3, etapa_linha: 'expedicao' as const },
    ];
    expect(filtrarOrdensDaEtapa(ordens, 'corte').map((item) => item.id)).toEqual([10]);
    expect(filtrarOrdensDaEtapa(ordens, 'costura').map((item) => item.id)).toEqual([11]);
    expect(filtrarOrdensDaEtapa(ordens, 'acabamento').map((item) => item.id)).toEqual([4]);
    expect(filtrarOrdensDaEtapa(ordens, 'estamparia').map((item) => item.id)).toEqual([9]);
    expect(filtrarOrdensDaEtapa(ordens, 'expedicao').map((item) => item.id)).toEqual([3]);
    expect(ETAPAS_LINHA).toEqual(['corte', 'costura', 'acabamento', 'estamparia', 'expedicao']);
  });

  it('avança a OP para o setor certo depois da mudança de etapa', () => {
    expect(etapaLinhaProducao('planejada', 'em_corte')).toBe('corte');
    expect(etapaLinhaProducao('corte', 'corte_concluido')).toBe('costura');
    expect(etapaLinhaProducao('costura')).toBe('costura');
    expect(etapaLinhaProducao('acabamento')).toBe('acabamento');
    expect(etapaLinhaProducao('qualidade')).toBe('estamparia');
    expect(etapaLinhaProducao('embalagem')).toBe('expedicao');
    expect(etapaLinhaProducao('costura', 'encaminhado')).toBe('costura');
    expect(etapaLinhaProducao('costura', 'entregue')).toBeNull();
    expect(etapaLinhaProducao('costura', 'expedicao')).toBeNull();
    expect(etapaLinhaProducao('costura', 'encaminhado', true)).toBeNull();
    expect(etapaLinhaProducao('concluida', 'encaminhado')).toBeNull();
    expect(etapaLinhaProducao('planejada')).toBeNull();
    expect(normalizarEtapaLinha('estampa')).toBe('estamparia');
    expect(normalizarEtapaLinha('planejada')).toBeNull();
  });
});
