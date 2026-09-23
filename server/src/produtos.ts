import { Router } from 'express';
import { z } from 'zod';
import type { AppDatabase } from './db.js';
import { exigirLimite } from './planos.js';
import { aplicarEmpresa, empresaDaSessao } from './tenant.js';

export const STATUS_PRODUTO = ['ativo', 'inativo'] as const;
export const GENEROS_PRODUTO = [
  'masculino',
  'feminino',
  'unissex',
  'infantil',
] as const;
export const UNIDADES_PRODUTO = ['UN', 'PC', 'PAR', 'KG', 'MT', 'CX'] as const;

export interface ProdutoVariante {
  id: number;
  produto_id: number;
  cor: string;
  tamanho: string;
  sku: string;
  codigo_barras: string | null;
  preco_venda: number | null;
  preco_atacado: number | null;
  preco_custo: number | null;
  estoque_minimo: number | null;
  status: (typeof STATUS_PRODUTO)[number];
  criado_em: string;
  atualizado_em: string;
}

export interface Produto {
  id: number;
  sku: string | null;
  nome: string;
  descricao: string | null;
  categoria: string | null;
  subcategoria: string | null;
  marca: string | null;
  genero: string | null;
  colecao: string | null;
  cores: string[];
  tamanhos: string[];
  codigo_barras: string | null;
  unidade: string;
  preco_venda: number;
  preco_atacado: number;
  preco_custo: number;
  status: (typeof STATUS_PRODUTO)[number];
  estoque_minimo: number;
  imagem: string | null;
  observacoes: string | null;
  criado_em: string;
  atualizado_em: string;
  variantes: ProdutoVariante[];
}

type ProdutoRow = Omit<Produto, 'cores' | 'tamanhos' | 'variantes'> & {
  cores: string;
  tamanhos: string;
};

const textoOpcional = z
  .string()
  .trim()
  .max(200)
  .optional()
  .or(z.literal(''))
  .transform((v) => (v ? v : undefined));

const listaOpcoes = z
  .union([z.array(z.string()), z.string()])
  .optional()
  .transform((v) => {
    if (v === undefined) return undefined;
    const items = Array.isArray(v) ? v : v.split(/[,;]/);
    const unique: string[] = [];
    for (const raw of items) {
      const item = raw.trim();
      if (!item) continue;
      if (item.length > 40) {
        throw new z.ZodError([
          {
            code: 'custom',
            message: 'cada opção deve ter no máximo 40 caracteres',
            path: [],
          },
        ]);
      }
      if (!unique.some((u) => u.toLowerCase() === item.toLowerCase())) {
        unique.push(item);
      }
    }
    return unique;
  });

const preco = z.number().min(0, 'preço não pode ser negativo');
const estoqueMin = z
  .number()
  .int('estoque_minimo deve ser inteiro')
  .min(0, 'estoque_minimo não pode ser negativo');

const varianteInputSchema = z.object({
  id: z.number().int().positive().optional(),
  cor: z.string().trim().min(1).max(40),
  tamanho: z.string().trim().min(1).max(40),
  sku: z.string().trim().min(1).max(80).optional(),
  codigo_barras: textoOpcional,
  preco_venda: preco.optional().nullable(),
  preco_atacado: preco.optional().nullable(),
  preco_custo: preco.optional().nullable(),
  estoque_minimo: estoqueMin.optional().nullable(),
  status: z.enum(STATUS_PRODUTO).optional(),
});

