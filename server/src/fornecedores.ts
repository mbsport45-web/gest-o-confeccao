import { Router } from 'express';
import { z } from 'zod';
import type { AppDatabase } from './db.js';
import { UFS_BRASIL } from './clientes.js';
import { apenasDigitos, cpfCnpjValido } from './cpfCnpj.js';
import { aplicarEmpresa, empresaDaSessao } from './tenant.js';

export const STATUS_FORNECEDOR = ['ativo', 'inativo'] as const;

export const TIPOS_PESSOA = ['juridica', 'fisica'] as const;

export interface Fornecedor {
  id: number;
  codigo: string | null;
  nome: string;
  tipo_pessoa: (typeof TIPOS_PESSOA)[number] | null;
  nome_fantasia: string | null;
  cpf_cnpj: string | null;
  inscricao_estadual: string | null;
  contato: string | null;
  telefone: string | null;
  whatsapp: string | null;
  email: string | null;
  endereco: string | null;
  numero: string | null;
  complemento: string | null;
  bairro: string | null;
  cidade: string | null;
  estado: string | null;
  cep: string | null;
  condicao_pagamento: string | null;
  status: (typeof STATUS_FORNECEDOR)[number];
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

function telefoneCampo(mensagem: string) {
  return z
    .string()
    .trim()
    .optional()
    .or(z.literal(''))
    .transform((v) => (v ? apenasDigitos(v) : undefined))
    .refine((v) => v === undefined || (v.length >= 10 && v.length <= 15), mensagem);
}

const fornecedorBaseSchema = z.object({
  codigo: textoOpcional,
  tipo_pessoa: z
    .string()
    .trim()
    .toLowerCase()
    .optional()
    .or(z.literal(''))
    .transform((v) => (v ? v : undefined))
    .refine(
      (v) => v === undefined || (TIPOS_PESSOA as readonly string[]).includes(v),
      'tipo de pessoa inválido',
    ),
  nome: z.string().trim().min(1, 'nome é obrigatório').max(200),
  nome_fantasia: textoOpcional,
  cpf_cnpj: z
    .string()
    .trim()
    .optional()
    .or(z.literal(''))
    .transform((v) => (v ? apenasDigitos(v) : undefined))
    .refine((v) => v === undefined || cpfCnpjValido(v), 'CPF/CNPJ inválido'),
  inscricao_estadual: z
    .string()
    .trim()
    .max(20)
    .optional()
    .or(z.literal(''))
    .transform((v) => (v ? v : undefined)),
  contato: textoOpcional,
  telefone: telefoneCampo('telefone deve ter entre 10 e 15 dígitos'),
  whatsapp: telefoneCampo('WhatsApp deve ter entre 10 e 15 dígitos'),
  email: z
    .string()
    .trim()
    .optional()
    .or(z.literal(''))
    .transform((v) => (v ? v : undefined))
    .refine((v) => v === undefined || z.string().email().safeParse(v).success, 'email inválido'),
  endereco: z
    .string()
    .trim()
    .max(300)
    .optional()
    .or(z.literal(''))
    .transform((v) => (v ? v : undefined)),
  numero: z
    .string()
    .trim()
    .max(30)
    .optional()
    .or(z.literal(''))
    .transform((v) => (v ? v : undefined)),
  complemento: z
    .string()
    .trim()
    .max(120)
    .optional()
    .or(z.literal(''))
    .transform((v) => (v ? v : undefined)),
  bairro: textoOpcional,
  cidade: textoOpcional,
  estado: z
    .string()
    .trim()
    .toUpperCase()
    .optional()
    .or(z.literal(''))
    .transform((v) => (v ? v : undefined))
    .refine((v) => v === undefined || (UFS_BRASIL as readonly string[]).includes(v), 'UF inválida'),
  cep: z
    .string()
    .trim()
    .optional()
    .or(z.literal(''))
    .transform((v) => (v ? apenasDigitos(v) : undefined))
    .refine((v) => v === undefined || v.length === 8, 'CEP deve ter 8 dígitos'),
  condicao_pagamento: textoOpcional,
  status: z.enum(STATUS_FORNECEDOR).optional(),
  observacoes: z
    .string()
    .trim()
    .max(2000)
    .optional()
    .or(z.literal(''))
    .transform((v) => (v ? v : undefined)),
});

function conferirDocumentoFiscal(
  data: { tipo_pessoa?: string; cpf_cnpj?: string },
  ctx: z.RefinementCtx,
) {
  if (!data.tipo_pessoa || !data.cpf_cnpj) return;
  if (data.tipo_pessoa === 'fisica' && data.cpf_cnpj.length !== 11) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['cpf_cnpj'],
      message: 'Informe um CPF para pessoa física',
    });
  }
  if (data.tipo_pessoa === 'juridica' && data.cpf_cnpj.length !== 14) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['cpf_cnpj'],
      message: 'Informe um CNPJ para pessoa jurídica',
    });
  }
}

