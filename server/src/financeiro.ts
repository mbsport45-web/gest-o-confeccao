import { Router } from 'express';
import { z } from 'zod';
import type { AppDatabase } from './db.js';
import { aplicarEmpresa, empresaDaSessao } from './tenant.js';

export const TIPOS_LANCAMENTO = ['pagar', 'receber'] as const;
export const STATUS_LANCAMENTO = [
  'pendente',
  'pago',
  'recebido',
  'vencido',
  'cancelado',
] as const;
export const TIPOS_CATEGORIA = ['pagar', 'receber', 'ambos'] as const;

export interface FinanceiroCategoria {
  id: number;
  nome: string;
  tipo: (typeof TIPOS_CATEGORIA)[number];
  status: 'ativo' | 'inativo';
  criado_em: string;
}

export interface FinanceiroLancamento {
  id: number;
  empresa_id?: number;
  tipo: (typeof TIPOS_LANCAMENTO)[number];
  categoria_id: number | null;
  descricao: string;
  valor: number;
  status: (typeof STATUS_LANCAMENTO)[number];
  vencimento: string | null;
  data_pagamento: string | null;
  fornecedor_id: number | null;
  cliente_id: number | null;
  compra_id: number | null;
  ordem_id: number | null;
  pedido_id: number | null;
  parcela: number | null;
  observacoes: string | null;
  criado_em: string;
  atualizado_em: string;
  categoria?: string | null;
  fornecedor?: string | null;
  cliente?: string | null;
  compra_codigo?: string | null;
  pedido_codigo?: string | null;
}

const textoOpcional = z
  .string()
  .trim()
  .max(200)
  .optional()
  .or(z.literal(''))
  .transform((v) => (v ? v : undefined));

const categoriaSchema = z.object({
  nome: z.string().trim().min(1, 'nome é obrigatório').max(120),
  tipo: z.enum(TIPOS_CATEGORIA).optional(),
  status: z.enum(['ativo', 'inativo']).optional(),
});

const lancamentoBase = z.object({
  tipo: z.enum(TIPOS_LANCAMENTO),
  categoria_id: z.number().int().positive().optional().nullable(),
  descricao: z.string().trim().min(1, 'descrição é obrigatória').max(300),
  valor: z.number().positive('valor deve ser maior que zero'),
  status: z.enum(STATUS_LANCAMENTO).optional(),
  vencimento: textoOpcional,
  data_pagamento: textoOpcional,
  fornecedor_id: z.number().int().positive().optional().nullable(),
  cliente_id: z.number().int().positive().optional().nullable(),
  compra_id: z.number().int().positive().optional().nullable(),
  ordem_id: z.number().int().positive().optional().nullable(),
  pedido_id: z.number().int().positive().optional().nullable(),
  observacoes: z
    .string()
    .trim()
    .max(2000)
    .optional()
    .or(z.literal(''))
    .transform((v) => (v ? v : undefined)),
});

const criarLancamentoSchema = lancamentoBase;
const atualizarLancamentoSchema = lancamentoBase.partial().refine(
  (body) => Object.keys(body).length > 0,
  { message: 'Informe ao menos um campo para atualizar' },
);

const LANCAMENTO_SELECT = `
  SELECT
    l.*,
    c.nome AS categoria,
    f.nome AS fornecedor,
    cl.nome AS cliente,
    pc.codigo AS compra_codigo,
    pv.codigo AS pedido_codigo
  FROM financeiro_lancamentos l
  LEFT JOIN financeiro_categorias c ON c.id = l.categoria_id
  LEFT JOIN fornecedores f ON f.id = l.fornecedor_id AND f.empresa_id = l.empresa_id
  LEFT JOIN clientes cl ON cl.id = l.cliente_id AND cl.empresa_id = l.empresa_id
  LEFT JOIN pedidos_compra pc ON pc.id = l.compra_id AND pc.empresa_id = l.empresa_id
  LEFT JOIN pedidos pv ON pv.id = l.pedido_id AND pv.empresa_id = l.empresa_id
`;

