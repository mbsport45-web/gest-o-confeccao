import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  GENEROS_PRODUTO,
  UNIDADES_PRODUTO,
  atualizarProduto,
  atualizarStatusProduto,
  criarProduto,
  listarProdutos,
  obterProduto,
  removerProduto,
  removerVarianteProduto,
  type Produto,
  type ProdutoPayload,
  type ProdutoVariante,
  type StatusProduto,
  type AssinaturaEmpresa,
} from './api';
import { AvisoLimite, podeCriarNoPlano } from './AvisoLimite';

type ModoPainel = 'criar' | 'editar' | 'detalhe' | null;

const FORM_VAZIO: ProdutoPayload & { coresTexto: string; tamanhosTexto: string } = {
  sku: '',
  valor_costura: null as number | null,
  nome: '',
  descricao: '',
  categoria: '',
  subcategoria: '',
  marca: '',
  genero: '',
  colecao: '',
  coresTexto: '',
  tamanhosTexto: '',
  codigo_barras: '',
  unidade: 'UN',
  preco_venda: 0,
  preco_atacado: 0,
  preco_custo: 0,
  status: 'ativo',
  estoque_minimo: 0,
  imagem: '',
  observacoes: '',
};

type FormProduto = typeof FORM_VAZIO;

const GENERO_LABEL: Record<string, string> = {
  masculino: 'Masculino',
  feminino: 'Feminino',
  unissex: 'Unissex',
  infantil: 'Infantil',
};

const moeda = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
});

function parseLista(texto: string): string[] {
  const unique: string[] = [];
  for (const raw of texto.split(/[,;]/)) {
    const item = raw.trim();
    if (!item) continue;
    if (!unique.some((u) => u.toLowerCase() === item.toLowerCase())) unique.push(item);
  }
  return unique;
}

function produtoParaForm(p: Produto): FormProduto {
  return {
    sku: p.referencia ?? p.sku ?? '',
    valor_costura: p.valor_costura,
    nome: p.nome,
    descricao: p.descricao ?? '',
    categoria: p.categoria ?? '',
    subcategoria: p.subcategoria ?? '',
    marca: p.marca ?? '',
    genero: p.genero ?? '',
    colecao: p.colecao ?? '',
    coresTexto: p.cores.join(', '),
    tamanhosTexto: p.tamanhos.join(', '),
    codigo_barras: p.codigo_barras ?? '',
    unidade: p.unidade || 'UN',
    preco_venda: p.preco_venda,
    preco_atacado: p.preco_atacado,
    preco_custo: p.preco_custo,
    status: p.status,
    estoque_minimo: p.estoque_minimo,
    imagem: p.imagem ?? '',
    observacoes: p.observacoes ?? '',
  };
}

function payloadDeForm(form: FormProduto): ProdutoPayload {
  return {
    sku: form.sku,
    referencia: form.sku,
    valor_costura: form.valor_costura,
    nome: form.nome,
    descricao: form.descricao,
    categoria: form.categoria,
    subcategoria: form.subcategoria,
    marca: form.marca,
    genero: form.genero,
    colecao: form.colecao,
    cores: parseLista(form.coresTexto),
    tamanhos: parseLista(form.tamanhosTexto),
    codigo_barras: form.codigo_barras,
    unidade: form.unidade,
    preco_venda: Number(form.preco_venda) || 0,
    preco_atacado: Number(form.preco_atacado) || 0,
    preco_custo: Number(form.preco_custo) || 0,
    status: form.status,
    estoque_minimo: Number(form.estoque_minimo) || 0,
    imagem: form.imagem,
    observacoes: form.observacoes,
  };
}

