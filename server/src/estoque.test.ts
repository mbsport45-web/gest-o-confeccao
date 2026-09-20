import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';
import { createApp } from './app.js';
import { createDatabase, type AppDatabase } from './db.js';

describe('API de estoque', () => {
  let app: Express;
  let db: AppDatabase;

  beforeEach(() => {
    db = createDatabase(':memory:');
    app = createApp(db);
  });

  afterEach(() => {
    db.close();
  });

  async function criarProdutoComVariante() {
    const produto = await request(app).post('/api/produtos').send({
      sku: 'CAM-EST',
      nome: 'Camiseta Estoque',
      estoque_minimo: 10,
      cores: ['Preto'],
      tamanhos: ['M', 'G'],
    });
    return produto.body as {
      id: number;
      variantes: Array<{ id: number; sku: string; tamanho: string }>;
    };
  }

  async function criarMateria() {
    const materia = await request(app).post('/api/materias-primas').send({
      codigo: 'TEC-EST',
      nome: 'Malha Estoque',
      tipo: 'tecido',
      unidade: 'KG',
      estoque_minimo: 20,
    });
    return materia.body as { id: number };
  }

  it('lista vazia paginada', async () => {
    const res = await request(app).get('/api/estoque');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      data: [],
      pagina: 1,
      por_pagina: 10,
      total: 0,
      total_paginas: 1,
    });
  });

  it('dá entrada em variante e calcula saldo', async () => {
    const produto = await criarProdutoComVariante();
    const variante = produto.variantes.find((v) => v.tamanho === 'M')!;
    const res = await request(app).post('/api/estoque/movimentos').send({
      tipo: 'entrada',
      quantidade: 40,
      variante_id: variante.id,
      motivo: 'Compra',
    });
    expect(res.status).toBe(201);
    expect(res.body.movimento).toMatchObject({
      tipo: 'entrada',
      quantidade: 40,
      saldo_anterior: 0,
      saldo_posterior: 40,
      variante_id: variante.id,
      produto_id: produto.id,
    });
    expect(res.body.saldo.quantidade).toBe(40);
    expect(res.body.saldo.abaixo_minimo).toBe(false);
    expect(res.body.saldo.codigo).toBe(variante.sku);
  });

  it('dá entrada em matéria-prima e lista saldo', async () => {
    const materia = await criarMateria();
    const mov = await request(app).post('/api/estoque/movimentos').send({
      tipo: 'entrada',
      quantidade: 12,
      materia_prima_id: materia.id,
    });
    expect(mov.status).toBe(201);
    expect(mov.body.saldo.tipo).toBe('materia');
    expect(mov.body.saldo.quantidade).toBe(12);
    expect(mov.body.saldo.abaixo_minimo).toBe(true);

    const lista = await request(app).get('/api/estoque').query({ tipo: 'materia' });
    expect(lista.body.total).toBe(1);
    expect(lista.body.data[0].nome).toBe('Malha Estoque');
  });

  it('registra saída, bloqueia estoque insuficiente e aceita ajuste', async () => {
    const produto = await criarProdutoComVariante();
    const variante = produto.variantes[0];
    await request(app).post('/api/estoque/movimentos').send({
      tipo: 'entrada',
      quantidade: 10,
      variante_id: variante.id,
    });

    const saida = await request(app).post('/api/estoque/movimentos').send({
      tipo: 'saida',
      quantidade: 4,
      variante_id: variante.id,
      motivo: 'OP 1',
    });
    expect(saida.status).toBe(201);
    expect(saida.body.saldo.quantidade).toBe(6);

    const insuficiente = await request(app).post('/api/estoque/movimentos').send({
      tipo: 'saida',
      quantidade: 20,
      variante_id: variante.id,
    });
    expect(insuficiente.status).toBe(409);
    expect(insuficiente.body.erro).toMatch(/insuficiente/);

    const ajuste = await request(app).post('/api/estoque/movimentos').send({
      tipo: 'ajuste',
      quantidade: 8,
      variante_id: variante.id,
      motivo: 'Inventário',
    });
    expect(ajuste.status).toBe(201);
    expect(ajuste.body.movimento.saldo_anterior).toBe(6);
    expect(ajuste.body.movimento.saldo_posterior).toBe(8);
    expect(ajuste.body.saldo.quantidade).toBe(8);
  });

  it('exige variante quando o produto tem grades', async () => {
    const produto = await criarProdutoComVariante();
    const res = await request(app).post('/api/estoque/movimentos').send({
      tipo: 'entrada',
      quantidade: 5,
      produto_id: produto.id,
    });
    expect(res.status).toBe(400);
    expect(res.body.erro).toMatch(/variantes/);
  });

  it('permite saldo em produto sem variante', async () => {
    const produto = await request(app).post('/api/produtos').send({
      sku: 'SIMPLES',
      nome: 'Produto simples',
      estoque_minimo: 3,
    });
    const res = await request(app).post('/api/estoque/movimentos').send({
      tipo: 'entrada',
      quantidade: 2,
      produto_id: produto.body.id,
    });
    expect(res.status).toBe(201);
    expect(res.body.saldo.tipo).toBe('produto');
    expect(res.body.saldo.abaixo_minimo).toBe(true);
  });

  it('rejeita payload inválido', async () => {
    const res = await request(app).post('/api/estoque/movimentos').send({
      tipo: 'entrada',
      quantidade: 0,
      variante_id: 1,
      materia_prima_id: 1,
    });
    expect(res.status).toBe(400);
  });

  it('busca, filtra abaixo do mínimo e pagina histórico', async () => {
    const produto = await criarProdutoComVariante();
    const m = produto.variantes.find((v) => v.tamanho === 'M')!;
    const g = produto.variantes.find((v) => v.tamanho === 'G')!;
    const materia = await criarMateria();

    await request(app).post('/api/estoque/movimentos').send({
      tipo: 'entrada',
      quantidade: 50,
      variante_id: m.id,
    });
    await request(app).post('/api/estoque/movimentos').send({
      tipo: 'entrada',
      quantidade: 2,
      variante_id: g.id,
    });
    await request(app).post('/api/estoque/movimentos').send({
      tipo: 'entrada',
      quantidade: 5,
      materia_prima_id: materia.id,
    });

    const busca = await request(app).get('/api/estoque').query({ q: 'Camiseta' });
    expect(busca.body.total).toBe(2);

    const baixo = await request(app).get('/api/estoque').query({ abaixo_minimo: 'true' });
    expect(baixo.body.total).toBe(2);

    const hist = await request(app)
      .get('/api/estoque/movimentos')
      .query({ pagina: 1, por_pagina: 2, tipo: 'entrada' });
    expect(hist.status).toBe(200);
    expect(hist.body.data).toHaveLength(2);
    expect(hist.body.total).toBe(3);
    expect(hist.body.total_paginas).toBe(2);
  });

  it('detalha saldo com histórico de movimentos', async () => {
    const materia = await criarMateria();
    await request(app).post('/api/estoque/movimentos').send({
      tipo: 'entrada',
      quantidade: 10,
      materia_prima_id: materia.id,
    });
    const saida = await request(app).post('/api/estoque/movimentos').send({
      tipo: 'saida',
      quantidade: 3,
      materia_prima_id: materia.id,
    });
    const id = saida.body.saldo.id;
    const detalhe = await request(app).get(`/api/estoque/${id}`);
    expect(detalhe.status).toBe(200);
    expect(detalhe.body.quantidade).toBe(7);
    expect(detalhe.body.movimentos).toHaveLength(2);
    expect(detalhe.body.movimentos[0].tipo).toBe('saida');
  });

  it('bloqueia exclusão de matéria-prima com movimento de estoque', async () => {
    const materia = await criarMateria();
    await request(app).post('/api/estoque/movimentos').send({
      tipo: 'entrada',
      quantidade: 1,
      materia_prima_id: materia.id,
    });
    const del = await request(app).delete(`/api/materias-primas/${materia.id}`);
    expect(del.status).toBe(409);
  });

  it('não altera contratos de clientes, produtos e matérias-primas', async () => {
    const cliente = await request(app).post('/api/clientes').send({ nome: 'Loja Estoque' });
    expect(cliente.status).toBe(201);
    const produto = await request(app).post('/api/produtos').send({
      nome: 'Calça',
      sku: 'CAL-EST',
    });
    expect(produto.status).toBe(201);
    const materia = await request(app).post('/api/materias-primas').send({
      nome: 'Linha 120',
      tipo: 'linha',
    });
    expect(materia.status).toBe(201);
    const ordem = await request(app).post('/api/ordens').send({
      cliente: 'Loja Estoque',
      produto: 'Calça',
      tamanho: '42',
      quantidade: 3,
    });
    expect(ordem.status).toBe(201);
    expect(ordem.body.status).toBe('pendente');
  });
});
