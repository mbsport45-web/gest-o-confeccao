import { Router } from 'express';
import { z } from 'zod';
import type { AppDatabase } from './db.js';
import { arredondarDinheiro, sincronizarContaReceberPedido } from './financeiro.js';

export const STATUS_PEDIDO = [
  'orcamento',
  'aberto',
  'confirmado',
  'em_producao',
  'pronto',
  'faturado',
  'entregue',
  'cancelado',
] as const;
export type StatusPedido = (typeof STATUS_PEDIDO)[number];

export const PRIORIDADES_PEDIDO = ['baixa', 'normal', 'alta', 'urgente'] as const;

const TRANSICOES: Record<StatusPedido, StatusPedido[]> = {
  orcamento: ['aberto', 'confirmado', 'cancelado'],
  aberto: ['orcamento', 'confirmado', 'cancelado'],
  confirmado: ['em_producao', 'faturado', 'cancelado'],
  em_producao: ['pronto', 'faturado', 'cancelado'],
  pronto: ['faturado', 'entregue', 'cancelado'],
  faturado: ['entregue'],
  entregue: [],
  cancelado: [],
};

const EDITAVEL = new Set<StatusPedido>(['orcamento', 'aberto']);
const OP_EM_ANDAMENTO = new Set([
  'corte',
  'costura',
  'acabamento',
  'qualidade',
  'embalagem',
  'em_producao',
]);

const textoOpcional = z
  .string()
  .trim()
  .max(200)
  .optional()
  .or(z.literal(''))
  .transform((v) => (v ? v : undefined));

const itemSchema = z.object({
  produto_id: z.number().int().positive(),
  variante_id: z.number().int().positive().optional().nullable(),
  quantidade: z.number().int().positive('quantidade deve ser maior que zero'),
  preco_unitario: z.number().min(0, 'preço não pode ser negativo'),
  desconto: z.number().min(0).optional(),
});

const pedidoBaseSchema = z.object({
  codigo: textoOpcional,
  cliente_id: z.number().int().positive(),
  data_pedido: textoOpcional,
  data_prevista: textoOpcional,
  status: z.enum(STATUS_PEDIDO).optional(),
  prioridade: z.enum(PRIORIDADES_PEDIDO).optional(),
  observacoes: z
    .string()
    .trim()
    .max(4000)
    .optional()
    .or(z.literal(''))
    .transform((v) => (v ? v : undefined)),
  desconto: z.number().min(0).optional(),
  frete: z.number().min(0).optional(),
  itens: z.array(itemSchema).optional(),
});

const atualizarPedidoSchema = pedidoBaseSchema
  .partial()
  .extend({
    cliente_id: z.number().int().positive().optional(),
  })
  .refine((body) => Object.keys(body).length > 0, {
    message: 'Informe ao menos um campo para atualizar',
  });

export interface PedidoItem {
  id: number;
  pedido_id: number;
  produto_id: number;
  variante_id: number | null;
  quantidade: number;
  preco_unitario: number;
  desconto: number;
  total: number;
  quantidade_reservada: number;
  criado_em: string;
  produto?: string | null;
  sku?: string | null;
  cor?: string | null;
  tamanho?: string | null;
  ordem_id?: number | null;
  ordem_codigo?: string | null;
  ordem_status?: string | null;
}

export interface PedidoVenda {
  id: number;
  codigo: string | null;
  cliente_id: number;
  data_pedido: string;
  data_prevista: string | null;
  status: StatusPedido;
  prioridade: (typeof PRIORIDADES_PEDIDO)[number];
  observacoes: string | null;
  subtotal: number;
  desconto: number;
  frete: number;
  total: number;
  criado_em: string;
  atualizado_em: string;
  cliente?: string;
  produtos?: string | null;
  quantidade?: number;
  itens?: PedidoItem[];
  ordens?: Array<{
    id: number;
    codigo: string | null;
    status: string;
    produto: string;
    quantidade: number;
    pedido_item_id: number | null;
  }>;
  financeiro?: {
    id: number;
    status: string;
    valor: number;
    vencimento: string | null;
    descricao: string;
  } | null;
}

const PEDIDO_SELECT = `
  SELECT
    p.*,
    c.nome AS cliente,
    (SELECT ifnull(SUM(i.quantidade),0) FROM pedido_itens i WHERE i.pedido_id = p.id) AS quantidade,
    (SELECT GROUP_CONCAT(pr.nome, ', ')
       FROM pedido_itens i JOIN produtos pr ON pr.id = i.produto_id
      WHERE i.pedido_id = p.id) AS produtos
  FROM pedidos p
  JOIN clientes c ON c.id = p.cliente_id
`;

