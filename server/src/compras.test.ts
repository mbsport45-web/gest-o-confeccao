import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from './app.js';
import { createDatabase, type AppDatabase } from './db.js';
import { autenticar, autenticarNovaEmpresa, type TestApi } from './httpTest.js';
import { pdfComTexto } from './pdfTexto.js';

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

  it('processa o PDF da nota e sugere tecido e cor sem movimentar estoque', async () => {
    const fornecedor = await criarFornecedor();
    const tecido = await api.post('/api/tecidos').send({
      nome: 'Dry Tela Cayman',
      categoria: 'Sintetico',
      unidade: 'KG',
      custo: 35,
      cores: [
        { nome: 'Preto', estoque_inicial: 10 },
        { nome: 'Branco', estoque_inicial: 20 },
      ],
    });
    expect(tecido.status).toBe(201);
    const preto = tecido.body.cores.find((cor: { nome: string }) => cor.nome === 'Preto');
    const pdf = pdfComTexto([
      'NF-e 8891',
      'Fornecedor: Fiacao Norte',
      'CNPJ: 11.444.777/0001-61',
      '06/10/2026',
      'Dry Tela Cayman Preto 200 KG 35,00 7000,00',
      'Valor total da nota 7000,00',
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
      total: 7000,
      fornecedor: { id: fornecedor.id, nome: 'Fiação Norte' },
    });
    expect(res.body.itens[0]).toMatchObject({
      descricao: 'Dry Tela Cayman Preto',
      quantidade: 200,
      unidade: 'KG',
      materia_prima_id: tecido.body.id,
      tecido_cor_id: preto.id,
    });
    expect((await api.get('/api/compras')).body.total).toBe(0);
    expect((await api.get(`/api/tecidos/${tecido.body.id}`)).body.estoque).toBe(30);

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
    expect(alheio.body.itens[0].materia_prima_id).toBeNull();
    const guardado = db
      .prepare('SELECT empresa_id FROM documentos_importados WHERE id = ?')
      .get(res.body.id) as { empresa_id: number };
    expect(guardado.empresa_id).toBe(1);
  });

  it('separa itens novos e reconhecidos e a entrada só movimenta o que foi reconhecido', async () => {
    const fornecedor = await criarFornecedor();
    const tecido = await api.post('/api/tecidos').send({
      nome: 'Dry Tela Cayman',
      categoria: 'Sintetico',
      unidade: 'KG',
      custo: 35,
      cores: [
        { nome: 'Preto', estoque_inicial: 10 },
        { nome: 'Branco', estoque_inicial: 20 },
      ],
    });
    const preto = tecido.body.cores.find((cor: { nome: string }) => cor.nome === 'Preto');
    const pdf = pdfComTexto([
      'NF-e 000123',
      'Fornecedor: Fiacao Norte',
      'CNPJ: 11.444.777/0001-61',
      '06/10/2026',
      'Dry Tela Cayman Preto 1 KG 35,00 35,00',
      'Ziper nylon 4 UN 1,50 6,00',
      'Dry Tela Cayman 5 KG 35,00 175,00',
      'Valor total da nota 216,00',
    ]);
    const res = await api.post('/api/compras/documentos').send({
      tipo: 'nota_fiscal',
      nome_arquivo: 'nota-000123.pdf',
      conteudo_base64: pdf.toString('base64'),
    });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      numero: '000123',
      data_emissao: '2026-10-06',
      fornecedor: { id: fornecedor.id, nome: 'Fiação Norte' },
    });
    const reconhecidos = res.body.itens.filter((item: { materia_prima_id: number | null }) => item.materia_prima_id);
    const novos = res.body.itens.filter((item: { materia_prima_id: number | null }) => !item.materia_prima_id);
    expect(res.body.itens).toHaveLength(3);
    expect(reconhecidos).toHaveLength(2);
    expect(novos).toHaveLength(1);
    expect(novos[0].descricao).toBe('Ziper nylon');
    expect(reconhecidos[0]).toMatchObject({
      materia_prima_id: tecido.body.id,
      tecido_cor_id: preto.id,
    });
    expect(reconhecidos[1]).toMatchObject({
      descricao: 'Dry Tela Cayman',
      materia_prima_id: tecido.body.id,
      tecido_cor_id: null,
      aviso: 'Selecione a cor do tecido',
    });

    const entrada = await api.post('/api/compras').send({
      fornecedor_id: fornecedor.id,
      data_emissao: res.body.data_emissao,
      nota_fiscal: res.body.numero,
      confirmar: true,
      itens: [
        {
          materia_prima_id: reconhecidos[0].materia_prima_id,
          tecido_cor_id: reconhecidos[0].tecido_cor_id,
          quantidade: reconhecidos[0].quantidade,
          custo_unitario: reconhecidos[0].valor_unitario,
          unidade: 'KG',
        },
      ],
    });
    expect(entrada.status).toBe(201);
    expect(entrada.body.status).toBe('recebida');
    expect(entrada.body.itens[0].quantidade_recebida).toBe(1);
    const cores = (await api.get(`/api/tecidos/${tecido.body.id}`)).body.cores as Array<{
      nome: string;
      estoque: number;
    }>;
    expect(cores.find((cor) => cor.nome === 'Preto')?.estoque).toBe(11);
    expect(cores.find((cor) => cor.nome === 'Branco')?.estoque).toBe(20);
  });

  it('sugere cor nova do tecido, ignora item sem cadastro e rastreia o documento', async () => {
    const fornecedor = await criarFornecedor();
    const tecido = await api.post('/api/tecidos').send({
      nome: 'Dry Tela Cayman',
      categoria: 'Sintetico',
      unidade: 'KG',
      custo: 35,
      cores: [{ nome: 'Preto', estoque_inicial: 10 }],
    });
    const produto = await api.post('/api/produtos').send({
      nome: 'Botao plastico',
      unidade: 'UN',
      cores: [],
      tamanhos: [],
    });
    expect(produto.status).toBe(201);
    const pdf = pdfComTexto([
      'NF-e 000124',
      'Fornecedor: Fiacao Norte',
      'CNPJ: 11.444.777/0001-61',
      '06/10/2026',
      'Dry Tela Cayman Oliva 1 KG 35,00 35,00',
      'Botao plastico 8 UN 0,50 4,00',
      'Ziper nylon 4 UN 1,50 6,00',
      'Valor total da nota 45,00',
    ]);
    const res = await api.post('/api/compras/documentos').send({
      tipo: 'nota_fiscal',
      nome_arquivo: 'nota-oliva.pdf',
      conteudo_base64: pdf.toString('base64'),
    });
    expect(res.status).toBe(201);
    const oliva = res.body.itens.find((item: { descricao: string }) => item.descricao.includes('Oliva'));
    const botao = res.body.itens.find((item: { descricao: string }) => item.descricao.startsWith('Botao'));
    const ziper = res.body.itens.find((item: { descricao: string }) => item.descricao.startsWith('Ziper'));
    expect(oliva).toMatchObject({
      materia_prima_id: tecido.body.id,
      produto_id: null,
      tecido_cor_id: null,
      cor_sugerida: 'Oliva',
      aviso: 'Cadastre a cor Oliva neste tecido',
    });
    expect(botao).toMatchObject({
      materia_prima_id: null,
      produto_id: produto.body.id,
      nome_cadastro: 'Botao plastico',
    });
    expect(ziper.materia_prima_id).toBeNull();
    expect(ziper.produto_id).toBeNull();

    const cor = await api.patch(`/api/tecidos/${tecido.body.id}`).send({
      cores: [{ nome: 'Oliva', status: 'ativo' }],
    });
    expect(cor.status).toBe(200);
    const olivaId = cor.body.cores.find((item: { nome: string }) => item.nome === 'Oliva').id;
    const pretoAntes = cor.body.cores.find((item: { nome: string }) => item.nome === 'Preto').estoque;

    const entrada = await api.post('/api/compras').send({
      fornecedor_id: fornecedor.id,
      data_emissao: res.body.data_emissao,
      nota_fiscal: res.body.numero,
      documento_importado_id: res.body.id,
      confirmar: true,
      observacoes: 'Itens novos sem cadastro: Ziper nylon.',
      itens: [
        {
          materia_prima_id: oliva.materia_prima_id,
          tecido_cor_id: olivaId,
          quantidade: oliva.quantidade,
          custo_unitario: oliva.valor_unitario,
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
    expect(entrada.body.documento_nome).toBe('nota-oliva.pdf');
    expect(entrada.body.documento_numero).toBe('000124');
    expect(entrada.body.itens).toHaveLength(2);
    expect(entrada.body.itens.find((item: { tecido_cor_id: number }) => item.tecido_cor_id === olivaId).quantidade_recebida).toBe(1);

    const depois = await api.get(`/api/tecidos/${tecido.body.id}`);
    expect(depois.body.cores.find((item: { nome: string }) => item.nome === 'Oliva').estoque).toBe(1);
    expect(depois.body.cores.find((item: { nome: string }) => item.nome === 'Preto').estoque).toBe(pretoAntes);
    const movs = await api.get(`/api/tecidos/${tecido.body.id}/movimentos`);
    const entradaOliva = (movs.body.data as Array<{ observacoes: string; referencia_tipo: string; referencia_id: number; cor_nome: string }>).find(
      (mov) => mov.cor_nome === 'Oliva',
    );
    expect(entradaOliva).toMatchObject({
      referencia_tipo: 'compra',
      referencia_id: entrada.body.id,
    });
    expect(entradaOliva?.observacoes).toContain('nota-oliva.pdf');
    expect(entradaOliva?.observacoes).toContain('000124');

    const { api: outra } = await autenticarNovaEmpresa(app);
    const fornecedorAlheio = await outra.post('/api/fornecedores').send({
      nome: 'Outra Fiação',
      cpf_cnpj: '11222333000181',
    });
    expect(fornecedorAlheio.status).toBe(201);
    const alheio = await outra.post('/api/compras').send({
      fornecedor_id: fornecedorAlheio.body.id,
      documento_importado_id: res.body.id,
      itens: [{ produto_id: produto.body.id, quantidade: 1, custo_unitario: 1 }],
    });
    expect(alheio.status).toBe(404);
    expect(alheio.body.erro).toBe('Documento não encontrado');
  });
});
