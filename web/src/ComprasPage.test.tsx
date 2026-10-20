import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./api', async () => {
  const actual = await vi.importActual<typeof import('./api')>('./api');
  return {
    ...actual,
    listarCompras: vi.fn(),
    listarFornecedores: vi.fn(),
    listarMateriasPrimas: vi.fn(),
    listarProdutos: vi.fn(),
    processarDocumento: vi.fn(),
    criarCompra: vi.fn(),
    obterCompra: vi.fn(),
  };
});

import {
  criarCompra,
  listarCompras,
  listarFornecedores,
  listarMateriasPrimas,
  listarProdutos,
  obterCompra,
  processarDocumento,
} from './api';
import { ComprasPage } from './ComprasPage';

const compras = vi.mocked(listarCompras);
const fornecedores = vi.mocked(listarFornecedores);
const materias = vi.mocked(listarMateriasPrimas);
const produtos = vi.mocked(listarProdutos);
const processar = vi.mocked(processarDocumento);
const criar = vi.mocked(criarCompra);
const obter = vi.mocked(obterCompra);

const vazia = { data: [], pagina: 1, por_pagina: 10, total: 0, total_paginas: 1 };

function pdfFake(nome = 'nota-fornecedor.pdf') {
  const bytes = Uint8Array.from([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34]);
  return {
    name: nome,
    type: 'application/pdf',
    arrayBuffer: async () => bytes.buffer,
  } as File;
}

