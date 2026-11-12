import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./api', async () => {
  const actual = await vi.importActual<typeof import('./api')>('./api');
  return {
    ...actual,
    listarOcsDisponiveisEstampas: vi.fn(),
    completarOcsDisponiveisEstampas: vi.fn(),
    atualizarFotoOcDisponivel: vi.fn(),
    criarAmostraManual: vi.fn(),
    atualizarAmostraManual: vi.fn(),
  };
});

import {
  completarOcsDisponiveisEstampas,
  criarAmostraManual,
  listarOcsDisponiveisEstampas,
  type OcDisponivelEstampa,
} from './api';
import { EstampasPage } from './EstampasPage';

const listar = vi.mocked(listarOcsDisponiveisEstampas);
const completar = vi.mocked(completarOcsDisponiveisEstampas);

const criar = vi.mocked(criarAmostraManual);

const raglan: OcDisponivelEstampa = {
  id: 9,
  origem: 'oc',
  ordem_corte_id: 9,
  ordem_id: 9,
  codigo_oc: 'OC-09',
  tipo: 'amostra',
  modelo: 'raglan',
  referencia: '1088',
  peca: 'raglan',
  tipo_peca: 'Camiseta',
  quantidade: 120,
  cores: ['Preto'],
  tamanhos: ['P', 'M', 'G', 'GG'],
  grade: [{ cor: 'Preto', tamanho: 'M', quantidade: 30 }],
  costureiro: 'Rita',
  oficina: 'Oficina Norte',
  produto_id: 2,
  imagem: null,
  categoria: 'Camiseta',
  observacoes: '',
  entregue_em: '2026-11-08 22:59:35',
  atualizado_em: '2026-11-08 22:59:35',
};

describe('tela OCs disponíveis/estampas', () => {
  afterEach(() => cleanup());

  beforeEach(() => {
    listar.mockReset();
    completar.mockReset();
    criar.mockReset();
    listar.mockResolvedValue({ data: [raglan], totais: { disponiveis: 1 } });
  });

  it('abre amostras com indicador, pesquisa, filtro e cartão sem tabela de clientes', async () => {
    render(<EstampasPage />);
    expect(await screen.findByRole('heading', { name: 'OCs disponíveis/estampas' })).toBeTruthy();
    expect(screen.getByRole('tab', { name: 'Amostras' })).toBeTruthy();
    expect(screen.getByRole('tab', { name: 'Cortes' })).toBeTruthy();
    expect(screen.getByLabelText('Ordens disponíveis').textContent).toMatch(/1/);
    expect(screen.getByText('raglan')).toBeTruthy();
    expect(screen.getByText('REF 1088')).toBeTruthy();
    expect(screen.getByText('OC-09')).toBeTruthy();
    expect(screen.getByText('Sem foto')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Adicionar foto' })).toBeTruthy();
    expect(screen.getByLabelText('Pesquisar por OC, peça, REF ou costureiro')).toBeTruthy();
    expect(screen.getByLabelText('Filtrar por tipo')).toBeTruthy();
    expect(screen.queryByRole('heading', { name: 'Clientes' })).toBeNull();
  });

  it('completa dados pelas OCs sem duplicar na segunda execução', async () => {
    completar
      .mockResolvedValueOnce({ importados: 5, atualizados: 0, disponiveis: 5 })
      .mockResolvedValueOnce({ importados: 0, atualizados: 5, disponiveis: 5 });
    listar
      .mockResolvedValueOnce({ data: [raglan], totais: { disponiveis: 1 } })
      .mockResolvedValue({ data: [raglan], totais: { disponiveis: 5 } });
    render(<EstampasPage />);
    expect(await screen.findByRole('button', { name: 'Completar dados pelas OCs' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Completar dados pelas OCs' }));
    expect(await screen.findByText(/5 importadas, 0 atualizadas/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Completar dados pelas OCs' }));
    await waitFor(() => {
      expect(completar).toHaveBeenCalledTimes(2);
    });
    expect(await screen.findByText(/0 importadas, 5 atualizadas/)).toBeTruthy();
  });

  it('abre o formulário de nova amostra ao lado de Completar dados pelas OCs', async () => {
    render(<EstampasPage />);
    expect(await screen.findByRole('button', { name: '+ Adicionar amostra' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: '+ Adicionar amostra' }));
    expect(screen.getByRole('heading', { name: 'Adicionar amostra' })).toBeTruthy();
    expect(screen.getByLabelText('Nome do modelo/peça')).toBeTruthy();
    expect(screen.getByLabelText('Referência')).toBeTruthy();
    expect(screen.getByLabelText('Tipo de peça')).toBeTruthy();
    expect(screen.getByLabelText('Cor')).toBeTruthy();
    expect(screen.getByLabelText('Tamanho')).toBeTruthy();
    expect(screen.getByLabelText('Quantidade')).toBeTruthy();
    expect(screen.getByLabelText('Observações')).toBeTruthy();
    expect(screen.getByLabelText('Foto da amostra')).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Nome do modelo/peça'), { target: { value: 'Polo piloto' } });
    fireEvent.change(screen.getByLabelText('Referência'), { target: { value: 'POLO-AM' } });
    criar.mockResolvedValue({
      ...raglan,
      id: 1,
      origem: 'manual',
      ordem_corte_id: null,
      ordem_id: null,
      codigo_oc: '',
      modelo: 'Polo piloto',
      referencia: 'POLO-AM',
      peca: 'Polo piloto',
    });
    listar.mockResolvedValue({
      data: [
        {
          ...raglan,
          id: 1,
          origem: 'manual',
          ordem_corte_id: null,
          codigo_oc: '',
          modelo: 'Polo piloto',
          referencia: 'POLO-AM',
        },
        raglan,
      ],
      totais: { disponiveis: 1 },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Salvar amostra' }));
    await waitFor(() => {
      expect(criar).toHaveBeenCalledWith(expect.objectContaining({ modelo: 'Polo piloto', referencia: 'POLO-AM' }));
    });
    expect(await screen.findByText('Polo piloto')).toBeTruthy();
    expect(screen.getByLabelText('Ordens disponíveis').textContent).toMatch(/1/);
  });
});
