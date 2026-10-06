import { describe, expect, it } from 'vitest';
import type { ProdutoVariante } from './api';
import { distribuicaoFechaOp, eixosDasVariantes, filtrarOpcoes } from './DistribuicaoCorte';

function variante(id: number, cor: string, tamanho: string): ProdutoVariante {
  return {
    id,
    produto_id: 1,
    cor,
    tamanho,
    sku: `${cor}-${tamanho}`,
    codigo_barras: null,
    preco_venda: null,
    preco_atacado: null,
    preco_custo: null,
    estoque_minimo: null,
    status: 'ativo',
    criado_em: '',
    atualizado_em: '',
  };
}

describe('eixos da distribuição de corte', () => {
  const cores = ['Preto', 'Branco', 'Azul', 'Vermelho', 'Verde', 'Cinza', 'Marinho'];
  const tamanhos = ['G1', 'G2', 'G3'];
  const variantes = cores.flatMap((cor, indiceCor) =>
    tamanhos.map((tamanho, indiceTamanho) =>
      variante(indiceCor * 10 + indiceTamanho + 1, cor, tamanho),
    ),
  );

  it('preserva a ordem cadastrada, inclusive G1, G2 e G3', () => {
    const eixos = eixosDasVariantes(variantes, cores, tamanhos);
    expect(eixos.cores).toEqual(cores);
    expect(eixos.tamanhos).toEqual(['G1', 'G2', 'G3']);
  });

  it('encontra qualquer cor cadastrada pela pesquisa', () => {
    const eixos = eixosDasVariantes(variantes, cores, tamanhos);
    expect(filtrarOpcoes(eixos.cores, 'verm')).toEqual(['Vermelho']);
    expect(filtrarOpcoes(eixos.tamanhos, 'g2')).toEqual(['G2']);
  });

  it('só libera a OP quando a grade fecha a quantidade, com cor e tamanho escolhidos', () => {
    expect(distribuicaoFechaOp(150, 150, 2, 4)).toBe(true);
    expect(distribuicaoFechaOp(150, 149, 2, 4)).toBe(false);
    expect(distribuicaoFechaOp(150, 150, 0, 4)).toBe(false);
    expect(distribuicaoFechaOp(150, 150, 2, 0)).toBe(false);
    expect(filtrarOpcoes(Array.from({ length: 21 }, (_, i) => `Cor ${i + 1}`), 'cor 21')).toEqual([
      'Cor 21',
    ]);
  });
});
