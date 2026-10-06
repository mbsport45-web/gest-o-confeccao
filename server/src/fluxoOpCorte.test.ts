import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from './app.js';
import { createDatabase, type AppDatabase } from './db.js';
import { ordenarTamanhos } from './enfesto.js';
import { autenticar, type TestApi } from './httpTest.js';

type Variante = { id: number; cor: string; tamanho: string };
type Celula = { tamanho: string; quantidade: number };

describe('fluxo da OP para o corte', () => {
  let db: AppDatabase;
  let api: TestApi;

  beforeEach(async () => {
    db = createDatabase(':memory:');
    api = await autenticar(createApp(db));
  });

  afterEach(() => {
    db.close();
  });

  it('ordena a grade em P M G GG sem depender do cadastro', () => {
    expect(ordenarTamanhos(['GG', 'G', 'M', 'P'])).toEqual(['P', 'M', 'G', 'GG']);
    expect(ordenarTamanhos(['G3', 'GG', 'P', 'G1', 'G2'])).toEqual(['P', 'GG', 'G1', 'G2', 'G3']);
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

  function distribuir(
    variantes: Variante[],
    quantidade: (cor: string, tamanho: string) => number,
  ) {
    return variantes.map((variante) => ({
      variante_id: variante.id,
      quantidade: quantidade(variante.cor, variante.tamanho),
    }));
  }

  it('grava a grade na OP e o enfesto só executa essas quantidades', async () => {
    const { id, variantes } = await produtoCom(['Preto', 'Branco'], ['GG', 'G', 'M', 'P'], '10234');
    const mapa: Record<string, number> = { P: 10, M: 20, G: 20, GG: 25 };
    const divergente = await api.post('/api/ordens').send({
      cliente: 'Loja',
      produto_id: id,
      quantidade: 150,
      distribuicao: distribuir(variantes, (_cor, tamanho) => (tamanho === 'P' ? 9 : mapa[tamanho] ?? 0)),
    });
    expect(divergente.status).toBe(400);
    expect(divergente.body.erro).toMatch(/soma da distribuição/);

    const tecido = await api.post('/api/tecidos').send({
      nome: 'Dryfit',
      categoria: 'Malharia',
      unidade: 'KG',
      custo: 12,
      estoque_inicial: 80,
    });
    expect(tecido.status).toBe(201);

    const criada = await api.post('/api/ordens').send({
      cliente: 'Loja',
      produto_id: id,
      quantidade: 150,
      prioridade: 'alta',
      responsavel: 'Produção',
      observacoes: 'Pedido do corte',
      status: 'planejada',
      requisitos: [{ materia_prima_id: tecido.body.id, quantidade: 0.2 }],
      distribuicao: distribuir(variantes, (_cor, tamanho) => mapa[tamanho] ?? 0),
    });
    expect(criada.status).toBe(201);
    expect(criada.body.referencia).toBe('10234');
    expect(criada.body.quantidade).toBe(150);
    expect(criada.body.requisitos).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ materia_prima_id: tecido.body.id, quantidade_unitaria: 0.2 }),
      ]),
    );
    const preto = criada.body.distribuicao.filter((item: { cor: string }) => item.cor === 'Preto');
    const branco = criada.body.distribuicao.filter((item: { cor: string }) => item.cor === 'Branco');
    expect(preto.reduce((total: number, item: { quantidade: number }) => total + item.quantidade, 0)).toBe(75);
    expect(branco.reduce((total: number, item: { quantidade: number }) => total + item.quantidade, 0)).toBe(75);

    const painel = await api.get(`/api/enfesto?ordem_id=${criada.body.id}`);
    expect(painel.body.cores.map((item: { cor: string }) => item.cor)).toEqual(
      expect.arrayContaining(['Preto', 'Branco']),
    );
    for (const cor of ['Preto', 'Branco'] as const) {
      const linha = painel.body.cores.find((item: { cor: string }) => item.cor === cor);
      expect(linha.tamanhos.map((item: Celula) => item.tamanho)).toEqual(['P', 'M', 'G', 'GG']);
      expect(linha.tamanhos.map((item: Celula) => item.quantidade)).toEqual([10, 20, 20, 25]);
      expect(linha.quantidade_pecas).toBe(75);
    }

    const edicao = await api.patch(`/api/enfesto/ordem/${criada.body.id}/cor`).send({
      cor: 'Preto',
      tamanhos: [
        { tamanho: 'P', quantidade: 15 },
        { tamanho: 'M', quantidade: 15 },
        { tamanho: 'G', quantidade: 20 },
        { tamanho: 'GG', quantidade: 25 },
      ],
    });
    expect(edicao.status).toBe(404);

    const cedo = await api.patch(`/api/ordens/${criada.body.id}`).send({ status: 'costura' });
    expect(cedo.status).toBe(409);
    expect(cedo.body.erro).toMatch(/corte ainda não foi concluído/i);
    expect((await api.get(`/api/ordens/${criada.body.id}`)).body.status).toBe('planejada');

    const aberto = await api.post('/api/enfesto').send({ ordem_id: criada.body.id, cor: 'Preto' });
    const parcial = await api.post(`/api/enfesto/${aberto.body.id}/finalizar`).send({
      tecido_id: tecido.body.id,
      folhas: 8,
      comprimento: 1.4,
      peso: 3.5,
      unidade: 'KG',
    });
    expect(parcial.status).toBe(200);
    expect(parcial.body.quantidade_consumida).toBeCloseTo(3.5);
    expect((await api.get(`/api/tecidos/${tecido.body.id}`)).body.estoque).toBeCloseTo(76.5);
    expect((await api.get(`/api/ordens/${criada.body.id}`)).body.status).toBe('planejada');
    const depoisParcial = await api.get(`/api/enfesto?ordem_id=${criada.body.id}`);
    const pretoDepois = depoisParcial.body.cores.find((item: { cor: string }) => item.cor === 'Preto');
    expect(pretoDepois.tamanhos.map((item: Celula) => item.quantidade)).toEqual([10, 20, 20, 25]);
    expect(pretoDepois.status).toBe('finalizado');
    expect(
      depoisParcial.body.cores.find((item: { cor: string }) => item.cor === 'Branco').status,
    ).toBe('pendente');

    const brancoAberto = await api.post('/api/enfesto').send({ ordem_id: criada.body.id, cor: 'Branco' });
    const completo = await api.post(`/api/enfesto/${brancoAberto.body.id}/finalizar`).send({
      tecido_id: tecido.body.id,
      folhas: 8,
      comprimento: 1.4,
      peso: 4,
      unidade: 'KG',
    });
    expect(completo.status).toBe(200);
    expect(completo.body.unidade).toBe('KG');
    expect((await api.get(`/api/tecidos/${tecido.body.id}`)).body.estoque).toBeCloseTo(72.5);
    expect((await api.get(`/api/ordens/${criada.body.id}`)).body.status).toBe('costura');
  });

  it('aceita outros tamanhos e mantém OP antiga sem grade', async () => {
    const { id, variantes } = await produtoCom(['Azul'], ['G3', 'G1', 'G2'], 'G-ONLY');
    const criada = await api.post('/api/ordens').send({
      cliente: 'Loja',
      produto_id: id,
      quantidade: 30,
      status: 'planejada',
      distribuicao: distribuir(variantes, () => 10),
    });
    expect(criada.status).toBe(201);
    const painel = await api.get(`/api/enfesto?ordem_id=${criada.body.id}`);
    expect(painel.body.cores[0].tamanhos.map((item: Celula) => item.tamanho)).toEqual(['G1', 'G2', 'G3']);

    const legado = await api.post('/api/ordens').send({
      cliente: 'Loja Antiga',
      produto: 'Camisa legada',
      tamanho: 'M',
      quantidade: 12,
      status: 'planejada',
    });
    expect(legado.status).toBe(201);
    const segue = await api.patch(`/api/ordens/${legado.body.id}`).send({ status: 'costura' });
    expect(segue.status).toBe(200);
    expect(segue.body.status).toBe('costura');
  });
});
