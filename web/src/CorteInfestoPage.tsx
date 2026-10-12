import { useEffect, useMemo, useState } from 'react';
import {
  STATUS_OP_LABEL,
  concluirCorteInfesto,
  listarCortesInfesto,
  listarMateriasPrimas,
  listarOrdens,
  obterOrdem,
  type CorteInfesto,
  type MateriaPrima,
  type OrdemProducao,
  type Status,
} from './api';
import {
  chaveGrade,
  gradeDaOrdem,
  gradeVazia,
  totalCor,
  totalGeral,
  totalTamanho,
  type GradeValor,
} from './gradeOrdem';

const PODE_CORTAR = new Set(['planejada', 'pendente', 'corte']);

function somarCortes(execucoes: CorteInfesto[]): Record<string, number> {
  const mapa: Record<string, number> = {};
  for (const execucao of execucoes) {
    for (const item of execucao.itens ?? []) {
      const chave = chaveGrade(item.cor, item.tamanho);
      mapa[chave] = (mapa[chave] ?? 0) + item.quantidade;
    }
  }
  return mapa;
}

function quantidadesIniciais(grade: GradeValor, cor: string, cortados: Record<string, number>) {
  const valores: Record<string, number> = {};
  for (const tamanho of grade.tamanhos) {
    const planejado = grade.quantidades[chaveGrade(cor, tamanho)] ?? 0;
    const feito = cortados[chaveGrade(cor, tamanho)] ?? 0;
    valores[tamanho] = Math.max(planejado - feito, 0);
  }
  return valores;
}

function textoTamanhos(execucao: CorteInfesto) {
  const partes = (execucao.itens ?? [])
    .filter((item) => item.quantidade > 0)
    .map((item) => `${item.tamanho} ${item.quantidade}`);
  return partes.length > 0 ? partes.join(', ') : String(execucao.quantidade_pecas);
}

