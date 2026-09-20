import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  PRIORIDADE_OP_LABEL,
  PRIORIDADES_OP,
  STATUS_OP_LABEL,
  STATUS_VALIDOS,
  atualizarOrdem,
  atualizarStatus,
  criarOrdem,
  listarClientes,
  listarMateriasPrimas,
  listarOrdensPaginado,
  listarProdutos,
  obterFichaTecnica,
  obterOrdem,
  removerOrdem,
  type Cliente,
  type MateriaPrima,
  type OrdemProducao,
  type PrioridadeOp,
  type Produto,
  type Status,
  type AssinaturaEmpresa,
} from './api';
import { AvisoLimite, podeCriarNoPlano } from './AvisoLimite';

type ModoPainel = 'criar' | 'editar' | 'detalhe' | null;

type ReqLinha = { materia_prima_id: string; quantidade: number };

const FORM_VAZIO = {
  clienteId: '',
  produtoId: '',
  varianteId: '',
  quantidade: 1,
  prioridade: 'normal' as PrioridadeOp,
  data_prevista: '',
  responsavel: '',
  observacoes: '',
  requisitos: [] as ReqLinha[],
};

const STATUS_NOVOS: Status[] = [
  'planejada',
  'corte',
  'costura',
  'acabamento',
  'qualidade',
  'embalagem',
  'concluida',
  'cancelada',
];

function formatarData(valor: string | null): string {
  if (!valor) return '—';
  const d = valor.slice(0, 10);
  const [y, m, day] = d.split('-');
  if (!y || !m || !day) return valor;
  return `${day}/${m}/${y}`;
}

