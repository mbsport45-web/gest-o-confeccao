import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { formatarDataHora } from './api';
import { HistoricoComercial } from './HistoricoComercial';
import type { EventoAssinatura } from './api';

const evento = (parcial: Partial<EventoAssinatura> & Pick<EventoAssinatura, 'id' | 'tipo'>): EventoAssinatura => ({
  criado_em: '2026-09-20 20:18:10',
  empresa_id: 1,
  usuario: { id: 7, nome: 'Marcos Comercial' },
  de_plano: 'basico',
  para_plano: 'profissional',
  de_plano_nome: 'Básico',
  para_plano_nome: 'Profissional',
  de_status: 'trial',
  para_status: 'trial',
  de_status_label: 'Período de avaliação',
  para_status_label: 'Período de avaliação',
  ciclo: 'mensal',
  moeda: 'BRL',
  valor_mensal: 149.9,
  cobranca: 'desativada',
  gateway: null,
  imutavel: true,
  ...parcial,
});

describe('formatarDataHora', () => {
  it('formata data e hora do histórico em pt-BR', () => {
    expect(formatarDataHora('2026-09-20 20:18:10')).toBe('20/09/2026 20:18:10');
    expect(formatarDataHora('2026-09-20T08:01:02.000Z')).toBe('20/09/2026 08:01:02');
  });
});

describe('HistoricoComercial', () => {
  afterEach(() => cleanup());

  it('mostra data, responsável, plano anterior/novo e mudança de status', () => {
    render(
      <HistoricoComercial
        eventos={[
          evento({
            id: 2,
            tipo: 'upgrade',
            tipo_label: 'Upgrade',
          }),
          evento({
            id: 1,
            tipo: 'criacao',
            tipo_label: 'Criação da assinatura',
            de_plano: null,
            de_plano_nome: null,
            para_plano: 'basico',
            para_plano_nome: 'Básico',
            de_status: null,
            de_status_label: null,
            para_status: 'trial',
            para_status_label: 'Período de avaliação',
            criado_em: '2026-09-20 20:10:00',
          }),
        ]}
      />,
    );

    expect(screen.getByRole('heading', { name: 'Histórico comercial' })).toBeTruthy();
    expect(screen.getByText('20/09/2026 20:18:10')).toBeTruthy();
    expect(screen.getByText('Upgrade')).toBeTruthy();
    expect(screen.getAllByText('Marcos Comercial').length).toBeGreaterThan(0);
    expect(screen.getByText('Básico → Profissional')).toBeTruthy();
    expect(screen.getByText('Criação da assinatura')).toBeTruthy();
    expect(screen.getByText('não pode ser editado', { exact: false })).toBeTruthy();
  });

  it('mostra Sistema quando o evento não tem usuário responsável', () => {
    render(
      <HistoricoComercial
        eventos={[
          evento({
            id: 9,
            tipo: 'expirar',
            tipo_label: 'Expiração',
            usuario: null,
            de_status: 'trial',
            para_status: 'expirada',
            de_status_label: 'Período de avaliação',
            para_status_label: 'Expirada',
            de_plano: 'basico',
            para_plano: 'basico',
            de_plano_nome: 'Básico',
            para_plano_nome: 'Básico',
          }),
        ]}
      />,
    );
    expect(screen.getByText('Sistema')).toBeTruthy();
    expect(screen.getByText('Período de avaliação → Expirada')).toBeTruthy();
  });
});
