import { Router } from 'express';
import { z } from 'zod';
import type { AppDatabase } from './db.js';
import { arredondarDinheiro, pecasContaPagarOficina } from './financeiro.js';
import {
  obterOrdemCorte,
  registrarHistoricoOrdemCorte,
} from './ordensGrade.js';
import { aplicarEmpresa, empresaDaSessao } from './tenant.js';

export const STATUS_EXPEDICAO = ['pronto_envio', 'conferido', 'expedido', 'entregue'] as const;
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

function mapRow(row: ExpedicaoRow) {
  const expedicaoStatus = (row.expedicao_status ?? null) as StatusExpedicao | null;
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

export type ExpedicaoOcRegistro = {
  id: number;
  ordem_id: number;
  ordem_corte_id: number;
  codigo_oc: string;
  oficina: string;
  costureiro: string;
  modelo: string;
  referencia: string;
  pecas: number;
  pecas_conferidas: number | null;
  pecas_expedicao: number;
  conferido_em: string | null;
  conferido_por: number | null;
  conferido_por_nome: string | null;
  status: StatusExpedicao;
  encaminhado_em: string;
  data_expedicao: string | null;
  data_entrega: string | null;
  observacoes: string | null;
};

const OC_SELECT = `
  SELECT e.id, e.ordem_id, e.ordem_corte_id, e.codigo_oc, e.oficina, e.costureiro, e.modelo, e.referencia,
         e.pecas, e.pecas_conferidas, e.status, e.encaminhado_em, e.data_expedicao, e.data_entrega,
         e.observacoes, e.conferido_em, e.conferido_por, u.nome AS conferido_por_nome
    FROM ordem_corte_expedicoes e
    LEFT JOIN usuarios u ON u.id = e.conferido_por
`;

type OcRow = {
  id: number;
  ordem_id: number;
  ordem_corte_id: number;
  codigo_oc: string;
  oficina: string;
  costureiro: string;
  modelo: string;
  referencia: string;
  pecas: number;
  pecas_conferidas: number | null;
  conferido_em: string | null;
  conferido_por: number | null;
  conferido_por_nome: string | null;
  status: string;
  encaminhado_em: string;
  data_expedicao: string | null;
  data_entrega: string | null;
  observacoes: string | null;
};

function inteiroPecas(valor: unknown): number | null {
  if (typeof valor === 'number' && Number.isFinite(valor) && valor >= 0) {
    const n = Math.round(valor);
    return Math.abs(n - valor) < 1e-9 ? n : null;
  }
  const t = String(valor ?? '')
    .trim()
    .replace(/\s/g, '')
    .replace(',', '.');
  if (!t) return null;
  const n = Number(t);
  if (!Number.isFinite(n) || n < 0) return null;
  const inteiro = Math.round(n);
  return Math.abs(inteiro - n) < 1e-9 ? inteiro : null;
}

function mapOc(row: OcRow): ExpedicaoOcRegistro {
  const pecas = Number(row.pecas) || 0;
  const conferidasRaw = row.pecas_conferidas;
  const conferidas =
    conferidasRaw === null || conferidasRaw === undefined || String(conferidasRaw).trim() === ''
      ? null
      : Number(conferidasRaw);
  const pecasConferidas = conferidas != null && Number.isFinite(conferidas) ? conferidas : null;
  return {
    id: row.id,
    ordem_id: row.ordem_id,
    ordem_corte_id: row.ordem_corte_id,
    codigo_oc: row.codigo_oc,
    oficina: row.oficina,
    costureiro: row.costureiro,
    modelo: row.modelo,
    referencia: row.referencia,
    pecas,
    pecas_conferidas: pecasConferidas,
    pecas_expedicao: pecasConferidas ?? pecas,
    conferido_em: row.conferido_em ?? null,
    conferido_por: row.conferido_por ?? null,
    conferido_por_nome: row.conferido_por_nome ?? null,
    status: row.status as StatusExpedicao,
    encaminhado_em: row.encaminhado_em,
    data_expedicao: row.data_expedicao,
    data_entrega: row.data_entrega,
    observacoes: row.observacoes,
  };
}

function falhaExp(mensagem: string, status = 400): never {
  throw Object.assign(new Error(mensagem), { status });
}

function obterExpedicaoOc(
  db: AppDatabase,
  empresaId: number,
  ordemId: number,
): ExpedicaoOcRegistro | undefined {
  const row = db
    .prepare(`${OC_SELECT} WHERE e.empresa_id = ? AND e.ordem_id = ? ORDER BY e.id DESC LIMIT 1`)
    .get(empresaId, ordemId) as OcRow | undefined;
  return row ? mapOc(row) : undefined;
}

export function obterExpedicaoOcDaFicha(
  db: AppDatabase,
  empresaId: number,
  ordemCorteId: number,
): ExpedicaoOcRegistro | undefined {
  const row = db
    .prepare(`${OC_SELECT} WHERE e.empresa_id = ? AND e.ordem_corte_id = ?`)
    .get(empresaId, ordemCorteId) as OcRow | undefined;
  return row ? mapOc(row) : undefined;
}

export function listarExpedicoesOc(
  db: AppDatabase,
  empresaId: number,
  fila: string,
): ExpedicaoOcRegistro[] {
  const where = ['e.empresa_id = ?'];
  if (fila === 'expedidos') where.push(`e.status = 'expedido'`);
  else if (fila === 'entregues') where.push(`e.status = 'entregue'`);
  else if (fila === 'todos') {
    /* todas as OCs encaminhadas */
  } else where.push(`e.status IN ('pronto_envio', 'conferido')`);
  return (
    db
      .prepare(
        `${OC_SELECT} WHERE ${where.join(' AND ')}
          ORDER BY datetime(e.encaminhado_em) DESC, e.id DESC`,
      )
      .all(empresaId) as OcRow[]
  ).map(mapOc);
}

export function contarExpedicoesOcAbertas(db: AppDatabase, empresaId: number): number {
  return (
    db
      .prepare(
        `SELECT COUNT(*) AS n FROM ordem_corte_expedicoes
          WHERE empresa_id = ? AND status != 'entregue'`,
      )
      .get(empresaId) as { n: number }
  ).n;
}

export function encaminharOcParaExpedicao(
  db: AppDatabase,
  empresaId: number,
  ordemId: number,
  usuarioId: number | null,
): ExpedicaoOcRegistro {
  const corte = obterOrdemCorte(db, empresaId, ordemId);
  if (!corte) falhaExp('Ordem de corte não encontrada', 404);
  const liberacao = db
    .prepare(
      `SELECT entregue_em, oficina, costureiro, referencia, codigo_oc
         FROM ordem_corte_liberacoes
        WHERE empresa_id = ? AND ordem_corte_id = ?`,
    )
    .get(empresaId, corte.id) as
    | {
        entregue_em: string | null;
        oficina: string;
        costureiro: string;
        referencia: string;
        codigo_oc: string;
      }
    | undefined;
  if (!liberacao) falhaExp('Ficha ainda não foi liberada para a oficina', 409);
  if (!String(liberacao.entregue_em ?? '').trim()) {
    falhaExp('Confirme a entrega da oficina antes de enviar para expedição', 409);
  }
  const existente = obterExpedicaoOcDaFicha(db, empresaId, corte.id);
  if (existente) falhaExp('Esta OC já foi encaminhada para expedição', 409);

  const pecas = pecasContaPagarOficina(
    corte.grade.reduce((soma, celula) => soma + celula.quantidade, 0),
    corte.quantidade,
  );
  const aplicar = db.transaction(() => {
    try {
      db.prepare(
        `INSERT INTO ordem_corte_expedicoes (
           empresa_id, ordem_corte_id, ordem_id, codigo_oc, oficina, costureiro,
           modelo, referencia, pecas, status, encaminhado_em, encaminhado_por
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'pronto_envio', datetime('now'), ?)`,
      ).run(
        empresaId,
        corte.id,
        corte.ordem_id,
        corte.codigo || liberacao.codigo_oc,
        liberacao.oficina ?? '',
        liberacao.costureiro ?? '',
        corte.modelo || corte.produto || '',
        (liberacao.referencia || corte.referencia || '').trim(),
        pecas,
        usuarioId,
      );
    } catch (e) {
      const msg = String((e as Error).message);
      if (msg.includes('UNIQUE')) falhaExp('Esta OC já foi encaminhada para expedição', 409);
      throw e;
    }
    db.prepare(
      `UPDATE ordens_corte
          SET status_processo = 'expedicao', atualizado_em = datetime('now')
        WHERE empresa_id = ? AND id = ?
          AND status_processo IN ('entregue', 'encaminhado')`,
    ).run(empresaId, corte.id);
    registrarHistoricoOrdemCorte(
      db,
      empresaId,
      corte.id,
      usuarioId,
      'encaminhar_expedicao',
      `Encaminhou a ficha ${corte.codigo} para expedição`,
      {
        codigo_oc: corte.codigo,
        oficina: liberacao.oficina,
        costureiro: liberacao.costureiro,
        pecas,
      },
    );
  });
  aplicar();
  const salva = obterExpedicaoOcDaFicha(db, empresaId, corte.id);
  if (!salva) falhaExp('Não foi possível encaminhar a OC para expedição', 500);
  return salva;
}

export function salvarConferenciaExpedicaoOc(
  db: AppDatabase,
  empresaId: number,
  ordemId: number,
  pecasConferidasRaw: unknown,
  usuarioId: number | null,
): ExpedicaoOcRegistro {
  const pecasConferidas = inteiroPecas(pecasConferidasRaw);
  if (pecasConferidas == null) {
    falhaExp('Informe a quantidade conferida em peças inteiras, igual ou maior que zero', 400);
  }
  const corte = obterOrdemCorte(db, empresaId, ordemId);
  if (!corte) falhaExp('Ordem de corte não encontrada', 404);
  const atual = obterExpedicaoOcDaFicha(db, empresaId, corte.id);
  if (!atual) falhaExp('Encaminhe a OC para expedição antes de conferir as peças', 409);

  const mesmaQuantidade =
    atual.conferido_em != null &&
    atual.pecas_conferidas != null &&
    Number(atual.pecas_conferidas) === pecasConferidas;
  if (mesmaQuantidade) {
    if (atual.status === 'pronto_envio') {
      db.prepare(
        `UPDATE ordem_corte_expedicoes
            SET status = 'conferido',
                atualizado_em = datetime('now')
          WHERE id = ? AND empresa_id = ?`,
      ).run(atual.id, empresaId);
      return obterExpedicaoOcDaFicha(db, empresaId, corte.id) ?? atual;
    }
    return atual;
  }

  const primeiraConferencia = !atual.conferido_em || atual.pecas_conferidas == null;
  const statusConferido = atual.status === 'pronto_envio' || atual.status === 'conferido' ? 'conferido' : atual.status;
  const aplicar = db.transaction(() => {
    if (primeiraConferencia) {
      db.prepare(
        `UPDATE ordem_corte_expedicoes
            SET pecas_conferidas = ?,
                conferido_em = datetime('now'),
                conferido_por = ?,
                status = ?,
                atualizado_em = datetime('now')
          WHERE id = ? AND empresa_id = ?`,
      ).run(pecasConferidas, usuarioId, statusConferido, atual.id, empresaId);
    } else {
      db.prepare(
        `UPDATE ordem_corte_expedicoes
            SET pecas_conferidas = ?,
                status = ?,
                atualizado_em = datetime('now')
          WHERE id = ? AND empresa_id = ?`,
      ).run(pecasConferidas, statusConferido, atual.id, empresaId);
    }
    registrarHistoricoOrdemCorte(
      db,
      empresaId,
      corte.id,
      usuarioId,
      'conferir_expedicao',
      `Conferiu ${pecasConferidas} peças da ficha ${corte.codigo} na expedição (enviadas: ${atual.pecas})`,
      {
        pecas_originais: atual.pecas,
        pecas_conferidas: pecasConferidas,
        diferenca: pecasConferidas - atual.pecas,
      },
    );
  });
  aplicar();
  const salva = obterExpedicaoOcDaFicha(db, empresaId, corte.id);
  if (!salva) falhaExp('Não foi possível gravar a conferência', 500);
  return salva;
}

function avancarExpedicaoOc(
  db: AppDatabase,
  empresaId: number,
  ordemId: number,
  para: 'expedido' | 'entregue',
  dados: { data_expedicao?: string; data_entrega?: string; observacoes?: string },
): ExpedicaoOcRegistro {
  const atual = obterExpedicaoOc(db, empresaId, ordemId);
  if (!atual) falhaExp('OC ainda não foi encaminhada para expedição', 404);
  if (para === 'expedido') {
    if (atual.status === 'expedido') falhaExp('Esta OC já foi expedida', 409);
    if (atual.status === 'entregue') falhaExp('Esta OC já foi finalizada na expedição', 409);
    db.prepare(
      `UPDATE ordem_corte_expedicoes
          SET status = 'expedido',
              data_expedicao = @data_expedicao,
              observacoes = @observacoes,
              atualizado_em = datetime('now')
        WHERE id = @id AND empresa_id = @empresa_id`,
    ).run({
      id: atual.id,
      empresa_id: empresaId,
      data_expedicao: dados.data_expedicao ?? hojeIso(),
      observacoes: dados.observacoes ?? atual.observacoes,
    });
  } else {
    if (atual.status !== 'expedido') falhaExp('Registre a expedição antes de marcar como entregue', 409);
    db.prepare(
      `UPDATE ordem_corte_expedicoes
          SET status = 'entregue',
              data_entrega = @data_entrega,
              observacoes = @observacoes,
              atualizado_em = datetime('now')
        WHERE id = @id AND empresa_id = @empresa_id`,
    ).run({
      id: atual.id,
      empresa_id: empresaId,
      data_entrega: dados.data_entrega ?? hojeIso(),
      observacoes: dados.observacoes ?? atual.observacoes,
    });
  }
  const depois = obterExpedicaoOc(db, empresaId, ordemId);
  if (!depois) falhaExp('OC não encontrada na expedição', 404);
  return depois;
}

function filtroFila(fila: string): string {
  if (fila === 'expedidos') return `e.status = 'expedido'`;
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
    const prontos = (
      db
        .prepare(
          `SELECT COUNT(*) AS n FROM pedidos p
           LEFT JOIN expedicoes e ON e.pedido_id = p.id
           WHERE p.empresa_id = ? AND ${filtroFila('prontos')}`,
        )
        .get(empresaId) as { n: number }
    ).n;
    const prontosEnvio = (
      db
        .prepare(`SELECT COUNT(*) AS n FROM expedicoes WHERE empresa_id = ? AND status = 'pronto_envio'`)
        .get(empresaId) as {
        n: number;
      }
    ).n;
    const expedidos = (
      db
        .prepare(`SELECT COUNT(*) AS n FROM expedicoes WHERE empresa_id = ? AND status = 'expedido'`)
        .get(empresaId) as { n: number }
    ).n;
    const entregues = (
      db
        .prepare(`SELECT COUNT(*) AS n FROM expedicoes WHERE empresa_id = ? AND status = 'entregue'`)
        .get(empresaId) as { n: number }
    ).n;
    res.json({
      fila: prontos,
      prontos_envio: prontosEnvio,
      expedidos,
      entregues,
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

  router.get('/ordens-corte', (req, res) => {
    const filaRaw = String(req.query.fila ?? 'prontos').trim();
    const fila = (FILAS as readonly string[]).includes(filaRaw) ? filaRaw : 'prontos';
    const data = listarExpedicoesOc(db, empresaDaSessao(req), fila);
    res.json({ data, total: data.length });
  });

  router.post('/ordens-corte/:ordemId/expedir', (req, res) => {
    const parsed = acaoSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      return res.status(400).json({ erro: 'Dados inválidos', detalhes: parsed.error.flatten().fieldErrors });
    }
    try {
      const item = avancarExpedicaoOc(
        db,
        empresaDaSessao(req),
        Number(req.params.ordemId),
        'expedido',
        parsed.data,
      );
      res.json(item);
    } catch (e) {
      const err = e as Error & { status?: number };
      return res.status(err.status ?? 400).json({ erro: err.message });
    }
  });

  router.post('/ordens-corte/:ordemId/entregar', (req, res) => {
    const parsed = acaoSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      return res.status(400).json({ erro: 'Dados inválidos', detalhes: parsed.error.flatten().fieldErrors });
    }
    try {
      const item = avancarExpedicaoOc(
        db,
        empresaDaSessao(req),
        Number(req.params.ordemId),
        'entregue',
        parsed.data,
      );
      res.json(item);
    } catch (e) {
      const err = e as Error & { status?: number };
      return res.status(err.status ?? 400).json({ erro: err.message });
    }
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
