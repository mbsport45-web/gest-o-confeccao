import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { OrdensArea } from './OrdensArea';

vi.mock('./OrdensPage', () => ({
  OrdensPage: ({ visao }: { visao?: string }) => (
    <div>{visao === 'criar-oc' ? 'ficha-criar-oc' : 'painel-ordens'}</div>
  ),
}));

describe('abas de produção e criar OC', () => {
  afterEach(() => cleanup());

  it('abre a ficha em Criar OC e não mostra Cadastro nem Cores', () => {
    render(<OrdensArea sessao={{ assinatura: {} as never }} />);
    expect(screen.getByRole('tab', { name: 'Ordens', selected: true })).toBeTruthy();
    expect(screen.getByText('painel-ordens')).toBeTruthy();
    expect(screen.queryByRole('tab', { name: 'Cadastro' })).toBeNull();
    expect(screen.queryByRole('tab', { name: 'Cores' })).toBeNull();
    expect(screen.queryByText('ficha-criar-oc')).toBeNull();

    fireEvent.click(screen.getByRole('tab', { name: 'Criar OC' }));
    expect(screen.getByRole('tab', { name: 'Criar OC', selected: true })).toBeTruthy();
    expect(screen.getByText('ficha-criar-oc')).toBeTruthy();
    expect(screen.queryByText('painel-ordens')).toBeNull();
    expect(screen.queryByRole('heading', { name: 'Cadastro de ordens' })).toBeNull();
    expect(screen.queryByRole('heading', { name: 'Ordens planejadas' })).toBeNull();
  });
});
