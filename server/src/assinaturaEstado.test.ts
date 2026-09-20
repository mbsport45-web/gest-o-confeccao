import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from './app.js';
import { createDatabase, type AppDatabase } from './db.js';
import {
  autenticar,
  autenticarNovaEmpresa,
  autenticarPapel,
  type TestApi,
} from './httpTest.js';
import {
  ACOES_ASSINATURA,
  CODIGO_ASSINATURA_BLOQUEADA,
  STATUS_ASSINATURA,
  TRANSICOES_ASSINATURA,
  type AcaoAssinatura,
  type StatusAssinatura,
} from './planos.js';

async function aplicar(api: TestApi, acao: AcaoAssinatura) {
  return api.patch('/api/assinatura').send({ acao });
}

async function irPara(api: TestApi, alvo: StatusAssinatura) {
  const passos: Record<StatusAssinatura, AcaoAssinatura[]> = {
    trial: [],
    ativa: ['ativar'],
    past_due: ['ativar', 'marcar_atraso'],
    cancelada: ['cancelar'],
    expirada: ['expirar'],
  };
  for (const acao of passos[alvo]) {
    const res = await aplicar(api, acao);
    expect(res.status).toBe(200);
  }
}

describe('máquina de estados da assinatura', () => {
  let db: AppDatabase;
  let api: TestApi;

  beforeEach(async () => {
    db = createDatabase(':memory:');
    api = await autenticar(createApp(db));
  });

  afterEach(() => {
    db.close();
  });

  it('empresa nova entra em trial com leitura e operação, sem cobrança', async () => {
    const me = await api.get('/api/me');
    expect(me.status).toBe(200);
    expect(me.body.usuario.papel).toBe('proprietario');
    expect(me.body.assinatura.status).toBe('trial');
    expect(me.body.assinatura.status_label).toBe('Período de avaliação');
    expect(me.body.assinatura.cobranca).toBe('desativada');
    expect(me.body.assinatura.gateway).toBeNull();
    expect(me.body.assinatura.acesso).toEqual({
      leitura: true,
      operacional: true,
      trocar_plano: true,
    });
    expect(me.body.assinatura.politica.acoes).toEqual(
      expect.arrayContaining(['ativar', 'cancelar', 'expirar']),
    );
    expect(me.body.assinatura.renova_em).toBeTruthy();

    const cliente = await api.post('/api/clientes').send({ nome: 'Loja Trial' });
    expect(cliente.status).toBe(201);
  });

  it.each([
    ['ativar', 'trial', 'ativa'],
    ['cancelar', 'trial', 'cancelada'],
    ['expirar', 'trial', 'expirada'],
    ['marcar_atraso', 'ativa', 'past_due'],
    ['cancelar', 'ativa', 'cancelada'],
    ['regularizar', 'past_due', 'ativa'],
    ['cancelar', 'past_due', 'cancelada'],
    ['expirar', 'past_due', 'expirada'],
    ['reativar', 'cancelada', 'ativa'],
    ['expirar', 'cancelada', 'expirada'],
    ['renovar', 'expirada', 'ativa'],
  ] as Array<[AcaoAssinatura, StatusAssinatura, StatusAssinatura]>)(
    '%s: %s → %s',
    async (acao, de, para) => {
      await irPara(api, de);
      const atual = await api.get('/api/assinatura');
      expect(atual.body.status).toBe(de);
      const res = await aplicar(api, acao);
      expect(res.status).toBe(200);
      expect(res.body.status).toBe(para);
      expect(res.body.status_label).toBeTruthy();
      expect(res.body.cobranca).toBe('desativada');
      expect(res.body.gateway).toBeNull();
      expect(res.body.acesso.leitura).toBe(true);
      expect(res.body.acesso.operacional).toBe(para === 'trial' || para === 'ativa');
    },
  );

  it('rejeita transições inválidas e ignora status cru no body', async () => {
    const invalida = await aplicar(api, 'regularizar');
    expect(invalida.status).toBe(409);
    expect(invalida.body.codigo).toBe('transicao_invalida');
    expect(invalida.body.de).toBe('trial');
    expect((await api.get('/api/assinatura')).body.status).toBe('trial');

    await aplicar(api, 'ativar');
    const expirarAtiva = await aplicar(api, 'expirar');
    expect(expirarAtiva.status).toBe(409);
    expect((await api.get('/api/assinatura')).body.status).toBe('ativa');

    const cru = await api.patch('/api/assinatura').send({ status: 'expirada' });
    expect(cru.status).toBe(400);
    expect((await api.get('/api/assinatura')).body.status).toBe('ativa');

    const ambas = await api.patch('/api/assinatura').send({
      plano: 'profissional',
      acao: 'cancelar',
    });
    expect(ambas.status).toBe(400);
  });

  it('o proprietário vê o status; vendas vê e não altera; isolamento entre empresas', async () => {
    const app = createApp(db);
    const vendas = await autenticarPapel(app, api, 'vendas');
    const { api: empresa2 } = await autenticarNovaEmpresa(app);

    const dono = await api.get('/api/assinatura');
    expect(dono.status).toBe(200);
    expect(dono.body.status).toBe('trial');
    expect(dono.body.politica.permite.length).toBeGreaterThan(0);

    const vista = await vendas.get('/api/assinatura');
    expect(vista.status).toBe(200);
    expect(vista.body.status).toBe('trial');
    const negar = await vendas.patch('/api/assinatura').send({ acao: 'cancelar' });
    expect(negar.status).toBe(403);
    expect(negar.body.modulo).toBe('assinatura');
    expect(negar.body.acao).toBe('editar');

    const cancelar = await api.patch('/api/assinatura').send({
      acao: 'cancelar',
      empresa_id: 2,
    });
    expect(cancelar.status).toBe(400);

    expect((await aplicar(api, 'cancelar')).status).toBe(200);
    expect((await api.get('/api/assinatura')).body.status).toBe('cancelada');
    expect((await empresa2.get('/api/assinatura')).body.status).toBe('trial');
    expect((await empresa2.post('/api/clientes').send({ nome: 'Loja 2' })).status).toBe(201);
  });

  it.each(['past_due', 'cancelada', 'expirada'] as StatusAssinatura[])(
    'status %s mantém leitura e bloqueia escrita operacional',
    async (status) => {
      const criado = await api.post('/api/clientes').send({ nome: 'Loja Guardada' });
      expect(criado.status).toBe(201);
      const id = criado.body.id as number;
      await irPara(api, status);

      const lista = await api.get('/api/clientes');
      expect(lista.status).toBe(200);
      expect(lista.body.data.some((c: { id: number }) => c.id === id)).toBe(true);

      const detalhe = await api.get(`/api/clientes/${id}`);
      expect(detalhe.status).toBe(200);
      expect(detalhe.body.nome).toBe('Loja Guardada');

      const me = await api.get('/api/me');
      expect(me.status).toBe(200);
      expect(me.body.assinatura.status).toBe(status);
      expect(me.body.assinatura.acesso.leitura).toBe(true);
      expect(me.body.assinatura.acesso.operacional).toBe(false);

      const criar = await api.post('/api/clientes').send({ nome: 'Não deve entrar' });
      expect(criar.status).toBe(403);
      expect(criar.body.codigo).toBe(CODIGO_ASSINATURA_BLOQUEADA);
      expect(criar.body.modulo).toBeUndefined();
      expect(criar.body.status).toBe(status);

      const editar = await api.patch(`/api/clientes/${id}`).send({ nome: 'Hack' });
      expect(editar.status).toBe(403);
      expect(editar.body.codigo).toBe(CODIGO_ASSINATURA_BLOQUEADA);

      const excluir = await api.delete(`/api/clientes/${id}`);
      expect(excluir.status).toBe(403);

      const plano = await api.patch('/api/assinatura').send({ plano: 'profissional' });
      expect(plano.status).toBe(403);
      expect(plano.body.codigo).toBe(CODIGO_ASSINATURA_BLOQUEADA);
      expect((await api.get('/api/assinatura')).body.plano.codigo).toBe('basico');
    },
  );

  it('trial expirado vira expirada na leitura; depois renovar libera a operação', async () => {
    db.prepare(
      `UPDATE assinaturas SET renova_em = datetime('now', '-1 day') WHERE empresa_id = 1`,
    ).run();
    const lida = await api.get('/api/assinatura');
    expect(lida.status).toBe(200);
    expect(lida.body.status).toBe('expirada');
    expect(lida.body.acesso.operacional).toBe(false);
    expect((await api.post('/api/clientes').send({ nome: 'Tarde' })).status).toBe(403);

    const renovar = await aplicar(api, 'renovar');
    expect(renovar.status).toBe(200);
    expect(renovar.body.status).toBe('ativa');
    expect((await api.post('/api/clientes').send({ nome: 'Depois da renovação' })).status).toBe(201);
  });

  it('convite não entra em empresa bloqueada; cadastro público ainda cria empresa nova em trial', async () => {
    const app = createApp(db);
    const convite = await api.post('/api/convites').send({
      email: 'bloqueado@gestao.local',
      papel: 'vendas',
    });
    expect(convite.status).toBe(201);
    expect((await aplicar(api, 'cancelar')).status).toBe(200);

    const res = await request(app).post('/api/auth/registrar').send({
      nome: 'Fora',
      email: 'bloqueado@gestao.local',
      senha: 'senha-teste-9',
      convite: convite.body.token,
    });
    expect(res.status).toBe(403);
    expect(res.body.codigo).toBe(CODIGO_ASSINATURA_BLOQUEADA);

    const { api: nova, empresaId } = await autenticarNovaEmpresa(app);
    expect(empresaId).not.toBe(1);
    expect((await nova.get('/api/assinatura')).body.status).toBe('trial');
    expect((await nova.post('/api/clientes').send({ nome: 'Loja Nova' })).status).toBe(201);
  });

  it('login continua possível com assinatura expirada', async () => {
    const app = createApp(db);
    expect((await aplicar(api, 'expirar')).status).toBe(200);
    await api.post('/api/auth/logout');
    const login = await request.agent(app).post('/api/auth/login').send({
      email: 'teste@gestao.local',
      senha: 'senha-teste-1',
    });
    expect(login.status).toBe(200);
    expect(login.body.assinatura.status).toBe('expirada');
    expect(login.body.assinatura.acesso.leitura).toBe(true);
    expect((await request.agent(app).get('/api/health')).status).toBe(200);
  });

  it('catálogo de transições cobre todos os status e ações', () => {
    expect(STATUS_ASSINATURA).toEqual(['trial', 'ativa', 'past_due', 'cancelada', 'expirada']);
    expect(Object.keys(TRANSICOES_ASSINATURA).sort()).toEqual([...ACOES_ASSINATURA].sort());
    const origens = new Set(Object.values(TRANSICOES_ASSINATURA).flatMap((t) => t.de));
    const destinos = new Set(Object.values(TRANSICOES_ASSINATURA).map((t) => t.para));
    expect(origens.has('trial')).toBe(true);
    expect(destinos.has('ativa')).toBe(true);
    expect(destinos.has('expirada')).toBe(true);
  });
});
