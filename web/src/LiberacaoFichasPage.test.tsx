import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./api', async () => {
  const actual = await vi.importActual<typeof import('./api')>('./api');
  return {
    ...actual,
    listarFichasLiberacao: vi.fn(),
    listarOrdens: vi.fn(),
    confirmarLiberacaoFicha: vi.fn(),
    confirmarEntregaLiberacaoFicha: vi.fn(),
    encaminharOcExpedicao: vi.fn(),
    salvarConferenciaExpedicao: vi.fn(),
    cadastrarOficinaLiberacao: vi.fn(),
    salvarAviamentosLiberacaoFicha: vi.fn(),
    salvarChavePixOficina: vi.fn(),
  };
});

import {
  cadastrarOficinaLiberacao,
  confirmarEntregaLiberacaoFicha,
  confirmarLiberacaoFicha,
  encaminharOcExpedicao,
  listarFichasLiberacao,
  salvarConferenciaExpedicao,
  listarOrdens,
  salvarAviamentosLiberacaoFicha,
  salvarChavePixOficina,
  type FichaLiberacao,
  type OrdemProducao,
  type PagamentoOficinaFicha,
} from './api';
import { dataHojeLocal, LiberacaoFichasPage } from './LiberacaoFichasPage';

const listar = vi.mocked(listarFichasLiberacao);
const ordens = vi.mocked(listarOrdens);
const confirmar = vi.mocked(confirmarLiberacaoFicha);
const confirmarEntrega = vi.mocked(confirmarEntregaLiberacaoFicha);
const encaminharExpedicao = vi.mocked(encaminharOcExpedicao);
const salvarConferencia = vi.mocked(salvarConferenciaExpedicao);
const cadastrarOficina = vi.mocked(cadastrarOficinaLiberacao);
const salvarAviamentos = vi.mocked(salvarAviamentosLiberacaoFicha);
const salvarPix = vi.mocked(salvarChavePixOficina);

const ficha: FichaLiberacao = {
  id: 11,
  codigo: 'OC-07',
  ordem_id: 9,
  cliente: 'Loja Norte',
  produto: 'Camiseta Dry',
  quantidade: 6,
  prioridade: 'normal',
  data_prevista: null,
  responsavel: null,
  observacoes: 'Cortar com folga',
  cliente_id: null,
  produto_id: null,
  criado_em: '',
  modelo: 'Camiseta Dry',
  composicao: '100% poliéster',
  referencia: 'DRY-01',
  informacoes_oficina: 'Não refilar gola',
  informacoes_costureiros: 'Costura 4 fios',
  informacoes_acabamento: 'Passar e embalar',
  status_processo: 'corte_concluido',
  ordem_codigo: 'OP-0009',
  ordem_status: 'costura',
  tecido_nome: 'Malha dry',
  tecido_unidade: 'KG',
  materia_prima_id: 2,
  tamanhos: ['P', 'M', 'G'],
  linhas: [
    { cor: 'Preto', detalhes: 'Gola redonda' },
    { cor: 'Branco', detalhes: 'Gola V' },
  ],
  aviamentos: [],
  oficinas: [{ oficina: 'Oficina Norte', costureiro: 'Ana Souza', observacoes: '' }],
  materiais: [],
  grade: [
    { cor: 'Preto', tamanho: 'P', quantidade: 1 },
    { cor: 'Preto', tamanho: 'M', quantidade: 2 },
    { cor: 'Preto', tamanho: 'G', quantidade: 1 },
    { cor: 'Branco', tamanho: 'P', quantidade: 0 },
    { cor: 'Branco', tamanho: 'M', quantidade: 2 },
    { cor: 'Branco', tamanho: 'G', quantidade: 0 },
  ],
  valor_peca_sugerido: 2.5,
  costureiros: ['Ana Souza'],
  oficinas_opcoes: ['Oficina Norte'],
  liberacao: null,
};

function pagamentoFicha(dados: Partial<PagamentoOficinaFicha> = {}): PagamentoOficinaFicha {
  return {
    lancamento_id: 9,
    valor: 48,
    valor_pago: 0,
    saldo: 48,
    status: 'pendente',
    data_pagamento: null,
    ...dados,
  };
}

function ordemProducao(
  dados: Partial<OrdemProducao> & Pick<OrdemProducao, 'id' | 'status'>,
): OrdemProducao {
  return {
    codigo: `OP-${dados.id}`,
    cliente: 'Loja Norte',
    produto: 'Camiseta Dry',
    tamanho: 'M',
    quantidade: 6,
    prioridade: 'normal',
    data_prevista: null,
    observacoes: null,
    responsavel: null,
    cliente_id: null,
    produto_id: null,
    variante_id: null,
    criado_em: '2026-11-01',
    atualizado_em: null,
    ...dados,
  };
}

async function abrirAba(nome: string) {
  fireEvent.click(await screen.findByRole('tab', { name: new RegExp(nome, 'i') }));
}

async function abrirFicha(codigo: string) {
  fireEvent.click(await screen.findByRole('button', { name: `Abrir ficha ${codigo}` }));
  return screen.getByLabelText(`Ficha ${codigo}`);
}

