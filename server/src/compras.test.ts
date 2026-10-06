import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from './app.js';
import { createDatabase, type AppDatabase } from './db.js';
import { autenticar, autenticarNovaEmpresa, type TestApi } from './httpTest.js';

const CNPJ = '11444777000161';

describe('API de compras', () => {
  let db: AppDatabase;
  let api: TestApi;
  let app: ReturnType<typeof createApp>;

  beforeEach(async () => {
    db = createDatabase(':memory:');
    app = createApp(db);
    api = await autenticar(app);
  });

  afterEach(() => {
    db.close();
  });

  async function criarFornecedor(nome = 'Fiação Norte') {
    const res = await api.post('/api/fornecedores').send({
      nome,
      cpf_cnpj: CNPJ,
      cidade: 'Recife',
      estado: 'PE',
      condicao_pagamento: '30 dias',
    });
    expect(res.status).toBe(201);
    return res.body as { id: number; codigo: string };
  }

  async function criarMateria() {
    const res = await api.post('/api/materias-primas').send({
      codigo: 'TEC-CP',
      nome: 'Malha Compra',
      tipo: 'tecido',
      unidade: 'KG',
      custo: 20,
      estoque_minimo: 5,
    });
    return res.body as { id: number };
  }

  it('lista fornecedores e compras vazias paginadas', async () => {
    const forn = await api.get('/api/fornecedores');
    expect(forn.status).toBe(200);
    expect(forn.body.total).toBe(0);
    const compras = await api.get('/api/compras');
    expect(compras.status).toBe(200);
    expect(compras.body).toMatchObject({ data: [], total: 0, pagina: 1 });
  });

  it('cria fornecedor com código automático e rejeita CNPJ inválido', async () => {
    const ok = await criarFornecedor();
    expect(ok.codigo).toBe('FOR-0001');
    const bad = await api.post('/api/fornecedores').send({
      nome: 'X',
      cpf_cnpj: '11111111111',
    });
    expect(bad.status).toBe(400);
  });

  it('cria compra em rascunho, edita itens e calcula totais', async () => {
    const fornecedor = await criarFornecedor();
    const materia = await criarMateria();
    const res = await api.post('/api/compras').send({
      fornecedor_id: fornecedor.id,
      desconto: 10,
      frete: 15,
      itens: [
        { materia_prima_id: materia.id, quantidade: 8, custo_unitario: 12.5 },
      ],
    });
    expect(res.status).toBe(201);
    expect(res.body.codigo).toBe('CP-0001');
    expect(res.body.status).toBe('rascunho');
    expect(res.body.subtotal).toBe(100);
    expect(res.body.total).toBe(105);
    expect(res.body.itens).toHaveLength(1);

    const item = res.body.itens[0];
    const patchItem = await api
      .patch(`/api/compras/${res.body.id}/itens/${item.id}`)
      .send({ quantidade: 10 });
    expect(patchItem.status).toBe(200);
    expect(patchItem.body.subtotal).toBe(125);
    expect(patchItem.body.total).toBe(130);
  });

  it('abre a compra, gera conta a pagar e recebe no estoque', async () => {
    const fornecedor = await criarFornecedor();
    const materia = await criarMateria();
    const compra = await api.post('/api/compras').send({
      fornecedor_id: fornecedor.id,
      vencimento: '2099-12-01',
      itens: [{ materia_prima_id: materia.id, quantidade: 6, custo_unitario: 10 }],
    });
    const id = compra.body.id as number;

    const abrir = await api.patch(`/api/compras/${id}`).send({ status: 'aberta' });
    expect(abrir.status).toBe(200);
    expect(abrir.body.status).toBe('aberta');

    const pagar = await api
      .get('/api/financeiro/lancamentos')
      .query({ tipo: 'pagar' });
    expect(pagar.body.total).toBe(1);
    expect(pagar.body.data[0]).toMatchObject({
      compra_id: id,
      valor: 60,
      status: 'pendente',
      fornecedor_id: fornecedor.id,
    });

    const receber = await api
      .post(`/api/compras/${id}/receber`)
      .send({ itens: [{ item_id: compra.body.itens[0].id, quantidade: 6 }] });
    expect(receber.status).toBe(200);
    expect(receber.body.status).toBe('recebida');
    expect(receber.body.itens[0].quantidade_recebida).toBe(6);

    const estoque = await api.get('/api/estoque').query({ tipo: 'materia' });
    expect(estoque.body.total).toBe(1);
    expect(estoque.body.data[0].quantidade).toBe(6);
    expect(estoque.body.data[0].nome).toBe('Malha Compra');

    const hist = await api.get('/api/estoque/movimentos').query({ tipo: 'entrada' });
    expect(hist.body.total).toBeGreaterThanOrEqual(1);
    expect(hist.body.data[0].motivo).toMatch(/Compra CP-/);
    expect(hist.body.data[0].referencia_tipo).toBe('compra');
    expect(hist.body.data[0].referencia_id).toBe(id);
    expect(hist.body.data[0].unidade).toBe('KG');
  });

  it('aceita recebimento parcial e bloqueia quantidade maior que o pedido', async () => {
    const fornecedor = await criarFornecedor();
    const materia = await criarMateria();
    const compra = await api.post('/api/compras').send({
      fornecedor_id: fornecedor.id,
      status: 'aberta',
      itens: [{ materia_prima_id: materia.id, quantidade: 10, custo_unitario: 5 }],
    });
    const itemId = compra.body.itens[0].id;

    const extra = await api
      .post(`/api/compras/${compra.body.id}/receber`)
      .send({ itens: [{ item_id: itemId, quantidade: 12 }] });
    expect(extra.status).toBe(400);

    const parcial = await api
      .post(`/api/compras/${compra.body.id}/receber`)
      .send({ itens: [{ item_id: itemId, quantidade: 4 }] });
    expect(parcial.status).toBe(200);
    expect(parcial.body.status).toBe('parcial');

    const estoque = await api.get('/api/estoque').query({ tipo: 'materia' });
    expect(estoque.body.data[0].quantidade).toBe(4);
  });

  it('bloqueia transições inválidas, exclusão de aberta e edição após recebida', async () => {
    const fornecedor = await criarFornecedor();
    const materia = await criarMateria();
    const compra = await api.post('/api/compras').send({
      fornecedor_id: fornecedor.id,
      status: 'aberta',
      itens: [{ materia_prima_id: materia.id, quantidade: 2, custo_unitario: 8 }],
    });
    const id = compra.body.id;

    const delAberta = await api.delete(`/api/compras/${id}`);
    expect(delAberta.status).toBe(409);

    await api.post(`/api/compras/${id}/receber`).send({});
    const edit = await api.patch(`/api/compras/${id}`).send({ frete: 9 });
    expect(edit.status).toBe(409);

    const receberDeNovo = await api.post(`/api/compras/${id}/receber`).send({});
    expect(receberDeNovo.status).toBe(409);
  });

  it('filtra por status, fornecedor e período', async () => {
    const fornecedor = await criarFornecedor();
    const materia = await criarMateria();
    await api.post('/api/compras').send({
      fornecedor_id: fornecedor.id,
      data_emissao: '2026-01-10',
      itens: [{ materia_prima_id: materia.id, quantidade: 1, custo_unitario: 3 }],
    });
    await api.post('/api/compras').send({
      fornecedor_id: fornecedor.id,
      data_emissao: '2026-02-10',
      status: 'aberta',
      itens: [{ materia_prima_id: materia.id, quantidade: 1, custo_unitario: 3 }],
    });
    const rascunho = await api.get('/api/compras').query({ status: 'rascunho' });
    expect(rascunho.body.total).toBe(1);
    const periodo = await api
      .get('/api/compras')
      .query({ de: '2026-02-01', ate: '2026-02-28' });
    expect(periodo.body.total).toBe(1);
    const busca = await api.get('/api/compras').query({ q: 'Norte', pagina: 1 });
    expect(busca.body.total).toBe(2);
  });

  it('impede excluir matéria-prima usada em compra e fornecedor com compras', async () => {
    const fornecedor = await criarFornecedor();
    const materia = await criarMateria();
    await api.post('/api/compras').send({
      fornecedor_id: fornecedor.id,
      itens: [{ materia_prima_id: materia.id, quantidade: 1, custo_unitario: 1 }],
    });
    const delMat = await api.delete(`/api/materias-primas/${materia.id}`);
    expect(delMat.status).toBe(409);
    const delFor = await api.delete(`/api/fornecedores/${fornecedor.id}`);
    expect(delFor.status).toBe(409);
  });

  it('não quebra clientes, produtos, estoque, OPs e etapas', async () => {
    const cliente = await api.post('/api/clientes').send({ nome: 'Loja Compras' });
    expect(cliente.status).toBe(201);
    const produto = await api.post('/api/produtos').send({
      nome: 'Camisa',
      sku: 'CAM-CP',
      cores: ['Azul'],
      tamanhos: ['M'],
    });
    expect(produto.status).toBe(201);
    const op = await api.post('/api/ordens').send({
      cliente: 'Loja Compras',
      produto: 'Camisa',
      tamanho: 'M',
      quantidade: 2,
    });
    expect(op.status).toBe(201);
    const fluxo = await api.post('/api/etapas/fluxo').send({ ordem_id: op.body.id });
    expect(fluxo.status).toBe(201);
    const estoque = await api.get('/api/estoque');
    expect(estoque.status).toBe(200);
  });

  async function criarTecido(nome: string, unidade: 'KG' | 'METRO') {
    const res = await api.post('/api/tecidos').send({
      nome,
      categoria: 'Malharia',
      unidade,
      custo: unidade === 'KG' ? 35 : 12,
    });
    expect(res.status).toBe(201);
    return res.body as { id: number; estoque: number; unidade: string };
  }

  it('confirma compra de tecido e gera uma única entrada vinculada', async () => {
    const fornecedor = await criarFornecedor();
    const tecido = await criarTecido('Dryfit', 'KG');
    expect(tecido.estoque).toBe(0);

    const rascunho = await api.post('/api/compras').send({
      fornecedor_id: fornecedor.id,
      itens: [{ materia_prima_id: tecido.id, quantidade: 100, custo_unitario: 35, unidade: 'KG' }],
    });
    expect(rascunho.status).toBe(201);
    expect(rascunho.body.status).toBe('rascunho');
    expect((await api.get(`/api/tecidos/${tecido.id}`)).body.estoque).toBe(0);

    const compra = await api.post('/api/compras').send({
      fornecedor_id: fornecedor.id,
      data_emissao: '2026-10-06',
      nota_fiscal: 'NF-100',
      forma_pagamento: 'PIX',
      vencimento: '2026-11-06',
      observacoes: 'Compra de dryfit',
      confirmar: true,
      itens: [{ materia_prima_id: tecido.id, quantidade: 100, custo_unitario: 35, unidade: 'KG' }],
    });
    expect(compra.status).toBe(201);
    expect(compra.body.status).toBe('recebida');
    expect(compra.body.nota_fiscal).toBe('NF-100');
    expect(compra.body.forma_pagamento).toBe('PIX');
    expect(compra.body.total).toBe(3500);
    expect(compra.body.itens[0]).toMatchObject({
      quantidade: 100,
      quantidade_recebida: 100,
      unidade: 'KG',
      custo_unitario: 35,
      total: 3500,
    });

    const saldo = await api.get(`/api/tecidos/${tecido.id}`);
    expect(saldo.body.estoque).toBe(100);

    const movs = await api.get(`/api/tecidos/${tecido.id}/movimentos`);
    const entradas = (movs.body.data as Array<{
      tipo: string;
      quantidade: number;
      unidade: string;
      referencia_tipo: string;
      referencia_id: number;
    }>).filter((mov) => mov.referencia_tipo === 'compra' && mov.tipo === 'entrada');
    expect(entradas).toHaveLength(1);
    expect(entradas[0]).toMatchObject({
      quantidade: 100,
      unidade: 'KG',
      referencia_id: compra.body.id,
    });

    const deNovo = await api.post(`/api/compras/${compra.body.id}/confirmar`).send({});
    expect(deNovo.status).toBe(409);
    expect((await api.get(`/api/tecidos/${tecido.id}`)).body.estoque).toBe(100);

    const pagar = await api.get('/api/financeiro/lancamentos').query({ tipo: 'pagar' });
    expect(pagar.body.data[0]).toMatchObject({ compra_id: compra.body.id, valor: 3500 });
  });

  it('rejeita unidade diferente da cadastrada e compra metro em METRO', async () => {
    const fornecedor = await criarFornecedor();
    const kg = await criarTecido('Dryfit', 'KG');
    const errada = await api.post('/api/compras').send({
      fornecedor_id: fornecedor.id,
      confirmar: true,
      itens: [{ materia_prima_id: kg.id, quantidade: 10, custo_unitario: 35, unidade: 'METRO' }],
    });
    expect(errada.status).toBe(400);
    expect(errada.body.erro).toMatch(/unidade cadastrada \(KG\)/);
    expect((await api.get(`/api/tecidos/${kg.id}`)).body.estoque).toBe(0);
    expect((await api.get('/api/compras')).body.total).toBe(0);

    const metro = await criarTecido('Tactel', 'METRO');
    const compra = await api.post('/api/compras').send({
      fornecedor_id: fornecedor.id,
      confirmar: true,
      itens: [{ materia_prima_id: metro.id, quantidade: 40, custo_unitario: 12 }],
    });
    expect(compra.status).toBe(201);
    expect(compra.body.itens[0].unidade).toBe('METRO');
    expect((await api.get(`/api/tecidos/${metro.id}`)).body.estoque).toBe(40);
  });

  it('confirma material já cadastrado sem criar outro tecido', async () => {
    const fornecedor = await criarFornecedor();
    const antes = (await api.get('/api/materias-primas')).body.total as number;
    const linha = await api.post('/api/materias-primas').send({
      nome: 'Linha branca',
      tipo: 'linha',
      unidade: 'UN',
      custo: 4,
    });
    expect(linha.status).toBe(201);
    const compra = await api.post(`/api/compras`).send({
      fornecedor_id: fornecedor.id,
      confirmar: true,
      itens: [{ materia_prima_id: linha.body.id, quantidade: 20, custo_unitario: 4, unidade: 'UN' }],
    });
    expect(compra.status).toBe(201);
    expect(compra.body.itens[0].unidade).toBe('UN');
    const estoque = await api.get('/api/estoque').query({ tipo: 'materia' });
    const saldo = (estoque.body.data as Array<{ nome: string; quantidade: number }>).find(
      (item) => item.nome === 'Linha branca',
    );
    expect(saldo?.quantidade).toBe(20);
    expect((await api.get('/api/materias-primas')).body.total).toBe(antes + 1);
    expect((await api.get('/api/tecidos')).body.total).toBe(0);
  });

  it('cancela a compra confirmada e devolve o estoque', async () => {
    const fornecedor = await criarFornecedor();
    const tecido = await criarTecido('Dryfit', 'KG');
    const compra = await api.post('/api/compras').send({
      fornecedor_id: fornecedor.id,
      confirmar: true,
      itens: [{ materia_prima_id: tecido.id, quantidade: 100, custo_unitario: 35 }],
    });
    const id = compra.body.id as number;

    const cancelada = await api.patch(`/api/compras/${id}`).send({ status: 'cancelada' });
    expect(cancelada.status).toBe(200);
    expect(cancelada.body.status).toBe('cancelada');
    expect(cancelada.body.itens[0].quantidade_recebida).toBe(0);
    expect((await api.get(`/api/tecidos/${tecido.id}`)).body.estoque).toBe(0);

    const movs = await api.get(`/api/tecidos/${tecido.id}/movimentos`);
    const daCompra = (movs.body.data as Array<{ tipo: string; referencia_id: number }>).filter(
      (mov) => mov.referencia_id === id,
    );
    expect(daCompra.map((mov) => mov.tipo).sort()).toEqual(['entrada', 'saida']);

    const rascunho = await api.post('/api/compras').send({
      fornecedor_id: fornecedor.id,
      itens: [{ materia_prima_id: tecido.id, quantidade: 5, custo_unitario: 35 }],
    });
    const cancelarRascunho = await api
      .patch(`/api/compras/${rascunho.body.id}`)
      .send({ status: 'cancelada' });
    expect(cancelarRascunho.status).toBe(200);
    expect((await api.get(`/api/tecidos/${tecido.id}`)).body.estoque).toBe(0);
  });

  it('não cancela quando o estoque da compra já foi consumido', async () => {
    const fornecedor = await criarFornecedor();
    const tecido = await criarTecido('Dryfit', 'KG');
    const compra = await api.post('/api/compras').send({
      fornecedor_id: fornecedor.id,
      confirmar: true,
      itens: [{ materia_prima_id: tecido.id, quantidade: 100, custo_unitario: 35, unidade: 'KG' }],
    });
    const baixa = await api.post(`/api/tecidos/${tecido.id}/movimentos`).send({
      tipo: 'saida',
      quantidade: 100,
      unidade: 'KG',
      motivo: 'Enfesto',
    });
    expect(baixa.status).toBe(201);

    const cancelar = await api.patch(`/api/compras/${compra.body.id}`).send({ status: 'cancelada' });
    expect(cancelar.status).toBe(409);
    expect((await api.get(`/api/compras/${compra.body.id}`)).body.status).toBe('recebida');
    expect((await api.get(`/api/tecidos/${tecido.id}`)).body.estoque).toBe(0);
  });

  it('confirma o saldo restante sem duplicar o que já entrou', async () => {
    const fornecedor = await criarFornecedor();
    const tecido = await criarTecido('Dryfit', 'KG');
    const compra = await api.post('/api/compras').send({
      fornecedor_id: fornecedor.id,
      status: 'aberta',
      itens: [{ materia_prima_id: tecido.id, quantidade: 100, custo_unitario: 35 }],
    });
    const parcial = await api.post(`/api/compras/${compra.body.id}/receber`).send({
      itens: [{ item_id: compra.body.itens[0].id, quantidade: 40 }],
    });
    expect(parcial.body.status).toBe('parcial');

    const confirmar = await api.post(`/api/compras/${compra.body.id}/confirmar`).send({});
    expect(confirmar.status).toBe(200);
    expect(confirmar.body.status).toBe('recebida');
    expect(confirmar.body.itens[0].quantidade_recebida).toBe(100);
    expect((await api.get(`/api/tecidos/${tecido.id}`)).body.estoque).toBe(100);

    const movs = await api.get(`/api/tecidos/${tecido.id}/movimentos`);
    const entradas = (movs.body.data as Array<{ tipo: string; quantidade: number }>).filter(
      (mov) => mov.tipo === 'entrada',
    );
    expect(entradas).toHaveLength(2);
    expect(entradas.reduce((soma, mov) => soma + mov.quantidade, 0)).toBe(100);
  });

  it('outra empresa não confirma a compra nem mexe no estoque', async () => {
    const fornecedor = await criarFornecedor();
    const tecido = await criarTecido('Dryfit', 'KG');
    const compra = await api.post('/api/compras').send({
      fornecedor_id: fornecedor.id,
      itens: [{ materia_prima_id: tecido.id, quantidade: 100, custo_unitario: 35, unidade: 'KG' }],
    });
    const { api: outra } = await autenticarNovaEmpresa(app);
    const confirmar = await outra.post(`/api/compras/${compra.body.id}/confirmar`).send({});
    expect(confirmar.status).toBe(404);
    expect((await api.get(`/api/tecidos/${tecido.id}`)).body.estoque).toBe(0);
    expect((await outra.get('/api/tecidos')).body.total).toBe(0);
  });
});
