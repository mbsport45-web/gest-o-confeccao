import { Router } from 'express';
import { z } from 'zod';
import type { AppDatabase } from './db.js';
import { exigirLimite } from './planos.js';
import { aplicarEmpresa, empresaDaSessao } from './tenant.js';

export const STATUS_MATERIA = ['ativo', 'inativo'] as const;
export const TIPOS_MATERIA = [
  'tecido',
  'linha',
  'aviamento',
  'forro',
  'etiqueta',
  'botao',
  'ziper',
  'elastico',
  'outro',
] as const;
export const UNIDADES_MATERIA = ['UN', 'PC', 'MT', 'KG', 'ROLO', 'CX'] as const;

export interface MateriaPrima {
  id: number;
  codigo: string | null;
  nome: string;
  descricao: string | null;
  tipo: (typeof TIPOS_MATERIA)[number];
  categoria: string | null;
  cor: string | null;
  composicao: string | null;
  largura_cm: number | null;
  gramatura: number | null;
  unidade: string;
  custo: number;
  estoque_minimo: number;
  fornecedor: string | null;
  referencia_fornecedor: string | null;
  ncm: string | null;
  status: (typeof STATUS_MATERIA)[number];
  observacoes: string | null;
  criado_em: string;
  atualizado_em: string;
}

const textoOpcional = z
  .string()
  .trim()
  .max(200)
  .optional()
  .or(z.literal(''))
  .transform((v) => (v ? v : undefined));

const numeroNaoNegativo = z
  .number()
  .min(0, 'valor não pode ser negativo')
  .optional();

const materiaBaseSchema = z.object({
  codigo: textoOpcional,
  nome: z.string().trim().min(1, 'nome é obrigatório').max(200),
  descricao: z
    .string()
    .trim()
    .max(4000)
    .optional()
    .or(z.literal(''))
    .transform((v) => (v ? v : undefined)),
  tipo: z.enum(TIPOS_MATERIA).optional(),
  categoria: textoOpcional,
  cor: textoOpcional,
  composicao: z
    .string()
    .trim()
    .max(300)
    .optional()
    .or(z.literal(''))
    .transform((v) => (v ? v : undefined)),
  largura_cm: numeroNaoNegativo.nullable(),
  gramatura: numeroNaoNegativo.nullable(),
  unidade: z
    .string()
    .trim()
    .max(10)
    .optional()
    .or(z.literal(''))
    .transform((v) => (v ? v.toUpperCase() : undefined)),
  custo: z.number().min(0, 'custo não pode ser negativo').optional(),
  estoque_minimo: z.number().min(0, 'estoque_minimo não pode ser negativo').optional(),
  fornecedor: textoOpcional,
  referencia_fornecedor: textoOpcional,
  ncm: z
    .string()
    .trim()
    .optional()
    .or(z.literal(''))
    .transform((v) => (v ? v.replace(/\D/g, '') : undefined))
    .refine((v) => v === undefined || v.length === 8, 'NCM deve ter 8 dígitos'),
  status: z.enum(STATUS_MATERIA).optional(),
  observacoes: z
    .string()
    .trim()
    .max(2000)
    .optional()
    .or(z.literal(''))
    .transform((v) => (v ? v : undefined)),
});

const criarMateriaSchema = materiaBaseSchema;
const atualizarMateriaSchema = materiaBaseSchema.partial().refine(
  (body) => Object.keys(body).length > 0,
  { message: 'Informe ao menos um campo para atualizar' },
);
const atualizarStatusSchema = z.object({
  status: z.enum(STATUS_MATERIA),
});

function nulo(valor: string | undefined): string | null {
  return valor === undefined ? null : valor;
}

function erroDuplicidade(err: unknown): boolean {
  return err instanceof Error && /UNIQUE/i.test(err.message);
}

function tabelaExiste(db: AppDatabase, nome: string): boolean {
  const row = db
    .prepare(`SELECT 1 AS ok FROM sqlite_master WHERE type = 'table' AND name = ?`)
    .get(nome) as { ok: number } | undefined;
  return Boolean(row);
}

