import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
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
  type OrdemProducao,
} from './api';
import { CorteInfestoPage } from './CorteInfestoPage';

const ordens = vi.mocked(listarOrdens);
const cortes = vi.mocked(listarCortesInfesto);
const materias = vi.mocked(listarMateriasPrimas);
const obter = vi.mocked(obterOrdem);
const concluir = vi.mocked(concluirCorteInfesto);

const ordemLista: OrdemProducao = {
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
};

const ordemCompleta: OrdemProducao = {
  ...ordemLista,
  grade: [
    { cor: 'Preto', tamanho: 'M', quantidade: 3 },
    { cor: 'Preto', tamanho: 'G', quantidade: 1 },
    { cor: 'Branco', tamanho: 'M', quantidade: 2 },
    { cor: 'Branco', tamanho: 'G', quantidade: 0 },
  ],
  requisitos: [],
};

describe('tela Corte / Infesto', () => {
  afterEach(() => cleanup());

  beforeEach(() => {
    concluir.mockReset();
    ordens.mockResolvedValue([ordemLista]);
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
    obter.mockResolvedValue(ordemCompleta);
  });

  it('mostra a grade salva, corta uma cor por tamanho e atualiza o saldo', async () => {
    concluir.mockImplementation(async () => {
      cortes.mockResolvedValue([
        {
          id: 1,
          ordem_id: 4,
          materia_prima_id: 2,
          cor: 'Preto',
          quantidade_pecas: 2,
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
          status_ordem: 'planejada',
          itens: [
            { cor: 'Preto', tamanho: 'M', quantidade: 2 },
            { cor: 'Preto', tamanho: 'G', quantidade: 0 },
          ],
          avancou: false,
        },
      ]);
      return {
        id: 1,
        ordem_id: 4,
        materia_prima_id: 2,
        cor: 'Preto',
        quantidade_pecas: 2,
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
        status_ordem: 'planejada',
        itens: [
          { cor: 'Preto', tamanho: 'M', quantidade: 2 },
          { cor: 'Preto', tamanho: 'G', quantidade: 0 },
        ],
        avancou: false,
      };
    });

    render(<CorteInfestoPage />);
    expect(await screen.findByText('OP-0004')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Executar corte' }));

    const grade = await screen.findByRole('table', { name: 'Grade planejada' });
    expect(within(grade).getByRole('cell', { name: 'Preto M planejado 3 cortado 0 saldo 3' })).toBeTruthy();
    expect(within(grade).getByRole('cell', { name: 'Branco M planejado 2 cortado 0 saldo 2' })).toBeTruthy();
    expect(within(grade).getByRole('cell', { name: 'Total M planejado 5 cortado 0 saldo 5' })).toBeTruthy();
    expect(within(grade).getByRole('cell', { name: 'Total geral planejado 6 cortado 0 saldo 6' })).toBeTruthy();
    expect(screen.getByLabelText('Quantidade cortada M')).toHaveProperty('value', '3');
    expect(screen.getByLabelText('Quantidade cortada G')).toHaveProperty('value', '1');

    fireEvent.change(screen.getByLabelText('Cor do corte'), { target: { value: 'Branco' } });
    expect(screen.getByLabelText('Quantidade cortada M')).toHaveProperty('value', '2');
    fireEvent.change(screen.getByLabelText('Cor do corte'), { target: { value: 'Preto' } });
    fireEvent.change(screen.getByLabelText('Quantidade cortada M'), { target: { value: '2' } });
    fireEvent.change(screen.getByLabelText('Quantidade cortada G'), { target: { value: '0' } });
    expect(screen.queryByLabelText('Metragem consumida')).toBeNull();
    expect(screen.getByText(/controlado em KG/)).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Camadas do enfesto'), { target: { value: '10' } });
    fireEvent.change(screen.getByLabelText('Peso real consumido'), { target: { value: '1.2' } });
    fireEvent.click(screen.getByRole('button', { name: 'Registrar corte da cor' }));

    await waitFor(() =>
      expect(concluir).toHaveBeenCalledWith(4, {
        materia_prima_id: 2,
        cor: 'Preto',
        camadas: 10,
        peso_real: 1.2,
        itens: [
          { tamanho: 'M', quantidade: 2 },
          { tamanho: 'G', quantidade: 0 },
        ],
      }),
    );
    expect(await screen.findByRole('cell', { name: 'Preto M planejado 3 cortado 2 saldo 1' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Continuar corte' })).toBeTruthy();
    expect(screen.getByRole('table', { name: 'Cortes registrados' })).toBeTruthy();
    expect(screen.getByText('M 2')).toBeTruthy();
  });

  it('pede autorização explícita para cortar acima do planejado', async () => {
    render(<CorteInfestoPage />);
    fireEvent.click(await screen.findByRole('button', { name: 'Executar corte' }));
    await screen.findByRole('table', { name: 'Grade planejada' });
    fireEvent.change(screen.getByLabelText('Quantidade cortada M'), { target: { value: '9' } });
    fireEvent.change(screen.getByLabelText('Camadas do enfesto'), { target: { value: '4' } });
    fireEvent.change(screen.getByLabelText('Peso real consumido'), { target: { value: '0.5' } });
    fireEvent.click(screen.getByRole('button', { name: 'Registrar corte da cor' }));

    expect(await screen.findByText(/ultrapassa o planejado/)).toBeTruthy();
    expect(concluir).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('checkbox', { name: 'Autorizar quantidade acima do planejado' }));
    fireEvent.click(screen.getByRole('button', { name: 'Registrar corte da cor' }));
    await waitFor(() =>
      expect(concluir).toHaveBeenCalledWith(
        4,
        expect.objectContaining({
          cor: 'Preto',
          autorizar_excedente: true,
          itens: [
            { tamanho: 'M', quantidade: 9 },
            { tamanho: 'G', quantidade: 1 },
          ],
        }),
      ),
    );
  });

  it('pede a metragem e dispensa o peso quando o tecido é controlado em metros', async () => {
    materias.mockResolvedValue({
      data: [
        {
          id: 8,
          codigo: 'TELA',
          nome: 'Tela metro',
          descricao: null,
          tipo: 'tecido',
          categoria: null,
          cor: null,
          composicao: null,
          largura_cm: null,
          gramatura: null,
          unidade: 'MT',
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
    render(<CorteInfestoPage />);
    fireEvent.click(await screen.findByRole('button', { name: 'Executar corte' }));
    await screen.findByRole('table', { name: 'Grade planejada' });
    expect(screen.queryByLabelText('Peso real consumido')).toBeNull();
    expect(screen.getByText(/controlado em MT/)).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Camadas do enfesto'), { target: { value: '6' } });
    fireEvent.change(screen.getByLabelText('Metragem consumida'), { target: { value: '4.5' } });
    fireEvent.click(screen.getByRole('button', { name: 'Registrar corte da cor' }));
    await waitFor(() =>
      expect(concluir).toHaveBeenCalledWith(
        4,
        expect.objectContaining({
          materia_prima_id: 8,
          metragem: 4.5,
          camadas: 6,
        }),
      ),
    );
    expect(concluir.mock.calls[0]?.[1]).not.toHaveProperty('peso_real');
  });

  it('informa quando a ordem não tem grade e não inventa tamanhos', async () => {
    obter.mockResolvedValue({ ...ordemCompleta, grade: [] });
    render(<CorteInfestoPage />);
    fireEvent.click(await screen.findByRole('button', { name: 'Executar corte' }));
    expect(await screen.findByText(/não tem grade de cores e tamanhos/)).toBeTruthy();
    expect(screen.queryByRole('table', { name: 'Grade planejada' })).toBeNull();
    expect(screen.queryByLabelText('Quantidade cortada M')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Registrar corte da cor' })).toBeNull();
    expect(concluir).not.toHaveBeenCalled();
  });
});
