import express, { type Express } from 'express';
import cors from 'cors';
import { createOrdensRouter } from './ordens.js';
import type { AppDatabase } from './db.js';

export function createApp(db: AppDatabase): Express {
  const app = express();

  app.use(cors());
  app.use(express.json());

  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok', servico: 'gestao-confeccao-api' });
  });

  app.use('/api/ordens', createOrdensRouter(db));

  return app;
}
