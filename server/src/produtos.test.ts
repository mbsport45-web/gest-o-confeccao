import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';
import { createApp } from './app.js';
import { createDatabase, type AppDatabase } from './db.js';

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
    const res = await request(app).get('/api/produtos');
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
    const res = await request(app).post('/api/produtos').send(produtoBase);
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
    const res = await request(app)
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
    const res = await request(app).post('/api/produtos').send({
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
    await request(app).post('/api/produtos').send(produtoBase);
    const outro = await request(app).post('/api/produtos').send({
      nome: 'Outra Polo',
      sku: 'CAM-POLO',
    });
    expect(outro.status).toBe(409);
    expect(outro.body.erro).toBe('SKU já cadastrado');

    const varianteSku = await request(app).post('/api/produtos').send({
      nome: 'Regata',
      sku: 'CAM-POLO-PRETO-M',
    });
    expect(varianteSku.status).toBe(409);
  });

  it('impede código de barras duplicado', async () => {
    await request(app).post('/api/produtos').send(produtoBase);
    const res = await request(app).post('/api/produtos').send({
      nome: 'Outro',
      codigo_barras: '7891234567890',
    });
    expect(res.status).toBe(409);
    expect(res.body.erro).toMatch(/Código de barras/);
  });

  it('busca, filtra e pagina', async () => {
    await request(app).post('/api/produtos').send(produtoBase);
    await request(app).post('/api/produtos').send({
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
    await request(app).post('/api/produtos').send({
      nome: 'Vestido Midi',
      sku: 'VEST-01',
      categoria: 'Vestido',
      marca: 'Atelier Norte',
      genero: 'feminino',
      colecao: 'Verão 2026',
    });

    const busca = await request(app).get('/api/produtos').query({ q: 'Polo' });
    expect(busca.status).toBe(200);
    expect(busca.body.total).toBe(1);
    expect(busca.body.data[0].nome).toBe('Camiseta Polo');

    const porSkuVariante = await request(app)
      .get('/api/produtos')
      .query({ q: 'CAM-POLO-BRANCO-G' });
    expect(porSkuVariante.body.total).toBe(1);

    const ativos = await request(app).get('/api/produtos').query({ status: 'ativo' });
    expect(ativos.body.total).toBe(2);

    const marca = await request(app)
      .get('/api/produtos')
      .query({ marca: 'Atelier' });
    expect(marca.body.total).toBe(2);

    const genero = await request(app)
      .get('/api/produtos')
      .query({ genero: 'feminino' });
    expect(genero.body.total).toBe(1);

    const pagina = await request(app)
      .get('/api/produtos')
      .query({ pagina: 2, por_pagina: 2 });
    expect(pagina.body.pagina).toBe(2);
    expect(pagina.body.data).toHaveLength(1);
    expect(pagina.body.total).toBe(3);
    expect(pagina.body.total_paginas).toBe(2);
  });

  it('detalha, edita, altera status e gera novas variantes', async () => {
    const criada = await request(app).post('/api/produtos').send(produtoBase);

    const detalhe = await request(app).get(`/api/produtos/${criada.body.id}`);
    expect(detalhe.status).toBe(200);
    expect(detalhe.body.variantes).toHaveLength(6);

    const editada = await request(app)
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

    const inativo = await request(app)
      .patch(`/api/produtos/${criada.body.id}/status`)
      .send({ status: 'inativo' });
    expect(inativo.status).toBe(200);
    expect(inativo.body.status).toBe('inativo');

    const ativo = await request(app)
      .patch(`/api/produtos/${criada.body.id}/status`)
      .send({ status: 'ativo' });
    expect(ativo.body.status).toBe('ativo');
  });

  it('cria, edita e exclui variante avulsa', async () => {
    const criada = await request(app).post('/api/produtos').send({
      nome: 'Jaqueta',
      sku: 'JAQ',
      cores: ['Preto'],
      tamanhos: ['M'],
    });

    const extra = await request(app)
      .post(`/api/produtos/${criada.body.id}/variantes`)
      .send({ cor: 'Verde', tamanho: 'G', sku: 'JAQ-VERDE-G' });
    expect(extra.status).toBe(201);
    expect(extra.body.variantes).toHaveLength(2);
    expect(extra.body.cores).toContain('Verde');
    expect(extra.body.tamanhos).toContain('G');

    const variante = extra.body.variantes.find(
      (v: { sku: string }) => v.sku === 'JAQ-VERDE-G',
    );
    const editada = await request(app)
      .patch(`/api/produtos/${criada.body.id}/variantes/${variante.id}`)
      .send({ codigo_barras: 'JAQVG01', status: 'inativo' });
    expect(editada.status).toBe(200);
    const atualizada = editada.body.variantes.find(
      (v: { id: number }) => v.id === variante.id,
    );
    expect(atualizada.codigo_barras).toBe('JAQVG01');
    expect(atualizada.status).toBe('inativo');

    const del = await request(app).delete(
      `/api/produtos/${criada.body.id}/variantes/${variante.id}`,
    );
    expect(del.status).toBe(204);
    const depois = await request(app).get(`/api/produtos/${criada.body.id}`);
    expect(depois.body.variantes).toHaveLength(1);
  });

  it('exclui produto sem vínculos e bloqueia quando há OP', async () => {
    const livre = await request(app).post('/api/produtos').send({
      nome: 'Produto Livre',
      sku: 'LIVRE',
    });
    const delLivre = await request(app).delete(`/api/produtos/${livre.body.id}`);
    expect(delLivre.status).toBe(204);

    const vinculado = await request(app).post('/api/produtos').send({
      nome: 'Camiseta OP',
      sku: 'CAM-OP',
      cores: ['Preto'],
      tamanhos: ['M'],
    });
    await request(app).post('/api/ordens').send({
      cliente: 'Loja Central',
      produto: 'Camiseta OP',
      tamanho: 'M',
      quantidade: 10,
    });

    const delBloqueado = await request(app).delete(
      `/api/produtos/${vinculado.body.id}`,
    );
    expect(delBloqueado.status).toBe(409);
    expect(delBloqueado.body.erro).toMatch(/ordens de produção/);

    const aindaExiste = await request(app).get(
      `/api/produtos/${vinculado.body.id}`,
    );
    expect(aindaExiste.status).toBe(200);

    const variante = aindaExiste.body.variantes[0];
    const delVariante = await request(app).delete(
      `/api/produtos/${vinculado.body.id}/variantes/${variante.id}`,
    );
    expect(delVariante.status).toBe(409);
  });

  it('mantém contrato das ordens e vincula produto_id/variante_id', async () => {
    const produto = await request(app).post('/api/produtos').send({
      nome: 'Camiseta Polo',
      sku: 'POLO',
      cores: ['Preto'],
      tamanhos: ['M', 'G'],
    });
    const ordem = await request(app).post('/api/ordens').send({
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
    const res = await request(app).get('/api/produtos/9999');
    expect(res.status).toBe(404);
  });
});
