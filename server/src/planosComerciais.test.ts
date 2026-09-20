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
import {
  classificarMudancaPlano,
  formatarPrecoMensal,
  PLANOS_CATALOGO,
  tipoEventoDaAcao,
} from './planos.js';

const RECURSOS_ESPERADOS = {
  basico: {
    expedicao: true,
    financeiro: true,
    relatorios_avancados: false,
    api_externa: false,
    suporte_prioritario: false,
  },
  profissional: {
    expedicao: true,
    financeiro: true,
    relatorios_avancados: true,
    api_externa: false,
    suporte_prioritario: false,
  },
  enterprise: {
    expedicao: true,
    financeiro: true,
    relatorios_avancados: true,
    api_externa: true,
    suporte_prioritario: true,
  },
} as const;

const PRECOS = { basico: 99.9, profissional: 149.9, enterprise: 199.9 } as const;

describe('classificação comercial dos planos', () => {
  it('formata os três preços mensais em reais', () => {
    expect(formatarPrecoMensal(99.9)).toBe('R$ 99,90/mês');
    expect(formatarPrecoMensal(149.9)).toBe('R$ 149,90/mês');
    expect(formatarPrecoMensal(199.9)).toBe('R$ 199,90/mês');
    expect(formatarPrecoMensal(null)).toBe('Preço sob consulta');
  });

  it('classifica upgrade, downgrade e manter pela ordem do catálogo', () => {
    expect(classificarMudancaPlano('basico', 'profissional')).toBe('upgrade');
    expect(classificarMudancaPlano('basico', 'enterprise')).toBe('upgrade');
    expect(classificarMudancaPlano('profissional', 'enterprise')).toBe('upgrade');
    expect(classificarMudancaPlano('enterprise', 'profissional')).toBe('downgrade');
    expect(classificarMudancaPlano('profissional', 'basico')).toBe('downgrade');
    expect(classificarMudancaPlano('enterprise', 'basico')).toBe('downgrade');
    expect(classificarMudancaPlano('basico', 'basico')).toBe('manter');
  });

  it('mapeia ações de status para a operação comercial futura', () => {
    expect(tipoEventoDaAcao('ativar')).toBe('assinar');
    expect(tipoEventoDaAcao('reativar')).toBe('assinar');
    expect(tipoEventoDaAcao('renovar')).toBe('assinar');
    expect(tipoEventoDaAcao('cancelar')).toBe('cancelar');
    expect(tipoEventoDaAcao('regularizar')).toBe('regularizar');
    expect(tipoEventoDaAcao('marcar_atraso')).toBe('marcar_atraso');
    expect(tipoEventoDaAcao('expirar')).toBe('expirar');
  });
});

