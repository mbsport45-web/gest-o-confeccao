import { Router, type Response } from 'express';
import { z } from 'zod';
import type { AppDatabase } from './db.js';
import {
  type CelulaGrade,
  type OrdemCorte,
  criarCor,
  criarOuObterOrdemCorte,
  criarTamanho,
  editarCor,
  excluirCor,
  gravarGrade,
  lerGrade,
  listarCores,
  listarTamanhos,
  obterOrdemCorte,
  resumoTamanhos,
  validarGrade,
} from './ordensGrade.js';
import {
  concluirCorteInfesto,
  estornarCortesInfesto,
  listarCortesInfesto,
  resumirCorteInfesto,
} from './corteInfesto.js';
import { sincronizarStatusPedidoFromOps } from './pedidos.js';
import { exigirLimite } from './planos.js';
import { aplicarEmpresa, empresaDaSessao } from './tenant.js';

export const STATUS_OP = [
  'planejada',
  'corte',
  'costura',
  'acabamento',
  'qualidade',
  'embalagem',
  'concluida',
  'cancelada',
] as const;

/** Status antigos da OP simples — ainda aceitos para não quebrar os demais módulos. */
export const STATUS_LEGADOS = ['pendente', 'em_producao'] as const;

export const STATUS_VALIDOS = [...STATUS_OP, ...STATUS_LEGADOS] as const;

export const PRIORIDADES_OP = ['baixa', 'normal', 'alta', 'urgente'] as const;

const TERMINAIS = new Set(['concluida', 'cancelada']);
const CONSOME_ESTOQUE = new Set([
  'corte',
  'costura',
  'acabamento',
  'qualidade',
  'embalagem',
  'em_producao',
  'concluida',
]);
const AINDA_PLANEJADA = new Set(['planejada', 'pendente']);

const textoOpcional = z
  .string()
  .trim()
  .max(200)
  .optional()
  .or(z.literal(''))
  .transform((v) => (v ? v : undefined));

const requisitoSchema = z.object({
  materia_prima_id: z.number().int().positive(),
  quantidade: z.number().positive('quantidade deve ser maior que zero'),
});

const celulaGradeSchema = z.object({
  cor: z.string().trim().min(1, 'cor é obrigatória'),
  tamanho: z.string().trim().min(1, 'tamanho é obrigatório'),
  quantidade: z.number().int().min(0, 'quantidade da grade não pode ser negativa'),
});

const nomeCadastroSchema = z.object({
  nome: z.string().trim().min(1, 'nome é obrigatório').max(80),
});

const corteInfestoSchema = z.object({
  materia_prima_id: z.number().int().positive(),
  cor: z.string().trim().min(1, 'Informe a cor').max(80),
  camadas: z.number().int().positive('Informe o número de camadas do enfesto'),
  metragem: z.number().positive('Informe a metragem consumida').optional(),
  peso_real: z.number().positive('Informe o peso real consumido').optional(),
  itens: z
    .array(
      z.object({
        tamanho: z.string().trim().min(1).max(40),
        quantidade: z.number().int().min(0),
      }),
    )
    .min(1),
  autorizar_excedente: z.boolean().optional(),
});

const corCadastroSchema = z.object({
  nome: z.string().trim().min(1, 'nome é obrigatório').max(80),
  codigo: z.string().trim().max(40).optional().nullable(),
  hex: z.string().trim().max(20).optional().nullable(),
});

function responderCadastro(res: Response, e: unknown) {
  const status = (e as { status?: number }).status;
  if (!status || status >= 500) throw e;
  return res.status(status).json({ erro: (e as Error).message });
}

const criarOrdemSchema = z
  .object({
    cliente: z.string().trim().min(1, 'cliente é obrigatório').optional(),
    produto: z.string().trim().min(1, 'produto é obrigatório').optional(),
    tamanho: z.string().trim().min(1, 'tamanho é obrigatório').optional(),
    quantidade: z.number().int().positive('quantidade deve ser maior que zero'),
    status: z.enum(STATUS_VALIDOS).optional(),
    cliente_id: z.number().int().positive().optional(),
    produto_id: z.number().int().positive().optional(),
    variante_id: z.number().int().positive().optional(),
    codigo: textoOpcional,
    prioridade: z.enum(PRIORIDADES_OP).optional(),
    data_prevista: z
      .string()
      .trim()
      .max(32)
      .optional()
      .or(z.literal(''))
      .transform((v) => (v ? v : undefined)),
    observacoes: z
      .string()
      .trim()
      .max(4000)
      .optional()
      .or(z.literal(''))
      .transform((v) => (v ? v : undefined)),
    responsavel: textoOpcional,
    requisitos: z.array(requisitoSchema).optional(),
    grade: z.array(celulaGradeSchema).optional(),
  })
  .refine((d) => Boolean(d.cliente || d.cliente_id), {
    message: 'cliente é obrigatório',
    path: ['cliente'],
  })
  .refine((d) => Boolean(d.produto || d.produto_id), {
    message: 'produto é obrigatório',
    path: ['produto'],
  })
  .refine((d) => Boolean(d.tamanho || d.variante_id || (d.grade && d.grade.length > 0)), {
    message: 'tamanho é obrigatório',
    path: ['tamanho'],
  });

