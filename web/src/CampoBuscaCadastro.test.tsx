import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { CampoBuscaCadastro } from './CampoBuscaCadastro';

function Harness() {
  const [texto, setTexto] = useState('');
  const [id, setId] = useState('');
  const [rotulo, setRotulo] = useState('');
  return (
    <>
      <p>selecionado:{id || 'nenhum'}</p>
      <CampoBuscaCadastro
        rotulo="Cliente"
        placeholder="Pesquisar por nome, CPF/CNPJ ou telefone"
        texto={texto}
        selecionadoId={id}
        selecionadoRotulo={rotulo}
        opcoes={[
          { id: 7, rotulo: 'Loja Livre · 52998224725' },
          { id: 8, rotulo: 'Atelier Norte' },
        ]}
        onTexto={setTexto}
        onSelecionar={(valor) => {
          setId(valor);
          const opcao = [
            { id: 7, rotulo: 'Loja Livre · 52998224725' },
            { id: 8, rotulo: 'Atelier Norte' },
          ].find((item) => String(item.id) === valor);
          setRotulo(opcao?.rotulo ?? '');
        }}
        textoNovo="Cadastrar novo cliente"
        onAbrirCadastro={() => setId('novo')}
      />
    </>
  );
}

describe('busca de cadastro na ordem', () => {
  afterEach(() => cleanup());

  it('pesquisa por nome ou código e vincula o registro escolhido', () => {
    render(<Harness />);
    const campo = screen.getByRole('combobox', { name: 'Cliente' });
    fireEvent.focus(campo);
    fireEvent.change(campo, { target: { value: 'livre' } });
    fireEvent.click(screen.getByRole('option', { name: 'Loja Livre · 52998224725' }));
    expect(screen.getByText('selecionado:7')).toBeTruthy();
    expect((screen.getByRole('combobox', { name: 'Cliente' }) as HTMLInputElement).value).toBe(
      'Loja Livre · 52998224725',
    );
  });

  it('oferece cadastro oficial quando o registro não existe na pesquisa', () => {
    render(<Harness />);
    fireEvent.focus(screen.getByRole('combobox', { name: 'Cliente' }));
    fireEvent.change(screen.getByRole('combobox', { name: 'Cliente' }), { target: { value: 'novo' } });
    fireEvent.click(screen.getByRole('button', { name: 'Cadastrar novo cliente' }));
    expect(screen.getByText('selecionado:novo')).toBeTruthy();
  });
});
