export const ETAPAS_LINHA = [
  'corte',
  'costura',
  'acabamento',
  'estamparia',
  'expedicao',
] as const;

export type EtapaLinha = (typeof ETAPAS_LINHA)[number];

const OC_EM_CORTE = new Set(['aguardando_enfesto', 'em_enfesto', 'em_corte']);
const OC_ENVIADA = new Set([...OC_EM_CORTE, 'corte_concluido', 'encaminhado']);

const ETAPA_ALIAS: Record<string, EtapaLinha> = {
  corte: 'corte',
  costura: 'costura',
  acabamento: 'acabamento',
  estamparia: 'estamparia',
  estampa: 'estamparia',
  qualidade: 'estamparia',
  expedicao: 'expedicao',
  expedição: 'expedicao',
  embalagem: 'expedicao',
};

export function totaisPorEtapaVazios(): Record<EtapaLinha, number> {
  return {
    corte: 0,
    costura: 0,
    acabamento: 0,
    estamparia: 0,
    expedicao: 0,
  };
}

export function normalizarEtapaLinha(valor?: string | null): EtapaLinha | null {
  if (!valor) return null;
  return ETAPA_ALIAS[valor.trim().toLowerCase()] ?? null;
}

export function etapaLinhaProducao(
  status: string,
  statusProcessoOc?: string | null,
  entregueOficina?: boolean,
): EtapaLinha | null {
  if (status === 'concluida' || status === 'cancelada') return null;
  if (entregueOficina || statusProcessoOc === 'entregue' || statusProcessoOc === 'expedicao') return null;
  if (status === 'costura' || status === 'em_producao') return 'costura';
  if (status === 'qualidade') return 'estamparia';
  if (status === 'acabamento') return 'acabamento';
  if (status === 'embalagem') return 'expedicao';
  if (status === 'corte') {
    if (statusProcessoOc === 'corte_concluido' || statusProcessoOc === 'encaminhado') return 'costura';
    return 'corte';
  }
  if (statusProcessoOc && OC_ENVIADA.has(statusProcessoOc)) {
    return OC_EM_CORTE.has(statusProcessoOc) ? 'corte' : 'costura';
  }
  return null;
}

export function filtrarOrdensDaEtapa<T extends { id: number; etapa_linha?: string | null }>(
  ordens: T[],
  etapa: EtapaLinha,
): T[] {
  const vistos = new Set<number>();
  const filtradas: T[] = [];
  for (const ordem of ordens) {
    if (vistos.has(ordem.id)) continue;
    if (ordem.etapa_linha !== etapa) continue;
    vistos.add(ordem.id);
    filtradas.push(ordem);
  }
  return filtradas;
}
