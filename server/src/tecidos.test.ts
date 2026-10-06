import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from './app.js';
import { aplicarCoresTecido, createDatabase, type AppDatabase } from './db.js';
import { autenticar, autenticarNovaEmpresa, type TestApi } from './httpTest.js';

describe('cadastro e estoque de tecidos', () => {
  let db: AppDatabase;
  let api: TestApi;

  beforeEach(async () => {
    db = createDatabase(':memory:');
    api = await autenticar(createApp(db));
  });

  afterEach(() => {
    db.close();
  });

  it('cadastra tecido em KG e em METRO, cada um com a própria unidade e custo', async () => {
    const dryfit = await api.post('/api/tecidos').send({
      nome: 'Dryfit',
      categoria: 'Malharia',
      unidade: 'KG',
      largura_cm: 160,
      gramatura: 180,
      custo: 42.5,
      fornecedor: 'Malhas Sul',
      cor: 'Preto',
      estoque_inicial: 500,
      estoque_minimo: 20,
      status: 'ativo',
    });
    expect(dryfit.status).toBe(201);
    expect(dryfit.body.unidade).toBe('KG');
    expect(dryfit.body.unidade_custo).toBe('R$/KG');
    expect(dryfit.body.estoque).toBe(500);
    expect(dryfit.body.custo).toBe(42.5);

    const tactel = await api.post('/api/tecidos').send({
      nome: 'Tactel com elastano',
      categoria: 'Sintético',
      unidade: 'METRO',
      custo: 18,
      cor: 'Marinho',
      estoque_inicial: 1500,
      estoque_minimo: 100,
    });
    expect(tactel.status).toBe(201);
    expect(tactel.body.unidade).toBe('METRO');
    expect(tactel.body.unidade_custo).toBe('R$/METRO');
    expect(tactel.body.estoque).toBe(1500);

    const lista = await api.get('/api/tecidos');
    expect(lista.body.total).toBe(2);
  });

  it('registra entrada e saída na unidade do tecido e atualiza o saldo', async () => {
    const tecido = await api.post('/api/tecidos').send({
      nome: 'Moletom',
      categoria: 'Malharia',
      unidade: 'KG',
      custo: 30,
      estoque_inicial: 100,
    });
    expect(tecido.status).toBe(201);

    const entrada = await api.post(`/api/tecidos/${tecido.body.id}/movimentos`).send({
      tipo: 'entrada',
      quantidade: 25,
      unidade: 'KG',
      custo: 31,
      motivo: 'Compra',
    });
    expect(entrada.status).toBe(201);
    expect(entrada.body.tecido.estoque).toBe(125);
    expect(entrada.body.movimento.saldo_anterior).toBe(100);
    expect(entrada.body.movimento.saldo_posterior).toBe(125);
    expect(entrada.body.movimento.unidade).toBe('KG');
    expect(entrada.body.movimento.usuario_id).toBeTruthy();
    expect(entrada.body.movimento.criado_em).toBeTruthy();

    const saida = await api.post(`/api/tecidos/${tecido.body.id}/movimentos`).send({
      tipo: 'saida',
      quantidade: 10,
      unidade: 'KG',
      motivo: 'Corte',
    });
    expect(saida.status).toBe(201);
    expect(saida.body.tecido.estoque).toBe(115);
    expect(saida.body.movimento.saldo_anterior).toBe(125);
    expect(saida.body.movimento.saldo_posterior).toBe(115);
  });

  it('bloqueia saída em unidade diferente da unidade de controle', async () => {
    const tecido = await api.post('/api/tecidos').send({
      nome: 'Nylon',
      categoria: 'Sintético',
      unidade: 'METRO',
      custo: 12,
      estoque_inicial: 80,
    });
    const bloqueio = await api.post(`/api/tecidos/${tecido.body.id}/movimentos`).send({
      tipo: 'saida',
      quantidade: 5,
      unidade: 'KG',
      motivo: 'Unidade errada',
    });
    expect(bloqueio.status).toBe(400);
    expect(bloqueio.body.erro).toMatch(/METRO/);

    const saldo = await api.get(`/api/tecidos/${tecido.body.id}`);
    expect(saldo.body.estoque).toBe(80);
  });

  it('baixa o enfesto na unidade já cadastrada, em quilo ou em metro', async () => {
    const kg = await api.post('/api/tecidos').send({
      nome: 'Dryfit',
      categoria: 'Malharia',
      unidade: 'KG',
      custo: 40,
      estoque_inicial: 500,
    });
    const baixaKg = await api.post(`/api/tecidos/${kg.body.id}/baixas-enfesto`).send({
      quantidade: 12.5,
      referencia_id: 90,
    });
    expect(baixaKg.status).toBe(201);
    expect(baixaKg.body.tecido.estoque).toBe(487.5);
    expect(baixaKg.body.movimento.unidade).toBe('KG');
    expect(baixaKg.body.movimento.referencia_tipo).toBe('enfesto');
    expect(baixaKg.body.movimento.tipo).toBe('saida');

    const metro = await api.post('/api/tecidos').send({
      nome: 'Tactel com elastano',
      categoria: 'Tecido Plano',
      unidade: 'METRO',
      custo: 15,
      estoque_inicial: 1500,
    });
    const baixaMetro = await api.post(`/api/tecidos/${metro.body.id}/baixas-enfesto`).send({
      quantidade: 40,
    });
    expect(baixaMetro.status).toBe(201);
    expect(baixaMetro.body.tecido.estoque).toBe(1460);
    expect(baixaMetro.body.movimento.unidade).toBe('METRO');
  });

  it('isola tecido, saldo e categoria por empresa', async () => {
    const app = createApp(db);
    const { api: outra } = await autenticarNovaEmpresa(app);
    const criado = await api.post('/api/tecidos').send({
      nome: 'Sarja',
      categoria: 'Jeans',
      unidade: 'METRO',
      custo: 22,
      estoque_inicial: 300,
    });
    expect(criado.status).toBe(201);

    const lista = await outra.get('/api/tecidos');
    expect(lista.body.total).toBe(0);

    const leitura = await outra.get(`/api/tecidos/${criado.body.id}`);
    expect(leitura.status).toBe(404);

    const movimento = await outra.post(`/api/tecidos/${criado.body.id}/movimentos`).send({
      tipo: 'saida',
      quantidade: 1,
      unidade: 'METRO',
    });
    expect(movimento.status).toBe(404);

    const categorias = await outra.get('/api/tecidos/categorias');
    expect(categorias.body.data.map((item: { nome: string }) => item.nome)).not.toContain('Jeans');
    expect(categorias.body.data.map((item: { nome: string }) => item.nome)).toEqual(
      expect.arrayContaining(['Malharia', 'Tecido Plano', 'Sintético']),
    );

    const saldo = await api.get(`/api/tecidos/${criado.body.id}`);
    expect(saldo.body.estoque).toBe(300);
  });

  it('permite criar uma categoria nova sem limitar o nome do tecido', async () => {
    const categoria = await api.post('/api/tecidos/categorias').send({ nome: 'Especial' });
    expect(categoria.status).toBe(201);

    const tecido = await api.post('/api/tecidos').send({
      nome: 'Poliéster',
      categoria: 'Especial',
      unidade: 'KG',
      custo: 9,
      estoque_inicial: 0,
    });
    expect(tecido.status).toBe(201);
    expect(tecido.body.categoria).toBe('Especial');
    expect(tecido.body.estoque).toBe(0);
    expect(tecido.body.cores).toEqual([]);
  });

  it('cadastra um tecido com várias cores e controla o estoque de cada uma', async () => {
    const criado = await api.post('/api/tecidos').send({
      nome: 'Dry Tela Cayman',
      categoria: 'Sintético',
      unidade: 'KG',
      largura_cm: 180,
      gramatura: 180,
      custo: 35,
      fornecedor: 'Caryman',
      cores: [
        { nome: 'Preto', estoque_inicial: 1000, estoque_minimo: 50, status: 'ativo' },
        { nome: 'Branco', estoque_inicial: 500, estoque_minimo: 50, status: 'ativo' },
        { nome: 'Azul', estoque_inicial: 300, estoque_minimo: 30, status: 'ativo' },
      ],
    });
    expect(criado.status).toBe(201);
    expect(criado.body.cor).toBeNull();
    expect(criado.body.unidade).toBe('KG');
    expect(criado.body.estoque).toBe(1800);
    expect(criado.body.cores.map((cor: { nome: string; estoque: number }) => [cor.nome, cor.estoque])).toEqual([
      ['Azul', 300],
      ['Branco', 500],
      ['Preto', 1000],
    ]);

    const repetida = await api.post('/api/tecidos').send({
      nome: 'Outro',
      categoria: 'Sintético',
      unidade: 'KG',
      custo: 10,
      cores: [
        { nome: 'Preto', estoque_inicial: 1 },
        { nome: ' preto ', estoque_inicial: 2 },
      ],
    });
    expect(repetida.status).toBe(409);

    const preto = criado.body.cores.find((cor: { nome: string }) => cor.nome === 'Preto');
    const branco = criado.body.cores.find((cor: { nome: string }) => cor.nome === 'Branco');
    const duplicar = await api.patch(`/api/tecidos/${criado.body.id}`).send({
      cores: [{ nome: 'Preto', estoque_inicial: 10 }],
    });
    expect(duplicar.status).toBe(409);
    expect((await api.get(`/api/tecidos/${criado.body.id}`)).body.cores).toHaveLength(3);

    const ampliado = await api.patch(`/api/tecidos/${criado.body.id}`).send({
      cores: [{ nome: 'Vermelho', estoque_inicial: 10, estoque_minimo: 5, status: 'ativo' }],
    });
    expect(ampliado.status).toBe(200);
    expect(ampliado.body.cores).toHaveLength(4);
    expect(ampliado.body.estoque).toBe(1810);
    expect(ampliado.body.cores.find((cor: { nome: string }) => cor.nome === 'Preto').estoque).toBe(1000);

    const busca = await api.get('/api/tecidos').query({ q: 'Azul' });
    expect(busca.body.total).toBe(1);
    expect(busca.body.data[0].nome).toBe('Dry Tela Cayman');

    const semCor = await api.post(`/api/tecidos/${criado.body.id}/movimentos`).send({
      tipo: 'saida',
      quantidade: 1,
      unidade: 'KG',
    });
    expect(semCor.status).toBe(400);

    const fornecedor = await api.post('/api/fornecedores').send({
      nome: 'Caryman',
      cpf_cnpj: '11444777000161',
      cidade: 'Recife',
      estado: 'PE',
    });
    expect(fornecedor.status).toBe(201);
    const compraSemCor = await api.post('/api/compras').send({
      fornecedor_id: fornecedor.body.id,
      itens: [{ materia_prima_id: criado.body.id, quantidade: 10, custo_unitario: 35, unidade: 'KG' }],
    });
    expect(compraSemCor.status).toBe(400);

    const compra = await api.post('/api/compras').send({
      fornecedor_id: fornecedor.body.id,
      confirmar: true,
      itens: [
        {
          materia_prima_id: criado.body.id,
          tecido_cor_id: preto.id,
          quantidade: 200,
          custo_unitario: 35,
          unidade: 'KG',
        },
      ],
    });
    expect(compra.status).toBe(201);
    expect(compra.body.itens[0].nome).toBe('Dry Tela Cayman — Preto');
    expect(compra.body.itens[0].quantidade_recebida).toBe(200);

    const depoisCompra = await api.get(`/api/tecidos/${criado.body.id}`);
    expect(depoisCompra.body.cores.find((cor: { nome: string }) => cor.nome === 'Preto').estoque).toBe(1200);
    expect(depoisCompra.body.cores.find((cor: { nome: string }) => cor.nome === 'Branco').estoque).toBe(500);
    expect(depoisCompra.body.estoque).toBe(2010);

    const estoque = await api.get('/api/estoque').query({ tipo: 'materia', q: 'Cayman', por_pagina: 20 });
    const saldoPreto = estoque.body.data.find(
      (item: { nome: string }) => item.nome === 'Dry Tela Cayman — Preto',
    );
    const saldoBranco = estoque.body.data.find(
      (item: { nome: string }) => item.nome === 'Dry Tela Cayman — Branco',
    );
    expect(saldoPreto).toMatchObject({ quantidade: 1200, unidade: 'KG', estoque_minimo: 50 });
    expect(saldoBranco).toMatchObject({ quantidade: 500, unidade: 'KG' });

    const produto = await api.post('/api/produtos').send({
      referencia: 'CAM-1',
      nome: 'Camisa',
      cores: ['Preto'],
      tamanhos: ['M'],
      valor_costura: 8,
    });
    expect(produto.status).toBe(201);
    const ordem = await api.post('/api/ordens').send({
      cliente: 'Loja Centro',
      produto_id: produto.body.id,
      quantidade: 10,
      distribuicao: [{ variante_id: produto.body.variantes[0].id, quantidade: 10 }],
    });
    expect(ordem.status).toBe(201);
    const aberto = await api.post('/api/enfesto').send({ ordem_id: ordem.body.id, cor: 'Preto' });
    expect(aberto.status).toBe(201);
    const semCorEnfesto = await api.post(`/api/enfesto/${aberto.body.id}/finalizar`).send({
      tecido_id: criado.body.id,
      folhas: 4,
      comprimento: 2,
      peso: 18.5,
      unidade: 'KG',
    });
    expect(semCorEnfesto.status).toBe(400);
    expect((await api.get(`/api/tecidos/${criado.body.id}`)).body.cores.find((cor: { nome: string }) => cor.nome === 'Preto').estoque).toBe(1200);

    const finalizado = await api.post(`/api/enfesto/${aberto.body.id}/finalizar`).send({
      tecido_id: criado.body.id,
      tecido_cor_id: preto.id,
      folhas: 4,
      comprimento: 2,
      peso: 18.5,
      unidade: 'KG',
    });
    expect(finalizado.status).toBe(200);
    expect(finalizado.body.tecido_cor_id).toBe(preto.id);
    expect(finalizado.body.quantidade_consumida).toBeCloseTo(18.5);
    expect(finalizado.body.saldo_posterior).toBeCloseTo(1181.5);

    const depoisEnfesto = await api.get(`/api/tecidos/${criado.body.id}`);
    expect(depoisEnfesto.body.cores.find((cor: { nome: string }) => cor.nome === 'Preto').estoque).toBeCloseTo(1181.5);
    expect(depoisEnfesto.body.cores.find((cor: { nome: string }) => cor.nome === 'Branco').estoque).toBe(500);
    expect(depoisEnfesto.body.cores.find((cor: { id: number }) => cor.id === branco.id).estoque).toBe(500);

    const app = createApp(db);
    const { api: outra } = await autenticarNovaEmpresa(app);
    expect((await outra.get(`/api/tecidos/${criado.body.id}`)).status).toBe(404);
    const compraAlheia = await outra.post('/api/compras').send({
      fornecedor_id: fornecedor.body.id,
      itens: [
        {
          materia_prima_id: criado.body.id,
          tecido_cor_id: preto.id,
          quantidade: 1,
          custo_unitario: 35,
          unidade: 'KG',
        },
      ],
    });
    expect(compraAlheia.status).toBe(404);
    expect((await api.get(`/api/tecidos/${criado.body.id}`)).body.estoque).toBeCloseTo(1991.5);
  });

  it('migra a cor antiga para variante e funde tecidos de mesmo nome', async () => {
    const empresaId = (
      db.prepare('SELECT empresa_id AS id FROM usuarios ORDER BY id LIMIT 1').get() as { id: number }
    ).id;
    const inserir = db.prepare(
      `INSERT INTO materias_primas (empresa_id, nome, tipo, categoria, cor, unidade, custo, estoque_minimo, status)
       VALUES (@empresa_id, @nome, 'tecido', 'Sintético', @cor, @unidade, 35, 50, 'ativo')`,
    );
    const saldo = db.prepare(
      `INSERT INTO estoque_saldos (empresa_id, tipo, materia_prima_id, quantidade)
       VALUES (?, 'materia', ?, ?)`,
    );
    function legado(nome: string, unidade: string, cor: string, quantidade: number) {
      const id = Number(
        inserir.run({ empresa_id: empresaId, nome, cor, unidade }).lastInsertRowid,
      );
      saldo.run(empresaId, id, quantidade);
      return id;
    }

    legado('Dry Tela Cayman', 'KG', 'Preto', 1000);
    legado('Dry Tela Cayman', 'KG', 'Branco', 500);
    legado('Dry Tela Cayman', 'METRO', 'Preto', 10);
    legado('Malha PV', 'KG', 'Azul', 40);
    const semCor = legado('Sem cor', 'KG', '', 7);

    aplicarCoresTecido(db);
    aplicarCoresTecido(db);

    const cayman = await api.get('/api/tecidos').query({ q: 'Dry Tela Cayman', unidade: 'KG' });
    expect(cayman.body.total).toBe(1);
    expect(cayman.body.data[0].estoque).toBe(1500);
    expect(
      cayman.body.data[0].cores.map((cor: { nome: string; estoque: number }) => [cor.nome, cor.estoque]),
    ).toEqual([
      ['Branco', 500],
      ['Preto', 1000],
    ]);

    const metro = await api.get('/api/tecidos').query({ q: 'Dry Tela Cayman', unidade: 'METRO' });
    expect(metro.body.total).toBe(1);
    expect(metro.body.data[0].estoque).toBe(10);
    expect(metro.body.data[0].cores).toHaveLength(1);

    const malha = await api.get('/api/tecidos').query({ q: 'Malha PV' });
    expect(malha.body.total).toBe(1);
    expect(malha.body.data[0].cores[0].nome).toBe('Azul');
    expect(malha.body.data[0].estoque).toBe(40);

    const solto = await api.get(`/api/tecidos/${semCor}`);
    expect(solto.body.cores).toEqual([]);
    expect(solto.body.estoque).toBe(7);
  });
});
