import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from './app.js';
import { createDatabase, type AppDatabase } from './db.js';
import { autenticar, type TestApi } from './httpTest.js';
import type { Express } from 'express';

describe('OCs disponíveis/estampas', () => {
  let db: AppDatabase;
  let app: Express;
  let api: TestApi;

  beforeEach(async () => {
    db = createDatabase(':memory:');
    app = createApp(db);
    api = await autenticar(app);
  });

  afterEach(() => {
    db.close();
  });

  async function criarFichaEntregue(dados?: {
    sku?: string;
    modelo?: string;
    imagem?: string;
    categoria?: string;
  }) {
    const materia = await api.post('/api/materias-primas').send({
      codigo: `MALHA-${Math.random().toString(16).slice(2, 6)}`,
      nome: 'Malha PV',
      tipo: 'tecido',
      unidade: 'KG',
      composicao: '67% poliester 33% viscose',
    });
    expect(materia.status).toBe(201);
    await api.post('/api/estoque/movimentos').send({
      tipo: 'entrada',
      quantidade: 20,
      materia_prima_id: materia.body.id,
    });
    const sku = dados?.sku ?? `CAM-EST-${Math.random().toString(16).slice(2, 8)}`;
    const produto = await api.post('/api/produtos').send({
      sku,
      nome: dados?.modelo ?? 'Camiseta Estampa',
      categoria: dados?.categoria ?? 'Camiseta',
      imagem: dados?.imagem,
    });
    expect(produto.status).toBe(201);
    const op = await api.post('/api/ordens').send({
      cliente: 'Loja Estampa',
      produto_id: produto.body.id,
      quantidade: 6,
      requisitos: [{ materia_prima_id: materia.body.id, quantidade: 0.2 }],
      grade: [
        { cor: 'Preto', tamanho: 'M', quantidade: 4 },
        { cor: 'Preto', tamanho: 'G', quantidade: 2 },
      ],
      status: 'planejada',
    });
    expect(op.status).toBe(201);
    await api.post('/api/etapas/fluxo').send({ ordem_id: op.body.id });
    const corte = await api.post(`/api/ordens/${op.body.id}/ordem-corte`).send({});
    expect([200, 201]).toContain(corte.status);
    await api.patch(`/api/ordens/${op.body.id}/ordem-corte`).send({
      modelo: dados?.modelo ?? 'Camiseta Estampa',
      referencia: sku,
      oficinas: [{ oficina: 'Oficina Norte', costureiro: 'Ana Souza' }],
    });
    await api.post(`/api/ordens/${op.body.id}/ordem-corte/enviar-enfesto`).send({});
    await api.post(`/api/ordens/${op.body.id}/ordem-corte/apontamento`).send({ acao: 'iniciar_enfesto' });
    await api.post(`/api/ordens/${op.body.id}/ordem-corte/apontamento`).send({ acao: 'iniciar_corte' });
    await api.post(`/api/ordens/${op.body.id}/ordem-corte/apontamento`).send({
      acao: 'concluir_corte',
      consumo_real: 1.2,
      quantidade_cortada: 6,
      materia_prima_id: materia.body.id,
    });
    const liberada = await api.post(`/api/etapas/liberacao/${op.body.id}`).send({
      costureiro: 'Ana Souza',
      valor_peca: 3,
      oficina: 'Oficina Norte',
      data_liberacao: '2026-10-01',
    });
    expect(liberada.status).toBe(200);
    const entrega = await api.post(`/api/etapas/liberacao/${op.body.id}/entrega`).send({});
    expect(entrega.status).toBe(200);
    expect(entrega.body.status_processo).toBe('entregue');
    return {
      op: op.body as { id: number; codigo: string },
      produto: produto.body as { id: number; sku: string; nome: string },
      sku,
    };
  }

  it('lista vazia e completar sem entregues não cria registros', async () => {
    const lista = await api.get('/api/estampas');
    expect(lista.status).toBe(200);
    expect(lista.body.data).toEqual([]);
    expect(lista.body.totais.disponiveis).toBe(0);
    const completar = await api.post('/api/estampas/completar').send({});
    expect(completar.status).toBe(200);
    expect(completar.body).toMatchObject({ importados: 0, atualizados: 0, disponiveis: 0 });
  });

  it('entra automaticamente ao confirmar a entrega e reaproveita foto/REF do catálogo', async () => {
    const foto = 'https://catalogo/camiseta.png';
    const criada = await criarFichaEntregue({
      sku: 'CAM-EST-01',
      modelo: 'Camiseta Estampa',
      imagem: foto,
      categoria: 'Camiseta',
    });
    const lista = await api.get('/api/estampas');
    expect(lista.status).toBe(200);
    expect(lista.body.totais.disponiveis).toBe(1);
    expect(lista.body.data).toHaveLength(1);
    expect(lista.body.data[0]).toMatchObject({
      modelo: 'Camiseta Estampa',
      referencia: 'CAM-EST-01',
      peca: 'Camiseta Estampa',
      quantidade: 6,
      costureiro: 'Ana Souza',
      imagem: foto,
      categoria: 'Camiseta',
    });
    expect(lista.body.data[0].codigo_oc).toMatch(/^OC-/);
    expect(lista.body.data[0].cores).toContain('Preto');
    expect(lista.body.data[0].tamanhos).toEqual(expect.arrayContaining(['M', 'G']));
    const clientes = await api.get('/api/clientes');
    expect(clientes.status).toBe(200);
    expect(Array.isArray(clientes.body.data)).toBe(true);
    const oc = await api.get(`/api/ordens/${criada.op.id}`);
    expect(oc.body.ordem_corte.status_processo).toBe('entregue');
  });

  it('completar importa fichas já entregues que ainda não estavam no módulo', async () => {
    await criarFichaEntregue({ sku: 'CAM-BACK', modelo: 'Camiseta Backfill' });
    db.prepare(`DELETE FROM ocs_disponiveis_estampas`).run();
    const vazia = await api.get('/api/estampas');
    expect(vazia.body.totais.disponiveis).toBe(0);
    const completar = await api.post('/api/estampas/completar').send({});
    expect(completar.body).toMatchObject({ importados: 1, atualizados: 0, disponiveis: 1 });
    const lista = await api.get('/api/estampas');
    expect(lista.body.data[0].referencia).toBe('CAM-BACK');
  });

  it('completar dados pelas OCs importa e na segunda vez só atualiza, sem duplicar', async () => {
    const primeira = await criarFichaEntregue({ sku: 'CAM-DUP-1', modelo: 'Polo Dup' });
    const listaAntes = await api.get('/api/estampas');
    expect(listaAntes.body.totais.disponiveis).toBe(1);

    const completar = await api.post('/api/estampas/completar').send({});
    expect(completar.status).toBe(200);
    expect(completar.body.disponiveis).toBe(1);
    expect(completar.body.importados + completar.body.atualizados).toBe(1);

    const deNovo = await api.post('/api/estampas/completar').send({});
    expect(deNovo.body.importados).toBe(0);
    expect(deNovo.body.atualizados).toBe(1);
    expect(deNovo.body.disponiveis).toBe(1);

    const lista = await api.get('/api/estampas');
    expect(lista.body.data).toHaveLength(1);
    expect(lista.body.data[0].referencia).toBe(primeira.sku);
    const duplicados = db
      .prepare(`SELECT COUNT(*) AS n FROM ocs_disponiveis_estampas`)
      .get() as { n: number };
    expect(duplicados.n).toBe(1);
  });

  it('pesquisa por OC, REF ou costureiro e filtra por tipo', async () => {
    await criarFichaEntregue({ sku: 'CAM-FILTRO', modelo: 'Camiseta Filtro', categoria: 'Camiseta' });
    const porRef = await api.get('/api/estampas').query({ q: 'CAM-FILTRO' });
    expect(porRef.body.data).toHaveLength(1);
    const porCostureiro = await api.get('/api/estampas').query({ q: 'Ana Souza' });
    expect(porCostureiro.body.data).toHaveLength(1);
    const porTipo = await api.get('/api/estampas').query({ tipo: 'Camiseta' });
    expect(porTipo.body.data).toHaveLength(1);
    const outro = await api.get('/api/estampas').query({ tipo: 'Calça' });
    expect(outro.body.data).toHaveLength(0);
    expect(outro.body.totais.disponiveis).toBe(1);
  });

  it('cadastra amostra manual sem OC e não mistura com o indicador de ordens disponíveis', async () => {
    await criarFichaEntregue({ sku: 'CAM-OC', modelo: 'Camiseta OC' });
    const criada = await api.post('/api/estampas/amostras').send({
      modelo: 'Polo piloto',
      referencia: 'POLO-AM',
      tipo_peca: 'Polo',
      cor: 'Laranja',
      tamanho: 'M',
      quantidade: 2,
      observacoes: 'Antes da produção',
    });
    expect(criada.status).toBe(201);
    expect(criada.body).toMatchObject({
      origem: 'manual',
      modelo: 'Polo piloto',
      referencia: 'POLO-AM',
      ordem_corte_id: null,
      codigo_oc: '',
    });
    const lista = await api.get('/api/estampas');
    expect(lista.body.totais.disponiveis).toBe(1);
    expect(lista.body.data).toHaveLength(2);
    expect(lista.body.data.some((item: { origem: string }) => item.origem === 'manual')).toBe(true);
    const deNovo = await api.post('/api/estampas/amostras').send({
      modelo: 'Polo piloto atualizado',
      referencia: 'POLO-AM',
      quantidade: 3,
    });
    expect(deNovo.status).toBe(201);
    expect(deNovo.body.id).toBe(criada.body.id);
    expect(deNovo.body.modelo).toBe('Polo piloto atualizado');
    const depois = await api.get('/api/estampas');
    expect(depois.body.data.filter((item: { referencia: string }) => item.referencia === 'POLO-AM')).toHaveLength(1);
    expect(depois.body.totais.disponiveis).toBe(1);
    const conflito = await api.post('/api/estampas/amostras').send({
      modelo: 'Camiseta OC',
      referencia: 'CAM-OC',
    });
    expect(conflito.status).toBe(409);
  });

  it('edita amostra manual e troca a foto sem alterar as OCs', async () => {
    const criada = await api.post('/api/estampas/amostras').send({
      modelo: 'Short teste',
      referencia: 'SH-1',
    });
    const editada = await api.patch(`/api/estampas/amostras/${criada.body.id}`).send({
      cor: 'Preto',
      tamanho: 'G',
      quantidade: 1,
    });
    expect(editada.status).toBe(200);
    expect(editada.body.cores).toEqual(['Preto']);
    const foto = await api.patch(`/api/estampas/amostras/${criada.body.id}/imagem`).send({
      imagem: 'https://amostra/short.png',
    });
    expect(foto.status).toBe(200);
    expect(foto.body.imagem).toBe('https://amostra/short.png');
    expect(foto.body.origem).toBe('manual');
    const ocs = db.prepare(`SELECT COUNT(*) AS n FROM ocs_disponiveis_estampas`).get() as { n: number };
    expect(ocs.n).toBe(0);
  });
});
