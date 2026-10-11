import { useState } from 'react';
import type { CorCadastro, TamanhoCadastro } from './api';
import {
  adicionarCor,
  adicionarTamanho,
  definirQuantidade,
  mensagemGrade,
  removerCor,
  removerTamanho,
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
  onCadastrarCor: (nome: string) => Promise<string>;
  onCadastrarTamanho: (nome: string) => Promise<string>;
};

export function GradeOrdem({
  grade,
  quantidadeOrdem,
  catalogoCores,
  catalogoTamanhos,
  onChange,
  onBuscarCores,
  onCadastrarCor,
  onCadastrarTamanho,
}: EditorProps) {
  const [buscaCor, setBuscaCor] = useState('');
  const [tamanhoExtra, setTamanhoExtra] = useState('');
  const [erroLocal, setErroLocal] = useState<string | null>(null);
  const aviso = mensagemGrade(grade, quantidadeOrdem);
  const busca = buscaCor.trim().toLocaleLowerCase('pt-BR');
  const sugestoes = catalogoCores.filter(
    (cor) =>
      !grade.cores.some((atual) => atual.toLocaleLowerCase('pt-BR') === cor.nome.toLocaleLowerCase('pt-BR')) &&
      (!busca || cor.nome.toLocaleLowerCase('pt-BR').includes(busca)),
  );
  const tamanhosDisponiveis = catalogoTamanhos.filter(
    (tamanho) =>
      !grade.tamanhos.some((atual) => atual.toLocaleLowerCase('pt-BR') === tamanho.nome.toLocaleLowerCase('pt-BR')),
  );

  async function cadastrarCor() {
    const nome = buscaCor.trim();
    if (!nome) return;
    try {
      setErroLocal(null);
      const salva = await onCadastrarCor(nome);
      onChange(adicionarCor(grade, salva));
      setBuscaCor('');
      onBuscarCores('');
    } catch (err) {
      setErroLocal((err as Error).message);
    }
  }

  async function cadastrarTamanho() {
    const nome = tamanhoExtra.trim();
    if (!nome) return;
    try {
      setErroLocal(null);
      const salvo = await onCadastrarTamanho(nome);
      onChange(adicionarTamanho(grade, salvo));
      setTamanhoExtra('');
    } catch (err) {
      setErroLocal((err as Error).message);
    }
  }

  return (
    <div className="grade-op">
      <h3 className="subtitulo">Grade de cores e tamanhos</h3>
      <p className="dica">
        Cada linha é uma cor e cada coluna é um tamanho. A soma precisa ser igual à quantidade da ordem.
      </p>
      <div className="grade-op__cores">
        <label>
          Pesquisar cor
          <input
            value={buscaCor}
            placeholder="Nome da cor"
            aria-label="Pesquisar cor"
            onChange={(e) => {
              setBuscaCor(e.target.value);
              onBuscarCores(e.target.value);
            }}
          />
        </label>
        <button type="button" className="btn-secundario" onClick={() => void cadastrarCor()}>
          Cadastrar cor
        </button>
      </div>
      {sugestoes.length > 0 && (
        <div className="grade-op__sugestoes" role="list" aria-label="Cores cadastradas">
          {sugestoes.slice(0, 8).map((cor) => (
            <button
              key={`${cor.id ?? 'produto'}-${cor.nome}`}
              type="button"
              onClick={() => onChange(adicionarCor(grade, cor.nome))}
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
              {grade.tamanhos.map((tamanho) => (
                <th key={tamanho}>
                  <span>{tamanho}</span>
                  <button
                    type="button"
                    className="btn-remover-texto"
                    aria-label={`Remover tamanho ${tamanho}`}
                    onClick={() => onChange(removerTamanho(grade, tamanho))}
                  >
                    ×
                  </button>
                </th>
              ))}
              <th>Total</th>
            </tr>
          </thead>
          <tbody>
            {grade.cores.length === 0 ? (
              <tr>
                <td colSpan={grade.tamanhos.length + 2}>Selecione ao menos uma cor.</td>
              </tr>
            ) : (
              grade.cores.map((cor) => (
                <tr key={cor}>
                  <th scope="row">
                    {cor}
                    <button
                      type="button"
                      className="btn-remover-texto"
                      aria-label={`Remover cor ${cor}`}
                      onClick={() => onChange(removerCor(grade, cor))}
                    >
                      ×
                    </button>
                  </th>
                  {grade.tamanhos.map((tamanho) => (
                    <td key={tamanho}>
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
            Tamanho cadastrado
            <select
              aria-label="Adicionar tamanho cadastrado"
              defaultValue=""
              onChange={(e) => {
                if (!e.target.value) return;
                onChange(adicionarTamanho(grade, e.target.value));
                e.target.value = '';
              }}
            >
              <option value="">Adicionar tamanho</option>
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
            placeholder="Ex.: G4"
            onChange={(e) => setTamanhoExtra(e.target.value)}
          />
        </label>
        <button type="button" className="btn-secundario" onClick={() => void cadastrarTamanho()}>
          Cadastrar tamanho
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