const produtoBaseSchema = z.object({
  sku: textoOpcional,
  nome: z.string().trim().min(1, 'nome é obrigatório').max(200),
  descricao: z
    .string()
    .trim()
    .max(4000)
    .optional()
    .or(z.literal(''))
    .transform((v) => (v ? v : undefined)),
  categoria: textoOpcional,
  subcategoria: textoOpcional,
  marca: textoOpcional,
  genero: z
    .string()
    .trim()
    .optional()
    .or(z.literal(''))
    .transform((v) => (v ? v.toLowerCase() : undefined))
    .refine(
      (v) => v === undefined || (GENEROS_PRODUTO as readonly string[]).includes(v),
      'gênero inválido',
    ),
  colecao: textoOpcional,
  cores: listaOpcoes,
  tamanhos: listaOpcoes,
  codigo_barras: textoOpcional,
  unidade: z
    .string()
    .trim()
    .max(10)
    .optional()
    .or(z.literal(''))
    .transform((v) => (v ? v.toUpperCase() : undefined)),
  preco_venda: preco.optional(),
  preco_atacado: preco.optional(),
  preco_custo: preco.optional(),
  status: z.enum(STATUS_PRODUTO).optional(),
  estoque_minimo: estoqueMin.optional(),
  imagem: z
    .string()
    .trim()
    .max(1_500_000, 'imagem muito grande')
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
  variantes: z.array(varianteInputSchema).optional(),
});

const criarProdutoSchema = produtoBaseSchema;
const atualizarProdutoSchema = produtoBaseSchema.partial().refine(
  (body) => Object.keys(body).length > 0,
  { message: 'Informe ao menos um campo para atualizar' },
);
const atualizarStatusSchema = z.object({
  status: z.enum(STATUS_PRODUTO),
});
const criarVarianteSchema = varianteInputSchema;
const atualizarVarianteSchema = varianteInputSchema.partial().refine(
  (body) => Object.keys(body).length > 0,
  { message: 'Informe ao menos um campo para atualizar' },
);

function nulo(valor: string | undefined): string | null {
  return valor === undefined ? null : valor;
}

function slug(valor: string): string {
  return valor
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '')
    .slice(0, 16);
}

function parseJsonList(raw: string | null | undefined): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed)
      ? parsed.map((item) => String(item).trim()).filter(Boolean)
      : [];
  } catch {
    return [];
  }
}

function mapProduto(row: ProdutoRow, variantes: ProdutoVariante[]): Produto {
  return {
    ...row,
    cores: parseJsonList(row.cores),
    tamanhos: parseJsonList(row.tamanhos),
    variantes,
  };
}

function erroDuplicidade(err: unknown): boolean {
  return err instanceof Error && /UNIQUE/i.test(err.message);
}

class ConflitoCadastro extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ConflitoCadastro';
  }
}

function isConflito(err: unknown): err is ConflitoCadastro {
  return err instanceof ConflitoCadastro;
}

function skuUsado(
  db: AppDatabase,
  empresaId: number,
  sku: string,
  ignore?: { produtoId?: number; varianteId?: number },
): boolean {
  const produto = db
    .prepare(
      `SELECT id FROM produtos WHERE empresa_id = ? AND lower(sku) = lower(?) AND id != ? LIMIT 1`,
    )
    .get(empresaId, sku, ignore?.produtoId ?? 0) as { id: number } | undefined;
  if (produto) return true;
  const variante = db
    .prepare(
      `SELECT v.id FROM produto_variantes v
        JOIN produtos p ON p.id = v.produto_id
       WHERE p.empresa_id = ? AND lower(v.sku) = lower(?) AND v.id != ? LIMIT 1`,
    )
    .get(empresaId, sku, ignore?.varianteId ?? 0) as { id: number } | undefined;
  return Boolean(variante);
}

function barcodeUsado(
  db: AppDatabase,
  empresaId: number,
  codigo: string,
  ignore?: { produtoId?: number; varianteId?: number },
): boolean {
  const produto = db
    .prepare(
      `SELECT id FROM produtos WHERE empresa_id = ? AND codigo_barras = ? AND id != ? LIMIT 1`,
    )
    .get(empresaId, codigo, ignore?.produtoId ?? 0) as { id: number } | undefined;
  if (produto) return true;
  const variante = db
    .prepare(
      `SELECT v.id FROM produto_variantes v
        JOIN produtos p ON p.id = v.produto_id
       WHERE p.empresa_id = ? AND v.codigo_barras = ? AND v.id != ? LIMIT 1`,
    )
    .get(empresaId, codigo, ignore?.varianteId ?? 0) as { id: number } | undefined;
  return Boolean(variante);
}