const atualizarOrdemSchema = z.object({
  cliente: z.string().trim().min(1).optional(),
  produto: z.string().trim().min(1).optional(),
  tamanho: z.string().trim().min(1).optional(),
  quantidade: z.number().int().positive().optional(),
  status: z.enum(STATUS_VALIDOS).optional(),
  cliente_id: z.number().int().positive().nullable().optional(),
  produto_id: z.number().int().positive().nullable().optional(),
  variante_id: z.number().int().positive().nullable().optional(),
  codigo: textoOpcional,
  prioridade: z.enum(PRIORIDADES_OP).optional(),
  data_prevista: z
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
    .max(4000)
    .optional()
    .or(z.literal(''))
    .transform((v) => (v === '' ? null : v))
    .optional(),
  responsavel: z
    .string()
    .trim()
    .max(200)
    .optional()
    .or(z.literal(''))
    .transform((v) => (v === '' ? null : v))
    .optional(),
  requisitos: z.array(requisitoSchema).optional(),
  grade: z.array(celulaGradeSchema).optional(),
});

const fichaSchema = z.object({
  produto_id: z.number().int().positive(),
  variante_id: z.number().int().positive().optional(),
  itens: z.array(requisitoSchema).min(0),
});

export interface OrdemRequisito {
  id: number;
  ordem_id: number;
  materia_prima_id: number;
  quantidade_unitaria: number;
  quantidade_total: number;
  unidade: string | null;
  movimento_id: number | null;
  nome: string;
  codigo: string | null;
  estoque_disponivel: number;
  suficiente: boolean;
}

export interface OrdemProducao {
  id: number;
  empresa_id: number;
  codigo: string | null;
  cliente: string;
  produto: string;
  tamanho: string;
  quantidade: number;
  status: (typeof STATUS_VALIDOS)[number];
  prioridade: (typeof PRIORIDADES_OP)[number];
  data_prevista: string | null;
  observacoes: string | null;
  responsavel: string | null;
  cliente_id: number | null;
  produto_id: number | null;
  variante_id: number | null;
  criado_em: string;
  atualizado_em: string | null;
  requisitos?: OrdemRequisito[];
  grade?: CelulaGrade[];
  referencia?: string | null;
  ordem_corte?: Pick<OrdemCorte, 'id' | 'codigo' | 'quantidade' | 'grade'> | null;
}

function podeTransicionar(
  de: (typeof STATUS_VALIDOS)[number],
  para: (typeof STATUS_VALIDOS)[number],
): boolean {
  if (de === para) return true;
  if (TERMINAIS.has(de)) return false;
  return (STATUS_VALIDOS as readonly string[]).includes(para);
}

