import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./api', async () => {
  const actual = await vi.importActual<typeof import('./api')>('./api');
  return {
    ...actual,
    listarPedidos: vi.fn(),
    obterPedido: vi.fn(),
    listarClientes: vi.fn(),
    listarProdutos: vi.fn(),
    atualizarPedido: vi.fn(),
    gerarOpPedido: vi.fn(),
  };
});

import {
  atualizarPedido,
  gerarOpPedido,
  listarClientes,
  listarPedidos,
  listarProdutos,
  obterPedido,
  type PedidoVenda,
} from './api';
import { PedidosPage } from './PedidosPage';

const listar = vi.mocked(listarPedidos);
const obter = vi.mocked(obterPedido);
const atualizar = vi.mocked(atualizarPedido);
const gerarOp = vi.mocked(gerarOpPedido);

const sessao = { assinatura: { acesso: { operacional: true }, uso: {} } as never };

function pedido(dados: Partial<PedidoVenda> & Pick<PedidoVenda, 'id' | 'codigo'>): PedidoVenda {
  return {
    cliente_id: 1,
    cliente: 'Loja Centro',
    data_pedido: '2026-10-10',
    data_prevista: null,
    status: 'pronto',
    prioridade: 'normal',
    observacoes: null,
    subtotal: 480,
    desconto: 0,
    frete: 0,
    total: 480,
    criado_em: '2026-10-10 10:00:00',
    atualizado_em: '2026-10-10 10:00:00',
    produtos: 'Camisa',
    quantidade: 6,
    expedicao_status: null,
    itens: [],
    ordens: [],
    financeiro: null,
    ...dados,
  };
}

function lista(data: PedidoVenda[]) {
  return { data, pagina: 1, por_pagina: 10, total: data.length, total_paginas: 1, totais: { valor: 0, quantidade: 0 } };
}

const expedido = pedido({ id: 1, codigo: 'PV-0001', expedicao_status: 'expedido' });
const faturadoExpedido = pedido({ id: 2, codigo: 'PV-0002', status: 'faturado', expedicao_status: 'expedido' });
const prontoParaEnvio = pedido({ id: 3, codigo: 'PV-0003', expedicao_status: 'pronto_envio' });
const semExpedicao = pedido({ id: 4, codigo: 'PV-0004' });
const faturadoSemExpedicao = pedido({ id: 5, codigo: 'PV-0005', status: 'faturado', expedicao_status: null });

async function linha(codigo: string) {
  const celula = await screen.findByRole('cell', { name: codigo });
  return within(celula.closest('tr') as HTMLElement);
}

async function painel(codigo: string) {
  const titulo = await screen.findByRole('heading', { name: codigo });
  return within(titulo.closest('section') as HTMLElement);
}

