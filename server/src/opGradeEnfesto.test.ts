import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from './app.js';
import { createDatabase, type AppDatabase } from './db.js';
import { autenticar, type TestApi } from './httpTest.js';

type Variante = { id: number; cor: string; tamanho: string };

describe('grade da OP e cores do enfesto', () => {
  let db: AppDatabase;
  let api: TestApi;

  beforeEach(async () => {
    db = createDatabase(':memory:');
    api = await autenticar(createApp(db));
  });

  afterEach(() => {
    db.close();
  });

  async function produtoCom(cores: string[], tamanhos: string[], sku: string) {
    const produto = await api.post('/api/produtos').send({
      referencia: sku,
      nome: 'Bermuda',
      cores,
      tamanhos,
      valor_costura: 8,
    });
    expect(produto.status).toBe(201);
    return {
      id: produto.body.id as number,
      variantes: produto.body.variantes as Variante[],
    };
  }

  function distribuir(variantes: Variante[], quantidade: (cor: string, tamanho: string) => number) {
    return variantes.map((variante) => ({
      variante_id: variante.id,
      quantidade: quantidade(variante.cor, variante.tamanho),
    }));
  }

  it('grava uma cor em P M G GG e o enfesto recebe essa cor com os tamanhos', async () => {
    const { id, variantes } = await produtoCom(['Preto'], ['P', 'M', 'G', 'GG'], 'OP-1COR');
    const mapa: Record<string, number> = { P: 10, M: 20, G: 25, GG: 20 };
    const criada = await api.post('/api/ordens').send({
      cliente: 'Loja',
      produto_id: id,
      quantidade: 75,
      distribuicao: distribuir(variantes, (_cor, tamanho) => mapa[tamanho] ?? 0),
    });
    expect(criada.status).toBe(201);
    expect(criada.body.referencia).toBe('OP-1COR');
    expect(criada.body.produto).toBe('Bermuda');
    expect(criada.body.valor_costura).toBe(8);
    const preto = criada.body.distribuicao.filter((item: { cor: string }) => item.cor === 'Preto');
    expect(preto.map((item: { tamanho: string; quantidade: number }) => [item.tamanho, item.quantidade])).toEqual(
      expect.arrayContaining([
        ['P', 10],
        ['M', 20],
        ['G', 25],
        ['GG', 20],
      ]),
    );

    const painel = await api.get(`/api/enfesto?ordem_id=${criada.body.id}`);
    expect(painel.status).toBe(200);
    expect(painel.body.cores).toEqual([
      expect.objectContaining({
        cor: 'Preto',
        quantidade_pecas: 75,
        status: 'pendente',
        tamanhos: expect.arrayContaining([
          { tamanho: 'P', quantidade: 10 },
          { tamanho: 'M', quantidade: 20 },
          { tamanho: 'G', quantidade: 25 },
          { tamanho: 'GG', quantidade: 20 },
        ]),
      }),
    ]);

    const ausente = await api.post('/api/enfesto').send({ ordem_id: criada.body.id, cor: 'Branco' });
    expect(ausente.status).toBe(400);
    expect(ausente.body.erro).toBe('Essa cor não está na distribuição da OP');
    const aberto = await api.post('/api/enfesto').send({ ordem_id: criada.body.id, cor: 'Preto' });
    expect(aberto.status).toBe(201);
    expect(aberto.body.cor).toBe('Preto');
    expect(aberto.body.quantidade_pecas).toBe(75);
  });

  it('grava várias cores e tamanhos G1 G2 G3', async () => {
    const { id, variantes } = await produtoCom(['Preto', 'Branco', 'Azul'], ['G1', 'G2', 'G3'], 'OP-G');
    const criada = await api.post('/api/ordens').send({
      cliente: 'Loja',
      produto_id: id,
      quantidade: 90,
      distribuicao: distribuir(variantes, () => 10),
    });
    expect(criada.status).toBe(201);
    expect(criada.body.distribuicao).toHaveLength(9);
    const painel = await api.get(`/api/enfesto?ordem_id=${criada.body.id}`);
    expect(painel.body.cores).toHaveLength(3);
    expect(painel.body.cores.map((item: { cor: string; quantidade_pecas: number }) => [item.cor, item.quantidade_pecas])).toEqual(
      expect.arrayContaining([
        ['Preto', 30],
        ['Branco', 30],
        ['Azul', 30],
      ]),
    );
    const fora = await api.post('/api/enfesto').send({ ordem_id: criada.body.id, cor: 'Verde' });
    expect(fora.status).toBe(400);
  });

  it('aceita mais de 20 cores e recusa soma diferente da OP', async () => {
    const cores = Array.from({ length: 21 }, (_, indice) => `Cor ${indice + 1}`);
    const { id, variantes } = await produtoCom(cores, ['M'], 'OP-21');
    expect(variantes).toHaveLength(21);
    const divergente = await api.post('/api/ordens').send({
      cliente: 'Loja',
      produto_id: id,
      quantidade: 21,
      distribuicao: distribuir(variantes, (cor) => (cor === 'Cor 21' ? 0 : 1)),
    });
    expect(divergente.status).toBe(400);
    expect(divergente.body.erro).toBe('A soma da distribuição (20) deve ser igual à quantidade da OP (21)');

    const criada = await api.post('/api/ordens').send({
      cliente: 'Loja',
      produto_id: id,
      quantidade: 21,
      distribuicao: distribuir(variantes, () => 1),
    });
    expect(criada.status).toBe(201);
    expect(criada.body.distribuicao).toHaveLength(21);
    const painel = await api.get(`/api/enfesto?ordem_id=${criada.body.id}`);
    expect(painel.body.cores).toHaveLength(21);
    expect(painel.body.cores.every((item: { quantidade_pecas: number }) => item.quantidade_pecas === 1)).toBe(true);
    const inventada = await api.post('/api/enfesto').send({ ordem_id: criada.body.id, cor: 'Cor 22' });
    expect(inventada.status).toBe(400);
    expect(inventada.body.erro).toBe('Essa cor não está na distribuição da OP');
  });
});
