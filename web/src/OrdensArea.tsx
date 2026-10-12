import { useState } from 'react';
import type { AssinaturaEmpresa } from './api';
import { CoresPage } from './CoresPage';
import { OrdensPage } from './OrdensPage';

const ABAS = [
  { id: 'ordens', label: 'Ordens' },
  { id: 'cores', label: 'Cores' },
] as const;

type Aba = (typeof ABAS)[number]['id'];

export function OrdensArea({ sessao }: { sessao: { assinatura: AssinaturaEmpresa } }) {
  const [aba, setAba] = useState<Aba>('ordens');

  return (
    <div className="modulo-compras-estoque">
      <div className="abas" role="tablist" aria-label="Ordens de produção">
        {ABAS.map((item) => (
          <button
            key={item.id}
            type="button"
            role="tab"
            id={`aba-ordens-${item.id}`}
            aria-selected={aba === item.id}
            aria-controls={`painel-ordens-${item.id}`}
            className={aba === item.id ? 'abas__item abas__item--ativa' : 'abas__item'}
            onClick={() => setAba(item.id)}
          >
            {item.label}
          </button>
        ))}
      </div>
      <div role="tabpanel" id="painel-ordens-ordens" aria-labelledby="aba-ordens-ordens" hidden={aba !== 'ordens'}>
        <OrdensPage sessao={sessao} ativa={aba === 'ordens'} />
      </div>
      <div role="tabpanel" id="painel-ordens-cores" aria-labelledby="aba-ordens-cores" hidden={aba !== 'cores'}>
        <CoresPage />
      </div>
    </div>
  );
}
