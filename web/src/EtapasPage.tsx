import { useCallback, useEffect, useState } from 'react';
import {
  STATUS_ETAPA,
  STATUS_ETAPA_LABEL,
  TIPOS_ETAPA,
  TIPO_ETAPA_LABEL,
  atualizarEtapa,
  gerarFluxoEtapas,
  listarEtapas,
  listarOrdens,
  obterEtapa,
  removerEtapa,
  type EtapaProducao,
  type OrdemProducao,
  type StatusEtapa,
} from './api';

function formatarQuando(valor: string | null): string {
  if (!valor) return '—';
  const [data, hora] = valor.split(' ');
  const [y, m, d] = (data ?? '').split('-');
  if (!y || !m || !d) return valor;
  return `${d}/${m}/${y}${hora ? ` ${hora.slice(0, 5)}` : ''}`;
}

export function EtapasPage() {
  const [etapas, setEtapas] = useState<EtapaProducao[]>([]);
  const [pagina, setPagina] = useState(1);
  const [totalPaginas, setTotalPaginas] = useState(1);
  const [total, setTotal] = useState(0);
  const [q, setQ] = useState('');
  const [qDebounced, setQDebounced] = useState('');
  const [statusFiltro, setStatusFiltro] = useState('');
  const [tipoFiltro, setTipoFiltro] = useState('');
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [ordens, setOrdens] = useState<OrdemProducao[]>([]);
  const [ordemId, setOrdemId] = useState('');
  const [responsavel, setResponsavel] = useState('');
  const [salvando, setSalvando] = useState(false);
  const [detalhe, setDetalhe] = useState<EtapaProducao | null>(null);
  const [detalheResp, setDetalheResp] = useState('');
  const [detalheObs, setDetalheObs] = useState('');

  useEffect(() => {
    const t = setTimeout(() => {
      setQDebounced(q);
      setPagina(1);
    }, 300);
    return () => clearTimeout(t);
  }, [q]);

  useEffect(() => {
    setPagina(1);
  }, [statusFiltro, tipoFiltro]);

  useEffect(() => {
    listarOrdens()
      .then((lista) => setOrdens(lista))
      .catch(() => undefined);
  }, []);

  const recarregar = useCallback(async () => {
    try {
      setCarregando(true);
      const lista = await listarEtapas({
        q: qDebounced,
        status: statusFiltro,
        tipo: tipoFiltro,
        pagina,
        por_pagina: 10,
      });
      setEtapas(lista.data);
      setTotal(lista.total);
      setTotalPaginas(lista.total_paginas);
      setErro(null);
    } catch (e) {
      setErro((e as Error).message);
    } finally {
      setCarregando(false);
    }
  }, [qDebounced, statusFiltro, tipoFiltro, pagina]);

  useEffect(() => {
    recarregar();
  }, [recarregar]);

  async function abrirDetalhe(id: number) {
    const etapa = await obterEtapa(id);
    setDetalhe(etapa);
    setDetalheResp(etapa.responsavel ?? '');
    setDetalheObs(etapa.observacoes ?? '');
  }

  async function handleFluxo(e: React.FormEvent) {
    e.preventDefault();
    try {
      setSalvando(true);
      await gerarFluxoEtapas(Number(ordemId), responsavel || undefined);
      setOrdemId('');
      setResponsavel('');
      setErro(null);
      await recarregar();
    } catch (err) {
      setErro((err as Error).message);
    } finally {
      setSalvando(false);
    }
  }

  async function handleStatus(status: StatusEtapa) {
    if (!detalhe) return;
    try {
      const atualizada = await atualizarEtapa(detalhe.id, {
        status,
        responsavel: detalheResp,
        observacoes: detalheObs,
      });
      setDetalhe(atualizada);
      setErro(null);
      await recarregar();
    } catch (err) {
      setErro((err as Error).message);
    }
  }

  async function handleSalvarDetalhe() {
    if (!detalhe) return;
    try {
      const atualizada = await atualizarEtapa(detalhe.id, {
        responsavel: detalheResp,
        observacoes: detalheObs,
      });
      setDetalhe(atualizada);
      setErro(null);
      await recarregar();
    } catch (err) {
      setErro((err as Error).message);
    }
  }

  async function handleRemover(id: number) {
    if (!window.confirm('Excluir esta etapa?')) return;
    try {
      await removerEtapa(id);
      if (detalhe?.id === id) setDetalhe(null);
      await recarregar();
    } catch (err) {
      setErro((err as Error).message);
    }
  }

  return (
    <main className="app__main app__main--etapas">
      <section className="card card--wide">
        <div className="card__head">
          <h2>Etapas de produção</h2>
          <span className="badge">
            {total} etapa{total === 1 ? '' : 's'}
          </span>
        </div>

        <div className="filtros filtros--etapas">
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar OP, cliente, produto, operador…"
            aria-label="Buscar etapas"
          />
          <select
            value={tipoFiltro}
            onChange={(e) => setTipoFiltro(e.target.value)}
            aria-label="Filtrar etapa"
          >
            <option value="">Todas as etapas</option>
            {TIPOS_ETAPA.map((t) => (
              <option key={t} value={t}>
                {TIPO_ETAPA_LABEL[t]}
              </option>
            ))}
          </select>
          <select
            value={statusFiltro}
            onChange={(e) => setStatusFiltro(e.target.value)}
            aria-label="Filtrar status"
          >
            <option value="">Todos os status</option>
            {STATUS_ETAPA.map((s) => (
              <option key={s} value={s}>
                {STATUS_ETAPA_LABEL[s]}
              </option>
            ))}
          </select>
        </div>

        {erro && <p className="erro">{erro}</p>}

        {carregando ? (
          <p className="vazio">Carregando…</p>
        ) : etapas.length === 0 ? (
          <p className="vazio">Nenhuma etapa. Gere o fluxo de uma OP ao lado.</p>
        ) : (
          <table className="tabela">
            <thead>
              <tr>
                <th>Seq.</th>
                <th>Etapa</th>
                <th>OP</th>
                <th>Produto</th>
                <th>Operador</th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {etapas.map((e) => (
                <tr key={e.id}>
                  <td>{e.sequencia}</td>
                  <td>{TIPO_ETAPA_LABEL[e.tipo]}</td>
                  <td>
                    {e.ordem_codigo ?? e.ordem_id}
                    <div className="dica">{e.cliente}</div>
                  </td>
                  <td>
                    {e.produto}
                    <div className="dica">{e.tamanho} · {e.ordem_quantidade} pç</div>
                  </td>
                  <td>{e.responsavel ?? '—'}</td>
                  <td>
                    <span className={`pill ${e.status === 'concluida' ? 'pill--ativo' : e.status === 'cancelada' ? 'pill--inativo' : 'pill--ativo'}`}>
                      {STATUS_ETAPA_LABEL[e.status]}
                    </span>
                  </td>
                  <td className="acoes">
                    <button type="button" onClick={() => abrirDetalhe(e.id)}>
                      Ver
                    </button>
                    <button
                      type="button"
                      className="btn-remover-texto"
                      onClick={() => handleRemover(e.id)}
                    >
                      Excluir
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        <div className="paginacao">
          <span>
            Página {pagina} de {totalPaginas}
          </span>
          <div>
            <button type="button" disabled={pagina <= 1} onClick={() => setPagina((p) => p - 1)}>
              Anterior
            </button>
            <button
              type="button"
              disabled={pagina >= totalPaginas}
              onClick={() => setPagina((p) => p + 1)}
            >
              Próxima
            </button>
          </div>
        </div>
      </section>

      <div className="estoque-lado">
        <section className="card">
          <h2>Novo fluxo</h2>
          <p className="dica">
            Cria Corte, Costura, Acabamento, Controle de qualidade e Embalagem para a OP, nesta ordem.
          </p>
          <form className="form" onSubmit={handleFluxo}>
            <label>
              Ordem de produção
              <select
                required
                value={ordemId}
                onChange={(e) => setOrdemId(e.target.value)}
              >
                <option value="">Selecione</option>
                {ordens.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.codigo ?? `OP-${o.id}`} — {o.produto} ({o.tamanho})
                  </option>
                ))}
              </select>
            </label>
            <label>
              Responsável
              <input
                value={responsavel}
                onChange={(e) => setResponsavel(e.target.value)}
                placeholder="Supervisor ou setor"
              />
            </label>
            <button type="submit" disabled={salvando}>
              {salvando ? 'Gerando…' : 'Gerar fluxo'}
            </button>
          </form>
        </section>

        {detalhe && (
          <section className="card">
            <div className="card__head">
              <h2>
                {TIPO_ETAPA_LABEL[detalhe.tipo]} · {detalhe.ordem_codigo}
              </h2>
              <button type="button" className="btn-fechar" onClick={() => setDetalhe(null)}>
                ×
              </button>
            </div>
            <dl className="detalhe">
              <div>
                <dt>Sequência</dt>
                <dd>{detalhe.sequencia}</dd>
              </div>
              <div>
                <dt>Produto</dt>
                <dd>
                  {detalhe.produto} · {detalhe.tamanho}
                </dd>
              </div>
              <div>
                <dt>Status</dt>
                <dd>{STATUS_ETAPA_LABEL[detalhe.status]}</dd>
              </div>
              <div>
                <dt>Início</dt>
                <dd>{formatarQuando(detalhe.iniciado_em)}</dd>
              </div>
              <div>
                <dt>Término</dt>
                <dd>{formatarQuando(detalhe.finalizado_em)}</dd>
              </div>
            </dl>
            <form
              className="form"
              onSubmit={(e) => {
                e.preventDefault();
                handleSalvarDetalhe();
              }}
            >
              <label>
                Operador
                <input
                  value={detalheResp}
                  onChange={(e) => setDetalheResp(e.target.value)}
                />
              </label>
              <label>
                Observações
                <textarea
                  rows={2}
                  value={detalheObs}
                  onChange={(e) => setDetalheObs(e.target.value)}
                />
              </label>
              <button type="submit">Salvar operador</button>
            </form>
            <div className="detalhe__acoes">
              {detalhe.status === 'pendente' && (
                <button type="button" onClick={() => handleStatus('em_andamento')}>
                  Iniciar etapa
                </button>
              )}
              {detalhe.status === 'em_andamento' && (
                <button type="button" onClick={() => handleStatus('concluida')}>
                  Concluir etapa
                </button>
              )}
              {detalhe.status !== 'concluida' && detalhe.status !== 'cancelada' && (
                <button
                  type="button"
                  className="btn-remover-texto"
                  onClick={() => handleStatus('cancelada')}
                >
                  Cancelar etapa
                </button>
              )}
            </div>
          </section>
        )}
      </div>
    </main>
  );
}
