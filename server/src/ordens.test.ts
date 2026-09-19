import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';
import { createApp } from './app.js';
import { createDatabase, type AppDatabase } from './db.js';

describe('API de ordens de produção', () => {
  let app: Express;
  let db: AppDatabase;

  beforeEach(() => {
    db = createDatabase(':memory:');
    app = createApp(db);
  });

  afterEach(() => {
    db.close();
  });

  it('responde ao health check', async () => {
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
  });

  it('começa sem ordens', async () => {
    const res = await request(app).get('/api/ordens');
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  it('cria uma ordem de produção', async () => {
    const res = await request(app).post('/api/ordens').send({
      cliente: 'Loja Central',
      produto: 'Camiseta Polo',
      tamanho: 'M',
      quantidade: 120,
    });

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      cliente: 'Loja Central',
      produto: 'Camiseta Polo',
      tamanho: 'M',
      quantidade: 120,
      status: 'pendente',
    });
    expect(res.body.id).toBeGreaterThan(0);
  });

  it('persiste e lista ordens criadas', async () => {
    await request(app).post('/api/ordens').send({
      cliente: 'Loja Central',
      produto: 'Camiseta Polo',
      tamanho: 'M',
      quantidade: 120,
    });

    const res = await request(app).get('/api/ordens');
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].cliente).toBe('Loja Central');
  });

  it('rejeita dados inválidos', async () => {
    const res = await request(app).post('/api/ordens').send({
      cliente: '',
      produto: 'Camiseta',
      tamanho: 'G',
      quantidade: -5,
    });

    expect(res.status).toBe(400);
    expect(res.body.erro).toBe('Dados inválidos');
  });

  it('atualiza o status de uma ordem', async () => {
    const criada = await request(app).post('/api/ordens').send({
      cliente: 'Confecções ABC',
      produto: 'Calça Jeans',
      tamanho: '42',
      quantidade: 50,
    });

    const res = await request(app)
      .patch(`/api/ordens/${criada.body.id}`)
      .send({ status: 'em_producao' });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('em_producao');
  });

  it('remove uma ordem', async () => {
    const criada = await request(app).post('/api/ordens').send({
      cliente: 'Confecções ABC',
      produto: 'Calça Jeans',
      tamanho: '42',
      quantidade: 50,
    });

    const del = await request(app).delete(`/api/ordens/${criada.body.id}`);
    expect(del.status).toBe(204);

    const res = await request(app).get('/api/ordens');
    expect(res.body).toHaveLength(0);
  });

  it('retorna 404 para ordem inexistente', async () => {
    const res = await request(app).get('/api/ordens/9999');
    expect(res.status).toBe(404);
  });
});