function pertenceAEmpresa(
  db: AppDatabase,
  tabela: 'clientes' | 'fornecedores' | 'pedidos' | 'pedidos_compra' | 'ordens_producao',
  id: number | null | undefined,
  empresaId: number,
): boolean {
  if (id == null) return true;
  return Boolean(
    db.prepare(`SELECT id FROM ${tabela} WHERE id = ? AND empresa_id = ?`).get(id, empresaId),
  );
}

export function arredondarDinheiro(valor: number): number {
  return Math.round((valor + Number.EPSILON) * 100) / 100;
}

export function statusEfetivoLancamento(
  status: string,
  vencimento: string | null,
): (typeof STATUS_LANCAMENTO)[number] {
  if (
    status === 'pendente' &&
    vencimento &&
    vencimento.slice(0, 10) < new Date().toISOString().slice(0, 10)
  ) {
    return 'vencido';
  }
  return status as (typeof STATUS_LANCAMENTO)[number];
}

export function categoriaVendasId(db: AppDatabase): number | null {
  const row = db
    .prepare(
      `SELECT id FROM financeiro_categorias WHERE nome = 'Vendas' AND status = 'ativo' LIMIT 1`,
    )
    .get() as { id: number } | undefined;
  return row?.id ?? null;
}

export function sincronizarContaReceberPedido(
  db: AppDatabase,
  pedido: {
    id: number;
    codigo: string | null;
    cliente_id: number;
    total: number;
    data_prevista: string | null;
    status: string;
    empresa_id: number;
  },
  opts: { criar: boolean; vencimento?: string | null } = { criar: false },
): FinanceiroLancamento | undefined {
  const atual = db
    .prepare(
      `SELECT * FROM financeiro_lancamentos WHERE pedido_id = ? AND tipo = 'receber'`,
    )
    .get(pedido.id) as FinanceiroLancamento | undefined;

  if (pedido.status === 'cancelado' || pedido.total <= 0) {
    if (atual && atual.status === 'pendente') {
      db.prepare(
        `UPDATE financeiro_lancamentos
            SET status = 'cancelado', atualizado_em = datetime('now')
          WHERE id = ?`,
      ).run(atual.id);
    }
    return atual
      ? ({ ...atual, status: atual.status === 'pendente' ? 'cancelado' : atual.status } as FinanceiroLancamento)
      : undefined;
  }

  if (atual) {
    if (atual.status === 'pendente' || atual.status === 'vencido') {
      db.prepare(
        `UPDATE financeiro_lancamentos
            SET valor = @valor, vencimento = @vencimento, cliente_id = @cliente_id,
                descricao = @descricao, atualizado_em = datetime('now')
          WHERE id = @id`,
      ).run({
        id: atual.id,
        valor: arredondarDinheiro(pedido.total),
        vencimento: opts.vencimento ?? atual.vencimento ?? pedido.data_prevista,
        cliente_id: pedido.cliente_id,
        descricao: `Pedido ${pedido.codigo ?? pedido.id}`,
      });
    }
    return db
      .prepare(`SELECT * FROM financeiro_lancamentos WHERE id = ?`)
      .get(atual.id) as FinanceiroLancamento;
  }

  if (!opts.criar) return undefined;

  const info = db
    .prepare(
      `INSERT INTO financeiro_lancamentos (
         empresa_id, tipo, categoria_id, descricao, valor, status, vencimento,
         cliente_id, pedido_id
       ) VALUES (
         @empresa_id, 'receber', @categoria_id, @descricao, @valor, 'pendente', @vencimento,
         @cliente_id, @pedido_id
       )`,
    )
    .run({
      empresa_id: pedido.empresa_id,
      categoria_id: categoriaVendasId(db),
      descricao: `Pedido ${pedido.codigo ?? pedido.id}`,
      valor: arredondarDinheiro(pedido.total),
      vencimento: opts.vencimento ?? pedido.data_prevista,
      cliente_id: pedido.cliente_id,
      pedido_id: pedido.id,
    });
  return db
    .prepare(`SELECT * FROM financeiro_lancamentos WHERE id = ?`)
    .get(Number(info.lastInsertRowid)) as FinanceiroLancamento;
}

export function categoriaComprasId(db: AppDatabase): number | null {
  const row = db
    .prepare(
      `SELECT id FROM financeiro_categorias WHERE nome = 'Compras' AND status = 'ativo' LIMIT 1`,
    )
    .get() as { id: number } | undefined;
  return row?.id ?? null;
}

