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

describe('membros, convites e papéis', () => {
  let db: AppDatabase;
  let dono: TestApi;

  beforeEach(async () => {
    db = createDatabase(':memory:');
    dono = await autenticar(createApp(db));
  });

  afterEach(() => {
    db.close();
  });

  it('o primeiro usuário é dono e lista só a própria equipe', async () => {
    const me = await dono.get('/api/me');
    expect(me.status).toBe(200);
    expect(me.body.usuario.papel).toBe('dono');
    expect(me.body.permissoes).toEqual({ escrever: true, equipe: true });

    const lista = await dono.get('/api/membros');
    expect(lista.status).toBe(200);
    expect(lista.body.total).toBe(1);
    expect(lista.body.data[0]).toMatchObject({
      email: 'teste@gestao.local',
      papel: 'dono',
      status: 'ativo',
    });
  });

  it('aceitar convite entra na empresa do convite com o papel combinado', async () => {
    const app = createApp(db);
    const convite = await dono.post('/api/convites').send({
      email: 'ana@fabrica.local',
      papel: 'operador',
    });
    expect(convite.status).toBe(201);
    expect(convite.body.token).toBeTruthy();
    expect(convite.body.papel).toBe('operador');
    expect(convite.body.caminho).toMatch(/\?convite=/);

    const publico = await request(app).get(`/api/auth/convite/${convite.body.token}`);
    expect(publico.status).toBe(200);
    expect(publico.body).toMatchObject({
      email: 'ana@fabrica.local',
      papel: 'operador',
      empresa: { id: 1 },
    });

    const outroEmail = await request(app).post('/api/auth/registrar').send({
      nome: 'Ana',
      email: 'outra@fabrica.local',
      senha: 'senha-teste-2',
      convite: convite.body.token,
    });
    expect(outroEmail.status).toBe(400);

    const aceito = await request.agent(app).post('/api/auth/registrar').send({
      nome: 'Ana Operadora',
      email: 'ana@fabrica.local',
      senha: 'senha-teste-2',
      convite: convite.body.token,
      empresa: 'Não deve criar esta empresa',
    });
    expect(aceito.status).toBe(201);
    expect(aceito.body.empresa.id).toBe(1);
    expect(aceito.body.usuario.papel).toBe('operador');
    expect(aceito.body.permissoes).toEqual({ escrever: true, equipe: false });

    const membros = await dono.get('/api/membros');
    expect(membros.body.total).toBe(2);
    expect(membros.body.data.map((m: { email: string }) => m.email)).toEqual(
      expect.arrayContaining(['teste@gestao.local', 'ana@fabrica.local']),
    );
  });

  it('consulta lê dados da empresa e não escreve; operador não gerencia equipe', async () => {
    const app = createApp(db);
    const consulta = await autenticarPapel(app, dono, 'consulta');
    const operador = await autenticarPapel(app, dono, 'operador');

    const clienteDono = await dono.post('/api/clientes').send({ nome: 'Loja Dono' });
    expect(clienteDono.status).toBe(201);

    const lista = await consulta.get('/api/clientes');
    expect(lista.status).toBe(200);
    expect(lista.body.total).toBe(1);

    const criar = await consulta.post('/api/clientes').send({ nome: 'Bloqueado' });
    expect(criar.status).toBe(403);
    expect(criar.body.erro).toBe('Seu perfil é somente leitura');

    const patch = await consulta.patch(`/api/clientes/${clienteDono.body.id}`).send({ nome: 'X' });
    expect(patch.status).toBe(403);

    const del = await consulta.delete(`/api/clientes/${clienteDono.body.id}`);
    expect(del.status).toBe(403);

    const operadorCria = await operador.post('/api/clientes').send({ nome: 'Loja Operador' });
    expect(operadorCria.status).toBe(201);

    const equipeOp = await operador.get('/api/membros');
    expect(equipeOp.status).toBe(403);

    const conviteOp = await operador.post('/api/convites').send({
      email: 'x@gestao.local',
      papel: 'consulta',
    });
    expect(conviteOp.status).toBe(403);

    const original = await dono.get(`/api/clientes/${clienteDono.body.id}`);
    expect(original.body.nome).toBe('Loja Dono');
  });

  it('admin convida e altera papel; não altera o dono nem vê outra empresa', async () => {
    const app = createApp(db);
    const admin = await autenticarPapel(app, dono, 'admin', { email: 'admin@gestao.local' });
    const { api: empresa2 } = await autenticarNovaEmpresa(app);

    const meAdmin = await admin.get('/api/me');
    expect(meAdmin.body.permissoes.equipe).toBe(true);

    const conviteDono = await admin.post('/api/convites').send({
      email: 'novo-dono@gestao.local',
      papel: 'dono',
    });
    expect(conviteDono.status).toBe(400);

    const operador = await autenticarPapel(app, admin, 'operador', { email: 'op@gestao.local' });
    const meOp = await operador.get('/api/me');
    const opId = meOp.body.usuario.id as number;

    const promover = await admin.patch(`/api/membros/${opId}`).send({ papel: 'admin' });
    expect(promover.status).toBe(200);
    expect(promover.body.papel).toBe('admin');

    const donoId = (await dono.get('/api/me')).body.usuario.id as number;
    const alterarDono = await admin.patch(`/api/membros/${donoId}`).send({ papel: 'admin' });
    expect(alterarDono.status).toBe(403);

    const inativarDono = await dono.patch(`/api/membros/${donoId}`).send({ status: 'inativo' });
    expect(inativarDono.status).toBe(409);

    const lista2 = await empresa2.get('/api/membros');
    expect(lista2.status).toBe(200);
    expect(lista2.body.total).toBe(1);
    expect(lista2.body.data[0].email).not.toBe('teste@gestao.local');

    const cruzado = await empresa2.get(`/api/membros/${donoId}`);
    expect(cruzado.status).toBe(404);

    const patchCruzado = await empresa2.patch(`/api/membros/${opId}`).send({ papel: 'consulta' });
    expect(patchCruzado.status).toBe(404);

    const convites2 = await empresa2.get('/api/convites');
    expect(convites2.body.total).toBe(0);
  });

  it('rejeita convite duplicado, e-mail já cadastrado e cancela sem vazar token depois', async () => {
    const app = createApp(db);
    const primeiro = await dono.post('/api/convites').send({
      email: 'convite@gestao.local',
      papel: 'consulta',
    });
    expect(primeiro.status).toBe(201);
    const token = primeiro.body.token as string;

    const duplicado = await dono.post('/api/convites').send({
      email: 'convite@gestao.local',
      papel: 'admin',
    });
    expect(duplicado.status).toBe(409);

    const jaExiste = await dono.post('/api/convites').send({
      email: 'teste@gestao.local',
      papel: 'operador',
    });
    expect(jaExiste.status).toBe(409);

    const lista = await dono.get('/api/convites');
    expect(lista.body.total).toBe(1);
    expect(lista.body.data[0].token).toBeUndefined();

    const cancelar = await dono.delete(`/api/convites/${primeiro.body.id}`);
    expect(cancelar.status).toBe(204);

    const publico = await request(app).get(`/api/auth/convite/${token}`);
    expect(publico.status).toBe(409);

    const aceitar = await request(app).post('/api/auth/registrar').send({
      nome: 'Tarde',
      email: 'convite@gestao.local',
      senha: 'senha-teste-2',
      convite: token,
    });
    expect(aceitar.status).toBe(409);
  });

  it('inativar membro encerra a sessão dele', async () => {
    const app = createApp(db);
    const operador = await autenticarPapel(app, dono, 'operador', { email: 'sessao@gestao.local' });
    const id = (await operador.get('/api/me')).body.usuario.id as number;

    const antes = await operador.get('/api/clientes');
    expect(antes.status).toBe(200);

    const inativar = await dono.patch(`/api/membros/${id}`).send({ status: 'inativo' });
    expect(inativar.status).toBe(200);
    expect(inativar.body.status).toBe('inativo');

    const depois = await operador.get('/api/clientes');
    expect(depois.status).toBe(401);
  });
});
