import { Router, type Response } from 'express';
import type { AppDatabase } from './db.js';
import { arredondarDinheiro, statusEfetivoLancamento } from './financeiro.js';
import { STATUS_PEDIDO } from './pedidos.js';
import { aplicarEmpresa } from './tenant.js';

function periodo(req: { query: Record<string, unknown> }) {
  const de = String(req.query.de ?? '').trim();
  const ate = String(req.query.ate ?? '').trim();
  return { de, ate };
}

function csvEscape(valor: unknown): string {
  const s = valor === null || valor === undefined ? '' : String(valor);
  if (/[",\n;]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function enviarCsv(res: Response, nome: string, headers: string[], rows: unknown[][]) {
  const corpo = [headers.map(csvEscape).join(';')]
    .concat(rows.map((r) => r.map(csvEscape).join(';')))
    .join('\n');
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${nome}"`);
  res.send(`\uFEFF${corpo}\n`);
}

function querCsv(req: { query: Record<string, unknown>; headers: { accept?: string } }) {
  return String(req.query.formato ?? '').toLowerCase() === 'csv';
}

export function createRelatoriosRouter(db: AppDatabase): Router {
  const router = Router();

  router.get('/estoque', (req, res) => {
    const q = String(req.query.q ?? '').trim();
    const tipo = String(req.query.tipo ?? '').trim();
    const baixo = String(req.query.abaixo_minimo ?? '').trim();
    const pagina = Math.max(1, Number(req.query.pagina ?? 1) || 1);
    const porPagina = Math.min(200, Math.max(1, Number(req.query.por_pagina ?? 20) || 20));
    const where: string[] = [];
    const params: Record<string, string | number> = {};
    aplicarEmpresa(where, params, req, 's.empresa_id');
    if (q) {
      where.push(
        `(ifnull(p.nome,'') LIKE @q OR ifnull(m.nome,'') LIKE @q OR ifnull(v.sku,'') LIKE @q
          OR ifnull(m.codigo,'') LIKE @q)`,
      );
      params.q = `%${q}%`;
    }
    if (tipo === 'materia') where.push(`s.tipo = 'materia'`);
    else if (tipo === 'produto') where.push(`s.tipo IN ('produto','variante')`);
    const filtro = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const wrapped = `
      SELECT
        s.id, s.tipo, s.quantidade,
        CASE WHEN s.tipo = 'materia' THEN m.nome ELSE p.nome END AS nome,
        CASE WHEN s.tipo = 'materia' THEN m.codigo WHEN s.tipo = 'variante' THEN v.sku ELSE p.sku END AS codigo,
        CASE WHEN s.tipo = 'materia' THEN m.unidade ELSE p.unidade END AS unidade,
        CASE
          WHEN s.tipo = 'materia' THEN ifnull(m.estoque_minimo,0)
          WHEN s.tipo = 'variante' THEN ifnull(v.estoque_minimo, ifnull(p.estoque_minimo,0))
          ELSE ifnull(p.estoque_minimo,0)
        END AS estoque_minimo,
        CASE
          WHEN s.tipo = 'materia' THEN ifnull(m.custo,0)
          WHEN s.tipo = 'variante' THEN ifnull(v.preco_custo, ifnull(p.preco_custo,0))
          ELSE ifnull(p.preco_custo,0)
        END AS custo_unitario
      FROM estoque_saldos s
      LEFT JOIN produtos p ON p.id = s.produto_id
      LEFT JOIN produto_variantes v ON v.id = s.variante_id
      LEFT JOIN materias_primas m ON m.id = s.materia_prima_id
      ${filtro}
    `;
    const extra = baixo === '1' || baixo === 'true' ? 'WHERE quantidade < estoque_minimo' : '';
    const base = `SELECT *, (quantidade * custo_unitario) AS valor FROM (${wrapped}) ${extra}`;
    const total = (db.prepare(`SELECT COUNT(*) AS n FROM (${base})`).get(params) as { n: number }).n;
    const data = db
      .prepare(
        `${base} ORDER BY nome COLLATE NOCASE LIMIT @limit OFFSET @offset`,
      )
      .all({ ...params, limit: porPagina, offset: (pagina - 1) * porPagina }) as Array<{
      id: number;
      tipo: string;
      nome: string;
      codigo: string | null;
      quantidade: number;
      unidade: string | null;
      estoque_minimo: number;
      custo_unitario: number;
      valor: number;
    }>;
    const totais = db
      .prepare(
        `SELECT ifnull(SUM(quantidade),0) AS quantidade, ifnull(SUM(valor),0) AS valor,
                SUM(CASE WHEN quantidade < estoque_minimo THEN 1 ELSE 0 END) AS abaixo
         FROM (${base})`,
      )
      .get(params) as { quantidade: number; valor: number; abaixo: number };

    const movimentos = db
      .prepare(
        `SELECT mv.tipo, COUNT(*) AS n, ifnull(SUM(mv.quantidade),0) AS quantidade
         FROM estoque_movimentos mv
         WHERE mv.empresa_id = @empresa_id
         GROUP BY mv.tipo`,
      )
      .all(params) as Array<{ tipo: string; n: number; quantidade: number }>;

    if (querCsv(req)) {
      return enviarCsv(
        res,
        'relatorio-estoque.csv',
        ['Tipo', 'Nome', 'Código', 'Quantidade', 'Unidade', 'Mínimo', 'Custo', 'Valor'],
        data.map((d) => [
          d.tipo,
          d.nome,
          d.codigo,
          d.quantidade,
          d.unidade,
          d.estoque_minimo,
          d.custo_unitario,
          arredondarDinheiro(d.valor),
        ]),
      );
    }

    res.json({
      data: data.map((d) => ({
        ...d,
        abaixo_minimo: d.quantidade < d.estoque_minimo,
        valor: arredondarDinheiro(d.valor),
      })),
      pagina,
      por_pagina: porPagina,
      total,
      total_paginas: Math.max(1, Math.ceil(total / porPagina)),
      totais: {
        quantidade: totais.quantidade,
        valor: arredondarDinheiro(totais.valor),
        abaixo_minimo: totais.abaixo,
      },
      movimentos,
    });
  });

  router.get('/compras', (req, res) => {
    try {
    const { de, ate } = periodo(req);
    const fornecedorId = Number(req.query.fornecedor_id ?? 0);
    const status = String(req.query.status ?? '').trim();
    const pagina = Math.max(1, Number(req.query.pagina ?? 1) || 1);
    const porPagina = Math.min(200, Math.max(1, Number(req.query.por_pagina ?? 20) || 20));
    const where: string[] = [];
    const params: Record<string, string | number> = {};
    aplicarEmpresa(where, params, req, 'c.empresa_id');
    if (de) {
      where.push('date(c.data_emissao) >= date(@de)');
      params.de = de;
    }
    if (ate) {
      where.push('date(c.data_emissao) <= date(@ate)');
      params.ate = ate;
    }
    if (fornecedorId > 0) {
      where.push('c.fornecedor_id = @fornecedor_id');
      params.fornecedor_id = fornecedorId;
    }
    if (status) {
      where.push('c.status = @status');
      params.status = status;
    }
    const filtro = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const from = `FROM pedidos_compra c JOIN fornecedores f ON f.id = c.fornecedor_id ${filtro}`;
    const total = (db.prepare(`SELECT COUNT(*) AS n ${from}`).get(params) as { n: number }).n;
    const data = db
      .prepare(
        `SELECT c.id, c.codigo, c.status, c.data_emissao, c.total, c.fornecedor_id, f.nome AS fornecedor
         ${from} ORDER BY date(c.data_emissao) DESC, c.id DESC
         LIMIT @limit OFFSET @offset`,
      )
      .all({ ...params, limit: porPagina, offset: (pagina - 1) * porPagina });
    const totais = db
      .prepare(`SELECT ifnull(SUM(c.total),0) AS total ${from}`)
      .get(params) as { total: number };
    const itens = db
      .prepare(
        `SELECT
           MAX(CASE WHEN i.materia_prima_id IS NOT NULL THEN m.nome ELSE p.nome END) AS nome,
           SUM(i.quantidade) AS quantidade,
           SUM(i.total) AS total
         FROM pedido_compra_itens i
         JOIN pedidos_compra c ON c.id = i.compra_id
         LEFT JOIN materias_primas m ON m.id = i.materia_prima_id
         LEFT JOIN produtos p ON p.id = i.produto_id
         ${filtro}
         GROUP BY i.materia_prima_id, i.produto_id, i.variante_id
         ORDER BY total DESC
         LIMIT 20`,
      )
      .all(params);

    if (querCsv(req)) {
      return enviarCsv(
        res,
        'relatorio-compras.csv',
        ['Código', 'Fornecedor', 'Emissão', 'Status', 'Total'],
        (data as Array<{ codigo: string; fornecedor: string; data_emissao: string; status: string; total: number }>).map(
          (d) => [d.codigo, d.fornecedor, d.data_emissao, d.status, d.total],
        ),
      );
    }

    res.json({
      data,
      itens,
      pagina,
      por_pagina: porPagina,
      total,
      total_paginas: Math.max(1, Math.ceil(total / porPagina)),
      totais: { valor: arredondarDinheiro(totais.total) },
    });
    } catch (err) {
      res.status(500).json({ erro: (err as Error).message });
    }
  });

  router.get('/financeiro', (req, res) => {
    const { de, ate } = periodo(req);
    const where: string[] = [];
    const params: Record<string, string | number> = {};
    aplicarEmpresa(where, params, req, 'l.empresa_id');
    if (de) {
      where.push(`date(ifnull(l.vencimento, l.criado_em)) >= date(@de)`);
      params.de = de;
    }
    if (ate) {
      where.push(`date(ifnull(l.vencimento, l.criado_em)) <= date(@ate)`);
      params.ate = ate;
    }
    const filtro = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const rows = db
      .prepare(
        `SELECT l.tipo, l.status, l.valor, l.vencimento, l.data_pagamento, l.descricao, l.criado_em
         FROM financeiro_lancamentos l ${filtro}`,
      )
      .all(params) as Array<{
      tipo: string;
      status: string;
      valor: number;
      vencimento: string | null;
      data_pagamento: string | null;
      descricao: string;
      criado_em: string;
    }>;
    const mapped = rows.map((r) => ({
      ...r,
      status: statusEfetivoLancamento(r.status, r.vencimento),
    }));
    const soma = (pred: (r: (typeof mapped)[number]) => boolean) =>
      arredondarDinheiro(mapped.filter(pred).reduce((acc, r) => acc + r.valor, 0));

    const totais = {
      pagar: soma((r) => r.tipo === 'pagar' && r.status !== 'cancelado'),
      receber: soma((r) => r.tipo === 'receber' && r.status !== 'cancelado'),
      pago: soma((r) => r.tipo === 'pagar' && r.status === 'pago'),
      recebido: soma((r) => r.tipo === 'receber' && r.status === 'recebido'),
      pendente: soma((r) => r.status === 'pendente'),
      vencido: soma((r) => r.status === 'vencido'),
      fluxo: arredondarDinheiro(
        soma((r) => r.status === 'recebido') - soma((r) => r.status === 'pago'),
      ),
    };

    if (querCsv(req)) {
      return enviarCsv(
        res,
        'relatorio-financeiro.csv',
        ['Tipo', 'Status', 'Descrição', 'Valor', 'Vencimento', 'Pagamento'],
        mapped.map((r) => [r.tipo, r.status, r.descricao, r.valor, r.vencimento, r.data_pagamento]),
      );
    }

    res.json({ totais, total: mapped.length, data: mapped.slice(0, 50) });
  });

  router.get('/producao', (req, res) => {
    const { de, ate } = periodo(req);
    const status = String(req.query.status ?? '').trim();
    const pagina = Math.max(1, Number(req.query.pagina ?? 1) || 1);
    const porPagina = Math.min(200, Math.max(1, Number(req.query.por_pagina ?? 20) || 20));
    const where: string[] = [];
    const params: Record<string, string | number> = {};
    aplicarEmpresa(where, params, req, 'o.empresa_id');
    if (de) {
      where.push(`date(o.criado_em) >= date(@de)`);
      params.de = de;
    }
    if (ate) {
      where.push(`date(o.criado_em) <= date(@ate)`);
      params.ate = ate;
    }
    if (status) {
      where.push('o.status = @status');
      params.status = status;
    }
    const filtro = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const total = (
      db.prepare(`SELECT COUNT(*) AS n FROM ordens_producao o ${filtro}`).get(params) as {
        n: number;
      }
    ).n;
    const data = db
      .prepare(
        `SELECT o.id, o.codigo, o.produto, o.tamanho, o.quantidade, o.status, o.prioridade,
                o.data_prevista, o.criado_em
         FROM ordens_producao o ${filtro}
         ORDER BY datetime(o.criado_em) DESC
         LIMIT @limit OFFSET @offset`,
      )
      .all({ ...params, limit: porPagina, offset: (pagina - 1) * porPagina });
    const porStatus = db
      .prepare(
        `SELECT status, COUNT(*) AS n, ifnull(SUM(quantidade),0) AS quantidade
         FROM ordens_producao o ${filtro}
         GROUP BY status`,
      )
      .all(params);
    const etapas = db
      .prepare(
        `SELECT e.status, COUNT(*) AS n
         FROM etapas_producao e
         JOIN ordens_producao o ON o.id = e.ordem_id
         ${filtro}
         GROUP BY e.status`,
      )
      .all(params);

    if (querCsv(req)) {
      return enviarCsv(
        res,
        'relatorio-producao.csv',
        ['Código', 'Produto', 'Variante', 'Quantidade', 'Status', 'Prioridade', 'Previsão'],
        (
          data as Array<{
            codigo: string;
            produto: string;
            tamanho: string;
            quantidade: number;
            status: string;
            prioridade: string;
            data_prevista: string | null;
          }>
        ).map((d) => [
          d.codigo,
          d.produto,
          d.tamanho,
          d.quantidade,
          d.status,
          d.prioridade,
          d.data_prevista,
        ]),
      );
    }

    res.json({
      data,
      pagina,
      por_pagina: porPagina,
      total,
      total_paginas: Math.max(1, Math.ceil(total / porPagina)),
      por_status: porStatus,
      etapas,
    });
  });

  router.get('/custos', (req, res) => {
    const { de, ate } = periodo(req);
    const params: Record<string, string | number> = {};
    const whereCompra: string[] = [];
    aplicarEmpresa(whereCompra, params, req, 'c.empresa_id');
    if (de) {
      whereCompra.push('date(c.data_emissao) >= date(@de)');
      params.de = de;
    }
    if (ate) {
      whereCompra.push('date(c.data_emissao) <= date(@ate)');
      params.ate = ate;
    }
    const filtroC = whereCompra.length ? `WHERE ${whereCompra.join(' AND ')}` : '';
    const compras = (
      db
        .prepare(`SELECT ifnull(SUM(c.total),0) AS n FROM pedidos_compra c ${filtroC}`)
        .get(params) as { n: number }
    ).n;
    const estoqueMateriais = (
      db
        .prepare(
          `SELECT ifnull(SUM(s.quantidade * ifnull(m.custo,0)),0) AS n
           FROM estoque_saldos s
           JOIN materias_primas m ON m.id = s.materia_prima_id
           WHERE s.tipo = 'materia' AND s.empresa_id = @empresa_id`,
        )
        .get(params) as { n: number }
    ).n;
    const consumoOp = (
      db
        .prepare(
          `SELECT ifnull(SUM(mv.quantidade * ifnull(m.custo,0)),0) AS n
           FROM estoque_movimentos mv
           JOIN materias_primas m ON m.id = mv.materia_prima_id
           WHERE mv.tipo = 'saida' AND mv.empresa_id = @empresa_id ${de ? 'AND date(mv.criado_em) >= date(@de)' : ''}
             ${ate ? 'AND date(mv.criado_em) <= date(@ate)' : ''}`,
        )
        .get(params) as { n: number }
    ).n;

    const porMaterial = db
      .prepare(
        `SELECT m.nome, m.codigo, ifnull(SUM(i.quantidade),0) AS quantidade, ifnull(SUM(i.total),0) AS total
         FROM pedido_compra_itens i
         JOIN pedidos_compra c ON c.id = i.compra_id
         JOIN materias_primas m ON m.id = i.materia_prima_id
         ${filtroC}
         GROUP BY m.id
         ORDER BY total DESC
         LIMIT 15`,
      )
      .all(params);

    const totais = {
      compras: arredondarDinheiro(compras),
      estoque_materiais: arredondarDinheiro(estoqueMateriais),
      consumo_producao: arredondarDinheiro(consumoOp),
    };

    if (querCsv(req)) {
      return enviarCsv(
        res,
        'relatorio-custos.csv',
        ['Material', 'Código', 'Quantidade', 'Total'],
        (porMaterial as Array<{ nome: string; codigo: string | null; quantidade: number; total: number }>).map(
          (r) => [r.nome, r.codigo, r.quantidade, r.total],
        ),
      );
    }

    res.json({ totais, por_material: porMaterial });
  });

  router.get('/vendas', (req, res) => {
    try {
      const { de, ate } = periodo(req);
      const status = String(req.query.status ?? '').trim();
      const pagina = Math.max(1, Number(req.query.pagina ?? 1) || 1);
      const porPagina = Math.min(200, Math.max(1, Number(req.query.por_pagina ?? 20) || 20));
      const where: string[] = [];
      const params: Record<string, string | number> = {};
      aplicarEmpresa(where, params, req, 'p.empresa_id');
      if (de) {
        where.push('date(p.data_pedido) >= date(@de)');
        params.de = de;
      }
      if (ate) {
        where.push('date(p.data_pedido) <= date(@ate)');
        params.ate = ate;
      }
      if (status) {
        if (!(STATUS_PEDIDO as readonly string[]).includes(status)) {
          return res.status(400).json({ erro: 'status de pedido inválido' });
        }
        where.push('p.status = @status');
        params.status = status;
      } else {
        where.push(`p.status != 'cancelado'`);
      }
      const filtro = where.length ? `WHERE ${where.join(' AND ')}` : '';
      const from = `FROM pedidos p JOIN clientes c ON c.id = p.cliente_id ${filtro}`;
      const total = (db.prepare(`SELECT COUNT(*) AS n ${from}`).get(params) as { n: number }).n;
      const data = db
        .prepare(
          `SELECT p.id, p.codigo, p.status, p.data_pedido, p.total, p.cliente_id, c.nome AS cliente
           ${from} ORDER BY date(p.data_pedido) DESC, p.id DESC
           LIMIT @limit OFFSET @offset`,
        )
        .all({ ...params, limit: porPagina, offset: (pagina - 1) * porPagina }) as Array<{
        id: number;
        codigo: string | null;
        status: string;
        data_pedido: string;
        total: number;
        cliente_id: number;
        cliente: string;
      }>;
      const totaisRow = db
        .prepare(`SELECT ifnull(SUM(p.total),0) AS vendas ${from}`)
        .get(params) as { vendas: number };
      const quantidade = (
        db
          .prepare(
            `SELECT ifnull(SUM(i.quantidade),0) AS n
             FROM pedido_itens i
             JOIN pedidos p ON p.id = i.pedido_id
             JOIN clientes c ON c.id = p.cliente_id
             ${filtro}`,
          )
          .get(params) as { n: number }
      ).n;
      const porPeriodo = db
        .prepare(
          `SELECT strftime('%Y-%m', p.data_pedido) AS periodo,
                  COUNT(*) AS pedidos,
                  ifnull(SUM(p.total),0) AS total
           ${from}
           GROUP BY strftime('%Y-%m', p.data_pedido)
           ORDER BY periodo`,
        )
        .all(params) as Array<{ periodo: string; pedidos: number; total: number }>;
      const porProduto = db
        .prepare(
          `SELECT
             pr.id AS produto_id,
             pr.nome,
             pr.sku,
             SUM(i.quantidade) AS quantidade,
             COUNT(DISTINCT i.pedido_id) AS pedidos,
             SUM(i.total) AS total
           FROM pedido_itens i
           JOIN pedidos p ON p.id = i.pedido_id
           JOIN clientes c ON c.id = p.cliente_id
           JOIN produtos pr ON pr.id = i.produto_id
           ${filtro}
           GROUP BY pr.id
           ORDER BY total DESC
           LIMIT 20`,
        )
        .all(params) as Array<{
        produto_id: number;
        nome: string;
        sku: string | null;
        quantidade: number;
        pedidos: number;
        total: number;
      }>;
      const porCliente = db
        .prepare(
          `SELECT c.id AS cliente_id, c.nome,
                  COUNT(*) AS pedidos,
                  ifnull(SUM(p.total),0) AS total
           ${from}
           GROUP BY c.id
           ORDER BY total DESC
           LIMIT 20`,
        )
        .all(params) as Array<{ cliente_id: number; nome: string; pedidos: number; total: number }>;

      if (querCsv(req)) {
        return enviarCsv(
          res,
          'relatorio-vendas.csv',
          ['Código', 'Cliente', 'Pedido', 'Status', 'Total'],
          data.map((d) => [d.codigo, d.cliente, d.data_pedido, d.status, d.total]),
        );
      }

      res.json({
        data: data.map((d) => ({ ...d, total: arredondarDinheiro(d.total) })),
        pagina,
        por_pagina: porPagina,
        total,
        total_paginas: Math.max(1, Math.ceil(total / porPagina)),
        totais: {
          pedidos: total,
          vendas: arredondarDinheiro(totaisRow.vendas),
          quantidade,
        },
        por_periodo: porPeriodo.map((r) => ({ ...r, total: arredondarDinheiro(r.total) })),
        por_produto: porProduto.map((r) => ({ ...r, total: arredondarDinheiro(r.total) })),
        por_cliente: porCliente.map((r) => ({ ...r, total: arredondarDinheiro(r.total) })),
      });
    } catch (err) {
      res.status(500).json({ erro: (err as Error).message });
    }
  });

  router.get('/resumo', (req, res) => {
    const { de, ate } = periodo(req);
    const params: Record<string, string | number> = {};
    const whereOp: string[] = [];
    const whereCompra: string[] = [];
    const wherePedido: string[] = [`status != 'cancelado'`];
    aplicarEmpresa(whereOp, params, req);
    whereCompra.unshift('empresa_id = @empresa_id');
    wherePedido.unshift('empresa_id = @empresa_id');
    if (de) {
      whereOp.push('date(criado_em) >= date(@de)');
      whereCompra.push('date(data_emissao) >= date(@de)');
      wherePedido.push('date(data_pedido) >= date(@de)');
      params.de = de;
    }
    if (ate) {
      whereOp.push('date(criado_em) <= date(@ate)');
      whereCompra.push('date(data_emissao) <= date(@ate)');
      wherePedido.push('date(data_pedido) <= date(@ate)');
      params.ate = ate;
    }
    const fOp = `WHERE ${whereOp.join(' AND ')}`;
    const fC = `WHERE ${whereCompra.join(' AND ')}`;
    const fP = `WHERE ${wherePedido.join(' AND ')}`;

    const ops = db.prepare(`SELECT COUNT(*) AS n, ifnull(SUM(quantidade),0) AS q FROM ordens_producao ${fOp}`).get(params) as {
      n: number;
      q: number;
    };
    const compras = db
      .prepare(`SELECT COUNT(*) AS n, ifnull(SUM(total),0) AS total FROM pedidos_compra ${fC}`)
      .get(params) as { n: number; total: number };
    const vendas = db
      .prepare(`SELECT COUNT(*) AS n, ifnull(SUM(total),0) AS total FROM pedidos ${fP}`)
      .get(params) as { n: number; total: number };
    const estoqueBaixo = (
      db
        .prepare(
          `SELECT COUNT(*) AS n FROM (
             SELECT s.quantidade,
               CASE
                 WHEN s.tipo = 'materia' THEN ifnull(m.estoque_minimo,0)
                 WHEN s.tipo = 'variante' THEN ifnull(v.estoque_minimo, ifnull(p.estoque_minimo,0))
                 ELSE ifnull(p.estoque_minimo,0)
               END AS minimo
             FROM estoque_saldos s
             LEFT JOIN produtos p ON p.id = s.produto_id
             LEFT JOIN produto_variantes v ON v.id = s.variante_id
             LEFT JOIN materias_primas m ON m.id = s.materia_prima_id
             WHERE s.empresa_id = @empresa_id
           ) WHERE quantidade < minimo`,
        )
        .get(params) as { n: number }
    ).n;
    const pagar = (
      db
        .prepare(
          `SELECT ifnull(SUM(valor),0) AS n FROM financeiro_lancamentos
            WHERE tipo = 'pagar' AND status = 'pendente' AND empresa_id = @empresa_id`,
        )
        .get(params) as { n: number }
    ).n;

    res.json({
      ordens: ops.n,
      pecas: ops.q,
      compras: compras.n,
      compras_total: arredondarDinheiro(compras.total),
      vendas: vendas.n,
      vendas_total: arredondarDinheiro(vendas.total),
      estoque_baixo: estoqueBaixo,
      contas_pagar: arredondarDinheiro(pagar),
    });
  });

  return router;
}
