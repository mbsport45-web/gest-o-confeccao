import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from './app.js';
import { createDatabase, type AppDatabase } from './db.js';
import { autenticar, type TestApi } from './httpTest.js';

describe('API de relatórios', () => {
  let db: AppDatabase;
  let api: TestApi;

  beforeEach(async () => {
    db = createDatabase(':memory:');
    api = await autenticar(createApp(db));

    const forn = await api.post('/api/fornecedores').send({ nome: 'Fornecedor Rel' });
    const mat = await api.post('/api/materias-primas').send({
      codigo: 'TEC-REL',
      nome: 'Malha Relatório',
      tipo: 'tecido',
      custo: 10,
      estoque_minimo: 50,
    });
    const compra = await api.post('/api/compras').send({
      fornecedor_id: forn.body.id,
      status: 'aberta',
      data_emissao: '2026-04-01',
      itens: [{ materia_prima_id: mat.body.id, quantidade: 12, custo_unitario: 10 }],
    });
    await api.post(`/api/compras/${compra.body.id}/receber`).send({});
    await api.post('/api/ordens').send({
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
    const res = await api.get('/api/relatorios/estoque');
    expect(res.status).toBe(200);
    expect(res.body.total).toBeGreaterThanOrEqual(1);
    expect(res.body.totais.abaixo_minimo).toBeGreaterThanOrEqual(1);
    expect(res.body.data[0].quantidade).toBe(12);
  });

  it('relatório de compras filtra período e soma total', async () => {
    const res = await api
      .get('/api/relatorios/compras')
      .query({ de: '2026-04-01', ate: '2026-04-30' });
    expect(res.body.total).toBe(1);
    expect(res.body.totais.valor).toBe(120);
    expect(res.body.itens[0].nome).toBe('Malha Relatório');
  });

  it('relatório financeiro, produção, custos e resumo leem o banco', async () => {
    const fin = await api.get('/api/relatorios/financeiro');
    expect(fin.status).toBe(200);
    expect(fin.body.totais.pagar).toBe(120);
    expect(fin.body.totais.pendente).toBe(120);

    const prod = await api.get('/api/relatorios/producao');
    expect(prod.body.total).toBeGreaterThanOrEqual(1);
    expect(prod.body.data[0].produto).toBe('Polo Rel');

    const custos = await api.get('/api/relatorios/custos').query({ de: '2026-04-01' });
    expect(custos.body.totais.compras).toBe(120);
    expect(custos.body.totais.estoque_materiais).toBe(120);

    const resumo = await api.get('/api/relatorios/resumo');
    expect(resumo.body.compras).toBe(1);
    expect(resumo.body.compras_total).toBe(120);
    expect(resumo.body.estoque_baixo).toBeGreaterThanOrEqual(1);
    expect(resumo.body.ordens).toBeGreaterThanOrEqual(1);
    expect(resumo.body.vendas).toBe(0);
    expect(resumo.body.vendas_total).toBe(0);
  });

  it('exporta CSV de compras', async () => {
    const res = await api.get('/api/relatorios/compras').query({ formato: 'csv' });
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/csv/);
    expect(res.text).toMatch(/CP-0001/);
    expect(res.text).toMatch(/Fornecedor Rel/);
  });

  it('pagina relatório de produção', async () => {
    const res = await api.get('/api/relatorios/producao').query({
      pagina: 1,
      por_pagina: 1,
    });
    expect(res.body.data).toHaveLength(1);
    expect(res.body.pagina).toBe(1);
  });

  async function seedPedidos() {
    const clienteA = await api.post('/api/clientes').send({
      nome: 'Loja Alfa',
      cidade: 'Recife',
      estado: 'PE',
    });
    const clienteB = await api.post('/api/clientes').send({
      nome: 'Loja Beta',
      cidade: 'Olinda',
      estado: 'PE',
    });
    const produto = await api.post('/api/produtos').send({
      sku: 'CAM-REL',
      nome: 'Camisa Relatório',
      cores: ['Azul'],
      tamanhos: ['M'],
      preco_venda: 50,
    });
    const variante = (produto.body.variantes as Array<{ id: number }>)[0];
    const pedidoAbril = await api.post('/api/pedidos').send({
      cliente_id: clienteA.body.id,
      data_pedido: '2026-04-10',
      status: 'aberto',
      itens: [
        {
          produto_id: produto.body.id,
          variante_id: variante.id,
          quantidade: 2,
          preco_unitario: 50,
        },
      ],
    });
    await api.patch(`/api/pedidos/${pedidoAbril.body.id}`).send({ status: 'confirmado' });
    await api.patch(`/api/pedidos/${pedidoAbril.body.id}`).send({ status: 'faturado' });
    const pedidoMaio = await api.post('/api/pedidos').send({
      cliente_id: clienteB.body.id,
      data_pedido: '2026-05-02',
      status: 'aberto',
      itens: [
        {
          produto_id: produto.body.id,
          variante_id: variante.id,
          quantidade: 3,
          preco_unitario: 40,
        },
      ],
    });
    const pedidoCancelado = await api.post('/api/pedidos').send({
      cliente_id: clienteA.body.id,
      data_pedido: '2026-04-20',
      status: 'aberto',
      itens: [
        {
          produto_id: produto.body.id,
          variante_id: variante.id,
          quantidade: 8,
          preco_unitario: 50,
        },
      ],
    });
    await api.patch(`/api/pedidos/${pedidoCancelado.body.id}`).send({ status: 'cancelado' });
    return { clienteA, clienteB, produto, pedidoAbril, pedidoMaio, pedidoCancelado };
  }

  it('relatório de vendas soma totais, agrupa e exclui cancelados por padrão', async () => {
    await seedPedidos();

    const res = await api.get('/api/relatorios/vendas');
    expect(res.status).toBe(200);
    expect(res.body.totais.pedidos).toBe(2);
    expect(res.body.totais.vendas).toBe(220);
    expect(res.body.totais.quantidade).toBe(5);
    expect(res.body.por_periodo).toEqual([
      { periodo: '2026-04', pedidos: 1, total: 100 },
      { periodo: '2026-05', pedidos: 1, total: 120 },
    ]);
    expect(res.body.por_produto[0]).toMatchObject({
      nome: 'Camisa Relatório',
      sku: 'CAM-REL',
      quantidade: 5,
      pedidos: 2,
      total: 220,
    });
    expect(res.body.por_cliente).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ nome: 'Loja Alfa', pedidos: 1, total: 100 }),
        expect.objectContaining({ nome: 'Loja Beta', pedidos: 1, total: 120 }),
      ]),
    );
    expect(res.body.data.map((d: { codigo: string }) => d.codigo)).toEqual(['PV-0002', 'PV-0001']);

    const abril = await api
      .get('/api/relatorios/vendas')
      .query({ de: '2026-04-01', ate: '2026-04-30' });
    expect(abril.body.totais.pedidos).toBe(1);
    expect(abril.body.totais.vendas).toBe(100);
    expect(abril.body.por_periodo).toEqual([{ periodo: '2026-04', pedidos: 1, total: 100 }]);

    const faturado = await api.get('/api/relatorios/vendas').query({ status: 'faturado' });
    expect(faturado.body.totais.pedidos).toBe(1);
    expect(faturado.body.data[0].codigo).toBe('PV-0001');

    const cancelado = await api.get('/api/relatorios/vendas').query({ status: 'cancelado' });
    expect(cancelado.body.totais.pedidos).toBe(1);
    expect(cancelado.body.totais.vendas).toBe(400);
    expect(cancelado.body.data[0].codigo).toBe('PV-0003');

    const resumo = await api.get('/api/relatorios/resumo').query({ de: '2026-04-01', ate: '2026-05-31' });
    expect(resumo.body.vendas).toBe(2);
    expect(resumo.body.vendas_total).toBe(220);
  });

  it('exporta CSV de vendas e rejeita status inválido', async () => {
    await seedPedidos();
    const res = await api.get('/api/relatorios/vendas').query({ formato: 'csv' });
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/csv/);
    expect(res.text).toMatch(/PV-0001/);
    expect(res.text).toMatch(/Loja Alfa/);
    expect(res.text).not.toMatch(/PV-0003/);

    const invalido = await api.get('/api/relatorios/vendas').query({ status: 'inexistente' });
    expect(invalido.status).toBe(400);
  });
});
