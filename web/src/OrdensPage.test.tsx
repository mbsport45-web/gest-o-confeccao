import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./api', async () => {
  const actual = await vi.importActual<typeof import('./api')>('./api');
  return {
    ...actual,
    listarOrdensPaginado: vi.fn(),
    listarClientes: vi.fn(),
    listarProdutos: vi.fn(),
    listarMateriasPrimas: vi.fn(),
    listarCores: vi.fn(),
    listarTamanhos: vi.fn(),
    obterFichaTecnica: vi.fn(),
    obterOrdem: vi.fn(),
    criarOrdem: vi.fn(),
    atualizarOrdem: vi.fn(),
    criarCor: vi.fn(),
    criarCliente: vi.fn(),
    criarProduto: vi.fn(),
  };
});

import {
  atualizarOrdem,
  criarCliente,
  criarCor,
  criarOrdem,
  criarProduto,
  listarClientes,
  listarCores,
  listarMateriasPrimas,
  listarOrdensPaginado,
  listarProdutos,
  listarTamanhos,
  obterFichaTecnica,
  obterOrdem,
  type OrdemProducao,
} from './api';
import { OrdensPage } from './OrdensPage';

const listar = vi.mocked(listarOrdensPaginado);
const clientes = vi.mocked(listarClientes);
const produtos = vi.mocked(listarProdutos);
const materias = vi.mocked(listarMateriasPrimas);
const cores = vi.mocked(listarCores);
const tamanhos = vi.mocked(listarTamanhos);
const ficha = vi.mocked(obterFichaTecnica);
const obter = vi.mocked(obterOrdem);
const criar = vi.mocked(criarOrdem);
const atualizar = vi.mocked(atualizarOrdem);
const cadastrarCor = vi.mocked(criarCor);
const novoCliente = vi.mocked(criarCliente);
const novoProduto = vi.mocked(criarProduto);

const acoesCadastro = { visualizar: true, criar: true, editar: true, excluir: true };
const sessao = {
  assinatura: { acesso: { operacional: true }, uso: {} } as never,
  permissoes: {
    escrever: true,
    equipe: false,
    modulos: { clientes: acoesCadastro, produtos: acoesCadastro },
  } as never,
};

const ordem: OrdemProducao = {
  id: 9,
  codigo: 'OP-0009',
  cliente: 'Loja Grade',
  produto: 'Bermuda',
  tamanho: 'M, G',
  quantidade: 5,
  status: 'planejada',
  prioridade: 'normal',
  data_prevista: null,
  observacoes: null,
  responsavel: null,
  cliente_id: 1,
  produto_id: 2,
  variante_id: null,
  referencia: 'REF-OP',
  criado_em: '',
  atualizado_em: null,
  requisitos: [],
  grade: [
    { cor: 'Preto', tamanho: 'M', quantidade: 3 },
    { cor: 'Preto', tamanho: 'G', quantidade: 2 },
  ],
};

function listaVazia() {
  return { data: [] as OrdemProducao[], pagina: 1, por_pagina: 8, total: 0, total_paginas: 1 };
}

async function escolher(rotulo: string, opcao: string) {
  const campo = await screen.findByRole('combobox', { name: rotulo });
  fireEvent.focus(campo);
  fireEvent.change(campo, { target: { value: opcao.slice(0, 4) } });
  fireEvent.click(await screen.findByRole('option', { name: opcao }));
}