describe('catálogo comercial Básico, Profissional e Enterprise', () => {
  let db: AppDatabase;
  let api: TestApi;

  beforeEach(async () => {
    db = createDatabase(':memory:');
    api = await autenticar(createApp(db));
  });

  afterEach(() => {
    db.close();
  });

  it('associa preço mensal, limites e recursos a cada plano, sem gateway', async () => {
    const res = await api.get('/api/planos');
    expect(res.status).toBe(200);
    expect(res.body.cobranca).toBe('desativada');
    expect(res.body.ciclo).toBe('mensal');
    expect(res.body.moeda).toBe('BRL');
    expect(res.body.gateway).toBeNull();
    expect(PLANOS_CATALOGO.map((p) => p.codigo)).toEqual(['basico', 'profissional', 'enterprise']);

    for (const plano of res.body.data as Array<{
      codigo: keyof typeof PRECOS;
      preco_mensal: number;
      preco_anual: number | null;
      moeda: string;
      ciclo: string;
      recursos: Record<string, boolean>;
      limites: Record<string, number | null>;
    }>) {
      expect(plano.preco_mensal).toBe(PRECOS[plano.codigo]);
      expect(plano.preco_anual).toBeNull();
      expect(plano.moeda).toBe('BRL');
      expect(plano.ciclo).toBe('mensal');
      expect(plano.recursos).toEqual(RECURSOS_ESPERADOS[plano.codigo]);
      expect(plano.limites).toEqual(
        PLANOS_CATALOGO.find((item) => item.codigo === plano.codigo)?.limites,
      );
    }
  });

  it('registra upgrade, downgrade e cancelamento sem ativar cobrança', async () => {
    const upgrade = await api.patch('/api/assinatura').send({ plano: 'profissional' });
    expect(upgrade.status).toBe(200);
    expect(upgrade.body.plano.codigo).toBe('profissional');
    expect(upgrade.body.plano.preco_mensal).toBe(149.9);
    expect(upgrade.body.plano.recursos).toEqual(RECURSOS_ESPERADOS.profissional);
    expect(upgrade.body.cobranca).toBe('desativada');
    expect(upgrade.body.gateway).toBeNull();
    expect(upgrade.body.comercial.pronta).toBe(false);
    expect(upgrade.body.comercial.operacoes).toEqual(['assinar', 'upgrade', 'downgrade', 'cancelar']);

    const enterprise = await api.patch('/api/assinatura').send({ plano: 'enterprise' });
    expect(enterprise.status).toBe(200);
    expect(enterprise.body.plano.preco_mensal).toBe(199.9);
    expect(enterprise.body.plano.recursos.api_externa).toBe(true);
    expect(enterprise.body.plano.recursos.suporte_prioritario).toBe(true);

    const downgrade = await api.patch('/api/assinatura').send({ plano: 'basico' });
    expect(downgrade.status).toBe(200);
    expect(downgrade.body.plano.codigo).toBe('basico');
    expect(downgrade.body.plano.preco_mensal).toBe(99.9);
    expect(downgrade.body.cobranca).toBe('desativada');

    const mesmo = await api.patch('/api/assinatura').send({ plano: 'basico' });
    expect(mesmo.status).toBe(200);

    const cancelar = await api.patch('/api/assinatura').send({ acao: 'cancelar' });
    expect(cancelar.status).toBe(200);
    expect(cancelar.body.status).toBe('cancelada');
    expect(cancelar.body.cobranca).toBe('desativada');
    expect(cancelar.body.gateway).toBeNull();

    const eventos = await api.get('/api/assinatura/eventos');
    expect(eventos.status).toBe(200);
    expect(eventos.body.cobranca).toBe('desativada');
    expect(eventos.body.gateway).toBeNull();
    const tipos = eventos.body.data.map((e: { tipo: string }) => e.tipo);
    expect(tipos).toEqual(['cancelar', 'downgrade', 'upgrade', 'upgrade']);

    const [cancelado, descida, subidaEnterprise, subidaProf] = eventos.body.data;
    expect(cancelado).toMatchObject({
      tipo: 'cancelar',
      de_plano: 'basico',
      para_plano: 'basico',
      ciclo: 'mensal',
      moeda: 'BRL',
      valor_mensal: 99.9,
      cobranca: 'desativada',
      gateway: null,
    });
    expect(descida).toMatchObject({
      tipo: 'downgrade',
      de_plano: 'enterprise',
      para_plano: 'basico',
      valor_mensal: 99.9,
      cobranca: 'desativada',
      gateway: null,
    });
    expect(subidaEnterprise).toMatchObject({
      tipo: 'upgrade',
      de_plano: 'profissional',
      para_plano: 'enterprise',
      valor_mensal: 199.9,
    });
    expect(subidaProf).toMatchObject({
      tipo: 'upgrade',
      de_plano: 'basico',
      para_plano: 'profissional',
      valor_mensal: 149.9,
    });
  });

  it('ativar, reativar e renovar preparam assinatura mensal (assinar) sem gateway', async () => {
    const ativar = await api.patch('/api/assinatura').send({ acao: 'ativar' });
    expect(ativar.status).toBe(200);
    expect(ativar.body.status).toBe('ativa');
    expect(ativar.body.ciclo).toBe('mensal');
    expect(ativar.body.comercial.valor_mensal).toBe(99.9);
    expect(ativar.body.cobranca).toBe('desativada');
    expect(ativar.body.gateway).toBeNull();

    await api.patch('/api/assinatura').send({ acao: 'cancelar' });
    const reativar = await api.patch('/api/assinatura').send({ acao: 'reativar' });
    expect(reativar.status).toBe(200);
    expect(reativar.body.status).toBe('ativa');

    await api.patch('/api/assinatura').send({ acao: 'cancelar' });
    await api.patch('/api/assinatura').send({ acao: 'expirar' });
    const renovar = await api.patch('/api/assinatura').send({ acao: 'renovar' });
    expect(renovar.status).toBe(200);
    expect(renovar.body.status).toBe('ativa');
    expect(renovar.body.cobranca).toBe('desativada');

    const recusarGateway = await api.patch('/api/assinatura').send({
      plano: 'profissional',
      gateway: 'stripe',
      cobranca: 'ativa',
    });
    expect(recusarGateway.status).toBe(400);

    const tipos = (await api.get('/api/assinatura/eventos')).body.data.map(
      (e: { tipo: string }) => e.tipo,
    );
    expect(tipos.filter((tipo: string) => tipo === 'assinar')).toHaveLength(3);
    expect(tipos).toContain('cancelar');
    expect(tipos).toContain('expirar');
  });

  it('eventos ficam isolados por empresa e vendas só lê', async () => {
    const app = createApp(db);
    const vendas = await autenticarPapel(app, api, 'vendas');
    const { api: empresa2 } = await autenticarNovaEmpresa(app);

    await api.patch('/api/assinatura').send({ plano: 'profissional' });
    await empresa2.patch('/api/assinatura').send({ plano: 'enterprise' });

    const daEmpresa1 = await api.get('/api/assinatura/eventos');
    const daEmpresa2 = await empresa2.get('/api/assinatura/eventos');
    expect(daEmpresa1.body.data).toHaveLength(1);
    expect(daEmpresa1.body.data[0]).toMatchObject({
      tipo: 'upgrade',
      de_plano: 'basico',
      para_plano: 'profissional',
      valor_mensal: 149.9,
    });
    expect(daEmpresa2.body.data).toHaveLength(1);
    expect(daEmpresa2.body.data[0]).toMatchObject({
      tipo: 'upgrade',
      para_plano: 'enterprise',
      valor_mensal: 199.9,
    });

    const vista = await vendas.get('/api/assinatura/eventos');
    expect(vista.status).toBe(200);
    expect(vista.body.data[0].para_plano).toBe('profissional');

    const negar = await vendas.patch('/api/assinatura').send({ plano: 'enterprise' });
    expect(negar.status).toBe(403);
    expect(negar.body.modulo).toBe('assinatura');
  });
});

