import { randomBytes } from 'node:crypto';
import { Router } from 'express';
import { z } from 'zod';
import { hashToken } from './auth.js';
import type { AppDatabase } from './db.js';
import { PAPEIS_CONVITE, requireGerenciarEquipe } from './papeis.js';
import { empresaDaSessao } from './tenant.js';

const CONVITE_MS = 7 * 24 * 60 * 60 * 1000;

const conviteSchema = z.object({
  email: z.string().trim().email('e-mail inválido').max(200).transform((v) => v.toLowerCase()),
  papel: z.enum(PAPEIS_CONVITE),
});

const atualizarMembroSchema = z
  .object({
    papel: z.enum(PAPEIS_CONVITE).optional(),
    status: z.enum(['ativo', 'inativo']).optional(),
  })
  .refine((body) => Object.keys(body).length > 0, {
    message: 'Informe ao menos um campo para atualizar',
  });

function isoSqlite(msAfrente = 0) {
  return new Date(Date.now() + msAfrente).toISOString().slice(0, 19).replace('T', ' ');
}

export function createMembrosRouter(db: AppDatabase): Router {
  const router = Router();
  router.use(requireGerenciarEquipe());

  const getMembro = db.prepare(
    `SELECT id, nome, email, papel, status, criado_em, atualizado_em
       FROM usuarios
      WHERE id = ? AND empresa_id = ?`,
  );

  router.get('/', (req, res) => {
    const empresaId = empresaDaSessao(req);
    const data = db
      .prepare(
        `SELECT id, nome, email, papel, status, criado_em, atualizado_em
           FROM usuarios
          WHERE empresa_id = ?
          ORDER BY CASE papel
            WHEN 'proprietario' THEN 0
            WHEN 'administrador' THEN 1
            WHEN 'financeiro' THEN 2
            WHEN 'vendas' THEN 3
            WHEN 'estoque' THEN 4
            ELSE 5
          END, nome COLLATE NOCASE`,
      )
      .all(empresaId);
    res.json({ data, total: data.length });
  });

  router.get('/:id', (req, res) => {
    const membro = getMembro.get(Number(req.params.id), empresaDaSessao(req));
    if (!membro) return res.status(404).json({ erro: 'Membro não encontrado' });
    res.json(membro);
  });

  router.patch('/:id', (req, res) => {
    const parsed = atualizarMembroSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        erro: 'Dados inválidos',
        detalhes: parsed.error.flatten().fieldErrors,
      });
    }
    const empresaId = empresaDaSessao(req);
    const id = Number(req.params.id);
    const atual = getMembro.get(id, empresaId) as
      | { id: number; papel: string; status: string }
      | undefined;
    if (!atual) return res.status(404).json({ erro: 'Membro não encontrado' });

    if (atual.papel === 'proprietario' && req.usuario?.papel !== 'proprietario') {
      return res.status(403).json({
        erro: 'Somente o proprietário pode alterar o proprietário da empresa',
      });
    }
    if (atual.papel === 'proprietario' && (parsed.data.papel || parsed.data.status === 'inativo')) {
      return res.status(409).json({
        erro: 'O proprietário da empresa não pode ser alterado ou inativado',
      });
    }

    const papel = parsed.data.papel ?? atual.papel;
    const status = parsed.data.status ?? atual.status;
    db.prepare(
      `UPDATE usuarios SET papel = @papel, status = @status, atualizado_em = datetime('now')
        WHERE id = @id AND empresa_id = @empresa_id`,
    ).run({ id, empresa_id: empresaId, papel, status });
    if (status === 'inativo' && atual.status === 'ativo') {
      db.prepare('DELETE FROM sessoes WHERE usuario_id = ?').run(id);
    }
    res.json(getMembro.get(id, empresaId));
  });

  return router;
}

export function createConvitesRouter(db: AppDatabase): Router {
  const router = Router();
  router.use(requireGerenciarEquipe());

  const getConvite = db.prepare(
    `SELECT id, empresa_id, email, papel, status, expira_em, criado_em, aceito_em
       FROM convites
      WHERE id = ? AND empresa_id = ?`,
  );

  router.get('/', (req, res) => {
    const empresaId = empresaDaSessao(req);
    const status = String(req.query.status ?? 'pendente').trim();
    const where = ['empresa_id = ?'];
    const params: Array<string | number> = [empresaId];
    if (status && status !== 'todos') {
      where.push('status = ?');
      params.push(status);
    }
    const data = db
      .prepare(
        `SELECT id, email, papel, status, expira_em, criado_em, aceito_em
           FROM convites
          WHERE ${where.join(' AND ')}
          ORDER BY datetime(criado_em) DESC, id DESC`,
      )
      .all(...params);
    res.json({ data, total: data.length });
  });

  router.post('/', (req, res) => {
    const parsed = conviteSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        erro: 'Dados inválidos',
        detalhes: parsed.error.flatten().fieldErrors,
      });
    }
    const empresaId = empresaDaSessao(req);
    const { email, papel } = parsed.data;
    const membro = db
      .prepare('SELECT id FROM usuarios WHERE email = ?')
      .get(email) as { id: number } | undefined;
    if (membro) {
      return res.status(409).json({ erro: 'Este e-mail já possui uma conta' });
    }
    const pendente = db
      .prepare(
        `SELECT id FROM convites WHERE empresa_id = ? AND email = ? AND status = 'pendente'`,
      )
      .get(empresaId, email);
    if (pendente) {
      return res.status(409).json({ erro: 'Já existe um convite pendente para este e-mail' });
    }

    const token = randomBytes(32).toString('base64url');
    const expira = isoSqlite(CONVITE_MS);
    try {
      const info = db
        .prepare(
          `INSERT INTO convites (empresa_id, email, papel, token_hash, status, convidado_por, expira_em)
           VALUES (@empresa_id, @email, @papel, @token_hash, 'pendente', @convidado_por, @expira_em)`,
        )
        .run({
          empresa_id: empresaId,
          email,
          papel,
          token_hash: hashToken(token),
          convidado_por: req.usuario!.id,
          expira_em: expira,
        });
      const id = Number(info.lastInsertRowid);
      const row = getConvite.get(id, empresaId) as Record<string, unknown>;
      res.status(201).json({ ...row, token, caminho: `/?convite=${token}` });
    } catch (err) {
      if (err instanceof Error && /UNIQUE/i.test(err.message)) {
        return res.status(409).json({ erro: 'Já existe um convite pendente para este e-mail' });
      }
      throw err;
    }
  });

  router.delete('/:id', (req, res) => {
    const empresaId = empresaDaSessao(req);
    const atual = getConvite.get(Number(req.params.id), empresaId) as
      | { id: number; status: string }
      | undefined;
    if (!atual) return res.status(404).json({ erro: 'Convite não encontrado' });
    if (atual.status !== 'pendente') {
      return res.status(409).json({ erro: 'Só é possível cancelar convites pendentes' });
    }
    db.prepare(
      `UPDATE convites SET status = 'cancelado' WHERE id = ? AND empresa_id = ?`,
    ).run(atual.id, empresaId);
    res.status(204).send();
  });

  return router;
}
