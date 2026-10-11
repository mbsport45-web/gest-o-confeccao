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

  function gradeBermuda() {
    const cores = [
      { cor: 'Preto', quantidades: { P: 15, M: 20, G: 20, GG: 10, G1: 5, G2: 5, G3: 0 } },
      { cor: 'Branco', quantidades: { P: 10, M: 20, G: 25, GG: 10, G1: 5, G2: 5, G3: 0 } },
    ];
    const tamanhos = ['P', 'M', 'G', 'GG', 'G1', 'G2', 'G3'];
    return cores.flatMap((linha) =>
      tamanhos.map((tamanho) => ({
        cor: linha.cor,
        tamanho,
        quantidade: linha.quantidades[tamanho as keyof typeof linha.quantidades],
      })),
    );
  }

  it('grava a grade, recusa soma divergente e reabre a mesma distribuição', async () => {
    const cliente = await api.post('/api/clientes').send({ nome: 'Loja Bermuda' });
    const produto = await api.post('/api/produtos').send({
      sku: 'BER-150',
      nome: 'Bermuda',
      cores: ['Preto', 'Branco'],
      tamanhos: ['P', 'M', 'G', 'GG', 'G1', 'G2', 'G3'],
    });
    const grade = gradeBermuda();
    const divergente = await api.post('/api/ordens').send({
      cliente_id: cliente.body.id,
      produto_id: produto.body.id,
      quantidade: 149,
      grade,
      status: 'planejada',
    });
    expect(divergente.status).toBe(400);
    expect(divergente.body.erro).toBe('A soma da grade (150) difere da quantidade da ordem (149)');

    const criada = await api.post('/api/ordens').send({
      cliente_id: cliente.body.id,
      produto_id: produto.body.id,
      quantidade: 150,
      prioridade: 'alta',
      data_prevista: '2026-11-02',
      responsavel: 'Corte 1',
      observacoes: 'Lote 150',
      grade,
      status: 'planejada',
    });
    expect(criada.status).toBe(201);
    expect(criada.body.referencia).toBe('BER-150');
    expect(criada.body.variante_id).toBeNull();
    expect(criada.body.grade).toEqual(grade);
    const preto = (criada.body.grade as Array<{ cor: string; quantidade: number }>)
      .filter((celula) => celula.cor === 'Preto')
      .reduce((soma, celula) => soma + celula.quantidade, 0);
    expect(preto).toBe(75);

    const reaberta = await api.get(`/api/ordens/${criada.body.id}`);
    expect(reaberta.body.grade).toEqual(grade);

    const editada = await api.patch(`/api/ordens/${criada.body.id}`).send({
      grade: grade.map((celula) =>
        celula.cor === 'Preto' && celula.tamanho === 'P' ? { ...celula, quantidade: 10 } : celula,
      ),
      quantidade: 145,
    });
    expect(editada.status).toBe(200);
    expect(editada.body.quantidade).toBe(145);
    expect(
      (editada.body.grade as Array<{ cor: string; tamanho: string; quantidade: number }>).find(
        (celula) => celula.cor === 'Preto' && celula.tamanho === 'P',
      )?.quantidade,
    ).toBe(10);
  });

  it('cadastra cores sem duplicar e mantém os tamanhos padrão por empresa', async () => {
    const primeira = await api.post('/api/ordens/cores').send({ nome: 'Preto' });
    const repetida = await api.post('/api/ordens/cores').send({ nome: ' preto ' });
    expect(primeira.status).toBe(201);
    expect(repetida.status).toBe(200);
    expect(repetida.body.id).toBe(primeira.body.id);
    expect(repetida.body.ja_existia).toBe(true);

    const tamanhos = await api.get('/api/ordens/tamanhos');
    expect(tamanhos.body.map((item: { nome: string }) => item.nome)).toEqual([
      'P',
      'M',
      'G',
      'GG',
      'G1',
      'G2',
      'G3',
    ]);
    const extra = await api.post('/api/ordens/tamanhos').send({ nome: 'G4' });
    expect(extra.status).toBe(201);
    const deNovo = await api.post('/api/ordens/tamanhos').send({ nome: 'g4' });
    expect(deNovo.body.ja_existia).toBe(true);
    expect(deNovo.body.id).toBe(extra.body.id);
  });

  it('cria uma ordem de corte com a grade planejada e não duplica', async () => {
    const produto = await api.post('/api/produtos').send({ sku: 'BER-OC', nome: 'Bermuda OC' });
    const grade = gradeBermuda();
    const op = await api.post('/api/ordens').send({
      cliente: 'Loja Corte OC',
      produto_id: produto.body.id,
      quantidade: 150,
      responsavel: 'Sala de corte',
      grade,
      status: 'planejada',
    });
    const movimentosAntes = db.prepare('SELECT COUNT(*) AS n FROM estoque_movimentos').get() as { n: number };

    const corte = await api.post(`/api/ordens/${op.body.id}/ordem-corte`).send({});
    expect(corte.status).toBe(201);
    expect(corte.body.codigo).toBe('OC-01');
    expect(corte.body.criada).toBe(true);
    expect(corte.body.grade).toEqual(grade);
    expect(corte.body.produto).toBe('Bermuda OC');
    expect(corte.body.responsavel).toBe('Sala de corte');

    const repetida = await api.post(`/api/ordens/${op.body.id}/ordem-corte`).send({});
    expect(repetida.status).toBe(200);
    expect(repetida.body.id).toBe(corte.body.id);
    expect(repetida.body.codigo).toBe('OC-01');
    expect(repetida.body.criada).toBe(false);

    const opDepois = await api.get(`/api/ordens/${op.body.id}`);
    expect(opDepois.body.status).toBe('planejada');
    expect(opDepois.body.ordem_corte.codigo).toBe('OC-01');
    const movimentosDepois = db.prepare('SELECT COUNT(*) AS n FROM estoque_movimentos').get() as { n: number };
    expect(movimentosDepois.n).toBe(movimentosAntes.n);
    const totalCortes = db.prepare('SELECT COUNT(*) AS n FROM ordens_corte').get() as { n: number };
    expect(totalCortes.n).toBe(1);

    const segunda = await api.post('/api/ordens').send({
      cliente: 'Loja Corte OC',
      produto_id: produto.body.id,
      quantidade: 150,
      grade,
      status: 'planejada',
    });
    const corte2 = await api.post(`/api/ordens/${segunda.body.id}/ordem-corte`).send({});
    expect(corte2.body.codigo).toBe('OC-02');

    const exclusao = await api.delete(`/api/ordens/${op.body.id}`);
    expect(exclusao.status).toBe(409);
  });

  it('isola cores, tamanhos e ordem de corte entre empresas', async () => {
    const app = createApp(db);
    const { api: outra } = await autenticarNovaEmpresa(app);
    await api.post('/api/ordens/cores').send({ nome: 'Vinho' });
    await api.post('/api/ordens/tamanhos').send({ nome: 'G4' });
    const produto = await api.post('/api/produtos').send({ sku: 'ISO-OP', nome: 'Peça isolada' });
    const op = await api.post('/api/ordens').send({
      cliente: 'Cliente Isolado',
      produto_id: produto.body.id,
      quantidade: 2,
      grade: [
        { cor: 'Vinho', tamanho: 'M', quantidade: 1 },
        { cor: 'Vinho', tamanho: 'G', quantidade: 1 },
      ],
      status: 'planejada',
    });
    await api.post(`/api/ordens/${op.body.id}/ordem-corte`).send({});

    const coresOutra = await outra.get('/api/ordens/cores');
    expect(coresOutra.body.map((cor: { nome: string }) => cor.nome)).not.toContain('Vinho');
    const tamanhosOutra = await outra.get('/api/ordens/tamanhos');
    expect(tamanhosOutra.body.map((item: { nome: string }) => item.nome)).not.toContain('G4');
    expect(tamanhosOutra.body.map((item: { nome: string }) => item.nome)).toEqual([
      'P', 'M', 'G', 'GG', 'G1', 'G2', 'G3',
    ]);
    const leitura = await outra.get(`/api/ordens/${op.body.id}`);
    expect(leitura.status).toBe(404);
    const corte = await outra.post(`/api/ordens/${op.body.id}/ordem-corte`).send({});
    expect(corte.status).toBe(404);
  });
});
