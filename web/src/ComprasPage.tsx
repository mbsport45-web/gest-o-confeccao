import { useCallback, useEffect, useState } from 'react';
import {
  STATUS_COMPRA,
  STATUS_COMPRA_LABEL,
  atualizarCompra,
  criarCompra,
  criarFornecedor,
  listarCompras,
  listarFornecedores,
  listarMateriasPrimas,
  obterCompra,
  receberCompra,
  removerCompra,
  type CompraItem,
  type Fornecedor,
  type MateriaPrima,
  type PedidoCompra,
} from './api';

const moeda = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });

type Modo = 'criar' | 'detalhe' | 'fornecedor' | null;
type ItemForm = { materia_prima_id: string; quantidade: number; custo_unitario: number };

const FORM_VAZIO = {
  fornecedor_id: '',
  data_emissao: '',
  data_prevista: '',
  vencimento: '',
  desconto: 0,
  frete: 0,
  observacoes: '',
  itens: [{ materia_prima_id: '', quantidade: 1, custo_unitario: 0 }] as ItemForm[],
};

export function ComprasPage() {
  const [compras, setCompras] = useState<PedidoCompra[]>([]);
  const [pagina, setPagina] = useState(1);
  const [totalPaginas, setTotalPaginas] = useState(1);
  const [total, setTotal] = useState(0);
  const [q, setQ] = useState('');
  const [qDebounced, setQDebounced] = useState('');
  const [statusFiltro, setStatusFiltro] = useState('');
  const [fornecedorFiltro, setFornecedorFiltro] = useState('');
  const [de, setDe] = useState('');
  const [ate, setAte] = useState('');
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [modo, setModo] = useState<Modo>(null);
  const [form, setForm] = useState(FORM_VAZIO);
  const [detalhe, setDetalhe] = useState<PedidoCompra | null>(null);
  const [receber, setReceber] = useState<Record<number, number>>({});
  const [salvando, setSalvando] = useState(false);
  const [fornecedores, setFornecedores] = useState<Fornecedor[]>([]);
  const [materias, setMaterias] = useState<MateriaPrima[]>([]);
  const [novoForn, setNovoForn] = useState({ nome: '', cidade: '', estado: 'SP' });

  useEffect(() => {
    const t = setTimeout(() => {
      setQDebounced(q);
      setPagina(1);
    }, 300);
    return () => clearTimeout(t);
  }, [q]);

  useEffect(() => {
    setPagina(1);
  }, [statusFiltro, fornecedorFiltro, de, ate]);

  useEffect(() => {
    listarFornecedores({ por_pagina: 100 }).then((l) => setFornecedores(l.data)).catch(() => undefined);
    listarMateriasPrimas({ por_pagina: 100 }).then((l) => setMaterias(l.data)).catch(() => undefined);
  }, []);

  const recarregar = useCallback(async () => {
    try {
      setCarregando(true);
      const lista = await listarCompras({
        q: qDebounced,
        status: statusFiltro,
        fornecedor_id: fornecedorFiltro ? Number(fornecedorFiltro) : undefined,
        de: de || undefined,
        ate: ate || undefined,
        pagina,
        por_pagina: 10,
      });
      setCompras(lista.data);
      setTotal(lista.total);
      setTotalPaginas(lista.total_paginas);
      setErro(null);
    } catch (e) {
      setErro((e as Error).message);
    } finally {
      setCarregando(false);
    }
  }, [qDebounced, statusFiltro, fornecedorFiltro, de, ate, pagina]);

  useEffect(() => {
    void recarregar();
  }, [recarregar]);

  async function abrirDetalhe(id: number) {
    const c = await obterCompra(id);
    setDetalhe(c);
    const mapa: Record<number, number> = {};
    for (const item of c.itens ?? []) {
      mapa[item.id] = Math.max(0, item.quantidade - item.quantidade_recebida);
    }
    setReceber(mapa);
    setModo('detalhe');
  }

  async function handleSalvar(e: React.FormEvent) {
    e.preventDefault();
    try {
      setSalvando(true);
      const itens = form.itens
        .filter((i) => i.materia_prima_id)
        .map((i) => ({
          materia_prima_id: Number(i.materia_prima_id),
          quantidade: Number(i.quantidade),
          custo_unitario: Number(i.custo_unitario),
        }));
      await criarCompra({
        fornecedor_id: Number(form.fornecedor_id),
        data_emissao: form.data_emissao || undefined,
        data_prevista: form.data_prevista || undefined,
        vencimento: form.vencimento || undefined,
        desconto: Number(form.desconto) || 0,
        frete: Number(form.frete) || 0,
        observacoes: form.observacoes || undefined,
        itens,
      });
      setForm(FORM_VAZIO);
      setModo(null);
      setErro(null);
      await recarregar();
    } catch (err) {
      setErro((err as Error).message);
    } finally {
      setSalvando(false);
    }
  }

  async function handleAbrir(id: number) {
    try {
      await atualizarCompra(id, { status: 'aberta' });
      await abrirDetalhe(id);
      await recarregar();
    } catch (err) {
      setErro((err as Error).message);
    }
  }

  async function handleReceber() {
    if (!detalhe) return;
    try {
      setSalvando(true);
      const itens = (detalhe.itens ?? [])
        .map((i) => ({ item_id: i.id, quantidade: Number(receber[i.id] || 0) }))
        .filter((i) => i.quantidade > 0);
      const atualizada = await receberCompra(detalhe.id, itens);
      setDetalhe(atualizada);
      setErro(null);
      await recarregar();
    } catch (err) {
      setErro((err as Error).message);
    } finally {
      setSalvando(false);
    }
  }

  async function handleFornecedor(e: React.FormEvent) {
    e.preventDefault();
    try {
      setSalvando(true);
      const criado = await criarFornecedor(novoForn);
      setFornecedores((atual) => [...atual, criado].sort((a, b) => a.nome.localeCompare(b.nome)));
      setForm((f) => ({ ...f, fornecedor_id: String(criado.id) }));
      setNovoForn({ nome: '', cidade: '', estado: 'SP' });
      setModo('criar');
      setErro(null);
    } catch (err) {
      setErro((err as Error).message);
    } finally {
      setSalvando(false);
    }
  }

  return (
    <main className="app__main app__main--compras">
      <section className="card card--wide">
        <div className="card__head">
          <h2>Compras</h2>
          <div className="card__head-acoes">
            <span className="badge">
              {total} compra{total === 1 ? '' : 's'}
            </span>
            <button type="button" className="btn-secundario" onClick={() => { setForm(FORM_VAZIO); setModo('criar'); }}>
              Nova compra
            </button>
          </div>
        </div>

        <div className="filtros filtros--compras">
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar código ou fornecedor…" aria-label="Buscar compras" />
          <select value={statusFiltro} onChange={(e) => setStatusFiltro(e.target.value)} aria-label="Filtrar status">
            <option value="">Todos os status</option>
            {STATUS_COMPRA.map((s) => (
              <option key={s} value={s}>{STATUS_COMPRA_LABEL[s]}</option>
            ))}
          </select>
          <select value={fornecedorFiltro} onChange={(e) => setFornecedorFiltro(e.target.value)} aria-label="Filtrar fornecedor">
            <option value="">Todos os fornecedores</option>
            {fornecedores.map((f) => (
              <option key={f.id} value={f.id}>{f.nome}</option>
            ))}
          </select>
          <input type="date" value={de} onChange={(e) => setDe(e.target.value)} aria-label="Data inicial" />
          <input type="date" value={ate} onChange={(e) => setAte(e.target.value)} aria-label="Data final" />
        </div>

        {erro && <p className="erro">{erro}</p>}
        {carregando ? (
          <p className="vazio">Carregando…</p>
        ) : compras.length === 0 ? (
          <p className="vazio">Nenhuma compra. Cadastre um fornecedor e crie o primeiro pedido.</p>
        ) : (
          <table className="tabela">
            <thead>
              <tr>
                <th>Código</th>
                <th>Fornecedor</th>
                <th>Emissão</th>
                <th>Status</th>
                <th>Total</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {compras.map((c) => (
                <tr key={c.id}>
                  <td>{c.codigo}</td>
                  <td>{c.fornecedor}</td>
                  <td>{c.data_emissao?.slice(0, 10).split('-').reverse().join('/')}</td>
                  <td><span className={`pill pill--${c.status}`}>{STATUS_COMPRA_LABEL[c.status]}</span></td>
                  <td>{moeda.format(c.total)}</td>
                  <td className="acoes">
                    <button type="button" onClick={() => void abrirDetalhe(c.id)}>Ver</button>
                    {c.status === 'rascunho' && (
                      <button type="button" className="btn-remover-texto" onClick={() => void removerCompra(c.id).then(recarregar).catch((e) => setErro(e.message))}>
                        Excluir
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

      {modo === 'criar' && (
        <section className="card">
          <div className="card__head">
            <h2>Nova compra</h2>
            <button type="button" className="btn-fechar" onClick={() => setModo(null)}>×</button>
          </div>
          <form className="form" onSubmit={(e) => void handleSalvar(e)}>
            <label>
              Fornecedor
              <select required value={form.fornecedor_id} onChange={(e) => setForm({ ...form, fornecedor_id: e.target.value })}>
                <option value="">Selecione</option>
                {fornecedores.map((f) => (
                  <option key={f.id} value={f.id}>{f.nome}</option>
                ))}
              </select>
            </label>
            <button type="button" className="btn-secundario" onClick={() => setModo('fornecedor')}>Novo fornecedor</button>
            <div className="form__row">
              <label>Emissão<input type="date" value={form.data_emissao} onChange={(e) => setForm({ ...form, data_emissao: e.target.value })} /></label>
              <label>Previsão<input type="date" value={form.data_prevista} onChange={(e) => setForm({ ...form, data_prevista: e.target.value })} /></label>
            </div>
            <label>Vencimento<input type="date" value={form.vencimento} onChange={(e) => setForm({ ...form, vencimento: e.target.value })} /></label>
            <div className="form__row">
              <label>Desconto<input type="number" min={0} step={0.01} value={form.desconto} onChange={(e) => setForm({ ...form, desconto: Number(e.target.value) })} /></label>
              <label>Frete<input type="number" min={0} step={0.01} value={form.frete} onChange={(e) => setForm({ ...form, frete: Number(e.target.value) })} /></label>
            </div>
            <p className="subtitulo">Itens</p>
            {form.itens.map((item, idx) => (
              <div className="form__row" key={idx}>
                <label>
                  Material
                  <select
                    required
                    value={item.materia_prima_id}
                    onChange={(e) => {
                      const itens = [...form.itens];
                      const mat = materias.find((m) => m.id === Number(e.target.value));
                      itens[idx] = {
                        ...item,
                        materia_prima_id: e.target.value,
                        custo_unitario: mat?.custo ?? item.custo_unitario,
                      };
                      setForm({ ...form, itens });
                    }}
                  >
                    <option value="">Selecione</option>
                    {materias.map((m) => (
                      <option key={m.id} value={m.id}>{m.nome}</option>
                    ))}
                  </select>
                </label>
                <label>
                  Qtd.
                  <input type="number" min={0.01} step={0.01} value={item.quantidade} onChange={(e) => {
                    const itens = [...form.itens];
                    itens[idx] = { ...item, quantidade: Number(e.target.value) };
                    setForm({ ...form, itens });
                  }} />
                </label>
                <label>
                  Custo
                  <input type="number" min={0} step={0.01} value={item.custo_unitario} onChange={(e) => {
                    const itens = [...form.itens];
                    itens[idx] = { ...item, custo_unitario: Number(e.target.value) };
                    setForm({ ...form, itens });
                  }} />
                </label>
              </div>
            ))}
            <button
              type="button"
              className="btn-secundario"
              onClick={() => setForm({ ...form, itens: [...form.itens, { materia_prima_id: '', quantidade: 1, custo_unitario: 0 }] })}
            >
              Adicionar item
            </button>
            <label>Observações<textarea value={form.observacoes} onChange={(e) => setForm({ ...form, observacoes: e.target.value })} /></label>
            <button type="submit" disabled={salvando}>{salvando ? 'Salvando…' : 'Salvar rascunho'}</button>
          </form>
        </section>
      )}

      {modo === 'fornecedor' && (
        <section className="card">
          <div className="card__head">
            <h2>Novo fornecedor</h2>
            <button type="button" className="btn-fechar" onClick={() => setModo('criar')}>×</button>
          </div>
          <form className="form" onSubmit={(e) => void handleFornecedor(e)}>
            <label>Nome<input required value={novoForn.nome} onChange={(e) => setNovoForn({ ...novoForn, nome: e.target.value })} /></label>
            <label>Cidade<input value={novoForn.cidade} onChange={(e) => setNovoForn({ ...novoForn, cidade: e.target.value })} /></label>
            <button type="submit" disabled={salvando}>Cadastrar</button>
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
            <div><dt>Fornecedor</dt><dd>{detalhe.fornecedor}</dd></div>
            <div><dt>Status</dt><dd>{STATUS_COMPRA_LABEL[detalhe.status]}</dd></div>
            <div><dt>Subtotal</dt><dd>{moeda.format(detalhe.subtotal)}</dd></div>
            <div><dt>Desconto</dt><dd>{moeda.format(detalhe.desconto)}</dd></div>
            <div><dt>Frete</dt><dd>{moeda.format(detalhe.frete)}</dd></div>
            <div><dt>Total</dt><dd>{moeda.format(detalhe.total)}</dd></div>
          </dl>
          <table className="tabela tabela--compacta">
            <thead>
              <tr>
                <th>Item</th>
                <th>Qtd.</th>
                <th>Recebido</th>
                <th>Custo</th>
                {(detalhe.status === 'aberta' || detalhe.status === 'parcial') && <th>Receber</th>}
              </tr>
            </thead>
            <tbody>
              {(detalhe.itens ?? []).map((i: CompraItem) => (
                <tr key={i.id}>
                  <td>{i.nome}<div className="dica">{i.codigo}</div></td>
                  <td>{i.quantidade}</td>
                  <td>{i.quantidade_recebida}</td>
                  <td>{moeda.format(i.custo_unitario)}</td>
                  {(detalhe.status === 'aberta' || detalhe.status === 'parcial') && (
                    <td>
                      <input
                        type="number"
                        min={0}
                        step={0.01}
                        value={receber[i.id] ?? 0}
                        onChange={(e) => setReceber({ ...receber, [i.id]: Number(e.target.value) })}
                        aria-label={`Receber ${i.nome}`}
                      />
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
          <div className="detalhe__acoes">
            {detalhe.status === 'rascunho' && (
              <button type="button" className="btn-secundario" onClick={() => void handleAbrir(detalhe.id)}>Abrir compra</button>
            )}
            {(detalhe.status === 'aberta' || detalhe.status === 'parcial') && (
              <button type="button" className="btn-secundario" disabled={salvando} onClick={() => void handleReceber()}>
                {salvando ? 'Recebendo…' : 'Receber no estoque'}
              </button>
            )}
          </div>
        </section>
      )}
    </main>
  );
}
