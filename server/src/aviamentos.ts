import { Router } from 'express';
import { z } from 'zod';
import type { AppDatabase } from './db.js';
import { aplicarEmpresa, empresaDaSessao } from './tenant.js';

export const CATEGORIAS_AVIAMENTO = [
  'cadarco',
  'saquinho',
  'tag',
  'etiqueta_tamanho',
  'adesivo',
] as const;
export const STATUS_AVIAMENTO = ['ativo', 'inativo'] as const;
export const TIPOS_MOVIMENTO_AVIAMENTO = ['entrada', 'saida', 'ajuste'] as const;
export const UNIDADES_AVIAMENTO = ['UN', 'PC', 'MT', 'KG', 'ROLO', 'CX', 'PAR'] as const;

export type CategoriaAviamento = (typeof CATEGORIAS_AVIAMENTO)[number];
export type StatusAviamento = (typeof STATUS_AVIAMENTO)[number];
export type TipoMovimentoAviamento = (typeof TIPOS_MOVIMENTO_AVIAMENTO)[number];

export interface AviamentoVariante {
  id: number;
  aviamento_id: number;
  cor: string | null;
  tamanho: string | null;
  status: StatusAviamento;
  saldo_id: number | null;
  quantidade: number;
  abaixo_minimo: boolean;
}

export interface Aviamento {
  id: number;
  empresa_id: number;
  codigo: string | null;
  categoria: CategoriaAviamento;
  nome: string;
  modelo: string | null;
  marca: string | null;
  unidade: string;
  consumo_por_peca: number | null;
  estoque_minimo: number;
  status: StatusAviamento;
  observacoes: string | null;
  criado_em: string;
  atualizado_em: string;
  variantes: AviamentoVariante[];
}

type VarianteInformada = {
  cor?: string;
  tamanho?: string;
  status?: StatusAviamento;
};

type VarianteNormalizada = {
  cor: string | null;
  tamanho: string | null;
  status: StatusAviamento;
};

const textoOpcional = z
  .string()
  .trim()
  .max(200)
  .optional()
  .or(z.literal(''))
  .transform((valor) => (valor ? valor : undefined));

const varianteSchema = z.object({
  cor: textoOpcional,
  tamanho: textoOpcional,
  status: z.enum(STATUS_AVIAMENTO).optional(),
});

const aviamentoSchema = z.object({
  codigo: textoOpcional,
  categoria: z.enum(CATEGORIAS_AVIAMENTO),
  nome: z.string().trim().min(1, 'nome é obrigatório').max(200),
  modelo: textoOpcional,
  marca: textoOpcional,
  unidade: z
    .string()
    .trim()
    .max(10)
    .optional()
    .or(z.literal(''))
    .transform((valor) => (valor ? valor.toUpperCase() : undefined)),
  consumo_por_peca: z.number().min(0, 'consumo por peça não pode ser negativo').nullable().optional(),
  estoque_minimo: z.number().min(0, 'estoque_minimo não pode ser negativo').optional(),
  status: z.enum(STATUS_AVIAMENTO).optional(),
  observacoes: z
    .string()
    .trim()
    .max(2000)
    .optional()
    .or(z.literal(''))
    .transform((valor) => (valor ? valor : undefined)),
  variantes: z.array(varianteSchema).max(200).optional(),
});

const atualizarAviamentoSchema = aviamentoSchema
  .partial()
  .omit({ variantes: true })
  .refine((body) => Object.keys(body).length > 0, {
    message: 'Informe ao menos um campo para atualizar',
  });

const atualizarStatusSchema = z.object({
  status: z.enum(STATUS_AVIAMENTO),
});

const atualizarVarianteSchema = z
  .object({
    cor: textoOpcional.nullable(),
    tamanho: textoOpcional.nullable(),
    status: z.enum(STATUS_AVIAMENTO).optional(),
  })
  .refine((body) => Object.keys(body).length > 0, {
    message: 'Informe ao menos um campo para atualizar',
  });

