import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  atualizarAmostraManual,
  atualizarFotoOcDisponivel,
  completarOcsDisponiveisEstampas,
  criarAmostraManual,
  listarOcsDisponiveisEstampas,
  type DadosAmostraManual,
  type OcDisponivelEstampa,
} from './api';

type AbaEstampas = 'amostras' | 'cortes';

const FORM_VAZIO: DadosAmostraManual = {
  modelo: '',
  referencia: '',
  tipo_peca: '',
  cor: '',
  tamanho: '',
  quantidade: 0,
  observacoes: '',
  imagem: null,
};

export function EstampasPage() {
  const [aba, setAba] = useState<AbaEstampas>('amostras');
  const [registros, setRegistros] = useState<OcDisponivelEstampa[]>([]);
  const [disponiveis, setDisponiveis] = useState(0);
  const [q, setQ] = useState('');
  const [qDebounced, setQDebounced] = useState('');
  const [tipoFiltro, setTipoFiltro] = useState('');
  const [carregando, setCarregando] = useState(true);
  const [completando, setCompletando] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [resumo, setResumo] = useState<string | null>(null);
  const [formAberto, setFormAberto] = useState<'criar' | 'editar' | null>(null);
  const [editandoId, setEditandoId] = useState<number | null>(null);
  const [form, setForm] = useState<DadosAmostraManual>(FORM_VAZIO);
  const fotoInputRef = useRef<HTMLInputElement>(null);
  const fotoAlvoRef = useRef<OcDisponivelEstampa | null>(null);
  const fotoFormRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const t = setTimeout(() => setQDebounced(q), 300);
    return () => clearTimeout(t);
  }, [q]);

  const recarregar = useCallback(async () => {
    try {
      setCarregando(true);
      const lista = await listarOcsDisponiveisEstampas({
        q: qDebounced,
        tipo: tipoFiltro,
      });
      setRegistros(lista.data);
      setDisponiveis(lista.totais.disponiveis);
      setErro(null);
    } catch (e) {
      setErro((e as Error).message);
    } finally {
      setCarregando(false);
    }
  }, [qDebounced, tipoFiltro]);

  useEffect(() => {
    void recarregar();
  }, [recarregar]);

  const visiveis = useMemo(
    () => (aba === 'cortes' ? registros.filter((item) => item.origem !== 'manual') : registros),
    [aba, registros],
  );

  const tipos = useMemo(() => {
    const set = new Set<string>();
    for (const item of registros) {
      const tipo = (item.tipo_peca || item.categoria || '').trim();
      if (tipo) set.add(tipo);
    }
    return [...set].sort((a, b) => a.localeCompare(b, 'pt-BR'));
  }, [registros]);

  async function completar() {
    try {
      setCompletando(true);
      const resultado = await completarOcsDisponiveisEstampas();
      setResumo(
        `${resultado.importados} importada${resultado.importados === 1 ? '' : 's'}, ${resultado.atualizados} atualizada${resultado.atualizados === 1 ? '' : 's'}.`,
      );
      await recarregar();
    } catch (e) {
      setErro((e as Error).message);
    } finally {
      setCompletando(false);
    }
  }

  function abrirCriar() {
    setForm(FORM_VAZIO);
    setEditandoId(null);
    setFormAberto('criar');
    setErro(null);
  }

  function abrirEditar(item: OcDisponivelEstampa) {
    if (item.origem !== 'manual') return;
    setForm({
      modelo: item.modelo || item.peca,
      referencia: item.referencia,
      tipo_peca: item.tipo_peca,
      cor: item.cores[0] ?? '',
      tamanho: item.tamanhos[0] ?? '',
      quantidade: item.quantidade,
      observacoes: item.observacoes,
      imagem: item.imagem,
    });
    setEditandoId(item.id);
    setFormAberto('editar');
    setErro(null);
  }

  function fecharForm() {
    setFormAberto(null);
    setEditandoId(null);
    setForm(FORM_VAZIO);
  }

  async function salvarAmostra() {
    try {
      setSalvando(true);
      if (formAberto === 'editar' && editandoId != null) {
        await atualizarAmostraManual(editandoId, form);
      } else {
        await criarAmostraManual(form);
      }
      fecharForm();
      await recarregar();
    } catch (e) {
      setErro((e as Error).message);
    } finally {
      setSalvando(false);
    }
  }

  function pedirFoto(item: OcDisponivelEstampa) {
    fotoAlvoRef.current = item;
    fotoInputRef.current?.click();
  }

  function aplicarFoto(file: File | undefined) {
    const alvo = fotoAlvoRef.current;
    if (!file || !alvo) return;
    const reader = new FileReader();
    reader.onload = () => {
      void (async () => {
        try {
          await atualizarFotoOcDisponivel(alvo.id, String(reader.result ?? ''), alvo.origem);
          await recarregar();
        } catch (e) {
          setErro((e as Error).message);
        }
      })();
    };
    reader.readAsDataURL(file);
  }

  function aplicarFotoForm(file: File | undefined) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      setForm((atual) => ({ ...atual, imagem: String(reader.result ?? '') }));
    };
    reader.readAsDataURL(file);
  }

  return (
    <main className="app__main app__main--estampas app__main--produtos-catalogo">
      <section className="catalogo-modelos" aria-label="OCs disponíveis/estampas">
        <div className="card__head">
          <h2>OCs disponíveis/estampas</h2>
          <div className="card__head-acoes">
            <button type="button" className="btn-primario" onClick={abrirCriar}>
              + Adicionar amostra
            </button>
            <button
              type="button"
              className="btn-secundario"
              onClick={() => void completar()}
              disabled={completando}
            >
              {completando ? 'Completando…' : 'Completar dados pelas OCs'}
            </button>
          </div>
        </div>

        <div className="kpi-grid kpi-grid--estampas" aria-label="Indicadores">
          <article className="kpi" aria-label="Ordens disponíveis">
            <span className="kpi__rotulo">Ordens disponíveis</span>
            <strong className="kpi__valor">{disponiveis}</strong>
            <span className="kpi__dica">Fichas entregues neste módulo</span>
          </article>
        </div>

        <div className="estampas-abas" role="tablist" aria-label="Amostras e cortes">
          <button
            type="button"
            role="tab"
            aria-selected={aba === 'amostras'}
            className={aba === 'amostras' ? 'estampas-abas__item estampas-abas__item--ativo' : 'estampas-abas__item'}
            onClick={() => setAba('amostras')}
          >
            Amostras
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={aba === 'cortes'}
            className={aba === 'cortes' ? 'estampas-abas__item estampas-abas__item--ativo' : 'estampas-abas__item'}
            onClick={() => setAba('cortes')}
          >
            Cortes
          </button>
        </div>

        <div className="filtros filtros--catalogo">
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Pesquisar por OC, peça, REF ou costureiro"
            aria-label="Pesquisar por OC, peça, REF ou costureiro"
          />
          <select
            value={tipoFiltro}
            onChange={(e) => setTipoFiltro(e.target.value)}
            aria-label="Filtrar por tipo"
          >
            <option value="">Todos os tipos</option>
            {tipos.map((tipo) => (
              <option key={tipo} value={tipo}>
                {tipo}
              </option>
            ))}
          </select>
        </div>

        {erro && <p className="erro">{erro}</p>}
        {resumo && <p className="dica">{resumo}</p>}

        <input
          ref={fotoInputRef}
          type="file"
          accept="image/*"
          hidden
          aria-label="Arquivo da foto da amostra"
          onChange={(e) => {
            const arquivo = e.target.files?.[0];
            e.target.value = '';
            aplicarFoto(arquivo);
          }}
        />

        {carregando ? (
          <p className="vazio">Carregando…</p>
        ) : visiveis.length === 0 ? (
          <p className="vazio">
            {aba === 'amostras'
              ? 'Nenhuma amostra. Use + Adicionar amostra ou Completar dados pelas OCs.'
              : 'Nenhuma OC disponível. Use Completar dados pelas OCs para importar as fichas entregues.'}
          </p>
        ) : (
          <div className="catalogo-modelos__grade" role="list">
            {visiveis.map((item) => (
              <article key={`${item.origem}-${item.id}`} className="catalogo-card" role="listitem">
                <div className="catalogo-card__foto">
                  {item.imagem ? (
                    <img src={item.imagem} alt={item.modelo || item.peca} />
                  ) : (
                    <span className="catalogo-card__sem-foto">Sem foto</span>
                  )}
                </div>
                <div className="catalogo-card__info">
                  <strong>{item.modelo || item.peca || item.codigo_oc}</strong>
                  <span>REF {item.referencia || '—'}</span>
                  {item.origem === 'manual' ? <span>Amostra</span> : <span>{item.codigo_oc}</span>}
                  {aba === 'cortes' ? (
                    <>
                      <span>{item.quantidade} peça{item.quantidade === 1 ? '' : 's'}</span>
                      <span>{item.cores.join(', ') || 'Sem cores'}</span>
                      <span>{item.tamanhos.join(', ') || 'Sem tamanhos'}</span>
                      <span>{item.costureiro ? `Costureiro: ${item.costureiro}` : 'Sem costureiro'}</span>
                    </>
                  ) : null}
                </div>
                <div className="catalogo-card__acoes">
                  <button type="button" onClick={() => pedirFoto(item)}>
                    {item.imagem ? 'Trocar foto' : 'Adicionar foto'}
                  </button>
                  {item.origem === 'manual' ? (
                    <button type="button" onClick={() => abrirEditar(item)}>
                      Editar
                    </button>
                  ) : null}
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

      {formAberto ? (
        <>
          <button type="button" className="catalogo-painel__fundo" aria-label="Fechar" onClick={fecharForm} />
          <section className="card catalogo-painel" aria-label="Cadastro de amostra">
            <div className="card__head">
              <h2>{formAberto === 'editar' ? 'Editar amostra' : 'Adicionar amostra'}</h2>
              <button type="button" className="btn-fechar" onClick={fecharForm}>
                ×
              </button>
            </div>
            <form
              className="form"
              onSubmit={(e) => {
                e.preventDefault();
                void salvarAmostra();
              }}
            >
              <label>
                Foto da amostra
                <input
                  ref={fotoFormRef}
                  type="file"
                  accept="image/*"
                  aria-label="Foto da amostra"
                  onChange={(e) => {
                    const arquivo = e.target.files?.[0];
                    e.target.value = '';
                    aplicarFotoForm(arquivo);
                  }}
                />
              </label>
              {form.imagem ? (
                <img src={form.imagem} alt="Prévia da amostra" className="produto-foto produto-foto--catalogo" />
              ) : (
                <p className="catalogo-card__sem-foto">Sem foto</p>
              )}
              <label>
                Nome do modelo/peça
                <input
                  value={form.modelo}
                  onChange={(e) => setForm((atual) => ({ ...atual, modelo: e.target.value }))}
                  required
                  aria-label="Nome do modelo/peça"
                />
              </label>
              <label>
                Referência (REF)
                <input
                  value={form.referencia ?? ''}
                  onChange={(e) => setForm((atual) => ({ ...atual, referencia: e.target.value }))}
                  aria-label="Referência"
                />
              </label>
              <label>
                Tipo de peça
                <input
                  value={form.tipo_peca ?? ''}
                  onChange={(e) => setForm((atual) => ({ ...atual, tipo_peca: e.target.value }))}
                  aria-label="Tipo de peça"
                />
              </label>
              <div className="form__row">
                <label>
                  Cor
                  <input
                    value={form.cor ?? ''}
                    onChange={(e) => setForm((atual) => ({ ...atual, cor: e.target.value }))}
                    aria-label="Cor"
                  />
                </label>
                <label>
                  Tamanho
                  <input
                    value={form.tamanho ?? ''}
                    onChange={(e) => setForm((atual) => ({ ...atual, tamanho: e.target.value }))}
                    aria-label="Tamanho"
                  />
                </label>
              </div>
              <label>
                Quantidade
                <input
                  type="number"
                  min={0}
                  value={form.quantidade ?? 0}
                  onChange={(e) =>
                    setForm((atual) => ({ ...atual, quantidade: Number(e.target.value) || 0 }))
                  }
                  aria-label="Quantidade"
                />
              </label>
              <label>
                Observações
                <textarea
                  rows={3}
                  value={form.observacoes ?? ''}
                  onChange={(e) => setForm((atual) => ({ ...atual, observacoes: e.target.value }))}
                  aria-label="Observações"
                />
              </label>
              <div className="card__head-acoes">
                <button type="submit" className="btn-primario" disabled={salvando}>
                  {salvando ? 'Salvando…' : 'Salvar amostra'}
                </button>
                <button type="button" className="btn-secundario" onClick={fecharForm}>
                  Cancelar
                </button>
              </div>
            </form>
          </section>
        </>
      ) : null}
    </main>
  );
}
