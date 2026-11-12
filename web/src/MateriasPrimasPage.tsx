import { useCallback, useEffect, useState } from 'react';
import {
  TIPOS_MATERIA,
  TIPO_MATERIA_LABEL,
  UNIDADES_MATERIA,
  atualizarMateriaPrima,
  atualizarStatusMateriaPrima,
  criarMateriaPrima,
  listarMateriasPrimas,
  obterMateriaPrima,
  removerMateriaPrima,
  type MateriaPrima,
  type MateriaPrimaPayload,
  type StatusMateria,
  type TipoMateria,
  type AssinaturaEmpresa,
} from './api';
import { AvisoLimite, podeCriarNoPlano } from './AvisoLimite';

type ModoPainel = 'criar' | 'editar' | 'detalhe' | null;

const FORM_VAZIO: MateriaPrimaPayload = {
  codigo: '',
  nome: '',
  descricao: '',
  tipo: 'tecido',
  categoria: '',
  cor: '',
  composicao: '',
  largura_cm: undefined,
  gramatura: undefined,
  unidade: 'KG',
  custo: 0,
  estoque_minimo: 0,
  fornecedor: '',
  referencia_fornecedor: '',
  ncm: '',
  status: 'ativo',
  observacoes: '',
};

function materiaParaForm(m: MateriaPrima): MateriaPrimaPayload {
  return {
    codigo: m.codigo ?? '',
    nome: m.nome,
    descricao: m.descricao ?? '',
    tipo: m.tipo,
    categoria: m.categoria ?? '',
    cor: m.cor ?? '',
    composicao: m.composicao ?? '',
    largura_cm: m.largura_cm ?? undefined,
    gramatura: m.gramatura ?? undefined,
    unidade: m.unidade || 'UN',
    custo: m.custo,
    estoque_minimo: m.estoque_minimo,
    fornecedor: m.fornecedor ?? '',
    referencia_fornecedor: m.referencia_fornecedor ?? '',
    ncm: m.ncm ?? '',
    status: m.status,
    observacoes: m.observacoes ?? '',
  };
}

const moeda = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
});

const quantidade = new Intl.NumberFormat('pt-BR', {
  maximumFractionDigits: 3,
});

function textoReferencia(m: MateriaPrima) {
  return m.codigo?.trim() || m.referencia_fornecedor?.trim() || '—';
}

function textoNomeDescricao(m: MateriaPrima) {
  const descricao = m.descricao?.trim();
  return descricao ? `${m.nome} · ${descricao}` : m.nome;
}

function textoCor(cor: string | null | undefined) {
  return cor?.trim() || '—';
}

function textoEstoque(m: MateriaPrima) {
  return `${quantidade.format(Number(m.estoque_atual) || 0)} ${m.unidade}`;
}

function classeEstoque(m: MateriaPrima) {
  const atual = Number(m.estoque_atual) || 0;
  if (atual <= 0) return 'pill pill--estoque-zerado';
  if (m.estoque_minimo > 0 && atual < m.estoque_minimo) return 'pill pill--estoque-baixo';
  return 'pill pill--estoque-ok';
}

function textoCusto(m: MateriaPrima) {
  return `${moeda.format(m.custo)} / ${m.unidade}`;
}

const LISTA_TODAS = 100;