const movimentoSchema = z
  .object({
    variante_id: z.number().int().positive(),
    tipo: z.enum(TIPOS_MOVIMENTO_AVIAMENTO),
    quantidade: z.number().min(0, 'quantidade não pode ser negativa'),
    motivo: z
      .string()
      .trim()
      .max(200)
      .optional()
      .or(z.literal(''))
      .transform((valor) => (valor ? valor : undefined)),
    observacoes: z
      .string()
      .trim()
      .max(2000)
      .optional()
      .or(z.literal(''))
      .transform((valor) => (valor ? valor : undefined)),
  })
  .refine((body) => body.tipo === 'ajuste' || body.quantidade > 0, {
    message: 'quantidade deve ser maior que zero',
    path: ['quantidade'],
  })
  .refine((body) => body.tipo !== 'ajuste' || Boolean(body.motivo), {
    message: 'Informe o motivo do ajuste',
    path: ['motivo'],
  });

export type MovimentoAviamentoInput = {
  variante_id: number;
  tipo: TipoMovimentoAviamento;
  quantidade: number;
  motivo?: string | null;
  observacoes?: string | null;
};

export type ResultadoMovimentoAviamento =
  | { ok: true; movimentoId: number; saldoId: number; saldo_posterior: number }
  | { ok: false; status: number; erro: string };

function nulo(valor: string | undefined): string | null {
  return valor === undefined ? null : valor;
}

function erroDuplicidade(err: unknown): boolean {
  return err instanceof Error && /UNIQUE/i.test(err.message);
}

function normalizarVariante(variante: VarianteInformada): VarianteNormalizada {
  return {
    cor: variante.cor?.trim() || null,
    tamanho: variante.tamanho?.trim() || null,
    status: variante.status ?? 'ativo',
  };
}

function chaveVariante(variante: { cor: string | null; tamanho: string | null }): string {
  return `${(variante.cor ?? '').toLocaleLowerCase('pt-BR')}|${(variante.tamanho ?? '').toLocaleLowerCase('pt-BR')}`;
}

function validarRegras(
  categoria: CategoriaAviamento,
  modelo: string | null,
  marca: string | null,
  consumo: number | null,
  variantes: VarianteNormalizada[],
): string | null {
  if (categoria !== 'saquinho' && categoria !== 'etiqueta_tamanho' && consumo !== null) {
    return 'Consumo por peça fica reservado para saquinhos e etiquetas de tamanho';
  }
  if (categoria === 'cadarco') {
    if (!modelo) return 'Cadarço exige modelo';
    if (variantes.length === 0 || variantes.some((variante) => !variante.cor)) {
      return 'Cadarço exige ao menos uma cor';
    }
  }
  if (categoria === 'saquinho') {
    if (!modelo) return 'Saquinho exige modelo';
    if (variantes.length === 0 || variantes.some((variante) => !variante.tamanho)) {
      return 'Saquinho exige tamanho em cada variante';
    }
  }
  if (categoria === 'tag') {
    if (!marca) return 'Tag exige marca';
    if (!modelo) return 'Tag exige modelo';
  }
  if (categoria === 'etiqueta_tamanho') {
    if (variantes.length === 0 || variantes.some((variante) => !variante.tamanho)) {
      return 'Etiqueta de tamanho exige ao menos um tamanho';
    }
  }
  if (categoria === 'adesivo') {
    if (!modelo) return 'Adesivo exige modelo';
    if (!marca) return 'Adesivo exige marca';
    if (variantes.length === 0 || variantes.some((variante) => !variante.tamanho)) {
      return 'Adesivo exige tamanho em cada variante';
    }
  }
  const chaves = new Set<string>();
  for (const variante of variantes) {
    const chave = chaveVariante(variante);
    if (chaves.has(chave)) return 'Variante repetida';
    chaves.add(chave);
  }
  return null;
}

