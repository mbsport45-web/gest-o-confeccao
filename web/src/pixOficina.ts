function emv(id: string, valor: string): string {
  const texto = String(valor);
  return `${id}${String(texto.length).padStart(2, '0')}${texto}`;
}

export function crc16Ccitt(texto: string): string {
  let crc = 0xffff;
  for (let i = 0; i < texto.length; i += 1) {
    crc ^= texto.charCodeAt(i) << 8;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, '0');
}

function asciiPix(texto: string, max: number, fallback: string): string {
  const limpo = texto
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^A-Za-z0-9 .,-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);
  return limpo || fallback;
}

export function valorPixReais(valor: number): string {
  const centavos = Math.round(Number(valor) * 100);
  if (!Number.isFinite(centavos) || centavos <= 0) return '0.00';
  return (centavos / 100).toFixed(2);
}

export function montarPixCopiaECola(entrada: {
  chave: string;
  valor: number;
  nome: string;
  cidade?: string;
  txid?: string;
}): string {
  const chave = entrada.chave.trim();
  if (!chave) throw new Error('Cadastre a chave Pix desta oficina');
  const valor = valorPixReais(entrada.valor);
  if (valor === '0.00') throw new Error('Não há valor a pagar para esta oficina');
  const conta = emv('00', 'br.gov.bcb.pix') + emv('01', chave);
  const adicional = emv('62', emv('05', (entrada.txid ?? '***').slice(0, 25)));
  const payload =
    emv('00', '01') +
    emv('01', '11') +
    emv('26', conta) +
    emv('52', '0000') +
    emv('53', '986') +
    emv('54', valor) +
    emv('58', 'BR') +
    emv('59', asciiPix(entrada.nome, 25, 'OFICINA')) +
    emv('60', asciiPix(entrada.cidade ?? 'SAO PAULO', 15, 'SAO PAULO')) +
    adicional +
    '6304';
  return payload + crc16Ccitt(payload);
}
