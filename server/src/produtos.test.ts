import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from './app.js';
import { createDatabase, type AppDatabase } from './db.js';
import { autenticar, type TestApi } from './httpTest.js';

const produtoBase = {
  sku: 'CAM-POLO',
  nome: 'Camiseta Polo',
  descricao: 'Polo piquet com gola',
  categoria: 'Camiseta',
  subcategoria: 'Polo',
  marca: 'Atelier Norte',
  genero: 'unissex',
  colecao: 'Verão 2026',
  cores: ['Preto', 'Branco'],
  tamanhos: ['P', 'M', 'G'],
  codigo_barras: '7891234567890',
  unidade: 'UN',
  preco_venda: 89.9,
  preco_atacado: 62.5,
  preco_custo: 28,
  estoque_minimo: 12,
  imagem: 'https://exemplo.com/polo.png',
  observacoes: 'Tecido piquet 30.1',
};

describe('API de produtos', () => {
  let db: AppDatabase;
  let api: TestApi;

  beforeEach(async () => {
    db = createDatabase(':memory:');
    api = await autenticar(createApp(db));
  });

  afterEach(() => {
    db.close();
  });

  it('lista vazia paginada', async () => {
    const res = await api.get('/api/produtos');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      data: [],
      pagina: 1,
      por_pagina: 10,
      total: 0,
      total_paginas: 1,
    });
  });

  it('cria produto com variantes cor × tamanho e SKU/barcode únicos', async () => {
    const res = await api.post('/api/produtos').send(produtoBase);
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      sku: 'CAM-POLO',
      nome: 'Camiseta Polo',
      categoria: 'Camiseta',
      subcategoria: 'Polo',
      marca: 'Atelier Norte',
      genero: 'unissex',
      colecao: 'Verão 2026',
      cores: ['Preto', 'Branco'],
      tamanhos: ['P', 'M', 'G'],
      unidade: 'UN',
      preco_venda: 89.9,
      preco_atacado: 62.5,
      preco_custo: 28,
      estoque_minimo: 12,
      status: 'ativo',
    });
    expect(res.body.id).toBeGreaterThan(0);
    expect(res.body.criado_em).toBeTruthy();
    expect(res.body.atualizado_em).toBeTruthy();
    expect(res.body.variantes).toHaveLength(6);

    const skus = res.body.variantes.map((v: { sku: string }) => v.sku);
    const barcodes = res.body.variantes.map(
      (v: { codigo_barras: string }) => v.codigo_barras,
    );
    expect(new Set(skus).size).toBe(6);
    expect(new Set(barcodes).size).toBe(6);
    expect(skus).toContain('CAM-POLO-PRETO-M');
    expect(barcodes.every((b: string) => b && b !== produtoBase.codigo_barras)).toBe(
      true,
    );
  });

  it('aceita override de SKU/barcode por variante', async () => {
    const res = await api
      .post('/api/produtos')
      .send({
        nome: 'Calça Jeans',
        sku: 'CALCA',
        cores: ['Azul'],
        tamanhos: ['42'],
        variantes: [
          {
            cor: 'Azul',
            tamanho: '42',
            sku: 'CALCA-AZ-42',
            codigo_barras: 'CALCA42AZ',
          },
        ],
      });
    expect(res.status).toBe(201);
    expect(res.body.variantes).toHaveLength(1);
    expect(res.body.variantes[0]).toMatchObject({
      cor: 'Azul',
      tamanho: '42',
      sku: 'CALCA-AZ-42',
      codigo_barras: 'CALCA42AZ',
    });
  });

  it('rejeita nome vazio, preço negativo e gênero inválido', async () => {
    const res = await api.post('/api/produtos').send({
      nome: '   ',
      preco_venda: -10,
      genero: 'outro',
    });
    expect(res.status).toBe(400);
    expect(res.body.erro).toBe('Dados inválidos');
    expect(res.body.detalhes.nome).toBeDefined();
    expect(res.body.detalhes.preco_venda).toBeDefined();
    expect(res.body.detalhes.genero).toBeDefined();
  });

  it('impede SKU duplicado entre produtos e variantes', async () => {
    await api.post('/api/produtos').send(produtoBase);
    const outro = await api.post('/api/produtos').send({
      nome: 'Outra Polo',
      sku: 'CAM-POLO',
    });
    expect(outro.status).toBe(409);
    expect(outro.body.erro).toBe('SKU já cadastrado');

    const varianteSku = await api.post('/api/produtos').send({
      nome: 'Regata',
      sku: 'CAM-POLO-PRETO-M',
    });
    expect(varianteSku.status).toBe(409);
  });

  it('impede código de barras duplicado', async () => {
    await api.post('/api/produtos').send(produtoBase);
    const res = await api.post('/api/produtos').send({
      nome: 'Outro',
      codigo_barras: '7891234567890',
    });
    expect(res.status).toBe(409);
    expect(res.body.erro).toMatch(/Código de barras/);
  });

  it('busca, filtra e pagina', async () => {
    await api.post('/api/produtos').send(produtoBase);
    await api.post('/api/produtos').send({
      nome: 'Calça Jeans',
      sku: 'CALCA-01',
      categoria: 'Calça',
      marca: 'Sul Jeans',
      genero: 'masculino',
      colecao: 'Inverno 2026',
      status: 'inativo',
      cores: ['Azul'],
      tamanhos: ['40', '42'],
    });
    await api.post('/api/produtos').send({
      nome: 'Vestido Midi',
      sku: 'VEST-01',
      categoria: 'Vestido',
      marca: 'Atelier Norte',
      genero: 'feminino',
      colecao: 'Verão 2026',
    });

    const busca = await api.get('/api/produtos').query({ q: 'Polo' });
    expect(busca.status).toBe(200);
    expect(busca.body.total).toBe(1);
    expect(busca.body.data[0].nome).toBe('Camiseta Polo');

    const porSkuVariante = await api
      .get('/api/produtos')
      .query({ q: 'CAM-POLO-BRANCO-G' });
    expect(porSkuVariante.body.total).toBe(1);

    const ativos = await api.get('/api/produtos').query({ status: 'ativo' });
    expect(ativos.body.total).toBe(2);

    const marca = await api
      .get('/api/produtos')
      .query({ marca: 'Atelier' });
    expect(marca.body.total).toBe(2);

    const genero = await api
      .get('/api/produtos')
      .query({ genero: 'feminino' });
    expect(genero.body.total).toBe(1);

    const pagina = await api
      .get('/api/produtos')
      .query({ pagina: 2, por_pagina: 2 });
    expect(pagina.body.pagina).toBe(2);
    expect(pagina.body.data).toHaveLength(1);
    expect(pagina.body.total).toBe(3);
    expect(pagina.body.total_paginas).toBe(2);

    const catalogo = await api.get('/api/produtos').query({ por_pagina: 200 });
    expect(catalogo.status).toBe(200);
    expect(catalogo.body.por_pagina).toBe(200);
    expect(catalogo.body.data).toHaveLength(3);
  });

  it('detalha, edita, altera status e gera novas variantes', async () => {
    const criada = await api.post('/api/produtos').send(produtoBase);

    const detalhe = await api.get(`/api/produtos/${criada.body.id}`);
    expect(detalhe.status).toBe(200);
    expect(detalhe.body.variantes).toHaveLength(6);

    const editada = await api
      .patch(`/api/produtos/${criada.body.id}`)
      .send({
        preco_venda: 99.9,
        estoque_minimo: 20,
        cores: ['Preto', 'Branco', 'Azul'],
        tamanhos: ['P', 'M', 'G'],
      });
    expect(editada.status).toBe(200);
    expect(editada.body.preco_venda).toBe(99.9);
    expect(editada.body.estoque_minimo).toBe(20);
    expect(editada.body.variantes).toHaveLength(9);

    const inativo = await api
      .patch(`/api/produtos/${criada.body.id}/status`)
      .send({ status: 'inativo' });
    expect(inativo.status).toBe(200);
    expect(inativo.body.status).toBe('inativo');

    const ativo = await api
      .patch(`/api/produtos/${criada.body.id}/status`)
      .send({ status: 'ativo' });
    expect(ativo.body.status).toBe('ativo');
  });

  it('cria, edita e exclui variante avulsa', async () => {
    const criada = await api.post('/api/produtos').send({
      nome: 'Jaqueta',
      sku: 'JAQ',
      cores: ['Preto'],
      tamanhos: ['M'],
    });

    const extra = await api
      .post(`/api/produtos/${criada.body.id}/variantes`)
      .send({ cor: 'Verde', tamanho: 'G', sku: 'JAQ-VERDE-G' });
    expect(extra.status).toBe(201);
    expect(extra.body.variantes).toHaveLength(2);
    expect(extra.body.cores).toContain('Verde');
    expect(extra.body.tamanhos).toContain('G');

    const variante = extra.body.variantes.find(
      (v: { sku: string }) => v.sku === 'JAQ-VERDE-G',
    );
    const editada = await api
      .patch(`/api/produtos/${criada.body.id}/variantes/${variante.id}`)
      .send({ codigo_barras: 'JAQVG01', status: 'inativo' });
    expect(editada.status).toBe(200);
    const atualizada = editada.body.variantes.find(
      (v: { id: number }) => v.id === variante.id,
    );
    expect(atualizada.codigo_barras).toBe('JAQVG01');
    expect(atualizada.status).toBe('inativo');

    const del = await api.delete(
      `/api/produtos/${criada.body.id}/variantes/${variante.id}`,
    );
    expect(del.status).toBe(204);
    const depois = await api.get(`/api/produtos/${criada.body.id}`);
    expect(depois.body.variantes).toHaveLength(1);
  });

  it('exclui produto sem vínculos e bloqueia quando há OP', async () => {
    const livre = await api.post('/api/produtos').send({
      nome: 'Produto Livre',
      sku: 'LIVRE',
    });
    const delLivre = await api.delete(`/api/produtos/${livre.body.id}`);
    expect(delLivre.status).toBe(204);

    const vinculado = await api.post('/api/produtos').send({
      nome: 'Camiseta OP',
      sku: 'CAM-OP',
      cores: ['Preto'],
      tamanhos: ['M'],
    });
    await api.post('/api/ordens').send({
      cliente: 'Loja Central',
      produto: 'Camiseta OP',
      tamanho: 'M',
      quantidade: 10,
    });

    const delBloqueado = await api.delete(
      `/api/produtos/${vinculado.body.id}`,
    );
    expect(delBloqueado.status).toBe(409);
    expect(delBloqueado.body.erro).toMatch(/ordens de produção/);

    const aindaExiste = await api.get(
      `/api/produtos/${vinculado.body.id}`,
    );
    expect(aindaExiste.status).toBe(200);

    const variante = aindaExiste.body.variantes[0];
    const delVariante = await api.delete(
      `/api/produtos/${vinculado.body.id}/variantes/${variante.id}`,
    );
    expect(delVariante.status).toBe(409);
  });

  it('mantém contrato das ordens e vincula produto_id/variante_id', async () => {
    const produto = await api.post('/api/produtos').send({
      nome: 'Camiseta Polo',
      sku: 'POLO',
      cores: ['Preto'],
      tamanhos: ['M', 'G'],
    });
    const ordem = await api.post('/api/ordens').send({
      cliente: 'Loja Central',
      produto: 'Camiseta Polo',
      tamanho: 'M',
      quantidade: 40,
    });
    expect(ordem.status).toBe(201);
    expect(ordem.body).toMatchObject({
      cliente: 'Loja Central',
      produto: 'Camiseta Polo',
      tamanho: 'M',
      quantidade: 40,
      status: 'pendente',
    });
    expect(ordem.body.produto_id).toBe(produto.body.id);
    const varianteM = produto.body.variantes.find(
      (v: { tamanho: string }) => v.tamanho === 'M',
    );
    expect(ordem.body.variante_id).toBe(varianteM.id);
  });

  it('retorna 404 para produto inexistente', async () => {
    const res = await api.get('/api/produtos/9999');
    expect(res.status).toBe(404);
  });

  it('importa catálogo em lote, atualiza ou ignora SKU duplicado sem mexer em estoque', async () => {
    const original = await api.post('/api/produtos').send({
      sku: 'CAM-POLO',
      nome: 'Camiseta Polo',
      categoria: 'Camiseta',
      marca: 'Atelier Norte',
      preco_venda: 89.9,
      cores: ['Preto'],
      tamanhos: ['M'],
    });
    expect(original.status).toBe(201);
    const movimentosAntes = (db.prepare('SELECT COUNT(*) AS n FROM estoque_movimentos').get() as { n: number }).n;
    const produtosAntes = (db.prepare('SELECT COUNT(*) AS n FROM produtos').get() as { n: number }).n;

    const csv =
      'SKU;Nome do produto;Categoria;Marca;Preço de venda;Descrição;Cores;Tamanhos\n' +
      'CAM-POLO;Polo Atualizada;Camiseta;Atelier Norte;99,90;Nova descrição;Preto, Branco;M, G\n' +
      'CAM-IMP;Camiseta Importada;Camiseta;Atelier;45,50;Malha PV;Azul;P, M\n' +
      'CAM-ERR;;Camiseta;;;;;\n';
    const analisar = await api.post('/api/produtos/importacao/analisar').send({
      nome_arquivo: 'catalogo.csv',
      conteudo_base64: Buffer.from(csv, 'utf8').toString('base64'),
    });
    expect(analisar.status).toBe(200);
    expect(analisar.body.linhas).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          sku: 'CAM-POLO',
          existente: expect.objectContaining({ id: original.body.id }),
          acao_sugerida: 'ignorar',
        }),
        expect.objectContaining({ sku: 'CAM-IMP', acao_sugerida: 'criar' }),
      ]),
    );

    const itens = (analisar.body.linhas as Array<Record<string, unknown>>).map((linha) => ({
      ...linha,
      acao:
        linha.sku === 'CAM-POLO' ? 'atualizar' : linha.sku === 'CAM-IMP' ? 'criar' : 'criar',
    }));
    const importacao = await api.post('/api/produtos/importacao').send({ itens });
    expect(importacao.status).toBe(200);
    expect(importacao.body).toMatchObject({
      importados: 1,
      atualizados: 1,
      ignorados: 0,
    });
    expect(importacao.body.erros.length).toBeGreaterThan(0);

    const polo = await api.get(`/api/produtos/${original.body.id}`);
    expect(polo.body.nome).toBe('Polo Atualizada');
    expect(polo.body.preco_venda).toBe(99.9);
    expect(polo.body.cores).toEqual(expect.arrayContaining(['Preto', 'Branco']));
    expect(polo.body.tamanhos).toEqual(expect.arrayContaining(['M', 'G']));

    const lista = await api.get('/api/produtos').query({ q: 'CAM-IMP' });
    expect(lista.body.data[0]).toMatchObject({
      sku: 'CAM-IMP',
      nome: 'Camiseta Importada',
      preco_venda: 45.5,
    });
    expect(lista.body.data[0].variantes.length).toBe(2);

    const duplicar = await api.post('/api/produtos/importacao').send({
      itens: [
        {
          sku: 'CAM-IMP',
          nome: 'Outra',
          acao: 'criar',
          cores: [],
          tamanhos: [],
        },
      ],
    });
    expect(duplicar.body.importados).toBe(0);
    expect(duplicar.body.erros[0].erro).toMatch(/já cadastrado/i);

    const ignorar = await api.post('/api/produtos/importacao').send({
      itens: [{ sku: 'CAM-POLO', nome: 'Ignorada', acao: 'ignorar' }],
    });
    expect(ignorar.body).toMatchObject({ importados: 0, atualizados: 0, ignorados: 1 });
    expect((await api.get(`/api/produtos/${original.body.id}`)).body.nome).toBe('Polo Atualizada');

    expect((db.prepare('SELECT COUNT(*) AS n FROM produtos').get() as { n: number }).n).toBe(
      produtosAntes + 1,
    );
    expect((db.prepare('SELECT COUNT(*) AS n FROM estoque_movimentos').get() as { n: number }).n).toBe(
      movimentosAntes,
    );
  });
});
