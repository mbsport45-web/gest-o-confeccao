import { useCallback, useEffect, useState } from 'react';
import {
  CATEGORIA_AVIAMENTO_LABEL,
  CATEGORIAS_AVIAMENTO,
  UNIDADES_AVIAMENTO,
  atualizarAviamento,
  atualizarStatusAviamento,
  atualizarVarianteAviamento,
  adicionarVarianteAviamento,
  criarAviamento,
  listarAviamentos,
  listarMovimentosAviamento,
  obterAviamento,
  registrarMovimentoAviamento,
  removerAviamento,
  type Aviamento,
  type AviamentoMovimento,
  type CategoriaAviamento,
  type StatusMateria,
} from './api';

type Modo = 'criar' | 'editar' | 'detalhe' | null;
type VarianteDraft = { chave: string; cor: string; tamanho: string };

type Formulario = {
  codigo: string;
  categoria: CategoriaAviamento;
  nome: string;
  modelo: string;
  marca: string;
  unidade: string;
  consumo: string;
  estoque_minimo: string;
  observacoes: string;
  variantes: VarianteDraft[];
};

const FORM_VAZIO: Formulario = {
  codigo: '',
  categoria: 'cadarco',
  nome: '',
  modelo: '',
  marca: '',
  unidade: 'MT',
  consumo: '',
  estoque_minimo: '0',
  observacoes: '',
  variantes: [{ chave: '1', cor: '', tamanho: '' }],
};

