import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  TIPO_MOVIMENTO_LABEL,
  TIPOS_MOVIMENTO,
  criarMovimentoEstoque,
  listarEstoque,
  listarMateriasPrimas,
  listarProdutos,
  obterEstoque,
  type EstoqueMovimento,
  type EstoqueSaldo,
  type MateriaPrima,
  type Produto,
  type TipoMovimento,
} from './api';

type Alvo = 'variante' | 'materia' | 'produto';

const FORM_VAZIO = {
  tipo: 'entrada' as TipoMovimento,
  alvo: 'variante' as Alvo,
  produtoId: '',
  varianteId: '',
  materiaId: '',
  quantidade: 1,
  motivo: '',
  observacoes: '',
};

export function EstoquePage() {
  const [saldos, setSaldos] = useState<EstoqueSaldo[]>([]);
  const [pagina, setPagina] = useState(1);
  const [totalPaginas, setTotalPaginas] = useState(1);
  const [total, setTotal] = useState(0);
  const [q, setQ] = useState('');
  const [qDebounced, setQDebounced] = useState('');
  const [tipoFiltro, setTipoFiltro] = useState('');
  const [abaixoMinimo, setAbaixoMinimo] = useState(false);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [form, setForm] = useState(FORM_VAZIO);
  const [salvando, setSalvando] = useState(false);
  const [detalhe, setDetalhe] = useState<EstoqueSaldo | null>(null);
  const [produtos, setProdutos] = useState<Produto[]>([]);
  const [materias, setMaterias] = useState<MateriaPrima[]>([]);
  const [historico, setHistorico] = useState<EstoqueMovimento[]>([]);

  useEffect(() => {
    const t = setTimeout(() => {
      setQDebounced(q);
      setPagina(1);
    }, 300);
    return () => clearTimeout(t);
  }, [q]);

  useEffect(() => {
    setPagina(1);
  }, [tipoFiltro, abaixoMinimo]);

  useEffect(() => {
    listarProdutos({ por_pagina: 100 }).then((lista) => setProdutos(lista.data)).catch(() => undefined);
    listarMateriasPrimas({ por_pagina: 100 }).then((lista) => setMaterias(lista.data)).catch(() => undefined);
  }, []);

  const recarregar = useCallback(async () => {
    try {
      setCarregando(true);
      const lista = await listarEstoque({
        q: qDebounced,
        tipo: tipoFiltro,
        abaixo_minimo: abaixoMinimo,
        pagina,
        por_pagina: 8,
      });
      setSaldos(lista.data);
      setTotal(lista.total);
      setTotalPaginas(lista.total_paginas);
      setErro(null);
    } catch (e) {
      setErro((e as Error).message);
    } finally {
      setCarregando(false);
    }
  }, [qDebounced, tipoFiltro, abaixoMinimo, pagina]);

  useEffect(() => {
    recarregar();
  }, [recarregar]);

  const produtoSel = useMemo(
    () => produtos.find((p) => String(p.id) === form.produtoId),
    [produtos, form.produtoId],
  );

  async function abrirDetalhe(id: number) {
    const saldo = await obterEstoque(id);
    setDetalhe(saldo);
    setHistorico(saldo.movimentos ?? []);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    try {
      setSalvando(true);
      const payload: Parameters<typeof criarMovimentoEstoque>[0] = {
        tipo: form.tipo,
        quantidade: Number(form.quantidade),
        motivo: form.motivo,
        observacoes: form.observacoes,
      };
      if (form.alvo === 'materia') payload.materia_prima_id = Number(form.materiaId);
      else if (form.alvo === 'produto') payload.produto_id = Number(form.produtoId);
      else payload.variante_id = Number(form.varianteId);
      const result = await criarMovimentoEstoque(payload);
      setForm({ ...FORM_VAZIO, alvo: form.alvo });
      if (detalhe?.id === result.saldo.id) {
        await abrirDetalhe(result.saldo.id);
      }
      await recarregar();
    } catch (err) {
      setErro((err as Error).message);
    } finally {
      setSalvando(false);
    }
  }

  return (
    <main className="app__main app__main--estoque">
      <section className="card card--wide">
        <div className="card__head">
          <h2>Estoque</h2>
          <span className="badge">{total} saldo{total === 1 ? '' : 's'}</span>
        </div>

        <div className="filtros filtros--estoque">
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar produto, SKU, matéria-prima…"
            aria-label="Buscar estoque"
          />
          <select
            value={tipoFiltro}
            onChange={(e) => setTipoFiltro(e.target.value)}
            aria-label="Filtrar tipo"
          >
            <option value="">Todos os itens</option>
            <option value="produto">Produtos</option>
            <option value="materia">Matérias-primas</option>
          </select>
          <label className="filtro-check">
            <input
              type="checkbox"
              checked={abaixoMinimo}
              onChange={(e) => setAbaixoMinimo(e.target.checked)}
            />
            Abaixo do mínimo
          </label>
        </div>

        {erro && <p className="erro">{erro}</p>}

        {carregando ? (
          <p className="vazio">Carregando…</p>
        ) : saldos.length === 0 ? (
          <p className="vazio">Nenhum saldo de estoque. Lance uma entrada ao lado.</p>
        ) : (
          <table className="tabela">
            <thead>
              <tr>
                <th>Item</th>
                <th>Código</th>
                <th>Detalhe</th>
                <th>Saldo</th>
                <th>Mín.</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {saldos.map((s) => (
                <tr key={s.id}>
                  <td>{s.nome}</td>
                  <td>{s.codigo ?? '—'}</td>
                  <td>{s.detalhe ?? (s.tipo === 'materia' ? 'Matéria-prima' : 'Produto')}</td>
                  <td>
                    <span className={s.abaixo_minimo ? 'pill pill--inativo' : 'pill pill--ativo'}>
                      {s.quantidade} {s.unidade}
                    </span>
                  </td>
                  <td>{s.estoque_minimo}</td>
                  <td className="acoes">
                    <button type="button" onClick={() => abrirDetalhe(s.id)}>
                      Histórico
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

      <div className="estoque-lado">
        <section className="card">
          <h2>Novo movimento</h2>
          <form className="form" onSubmit={handleSubmit}>
            <label>
              Tipo
              <select
                value={form.tipo}
                onChange={(e) =>
                  setForm({ ...form, tipo: e.target.value as TipoMovimento })
                }
              >
                {TIPOS_MOVIMENTO.map((t) => (
                  <option key={t} value={t}>
                    {TIPO_MOVIMENTO_LABEL[t]}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Item
              <select
                value={form.alvo}
                onChange={(e) =>
                  setForm({
                    ...form,
                    alvo: e.target.value as Alvo,
                    produtoId: '',
                    varianteId: '',
                    materiaId: '',
                  })
                }
              >
                <option value="variante">Variante de produto</option>
                <option value="produto">Produto sem grade</option>
                <option value="materia">Matéria-prima</option>
              </select>
            </label>

            {form.alvo === 'materia' ? (
              <label>
                Matéria-prima
                <select
                  required
                  value={form.materiaId}
                  onChange={(e) => setForm({ ...form, materiaId: e.target.value })}
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
            ) : (
              <>
                <label>
                  Produto
                  <select
                    required
                    value={form.produtoId}
                    onChange={(e) =>
                      setForm({ ...form, produtoId: e.target.value, varianteId: '' })
                    }
                  >
                    <option value="">Selecione</option>
                    {produtos
                      .filter((p) =>
                        form.alvo === 'produto'
                          ? p.variantes.length === 0
                          : p.variantes.length > 0,
                      )
                      .map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.sku ? `${p.sku} — ` : ''}
                          {p.nome}
                        </option>
                      ))}
                  </select>
                </label>
                {form.alvo === 'variante' && (
                  <label>
                    Variante
                    <select
                      required
                      value={form.varianteId}
                      onChange={(e) => setForm({ ...form, varianteId: e.target.value })}
                    >
                      <option value="">Selecione</option>
                      {(produtoSel?.variantes ?? []).map((v) => (
                        <option key={v.id} value={v.id}>
                          {v.sku} — {v.cor} / {v.tamanho}
                        </option>
                      ))}
                    </select>
                  </label>
                )}
              </>
            )}

            <label>
              {form.tipo === 'ajuste' ? 'Novo saldo' : 'Quantidade'}
              <input
                required
                type="number"
                min={form.tipo === 'ajuste' ? 0 : 0.01}
                step="0.01"
                value={form.quantidade}
                onChange={(e) =>
                  setForm({ ...form, quantidade: Number(e.target.value) })
                }
              />
            </label>
            <label>
              Motivo
              <input
                value={form.motivo}
                onChange={(e) => setForm({ ...form, motivo: e.target.value })}
                placeholder="Compra, OP, inventário…"
              />
            </label>
            <label>
              Observações
              <textarea
                rows={2}
                value={form.observacoes}
                onChange={(e) => setForm({ ...form, observacoes: e.target.value })}
              />
            </label>
            <button type="submit" disabled={salvando}>
              {salvando ? 'Salvando…' : 'Lançar movimento'}
            </button>
          </form>
        </section>

        {detalhe && (
          <section className="card">
            <div className="card__head">
              <h2>Histórico</h2>
              <button type="button" className="btn-fechar" onClick={() => setDetalhe(null)}>
                ×
              </button>
            </div>
            <p className="dica">
              {detalhe.nome} {detalhe.codigo ? `(${detalhe.codigo})` : ''} — saldo{' '}
              {detalhe.quantidade} {detalhe.unidade}
            </p>
            {historico.length === 0 ? (
              <p className="vazio">Sem movimentos.</p>
            ) : (
              <table className="tabela tabela--compacta">
                <thead>
                  <tr>
                    <th>Tipo</th>
                    <th>Qtd.</th>
                    <th>Saldo</th>
                    <th>Motivo</th>
                  </tr>
                </thead>
                <tbody>
                  {historico.map((mv) => (
                    <tr key={mv.id}>
                      <td>{TIPO_MOVIMENTO_LABEL[mv.tipo]}</td>
                      <td>{mv.quantidade}</td>
                      <td>
                        {mv.saldo_anterior} → {mv.saldo_posterior}
                      </td>
                      <td>{mv.motivo ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>
        )}
      </div>
    </main>
  );
}