const fornecedorSchema = fornecedorBaseSchema.superRefine(conferirDocumentoFiscal);

const atualizarSchema = fornecedorBaseSchema
  .partial()
  .superRefine(conferirDocumentoFiscal)
  .refine((body) => Object.keys(body).length > 0, {
    message: 'Informe ao menos um campo para atualizar',
  });

function nulo(valor: string | undefined): string | null {
  return valor === undefined ? null : valor;
}

function erroDuplicidade(err: unknown): boolean {
  return err instanceof Error && /UNIQUE/i.test(err.message);
}

function fornecedorComMesmoDocumento(
  db: AppDatabase,
  empresaId: number,
  cpfCnpj: string | null,
) {
  if (!cpfCnpj) return null;
  return (
    db
      .prepare('SELECT * FROM fornecedores WHERE empresa_id = ? AND cpf_cnpj = ?')
      .get(empresaId, cpfCnpj) ?? null
  );
}

function responderFornecedorDuplicado(
  res: { status: (code: number) => { json: (body: unknown) => unknown } },
  fornecedor: unknown,
) {
  return res.status(409).json({
    erro: 'Fornecedor já cadastrado (código ou CPF/CNPJ)',
    ...(fornecedor ? { fornecedor } : {}),
  });
}

function campos(data: Partial<z.infer<typeof fornecedorBaseSchema>>, parciais = false) {
  const row: Record<string, string | null> = {};
  if (!parciais || data.codigo !== undefined) row.codigo = nulo(data.codigo);
  if (!parciais || data.tipo_pessoa !== undefined) row.tipo_pessoa = nulo(data.tipo_pessoa);
  if (!parciais || data.nome !== undefined) row.nome = data.nome ?? '';
  if (!parciais || data.nome_fantasia !== undefined) row.nome_fantasia = nulo(data.nome_fantasia);
  if (!parciais || data.cpf_cnpj !== undefined) row.cpf_cnpj = nulo(data.cpf_cnpj);
  if (!parciais || data.inscricao_estadual !== undefined) {
    row.inscricao_estadual = nulo(data.inscricao_estadual);
  }
  if (!parciais || data.contato !== undefined) row.contato = nulo(data.contato);
  if (!parciais || data.telefone !== undefined) row.telefone = nulo(data.telefone);
  if (!parciais || data.whatsapp !== undefined) row.whatsapp = nulo(data.whatsapp);
  if (!parciais || data.email !== undefined) row.email = nulo(data.email);
  if (!parciais || data.endereco !== undefined) row.endereco = nulo(data.endereco);
  if (!parciais || data.numero !== undefined) row.numero = nulo(data.numero);
  if (!parciais || data.complemento !== undefined) row.complemento = nulo(data.complemento);
  if (!parciais || data.bairro !== undefined) row.bairro = nulo(data.bairro);
  if (!parciais || data.cidade !== undefined) row.cidade = nulo(data.cidade);
  if (!parciais || data.estado !== undefined) row.estado = nulo(data.estado);
  if (!parciais || data.cep !== undefined) row.cep = nulo(data.cep);
  if (!parciais || data.condicao_pagamento !== undefined) {
    row.condicao_pagamento = nulo(data.condicao_pagamento);
  }
  if (!parciais || data.status !== undefined) row.status = data.status ?? 'ativo';
  if (!parciais || data.observacoes !== undefined) row.observacoes = nulo(data.observacoes);
  return row;
}

