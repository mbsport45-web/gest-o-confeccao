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
      forma_pagamento: 'a_prazo',
      vencimento: '2026-11-06',
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

  it('cadastra o fornecedor da importação, evita duplicidade e reutiliza o cadastro', async () => {
    const materia = await criarMateria();
    const { api: outra } = await autenticarNovaEmpresa(app);
    const alheio = await outra.post('/api/fornecedores').send({
      tipo_pessoa: 'juridica',
      nome: 'Tecidos de outra empresa',
      cpf_cnpj: CNPJ,
    });
    expect(alheio.status).toBe(201);

    const linhas = [
      'NF-e 4500',
      'Fornecedor: Tecidos Sul Ltda',
      'Nome fantasia: Sul Tecidos',
      'CNPJ: 11.444.777/0001-61',
      'Inscricao Estadual: 012345678',
      'Telefone: (81) 3333-4444',
      'WhatsApp: (81) 98888-7777',
      'E-mail: contato@fiacao.com.br',
      'CEP: 50050-110',
      'Endereco: Rua das Flores, 100',
      'Numero: 250',
      'Complemento: Sala 3',
      'Bairro: Boa Vista',
      'Cidade: Recife',
      'Estado: PE',
      '06/10/2026',
      'Observacoes: Entregar na portaria',
      'Malha Compra 2 KG 10,00 20,00',
      'Valor total da nota 20,00',
    ];
    const pdf = pdfComTexto(linhas);
    const lido = await api.post('/api/compras/documentos').send({
      tipo: 'nota_fiscal',
      nome_arquivo: 'nota-sul.pdf',
      conteudo_base64: pdf.toString('base64'),
    });
    expect(lido.status).toBe(201);
    expect(lido.body.fornecedor).toBeNull();
    expect(lido.body.cpf).toBeNull();
    expect(lido.body).toMatchObject({
      emitente: 'Tecidos Sul Ltda',
      cnpj: CNPJ,
      tipo_pessoa: 'juridica',
      nome_fantasia: 'Sul Tecidos',
      telefone: '8133334444',
      endereco: 'Rua das Flores, 100',
      numero_endereco: '250',
      cidade: 'Recife',
      estado: 'PE',
    });
    expect((await api.get('/api/fornecedores')).body.total).toBe(0);
    expect((await api.get('/api/compras')).body.total).toBe(0);

    const editado = {
      tipo_pessoa: 'juridica',
      nome: 'Tecidos Sul Ltda',
      nome_fantasia: 'Sul Revisada',
      cpf_cnpj: lido.body.cnpj,
      inscricao_estadual: lido.body.inscricao_estadual,
      telefone: '81999998888',
      whatsapp: lido.body.whatsapp,
      email: lido.body.email,
      cep: lido.body.cep,
      endereco: lido.body.endereco,
      numero: lido.body.numero_endereco,
      complemento: lido.body.complemento,
      bairro: lido.body.bairro,
      cidade: lido.body.cidade,
      estado: lido.body.estado,
      observacoes: 'Conferido na importação',
    };
    const criado = await api.post('/api/fornecedores').send(editado);
    expect(criado.status).toBe(201);
    expect(criado.body).toMatchObject({
      nome: 'Tecidos Sul Ltda',
      nome_fantasia: 'Sul Revisada',
      cpf_cnpj: CNPJ,
      telefone: '81999998888',
      whatsapp: '81988887777',
      numero: '250',
      endereco: 'Rua das Flores, 100',
      cidade: 'Recife',
      estado: 'PE',
      observacoes: 'Conferido na importação',
    });
    expect((await api.get('/api/compras')).body.total).toBe(0);

    const repetido = await api.post('/api/fornecedores').send({
      ...editado,
      nome: 'Outro nome que não pode gravar',
      telefone: '8130000000',
    });
    expect(repetido.status).toBe(409);
    expect(repetido.body.fornecedor.id).toBe(criado.body.id);
    expect(repetido.body.fornecedor.nome).toBe('Tecidos Sul Ltda');
    expect(repetido.body.fornecedor.telefone).toBe('81999998888');
    expect((await api.get('/api/fornecedores')).body.total).toBe(1);
    expect((await outra.get('/api/fornecedores')).body.total).toBe(1);
    expect((await outra.get(`/api/fornecedores/${criado.body.id}`)).status).toBe(404);

    const pessoa = await api.post('/api/fornecedores').send({
      tipo_pessoa: 'juridica',
      nome: 'Documento errado',
      cpf_cnpj: '52998224725',
    });
    expect(pessoa.status).toBe(400);

    const entrada = await api.post('/api/compras').send({
      fornecedor_id: criado.body.id,
      data_emissao: lido.body.data_emissao,
      documento_importado_id: lido.body.id,
      confirmar: true,
      forma_pagamento: 'a_vista',
      itens: [
        {
          materia_prima_id: materia.id,
          quantidade: 2,
          custo_unitario: 10,
          unidade: 'KG',
        },
      ],
    });
    expect(entrada.status).toBe(201);
    expect(entrada.body.fornecedor_id).toBe(criado.body.id);
    expect(entrada.body.status).toBe('recebida');
    expect((await api.get('/api/compras')).body.total).toBe(1);

    const outraNota = pdfComTexto([
      'NF-e 4501',
      ...linhas.slice(1),
      'Referencia interna diferente',
    ]);
    const reutilizado = await api.post('/api/compras/documentos').send({
      tipo: 'nota_fiscal',
      nome_arquivo: 'nota-sul-2.pdf',
      conteudo_base64: outraNota.toString('base64'),
    });
    expect(reutilizado.status).toBe(201);
    expect(reutilizado.body.numero).toBe('4501');
    expect(reutilizado.body.fornecedor).toEqual({ id: criado.body.id, nome: 'Tecidos Sul Ltda' });
    expect(reutilizado.body.ja_importado).toBe(false);

    const copia = await api.post('/api/compras/documentos').send({
      tipo: 'nota_fiscal',
      nome_arquivo: 'nota-sul-copia.pdf',
      conteudo_base64: pdf.toString('base64'),
    });
    expect(copia.body.ja_importado).toBe(true);
    const bloqueada = await api.post('/api/compras').send({
      fornecedor_id: criado.body.id,
      documento_importado_id: copia.body.id,
      confirmar: true,
      itens: [{ materia_prima_id: materia.id, quantidade: 1, custo_unitario: 1 }],
    });
    expect(bloqueada.status).toBe(409);
    expect((await api.get('/api/compras')).body.total).toBe(1);

    const pdfCpf = pdfComTexto([
      'Pedido de compra: PC-77',
      'Fornecedor: Ana Costa',
      'CPF: 529.982.247-25',
      'Cidade: Olinda',
      'Malha Compra 1 KG 10,00',
    ]);
    const lidoCpf = await api.post('/api/compras/documentos').send({
      tipo: 'pedido_compra',
      nome_arquivo: 'pedido-ana.pdf',
      conteudo_base64: pdfCpf.toString('base64'),
    });
    expect(lidoCpf.status).toBe(201);
    expect(lidoCpf.body.fornecedor).toBeNull();
    expect(lidoCpf.body.cpf).toBe('52998224725');
    expect(lidoCpf.body.tipo_pessoa).toBe('fisica');
    const ana = await api.post('/api/fornecedores').send({
      tipo_pessoa: 'fisica',
      nome: 'Ana Costa',
      cpf_cnpj: '52998224725',
      cidade: 'Olinda',
    });
    expect(ana.status).toBe(201);
    const pdfCpf2 = pdfComTexto([
      'Pedido de compra: PC-78',
      'Fornecedor: Ana Costa',
      'CPF: 529.982.247-25',
      'Malha Compra 1 KG 10,00',
    ]);
    const deNovoCpf = await api.post('/api/compras/documentos').send({
      tipo: 'pedido_compra',
      nome_arquivo: 'pedido-ana-2.pdf',
      conteudo_base64: pdfCpf2.toString('base64'),
    });
    expect(deNovoCpf.body.fornecedor).toEqual({ id: ana.body.id, nome: 'Ana Costa' });
    const cruzado = await outra.post('/api/compras/documentos').send({
      tipo: 'pedido_compra',
      nome_arquivo: 'pedido-ana.pdf',
      conteudo_base64: pdfCpf.toString('base64'),
    });
    expect(cruzado.body.fornecedor).toBeNull();
  });

  it('importa itens da DANFE, confirma o estoque uma vez e recusa a segunda entrada', async () => {
    const pdf = pdfComTexto([
      '000.063.237Nº:',
      '255456883 08.755.180/0001-23',
      'RECEBEMOS DE WILLRICH MALHAS MATRIZ OS PRODUTOS DA NOTA',
      'R GUSTAVO RICHARD, 58',
      'CENTRO II',
      'BRUSQUE',
      'SC',
      'CEP: 88354010',
      'TELEFONE: 4733516593',
      'DESTINATARIO',
      'Cidade: Sao Paulo',
      '00 6101 KG 10,5000 34,000000 357,00 DRY FIT TELA PRETO',
      'ELASTANO - 10534-PRETO',
    ]);
    const lido = await api.post('/api/compras/documentos').send({
      tipo: 'nota_fiscal',
      nome_arquivo: 'danfe-willrich.pdf',
      conteudo_base64: pdf.toString('base64'),
    });
    expect(lido.status).toBe(201);
    expect(lido.body).toMatchObject({
      numero: '000.063.237',
      emitente: 'WILLRICH MALHAS MATRIZ',
      cnpj: '08755180000123',
      inscricao_estadual: '255456883',
      telefone: '4733516593',
      cep: '88354010',
      endereco: 'R GUSTAVO RICHARD',
      numero_endereco: '58',
      bairro: 'CENTRO II',
      cidade: 'BRUSQUE',
      estado: 'SC',
      nome_fantasia: null,
      fornecedor: null,
      ja_importado: false,
    });
    expect(lido.body.itens).toEqual([
      expect.objectContaining({
        descricao: 'DRY FIT TELA PRETO ELASTANO - 10534-PRETO',
        quantidade: 10.5,
        unidade: 'KG',
        valor_unitario: 34,
        total: 357,
        materia_prima_id: null,
      }),
    ]);
    expect((await api.get('/api/compras')).body.total).toBe(0);
    expect((await api.get('/api/fornecedores')).body.total).toBe(0);
    expect((await api.get('/api/estoque/movimentos')).body.total).toBe(0);

    const fornecedor = await api.post('/api/fornecedores').send({
      tipo_pessoa: 'juridica',
      nome: lido.body.emitente,
      cpf_cnpj: lido.body.cnpj,
      inscricao_estadual: lido.body.inscricao_estadual,
      telefone: lido.body.telefone,
      cep: lido.body.cep,
      endereco: lido.body.endereco,
      numero: lido.body.numero_endereco,
      bairro: lido.body.bairro,
      cidade: lido.body.cidade,
      estado: lido.body.estado,
    });
    expect(fornecedor.status).toBe(201);
    const repetido = await api.post('/api/fornecedores').send({
      tipo_pessoa: 'juridica',
      nome: 'Outra grafia',
      cpf_cnpj: lido.body.cnpj,
    });
    expect(repetido.status).toBe(409);

    const materia = await api.post('/api/materias-primas').send({
      nome: 'DRY FIT TELA PRETO',
      tipo: 'tecido',
      unidade: 'KG',
      custo: 34,
    });
    expect(materia.status).toBe(201);
    const entrada = await api.post('/api/compras').send({
      fornecedor_id: fornecedor.body.id,
      documento_importado_id: lido.body.id,
      confirmar: true,
      forma_pagamento: 'a_prazo',
      vencimento: '2026-11-20',
      itens: [
        {
          materia_prima_id: materia.body.id,
          quantidade: lido.body.itens[0].quantidade,
          custo_unitario: lido.body.itens[0].valor_unitario,
          unidade: 'KG',
        },
      ],
    });
    expect(entrada.status).toBe(201);
    expect(entrada.body.status).toBe('recebida');
    expect(entrada.body.itens[0].quantidade_recebida).toBe(10.5);
    expect((await api.get('/api/estoque/movimentos')).body.total).toBe(1);

    const deNovo = await api.post('/api/compras/documentos').send({
      tipo: 'nota_fiscal',
      nome_arquivo: 'danfe-willrich-copia.pdf',
      conteudo_base64: pdf.toString('base64'),
    });
    expect(deNovo.status).toBe(201);
    expect(deNovo.body.ja_importado).toBe(true);
    expect(deNovo.body.fornecedor).toEqual({ id: fornecedor.body.id, nome: 'WILLRICH MALHAS MATRIZ' });
    const segunda = await api.post('/api/compras').send({
      fornecedor_id: fornecedor.body.id,
      documento_importado_id: deNovo.body.id,
      confirmar: true,
      itens: [
        {
          materia_prima_id: materia.body.id,
          quantidade: 10.5,
          custo_unitario: 34,
          unidade: 'KG',
        },
      ],
    });
    expect(segunda.status).toBe(409);
    expect((await api.get('/api/compras')).body.total).toBe(1);
    expect((await api.get('/api/estoque/movimentos')).body.total).toBe(1);
  });

  it('confirma a nota com entrada de estoque, parcelas a pagar e recusa dados inventados', async () => {
    const pdf = pdfComTexto([
      'NF-e 7701',
      'DANFE',
      'CNPJ: 11.444.777/0001-61',
      'Fiação Norte',
      'Emissão 20/10/2026',
      'Malha Compra 12,000 KG 20,00 240,00 PRETO',
    ]);
    const materia = await criarMateria();
    const fornecedor = await criarFornecedor();
    const lido = await api.post('/api/compras/documentos').send({
      tipo: 'nota_fiscal',
      nome_arquivo: 'nfe-7701.pdf',
      conteudo_base64: pdf.toString('base64'),
    });
    expect(lido.status).toBe(201);
    expect((await api.get('/api/estoque').query({ tipo: 'materia' })).body.total).toBe(0);
    expect((await api.get('/api/financeiro/lancamentos').query({ tipo: 'pagar' })).body.total).toBe(0);

    const semPagamento = await api.post('/api/compras').send({
      fornecedor_id: fornecedor.id,
      documento_importado_id: lido.body.id,
      confirmar: true,
      itens: [{ materia_prima_id: materia.id, quantidade: 12, custo_unitario: 20, unidade: 'KG', cor: 'Preto' }],
    });
    expect(semPagamento.status).toBe(400);
    expect(semPagamento.body.erro).toMatch(/à vista ou a prazo/i);
    expect((await api.get('/api/estoque/movimentos')).body.total).toBe(0);

    const semVencimento = await api.post('/api/compras').send({
      fornecedor_id: fornecedor.id,
      documento_importado_id: lido.body.id,
      confirmar: true,
      forma_pagamento: 'a_prazo',
      itens: [{ materia_prima_id: materia.id, quantidade: 12, custo_unitario: 20, unidade: 'KG', cor: 'Preto' }],
    });
    expect(semVencimento.status).toBe(400);
    expect(semVencimento.body.erro).toMatch(/vencimento ou as parcelas/i);

    const entrada = await api.post('/api/compras').send({
      fornecedor_id: fornecedor.id,
      data_emissao: '2026-10-20',
      documento_importado_id: lido.body.id,
      confirmar: true,
      forma_pagamento: 'a_prazo',
      parcelas: [
        { vencimento: '2026-11-20', valor: 120 },
        { vencimento: '2026-12-20', valor: 120 },
      ],
      itens: [{ materia_prima_id: materia.id, quantidade: 12, custo_unitario: 20, unidade: 'KG', cor: 'Preto' }],
      itens_ignorados: [{ descricao: 'Aviamento sem cadastro', aviso: 'Item não encontrado no cadastro' }],
    });
    expect(entrada.status).toBe(201);
    expect(entrada.body.status).toBe('recebida');
    expect(entrada.body.itens[0]).toMatchObject({
      quantidade_recebida: 12,
      unidade: 'KG',
      cor: 'Preto',
    });
    expect(entrada.body.confirmacao.estoque).toEqual([
      expect.objectContaining({
        materia_prima_id: materia.id,
        quantidade: 12,
        unidade: 'KG',
        cor: 'Preto',
        saldo: 12,
      }),
    ]);
    expect(entrada.body.confirmacao.financeiro).toHaveLength(2);
    expect(entrada.body.confirmacao.itens_ignorados).toEqual([
      { descricao: 'Aviamento sem cadastro', aviso: 'Item não encontrado no cadastro' },
    ]);

    const estoque = await api.get('/api/estoque').query({ tipo: 'materia' });
    expect(estoque.body.data[0]).toMatchObject({ nome: 'Malha Compra', quantidade: 12, unidade: 'KG' });

    const pagar = await api.get('/api/financeiro/lancamentos').query({ tipo: 'pagar' });
    expect(pagar.body.total).toBe(2);
    expect(pagar.body.data.map((l: { valor: number; status: string }) => l.valor).sort()).toEqual([120, 120]);
    expect(pagar.body.data.every((l: { status: string }) => l.status === 'pendente')).toBe(true);
    expect(pagar.body.data[0].descricao).toMatch(/NF 7701|NF-e 7701|7701/);

    const relatorio = await api.get('/api/relatorios/financeiro');
    expect(relatorio.status).toBe(200);
    expect(relatorio.body.totais.pagar).toBe(240);
    expect(relatorio.body.totais.pendente).toBe(240);
    expect(relatorio.body.data.some((l: { descricao: string }) => /7701/.test(l.descricao))).toBe(true);

    const repetida = await api.post('/api/compras').send({
      fornecedor_id: fornecedor.id,
      documento_importado_id: lido.body.id,
      confirmar: true,
      forma_pagamento: 'a_prazo',
      vencimento: '2026-11-20',
      itens: [{ materia_prima_id: materia.id, quantidade: 12, custo_unitario: 20, unidade: 'KG' }],
    });
    expect(repetida.status).toBe(409);
    expect((await api.get('/api/estoque').query({ tipo: 'materia' })).body.data[0].quantidade).toBe(12);
    expect((await api.get('/api/financeiro/lancamentos').query({ tipo: 'pagar' })).body.total).toBe(2);
  });
});
