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
  let proprietario: TestApi;

  beforeEach(async () => {
    db = createDatabase(':memory:');
    proprietario = await autenticar(createApp(db));
  });

  afterEach(() => {
    db.close();
  });

  it('o primeiro usuário é proprietário e lista só a própria equipe', async () => {
    const me = await proprietario.get('/api/me');
    expect(me.status).toBe(200);
    expect(me.body.usuario.papel).toBe('proprietario');
    expect(me.body.permissoes.escrever).toBe(true);
    expect(me.body.permissoes.equipe).toBe(true);
    expect(me.body.permissoes.modulos.equipe).toMatchObject({
      visualizar: true,
      criar: true,
      editar: true,
      excluir: true,
    });

    const lista = await proprietario.get('/api/membros');
    expect(lista.status).toBe(200);
    expect(lista.body.total).toBe(1);
    expect(lista.body.data[0]).toMatchObject({
      email: 'teste@gestao.local',
      papel: 'proprietario',
      status: 'ativo',
    });
  });

  it('aceitar convite entra na empresa do convite com o papel combinado', async () => {
    const app = createApp(db);
    const convite = await proprietario.post('/api/convites').send({
      email: 'ana@fabrica.local',
      papel: 'producao',
    });
    expect(convite.status).toBe(201);
    expect(convite.body.token).toBeTruthy();
    expect(convite.body.papel).toBe('producao');
    expect(convite.body.caminho).toMatch(/\?convite=/);

    const publico = await request(app).get(`/api/auth/convite/${convite.body.token}`);
    expect(publico.status).toBe(200);
    expect(publico.body).toMatchObject({
      email: 'ana@fabrica.local',
      papel: 'producao',
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
      nome: 'Ana Produção',
      email: 'ana@fabrica.local',
      senha: 'senha-teste-2',
      convite: convite.body.token,
      empresa: 'Não deve criar esta empresa',
    });
    expect(aceito.status).toBe(201);
    expect(aceito.body.empresa.id).toBe(1);
    expect(aceito.body.usuario.papel).toBe('producao');
    expect(aceito.body.permissoes.equipe).toBe(false);
    expect(aceito.body.permissoes.modulos.ordens.criar).toBe(true);
    expect(aceito.body.permissoes.modulos.pedidos.visualizar).toBe(false);

    const membros = await proprietario.get('/api/membros');
    expect(membros.body.total).toBe(2);
    expect(membros.body.data.map((m: { email: string }) => m.email)).toEqual(
      expect.arrayContaining(['teste@gestao.local', 'ana@fabrica.local']),
    );
  });

  it('cada papel só acessa os módulos correspondentes', async () => {
    const app = createApp(db);
    const financeiro = await autenticarPapel(app, proprietario, 'financeiro');
    const vendas = await autenticarPapel(app, proprietario, 'vendas');
    const estoque = await autenticarPapel(app, proprietario, 'estoque');
    const producao = await autenticarPapel(app, proprietario, 'producao');

    const cliente = await proprietario.post('/api/clientes').send({ nome: 'Loja Proprietário' });
    expect(cliente.status).toBe(201);

    expect((await financeiro.get('/api/financeiro/resumo')).status).toBe(200);
    expect((await financeiro.get('/api/clientes')).status).toBe(200);
    expect((await financeiro.post('/api/clientes').send({ nome: 'Bloqueado' })).status).toBe(403);
    expect((await financeiro.get('/api/ordens')).status).toBe(403);
    expect((await financeiro.get('/api/membros')).status).toBe(403);

    expect((await vendas.get('/api/clientes')).status).toBe(200);
    expect((await vendas.post('/api/clientes').send({ nome: 'Loja Vendas' })).status).toBe(201);
    expect((await vendas.patch(`/api/clientes/${cliente.body.id}`).send({ nome: 'X' })).status).toBe(200);
    expect((await vendas.get('/api/relatorios/resumo')).status).toBe(200);
    expect((await vendas.get('/api/financeiro/resumo')).status).toBe(403);
    expect((await vendas.delete(`/api/clientes/${cliente.body.id}`)).status).toBe(204);

    const cliente2 = await proprietario.post('/api/clientes').send({ nome: 'Loja Extra' });
    expect((await estoque.get('/api/estoque')).status).toBe(200);
    expect((await estoque.get('/api/produtos')).status).toBe(200);
    expect((await estoque.post('/api/produtos').send({ nome: 'Camisa' })).status).toBe(403);
    expect((await estoque.get('/api/clientes')).status).toBe(403);
    expect((await estoque.post('/api/materias-primas').send({})).status).toBe(400);

    expect((await producao.get('/api/ordens')).status).toBe(200);
    expect((await producao.get('/api/produtos')).status).toBe(200);
    expect((await producao.post('/api/ordens').send({})).status).toBe(400);
    expect((await producao.post('/api/clientes').send({ nome: 'OP Cliente' })).status).toBe(403);
    expect((await producao.get('/api/pedidos')).status).toBe(403);
    expect((await producao.get(`/api/clientes/${cliente2.body.id}`)).status).toBe(200);

    const equipeVendas = await vendas.get('/api/membros');
    expect(equipeVendas.status).toBe(403);
    const conviteEstoque = await estoque.post('/api/convites').send({
      email: 'x@gestao.local',
      papel: 'vendas',
    });
    expect(conviteEstoque.status).toBe(403);
  });

  it('administrador convida e altera papel; não altera o proprietário nem vê outra empresa', async () => {
    const app = createApp(db);
    const admin = await autenticarPapel(app, proprietario, 'administrador', {
      email: 'admin@gestao.local',
    });
    const { api: empresa2 } = await autenticarNovaEmpresa(app);

    const meAdmin = await admin.get('/api/me');
    expect(meAdmin.body.permissoes.equipe).toBe(true);

    const conviteDono = await admin.post('/api/convites').send({
      email: 'novo-dono@gestao.local',
      papel: 'proprietario',
    });
    expect(conviteDono.status).toBe(400);

    const producao = await autenticarPapel(app, admin, 'producao', { email: 'op@gestao.local' });
    const meOp = await producao.get('/api/me');
    const opId = meOp.body.usuario.id as number;

    const promover = await admin.patch(`/api/membros/${opId}`).send({ papel: 'administrador' });
    expect(promover.status).toBe(200);
    expect(promover.body.papel).toBe('administrador');

    const donoId = (await proprietario.get('/api/me')).body.usuario.id as number;
    const alterarDono = await admin.patch(`/api/membros/${donoId}`).send({ papel: 'administrador' });
    expect(alterarDono.status).toBe(403);

    const inativarDono = await proprietario.patch(`/api/membros/${donoId}`).send({ status: 'inativo' });
    expect(inativarDono.status).toBe(409);

    const lista2 = await empresa2.get('/api/membros');
    expect(lista2.status).toBe(200);
    expect(lista2.body.total).toBe(1);
    expect(lista2.body.data[0].email).not.toBe('teste@gestao.local');

    const cruzado = await empresa2.get(`/api/membros/${donoId}`);
    expect(cruzado.status).toBe(404);

    const patchCruzado = await empresa2.patch(`/api/membros/${opId}`).send({ papel: 'vendas' });
    expect(patchCruzado.status).toBe(404);

    const convites2 = await empresa2.get('/api/convites');
    expect(convites2.body.total).toBe(0);
  });

  it('mesmo papel em empresas diferentes não acessa dados cruzados', async () => {
    const app = createApp(db);
    const vendas1 = await autenticarPapel(app, proprietario, 'vendas', {
      email: 'vendas1@gestao.local',
    });
    const { api: empresa2 } = await autenticarNovaEmpresa(app);
    const vendas2 = await autenticarPapel(app, empresa2, 'vendas', {
      email: 'vendas2@gestao.local',
    });

    const cliente1 = await vendas1.post('/api/clientes').send({ nome: 'Cliente Empresa 1' });
    expect(cliente1.status).toBe(201);
    const cliente2 = await vendas2.post('/api/clientes').send({ nome: 'Cliente Empresa 2' });
    expect(cliente2.status).toBe(201);

    const lista1 = await vendas1.get('/api/clientes');
    expect(lista1.body.data.map((c: { nome: string }) => c.nome)).toEqual(['Cliente Empresa 1']);

    const lista2 = await vendas2.get('/api/clientes');
    expect(lista2.body.data.map((c: { nome: string }) => c.nome)).toEqual(['Cliente Empresa 2']);

    const verCruzado = await vendas2.get(`/api/clientes/${cliente1.body.id}`);
    expect(verCruzado.status).toBe(404);

    const editarCruzado = await vendas2.patch(`/api/clientes/${cliente1.body.id}`).send({
      nome: 'Invadir',
    });
    expect(editarCruzado.status).toBe(404);

    const excluirCruzado = await vendas2.delete(`/api/clientes/${cliente1.body.id}`);
    expect(excluirCruzado.status).toBe(404);

    const financeiro2 = await autenticarPapel(app, empresa2, 'financeiro', {
      email: 'fin2@gestao.local',
    });
    const verFin = await financeiro2.get(`/api/clientes/${cliente1.body.id}`);
    expect(verFin.status).toBe(404);
  });

  it('rejeita convite duplicado, e-mail já cadastrado e cancela sem vazar token depois', async () => {
    const app = createApp(db);
    const primeiro = await proprietario.post('/api/convites').send({
      email: 'convite@gestao.local',
      papel: 'vendas',
    });
    expect(primeiro.status).toBe(201);
    const token = primeiro.body.token as string;

    const duplicado = await proprietario.post('/api/convites').send({
      email: 'convite@gestao.local',
      papel: 'administrador',
    });
    expect(duplicado.status).toBe(409);

    const jaExiste = await proprietario.post('/api/convites').send({
      email: 'teste@gestao.local',
      papel: 'producao',
    });
    expect(jaExiste.status).toBe(409);

    const lista = await proprietario.get('/api/convites');
    expect(lista.body.total).toBe(1);
    expect(lista.body.data[0].token).toBeUndefined();

    const cancelar = await proprietario.delete(`/api/convites/${primeiro.body.id}`);
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
    const producao = await autenticarPapel(app, proprietario, 'producao', {
      email: 'sessao@gestao.local',
    });
    const id = (await producao.get('/api/me')).body.usuario.id as number;

    const antes = await producao.get('/api/clientes');
    expect(antes.status).toBe(200);

    const inativar = await proprietario.patch(`/api/membros/${id}`).send({ status: 'inativo' });
    expect(inativar.status).toBe(200);
    expect(inativar.body.status).toBe('inativo');

    const depois = await producao.get('/api/clientes');
    expect(depois.status).toBe(401);
  });
});
