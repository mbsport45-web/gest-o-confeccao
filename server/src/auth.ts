import { randomBytes, createHash } from 'node:crypto';
import { Router, type RequestHandler } from 'express';
import { hashSync, compareSync } from 'bcryptjs';
import { z } from 'zod';
import type { AppDatabase } from './db.js';
import { isPapel, permissoesDoPapel, type Papel } from './papeis.js';
import {
  avaliarLimite,
  corpoAssinaturaBloqueada,
  garantirAssinatura,
  obterAssinaturaDaEmpresa,
  PLANO_PADRAO,
} from './planos.js';

export const COOKIE_SESSAO = 'gc_sessao';
const SESSAO_MS = 7 * 24 * 60 * 60 * 1000;
const BCRYPT_ROUNDS = process.env.VITEST ? 4 : 10;

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      usuario?: {
        id: number;
        nome: string;
        email: string;
        empresaId: number;
        papel: Papel;
      };
    }
  }
}

const credenciaisSchema = z.object({
  email: z.string().trim().email('e-mail inválido').max(200).transform((v) => v.toLowerCase()),
  senha: z.string().min(8, 'senha deve ter ao menos 8 caracteres').max(72, 'senha muito longa'),
});

const registrarSchema = credenciaisSchema.extend({
  nome: z.string().trim().min(1, 'nome é obrigatório').max(200),
  empresa: z
    .string()
    .trim()
    .max(200)
    .optional()
    .or(z.literal(''))
    .transform((v) => (v ? v : undefined)),
  convite: z
    .string()
    .trim()
    .max(200)
    .optional()
    .or(z.literal(''))
    .transform((v) => (v ? v : undefined)),
});

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

function cookieOpcoes() {
  return {
    httpOnly: true,
    sameSite: 'lax' as const,
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: SESSAO_MS,
  };
}

function mapUsuario(
  db: AppDatabase,
  row: {
    id: number;
    nome: string;
    email: string;
    empresa_id: number;
    empresa_nome: string;
    empresa_status: string;
    papel: string;
  },
) {
  const papel: Papel = isPapel(row.papel) ? row.papel : 'producao';
  return {
    usuario: { id: row.id, nome: row.nome, email: row.email, papel },
    empresa: { id: row.empresa_id, nome: row.empresa_nome, status: row.empresa_status },
    assinatura: obterAssinaturaDaEmpresa(db, row.empresa_id),
    permissoes: permissoesDoPapel(papel),
  };
}

function buscarUsuarioPorId(db: AppDatabase, id: number) {
  return db
    .prepare(
      `SELECT u.id, u.nome, u.email, u.empresa_id, u.papel, e.nome AS empresa_nome, e.status AS empresa_status
         FROM usuarios u JOIN empresas e ON e.id = u.empresa_id
        WHERE u.id = ?`,
    )
    .get(id) as
    | {
        id: number;
        nome: string;
        email: string;
        empresa_id: number;
        papel: string;
        empresa_nome: string;
        empresa_status: string;
      }
    | undefined;
}

function criarSessao(db: AppDatabase, usuarioId: number): string {
  const token = randomBytes(32).toString('base64url');
  const expira = new Date(Date.now() + SESSAO_MS).toISOString().slice(0, 19).replace('T', ' ');
  db.prepare(
    `INSERT INTO sessoes (usuario_id, token_hash, expira_em) VALUES (?, ?, ?)`,
  ).run(usuarioId, hashToken(token), expira);
  return token;
}

export function requireAuth(db: AppDatabase): RequestHandler {
  return (req, res, next) => {
    const token = req.cookies?.[COOKIE_SESSAO];
    if (!token || typeof token !== 'string') {
      return res.status(401).json({ erro: 'Não autenticado' });
    }
    const sessao = db
      .prepare(
        `SELECT s.id, s.usuario_id, u.nome, u.email, u.empresa_id, u.papel, u.status
           FROM sessoes s
           JOIN usuarios u ON u.id = s.usuario_id
          WHERE s.token_hash = ? AND datetime(s.expira_em) > datetime('now')`,
      )
      .get(hashToken(token)) as
      | {
          id: number;
          usuario_id: number;
          nome: string;
          email: string;
          empresa_id: number;
          papel: string;
          status: string;
        }
      | undefined;
    if (!sessao || sessao.status !== 'ativo') {
      return res.status(401).json({ erro: 'Não autenticado' });
    }
    req.usuario = {
      id: sessao.usuario_id,
      nome: sessao.nome,
      email: sessao.email,
      empresaId: sessao.empresa_id,
      papel: isPapel(sessao.papel) ? sessao.papel : 'producao',
    };
    next();
  };
}

