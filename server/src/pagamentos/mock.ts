import { ASAAS_AMBIENTE, ASAAS_PROVEDOR } from './config.js';
import type {
  AssinaturaGateway,
  CheckoutGateway,
  ClienteGateway,
  CriarAssinaturaGateway,
  CriarClienteGateway,
  EventoWebhookGateway,
  PaymentGateway,
} from './tipos.js';

export type ChamadaGateway = { metodo: string; payload: unknown };

export class MockPaymentGateway implements PaymentGateway {
  readonly provedor = ASAAS_PROVEDOR;
  readonly ambiente = ASAAS_AMBIENTE;
  readonly chamadas: ChamadaGateway[] = [];
  readonly clientes = new Map<string, ClienteGateway>();
  readonly clientesPorRef = new Map<string, ClienteGateway>();
  readonly assinaturas = new Map<string, AssinaturaGateway>();
  private seqCliente = 1;
  private seqAssinatura = 1;

  private registrar(metodo: string, payload: unknown) {
    this.chamadas.push({ metodo, payload });
  }

  async criarOuLocalizarCliente(input: CriarClienteGateway): Promise<ClienteGateway> {
    this.registrar('criarOuLocalizarCliente', input);
    const existente = this.clientesPorRef.get(input.referenciaExterna);
    if (existente) return existente;
    const cliente: ClienteGateway = {
      id: `cus_sandbox_${this.seqCliente++}`,
      name: input.nome,
      email: input.email,
      cpfCnpj: input.documento,
      externalReference: input.referenciaExterna,
    };
    this.clientes.set(cliente.id, cliente);
    this.clientesPorRef.set(input.referenciaExterna, cliente);
    return cliente;
  }

  async criarAssinatura(input: CriarAssinaturaGateway): Promise<AssinaturaGateway> {
    this.registrar('criarAssinatura', input);
    const assinatura: AssinaturaGateway = {
      id: `sub_sandbox_${this.seqAssinatura++}`,
      customer: input.customerId,
      value: input.valor,
      cycle: 'MONTHLY',
      status: 'ACTIVE',
      billingType: input.billingType,
      nextDueDate: input.proximoVencimento,
      description: input.descricao,
      externalReference: input.referenciaExterna,
    };
    this.assinaturas.set(assinatura.id, assinatura);
    return assinatura;
  }

  async consultarAssinatura(id: string): Promise<AssinaturaGateway> {
    this.registrar('consultarAssinatura', { id });
    const atual = this.assinaturas.get(id);
    if (!atual) throw new Error(`assinatura sandbox ${id} não encontrada`);
    return atual;
  }

  async atualizarAssinatura(
    id: string,
    input: { valor?: number; descricao?: string },
  ): Promise<AssinaturaGateway> {
    this.registrar('atualizarAssinatura', { id, ...input });
    const atual = await this.consultarAssinatura(id);
    const proxima: AssinaturaGateway = {
      ...atual,
      value: typeof input.valor === 'number' ? input.valor : atual.value,
      description: input.descricao ?? atual.description,
    };
    this.assinaturas.set(id, proxima);
    return proxima;
  }

  async cancelarAssinatura(id: string): Promise<AssinaturaGateway> {
    this.registrar('cancelarAssinatura', { id });
    const atual = await this.consultarAssinatura(id);
    const proxima: AssinaturaGateway = { ...atual, status: 'INACTIVE' };
    this.assinaturas.set(id, proxima);
    return proxima;
  }

  async reativarAssinatura(id: string, proximoVencimento: string): Promise<AssinaturaGateway> {
    this.registrar('reativarAssinatura', { id, proximoVencimento });
    const atual = await this.consultarAssinatura(id);
    const proxima: AssinaturaGateway = {
      ...atual,
      status: 'ACTIVE',
      nextDueDate: proximoVencimento,
    };
    this.assinaturas.set(id, proxima);
    return proxima;
  }

  async criarCheckout(): Promise<CheckoutGateway> {
    this.registrar('criarCheckout', {});
    throw new Error('Checkout público Asaas ainda não está habilitado');
  }

  interpretarWebhook(corpo: unknown): EventoWebhookGateway {
    const obj = (corpo ?? {}) as Record<string, unknown>;
    return {
      id: String(obj.id ?? ''),
      event: String(obj.event ?? ''),
      dateCreated: obj.dateCreated ? String(obj.dateCreated) : undefined,
      payment: (obj.payment as Record<string, unknown>) ?? null,
      subscription: (obj.subscription as Record<string, unknown>) ?? null,
      checkout: (obj.checkout as Record<string, unknown>) ?? null,
    };
  }
}