export type ParcelaCompra = { vencimento: string; valor: number };

export type DadosPagamentoCompra = {
  forma?: 'a_vista' | 'a_prazo' | null;
  vencimento?: string | null;
  parcelas?: ParcelaCompra[];
  exigirDados?: boolean;
};

type CompraFinanceiro = {
  id: number;
  codigo: string | null;
  fornecedor_id: number;
  total: number;
  vencimento: string | null;
  status: string;
  empresa_id: number;
  data_emissao?: string | null;
  documento_numero?: string | null;
  documento_tipo?: string | null;
  forma_pagamento?: string | null;
};

export function descricaoContaPagar(compra: CompraFinanceiro): string {
  const codigo = compra.codigo ?? compra.id;
  const numero = compra.documento_numero?.trim();
  if (!numero) return `Compra ${codigo}`;
  const tipo = compra.documento_tipo === 'pedido_compra' ? 'Pedido' : 'NF';
  return `Compra ${codigo} · ${tipo} ${numero}`;
}

export function inferirFormaPagamento(forma?: string | null): 'a_vista' | 'a_prazo' | null {
  if (!forma) return null;
  const n = forma
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .trim()
    .toLowerCase();
  if (['a_vista', 'avista', 'a vista', 'dinheiro', 'pix', 'debito', 'cartao'].includes(n)) {
    return 'a_vista';
  }
  if (['a_prazo', 'aprazo', 'a prazo', 'boleto', 'prazo', 'parcelado'].includes(n)) {
    return 'a_prazo';
  }
  return null;
}

function listarContasPagarCompra(db: AppDatabase, compraId: number): FinanceiroLancamento[] {
  return (
    db
      .prepare(
        `SELECT * FROM financeiro_lancamentos
          WHERE compra_id = ? AND tipo = 'pagar'
          ORDER BY ifnull(parcela, id), id`,
      )
      .all(compraId) as FinanceiroLancamento[]
  ).map(mapLancamento);
}

export function lancarContasPagarCompra(
  db: AppDatabase,
  compra: CompraFinanceiro,
  opts: DadosPagamentoCompra = {},
): FinanceiroLancamento[] {
  const existentes = listarContasPagarCompra(db, compra.id);
  if (existentes.length > 0) {
    const substituiveis =
      opts.exigirDados &&
      existentes.every((titulo) => titulo.status === 'pendente' || titulo.status === 'vencido');
    if (!substituiveis) return existentes;
    db.prepare(
      `DELETE FROM financeiro_lancamentos
        WHERE compra_id = ? AND tipo = 'pagar' AND status IN ('pendente', 'vencido')`,
    ).run(compra.id);
  }

  const forma = opts.forma ?? inferirFormaPagamento(compra.forma_pagamento);
  if (opts.exigirDados && !forma) {
    throw Object.assign(new Error('Informe se o pagamento é à vista ou a prazo'), { status: 400 });
  }

  const descricao = descricaoContaPagar(compra);
  const aVista = forma === 'a_vista';
  let parcelas: ParcelaCompra[];
  if (opts.parcelas && opts.parcelas.length > 0) {
    if (aVista) {
      throw Object.assign(new Error('Pagamento à vista não deve ter parcelas'), { status: 400 });
    }
    const soma = arredondarDinheiro(opts.parcelas.reduce((acc, item) => acc + item.valor, 0));
    if (Math.abs(soma - arredondarDinheiro(compra.total)) > 0.01) {
      throw Object.assign(new Error('A soma das parcelas deve ser igual ao total da compra'), {
        status: 400,
      });
    }
    for (const parcela of opts.parcelas) {
      if (!parcela.vencimento?.trim()) {
        throw Object.assign(new Error('Informe o vencimento de cada parcela'), { status: 400 });
      }
    }
    parcelas = opts.parcelas;
  } else if (aVista) {
    parcelas = [
      {
        vencimento:
          opts.vencimento ?? compra.vencimento ?? compra.data_emissao ?? new Date().toISOString().slice(0, 10),
        valor: arredondarDinheiro(compra.total),
      },
    ];
  } else {
    const vencimento = opts.vencimento ?? compra.vencimento ?? null;
    if (opts.exigirDados && !vencimento) {
      throw Object.assign(new Error('Informe o vencimento ou as parcelas da conta a prazo'), {
        status: 400,
      });
    }
    parcelas = [{ vencimento: vencimento ?? '', valor: arredondarDinheiro(compra.total) }];
  }

  const inserir = db.prepare(
    `INSERT INTO financeiro_lancamentos (
       empresa_id, tipo, categoria_id, descricao, valor, status, vencimento, data_pagamento,
       fornecedor_id, compra_id, parcela, observacoes
     ) VALUES (
       @empresa_id, 'pagar', @categoria_id, @descricao, @valor, @status, @vencimento, @data_pagamento,
       @fornecedor_id, @compra_id, @parcela, @observacoes
     )`,
  );
  const hoje = new Date().toISOString().slice(0, 10);
  parcelas.forEach((parcela, indice) => {
    const n = indice + 1;
    const rotulo = parcelas.length > 1 ? `${descricao} · parcela ${n}/${parcelas.length}` : descricao;
    inserir.run({
      empresa_id: compra.empresa_id,
      categoria_id: categoriaComprasId(db),
      descricao: rotulo,
      valor: arredondarDinheiro(parcela.valor),
      status: aVista ? 'pago' : 'pendente',
      vencimento: parcela.vencimento || null,
      data_pagamento: aVista ? hoje : null,
      fornecedor_id: compra.fornecedor_id,
      compra_id: compra.id,
      parcela: n,
      observacoes: aVista ? 'Pagamento à vista' : null,
    });
  });
  return listarContasPagarCompra(db, compra.id);
}

