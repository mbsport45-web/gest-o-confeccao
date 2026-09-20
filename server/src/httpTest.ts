import request from 'supertest';
import type { Express } from 'express';
import { hashSync } from 'bcryptjs';
import type { AppDatabase } from './db.js';

export type TestApi = ReturnType<typeof request.agent>;

export const USUARIO_TESTE = {
  nome: 'Operador Teste',
  email: 'teste@gestao.local',
  senha: 'senha-teste-1',
};

export async function autenticar(app: Express): Promise<TestApi> {
  const api = request.agent(app);
  const res = await api.post('/api/auth/registrar').send(USUARIO_TESTE);
  if (res.status !== 201) {
    throw new Error(`falha ao autenticar teste: ${res.status} ${JSON.stringify(res.body)}`);
  }
  return api;
}

/** Cria uma empresa extra via SQL e autentica um usuário nela. O registro público continua na Empresa 1. */
export async function autenticarNovaEmpresa(
  app: Express,
  db: AppDatabase,
  opts?: { nome?: string; email?: string },
): Promise<{ api: TestApi; empresaId: number }> {
  const info = db
    .prepare(`INSERT INTO empresas (nome, status) VALUES (?, 'ativa')`)
    .run(opts?.nome ?? 'Empresa Isolada');
  const empresaId = Number(info.lastInsertRowid);
  const email = opts?.email ?? `empresa${empresaId}@gestao.local`;
  const senha = 'senha-teste-2';
  const senhaHash = hashSync(senha, 4);
  db.prepare(
    `INSERT INTO usuarios (empresa_id, nome, email, senha_hash) VALUES (?, ?, ?, ?)`,
  ).run(empresaId, 'Operador Isolado', email, senhaHash);

  const api = request.agent(app);
  const res = await api.post('/api/auth/login').send({ email, senha });
  if (res.status !== 200) {
    throw new Error(`falha ao autenticar empresa extra: ${res.status} ${JSON.stringify(res.body)}`);
  }
  return { api, empresaId };
}
