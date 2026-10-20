import { Router } from 'express';
import { z } from 'zod';
import type { AppDatabase } from './db.js';
import { arredondarDinheiro } from './financeiro.js';
import { aplicarEmpresa, empresaDaSessao } from './tenant.js';

export const STATUS_EXPEDICAO = ['pronto_envio', 'expedido', 'entregue'] as const;
export type StatusExpedicao = (typeof STATUS_EXPEDICAO)[number];

const FILAS = ['prontos', 'expedidos', 'entregues', 'todos'] as const;
const PEDIDOS_FILA = ['pronto', 'faturado'] as const;

const acaoSchema = z.object({
  data_expedicao: z
    .string()
    .trim()
    .max(32)
    .optional()
    .or(z.literal(''))
    .transform((v) => (v ? v.slice(0, 10) : undefined)),
  data_entrega: z
    .string()
    .trim()
    .max(32)
    .optional()
    .or(z.literal(''))
    .transform((v) => (v ? v.slice(0, 10) : undefined)),
  observacoes: z
    .string()
    .trim()
    .max(4000)
    .optional()
    .or(z.literal(''))
    .transform((v) => (v ? v : undefined)),
});

const LISTA_SELECT = `
  SELECT
    p.id AS pedido_id,
    p.codigo,
    p.status AS pedido_status,
    p.data_pedido,
    p.data_prevista,
    p.total,
    c.nome AS cliente,
    (SELECT ifnull(SUM(i.quantidade),0) FROM pedido_itens i WHERE i.pedido_id = p.id) AS quantidade,
    e.id AS expedicao_id,
    e.status AS expedicao_status,
    e.data_pronta,
    e.data_expedicao,
    e.data_entrega,
    e.observacoes
  FROM pedidos p
  JOIN clientes c ON c.id = p.cliente_id
  LEFT JOIN expedicoes e ON e.pedido_id = p.id
`;

type ExpedicaoRow = {
  pedido_id: number;
  codigo: string | null;
  pedido_status: string;
  data_pedido: string;
  data_prevista: string | null;
  total: number;
  cliente: string;
  quantidade: number;
  expedicao_id: number | null;
  expedicao_status: string | null;
  data_pronta: string | null;
  data_expedicao: string | null;
  data_entrega: string | null;
  observacoes: string | null;
};

function hojeIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function estadoExpedicaoAtual(row: ExpedicaoRow): StatusExpedicao | null {
  if (row.pedido_status === 'entregue' || row.expedicao_status === 'entregue') return 'entregue';
  return (row.expedicao_status ?? null) as StatusExpedicao | null;
}

function mapRow(row: ExpedicaoRow) {
  const expedicaoStatus = estadoExpedicaoAtual(row);
  return {
    pedido_id: row.pedido_id,
    codigo: row.codigo,
    cliente: row.cliente,
    quantidade: row.quantidade,
    valor: arredondarDinheiro(row.total),
    data_pedido: row.data_pedido,
    data_prevista: row.data_prevista,
    pedido_status: row.pedido_status,
    expedicao_id: row.expedicao_id,
    expedicao_status: expedicaoStatus,
    status: expedicaoStatus ?? row.pedido_status,
    data_pronta: row.data_pronta,
    data_expedicao: row.data_expedicao,
    data_entrega: row.data_entrega,
    observacoes: row.observacoes,
  };
}

// Cada pedido ativo entra em no máximo uma fila. Entregue (no pedido ou na expedição) sai de Expedidos.
function filtroFila(fila: string): string {
  if (fila === 'expedidos') return `e.status = 'expedido' AND p.status != 'entregue'`;
  if (fila === 'entregues') return `(e.status = 'entregue' OR p.status = 'entregue')`;
  if (fila === 'todos') {
    return `(p.status IN ('pronto','faturado','entregue') OR e.id IS NOT NULL)`;
  }
  return `p.status IN ('pronto','faturado') AND (e.id IS NULL OR e.status = 'pronto_envio')`;
}

