import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./api', async () => {
  const actual = await vi.importActual<typeof import('./api')>('./api');
  return {
    ...actual,
    listarExpedicao: vi.fn(),
    obterResumoExpedicao: vi.fn(),
    marcarProntoEnvio: vi.fn(),
    registrarExpedicao: vi.fn(),
    marcarEntrega: vi.fn(),
  };
});

import {
  listarExpedicao,
  obterResumoExpedicao,
  registrarExpedicao,
  type ExpedicaoItem,
  type ExpedicaoResumo,
} from './api';
import { ExpedicaoPage } from './ExpedicaoPage';

const listar = vi.mocked(listarExpedicao);
const resumo = vi.mocked(obterResumoExpedicao);
const registrar = vi.mocked(registrarExpedicao);

const prontoParaEnvio: ExpedicaoItem = {
  pedido_id: 3,
  codigo: 'PV-0003',
  cliente: 'Loja Centro',
  quantidade: 6,
  valor: 480,
  data_pedido: '2026-10-10',
  data_prevista: null,
  pedido_status: 'pronto',
  expedicao_id: 7,
  expedicao_status: 'pronto_envio',
  status: 'pronto_envio',
  data_pronta: '2026-10-18',
  data_expedicao: null,
  data_entrega: null,
  observacoes: null,
};

function lista(data: ExpedicaoItem[]) {
  return { data, pagina: 1, por_pagina: 10, total: data.length, total_paginas: 1 };
}

function indicadores(valores: Partial<ExpedicaoResumo>): ExpedicaoResumo {
  return { fila: 0, prontos_envio: 0, expedidos: 0, entregues: 0, ...valores };
}

function valorIndicador(rotulo: string) {
  const painel = within(screen.getByRole('region', { name: 'Indicadores de expedição' }));
  const card = painel.getByText(rotulo).closest('button') as HTMLElement;
  return card.querySelector('.kpi__valor')?.textContent;
}

describe('ExpedicaoPage', () => {
  afterEach(() => cleanup());

  beforeEach(() => {
    listar.mockReset();
    resumo.mockReset();
    registrar.mockReset();
  });

  it('tira da fila o pedido cancelado em outra tela quando o servidor recusa a saída', async () => {
    listar.mockResolvedValueOnce(lista([prontoParaEnvio])).mockResolvedValue(lista([]));
    resumo
      .mockResolvedValueOnce(indicadores({ fila: 1, prontos_envio: 1 }))
      .mockResolvedValue(indicadores({}));
    registrar.mockRejectedValue(new Error('Pedido cancelado não pode ser expedido'));
    render(<ExpedicaoPage />);

    const celula = await screen.findByRole('cell', { name: 'PV-0003' });
    const linha = within(celula.closest('tr') as HTMLElement);
    expect(linha.getByText('Pronto para envio')).toBeTruthy();
    expect(valorIndicador('Pronto para envio')).toBe('1');

    fireEvent.click(linha.getByRole('button', { name: 'Registrar expedição' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Confirmar saída' }));
    await waitFor(() => expect(registrar).toHaveBeenCalledWith(3, expect.anything()));

    await waitFor(() => expect(screen.queryByRole('cell', { name: 'PV-0003' })).toBeNull());
    expect(screen.getByText('Nenhum pedido nesta fila.')).toBeTruthy();
    expect(screen.getByText('Pedido cancelado não pode ser expedido')).toBeTruthy();
    expect(valorIndicador('Pronto para envio')).toBe('0');
    expect(valorIndicador('Fila de envio')).toBe('0');
  });

  it('trocar de fila ou recarregar não acumula pedido de Expedidos em Entregues', async () => {
    const expedido: ExpedicaoItem = {
      ...prontoParaEnvio,
      pedido_id: 1,
      codigo: 'PV-0001',
      expedicao_status: 'expedido',
      status: 'expedido',
      data_expedicao: '2026-10-19',
    };
    const entregue: ExpedicaoItem = {
      ...prontoParaEnvio,
      pedido_id: 2,
      codigo: 'PV-0002',
      pedido_status: 'entregue',
      expedicao_status: 'entregue',
      status: 'entregue',
      data_expedicao: '2026-10-18',
      data_entrega: '2026-10-19',
    };
    listar.mockImplementation(async (filtros = {}) => {
      if (filtros.fila === 'expedidos') return lista([expedido]);
      if (filtros.fila === 'entregues') return lista([entregue]);
      return lista([]);
    });
    resumo.mockResolvedValue(indicadores({ expedidos: 1, entregues: 1 }));
    render(<ExpedicaoPage />);

    const filas = await screen.findByLabelText('Filas de expedição');
    fireEvent.click(within(filas).getByRole('button', { name: 'Expedidos' }));
    expect(await screen.findByRole('cell', { name: 'PV-0001' })).toBeTruthy();
    expect(screen.queryByRole('cell', { name: 'PV-0002' })).toBeNull();

    fireEvent.click(within(filas).getByRole('button', { name: 'Entregues' }));
    expect(await screen.findByRole('cell', { name: 'PV-0002' })).toBeTruthy();
    expect(screen.queryByRole('cell', { name: 'PV-0001' })).toBeNull();
    expect(screen.getAllByRole('row')).toHaveLength(2);

    fireEvent.click(within(filas).getByRole('button', { name: 'Entregues' }));
    expect(await screen.findByRole('cell', { name: 'PV-0002' })).toBeTruthy();
    expect(screen.queryByRole('cell', { name: 'PV-0001' })).toBeNull();
    expect(screen.getAllByRole('row')).toHaveLength(2);
  });
});