export function ProdutosPage({ sessao }: { sessao: { assinatura: AssinaturaEmpresa } }) {
  const [produtos, setProdutos] = useState<Produto[]>([]);
  const [pagina, setPagina] = useState(1);
  const [totalPaginas, setTotalPaginas] = useState(1);
  const [total, setTotal] = useState(0);
  const [q, setQ] = useState('');
  const [qDebounced, setQDebounced] = useState('');
  const [statusFiltro, setStatusFiltro] = useState<StatusProduto | ''>('');
  const [categoriaFiltro, setCategoriaFiltro] = useState('');
  const [marcaFiltro, setMarcaFiltro] = useState('');
  const [generoFiltro, setGeneroFiltro] = useState('');
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [modo, setModo] = useState<ModoPainel>(null);
  const [form, setForm] = useState<FormProduto>(FORM_VAZIO);
  const [editandoId, setEditandoId] = useState<number | null>(null);
  const [detalhe, setDetalhe] = useState<Produto | null>(null);
  const [variantesEdit, setVariantesEdit] = useState<ProdutoVariante[]>([]);
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => {
      setQDebounced(q);
      setPagina(1);
    }, 300);
    return () => clearTimeout(t);
  }, [q]);

  useEffect(() => {
    setPagina(1);
  }, [statusFiltro, categoriaFiltro, marcaFiltro, generoFiltro]);

  const recarregar = useCallback(async () => {
    try {
      setCarregando(true);
      const lista = await listarProdutos({
        q: qDebounced,
        status: statusFiltro,
        categoria: categoriaFiltro,
        marca: marcaFiltro,
        genero: generoFiltro,
        pagina,
        por_pagina: 8,
      });
      setProdutos(lista.data);
      setTotal(lista.total);
      setTotalPaginas(lista.total_paginas);
      setErro(null);
    } catch (e) {
      setErro((e as Error).message);
    } finally {
      setCarregando(false);
    }
  }, [qDebounced, statusFiltro, categoriaFiltro, marcaFiltro, generoFiltro, pagina]);

  useEffect(() => {
    recarregar();
  }, [recarregar]);

  const combinacoesPrevistas = useMemo(
    () => parseLista(form.coresTexto).length * parseLista(form.tamanhosTexto).length,
    [form.coresTexto, form.tamanhosTexto],
  );

  function abrirCriar() {
    if (!podeCriarNoPlano(sessao.assinatura, 'produtos')) return;
    setForm(FORM_VAZIO);
    setEditandoId(null);
    setDetalhe(null);
    setVariantesEdit([]);
    setModo('criar');
  }

  async function abrirEditar(id: number) {
    const produto = await obterProduto(id);
    setForm(produtoParaForm(produto));
    setEditandoId(id);
    setDetalhe(null);
    setVariantesEdit(produto.variantes);
    setModo('editar');
  }

  async function abrirDetalhe(id: number) {
    const produto = await obterProduto(id);
    setDetalhe(produto);
    setModo('detalhe');
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    try {
      setSalvando(true);
      const payload = payloadDeForm(form);
      if (modo === 'editar' && editandoId !== null) {
        await atualizarProduto(editandoId, {
          ...payload,
          variantes: variantesEdit.map((v) => ({
            id: v.id,
            cor: v.cor,
            tamanho: v.tamanho,
            sku: v.sku,
            codigo_barras: v.codigo_barras ?? undefined,
            status: v.status,
          })),
        });
      } else {
        await criarProduto(payload);
      }
      setModo(null);
      await recarregar();
    } catch (err) {
      setErro((err as Error).message);
    } finally {
      setSalvando(false);
    }
  }

  async function alternarStatus(produto: Produto) {
    try {
      await atualizarStatusProduto(
        produto.id,
        produto.status === 'ativo' ? 'inativo' : 'ativo',
      );
      if (detalhe?.id === produto.id) {
        setDetalhe(await obterProduto(produto.id));
      }
      await recarregar();
    } catch (err) {
      setErro((err as Error).message);
    }
  }

  async function excluir(produto: Produto) {
    if (!window.confirm(`Excluir o produto "${produto.nome}"?`)) return;
    try {
      await removerProduto(produto.id);
      if (detalhe?.id === produto.id || editandoId === produto.id) {
        setModo(null);
      }
      await recarregar();
    } catch (err) {
      setErro((err as Error).message);
    }
  }

  async function excluirVariante(produto: Produto, variante: ProdutoVariante) {
    if (
      !window.confirm(
        `Excluir a variante ${variante.cor} / ${variante.tamanho} (${variante.sku})?`,
      )
    ) {
      return;
    }
    try {
      await removerVarianteProduto(produto.id, variante.id);
      setDetalhe(await obterProduto(produto.id));
      await recarregar();
    } catch (err) {
      setErro((err as Error).message);
    }
  }

  function lerImagem(file: File | undefined) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      setForm((atual) => ({ ...atual, imagem: String(reader.result ?? '') }));
    };
    reader.readAsDataURL(file);
  }

  return (
    <main className="app__main app__main--produtos">
      <section className="card card--wide">
        <div className="card__head">
          <h2>Produtos</h2>
          <button
            type="button"
            className="btn-secundario"
            onClick={abrirCriar}
            disabled={!podeCriarNoPlano(sessao.assinatura, 'produtos')}
          >
            Novo produto
          </button>
        </div>
        <AvisoLimite assinatura={sessao.assinatura} chave="produtos" />

        <div className="filtros filtros--produtos">
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar nome, SKU, código de barras, marca…"
            aria-label="Buscar produtos"
          />
          <select
            value={statusFiltro}
            onChange={(e) =>
              setStatusFiltro(e.target.value as StatusProduto | '')
            }
            aria-label="Filtrar status"
          >
            <option value="">Todos os status</option>
            <option value="ativo">Ativo</option>
            <option value="inativo">Inativo</option>
          </select>
          <input
            value={categoriaFiltro}
            onChange={(e) => setCategoriaFiltro(e.target.value)}
            placeholder="Categoria"
            aria-label="Filtrar categoria"
          />
          <input
            value={marcaFiltro}
            onChange={(e) => setMarcaFiltro(e.target.value)}
            placeholder="Marca"
            aria-label="Filtrar marca"
          />
          <select
            value={generoFiltro}
            onChange={(e) => setGeneroFiltro(e.target.value)}
            aria-label="Filtrar gênero"
          >
            <option value="">Todos os gêneros</option>
            {GENEROS_PRODUTO.map((g) => (
              <option key={g} value={g}>
                {GENERO_LABEL[g]}
              </option>
            ))}
          </select>
        </div>

        {erro && <p className="erro">{erro}</p>}

        {carregando ? (
          <p className="vazio">Carregando…</p>
        ) : produtos.length === 0 ? (
          <p className="vazio">Nenhum produto encontrado.</p>
        ) : (
          <table className="tabela">
            <thead>
              <tr>
                <th>Referência</th>
                <th>Produto</th>
                <th>Categoria</th>
                <th>Marca</th>
                <th>Venda</th>
                <th>Variantes</th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {produtos.map((p) => (
                <tr key={p.id}>
                  <td>{p.sku ?? '—'}</td>
                  <td>
                    <div className="produto-nome">
                      {p.imagem ? (
                        <img src={p.imagem} alt="" className="thumb" />
                      ) : null}
                      <span>{p.nome}</span>
                    </div>
                  </td>
                  <td>{p.categoria ?? '—'}</td>
                  <td>{p.marca ?? '—'}</td>
                  <td>{moeda.format(p.preco_venda)}</td>
                  <td>{p.variantes.length}</td>
                  <td>
                    <span className={`pill pill--${p.status}`}>
                      {p.status === 'ativo' ? 'Ativo' : 'Inativo'}
                    </span>
                  </td>
                  <td className="acoes">
                    <button type="button" onClick={() => abrirDetalhe(p.id)}>
                      Ver
                    </button>
                    <button type="button" onClick={() => abrirEditar(p.id)}>
                      Editar
                    </button>
                    <button type="button" onClick={() => alternarStatus(p)}>
                      {p.status === 'ativo' ? 'Inativar' : 'Ativar'}
                    </button>
                    <button
                      type="button"
                      className="btn-remover-texto"
                      onClick={() => excluir(p)}
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
            {total} produto{total === 1 ? '' : 's'}
          </span>
          <div>
            <button
              type="button"
              disabled={pagina <= 1}
              onClick={() => setPagina((p) => p - 1)}
            >
              Anterior
            </button>
            <span>
              Página {pagina} de {totalPaginas}
            </span>
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

      {modo && (
        <section className="card">
          <div className="card__head">
            <h2>
              {modo === 'criar' && 'Novo produto'}
              {modo === 'editar' && 'Editar produto'}
              {modo === 'detalhe' && 'Detalhes do produto'}
            </h2>
            <button type="button" className="btn-fechar" onClick={() => setModo(null)}>
              ×
            </button>
          </div>

          {modo === 'detalhe' && detalhe ? (
            <div>
              {detalhe.imagem ? (
                <img src={detalhe.imagem} alt={detalhe.nome} className="produto-foto" />
              ) : null}
              <dl className="detalhe">
                <div><dt>Referência</dt><dd>{detalhe.referencia ?? detalhe.sku ?? '—'}</dd></div>
                <div>
                  <dt>Costura padrão</dt>
                  <dd>
                    {detalhe.valor_costura == null
                      ? '—'
                      : `${moeda.format(detalhe.valor_costura)} / peça`}
                  </dd>
                </div>
                <div><dt>Nome</dt><dd>{detalhe.nome}</dd></div>
                <div><dt>Descrição</dt><dd>{detalhe.descricao ?? '—'}</dd></div>
                <div><dt>Categoria</dt><dd>{detalhe.categoria ?? '—'}</dd></div>
                <div><dt>Subcategoria</dt><dd>{detalhe.subcategoria ?? '—'}</dd></div>
                <div><dt>Marca</dt><dd>{detalhe.marca ?? '—'}</dd></div>
                <div>
                  <dt>Gênero</dt>
                  <dd>{detalhe.genero ? GENERO_LABEL[detalhe.genero] ?? detalhe.genero : '—'}</dd>
                </div>
                <div><dt>Coleção</dt><dd>{detalhe.colecao ?? '—'}</dd></div>
                <div><dt>Cores</dt><dd>{detalhe.cores.join(', ') || '—'}</dd></div>
                <div><dt>Tamanhos</dt><dd>{detalhe.tamanhos.join(', ') || '—'}</dd></div>
                <div><dt>Código de barras</dt><dd>{detalhe.codigo_barras ?? '—'}</dd></div>
                <div><dt>Unidade</dt><dd>{detalhe.unidade}</dd></div>
                <div><dt>Preço de venda</dt><dd>{moeda.format(detalhe.preco_venda)}</dd></div>
                <div><dt>Preço atacado</dt><dd>{moeda.format(detalhe.preco_atacado)}</dd></div>
                <div><dt>Preço de custo</dt><dd>{moeda.format(detalhe.preco_custo)}</dd></div>
                <div><dt>Estoque mínimo</dt><dd>{detalhe.estoque_minimo}</dd></div>
                <div>
                  <dt>Status</dt>
                  <dd>
                    <span className={`pill pill--${detalhe.status}`}>
                      {detalhe.status === 'ativo' ? 'Ativo' : 'Inativo'}
                    </span>
                  </dd>
                </div>
                <div><dt>Observações</dt><dd>{detalhe.observacoes ?? '—'}</dd></div>
                <div><dt>Criado em</dt><dd>{detalhe.criado_em}</dd></div>
                <div><dt>Atualizado em</dt><dd>{detalhe.atualizado_em}</dd></div>
              </dl>

              <h3 className="subtitulo">Variantes</h3>
              {detalhe.variantes.length === 0 ? (
                <p className="vazio">Nenhuma variante gerada.</p>
              ) : (
                <table className="tabela tabela--compacta">
                  <thead>
                    <tr>
                      <th>Cor</th>
                      <th>Tam.</th>
                      <th>SKU</th>
                      <th>Código</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {detalhe.variantes.map((v) => (
                      <tr key={v.id}>
                        <td>{v.cor}</td>
                        <td>{v.tamanho}</td>
                        <td>{v.sku}</td>
                        <td>{v.codigo_barras ?? '—'}</td>
                        <td className="acoes">
                          <button
                            type="button"
                            className="btn-remover-texto"
                            onClick={() => excluirVariante(detalhe, v)}
                          >
                            Excluir
                          </button>
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
                <button type="button" onClick={() => alternarStatus(detalhe)}>
                  {detalhe.status === 'ativo' ? 'Inativar' : 'Ativar'}
                </button>
                <button
                  type="button"
                  className="btn-remover-texto"
                  onClick={() => excluir(detalhe)}
                >
                  Excluir
                </button>
              </div>
            </div>
          ) : (
            <form className="form" onSubmit={handleSubmit}>
              <label>
                Nome do produto
                <input
                  required
                  value={form.nome}
                  onChange={(e) => setForm({ ...form, nome: e.target.value })}
                />
              </label>
              <div className="form__row">
                <label>
                  Referência
                  <input
                    value={form.sku}
                    onChange={(e) => setForm({ ...form, sku: e.target.value })}
                    placeholder="Ex.: 10234"
                  />
                </label>
                <label>
                  Valor da costura (R$/peça)
                  <input
                    type="number"
                    min={0}
                    step="0.01"
                    value={form.valor_costura ?? ''}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        valor_costura: e.target.value === '' ? null : Number(e.target.value),
                      })
                    }
                    placeholder="Opcional"
                  />
                </label>
                <label>
                  Código de barras
                  <input
                    value={form.codigo_barras}
                    onChange={(e) =>
                      setForm({ ...form, codigo_barras: e.target.value })
                    }
                  />
                </label>
              </div>
              <label>
                Descrição
                <textarea
                  rows={2}
                  value={form.descricao}
                  onChange={(e) => setForm({ ...form, descricao: e.target.value })}
                />
              </label>
              <div className="form__row">
                <label>
                  Categoria
                  <input
                    value={form.categoria}
                    onChange={(e) => setForm({ ...form, categoria: e.target.value })}
                    placeholder="Ex.: Camiseta"
                  />
                </label>
                <label>
                  Subcategoria
                  <input
                    value={form.subcategoria}
                    onChange={(e) =>
                      setForm({ ...form, subcategoria: e.target.value })
                    }
                    placeholder="Ex.: Polo"
                  />
                </label>
              </div>
              <div className="form__row">
                <label>
                  Marca
                  <input
                    value={form.marca}
                    onChange={(e) => setForm({ ...form, marca: e.target.value })}
                  />
                </label>
                <label>
                  Coleção
                  <input
                    value={form.colecao}
                    onChange={(e) => setForm({ ...form, colecao: e.target.value })}
                  />
                </label>
              </div>
              <div className="form__row">
                <label>
                  Gênero
                  <select
                    value={form.genero}
                    onChange={(e) => setForm({ ...form, genero: e.target.value })}
                  >
                    <option value="">—</option>
                    {GENEROS_PRODUTO.map((g) => (
                      <option key={g} value={g}>
                        {GENERO_LABEL[g]}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Unidade
                  <select
                    value={form.unidade}
                    onChange={(e) => setForm({ ...form, unidade: e.target.value })}
                  >
                    {UNIDADES_PRODUTO.map((u) => (
                      <option key={u} value={u}>
                        {u}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <label>
                Cores (separadas por vírgula)
                <input
                  value={form.coresTexto}
                  onChange={(e) => setForm({ ...form, coresTexto: e.target.value })}
                  placeholder="Preto, Branco, Azul"
                />
              </label>
              <label>
                Tamanhos (separados por vírgula)
                <input
                  value={form.tamanhosTexto}
                  onChange={(e) =>
                    setForm({ ...form, tamanhosTexto: e.target.value })
                  }
                  placeholder="P, M, G, GG"
                />
              </label>
              {combinacoesPrevistas > 0 ? (
                <p className="dica">
                  {combinacoesPrevistas} variante{combinacoesPrevistas === 1 ? '' : 's'}{' '}
                  (cor × tamanho), cada uma com SKU e código de barras próprios.
                </p>
              ) : null}
              <div className="form__row">
                <label>
                  Preço de venda
                  <input
                    type="number"
                    min={0}
                    step="0.01"
                    value={form.preco_venda}
                    onChange={(e) =>
                      setForm({ ...form, preco_venda: Number(e.target.value) })
                    }
                  />
                </label>
                <label>
                  Preço atacado
                  <input
                    type="number"
                    min={0}
                    step="0.01"
                    value={form.preco_atacado}
                    onChange={(e) =>
                      setForm({ ...form, preco_atacado: Number(e.target.value) })
                    }
                  />
                </label>
              </div>
              <div className="form__row">
                <label>
                  Preço de custo
                  <input
                    type="number"
                    min={0}
                    step="0.01"
                    value={form.preco_custo}
                    onChange={(e) =>
                      setForm({ ...form, preco_custo: Number(e.target.value) })
                    }
                  />
                </label>
                <label>
                  Estoque mínimo
                  <input
                    type="number"
                    min={0}
                    step="1"
                    value={form.estoque_minimo}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        estoque_minimo: Number(e.target.value),
                      })
                    }
                  />
                </label>
              </div>
              <label>
                Status
                <select
                  value={form.status}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      status: e.target.value as StatusProduto,
                    })
                  }
                >
                  <option value="ativo">Ativo</option>
                  <option value="inativo">Inativo</option>
                </select>
              </label>
              <label>
                Imagem (URL)
                <input
                  value={form.imagem}
                  onChange={(e) => setForm({ ...form, imagem: e.target.value })}
                  placeholder="https://…"
                />
              </label>
              <label>
                Enviar arquivo de imagem
                <input
                  type="file"
                  accept="image/*"
                  onChange={(e) => lerImagem(e.target.files?.[0])}
                />
              </label>
              {form.imagem ? (
                <img src={form.imagem} alt="Prévia" className="produto-foto" />
              ) : null}
              <label>
                Observações
                <textarea
                  rows={3}
                  value={form.observacoes}
                  onChange={(e) =>
                    setForm({ ...form, observacoes: e.target.value })
                  }
                />
              </label>

              {modo === 'editar' && variantesEdit.length > 0 ? (
                <>
                  <h3 className="subtitulo">Variantes</h3>
                  <table className="tabela tabela--compacta">
                    <thead>
                      <tr>
                        <th>Cor</th>
                        <th>Tam.</th>
                        <th>SKU</th>
                        <th>Código</th>
                      </tr>
                    </thead>
                    <tbody>
                      {variantesEdit.map((v, idx) => (
                        <tr key={v.id}>
                          <td>{v.cor}</td>
                          <td>{v.tamanho}</td>
                          <td>
                            <input
                              aria-label={`SKU ${v.cor} ${v.tamanho}`}
                              value={v.sku}
                              onChange={(e) => {
                                const next = [...variantesEdit];
                                next[idx] = { ...v, sku: e.target.value };
                                setVariantesEdit(next);
                              }}
                            />
                          </td>
                          <td>
                            <input
                              aria-label={`Código ${v.cor} ${v.tamanho}`}
                              value={v.codigo_barras ?? ''}
                              onChange={(e) => {
                                const next = [...variantesEdit];
                                next[idx] = {
                                  ...v,
                                  codigo_barras: e.target.value,
                                };
                                setVariantesEdit(next);
                              }}
                            />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </>
              ) : null}

              <button type="submit" disabled={salvando}>
                {salvando
                  ? 'Salvando…'
                  : modo === 'editar'
                    ? 'Salvar alterações'
                    : 'Cadastrar produto'}
              </button>
            </form>
          )}
        </section>
      )}
    </main>
  );
}
