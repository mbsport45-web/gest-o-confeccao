import { useCallback, useEffect, useRef, useState } from 'react';
import {
  abrirEnfesto,
  atualizarGradeEnfesto,
  cancelarEnfesto,
  finalizarEnfesto,
  listarEnfestoOrdem,
  listarOrdensPaginado,
  listarTecidos,
  obterOrdem,
  temPermissao,
  type CorEnfesto,
  type Enfesto,
  type OrdemProducao,
  type PermissoesSessao,
  type Tecido,
  type UnidadeTecido,
} from './api';
import {
  atualizarQuantidadeGrade,
  colunasDaGrade,
  gradeDaCorFecha,
  mensagemGradeDivergente,
  somaQuantidades,
} from './DistribuicaoCorte';

const STATUS_LABEL: Record<string, string> = {
  pendente: 'Pendente',
  em_enfesto: 'Em enfesto',
  finalizado: 'Finalizado',
  cancelado: 'Cancelado',
};

type CelulaGrade = { tamanho: string; quantidade: number };

function chave(valor: string): string {
  return valor.trim().toLowerCase();
}

function montarGrades(
  painel: CorEnfesto[],
  anterior: Record<string, CelulaGrade[]>,
  preservarDivergencia: boolean,
): Record<string, CelulaGrade[]> {
  const proximo: Record<string, CelulaGrade[]> = {};
  for (const cor of painel) {
    const id = chave(cor.cor);
    const local = anterior[id];
    const manter = preservarDivergencia && local && !gradeDaCorFecha(local, cor.quantidade_pecas);
    proximo[id] = manter ? local : cor.tamanhos.map((item) => ({ ...item }));
  }
  return proximo;
}

