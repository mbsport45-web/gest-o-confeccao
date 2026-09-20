import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';
import { createApp } from './app.js';
import { createDatabase, type AppDatabase } from './db.js';

const CNPJ = '11444777000161';

describe('API de compras', () => {
  let app: Express;
  let db: AppDatabase;

  beforeEach(() => {
    db = createDatabase(':memory:');
    app = createApp(db);
  });

  afterEach(() => {
    db.close();
  });

  async function criarFornecedor(nome = 'Fiação Norte') {
    const res = await request(app).post('/api/fornecedores').send({
      nome,
      cpf_cnpj: CNPJ,
      cidade: 'Recife',
      estado: 'PE',
      condicao_pagamento: '30 dias',
    });
    expect(res.status).toBe(201);
    return res.body as { id: number; codigo: string };
  }

  async function criarMateria() {
    const res = await request(app).post('/api/materias-primas').send({
      codigo: 'TEC-CP',
      nome: 'Malha Compra',
      tipo: 'tecido',
      unidade: 'KG',
      custo: 20,
      estoque_minimo: 5,
    });
    return res.body as { id: number };
  }

  it('lista fornecedores e compras vazias paginadas', async () => {
    const forn = await request(app).get('/api/fornecedores');
    expect(forn.status).toBe(200);
    expect(forn.body.total).toBe(0);
    const compras = await request(app).get('/api/compras');
    expect(compras.status).toBe(200);
    expect(compras.body).toMatchObject({ data: [], total: 0, pagina: 1 });
  });

  it('cria fornecedor com código automático e rejeita CNPJ inválido', async () => {
    const ok = await criarFornecedor();
    expect(ok.codigo).toBe('FOR-0001');
    const bad = await request(app).post('/api/fornecedores').send({
      nome: 'X',
      cpf_cnpj: '11111111111',
    });
    expect(bad.status).toBe(400);
  });

  it('cria compra em rascunho, edita itens e calcula totais', async () => {
    const fornecedor = await criarFornecedor();
    const materia = await criarMateria();
    const res = await request(app).post('/api/compras').send({
      fornecedor_id: fornecedor.id,
      desconto: 10,
      frete: 15,
      itens: [
        { materia_prima_id: materia.id, quantidade: 8, custo_unitario: 12.5 },
      ],
    });
    expect(res.status).toBe(201);
    expect(res.body.codigo).toBe('CP-0001');
    expect(res.body.status).toBe('rascunho');
    expect(res.body.subtotal).toBe(100);
    expect(res.body.total).toBe(105);
    expect(res.body.itens).toHaveLength(1);

    const item = res.body.itens[0];
    const patchItem = await request(app)
      .patch(`/api/compras/${res.body.id}/itens/${item.id}`)
      .send({ quantidade: 10 });
    expect(patchItem.status).toBe(200);
    expect(patchItem.body.subtotal).toBe(125);
    expect(patchItem.body.total).toBe(130);
  });

  it('abre a compra, gera conta a pagar e recebe no estoque', async () => {
    const fornecedor = await criarFornecedor();
    const materia = await criarMateria();
    const compra = await request(app).post('/api/compras').send({
      fornecedor_id: fornecedor.id,
      vencimento: '2099-12-01',
      itens: [{ materia_prima_id: materia.id, quantidade: 6, custo_unitario: 10 }],
    });
    const id = compra.body.id as number;

    const abrir = await request(app).patch(`/api/compras/${id}`).send({ status: 'aberta' });
    expect(abrir.status).toBe(200);
    expect(abrir.body.status).toBe('aberta');

    const pagar = await request(app)
      .get('/api/financeiro/lancamentos')
      .query({ tipo: 'pagar' });
    expect(pagar.body.total).toBe(1);
    expect(pagar.body.data[0]).toMatchObject({
      compra_id: id,
      valor: 60,
      status: 'pendente',
      fornecedor_id: fornecedor.id,
    });

    const receber = await request(app)
      .post(`/api/compras/${id}/receber`)
      .send({ itens: [{ item_id: compra.body.itens[0].id, quantidade: 6 }] });
    expect(receber.status).toBe(200);
    expect(receber.body.status).toBe('recebida');
    expect(receber.body.itens[0].quantidade_recebida).toBe(6);

    const estoque = await request(app).get('/api/estoque').query({ tipo: 'materia' });
    expect(estoque.body.total).toBe(1);
    expect(estoque.body.data[0].quantidade).toBe(6);
    expect(estoque.body.data[0].nome).toBe('Malha Compra');

    const hist = await request(app).get('/api/estoque/movimentos').query({ tipo: 'entrada' });
    expect(hist.body.total).toBeGreaterThanOrEqual(1);
    expect(hist.body.data[0].motivo).toMatch(/Compra CP-/);
  });

  it('aceita recebimento parcial e bloqueia quantidade maior que o pedido', async () => {
    const fornecedor = await criarFornecedor();
    const materia = await criarMateria();
    const compra = await request(app).post('/api/compras').send({
      fornecedor_id: fornecedor.id,
      status: 'aberta',
      itens: [{ materia_prima_id: materia.id, quantidade: 10, custo_unitario: 5 }],
    });
    const itemId = compra.body.itens[0].id;

    const extra = await request(app)
      .post(`/api/compras/${compra.body.id}/receber`)
      .send({ itens: [{ item_id: itemId, quantidade: 12 }] });
    expect(extra.status).toBe(400);

    const parcial = await request(app)
      .post(`/api/compras/${compra.body.id}/receber`)
      .send({ itens: [{ item_id: itemId, quantidade: 4 }] });
    expect(parcial.status).toBe(200);
    expect(parcial.body.status).toBe('parcial');

    const estoque = await request(app).get('/api/estoque').query({ tipo: 'materia' });
    expect(estoque.body.data[0].quantidade).toBe(4);
  });

  it('bloqueia transições inválidas, exclusão de aberta e edição após recebida', async () => {
    const fornecedor = await criarFornecedor();
    const materia = await criarMateria();
    const compra = await request(app).post('/api/compras').send({
      fornecedor_id: fornecedor.id,
      status: 'aberta',
      itens: [{ materia_prima_id: materia.id, quantidade: 2, custo_unitario: 8 }],
    });
    const id = compra.body.id;

    const delAberta = await request(app).delete(`/api/compras/${id}`);
    expect(delAberta.status).toBe(409);

    await request(app).post(`/api/compras/${id}/receber`).send({});
    const edit = await request(app).patch(`/api/compras/${id}`).send({ frete: 9 });
    expect(edit.status).toBe(409);

    const receberDeNovo = await request(app).post(`/api/compras/${id}/receber`).send({});
    expect(receberDeNovo.status).toBe(409);
  });

  it('filtra por status, fornecedor e período', async () => {
    const fornecedor = await criarFornecedor();
    const materia = await criarMateria();
    await request(app).post('/api/compras').send({
      fornecedor_id: fornecedor.id,
      data_emissao: '2026-01-10',
      itens: [{ materia_prima_id: materia.id, quantidade: 1, custo_unitario: 3 }],
    });
    await request(app).post('/api/compras').send({
      fornecedor_id: fornecedor.id,
      data_emissao: '2026-02-10',
      status: 'aberta',
      itens: [{ materia_prima_id: materia.id, quantidade: 1, custo_unitario: 3 }],
    });
    const rascunho = await request(app).get('/api/compras').query({ status: 'rascunho' });
    expect(rascunho.body.total).toBe(1);
    const periodo = await request(app)
      .get('/api/compras')
      .query({ de: '2026-02-01', ate: '2026-02-28' });
    expect(periodo.body.total).toBe(1);
    const busca = await request(app).get('/api/compras').query({ q: 'Norte', pagina: 1 });
    expect(busca.body.total).toBe(2);
  });

  it('impede excluir matéria-prima usada em compra e fornecedor com compras', async () => {
    const fornecedor = await criarFornecedor();
    const materia = await criarMateria();
    await request(app).post('/api/compras').send({
      fornecedor_id: fornecedor.id,
      itens: [{ materia_prima_id: materia.id, quantidade: 1, custo_unitario: 1 }],
    });
    const delMat = await request(app).delete(`/api/materias-primas/${materia.id}`);
    expect(delMat.status).toBe(409);
    const delFor = await request(app).delete(`/api/fornecedores/${fornecedor.id}`);
    expect(delFor.status).toBe(409);
  });

  it('não quebra clientes, produtos, estoque, OPs e etapas', async () => {
    const cliente = await request(app).post('/api/clientes').send({ nome: 'Loja Compras' });
    expect(cliente.status).toBe(201);
    const produto = await request(app).post('/api/produtos').send({
      nome: 'Camisa',
      sku: 'CAM-CP',
      cores: ['Azul'],
      tamanhos: ['M'],
    });
    expect(produto.status).toBe(201);
    const op = await request(app).post('/api/ordens').send({
      cliente: 'Loja Compras',
      produto: 'Camisa',
      tamanho: 'M',
      quantidade: 2,
    });
    expect(op.status).toBe(201);
    const fluxo = await request(app).post('/api/etapas/fluxo').send({ ordem_id: op.body.id });
    expect(fluxo.status).toBe(201);
    const estoque = await request(app).get('/api/estoque');
    expect(estoque.status).toBe(200);
  });
});
