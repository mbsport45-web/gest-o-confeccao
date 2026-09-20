import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createApp } from '../app.js';
import { createDatabase, type AppDatabase } from '../db.js';
import {
  autenticar,
  autenticarNovaEmpresa,
  autenticarPapel,
  type TestApi,
} from '../httpTest.js';
import {
  ConfiguracaoAsaasInvalida,
  ehHostProducaoAsaas,
  lerConfiguracaoAsaas,
  normalizarBaseUrlAsaas,
} from './config.js';
import { AsaasPaymentGateway } from './asaas.js';
import { MockPaymentGateway } from './mock.js';
import { EVENTOS_ASAAS_CONHECIDOS } from './eventos.js';
import { PLANOS_CATALOGO } from '../planos.js';

const DIR = dirname(fileURLToPath(import.meta.url));
const TOKEN = 'whsec_test_asaas_sandbox_token_32ch_ok';
const PRECOS = { basico: 99.9, profissional: 149.9, enterprise: 199.9 } as const;

function appComGateway(db: AppDatabase, gateway: MockPaymentGateway) {
  return createApp(db, { gateway, webhookToken: TOKEN });
}

async function webhook(
  app: ReturnType<typeof createApp>,
  evento: Record<string, unknown>,
  token = TOKEN,
) {
  const req = request(app).post('/api/webhooks/asaas');
  if (token) req.set('asaas-access-token', token);
  return req.send(evento);
}

describe('configuração Asaas somente sandbox', () => {
  it('recusa host de produção e exige a URL do sandbox', () => {
    expect(ehHostProducaoAsaas('api.asaas.com')).toBe(true);
    expect(() => normalizarBaseUrlAsaas('https://api.asaas.com/v3')).toThrow(ConfiguracaoAsaasInvalida);
    expect(() =>
      lerConfiguracaoAsaas({
        ASAAS_BASE_URL: 'https://api.asaas.com/v3',
        ASAAS_API_KEY: 'chave-sandbox-fake',
      }),
    ).toThrow(/produção/);
    expect(normalizarBaseUrlAsaas(undefined)).toBe('https://api-sandbox.asaas.com/v3');
    expect(normalizarBaseUrlAsaas('https://api-sandbox.asaas.com/v3')).toBe(
      'https://api-sandbox.asaas.com/v3',
    );
  });

  it('não aceita API Key como token de webhook', () => {
    expect(() =>
      lerConfiguracaoAsaas({
        ASAAS_BASE_URL: 'https://api-sandbox.asaas.com/v3',
        ASAAS_API_KEY: 'mesma-chave',
        ASAAS_WEBHOOK_TOKEN: 'mesma-chave',
      }),
    ).toThrow(/não pode ser a API Key/);
  });

  it('usa os nomes oficiais de eventos do Asaas', () => {
    expect(EVENTOS_ASAAS_CONHECIDOS).toEqual(expect.arrayContaining([
      'SUBSCRIPTION_CREATED',
      'SUBSCRIPTION_UPDATED',
      'SUBSCRIPTION_INACTIVATED',
      'SUBSCRIPTION_DELETED',
      'PAYMENT_CREATED',
      'PAYMENT_CONFIRMED',
      'PAYMENT_RECEIVED',
      'PAYMENT_OVERDUE',
      'CHECKOUT_PAID',
    ]));
    expect(EVENTOS_ASAAS_CONHECIDOS).not.toContain('INVOICE_PAID');
    expect(EVENTOS_ASAAS_CONHECIDOS).not.toContain('CHARGE_SUCCESS');
  });
});

