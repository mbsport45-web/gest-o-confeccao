import { useCallback, useEffect, useState, type FormEvent } from 'react';
import {
  STATUS_EXPEDICAO_LABEL,
  STATUS_PEDIDO_LABEL,
  type ExpedicaoItem,
  type ExpedicaoResumo,
  type StatusPedido,
  listarExpedicao,
  marcarEntrega,
  marcarProntoEnvio,
  obterResumoExpedicao,
  registrarExpedicao,
} from './api';

const moeda = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });

const FILAS = [
  { id: 'prontos', label: 'Fila de envio' },
  { id: 'expedidos', label: 'Expedidos' },
  { id: 'entregues', label: 'Entregues' },
] as const;

type Fila = (typeof FILAS)[number]['id'];

function formatarData(valor: string | null | undefined): string {
  if (!valor) return '—';
  const [y, m, d] = valor.slice(0, 10).split('-');
  if (!y || !m || !d) return valor;
  return `${d}/${m}/${y}`;
}

function rotuloStatus(item: ExpedicaoItem): string {
  if (item.expedicao_status) return STATUS_EXPEDICAO_LABEL[item.expedicao_status];
  return STATUS_PEDIDO_LABEL[item.pedido_status as StatusPedido] ?? item.pedido_status;
}

function classeStatus(item: ExpedicaoItem): string {
  return item.expedicao_status ?? item.pedido_status;
}

function hojeIso(): string {
  return new Date().toISOString().slice(0, 10);
}

