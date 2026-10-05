import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from './app.js';
import { createDatabase, type AppDatabase } from './db.js';
import { autenticar, autenticarNovaEmpresa, type TestApi } from './httpTest.js';

describe('reutilização dos dados de produção', () => {
  let db: AppDatabase;
  let api: TestApi;

  beforeEach(async () => {
    db = createDatabase(':memory:');
    api = await autenticar(createApp(db));
  });

  afterEach(() => {
    db.close();
  });

  async function cliente() {
    const res = await api.post('/api/clientes').send({ nome: 'Loja Centro' });
    expect(res.status).toBe(201);
    return res.body.id as number;
  }

  it('cadastra a referência uma vez e reaproveita produto e costura na OP seguinte', async () => {
    const produto = await api.post('/api/produtos').send({
      referencia: '10234',
      nome: 'Bermuda',
      valor_costura: 8,
    });
    expect(produto.status).toBe(201);
    expect(produto.body.referencia).toBe('10234');
    expect(produto.body.sku).toBe('10234');
    expect(produto.body.valor_costura).toBe(8);
    expect(produto.body.dados_producao.consumo_tecido).toBeNull();
    expect(produto.body.cores).toEqual([]);

    const clienteId = await cliente();
    const primeira = await api.post('/api/ordens').send({
      cliente_id: clienteId,
      produto_id: produto.body.id,
      tamanho: 'M',
      quantidade: 10,
    });
    expect(primeira.status).toBe(201);
    expect(primeira.body.produto).toBe('Bermuda');
    expect(primeira.body.referencia).toBe('10234');
    expect(primeira.body.valor_costura).toBe(8);

    const repetida = await api.get('/api/produtos/por-referencia?referencia=10234');
    expect(repetida.status).toBe(200);
    expect(repetida.body.nome).toBe('Bermuda');
    expect(repetida.body.valor_costura).toBe(8);

    const segunda = await api.post('/api/ordens').send({
      cliente_id: clienteId,
      produto_id: repetida.body.id,
      tamanho: 'G',
      quantidade: 4,
    });
    expect(segunda.status).toBe(201);
    expect(segunda.body.valor_costura).toBe(8);
    expect(segunda.body.id).not.toBe(primeira.body.id);
  });

  it('altera a costura só na OP e preserva o valor antigo quando o padrão muda', async () => {
    const produto = await api.post('/api/produtos').send({
      referencia: '10234',
      nome: 'Bermuda',
      valor_costura: 8,
    });
    const clienteId = await cliente();
    const op = await api.post('/api/ordens').send({
      cliente_id: clienteId,
      produto_id: produto.body.id,
      tamanho: 'M',
      quantidade: 5,
      valor_costura: 8.5,
    });
    expect(op.status).toBe(201);
    expect(op.body.valor_costura).toBe(8.5);

    const padrao = await api.get(`/api/produtos/${produto.body.id}`);
    expect(padrao.body.valor_costura).toBe(8);

    const atualizado = await api.patch(`/api/produtos/${produto.body.id}`).send({
      valor_costura: 9,
    });
    expect(atualizado.status).toBe(200);
    expect(atualizado.body.valor_costura).toBe(9);

    const historico = await api.get(`/api/ordens/${op.body.id}`);
    expect(historico.body.valor_costura).toBe(8.5);
    expect(historico.body.referencia).toBe('10234');
    expect(historico.body.produto).toBe('Bermuda');
  });

  it('permite a mesma referência em empresas diferentes', async () => {
    const app = createApp(db);
    const { api: outra } = await autenticarNovaEmpresa(app);
    const a = await api.post('/api/produtos').send({
      referencia: '10234',
      nome: 'Bermuda',
      valor_costura: 8,
    });
    const b = await outra.post('/api/produtos').send({
      referencia: '10234',
      nome: 'Camisa',
      valor_costura: 12,
    });
    expect(a.status).toBe(201);
    expect(b.status).toBe(201);

    const duplicada = await api.post('/api/produtos').send({
      referencia: '10234',
      nome: 'Outra',
      valor_costura: 1,
    });
    expect(duplicada.status).toBe(409);

    const leitura = await outra.get('/api/produtos/por-referencia?referencia=10234');
    expect(leitura.body.nome).toBe('Camisa');
    expect(leitura.body.valor_costura).toBe(12);
  });

  it('mantém OP antiga sem retrato de costura', async () => {
    const antiga = await api.post('/api/ordens').send({
      cliente: 'Loja Antiga',
      produto: 'Camiseta',
      tamanho: 'M',
      quantidade: 1,
    });
    expect(antiga.status).toBe(201);
    expect(antiga.body.valor_costura).toBeNull();
    expect(antiga.body.referencia).toBeNull();
  });
});
