import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from './app.js';
import { createDatabase, type AppDatabase } from './db.js';
import { autenticar, autenticarNovaEmpresa, autenticarPapel, type TestApi } from './httpTest.js';

const TECIDO = {
  nome: 'Dryfit',
  categoria: 'Malharia',
  unidade: 'KG' as const,
  custo: 35,
  estoque_inicial: 20,
  estoque_minimo: 2,
};

describe('permissões do cadastro de tecidos', () => {
  let db: AppDatabase;
  let app: ReturnType<typeof createApp>;

  beforeEach(() => {
    db = createDatabase(':memory:');
    app = createApp(db);
  });

  afterEach(() => {
    db.close();
  });

  async function dono(): Promise<TestApi> {
    return autenticar(app);
  }

  it('proprietário visualiza, cria, edita, ativa e movimenta tecido', async () => {
    const api = await dono();
    const me = await api.get('/api/me');
    expect(me.body.usuario.papel).toBe('proprietario');
    expect(me.body.permissoes.modulos.materiais).toEqual({
      visualizar: true,
      criar: true,
      editar: true,
      excluir: true,
    });

    const listaVazia = await api.get('/api/tecidos');
    expect(listaVazia.status).toBe(200);
    expect(listaVazia.body.erro).toBeUndefined();

    const criado = await api.post('/api/tecidos').send(TECIDO);
    expect(criado.status).toBe(201);
    expect(criado.body.nome).toBe('Dryfit');
    expect(criado.body.empresa_id).toBe(me.body.empresa.id);

    const editado = await api.patch(`/api/tecidos/${criado.body.id}`).send({
      nome: 'Dryfit preto',
      custo: 36,
    });
    expect(editado.status).toBe(200);
    expect(editado.body.nome).toBe('Dryfit preto');

    const inativo = await api
      .patch(`/api/tecidos/${criado.body.id}/status`)
      .send({ status: 'inativo' });
    expect(inativo.status).toBe(200);
    expect(inativo.body.status).toBe('inativo');

    const ativo = await api
      .patch(`/api/tecidos/${criado.body.id}/status`)
      .send({ status: 'ativo' });
    expect(ativo.status).toBe(200);
    expect(ativo.body.status).toBe('ativo');

    const entrada = await api.post(`/api/tecidos/${criado.body.id}/movimentos`).send({
      tipo: 'entrada',
      quantidade: 5,
      unidade: 'KG',
      motivo: 'Compra',
    });
    expect(entrada.status).toBe(201);
    expect(entrada.body.tecido.estoque).toBe(25);

    const ajuste = await api.post(`/api/tecidos/${criado.body.id}/movimentos`).send({
      tipo: 'ajuste',
      quantidade: 22,
      unidade: 'KG',
      motivo: 'Inventário',
    });
    expect(ajuste.status).toBe(201);
    expect(ajuste.body.tecido.estoque).toBe(22);

    const historico = await api.get(`/api/tecidos/${criado.body.id}/movimentos`);
    expect(historico.status).toBe(200);
    expect(historico.body.data.length).toBeGreaterThanOrEqual(3);
    expect(historico.body.data[0].usuario_id).toBe(me.body.usuario.id);
  });

  it('administrador também cria e edita tecido', async () => {
    const owner = await dono();
    const admin = await autenticarPapel(app, owner, 'administrador');
    const criado = await admin.post('/api/tecidos').send({
      ...TECIDO,
      nome: 'Tactel',
      unidade: 'METRO',
      estoque_inicial: 40,
    });
    expect(criado.status).toBe(201);
    const editado = await admin.patch(`/api/tecidos/${criado.body.id}`).send({ cor: 'Branco' });
    expect(editado.status).toBe(200);
    expect(editado.body.cor).toBe('Branco');
    const lista = await admin.get('/api/tecidos');
    expect(lista.status).toBe(200);
    expect(lista.body.total).toBe(1);
  });

  it('usuário sem permissão recebe 403 e não grava tecido', async () => {
    const owner = await dono();
    const vendas = await autenticarPapel(app, owner, 'vendas');
    const financeiro = await autenticarPapel(app, owner, 'financeiro');
    const cortador = await autenticarPapel(app, owner, 'cortador');

    const verVendas = await vendas.get('/api/tecidos');
    expect(verVendas.status).toBe(403);
    expect(verVendas.body.erro).toBe('Sem permissão para visualizar materiais');
    expect(verVendas.body.modulo).toBe('materiais');

    const criarFinanceiro = await financeiro.post('/api/tecidos').send(TECIDO);
    expect(criarFinanceiro.status).toBe(403);
    expect(criarFinanceiro.body.erro).toBe('Sem permissão para criar materiais');

    const verCortador = await cortador.get('/api/tecidos');
    expect(verCortador.status).toBe(200);
    const criarCortador = await cortador.post('/api/tecidos').send(TECIDO);
    expect(criarCortador.status).toBe(403);
    expect(criarCortador.body.modulo).toBe('materiais');
    expect(criarCortador.body.acao).toBe('criar');

    const lista = await owner.get('/api/tecidos');
    expect(lista.body.total).toBe(0);
  });

  it('empresa vizinha não vê nem altera o tecido, mesmo como proprietária', async () => {
    const owner = await dono();
    const criado = await owner.post('/api/tecidos').send(TECIDO);
    expect(criado.status).toBe(201);
    const { api: outra } = await autenticarNovaEmpresa(app);

    const lista = await outra.get('/api/tecidos');
    expect(lista.status).toBe(200);
    expect(lista.body.total).toBe(0);

    const leitura = await outra.get(`/api/tecidos/${criado.body.id}`);
    expect(leitura.status).toBe(404);

    const edicao = await outra.patch(`/api/tecidos/${criado.body.id}`).send({ nome: 'Invadido' });
    expect(edicao.status).toBe(404);

    const movimento = await outra.post(`/api/tecidos/${criado.body.id}/movimentos`).send({
      tipo: 'saida',
      quantidade: 1,
      unidade: 'KG',
    });
    expect(movimento.status).toBe(404);

    const saldo = await owner.get(`/api/tecidos/${criado.body.id}`);
    expect(saldo.body.nome).toBe('Dryfit');
    expect(saldo.body.estoque).toBe(20);
  });
});
