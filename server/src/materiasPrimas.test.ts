import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';
import { createApp } from './app.js';
import { createDatabase, type AppDatabase } from './db.js';

const materiaBase = {
  codigo: 'TEC-MALHA-30',
  nome: 'Malha PV 30.1',
  descricao: 'Malha para camiseta polo',
  tipo: 'tecido',
  categoria: 'Malha',
  cor: 'Preto',
  composicao: '67% poliéster 33% viscose',
  largura_cm: 180,
  gramatura: 180,
  unidade: 'KG',
  custo: 28.5,
  estoque_minimo: 15,
  fornecedor: 'Fiação Norte',
  referencia_fornecedor: 'PV301-PRETO',
  ncm: '60041000',
  observacoes: 'Uso em polos',
};

describe('API de matérias-primas', () => {
  let app: Express;
  let db: AppDatabase;

  beforeEach(() => {
    db = createDatabase(':memory:');
    app = createApp(db);
  });

  afterEach(() => {
    db.close();
  });

  it('lista vazia paginada', async () => {
    const res = await request(app).get('/api/materias-primas');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      data: [],
      pagina: 1,
      por_pagina: 10,
      total: 0,
      total_paginas: 1,
    });
  });

  it('cria uma matéria-prima completa', async () => {
    const res = await request(app).post('/api/materias-primas').send(materiaBase);
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      codigo: 'TEC-MALHA-30',
      nome: 'Malha PV 30.1',
      tipo: 'tecido',
      categoria: 'Malha',
      cor: 'Preto',
      unidade: 'KG',
      custo: 28.5,
      estoque_minimo: 15,
      ncm: '60041000',
      status: 'ativo',
    });
    expect(res.body.id).toBeGreaterThan(0);
    expect(res.body.criado_em).toBeTruthy();
    expect(res.body.atualizado_em).toBeTruthy();
  });

  it('rejeita nome vazio, custo negativo e tipo inválido', async () => {
    const res = await request(app).post('/api/materias-primas').send({
      nome: '   ',
      custo: -2,
      tipo: 'invalido',
    });
    expect(res.status).toBe(400);
    expect(res.body.erro).toBe('Dados inválidos');
    expect(res.body.detalhes.nome).toBeDefined();
    expect(res.body.detalhes.custo).toBeDefined();
    expect(res.body.detalhes.tipo).toBeDefined();
  });

  it('impede código duplicado', async () => {
    await request(app).post('/api/materias-primas').send(materiaBase);
    const res = await request(app).post('/api/materias-primas').send({
      ...materiaBase,
      nome: 'Outra malha',
    });
    expect(res.status).toBe(409);
    expect(res.body.erro).toBe('Código já cadastrado');
  });

  it('busca, filtra e pagina', async () => {
    await request(app).post('/api/materias-primas').send(materiaBase);
    await request(app).post('/api/materias-primas').send({
      codigo: 'LIN-120',
      nome: 'Linha 120',
      tipo: 'linha',
      categoria: 'Costura',
      unidade: 'UN',
      status: 'inativo',
    });
    await request(app).post('/api/materias-primas').send({
      codigo: 'BOT-18',
      nome: 'Botão 18L',
      tipo: 'botao',
      categoria: 'Aviamento',
      unidade: 'UN',
    });

    const busca = await request(app).get('/api/materias-primas').query({ q: 'Malha' });
    expect(busca.status).toBe(200);
    expect(busca.body.total).toBe(1);
    expect(busca.body.data[0].nome).toBe('Malha PV 30.1');

    const tecidos = await request(app).get('/api/materias-primas').query({ tipo: 'tecido' });
    expect(tecidos.body.total).toBe(1);

    const ativos = await request(app).get('/api/materias-primas').query({ status: 'ativo' });
    expect(ativos.body.total).toBe(2);

    const pagina = await request(app)
      .get('/api/materias-primas')
      .query({ pagina: 2, por_pagina: 2 });
    expect(pagina.body.pagina).toBe(2);
    expect(pagina.body.data).toHaveLength(1);
    expect(pagina.body.total).toBe(3);
    expect(pagina.body.total_paginas).toBe(2);
  });

  it('detalha, edita e altera status', async () => {
    const criada = await request(app).post('/api/materias-primas').send(materiaBase);

    const detalhe = await request(app).get(`/api/materias-primas/${criada.body.id}`);
    expect(detalhe.status).toBe(200);
    expect(detalhe.body.fornecedor).toBe('Fiação Norte');

    const editada = await request(app)
      .patch(`/api/materias-primas/${criada.body.id}`)
      .send({ custo: 31.2, cor: 'Marinho' });
    expect(editada.status).toBe(200);
    expect(editada.body.custo).toBe(31.2);
    expect(editada.body.cor).toBe('Marinho');
    expect(editada.body.nome).toBe('Malha PV 30.1');

    const inativo = await request(app)
      .patch(`/api/materias-primas/${criada.body.id}/status`)
      .send({ status: 'inativo' });
    expect(inativo.status).toBe(200);
    expect(inativo.body.status).toBe('inativo');

    const ativo = await request(app)
      .patch(`/api/materias-primas/${criada.body.id}/status`)
      .send({ status: 'ativo' });
    expect(ativo.body.status).toBe('ativo');
  });

  it('exclui matéria-prima livre e bloqueia quando há vínculo futuro de BOM', async () => {
    const livre = await request(app).post('/api/materias-primas').send({
      nome: 'Etiqueta composta',
      tipo: 'etiqueta',
    });
    const delLivre = await request(app).delete(`/api/materias-primas/${livre.body.id}`);
    expect(delLivre.status).toBe(204);

    const vinculada = await request(app).post('/api/materias-primas').send({
      nome: 'Zíper 18cm',
      tipo: 'ziper',
      codigo: 'ZIP-18',
    });
    db.exec(`
      CREATE TABLE ficha_tecnica_itens (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        materia_prima_id INTEGER NOT NULL
      );
    `);
    db.prepare('INSERT INTO ficha_tecnica_itens (materia_prima_id) VALUES (?)').run(
      vinculada.body.id,
    );

    const delBloqueado = await request(app).delete(
      `/api/materias-primas/${vinculada.body.id}`,
    );
    expect(delBloqueado.status).toBe(409);
    expect(delBloqueado.body.erro).toMatch(/vínculos/);

    const aindaExiste = await request(app).get(
      `/api/materias-primas/${vinculada.body.id}`,
    );
    expect(aindaExiste.status).toBe(200);
  });

  it('não altera contratos de clientes, produtos e ordens', async () => {
    const cliente = await request(app).post('/api/clientes').send({
      nome: 'Loja Materiais',
    });
    expect(cliente.status).toBe(201);

    const produto = await request(app).post('/api/produtos').send({
      nome: 'Camiseta',
      sku: 'CAM-MAT',
    });
    expect(produto.status).toBe(201);

    const ordem = await request(app).post('/api/ordens').send({
      cliente: 'Loja Materiais',
      produto: 'Camiseta',
      tamanho: 'M',
      quantidade: 10,
    });
    expect(ordem.status).toBe(201);
    expect(ordem.body).toMatchObject({
      cliente: 'Loja Materiais',
      produto: 'Camiseta',
      tamanho: 'M',
      quantidade: 10,
      status: 'pendente',
    });
  });

  it('retorna 404 para matéria-prima inexistente', async () => {
    const res = await request(app).get('/api/materias-primas/9999');
    expect(res.status).toBe(404);
  });
});
