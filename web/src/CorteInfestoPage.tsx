import { useEffect, useMemo, useRef, useState } from 'react';
import {
  STATUS_PROCESSO_OC_LABEL,
  atualizarOrdemCorte,
  concluirCorteInfesto,
  confirmarCorOrdemCorte,
  listarCortesInfesto,
  listarFilaEnfestoCorte,
  listarHistoricoOrdemCorte,
  listarMateriasPrimas,
  obterResumoCorteInfesto,
  registrarApontamentoOrdemCorte,
  urlPdfOrdemCorte,
  type CorteInfesto,
  type FichaOrdemCortePayload,
  type MateriaPrima,
  type OrdemCorte,
  type OrdemCorteHistorico,
  type StatusProcessoOc,
} from './api';
import { DadosTecidoCadastro, type TecidoFichaCampos } from './DadosTecidoCadastro';
import {
  camadasAutomaticasPorCor,
  composicaoMaisCompleta,
  consumoTotalPorCor,
  extrairDadosTecidoTexto,
  numeroDoTexto,
  textoDecimal,
} from './consumoCorte';
import {
  chaveGrade,
  gradeDaOrdem,
  gradeVazia,
  tamanhosDaCor,
  totalGeral,
  type GradeValor,
} from './regrasGradeOrdem';

const PODE_CORTAR = new Set(['planejada', 'pendente', 'corte']);
const EM_ANDAMENTO = new Set<StatusProcessoOc>(['aguardando_enfesto', 'em_enfesto', 'em_corte']);
const FINALIZADOS = new Set<StatusProcessoOc>(['corte_concluido', 'encaminhado', 'entregue', 'expedicao']);
type VisaoEnfesto = 'andamento' | 'finalizados';

function unicasPorOrdem(fichas: OrdemCorte[]): OrdemCorte[] {
  const visto = new Set<number>();
  const saida: OrdemCorte[] = [];
  for (const ficha of fichas) {
    if (visto.has(ficha.ordem_id)) continue;
    visto.add(ficha.ordem_id);
    saida.push(ficha);
  }
  return saida;
}

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
  for (const tamanho of tamanhosDaCor(grade, cor)) {
    const planejado = grade.quantidades[chaveGrade(cor, tamanho)] ?? 0;
    const feito = cortados[chaveGrade(cor, tamanho)] ?? 0;
    valores[tamanho] = Math.max(planejado - feito, 0);
  }
  return valores;
}

function quantidadesIniciaisTodas(grade: GradeValor, cortados: Record<string, number>) {
  const mapa: Record<string, Record<string, number>> = {};
  for (const cor of grade.cores) {
    mapa[cor] = quantidadesIniciais(grade, cor, cortados);
  }
  return mapa;
}

function totalBloco(qtds: Record<string, number> | undefined) {
  return Object.values(qtds ?? {}).reduce((soma, valor) => soma + (Number(valor) || 0), 0);
}

function tamanhoDoBloco(grade: GradeValor, cor: string, qtds: Record<string, number> | undefined) {
  const atuais = qtds ?? {};
  const lista = tamanhosDaCor(grade, cor);
  for (const tamanho of grade.tamanhos) {
    if ((atuais[tamanho] ?? 0) > 0 && !lista.includes(tamanho)) lista.push(tamanho);
  }
  return lista;
}

function coresDaFicha(ficha: OrdemCorte): string {
  const cores = [...new Set((ficha.linhas?.length ? ficha.linhas.map((linha) => linha.cor) : ficha.grade.map((celula) => celula.cor)).filter(Boolean))];
  return cores.join(', ') || '—';
}

function extraidoDoCadastro(cadastro?: MateriaPrima | null) {
  if (!cadastro) return { larguraCm: null as number | null, gramatura: null as number | null, composicao: '', unidade: null as string | null };
  return extrairDadosTecidoTexto([cadastro.descricao, cadastro.observacoes].filter(Boolean).join(' '));
}

function camposTecidoExibidos(ficha: OrdemCorte, cadastro?: MateriaPrima | null): TecidoFichaCampos {
  const extraido = extraidoDoCadastro(cadastro);
  return {
    nome: ficha.tecido_nome || cadastro?.nome || '',
    cor: ficha.tecido_cor || cadastro?.cor || '',
    largura_cm: ficha.tecido_largura_cm ?? cadastro?.largura_cm ?? extraido.larguraCm,
    largura_unidade: ficha.tecido_largura_unidade === 'm' ? 'm' : 'cm',
    gramatura: ficha.tecido_gramatura ?? cadastro?.gramatura ?? extraido.gramatura,
    composicao:
      composicaoMaisCompleta(
        ficha.tecido_composicao,
        cadastro?.composicao,
        extraido.composicao,
        cadastro?.descricao,
      ) ||
      ficha.composicao ||
      '',
    unidade: (ficha.tecido_unidade || cadastro?.unidade || extraido.unidade || 'KG').toUpperCase(),
    numero_rolo: ficha.tecido_numero_rolo || '',
  };
}

