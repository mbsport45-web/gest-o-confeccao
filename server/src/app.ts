import express, { type Express } from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import { createOrdensRouter } from './ordens.js';
import { createClientesRouter } from './clientes.js';
import { createProdutosRouter } from './produtos.js';
import { createMateriasPrimasRouter } from './materiasPrimas.js';
import { createTecidosRouter } from './tecidos.js';
import { createEstoqueRouter } from './estoque.js';
import { createEtapasRouter } from './etapas.js';
import { createEnfestoRouter } from './enfesto.js';
import { createFornecedoresRouter } from './fornecedores.js';
import { createComprasRouter } from './compras.js';
import { createFinanceiroRouter } from './financeiro.js';
import { createRelatoriosRouter } from './relatorios.js';
import { createPedidosRouter } from './pedidos.js';
import { createExpedicaoRouter } from './expedicao.js';
import { createAuthRouter, handleMe, requireAuth } from './auth.js';
import { createConvitesRouter, createMembrosRouter } from './equipe.js';
import { createAssinaturaRouter, createPlanosRouter, exigirAssinaturaOperacional } from './planos.js';
import { exigirPermissaoModulo } from './papeis.js';
import type { AppDatabase } from './db.js';
import { gatewayAsaasDoAmbiente } from './pagamentos/asaas.js';
import { statusConfiguracaoAsaas } from './pagamentos/config.js';
import { createPagamentoAssinaturaRouter } from './pagamentos/rotas.js';
import {
  sincronizarCancelamentoGateway,
  sincronizarReativacaoGateway,
  sincronizarTrocaPlanoGateway,
} from './pagamentos/servico.js';
import type { PaymentGateway } from './pagamentos/tipos.js';
import { createAsaasWebhookHandler } from './pagamentos/webhooks.js';

export type AppOpcoes = {
  gateway?: PaymentGateway | null;
  webhookToken?: string;
};

export function createApp(db: AppDatabase, opcoes: AppOpcoes = {}): Express {
  const app = express();
  const gateway = opcoes.gateway === undefined
    ? process.env.VITEST
      ? null
      : gatewayAsaasDoAmbiente()
    : opcoes.gateway;
  const webhookToken =
    opcoes.webhookToken ?? (process.env.VITEST ? '' : process.env.ASAAS_WEBHOOK_TOKEN ?? '');

  app.use(cors({ origin: true, credentials: true }));
  // PDFs de nota e pedido seguem em base64; imagens de produto também passam por JSON.
  app.use(express.json({ limit: '12mb' }));
  app.use(cookieParser());

  app.get('/api/health', (_req, res) => {
    const asaas = statusConfiguracaoAsaas();
    res.json({
      status: 'ok',
      servico: 'gestao-confeccao-api',
      asaas: {
        ambiente: asaas.ambiente,
        cobranca_real: asaas.cobranca_real,
        configurado: asaas.configurado,
        host: asaas.host,
        base_url: asaas.base_url,
        api_key_configurada: asaas.api_key_configurada,
        origem_api_key: asaas.origem_api_key,
        origem_base_url: asaas.origem_base_url,
      },
    });
  });

  app.post('/api/webhooks/asaas', createAsaasWebhookHandler(db, { token: webhookToken, gateway }));

  app.use('/api/auth', createAuthRouter(db));
  app.get('/api/me', requireAuth(db), handleMe(db));
  app.use('/api', requireAuth(db));
  app.use('/api', exigirPermissaoModulo());
  app.use('/api', exigirAssinaturaOperacional(db));

  app.use('/api/membros', createMembrosRouter(db));
  app.use('/api/convites', createConvitesRouter(db));
  app.use('/api/planos', createPlanosRouter(db));
  app.use(
    '/api/assinatura',
    createAssinaturaRouter(db, {
      antesDeAcao: async (empresaId, acao) => {
        if (acao === 'cancelar') await sincronizarCancelamentoGateway(db, gateway, empresaId);
        if (acao === 'reativar') await sincronizarReativacaoGateway(db, gateway, empresaId);
      },
      antesDeTrocarPlano: async (empresaId, plano) => {
        await sincronizarTrocaPlanoGateway(db, gateway, empresaId, plano);
      },
    }),
  );
  app.use('/api/assinatura', createPagamentoAssinaturaRouter(db, gateway));
  app.use('/api/clientes', createClientesRouter(db));
  app.use('/api/produtos', createProdutosRouter(db));
  app.use('/api/materias-primas', createMateriasPrimasRouter(db));
  app.use('/api/tecidos', createTecidosRouter(db));
  app.use('/api/estoque', createEstoqueRouter(db));
  app.use('/api/pedidos', createPedidosRouter(db));
  app.use('/api/expedicao', createExpedicaoRouter(db));
  app.use('/api/ordens', createOrdensRouter(db));
  app.use('/api/enfesto', createEnfestoRouter(db));
  app.use('/api/etapas', createEtapasRouter(db));
  app.use('/api/fornecedores', createFornecedoresRouter(db));
  app.use('/api/compras', createComprasRouter(db));
  app.use('/api/financeiro', createFinanceiroRouter(db));
  app.use('/api/relatorios', createRelatoriosRouter(db));

  return app;
}
