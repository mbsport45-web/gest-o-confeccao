import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from './app.js';
import { createDatabase, type AppDatabase } from './db.js';
import { autenticar, type TestApi } from './httpTest.js';

describe('API de etapas de produção', () => {
  let db: AppDatabase;
  let api: TestApi;

  beforeEach(async () => {
    db = createDatabase(':memory:');
    api = await autenticar(createApp(db));
  });

  afterEach(() => {
    db.close();
  });

  async function criarOp() {
    const res = await api.post('/api/ordens').send({
      cliente: 'Loja Etapas',
      produto: 'Camiseta Polo',
      tamanho: 'M',
      quantidade: 20,
    });
    return res.body as { id: number; codigo: string };
  }

  it('lista vazia paginada', async () => {
    const res = await api.get('/api/etapas');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      data: [],
      pagina: 1,
      por_pagina: 10,
      total: 0,
      total_paginas: 1,
    });
  });

  it('gera o fluxo padrão vinculado à OP', async () => {
    const op = await criarOp();
    const res = await api.post('/api/etapas/fluxo').send({
      ordem_id: op.id,
      responsavel: 'Supervisor',
    });
    expect(res.status).toBe(201);
    expect(res.body.data).toHaveLength(5);
    expect(res.body.data.map((e: { tipo: string }) => e.tipo)).toEqual([
      'corte',
      'costura',
      'acabamento',
      'qualidade',
      'embalagem',
    ]);
    expect(res.body.data[0]).toMatchObject({
      ordem_id: op.id,
      sequencia: 1,
      status: 'pendente',
      responsavel: 'Supervisor',
      ordem_codigo: op.codigo,
    });
  });

  it('não duplica o fluxo da mesma OP', async () => {
    const op = await criarOp();
    await api.post('/api/etapas/fluxo').send({ ordem_id: op.id });
    const dup = await api.post('/api/etapas/fluxo').send({ ordem_id: op.id });
    expect(dup.status).toBe(409);
  });

  it('inicia corte, registra timestamps e bloqueia a etapa seguinte', async () => {
    const op = await criarOp();
    const fluxo = await api.post('/api/etapas/fluxo').send({ ordem_id: op.id });
    const corte = fluxo.body.data[0];
    const costura = fluxo.body.data[1];

    const start = await api
      .patch(`/api/etapas/${corte.id}`)
      .send({ status: 'em_andamento', responsavel: 'Cortador 1' });
    expect(start.status).toBe(200);
    expect(start.body.status).toBe('em_andamento');
    expect(start.body.iniciado_em).toBeTruthy();
    expect(start.body.responsavel).toBe('Cortador 1');

    const cedo = await api
      .patch(`/api/etapas/${costura.id}`)
      .send({ status: 'em_andamento' });
    expect(cedo.status).toBe(409);

    const fim = await api
      .patch(`/api/etapas/${corte.id}`)
      .send({ status: 'concluida' });
    expect(fim.status).toBe(200);
    expect(fim.body.finalizado_em).toBeTruthy();

    const start2 = await api
      .patch(`/api/etapas/${costura.id}`)
      .send({ status: 'em_andamento' });
    expect(start2.status).toBe(200);
  });

  it('impede concluir etapa que ainda não começou', async () => {
    const op = await criarOp();
    const fluxo = await api.post('/api/etapas/fluxo').send({ ordem_id: op.id });
    const res = await api
      .patch(`/api/etapas/${fluxo.body.data[0].id}`)
      .send({ status: 'concluida' });
    expect(res.status).toBe(409);
  });

  it('busca, filtra e pagina', async () => {
    const op = await criarOp();
    await api.post('/api/etapas/fluxo').send({ ordem_id: op.id });
    const busca = await api.get('/api/etapas').query({ q: op.codigo, pagina: 1 });
    expect(busca.body.total).toBe(5);

    const filtro = await api
      .get('/api/etapas')
      .query({ tipo: 'qualidade', status: 'pendente', pagina: 1 });
    expect(filtro.body.total).toBe(1);
    expect(filtro.body.data[0].tipo).toBe('qualidade');

    const pagina = await api.get('/api/etapas').query({ pagina: 2, por_pagina: 3 });
    expect(pagina.body.data).toHaveLength(2);
    expect(pagina.body.total_paginas).toBe(2);
  });

  it('cria etapa avulsa, detalha e remove se pendente', async () => {
    const op = await criarOp();
    const criada = await api.post('/api/etapas').send({
      ordem_id: op.id,
      tipo: 'corte',
      responsavel: 'Ana',
    });
    expect(criada.status).toBe(201);
    expect(criada.body.sequencia).toBe(1);

    const detalhe = await api.get(`/api/etapas/${criada.body.id}`);
    expect(detalhe.body.responsavel).toBe('Ana');

    const del = await api.delete(`/api/etapas/${criada.body.id}`);
    expect(del.status).toBe(204);
  });

  it('não exclui etapa em andamento', async () => {
    const op = await criarOp();
    const criada = await api.post('/api/etapas').send({
      ordem_id: op.id,
      tipo: 'corte',
    });
    await api
      .patch(`/api/etapas/${criada.body.id}`)
      .send({ status: 'em_andamento' });
    const del = await api.delete(`/api/etapas/${criada.body.id}`);
    expect(del.status).toBe(409);
  });

  it('retorna 404 para etapa e OP inexistentes', async () => {
    const etapa = await api.get('/api/etapas/999');
    expect(etapa.status).toBe(404);
    const fluxo = await api.post('/api/etapas/fluxo').send({ ordem_id: 999 });
    expect(fluxo.status).toBe(404);
  });

  it('não altera contratos de clientes, produtos, matérias, estoque e OPs', async () => {
    const cliente = await api.post('/api/clientes').send({ nome: 'Loja Fluxo' });
    expect(cliente.status).toBe(201);
    const produto = await api.post('/api/produtos').send({
      nome: 'Jaqueta Fluxo',
      sku: 'JAQ-FLX',
    });
    expect(produto.status).toBe(201);
    const materia = await api.post('/api/materias-primas').send({
      nome: 'Malha Fluxo',
      tipo: 'tecido',
    });
    expect(materia.status).toBe(201);
    const mov = await api.post('/api/estoque/movimentos').send({
      tipo: 'entrada',
      quantidade: 2,
      materia_prima_id: materia.body.id,
    });
    expect(mov.status).toBe(201);
    const ordem = await api.post('/api/ordens').send({
      cliente: 'Loja Fluxo',
      produto: 'Jaqueta Fluxo',
      tamanho: 'G',
      quantidade: 4,
    });
    expect(ordem.status).toBe(201);
    expect(ordem.body.status).toBe('pendente');
    const listaOp = await api.get('/api/ordens');
    expect(Array.isArray(listaOp.body)).toBe(true);
  });
});
