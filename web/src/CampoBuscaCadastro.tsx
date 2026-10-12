import { useEffect, useId, useRef, useState } from 'react';

export type OpcaoCadastro = {
  id: number;
  rotulo: string;
};

type Props = {
  rotulo: string;
  placeholder: string;
  texto: string;
  selecionadoId: string;
  selecionadoRotulo: string;
  opcoes: OpcaoCadastro[];
  textoNovo: string;
  cadastroAberto: boolean;
  onTexto: (valor: string) => void;
  onSelecionar: (id: string) => void;
  onAbrirCadastro: () => void;
  onFecharCadastro: () => void;
  children?: React.ReactNode;
};

export function CampoBuscaCadastro({
  rotulo,
  placeholder,
  texto,
  selecionadoId,
  selecionadoRotulo,
  opcoes,
  textoNovo,
  cadastroAberto,
  onTexto,
  onSelecionar,
  onAbrirCadastro,
  onFecharCadastro,
  children,
}: Props) {
  const listaId = useId();
  const raiz = useRef<HTMLDivElement>(null);
  const [aberto, setAberto] = useState(false);

  useEffect(() => {
    function fecharAoClicarFora(evento: MouseEvent) {
      if (!raiz.current?.contains(evento.target as Node)) setAberto(false);
    }
    document.addEventListener('mousedown', fecharAoClicarFora);
    return () => document.removeEventListener('mousedown', fecharAoClicarFora);
  }, []);

  function aoDigitar(valor: string) {
    onTexto(valor);
    setAberto(true);
    if (selecionadoId && valor !== selecionadoRotulo) onSelecionar('');
  }

  function escolher(opcao: OpcaoCadastro) {
    onTexto(opcao.rotulo);
    onSelecionar(String(opcao.id));
    onFecharCadastro();
    setAberto(false);
  }

  return (
    <div className="busca-cadastro" ref={raiz}>
      <label>
        {rotulo}
        <input
          role="combobox"
          aria-expanded={aberto && !cadastroAberto}
          aria-controls={listaId}
          aria-autocomplete="list"
          placeholder={placeholder}
          value={texto}
          onChange={(e) => aoDigitar(e.target.value)}
          onFocus={() => setAberto(true)}
          onKeyDown={(e) => {
            if (e.key !== 'Enter') return;
            e.preventDefault();
            const unica = opcoes.length === 1 ? opcoes[0] : undefined;
            if (unica && texto.trim() && unica.rotulo.toLocaleLowerCase('pt-BR').includes(texto.trim().toLocaleLowerCase('pt-BR'))) {
              escolher(unica);
            }
          }}
        />
      </label>
      {aberto && !cadastroAberto && (
        <div className="busca-cadastro__lista" id={listaId} role="listbox" aria-label={rotulo}>
          {opcoes.length === 0 ? (
            <p className="dica">Nenhum registro encontrado.</p>
          ) : (
            opcoes.map((opcao) => (
              <button
                key={opcao.id}
                type="button"
                role="option"
                aria-selected={selecionadoId === String(opcao.id)}
                className="busca-cadastro__opcao"
                onClick={() => escolher(opcao)}
              >
                {opcao.rotulo}
              </button>
            ))
          )}
          <button
            type="button"
            className="btn-secundario"
            onClick={() => {
              setAberto(false);
              onAbrirCadastro();
            }}
          >
            {textoNovo}
          </button>
        </div>
      )}
      {!cadastroAberto && !(aberto && !cadastroAberto) && (
        <button
          type="button"
          className="btn-secundario"
          onClick={() => {
            setAberto(false);
            onAbrirCadastro();
          }}
        >
          {textoNovo}
        </button>
      )}
      {cadastroAberto && <div className="busca-cadastro__novo">{children}</div>}
    </div>
  );
}
