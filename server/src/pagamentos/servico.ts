import type { AppDatabase } from '../db.js';
import {
  aplicarAcaoAssinatura,
  classificarMudancaPlano,
  COBRANCA_SANDBOX,
  garantirAssinatura,
  isCodigoPlano,
  isStatusAssinatura,
  listarEventosAssinatura,
  obterAssinaturaDaEmpresa,
  PLANO_PADRAO,
  planoDoCatalogo,
  registrarEventoAssinatura,
  sincronizarAssinatura,
  type AcaoAssinatura,
  type AtorAssinatura,
  type CodigoPlano,
  type TipoEventoAssinatura,
} from '../planos.js';
import { ASAAS_PROVEDOR } from './config.js';
import { cpfSandboxDaEmpresa, empresaIdDaReferencia, referenciaAssinaturaEmpresa, referenciaClienteEmpresa } from './cpf.js';
import {
  isEventoNegado,
  isEventoPago,
  isEventoPagamentoCancelado,
  isEventoPendente,
  isEventoVencido,
} from './eventos.js';
import type { EventoWebhookGateway, FormaCobrancaSandbox, PaymentGateway } from './tipos.js';

export const CODIGO_GATEWAY_INDISPONIVEL = 'gateway_indisponivel' as const;
export const CODIGO_GATEWAY_ERRO = 'gateway_erro' as const;

export const ESTADOS_CHECKOUT = [
  'nenhum',
  'pendente',
  'confirmado',
  'falhou',
  'cancelada',
] as const;
export type EstadoCheckout = (typeof ESTADOS_CHECKOUT)[number];

export const MSG_CHECKOUT = {
  pendente: 'Pagamento aguardando confirmação.',
  confirmado: 'Pagamento confirmado. Sua assinatura está ativa.',
  falhou: 'Não foi possível confirmar o pagamento. Tente novamente ou escolha outro meio.',
  cancelada: 'Assinatura cancelada.',
  nenhum: 'Nenhum pagamento sandbox em andamento.',
} as const;

export function montarCheckout(estado: EstadoCheckout, extras: Record<string, unknown> = {}) {
  return {
    confirmado: estado === 'confirmado',
    estado,
    mensagem: MSG_CHECKOUT[estado],
    ambiente: 'sandbox' as const,
    cobranca_real: false as const,
    meios: ['PIX', 'BOLETO'] as const,
    ...extras,
  };
}

export function obterEstadoCheckout(db: AppDatabase, empresaId: number): EstadoCheckout {
  const assinatura = obterAssinaturaDaEmpresa(db, empresaId);
  const eventos = listarEventosAssinatura(db, empresaId);
  const ultimoPagamento = eventos.find((evento) => String(evento.tipo).startsWith('pagamento_'));
  if (assinatura.status === 'cancelada') return 'cancelada';
  if (ultimoPagamento?.tipo === 'pagamento_negado' && assinatura.status !== 'ativa') return 'falhou';
  if (assinatura.status === 'ativa') return 'confirmado';
  if (
    assinatura.asaas_subscription_id &&
    (assinatura.status === 'trial' || assinatura.status === 'past_due')
  ) {
    return 'pendente';
  }
  return 'nenhum';
}

export function obterCheckoutDaEmpresa(db: AppDatabase, empresaId: number) {
  const assinatura = obterAssinaturaDaEmpresa(db, empresaId);
  const estado = obterEstadoCheckout(db, empresaId);
  return {
    ...montarCheckout(estado, {
      plano: assinatura.plano.codigo,
      valor_mensal: assinatura.plano.preco_mensal,
    }),
    assinatura,
  };
}

export type LinhaPagamentoAssinatura = {
  empresa_id: number;
  status: string;
  codigo: string;
  asaas_customer_id: string | null;
  asaas_subscription_id: string | null;
  payment_provider: string | null;
  payment_provider_status: string | null;
  gateway: string | null;
  gateway_assinatura_id: string | null;
};

const LINHA_SELECT = `
  SELECT a.empresa_id, a.status, p.codigo,
         a.asaas_customer_id, a.asaas_subscription_id,
         a.payment_provider, a.payment_provider_status,
         a.gateway, a.gateway_assinatura_id
    FROM assinaturas a
    JOIN planos p ON p.id = a.plano_id
`;