describe('tela Liberar fichas', () => {
  afterEach(() => cleanup());

  beforeEach(() => {
    listar.mockReset();
    ordens.mockReset();
    confirmar.mockReset();
    confirmarEntrega.mockReset();
    encaminharExpedicao.mockReset();
    salvarConferencia.mockReset();
    cadastrarOficina.mockReset();
    salvarAviamentos.mockReset();
    salvarPix.mockReset();
    listar.mockResolvedValue({ data: [ficha], liberadas: [], oficinas: ['Oficina Norte'], oficinas_pix: [] });
    salvarPix.mockImplementation(async (nome, chave_pix) => ({ id: 1, nome, chave_pix }));
    ordens.mockResolvedValue([]);
    cadastrarOficina.mockResolvedValue({ nome: 'Oficina Leste', ja_existia: false });
    salvarAviamentos.mockImplementation(async (_ordemId, aviamentos) => ({
      ...ficha,
      aviamentos: aviamentos.map((item, indice) => ({
        id: indice + 1,
        aviamento_id: null,
        descricao: item.descricao,
        quantidade: Number(item.quantidade) || 0,
        unidade: item.unidade || 'UN',
        observacoes: '',
      })),
    }));
    confirmar.mockResolvedValue({
      ...ficha,
      status_processo: 'encaminhado',
      oficinas: [{ oficina: 'Oficina Norte', costureiro: 'Ana Souza', observacoes: '' }],
      data_retirada: '2026-11-10',
      informacoes_costureiros: 'Costura 4 fios',
      liberacao: {
        costureiro: 'Ana Souza',
        valor_peca: 3,
        referencia: 'DRY-01',
        tipo_peca: 'Camiseta Dry',
        oficina: 'Oficina Norte',
        oficina_id: 1,
        data_liberacao: '2026-11-03',
        data_retirada: '2026-11-10',
        codigo_oc: 'OC-07',
        liberado_em: '2026-11-08 16:00:00',
        liberado_por: 1,
        liberado_por_nome: 'Marcos',
      },
    });
  });

  it('abre só com as quantidades e as duas abas, sem os cartões das fichas', async () => {
    listar.mockResolvedValue({
      data: [ficha],
      oficinas: ['Oficina Norte'],
      liberadas: [
        {
          ...ficha,
          id: 22,
          codigo: 'OC-08',
          ordem_id: 10,
          status_processo: 'encaminhado',
          liberacao: {
            costureiro: 'Ana Souza',
            valor_peca: 8,
            referencia: 'DRY-01',
            tipo_peca: 'Camiseta Dry',
            oficina: 'Oficina Norte',
            oficina_id: 1,
            data_liberacao: '2026-11-05',
            data_retirada: '2026-11-10',
            codigo_oc: 'OC-08',
            liberado_em: '2026-11-08 16:00:00',
            liberado_por: 1,
            liberado_por_nome: 'Marcos',
          },
        },
      ],
    });
    render(<LiberacaoFichasPage />);
    expect(await screen.findByLabelText('Liberação Ficha/Oficina')).toBeTruthy();
    await waitFor(() => {
      expect(screen.getByLabelText('Fichas pendentes de liberação').textContent).toMatch(/1/);
    });
    expect(screen.queryByLabelText('Fichas já liberadas')).toBeNull();
    expect(screen.getByRole('tab', { name: /Fichas liberadas/ }).textContent).toMatch(/1/);
    expect(screen.queryByLabelText('Ficha OC-07')).toBeNull();
    expect(screen.queryByLabelText('Ficha OC-08')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Confirmar liberação da ficha' })).toBeNull();

    await abrirAba('Liberar fichas');
    expect(screen.getByRole('button', { name: 'Abrir ficha OC-07' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Abrir ficha OC-08' })).toBeNull();
    expect(screen.queryByLabelText('Ficha OC-07')).toBeNull();

    await abrirAba('Fichas liberadas');
    expect(screen.getByRole('button', { name: 'Abrir ficha OC-08' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Abrir ficha OC-07' })).toBeNull();
  });

  it('mostra a ficha original e confirma a liberação sem recadastrar dados', async () => {
    render(<LiberacaoFichasPage />);

    expect(await screen.findByLabelText('Liberação Ficha/Oficina')).toBeTruthy();
    expect(screen.queryByLabelText('Ficha OC-07')).toBeNull();
    await abrirAba('Liberar fichas');
    const card = await abrirFicha('OC-07');
    expect(within(card).getByText(/OC-07 · Loja Norte/)).toBeTruthy();
    expect(within(card).getByText('Camiseta Dry')).toBeTruthy();
    expect(within(card).getByText('DRY-01')).toBeTruthy();
    expect(within(card).getByText(/Preto, Branco/)).toBeTruthy();
    expect(within(card).getByText('Não refilar gola')).toBeTruthy();
    expect(
      within(card).getByRole('link', { name: 'Baixar ficha em PDF / Imprimir' }).getAttribute('href'),
    ).toBe('/api/etapas/liberacao/9/pdf');

    const grade = within(card).getByRole('table', { name: 'Grade OC-07' });
    expect(within(grade).getByText('Preto')).toBeTruthy();
    expect(within(grade).getAllByText('2').length).toBeGreaterThan(0);

    const valor = within(card).getByLabelText('Valor por peça OC-07') as HTMLInputElement;
    expect(valor.value).toMatch(/2,5/);
    const data = within(card).getByLabelText('Data de liberação OC-07') as HTMLInputElement;
    expect(data.value).toBe(dataHojeLocal());
    expect((within(card).getByLabelText('Oficina OC-07') as HTMLInputElement).value).toBe('Oficina Norte');
    expect(within(card).getByText('Oficina Norte')).toBeTruthy();
    fireEvent.change(valor, { target: { value: '3,00' } });
    fireEvent.change(data, { target: { value: '2026-11-03' } });
    fireEvent.change(within(card).getByLabelText('Data de retirada OC-07'), { target: { value: '2026-11-10' } });
    fireEvent.change(within(card).getByLabelText('Costureiro OC-07'), { target: { value: 'Ana Souza' } });
    fireEvent.click(within(card).getByRole('button', { name: 'Confirmar liberação da ficha' }));

    await waitFor(() => {
      expect(confirmar).toHaveBeenCalledWith(9, {
        costureiro: 'Ana Souza',
        valor_peca: 3,
        oficina: 'Oficina Norte',
        data_liberacao: '2026-11-03',
        data_retirada: '2026-11-10',
      });
    });
    expect(await screen.findByText(/OC-07 liberada para Oficina Norte/)).toBeTruthy();
    expect(screen.getByLabelText('Fichas pendentes de liberação').textContent).toMatch(/0/);
    expect(screen.queryByLabelText('Fichas já liberadas')).toBeNull();
    expect(screen.getByRole('tab', { name: /Fichas liberadas/ }).textContent).toMatch(/1/);
    expect(screen.getByRole('tab', { name: /Fichas liberadas/ }).getAttribute('aria-selected')).toBe('true');
    const reaberta = screen.getByLabelText('Ficha OC-07');
    expect(within(reaberta).getByText('Ficha liberada. Oficina, costureiro, valor e datas gravados na ficha.')).toBeTruthy();
    expect((within(reaberta).getByLabelText('Oficina OC-07') as HTMLInputElement).value).toBe('Oficina Norte');
    expect((within(reaberta).getByLabelText('Costureiro OC-07') as HTMLInputElement).value).toBe('Ana Souza');
    expect((within(reaberta).getByLabelText('Valor por peça OC-07') as HTMLInputElement).value).toMatch(/3/);
    expect((within(reaberta).getByLabelText('Data de liberação OC-07') as HTMLInputElement).value).toBe('2026-11-03');
    expect((within(reaberta).getByLabelText('Data de retirada OC-07') as HTMLInputElement).value).toBe('2026-11-10');
    expect(within(reaberta).getByRole('link', { name: 'Baixar ficha em PDF / Imprimir' }).getAttribute('href')).toBe(
      '/api/etapas/liberacao/9/pdf',
    );
    expect(within(reaberta).queryByRole('button', { name: 'Confirmar liberação da ficha' })).toBeNull();
  });

  it('reabre ficha já liberada com oficina, costureiro, valor e datas preenchidos', async () => {
    listar.mockResolvedValue({
      data: [],
      oficinas: ['Oficina Norte'],
      liberadas: [
        {
          ...ficha,
          status_processo: 'encaminhado',
          data_retirada: '2026-11-10',
          oficinas: [{ oficina: 'Oficina Norte', costureiro: 'Ana Souza', observacoes: '' }],
          liberacao: {
            costureiro: 'Ana Souza',
            valor_peca: 8,
            referencia: 'DRY-01',
            tipo_peca: 'Camiseta Dry',
            oficina: 'Oficina Norte',
            oficina_id: 1,
            data_liberacao: '2026-11-05',
            data_retirada: '2026-11-10',
            codigo_oc: 'OC-07',
            liberado_em: '2026-11-08 16:00:00',
            liberado_por: 1,
            liberado_por_nome: 'Marcos',
          },
        },
      ],
    });
    render(<LiberacaoFichasPage />);
    expect(await screen.findByRole('tab', { name: /Fichas liberadas/ })).toBeTruthy();
    expect(screen.queryByLabelText('Fichas já liberadas')).toBeNull();
    expect(screen.queryByLabelText('Ficha OC-07')).toBeNull();
    await abrirAba('Fichas liberadas');
    const card = await abrirFicha('OC-07');
    expect(within(card).getByText(/Fichas liberadas|Ficha liberada/)).toBeTruthy();
    expect((within(card).getByLabelText('Oficina OC-07') as HTMLInputElement).value).toBe('Oficina Norte');
    expect((within(card).getByLabelText('Costureiro OC-07') as HTMLInputElement).value).toBe('Ana Souza');
    expect((within(card).getByLabelText('Valor por peça OC-07') as HTMLInputElement).value).toMatch(/8/);
    expect((within(card).getByLabelText('Data de liberação OC-07') as HTMLInputElement).value).toBe('2026-11-05');
    expect((within(card).getByLabelText('Data de retirada OC-07') as HTMLInputElement).value).toBe('2026-11-10');
    expect(within(card).getByRole('link', { name: 'Baixar ficha em PDF / Imprimir' })).toBeTruthy();
  });

  it('preenche, grava e reabre os aviamentos da ficha sem alterar oficina ou costureiro', async () => {
    render(<LiberacaoFichasPage />);
    await abrirAba('Liberar fichas');
    const card = await abrirFicha('OC-07');
    expect(within(card).getByRole('heading', { name: 'AVIAMENTOS' })).toBeTruthy();
    fireEvent.change(within(card).getByLabelText('Descrição do aviamento 1 OC-07'), {
      target: { value: 'Elástico 3 cm' },
    });
    fireEvent.change(within(card).getByLabelText('Quantidade do aviamento 1 OC-07'), { target: { value: '2' } });
    fireEvent.change(within(card).getByLabelText('Unidade do aviamento 1 OC-07'), { target: { value: 'METRO' } });
    await waitFor(() => {
      expect(salvarAviamentos).toHaveBeenCalledWith(9, [
        { descricao: 'Elástico 3 cm', quantidade: 2, unidade: 'METRO' },
      ]);
    });
    fireEvent.click(within(card).getByRole('button', { name: 'Adicionar aviamento OC-07' }));
    fireEvent.change(within(card).getByLabelText('Descrição do aviamento 2 OC-07'), {
      target: { value: 'Botão 18L' },
    });
    fireEvent.change(within(card).getByLabelText('Quantidade do aviamento 2 OC-07'), { target: { value: '12' } });
    await waitFor(() => {
      expect(salvarAviamentos).toHaveBeenCalledWith(9, [
        { descricao: 'Elástico 3 cm', quantidade: 2, unidade: 'METRO' },
        { descricao: 'Botão 18L', quantidade: 12, unidade: 'UN' },
      ]);
    });
    expect((within(card).getByLabelText('Oficina OC-07') as HTMLInputElement).value).toBe('Oficina Norte');
    expect((within(card).getByLabelText('Costureiro OC-07') as HTMLInputElement).value).toBe('Ana Souza');
    expect(await screen.findByText('Aviamentos gravados nesta ficha.')).toBeTruthy();

    cleanup();
    listar.mockResolvedValue({
      data: [],
      oficinas: ['Oficina Norte'],
      liberadas: [
        {
          ...ficha,
          status_processo: 'encaminhado',
          aviamentos: [
            { id: 1, aviamento_id: null, descricao: 'Elástico 3 cm', quantidade: 2, unidade: 'METRO', observacoes: '' },
            { id: 2, aviamento_id: null, descricao: 'Botão 18L', quantidade: 12, unidade: 'UN', observacoes: '' },
          ],
          liberacao: {
            costureiro: 'Ana Souza',
            valor_peca: 3,
            referencia: 'DRY-01',
            tipo_peca: 'Camiseta Dry',
            oficina: 'Oficina Norte',
            oficina_id: 1,
            data_liberacao: '2026-11-03',
            data_retirada: null,
            codigo_oc: 'OC-07',
            liberado_em: '2026-11-08 16:00:00',
            liberado_por: 1,
            liberado_por_nome: 'Marcos',
          },
        },
      ],
    });
    render(<LiberacaoFichasPage />);
    await abrirAba('Fichas liberadas');
    const reaberta = await abrirFicha('OC-07');
    expect((within(reaberta).getByLabelText('Descrição do aviamento 1 OC-07') as HTMLInputElement).value).toBe(
      'Elástico 3 cm',
    );
    expect((within(reaberta).getByLabelText('Quantidade do aviamento 1 OC-07') as HTMLInputElement).value).toBe('2');
    expect((within(reaberta).getByLabelText('Unidade do aviamento 1 OC-07') as HTMLSelectElement).value).toBe('METRO');
    expect((within(reaberta).getByLabelText('Descrição do aviamento 2 OC-07') as HTMLInputElement).value).toBe('Botão 18L');
    expect((within(reaberta).getByLabelText('Oficina OC-07') as HTMLInputElement).value).toBe('Oficina Norte');
    fireEvent.change(within(reaberta).getByLabelText('Descrição do aviamento 2 OC-07'), {
      target: { value: 'Botão 18L preto' },
    });
    await waitFor(() => {
      expect(salvarAviamentos).toHaveBeenCalledWith(9, [
        { descricao: 'Elástico 3 cm', quantidade: 2, unidade: 'METRO' },
        { descricao: 'Botão 18L preto', quantidade: 12, unidade: 'UN' },
      ]);
    });
  });

  it('cadastra uma oficina nova e mostra o nome na ficha', async () => {
    render(<LiberacaoFichasPage />);
    await abrirAba('Liberar fichas');
    const card = await abrirFicha('OC-07');
    fireEvent.change(within(card).getByLabelText('Oficina OC-07'), { target: { value: 'Oficina Leste' } });
    fireEvent.click(within(card).getByRole('button', { name: 'Cadastrar oficina' }));
    await waitFor(() => {
      expect(cadastrarOficina).toHaveBeenCalledWith('Oficina Leste');
    });
    expect(await screen.findByText(/Oficina Leste cadastrada/)).toBeTruthy();
    expect(within(card).getAllByText('Oficina Leste').length).toBeGreaterThan(0);
  });

  it('mostra os indicadores reais e abre os dados ao clicar, sem alterar as abas', async () => {
    listar.mockResolvedValue({
      data: [ficha],
      oficinas: ['Oficina Norte'],
      liberadas: [
        {
          ...ficha,
          id: 22,
          codigo: 'OC-08',
          ordem_id: 10,
          status_processo: 'encaminhado',
          liberacao: {
            costureiro: 'Ana Souza',
            valor_peca: 8,
            referencia: 'DRY-01',
            tipo_peca: 'Camiseta Dry',
            oficina: 'Oficina Norte',
            oficina_id: 1,
            data_liberacao: '2026-11-05',
            data_retirada: '2026-11-10',
            codigo_oc: 'OC-08',
            liberado_em: '2026-11-08 16:00:00',
            liberado_por: 1,
            liberado_por_nome: 'Marcos',
          },
        },
        {
          ...ficha,
          id: 33,
          codigo: 'OC-09',
          ordem_id: 11,
          modelo: 'Calça Sport',
          referencia: 'CAL-02',
          status_processo: 'encaminhado',
          oficinas: [{ oficina: 'Oficina Sul', costureiro: 'Paulo Lima', observacoes: '' }],
          liberacao: {
            costureiro: 'Paulo Lima',
            valor_peca: 5,
            referencia: 'CAL-02',
            tipo_peca: 'Calça Sport',
            oficina: 'Oficina Sul',
            oficina_id: 2,
            data_liberacao: '2026-10-01',
            data_retirada: null,
            codigo_oc: 'OC-09',
            liberado_em: '2026-10-01 10:00:00',
            liberado_por: 1,
            liberado_por_nome: 'Marcos',
          },
        },
      ],
    });
    ordens.mockResolvedValue([
      ordemProducao({
        id: 1,
        status: 'corte',
        data_prevista: '2026-11-01',
        ordem_corte: { id: 1, codigo: 'OC-01', quantidade: 6, grade: [], status_processo: 'em_corte' },
      }),
      ordemProducao({
        id: 2,
        status: 'costura',
        ordem_corte: { id: 2, codigo: 'OC-02', quantidade: 4, grade: [], status_processo: 'encaminhado' },
      }),
      ordemProducao({ id: 3, status: 'concluida', produto: 'Jaqueta' }),
    ]);
    render(<LiberacaoFichasPage />);
    await waitFor(() => {
      expect(screen.getByLabelText('Em andamento').textContent).toMatch(/2/);
      expect(screen.getByLabelText('Cortes atrasados').textContent).toMatch(/1/);
      expect(screen.getByLabelText('Entregues').textContent).toMatch(/0/);
      expect(screen.getByLabelText('Expedição').textContent).toMatch(/0/);
    });
    expect(screen.getByLabelText('Pagamentos / Oficinas').textContent).toMatch(/R\$\s*0,00/);
    expect(screen.getByLabelText('Fichas pendentes de liberação').textContent).toMatch(/1/);
    expect(screen.queryByLabelText('Fichas já liberadas')).toBeNull();
    expect(screen.getByRole('tab', { name: /Fichas liberadas/ }).textContent).toMatch(/2/);
    expect(screen.queryByLabelText('Ficha OC-07')).toBeNull();
    expect(screen.getByLabelText('Em andamento').className).toMatch(/kpi--ativa/);

    const tabela = await screen.findByRole('table', { name: 'Fichas em andamento' });
    expect(within(tabela).getByText('OC')).toBeTruthy();
    expect(within(tabela).getByText('REF')).toBeTruthy();
    expect(within(tabela).getByText('Modelo / peça')).toBeTruthy();
    expect(within(tabela).getByText('Costureiro / oficina')).toBeTruthy();
    expect(within(tabela).getByText('Quantidade')).toBeTruthy();
    expect(within(tabela).getByText('Produção')).toBeTruthy();
    expect(within(tabela).getByText('Pagamento')).toBeTruthy();
    expect(within(tabela).getByText('Data de envio')).toBeTruthy();
    expect(within(tabela).getByText('Prazo de 10 dias')).toBeTruthy();
    expect(within(tabela).getByText('Data de entrega')).toBeTruthy();
    const oc08 = screen.getByLabelText('Ficha em andamento OC-08');
    expect(within(oc08).getByText('OC-08')).toBeTruthy();
    expect(within(oc08).getByText('DRY-01')).toBeTruthy();
    expect(within(oc08).getByText('Camiseta Dry')).toBeTruthy();
    expect(within(oc08).getByText('Ana Souza / Oficina Norte')).toBeTruthy();
    expect(within(oc08).getByText('6')).toBeTruthy();
    expect(within(oc08).getByText('Em andamento')).toBeTruthy();
    expect(within(oc08).getByText('PENDENTE')).toBeTruthy();
    expect(within(oc08).getByText('05/11/2026')).toBeTruthy();
    expect(within(oc08).getByText('15/11/2026')).toBeTruthy();
    expect(within(oc08).getByText('—')).toBeTruthy();
    expect(within(oc08).getByRole('button', { name: 'Confirmar entrega da ficha OC-08' })).toBeTruthy();
    const oc09 = screen.getByLabelText('Ficha em andamento OC-09');
    expect(within(oc09).getByText('Paulo Lima / Oficina Sul')).toBeTruthy();
    expect(within(oc09).getByText('Atrasado')).toBeTruthy();
    expect(within(oc09).getByText('PENDENTE')).toBeTruthy();
    expect(within(oc09).getByText('01/10/2026')).toBeTruthy();
    expect(within(oc09).getByText('11/10/2026')).toBeTruthy();
    expect(within(tabela).queryByText('OC-01')).toBeNull();
    expect(screen.getByLabelText('Pesquisar por OC, REF e modelo')).toBeTruthy();
    expect(screen.getByLabelText('Filtrar por produto')).toBeTruthy();
    expect(screen.getByLabelText('Filtrar por oficina')).toBeTruthy();
    expect(screen.getByLabelText('Filtrar por status')).toBeTruthy();
    expect(screen.getByLabelText('Filtrar por status de pagamento')).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Pesquisar por OC, REF e modelo'), { target: { value: 'OC-99' } });
    expect(within(tabela).getByText(/Nenhuma ficha encontrada/)).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Pesquisar por OC, REF e modelo'), { target: { value: '' } });
    fireEvent.change(screen.getByLabelText('Filtrar por status'), { target: { value: 'atrasado' } });
    expect(within(tabela).getByText('OC-09')).toBeTruthy();
    expect(within(tabela).queryByText('OC-08')).toBeNull();
    fireEvent.change(screen.getByLabelText('Filtrar por status'), { target: { value: '' } });
    fireEvent.change(screen.getByLabelText('Filtrar por status de pagamento'), { target: { value: 'pago' } });
    expect(within(tabela).getByText(/Nenhuma ficha encontrada/)).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Filtrar por status de pagamento'), { target: { value: 'pendente' } });
    expect(within(tabela).getByText('OC-08')).toBeTruthy();
    expect(within(tabela).getByText('OC-09')).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Filtrar por status de pagamento'), { target: { value: '' } });
    fireEvent.change(screen.getByLabelText('Pesquisar por OC, REF e modelo'), { target: { value: 'OC-08' } });
    expect(within(tabela).getByText('OC-08')).toBeTruthy();
    expect(screen.queryByLabelText('Ficha OC-07')).toBeNull();

    fireEvent.click(screen.getByLabelText('Cortes atrasados'));
    expect(screen.getByLabelText('Dados de Cortes atrasados').textContent).toMatch(/OC-01/);
    expect(screen.getByLabelText('Dados de Cortes atrasados').textContent).not.toMatch(/OC-02/);

    fireEvent.click(screen.getByLabelText('Entregues'));
    expect(screen.getByText('Nenhuma ficha entregue.')).toBeTruthy();
    expect(screen.queryByText(/Jaqueta/)).toBeNull();

    fireEvent.click(screen.getByLabelText('Expedição'));
    expect(screen.getByText('Nenhuma OC em expedição.')).toBeTruthy();

    fireEvent.click(screen.getByLabelText('Pagamentos / Oficinas'));
    const pagamentos = screen.getByLabelText('Dados de Pagamentos / Oficinas');
    expect(within(pagamentos).getByText(/Nenhuma OC com entrega confirmada para pagamento/)).toBeTruthy();
    expect(within(pagamentos).queryByText('OC-08')).toBeNull();
    expect(within(pagamentos).queryByText('OC-09')).toBeNull();

    await abrirAba('Liberar fichas');
    expect(screen.getByRole('button', { name: 'Abrir ficha OC-07' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Abrir ficha OC-08' })).toBeNull();
    expect(screen.queryByLabelText('Ficha OC-07')).toBeNull();
  });

  it('entra na tela com Em andamento já selecionado e volta a esse indicador ao reabrir', async () => {
    const view = render(<LiberacaoFichasPage />);
    expect(await screen.findByText('Nenhuma ficha em andamento.')).toBeTruthy();
    expect(screen.getByLabelText('Em andamento').className).toMatch(/kpi--ativa/);
    fireEvent.click(screen.getByLabelText('Entregues'));
    expect(screen.getByText('Nenhuma ficha entregue.')).toBeTruthy();
    expect(screen.getByLabelText('Entregues').className).toMatch(/kpi--ativa/);
    view.unmount();
    render(<LiberacaoFichasPage />);
    expect(await screen.findByText('Nenhuma ficha em andamento.')).toBeTruthy();
    expect(screen.getByLabelText('Em andamento').className).toMatch(/kpi--ativa/);
    expect(screen.queryByText('Nenhuma ficha entregue.')).toBeNull();
  });

  it('mostra PAGAMENTO na tabela junto da produção, com filtro e atualização imediata', async () => {
    const oc08: FichaLiberacao = {
      ...ficha,
      id: 22,
      codigo: 'OC-08',
      ordem_id: 10,
      status_processo: 'encaminhado',
      liberacao: {
        costureiro: 'Ana Souza',
        valor_peca: 8,
        referencia: 'DRY-01',
        tipo_peca: 'Camiseta Dry',
        oficina: 'Oficina Norte',
        oficina_id: 1,
        data_liberacao: '2026-11-05',
        data_retirada: '2026-11-10',
        codigo_oc: 'OC-08',
        liberado_em: '2026-11-08 16:00:00',
        liberado_por: 1,
        liberado_por_nome: 'Marcos',
      },
      pagamento: pagamentoFicha({
        status: 'pago',
        valor_pago: 48,
        saldo: 0,
        data_pagamento: '2026-11-12',
      }),
    };
    const oc09: FichaLiberacao = {
      ...ficha,
      id: 33,
      codigo: 'OC-09',
      ordem_id: 11,
      modelo: 'Calça Sport',
      referencia: 'CAL-02',
      status_processo: 'encaminhado',
      oficinas: [{ oficina: 'Oficina Sul', costureiro: 'Paulo Lima', observacoes: '' }],
      liberacao: {
        costureiro: 'Paulo Lima',
        valor_peca: 5,
        referencia: 'CAL-02',
        tipo_peca: 'Calça Sport',
        oficina: 'Oficina Sul',
        oficina_id: 2,
        data_liberacao: '2026-10-01',
        data_retirada: null,
        codigo_oc: 'OC-09',
        liberado_em: '2026-10-01 10:00:00',
        liberado_por: 1,
        liberado_por_nome: 'Marcos',
      },
      pagamento: pagamentoFicha({
        lancamento_id: 10,
        status: 'parcial',
        valor: 30,
        valor_pago: 10,
        saldo: 20,
      }),
    };
    listar.mockResolvedValue({
      data: [],
      oficinas: ['Oficina Norte', 'Oficina Sul'],
      liberadas: [oc08, oc09],
    });
    ordens.mockResolvedValue([
      ordemProducao({
        id: 10,
        status: 'costura',
        ordem_corte: { id: 22, codigo: 'OC-08', quantidade: 6, grade: [], status_processo: 'encaminhado' },
      }),
      ordemProducao({
        id: 11,
        status: 'costura',
        ordem_corte: { id: 33, codigo: 'OC-09', quantidade: 6, grade: [], status_processo: 'encaminhado' },
      }),
    ]);
    render(<LiberacaoFichasPage />);
    const tabela = await screen.findByRole('table', { name: 'Fichas em andamento' });
    expect(within(tabela).getByText('Pagamento')).toBeTruthy();
    const linha08 = screen.getByLabelText('Ficha em andamento OC-08');
    expect(within(linha08).getByText('Em andamento')).toBeTruthy();
    expect(within(linha08).getByText('PAGO')).toBeTruthy();
    expect(within(linha08).queryByText(/saldo/)).toBeNull();
    const linha09 = screen.getByLabelText('Ficha em andamento OC-09');
    expect(within(linha09).getByText('Atrasado')).toBeTruthy();
    expect(within(linha09).getByText('PARCIAL')).toBeTruthy();
    expect(within(linha09).getByText(/pago R\$\s*10,00 · saldo R\$\s*20,00/)).toBeTruthy();

    fireEvent.change(screen.getByLabelText('Filtrar por status de pagamento'), { target: { value: 'parcial' } });
    expect(within(tabela).queryByText('OC-08')).toBeNull();
    expect(within(tabela).getByText('OC-09')).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Filtrar por status de pagamento'), { target: { value: '' } });
    expect(within(tabela).getByText('OC-08')).toBeTruthy();

    listar.mockResolvedValue({
      data: [],
      oficinas: ['Oficina Norte', 'Oficina Sul'],
      liberadas: [
        {
          ...oc08,
          pagamento: pagamentoFicha({ status: 'pendente', valor_pago: 0, saldo: 48 }),
        },
        oc09,
      ],
    });
    fireEvent(window, new Event('focus'));
    await waitFor(() => {
      expect(within(screen.getByLabelText('Ficha em andamento OC-08')).getByText('PENDENTE')).toBeTruthy();
      expect(within(screen.getByLabelText('Ficha em andamento OC-08')).getByText('Em andamento')).toBeTruthy();
    });
  });

  it('confirma a entrega da oficina, grava a data e tira a ficha de Em andamento', async () => {
    const oc08: FichaLiberacao = {
      ...ficha,
      id: 22,
      codigo: 'OC-08',
      ordem_id: 10,
      status_processo: 'encaminhado',
      liberacao: {
        costureiro: 'Ana Souza',
        valor_peca: 8,
        referencia: 'DRY-01',
        tipo_peca: 'Camiseta Dry',
        oficina: 'Oficina Norte',
        oficina_id: 1,
        data_liberacao: '2026-11-05',
        data_retirada: '2026-11-10',
        codigo_oc: 'OC-08',
        liberado_em: '2026-11-08 16:00:00',
        liberado_por: 1,
        liberado_por_nome: 'Marcos',
      },
    };
    listar.mockResolvedValue({
      data: [ficha],
      oficinas: ['Oficina Norte'],
      liberadas: [
        oc08,
        {
          ...ficha,
          id: 33,
          codigo: 'OC-09',
          ordem_id: 11,
          modelo: 'Calça Sport',
          referencia: 'CAL-02',
          status_processo: 'encaminhado',
          oficinas: [{ oficina: 'Oficina Sul', costureiro: 'Paulo Lima', observacoes: '' }],
          liberacao: {
            costureiro: 'Paulo Lima',
            valor_peca: 5,
            referencia: 'CAL-02',
            tipo_peca: 'Calça Sport',
            oficina: 'Oficina Sul',
            oficina_id: 2,
            data_liberacao: '2026-10-01',
            data_retirada: null,
            codigo_oc: 'OC-09',
            liberado_em: '2026-10-01 10:00:00',
            liberado_por: 1,
            liberado_por_nome: 'Marcos',
          },
        },
      ],
    });
    ordens.mockResolvedValue([
      ordemProducao({
        id: 10,
        status: 'costura',
        ordem_corte: { id: 22, codigo: 'OC-08', quantidade: 6, grade: [], status_processo: 'encaminhado' },
      }),
      ordemProducao({
        id: 11,
        status: 'costura',
        ordem_corte: { id: 33, codigo: 'OC-09', quantidade: 6, grade: [], status_processo: 'encaminhado' },
      }),
    ]);
    confirmarEntrega.mockResolvedValue({
      ...oc08,
      liberacao: {
        ...oc08.liberacao!,
        entregue_em: '2026-11-08 19:32:00',
        entregue_por: 1,
        entregue_por_nome: 'Marcos',
      },
    });
    render(<LiberacaoFichasPage />);
    await waitFor(() => {
      expect(screen.getByLabelText('Em andamento').textContent).toMatch(/2/);
      expect(screen.getByLabelText('Entregues').textContent).toMatch(/0/);
      expect(screen.getByLabelText('Pagamentos / Oficinas').textContent).toMatch(/R\$\s*0,00/);
    });
    expect(screen.getByLabelText('Em andamento').className).toMatch(/kpi--ativa/);
    const tabela = screen.getByRole('table', { name: 'Fichas em andamento' });
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar entrega da ficha OC-08' }));
    expect(screen.getByRole('dialog').textContent).toMatch(/Confirma que esta ficha foi entregue pela oficina\?/);
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(confirmarEntrega).not.toHaveBeenCalled();
    expect(within(tabela).getByText('OC-08')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Confirmar entrega da ficha OC-08' }));
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar' }));
    await waitFor(() => {
      expect(confirmarEntrega).toHaveBeenCalledWith(10);
    });
    expect(confirmarEntrega).toHaveBeenCalledTimes(1);
    await waitFor(() => {
      expect(screen.getByLabelText('Em andamento').textContent).toMatch(/1/);
      expect(screen.getByLabelText('Entregues').textContent).toMatch(/1/);
      expect(screen.getByLabelText('Pagamentos / Oficinas').textContent).toMatch(/48/);
    });
    expect(within(tabela).queryByText('OC-08')).toBeNull();
    expect(within(tabela).getByText('OC-09')).toBeTruthy();
    expect(within(tabela).getByText('Atrasado')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Confirmar entrega da ficha OC-08' })).toBeNull();
    expect(await screen.findByText(/OC-08 entregue pela oficina/)).toBeTruthy();

    fireEvent.click(screen.getByLabelText('Entregues'));
    const entregues = screen.getByLabelText('Dados de Entregues');
    const oc08Entregue = within(entregues).getByLabelText('OC entregue OC-08');
    expect(within(oc08Entregue).getByText('OC-08')).toBeTruthy();
    expect(within(oc08Entregue).getByText('Entregue')).toBeTruthy();
    expect(within(oc08Entregue).getByText('08/11/2026 19:32')).toBeTruthy();
    expect(within(oc08Entregue).getByText('PENDENTE')).toBeTruthy();
    expect(within(entregues).getByRole('button', { name: 'Enviar OC-08 para expedição' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Confirmar entrega da ficha OC-08' })).toBeNull();

    fireEvent.click(screen.getByLabelText('Pagamentos / Oficinas'));
    const pagamentos = screen.getByLabelText('Dados de Pagamentos / Oficinas');
    const tabelaPagamentos = within(pagamentos).getByRole('table', { name: 'Pagamentos de oficinas' });
    expect(within(tabelaPagamentos).getByText('OC')).toBeTruthy();
    expect(within(tabelaPagamentos).getByText('Oficina')).toBeTruthy();
    expect(within(tabelaPagamentos).getByText('Costureiro')).toBeTruthy();
    expect(within(tabelaPagamentos).getByText('Modelo / referência')).toBeTruthy();
    expect(within(tabelaPagamentos).getByText('Cliente')).toBeTruthy();
    expect(within(tabelaPagamentos).getByText('Quantidade enviada')).toBeTruthy();
    expect(within(tabelaPagamentos).getByText('Valor por peça')).toBeTruthy();
    expect(within(tabelaPagamentos).getByText('Valor total')).toBeTruthy();
    expect(within(tabelaPagamentos).getByText('Valor pago')).toBeTruthy();
    expect(within(tabelaPagamentos).getByText('Saldo restante')).toBeTruthy();
    expect(within(tabelaPagamentos).getByText('Status')).toBeTruthy();
    expect(within(tabelaPagamentos).getByText('Data do pagamento')).toBeTruthy();
    expect(within(pagamentos).getByLabelText('Total pago às oficinas').textContent).toMatch(/R\$\s*0,00/);
    expect(within(pagamentos).getByLabelText('Total pendente').textContent).toMatch(/48/);
    expect(within(pagamentos).getByLabelText('Saldo total em aberto').textContent).toMatch(/48/);
    const oc08Pag = within(pagamentos).getByLabelText('Pagamento OC-08');
    expect(within(oc08Pag).getByText('PENDENTE')).toBeTruthy();
    expect(within(oc08Pag).getByText('OC-08')).toBeTruthy();
    expect(within(oc08Pag).getByText('Oficina Norte')).toBeTruthy();
    expect(within(oc08Pag).getByText('Ana Souza')).toBeTruthy();
    expect(within(oc08Pag).getByText('Camiseta Dry / DRY-01')).toBeTruthy();
    expect(within(oc08Pag).getByText('6')).toBeTruthy();
    expect(within(oc08Pag).getByText(/R\$\s*8,00/)).toBeTruthy();
    expect(within(oc08Pag).getAllByText(/R\$\s*48,00/).length).toBeGreaterThanOrEqual(2);
    expect(within(pagamentos).queryByLabelText('Pagamento OC-09')).toBeNull();
    const totalOficina = within(pagamentos).getByLabelText('Total Oficina Norte');
    expect(totalOficina.textContent).toMatch(/48/);
    const consolidado = within(pagamentos).getByLabelText('Total consolidado');
    expect(consolidado.textContent).toMatch(/48/);
  });

  it('calcula pagamentos só com OCs entregues, sem duplicar e com totais por oficina', async () => {
    const entregueNorte: FichaLiberacao = {
      ...ficha,
      id: 40,
      codigo: 'OC-20',
      ordem_id: 20,
      quantidade: 200,
      modelo: 'Camiseta Dry',
      referencia: 'DRY-01',
      status_processo: 'encaminhado',
      grade: [{ cor: 'Preto', tamanho: 'M', quantidade: 200 }],
      oficinas: [{ oficina: 'Oficina Norte', costureiro: 'Ana Souza', observacoes: '' }],
      liberacao: {
        costureiro: 'Ana Souza',
        valor_peca: 3.5,
        referencia: 'DRY-01',
        tipo_peca: 'Camiseta Dry',
        oficina: 'Oficina Norte',
        oficina_id: 1,
        data_liberacao: '2026-11-01',
        data_retirada: null,
        codigo_oc: 'OC-20',
        liberado_em: '2026-11-01 10:00:00',
        liberado_por: 1,
        liberado_por_nome: 'Marcos',
        entregue_em: '2026-11-08 09:00:00',
        entregue_por: 1,
        entregue_por_nome: 'Marcos',
      },
    };
    listar.mockResolvedValue({
      data: [],
      oficinas: ['Oficina Norte', 'Oficina Sul'],
      liberadas: [
        entregueNorte,
        {
          ...entregueNorte,
          id: 41,
          codigo: 'OC-20-dup',
          ordem_id: 20,
        },
        {
          ...ficha,
          id: 50,
          codigo: 'OC-21',
          ordem_id: 21,
          modelo: 'Calça Sport',
          referencia: 'CAL-02',
          status_processo: 'encaminhado',
          oficinas: [{ oficina: 'Oficina Sul', costureiro: 'Paulo Lima', observacoes: '' }],
          liberacao: {
            costureiro: 'Paulo Lima',
            valor_peca: 5,
            referencia: 'CAL-02',
            tipo_peca: 'Calça Sport',
            oficina: 'Oficina Sul',
            oficina_id: 2,
            data_liberacao: '2026-10-01',
            data_retirada: null,
            codigo_oc: 'OC-21',
            liberado_em: '2026-10-01 10:00:00',
            liberado_por: 1,
            liberado_por_nome: 'Marcos',
            entregue_em: '2026-10-12 14:00:00',
            entregue_por: 1,
            entregue_por_nome: 'Marcos',
          },
        },
        {
          ...ficha,
          id: 60,
          codigo: 'OC-22',
          ordem_id: 22,
          status_processo: 'encaminhado',
          oficinas: [{ oficina: 'Oficina Norte', costureiro: 'Ana Souza', observacoes: '' }],
          liberacao: {
            costureiro: 'Ana Souza',
            valor_peca: 8,
            referencia: 'DRY-01',
            tipo_peca: 'Camiseta Dry',
            oficina: 'Oficina Norte',
            oficina_id: 1,
            data_liberacao: '2026-11-05',
            data_retirada: null,
            codigo_oc: 'OC-22',
            liberado_em: '2026-11-05 10:00:00',
            liberado_por: 1,
            liberado_por_nome: 'Marcos',
          },
        },
      ],
    });
    render(<LiberacaoFichasPage />);
    await waitFor(() => {
      expect(screen.getByLabelText('Pagamentos / Oficinas').textContent).toMatch(/730/);
      expect(screen.getByLabelText('Em andamento').textContent).toMatch(/1/);
      expect(screen.getByLabelText('Entregues').textContent).toMatch(/2/);
    });
    fireEvent.click(screen.getByLabelText('Pagamentos / Oficinas'));
    const painel = screen.getByLabelText('Dados de Pagamentos / Oficinas');
    const tabela = within(painel).getByRole('table', { name: 'Pagamentos de oficinas' });
    const oc20 = within(tabela).getByLabelText('Pagamento OC-20');
    expect(within(oc20).getByText('200')).toBeTruthy();
    expect(within(oc20).getByText(/R\$\s*3,50/)).toBeTruthy();
    expect(within(oc20).getAllByText(/R\$\s*700,00/).length).toBeGreaterThanOrEqual(2);
    const oc21 = within(tabela).getByLabelText('Pagamento OC-21');
    expect(within(oc21).getByText('Oficina Sul')).toBeTruthy();
    expect(within(oc21).getAllByText(/R\$\s*30,00/).length).toBeGreaterThanOrEqual(1);
    expect(within(tabela).queryByLabelText('Pagamento OC-20-dup')).toBeNull();
    expect(within(tabela).queryByLabelText('Pagamento OC-22')).toBeNull();
    expect(within(painel).getByLabelText('Total Oficina Norte').textContent).toMatch(/700/);
    expect(within(painel).getByLabelText('Total Oficina Sul').textContent).toMatch(/30/);
    expect(within(painel).getByLabelText('Total consolidado').textContent).toMatch(/730/);
  });

  it('cadastra a chave Pix da oficina e prepara o pagamento sem marcar como pago', async () => {
    const copiar = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: copiar } });
    listar.mockResolvedValue({
      data: [],
      oficinas: ['Oficina Norte'],
      oficinas_pix: [{ id: 1, nome: 'Oficina Norte', chave_pix: '' }],
      liberadas: [
        {
          ...ficha,
          id: 40,
          codigo: 'OC-20',
          ordem_id: 20,
          quantidade: 200,
          status_processo: 'encaminhado',
          grade: [{ cor: 'Preto', tamanho: 'M', quantidade: 200 }],
          liberacao: {
            costureiro: 'Ana Souza',
            valor_peca: 3.5,
            referencia: 'DRY-01',
            tipo_peca: 'Camiseta Dry',
            oficina: 'Oficina Norte',
            oficina_id: 1,
            data_liberacao: '2026-11-01',
            data_retirada: null,
            codigo_oc: 'OC-20',
            liberado_em: '2026-11-01 10:00:00',
            liberado_por: 1,
            liberado_por_nome: 'Marcos',
            entregue_em: '2026-11-08 09:00:00',
            entregue_por: 1,
            entregue_por_nome: 'Marcos',
          },
        },
      ],
    });
    render(<LiberacaoFichasPage />);
    await waitFor(() => {
      expect(screen.getByLabelText('Pagamentos / Oficinas').textContent).toMatch(/700/);
    });
    fireEvent.click(screen.getByLabelText('Pagamentos / Oficinas'));
    const painel = screen.getByLabelText('Dados de Pagamentos / Oficinas');
    expect(within(painel).getByLabelText('Pagamento OC-20')).toBeTruthy();
    fireEvent.click(within(painel).getByRole('button', { name: 'Pagar via Pix Oficina Norte' }));
    expect(within(painel).getByText(/Cadastre a chave Pix desta oficina/)).toBeTruthy();
    expect(screen.queryByRole('dialog')).toBeNull();

    fireEvent.change(within(painel).getByLabelText('Chave Pix Oficina Norte'), {
      target: { value: '11988887777' },
    });
    fireEvent.click(within(painel).getByRole('button', { name: 'Salvar chave Pix Oficina Norte' }));
    await waitFor(() => {
      expect(salvarPix).toHaveBeenCalledWith('Oficina Norte', '11988887777');
    });
    expect(await screen.findByText(/Chave Pix de Oficina Norte gravada/)).toBeTruthy();

    fireEvent.click(within(painel).getByRole('button', { name: 'Pagar via Pix Oficina Norte' }));
    const dialog = screen.getByRole('dialog');
    expect(dialog.textContent).toMatch(/Pagar Oficina Norte via Pix/);
    expect(dialog.textContent).toMatch(/R\$\s*700,00/);
    expect(dialog.textContent).toMatch(/11988887777/);
    expect(dialog.textContent).toMatch(/não marca a oficina como paga/i);
    expect(within(dialog).queryByRole('button', { name: /marcar como pago/i })).toBeNull();
    const codigo = (within(dialog).getByLabelText('Código Pix copia e cola') as HTMLTextAreaElement).value;
    expect(codigo).toContain('11988887777');
    expect(codigo).toContain('700.00');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Abrir banco' }));
    await waitFor(() => {
      expect(copiar).toHaveBeenCalledWith(codigo);
    });
    expect(screen.getByLabelText('Pagamentos / Oficinas').textContent).toMatch(/700/);
  });

  it('mostra o indicador de expedição e encaminha a OC entregue sem tirar o pagamento', async () => {
    const entregue: FichaLiberacao = {
      ...ficha,
      id: 40,
      codigo: 'OC-20',
      ordem_id: 20,
      status_processo: 'entregue',
      grade: [{ cor: 'Preto', tamanho: 'M', quantidade: 6 }],
      oficinas: [{ oficina: 'Oficina Norte', costureiro: 'Ana Souza', observacoes: '' }],
      liberacao: {
        costureiro: 'Ana Souza',
        valor_peca: 8,
        referencia: 'DRY-01',
        tipo_peca: 'Camiseta Dry',
        oficina: 'Oficina Norte',
        oficina_id: 1,
        data_liberacao: '2026-11-01',
        data_retirada: null,
        codigo_oc: 'OC-20',
        liberado_em: '2026-11-01 10:00:00',
        liberado_por: 1,
        liberado_por_nome: 'Marcos',
        entregue_em: '2026-11-08 09:00:00',
        entregue_por: 1,
        entregue_por_nome: 'Marcos',
      },
    };
    listar.mockResolvedValue({
      data: [],
      oficinas: ['Oficina Norte'],
      oficinas_pix: [],
      liberadas: [entregue],
    });
    encaminharExpedicao.mockResolvedValue({
      ...entregue,
      status_processo: 'expedicao',
      expedicao: {
        id: 1,
        ordem_id: 20,
        ordem_corte_id: 40,
        codigo_oc: 'OC-20',
        oficina: 'Oficina Norte',
        costureiro: 'Ana Souza',
        modelo: 'Camiseta Dry',
        referencia: 'DRY-01',
        pecas: 6,
        status: 'pronto_envio',
        encaminhado_em: '2026-11-08 21:40:00',
        data_expedicao: null,
        data_entrega: null,
        observacoes: null,
      },
    });
    render(<LiberacaoFichasPage />);
    await waitFor(() => {
      expect(screen.getByLabelText('Entregues').textContent).toMatch(/1/);
      expect(screen.getByLabelText('Expedição').textContent).toMatch(/0/);
      expect(screen.getByLabelText('Pagamentos / Oficinas').textContent).toMatch(/48/);
    });

    fireEvent.click(screen.getByLabelText('Entregues'));
    const entregues = screen.getByLabelText('Dados de Entregues');
    const linha = within(entregues).getByLabelText('OC entregue OC-20');
    expect(within(linha).getByRole('button', { name: 'Enviar OC-20 para expedição' })).toBeTruthy();
    fireEvent.click(within(linha).getByRole('button', { name: 'Enviar OC-20 para expedição' }));
    expect(screen.getByRole('dialog').textContent).toMatch(/Encaminhar esta OC para expedição/);
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }));
    expect(encaminharExpedicao).not.toHaveBeenCalled();

    fireEvent.click(within(entregues).getByRole('button', { name: 'Enviar OC-20 para expedição' }));
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar' }));
    await waitFor(() => {
      expect(encaminharExpedicao).toHaveBeenCalledWith(20);
    });
    await waitFor(() => {
      expect(screen.getByLabelText('Entregues').textContent).toMatch(/1/);
      expect(screen.getByLabelText('Expedição').textContent).toMatch(/1/);
      expect(screen.getByLabelText('Pagamentos / Oficinas').textContent).toMatch(/48/);
    });
    expect(await screen.findByText(/OC-20 encaminhada para expedição/)).toBeTruthy();
    const linhaDepois = within(entregues).getByLabelText('OC entregue OC-20');
    expect(within(linhaDepois).getByText('Enviada para Expedição')).toBeTruthy();
    expect(within(entregues).queryByRole('button', { name: 'Enviar OC-20 para expedição' })).toBeNull();

    fireEvent.click(screen.getByLabelText('Expedição'));
    const expedicao = screen.getByLabelText('Dados de Expedição');
    const linhaExp = within(expedicao).getByLabelText('OC em expedição OC-20');
    expect(linhaExp.textContent).toMatch(/OC-20/);
    expect(linhaExp.textContent).toMatch(/Oficina Norte/);
    expect(linhaExp.textContent).toMatch(/Ana Souza/);
    expect(linhaExp.textContent).toMatch(/Camiseta Dry/);
    expect(linhaExp.textContent).toMatch(/DRY-01/);
    expect(within(linhaExp).getByLabelText('Quantidade enviada pela oficina').textContent).toMatch(/6 peças/);
    expect((within(linhaExp).getByLabelText('Quantidade conferida da OC-20') as HTMLInputElement).value).toBe('6');
    expect(within(linhaExp).getByText(/08\/11\/2026 21:40/)).toBeTruthy();
    expect(within(linhaExp).getByText('Pronto para envio')).toBeTruthy();
    expect(within(expedicao).queryByRole('button', { name: 'Enviar OC-20 para expedição' })).toBeNull();
  });

  it('grava a quantidade conferida na expedição sem alterar o pagamento da oficina', async () => {
    const enviada: FichaLiberacao = {
      ...ficha,
      id: 41,
      codigo: 'OC-21',
      ordem_id: 21,
      status_processo: 'expedicao',
      grade: [{ cor: 'Preto', tamanho: 'M', quantidade: 6 }],
      oficinas: [{ oficina: 'Oficina Norte', costureiro: 'Ana Souza', observacoes: '' }],
      liberacao: {
        costureiro: 'Ana Souza',
        valor_peca: 8,
        referencia: 'DRY-01',
        tipo_peca: 'Camiseta Dry',
        oficina: 'Oficina Norte',
        oficina_id: 1,
        data_liberacao: '2026-11-01',
        data_retirada: null,
        codigo_oc: 'OC-21',
        liberado_em: '2026-11-01 10:00:00',
        liberado_por: 1,
        liberado_por_nome: 'Marcos',
        entregue_em: '2026-11-08 09:00:00',
        entregue_por: 1,
        entregue_por_nome: 'Marcos',
      },
      expedicao: {
        id: 2,
        ordem_id: 21,
        ordem_corte_id: 41,
        codigo_oc: 'OC-21',
        oficina: 'Oficina Norte',
        costureiro: 'Ana Souza',
        modelo: 'Camiseta Dry',
        referencia: 'DRY-01',
        pecas: 6,
        pecas_conferidas: null,
        pecas_expedicao: 6,
        conferido_em: null,
        conferido_por: null,
        conferido_por_nome: null,
        status: 'pronto_envio',
        encaminhado_em: '2026-11-08 21:40:00',
        data_expedicao: null,
        data_entrega: null,
        observacoes: null,
      },
    };
    const conferida: FichaLiberacao = {
      ...enviada,
      expedicao: {
        ...enviada.expedicao!,
        pecas: 6,
        pecas_conferidas: 4,
        pecas_expedicao: 4,
        conferido_em: '2026-11-08 22:10:00',
        conferido_por: 1,
        conferido_por_nome: 'Marcos',
        status: 'conferido',
      },
    };
    listar.mockResolvedValue({
      data: [],
      oficinas: ['Oficina Norte'],
      oficinas_pix: [],
      liberadas: [enviada],
    });
    salvarConferencia.mockImplementation(async () => {
      listar.mockResolvedValue({
        data: [],
        oficinas: ['Oficina Norte'],
        oficinas_pix: [],
        liberadas: [conferida],
      });
      return conferida;
    });
    render(<LiberacaoFichasPage />);
    await waitFor(() => {
      expect(screen.getByLabelText('Expedição').textContent).toMatch(/1/);
      expect(screen.getByLabelText('Pagamentos / Oficinas').textContent).toMatch(/48/);
    });
    fireEvent.click(screen.getByLabelText('Expedição'));
    const expedicao = screen.getByLabelText('Dados de Expedição');
    const linha = within(expedicao).getByLabelText('OC em expedição OC-21');
    expect(within(linha).getByLabelText('Quantidade enviada pela oficina').textContent).toMatch(/6 peças/);
    const campo = within(linha).getByLabelText('Quantidade conferida da OC-21') as HTMLInputElement;
    expect(campo.value).toBe('6');
    fireEvent.change(campo, { target: { value: '4' } });
    expect(within(linha).getByLabelText('Diferença da OC-21').textContent).toMatch(/-2 peças/);
    fireEvent.click(within(linha).getByRole('button', { name: 'Salvar conferência da OC-21' }));
    await waitFor(() => {
      expect(salvarConferencia).toHaveBeenCalledWith(21, 4);
    });
    expect(await within(linha).findByText('Conferência salva com sucesso!')).toBeTruthy();
    expect(screen.getAllByText('Conferência salva com sucesso!').length).toBeGreaterThan(0);
    expect(within(linha).getByText('Conferido')).toBeTruthy();
    expect(within(linha).getByLabelText('Quantidade enviada pela oficina').textContent).toMatch(/6 peças/);
    expect((within(linha).getByLabelText('Quantidade conferida da OC-21') as HTMLInputElement).value).toBe('4');
    expect(within(linha).getByLabelText('Diferença da OC-21').textContent).toMatch(/-2 peças/);
    expect(within(linha).getByText(/Conferida por Marcos em 08\/11\/2026 22:10/)).toBeTruthy();
    expect(screen.getByLabelText('Pagamentos / Oficinas').textContent).toMatch(/48/);

    fireEvent.click(within(linha).getByRole('button', { name: 'Salvar conferência da OC-21' }));
    await waitFor(() => {
      expect(salvarConferencia).toHaveBeenCalledTimes(2);
    });
    expect(screen.getAllByText('Conferência salva com sucesso!').length).toBeGreaterThan(0);
    expect(within(linha).getByText('Conferido')).toBeTruthy();
  });
});