function consumoInformado(
  categoria: CategoriaAviamento,
  informado: number | null | undefined,
  criacao: boolean,
): number | null | string {
  if (categoria === 'etiqueta_tamanho') {
    if (informado === undefined || (criacao && informado === null)) return 1;
    return informado ?? null;
  }
  if (categoria === 'saquinho') return informado ?? null;
  if (informado !== undefined && informado !== null) {
    return 'Consumo por peça fica reservado para saquinhos e etiquetas de tamanho';
  }
  return null;
}

function variantesIniciais(
  categoria: CategoriaAviamento,
  informadas: VarianteInformada[] | undefined,
): VarianteNormalizada[] {
  const lista = (informadas ?? []).map(normalizarVariante);
  if (categoria === 'tag' && lista.length === 0) {
    return [{ cor: null, tamanho: null, status: 'ativo' }];
  }
  return lista;
}

type LinhaAviamento = Omit<Aviamento, 'variantes'>;
type LinhaVariante = Omit<AviamentoVariante, 'abaixo_minimo'> & { aviamento_id: number };

function carregarAviamentos(db: AppDatabase, empresaId: number, ids: number[]): Aviamento[] {
  if (ids.length === 0) return [];
  const marcas = ids.map(() => '?').join(',');
  const pais = db
    .prepare(`SELECT * FROM aviamentos WHERE empresa_id = ? AND id IN (${marcas})`)
    .all(empresaId, ...ids) as LinhaAviamento[];
  const variantes = db
    .prepare(
      `SELECT v.id, v.aviamento_id, v.cor, v.tamanho, v.status,
              s.id AS saldo_id, ifnull(s.quantidade, 0) AS quantidade
         FROM aviamento_variantes v
         LEFT JOIN aviamento_saldos s
           ON s.variante_id = v.id AND s.empresa_id = v.empresa_id
        WHERE v.empresa_id = ? AND v.aviamento_id IN (${marcas})
        ORDER BY v.id`,
    )
    .all(empresaId, ...ids) as LinhaVariante[];
  const porPai = new Map<number, LinhaVariante[]>();
  for (const variante of variantes) {
    const lista = porPai.get(variante.aviamento_id) ?? [];
    lista.push(variante);
    porPai.set(variante.aviamento_id, lista);
  }
  const porId = new Map(pais.map((pai) => [pai.id, pai]));
  return ids.flatMap((id) => {
    const pai = porId.get(id);
    if (!pai) return [];
    return [{
      ...pai,
      variantes: (porPai.get(id) ?? []).map((variante) => ({
        id: variante.id,
        aviamento_id: variante.aviamento_id,
        cor: variante.cor,
        tamanho: variante.tamanho,
        status: variante.status,
        saldo_id: variante.saldo_id,
        quantidade: variante.quantidade,
        abaixo_minimo: variante.quantidade < pai.estoque_minimo,
      })),
    }];
  });
}

function variantesNormalizadasDoBanco(aviamento: Aviamento): VarianteNormalizada[] {
  return aviamento.variantes.map((variante) => ({
    cor: variante.cor,
    tamanho: variante.tamanho,
    status: variante.status,
  }));
}

