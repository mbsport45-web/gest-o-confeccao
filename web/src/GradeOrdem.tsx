import { useState } from 'react';
import type { CorCadastro, TamanhoCadastro } from './api';
import {
  adicionarCor,
  adicionarTamanho,
  definirQuantidade,
  mensagemGrade,
  moverTamanho,
  removerCor,
  removerTamanho,
  renomearCor,
  renomearTamanho,
  totalCor,
  totalGeral,
  totalTamanho,
  type CelulaGrade,
  type GradeValor,
  chaveGrade,
  gradeDaOrdem,
} from './gradeOrdem';

type EditorProps = {
  grade: GradeValor;
  quantidadeOrdem: number;
  catalogoCores: CorCadastro[];
  catalogoTamanhos: TamanhoCadastro[];
  onChange: (grade: GradeValor) => void;
  onBuscarCores: (busca: string) => void;
};

export function GradeOrdem({
  grade,
  quantidadeOrdem,
  catalogoCores,
  catalogoTamanhos,
  onChange,
  onBuscarCores,
}: EditorProps) {
  const [buscaCor, setBuscaCor] = useState('');
  const [tamanhoExtra, setTamanhoExtra] = useState('');
  const [rascunhoCor, setRascunhoCor] = useState<Record<number, string>>({});
  const [rascunhoTamanho, setRascunhoTamanho] = useState<Record<number, string>>({});
  const [erroLocal, setErroLocal] = useState<string | null>(null);
  const aviso = mensagemGrade(grade, quantidadeOrdem);
  const busca = buscaCor.trim().toLocaleLowerCase('pt-BR');
  const sugestoes = catalogoCores.filter(
    (cor) =>
      Boolean(busca) &&
      cor.nome.toLocaleLowerCase('pt-BR').includes(busca) &&
      !grade.cores.some((atual) => atual.toLocaleLowerCase('pt-BR') === cor.nome.toLocaleLowerCase('pt-BR')),
  );
  const tamanhosDisponiveis = catalogoTamanhos.filter(
    (tamanho) =>
      !grade.tamanhos.some((atual) => atual.toLocaleLowerCase('pt-BR') === tamanho.nome.toLocaleLowerCase('pt-BR')),
  );

  function incluirCor(nome: string) {
    const limpo = nome.trim();
    if (!limpo) return;
    if (grade.cores.some((cor) => cor.toLocaleLowerCase('pt-BR') === limpo.toLocaleLowerCase('pt-BR'))) {
      setErroLocal('Esta cor já está na grade');
      return;
    }
    setErroLocal(null);
    onChange(adicionarCor(grade, limpo));
    setBuscaCor('');
    onBuscarCores('');
  }

  function incluirTamanho(nome: string) {
    const limpo = nome.trim();
    if (!limpo) return;
    if (grade.tamanhos.some((tamanho) => tamanho.toLocaleLowerCase('pt-BR') === limpo.toLocaleLowerCase('pt-BR'))) {
      setErroLocal('Este tamanho já está na grade');
      return;
    }
    setErroLocal(null);
    setRascunhoTamanho({});
    onChange(adicionarTamanho(grade, limpo));
    setTamanhoExtra('');
  }

  function confirmarCor(indice: number, atual: string) {
    const bruto = rascunhoCor[indice];
    setRascunhoCor((estado) => {
      const copia = { ...estado };
      delete copia[indice];
      return copia;
    });
    if (bruto === undefined) return;
    const limpo = bruto.trim();
    if (!limpo) {
      setErroLocal('Informe o nome da cor');
      return;
    }
    if (limpo === atual) return;
    const proxima = renomearCor(grade, atual, limpo);
    if (proxima.cores[indice] !== limpo) {
      setErroLocal('Esta cor já está na grade');
      return;
    }
    setErroLocal(null);
    onChange(proxima);
  }

  function confirmarTamanho(indice: number, atual: string) {
    const bruto = rascunhoTamanho[indice];
    setRascunhoTamanho((estado) => {
      const copia = { ...estado };
      delete copia[indice];
      return copia;
    });
    if (bruto === undefined) return;
    const limpo = bruto.trim();
    if (!limpo) {
      setErroLocal('Informe o nome do tamanho');
      return;
    }
    if (limpo === atual) return;
    const proxima = renomearTamanho(grade, atual, limpo);
    if (proxima.tamanhos[indice] !== limpo) {
      setErroLocal('Este tamanho já está na grade');
      return;
    }
    setErroLocal(null);
    onChange(proxima);
  }

  return (
    <div className="grade-op">
      <h3 className="subtitulo">Grade de cores e tamanhos</h3>
      <p className="dica">
        Digite a cor ou o tamanho e adicione na grade. Ao salvar a ordem, os nomes novos entram no cadastro da
        empresa. A soma das células precisa ser igual à quantidade da ordem.
      </p>
      <div className="grade-op__cores">
        <label>
          Pesquisar cor
          <input
            value={buscaCor}
            placeholder="Digite uma cor nova ou já usada"
            aria-label="Pesquisar cor"
            onChange={(e) => {
              setBuscaCor(e.target.value);
              onBuscarCores(e.target.value);
            }}
            onKeyDown={(e) => {
              if (e.key !== 'Enter') return;
              e.preventDefault();
              incluirCor(buscaCor);
            }}
          />
        </label>
        <button type="button" className="btn-secundario" onClick={() => incluirCor(buscaCor)}>
          Adicionar cor
        </button>
      </div>
      {sugestoes.length > 0 && (
        <div className="grade-op__sugestoes" role="list" aria-label="Cores já usadas">
          {sugestoes.slice(0, 8).map((cor) => (
            <button
              key={`${cor.id ?? 'produto'}-${cor.nome}`}
              type="button"
              onClick={() => incluirCor(cor.nome)}
            >
              {cor.nome}
            </button>
          ))}
        </div>
      )}
      <div className="grade-op__rolagem">
        <table className="tabela tabela--compacta">
          <thead>
            <tr>
              <th>Cor</th>
              {grade.tamanhos.map((tamanho, indice) => (
                <th key={`tamanho-${indice}`}>
                  <div className="grade-op__cabecalho">
                    <button
                      type="button"
                      className="btn-remover-texto"
                      aria-label={`Mover tamanho ${tamanho} para a esquerda`}
                      disabled={indice === 0}
                      onClick={() => {
                        setRascunhoTamanho({});
                        onChange(moverTamanho(grade, tamanho, -1));
                      }}
                    >
                      ‹
                    </button>
                    <input
                      aria-label={`Tamanho ${tamanho}`}
                      value={rascunhoTamanho[indice] ?? tamanho}
                      onChange={(e) =>
                        setRascunhoTamanho((estado) => ({ ...estado, [indice]: e.target.value }))
                      }
                      onBlur={() => confirmarTamanho(indice, tamanho)}
                      onKeyDown={(e) => {
                        if (e.key !== 'Enter') return;
                        e.preventDefault();
                        e.currentTarget.blur();
                      }}
                    />
                    <button
                      type="button"
                      className="btn-remover-texto"
                      aria-label={`Mover tamanho ${tamanho} para a direita`}
                      disabled={indice === grade.tamanhos.length - 1}
                      onClick={() => {
                        setRascunhoTamanho({});
                        onChange(moverTamanho(grade, tamanho, 1));
                      }}
                    >
                      ›
                    </button>
                    <button
                      type="button"
                      className="btn-remover-texto"
                      aria-label={`Remover tamanho ${tamanho}`}
                      onClick={() => onChange(removerTamanho(grade, tamanho))}
                    >
                      ×
                    </button>
                  </div>
                </th>
              ))}
              <th>Total</th>
            </tr>
          </thead>
          <tbody>
            {grade.cores.length === 0 ? (
              <tr>
                <td colSpan={grade.tamanhos.length + 2}>Adicione ao menos uma cor.</td>
              </tr>
            ) : (
              grade.cores.map((cor, indice) => (
                <tr key={`cor-${indice}`}>
                  <th scope="row">
                    <div className="grade-op__cabecalho">
                      <input
                        aria-label={`Cor ${cor}`}
                        value={rascunhoCor[indice] ?? cor}
                        onChange={(e) =>
                          setRascunhoCor((estado) => ({ ...estado, [indice]: e.target.value }))
                        }
                        onBlur={() => confirmarCor(indice, cor)}
                        onKeyDown={(e) => {
                          if (e.key !== 'Enter') return;
                          e.preventDefault();
                          e.currentTarget.blur();
                        }}
                      />
                      <button
                        type="button"
                        className="btn-remover-texto"
                        aria-label={`Remover cor ${cor}`}
                        onClick={() => onChange(removerCor(grade, cor))}
                      >
                        ×
                      </button>
                    </div>
                  </th>
                  {grade.tamanhos.map((tamanho) => (
                    <td key={chaveGrade(cor, tamanho)}>
                      <input
                        type="number"
                        min={0}
                        step={1}
                        aria-label={`Quantidade ${cor} ${tamanho}`}
                        value={grade.quantidades[chaveGrade(cor, tamanho)] ?? 0}
                        onChange={(e) =>
                          onChange(definirQuantidade(grade, cor, tamanho, Number(e.target.value)))
                        }
                      />
                    </td>
                  ))}
                  <td className="grade-total">{totalCor(grade, cor)}</td>
                </tr>
              ))
            )}
          </tbody>
          <tfoot>
            <tr>
              <th>Total</th>
              {grade.tamanhos.map((tamanho) => (
                <td key={tamanho} className="grade-total">
                  {totalTamanho(grade, tamanho)}
                </td>
              ))}
              <td className="grade-total">{totalGeral(grade)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
      <div className="grade-op__tamanhos">
        {tamanhosDisponiveis.length > 0 && (
          <label>
            Tamanhos já usados
            <select
              aria-label="Adicionar tamanho já usado"
              defaultValue=""
              onChange={(e) => {
                if (!e.target.value) return;
                incluirTamanho(e.target.value);
                e.target.value = '';
              }}
            >
              <option value="">Adicionar tamanho já usado</option>
              {tamanhosDisponiveis.map((tamanho) => (
                <option key={tamanho.id} value={tamanho.nome}>
                  {tamanho.nome}
                </option>
              ))}
            </select>
          </label>
        )}
        <label>
          Novo tamanho
          <input
            value={tamanhoExtra}
            aria-label="Novo tamanho"
            placeholder="Digite qualquer tamanho"
            onChange={(e) => setTamanhoExtra(e.target.value)}
            onKeyDown={(e) => {
              if (e.key !== 'Enter') return;
              e.preventDefault();
              incluirTamanho(tamanhoExtra);
            }}
          />
        </label>
        <button type="button" className="btn-secundario" onClick={() => incluirTamanho(tamanhoExtra)}>
          Adicionar tamanho
        </button>
      </div>
      {aviso && <p className="erro">{aviso}</p>}
      {erroLocal && <p className="erro">{erroLocal}</p>}
    </div>
  );
}

export function GradeResumo({ celulas }: { celulas: CelulaGrade[] }) {
  const grade = gradeDaOrdem(celulas, []);
  if (grade.cores.length === 0) return <p className="dica">Sem grade de cores e tamanhos.</p>;
  return (
    <div className="grade-op__rolagem">
      <table className="tabela tabela--compacta">
        <thead>
          <tr>
            <th>Cor</th>
            {grade.tamanhos.map((tamanho) => (
              <th key={tamanho}>{tamanho}</th>
            ))}
            <th>Total</th>
          </tr>
        </thead>
        <tbody>
          {grade.cores.map((cor) => (
            <tr key={cor}>
              <th scope="row">{cor}</th>
              {grade.tamanhos.map((tamanho) => (
                <td key={tamanho}>{grade.quantidades[chaveGrade(cor, tamanho)] ?? 0}</td>
              ))}
              <td className="grade-total">{totalCor(grade, cor)}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <th>Total</th>
            {grade.tamanhos.map((tamanho) => (
              <td key={tamanho} className="grade-total">
                {totalTamanho(grade, tamanho)}
              </td>
            ))}
            <td className="grade-total">{totalGeral(grade)}</td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}
