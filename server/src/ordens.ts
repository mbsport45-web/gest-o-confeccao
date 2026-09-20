import { Router } from 'express';
import { z } from 'zod';
import type { AppDatabase } from './db.js';

export const STATUS_VALIDOS = [
  'pendente',
  'em_producao',
  'concluida',
  'cancelada',
] as const;

const criarOrdemSchema = z.object({
  cliente: z.string().trim().min(1, 'cliente é obrigatório'),
  produto: z.string().trim().min(1, 'produto é obrigatório'),
  tamanho: z.string().trim().min(1, 'tamanho é obrigatório'),
  quantidade: z.number().int().positive('quantidade deve ser maior que zero'),
  status: z.enum(STATUS_VALIDOS).optional(),
});

const atualizarStatusSchema = z.object({
  status: z.enum(STATUS_VALIDOS),
});

export interface OrdemProducao {
  id: number;
  cliente: string;
  produto: string;
  tamanho: string;
  quantidade: number;
  status: (typeof STATUS_VALIDOS)[number];
  criado_em: string;
}

export function createOrdensRouter(db: AppDatabase): Router {
  const router = Router();

  const listStmt = db.prepare(
    'SELECT * FROM ordens_producao ORDER BY datetime(criado_em) DESC, id DESC',
  );
  const getStmt = db.prepare('SELECT * FROM ordens_producao WHERE id = ?');
  const insertStmt = db.prepare(
    `INSERT INTO ordens_producao (
       cliente, produto, tamanho, quantidade, status, cliente_id, produto_id, variante_id
     ) VALUES (
       @cliente, @produto, @tamanho, @quantidade, @status, @cliente_id, @produto_id, @variante_id
     )`,
  );
  const updateStatusStmt = db.prepare(
    'UPDATE ordens_producao SET status = @status WHERE id = @id',
  );
  const deleteStmt = db.prepare('DELETE FROM ordens_producao WHERE id = ?');

  router.get('/', (_req, res) => {
    const ordens = listStmt.all() as OrdemProducao[];
    res.json(ordens);
  });

  router.get('/:id', (req, res) => {
    const ordem = getStmt.get(Number(req.params.id)) as OrdemProducao | undefined;
    if (!ordem) {
      return res.status(404).json({ erro: 'Ordem de produção não encontrada' });
    }
    res.json(ordem);
  });

  router.post('/', (req, res) => {
    const parsed = criarOrdemSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        erro: 'Dados inválidos',
        detalhes: parsed.error.flatten().fieldErrors,
      });
    }

    const { cliente, produto, tamanho, quantidade, status } = parsed.data;
    const vinculado = db
      .prepare(
        `SELECT id FROM clientes WHERE lower(trim(nome)) = lower(trim(?)) ORDER BY id DESC LIMIT 1`,
      )
      .get(cliente) as { id: number } | undefined;
    const produtoRow = db
      .prepare(
        `SELECT id FROM produtos WHERE lower(trim(nome)) = lower(trim(?)) ORDER BY id DESC LIMIT 1`,
      )
      .get(produto) as { id: number } | undefined;
    const varianteRow = produtoRow
      ? (db
          .prepare(
            `SELECT id FROM produto_variantes
             WHERE produto_id = ?
               AND lower(trim(tamanho)) = lower(trim(?))
             ORDER BY id ASC LIMIT 1`,
          )
          .get(produtoRow.id, tamanho) as { id: number } | undefined)
      : undefined;
    const info = insertStmt.run({
      cliente,
      produto,
      tamanho,
      quantidade,
      status: status ?? 'pendente',
      cliente_id: vinculado?.id ?? null,
      produto_id: produtoRow?.id ?? null,
      variante_id: varianteRow?.id ?? null,
    });

    const ordem = getStmt.get(info.lastInsertRowid) as OrdemProducao;
    res.status(201).json(ordem);
  });

  router.patch('/:id', (req, res) => {
    const parsed = atualizarStatusSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        erro: 'Dados inválidos',
        detalhes: parsed.error.flatten().fieldErrors,
      });
    }

    const id = Number(req.params.id);
    const info = updateStatusStmt.run({ id, status: parsed.data.status });
    if (info.changes === 0) {
      return res.status(404).json({ erro: 'Ordem de produção não encontrada' });
    }
    res.json(getStmt.get(id) as OrdemProducao);
  });

  router.delete('/:id', (req, res) => {
    const info = deleteStmt.run(Number(req.params.id));
    if (info.changes === 0) {
      return res.status(404).json({ erro: 'Ordem de produção não encontrada' });
    }
    res.status(204).send();
  });

  return router;
}