function aplicarCadastroNaFicha(ficha: OrdemCorte, cadastro: MateriaPrima): OrdemCorte {
  const extraido = extraidoDoCadastro(cadastro);
  return {
    ...ficha,
    materia_prima_id: cadastro.id,
    tecido_nome: cadastro.nome,
    tecido_cor: (cadastro.cor ?? '').trim(),
    tecido_largura_cm: cadastro.largura_cm ?? extraido.larguraCm,
    tecido_largura_unidade: 'cm',
    tecido_gramatura: cadastro.gramatura ?? extraido.gramatura,
    tecido_unidade: (cadastro.unidade || extraido.unidade || 'KG').toUpperCase(),
    tecido_composicao: composicaoMaisCompleta(cadastro.composicao, extraido.composicao, cadastro.descricao),
  };
}

function aplicarCampoTecidoFicha(
  ficha: OrdemCorte,
  cadastro: MateriaPrima | undefined,
  campo: keyof TecidoFichaCampos,
  valor: string,
): OrdemCorte {
  const atuais = camposTecidoExibidos(ficha, cadastro);
  if (campo === 'largura_cm') atuais.largura_cm = valor === '' ? null : numeroDoTexto(valor);
  else if (campo === 'gramatura') atuais.gramatura = valor === '' ? null : numeroDoTexto(valor);
  else if (campo === 'largura_unidade') atuais.largura_unidade = valor === 'm' ? 'm' : 'cm';
  else if (campo === 'numero_rolo') atuais.numero_rolo = valor;
  else if (campo === 'cor') atuais.cor = valor;
  else if (campo === 'nome') atuais.nome = valor;
  else if (campo === 'composicao') atuais.composicao = valor;
  else if (campo === 'unidade') atuais.unidade = valor.toUpperCase();
  return {
    ...ficha,
    materia_prima_id: cadastro?.id ?? ficha.materia_prima_id,
    tecido_nome: atuais.nome,
    tecido_cor: atuais.cor,
    tecido_largura_cm: atuais.largura_cm,
    tecido_largura_unidade: atuais.largura_unidade,
    tecido_gramatura: atuais.gramatura,
    tecido_unidade: atuais.unidade,
    tecido_numero_rolo: atuais.numero_rolo,
    tecido_composicao: atuais.composicao,
    composicao: campo === 'composicao' ? atuais.composicao : ficha.composicao,
  };
}

function payloadTecidoFicha(ficha: OrdemCorte, cadastro?: MateriaPrima | null): FichaOrdemCortePayload {
  const campos = camposTecidoExibidos(ficha, cadastro);
  return {
    materia_prima_id: ficha.materia_prima_id ?? null,
    tecido_nome: ficha.tecido_nome ?? '',
    tecido_cor: ficha.tecido_cor ?? '',
    tecido_largura_cm: ficha.tecido_largura_cm ?? null,
    tecido_largura_unidade: ficha.tecido_largura_unidade || 'cm',
    tecido_gramatura: ficha.tecido_gramatura ?? null,
    tecido_unidade: ficha.tecido_unidade || 'KG',
    tecido_numero_rolo: ficha.tecido_numero_rolo ?? '',
    composicao: campos.composicao || ficha.tecido_composicao || ficha.composicao || '',
  };
}

type ConsumoCorUi = {
  camadas: number;
  pesoFolha: string;
  camadasManual: boolean;
};

function chaveCor(nome: string) {
  return nome.trim().toLocaleLowerCase('pt-BR');
}

function pesoDaCor(item?: ConsumoCorUi | null) {
  return numeroDoTexto(item?.pesoFolha) ?? 0;
}

function consumoDaCor(item?: ConsumoCorUi | null) {
  return consumoTotalPorCor(item?.camadas ?? 0, pesoDaCor(item));
}

function consumoSalvoDaCor(
  ficha: OrdemCorte | null | undefined,
  cor: string,
): NonNullable<OrdemCorte['consumos_cores']>[number] | undefined {
  return ficha?.consumos_cores?.find((item) => chaveCor(item.cor) === chaveCor(cor));
}

function consumoInicialPorCor(
  ficha: OrdemCorte,
  grade: GradeValor,
  quantidades: Record<string, Record<string, number>>,
): Record<string, ConsumoCorUi> {
  const mapa: Record<string, ConsumoCorUi> = {};
  for (const cor of grade.cores) {
    const auto = camadasAutomaticasPorCor(Object.values(quantidades[cor] ?? {}));
    const salvo = consumoSalvoDaCor(ficha, cor);
    const camadas = salvo && salvo.camadas > 0 ? salvo.camadas : auto;
    mapa[cor] = {
      camadas,
      pesoFolha: salvo && salvo.peso_folha > 0 ? String(salvo.peso_folha).replace('.', ',') : '',
      camadasManual: Boolean(salvo && salvo.camadas > 0 && salvo.camadas !== auto),
    };
  }
  return mapa;
}

function payloadConsumosCores(
  cores: string[],
  quantidades: Record<string, Record<string, number>>,
  consumos: Record<string, ConsumoCorUi>,
  unidade: string,
) {
  return cores.map((cor) => {
    const item = consumos[cor];
    const camadas = item?.camadas ?? camadasAutomaticasPorCor(Object.values(quantidades[cor] ?? {}));
    const peso = pesoDaCor(item);
    return {
      cor,
      camadas,
      peso_folha: peso,
      consumo_total: consumoTotalPorCor(camadas, peso),
      unidade,
    };
  });
}

