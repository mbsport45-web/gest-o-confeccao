import { Router } from 'express';
import { z } from 'zod';
import type { AppDatabase } from './db.js';
import { aplicarEmpresa, empresaDaSessao } from './tenant.js';

export const TIPOS_ETAPA = [
  'corte',
  'costura',
  'acabamento',
  'qualidade',
  'embalagem',
] as const;

export const STATUS_ETAPA = [
  'pendente',
  'em_andamento',
  'concluida',
  'cancelada',
] as const;

export const ETAPAS_PADRAO: Array<{
  tipo: (typeof TIPOS_ETAPA)[number];
  sequencia: number;
}> = [
  { tipo: 'corte', sequencia: 1 },
  { tipo: 'costura', sequencia: 2 },
  { tipo: 'acabamento', sequencia: 3 },
  { tipo: 'qualidade', sequencia: 4 },
  { tipo: 'embalagem', sequencia: 5 },
];

const TERMINAIS = new Set(['concluida', 'cancelada']);

const textoOpcional = z
  .string()
  .trim()
  .max(200)
  .optional()
  .or(z.literal(''))
  .transform((v) => (v ? v : undefined));

const criarEtapaSchema = z.object({
  ordem_id: z.number().int().positive(),
  tipo: z.enum(TIPOS_ETAPA),
  sequencia: z.number().int().positive().optional(),
  responsavel: textoOpcional,
  observacoes: z
    .string()
    .trim()
    .max(2000)
    .optional()
    .or(z.literal(''))
    .transform((v) => (v ? v : undefined)),
});

const fluxoSchema = z.object({
  ordem_id: z.number().int().positive(),
  responsavel: textoOpcional,
});

const atualizarEtapaSchema = z.object({
  status: z.enum(STATUS_ETAPA).optional(),
  sequencia: z.number().int().positive().optional(),
  responsavel: z
    .string()
    .trim()
    .max(200)
    .optional()
    .or(z.literal(''))
    .transform((v) => (v === '' ? null : v))
    .optional(),
  iniciado_em: z
    .string()
    .trim()
    .max(32)
    .optional()
    .or(z.literal(''))
    .transform((v) => (v === '' ? null : v))
    .optional(),
  finalizado_em: z
    .string()
    .trim()
    .max(32)
    .optional()
    .or(z.literal(''))
    .transform((v) => (v === '' ? null : v))
    .optional(),
  observacoes: z
    .string()
    .trim()
    .max(2000)
    .optional()
    .or(z.literal(''))
    .transform((v) => (v === '' ? null : v))
    .optional(),
});

export interface EtapaProducao {
  id: number;
  ordem_id: number;
  tipo: (typeof TIPOS_ETAPA)[number];
  sequencia: number;
  status: (typeof STATUS_ETAPA)[number];
  responsavel: string | null;
  iniciado_em: string | null;
  finalizado_em: string | null;
  observacoes: string | null;
  criado_em: string;
  atualizado_em: string;
  ordem_codigo: string | null;
  cliente: string;
  produto: string;
  tamanho: string;
  ordem_quantidade: number;
}

const SELECT = `
  SELECT
    e.id, e.ordem_id, e.tipo, e.sequencia, e.status, e.responsavel,
    e.iniciado_em, e.finalizado_em, e.observacoes, e.criado_em, e.atualizado_em,
    o.codigo AS ordem_codigo, o.cliente, o.produto, o.tamanho,
    o.quantidade AS ordem_quantidade
  FROM etapas_producao e
  JOIN ordens_producao o ON o.id = e.ordem_id
`;

