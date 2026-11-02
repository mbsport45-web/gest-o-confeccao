import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { GradeOrdem } from './GradeOrdem';
import { gradeVazia, type GradeValor } from './regrasGradeOrdem';

function Harness({
  inicial = gradeVazia([]),
  catalogoCores = [{ id: 1, nome: 'Preto' }],
  onCadastrarCor,
}: {
  inicial?: GradeValor;
  catalogoCores?: Array<{ id: number | null; nome: string; codigo?: string | null; hex?: string | null }>;
  onCadastrarCor?: (dados: { nome: string; codigo?: string; hex?: string | null }) => Promise<{ nome: string }>;
}) {
  const [grade, setGrade] = useState(inicial);
  return (
    <GradeOrdem
      grade={grade}
      quantidadeOrdem={3}
      catalogoCores={catalogoCores}
      catalogoTamanhos={[{ id: 1, nome: 'M', ordem: 2 }]}
      onChange={setGrade}
      onCadastrarCor={onCadastrarCor}
    />
  );
}

describe('grade editável da ordem', () => {
  afterEach(() => cleanup());

  it('adiciona cor e tamanho digitados sem cadastro prévio', () => {
    render(<Harness />);
    fireEvent.change(screen.getByLabelText('Pesquisar cor'), { target: { value: 'Verde musgo' } });
    fireEvent.click(screen.getByRole('button', { name: 'Adicionar cor' }));
    fireEvent.change(screen.getByLabelText('Novo tamanho'), { target: { value: '42' } });
    fireEvent.click(screen.getByRole('button', { name: 'Adicionar tamanho' }));
    fireEvent.change(screen.getByLabelText('Quantidade Verde musgo 42'), { target: { value: '3' } });

    expect(screen.getByLabelText('Cor Verde musgo')).toBeTruthy();
    expect(screen.getByLabelText('Tamanho 42')).toBeTruthy();
    expect(screen.getAllByText('3').length).toBeGreaterThan(0);
    expect(screen.queryByText(/difere da quantidade/)).toBeNull();
  });

  it('edita, exclui e reorganiza o tamanho na própria grade', () => {
    render(<Harness inicial={gradeVazia(['P', 'M'])} />);
    fireEvent.change(screen.getByLabelText('Pesquisar cor'), { target: { value: 'Azul' } });
    fireEvent.click(screen.getByRole('button', { name: 'Adicionar cor' }));
    fireEvent.change(screen.getByLabelText('Quantidade Azul M'), { target: { value: '3' } });

    fireEvent.change(screen.getByLabelText('Tamanho M'), { target: { value: '44' } });
    fireEvent.blur(screen.getByLabelText('Tamanho M'));
    expect(screen.getByLabelText('Tamanho 44')).toBeTruthy();
    expect(screen.getByLabelText('Quantidade Azul 44')).toHaveProperty('value', '3');

    fireEvent.click(screen.getByRole('button', { name: 'Mover tamanho 44 para a esquerda' }));
    const cabecalhos = screen.getAllByRole('textbox', { name: /^Tamanho / });
    expect(cabecalhos.map((campo) => (campo as HTMLInputElement).value)).toEqual(['44', 'P']);

    fireEvent.click(screen.getByRole('button', { name: 'Remover cor Azul' }));
    expect(screen.queryByLabelText('Cor Azul')).toBeNull();
  });

  it('seleciona várias cores cadastradas e adiciona cada uma uma vez', () => {
    render(
      <Harness
        catalogoCores={[
          { id: 1, nome: 'Preto', codigo: 'PT' },
          { id: 2, nome: 'Branco', codigo: 'BR' },
          { id: 3, nome: 'Azul' },
        ]}
      />,
    );
    expect(screen.getByRole('checkbox', { name: 'Selecionar Preto' })).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Pesquisar cor'), { target: { value: 'PT' } });
    expect(screen.getByRole('checkbox', { name: 'Selecionar Preto' })).toBeTruthy();
    expect(screen.queryByRole('checkbox', { name: 'Selecionar Branco' })).toBeNull();
    fireEvent.change(screen.getByLabelText('Pesquisar cor'), { target: { value: '' } });

    fireEvent.click(screen.getByRole('checkbox', { name: 'Selecionar Preto' }));
    fireEvent.click(screen.getByRole('checkbox', { name: 'Selecionar Branco' }));
    fireEvent.click(screen.getByRole('button', { name: 'Adicionar selecionadas' }));

    expect(screen.getByLabelText('Cor Preto')).toBeTruthy();
    expect(screen.getByLabelText('Cor Branco')).toBeTruthy();
    expect(screen.queryByRole('checkbox', { name: 'Selecionar Preto' })).toBeNull();
    expect(screen.queryByRole('checkbox', { name: 'Selecionar Branco' })).toBeNull();
    expect(screen.getByRole('checkbox', { name: 'Selecionar Azul' })).toBeTruthy();
  });

  it('cadastra uma cor nova e inclui na grade atual', async () => {
    const salvar = vi.fn().mockResolvedValue({ nome: 'Oliva', codigo: 'OL', hex: '#556B2F' });
    render(<Harness onCadastrarCor={salvar} />);
    fireEvent.click(screen.getByRole('button', { name: 'Cadastrar nova cor' }));
    fireEvent.change(screen.getByLabelText('Nome da nova cor'), { target: { value: 'Oliva' } });
    fireEvent.change(screen.getByLabelText('Código da nova cor'), { target: { value: 'OL' } });
    fireEvent.click(screen.getByRole('checkbox', { name: 'Usar identificação visual' }));
    fireEvent.click(screen.getByRole('button', { name: 'Salvar cor' }));

    expect(await screen.findByLabelText('Cor Oliva')).toBeTruthy();
    expect(salvar).toHaveBeenCalledWith({ nome: 'Oliva', codigo: 'OL', hex: '#6366F1' });
  });
});
