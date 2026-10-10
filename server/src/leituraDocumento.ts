import { apenasDigitos, cnpjValido } from './cpfCnpj.js';

export const TIPOS_DOCUMENTO = ['nota_fiscal', 'pedido_compra', 'outro'] as const;
export type TipoDocumento = (typeof TIPOS_DOCUMENTO)[number];

export type ItemLido = {
  descricao: string;
  quantidade: number | null;
  unidade: string | null;
  valor_unitario: number | null;
  total: number | null;
};

export type LeituraDocumento = {
  tipo: TipoDocumento;
  numero: string | null;
  emitente: string | null;
  cnpj: string | null;
  data_emissao: string | null;
  total: number | null;
  itens: ItemLido[];
  avisos: string[];
};

const UNIDADES = /^(KG|METRO|METROS|M|MT|UN|PC|PÇ|PEÇA|PECA)$/i;

export function interpretarDocumento(textoBruto: string, tipo: TipoDocumento): LeituraDocumento {
  const texto = textoBruto.replace(/\r/g, '\n').replace(/[ \t]+\n/g, '\n').trim();
  const avisos: string[] = [];
  if (!texto) avisos.push('Não foi possível ler o texto deste PDF.');

  const cnpj = primeiroCnpj(texto);
  const numero = numeroDoDocumento(texto, tipo);
  const emitente = emitenteDoTexto(texto);
  const data = primeiraData(texto);
  const itens = itensDoTexto(texto);
  let total = totalDoTexto(texto);
  if (total == null && itens.length > 0) {
    const soma = itens.reduce((acc, item) => acc + (item.total ?? 0), 0);
    if (soma > 0) total = Math.round(soma * 100) / 100;
  }

  if (tipo === 'nota_fiscal' && !numero) avisos.push('O número da nota fiscal não foi identificado.');
  if (tipo === 'pedido_compra' && !numero) avisos.push('O número do pedido de compra não foi identificado.');
  if (!cnpj && tipo !== 'outro') avisos.push('O CNPJ do emitente não foi identificado.');
  if (itens.length === 0) avisos.push('Nenhum item foi identificado. Confira o documento antes de lançar a compra.');

  return {
    tipo,
    numero,
    emitente,
    cnpj,
    data_emissao: data,
    total,
    itens,
    avisos,
  };
}

export function numeroBrasileiro(valor: string): number | null {
  const limpo = valor.trim().replace(/\s/g, '').replace(/^R\$/i, '');
  if (!limpo || !/\d/.test(limpo)) return null;
  let normalizado = limpo;
  if (limpo.includes(',') && limpo.includes('.')) {
    normalizado = limpo.replace(/\./g, '').replace(',', '.');
  } else if (limpo.includes(',')) {
    normalizado = limpo.replace(',', '.');
  }
  const n = Number(normalizado);
  return Number.isFinite(n) ? n : null;
}

export function unidadeCanonico(valor: string | null): string | null {
  if (!valor) return null;
  const u = valor.trim().toUpperCase();
  if (u === 'KG') return 'KG';
  if (u === 'METRO' || u === 'METROS' || u === 'M' || u === 'MT') return 'METRO';
  if (u === 'UN' || u === 'PC' || u === 'PÇ' || u === 'PEÇA' || u === 'PECA') return 'UN';
  return u;
}

function primeiroCnpj(texto: string): string | null {
  const encontrados = texto.match(/\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}/g) ?? [];
  for (const candidato of encontrados) {
    const digitos = apenasDigitos(candidato);
    if (cnpjValido(digitos)) return digitos;
  }
  return null;
}

function numeroDoDocumento(texto: string, tipo: TipoDocumento): string | null {
  if (tipo === 'nota_fiscal' || tipo === 'outro') {
    const nota =
      texto.match(/NF[- ]?e\b[^\d]{0,24}(\d{1,9})/i) ??
      texto.match(/N[úu]mero(?:\s+da\s+nota)?\s*[:.]?\s*(\d{1,9})/i) ??
      texto.match(/Nota\s+Fiscal\s*(?:n[º°o.]*)?\s*[:.]?\s*(\d{1,9})/i);
    if (nota) return nota[1];
  }
  if (tipo === 'pedido_compra' || tipo === 'outro') {
    const pedido = texto.match(
      /Pedido(?:\s+de\s+compra)?\s*(?:n[º°o.]*)?\s*[:.]?\s*([A-Z0-9][A-Z0-9./-]{0,20})/i,
    );
    if (pedido && !/^de$/i.test(pedido[1])) return pedido[1];
  }
  return null;
}

