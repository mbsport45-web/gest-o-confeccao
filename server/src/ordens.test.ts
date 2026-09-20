import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';
import { createApp } from './app.js';
import { createDatabase, type AppDatabase } from './db.js';

describe('API de ordens de produção', () => {
  let app: Express;
  let db: AppDatabase;

  beforeEach(() => {
    db = createDatabase(':memory:');
    app = createApp(db);
  });

  afterEach(() => {
    db.close();
  });

  async function criarProdutoComVariante() {
    const produto = await request(app).post('/api/produtos').send({
      sku: 'CAM-OP',
      nome: 'Camiseta OP',
      cores: ['Preto'],
      tamanhos: ['M', 'G'],
    });
    return produto.body as {
      id: number;
      nome: string;
      variantes: Array<{ id: number; tamanho: string; sku: string }>;
    };
  }

  async function criarMateria() {
    const materia = await request(app).post('/api/materias-primas').send({
      codigo: 'TEC-OP',
      nome: 'Malha OP',
      tipo: 'tecido',
      unidade: 'KG',
    });
    return materia.body as { id: number; nome: string };
  }

  it('responde ao health check', async () => {
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
  });

  it('começa sem ordens', async () => {
    const res = await request(app).get('/api/ordens');
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  it('cria uma ordem de produção', async () => {
    const res = await request(app).post('/api/ordens').send({
      cliente: 'Loja Central',
      produto: 'Camiseta Polo',
      tamanho: 'M',
      quantidade: 120,
    });

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      cliente: 'Loja Central',
      produto: 'Camiseta Polo',
      tamanho: 'M',
      quantidade: 120,
      status: 'pendente',
      prioridade: 'normal',
    });
    expect(res.body.id).toBeGreaterThan(0);
    expect(res.body.codigo).toBe('OP-0001');
  });

  it('persiste e lista ordens criadas', async () => {
    await request(app).post('/api/ordens').send({
      cliente: 'Loja Central',
      produto: 'Camiseta Polo',
      tamanho: 'M',
      quantidade: 120,
    });

    const res = await request(app).get('/api/ordens');
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].cliente).toBe('Loja Central');
  });

  it('rejeita dados inválidos', async () => {
    const res = await request(app).post('/api/ordens').send({
      cliente: '',
      produto: 'Camiseta',
      tamanho: 'G',
      quantidade: -5,
    });

    expect(res.status).toBe(400);
    expect(res.body.erro).toBe('Dados inválidos');
  });

  it('atualiza o status de uma ordem', async () => {
    const criada = await request(app).post('/api/ordens').send({
      cliente: 'Confecções ABC',
      produto: 'Calça Jeans',
      tamanho: '42',
      quantidade: 50,
    });

    const res = await request(app)
      .patch(`/api/ordens/${criada.body.id}`)
      .send({ status: 'em_producao' });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('em_producao');
  });

  it('remove uma ordem', async () => {
    const criada = await request(app).post('/api/ordens').send({
      cliente: 'Confecções ABC',
      produto: 'Calça Jeans',
      tamanho: '42',
      quantidade: 50,
    });

    const del = await request(app).delete(`/api/ordens/${criada.body.id}`);
    expect(del.status).toBe(204);

    const res = await request(app).get('/api/ordens');
    expect(res.body).toHaveLength(0);
  });

  it('retorna 404 para ordem inexistente', async () => {
    const res = await request(app).get('/api/ordens/9999');
    expect(res.status).toBe(404);
  });

  it('cria OP completa com produto, variante, prioridade e responsável', async () => {
    const cliente = await request(app).post('/api/clientes').send({ nome: 'Atelier Norte' });
    const produto = await criarProdutoComVariante();
    const variante = produto.variantes.find((v) => v.tamanho === 'M')!;

    const res = await request(app).post('/api/ordens').send({
      cliente_id: cliente.body.id,
      produto_id: produto.id,
      variante_id: variante.id,
      quantidade: 40,
      prioridade: 'alta',
      data_prevista: '2026-10-01',
      responsavel: 'Maria Corte',
      observacoes: 'Lote piloto',
      status: 'planejada',
    });

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      cliente: 'Atelier Norte',
      produto: 'Camiseta OP',
      tamanho: 'M',
      quantidade: 40,
      status: 'planejada',
      prioridade: 'alta',
      responsavel: 'Maria Corte',
      cliente_id: cliente.body.id,
      produto_id: produto.id,
      variante_id: variante.id,
    });
    expect(res.body.codigo).toMatch(/^OP-/);
  });

  it('lista com busca, filtros e paginação', async () => {
    await request(app).post('/api/ordens').send({
      cliente: 'Loja A',
      produto: 'Camiseta',
      tamanho: 'M',
      quantidade: 10,
      status: 'planejada',
      prioridade: 'baixa',
    });
    await request(app).post('/api/ordens').send({
      cliente: 'Loja B',
      produto: 'Calça',
      tamanho: '42',
      quantidade: 8,
      status: 'corte',
      prioridade: 'urgente',
    });
    await request(app).post('/api/ordens').send({
      cliente: 'Loja C',
      produto: 'Jaqueta',
      tamanho: 'G',
      quantidade: 5,
      status: 'planejada',
      prioridade: 'alta',
    });

    const busca = await request(app).get('/api/ordens').query({ q: 'Jaqueta', pagina: 1 });
    expect(busca.status).toBe(200);
    expect(busca.body.total).toBe(1);
    expect(busca.body.data[0].produto).toBe('Jaqueta');

    const filtro = await request(app)
      .get('/api/ordens')
      .query({ status: 'planejada', prioridade: 'alta', pagina: 1 });
    expect(filtro.body.total).toBe(1);
    expect(filtro.body.data[0].cliente).toBe('Loja C');

    const pagina = await request(app)
      .get('/api/ordens')
      .query({ pagina: 2, por_pagina: 2 });
    expect(pagina.body.data).toHaveLength(1);
    expect(pagina.body.total).toBe(3);
    expect(pagina.body.total_paginas).toBe(2);
  });

  it('grava BOM, copia requisitos e consulta disponibilidade', async () => {
    const produto = await criarProdutoComVariante();
    const variante = produto.variantes[0];
    const materia = await criarMateria();

    const ficha = await request(app).put('/api/ordens/ficha-tecnica').send({
      produto_id: produto.id,
      variante_id: variante.id,
      itens: [{ materia_prima_id: materia.id, quantidade: 0.4 }],
    });
    expect(ficha.status).toBe(200);
    expect(ficha.body.itens).toHaveLength(1);

    await request(app).post('/api/estoque/movimentos').send({
      tipo: 'entrada',
      quantidade: 20,
      materia_prima_id: materia.id,
    });

    const op = await request(app).post('/api/ordens').send({
      produto_id: produto.id,
      variante_id: variante.id,
      cliente: 'Loja BOM',
      quantidade: 10,
      status: 'planejada',
    });
    expect(op.status).toBe(201);
    expect(op.body.requisitos).toHaveLength(1);
    expect(op.body.requisitos[0]).toMatchObject({
      materia_prima_id: materia.id,
      quantidade_unitaria: 0.4,
      quantidade_total: 4,
      estoque_disponivel: 20,
      suficiente: true,
    });

    const get = await request(app)
      .get('/api/ordens/ficha-tecnica')
      .query({ produto_id: produto.id, variante_id: variante.id });
    expect(get.body.itens[0].quantidade).toBe(0.4);

    await request(app).post('/api/ordens').send({
      cliente: 'Loja BOM 2',
      produto_id: produto.id,
      variante_id: variante.id,
      quantidade: 1,
      status: 'planejada',
      requisitos: [{ materia_prima_id: materia.id, quantidade: 9 }],
    });
    const fichaDepois = await request(app)
      .get('/api/ordens/ficha-tecnica')
      .query({ produto_id: produto.id, variante_id: variante.id });
    expect(fichaDepois.body.itens[0].quantidade).toBe(0.4);
  });

  it('consome estoque ao ir para corte e estorna no cancelamento', async () => {
    const produto = await criarProdutoComVariante();
    const variante = produto.variantes[0];
    const materia = await criarMateria();
    await request(app).put('/api/ordens/ficha-tecnica').send({
      produto_id: produto.id,
      variante_id: variante.id,
      itens: [{ materia_prima_id: materia.id, quantidade: 1 }],
    });
    await request(app).post('/api/estoque/movimentos').send({
      tipo: 'entrada',
      quantidade: 5,
      materia_prima_id: materia.id,
    });

    const op = await request(app).post('/api/ordens').send({
      cliente: 'Loja Corte',
      produto_id: produto.id,
      variante_id: variante.id,
      quantidade: 3,
      status: 'planejada',
    });

    const corte = await request(app)
      .patch(`/api/ordens/${op.body.id}`)
      .send({ status: 'corte' });
    expect(corte.status).toBe(200);
    expect(corte.body.status).toBe('corte');

    const saldo = await request(app).get('/api/estoque').query({ tipo: 'materia' });
    expect(saldo.body.data[0].quantidade).toBe(2);

    const cancelar = await request(app)
      .patch(`/api/ordens/${op.body.id}`)
      .send({ status: 'cancelada' });
    expect(cancelar.status).toBe(200);
    const saldoDepois = await request(app).get('/api/estoque').query({ tipo: 'materia' });
    expect(saldoDepois.body.data[0].quantidade).toBe(5);
  });

  it('bloqueia corte quando o estoque da matéria é insuficiente', async () => {
    const produto = await criarProdutoComVariante();
    const variante = produto.variantes[0];
    const materia = await criarMateria();
    await request(app).post('/api/ordens').send({
      cliente: 'Loja Sem Tecido',
      produto_id: produto.id,
      variante_id: variante.id,
      quantidade: 8,
      status: 'planejada',
      requisitos: [{ materia_prima_id: materia.id, quantidade: 2 }],
    });

    const lista = await request(app).get('/api/ordens').query({ pagina: 1 });
    const id = lista.body.data[0].id;
    const corte = await request(app).patch(`/api/ordens/${id}`).send({ status: 'corte' });
    expect(corte.status).toBe(409);
    expect(corte.body.erro).toMatch(/insuficiente/i);

    const ainda = await request(app).get(`/api/ordens/${id}`);
    expect(ainda.body.status).toBe('planejada');
  });

  it('impede transição a partir de status terminal e exclusão em produção', async () => {
    const criada = await request(app).post('/api/ordens').send({
      cliente: 'Loja Fim',
      produto: 'Peça',
      tamanho: 'U',
      quantidade: 1,
    });
    await request(app).patch(`/api/ordens/${criada.body.id}`).send({ status: 'concluida' });
    const voltar = await request(app)
      .patch(`/api/ordens/${criada.body.id}`)
      .send({ status: 'planejada' });
    expect(voltar.status).toBe(409);

    const emProd = await request(app).post('/api/ordens').send({
      cliente: 'Loja Fim',
      produto: 'Peça',
      tamanho: 'U',
      quantidade: 1,
      status: 'costura',
    });
    const del = await request(app).delete(`/api/ordens/${emProd.body.id}`);
    expect(del.status).toBe(409);
  });

  it('edita campos da OP planejada', async () => {
    const criada = await request(app).post('/api/ordens').send({
      cliente: 'Loja Edit',
      produto: 'Camisa',
      tamanho: 'P',
      quantidade: 4,
      status: 'planejada',
    });
    const res = await request(app).patch(`/api/ordens/${criada.body.id}`).send({
      quantidade: 9,
      prioridade: 'urgente',
      responsavel: 'João',
      observacoes: 'Antecipar',
    });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      quantidade: 9,
      prioridade: 'urgente',
      responsavel: 'João',
      observacoes: 'Antecipar',
    });
  });

  it('não altera contratos de clientes, produtos, matérias e estoque', async () => {
    const cliente = await request(app).post('/api/clientes').send({ nome: 'Loja Contrato OP' });
    expect(cliente.status).toBe(201);
    const produto = await request(app).post('/api/produtos').send({
      nome: 'Calça Contrato',
      sku: 'CAL-OP-C',
    });
    expect(produto.status).toBe(201);
    const materia = await request(app).post('/api/materias-primas').send({
      nome: 'Linha Contrato',
      tipo: 'linha',
    });
    expect(materia.status).toBe(201);
    const mov = await request(app).post('/api/estoque/movimentos').send({
      tipo: 'entrada',
      quantidade: 3,
      materia_prima_id: materia.body.id,
    });
    expect(mov.status).toBe(201);
    const listaEstoque = await request(app).get('/api/estoque');
    expect(listaEstoque.status).toBe(200);
  });
});
