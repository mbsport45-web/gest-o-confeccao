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

  it('resume contas a pagar por categoria só com lançamentos em aberto, sem duplicar', async () => {
    const cats = await api.get('/api/financeiro/categorias');
    const nomes = (cats.body.data as Array<{ nome: string }>).map((c) => c.nome);
    expect(nomes).toEqual(
      expect.arrayContaining([
        'Tecidos',
        'Costureiros',
        'Funcionários',
        'Aluguéis',
        'Conta de luz',
        'Contas de água',
        'IPTU',
        'Compras',
      ]),
    );
    const tecidos = cats.body.data.find((c: { nome: string }) => c.nome === 'Tecidos');
    const luz = cats.body.data.find((c: { nome: string }) => c.nome === 'Conta de luz');
    const compras = cats.body.data.find((c: { nome: string }) => c.nome === 'Compras');

    const vazio = await api.get('/api/financeiro/resumo');
    expect(vazio.body.a_pagar.tecidos).toEqual(
      expect.objectContaining({ valor: 0, quantidade: 0, categoria_id: tecidos.id }),
    );
    expect(vazio.body.a_pagar.luz.quantidade).toBe(0);
    expect(vazio.body.a_pagar.iptu.valor).toBe(0);

    const forn = await api.post('/api/fornecedores').send({ nome: 'Malharia Norte' });
    await api.post('/api/financeiro/lancamentos').send({
      tipo: 'pagar',
      categoria_id: tecidos.id,
      descricao: 'Malha PV',
      valor: 150,
      vencimento: '2099-04-10',
      fornecedor_id: forn.body.id,
    });
    await api.post('/api/financeiro/lancamentos').send({
      tipo: 'pagar',
      categoria_id: tecidos.id,
      descricao: 'Ribana',
      valor: 50,
      vencimento: '2099-04-12',
    });
    await api.post('/api/financeiro/lancamentos').send({
      tipo: 'pagar',
      categoria_id: tecidos.id,
      descricao: 'Malha atrasada',
      valor: 10,
      vencimento: '2020-01-01',
    });
    const pago = await api.post('/api/financeiro/lancamentos').send({
      tipo: 'pagar',
      categoria_id: tecidos.id,
      descricao: 'Já pago',
      valor: 80,
      status: 'pago',
    });
    expect(pago.status).toBe(201);
    await api.post('/api/financeiro/lancamentos').send({
      tipo: 'pagar',
      categoria_id: luz.id,
      descricao: 'Energia março',
      valor: 220,
      vencimento: '2099-04-05',
    });
    await api.post('/api/financeiro/lancamentos').send({
      tipo: 'pagar',
      categoria_id: compras.id,
      descricao: 'Outra compra',
      valor: 30,
    });
    await api.post('/api/financeiro/lancamentos').send({
      tipo: 'receber',
      categoria_id: tecidos.id,
      descricao: 'Não deve contar',
      valor: 999,
    });

    const resumo = await api.get('/api/financeiro/resumo');
    expect(resumo.body.a_pagar.tecidos).toEqual(
      expect.objectContaining({ valor: 210, quantidade: 3, categoria_id: tecidos.id }),
    );
    expect(resumo.body.a_pagar.luz).toEqual(
      expect.objectContaining({ valor: 220, quantidade: 1, categoria_id: luz.id }),
    );
    expect(resumo.body.a_pagar.costureiros.quantidade).toBe(0);
    expect(resumo.body.a_pagar.alugueis.valor).toBe(0);

    const abertos = await api.get('/api/financeiro/lancamentos').query({
      tipo: 'pagar',
      status: 'aberto',
      categoria_id: tecidos.id,
      por_pagina: 100,
    });
    expect(abertos.body.total).toBe(3);
    expect(abertos.body.data.map((l: { descricao: string }) => l.descricao).sort()).toEqual([
      'Malha PV',
      'Malha atrasada',
      'Ribana',
    ]);
    expect(abertos.body.data.some((l: { status: string; descricao: string }) => l.descricao === 'Malha atrasada' && l.status === 'vencido')).toBe(true);

    const baixar = await api
      .patch(`/api/financeiro/lancamentos/${abertos.body.data.find((l: { descricao: string }) => l.descricao === 'Malha PV').id}`)
      .send({ status: 'pago' });
    expect(baixar.status).toBe(200);
    const depois = await api.get('/api/financeiro/resumo');
    expect(depois.body.a_pagar.tecidos).toEqual(expect.objectContaining({ valor: 60, quantidade: 2 }));
    expect(depois.body.contas_pagar).toBe(310);
  });
});
