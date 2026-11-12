import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createApp } from './app.js';
import { createDatabase, type AppDatabase } from './db.js';
import { autenticar, autenticarPapel, type TestApi } from './httpTest.js';
import { formatarCodigoOc, numeroDeCodigoOc, reservarProximoCodigoOc } from './ordemCorteCodigo.js';

describe('numeração automática da O.C.', () => {
  let db: AppDatabase | undefined;
  const databases: AppDatabase[] = [];

  afterEach(() => {
    db?.close();
    db = undefined;
    for (const extra of databases) extra.close();
    databases.length = 0;
  });

  async function criarOpComCorte(api: TestApi, sufixo: string) {
    const produto = await api.post('/api/produtos').send({
      sku: `CAM-${sufixo}`,
      nome: `Camiseta ${sufixo}`,
    });
    const op = await api.post('/api/ordens').send({
      cliente: `Loja ${sufixo}`,
      produto_id: produto.body.id,
      quantidade: 2,
      grade: [{ cor: 'Preto', tamanho: 'M', quantidade: 2 }],
      status: 'planejada',
    });
    const corte = await api.post(`/api/ordens/${op.body.id}/ordem-corte`).send({});
    return { op: op.body as { id: number }, corte: corte.body as { id: number; codigo: string } };
  }

  it('formata a sequência 01, 02, 03 a partir de OC- ou só número', () => {
    expect(formatarCodigoOc(1)).toBe('OC-01');
    expect(formatarCodigoOc(12)).toBe('OC-12');
    expect(numeroDeCodigoOc('OC-01')).toBe(1);
    expect(numeroDeCodigoOc('01')).toBe(1);
    expect(numeroDeCodigoOc('OC-12')).toBe(12);
    expect(numeroDeCodigoOc('OC-FICHA')).toBeNull();
  });

  it('gera o próximo número, não repete e mantém o original na edição', async () => {
    db = createDatabase(':memory:');
    const api = await autenticar(createApp(db));
    const primeira = await criarOpComCorte(api, 'A');
    const segunda = await criarOpComCorte(api, 'B');
    expect(primeira.corte.codigo).toBe('OC-01');
    expect(segunda.corte.codigo).toBe('OC-02');

    const editada = await api.patch(`/api/ordens/${primeira.op.id}/ordem-corte`).send({
      codigo: 'OC-99',
      modelo: 'Polo',
    });
    expect(editada.body.codigo).toBe('OC-01');
    expect(editada.body.modelo).toBe('Polo');

    const reaberta = await api.get(`/api/ordens/${primeira.op.id}/ordem-corte`);
    expect(reaberta.body.codigo).toBe('OC-01');
    expect(reaberta.body.modelo).toBe('Polo');

    const repetida = await api.post(`/api/ordens/${primeira.op.id}/ordem-corte`).send({ codigo: 'OC-03' });
    expect(repetida.body.codigo).toBe('OC-01');
    expect(repetida.body.id).toBe(primeira.corte.id);
  });

  it('continua a numeração depois do maior código já cadastrado', async () => {
    db = createDatabase(':memory:');
    const api = await autenticar(createApp(db));
    const { corte } = await criarOpComCorte(api, 'ALTA');
    db.prepare('UPDATE ordens_corte SET codigo = ? WHERE id = ?').run('OC-12', corte.id);

    const rascunho = await api.get('/api/ordens/ordem-corte/rascunho');
    expect(rascunho.body.payload.codigo).toBe('OC-13');
    const deNovo = await api.get('/api/ordens/ordem-corte/rascunho');
    expect(deNovo.body.payload.codigo).toBe('OC-13');
  });

  it('ignora número digitado no rascunho e segue as OCs já cadastradas', async () => {
    db = createDatabase(':memory:');
    const api = await autenticar(createApp(db));
    await criarOpComCorte(api, 'BASE');
    db.prepare(
      `INSERT INTO ordem_corte_rascunhos (empresa_id, usuario_id, payload, atualizado_em)
       VALUES (1, 1, ?, datetime('now'))`,
    ).run(JSON.stringify({ codigo: 'OC-78', cliente: 'Rascunho antigo' }));

    const rascunho = await api.get('/api/ordens/ordem-corte/rascunho');
    expect(rascunho.body.payload.codigo).toBe('OC-02');
    expect(rascunho.body.payload.cliente).toBe('Rascunho antigo');
    expect((db.prepare('SELECT codigo FROM ordens_corte').all() as Array<{ codigo: string }>).map((row) => row.codigo)).toEqual([
      'OC-01',
    ]);
  });

  it('não entrega o mesmo número a dois usuários da mesma empresa', async () => {
    db = createDatabase(':memory:');
    const app = createApp(db);
    const dono = await autenticar(app);
    const producao = await autenticarPapel(app, dono, 'producao');

    const [a, b] = await Promise.all([
      dono.get('/api/ordens/ordem-corte/rascunho'),
      producao.get('/api/ordens/ordem-corte/rascunho'),
    ]);
    expect(a.status).toBe(200);
    expect(b.status).toBe(200);
    expect(a.body.payload.codigo).not.toBe(b.body.payload.codigo);
    expect([a.body.payload.codigo, b.body.payload.codigo].sort()).toEqual(['OC-01', 'OC-02']);
  });

  it('grava a sequência no SQLite e continua após reiniciar', () => {
    const caminho = join(mkdtempSync(join(tmpdir(), 'gc-oc-seq-')), 'gestao.sqlite');
    const primeiro = createDatabase(caminho);
    expect(reservarProximoCodigoOc(primeiro, 1)).toBe('OC-01');
    expect(reservarProximoCodigoOc(primeiro, 1)).toBe('OC-02');
    primeiro.close();

    const reiniciado = createDatabase(caminho);
    databases.push(reiniciado);
    expect(reservarProximoCodigoOc(reiniciado, 1)).toBe('OC-03');
  });
});
