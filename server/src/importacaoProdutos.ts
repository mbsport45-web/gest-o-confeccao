import { inflateRawSync } from 'node:zlib';
import type { AppDatabase } from './db.js';

export const ACOES_IMPORTACAO = ['criar', 'atualizar', 'ignorar'] as const;
export type AcaoImportacao = (typeof ACOES_IMPORTACAO)[number];

export type VarianteImportacao = {
  cor: string;
  tamanho: string;
  sku?: string;
};

export type ProdutoImportacao = {
  linha: number;
  sku: string;
  nome: string;
  categoria: string;
  marca: string;
  preco_venda: number | null;
  descricao: string;
  cores: string[];
  tamanhos: string[];
  variantes: VarianteImportacao[];
};

export type ErroImportacao = {
  linha: number;
  sku: string;
  erro: string;
};

export type LinhaAnaliseImportacao = ProdutoImportacao & {
  existente: { id: number; sku: string; nome: string } | null;
  acao_sugerida: AcaoImportacao;
  erros: string[];
};

const ALIASES: Record<string, string[]> = {
  sku: ['sku', 'referencia', 'referência', 'ref', 'codigo', 'código', 'cod', 'código sku', 'codigo sku'],
  nome: ['nome', 'produto', 'nome do produto', 'nome_produto', 'name'],
  categoria: ['categoria', 'category', 'tipo'],
  marca: ['marca', 'brand'],
  preco_venda: [
    'preco_venda',
    'preco de venda',
    'preço de venda',
    'preco',
    'preço',
    'valor',
    'valor de venda',
    'pv',
  ],
  descricao: ['descricao', 'descrição', 'description', 'desc'],
  cores: ['cores', 'cor', 'colors', 'color'],
  tamanhos: ['tamanhos', 'tamanho', 'sizes', 'size', 'grade'],
  variantes: ['variantes', 'variante'],
  sku_variante: ['sku variante', 'sku_variante', 'variante sku'],
};

function semAcento(valor: string): string {
  return valor
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[_./]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function campoDoCabecalho(cabecalho: string): string | null {
  const chave = semAcento(cabecalho);
  if (!chave) return null;
  for (const [campo, nomes] of Object.entries(ALIASES)) {
    if (nomes.some((nome) => semAcento(nome) === chave)) return campo;
  }
  return null;
}

function unicaLista(valores: string[]): string[] {
  const unique: string[] = [];
  for (const raw of valores) {
    const item = raw.trim();
    if (!item) continue;
    if (!unique.some((u) => u.toLowerCase() === item.toLowerCase())) unique.push(item);
  }
  return unique;
}

function partirLista(valor: string): string[] {
  return unicaLista(valor.split(/[,;/|]/));
}

function parsePreco(valor: string): number | null {
  const t = valor.replace(/r\$/gi, '').trim();
  if (!t) return null;
  const normalizado = t.includes(',') && t.lastIndexOf(',') > t.lastIndexOf('.')
    ? t.replace(/\./g, '').replace(',', '.')
    : t.replace(',', '.');
  const n = Number(normalizado.replace(/[^\d.-]/g, ''));
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n * 100) / 100;
}

function parseVariantes(valor: string): VarianteImportacao[] {
  const itens: VarianteImportacao[] = [];
  for (const bruto of valor.split(/[;|]/)) {
    const t = bruto.trim();
    if (!t) continue;
    const partes = t.split(/[/,×x]/).map((p) => p.trim()).filter(Boolean);
    if (partes.length >= 2) itens.push({ cor: partes[0], tamanho: partes[1] });
  }
  return itens;
}

export function parseCsv(texto: string): string[][] {
  const fonte = texto.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const linhas = fonte.split('\n');
  const primeira = linhas.find((l) => l.trim()) ?? '';
  const delim = primeira.split(';').length > primeira.split(',').length ? ';' : ',';
  const rows: string[][] = [];
  for (const linha of linhas) {
    if (!linha.trim()) continue;
    const cells: string[] = [];
    let atual = '';
    let aspas = false;
    for (let i = 0; i < linha.length; i += 1) {
      const ch = linha[i];
      if (ch === '"') {
        if (aspas && linha[i + 1] === '"') {
          atual += '"';
          i += 1;
        } else {
          aspas = !aspas;
        }
      } else if (ch === delim && !aspas) {
        cells.push(atual.trim());
        atual = '';
      } else {
        atual += ch;
      }
    }
    cells.push(atual.trim());
    rows.push(cells);
  }
  return rows;
}

function colunaDaRef(ref: string): number {
  const letras = ref.replace(/[0-9]/g, '').toUpperCase();
  let n = 0;
  for (const ch of letras) n = n * 26 + (ch.charCodeAt(0) - 64);
  return Math.max(0, n - 1);
}

