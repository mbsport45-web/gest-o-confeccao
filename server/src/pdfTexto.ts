import { extractText } from 'unpdf';

const LIMITE_BYTES = 8 * 1024 * 1024;
const LIMITE_PAGINAS = 30;

export async function textoDoPdf(buffer: Buffer): Promise<string> {
  if (buffer.length < 5 || buffer.subarray(0, 5).toString('latin1') !== '%PDF-') {
    throw Object.assign(new Error('Envie um arquivo PDF'), { status: 400 });
  }
  if (buffer.length > LIMITE_BYTES) {
    throw Object.assign(new Error('O PDF pode ter no máximo 8 MB'), { status: 400 });
  }
  let extraido: { text: string; totalPages: number };
  try {
    extraido = await extractText(new Uint8Array(buffer), { mergePages: true });
  } catch {
    throw Object.assign(new Error('Não foi possível ler este PDF'), { status: 400 });
  }
  if (extraido.totalPages > LIMITE_PAGINAS) {
    throw Object.assign(new Error('O PDF pode ter no máximo 30 páginas'), { status: 400 });
  }
  return extraido.text.replace(/\u0000/g, ' ').replace(/[ \t]+\n/g, '\n').trim().slice(0, 20000);
}

export function pdfComTexto(linhas: string[]): Buffer {
  const stream = linhas
    .map((linha, indice) => {
      const y = 760 - indice * 16;
      const escapado = linha.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
      return `BT /F1 11 Tf 48 ${y} Td (${escapado}) Tj ET`;
    })
    .join('\n');
  const objetos = [
    '1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n',
    '2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n',
    '3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>\nendobj\n',
    `4 0 obj\n<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}\nendstream\nendobj\n`,
    '5 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n',
  ];
  let pdf = '%PDF-1.4\n';
  const offsets = [0];
  for (const objeto of objetos) {
    offsets.push(Buffer.byteLength(pdf));
    pdf += objeto;
  }
  const xref = Buffer.byteLength(pdf);
  pdf += `xref\n0 ${objetos.length + 1}\n`;
  pdf += '0000000000 65535 f \n';
  for (let i = 1; i <= objetos.length; i += 1) {
    pdf += `${String(offsets[i]).padStart(10, '0')} 00000 n \n`;
  }
  pdf += `trailer\n<< /Size ${objetos.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return Buffer.from(pdf);
}
