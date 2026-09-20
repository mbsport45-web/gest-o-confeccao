import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  PRIORIDADE_OP_LABEL,
  PRIORIDADES_OP,
  STATUS_OP_LABEL,
  STATUS_PEDIDO,
  STATUS_PEDIDO_LABEL,
  atualizarPedido,
  criarPedido,
  gerarFinanceiroPedido,
  gerarOpPedido,
  listarClientes,
  listarPedidos,
  listarProdutos,
  obterPedido,
  type Cliente,
  type PedidoItemVenda,
  type PedidoVenda,
  type Produto,
  type StatusPedido,
} from './api';

const moeda = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });

type Modo = 'criar' | 'editar' | 'detalhe' | null;
type ItemForm = {
  produto_id: string;
  variante_id: string;
  quantidade: number;
  preco_unitario: number;
  desconto: number;
};

const FORM_VAZIO = {
  cliente_id: '',
  data_pedido: '',
  data_prevista: '',
  prioridade: 'normal',
  desconto: 0,
  frete: 0,
  observacoes: '',
  itens: [{ produto_id: '', variante_id: '', quantidade: 1, preco_unitario: 0, desconto: 0 }] as ItemForm[],
};

function formatarData(valor: string | null | undefined): string {
  if (!valor) return '—';
  const [y, m, d] = valor.slice(0, 10).split('-');
  if (!y || !m || !d) return valor;
  return `${d}/${m}/${y}`;
}