describe('PedidosPage', () => {
  afterEach(() => cleanup());

  beforeEach(() => {
    listar.mockReset();
    obter.mockReset();
    atualizar.mockReset();
    gerarOp.mockReset();
    vi.mocked(listarClientes).mockResolvedValue({ data: [], pagina: 1, por_pagina: 100, total: 0, total_paginas: 1 });
    vi.mocked(listarProdutos).mockResolvedValue({ data: [], pagina: 1, por_pagina: 100, total: 0, total_paginas: 1 });
  });

  it('esconde "Cancelar" na lista para pedido já expedido e mantém para quem ainda não saiu', async () => {
    listar.mockResolvedValue(lista([expedido, faturadoExpedido, prontoParaEnvio, semExpedicao]));
    atualizar.mockResolvedValue({ ...semExpedicao, status: 'cancelado' });
    render(<PedidosPage sessao={sessao} />);

    expect((await linha('PV-0001')).queryByRole('button', { name: 'Cancelar' })).toBeNull();
    expect((await linha('PV-0002')).queryByRole('button', { name: 'Cancelar' })).toBeNull();
    expect((await linha('PV-0003')).getByRole('button', { name: 'Cancelar' })).toBeTruthy();

    fireEvent.click((await linha('PV-0004')).getByRole('button', { name: 'Cancelar' }));
    await waitFor(() => expect(atualizar).toHaveBeenCalledWith(4, { status: 'cancelado' }));
    expect(atualizar).toHaveBeenCalledTimes(1);
  });

  it('no detalhe do pedido já expedido não oferece "Cancelar" nem "Gerar OP"', async () => {
    listar.mockResolvedValue(lista([expedido, prontoParaEnvio]));
    obter.mockImplementation(async (id) => (id === expedido.id ? expedido : prontoParaEnvio));
    gerarOp.mockResolvedValue(prontoParaEnvio);
    render(<PedidosPage sessao={sessao} />);

    fireEvent.click((await linha('PV-0001')).getByRole('button', { name: 'Ver' }));
    const saiu = await painel('PV-0001');
    expect(saiu.queryByRole('button', { name: 'Cancelar' })).toBeNull();
    expect(saiu.queryByRole('button', { name: 'Gerar OP' })).toBeNull();

    fireEvent.click((await linha('PV-0003')).getByRole('button', { name: 'Ver' }));
    const aguardando = await painel('PV-0003');
    expect(aguardando.getByRole('button', { name: 'Cancelar' })).toBeTruthy();
    fireEvent.click(aguardando.getByRole('button', { name: 'Gerar OP' }));
    await waitFor(() => expect(gerarOp).toHaveBeenCalledWith(3));
    expect(atualizar).not.toHaveBeenCalled();
  });

  it('pedido pronto para envio cancelado passa a aparecer como Cancelado, sem ações de saída', async () => {
    const cancelado = pedido({ id: 3, codigo: 'PV-0003', status: 'cancelado', expedicao_status: null });
    listar.mockResolvedValueOnce(lista([prontoParaEnvio])).mockResolvedValue(lista([cancelado]));
    obter.mockResolvedValue(prontoParaEnvio);
    atualizar.mockResolvedValue(cancelado);
    render(<PedidosPage sessao={sessao} />);

    fireEvent.click((await linha('PV-0003')).getByRole('button', { name: 'Ver' }));
    fireEvent.click((await painel('PV-0003')).getByRole('button', { name: 'Cancelar' }));
    await waitFor(() => expect(atualizar).toHaveBeenCalledWith(3, { status: 'cancelado' }));

    await waitFor(() => {
      const celula = screen.getByRole('cell', { name: 'PV-0003' });
      expect(within(celula.closest('tr') as HTMLElement).getByText('Cancelado')).toBeTruthy();
    });
    expect((await linha('PV-0003')).queryByRole('button', { name: 'Cancelar' })).toBeNull();
    const painelCancelado = await painel('PV-0003');
    expect(painelCancelado.getByText('Cancelado')).toBeTruthy();
    expect(painelCancelado.queryByRole('button', { name: 'Cancelar' })).toBeNull();
    expect(painelCancelado.queryByRole('button', { name: 'Gerar OP' })).toBeNull();
  });

  it('esconde "Cancelar" para pedido faturado ainda não expedido e explica no detalhe', async () => {
    listar.mockResolvedValue(lista([faturadoSemExpedicao, semExpedicao]));
    obter.mockImplementation(async (id) => (id === faturadoSemExpedicao.id ? faturadoSemExpedicao : semExpedicao));
    atualizar.mockResolvedValue({ ...semExpedicao, status: 'cancelado' });
    render(<PedidosPage sessao={sessao} />);

    expect((await linha('PV-0005')).queryByRole('button', { name: 'Cancelar' })).toBeNull();
    expect((await linha('PV-0004')).getByRole('button', { name: 'Cancelar' })).toBeTruthy();

    fireEvent.click((await linha('PV-0005')).getByRole('button', { name: 'Ver' }));
    const faturado = await painel('PV-0005');
    expect(faturado.queryByRole('button', { name: 'Cancelar' })).toBeNull();
    expect(faturado.getByText('Pedido faturado não pode ser cancelado. Só é possível registrar a entrega.')).toBeTruthy();
    expect(atualizar).not.toHaveBeenCalled();

    fireEvent.click((await linha('PV-0004')).getByRole('button', { name: 'Ver' }));
    const elegivel = await painel('PV-0004');
    expect(elegivel.queryByText(/Pedido faturado não pode ser cancelado/)).toBeNull();
    fireEvent.click(elegivel.getByRole('button', { name: 'Cancelar' }));
    await waitFor(() => expect(atualizar).toHaveBeenCalledWith(4, { status: 'cancelado' }));
    expect(atualizar).toHaveBeenCalledTimes(1);
  });
});