function countVinculos(db: AppDatabase, id: number): number {
  let total = 0;
  const futuros: Array<{ tabela: string; coluna: string }> = [
    { tabela: 'ficha_tecnica_itens', coluna: 'materia_prima_id' },
    { tabela: 'estoque_movimentos', coluna: 'materia_prima_id' },
    { tabela: 'pedido_compra_itens', coluna: 'materia_prima_id' },
  ];
  for (const { tabela, coluna } of futuros) {
    if (!tabelaExiste(db, tabela)) continue;
    const row = db
      .prepare(`SELECT COUNT(*) AS n FROM ${tabela} WHERE ${coluna} = ?`)
      .get(id) as { n: number };
    total += row.n;
  }
  return total;
}

function camposMateria(
  data: Partial<z.infer<typeof materiaBaseSchema>>,
  parciais = false,
) {
  const row: Record<string, string | number | null> = {};
  if (!parciais || data.codigo !== undefined) row.codigo = nulo(data.codigo);
  if (!parciais || data.nome !== undefined) row.nome = data.nome ?? '';
  if (!parciais || data.descricao !== undefined) row.descricao = nulo(data.descricao);
  if (!parciais || data.tipo !== undefined) row.tipo = data.tipo ?? 'tecido';
  if (!parciais || data.categoria !== undefined) row.categoria = nulo(data.categoria);
  if (!parciais || data.cor !== undefined) row.cor = nulo(data.cor);
  if (!parciais || data.composicao !== undefined) row.composicao = nulo(data.composicao);
  if (!parciais || data.largura_cm !== undefined) {
    row.largura_cm = data.largura_cm === undefined ? null : data.largura_cm;
  }
  if (!parciais || data.gramatura !== undefined) {
    row.gramatura = data.gramatura === undefined ? null : data.gramatura;
  }
  if (!parciais || data.unidade !== undefined) row.unidade = data.unidade ?? 'UN';
  if (!parciais || data.custo !== undefined) row.custo = data.custo ?? 0;
  if (!parciais || data.estoque_minimo !== undefined) {
    row.estoque_minimo = data.estoque_minimo ?? 0;
  }
  if (!parciais || data.fornecedor !== undefined) row.fornecedor = nulo(data.fornecedor);
  if (!parciais || data.referencia_fornecedor !== undefined) {
    row.referencia_fornecedor = nulo(data.referencia_fornecedor);
  }
  if (!parciais || data.ncm !== undefined) row.ncm = nulo(data.ncm);
  if (!parciais || data.status !== undefined) row.status = data.status ?? 'ativo';
  if (!parciais || data.observacoes !== undefined) row.observacoes = nulo(data.observacoes);
  return row;
}