function confirmacaoDaCor(historico: OrdemCorteHistorico[], cor: string) {
  const chave = chaveCor(cor);
  for (const item of historico) {
    if (item.acao !== 'confirmar_cor') continue;
    const payload = item.payload as { cor?: string } | undefined;
    const nome = String(payload?.cor || item.resumo.replace(/\s+OK$/i, '')).trim();
    if (chaveCor(nome) === chave) {
      return { cor, em: item.criado_em, por: item.usuario_nome?.trim() || 'Operador' };
    }
  }
  return null;
}

function formatarDataConfirmacao(em: string) {
  const bruto = em.includes('T') ? em : em.replace(' ', 'T');
  const data = new Date(bruto);
  if (Number.isNaN(data.getTime())) return em;
  const dd = String(data.getDate()).padStart(2, '0');
  const mm = String(data.getMonth() + 1).padStart(2, '0');
  const hh = String(data.getHours()).padStart(2, '0');
  const min = String(data.getMinutes()).padStart(2, '0');
  return `${dd}/${mm}/${data.getFullYear()} ${hh}:${min}`;
}

export function CorteInfestoPage() {
  const [fila, setFila] = useState<OrdemCorte[]>([]);
  const [cortes, setCortes] = useState<CorteInfesto[]>([]);
  const [tecidos, setTecidos] = useState<MateriaPrima[]>([]);
  const [selecionada, setSelecionada] = useState<OrdemCorte | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [tecidoId, setTecidoId] = useState('');
  const [quantidadesPorCor, setQuantidadesPorCor] = useState<Record<string, Record<string, number>>>({});
  const [autorizar, setAutorizar] = useState(false);
  const [autorizarEstoque, setAutorizarEstoque] = useState(false);
  const [consumoPorCor, setConsumoPorCor] = useState<Record<string, ConsumoCorUi>>({});
  const [historicoFicha, setHistoricoFicha] = useState<OrdemCorteHistorico[]>([]);
  const [confirmandoCor, setConfirmandoCor] = useState<string | null>(null);
  const [visao, setVisao] = useState<VisaoEnfesto>('andamento');
  const pularAutosaveTecido = useRef(true);
  const pularAutosaveConsumo = useRef(true);

  const fichasAndamento = useMemo(
    () => unicasPorOrdem(fila.filter((ficha) => EM_ANDAMENTO.has(ficha.status_processo ?? 'aguardando_enfesto'))),
    [fila],
  );
  const fichasFinalizadas = useMemo(
    () => unicasPorOrdem(fila.filter((ficha) => FINALIZADOS.has(ficha.status_processo ?? 'aguardando_enfesto'))),
    [fila],
  );
  const fichasVisiveis = visao === 'andamento' ? fichasAndamento : fichasFinalizadas;

  async function carregar() {
    const [recebidas, historico, materias] = await Promise.all([
      listarFilaEnfestoCorte(),
      listarCortesInfesto(),
      listarMateriasPrimas({ status: 'ativo', por_pagina: 100 }),
    ]);
    setFila(recebidas);
    setCortes(historico);
    setTecidos(materias.data.filter((item) => item.tipo === 'tecido' || item.tipo === 'forro'));
    return { recebidas, historico };
  }

  useEffect(() => {
    void carregar().catch((e) => setErro((e as Error).message));
  }, []);

  useEffect(() => {
    if (!selecionada) return;
    if (pularAutosaveTecido.current) {
      pularAutosaveTecido.current = false;
      return;
    }
    const ficha = selecionada;
    const cadastro = tecidos.find((item) => item.id === ficha.materia_prima_id);
    const timer = window.setTimeout(() => {
      void atualizarOrdemCorte(ficha.ordem_id, payloadTecidoFicha(ficha, cadastro))
        .then((salva) => {
          pularAutosaveTecido.current = true;
          setSelecionada((atual) =>
            atual && atual.id === salva.id
              ? {
                  ...atual,
                  tecido_nome: salva.tecido_nome,
                  tecido_cor: salva.tecido_cor,
                  tecido_largura_cm: salva.tecido_largura_cm,
                  tecido_largura_unidade: salva.tecido_largura_unidade,
                  tecido_gramatura: salva.tecido_gramatura,
                  tecido_unidade: salva.tecido_unidade,
                  tecido_numero_rolo: salva.tecido_numero_rolo,
                  tecido_composicao: salva.tecido_composicao,
                  materia_prima_id: salva.materia_prima_id,
                }
              : atual,
          );
        })
        .catch((e) => setErro((e as Error).message));
    }, 700);
    return () => window.clearTimeout(timer);
  }, [
    selecionada?.id,
    selecionada?.ordem_id,
    selecionada?.tecido_nome,
    selecionada?.tecido_cor,
    selecionada?.tecido_largura_cm,
    selecionada?.tecido_largura_unidade,
    selecionada?.tecido_gramatura,
    selecionada?.tecido_unidade,
    selecionada?.tecido_numero_rolo,
    selecionada?.tecido_composicao,
    selecionada?.materia_prima_id,
  ]);

  const planejada = useMemo(
    () => (selecionada ? gradeDaOrdem(selecionada.grade, []) : gradeVazia([])),
    [selecionada],
  );
  const semGrade = Boolean(selecionada) && (!selecionada?.grade?.length || totalGeral(planejada) === 0);
  const cortesSelecionados = useMemo(
    () => (selecionada ? cortes.filter((corte) => corte.ordem_id === selecionada.ordem_id) : []),
    [cortes, selecionada],
  );
  const cortados = useMemo(() => somarCortes(cortesSelecionados), [cortesSelecionados]);
  const tecido = tecidos.find((item) => String(item.id) === tecidoId);
  const dadosTecidoFicha = selecionada ? camposTecidoExibidos(selecionada, tecido) : null;

  useEffect(() => {
    if (!selecionada || !dadosTecidoFicha) return;
    const atual = (selecionada.tecido_composicao ?? '').trim();
    const completa = dadosTecidoFicha.composicao.trim();
    if (!completa) return;
    const countAtual = (atual.match(/\d+\s*%/g) ?? []).length;
    const countNova = (completa.match(/\d+\s*%/g) ?? []).length;
    if (countNova < countAtual) return;
    if (countNova === countAtual && (completa === atual || completa.length <= atual.length)) return;
    setSelecionada((ficha) => (ficha ? { ...ficha, tecido_composicao: completa } : ficha));
  }, [selecionada, dadosTecidoFicha]);

  const unidadeTecido = tecido?.unidade || selecionada?.tecido_unidade || 'KG';
  const consumosMontados = useMemo(
    () =>
      payloadConsumosCores(
        planejada.cores,
        quantidadesPorCor,
        consumoPorCor,
        (unidadeTecido || 'KG').toUpperCase(),
      ),
    [planejada.cores, quantidadesPorCor, consumoPorCor, unidadeTecido],
  );
  const consumoFinalizar = useMemo(
    () => consumosMontados.reduce((soma, item) => soma + (Number(item.consumo_total) || 0), 0),
    [consumosMontados],
  );
  const statusOc = (selecionada?.status_processo ?? 'em_preenchimento') as StatusProcessoOc;
  const podeFinalizar = Boolean(
    selecionada &&
      EM_ANDAMENTO.has(statusOc) &&
      PODE_CORTAR.has(selecionada.ordem_status ?? 'planejada') &&
      !semGrade,
  );
  const totalPecasApontadas = planejada.cores.reduce(
    (soma, nomeCor) => soma + totalBloco(quantidadesPorCor[nomeCor]),
    0,
  );
  const excedePlanejado = planejada.cores.some((nomeCor) =>
    tamanhoDoBloco(planejada, nomeCor, quantidadesPorCor[nomeCor]).some((tamanho) => {
      const planejadoQtd = planejada.quantidades[chaveGrade(nomeCor, tamanho)] ?? 0;
      const feito = cortados[chaveGrade(nomeCor, tamanho)] ?? 0;
      return feito + (quantidadesPorCor[nomeCor]?.[tamanho] ?? 0) > planejadoQtd;
    }),
  );
  const saldoTecido = Number(tecido?.estoque_atual) || 0;
  const estoqueInsuficiente = consumoFinalizar > 0 && consumoFinalizar > saldoTecido;

  useEffect(() => {
    if (!selecionada) return;
    setConsumoPorCor((atual) => {
      let mudou = false;
      const proximo = { ...atual };
      for (const cor of planejada.cores) {
        const auto = camadasAutomaticasPorCor(Object.values(quantidadesPorCor[cor] ?? {}));
        const item = proximo[cor];
        if (!item) {
          proximo[cor] = { camadas: auto, pesoFolha: '', camadasManual: false };
          mudou = true;
          continue;
        }
        if (!item.camadasManual && item.camadas !== auto) {
          proximo[cor] = { ...item, camadas: auto };
          mudou = true;
        }
      }
      return mudou ? proximo : atual;
    });
  }, [selecionada, planejada.cores, quantidadesPorCor]);

  useEffect(() => {
    if (!selecionada || !podeFinalizar) return;
    if (pularAutosaveConsumo.current) {
      pularAutosaveConsumo.current = false;
      return;
    }
    const ordemId = selecionada.ordem_id;
    const fichaId = selecionada.id;
    const payload = consumosMontados;
    const timer = window.setTimeout(() => {
      void atualizarOrdemCorte(ordemId, { consumos_cores: payload })
        .then((salva) => {
          setSelecionada((atual) =>
            atual && atual.id === fichaId ? { ...atual, consumos_cores: salva.consumos_cores } : atual,
          );
        })
        .catch((e) => setErro((e as Error).message));
    }, 700);
    return () => window.clearTimeout(timer);
  }, [selecionada?.id, selecionada?.ordem_id, podeFinalizar, consumosMontados]);

  function aplicarSelecao(ficha: OrdemCorte, historico: CorteInfesto[], preservarConsumo = false) {
    const grade = gradeDaOrdem(ficha.grade, ficha.tamanhos ?? []);
    const feitos = somarCortes(historico.filter((corte) => corte.ordem_id === ficha.ordem_id));
    pularAutosaveTecido.current = true;
    setSelecionada((atual) =>
      preservarConsumo && atual
        ? {
            ...ficha,
            tecido_nome: atual.tecido_nome,
            tecido_cor: atual.tecido_cor,
            tecido_largura_cm: atual.tecido_largura_cm,
            tecido_largura_unidade: atual.tecido_largura_unidade,
            tecido_gramatura: atual.tecido_gramatura,
            tecido_unidade: atual.tecido_unidade,
            tecido_numero_rolo: atual.tecido_numero_rolo,
            tecido_composicao: atual.tecido_composicao,
            materia_prima_id: atual.materia_prima_id,
          }
        : ficha,
    );
    if (!preservarConsumo) {
      const tecidoFicha =
        ficha.materia_prima_id && tecidos.some((item) => item.id === ficha.materia_prima_id)
          ? String(ficha.materia_prima_id)
          : tecidos[0]
            ? String(tecidos[0].id)
            : '';
      setTecidoId(tecidoFicha);
    }
    const qtds = quantidadesIniciaisTodas(grade, feitos);
    pularAutosaveConsumo.current = true;
    setConsumoPorCor(consumoInicialPorCor(ficha, grade, qtds));
    setAutorizar(false);
    setAutorizarEstoque(false);
    setQuantidadesPorCor(qtds);
  }

  async function carregarFicha(ficha: OrdemCorte, historicoCortes: CorteInfesto[], preservarConsumo = false) {
    try {
      const [resumo, historico] = await Promise.all([
        obterResumoCorteInfesto(ficha.ordem_id),
        listarHistoricoOrdemCorte(ficha.ordem_id),
      ]);
      setHistoricoFicha(historico);
      aplicarSelecao(
        { ...ficha, grade: resumo.grade?.length ? resumo.grade : ficha.grade },
        resumo.execucoes ?? historicoCortes,
        preservarConsumo,
      );
    } catch {
      setHistoricoFicha([]);
      aplicarSelecao(ficha, historicoCortes, preservarConsumo);
    }
  }

  async function selecionar(ficha: OrdemCorte) {
    setErro(null);
    await carregarFicha(ficha, cortes);
  }

  function fecharFicha() {
    setSelecionada(null);
    setErro(null);
  }

  function abrirVisao(proxima: VisaoEnfesto) {
    setVisao(proxima);
    const lista = proxima === 'andamento' ? fichasAndamento : fichasFinalizadas;
    if (selecionada && !lista.some((ficha) => ficha.ordem_id === selecionada.ordem_id)) {
      fecharFicha();
    }
  }

  async function confirmarCorFicha(nomeCor: string) {
    if (!selecionada) return;
    setConfirmandoCor(nomeCor);
    setErro(null);
    try {
      setHistoricoFicha(await confirmarCorOrdemCorte(selecionada.ordem_id, nomeCor));
    } catch (e) {
      setErro((e as Error).message);
    } finally {
      setConfirmandoCor(null);
    }
  }

  async function finalizarEnfesto() {
    if (!selecionada) return;
    const cores = planejada.cores
      .map((nomeCor) => ({
        cor: nomeCor,
        itens: tamanhoDoBloco(planejada, nomeCor, quantidadesPorCor[nomeCor]).map((tamanho) => ({
          tamanho,
          quantidade: quantidadesPorCor[nomeCor]?.[tamanho] ?? 0,
        })),
      }))
      .filter((bloco) => bloco.itens.some((item) => item.quantidade > 0));
    if (cores.some((bloco) => bloco.itens.some((item) => !Number.isInteger(item.quantidade) || item.quantidade < 0))) {
      setErro('A quantidade cortada de cada tamanho deve ser um número inteiro maior ou igual a zero.');
      return;
    }
    if (cores.length === 0) {
      setErro('Informe a quantidade cortada de ao menos um tamanho.');
      return;
    }
    if (excedePlanejado && !autorizar) {
      setErro('A quantidade cortada ultrapassa o planejado. Marque a autorização para continuar.');
      return;
    }
    if (!tecidoId) {
      setErro('Selecione o tecido do enfesto.');
      return;
    }
    const pendentes = planejada.cores.filter((nomeCor) => !confirmacaoDaCor(historicoFicha, nomeCor));
    if (pendentes.length > 0) {
      setErro(`Confirme a conferência das cores: ${pendentes.join(', ')}.`);
      return;
    }
    const semPeso = cores.filter((bloco) => {
      const peso = pesoDaCor(consumoPorCor[bloco.cor]);
      const camadasCor = consumoPorCor[bloco.cor]?.camadas ?? 0;
      return !(camadasCor > 0) || !(peso > 0);
    });
    if (semPeso.length > 0) {
      setErro(
        `Informe as camadas e o peso por folha das cores: ${semPeso.map((bloco) => bloco.cor).join(', ')}.`,
      );
      return;
    }
    if (estoqueInsuficiente && !autorizarEstoque) {
      setErro(
        `Estoque insuficiente para a saída. Saldo atual ${textoDecimal(saldoTecido)} ${unidadeTecido}, consumo ${textoDecimal(consumoFinalizar)} ${unidadeTecido}. Confirme para finalizar o enfesto; o saldo poderá ficar negativo para conferência e ajuste posterior.`,
      );
      return;
    }
    setSalvando(true);
    setErro(null);
    try {
      let status = statusOc;
      if (status === 'aguardando_enfesto') {
        await registrarApontamentoOrdemCorte(selecionada.ordem_id, { acao: 'iniciar_enfesto' });
        status = 'em_enfesto';
      }
      if (status === 'em_enfesto') {
        await registrarApontamentoOrdemCorte(selecionada.ordem_id, { acao: 'iniciar_corte' });
        status = 'em_corte';
      }
      for (const bloco of cores) {
        const item = consumoPorCor[bloco.cor];
        const camadasCor = item?.camadas ?? camadasAutomaticasPorCor(bloco.itens.map((linha) => linha.quantidade));
        const pesoFolha = pesoDaCor(item);
        const consumoCor = consumoTotalPorCor(camadasCor, pesoFolha);
        await concluirCorteInfesto(selecionada.ordem_id, {
          materia_prima_id: Number(tecidoId),
          cor: bloco.cor,
          camadas: camadasCor,
          peso_folha: pesoFolha,
          ...(consumoCor > 0 ? { peso_real: consumoCor } : {}),
          itens: bloco.itens,
          ...(autorizar ? { autorizar_excedente: true } : {}),
        });
      }
      if (status === 'em_corte') {
        await registrarApontamentoOrdemCorte(selecionada.ordem_id, {
          acao: 'concluir_corte',
          ...(consumoFinalizar > 0 ? { consumo_real: consumoFinalizar } : {}),
          quantidade_cortada: totalPecasApontadas,
          materia_prima_id: Number(tecidoId),
          consumos_cores: consumosMontados.filter((item) =>
            cores.some((bloco) => chaveCor(bloco.cor) === chaveCor(item.cor)),
          ),
        });
      }
      const { recebidas, historico } = await carregar();
      const atualizada = recebidas.find((item) => item.ordem_id === selecionada.ordem_id) ?? selecionada;
      await carregarFicha(atualizada, historico, true);
    } catch (e) {
      setErro((e as Error).message);
    } finally {
      setSalvando(false);
    }
  }

  return (
    <div className="modulo-compras-estoque modulo-enfesto-corte">
      {erro && !selecionada ? <p className="erro">{erro}</p> : null}
      <div className="kpi-grid kpi-grid--enfesto" aria-label="Indicadores de enfesto e corte">
        <button
          type="button"
          className={visao === 'andamento' ? 'kpi kpi--ativa' : 'kpi'}
          aria-label="Enfesto e corte"
          aria-pressed={visao === 'andamento'}
          onClick={() => abrirVisao('andamento')}
        >
          <span className="kpi__label">ENFESTO/CORTE</span>
          <strong className="kpi__valor">{fichasAndamento.length}</strong>
        </button>
        <button
          type="button"
          className={visao === 'finalizados' ? 'kpi kpi--ativa' : 'kpi'}
          aria-label="Finalizados"
          aria-pressed={visao === 'finalizados'}
          onClick={() => abrirVisao('finalizados')}
        >
          <span className="kpi__label">FINALIZADOS</span>
          <strong className="kpi__valor">{fichasFinalizadas.length}</strong>
        </button>
      </div>
      <section
        className="card card--wide"
        aria-label={visao === 'andamento' ? 'Fichas em enfesto e corte' : 'Fichas finalizadas'}
      >
        {fichasVisiveis.length === 0 ? (
          <p className="vazio">
            {visao === 'andamento'
              ? 'Nenhuma ficha pendente ou em andamento.'
              : 'Nenhuma ficha com enfesto e corte concluídos.'}
          </p>
        ) : (
          <div className="tabela-wrap">
            <table className="tabela">
              <thead>
                <tr>
                  <th>OC</th>
                  <th>OP</th>
                  <th>Produto</th>
                  <th>Tecido</th>
                  <th>Cores</th>
                  <th>Qtd.</th>
                  <th>Status</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {fichasVisiveis.map((ficha) => (
                  <tr key={ficha.ordem_id}>
                    <td>{ficha.codigo}</td>
                    <td>{ficha.ordem_codigo ?? ficha.ordem_id}</td>
                    <td>{ficha.modelo || ficha.produto}</td>
                    <td>{ficha.tecido_nome || ficha.composicao || '—'}</td>
                    <td>{coresDaFicha(ficha)}</td>
                    <td>{ficha.quantidade}</td>
                    <td>{STATUS_PROCESSO_OC_LABEL[ficha.status_processo ?? 'aguardando_enfesto']}</td>
                    <td className="acoes">
                      <button type="button" className="btn-secundario" onClick={() => void selecionar(ficha)}>
                        Abrir ficha
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {selecionada ? (
        <>
          <button type="button" className="catalogo-painel__fundo" aria-label="Fechar ficha" onClick={fecharFicha} />
          <section className="card catalogo-painel catalogo-painel--largo" aria-label="Ficha de enfesto e corte">
          <div className="ficha-oc__toolbar">
            <div>
              <h2>
                {selecionada.codigo} · {selecionada.ordem_codigo ?? `OP ${selecionada.ordem_id}`} ·{' '}
                {selecionada.modelo || selecionada.produto}
              </h2>
              <p className="dica">
                <span className={`pill pill--oc-${statusOc}`}>{STATUS_PROCESSO_OC_LABEL[statusOc]}</span>{' '}
                {selecionada.referencia ? `REF ${selecionada.referencia} · ` : ''}
                {selecionada.composicao}
              </p>
            </div>
            <div className="ficha-oc__acoes">
              <a className="btn-primario" href={urlPdfOrdemCorte(selecionada.ordem_id)}>
                BAIXAR PDF DA FICHA
              </a>
              <button type="button" className="btn-secundario" onClick={fecharFicha}>
                Fechar
              </button>
            </div>
          </div>

          <dl className="ficha-setor__dados">
            <div>
              <dt>Tecido</dt>
              <dd>
                {tecido?.nome || selecionada.tecido_nome || '—'}
                {tecido?.unidade || selecionada.tecido_unidade
                  ? ` · ${tecido?.unidade || selecionada.tecido_unidade}`
                  : ''}
              </dd>
            </div>
            <div>
              <dt>Composição</dt>
              <dd>{dadosTecidoFicha?.composicao || selecionada.composicao || '—'}</dd>
            </div>
            <div>
              <dt>Cores</dt>
              <dd>
                {tecido?.cor?.trim()
                  ? `${tecido.cor}${coresDaFicha(selecionada) !== '—' ? ` · grade ${coresDaFicha(selecionada)}` : ''}`
                  : coresDaFicha(selecionada)}
              </dd>
            </div>
            <div>
              <dt>Data de retirada</dt>
              <dd>{selecionada.data_retirada || '—'}</dd>
            </div>
          </dl>

          {semGrade ? (
            <p className="vazio">
              Esta ordem não tem grade de cores e tamanhos. Salve a grade na ordem de produção antes de executar o
              corte.
            </p>
          ) : (
            <div className="enfesto-cores" aria-label="Cores do enfesto">
              {planejada.cores.map((nomeCor) => {
                const qtds = quantidadesPorCor[nomeCor] ?? {};
                const tamanhos = tamanhoDoBloco(planejada, nomeCor, qtds);
                const total = totalBloco(qtds);
                const confirmacao = confirmacaoDaCor(historicoFicha, nomeCor);
                const nomeStatus = nomeCor.toLocaleUpperCase('pt-BR');
                const consumo = consumoPorCor[nomeCor] ?? {
                  camadas: camadasAutomaticasPorCor(Object.values(qtds)),
                  pesoFolha: '',
                  camadasManual: false,
                };
                const consumoTotal = consumoDaCor(consumo);
                return (
                  <article key={nomeCor} className="enfesto-cor" aria-label={`Cor ${nomeCor}`}>
                    <h3 className="enfesto-cor__nome">{nomeStatus}</h3>
                    <div className="enfesto-cor__linha">
                    <p className="enfesto-cor__grade">
                      {tamanhos.map((tamanho, idx) => (
                        <span key={tamanho} className="enfesto-cor__peca">
                          {idx > 0 ? <span className="enfesto-cor__sep"> - </span> : null}
                          <input
                            aria-label={`${nomeCor} ${tamanho}`}
                            inputMode="numeric"
                            value={qtds[tamanho] ?? 0}
                            readOnly={!podeFinalizar}
                            disabled={!podeFinalizar}
                            onChange={(e) => {
                              const bruto = e.target.value.replace(/\D/g, '');
                              const quantidade = bruto === '' ? 0 : Number(bruto);
                              setQuantidadesPorCor((atual) => ({
                                ...atual,
                                [nomeCor]: { ...(atual[nomeCor] ?? {}), [tamanho]: Number.isFinite(quantidade) ? quantidade : 0 },
                              }));
                            }}
                          />
                          <strong>{tamanho}</strong>
                        </span>
                      ))}
                    </p>
                    <div className="enfesto-cor__consumo" aria-label={`Consumo ${nomeCor}`}>
                      <label>
                        Camadas
                        <input
                          aria-label={`Camadas ${nomeCor}`}
                          inputMode="numeric"
                          value={consumo.camadas || ''}
                          readOnly={!podeFinalizar}
                          disabled={!podeFinalizar}
                          onChange={(e) => {
                            const bruto = e.target.value.replace(/\D/g, '');
                            const folhas = bruto === '' ? 0 : Number(bruto);
                            setConsumoPorCor((atual) => ({
                              ...atual,
                              [nomeCor]: {
                                ...(atual[nomeCor] ?? { pesoFolha: '', camadasManual: true }),
                                camadas: Number.isFinite(folhas) ? folhas : 0,
                                camadasManual: true,
                              },
                            }));
                          }}
                        />
                      </label>
                      <label>
                        Peso por folha
                        <input
                          aria-label={`Peso por folha ${nomeCor}`}
                          inputMode="decimal"
                          value={consumo.pesoFolha}
                          placeholder="0,000"
                          readOnly={!podeFinalizar}
                          disabled={!podeFinalizar}
                          onChange={(e) => {
                            const valor = e.target.value.replace(/[^\d.,]/g, '');
                            setConsumoPorCor((atual) => ({
                              ...atual,
                              [nomeCor]: {
                                camadas: atual[nomeCor]?.camadas ?? 0,
                                camadasManual: atual[nomeCor]?.camadasManual ?? false,
                                pesoFolha: valor,
                              },
                            }));
                          }}
                        />
                      </label>
                      <p className="enfesto-cor__consumo-total" aria-label={`Consumo total ${nomeCor}`}>
                        Consumo total:{' '}
                        {consumoTotal > 0
                          ? `${textoDecimal(consumoTotal)} ${unidadeTecido}`
                          : `— ${unidadeTecido}`}
                      </p>
                    </div>
                    </div>
                    <p className="enfesto-cor__total" aria-label={`Total da cor ${nomeCor}`}>
                      Total: {total} {total === 1 ? 'peça' : 'peças'}
                    </p>
                    <p
                      className={
                        confirmacao
                          ? 'enfesto-cor__status enfesto-cor__status--ok'
                          : 'enfesto-cor__status enfesto-cor__status--pendente'
                      }
                      aria-label={`Status ${nomeCor}`}
                    >
                      Status: {confirmacao ? `${nomeStatus} OK` : 'PENDENTE'}
                    </p>
                    {confirmacao ? (
                      <p className="enfesto-cor__meta" aria-label={`Confirmação ${nomeCor}`}>
                        Confirmado em {formatarDataConfirmacao(confirmacao.em)} · {confirmacao.por}
                      </p>
                    ) : (
                      <button
                        type="button"
                        className="btn-secundario enfesto-cor__confirmar"
                        disabled={!podeFinalizar || confirmandoCor === nomeCor}
                        onClick={() => void confirmarCorFicha(nomeCor)}
                      >
                        {confirmandoCor === nomeCor ? 'Confirmando…' : `Confirmar ${nomeStatus}`}
                      </button>
                    )}
                  </article>
                );
              })}
            </div>
          )}

          {historicoFicha.length > 0 && (
            <section className="ficha-oc__historico" aria-label="Histórico da ordem de corte">
              <h3>Histórico da ficha</h3>
              <ul>
                {historicoFicha.map((item) => (
                  <li key={item.id}>
                    <strong>{item.resumo}</strong>
                    {item.usuario_nome ? ` · ${item.usuario_nome}` : ''} · {item.criado_em}
                  </li>
                ))}
              </ul>
            </section>
          )}

          {!semGrade ? (
            <div className="corte-consumo" aria-label="Cálculo de consumo">
              <h3>Tecido do enfesto</h3>
              <label>
                Tecido
                <select
                  aria-label="Tecido"
                  value={tecidoId}
                  disabled={!podeFinalizar}
                  onChange={(e) => {
                    const id = e.target.value;
                    setTecidoId(id);
                    const cadastro = tecidos.find((item) => String(item.id) === id);
                    if (!cadastro) return;
                    setSelecionada((atual) => (atual ? aplicarCadastroNaFicha(atual, cadastro) : atual));
                  }}
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
              <DadosTecidoCadastro
                ocultarRolo
                tecido={dadosTecidoFicha ?? {
                  nome: '',
                  cor: '',
                  largura_cm: null,
                  largura_unidade: 'cm',
                  gramatura: null,
                  composicao: '',
                  unidade: 'KG',
                  numero_rolo: '',
                }}
                onChange={
                  podeFinalizar
                    ? (campo, valor) => {
                        setSelecionada((atual) => (atual ? aplicarCampoTecidoFicha(atual, tecido, campo, valor) : atual));
                      }
                    : undefined
                }
              />
              <p className="dica">
                Tecido controlado em {unidadeTecido}. Camadas, peso por folha e consumo são informados por cor. A baixa
                do estoque ocorre uma vez por cor ao finalizar.
              </p>
            </div>
          ) : null}

          {!semGrade && podeFinalizar ? (
            <div className="enfesto-finalizar">
              {excedePlanejado ? (
                <label className="corte-autorizar">
                  <input
                    type="checkbox"
                    checked={autorizar}
                    onChange={(e) => setAutorizar(e.target.checked)}
                  />
                  <span>Autorizar quantidade acima do planejado</span>
                </label>
              ) : null}
              {estoqueInsuficiente ? (
                <label className="corte-autorizar">
                  <input
                    type="checkbox"
                    checked={autorizarEstoque}
                    onChange={(e) => setAutorizarEstoque(e.target.checked)}
                    aria-label="Confirmar finalização com estoque insuficiente"
                  />
                  <span>
                    Estoque insuficiente para a saída. Confirmar finalização com saldo{' '}
                    {textoDecimal(saldoTecido)} {unidadeTecido} e consumo {textoDecimal(consumoFinalizar)}{' '}
                    {unidadeTecido}
                  </span>
                </label>
              ) : null}
              <button
                type="button"
                className="btn-primario"
                disabled={salvando || !tecidoId}
                onClick={() => void finalizarEnfesto()}
              >
                {salvando ? 'Finalizando…' : 'FINALIZAR ENFESTO'}
              </button>
            </div>
          ) : null}

          {erro && <p className="erro">{erro}</p>}
        </section>
        </>
      ) : null}
    </div>
  );
}
