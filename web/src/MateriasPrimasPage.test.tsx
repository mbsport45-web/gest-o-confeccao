import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./api', async () => {
  const actual = await vi.importActual<typeof import('./api')>('./api');
  return {
    ...actual,
    listarMateriasPrimas: vi.fn(),
  };
});

import { listarMateriasPrimas, type MateriaPrima } from './api';
import { MateriasPrimasPage } from './MateriasPrimasPage';

const listar = vi.mocked(listarMateriasPrimas);

function materia(parcial: Partial<MateriaPrima> & Pick<MateriaPrima, 'id' | 'nome'>): MateriaPrima {
  return {
    codigo: null,
    descricao: null,
    tipo: 'tecido',
    categoria: null,
    cor: null,
    composicao: null,
    largura_cm: null,
    gramatura: null,
    unidade: 'KG',
    custo: 0,
    estoque_minimo: 0,
    estoque_atual: 0,
    fornecedor: null,
    referencia_fornecedor: null,
    ncm: null,
    status: 'ativo',
    observacoes: null,
    criado_em: '',
    atualizado_em: '',
    ...parcial,
  };
}

describe('listagem de matérias-primas', () => {
  afterEach(() => cleanup());

  beforeEach(() => {
    listar.mockResolvedValue({
      data: [
        materia({
          id: 1,
          codigo: 'MALHA-PRETO',
          nome: 'Malha Colorida',
          descricao: 'PV para polo',
          cor: 'Preto',
          unidade: 'KG',
          custo: 28.5,
          estoque_atual: 7.5,
        }),
        materia({
          id: 2,
          codigo: 'MALHA-BRANCO',
          nome: 'Malha Colorida',
          cor: 'Branco',
          unidade: 'KG',
          custo: 27,
          estoque_atual: 4,
        }),
        materia({
          id: 3,
          codigo: 'TELA-VERDE',
          nome: 'Tela Colorida',
          cor: 'Verde',
          unidade: 'MT',
          custo: 12.4,
          estoque_atual: 20,
        }),
      ],
      pagina: 1,
      por_pagina: 8,
      total: 3,
      total_paginas: 1,
    });
  });

  it('mostra referência, cor, unidade, estoque e custo de cada tecido', async () => {
    render(<MateriasPrimasPage sessao={{ assinatura: {} as never }} />);
    const tabela = await screen.findByRole('table', { name: 'Matérias-primas' });
    expect(within(tabela).getByText('Referência')).toBeTruthy();
    expect(within(tabela).getByText('Cor')).toBeTruthy();
    expect(within(tabela).getByText('Estoque')).toBeTruthy();

    expect(within(tabela).getByText('MALHA-PRETO')).toBeTruthy();
    expect(within(tabela).getByText('Malha Colorida · PV para polo')).toBeTruthy();
    expect(within(tabela).getByText('Preto')).toBeTruthy();
    expect(within(tabela).getByText('7,5 KG')).toBeTruthy();
    expect(within(tabela).getByText(/R\$ 28,50 \/ KG/)).toBeTruthy();

    expect(within(tabela).getByText('MALHA-BRANCO')).toBeTruthy();
    expect(within(tabela).getByText('Branco')).toBeTruthy();
    expect(within(tabela).getByText('4 KG')).toBeTruthy();

    expect(within(tabela).getByText('TELA-VERDE')).toBeTruthy();
    expect(within(tabela).getByText('Verde')).toBeTruthy();
    expect(within(tabela).getAllByText('MT').length).toBeGreaterThan(0);
    expect(within(tabela).getByText('20 MT')).toBeTruthy();
    expect(within(tabela).getByText(/R\$ 12,40 \/ MT/)).toBeTruthy();
  });
});