export function sincronizarContaPagarCompra(db: AppDatabase, compra: CompraFinanceiro): void {
  const atuais = db
    .prepare(
      `SELECT * FROM financeiro_lancamentos WHERE compra_id = ? AND tipo = 'pagar' ORDER BY id`,
    )
    .all(compra.id) as FinanceiroLancamento[];

  if (compra.status === 'cancelada' || compra.total <= 0) {
    for (const atual of atuais) {
      if (atual.status === 'pendente') {
        db.prepare(
          `UPDATE financeiro_lancamentos
              SET status = 'cancelado', atualizado_em = datetime('now')
            WHERE id = ?`,
        ).run(atual.id);
      }
    }
    return;
  }

  if (!['aberta', 'parcial', 'recebida'].includes(compra.status)) return;

  if (atuais.length === 1) {
    const atual = atuais[0];
    if (atual.status === 'pendente' || atual.status === 'vencido') {
      db.prepare(
        `UPDATE financeiro_lancamentos
            SET valor = @valor, vencimento = @vencimento, fornecedor_id = @fornecedor_id,
                descricao = @descricao, parcela = @parcela, atualizado_em = datetime('now')
          WHERE id = @id`,
      ).run({
        id: atual.id,
        valor: arredondarDinheiro(compra.total),
        vencimento: compra.vencimento,
        fornecedor_id: compra.fornecedor_id,
        descricao: descricaoContaPagar(compra),
        parcela: atual.parcela ?? 1,
      });
    }
    return;
  }

  if (atuais.length > 1) return;
  lancarContasPagarCompra(db, compra);
}

function mapLancamento(row: FinanceiroLancamento): FinanceiroLancamento {
  return {
    ...row,
    status: statusEfetivoLancamento(row.status, row.vencimento),
  };
}

