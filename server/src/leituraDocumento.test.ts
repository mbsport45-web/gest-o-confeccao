import { describe, expect, it } from 'vitest';
import { interpretarDocumento } from './leituraDocumento.js';

describe('leitura de documento', () => {
  it('lê nota fiscal com fornecedor, itens e total', () => {
    const leitura = interpretarDocumento(
      [
        'NF-e 12345',
        'Fornecedor: Fiacao Norte',
        'CNPJ: 11.444.777/0001-61',
        'Emissao: 06/10/2026',
        'Dry Tela Cayman Preto 200 KG 35,00 7.000,00',
        'Malha PV 10 METRO 12,50',
        'Valor total da nota 7.125,00',
      ].join('\n'),
      'nota_fiscal',
    );
    expect(leitura.numero).toBe('12345');
    expect(leitura.emitente).toBe('Fiacao Norte');
    expect(leitura.cnpj).toBe('11444777000161');
    expect(leitura.data_emissao).toBe('2026-10-06');
    expect(leitura.total).toBe(7125);
    expect(leitura.itens).toEqual([
      {
        descricao: 'Dry Tela Cayman Preto',
        quantidade: 200,
        unidade: 'KG',
        valor_unitario: 35,
        total: 7000,
      },
      {
        descricao: 'Malha PV',
        quantidade: 10,
        unidade: 'METRO',
        valor_unitario: 12.5,
        total: 125,
      },
    ]);
    expect(leitura.avisos).toEqual([]);
  });

  it('lê pedido de compra no formato com barras', () => {
    const leitura = interpretarDocumento(
      [
        'Pedido de compra: PC-10',
        'Fornecedor: Caryman',
        'CNPJ 11.444.777/0001-61',
        '06/10/2026',
        'Dry Tela Cayman Branco | 500 | KG | 35,00',
      ].join('\n'),
      'pedido_compra',
    );
    expect(leitura.numero).toBe('PC-10');
    expect(leitura.itens[0]).toMatchObject({
      descricao: 'Dry Tela Cayman Branco',
      quantidade: 500,
      unidade: 'KG',
      valor_unitario: 35,
      total: 17500,
    });
  });

  it('preenche só os dados rotulados e não inventa número nem UF', () => {
    const leitura = interpretarDocumento(
      [
        'NF-e 4500',
        'Fornecedor: Tecidos Sul Ltda',
        'Nome fantasia: Sul Tecidos',
        'CNPJ: 11.444.777/0001-61',
        'Inscrição Estadual: 012345678',
        'Telefone: (81) 3333-4444',
        'WhatsApp: (81) 98888-7777',
        'E-mail: contato@fiacao.com.br',
        'CEP: 50050-110',
        'Endereço: Rua das Flores, 100',
        'Número: 250',
        'Complemento: Sala 3',
        'Bairro: Boa Vista',
        'Cidade: Recife',
        'Estado: Pernambuco',
        'Observações: Entregar na portaria',
        'Malha Compra 2 KG 10,00 20,00',
        'Valor total da nota 20,00',
      ].join('\n'),
      'nota_fiscal',
    );
    expect(leitura).toMatchObject({
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
      observacoes: 'Entregar na portaria',
    });
  });

  it('lê CPF de pessoa física sem tratar o CNPJ como CPF', () => {
    const leitura = interpretarDocumento(
      [
        'Pedido de compra: PC-77',
        'Fornecedor: Ana Costa',
        'CPF: 529.982.247-25',
        'Cidade: Olinda',
      ].join('\n'),
      'pedido_compra',
    );
    expect(leitura.cpf).toBe('52998224725');
    expect(leitura.cnpj).toBeNull();
    expect(leitura.tipo_pessoa).toBe('fisica');
    expect(leitura.estado).toBeNull();
    expect(leitura.numero_endereco).toBeNull();
    expect(leitura.avisos).not.toContain('O CNPJ do emitente não foi identificado.');
  });

  it('não usa o número da nota como número do endereço', () => {
    const leitura = interpretarDocumento(
      ['Nota Fiscal nº 77', 'Número da nota: 77', 'Fornecedor: Sem Endereco'].join('\n'),
      'nota_fiscal',
    );
    expect(leitura.numero).toBe('77');
    expect(leitura.numero_endereco).toBeNull();
    expect(leitura.cidade).toBeNull();
    expect(leitura.telefone).toBeNull();
  });

  it('aceita outro documento e avisa quando não há itens', () => {
    const leitura = interpretarDocumento('Recibo avulso sem tabela', 'outro');
    expect(leitura.numero).toBeNull();
    expect(leitura.itens).toEqual([]);
    expect(leitura.avisos).toContain(
      'Nenhum item foi identificado. Confira o documento antes de lançar a compra.',
    );
  });
});
