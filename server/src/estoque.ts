import { Router } from 'express';
import { z } from 'zod';
import type { AppDatabase } from './db.js';
import { aplicarEmpresa, empresaDaSessao } from './tenant.js';

export const TIPOS_SALDO = ['variante', 'produto', 'materia'] as const;
export const TIPOS_MOVIMENTO = ['entrada', 'saida', 'ajuste'] as const;

export interface EstoqueSaldo {
  id: number;
  tipo: (typeof TIPOS_SALDO)[number];
  produto_id: number | null;
  variante_id: number | null;
  materia_prima_id: number | null;
  quantidade: number;
  criado_em: string;
  atualizado_em: string;
  nome: string;
  codigo: string | null;
  detalhe: string | null;
  unidade: string;
  estoque_minimo: number;
  abaixo_minimo: boolean;
}

export interface EstoqueMovimento {
  id: number;
  saldo_id: number;
  tipo: (typeof TIPOS_MOVIMENTO)[number];
  quantidade: number;
  saldo_anterior: number;
  saldo_posterior: number;
  motivo: string | null;
  observacoes: string | null;
  produto_id: number | null;
  variante_id: number | null;
  materia_prima_id: number | null;
  criado_em: string;
}

const SALDO_SELECT = `
  SELECT
    s.id, s.tipo, s.produto_id, s.variante_id, s.materia_prima_id,
    s.quantidade, s.criado_em, s.atualizado_em,
    CASE
      WHEN s.tipo = 'materia' THEN m.nome
      ELSE p.nome
    END AS nome,
    CASE
      WHEN s.tipo = 'materia' THEN m.codigo
      WHEN s.tipo = 'variante' THEN v.sku
      ELSE p.sku
    END AS codigo,
    CASE
      WHEN s.tipo = 'variante' THEN trim(ifnull(v.cor,'') || ' / ' || ifnull(v.tamanho,''))
      WHEN s.tipo = 'materia' THEN m.tipo
      ELSE NULL
    END AS detalhe,
    CASE
      WHEN s.tipo = 'materia' THEN ifnull(m.unidade, 'UN')
      ELSE ifnull(p.unidade, 'UN')
    END AS unidade,
    CASE
      WHEN s.tipo = 'materia' THEN ifnull(m.estoque_minimo, 0)
      WHEN s.tipo = 'variante' THEN ifnull(v.estoque_minimo, ifnull(p.estoque_minimo, 0))
      ELSE ifnull(p.estoque_minimo, 0)
    END AS estoque_minimo
  FROM estoque_saldos s
  LEFT JOIN produtos p ON p.id = s.produto_id
  LEFT JOIN produto_variantes v ON v.id = s.variante_id
  LEFT JOIN materias_primas m ON m.id = s.materia_prima_id
`;

function comAbaixo(row: Omit<EstoqueSaldo, 'abaixo_minimo'>): EstoqueSaldo {
  return { ...row, abaixo_minimo: row.quantidade < row.estoque_minimo };
}

const criarMovimentoSchema = z
  .object({
    tipo: z.enum(TIPOS_MOVIMENTO),
    quantidade: z.number().min(0, 'quantidade não pode ser negativa'),
    variante_id: z.number().int().positive().optional(),
    produto_id: z.number().int().positive().optional(),
    materia_prima_id: z.number().int().positive().optional(),
    motivo: z
      .string()
      .trim()
      .max(200)
      .optional()
      .or(z.literal(''))
      .transform((v) => (v ? v : undefined)),
    observacoes: z
      .string()
      .trim()
      .max(2000)
      .optional()
      .or(z.literal(''))
      .transform((v) => (v ? v : undefined)),
  })
  .refine(
    (body) => {
      const refs = [body.variante_id, body.produto_id, body.materia_prima_id].filter(
        (v) => v !== undefined,
      );
      return refs.length === 1;
    },
    { message: 'Informe exatamente um de variante_id, produto_id ou materia_prima_id' },
  )
  .refine((body) => body.tipo === 'ajuste' || body.quantidade > 0, {
    message: 'quantidade deve ser maior que zero',
    path: ['quantidade'],
  });

export type MovimentoEstoqueInput = {
  tipo: (typeof TIPOS_MOVIMENTO)[number];
  quantidade: number;
  variante_id?: number;
  produto_id?: number;
  materia_prima_id?: number;
  motivo?: string | null;
  observacoes?: string | null;
  unidade?: string | null;
  custo?: number | null;
  usuario_id?: number | null;
  referencia_tipo?: string | null;
  referencia_id?: number | null;
};

export type ResultadoMovimentoEstoque =
  | { ok: true; movimentoId: number; saldoId: number }
  | { ok: false; status: number; erro: string };

