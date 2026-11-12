import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MateriasPage } from './MateriasPage';

vi.mock('./MateriasPrimasPage', () => ({
  MateriasPrimasPage: () => <div>painel-materias-primas</div>,
}));

vi.mock('./AviamentosPage', () => ({
  AviamentosPage: () => <div>painel-aviamentos</div>,
}));

describe('abas de Matérias', () => {
  afterEach(() => cleanup());

  it('mantém as matérias-primas e abre o cadastro de aviamentos', () => {
    render(<MateriasPage sessao={{ assinatura: {} as never }} />);
    expect(screen.getByRole('tab', { name: 'Matérias-primas', selected: true })).toBeTruthy();
    expect(screen.getByText('painel-materias-primas')).toBeTruthy();
    fireEvent.click(screen.getByRole('tab', { name: 'Aviamentos' }));
    expect(screen.getByText('painel-aviamentos')).toBeTruthy();
    expect(screen.queryByText('painel-materias-primas')).toBeNull();
  });
});
