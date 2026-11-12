import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./api', async () => {
  const actual = await vi.importActual<typeof import('./api')>('./api');
  return {
    ...actual,
    obterOrdemCorte: vi.fn(),
    atualizarOrdemCorte: vi.fn(),
    listarHistoricoOrdemCorte: vi.fn(),
    listarAviamentos: vi.fn(),
    listarCores: vi.fn(),
    listarTamanhos: vi.fn(),
    listarMateriasPrimas: vi.fn(),
    enviarOrdemCorteEnfesto: vi.fn(),
    publicarFichaNova: vi.fn(),
    listarClientes: vi.fn(),
    criarCliente: vi.fn(),
    listarSugestoesFichaCorte: vi.fn(),
    obterRascunhoFichaCorte: vi.fn(),
    salvarRascunhoFichaCorte: vi.fn(),
  };
});

import {
  atualizarOrdemCorte,
  listarAviamentos,
  listarCores,
  listarHistoricoOrdemCorte,
  enviarOrdemCorteEnfesto,
  listarMateriasPrimas,
  listarTamanhos,
  listarClientes,
  listarSugestoesFichaCorte,
  obterOrdemCorte,
  obterRascunhoFichaCorte,
  publicarFichaNova,
  salvarRascunhoFichaCorte,
  type MateriaPrima,
  type OrdemCorte,
  type OrdemProducao,
} from './api';
import { OrdemCorteFichaPage } from './OrdemCorteFichaPage';

const obter = vi.mocked(obterOrdemCorte);
const atualizar = vi.mocked(atualizarOrdemCorte);
const historico = vi.mocked(listarHistoricoOrdemCorte);
const aviamentos = vi.mocked(listarAviamentos);
const cores = vi.mocked(listarCores);
const tamanhos = vi.mocked(listarTamanhos);
const tecidos = vi.mocked(listarMateriasPrimas);
const enviar = vi.mocked(enviarOrdemCorteEnfesto);
const publicar = vi.mocked(publicarFichaNova);
const clientes = vi.mocked(listarClientes);
const sugestoes = vi.mocked(listarSugestoesFichaCorte);
const rascunho = vi.mocked(obterRascunhoFichaCorte);
const salvarRascunho = vi.mocked(salvarRascunhoFichaCorte);

const tecidoCadastro: MateriaPrima = {
  id: 7,
  codigo: 'MALHA-PV',
  nome: 'Malha PV',
  descricao: null,
  tipo: 'tecido',
  categoria: null,
  cor: 'Preto',
  composicao: '67% poliéster 33% viscose',
  largura_cm: 160,
  gramatura: 180,
  unidade: 'KG',
  custo: 0,
  estoque_minimo: 0,
  estoque_atual: 0,
  fornecedor: null,
  referencia_fornecedor: null,
  ncm: null,
  status: 'ativo',
  observacoes: null,
  criado_em: '2026-11-06',
  atualizado_em: '2026-11-06',
};

const ficha: OrdemCorte = {
  id: 1,
  codigo: 'OC-01',
  ordem_id: 4,
  cliente: 'Loja Norte',
  produto: 'Camiseta',
  quantidade: 5,
  prioridade: 'normal',
  data_prevista: '2026-11-20',
  responsavel: null,
  observacoes: null,
  cliente_id: null,
  produto_id: 9,
  criado_em: '2026-11-06',
  modelo: 'Camiseta Dry',
  composicao: 'Malha PV',
  referencia: 'CAM-01',
  informacoes_oficina: '',
  data_retirada: '2026-11-20',
  informacoes_costureiros: '',
  informacoes_acabamento: '',
  status_processo: 'em_preenchimento',
  materia_prima_id: null,
  tamanhos: ['P', 'M', 'G', 'GG', 'XG'],
  linhas: [{ cor: 'Preto', detalhes: '' }],
  aviamentos: [],
  oficinas: [],
  materiais: [
    {
      materia_prima_id: 1,
      nome: 'Malha PV',
      codigo: 'MALHA-OC',
      quantidade_total: 1.2,
      unidade: 'KG',
      estoque_disponivel: 0,
      suficiente: false,
    },
  ],
  grade: [
    { cor: 'Preto', tamanho: 'M', quantidade: 3 },
    { cor: 'Preto', tamanho: 'G', quantidade: 2 },
  ],
};

function valor(label: string, role: 'textbox' | 'combobox' | 'spinbutton' = 'textbox'): string {
  return (screen.getByRole(role, { name: label }) as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement)
    .value;
}

