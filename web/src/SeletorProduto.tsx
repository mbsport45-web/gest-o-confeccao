import { useMemo, useState } from 'react';

export type ProdutoBusca = {
  id: number;
  nome: string;
  referencia?: string | null;
  sku?: string | null;
};

export function nomeComparavel(nome: string): string {
  return nome.trim().replace(/\s+/g, ' ').toLocaleLowerCase('pt-BR');
}

export function referenciaDoProduto(produto: {
  referencia?: string | null;
  sku?: string | null;
}): string {
  return (produto.referencia ?? produto.sku ?? '').trim();
}

export function textoProduto(produto: ProdutoBusca): string {
  const referencia = referenciaDoProduto(produto);
  return referencia ? `${produto.nome} · ${referencia}` : produto.nome;
}

export function ordenarProdutos<T extends { nome: string }>(produtos: T[]): T[] {
  return [...produtos].sort((a, b) =>
    a.nome.localeCompare(b.nome, 'pt-BR', { sensitivity: 'base' }),
  );
}

export function filtrarProdutos<T extends ProdutoBusca>(produtos: T[], busca: string): T[] {
  const consulta = nomeComparavel(busca);
  const ordenados = ordenarProdutos(produtos);
  if (!consulta) return ordenados;
  return ordenados.filter((produto) => {
    const nome = nomeComparavel(produto.nome);
    const referencia = referenciaDoProduto(produto).toLocaleLowerCase('pt-BR');
    return nome.includes(consulta) || referencia.includes(consulta);
  });
}

export function produtoPeloNome<T extends { nome: string }>(
  produtos: T[],
  nome: string,
): T | undefined {
  const alvo = nomeComparavel(nome);
  if (!alvo) return undefined;
  return produtos.find((produto) => nomeComparavel(produto.nome) === alvo);
}

export function SeletorProduto({
  produtos,
  selecionadoId,
  onSelecionar,
  onNovo,
}: {
  produtos: ProdutoBusca[];
  selecionadoId: string;
  onSelecionar: (id: string) => void;
  onNovo: () => void;
}) {
  const [busca, setBusca] = useState('');
  const selecionado = produtos.find((produto) => String(produto.id) === selecionadoId);
  const visiveis = useMemo(() => filtrarProdutos(produtos, busca), [produtos, busca]);

  return (
    <div className="seletor-produto">
      <label>
        Produto / modelo
        <input
          aria-label="Pesquisar produto ou modelo"
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          placeholder="Pesquisar produto ou modelo"
        />
      </label>
      {selecionado ? (
        <p className="dica">Selecionado: {textoProduto(selecionado)}</p>
      ) : (
        <p className="dica">Selecione um modelo cadastrado ou cadastre um novo.</p>
      )}
      <div className="seletor-produto__lista" role="listbox" aria-label="Produtos cadastrados">
        {produtos.length === 0 ? (
          <p className="dica">Nenhum produto cadastrado nesta empresa.</p>
        ) : visiveis.length === 0 ? (
          <p className="dica">Nenhum produto encontrado para essa pesquisa.</p>
        ) : (
          visiveis.map((produto) => (
            <button
              key={produto.id}
              type="button"
              role="option"
              aria-selected={String(produto.id) === selecionadoId}
              className={
                String(produto.id) === selecionadoId
                  ? 'seletor-produto__opcao is-selecionada'
                  : 'seletor-produto__opcao'
              }
              onClick={() => onSelecionar(String(produto.id))}
            >
              {textoProduto(produto)}
            </button>
          ))
        )}
      </div>
      <button type="button" className="btn-secundario" onClick={onNovo}>
        Novo produto/modelo
      </button>
    </div>
  );
}