export function registrarMovimentoAviamento(
  db: AppDatabase,
  empresaId: number,
  data: MovimentoAviamentoInput,
): ResultadoMovimentoAviamento {
  const variante = db
    .prepare(
      `SELECT v.id
         FROM aviamento_variantes v
         JOIN aviamentos a ON a.id = v.aviamento_id
        WHERE v.id = ? AND v.empresa_id = ? AND a.empresa_id = ?`,
    )
    .get(data.variante_id, empresaId, empresaId) as { id: number } | undefined;
  if (!variante) return { ok: false, status: 404, erro: 'Variante de aviamento não encontrada' };

  const atual = db
    .prepare('SELECT id, quantidade FROM aviamento_saldos WHERE variante_id = ? AND empresa_id = ?')
    .get(variante.id, empresaId) as { id: number; quantidade: number } | undefined;
  let saldoId = atual?.id;
  let anterior = atual?.quantidade ?? 0;
  if (!saldoId) {
    const info = db
      .prepare(
        `INSERT INTO aviamento_saldos (empresa_id, variante_id, quantidade)
         VALUES (?, ?, 0)`,
      )
      .run(empresaId, variante.id);
    saldoId = Number(info.lastInsertRowid);
    anterior = 0;
  }

  let posterior = anterior;
  if (data.tipo === 'entrada') posterior = anterior + data.quantidade;
  else if (data.tipo === 'saida') posterior = anterior - data.quantidade;
  else posterior = data.quantidade;

  if (posterior < 0) {
    return { ok: false, status: 409, erro: 'Estoque insuficiente para a saída' };
  }

  db.prepare(
    `UPDATE aviamento_saldos
        SET quantidade = @quantidade, atualizado_em = datetime('now')
      WHERE id = @id AND empresa_id = @empresa_id`,
  ).run({ id: saldoId, empresa_id: empresaId, quantidade: posterior });
  const info = db
    .prepare(
      `INSERT INTO aviamento_movimentos (
         empresa_id, saldo_id, variante_id, tipo, quantidade,
         saldo_anterior, saldo_posterior, motivo, observacoes
       ) VALUES (
         @empresa_id, @saldo_id, @variante_id, @tipo, @quantidade,
         @saldo_anterior, @saldo_posterior, @motivo, @observacoes
       )`,
    )
    .run({
      empresa_id: empresaId,
      saldo_id: saldoId,
      variante_id: variante.id,
      tipo: data.tipo,
      quantidade: data.quantidade,
      saldo_anterior: anterior,
      saldo_posterior: posterior,
      motivo: data.motivo ?? null,
      observacoes: data.observacoes ?? null,
    });
  return {
    ok: true,
    movimentoId: Number(info.lastInsertRowid),
    saldoId,
    saldo_posterior: posterior,
  };
}