export function createOrdensRouter(db: AppDatabase): Router {
  const router = Router();

  const getStmt = db.prepare('SELECT * FROM ordens_producao WHERE id = ? AND empresa_id = ?');
  const getByCodigo = db.prepare(
    'SELECT id FROM ordens_producao WHERE codigo = ? AND id != ? AND empresa_id = ?',
  );
  const insertStmt = db.prepare(
    `INSERT INTO ordens_producao (
       empresa_id, cliente, produto, tamanho, quantidade, status,
       cliente_id, produto_id, variante_id,
       codigo, prioridade, data_prevista, observacoes, responsavel, atualizado_em
     ) VALUES (
       @empresa_id, @cliente, @produto, @tamanho, @quantidade, @status,
       @cliente_id, @produto_id, @variante_id,
       @codigo, @prioridade, @data_prevista, @observacoes, @responsavel, datetime('now')
     )`,
  );
  const setCodigoStmt = db.prepare(
    `UPDATE ordens_producao SET codigo = @codigo, atualizado_em = datetime('now')
      WHERE id = @id AND empresa_id = @empresa_id`,
  );
  const deleteStmt = db.prepare('DELETE FROM ordens_producao WHERE id = ? AND empresa_id = ?');
  const deleteRequisitos = db.prepare('DELETE FROM ordem_requisitos WHERE ordem_id = ?');
  const insertRequisito = db.prepare(
    `INSERT INTO ordem_requisitos (
       empresa_id, ordem_id, materia_prima_id, quantidade_unitaria, quantidade_total, unidade
     ) VALUES (
       @empresa_id, @ordem_id, @materia_prima_id, @quantidade_unitaria, @quantidade_total, @unidade
     )`,
  );
  const listRequisitosStmt = db.prepare(
    `SELECT
       r.id, r.ordem_id, r.materia_prima_id, r.quantidade_unitaria, r.quantidade_total,
       r.unidade, r.movimento_id,
       m.nome, m.codigo,
       ifnull(s.quantidade, 0) AS estoque_disponivel
     FROM ordem_requisitos r
     JOIN materias_primas m ON m.id = r.materia_prima_id
     LEFT JOIN estoque_saldos s ON s.materia_prima_id = r.materia_prima_id AND s.empresa_id = r.empresa_id
     WHERE r.ordem_id = ?
     ORDER BY r.id ASC`,
  );
  const listBomVariante = db.prepare(
    `SELECT b.*, m.nome, m.codigo, m.unidade AS unidade_materia
     FROM produto_bom_itens b
     JOIN materias_primas m ON m.id = b.materia_prima_id
     WHERE b.variante_id = ? AND b.empresa_id = ?
     ORDER BY b.id ASC`,
  );
  const listBomProduto = db.prepare(
    `SELECT b.*, m.nome, m.codigo, m.unidade AS unidade_materia
     FROM produto_bom_itens b
     JOIN materias_primas m ON m.id = b.materia_prima_id
     WHERE b.produto_id = ? AND b.variante_id IS NULL AND b.empresa_id = ?
     ORDER BY b.id ASC`,
  );
  const deleteBomVariante = db.prepare(
    'DELETE FROM produto_bom_itens WHERE variante_id = ? AND empresa_id = ?',
  );
  const deleteBomProduto = db.prepare(
    'DELETE FROM produto_bom_itens WHERE produto_id = ? AND variante_id IS NULL AND empresa_id = ?',
  );
  const insertBom = db.prepare(
    `INSERT INTO produto_bom_itens (
       empresa_id, produto_id, variante_id, materia_prima_id, quantidade, unidade
     ) VALUES (
       @empresa_id, @produto_id, @variante_id, @materia_prima_id, @quantidade, @unidade
     )`,
  );
  const getMateria = db.prepare('SELECT * FROM materias_primas WHERE id = ? AND empresa_id = ?');
  const getProduto = db.prepare('SELECT * FROM produtos WHERE id = ? AND empresa_id = ?');
  const getVariante = db.prepare(
    'SELECT * FROM produto_variantes WHERE id = ? AND empresa_id = ?',
  );
  const getCliente = db.prepare('SELECT * FROM clientes WHERE id = ? AND empresa_id = ?');
  const getSaldoMateria = db.prepare(
    'SELECT * FROM estoque_saldos WHERE materia_prima_id = ? AND empresa_id = ?',
  );
  const insertSaldoMateria = db.prepare(
    `INSERT INTO estoque_saldos (empresa_id, tipo, materia_prima_id, quantidade)
     VALUES (@empresa_id, 'materia', @materia_prima_id, 0)`,
  );
  const updateSaldo = db.prepare(
    `UPDATE estoque_saldos
        SET quantidade = @quantidade, atualizado_em = datetime('now')
      WHERE id = @id AND empresa_id = @empresa_id`,
  );
  const insertMovimento = db.prepare(
    `INSERT INTO estoque_movimentos (
       empresa_id, saldo_id, tipo, quantidade, saldo_anterior, saldo_posterior,
       motivo, observacoes, materia_prima_id
     ) VALUES (
       @empresa_id, @saldo_id, @tipo, @quantidade, @saldo_anterior, @saldo_posterior,
       @motivo, @observacoes, @materia_prima_id
     )`,
  );
  const setMovimentoRequisito = db.prepare(
    'UPDATE ordem_requisitos SET movimento_id = @movimento_id WHERE id = @id',
  );

  function mapRequisitos(ordemId: number): OrdemRequisito[] {
    const rows = listRequisitosStmt.all(ordemId) as Array<
      Omit<OrdemRequisito, 'suficiente'>
    >;
    return rows.map((r) => ({
      ...r,
      suficiente: r.estoque_disponivel + 1e-9 >= r.quantidade_total,
    }));
  }

  function completarOrdem(ordem: OrdemProducao, comRequisitos = false): OrdemProducao {
    ordem.grade = lerGrade(db, ordem.empresa_id, ordem.id);
    const produto = ordem.produto_id
      ? (getProduto.get(ordem.produto_id, ordem.empresa_id) as { sku: string | null } | undefined)
      : undefined;
    ordem.referencia = produto?.sku ?? null;
    const corte = obterOrdemCorte(db, ordem.empresa_id, ordem.id);
    ordem.ordem_corte = corte
      ? { id: corte.id, codigo: corte.codigo, quantidade: corte.quantidade, grade: corte.grade }
      : null;
    if (comRequisitos) ordem.requisitos = mapRequisitos(ordem.id);
    return ordem;
  }

  function mapOrdem(id: number, empresaId: number, comRequisitos = false): OrdemProducao | undefined {
    const ordem = getStmt.get(id, empresaId) as OrdemProducao | undefined;
    if (!ordem) return undefined;
    return completarOrdem(ordem, comRequisitos);
  }

  function carregarBom(produtoId: number, varianteId: number | null, empresaId: number) {
    if (varianteId) {
      const daVariante = listBomVariante.all(varianteId, empresaId) as Array<{
        materia_prima_id: number;
        quantidade: number;
        unidade: string | null;
        unidade_materia: string;
        nome: string;
        codigo: string | null;
      }>;
      if (daVariante.length) return daVariante;
    }
    return listBomProduto.all(produtoId, empresaId) as Array<{
      materia_prima_id: number;
      quantidade: number;
      unidade: string | null;
      unidade_materia: string;
      nome: string;
      codigo: string | null;
    }>;
  }

  function garantirFichaTabela() {
    db.exec(`
      CREATE TABLE IF NOT EXISTS ficha_tecnica_itens (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        empresa_id INTEGER NOT NULL DEFAULT 1,
        materia_prima_id INTEGER NOT NULL,
        produto_id INTEGER,
        variante_id INTEGER,
        quantidade REAL NOT NULL DEFAULT 1,
        unidade TEXT
      );
    `);
  }

  function gravarBom(
    produtoId: number,
    varianteId: number | null,
    itens: Array<{ materia_prima_id: number; quantidade: number }>,
    empresaId: number,
  ) {
    if (varianteId) deleteBomVariante.run(varianteId, empresaId);
    else deleteBomProduto.run(produtoId, empresaId);

    garantirFichaTabela();
    if (varianteId) {
      db.prepare('DELETE FROM ficha_tecnica_itens WHERE variante_id = ? AND empresa_id = ?').run(
        varianteId,
        empresaId,
      );
    } else {
      db.prepare(
        'DELETE FROM ficha_tecnica_itens WHERE produto_id = ? AND variante_id IS NULL AND empresa_id = ?',
      ).run(produtoId, empresaId);
    }

    for (const item of itens) {
      const materia = getMateria.get(item.materia_prima_id, empresaId) as
        | { id: number; unidade: string }
        | undefined;
      if (!materia) {
        throw Object.assign(new Error('Matéria-prima não encontrada'), { status: 400 });
      }
      insertBom.run({
        empresa_id: empresaId,
        produto_id: produtoId,
        variante_id: varianteId,
        materia_prima_id: item.materia_prima_id,
        quantidade: item.quantidade,
        unidade: materia.unidade,
      });
      db.prepare(
        `INSERT INTO ficha_tecnica_itens (
           empresa_id, materia_prima_id, produto_id, variante_id, quantidade, unidade
         ) VALUES (?, ?, ?, ?, ?, ?)`,
      ).run(
        empresaId,
        item.materia_prima_id,
        produtoId,
        varianteId,
        item.quantidade,
        materia.unidade,
      );
    }
  }

  function gravarRequisitos(
    ordemId: number,
    quantidadeOp: number,
    itens: Array<{ materia_prima_id: number; quantidade: number }>,
    empresaId: number,
  ) {
    deleteRequisitos.run(ordemId);
    for (const item of itens) {
      const materia = getMateria.get(item.materia_prima_id, empresaId) as
        | { id: number; unidade: string }
        | undefined;
      if (!materia) {
        throw Object.assign(new Error('Matéria-prima não encontrada'), { status: 400 });
      }
      insertRequisito.run({
        empresa_id: empresaId,
        ordem_id: ordemId,
        materia_prima_id: item.materia_prima_id,
        quantidade_unitaria: item.quantidade,
        quantidade_total: item.quantidade * quantidadeOp,
        unidade: materia.unidade,
      });
    }
  }

  function obterOuCriarSaldoMateria(materiaId: number, empresaId: number): number {
    const atual = getSaldoMateria.get(materiaId, empresaId) as { id: number } | undefined;
    if (atual) return atual.id;
    const info = insertSaldoMateria.run({ empresa_id: empresaId, materia_prima_id: materiaId });
    return Number(info.lastInsertRowid);
  }

  function lancarMovimentoMateria(
    materiaId: number,
    tipo: 'entrada' | 'saida',
    quantidade: number,
    motivo: string,
    empresaId: number,
  ): { ok: true; movimentoId: number } | { ok: false; erro: string; status: number } {
    const saldoId = obterOuCriarSaldoMateria(materiaId, empresaId);
    const saldo = db
      .prepare('SELECT * FROM estoque_saldos WHERE id = ? AND empresa_id = ?')
      .get(saldoId, empresaId) as {
      id: number;
      quantidade: number;
    };
    const anterior = saldo.quantidade;
    const posterior = tipo === 'saida' ? anterior - quantidade : anterior + quantidade;
    if (posterior < 0) {
      return { ok: false, erro: 'Estoque insuficiente para os requisitos da OP', status: 409 };
    }
    updateSaldo.run({ id: saldo.id, quantidade: posterior, empresa_id: empresaId });
    const info = insertMovimento.run({
      empresa_id: empresaId,
      saldo_id: saldo.id,
      tipo,
      quantidade,
      saldo_anterior: anterior,
      saldo_posterior: posterior,
      motivo,
      observacoes: null,
      materia_prima_id: materiaId,
    });
    return { ok: true, movimentoId: Number(info.lastInsertRowid) };
  }

  function consumirMateriais(ordem: OrdemProducao): { ok: true } | { ok: false; erro: string; status: number } {
    const requisitos = listRequisitosStmt.all(ordem.id) as Array<{
      id: number;
      materia_prima_id: number;
      quantidade_total: number;
      movimento_id: number | null;
      nome: string;
    }>;
    for (const req of requisitos) {
      if (req.movimento_id) continue;
      const mov = lancarMovimentoMateria(
        req.materia_prima_id,
        'saida',
        req.quantidade_total,
        `Saída OP ${ordem.codigo ?? ordem.id}`,
        ordem.empresa_id,
      );
      if (!mov.ok) {
        return { ok: false, erro: `${mov.erro} (${req.nome})`, status: mov.status };
      }
      setMovimentoRequisito.run({ id: req.id, movimento_id: mov.movimentoId });
    }
    return { ok: true };
  }

  function estornarMateriais(ordem: OrdemProducao) {
    const requisitos = listRequisitosStmt.all(ordem.id) as Array<{
      id: number;
      materia_prima_id: number;
      quantidade_total: number;
      movimento_id: number | null;
    }>;
    for (const req of requisitos) {
      if (!req.movimento_id || !(req.quantidade_total > 0)) continue;
      lancarMovimentoMateria(
        req.materia_prima_id,
        'entrada',
        req.quantidade_total,
        `Estorno OP ${ordem.codigo ?? ordem.id}`,
        ordem.empresa_id,
      );
      setMovimentoRequisito.run({ id: req.id, movimento_id: null });
    }
  }

  function resolverVinculos(
    input: {
      cliente?: string;
      produto?: string;
      tamanho?: string;
      cliente_id?: number | null;
      produto_id?: number | null;
      variante_id?: number | null;
      distribuicao?: boolean;
    },
    empresaId: number,
  ) {
    let clienteId = input.cliente_id ?? null;
    let produtoId = input.produto_id ?? null;
    let varianteId = input.distribuicao ? null : (input.variante_id ?? null);
    let clienteNome = input.cliente?.trim() ?? '';
    let produtoNome = input.produto?.trim() ?? '';
    let tamanho = input.tamanho?.trim() ?? '';

    if (clienteId) {
      const c = getCliente.get(clienteId, empresaId) as { id: number; nome: string } | undefined;
      if (!c) throw Object.assign(new Error('Cliente não encontrado'), { status: 400 });
      if (!clienteNome) clienteNome = c.nome;
    } else if (clienteNome) {
      const c = db
        .prepare(
          `SELECT id FROM clientes
            WHERE empresa_id = ? AND lower(trim(nome)) = lower(trim(?))
            ORDER BY id DESC LIMIT 1`,
        )
        .get(empresaId, clienteNome) as { id: number } | undefined;
      clienteId = c?.id ?? null;
    }

    if (varianteId) {
      const v = getVariante.get(varianteId, empresaId) as
        | { id: number; produto_id: number; tamanho: string; cor: string }
        | undefined;
      if (!v) throw Object.assign(new Error('Variante não encontrada'), { status: 400 });
      produtoId = v.produto_id;
      if (!tamanho) tamanho = v.tamanho;
    }

    if (produtoId) {
      const p = getProduto.get(produtoId, empresaId) as { id: number; nome: string } | undefined;
      if (!p) throw Object.assign(new Error('Produto não encontrado'), { status: 400 });
      if (!produtoNome) produtoNome = p.nome;
      if (varianteId) {
        const v = getVariante.get(varianteId, empresaId) as { produto_id: number } | undefined;
        if (!v || v.produto_id !== produtoId) {
          throw Object.assign(new Error('Variante não pertence ao produto'), { status: 400 });
        }
      }
    } else if (produtoNome) {
      const p = db
        .prepare(
          `SELECT id FROM produtos
            WHERE empresa_id = ? AND lower(trim(nome)) = lower(trim(?))
            ORDER BY id DESC LIMIT 1`,
        )
        .get(empresaId, produtoNome) as { id: number } | undefined;
      produtoId = p?.id ?? null;
      if (produtoId && tamanho && !varianteId && !input.distribuicao) {
        const v = db
          .prepare(
            `SELECT id FROM produto_variantes
             WHERE produto_id = ?
               AND empresa_id = ?
               AND lower(trim(tamanho)) = lower(trim(?))
             ORDER BY id ASC LIMIT 1`,
          )
          .get(produtoId, empresaId, tamanho) as { id: number } | undefined;
        varianteId = v?.id ?? null;
      }
    }

    if (!clienteNome) throw Object.assign(new Error('cliente é obrigatório'), { status: 400 });
    if (!produtoNome) throw Object.assign(new Error('produto é obrigatório'), { status: 400 });
    if (!tamanho) throw Object.assign(new Error('tamanho é obrigatório'), { status: 400 });

    return {
      clienteId,
      produtoId,
      varianteId,
      clienteNome,
      produtoNome,
      tamanho,
    };
  }

  function garantirVarianteDoProduto(
    produtoId: number,
    varianteId: number | null,
    empresaId: number,
  ) {
    if (!varianteId) return;
    const variante = getVariante.get(varianteId, empresaId) as
      | { id: number; produto_id: number }
      | undefined;
    if (!variante || variante.produto_id !== produtoId) {
      throw Object.assign(new Error('Variante não encontrada'), { status: 404 });
    }
  }

  router.get('/ficha-tecnica', (req, res) => {
    const produtoId = Number(req.query.produto_id ?? 0);
    const varianteId = Number(req.query.variante_id ?? 0) || null;
    if (!produtoId) {
      return res.status(400).json({ erro: 'produto_id é obrigatório' });
    }
    const empresaId = empresaDaSessao(req);
    const produto = getProduto.get(produtoId, empresaId);
    if (!produto) return res.status(404).json({ erro: 'Produto não encontrado' });
    try {
      garantirVarianteDoProduto(produtoId, varianteId, empresaId);
    } catch (e) {
      const err = e as Error & { status?: number };
      return res.status(err.status ?? 400).json({ erro: err.message });
    }
    const itens = carregarBom(produtoId, varianteId, empresaId).map((i) => ({
      materia_prima_id: i.materia_prima_id,
      quantidade: i.quantidade,
      unidade: i.unidade ?? i.unidade_materia,
      nome: i.nome,
      codigo: i.codigo,
    }));
    res.json({ produto_id: produtoId, variante_id: varianteId, itens });
  });

  router.put('/ficha-tecnica', (req, res) => {
    const parsed = fichaSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        erro: 'Dados inválidos',
        detalhes: parsed.error.flatten().fieldErrors,
      });
    }
    const empresaId = empresaDaSessao(req);
    const produto = getProduto.get(parsed.data.produto_id, empresaId);
    if (!produto) return res.status(404).json({ erro: 'Produto não encontrado' });
    try {
      garantirVarianteDoProduto(
        parsed.data.produto_id,
        parsed.data.variante_id ?? null,
        empresaId,
      );
      gravarBom(parsed.data.produto_id, parsed.data.variante_id ?? null, parsed.data.itens, empresaId);
    } catch (e) {
      const err = e as Error & { status?: number };
      return res.status(err.status ?? 400).json({ erro: err.message });
    }
    const itens = carregarBom(parsed.data.produto_id, parsed.data.variante_id ?? null, empresaId);
    res.json({
      produto_id: parsed.data.produto_id,
      variante_id: parsed.data.variante_id ?? null,
      itens: itens.map((i) => ({
        materia_prima_id: i.materia_prima_id,
        quantidade: i.quantidade,
        unidade: i.unidade ?? i.unidade_materia,
        nome: i.nome,
        codigo: i.codigo,
      })),
    });
  });

  router.get('/', (req, res) => {
    const paginaRaw = req.query.pagina;
    const paginar = paginaRaw !== undefined && String(paginaRaw).trim() !== '';
    const pagina = Math.max(1, Number(req.query.pagina ?? 1) || 1);
    const porPagina = Math.min(
      100,
      Math.max(1, Number(req.query.por_pagina ?? 10) || 10),
    );
    const q = String(req.query.q ?? '').trim();
    const status = String(req.query.status ?? '').trim();
    const prioridade = String(req.query.prioridade ?? '').trim();
    const produtoId = Number(req.query.produto_id ?? 0);

    const where: string[] = [];
    const params: Record<string, string | number> = {};
    aplicarEmpresa(where, params, req);
    if (q) {
      where.push(
        `(ifnull(codigo,'') LIKE @q OR cliente LIKE @q OR produto LIKE @q
          OR tamanho LIKE @q OR ifnull(responsavel,'') LIKE @q
          OR ifnull(observacoes,'') LIKE @q)`,
      );
      params.q = `%${q}%`;
    }
    if ((STATUS_VALIDOS as readonly string[]).includes(status)) {
      where.push('status = @status');
      params.status = status;
    }
    if ((PRIORIDADES_OP as readonly string[]).includes(prioridade)) {
      where.push('prioridade = @prioridade');
      params.prioridade = prioridade;
    }
    if (produtoId > 0) {
      where.push('produto_id = @produto_id');
      params.produto_id = produtoId;
    }
    const filtro = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const from = `FROM ordens_producao ${filtro}`;

    if (!paginar) {
      const ordens = db
        .prepare(`SELECT * ${from} ORDER BY datetime(criado_em) DESC, id DESC`)
        .all(params) as OrdemProducao[];
      return res.json(ordens.map((ordem) => completarOrdem(ordem)));
    }

    const total = (db.prepare(`SELECT COUNT(*) AS n ${from}`).get(params) as { n: number }).n;
    const data = (
      db
        .prepare(
          `SELECT * ${from}
         ORDER BY datetime(criado_em) DESC, id DESC
         LIMIT @limit OFFSET @offset`,
        )
        .all({
          ...params,
          limit: porPagina,
          offset: (pagina - 1) * porPagina,
        }) as OrdemProducao[]
    ).map((ordem) => completarOrdem(ordem));

    res.json({
      data,
      pagina,
      por_pagina: porPagina,
      total,
      total_paginas: Math.max(1, Math.ceil(total / porPagina)),
    });
  });

  router.get('/cores', (req, res) => {
    const busca = String(req.query.q ?? '');
    res.json(listarCores(db, empresaDaSessao(req), busca));
  });

  router.post('/cores', (req, res) => {
    const parsed = corCadastroSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ erro: 'Informe o nome da cor' });
    }
    try {
      const cor = criarCor(db, empresaDaSessao(req), parsed.data);
      res.status(cor.ja_existia ? 200 : 201).json(cor);
    } catch (e) {
      return responderCadastro(res, e);
    }
  });

  router.patch('/cores/:id', (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ erro: 'Cor não encontrada' });
    }
    const parsed = corCadastroSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ erro: 'Informe o nome da cor' });
    }
    try {
      res.json(editarCor(db, empresaDaSessao(req), id, parsed.data));
    } catch (e) {
      return responderCadastro(res, e);
    }
  });

  router.delete('/cores/:id', (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ erro: 'Cor não encontrada' });
    }
    try {
      excluirCor(db, empresaDaSessao(req), id);
      res.status(204).end();
    } catch (e) {
      return responderCadastro(res, e);
    }
  });

  router.get('/tamanhos', (req, res) => {
    res.json(listarTamanhos(db, empresaDaSessao(req)));
  });

  router.post('/tamanhos', (req, res) => {
    const parsed = nomeCadastroSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ erro: 'Informe o nome do tamanho' });
    }
    const tamanho = criarTamanho(db, empresaDaSessao(req), parsed.data.nome);
    res.status(tamanho.ja_existia ? 200 : 201).json(tamanho);
  });

  router.get('/corte-infesto', (req, res) => {
    res.json(listarCortesInfesto(db, empresaDaSessao(req)));
  });

  router.get('/:id/corte-infesto', (req, res) => {
    const empresaId = empresaDaSessao(req);
    const id = Number(req.params.id);
    const ordem = getStmt.get(id, empresaId) as OrdemProducao | undefined;
    if (!ordem) return res.status(404).json({ erro: 'Ordem de produção não encontrada' });
    res.json(resumirCorteInfesto(db, empresaId, id));
  });

  router.post('/:id/corte-infesto', (req, res) => {
    const empresaId = empresaDaSessao(req);
    const id = Number(req.params.id);
    const parsed = corteInfestoSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        erro: 'Informe tecido, cor, quantidades por tamanho, camadas e o consumo do tecido',
      });
    }
    try {
      const aplicar = db.transaction(() => {
        const antes = getStmt.get(id, empresaId) as OrdemProducao | undefined;
        if (!antes) {
          throw Object.assign(new Error('Ordem de produção não encontrada'), { status: 404 });
        }
        const corte = concluirCorteInfesto(db, empresaId, id, parsed.data);
        if (corte.avancou && AINDA_PLANEJADA.has(antes.status)) {
          const depois = getStmt.get(id, empresaId) as OrdemProducao;
          const consumo = consumirMateriais(depois);
          if (!consumo.ok) throw Object.assign(new Error(consumo.erro), { status: consumo.status });
        }
        return corte;
      });
      const corte = aplicar();
      sincronizarStatusPedidoFromOps(db, id);
      const ordem = mapOrdem(id, empresaId, true);
      res.status(201).json({ ...corte, ordem });
    } catch (e) {
      const err = e as Error & { status?: number };
      return res.status(err.status ?? 400).json({ erro: err.message });
    }
  });

  router.get('/:id/ordem-corte', (req, res) => {
    const empresaId = empresaDaSessao(req);
    const id = Number(req.params.id);
    const ordem = getStmt.get(id, empresaId) as OrdemProducao | undefined;
    if (!ordem) return res.status(404).json({ erro: 'Ordem de produção não encontrada' });
    const corte = obterOrdemCorte(db, empresaId, id);
    if (!corte) return res.status(404).json({ erro: 'Ordem de corte não encontrada' });
    res.json(corte);
  });

  router.post('/:id/ordem-corte', (req, res) => {
    const empresaId = empresaDaSessao(req);
    const id = Number(req.params.id);
    const ordem = getStmt.get(id, empresaId) as OrdemProducao | undefined;
    if (!ordem) return res.status(404).json({ erro: 'Ordem de produção não encontrada' });
    try {
      const resultado = criarOuObterOrdemCorte(db, empresaId, ordem);
      res.status(resultado.criada ? 201 : 200).json({ ...resultado.corte, criada: resultado.criada });
    } catch (e) {
      const err = e as Error & { status?: number };
      return res.status(err.status ?? 400).json({ erro: err.message });
    }
  });

  router.get('/:id', (req, res) => {
    const ordem = mapOrdem(Number(req.params.id), empresaDaSessao(req), true);
    if (!ordem) {
      return res.status(404).json({ erro: 'Ordem de produção não encontrada' });
    }
    res.json(ordem);
  });

  router.post('/', exigirLimite(db, 'ordens_mes'), (req, res) => {
    const parsed = criarOrdemSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        erro: 'Dados inválidos',
        detalhes: parsed.error.flatten().fieldErrors,
      });
    }

    try {
      const data = parsed.data;
      const empresaId = empresaDaSessao(req);
      const comGrade = Boolean(data.grade?.length);
      if (data.grade) {
        const erroGrade = validarGrade(data.grade, data.quantidade);
        if (erroGrade) return res.status(400).json({ erro: erroGrade });
      }
      const vinculos = resolverVinculos(
        {
          ...data,
          tamanho: comGrade ? resumoTamanhos(data.grade ?? []) : data.tamanho,
          variante_id: comGrade ? null : data.variante_id,
          distribuicao: comGrade,
        },
        empresaId,
      );
      if (data.codigo && getByCodigo.get(data.codigo, 0, empresaId)) {
        return res.status(409).json({ erro: 'Já existe uma OP com este código' });
      }

      const info = insertStmt.run({
        empresa_id: empresaId,
        cliente: vinculos.clienteNome,
        produto: vinculos.produtoNome,
        tamanho: vinculos.tamanho,
        quantidade: data.quantidade,
        status: data.status ?? 'pendente',
        cliente_id: vinculos.clienteId,
        produto_id: vinculos.produtoId,
        variante_id: vinculos.varianteId,
        codigo: data.codigo ?? null,
        prioridade: data.prioridade ?? 'normal',
        data_prevista: data.data_prevista ?? null,
        observacoes: data.observacoes ?? null,
        responsavel: data.responsavel ?? null,
      });
      const id = Number(info.lastInsertRowid);
      if (!data.codigo) {
        setCodigoStmt.run({ id, empresa_id: empresaId, codigo: `OP-${String(id).padStart(4, '0')}` });
      }

      let itens = data.requisitos ?? [];
      if (!itens.length && vinculos.produtoId) {
        itens = carregarBom(vinculos.produtoId, vinculos.varianteId, empresaId).map((i) => ({
          materia_prima_id: i.materia_prima_id,
          quantidade: i.quantidade,
        }));
      }
      if (itens.length) gravarRequisitos(id, data.quantidade, itens, empresaId);
      if (comGrade && data.grade) gravarGrade(db, empresaId, id, data.grade);

      const criada = mapOrdem(id, empresaId, true)!;
      if (CONSOME_ESTOQUE.has(criada.status)) {
        const cons = consumirMateriais(criada);
        if (!cons.ok) {
          deleteStmt.run(id, empresaId);
          return res.status(cons.status).json({ erro: cons.erro });
        }
      }

      res.status(201).json(mapOrdem(id, empresaId, true));
    } catch (e) {
      const err = e as Error & { status?: number };
      return res.status(err.status ?? 400).json({ erro: err.message });
    }
  });

  router.patch('/:id', (req, res) => {
    const parsed = atualizarOrdemSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        erro: 'Dados inválidos',
        detalhes: parsed.error.flatten().fieldErrors,
      });
    }

    const id = Number(req.params.id);
    const empresaId = empresaDaSessao(req);
    const atual = getStmt.get(id, empresaId) as OrdemProducao | undefined;
    if (!atual) {
      return res.status(404).json({ erro: 'Ordem de produção não encontrada' });
    }

    const data = parsed.data;
    const soStatus =
      Object.keys(req.body ?? {}).length === 1 && data.status !== undefined;

    if (data.status && data.status !== atual.status) {
      if (!podeTransicionar(atual.status, data.status)) {
        return res.status(409).json({
          erro: `Não é possível alterar o status de ${atual.status} para ${data.status}`,
        });
      }
    }

    if (data.codigo && getByCodigo.get(data.codigo, id, empresaId)) {
      return res.status(409).json({ erro: 'Já existe uma OP com este código' });
    }

    try {
      const quantidade = data.quantidade ?? atual.quantidade;
      const gradeAtual = lerGrade(db, empresaId, id);
      const comGrade = Boolean(data.grade?.length);
      if (data.grade) {
        const erroGrade = validarGrade(data.grade, quantidade);
        if (erroGrade) return res.status(400).json({ erro: erroGrade });
      } else if (
        gradeAtual.length > 0 &&
        data.quantidade !== undefined &&
        data.quantidade !== atual.quantidade
      ) {
        const erroGrade = validarGrade(gradeAtual, quantidade);
        if (erroGrade) return res.status(400).json({ erro: erroGrade });
      }
      const distribuicao = comGrade || gradeAtual.length > 0;

      const aplicar = db.transaction(() => {
        const vinculos = resolverVinculos({
          cliente: data.cliente ?? atual.cliente,
          produto: data.produto ?? atual.produto,
          tamanho: comGrade ? resumoTamanhos(data.grade ?? []) : (data.tamanho ?? atual.tamanho),
          cliente_id: data.cliente_id === undefined ? atual.cliente_id : data.cliente_id,
          produto_id: data.produto_id === undefined ? atual.produto_id : data.produto_id,
          variante_id: comGrade
            ? null
            : data.variante_id === undefined
              ? atual.variante_id
              : data.variante_id,
          distribuicao,
        }, empresaId);
        const novoStatus = data.status ?? atual.status;

        db.prepare(
          `UPDATE ordens_producao SET
             cliente = @cliente,
             produto = @produto,
             tamanho = @tamanho,
             quantidade = @quantidade,
             status = @status,
             cliente_id = @cliente_id,
             produto_id = @produto_id,
             variante_id = @variante_id,
             codigo = @codigo,
             prioridade = @prioridade,
             data_prevista = @data_prevista,
             observacoes = @observacoes,
             responsavel = @responsavel,
             atualizado_em = datetime('now')
           WHERE id = @id AND empresa_id = @empresa_id`,
        ).run({
          id,
          empresa_id: empresaId,
          cliente: vinculos.clienteNome,
          produto: vinculos.produtoNome,
          tamanho: vinculos.tamanho,
          quantidade,
          status: novoStatus,
          cliente_id: vinculos.clienteId,
          produto_id: vinculos.produtoId,
          variante_id: vinculos.varianteId,
          codigo: data.codigo ?? atual.codigo,
          prioridade: data.prioridade ?? atual.prioridade ?? 'normal',
          data_prevista:
            data.data_prevista === undefined ? atual.data_prevista : data.data_prevista,
          observacoes: data.observacoes === undefined ? atual.observacoes : data.observacoes,
          responsavel: data.responsavel === undefined ? atual.responsavel : data.responsavel,
        });

        if (comGrade && data.grade) gravarGrade(db, empresaId, id, data.grade);

        if (data.requisitos) {
          gravarRequisitos(id, quantidade, data.requisitos, empresaId);
        } else if (data.quantidade && data.quantidade !== atual.quantidade) {
          const atuais = listRequisitosStmt.all(id) as Array<{
            materia_prima_id: number;
            quantidade_unitaria: number;
          }>;
          gravarRequisitos(
            id,
            quantidade,
            atuais.map((r) => ({
              materia_prima_id: r.materia_prima_id,
              quantidade: r.quantidade_unitaria,
            })),
            empresaId,
          );
        }

        const depois = getStmt.get(id, empresaId) as OrdemProducao;
        if (AINDA_PLANEJADA.has(atual.status) && CONSOME_ESTOQUE.has(novoStatus)) {
          const cons = consumirMateriais(depois);
          if (!cons.ok) {
            throw Object.assign(new Error(cons.erro), { status: cons.status });
          }
        }
        if (novoStatus === 'cancelada' && CONSOME_ESTOQUE.has(atual.status)) {
          estornarCortesInfesto(db, empresaId, id);
          estornarMateriais(depois);
        }
      });

      aplicar();
      sincronizarStatusPedidoFromOps(db, id);
      res.json(mapOrdem(id, empresaId, !soStatus));
    } catch (e) {
      const err = e as Error & { status?: number };
      return res.status(err.status ?? 400).json({ erro: err.message });
    }
  });

  router.delete('/:id', (req, res) => {
    const id = Number(req.params.id);
    const empresaId = empresaDaSessao(req);
    const atual = getStmt.get(id, empresaId) as OrdemProducao | undefined;
    if (!atual) {
      return res.status(404).json({ erro: 'Ordem de produção não encontrada' });
    }
    if (CONSOME_ESTOQUE.has(atual.status) && atual.status !== 'cancelada') {
      return res.status(409).json({
        erro: 'Não é possível excluir uma OP em produção. Cancele-a primeiro.',
      });
    }
    try {
      const info = deleteStmt.run(id, empresaId);
      if (info.changes === 0) {
        return res.status(404).json({ erro: 'Ordem de produção não encontrada' });
      }
    } catch (e) {
      const err = e as Error;
      if (/FOREIGN KEY/i.test(err.message)) {
        return res.status(409).json({
          erro: 'Não é possível excluir uma OP que já tem ordem de corte',
        });
      }
      throw e;
    }
    res.status(204).send();
  });

  return router;
}
