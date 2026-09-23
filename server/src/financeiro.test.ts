import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from './app.js';
import { createDatabase, type AppDatabase } from './db.js';
import { autenticar, type TestApi } from './httpTest.js';

describe('API financeira', () => {
  let db: AppDatabase;
  let api: TestApi;

  beforeEach(async () => {
    db = createDatabase(':memory:');
    api = await autenticar(createApp(db));
  });

  afterEach(() => {
    db.close();
  });

  async function compraAberta() {
    const forn = await api.post('/api/fornecedores').send({ nome: 'Tecido Sul' });
    const mat = await api.post('/api/materias-primas').send({
      nome: 'Linha Financeiro',
      tipo: 'linha',
      custo: 4,
    });
    const compra = await api.post('/api/compras').send({
      fornecedor_id: forn.body.id,
      status: 'aberta',
      vencimento: '2099-01-15',
      itens: [{ materia_prima_id: mat.body.id, quantidade: 5, custo_unitario: 8 }],
    });
    return { forn: forn.body, compra: compra.body };
  }

  it('lista categorias padrão', async () => {
    const res = await api.get('/api/financeiro/categorias');
    expect(res.status).toBe(200);
    expect(res.body.total).toBeGreaterThanOrEqual(5);
    expect(res.body.data.some((c: { nome: string }) => c.nome === 'Compras')).toBe(true);
  });

  it('cria contas a receber e paga lançamento da compra', async () => {
    const { compra } = await compraAberta();
    const lista = await api.get('/api/financeiro/lancamentos').query({ tipo: 'pagar' });
    expect(lista.body.total).toBe(1);
    const id = lista.body.data[0].id as number;

    const pagar = await api
      .patch(`/api/financeiro/lancamentos/${id}`)
      .send({ status: 'pago' });
    expect(pagar.status).toBe(200);
    expect(pagar.body.status).toBe('pago');
    expect(pagar.body.data_pagamento).toBeTruthy();
    expect(pagar.body.compra_id).toBe(compra.id);

    const cliente = await api.post('/api/clientes').send({ nome: 'Loja Receber' });
    const receber = await api.post('/api/financeiro/lancamentos').send({
      tipo: 'receber',
      descricao: 'Pedido loja',
      valor: 250,
      cliente_id: cliente.body.id,
      vencimento: '2099-06-01',
    });
    expect(receber.status).toBe(201);
    expect(receber.body.status).toBe('pendente');

    const baixar = await api
      .patch(`/api/financeiro/lancamentos/${receber.body.id}`)
      .send({ status: 'recebido' });
    expect(baixar.body.status).toBe('recebido');

    const resumo = await api.get('/api/financeiro/resumo');
    expect(resumo.status).toBe(200);
    expect(resumo.body.realizado_pagar).toBe(40);
    expect(resumo.body.realizado_receber).toBe(250);
    expect(resumo.body.saldo).toBe(210);
  });

  it('marca vencido sem gravar mock e bloqueia exclusão de lançamento de compra', async () => {
    await compraAberta();
    db.prepare(
      `UPDATE financeiro_lancamentos SET vencimento = '2020-01-01' WHERE tipo = 'pagar'`,
    ).run();
    const lista = await api.get('/api/financeiro/lancamentos').query({ status: 'vencido' });
    expect(lista.body.total).toBe(1);
    expect(lista.body.data[0].status).toBe('vencido');

    const id = lista.body.data[0].id;
    const del = await api.delete(`/api/financeiro/lancamentos/${id}`);
    expect(del.status).toBe(409);
  });

  it('filtra por categoria, tipo e período', async () => {
    const cats = await api.get('/api/financeiro/categorias');
    const vendas = cats.body.data.find((c: { nome: string }) => c.nome === 'Vendas');
    await api.post('/api/financeiro/lancamentos').send({
      tipo: 'receber',
      categoria_id: vendas.id,
      descricao: 'Venda avulsa',
      valor: 80,
      vencimento: '2026-03-10',
    });
    const filtro = await api.get('/api/financeiro/lancamentos').query({
      categoria_id: vendas.id,
      de: '2026-03-01',
      ate: '2026-03-31',
    });
    expect(filtro.body.total).toBe(1);
  });

  it('rejeita status incompatível com o tipo', async () => {
    const res = await api.post('/api/financeiro/lancamentos').send({
      tipo: 'pagar',
      descricao: 'Errado',
      valor: 10,
      status: 'recebido',
    });
    expect(res.status).toBe(400);
  });
});