describe('seleção de PDF na importação', () => {
  afterEach(() => cleanup());

  beforeEach(() => {
    vi.clearAllMocks();
    compras.mockResolvedValue(vazia);
    fornecedores.mockResolvedValue(vazia);
    materias.mockResolvedValue(vazia);
    produtos.mockResolvedValue(vazia);
    processar.mockResolvedValue({
      id: 11,
      tipo: 'nota_fiscal',
      nome_arquivo: 'nota-fornecedor.pdf',
      numero: '100',
      emitente: 'Tecidos Sul',
      cnpj: '11444777000161',
      data_emissao: '2026-10-06',
      total: 20,
      avisos: [],
      fornecedor: null,
      itens: [],
      ja_importado: false,
      compra_existente: null,
    });
  });

  it('aceita PDF, mostra o nome e habilita o processamento', async () => {
    render(<ComprasPage visao="importar" />);
    const campo = await screen.findByLabelText('Selecionar arquivo PDF');
    expect((campo as HTMLInputElement).accept).toContain('application/pdf');
    expect(screen.getByRole('button', { name: 'Processar documento' })).toHaveProperty('disabled', true);

    fireEvent.change(campo, { target: { files: [pdfFake()] } });
    expect(await screen.findByText('Arquivo selecionado: nota-fornecedor.pdf')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Processar documento' })).toHaveProperty('disabled', false);

    fireEvent.click(screen.getByRole('button', { name: 'Processar documento' }));
    await waitFor(() =>
      expect(processar).toHaveBeenCalledWith(
        expect.objectContaining({
          tipo: 'nota_fiscal',
          nome_arquivo: 'nota-fornecedor.pdf',
        }),
      ),
    );
    expect(await screen.findByText('Tecidos Sul')).toBeTruthy();
  });

  it('recusa arquivo que não é PDF e mantém o botão desabilitado', async () => {
    render(<ComprasPage visao="importar" />);
    const campo = await screen.findByLabelText('Selecionar arquivo PDF');
    fireEvent.change(campo, {
      target: { files: [new File(['foto'], 'foto.png', { type: 'image/png' })] },
    });
    expect(await screen.findByText('Envie um arquivo PDF')).toBeTruthy();
    expect(screen.getByText('Nenhum arquivo selecionado')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Processar documento' })).toHaveProperty('disabled', true);
    expect(processar).not.toHaveBeenCalled();
  });

  it('confirma a nota com pagamento, mostra a entrada e não inventa vencimento', async () => {
    fornecedores.mockResolvedValue({
      data: [{
        id: 3,
        codigo: 'FOR-0003',
        nome: 'Tecidos Sul',
        cpf_cnpj: '11444777000161',
        contato: null,
        telefone: null,
        email: null,
        cidade: null,
        estado: null,
        condicao_pagamento: null,
        status: 'ativo',
      }],
      pagina: 1,
      por_pagina: 100,
      total: 1,
      total_paginas: 1,
    });
    materias.mockResolvedValue({
      data: [{
        id: 9,
        codigo: 'MALHA',
        nome: 'Malha Compra',
        descricao: null,
        tipo: 'tecido',
        categoria: null,
        cor: null,
        composicao: null,
        largura_cm: null,
        gramatura: null,
        unidade: 'KG',
        custo: 20,
        estoque_minimo: 0,
        fornecedor: null,
        referencia_fornecedor: null,
        ncm: null,
        status: 'ativo',
        observacoes: null,
        criado_em: '',
        atualizado_em: '',
      }],
      pagina: 1,
      por_pagina: 100,
      total: 1,
      total_paginas: 1,
    });
    processar.mockResolvedValue({
      id: 21,
      tipo: 'nota_fiscal',
      nome_arquivo: 'nfe-7701.pdf',
      numero: '7701',
      emitente: 'Tecidos Sul',
      cnpj: '11444777000161',
      data_emissao: '2026-10-20',
      total: 240,
      avisos: [],
      fornecedor: { id: 3, nome: 'Tecidos Sul' },
      itens: [{
        descricao: 'Malha Compra PRETO',
        quantidade: 12,
        unidade: 'KG',
        valor_unitario: 20,
        total: 240,
        materia_prima_id: 9,
        produto_id: null,
        tecido_cor_id: null,
        cor: 'Preto',
        nome_cadastro: 'Malha Compra',
        aviso: null,
      }],
      ja_importado: false,
      compra_existente: null,
    });
    criar.mockResolvedValue({
      id: 44,
      codigo: 'CP-0044',
      fornecedor_id: 3,
      data_emissao: '2026-10-20',
      data_prevista: null,
      status: 'recebida',
      observacoes: null,
      subtotal: 240,
      desconto: 0,
      frete: 0,
      total: 240,
      forma_pagamento: 'a_prazo',
      condicao_pagamento: null,
      vencimento: '2026-11-20',
      fornecedor: 'Tecidos Sul',
      itens: [],
      confirmacao: {
        estoque: [{
          materia_prima_id: 9,
          nome: 'Malha Compra',
          quantidade: 12,
          unidade: 'KG',
          cor: 'Preto',
          saldo: 12,
        }],
        financeiro: [{
          id: 8,
          descricao: 'Compra CP-0044 · NF 7701',
          valor: 240,
          status: 'pendente',
          vencimento: '2026-11-20',
          parcela: 1,
        }],
        itens_ignorados: [],
      },
    });
    obter.mockResolvedValue({
      id: 44,
      codigo: 'CP-0044',
      fornecedor_id: 3,
      data_emissao: '2026-10-20',
      data_prevista: null,
      status: 'recebida',
      observacoes: null,
      subtotal: 240,
      desconto: 0,
      frete: 0,
      total: 240,
      forma_pagamento: 'a_prazo',
      condicao_pagamento: null,
      vencimento: '2026-11-20',
      fornecedor: 'Tecidos Sul',
      itens: [{
        id: 1,
        compra_id: 44,
        materia_prima_id: 9,
        produto_id: null,
        variante_id: null,
        quantidade: 12,
        quantidade_recebida: 12,
        custo_unitario: 20,
        total: 240,
        unidade: 'KG',
        cor: 'Preto',
        nome: 'Malha Compra',
        codigo: 'MALHA',
      }],
    });

    render(<ComprasPage visao="importar" />);
    fireEvent.change(await screen.findByLabelText('Selecionar arquivo PDF'), {
      target: { files: [pdfFake('nfe-7701.pdf')] },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Processar documento' }));
    expect(await screen.findByText('Malha Compra PRETO')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar entrada no estoque' }));
    expect(await screen.findByText('Informe se o pagamento é à vista ou a prazo')).toBeTruthy();
    expect(criar).not.toHaveBeenCalled();

    fireEvent.click(screen.getByLabelText('A prazo'));
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar entrada no estoque' }));
    expect(await screen.findByText('Informe o vencimento ou as parcelas da conta a prazo')).toBeTruthy();

    fireEvent.change(screen.getByLabelText('Vencimento da nota'), { target: { value: '2026-11-20' } });
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar entrada no estoque' }));
    await waitFor(() =>
      expect(criar).toHaveBeenCalledWith(
        expect.objectContaining({
          confirmar: true,
          forma_pagamento: 'a_prazo',
          vencimento: '2026-11-20',
          itens: [
            expect.objectContaining({
              materia_prima_id: 9,
              quantidade: 12,
              unidade: 'KG',
              cor: 'Preto',
            }),
          ],
        }),
      ),
    );
    expect(await screen.findByText('Nota confirmada')).toBeTruthy();
    expect(screen.getByRole('table', { name: 'Entradas no estoque' })).toBeTruthy();
    expect(screen.getByRole('table', { name: 'Contas a pagar' })).toBeTruthy();
    expect(screen.getByText('Compra CP-0044 · NF 7701')).toBeTruthy();
  });
});
