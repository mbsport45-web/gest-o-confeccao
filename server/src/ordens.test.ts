import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from './app.js';
import { createDatabase, type AppDatabase } from './db.js';
import { autenticar, autenticarNovaEmpresa, type TestApi } from './httpTest.js';

describe('API de ordens de produção', () => {
  let db: AppDatabase;
  let api: TestApi;

  beforeEach(async () => {
    db = createDatabase(':memory:');
    api = await autenticar(createApp(db));
  });

  afterEach(() => {
    db.close();
  });

  async function criarProdutoComVariante() {
    const produto = await api.post('/api/produtos').send({
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
    const materia = await api.post('/api/materias-primas').send({
      codigo: 'TEC-OP',
      nome: 'Malha OP',
      tipo: 'tecido',
      unidade: 'KG',
    });
    return materia.body as { id: number; nome: string };
  }

  it('responde ao health check', async () => {
    const res = await api.get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
  });

  it('começa sem ordens', async () => {
    const res = await api.get('/api/ordens');
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  it('cria uma ordem de produção', async () => {
    const res = await api.post('/api/ordens').send({
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
    await api.post('/api/ordens').send({
      cliente: 'Loja Central',
      produto: 'Camiseta Polo',
      tamanho: 'M',
      quantidade: 120,
    });

    const res = await api.get('/api/ordens');
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].cliente).toBe('Loja Central');
  });

  it('rejeita dados inválidos', async () => {
    const res = await api.post('/api/ordens').send({
      cliente: '',
      produto: 'Camiseta',
      tamanho: 'G',
      quantidade: -5,
    });

    expect(res.status).toBe(400);
    expect(res.body.erro).toBe('Dados inválidos');
  });

  it('atualiza o status de uma ordem', async () => {
    const criada = await api.post('/api/ordens').send({
      cliente: 'Confecções ABC',
      produto: 'Calça Jeans',
      tamanho: '42',
      quantidade: 50,
    });

    const res = await api
      .patch(`/api/ordens/${criada.body.id}`)
      .send({ status: 'em_producao' });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('em_producao');
  });

  it('remove uma ordem', async () => {
    const criada = await api.post('/api/ordens').send({
      cliente: 'Confecções ABC',
      produto: 'Calça Jeans',
      tamanho: '42',
      quantidade: 50,
    });

    const del = await api.delete(`/api/ordens/${criada.body.id}`);
    expect(del.status).toBe(204);

    const res = await api.get('/api/ordens');
    expect(res.body).toHaveLength(0);
  });

  it('retorna 404 para ordem inexistente', async () => {
    const res = await api.get('/api/ordens/9999');
    expect(res.status).toBe(404);
  });

  it('cria OP completa com produto, variante, prioridade e responsável', async () => {
    const cliente = await api.post('/api/clientes').send({ nome: 'Atelier Norte' });
    const produto = await criarProdutoComVariante();
    const variante = produto.variantes.find((v) => v.tamanho === 'M')!;

    const res = await api.post('/api/ordens').send({
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
    await api.post('/api/ordens').send({
      cliente: 'Loja A',
      produto: 'Camiseta',
      tamanho: 'M',
      quantidade: 10,
      status: 'planejada',
      prioridade: 'baixa',
    });
    await api.post('/api/ordens').send({
      cliente: 'Loja B',
      produto: 'Calça',
      tamanho: '42',
      quantidade: 8,
      status: 'corte',
      prioridade: 'urgente',
    });
    await api.post('/api/ordens').send({
      cliente: 'Loja C',
      produto: 'Jaqueta',
      tamanho: 'G',
      quantidade: 5,
      status: 'planejada',
      prioridade: 'alta',
    });

    const busca = await api.get('/api/ordens').query({ q: 'Jaqueta', pagina: 1 });
    expect(busca.status).toBe(200);
    expect(busca.body.total).toBe(1);
    expect(busca.body.data[0].produto).toBe('Jaqueta');

    const filtro = await api
      .get('/api/ordens')
      .query({ status: 'planejada', prioridade: 'alta', pagina: 1 });
    expect(filtro.body.total).toBe(1);
    expect(filtro.body.data[0].cliente).toBe('Loja C');

    const pagina = await api
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

    const ficha = await api.put('/api/ordens/ficha-tecnica').send({
      produto_id: produto.id,
      variante_id: variante.id,
      itens: [{ materia_prima_id: materia.id, quantidade: 0.4 }],
    });
    expect(ficha.status).toBe(200);
    expect(ficha.body.itens).toHaveLength(1);

    await api.post('/api/estoque/movimentos').send({
      tipo: 'entrada',
      quantidade: 20,
      materia_prima_id: materia.id,
    });

    const op = await api.post('/api/ordens').send({
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

    const get = await api
      .get('/api/ordens/ficha-tecnica')
      .query({ produto_id: produto.id, variante_id: variante.id });
    expect(get.body.itens[0].quantidade).toBe(0.4);

    await api.post('/api/ordens').send({
      cliente: 'Loja BOM 2',
      produto_id: produto.id,
      variante_id: variante.id,
      quantidade: 1,
      status: 'planejada',
      requisitos: [{ materia_prima_id: materia.id, quantidade: 9 }],
    });
    const fichaDepois = await api
      .get('/api/ordens/ficha-tecnica')
      .query({ produto_id: produto.id, variante_id: variante.id });
    expect(fichaDepois.body.itens[0].quantidade).toBe(0.4);
  });

  it('consome estoque ao ir para corte e estorna no cancelamento', async () => {
    const produto = await criarProdutoComVariante();
    const variante = produto.variantes[0];
    const materia = await criarMateria();
    await api.put('/api/ordens/ficha-tecnica').send({
      produto_id: produto.id,
      variante_id: variante.id,
      itens: [{ materia_prima_id: materia.id, quantidade: 1 }],
    });
    await api.post('/api/estoque/movimentos').send({
      tipo: 'entrada',
      quantidade: 5,
      materia_prima_id: materia.id,
    });

    const op = await api.post('/api/ordens').send({
      cliente: 'Loja Corte',
      produto_id: produto.id,
      variante_id: variante.id,
      quantidade: 3,
      status: 'planejada',
    });

    const corte = await api
      .patch(`/api/ordens/${op.body.id}`)
      .send({ status: 'corte' });
    expect(corte.status).toBe(200);
    expect(corte.body.status).toBe('corte');

    const saldo = await api.get('/api/estoque').query({ tipo: 'materia' });
    expect(saldo.body.data[0].quantidade).toBe(2);

    const cancelar = await api
      .patch(`/api/ordens/${op.body.id}`)
      .send({ status: 'cancelada' });
    expect(cancelar.status).toBe(200);
    const saldoDepois = await api.get('/api/estoque').query({ tipo: 'materia' });
    expect(saldoDepois.body.data[0].quantidade).toBe(5);
  });

  it('bloqueia corte quando o estoque da matéria é insuficiente', async () => {
    const produto = await criarProdutoComVariante();
    const variante = produto.variantes[0];
    const materia = await criarMateria();
    await api.post('/api/ordens').send({
      cliente: 'Loja Sem Tecido',
      produto_id: produto.id,
      variante_id: variante.id,
      quantidade: 8,
      status: 'planejada',
      requisitos: [{ materia_prima_id: materia.id, quantidade: 2 }],
    });

    const lista = await api.get('/api/ordens').query({ pagina: 1 });
    const id = lista.body.data[0].id;
    const corte = await api.patch(`/api/ordens/${id}`).send({ status: 'corte' });
    expect(corte.status).toBe(409);
    expect(corte.body.erro).toMatch(/insuficiente/i);

    const ainda = await api.get(`/api/ordens/${id}`);
    expect(ainda.body.status).toBe('planejada');
  });

  it('impede transição a partir de status terminal e exclusão em produção', async () => {
    const criada = await api.post('/api/ordens').send({
      cliente: 'Loja Fim',
      produto: 'Peça',
      tamanho: 'U',
      quantidade: 1,
    });
    await api.patch(`/api/ordens/${criada.body.id}`).send({ status: 'concluida' });
    const voltar = await api
      .patch(`/api/ordens/${criada.body.id}`)
      .send({ status: 'planejada' });
    expect(voltar.status).toBe(409);

    const emProd = await api.post('/api/ordens').send({
      cliente: 'Loja Fim',
      produto: 'Peça',
      tamanho: 'U',
      quantidade: 1,
      status: 'costura',
    });
    const del = await api.delete(`/api/ordens/${emProd.body.id}`);
    expect(del.status).toBe(409);
  });

  it('edita campos da OP planejada', async () => {
    const criada = await api.post('/api/ordens').send({
      cliente: 'Loja Edit',
      produto: 'Camisa',
      tamanho: 'P',
      quantidade: 4,
      status: 'planejada',
    });
    const res = await api.patch(`/api/ordens/${criada.body.id}`).send({
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
    const cliente = await api.post('/api/clientes').send({ nome: 'Loja Contrato OP' });
    expect(cliente.status).toBe(201);
    const produto = await api.post('/api/produtos').send({
      nome: 'Calça Contrato',
      sku: 'CAL-OP-C',
    });
    expect(produto.status).toBe(201);
    const materia = await api.post('/api/materias-primas').send({
      nome: 'Linha Contrato',
      tipo: 'linha',
    });
    expect(materia.status).toBe(201);
    const mov = await api.post('/api/estoque/movimentos').send({
      tipo: 'entrada',
      quantidade: 3,
      materia_prima_id: materia.body.id,
    });
    expect(mov.status).toBe(201);
    const listaEstoque = await api.get('/api/estoque');
    expect(listaEstoque.status).toBe(200);
  });

  it('grava a distribuição de corte por cor e tamanho e preserva OPs antigas', async () => {
    const cliente = await api.post('/api/clientes').send({ nome: 'Loja Corte' });
    const produto = await api.post('/api/produtos').send({
      sku: 'BER-DRY',
      nome: 'Bermuda Dryfit',
      cores: ['Preto', 'Branco', 'Azul'],
      tamanhos: ['P', 'M', 'G', 'GG'],
    });
    expect(produto.status).toBe(201);
    const quantidades: Record<string, number> = {
      'Preto|P': 30,
      'Preto|M': 45,
      'Preto|G': 45,
      'Preto|GG': 30,
      'Branco|P': 15,
      'Branco|M': 23,
      'Branco|G': 22,
      'Branco|GG': 15,
      'Azul|P': 15,
      'Azul|M': 22,
      'Azul|G': 23,
      'Azul|GG': 15,
    };
    const variantes = produto.body.variantes as Array<{ id: number; cor: string; tamanho: string }>;
    const distribuicao = variantes.map((variante) => ({
      variante_id: variante.id,
      quantidade: quantidades[`${variante.cor}|${variante.tamanho}`] ?? 0,
    }));

    const criada = await api.post('/api/ordens').send({
      cliente_id: cliente.body.id,
      produto_id: produto.body.id,
      quantidade: 300,
      status: 'planejada',
      distribuicao,
    });
    expect(criada.status).toBe(201);
    expect(criada.body.quantidade).toBe(300);
    expect(criada.body.variante_id).toBeNull();
    expect(criada.body.distribuicao).toHaveLength(12);
    expect(
      criada.body.distribuicao.reduce(
        (total: number, item: { quantidade: number }) => total + item.quantidade,
        0,
      ),
    ).toBe(300);
    const preto = criada.body.distribuicao
      .filter((item: { cor: string }) => item.cor === 'Preto')
      .reduce((total: number, item: { quantidade: number }) => total + item.quantidade, 0);
    expect(preto).toBe(150);

    const noBanco = db
      .prepare(
        `SELECT empresa_id, COUNT(*) AS n, SUM(quantidade) AS soma
           FROM ordem_distribuicao WHERE ordem_id = ?`,
      )
      .get(criada.body.id) as { empresa_id: number; n: number; soma: number };
    expect(noBanco).toEqual({ empresa_id: 1, n: 12, soma: 300 });

    const lida = await api.get(`/api/ordens/${criada.body.id}`);
    expect(lida.status).toBe(200);
    expect(lida.body.distribuicao).toHaveLength(12);

    const antiga = await api.post('/api/ordens').send({
      cliente: 'Loja Antiga',
      produto: 'Camiseta Polo',
      tamanho: 'M',
      quantidade: 10,
    });
    expect(antiga.status).toBe(201);
    const antigaLida = await api.get(`/api/ordens/${antiga.body.id}`);
    expect(antigaLida.body.distribuicao).toEqual([]);
    expect(antigaLida.body.tamanho).toBe('M');
  });

  it('recusa distribuição divergente, negativa ou de outra empresa', async () => {
    const cliente = await api.post('/api/clientes').send({ nome: 'Loja Corte 2' });
    const produto = await api.post('/api/produtos').send({
      sku: 'BER-DRY-2',
      nome: 'Bermuda Dryfit 2',
      cores: ['Preto'],
      tamanhos: ['P', 'M'],
    });
    const variantes = produto.body.variantes as Array<{ id: number; tamanho: string }>;
    const p = variantes.find((item) => item.tamanho === 'P')!;
    const m = variantes.find((item) => item.tamanho === 'M')!;

    const divergente = await api.post('/api/ordens').send({
      cliente_id: cliente.body.id,
      produto_id: produto.body.id,
      quantidade: 10,
      distribuicao: [
        { variante_id: p.id, quantidade: 4 },
        { variante_id: m.id, quantidade: 5 },
      ],
    });
    expect(divergente.status).toBe(400);
    expect(divergente.body.erro).toBe(
      'A soma da distribuição (9) deve ser igual à quantidade da OP (10)',
    );

    const comZero = await api.post('/api/ordens').send({
      cliente_id: cliente.body.id,
      produto_id: produto.body.id,
      quantidade: 8,
      distribuicao: [
        { variante_id: p.id, quantidade: 0 },
        { variante_id: m.id, quantidade: 8 },
      ],
    });
    expect(comZero.status).toBe(201);
    expect(comZero.body.variante_id).toBe(m.id);
    expect(comZero.body.tamanho).toBe('M');
    expect(comZero.body.distribuicao).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ variante_id: p.id, quantidade: 0 }),
        expect.objectContaining({ variante_id: m.id, quantidade: 8 }),
      ]),
    );

    const negativa = await api.post('/api/ordens').send({
      cliente_id: cliente.body.id,
      produto_id: produto.body.id,
      quantidade: 8,
      distribuicao: [
        { variante_id: p.id, quantidade: -1 },
        { variante_id: m.id, quantidade: 9 },
      ],
    });
    expect(negativa.status).toBe(400);

    const { api: outra } = await autenticarNovaEmpresa(createApp(db));
    const clienteOutra = await outra.post('/api/clientes').send({ nome: 'Outra Loja' });
    const produtoOutra = await outra.post('/api/produtos').send({
      nome: 'Peça Isolada',
      sku: 'ISO-OP',
      cores: ['Preto'],
      tamanhos: ['P'],
    });
    const invasao = await outra.post('/api/ordens').send({
      cliente_id: clienteOutra.body.id,
      produto_id: produtoOutra.body.id,
      quantidade: 8,
      distribuicao: [{ variante_id: m.id, quantidade: 8 }],
    });
    expect(invasao.status).toBe(400);
    expect(invasao.body.erro).toBe('Variante não pertence ao produto');
  });
});
