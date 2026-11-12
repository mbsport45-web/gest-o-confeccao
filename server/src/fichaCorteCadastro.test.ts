import { afterEach, describe, expect, it } from 'vitest';
import { createApp } from './app.js';
import { createDatabase } from './db.js';
import {
  garantirCliente,
  garantirProduto,
  lerTecidoFicha,
  listarSugestoesFichaCorte,
} from './fichaCorteCadastro.js';
import { autenticar } from './httpTest.js';

const databases: Array<ReturnType<typeof createDatabase>> = [];

afterEach(() => {
  for (const db of databases) db.close();
  databases.length = 0;
});

describe('cadastro inteligente da ficha de corte', () => {
  it('não duplica cliente, modelo ou referência e não altera o tecido original', async () => {
    const db = createDatabase(':memory:');
    databases.push(db);
    const app = createApp(db);
    const api = await autenticar(app);
    const empresaId = 1;

    const clienteA = garantirCliente(db, empresaId, { cliente: 'Loja Norte' });
    const clienteB = garantirCliente(db, empresaId, { cliente: 'loja norte' });
    expect(clienteA?.id).toBe(clienteB?.id);
    expect(
      (db.prepare('SELECT COUNT(*) AS n FROM clientes WHERE empresa_id = ?').get(empresaId) as { n: number }).n,
    ).toBe(1);

    const produtoA = garantirProduto(db, empresaId, { modelo: 'Camiseta Dry', referencia: 'CAM-01' });
    const produtoB = garantirProduto(db, empresaId, { referencia: 'cam-01' });
    const produtoC = garantirProduto(db, empresaId, { modelo: 'camiseta dry' });
    expect(produtoA?.id).toBe(produtoB?.id);
    expect(produtoA?.id).toBe(produtoC?.id);
    expect(
      (db.prepare('SELECT COUNT(*) AS n FROM produtos WHERE empresa_id = ?').get(empresaId) as { n: number }).n,
    ).toBe(1);

    const materia = await api.post('/api/materias-primas').send({
      codigo: 'PV-FICHA',
      nome: 'Malha PV',
      tipo: 'tecido',
      unidade: 'KG',
      largura_cm: 160,
      gramatura: 180,
      composicao: '67% poliester',
    });
    const op = await api.post('/api/ordens').send({
      cliente: 'Loja Norte',
      cliente_id: clienteA?.id,
      produto: 'Camiseta Dry',
      quantidade: 2,
      status: 'planejada',
      grade: [{ cor: 'Preto', tamanho: 'M', quantidade: 2 }],
    });
    await api.post(`/api/ordens/${op.body.id}/ordem-corte`).send({});
    const patch = await api.patch(`/api/ordens/${op.body.id}/ordem-corte`).send({
      modelo: 'Camiseta Dry',
      referencia: 'CAM-01',
      composicao: '100% algodão na ficha',
      materia_prima_id: materia.body.id,
      tecido_nome: 'Malha PV editada',
      tecido_cor: 'Preto',
      tecido_largura_cm: 180,
      tecido_gramatura: 200,
      tecido_unidade: 'KG',
    });
    expect(patch.status).toBe(200);
    expect(patch.body.tecido_nome).toBe('Malha PV editada');
    expect(patch.body.tecido_largura_cm).toBe(180);
    expect(patch.body.composicao).toBe('100% algodão na ficha');

    const original = await api.get(`/api/materias-primas/${materia.body.id}`);
    expect(original.body.nome).toBe('Malha PV');
    expect(original.body.largura_cm).toBe(160);
    expect(original.body.gramatura).toBe(180);
    expect(original.body.composicao).toBe('67% poliester');

    const snapshot = lerTecidoFicha(db, empresaId, patch.body.id);
    expect(snapshot?.nome).toBe('Malha PV editada');
    expect(snapshot?.largura_cm).toBe(180);
  });

  it('salva e recupera largura 1,60, gramatura decimal e rolo alfanumérico', async () => {
    const db = createDatabase(':memory:');
    databases.push(db);
    const app = createApp(db);
    const api = await autenticar(app);

    const materia = await api.post('/api/materias-primas').send({
      codigo: 'PV-DECIMAL',
      nome: 'Malha PV',
      tipo: 'tecido',
      unidade: 'KG',
      largura_cm: 160,
      gramatura: 180,
    });
    const op = await api.post('/api/ordens').send({
      cliente: 'Loja Norte',
      produto: 'Camiseta Dry',
      quantidade: 2,
      status: 'planejada',
      grade: [{ cor: 'Preto', tamanho: 'M', quantidade: 2 }],
    });
    await api.post(`/api/ordens/${op.body.id}/ordem-corte`).send({});
    const patch = await api.patch(`/api/ordens/${op.body.id}/ordem-corte`).send({
      materia_prima_id: materia.body.id,
      tecido_largura_cm: '1,60',
      tecido_largura_unidade: 'm',
      tecido_gramatura: '180,5',
      tecido_numero_rolo: 'R-12A',
    });
    expect(patch.status).toBe(200);
    expect(patch.body.tecido_largura_cm).toBeCloseTo(1.6);
    expect(patch.body.tecido_largura_unidade).toBe('m');
    expect(patch.body.tecido_gramatura).toBeCloseTo(180.5);
    expect(patch.body.tecido_numero_rolo).toBe('R-12A');

    const lido = await api.get(`/api/ordens/${op.body.id}/ordem-corte`);
    expect(lido.body.tecido_largura_cm).toBeCloseTo(1.6);
    expect(lido.body.tecido_largura_unidade).toBe('m');
    expect(lido.body.tecido_numero_rolo).toBe('R-12A');

    const original = await api.get(`/api/materias-primas/${materia.body.id}`);
    expect(original.body.largura_cm).toBe(160);
    expect(original.body.gramatura).toBe(180);

    const rascunho = await api.put('/api/ordens/ordem-corte/rascunho').send({
      tecido_largura_cm: 1.6,
      tecido_largura_unidade: 'm',
      tecido_numero_rolo: 'R-12A',
    });
    expect(rascunho.status).toBe(200);
    const rascunhoLido = await api.get('/api/ordens/ordem-corte/rascunho');
    expect(rascunhoLido.body.payload.tecido_largura_cm).toBe(1.6);
    expect(rascunhoLido.body.payload.tecido_largura_unidade).toBe('m');
    expect(rascunhoLido.body.payload.tecido_numero_rolo).toBe('R-12A');
  });

  it('salva e recupera rascunho da ficha nova', async () => {
    const db = createDatabase(':memory:');
    databases.push(db);
    const app = createApp(db);
    const api = await autenticar(app);

    const vazio = await api.get('/api/ordens/ordem-corte/rascunho');
    expect(vazio.status).toBe(200);
    expect(vazio.body.payload.codigo).toBe('OC-01');

    const salvo = await api.put('/api/ordens/ordem-corte/rascunho').send({
      cliente: 'Loja Rascunho',
      modelo: 'Polo',
      referencia: 'POLO-01',
      tecido_nome: 'Malha',
      tecido_unidade: 'KG',
      codigo: 'OC-99',
    });
    expect(salvo.status).toBe(200);

    const lido = await api.get('/api/ordens/ordem-corte/rascunho');
    expect(lido.body.payload.cliente).toBe('Loja Rascunho');
    expect(lido.body.payload.modelo).toBe('Polo');
    expect(lido.body.payload.referencia).toBe('POLO-01');
    expect(lido.body.payload.codigo).toBe('OC-01');

    const apagado = await api.delete('/api/ordens/ordem-corte/rascunho');
    expect(apagado.status).toBe(204);
    const depois = await api.get('/api/ordens/ordem-corte/rascunho');
    expect(depois.body.payload.codigo).toBe('OC-02');
  });

  it('lista modelos e referências já usados sem duplicar', () => {
    const db = createDatabase(':memory:');
    databases.push(db);
    const produto = garantirProduto(db, 1, { modelo: 'Camiseta Dry', referencia: 'CAM-01' });
    db.prepare(`UPDATE produtos SET imagem = ? WHERE id = ?`).run(
      'https://catalogo/cam-dry.png',
      produto?.id,
    );
    const lista = listarSugestoesFichaCorte(db, 1);
    expect(lista.modelos.some((item) => item.modelo === 'Camiseta Dry')).toBe(true);
    expect(lista.referencias.some((item) => item.referencia === 'CAM-01')).toBe(true);
    expect(lista.modelos.find((item) => item.referencia === 'CAM-01')?.imagem).toBe(
      'https://catalogo/cam-dry.png',
    );
  });
});
