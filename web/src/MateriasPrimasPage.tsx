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

export function MateriasPrimasPage({ sessao }: { sessao: { assinatura: AssinaturaEmpresa } }) {
  const [materias, setMaterias] = useState<MateriaPrima[]>([]);
  const [pagina, setPagina] = useState(1);
  const [totalPaginas, setTotalPaginas] = useState(1);
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
    const t = setTimeout(() => {
      setQDebounced(q);
      setPagina(1);
    }, 300);
    return () => clearTimeout(t);
  }, [q]);

  useEffect(() => {
    setPagina(1);
  }, [statusFiltro, tipoFiltro, categoriaFiltro]);

  const recarregar = useCallback(async () => {
    try {
      setCarregando(true);
      const lista = await listarMateriasPrimas({
        q: qDebounced,
        status: statusFiltro,
        tipo: tipoFiltro,
        categoria: categoriaFiltro,
        pagina,
        por_pagina: 8,
      });
      setMaterias(lista.data);
      setTotal(lista.total);
      setTotalPaginas(lista.total_paginas);
      setErro(null);
    } catch (e) {
      setErro((e as Error).message);
    } finally {
      setCarregando(false);
    }
  }, [qDebounced, statusFiltro, tipoFiltro, categoriaFiltro, pagina]);

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
          <button
            type="button"
            className="btn-secundario"
            onClick={abrirCriar}
            disabled={!podeCriarNoPlano(sessao.assinatura, 'materiais')}
          >
            Nova matéria-prima
          </button>
        </div>
        <AvisoLimite assinatura={sessao.assinatura} chave="materiais" />

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

        {erro && <p className="erro">{erro}</p>}

        {carregando ? (
          <p className="vazio">Carregando…</p>
        ) : materias.length === 0 ? (
          <p className="vazio">Nenhuma matéria-prima encontrada.</p>
        ) : (
          <table className="tabela">
            <thead>
              <tr>
                <th>Código</th>
                <th>Nome</th>
                <th>Tipo</th>
                <th>Cor</th>
                <th>Unid.</th>
                <th>Custo</th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {materias.map((m) => (
                <tr key={m.id}>
                  <td>{m.codigo ?? '—'}</td>
                  <td>{m.nome}</td>
                  <td>{TIPO_MATERIA_LABEL[m.tipo] ?? m.tipo}</td>
                  <td>{m.cor ?? '—'}</td>
                  <td>{m.unidade}</td>
                  <td>{moeda.format(m.custo)}</td>
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
        )}

        <div className="paginacao">
          <span>
            {total} matéria{total === 1 ? '-prima' : 's-primas'}
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
              <div><dt>Código</dt><dd>{detalhe.codigo ?? '—'}</dd></div>
              <div><dt>Nome</dt><dd>{detalhe.nome}</dd></div>
              <div><dt>Descrição</dt><dd>{detalhe.descricao ?? '—'}</dd></div>
              <div><dt>Tipo</dt><dd>{TIPO_MATERIA_LABEL[detalhe.tipo] ?? detalhe.tipo}</dd></div>
              <div><dt>Categoria</dt><dd>{detalhe.categoria ?? '—'}</dd></div>
              <div><dt>Cor</dt><dd>{detalhe.cor ?? '—'}</dd></div>
              <div><dt>Composição</dt><dd>{detalhe.composicao ?? '—'}</dd></div>
              <div><dt>Largura (cm)</dt><dd>{detalhe.largura_cm ?? '—'}</dd></div>
              <div><dt>Gramatura</dt><dd>{detalhe.gramatura ?? '—'}</dd></div>
              <div><dt>Unidade</dt><dd>{detalhe.unidade}</dd></div>
              <div><dt>Custo</dt><dd>{moeda.format(detalhe.custo)}</dd></div>
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
      )}
    </main>
  );
}