function unzipLocal(buffer: Buffer): Map<string, Buffer> {
  const arquivos = new Map<string, Buffer>();
  let i = 0;
  while (i + 30 <= buffer.length) {
    const sig = buffer.readUInt32LE(i);
    if (sig === 0x02014b50 || sig === 0x06054b50) break;
    if (sig !== 0x04034b50) break;
    const metodo = buffer.readUInt16LE(i + 8);
    const compactado = buffer.readUInt32LE(i + 18);
    const nomeLen = buffer.readUInt16LE(i + 26);
    const extraLen = buffer.readUInt16LE(i + 28);
    const nome = buffer.subarray(i + 30, i + 30 + nomeLen).toString('utf8');
    const inicio = i + 30 + nomeLen + extraLen;
    const bruto = buffer.subarray(inicio, inicio + compactado);
    const dados = metodo === 0 ? bruto : metodo === 8 ? inflateRawSync(bruto) : null;
    if (dados) arquivos.set(nome.replace(/\\/g, '/'), Buffer.from(dados));
    i = inicio + compactado;
  }
  return arquivos;
}

function textosXml(bloco: string): string {
  return [...bloco.matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/gi)]
    .map((m) => decodeXml(m[1]))
    .join('');
}

function decodeXml(valor: string): string {
  return valor
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&')
    .trim();
}

export function parseXlsx(buffer: Buffer): string[][] {
  const arquivos = unzipLocal(buffer);
  const sharedXml = arquivos.get('xl/sharedStrings.xml')?.toString('utf8') ?? '';
  const shared = [...sharedXml.matchAll(/<si\b[\s\S]*?<\/si>/gi)].map((m) => textosXml(m[0]));
  const sheetNome =
    [...arquivos.keys()].find((n) => /^xl\/worksheets\/sheet1\.xml$/i.test(n)) ??
    [...arquivos.keys()].find((n) => /xl\/worksheets\/sheet\d+\.xml$/i.test(n));
  if (!sheetNome) throw new Error('Planilha Excel sem aba de dados');
  const sheet = arquivos.get(sheetNome)?.toString('utf8') ?? '';
  const linhas = new Map<number, string[]>();
  for (const rowMatch of sheet.matchAll(/<row\b[^>]*>([\s\S]*?)<\/row>/gi)) {
    const rowXml = rowMatch[1];
    for (const cellMatch of rowXml.matchAll(/<c\b([^>]*)>([\s\S]*?)<\/c>/gi)) {
      const attrs = cellMatch[1];
      const corpo = cellMatch[2];
      const ref = attrs.match(/\br="([A-Z]+[0-9]+)"/i)?.[1];
      if (!ref) continue;
      const tipo = attrs.match(/\bt="([^"]+)"/i)?.[1] ?? '';
      const linha = Number(ref.replace(/^[A-Z]+/i, ''));
      const col = colunaDaRef(ref);
      let valor = '';
      if (tipo === 'inlineStr') valor = textosXml(corpo);
      else {
        const v = corpo.match(/<v\b[^>]*>([\s\S]*?)<\/v>/i)?.[1] ?? '';
        valor = tipo === 's' ? shared[Number(v)] ?? '' : decodeXml(v);
      }
      const atual = linhas.get(linha) ?? [];
      atual[col] = valor;
      linhas.set(linha, atual);
    }
  }
  return [...linhas.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([, cells]) => {
      const copia = [...cells];
      for (let i = 0; i < copia.length; i += 1) copia[i] = copia[i] ?? '';
      return copia;
    });
}

export function planilhaDeArquivo(buffer: Buffer, nomeArquivo: string): string[][] {
  const nome = nomeArquivo.toLowerCase();
  if (nome.endsWith('.xlsx')) return parseXlsx(buffer);
  if (nome.endsWith('.csv') || nome.endsWith('.txt')) return parseCsv(buffer.toString('utf8'));
  const magia = buffer.subarray(0, 2).toString('utf8');
  if (magia === 'PK') return parseXlsx(buffer);
  return parseCsv(buffer.toString('utf8'));
}

