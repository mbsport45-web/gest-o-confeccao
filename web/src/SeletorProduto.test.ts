import { describe, expect, it } from 'vitest';
import {
  filtrarProdutos,
  nomeComparavel,
  produtoPeloNome,
  textoProduto,
} from './SeletorProduto';

const catalogo = [
  { id: 1, nome: 'Bermuda', referencia: '10234', sku: '10234' },
  { id: 2, nome: 'Camiseta', referencia: null, sku: null },
  { id: 3, nome: 'Camiseta com trançador', referencia: '200', sku: '200' },
  { id: 4, nome: 'Regata', referencia: '77', sku: '77' },
];

describe('seletor de produtos da OP', () => {
  it('pesquisa por nome e por referência', () => {
    expect(filtrarProdutos(catalogo, 'cam').map((item) => item.nome)).toEqual([
      'Camiseta',
      'Camiseta com trançador',
    ]);
    expect(filtrarProdutos(catalogo, '10234').map((item) => item.id)).toEqual([1]);
    expect(filtrarProdutos(catalogo, '').map((item) => item.nome)).toEqual([
      'Bermuda',
      'Camiseta',
      'Camiseta com trançador',
      'Regata',
    ]);
  });

  it('reaproveita o produto já cadastrado pelo nome', () => {
    expect(produtoPeloNome(catalogo, ' bermuda ')?.id).toBe(1);
    expect(produtoPeloNome(catalogo, 'Camiseta com trançador')?.id).toBe(3);
    expect(produtoPeloNome(catalogo, 'Manga longa')).toBeUndefined();
    expect(nomeComparavel('  Manga   longa ')).toBe('manga longa');
  });

  it('mostra o nome separado da referência', () => {
    expect(textoProduto(catalogo[0])).toBe('Bermuda · 10234');
    expect(textoProduto(catalogo[1])).toBe('Camiseta');
  });
});
