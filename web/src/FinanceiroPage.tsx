import { useCallback, useEffect, useState } from 'react';
import {
  INDICADORES_CONTAS_PAGAR,
  STATUS_LANCAMENTO,
  STATUS_LANCAMENTO_LABEL,
  STATUS_PAGAMENTO_OFICINA_LABEL,
  TIPOS_LANCAMENTO,
  TIPO_LANCAMENTO_LABEL,
  atualizarLancamento,
  criarLancamento,
  listarCategoriasFinanceiro,
  listarClientes,
  listarFornecedores,
  listarLancamentos,
  obterResumoFinanceiro,
  type ChaveIndicadorPagar,
  type Cliente,
  type FinanceiroCategoria,
  type FinanceiroLancamento,
  type FinanceiroResumo,
  type Fornecedor,
  type IndicadorContaPagar,
  type TipoLancamento,
} from './api';

const moeda = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });

const INDICADOR_VAZIO: IndicadorContaPagar = { valor: 0, quantidade: 0, categoria_id: null };

function indicadorDe(resumo: FinanceiroResumo | null, chave: ChaveIndicadorPagar): IndicadorContaPagar {
  return resumo?.a_pagar?.[chave] ?? INDICADOR_VAZIO;
}

function formatarDataBr(valor: string | null | undefined): string {
  const iso = String(valor ?? '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return '—';
  const [ano, mes, dia] = iso.split('-');
  return `${dia}/${mes}/${ano}`;
}

function rotuloStatusLancamento(l: FinanceiroLancamento): string {
  if (l.status_pagamento === 'parcial') return STATUS_PAGAMENTO_OFICINA_LABEL.parcial;
  if ((Number(l.valor_pago) || 0) > 0 && l.status !== 'pago' && l.status !== 'recebido' && l.status !== 'cancelado') {
    return STATUS_PAGAMENTO_OFICINA_LABEL.parcial;
  }
  return STATUS_LANCAMENTO_LABEL[l.status];
}

export function FinanceiroPage() {
  const [resumo, setResumo] = useState<FinanceiroResumo | null>(null);
  const [lancamentos, setLancamentos] = useState<FinanceiroLancamento[]>([]);
  const [pagina, setPagina] = useState(1);
  const [totalPaginas, setTotalPaginas] = useState(1);
  const [total, setTotal] = useState(0);
  const [q, setQ] = useState('');
  const [tipo, setTipo] = useState('');
  const [status, setStatus] = useState('');
  const [categoriaId, setCategoriaId] = useState('');
  const [de, setDe] = useState('');
  const [ate, setAte] = useState('');
  const [categorias, setCategorias] = useState<FinanceiroCategoria[]>([]);
  const [fornecedores, setFornecedores] = useState<Fornecedor[]>([]);
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [erro, setErro] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [form, setForm] = useState({
    tipo: 'pagar' as TipoLancamento,
    descricao: '',
    valor: 0,
    categoria_id: '',
    vencimento: '',
    fornecedor_id: '',
    cliente_id: '',
  });
  const [salvando, setSalvando] = useState(false);
  const [indicadorAberto, setIndicadorAberto] = useState<ChaveIndicadorPagar | null>(null);
  const [lancamentosIndicador, setLancamentosIndicador] = useState<FinanceiroLancamento[]>([]);
  const [parcial, setParcial] = useState<{ id: number; valor: string } | null>(null);

  useEffect(() => {
    listarCategoriasFinanceiro().then((l) => setCategorias(l.data)).catch(() => undefined);
    listarFornecedores({ por_pagina: 100 }).then((l) => setFornecedores(l.data)).catch(() => undefined);
    listarClientes({ por_pagina: 100 }).then((l) => setClientes(l.data)).catch(() => undefined);
  }, []);

  const recarregar = useCallback(async () => {
    try {
      setCarregando(true);
      const [r, lista] = await Promise.all([
        obterResumoFinanceiro({ de: de || undefined, ate: ate || undefined }),
        listarLancamentos({
          q,
          tipo,
          status,
          categoria_id: categoriaId ? Number(categoriaId) : undefined,
          de: de || undefined,
          ate: ate || undefined,
          pagina,
          por_pagina: 10,
        }),
      ]);
      setResumo(r);
      setLancamentos(lista.data);
      setTotal(lista.total);
      setTotalPaginas(lista.total_paginas);
      if (indicadorAberto) {
        const categoriaId = r.a_pagar?.[indicadorAberto]?.categoria_id;
        if (categoriaId) {
          const abertos = await listarLancamentos({
            tipo: 'pagar',
            status: 'aberto',
            categoria_id: categoriaId,
            pagina: 1,
            por_pagina: 100,
          });
          setLancamentosIndicador(abertos.data);
        } else {
          setLancamentosIndicador([]);
        }
      } else {
        setLancamentosIndicador([]);
      }
      setErro(null);
    } catch (e) {
      setErro((e as Error).message);
    } finally {
      setCarregando(false);
    }
  }, [q, tipo, status, categoriaId, de, ate, pagina, indicadorAberto]);

  useEffect(() => {
    void recarregar();
  }, [recarregar]);

  async function handleCriar(e: React.FormEvent) {
    e.preventDefault();
    try {
      setSalvando(true);
      await criarLancamento({
        tipo: form.tipo,
        descricao: form.descricao,
        valor: Number(form.valor),
        categoria_id: form.categoria_id ? Number(form.categoria_id) : undefined,
        vencimento: form.vencimento || undefined,
        fornecedor_id: form.tipo === 'pagar' && form.fornecedor_id ? Number(form.fornecedor_id) : undefined,
        cliente_id: form.tipo === 'receber' && form.cliente_id ? Number(form.cliente_id) : undefined,
      });
      setForm({ ...form, descricao: '', valor: 0 });
      setErro(null);
      await recarregar();
    } catch (err) {
      setErro((err as Error).message);
    } finally {
      setSalvando(false);
    }
  }

  async function baixar(l: FinanceiroLancamento) {
    try {
      await atualizarLancamento(l.id, { status: l.tipo === 'pagar' ? 'pago' : 'recebido' });
      setParcial(null);
      await recarregar();
    } catch (err) {
      setErro((err as Error).message);
    }
  }

  async function estornar(l: FinanceiroLancamento) {
    try {
      await atualizarLancamento(l.id, { status: 'pendente', valor_pago: 0 });
      setParcial(null);
      await recarregar();
    } catch (err) {
      setErro((err as Error).message);
    }
  }

  async function pagarParcial(l: FinanceiroLancamento, bruto: string) {
    const valor = Number(String(bruto).replace(',', '.'));
    if (!Number.isFinite(valor) || valor <= 0) {
      setErro('Informe o valor parcial pago');
      return;
    }
    try {
      await atualizarLancamento(l.id, { valor_pago: valor });
      setParcial(null);
      await recarregar();
    } catch (err) {
      setErro((err as Error).message);
    }
  }

  function acoesPagamento(l: FinanceiroLancamento) {
    const aberto = l.status === 'pendente' || l.status === 'vencido';
    const temPagamento = l.status === 'pago' || l.status === 'recebido' || (Number(l.valor_pago) || 0) > 0;
    return (
      <td className="acoes">
        {aberto ? (
          <>
            <button type="button" onClick={() => void baixar(l)}>
              {l.tipo === 'pagar' ? 'Pagar' : 'Receber'}
            </button>
            {l.tipo === 'pagar' ? (
              parcial?.id === l.id ? (
                <span className="financeiro-parcial">
                  <input
                    aria-label={`Valor parcial ${l.descricao}`}
                    type="number"
                    min={0.01}
                    step="0.01"
                    value={parcial.valor}
                    onChange={(e) => setParcial({ id: l.id, valor: e.target.value })}
                  />
                  <button type="button" onClick={() => void pagarParcial(l, parcial.valor)}>
                    Confirmar parcial
                  </button>
                </span>
              ) : (
                <button type="button" onClick={() => setParcial({ id: l.id, valor: '' })}>
                  Pagar parcial
                </button>
              )
            ) : null}
          </>
        ) : null}
        {temPagamento ? (
          <button type="button" onClick={() => void estornar(l)}>
            Estornar
          </button>
        ) : null}
      </td>
    );
  }

  return (
    <main className="app__main app__main--financeiro">
      <div className="financeiro-topo">
        <section className="kpi-grid" aria-label="Indicadores financeiros">
          <div className="kpi"><span className="kpi__label">Saldo realizado</span><strong className="kpi__valor">{moeda.format(resumo?.saldo ?? 0)}</strong></div>
          <div className="kpi"><span className="kpi__label">Contas a pagar</span><strong className="kpi__valor">{moeda.format(resumo?.contas_pagar ?? 0)}</strong></div>
          <div className="kpi"><span className="kpi__label">Contas a receber</span><strong className="kpi__valor">{moeda.format(resumo?.contas_receber ?? 0)}</strong></div>
          <div className="kpi kpi--alerta"><span className="kpi__label">Vencidos</span><strong className="kpi__valor">{moeda.format(resumo?.vencidos ?? 0)}</strong></div>
          <div className="kpi"><span className="kpi__label">Previsto</span><strong className="kpi__valor">{moeda.format(resumo?.previsto ?? 0)}</strong></div>
          <div className="kpi"><span className="kpi__label">Realizado</span><strong className="kpi__valor">{moeda.format(resumo?.realizado ?? 0)}</strong></div>
        </section>
        <section className="kpi-grid financeiro-kpis-pagar" aria-label="Contas a pagar por categoria">
          {INDICADORES_CONTAS_PAGAR.map((item) => {
            const dados = indicadorDe(resumo, item.chave);
            return (
              <button
                key={item.chave}
                type="button"
                className={indicadorAberto === item.chave ? 'kpi kpi--ativa' : 'kpi'}
                aria-label={item.label}
                onClick={() => setIndicadorAberto((atual) => (atual === item.chave ? null : item.chave))}
              >
                <span className="kpi__label">{item.label}</span>
                <strong className="kpi__valor">{carregando ? '—' : moeda.format(dados.valor)}</strong>
                <span className="kpi__dica">
                  {carregando ? '—' : `${dados.quantidade} em aberto`}
                </span>
              </button>
            );
          })}
        </section>
        {indicadorAberto ? (
          <section className="card" aria-label={`Lançamentos de ${INDICADORES_CONTAS_PAGAR.find((item) => item.chave === indicadorAberto)?.label}`}>
            <h3>{INDICADORES_CONTAS_PAGAR.find((item) => item.chave === indicadorAberto)?.label}</h3>
            {carregando ? (
              <p className="vazio">Carregando…</p>
            ) : lancamentosIndicador.length === 0 ? (
              <p className="vazio">Nenhuma conta em aberto nesta categoria.</p>
            ) : (
              <div className="liberacao-andamento__tabela">
                <table className="tabela" aria-label="Lançamentos da categoria">
                  <thead>
                    <tr>
                      <th>Descrição</th>
                      <th>Fornecedor / beneficiário</th>
                      <th>Vencimento</th>
                      <th>Valor</th>
                      <th>Status</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {lancamentosIndicador.map((l) => (
                      <tr key={l.id} aria-label={`Lançamento ${l.descricao}`}>
                        <td>{l.descricao}</td>
                        <td>{l.fornecedor || l.cliente || '—'}</td>
                        <td>{formatarDataBr(l.vencimento)}</td>
                        <td>{moeda.format(l.valor)}</td>
                        <td>
                          <span className={`pill pill--${l.status_pagamento === 'parcial' ? 'parcial' : l.status}`}>
                            {rotuloStatusLancamento(l)}
                          </span>
                        </td>
                        {acoesPagamento(l)}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        ) : null}

        {resumo && resumo.fluxo.length > 0 && (
          <section className="card">
            <h2>Fluxo de caixa</h2>
            <ul className="status-lista">
              {resumo.fluxo.map((f) => (
                <li key={f.mes}>
                  <div className="status-lista__topo">
                    <span>{f.mes}</span>
                    <strong>{moeda.format(f.saldo)}</strong>
                  </div>
                  <p className="dica">Entradas {moeda.format(f.entradas)} · Saídas {moeda.format(f.saidas)}</p>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>

      <section className="card card--wide">
        <div className="card__head">
          <h2>Lançamentos</h2>
          <span className="badge">{total}</span>
        </div>
        <div className="filtros filtros--financeiro">
          <input value={q} onChange={(e) => { setQ(e.target.value); setPagina(1); }} placeholder="Buscar descrição, fornecedor, cliente…" aria-label="Buscar lançamentos" />
          <select value={tipo} onChange={(e) => { setTipo(e.target.value); setPagina(1); }} aria-label="Tipo">
            <option value="">Todos</option>
            {TIPOS_LANCAMENTO.map((t) => <option key={t} value={t}>{TIPO_LANCAMENTO_LABEL[t]}</option>)}
          </select>
          <select value={status} onChange={(e) => { setStatus(e.target.value); setPagina(1); }} aria-label="Status">
            <option value="">Todos os status</option>
            {STATUS_LANCAMENTO.map((s) => <option key={s} value={s}>{STATUS_LANCAMENTO_LABEL[s]}</option>)}
          </select>
          <select value={categoriaId} onChange={(e) => { setCategoriaId(e.target.value); setPagina(1); }} aria-label="Categoria">
            <option value="">Todas as categorias</option>
            {categorias.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
          </select>
          <input type="date" value={de} onChange={(e) => setDe(e.target.value)} aria-label="De" />
          <input type="date" value={ate} onChange={(e) => setAte(e.target.value)} aria-label="Até" />
        </div>
        {erro && <p className="erro">{erro}</p>}
        {carregando ? <p className="vazio">Carregando…</p> : lancamentos.length === 0 ? (
          <p className="vazio">Nenhum lançamento no período.</p>
        ) : (
          <table className="tabela">
            <thead>
              <tr>
                <th>Descrição</th>
                <th>Tipo</th>
                <th>Categoria</th>
                <th>Vencimento</th>
                <th>Valor</th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {lancamentos.map((l) => (
                <tr key={l.id}>
                  <td>
                    {l.descricao}
                    <div className="dica">{l.fornecedor || l.cliente || l.compra_codigo}</div>
                  </td>
                  <td>{TIPO_LANCAMENTO_LABEL[l.tipo]}</td>
                  <td>{l.categoria ?? '—'}</td>
                  <td>{l.vencimento ? l.vencimento.slice(0, 10).split('-').reverse().join('/') : '—'}</td>
                  <td>{moeda.format(l.valor)}</td>
                  <td>
                    <span className={`pill pill--${l.status_pagamento === 'parcial' ? 'parcial' : l.status}`}>
                      {rotuloStatusLancamento(l)}
                    </span>
                  </td>
                  {acoesPagamento(l)}
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <div className="paginacao">
          <span>{total} lançamento{total === 1 ? '' : 's'}</span>
          <div>
            <button type="button" disabled={pagina <= 1} onClick={() => setPagina((p) => p - 1)}>Anterior</button>
            <span>Página {pagina} de {totalPaginas}</span>
            <button type="button" disabled={pagina >= totalPaginas} onClick={() => setPagina((p) => p + 1)}>Próxima</button>
          </div>
        </div>
      </section>

      <section className="card">
        <h2>Novo lançamento</h2>
        <form className="form" onSubmit={(e) => void handleCriar(e)}>
          <label>
            Tipo
            <select value={form.tipo} onChange={(e) => setForm({ ...form, tipo: e.target.value as TipoLancamento })}>
              {TIPOS_LANCAMENTO.map((t) => <option key={t} value={t}>{TIPO_LANCAMENTO_LABEL[t]}</option>)}
            </select>
          </label>
          <label>Descrição<input required value={form.descricao} onChange={(e) => setForm({ ...form, descricao: e.target.value })} /></label>
          <label>Valor<input required type="number" min={0.01} step={0.01} value={form.valor} onChange={(e) => setForm({ ...form, valor: Number(e.target.value) })} /></label>
          <label>
            Categoria
            <select value={form.categoria_id} onChange={(e) => setForm({ ...form, categoria_id: e.target.value })}>
              <option value="">Sem categoria</option>
              {categorias.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
            </select>
          </label>
          <label>Vencimento<input type="date" value={form.vencimento} onChange={(e) => setForm({ ...form, vencimento: e.target.value })} /></label>
          {form.tipo === 'pagar' ? (
            <label>
              Fornecedor
              <select value={form.fornecedor_id} onChange={(e) => setForm({ ...form, fornecedor_id: e.target.value })}>
                <option value="">Opcional</option>
                {fornecedores.map((f) => <option key={f.id} value={f.id}>{f.nome}</option>)}
              </select>
            </label>
          ) : (
            <label>
              Cliente
              <select value={form.cliente_id} onChange={(e) => setForm({ ...form, cliente_id: e.target.value })}>
                <option value="">Opcional</option>
                {clientes.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
              </select>
            </label>
          )}
          <button type="submit" disabled={salvando}>{salvando ? 'Salvando…' : 'Lançar'}</button>
        </form>
      </section>
    </main>
  );
}
