import { useState } from 'react';
import type { AssinaturaEmpresa } from './api';
import { AviamentosPage } from './AviamentosPage';
import { MateriasPrimasPage } from './MateriasPrimasPage';

const ABAS = [
  { id: 'materias', label: 'Matérias-primas' },
  { id: 'aviamentos', label: 'Aviamentos' },
] as const;

type Aba = (typeof ABAS)[number]['id'];

export function MateriasPage({ sessao }: { sessao: { assinatura: AssinaturaEmpresa } }) {
  const [aba, setAba] = useState<Aba>('materias');

  return (
    <div className="modulo-compras-estoque modulo-materias">
      <div className="abas abas--materias" role="tablist" aria-label="Matérias">
        {ABAS.map((item) => (
          <button
            key={item.id}
            type="button"
            role="tab"
            id={`aba-materias-${item.id}`}
            aria-selected={aba === item.id}
            aria-controls={`painel-materias-${item.id}`}
            className={aba === item.id ? 'abas__item abas__item--ativa' : 'abas__item'}
            onClick={() => setAba(item.id)}
          >
            {item.label}
          </button>
        ))}
      </div>
      {aba === 'materias' && (
        <div role="tabpanel" id="painel-materias-materias" aria-labelledby="aba-materias-materias">
          <MateriasPrimasPage sessao={sessao} />
        </div>
      )}
      {aba === 'aviamentos' && (
        <div role="tabpanel" id="painel-materias-aviamentos" aria-labelledby="aba-materias-aviamentos">
          <AviamentosPage />
        </div>
      )}
    </div>
  );
}
