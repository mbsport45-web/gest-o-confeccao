import { useRef, useState } from 'react';
import {
  analisarImportacaoProdutos,
  importarProdutos,
  type AcaoImportacaoProduto,
  type LinhaImportacaoProduto,
  type ResultadoImportacaoProdutos,
} from './api';

function parseLista(texto: string): string[] {
  const unique: string[] = [];
  for (const raw of texto.split(/[,;]/)) {
    const item = raw.trim();
    if (!item) continue;
    if (!unique.some((u) => u.toLowerCase() === item.toLowerCase())) unique.push(item);
  }
  return unique;
}

function arquivoParaBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const r = String(reader.result ?? '');
      const i = r.indexOf(',');
      resolve(i >= 0 ? r.slice(i + 1) : r);
    };
    reader.onerror = () => reject(new Error('Não foi possível ler o arquivo'));
    reader.readAsDataURL(file);
  });
}

type LinhaEdicao = LinhaImportacaoProduto & { acao: AcaoImportacaoProduto };

export function ImportacaoProdutosPainel({
  onFechar,
  onConcluido,
}: {
  onFechar: () => void;
  onConcluido: () => Promise<void> | void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [linhas, setLinhas] = useState<LinhaEdicao[]>([]);
  const [errosArquivo, setErrosArquivo] = useState<ResultadoImportacaoProdutos['erros']>([]);
  const [resultado, setResultado] = useState<ResultadoImportacaoProdutos | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [lendo, setLendo] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [arquivoNome, setArquivoNome] = useState('');

  function atualizar(indice: number, patch: Partial<LinhaEdicao>) {
    setLinhas((atual) => atual.map((linha, i) => (i === indice ? { ...linha, ...patch } : linha)));
  }

  async function lerArquivo(file: File | undefined) {
    if (!file) return;
    setLendo(true);
    setErro(null);
    setResultado(null);
    try {
      const conteudo_base64 = await arquivoParaBase64(file);
      const analise = await analisarImportacaoProdutos({
        nome_arquivo: file.name,
        conteudo_base64,
      });
      setArquivoNome(file.name);
      setErrosArquivo(analise.erros);
      setLinhas(
        analise.linhas.map((linha) => ({
          ...linha,
          acao: linha.acao_sugerida,
        })),
      );
      if (analise.linhas.length === 0 && analise.erros.length === 0) {
        setErro('Nenhum produto encontrado no arquivo.');
      }
    } catch (e) {
      setErro((e as Error).message);
      setLinhas([]);
    } finally {
      setLendo(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  }

  function aplicarDuplicados(acao: AcaoImportacaoProduto) {
    setLinhas((atual) => atual.map((linha) => (linha.existente ? { ...linha, acao } : linha)));
  }

  async function confirmar() {
    if (linhas.length === 0) return;
    setSalvando(true);
    setErro(null);
    try {
      const res = await importarProdutos(
        linhas.map((linha) => ({
          linha: linha.linha,
          sku: linha.sku,
          nome: linha.nome,
          categoria: linha.categoria,
          marca: linha.marca,
          preco_venda: linha.preco_venda,
          descricao: linha.descricao,
          cores: linha.cores,
          tamanhos: linha.tamanhos,
          variantes: linha.variantes,
          acao: linha.acao,
        })),
      );
      setResultado(res);
      await onConcluido();
    } catch (e) {
      setErro((e as Error).message);
    } finally {
      setSalvando(false);
    }
  }

  const duplicados = linhas.filter((l) => l.existente).length;

  return (
    <section className="card card--wide" aria-label="Importar produtos">
      <div className="card__head">
        <h2>Importar produtos</h2>
        <button type="button" className="btn-fechar" onClick={onFechar} aria-label="Fechar importação">
          ×
        </button>
      </div>
      <p className="dica">
        Selecione um Excel (.xlsx) ou CSV com SKU/Referência, nome, categoria, marca, preço de
        venda, descrição, cores, tamanhos e variantes.
      </p>
      <div className="importacao-produtos__arquivo">
        <input
          ref={inputRef}
          type="file"
          accept=".xlsx,.csv,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          aria-label="Arquivo de produtos"
          onChange={(e) => void lerArquivo(e.target.files?.[0])}
        />
        <button type="button" className="btn-secundario" onClick={() => inputRef.current?.click()}>
          Selecionar arquivo
        </button>
        {arquivoNome ? <span>{arquivoNome}</span> : null}
        {lendo ? <span>Lendo arquivo…</span> : null}
      </div>
      {erro ? <p className="erro">{erro}</p> : null}
      {errosArquivo.length > 0 ? (
        <ul className="importacao-produtos__erros" aria-label="Erros do arquivo">
          {errosArquivo.map((item) => (
            <li key={`${item.linha}-${item.erro}`}>
              Linha {item.linha}
              {item.sku ? ` (${item.sku})` : ''}: {item.erro}
            </li>
          ))}
        </ul>
      ) : null}

      {linhas.length > 0 ? (
        <>
          {duplicados > 0 ? (
            <div className="importacao-produtos__duplicados">
              <p>
                {duplicados} produto{duplicados === 1 ? '' : 's'} com SKU já cadastrado. Escolha
                atualizar ou ignorar.
              </p>
              <button type="button" className="btn-secundario" onClick={() => aplicarDuplicados('atualizar')}>
                Atualizar duplicados
              </button>
              <button type="button" className="btn-secundario" onClick={() => aplicarDuplicados('ignorar')}>
                Ignorar duplicados
              </button>
            </div>
          ) : null}
          <div className="liberacao-andamento__tabela">
            <table className="tabela" aria-label="Produtos encontrados para importar">
              <thead>
                <tr>
                  <th>SKU / Referência</th>
                  <th>Nome</th>
                  <th>Categoria</th>
                  <th>Marca</th>
                  <th>Preço de venda</th>
                  <th>Descrição</th>
                  <th>Cores</th>
                  <th>Tamanhos</th>
                  <th>Situação</th>
                  <th>Ação</th>
                </tr>
              </thead>
              <tbody>
                {linhas.map((linha, indice) => (
                  <tr key={`${linha.linha}-${linha.sku}-${indice}`}>
                    <td>
                      <input
                        aria-label={`SKU linha ${linha.linha}`}
                        value={linha.sku}
                        onChange={(e) => atualizar(indice, { sku: e.target.value })}
                      />
                    </td>
                    <td>
                      <input
                        aria-label={`Nome linha ${linha.linha}`}
                        value={linha.nome}
                        onChange={(e) => atualizar(indice, { nome: e.target.value })}
                      />
                    </td>
                    <td>
                      <input
                        aria-label={`Categoria linha ${linha.linha}`}
                        value={linha.categoria}
                        onChange={(e) => atualizar(indice, { categoria: e.target.value })}
                      />
                    </td>
                    <td>
                      <input
                        aria-label={`Marca linha ${linha.linha}`}
                        value={linha.marca}
                        onChange={(e) => atualizar(indice, { marca: e.target.value })}
                      />
                    </td>
                    <td>
                      <input
                        type="number"
                        min={0}
                        step="0.01"
                        aria-label={`Preço de venda linha ${linha.linha}`}
                        value={linha.preco_venda ?? ''}
                        onChange={(e) =>
                          atualizar(indice, {
                            preco_venda: e.target.value === '' ? null : Number(e.target.value),
                          })
                        }
                      />
                    </td>
                    <td>
                      <input
                        aria-label={`Descrição linha ${linha.linha}`}
                        value={linha.descricao}
                        onChange={(e) => atualizar(indice, { descricao: e.target.value })}
                      />
                    </td>
                    <td>
                      <input
                        aria-label={`Cores linha ${linha.linha}`}
                        value={linha.cores.join(', ')}
                        onChange={(e) => atualizar(indice, { cores: parseLista(e.target.value) })}
                      />
                    </td>
                    <td>
                      <input
                        aria-label={`Tamanhos linha ${linha.linha}`}
                        value={linha.tamanhos.join(', ')}
                        onChange={(e) => atualizar(indice, { tamanhos: parseLista(e.target.value) })}
                      />
                    </td>
                    <td>
                      {linha.existente ? (
                        <span className="pill pill--atrasado">
                          Duplicado · {linha.existente.nome}
                        </span>
                      ) : linha.erros.length ? (
                        <span className="pill pill--atrasado">{linha.erros[0]}</span>
                      ) : (
                        <span className="pill pill--ativo">Novo</span>
                      )}
                    </td>
                    <td>
                      {linha.existente ? (
                        <select
                          aria-label={`Ação do SKU ${linha.sku || linha.linha}`}
                          value={linha.acao}
                          onChange={(e) =>
                            atualizar(indice, { acao: e.target.value as AcaoImportacaoProduto })
                          }
                        >
                          <option value="ignorar">Ignorar</option>
                          <option value="atualizar">Atualizar</option>
                        </select>
                      ) : (
                        <span>Importar</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="importacao-produtos__acoes">
            <button type="button" onClick={() => void confirmar()} disabled={salvando}>
              {salvando ? 'Importando…' : 'Confirmar importação'}
            </button>
            <button type="button" className="btn-secundario" onClick={onFechar}>
              Cancelar
            </button>
          </div>
        </>
      ) : null}

      {resultado ? (
        <div className="importacao-produtos__resumo" aria-label="Resultado da importação">
          <p>
            {resultado.importados} importado{resultado.importados === 1 ? '' : 's'},{' '}
            {resultado.atualizados} atualizado{resultado.atualizados === 1 ? '' : 's'},{' '}
            {resultado.ignorados} ignorado{resultado.ignorados === 1 ? '' : 's'}.
          </p>
          {resultado.erros.length > 0 ? (
            <ul>
              {resultado.erros.map((item) => (
                <li key={`${item.linha}-${item.erro}`}>
                  Linha {item.linha}
                  {item.sku ? ` (${item.sku})` : ''}: {item.erro}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