describe('migração do catálogo comercial', () => {
  let db: AppDatabase | undefined;

  afterEach(() => {
    db?.close();
  });

  it('preenche preços e recursos em tabela de planos antiga sem coluna de preço', () => {
    const path = join(mkdtempSync(join(tmpdir(), 'gc-preco-')), 'gestao.sqlite');
    const antigo = new Database(path);
    antigo.exec(`
      CREATE TABLE empresas (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        nome TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'ativa',
        criado_em TEXT NOT NULL DEFAULT (datetime('now'))
      );
      INSERT INTO empresas (id, nome, status) VALUES (1, 'Empresa 1', 'ativa');
      CREATE TABLE planos (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        codigo TEXT NOT NULL UNIQUE,
        nome TEXT NOT NULL,
        descricao TEXT NOT NULL,
        ativo INTEGER NOT NULL DEFAULT 1,
        ordem INTEGER NOT NULL DEFAULT 0,
        limites_json TEXT NOT NULL,
        recursos_json TEXT NOT NULL,
        criado_em TEXT NOT NULL DEFAULT (datetime('now'))
      );
      INSERT INTO planos (codigo, nome, descricao, ordem, limites_json, recursos_json)
      VALUES (
        'basico',
        'Velho',
        'Sem preço',
        1,
        '{"usuarios":1,"clientes":1,"produtos":1,"materiais":1,"pedidos_mes":1,"ordens_mes":1}',
        '{"expedicao":false,"financeiro":false,"relatorios_avancados":false,"api_externa":false,"suporte_prioritario":false}'
      );
    `);
    antigo.close();

    db = createDatabase(path);
    const planos = db
      .prepare('SELECT codigo, preco_mensal, moeda, recursos_json FROM planos ORDER BY ordem')
      .all() as Array<{ codigo: string; preco_mensal: number; moeda: string; recursos_json: string }>;
    expect(planos.map((p) => p.codigo)).toEqual(['basico', 'profissional', 'enterprise']);
    expect(planos[0].preco_mensal).toBe(99.9);
    expect(planos[1].preco_mensal).toBe(149.9);
    expect(planos[2].preco_mensal).toBe(199.9);
    expect(planos.every((p) => p.moeda === 'BRL')).toBe(true);
    expect(JSON.parse(planos[0].recursos_json)).toEqual(RECURSOS_ESPERADOS.basico);
    expect(JSON.parse(planos[1].recursos_json)).toEqual(RECURSOS_ESPERADOS.profissional);
    expect(JSON.parse(planos[2].recursos_json)).toEqual(RECURSOS_ESPERADOS.enterprise);
  });
});