function buscarConvitePorToken(db: AppDatabase, token: string) {
  return db
    .prepare(
      `SELECT c.id, c.empresa_id, c.email, c.papel, c.status, c.expira_em, e.nome AS empresa_nome
         FROM convites c
         JOIN empresas e ON e.id = c.empresa_id
        WHERE c.token_hash = ?`,
    )
    .get(hashToken(token)) as
    | {
        id: number;
        empresa_id: number;
        email: string;
        papel: string;
        status: string;
        expira_em: string;
        empresa_nome: string;
      }
    | undefined;
}

function conviteValido(
  convite:
    | {
        id: number;
        empresa_id: number;
        email: string;
        papel: string;
        status: string;
        expira_em: string;
        empresa_nome: string;
      }
    | undefined,
  db: AppDatabase,
) {
  if (!convite) return { ok: false as const, erro: 'Convite não encontrado', status: 404 };
  if (convite.status !== 'pendente') {
    return { ok: false as const, erro: 'Este convite já foi usado ou cancelado', status: 409 };
  }
  if (convite.expira_em < new Date().toISOString().slice(0, 19).replace('T', ' ')) {
    db.prepare(`UPDATE convites SET status = 'expirado' WHERE id = ? AND status = 'pendente'`).run(
      convite.id,
    );
    return { ok: false as const, erro: 'Convite expirado', status: 410 };
  }
  return { ok: true as const, convite };
}

