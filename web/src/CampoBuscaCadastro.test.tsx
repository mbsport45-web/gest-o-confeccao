import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { CampoBuscaCadastro } from './CampoBuscaCadastro';

function Harness() {
  const [texto, setTexto] = useState('');
  const [id, setId] = useState('');
  const [rotulo, setRotulo] = useState('');
  const [cadastro, setCadastro] = useState(false);
  const [observacao, setObservacao] = useState('grade preservada');
  return (
    <>
      <p>{observacao}</p>
      <p>selecionado:{id}</p>
      <CampoBuscaCadastro
        rotulo="Cliente"
        placeholder="Pesquisar cliente"
        texto={texto}
        selecionadoId={id}
        selecionadoRotulo={rotulo}
        opcoes={[{ id: 7, rotulo: 'Loja Livre · 52998224725' }]}
        textoNovo="Cadastrar novo cliente"
        cadastroAberto={cadastro}
        onTexto={setTexto}
        onSelecionar={setId}
        onAbrirCadastro={() => setCadastro(true)}
        onFecharCadastro={() => setCadastro(false)}
      >
        <label>
          Nome / razão social
          <input aria-label="Nome do novo cliente" />
        </label>
        <button
          type="button"
          onClick={() => {
            setId('9');
            setRotulo('Cliente Novo');
            setTexto('Cliente Novo');
            setCadastro(false);
            setObservacao('grade preservada');
          }}
        >
          Salvar cliente
        </button>
      </CampoBuscaCadastro>
    </>
  );
}

describe('busca de cliente e produto na ordem', () => {
  afterEach(() => cleanup());

  it('pesquisa, seleciona e cadastra sem apagar o restante da ordem', () => {
    render(<Harness />);
    const campo = screen.getByRole('combobox', { name: 'Cliente' });
    fireEvent.focus(campo);
    fireEvent.change(campo, { target: { value: 'livre' } });
    fireEvent.click(screen.getByRole('option', { name: 'Loja Livre · 52998224725' }));
    expect(screen.getByText('selecionado:7')).toBeTruthy();
    expect(screen.getByText('grade preservada')).toBeTruthy();

    fireEvent.focus(campo);
    fireEvent.click(screen.getByRole('button', { name: 'Cadastrar novo cliente' }));
    expect(screen.getByLabelText('Nome do novo cliente')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Salvar cliente' }));
    expect(screen.getByText('selecionado:9')).toBeTruthy();
    expect(screen.getByText('grade preservada')).toBeTruthy();
  });
});