export function ExpedicaoPage() {
  const [fila, setFila] = useState<Fila>('prontos');
  const [q, setQ] = useState('');
  const [qDebounced, setQDebounced] = useState('');
  const [pagina, setPagina] = useState(1);
  const [totalPaginas, setTotalPaginas] = useState(1);
  const [total, setTotal] = useState(0);
  const [itens, setItens] = useState<ExpedicaoItem[]>([]);
  const [resumo, setResumo] = useState<ExpedicaoResumo | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState<number | null>(null);
  const [expedindo, setExpedindo] = useState<ExpedicaoItem | null>(null);
  const [formExp, setFormExp] = useState({ data_expedicao: hojeIso(), observacoes: '' });

  useEffect(() => {
    const t = setTimeout(() => {
      setQDebounced(q);
      setPagina(1);
    }, 300);
    return () => clearTimeout(t);
  }, [q]);

  useEffect(() => {
    setPagina(1);
  }, [fila]);

  const recarregar = useCallback(async () => {
    try {
      setCarregando(true);
      const [lista, r] = await Promise.all([
        listarExpedicao({ q: qDebounced, fila, pagina, por_pagina: 10 }),
        obterResumoExpedicao(),
      ]);
      setItens(lista.data);
      setTotal(lista.total);
      setTotalPaginas(lista.total_paginas);
      setResumo(r);
      setErro(null);
    } catch (e) {
      setErro((e as Error).message);
    } finally {
      setCarregando(false);
    }
  }, [qDebounced, fila, pagina]);

  useEffect(() => {
    void recarregar();
  }, [recarregar]);

  async function acao(pedidoId: number, fn: () => Promise<unknown>) {
    try {
      setSalvando(pedidoId);
      setErro(null);
      await fn();
      await recarregar();
    } catch (e) {
      setErro((e as Error).message);
    } finally {
      setSalvando(null);
    }
  }

  async function handleExpedir(e: FormEvent) {
    e.preventDefault();
    if (!expedindo) return;
    await acao(expedindo.pedido_id, () =>
      registrarExpedicao(expedindo.pedido_id, {
        data_expedicao: formExp.data_expedicao || undefined,
        observacoes: formExp.observacoes || undefined,
      }),
    );
    setExpedindo(null);
  }

  return (
    <main className="app__main app__main--expedicao">
      {resumo && (
        <section className="kpi-grid" aria-label="Indicadores de expedição">
          <button type="button" className="kpi" onClick={() => setFila('prontos')}>
            <span className="kpi__label">Fila de envio</span>
            <strong className="kpi__valor">{resumo.fila}</strong>
            <span className="kpi__dica">Prontos ou faturados aguardando saída</span>
          </button>
          <button type="button" className="kpi" onClick={() => setFila('prontos')}>
            <span className="kpi__label">Pronto para envio</span>
            <strong className="kpi__valor">{resumo.prontos_envio}</strong>
            <span className="kpi__dica">Marcados para expedir</span>
          </button>
          <button type="button" className="kpi" onClick={() => setFila('expedidos')}>
            <span className="kpi__label">Expedidos</span>
            <strong className="kpi__valor">{resumo.expedidos}</strong>
            <span className="kpi__dica">Saída registrada</span>
          </button>
          <button type="button" className="kpi" onClick={() => setFila('entregues')}>
            <span className="kpi__label">Entregues</span>
            <strong className="kpi__valor">{resumo.entregues}</strong>
            <span className="kpi__dica">Recebidos pelo cliente</span>
          </button>
        </section>
      )}

      <section className="card card--wide">
        <div className="card__head">
          <div className="nav" aria-label="Filas de expedição">
            {FILAS.map((f) => (
              <button
                key={f.id}
                type="button"
                className={fila === f.id ? 'nav__item nav__item--ativo' : 'nav__item'}
                onClick={() => setFila(f.id)}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>

        <div className="filtros filtros--expedicao">
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar código ou cliente"
            aria-label="Buscar código ou cliente"
          />
        </div>

        {erro && <p className="erro">{erro}</p>}
        {carregando ? (
          <p className="vazio">Carregando expedição…</p>
        ) : itens.length === 0 ? (
          <p className="vazio">Nenhum pedido nesta fila.</p>
        ) : (
          <table className="tabela">
            <thead>
              <tr>
                <th>Pedido</th>
                <th>Cliente</th>
                <th>Peças</th>
                <th>Valor</th>
                <th>Data</th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {itens.map((item) => (
                <tr key={item.pedido_id}>
                  <td>{item.codigo}</td>
                  <td>{item.cliente}</td>
                  <td>{item.quantidade}</td>
                  <td>{moeda.format(item.valor)}</td>
                  <td>
                    {formatarData(item.data_pedido)}
                    {item.data_expedicao && (
                      <span className="kpi__dica"> · saída {formatarData(item.data_expedicao)}</span>
                    )}
                  </td>
                  <td>
                    <span className={`pill pill--${classeStatus(item)}`}>{rotuloStatus(item)}</span>
                  </td>
                  <td className="acoes">
                    {!item.expedicao_status && (
                      <button
                        type="button"
                        disabled={salvando === item.pedido_id}
                        onClick={() => void acao(item.pedido_id, () => marcarProntoEnvio(item.pedido_id))}
                      >
                        Pronto para envio
                      </button>
                    )}
                    {item.expedicao_status !== 'expedido' && item.expedicao_status !== 'entregue' && (
                      <button
                        type="button"
                        disabled={salvando === item.pedido_id}
                        onClick={() => {
                          setExpedindo(item);
                          setFormExp({ data_expedicao: hojeIso(), observacoes: item.observacoes ?? '' });
                        }}
                      >
                        Registrar expedição
                      </button>
                    )}
                    {item.expedicao_status === 'expedido' && (
                      <button
                        type="button"
                        disabled={salvando === item.pedido_id}
                        onClick={() => void acao(item.pedido_id, () => marcarEntrega(item.pedido_id))}
                      >
                        Marcar entregue
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        <div className="paginacao">
          <span>{total} registro{total === 1 ? '' : 's'}</span>
          <div>
            <button type="button" disabled={pagina <= 1} onClick={() => setPagina((p) => p - 1)}>
              Anterior
            </button>
            <span>
              Página {pagina} de {totalPaginas}
            </span>
            <button type="button" disabled={pagina >= totalPaginas} onClick={() => setPagina((p) => p + 1)}>
              Próxima
            </button>
          </div>
        </div>
      </section>

      {expedindo && (
        <section className="card">
          <div className="card__head">
            <h2>Registrar expedição · {expedindo.codigo}</h2>
            <button type="button" className="btn-fechar" onClick={() => setExpedindo(null)}>
              ×
            </button>
          </div>
          <p className="dica">
            {expedindo.cliente} · {expedindo.quantidade} peça{expedindo.quantidade === 1 ? '' : 's'} ·{' '}
            {moeda.format(expedindo.valor)}
          </p>
          <form className="form" onSubmit={(e) => void handleExpedir(e)}>
            <label>
              Data da expedição
              <input
                type="date"
                required
                value={formExp.data_expedicao}
                onChange={(e) => setFormExp({ ...formExp, data_expedicao: e.target.value })}
              />
            </label>
            <label>
              Observações
              <textarea
                rows={3}
                value={formExp.observacoes}
                onChange={(e) => setFormExp({ ...formExp, observacoes: e.target.value })}
                placeholder="Sem integração com transportadora nesta etapa"
              />
            </label>
            <div className="form__row">
              <button type="button" className="btn-secundario" onClick={() => setExpedindo(null)}>
                Cancelar
              </button>
              <button type="submit" disabled={salvando === expedindo.pedido_id}>
                Confirmar saída
              </button>
            </div>
          </form>
        </section>
      )}
    </main>
  );
}
