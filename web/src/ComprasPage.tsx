import { useCallback, useEffect, useState } from 'react';
import {
  STATUS_COMPRA,
  STATUS_COMPRA_LABEL,
  atualizarCompra,
  confirmarCompra,
  criarCompra,
  criarFornecedor,
  listarCompras,
  listarFornecedores,
  listarMateriasPrimas,
  listarTecidos,
  obterCompra,
  receberCompra,
  removerCompra,
  type CompraItem,
  type Fornecedor,
  type PedidoCompra,
} from './api';

const moeda = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const FORMAS_PAGAMENTO = ['Dinheiro', 'PIX', 'Boleto', 'Cartão', 'Transferência', 'A prazo'];

type Modo = 'criar' | 'detalhe' | 'fornecedor' | null;
type TipoItemCompra = 'tecido' | 'material';
type OpcaoCompra = {
  id: number;
  nome: string;
  tipo: TipoItemCompra;
  unidade: string;
  custo: number;
};
type ItemForm = {
  tipo: TipoItemCompra;
  materia_prima_id: string;
  quantidade: number;
  custo_unitario: number;
};

const ITEM_VAZIO: ItemForm = { tipo: 'tecido', materia_prima_id: '', quantidade: 1, custo_unitario: 0 };

const FORM_VAZIO = {
  fornecedor_id: '',
  data_emissao: '',
  data_prevista: '',
  vencimento: '',
  nota_fiscal: '',
  forma_pagamento: '',
  desconto: 0,
  frete: 0,
  observacoes: '',
  itens: [{ ...ITEM_VAZIO }] as ItemForm[],
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
  const [opcoes, setOpcoes] = useState<OpcaoCompra[]>([]);
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
    Promise.all([
      listarTecidos({ por_pagina: 100, status: 'ativo' }),
      listarMateriasPrimas({ por_pagina: 100, status: 'ativo' }),
    ])
      .then(([tecidos, materias]) => {
        const tecidosOpcoes: OpcaoCompra[] = tecidos.data.map((tecido) => ({
          id: tecido.id,
          nome: tecido.nome,
          tipo: 'tecido',
          unidade: tecido.unidade,
          custo: tecido.custo,
        }));
        const ids = new Set(tecidosOpcoes.map((tecido) => tecido.id));
        const materiais: OpcaoCompra[] = materias.data
          .filter((materia) => materia.tipo !== 'tecido' && !ids.has(materia.id))
          .map((materia) => ({
            id: materia.id,
            nome: materia.nome,
            tipo: 'material',
            unidade: materia.unidade,
            custo: materia.custo,
          }));
        setOpcoes([...tecidosOpcoes, ...materiais]);
      })
      .catch(() => undefined);
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

  function opcaoDoItem(item: ItemForm): OpcaoCompra | undefined {
    return opcoes.find(
      (opcao) => opcao.tipo === item.tipo && opcao.id === Number(item.materia_prima_id),
    );
  }

  async function handleSalvar(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const confirmar = (e.nativeEvent as SubmitEvent).submitter?.getAttribute('data-confirmar') === '1';
    try {
      setSalvando(true);
      const itens = form.itens
        .filter((i) => i.materia_prima_id)
        .map((i) => ({
          materia_prima_id: Number(i.materia_prima_id),
          quantidade: Number(i.quantidade),
          custo_unitario: Number(i.custo_unitario),
          unidade: opcaoDoItem(i)?.unidade,
        }));
      if (itens.length === 0) {
        setErro('Selecione o tecido ou material já cadastrado.');
        return;
      }
      await criarCompra({
        fornecedor_id: Number(form.fornecedor_id),
        data_emissao: form.data_emissao || undefined,
        data_prevista: form.data_prevista || undefined,
        vencimento: form.vencimento || undefined,
        nota_fiscal: form.nota_fiscal || undefined,
        forma_pagamento: form.forma_pagamento || undefined,
        desconto: Number(form.desconto) || 0,
        frete: Number(form.frete) || 0,
        observacoes: form.observacoes || undefined,
        confirmar,
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

  async function handleConfirmar() {
    if (!detalhe) return;
    try {
      setSalvando(true);
      const atualizada = await confirmarCompra(detalhe.id);
      setDetalhe(atualizada);
      setErro(null);
      await recarregar();
    } catch (err) {
      setErro((err as Error).message);
    } finally {
      setSalvando(false);
    }
  }

  async function handleCancelar() {
    if (!detalhe) return;
    const recebeu = (detalhe.itens ?? []).some((item) => item.quantidade_recebida > 0);
    const aviso = recebeu
      ? 'Cancelar esta compra estorna a entrada do estoque. Continuar?'
      : 'Cancelar esta compra?';
    if (!window.confirm(aviso)) return;
    try {
      setSalvando(true);
      const atualizada = await atualizarCompra(detalhe.id, { status: 'cancelada' });
      setDetalhe(atualizada);
      setErro(null);
      await recarregar();
    } catch (err) {
      setErro((err as Error).message);
    } finally {
      setSalvando(false);
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
              <label>Data da compra<input type="date" value={form.data_emissao} onChange={(e) => setForm({ ...form, data_emissao: e.target.value })} /></label>
              <label>Previsão<input type="date" value={form.data_prevista} onChange={(e) => setForm({ ...form, data_prevista: e.target.value })} /></label>
            </div>
            <div className="form__row">
              <label>Número da nota fiscal<input value={form.nota_fiscal} onChange={(e) => setForm({ ...form, nota_fiscal: e.target.value })} placeholder="Opcional" /></label>
              <label>
                Forma de pagamento
                <select value={form.forma_pagamento} onChange={(e) => setForm({ ...form, forma_pagamento: e.target.value })}>
                  <option value="">Selecione</option>
                  {FORMAS_PAGAMENTO.map((forma) => (
                    <option key={forma} value={forma}>{forma}</option>
                  ))}
                </select>
              </label>
            </div>
            <label>Vencimento<input type="date" value={form.vencimento} onChange={(e) => setForm({ ...form, vencimento: e.target.value })} /></label>
            <div className="form__row">
              <label>Desconto<input type="number" min={0} step={0.01} value={form.desconto} onChange={(e) => setForm({ ...form, desconto: Number(e.target.value) })} /></label>
              <label>Frete<input type="number" min={0} step={0.01} value={form.frete} onChange={(e) => setForm({ ...form, frete: Number(e.target.value) })} /></label>
            </div>
            <p className="subtitulo">Itens</p>
            {form.itens.map((item, idx) => {
              const escolhida = opcaoDoItem(item);
              const opcoesTipo = opcoes.filter((opcao) => opcao.tipo === item.tipo);
              const totalLinha = Number(item.quantidade) * Number(item.custo_unitario);
              return (
                <div className="compra-item" key={idx}>
                  <div className="form__row">
                    <label>
                      Tipo de item
                      <select
                        value={item.tipo}
                        onChange={(e) => {
                          const itens = [...form.itens];
                          itens[idx] = {
                            ...ITEM_VAZIO,
                            tipo: e.target.value as TipoItemCompra,
                            quantidade: item.quantidade,
                          };
                          setForm({ ...form, itens });
                        }}
                      >
                        <option value="tecido">Tecido</option>
                        <option value="material">Material</option>
                      </select>
                    </label>
                    <label>
                      Item
                      <select
                        required
                        value={item.materia_prima_id}
                        onChange={(e) => {
                          const itens = [...form.itens];
                          const escolhido = opcoesTipo.find((opcao) => opcao.id === Number(e.target.value));
                          itens[idx] = {
                            ...item,
                            materia_prima_id: e.target.value,
                            custo_unitario: escolhido?.custo ?? item.custo_unitario,
                          };
                          setForm({ ...form, itens });
                        }}
                      >
                        <option value="">{item.tipo === 'tecido' ? 'Selecione o tecido' : 'Selecione o material'}</option>
                        {opcoesTipo.map((opcao) => (
                          <option key={opcao.id} value={opcao.id}>{opcao.nome}</option>
                        ))}
                      </select>
                    </label>
                  </div>
                  <div className="form__row">
                    <label>
                      Quantidade
                      <input type="number" min={0.01} step={0.01} required value={item.quantidade} onChange={(e) => {
                        const itens = [...form.itens];
                        itens[idx] = { ...item, quantidade: Number(e.target.value) };
                        setForm({ ...form, itens });
                      }} />
                    </label>
                    <label>
                      Unidade
                      <input readOnly value={escolhida?.unidade ?? ''} placeholder="Do cadastro" aria-label="Unidade" />
                    </label>
                    <label>
                      Valor unitário
                      <input type="number" min={0} step={0.01} required value={item.custo_unitario} onChange={(e) => {
                        const itens = [...form.itens];
                        itens[idx] = { ...item, custo_unitario: Number(e.target.value) };
                        setForm({ ...form, itens });
                      }} />
                    </label>
                    <label>
                      Valor total
                      <input readOnly value={moeda.format(Number.isFinite(totalLinha) ? totalLinha : 0)} aria-label="Valor total do item" />
                    </label>
                  </div>
                </div>
              );
            })}
            <button
              type="button"
              className="btn-secundario"
              onClick={() => setForm({ ...form, itens: [...form.itens, { ...ITEM_VAZIO }] })}
            >
              Adicionar item
            </button>
            <label>Observação<textarea value={form.observacoes} onChange={(e) => setForm({ ...form, observacoes: e.target.value })} /></label>
            <div className="detalhe__acoes">
              <button type="submit" className="btn-secundario" disabled={salvando}>
                {salvando ? 'Salvando…' : 'Salvar rascunho'}
              </button>
              <button type="submit" data-confirmar="1" disabled={salvando}>
                {salvando ? 'Salvando…' : 'Confirmar compra'}
              </button>
            </div>
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
            <div><dt>Data da compra</dt><dd>{detalhe.data_emissao?.slice(0, 10).split('-').reverse().join('/')}</dd></div>
            <div><dt>Status</dt><dd>{STATUS_COMPRA_LABEL[detalhe.status]}</dd></div>
            <div><dt>Nota fiscal</dt><dd>{detalhe.nota_fiscal || '—'}</dd></div>
            <div><dt>Forma de pagamento</dt><dd>{detalhe.forma_pagamento || '—'}</dd></div>
            <div><dt>Vencimento</dt><dd>{detalhe.vencimento ? detalhe.vencimento.slice(0, 10).split('-').reverse().join('/') : '—'}</dd></div>
            <div><dt>Subtotal</dt><dd>{moeda.format(detalhe.subtotal)}</dd></div>
            <div><dt>Desconto</dt><dd>{moeda.format(detalhe.desconto)}</dd></div>
            <div><dt>Frete</dt><dd>{moeda.format(detalhe.frete)}</dd></div>
            <div><dt>Total</dt><dd>{moeda.format(detalhe.total)}</dd></div>
            {detalhe.observacoes && <div><dt>Observação</dt><dd>{detalhe.observacoes}</dd></div>}
          </dl>
          <table className="tabela tabela--compacta">
            <thead>
              <tr>
                <th>Item</th>
                <th>Qtd.</th>
                <th>Unidade</th>
                <th>Recebido</th>
                <th>Valor unitário</th>
                <th>Valor total</th>
                {(detalhe.status === 'aberta' || detalhe.status === 'parcial') && <th>Receber</th>}
              </tr>
            </thead>
            <tbody>
              {(detalhe.itens ?? []).map((i: CompraItem) => (
                <tr key={i.id}>
                  <td>{i.nome}<div className="dica">{i.codigo}</div></td>
                  <td>{i.quantidade}</td>
                  <td>{i.unidade || '—'}</td>
                  <td>{i.quantidade_recebida}</td>
                  <td>{moeda.format(i.custo_unitario)}</td>
                  <td>{moeda.format(i.total)}</td>
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
            {(detalhe.status === 'rascunho' || detalhe.status === 'aberta' || detalhe.status === 'parcial') && (
              <button type="button" disabled={salvando} onClick={() => void handleConfirmar()}>
                {salvando ? 'Confirmando…' : 'Confirmar compra'}
              </button>
            )}
            {(detalhe.status === 'aberta' || detalhe.status === 'parcial') && (
              <button type="button" className="btn-secundario" disabled={salvando} onClick={() => void handleReceber()}>
                {salvando ? 'Recebendo…' : 'Receber no estoque'}
              </button>
            )}
            {detalhe.status !== 'cancelada' && (
              <button type="button" className="btn-remover-texto" disabled={salvando} onClick={() => void handleCancelar()}>
                Cancelar compra
              </button>
            )}
          </div>
        </section>
      )}
    </main>
  );
}