describe('AsaasPaymentGateway (HTTP mockado, sandbox)', () => {
  it('cria cliente e assinatura só no host sandbox, sem cartão e sem produção', async () => {
    const urls: string[] = [];
    const http: typeof fetch = async (input, init) => {
      const url = String(input);
      urls.push(url);
      expect(url.startsWith('https://api-sandbox.asaas.com/v3')).toBe(true);
      expect(url.includes('api.asaas.com')).toBe(false);
      const body = init?.body ? JSON.parse(String(init.body)) : {};
      expect(body.creditCard).toBeUndefined();
      expect(body.creditCardHolderInfo).toBeUndefined();
      if (url.includes('/customers') && init?.method === 'POST') {
        return new Response(JSON.stringify({ id: 'cus_1', name: body.name, cpfCnpj: body.cpfCnpj }), {
          status: 200,
        });
      }
      if (url.includes('/customers')) {
        return new Response(JSON.stringify({ data: [] }), { status: 200 });
      }
      if (url.includes('/subscriptions') && init?.method === 'POST') {
        expect(body.value).toBe(99.9);
        expect(body.cycle).toBe('MONTHLY');
        expect(body.billingType).toBe('BOLETO');
        return new Response(
          JSON.stringify({
            id: 'sub_1',
            customer: body.customer,
            value: body.value,
            cycle: 'MONTHLY',
            status: 'ACTIVE',
            billingType: body.billingType,
            nextDueDate: body.nextDueDate,
          }),
          { status: 200 },
        );
      }
      return new Response('{}', { status: 404 });
    };

    const gateway = new AsaasPaymentGateway(
      {
        baseUrl: 'https://api-sandbox.asaas.com/v3',
        apiKey: 'chave-sandbox-teste',
        webhookToken: TOKEN,
        provedor: 'asaas',
        ambiente: 'sandbox',
      },
      http,
    );
    const cliente = await gateway.criarOuLocalizarCliente({
      nome: 'Empresa 1',
      email: 'a@b.c',
      documento: '24971563792',
      referenciaExterna: 'empresa:1',
    });
    expect(cliente.id).toBe('cus_1');
    const sub = await gateway.criarAssinatura({
      customerId: cliente.id,
      valor: 99.9,
      descricao: 'Básico',
      referenciaExterna: 'assinatura:1:basico',
      billingType: 'BOLETO',
      proximoVencimento: '2026-09-21',
    });
    expect(sub.id).toBe('sub_1');
    expect(urls.every((u) => u.includes('api-sandbox.asaas.com'))).toBe(true);
    expect(urls.some((u) => u.includes('https://api.asaas.com'))).toBe(false);
  });
});

