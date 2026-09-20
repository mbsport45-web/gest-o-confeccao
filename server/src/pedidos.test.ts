import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';
import { createApp } from './app.js';
import { createDatabase, type AppDatabase } from './db.js';

describe('API de pedidos de venda', () => {
  let app: Express;
  let db: AppDatabase;

  beforeEach(() => {
    db = createDatabase(':memory:');
    app = createApp(db);
  });

  afterEach(() => {
    db.close();
  });

  async function seed() {
    const cliente = await request(app).post('/api/clientes').send({
      nome: 'Loja Pedido',
      cidade: 'Recife',
      estado: 'PE',
    });
    const produto = await request(app).post('/api/produtos').send({
      sku: 'CAM-PV',
      nome: 'Camisa Pedido',
      cores: ['Azul'],
      tamanhos: ['M', 'G'],
      preco_venda: 89.9,
    });
    const variante = (produto.body.variantes as Array<{ id: number; tamanho: string }>).find(
      (v) => v.tamanho === 'M',
    )!;
    return {
      cliente: cliente.body as { id: number; nome: string },
      produto: produto.body as { id: number; nome: string; preco_venda: number },
      variante,
    };
  }

  it('lista vazia paginada e rejeita cliente/produto/variante/quantidade inválidos', async () => {
    const lista = await request(app).get('/api/pedidos');
    expect(lista.status).toBe(200);
    expect(lista.body).toMatchObject({ data: [], total: 0, pagina: 1 });

    const semCliente = await request(app).post('/api/pedidos').send({
      cliente_id: 999,
      itens: [{ produto_id: 1, quantidade: 1, preco_unitario: 10 }],
    });
    expect(semCliente.status).toBe(404);

    const { cliente, produto, variante } = await seed();
    const semProduto = await request(app).post('/api/pedidos').send({
      cliente_id: cliente.id,
      itens: [{ produto_id: 999, quantidade: 1, preco_unitario: 10 }],
    });
    expect(semProduto.status).toBe(404);

    const varianteErrada = await request(app).post('/api/pedidos').send({
      cliente_id: cliente.id,
      itens: [{ produto_id: produto.id, variante_id: 999, quantidade: 2, preco_unitario: 10 }],
    });
    expect(varianteErrada.status).toBe(404);

    const qtdZero = await request(app).post('/api/pedidos').send({
      cliente_id: cliente.id,
      itens: [{ produto_id: produto.id, variante_id: variante.id, quantidade: 0, preco_unitario: 10 }],
    });
    expect(qtdZero.status).toBe(400);

    const precoNeg = await request(app).post('/api/pedidos').send({
      cliente_id: cliente.id,
      itens: [{ produto_id: produto.id, variante_id: variante.id, quantidade: 1, preco_unitario: -1 }],
    });
    expect(precoNeg.status).toBe(400);
  });

  it('cria pedido, calcula totais no servidor, recupera e edita', async () => {
    const { cliente, produto, variante } = await seed();
    const criado = await request(app).post('/api/pedidos').send({
      cliente_id: cliente.id,
      data_pedido: '2026-09-20',
      data_prevista: '2026-10-05',
      prioridade: 'alta',
      desconto: 10,
      frete: 15,
      observacoes: 'Pedido teste',
      itens: [
        {
          produto_id: produto.id,
          variante_id: variante.id,
          quantidade: 4,
          preco_unitario: 50,
          desconto: 5,
        },
      ],
    });
    expect(criado.status).toBe(201);
    expect(criado.body.codigo).toBe('PV-0001');
    expect(criado.body.status).toBe('orcamento');
    expect(criado.body.subtotal).toBe(195);
    expect(criado.body.total).toBe(200);
    expect(criado.body.itens[0].total).toBe(195);

    const get = await request(app).get(`/api/pedidos/${criado.body.id}`);
    expect(get.status).toBe(200);
    expect(get.body.cliente).toBe('Loja Pedido');
    expect(get.body.itens[0].tamanho).toBe('M');

    const edit = await request(app).patch(`/api/pedidos/${criado.body.id}`).send({
      frete: 20,
      itens: [
        {
          produto_id: produto.id,
          variante_id: variante.id,
          quantidade: 5,
          preco_unitario: 50,
          desconto: 0,
        },
      ],
    });
    expect(edit.status).toBe(200);
    expect(edit.body.subtotal).toBe(250);
    expect(edit.body.total).toBe(260);
  });

  it('confirma, gera OP com dados do pedido e impede duplicata', async () => {
    const { cliente, produto, variante } = await seed();
    const pedido = await request(app).post('/api/pedidos').send({
      cliente_id: cliente.id,
      data_prevista: '2026-10-20',
      prioridade: 'urgente',
      itens: [
        {
          produto_id: produto.id,
          variante_id: variante.id,
          quantidade: 6,
          preco_unitario: 40,
        },
      ],
    });
    const id = pedido.body.id as number;

    const cedo = await request(app).post(`/api/pedidos/${id}/gerar-op`).send({});
    expect(cedo.status).toBe(409);

    const conf = await request(app).patch(`/api/pedidos/${id}`).send({ status: 'confirmado' });
    expect(conf.status).toBe(200);
    expect(conf.body.status).toBe('confirmado');
    expect(conf.body.itens[0].quantidade_reservada).toBe(6);

    const op = await request(app).post(`/api/pedidos/${id}/gerar-op`).send({});
    expect(op.status).toBe(201);
    expect(op.body.status).toBe('em_producao');
    expect(op.body.ops_geradas).toHaveLength(1);
    expect(op.body.ordens[0].codigo).toMatch(/^OP-/);

    const ordem = await request(app).get(`/api/ordens/${op.body.ops_geradas[0].id}`);
    expect(ordem.status).toBe(200);
    expect(ordem.body.cliente_id).toBe(cliente.id);
    expect(ordem.body.produto_id).toBe(produto.id);
    expect(ordem.body.variante_id).toBe(variante.id);
    expect(ordem.body.quantidade).toBe(6);
    expect(ordem.body.prioridade).toBe('urgente');
    expect(ordem.body.data_prevista).toBe('2026-10-20');
    expect(ordem.body.cliente).toBe('Loja Pedido');
    expect(ordem.body.produto).toBe('Camisa Pedido');
    expect(ordem.body.tamanho).toBe('M');
    expect(ordem.body.pedido_id).toBe(id);

    const dup = await request(app).post(`/api/pedidos/${id}/gerar-op`).send({});
    expect(dup.status).toBe(409);

    const fluxo = await request(app).post('/api/etapas/fluxo').send({ ordem_id: ordem.body.id });
    expect(fluxo.status).toBe(201);
    expect(fluxo.body.data).toHaveLength(5);
  });

  it('gera contas a receber sem duplicar e não mexe no estoque na criação', async () => {
    const { cliente, produto, variante } = await seed();
    const estoqueAntes = await request(app).get('/api/estoque');
    const pedido = await request(app).post('/api/pedidos').send({
      cliente_id: cliente.id,
      status: 'aberto',
      data_prevista: '2026-11-01',
      itens: [
        { produto_id: produto.id, variante_id: variante.id, quantidade: 3, preco_unitario: 70 },
      ],
    });
    expect(pedido.body.total).toBe(210);

    const finCedo = await request(app).post(`/api/pedidos/${pedido.body.id}/financeiro`).send({});
    expect(finCedo.status).toBe(409);

    await request(app).patch(`/api/pedidos/${pedido.body.id}`).send({ status: 'confirmado' });
    const fin = await request(app)
      .post(`/api/pedidos/${pedido.body.id}/financeiro`)
      .send({ vencimento: '2026-11-10' });
    expect(fin.status).toBe(201);
    expect(fin.body.status).toBe('faturado');
    expect(fin.body.financeiro.valor).toBe(210);
    expect(fin.body.financeiro.status).toBe('pendente');

    const dupFin = await request(app).post(`/api/pedidos/${pedido.body.id}/financeiro`).send({});
    expect(dupFin.status).toBe(409);

    const lanc = await request(app).get('/api/financeiro/lancamentos').query({ tipo: 'receber' });
    expect(lanc.body.total).toBe(1);
    expect(lanc.body.data[0].pedido_codigo).toBe('PV-0001');
    expect(lanc.body.data[0].cliente_id).toBe(cliente.id);

    const delFin = await request(app).delete(`/api/financeiro/lancamentos/${lanc.body.data[0].id}`);
    expect(delFin.status).toBe(409);

    const estoqueDepois = await request(app).get('/api/estoque');
    expect(estoqueDepois.body.total).toBe(estoqueAntes.body.total);
  });

  it('filtra, busca, pagina e cancela', async () => {
    const { cliente, produto, variante } = await seed();
    const outro = await request(app).post('/api/clientes').send({ nome: 'Atacado Sul' });
    await request(app).post('/api/pedidos').send({
      cliente_id: cliente.id,
      data_pedido: '2026-05-02',
      prioridade: 'alta',
      itens: [{ produto_id: produto.id, variante_id: variante.id, quantidade: 1, preco_unitario: 10 }],
    });
    await request(app).post('/api/pedidos').send({
      cliente_id: outro.body.id,
      data_pedido: '2026-06-10',
      prioridade: 'baixa',
      itens: [{ produto_id: produto.id, variante_id: variante.id, quantidade: 2, preco_unitario: 20 }],
    });

    const busca = await request(app).get('/api/pedidos').query({ q: 'Camisa' });
    expect(busca.body.total).toBe(2);
    const clienteFiltro = await request(app).get('/api/pedidos').query({ cliente_id: cliente.id });
    expect(clienteFiltro.body.total).toBe(1);
    const status = await request(app).get('/api/pedidos').query({ status: 'orcamento', prioridade: 'alta' });
    expect(status.body.total).toBe(1);
    const periodo = await request(app).get('/api/pedidos').query({ de: '2026-06-01', ate: '2026-06-30' });
    expect(periodo.body.total).toBe(1);
    const pagina = await request(app).get('/api/pedidos').query({ pagina: 1, por_pagina: 1 });
    expect(pagina.body.data).toHaveLength(1);
    expect(pagina.body.total_paginas).toBe(2);

    const cancel = await request(app)
      .patch(`/api/pedidos/${busca.body.data[0].id}`)
      .send({ status: 'cancelado' });
    expect(cancel.status).toBe(200);
    expect(cancel.body.status).toBe('cancelado');
    expect(cancel.body.itens[0].quantidade_reservada).toBe(0);
  });

  it('rejeita transição inválida e atualiza dashboard/resumo', async () => {
    const { cliente, produto, variante } = await seed();
    const pedido = await request(app).post('/api/pedidos').send({
      cliente_id: cliente.id,
      status: 'aberto',
      data_prevista: '2020-01-01',
      itens: [{ produto_id: produto.id, variante_id: variante.id, quantidade: 2, preco_unitario: 30 }],
    });
    const invalid = await request(app)
      .patch(`/api/pedidos/${pedido.body.id}`)
      .send({ status: 'entregue' });
    expect(invalid.status).toBe(409);

    await request(app).patch(`/api/pedidos/${pedido.body.id}`).send({ status: 'confirmado' });
    const resumo = await request(app).get('/api/pedidos/resumo');
    expect(resumo.status).toBe(200);
    expect(resumo.body.confirmados).toBe(1);
    expect(resumo.body.atrasados).toBe(1);
    expect(resumo.body.total_vendido).toBe(60);
  });
});
