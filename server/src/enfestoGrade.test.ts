import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from './app.js';
import { createDatabase, type AppDatabase } from './db.js';
import {
  gradeDaCorFecha,
  mensagemGradeDivergente,
  ordenarTamanhos,
  somaQuantidades,
} from './enfesto.js';
import { autenticar, autenticarNovaEmpresa, type TestApi } from './httpTest.js';

type Variante = { id: number; cor: string; tamanho: string };
type Celula = { tamanho: string; quantidade: number };

describe('ordem e edição da grade do enfesto', () => {
  let db: AppDatabase;
  let api: TestApi;

  beforeEach(async () => {
    db = createDatabase(':memory:');
    api = await autenticar(createApp(db));
  });

  afterEach(() => {
    db.close();
  });

  it('ordena P M G GG antes dos demais tamanhos', () => {
    expect(ordenarTamanhos(['GG', 'G', 'M', 'P'])).toEqual(['P', 'M', 'G', 'GG']);
    expect(ordenarTamanhos(['G3', 'GG', 'P', 'G1', 'G2', 'G10'])).toEqual([
      'P',
      'GG',
      'G1',
      'G2',
      'G3',
      'G10',
    ]);
    expect(gradeDaCorFecha([], 12)).toBe(true);
    expect(gradeDaCorFecha([{ quantidade: 10 }, { quantidade: 5 }], 15)).toBe(true);
    expect(gradeDaCorFecha([{ quantidade: 10 }], 15)).toBe(false);
    expect(somaQuantidades([{ quantidade: 10 }, { quantidade: 20 }])).toBe(30);
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

  async function criarOp(
    sku: string,
    cores: string[],
    tamanhos: string[],
    quantidade: (cor: string, tamanho: string) => number,
  ) {
    const { id, variantes } = await produtoCom(cores, tamanhos, sku);
    const distribuicao = variantes.map((variante) => ({
      variante_id: variante.id,
      quantidade: quantidade(variante.cor, variante.tamanho),
    }));
    const soma = distribuicao.reduce((total, item) => total + item.quantidade, 0);
    const ordem = await api.post('/api/ordens').send({
      cliente: 'Loja',
      produto_id: id,
      quantidade: soma,
      distribuicao,
    });
    expect(ordem.status).toBe(201);
    return ordem.body as { id: number };
  }

  function tamanhosDe(painel: { cores: Array<{ cor: string; tamanhos: Celula[] }> }, cor: string) {
    const linha = painel.cores.find((item) => item.cor === cor);
    if (!linha) throw new Error(`cor ${cor} ausente`);
    return linha.tamanhos;
  }

  it('lista P M G GG nessa ordem, com zero editável, sem seguir o cadastro', async () => {
    const ordem = await criarOp('GRADE-PMG', ['Preto', 'Branco'], ['GG', 'G', 'M', 'P'], (cor, tamanho) => {
      if (cor === 'Preto' && tamanho === 'M') return 0;
      const mapa: Record<string, number> = { P: 10, M: 20, G: 25, GG: 20 };
      return mapa[tamanho] ?? 0;
    });
    const painel = await api.get(`/api/enfesto?ordem_id=${ordem.id}`);
    expect(painel.status).toBe(200);
    expect(painel.body.cores).toHaveLength(2);
    expect(tamanhosDe(painel.body, 'Preto')).toEqual([
      { tamanho: 'P', quantidade: 10 },
      { tamanho: 'M', quantidade: 0 },
      { tamanho: 'G', quantidade: 25 },
      { tamanho: 'GG', quantidade: 20 },
    ]);
    expect(tamanhosDe(painel.body, 'Branco').map((item: Celula) => item.tamanho)).toEqual(['P', 'M', 'G', 'GG']);
    const preto = painel.body.cores.find((item: { cor: string }) => item.cor === 'Preto');
    expect(preto.quantidade_pecas).toBe(55);
    expect(preto.grade_persistida).toBe(true);

    const mista = await criarOp('GRADE-MISTA', ['Azul'], ['G3', 'GG', 'P', 'G1', 'G2', 'G10'], () => 1);
    const azul = await api.get(`/api/enfesto?ordem_id=${mista.id}`);
    expect(tamanhosDe(azul.body, 'Azul').map((item: Celula) => item.tamanho)).toEqual([
      'P',
      'GG',
      'G1',
      'G2',
      'G3',
      'G10',
    ]);
  });

  it('edita a grade da cor, mantém a soma e não mistura com as outras', async () => {
    const ordem = await criarOp('GRADE-EDIT', ['Preto', 'Branco'], ['GG', 'P', 'G', 'M'], (cor, tamanho) => {
      if (cor === 'Branco') return tamanho === 'P' ? 30 : 0;
      const mapa: Record<string, number> = { P: 10, M: 20, G: 25, GG: 20 };
      return mapa[tamanho] ?? 0;
    });

    const salva = await api.patch(`/api/enfesto/ordem/${ordem.id}/cor`).send({
      cor: 'Preto',
      tamanhos: [
        { tamanho: 'P', quantidade: 15 },
        { tamanho: 'M', quantidade: 15 },
        { tamanho: 'G', quantidade: 25 },
        { tamanho: 'GG', quantidade: 20 },
      ],
    });
    expect(salva.status).toBe(200);
    expect(salva.body.quantidade_pecas).toBe(75);
    expect(salva.body.tamanhos).toEqual([
      { tamanho: 'P', quantidade: 15 },
      { tamanho: 'M', quantidade: 15 },
      { tamanho: 'G', quantidade: 25 },
      { tamanho: 'GG', quantidade: 20 },
    ]);
    expect(somaQuantidades(salva.body.tamanhos)).toBe(75);

    const divergente = await api.patch(`/api/enfesto/ordem/${ordem.id}/cor`).send({
      cor: 'Preto',
      tamanhos: [
        { tamanho: 'P', quantidade: 15 },
        { tamanho: 'M', quantidade: 20 },
        { tamanho: 'G', quantidade: 25 },
        { tamanho: 'GG', quantidade: 20 },
      ],
    });
    expect(divergente.status).toBe(400);
    expect(divergente.body.erro).toBe(mensagemGradeDivergente('Preto', 80, 75));

    const painel = await api.get(`/api/enfesto?ordem_id=${ordem.id}`);
    expect(tamanhosDe(painel.body, 'Preto')).toEqual([
      { tamanho: 'P', quantidade: 15 },
      { tamanho: 'M', quantidade: 15 },
      { tamanho: 'G', quantidade: 25 },
      { tamanho: 'GG', quantidade: 20 },
    ]);
    expect(tamanhosDe(painel.body, 'Branco')).toEqual([
      { tamanho: 'P', quantidade: 30 },
      { tamanho: 'M', quantidade: 0 },
      { tamanho: 'G', quantidade: 0 },
      { tamanho: 'GG', quantidade: 0 },
    ]);

    const inventado = await api.patch(`/api/enfesto/ordem/${ordem.id}/cor`).send({
      cor: 'Preto',
      tamanhos: [
        { tamanho: 'P', quantidade: 75 },
        { tamanho: 'M', quantidade: 0 },
        { tamanho: 'G', quantidade: 0 },
        { tamanho: 'GG', quantidade: 0 },
        { tamanho: 'XG', quantidade: 0 },
      ],
    });
    expect(inventado.status).toBe(400);
    expect(inventado.body.erro).toBe('O tamanho XG não está na OP');

    const app = createApp(db);
    const { api: outra } = await autenticarNovaEmpresa(app);
    const alheia = await outra.patch(`/api/enfesto/ordem/${ordem.id}/cor`).send({
      cor: 'Preto',
      tamanhos: [
        { tamanho: 'P', quantidade: 15 },
        { tamanho: 'M', quantidade: 15 },
        { tamanho: 'G', quantidade: 25 },
        { tamanho: 'GG', quantidade: 20 },
      ],
    });
    expect(alheia.status).toBe(404);
  });

  it('preserva G1 G2 G3 e não grava P M G GG fixos', async () => {
    const ordem = await criarOp('GRADE-G', ['Preto'], ['G3', 'G1', 'G2'], () => 10);
    const painel = await api.get(`/api/enfesto?ordem_id=${ordem.id}`);
    expect(tamanhosDe(painel.body, 'Preto').map((item: Celula) => item.tamanho)).toEqual(['G1', 'G2', 'G3']);

    const extra = await api.patch(`/api/enfesto/ordem/${ordem.id}/cor`).send({
      cor: 'Preto',
      tamanhos: [
        { tamanho: 'G1', quantidade: 10 },
        { tamanho: 'G2', quantidade: 10 },
        { tamanho: 'G3', quantidade: 10 },
        { tamanho: 'P', quantidade: 0 },
      ],
    });
    expect(extra.status).toBe(400);
    expect(extra.body.erro).toBe('O tamanho P não está na OP');

    const salva = await api.patch(`/api/enfesto/ordem/${ordem.id}/cor`).send({
      cor: 'Preto',
      tamanhos: [
        { tamanho: 'G1', quantidade: 20 },
        { tamanho: 'G2', quantidade: 5 },
        { tamanho: 'G3', quantidade: 5 },
      ],
    });
    expect(salva.status).toBe(200);
    expect(salva.body.tamanhos.map((item: Celula) => item.tamanho)).toEqual(['G1', 'G2', 'G3']);
    expect(somaQuantidades(salva.body.tamanhos)).toBe(30);
  });

  it('finaliza somente quando a soma da cor fecha e baixa o tecido nessa hora', async () => {
    const ordem = await criarOp('GRADE-FIM', ['Preto', 'Branco'], ['P', 'M', 'G', 'GG'], (cor, tamanho) => {
      if (cor === 'Branco') return tamanho === 'GG' ? 40 : 0;
      const mapa: Record<string, number> = { P: 10, M: 20, G: 25, GG: 20 };
      return mapa[tamanho] ?? 0;
    });
    const tecido = await api.post('/api/tecidos').send({
      nome: 'Dryfit grade',
      categoria: 'Malharia',
      unidade: 'KG',
      custo: 10,
      estoque_inicial: 100,
    });
    expect(tecido.status).toBe(201);

    const aberto = await api.post('/api/enfesto').send({ ordem_id: ordem.id, cor: 'Preto' });
    expect(aberto.status).toBe(201);
    const consumo = {
      tecido_id: tecido.body.id as number,
      folhas: 4,
      comprimento: 1.2,
      peso: 8,
      unidade: 'KG' as const,
    };
    const divergente = await api.post(`/api/enfesto/${aberto.body.id}/finalizar`).send({
      ...consumo,
      tamanhos: [
        { tamanho: 'P', quantidade: 30 },
        { tamanho: 'M', quantidade: 20 },
        { tamanho: 'G', quantidade: 25 },
        { tamanho: 'GG', quantidade: 20 },
      ],
    });
    expect(divergente.status).toBe(400);
    expect(divergente.body.erro).toBe(mensagemGradeDivergente('Preto', 95, 75));
    expect((await api.get(`/api/enfesto/${aberto.body.id}`)).body.status).toBe('em_enfesto');
    expect((await api.get(`/api/tecidos/${tecido.body.id}`)).body.estoque).toBe(100);
    const aposFalha = await api.get(`/api/enfesto?ordem_id=${ordem.id}`);
    expect(tamanhosDe(aposFalha.body, 'Preto').find((item: Celula) => item.tamanho === 'P')?.quantidade).toBe(10);

    const ok = await api.post(`/api/enfesto/${aberto.body.id}/finalizar`).send({
      ...consumo,
      tamanhos: [
        { tamanho: 'P', quantidade: 5 },
        { tamanho: 'M', quantidade: 25 },
        { tamanho: 'G', quantidade: 25 },
        { tamanho: 'GG', quantidade: 20 },
      ],
    });
    expect(ok.status).toBe(200);
    expect(ok.body.status).toBe('finalizado');
    expect(ok.body.unidade).toBe('KG');
    expect(ok.body.quantidade_consumida).toBeCloseTo(8);
    expect(ok.body.saldo_posterior).toBeCloseTo(92);
    expect((await api.get(`/api/tecidos/${tecido.body.id}`)).body.estoque).toBeCloseTo(92);

    const painel = await api.get(`/api/enfesto?ordem_id=${ordem.id}`);
    expect(tamanhosDe(painel.body, 'Preto')).toEqual([
      { tamanho: 'P', quantidade: 5 },
      { tamanho: 'M', quantidade: 25 },
      { tamanho: 'G', quantidade: 25 },
      { tamanho: 'GG', quantidade: 20 },
    ]);
    expect(tamanhosDe(painel.body, 'Branco').find((item: Celula) => item.tamanho === 'GG')?.quantidade).toBe(40);
    const branco = painel.body.cores.find((item: { cor: string }) => item.cor === 'Branco');
    expect(branco.status).toBe('pendente');

    const travada = await api.patch(`/api/enfesto/ordem/${ordem.id}/cor`).send({
      cor: 'Preto',
      tamanhos: [
        { tamanho: 'P', quantidade: 10 },
        { tamanho: 'M', quantidade: 20 },
        { tamanho: 'G', quantidade: 25 },
        { tamanho: 'GG', quantidade: 20 },
      ],
    });
    expect(travada.status).toBe(409);
    expect(tamanhosDe((await api.get(`/api/enfesto?ordem_id=${ordem.id}`)).body, 'Preto')[0].quantidade).toBe(5);
  });

  it('mantém OP antiga sem grade e só finaliza se a soma enviada fechar', async () => {
    const legado = await api.post('/api/ordens').send({
      cliente: 'Loja Antiga',
      produto: 'Camisa legada',
      tamanho: 'M',
      quantidade: 12,
    });
    expect(legado.status).toBe(201);
    const painel = await api.get(`/api/enfesto?ordem_id=${legado.body.id}`);
    expect(painel.body.cores).toEqual([
      expect.objectContaining({
        cor: 'Única',
        quantidade_pecas: 12,
        tamanhos: [],
        grade_persistida: false,
        status: 'pendente',
      }),
    ]);
    const semGrade = await api.patch(`/api/enfesto/ordem/${legado.body.id}/cor`).send({
      cor: 'Única',
      tamanhos: [{ tamanho: 'P', quantidade: 12 }],
    });
    expect(semGrade.status).toBe(400);
    expect(semGrade.body.erro).toBe('Essa cor não tem grade de tamanhos na OP');

    const tecido = await api.post('/api/tecidos').send({
      nome: 'Tactel legado',
      categoria: 'Sintético',
      unidade: 'METRO',
      custo: 4,
      estoque_inicial: 50,
    });
    const aberto = await api.post('/api/enfesto').send({ ordem_id: legado.body.id, cor: 'Única' });
    expect(aberto.status).toBe(201);
    const consumo = {
      tecido_id: tecido.body.id as number,
      folhas: 2,
      comprimento: 3,
      metragem: 6,
      unidade: 'METRO' as const,
    };
    const divergente = await api.post(`/api/enfesto/${aberto.body.id}/finalizar`).send({
      ...consumo,
      tamanhos: [{ tamanho: 'M', quantidade: 9 }],
    });
    expect(divergente.status).toBe(400);
    expect(divergente.body.erro).toBe(mensagemGradeDivergente('Única', 9, 12));
    expect((await api.get(`/api/enfesto/${aberto.body.id}`)).body.status).toBe('em_enfesto');
    expect((await api.get(`/api/tecidos/${tecido.body.id}`)).body.estoque).toBe(50);

    const ok = await api.post(`/api/enfesto/${aberto.body.id}/finalizar`).send(consumo);
    expect(ok.status).toBe(200);
    expect(ok.body.status).toBe('finalizado');
    expect(ok.body.quantidade_consumida).toBeCloseTo(6);
    expect((await api.get(`/api/tecidos/${tecido.body.id}`)).body.estoque).toBeCloseTo(44);
  });
});