export function obterLinhaPagamento(db: AppDatabase, empresaId: number): LinhaPagamentoAssinatura | undefined {
  garantirAssinatura(db, empresaId);
  return db.prepare(`${LINHA_SELECT} WHERE a.empresa_id = ?`).get(empresaId) as LinhaPagamentoAssinatura | undefined;
}

export function salvarVinculoAsaas(
  db: AppDatabase,
  empresaId: number,
  campos: {
    asaas_customer_id?: string | null;
    asaas_subscription_id?: string | null;
    payment_provider_status?: string | null;
  },
) {
  const atual = obterLinhaPagamento(db, empresaId);
  const customer = campos.asaas_customer_id ?? atual?.asaas_customer_id ?? null;
  const subscription = campos.asaas_subscription_id ?? atual?.asaas_subscription_id ?? null;
  const status = campos.payment_provider_status ?? atual?.payment_provider_status ?? null;
  db.prepare(
    `UPDATE assinaturas
        SET asaas_customer_id = ?,
            asaas_subscription_id = ?,
            payment_provider = ?,
            payment_provider_status = ?,
            gateway = ?,
            gateway_assinatura_id = ?,
            cobranca = ?,
            atualizado_em = datetime('now')
      WHERE empresa_id = ?`,
  ).run(
    customer,
    subscription,
    ASAAS_PROVEDOR,
    status,
    ASAAS_PROVEDOR,
    subscription,
    COBRANCA_SANDBOX,
    empresaId,
  );
}

function hojeISO(): string {
  return new Date().toISOString().slice(0, 10);
}

function empresaDaSessaoLocal(
  db: AppDatabase,
  empresaId: number,
): { nome: string; email: string } {
  const row = db
    .prepare(
      `SELECT e.nome AS empresa_nome, u.email, u.nome AS usuario_nome
         FROM empresas e
         LEFT JOIN usuarios u ON u.empresa_id = e.id AND u.papel = 'proprietario' AND u.status = 'ativo'
        WHERE e.id = ?
        ORDER BY u.id
        LIMIT 1`,
    )
    .get(empresaId) as { empresa_nome: string; email: string | null; usuario_nome: string | null } | undefined;
  return {
    nome: row?.empresa_nome || `Empresa ${empresaId}`,
    email: row?.email || `empresa-${empresaId}@sandbox.local`,
  };
}

function registrar(
  db: AppDatabase,
  empresaId: number,
  tipo: TipoEventoAssinatura,
  opts: {
    de_plano: string | null;
    para_plano: string | null;
    de_status: string | null;
    para_status: string | null;
    valor_mensal: number | null;
    ator?: AtorAssinatura;
    referencia_externa?: string | null;
  },
) {
  registrarEventoAssinatura(db, empresaId, {
    tipo,
    de_plano: opts.de_plano,
    para_plano: opts.para_plano,
    de_status: opts.de_status,
    para_status: opts.para_status,
    valor_mensal: opts.valor_mensal,
    ator: opts.ator ?? null,
    gateway: ASAAS_PROVEDOR,
    cobranca: COBRANCA_SANDBOX,
    referencia_externa: opts.referencia_externa ?? null,
  });
}

