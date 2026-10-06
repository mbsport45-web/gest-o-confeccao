import { describe, expect, it } from 'vitest';
import type { ProdutoVariante } from './api';
import {
  atualizarQuantidadeGrade,
  colunasDaGrade,
  distribuicaoFechaOp,
  eixosDasVariantes,
  filtrarOpcoes,
  gradeDaCorFecha,
  ordenarTamanhos,
  somaQuantidades,
} from './DistribuicaoCorte';

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

describe('grade editável do enfesto', () => {
  it('mostra P, M, G e GG nessa ordem, independente do cadastro', () => {
    expect(ordenarTamanhos(['GG', 'G', 'M', 'P'])).toEqual(['P', 'M', 'G', 'GG']);
    expect(ordenarTamanhos(['G3', 'GG', 'P', 'G1', 'G2', 'G10'])).toEqual([
      'P',
      'GG',
      'G1',
      'G2',
      'G3',
      'G10',
    ]);
    expect(ordenarTamanhos(['gg', 'p'])).toEqual(['p', 'gg']);
    expect(
      colunasDaGrade([
        { tamanhos: [{ tamanho: 'GG' }, { tamanho: 'P' }] },
        { tamanhos: [{ tamanho: 'G1' }, { tamanho: 'M' }] },
      ]),
    ).toEqual(['P', 'M', 'GG', 'G1']);
  });

  it('recalcula o total da cor e aponta divergência com a quantidade planejada', () => {
    const inicial = [
      { tamanho: 'P', quantidade: 10 },
      { tamanho: 'M', quantidade: 20 },
      { tamanho: 'G', quantidade: 25 },
      { tamanho: 'GG', quantidade: 20 },
    ];
    expect(somaQuantidades(inicial)).toBe(75);
    expect(gradeDaCorFecha(inicial, 75)).toBe(true);

    const divergente = atualizarQuantidadeGrade(inicial, 'M', 30);
    expect(divergente.find((item) => item.tamanho === 'M')?.quantidade).toBe(30);
    expect(divergente.find((item) => item.tamanho === 'P')?.quantidade).toBe(10);
    expect(somaQuantidades(divergente)).toBe(85);
    expect(gradeDaCorFecha(divergente, 75)).toBe(false);

    const ajustada = atualizarQuantidadeGrade(divergente, 'G', 15);
    expect(somaQuantidades(ajustada)).toBe(75);
    expect(gradeDaCorFecha(ajustada, 75)).toBe(true);
    expect(gradeDaCorFecha([], 12)).toBe(true);
  });
});
