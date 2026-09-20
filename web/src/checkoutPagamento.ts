import {
  formatarPrecoMensal,
  type MeioPagamentoSandbox,
  type PlanoEmpresa,
} from './api';

export const MSG_SANDBOX =
  'Ambiente de teste (Asaas Sandbox). Nenhuma cobrança real será feita.';
export const MSG_PENDENTE = 'Pagamento aguardando confirmação.';
export const MSG_CONFIRMADO = 'Pagamento confirmado. Sua assinatura está ativa.';
export const MSG_FALHOU =
  'Não foi possível confirmar o pagamento. Tente novamente ou escolha outro meio.';
export const MSG_CANCELADA = 'Assinatura cancelada.';
export const MSG_ERRO = 'Não foi possível comunicar com o pagamento de teste. Tente novamente.';

export const RECURSO_LABEL: Record<string, string> = {
  expedicao: 'Expedição',
  financeiro: 'Financeiro',
  relatorios_avancados: 'Relatórios avançados',
  api_externa: 'API externa',
  suporte_prioritario: 'Suporte prioritário',
};

export function rotuloAcaoPlano(plano: PlanoEmpresa, atual: PlanoEmpresa): string {
  if (plano.codigo === atual.codigo) return 'Plano atual';
  const preco = formatarPrecoMensal(plano.preco_mensal, plano.moeda);
  return plano.ordem > atual.ordem ? `Assinar / upgrade · ${preco}` : `Assinar / downgrade · ${preco}`;
}

export function rotuloMeio(meio: MeioPagamentoSandbox): string {
  return meio === 'PIX' ? 'Pix' : 'Boleto';
}
