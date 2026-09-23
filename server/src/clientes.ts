import { Router } from 'express';
import { z } from 'zod';
import type { AppDatabase } from './db.js';
import { apenasDigitos, cpfCnpjValido } from './cpfCnpj.js';
import { exigirLimite } from './planos.js';
import { aplicarEmpresa, empresaDaSessao } from './tenant.js';

export const STATUS_CLIENTE = ['ativo', 'inativo'] as const;
export const UFS_BRASIL = [
  'AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA',
  'MT', 'MS', 'MG', 'PA', 'PB', 'PR', 'PE', 'PI', 'RJ', 'RN',
  'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO',
] as const;

export interface Cliente {
  id: number;
  nome: string;
  cpf_cnpj: string | null;
  contato: string | null;
  telefone: string | null;
  whatsapp: string | null;
  email: string | null;
  endereco: string | null;
  cidade: string | null;
  estado: string | null;
  cep: string | null;
  condicao_pagamento: string | null;
  limite_credito: number;
  status: (typeof STATUS_CLIENTE)[number];
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

const clienteBaseSchema = z.object({
  nome: z.string().trim().min(1, 'nome é obrigatório').max(200),
  cpf_cnpj: z
    .string()
    .trim()
    .optional()
    .or(z.literal(''))
    .transform((v) => (v ? apenasDigitos(v) : undefined))
    .refine((v) => v === undefined || cpfCnpjValido(v), 'CPF/CNPJ inválido'),
  contato: textoOpcional,
  telefone: z
    .string()
    .trim()
    .optional()
    .or(z.literal(''))
    .transform((v) => (v ? apenasDigitos(v) : undefined))
    .refine(
      (v) => v === undefined || (v.length >= 10 && v.length <= 15),
      'telefone deve ter entre 10 e 15 dígitos',
    ),
  whatsapp: z
    .string()
    .trim()
    .optional()
    .or(z.literal(''))
    .transform((v) => (v ? apenasDigitos(v) : undefined))
    .refine(
      (v) => v === undefined || (v.length >= 10 && v.length <= 15),
      'whatsapp deve ter entre 10 e 15 dígitos',
    ),
  email: z
    .string()
    .trim()
    .optional()
    .or(z.literal(''))
    .transform((v) => (v ? v : undefined))
    .refine((v) => v === undefined || z.string().email().safeParse(v).success, 'email inválido'),
  endereco: z.string().trim().max(300).optional().or(z.literal('')).transform((v) => (v ? v : undefined)),
  cidade: textoOpcional,
  estado: z
    .string()
    .trim()
    .optional()
    .or(z.literal(''))
    .transform((v) => (v ? v.toUpperCase() : undefined))
    .refine((v) => v === undefined || (UFS_BRASIL as readonly string[]).includes(v), 'estado inválido'),
  cep: z
    .string()
    .trim()
    .optional()
    .or(z.literal(''))
    .transform((v) => (v ? apenasDigitos(v) : undefined))
    .refine((v) => v === undefined || v.length === 8, 'CEP deve ter 8 dígitos'),
  condicao_pagamento: z
    .string()
    .trim()
    .max(120)
    .optional()
    .or(z.literal(''))
    .transform((v) => (v ? v : undefined)),
  limite_credito: z.number().min(0, 'limite_credito não pode ser negativo').optional(),
  status: z.enum(STATUS_CLIENTE).optional(),
  observacoes: z
    .string()
    .trim()
    .max(2000)
    .optional()
    .or(z.literal(''))
    .transform((v) => (v ? v : undefined)),
});

const criarClienteSchema = clienteBaseSchema;
const atualizarClienteSchema = clienteBaseSchema.partial().refine(
  (body) => Object.keys(body).length > 0,
  { message: 'Informe ao menos um campo para atualizar' },
);
const atualizarStatusSchema = z.object({
  status: z.enum(STATUS_CLIENTE),
});

function nulo(valor: string | undefined): string | null {
  return valor === undefined ? null : valor;
}

function camposCliente(
  data: Partial<z.infer<typeof clienteBaseSchema>>,
  parciais = false,
) {
  const row: Record<string, string | number | null> = {};
  if (!parciais || data.nome !== undefined) row.nome = data.nome ?? '';
  if (!parciais || data.cpf_cnpj !== undefined) row.cpf_cnpj = nulo(data.cpf_cnpj);
  if (!parciais || data.contato !== undefined) row.contato = nulo(data.contato);
  if (!parciais || data.telefone !== undefined) row.telefone = nulo(data.telefone);
  if (!parciais || data.whatsapp !== undefined) row.whatsapp = nulo(data.whatsapp);
  if (!parciais || data.email !== undefined) row.email = nulo(data.email);
  if (!parciais || data.endereco !== undefined) row.endereco = nulo(data.endereco);
  if (!parciais || data.cidade !== undefined) row.cidade = nulo(data.cidade);
  if (!parciais || data.estado !== undefined) row.estado = nulo(data.estado);
  if (!parciais || data.cep !== undefined) row.cep = nulo(data.cep);
  if (!parciais || data.condicao_pagamento !== undefined) {
    row.condicao_pagamento = nulo(data.condicao_pagamento);
  }
  if (!parciais || data.limite_credito !== undefined) {
    row.limite_credito = data.limite_credito ?? 0;
  }
  if (!parciais || data.status !== undefined) row.status = data.status ?? 'ativo';
  if (!parciais || data.observacoes !== undefined) row.observacoes = nulo(data.observacoes);
  return row;
}

function erroDuplicidade(err: unknown): boolean {
  return err instanceof Error && /UNIQUE/i.test(err.message);
}

export function createClientesRouter(db: AppDatabase): Router {
  const router = Router();

  const getStmt = db.prepare('SELECT * FROM clientes WHERE id = ? AND empresa_id = ?');
  const countVinculosStmt = db.prepare(
    `SELECT
        (SELECT COUNT(*) FROM ordens_producao
          WHERE cliente_id = ? OR lower(trim(cliente)) = lower(trim(?)))
      + (SELECT COUNT(*) FROM pedidos WHERE cliente_id = ?) AS n`,
  );

  router.get('/', (req, res) => {
    const pagina = Math.max(1, Number(req.query.pagina ?? req.query.page ?? 1) || 1);
    const porPagina = Math.min(
      100,
      Math.max(1, Number(req.query.por_pagina ?? req.query.pageSize ?? 10) || 10),
    );
    const q = String(req.query.q ?? '').trim();
    const status = String(req.query.status ?? '').trim();
    const estado = String(req.query.estado ?? '').trim().toUpperCase();
    const cidade = String(req.query.cidade ?? '').trim();

    const where: string[] = [];
    const params: Record<string, string | number> = {};
    aplicarEmpresa(where, params, req);

    if (q) {
      where.push(
        `(nome LIKE @q OR ifnull(cpf_cnpj,'') LIKE @q OR ifnull(contato,'') LIKE @q
          OR ifnull(email,'') LIKE @q OR ifnull(telefone,'') LIKE @q
          OR ifnull(whatsapp,'') LIKE @q OR ifnull(cidade,'') LIKE @q)`,
      );
      params.q = `%${apenasDigitos(q) === q && q.length >= 3 ? apenasDigitos(q) : q}%`;
      if (apenasDigitos(q).length >= 3 && apenasDigitos(q) !== q) {
        where[where.length - 1] = `(nome LIKE @q OR ifnull(cpf_cnpj,'') LIKE @qDigits
          OR ifnull(contato,'') LIKE @q OR ifnull(email,'') LIKE @q
          OR ifnull(telefone,'') LIKE @qDigits OR ifnull(whatsapp,'') LIKE @qDigits
          OR ifnull(cidade,'') LIKE @q)`;
        params.qDigits = `%${apenasDigitos(q)}%`;
      }
    }
    if (status && (STATUS_CLIENTE as readonly string[]).includes(status)) {
      where.push('status = @status');
      params.status = status;
    }
    if (estado && (UFS_BRASIL as readonly string[]).includes(estado)) {
      where.push('estado = @estado');
      params.estado = estado;
    }
    if (cidade) {
      where.push('cidade LIKE @cidade');
      params.cidade = `%${cidade}%`;
    }

    const filtro = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const total = (
      db.prepare(`SELECT COUNT(*) AS n FROM clientes ${filtro}`).get(params) as { n: number }
    ).n;
    const data = db
      .prepare(
        `SELECT * FROM clientes ${filtro}
         ORDER BY datetime(atualizado_em) DESC, id DESC
         LIMIT @limit OFFSET @offset`,
      )
      .all({ ...params, limit: porPagina, offset: (pagina - 1) * porPagina }) as Cliente[];

    res.json({
      data,
      pagina,
      por_pagina: porPagina,
      total,
      total_paginas: Math.max(1, Math.ceil(total / porPagina)),
    });
  });

  router.get('/:id', (req, res) => {
    const cliente = getStmt.get(Number(req.params.id), empresaDaSessao(req)) as Cliente | undefined;
    if (!cliente) {
      return res.status(404).json({ erro: 'Cliente não encontrado' });
    }
    res.json(cliente);
  });

  router.post('/', exigirLimite(db, 'clientes'), (req, res) => {
    const parsed = criarClienteSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        erro: 'Dados inválidos',
        detalhes: parsed.error.flatten().fieldErrors,
      });
    }