const ITEM_SELECT = `
  SELECT
    i.*,
    pr.nome AS produto,
    CASE WHEN i.variante_id IS NOT NULL THEN v.sku ELSE pr.sku END AS sku,
    v.cor, v.tamanho,
    o.id AS ordem_id,
    o.codigo AS ordem_codigo,
    o.status AS ordem_status
  FROM pedido_itens i
  JOIN produtos pr ON pr.id = i.produto_id
  LEFT JOIN produto_variantes v ON v.id = i.variante_id
  LEFT JOIN ordens_producao o ON o.id = (
    SELECT ox.id FROM ordens_producao ox
     WHERE ox.pedido_item_id = i.id AND ox.status != 'cancelada'
     ORDER BY ox.id DESC LIMIT 1
  )
`;

function hoje(): string {
  return new Date().toISOString().slice(0, 10);
}

function podeTransicionar(de: StatusPedido, para: StatusPedido): boolean {
  if (de === para) return true;
  return TRANSICOES[de].includes(para);
}

export function sincronizarStatusPedidoFromOps(db: AppDatabase, ordemId: number) {
  const op = db
    .prepare('SELECT pedido_id FROM ordens_producao WHERE id = ?')
    .get(ordemId) as { pedido_id: number | null } | undefined;
  if (!op?.pedido_id) return;
  const pedido = db
    .prepare('SELECT id, status FROM pedidos WHERE id = ?')
    .get(op.pedido_id) as { id: number; status: string } | undefined;
  if (!pedido || pedido.status !== 'em_producao') return;
  const ops = db
    .prepare(`SELECT status FROM ordens_producao WHERE pedido_id = ?`)
    .all(pedido.id) as { status: string }[];
  const ativas = ops.filter((o) => o.status !== 'cancelada');
  if (ativas.length === 0) return;
  if (ativas.every((o) => o.status === 'concluida')) {
    db.prepare(
      `UPDATE pedidos SET status = 'pronto', atualizado_em = datetime('now') WHERE id = ?`,
    ).run(pedido.id);
  }
}