export function EnfestoPage({ permissoes }: { permissoes: PermissoesSessao }) {
  const [ordens, setOrdens] = useState<OrdemProducao[]>([]);
  const [tecidos, setTecidos] = useState<Tecido[]>([]);
  const [ordemId, setOrdemId] = useState<number | null>(null);
  const [tecidosDaOp, setTecidosDaOp] = useState<number[]>([]);
  const [cores, setCores] = useState<CorEnfesto[]>([]);
  const [grades, setGrades] = useState<Record<string, CelulaGrade[]>>({});
  const gradesRef = useRef(grades);
  const [enfesto, setEnfesto] = useState<Enfesto | null>(null);
  const [tecidoId, setTecidoId] = useState('');
  const [folhas, setFolhas] = useState('');
  const [comprimento, setComprimento] = useState('');
  const [metragem, setMetragem] = useState('');
  const [peso, setPeso] = useState('');
  const [observacoes, setObservacoes] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);

  const tecido = tecidos.find((item) => String(item.id) === tecidoId);
  const unidade: UnidadeTecido | undefined = tecido?.unidade;
  const podeCancelar = temPermissao(permissoes, 'enfesto', 'excluir');
  const travado = enfesto?.status === 'finalizado' || enfesto?.status === 'cancelado';

  const aplicarGrades = useCallback((painel: CorEnfesto[], preservarDivergencia: boolean) => {
    const proximo = montarGrades(painel, preservarDivergencia ? gradesRef.current : {}, preservarDivergencia);
    gradesRef.current = proximo;
    setGrades(proximo);
    setCores(painel);
  }, []);

  const carregarCores = useCallback(
    async (id: number, preservarDivergencia = false) => {
      const painel = await listarEnfestoOrdem(id);
      aplicarGrades(painel.cores, preservarDivergencia);
    },
    [aplicarGrades],
  );

  useEffect(() => {
    listarOrdensPaginado({ por_pagina: 30, pagina: 1 })
      .then((lista) => setOrdens(lista.data))
      .catch((err: Error) => setErro(err.message));
    listarTecidos({ por_pagina: 100, status: 'ativo' })
      .then((lista) => setTecidos(lista.data))
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    if (!ordemId) {
      gradesRef.current = {};
      setGrades({});
      setCores([]);
      return;
    }
    carregarCores(ordemId, false).catch((err: Error) => setErro(err.message));
  }, [ordemId, carregarCores]);

  useEffect(() => {
    if (!ordemId) return;
    obterOrdem(ordemId)
      .then((ordem) => {
        const ids = (ordem.requisitos ?? [])
          .map((item) => item.materia_prima_id)
          .filter((id) => tecidos.some((tecido) => tecido.id === id));
        setTecidosDaOp(ids);
      })
      .catch(() => setTecidosDaOp([]));
  }, [ordemId, tecidos]);

  function preencher(atual: Enfesto) {
    setEnfesto(atual);
    setTecidoId(atual.tecido_id ? String(atual.tecido_id) : '');
    setFolhas(atual.folhas == null ? '' : String(atual.folhas));
    setComprimento(atual.comprimento == null ? '' : String(atual.comprimento));
    setMetragem(atual.metragem == null ? '' : String(atual.metragem));
    setPeso(atual.peso == null ? '' : String(atual.peso));
    setObservacoes(atual.observacoes ?? '');
  }

  async function abrirCor(cor: string) {
    if (!ordemId) return;
    setErro(null);
    try {
      const atual = await abrirEnfesto(ordemId, cor);
      preencher(atual);
      if (!atual.tecido_id && tecidosDaOp.length === 1) {
        setTecidoId(String(tecidosDaOp[0]));
      }
      await carregarCores(ordemId, true);
    } catch (err) {
      setErro((err as Error).message);
    }
  }

  async function finalizar(e: React.FormEvent) {
    e.preventDefault();
    if (!enfesto || !tecido || salvando) return;
    setSalvando(true);
    setErro(null);
    try {
      const corAberta = cores.find((item) => chave(item.cor) === chave(enfesto.cor));
      const itens = gradesRef.current[chave(enfesto.cor)] ?? corAberta?.tamanhos ?? [];
      const planejada = corAberta?.quantidade_pecas ?? enfesto.quantidade_pecas;
      if (!gradeDaCorFecha(itens, planejada)) {
        setErro(mensagemGradeDivergente(enfesto.cor, somaQuantidades(itens), planejada));
        return;
      }
      const atual = await finalizarEnfesto(enfesto.id, {
        tecido_id: tecido.id,
        folhas: Number(folhas),
        comprimento: Number(comprimento),
        metragem: metragem === '' ? null : Number(metragem),
        peso: peso === '' ? null : Number(peso),
        observacoes,
        unidade: tecido.unidade,
        ...(itens.length ? { tamanhos: itens } : {}),
      });
      preencher(atual);
      if (ordemId) await carregarCores(ordemId, true);
      const lista = await listarTecidos({ por_pagina: 100, status: 'ativo' });
      setTecidos(lista.data);
    } catch (err) {
      setErro((err as Error).message);
    } finally {
      setSalvando(false);
    }
  }

  function alterarCelula(cor: string, tamanho: string, bruto: string) {
    const quantidade = bruto === '' ? 0 : Math.max(0, Math.trunc(Number(bruto)));
    const valor = Number.isFinite(quantidade) ? quantidade : 0;
    const id = chave(cor);
    const atual = gradesRef.current;
    const proximo = {
      ...atual,
      [id]: atualizarQuantidadeGrade(atual[id] ?? [], tamanho, valor),
    };
    gradesRef.current = proximo;
    setGrades(proximo);
  }

  async function persistirCor(cor: CorEnfesto) {
    if (!ordemId || cor.status === 'finalizado' || !cor.grade_persistida) return;
    const itens = gradesRef.current[chave(cor.cor)] ?? cor.tamanhos;
    if (!gradeDaCorFecha(itens, cor.quantidade_pecas)) return;
    const mudou = itens.some((item) => {
      const original = cor.tamanhos.find((atual) => chave(atual.tamanho) === chave(item.tamanho));
      return !original || original.quantidade !== item.quantidade;
    });
    if (!mudou) return;
    setErro(null);
    try {
      await atualizarGradeEnfesto(ordemId, cor.cor, itens);
      await carregarCores(ordemId, true);
    } catch (err) {
      setErro((err as Error).message);
    }
  }

  const colunas = colunasDaGrade(
    cores.map((cor) => ({ tamanhos: grades[chave(cor.cor)] ?? cor.tamanhos })),
  );
  const pendencias = cores.flatMap((cor) => {
    const itens = grades[chave(cor.cor)] ?? cor.tamanhos;
    if (gradeDaCorFecha(itens, cor.quantidade_pecas)) return [];
    return [mensagemGradeDivergente(cor.cor, somaQuantidades(itens), cor.quantidade_pecas)];
  });
  const corAberta = enfesto ? cores.find((item) => chave(item.cor) === chave(enfesto.cor)) : undefined;
  const itensAbertos = enfesto ? (grades[chave(enfesto.cor)] ?? corAberta?.tamanhos ?? []) : [];
  const planejadaAberta = corAberta?.quantidade_pecas ?? enfesto?.quantidade_pecas ?? 0;
  const gradeAbertaOk = !enfesto || gradeDaCorFecha(itensAbertos, planejadaAberta);

  return (
    <main className="app__main">
      <section className="card card--wide">
        <h2>Enfesto</h2>
        <p className="dica">
          Cada cor da OP é enfestada à parte. Ao finalizar, o estoque do tecido baixa na unidade cadastrada.
        </p>
        <label>
          Ordem de produção
          <select
            value={ordemId ?? ''}
            onChange={(e) => {
              setOrdemId(e.target.value ? Number(e.target.value) : null);
              setEnfesto(null);
            }}
          >
            <option value="">Selecione</option>
            {ordens.map((ordem) => (
              <option key={ordem.id} value={ordem.id}>
                {ordem.codigo ?? `OP ${ordem.id}`}
                {ordem.referencia ? ` · ${ordem.referencia}` : ''} — {ordem.produto} · {ordem.quantidade} pç
              </option>
            ))}
          </select>
        </label>
        {erro && <p className="erro">{erro}</p>}
        {ordemId && (
          <div className="grade-corte">
            <table className="tabela tabela--compacta grade-corte__tabela">
              <thead>
                <tr>
                  <th>Cor</th>
                  {colunas.map((tamanho) => (
                    <th key={tamanho}>{tamanho}</th>
                  ))}
                  <th>Total</th>
                  <th>Qtd da OP</th>
                  <th>Status</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {cores.map((cor) => {
                  const itens = grades[chave(cor.cor)] ?? cor.tamanhos;
                  const total = itens.length ? somaQuantidades(itens) : cor.quantidade_pecas;
                  const fecha = gradeDaCorFecha(itens, cor.quantidade_pecas);
                  const travada = cor.status === 'finalizado';
                  const ativa = enfesto ? chave(enfesto.cor) === chave(cor.cor) : false;
                  return (
                    <tr key={cor.cor} className={ativa ? 'grade-linha--ativa' : undefined}>
                      <th scope="row">{cor.cor}</th>
                      {colunas.map((tamanho) => {
                        const celula = itens.find((item) => chave(item.tamanho) === chave(tamanho));
                        if (!celula) return <td key={tamanho}>—</td>;
                        return (
                          <td key={tamanho}>
                            <input
                              aria-label={`${cor.cor} ${tamanho}`}
                              type="number"
                              min={0}
                              step={1}
                              disabled={travada}
                              value={celula.quantidade}
                              onChange={(e) => alterarCelula(cor.cor, tamanho, e.target.value)}
                              onBlur={() => void persistirCor(cor)}
                            />
                          </td>
                        );
                      })}
                      <td className={fecha ? 'grade-total' : 'grade-total grade-total--divergente'}>{total}</td>
                      <td>{cor.quantidade_pecas}</td>
                      <td>{STATUS_LABEL[cor.status] ?? cor.status}</td>
                      <td>
                        <button type="button" onClick={() => void abrirCor(cor.cor)}>
                          {cor.status === 'pendente' ? 'Enfestar' : 'Abrir'}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {pendencias.map((mensagem) => (
              <p key={mensagem} className="erro">
                {mensagem}
              </p>
            ))}
          </div>
        )}
      </section>

      {enfesto && (
        <section className="card">
          <h2>
            {enfesto.cor} — {enfesto.quantidade_pecas} peças
          </h2>
          <p className="dica">
            {enfesto.referencia ? `${enfesto.referencia} — ` : ''}
            {enfesto.produto_nome}. A cor veio da OP. O consumo desta cor não se mistura com as outras.
          </p>
          <p className="dica">
            Total da grade: {itensAbertos.length ? somaQuantidades(itensAbertos) : planejadaAberta} / planejado{' '}
            {planejadaAberta}.
          </p>
          {!gradeAbertaOk && (
            <p className="erro">
              {mensagemGradeDivergente(enfesto.cor, somaQuantidades(itensAbertos), planejadaAberta)}
            </p>
          )}
          {enfesto.status === 'finalizado' && (
            <p className="dica">
              Consumo de {enfesto.quantidade_consumida} {enfesto.unidade}. Estoque de{' '}
              {enfesto.saldo_anterior} para {enfesto.saldo_posterior}.
              {enfesto.custo_total != null ? ` Custo do tecido: R$ ${enfesto.custo_total.toFixed(2)}.` : ''}
            </p>
          )}
          <form className="form" onSubmit={(e) => void finalizar(e)}>
            <label>
              Tecido
              <select
                required
                disabled={travado}
                value={tecidoId}
                onChange={(e) => setTecidoId(e.target.value)}
              >
                <option value="">Selecione</option>
                {[...tecidos]
                  .sort((a, b) => Number(tecidosDaOp.includes(b.id)) - Number(tecidosDaOp.includes(a.id)))
                  .map((item) => (
                  <option key={item.id} value={item.id}>
                    {tecidosDaOp.includes(item.id) ? 'BOM · ' : ''}
                    {item.nome} · {item.unidade} · estoque {item.estoque}
                  </option>
                ))}
              </select>
            </label>
            <div className="form__row">
              <label>
                Folhas
                <input
                  required
                  disabled={travado}
                  type="number"
                  min={1}
                  step={1}
                  value={folhas}
                  onChange={(e) => setFolhas(e.target.value)}
                />
              </label>
              <label>
                Comprimento
                <input
                  required
                  disabled={travado}
                  type="number"
                  min={0.001}
                  step="0.001"
                  value={comprimento}
                  onChange={(e) => setComprimento(e.target.value)}
                />
              </label>
            </div>
            {unidade === 'KG' && (
              <label>
                Peso real utilizado (KG)
                <input
                  required
                  disabled={travado}
                  type="number"
                  min={0.001}
                  step="0.001"
                  value={peso}
                  onChange={(e) => setPeso(e.target.value)}
                />
              </label>
            )}
            {unidade === 'METRO' && (
              <label>
                Metragem real utilizada (METRO)
                <input
                  required
                  disabled={travado}
                  type="number"
                  min={0.001}
                  step="0.001"
                  value={metragem}
                  onChange={(e) => setMetragem(e.target.value)}
                />
              </label>
            )}
            <label>
              Observações
              <input
                disabled={travado}
                value={observacoes}
                onChange={(e) => setObservacoes(e.target.value)}
              />
            </label>
            {!travado && (
              <button type="submit" disabled={salvando || !tecido || !gradeAbertaOk}>
                {salvando ? 'Finalizando…' : 'Finalizar Enfesto'}
              </button>
            )}
          </form>
          {podeCancelar && enfesto.status === 'em_enfesto' && (
            <button
              type="button"
              onClick={() =>
                void cancelarEnfesto(enfesto.id)
                  .then((atual) => {
                    preencher(atual);
                    if (ordemId) return carregarCores(ordemId, true);
                  })
                  .catch((err: Error) => setErro(err.message))
              }
            >
              Cancelar enfesto
            </button>
          )}
        </section>
      )}
    </main>
  );
}
