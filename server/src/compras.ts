import { Router } from 'express';
import { z } from 'zod';
import type { AppDatabase } from './db.js';
import { registrarMovimentoEstoque } from './estoque.js';
import { arredondarDinheiro, sincronizarContaPagarCompra } from './financeiro.js';
import { aplicarEmpresa, empresaDaSessao } from './tenant.js';
import { processarDocumentoCompra } from './documentosCompra.js';
import { TIPOS_DOCUMENTO } from './leituraDocumento.js';

export const STATUS_COMPRA = [
  'rascunho',
  'aberta',
  'parcial',
  'recebida',
  'cancelada',
] as const;
export type StatusCompra = (typeof STATUS_COMPRA)[number];

export interface CompraItem {
  id: number;
  compra_id: number;
  materia_prima_id: number | null;
  produto_id: number | null;
  variante_id: number | null;
  quantidade: number;
  quantidade_recebida: number;
  custo_unitario: number;
  total: number;
  unidade: string | null;
  tecido_cor_id: number | null;
  cor_tecido?: string | null;
  criado_em: string;
  nome?: string | null;
  codigo?: string | null;
}

export interface PedidoCompra {
  id: number;
  empresa_id: number;
  codigo: string | null;
  fornecedor_id: number;
  data_emissao: string;
  data_prevista: string | null;
  status: StatusCompra;
  observacoes: string | null;
  subtotal: number;
  desconto: number;
  frete: number;
  total: number;
  forma_pagamento: string | null;
  condicao_pagamento: string | null;
  vencimento: string | null;
  nota_fiscal: string | null;
  documento_importado_id?: number | null;
  documento_nome?: string | null;
  documento_numero?: string | null;
  documento_tipo?: string | null;
  criado_em: string;
  atualizado_em: string;
  fornecedor?: string;
  itens?: CompraItem[];
}

const textoOpcional = z
  .string()
  .trim()
  .max(200)
  .optional()
  .or(z.literal(''))
  .transform((v) => (v ? v : undefined));

const itemSchema = z
  .object({
    materia_prima_id: z.number().int().positive().optional(),
    produto_id: z.number().int().positive().optional(),
    variante_id: z.number().int().positive().optional(),
    quantidade: z.number().positive('quantidade deve ser maior que zero'),
    custo_unitario: z.number().min(0, 'custo não pode ser negativo'),
    unidade: textoOpcional,
    tecido_cor_id: z.number().int().positive().optional(),
  })
  .refine(
    (item) => {
      const refs = [item.materia_prima_id, item.produto_id, item.variante_id].filter(Boolean);
      return refs.length === 1;
    },
    { message: 'Informe exatamente um de materia_prima_id, produto_id ou variante_id' },
  );

const compraBaseSchema = z.object({
  codigo: textoOpcional,
  fornecedor_id: z.number().int().positive(),
  data_emissao: textoOpcional,
  data_prevista: textoOpcional,
  status: z.enum(STATUS_COMPRA).optional(),
  observacoes: z
    .string()
    .trim()
    .max(2000)
    .optional()
    .or(z.literal(''))
    .transform((v) => (v ? v : undefined)),
  desconto: z.number().min(0).optional(),
  frete: z.number().min(0).optional(),
  forma_pagamento: textoOpcional,
  condicao_pagamento: textoOpcional,
  vencimento: textoOpcional,
  nota_fiscal: textoOpcional,
  documento_importado_id: z.number().int().positive().optional(),
  confirmar: z.boolean().optional(),
  itens: z.array(itemSchema).optional(),
});

const atualizarCompraSchema = compraBaseSchema
  .omit({ confirmar: true, documento_importado_id: true })
  .partial()
  .extend({
    fornecedor_id: z.number().int().positive().optional(),
  })
  .refine((body) => Object.keys(body).length > 0, {
    message: 'Informe ao menos um campo para atualizar',
  });

const receberSchema = z.object({
  itens: z
    .array(
      z.object({
        item_id: z.number().int().positive(),
        quantidade: z.number().positive('quantidade deve ser maior que zero'),
      }),
    )
    .optional(),
});

const COMPRA_SELECT = `
  SELECT c.*, f.nome AS fornecedor,
         d.nome_arquivo AS documento_nome,
         d.numero AS documento_numero,
         d.tipo AS documento_tipo
  FROM pedidos_compra c
  JOIN fornecedores f ON f.id = c.fornecedor_id
  LEFT JOIN documentos_importados d
    ON d.id = c.documento_importado_id AND d.empresa_id = c.empresa_id
`;

