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

  it('lê o emitente da DANFE quando rótulos e valores estão em linhas diferentes', () => {
    const leitura = interpretarDocumento(
      [
        'INSCRIÇÃO ESTADUAL INSCRIÇÃO ESTADUAL SUB. TRIBUTARIA CNPJ',
        '255456883 08.755.180/0001-23',
        'WILLRICH MALHAS MATRIZ DANFE',
        'RECEBEMOS DE WILLRICH MALHAS MATRIZ OS PRODUTOS/SERVIÇOS CONSTANTES NA NOTA FISCAL INDICADA AO LADO',
        'R GUSTAVO RICHARD, 58',
        'CENTRO II',
        'BRUSQUE',
        'SC',
        'CEP: 88354010',
        'TELEFONE: 4733516593',
        'DESTINATÁRIO',
        'MB SPORT LTDA',
        'Nome fantasia: Cliente Fantasia',
        'CNPJ: 11.444.777/0001-61',
        'Inscrição Estadual: 999999999',
        'E-mail: cliente@exemplo.com',
        'Endereço: Rua do Cliente, 9',
        'Bairro: Santana',
        'Cidade: Sao Paulo',
        'UF: SP',
        'CEP: 02227-000',
        'Telefone: (11) 3946-8205',
      ].join('\n'),
      'nota_fiscal',
    );
    expect(leitura).toMatchObject({
      emitente: 'WILLRICH MALHAS MATRIZ',
      nome_fantasia: null,
      cnpj: '08755180000123',
      cpf: null,
      tipo_pessoa: 'juridica',
      inscricao_estadual: '255456883',
      telefone: '4733516593',
      whatsapp: null,
      email: null,
      cep: '88354010',
      endereco: 'R GUSTAVO RICHARD',
      numero_endereco: '58',
      complemento: null,
      bairro: 'CENTRO II',
      cidade: 'BRUSQUE',
      estado: 'SC',
    });
  });

  it('lê o nome do emitente na linha que termina com DANFE', () => {
    const leitura = interpretarDocumento(
      ['MALHAS EXEMPLO DANFE', '255456883 11.444.777/0001-61'].join('\n'),
      'nota_fiscal',
    );
    expect(leitura.emitente).toBe('MALHAS EXEMPLO');
    expect(leitura.cnpj).toBe('11444777000161');
    expect(leitura.inscricao_estadual).toBe('255456883');
    expect(leitura.nome_fantasia).toBeNull();
    expect(leitura.endereco).toBeNull();
    expect(leitura.cidade).toBeNull();
  });

  it('lê rótulos e valores em linhas separadas e separa logradouro, número e complemento', () => {
    const leitura = interpretarDocumento(
      [
        'Razão Social',
        'Beta Malhas Ltda',
        'Nome fantasia',
        'Beta',
        'CNPJ',
        '11.444.777/0001-61',
        'Inscrição Estadual',
        '123456789',
        'Telefone',
        '(81) 3333-4444',
        'E-mail',
        'beta@malhas.com.br',
        'CEP',
        '50050-110',
        'Endereço',
        'Rua das Flores, 100, Sala 2',
        'Bairro',
        'Boa Vista',
        'Cidade',
        'Recife',
        'UF',
        'PE',
      ].join('\n'),
      'nota_fiscal',
    );
    expect(leitura).toMatchObject({
      emitente: 'Beta Malhas Ltda',
      nome_fantasia: 'Beta',
      cnpj: '11444777000161',
      tipo_pessoa: 'juridica',
      inscricao_estadual: '123456789',
      telefone: '8133334444',
      email: 'beta@malhas.com.br',
      cep: '50050110',
      endereco: 'Rua das Flores',
      numero_endereco: '100',
      complemento: 'Sala 2',
      bairro: 'Boa Vista',
      cidade: 'Recife',
      estado: 'PE',
    });
  });

  it('separa o número do endereço quando ele vem na mesma linha do logradouro', () => {
    const leitura = interpretarDocumento(
      [
        'Fornecedor: Alfa Ltda',
        'CNPJ: 11.444.777/0001-61',
        'Endereço: Rua das Flores, 100, Sala 2',
      ].join('\n'),
      'nota_fiscal',
    );
    expect(leitura.endereco).toBe('Rua das Flores');
    expect(leitura.numero_endereco).toBe('100');
    expect(leitura.complemento).toBe('Sala 2');
    expect(leitura.nome_fantasia).toBeNull();
    expect(leitura.bairro).toBeNull();
    expect(leitura.cidade).toBeNull();
    expect(leitura.estado).toBeNull();
  });

  it('deixa vazio o que a nota não informa e não copia a razão social para o nome fantasia', () => {
    const leitura = interpretarDocumento(
      ['Fornecedor: Sem Contato Ltda', 'CNPJ: 11.444.777/0001-61'].join('\n'),
      'nota_fiscal',
    );
    expect(leitura.emitente).toBe('Sem Contato Ltda');
    expect(leitura.tipo_pessoa).toBe('juridica');
    expect(leitura).toMatchObject({
      nome_fantasia: null,
      inscricao_estadual: null,
      telefone: null,
      whatsapp: null,
      email: null,
      cep: null,
      endereco: null,
      numero_endereco: null,
      complemento: null,
      bairro: null,
      cidade: null,
      estado: null,
    });
  });

  it('lê CPF na linha seguinte e classifica pessoa física', () => {
    const leitura = interpretarDocumento(
      ['Fornecedor', 'Ana Costa', 'CPF', '529.982.247-25'].join('\n'),
      'pedido_compra',
    );
    expect(leitura.emitente).toBe('Ana Costa');
    expect(leitura.cpf).toBe('52998224725');
    expect(leitura.cnpj).toBeNull();
    expect(leitura.tipo_pessoa).toBe('fisica');
    expect(leitura.inscricao_estadual).toBeNull();
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
