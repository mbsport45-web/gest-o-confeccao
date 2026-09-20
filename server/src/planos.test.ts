import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Database from 'better-sqlite3';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from './app.js';
import { createDatabase, type AppDatabase } from './db.js';
import {
  autenticar,
  autenticarNovaEmpresa,
  autenticarPapel,
  type TestApi,
} from './httpTest.js';
import { PLANOS_CATALOGO, PLANO_PADRAO } from './planos.js';

describe('planos e assinatura por empresa', () => {
  let db: AppDatabase;
  let api: TestApi;

  beforeEach(async () => {
    db = createDatabase(':memory:');
    api = await autenticar(createApp(db));
  });

  afterEach(() => {
    db.close();
  });

  it('publica Básico, Profissional e Enterprise com limites e recursos', async () => {
    const res = await api.get('/api/planos');
    expect(res.status).toBe(200);
    expect(res.body.cobranca).toBe('desativada');
    expect(res.body.data.map((p: { codigo: string }) => p.codigo)).toEqual([
      'basico',
      'profissional',
      'enterprise',
    ]);
    const basico = res.body.data[0];
    expect(basico.limites.usuarios).toBe(3);
    expect(basico.recursos.relatorios_avancados).toBe(false);
    expect(basico.preco_mensal).toBeNull();
    const enterprise = res.body.data[2];
    expect(enterprise.limites.usuarios).toBeNull();
    expect(enterprise.recursos.api_externa).toBe(true);
    expect(PLANOS_CATALOGO).toHaveLength(3);
  });

  it('associa o plano padrão à empresa sem ativar cobrança', async () => {
    const me = await api.get('/api/me');
    expect(me.status).toBe(200);
    expect(me.body.assinatura).toMatchObject({
      status: 'ativa',
      cobranca: 'desativada',
      ciclo: 'mensal',
      gateway: null,
      plano: { codigo: PLANO_PADRAO, nome: 'Básico' },
    });
    expect(me.body.assinatura.plano.limites.clientes).toBe(50);

    const assinatura = await api.get('/api/assinatura');
    expect(assinatura.status).toBe(200);
    expect(assinatura.body.cobranca).toBe('desativada');
    expect(assinatura.body.plano.codigo).toBe('basico');
    expect(assinatura.body.gateway).toBeNull();
    expect(assinatura.body.uso.usuarios).toEqual({ atual: 1, maximo: 3, atingido: false });
    expect(assinatura.body.uso.clientes.maximo).toBe(50);
  });

  it('o proprietário troca o plano sem gateway e a cobrança permanece desativada', async () => {
    const trocar = await api.patch('/api/assinatura').send({ plano: 'profissional' });
    expect(trocar.status).toBe(200);
    expect(trocar.body.plano.codigo).toBe('profissional');
    expect(trocar.body.cobranca).toBe('desativada');
    expect(trocar.body.gateway).toBeNull();
    expect(trocar.body.plano.recursos.relatorios_avancados).toBe(true);

    const recusarGateway = await api.patch('/api/assinatura').send({
      plano: 'enterprise',
      gateway: 'stripe',
      cobranca: 'ativa',
    });
    expect(recusarGateway.status).toBe(400);

    const empresa = await api.patch('/api/assinatura').send({ plano: 'enterprise' });
    expect(empresa.status).toBe(200);
    expect(empresa.body.plano.codigo).toBe('enterprise');
    expect(empresa.body.cobranca).toBe('desativada');
  });

  it('vendas vê o plano e não altera; isolamento entre empresas', async () => {
    const app = createApp(db);
    const vendas = await autenticarPapel(app, api, 'vendas');
    const { api: empresa2 } = await autenticarNovaEmpresa(app);

    expect((await vendas.get('/api/planos')).status).toBe(200);
    expect((await vendas.get('/api/assinatura')).status).toBe(200);
    const negar = await vendas.patch('/api/assinatura').send({ plano: 'enterprise' });
    expect(negar.status).toBe(403);
    expect(negar.body.modulo).toBe('assinatura');
    expect(negar.body.acao).toBe('editar');

    await api.patch('/api/assinatura').send({ plano: 'enterprise' });
    const daEmpresa2 = await empresa2.get('/api/assinatura');
    expect(daEmpresa2.status).toBe(200);
    expect(daEmpresa2.body.plano.codigo).toBe('basico');
    expect(daEmpresa2.body.cobranca).toBe('desativada');

    const hijack = await empresa2.patch('/api/assinatura').send({
      plano: 'profissional',
      empresa_id: 1,
    });
    expect(hijack.status).toBe(400);

    const ok = await empresa2.patch('/api/assinatura').send({ plano: 'profissional' });
    expect(ok.status).toBe(200);
    expect(ok.body.plano.codigo).toBe('profissional');

    const empresa1 = await api.get('/api/assinatura');
    expect(empresa1.body.plano.codigo).toBe('enterprise');
  });

  it('convite entra na assinatura da empresa convidada, sem criar plano novo', async () => {
    const app = createApp(db);
    await api.patch('/api/assinatura').send({ plano: 'profissional' });
    const membro = await autenticarPapel(app, api, 'producao');
    const me = await membro.get('/api/me');
    expect(me.body.empresa.id).toBe(1);
    expect(me.body.assinatura.plano.codigo).toBe('profissional');
    expect(me.body.assinatura.cobranca).toBe('desativada');
  });
});

describe('migração de assinatura em empresas já existentes', () => {
  let db: AppDatabase | undefined;

  afterEach(() => {
    db?.close();
  });

  it('cria catálogo e assinatura básica para empresas antigas', () => {
    const path = join(mkdtempSync(join(tmpdir(), 'gc-plano-')), 'gestao.sqlite');
    const antigo = new Database(path);
    antigo.exec(`
      CREATE TABLE empresas (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        nome TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'ativa',
        criado_em TEXT NOT NULL DEFAULT (datetime('now'))
      );
      INSERT INTO empresas (id, nome, status) VALUES (1, 'Empresa 1', 'ativa');
      INSERT INTO empresas (nome, status) VALUES ('Confecção Sul', 'ativa');
    `);
    antigo.close();

    db = createDatabase(path);
    const planos = db.prepare('SELECT codigo FROM planos ORDER BY ordem').all() as Array<{
      codigo: string;
    }>;
    expect(planos.map((p) => p.codigo)).toEqual(['basico', 'profissional', 'enterprise']);
    const assinaturas = db
      .prepare(
        `SELECT a.empresa_id, p.codigo, a.cobranca
           FROM assinaturas a JOIN planos p ON p.id = a.plano_id
          ORDER BY a.empresa_id`,
      )
      .all() as Array<{ empresa_id: number; codigo: string; cobranca: string }>;
    expect(assinaturas).toEqual([
      { empresa_id: 1, codigo: 'basico', cobranca: 'desativada' },
      { empresa_id: 2, codigo: 'basico', cobranca: 'desativada' },
    ]);
  });
});
