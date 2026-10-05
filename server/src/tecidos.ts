import { Router } from 'express';
import { z } from 'zod';
import type { AppDatabase } from './db.js';
import { registrarMovimentoEstoque, type TIPOS_MOVIMENTO } from './estoque.js';
import { exigirLimite } from './planos.js';
import { aplicarEmpresa, empresaDaSessao } from './tenant.js';

export const UNIDADES_TECIDO = ['KG', 'METRO'] as const;
export type UnidadeTecido = (typeof UNIDADES_TECIDO)[number];
export const CATEGORIAS_TECIDO_PADRAO = ['Malharia', 'Tecido Plano', 'Sintético'] as const;
export const STATUS_TECIDO = ['ativo', 'inativo'] as const;

const textoOpcional = z
  .string()
  .trim()
  .max(200)
  .optional()
  .or(z.literal(''))
  .transform((v) => (v ? v : undefined));

const numeroOpcional = z.number().min(0, 'valor não pode ser negativo').nullable().optional();

const tecidoSchema = z.object({
  nome: z.string().trim().min(1, 'nome é obrigatório').max(200),
  categoria: z.string().trim().min(1, 'categoria é obrigatória').max(80),
  unidade: z.enum(UNIDADES_TECIDO),
  largura_cm: numeroOpcional,
  gramatura: numeroOpcional,
  custo: z.number().min(0, 'custo não pode ser negativo'),
  fornecedor: textoOpcional,
  cor: textoOpcional,
  estoque_inicial: z.number().min(0, 'estoque inicial não pode ser negativo').optional(),
  estoque_minimo: z.number().min(0, 'estoque mínimo não pode ser negativo').optional(),
  status: z.enum(STATUS_TECIDO).optional(),
});

const atualizarTecidoSchema = tecidoSchema
  .omit({ estoque_inicial: true })
  .partial()
  .refine((body) => Object.keys(body).length > 0, {
    message: 'Informe ao menos um campo para atualizar',
  });

const categoriaSchema = z.object({
  nome: z.string().trim().min(1, 'nome é obrigatório').max(80),
});

const movimentoSchema = z
  .object({
    tipo: z.enum(['entrada', 'saida', 'ajuste']),
    quantidade: z.number().min(0, 'quantidade não pode ser negativa'),
    unidade: z.enum(UNIDADES_TECIDO),
    custo: z.number().min(0, 'custo não pode ser negativo').optional(),
    motivo: textoOpcional,
    referencia_tipo: z
      .string()
      .trim()
      .max(40)
      .optional()
      .or(z.literal(''))
      .transform((v) => (v ? v : undefined)),
    referencia_id: z.number().int().positive().optional(),
  })
  .refine((body) => body.tipo === 'ajuste' || body.quantidade > 0, {
    message: 'quantidade deve ser maior que zero',
    path: ['quantidade'],
  });

const baixaEnfestoSchema = z.object({
  quantidade: z.number().positive('quantidade deve ser maior que zero'),
  referencia_id: z.number().int().positive().optional(),
});

type TecidoRow = {
  id: number;
  nome: string;
  categoria: string | null;
  unidade: string;
  largura_cm: number | null;
  gramatura: number | null;
  custo: number;
  fornecedor: string | null;
  cor: string | null;
  estoque_minimo: number;
  status: (typeof STATUS_TECIDO)[number];
  empresa_id: number;
  criado_em: string;
  atualizado_em: string;
  estoque: number;
};

export type BaixaEnfestoInput = {
  tecido_id: number;
  quantidade: number;
  referencia_id?: number | null;
};

function normCategoria(nome: string): string {
  return nome.trim().toLocaleLowerCase('pt-BR');
}

function garantirCategoriasPadrao(db: AppDatabase, empresaId: number) {
  const inserir = db.prepare(
    `INSERT OR IGNORE INTO tecido_categorias (empresa_id, nome, nome_norm)
     VALUES (@empresa_id, @nome, @nome_norm)`,
  );
  for (const nome of CATEGORIAS_TECIDO_PADRAO) {
    inserir.run({ empresa_id: empresaId, nome, nome_norm: normCategoria(nome) });
  }
}

