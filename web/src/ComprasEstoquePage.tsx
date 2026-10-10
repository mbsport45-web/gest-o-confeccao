import { useState } from 'react';
import { temPermissao, type Modulo, type PermissoesSessao } from './api';
import { ComprasPage } from './ComprasPage';
import { EstoquePage } from './EstoquePage';

export const ABAS_COMPRAS_ESTOQUE = [
  { id: 'compras', label: 'Compras', modulo: 'compras' },
  { id: 'importar', label: 'Importar PDF', modulo: 'compras' },
  { id: 'fornecedores', label: 'Fornecedores', modulo: 'fornecedores' },
  { id: 'estoque', label: 'Estoque de materiais', modulo: 'estoque' },
  { id: 'movimentacoes', label: 'Movimentações', modulo: 'estoque' },
] as const satisfies ReadonlyArray<{ id: string; label: string; modulo: Modulo }>;

export type AbaComprasEstoque = (typeof ABAS_COMPRAS_ESTOQUE)[number]['id'];

export function abasVisiveis(permissoes: PermissoesSessao | undefined) {
  return ABAS_COMPRAS_ESTOQUE.filter((aba) => temPermissao(permissoes, aba.modulo));
}

export function ComprasEstoquePage({ permissoes }: { permissoes: PermissoesSessao }) {
  const abas = abasVisiveis(permissoes);
  const [aba, setAba] = useState<AbaComprasEstoque>(abas[0]?.id ?? 'compras');
  const ativa = abas.some((item) => item.id === aba) ? aba : abas[0]?.id;

  if (!ativa) {
    return <p className="vazio">Nenhuma área de compras e estoque disponível para este acesso.</p>;
  }

  return (
    <div className="modulo-compras-estoque">
      <div className="abas" role="tablist" aria-label="Compras e Estoque">
        {abas.map((item) => (
          <button
            key={item.id}
            type="button"
            role="tab"
            id={`aba-${item.id}`}
            aria-selected={ativa === item.id}
            aria-controls={`painel-${item.id}`}
            className={ativa === item.id ? 'abas__item abas__item--ativa' : 'abas__item'}
            onClick={() => setAba(item.id)}
          >
            {item.label}
          </button>
        ))}
      </div>
      {ativa === 'compras' && (
        <div role="tabpanel" id="painel-compras" aria-labelledby="aba-compras">
          <ComprasPage visao="compras" onIrImportar={() => setAba('importar')} />
        </div>
      )}
      {ativa === 'importar' && (
        <div role="tabpanel" id="painel-importar" aria-labelledby="aba-importar">
          <ComprasPage visao="importar" />
        </div>
      )}
      {ativa === 'fornecedores' && (
        <div role="tabpanel" id="painel-fornecedores" aria-labelledby="aba-fornecedores">
          <ComprasPage visao="fornecedores" />
        </div>
      )}
      {ativa === 'estoque' && (
        <div role="tabpanel" id="painel-estoque" aria-labelledby="aba-estoque">
          <EstoquePage visao="materiais" />
        </div>
      )}
      {ativa === 'movimentacoes' && (
        <div role="tabpanel" id="painel-movimentacoes" aria-labelledby="aba-movimentacoes">
          <EstoquePage visao="movimentacoes" />
        </div>
      )}
    </div>
  );
}