export function CorteInfestoPage() {
  const [ordens, setOrdens] = useState<OrdemProducao[]>([]);
  const [cortes, setCortes] = useState<CorteInfesto[]>([]);
  const [tecidos, setTecidos] = useState<MateriaPrima[]>([]);
  const [selecionada, setSelecionada] = useState<OrdemProducao | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [tecidoId, setTecidoId] = useState('');
  const [cor, setCor] = useState('');
  const [quantidades, setQuantidades] = useState<Record<string, number>>({});
  const [autorizar, setAutorizar] = useState(false);
  const [camadas, setCamadas] = useState(1);
  const [metragem, setMetragem] = useState('');
  const [peso, setPeso] = useState('');

  async function carregar() {
    const [lista, historico, materias] = await Promise.all([
      listarOrdens(),
      listarCortesInfesto(),
      listarMateriasPrimas({ status: 'ativo', por_pagina: 100 }),
    ]);
    setOrdens(lista.filter((ordem) => ordem.status !== 'cancelada'));
    setCortes(historico);
    setTecidos(materias.data.filter((item) => item.tipo === 'tecido' || item.tipo === 'forro'));
    return historico;
  }

  useEffect(() => {
    void carregar().catch((e) => setErro((e as Error).message));
  }, []);

  const planejada = useMemo(
    () => (selecionada ? gradeDaOrdem(selecionada.grade, []) : gradeVazia([])),
    [selecionada],
  );
  const semGrade = Boolean(selecionada) && (!selecionada?.grade?.length || totalGeral(planejada) === 0);
  const cortesSelecionados = useMemo(
    () => (selecionada ? cortes.filter((corte) => corte.ordem_id === selecionada.id) : []),
    [cortes, selecionada],
  );
  const cortados = useMemo(() => somarCortes(cortesSelecionados), [cortesSelecionados]);
  const tecido = tecidos.find((item) => String(item.id) === tecidoId);
  const corAtiva =
    planejada.cores.find((nome) => nome.toLocaleLowerCase('pt-BR') === cor.toLocaleLowerCase('pt-BR')) ??
    planejada.cores[0] ??
    '';
  const podeCortar = Boolean(selecionada && PODE_CORTAR.has(selecionada.status) && !semGrade);

  function escolherCor(grade: GradeValor, nome: string, feitos: Record<string, number>) {
    setCor(nome);
    setAutorizar(false);
    setQuantidades(quantidadesIniciais(grade, nome, feitos));
  }

  async function selecionar(ordem: OrdemProducao) {
    setErro(null);
    const completa = await obterOrdem(ordem.id);
    const grade = gradeDaOrdem(completa.grade, []);
    const feitos = somarCortes(cortes.filter((corte) => corte.ordem_id === completa.id));
    setSelecionada(completa);
    setCamadas(1);
    setMetragem('');
    setPeso('');
    escolherCor(grade, grade.cores[0] ?? '', feitos);
    const requisito = completa.requisitos?.find((item) =>
      tecidos.some((tecidoItem) => tecidoItem.id === item.materia_prima_id),
    );
    setTecidoId(requisito ? String(requisito.materia_prima_id) : tecidos[0] ? String(tecidos[0].id) : '');
  }

  async function concluir() {
    if (!selecionada || !corAtiva) return;
    const itens = planejada.tamanhos.map((tamanho) => ({
      tamanho,
      quantidade: quantidades[tamanho] ?? 0,
    }));
    if (itens.some((item) => !Number.isInteger(item.quantidade) || item.quantidade < 0)) {
      setErro('A quantidade cortada de cada tamanho deve ser um número inteiro maior ou igual a zero.');
      return;
    }
    if (!itens.some((item) => item.quantidade > 0)) {
      setErro('Informe a quantidade cortada de ao menos um tamanho.');
      return;
    }
    const excede = itens.some((item) => {
      const planejado = planejada.quantidades[chaveGrade(corAtiva, item.tamanho)] ?? 0;
      const feito = cortados[chaveGrade(corAtiva, item.tamanho)] ?? 0;
      return feito + item.quantidade > planejado;
    });
    if (excede && !autorizar) {
      setErro('A quantidade cortada ultrapassa o planejado. Marque a autorização para continuar.');
      return;
    }
    setSalvando(true);
    setErro(null);
    try {
      await concluirCorteInfesto(selecionada.id, {
        materia_prima_id: Number(tecidoId),
        cor: corAtiva,
        camadas,
        metragem: Number(metragem),
        peso_real: Number(peso),
        itens,
        ...(autorizar ? { autorizar_excedente: true } : {}),
      });
      const historico = await carregar();
      const atualizada = await obterOrdem(selecionada.id);
      const grade = gradeDaOrdem(atualizada.grade, []);
      const feitos = somarCortes(historico.filter((corte) => corte.ordem_id === atualizada.id));
      setSelecionada(atualizada);
      setCamadas(1);
      setMetragem('');
      setPeso('');
      escolherCor(grade, corAtiva, feitos);
    } catch (e) {
      setErro((e as Error).message);
    } finally {
      setSalvando(false);
    }
  }

  function celula(nomeCor: string, tamanho: string) {
    const planejado = planejada.quantidades[chaveGrade(nomeCor, tamanho)] ?? 0;
    const feito = cortados[chaveGrade(nomeCor, tamanho)] ?? 0;
    return { planejado, feito, saldo: planejado - feito };
  }

  return (
    <div className="modulo-compras-estoque">
      <section className="card">
        <h2>Ordens para corte</h2>
        <p className="dica">
          Selecione a ordem para ver a grade salva. O corte é feito por cor e a ordem só segue para costura quando não
          restar quantidade planejada.
        </p>
        {ordens.length === 0 ? (
          <p className="vazio">Nenhuma ordem de produção disponível.</p>
        ) : (
          <table className="tabela">
            <thead>
              <tr>
                <th>OP</th>
                <th>Cliente</th>
                <th>Produto</th>
                <th>Qtd.</th>
                <th>Status</th>
                <th>Corte</th>
              </tr>
            </thead>
            <tbody>
              {ordens.map((ordem) => {
                const feitos = cortes.some((corte) => corte.ordem_id === ordem.id);
                const rotulo = !PODE_CORTAR.has(ordem.status)
                  ? 'Ver corte'
                  : feitos
                    ? 'Continuar corte'
                    : 'Executar corte';
                return (
                  <tr key={ordem.id}>
                    <td>{ordem.codigo ?? ordem.id}</td>
                    <td>{ordem.cliente}</td>
                    <td>{ordem.produto}</td>
                    <td>{ordem.quantidade}</td>
                    <td>{STATUS_OP_LABEL[ordem.status]}</td>
                    <td className="acoes">
                      <button type="button" className="btn-secundario" onClick={() => void selecionar(ordem)}>
                        {rotulo}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </section>

      {selecionada && (
        <section className="card">
          <h2>
            {selecionada.codigo ?? `OP ${selecionada.id}`} · {selecionada.produto}
          </h2>
          <p className="dica">
            {selecionada.cliente} · {selecionada.quantidade} peças · {STATUS_OP_LABEL[selecionada.status]}
          </p>
          {semGrade ? (
            <p className="vazio">
              Esta ordem não tem grade de cores e tamanhos. Salve a grade na ordem de produção antes de executar o
              corte.
            </p>
          ) : (
            <div className="grade-corte">
              <table className="tabela" aria-label="Grade planejada">
                <thead>
                  <tr>
                    <th>Cor</th>
                    {planejada.tamanhos.map((tamanho) => (
                      <th key={tamanho}>{tamanho}</th>
                    ))}
                    <th>Total</th>
                  </tr>
                </thead>
                <tbody>
                  {planejada.cores.map((nomeCor) => {
                    const total = totalCor(planejada, nomeCor);
                    const cortadoCor = planejada.tamanhos.reduce(
                      (soma, tamanho) => soma + (cortados[chaveGrade(nomeCor, tamanho)] ?? 0),
                      0,
                    );
                    return (
                      <tr key={nomeCor}>
                        <th scope="row">{nomeCor}</th>
                        {planejada.tamanhos.map((tamanho) => {
                          const valores = celula(nomeCor, tamanho);
                          return (
                            <td
                              key={tamanho}
                              aria-label={`${nomeCor} ${tamanho} planejado ${valores.planejado} cortado ${valores.feito} saldo ${valores.saldo}`}
                            >
                              <span className="grade-corte__qtd">{valores.planejado}</span>
                              <small>
                                cortado {valores.feito} · saldo {valores.saldo}
                              </small>
                            </td>
                          );
                        })}
                        <td aria-label={`Total da cor ${nomeCor} planejado ${total} cortado ${cortadoCor} saldo ${total - cortadoCor}`}>
                          <span className="grade-corte__qtd">{total}</span>
                          <small>
                            cortado {cortadoCor} · saldo {total - cortadoCor}
                          </small>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr>
                    <th scope="row">Total</th>
                    {planejada.tamanhos.map((tamanho) => {
                      const planejado = totalTamanho(planejada, tamanho);
                      const feito = planejada.cores.reduce(
                        (soma, nomeCor) => soma + (cortados[chaveGrade(nomeCor, tamanho)] ?? 0),
                        0,
                      );
                      return (
                        <td
                          key={tamanho}
                          aria-label={`Total ${tamanho} planejado ${planejado} cortado ${feito} saldo ${planejado - feito}`}
                        >
                          <span className="grade-corte__qtd">{planejado}</span>
                          <small>
                            cortado {feito} · saldo {planejado - feito}
                          </small>
                        </td>
                      );
                    })}
                    <td
                      aria-label={`Total geral planejado ${totalGeral(planejada)} cortado ${Object.values(cortados).reduce((soma, valor) => soma + valor, 0)} saldo ${totalGeral(planejada) - Object.values(cortados).reduce((soma, valor) => soma + valor, 0)}`}
                    >
                      <span className="grade-corte__qtd">{totalGeral(planejada)}</span>
                      <small>
                        cortado {Object.values(cortados).reduce((soma, valor) => soma + valor, 0)} · saldo{' '}
                        {totalGeral(planejada) - Object.values(cortados).reduce((soma, valor) => soma + valor, 0)}
                      </small>
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}

          {cortesSelecionados.length > 0 && (
            <table className="tabela" aria-label="Cortes registrados">
              <thead>
                <tr>
                  <th>Cor</th>
                  <th>Tamanhos</th>
                  <th>Tecido</th>
                  <th>Camadas</th>
                  <th>Metragem</th>
                  <th>Peso real</th>
                  <th>Baixa</th>
                </tr>
              </thead>
              <tbody>
                {cortesSelecionados.map((execucao) => (
                  <tr key={execucao.id}>
                    <td>{execucao.cor}</td>
                    <td>{textoTamanhos(execucao)}</td>
                    <td>{execucao.tecido}</td>
                    <td>{execucao.camadas}</td>
                    <td>{execucao.metragem}</td>
                    <td>{execucao.peso_real}</td>
                    <td>
                      {execucao.quantidade_baixada > 0
                        ? `${execucao.quantidade_baixada} ${execucao.unidade_baixa}`
                        : 'Estoque já baixado nesta OP'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {podeCortar ? (
            <form
              className="form"
              onSubmit={(event) => {
                event.preventDefault();
                void concluir();
              }}
            >
              <label>
                Tecido
                <select
                  aria-label="Tecido"
                  value={tecidoId}
                  onChange={(e) => setTecidoId(e.target.value)}
                  required
                >
                  <option value="">Selecione o tecido</option>
                  {tecidos.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.nome} · {item.unidade}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Cor que será cortada
                <select
                  aria-label="Cor do corte"
                  value={corAtiva}
                  onChange={(e) => escolherCor(planejada, e.target.value, cortados)}
                >
                  {planejada.cores.map((nome) => (
                    <option key={nome} value={nome}>
                      {nome}
                    </option>
                  ))}
                </select>
              </label>
              <p className="dica">
                {corAtiva}: planejado {totalCor(planejada, corAtiva)} · cortado{' '}
                {planejada.tamanhos.reduce(
                  (soma, tamanho) => soma + (cortados[chaveGrade(corAtiva, tamanho)] ?? 0),
                  0,
                )}{' '}
                · saldo{' '}
                {totalCor(planejada, corAtiva) -
                  planejada.tamanhos.reduce(
                    (soma, tamanho) => soma + (cortados[chaveGrade(corAtiva, tamanho)] ?? 0),
                    0,
                  )}
              </p>
              <div className="corte-tamanhos">
                {planejada.tamanhos.map((tamanho) => {
                  const valores = celula(corAtiva, tamanho);
                  return (
                    <label key={tamanho}>
                      {tamanho}
                      <small>
                        Planejado {valores.planejado} · Cortado {valores.feito} · Saldo {valores.saldo}
                      </small>
                      <input
                        aria-label={`Quantidade cortada ${tamanho}`}
                        type="number"
                        min={0}
                        step={1}
                        value={quantidades[tamanho] ?? 0}
                        onChange={(e) =>
                          setQuantidades((atual) => ({
                            ...atual,
                            [tamanho]: e.target.value === '' ? 0 : Number(e.target.value),
                          }))
                        }
                      />
                    </label>
                  );
                })}
              </div>
              <label className="corte-autorizar">
                <input
                  type="checkbox"
                  checked={autorizar}
                  onChange={(e) => setAutorizar(e.target.checked)}
                />
                <span>Autorizar quantidade acima do planejado</span>
              </label>
              <div className="form__row">
                <label>
                  Camadas do enfesto
                  <input
                    aria-label="Camadas do enfesto"
                    type="number"
                    min={1}
                    value={camadas}
                    onChange={(e) => setCamadas(Number(e.target.value))}
                    required
                  />
                </label>
              </div>
              <div className="form__row">
                <label>
                  Metragem
                  <input
                    aria-label="Metragem"
                    type="number"
                    min={0.001}
                    step="0.001"
                    value={metragem}
                    onChange={(e) => setMetragem(e.target.value)}
                    required
                  />
                </label>
                <label>
                  Peso real consumido
                  <input
                    aria-label="Peso real consumido"
                    type="number"
                    min={0.001}
                    step="0.001"
                    value={peso}
                    onChange={(e) => setPeso(e.target.value)}
                    required
                  />
                </label>
              </div>
              <p className="dica">
                {tecido?.unidade === 'MT'
                  ? 'Este tecido está em metros. A baixa usa a metragem e acontece uma vez para este tecido na ordem.'
                  : 'A baixa usa o peso real na primeira execução deste tecido. As cores seguintes não baixam o estoque de novo.'}
              </p>
              <button type="submit" disabled={salvando || !tecidoId}>
                {salvando ? 'Registrando…' : 'Registrar corte da cor'}
              </button>
            </form>
          ) : (
            !semGrade && (
              <p className="dica">
                O corte desta ordem foi concluído e ela seguiu para {STATUS_OP_LABEL[selecionada.status as Status]}.
              </p>
            )
          )}
          {erro && <p className="erro">{erro}</p>}
        </section>
      )}
    </div>
  );
}