export async function contratarAssinaturaSandbox(
  db: AppDatabase,
  gateway: PaymentGateway,
  empresaId: number,
  opts: {
    plano?: CodigoPlano;
    billingType?: FormaCobrancaSandbox;
    ator?: AtorAssinatura;
  },
) {
  sincronizarAssinatura(db, empresaId, opts.ator ?? null);
  const linha = obterLinhaPagamento(db, empresaId);
  if (!linha) throw new Error('assinatura não encontrada');

  const planoAtual = isCodigoPlano(linha.codigo) ? linha.codigo : PLANO_PADRAO;
  const planoDestino = opts.plano ?? planoAtual;
  const catalogo = planoDoCatalogo(planoDestino);
  const valor = catalogo.preco_mensal;
  const billingType: FormaCobrancaSandbox = opts.billingType ?? 'BOLETO';
  const empresa = empresaDaSessaoLocal(db, empresaId);

  if (opts.plano && opts.plano !== planoAtual) {
    const planoRow = db
      .prepare('SELECT id FROM planos WHERE codigo = ? AND ativo = 1')
      .get(opts.plano) as { id: number } | undefined;
    if (!planoRow) {
      return { ok: false as const, statusHttp: 404, corpo: { erro: 'Plano não encontrado' } };
    }
    db.prepare(
      `UPDATE assinaturas SET plano_id = ?, atualizado_em = datetime('now') WHERE empresa_id = ?`,
    ).run(planoRow.id, empresaId);
    const tipo = classificarMudancaPlano(planoAtual, opts.plano);
    if (tipo !== 'manter') {
      registrar(db, empresaId, tipo, {
        de_plano: planoAtual,
        para_plano: opts.plano,
        de_status: linha.status,
        para_status: linha.status,
        valor_mensal: valor,
        ator: opts.ator,
      });
    }
  }

  const cliente = await gateway.criarOuLocalizarCliente({
    nome: empresa.nome,
    email: empresa.email,
    documento: cpfSandboxDaEmpresa(empresaId),
    referenciaExterna: referenciaClienteEmpresa(empresaId),
  });
  salvarVinculoAsaas(db, empresaId, {
    asaas_customer_id: cliente.id,
    payment_provider_status: 'CUSTOMER_READY',
  });

  const atualizada = obterLinhaPagamento(db, empresaId);
  if (atualizada?.asaas_subscription_id) {
    const sub = await gateway.atualizarAssinatura(atualizada.asaas_subscription_id, {
      valor,
      descricao: `Plano ${catalogo.nome} (sandbox)`,
    });
    salvarVinculoAsaas(db, empresaId, {
      asaas_customer_id: cliente.id,
      asaas_subscription_id: sub.id,
      payment_provider_status: sub.status,
    });
    return { ok: true as const, cliente, assinatura: sub, valor, plano: planoDestino };
  }

  const assinatura = await gateway.criarAssinatura({
    customerId: cliente.id,
    valor,
    descricao: `Plano ${catalogo.nome} (sandbox)`,
    referenciaExterna: referenciaAssinaturaEmpresa(empresaId, planoDestino),
    billingType,
    proximoVencimento: hojeISO(),
  });
  salvarVinculoAsaas(db, empresaId, {
    asaas_customer_id: cliente.id,
    asaas_subscription_id: assinatura.id,
    payment_provider_status: assinatura.status,
  });
  registrar(db, empresaId, 'assinar', {
    de_plano: planoDestino,
    para_plano: planoDestino,
    de_status: linha.status,
    para_status: linha.status,
    valor_mensal: valor,
    ator: opts.ator,
    referencia_externa: assinatura.id,
  });
  return { ok: true as const, cliente, assinatura, valor, plano: planoDestino };
}

export async function sincronizarCancelamentoGateway(
  db: AppDatabase,
  gateway: PaymentGateway | null,
  empresaId: number,
) {
  if (!gateway) return;
  const linha = obterLinhaPagamento(db, empresaId);
  if (!linha?.asaas_subscription_id) return;
  const sub = await gateway.cancelarAssinatura(linha.asaas_subscription_id);
  salvarVinculoAsaas(db, empresaId, { payment_provider_status: sub.status });
}

export async function sincronizarReativacaoGateway(
  db: AppDatabase,
  gateway: PaymentGateway | null,
  empresaId: number,
) {
  if (!gateway) return;
  const linha = obterLinhaPagamento(db, empresaId);
  if (!linha?.asaas_subscription_id) return;
  const sub = await gateway.reativarAssinatura(linha.asaas_subscription_id, hojeISO());
  salvarVinculoAsaas(db, empresaId, { payment_provider_status: sub.status });
}

