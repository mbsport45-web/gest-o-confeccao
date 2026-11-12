import PDFDocument from 'pdfkit';
import {
  TAMANHOS_FICHA,
  formatarDataBr,
  formatarMoedaBr,
  oficinasParaImpressao,
  type ExtraImpressaoOc,
  type OrdemCorte,
} from './ordensGrade.js';

function texto(valor: string | number | null | undefined): string {
  return String(valor ?? '').trim();
}

function chave(cor: string, tamanho: string): string {
  return `${cor.trim().toLocaleLowerCase('pt-BR')}|${tamanho.trim().toLocaleLowerCase('pt-BR')}`;
}

function quantidade(corte: OrdemCorte, cor: string, tamanho: string): number {
  return corte.grade.find((celula) => chave(celula.cor, celula.tamanho) === chave(cor, tamanho))?.quantidade ?? 0;
}

function completar<T>(lista: T[], minimo: number, vazio: T): T[] {
  const saida = [...lista];
  while (saida.length < minimo) saida.push(vazio);
  return saida.length ? saida : [vazio];
}

function contarPercentuais(valor: string): number {
  return (valor.match(/\d+(?:[.,]\d+)?\s*%/g) ?? []).length;
}

export function composicaoImpressaoOc(corte: Pick<OrdemCorte, 'composicao' | 'tecido_composicao' | 'tecido_nome'>): string {
  const fontes = [corte.tecido_composicao, corte.composicao, corte.tecido_nome]
    .map((item) => texto(item))
    .filter(Boolean);
  let melhor = texto(corte.composicao);
  let melhorCount = contarPercentuais(melhor);
  for (const fonte of fontes) {
    const count = contarPercentuais(fonte);
    if (count > melhorCount || (count === melhorCount && fonte.length > melhor.length)) {
      melhor = fonte;
      melhorCount = count;
    }
  }
  if (melhorCount > 0 && melhor === texto(corte.tecido_nome) && melhor !== texto(corte.tecido_composicao)) {
    const inicio = melhor.search(/\d+(?:[.,]\d+)?\s*%/);
    if (inicio > 0) return melhor.slice(inicio).trim();
  }
  return melhor;
}

function textoCostureiros(corte: OrdemCorte, extras?: ExtraImpressaoOc): string {
  const info = texto(corte.informacoes_costureiros);
  const nome = texto(extras?.costureiro);
  if (nome && info) {
    if (info.toLocaleLowerCase('pt-BR').includes(nome.toLocaleLowerCase('pt-BR'))) return info;
    return `${nome} — ${info}`;
  }
  return nome || info;
}

export function nomeArquivoPdfOrdemCorte(codigo: string): string {
  const limpo = codigo.trim().replace(/[^\w.-]+/g, '_') || 'OC';
  return `${limpo}-ficha.pdf`;
}

export function pdfImpressaoOrdemCorte(corte: OrdemCorte, extras?: ExtraImpressaoOc): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: 'A4',
      margin: 22,
      compress: false,
      info: { Title: `${corte.codigo} — Ficha de produção`, Author: 'Gestão Confecção' },
    });
    const chunks: Buffer[] = [];
    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
    desenharFicha(doc, corte, extras);
    doc.end();
  });
}

type PdfDoc = InstanceType<typeof PDFDocument>;