export function OrdensPage({ sessao }: { sessao: { assinatura: AssinaturaEmpresa } }) {
  const [ordens, setOrdens] = useState<OrdemProducao[]>([]);
  const [pagina, setPagina] = useState(1);
  const [totalPaginas, setTotalPaginas] = useState(1);
  const [total, setTotal] = useState(0);
  const [q, setQ] = useState('');
  const [qDebounced, setQDebounced] = useState('');
  const [statusFiltro, setStatusFiltro] = useState('');
  const [prioridadeFiltro, setPrioridadeFiltro] = useState('');
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [modo, setModo] = useState<ModoPainel>(null);
  const [form, setForm] = useState(FORM_VAZIO);
  const [editandoId, setEditandoId] = useState<number | null>(null);
  const [detalhe, setDetalhe] = useState<OrdemProducao | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [produtos, setProdutos] = useState<Produto[]>([]);
  const [materias, setMaterias] = useState<MateriaPrima[]>([]);

  useEffect(() => {
    const t = setTimeout(() => {
      setQDebounced(q);
      setPagina(1);
    }, 300);
    return () => clearTimeout(t);
  }, [q]);

  useEffect(() => {
    setPagina(1);
  }, [statusFiltro, prioridadeFiltro]);

  useEffect(() => {
    listarClientes({ por_pagina: 100, status: 'ativo' })
      .then((lista) => setClientes(lista.data))
      .catch(() => undefined);
    listarProdutos({ por_pagina: 100, status: 'ativo' })
      .then((lista) => setProdutos(lista.data))
      .catch(() => undefined);
    listarMateriasPrimas({ por_pagina: 100, status: 'ativo' })
      .then((lista) => setMaterias(lista.data))
      .catch(() => undefined);
  }, []);

  const recarregar = useCallback(async () => {
    try {
      setCarregando(true);
      const lista = await listarOrdensPaginado({
        q: qDebounced,
        status: statusFiltro,
        prioridade: prioridadeFiltro,
        pagina,
        por_pagina: 8,
      });
      setOrdens(lista.data);
      setTotal(lista.total);
      setTotalPaginas(lista.total_paginas);
      setErro(null);
    } catch (e) {
      setErro((e as Error).message);
    } finally {
      setCarregando(false);
    }
  }, [qDebounced, statusFiltro, prioridadeFiltro, pagina]);

  useEffect(() => {
    recarregar();
  }, [recarregar]);

  const produtoSel = useMemo(
    () => produtos.find((p) => String(p.id) === form.produtoId),
    [produtos, form.produtoId],
  );

  useEffect(() => {
    if (modo !== 'criar' || !form.produtoId) return;
    const produtoId = Number(form.produtoId);
    const varianteId = form.varianteId ? Number(form.varianteId) : undefined;
    obterFichaTecnica(produtoId, varianteId)
      .then((ficha) => {
        setForm((atual) => {
          if (String(atual.produtoId) !== String(produtoId)) return atual;
          if ((atual.varianteId || '') !== (varianteId ? String(varianteId) : '')) return atual;
          if (atual.requisitos.length) return atual;
          return {
            ...atual,
            requisitos: ficha.itens.map((i) => ({
              materia_prima_id: String(i.materia_prima_id),
              quantidade: i.quantidade,
            })),
          };
        });
      })
      .catch(() => undefined);
  }, [modo, form.produtoId, form.varianteId]);

  function abrirCriar() {
    if (!podeCriarNoPlano(sessao.assinatura, 'ordens_mes')) return;
    setForm(FORM_VAZIO);
    setEditandoId(null);
    setDetalhe(null);
    setModo('criar');
    setErro(null);
  }

  async function abrirDetalhe(id: number) {
    const ordem = await obterOrdem(id);
    setDetalhe(ordem);
    setEditandoId(null);
    setModo('detalhe');
  }

  async function abrirEditar(id: number) {
    const ordem = await obterOrdem(id);
    setForm({
      clienteId: ordem.cliente_id ? String(ordem.cliente_id) : '',
      produtoId: ordem.produto_id ? String(ordem.produto_id) : '',
      varianteId: ordem.variante_id ? String(ordem.variante_id) : '',
      quantidade: ordem.quantidade,
      prioridade: ordem.prioridade || 'normal',
      data_prevista: ordem.data_prevista ? ordem.data_prevista.slice(0, 10) : '',
      responsavel: ordem.responsavel ?? '',
      observacoes: ordem.observacoes ?? '',
      requisitos: (ordem.requisitos ?? []).map((r) => ({
        materia_prima_id: String(r.materia_prima_id),
        quantidade: r.quantidade_unitaria ?? r.quantidade ?? 1,
      })),
    });
    setEditandoId(id);
    setDetalhe(null);
    setModo('editar');
  }

  function payloadDoForm() {
    const cliente = clientes.find((c) => String(c.id) === form.clienteId);
    const produto = produtos.find((p) => String(p.id) === form.produtoId);
    const variante = produto?.variantes.find((v) => String(v.id) === form.varianteId);
    const requisitos = form.requisitos
      .filter((r) => r.materia_prima_id)
      .map((r) => ({
        materia_prima_id: Number(r.materia_prima_id),
        quantidade: Number(r.quantidade),
      }));
    return {
      cliente: cliente?.nome ?? '',
      produto: produto?.nome ?? '',
      tamanho: variante?.tamanho ?? (produto && produto.variantes.length === 0 ? 'U' : ''),
      quantidade: Number(form.quantidade),
      cliente_id: form.clienteId ? Number(form.clienteId) : undefined,
      produto_id: form.produtoId ? Number(form.produtoId) : undefined,
      variante_id: form.varianteId ? Number(form.varianteId) : undefined,
      prioridade: form.prioridade,
      data_prevista: form.data_prevista || undefined,
      responsavel: form.responsavel,
      observacoes: form.observacoes,
      requisitos,
    };
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    try {
      setSalvando(true);
      const dados = payloadDoForm();
      if (editandoId) {
        await atualizarOrdem(editandoId, dados);
      } else {
        await criarOrdem({ ...dados, status: 'planejada' });
      }
      setForm(FORM_VAZIO);
      setModo(null);
      setEditandoId(null);
      setErro(null);
      await recarregar();
    } catch (err) {
      setErro((err as Error).message);
    } finally {
      setSalvando(false);
    }
  }

  async function handleStatus(id: number, status: Status) {
    try {
      await atualizarStatus(id, status);
      if (detalhe?.id === id) setDetalhe(await obterOrdem(id));
      await recarregar();
    } catch (err) {
      setErro((err as Error).message);
    }
  }

  async function handleRemover(id: number) {
    if (!window.confirm('Excluir esta ordem de produção?')) return;
    try {
      await removerOrdem(id);
      if (detalhe?.id === id || editandoId === id) {
        setDetalhe(null);
        setModo(null);
        setEditandoId(null);
      }
      await recarregar();
    } catch (err) {
      setErro((err as Error).message);
    }
  }

  const statusesSelect = (atual?: Status) => {
    const base = [...STATUS_NOVOS];
    if (atual && !base.includes(atual)) base.unshift(atual);
    return base;
  };

  return (
    <main className="app__main app__main--ordens">
      <section className="card card--wide">
        <div className="card__head">
          <h2>Ordens de produção</h2>
          <div className="card__head-acoes">
            <span className="badge">
              {total} OP{total === 1 ? '' : 's'}
            </span>
            <button
              type="button"
              className="btn-secundario"
              onClick={abrirCriar}
              disabled={!podeCriarNoPlano(sessao.assinatura, 'ordens_mes')}
            >
              Nova OP
            </button>
          </div>
        </div>
        <AvisoLimite assinatura={sessao.assinatura} chave="ordens_mes" />

        <div className="filtros filtros--ordens">
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar código, cliente, produto…"
            aria-label="Buscar ordens"
          />
          <select
            value={statusFiltro}
            onChange={(e) => setStatusFiltro(e.target.value)}
            aria-label="Filtrar status"
          >
            <option value="">Todos os status</option>
            {STATUS_VALIDOS.map((s) => (
              <option key={s} value={s}>
                {STATUS_OP_LABEL[s]}
              </option>
            ))}
          </select>
          <select
            value={prioridadeFiltro}
            onChange={(e) => setPrioridadeFiltro(e.target.value)}
            aria-label="Filtrar prioridade"
          >
            <option value="">Todas as prioridades</option>
            {PRIORIDADES_OP.map((p) => (
              <option key={p} value={p}>
                {PRIORIDADE_OP_LABEL[p]}
              </option>
            ))}
          </select>
        </div>

        {erro && <p className="erro">{erro}</p>}

        {carregando ? (
          <p className="vazio">Carregando…</p>
        ) : ordens.length === 0 ? (
          <p className="vazio">Nenhuma ordem de produção. Crie a primeira ao lado.</p>
        ) : (
          <table className="tabela">
            <thead>
              <tr>
                <th>Código</th>
                <th>Cliente</th>
                <th>Produto</th>
                <th>Qtd.</th>
                <th>Prioridade</th>
                <th>Previsão</th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {ordens.map((o) => (
                <tr key={o.id}>
                  <td>{o.codigo ?? `OP-${o.id}`}</td>
                  <td>{o.cliente}</td>
                  <td>
                    {o.produto}
                    <div className="dica">
                      {o.tamanho}
                      {o.variante_id ? '' : ''}
                    </div>
                  </td>
                  <td>{o.quantidade}</td>
                  <td>{PRIORIDADE_OP_LABEL[o.prioridade] ?? o.prioridade}</td>
                  <td>{formatarData(o.data_prevista)}</td>
                  <td>
                    <select
                      className={`status status--${o.status}`}
                      value={o.status}
                      aria-label={`Status da OP ${o.codigo ?? o.id}`}
                      onChange={(e) => handleStatus(o.id, e.target.value as Status)}
                    >
                      {statusesSelect(o.status).map((s) => (
                        <option key={s} value={s}>
                          {STATUS_OP_LABEL[s]}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="acoes">
                    <button type="button" onClick={() => abrirDetalhe(o.id)}>
                      Ver
                    </button>
                    <button type="button" onClick={() => abrirEditar(o.id)}>
                      Editar
                    </button>
                    <button
                      type="button"
                      className="btn-remover-texto"
                      onClick={() => handleRemover(o.id)}
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

      {modo === 'criar' || modo === 'editar' ? (
        <section className="card">
          <div className="card__head">
            <h2>{modo === 'editar' ? 'Editar OP' : 'Nova ordem de produção'}</h2>
            <button type="button" className="btn-fechar" onClick={() => setModo(null)}>
              ×
            </button>
          </div>
          <form className="form" onSubmit={handleSubmit}>
            <label>
              Cliente
              <select
                required
                value={form.clienteId}
                onChange={(e) => setForm({ ...form, clienteId: e.target.value })}
              >
                <option value="">Selecione</option>
                {clientes.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nome}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Produto
              <select
                required
                value={form.produtoId}
                onChange={(e) =>
                  setForm({ ...form, produtoId: e.target.value, varianteId: '', requisitos: [] })
                }
              >
                <option value="">Selecione</option>
                {produtos.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.sku ? `${p.sku} — ` : ''}
                    {p.nome}
                  </option>
                ))}
              </select>
            </label>
            {produtoSel && produtoSel.variantes.length > 0 && (
              <label>
                Variante
                <select
                  required
                  value={form.varianteId}
                  onChange={(e) =>
                    setForm({ ...form, varianteId: e.target.value, requisitos: [] })
                  }
                >
                  <option value="">Selecione</option>
                  {produtoSel.variantes.map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.sku} — {v.cor} / {v.tamanho}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <div className="form__row">
              <label>
                Quantidade
                <input
                  required
                  type="number"
                  min={1}
                  step={1}
                  value={form.quantidade}
                  onChange={(e) =>
                    setForm({ ...form, quantidade: Number(e.target.value) })
                  }
                />
              </label>
              <label>
                Prioridade
                <select
                  value={form.prioridade}
                  onChange={(e) =>
                    setForm({ ...form, prioridade: e.target.value as PrioridadeOp })
                  }
                >
                  {PRIORIDADES_OP.map((p) => (
                    <option key={p} value={p}>
                      {PRIORIDADE_OP_LABEL[p]}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <div className="form__row">
              <label>
                Data prevista
                <input
                  type="date"
                  value={form.data_prevista}
                  onChange={(e) => setForm({ ...form, data_prevista: e.target.value })}
                />
              </label>
              <label>
                Responsável
                <input
                  value={form.responsavel}
                  onChange={(e) => setForm({ ...form, responsavel: e.target.value })}
                  placeholder="Operador ou setor"
                />
              </label>
            </div>
            <label>
              Observações
              <textarea
                rows={2}
                value={form.observacoes}
                onChange={(e) => setForm({ ...form, observacoes: e.target.value })}
              />
            </label>

            <h3 className="subtitulo">Requisitos de material (BOM)</h3>
            <p className="dica">Quantidade por peça. O total usa a quantidade da OP. O estoque é consultado ao avançar para corte.</p>
            {form.requisitos.map((linha, idx) => (
              <div className="form__row" key={idx}>
                <label>
                  Matéria-prima
                  <select
                    value={linha.materia_prima_id}
                    onChange={(e) => {
                      const requisitos = [...form.requisitos];
                      requisitos[idx] = { ...linha, materia_prima_id: e.target.value };
                      setForm({ ...form, requisitos });
                    }}
                  >
                    <option value="">Selecione</option>
                    {materias.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.codigo ? `${m.codigo} — ` : ''}
                        {m.nome}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Qtd. por peça
                  <input
                    type="number"
                    min={0.01}
                    step="0.01"
                    value={linha.quantidade}
                    onChange={(e) => {
                      const requisitos = [...form.requisitos];
                      requisitos[idx] = { ...linha, quantidade: Number(e.target.value) };
                      setForm({ ...form, requisitos });
                    }}
                  />
                </label>
              </div>
            ))}
            <button
              type="button"
              className="btn-secundario"
              onClick={() =>
                setForm({
                  ...form,
                  requisitos: [...form.requisitos, { materia_prima_id: '', quantidade: 1 }],
                })
              }
            >
              Adicionar material
            </button>

            <button type="submit" disabled={salvando}>
              {salvando ? 'Salvando…' : modo === 'editar' ? 'Salvar alterações' : 'Criar OP'}
            </button>
          </form>
        </section>
      ) : detalhe ? (
        <section className="card">
          <div className="card__head">
            <h2>{detalhe.codigo ?? `OP ${detalhe.id}`}</h2>
            <button type="button" className="btn-fechar" onClick={() => setDetalhe(null)}>
              ×
            </button>
          </div>
          <dl className="detalhe">
            <div>
              <dt>Cliente</dt>
              <dd>{detalhe.cliente}</dd>
            </div>
            <div>
              <dt>Produto</dt>
              <dd>
                {detalhe.produto} · {detalhe.tamanho}
              </dd>
            </div>
            <div>
              <dt>Quantidade</dt>
              <dd>{detalhe.quantidade}</dd>
            </div>
            <div>
              <dt>Prioridade</dt>
              <dd>{PRIORIDADE_OP_LABEL[detalhe.prioridade] ?? detalhe.prioridade}</dd>
            </div>
            <div>
              <dt>Previsão</dt>
              <dd>{formatarData(detalhe.data_prevista)}</dd>
            </div>
            <div>
              <dt>Responsável</dt>
              <dd>{detalhe.responsavel ?? '—'}</dd>
            </div>
            <div>
              <dt>Status</dt>
              <dd>{STATUS_OP_LABEL[detalhe.status]}</dd>
            </div>
            <div>
              <dt>Observações</dt>
              <dd>{detalhe.observacoes ?? '—'}</dd>
            </div>
          </dl>
          <label>
            Alterar status
            <select
              className={`status status--${detalhe.status}`}
              value={detalhe.status}
              onChange={(e) => handleStatus(detalhe.id, e.target.value as Status)}
            >
              {statusesSelect(detalhe.status).map((s) => (
                <option key={s} value={s}>
                  {STATUS_OP_LABEL[s]}
                </option>
              ))}
            </select>
          </label>
          <h3 className="subtitulo">Materiais da OP</h3>
          {!detalhe.requisitos?.length ? (
            <p className="dica">Sem BOM vinculado a este produto/variante.</p>
          ) : (
            <table className="tabela tabela--compacta">
              <thead>
                <tr>
                  <th>Material</th>
                  <th>Total</th>
                  <th>Estoque</th>
                </tr>
              </thead>
              <tbody>
                {detalhe.requisitos.map((r) => (
                  <tr key={r.id ?? r.materia_prima_id}>
                    <td>
                      {r.codigo ? `${r.codigo} — ` : ''}
                      {r.nome}
                    </td>
                    <td>
                      {r.quantidade_total} {r.unidade}
                    </td>
                    <td>
                      <span className={r.suficiente ? 'pill pill--ativo' : 'pill pill--inativo'}>
                        {r.estoque_disponivel} {r.unidade}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <div className="detalhe__acoes">
            <button type="button" onClick={() => abrirEditar(detalhe.id)}>
              Editar
            </button>
            <button
              type="button"
              className="btn-remover-texto"
              onClick={() => handleRemover(detalhe.id)}
            >
              Excluir
            </button>
          </div>
        </section>
      ) : (
        <section className="card">
          <h2>Detalhe da OP</h2>
          <p className="dica">Selecione uma ordem na lista ou clique em Nova OP.</p>
        </section>
      )}
    </main>
  );
}
