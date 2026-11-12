import { useState } from 'react';
import type { AssinaturaEmpresa } from './api';
import { OrdensPage } from './OrdensPage';

const ABAS = [
  { id: 'ordens', label: 'Ordens' },
  { id: 'criar-oc', label: 'Criar OC' },
] as const;

type Aba = (typeof ABAS)[number]['id'];

export function OrdensArea({
  sessao,
}: {
  sessao: { assinatura: AssinaturaEmpresa };
  onIrFila?: () => void;
}) {
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
      <div
        role="tabpanel"
        id={aba === 'criar-oc' ? 'painel-ordens-criar-oc' : 'painel-ordens-ordens'}
        aria-labelledby={aba === 'criar-oc' ? 'aba-ordens-criar-oc' : 'aba-ordens-ordens'}
      >
        <OrdensPage
          sessao={sessao}
          visao={aba === 'criar-oc' ? 'criar-oc' : 'producao'}
          onIrProducao={() => setAba('ordens')}
        />
      </div>
    </div>
  );
}
