import { useEffect, useMemo, useState } from 'react';
import {
  PRIORIDADE_OP_LABEL,
  STATUS_ETAPA_LABEL,
  STATUS_OP_LABEL,
  TIPO_ETAPA_LABEL,
  listarClientes,
  listarEstoque,
  listarEtapas,
  listarMateriasPrimas,
  listarOrdens,
  obterResumoPedidos,
  listarProdutos,
  type EstoqueSaldo,
  type EtapaProducao,
  type OrdemProducao,
  type PedidoResumo,
} from './api';

type Props = {
  onAbrirOp: (id: number) => void;
  onIr: (pagina: string) => void;
};

function formatarData(valor: string | null): string {
  if (!valor) return '—';
  const d = valor.slice(0, 10);
  const [y, m, day] = d.split('-');
  if (!y || !m || !day) return valor;
  return `${day}/${m}/${y}`;
}

export function DashboardPage({ onAbrirOp, onIr }: Props) {
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [ordens, setOrdens] = useState<OrdemProducao[]>([]);
  const [produtosTotal, setProdutosTotal] = useState(0);
  const [materiasTotal, setMateriasTotal] = useState(0);
  const [clientesTotal, setClientesTotal] = useState(0);
  const [estoqueBaixo, setEstoqueBaixo] = useState<EstoqueSaldo[]>([]);
  const [estoqueBaixoTotal, setEstoqueBaixoTotal] = useState(0);
  const [estoqueTotal, setEstoqueTotal] = useState(0);
  const [etapasAndamento, setEtapasAndamento] = useState<EtapaProducao[]>([]);
  const [etapasAndamentoTotal, setEtapasAndamentoTotal] = useState(0);
  const [etapasConcluidas, setEtapasConcluidas] = useState(0);
  const [pedidosResumo, setPedidosResumo] = useState<PedidoResumo | null>(null);

  useEffect(() => {
    let vivo = true;
    (async () => {
      try {
        setCarregando(true);
        const [ops, produtos, materias, clientes, baixo, estoque, andamento, concluidas, pedidos] =
          await Promise.all([
            listarOrdens(),
            listarProdutos({ por_pagina: 1 }),
            listarMateriasPrimas({ por_pagina: 1 }),
            listarClientes({ por_pagina: 1 }),
            listarEstoque({ abaixo_minimo: true, por_pagina: 8 }),
            listarEstoque({ por_pagina: 1 }),
            listarEtapas({ status: 'em_andamento', por_pagina: 8, pagina: 1 }),
            listarEtapas({ status: 'concluida', por_pagina: 1, pagina: 1 }),
            obterResumoPedidos(),
          ]);
        if (!vivo) return;
        setOrdens(ops);
        setProdutosTotal(produtos.total);
        setMateriasTotal(materias.total);
        setClientesTotal(clientes.total);
        setEstoqueBaixo(baixo.data);
        setEstoqueBaixoTotal(baixo.total);
        setEstoqueTotal(estoque.total);
        setEtapasAndamento(andamento.data);
        setEtapasAndamentoTotal(andamento.total);
        setEtapasConcluidas(concluidas.total);
        setPedidosResumo(pedidos);
        setErro(null);
      } catch (e) {
        if (vivo) setErro((e as Error).message);
      } finally {
        if (vivo) setCarregando(false);
      }
    })();
    return () => {
      vivo = false;
    };
  }, []);

  const opPorStatus = useMemo(() => {
    const mapa: Record<string, number> = {};
    for (const op of ordens) {
      mapa[op.status] = (mapa[op.status] ?? 0) + 1;
    }
    return mapa;
  }, [ordens]);

  const urgentes = ordens.filter((o) => o.prioridade === 'urgente' || o.prioridade === 'alta').length;
  const recentes = ordens.slice(0, 6);

  const statusChao = [
    'planejada',
    'pendente',
    'corte',
    'costura',
    'acabamento',
    'qualidade',
    'embalagem',
    'em_producao',
    'concluida',
    'cancelada',
  ].filter((s) => (opPorStatus[s] ?? 0) > 0);

  return (
    <div className="dash">
      <div className="dash__intro">
        <div>
          <h2>Painel da fábrica</h2>
          <p>Números reais dos cadastros, estoque e ordens de produção.</p>
        </div>
        <p className="dash__meta">
          {clientesTotal} cliente{clientesTotal === 1 ? '' : 's'} · {estoqueTotal} saldo
          {estoqueTotal === 1 ? '' : 's'} em estoque
        </p>
      </div>

      {erro && <p className="erro">{erro}</p>}
      {carregando ? (
        <p className="vazio">Carregando indicadores…</p>
      ) : (
        <>
          <section className="kpi-grid" aria-label="Indicadores">
            <button type="button" className="kpi" onClick={() => onIr('pedidos')}>
              <span className="kpi__label">Pedidos</span>
              <strong className="kpi__valor">{pedidosResumo?.total ?? 0}</strong>
              <span className="kpi__dica">
                {pedidosResumo
                  ? `${pedidosResumo.abertos} abertos · ${pedidosResumo.confirmados} confirmados · ${pedidosResumo.em_producao} em produção`
                  : 'Carregando pedidos…'}
              </span>
              {pedidosResumo && (
                <span className="kpi__dica">
                  {pedidosResumo.atrasados} atrasado{pedidosResumo.atrasados === 1 ? '' : 's'} · vendido{' '}
                  {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(
                    pedidosResumo.total_vendido,
                  )}
                </span>
              )}
            </button>
            <button type="button" className="kpi" onClick={() => onIr('ordens')}>
              <span className="kpi__label">Ordens de produção</span>
              <strong className="kpi__valor">{ordens.length}</strong>
              <span className="kpi__dica">{urgentes} com prioridade alta/urgente</span>
            </button>
            <button type="button" className="kpi kpi--alerta" onClick={() => onIr('estoque')}>
              <span className="kpi__label">Estoque baixo</span>
              <strong className="kpi__valor">{estoqueBaixoTotal}</strong>
              <span className="kpi__dica">Itens abaixo do mínimo</span>
            </button>
            <button type="button" className="kpi" onClick={() => onIr('produtos')}>
              <span className="kpi__label">Produtos</span>
              <strong className="kpi__valor">{produtosTotal}</strong>
              <span className="kpi__dica">Cadastro com variantes</span>
            </button>
            <button type="button" className="kpi" onClick={() => onIr('materiais')}>
              <span className="kpi__label">Materiais</span>
              <strong className="kpi__valor">{materiasTotal}</strong>
              <span className="kpi__dica">Matérias-primas cadastradas</span>
            </button>
            <button type="button" className="kpi" onClick={() => onIr('etapas')}>
              <span className="kpi__label">Produção / etapas</span>
              <strong className="kpi__valor">{etapasAndamentoTotal}</strong>
              <span className="kpi__dica">
                {etapasAndamentoTotal} em andamento · {etapasConcluidas} concluídas
              </span>
            </button>
          </section>

          <div className="dash__colunas">
            <section className="card">
              <div className="card__head">
                <h2>Status das OPs</h2>
              </div>
              {statusChao.length === 0 ? (
                <p className="vazio">Nenhuma ordem cadastrada.</p>
              ) : (
                <ul className="status-lista">
                  {statusChao.map((s) => {
                    const n = opPorStatus[s] ?? 0;
                    const pct = ordens.length ? Math.round((n / ordens.length) * 100) : 0;
                    return (
                      <li key={s}>
                        <div className="status-lista__topo">
                          <span>{STATUS_OP_LABEL[s as keyof typeof STATUS_OP_LABEL] ?? s}</span>
                          <strong>
                            {n} · {pct}%
                          </strong>
                        </div>
                        <div className="barra" aria-hidden="true">
                          <span style={{ width: `${pct}%` }} />
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>

            <section className="card">
              <div className="card__head">
                <h2>Estoque abaixo do mínimo</h2>
                <button type="button" className="btn-secundario" onClick={() => onIr('estoque')}>
                  Abrir estoque
                </button>
              </div>
              {estoqueBaixo.length === 0 ? (
                <p className="vazio">Nenhum item abaixo do mínimo agora.</p>
              ) : (
                <table className="tabela tabela--compacta">
                  <thead>
                    <tr>
                      <th>Item</th>
                      <th>Saldo</th>
                      <th>Mín.</th>
                    </tr>
                  </thead>
                  <tbody>
                    {estoqueBaixo.map((s) => (
                      <tr key={s.id}>
                        <td>
                          {s.nome}
                          <div className="dica">{s.codigo ?? s.detalhe}</div>
                        </td>
                        <td>
                          {s.quantidade} {s.unidade}
                        </td>
                        <td>{s.estoque_minimo}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </section>
          </div>

          <section className="card">
            <div className="card__head">
              <h2>Ordens recentes</h2>
              <button type="button" className="btn-secundario" onClick={() => onIr('ordens')}>
                Ver todas
              </button>
            </div>
            {recentes.length === 0 ? (
              <p className="vazio">Nenhuma OP para exibir.</p>
            ) : (
              <table className="tabela">
                <thead>
                  <tr>
                    <th>OP</th>
                    <th>Produto</th>
                    <th>Qtd.</th>
                    <th>Prioridade</th>
                    <th>Previsão</th>
                    <th>Status</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {recentes.map((o) => (
                    <tr key={o.id}>
                      <td>{o.codigo ?? `OP-${o.id}`}</td>
                      <td>
                        {o.produto}
                        <div className="dica">
                          {o.tamanho} · {o.cliente}
                        </div>
                      </td>
                      <td>{o.quantidade}</td>
                      <td>{PRIORIDADE_OP_LABEL[o.prioridade] ?? o.prioridade}</td>
                      <td>{formatarData(o.data_prevista)}</td>
                      <td>{STATUS_OP_LABEL[o.status]}</td>
                      <td className="acoes">
                        <button type="button" onClick={() => onAbrirOp(o.id)}>
                          Ver fluxo
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>

          {etapasAndamento.length > 0 && (
            <section className="card">
              <div className="card__head">
                <h2>Etapas em andamento</h2>
              </div>
              <ul className="lista-simples">
                {etapasAndamento.slice(0, 6).map((e) => (
                  <li key={e.id}>
                    <button type="button" className="link-op" onClick={() => onAbrirOp(e.ordem_id)}>
                      {e.ordem_codigo} · {TIPO_ETAPA_LABEL[e.tipo]}
                    </button>
                    <span>
                      {STATUS_ETAPA_LABEL[e.status]} · {e.produto} · {e.responsavel ?? 'sem operador'}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </>
      )}
    </div>
  );
}