export function createAviamentosRouter(db: AppDatabase): Router {
  const router = Router();

  function obter(id: number, empresaId: number): Aviamento | undefined {
    return carregarAviamentos(db, empresaId, [id])[0];
  }

  function inserirVariante(empresaId: number, aviamentoId: number, variante: VarianteNormalizada) {
    const info = db
      .prepare(
        `INSERT INTO aviamento_variantes (empresa_id, aviamento_id, cor, tamanho, status)
         VALUES (@empresa_id, @aviamento_id, @cor, @tamanho, @status)`,
      )
      .run({
        empresa_id: empresaId,
        aviamento_id: aviamentoId,
        cor: variante.cor,
        tamanho: variante.tamanho,
        status: variante.status,
      });
    const varianteId = Number(info.lastInsertRowid);
    db.prepare(
      `INSERT INTO aviamento_saldos (empresa_id, variante_id, quantidade) VALUES (?, ?, 0)`,
    ).run(empresaId, varianteId);
    return varianteId;
  }

  router.get('/', (req, res) => {
    const pagina = Math.max(1, Number(req.query.pagina ?? 1) || 1);
    const porPagina = Math.min(100, Math.max(1, Number(req.query.por_pagina ?? 10) || 10));
    const q = String(req.query.q ?? '').trim();
    const status = String(req.query.status ?? '').trim();
    const categoria = String(req.query.categoria ?? '').trim();
    const where: string[] = [];
    const params: Record<string, string | number> = {};
    aplicarEmpresa(where, params, req, 'a.empresa_id');
    if (q) {
      where.push(
        `(a.nome LIKE @q OR ifnull(a.modelo,'') LIKE @q OR ifnull(a.marca,'') LIKE @q
          OR ifnull(a.codigo,'') LIKE @q
          OR EXISTS (
            SELECT 1 FROM aviamento_variantes v
             WHERE v.aviamento_id = a.id
               AND (ifnull(v.cor,'') LIKE @q OR ifnull(v.tamanho,'') LIKE @q)
          ))`,
      );
      params.q = `%${q}%`;
    }
    if ((STATUS_AVIAMENTO as readonly string[]).includes(status)) {
      where.push('a.status = @status');
      params.status = status;
    }
    if ((CATEGORIAS_AVIAMENTO as readonly string[]).includes(categoria)) {
      where.push('a.categoria = @categoria');
      params.categoria = categoria;
    }
    const filtro = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const total = (
      db.prepare(`SELECT COUNT(*) AS n FROM aviamentos a ${filtro}`).get(params) as { n: number }
    ).n;
    const ids = db
      .prepare(
        `SELECT a.id FROM aviamentos a ${filtro}
          ORDER BY datetime(a.atualizado_em) DESC, a.id DESC
          LIMIT @limit OFFSET @offset`,
      )
      .all({ ...params, limit: porPagina, offset: (pagina - 1) * porPagina }) as Array<{ id: number }>;
    res.json({
      data: carregarAviamentos(db, empresaDaSessao(req), ids.map((linha) => linha.id)),
      pagina,
      por_pagina: porPagina,
      total,
      total_paginas: Math.max(1, Math.ceil(total / porPagina)),
    });
  });

  router.get('/movimentos', (req, res) => {
    const pagina = Math.max(1, Number(req.query.pagina ?? 1) || 1);
    const porPagina = Math.min(100, Math.max(1, Number(req.query.por_pagina ?? 20) || 20));
    const varianteId = Number(req.query.variante_id ?? 0);
    const aviamentoId = Number(req.query.aviamento_id ?? 0);
    const tipo = String(req.query.tipo ?? '').trim();
    const where: string[] = [];
    const params: Record<string, string | number> = {};
    aplicarEmpresa(where, params, req, 'm.empresa_id');
    if (varianteId > 0) {
      where.push('m.variante_id = @variante_id');
      params.variante_id = varianteId;
    }
    if (aviamentoId > 0) {
      where.push('v.aviamento_id = @aviamento_id');
      params.aviamento_id = aviamentoId;
    }
    if ((TIPOS_MOVIMENTO_AVIAMENTO as readonly string[]).includes(tipo)) {
      where.push('m.tipo = @tipo');
      params.tipo = tipo;
    }
    const filtro = `WHERE ${where.join(' AND ')}`;
    const from = `
      FROM aviamento_movimentos m
      JOIN aviamento_variantes v ON v.id = m.variante_id
      JOIN aviamentos a ON a.id = v.aviamento_id
      ${filtro}
    `;
    const total = (db.prepare(`SELECT COUNT(*) AS n ${from}`).get(params) as { n: number }).n;
    const data = db
      .prepare(
        `SELECT m.id, m.variante_id, m.tipo, m.quantidade, m.saldo_anterior, m.saldo_posterior,
                m.motivo, m.observacoes, m.criado_em,
                v.aviamento_id, v.cor, v.tamanho,
                a.nome, a.categoria, a.unidade
           ${from}
          ORDER BY m.id DESC
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

  router.post('/movimentos', (req, res) => {
    const parsed = movimentoSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        erro: 'Dados inválidos',
        detalhes: parsed.error.flatten().fieldErrors,
      });
    }
    const resultado = registrarMovimentoAviamento(db, empresaDaSessao(req), parsed.data);
    if (!resultado.ok) return res.status(resultado.status).json({ erro: resultado.erro });
    const movimento = db
      .prepare(
        `SELECT m.id, m.variante_id, m.tipo, m.quantidade, m.saldo_anterior, m.saldo_posterior,
                m.motivo, m.observacoes, m.criado_em
           FROM aviamento_movimentos m
          WHERE m.id = ? AND m.empresa_id = ?`,
      )
      .get(resultado.movimentoId, empresaDaSessao(req));
    res.status(201).json(movimento);
  });

  router.get('/:id/movimentos', (req, res) => {
    const aviamento = obter(Number(req.params.id), empresaDaSessao(req));
    if (!aviamento) return res.status(404).json({ erro: 'Aviamento não encontrado' });
    const data = db
      .prepare(
        `SELECT m.id, m.variante_id, m.tipo, m.quantidade, m.saldo_anterior, m.saldo_posterior,
                m.motivo, m.observacoes, m.criado_em, v.cor, v.tamanho
           FROM aviamento_movimentos m
           JOIN aviamento_variantes v ON v.id = m.variante_id
          WHERE m.empresa_id = ? AND v.aviamento_id = ?
          ORDER BY m.id DESC`,
      )
      .all(empresaDaSessao(req), aviamento.id);
    res.json({ data });
  });

  router.get('/:id', (req, res) => {
    const aviamento = obter(Number(req.params.id), empresaDaSessao(req));
    if (!aviamento) return res.status(404).json({ erro: 'Aviamento não encontrado' });
    res.json(aviamento);
  });

  router.post('/', (req, res) => {
    const parsed = aviamentoSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        erro: 'Dados inválidos',
        detalhes: parsed.error.flatten().fieldErrors,
      });
    }
    const data = parsed.data;
    if (data.unidade && !(UNIDADES_AVIAMENTO as readonly string[]).includes(data.unidade)) {
      return res.status(400).json({ erro: 'Unidade inválida' });
    }
    const consumo = consumoInformado(data.categoria, data.consumo_por_peca, true);
    if (typeof consumo === 'string') return res.status(400).json({ erro: consumo });
    const variantes = variantesIniciais(data.categoria, data.variantes);
    const erro = validarRegras(data.categoria, nulo(data.modelo), nulo(data.marca), consumo, variantes);
    if (erro) return res.status(400).json({ erro });

    const empresaId = empresaDaSessao(req);
    try {
      const id = db.transaction(() => {
        const info = db
          .prepare(
            `INSERT INTO aviamentos (
               empresa_id, codigo, categoria, nome, modelo, marca, unidade,
               consumo_por_peca, estoque_minimo, status, observacoes
             ) VALUES (
               @empresa_id, @codigo, @categoria, @nome, @modelo, @marca, @unidade,
               @consumo_por_peca, @estoque_minimo, @status, @observacoes
             )`,
          )
          .run({
            empresa_id: empresaId,
            codigo: nulo(data.codigo),
            categoria: data.categoria,
            nome: data.nome,
            modelo: nulo(data.modelo),
            marca: nulo(data.marca),
            unidade: data.unidade ?? 'UN',
            consumo_por_peca: consumo,
            estoque_minimo: data.estoque_minimo ?? 0,
            status: data.status ?? 'ativo',
            observacoes: nulo(data.observacoes),
          });
        const aviamentoId = Number(info.lastInsertRowid);
        for (const variante of variantes) inserirVariante(empresaId, aviamentoId, variante);
        return aviamentoId;
      })();
      res.status(201).json(obter(id, empresaId));
    } catch (err) {
      if (erroDuplicidade(err)) return res.status(409).json({ erro: 'Código ou variante já cadastrado' });
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
        `UPDATE aviamentos SET status = @status, atualizado_em = datetime('now')
          WHERE id = @id AND empresa_id = @empresa_id`,
      )
      .run({ id, empresa_id: empresaId, status: parsed.data.status });
    if (info.changes === 0) return res.status(404).json({ erro: 'Aviamento não encontrado' });
    db.prepare(
      `UPDATE aviamento_variantes
          SET status = @status, atualizado_em = datetime('now')
        WHERE aviamento_id = @id AND empresa_id = @empresa_id`,
    ).run({ id, empresa_id: empresaId, status: parsed.data.status });
    res.json(obter(id, empresaId));
  });

  router.patch('/:id', (req, res) => {
    const parsed = atualizarAviamentoSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        erro: 'Dados inválidos',
        detalhes: parsed.error.flatten().fieldErrors,
      });
    }
    const id = Number(req.params.id);
    const empresaId = empresaDaSessao(req);
    const atual = obter(id, empresaId);
    if (!atual) return res.status(404).json({ erro: 'Aviamento não encontrado' });
    const data = parsed.data;
    if (data.unidade && !(UNIDADES_AVIAMENTO as readonly string[]).includes(data.unidade)) {
      return res.status(400).json({ erro: 'Unidade inválida' });
    }
    const categoria = data.categoria ?? atual.categoria;
    const modelo = data.modelo !== undefined ? nulo(data.modelo) : atual.modelo;
    const marca = data.marca !== undefined ? nulo(data.marca) : atual.marca;
    const consumoBruto = data.consumo_por_peca !== undefined ? data.consumo_por_peca : atual.consumo_por_peca;
    const consumo = consumoInformado(categoria, consumoBruto, false);
    if (typeof consumo === 'string') return res.status(400).json({ erro: consumo });
    const erro = validarRegras(categoria, modelo, marca, consumo, variantesNormalizadasDoBanco(atual));
    if (erro) return res.status(400).json({ erro });

    const row: Record<string, string | number | null> = {};
    if (data.codigo !== undefined) row.codigo = nulo(data.codigo);
    if (data.categoria !== undefined) row.categoria = data.categoria;
    if (data.nome !== undefined) row.nome = data.nome;
    if (data.modelo !== undefined) row.modelo = nulo(data.modelo);
    if (data.marca !== undefined) row.marca = nulo(data.marca);
    if (data.unidade !== undefined) row.unidade = data.unidade ?? 'UN';
    if (data.consumo_por_peca !== undefined || data.categoria !== undefined) row.consumo_por_peca = consumo;
    if (data.estoque_minimo !== undefined) row.estoque_minimo = data.estoque_minimo;
    if (data.status !== undefined) row.status = data.status;
    if (data.observacoes !== undefined) row.observacoes = nulo(data.observacoes);
    const sets = Object.keys(row).map((chave) => `${chave} = @${chave}`).join(', ');
    try {
      db.prepare(
        `UPDATE aviamentos SET ${sets}, atualizado_em = datetime('now')
          WHERE id = @id AND empresa_id = @empresa_id`,
      ).run({ ...row, id, empresa_id: empresaId });
      res.json(obter(id, empresaId));
    } catch (err) {
      if (erroDuplicidade(err)) return res.status(409).json({ erro: 'Código ou variante já cadastrado' });
      throw err;
    }
  });

  router.delete('/:id', (req, res) => {
    const id = Number(req.params.id);
    const empresaId = empresaDaSessao(req);
    const atual = obter(id, empresaId);
    if (!atual) return res.status(404).json({ erro: 'Aviamento não encontrado' });
    const ids = atual.variantes.map((variante) => variante.id);
    if (ids.length > 0) {
      const marcas = ids.map(() => '?').join(',');
      const movimentos = (
        db.prepare(`SELECT COUNT(*) AS n FROM aviamento_movimentos WHERE variante_id IN (${marcas})`).get(...ids) as { n: number }
      ).n;
      const compras = (
        db.prepare(`SELECT COUNT(*) AS n FROM pedido_compra_itens WHERE aviamento_variante_id IN (${marcas})`).get(...ids) as { n: number }
      ).n;
      const saldo = atual.variantes.reduce((total, variante) => total + variante.quantidade, 0);
      if (movimentos > 0 || compras > 0 || saldo !== 0) {
        return res.status(409).json({
          erro: 'Aviamento possui movimentos ou compras e não pode ser excluído. Inative o cadastro para preservar o histórico.',
        });
      }
    }
    db.transaction(() => {
      if (ids.length > 0) {
        const marcas = ids.map(() => '?').join(',');
        db.prepare(`DELETE FROM aviamento_saldos WHERE variante_id IN (${marcas})`).run(...ids);
        db.prepare(`DELETE FROM aviamento_variantes WHERE id IN (${marcas}) AND empresa_id = ?`).run(...ids, empresaId);
      }
      db.prepare('DELETE FROM aviamentos WHERE id = ? AND empresa_id = ?').run(id, empresaId);
    })();
    res.status(204).send();
  });

  router.post('/:id/variantes', (req, res) => {
    const parsed = varianteSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        erro: 'Dados inválidos',
        detalhes: parsed.error.flatten().fieldErrors,
      });
    }
    const id = Number(req.params.id);
    const empresaId = empresaDaSessao(req);
    const atual = obter(id, empresaId);
    if (!atual) return res.status(404).json({ erro: 'Aviamento não encontrado' });
    const variantes = [...variantesNormalizadasDoBanco(atual), normalizarVariante(parsed.data)];
    const erro = validarRegras(atual.categoria, atual.modelo, atual.marca, atual.consumo_por_peca, variantes);
    if (erro) return res.status(400).json({ erro });
    try {
      inserirVariante(empresaId, id, normalizarVariante(parsed.data));
      db.prepare(`UPDATE aviamentos SET atualizado_em = datetime('now') WHERE id = ? AND empresa_id = ?`).run(id, empresaId);
      res.status(201).json(obter(id, empresaId));
    } catch (err) {
      if (erroDuplicidade(err)) return res.status(409).json({ erro: 'Código ou variante já cadastrado' });
      throw err;
    }
  });

  router.patch('/:id/variantes/:varianteId/status', (req, res) => {
    const parsed = atualizarStatusSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        erro: 'Dados inválidos',
        detalhes: parsed.error.flatten().fieldErrors,
      });
    }
    const empresaId = empresaDaSessao(req);
    const info = db
      .prepare(
        `UPDATE aviamento_variantes
            SET status = @status, atualizado_em = datetime('now')
          WHERE id = @variante_id AND aviamento_id = @aviamento_id AND empresa_id = @empresa_id`,
      )
      .run({
        status: parsed.data.status,
        variante_id: Number(req.params.varianteId),
        aviamento_id: Number(req.params.id),
        empresa_id: empresaId,
      });
    if (info.changes === 0) return res.status(404).json({ erro: 'Variante de aviamento não encontrada' });
    res.json(obter(Number(req.params.id), empresaId));
  });

  router.patch('/:id/variantes/:varianteId', (req, res) => {
    const parsed = atualizarVarianteSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        erro: 'Dados inválidos',
        detalhes: parsed.error.flatten().fieldErrors,
      });
    }
    const empresaId = empresaDaSessao(req);
    const aviamentoId = Number(req.params.id);
    const varianteId = Number(req.params.varianteId);
    const atual = obter(aviamentoId, empresaId);
    if (!atual) return res.status(404).json({ erro: 'Aviamento não encontrado' });
    const alvo = atual.variantes.find((variante) => variante.id === varianteId);
    if (!alvo) return res.status(404).json({ erro: 'Variante de aviamento não encontrada' });
    const data = parsed.data;
    const editada = normalizarVariante({
      cor: data.cor === undefined ? alvo.cor ?? undefined : data.cor ?? undefined,
      tamanho: data.tamanho === undefined ? alvo.tamanho ?? undefined : data.tamanho ?? undefined,
      status: data.status ?? alvo.status,
    });
    const variantes = variantesNormalizadasDoBanco(atual).map((variante, indice) => (
      atual.variantes[indice]?.id === varianteId ? editada : variante
    ));
    const erro = validarRegras(atual.categoria, atual.modelo, atual.marca, atual.consumo_por_peca, variantes);
    if (erro) return res.status(400).json({ erro });
    try {
      db.prepare(
        `UPDATE aviamento_variantes
            SET cor = @cor, tamanho = @tamanho, status = @status, atualizado_em = datetime('now')
          WHERE id = @id AND aviamento_id = @aviamento_id AND empresa_id = @empresa_id`,
      ).run({
        id: varianteId,
        aviamento_id: aviamentoId,
        empresa_id: empresaId,
        cor: editada.cor,
        tamanho: editada.tamanho,
        status: editada.status,
      });
      res.json(obter(aviamentoId, empresaId));
    } catch (err) {
      if (erroDuplicidade(err)) return res.status(409).json({ erro: 'Código ou variante já cadastrado' });
      throw err;
    }
  });

  return router;
}
