import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./api', async () => {
  const actual = await vi.importActual<typeof import('./api')>('./api');
  return {
    ...actual,
    listarProdutos: vi.fn(),
    obterProduto: vi.fn(),
    criarProduto: vi.fn(),
    atualizarProduto: vi.fn(),
    atualizarStatusProduto: vi.fn(),
    removerProduto: vi.fn(),
    analisarImportacaoProdutos: vi.fn(),
    importarProdutos: vi.fn(),
  };
});

import {
  analisarImportacaoProdutos,
  atualizarProduto,
  importarProdutos,
  listarProdutos,
  obterProduto,
  type Produto,
} from './api';
import { ProdutosPage } from './ProdutosPage';

const listar = vi.mocked(listarProdutos);
const analisar = vi.mocked(analisarImportacaoProdutos);
const importar = vi.mocked(importarProdutos);
const atualizar = vi.mocked(atualizarProduto);
const obter = vi.mocked(obterProduto);

const sessao = {
  assinatura: {
    acesso: { operacional: true, leitura: true, trocar_plano: true },
    uso: {},
  } as never,
};

const polo: Produto = {
  id: 1,
  sku: 'CAM-POLO',
  nome: 'Camiseta Polo',
  descricao: null,
  categoria: 'Camiseta',
  subcategoria: null,
  marca: 'Atelier',
  genero: null,
  colecao: null,
  cores: ['Preto'],
  tamanhos: ['M'],
  codigo_barras: null,
  unidade: 'UN',
  preco_venda: 89.9,
  preco_atacado: 0,
  preco_custo: 0,
  status: 'ativo',
  estoque_minimo: 0,
  imagem: null,
  observacoes: null,
  criado_em: '2026-11-08',
  atualizado_em: '2026-11-08',
  variantes: [],
};

describe('tela Produtos — importação', () => {
  afterEach(() => cleanup());

  beforeEach(() => {
    listar.mockReset();
    analisar.mockReset();
    importar.mockReset();
    listar.mockResolvedValue({
      data: [polo],
      pagina: 1,
      por_pagina: 200,
      total: 1,
      total_paginas: 1,
    });
    atualizar.mockReset();
    obter.mockReset();
  });

  it('abre o catálogo visual com foto, nome, REF e ações', async () => {
    listar.mockResolvedValue({
      data: [{ ...polo, imagem: 'https://catalogo/polo.png' }],
      pagina: 1,
      por_pagina: 200,
      total: 1,
      total_paginas: 1,
    });
    obter.mockResolvedValue({ ...polo, imagem: 'https://catalogo/polo.png' });
    render(<ProdutosPage sessao={sessao} />);
    expect(await screen.findByRole('heading', { name: 'Catálogo de modelos e referências' })).toBeTruthy();
    expect(screen.queryByRole('table')).toBeNull();
    expect(screen.getByText('Camiseta Polo')).toBeTruthy();
    expect(screen.getByText('REF CAM-POLO')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Visualizar' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Editar' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Trocar foto' })).toBeTruthy();
    expect(screen.getByLabelText('Pesquisar por nome ou referência')).toBeTruthy();
    expect(screen.getByLabelText('Filtrar por tipo')).toBeTruthy();
    await waitFor(() => {
      expect(listar).toHaveBeenCalledWith(expect.objectContaining({ por_pagina: 200 }));
    });
  });

  it('troca a foto do modelo no próprio cartão', async () => {
    atualizar.mockResolvedValue({ ...polo, imagem: 'data:image/png;base64,aaa' });
    render(<ProdutosPage sessao={sessao} />);
    expect(await screen.findByText('REF CAM-POLO')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Trocar foto' }));
    const arquivo = screen.getByLabelText('Arquivo da foto do modelo') as HTMLInputElement;
    fireEvent.change(arquivo, {
      target: { files: [new File(['foto'], 'polo.png', { type: 'image/png' })] },
    });
    await waitFor(() => {
      expect(atualizar).toHaveBeenCalledWith(1, expect.objectContaining({ imagem: expect.any(String) }));
    });
  });

  it('pré-visualiza o arquivo, marca SKU duplicado e importa o lote', async () => {
    analisar.mockResolvedValue({
      linhas: [
        {
          linha: 2,
          sku: 'CAM-POLO',
          nome: 'Polo Atualizada',
          categoria: 'Camiseta',
          marca: 'Atelier',
          preco_venda: 99.9,
          descricao: 'Nova',
          cores: ['Preto', 'Branco'],
          tamanhos: ['M', 'G'],
          variantes: [],
          existente: { id: 1, sku: 'CAM-POLO', nome: 'Camiseta Polo' },
          acao_sugerida: 'ignorar',
          erros: [],
        },
        {
          linha: 3,
          sku: 'CAM-IMP',
          nome: 'Camiseta Importada',
          categoria: 'Camiseta',
          marca: 'Atelier',
          preco_venda: 45.5,
          descricao: 'Malha PV',
          cores: ['Azul'],
          tamanhos: ['P', 'M'],
          variantes: [],
          existente: null,
          acao_sugerida: 'criar',
          erros: [],
        },
      ],
      erros: [],
    });
    importar.mockResolvedValue({
      importados: 1,
      atualizados: 1,
      ignorados: 0,
      erros: [],
    });

    render(<ProdutosPage sessao={sessao} />);
    expect(await screen.findByRole('button', { name: 'Importar produtos' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Novo produto' }));
    expect(screen.getByRole('heading', { name: 'Novo produto' })).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Importar produtos' }));
    const painel = screen.getByLabelText('Importar produtos');
    const arquivo = within(painel).getByLabelText('Arquivo de produtos') as HTMLInputElement;
    const csv = new File(
      ['SKU;Nome\nCAM-POLO;Polo\nCAM-IMP;Importada\n'],
      'catalogo.csv',
      { type: 'text/csv' },
    );
    fireEvent.change(arquivo, { target: { files: [csv] } });

    await waitFor(() => {
      expect(analisar).toHaveBeenCalled();
    });
    const tabela = within(painel).getByRole('table', { name: 'Produtos encontrados para importar' });
    expect(within(tabela).getByDisplayValue('CAM-POLO')).toBeTruthy();
    expect(within(tabela).getByDisplayValue('Camiseta Importada')).toBeTruthy();
    expect(within(tabela).getByText(/Duplicado/)).toBeTruthy();
    const acao = within(tabela).getByLabelText('Ação do SKU CAM-POLO') as HTMLSelectElement;
    expect(acao.value).toBe('ignorar');
    fireEvent.change(acao, { target: { value: 'atualizar' } });
    fireEvent.change(within(tabela).getByLabelText('Nome linha 3'), {
      target: { value: 'Camiseta Conferida' },
    });

    fireEvent.click(within(painel).getByRole('button', { name: 'Confirmar importação' }));
    await waitFor(() => {
      expect(importar).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({ sku: 'CAM-POLO', acao: 'atualizar' }),
          expect.objectContaining({ sku: 'CAM-IMP', nome: 'Camiseta Conferida', acao: 'criar' }),
        ]),
      );
    });
    expect(await screen.findByLabelText('Resultado da importação')).toBeTruthy();
    expect(screen.getByLabelText('Resultado da importação').textContent).toMatch(
      /1 importado, 1 atualizado, 0 ignorados/,
    );
  });
});
