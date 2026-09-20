import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AssinaturaEmpresa, EventoAssinatura, PlanoEmpresa } from './api';

vi.mock('./api', async () => {
  const actual = await vi.importActual<typeof import('./api')>('./api');
  return {
    ...actual,
    iniciarPagamentoSandbox: vi.fn(),
    obterAssinatura: vi.fn(),
    obterCheckoutPagamento: vi.fn(),
    listarEventosAssinatura: vi.fn(),
  };
});

import {
  iniciarPagamentoSandbox,
  listarEventosAssinatura,
  obterAssinatura,
  obterCheckoutPagamento,
} from './api';
import { CheckoutAssinatura } from './CheckoutAssinatura';
import { MSG_CONFIRMADO, MSG_ERRO, MSG_FALHOU, MSG_PENDENTE } from './checkoutPagamento';

const plano: PlanoEmpresa = {
  codigo: 'profissional',
  nome: 'Profissional',
  descricao: 'Volume maior',
  ordem: 2,
  limites: {
    usuarios: 15,
    clientes: 500,
    produtos: 200,
    materiais: 300,
    pedidos_mes: 500,
    ordens_mes: 200,
  },
  recursos: {
    expedicao: true,
    financeiro: true,
    relatorios_avancados: true,
    api_externa: false,
    suporte_prioritario: false,
  },
  preco_mensal: 149.9,
  preco_anual: null,
  moeda: 'BRL',
  ciclo: 'mensal',
};

const assinatura: AssinaturaEmpresa = {
  status: 'trial',
  status_label: 'Período de avaliação',
  cobranca: 'sandbox',
  ciclo: 'mensal',
  inicia_em: '2026-09-20 20:00:00',
  renova_em: '2026-10-04 20:00:00',
  gateway: 'asaas',
  asaas_subscription_id: 'sub_sandbox_1',
  plano: { ...plano, codigo: 'basico', nome: 'Básico', ordem: 1, preco_mensal: 99.9 },
  comercial: {
    ciclo: 'mensal',
    moeda: 'BRL',
    valor_mensal: 99.9,
    preco_anual: null,
    gateway: 'asaas',
    cobranca: 'sandbox',
    pronta: true,
    cobranca_real: false,
    ambiente: 'sandbox',
    operacoes: ['assinar', 'upgrade', 'downgrade', 'cancelar'],
  },
  uso: {
    usuarios: { atual: 1, maximo: 3, atingido: false },
    clientes: { atual: 0, maximo: 50, atingido: false },
    produtos: { atual: 0, maximo: 30, atingido: false },
    materiais: { atual: 0, maximo: 50, atingido: false },
    pedidos_mes: { atual: 0, maximo: 50, atingido: false },
    ordens_mes: { atual: 0, maximo: 20, atingido: false },
  },
  acesso: { leitura: true, operacional: true, trocar_plano: true },
  politica: {
    leitura: true,
    operacional: true,
    trocar_plano: true,
    permite: [],
    bloqueia: [],
    acoes: ['ativar', 'cancelar'],
  },
};

const eventoPendente: EventoAssinatura = {
  id: 9,
  tipo: 'pagamento_pendente',
  tipo_label: 'Pagamento pendente',
  criado_em: '2026-09-20 21:00:00',
  empresa_id: 1,
  usuario: { id: 1, nome: 'Marcos' },
  de_plano: 'profissional',
  para_plano: 'profissional',
  de_status: 'trial',
  para_status: 'trial',
  ciclo: 'mensal',
  moeda: 'BRL',
  valor_mensal: 149.9,
  cobranca: 'sandbox',
  gateway: 'asaas',
};

function inicioPendente() {
  return {
    ...assinatura,
    plano,
    checkout: {
      confirmado: false,
      estado: 'pendente' as const,
      mensagem: MSG_PENDENTE,
      ambiente: 'sandbox' as const,
      cobranca_real: false as const,
    },
    sandbox: {
      provedor: 'asaas',
      ambiente: 'sandbox',
      customer_id: 'cus_1',
      subscription_id: 'sub_sandbox_1',
      valor_mensal: 149.9,
      plano: 'profissional',
      cobranca_real: false as const,
    },
  };
}