export function createFornecedoresRouter(db: AppDatabase): Router {
  const router = Router();
  const getStmt = db.prepare('SELECT * FROM fornecedores WHERE id = ? AND empresa_id = ?');

  router.get('/', (req, res) => {
    const pagina = Math.max(1, Number(req.query.pagina ?? 1) || 1);
    const porPagina = Math.min(
      100,
      Math.max(1, Number(req.query.por_pagina ?? 10) || 10),
    );
    const q = String(req.query.q ?? '').trim();
    const status = String(req.query.status ?? '').trim();

    const where: string[] = [];
    const params: Record<string, string | number> = {};
    aplicarEmpresa(where, params, req);
    if (q) {
      where.push(
        `(nome LIKE @q OR ifnull(nome_fantasia,'') LIKE @q OR ifnull(codigo,'') LIKE @q
          OR ifnull(cpf_cnpj,'') LIKE @q OR ifnull(contato,'') LIKE @q OR ifnull(cidade,'') LIKE @q)`,
      );
      params.q = `%${q}%`;
    }
    if ((STATUS_FORNECEDOR as readonly string[]).includes(status)) {
      where.push('status = @status');
      params.status = status;
    }
    const filtro = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const total = (
      db.prepare(`SELECT COUNT(*) AS n FROM fornecedores ${filtro}`).get(params) as {
        n: number;
      }
    ).n;
    const data = db
      .prepare(
        `SELECT * FROM fornecedores ${filtro}
         ORDER BY nome COLLATE NOCASE ASC, id DESC
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

  router.get('/:id', (req, res) => {
    const row = getStmt.get(Number(req.params.id), empresaDaSessao(req));
    if (!row) return res.status(404).json({ erro: 'Fornecedor não encontrado' });
    res.json(row);
  });

  router.post('/', (req, res) => {
    const parsed = fornecedorSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        erro: 'Dados inválidos',
        detalhes: parsed.error.flatten().fieldErrors,
      });
    }
    const row = campos(parsed.data);
    const empresaId = empresaDaSessao(req);
    const duplicado = fornecedorComMesmoDocumento(db, empresaId, row.cpf_cnpj);
    if (duplicado) return responderFornecedorDuplicado(res, duplicado);
    try {
      const info = db
        .prepare(
          `INSERT INTO fornecedores (
             empresa_id, codigo, tipo_pessoa, nome, nome_fantasia, cpf_cnpj, inscricao_estadual,
             contato, telefone, whatsapp, email, endereco, numero, complemento, bairro,
             cidade, estado, cep, condicao_pagamento, status, observacoes
           ) VALUES (
             @empresa_id, @codigo, @tipo_pessoa, @nome, @nome_fantasia, @cpf_cnpj, @inscricao_estadual,
             @contato, @telefone, @whatsapp, @email, @endereco, @numero, @complemento, @bairro,
             @cidade, @estado, @cep, @condicao_pagamento, @status, @observacoes
           )`,
        )
        .run({ ...row, empresa_id: empresaId });
      const id = Number(info.lastInsertRowid);
      if (!row.codigo) {
        db.prepare(
          `UPDATE fornecedores SET codigo = @codigo WHERE id = @id AND empresa_id = @empresa_id`,
        ).run({
          id,
          empresa_id: empresaId,
          codigo: `FOR-${String(id).padStart(4, '0')}`,
        });
      }
      res.status(201).json(getStmt.get(id, empresaId));
    } catch (err) {
      if (erroDuplicidade(err)) {
        return responderFornecedorDuplicado(
          res,
          fornecedorComMesmoDocumento(db, empresaId, row.cpf_cnpj),
        );
      }
      throw err;
    }
  });

  router.patch('/:id', (req, res) => {
    const id = Number(req.params.id);
    const empresaId = empresaDaSessao(req);
    if (!getStmt.get(id, empresaId)) return res.status(404).json({ erro: 'Fornecedor não encontrado' });
    const parsed = atualizarSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        erro: 'Dados inválidos',
        detalhes: parsed.error.flatten().fieldErrors,
        form: parsed.error.flatten().formErrors,
      });
    }
    const row = campos(parsed.data, true);
    const sets = Object.keys(row)
      .map((key) => `${key} = @${key}`)
      .join(', ');
    try {
      db.prepare(
        `UPDATE fornecedores SET ${sets}, atualizado_em = datetime('now')
          WHERE id = @id AND empresa_id = @empresa_id`,
      ).run({ ...row, id, empresa_id: empresaId });
      res.json(getStmt.get(id, empresaId));
    } catch (err) {
      if (erroDuplicidade(err)) {
        return responderFornecedorDuplicado(
          res,
          fornecedorComMesmoDocumento(db, empresaId, row.cpf_cnpj),
        );
      }
      throw err;
    }
  });

  router.delete('/:id', (req, res) => {
    const id = Number(req.params.id);
    const empresaId = empresaDaSessao(req);
    if (!getStmt.get(id, empresaId)) return res.status(404).json({ erro: 'Fornecedor não encontrado' });
    const compras = (
      db.prepare('SELECT COUNT(*) AS n FROM pedidos_compra WHERE fornecedor_id = ?').get(id) as {
        n: number;
      }
    ).n;
    if (compras > 0) {
      return res.status(409).json({
        erro: 'Fornecedor possui compras e não pode ser excluído',
        vinculos: compras,
      });
    }
    db.prepare('DELETE FROM fornecedores WHERE id = ? AND empresa_id = ?').run(id, empresaId);
    res.status(204).send();
  });

  return router;
}
