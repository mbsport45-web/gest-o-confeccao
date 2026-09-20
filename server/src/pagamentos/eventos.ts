/**
 * Nomes oficiais de eventos Asaas (documentação atual).
 * Não inventar nomes: https://docs.asaas.com/docs/subscription-events
 * https://docs.asaas.com/docs/payment-events
 * https://docs.asaas.com/docs/checkout-events
 */
export const EVENTOS_ASSINATURA_ASAAS = [
  'SUBSCRIPTION_CREATED',
  'SUBSCRIPTION_UPDATED',
  'SUBSCRIPTION_INACTIVATED',
  'SUBSCRIPTION_DELETED',
  'SUBSCRIPTION_SPLIT_DISABLED',
  'SUBSCRIPTION_SPLIT_DIVERGENCE_BLOCK',
  'SUBSCRIPTION_SPLIT_DIVERGENCE_BLOCK_FINISHED',
] as const;

export const EVENTOS_PAGAMENTO_ASAAS = [
  'PAYMENT_CREATED',
  'PAYMENT_AWAITING_RISK_ANALYSIS',
  'PAYMENT_APPROVED_BY_RISK_ANALYSIS',
  'PAYMENT_REPROVED_BY_RISK_ANALYSIS',
  'PAYMENT_AUTHORIZED',
  'PAYMENT_UPDATED',
  'PAYMENT_CONFIRMED',
  'PAYMENT_RECEIVED',
  'PAYMENT_CREDIT_CARD_CAPTURE_REFUSED',
  'PAYMENT_ANTICIPATED',
  'PAYMENT_OVERDUE',
  'PAYMENT_DELETED',
  'PAYMENT_RESTORED',
  'PAYMENT_REFUNDED',
  'PAYMENT_PARTIALLY_REFUNDED',
  'PAYMENT_REFUND_IN_PROGRESS',
  'PAYMENT_REFUND_DENIED',
  'PAYMENT_RECEIVED_IN_CASH_UNDONE',
  'PAYMENT_CHARGEBACK_REQUESTED',
  'PAYMENT_CHARGEBACK_DISPUTE',
  'PAYMENT_AWAITING_CHARGEBACK_REVERSAL',
  'PAYMENT_DUNNING_RECEIVED',
  'PAYMENT_BANK_SLIP_CANCELLED',
  'PAYMENT_DUNNING_REQUESTED',
  'PAYMENT_BANK_SLIP_VIEWED',
  'PAYMENT_CHECKOUT_VIEWED',
  'PAYMENT_SPLIT_CANCELLED',
  'PAYMENT_SPLIT_DIVERGENCE_BLOCK',
  'PAYMENT_SPLIT_DIVERGENCE_BLOCK_FINISHED',
] as const;

export const EVENTOS_CHECKOUT_ASAAS = [
  'CHECKOUT_CREATED',
  'CHECKOUT_CANCELED',
  'CHECKOUT_EXPIRED',
  'CHECKOUT_PAID',
] as const;

export const EVENTOS_ASAAS_CONHECIDOS = [
  ...EVENTOS_ASSINATURA_ASAAS,
  ...EVENTOS_PAGAMENTO_ASAAS,
  ...EVENTOS_CHECKOUT_ASAAS,
] as const;

export type EventoAsaas = (typeof EVENTOS_ASAAS_CONHECIDOS)[number];

export const EVENTOS_PAGAMENTO_APROVADO = ['PAYMENT_CONFIRMED', 'PAYMENT_RECEIVED', 'CHECKOUT_PAID'] as const;
export const EVENTOS_PAGAMENTO_PENDENTE = ['PAYMENT_CREATED', 'PAYMENT_AUTHORIZED', 'PAYMENT_AWAITING_RISK_ANALYSIS'] as const;
export const EVENTOS_PAGAMENTO_VENCIDO = ['PAYMENT_OVERDUE'] as const;
export const EVENTOS_PAGAMENTO_NEGADO = [
  'PAYMENT_CREDIT_CARD_CAPTURE_REFUSED',
  'PAYMENT_REPROVED_BY_RISK_ANALYSIS',
] as const;
export const EVENTOS_PAGAMENTO_CANCELADO = ['PAYMENT_DELETED', 'PAYMENT_REFUNDED'] as const;

export function isEventoAsaas(valor: unknown): valor is EventoAsaas {
  return typeof valor === 'string' && (EVENTOS_ASAAS_CONHECIDOS as readonly string[]).includes(valor);
}

export function isEventoPago(evento: string): boolean {
  return (EVENTOS_PAGAMENTO_APROVADO as readonly string[]).includes(evento);
}

export function isEventoPendente(evento: string): boolean {
  return (EVENTOS_PAGAMENTO_PENDENTE as readonly string[]).includes(evento);
}

export function isEventoVencido(evento: string): boolean {
  return (EVENTOS_PAGAMENTO_VENCIDO as readonly string[]).includes(evento);
}

export function isEventoNegado(evento: string): boolean {
  return (EVENTOS_PAGAMENTO_NEGADO as readonly string[]).includes(evento);
}

export function isEventoPagamentoCancelado(evento: string): boolean {
  return (EVENTOS_PAGAMENTO_CANCELADO as readonly string[]).includes(evento);
}
