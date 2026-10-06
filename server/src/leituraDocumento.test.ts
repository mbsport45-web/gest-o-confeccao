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

  it('aceita outro documento e avisa quando não há itens', () => {
    const leitura = interpretarDocumento('Recibo avulso sem tabela', 'outro');
    expect(leitura.numero).toBeNull();
    expect(leitura.itens).toEqual([]);
    expect(leitura.avisos).toContain(
      'Nenhum item foi identificado. Confira o documento antes de lançar a compra.',
    );
  });
});