export function createEtapasRouter(db: AppDatabase): Router {
  const router = Router();
  const getStmt = db.prepare(`${SELECT} WHERE e.id = ? AND e.empresa_id = ?`);
  const getOrdem = db.prepare('SELECT id, empresa_id FROM ordens_producao WHERE id = ? AND empresa_id = ?');
  const countByOrdem = db.prepare(
    'SELECT COUNT(*) AS n FROM etapas_producao WHERE ordem_id = ? AND empresa_id = ?',
  );
  const maxSeq = db.prepare(
    'SELECT ifnull(MAX(sequencia), 0) AS n FROM etapas_producao WHERE ordem_id = ? AND empresa_id = ?',
  );
  const insertStmt = db.prepare(
    `INSERT INTO etapas_producao (
       empresa_id, ordem_id, tipo, sequencia, status, responsavel, observacoes
     ) VALUES (
       @empresa_id, @ordem_id, @tipo, @sequencia, 'pendente', @responsavel, @observacoes
     )`,
  );
  const deleteStmt = db.prepare('DELETE FROM etapas_producao WHERE id = ? AND empresa_id = ?');
  const anteriorStmt = db.prepare(
    `SELECT * FROM etapas_producao
      WHERE ordem_id = ? AND sequencia < ?
      ORDER BY sequencia DESC LIMIT 1`,
  );
  const emAndamentoStmt = db.prepare(
    `SELECT id FROM etapas_producao
      WHERE ordem_id = ? AND status = 'em_andamento' AND id != ?`,
  );

  function map(id: number, empresaId: number): EtapaProducao | undefined {
    return getStmt.get(id, empresaId) as EtapaProducao | undefined;
  }

  function garantirOrdem(ordemId: number, empresaId: number) {
    const ordem = getOrdem.get(ordemId, empresaId) as { id: number } | undefined;
    if (!ordem) {
      throw Object.assign(new Error('Ordem de produção não encontrada'), { status: 404 });
    }
  }

  router.post('/fluxo', (req, res) => {
    const parsed = fluxoSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        erro: 'Dados inválidos',
        detalhes: parsed.error.flatten().fieldErrors,
      });
    }
    try {
      garantirOrdem(parsed.data.ordem_id, empresaDaSessao(req));
    } catch (e) {
      const err = e as Error & { status?: number };
      return res.status(err.status ?? 400).json({ erro: err.message });
    }
    const empresaId = empresaDaSessao(req);
    const existentes = (countByOrdem.get(parsed.data.ordem_id, empresaId) as { n: number }).n;
    if (existentes > 0) {
      return res.status(409).json({ erro: 'Esta OP já possui um fluxo de etapas' });
    }

    const criar = db.transaction(() => {
      const ids: number[] = [];
      for (const etapa of ETAPAS_PADRAO) {
        const info = insertStmt.run({
          empresa_id: empresaId,
          ordem_id: parsed.data.ordem_id,
          tipo: etapa.tipo,
          sequencia: etapa.sequencia,
          responsavel: parsed.data.responsavel ?? null,
          observacoes: null,
        });
        ids.push(Number(info.lastInsertRowid));
      }
      return ids;
    });
    const ids = criar();
    res.status(201).json({
      ordem_id: parsed.data.ordem_id,
      data: ids.map((id) => map(id, empresaId)),
    });
  });

  router.get('/', (req, res) => {
    const pagina = Math.max(1, Number(req.query.pagina ?? 1) || 1);
    const porPagina = Math.min(
      100,
      Math.max(1, Number(req.query.por_pagina ?? 10) || 10),
    );
    const q = String(req.query.q ?? '').trim();
    const status = String(req.query.status ?? '').trim();
    const tipo = String(req.query.tipo ?? '').trim();
    const ordemId = Number(req.query.ordem_id ?? 0);

    const where: string[] = [];
    const params: Record<string, string | number> = {};
    aplicarEmpresa(where, params, req, 'e.empresa_id');
    if (q) {
      where.push(
        `(ifnull(o.codigo,'') LIKE @q OR o.cliente LIKE @q OR o.produto LIKE @q
          OR ifnull(e.responsavel,'') LIKE @q)`,
      );
      params.q = `%${q}%`;
    }
    if ((STATUS_ETAPA as readonly string[]).includes(status)) {
      where.push('e.status = @status');
      params.status = status;
    }
    if ((TIPOS_ETAPA as readonly string[]).includes(tipo)) {
      where.push('e.tipo = @tipo');
      params.tipo = tipo;
    }
    if (ordemId > 0) {
      where.push('e.ordem_id = @ordem_id');
      params.ordem_id = ordemId;
    }
    const filtro = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const from = `
      FROM etapas_producao e
      JOIN ordens_producao o ON o.id = e.ordem_id
      ${filtro}
    `;
    const total = (db.prepare(`SELECT COUNT(*) AS n ${from}`).get(params) as { n: number }).n;
    const data = db
      .prepare(
        `SELECT
           e.id, e.ordem_id, e.tipo, e.sequencia, e.status, e.responsavel,
           e.iniciado_em, e.finalizado_em, e.observacoes, e.criado_em, e.atualizado_em,
           o.codigo AS ordem_codigo, o.cliente, o.produto, o.tamanho,
           o.quantidade AS ordem_quantidade
         ${from}
         ORDER BY e.ordem_id DESC, e.sequencia ASC, e.id ASC
         LIMIT @limit OFFSET @offset`,
      )
      .all({
        ...params,
        limit: porPagina,
        offset: (pagina - 1) * porPagina,
      }) as EtapaProducao[];

    res.json({
      data,
      pagina,
      por_pagina: porPagina,
      total,
      total_paginas: Math.max(1, Math.ceil(total / porPagina)),
    });
  });

  router.get('/:id', (req, res) => {
    const etapa = map(Number(req.params.id), empresaDaSessao(req));
    if (!etapa) return res.status(404).json({ erro: 'Etapa não encontrada' });
    res.json(etapa);
  });

  router.post('/', (req, res) => {
    const parsed = criarEtapaSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        erro: 'Dados inválidos',
        detalhes: parsed.error.flatten().fieldErrors,
      });
    }
    try {
      garantirOrdem(parsed.data.ordem_id, empresaDaSessao(req));
    } catch (e) {
      const err = e as Error & { status?: number };
      return res.status(err.status ?? 400).json({ erro: err.message });
    }
    const empresaId = empresaDaSessao(req);
    const sequencia =
      parsed.data.sequencia ??
      (maxSeq.get(parsed.data.ordem_id, empresaId) as { n: number }).n + 1;
    try {
      const info = insertStmt.run({
        empresa_id: empresaId,
        ordem_id: parsed.data.ordem_id,
        tipo: parsed.data.tipo,
        sequencia,
        responsavel: parsed.data.responsavel ?? null,
        observacoes: parsed.data.observacoes ?? null,
      });
      res.status(201).json(map(Number(info.lastInsertRowid), empresaId));
    } catch (e) {
      const msg = String((e as Error).message);
      if (msg.includes('UNIQUE')) {
        return res.status(409).json({ erro: 'Já existe esta etapa ou sequência nesta OP' });
      }
      throw e;
    }
  });

  router.patch('/:id', (req, res) => {
    const parsed = atualizarEtapaSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        erro: 'Dados inválidos',
        detalhes: parsed.error.flatten().fieldErrors,
      });
    }
    const id = Number(req.params.id);
    const empresaId = empresaDaSessao(req);
    const atual = db
      .prepare('SELECT * FROM etapas_producao WHERE id = ? AND empresa_id = ?')
      .get(id, empresaId) as {
      id: number;
      ordem_id: number;
      sequencia: number;
      status: (typeof STATUS_ETAPA)[number];
      responsavel: string | null;
      iniciado_em: string | null;
      finalizado_em: string | null;
      observacoes: string | null;
    } | undefined;
    if (!atual) return res.status(404).json({ erro: 'Etapa não encontrada' });

    const data = parsed.data;
    const novoStatus = data.status ?? atual.status;
    if (data.status && data.status !== atual.status) {
      if (TERMINAIS.has(atual.status)) {
        return res.status(409).json({
          erro: `Não é possível alterar uma etapa ${atual.status}`,
        });
      }
      if (data.status === 'em_andamento') {
        const anterior = anteriorStmt.get(atual.ordem_id, atual.sequencia) as
          | { status: string; tipo: string }
          | undefined;
        if (anterior && anterior.status !== 'concluida') {
          return res.status(409).json({
            erro: `Conclua a etapa anterior (${anterior.tipo}) antes de iniciar esta`,
          });
        }
        const outra = emAndamentoStmt.get(atual.ordem_id, id) as { id: number } | undefined;
        if (outra) {
          return res.status(409).json({
            erro: 'Já existe uma etapa em andamento nesta OP',
          });
        }
      }
      if (data.status === 'concluida' && atual.status !== 'em_andamento') {
        return res.status(409).json({
          erro: 'Inicie a etapa antes de concluí-la',
        });
      }
    }

    let iniciado = data.iniciado_em === undefined ? atual.iniciado_em : data.iniciado_em;
    let finalizado = data.finalizado_em === undefined ? atual.finalizado_em : data.finalizado_em;
    const agora = () => (db.prepare(`SELECT datetime('now') AS n`).get() as { n: string }).n;
    if (novoStatus === 'em_andamento' && !iniciado) iniciado = agora();
    if (novoStatus === 'concluida' && !finalizado) finalizado = agora();

    try {
      db.prepare(
        `UPDATE etapas_producao SET
           status = @status,
           sequencia = @sequencia,
           responsavel = @responsavel,
           iniciado_em = @iniciado_em,
           finalizado_em = @finalizado_em,
           observacoes = @observacoes,
           atualizado_em = datetime('now')
         WHERE id = @id AND empresa_id = @empresa_id`,
      ).run({
        id,
        empresa_id: empresaId,
        status: novoStatus,
        sequencia: data.sequencia ?? atual.sequencia,
        responsavel: data.responsavel === undefined ? atual.responsavel : data.responsavel,
        iniciado_em: iniciado,
        finalizado_em: finalizado,
        observacoes: data.observacoes === undefined ? atual.observacoes : data.observacoes,
      });
    } catch (e) {
      const msg = String((e as Error).message);
      if (msg.includes('UNIQUE')) {
        return res.status(409).json({ erro: 'Já existe esta sequência nesta OP' });
      }
      throw e;
    }
    res.json(map(id, empresaId));
  });

  router.delete('/:id', (req, res) => {
    const id = Number(req.params.id);
    const empresaId = empresaDaSessao(req);
    const atual = db
      .prepare('SELECT status FROM etapas_producao WHERE id = ? AND empresa_id = ?')
      .get(id, empresaId) as { status: string } | undefined;
    if (!atual) return res.status(404).json({ erro: 'Etapa não encontrada' });
    if (atual.status !== 'pendente' && atual.status !== 'cancelada') {
      return res.status(409).json({
        erro: 'Só é possível excluir etapas pendentes ou canceladas',
      });
    }
    deleteStmt.run(id, empresaId);
    res.status(204).send();
  });

  return router;
}