export function obterOuCriarSaldoEstoque(
  db: AppDatabase,
  empresaId: number,
  ref: { variante_id?: number; produto_id?: number; materia_prima_id?: number },
): { ok: true; saldoId: number } | { ok: false; status: number; erro: string } {
  if (ref.variante_id) {
    const variante = db
      .prepare(
        `SELECT v.id, v.produto_id FROM produto_variantes v
          JOIN produtos p ON p.id = v.produto_id
         WHERE v.id = ? AND p.empresa_id = ?`,
      )
      .get(ref.variante_id, empresaId) as { id: number; produto_id: number } | undefined;
    if (!variante) return { ok: false, status: 404, erro: 'Variante não encontrada' };
    const atual = db
      .prepare('SELECT id FROM estoque_saldos WHERE variante_id = ? AND empresa_id = ?')
      .get(variante.id, empresaId) as { id: number } | undefined;
    if (atual) return { ok: true, saldoId: atual.id };
    const info = db
      .prepare(
        `INSERT INTO estoque_saldos (empresa_id, tipo, produto_id, variante_id, materia_prima_id, quantidade)
         VALUES (@empresa_id, 'variante', @produto_id, @variante_id, NULL, 0)`,
      )
      .run({ empresa_id: empresaId, produto_id: variante.produto_id, variante_id: variante.id });
    return { ok: true, saldoId: Number(info.lastInsertRowid) };
  }

  if (ref.materia_prima_id) {
    const materia = db
      .prepare('SELECT id FROM materias_primas WHERE id = ? AND empresa_id = ?')
      .get(ref.materia_prima_id, empresaId) as { id: number } | undefined;
    if (!materia) return { ok: false, status: 404, erro: 'Matéria-prima não encontrada' };
    const atual = db
      .prepare('SELECT id FROM estoque_saldos WHERE materia_prima_id = ? AND empresa_id = ?')
      .get(materia.id, empresaId) as { id: number } | undefined;
    if (atual) return { ok: true, saldoId: atual.id };
    const info = db
      .prepare(
        `INSERT INTO estoque_saldos (empresa_id, tipo, produto_id, variante_id, materia_prima_id, quantidade)
         VALUES (@empresa_id, 'materia', NULL, NULL, @materia_prima_id, 0)`,
      )
      .run({ empresa_id: empresaId, materia_prima_id: materia.id });
    return { ok: true, saldoId: Number(info.lastInsertRowid) };
  }

  if (ref.produto_id) {
    const produto = db
      .prepare('SELECT id FROM produtos WHERE id = ? AND empresa_id = ?')
      .get(ref.produto_id, empresaId) as { id: number } | undefined;
    if (!produto) return { ok: false, status: 404, erro: 'Produto não encontrado' };
    const nVar = (
      db
        .prepare('SELECT COUNT(*) AS n FROM produto_variantes WHERE produto_id = ?')
        .get(produto.id) as { n: number }
    ).n;
    if (nVar > 0) {
      return {
        ok: false,
        status: 400,
        erro: 'Produto possui variantes; informe variante_id',
      };
    }
    const atual = db
      .prepare(
        `SELECT id FROM estoque_saldos
          WHERE tipo = 'produto' AND produto_id = ? AND variante_id IS NULL AND empresa_id = ?`,
      )
      .get(produto.id, empresaId) as { id: number } | undefined;
    if (atual) return { ok: true, saldoId: atual.id };
    const info = db
      .prepare(
        `INSERT INTO estoque_saldos (empresa_id, tipo, produto_id, variante_id, materia_prima_id, quantidade)
         VALUES (@empresa_id, 'produto', @produto_id, NULL, NULL, 0)`,
      )
      .run({ empresa_id: empresaId, produto_id: produto.id });
    return { ok: true, saldoId: Number(info.lastInsertRowid) };
  }

  return { ok: false, status: 400, erro: 'Informe o item de estoque' };
}

