import { useEffect, useState } from 'react';
import { EstampasPage } from './EstampasPage';
import { ComprasEstoquePage } from './ComprasEstoquePage';
import { DashboardPage } from './DashboardPage';
import { LiberacaoFichasPage } from './LiberacaoFichasPage';
import { EstoquePage } from './EstoquePage';
import { FinanceiroPage } from './FinanceiroPage';
import { MateriasPage } from './MateriasPage';
import { OrdemDetalhePage } from './OrdemDetalhePage';
import { CorteInfestoPage } from './CorteInfestoPage';
import { OrdensArea } from './OrdensArea';
import { PedidosPage } from './PedidosPage';
import { ProdutosPage } from './ProdutosPage';
import { RelatoriosPage } from './RelatoriosPage';
import { ExpedicaoPage } from './ExpedicaoPage';
import { EquipePage } from './EquipePage';
import { PlanoPage } from './PlanoPage';
import { LoginPage } from './LoginPage';
import { LogoMarca } from './LogoMarca';
import { PainelMotivacao } from './PainelMotivacao';
import {
  obterSessao,
  PAPEL_LABEL,
  STATUS_ASSINATURA_LABEL,
  formatarPrecoMensal,
  sair,
  temPermissao,
  moduloSomenteLeitura,
  assinaturaOperacional,
  type Modulo,
  type SessaoAtual,
} from './api';

type Pagina =
  | 'dashboard'
  | 'clientes'
  | 'estampas'
  | 'produtos'
  | 'materiais'
  | 'estoque'
  | 'pedidos'
  | 'expedicao'
  | 'ordens'
  | 'corte'
  | 'etapas'
  | 'compras'
  | 'financeiro'
  | 'relatorios'
  | 'equipe'
  | 'plano';

const NAV: Array<{ id: Pagina; label: string; grupo: string; modulo?: Modulo | Modulo[] }> = [
  { id: 'dashboard', label: 'Dashboard', grupo: 'Início' },
  { id: 'estampas', label: 'OCs disponíveis/estampas', grupo: 'Cadastros', modulo: 'clientes' },
  { id: 'produtos', label: 'Produtos', grupo: 'Cadastros', modulo: 'produtos' },
  { id: 'materiais', label: 'Materiais', grupo: 'Cadastros', modulo: 'materiais' },
  { id: 'ordens', label: 'Ordens de Produção', grupo: 'Produção', modulo: 'ordens' },
  { id: 'corte', label: 'Enfesto e Corte', grupo: 'Produção', modulo: 'ordens' },
  { id: 'etapas', label: 'Liberação Ficha/Oficina', grupo: 'Produção', modulo: 'etapas' },
  { id: 'pedidos', label: 'Pedidos', grupo: 'Comercial', modulo: 'pedidos' },
  { id: 'expedicao', label: 'Expedição', grupo: 'Comercial', modulo: 'expedicao' },
  { id: 'compras', label: 'Compras e Estoque', grupo: 'Comercial', modulo: ['compras', 'fornecedores'] },
  { id: 'financeiro', label: 'Financeiro', grupo: 'Gestão', modulo: 'financeiro' },
  { id: 'relatorios', label: 'Relatórios', grupo: 'Gestão', modulo: 'relatorios' },
  { id: 'equipe', label: 'Equipe', grupo: 'Gestão', modulo: 'equipe' },
  { id: 'plano', label: 'Plano', grupo: 'Gestão', modulo: 'assinatura' },
];

