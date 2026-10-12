import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { GradeOrdem } from './GradeOrdem';
import { gradeVazia, type GradeValor } from './gradeOrdem';

function Harness({ inicial = gradeVazia([]) }: { inicial?: GradeValor }) {
  const [grade, setGrade] = useState(inicial);
  return (
    <GradeOrdem
      grade={grade}
      quantidadeOrdem={3}
      catalogoCores={[{ id: 1, nome: 'Preto' }]}
      catalogoTamanhos={[{ id: 1, nome: 'M', ordem: 2 }]}
      onChange={setGrade}
      onBuscarCores={() => undefined}
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
});