export function registrarMovimentoEstoque(
  db: AppDatabase,
  empresaId: number,
  data: MovimentoEstoqueInput,
): ResultadoMovimentoEstoque {
  const alvo = obterOuCriarSaldoEstoque(db, empresaId, {
    variante_id: data.variante_id,
    produto_id: data.produto_id,
    materia_prima_id: data.materia_prima_id,
  });
  if (!alvo.ok) return alvo;

  const saldoRow = db
    .prepare('SELECT * FROM estoque_saldos WHERE id = ? AND empresa_id = ?')
    .get(alvo.saldoId, empresaId) as {
    id: number;
    quantidade: number;
    produto_id: number | null;
    variante_id: number | null;
    materia_prima_id: number | null;
  };
  if (!saldoRow) return { ok: false, status: 404, erro: 'Saldo de estoque não encontrado' };

  const anterior = saldoRow.quantidade;
  let posterior = anterior;
  if (data.tipo === 'entrada') posterior = anterior + data.quantidade;
  else if (data.tipo === 'saida') posterior = anterior - data.quantidade;
  else posterior = data.quantidade;

  if (posterior < 0) {
    return { ok: false, status: 409, erro: 'Estoque insuficiente para a saída' };
  }

  db.prepare(
    `UPDATE estoque_saldos SET quantidade = @quantidade, atualizado_em = datetime('now')
      WHERE id = @id AND empresa_id = @empresa_id`,
  ).run({ id: saldoRow.id, empresa_id: empresaId, quantidade: posterior });
  const info = db
    .prepare(
      `INSERT INTO estoque_movimentos (
         empresa_id, saldo_id, tipo, quantidade, saldo_anterior, saldo_posterior, motivo, observacoes,
         produto_id, variante_id, materia_prima_id, unidade, custo, usuario_id,
         referencia_tipo, referencia_id
       ) VALUES (
         @empresa_id, @saldo_id, @tipo, @quantidade, @saldo_anterior, @saldo_posterior, @motivo, @observacoes,
         @produto_id, @variante_id, @materia_prima_id, @unidade, @custo, @usuario_id,
         @referencia_tipo, @referencia_id
       )`,
    )
    .run({
      empresa_id: empresaId,
      saldo_id: saldoRow.id,
      tipo: data.tipo,
      quantidade: data.quantidade,
      saldo_anterior: anterior,
      saldo_posterior: posterior,
      motivo: data.motivo ?? null,
      observacoes: data.observacoes ?? null,
      produto_id: saldoRow.produto_id,
      variante_id: saldoRow.variante_id,
      materia_prima_id: saldoRow.materia_prima_id,
      unidade: data.unidade ?? null,
      custo: data.custo ?? null,
      usuario_id: data.usuario_id ?? null,
      referencia_tipo: data.referencia_tipo ?? null,
      referencia_id: data.referencia_id ?? null,
    });
  return { ok: true, movimentoId: Number(info.lastInsertRowid), saldoId: saldoRow.id };
}

export function mapearSaldoEstoque(
  db: AppDatabase,
  id: number,
  empresaId: number,
): EstoqueSaldo | undefined {
  const row = db.prepare(`${SALDO_SELECT} WHERE s.id = ? AND s.empresa_id = ?`).get(id, empresaId) as
    | Omit<EstoqueSaldo, 'abaixo_minimo'>
    | undefined;
  return row ? comAbaixo(row) : undefined;
}

