import request from 'supertest';
import type { Express } from 'express';
import type { PapelConvite } from './papeis.js';

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

/** Segundo cadastro público: cria outra empresa e autenticar nela. */
export async function autenticarNovaEmpresa(
  app: Express,
  opts?: { nome?: string; email?: string },
): Promise<{ api: TestApi; empresaId: number }> {
  const api = request.agent(app);
  const res = await api.post('/api/auth/registrar').send({
    nome: 'Operador Isolado',
    email: opts?.email ?? `empresa-${crypto.randomUUID()}@gestao.local`,
    senha: 'senha-teste-2',
    empresa: opts?.nome ?? 'Empresa Isolada',
  });
  if (res.status !== 201) {
    throw new Error(`falha ao cadastrar empresa extra: ${res.status} ${JSON.stringify(res.body)}`);
  }
  return { api, empresaId: Number(res.body.empresa.id) };
}

export async function autenticarPapel(
  app: Express,
  admin: TestApi,
  papel: PapelConvite,
  opts?: { nome?: string; email?: string; senha?: string },
): Promise<TestApi> {
  const email = opts?.email ?? `${papel}-${crypto.randomUUID()}@gestao.local`;
  const senha = opts?.senha ?? 'senha-teste-2';
  let convite = await admin.post('/api/convites').send({ email, papel });
  if (convite.status === 409 && convite.body?.codigo === 'limite_plano') {
    const upgrade = await admin.patch('/api/assinatura').send({ plano: 'enterprise' });
    if (upgrade.status !== 200) {
      throw new Error(
        `falha ao ampliar plano de teste: ${upgrade.status} ${JSON.stringify(upgrade.body)}`,
      );
    }
    convite = await admin.post('/api/convites').send({ email, papel });
  }
  if (convite.status !== 201) {
    throw new Error(`falha ao convidar ${papel}: ${convite.status} ${JSON.stringify(convite.body)}`);
  }
  const api = request.agent(app);
  const res = await api.post('/api/auth/registrar').send({
    nome: opts?.nome ?? `Membro ${papel}`,
    email,
    senha,
    convite: convite.body.token,
  });
  if (res.status !== 201) {
    throw new Error(`falha ao aceitar convite: ${res.status} ${JSON.stringify(res.body)}`);
  }
  return api;
}
