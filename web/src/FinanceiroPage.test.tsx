import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./api', async () => {
  const actual = await vi.importActual<typeof import('./api')>('./api');
  return {
    ...actual,
    obterResumoFinanceiro: vi.fn(),
    listarLancamentos: vi.fn(),
    listarCategoriasFinanceiro: vi.fn(),
    listarFornecedores: vi.fn(),
    listarClientes: vi.fn(),
    criarLancamento: vi.fn(),
    atualizarLancamento: vi.fn(),
  };
});

import {
  INDICADORES_CONTAS_PAGAR,
  atualizarLancamento,
  listarCategoriasFinanceiro,
  listarClientes,
  listarFornecedores,
  listarLancamentos,
  obterResumoFinanceiro,
  type FinanceiroLancamento,
  type FinanceiroResumo,
} from './api';
import { FinanceiroPage } from './FinanceiroPage';

const resumo = vi.mocked(obterResumoFinanceiro);
const listar = vi.mocked(listarLancamentos);
const categorias = vi.mocked(listarCategoriasFinanceiro);
const fornecedores = vi.mocked(listarFornecedores);
const clientes = vi.mocked(listarClientes);
const atualizar = vi.mocked(atualizarLancamento);

const aPagarZerado = Object.fromEntries(
  INDICADORES_CONTAS_PAGAR.map((item, indice) => [
    item.chave,
    { valor: 0, quantidade: 0, categoria_id: indice + 20 },
  ]),
) as FinanceiroResumo['a_pagar'];

const resumoBase: FinanceiroResumo = {
  saldo: 10,
  contas_pagar: 200,
  contas_receber: 80,
  vencidos: 0,
  previsto: -120,
  realizado: 10,
  realizado_pagar: 0,
  realizado_receber: 10,
  a_pagar: {
    ...aPagarZerado!,
    tecidos: { valor: 150, quantidade: 1, categoria_id: 20 },
  },
  fluxo: [],
  recentes: [],
};

const tecidoAberto: FinanceiroLancamento = {
  id: 9,
  tipo: 'pagar',
  categoria_id: 20,
  descricao: 'Malha PV',
  valor: 150,
  status: 'pendente',
  vencimento: '2099-04-10',
  data_pagamento: null,
  fornecedor_id: 1,
  cliente_id: null,
  compra_id: null,
  observacoes: null,
  categoria: 'Tecidos',
  fornecedor: 'Malharia Norte',
  cliente: null,
};

describe('indicadores de contas a pagar no Financeiro', () => {
  afterEach(() => cleanup());

  beforeEach(() => {
    resumo.mockReset();
    listar.mockReset();
    categorias.mockReset();
    fornecedores.mockReset();
    clientes.mockReset();
    atualizar.mockReset();
    categorias.mockResolvedValue({ data: [], total: 0 });
    fornecedores.mockResolvedValue({ data: [], total: 0, pagina: 1, por_pagina: 100, total_paginas: 1 });
    clientes.mockResolvedValue({ data: [], total: 0, pagina: 1, por_pagina: 100, total_paginas: 1 });
    resumo.mockResolvedValue(resumoBase);
    listar.mockImplementation(async (filtros) => {
      if (filtros.categoria_id === 20 && filtros.status === 'aberto') {
        return { data: [tecidoAberto], total: 1, pagina: 1, por_pagina: 100, total_paginas: 1 };
      }
      return { data: [], total: 0, pagina: 1, por_pagina: 10, total_paginas: 1 };
    });
    atualizar.mockResolvedValue({ ...tecidoAberto, status: 'pago' });
  });

  it('mostra os sete indicadores e lista só as contas em aberto da categoria', async () => {
    render(<FinanceiroPage />);
    const originais = await screen.findByLabelText('Indicadores financeiros');
    expect(within(originais).getByText('Saldo realizado')).toBeTruthy();
    expect(within(originais).getByText('Contas a pagar')).toBeTruthy();
    const extra = screen.getByLabelText('Contas a pagar por categoria');
    for (const item of INDICADORES_CONTAS_PAGAR) {
      expect(within(extra).getByLabelText(item.label)).toBeTruthy();
    }
    await waitFor(() => {
      expect(within(extra).getByLabelText('Tecidos a pagar').textContent).toMatch(/150/);
      expect(within(extra).getByLabelText('Tecidos a pagar').textContent).toMatch(/1 em aberto/);
      expect(within(extra).getByLabelText('IPTU a pagar').textContent).toMatch(/R\$\s*0,00/);
      expect(within(extra).getByLabelText('IPTU a pagar').textContent).toMatch(/0 em aberto/);
    });

    fireEvent.click(screen.getByLabelText('IPTU a pagar'));
    expect(await screen.findByText('Nenhuma conta em aberto nesta categoria.')).toBeTruthy();

    fireEvent.click(screen.getByLabelText('Tecidos a pagar'));
    const lista = await screen.findByLabelText('Lançamentos de Tecidos a pagar');
    await waitFor(() => {
      expect(within(lista).getByText('Descrição')).toBeTruthy();
    });
    expect(within(lista).getByText('Fornecedor / beneficiário')).toBeTruthy();
    expect(within(lista).getByText('Vencimento')).toBeTruthy();
    expect(within(lista).getByText('Valor')).toBeTruthy();
    expect(within(lista).getByText('Status')).toBeTruthy();
    const linha = within(lista).getByLabelText('Lançamento Malha PV');
    expect(within(linha).getByText('Malha PV')).toBeTruthy();
    expect(within(linha).getByText('Malharia Norte')).toBeTruthy();
    expect(within(linha).getByText('10/04/2099')).toBeTruthy();
    expect(within(linha).getByText(/R\$\s*150,00/)).toBeTruthy();
    expect(within(linha).getByText('Pendente')).toBeTruthy();

    resumo.mockResolvedValue({
      ...resumoBase,
      a_pagar: {
        ...resumoBase.a_pagar!,
        tecidos: { valor: 0, quantidade: 0, categoria_id: 20 },
      },
    });
    listar.mockImplementation(async (filtros) => {
      if (filtros.categoria_id === 20) {
        return { data: [], total: 0, pagina: 1, por_pagina: 100, total_paginas: 1 };
      }
      return { data: [], total: 0, pagina: 1, por_pagina: 10, total_paginas: 1 };
    });
    fireEvent.click(within(linha).getByRole('button', { name: 'Pagar' }));
    await waitFor(() => {
      expect(atualizar).toHaveBeenCalledWith(9, { status: 'pago' });
    });
    await waitFor(() => {
      expect(screen.getByLabelText('Tecidos a pagar').textContent).toMatch(/R\$\s*0,00/);
      expect(screen.getByText('Nenhuma conta em aberto nesta categoria.')).toBeTruthy();
    });
    expect(screen.getByLabelText('Indicadores financeiros').textContent).toMatch(/Saldo realizado/);
  });
});
