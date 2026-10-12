import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { OrdensArea } from './OrdensArea';

vi.mock('./OrdensPage', () => ({
  OrdensPage: () => <div>painel-ordens</div>,
}));

vi.mock('./CoresPage', () => ({
  CoresPage: () => <div>painel-cores</div>,
}));

describe('abas de ordens e cores', () => {
  afterEach(() => cleanup());

  it('abre o cadastro de cores e mantém a ordem montada', () => {
    render(<OrdensArea sessao={{ assinatura: {} as never }} />);
    expect(screen.getByRole('tab', { name: 'Ordens', selected: true })).toBeTruthy();
    expect(screen.getByText('painel-ordens')).toBeTruthy();
    fireEvent.click(screen.getByRole('tab', { name: 'Cores' }));
    expect(screen.getByRole('tab', { name: 'Cores', selected: true })).toBeTruthy();
    expect(screen.getByText('painel-cores')).toBeTruthy();
    expect(screen.getByText('painel-ordens')).toBeTruthy();
  });
});