describe('integração Asaas sandbox (sem cobrança real)', () => {
  let db: AppDatabase;
  let gateway: MockPaymentGateway;
  let api: TestApi;
  let app: ReturnType<typeof createApp>;

  beforeEach(async () => {
    db = createDatabase(':memory:');
    gateway = new MockPaymentGateway();
    app = appComGateway(db, gateway);
    api = await autenticar(app);
  });

  afterEach(() => {
    db.close();
  });

  it('cria cliente e assinatura sandbox com o preço oficial do Básico', async () => {
    const res = await api.post('/api/assinatura/pagamento').send({});
    expect(res.status).toBe(201);
    expect(res.body.sandbox.cobranca_real).toBe(false);
    expect(res.body.sandbox.ambiente).toBe('sandbox');
    expect(res.body.sandbox.valor_mensal).toBe(99.9);
    expect(res.body.asaas_customer_id).toMatch(/^cus_sandbox_/);
    expect(res.body.asaas_subscription_id).toMatch(/^sub_sandbox_/);
    expect(res.body.payment_provider).toBe('asaas');
    expect(res.body.cobranca).toBe('sandbox');
    expect(res.body.comercial.pronta).toBe(true);
    expect(res.body.comercial.cobranca_real).toBe(false);
    const criar = gateway.chamadas.find((c) => c.metodo === 'criarAssinatura');
    expect(criar?.payload).toMatchObject({ valor: 99.9, billingType: 'BOLETO' });
    const tipos = (await api.get('/api/assinatura/eventos')).body.data.map((e: { tipo: string }) => e.tipo);
    expect(tipos).toContain('assinar');
  });

  it('usa os três preços oficiais e ignora valor/empresa_id do cliente', async () => {
    for (const [plano, preco] of Object.entries(PRECOS) as Array<[keyof typeof PRECOS, number]>) {
      const outro = new MockPaymentGateway();
      const banco = createDatabase(':memory:');
      const aplicacao = appComGateway(banco, outro);
      const sessao = await autenticar(aplicacao);
      const res = await sessao.post('/api/assinatura/pagamento').send({
        plano,
        valor: 1,
        preco: 0,
        empresa_id: 999,
        status: 'ativa',
      });
      expect(res.status).toBe(400);
      const ok = await sessao.post('/api/assinatura/pagamento').send({ plano });
      expect(ok.status).toBe(201);
      expect(ok.body.sandbox.valor_mensal).toBe(preco);
      expect(ok.body.plano.preco_mensal).toBe(PLANOS_CATALOGO.find((p) => p.codigo === plano)?.preco_mensal);
      const criar = outro.chamadas.find((c) => c.metodo === 'criarAssinatura');
      expect((criar?.payload as { valor: number }).valor).toBe(preco);
      banco.close();
    }
  });

  it('isola empresas e recusa empresa_id no body', async () => {
    const { api: empresa2, empresaId } = await autenticarNovaEmpresa(app);
    expect(empresaId).not.toBe(1);
    const a = await api.post('/api/assinatura/pagamento').send({ plano: 'profissional' });
    const b = await empresa2.post('/api/assinatura/pagamento').send({ plano: 'enterprise' });
    expect(a.status).toBe(201);
    expect(b.status).toBe(201);
    expect(a.body.asaas_subscription_id).not.toBe(b.body.asaas_subscription_id);
    expect(a.body.asaas_customer_id).not.toBe(b.body.asaas_customer_id);
    expect(a.body.sandbox.valor_mensal).toBe(149.9);
    expect(b.body.sandbox.valor_mensal).toBe(199.9);

    const hijack = await api.post('/api/assinatura/pagamento').send({ empresa_id: empresaId, plano: 'basico' });
    expect(hijack.status).toBe(400);

    const evt = await webhook(app, {
      id: 'evt_pago_empresa1',
      event: 'PAYMENT_CONFIRMED',
      payment: {
        id: 'pay_1',
        subscription: a.body.asaas_subscription_id,
        customer: a.body.asaas_customer_id,
        status: 'CONFIRMED',
      },
    });
    expect(evt.status).toBe(200);
    expect((await api.get('/api/assinatura')).body.status).toBe('ativa');
    expect((await empresa2.get('/api/assinatura')).body.status).toBe('trial');
  });

  it('webhook válido persiste o evento e responde 200', async () => {
    const criado = await api.post('/api/assinatura/pagamento').send({});
    const res = await webhook(app, {
      id: 'evt_created_1',
      event: 'PAYMENT_CREATED',
      payment: {
        id: 'pay_pendente',
        subscription: criado.body.asaas_subscription_id,
        customer: criado.body.asaas_customer_id,
        status: 'PENDING',
      },
    });
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.persistido).toBe(true);
    const row = db
      .prepare('SELECT * FROM eventos_webhook_pagamento WHERE evento_id = ?')
      .get('evt_created_1') as { processado: number; tipo: string; empresa_id: number };
    expect(row.processado).toBe(1);
    expect(row.tipo).toBe('PAYMENT_CREATED');
    expect(row.empresa_id).toBe(1);
    const tipos = (await api.get('/api/assinatura/eventos')).body.data.map((e: { tipo: string }) => e.tipo);
    expect(tipos).toContain('pagamento_pendente');
  });

  it('webhook com token inválido responde 401 e não persiste', async () => {
    const res = await webhook(
      app,
      { id: 'evt_invalido', event: 'PAYMENT_CONFIRMED' },
      'token-errado-nao-e-a-api-key-xxxxx',
    );
    expect(res.status).toBe(401);
    const n = (db.prepare('SELECT COUNT(*) AS n FROM eventos_webhook_pagamento').get() as { n: number }).n;
    expect(n).toBe(0);
  });

  it('webhook duplicado é idempotente', async () => {
    const criado = await api.post('/api/assinatura/pagamento').send({});
    const payload = {
      id: 'evt_dup_1',
      event: 'PAYMENT_CONFIRMED',
      payment: {
        id: 'pay_ok',
        subscription: criado.body.asaas_subscription_id,
        customer: criado.body.asaas_customer_id,
        status: 'CONFIRMED',
      },
    };
    const a = await webhook(app, payload);
    const b = await webhook(app, payload);
    expect(a.status).toBe(200);
    expect(b.status).toBe(200);
    expect(b.body.duplicado).toBe(true);
    const n = (
      db.prepare('SELECT COUNT(*) AS n FROM eventos_webhook_pagamento WHERE evento_id = ?').get('evt_dup_1') as {
        n: number;
      }
    ).n;
    expect(n).toBe(1);
    const confirmados = (await api.get('/api/assinatura/eventos')).body.data.filter(
      (e: { tipo: string }) => e.tipo === 'pagamento_confirmado',
    );
    expect(confirmados).toHaveLength(1);
  });

  it('pagamento confirmado ativa a assinatura e registra histórico', async () => {
    const criado = await api.post('/api/assinatura/pagamento').send({ plano: 'profissional' });
    expect((await api.get('/api/assinatura')).body.status).toBe('trial');
    const res = await webhook(app, {
      id: 'evt_conf_1',
      event: 'PAYMENT_RECEIVED',
      payment: {
        id: 'pay_rec',
        subscription: criado.body.asaas_subscription_id,
        customer: criado.body.asaas_customer_id,
        status: 'RECEIVED',
      },
    });
    expect(res.status).toBe(200);
    const assinatura = await api.get('/api/assinatura');
    expect(assinatura.body.status).toBe('ativa');
    const evento = (await api.get('/api/assinatura/eventos')).body.data.find(
      (e: { tipo: string }) => e.tipo === 'pagamento_confirmado',
    );
    expect(evento).toMatchObject({
      tipo: 'pagamento_confirmado',
      de_status: 'trial',
      para_status: 'ativa',
      para_plano: 'profissional',
      valor_mensal: 149.9,
      gateway: 'asaas',
      referencia_externa: 'pay_rec',
      empresa_id: 1,
    });
  });

  it('pagamento vencido marca past_due', async () => {
    const criado = await api.post('/api/assinatura/pagamento').send({});
    await webhook(app, {
      id: 'evt_ativa',
      event: 'PAYMENT_CONFIRMED',
      payment: {
        id: 'pay_a',
        subscription: criado.body.asaas_subscription_id,
        customer: criado.body.asaas_customer_id,
        status: 'CONFIRMED',
      },
    });
    expect((await api.get('/api/assinatura')).body.status).toBe('ativa');
    const res = await webhook(app, {
      id: 'evt_overdue',
      event: 'PAYMENT_OVERDUE',
      payment: {
        id: 'pay_v',
        subscription: criado.body.asaas_subscription_id,
        customer: criado.body.asaas_customer_id,
        status: 'OVERDUE',
      },
    });
    expect(res.status).toBe(200);
    expect((await api.get('/api/assinatura')).body.status).toBe('past_due');
    const tipos = (await api.get('/api/assinatura/eventos')).body.data.map((e: { tipo: string }) => e.tipo);
    expect(tipos).toContain('pagamento_vencido');
    expect(tipos).toContain('marcar_atraso');
  });

  it('cancelamento no gateway inativa a assinatura local', async () => {
    const criado = await api.post('/api/assinatura/pagamento').send({});
    await webhook(app, {
      id: 'evt_del',
      event: 'SUBSCRIPTION_DELETED',
      subscription: {
        id: criado.body.asaas_subscription_id,
        customer: criado.body.asaas_customer_id,
        status: 'INACTIVE',
        externalReference: 'assinatura:1:basico',
      },
    });
    expect((await api.get('/api/assinatura')).body.status).toBe('cancelada');
    const tipos = (await api.get('/api/assinatura/eventos')).body.data.map((e: { tipo: string }) => e.tipo);
    expect(tipos).toContain('cancelar');
  });

  it('mudança de plano atualiza o valor no gateway com o preço do catálogo', async () => {
    await api.post('/api/assinatura/pagamento').send({ plano: 'basico' });
    const upgrade = await api.patch('/api/assinatura').send({ plano: 'enterprise' });
    expect(upgrade.status).toBe(200);
    expect(upgrade.body.plano.preco_mensal).toBe(199.9);
    const atualizar = gateway.chamadas.filter((c) => c.metodo === 'atualizarAssinatura');
    expect(atualizar.some((c) => (c.payload as { valor?: number }).valor === 199.9)).toBe(true);
    const evento = (await api.get('/api/assinatura/eventos')).body.data.find(
      (e: { tipo: string }) => e.tipo === 'upgrade',
    );
    expect(evento).toMatchObject({
      de_plano: 'basico',
      para_plano: 'enterprise',
      valor_mensal: 199.9,
      empresa_id: 1,
    });
  });

  it('usuário sem permissão não contrata cobrança', async () => {
    const vendas = await autenticarPapel(app, api, 'vendas');
    const res = await vendas.post('/api/assinatura/pagamento').send({ plano: 'profissional' });
    expect(res.status).toBe(403);
    expect(res.body.modulo).toBe('assinatura');
    expect(gateway.chamadas).toHaveLength(0);
    expect((await api.get('/api/assinatura')).body.asaas_subscription_id).toBeNull();
  });

  it('não expõe segredos e não faz cobrança real', async () => {
    process.env.ASAAS_API_KEY = '$aact_prod_nao_deve_aparecer';
    const res = await api.post('/api/assinatura/pagamento').send({});
    expect(res.status).toBe(201);
    const texto = JSON.stringify(res.body);
    expect(texto).not.toContain('$aact_');
    expect(texto).not.toContain(TOKEN);
    expect(texto).not.toContain('ASAAS_API_KEY');
    expect(res.body.sandbox.cobranca_real).toBe(false);
    expect(gateway.ambiente).toBe('sandbox');
    expect(gateway.chamadas.some((c) => JSON.stringify(c).includes('creditCard'))).toBe(false);

    const exemplo = readFileSync(join(DIR, '../../../.env.example'), 'utf8');
    expect(exemplo).toContain('ASAAS_BASE_URL=https://api-sandbox.asaas.com/v3');
    expect(exemplo).toContain('ASAAS_API_KEY=');
    expect(exemplo).toContain('ASAAS_WEBHOOK_TOKEN=');
    expect(exemplo).not.toMatch(/\$aact_/);
    expect(exemplo).not.toMatch(/api\.asaas\.com\/v3/);

    const fontes = [
      readFileSync(join(DIR, 'asaas.ts'), 'utf8'),
      readFileSync(join(DIR, 'config.ts'), 'utf8'),
      readFileSync(join(DIR, 'webhooks.ts'), 'utf8'),
    ].join('\n');
    expect(fontes).not.toMatch(/\$aact_/);
    expect(fontes).toContain('api-sandbox.asaas.com');
    delete process.env.ASAAS_API_KEY;
  });

  it('CHECKOUT_PAID e recusa de cartão geram histórico sem armazenar cartão', async () => {
    const criado = await api.post('/api/assinatura/pagamento').send({});
    await webhook(app, {
      id: 'evt_checkout',
      event: 'CHECKOUT_PAID',
      checkout: {
        id: 'chk_1',
        customer: criado.body.asaas_customer_id,
        creditCard: { number: '4111111111111111', ccv: '123' },
      },
      payment: {
        id: 'pay_chk',
        subscription: criado.body.asaas_subscription_id,
        customer: criado.body.asaas_customer_id,
      },
    });
    const payload = db
      .prepare('SELECT payload_json FROM eventos_webhook_pagamento WHERE evento_id = ?')
      .get('evt_checkout') as { payload_json: string };
    expect(payload.payload_json).not.toContain('4111111111111111');
    expect(payload.payload_json).not.toContain('"ccv"');
    expect((await api.get('/api/assinatura')).body.status).toBe('ativa');

    await webhook(app, {
      id: 'evt_negado',
      event: 'PAYMENT_CREDIT_CARD_CAPTURE_REFUSED',
      payment: {
        id: 'pay_n',
        subscription: criado.body.asaas_subscription_id,
        customer: criado.body.asaas_customer_id,
        status: 'FAILED',
      },
    });
    const tipos = (await api.get('/api/assinatura/eventos')).body.data.map((e: { tipo: string }) => e.tipo);
    expect(tipos).toContain('pagamento_negado');
  });
});
