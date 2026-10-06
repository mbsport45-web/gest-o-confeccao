import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from './app.js';
import { createDatabase, type AppDatabase } from './db.js';
import { autenticar, autenticarNovaEmpresa, autenticarPapel, type TestApi } from './httpTest.js';
import type { Express } from 'express';

const modelos = ['Camiseta', 'Bermuda', 'Regata', 'Manga longa', 'Camiseta com trançador'];

describe('cadastro dinâmico de produtos e modelos', () => {
  let db: AppDatabase;
  let app: Express;
  let api: TestApi;

  beforeEach(async () => {
    db = createDatabase(':memory:');
    app = createApp(db);
    api = await autenticar(app);
  });

  afterEach(() => {
    db.close();
  });

  it('cadastra modelos, pesquisa e reutiliza o nome sem duplicar', async () => {
    for (const nome of modelos) {
      const criado = await api.post('/api/produtos').send({ nome });
      expect(criado.status).toBe(201);
      expect(criado.body.nome).toBe(nome);
      expect(criado.body.referencia).toBeNull();
    }

    const bermuda = await api.post('/api/produtos').send({
      nome: 'Bermuda dry',
      referencia: '10234',
      valor_costura: 8,
      cores: ['Preto', 'Branco'],
      tamanhos: ['P', 'M', 'G', 'GG'],
    });
    expect(bermuda.status).toBe(201);
    expect(bermuda.body).toMatchObject({
      nome: 'Bermuda dry',
      referencia: '10234',
      sku: '10234',
      valor_costura: 8,
      cores: ['Preto', 'Branco'],
      tamanhos: ['P', 'M', 'G', 'GG'],
    });

    const busca = await api.get('/api/produtos').query({ q: 'bermuda', por_pagina: 20 });
    expect(busca.body.total).toBe(2);
    expect(busca.body.data.map((item: { nome: string }) => item.nome)).toEqual(
      expect.arrayContaining(['Bermuda', 'Bermuda dry']),
    );

    const repetido = await api.post('/api/produtos').send({
      nome: ' bermuda ',
      referencia: '99999',
    });
    expect(repetido.status).toBe(409);
    expect(repetido.body.erro).toBe(
      'Já existe um produto com este nome. Selecione o cadastro existente.',
    );
    expect(repetido.body.produto_id).toBe(
      busca.body.data.find((item: { nome: string }) => item.nome === 'Bermuda').id,
    );

    const lista = await api.get('/api/produtos').query({ q: 'Bermuda', status: 'ativo', por_pagina: 20 });
    expect(lista.body.data.filter((item: { nome: string }) => item.nome === 'Bermuda')).toHaveLength(1);
  });

  it('edita o nome, inativa e mantém o produto para a empresa', async () => {
    const criado = await api.post('/api/produtos').send({ nome: 'Regata', referencia: '77' });
    const editado = await api.patch(`/api/produtos/${criado.body.id}`).send({ nome: 'Regata cavada' });
    expect(editado.status).toBe(200);
    expect(editado.body.nome).toBe('Regata cavada');
    expect(editado.body.referencia).toBe('77');

    const antigo = await api.get('/api/produtos').query({ q: 'Regata cavada' });
    expect(antigo.body.total).toBe(1);

    const conflito = await api.post('/api/produtos').send({ nome: 'Bermuda' });
    await api.post('/api/produtos').send({ nome: 'Manga longa' });
    const renomear = await api
      .patch(`/api/produtos/${conflito.body.id}`)
      .send({ nome: 'manga longa' });
    expect(renomear.status).toBe(409);
    expect((await api.get(`/api/produtos/${conflito.body.id}`)).body.nome).toBe('Bermuda');

    const inativo = await api
      .patch(`/api/produtos/${criado.body.id}/status`)
      .send({ status: 'inativo' });
    expect(inativo.status).toBe(200);
    expect(inativo.body.status).toBe('inativo');
    const ativos = await api.get('/api/produtos').query({ status: 'ativo', q: 'Regata' });
    expect(ativos.body.total).toBe(0);
    const todos = await api.get('/api/produtos').query({ q: 'Regata cavada' });
    expect(todos.body.data[0].status).toBe('inativo');
    expect((await api.get(`/api/produtos/${criado.body.id}`)).status).toBe(200);
  });

  it('isola o cadastro entre empresas e deixa a produção cadastrar sem excluir', async () => {
    const bermuda = await api.post('/api/produtos').send({ nome: 'Bermuda', referencia: '10234' });
    const outra = await autenticarNovaEmpresa(app, { email: 'outra-modelo@gestao.local' });
    expect((await outra.api.get('/api/produtos')).body.total).toBe(0);
    expect((await outra.api.get(`/api/produtos/${bermuda.body.id}`)).status).toBe(404);

    const mesma = await outra.api.post('/api/produtos').send({ nome: 'Bermuda', referencia: '555' });
    expect(mesma.status).toBe(201);
    expect(mesma.body.id).not.toBe(bermuda.body.id);
    expect((await api.get('/api/produtos').query({ q: 'Bermuda' })).body.total).toBe(1);
    expect((await outra.api.get('/api/produtos').query({ q: 'Bermuda' })).body.data[0].referencia).toBe(
      '555',
    );

    const producao = await autenticarPapel(app, api, 'producao');
    const novo = await producao.post('/api/produtos').send({ nome: 'Manga longa' });
    expect(novo.status).toBe(201);
    const editado = await producao.patch(`/api/produtos/${novo.body.id}`).send({ nome: 'Manga longa premium' });
    expect(editado.status).toBe(200);
    const inativo = await producao
      .patch(`/api/produtos/${novo.body.id}/status`)
      .send({ status: 'inativo' });
    expect(inativo.status).toBe(200);
    expect((await producao.delete(`/api/produtos/${novo.body.id}`)).status).toBe(403);
    expect((await outra.api.get(`/api/produtos/${novo.body.id}`)).status).toBe(404);
  });

  it('sugere os dados do produto na OP e permite ajustá-los sem alterar o cadastro', async () => {
    const produto = await api.post('/api/produtos').send({
      nome: 'Bermuda',
      referencia: '10234',
      valor_costura: 8,
      cores: ['Preto', 'Branco'],
      tamanhos: ['P', 'M', 'G', 'GG'],
    });
    const tecido = await api.post('/api/materias-primas').send({
      nome: 'Helanca',
      tipo: 'tecido',
      unidade: 'KG',
      custo: 20,
    });
    const ficha = await api.put('/api/ordens/ficha-tecnica').send({
      produto_id: produto.body.id,
      itens: [{ materia_prima_id: tecido.body.id, quantidade: 0.2 }],
    });
    expect(ficha.status).toBe(200);

    const sugerida = await api.post('/api/ordens').send({
      cliente: 'Loja Grade',
      produto_id: produto.body.id,
      quantidade: 150,
      status: 'planejada',
      distribuicao: produto.body.variantes.map((item: { id: number }) => ({
        variante_id: item.id,
        quantidade: 0,
      })),
    });
    expect(sugerida.status).toBe(400);

    const distribuicao = produto.body.variantes.map((item: { id: number; cor: string; tamanho: string }) => ({
      variante_id: item.id,
      quantidade: item.cor === 'Preto' || item.cor === 'Branco' ? (item.tamanho === 'GG' ? 25 : item.tamanho === 'P' ? 10 : 20) : 0,
    }));
    const ordem = await api.post('/api/ordens').send({
      cliente: 'Loja Grade',
      produto_id: produto.body.id,
      quantidade: 150,
      status: 'planejada',
      distribuicao,
    });
    expect(ordem.status).toBe(201);
    expect(ordem.body).toMatchObject({
      produto: 'Bermuda',
      referencia: '10234',
      valor_costura: 8,
      quantidade: 150,
    });
    expect(ordem.body.requisitos).toEqual([
      expect.objectContaining({ materia_prima_id: tecido.body.id, quantidade_unitaria: 0.2 }),
    ]);

    const ajustada = await api.post('/api/ordens').send({
      cliente: 'Loja Grade',
      produto_id: produto.body.id,
      quantidade: 8,
      referencia: '10235',
      valor_costura: 9.5,
      status: 'planejada',
      distribuicao: produto.body.variantes
        .filter((item: { cor: string; tamanho: string }) => item.cor === 'Preto' && item.tamanho === 'M')
        .map((item: { id: number }) => ({ variante_id: item.id, quantidade: 8 })),
      requisitos: [{ materia_prima_id: tecido.body.id, quantidade: 0.4 }],
    });
    expect(ajustada.status).toBe(201);
    expect(ajustada.body.referencia).toBe('10235');
    expect(ajustada.body.valor_costura).toBe(9.5);
    expect(ajustada.body.requisitos[0].quantidade_unitaria).toBe(0.4);

    const cadastro = await api.get(`/api/produtos/${produto.body.id}`);
    expect(cadastro.body).toMatchObject({
      nome: 'Bermuda',
      referencia: '10234',
      valor_costura: 8,
    });
    const fichaDepois = await api.get('/api/ordens/ficha-tecnica').query({ produto_id: produto.body.id });
    expect(fichaDepois.body.itens[0].quantidade).toBe(0.2);
  });
});