function emitenteDoTexto(texto: string): string | null {
  const padroes = [
    /Fornecedor\s*[:\-]\s*(.+)/i,
    /Emitente\s*[:\-]\s*(.+)/i,
    /Raz[aã]o Social\s*[:\-]\s*(.+)/i,
  ];
  for (const padrao of padroes) {
    const achado = texto.match(padrao);
    if (!achado) continue;
    const nome = achado[1].split(/\s{2,}|\|/)[0].replace(/\s*CNPJ.*$/i, '').trim();
    if (nome.length >= 2 && nome.length <= 160) return nome;
  }
  return null;
}

function primeiraData(texto: string): string | null {
  const datas = texto.matchAll(/\b(\d{2})\/(\d{2})\/(\d{4})\b/g);
  for (const data of datas) {
    const dia = Number(data[1]);
    const mes = Number(data[2]);
    const ano = Number(data[3]);
    if (mes >= 1 && mes <= 12 && dia >= 1 && dia <= 31 && ano >= 2000 && ano <= 2100) {
      return `${data[3]}-${data[2]}-${data[1]}`;
    }
  }
  return null;
}

function totalDoTexto(texto: string): number | null {
  const encontrados = [
    ...texto.matchAll(
      /(?:Valor\s+total(?:\s+da\s+nota)?|Total\s+da\s+nota|Total\s+geral|Total)\s*[:\-]?\s*R?\$?\s*(\d{1,3}(?:\.\d{3})*,\d{2}|\d+[.,]\d{2})/gi,
    ),
  ];
  if (encontrados.length === 0) return null;
  return numeroBrasileiro(encontrados[encontrados.length - 1][1]);
}

function itensDoTexto(texto: string): ItemLido[] {
  const itens: ItemLido[] = [];
  for (const linhaBruta of texto.split('\n')) {
    const linha = linhaBruta.trim();
    if (!linha || linha.length < 3) continue;
    const porBarra = itemPorBarra(linha);
    const item = porBarra ?? itemPorColunas(linha);
    if (item) itens.push(item);
  }
  return itens;
}

function itemPorBarra(linha: string): ItemLido | null {
  if (!linha.includes('|')) return null;
  const partes = linha.split('|').map((parte) => parte.trim()).filter(Boolean);
  if (partes.length < 3) return null;
  const descricao = partes[0].replace(/^item\s*[:\-]\s*/i, '').trim();
  const quantidade = numeroBrasileiro(partes[1]);
  const unidade = UNIDADES.test(partes[2]) ? unidadeCanonico(partes[2]) : null;
  const valor = partes[3] ? numeroBrasileiro(partes[3]) : null;
  const totalInformado = partes[4] ? numeroBrasileiro(partes[4]) : null;
  if (!descricao || quantidade == null) return null;
  return {
    descricao,
    quantidade,
    unidade,
    valor_unitario: valor,
    total: totalInformado ?? (valor != null ? Math.round(quantidade * valor * 100) / 100 : null),
  };
}

function itemPorColunas(linha: string): ItemLido | null {
  const match = linha.match(
    /^(.+?)\s+(\d+(?:[.,]\d+)?)\s+(KG|METRO|METROS|M|MT|UN|PC|PÇ|PEÇA|PECA)\s+(\d{1,3}(?:\.\d{3})*,\d{2}|\d+[.,]\d{2})(?:\s+(\d{1,3}(?:\.\d{3})*,\d{2}|\d+[.,]\d{2}))?$/i,
  );
  if (!match) return null;
  const descricao = match[1].replace(/^\d+\s+/, '').trim();
  if (descricao.length < 2 || /^(descri[cç][aã]o|quantidade|valor|item)$/i.test(descricao)) return null;
  const quantidade = numeroBrasileiro(match[2]);
  const valor = numeroBrasileiro(match[4]);
  const total = match[5] ? numeroBrasileiro(match[5]) : valor != null && quantidade != null
    ? Math.round(quantidade * valor * 100) / 100
    : null;
  return {
    descricao,
    quantidade,
    unidade: unidadeCanonico(match[3]),
    valor_unitario: valor,
    total,
  };
}
