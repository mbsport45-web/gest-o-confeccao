import { ASAAS_AMBIENTE, ASAAS_PROVEDOR, lerConfiguracaoAsaas, recusarUrlProducao, type ConfiguracaoAsaas } from './config.js';
import type {
  AssinaturaGateway,
  CheckoutGateway,
  ClienteGateway,
  CriarAssinaturaGateway,
  CriarClienteGateway,
  EventoWebhookGateway,
  PaymentGateway,
} from './tipos.js';

export class ErroAsaas extends Error {
  constructor(
    message: string,
    readonly statusHttp = 502,
    readonly detalhes?: unknown,
  ) {
    super(message);
    this.name = 'ErroAsaas';
  }
}

type HttpFn = typeof fetch;

function juntarUrl(base: string, caminho: string): string {
  const raiz = base.replace(/\/+$/, '');
  const extra = caminho.startsWith('/') ? caminho : `/${caminho}`;
  const url = `${raiz}${extra}`;
  recusarUrlProducao(url);
  return url;
}

function mapearCliente(json: Record<string, unknown>): ClienteGateway {
  return {
    id: String(json.id ?? ''),
    name: String(json.name ?? ''),
    email: json.email ? String(json.email) : null,
    cpfCnpj: json.cpfCnpj ? String(json.cpfCnpj) : null,
    externalReference: json.externalReference ? String(json.externalReference) : null,
  };
}

function mapearAssinatura(json: Record<string, unknown>): AssinaturaGateway {
  const statusBruto = String(json.status ?? 'ACTIVE').toUpperCase();
  const status: AssinaturaGateway['status'] =
    statusBruto === 'INACTIVE' || statusBruto === 'EXPIRED' ? statusBruto : 'ACTIVE';
  return {
    id: String(json.id ?? ''),
    customer: String(json.customer ?? ''),
    value: Number(json.value ?? 0),
    cycle: 'MONTHLY',
    status,
    billingType: String(json.billingType ?? 'BOLETO'),
    nextDueDate: String(json.nextDueDate ?? ''),
    description: json.description ? String(json.description) : null,
    externalReference: json.externalReference ? String(json.externalReference) : null,
  };
}

function objetoDe(valor: unknown): Record<string, unknown> | null {
  if (!valor || typeof valor !== 'object' || Array.isArray(valor)) return null;
  return valor as Record<string, unknown>;
}

export class AsaasPaymentGateway implements PaymentGateway {
  readonly provedor = ASAAS_PROVEDOR;
  readonly ambiente = ASAAS_AMBIENTE;

  constructor(
    private readonly config: ConfiguracaoAsaas,
    private readonly http: HttpFn = fetch,
  ) {
    recusarUrlProducao(config.baseUrl);
    if (config.ambiente !== 'sandbox' || config.provedor !== 'asaas') {
      throw new ErroAsaas('Somente o gateway Asaas sandbox é permitido', 500);
    }
  }

  private async chamar(caminho: string, init: RequestInit = {}): Promise<Record<string, unknown>> {
    recusarUrlProducao(this.config.baseUrl);
    const url = juntarUrl(this.config.baseUrl, caminho);
    recusarUrlProducao(url);
    const res = await this.http(url, {
      ...init,
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        access_token: this.config.apiKey,
        'User-Agent': 'gestao-confeccao-sandbox/0.1.0',
        ...(init.headers ?? {}),
      },
    });
    const texto = await res.text();
    let json: Record<string, unknown> = {};
    if (texto) {
      try {
        json = JSON.parse(texto) as Record<string, unknown>;
      } catch {
        json = { raw: texto };
      }
    }
    if (!res.ok) {
      throw new ErroAsaas(
        `Asaas sandbox ${res.status}: ${typeof json.errors === 'object' ? JSON.stringify(json.errors) : res.statusText}`,
        502,
        json,
      );
    }
    return json;
  }

  async criarOuLocalizarCliente(input: CriarClienteGateway): Promise<ClienteGateway> {
    const busca = await this.chamar(
      `/customers?externalReference=${encodeURIComponent(input.referenciaExterna)}&limit=1`,
    );
    const lista = Array.isArray(busca.data) ? (busca.data as Record<string, unknown>[]) : [];
    const existente = lista[0];
    if (existente?.id) return mapearCliente(existente);

    const criado = await this.chamar('/customers', {
      method: 'POST',
      body: JSON.stringify({
        name: input.nome,
        email: input.email,
        cpfCnpj: input.documento,
        externalReference: input.referenciaExterna,
        notificationDisabled: true,
      }),
    });
    return mapearCliente(criado);
  }

  async criarAssinatura(input: CriarAssinaturaGateway): Promise<AssinaturaGateway> {
    const criado = await this.chamar('/subscriptions', {
      method: 'POST',
      body: JSON.stringify({
        customer: input.customerId,
        billingType: input.billingType,
        value: input.valor,
        nextDueDate: input.proximoVencimento,
        cycle: 'MONTHLY',
        description: input.descricao.slice(0, 500),
        externalReference: input.referenciaExterna,
      }),
    });
    return mapearAssinatura(criado);
  }

  async consultarAssinatura(id: string): Promise<AssinaturaGateway> {
    const json = await this.chamar(`/subscriptions/${encodeURIComponent(id)}`);
    return mapearAssinatura(json);
  }

  async atualizarAssinatura(
    id: string,
    input: { valor?: number; descricao?: string },
  ): Promise<AssinaturaGateway> {
    const corpo: Record<string, unknown> = {};
    if (typeof input.valor === 'number') corpo.value = input.valor;
    if (input.descricao) corpo.description = input.descricao.slice(0, 500);
    const json = await this.chamar(`/subscriptions/${encodeURIComponent(id)}`, {
      method: 'PUT',
      body: JSON.stringify(corpo),
    });
    return mapearAssinatura(json);
  }

  async cancelarAssinatura(id: string): Promise<AssinaturaGateway> {
    const json = await this.chamar(`/subscriptions/${encodeURIComponent(id)}`, {
      method: 'PUT',
      body: JSON.stringify({ status: 'INACTIVE' }),
    });
    return mapearAssinatura(json);
  }

  async reativarAssinatura(id: string, proximoVencimento: string): Promise<AssinaturaGateway> {
    const json = await this.chamar(`/subscriptions/${encodeURIComponent(id)}`, {
      method: 'PUT',
      body: JSON.stringify({ status: 'ACTIVE', nextDueDate: proximoVencimento }),
    });
    return mapearAssinatura(json);
  }

  async criarCheckout(input: {
    customerId: string;
    valor: number;
    descricao: string;
    referenciaExterna: string;
  }): Promise<CheckoutGateway> {
    void input;
    throw new ErroAsaas(
      'Checkout público Asaas ainda não está habilitado; use a assinatura recorrente no sandbox.',
      501,
    );
  }

  interpretarWebhook(corpo: unknown): EventoWebhookGateway {
    const obj = objetoDe(corpo) ?? {};
    return {
      id: String(obj.id ?? ''),
      event: String(obj.event ?? ''),
      dateCreated: obj.dateCreated ? String(obj.dateCreated) : undefined,
      payment: objetoDe(obj.payment),
      subscription: objetoDe(obj.subscription),
      checkout: objetoDe(obj.checkout),
    };
  }
}

export function gatewayAsaasDoAmbiente(
  env: NodeJS.ProcessEnv = process.env,
): AsaasPaymentGateway | null {
  const cfg = lerConfiguracaoAsaas(env);
  if (!cfg) return null;
  return new AsaasPaymentGateway(cfg);
}
