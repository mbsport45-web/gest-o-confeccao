import { useCallback, useEffect, useState } from 'react';
import {
  UNIDADES_TECIDO,
  atualizarStatusTecido,
  atualizarTecido,
  criarCategoriaTecido,
  criarTecido,
  listarCategoriasTecido,
  listarMovimentosTecido,
  listarTecidos,
  movimentarTecido,
  type StatusMateria,
  type Tecido,
  type TecidoCategoria,
  type TecidoMovimento,
  type TecidoPayload,
  type UnidadeTecido,
  type AssinaturaEmpresa,
} from './api';
import { AvisoLimite, podeCriarNoPlano } from './AvisoLimite';

type Modo = 'criar' | 'editar' | 'detalhe' | null;

const FORM_VAZIO: TecidoPayload = {
  nome: '',
  categoria: 'Malharia',
  unidade: 'KG',
  largura_cm: undefined,
  gramatura: undefined,
  custo: 0,
  fornecedor: '',
  cor: '',
  estoque_inicial: 0,
  estoque_minimo: 0,
  status: 'ativo',
};

function numeroOuNulo(valor: string): number | null {
  if (valor.trim() === '') return null;
  const n = Number(valor);
  return Number.isFinite(n) ? n : null;
}

const qtd = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 3 });
const moeda = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });

