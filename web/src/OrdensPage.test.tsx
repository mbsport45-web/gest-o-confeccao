import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { OrdemProducao } from './api';

vi.mock('./api', async () => {
  const actual = await vi.importActual<typeof import('./api')>('./api');
  return {
    ...actual,
    obterPainelProducao: vi.fn(),
    listarOrdens: vi.fn(),
    listarMateriasPrimas: vi.fn(),
    listarTamanhos: vi.fn(),
    listarCores: vi.fn(),
    listarClientes: vi.fn(),
    listarProdutos: vi.fn(),
    criarOrdemCorte: vi.fn(),
    obterOrdem: vi.fn(),
  };
});

vi.mock('./OrdemCorteFichaPage', () => ({
  OrdemCorteFichaPage: ({
    ordemId,
    onPublicada,
  }: {
    ordemId?: number | null;
    onPublicada?: () => void;
  }) => (
    <div>
      ficha-oc
      <span>{ordemId == null ? 'ficha-nova' : `ficha-${ordemId}`}</span>
      <button type="button" onClick={() => onPublicada?.()}>
        Enviar para produção
      </button>
    </div>
  ),
}));

import {
  listarClientes,
  listarCores,
  listarMateriasPrimas,
  listarOrdens,
  listarProdutos,
  listarTamanhos,
  obterPainelProducao,
} from './api';
import { OrdensPage } from './OrdensPage';

const painel = vi.mocked(obterPainelProducao);
const todas = vi.mocked(listarOrdens);
const materias = vi.mocked(listarMateriasPrimas);
const tamanhos = vi.mocked(listarTamanhos);
const cores = vi.mocked(listarCores);
const clientes = vi.mocked(listarClientes);
const produtos = vi.mocked(listarProdutos);

function ordem(dados: Partial<OrdemProducao> & Pick<OrdemProducao, 'id' | 'codigo' | 'status'>): OrdemProducao {
  return {
    empresa_id: 1,
    cliente: 'Cliente Teste',
    produto: 'Camiseta',
    tamanho: 'M',
    quantidade: 2,
    prioridade: 'normal',
    data_prevista: null,
    observacoes: null,
    responsavel: null,
    cliente_id: 1,
    produto_id: 1,
    variante_id: null,
    criado_em: '2026-11-08T12:00:00',
    atualizado_em: null,
    ...dados,
  };
}

const sessao = {
  assinatura: {
    acesso: { operacional: true, leitura: true, trocar_plano: true },
    uso: {},
  } as never,
};