function desenharFicha(doc: PdfDoc, corte: OrdemCorte, extras?: ExtraImpressaoOc) {
  const pageW = doc.page.width - doc.page.margins.left - doc.page.margins.right;
  const x0 = doc.page.margins.left;
  let y = doc.page.margins.top;
  const preto = '#111111';
  const wEsq = Math.round(pageW * 0.58);
  const wDir = pageW - wEsq;

  const tamanhos = [...TAMANHOS_FICHA];
  const cores = completar(
    corte.linhas.length
      ? corte.linhas
      : [...new Set(corte.grade.map((celula) => celula.cor))].map((cor) => ({ cor, detalhes: '' })),
    6,
    { cor: '', detalhes: '' },
  );
  const oficinas = oficinasParaImpressao(corte, extras);
  const composicao = composicaoImpressaoOc(corte);
  doc.font('Helvetica').fontSize(11);
  const hTop = Math.max(56, Math.min(96, 18 + doc.heightOfString(composicao || ' ', { width: wDir - 16 }) + 12));
  const hModelo = Math.round(hTop * 0.55);
  campo(doc, x0, y, wEsq, 'MODELO', corte.modelo, hModelo);
  campo(doc, x0, y + hModelo, wEsq, 'REF', corte.referencia, hTop - hModelo);
  bloco(doc, x0 + wEsq, y, wDir, 'COMPOSIÇÃO', composicao, hTop);
  y += hTop;

  const yMeio = y;
  let yDir = yMeio;
  caixaTitulo(doc, x0 + wEsq, yDir, wDir, 18, 'OFICINA — COSTUREIRO');
  yDir += 18;
  tabela(
    doc,
    x0 + wEsq,
    yDir,
    wDir,
    ['Oficina', 'Costureiro', 'Obs'],
    [wDir * 0.38, wDir * 0.32, wDir * 0.3],
    oficinas.map((item) => [item.oficina, item.costureiro, item.observacoes]),
  );
  yDir += 16 + oficinas.length * 16;
  if (extras?.data_liberacao || extras?.liberado_em || extras?.valor_peca != null) {
    const wMeioLib = wDir / 2;
    campo(
      doc,
      x0 + wEsq,
      yDir,
      wMeioLib,
      'DATA DE LIBERAÇÃO',
      formatarDataBr(extras.data_liberacao || extras.liberado_em),
      26,
    );
    campo(doc, x0 + wEsq + wMeioLib, yDir, wMeioLib, 'VALOR POR PEÇA', formatarMoedaBr(extras.valor_peca), 26);
    yDir += 26;
  }
  yDir = bloco(doc, x0 + wEsq, yDir, wDir, 'INF. P/ OFICINA', corte.informacoes_oficina, 42);
  const wMeio = wDir / 2;
  campo(doc, x0 + wEsq, yDir, wMeio, 'O.C.', extras?.codigo_oc || corte.codigo, 26);
  campo(
    doc,
    x0 + wEsq + wMeio,
    yDir,
    wMeio,
    'DATA RETIRADA',
    formatarDataBr(corte.data_retirada || extras?.data_retirada),
    26,
  );
  yDir += 26;
  yDir = bloco(doc, x0 + wEsq, yDir, wDir, 'INFORMAÇÕES DOS COSTUREIROS', textoCostureiros(corte, extras), 42);

  const hMeio = yDir - yMeio;
  const hLinhaAvia = 16;
  const nLinhasAvia = Math.max(8, Math.floor((hMeio - 18 - hLinhaAvia) / hLinhaAvia));
  const aviamentos = completar(corte.aviamentos, nLinhasAvia, {
    id: 0,
    aviamento_id: null,
    descricao: '',
    quantidade: 0,
    unidade: '',
    observacoes: '',
  });
  caixaTitulo(doc, x0, yMeio, wEsq, 18, 'AVIAMENTOS');
  tabela(
    doc,
    x0,
    yMeio + 18,
    wEsq,
    ['Descrição', 'Qtd', 'Un'],
    [wEsq - 90, 50, 40],
    aviamentos.map((item) => [
      [item.descricao, item.observacoes].filter((parte) => texto(parte)).join(' — '),
      item.quantidade ? String(item.quantidade) : '',
      item.unidade,
    ]),
  );
  y = Math.max(yDir, yMeio + 18 + 16 + aviamentos.length * 16);

  const colunasGrade = ['Cores', ...tamanhos, 'Detalhes', 'Total'];
  const wNum = 36;
  const wDet = 90;
  const wCor = pageW - wNum * (tamanhos.length + 1) - wDet;
  const larguras = [wCor, ...tamanhos.map(() => wNum), wDet, wNum];
  const totaisTamanho = tamanhos.map((tamanho) =>
    cores.reduce((soma, linha) => soma + quantidade(corte, linha.cor, tamanho), 0),
  );
  const totalGeral = corte.grade.reduce((soma, celula) => soma + celula.quantidade, 0);
  const linhasGrade = cores.map((linha) => {
    const qtds = tamanhos.map((tamanho) => quantidade(corte, linha.cor, tamanho));
    const total = qtds.reduce((soma, n) => soma + n, 0);
    return [linha.cor, ...qtds.map((n) => (n ? String(n) : '')), linha.detalhes, total ? String(total) : ''];
  });
  linhasGrade.push([
    'Total',
    ...totaisTamanho.map((n) => (n ? String(n) : '')),
    '',
    String(totalGeral || ''),
  ]);
  tabela(doc, x0, y, pageW, colunasGrade, larguras, linhasGrade);
  y += 18 + linhasGrade.length * 16;

  y = bloco(doc, x0, y, pageW, 'INFORMAÇÕES ACABAMENTO', corte.informacoes_acabamento, 88);

  doc.save();
  doc.lineWidth(1.6).strokeColor(preto).rect(x0, doc.page.margins.top, pageW, y - doc.page.margins.top).stroke();
  doc.restore();
}