function IconeNav({ pagina }: { pagina: Pagina }) {
  const comum = {
    width: 18,
    height: 18,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.8,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    'aria-hidden': true,
  };
  switch (pagina) {
    case 'dashboard':
      return (
        <svg {...comum}>
          <rect x="3" y="3" width="7" height="9" rx="1.2" />
          <rect x="14" y="3" width="7" height="5" rx="1.2" />
          <rect x="14" y="12" width="7" height="9" rx="1.2" />
          <rect x="3" y="16" width="7" height="5" rx="1.2" />
        </svg>
      );
    case 'clientes':
    case 'estampas':
      return (
        <svg {...comum}>
          <rect x="4" y="5" width="7" height="14" rx="1.2" />
          <rect x="13" y="5" width="7" height="14" rx="1.2" />
          <path d="M6 8h3M6 11h3M15 8h3M15 11h3" />
        </svg>
      );
    case 'produtos':
      return (
        <svg {...comum}>
          <path d="M4 8.5 12 4l8 4.5v9L12 22l-8-4.5z" />
          <path d="M12 12v10M4 8.5 12 12l8-3.5" />
        </svg>
      );
    case 'materiais':
      return (
        <svg {...comum}>
          <path d="M4 7h16v10H4z" />
          <path d="M4 11h16M9 7v10" />
        </svg>
      );
    case 'estoque':
      return (
        <svg {...comum}>
          <path d="M3 7h18v13H3z" />
          <path d="M3 11h18M8 7V4h8v3" />
        </svg>
      );
    case 'ordens':
      return (
        <svg {...comum}>
          <path d="M8 4h11v16H8z" />
          <path d="M5 7h3M5 11h3M5 15h3M11 8h5M11 12h5M11 16h3" />
        </svg>
      );
    case 'corte':
      return (
        <svg {...comum}>
          <circle cx="6" cy="7" r="2.4" />
          <circle cx="6" cy="17" r="2.4" />
          <path d="M8 8.5 20 18M8 15.5 20 6" />
        </svg>
      );
    case 'etapas':
      return (
        <svg {...comum}>
          <circle cx="5" cy="12" r="2.2" />
          <circle cx="12" cy="12" r="2.2" />
          <circle cx="19" cy="12" r="2.2" />
          <path d="M7.2 12h2.6M14.2 12h2.6" />
        </svg>
      );
    case 'pedidos':
      return (
        <svg {...comum}>
          <path d="M7 4h10l1 4H6z" />
          <path d="M6 8h12v12H6z" />
          <path d="M9 12h6M9 16h4" />
        </svg>
      );
    case 'expedicao':
      return (
        <svg {...comum}>
          <path d="M3 16V8h11v8" />
          <path d="M14 11h5l2 3v2h-7" />
          <circle cx="7" cy="18" r="2" />
          <circle cx="17" cy="18" r="2" />
        </svg>
      );
    case 'compras':
      return (
        <svg {...comum}>
          <circle cx="9" cy="20" r="1.6" />
          <circle cx="18" cy="20" r="1.6" />
          <path d="M3 4h2l2.4 11h11.2l2-7H7.2" />
        </svg>
      );
    case 'financeiro':
      return (
        <svg {...comum}>
          <path d="M4 19V9M10 19V5M16 19v-7M21 19H3" />
        </svg>
      );
    case 'relatorios':
      return (
        <svg {...comum}>
          <path d="M5 19V9l5 4 4-7 5 6v7z" />
        </svg>
      );
    case 'equipe':
      return (
        <svg {...comum}>
          <circle cx="12" cy="8" r="3.2" />
          <path d="M5 20c.6-3.4 3.2-5 7-5s6.4 1.6 7 5" />
        </svg>
      );
    case 'plano':
      return (
        <svg {...comum}>
          <rect x="4" y="5" width="16" height="14" rx="2" />
          <path d="M8 10h8M8 14h5" />
        </svg>
      );
  }
}