function obterOuCriarCategoria(db: AppDatabase, empresaId: number, nome: string) {
  const nomeNorm = normCategoria(nome);
  const atual = db
    .prepare(
      'SELECT id, nome FROM tecido_categorias WHERE empresa_id = ? AND nome_norm = ?',
    )
    .get(empresaId, nomeNorm) as { id: number; nome: string } | undefined;
  if (atual) return atual;
  const info = db
    .prepare(
      `INSERT INTO tecido_categorias (empresa_id, nome, nome_norm)
       VALUES (@empresa_id, @nome, @nome_norm)`,
    )
    .run({ empresa_id: empresaId, nome: nome.trim(), nome_norm: nomeNorm });
  return { id: Number(info.lastInsertRowid), nome: nome.trim() };
}

function mapTecido(row: TecidoRow) {
  const unidade = row.unidade === 'METRO' ? 'METRO' : 'KG';
  return {
    id: row.id,
    nome: row.nome,
    categoria: row.categoria,
    unidade,
    unidade_custo: unidade === 'KG' ? 'R$/KG' : 'R$/METRO',
    largura_cm: row.largura_cm,
    gramatura: row.gramatura,
    custo: row.custo,
    fornecedor: row.fornecedor,
    cor: row.cor,
    estoque_minimo: row.estoque_minimo,
    estoque: row.estoque,
    status: row.status,
    empresa_id: row.empresa_id,
    criado_em: row.criado_em,
    atualizado_em: row.atualizado_em,
  };
}

const TECIDO_SELECT = `
  SELECT
    m.id, m.nome, m.categoria, m.unidade, m.largura_cm, m.gramatura, m.custo,
    m.fornecedor, m.cor, m.estoque_minimo, m.status, m.empresa_id,
    m.criado_em, m.atualizado_em,
    ifnull(s.quantidade, 0) AS estoque
  FROM materias_primas m
  LEFT JOIN estoque_saldos s
    ON s.materia_prima_id = m.id AND s.empresa_id = m.empresa_id
`;

function tecidoWhereBase() {
  return `m.tipo = 'tecido' AND m.unidade IN ('KG', 'METRO')`;
}

export function baixarTecidoEnfesto(
  db: AppDatabase,
  empresaId: number,
  usuarioId: number,
  input: BaixaEnfestoInput,
) {
  return movimentarTecido(db, empresaId, usuarioId, input.tecido_id, {
    tipo: 'saida',
    quantidade: input.quantidade,
    motivo: 'Enfesto',
    referencia_tipo: 'enfesto',
    referencia_id: input.referencia_id ?? null,
  });
}

function movimentarTecido(
  db: AppDatabase,
  empresaId: number,
  usuarioId: number,
  tecidoId: number,
  data: {
    tipo: (typeof TIPOS_MOVIMENTO)[number];
    quantidade: number;
    unidade?: UnidadeTecido;
    custo?: number;
    motivo?: string | null;
    referencia_tipo?: string | null;
    referencia_id?: number | null;
  },
) {
  const tecido = db
    .prepare(
      `SELECT id, unidade, custo FROM materias_primas
        WHERE id = ? AND empresa_id = ? AND tipo = 'tecido' AND unidade IN ('KG', 'METRO')`,
    )
    .get(tecidoId, empresaId) as { id: number; unidade: UnidadeTecido; custo: number } | undefined;
  if (!tecido) return { ok: false as const, status: 404, erro: 'Tecido não encontrado' };
  if (data.unidade && data.unidade !== tecido.unidade) {
    return {
      ok: false as const,
      status: 400,
      erro: `A movimentação precisa usar a unidade de controle do tecido (${tecido.unidade})`,
    };
  }
  return registrarMovimentoEstoque(db, empresaId, {
    tipo: data.tipo,
    quantidade: data.quantidade,
    materia_prima_id: tecido.id,
    motivo: data.motivo ?? null,
    unidade: tecido.unidade,
    custo: data.custo ?? tecido.custo,
    usuario_id: usuarioId,
    referencia_tipo: data.referencia_tipo ?? null,
    referencia_id: data.referencia_id ?? null,
  });
}

