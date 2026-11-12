import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { DocumentoProcessado } from './api';
import { FornecedorImportacao } from './FornecedorImportacao';

const leitura: DocumentoProcessado = {
  id: 4,
  tipo: 'nota_fiscal',
  nome_arquivo: 'nota.pdf',
  numero: '4500',
  emitente: 'Tecidos Sul Ltda',
  cnpj: '11444777000161',
  cpf: null,
  tipo_pessoa: 'juridica',
  nome_fantasia: 'Sul Tecidos',
  inscricao_estadual: '012345678',
  telefone: '8133334444',
  whatsapp: null,
  email: 'contato@fiacao.com.br',
  cep: null,
  endereco: 'Rua das Flores, 100',
  numero_endereco: null,
  complemento: null,
  bairro: null,
  cidade: 'Recife',
  estado: null,
  observacoes: null,
  data_emissao: '2026-10-06',
  total: 20,
  avisos: [],
  fornecedor: null,
  itens: [],
  ja_importado: false,
  compra_existente: null,
};

describe('cadastro de fornecedor na importação', () => {
  afterEach(() => cleanup());

  it('mostra o cadastro quando o fornecedor ainda não existe', () => {
    render(
      <FornecedorImportacao
        leitura={leitura}
        selecionado={false}
        salvando={false}
        aviso={null}
        onCadastrar={vi.fn()}
      />,
    );
    expect(screen.getByRole('button', { name: 'Cadastrar novo fornecedor' })).toBeTruthy();
  });

  it('não oferece novo cadastro quando o fornecedor já foi identificado', () => {
    render(
      <FornecedorImportacao
        leitura={{ ...leitura, fornecedor: { id: 3, nome: 'Tecidos Sul Ltda' } }}
        selecionado
        salvando={false}
        aviso={null}
        onCadastrar={vi.fn()}
      />,
    );
    expect(screen.queryByRole('button', { name: 'Cadastrar novo fornecedor' })).toBeNull();
  });

  it('abre o formulário preenchido e envia o que foi editado', async () => {
    const onCadastrar = vi.fn().mockResolvedValue(undefined);
    render(
      <FornecedorImportacao
        leitura={leitura}
        selecionado={false}
        salvando={false}
        aviso={null}
        onCadastrar={onCadastrar}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Cadastrar novo fornecedor' }));
    const nome = screen.getByLabelText('Razão social') as HTMLInputElement;
    const estado = screen.getByLabelText('Estado') as HTMLSelectElement;
    const numero = screen.getByLabelText('Número') as HTMLInputElement;
    expect(nome.value).toBe('Tecidos Sul Ltda');
    expect(screen.getByLabelText('CNPJ')).toHaveProperty('value', '11444777000161');
    expect(estado.value).toBe('');
    expect(numero.value).toBe('');
    expect(screen.getByLabelText('Inscrição estadual')).toBeTruthy();
    fireEvent.change(nome, { target: { value: 'Tecidos Sul Revisada' } });
    fireEvent.change(screen.getByLabelText('Telefone'), { target: { value: '81999998888' } });
    fireEvent.submit(nome.closest('form') as HTMLFormElement);
    expect(onCadastrar).toHaveBeenCalledWith(expect.objectContaining({
      tipo_pessoa: 'juridica',
      nome: 'Tecidos Sul Revisada',
      telefone: '81999998888',
      endereco: 'Rua das Flores, 100',
      cidade: 'Recife',
    }));
    const enviado = onCadastrar.mock.calls[0][0] as Record<string, string>;
    expect(enviado.estado).toBeUndefined();
    expect(enviado.numero).toBeUndefined();
  });
});