function linhaParaProduto(mapa: Record<string, string>, numeroLinha: number): ProdutoImportacao {
  const variantes = [
    ...parseVariantes(mapa.variantes ?? ''),
    ...(mapa.cores && mapa.tamanhos && !mapa.variantes && mapa.sku_variante
      ? [{ cor: mapa.cores, tamanho: mapa.tamanhos, sku: mapa.sku_variante }]
      : []),
  ];
  if (mapa.cor && mapa.tamanho) {
    variantes.push({
      cor: mapa.cor,
      tamanho: mapa.tamanho,
      sku: mapa.sku_variante || undefined,
    });
  }
  const cores = unicaLista([
    ...partirLista(mapa.cores ?? ''),
    ...variantes.map((v) => v.cor),
  ]);
  const tamanhos = unicaLista([
    ...partirLista(mapa.tamanhos ?? ''),
    ...variantes.map((v) => v.tamanho),
  ]);
  return {
    linha: numeroLinha,
    sku: (mapa.sku ?? '').trim(),
    nome: (mapa.nome ?? '').trim(),
    categoria: (mapa.categoria ?? '').trim(),
    marca: (mapa.marca ?? '').trim(),
    preco_venda: mapa.preco_venda ? parsePreco(mapa.preco_venda) : null,
    descricao: (mapa.descricao ?? '').trim(),
    cores,
    tamanhos,
    variantes,
  };
}

function mesclar(a: ProdutoImportacao, b: ProdutoImportacao): ProdutoImportacao {
  return {
    ...a,
    nome: a.nome || b.nome,
    categoria: a.categoria || b.categoria,
    marca: a.marca || b.marca,
    descricao: a.descricao || b.descricao,
    preco_venda: a.preco_venda ?? b.preco_venda,
    cores: unicaLista([...a.cores, ...b.cores]),
    tamanhos: unicaLista([...a.tamanhos, ...b.tamanhos]),
    variantes: [...a.variantes, ...b.variantes],
  };
}

export function produtosDaPlanilha(rows: string[][]): {
  produtos: ProdutoImportacao[];
  erros: ErroImportacao[];
} {
  const erros: ErroImportacao[] = [];
  if (rows.length === 0) return { produtos: [], erros: [{ linha: 1, sku: '', erro: 'Arquivo vazio' }] };
  const cabecalhos = rows[0].map((c) => campoDoCabecalho(c));
  if (!cabecalhos.some((c) => c === 'nome' || c === 'sku')) {
    return {
      produtos: [],
      erros: [{ linha: 1, sku: '', erro: 'Informe colunas de SKU/Referência e Nome do produto' }],
    };
  }
  const agrupados = new Map<string, ProdutoImportacao>();
  rows.slice(1).forEach((cells, idx) => {
    const numeroLinha = idx + 2;
    if (cells.every((c) => !String(c ?? '').trim())) return;
    const mapa: Record<string, string> = {};
    cabecalhos.forEach((campo, col) => {
      if (!campo) return;
      const valor = String(cells[col] ?? '').trim();
      if (!valor) return;
      mapa[campo] = mapa[campo] ? `${mapa[campo]}; ${valor}` : valor;
    });
    const produto = linhaParaProduto(mapa, numeroLinha);
    if (!produto.nome && !produto.sku) {
      erros.push({ linha: numeroLinha, sku: '', erro: 'Linha sem SKU e sem nome' });
      return;
    }
    if (mapa.preco_venda && produto.preco_venda == null) {
      erros.push({
        linha: numeroLinha,
        sku: produto.sku,
        erro: 'Preço de venda inválido',
      });
    }
    const chave = produto.sku ? produto.sku.toLowerCase() : `__linha_${numeroLinha}`;
    const atual = agrupados.get(chave);
    agrupados.set(chave, atual ? mesclar(atual, produto) : produto);
  });
  return { produtos: [...agrupados.values()], erros };
}

export function lerArquivoProdutos(buffer: Buffer, nomeArquivo: string) {
  return produtosDaPlanilha(planilhaDeArquivo(buffer, nomeArquivo));
}

function validarProduto(item: ProdutoImportacao): string[] {
  const erros: string[] = [];
  if (!item.nome.trim()) erros.push('Nome do produto é obrigatório');
  if (item.nome.length > 200) erros.push('Nome do produto é longo demais');
  if (item.sku.length > 80) erros.push('SKU é longo demais');
  if (item.preco_venda != null && (!Number.isFinite(item.preco_venda) || item.preco_venda < 0)) {
    erros.push('Preço de venda inválido');
  }
  return erros;
}

export function analisarProdutosImportacao(
  db: AppDatabase,
  empresaId: number,
  produtos: ProdutoImportacao[],
): LinhaAnaliseImportacao[] {
  const buscar = db.prepare(
    `SELECT id, sku, nome FROM produtos
      WHERE empresa_id = ? AND sku IS NOT NULL AND sku != '' AND lower(sku) = lower(?)
      LIMIT 1`,
  );
  return produtos.map((item) => {
    const existente = item.sku
      ? (buscar.get(empresaId, item.sku) as { id: number; sku: string; nome: string } | undefined) ??
        null
      : null;
    return {
      ...item,
      existente,
      acao_sugerida: existente ? 'ignorar' : 'criar',
      erros: validarProduto(item),
    };
  });
}
