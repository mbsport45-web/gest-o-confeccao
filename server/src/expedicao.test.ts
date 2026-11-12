import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from './app.js';
import { createDatabase, type AppDatabase } from './db.js';
import { autenticar, type TestApi } from './httpTest.js';

describe('API de expedição', () => {
  let db: AppDatabase;
  let api: TestApi;

  beforeEach(async () => {
    db = createDatabase(':memory:');
    api = await autenticar(createApp(db));
  });

  afterEach(() => {
    db.close();
  });

  async function pedidoFaturado() {
    const cliente = await api.post('/api/clientes').send({
      nome: 'Loja Expedição',
      cidade: 'Recife',
      estado: 'PE',
    });
    const produto = await api.post('/api/produtos').send({
      sku: 'CAM-EXP',
      nome: 'Camisa Expedição',
      cores: ['Preto'],
      tamanhos: ['M'],
      preco_venda: 80,
    });
    const variante = (produto.body.variantes as Array<{ id: number }>)[0];
    const criado = await api.post('/api/pedidos').send({
      cliente_id: cliente.body.id,
      data_pedido: '2026-09-18',
      status: 'aberto',
      itens: [
        {
          produto_id: produto.body.id,
          variante_id: variante.id,
          quantidade: 4,
          preco_unitario: 80,
        },
      ],
    });
    await api.patch(`/api/pedidos/${criado.body.id}`).send({ status: 'confirmado' });
    await api.patch(`/api/pedidos/${criado.body.id}`).send({ status: 'faturado' });
    return {
      cliente: cliente.body as { id: number; nome: string },
      pedido: (await api.get(`/api/pedidos/${criado.body.id}`)).body as {
        id: number;
        codigo: string;
        status: string;
        total: number;
      },
    };
  }

  it('lista vazia e ignora pedidos que ainda não estão prontos', async () => {
    const vazia = await api.get('/api/expedicao');
    expect(vazia.status).toBe(200);
    expect(vazia.body).toMatchObject({ data: [], total: 0, pagina: 1 });

    const cliente = await api.post('/api/clientes').send({ nome: 'Loja Cedo' });
    const produto = await api.post('/api/produtos').send({
      sku: 'CAM-CEDO',
      nome: 'Camisa Cedo',
      cores: ['Azul'],
      tamanhos: ['P'],
      preco_venda: 10,
    });
    const variante = (produto.body.variantes as Array<{ id: number }>)[0];
    await api.post('/api/pedidos').send({
      cliente_id: cliente.body.id,
      status: 'aberto',
      itens: [{ produto_id: produto.body.id, variante_id: variante.id, quantidade: 1, preco_unitario: 10 }],
    });

    const fila = await api.get('/api/expedicao');
    expect(fila.body.total).toBe(0);

    const resumo = await api.get('/api/expedicao/resumo');
    expect(resumo.body).toMatchObject({ fila: 0, prontos_envio: 0, expedidos: 0, entregues: 0 });
  });

  it('mostra pedido faturado, marca pronto para envio, expede e entrega', async () => {
    const { pedido } = await pedidoFaturado();

    const fila = await api.get('/api/expedicao').query({ fila: 'prontos' });
    expect(fila.status).toBe(200);
    expect(fila.body.total).toBe(1);
    expect(fila.body.data[0]).toMatchObject({
      pedido_id: pedido.id,
      codigo: 'PV-0001',
      cliente: 'Loja Expedição',
      quantidade: 4,
      valor: 320,
      data_pedido: '2026-09-18',
      pedido_status: 'faturado',
      expedicao_status: null,
    });

    const cedo = await api.post(`/api/expedicao/${pedido.id}/entregar`).send({});
    expect(cedo.status).toBe(409);

    const pronto = await api.post(`/api/expedicao/${pedido.id}/pronto-envio`).send({});
    expect(pronto.status).toBe(201);
    expect(pronto.body.expedicao_status).toBe('pronto_envio');
    expect(pronto.body.status).toBe('pronto_envio');
    expect(pronto.body.data_pronta).toBeTruthy();

    const expedir = await api.post(`/api/expedicao/${pedido.id}/expedir`).send({
      data_expedicao: '2026-09-21',
      observacoes: 'Saída pelo portão 2',
    });
    expect([200, 201]).toContain(expedir.status);
    expect(expedir.body).toMatchObject({
      expedicao_status: 'expedido',
      data_expedicao: '2026-09-21',
      observacoes: 'Saída pelo portão 2',
    });

    const duplicada = await api.post(`/api/expedicao/${pedido.id}/expedir`).send({});
    expect(duplicada.status).toBe(409);

    const expedidos = await api.get('/api/expedicao').query({ fila: 'expedidos' });
    expect(expedidos.body.total).toBe(1);
    expect(expedidos.body.data[0].codigo).toBe('PV-0001');

    const entregar = await api.post(`/api/expedicao/${pedido.id}/entregar`).send({
      data_entrega: '2026-09-22',
    });
    expect(entregar.status).toBe(200);
    expect(entregar.body.expedicao_status).toBe('entregue');
    expect(entregar.body.pedido_status).toBe('entregue');
    expect(entregar.body.data_entrega).toBe('2026-09-22');

    const pedidoAtual = await api.get(`/api/pedidos/${pedido.id}`);
    expect(pedidoAtual.body.status).toBe('entregue');

    const resumo = await api.get('/api/expedicao/resumo');
    expect(resumo.body).toMatchObject({ fila: 0, prontos_envio: 0, expedidos: 0, entregues: 1 });

    const entregues = await api.get('/api/expedicao').query({ fila: 'entregues' });
    expect(entregues.body.total).toBe(1);
  });

  it('rejeita pedido inexistente e permite expedir direto do faturado', async () => {
    const missing = await api.post('/api/expedicao/999/pronto-envio').send({});
    expect(missing.status).toBe(404);

    const { pedido } = await pedidoFaturado();
    const expedir = await api.post(`/api/expedicao/${pedido.id}/expedir`).send({});
    expect([200, 201]).toContain(expedir.status);
    expect(expedir.body.expedicao_status).toBe('expedido');
    expect(expedir.body.codigo).toBe('PV-0001');
  });

  it('lista ordens de corte da expedição sem misturar com pedidos', async () => {
    const vazia = await api.get('/api/expedicao/ordens-corte');
    expect(vazia.status).toBe(200);
    expect(vazia.body).toMatchObject({ data: [], total: 0 });

    const { pedido } = await pedidoFaturado();
    await api.post(`/api/expedicao/${pedido.id}/pronto-envio`).send({});
    const soPedidos = await api.get('/api/expedicao/ordens-corte');
    expect(soPedidos.body.total).toBe(0);
    const filaPedidos = await api.get('/api/expedicao');
    expect(filaPedidos.body.total).toBe(1);
  });
});