    const row = camposCliente(parsed.data);
    const empresaId = empresaDaSessao(req);
    try {
      const info = db
        .prepare(
          `INSERT INTO clientes (
             empresa_id, nome, cpf_cnpj, contato, telefone, whatsapp, email, endereco,
             cidade, estado, cep, condicao_pagamento, limite_credito, status, observacoes
           ) VALUES (
             @empresa_id, @nome, @cpf_cnpj, @contato, @telefone, @whatsapp, @email, @endereco,
             @cidade, @estado, @cep, @condicao_pagamento, @limite_credito, @status, @observacoes
           )`,
        )
        .run({ ...row, empresa_id: empresaId });
      res.status(201).json(getStmt.get(info.lastInsertRowid, empresaId));
    } catch (err) {
      if (erroDuplicidade(err)) {
        return res.status(409).json({ erro: 'CPF/CNPJ já cadastrado' });
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
        `UPDATE clientes SET status = @status, atualizado_em = datetime('now')
          WHERE id = @id AND empresa_id = @empresa_id`,
      )
      .run({ id, empresa_id: empresaId, status: parsed.data.status });
    if (info.changes === 0) {
      return res.status(404).json({ erro: 'Cliente não encontrado' });
    }
    res.json(getStmt.get(id, empresaId));
  });

  router.patch('/:id', (req, res) => {
    const parsed = atualizarClienteSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        erro: 'Dados inválidos',
        detalhes: parsed.error.flatten().fieldErrors,
      });
    }

    const id = Number(req.params.id);
    const empresaId = empresaDaSessao(req);
    const atual = getStmt.get(id, empresaId) as Cliente | undefined;
    if (!atual) {
      return res.status(404).json({ erro: 'Cliente não encontrado' });
    }

    const row = camposCliente(parsed.data, true);
    const sets = Object.keys(row)
      .map((key) => `${key} = @${key}`)
      .join(', ');
    try {
      db.prepare(
        `UPDATE clientes SET ${sets}, atualizado_em = datetime('now')
          WHERE id = @id AND empresa_id = @empresa_id`,
      ).run({ ...row, id, empresa_id: empresaId });
      res.json(getStmt.get(id, empresaId));
    } catch (err) {
      if (erroDuplicidade(err)) {
        return res.status(409).json({ erro: 'CPF/CNPJ já cadastrado' });
      }
      throw err;
    }
  });

  router.delete('/:id', (req, res) => {
    const id = Number(req.params.id);
    const empresaId = empresaDaSessao(req);
    const cliente = getStmt.get(id, empresaId) as Cliente | undefined;
    if (!cliente) {
      return res.status(404).json({ erro: 'Cliente não encontrado' });
    }

    const vinculos = countVinculosStmt.get(id, cliente.nome, id) as { n: number };
    if (vinculos.n > 0) {
      return res.status(409).json({
        erro: 'Cliente possui ordens de produção ou pedidos vinculados e não pode ser excluído',
        vinculos: vinculos.n,
      });
    }

    db.prepare('DELETE FROM clientes WHERE id = ? AND empresa_id = ?').run(id, empresaId);
    res.status(204).send();
  });

  return router;
}
