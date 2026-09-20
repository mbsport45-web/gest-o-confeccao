import { useEffect, useState } from 'react';
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
import { EquipePage } from './EquipePage';
import { PlanoPage } from './PlanoPage';
import { LoginPage } from './LoginPage';
import {
  obterSessao,
  PAPEL_LABEL,
  sair,
  temPermissao,
  moduloSomenteLeitura,
  type Modulo,
  type SessaoAtual,
} from './api';

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
  | 'relatorios'
  | 'equipe'
  | 'plano';

const NAV: Array<{ id: Pagina; label: string; modulo?: Modulo | Modulo[] }> = [
  { id: 'dashboard', label: 'Dashboard' },
  { id: 'clientes', label: 'Clientes', modulo: 'clientes' },
  { id: 'produtos', label: 'Produtos', modulo: 'produtos' },
  { id: 'materiais', label: 'Materiais', modulo: 'materiais' },
  { id: 'estoque', label: 'Estoque', modulo: 'estoque' },
  { id: 'pedidos', label: 'Pedidos', modulo: 'pedidos' },
  { id: 'expedicao', label: 'Expedição', modulo: 'expedicao' },
  { id: 'ordens', label: 'Ordens de Produção', modulo: 'ordens' },
  { id: 'etapas', label: 'Produção/Etapas', modulo: 'etapas' },
  { id: 'compras', label: 'Compras', modulo: ['compras', 'fornecedores'] },
  { id: 'financeiro', label: 'Financeiro', modulo: 'financeiro' },
  { id: 'relatorios', label: 'Relatórios', modulo: 'relatorios' },
  { id: 'equipe', label: 'Equipe', modulo: 'equipe' },
  { id: 'plano', label: 'Plano', modulo: 'assinatura' },
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
  equipe: {
    titulo: 'Equipe',
    sub: 'Membros, convites e papéis',
  },
  plano: {
    titulo: 'Plano',
    sub: 'Limites e recursos da empresa',
  },
};

export function App() {
  const [sessao, setSessao] = useState<SessaoAtual | null | undefined>(undefined);

  useEffect(() => {
    void obterSessao()
      .then((s) => setSessao(s))
      .catch(() => setSessao(null));
  }, []);

  if (sessao === undefined) {
    return (
      <div className="login">
        <p className="vazio">Carregando sessão…</p>
      </div>
    );
  }
  if (!sessao) return <LoginPage onEntrou={setSessao} />;
  return (
    <AppAutenticado
      sessao={sessao}
      onSair={() => setSessao(null)}
      onSessao={setSessao}
    />
  );
}

function AppAutenticado({
  sessao,
  onSair,
  onSessao,
}: {
  sessao: SessaoAtual;
  onSair: () => void;
  onSessao: (sessao: SessaoAtual) => void;
}) {
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

  const nav = NAV.filter(
    (item) => !item.modulo || temPermissao(sessao.permissoes, item.modulo),
  );
  const paginaAtual = nav.some((item) => item.id === pagina) ? pagina : 'dashboard';
  const ativo = ordemId ? 'ordens' : paginaAtual;
  const titulo = ordemId
    ? { titulo: 'Detalhe da OP', sub: 'Fluxo visual de produção' }
    : TITULOS[paginaAtual];
  const moduloAtual = ordemId
    ? 'ordens'
    : NAV.find((item) => item.id === paginaAtual)?.modulo;
  const podeEquipe = temPermissao(sessao.permissoes, 'equipe');
  const somenteLeitura = moduloAtual
    ? moduloSomenteLeitura(sessao.permissoes, moduloAtual)
    : false;

  return (
    <div
      className={`shell${menuAberto ? ' shell--menu' : ''}${somenteLeitura ? ' shell--leitura' : ''}`}
    >
      <aside className="shell__sidebar" id="menu-lateral">
        <div className="shell__marca">
          <strong>Gestão de Confecção</strong>
          <span>Chão de fábrica</span>
        </div>
        <nav className="menu" aria-label="Navegação principal">
          {nav.map((item) => (
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
          <div className="shell__sessao">
            <span>
              {sessao.usuario.nome}
              <small>
                {sessao.empresa.nome} · {PAPEL_LABEL[sessao.usuario.papel]} ·{' '}
                {sessao.assinatura.plano.nome}
              </small>
            </span>
            <button
              type="button"
              className="btn-secundario"
              onClick={() => {
                void sair().finally(onSair);
              }}
            >
              Sair
            </button>
          </div>
        </header>

        <div className="shell__conteudo">
          {somenteLeitura && (
            <p className="aviso-leitura">Seu papel é somente leitura neste módulo.</p>
          )}
          {ordemId && temPermissao(sessao.permissoes, 'ordens') ? (
            <OrdemDetalhePage
              ordemId={ordemId}
              onVoltar={() => setOrdemId(null)}
            />
          ) : (
            <>
              {paginaAtual === 'dashboard' && (
                <DashboardPage
                  permissoes={sessao.permissoes}
                  onAbrirOp={abrirOp}
                  onIr={(p) => ir(p as Pagina)}
                />
              )}
              {paginaAtual === 'clientes' && <ClientesPage sessao={sessao} />}
              {paginaAtual === 'produtos' && <ProdutosPage sessao={sessao} />}
              {paginaAtual === 'materiais' && <MateriasPrimasPage sessao={sessao} />}
              {paginaAtual === 'estoque' && <EstoquePage />}
              {paginaAtual === 'pedidos' && <PedidosPage sessao={sessao} onAbrirOp={abrirOp} />}
              {paginaAtual === 'expedicao' && <ExpedicaoPage />}
              {paginaAtual === 'ordens' && <OrdensPage sessao={sessao} />}
              {paginaAtual === 'etapas' && <EtapasPage />}
              {paginaAtual === 'compras' && <ComprasPage />}
              {paginaAtual === 'financeiro' && <FinanceiroPage />}
              {paginaAtual === 'relatorios' && <RelatoriosPage />}
              {paginaAtual === 'equipe' && podeEquipe && <EquipePage sessao={sessao} />}
              {paginaAtual === 'plano' && (
                <PlanoPage
                  sessao={sessao}
                  onAssinatura={(assinatura) => onSessao({ ...sessao, assinatura })}
                />
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
