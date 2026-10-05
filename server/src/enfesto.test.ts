import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from './app.js';
import { createDatabase, type AppDatabase } from './db.js';
import { autenticar, autenticarNovaEmpresa, autenticarPapel, type TestApi } from './httpTest.js';

describe('enfesto por cor', () => {
  let db: AppDatabase;
  let api: TestApi;

  beforeEach(async () => {
    db = createDatabase(':memory:');
    api = await autenticar(createApp(db));
  });

  afterEach(() => {
    db.close();
  });

  async function ordemBermuda() {
    const produto = await api.post('/api/produtos').send({
      referencia: '10234',
      nome: 'Bermuda',
      cores: ['Preto', 'Branco'],
      tamanhos: ['G1', 'G2', 'G3'],
      valor_costura: 8,
    });
    expect(produto.status).toBe(201);
    const variantes = produto.body.variantes as Array<{ id: number; cor: string; tamanho: string }>;
    const celula = (cor: string, tamanho: string) => {
      const variante = variantes.find((item) => item.cor === cor && item.tamanho === tamanho);
      if (!variante) throw new Error(`variante ${cor} ${tamanho} ausente`);
      return { variante_id: variante.id, quantidade: 25 };
    };
    const ordem = await api.post('/api/ordens').send({
      cliente: 'Loja Centro',
      produto_id: produto.body.id,
      quantidade: 150,
      distribuicao: [
        celula('Preto', 'G1'),
        celula('Preto', 'G2'),
        celula('Preto', 'G3'),
        celula('Branco', 'G1'),
        celula('Branco', 'G2'),
        celula('Branco', 'G3'),
      ],
    });
    expect(ordem.status).toBe(201);
    return ordem.body as { id: number; codigo: string; referencia: string };
  }

  async function tecido(unidade: 'KG' | 'METRO', estoque: number, custo: number, nome: string) {
    const res = await api.post('/api/tecidos').send({
      nome,
      categoria: unidade === 'KG' ? 'Malharia' : 'Sintético',
      unidade,
      custo,
      estoque_inicial: estoque,
    });
    expect(res.status).toBe(201);
    return res.body as { id: number; unidade: string; estoque: number; custo: number };
  }

  it('baixa quilos do Dryfit ao finalizar o enfesto da cor e guarda o retrato', async () => {
    const ordem = await ordemBermuda();
    const dryfit = await tecido('KG', 500, 35, 'Dryfit');
    const eu = await api.get('/api/me');

    const painel = await api.get(`/api/enfesto?ordem_id=${ordem.id}`);
    expect(painel.status).toBe(200);
    expect(painel.body.cores).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ cor: 'Preto', quantidade_pecas: 75, status: 'pendente' }),
        expect.objectContaining({ cor: 'Branco', quantidade_pecas: 75, status: 'pendente' }),
      ]),
    );
    const preto = painel.body.cores.find((item: { cor: string }) => item.cor === 'Preto');
    expect(preto.tamanhos.map((item: { tamanho: string }) => item.tamanho)).toEqual(['G1', 'G2', 'G3']);

    const aberto = await api.post('/api/enfesto').send({ ordem_id: ordem.id, cor: 'Preto' });
    expect(aberto.status).toBe(201);
    expect(aberto.body.quantidade_pecas).toBe(75);
    expect(aberto.body.referencia).toBe('10234');
    expect(aberto.body.produto_nome).toBe('Bermuda');
    expect(aberto.body.status).toBe('em_enfesto');

    const finalizado = await api.post(`/api/enfesto/${aberto.body.id}/finalizar`).send({
      tecido_id: dryfit.id,
      folhas: 20,
      comprimento: 1.5,
      peso: 18.2,
      unidade: 'KG',
    });
    expect(finalizado.status).toBe(200);
    expect(finalizado.body.status).toBe('finalizado');
    expect(finalizado.body.cor).toBe('Preto');
    expect(finalizado.body.ordem_id).toBe(ordem.id);
    expect(finalizado.body.unidade).toBe('KG');
    expect(finalizado.body.quantidade_consumida).toBeCloseTo(18.2);
    expect(finalizado.body.saldo_anterior).toBeCloseTo(500);
    expect(finalizado.body.saldo_posterior).toBeCloseTo(481.8);
    expect(finalizado.body.custo_unitario).toBe(35);
    expect(finalizado.body.custo_total).toBeCloseTo(637);
    expect(finalizado.body.usuario_id).toBe(eu.body.usuario.id);
    expect(finalizado.body.finalizado_em).toBeTruthy();
    expect(finalizado.body.movimento_id).toBeTruthy();

    const saldo = await api.get(`/api/tecidos/${dryfit.id}`);
    expect(saldo.body.estoque).toBeCloseTo(481.8);
    const movimentos = await api.get(`/api/tecidos/${dryfit.id}/movimentos`);
    const baixa = movimentos.body.data.find(
      (item: { referencia_tipo: string; referencia_id: number }) =>
        item.referencia_tipo === 'enfesto' && item.referencia_id === aberto.body.id,
    );
    expect(baixa.tipo).toBe('saida');
    expect(baixa.unidade).toBe('KG');
    expect(baixa.quantidade).toBeCloseTo(18.2);

    const cores = await api.get(`/api/enfesto?ordem_id=${ordem.id}`);
    const branco = cores.body.cores.find((item: { cor: string }) => item.cor === 'Branco');
    expect(branco.status).toBe('pendente');
    expect(branco.quantidade_pecas).toBe(75);
  });

  it('baixa metros do Tactel e recusa unidade diferente, estoque insuficiente e segunda finalização', async () => {
    const ordem = await ordemBermuda();
    const tactel = await tecido('METRO', 1500, 18, 'Tactel com elastano');
    const aberto = await api.post('/api/enfesto').send({ ordem_id: ordem.id, cor: 'Branco' });

    const unidadeErrada = await api.post(`/api/enfesto/${aberto.body.id}/finalizar`).send({
      tecido_id: tactel.id,
      folhas: 10,
      comprimento: 4,
      metragem: 42.5,
      unidade: 'KG',
    });
    expect(unidadeErrada.status).toBe(400);
    expect((await api.get(`/api/tecidos/${tactel.id}`)).body.estoque).toBe(1500);
    expect((await api.get(`/api/enfesto/${aberto.body.id}`)).body.status).toBe('em_enfesto');

    const pouco = await tecido('METRO', 10, 18, 'Nylon');
    const semSaldo = await api.post(`/api/enfesto/${aberto.body.id}/finalizar`).send({
      tecido_id: pouco.id,
      folhas: 10,
      comprimento: 4,
      metragem: 42.5,
      unidade: 'METRO',
    });
    expect(semSaldo.status).toBe(409);
    expect((await api.get(`/api/enfesto/${aberto.body.id}`)).body.status).toBe('em_enfesto');
    expect((await api.get(`/api/tecidos/${pouco.id}`)).body.estoque).toBe(10);

    const ok = await api.post(`/api/enfesto/${aberto.body.id}/finalizar`).send({
      tecido_id: tactel.id,
      folhas: 10,
      comprimento: 4.25,
      metragem: 42.5,
      unidade: 'METRO',
    });
    expect(ok.status).toBe(200);
    expect(ok.body.unidade).toBe('METRO');
    expect(ok.body.quantidade_consumida).toBeCloseTo(42.5);
    expect(ok.body.saldo_anterior).toBeCloseTo(1500);
    expect(ok.body.saldo_posterior).toBeCloseTo(1457.5);

    const repetido = await api.post(`/api/enfesto/${aberto.body.id}/finalizar`).send({
      tecido_id: tactel.id,
      folhas: 10,
      comprimento: 4.25,
      metragem: 42.5,
      unidade: 'METRO',
    });
    expect(repetido.status).toBe(409);
    expect((await api.get(`/api/tecidos/${tactel.id}`)).body.estoque).toBeCloseTo(1457.5);
  });

  it('isola o enfesto por empresa e só quem pode cancelar altera o status', async () => {
    const app = createApp(db);
    const ordem = await ordemBermuda();
    const dryfit = await tecido('KG', 100, 20, 'Dryfit');
    const aberto = await api.post('/api/enfesto').send({ ordem_id: ordem.id, cor: 'Preto' });
    const cortador = await autenticarPapel(app, api, 'cortador');
    const { api: outra } = await autenticarNovaEmpresa(app);

    const alheio = await outra.get(`/api/enfesto?ordem_id=${ordem.id}`);
    expect(alheio.status).toBe(404);
    const leitura = await outra.get(`/api/enfesto/${aberto.body.id}`);
    expect(leitura.status).toBe(404);
    const baixaAlheia = await outra.post(`/api/enfesto/${aberto.body.id}/finalizar`).send({
      tecido_id: dryfit.id,
      folhas: 1,
      comprimento: 1,
      peso: 1,
      unidade: 'KG',
    });
    expect(baixaAlheia.status).toBe(404);

    const cancelar = await cortador.post(`/api/enfesto/${aberto.body.id}/cancelar`);
    expect(cancelar.status).toBe(403);
    const financeiro = await cortador.get('/api/financeiro/lancamentos');
    expect(financeiro.status).toBe(403);

    const finalizado = await cortador.post(`/api/enfesto/${aberto.body.id}/finalizar`).send({
      tecido_id: dryfit.id,
      folhas: 8,
      comprimento: 2,
      peso: 4,
      unidade: 'KG',
    });
    expect(finalizado.status).toBe(200);
    expect(finalizado.body.usuario_id).toBeTruthy();
    expect(finalizado.body.finalizado_em).toBeTruthy();
    expect((await api.get(`/api/tecidos/${dryfit.id}`)).body.estoque).toBeCloseTo(96);

    const adminCancela = await api.post(`/api/enfesto/${aberto.body.id}/cancelar`);
    expect(adminCancela.status).toBe(409);
  });
});
