import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';
import { createApp } from './app.js';
import { createDatabase, type AppDatabase } from './db.js';

describe('API de relatórios', () => {
  let app: Express;
  let db: AppDatabase;

  beforeEach(async () => {
    db = createDatabase(':memory:');
    app = createApp(db);

    const forn = await request(app).post('/api/fornecedores').send({ nome: 'Fornecedor Rel' });
    const mat = await request(app).post('/api/materias-primas').send({
      codigo: 'TEC-REL',
      nome: 'Malha Relatório',
      tipo: 'tecido',
      custo: 10,
      estoque_minimo: 50,
    });
    const compra = await request(app).post('/api/compras').send({
      fornecedor_id: forn.body.id,
      status: 'aberta',
      data_emissao: '2026-04-01',
      itens: [{ materia_prima_id: mat.body.id, quantidade: 12, custo_unitario: 10 }],
    });
    await request(app).post(`/api/compras/${compra.body.id}/receber`).send({});
    await request(app).post('/api/ordens').send({
      cliente: 'Loja Rel',
      produto: 'Polo Rel',
      tamanho: 'M',
      quantidade: 4,
    });
  });

  afterEach(() => {
    db.close();
  });

  it('relatório de estoque usa saldo real e aponta baixo do mínimo', async () => {
    const res = await request(app).get('/api/relatorios/estoque');
    expect(res.status).toBe(200);
    expect(res.body.total).toBeGreaterThanOrEqual(1);
    expect(res.body.totais.abaixo_minimo).toBeGreaterThanOrEqual(1);
    expect(res.body.data[0].quantidade).toBe(12);
  });

  it('relatório de compras filtra período e soma total', async () => {
    const res = await request(app)
      .get('/api/relatorios/compras')
      .query({ de: '2026-04-01', ate: '2026-04-30' });
    expect(res.body.total).toBe(1);
    expect(res.body.totais.valor).toBe(120);
    expect(res.body.itens[0].nome).toBe('Malha Relatório');
  });

  it('relatório financeiro, produção, custos e resumo leem o banco', async () => {
    const fin = await request(app).get('/api/relatorios/financeiro');
    expect(fin.status).toBe(200);
    expect(fin.body.totais.pagar).toBe(120);
    expect(fin.body.totais.pendente).toBe(120);

    const prod = await request(app).get('/api/relatorios/producao');
    expect(prod.body.total).toBeGreaterThanOrEqual(1);
    expect(prod.body.data[0].produto).toBe('Polo Rel');

    const custos = await request(app).get('/api/relatorios/custos').query({ de: '2026-04-01' });
    expect(custos.body.totais.compras).toBe(120);
    expect(custos.body.totais.estoque_materiais).toBe(120);

    const resumo = await request(app).get('/api/relatorios/resumo');
    expect(resumo.body.compras).toBe(1);
    expect(resumo.body.compras_total).toBe(120);
    expect(resumo.body.estoque_baixo).toBeGreaterThanOrEqual(1);
    expect(resumo.body.ordens).toBeGreaterThanOrEqual(1);
  });

  it('exporta CSV de compras', async () => {
    const res = await request(app).get('/api/relatorios/compras').query({ formato: 'csv' });
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/csv/);
    expect(res.text).toMatch(/CP-0001/);
    expect(res.text).toMatch(/Fornecedor Rel/);
  });

  it('pagina relatório de produção', async () => {
    const res = await request(app).get('/api/relatorios/producao').query({
      pagina: 1,
      por_pagina: 1,
    });
    expect(res.body.data).toHaveLength(1);
    expect(res.body.pagina).toBe(1);
  });
});
