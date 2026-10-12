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

type NovaCorGrade = {
  nome: string;
  codigo?: string;
  hex?: string | null;
};

type EditorProps = {
  grade: GradeValor;
  quantidadeOrdem: number;
  catalogoCores: CorCadastro[];
  catalogoTamanhos: TamanhoCadastro[];
  onChange: (grade: GradeValor) => void;
  onCadastrarCor?: (dados: NovaCorGrade) => Promise<{ nome: string }>;
};

function mesmoNome(a: string, b: string) {
  return a.trim().toLocaleLowerCase('pt-BR') === b.trim().toLocaleLowerCase('pt-BR');
}

export function GradeOrdem({
  grade,
  quantidadeOrdem,
  catalogoCores,
  catalogoTamanhos,
  onChange,
  onCadastrarCor,
}: EditorProps) {
  const [buscaCor, setBuscaCor] = useState('');
  const [selecionadas, setSelecionadas] = useState<string[]>([]);
  const [cadastroCor, setCadastroCor] = useState(false);
  const [novaCor, setNovaCor] = useState({ nome: '', codigo: '', hex: '#6366F1', usarHex: false });
  const [salvandoCor, setSalvandoCor] = useState(false);
  const [tamanhoExtra, setTamanhoExtra] = useState('');
  const [rascunhoCor, setRascunhoCor] = useState<Record<number, string>>({});
  const [rascunhoTamanho, setRascunhoTamanho] = useState<Record<number, string>>({});
  const [erroLocal, setErroLocal] = useState<string | null>(null);
  const aviso = mensagemGrade(grade, quantidadeOrdem);
  const busca = buscaCor.trim().toLocaleLowerCase('pt-BR');
  const disponiveis = catalogoCores.filter((cor) => {
    if (grade.cores.some((atual) => mesmoNome(atual, cor.nome))) return false;
    if (!busca) return true;
    return (
      cor.nome.toLocaleLowerCase('pt-BR').includes(busca) ||
      (cor.codigo ?? '').toLocaleLowerCase('pt-BR').includes(busca)
    );
  });
  const tamanhosDisponiveis = catalogoTamanhos.filter(
    (tamanho) =>
      !grade.tamanhos.some((atual) => atual.toLocaleLowerCase('pt-BR') === tamanho.nome.toLocaleLowerCase('pt-BR')),
  );

  function incluirCor(nome: string) {
    const limpo = nome.trim();
    if (!limpo) return;
    if (grade.cores.some((cor) => mesmoNome(cor, limpo))) {
      setErroLocal('Esta cor já está na grade');
      return;
    }
    setErroLocal(null);
    onChange(adicionarCor(grade, limpo));
    setBuscaCor('');
    setSelecionadas((atual) => atual.filter((item) => !mesmoNome(item, limpo)));
  }

  function alternarCor(nome: string) {
    setSelecionadas((atual) =>
      atual.some((item) => mesmoNome(item, nome))
        ? atual.filter((item) => !mesmoNome(item, nome))
        : [...atual, nome],
    );
  }

  function incluirSelecionadas() {
    const nomes = selecionadas.filter((nome) => !grade.cores.some((cor) => mesmoNome(cor, nome)));
    if (nomes.length === 0) {
      setErroLocal('Selecione ao menos uma cor');
      return;
    }
    let proxima = grade;
    for (const nome of nomes) proxima = adicionarCor(proxima, nome);
    setSelecionadas([]);
    setErroLocal(null);
    onChange(proxima);
  }

  async function salvarNovaCor() {
    const nome = novaCor.nome.trim();
    if (!nome) {
      setErroLocal('Informe o nome da cor');
      return;
    }
    if (grade.cores.some((cor) => mesmoNome(cor, nome))) {
      setErroLocal('Esta cor já está na grade');
      return;
    }
    setSalvandoCor(true);
    try {
      const salva = onCadastrarCor
        ? await onCadastrarCor({
            nome,
            codigo: novaCor.codigo.trim() || undefined,
            hex: novaCor.usarHex ? novaCor.hex : null,
          })
        : { nome };
      setErroLocal(null);
      setCadastroCor(false);
      setNovaCor({ nome: '', codigo: '', hex: '#6366F1', usarHex: false });
      setBuscaCor('');
      onChange(adicionarCor(grade, salva.nome));
    } catch (e) {
      setErroLocal((e as Error).message);
    } finally {
      setSalvandoCor(false);
    }
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
        Selecione as cores já cadastradas ou cadastre uma nova sem sair da ordem. Cada cor entra na grade uma
        única vez. A soma das células precisa ser igual à quantidade da ordem.
      </p>
      <div className="grade-op__cores">
        <label>
          Pesquisar cor
          <input
            value={buscaCor}
            placeholder="Nome ou código da cor"
            aria-label="Pesquisar cor"
            onChange={(e) => setBuscaCor(e.target.value)}
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
      <div className="grade-op__lista" role="group" aria-label="Cores cadastradas">
        {disponiveis.length === 0 ? (
          <p className="dica">
            {busca
              ? 'Nenhuma cor cadastrada corresponde à pesquisa.'
              : 'Nenhuma cor cadastrada fora da grade.'}
          </p>
        ) : (
          disponiveis.map((cor) => (
            <label key={`${cor.id ?? 'livre'}-${cor.nome}`} className="grade-op__opcao">
              <input
                type="checkbox"
                aria-label={`Selecionar ${cor.nome}`}
                checked={selecionadas.some((item) => mesmoNome(item, cor.nome))}
                onChange={() => alternarCor(cor.nome)}
              />
              {cor.hex ? (
                <span className="cor-amostra" style={{ background: cor.hex }} aria-hidden="true" />
              ) : null}
              <span>{cor.nome}</span>
              {cor.codigo ? <small>{cor.codigo}</small> : null}
            </label>
          ))
        )}
      </div>
      <div className="grade-op__cores">
        <button
          type="button"
          className="btn-secundario"
          disabled={selecionadas.length === 0}
          onClick={incluirSelecionadas}
        >
          Adicionar selecionadas
        </button>
        <button
          type="button"
          className="btn-secundario"
          onClick={() => {
            setCadastroCor(true);
            setNovaCor((atual) => ({ ...atual, nome: buscaCor.trim() || atual.nome }));
          }}
        >
          Cadastrar nova cor
        </button>
      </div>
      {cadastroCor && (
        <div className="grade-op__nova">
          <label>
            Nome
            <input
              aria-label="Nome da nova cor"
              value={novaCor.nome}
              onChange={(e) => setNovaCor({ ...novaCor, nome: e.target.value })}
              onKeyDown={(e) => {
                if (e.key === 'Enter') e.preventDefault();
              }}
            />
          </label>
          <label>
            Código
            <input
              aria-label="Código da nova cor"
              value={novaCor.codigo}
              placeholder="Opcional"
              onChange={(e) => setNovaCor({ ...novaCor, codigo: e.target.value })}
              onKeyDown={(e) => {
                if (e.key === 'Enter') e.preventDefault();
              }}
            />
          </label>
          <label className="grade-op__opcao">
            <input
              type="checkbox"
              aria-label="Usar identificação visual"
              checked={novaCor.usarHex}
              onChange={(e) => setNovaCor({ ...novaCor, usarHex: e.target.checked })}
            />
            Identificação visual
          </label>
          {novaCor.usarHex && (
            <label>
              Cor visual
              <input
                type="color"
                aria-label="Cor visual da nova cor"
                value={novaCor.hex}
                onChange={(e) => setNovaCor({ ...novaCor, hex: e.target.value })}
              />
            </label>
          )}
          <div className="grade-op__cores">
            <button type="button" disabled={salvandoCor} onClick={() => void salvarNovaCor()}>
              {salvandoCor ? 'Salvando…' : 'Salvar cor'}
            </button>
            <button type="button" className="btn-secundario" onClick={() => setCadastroCor(false)}>
              Cancelar
            </button>
          </div>
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
                      {catalogoCores.find((item) => mesmoNome(item.nome, cor))?.hex ? (
                        <span
                          className="cor-amostra"
                          style={{
                            background:
                              catalogoCores.find((item) => mesmoNome(item.nome, cor))?.hex || undefined,
                          }}
                          aria-hidden="true"
                        />
                      ) : null}
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