describe('grade na tela de OP', () => {
  afterEach(() => cleanup());

  beforeEach(() => {
    vi.clearAllMocks();
    listar.mockResolvedValue(listaVazia());
    clientes.mockResolvedValue({
      data: [{ id: 1, nome: 'Loja Grade', cpf_cnpj: null, contato: null, telefone: null, email: null, cidade: null, estado: null, cep: null, condicao_pagamento: null, limite_credito: 0, status: 'ativo', observacoes: null, criado_em: '', atualizado_em: '', whatsapp: null, endereco: null }],
      pagina: 1,
      por_pagina: 20,
      total: 1,
      total_paginas: 1,
    });
    produtos.mockResolvedValue({
      data: [{
        id: 2,
        sku: 'BER-1',
        nome: 'Bermuda',
        descricao: null,
        categoria: null,
        subcategoria: null,
        marca: null,
        genero: null,
        colecao: null,
        cores: ['Preto'],
        tamanhos: ['M', 'G'],
        codigo_barras: null,
        unidade: 'UN',
        preco_venda: 0,
        preco_atacado: 0,
        preco_custo: 0,
        status: 'ativo',
        estoque_minimo: 0,
        imagem: null,
        observacoes: null,
        criado_em: '',
        atualizado_em: '',
        variantes: [],
      }],
      pagina: 1,
      por_pagina: 20,
      total: 1,
      total_paginas: 1,
    });
    materias.mockResolvedValue({ data: [], pagina: 1, por_pagina: 100, total: 0, total_paginas: 1 });
    cores.mockResolvedValue([{ id: 1, nome: 'Preto', codigo: 'PT' }, { id: 2, nome: 'Branco' }]);
    tamanhos.mockResolvedValue([
      { id: 1, nome: 'P', ordem: 1 },
      { id: 2, nome: 'M', ordem: 2 },
      { id: 3, nome: 'G', ordem: 3 },
      { id: 4, nome: 'GG', ordem: 4 },
      { id: 5, nome: 'G1', ordem: 5 },
      { id: 6, nome: 'G2', ordem: 6 },
      { id: 7, nome: 'G3', ordem: 7 },
    ]);
    ficha.mockResolvedValue({ produto_id: 2, variante_id: null, itens: [] });
    criar.mockResolvedValue(ordem);
    atualizar.mockResolvedValue(ordem);
    cadastrarCor.mockResolvedValue({ id: 8, nome: 'Oliva', ja_existia: false });
    novoCliente.mockResolvedValue({
      id: 11,
      nome: 'Atelier Novo',
      cpf_cnpj: '52998224725',
      contato: null,
      telefone: '11999990000',
      email: null,
      cidade: null,
      estado: null,
      cep: null,
      condicao_pagamento: null,
      limite_credito: 0,
      status: 'ativo',
      observacoes: null,
      criado_em: '',
      atualizado_em: '',
      whatsapp: null,
      endereco: null,
    });
    novoProduto.mockResolvedValue({
      id: 22,
      sku: 'CAM-NOVA',
      nome: 'Camisa Nova',
      descricao: null,
      categoria: null,
      subcategoria: null,
      marca: null,
      genero: null,
      colecao: null,
      cores: [],
      tamanhos: [],
      codigo_barras: null,
      unidade: 'UN',
      preco_venda: 0,
      preco_atacado: 0,
      preco_custo: 0,
      status: 'ativo',
      estoque_minimo: 0,
      imagem: null,
      observacoes: null,
      criado_em: '',
      atualizado_em: '',
      variantes: [],
    });
  });

  it('pesquisa cliente e produto, soma a grade na quantidade e cria a OP', async () => {
    render(<OrdensPage sessao={sessao} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Nova OP' }));
    await escolher('Cliente', 'Loja Grade');
    await escolher('Produto', 'BER-1 — Bermuda');
    const referencia = await screen.findByLabelText('Referência');
    expect(referencia).toHaveProperty('value', 'BER-1');
    expect(referencia).toHaveProperty('readOnly', false);
    expect(await screen.findByLabelText('Cor Preto')).toBeTruthy();

    fireEvent.change(referencia, { target: { value: 'REF-60' } });
    fireEvent.change(screen.getByLabelText('Quantidade Preto M'), { target: { value: '25' } });
    fireEvent.change(screen.getByLabelText('Quantidade Preto G'), { target: { value: '35' } });
    expect(screen.getByLabelText('Quantidade total (soma da grade)')).toHaveProperty('value', '60');
    expect(screen.getByLabelText('Quantidade total (soma da grade)')).toHaveProperty('readOnly', true);

    fireEvent.click(screen.getByRole('button', { name: 'Criar OP' }));
    await waitFor(() =>
      expect(criar).toHaveBeenCalledWith(
        expect.objectContaining({
          cliente_id: 1,
          produto_id: 2,
          quantidade: 60,
          referencia: 'REF-60',
          grade: expect.arrayContaining([
            { cor: 'Preto', tamanho: 'M', quantidade: 25 },
            { cor: 'Preto', tamanho: 'G', quantidade: 35 },
          ]),
        }),
      ),
    );
    expect(novoCliente).not.toHaveBeenCalled();
    expect(novoProduto).not.toHaveBeenCalled();
  });

  it('reabre a grade salva e atualiza a quantidade automaticamente na edição', async () => {
    listar.mockResolvedValue({ data: [ordem], pagina: 1, por_pagina: 8, total: 1, total_paginas: 1 });
    obter.mockResolvedValue(ordem);
    render(<OrdensPage sessao={sessao} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Editar' }));
    expect(await screen.findByLabelText('Referência')).toHaveProperty('value', 'REF-OP');
    expect(await screen.findByLabelText('Quantidade Preto M')).toHaveProperty('value', '3');
    expect(screen.getByLabelText('Quantidade Preto G')).toHaveProperty('value', '2');
    expect(screen.getByLabelText('Quantidade total (soma da grade)')).toHaveProperty('value', '5');
    fireEvent.change(screen.getByLabelText('Quantidade Preto M'), { target: { value: '2' } });
    fireEvent.change(screen.getByLabelText('Quantidade Preto G'), { target: { value: '3' } });
    expect(screen.getByLabelText('Quantidade total (soma da grade)')).toHaveProperty('value', '5');
    fireEvent.click(screen.getByRole('button', { name: 'Salvar alterações' }));
    await waitFor(() =>
      expect(atualizar).toHaveBeenCalledWith(
        9,
        expect.objectContaining({
          quantidade: 5,
          referencia: 'REF-OP',
          grade: expect.arrayContaining([
            { cor: 'Preto', tamanho: 'M', quantidade: 2 },
            { cor: 'Preto', tamanho: 'G', quantidade: 3 },
          ]),
        }),
      ),
    );
  });

  it('impede salvar grade vazia e ignora quantidade negativa', async () => {
    render(<OrdensPage sessao={sessao} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Nova OP' }));
    await escolher('Cliente', 'Loja Grade');
    await escolher('Produto', 'BER-1 — Bermuda');
    expect(await screen.findByLabelText('Cor Preto')).toBeTruthy();
    expect(screen.getByLabelText('Quantidade total (soma da grade)')).toHaveProperty('value', '0');
    expect(screen.getByRole('button', { name: 'Criar OP' })).toHaveProperty('disabled', true);

    fireEvent.change(screen.getByLabelText('Quantidade Preto M'), { target: { value: '-8' } });
    expect(screen.getByLabelText('Quantidade Preto M')).toHaveProperty('value', '0');
    expect(screen.getByRole('button', { name: 'Criar OP' })).toHaveProperty('disabled', true);
    expect(criar).not.toHaveBeenCalled();
  });

  it('cadastra cliente e produto oficiais e reutiliza os registros na OP', async () => {
    render(<OrdensPage sessao={sessao} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Nova OP' }));

    fireEvent.focus(await screen.findByRole('combobox', { name: 'Cliente' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Cadastrar novo cliente' }));
    fireEvent.change(screen.getByLabelText('Nome do novo cliente'), { target: { value: 'Atelier Novo' } });
    fireEvent.change(screen.getByLabelText('CPF/CNPJ do novo cliente'), { target: { value: '52998224725' } });
    fireEvent.click(screen.getByRole('button', { name: 'Salvar cliente' }));
    await waitFor(() =>
      expect(novoCliente).toHaveBeenCalledWith({
        nome: 'Atelier Novo',
        cpf_cnpj: '52998224725',
        telefone: undefined,
      }),
    );

    fireEvent.focus(screen.getByRole('combobox', { name: 'Produto' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Cadastrar novo produto' }));
    fireEvent.change(screen.getByLabelText('Nome do novo produto'), { target: { value: 'Camisa Nova' } });
    fireEvent.change(screen.getByLabelText('SKU do novo produto'), { target: { value: 'CAM-NOVA' } });
    fireEvent.click(screen.getByRole('button', { name: 'Salvar produto' }));
    await waitFor(() =>
      expect(novoProduto).toHaveBeenCalledWith({
        nome: 'Camisa Nova',
        sku: 'CAM-NOVA',
      }),
    );
    expect(await screen.findByLabelText('Referência')).toHaveProperty('value', 'CAM-NOVA');
    expect(criar).not.toHaveBeenCalled();
  });

  it('encaminha para Corte e Enfesto só depois de criar a OP com sucesso', async () => {
    const onOpCriada = vi.fn();
    render(<OrdensPage sessao={sessao} onOpCriada={onOpCriada} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Nova OP' }));
    await escolher('Cliente', 'Loja Grade');
    await escolher('Produto', 'BER-1 — Bermuda');
    fireEvent.change(screen.getByLabelText('Quantidade Preto M'), { target: { value: '3' } });
    fireEvent.change(screen.getByLabelText('Quantidade Preto G'), { target: { value: '2' } });
    fireEvent.click(screen.getByRole('button', { name: 'Criar OP' }));
    await waitFor(() => expect(criar).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(onOpCriada).toHaveBeenCalledWith(ordem));
  });

  it('permanece na OP e mostra o erro quando o salvamento falha', async () => {
    criar.mockRejectedValueOnce(new Error('Estoque insuficiente para gravar a OP'));
    const onOpCriada = vi.fn();
    render(<OrdensPage sessao={sessao} onOpCriada={onOpCriada} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Nova OP' }));
    await escolher('Cliente', 'Loja Grade');
    await escolher('Produto', 'BER-1 — Bermuda');
    fireEvent.change(screen.getByLabelText('Quantidade Preto M'), { target: { value: '3' } });
    fireEvent.click(screen.getByRole('button', { name: 'Criar OP' }));
    expect(await screen.findByText('Estoque insuficiente para gravar a OP')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Criar OP' })).toBeTruthy();
    expect(onOpCriada).not.toHaveBeenCalled();
    expect(criar).toHaveBeenCalledTimes(1);
  });
});