describe('ficha de ordem de corte', () => {
  afterEach(() => cleanup());

  beforeEach(() => {
    vi.clearAllMocks();
    obter.mockResolvedValue(ficha);
    enviar.mockResolvedValue({ ...ficha, status_processo: 'aguardando_enfesto' });
    atualizar.mockImplementation(async (_id, dados) => ({
      ...ficha,
      ...dados,
      quantidade: (dados.grade ?? ficha.grade).reduce((soma, celula) => soma + celula.quantidade, 0),
    }));
    historico.mockResolvedValue([
      { id: 1, usuario_id: 1, usuario_nome: 'Marcos', acao: 'criar', resumo: 'Criou a ficha de produção', criado_em: '2026-11-06' },
    ]);
    aviamentos.mockResolvedValue({
      data: [],
      pagina: 1,
      por_pagina: 200,
      total: 0,
      total_paginas: 1,
    });
    cores.mockResolvedValue([{ id: 1, nome: 'Branco' }]);
    tamanhos.mockResolvedValue([{ id: 1, nome: 'P', ordem: 1 }]);
    tecidos.mockResolvedValue({
      data: [tecidoCadastro],
      pagina: 1,
      por_pagina: 200,
      total: 1,
      total_paginas: 1,
    });
    clientes.mockResolvedValue({
      data: [{ id: 3, nome: 'Loja Norte', cpf_cnpj: null, contato: null, telefone: null, whatsapp: null, email: null, endereco: null, cidade: null, estado: null, cep: null, condicao_pagamento: null, limite_credito: 0, status: 'ativo', observacoes: null, criado_em: '', atualizado_em: '' }],
      pagina: 1,
      por_pagina: 50,
      total: 1,
      total_paginas: 1,
    });
    sugestoes.mockResolvedValue({
      modelos: [{ id: 'p-9', rotulo: 'CAM-01 — Camiseta Dry', produto_id: 9, nome: 'Camiseta Dry', sku: 'CAM-01', modelo: 'Camiseta Dry', referencia: 'CAM-01' }],
      referencias: [{ id: 'p-9', rotulo: 'CAM-01 — Camiseta Dry', produto_id: 9, nome: 'Camiseta Dry', sku: 'CAM-01', modelo: 'Camiseta Dry', referencia: 'CAM-01' }],
    });
    rascunho.mockResolvedValue({ payload: { codigo: 'OC-01' }, atualizado_em: null });
    salvarRascunho.mockResolvedValue(undefined);
  });

  it('mostra as seções editáveis, totais da grade e permite adicionar oficina e cor', async () => {
    render(<OrdemCorteFichaPage ordemId={4} onVoltar={() => undefined} />);

    expect(await screen.findByDisplayValue('Camiseta Dry')).toBeTruthy();
    expect(screen.getByLabelText('Ficha de produção')).toBeTruthy();
    expect(screen.queryByRole('tab', { name: '10. Grade' })).toBeNull();
    expect(valor('Modelo', 'combobox')).toBe('Camiseta Dry');
    expect(valor('Composição')).toBe('Malha PV');
    expect(valor('Tecido cadastrado', 'combobox')).toBe('');
    expect(valor('Referência', 'combobox')).toBe('CAM-01');
    expect(valor('Número da O.C.')).toBe('OC-01');
    expect((screen.getByLabelText('Número da O.C.') as HTMLInputElement).readOnly).toBe(true);
    expect(screen.getByText(/MALHA-OC/)).toBeTruthy();
    expect(screen.getByLabelText('Total geral da grade').textContent).toBe('5');
    expect((screen.getByRole('link', { name: 'Imprimir / PDF' }) as HTMLAnchorElement).getAttribute('href')).toBe(
      '/api/ordens/4/ordem-corte/impressao',
    );
    expect(screen.getByRole('button', { name: 'Enviar para enfesto e corte' })).toBeTruthy();
    expect(screen.getByText('Em preenchimento')).toBeTruthy();

    fireEvent.change(screen.getByLabelText('Modelo'), { target: { value: 'Camiseta Polo' } });
    fireEvent.change(screen.getByLabelText('Referência'), { target: { value: 'POLO-01' } });
    fireEvent.change(screen.getByLabelText('Informações para oficina'), { target: { value: 'Não refilar' } });
    fireEvent.change(screen.getByLabelText('Informações de acabamento'), { target: { value: 'Overlock' } });
    fireEvent.change(screen.getByLabelText('Observações da ficha'), { target: { value: 'Obs da OC' } });
    fireEvent.change(screen.getByLabelText('Descrição do aviamento 1'), { target: { value: 'Etiqueta' } });
    fireEvent.change(screen.getByLabelText('Quantidade do aviamento 1'), { target: { value: '5' } });

    fireEvent.change(screen.getByLabelText('Quantidade Preto M'), { target: { value: '4' } });
    expect(screen.getByLabelText('Total geral da grade').textContent).toBe('6');

    fireEvent.change(screen.getByLabelText('Nova cor da grade'), { target: { value: 'Branco' } });
    fireEvent.click(screen.getByRole('button', { name: 'Adicionar cor' }));
    expect(valor('Cor 2', 'combobox')).toBe('Branco');

    fireEvent.click(screen.getByRole('button', { name: 'Adicionar oficina' }));
    fireEvent.change(screen.getByLabelText('Oficina 1'), { target: { value: 'Oficina Norte' } });
    fireEvent.change(screen.getByLabelText('Costureiro 1'), { target: { value: 'Ana' } });
    expect(screen.getByDisplayValue('Oficina Norte')).toBeTruthy();

    await waitFor(() => expect(atualizar).toHaveBeenCalled(), { timeout: 3000 });
    const payload = atualizar.mock.calls.at(-1)?.[1];
    expect(payload?.modelo).toBe('Camiseta Polo');
    expect(payload?.referencia).toBe('POLO-01');
    expect(payload?.informacoes_oficina).toBe('Não refilar');
    expect(payload?.informacoes_acabamento).toBe('Overlock');
    expect(payload?.observacoes).toBe('Obs da OC');
    expect(payload?.aviamentos?.[0]).toEqual(expect.objectContaining({ descricao: 'Etiqueta', quantidade: 5 }));
    expect(payload?.oficinas?.[0]).toEqual(expect.objectContaining({ oficina: 'Oficina Norte', costureiro: 'Ana' }));
    expect(payload?.linhas?.some((linha) => linha.cor === 'Branco')).toBe(true);
  });

  it('preenche a composição pelo cadastro do tecido e permite editar depois', async () => {
    render(<OrdemCorteFichaPage ordemId={4} onVoltar={() => undefined} />);
    expect(await screen.findByLabelText('Tecido cadastrado')).toBeTruthy();

    fireEvent.change(screen.getByRole('combobox', { name: 'Tecido cadastrado' }), { target: { value: '7' } });
    expect(valor('Composição')).toBe('67% poliéster 33% viscose');

    fireEvent.change(screen.getByRole('textbox', { name: 'Composição' }), { target: { value: '100% algodão' } });
    expect(valor('Composição')).toBe('100% algodão');

    await waitFor(() => expect(atualizar).toHaveBeenCalled(), { timeout: 3000 });
    const payload = atualizar.mock.calls.at(-1)?.[1];
    expect(payload?.composicao).toBe('100% algodão');
    expect(payload?.materia_prima_id).toBe(7);
  });

  it('preenche nome, largura, gramatura, unidade, composição e cor pelo cadastro, sem alterar o material', async () => {
    render(<OrdemCorteFichaPage ordemId={4} onVoltar={() => undefined} />);
    fireEvent.change(await screen.findByRole('combobox', { name: 'Tecido cadastrado' }), { target: { value: '7' } });

    expect((screen.getByLabelText('Nome do tecido') as HTMLInputElement).value).toBe('Malha PV');
    expect((screen.getByLabelText('Largura do tecido') as HTMLInputElement).value).toBe('160');
    expect((screen.getByLabelText('Gramatura do tecido') as HTMLInputElement).value).toBe('180');
    expect((screen.getByLabelText('Unidade de controle do tecido') as HTMLSelectElement).value).toBe('KG');
    expect((screen.getByLabelText('Composição do tecido') as HTMLInputElement).value).toBe(
      '67% poliéster 33% viscose',
    );
    expect((screen.getByLabelText('Cor do tecido') as HTMLInputElement).value).toBe('Preto');
    expect(screen.getByText(/cadastro original do material não é alterado/)).toBeTruthy();
    expect(valor('Composição')).toBe('67% poliéster 33% viscose');
  });

  it('grava largura 1,60, gramatura decimal e rolo alfanumérico sem alterar o cadastro', async () => {
    render(<OrdemCorteFichaPage ordemId={4} onVoltar={() => undefined} />);
    fireEvent.change(await screen.findByRole('combobox', { name: 'Tecido cadastrado' }), { target: { value: '7' } });

    fireEvent.change(screen.getByLabelText('Unidade da largura'), { target: { value: 'm' } });
    fireEvent.change(screen.getByLabelText('Largura do tecido'), { target: { value: '1,60' } });
    fireEvent.change(screen.getByLabelText('Gramatura do tecido'), { target: { value: '180,5' } });
    fireEvent.change(screen.getByLabelText('Número do rolo'), { target: { value: 'R-12A' } });

    expect((screen.getByLabelText('Largura do tecido') as HTMLInputElement).value).toBe('1,60');
    expect((screen.getByLabelText('Unidade da largura') as HTMLSelectElement).value).toBe('m');
    expect((screen.getByLabelText('Número do rolo') as HTMLInputElement).value).toBe('R-12A');

    await waitFor(() => expect(atualizar).toHaveBeenCalled(), { timeout: 3000 });
    const payload = atualizar.mock.calls.at(-1)?.[1];
    expect(payload?.tecido_largura_cm).toBe(1.6);
    expect(payload?.tecido_largura_unidade).toBe('m');
    expect(payload?.tecido_gramatura).toBe(180.5);
    expect(payload?.tecido_numero_rolo).toBe('R-12A');
  });

  it('avisa quando o tecido em KG está sem largura ou gramatura no cadastro', async () => {
    tecidos.mockResolvedValue({
      data: [{ ...tecidoCadastro, largura_cm: null, gramatura: null }],
      pagina: 1,
      por_pagina: 200,
      total: 1,
      total_paginas: 1,
    });
    render(<OrdemCorteFichaPage ordemId={4} onVoltar={() => undefined} />);
    fireEvent.change(await screen.findByRole('combobox', { name: 'Tecido cadastrado' }), { target: { value: '7' } });
    expect(screen.getByRole('status').textContent).toBe('Falta largura e gramatura no cadastro do tecido');
  });

  it('envia a mesma OC para a fila de enfesto e corte', async () => {
    enviar.mockResolvedValue({
      ...ficha,
      status_processo: 'aguardando_enfesto',
      enviado_enfesto_em: '2026-11-07 12:00:00',
      enviado_por_nome: 'Marcos',
    });
    historico.mockResolvedValue([
      { id: 2, usuario_id: 1, usuario_nome: 'Marcos', acao: 'enviar_enfesto', resumo: 'Enviou a ficha para enfesto e corte', criado_em: '2026-11-07' },
      { id: 1, usuario_id: 1, usuario_nome: 'Marcos', acao: 'criar', resumo: 'Criou a ficha de produção', criado_em: '2026-11-06' },
    ]);
    render(<OrdemCorteFichaPage ordemId={4} onVoltar={() => undefined} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Enviar para enfesto e corte' }));
    await waitFor(() => expect(enviar).toHaveBeenCalledWith(4));
    expect(await screen.findByText('Aguardando enfesto e corte')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Enviar para enfesto e corte' })).toBeNull();
  });

  it('abre ficha nova, preenche composição pelo tecido e publica OP+OC ao enviar', async () => {
    const onPublicada = vi.fn();
    publicar.mockResolvedValue({
      ordem: {
        id: 12,
        codigo: 'OP-0012',
        cliente: 'Loja Nova',
        produto: 'Camiseta Polo',
        tamanho: '',
        quantidade: 3,
        status: 'planejada',
        prioridade: 'normal',
        data_prevista: null,
        observacoes: null,
        responsavel: null,
        cliente_id: null,
        produto_id: null,
        variante_id: null,
        criado_em: '2026-11-07',
        atualizado_em: null,
      } as OrdemProducao,
      corte: {
        ...ficha,
        id: 9,
        codigo: 'OC-09',
        ordem_id: 12,
        cliente: 'Loja Nova',
        modelo: 'Camiseta Polo',
        composicao: '67% poliéster 33% viscose',
        status_processo: 'aguardando_enfesto',
      },
    });
    render(<OrdemCorteFichaPage onVoltar={() => undefined} onPublicada={onPublicada} />);

    expect(await screen.findByRole('heading', { name: /Nova ficha/ })).toBeTruthy();
    expect(valor('Número da O.C.')).toBe('OC-01');
    expect((screen.getByLabelText('Número da O.C.') as HTMLInputElement).readOnly).toBe(true);
    expect(obter).not.toHaveBeenCalled();
    expect(screen.queryByRole('link', { name: 'Imprimir / PDF' })).toBeNull();
    expect(screen.queryByText('Nova ordem de produção')).toBeNull();

    fireEvent.change(screen.getByLabelText('Cliente'), { target: { value: 'Loja Nova' } });
    fireEvent.change(screen.getByLabelText('Modelo'), { target: { value: 'Camiseta Polo' } });
    fireEvent.change(screen.getByRole('combobox', { name: 'Tecido cadastrado' }), { target: { value: '7' } });
    expect(valor('Composição')).toBe('67% poliéster 33% viscose');
    expect((screen.getByLabelText('Cor 1') as HTMLInputElement).value).toBe('Preto');
    fireEvent.change(screen.getByLabelText('Cor 1'), { target: { value: 'Preto' } });
    fireEvent.change(screen.getByLabelText('Quantidade Preto M'), { target: { value: '3' } });

    fireEvent.click(screen.getByRole('button', { name: 'Enviar para enfesto e corte' }));
    await waitFor(() => expect(publicar).toHaveBeenCalled());
    const payload = publicar.mock.calls[0]?.[0];
    expect(payload?.cliente).toBe('Loja Nova');
    expect(payload?.ficha.codigo).toBe('OC-01');
    expect(payload?.ficha.modelo).toBe('Camiseta Polo');
    expect(payload?.ficha.composicao).toBe('67% poliéster 33% viscose');
    expect(payload?.ficha.materia_prima_id).toBe(7);
    expect(payload?.ficha.grade?.some((celula) => celula.cor === 'Preto' && celula.tamanho === 'M' && celula.quantidade === 3)).toBe(
      true,
    );
    expect(enviar).not.toHaveBeenCalled();
    expect(atualizar).not.toHaveBeenCalled();
    await waitFor(() => expect(onPublicada).toHaveBeenCalled());
  });

  it('recupera o rascunho salvo e pesquisa cliente, modelo e referência', async () => {
    rascunho.mockResolvedValue({
      payload: {
        ...{
          codigo: 'OC-07',
          cliente: 'Loja Norte',
          cliente_id: 3,
          modelo: 'Camiseta Dry',
          referencia: 'CAM-01',
          produto_id: 9,
          tecido_largura_cm: 1.6,
          tecido_largura_unidade: 'm',
          tecido_gramatura: 180.5,
          tecido_numero_rolo: 'R-12A',
        },
      },
      atualizado_em: '2026-11-08',
    });
    render(<OrdemCorteFichaPage onVoltar={() => undefined} />);
    expect(await screen.findByDisplayValue('Loja Norte')).toBeTruthy();
    expect(valor('Número da O.C.')).toBe('OC-07');
    expect(valor('Modelo', 'combobox')).toBe('Camiseta Dry');
    expect(valor('Referência', 'combobox')).toBe('CAM-01');
    expect((screen.getByLabelText('Largura do tecido') as HTMLInputElement).value).toBe('1,60');
    expect((screen.getByLabelText('Unidade da largura') as HTMLSelectElement).value).toBe('m');
    expect((screen.getByLabelText('Número do rolo') as HTMLInputElement).value).toBe('R-12A');
    fireEvent.change(screen.getByLabelText('Número do rolo'), { target: { value: 'R-12A-2' } });
    await waitFor(() => expect(salvarRascunho).toHaveBeenCalled(), { timeout: 3000 });
    expect(salvarRascunho.mock.calls.at(-1)?.[0]?.tecido_largura_cm).toBe(1.6);
    expect(salvarRascunho.mock.calls.at(-1)?.[0]?.tecido_numero_rolo).toBe('R-12A-2');
  });

  it('reaproveita cliente, modelo e referência já cadastrados', async () => {
    render(<OrdemCorteFichaPage onVoltar={() => undefined} />);
    expect(await screen.findByRole('heading', { name: /Nova ficha/ })).toBeTruthy();

    fireEvent.focus(screen.getByLabelText('Cliente'));
    fireEvent.click(screen.getByRole('option', { name: 'Loja Norte' }));
    expect(valor('Cliente', 'combobox')).toBe('Loja Norte');

    fireEvent.focus(screen.getByLabelText('Modelo'));
    fireEvent.click(screen.getByRole('option', { name: 'CAM-01 — Camiseta Dry' }));
    expect(valor('Modelo', 'combobox')).toBe('Camiseta Dry');
    expect(valor('Referência', 'combobox')).toBe('CAM-01');
  });
});