export async function sincronizarTrocaPlanoGateway(
  db: AppDatabase,
  gateway: PaymentGateway | null,
  empresaId: number,
  planoDestino: CodigoPlano,
) {
  if (!gateway) return;
  const linha = obterLinhaPagamento(db, empresaId);
  if (!linha?.asaas_subscription_id) return;
  const catalogo = planoDoCatalogo(planoDestino);
  const sub = await gateway.atualizarAssinatura(linha.asaas_subscription_id, {
    valor: catalogo.preco_mensal,
    descricao: `Plano ${catalogo.nome} (sandbox)`,
  });
  salvarVinculoAsaas(db, empresaId, { payment_provider_status: sub.status });
}

function texto(valor: unknown): string | null {
  if (typeof valor === 'string' && valor.trim()) return valor.trim();
  if (typeof valor === 'number') return String(valor);
  return null;
}

export function localizarEmpresaDoEvento(
  db: AppDatabase,
  evento: EventoWebhookGateway,
): number | null {
  const subId =
    texto(evento.subscription?.id) ||
    texto(evento.payment?.subscription) ||
    texto(evento.checkout?.subscription);
  if (subId) {
    const porSub = db
      .prepare('SELECT empresa_id FROM assinaturas WHERE asaas_subscription_id = ?')
      .get(subId) as { empresa_id: number } | undefined;
    if (porSub) return porSub.empresa_id;
  }
  const customerId =
    texto(evento.subscription?.customer) ||
    texto(evento.payment?.customer) ||
    texto(evento.checkout?.customer);
  if (customerId) {
    const porCli = db
      .prepare('SELECT empresa_id FROM assinaturas WHERE asaas_customer_id = ?')
      .get(customerId) as { empresa_id: number } | undefined;
    if (porCli) return porCli.empresa_id;
  }
  const refs = [
    texto(evento.subscription?.externalReference),
    texto(evento.payment?.externalReference),
    texto(evento.checkout?.externalReference),
  ];
  for (const ref of refs) {
    const empresaId = empresaIdDaReferencia(ref);
    if (!empresaId) continue;
    const existe = db.prepare('SELECT id FROM empresas WHERE id = ?').get(empresaId);
    if (existe) return empresaId;
  }
  return null;
}

function aplicarSePossivel(
  db: AppDatabase,
  empresaId: number,
  acao: AcaoAssinatura,
  ator: AtorAssinatura,
) {
  const resultado = aplicarAcaoAssinatura(db, empresaId, acao, ator);
  return resultado.ok;
}

function confirmarPagamento(db: AppDatabase, empresaId: number) {
  const linha = obterLinhaPagamento(db, empresaId);
  if (!linha) return;
  const status = isStatusAssinatura(linha.status) ? linha.status : 'trial';
  if (status === 'trial') aplicarSePossivel(db, empresaId, 'ativar', null);
  else if (status === 'past_due') aplicarSePossivel(db, empresaId, 'regularizar', null);
  else if (status === 'expirada') aplicarSePossivel(db, empresaId, 'renovar', null);
  else if (status === 'cancelada') aplicarSePossivel(db, empresaId, 'reativar', null);
}

function marcarVencido(db: AppDatabase, empresaId: number) {
  const linha = obterLinhaPagamento(db, empresaId);
  if (!linha) return;
  const status = isStatusAssinatura(linha.status) ? linha.status : 'trial';
  if (status === 'ativa') aplicarSePossivel(db, empresaId, 'marcar_atraso', null);
}

function cancelarPorGateway(db: AppDatabase, empresaId: number) {
  const linha = obterLinhaPagamento(db, empresaId);
  if (!linha) return;
  const status = isStatusAssinatura(linha.status) ? linha.status : 'trial';
  if (status === 'trial' || status === 'ativa' || status === 'past_due') {
    aplicarSePossivel(db, empresaId, 'cancelar', null);
  }
}

