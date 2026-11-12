export type DadoTecidoFaltante = 'largura' | 'gramatura';

export function decimalEmDigitacao(valor: string | undefined): boolean {
  const t = String(valor ?? '').trim();
  return t === '' || t === '-' || t === ',' || t === '.' || /[.,]$/.test(t);
}

export function numeroDoTexto(valor: string | number | undefined | null): number | null {
  if (typeof valor === 'number') return Number.isFinite(valor) && valor > 0 ? valor : null;
  const t = String(valor ?? '').trim().replace(/\s/g, '');
  if (!t || decimalEmDigitacao(t)) return null;
  let normalizado = t;
  if (t.includes(',') && t.includes('.')) {
    const virgulaPorUltimo = t.lastIndexOf(',') > t.lastIndexOf('.');
    normalizado = virgulaPorUltimo ? t.replace(/\./g, '').replace(',', '.') : t.replace(/,/g, '');
  } else {
    normalizado = t.replace(',', '.');
  }
  const n = Number(normalizado);
  return Number.isFinite(n) && n > 0 ? n : null;
}

export function larguraParaCm(valor: number | null | undefined, unidade?: string | null): number | null {
  if (valor == null || !(Number(valor) > 0)) return null;
  const n = Number(valor);
  return (unidade || 'cm').toLowerCase() === 'm' ? n * 100 : n;
}

const STOP_COMPOSICAO = new Set([
  'kg',
  'kgs',
  'mt',
  'mts',
  'm',
  'cm',
  'un',
  'mm',
  'gsm',
  'g',
  'largura',
  'gramatura',
  'unidade',
  'tecido',
  'peso',
  'metro',
  'metros',
  'ref',
  'ncm',
]);

export function extrairComposicaoTexto(texto: string | undefined): string {
  const t = String(texto ?? '');
  const partes: string[] = [];
  const re = /(\d+(?:[.,]\d+)?)\s*%/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(t))) {
    const depois = t.slice(re.lastIndex);
    const nomeBruto = depois.match(/^\s*([A-Za-zÀ-ÿ]+)/);
    const fibra = (nomeBruto?.[1] ?? '').trim();
    if (!fibra || STOP_COMPOSICAO.has(fibra.toLowerCase())) {
      partes.push(`${m[1]}%`);
      continue;
    }
    partes.push(`${m[1]}% ${fibra}`);
  }
  if (partes.length === 0) return '';
  if (partes.length === 1) return partes[0];
  if (partes.length === 2) return `${partes[0]} e ${partes[1]}`;
  return `${partes.slice(0, -1).join(', ')} e ${partes[partes.length - 1]}`;
}

export function extrairDadosTecidoTexto(texto: string | undefined): {
  larguraCm: number | null;
  gramatura: number | null;
  composicao: string;
  unidade: string | null;
} {
  const t = texto ?? '';
  const largura =
    t.match(/largura[^0-9]{0,16}(\d+(?:[.,]\d+)?)\s*cm/i) ??
    t.match(/(\d+(?:[.,]\d+)?)\s*cm(?:\b|$)/i);
  const gramatura =
    t.match(/gramatura[^0-9]{0,16}(\d+(?:[.,]\d+)?)/i) ??
    t.match(/(\d+(?:[.,]\d+)?)\s*(?:g\/m²|g\/m2|gsm)/i);
  let unidade: string | null = null;
  if (/\b(mt|metros?|metro)\b/i.test(t)) unidade = 'MT';
  if (/\bkg\b/i.test(t)) unidade = 'KG';
  return {
    larguraCm: numeroDoTexto(largura?.[1]),
    gramatura: numeroDoTexto(gramatura?.[1]),
    composicao: extrairComposicaoTexto(t),
    unidade,
  };
}

export function consumoPorUnidade(unidade: string | undefined): 'metro' | 'peso' {
  const normalizada = (unidade ?? '').trim().toUpperCase();
  if (normalizada === 'MT' || normalizada === 'M' || normalizada === 'METRO' || normalizada === 'METROS') {
    return 'metro';
  }
  return 'peso';
}

export function dadosFaltantesConsumo(
  unidade: string | undefined,
  larguraCm?: number | null,
  gramatura?: number | null,
): DadoTecidoFaltante[] {
  if (consumoPorUnidade(unidade) === 'metro') return [];
  const faltando: DadoTecidoFaltante[] = [];
  if (!(Number(larguraCm) > 0)) faltando.push('largura');
  if (!(Number(gramatura) > 0)) faltando.push('gramatura');
  return faltando;
}

export function mensagemDadosFaltantes(faltando: DadoTecidoFaltante[]): string | null {
  if (faltando.length === 0) return null;
  if (faltando.includes('largura') && faltando.includes('gramatura')) {
    return 'Falta largura e gramatura no cadastro do tecido';
  }
  if (faltando.includes('largura')) {
    return 'Falta largura no cadastro do tecido';
  }
  return 'Falta gramatura no cadastro do tecido';
}

export function aplicarPerdaPercentual(consumo: number, perdaPercentual: number): number {
  const perda = Number(perdaPercentual);
  if (!(consumo > 0) || !(perda > 0)) return consumo;
  return consumo * (1 + perda / 100);
}

export function calcularConsumoCorte(entrada: {
  unidade: string;
  metragemRisco: number;
  larguraCm?: number | null;
  gramatura?: number | null;
  camadas: number;
  perdaPercentual?: number;
}):
  | {
      ok: true;
      consumoCalculado: number;
      consumoComPerda: number;
      unidadeControle: 'metro' | 'peso';
    }
  | { ok: false; erro: string } {
  const metragem = Number(entrada.metragemRisco);
  const camadas = Number(entrada.camadas);
  if (!(metragem > 0)) return { ok: false, erro: 'Informe a metragem do risco' };
  if (!Number.isInteger(camadas) || camadas < 1) {
    return { ok: false, erro: 'Informe o número de camadas do enfesto' };
  }
  const unidadeControle = consumoPorUnidade(entrada.unidade);
  let consumoCalculado: number;
  if (unidadeControle === 'metro') {
    consumoCalculado = metragem * camadas;
  } else {
    const aviso = mensagemDadosFaltantes(
      dadosFaltantesConsumo(entrada.unidade, entrada.larguraCm, entrada.gramatura),
    );
    if (aviso) return { ok: false, erro: aviso };
    const larguraCm = Number(entrada.larguraCm);
    const gramatura = Number(entrada.gramatura);
    consumoCalculado = (metragem * (larguraCm / 100) * gramatura * camadas) / 1000;
  }
  return {
    ok: true,
    consumoCalculado,
    consumoComPerda: aplicarPerdaPercentual(consumoCalculado, Number(entrada.perdaPercentual) || 0),
    unidadeControle,
  };
}

export function consumoParaBaixa(
  calculado: { consumoComPerda: number },
  consumoReal?: number | null,
): number {
  if (consumoReal != null && Number(consumoReal) > 0) return Number(consumoReal);
  return calculado.consumoComPerda;
}

export function camadasAutomaticasPorCor(quantidades: Array<number | null | undefined>): number {
  const positivas = quantidades.map((item) => Number(item) || 0).filter((item) => item > 0);
  if (positivas.length === 0) return 0;
  return Math.min(...positivas);
}

export function consumoTotalPorCor(camadas: number, pesoFolha: number): number {
  const folhas = Number(camadas);
  const peso = Number(pesoFolha);
  if (!(folhas > 0) || !(peso > 0)) return 0;
  return Math.round(folhas * peso * 1000) / 1000;
}
