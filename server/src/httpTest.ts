import request from 'supertest';
import type { Express } from 'express';

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