const TITULOS: Record<Pagina, { titulo: string; sub: string }> = {
  dashboard: {
    titulo: 'Dashboard',
    sub: 'Visão geral da fábrica',
  },
  clientes: {
    titulo: 'Clientes',
    sub: 'Cadastro e gestão de clientes',
  },
  estampas: {
    titulo: 'OCs disponíveis/estampas',
    sub: 'Amostras e cortes das fichas entregues',
  },
  produtos: {
    titulo: 'Produtos',
    sub: 'Catálogo de modelos e referências',
  },
  materiais: {
    titulo: 'Matérias',
    sub: 'Tecidos no estoque de matérias-primas e aviamentos em cadastro separado',
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
  corte: {
    titulo: 'Enfesto e Corte',
    sub: 'Fichas recebidas, PDF e apontamentos do corte',
  },
  etapas: {
    titulo: 'Liberação Ficha/Oficina',
    sub: 'Liberar fichas de corte para a oficina',
  },
  compras: {
    titulo: 'Compras e Estoque',
    sub: 'Compras, fornecedores e estoque de materiais',
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
    sub: 'Assinatura e pagamento sandbox',
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
    setPagina(destino === 'estoque' ? 'compras' : destino);
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
  const bloqueioAssinatura = !assinaturaOperacional(sessao.assinatura);
  const somenteLeitura = bloqueioAssinatura
    ? Boolean(moduloAtual)
    : moduloAtual
      ? moduloSomenteLeitura(sessao.permissoes, moduloAtual)
      : false;
  const statusLabel =
    sessao.assinatura.status_label ??
    STATUS_ASSINATURA_LABEL[sessao.assinatura.status] ??
    sessao.assinatura.status;

  return (
    <div
      className={`shell${menuAberto ? ' shell--menu' : ''}${somenteLeitura ? ' shell--leitura' : ''}`}
    >
      <aside className="shell__sidebar" id="menu-lateral">
        <div className="shell__marca">
          <LogoMarca decorative />
          <div>
            <strong>MB Gestão</strong>
            <span>Confecção</span>
          </div>
        </div>
        <nav className="menu" aria-label="Navegação principal">
          {nav.reduce<Array<{ grupo: string; itens: typeof nav }>>((grupos, item) => {
            const ultimo = grupos[grupos.length - 1];
            if (!ultimo || ultimo.grupo !== item.grupo) {
              grupos.push({ grupo: item.grupo, itens: [item] });
            } else {
              ultimo.itens.push(item);
            }
            return grupos;
          }, []).map((grupo) => (
            <div key={grupo.grupo} className="menu__grupo">
              <p className="menu__grupo-titulo">{grupo.grupo}</p>
              {grupo.itens.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className={
                    ativo === item.id ? 'menu__item menu__item--ativo' : 'menu__item'
                  }
                  aria-current={ativo === item.id ? 'page' : undefined}
                  onClick={() => ir(item.id)}
                >
                  <IconeNav pagina={item.id} />
                  {item.label}
                </button>
              ))}
            </div>
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
          <LogoMarca className="shell__logo--topo" decorative />
          <div>
            <h1>{titulo.titulo}</h1>
            <p>{titulo.sub}</p>
          </div>
          <div className="shell__sessao">
            <span>
              {sessao.usuario.nome}
              <small>
                {sessao.empresa.nome} · {PAPEL_LABEL[sessao.usuario.papel]}
              </small>
              <small>
                {sessao.assinatura.plano.nome} ·{' '}
                {formatarPrecoMensal(
                  sessao.assinatura.comercial?.valor_mensal ?? sessao.assinatura.plano.preco_mensal,
                  sessao.assinatura.comercial?.moeda ?? sessao.assinatura.plano.moeda,
                )}{' '}
                · {statusLabel}
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
          {bloqueioAssinatura && (
            <p className="aviso-limite">
              Assinatura {statusLabel.toLowerCase()}: os dados continuam visíveis, mas criar ou
              alterar cadastros está bloqueado. Abra Plano para regularizar, reativar ou renovar.
            </p>
          )}
          {somenteLeitura && !bloqueioAssinatura && (
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
              {paginaAtual === 'estampas' && <EstampasPage />}
              {paginaAtual === 'produtos' && <ProdutosPage sessao={sessao} />}
              {paginaAtual === 'materiais' && <MateriasPage sessao={sessao} />}
              {paginaAtual === 'estoque' && <EstoquePage />}
              {paginaAtual === 'pedidos' && <PedidosPage sessao={sessao} onAbrirOp={abrirOp} />}
              {paginaAtual === 'expedicao' && <ExpedicaoPage />}
              {paginaAtual === 'ordens' && <OrdensArea sessao={sessao} onIrFila={() => ir('corte')} />}
              {paginaAtual === 'corte' && <CorteInfestoPage />}
              {paginaAtual === 'etapas' && <LiberacaoFichasPage />}
              {paginaAtual === 'compras' && <ComprasEstoquePage permissoes={sessao.permissoes} />}
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
      <PainelMotivacao />
    </div>
  );
}
