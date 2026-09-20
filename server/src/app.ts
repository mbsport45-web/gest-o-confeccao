import express, { type Express } from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import { createOrdensRouter } from './ordens.js';
import { createClientesRouter } from './clientes.js';
import { createProdutosRouter } from './produtos.js';
import { createMateriasPrimasRouter } from './materiasPrimas.js';
import { createEstoqueRouter } from './estoque.js';
import { createEtapasRouter } from './etapas.js';
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

export function createApp(db: AppDatabase): Express {
  const app = express();

  app.use(cors({ origin: true, credentials: true }));
  // 2mb: imagens de produto podem ir como data URL no cadastro.
  app.use(express.json({ limit: '2mb' }));
  app.use(cookieParser());

  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok', servico: 'gestao-confeccao-api' });
  });

  app.use('/api/auth', createAuthRouter(db));
  app.get('/api/me', requireAuth(db), handleMe(db));
  app.use('/api', requireAuth(db));
  app.use('/api', exigirPermissaoModulo());
  app.use('/api', exigirAssinaturaOperacional(db));

  app.use('/api/membros', createMembrosRouter(db));
  app.use('/api/convites', createConvitesRouter(db));
  app.use('/api/planos', createPlanosRouter(db));
  app.use('/api/assinatura', createAssinaturaRouter(db));
  app.use('/api/clientes', createClientesRouter(db));
  app.use('/api/produtos', createProdutosRouter(db));
  app.use('/api/materias-primas', createMateriasPrimasRouter(db));
  app.use('/api/estoque', createEstoqueRouter(db));
  app.use('/api/pedidos', createPedidosRouter(db));
  app.use('/api/expedicao', createExpedicaoRouter(db));
  app.use('/api/ordens', createOrdensRouter(db));
  app.use('/api/etapas', createEtapasRouter(db));
  app.use('/api/fornecedores', createFornecedoresRouter(db));
  app.use('/api/compras', createComprasRouter(db));
  app.use('/api/financeiro', createFinanceiroRouter(db));
  app.use('/api/relatorios', createRelatoriosRouter(db));

  return app;
}