describe('painel principal de ordens', () => {
  afterEach(() => cleanup());

  beforeEach(() => {
    painel.mockReset();
    todas.mockReset();
    materias.mockReset();
    tamanhos.mockReset();
    cores.mockReset();
    clientes.mockReset();
    produtos.mockReset();
    materias.mockResolvedValue({ data: [] } as never);
    tamanhos.mockResolvedValue([]);
    cores.mockResolvedValue([]);
    clientes.mockResolvedValue({ data: [] } as never);
    produtos.mockResolvedValue({ data: [] } as never);
    todas.mockResolvedValue([]);
    painel.mockResolvedValue({
      totais: { cadastradas: 2, andamento: 1, entregues: 0 },
      por_etapa: { corte: 1, costura: 0, acabamento: 0, estamparia: 0, expedicao: 0 },
      etapa: 'corte',
      andamento: [
        ordem({
          id: 10,
          codigo: 'OP-0010',
          status: 'corte',
          cliente: 'mb',
          produto: 'raglan',
          quantidade: 120,
          etapa_linha: 'corte',
          ordem_corte: {
            id: 7,
            codigo: 'OC-07',
            quantidade: 120,
            grade: [],
            status_processo: 'em_corte',
          },
        }),
      ],
    });
  });

  it('mostra os indicadores sem a linha de produção', async () => {
    render(<OrdensPage sessao={sessao} visao="producao" />);
    expect(await screen.findByRole('button', { name: 'Total de ordens' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Total de ordens' }).textContent).toContain('2');
    expect(screen.getByText('Na linha de produção').closest('.kpi')?.textContent).toContain('1');
    expect(screen.queryByRole('heading', { name: 'Linha de produção' })).toBeNull();
    expect(screen.queryByRole('tablist', { name: 'Etapas da linha de produção' })).toBeNull();
    expect(screen.queryByRole('tab', { name: /Corte/ })).toBeNull();
    expect(screen.queryByRole('tab', { name: /Costura/ })).toBeNull();
    expect(screen.queryByRole('heading', { name: 'Ordens planejadas' })).toBeNull();
    expect(screen.queryByRole('heading', { name: 'Cadastro de ordens' })).toBeNull();
    expect(screen.queryByRole('table', { name: 'Cadastro de ordens' })).toBeNull();
    expect(screen.queryByRole('heading', { name: 'Todas as ordens' })).toBeNull();
    expect(screen.queryByText('OP-0010')).toBeNull();
    expect(painel).toHaveBeenCalledWith();
    expect(todas).not.toHaveBeenCalled();
  });

  it('abre todas as ordens cadastradas ao clicar no total', async () => {
    todas.mockResolvedValue([
      ordem({ id: 1, codigo: 'OP-0001', status: 'planejada', produto: 'Camisa Planejada' }),
      ordem({
        id: 10,
        codigo: 'OP-0010',
        status: 'corte',
        etapa_linha: 'corte',
        ordem_corte: { id: 7, codigo: 'OC-07', quantidade: 120, grade: [], status_processo: 'em_corte' },
      }),
      ordem({ id: 5, codigo: 'OP-0005', status: 'concluida', produto: 'Camisa Entregue' }),
    ]);
    const irProducao = vi.fn();
    render(<OrdensPage sessao={sessao} visao="producao" onIrProducao={irProducao} />);
    expect(await screen.findByRole('button', { name: 'Total de ordens' })).toBeTruthy();
    expect(screen.queryByRole('heading', { name: 'Linha de produção' })).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Total de ordens' }));
    await waitFor(() => expect(todas).toHaveBeenCalled());
    expect(irProducao).toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Total de ordens' }).className).toMatch(/kpi--ativa/);
    expect(screen.getByRole('button', { name: 'Total de ordens' }).getAttribute('aria-pressed')).toBe('true');

    const tabela = await screen.findByRole('table', { name: 'Lista de todas as ordens' });
    expect(within(tabela).getByText('OP-0001')).toBeTruthy();
    expect(within(tabela).getByText('OP-0010')).toBeTruthy();
    expect(within(tabela).getByText('OP-0005')).toBeTruthy();
    expect(within(tabela).getByText('Camisa Planejada')).toBeTruthy();
    expect(within(tabela).getByText('Camisa Entregue')).toBeTruthy();
    expect(within(tabela).getAllByText('Planejada').length).toBeGreaterThan(0);
    expect(within(tabela).getByText('Em andamento')).toBeTruthy();
    expect(within(tabela).getByText('Entregue')).toBeTruthy();
    expect(screen.queryByRole('heading', { name: 'Linha de produção' })).toBeNull();
    expect(screen.queryByRole('tab', { name: /Corte/ })).toBeNull();
    expect(screen.getByText('Na linha de produção').closest('.kpi')?.tagName).toBe('DIV');
    expect(screen.getByText('Ordens concluídas').closest('.kpi')?.tagName).toBe('DIV');
  });

  it('abre a ficha nova em Criar OC e volta para Ordens ao publicar', async () => {
    const irProducao = vi.fn();
    const { rerender } = render(
      <OrdensPage sessao={sessao} visao="criar-oc" onIrProducao={irProducao} />,
    );
    expect(await screen.findByText('ficha-oc')).toBeTruthy();
    expect(screen.getByText('ficha-nova')).toBeTruthy();
    expect(screen.queryByRole('heading', { name: 'Linha de produção' })).toBeNull();
    expect(screen.queryByRole('heading', { name: 'Cadastro de ordens' })).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Enviar para produção' }));
    await waitFor(() => expect(irProducao).toHaveBeenCalled());
    await waitFor(() => expect(painel).toHaveBeenCalledWith());

    rerender(<OrdensPage sessao={sessao} visao="producao" onIrProducao={irProducao} />);
    expect(await screen.findByRole('button', { name: 'Total de ordens' })).toBeTruthy();
    expect(screen.queryByRole('heading', { name: 'Linha de produção' })).toBeNull();
    expect(screen.queryByText('ficha-nova')).toBeNull();
    expect(screen.queryByRole('tab', { name: /Corte/ })).toBeNull();
  });
});