export function MateriasPrimasPage({ sessao }: { sessao: { assinatura: AssinaturaEmpresa } }) {
  const [materias, setMaterias] = useState<MateriaPrima[]>([]);
  const [total, setTotal] = useState(0);
  const [q, setQ] = useState('');
  const [qDebounced, setQDebounced] = useState('');
  const [statusFiltro, setStatusFiltro] = useState<StatusMateria | ''>('');
  const [tipoFiltro, setTipoFiltro] = useState('');
  const [categoriaFiltro, setCategoriaFiltro] = useState('');
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [modo, setModo] = useState<ModoPainel>(null);
  const [form, setForm] = useState<MateriaPrimaPayload>(FORM_VAZIO);
  const [editandoId, setEditandoId] = useState<number | null>(null);
  const [detalhe, setDetalhe] = useState<MateriaPrima | null>(null);
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setQDebounced(q), 300);
    return () => clearTimeout(t);
  }, [q]);

  const recarregar = useCallback(async () => {
    try {
      setCarregando(true);
      const filtros = {
        q: qDebounced,
        status: statusFiltro,
        tipo: tipoFiltro,
        categoria: categoriaFiltro,
      };
      const primeira = await listarMateriasPrimas({
        ...filtros,
        pagina: 1,
        por_pagina: LISTA_TODAS,
      });
      const itens = [...primeira.data];
      for (let pagina = 2; pagina <= primeira.total_paginas; pagina += 1) {
        const extra = await listarMateriasPrimas({
          ...filtros,
          pagina,
          por_pagina: LISTA_TODAS,
        });
        itens.push(...extra.data);
      }
      setMaterias(itens);
      setTotal(primeira.total);
      setErro(null);
    } catch (e) {
      setErro((e as Error).message);
    } finally {
      setCarregando(false);
    }
  }, [qDebounced, statusFiltro, tipoFiltro, categoriaFiltro]);

  useEffect(() => {
    recarregar();
  }, [recarregar]);

  function abrirCriar() {
    if (!podeCriarNoPlano(sessao.assinatura, 'materiais')) return;
    setForm(FORM_VAZIO);
    setEditandoId(null);
    setDetalhe(null);
    setModo('criar');
  }

  async function abrirEditar(id: number) {
    const materia = await obterMateriaPrima(id);
    setForm(materiaParaForm(materia));
    setEditandoId(id);
    setDetalhe(null);
    setModo('editar');
  }

  async function abrirDetalhe(id: number) {
    const materia = await obterMateriaPrima(id);
    setDetalhe(materia);
    setModo('detalhe');
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    try {
      setSalvando(true);
      const payload: MateriaPrimaPayload = {
        ...form,
        custo: Number(form.custo) || 0,
        estoque_minimo: Number(form.estoque_minimo) || 0,
        largura_cm:
          form.largura_cm === undefined || form.largura_cm === null
            ? undefined
            : Number(form.largura_cm),
        gramatura:
          form.gramatura === undefined || form.gramatura === null
            ? undefined
            : Number(form.gramatura),
      };
      if (modo === 'editar' && editandoId !== null) {
        await atualizarMateriaPrima(editandoId, payload);
      } else {
        await criarMateriaPrima(payload);
      }
      setModo(null);
      await recarregar();
    } catch (err) {
      setErro((err as Error).message);
    } finally {
      setSalvando(false);
    }
  }

  async function alternarStatus(materia: MateriaPrima) {
    try {
      await atualizarStatusMateriaPrima(
        materia.id,
        materia.status === 'ativo' ? 'inativo' : 'ativo',
      );
      if (detalhe?.id === materia.id) {
        setDetalhe(await obterMateriaPrima(materia.id));
      }
      await recarregar();
    } catch (err) {
      setErro((err as Error).message);
    }
  }

  async function excluir(materia: MateriaPrima) {
    if (!window.confirm(`Excluir a matéria-prima "${materia.nome}"?`)) return;
    try {
      await removerMateriaPrima(materia.id);
      if (detalhe?.id === materia.id || editandoId === materia.id) {
        setModo(null);
      }
      await recarregar();
    } catch (err) {
      setErro((err as Error).message);
    }
  }

  return (
    <main className="app__main app__main--materias">
      <section className="card card--wide">
        <div className="card__head">
          <h2>Matérias-primas</h2>
        </div>
        <AvisoLimite assinatura={sessao.assinatura} chave="materiais" />

        <div className="materias-toolbar">
          <div className="filtros filtros--materias">
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Buscar nome, código, cor, fornecedor…"
              aria-label="Buscar matérias-primas"
            />
            <select
              value={statusFiltro}
              onChange={(e) =>
                setStatusFiltro(e.target.value as StatusMateria | '')
              }
              aria-label="Filtrar status"
            >
              <option value="">Todos os status</option>
              <option value="ativo">Ativo</option>
              <option value="inativo">Inativo</option>
            </select>
            <select
              value={tipoFiltro}
              onChange={(e) => setTipoFiltro(e.target.value)}
              aria-label="Filtrar tipo"
            >
              <option value="">Todos os tipos</option>
              {TIPOS_MATERIA.map((t) => (
                <option key={t} value={t}>
                  {TIPO_MATERIA_LABEL[t]}
                </option>
              ))}
            </select>
            <input
              value={categoriaFiltro}
              onChange={(e) => setCategoriaFiltro(e.target.value)}
              placeholder="Categoria"
              aria-label="Filtrar categoria"
            />
          </div>
          <button
            type="button"
            className="btn-secundario materias-toolbar__acao"
            onClick={abrirCriar}
            disabled={!podeCriarNoPlano(sessao.assinatura, 'materiais')}
          >
            Nova matéria-prima
          </button>
        </div>

        {erro && <p className="erro">{erro}</p>}

        {carregando ? (
          <p className="vazio">Carregando…</p>
        ) : materias.length === 0 ? (
          <p className="vazio">Nenhuma matéria-prima encontrada.</p>
        ) : (
          <div className="materias-tabela-rolagem">
          <table className="tabela tabela--materias" aria-label="Matérias-primas">
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
              {materias.map((m) => (
                <tr key={m.id}>
                  <td className="materias-cel-ref">{textoReferencia(m)}</td>
                  <td className="materias-cel-nome">{textoNomeDescricao(m)}</td>
                  <td>{textoCor(m.cor)}</td>
                  <td className="materias-cel-unidade">{m.unidade}</td>
                  <td>
                    <span className={classeEstoque(m)}>{textoEstoque(m)}</span>
                  </td>
                  <td className="materias-cel-custo">{textoCusto(m)}</td>
                  <td>
                    <span className={`pill pill--${m.status}`}>
                      {m.status === 'ativo' ? 'Ativo' : 'Inativo'}
                    </span>
                  </td>
                  <td className="acoes">
                    <button type="button" onClick={() => abrirDetalhe(m.id)}>
                      Ver
                    </button>
                    <button type="button" onClick={() => abrirEditar(m.id)}>
                      Editar
                    </button>
                    <button type="button" onClick={() => alternarStatus(m)}>
                      {m.status === 'ativo' ? 'Inativar' : 'Ativar'}
                    </button>
                    <button
                      type="button"
                      className="btn-remover-texto"
                      onClick={() => excluir(m)}
                    >
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
          {total} matéria{total === 1 ? '-prima' : 's-primas'}
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
              {modo === 'criar' && 'Nova matéria-prima'}
              {modo === 'editar' && 'Editar matéria-prima'}
              {modo === 'detalhe' && 'Detalhes da matéria-prima'}
            </h2>
            <button type="button" className="btn-fechar" onClick={() => setModo(null)}>
              ×
            </button>
          </div>

          {modo === 'detalhe' && detalhe ? (
            <dl className="detalhe">
              <div><dt>Referência</dt><dd>{textoReferencia(detalhe)}</dd></div>
              <div><dt>Nome</dt><dd>{detalhe.nome}</dd></div>
              <div><dt>Descrição</dt><dd>{detalhe.descricao ?? '—'}</dd></div>
              <div><dt>Tipo</dt><dd>{TIPO_MATERIA_LABEL[detalhe.tipo] ?? detalhe.tipo}</dd></div>
              <div><dt>Categoria</dt><dd>{detalhe.categoria ?? '—'}</dd></div>
              <div><dt>Cor</dt><dd>{textoCor(detalhe.cor)}</dd></div>
              <div><dt>Composição</dt><dd>{detalhe.composicao ?? '—'}</dd></div>
              <div><dt>Largura (cm)</dt><dd>{detalhe.largura_cm ?? '—'}</dd></div>
              <div><dt>Gramatura</dt><dd>{detalhe.gramatura ?? '—'}</dd></div>
              <div><dt>Unidade</dt><dd>{detalhe.unidade}</dd></div>
              <div><dt>Custo</dt><dd>{textoCusto(detalhe)}</dd></div>
              <div>
                <dt>Estoque atual</dt>
                <dd>
                  <span className={classeEstoque(detalhe)}>{textoEstoque(detalhe)}</span>
                </dd>
              </div>
              <div><dt>Estoque mínimo</dt><dd>{detalhe.estoque_minimo}</dd></div>
              <div><dt>Fornecedor</dt><dd>{detalhe.fornecedor ?? '—'}</dd></div>
              <div><dt>Ref. fornecedor</dt><dd>{detalhe.referencia_fornecedor ?? '—'}</dd></div>
              <div><dt>NCM</dt><dd>{detalhe.ncm ?? '—'}</dd></div>
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
            </dl>
          ) : (
            <form className="form" onSubmit={handleSubmit}>
              <label>
                Nome
                <input
                  required
                  value={form.nome}
                  onChange={(e) => setForm({ ...form, nome: e.target.value })}
                />
              </label>
              <div className="form__row">
                <label>
                  Código
                  <input
                    value={form.codigo}
                    onChange={(e) => setForm({ ...form, codigo: e.target.value })}
                    placeholder="Ex.: TEC-MALHA-30"
                  />
                </label>
                <label>
                  Tipo
                  <select
                    value={form.tipo}
                    onChange={(e) =>
                      setForm({ ...form, tipo: e.target.value as TipoMateria })
                    }
                  >
                    {TIPOS_MATERIA.map((t) => (
                      <option key={t} value={t}>
                        {TIPO_MATERIA_LABEL[t]}
                      </option>
                    ))}
                  </select>
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
                    placeholder="Ex.: Malha"
                  />
                </label>
                <label>
                  Cor
                  <input
                    value={form.cor}
                    onChange={(e) => setForm({ ...form, cor: e.target.value })}
                  />
                </label>
              </div>
              <label>
                Composição
                <input
                  value={form.composicao}
                  onChange={(e) => setForm({ ...form, composicao: e.target.value })}
                  placeholder="Ex.: 100% algodão"
                />
              </label>
              <div className="form__row">
                <label>
                  Largura (cm)
                  <input
                    type="number"
                    min={0}
                    step="0.01"
                    value={form.largura_cm ?? ''}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        largura_cm: e.target.value === '' ? undefined : Number(e.target.value),
                      })
                    }
                  />
                </label>
                <label>
                  Gramatura
                  <input
                    type="number"
                    min={0}
                    step="0.01"
                    value={form.gramatura ?? ''}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        gramatura: e.target.value === '' ? undefined : Number(e.target.value),
                      })
                    }
                  />
                </label>
              </div>
              <div className="form__row">
                <label>
                  Unidade
                  <select
                    value={form.unidade}
                    onChange={(e) => setForm({ ...form, unidade: e.target.value })}
                  >
                    {UNIDADES_MATERIA.map((u) => (
                      <option key={u} value={u}>
                        {u}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Custo
                  <input
                    type="number"
                    min={0}
                    step="0.01"
                    value={form.custo}
                    onChange={(e) =>
                      setForm({ ...form, custo: Number(e.target.value) })
                    }
                  />
                </label>
              </div>
              <label>
                Estoque mínimo
                <input
                  type="number"
                  min={0}
                  step="0.01"
                  value={form.estoque_minimo}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      estoque_minimo: Number(e.target.value),
                    })
                  }
                />
              </label>
              <label>
                Fornecedor
                <input
                  value={form.fornecedor}
                  onChange={(e) => setForm({ ...form, fornecedor: e.target.value })}
                />
              </label>
              <div className="form__row">
                <label>
                  Ref. fornecedor
                  <input
                    value={form.referencia_fornecedor}
                    onChange={(e) =>
                      setForm({ ...form, referencia_fornecedor: e.target.value })
                    }
                  />
                </label>
                <label>
                  NCM
                  <input
                    value={form.ncm}
                    onChange={(e) => setForm({ ...form, ncm: e.target.value })}
                    placeholder="8 dígitos"
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
                      status: e.target.value as StatusMateria,
                    })
                  }
                >
                  <option value="ativo">Ativo</option>
                  <option value="inativo">Inativo</option>
                </select>
              </label>
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
              <button type="submit" disabled={salvando}>
                {salvando
                  ? 'Salvando…'
                  : modo === 'editar'
                    ? 'Salvar alterações'
                    : 'Cadastrar matéria-prima'}
              </button>
            </form>
          )}
        </section>
        </>
      )}
    </main>
  );
}