export function createTecidosRouter(db: AppDatabase): Router {
  const router = Router();

  const getTecido = db.prepare(
    `${TECIDO_SELECT} WHERE m.id = ? AND m.empresa_id = ? AND ${tecidoWhereBase()}`,
  );
  const listarMovimentos = db.prepare(
    `SELECT mv.*, u.nome AS usuario_nome
       FROM estoque_movimentos mv
       LEFT JOIN usuarios u ON u.id = mv.usuario_id
      WHERE mv.materia_prima_id = ? AND mv.empresa_id = ?
      ORDER BY datetime(mv.criado_em) DESC, mv.id DESC`,
  );

  router.get('/categorias', (req, res) => {
    const empresaId = empresaDaSessao(req);
    garantirCategoriasPadrao(db, empresaId);
    const data = db
      .prepare(
        `SELECT id, nome, criado_em FROM tecido_categorias
          WHERE empresa_id = ? ORDER BY nome COLLATE NOCASE`,
      )
      .all(empresaId);
    res.json({ data });
  });

  router.post('/categorias', (req, res) => {
    const parsed = categoriaSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        erro: 'Dados inválidos',
        detalhes: parsed.error.flatten().fieldErrors,
      });
    }
    const empresaId = empresaDaSessao(req);
    const categoria = obterOuCriarCategoria(db, empresaId, parsed.data.nome);
    res.status(201).json(categoria);
  });

  router.get('/', (req, res) => {
    const empresaId = empresaDaSessao(req);
    garantirCategoriasPadrao(db, empresaId);
    const pagina = Math.max(1, Number(req.query.pagina ?? 1) || 1);
    const porPagina = Math.min(100, Math.max(1, Number(req.query.por_pagina ?? 20) || 20));
    const q = String(req.query.q ?? '').trim();
    const categoria = String(req.query.categoria ?? '').trim();
    const unidade = String(req.query.unidade ?? '').trim().toUpperCase();
    const status = String(req.query.status ?? '').trim();

    const where = [tecidoWhereBase()];
    const params: Record<string, string | number> = {};
    aplicarEmpresa(where, params, req, 'm.empresa_id');
    if (q) {
      where.push(
        `(m.nome LIKE @q OR ifnull(m.cor,'') LIKE @q OR ifnull(m.fornecedor,'') LIKE @q OR ifnull(m.categoria,'') LIKE @q)`,
      );
      params.q = `%${q}%`;
    }
    if (categoria) {
      where.push(`lower(ifnull(m.categoria,'')) = lower(@categoria)`);
      params.categoria = categoria;
    }
    if ((UNIDADES_TECIDO as readonly string[]).includes(unidade)) {
      where.push('m.unidade = @unidade');
      params.unidade = unidade;
    }
    if ((STATUS_TECIDO as readonly string[]).includes(status)) {
      where.push('m.status = @status');
      params.status = status;
    }
    const filtro = `WHERE ${where.join(' AND ')}`;
    const total = (
      db.prepare(`SELECT COUNT(*) AS n FROM materias_primas m ${filtro}`).get(params) as { n: number }
    ).n;
    const rows = db
      .prepare(
        `${TECIDO_SELECT} ${filtro}
         ORDER BY m.nome COLLATE NOCASE
         LIMIT @limit OFFSET @offset`,
      )
      .all({ ...params, limit: porPagina, offset: (pagina - 1) * porPagina }) as TecidoRow[];
    res.json({
      data: rows.map(mapTecido),
      pagina,
      por_pagina: porPagina,
      total,
      total_paginas: Math.max(1, Math.ceil(total / porPagina)),
    });
  });

  router.post('/', exigirLimite(db, 'materiais'), (req, res) => {
    const parsed = tecidoSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        erro: 'Dados inválidos',
        detalhes: parsed.error.flatten().fieldErrors,
      });
    }
    const empresaId = empresaDaSessao(req);
    const usuarioId = req.usuario!.id;
    const data = parsed.data;
    const categoria = obterOuCriarCategoria(db, empresaId, data.categoria);
    const estoqueInicial = data.estoque_inicial ?? 0;

    const criado = db.transaction(() => {
      const info = db
        .prepare(
          `INSERT INTO materias_primas (
             empresa_id, nome, tipo, categoria, cor, largura_cm, gramatura,
             unidade, custo, estoque_minimo, fornecedor, status
           ) VALUES (
             @empresa_id, @nome, 'tecido', @categoria, @cor, @largura_cm, @gramatura,
             @unidade, @custo, @estoque_minimo, @fornecedor, @status
           )`,
        )
        .run({
          empresa_id: empresaId,
          nome: data.nome,
          categoria: categoria.nome,
          cor: data.cor ?? null,
          largura_cm: data.largura_cm ?? null,
          gramatura: data.gramatura ?? null,
          unidade: data.unidade,
          custo: data.custo,
          estoque_minimo: data.estoque_minimo ?? 0,
          fornecedor: data.fornecedor ?? null,
          status: data.status ?? 'ativo',
        });
      const id = Number(info.lastInsertRowid);
      if (estoqueInicial > 0) {
        const movimento = movimentarTecido(db, empresaId, usuarioId, id, {
          tipo: 'entrada',
          quantidade: estoqueInicial,
          unidade: data.unidade,
          custo: data.custo,
          motivo: 'Estoque inicial',
          referencia_tipo: 'estoque_inicial',
        });
        if (!movimento.ok) return movimento;
      } else {
        const saldo = db
          .prepare(
            `INSERT INTO estoque_saldos (empresa_id, tipo, materia_prima_id, quantidade)
             VALUES (?, 'materia', ?, 0)`,
          )
          .run(empresaId, id);
        if (!saldo.changes) return { ok: false as const, status: 500, erro: 'Falha ao abrir saldo' };
      }
      return { ok: true as const, id };
    })();

    if (!criado.ok) return res.status(criado.status).json({ erro: criado.erro });
    res.status(201).json(mapTecido(getTecido.get(criado.id, empresaId) as TecidoRow));
  });

  router.get('/:id/movimentos', (req, res) => {
    const empresaId = empresaDaSessao(req);
    const tecido = getTecido.get(Number(req.params.id), empresaId);
    if (!tecido) return res.status(404).json({ erro: 'Tecido não encontrado' });
    res.json({ data: listarMovimentos.all(Number(req.params.id), empresaId) });
  });

  router.post('/:id/movimentos', (req, res) => {
    const parsed = movimentoSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        erro: 'Dados inválidos',
        detalhes: parsed.error.flatten().fieldErrors,
        form: parsed.error.flatten().formErrors,
      });
    }
    const empresaId = empresaDaSessao(req);
    const id = Number(req.params.id);
    const resultado = db.transaction(() =>
      movimentarTecido(db, empresaId, req.usuario!.id, id, parsed.data),
    )();
    if (!resultado.ok) return res.status(resultado.status).json({ erro: resultado.erro });
    const tecido = getTecido.get(id, empresaId) as TecidoRow;
    const movimento = listarMovimentos.all(id, empresaId)[0];
    res.status(201).json({ tecido: mapTecido(tecido), movimento });
  });

  router.post('/:id/baixas-enfesto', (req, res) => {
    const parsed = baixaEnfestoSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        erro: 'Dados inválidos',
        detalhes: parsed.error.flatten().fieldErrors,
      });
    }
    const empresaId = empresaDaSessao(req);
    const id = Number(req.params.id);
    const resultado = db.transaction(() =>
      baixarTecidoEnfesto(db, empresaId, req.usuario!.id, {
        tecido_id: id,
        quantidade: parsed.data.quantidade,
        referencia_id: parsed.data.referencia_id,
      }),
    )();
    if (!resultado.ok) return res.status(resultado.status).json({ erro: resultado.erro });
    const tecido = getTecido.get(id, empresaId) as TecidoRow;
    res.status(201).json({
      tecido: mapTecido(tecido),
      movimento: listarMovimentos.all(id, empresaId)[0],
    });
  });

  router.get('/:id', (req, res) => {
    const row = getTecido.get(Number(req.params.id), empresaDaSessao(req)) as TecidoRow | undefined;
    if (!row) return res.status(404).json({ erro: 'Tecido não encontrado' });
    res.json(mapTecido(row));
  });

  router.patch('/:id/status', (req, res) => {
    const parsed = z.object({ status: z.enum(STATUS_TECIDO) }).safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        erro: 'Dados inválidos',
        detalhes: parsed.error.flatten().fieldErrors,
      });
    }
    const id = Number(req.params.id);
    const empresaId = empresaDaSessao(req);
    const info = db
      .prepare(
        `UPDATE materias_primas SET status = @status, atualizado_em = datetime('now')
          WHERE id = @id AND empresa_id = @empresa_id AND tipo = 'tecido' AND unidade IN ('KG', 'METRO')`,
      )
      .run({ id, empresa_id: empresaId, status: parsed.data.status });
    if (info.changes === 0) return res.status(404).json({ erro: 'Tecido não encontrado' });
    res.json(mapTecido(getTecido.get(id, empresaId) as TecidoRow));
  });

  router.patch('/:id', (req, res) => {
    const parsed = atualizarTecidoSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        erro: 'Dados inválidos',
        detalhes: parsed.error.flatten().fieldErrors,
      });
    }
    const id = Number(req.params.id);
    const empresaId = empresaDaSessao(req);
    const atual = getTecido.get(id, empresaId) as TecidoRow | undefined;
    if (!atual) return res.status(404).json({ erro: 'Tecido não encontrado' });
    const data = parsed.data;
    if (data.unidade && data.unidade !== atual.unidade) {
      const movimentos = (
        db
          .prepare(
            'SELECT COUNT(*) AS n FROM estoque_movimentos WHERE materia_prima_id = ? AND empresa_id = ?',
          )
          .get(id, empresaId) as { n: number }
      ).n;
      if (movimentos > 0 || atual.estoque !== 0) {
        return res.status(409).json({
          erro: 'A unidade de controle não pode mudar depois que o tecido já tem estoque',
        });
      }
    }
    const categoria = data.categoria
      ? obterOuCriarCategoria(db, empresaId, data.categoria).nome
      : atual.categoria;
    db.prepare(
      `UPDATE materias_primas SET
         nome = @nome,
         categoria = @categoria,
         unidade = @unidade,
         largura_cm = @largura_cm,
         gramatura = @gramatura,
         custo = @custo,
         fornecedor = @fornecedor,
         cor = @cor,
         estoque_minimo = @estoque_minimo,
         status = @status,
         atualizado_em = datetime('now')
       WHERE id = @id AND empresa_id = @empresa_id`,
    ).run({
      id,
      empresa_id: empresaId,
      nome: data.nome ?? atual.nome,
      categoria,
      unidade: data.unidade ?? atual.unidade,
      largura_cm: data.largura_cm === undefined ? atual.largura_cm : data.largura_cm,
      gramatura: data.gramatura === undefined ? atual.gramatura : data.gramatura,
      custo: data.custo ?? atual.custo,
      fornecedor: data.fornecedor === undefined ? atual.fornecedor : data.fornecedor,
      cor: data.cor === undefined ? atual.cor : data.cor,
      estoque_minimo: data.estoque_minimo ?? atual.estoque_minimo,
      status: data.status ?? atual.status,
    });
    res.json(mapTecido(getTecido.get(id, empresaId) as TecidoRow));
  });

  router.delete('/:id', (req, res) => {
    const id = Number(req.params.id);
    const empresaId = empresaDaSessao(req);
    const atual = getTecido.get(id, empresaId);
    if (!atual) return res.status(404).json({ erro: 'Tecido não encontrado' });
    const vinculos = (
      db
        .prepare(
          `SELECT
             (SELECT COUNT(*) FROM estoque_movimentos WHERE materia_prima_id = @id AND empresa_id = @empresa_id) +
             (SELECT COUNT(*) FROM produto_bom_itens WHERE materia_prima_id = @id AND empresa_id = @empresa_id) +
             (SELECT COUNT(*) FROM ordem_requisitos WHERE materia_prima_id = @id AND empresa_id = @empresa_id) +
             (SELECT COUNT(*) FROM pedido_compra_itens WHERE materia_prima_id = @id AND empresa_id = @empresa_id)
           AS n`,
        )
        .get({ id, empresa_id: empresaId }) as { n: number }
    ).n;
    if (vinculos > 0) {
      return res.status(409).json({
        erro: 'Tecido possui movimentação ou vínculos e não pode ser excluído',
      });
    }
    db.prepare('DELETE FROM estoque_saldos WHERE materia_prima_id = ? AND empresa_id = ?').run(
      id,
      empresaId,
    );
    db.prepare('DELETE FROM materias_primas WHERE id = ? AND empresa_id = ?').run(id, empresaId);
    res.status(204).send();
  });

  return router;
}
