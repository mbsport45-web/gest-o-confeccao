import { useState } from 'react';
import { ClientesPage } from './ClientesPage';
import { EstoquePage } from './EstoquePage';
import { MateriasPrimasPage } from './MateriasPrimasPage';
import { OrdensPage } from './OrdensPage';
import { ProdutosPage } from './ProdutosPage';

type Pagina = 'ordens' | 'clientes' | 'produtos' | 'materias' | 'estoque';

const SUBTITULO: Record<Pagina, string> = {
  ordens: 'Ordens de produção (OP)',
  clientes: 'Cadastro e gestão de clientes',
  produtos: 'Cadastro de produtos e variantes',
  materias: 'Cadastro de matérias-primas',
  estoque: 'Saldos e movimentos de estoque',
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
          <button
            type="button"
            className={
              pagina === 'materias' ? 'nav__item nav__item--ativo' : 'nav__item'
            }
            onClick={() => setPagina('materias')}
          >
            Matérias-primas
          </button>
          <button
            type="button"
            className={
              pagina === 'estoque' ? 'nav__item nav__item--ativo' : 'nav__item'
            }
            onClick={() => setPagina('estoque')}
          >
            Estoque
          </button>
        </nav>
      </header>

      {pagina === 'ordens' && <OrdensPage />}
      {pagina === 'clientes' && <ClientesPage />}
      {pagina === 'produtos' && <ProdutosPage />}
      {pagina === 'materias' && <MateriasPrimasPage />}
      {pagina === 'estoque' && <EstoquePage />}
    </div>
  );
}
