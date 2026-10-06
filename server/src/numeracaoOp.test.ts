import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { formatarCodigoOp, numeroDoCodigoOp, proximoCodigoOp } from './codigoOp.js';
import { createApp } from './app.js';
import { createDatabase, type AppDatabase } from './db.js';
import { autenticar, autenticarNovaEmpresa, type TestApi } from './httpTest.js';
import type { Express } from 'express';

describe('numeração da ordem de produção', () => {
  it('formata a sequência com pelo menos dois dígitos', () => {
    expect(formatarCodigoOp(1)).toBe('OP-01');
    expect(formatarCodigoOp(4)).toBe('OP-04');
    expect(formatarCodigoOp(12)).toBe('OP-12');
    expect(formatarCodigoOp(100)).toBe('OP-100');
    expect(numeroDoCodigoOp('OP-0002')).toBe(2);
    expect(numeroDoCodigoOp('op-07')).toBe(7);
    expect(numeroDoCodigoOp('PV-0001')).toBeNull();
  });

  let db: AppDatabase;
  let app: Express;
  let api: TestApi;

  beforeEach(async () => {
    db = createDatabase(':memory:');
    app = createApp(db);
    api = await autenticar(app);
  });

  afterEach(() => {
    db.close();
  });

  const pedido = {
    cliente: 'Loja Central',
    produto: 'Bermuda',
    tamanho: 'M',
    quantidade: 10,
  };

  it('gera OP-01 e OP-02 no backend e ignora número enviado pelo cliente', async () => {
    const primeira = await api.post('/api/ordens').send({ ...pedido, codigo: 'OP-99' });
    const segunda = await api.post('/api/ordens').send(pedido);
    expect(primeira.status).toBe(201);
    expect(segunda.status).toBe(201);
    expect(primeira.body.codigo).toBe('OP-01');
    expect(segunda.body.codigo).toBe('OP-02');

    const editada = await api.patch(`/api/ordens/${primeira.body.id}`).send({ codigo: 'OP-50' });
    expect(editada.status).toBe(200);
    expect(editada.body.codigo).toBe('OP-01');
    expect(proximoCodigoOp(db, 1)).toBe('OP-03');
  });

  it('preserva códigos antigos e continua a partir do maior número da empresa', async () => {
    const inserir = db.prepare(
      `INSERT INTO ordens_producao (empresa_id, cliente, produto, tamanho, quantidade, codigo)
       VALUES (1, 'Loja', 'Bermuda', 'M', 1, ?)`,
    );
    inserir.run('OP-0001');
    inserir.run('OP-0002');

    const criada = await api.post('/api/ordens').send(pedido);
    expect(criada.status).toBe(201);
    expect(criada.body.codigo).toBe('OP-03');

    const codigos = db
      .prepare(`SELECT codigo FROM ordens_producao WHERE empresa_id = 1 ORDER BY id`)
      .all() as Array<{ codigo: string }>;
    expect(codigos.map((linha) => linha.codigo)).toEqual(['OP-0001', 'OP-0002', 'OP-03']);
  });

  it('mantém uma sequência independente por empresa e a restrição única', async () => {
    const outra = await autenticarNovaEmpresa(app, { email: 'op-seq@gestao.local' });
    const empresa1 = await api.post('/api/ordens').send(pedido);
    const empresa2 = await outra.api.post('/api/ordens').send(pedido);
    const empresa1b = await api.post('/api/ordens').send(pedido);
    expect(empresa1.body.codigo).toBe('OP-01');
    expect(empresa2.body.codigo).toBe('OP-01');
    expect(empresa1b.body.codigo).toBe('OP-02');

    expect(() => {
      db.prepare(
        `INSERT INTO ordens_producao (empresa_id, cliente, produto, tamanho, quantidade, codigo)
         VALUES (1, 'Loja', 'Bermuda', 'M', 1, 'OP-01')`,
      ).run();
    }).toThrow(/UNIQUE/);
  });
});
