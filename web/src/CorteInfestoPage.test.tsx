import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./api', async () => {
  const actual = await vi.importActual<typeof import('./api')>('./api');
  return {
    ...actual,
    listarOrdens: vi.fn(),
    listarCortesInfesto: vi.fn(),
    listarMateriasPrimas: vi.fn(),
    obterOrdem: vi.fn(),
    concluirCorteInfesto: vi.fn(),
  };
});

import {
  concluirCorteInfesto,
  listarCortesInfesto,
  listarMateriasPrimas,
  listarOrdens,
  obterOrdem,
} from './api';
import { CorteInfestoPage } from './CorteInfestoPage';

const ordens = vi.mocked(listarOrdens);
const cortes = vi.mocked(listarCortesInfesto);
const materias = vi.mocked(listarMateriasPrimas);
const obter = vi.mocked(obterOrdem);
const concluir = vi.mocked(concluirCorteInfesto);

describe('tela Corte / Infesto', () => {
  afterEach(() => cleanup());

  beforeEach(() => {
    ordens.mockResolvedValue([
      {
        id: 4,
        codigo: 'OP-0004',
        cliente: 'Loja Norte',
        produto: 'Bermuda',
        tamanho: 'M',
        quantidade: 6,
        status: 'planejada',
        prioridade: 'normal',
        data_prevista: null,
        observacoes: null,
        responsavel: null,
        cliente_id: null,
        produto_id: null,
        variante_id: null,
        criado_em: '',
        atualizado_em: null,
      },
    ]);
    cortes.mockResolvedValue([]);
    materias.mockResolvedValue({
      data: [
        {
          id: 2,
          codigo: 'MALHA',
          nome: 'Malha dry',
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
          fornecedor: null,
          referencia_fornecedor: null,
          ncm: null,
          status: 'ativo',
          observacoes: null,
          criado_em: '',
          atualizado_em: '',
        },
      ],
      pagina: 1,
      por_pagina: 100,
      total: 1,
      total_paginas: 1,
    });
    obter.mockResolvedValue({
      id: 4,
      codigo: 'OP-0004',
      cliente: 'Loja Norte',
      produto: 'Bermuda',
      tamanho: 'M, G',
      quantidade: 6,
      status: 'planejada',
      prioridade: 'normal',
      data_prevista: null,
      observacoes: null,
      responsavel: null,
      cliente_id: null,
      produto_id: null,
      variante_id: null,
      criado_em: '',
      atualizado_em: null,
      grade: [
        { cor: 'Preto', tamanho: 'M', quantidade: 4 },
        { cor: 'Branco', tamanho: 'M', quantidade: 2 },
      ],
      requisitos: [],
    });
  });

  it('lista a ordem e conclui o corte com as duas cores disponíveis na grade', async () => {
    concluir.mockResolvedValue({
      id: 1,
      ordem_id: 4,
      materia_prima_id: 2,
      cor: 'Preto',
      quantidade_pecas: 4,
      camadas: 10,
      metragem: 8,
      peso_real: 1.2,
      quantidade_baixada: 1.2,
      unidade_baixa: 'KG',
      movimento_id: 9,
      concluido_em: '',
      tecido: 'Malha dry',
      unidade: 'KG',
      ordem_codigo: 'OP-0004',
      cliente: 'Loja Norte',
      produto: 'Bermuda',
      status_ordem: 'costura',
    });
    ordens.mockResolvedValueOnce([
      {
        id: 4,
        codigo: 'OP-0004',
        cliente: 'Loja Norte',
        produto: 'Bermuda',
        tamanho: 'M',
        quantidade: 6,
        status: 'planejada',
        prioridade: 'normal',
        data_prevista: null,
        observacoes: null,
        responsavel: null,
        cliente_id: null,
        produto_id: null,
        variante_id: null,
        criado_em: '',
        atualizado_em: null,
      },
    ]);

    render(<CorteInfestoPage />);
    expect(await screen.findByText('OP-0004')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Executar corte' }));
    expect(await screen.findByLabelText('Cor do corte')).toBeTruthy();
    expect(screen.getByRole('option', { name: 'Preto' })).toBeTruthy();
    expect(screen.getByRole('option', { name: 'Branco' })).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Camadas do enfesto'), { target: { value: '10' } });
    fireEvent.change(screen.getByLabelText('Metragem'), { target: { value: '8' } });
    fireEvent.change(screen.getByLabelText('Peso real consumido'), { target: { value: '1.2' } });
    fireEvent.click(screen.getByRole('button', { name: 'Concluir corte' }));

    await waitFor(() =>
      expect(concluir).toHaveBeenCalledWith(4, {
        materia_prima_id: 2,
        cor: 'Preto',
        quantidade_pecas: 4,
        camadas: 10,
        metragem: 8,
        peso_real: 1.2,
      }),
    );
  });
});