export function createMateriasPrimasRouter(db: AppDatabase): Router {
  const router = Router();
  const getStmt = db.prepare('SELECT * FROM materias_primas WHERE id = ? AND empresa_id = ?');

  router.get('/', (req, res) => {
    const pagina = Math.max(1, Number(req.query.pagina ?? req.query.page ?? 1) || 1);
    const porPagina = Math.min(
      100,
      Math.max(1, Number(req.query.por_pagina ?? req.query.pageSize ?? 10) || 10),
    );
    const q = String(req.query.q ?? '').trim();
    const status = String(req.query.status ?? '').trim();
    const tipo = String(req.query.tipo ?? '').trim();
    const categoria = String(req.query.categoria ?? '').trim();
    const unidade = String(req.query.unidade ?? '').trim().toUpperCase();

    const where: string[] = [];
    const params: Record<string, string | number> = {};
    aplicarEmpresa(where, params, req);

    if (q) {
      where.push(
        `(nome LIKE @q OR ifnull(codigo,'') LIKE @q OR ifnull(cor,'') LIKE @q
          OR ifnull(categoria,'') LIKE @q OR ifnull(fornecedor,'') LIKE @q
          OR ifnull(composicao,'') LIKE @q OR ifnull(descricao,'') LIKE @q)`,
      );
      params.q = `%${q}%`;
    }
    if (status && (STATUS_MATERIA as readonly string[]).includes(status)) {
      where.push('status = @status');
      params.status = status;
    }
    if (tipo && (TIPOS_MATERIA as readonly string[]).includes(tipo)) {
      where.push('tipo = @tipo');
      params.tipo = tipo;
    }
    if (categoria) {
      where.push('categoria LIKE @categoria');
      params.categoria = `%${categoria}%`;
    }
    if (unidade && (UNIDADES_MATERIA as readonly string[]).includes(unidade)) {
      where.push('unidade = @unidade');
      params.unidade = unidade;
    }

    const filtro = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const total = (
      db.prepare(`SELECT COUNT(*) AS n FROM materias_primas ${filtro}`).get(params) as {
        n: number;
      }
    ).n;
    const data = db
      .prepare(
        `SELECT * FROM materias_primas ${filtro}
         ORDER BY datetime(atualizado_em) DESC, id DESC
         LIMIT @limit OFFSET @offset`,
      )
      .all({ ...params, limit: porPagina, offset: (pagina - 1) * porPagina }) as MateriaPrima[];

    res.json({
      data,
      pagina,
      por_pagina: porPagina,
      total,
      total_paginas: Math.max(1, Math.ceil(total / porPagina)),
    });
  });

  router.get('/:id', (req, res) => {
    const materia = getStmt.get(Number(req.params.id), empresaDaSessao(req)) as MateriaPrima | undefined;
    if (!materia) {
      return res.status(404).json({ erro: 'Matéria-prima não encontrada' });
    }
    res.json(materia);
  });

  router.post('/', exigirLimite(db, 'materiais'), (req, res) => {
    const parsed = criarMateriaSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        erro: 'Dados inválidos',
        detalhes: parsed.error.flatten().fieldErrors,
      });
    }

    const row = camposMateria(parsed.data);
    const empresaId = empresaDaSessao(req);
    try {
      const info = db
        .prepare(
          `INSERT INTO materias_primas (
             empresa_id, codigo, nome, descricao, tipo, categoria, cor, composicao, largura_cm,
             gramatura, unidade, custo, estoque_minimo, fornecedor, referencia_fornecedor,
             ncm, status, observacoes
           ) VALUES (
             @empresa_id, @codigo, @nome, @descricao, @tipo, @categoria, @cor, @composicao, @largura_cm,
             @gramatura, @unidade, @custo, @estoque_minimo, @fornecedor, @referencia_fornecedor,
             @ncm, @status, @observacoes
           )`,
        )
        .run({ ...row, empresa_id: empresaId });
      res.status(201).json(getStmt.get(info.lastInsertRowid, empresaId));
    } catch (err) {
      if (erroDuplicidade(err)) {
        return res.status(409).json({ erro: 'Código já cadastrado' });
      }
      throw err;
    }
  });

  router.patch('/:id/status', (req, res) => {
    const parsed = atualizarStatusSchema.safeParse(req.body);
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
          WHERE id = @id AND empresa_id = @empresa_id`,
      )
      .run({ id, empresa_id: empresaId, status: parsed.data.status });
    if (info.changes === 0) {
      return res.status(404).json({ erro: 'Matéria-prima não encontrada' });
    }
    res.json(getStmt.get(id, empresaId));
  });

  router.patch('/:id', (req, res) => {
    const parsed = atualizarMateriaSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        erro: 'Dados inválidos',
        detalhes: parsed.error.flatten().fieldErrors,
      });
    }

    const id = Number(req.params.id);
    const empresaId = empresaDaSessao(req);
    const atual = getStmt.get(id, empresaId) as MateriaPrima | undefined;
    if (!atual) {
      return res.status(404).json({ erro: 'Matéria-prima não encontrada' });
    }

    const row = camposMateria(parsed.data, true);
    const sets = Object.keys(row)
      .map((key) => `${key} = @${key}`)
      .join(', ');
    try {
      db.prepare(
        `UPDATE materias_primas SET ${sets}, atualizado_em = datetime('now')
          WHERE id = @id AND empresa_id = @empresa_id`,
      ).run({ ...row, id, empresa_id: empresaId });
      res.json(getStmt.get(id, empresaId));
    } catch (err) {
      if (erroDuplicidade(err)) {
        return res.status(409).json({ erro: 'Código já cadastrado' });
      }
      throw err;
    }
  });

  router.delete('/:id', (req, res) => {
    const id = Number(req.params.id);
    const empresaId = empresaDaSessao(req);
    const materia = getStmt.get(id, empresaId) as MateriaPrima | undefined;
    if (!materia) {
      return res.status(404).json({ erro: 'Matéria-prima não encontrada' });
    }

    const vinculos = countVinculos(db, id);
    if (vinculos > 0) {
      return res.status(409).json({
        erro: 'Matéria-prima possui vínculos (ficha técnica, estoque ou compras) e não pode ser excluída',
        vinculos,
      });
    }

    db.prepare('DELETE FROM materias_primas WHERE id = ? AND empresa_id = ?').run(id, empresaId);
    res.status(204).send();
  });

  return router;
}