describe('CheckoutAssinatura', () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  beforeEach(() => {
    vi.mocked(listarEventosAssinatura).mockResolvedValue({
      data: [eventoPendente],
      cobranca: 'sandbox',
      ciclo: 'mensal',
      gateway: 'asaas',
    });
    vi.mocked(obterAssinatura).mockResolvedValue(assinatura);
    vi.mocked(obterCheckoutPagamento).mockResolvedValue({
      confirmado: false,
      estado: 'pendente',
      mensagem: MSG_PENDENTE,
      ambiente: 'sandbox',
      cobranca_real: false,
    });
  });

  it('revisa o plano e inicia pagamento sem tratar 201 como aprovado', async () => {
    vi.mocked(iniciarPagamentoSandbox).mockResolvedValue(inicioPendente());
    const onEventos = vi.fn();
    render(
      <CheckoutAssinatura
        plano={plano}
        atual={assinatura}
        podeHistorico
        onAssinatura={() => undefined}
        onEventos={onEventos}
        onVoltar={() => undefined}
      />,
    );
    expect(screen.getByText('Revisar plano e preço')).toBeTruthy();
    expect(screen.getByText('Profissional')).toBeTruthy();
    expect(screen.getByText('R$ 149,90/mês')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Iniciar pagamento' }));
    await waitFor(() => {
      expect(iniciarPagamentoSandbox).toHaveBeenCalledWith({
        plano: 'profissional',
        billingType: 'PIX',
      });
    });
    expect(screen.getByText(MSG_PENDENTE)).toBeTruthy();
    expect(screen.queryByText(MSG_CONFIRMADO)).toBeNull();
    expect(onEventos).toHaveBeenCalled();
  });

  it('confirma só depois do backend/webhook', async () => {
    vi.mocked(iniciarPagamentoSandbox).mockResolvedValue(inicioPendente());
    render(
      <CheckoutAssinatura
        plano={plano}
        atual={assinatura}
        podeHistorico
        onAssinatura={() => undefined}
        onEventos={() => undefined}
        onVoltar={() => undefined}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Iniciar pagamento' }));
    await waitFor(() => expect(screen.getByText(MSG_PENDENTE)).toBeTruthy());

    vi.mocked(obterAssinatura).mockResolvedValue({
      ...assinatura,
      status: 'ativa',
      status_label: 'Ativa',
      plano,
    });
    vi.mocked(obterCheckoutPagamento).mockResolvedValue({
      confirmado: true,
      estado: 'confirmado',
      mensagem: MSG_CONFIRMADO,
      ambiente: 'sandbox',
      cobranca_real: false,
    });
    vi.mocked(listarEventosAssinatura).mockResolvedValue({
      data: [
        {
          ...eventoPendente,
          id: 10,
          tipo: 'pagamento_confirmado',
          tipo_label: 'Pagamento confirmado',
          para_status: 'ativa',
        },
      ],
      cobranca: 'sandbox',
      ciclo: 'mensal',
      gateway: 'asaas',
    });
    fireEvent.click(screen.getByRole('button', { name: 'Atualizar status' }));
    await waitFor(() => expect(screen.getByText(MSG_CONFIRMADO)).toBeTruthy());
  });

  it('mostra falha e erro de comunicação', async () => {
    vi.mocked(iniciarPagamentoSandbox).mockRejectedValue(new Error(MSG_ERRO));
    const { rerender } = render(
      <CheckoutAssinatura
        plano={plano}
        atual={assinatura}
        podeHistorico={false}
        onAssinatura={() => undefined}
        onEventos={() => undefined}
        onVoltar={() => undefined}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Iniciar pagamento' }));
    await waitFor(() => expect(screen.getByText(MSG_ERRO)).toBeTruthy());

    rerender(
      <CheckoutAssinatura
        plano={plano}
        atual={assinatura}
        podeHistorico={false}
        onAssinatura={() => undefined}
        onEventos={() => undefined}
        onVoltar={() => undefined}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Tentar de novo' }));
    vi.mocked(iniciarPagamentoSandbox).mockResolvedValue(inicioPendente());
    fireEvent.click(screen.getByRole('button', { name: 'Iniciar pagamento' }));
    await waitFor(() => expect(screen.getByText(MSG_PENDENTE)).toBeTruthy());
    vi.mocked(obterCheckoutPagamento).mockResolvedValue({
      confirmado: false,
      estado: 'falhou',
      mensagem: MSG_FALHOU,
      ambiente: 'sandbox',
      cobranca_real: false,
    });
    fireEvent.click(screen.getByRole('button', { name: 'Atualizar status' }));
    await waitFor(() => expect(screen.getByText(MSG_FALHOU)).toBeTruthy());
  });
});
