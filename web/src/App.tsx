import { useState } from 'react';
import { ClientesPage } from './ClientesPage';
import { OrdensPage } from './OrdensPage';
import { ProdutosPage } from './ProdutosPage';

type Pagina = 'ordens' | 'clientes' | 'produtos';

const SUBTITULO: Record<Pagina, string> = {
  ordens: 'Controle de ordens de produção',
  clientes: 'Cadastro e gestão de clientes',
  produtos: 'Cadastro de produtos e variantes',
};

export function App() {
  const [pagina, setPagina] = useState<Pagina>('ordens');

  return (
    <div className="app">
      <header className="app__header">
        <div>
          <h1>Gestão de Confecção</h1>
          <p>{SUBTITULO[pagina]}</p>
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
          <button
            type="button"
            className={
              pagina === 'produtos' ? 'nav__item nav__item--ativo' : 'nav__item'
            }
            onClick={() => setPagina('produtos')}
          >
            Produtos
          </button>
        </nav>
      </header>

      {pagina === 'ordens' && <OrdensPage />}
      {pagina === 'clientes' && <ClientesPage />}
      {pagina === 'produtos' && <ProdutosPage />}
    </div>
  );
}
