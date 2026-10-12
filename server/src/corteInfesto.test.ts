import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from './app.js';
import { createDatabase, type AppDatabase } from './db.js';
import { autenticar, autenticarNovaEmpresa, type TestApi } from './httpTest.js';

describe('corte e infesto', () => {
  let db: AppDatabase;
  let api: TestApi;

  beforeEach(async () => {
    db = createDatabase(':memory:');
    api = await autenticar(createApp(db));
  });

  afterEach(() => {
    db.close();
  });

  async function tecido(dados: { nome: string; unidade?: string; tipo?: string }) {
    const materia = await api.post('/api/materias-primas').send({
      nome: dados.nome,
      tipo: dados.tipo ?? 'tecido',
      unidade: dados.unidade ?? 'KG',
    });
    expect(materia.status).toBe(201);
    return materia.body as { id: number; unidade: string };
  }

  async function ordem(quantidade = 10, cor = 'Preto') {
    const criada = await api.post('/api/ordens').send({
      cliente: 'Loja Corte',
      produto: 'Bermuda',
      quantidade,
      status: 'planejada',
      grade: [
        { cor, tamanho: 'M', quantidade },
        { cor: 'Branco', tamanho: 'M', quantidade: 0 },
      ],
    });
    expect(criada.status).toBe(201);
    return criada.body as { id: number; codigo: string };
  }

  async function saldo(materiaId: number) {
    const lista = await api.get('/api/estoque').query({ tipo: 'materia' });
    const item = (lista.body.data as Array<{ materia_prima_id: number; quantidade: number }>).find(
      (saldoItem) => saldoItem.materia_prima_id === materiaId,
    );
    return item?.quantidade ?? 0;
  }

  it('baixa o peso real do tecido em KG, grava o histórico e segue para costura', async () => {
    const malha = await tecido({ nome: 'Malha dry' });
    const linha = await tecido({ nome: 'Linha reta', tipo: 'linha' });
    await api.post('/api/estoque/movimentos').send({
      tipo: 'entrada',
      quantidade: 10,
      materia_prima_id: malha.id,
    });
    const criada = await api.post('/api/ordens').send({
      cliente: 'Loja Corte',
      produto: 'Bermuda',
      quantidade: 10,
      status: 'planejada',
      requisitos: [{ materia_prima_id: malha.id, quantidade: 0.4 }],
      grade: [{ cor: 'Preto', tamanho: 'M', quantidade: 10 }],
    });
    expect(criada.status).toBe(201);
    const op = criada.body as { id: number; codigo: string };
    await api.post('/api/etapas/fluxo').send({ ordem_id: op.id });

    const invalido = await api.post(`/api/ordens/${op.id}/corte-infesto`).send({
      materia_prima_id: linha.id,
      cor: 'Preto',
      quantidade_pecas: 10,
      camadas: 20,
      metragem: 12,
      peso_real: 1.5,
    });
    expect(invalido.status).toBe(400);

    const acima = await api.post(`/api/ordens/${op.id}/corte-infesto`).send({
      materia_prima_id: malha.id,
      cor: 'Preto',
      quantidade_pecas: 11,
      camadas: 20,
      metragem: 12,
      peso_real: 1.5,
    });
    expect(acima.status).toBe(400);

    const corte = await api.post(`/api/ordens/${op.id}/corte-infesto`).send({
      materia_prima_id: malha.id,
      cor: ' preto ',
      quantidade_pecas: 10,
      camadas: 20,
      metragem: 12.5,
      peso_real: 1.5,
    });
    expect(corte.status).toBe(201);
    expect(corte.body.cor).toBe('Preto');
    expect(corte.body.camadas).toBe(20);
    expect(corte.body.metragem).toBe(12.5);
    expect(corte.body.peso_real).toBe(1.5);
    expect(corte.body.quantidade_baixada).toBe(1.5);
    expect(corte.body.ordem.status).toBe('costura');
    expect(await saldo(malha.id)).toBe(8.5);

    const movimentos = await api.get('/api/estoque/movimentos').query({ materia_prima_id: malha.id });
    const saida = (movimentos.body.data as Array<{ tipo: string; quantidade: number; motivo: string }>).find(
      (item) => item.tipo === 'saida',
    );
    expect(saida?.quantidade).toBe(1.5);
    expect(saida?.motivo).toContain(op.codigo);

    const repetido = await api.post(`/api/ordens/${op.id}/corte-infesto`).send({
      materia_prima_id: malha.id,
      cor: 'Preto',
      quantidade_pecas: 10,
      camadas: 20,
      metragem: 12.5,
      peso_real: 1.5,
    });
    expect(repetido.status).toBe(409);
    expect(await saldo(malha.id)).toBe(8.5);

    const etapas = await api.get('/api/etapas').query({ ordem_id: op.id });
    const tipos = etapas.body.data as Array<{ tipo: string; status: string }>;
    expect(tipos.find((etapa) => etapa.tipo === 'corte')?.status).toBe('concluida');
    expect(tipos.find((etapa) => etapa.tipo === 'costura')?.status).toBe('em_andamento');

    const cancelar = await api.patch(`/api/ordens/${op.id}`).send({ status: 'cancelada' });
    expect(cancelar.status).toBe(200);
    expect(await saldo(malha.id)).toBe(10);
  });

  it('não baixa de novo quando o estoque já saiu ao entrar em corte e isola a empresa', async () => {
    const malha = await tecido({ nome: 'Malha já cortada' });
    await api.post('/api/estoque/movimentos').send({
      tipo: 'entrada',
      quantidade: 10,
      materia_prima_id: malha.id,
    });
    const op = await api.post('/api/ordens').send({
      cliente: 'Loja Já',
      produto: 'Camisa',
      tamanho: 'M',
      quantidade: 4,
      status: 'planejada',
      requisitos: [{ materia_prima_id: malha.id, quantidade: 1 }],
    });
    const emCorte = await api.patch(`/api/ordens/${op.body.id}`).send({ status: 'corte' });
    expect(emCorte.status).toBe(200);
    expect(await saldo(malha.id)).toBe(6);

    const corte = await api.post(`/api/ordens/${op.body.id}/corte-infesto`).send({
      materia_prima_id: malha.id,
      cor: 'Azul',
      quantidade_pecas: 4,
      camadas: 8,
      metragem: 6,
      peso_real: 2,
    });
    expect(corte.status).toBe(201);
    expect(corte.body.quantidade_baixada).toBe(0);
    expect(corte.body.ordem.status).toBe('costura');
    expect(await saldo(malha.id)).toBe(6);

    const app = createApp(db);
    const { api: outra } = await autenticarNovaEmpresa(app);
    const alheio = await outra.post(`/api/ordens/${op.body.id}/corte-infesto`).send({
      materia_prima_id: malha.id,
      cor: 'Azul',
      quantidade_pecas: 4,
      camadas: 8,
      metragem: 6,
      peso_real: 2,
    });
    expect(alheio.status).toBe(404);
    const listaOutra = await outra.get('/api/ordens/corte-infesto');
    expect(listaOutra.body).toEqual([]);
  });

  it('recusa a saída quando o tecido não cobre o peso e baixa metragem quando a unidade é MT', async () => {
    const malha = await tecido({ nome: 'Malha curta' });
    const op = await ordem(2);
    const semSaldo = await api.post(`/api/ordens/${op.id}/corte-infesto`).send({
      materia_prima_id: malha.id,
      cor: 'Preto',
      quantidade_pecas: 2,
      camadas: 4,
      metragem: 3,
      peso_real: 1,
    });
    expect(semSaldo.status).toBe(409);
    expect(semSaldo.body.erro).toBe('Estoque insuficiente para a saída');
    const ordemDepois = await api.get(`/api/ordens/${op.id}`);
    expect(ordemDepois.body.status).toBe('planejada');
    expect(await api.get('/api/ordens/corte-infesto')).toMatchObject({ body: [] });

    const metro = await tecido({ nome: 'Tela metro', unidade: 'MT' });
    await api.post('/api/estoque/movimentos').send({
      tipo: 'entrada',
      quantidade: 20,
      materia_prima_id: metro.id,
    });
    const segunda = await ordem(2, 'Verde');
    const corte = await api.post(`/api/ordens/${segunda.id}/corte-infesto`).send({
      materia_prima_id: metro.id,
      cor: 'Verde',
      quantidade_pecas: 2,
      camadas: 3,
      metragem: 7.25,
      peso_real: 0.4,
    });
    expect(corte.status).toBe(201);
    expect(corte.body.quantidade_baixada).toBe(7.25);
    expect(await saldo(metro.id)).toBe(12.75);
  });
});
