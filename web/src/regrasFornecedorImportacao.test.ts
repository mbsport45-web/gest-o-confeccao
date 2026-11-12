import { describe, expect, it } from 'vitest';
import type { DocumentoProcessado } from './api';
import {
  dadosParaCadastro,
  formularioFornecedorDaLeitura,
  preencherFormularioSemSobrescrever,
} from './regrasFornecedorImportacao';

function leitura(parcial: Partial<DocumentoProcessado> = {}): DocumentoProcessado {
  return {
    id: 1,
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
    whatsapp: '81988887777',
    email: 'contato@fiacao.com.br',
    cep: '50050110',
    endereco: 'Rua das Flores, 100',
    numero_endereco: '250',
    complemento: 'Sala 3',
    bairro: 'Boa Vista',
    cidade: 'Recife',
    estado: 'PE',
    observacoes: null,
    data_emissao: '2026-10-06',
    total: 20,
    avisos: [],
    fornecedor: null,
    itens: [],
    ja_importado: false,
    compra_existente: null,
    ...parcial,
  };
}

describe('formulário do fornecedor na importação', () => {
  it('preenche com o que o PDF trouxe e deixa o restante em branco', () => {
    const form = formularioFornecedorDaLeitura(leitura({ estado: null, numero_endereco: null, observacoes: null }));
    expect(form.tipo_pessoa).toBe('juridica');
    expect(form.nome).toBe('Tecidos Sul Ltda');
    expect(form.nome_fantasia).toBe('Sul Tecidos');
    expect(form.cpf_cnpj).toBe('11444777000161');
    expect(form.endereco).toBe('Rua das Flores, 100');
    expect(form.numero).toBe('');
    expect(form.estado).toBe('');
    expect(form.observacoes).toBe('');
  });

  it('usa o CPF quando a nota não tem CNPJ', () => {
    const form = formularioFornecedorDaLeitura(leitura({
      cnpj: null,
      cpf: '52998224725',
      tipo_pessoa: 'fisica',
      emitente: 'Ana Costa',
      inscricao_estadual: null,
    }));
    expect(form.tipo_pessoa).toBe('fisica');
    expect(form.cpf_cnpj).toBe('52998224725');
    expect(form.nome).toBe('Ana Costa');
  });

  it('grava a edição e omite a inscrição estadual de pessoa física', () => {
    const form = formularioFornecedorDaLeitura(leitura());
    form.nome_fantasia = 'Sul Revisada';
    form.telefone = '81999998888';
    form.observacoes = 'Conferido na importação';
    const juridica = dadosParaCadastro(form);
    expect(juridica).toMatchObject({
      tipo_pessoa: 'juridica',
      nome: 'Tecidos Sul Ltda',
      nome_fantasia: 'Sul Revisada',
      telefone: '81999998888',
      numero: '250',
      inscricao_estadual: '012345678',
      observacoes: 'Conferido na importação',
    });

    form.tipo_pessoa = 'fisica';
    form.inscricao_estadual = '012345678';
    form.estado = '';
    const fisica = dadosParaCadastro(form);
    expect(fisica?.tipo_pessoa).toBe('fisica');
    expect(fisica).not.toHaveProperty('inscricao_estadual');
    expect(fisica).not.toHaveProperty('estado');
  });

  it('preenche só campos vazios e preserva o que o usuário digitou', () => {
    const atual = formularioFornecedorDaLeitura(leitura({
      emitente: '',
      nome_fantasia: null,
      telefone: null,
      endereco: null,
      numero_endereco: null,
      cidade: null,
      estado: null,
      email: null,
    }));
    atual.nome_fantasia = 'Willrich';
    const preenchido = preencherFormularioSemSobrescrever(
      atual,
      leitura({
        emitente: 'WILLRICH MALHAS MATRIZ',
        nome_fantasia: 'Fantasia do PDF',
        telefone: '4733516593',
        endereco: 'R GUSTAVO RICHARD',
        numero_endereco: '58',
        cidade: 'BRUSQUE',
        estado: 'SC',
        email: null,
      }),
      new Set(['nome_fantasia']),
    );
    expect(preenchido.nome).toBe('WILLRICH MALHAS MATRIZ');
    expect(preenchido.nome_fantasia).toBe('Willrich');
    expect(preenchido.telefone).toBe('4733516593');
    expect(preenchido.endereco).toBe('R GUSTAVO RICHARD');
    expect(preenchido.numero).toBe('58');
    expect(preenchido.cidade).toBe('BRUSQUE');
    expect(preenchido.email).toBe('');
  });
});
