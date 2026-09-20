import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AssinaturaEmpresa, EventoAssinatura, PlanoEmpresa, SessaoAtual } from './api';

vi.mock('./api', async () => {
  const actual = await vi.importActual<typeof import('./api')>('./api');
  return {
    ...actual,
    listarPlanos: vi.fn(),
    obterAssinatura: vi.fn(),
    listarEventosAssinatura: vi.fn(),
    alterarPlano: vi.fn(),
    alterarAssinatura: vi.fn(),
  };
});

import {
  listarEventosAssinatura,
  listarPlanos,
  obterAssinatura,
  temPermissao,
} from './api';
import { PlanoPage } from './PlanoPage';

const planoBasico: PlanoEmpresa = {
  codigo: 'basico',
  nome: 'Básico',
  descricao: 'Operação inicial',
  ordem: 1,
  limites: {
    usuarios: 3,
    clientes: 50,
    produtos: 30,
    materiais: 50,
    pedidos_mes: 50,
    ordens_mes: 20,
  },
  recursos: {
    expedicao: true,
    financeiro: true,
    relatorios_avancados: false,
    api_externa: false,
    suporte_prioritario: false,
  },
  preco_mensal: 99.9,
  preco_anual: null,
  moeda: 'BRL',
  ciclo: 'mensal',
};

const assinatura: AssinaturaEmpresa = {
  status: 'trial',
  status_label: 'Período de avaliação',
  cobranca: 'desativada',
  ciclo: 'mensal',
  inicia_em: '2026-09-20 20:00:00',
  renova_em: '2026-10-04 20:00:00',
  gateway: null,
  plano: planoBasico,
  comercial: {
    ciclo: 'mensal',
    moeda: 'BRL',
    valor_mensal: 99.9,
    preco_anual: null,
    gateway: null,
    cobranca: 'desativada',
    pronta: false,
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

function sessao(papel: SessaoAtual['usuario']['papel']): SessaoAtual {
  const permissoes = {
    escrever: papel === 'proprietario' || papel === 'administrador',
    equipe: papel === 'proprietario' || papel === 'administrador',
    modulos: {
      equipe: { visualizar: false, criar: false, editar: false, excluir: false },
      clientes: { visualizar: false, criar: false, editar: false, excluir: false },
      produtos: { visualizar: false, criar: false, editar: false, excluir: false },
      materiais: { visualizar: false, criar: false, editar: false, excluir: false },
      estoque: { visualizar: false, criar: false, editar: false, excluir: false },
      pedidos: { visualizar: false, criar: false, editar: false, excluir: false },
      expedicao: { visualizar: false, criar: false, editar: false, excluir: false },
      ordens: { visualizar: false, criar: false, editar: false, excluir: false },
      etapas: { visualizar: false, criar: false, editar: false, excluir: false },
      fornecedores: { visualizar: false, criar: false, editar: false, excluir: false },
      compras: { visualizar: false, criar: false, editar: false, excluir: false },
      financeiro: { visualizar: false, criar: false, editar: false, excluir: false },
      relatorios: { visualizar: false, criar: false, editar: false, excluir: false },
      assinatura: {
        visualizar: true,
        criar: papel === 'proprietario' || papel === 'administrador',
        editar: papel === 'proprietario' || papel === 'administrador',
        excluir: papel === 'proprietario' || papel === 'administrador',
      },
    },
  } as SessaoAtual['permissoes'];
  return {
    usuario: { id: 1, nome: 'Marcos', email: 'marcos@local.test', papel },
    empresa: { id: 1, nome: 'Confecção Comercial', status: 'ativa' },
    assinatura,
    permissoes,
  };
}

const eventoCriacao: EventoAssinatura = {
  id: 1,
  tipo: 'criacao',
  tipo_label: 'Criação da assinatura',
  criado_em: '2026-09-20 20:10:00',
  empresa_id: 1,
  usuario: { id: 1, nome: 'Marcos' },
  de_plano: null,
  para_plano: 'basico',
  de_plano_nome: null,
  para_plano_nome: 'Básico',
  de_status: null,
  para_status: 'trial',
  de_status_label: null,
  para_status_label: 'Período de avaliação',
  ciclo: 'mensal',
  moeda: 'BRL',
  valor_mensal: 99.9,
  cobranca: 'desativada',
  gateway: null,
  imutavel: true,
};

describe('PlanoPage histórico comercial', () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  beforeEach(() => {
    vi.mocked(listarPlanos).mockResolvedValue({
      data: [planoBasico],
      cobranca: 'desativada',
      ciclo: 'mensal',
      moeda: 'BRL',
      gateway: null,
    });
    vi.mocked(obterAssinatura).mockResolvedValue(assinatura);
    vi.mocked(listarEventosAssinatura).mockResolvedValue({
      data: [eventoCriacao],
      cobranca: 'desativada',
      ciclo: 'mensal',
      gateway: null,
    });
  });

  it('mostra o histórico para o proprietário', async () => {
    render(<PlanoPage sessao={sessao('proprietario')} onAssinatura={() => undefined} />);
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Histórico comercial' })).toBeTruthy();
    });
    expect(screen.getByText('Criação da assinatura')).toBeTruthy();
    expect(screen.getByText('20/09/2026 20:10:00')).toBeTruthy();
    expect(listarEventosAssinatura).toHaveBeenCalled();
  });

  it('mostra o histórico para o administrador', async () => {
    render(<PlanoPage sessao={sessao('administrador')} onAssinatura={() => undefined} />);
    await waitFor(() => {
      expect(screen.getByText('Criação da assinatura')).toBeTruthy();
    });
    expect(listarEventosAssinatura).toHaveBeenCalled();
  });

  it('não busca nem exibe o histórico para vendas', async () => {
    render(<PlanoPage sessao={sessao('vendas')} onAssinatura={() => undefined} />);
    await waitFor(() => {
      expect(screen.getAllByRole('heading', { name: 'Plano da empresa' }).length).toBeGreaterThan(0);
    });
    expect(screen.queryByRole('heading', { name: 'Histórico comercial' })).toBeNull();
    expect(listarEventosAssinatura).not.toHaveBeenCalled();
    expect(temPermissao(sessao('vendas').permissoes, 'assinatura', 'visualizar')).toBe(true);
  });
});
