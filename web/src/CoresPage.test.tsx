import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./api', async () => {
  const actual = await vi.importActual<typeof import('./api')>('./api');
  return {
    ...actual,
    listarCores: vi.fn(),
    criarCor: vi.fn(),
    atualizarCor: vi.fn(),
    removerCor: vi.fn(),
  };
});

import { atualizarCor, criarCor, listarCores, removerCor } from './api';
import { CoresPage } from './CoresPage';

const listar = vi.mocked(listarCores);
const criar = vi.mocked(criarCor);
const atualizar = vi.mocked(atualizarCor);
const remover = vi.mocked(removerCor);

describe('cadastro de cores', () => {
  afterEach(() => cleanup());

  beforeEach(() => {
    listar.mockReset();
    criar.mockReset();
    atualizar.mockReset();
    remover.mockReset();
    listar.mockResolvedValue([
      { id: 1, nome: 'Preto', codigo: 'PT', hex: '#111111' },
      { id: 2, nome: 'Branco', codigo: 'BR', hex: null },
    ]);
  });

  it('pesquisa por código, edita e recusa exclusão em uso', async () => {
    render(<CoresPage />);
    expect(await screen.findByText('Preto')).toBeTruthy();
    expect(screen.getByText('Branco')).toBeTruthy();

    fireEvent.change(screen.getByLabelText('Pesquisar cores'), { target: { value: 'br' } });
    expect(screen.queryByText('Preto')).toBeNull();
    expect(screen.getByText('Branco')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Editar' }));
    fireEvent.change(screen.getByLabelText('Nome da cor'), { target: { value: 'Branco óptico' } });
    atualizar.mockResolvedValue({ id: 2, nome: 'Branco óptico', codigo: 'BR', hex: null });
    listar.mockResolvedValue([
      { id: 1, nome: 'Preto', codigo: 'PT', hex: '#111111' },
      { id: 2, nome: 'Branco óptico', codigo: 'BR', hex: null },
    ]);
    fireEvent.click(screen.getByRole('button', { name: 'Salvar cor' }));
    await waitFor(() => expect(atualizar).toHaveBeenCalledWith(2, { nome: 'Branco óptico', codigo: 'BR', hex: null }));
    expect(await screen.findByText('Branco óptico')).toBeTruthy();

    fireEvent.change(screen.getByLabelText('Pesquisar cores'), { target: { value: '' } });
    remover.mockRejectedValue(new Error('Esta cor está em uso e não pode ser excluída'));
    const excluir = screen.getAllByRole('button', { name: 'Excluir' })[0];
    fireEvent.click(excluir);
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar exclusão' }));
    expect(await screen.findByText('Esta cor está em uso e não pode ser excluída')).toBeTruthy();
  });

  it('cadastra uma cor nova com código', async () => {
    render(<CoresPage />);
    await screen.findByText('Preto');
    fireEvent.click(screen.getByRole('button', { name: 'Nova cor' }));
    fireEvent.change(screen.getByLabelText('Nome da cor'), { target: { value: 'Oliva' } });
    fireEvent.change(screen.getByLabelText('Código da cor'), { target: { value: 'OL' } });
    criar.mockResolvedValue({ id: 3, nome: 'Oliva', codigo: 'OL', hex: null });
    listar.mockResolvedValue([
      { id: 3, nome: 'Oliva', codigo: 'OL', hex: null },
      { id: 1, nome: 'Preto', codigo: 'PT', hex: '#111111' },
      { id: 2, nome: 'Branco', codigo: 'BR', hex: null },
    ]);
    fireEvent.click(screen.getByRole('button', { name: 'Salvar cor' }));
    await waitFor(() => expect(criar).toHaveBeenCalledWith({ nome: 'Oliva', codigo: 'OL', hex: null }));
    expect(await screen.findByText('Oliva')).toBeTruthy();
  });
});