function caixaTitulo(doc: PdfDoc, x: number, y: number, w: number, h: number, titulo: string) {
  doc.save();
  doc.rect(x, y, w, h).fillAndStroke('#efefef', '#111111');
  doc.fillColor('#111111').font('Helvetica-Bold').fontSize(8).text(titulo, x + 4, y + 5, { width: w - 8 });
  doc.restore();
}

function campo(
  doc: PdfDoc,
  x: number,
  y: number,
  w: number,
  titulo: string,
  valor: string,
  h: number,
): number {
  doc.save();
  doc.lineWidth(0.8).strokeColor('#111111').rect(x, y, w, h).stroke();
  doc.font('Helvetica-Bold').fontSize(8).fillColor('#111111').text(titulo, x + 4, y + 3, { width: w - 8 });
  doc
    .moveTo(x, y + 13)
    .lineTo(x + w, y + 13)
    .stroke();
  doc.font('Helvetica').fontSize(11).text(texto(valor), x + 4, y + 15, { width: w - 8, height: h - 18 });
  doc.restore();
  return y + h;
}

function bloco(
  doc: PdfDoc,
  x: number,
  y: number,
  w: number,
  titulo: string,
  valor: string,
  h: number,
): number {
  doc.save();
  doc.lineWidth(0.8).strokeColor('#111111').rect(x, y, w, h).stroke();
  doc.font('Helvetica-Bold').fontSize(8).fillColor('#111111').text(titulo, x + 4, y + 3, { width: w - 8 });
  doc.font('Helvetica').fontSize(10).text(texto(valor), x + 4, y + 15, { width: w - 8, height: h - 20 });
  doc.restore();
  return y + h;
}

function tabela(
  doc: PdfDoc,
  x: number,
  y: number,
  w: number,
  cabecalho: string[],
  larguras: number[],
  linhas: string[][],
) {
  const h = 16;
  let cx = x;
  doc.save();
  doc.rect(x, y, w, h).fillAndStroke('#efefef', '#111111');
  doc.font('Helvetica-Bold').fontSize(8).fillColor('#111111');
  cabecalho.forEach((titulo, i) => {
    doc.text(titulo, cx + 3, y + 4, { width: larguras[i] - 6, height: h - 4, ellipsis: true });
    cx += larguras[i];
  });
  linhas.forEach((linha, row) => {
    const yy = y + h * (row + 1);
    let xx = x;
    doc.rect(x, yy, w, h).stroke();
    doc.font(row === linhas.length - 1 && linha[0] === 'Total' ? 'Helvetica-Bold' : 'Helvetica').fontSize(9);
    linha.forEach((celula, i) => {
      doc.rect(xx, yy, larguras[i], h).stroke();
      doc.text(texto(celula), xx + 3, yy + 4, { width: larguras[i] - 6, height: h - 4, ellipsis: true });
      xx += larguras[i];
    });
  });
  doc.restore();
}
