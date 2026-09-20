import express, { type Express } from 'express';
import cors from 'cors';
import { createOrdensRouter } from './ordens.js';
import { createClientesRouter } from './clientes.js';
import { createProdutosRouter } from './produtos.js';
import { createMateriasPrimasRouter } from './materiasPrimas.js';
import { createEstoqueRouter } from './estoque.js';
import type { AppDatabase } from './db.js';

export function createApp(db: AppDatabase): Express {
  const app = express();

  app.use(cors());
  // 2mb: imagens de produto podem ir como data URL no cadastro.
  app.use(express.json({ limit: '2mb' }));

  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok', servico: 'gestao-confeccao-api' });
  });

  app.use('/api/clientes', createClientesRouter(db));
  app.use('/api/produtos', createProdutosRouter(db));
  app.use('/api/materias-primas', createMateriasPrimasRouter(db));
  app.use('/api/estoque', createEstoqueRouter(db));
  app.use('/api/ordens', createOrdensRouter(db));

  return app;
}
