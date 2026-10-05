import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from './app.js';
import { createDatabase, type AppDatabase } from './db.js';
import { autenticar, autenticarNovaEmpresa, type TestApi } from './httpTest.js';

describe('cadastro e estoque de tecidos', () => {
  let db: AppDatabase;
  let api: TestApi;

  beforeEach(async () => {
    db = createDatabase(':memory:');
    api = await autenticar(createApp(db));
  });

  afterEach(() => {
    db.close();
  });

  it('cadastra tecido em KG e em METRO, cada um com a própria unidade e custo', async () => {
    const dryfit = await api.post('/api/tecidos').send({
      nome: 'Dryfit',
      categoria: 'Malharia',
      unidade: 'KG',
      largura_cm: 160,
      gramatura: 180,
      custo: 42.5,
      fornecedor: 'Malhas Sul',
      cor: 'Preto',
      estoque_inicial: 500,
      estoque_minimo: 20,
      status: 'ativo',
    });
    expect(dryfit.status).toBe(201);
    expect(dryfit.body.unidade).toBe('KG');
    expect(dryfit.body.unidade_custo).toBe('R$/KG');
    expect(dryfit.body.estoque).toBe(500);
    expect(dryfit.body.custo).toBe(42.5);

    const tactel = await api.post('/api/tecidos').send({
      nome: 'Tactel com elastano',
      categoria: 'Sintético',
      unidade: 'METRO',
      custo: 18,
      cor: 'Marinho',
      estoque_inicial: 1500,
      estoque_minimo: 100,
    });
    expect(tactel.status).toBe(201);
    expect(tactel.body.unidade).toBe('METRO');
    expect(tactel.body.unidade_custo).toBe('R$/METRO');
    expect(tactel.body.estoque).toBe(1500);

    const lista = await api.get('/api/tecidos');
    expect(lista.body.total).toBe(2);
  });

  it('registra entrada e saída na unidade do tecido e atualiza o saldo', async () => {
    const tecido = await api.post('/api/tecidos').send({
      nome: 'Moletom',
      categoria: 'Malharia',
      unidade: 'KG',
      custo: 30,
      estoque_inicial: 100,
    });
    expect(tecido.status).toBe(201);

    const entrada = await api.post(`/api/tecidos/${tecido.body.id}/movimentos`).send({
      tipo: 'entrada',
      quantidade: 25,
      unidade: 'KG',
      custo: 31,
      motivo: 'Compra',
    });
    expect(entrada.status).toBe(201);
    expect(entrada.body.tecido.estoque).toBe(125);
    expect(entrada.body.movimento.saldo_anterior).toBe(100);
    expect(entrada.body.movimento.saldo_posterior).toBe(125);
    expect(entrada.body.movimento.unidade).toBe('KG');
    expect(entrada.body.movimento.usuario_id).toBeTruthy();
    expect(entrada.body.movimento.criado_em).toBeTruthy();

    const saida = await api.post(`/api/tecidos/${tecido.body.id}/movimentos`).send({
      tipo: 'saida',
      quantidade: 10,
      unidade: 'KG',
      motivo: 'Corte',
    });
    expect(saida.status).toBe(201);
    expect(saida.body.tecido.estoque).toBe(115);
    expect(saida.body.movimento.saldo_anterior).toBe(125);
    expect(saida.body.movimento.saldo_posterior).toBe(115);
  });

  it('bloqueia saída em unidade diferente da unidade de controle', async () => {
    const tecido = await api.post('/api/tecidos').send({
      nome: 'Nylon',
      categoria: 'Sintético',
      unidade: 'METRO',
      custo: 12,
      estoque_inicial: 80,
    });
    const bloqueio = await api.post(`/api/tecidos/${tecido.body.id}/movimentos`).send({
      tipo: 'saida',
      quantidade: 5,
      unidade: 'KG',
      motivo: 'Unidade errada',
    });
    expect(bloqueio.status).toBe(400);
    expect(bloqueio.body.erro).toMatch(/METRO/);

    const saldo = await api.get(`/api/tecidos/${tecido.body.id}`);
    expect(saldo.body.estoque).toBe(80);
  });

  it('baixa o enfesto na unidade já cadastrada, em quilo ou em metro', async () => {
    const kg = await api.post('/api/tecidos').send({
      nome: 'Dryfit',
      categoria: 'Malharia',
      unidade: 'KG',
      custo: 40,
      estoque_inicial: 500,
    });
    const baixaKg = await api.post(`/api/tecidos/${kg.body.id}/baixas-enfesto`).send({
      quantidade: 12.5,
      referencia_id: 90,
    });
    expect(baixaKg.status).toBe(201);
    expect(baixaKg.body.tecido.estoque).toBe(487.5);
    expect(baixaKg.body.movimento.unidade).toBe('KG');
    expect(baixaKg.body.movimento.referencia_tipo).toBe('enfesto');
    expect(baixaKg.body.movimento.tipo).toBe('saida');

    const metro = await api.post('/api/tecidos').send({
      nome: 'Tactel com elastano',
      categoria: 'Tecido Plano',
      unidade: 'METRO',
      custo: 15,
      estoque_inicial: 1500,
    });
    const baixaMetro = await api.post(`/api/tecidos/${metro.body.id}/baixas-enfesto`).send({
      quantidade: 40,
    });
    expect(baixaMetro.status).toBe(201);
    expect(baixaMetro.body.tecido.estoque).toBe(1460);
    expect(baixaMetro.body.movimento.unidade).toBe('METRO');
  });

  it('isola tecido, saldo e categoria por empresa', async () => {
    const app = createApp(db);
    const { api: outra } = await autenticarNovaEmpresa(app);
    const criado = await api.post('/api/tecidos').send({
      nome: 'Sarja',
      categoria: 'Jeans',
      unidade: 'METRO',
      custo: 22,
      estoque_inicial: 300,
    });
    expect(criado.status).toBe(201);

    const lista = await outra.get('/api/tecidos');
    expect(lista.body.total).toBe(0);

    const leitura = await outra.get(`/api/tecidos/${criado.body.id}`);
    expect(leitura.status).toBe(404);

    const movimento = await outra.post(`/api/tecidos/${criado.body.id}/movimentos`).send({
      tipo: 'saida',
      quantidade: 1,
      unidade: 'METRO',
    });
    expect(movimento.status).toBe(404);

    const categorias = await outra.get('/api/tecidos/categorias');
    expect(categorias.body.data.map((item: { nome: string }) => item.nome)).not.toContain('Jeans');
    expect(categorias.body.data.map((item: { nome: string }) => item.nome)).toEqual(
      expect.arrayContaining(['Malharia', 'Tecido Plano', 'Sintético']),
    );

    const saldo = await api.get(`/api/tecidos/${criado.body.id}`);
    expect(saldo.body.estoque).toBe(300);
  });

  it('permite criar uma categoria nova sem limitar o nome do tecido', async () => {
    const categoria = await api.post('/api/tecidos/categorias').send({ nome: 'Especial' });
    expect(categoria.status).toBe(201);

    const tecido = await api.post('/api/tecidos').send({
      nome: 'Poliéster',
      categoria: 'Especial',
      unidade: 'KG',
      custo: 9,
      estoque_inicial: 0,
    });
    expect(tecido.status).toBe(201);
    expect(tecido.body.categoria).toBe('Especial');
    expect(tecido.body.estoque).toBe(0);
  });
});
