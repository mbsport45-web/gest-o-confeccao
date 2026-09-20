import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from './app.js';
import { createDatabase, type AppDatabase } from './db.js';
import {
  autenticar,
  autenticarNovaEmpresa,
  autenticarPapel,
  USUARIO_TESTE,
  type TestApi,
} from './httpTest.js';
import {
  CODIGO_HISTORICO_IMUTAVEL,
  CODIGO_HISTORICO_RESTRITO,
  EVENTO_ASSINATURA_LABEL,
  podeVerHistoricoAssinatura,
} from './planos.js';

describe('histórico comercial persistente', () => {
  let db: AppDatabase;
  let api: TestApi;

  beforeEach(async () => {
    db = createDatabase(':memory:');
    api = await autenticar(createApp(db));
  });

  afterEach(() => {
    db.close();
  });

  it('só proprietário e administrador leem o histórico', () => {
    expect(podeVerHistoricoAssinatura('proprietario')).toBe(true);
    expect(podeVerHistoricoAssinatura('administrador')).toBe(true);
    expect(podeVerHistoricoAssinatura('financeiro')).toBe(false);
    expect(podeVerHistoricoAssinatura('vendas')).toBe(false);
    expect(podeVerHistoricoAssinatura('estoque')).toBe(false);
    expect(podeVerHistoricoAssinatura('producao')).toBe(false);
  });

  it('registra criação, início de trial e o usuário responsável', async () => {
    const res = await api.get('/api/assinatura/eventos');
    expect(res.status).toBe(200);
    expect(res.body.imutavel).toBe(true);
    const tipos = res.body.data.map((e: { tipo: string }) => e.tipo);
    expect(tipos).toEqual(['trial_inicio', 'criacao']);
    expect(res.body.data[1]).toMatchObject({
      tipo: 'criacao',
      tipo_label: EVENTO_ASSINATURA_LABEL.criacao,
      empresa_id: 1,
      de_plano: null,
      para_plano: 'basico',
      de_status: null,
      para_status: 'trial',
      usuario: { nome: USUARIO_TESTE.nome },
      criado_em: expect.any(String),
      imutavel: true,
    });
    expect(res.body.data[0]).toMatchObject({
      tipo: 'trial_inicio',
      para_status: 'trial',
      para_plano: 'basico',
      usuario: { nome: USUARIO_TESTE.nome },
    });
    expect(res.body.data[0].usuario.id).toBeGreaterThan(0);
  });

  it('registra fim de trial, upgrade, downgrade, cancelamento, reativação e status', async () => {
    const me = await api.get('/api/me');
    const usuarioId = me.body.usuario.id as number;

    const upgrade = await api.patch('/api/assinatura').send({ plano: 'profissional' });
    expect(upgrade.status).toBe(200);
    const ativar = await api.patch('/api/assinatura').send({ acao: 'ativar' });
    expect(ativar.status).toBe(200);
    const atraso = await api.patch('/api/assinatura').send({ acao: 'marcar_atraso' });
    expect(atraso.status).toBe(200);
    const regularizar = await api.patch('/api/assinatura').send({ acao: 'regularizar' });
    expect(regularizar.status).toBe(200);
    const cancelar = await api.patch('/api/assinatura').send({ acao: 'cancelar' });
    expect(cancelar.status).toBe(200);
    const reativar = await api.patch('/api/assinatura').send({ acao: 'reativar' });
    expect(reativar.status).toBe(200);
    const downgrade = await api.patch('/api/assinatura').send({ plano: 'basico' });
    expect(downgrade.status).toBe(200);

    const eventos = (await api.get('/api/assinatura/eventos')).body.data as Array<{
      tipo: string;
      usuario: { id: number; nome: string } | null;
      de_plano: string | null;
      para_plano: string | null;
      de_status: string | null;
      para_status: string | null;
      criado_em: string;
      empresa_id: number;
    }>;

    const porTipo = (tipo: string) => eventos.filter((e) => e.tipo === tipo);
    expect(porTipo('criacao')).toHaveLength(1);
    expect(porTipo('trial_inicio')).toHaveLength(1);
    expect(porTipo('trial_fim')).toHaveLength(1);
    expect(porTipo('assinar')).toHaveLength(1);
    expect(porTipo('upgrade')).toHaveLength(1);
    expect(porTipo('downgrade')).toHaveLength(1);
    expect(porTipo('cancelar')).toHaveLength(1);
    expect(porTipo('reativar')).toHaveLength(1);
    expect(porTipo('marcar_atraso')).toHaveLength(1);
    expect(porTipo('regularizar')).toHaveLength(1);

    expect(porTipo('trial_fim')[0]).toMatchObject({
      de_status: 'trial',
      para_status: 'ativa',
    });
    expect(porTipo('assinar')[0]).toMatchObject({
      de_status: 'trial',
      para_status: 'ativa',
      de_plano: 'profissional',
      para_plano: 'profissional',
    });
    expect(porTipo('upgrade')[0]).toMatchObject({
      de_plano: 'basico',
      para_plano: 'profissional',
      de_status: 'trial',
      para_status: 'trial',
    });
    expect(porTipo('downgrade')[0]).toMatchObject({
      de_plano: 'profissional',
      para_plano: 'basico',
      de_status: 'ativa',
      para_status: 'ativa',
    });
    expect(porTipo('cancelar')[0]).toMatchObject({ de_status: 'ativa', para_status: 'cancelada' });
    expect(porTipo('reativar')[0]).toMatchObject({ de_status: 'cancelada', para_status: 'ativa' });
    expect(porTipo('marcar_atraso')[0]).toMatchObject({
      de_status: 'ativa',
      para_status: 'past_due',
    });
    expect(porTipo('regularizar')[0]).toMatchObject({ de_status: 'past_due', para_status: 'ativa' });

    for (const evento of eventos) {
      expect(evento.empresa_id).toBe(1);
      expect(evento.criado_em).toMatch(/^\d{4}-\d{2}-\d{2}/);
      expect(evento.usuario).toMatchObject({ id: usuarioId, nome: USUARIO_TESTE.nome });
    }
  });

  it('não deixa usuários comuns ler nem alterar o histórico; isola empresas', async () => {
    const app = createApp(db);
    const admin = await autenticarPapel(app, api, 'administrador');
    const financeiro = await autenticarPapel(app, api, 'financeiro');
    const { api: empresa2 } = await autenticarNovaEmpresa(app);

    await api.patch('/api/assinatura').send({ plano: 'profissional' });

    expect((await admin.get('/api/assinatura/eventos')).status).toBe(200);
    const recusar = await financeiro.get('/api/assinatura/eventos');
    expect(recusar.status).toBe(403);
    expect(recusar.body.codigo).toBe(CODIGO_HISTORICO_RESTRITO);

    for (const metodo of ['post', 'patch', 'put', 'delete'] as const) {
      const res = await api[metodo]('/api/assinatura/eventos').send({ tipo: 'upgrade' });
      expect(res.status).toBe(403);
      expect(res.body.codigo).toBe(CODIGO_HISTORICO_IMUTAVEL);
    }

    const daEmpresa2 = await empresa2.get('/api/assinatura/eventos');
    expect(daEmpresa2.status).toBe(200);
    expect(daEmpresa2.body.data.every((e: { empresa_id: number }) => e.empresa_id !== 1)).toBe(true);
    expect(daEmpresa2.body.data.some((e: { tipo: string }) => e.tipo === 'upgrade')).toBe(false);
    expect(daEmpresa2.body.data.map((e: { tipo: string }) => e.tipo)).toEqual([
      'trial_inicio',
      'criacao',
    ]);
  });
});
