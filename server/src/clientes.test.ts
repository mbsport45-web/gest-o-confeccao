import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';
import { createApp } from './app.js';
import { createDatabase, type AppDatabase } from './db.js';

const CPF_VALIDO = '52998224725';
const CNPJ_VALIDO = '11444777000161';

const clienteBase = {
  nome: 'Loja Central Ltda',
  cpf_cnpj: CNPJ_VALIDO,
  contato: 'Ana Souza',
  telefone: '1133334444',
  whatsapp: '11988887777',
  email: 'contato@lojacentral.com',
  endereco: 'Rua das Costuras, 100',
  cidade: 'São Paulo',
  estado: 'SP',
  cep: '01310100',
  condicao_pagamento: '30 dias',
  limite_credito: 15000,
  observacoes: 'Cliente recorrente',
};

describe('API de clientes', () => {
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
    const res = await request(app).get('/api/clientes');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      data: [],
      pagina: 1,
      por_pagina: 10,
      total: 0,
      total_paginas: 1,
    });
  });

  it('cria um cliente completo', async () => {
    const res = await request(app).post('/api/clientes').send(clienteBase);
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      nome: 'Loja Central Ltda',
      cpf_cnpj: CNPJ_VALIDO,
      contato: 'Ana Souza',
      email: 'contato@lojacentral.com',
      estado: 'SP',
      cep: '01310100',
      limite_credito: 15000,
      status: 'ativo',
    });
    expect(res.body.id).toBeGreaterThan(0);
    expect(res.body.criado_em).toBeTruthy();
    expect(res.body.atualizado_em).toBeTruthy();
  });

  it('rejeita CPF/CNPJ inválido', async () => {
    const res = await request(app).post('/api/clientes').send({
      nome: 'Pessoa',
      cpf_cnpj: '11111111111',
    });
    expect(res.status).toBe(400);
    expect(res.body.erro).toBe('Dados inválidos');
  });

  it('rejeita email inválido e nome vazio', async () => {
    const res = await request(app).post('/api/clientes').send({
      nome: '   ',
      email: 'nao-e-email',
    });
    expect(res.status).toBe(400);
    expect(res.body.detalhes.nome).toBeDefined();
    expect(res.body.detalhes.email).toBeDefined();
  });

  it('impede CPF/CNPJ duplicado', async () => {
    await request(app).post('/api/clientes').send(clienteBase);
    const res = await request(app).post('/api/clientes').send({
      ...clienteBase,
      nome: 'Outra Loja',
    });
    expect(res.status).toBe(409);
    expect(res.body.erro).toBe('CPF/CNPJ já cadastrado');
  });

  it('busca, filtra e pagina', async () => {
    await request(app).post('/api/clientes').send(clienteBase);
    await request(app).post('/api/clientes').send({
      nome: 'Atelier Norte',
      cpf_cnpj: CPF_VALIDO,
      cidade: 'Campinas',
      estado: 'SP',
      status: 'inativo',
    });
    await request(app).post('/api/clientes').send({
      nome: 'Confecções Sul',
      cidade: 'Curitiba',
      estado: 'PR',
    });

    const busca = await request(app).get('/api/clientes').query({ q: 'Central' });
    expect(busca.status).toBe(200);
    expect(busca.body.total).toBe(1);
    expect(busca.body.data[0].nome).toBe('Loja Central Ltda');

    const ativos = await request(app).get('/api/clientes').query({ status: 'ativo' });
    expect(ativos.body.total).toBe(2);

    const sp = await request(app).get('/api/clientes').query({ estado: 'SP' });
    expect(sp.body.total).toBe(2);

    const pagina = await request(app)
      .get('/api/clientes')
      .query({ pagina: 2, por_pagina: 2 });
    expect(pagina.body.pagina).toBe(2);
    expect(pagina.body.data).toHaveLength(1);
    expect(pagina.body.total).toBe(3);
    expect(pagina.body.total_paginas).toBe(2);
  });

  it('detalha, edita e altera status', async () => {
    const criada = await request(app).post('/api/clientes').send(clienteBase);

    const detalhe = await request(app).get(`/api/clientes/${criada.body.id}`);
    expect(detalhe.status).toBe(200);
    expect(detalhe.body.email).toBe('contato@lojacentral.com');

    const editada = await request(app)
      .patch(`/api/clientes/${criada.body.id}`)
      .send({ cidade: 'Guarulhos', limite_credito: 8000 });
    expect(editada.status).toBe(200);
    expect(editada.body.cidade).toBe('Guarulhos');
    expect(editada.body.limite_credito).toBe(8000);
    expect(editada.body.nome).toBe('Loja Central Ltda');

    const inativo = await request(app)
      .patch(`/api/clientes/${criada.body.id}/status`)
      .send({ status: 'inativo' });
    expect(inativo.status).toBe(200);
    expect(inativo.body.status).toBe('inativo');

    const ativo = await request(app)
      .patch(`/api/clientes/${criada.body.id}/status`)
      .send({ status: 'ativo' });
    expect(ativo.body.status).toBe('ativo');
  });

  it('exclui cliente sem vínculos e bloqueia quando há OP', async () => {
    const livre = await request(app).post('/api/clientes').send({
      nome: 'Cliente Livre',
    });
    const delLivre = await request(app).delete(`/api/clientes/${livre.body.id}`);
    expect(delLivre.status).toBe(204);

    const vinculado = await request(app).post('/api/clientes').send({
      nome: 'Cliente com OP',
      cpf_cnpj: CPF_VALIDO,
    });
    await request(app).post('/api/ordens').send({
      cliente: 'Cliente com OP',
      produto: 'Camiseta',
      tamanho: 'M',
      quantidade: 10,
    });

    const delBloqueado = await request(app).delete(
      `/api/clientes/${vinculado.body.id}`,
    );
    expect(delBloqueado.status).toBe(409);
    expect(delBloqueado.body.erro).toMatch(/ordens de produção/);

    const aindaExiste = await request(app).get(
      `/api/clientes/${vinculado.body.id}`,
    );
    expect(aindaExiste.status).toBe(200);
  });

  it('retorna 404 para cliente inexistente', async () => {
    const res = await request(app).get('/api/clientes/9999');
    expect(res.status).toBe(404);
  });
});
