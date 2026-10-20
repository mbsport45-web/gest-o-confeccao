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

  async function mudarPedido(pedidoId: number, status: string) {
    const res = await api.patch(`/api/pedidos/${pedidoId}`).send({ status });
    expect(res.status).toBe(200);
  }

  async function pedidoConfirmado(sku: string) {
    const cliente = await api.post('/api/clientes').send({ nome: `Loja ${sku}` });
    const produto = await api.post('/api/produtos').send({
      sku,
      nome: `Camisa ${sku}`,
      cores: ['Preto'],
      tamanhos: ['M'],
      preco_venda: 80,
    });
    const variante = (produto.body.variantes as Array<{ id: number }>)[0];
    const criado = await api.post('/api/pedidos').send({
      cliente_id: cliente.body.id,
      status: 'aberto',
      itens: [{ produto_id: produto.body.id, variante_id: variante.id, quantidade: 4, preco_unitario: 80 }],
    });
    expect(criado.status).toBe(201);
    const pedidoId = criado.body.id as number;
    await mudarPedido(pedidoId, 'confirmado');
    return pedidoId;
  }

  async function pedidoPronto(sku: string) {
    const pedidoId = await pedidoConfirmado(sku);
    await mudarPedido(pedidoId, 'em_producao');
    await mudarPedido(pedidoId, 'pronto');
    return pedidoId;
  }

  function registroExpedicao(pedidoId: number) {
    return db.prepare('SELECT * FROM expedicoes WHERE pedido_id = ?').get(pedidoId) as
      | Record<string, unknown>
      | undefined;
  }

  async function statusExpedicaoNosPedidos() {
    const lista = await api.get('/api/pedidos');
    expect(lista.status).toBe(200);
    return Object.fromEntries(
      (lista.body.data as Array<{ id: number; expedicao_status?: string | null }>).map((p) => [
        p.id,
        p.expedicao_status,
      ]),
    );
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
    expect((await api.get('/api/expedicao').query({ fila: 'entregues' })).body.total).toBe(0);

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
    expect((await api.get('/api/expedicao').query({ fila: 'expedidos' })).body.total).toBe(0);
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

  it('pedido cancelado que estava pronto para envio sai da expedição, não pode ser expedido e mantém o histórico', async () => {
    const pedidoId = await pedidoPronto('CAM-CANC');
    const pronto = await api
      .post(`/api/expedicao/${pedidoId}/pronto-envio`)
      .send({ observacoes: 'Separado na doca 1' });
    expect(pronto.status).toBe(201);
    expect((await api.get('/api/expedicao/resumo')).body).toEqual({
      fila: 1,
      prontos_envio: 1,
      expedidos: 0,
      entregues: 0,
    });
    const historico = registroExpedicao(pedidoId);
    expect(historico).toMatchObject({ status: 'pronto_envio', observacoes: 'Separado na doca 1' });
    expect(historico?.data_pronta).toBeTruthy();

    const cancelado = await api.patch(`/api/pedidos/${pedidoId}`).send({ status: 'cancelado' });
    expect(cancelado.status).toBe(200);

    expect((await api.get('/api/expedicao/resumo')).body).toEqual({
      fila: 0,
      prontos_envio: 0,
      expedidos: 0,
      entregues: 0,
    });
    for (const fila of ['prontos', 'expedidos', 'entregues', 'todos']) {
      expect((await api.get('/api/expedicao').query({ fila })).body.total).toBe(0);
    }
    expect(cancelado.body).toMatchObject({ status: 'cancelado', expedicao_status: null });
    expect((await api.get(`/api/pedidos/${pedidoId}`)).body).toMatchObject({
      status: 'cancelado',
      expedicao_status: null,
    });
    expect(await statusExpedicaoNosPedidos()).toEqual({ [pedidoId]: null });

    const tentativas = [
      ['expedir', 'Pedido cancelado não pode ser expedido'],
      ['pronto-envio', 'Pedido cancelado não entra na expedição'],
      ['entregar', 'Pedido cancelado não pode ser entregue'],
    ] as const;
    for (const [acao, erro] of tentativas) {
      const res = await api.post(`/api/expedicao/${pedidoId}/${acao}`).send({ data_expedicao: '2026-10-19' });
      expect(res.status).toBe(409);
      expect(res.body.erro).toBe(erro);
    }
    expect(registroExpedicao(pedidoId)).toEqual(historico);
    expect((db.prepare('SELECT COUNT(*) AS n FROM expedicoes').get() as { n: number }).n).toBe(1);
  });

  it('pedido expedido e cancelado antes desta regra não conta como expedido nem pode ser entregue', async () => {
    const pedidoId = await pedidoPronto('CAM-LEGADO');
    expect((await api.post(`/api/expedicao/${pedidoId}/expedir`).send({})).status).toBe(201);
    db.prepare(`UPDATE pedidos SET status = 'cancelado' WHERE id = ?`).run(pedidoId);
    const historico = registroExpedicao(pedidoId);
    expect(historico).toMatchObject({ status: 'expedido' });

    expect((await api.get('/api/expedicao/resumo')).body).toEqual({
      fila: 0,
      prontos_envio: 0,
      expedidos: 0,
      entregues: 0,
    });
    expect((await api.get('/api/expedicao').query({ fila: 'expedidos' })).body.total).toBe(0);
    expect((await api.get(`/api/pedidos/${pedidoId}`)).body).toMatchObject({
      status: 'cancelado',
      expedicao_status: null,
    });
    const entregar = await api.post(`/api/expedicao/${pedidoId}/entregar`).send({});
    expect(entregar.status).toBe(409);
    expect(entregar.body.erro).toBe('Pedido cancelado não pode ser entregue');
    expect(registroExpedicao(pedidoId)).toEqual(historico);
  });

  it('não gera OP para pedido já expedido e continua gerando antes da saída', async () => {
    const pedidoId = await pedidoConfirmado('CAM-OP-SAIDA');
    const primeira = await api.post(`/api/pedidos/${pedidoId}/gerar-op`).send({});
    expect(primeira.status).toBe(201);
    const op = (primeira.body.ops_geradas as Array<{ id: number }>)[0];
    expect((await api.patch(`/api/ordens/${op.id}`).send({ status: 'concluida' })).status).toBe(200);
    expect((await api.get(`/api/pedidos/${pedidoId}`)).body.status).toBe('pronto');
    expect((await api.post(`/api/expedicao/${pedidoId}/pronto-envio`).send({})).status).toBe(201);

    const antesDaSaida = await api.post(`/api/pedidos/${pedidoId}/gerar-op`).send({ forcar: true });
    expect(antesDaSaida.status).toBe(201);
    const extra = (antesDaSaida.body.ops_geradas as Array<{ id: number }>)[0];
    expect((await api.patch(`/api/ordens/${extra.id}`).send({ status: 'concluida' })).status).toBe(200);
    expect((await api.post(`/api/expedicao/${pedidoId}/expedir`).send({})).status).toBe(200);

    const totalOps = () =>
      (db.prepare('SELECT COUNT(*) AS n FROM ordens_producao WHERE pedido_id = ?').get(pedidoId) as { n: number }).n;
    expect(totalOps()).toBe(2);
    const itemId = (await api.get(`/api/pedidos/${pedidoId}`)).body.itens[0].id as number;
    for (const corpo of [{ forcar: true }, { item_ids: [itemId], forcar: true }, {}]) {
      const depois = await api.post(`/api/pedidos/${pedidoId}/gerar-op`).send(corpo);
      expect(depois.status).toBe(409);
      expect(depois.body.erro).toBe('Pedido já expedido não pode receber nova OP');
    }
    expect(totalOps()).toBe(2);
    expect((await api.get(`/api/pedidos/${pedidoId}`)).body.status).toBe('pronto');
    expect(registroExpedicao(pedidoId)).toMatchObject({ status: 'expedido' });

    expect((await api.post(`/api/expedicao/${pedidoId}/entregar`).send({})).status).toBe(200);
    const entregue = await api.post(`/api/pedidos/${pedidoId}/gerar-op`).send({ forcar: true });
    expect(entregue.status).toBe(409);
    expect(entregue.body.erro).toBe('Pedido já expedido não pode receber nova OP');
    expect(totalOps()).toBe(2);
  });

  it('não cancela pedido já expedido e mantém cancelável quem ainda não saiu', async () => {
    const semExpedicao = await pedidoPronto('CAM-INFO-1');
    const aguardando = await pedidoPronto('CAM-INFO-2');
    expect((await api.post(`/api/expedicao/${aguardando}/pronto-envio`).send({})).status).toBe(201);
    const expedido = await pedidoPronto('CAM-INFO-3');
    expect((await api.post(`/api/expedicao/${expedido}/expedir`).send({})).status).toBe(201);

    const cancelarExpedido = await api.patch(`/api/pedidos/${expedido}`).send({ status: 'cancelado' });
    expect(cancelarExpedido.status).toBe(409);
    expect(cancelarExpedido.body.erro).toBe('Pedido já expedido não pode ser cancelado');

    expect(await statusExpedicaoNosPedidos()).toEqual({
      [semExpedicao]: null,
      [aguardando]: 'pronto_envio',
      [expedido]: 'expedido',
    });
    expect((await api.get(`/api/pedidos/${expedido}`)).body.expedicao_status).toBe('expedido');

    await mudarPedido(aguardando, 'cancelado');
    await mudarPedido(semExpedicao, 'cancelado');
    expect(await statusExpedicaoNosPedidos()).toEqual({
      [semExpedicao]: null,
      [aguardando]: null,
      [expedido]: 'expedido',
    });
    expect((await api.get(`/api/pedidos/${expedido}`)).body.status).toBe('pronto');
    expect(registroExpedicao(expedido)).toMatchObject({ status: 'expedido' });
    expect(registroExpedicao(aguardando)).toMatchObject({ status: 'pronto_envio' });
  });

  async function filasDoPedido(codigo: string) {
    const presentes: string[] = [];
    for (const fila of ['prontos', 'expedidos', 'entregues'] as const) {
      const res = await api.get('/api/expedicao').query({ fila });
      expect(res.status).toBe(200);
      const ocorrencias = (res.body.data as Array<{ codigo: string }>).filter((l) => l.codigo === codigo);
      expect(ocorrencias).toHaveLength(ocorrencias.length > 0 ? 1 : 0);
      if (ocorrencias.length === 1) presentes.push(fila);
    }
    return presentes;
  }

  it('pedido expedido fica só em Expedidos e, ao ser entregue, só em Entregues', async () => {
    const pedidoId = await pedidoPronto('CAM-EXCLUSIVO');
    const codigo = (await api.get(`/api/pedidos/${pedidoId}`)).body.codigo as string;
    expect((await api.post(`/api/expedicao/${pedidoId}/expedir`).send({ data_expedicao: '2026-10-19' })).status).toBe(
      201,
    );

    expect(await filasDoPedido(codigo)).toEqual(['expedidos']);
    expect((await api.get('/api/expedicao').query({ fila: 'expedidos' })).body.data[0]).toMatchObject({
      codigo,
      expedicao_status: 'expedido',
    });
    expect((await api.get('/api/expedicao/resumo')).body).toMatchObject({
      expedidos: 1,
      entregues: 0,
    });
    expect(await filasDoPedido(codigo)).toEqual(['expedidos']);

    expect((await api.post(`/api/expedicao/${pedidoId}/entregar`).send({ data_entrega: '2026-10-20' })).status).toBe(
      200,
    );
    expect(await filasDoPedido(codigo)).toEqual(['entregues']);
    expect((await api.get('/api/expedicao').query({ fila: 'entregues' })).body.data[0]).toMatchObject({
      codigo,
      pedido_status: 'entregue',
      expedicao_status: 'entregue',
    });
    expect((await api.get('/api/expedicao/resumo')).body).toMatchObject({
      fila: 0,
      prontos_envio: 0,
      expedidos: 0,
      entregues: 1,
    });
    expect(await filasDoPedido(codigo)).toEqual(['entregues']);
    expect(registroExpedicao(pedidoId)).toMatchObject({
      status: 'entregue',
      data_expedicao: '2026-10-19',
      data_entrega: '2026-10-20',
    });
  });

  it('pedido marcado entregue em Pedidos some de Expedidos e não se duplica ao consultar de novo', async () => {
    const naFila = await pedidoPronto('CAM-FILA');
    const expedido = await pedidoPronto('CAM-AINDA-EXP');
    const alvo = await pedidoPronto('CAM-PATCH-ENT');
    expect((await api.post(`/api/expedicao/${expedido}/expedir`).send({})).status).toBe(201);
    expect((await api.post(`/api/expedicao/${alvo}/expedir`).send({ data_expedicao: '2026-10-19' })).status).toBe(201);
    const historico = registroExpedicao(alvo);
    const codigoAlvo = (await api.get(`/api/pedidos/${alvo}`)).body.codigo as string;
    const codigoFila = (await api.get(`/api/pedidos/${naFila}`)).body.codigo as string;
    const codigoExpedido = (await api.get(`/api/pedidos/${expedido}`)).body.codigo as string;

    expect(await filasDoPedido(codigoAlvo)).toEqual(['expedidos']);
    const entregue = await api.patch(`/api/pedidos/${alvo}`).send({ status: 'entregue' });
    expect(entregue.status).toBe(200);
    expect(entregue.body.status).toBe('entregue');

    expect(await filasDoPedido(codigoAlvo)).toEqual(['entregues']);
    expect(await filasDoPedido(codigoAlvo)).toEqual(['entregues']);
    const entregues = await api.get('/api/expedicao').query({ fila: 'entregues' });
    expect(entregues.body.data.filter((l: { codigo: string }) => l.codigo === codigoAlvo)).toHaveLength(1);
    expect(entregues.body.data[0]).toMatchObject({
      codigo: codigoAlvo,
      pedido_status: 'entregue',
      expedicao_status: 'entregue',
    });
    expect(await filasDoPedido(codigoExpedido)).toEqual(['expedidos']);
    expect(await filasDoPedido(codigoFila)).toEqual(['prontos']);
    expect((await api.get('/api/expedicao/resumo')).body).toMatchObject({
      fila: 1,
      prontos_envio: 0,
      expedidos: 1,
      entregues: 1,
    });
    expect(registroExpedicao(alvo)).toEqual(historico);
  });
});