export function processarEventoGateway(db: AppDatabase, empresaId: number, evento: EventoWebhookGateway) {
  sincronizarAssinatura(db, empresaId);
  const linha = obterLinhaPagamento(db, empresaId);
  if (!linha) return;
  const plano = isCodigoPlano(linha.codigo) ? linha.codigo : PLANO_PADRAO;
  const valor = planoDoCatalogo(plano).preco_mensal;
  const statusAtual = linha.status;
  const referencia =
    texto(evento.payment?.id) ||
    texto(evento.subscription?.id) ||
    texto(evento.checkout?.id) ||
    evento.id;

  if (evento.subscription?.id) {
    salvarVinculoAsaas(db, empresaId, {
      asaas_subscription_id: String(evento.subscription.id),
      asaas_customer_id: texto(evento.subscription.customer) ?? undefined,
      payment_provider_status: texto(evento.subscription.status),
    });
  } else if (evento.payment?.subscription) {
    salvarVinculoAsaas(db, empresaId, {
      asaas_subscription_id: String(evento.payment.subscription),
      asaas_customer_id: texto(evento.payment.customer) ?? undefined,
      payment_provider_status: texto(evento.payment.status),
    });
  } else if (evento.payment?.status) {
    salvarVinculoAsaas(db, empresaId, { payment_provider_status: String(evento.payment.status) });
  }

  const depois = obterLinhaPagamento(db, empresaId);
  const statusDepoisBase = depois?.status ?? statusAtual;

  if (evento.event === 'SUBSCRIPTION_CREATED') {
    return;
  }

  if (evento.event === 'SUBSCRIPTION_UPDATED') {
    if (texto(evento.subscription?.status) === 'INACTIVE') {
      cancelarPorGateway(db, empresaId);
    }
    return;
  }

  if (evento.event === 'SUBSCRIPTION_INACTIVATED' || evento.event === 'SUBSCRIPTION_DELETED') {
    cancelarPorGateway(db, empresaId);
    return;
  }

  if (isEventoPago(evento.event)) {
    confirmarPagamento(db, empresaId);
    const final = obterLinhaPagamento(db, empresaId);
    registrar(db, empresaId, 'pagamento_confirmado', {
      de_plano: plano,
      para_plano: plano,
      de_status: statusAtual,
      para_status: final?.status ?? statusAtual,
      valor_mensal: valor,
      referencia_externa: referencia,
    });
    return;
  }

  if (isEventoPendente(evento.event)) {
    registrar(db, empresaId, 'pagamento_pendente', {
      de_plano: plano,
      para_plano: plano,
      de_status: statusAtual,
      para_status: statusDepoisBase,
      valor_mensal: valor,
      referencia_externa: referencia,
    });
    return;
  }

  if (isEventoVencido(evento.event)) {
    marcarVencido(db, empresaId);
    const final = obterLinhaPagamento(db, empresaId);
    registrar(db, empresaId, 'pagamento_vencido', {
      de_plano: plano,
      para_plano: plano,
      de_status: statusAtual,
      para_status: final?.status ?? statusAtual,
      valor_mensal: valor,
      referencia_externa: referencia,
    });
    return;
  }

  if (isEventoNegado(evento.event)) {
    registrar(db, empresaId, 'pagamento_negado', {
      de_plano: plano,
      para_plano: plano,
      de_status: statusAtual,
      para_status: statusDepoisBase,
      valor_mensal: valor,
      referencia_externa: referencia,
    });
    return;
  }

  if (isEventoPagamentoCancelado(evento.event)) {
    registrar(db, empresaId, 'pagamento_cancelado', {
      de_plano: plano,
      para_plano: plano,
      de_status: statusAtual,
      para_status: statusDepoisBase,
      valor_mensal: valor,
      referencia_externa: referencia,
    });
  }
}

const CAMPOS_SENSIVEIS = new Set([
  'creditCard',
  'creditCardHolderInfo',
  'creditCardNumber',
  'ccv',
  'cvv',
  'expiryMonth',
  'expiryYear',
  'holderName',
  'remoteIp',
]);

export function sanitizarPayloadWebhook(valor: unknown): unknown {
  if (Array.isArray(valor)) return valor.map(sanitizarPayloadWebhook);
  if (!valor || typeof valor !== 'object') return valor;
  const saida: Record<string, unknown> = {};
  for (const [chave, item] of Object.entries(valor as Record<string, unknown>)) {
    if (CAMPOS_SENSIVEIS.has(chave)) continue;
    saida[chave] = sanitizarPayloadWebhook(item);
  }
  return saida;
}