export function createPedidosRouter(db: AppDatabase): Router {
  const router = Router();
  const getPedidoStmt = db.prepare(`${PEDIDO_SELECT} WHERE p.id = ?`);
  const listItensStmt = db.prepare(`${ITEM_SELECT} WHERE i.pedido_id = ? ORDER BY i.id ASC`);

  function mapItens(pedidoId: number): PedidoItem[] {
    return listItensStmt.all(pedidoId) as PedidoItem[];
  }

  function mapPedido(id: number, detalhe = false): PedidoVenda | undefined {
    const row = getPedidoStmt.get(id) as PedidoVenda | undefined;
    if (!row) return undefined;
    if (detalhe) {
      row.itens = mapItens(id);
      row.ordens = db
        .prepare(
          `SELECT id, codigo, status, produto, quantidade, pedido_item_id
             FROM ordens_producao WHERE pedido_id = ? ORDER BY id ASC`,
        )
        .all(id) as PedidoVenda['ordens'];
      const fin = db
        .prepare(
          `SELECT id, status, valor, vencimento, descricao
             FROM financeiro_lancamentos
            WHERE pedido_id = ? AND tipo = 'receber'
            ORDER BY id DESC LIMIT 1`,
        )
        .get(id) as PedidoVenda['financeiro'] | undefined;
      row.financeiro = fin ?? null;
    }
    return row;
  }

  function recalc(pedidoId: number) {
    const itens = db
      .prepare(`SELECT ifnull(SUM(total),0) AS subtotal FROM pedido_itens WHERE pedido_id = ?`)
      .get(pedidoId) as { subtotal: number };
    const pedido = db
      .prepare('SELECT desconto, frete, status FROM pedidos WHERE id = ?')
      .get(pedidoId) as { desconto: number; frete: number; status: string };
    const subtotal = arredondarDinheiro(itens.subtotal);
    const desconto = Math.min(pedido.desconto, subtotal);
    const total = arredondarDinheiro(subtotal - desconto + pedido.frete);
    db.prepare(
      `UPDATE pedidos
          SET subtotal = @subtotal, desconto = @desconto, total = @total, atualizado_em = datetime('now')
        WHERE id = @id`,
    ).run({ id: pedidoId, subtotal, desconto, total });
    const atual = mapPedido(pedidoId);
    if (atual) sincronizarContaReceberPedido(db, atual, { criar: false });
    return atual;
  }

  function validarItem(item: z.infer<typeof itemSchema>): {
    produtoId: number;
    varianteId: number | null;
    preco: number;
  } {
    const produto = db
      .prepare('SELECT id, preco_venda FROM produtos WHERE id = ?')
      .get(item.produto_id) as { id: number; preco_venda: number } | undefined;
    if (!produto) {
      throw Object.assign(new Error('Produto não encontrado'), { status: 404 });
    }
    const nVar = (
      db
        .prepare('SELECT COUNT(*) AS n FROM produto_variantes WHERE produto_id = ?')
        .get(item.produto_id) as { n: number }
    ).n;
    const varianteId = item.variante_id ?? null;
    const preco = item.preco_unitario;
    if (varianteId) {
      const v = db
        .prepare(
          'SELECT id, produto_id, preco_venda FROM produto_variantes WHERE id = ?',
        )
        .get(varianteId) as
        | { id: number; produto_id: number; preco_venda: number | null }
        | undefined;
      if (!v) throw Object.assign(new Error('Variante não encontrada'), { status: 404 });
      if (v.produto_id !== item.produto_id) {
        throw Object.assign(new Error('Variante não pertence ao produto'), { status: 400 });
      }
    } else if (nVar > 0) {
      throw Object.assign(new Error('Produto possui variantes; informe variante_id'), {
        status: 400,
      });
    }
    if (preco < 0) {
      throw Object.assign(new Error('preço não pode ser negativo'), { status: 400 });
    }
    return { produtoId: produto.id, varianteId, preco };
  }

  function totalItem(qtd: number, preco: number, desconto: number): number {
    return arredondarDinheiro(Math.max(0, qtd * preco - desconto));
  }

  function inserirItem(pedidoId: number, item: z.infer<typeof itemSchema>) {
    const alvo = validarItem(item);
    const desconto = item.desconto ?? 0;
    const total = totalItem(item.quantidade, alvo.preco, desconto);
    const info = db
      .prepare(
        `INSERT INTO pedido_itens (
           pedido_id, produto_id, variante_id, quantidade, preco_unitario, desconto, total
         ) VALUES (
           @pedido_id, @produto_id, @variante_id, @quantidade, @preco_unitario, @desconto, @total
         )`,
      )
      .run({
        pedido_id: pedidoId,
        produto_id: alvo.produtoId,
        variante_id: alvo.varianteId,
        quantidade: item.quantidade,
        preco_unitario: alvo.preco,
        desconto,
        total,
      });
    return Number(info.lastInsertRowid);
  }

  function aplicarReserva(pedidoId: number, reservar: boolean) {
    db.prepare(
      reservar
        ? `UPDATE pedido_itens SET quantidade_reservada = quantidade WHERE pedido_id = ?`
        : `UPDATE pedido_itens SET quantidade_reservada = 0 WHERE pedido_id = ?`,
    ).run(pedidoId);
  }

  function copiarBom(ordemId: number, produtoId: number, varianteId: number | null, qtd: number) {
    let linhas = varianteId
      ? (db
          .prepare(
            `SELECT materia_prima_id, quantidade, unidade FROM produto_bom_itens WHERE variante_id = ?`,
          )
          .all(varianteId) as Array<{ materia_prima_id: number; quantidade: number; unidade: string | null }>)
      : [];
    if (!linhas.length) {
      linhas = db
        .prepare(
          `SELECT materia_prima_id, quantidade, unidade FROM produto_bom_itens
            WHERE produto_id = ? AND variante_id IS NULL`,
        )
        .all(produtoId) as Array<{ materia_prima_id: number; quantidade: number; unidade: string | null }>;
    }
    const insert = db.prepare(
      `INSERT INTO ordem_requisitos (
         ordem_id, materia_prima_id, quantidade_unitaria, quantidade_total, unidade
       ) VALUES (?, ?, ?, ?, ?)`,
    );
    for (const linha of linhas) {
      insert.run(
        ordemId,
        linha.materia_prima_id,
        linha.quantidade,
        linha.quantidade * qtd,
        linha.unidade,
      );
    }
  }

  function criarOpDoItem(pedido: PedidoVenda, item: PedidoItem, forcar: boolean) {
    const existente = db
      .prepare(
        `SELECT id, codigo FROM ordens_producao
          WHERE pedido_item_id = ? AND status != 'cancelada'`,
      )
      .get(item.id) as { id: number; codigo: string | null } | undefined;
    if (existente && !forcar) {
      throw Object.assign(
        new Error(`Item já possui OP ${existente.codigo ?? existente.id}`),
        { status: 409 },
      );
    }

    const cliente = db
      .prepare('SELECT nome FROM clientes WHERE id = ?')
      .get(pedido.cliente_id) as { nome: string };
    const produto = db
      .prepare('SELECT nome FROM produtos WHERE id = ?')
      .get(item.produto_id) as { nome: string };
    let tamanho = item.tamanho ?? '';
    if (item.variante_id) {
      const v = db
        .prepare('SELECT tamanho FROM produto_variantes WHERE id = ?')
        .get(item.variante_id) as { tamanho: string } | undefined;
      tamanho = v?.tamanho ?? tamanho;
    }
    if (!tamanho) tamanho = 'U';

    const info = db
      .prepare(
        `INSERT INTO ordens_producao (
           cliente, produto, tamanho, quantidade, status,
           cliente_id, produto_id, variante_id,
           prioridade, data_prevista, observacoes,
           pedido_id, pedido_item_id, atualizado_em
         ) VALUES (
           @cliente, @produto, @tamanho, @quantidade, 'planejada',
           @cliente_id, @produto_id, @variante_id,
           @prioridade, @data_prevista, @observacoes,
           @pedido_id, @pedido_item_id, datetime('now')
         )`,
      )
      .run({
        cliente: cliente.nome,
        produto: produto.nome,
        tamanho,
        quantidade: item.quantidade,
        cliente_id: pedido.cliente_id,
        produto_id: item.produto_id,
        variante_id: item.variante_id,
        prioridade: pedido.prioridade,
        data_prevista: pedido.data_prevista,
        observacoes: `Pedido ${pedido.codigo ?? pedido.id}`,
        pedido_id: pedido.id,
        pedido_item_id: item.id,
      });
    const id = Number(info.lastInsertRowid);
    const codigo = `OP-${String(id).padStart(4, '0')}`;
    db.prepare(
      `UPDATE ordens_producao SET codigo = @codigo, atualizado_em = datetime('now') WHERE id = @id`,
    ).run({ id, codigo });
    copiarBom(id, item.produto_id, item.variante_id, item.quantidade);
    return { id, codigo };
  }

  function filtroListagem(req: { query: Record<string, unknown> }) {
    const pagina = Math.max(1, Number(req.query.pagina ?? 1) || 1);
    const porPagina = Math.min(100, Math.max(1, Number(req.query.por_pagina ?? 10) || 10));
    const q = String(req.query.q ?? '').trim();
    const status = String(req.query.status ?? '').trim();
    const prioridade = String(req.query.prioridade ?? '').trim();
    const clienteId = Number(req.query.cliente_id ?? 0);
    const produtoId = Number(req.query.produto_id ?? 0);
    const de = String(req.query.de ?? '').trim();
    const ate = String(req.query.ate ?? '').trim();
    const where: string[] = [];
    const params: Record<string, string | number> = {};
    if (q) {
      where.push(
        `(ifnull(p.codigo,'') LIKE @q OR c.nome LIKE @q OR ifnull(p.observacoes,'') LIKE @q
          OR EXISTS (
            SELECT 1 FROM pedido_itens i
            JOIN produtos pr ON pr.id = i.produto_id
            LEFT JOIN produto_variantes v ON v.id = i.variante_id
            WHERE i.pedido_id = p.id
              AND (pr.nome LIKE @q OR ifnull(pr.sku,'') LIKE @q OR ifnull(v.sku,'') LIKE @q)
          ))`,
      );
      params.q = `%${q}%`;
    }
    if ((STATUS_PEDIDO as readonly string[]).includes(status)) {
      where.push('p.status = @status');
      params.status = status;
    }
    if ((PRIORIDADES_PEDIDO as readonly string[]).includes(prioridade)) {
      where.push('p.prioridade = @prioridade');
      params.prioridade = prioridade;
    }
    if (clienteId > 0) {
      where.push('p.cliente_id = @cliente_id');
      params.cliente_id = clienteId;
    }
    if (produtoId > 0) {
      where.push(
        `EXISTS (SELECT 1 FROM pedido_itens i WHERE i.pedido_id = p.id AND i.produto_id = @produto_id)`,
      );
      params.produto_id = produtoId;
    }
    if (de) {
      where.push('date(p.data_pedido) >= date(@de)');
      params.de = de;
    }
    if (ate) {
      where.push('date(p.data_pedido) <= date(@ate)');
      params.ate = ate;
    }
    const filtro = where.length ? `WHERE ${where.join(' AND ')}` : '';
    return { pagina, porPagina, params, from: `${PEDIDO_SELECT} ${filtro}` };
  }

  router.get('/resumo', (req, res) => {
    const de = String(req.query.de ?? '').trim();
    const ate = String(req.query.ate ?? '').trim();
    const where: string[] = [`status != 'cancelado'`];
    const params: Record<string, string> = {};
    if (de) {
      where.push('date(data_pedido) >= date(@de)');
      params.de = de;
    }
    if (ate) {
      where.push('date(data_pedido) <= date(@ate)');
      params.ate = ate;
    }
    const filtro = `WHERE ${where.join(' AND ')}`;
    const porStatus = db
      .prepare(
        `SELECT status, COUNT(*) AS n, ifnull(SUM(total),0) AS total
           FROM pedidos ${filtro}
          GROUP BY status`,
      )
      .all(params) as Array<{ status: string; n: number; total: number }>;
    const mapa = Object.fromEntries(porStatus.map((s) => [s.status, s]));
    const atrasados = (
      db
        .prepare(
          `SELECT COUNT(*) AS n FROM pedidos
            WHERE status NOT IN ('entregue','cancelado','faturado')
              AND data_prevista IS NOT NULL
              AND date(data_prevista) < date('now')
              ${de ? 'AND date(data_pedido) >= date(@de)' : ''}
              ${ate ? 'AND date(data_pedido) <= date(@ate)' : ''}`,
        )
        .get(params) as { n: number }
    ).n;
    const vendido = (
      db
        .prepare(
          `SELECT ifnull(SUM(total),0) AS total FROM pedidos ${filtro} AND status != 'orcamento'`,
        )
        .get(params) as { total: number }
    ).total;
    const totalPedidos = porStatus.reduce((acc, s) => acc + s.n, 0);
    res.json({
      total: totalPedidos,
      abertos: (mapa.aberto?.n ?? 0) + (mapa.orcamento?.n ?? 0),
      confirmados: mapa.confirmado?.n ?? 0,
      em_producao: mapa.em_producao?.n ?? 0,
      prontos: mapa.pronto?.n ?? 0,
      faturados: mapa.faturado?.n ?? 0,
      entregues: mapa.entregue?.n ?? 0,
      atrasados,
      total_vendido: arredondarDinheiro(vendido),
      por_status: porStatus,
    });
  });

  router.get('/', (req, res) => {
    const { pagina, porPagina, params, from } = filtroListagem(req);
    const fromClause = from.replace(PEDIDO_SELECT, '').trim();
    const join = `FROM pedidos p JOIN clientes c ON c.id = p.cliente_id ${fromClause}`;
    const total = (db.prepare(`SELECT COUNT(*) AS n ${join}`).get(params) as { n: number }).n;
    const totais = db
      .prepare(`SELECT ifnull(SUM(p.total),0) AS valor, ifnull(SUM((SELECT SUM(i.quantidade) FROM pedido_itens i WHERE i.pedido_id = p.id)),0) AS quantidade ${join}`)
      .get(params) as { valor: number; quantidade: number };
    const data = db
      .prepare(
        `${from} ORDER BY datetime(p.criado_em) DESC, p.id DESC LIMIT @limit OFFSET @offset`,
      )
      .all({ ...params, limit: porPagina, offset: (pagina - 1) * porPagina });
    res.json({
      data,
      pagina,
      por_pagina: porPagina,
      total,
      total_paginas: Math.max(1, Math.ceil(total / porPagina)),
      totais: {
        valor: arredondarDinheiro(totais.valor),
        quantidade: totais.quantidade,
      },
    });
  });

  router.get('/:id', (req, res) => {
    const pedido = mapPedido(Number(req.params.id), true);
    if (!pedido) return res.status(404).json({ erro: 'Pedido não encontrado' });
    res.json(pedido);
  });

  router.post('/', (req, res) => {
    const parsed = pedidoBaseSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        erro: 'Dados inválidos',
        detalhes: parsed.error.flatten().fieldErrors,
        form: parsed.error.flatten().formErrors,
      });
    }
    const data = parsed.data;
    const cliente = db.prepare('SELECT id FROM clientes WHERE id = ?').get(data.cliente_id);
    if (!cliente) return res.status(404).json({ erro: 'Cliente não encontrado' });
    if (data.status && !['orcamento', 'aberto'].includes(data.status)) {
      return res.status(400).json({ erro: 'Novo pedido deve nascer como orçamento ou aberto' });
    }
    if (data.status === 'aberto' && (!data.itens || data.itens.length === 0)) {
      return res.status(400).json({ erro: 'Abra o pedido com ao menos um item' });
    }

    try {
      const criar = db.transaction(() => {
        const info = db
          .prepare(
            `INSERT INTO pedidos (
               codigo, cliente_id, data_pedido, data_prevista, status, prioridade,
               observacoes, desconto, frete
             ) VALUES (
               @codigo, @cliente_id, @data_pedido, @data_prevista, @status, @prioridade,
               @observacoes, @desconto, @frete
             )`,
          )
          .run({
            codigo: data.codigo ?? null,
            cliente_id: data.cliente_id,
            data_pedido: data.data_pedido ?? hoje(),
            data_prevista: data.data_prevista ?? null,
            status: data.status ?? 'orcamento',
            prioridade: data.prioridade ?? 'normal',
            observacoes: data.observacoes ?? null,
            desconto: data.desconto ?? 0,
            frete: data.frete ?? 0,
          });
        const id = Number(info.lastInsertRowid);
        if (!data.codigo) {
          db.prepare('UPDATE pedidos SET codigo = @codigo WHERE id = @id').run({
            id,
            codigo: `PV-${String(id).padStart(4, '0')}`,
          });
        }
        for (const item of data.itens ?? []) inserirItem(id, item);
        recalc(id);
        return id;
      });
      const id = criar();
      res.status(201).json(mapPedido(id, true));
    } catch (err) {
      const status = (err as { status?: number }).status ?? 400;
      if (err instanceof Error && /UNIQUE/i.test(err.message)) {
        return res.status(409).json({ erro: 'Código de pedido já cadastrado' });
      }
      return res.status(status).json({ erro: (err as Error).message });
    }
  });

  router.patch('/:id', (req, res) => {
    const id = Number(req.params.id);
    const atual = mapPedido(id, true);
    if (!atual) return res.status(404).json({ erro: 'Pedido não encontrado' });
    const parsed = atualizarPedidoSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        erro: 'Dados inválidos',
        detalhes: parsed.error.flatten().fieldErrors,
        form: parsed.error.flatten().formErrors,
      });
    }
    const data = parsed.data;
    if (atual.status === 'cancelado' || atual.status === 'entregue') {
      return res.status(409).json({ erro: 'Pedido encerrado não pode ser editado' });
    }
    if (data.status && data.status !== atual.status) {
      if (!podeTransicionar(atual.status, data.status as StatusPedido)) {
        return res.status(409).json({
          erro: `Transição de ${atual.status} para ${data.status} não é permitida`,
        });
      }
      if (data.status === 'confirmado' && (atual.itens?.length ?? 0) === 0 && !data.itens?.length) {
        return res.status(400).json({ erro: 'Confirme o pedido com ao menos um item' });
      }
      if (data.status === 'cancelado') {
        const ops = db
          .prepare(`SELECT status FROM ordens_producao WHERE pedido_id = ?`)
          .all(id) as { status: string }[];
        if (ops.some((o) => OP_EM_ANDAMENTO.has(o.status))) {
          return res.status(409).json({
            erro: 'Não cancele um pedido com OP já em produção',
          });
        }
      }
    }
    if (data.itens && !EDITAVEL.has(atual.status)) {
      return res.status(409).json({ erro: 'Itens só podem ser substituídos em orçamento ou aberto' });
    }
    const camposExtras = Object.keys(data).filter(
      (k) => !['observacoes', 'status', 'data_prevista', 'prioridade'].includes(k),
    );
    if (!EDITAVEL.has(atual.status) && camposExtras.length > 0 && data.status === undefined) {
      return res.status(409).json({ erro: 'Pedido confirmado só permite observações, previsão ou prioridade' });
    }
    if (data.cliente_id) {
      const c = db.prepare('SELECT id FROM clientes WHERE id = ?').get(data.cliente_id);
      if (!c) return res.status(404).json({ erro: 'Cliente não encontrado' });
    }

    try {
      db.transaction(() => {
        db.prepare(
          `UPDATE pedidos SET
             cliente_id = @cliente_id,
             data_pedido = @data_pedido,
             data_prevista = @data_prevista,
             status = @status,
             prioridade = @prioridade,
             observacoes = @observacoes,
             desconto = @desconto,
             frete = @frete,
             codigo = @codigo,
             atualizado_em = datetime('now')
           WHERE id = @id`,
        ).run({
          id,
          cliente_id: data.cliente_id ?? atual.cliente_id,
          data_pedido: data.data_pedido ?? atual.data_pedido,
          data_prevista:
            data.data_prevista !== undefined ? data.data_prevista ?? null : atual.data_prevista,
          status: data.status ?? atual.status,
          prioridade: data.prioridade ?? atual.prioridade,
          observacoes: data.observacoes !== undefined ? data.observacoes ?? null : atual.observacoes,
          desconto: data.desconto ?? atual.desconto,
          frete: data.frete ?? atual.frete,
          codigo: data.codigo ?? atual.codigo,
        });
        if (data.itens) {
          db.prepare('DELETE FROM pedido_itens WHERE pedido_id = ?').run(id);
          for (const item of data.itens) inserirItem(id, item);
        }
        const novoStatus = (data.status ?? atual.status) as StatusPedido;
        if (novoStatus === 'confirmado' || novoStatus === 'em_producao') aplicarReserva(id, true);
        if (novoStatus === 'cancelado') aplicarReserva(id, false);
        recalc(id);
        const after = mapPedido(id);
        if (after && novoStatus === 'cancelado') {
          sincronizarContaReceberPedido(db, after, { criar: false });
          db.prepare(
            `UPDATE ordens_producao SET status = 'cancelada', atualizado_em = datetime('now')
              WHERE pedido_id = ? AND status IN ('planejada','pendente')`,
          ).run(id);
        }
      })();
      res.json(mapPedido(id, true));
    } catch (err) {
      const status = (err as { status?: number }).status ?? 400;
      return res.status(status).json({ erro: (err as Error).message });
    }
  });

  router.post('/:id/itens', (req, res) => {
    const pedido = mapPedido(Number(req.params.id));
    if (!pedido) return res.status(404).json({ erro: 'Pedido não encontrado' });
    if (!EDITAVEL.has(pedido.status)) {
      return res.status(409).json({ erro: 'Itens só podem ser incluídos em orçamento ou aberto' });
    }
    const parsed = itemSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        erro: 'Dados inválidos',
        detalhes: parsed.error.flatten().fieldErrors,
      });
    }
    try {
      db.transaction(() => {
        inserirItem(pedido.id, parsed.data);
        recalc(pedido.id);
      })();
      res.status(201).json(mapPedido(pedido.id, true));
    } catch (err) {
      const status = (err as { status?: number }).status ?? 400;
      return res.status(status).json({ erro: (err as Error).message });
    }
  });

  router.patch('/:id/itens/:itemId', (req, res) => {
    const pedido = mapPedido(Number(req.params.id));
    if (!pedido) return res.status(404).json({ erro: 'Pedido não encontrado' });
    if (!EDITAVEL.has(pedido.status)) {
      return res.status(409).json({ erro: 'Itens só podem ser editados em orçamento ou aberto' });
    }
    const itemId = Number(req.params.itemId);
    const item = db
      .prepare('SELECT * FROM pedido_itens WHERE id = ? AND pedido_id = ?')
      .get(itemId, pedido.id) as PedidoItem | undefined;
    if (!item) return res.status(404).json({ erro: 'Item não encontrado' });
    const parsed = itemSchema
      .partial()
      .refine((body) => Object.keys(body).length > 0, {
        message: 'Informe ao menos um campo para atualizar',
      })
      .safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        erro: 'Dados inválidos',
        detalhes: parsed.error.flatten().fieldErrors,
      });
    }
    const data = parsed.data;
    const produtoId = data.produto_id ?? item.produto_id;
    const varianteId = data.variante_id !== undefined ? data.variante_id : item.variante_id;
    validarItem({
      produto_id: produtoId,
      variante_id: varianteId,
      quantidade: data.quantidade ?? item.quantidade,
      preco_unitario: data.preco_unitario ?? item.preco_unitario,
      desconto: data.desconto ?? item.desconto,
    });
    const quantidade = data.quantidade ?? item.quantidade;
    const preco = data.preco_unitario ?? item.preco_unitario;
    const desconto = data.desconto ?? item.desconto;
    db.prepare(
      `UPDATE pedido_itens SET
         produto_id = @produto_id, variante_id = @variante_id,
         quantidade = @quantidade, preco_unitario = @preco_unitario,
         desconto = @desconto, total = @total
       WHERE id = @id`,
    ).run({
      id: itemId,
      produto_id: produtoId,
      variante_id: varianteId,
      quantidade,
      preco_unitario: preco,
      desconto,
      total: totalItem(quantidade, preco, desconto),
    });
    recalc(pedido.id);
    res.json(mapPedido(pedido.id, true));
  });

  router.delete('/:id/itens/:itemId', (req, res) => {
    const pedido = mapPedido(Number(req.params.id));
    if (!pedido) return res.status(404).json({ erro: 'Pedido não encontrado' });
    if (!EDITAVEL.has(pedido.status)) {
      return res.status(409).json({ erro: 'Itens só podem ser removidos em orçamento ou aberto' });
    }
    const info = db
      .prepare('DELETE FROM pedido_itens WHERE id = ? AND pedido_id = ?')
      .run(Number(req.params.itemId), pedido.id);
    if (info.changes === 0) return res.status(404).json({ erro: 'Item não encontrado' });
    recalc(pedido.id);
    res.json(mapPedido(pedido.id, true));
  });

  router.post('/:id/gerar-op', (req, res) => {
    const pedido = mapPedido(Number(req.params.id), true);
    if (!pedido) return res.status(404).json({ erro: 'Pedido não encontrado' });
    if (!['confirmado', 'em_producao', 'pronto'].includes(pedido.status)) {
      return res.status(409).json({ erro: 'Confirme o pedido antes de gerar OP' });
    }
    const parsed = z
      .object({
        item_ids: z.array(z.number().int().positive()).optional(),
        forcar: z.boolean().optional(),
      })
      .safeParse(req.body ?? {});
    if (!parsed.success) {
      return res.status(400).json({ erro: 'Dados inválidos', detalhes: parsed.error.flatten().fieldErrors });
    }
    const itens = pedido.itens ?? [];
    const ids = parsed.data.item_ids?.length
      ? parsed.data.item_ids
      : itens.map((i) => i.id);
    const escolhidos = itens.filter((i) => ids.includes(i.id));
    if (escolhidos.length === 0) {
      return res.status(400).json({ erro: 'Nenhum item para gerar OP' });
    }

    try {
      const geradas: Array<{ id: number; codigo: string }> = [];
      db.transaction(() => {
        for (const item of escolhidos) {
          geradas.push(criarOpDoItem(pedido, item, Boolean(parsed.data.forcar)));
        }
        if (pedido.status === 'confirmado') {
          db.prepare(
            `UPDATE pedidos SET status = 'em_producao', atualizado_em = datetime('now') WHERE id = ?`,
          ).run(pedido.id);
        }
      })();
      const atualizado = mapPedido(pedido.id, true)!;
      res.status(201).json({ ...atualizado, ops_geradas: geradas });
    } catch (err) {
      const status = (err as { status?: number }).status ?? 400;
      return res.status(status).json({ erro: (err as Error).message });
    }
  });

  router.post('/:id/financeiro', (req, res) => {
    const pedido = mapPedido(Number(req.params.id), true);
    if (!pedido) return res.status(404).json({ erro: 'Pedido não encontrado' });
    if (['orcamento', 'aberto', 'cancelado'].includes(pedido.status)) {
      return res.status(409).json({
        erro: 'Gere o financeiro apenas para pedidos confirmados ou posteriores',
      });
    }
    if (pedido.total <= 0) {
      return res.status(400).json({ erro: 'Pedido sem valor para faturar' });
    }
    const parsed = z
      .object({ vencimento: textoOpcional })
      .safeParse(req.body ?? {});
    if (!parsed.success) {
      return res.status(400).json({ erro: 'Dados inválidos' });
    }
    const existente = db
      .prepare(
        `SELECT id FROM financeiro_lancamentos WHERE pedido_id = ? AND tipo = 'receber'`,
      )
      .get(pedido.id) as { id: number } | undefined;
    if (existente) {
      return res.status(409).json({ erro: 'Este pedido já possui conta a receber' });
    }
    try {
      db.transaction(() => {
        sincronizarContaReceberPedido(db, pedido, {
          criar: true,
          vencimento: parsed.data.vencimento ?? pedido.data_prevista,
        });
        if (['confirmado', 'em_producao', 'pronto'].includes(pedido.status)) {
          db.prepare(
            `UPDATE pedidos SET status = 'faturado', atualizado_em = datetime('now') WHERE id = ?`,
          ).run(pedido.id);
        }
      })();
      res.status(201).json(mapPedido(pedido.id, true));
    } catch (err) {
      const status = (err as { status?: number }).status ?? 400;
      return res.status(status).json({ erro: (err as Error).message });
    }
  });

  router.delete('/:id', (req, res) => {
    const pedido = mapPedido(Number(req.params.id), true);
    if (!pedido) return res.status(404).json({ erro: 'Pedido não encontrado' });
    if (pedido.status !== 'orcamento' && pedido.status !== 'cancelado') {
      return res.status(409).json({ erro: 'Exclua apenas orçamentos ou pedidos cancelados' });
    }
    const ops = (
      db
        .prepare(`SELECT COUNT(*) AS n FROM ordens_producao WHERE pedido_id = ?`)
        .get(pedido.id) as { n: number }
    ).n;
    if (ops > 0) {
      return res.status(409).json({ erro: 'Pedido possui OPs vinculadas e não pode ser excluído' });
    }
    db.prepare('DELETE FROM financeiro_lancamentos WHERE pedido_id = ?').run(pedido.id);
    db.prepare('DELETE FROM pedidos WHERE id = ?').run(pedido.id);
    res.status(204).send();
  });

  return router;
}