export function TecidosPage({ sessao }: { sessao: { assinatura: AssinaturaEmpresa } }) {
  const [tecidos, setTecidos] = useState<Tecido[]>([]);
  const [categorias, setCategorias] = useState<TecidoCategoria[]>([]);
  const [pagina, setPagina] = useState(1);
  const [totalPaginas, setTotalPaginas] = useState(1);
  const [q, setQ] = useState('');
  const [qDebounced, setQDebounced] = useState('');
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [modo, setModo] = useState<Modo>(null);
  const [form, setForm] = useState<TecidoPayload>(FORM_VAZIO);
  const [novaCategoria, setNovaCategoria] = useState('');
  const [editandoId, setEditandoId] = useState<number | null>(null);
  const [detalhe, setDetalhe] = useState<Tecido | null>(null);
  const [movimentos, setMovimentos] = useState<TecidoMovimento[]>([]);
  const [movimento, setMovimento] = useState({
    tipo: 'entrada' as 'entrada' | 'saida' | 'ajuste',
    quantidade: 0,
    motivo: '',
  });
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => {
      setQDebounced(q);
      setPagina(1);
    }, 300);
    return () => clearTimeout(t);
  }, [q]);

  const recarregar = useCallback(async () => {
    try {
      const [lista, cats] = await Promise.all([
        listarTecidos({ q: qDebounced, pagina, por_pagina: 20 }),
        listarCategoriasTecido(),
      ]);
      setTecidos(lista.data);
      setTotalPaginas(lista.total_paginas);
      setCategorias(cats);
      setErro(null);
    } catch (err) {
      setErro((err as Error).message);
    } finally {
      setCarregando(false);
    }
  }, [qDebounced, pagina]);

  useEffect(() => {
    void recarregar();
  }, [recarregar]);

  function abrirCriar() {
    setForm(FORM_VAZIO);
    setNovaCategoria('');
    setEditandoId(null);
    setModo('criar');
    setErro(null);
  }

  function abrirEditar(tecido: Tecido) {
    setForm({
      nome: tecido.nome,
      categoria: tecido.categoria ?? '',
      unidade: tecido.unidade,
      largura_cm: tecido.largura_cm,
      gramatura: tecido.gramatura,
      custo: tecido.custo,
      fornecedor: tecido.fornecedor ?? '',
      cor: tecido.cor ?? '',
      estoque_minimo: tecido.estoque_minimo,
      status: tecido.status,
    });
    setNovaCategoria('');
    setEditandoId(tecido.id);
    setModo('editar');
    setErro(null);
  }

  async function abrirDetalhe(tecido: Tecido) {
    setDetalhe(tecido);
    setModo('detalhe');
    setMovimento({ tipo: 'entrada', quantidade: 0, motivo: '' });
    try {
      setMovimentos(await listarMovimentosTecido(tecido.id));
    } catch (err) {
      setErro((err as Error).message);
    }
  }

  async function categoriaEscolhida(): Promise<string> {
    const nome = novaCategoria.trim();
    if (!nome) return form.categoria;
    const criada = await criarCategoriaTecido(nome);
    setCategorias((atual) =>
      atual.some((item) => item.id === criada.id) ? atual : [...atual, criada],
    );
    return criada.nome;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSalvando(true);
    setErro(null);
    try {
      const categoria = await categoriaEscolhida();
      const comum = {
        nome: form.nome,
        categoria,
        unidade: form.unidade,
        largura_cm: form.largura_cm ?? null,
        gramatura: form.gramatura ?? null,
        custo: form.custo,
        fornecedor: form.fornecedor || undefined,
        cor: form.cor || undefined,
        estoque_minimo: form.estoque_minimo,
        status: form.status,
      };
      if (modo === 'editar' && editandoId) {
        await atualizarTecido(editandoId, comum);
      } else {
        await criarTecido({ ...comum, estoque_inicial: form.estoque_inicial });
      }
      setModo(null);
      await recarregar();
    } catch (err) {
      setErro((err as Error).message);
    } finally {
      setSalvando(false);
    }
  }

  async function registrarMovimento(e: React.FormEvent) {
    e.preventDefault();
    if (!detalhe) return;
    setSalvando(true);
    setErro(null);
    try {
      const resposta = await movimentarTecido(detalhe.id, {
        tipo: movimento.tipo,
        quantidade: Number(movimento.quantidade),
        unidade: detalhe.unidade,
        motivo: movimento.motivo || undefined,
      });
      setDetalhe(resposta.tecido);
      setMovimentos(await listarMovimentosTecido(detalhe.id));
      setMovimento({ tipo: 'entrada', quantidade: 0, motivo: '' });
      await recarregar();
    } catch (err) {
      setErro((err as Error).message);
    } finally {
      setSalvando(false);
    }
  }

  const unidadeRotulo = form.unidade === 'KG' ? 'KG' : 'METRO';
  const podeCriar = podeCriarNoPlano(sessao.assinatura, 'materiais');

  return (
    <main className="app__main">
      <section className="card card--wide">
        <div className="card__head">
          <div>
            <h2>Tecidos</h2>
            <p className="dica">
              Cada tecido tem a própria unidade. O custo e o estoque seguem KG ou metro, conforme o cadastro.
            </p>
          </div>
          <button type="button" onClick={abrirCriar} disabled={!podeCriar}>
            Novo tecido
          </button>
        </div>
        <AvisoLimite assinatura={sessao.assinatura} chave="materiais" />
        <label>
          Pesquisar
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Nome, cor, fornecedor ou categoria"
          />
        </label>
        {erro && modo === null && <p className="erro">{erro}</p>}
        {carregando ? (
          <p>Carregando...</p>
        ) : tecidos.length === 0 ? (
          <p className="vazio">Nenhum tecido cadastrado.</p>
        ) : (
          <table className="tabela">
            <thead>
              <tr>
                <th>Tecido</th>
                <th>Categoria</th>
                <th>Unidade</th>
                <th>Custo</th>
                <th>Estoque</th>
                <th>Mínimo</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {tecidos.map((tecido) => (
                <tr key={tecido.id} onClick={() => void abrirDetalhe(tecido)}>
                  <td>
                    {tecido.nome}
                    {tecido.cor ? ` · ${tecido.cor}` : ''}
                  </td>
                  <td>{tecido.categoria ?? '—'}</td>
                  <td>{tecido.unidade}</td>
                  <td>
                    {moeda.format(tecido.custo)}
                    <span className="dica"> {tecido.unidade_custo}</span>
                  </td>
                  <td>
                    {qtd.format(tecido.estoque)} {tecido.unidade === 'KG' ? 'KG' : 'METROS'}
                  </td>
                  <td>{qtd.format(tecido.estoque_minimo)}</td>
                  <td>
                    <span className={`pill pill--${tecido.status}`}>
                      {tecido.status === 'ativo' ? 'Ativo' : 'Inativo'}
                    </span>
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

      {modo && (
        <section className="card">
          <div className="card__head">
            <h2>
              {modo === 'criar' && 'Novo tecido'}
              {modo === 'editar' && 'Editar tecido'}
              {modo === 'detalhe' && detalhe?.nome}
            </h2>
            <button type="button" className="btn-fechar" onClick={() => setModo(null)}>
              ×
            </button>
          </div>
          {erro && <p className="erro">{erro}</p>}
          {modo === 'detalhe' && detalhe ? (
            <>
              <dl className="detalhe">
                <div><dt>Categoria</dt><dd>{detalhe.categoria ?? '—'}</dd></div>
                <div><dt>Unidade de controle</dt><dd>{detalhe.unidade}</dd></div>
                <div><dt>Custo</dt><dd>{moeda.format(detalhe.custo)} {detalhe.unidade_custo}</dd></div>
                <div><dt>Estoque</dt><dd>{qtd.format(detalhe.estoque)} {detalhe.unidade}</dd></div>
                <div><dt>Estoque mínimo</dt><dd>{qtd.format(detalhe.estoque_minimo)} {detalhe.unidade}</dd></div>
                <div><dt>Largura (cm)</dt><dd>{detalhe.largura_cm ?? '—'}</dd></div>
                <div><dt>Gramatura</dt><dd>{detalhe.gramatura ?? '—'}</dd></div>
                <div><dt>Fornecedor</dt><dd>{detalhe.fornecedor ?? '—'}</dd></div>
                <div><dt>Cor</dt><dd>{detalhe.cor ?? '—'}</dd></div>
                <div>
                  <dt>Status</dt>
                  <dd>{detalhe.status === 'ativo' ? 'Ativo' : 'Inativo'}</dd>
                </div>
              </dl>
              <div className="detalhe__acoes">
                <button type="button" onClick={() => abrirEditar(detalhe)}>Editar</button>
                <button
                  type="button"
                  onClick={() =>
                    void atualizarStatusTecido(
                      detalhe.id,
                      detalhe.status === 'ativo' ? 'inativo' : 'ativo',
                    ).then(async (atualizado) => {
                      setDetalhe(atualizado);
                      await recarregar();
                    })
                  }
                >
                  {detalhe.status === 'ativo' ? 'Inativar' : 'Ativar'}
                </button>
              </div>
              <form className="form" onSubmit={(e) => void registrarMovimento(e)}>
                <h3>Movimentar estoque</h3>
                <p className="dica">A quantidade entra em {detalhe.unidade}. Outra unidade é recusada.</p>
                <div className="form__row">
                  <label>
                    Tipo
                    <select
                      value={movimento.tipo}
                      onChange={(e) =>
                        setMovimento({
                          ...movimento,
                          tipo: e.target.value as 'entrada' | 'saida' | 'ajuste',
                        })
                      }
                    >
                      <option value="entrada">Entrada</option>
                      <option value="saida">Saída</option>
                      <option value="ajuste">Ajuste</option>
                    </select>
                  </label>
                  <label>
                    Quantidade ({detalhe.unidade})
                    <input
                      type="number"
                      min={0}
                      step="0.001"
                      value={movimento.quantidade}
                      onChange={(e) =>
                        setMovimento({ ...movimento, quantidade: Number(e.target.value) })
                      }
                    />
                  </label>
                  <label>
                    Motivo
                    <input
                      value={movimento.motivo}
                      onChange={(e) => setMovimento({ ...movimento, motivo: e.target.value })}
                    />
                  </label>
                </div>
                <button type="submit" disabled={salvando}>Registrar</button>
              </form>
              {movimentos.length > 0 && (
                <table className="tabela tabela--compacta">
                  <thead>
                    <tr>
                      <th>Data</th>
                      <th>Tipo</th>
                      <th>Qtd</th>
                      <th>Unidade</th>
                      <th>Anterior</th>
                      <th>Posterior</th>
                      <th>Motivo</th>
                      <th>Usuário</th>
                    </tr>
                  </thead>
                  <tbody>
                    {movimentos.map((item) => (
                      <tr key={item.id}>
                        <td>{item.criado_em}</td>
                        <td>{item.tipo}</td>
                        <td>{qtd.format(item.quantidade)}</td>
                        <td>{item.unidade}</td>
                        <td>{qtd.format(item.saldo_anterior)}</td>
                        <td>{qtd.format(item.saldo_posterior)}</td>
                        <td>{item.motivo ?? '—'}</td>
                        <td>{item.usuario_nome ?? '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </>
          ) : (
            <form className="form" onSubmit={(e) => void handleSubmit(e)}>
              <label>
                Nome do tecido
                <input
                  required
                  value={form.nome}
                  onChange={(e) => setForm({ ...form, nome: e.target.value })}
                  placeholder="Dryfit, Tactel com elastano, Sarja..."
                />
              </label>
              <div className="form__row">
                <label>
                  Categoria
                  <select
                    value={form.categoria}
                    onChange={(e) => setForm({ ...form, categoria: e.target.value })}
                  >
                    {categorias.map((categoria) => (
                      <option key={categoria.id} value={categoria.nome}>
                        {categoria.nome}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Nova categoria
                  <input
                    value={novaCategoria}
                    onChange={(e) => setNovaCategoria(e.target.value)}
                    placeholder="Opcional, se não estiver na lista"
                  />
                </label>
              </div>
              <div className="form__row">
                <label>
                  Unidade de controle
                  <select
                    value={form.unidade}
                    onChange={(e) =>
                      setForm({ ...form, unidade: e.target.value as UnidadeTecido })
                    }
                    disabled={modo === 'editar'}
                  >
                    {UNIDADES_TECIDO.map((unidade) => (
                      <option key={unidade} value={unidade}>
                        {unidade}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Custo (R$/{unidadeRotulo})
                  <input
                    type="number"
                    min={0}
                    step="0.01"
                    value={form.custo}
                    onChange={(e) => setForm({ ...form, custo: Number(e.target.value) })}
                  />
                </label>
              </div>
              <div className="form__row">
                <label>
                  Largura (cm)
                  <input
                    type="number"
                    min={0}
                    step="0.1"
                    value={form.largura_cm ?? ''}
                    onChange={(e) =>
                      setForm({ ...form, largura_cm: numeroOuNulo(e.target.value) })
                    }
                  />
                </label>
                <label>
                  Gramatura
                  <input
                    type="number"
                    min={0}
                    step="1"
                    value={form.gramatura ?? ''}
                    onChange={(e) =>
                      setForm({ ...form, gramatura: numeroOuNulo(e.target.value) })
                    }
                  />
                </label>
              </div>
              <div className="form__row">
                <label>
                  Fornecedor
                  <input
                    value={form.fornecedor ?? ''}
                    onChange={(e) => setForm({ ...form, fornecedor: e.target.value })}
                  />
                </label>
                <label>
                  Cor
                  <input
                    value={form.cor ?? ''}
                    onChange={(e) => setForm({ ...form, cor: e.target.value })}
                  />
                </label>
              </div>
              <div className="form__row">
                {modo === 'criar' && (
                  <label>
                    Estoque inicial ({unidadeRotulo})
                    <input
                      type="number"
                      min={0}
                      step="0.001"
                      value={form.estoque_inicial ?? 0}
                      onChange={(e) =>
                        setForm({ ...form, estoque_inicial: Number(e.target.value) })
                      }
                    />
                  </label>
                )}
                <label>
                  Estoque mínimo ({unidadeRotulo})
                  <input
                    type="number"
                    min={0}
                    step="0.001"
                    value={form.estoque_minimo ?? 0}
                    onChange={(e) =>
                      setForm({ ...form, estoque_minimo: Number(e.target.value) })
                    }
                  />
                </label>
                <label>
                  Situação
                  <select
                    value={form.status ?? 'ativo'}
                    onChange={(e) =>
                      setForm({ ...form, status: e.target.value as StatusMateria })
                    }
                  >
                    <option value="ativo">Ativo</option>
                    <option value="inativo">Inativo</option>
                  </select>
                </label>
              </div>
              <button type="submit" disabled={salvando}>
                {modo === 'editar' ? 'Salvar' : 'Cadastrar tecido'}
              </button>
            </form>
          )}
        </section>
      )}
    </main>
  );
}
