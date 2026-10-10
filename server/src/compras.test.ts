import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from './app.js';
import { createDatabase, type AppDatabase } from './db.js';
import { autenticar, autenticarNovaEmpresa, type TestApi } from './httpTest.js';
import { pdfComTexto } from './pdfTexto.js';

const CNPJ = '11444777000161';

describe('API de compras', () => {
  let db: AppDatabase;
  let app: ReturnType<typeof createApp>;
  let api: TestApi;

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

  it('lê o PDF, só lança itens reconhecidos depois da confirmação e recusa o mesmo documento', async () => {
    const fornecedor = await criarFornecedor();
    const materia = await criarMateria();
    const produto = await api.post('/api/produtos').send({
      nome: 'Botao plastico',
      unidade: 'UN',
      cores: [],
      tamanhos: [],
    });
    expect(produto.status).toBe(201);
    const pdf = pdfComTexto([
      'NF-e 8891',
      'Fornecedor: Fiacao Norte',
      'CNPJ: 11.444.777/0001-61',
      '06/10/2026',
      'Malha Compra 200 KG 20,00 4000,00',
      'Botao plastico 8 UN 0,50 4,00',
      'Ziper nylon 4 UN 1,50 6,00',
      'Valor total da nota 4010,00',
    ]);
    const res = await api.post('/api/compras/documentos').send({
      tipo: 'nota_fiscal',
      nome_arquivo: 'nota.pdf',
      conteudo_base64: pdf.toString('base64'),
    });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      tipo: 'nota_fiscal',
      numero: '8891',
      cnpj: '11444777000161',
      data_emissao: '2026-10-06',
      total: 4010,
      fornecedor: { id: fornecedor.id, nome: 'Fiação Norte' },
      ja_importado: false,
    });
    const malha = res.body.itens.find((item: { descricao: string }) => item.descricao === 'Malha Compra');
    const botao = res.body.itens.find((item: { descricao: string }) => item.descricao === 'Botao plastico');
    const ziper = res.body.itens.find((item: { descricao: string }) => item.descricao === 'Ziper nylon');
    expect(malha).toMatchObject({ materia_prima_id: materia.id, produto_id: null, quantidade: 200, unidade: 'KG' });
    expect(botao).toMatchObject({ materia_prima_id: null, produto_id: produto.body.id });
    expect(ziper.materia_prima_id).toBeNull();
    expect(ziper.produto_id).toBeNull();
    expect((await api.get('/api/compras')).body.total).toBe(0);
    expect((await api.get('/api/estoque/movimentos')).body.total).toBe(0);
    const materiasAntes = (await api.get('/api/materias-primas')).body.total;

    const entrada = await api.post('/api/compras').send({
      fornecedor_id: fornecedor.id,
      data_emissao: res.body.data_emissao,
      documento_importado_id: res.body.id,
      confirmar: true,
      observacoes: 'Itens sem cadastro: Ziper nylon.',
      itens: [
        {
          materia_prima_id: malha.materia_prima_id,
          quantidade: malha.quantidade,
          custo_unitario: malha.valor_unitario,
          unidade: 'KG',
        },
        {
          produto_id: botao.produto_id,
          quantidade: botao.quantidade,
          custo_unitario: botao.valor_unitario,
          unidade: 'UN',
        },
      ],
    });
    expect(entrada.status).toBe(201);
    expect(entrada.body.status).toBe('recebida');
    expect(entrada.body.documento_importado_id).toBe(res.body.id);
    expect(entrada.body.documento_nome).toBe('nota.pdf');
    expect(entrada.body.itens).toHaveLength(2);
    expect(entrada.body.itens.every((item: { quantidade_recebida: number; quantidade: number }) => item.quantidade_recebida === item.quantidade)).toBe(true);
    expect((await api.get('/api/materias-primas')).body.total).toBe(materiasAntes);
    expect((await api.get('/api/estoque/movimentos')).body.total).toBe(2);

    const deNovo = await api.post('/api/compras/documentos').send({
      tipo: 'nota_fiscal',
      nome_arquivo: 'nota-copia.pdf',
      conteudo_base64: pdf.toString('base64'),
    });
    expect(deNovo.status).toBe(201);
    expect(deNovo.body.ja_importado).toBe(true);
    const repetida = await api.post('/api/compras').send({
      fornecedor_id: fornecedor.id,
      documento_importado_id: deNovo.body.id,
      confirmar: true,
      itens: [
        {
          materia_prima_id: materia.id,
          quantidade: 1,
          custo_unitario: 1,
        },
      ],
    });
    expect(repetida.status).toBe(409);
    expect((await api.get('/api/compras')).body.total).toBe(1);
    expect((await api.get('/api/estoque/movimentos')).body.total).toBe(2);

    const invalido = await api.post('/api/compras/documentos').send({
      tipo: 'nota_fiscal',
      nome_arquivo: 'nota.txt',
      conteudo_base64: Buffer.from('nao e pdf').toString('base64'),
    });
    expect(invalido.status).toBe(400);

    const { api: outra } = await autenticarNovaEmpresa(app);
    const alheio = await outra.post('/api/compras/documentos').send({
      tipo: 'pedido_compra',
      nome_arquivo: 'pedido.pdf',
      conteudo_base64: pdf.toString('base64'),
    });
    expect(alheio.status).toBe(201);
    expect(alheio.body.fornecedor).toBeNull();
    expect(alheio.body.itens.find((item: { descricao: string }) => item.descricao === 'Malha Compra').materia_prima_id).toBeNull();
    const guardado = db
      .prepare('SELECT empresa_id FROM documentos_importados WHERE id = ?')
      .get(res.body.id) as { empresa_id: number };
    expect(guardado.empresa_id).toBe(1);
    const cruzado = await outra.post('/api/compras').send({
      fornecedor_id: fornecedor.id,
      documento_importado_id: res.body.id,
      itens: [{ materia_prima_id: materia.id, quantidade: 1, custo_unitario: 1 }],
    });
    expect(cruzado.status).toBe(404);
  });
});