const ITEM_SELECT = `
  SELECT
    i.*,
    CASE
      WHEN i.materia_prima_id IS NOT NULL AND tc.nome IS NOT NULL THEN m.nome || ' — ' || tc.nome
      WHEN i.materia_prima_id IS NOT NULL THEN m.nome
      ELSE p.nome
    END AS nome,
    CASE
      WHEN i.materia_prima_id IS NOT NULL THEN m.codigo
      WHEN i.variante_id IS NOT NULL THEN v.sku
      ELSE p.sku
    END AS codigo,
    tc.nome AS cor_tecido
  FROM pedido_compra_itens i
  LEFT JOIN materias_primas m ON m.id = i.materia_prima_id
  LEFT JOIN tecido_cores tc ON tc.id = i.tecido_cor_id AND tc.empresa_id = i.empresa_id
  LEFT JOIN produtos p ON p.id = i.produto_id
  LEFT JOIN produto_variantes v ON v.id = i.variante_id
`;

function hoje(): string {
  return new Date().toISOString().slice(0, 10);
}

function podeEditarItens(status: StatusCompra): boolean {
  return status === 'rascunho';
}

export function createComprasRouter(db: AppDatabase): Router {
  const router = Router();
  const getCompraStmt = db.prepare(`${COMPRA_SELECT} WHERE c.id = ? AND c.empresa_id = ?`);
  const listItensStmt = db.prepare(`${ITEM_SELECT} WHERE i.compra_id = ? ORDER BY i.id ASC`);

  function mapItens(compraId: number): CompraItem[] {
    return listItensStmt.all(compraId) as CompraItem[];
  }

  function mapCompra(id: number, empresaId: number, comItens = false): PedidoCompra | undefined {
    const row = getCompraStmt.get(id, empresaId) as PedidoCompra | undefined;
    if (!row) return undefined;
    if (comItens) row.itens = mapItens(id);
    return row;
  }

  function recalc(compraId: number, empresaId: number) {
    const itens = db
      .prepare(
        `SELECT ifnull(SUM(total),0) AS subtotal FROM pedido_compra_itens WHERE compra_id = ?`,
      )
      .get(compraId) as { subtotal: number };
    const compra = db
      .prepare('SELECT desconto, frete FROM pedidos_compra WHERE id = ? AND empresa_id = ?')
      .get(compraId, empresaId) as { desconto: number; frete: number };
    const subtotal = arredondarDinheiro(itens.subtotal);
    const desconto = Math.min(compra.desconto, subtotal);
    const total = arredondarDinheiro(subtotal - desconto + compra.frete);
    db.prepare(
      `UPDATE pedidos_compra
          SET subtotal = @subtotal, desconto = @desconto, total = @total, atualizado_em = datetime('now')
        WHERE id = @id AND empresa_id = @empresa_id`,
    ).run({ id: compraId, empresa_id: empresaId, subtotal, desconto, total });
    const atual = mapCompra(compraId, empresaId);
    if (atual) sincronizarContaPagarCompra(db, atual);
    return atual;
  }

  function validarItemAlvo(item: z.infer<typeof itemSchema>, empresaId: number): string | null {
    if (item.materia_prima_id) {
      const m = db
        .prepare('SELECT id FROM materias_primas WHERE id = ? AND empresa_id = ?')
        .get(item.materia_prima_id, empresaId);
      return m ? null : 'Matéria-prima não encontrada';
    }
    if (item.variante_id) {
      const v = db
        .prepare(
          `SELECT v.id, v.produto_id FROM produto_variantes v
            JOIN produtos p ON p.id = v.produto_id
           WHERE v.id = ? AND p.empresa_id = ?`,
        )
        .get(item.variante_id, empresaId) as { id: number; produto_id: number } | undefined;
      return v ? null : 'Variante não encontrada';
    }
    if (item.produto_id) {
      const p = db
        .prepare('SELECT id FROM produtos WHERE id = ? AND empresa_id = ?')
        .get(item.produto_id, empresaId);
      if (!p) return 'Produto não encontrado';
      const nVar = (
        db
          .prepare('SELECT COUNT(*) AS n FROM produto_variantes WHERE produto_id = ?')
          .get(item.produto_id) as { n: number }
      ).n;
      if (nVar > 0) return 'Produto possui variantes; informe variante_id';
      return null;
    }
    return 'Informe o item';
  }

  function unidadeCadastrada(
    ref: {
      materia_prima_id?: number | null;
      produto_id?: number | null;
      variante_id?: number | null;
    },
    empresaId: number,
  ): string | null {
    if (ref.materia_prima_id) {
      const row = db
        .prepare('SELECT unidade FROM materias_primas WHERE id = ? AND empresa_id = ?')
        .get(ref.materia_prima_id, empresaId) as { unidade: string | null } | undefined;
      const unidade = row?.unidade?.trim();
      return unidade ? unidade : null;
    }
    if (ref.variante_id) {
      const row = db
        .prepare(
          `SELECT p.unidade FROM produto_variantes v
             JOIN produtos p ON p.id = v.produto_id
            WHERE v.id = ? AND p.empresa_id = ?`,
        )
        .get(ref.variante_id, empresaId) as { unidade: string | null } | undefined;
      const unidade = row?.unidade?.trim();
      return unidade ? unidade : null;
    }
    if (ref.produto_id) {
      const row = db
        .prepare('SELECT unidade FROM produtos WHERE id = ? AND empresa_id = ?')
        .get(ref.produto_id, empresaId) as { unidade: string | null } | undefined;
      const unidade = row?.unidade?.trim();
      return unidade ? unidade : null;
    }
    return null;
  }

  function exigirUnidade(informada: string | undefined, cadastrada: string | null): string | null {
    if (!cadastrada) return informada ?? null;
    if (informada && informada.trim().toUpperCase() !== cadastrada.trim().toUpperCase()) {
      throw Object.assign(
        new Error(`A compra precisa usar a unidade cadastrada (${cadastrada})`),
        { status: 400 },
      );
    }
    return cadastrada;
  }

  function textoDocumento(compra: PedidoCompra): string | null {
    if (!compra.documento_importado_id) return null;
    const numero = compra.documento_numero || compra.nota_fiscal;
    const arquivo = compra.documento_nome ? `(${compra.documento_nome})` : '';
    return ['Documento', numero, arquivo].filter(Boolean).join(' ');
  }

  function lancarMovimentoCompra(
    compra: PedidoCompra,
    item: CompraItem,
    tipo: 'entrada' | 'saida',
    quantidade: number,
    usuarioId: number | null,
    motivo: string,
  ) {
    const mov = registrarMovimentoEstoque(db, compra.empresa_id, {
      tipo,
      quantidade,
    materia_prima_id: item.materia_prima_id ?? undefined,
    tecido_cor_id: item.tecido_cor_id ?? undefined,
    produto_id: item.variante_id ? undefined : item.produto_id ?? undefined,
    variante_id: item.variante_id ?? undefined,
      motivo,
      observacoes:
        tipo === 'entrada'
          ? [ `Recebimento item ${item.id}`, textoDocumento(compra) ].filter(Boolean).join('. ')
          : `Estorno da compra ${compra.codigo ?? compra.id}`,
      unidade: item.unidade || unidadeCadastrada(item, compra.empresa_id),
      custo: item.custo_unitario,
      usuario_id: usuarioId,
      referencia_tipo: 'compra',
      referencia_id: compra.id,
    });
    if (!mov.ok) {
      const erro =
        tipo === 'saida' && mov.erro === 'Estoque insuficiente para a saída'
          ? 'Não foi possível cancelar a compra porque o estoque já foi utilizado'
          : mov.erro;
      throw Object.assign(new Error(erro), { status: mov.status });
    }
  }

  function receberItens(
    compra: PedidoCompra,
    pedidos: Array<{ item_id: number; quantidade: number }>,
    usuarioId: number | null,
  ) {
    const itens = compra.itens ?? [];
    for (const pedido of pedidos) {
      const item = itens.find((i) => i.id === pedido.item_id);
      if (!item) throw Object.assign(new Error('Item não pertence à compra'), { status: 404 });
      const restante = arredondarDinheiro(item.quantidade - item.quantidade_recebida);
      if (pedido.quantidade - restante > 1e-6) {
        throw Object.assign(
          new Error(`Quantidade a receber excede o saldo do item (${restante})`),
          { status: 400 },
        );
      }
      lancarMovimentoCompra(
        compra,
        item,
        'entrada',
        pedido.quantidade,
        usuarioId,
        `Compra ${compra.codigo ?? compra.id}`,
      );
      db.prepare(
        `UPDATE pedido_compra_itens
            SET quantidade_recebida = quantidade_recebida + @q
          WHERE id = @id`,
      ).run({ id: item.id, q: pedido.quantidade });
    }
    const atualizados = mapItens(compra.id);
    const algum = atualizados.some((i) => i.quantidade_recebida > 0);
    const todos = atualizados.every((i) => i.quantidade_recebida + 1e-9 >= i.quantidade);
    const status: StatusCompra = todos ? 'recebida' : algum ? 'parcial' : compra.status;
    db.prepare(
      `UPDATE pedidos_compra SET status = @status, atualizado_em = datetime('now')
        WHERE id = @id AND empresa_id = @empresa_id`,
    ).run({ id: compra.id, empresa_id: compra.empresa_id, status });
    const after = mapCompra(compra.id, compra.empresa_id);
    if (after) sincronizarContaPagarCompra(db, after);
  }

  function estornarRecebimento(compra: PedidoCompra, usuarioId: number | null) {
    for (const item of compra.itens ?? []) {
      if (item.quantidade_recebida <= 0) continue;
      lancarMovimentoCompra(
        compra,
        item,
        'saida',
        item.quantidade_recebida,
        usuarioId,
        `Cancelamento ${compra.codigo ?? compra.id}`,
      );
      db.prepare('UPDATE pedido_compra_itens SET quantidade_recebida = 0 WHERE id = ?').run(item.id);
    }
  }

  function validarCorDoItem(
    item: { materia_prima_id?: number; tecido_cor_id?: number },
    empresaId: number,
  ): number | null {
    if (!item.materia_prima_id) {
      if (item.tecido_cor_id) {
        throw Object.assign(new Error('A cor pertence a um tecido'), { status: 400 });
      }
      return null;
    }
    const materia = db
      .prepare('SELECT tipo FROM materias_primas WHERE id = ? AND empresa_id = ?')
      .get(item.materia_prima_id, empresaId) as { tipo: string } | undefined;
    if (!materia || materia.tipo !== 'tecido') {
      if (item.tecido_cor_id) {
        throw Object.assign(new Error('Esta matéria não usa cor de tecido'), { status: 400 });
      }
      return null;
    }
    const cores = db
      .prepare('SELECT id, status FROM tecido_cores WHERE tecido_id = ? AND empresa_id = ?')
      .all(item.materia_prima_id, empresaId) as Array<{ id: number; status: string }>;
    if (cores.length === 0) {
      if (item.tecido_cor_id) {
        throw Object.assign(new Error('Este tecido não possui essa cor'), { status: 400 });
      }
      return null;
    }
    if (!item.tecido_cor_id) {
      throw Object.assign(new Error('Selecione a cor do tecido'), { status: 400 });
    }
    const cor = cores.find((itemCor) => itemCor.id === item.tecido_cor_id);
    if (!cor) throw Object.assign(new Error('Cor do tecido não encontrada'), { status: 404 });
    if (cor.status !== 'ativo') {
      throw Object.assign(new Error('A cor do tecido está inativa'), { status: 409 });
    }
    return cor.id;
  }

  function inserirItem(compraId: number, empresaId: number, item: z.infer<typeof itemSchema>) {
    const erro = validarItemAlvo(item, empresaId);
    if (erro) throw Object.assign(new Error(erro), { status: 404 });
    const unidade = exigirUnidade(item.unidade, unidadeCadastrada(item, empresaId));
    const tecidoCorId = validarCorDoItem(item, empresaId);
    const total = arredondarDinheiro(item.quantidade * item.custo_unitario);
    let produtoId = item.produto_id ?? null;
    if (item.variante_id) {
      const v = db
        .prepare('SELECT produto_id FROM produto_variantes WHERE id = ?')
        .get(item.variante_id) as { produto_id: number };
      produtoId = v.produto_id;
    }
    const info = db
      .prepare(
        `INSERT INTO pedido_compra_itens (
           empresa_id, compra_id, materia_prima_id, produto_id, variante_id,
           quantidade, quantidade_recebida, custo_unitario, total, unidade, tecido_cor_id
         ) VALUES (
           @empresa_id, @compra_id, @materia_prima_id, @produto_id, @variante_id,
           @quantidade, 0, @custo_unitario, @total, @unidade, @tecido_cor_id
         )`,
      )
      .run({
        empresa_id: empresaId,
        compra_id: compraId,
        materia_prima_id: item.materia_prima_id ?? null,
        produto_id: produtoId,
        variante_id: item.variante_id ?? null,
        quantidade: item.quantidade,
        custo_unitario: item.custo_unitario,
        total,
        unidade,
        tecido_cor_id: tecidoCorId,
      });
    return Number(info.lastInsertRowid);
  }

  router.get('/', (req, res) => {
    const pagina = Math.max(1, Number(req.query.pagina ?? 1) || 1);
    const porPagina = Math.min(
      100,
      Math.max(1, Number(req.query.por_pagina ?? 10) || 10),
    );
    const q = String(req.query.q ?? '').trim();
    const status = String(req.query.status ?? '').trim();
    const fornecedorId = Number(req.query.fornecedor_id ?? 0);
    const de = String(req.query.de ?? '').trim();
    const ate = String(req.query.ate ?? '').trim();

    const where: string[] = [];
    const params: Record<string, string | number> = {};
    aplicarEmpresa(where, params, req, 'c.empresa_id');
    if (q) {
      where.push(
        `(ifnull(c.codigo,'') LIKE @q OR f.nome LIKE @q OR ifnull(c.observacoes,'') LIKE @q OR ifnull(c.nota_fiscal,'') LIKE @q)`,
      );
      params.q = `%${q}%`;
    }
    if ((STATUS_COMPRA as readonly string[]).includes(status)) {
      where.push('c.status = @status');
      params.status = status;
    }
    if (fornecedorId > 0) {
      where.push('c.fornecedor_id = @fornecedor_id');
      params.fornecedor_id = fornecedorId;
    }
    if (de) {
      where.push('date(c.data_emissao) >= date(@de)');
      params.de = de;
    }
    if (ate) {
      where.push('date(c.data_emissao) <= date(@ate)');
      params.ate = ate;
    }
    const filtro = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const from = `FROM pedidos_compra c JOIN fornecedores f ON f.id = c.fornecedor_id ${filtro}`;
    const total = (db.prepare(`SELECT COUNT(*) AS n ${from}`).get(params) as { n: number }).n;
    const data = db
      .prepare(
        `SELECT c.*, f.nome AS fornecedor ${from}
         ORDER BY datetime(c.criado_em) DESC, c.id DESC
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

  const documentoSchema = z.object({
    tipo: z.enum(TIPOS_DOCUMENTO),
    nome_arquivo: z.string().trim().min(1, 'informe o arquivo').max(200),
    conteudo_base64: z.string().trim().min(20, 'envie o PDF').max(12_000_000),
  });

  router.post('/documentos', async (req, res) => {
    const parsed = documentoSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        erro: 'Dados inválidos',
        detalhes: parsed.error.flatten().fieldErrors,
      });
    }
    const pdf = Buffer.from(parsed.data.conteudo_base64, 'base64');
    if (pdf.length === 0) return res.status(400).json({ erro: 'Arquivo PDF inválido' });
    try {
      const documento = await processarDocumentoCompra(db, empresaDaSessao(req), req.usuario!.id, {
        tipo: parsed.data.tipo,
        nomeArquivo: parsed.data.nome_arquivo,
        pdf,
      });
      res.status(201).json(documento);
    } catch (err) {
      const falha = err as Error & { status?: number };
      return res.status(falha.status ?? 400).json({ erro: falha.message });
    }
  });

  router.get('/:id', (req, res) => {
    const compra = mapCompra(Number(req.params.id), empresaDaSessao(req), true);
    if (!compra) return res.status(404).json({ erro: 'Compra não encontrada' });
    res.json(compra);
  });

  router.post('/', (req, res) => {
    const parsed = compraBaseSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        erro: 'Dados inválidos',
        detalhes: parsed.error.flatten().fieldErrors,
        form: parsed.error.flatten().formErrors,
      });
    }
    const data = parsed.data;
    const empresaId = empresaDaSessao(req);
    const fornecedor = db
      .prepare('SELECT id FROM fornecedores WHERE id = ? AND empresa_id = ?')
      .get(data.fornecedor_id, empresaId);
    if (!fornecedor) return res.status(404).json({ erro: 'Fornecedor não encontrado' });
    if (data.documento_importado_id) {
      const documento = db
        .prepare('SELECT id FROM documentos_importados WHERE id = ? AND empresa_id = ?')
        .get(data.documento_importado_id, empresaId);
      if (!documento) return res.status(404).json({ erro: 'Documento não encontrado' });
    }
    if (data.status && data.status !== 'rascunho' && data.status !== 'aberta') {
      return res.status(400).json({ erro: 'Nova compra deve nascer como rascunho ou aberta' });
    }
    if (data.status === 'aberta' && (!data.itens || data.itens.length === 0)) {
      return res.status(400).json({ erro: 'Abra a compra com ao menos um item' });
    }
    if (data.confirmar && (!data.itens || data.itens.length === 0)) {
      return res.status(400).json({ erro: 'Confirme a compra com ao menos um item' });
    }

    try {
      const criar = db.transaction(() => {
        const info = db
          .prepare(
            `INSERT INTO pedidos_compra (
               empresa_id, codigo, fornecedor_id, data_emissao, data_prevista, status, observacoes,
               desconto, frete, forma_pagamento, condicao_pagamento, vencimento, nota_fiscal,
               documento_importado_id
             ) VALUES (
               @empresa_id, @codigo, @fornecedor_id, @data_emissao, @data_prevista, @status, @observacoes,
               @desconto, @frete, @forma_pagamento, @condicao_pagamento, @vencimento, @nota_fiscal,
               @documento_importado_id
             )`,
          )
          .run({
            empresa_id: empresaId,
            codigo: data.codigo ?? null,
            fornecedor_id: data.fornecedor_id,
            data_emissao: data.data_emissao ?? hoje(),
            data_prevista: data.data_prevista ?? null,
            status: data.status ?? 'rascunho',
            observacoes: data.observacoes ?? null,
            desconto: data.desconto ?? 0,
            frete: data.frete ?? 0,
            forma_pagamento: data.forma_pagamento ?? null,
            condicao_pagamento: data.condicao_pagamento ?? null,
            vencimento: data.vencimento ?? data.data_prevista ?? null,
            nota_fiscal: data.nota_fiscal ?? null,
            documento_importado_id: data.documento_importado_id ?? null,
          });
        const id = Number(info.lastInsertRowid);
        if (!data.codigo) {
          db.prepare(
            'UPDATE pedidos_compra SET codigo = @codigo WHERE id = @id AND empresa_id = @empresa_id',
          ).run({
            id,
            empresa_id: empresaId,
            codigo: `CP-${String(id).padStart(4, '0')}`,
          });
        }
        for (const item of data.itens ?? []) inserirItem(id, empresaId, item);
        recalc(id, empresaId);
        if (data.confirmar) {
          const compra = mapCompra(id, empresaId, true);
          if (!compra?.itens?.length) {
            throw Object.assign(new Error('Confirme a compra com ao menos um item'), { status: 400 });
          }
          receberItens(
            compra,
            compra.itens.map((item) => ({ item_id: item.id, quantidade: item.quantidade })),
            req.usuario?.id ?? null,
          );
        }
        return id;
      });
      const id = criar();
      res.status(201).json(mapCompra(id, empresaId, true));
    } catch (err) {
      const status = (err as { status?: number }).status ?? 400;
      if (err instanceof Error && /UNIQUE/i.test(err.message)) {
        return res.status(409).json({ erro: 'Código de compra já cadastrado' });
      }
      return res.status(status).json({ erro: (err as Error).message });
    }
  });

  router.patch('/:id', (req, res) => {
    const id = Number(req.params.id);
    const empresaId = empresaDaSessao(req);
    const atual = mapCompra(id, empresaId, true);
    if (!atual) return res.status(404).json({ erro: 'Compra não encontrada' });
    const parsed = atualizarCompraSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        erro: 'Dados inválidos',
        detalhes: parsed.error.flatten().fieldErrors,
        form: parsed.error.flatten().formErrors,
      });
    }
    const data = parsed.data;
    const cancelando = data.status === 'cancelada' && atual.status !== 'cancelada';
    const camposAlemDoCancelamento = Object.keys(data).filter(
      (campo) => campo !== 'status' && campo !== 'observacoes',
    );
    if (atual.status === 'cancelada' || atual.status === 'recebida') {
      const cancelaRecebida =
        atual.status === 'recebida' && cancelando && camposAlemDoCancelamento.length === 0;
      if (!cancelaRecebida) {
        if (data.status && data.status !== atual.status) {
          return res.status(409).json({ erro: 'Não é possível alterar o status desta compra' });
        }
        if (Object.keys(data).some((k) => k !== 'observacoes')) {
          return res.status(409).json({ erro: 'Compra recebida ou cancelada não pode ser editada' });
        }
      }
    }
    if (data.status && data.status !== atual.status) {
      const permitido =
        (atual.status === 'rascunho' && (data.status === 'aberta' || data.status === 'cancelada')) ||
        ((atual.status === 'aberta' || atual.status === 'parcial' || atual.status === 'recebida') &&
          data.status === 'cancelada');
      if (!permitido) {
        return res.status(409).json({
          erro: `Transição de ${atual.status} para ${data.status} não é permitida`,
        });
      }
      if (data.status === 'aberta' && (atual.itens?.length ?? 0) === 0 && !data.itens?.length) {
        return res.status(400).json({ erro: 'Abra a compra com ao menos um item' });
      }
    }
    if (data.itens && !podeEditarItens(atual.status) && atual.status !== 'rascunho') {
      return res.status(409).json({ erro: 'Itens só podem ser substituídos em rascunho' });
    }
    if (data.fornecedor_id) {
      const f = db
        .prepare('SELECT id FROM fornecedores WHERE id = ? AND empresa_id = ?')
        .get(data.fornecedor_id, empresaId);
      if (!f) return res.status(404).json({ erro: 'Fornecedor não encontrado' });
    }

    try {
      db.transaction(() => {
        db.prepare(
          `UPDATE pedidos_compra SET
             fornecedor_id = @fornecedor_id,
             data_emissao = @data_emissao,
             data_prevista = @data_prevista,
             status = @status,
             observacoes = @observacoes,
             desconto = @desconto,
             frete = @frete,
             forma_pagamento = @forma_pagamento,
             condicao_pagamento = @condicao_pagamento,
             vencimento = @vencimento,
             nota_fiscal = @nota_fiscal,
             codigo = @codigo,
             atualizado_em = datetime('now')
           WHERE id = @id AND empresa_id = @empresa_id`,
        ).run({
          id,
          empresa_id: empresaId,
          fornecedor_id: data.fornecedor_id ?? atual.fornecedor_id,
          data_emissao: data.data_emissao ?? atual.data_emissao,
          data_prevista: data.data_prevista !== undefined ? data.data_prevista ?? null : atual.data_prevista,
          status: data.status ?? atual.status,
          observacoes: data.observacoes !== undefined ? data.observacoes ?? null : atual.observacoes,
          desconto: data.desconto ?? atual.desconto,
          frete: data.frete ?? atual.frete,
          forma_pagamento:
            data.forma_pagamento !== undefined ? data.forma_pagamento ?? null : atual.forma_pagamento,
          condicao_pagamento:
            data.condicao_pagamento !== undefined
              ? data.condicao_pagamento ?? null
              : atual.condicao_pagamento,
          vencimento: data.vencimento !== undefined ? data.vencimento ?? null : atual.vencimento,
          nota_fiscal: data.nota_fiscal !== undefined ? data.nota_fiscal ?? null : atual.nota_fiscal,
          codigo: data.codigo ?? atual.codigo,
        });
        if (data.itens) {
          db.prepare('DELETE FROM pedido_compra_itens WHERE compra_id = ?').run(id);
          for (const item of data.itens) inserirItem(id, empresaId, item);
        }
        if (cancelando) estornarRecebimento(atual, req.usuario?.id ?? null);
        recalc(id, empresaId);
      })();
      res.json(mapCompra(id, empresaId, true));
    } catch (err) {
      const status = (err as { status?: number }).status ?? 400;
      return res.status(status).json({ erro: (err as Error).message });
    }
  });

  router.post('/:id/itens', (req, res) => {
    const compra = mapCompra(Number(req.params.id), empresaDaSessao(req));
    if (!compra) return res.status(404).json({ erro: 'Compra não encontrada' });
    if (!podeEditarItens(compra.status)) {
      return res.status(409).json({ erro: 'Itens só podem ser incluídos em rascunho' });
    }
    const parsed = itemSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        erro: 'Dados inválidos',
        detalhes: parsed.error.flatten().fieldErrors,
        form: parsed.error.flatten().formErrors,
      });
    }
    try {
      db.transaction(() => {
        inserirItem(compra.id, compra.empresa_id, parsed.data);
        recalc(compra.id, compra.empresa_id);
      })();
      res.status(201).json(mapCompra(compra.id, compra.empresa_id, true));
    } catch (err) {
      const status = (err as { status?: number }).status ?? 400;
      return res.status(status).json({ erro: (err as Error).message });
    }
  });

  router.patch('/:id/itens/:itemId', (req, res) => {
    const compra = mapCompra(Number(req.params.id), empresaDaSessao(req));
    if (!compra) return res.status(404).json({ erro: 'Compra não encontrada' });
    if (!podeEditarItens(compra.status)) {
      return res.status(409).json({ erro: 'Itens só podem ser editados em rascunho' });
    }
    const itemId = Number(req.params.itemId);
    const item = db
      .prepare('SELECT * FROM pedido_compra_itens WHERE id = ? AND compra_id = ?')
      .get(itemId, compra.id) as CompraItem | undefined;
    if (!item) return res.status(404).json({ erro: 'Item não encontrado' });
    const parsed = z
      .object({
        quantidade: z.number().positive('quantidade deve ser maior que zero').optional(),
        custo_unitario: z.number().min(0).optional(),
        unidade: textoOpcional,
      })
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
    const quantidade = data.quantidade ?? item.quantidade;
    const custo = data.custo_unitario ?? item.custo_unitario;
    try {
      let unidade = item.unidade;
      if (data.unidade !== undefined) {
        unidade = exigirUnidade(data.unidade, unidadeCadastrada(item, compra.empresa_id));
      }
      db.prepare(
        `UPDATE pedido_compra_itens SET
           quantidade = @quantidade, custo_unitario = @custo_unitario, total = @total, unidade = @unidade
         WHERE id = @id`,
      ).run({
        id: itemId,
        quantidade,
        custo_unitario: custo,
        total: arredondarDinheiro(quantidade * custo),
        unidade,
      });
      recalc(compra.id, compra.empresa_id);
      res.json(mapCompra(compra.id, compra.empresa_id, true));
    } catch (err) {
      const status = (err as { status?: number }).status ?? 400;
      return res.status(status).json({ erro: (err as Error).message });
    }
  });

  router.delete('/:id/itens/:itemId', (req, res) => {
    const compra = mapCompra(Number(req.params.id), empresaDaSessao(req));
    if (!compra) return res.status(404).json({ erro: 'Compra não encontrada' });
    if (!podeEditarItens(compra.status)) {
      return res.status(409).json({ erro: 'Itens só podem ser removidos em rascunho' });
    }
    const info = db
      .prepare('DELETE FROM pedido_compra_itens WHERE id = ? AND compra_id = ?')
      .run(Number(req.params.itemId), compra.id);
    if (info.changes === 0) return res.status(404).json({ erro: 'Item não encontrado' });
    recalc(compra.id, compra.empresa_id);
    res.json(mapCompra(compra.id, compra.empresa_id, true));
  });

  router.post('/:id/receber', (req, res) => {
    const compra = mapCompra(Number(req.params.id), empresaDaSessao(req), true);
    if (!compra) return res.status(404).json({ erro: 'Compra não encontrada' });
    if (compra.status !== 'aberta' && compra.status !== 'parcial') {
      return res.status(409).json({
        erro: 'Receba apenas compras abertas ou parciais',
      });
    }
    const parsed = receberSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      return res.status(400).json({
        erro: 'Dados inválidos',
        detalhes: parsed.error.flatten().fieldErrors,
      });
    }
    const itens = compra.itens ?? [];
    const pedidos = parsed.data.itens?.length
      ? parsed.data.itens
      : itens
          .filter((i) => i.quantidade_recebida + 1e-9 < i.quantidade)
          .map((i) => ({
            item_id: i.id,
            quantidade: arredondarDinheiro(i.quantidade - i.quantidade_recebida),
          }));
    if (pedidos.length === 0) {
      return res.status(400).json({ erro: 'Nada a receber nesta compra' });
    }

    try {
      db.transaction(() => {
        receberItens(compra, pedidos, req.usuario?.id ?? null);
      })();
      res.json(mapCompra(compra.id, compra.empresa_id, true));
    } catch (err) {
      const status = (err as { status?: number }).status ?? 400;
      return res.status(status).json({ erro: (err as Error).message });
    }
  });

  router.post('/:id/confirmar', (req, res) => {
    const compra = mapCompra(Number(req.params.id), empresaDaSessao(req), true);
    if (!compra) return res.status(404).json({ erro: 'Compra não encontrada' });
    if (compra.status === 'cancelada') {
      return res.status(409).json({ erro: 'Compra cancelada não pode ser confirmada' });
    }
    if (compra.status === 'recebida') {
      return res.status(409).json({ erro: 'Compra já confirmada' });
    }
    const itens = compra.itens ?? [];
    if (itens.length === 0) {
      return res.status(400).json({ erro: 'Confirme a compra com ao menos um item' });
    }
    const pedidos = itens
      .filter((item) => item.quantidade_recebida + 1e-9 < item.quantidade)
      .map((item) => ({
        item_id: item.id,
        quantidade: arredondarDinheiro(item.quantidade - item.quantidade_recebida),
      }));
    if (pedidos.length === 0) {
      return res.status(409).json({ erro: 'Compra já confirmada' });
    }

    try {
      db.transaction(() => {
        receberItens(compra, pedidos, req.usuario?.id ?? null);
      })();
      res.json(mapCompra(compra.id, compra.empresa_id, true));
    } catch (err) {
      const status = (err as { status?: number }).status ?? 400;
      return res.status(status).json({ erro: (err as Error).message });
    }
  });

  router.delete('/:id', (req, res) => {
    const compra = mapCompra(Number(req.params.id), empresaDaSessao(req), true);
    if (!compra) return res.status(404).json({ erro: 'Compra não encontrada' });
    if (compra.status !== 'rascunho' && compra.status !== 'cancelada') {
      return res.status(409).json({ erro: 'Exclua apenas rascunhos ou compras canceladas' });
    }
    db.prepare('DELETE FROM financeiro_lancamentos WHERE compra_id = ? AND empresa_id = ?').run(
      compra.id,
      compra.empresa_id,
    );
    db.prepare('DELETE FROM pedidos_compra WHERE id = ? AND empresa_id = ?').run(
      compra.id,
      compra.empresa_id,
    );
    res.status(204).send();
  });

  return router;
}