function novaChave(): string {
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function usaCor(categoria: CategoriaAviamento): boolean {
  return categoria === 'cadarco';
}

function usaTamanho(categoria: CategoriaAviamento): boolean {
  return categoria === 'saquinho' || categoria === 'etiqueta_tamanho' || categoria === 'adesivo';
}

function usaMarca(categoria: CategoriaAviamento): boolean {
  return categoria === 'tag' || categoria === 'adesivo';
}

function usaModelo(categoria: CategoriaAviamento): boolean {
  return categoria !== 'etiqueta_tamanho';
}

function usaConsumo(categoria: CategoriaAviamento): boolean {
  return categoria === 'saquinho' || categoria === 'etiqueta_tamanho';
}

function resumoVariante(variante: { cor: string | null; tamanho: string | null }): string {
  return [variante.cor, variante.tamanho].filter(Boolean).join(' · ') || 'Única';
}

function textoReferenciaAviamento(item: Aviamento): string {
  return item.codigo?.trim() || '—';
}

function textoCorAviamento(item: Aviamento): string {
  const cores = [...new Set(item.variantes.map((variante) => variante.cor?.trim()).filter(Boolean))];
  return cores.length > 0 ? cores.join(', ') : '—';
}

function classeEstoqueVariante(quantidade: number, abaixoMinimo: boolean): string {
  if (quantidade <= 0) return 'pill pill--estoque-zerado';
  if (abaixoMinimo) return 'pill pill--estoque-baixo';
  return 'pill pill--estoque-ok';
}

const LISTA_TODAS = 100;

export function AviamentosPage() {
  const [itens, setItens] = useState<Aviamento[]>([]);
  const [total, setTotal] = useState(0);
  const [q, setQ] = useState('');
  const [qDebounced, setQDebounced] = useState('');
  const [statusFiltro, setStatusFiltro] = useState<StatusMateria | ''>('');
  const [categoriaFiltro, setCategoriaFiltro] = useState('');
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [modo, setModo] = useState<Modo>(null);
  const [form, setForm] = useState<Formulario>(FORM_VAZIO);
  const [editandoId, setEditandoId] = useState<number | null>(null);
  const [detalhe, setDetalhe] = useState<Aviamento | null>(null);
  const [movimentos, setMovimentos] = useState<AviamentoMovimento[]>([]);
  const [salvando, setSalvando] = useState(false);
  const [novaVariante, setNovaVariante] = useState({ cor: '', tamanho: '' });
  const [movimento, setMovimento] = useState({
    variante_id: '',
    tipo: 'entrada' as 'entrada' | 'saida' | 'ajuste',
    quantidade: '',
    motivo: '',
  });

  useEffect(() => {
    const timer = setTimeout(() => setQDebounced(q), 300);
    return () => clearTimeout(timer);
  }, [q]);

  const recarregar = useCallback(async () => {
    try {
      setCarregando(true);
      const filtros = {
        q: qDebounced,
        status: statusFiltro,
        categoria: categoriaFiltro,
      };
      const primeira = await listarAviamentos({
        ...filtros,
        pagina: 1,
        por_pagina: LISTA_TODAS,
      });
      const todos = [...primeira.data];
      for (let pagina = 2; pagina <= primeira.total_paginas; pagina += 1) {
        const extra = await listarAviamentos({
          ...filtros,
          pagina,
          por_pagina: LISTA_TODAS,
        });
        todos.push(...extra.data);
      }
      setItens(todos);
      setTotal(primeira.total);
      setErro(null);
    } catch (err) {
      setErro((err as Error).message);
    } finally {
      setCarregando(false);
    }
  }, [qDebounced, statusFiltro, categoriaFiltro]);

  useEffect(() => {
    void recarregar();
  }, [recarregar]);

  function trocarCategoria(categoria: CategoriaAviamento) {
    setForm({
      ...form,
      categoria,
      unidade: categoria === 'cadarco' ? 'MT' : 'UN',
      consumo: categoria === 'etiqueta_tamanho' ? '1' : '',
      variantes: categoria === 'tag' ? [] : [{ chave: novaChave(), cor: '', tamanho: '' }],
    });
  }

  function abrirCriar() {
    setForm(FORM_VAZIO);
    setEditandoId(null);
    setDetalhe(null);
    setModo('criar');
    setErro(null);
  }

  async function abrirEditar(id: number) {
    const aviamento = await obterAviamento(id);
    setForm({
      codigo: aviamento.codigo ?? '',
      categoria: aviamento.categoria,
      nome: aviamento.nome,
      modelo: aviamento.modelo ?? '',
      marca: aviamento.marca ?? '',
      unidade: aviamento.unidade,
      consumo: aviamento.consumo_por_peca == null ? '' : String(aviamento.consumo_por_peca),
      estoque_minimo: String(aviamento.estoque_minimo),
      observacoes: aviamento.observacoes ?? '',
      variantes: [],
    });
    setEditandoId(id);
    setDetalhe(aviamento);
    setNovaVariante({ cor: '', tamanho: '' });
    setModo('editar');
    setErro(null);
  }

  async function abrirDetalhe(id: number) {
    const aviamento = await obterAviamento(id);
    const historico = await listarMovimentosAviamento(id);
    setDetalhe(aviamento);
    setMovimentos(historico.data);
    setMovimento({
      variante_id: String(aviamento.variantes[0]?.id ?? ''),
      tipo: 'entrada',
      quantidade: '',
      motivo: '',
    });
    setModo('detalhe');
    setErro(null);
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    try {
      setSalvando(true);
      const consumo = form.consumo.trim() === '' ? null : Number(form.consumo);
      if (modo === 'editar' && editandoId !== null) {
        await atualizarAviamento(editandoId, {
          codigo: form.codigo,
          nome: form.nome,
          modelo: form.modelo,
          marca: form.marca,
          unidade: form.unidade,
          consumo_por_peca: usaConsumo(form.categoria) ? consumo : null,
          estoque_minimo: Number(form.estoque_minimo) || 0,
          observacoes: form.observacoes,
        });
      } else {
        await criarAviamento({
          codigo: form.codigo,
          categoria: form.categoria,
          nome: form.nome,
          modelo: form.modelo,
          marca: form.marca,
          unidade: form.unidade,
          consumo_por_peca: usaConsumo(form.categoria) ? consumo : null,
          estoque_minimo: Number(form.estoque_minimo) || 0,
          observacoes: form.observacoes,
          variantes: form.variantes.map((variante) => ({
            cor: variante.cor,
            tamanho: variante.tamanho,
          })),
        });
      }
      setModo(null);
      await recarregar();
    } catch (err) {
      setErro((err as Error).message);
    } finally {
      setSalvando(false);
    }
  }

  async function excluir(aviamento: Aviamento) {
    if (!window.confirm(`Excluir o aviamento "${aviamento.nome}"?`)) return;
    try {
      await removerAviamento(aviamento.id);
      if (detalhe?.id === aviamento.id || editandoId === aviamento.id) setModo(null);
      await recarregar();
    } catch (err) {
      setErro((err as Error).message);
    }
  }

  async function alternarStatus(aviamento: Aviamento) {
    try {
      const atualizado = await atualizarStatusAviamento(
        aviamento.id,
        aviamento.status === 'ativo' ? 'inativo' : 'ativo',
      );
      if (detalhe?.id === aviamento.id) setDetalhe(atualizado);
      await recarregar();
    } catch (err) {
      setErro((err as Error).message);
    }
  }

  async function salvarVariante(varianteId: number, cor: string, tamanho: string) {
    if (!detalhe) return;
    try {
      setSalvando(true);
      const atualizado = await atualizarVarianteAviamento(detalhe.id, varianteId, { cor, tamanho });
      setDetalhe(atualizado);
      await recarregar();
    } catch (err) {
      setErro((err as Error).message);
    } finally {
      setSalvando(false);
    }
  }

  async function incluirVariante() {
    if (!detalhe) return;
    try {
      setSalvando(true);
      const atualizado = await adicionarVarianteAviamento(detalhe.id, novaVariante);
      setDetalhe(atualizado);
      setNovaVariante({ cor: '', tamanho: '' });
      await recarregar();
    } catch (err) {
      setErro((err as Error).message);
    } finally {
      setSalvando(false);
    }
  }

  async function lancarMovimento(event: React.FormEvent) {
    event.preventDefault();
    if (!detalhe || !movimento.variante_id) return;
    try {
      setSalvando(true);
      await registrarMovimentoAviamento({
        variante_id: Number(movimento.variante_id),
        tipo: movimento.tipo,
        quantidade: Number(movimento.quantidade),
        motivo: movimento.motivo,
      });
      await abrirDetalhe(detalhe.id);
      await recarregar();
    } catch (err) {
      setErro((err as Error).message);
    } finally {
      setSalvando(false);
    }
  }

  return (
    <main className="app__main app__main--materias">
      <section className="card card--wide">
        <div className="card__head">
          <h2>Matérias / Aviamentos</h2>
        </div>
        <p className="dica">
          Cadarços, saquinhos, tags, etiquetas de tamanho e adesivos têm saldo próprio.
          O consumo por peça de saquinhos e etiquetas fica registrado e ainda não é debitado na expedição.
        </p>
        <div className="materias-toolbar">
          <div className="filtros filtros--materias">
            <input
              value={q}
              onChange={(event) => setQ(event.target.value)}
              placeholder="Buscar nome, modelo, marca, cor, tamanho ou código"
              aria-label="Buscar aviamentos"
            />
            <select
              value={statusFiltro}
              onChange={(event) => setStatusFiltro(event.target.value as StatusMateria | '')}
              aria-label="Filtrar status do aviamento"
            >
              <option value="">Todos os status</option>
              <option value="ativo">Ativo</option>
              <option value="inativo">Inativo</option>
            </select>
            <select
              value={categoriaFiltro}
              onChange={(event) => setCategoriaFiltro(event.target.value)}
              aria-label="Filtrar categoria do aviamento"
            >
              <option value="">Todas as categorias</option>
              {CATEGORIAS_AVIAMENTO.map((categoria) => (
                <option key={categoria} value={categoria}>{CATEGORIA_AVIAMENTO_LABEL[categoria]}</option>
              ))}
            </select>
          </div>
          <button type="button" className="btn-secundario materias-toolbar__acao" onClick={abrirCriar}>
            Novo aviamento
          </button>
        </div>
        {erro && modo === null && <p className="erro">{erro}</p>}
        {carregando ? (
          <p className="vazio">Carregando…</p>
        ) : itens.length === 0 ? (
          <p className="vazio">Nenhum aviamento encontrado.</p>
        ) : (
          <div className="materias-tabela-rolagem">
          <table className="tabela tabela--materias" aria-label="Aviamentos">
            <thead>
              <tr>
                <th>Referência</th>
                <th>Nome</th>
                <th>Cor</th>
                <th>Unidade</th>
                <th>Estoque</th>
                <th>Custo</th>
                <th>Situação</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {itens.map((item) => (
                <tr key={item.id}>
                  <td className="materias-cel-ref">{textoReferenciaAviamento(item)}</td>
                  <td className="materias-cel-nome">
                    <strong>{item.nome}</strong>
                    <span className="materias-cel-sub">
                      {[CATEGORIA_AVIAMENTO_LABEL[item.categoria], item.modelo, item.marca].filter(Boolean).join(' · ')}
                    </span>
                  </td>
                  <td>{textoCorAviamento(item)}</td>
                  <td className="materias-cel-unidade">{item.unidade}</td>
                  <td>
                    <div className="materias-estoque-lista">
                      {item.variantes.map((variante) => (
                        <span
                          key={variante.id}
                          className={classeEstoqueVariante(variante.quantidade, variante.abaixo_minimo)}
                        >
                          {resumoVariante(variante)}: {variante.quantidade} {item.unidade}
                          {variante.abaixo_minimo && variante.quantidade > 0 ? ' (abaixo do mínimo)' : ''}
                        </span>
                      ))}
                    </div>
                  </td>
                  <td className="materias-cel-custo">—</td>
                  <td>
                    <span className={`pill pill--${item.status}`}>
                      {item.status === 'ativo' ? 'Ativo' : 'Inativo'}
                    </span>
                  </td>
                  <td className="acoes">
                    <button type="button" onClick={() => void abrirDetalhe(item.id)}>Ver</button>
                    <button type="button" onClick={() => void abrirEditar(item.id)}>Editar</button>
                    <button type="button" onClick={() => void alternarStatus(item)}>
                      {item.status === 'ativo' ? 'Inativar' : 'Ativar'}
                    </button>
                    <button type="button" className="btn-remover-texto" onClick={() => void excluir(item)}>
                      Excluir
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        )}
        <p className="materias-resumo">
          {total} aviamento{total === 1 ? '' : 's'}
        </p>
      </section>

      {modo && (
        <>
        <button
          type="button"
          className="catalogo-painel__fundo"
          aria-label="Fechar painel"
          onClick={() => setModo(null)}
        />
        <section className="card catalogo-painel">
          <div className="card__head">
            <h2>
              {modo === 'criar' && 'Novo aviamento'}
              {modo === 'editar' && 'Editar aviamento'}
              {modo === 'detalhe' && 'Aviamento'}
            </h2>
            <button type="button" className="btn-fechar" onClick={() => setModo(null)}>×</button>
          </div>
          {erro && <p className="erro">{erro}</p>}
          {modo === 'detalhe' && detalhe ? (
            <div>
              <dl className="detalhe">
                <div><dt>Categoria</dt><dd>{CATEGORIA_AVIAMENTO_LABEL[detalhe.categoria]}</dd></div>
                <div><dt>Nome</dt><dd>{detalhe.nome}</dd></div>
                <div><dt>Modelo</dt><dd>{detalhe.modelo ?? '—'}</dd></div>
                <div><dt>Marca</dt><dd>{detalhe.marca ?? '—'}</dd></div>
                <div><dt>Unidade</dt><dd>{detalhe.unidade}</dd></div>
                <div><dt>Consumo por peça</dt><dd>{detalhe.consumo_por_peca ?? '—'}</dd></div>
                <div><dt>Estoque mínimo</dt><dd>{detalhe.estoque_minimo}</dd></div>
                <div><dt>Status</dt><dd>{detalhe.status === 'ativo' ? 'Ativo' : 'Inativo'}</dd></div>
              </dl>
              {usaConsumo(detalhe.categoria) && (
                <p className="dica">O consumo por peça está guardado para a expedição. A baixa automática ainda não é aplicada.</p>
              )}
              <h3 className="subtitulo">Saldo por variante</h3>
              <table className="tabela">
                <thead>
                  <tr><th>Variante</th><th>Saldo</th><th>Status</th></tr>
                </thead>
                <tbody>
                  {detalhe.variantes.map((variante) => (
                    <tr key={variante.id}>
                      <td>{resumoVariante(variante)}</td>
                      <td>{variante.quantidade}</td>
                      <td>{variante.status === 'ativo' ? 'Ativo' : 'Inativo'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <h3 className="subtitulo">Entrada, baixa manual ou ajuste</h3>
              <form className="form" onSubmit={(event) => void lancarMovimento(event)}>
                <label>
                  Variante
                  <select
                    aria-label="Variante do movimento"
                    value={movimento.variante_id}
                    onChange={(event) => setMovimento({ ...movimento, variante_id: event.target.value })}
                  >
                    {detalhe.variantes.map((variante) => (
                      <option key={variante.id} value={variante.id}>{resumoVariante(variante)}</option>
                    ))}
                  </select>
                </label>
                <div className="form__row">
                  <label>
                    Tipo
                    <select
                      aria-label="Tipo do movimento"
                      value={movimento.tipo}
                      onChange={(event) => setMovimento({
                        ...movimento,
                        tipo: event.target.value as 'entrada' | 'saida' | 'ajuste',
                      })}
                    >
                      <option value="entrada">Entrada</option>
                      <option value="saida">Baixa manual</option>
                      <option value="ajuste">Ajuste</option>
                    </select>
                  </label>
                  <label>
                    Quantidade
                    <input
                      aria-label="Quantidade do movimento"
                      type="number"
                      min={0}
                      step="0.001"
                      required
                      value={movimento.quantidade}
                      onChange={(event) => setMovimento({ ...movimento, quantidade: event.target.value })}
                    />
                  </label>
                </div>
                <label>
                  Motivo
                  <input
                    aria-label="Motivo do movimento"
                    value={movimento.motivo}
                    required={movimento.tipo === 'ajuste'}
                    onChange={(event) => setMovimento({ ...movimento, motivo: event.target.value })}
                  />
                </label>
                <button type="submit" disabled={salvando}>Registrar movimento</button>
              </form>
              <h3 className="subtitulo">Histórico</h3>
              {movimentos.length === 0 ? (
                <p className="vazio">Nenhum movimento registrado.</p>
              ) : (
                <table className="tabela">
                  <thead>
                    <tr>
                      <th>Quando</th>
                      <th>Variante</th>
                      <th>Tipo</th>
                      <th>Qtd.</th>
                      <th>Saldo</th>
                      <th>Motivo</th>
                    </tr>
                  </thead>
                  <tbody>
                    {movimentos.map((item) => (
                      <tr key={item.id}>
                        <td>{item.criado_em}</td>
                        <td>{resumoVariante({ cor: item.cor ?? null, tamanho: item.tamanho ?? null })}</td>
                        <td>{item.tipo === 'saida' ? 'Baixa manual' : item.tipo === 'entrada' ? 'Entrada' : 'Ajuste'}</td>
                        <td>{item.quantidade}</td>
                        <td>{item.saldo_posterior}</td>
                        <td>{item.motivo ?? '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          ) : (
            <form className="form" onSubmit={(event) => void handleSubmit(event)}>
              <label>
                Categoria
                <select
                  aria-label="Categoria do aviamento"
                  value={form.categoria}
                  disabled={modo === 'editar'}
                  onChange={(event) => trocarCategoria(event.target.value as CategoriaAviamento)}
                >
                  {CATEGORIAS_AVIAMENTO.map((categoria) => (
                    <option key={categoria} value={categoria}>{CATEGORIA_AVIAMENTO_LABEL[categoria]}</option>
                  ))}
                </select>
              </label>
              <label>
                Nome
                <input required value={form.nome} onChange={(event) => setForm({ ...form, nome: event.target.value })} />
              </label>
              <div className="form__row">
                {usaModelo(form.categoria) && (
                  <label>
                    Modelo
                    <input required value={form.modelo} onChange={(event) => setForm({ ...form, modelo: event.target.value })} />
                  </label>
                )}
                {usaMarca(form.categoria) && (
                  <label>
                    Marca
                    <input required value={form.marca} onChange={(event) => setForm({ ...form, marca: event.target.value })} />
                  </label>
                )}
              </div>
              <div className="form__row">
                <label>
                  Código
                  <input value={form.codigo} onChange={(event) => setForm({ ...form, codigo: event.target.value })} />
                </label>
                <label>
                  Unidade
                  <select
                    aria-label="Unidade do aviamento"
                    value={form.unidade}
                    onChange={(event) => setForm({ ...form, unidade: event.target.value })}
                  >
                    {UNIDADES_AVIAMENTO.map((unidade) => (
                      <option key={unidade} value={unidade}>{unidade}</option>
                    ))}
                  </select>
                </label>
              </div>
              <div className="form__row">
                <label>
                  Estoque mínimo
                  <input
                    type="number"
                    min={0}
                    step="0.001"
                    value={form.estoque_minimo}
                    onChange={(event) => setForm({ ...form, estoque_minimo: event.target.value })}
                  />
                </label>
                {usaConsumo(form.categoria) && (
                  <label>
                    Consumo por peça
                    <input
                      type="number"
                      min={0}
                      step="0.001"
                      value={form.consumo}
                      onChange={(event) => setForm({ ...form, consumo: event.target.value })}
                    />
                  </label>
                )}
              </div>
              {usaConsumo(form.categoria) && (
                <p className="dica">Este consumo fica preparado para a expedição e não gera baixa automática.</p>
              )}
              <label>
                Observações
                <textarea
                  rows={2}
                  value={form.observacoes}
                  onChange={(event) => setForm({ ...form, observacoes: event.target.value })}
                />
              </label>
              {modo === 'criar' && form.categoria !== 'tag' && (
                <div>
                  <h3 className="subtitulo">{usaCor(form.categoria) ? 'Cores' : 'Tamanhos'}</h3>
                  {form.variantes.map((variante, indice) => (
                    <div className="form__row" key={variante.chave}>
                      {usaCor(form.categoria) && (
                        <label>
                          Cor
                          <input
                            required
                            aria-label={`Cor ${indice + 1}`}
                            value={variante.cor}
                            onChange={(event) => {
                              const variantes = form.variantes.map((atual) => (
                                atual.chave === variante.chave ? { ...atual, cor: event.target.value } : atual
                              ));
                              setForm({ ...form, variantes });
                            }}
                          />
                        </label>
                      )}
                      {usaTamanho(form.categoria) && (
                        <label>
                          Tamanho
                          <input
                            required
                            aria-label={`Tamanho ${indice + 1}`}
                            value={variante.tamanho}
                            onChange={(event) => {
                              const variantes = form.variantes.map((atual) => (
                                atual.chave === variante.chave ? { ...atual, tamanho: event.target.value } : atual
                              ));
                              setForm({ ...form, variantes });
                            }}
                          />
                        </label>
                      )}
                      {form.variantes.length > 1 && (
                        <button
                          type="button"
                          className="btn-secundario"
                          onClick={() => setForm({
                            ...form,
                            variantes: form.variantes.filter((atual) => atual.chave !== variante.chave),
                          })}
                        >
                          Remover
                        </button>
                      )}
                    </div>
                  ))}
                  <button
                    type="button"
                    className="btn-secundario"
                    onClick={() => setForm({
                      ...form,
                      variantes: [...form.variantes, { chave: novaChave(), cor: '', tamanho: '' }],
                    })}
                  >
                    Adicionar variante
                  </button>
                </div>
              )}
              {modo === 'editar' && detalhe && detalhe.categoria !== 'tag' && (
                <div>
                  <h3 className="subtitulo">Variantes</h3>
                  {detalhe.variantes.map((variante) => (
                    <VarianteEditavel
                      key={variante.id}
                      categoria={detalhe.categoria}
                      cor={variante.cor ?? ''}
                      tamanho={variante.tamanho ?? ''}
                      saldo={variante.quantidade}
                      salvando={salvando}
                      onSalvar={(cor, tamanho) => void salvarVariante(variante.id, cor, tamanho)}
                    />
                  ))}
                  <div className="form__row">
                    {usaCor(detalhe.categoria) && (
                      <label>
                        Nova cor
                        <input
                          aria-label="Nova cor"
                          value={novaVariante.cor}
                          onChange={(event) => setNovaVariante({ ...novaVariante, cor: event.target.value })}
                        />
                      </label>
                    )}
                    {usaTamanho(detalhe.categoria) && (
                      <label>
                        Novo tamanho
                        <input
                          aria-label="Novo tamanho"
                          value={novaVariante.tamanho}
                          onChange={(event) => setNovaVariante({ ...novaVariante, tamanho: event.target.value })}
                        />
                      </label>
                    )}
                    <button type="button" className="btn-secundario" disabled={salvando} onClick={() => void incluirVariante()}>
                      Incluir variante
                    </button>
                  </div>
                </div>
              )}
              <button type="submit" disabled={salvando}>{salvando ? 'Salvando…' : 'Salvar'}</button>
            </form>
          )}
        </section>
        </>
      )}
    </main>
  );
}

function VarianteEditavel({
  categoria,
  cor,
  tamanho,
  saldo,
  salvando,
  onSalvar,
}: {
  categoria: CategoriaAviamento;
  cor: string;
  tamanho: string;
  saldo: number;
  salvando: boolean;
  onSalvar: (cor: string, tamanho: string) => void;
}) {
  const [corAtual, setCorAtual] = useState(cor);
  const [tamanhoAtual, setTamanhoAtual] = useState(tamanho);
  return (
    <div className="form__row">
      {usaCor(categoria) && (
        <label>
          Cor
          <input aria-label={`Editar cor ${cor || saldo}`} value={corAtual} onChange={(event) => setCorAtual(event.target.value)} />
        </label>
      )}
      {usaTamanho(categoria) && (
        <label>
          Tamanho
          <input aria-label={`Editar tamanho ${tamanho || saldo}`} value={tamanhoAtual} onChange={(event) => setTamanhoAtual(event.target.value)} />
        </label>
      )}
      <span>Saldo {saldo}</span>
      <button type="button" className="btn-secundario" disabled={salvando} onClick={() => onSalvar(corAtual, tamanhoAtual)}>
        Salvar variante
      </button>
    </div>
  );
}