export function createEstoqueRouter(db: AppDatabase): Router {
  const router = Router();

  const listMovimentosSaldo = db.prepare(
    `SELECT * FROM estoque_movimentos WHERE saldo_id = ? ORDER BY datetime(criado_em) DESC, id DESC`,
  );
  const getMovimento = db.prepare('SELECT * FROM estoque_movimentos WHERE id = ?');

  function mapSaldo(id: number, empresaId: number): EstoqueSaldo | undefined {
    return mapearSaldoEstoque(db, id, empresaId);
  }

  router.get('/', (req, res) => {
    const pagina = Math.max(1, Number(req.query.pagina ?? 1) || 1);
    const porPagina = Math.min(
      100,
      Math.max(1, Number(req.query.por_pagina ?? 10) || 10),
    );
    const q = String(req.query.q ?? '').trim();
    const tipo = String(req.query.tipo ?? '').trim();
    const abaixo = String(req.query.abaixo_minimo ?? '').trim();

    const where: string[] = [];
    const params: Record<string, string | number> = {};
    aplicarEmpresa(where, params, req, 's.empresa_id');

    if (q) {
      where.push(
        `(ifnull(p.nome,'') LIKE @q OR ifnull(p.sku,'') LIKE @q
          OR ifnull(v.sku,'') LIKE @q OR ifnull(v.cor,'') LIKE @q
          OR ifnull(m.nome,'') LIKE @q OR ifnull(m.codigo,'') LIKE @q)`,
      );
      params.q = `%${q}%`;
    }
    if (tipo === 'materia') {
      where.push(`s.tipo = 'materia'`);
    } else if (tipo === 'produto') {
      where.push(`s.tipo IN ('produto', 'variante')`);
    } else if ((TIPOS_SALDO as readonly string[]).includes(tipo)) {
      where.push('s.tipo = @tipo');
      params.tipo = tipo;
    }

    const filtro = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const extra =
      abaixo === '1' || abaixo === 'true'
        ? 'WHERE quantidade < estoque_minimo'
        : '';

    const wrapped = `
      SELECT * FROM (${SALDO_SELECT} ${filtro})
      ${extra}
    `;
    const total = (
      db.prepare(`SELECT COUNT(*) AS n FROM (${wrapped})`).get(params) as { n: number }
    ).n;
    const rows = db
      .prepare(
        `${wrapped}
         ORDER BY datetime(atualizado_em) DESC, id DESC
         LIMIT @limit OFFSET @offset`,
      )
      .all({
        ...params,
        limit: porPagina,
        offset: (pagina - 1) * porPagina,
      }) as Omit<EstoqueSaldo, 'abaixo_minimo'>[];

    res.json({
      data: rows.map(comAbaixo),
      pagina,
      por_pagina: porPagina,
      total,
      total_paginas: Math.max(1, Math.ceil(total / porPagina)),
    });
  });

  router.get('/movimentos', (req, res) => {
    const pagina = Math.max(1, Number(req.query.pagina ?? 1) || 1);
    const porPagina = Math.min(
      100,
      Math.max(1, Number(req.query.por_pagina ?? 10) || 10),
    );
    const q = String(req.query.q ?? '').trim();
    const tipo = String(req.query.tipo ?? '').trim();
    const saldoId = Number(req.query.saldo_id ?? 0);

    const where: string[] = [];
    const params: Record<string, string | number> = {};
    aplicarEmpresa(where, params, req, 'mv.empresa_id');
    if (q) {
      where.push(
        `(ifnull(mv.motivo,'') LIKE @q OR ifnull(p.nome,'') LIKE @q
          OR ifnull(m.nome,'') LIKE @q OR ifnull(v.sku,'') LIKE @q
          OR ifnull(m.codigo,'') LIKE @q)`,
      );
      params.q = `%${q}%`;
    }
    if ((TIPOS_MOVIMENTO as readonly string[]).includes(tipo)) {
      where.push('mv.tipo = @tipo');
      params.tipo = tipo;
    }
    if (saldoId > 0) {
      where.push('mv.saldo_id = @saldo_id');
      params.saldo_id = saldoId;
    }
    const filtro = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const from = `
      FROM estoque_movimentos mv
      LEFT JOIN estoque_saldos s ON s.id = mv.saldo_id
      LEFT JOIN produtos p ON p.id = mv.produto_id
      LEFT JOIN produto_variantes v ON v.id = mv.variante_id
      LEFT JOIN materias_primas m ON m.id = mv.materia_prima_id
      ${filtro}
    `;
    const total = (
      db.prepare(`SELECT COUNT(*) AS n ${from}`).get(params) as { n: number }
    ).n;
    const data = db
      .prepare(
        `SELECT mv.*,
           CASE WHEN mv.materia_prima_id IS NOT NULL THEN m.nome ELSE p.nome END AS nome,
           CASE
             WHEN mv.materia_prima_id IS NOT NULL THEN m.codigo
             WHEN mv.variante_id IS NOT NULL THEN v.sku
             ELSE p.sku
           END AS codigo
         ${from}
         ORDER BY datetime(mv.criado_em) DESC, mv.id DESC
         LIMIT @limit OFFSET @offset`,
      )
      .all({ ...params, limit: porPagina, offset: (pagina - 1) * porPagina });

    res.json({
      data,
      pagina,
      por_pagina: porPagina,
      total,
      total_paginas: Math.max(1, Math.ceil(total / porPagina)),
    });
  });

  router.get('/:id', (req, res) => {
    const saldo = mapSaldo(Number(req.params.id), empresaDaSessao(req));
    if (!saldo) {
      return res.status(404).json({ erro: 'Saldo de estoque não encontrado' });
    }
    const movimentos = listMovimentosSaldo.all(saldo.id) as EstoqueMovimento[];
    res.json({ ...saldo, movimentos });
  });

  router.post('/movimentos', (req, res) => {
    const parsed = criarMovimentoSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        erro: 'Dados inválidos',
        detalhes: parsed.error.flatten().fieldErrors,
        form: parsed.error.flatten().formErrors,
      });
    }

    const data = parsed.data;
    const empresaId = empresaDaSessao(req);
    const result = db.transaction(() =>
      registrarMovimentoEstoque(db, empresaId, {
        tipo: data.tipo,
        quantidade: data.quantidade,
        variante_id: data.variante_id,
        produto_id: data.produto_id,
        materia_prima_id: data.materia_prima_id,
        motivo: data.motivo ?? null,
        observacoes: data.observacoes ?? null,
      }),
    )();
    if (!result.ok) {
      return res.status(result.status).json({ erro: result.erro });
    }
    const movimento = getMovimento.get(result.movimentoId) as EstoqueMovimento;
    res.status(201).json({
      movimento,
      saldo: mapSaldo(movimento.saldo_id, empresaId),
    });
  });

  return router;
}
