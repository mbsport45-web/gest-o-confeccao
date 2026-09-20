import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from './app.js';
import { COOKIE_SESSAO } from './auth.js';
import { createDatabase, type AppDatabase } from './db.js';
import { USUARIO_TESTE } from './httpTest.js';

describe('API de autenticação e sessão', () => {
  let db: AppDatabase;

  beforeEach(() => {
    db = createDatabase(':memory:');
  });

  afterEach(() => {
    db.close();
  });

  it('health continua público e APIs de negócio exigem sessão', async () => {
    const app = createApp(db);
    const health = await request(app).get('/api/health');
    expect(health.status).toBe(200);
    expect(health.body).toMatchObject({ status: 'ok' });

    const clientes = await request(app).get('/api/clientes');
    expect(clientes.status).toBe(401);
    expect(clientes.body.erro).toBe('Não autenticado');

    const pedidos = await request(app).get('/api/pedidos');
    expect(pedidos.status).toBe(401);
  });

  it('registra o primeiro usuário na empresa 1 e grava cookie httpOnly', async () => {
    const app = createApp(db);
    const res = await request(app).post('/api/auth/registrar').send({
      nome: 'Marcos',
      email: 'Marcos@Fabrica.com',
      senha: 'senha-segura-1',
      empresa: 'Confecção Norte',
    });
    expect(res.status).toBe(201);
    expect(res.body.usuario).toMatchObject({
      nome: 'Marcos',
      email: 'marcos@fabrica.com',
    });
    expect(res.body.empresa).toMatchObject({ id: 1, nome: 'Confecção Norte', status: 'ativa' });
    const cookie = res.headers['set-cookie']?.[0] as string;
    expect(cookie).toMatch(new RegExp(`${COOKIE_SESSAO}=`));
    expect(cookie.toLowerCase()).toMatch(/httponly/);
    expect(cookie.toLowerCase()).toMatch(/samesite=lax/);

    const me = await request(app).get('/api/me').set('Cookie', cookie.split(';')[0]);
    expect(me.status).toBe(200);
    expect(me.body.usuario.email).toBe('marcos@fabrica.com');
    expect(me.body.empresa.id).toBe(1);
  });

  it('rejeita e-mail duplicado, senha curta e login inválido', async () => {
    const app = createApp(db);
    await request(app).post('/api/auth/registrar').send(USUARIO_TESTE);

    const duplicado = await request(app).post('/api/auth/registrar').send(USUARIO_TESTE);
    expect(duplicado.status).toBe(409);

    const curta = await request(app).post('/api/auth/registrar').send({
      nome: 'Outro',
      email: 'outro@gestao.local',
      senha: 'curta',
    });
    expect(curta.status).toBe(400);

    const senhaErrada = await request(app).post('/api/auth/login').send({
      email: USUARIO_TESTE.email,
      senha: 'senha-errada-9',
    });
    expect(senhaErrada.status).toBe(401);
    expect(senhaErrada.body.erro).toBe('E-mail ou senha inválidos');
  });

  it('login reabre a sessão e logout invalida o cookie', async () => {
    const app = createApp(db);
    await request(app).post('/api/auth/registrar').send(USUARIO_TESTE);

    const login = await request(app).post('/api/auth/login').send({
      email: USUARIO_TESTE.email,
      senha: USUARIO_TESTE.senha,
    });
    expect(login.status).toBe(200);
    expect(login.body.empresa.id).toBe(1);
    const cookie = String(login.headers['set-cookie']?.[0]).split(';')[0];

    const me = await request(app).get('/api/auth/me').set('Cookie', cookie);
    expect(me.status).toBe(200);

    const agent = request.agent(app);
    await agent.post('/api/auth/login').send({
      email: USUARIO_TESTE.email,
      senha: USUARIO_TESTE.senha,
    });
    const ok = await agent.get('/api/clientes');
    expect(ok.status).toBe(200);

    const sair = await agent.post('/api/auth/logout');
    expect(sair.status).toBe(204);
    const depois = await agent.get('/api/clientes');
    expect(depois.status).toBe(401);
  });

  it('cadastro seguinte cria outra empresa e isola os dados', async () => {
    const app = createApp(db);
    const primeira = await request(app).post('/api/auth/registrar').send({
      nome: 'Marcos',
      email: 'marcos@fabrica.com',
      senha: 'senha-segura-1',
      empresa: 'Confecção Norte',
    });
    expect(primeira.status).toBe(201);
    expect(primeira.body.empresa).toMatchObject({ id: 1, nome: 'Confecção Norte' });
    const cookie1 = String(primeira.headers['set-cookie']?.[0]).split(';')[0];

    const cliente1 = await request(app)
      .post('/api/clientes')
      .set('Cookie', cookie1)
      .send({ nome: 'Cliente Norte' });
    expect(cliente1.status).toBe(201);

    const segunda = await request(app).post('/api/auth/registrar').send({
      nome: 'Ana',
      email: 'ana@sul.local',
      senha: 'senha-segura-2',
      empresa: 'Confecção Sul',
    });
    expect(segunda.status).toBe(201);
    expect(segunda.body.empresa.id).toBeGreaterThan(1);
    expect(segunda.body.empresa.nome).toBe('Confecção Sul');
    const cookie2 = String(segunda.headers['set-cookie']?.[0]).split(';')[0];

    const lista2 = await request(app).get('/api/clientes').set('Cookie', cookie2);
    expect(lista2.status).toBe(200);
    expect(lista2.body.total).toBe(0);

    const getCruzado = await request(app)
      .get(`/api/clientes/${cliente1.body.id}`)
      .set('Cookie', cookie2);
    expect(getCruzado.status).toBe(404);

    const lista1 = await request(app).get('/api/clientes').set('Cookie', cookie1);
    expect(lista1.body.total).toBe(1);
    expect(lista1.body.data[0].nome).toBe('Cliente Norte');
  });

  it('cadastro seguinte sem nome de empresa usa Minha empresa', async () => {
    const app = createApp(db);
    await request(app).post('/api/auth/registrar').send(USUARIO_TESTE);
    const segunda = await request(app).post('/api/auth/registrar').send({
      nome: 'Outra',
      email: 'outra@gestao.local',
      senha: 'senha-teste-2',
    });
    expect(segunda.status).toBe(201);
    expect(segunda.body.empresa.id).toBeGreaterThan(1);
    expect(segunda.body.empresa.nome).toBe('Minha empresa');
  });
});