export function PedidosPage({ onAbrirOp }: { onAbrirOp?: (id: number) => void }) {
  const [pedidos, setPedidos] = useState<PedidoVenda[]>([]);
  const [pagina, setPagina] = useState(1);
  const [totalPaginas, setTotalPaginas] = useState(1);
  const [total, setTotal] = useState(0);
  const [valorTotal, setValorTotal] = useState(0);
  const [q, setQ] = useState('');
  const [qDebounced, setQDebounced] = useState('');
  const [statusFiltro, setStatusFiltro] = useState('');
  const [prioridadeFiltro, setPrioridadeFiltro] = useState('');
  const [clienteFiltro, setClienteFiltro] = useState('');
  const [de, setDe] = useState('');
  const [ate, setAte] = useState('');
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [modo, setModo] = useState<Modo>(null);
  const [form, setForm] = useState(FORM_VAZIO);
  const [detalhe, setDetalhe] = useState<PedidoVenda | null>(null);
  const [editandoId, setEditandoId] = useState<number | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [produtos, setProdutos] = useState<Produto[]>([]);

  useEffect(() => {
    const t = setTimeout(() => {
      setQDebounced(q);
      setPagina(1);
    }, 300);
    return () => clearTimeout(t);
  }, [q]);

  useEffect(() => {
    setPagina(1);
  }, [statusFiltro, prioridadeFiltro, clienteFiltro, de, ate]);

  useEffect(() => {
    listarClientes({ por_pagina: 100 }).then((l) => setClientes(l.data)).catch(() => undefined);
    listarProdutos({ por_pagina: 100 }).then((l) => setProdutos(l.data)).catch(() => undefined);
  }, []);

  const recarregar = useCallback(async () => {
    try {
      setCarregando(true);
      const lista = await listarPedidos({
        q: qDebounced,
        status: statusFiltro,
        prioridade: prioridadeFiltro,
        cliente_id: clienteFiltro ? Number(clienteFiltro) : undefined,
        de: de || undefined,
        ate: ate || undefined,
        pagina,
        por_pagina: 10,
      });
      setPedidos(lista.data);
      setTotal(lista.total);
      setTotalPaginas(lista.total_paginas);
      setValorTotal(lista.totais?.valor ?? 0);
      setErro(null);
    } catch (e) {
      setErro((e as Error).message);
    } finally {
      setCarregando(false);
    }
  }, [qDebounced, statusFiltro, prioridadeFiltro, clienteFiltro, de, ate, pagina]);

  useEffect(() => {
    void recarregar();
  }, [recarregar]);

  const totaisForm = useMemo(() => {
    const subtotal = form.itens.reduce(
      (acc, i) => acc + Math.max(0, i.quantidade * i.preco_unitario - i.desconto),
      0,
    );
    const desconto = Math.min(form.desconto, subtotal);
    return {
      subtotal,
      total: subtotal - desconto + Number(form.frete || 0),
    };
  }, [form]);

  function produtoDe(id: string) {
    return produtos.find((p) => p.id === Number(id));
  }

  function atualizarItem(idx: number, patch: Partial<ItemForm>) {
    const itens = [...form.itens];
    itens[idx] = { ...itens[idx], ...patch };
    if (patch.produto_id) {
      const prod = produtoDe(patch.produto_id);
      const primeira = prod?.variantes[0];
      itens[idx].variante_id = primeira ? String(primeira.id) : '';
      itens[idx].preco_unitario = primeira?.preco_venda ?? prod?.preco_venda ?? 0;
    }
    if (patch.variante_id) {
      const prod = produtoDe(itens[idx].produto_id);
      const v = prod?.variantes.find((x) => x.id === Number(patch.variante_id));
      if (v?.preco_venda != null) itens[idx].preco_unitario = v.preco_venda;
    }
    setForm({ ...form, itens });
  }

  function payload() {
    return {
      cliente_id: Number(form.cliente_id),
      data_pedido: form.data_pedido || undefined,
      data_prevista: form.data_prevista || undefined,
      prioridade: form.prioridade as PedidoVenda['prioridade'],
      observacoes: form.observacoes || undefined,
      desconto: Number(form.desconto) || 0,
      frete: Number(form.frete) || 0,
      itens: form.itens
        .filter((i) => i.produto_id)
        .map((i) => ({
          produto_id: Number(i.produto_id),
          variante_id: i.variante_id ? Number(i.variante_id) : undefined,
          quantidade: Number(i.quantidade),
          preco_unitario: Number(i.preco_unitario),
          desconto: Number(i.desconto) || 0,
        })),
    };
  }

  async function handleSalvar(e: React.FormEvent) {
    e.preventDefault();
    try {
      setSalvando(true);
      if (modo === 'editar' && editandoId) {
        await atualizarPedido(editandoId, payload());
      } else {
        await criarPedido(payload());
      }
      setForm(FORM_VAZIO);
      setModo(null);
      setEditandoId(null);
      await recarregar();
    } catch (err) {
      setErro((err as Error).message);
    } finally {
      setSalvando(false);
    }
  }

  async function abrirDetalhe(id: number) {
    try {
      const p = await obterPedido(id);
      setDetalhe(p);
      setModo('detalhe');
      setErro(null);
    } catch (err) {
      setErro((err as Error).message);
    }
  }

  function abrirEdicao(p: PedidoVenda) {
    const itens = (p.itens ?? []).map((i) => ({
      produto_id: String(i.produto_id),
      variante_id: i.variante_id ? String(i.variante_id) : '',
      quantidade: i.quantidade,
      preco_unitario: i.preco_unitario,
      desconto: i.desconto,
    }));
    setForm({
      cliente_id: String(p.cliente_id),
      data_pedido: p.data_pedido?.slice(0, 10) ?? '',
      data_prevista: p.data_prevista?.slice(0, 10) ?? '',
      prioridade: p.prioridade,
      desconto: p.desconto,
      frete: p.frete,
      observacoes: p.observacoes ?? '',
      itens: itens.length ? itens : FORM_VAZIO.itens,
    });
    setEditandoId(p.id);
    setModo('editar');
  }

  async function acao(
    fn: () => Promise<PedidoVenda>,
  ) {
    try {
      setSalvando(true);
      const p = await fn();
      setDetalhe(p);
      setModo('detalhe');
      await recarregar();
    } catch (err) {
      setErro((err as Error).message);
    } finally {
      setSalvando(false);
    }
  }

  const editavel = detalhe && (detalhe.status === 'orcamento' || detalhe.status === 'aberto');
  const podeConfirmar = detalhe && (detalhe.status === 'orcamento' || detalhe.status === 'aberto');
  const podeGerarOp = detalhe && ['confirmado', 'em_producao', 'pronto'].includes(detalhe.status);
  const podeFinanceiro =
    detalhe &&
    !detalhe.financeiro &&
    ['confirmado', 'em_producao', 'pronto', 'faturado', 'entregue'].includes(detalhe.status);
  const podeCancelar =
    detalhe && !['entregue', 'cancelado'].includes(detalhe.status);

  return (
    <main className="app__main app__main--pedidos">
      <section className="card card--wide">
        <div className="card__head">
          <h2>Pedidos</h2>
          <div className="card__head-acoes">
            <span className="badge">
              {total} pedido{total === 1 ? '' : 's'} · {moeda.format(valorTotal)}
            </span>
            <button
              type="button"
              className="btn-secundario"
              onClick={() => {
                setForm(FORM_VAZIO);
                setEditandoId(null);
                setModo('criar');
              }}
            >
              Novo pedido
            </button>
          </div>
        </div>

        <div className="filtros filtros--pedidos">
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar código, cliente ou produto…"
            aria-label="Buscar pedidos"
          />
          <select value={statusFiltro} onChange={(e) => setStatusFiltro(e.target.value)} aria-label="Filtrar status">
            <option value="">Todos os status</option>
            {STATUS_PEDIDO.map((s) => (
              <option key={s} value={s}>{STATUS_PEDIDO_LABEL[s]}</option>
            ))}
          </select>
          <select
            value={prioridadeFiltro}
            onChange={(e) => setPrioridadeFiltro(e.target.value)}
            aria-label="Filtrar prioridade"
          >
            <option value="">Todas as prioridades</option>
            {PRIORIDADES_OP.map((p) => (
              <option key={p} value={p}>{PRIORIDADE_OP_LABEL[p]}</option>
            ))}
          </select>
          <select
            value={clienteFiltro}
            onChange={(e) => setClienteFiltro(e.target.value)}
            aria-label="Filtrar cliente"
          >
            <option value="">Todos os clientes</option>
            {clientes.map((c) => (
              <option key={c.id} value={c.id}>{c.nome}</option>
            ))}
          </select>
          <input type="date" value={de} onChange={(e) => setDe(e.target.value)} aria-label="Data inicial" />
          <input type="date" value={ate} onChange={(e) => setAte(e.target.value)} aria-label="Data final" />
        </div>

        {erro && <p className="erro">{erro}</p>}
        {carregando ? (
          <p className="vazio">Carregando…</p>
        ) : pedidos.length === 0 ? (
          <p className="vazio">Nenhum pedido. Cadastre um cliente e crie o primeiro pedido de venda.</p>
        ) : (
          <table className="tabela">
            <thead>
              <tr>
                <th>Código</th>
                <th>Cliente</th>
                <th>Data</th>
                <th>Produtos</th>
                <th>Qtd.</th>
                <th>Total</th>
                <th>Prioridade</th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {pedidos.map((p) => (
                <tr key={p.id}>
                  <td>{p.codigo}</td>
                  <td>{p.cliente}</td>
                  <td>{formatarData(p.data_pedido)}</td>
                  <td>{p.produtos ?? '—'}</td>
                  <td>{p.quantidade ?? 0}</td>
                  <td>{moeda.format(p.total)}</td>
                  <td>{PRIORIDADE_OP_LABEL[p.prioridade] ?? p.prioridade}</td>
                  <td><span className={`pill pill--${p.status}`}>{STATUS_PEDIDO_LABEL[p.status]}</span></td>
                  <td className="acoes">
                    <button type="button" onClick={() => void abrirDetalhe(p.id)}>Ver</button>
                    {(p.status === 'orcamento' || p.status === 'aberto') && (
                      <button type="button" onClick={() => void obterPedido(p.id).then(abrirEdicao)}>
                        Editar
                      </button>
                    )}
                    {p.status === 'confirmado' && (
                      <button type="button" onClick={() => void acao(() => gerarOpPedido(p.id))}>
                        Gerar OP
                      </button>
                    )}
                    {p.status !== 'cancelado' && p.status !== 'entregue' && (
                      <button
                        type="button"
                        className="btn-remover-texto"
                        onClick={() => void acao(() => atualizarPedido(p.id, { status: 'cancelado' as StatusPedido }))}
                      >
                        Cancelar
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
            <button type="button" disabled={pagina <= 1} onClick={() => setPagina((p) => p - 1)}>Anterior</button>
            <span>Página {pagina} de {totalPaginas}</span>
            <button type="button" disabled={pagina >= totalPaginas} onClick={() => setPagina((p) => p + 1)}>Próxima</button>
          </div>
        </div>
      </section>

      {(modo === 'criar' || modo === 'editar') && (
        <section className="card">
          <div className="card__head">
            <h2>{modo === 'editar' ? 'Editar pedido' : 'Novo pedido'}</h2>
            <button type="button" className="btn-fechar" onClick={() => setModo(null)}>×</button>
          </div>
          <form className="form" onSubmit={(e) => void handleSalvar(e)}>
            <label>
              Cliente
              <select required value={form.cliente_id} onChange={(e) => setForm({ ...form, cliente_id: e.target.value })}>
                <option value="">Selecione</option>
                {clientes.map((c) => (
                  <option key={c.id} value={c.id}>{c.nome}</option>
                ))}
              </select>
            </label>
            <div className="form__row">
              <label>Data<input type="date" value={form.data_pedido} onChange={(e) => setForm({ ...form, data_pedido: e.target.value })} /></label>
              <label>Previsão de entrega<input type="date" value={form.data_prevista} onChange={(e) => setForm({ ...form, data_prevista: e.target.value })} /></label>
            </div>
            <label>
              Prioridade
              <select value={form.prioridade} onChange={(e) => setForm({ ...form, prioridade: e.target.value })}>
                {PRIORIDADES_OP.map((p) => (
                  <option key={p} value={p}>{PRIORIDADE_OP_LABEL[p]}</option>
                ))}
              </select>
            </label>
            <div className="form__row">
              <label>Desconto<input type="number" min={0} step={0.01} value={form.desconto} onChange={(e) => setForm({ ...form, desconto: Number(e.target.value) })} /></label>
              <label>Frete<input type="number" min={0} step={0.01} value={form.frete} onChange={(e) => setForm({ ...form, frete: Number(e.target.value) })} /></label>
            </div>
            <p className="subtitulo">Itens</p>
            {form.itens.map((item, idx) => {
              const prod = produtoDe(item.produto_id);
              const variantes = prod?.variantes ?? [];
              const linha = Math.max(0, item.quantidade * item.preco_unitario - item.desconto);
              return (
                <div className="form__row" key={idx}>
                  <label>
                    Produto
                    <select
                      required
                      value={item.produto_id}
                      onChange={(e) => atualizarItem(idx, { produto_id: e.target.value })}
                    >
                      <option value="">Selecione</option>
                      {produtos.map((p) => (
                        <option key={p.id} value={p.id}>{p.nome}</option>
                      ))}
                    </select>
                  </label>
                  {variantes.length > 0 && (
                    <label>
                      Variante
                      <select
                        required
                        value={item.variante_id}
                        onChange={(e) => atualizarItem(idx, { variante_id: e.target.value })}
                      >
                        <option value="">Selecione</option>
                        {variantes.map((v) => (
                          <option key={v.id} value={v.id}>{v.cor} / {v.tamanho}</option>
                        ))}
                      </select>
                    </label>
                  )}
                  <label>
                    Qtd.
                    <input type="number" min={1} step={1} value={item.quantidade} onChange={(e) => atualizarItem(idx, { quantidade: Number(e.target.value) })} />
                  </label>
                  <label>
                    Preço
                    <input type="number" min={0} step={0.01} value={item.preco_unitario} onChange={(e) => atualizarItem(idx, { preco_unitario: Number(e.target.value) })} />
                  </label>
                  <label>
                    Desc.
                    <input type="number" min={0} step={0.01} value={item.desconto} onChange={(e) => atualizarItem(idx, { desconto: Number(e.target.value) })} />
                  </label>
                  <p className="dica">Total {moeda.format(linha)}</p>
                  {form.itens.length > 1 && (
                    <button type="button" className="btn-remover-texto" onClick={() => setForm({ ...form, itens: form.itens.filter((_, i) => i !== idx) })}>
                      Remover item
                    </button>
                  )}
                </div>
              );
            })}
            <button
              type="button"
              className="btn-secundario"
              onClick={() => setForm({ ...form, itens: [...form.itens, { produto_id: '', variante_id: '', quantidade: 1, preco_unitario: 0, desconto: 0 }] })}
            >
              + Adicionar item
            </button>
            <p className="dica">
              Subtotal {moeda.format(totaisForm.subtotal)} · Total {moeda.format(totaisForm.total)}
            </p>
            <label>Observações<textarea value={form.observacoes} onChange={(e) => setForm({ ...form, observacoes: e.target.value })} /></label>
            <button type="submit" disabled={salvando}>{salvando ? 'Salvando…' : modo === 'editar' ? 'Salvar alterações' : 'Salvar orçamento'}</button>
          </form>
        </section>
      )}

      {modo === 'detalhe' && detalhe && (
        <section className="card">
          <div className="card__head">
            <h2>{detalhe.codigo}</h2>
            <button type="button" className="btn-fechar" onClick={() => setModo(null)}>×</button>
          </div>
          <dl className="detalhe">
            <div><dt>Cliente</dt><dd>{detalhe.cliente}</dd></div>
            <div><dt>Status</dt><dd>{STATUS_PEDIDO_LABEL[detalhe.status]}</dd></div>
            <div><dt>Prioridade</dt><dd>{PRIORIDADE_OP_LABEL[detalhe.prioridade]}</dd></div>
            <div><dt>Data</dt><dd>{formatarData(detalhe.data_pedido)}</dd></div>
            <div><dt>Previsão</dt><dd>{formatarData(detalhe.data_prevista)}</dd></div>
            <div><dt>Subtotal</dt><dd>{moeda.format(detalhe.subtotal)}</dd></div>
            <div><dt>Desconto</dt><dd>{moeda.format(detalhe.desconto)}</dd></div>
            <div><dt>Frete</dt><dd>{moeda.format(detalhe.frete)}</dd></div>
            <div><dt>Total</dt><dd>{moeda.format(detalhe.total)}</dd></div>
          </dl>
          {detalhe.observacoes && <p className="dica">{detalhe.observacoes}</p>}
          <table className="tabela tabela--compacta">
            <thead>
              <tr>
                <th>Item</th>
                <th>Qtd.</th>
                <th>Preço</th>
                <th>Desc.</th>
                <th>Total</th>
                <th>OP</th>
              </tr>
            </thead>
            <tbody>
              {(detalhe.itens ?? []).map((i: PedidoItemVenda) => (
                <tr key={i.id}>
                  <td>
                    {i.produto}
                    <div className="dica">{[i.cor, i.tamanho, i.sku].filter(Boolean).join(' · ')}</div>
                  </td>
                  <td>{i.quantidade}{i.quantidade_reservada ? ` · res. ${i.quantidade_reservada}` : ''}</td>
                  <td>{moeda.format(i.preco_unitario)}</td>
                  <td>{moeda.format(i.desconto)}</td>
                  <td>{moeda.format(i.total)}</td>
                  <td>
                    {i.ordem_codigo ? (
                      <button type="button" className="link-op" onClick={() => onAbrirOp?.(i.ordem_id!)}>
                        {i.ordem_codigo}
                      </button>
                    ) : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          <h3 className="subtitulo">OPs geradas</h3>
          {(detalhe.ordens ?? []).length === 0 ? (
            <p className="dica">Nenhuma ordem de produção gerada.</p>
          ) : (
            <ul className="lista-simples">
              {(detalhe.ordens ?? []).map((o) => (
                <li key={o.id}>
                  <button type="button" className="link-op" onClick={() => onAbrirOp?.(o.id)}>
                    {o.codigo} · {o.produto} · {o.quantidade} pç
                  </button>
                  <span>{STATUS_OP_LABEL[o.status as keyof typeof STATUS_OP_LABEL] ?? o.status}</span>
                </li>
              ))}
            </ul>
          )}

          <h3 className="subtitulo">Financeiro</h3>
          {detalhe.financeiro ? (
            <p className="dica">
              {detalhe.financeiro.descricao} · {moeda.format(detalhe.financeiro.valor)} · {detalhe.financeiro.status}
              {detalhe.financeiro.vencimento ? ` · venc. ${formatarData(detalhe.financeiro.vencimento)}` : ''}
            </p>
          ) : (
            <p className="dica">Nenhuma conta a receber gerada.</p>
          )}

          <div className="detalhe__acoes">
            {editavel && (
              <button type="button" className="btn-secundario" onClick={() => abrirEdicao(detalhe)}>Editar</button>
            )}
            {podeConfirmar && (
              <button type="button" className="btn-secundario" disabled={salvando} onClick={() => void acao(() => atualizarPedido(detalhe.id, { status: 'confirmado' }))}>
                Confirmar
              </button>
            )}
            {podeGerarOp && (
              <button type="button" className="btn-secundario" disabled={salvando} onClick={() => void acao(() => gerarOpPedido(detalhe.id))}>
                Gerar OP
              </button>
            )}
            {podeFinanceiro && (
              <button type="button" className="btn-secundario" disabled={salvando} onClick={() => void acao(() => gerarFinanceiroPedido(detalhe.id))}>
                Gerar financeiro
              </button>
            )}
            {podeCancelar && (
              <button type="button" className="btn-remover-texto" disabled={salvando} onClick={() => void acao(() => atualizarPedido(detalhe.id, { status: 'cancelado' }))}>
                Cancelar
              </button>
            )}
          </div>
        </section>
      )}
    </main>
  );
}