export function createExpedicaoRouter(db: AppDatabase): Router {
  const router = Router();

  function getPedido(id: number, empresaId: number) {
    return db
      .prepare(
        `SELECT p.id, p.codigo, p.status, p.data_pedido, p.data_prevista, p.total, p.empresa_id,
                c.nome AS cliente,
                (SELECT ifnull(SUM(i.quantidade),0) FROM pedido_itens i WHERE i.pedido_id = p.id) AS quantidade
           FROM pedidos p JOIN clientes c ON c.id = p.cliente_id
          WHERE p.id = ? AND p.empresa_id = ?`,
      )
      .get(id, empresaId) as
      | {
          id: number;
          codigo: string | null;
          status: string;
          data_pedido: string;
          data_prevista: string | null;
          total: number;
          empresa_id: number;
          cliente: string;
          quantidade: number;
        }
      | undefined;
  }

  function getExpedicao(pedidoId: number, empresaId: number) {
    return db
      .prepare(`SELECT * FROM expedicoes WHERE pedido_id = ? AND empresa_id = ?`)
      .get(pedidoId, empresaId) as
      | {
          id: number;
          pedido_id: number;
          status: string;
          data_pronta: string | null;
          data_expedicao: string | null;
          data_entrega: string | null;
          observacoes: string | null;
        }
      | undefined;
  }

  function getLinha(pedidoId: number, empresaId: number) {
    const row = db
      .prepare(`${LISTA_SELECT} WHERE p.id = ? AND p.empresa_id = ?`)
      .get(pedidoId, empresaId) as ExpedicaoRow | undefined;
    return row ? mapRow(row) : undefined;
  }

  router.get('/resumo', (req, res) => {
    const empresaId = empresaDaSessao(req);
    const contarFila = (fila: (typeof FILAS)[number]) =>
      (
        db
          .prepare(
            `SELECT COUNT(*) AS n FROM pedidos p
             LEFT JOIN expedicoes e ON e.pedido_id = p.id
             WHERE p.empresa_id = ? AND p.status != 'cancelado' AND ${filtroFila(fila)}`,
          )
          .get(empresaId) as { n: number }
      ).n;
    const prontosEnvio = (
      db
        .prepare(
          `SELECT COUNT(*) AS n FROM expedicoes e
             JOIN pedidos p ON p.id = e.pedido_id
            WHERE e.empresa_id = ? AND e.status = 'pronto_envio'
              AND p.status != 'cancelado' AND p.status != 'entregue'`,
        )
        .get(empresaId) as { n: number }
    ).n;
    res.json({
      fila: contarFila('prontos'),
      prontos_envio: prontosEnvio,
      expedidos: contarFila('expedidos'),
      entregues: contarFila('entregues'),
    });
  });

  router.get('/', (req, res) => {
    const filaRaw = String(req.query.fila ?? 'prontos').trim();
    const fila = (FILAS as readonly string[]).includes(filaRaw) ? filaRaw : 'prontos';
    const q = String(req.query.q ?? '').trim();
    const pagina = Math.max(1, Number(req.query.pagina ?? 1) || 1);
    const porPagina = Math.min(100, Math.max(1, Number(req.query.por_pagina ?? 10) || 10));
    const where = [`p.status != 'cancelado'`, filtroFila(fila)];
    const params: Record<string, string | number> = {};
    aplicarEmpresa(where, params, req, 'p.empresa_id');
    if (q) {
      where.push(`(ifnull(p.codigo,'') LIKE @q OR c.nome LIKE @q)`);
      params.q = `%${q}%`;
    }
    const filtro = `WHERE ${where.join(' AND ')}`;
    const total = (
      db.prepare(`SELECT COUNT(*) AS n FROM pedidos p JOIN clientes c ON c.id = p.cliente_id LEFT JOIN expedicoes e ON e.pedido_id = p.id ${filtro}`).get(params) as {
        n: number;
      }
    ).n;
    const data = db
      .prepare(
        `${LISTA_SELECT} ${filtro}
         ORDER BY date(p.data_pedido) DESC, p.id DESC
         LIMIT @limit OFFSET @offset`,
      )
      .all({ ...params, limit: porPagina, offset: (pagina - 1) * porPagina }) as ExpedicaoRow[];
    res.json({
      data: data.map(mapRow),
      pagina,
      por_pagina: porPagina,
      total,
      total_paginas: Math.max(1, Math.ceil(total / porPagina)),
    });
  });

  router.post('/:id/pronto-envio', (req, res) => {
    const empresaId = empresaDaSessao(req);
    const pedido = getPedido(Number(req.params.id), empresaId);
    if (!pedido) return res.status(404).json({ erro: 'Pedido não encontrado' });
    if (pedido.status === 'cancelado') {
      return res.status(409).json({ erro: 'Pedido cancelado não entra na expedição' });
    }
    if (pedido.status === 'entregue') {
      return res.status(409).json({ erro: 'Pedido já foi entregue' });
    }
    if (!(PEDIDOS_FILA as readonly string[]).includes(pedido.status)) {
      return res.status(409).json({
        erro: 'Só pedidos prontos ou faturados podem ser marcados como pronto para envio',
      });
    }
    const atual = getExpedicao(pedido.id, empresaId);
    if (atual && atual.status !== 'pronto_envio') {
      return res.status(409).json({ erro: 'Este pedido já foi expedido' });
    }
    const parsed = acaoSchema.safeParse(req.body ?? {});
    const obs = parsed.success ? parsed.data.observacoes : undefined;
    const dataPronta = hojeIso();
    if (atual) {
      db.prepare(
        `UPDATE expedicoes
            SET data_pronta = ifnull(data_pronta, @data_pronta),
                observacoes = @observacoes,
                atualizado_em = datetime('now')
          WHERE id = @id AND empresa_id = @empresa_id`,
      ).run({
        id: atual.id,
        empresa_id: empresaId,
        data_pronta: dataPronta,
        observacoes: obs ?? atual.observacoes,
      });
    } else {
      db.prepare(
        `INSERT INTO expedicoes (empresa_id, pedido_id, status, data_pronta, observacoes)
         VALUES (@empresa_id, @pedido_id, 'pronto_envio', @data_pronta, @observacoes)`,
      ).run({
        empresa_id: empresaId,
        pedido_id: pedido.id,
        data_pronta: dataPronta,
        observacoes: obs ?? null,
      });
    }
    res.status(atual ? 200 : 201).json(getLinha(pedido.id, empresaId));
  });

  router.post('/:id/expedir', (req, res) => {
    const empresaId = empresaDaSessao(req);
    const pedido = getPedido(Number(req.params.id), empresaId);
    if (!pedido) return res.status(404).json({ erro: 'Pedido não encontrado' });
    if (pedido.status === 'cancelado') {
      return res.status(409).json({ erro: 'Pedido cancelado não pode ser expedido' });
    }
    if (pedido.status === 'entregue') {
      return res.status(409).json({ erro: 'Pedido já foi entregue' });
    }
    if (!(PEDIDOS_FILA as readonly string[]).includes(pedido.status)) {
      return res.status(409).json({ erro: 'Só pedidos prontos ou faturados podem ser expedidos' });
    }
    const parsed = acaoSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      return res.status(400).json({ erro: 'Dados inválidos', detalhes: parsed.error.flatten().fieldErrors });
    }
    const atual = getExpedicao(pedido.id, empresaId);
    if (atual?.status === 'expedido') {
      return res.status(409).json({ erro: 'Expedição já registrada para este pedido' });
    }
    if (atual?.status === 'entregue') {
      return res.status(409).json({ erro: 'Pedido já foi entregue' });
    }
    const dataExpedicao = parsed.data.data_expedicao ?? hojeIso();
    const obs = parsed.data.observacoes ?? atual?.observacoes ?? null;
    if (atual) {
      db.prepare(
        `UPDATE expedicoes
            SET status = 'expedido',
                data_pronta = ifnull(data_pronta, @data_pronta),
                data_expedicao = @data_expedicao,
                observacoes = @observacoes,
                atualizado_em = datetime('now')
          WHERE id = @id AND empresa_id = @empresa_id`,
      ).run({
        id: atual.id,
        empresa_id: empresaId,
        data_pronta: atual.data_pronta ?? hojeIso(),
        data_expedicao: dataExpedicao,
        observacoes: obs,
      });
    } else {
      db.prepare(
        `INSERT INTO expedicoes (empresa_id, pedido_id, status, data_pronta, data_expedicao, observacoes)
         VALUES (@empresa_id, @pedido_id, 'expedido', @data_pronta, @data_expedicao, @observacoes)`,
      ).run({
        empresa_id: empresaId,
        pedido_id: pedido.id,
        data_pronta: hojeIso(),
        data_expedicao: dataExpedicao,
        observacoes: obs,
      });
    }
    res.status(atual ? 200 : 201).json(getLinha(pedido.id, empresaId));
  });

  router.post('/:id/entregar', (req, res) => {
    const empresaId = empresaDaSessao(req);
    const pedido = getPedido(Number(req.params.id), empresaId);
    if (!pedido) return res.status(404).json({ erro: 'Pedido não encontrado' });
    if (pedido.status === 'cancelado') {
      return res.status(409).json({ erro: 'Pedido cancelado não pode ser entregue' });
    }
    if (pedido.status === 'entregue') {
      return res.status(409).json({ erro: 'Pedido já foi entregue' });
    }
    if (!(PEDIDOS_FILA as readonly string[]).includes(pedido.status)) {
      return res.status(409).json({ erro: 'Só pedidos prontos ou faturados podem ser entregues' });
    }
    const parsed = acaoSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      return res.status(400).json({ erro: 'Dados inválidos', detalhes: parsed.error.flatten().fieldErrors });
    }
    const atual = getExpedicao(pedido.id, empresaId);
    if (!atual || atual.status !== 'expedido') {
      return res.status(409).json({ erro: 'Registre a expedição antes de marcar como entregue' });
    }
    const dataEntrega = parsed.data.data_entrega ?? hojeIso();
    db.transaction(() => {
      db.prepare(
        `UPDATE expedicoes
            SET status = 'entregue',
                data_entrega = @data_entrega,
                observacoes = @observacoes,
                atualizado_em = datetime('now')
          WHERE id = @id AND empresa_id = @empresa_id`,
      ).run({
        id: atual.id,
        empresa_id: empresaId,
        data_entrega: dataEntrega,
        observacoes: parsed.data.observacoes ?? atual.observacoes,
      });
      db.prepare(
        `UPDATE pedidos SET status = 'entregue', atualizado_em = datetime('now')
          WHERE id = ? AND empresa_id = ?`,
      ).run(pedido.id, empresaId);
    })();
    res.json(getLinha(pedido.id, empresaId));
  });

  return router;
}
