import { useState } from 'react';
import { ClientesPage } from './ClientesPage';
import { ComprasPage } from './ComprasPage';
import { DashboardPage } from './DashboardPage';
import { EtapasPage } from './EtapasPage';
import { EstoquePage } from './EstoquePage';
import { FinanceiroPage } from './FinanceiroPage';
import { MateriasPrimasPage } from './MateriasPrimasPage';
import { OrdemDetalhePage } from './OrdemDetalhePage';
import { OrdensPage } from './OrdensPage';
import { PedidosPage } from './PedidosPage';
import { ProdutosPage } from './ProdutosPage';
import { RelatoriosPage } from './RelatoriosPage';
import { ExpedicaoPage } from './ExpedicaoPage';

type Pagina =
  | 'dashboard'
  | 'clientes'
  | 'produtos'
  | 'materiais'
  | 'estoque'
  | 'pedidos'
  | 'expedicao'
  | 'ordens'
  | 'etapas'
  | 'compras'
  | 'financeiro'
  | 'relatorios';

const NAV: Array<{ id: Pagina; label: string }> = [
  { id: 'dashboard', label: 'Dashboard' },
  { id: 'clientes', label: 'Clientes' },
  { id: 'produtos', label: 'Produtos' },
  { id: 'materiais', label: 'Materiais' },
  { id: 'estoque', label: 'Estoque' },
  { id: 'pedidos', label: 'Pedidos' },
  { id: 'expedicao', label: 'Expedição' },
  { id: 'ordens', label: 'Ordens de Produção' },
  { id: 'etapas', label: 'Produção/Etapas' },
  { id: 'compras', label: 'Compras' },
  { id: 'financeiro', label: 'Financeiro' },
  { id: 'relatorios', label: 'Relatórios' },
];

const TITULOS: Record<Pagina, { titulo: string; sub: string }> = {
  dashboard: {
    titulo: 'Dashboard',
    sub: 'Visão geral da fábrica',
  },
  clientes: {
    titulo: 'Clientes',
    sub: 'Cadastro e gestão de clientes',
  },
  produtos: {
    titulo: 'Produtos',
    sub: 'Cadastro de produtos e variantes',
  },
  materiais: {
    titulo: 'Materiais',
    sub: 'Cadastro de matérias-primas',
  },
  estoque: {
    titulo: 'Estoque',
    sub: 'Saldos e movimentos de estoque',
  },
  pedidos: {
    titulo: 'Pedidos',
    sub: 'Pedidos de venda',
  },
  expedicao: {
    titulo: 'Expedição',
    sub: 'Pronto para envio e entrega',
  },
  ordens: {
    titulo: 'Ordens de Produção',
    sub: 'Ordens, prioridade e previsão',
  },
  etapas: {
    titulo: 'Produção/Etapas',
    sub: 'Fluxo Corte → Embalagem',
  },
  compras: {
    titulo: 'Compras',
    sub: 'Compras e fornecedores',
  },
  financeiro: {
    titulo: 'Financeiro',
    sub: 'Contas e caixa',
  },
  relatorios: {
    titulo: 'Relatórios',
    sub: 'Indicadores da confecção',
  },
};

export function App() {
  const [pagina, setPagina] = useState<Pagina>('dashboard');
  const [ordemId, setOrdemId] = useState<number | null>(null);
  const [menuAberto, setMenuAberto] = useState(false);

  function ir(destino: Pagina) {
    setOrdemId(null);
    setPagina(destino);
    setMenuAberto(false);
  }

  function abrirOp(id: number) {
    setPagina('ordens');
    setOrdemId(id);
    setMenuAberto(false);
  }

  const ativo = ordemId ? 'ordens' : pagina;
  const titulo = ordemId
    ? { titulo: 'Detalhe da OP', sub: 'Fluxo visual de produção' }
    : TITULOS[pagina];

  return (
    <div className={`shell${menuAberto ? ' shell--menu' : ''}`}>
      <aside className="shell__sidebar" id="menu-lateral">
        <div className="shell__marca">
          <strong>Gestão de Confecção</strong>
          <span>Chão de fábrica</span>
        </div>
        <nav className="menu" aria-label="Navegação principal">
          {NAV.map((item) => (
            <button
              key={item.id}
              type="button"
              className={
                ativo === item.id ? 'menu__item menu__item--ativo' : 'menu__item'
              }
              aria-current={ativo === item.id ? 'page' : undefined}
              onClick={() => ir(item.id)}
            >
              {item.label}
            </button>
          ))}
        </nav>
      </aside>

      {menuAberto && (
        <button
          type="button"
          className="shell__overlay"
          aria-label="Fechar menu"
          onClick={() => setMenuAberto(false)}
        />
      )}

      <div className="shell__principal">
        <header className="shell__topo">
          <button
            type="button"
            className="shell__hamburguer"
            aria-expanded={menuAberto}
            aria-controls="menu-lateral"
            onClick={() => setMenuAberto((v) => !v)}
          >
            Menu
          </button>
          <div>
            <h1>{titulo.titulo}</h1>
            <p>{titulo.sub}</p>
          </div>
        </header>

        <div className="shell__conteudo">
          {ordemId ? (
            <OrdemDetalhePage
              ordemId={ordemId}
              onVoltar={() => setOrdemId(null)}
            />
          ) : (
            <>
              {pagina === 'dashboard' && (
                <DashboardPage onAbrirOp={abrirOp} onIr={(p) => ir(p as Pagina)} />
              )}
              {pagina === 'clientes' && <ClientesPage />}
              {pagina === 'produtos' && <ProdutosPage />}
              {pagina === 'materiais' && <MateriasPrimasPage />}
              {pagina === 'estoque' && <EstoquePage />}
              {pagina === 'pedidos' && <PedidosPage onAbrirOp={abrirOp} />}
              {pagina === 'expedicao' && <ExpedicaoPage />}
              {pagina === 'ordens' && <OrdensPage />}
              {pagina === 'etapas' && <EtapasPage />}
              {pagina === 'compras' && <ComprasPage />}
              {pagina === 'financeiro' && <FinanceiroPage />}
              {pagina === 'relatorios' && <RelatoriosPage />}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
