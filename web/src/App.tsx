import { useState } from 'react';
import { ClientesPage } from './ClientesPage';
import { OrdensPage } from './OrdensPage';

type Pagina = 'ordens' | 'clientes';

export function App() {
  const [pagina, setPagina] = useState<Pagina>('ordens');

  return (
    <div className="app">
      <header className="app__header">
        <div>
          <h1>Gestão de Confecção</h1>
          <p>
            {pagina === 'ordens'
              ? 'Controle de ordens de produção'
              : 'Cadastro e gestão de clientes'}
          </p>
        </div>
        <nav className="nav" aria-label="Módulos">
          <button
            type="button"
            className={pagina === 'ordens' ? 'nav__item nav__item--ativo' : 'nav__item'}
            onClick={() => setPagina('ordens')}
          >
            Ordens
          </button>
          <button
            type="button"
            className={
              pagina === 'clientes' ? 'nav__item nav__item--ativo' : 'nav__item'
            }
            onClick={() => setPagina('clientes')}
          >
            Clientes
          </button>
        </nav>
      </header>

      {pagina === 'ordens' ? <OrdensPage /> : <ClientesPage />}
    </div>
  );
}