function skuUnico(
  db: AppDatabase,
  empresaId: number,
  candidato: string,
  ignore?: { produtoId?: number; varianteId?: number },
): string {
  const sku = candidato || 'PROD';
  if (!skuUsado(db, empresaId, sku, ignore)) return sku;
  let n = 2;
  while (skuUsado(db, empresaId, `${candidato}${n}`, ignore)) n += 1;
  return `${candidato}${n}`;
}

function barcodeUnico(
  db: AppDatabase,
  empresaId: number,
  candidato: string | undefined,
  ignore?: { produtoId?: number; varianteId?: number },
): string | null {
  if (!candidato) return null;
  if (!barcodeUsado(db, empresaId, candidato, ignore)) return candidato;
  let n = 2;
  while (barcodeUsado(db, empresaId, `${candidato}-${n}`, ignore)) n += 1;
  return `${candidato}-${n}`;
}

function combinacoes(cores: string[], tamanhos: string[]): { cor: string; tamanho: string }[] {
  if (!cores.length || !tamanhos.length) return [];
  const out: { cor: string; tamanho: string }[] = [];
  for (const cor of cores) {
    for (const tamanho of tamanhos) {
      out.push({ cor, tamanho });
    }
  }
  return out;
}

export function createProdutosRouter(db: AppDatabase): Router {
  const router = Router();

  const getStmt = db.prepare('SELECT * FROM produtos WHERE id = ? AND empresa_id = ?');
  const listVariantesStmt = db.prepare(
    `SELECT * FROM produto_variantes WHERE produto_id = ? ORDER BY cor, tamanho, id`,
  );
  const getVarianteStmt = db.prepare(
    'SELECT * FROM produto_variantes WHERE id = ? AND produto_id = ?',
  );
  const countVinculosProdutoStmt = db.prepare(
    `SELECT
        (SELECT COUNT(*) FROM ordens_producao
          WHERE produto_id = ?
             OR variante_id IN (SELECT id FROM produto_variantes WHERE produto_id = ?)
             OR lower(trim(produto)) = lower(trim(?)))
      + (SELECT COUNT(*) FROM pedido_itens
          WHERE produto_id = ?
             OR variante_id IN (SELECT id FROM produto_variantes WHERE produto_id = ?)) AS n`,
  );
  const countVinculosVarianteStmt = db.prepare(
    `SELECT
        (SELECT COUNT(*) FROM ordens_producao
          WHERE variante_id = ?
             OR (produto_id = ? AND lower(trim(tamanho)) = lower(trim(?))))
      + (SELECT COUNT(*) FROM pedido_itens WHERE variante_id = ?) AS n`,
  );

  function carregarProduto(id: number, empresaId: number): Produto | undefined {
    const row = getStmt.get(id, empresaId) as ProdutoRow | undefined;
    if (!row) return undefined;
    return mapProduto(row, listVariantesStmt.all(id) as ProdutoVariante[]);
  }

  function camposProduto(
    data: Partial<z.infer<typeof produtoBaseSchema>>,
    parciais = false,
  ) {
    const row: Record<string, string | number | null> = {};
    if (!parciais || data.sku !== undefined) row.sku = nulo(data.sku);
    if (!parciais || data.nome !== undefined) row.nome = data.nome ?? '';
    if (!parciais || data.descricao !== undefined) row.descricao = nulo(data.descricao);
    if (!parciais || data.categoria !== undefined) row.categoria = nulo(data.categoria);
    if (!parciais || data.subcategoria !== undefined) {
      row.subcategoria = nulo(data.subcategoria);
    }
    if (!parciais || data.marca !== undefined) row.marca = nulo(data.marca);
    if (!parciais || data.genero !== undefined) row.genero = nulo(data.genero);
    if (!parciais || data.colecao !== undefined) row.colecao = nulo(data.colecao);
    if (!parciais || data.cores !== undefined) {
      row.cores = JSON.stringify(data.cores ?? []);
    }
    if (!parciais || data.tamanhos !== undefined) {
      row.tamanhos = JSON.stringify(data.tamanhos ?? []);
    }
    if (!parciais || data.codigo_barras !== undefined) {
      row.codigo_barras = nulo(data.codigo_barras);
    }
    if (!parciais || data.unidade !== undefined) row.unidade = data.unidade ?? 'UN';
    if (!parciais || data.preco_venda !== undefined) {
      row.preco_venda = data.preco_venda ?? 0;
    }
    if (!parciais || data.preco_atacado !== undefined) {
      row.preco_atacado = data.preco_atacado ?? 0;
    }
    if (!parciais || data.preco_custo !== undefined) {
      row.preco_custo = data.preco_custo ?? 0;
    }
    if (!parciais || data.status !== undefined) row.status = data.status ?? 'ativo';
    if (!parciais || data.estoque_minimo !== undefined) {
      row.estoque_minimo = data.estoque_minimo ?? 0;
    }
    if (!parciais || data.imagem !== undefined) row.imagem = nulo(data.imagem);
    if (!parciais || data.observacoes !== undefined) {
      row.observacoes = nulo(data.observacoes);
    }
    return row;
  }

  function gerarVariantes(
    produtoId: number,
    empresaId: number,
    cores: string[],
    tamanhos: string[],
    baseSku: string | undefined,
    baseBarcode: string | undefined,
    overrides: z.infer<typeof varianteInputSchema>[] = [],
  ) {
    const existentes = listVariantesStmt.all(produtoId) as ProdutoVariante[];
    const overrideMap = new Map(
      overrides.map((item) => [`${item.cor.toLowerCase()}|${item.tamanho.toLowerCase()}`, item]),
    );

    const insert = db.prepare(
      `INSERT INTO produto_variantes (
         empresa_id, produto_id, cor, tamanho, sku, codigo_barras, preco_venda, preco_atacado,
         preco_custo, estoque_minimo, status
       ) VALUES (
         @empresa_id, @produto_id, @cor, @tamanho, @sku, @codigo_barras, @preco_venda, @preco_atacado,
         @preco_custo, @estoque_minimo, @status
       )`,
    );
    const update = db.prepare(
      `UPDATE produto_variantes SET
         sku = @sku,
         codigo_barras = @codigo_barras,
         preco_venda = @preco_venda,
         preco_atacado = @preco_atacado,
         preco_custo = @preco_custo,
         estoque_minimo = @estoque_minimo,
         status = @status,
         atualizado_em = datetime('now')
       WHERE id = @id`,
    );

    for (const combo of combinacoes(cores, tamanhos)) {
      const key = `${combo.cor.toLowerCase()}|${combo.tamanho.toLowerCase()}`;
      const override = overrideMap.get(key);
      const atual = existentes.find(
        (v) =>
          v.cor.toLowerCase() === combo.cor.toLowerCase() &&
          v.tamanho.toLowerCase() === combo.tamanho.toLowerCase(),
      );
      const skuCand =
        override?.sku ||
        atual?.sku ||
        [baseSku || 'PROD', slug(combo.cor) || 'COR', slug(combo.tamanho) || 'TAM'].join('-');
      if (override?.sku && skuUsado(db, empresaId, override.sku, { produtoId, varianteId: atual?.id })) {
        throw new ConflitoCadastro('SKU já cadastrado');
      }
      const sku = skuUnico(db, empresaId, skuCand, {
        produtoId,
        varianteId: atual?.id,
      });
      const barcodeCand =
        override?.codigo_barras ||
        atual?.codigo_barras ||
        (baseBarcode
          ? `${baseBarcode}-${slug(combo.cor)}${slug(combo.tamanho)}`
          : undefined);
      if (
        override?.codigo_barras &&
        barcodeUsado(db, empresaId, override.codigo_barras, { produtoId, varianteId: atual?.id })
      ) {
        throw new ConflitoCadastro('Código de barras já cadastrado');
      }
      const codigo_barras = barcodeUnico(db, empresaId, barcodeCand || undefined, {
        produtoId,
        varianteId: atual?.id,
      });

      if (atual) {
        if (!override) continue;
        update.run({
          id: atual.id,
          sku,
          codigo_barras,
          preco_venda: override.preco_venda ?? atual.preco_venda,
          preco_atacado: override.preco_atacado ?? atual.preco_atacado,
          preco_custo: override.preco_custo ?? atual.preco_custo,
          estoque_minimo: override.estoque_minimo ?? atual.estoque_minimo,
          status: override.status ?? atual.status,
        });
      } else {
        insert.run({
          empresa_id: empresaId,
          produto_id: produtoId,
          cor: combo.cor,
          tamanho: combo.tamanho,
          sku,
          codigo_barras,
          preco_venda: override?.preco_venda ?? null,
          preco_atacado: override?.preco_atacado ?? null,
          preco_custo: override?.preco_custo ?? null,
          estoque_minimo: override?.estoque_minimo ?? null,
          status: override?.status ?? 'ativo',
        });
      }
    }
  }

  router.get('/', (req, res) => {
    const pagina = Math.max(1, Number(req.query.pagina ?? req.query.page ?? 1) || 1);
    const porPagina = Math.min(
      100,
      Math.max(1, Number(req.query.por_pagina ?? req.query.pageSize ?? 10) || 10),
    );
    const q = String(req.query.q ?? '').trim();
    const status = String(req.query.status ?? '').trim();
    const categoria = String(req.query.categoria ?? '').trim();
    const marca = String(req.query.marca ?? '').trim();
    const genero = String(req.query.genero ?? '').trim().toLowerCase();
    const colecao = String(req.query.colecao ?? '').trim();

    const where: string[] = [];
    const params: Record<string, string | number> = {};
    aplicarEmpresa(where, params, req, 'p.empresa_id');

    if (q) {
      where.push(
        `(p.nome LIKE @q OR ifnull(p.sku,'') LIKE @q OR ifnull(p.codigo_barras,'') LIKE @q
          OR ifnull(p.categoria,'') LIKE @q OR ifnull(p.marca,'') LIKE @q
          OR ifnull(p.colecao,'') LIKE @q OR ifnull(p.descricao,'') LIKE @q
          OR EXISTS (
            SELECT 1 FROM produto_variantes v
            WHERE v.produto_id = p.id
              AND (v.sku LIKE @q OR ifnull(v.codigo_barras,'') LIKE @q
                   OR v.cor LIKE @q OR v.tamanho LIKE @q)
          ))`,
      );
      params.q = `%${q}%`;
    }
    if (status && (STATUS_PRODUTO as readonly string[]).includes(status)) {
      where.push('p.status = @status');
      params.status = status;
    }
    if (categoria) {
      where.push('p.categoria LIKE @categoria');
      params.categoria = `%${categoria}%`;
    }
    if (marca) {
      where.push('p.marca LIKE @marca');
      params.marca = `%${marca}%`;
    }
    if (genero && (GENEROS_PRODUTO as readonly string[]).includes(genero)) {
      where.push('p.genero = @genero');
      params.genero = genero;
    }
    if (colecao) {
      where.push('p.colecao LIKE @colecao');
      params.colecao = `%${colecao}%`;
    }

    const filtro = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const total = (
      db.prepare(`SELECT COUNT(*) AS n FROM produtos p ${filtro}`).get(params) as {
        n: number;
      }
    ).n;
    const rows = db
      .prepare(
        `SELECT p.* FROM produtos p ${filtro}
         ORDER BY datetime(p.atualizado_em) DESC, p.id DESC
         LIMIT @limit OFFSET @offset`,
      )
      .all({ ...params, limit: porPagina, offset: (pagina - 1) * porPagina }) as ProdutoRow[];

    const data = rows.map((row) =>
      mapProduto(row, listVariantesStmt.all(row.id) as ProdutoVariante[]),
    );

    res.json({
      data,
      pagina,
      por_pagina: porPagina,
      total,
      total_paginas: Math.max(1, Math.ceil(total / porPagina)),
    });
  });

  router.get('/:id', (req, res) => {
    const produto = carregarProduto(Number(req.params.id), empresaDaSessao(req));
    if (!produto) {
      return res.status(404).json({ erro: 'Produto não encontrado' });
    }
    res.json(produto);
  });

  router.post('/', exigirLimite(db, 'produtos'), (req, res) => {
    const parsed = criarProdutoSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        erro: 'Dados inválidos',
        detalhes: parsed.error.flatten().fieldErrors,
      });
    }

    const data = parsed.data;
    const empresaId = empresaDaSessao(req);
    if (data.sku && skuUsado(db, empresaId, data.sku)) {
      return res.status(409).json({ erro: 'SKU já cadastrado' });
    }
    if (data.codigo_barras && barcodeUsado(db, empresaId, data.codigo_barras)) {
      return res.status(409).json({ erro: 'Código de barras já cadastrado' });
    }

    const row = camposProduto(data);
    const criar = db.transaction(() => {
      const info = db
        .prepare(
          `INSERT INTO produtos (
             empresa_id, sku, nome, descricao, categoria, subcategoria, marca, genero, colecao,
             cores, tamanhos, codigo_barras, unidade, preco_venda, preco_atacado,
             preco_custo, status, estoque_minimo, imagem, observacoes
           ) VALUES (
             @empresa_id, @sku, @nome, @descricao, @categoria, @subcategoria, @marca, @genero, @colecao,
             @cores, @tamanhos, @codigo_barras, @unidade, @preco_venda, @preco_atacado,
             @preco_custo, @status, @estoque_minimo, @imagem, @observacoes
           )`,
        )
        .run({ ...row, empresa_id: empresaId });
      const id = Number(info.lastInsertRowid);
      const cores = data.cores ?? [];
      const tamanhos = data.tamanhos ?? [];
      gerarVariantes(
        id,
        empresaId,
        cores,
        tamanhos,
        data.sku || slug(data.nome),
        data.codigo_barras,
        data.variantes ?? [],
      );
      return id;
    });

    try {
      const id = criar();
      res.status(201).json(carregarProduto(id, empresaId));
    } catch (err) {
      if (isConflito(err)) {
        return res.status(409).json({ erro: err.message });
      }
      if (erroDuplicidade(err)) {
        return res.status(409).json({ erro: 'SKU ou código de barras já cadastrado' });
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
        `UPDATE produtos SET status = @status, atualizado_em = datetime('now')
          WHERE id = @id AND empresa_id = @empresa_id`,
      )
      .run({ id, empresa_id: empresaId, status: parsed.data.status });
    if (info.changes === 0) {
      return res.status(404).json({ erro: 'Produto não encontrado' });
    }
    res.json(carregarProduto(id, empresaId));
  });

  router.post('/:id/variantes', (req, res) => {
    const parsed = criarVarianteSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        erro: 'Dados inválidos',
        detalhes: parsed.error.flatten().fieldErrors,
      });
    }
    const empresaId = empresaDaSessao(req);
    const produto = carregarProduto(Number(req.params.id), empresaId);
    if (!produto) {
      return res.status(404).json({ erro: 'Produto não encontrado' });
    }
    const data = parsed.data;
    if (
      produto.variantes.some(
        (v) =>
          v.cor.toLowerCase() === data.cor.toLowerCase() &&
          v.tamanho.toLowerCase() === data.tamanho.toLowerCase(),
      )
    ) {
      return res.status(409).json({ erro: 'Variante de cor e tamanho já existe' });
    }
    const skuCand =
      data.sku ||
      [produto.sku || slug(produto.nome), slug(data.cor) || 'COR', slug(data.tamanho) || 'TAM'].join(
        '-',
      );
    if (skuUsado(db, empresaId, data.sku || skuCand, { produtoId: produto.id })) {
      if (data.sku) return res.status(409).json({ erro: 'SKU já cadastrado' });
    }
    if (data.codigo_barras && barcodeUsado(db, empresaId, data.codigo_barras, { produtoId: produto.id })) {
      return res.status(409).json({ erro: 'Código de barras já cadastrado' });
    }

    try {
      const sku = skuUnico(db, empresaId, skuCand, { produtoId: produto.id });
      const codigo_barras = barcodeUnico(
        db,
        empresaId,
        data.codigo_barras ||
          (produto.codigo_barras
            ? `${produto.codigo_barras}-${slug(data.cor)}${slug(data.tamanho)}`
            : undefined),
        { produtoId: produto.id },
      );
      db.prepare(
        `INSERT INTO produto_variantes (
           empresa_id, produto_id, cor, tamanho, sku, codigo_barras, preco_venda, preco_atacado,
           preco_custo, estoque_minimo, status
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(
        empresaId,
        produto.id,
        data.cor,
        data.tamanho,
        sku,
        codigo_barras,
        data.preco_venda ?? null,
        data.preco_atacado ?? null,
        data.preco_custo ?? null,
        data.estoque_minimo ?? null,
        data.status ?? 'ativo',
      );

      const cores = produto.cores.some((c) => c.toLowerCase() === data.cor.toLowerCase())
        ? produto.cores
        : [...produto.cores, data.cor];
      const tamanhos = produto.tamanhos.some(
        (t) => t.toLowerCase() === data.tamanho.toLowerCase(),
      )
        ? produto.tamanhos
        : [...produto.tamanhos, data.tamanho];
      db.prepare(
        `UPDATE produtos SET cores = ?, tamanhos = ?, atualizado_em = datetime('now')
          WHERE id = ? AND empresa_id = ?`,
      ).run(JSON.stringify(cores), JSON.stringify(tamanhos), produto.id, empresaId);

      res.status(201).json(carregarProduto(produto.id, empresaId));
    } catch (err) {
      if (erroDuplicidade(err)) {
        return res.status(409).json({ erro: 'SKU ou código de barras já cadastrado' });
      }
      throw err;
    }
  });

  router.patch('/:id/variantes/:varianteId', (req, res) => {
    const parsed = atualizarVarianteSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        erro: 'Dados inválidos',
        detalhes: parsed.error.flatten().fieldErrors,
      });
    }
    const produtoId = Number(req.params.id);
    const varianteId = Number(req.params.varianteId);
    const empresaId = empresaDaSessao(req);
    if (!carregarProduto(produtoId, empresaId)) {
      return res.status(404).json({ erro: 'Produto não encontrado' });
    }
    const atual = getVarianteStmt.get(varianteId, produtoId) as ProdutoVariante | undefined;
    if (!atual) {
      return res.status(404).json({ erro: 'Variante não encontrada' });
    }
    const data = parsed.data;
    const sku = data.sku ?? atual.sku;
    const codigo_barras =
      data.codigo_barras !== undefined ? nulo(data.codigo_barras) : atual.codigo_barras;
    if (skuUsado(db, empresaId, sku, { produtoId, varianteId })) {
      return res.status(409).json({ erro: 'SKU já cadastrado' });
    }
    if (codigo_barras && barcodeUsado(db, empresaId, codigo_barras, { produtoId, varianteId })) {
      return res.status(409).json({ erro: 'Código de barras já cadastrado' });
    }

    const row: Record<string, string | number | null> = { id: varianteId };
    if (data.cor !== undefined) row.cor = data.cor;
    if (data.tamanho !== undefined) row.tamanho = data.tamanho;
    if (data.sku !== undefined) row.sku = data.sku;
    if (data.codigo_barras !== undefined) row.codigo_barras = nulo(data.codigo_barras);
    if (data.preco_venda !== undefined) row.preco_venda = data.preco_venda;
    if (data.preco_atacado !== undefined) row.preco_atacado = data.preco_atacado;
    if (data.preco_custo !== undefined) row.preco_custo = data.preco_custo;
    if (data.estoque_minimo !== undefined) row.estoque_minimo = data.estoque_minimo;
    if (data.status !== undefined) row.status = data.status;
    const sets = Object.keys(row)
      .filter((key) => key !== 'id')
      .map((key) => `${key} = @${key}`)
      .join(', ');

    try {
      db.prepare(
        `UPDATE produto_variantes SET ${sets}, atualizado_em = datetime('now')
          WHERE id = @id AND empresa_id = @empresa_id`,
      ).run({ ...row, empresa_id: empresaId });
      db.prepare(
        `UPDATE produtos SET atualizado_em = datetime('now') WHERE id = ? AND empresa_id = ?`,
      ).run(produtoId, empresaId);
      res.json(carregarProduto(produtoId, empresaId));
    } catch (err) {
      if (erroDuplicidade(err)) {
        return res.status(409).json({ erro: 'SKU, código de barras ou combinação já cadastrada' });
      }
      throw err;
    }
  });

  router.delete('/:id/variantes/:varianteId', (req, res) => {
    const produtoId = Number(req.params.id);
    const varianteId = Number(req.params.varianteId);
    const empresaId = empresaDaSessao(req);
    if (!carregarProduto(produtoId, empresaId)) {
      return res.status(404).json({ erro: 'Produto não encontrado' });
    }
    const atual = getVarianteStmt.get(varianteId, produtoId) as ProdutoVariante | undefined;
    if (!atual) {
      return res.status(404).json({ erro: 'Variante não encontrada' });
    }
    const vinculos = countVinculosVarianteStmt.get(varianteId, produtoId, atual.tamanho, varianteId) as {
      n: number;
    };
    if (vinculos.n > 0) {
      return res.status(409).json({
        erro: 'Variante possui ordens de produção vinculadas e não pode ser excluída',
        vinculos: vinculos.n,
      });
    }
    db.prepare('DELETE FROM produto_variantes WHERE id = ? AND empresa_id = ?').run(
      varianteId,
      empresaId,
    );
    db.prepare(
      `UPDATE produtos SET atualizado_em = datetime('now') WHERE id = ? AND empresa_id = ?`,
    ).run(produtoId, empresaId);
    res.status(204).send();
  });

  router.patch('/:id', (req, res) => {
    const parsed = atualizarProdutoSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        erro: 'Dados inválidos',
        detalhes: parsed.error.flatten().fieldErrors,
      });
    }

    const id = Number(req.params.id);
    const empresaId = empresaDaSessao(req);
    const atual = carregarProduto(id, empresaId);
    if (!atual) {
      return res.status(404).json({ erro: 'Produto não encontrado' });
    }

    const data = parsed.data;
    if (data.sku && skuUsado(db, empresaId, data.sku, { produtoId: id })) {
      return res.status(409).json({ erro: 'SKU já cadastrado' });
    }
    if (data.codigo_barras && barcodeUsado(db, empresaId, data.codigo_barras, { produtoId: id })) {
      return res.status(409).json({ erro: 'Código de barras já cadastrado' });
    }

    const row = camposProduto(data, true);
    const sets = Object.keys(row)
      .map((key) => `${key} = @${key}`)
      .join(', ');

    try {
      const aplicar = db.transaction(() => {
        if (sets) {
          db.prepare(
            `UPDATE produtos SET ${sets}, atualizado_em = datetime('now')
              WHERE id = @id AND empresa_id = @empresa_id`,
          ).run({ ...row, id, empresa_id: empresaId });
        }
        const atualizado = carregarProduto(id, empresaId)!;
        gerarVariantes(
          id,
          empresaId,
          atualizado.cores,
          atualizado.tamanhos,
          atualizado.sku || slug(atualizado.nome),
          atualizado.codigo_barras || undefined,
          data.variantes,
        );
      });
      aplicar();
      res.json(carregarProduto(id, empresaId));
    } catch (err) {
      if (isConflito(err)) {
        return res.status(409).json({ erro: err.message });
      }
      if (erroDuplicidade(err)) {
        return res.status(409).json({ erro: 'SKU ou código de barras já cadastrado' });
      }
      throw err;
    }
  });

  router.delete('/:id', (req, res) => {
    const id = Number(req.params.id);
    const empresaId = empresaDaSessao(req);
    const produto = carregarProduto(id, empresaId);
    if (!produto) {
      return res.status(404).json({ erro: 'Produto não encontrado' });
    }

    const vinculos = countVinculosProdutoStmt.get(id, id, produto.nome, id, id) as { n: number };
    if (vinculos.n > 0) {
      return res.status(409).json({
        erro: 'Produto possui ordens de produção vinculadas e não pode ser excluído',
        vinculos: vinculos.n,
      });
    }

    db.prepare('DELETE FROM produtos WHERE id = ? AND empresa_id = ?').run(id, empresaId);
    res.status(204).send();
  });

  return router;
}