export function createFinanceiroRouter(db: AppDatabase): Router {
  const router = Router();
  const getLancamento = db.prepare(`${LANCAMENTO_SELECT} WHERE l.id = ? AND l.empresa_id = ?`);
  const getCategoria = db.prepare('SELECT * FROM financeiro_categorias WHERE id = ?');

  router.get('/categorias', (req, res) => {
    const status = String(req.query.status ?? '').trim();
    const tipo = String(req.query.tipo ?? '').trim();
    const where: string[] = [];
    const params: Record<string, string> = {};
    if (status === 'ativo' || status === 'inativo') {
      where.push('status = @status');
      params.status = status;
    }
    if ((TIPOS_CATEGORIA as readonly string[]).includes(tipo)) {
      where.push('(tipo = @tipo OR tipo = \'ambos\')');
      params.tipo = tipo;
    }
    const filtro = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const data = db
      .prepare(
        `SELECT * FROM financeiro_categorias ${filtro} ORDER BY nome COLLATE NOCASE`,
      )
      .all(params);
    res.json({ data, total: data.length });
  });

  router.post('/categorias', (req, res) => {
    const parsed = categoriaSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        erro: 'Dados inválidos',
        detalhes: parsed.error.flatten().fieldErrors,
      });
    }
    try {
      const info = db
        .prepare(
          `INSERT INTO financeiro_categorias (nome, tipo, status)
           VALUES (@nome, @tipo, @status)`,
        )
        .run({
          nome: parsed.data.nome,
          tipo: parsed.data.tipo ?? 'ambos',
          status: parsed.data.status ?? 'ativo',
        });
      res.status(201).json(getCategoria.get(Number(info.lastInsertRowid)));
    } catch (err) {
      if (err instanceof Error && /UNIQUE/i.test(err.message)) {
        return res.status(409).json({ erro: 'Categoria já cadastrada' });
      }
      throw err;
    }
  });

  router.get('/resumo', (req, res) => {
    const empresaId = empresaDaSessao(req);
    const de = String(req.query.de ?? '').trim();
    const ate = String(req.query.ate ?? '').trim();
    const params: Record<string, string | number> = { empresa_id: empresaId };
    const periodoPag: string[] = ["status IN ('pago','recebido')", 'empresa_id = @empresa_id'];
    if (de) {
      periodoPag.push(`date(ifnull(data_pagamento, criado_em)) >= date(@de)`);
      params.de = de;
    }
    if (ate) {
      periodoPag.push(`date(ifnull(data_pagamento, criado_em)) <= date(@ate)`);
      params.ate = ate;
    }
    const filtroPag = `WHERE ${periodoPag.join(' AND ')}`;

    const soma = (sql: string, extra: Record<string, string> = {}) =>
      (
        db.prepare(sql).get({ ...params, ...extra }) as { n: number }
      ).n ?? 0;

    const pagarAberto = soma(
      `SELECT ifnull(SUM(valor),0) AS n FROM financeiro_lancamentos
        WHERE empresa_id = @empresa_id AND tipo = 'pagar' AND status = 'pendente'`,
    );
    const receberAberto = soma(
      `SELECT ifnull(SUM(valor),0) AS n FROM financeiro_lancamentos
        WHERE empresa_id = @empresa_id AND tipo = 'receber' AND status = 'pendente'`,
    );
    const vencidos = soma(
      `SELECT ifnull(SUM(valor),0) AS n FROM financeiro_lancamentos
        WHERE empresa_id = @empresa_id AND status = 'pendente' AND vencimento IS NOT NULL
          AND date(vencimento) < date('now')`,
    );
    const realizadoPagar = soma(
      `SELECT ifnull(SUM(valor),0) AS n FROM financeiro_lancamentos
        ${filtroPag} AND tipo = 'pagar'`,
    );
    const realizadoReceber = soma(
      `SELECT ifnull(SUM(valor),0) AS n FROM financeiro_lancamentos
        ${filtroPag} AND tipo = 'receber'`,
    );
    const previstoPagar = soma(
      `SELECT ifnull(SUM(valor),0) AS n FROM financeiro_lancamentos
        WHERE empresa_id = @empresa_id AND tipo = 'pagar' AND status = 'pendente'`,
    );
    const previstoReceber = soma(
      `SELECT ifnull(SUM(valor),0) AS n FROM financeiro_lancamentos
        WHERE empresa_id = @empresa_id AND tipo = 'receber' AND status = 'pendente'`,
    );

    const recentes = (
      db.prepare(
        `${LANCAMENTO_SELECT} WHERE l.empresa_id = ? ORDER BY datetime(l.atualizado_em) DESC, l.id DESC LIMIT 8`,
      ).all(empresaId) as FinanceiroLancamento[]
    ).map(mapLancamento);

    const fluxo = db
      .prepare(
        `SELECT
           strftime('%Y-%m', ifnull(data_pagamento, criado_em)) AS mes,
           SUM(CASE WHEN tipo = 'receber' AND status IN ('recebido','pago') THEN valor ELSE 0 END) AS entradas,
           SUM(CASE WHEN tipo = 'pagar' AND status IN ('pago','recebido') THEN valor ELSE 0 END) AS saidas
         FROM financeiro_lancamentos
         WHERE empresa_id = ? AND status IN ('pago','recebido')
         GROUP BY mes
         ORDER BY mes DESC
         LIMIT 6`,
      )
      .all(empresaId) as Array<{ mes: string; entradas: number; saidas: number }>;

    res.json({
      saldo: arredondarDinheiro(realizadoReceber - realizadoPagar),
      contas_pagar: arredondarDinheiro(pagarAberto),
      contas_receber: arredondarDinheiro(receberAberto),
      vencidos: arredondarDinheiro(vencidos),
      previsto: arredondarDinheiro(previstoReceber - previstoPagar),
      realizado: arredondarDinheiro(realizadoReceber - realizadoPagar),
      realizado_pagar: arredondarDinheiro(realizadoPagar),
      realizado_receber: arredondarDinheiro(realizadoReceber),
      fluxo: fluxo.reverse().map((f) => ({
        ...f,
        saldo: arredondarDinheiro((f.entradas ?? 0) - (f.saidas ?? 0)),
      })),
      recentes,
    });
  });

  router.get('/lancamentos', (req, res) => {
    const pagina = Math.max(1, Number(req.query.pagina ?? 1) || 1);
    const porPagina = Math.min(
      100,
      Math.max(1, Number(req.query.por_pagina ?? 10) || 10),
    );
    const q = String(req.query.q ?? '').trim();
    const tipo = String(req.query.tipo ?? '').trim();
    const status = String(req.query.status ?? '').trim();
    const categoriaId = Number(req.query.categoria_id ?? 0);
    const de = String(req.query.de ?? '').trim();
    const ate = String(req.query.ate ?? '').trim();

    const where: string[] = [];
    const params: Record<string, string | number> = {};
    aplicarEmpresa(where, params, req, 'l.empresa_id');
    if (q) {
      where.push(
        `(l.descricao LIKE @q OR ifnull(f.nome,'') LIKE @q OR ifnull(cl.nome,'') LIKE @q
          OR ifnull(pc.codigo,'') LIKE @q)`,
      );
      params.q = `%${q}%`;
    }
    if ((TIPOS_LANCAMENTO as readonly string[]).includes(tipo)) {
      where.push('l.tipo = @tipo');
      params.tipo = tipo;
    }
    if (status === 'vencido') {
      where.push(`l.status = 'pendente' AND l.vencimento IS NOT NULL AND date(l.vencimento) < date('now')`);
    } else if ((STATUS_LANCAMENTO as readonly string[]).includes(status)) {
      if (status === 'pendente') {
        where.push(
          `l.status = 'pendente' AND (l.vencimento IS NULL OR date(l.vencimento) >= date('now'))`,
        );
      } else {
        where.push('l.status = @status');
        params.status = status;
      }
    }
    if (categoriaId > 0) {
      where.push('l.categoria_id = @categoria_id');
      params.categoria_id = categoriaId;
    }
    if (de) {
      where.push(`date(ifnull(l.vencimento, l.criado_em)) >= date(@de)`);
      params.de = de;
    }
    if (ate) {
      where.push(`date(ifnull(l.vencimento, l.criado_em)) <= date(@ate)`);
      params.ate = ate;
    }
    const filtro = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const from = `
      FROM financeiro_lancamentos l
      LEFT JOIN financeiro_categorias c ON c.id = l.categoria_id
      LEFT JOIN fornecedores f ON f.id = l.fornecedor_id AND f.empresa_id = l.empresa_id
      LEFT JOIN clientes cl ON cl.id = l.cliente_id AND cl.empresa_id = l.empresa_id
      LEFT JOIN pedidos_compra pc ON pc.id = l.compra_id AND pc.empresa_id = l.empresa_id
      LEFT JOIN pedidos pv ON pv.id = l.pedido_id AND pv.empresa_id = l.empresa_id
      ${filtro}
    `;
    const total = (db.prepare(`SELECT COUNT(*) AS n ${from}`).get(params) as { n: number }).n;
    const rows = db
      .prepare(
        `SELECT l.*, c.nome AS categoria, f.nome AS fornecedor, cl.nome AS cliente,
                pc.codigo AS compra_codigo, pv.codigo AS pedido_codigo
         ${from}
         ORDER BY datetime(ifnull(l.vencimento, l.criado_em)) DESC, l.id DESC
         LIMIT @limit OFFSET @offset`,
      )
      .all({ ...params, limit: porPagina, offset: (pagina - 1) * porPagina }) as FinanceiroLancamento[];

    res.json({
      data: rows.map(mapLancamento),
      pagina,
      por_pagina: porPagina,
      total,
      total_paginas: Math.max(1, Math.ceil(total / porPagina)),
    });
  });

  router.get('/lancamentos/:id', (req, res) => {
    const row = getLancamento.get(Number(req.params.id), empresaDaSessao(req)) as FinanceiroLancamento | undefined;
    if (!row) return res.status(404).json({ erro: 'Lançamento não encontrado' });
    res.json(mapLancamento(row));
  });

  router.post('/lancamentos', (req, res) => {
    const parsed = criarLancamentoSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        erro: 'Dados inválidos',
        detalhes: parsed.error.flatten().fieldErrors,
      });
    }
    const data = parsed.data;
    const empresaId = empresaDaSessao(req);
    if (data.tipo === 'pagar' && data.status === 'recebido') {
      return res.status(400).json({ erro: 'Conta a pagar não usa status recebido' });
    }
    if (data.tipo === 'receber' && data.status === 'pago') {
      return res.status(400).json({ erro: 'Conta a receber não usa status pago' });
    }
    if (!pertenceAEmpresa(db, 'fornecedores', data.fornecedor_id, empresaId)) {
      return res.status(404).json({ erro: 'Fornecedor não encontrado' });
    }
    if (!pertenceAEmpresa(db, 'clientes', data.cliente_id, empresaId)) {
      return res.status(404).json({ erro: 'Cliente não encontrado' });
    }
    if (!pertenceAEmpresa(db, 'pedidos', data.pedido_id, empresaId)) {
      return res.status(404).json({ erro: 'Pedido não encontrado' });
    }
    if (!pertenceAEmpresa(db, 'pedidos_compra', data.compra_id, empresaId)) {
      return res.status(404).json({ erro: 'Compra não encontrada' });
    }
    if (!pertenceAEmpresa(db, 'ordens_producao', data.ordem_id, empresaId)) {
      return res.status(404).json({ erro: 'Ordem de produção não encontrada' });
    }
    const status = data.status ?? 'pendente';
    const info = db
      .prepare(
        `INSERT INTO financeiro_lancamentos (
           empresa_id, tipo, categoria_id, descricao, valor, status, vencimento, data_pagamento,
           fornecedor_id, cliente_id, compra_id, ordem_id, pedido_id, observacoes
         ) VALUES (
           @empresa_id, @tipo, @categoria_id, @descricao, @valor, @status, @vencimento, @data_pagamento,
           @fornecedor_id, @cliente_id, @compra_id, @ordem_id, @pedido_id, @observacoes
         )`,
      )
      .run({
        empresa_id: empresaId,
        tipo: data.tipo,
        categoria_id: data.categoria_id ?? null,
        descricao: data.descricao,
        valor: arredondarDinheiro(data.valor),
        status,
        vencimento: data.vencimento ?? null,
        data_pagamento: data.data_pagamento ?? (status === 'pago' || status === 'recebido' ? new Date().toISOString().slice(0, 10) : null),
        fornecedor_id: data.fornecedor_id ?? null,
        cliente_id: data.cliente_id ?? null,
        compra_id: data.compra_id ?? null,
        ordem_id: data.ordem_id ?? null,
        pedido_id: data.pedido_id ?? null,
        observacoes: data.observacoes ?? null,
      });
    res.status(201).json(mapLancamento(getLancamento.get(Number(info.lastInsertRowid), empresaId) as FinanceiroLancamento));
  });

  router.patch('/lancamentos/:id', (req, res) => {
    const id = Number(req.params.id);
    const empresaId = empresaDaSessao(req);
    const atual = db
      .prepare('SELECT * FROM financeiro_lancamentos WHERE id = ? AND empresa_id = ?')
      .get(id, empresaId) as FinanceiroLancamento | undefined;
    if (!atual) return res.status(404).json({ erro: 'Lançamento não encontrado' });
    const parsed = atualizarLancamentoSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        erro: 'Dados inválidos',
        detalhes: parsed.error.flatten().fieldErrors,
        form: parsed.error.flatten().formErrors,
      });
    }
    const data = parsed.data;
    const clienteId = data.cliente_id !== undefined ? data.cliente_id : atual.cliente_id;
    const fornecedorId = data.fornecedor_id !== undefined ? data.fornecedor_id : atual.fornecedor_id;
    if (!pertenceAEmpresa(db, 'clientes', clienteId, empresaId)) {
      return res.status(404).json({ erro: 'Cliente não encontrado' });
    }
    if (!pertenceAEmpresa(db, 'fornecedores', fornecedorId, empresaId)) {
      return res.status(404).json({ erro: 'Fornecedor não encontrado' });
    }
    const tipo = data.tipo ?? atual.tipo;
    const status = data.status ?? atual.status;
    if (tipo === 'pagar' && status === 'recebido') {
      return res.status(400).json({ erro: 'Conta a pagar não usa status recebido' });
    }
    if (tipo === 'receber' && status === 'pago') {
      return res.status(400).json({ erro: 'Conta a receber não usa status pago' });
    }
    if (atual.compra_id && data.valor !== undefined && atual.status !== 'pendente') {
      return res.status(409).json({
        erro: 'Não altere o valor de um lançamento de compra já baixado',
      });
    }
    let dataPagamento = data.data_pagamento !== undefined ? data.data_pagamento ?? null : atual.data_pagamento;
    if ((status === 'pago' || status === 'recebido') && !dataPagamento) {
      dataPagamento = new Date().toISOString().slice(0, 10);
    }
    if (status === 'pendente' && atual.status !== 'pendente') {
      dataPagamento = null;
    }
    db.prepare(
      `UPDATE financeiro_lancamentos SET
         tipo = @tipo,
         categoria_id = @categoria_id,
         descricao = @descricao,
         valor = @valor,
         status = @status,
         vencimento = @vencimento,
         data_pagamento = @data_pagamento,
         fornecedor_id = @fornecedor_id,
         cliente_id = @cliente_id,
         observacoes = @observacoes,
         atualizado_em = datetime('now')
       WHERE id = @id AND empresa_id = @empresa_id`,
    ).run({
      id,
      empresa_id: empresaId,
      tipo,
      categoria_id: data.categoria_id !== undefined ? data.categoria_id : atual.categoria_id,
      descricao: data.descricao ?? atual.descricao,
      valor: arredondarDinheiro(data.valor ?? atual.valor),
      status,
      vencimento: data.vencimento !== undefined ? data.vencimento ?? null : atual.vencimento,
      data_pagamento: dataPagamento,
      fornecedor_id: fornecedorId,
      cliente_id: clienteId,
      observacoes: data.observacoes !== undefined ? data.observacoes ?? null : atual.observacoes,
    });
    res.json(mapLancamento(getLancamento.get(id, empresaId) as FinanceiroLancamento));
  });

  router.delete('/lancamentos/:id', (req, res) => {
    const id = Number(req.params.id);
    const empresaId = empresaDaSessao(req);
    const atual = db
      .prepare('SELECT * FROM financeiro_lancamentos WHERE id = ? AND empresa_id = ?')
      .get(id, empresaId) as FinanceiroLancamento | undefined;
    if (!atual) return res.status(404).json({ erro: 'Lançamento não encontrado' });
    if (atual.compra_id) {
      return res.status(409).json({
        erro: 'Lançamento gerado pela compra; cancele a compra ou o lançamento',
      });
    }
    if ((atual as FinanceiroLancamento & { pedido_id?: number | null }).pedido_id) {
      return res.status(409).json({
        erro: 'Lançamento gerado pelo pedido; cancele o pedido ou o lançamento',
      });
    }
    if (atual.status === 'pago' || atual.status === 'recebido') {
      return res.status(409).json({ erro: 'Não exclua um lançamento já baixado' });
    }
    db.prepare('DELETE FROM financeiro_lancamentos WHERE id = ? AND empresa_id = ?').run(id, empresaId);
    res.status(204).send();
  });

  return router;
}
