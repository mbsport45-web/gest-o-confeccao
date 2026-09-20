export const FORMAS_COBRANCA_SANDBOX = ['BOLETO', 'PIX'] as const;
export type FormaCobrancaSandbox = (typeof FORMAS_COBRANCA_SANDBOX)[number];

export type ClienteGateway = {
  id: string;
  name: string;
  email?: string | null;
  cpfCnpj?: string | null;
  externalReference?: string | null;
};

export type AssinaturaGateway = {
  id: string;
  customer: string;
  value: number;
  cycle: 'MONTHLY';
  status: 'ACTIVE' | 'INACTIVE' | 'EXPIRED';
  billingType: string;
  nextDueDate: string;
  description?: string | null;
  externalReference?: string | null;
};

export type CheckoutGateway = {
  id: string;
  url?: string | null;
  status?: string | null;
};

export type CriarClienteGateway = {
  nome: string;
  email: string;
  documento: string;
  referenciaExterna: string;
};

export type CriarAssinaturaGateway = {
  customerId: string;
  valor: number;
  descricao: string;
  referenciaExterna: string;
  billingType: FormaCobrancaSandbox;
  proximoVencimento: string;
};

export type EventoWebhookGateway = {
  id: string;
  event: string;
  dateCreated?: string;
  payment?: Record<string, unknown> | null;
  subscription?: Record<string, unknown> | null;
  checkout?: Record<string, unknown> | null;
};

/**
 * Abstração de provedor de pagamento. A aplicação fala só com esta interface;
 * AsaasPaymentGateway é a implementação sandbox atual.
 */
export interface PaymentGateway {
  readonly provedor: 'asaas';
  readonly ambiente: 'sandbox';
  criarOuLocalizarCliente(input: CriarClienteGateway): Promise<ClienteGateway>;
  criarAssinatura(input: CriarAssinaturaGateway): Promise<AssinaturaGateway>;
  consultarAssinatura(id: string): Promise<AssinaturaGateway>;
  atualizarAssinatura(
    id: string,
    input: { valor?: number; descricao?: string },
  ): Promise<AssinaturaGateway>;
  cancelarAssinatura(id: string): Promise<AssinaturaGateway>;
  reativarAssinatura(id: string, proximoVencimento: string): Promise<AssinaturaGateway>;
  criarCheckout(input: {
    customerId: string;
    valor: number;
    descricao: string;
    referenciaExterna: string;
  }): Promise<CheckoutGateway>;
  interpretarWebhook(corpo: unknown): EventoWebhookGateway;
}
