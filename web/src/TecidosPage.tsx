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
  estoque_minimo: 0,
  status: 'ativo',
};

type CorForm = {
  chave: string;
  id?: number;
  nome: string;
  estoque: number;
  estoque_inicial: number;
  estoque_minimo: number;
  status: StatusMateria;
};

function corVazia(): CorForm {
  return {
    chave: crypto.randomUUID(),
    nome: '',
    estoque: 0,
    estoque_inicial: 0,
    estoque_minimo: 0,
    status: 'ativo',
  };
}

function rotuloCores(tecido: Tecido): string {
  const nomes = (tecido.cores ?? []).map((cor) => cor.nome).filter(Boolean);
  if (nomes.length > 0) return nomes.join(', ');
  return tecido.cor ?? '';
}

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
  const [coresForm, setCoresForm] = useState<CorForm[]>([corVazia()]);
  const [novaCategoria, setNovaCategoria] = useState('');
  const [editandoId, setEditandoId] = useState<number | null>(null);
  const [detalhe, setDetalhe] = useState<Tecido | null>(null);
  const [movimentos, setMovimentos] = useState<TecidoMovimento[]>([]);
  const [movimento, setMovimento] = useState({
    tipo: 'entrada' as 'entrada' | 'saida' | 'ajuste',
    quantidade: 0,
    motivo: '',
    tecido_cor_id: '',
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
    setCoresForm([corVazia()]);
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
      estoque_minimo: tecido.estoque_minimo,
      status: tecido.status,
    });
    const atuais = tecido.cores ?? [];
    setCoresForm(
      atuais.length > 0
        ? atuais.map((cor) => ({
            chave: String(cor.id),
            id: cor.id,
            nome: cor.nome,
            estoque: cor.estoque,
            estoque_inicial: 0,
            estoque_minimo: cor.estoque_minimo,
            status: cor.status,
          }))
        : [corVazia()],
    );
    setNovaCategoria('');
    setEditandoId(tecido.id);
    setModo('editar');
    setErro(null);
  }

  async function abrirDetalhe(tecido: Tecido) {
    setDetalhe(tecido);
    setModo('detalhe');
    setMovimento({
      tipo: 'entrada',
      quantidade: 0,
      motivo: '',
      tecido_cor_id: tecido.cores?.length === 1 ? String(tecido.cores[0].id) : '',
    });
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
      const preenchidas = coresForm.filter((cor) => cor.nome.trim() || cor.id);
      if (preenchidas.some((cor) => !cor.nome.trim())) {
        setErro('Informe o nome da cor');
        return;
      }
      const nomes = new Set<string>();
      for (const cor of preenchidas) {
        const chave = cor.nome.trim().toLocaleLowerCase('pt-BR');
        if (nomes.has(chave)) {
          setErro(`Já existe a cor ${cor.nome.trim()} neste tecido`);
          return;
        }
        nomes.add(chave);
      }
      const categoria = await categoriaEscolhida();
      const cores = preenchidas.map((cor) => ({
        id: cor.id,
        nome: cor.nome.trim(),
        estoque_inicial: cor.id ? undefined : Number(cor.estoque_inicial) || 0,
        estoque_minimo: Number(cor.estoque_minimo) || 0,
        status: cor.status,
      }));
      const comum = {
        nome: form.nome,
        categoria,
        unidade: form.unidade,
        largura_cm: form.largura_cm ?? null,
        gramatura: form.gramatura ?? null,
        custo: form.custo,
        fornecedor: form.fornecedor || undefined,
        estoque_minimo: form.estoque_minimo,
        status: form.status,
        cores,
      };
      if (modo === 'editar' && editandoId) {
        await atualizarTecido(editandoId, comum);
      } else {
        await criarTecido(comum);
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
    const cores = detalhe.cores ?? [];
    if (cores.length > 1 && !movimento.tecido_cor_id) {
      setErro('Selecione a cor do tecido');
      return;
    }
    setSalvando(true);
    setErro(null);
    try {
      const resposta = await movimentarTecido(detalhe.id, {
        tipo: movimento.tipo,
        quantidade: Number(movimento.quantidade),
        unidade: detalhe.unidade,
        motivo: movimento.motivo || undefined,
        tecido_cor_id: movimento.tecido_cor_id ? Number(movimento.tecido_cor_id) : undefined,
      });
      setDetalhe(resposta.tecido);
      setMovimentos(await listarMovimentosTecido(detalhe.id));
      setMovimento({
        tipo: 'entrada',
        quantidade: 0,
        motivo: '',
        tecido_cor_id:
          resposta.tecido.cores?.length === 1 ? String(resposta.tecido.cores[0].id) : movimento.tecido_cor_id,
      });
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
              O tecido é cadastrado uma vez. Cada cor é uma variante com estoque próprio, na unidade do tecido.
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
                    {rotuloCores(tecido) ? ` · ${rotuloCores(tecido)}` : ''}
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
                  <td>{tecido.cores?.length ? 'por cor' : qtd.format(tecido.estoque_minimo)}</td>
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
                {(detalhe.cores ?? []).length === 0 && (
                  <div><dt>Estoque mínimo</dt><dd>{qtd.format(detalhe.estoque_minimo)} {detalhe.unidade}</dd></div>
                )}
                <div><dt>Largura (cm)</dt><dd>{detalhe.largura_cm ?? '—'}</dd></div>
                <div><dt>Gramatura</dt><dd>{detalhe.gramatura ?? '—'}</dd></div>
                <div><dt>Fornecedor</dt><dd>{detalhe.fornecedor ?? '—'}</dd></div>
                <div><dt>Cores</dt><dd>{rotuloCores(detalhe) || '—'}</dd></div>
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
              {(detalhe.cores ?? []).length > 0 && (
                  <table className="tabela tabela--compacta cores-tecido">
                    <thead>
                      <tr>
                        <th>Cor</th>
                        <th>Estoque</th>
                        <th>Estoque mínimo</th>
                        <th>Situação</th>
                      </tr>
                    </thead>
                    <tbody>
                      {detalhe.cores.map((cor) => (
                        <tr key={cor.id}>
                          <td>{cor.nome}</td>
                          <td>{qtd.format(cor.estoque)} {detalhe.unidade}</td>
                          <td>{qtd.format(cor.estoque_minimo)}</td>
                          <td>{cor.status === 'ativo' ? 'Ativo' : 'Inativo'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
              )}
              <form className="form" onSubmit={(e) => void registrarMovimento(e)}>
                <h3>Movimentar estoque</h3>
                <p className="dica">A quantidade entra em {detalhe.unidade}. Outra unidade é recusada.</p>
                <div className="form__row">
                  {(detalhe.cores ?? []).length > 1 && (
                    <label>
                      Cor
                      <select
                        required
                        value={movimento.tecido_cor_id}
                        onChange={(e) => setMovimento({ ...movimento, tecido_cor_id: e.target.value })}
                      >
                        <option value="">Selecione a cor</option>
                        {detalhe.cores.map((cor) => (
                          <option key={cor.id} value={cor.id}>
                            {cor.nome} · {qtd.format(cor.estoque)} {detalhe.unidade}
                          </option>
                        ))}
                      </select>
                    </label>
                  )}
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
                      <th>Cor</th>
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
                        <td>{item.cor_nome ?? '—'}</td>
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
                  Situação do tecido
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
              <div className="cores-tecido">
                <div className="card__head">
                  <h3>Cores</h3>
                  <button
                    type="button"
                    className="btn-secundario"
                    onClick={() => setCoresForm((atual) => [...atual, corVazia()])}
                  >
                    + Adicionar cor
                  </button>
                </div>
                <p className="dica">
                  Cada cor tem o próprio estoque em {unidadeRotulo}. O custo padrão do tecido vale para todas,
                  e pode ser ajustado depois.
                </p>
                <table className="tabela tabela--compacta">
                  <thead>
                    <tr>
                      <th>Cor</th>
                      <th>{modo === 'editar' ? 'Estoque' : 'Estoque inicial'}</th>
                      <th>Estoque mínimo</th>
                      <th>Situação</th>
                    </tr>
                  </thead>
                  <tbody>
                    {coresForm.map((cor) => (
                      <tr key={cor.chave}>
                        <td>
                          <input
                            aria-label="Cor"
                            value={cor.nome}
                            placeholder="Preto, Branco, Azul..."
                            onChange={(e) =>
                              setCoresForm((atual) =>
                                atual.map((item) =>
                                  item.chave === cor.chave ? { ...item, nome: e.target.value } : item,
                                ),
                              )
                            }
                          />
                        </td>
                        <td>
                          {cor.id ? (
                            <span>
                              {qtd.format(cor.estoque)} {unidadeRotulo}
                            </span>
                          ) : (
                            <input
                              aria-label={`Estoque inicial ${cor.nome || 'da cor'}`}
                              type="number"
                              min={0}
                              step="0.001"
                              value={cor.estoque_inicial}
                              onChange={(e) =>
                                setCoresForm((atual) =>
                                  atual.map((item) =>
                                    item.chave === cor.chave
                                      ? { ...item, estoque_inicial: Number(e.target.value) }
                                      : item,
                                  ),
                                )
                              }
                            />
                          )}
                        </td>
                        <td>
                          <input
                            aria-label={`Estoque mínimo ${cor.nome || 'da cor'}`}
                            type="number"
                            min={0}
                            step="0.001"
                            value={cor.estoque_minimo}
                            onChange={(e) =>
                              setCoresForm((atual) =>
                                atual.map((item) =>
                                  item.chave === cor.chave
                                    ? { ...item, estoque_minimo: Number(e.target.value) }
                                    : item,
                                ),
                              )
                            }
                          />
                        </td>
                        <td>
                          <select
                            aria-label={`Situação ${cor.nome || 'da cor'}`}
                            value={cor.status}
                            onChange={(e) =>
                              setCoresForm((atual) =>
                                atual.map((item) =>
                                  item.chave === cor.chave
                                    ? { ...item, status: e.target.value as StatusMateria }
                                    : item,
                                ),
                              )
                            }
                          >
                            <option value="ativo">Ativo</option>
                            <option value="inativo">Inativo</option>
                          </select>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
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
