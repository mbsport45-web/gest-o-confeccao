import { crc32 } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { parseCsv, parseXlsx, produtosDaPlanilha } from './importacaoProdutos.js';

function zipStore(arquivos: Array<{ nome: string; conteudo: string }>): Buffer {
  const locais: Buffer[] = [];
  const centrais: Buffer[] = [];
  let offset = 0;
  for (const arquivo of arquivos) {
    const nome = Buffer.from(arquivo.nome, 'utf8');
    const dados = Buffer.from(arquivo.conteudo, 'utf8');
    const crc = crc32(dados);
    const local = Buffer.alloc(30 + nome.length + dados.length);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0, 8);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(dados.length, 18);
    local.writeUInt32LE(dados.length, 22);
    local.writeUInt16LE(nome.length, 26);
    nome.copy(local, 30);
    dados.copy(local, 30 + nome.length);
    const central = Buffer.alloc(46 + nome.length);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(dados.length, 20);
    central.writeUInt32LE(dados.length, 24);
    central.writeUInt16LE(nome.length, 28);
    central.writeUInt32LE(offset, 42);
    nome.copy(central, 46);
    locais.push(local);
    centrais.push(central);
    offset += local.length;
  }
  const corpo = Buffer.concat([...locais, ...centrais]);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(arquivos.length, 8);
  eocd.writeUInt16LE(arquivos.length, 10);
  eocd.writeUInt32LE(centrais.reduce((n, b) => n + b.length, 0), 12);
  eocd.writeUInt32LE(locais.reduce((n, b) => n + b.length, 0), 16);
  return Buffer.concat([corpo, eocd]);
}

function xlsxDeMatriz(rows: string[][]): Buffer {
  const cells = rows
    .map(
      (row, r) =>
        `<row r="${r + 1}">${row
          .map((valor, c) => {
            const letra = String.fromCharCode(65 + c);
            const xml = valor
              .replace(/&/g, '&amp;')
              .replace(/</g, '&lt;')
              .replace(/>/g, '&gt;');
            return `<c r="${letra}${r + 1}" t="inlineStr"><is><t>${xml}</t></is></c>`;
          })
          .join('')}</row>`,
    )
    .join('');
  const sheet = `<?xml version="1.0"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${cells}</sheetData></worksheet>`;
  return zipStore([{ nome: 'xl/worksheets/sheet1.xml', conteudo: sheet }]);
}

describe('leitura de planilha de produtos', () => {
  it('lê CSV brasileiro com SKU, cores e tamanhos', () => {
    const rows = parseCsv(
      'SKU;Nome do produto;Categoria;Marca;Preço de venda;Descrição;Cores;Tamanhos\n' +
        'CAM-IMP;Camiseta Import;Camiseta;Atelier;89,90;Malha PV;Preto, Branco;P, M, G\n',
    );
    const { produtos, erros } = produtosDaPlanilha(rows);
    expect(erros).toEqual([]);
    expect(produtos).toHaveLength(1);
    expect(produtos[0]).toMatchObject({
      sku: 'CAM-IMP',
      nome: 'Camiseta Import',
      categoria: 'Camiseta',
      marca: 'Atelier',
      preco_venda: 89.9,
      descricao: 'Malha PV',
      cores: ['Preto', 'Branco'],
    });
    expect(produtos[0].tamanhos).toEqual(expect.arrayContaining(['P', 'M', 'G']));
  });

  it('agrupa linhas do mesmo SKU como variantes', () => {
    const rows = parseCsv(
      'Referência,Nome,Cor,Tamanho,Variantes\n' +
        'CALCA-01,Calça Jeans,Azul,42,\n' +
        'CALCA-01,Calça Jeans,Preto,44,Verde/40\n',
    );
    const { produtos } = produtosDaPlanilha(rows);
    expect(produtos).toHaveLength(1);
    expect(produtos[0].cores).toEqual(expect.arrayContaining(['Azul', 'Preto', 'Verde']));
    expect(produtos[0].tamanhos).toEqual(expect.arrayContaining(['42', '44', '40']));
  });

  it('lê xlsx simples', () => {
    const buf = xlsxDeMatriz([
      ['SKU', 'Nome', 'Preço de venda', 'Cores', 'Tamanhos'],
      ['POLO-X', 'Polo Importada', '120.5', 'Marinho', 'M, G'],
    ]);
    const rows = parseXlsx(buf);
    const { produtos } = produtosDaPlanilha(rows);
    expect(produtos[0]).toMatchObject({
      sku: 'POLO-X',
      nome: 'Polo Importada',
      preco_venda: 120.5,
      cores: ['Marinho'],
      tamanhos: ['M', 'G'],
    });
  });
});