export function createAuthRouter(db: AppDatabase): Router {
  const router = Router();

  router.get('/convite/:token', (req, res) => {
    const token = String(req.params.token ?? '');
    const checagem = conviteValido(buscarConvitePorToken(db, token), db);
    if (!checagem.ok) {
      return res.status(checagem.status).json({ erro: checagem.erro });
    }
    res.json({
      email: checagem.convite.email,
      papel: checagem.convite.papel,
      empresa: { id: checagem.convite.empresa_id, nome: checagem.convite.empresa_nome },
      expira_em: checagem.convite.expira_em,
    });
  });

  router.post('/registrar', (req, res) => {
    const parsed = registrarSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        erro: 'Dados inválidos',
        detalhes: parsed.error.flatten().fieldErrors,
      });
    }
    const data = parsed.data;
    const existente = db.prepare('SELECT id FROM usuarios WHERE email = ?').get(data.email);
    if (existente) {
      return res.status(409).json({ erro: 'E-mail já cadastrado' });
    }
    const conviteInfo = data.convite
      ? conviteValido(buscarConvitePorToken(db, data.convite), db)
      : null;
    if (data.convite && conviteInfo && !conviteInfo.ok) {
      return res.status(conviteInfo.status).json({ erro: conviteInfo.erro });
    }
    if (conviteInfo?.ok && conviteInfo.convite.email !== data.email) {
      return res.status(400).json({ erro: 'Este convite foi enviado para outro e-mail' });
    }
    if (conviteInfo?.ok) {
      const assinaturaEmpresa = obterAssinaturaDaEmpresa(db, conviteInfo.convite.empresa_id);
      if (!assinaturaEmpresa.acesso.operacional) {
        return res.status(403).json(corpoAssinaturaBloqueada(assinaturaEmpresa.status));
      }
      const membros = (
        db
          .prepare('SELECT COUNT(*) AS n FROM usuarios WHERE empresa_id = ?')
          .get(conviteInfo.convite.empresa_id) as { n: number }
      ).n;
      const limite = avaliarLimite(db, conviteInfo.convite.empresa_id, 'usuarios', 1, membros);
      if (!limite.ok) return res.status(409).json(limite.corpo);
    }

    const totalUsuarios = (db.prepare('SELECT COUNT(*) AS n FROM usuarios').get() as { n: number }).n;
    const senhaHash = hashSync(data.senha, BCRYPT_ROUNDS);
    let info: { lastInsertRowid: number | bigint };
    try {
      info = db.transaction(() => {
        let empresaId = 1;
        let papel: Papel = 'proprietario';
        if (conviteInfo?.ok) {
          empresaId = conviteInfo.convite.empresa_id;
          papel = isPapel(conviteInfo.convite.papel) ? conviteInfo.convite.papel : 'producao';
        } else if (totalUsuarios === 0) {
          if (data.empresa) {
            db.prepare(`UPDATE empresas SET nome = ? WHERE id = 1`).run(data.empresa);
          }
        } else {
          const nova = db
            .prepare(`INSERT INTO empresas (nome, status) VALUES (?, 'ativa')`)
            .run(data.empresa ?? 'Minha empresa');
          empresaId = Number(nova.lastInsertRowid);
        }
        const criado = db
          .prepare(
            `INSERT INTO usuarios (empresa_id, nome, email, senha_hash, papel)
             VALUES (@empresa_id, @nome, @email, @senha_hash, @papel)`,
          )
          .run({
            empresa_id: empresaId,
            nome: data.nome,
            email: data.email,
            senha_hash: senhaHash,
            papel,
          });
        garantirAssinatura(
          db,
          empresaId,
          PLANO_PADRAO,
          papel === 'proprietario'
            ? { id: Number(criado.lastInsertRowid), nome: data.nome }
            : null,
        );
        if (conviteInfo?.ok) {
          db.prepare(
            `UPDATE convites SET status = 'aceito', aceito_em = datetime('now') WHERE id = ?`,
          ).run(conviteInfo.convite.id);
        }
        return criado;
      })();
    } catch (err) {
      if (err instanceof Error && /UNIQUE/i.test(err.message)) {
        return res.status(409).json({ erro: 'E-mail já cadastrado' });
      }
      throw err;
    }
    const id = Number(info.lastInsertRowid);
    const token = criarSessao(db, id);
    const usuario = buscarUsuarioPorId(db, id);
    if (!usuario) return res.status(500).json({ erro: 'Falha ao criar usuário' });
    res.cookie(COOKIE_SESSAO, token, cookieOpcoes());
    res.status(201).json(mapUsuario(db, usuario));
  });

  router.post('/login', (req, res) => {
    const parsed = credenciaisSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        erro: 'Dados inválidos',
        detalhes: parsed.error.flatten().fieldErrors,
      });
    }
    const data = parsed.data;
    const usuario = db
      .prepare(
        `SELECT id, senha_hash, status FROM usuarios WHERE email = ?`,
      )
      .get(data.email) as { id: number; senha_hash: string; status: string } | undefined;
    if (!usuario || usuario.status !== 'ativo' || !compareSync(data.senha, usuario.senha_hash)) {
      return res.status(401).json({ erro: 'E-mail ou senha inválidos' });
    }
    const token = criarSessao(db, usuario.id);
    const row = buscarUsuarioPorId(db, usuario.id);
    if (!row) return res.status(500).json({ erro: 'Falha ao autenticar' });
    res.cookie(COOKIE_SESSAO, token, cookieOpcoes());
    res.json(mapUsuario(db, row));
  });

  router.post('/logout', (req, res) => {
    const token = req.cookies?.[COOKIE_SESSAO];
    if (token && typeof token === 'string') {
      db.prepare('DELETE FROM sessoes WHERE token_hash = ?').run(hashToken(token));
    }
    res.clearCookie(COOKIE_SESSAO, { path: '/' });
    res.status(204).send();
  });

  router.get('/me', requireAuth(db), handleMe(db));

  return router;
}

export function handleMe(db: AppDatabase): RequestHandler {
  return (req, res) => {
    const row = buscarUsuarioPorId(db, req.usuario!.id);
    if (!row) return res.status(401).json({ erro: 'Não autenticado' });
    res.json(mapUsuario(db, row));
  };
}
