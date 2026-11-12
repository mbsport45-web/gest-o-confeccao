import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  cadastrarOficinaLiberacao,
  confirmarEntregaLiberacaoFicha,
  confirmarLiberacaoFicha,
  encaminharOcExpedicao,
  listarFichasLiberacao,
  salvarConferenciaExpedicao,
  listarOrdens,
  STATUS_EXPEDICAO_LABEL,
  STATUS_OP_LABEL,
  STATUS_PAGAMENTO_OFICINA_LABEL,
  salvarAviamentosLiberacaoFicha,
  salvarChavePixOficina,
  urlPdfLiberacaoFicha,
  type FichaLiberacao,
  type OficinaPixCadastro,
  type PagamentoOficinaFicha,
  type OrdemProducao,
  type StatusExpedicao,
} from './api';
import { formatarNumeroDecimal, numeroDoTexto } from './consumoCorte';
import { etapaLinhaProducao, ETAPA_LINHA_LABEL } from './linhaProducao';
import { montarPixCopiaECola } from './pixOficina';

type FormularioFicha = {
  costureiro: string;
  valor: string;
  oficina: string;
  data: string;
  data_retirada: string;
};

type LinhaAviamento = {
  descricao: string;
  quantidade: string;
  unidade: string;
};

const UNIDADES_AVIAMENTO = ['UN', 'KG', 'METRO', 'PAR', 'PC', 'RL', 'CX'];

function linhaAviamentoVazia(): LinhaAviamento {
  return { descricao: '', quantidade: '', unidade: 'UN' };
}

function aviamentosIniciais(ficha: FichaLiberacao): LinhaAviamento[] {
  const linhas = (ficha.aviamentos ?? []).map((item) => ({
    descricao: item.descricao ?? '',
    quantidade: item.quantidade == null ? '' : formatarNumeroDecimal(item.quantidade),
    unidade: (item.unidade || 'UN').trim() || 'UN',
  }));
  return linhas.length ? linhas : [linhaAviamentoVazia()];
}

function payloadAviamentos(linhas: LinhaAviamento[]) {
  return linhas
    .filter((linha) => linha.descricao.trim())
    .map((linha) => ({
      descricao: linha.descricao.trim(),
      quantidade: numeroMoeda(linha.quantidade) ?? 0,
      unidade: linha.unidade.trim() || 'UN',
    }));
}

function coresDaFicha(ficha: FichaLiberacao): string {
  const cores = [
    ...new Set(
      (ficha.linhas?.length ? ficha.linhas.map((linha) => linha.cor) : ficha.grade.map((celula) => celula.cor)).filter(
        Boolean,
      ),
    ),
  ];
  return cores.join(', ') || '—';
}

function tamanhosDaFicha(ficha: FichaLiberacao): string[] {
  if (ficha.tamanhos?.length) return ficha.tamanhos;
  return [...new Set(ficha.grade.map((celula) => celula.tamanho).filter(Boolean))];
}

function quantidadeCelula(ficha: FichaLiberacao, cor: string, tamanho: string): number {
  return (
    ficha.grade.find(
      (celula) =>
        celula.cor.trim().toLocaleLowerCase('pt-BR') === cor.trim().toLocaleLowerCase('pt-BR') &&
        celula.tamanho.trim().toLocaleLowerCase('pt-BR') === tamanho.trim().toLocaleLowerCase('pt-BR'),
    )?.quantidade ?? 0
  );
}

function numeroMoeda(valor: string): number | null {
  const t = valor.trim().replace(/^R\$\s?/i, '');
  if (!t) return null;
  if (t === '0' || t === '0,0' || t === '0,00' || t === '0.0' || t === '0.00') return 0;
  return numeroDoTexto(t);
}

function dataIso(valor: string | null | undefined): string {
  const t = String(valor ?? '').trim();
  const iso = t.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return iso ? `${iso[1]}-${iso[2]}-${iso[3]}` : '';
}

function valorInicial(ficha: FichaLiberacao): string {
  if (ficha.liberacao && ficha.liberacao.valor_peca != null) return formatarNumeroDecimal(ficha.liberacao.valor_peca);
  if (ficha.valor_peca_sugerido != null) return formatarNumeroDecimal(ficha.valor_peca_sugerido);
  return '';
}

function costureiroInicial(ficha: FichaLiberacao): string {
  return (
    ficha.liberacao?.costureiro.trim() ||
    ficha.oficinas?.find((item) => item.costureiro.trim())?.costureiro.trim() ||
    ''
  );
}

function oficinaInicial(ficha: FichaLiberacao): string {
  return (
    ficha.liberacao?.oficina.trim() ||
    ficha.oficinas?.find((item) => item.oficina.trim())?.oficina.trim() ||
    ''
  );
}

export function dataHojeLocal(): string {
  const agora = new Date();
  const y = agora.getFullYear();
  const m = String(agora.getMonth() + 1).padStart(2, '0');
  const d = String(agora.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function formatarDataTela(valor: string): string {
  const iso = valor.trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (iso) return `${iso[3]}/${iso[2]}/${iso[1]}`;
  return valor.trim() || '—';
}

function formatarDataHoraTela(valor: string): string {
  const t = valor.trim();
  const m = t.match(/^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2}))?/);
  if (!m) return t || '—';
  const data = `${m[3]}/${m[2]}/${m[1]}`;
  return m[4] && m[5] ? `${data} ${m[4]}:${m[5]}` : data;
}

function formularioInicial(ficha: FichaLiberacao): FormularioFicha {
  return {
    costureiro: costureiroInicial(ficha),
    valor: valorInicial(ficha),
    oficina: oficinaInicial(ficha),
    data: dataIso(ficha.liberacao?.data_liberacao) || dataHojeLocal(),
    data_retirada: dataIso(ficha.liberacao?.data_retirada || ficha.data_retirada),
  };
}

type AbaLiberacao = 'pendentes' | 'liberadas';
type IndicadorProducao = 'andamento' | 'atrasados' | 'entregues' | 'expedicao' | 'pagamentos';

function pecasDaFicha(ficha: FichaLiberacao): number {
  const grade = ficha.grade.reduce((soma, celula) => soma + celula.quantidade, 0);
  return grade || ficha.quantidade || 0;
}

function formatarMoedaBr(valor: number): string {
  return valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function dataPrevistaPassou(valor: string | null | undefined, hoje: string): boolean {
  const prevista = String(valor ?? '').slice(0, 10);
  return Boolean(prevista && prevista < hoje);
}

type FichaAndamento = {
  chave: string;
  ordemId: number;
  codigo: string;
  modelo: string;
  referencia: string;
  pecas: number;
  pecasEnviadas: number;
  pecasConferidas: number | null;
  conferidoEm: string;
  conferidoPorNome: string;
  oficina: string;
  costureiro: string;
  dataEnvio: string;
  prazo10: string;
  dataEntrega: string;
  producao: 'andamento' | 'atrasado' | 'entregue';
  pagamento: PagamentoOficinaFicha;
  statusExpedicao: StatusExpedicao | null;
  encaminhadoEm: string;
};

type LinhaPagamentoOficina = {
  chave: string;
  codigo: string;
  cliente: string;
  oficina: string;
  costureiro: string;
  modelo: string;
  referencia: string;
  pecas: number;
  valorPeca: number;
  total: number;
  valorPago: number;
  saldo: number;
  status: 'pendente' | 'parcial' | 'pago';
  dataPagamento: string | null;
};

type GrupoPagamentoOficina = {
  oficina: string;
  pecas: number;
  valor: number;
  valorPago: number;
  saldo: number;
  linhas: LinhaPagamentoOficina[];
};

function pagamentoDaFicha(ficha: FichaLiberacao, total: number): PagamentoOficinaFicha {
  const salvo = ficha.pagamento;
  if (salvo) return salvo;
  return {
    lancamento_id: null,
    valor: total,
    valor_pago: 0,
    saldo: total,
    status: 'pendente',
    data_pagamento: null,
  };
}

function somarDiasIso(iso: string, dias: number): string {
  const partes = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!partes) return '';
  const data = new Date(Number(partes[1]), Number(partes[2]) - 1, Number(partes[3]));
  data.setDate(data.getDate() + dias);
  const y = data.getFullYear();
  const m = String(data.getMonth() + 1).padStart(2, '0');
  const d = String(data.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function oficinaRegistrada(ficha?: FichaLiberacao): string {
  if (!ficha) return '';
  return (
    ficha.liberacao?.oficina.trim() ||
    ficha.oficinas?.find((item) => item.oficina.trim())?.oficina.trim() ||
    ''
  );
}

function costureiroRegistrado(ficha?: FichaLiberacao): string {
  if (!ficha) return '';
  return (
    ficha.liberacao?.costureiro.trim() ||
    ficha.oficinas?.find((item) => item.costureiro.trim())?.costureiro.trim() ||
    ''
  );
}

function fichaAindaEmProducao(ficha: FichaLiberacao, ordem?: OrdemProducao): boolean {
  if (ficha.status_processo === 'entregue' || ficha.status_processo === 'expedicao') return false;
  if (ordem) {
    if (ordem.status === 'concluida' || ordem.status === 'cancelada') return false;
    return Boolean(
      etapaLinhaProducao(
        ordem.status,
        ordem.ordem_corte?.status_processo ?? ficha.status_processo ?? null,
        Boolean(ficha.liberacao?.entregue_em),
      ),
    );
  }
  const statusOp = (ficha.ordem_status || '').trim();
  if (statusOp === 'concluida' || statusOp === 'cancelada') return false;
  return ficha.status_processo === 'encaminhado' || statusOp === 'costura' || statusOp === 'em_producao';
}

function fichaJaEntregue(ficha: FichaLiberacao): boolean {
  return Boolean(String(ficha.liberacao?.entregue_em ?? '').trim());
}

function fichaExpedicaoAberta(ficha: FichaLiberacao): boolean {
  const status = ficha.expedicao?.status;
  return Boolean(status) && status !== 'entregue';
}

function linhaAcompanhamentoOficina(
  ficha: FichaLiberacao,
  ordem: OrdemProducao | undefined,
  hoje: string,
): FichaAndamento {
  const dataEnvio = dataIso(ficha.liberacao?.data_liberacao);
  const prazo10 = somarDiasIso(dataEnvio, 10);
  const dataEntrega = String(ficha.liberacao?.entregue_em ?? '').trim();
  const pecas = pecasDaFicha(ficha);
  const totalOficina = pecas * (Number(ficha.liberacao?.valor_peca) || 0);
  return {
    chave: `ficha-${ficha.id}`,
    ordemId: ficha.ordem_id,
    codigo: ficha.codigo,
    modelo: ficha.modelo || ficha.produto || '—',
    referencia: ficha.referencia || ordem?.referencia || ordem?.ordem_corte?.referencia || '',
    pecas,
    pecasEnviadas: Number(ficha.expedicao?.pecas) || pecas,
    pecasConferidas:
      ficha.expedicao?.pecas_conferidas == null || ficha.expedicao.pecas_conferidas === undefined
        ? null
        : Number(ficha.expedicao.pecas_conferidas),
    conferidoEm: String(ficha.expedicao?.conferido_em ?? '').trim(),
    conferidoPorNome: String(ficha.expedicao?.conferido_por_nome ?? '').trim(),
    oficina: oficinaRegistrada(ficha),
    costureiro: costureiroRegistrado(ficha),
    dataEnvio,
    prazo10,
    dataEntrega,
    producao: dataEntrega ? 'entregue' : prazo10 && prazo10 < hoje ? 'atrasado' : 'andamento',
    pagamento: pagamentoDaFicha(ficha, totalOficina),
    statusExpedicao: ficha.expedicao?.status ?? null,
    encaminhadoEm: String(ficha.expedicao?.encaminhado_em ?? '').trim(),
  };
}

export function LiberacaoFichasPage() {
  const [fichas, setFichas] = useState<FichaLiberacao[]>([]);
  const [liberadas, setLiberadas] = useState<FichaLiberacao[]>([]);
  const [aba, setAba] = useState<AbaLiberacao | null>(null);
  const [indicador, setIndicador] = useState<IndicadorProducao | null>('andamento');
  const [ordens, setOrdens] = useState<OrdemProducao[]>([]);
  const [fichaAbertaId, setFichaAbertaId] = useState<number | null>(null);
  const [formularios, setFormularios] = useState<Record<number, FormularioFicha>>({});
  const [oficinasOpcoes, setOficinasOpcoes] = useState<string[]>([]);
  const [oficinasPix, setOficinasPix] = useState<OficinaPixCadastro[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [salvandoId, setSalvandoId] = useState<number | null>(null);
  const [cadastrandoId, setCadastrandoId] = useState<number | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [aviamentosPorFicha, setAviamentosPorFicha] = useState<Record<number, LinhaAviamento[]>>({});
  const [statusAviamentos, setStatusAviamentos] = useState<Record<number, 'salvando' | 'salvo' | 'erro'>>({});
  const timersAviamentos = useRef<Record<number, ReturnType<typeof setTimeout>>>({});
  const aviamentosRef = useRef(aviamentosPorFicha);
  aviamentosRef.current = aviamentosPorFicha;

  const recarregar = useCallback(async (opcoes?: { silencioso?: boolean }) => {
    try {
      if (!opcoes?.silencioso) setCarregando(true);
      const [lista, ops] = await Promise.all([
        listarFichasLiberacao(),
        listarOrdens().catch(() => [] as OrdemProducao[]),
      ]);
      setFichas(lista.data);
      setLiberadas(lista.liberadas);
      setOficinasPix(lista.oficinas_pix ?? []);
      setOrdens(Array.isArray(ops) ? ops : []);
      setOficinasOpcoes((atual) => {
        const juntas = [
          ...lista.oficinas,
          ...lista.data.flatMap((ficha) => ficha.oficinas_opcoes ?? []),
          ...lista.liberadas.flatMap((ficha) => ficha.oficinas_opcoes ?? []),
        ];
        const vistos = new Set(atual.map((nome) => nome.toLocaleLowerCase('pt-BR')));
        const proximo = [...atual];
        for (const nome of juntas) {
          const chave = nome.toLocaleLowerCase('pt-BR');
          if (vistos.has(chave)) continue;
          vistos.add(chave);
          proximo.push(nome);
        }
        return proximo;
      });
      setFormularios((atual) => {
        const proximo = { ...atual };
        for (const ficha of [...lista.data, ...lista.liberadas]) {
          proximo[ficha.id] = formularioInicial(ficha);
        }
        return proximo;
      });
      setAviamentosPorFicha((atual) => {
        const proximo = { ...atual };
        for (const ficha of [...lista.data, ...lista.liberadas]) {
          proximo[ficha.id] = aviamentosIniciais(ficha);
        }
        return proximo;
      });
      setErro(null);
    } catch (e) {
      setErro((e as Error).message);
    } finally {
      if (!opcoes?.silencioso) setCarregando(false);
    }
  }, []);

  useEffect(() => {
    void recarregar();
  }, [recarregar]);

  useEffect(() => {
    function atualizarAoVoltar() {
      if (document.visibilityState === 'hidden') return;
      void recarregar({ silencioso: true });
    }
    window.addEventListener('focus', atualizarAoVoltar);
    document.addEventListener('visibilitychange', atualizarAoVoltar);
    return () => {
      window.removeEventListener('focus', atualizarAoVoltar);
      document.removeEventListener('visibilitychange', atualizarAoVoltar);
    };
  }, [recarregar]);

  useEffect(() => {
    const timers = timersAviamentos.current;
    return () => {
      for (const timer of Object.values(timers)) clearTimeout(timer);
    };
  }, []);

  function aplicarFichaAviamentos(salva: FichaLiberacao) {
    setFichas((atual) => atual.map((item) => (item.id === salva.id ? { ...item, aviamentos: salva.aviamentos } : item)));
    setLiberadas((atual) =>
      atual.map((item) => (item.id === salva.id ? { ...item, aviamentos: salva.aviamentos } : item)),
    );
  }

  async function persistirAviamentos(ficha: FichaLiberacao, linhas: LinhaAviamento[]) {
    setStatusAviamentos((atual) => ({ ...atual, [ficha.id]: 'salvando' }));
    try {
      const salva = await salvarAviamentosLiberacaoFicha(ficha.ordem_id, payloadAviamentos(linhas));
      aplicarFichaAviamentos(salva);
      setStatusAviamentos((atual) => ({ ...atual, [ficha.id]: 'salvo' }));
      setErro(null);
      return salva;
    } catch (e) {
      setStatusAviamentos((atual) => ({ ...atual, [ficha.id]: 'erro' }));
      setErro((e as Error).message);
      throw e;
    }
  }

  function agendarSalvarAviamentos(ficha: FichaLiberacao, linhas: LinhaAviamento[]) {
    const atual = timersAviamentos.current[ficha.id];
    if (atual) clearTimeout(atual);
    timersAviamentos.current[ficha.id] = setTimeout(() => {
      void persistirAviamentos(ficha, linhas);
    }, 350);
  }

  function alterarAviamento(ficha: FichaLiberacao, indice: number, campo: keyof LinhaAviamento, valor: string) {
    const base = aviamentosRef.current[ficha.id] ?? aviamentosIniciais(ficha);
    const linhas = base.map((linha, i) => (i === indice ? { ...linha, [campo]: valor } : linha));
    aviamentosRef.current = { ...aviamentosRef.current, [ficha.id]: linhas };
    setAviamentosPorFicha(aviamentosRef.current);
    agendarSalvarAviamentos(ficha, linhas);
  }

  function adicionarAviamento(ficha: FichaLiberacao) {
    const base = aviamentosRef.current[ficha.id] ?? aviamentosIniciais(ficha);
    const linhas = [...base, linhaAviamentoVazia()];
    aviamentosRef.current = { ...aviamentosRef.current, [ficha.id]: linhas };
    setAviamentosPorFicha(aviamentosRef.current);
  }

  function removerAviamento(ficha: FichaLiberacao, indice: number) {
    const base = aviamentosRef.current[ficha.id] ?? aviamentosIniciais(ficha);
    const restante = base.filter((_, i) => i !== indice);
    const linhas = restante.length ? restante : [linhaAviamentoVazia()];
    aviamentosRef.current = { ...aviamentosRef.current, [ficha.id]: linhas };
    setAviamentosPorFicha(aviamentosRef.current);
    agendarSalvarAviamentos(ficha, linhas);
  }

  async function confirmar(ficha: FichaLiberacao) {
    const form = formularios[ficha.id] ?? formularioInicial(ficha);
    const valor = numeroMoeda(form.valor);
    if (!form.data.trim()) {
      setErro('Informe a data de liberação para oficina');
      return;
    }
    if (!form.oficina.trim()) {
      setErro('Selecione a oficina');
      return;
    }
    if (!form.costureiro.trim()) {
      setErro('Selecione o costureiro');
      return;
    }
    if (valor == null) {
      setErro('Informe o valor por peça em reais');
      return;
    }
    try {
      setSalvandoId(ficha.id);
      const timer = timersAviamentos.current[ficha.id];
      if (timer) clearTimeout(timer);
      await persistirAviamentos(ficha, aviamentosRef.current[ficha.id] ?? aviamentosIniciais(ficha));
      const salva = await confirmarLiberacaoFicha(ficha.ordem_id, {
        costureiro: form.costureiro.trim(),
        valor_peca: valor,
        oficina: form.oficina.trim(),
        data_liberacao: form.data.trim(),
        ...(form.data_retirada.trim() ? { data_retirada: form.data_retirada.trim() } : {}),
      });
      setFichas((atual) => atual.filter((item) => item.id !== ficha.id));
      setLiberadas((atual) => [salva, ...atual.filter((item) => item.id !== salva.id)]);
      setFormularios((atual) => ({
        ...atual,
        [salva.id]: formularioInicial(salva),
      }));
      setAviamentosPorFicha((atual) => ({
        ...atual,
        [salva.id]: aviamentosIniciais({
          ...salva,
          aviamentos: salva.aviamentos?.length ? salva.aviamentos : atual[ficha.id] ?? salva.aviamentos,
        }),
      }));
      setAba('liberadas');
      setFichaAbertaId(salva.id);
      setAviso(`${ficha.codigo} liberada para ${form.oficina.trim()}.`);
      setErro(null);
    } catch (e) {
      setErro((e as Error).message);
    } finally {
      setSalvandoId(null);
    }
  }

  async function confirmarEntrega(item: FichaAndamento) {
    const salva = await confirmarEntregaLiberacaoFicha(item.ordemId);
    setLiberadas((atual) => atual.map((ficha) => (ficha.id === salva.id ? { ...ficha, ...salva } : ficha)));
    setAviso(`${salva.codigo} entregue pela oficina.`);
    setErro(null);
  }

  async function enviarParaExpedicao(item: FichaAndamento) {
    const salva = await encaminharOcExpedicao(item.ordemId);
    setLiberadas((atual) => atual.map((ficha) => (ficha.id === salva.id ? { ...ficha, ...salva } : ficha)));
    setAviso(`${salva.codigo} encaminhada para expedição.`);
    setErro(null);
  }

  async function salvarConferencia(item: FichaAndamento, pecasConferidas: number) {
    const salva = await salvarConferenciaExpedicao(item.ordemId, pecasConferidas);
    setLiberadas((atual) => atual.map((ficha) => (ficha.id === salva.id ? { ...ficha, ...salva } : ficha)));
    await recarregar({ silencioso: true });
    setIndicador('expedicao');
    setAviso('Conferência salva com sucesso!');
    setErro(null);
  }

  async function salvarPixOficina(nome: string, chavePix: string) {
    const salva = await salvarChavePixOficina(nome, chavePix);
    setOficinasPix((atual) => {
      const chave = salva.nome.toLocaleLowerCase('pt-BR');
      const proximo = atual.filter((item) => item.nome.toLocaleLowerCase('pt-BR') !== chave);
      return [...proximo, salva].sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
    });
    setOficinasOpcoes((atual) => {
      if (atual.some((item) => item.toLocaleLowerCase('pt-BR') === salva.nome.toLocaleLowerCase('pt-BR'))) {
        return atual;
      }
      return [...atual, salva.nome];
    });
    setAviso(`Chave Pix de ${salva.nome} gravada.`);
    setErro(null);
  }

  async function cadastrarOficina(ficha: FichaLiberacao) {
    const form = formularios[ficha.id] ?? formularioInicial(ficha);
    const nome = form.oficina.trim();
    if (!nome) {
      setErro('Informe o nome da oficina para cadastrar');
      return;
    }
    try {
      setCadastrandoId(ficha.id);
      const salva = await cadastrarOficinaLiberacao(nome);
      setOficinasOpcoes((atual) => {
        if (atual.some((item) => item.toLocaleLowerCase('pt-BR') === salva.nome.toLocaleLowerCase('pt-BR'))) {
          return atual;
        }
        return [...atual, salva.nome];
      });
      setFormularios((atual) => ({
        ...atual,
        [ficha.id]: { ...(atual[ficha.id] ?? formularioInicial(ficha)), oficina: salva.nome },
      }));
      setAviso(salva.ja_existia ? `Oficina ${salva.nome} já estava cadastrada.` : `Oficina ${salva.nome} cadastrada.`);
      setErro(null);
    } catch (e) {
      setErro((e as Error).message);
    } finally {
      setCadastrandoId(null);
    }
  }

  function abrirAba(proxima: AbaLiberacao) {
    setAba(proxima);
    setFichaAbertaId(null);
  }

  function abrirIndicador(proximo: IndicadorProducao) {
    setIndicador((atual) => (atual === proximo ? null : proximo));
  }

  const hoje = dataHojeLocal();
  const emAndamento = useMemo(
    () =>
      ordens.filter((ordem) => etapaLinhaProducao(ordem.status, ordem.ordem_corte?.status_processo ?? null)),
    [ordens],
  );
  const cortesAtrasados = useMemo(
    () =>
      emAndamento.filter((ordem) => {
        const etapa = etapaLinhaProducao(ordem.status, ordem.ordem_corte?.status_processo ?? null);
        return etapa === 'corte' && dataPrevistaPassou(ordem.data_prevista, hoje);
      }),
    [emAndamento, hoje],
  );
  const fichasEmAndamento = useMemo(() => {
    const vistos = new Set<number>();
    const lista: FichaAndamento[] = [];
    for (const ficha of liberadas) {
      if (vistos.has(ficha.ordem_id)) continue;
      if (fichaJaEntregue(ficha)) continue;
      const ordem = ordens.find((item) => item.id === ficha.ordem_id);
      if (!fichaAindaEmProducao(ficha, ordem)) continue;
      vistos.add(ficha.ordem_id);
      lista.push(linhaAcompanhamentoOficina(ficha, ordem, hoje));
    }
    return lista;
  }, [liberadas, ordens, hoje]);
  const fichasEntregues = useMemo(() => {
    const vistos = new Set<number>();
    const lista: FichaAndamento[] = [];
    for (const ficha of liberadas) {
      if (!fichaJaEntregue(ficha)) continue;
      if (vistos.has(ficha.ordem_id)) continue;
      vistos.add(ficha.ordem_id);
      lista.push(linhaAcompanhamentoOficina(ficha, ordens.find((item) => item.id === ficha.ordem_id), hoje));
    }
    return lista;
  }, [liberadas, ordens, hoje]);
  const fichasExpedicao = useMemo(() => {
    const vistos = new Set<number>();
    const lista: FichaAndamento[] = [];
    for (const ficha of liberadas) {
      if (!fichaExpedicaoAberta(ficha)) continue;
      if (vistos.has(ficha.ordem_id)) continue;
      vistos.add(ficha.ordem_id);
      lista.push(linhaAcompanhamentoOficina(ficha, ordens.find((item) => item.id === ficha.ordem_id), hoje));
    }
    return lista;
  }, [liberadas, ordens, hoje]);
  const pagamentosOficina = useMemo(() => {
    const vistos = new Set<number>();
    const grupos = new Map<string, GrupoPagamentoOficina>();
    for (const ficha of liberadas) {
      if (!fichaJaEntregue(ficha)) continue;
      if (vistos.has(ficha.ordem_id)) continue;
      vistos.add(ficha.ordem_id);
      const pecas = pecasDaFicha(ficha);
      const valorPeca = Number(ficha.liberacao?.valor_peca) || 0;
      const total = pecas * valorPeca;
      const pagamento = pagamentoDaFicha(ficha, total);
      const linha: LinhaPagamentoOficina = {
        chave: `pag-${ficha.id}`,
        codigo: ficha.codigo,
        cliente: ficha.cliente || '—',
        oficina: oficinaRegistrada(ficha) || 'Sem oficina',
        costureiro: costureiroRegistrado(ficha) || '—',
        modelo: ficha.modelo || ficha.produto || '—',
        referencia: ficha.referencia || '',
        pecas,
        valorPeca,
        total,
        valorPago: pagamento.valor_pago,
        saldo: pagamento.saldo,
        status: pagamento.status,
        dataPagamento: pagamento.data_pagamento,
      };
      const atual = grupos.get(linha.oficina) ?? {
        oficina: linha.oficina,
        pecas: 0,
        valor: 0,
        valorPago: 0,
        saldo: 0,
        linhas: [],
      };
      atual.pecas += linha.pecas;
      atual.valor += linha.total;
      atual.valorPago += linha.valorPago;
      atual.saldo += linha.saldo;
      atual.linhas.push(linha);
      grupos.set(linha.oficina, atual);
    }
    return [...grupos.values()]
      .map((grupo) => ({
        ...grupo,
        linhas: [...grupo.linhas].sort((a, b) => a.codigo.localeCompare(b.codigo, 'pt-BR')),
      }))
      .sort((a, b) => a.oficina.localeCompare(b.oficina, 'pt-BR'));
  }, [liberadas]);
  const totalPagamentos = pagamentosOficina.reduce((soma, grupo) => soma + grupo.valor, 0);
  const indicadoresPagamento = useMemo(() => {
    const linhas = pagamentosOficina.flatMap((grupo) => grupo.linhas);
    let totalPago = 0;
    let totalPendente = 0;
    let totalParcial = 0;
    let saldoAberto = 0;
    for (const linha of linhas) {
      if (linha.status === 'pago') totalPago += linha.valorPago;
      else if (linha.status === 'parcial') totalParcial += linha.valorPago;
      else totalPendente += linha.total;
      saldoAberto += linha.saldo;
    }
    return { totalPago, totalPendente, totalParcial, saldoAberto };
  }, [pagamentosOficina]);

  const fichaPendenteAberta = fichas.find((item) => item.id === fichaAbertaId) ?? null;
  const fichaLiberadaAberta = liberadas.find((item) => item.id === fichaAbertaId) ?? null;

  function renderCard(ficha: FichaLiberacao, liberada: boolean) {
    return (
      <FichaLiberacaoCard
        ficha={ficha}
        form={formularios[ficha.id] ?? formularioInicial(ficha)}
        oficinasOpcoes={oficinasOpcoes}
        salvando={liberada ? false : salvandoId === ficha.id}
        cadastrando={liberada ? false : cadastrandoId === ficha.id}
        liberada={liberada}
        onFechar={() => setFichaAbertaId(null)}
        onChange={
          liberada
            ? () => undefined
            : (campo, valor) =>
                setFormularios((atual) => ({
                  ...atual,
                  [ficha.id]: {
                    ...(atual[ficha.id] ?? formularioInicial(ficha)),
                    [campo]: valor,
                  },
                }))
        }
        onCadastrarOficina={liberada ? () => undefined : () => void cadastrarOficina(ficha)}
        onConfirmar={liberada ? () => undefined : () => void confirmar(ficha)}
        aviamentos={aviamentosPorFicha[ficha.id] ?? aviamentosIniciais(ficha)}
        statusAviamentos={statusAviamentos[ficha.id]}
        onAviamentoChange={(indice, campo, valor) => alterarAviamento(ficha, indice, campo, valor)}
        onAdicionarAviamento={() => adicionarAviamento(ficha)}
        onRemoverAviamento={(indice) => removerAviamento(ficha, indice)}
      />
    );
  }

  return (
    <div className="modulo-compras-estoque">
      <section className="card liberacao-inicio" aria-label="Liberação Ficha/Oficina">
        {erro ? <p className="erro">{erro}</p> : null}
        {aviso ? <p className="ok">{aviso}</p> : null}
        {carregando ? <p className="dica">Carregando fichas…</p> : null}
        <div className="kpi-grid liberacao-kpis-extra" aria-label="Indicadores de produção">
          <button
            type="button"
            className={indicador === 'andamento' ? 'kpi kpi--ativa' : 'kpi'}
            aria-label="Em andamento"
            onClick={() => abrirIndicador('andamento')}
          >
            <span className="kpi__label">Em andamento</span>
            <strong className="kpi__valor">{carregando ? '—' : fichasEmAndamento.length}</strong>
          </button>
          <button
            type="button"
            className={indicador === 'atrasados' ? 'kpi kpi--alerta kpi--ativa' : 'kpi kpi--alerta'}
            aria-label="Cortes atrasados"
            onClick={() => abrirIndicador('atrasados')}
          >
            <span className="kpi__label">Cortes atrasados</span>
            <strong className="kpi__valor">{carregando ? '—' : cortesAtrasados.length}</strong>
          </button>
          <button
            type="button"
            className={indicador === 'entregues' ? 'kpi kpi--ativa' : 'kpi'}
            aria-label="Entregues"
            onClick={() => abrirIndicador('entregues')}
          >
            <span className="kpi__label">Entregues</span>
            <strong className="kpi__valor">{carregando ? '—' : fichasEntregues.length}</strong>
          </button>
          <button
            type="button"
            className={indicador === 'expedicao' ? 'kpi kpi--ativa' : 'kpi'}
            aria-label="Expedição"
            onClick={() => abrirIndicador('expedicao')}
          >
            <span className="kpi__label">Expedição</span>
            <strong className="kpi__valor">{carregando ? '—' : fichasExpedicao.length}</strong>
          </button>
          <button
            type="button"
            className={indicador === 'pagamentos' ? 'kpi kpi--ativa' : 'kpi'}
            aria-label="Pagamentos / Oficinas"
            onClick={() => abrirIndicador('pagamentos')}
          >
            <span className="kpi__label">Pagamentos / Oficinas</span>
            <strong className="kpi__valor">{carregando ? '—' : formatarMoedaBr(totalPagamentos)}</strong>
          </button>
        </div>
        <div className="kpi-grid liberacao-kpis" aria-label="Indicadores de liberação">
          <button
            type="button"
            className={aba === 'pendentes' ? 'kpi kpi--ativa' : 'kpi'}
            aria-label="Fichas pendentes de liberação"
            onClick={() => abrirAba('pendentes')}
          >
            <span className="kpi__label">Fichas pendentes de liberação</span>
            <strong className="kpi__valor">{carregando ? '—' : fichas.length}</strong>
          </button>
        </div>
        <div className="abas" role="tablist" aria-label="Liberação de fichas">
          <button
            type="button"
            role="tab"
            id="aba-liberacao-pendentes"
            aria-selected={aba === 'pendentes'}
            aria-controls="painel-liberacao-pendentes"
            className={aba === 'pendentes' ? 'abas__item abas__item--ativa' : 'abas__item'}
            onClick={() => abrirAba('pendentes')}
          >
            Liberar fichas
            <span className="abas__contagem">{fichas.length}</span>
          </button>
          <button
            type="button"
            role="tab"
            id="aba-liberacao-liberadas"
            aria-selected={aba === 'liberadas'}
            aria-controls="painel-liberacao-liberadas"
            className={aba === 'liberadas' ? 'abas__item abas__item--ativa' : 'abas__item'}
            onClick={() => abrirAba('liberadas')}
          >
            Fichas liberadas
            <span className="abas__contagem">{liberadas.length}</span>
          </button>
        </div>
      </section>

      {indicador ? (
        <section className="card" aria-label={`Dados de ${rotuloIndicador(indicador)}`}>
          <h3>{rotuloIndicador(indicador)}</h3>
          {indicador === 'andamento' ? (
            <ListaFichasAndamento itens={fichasEmAndamento} onConfirmarEntrega={confirmarEntrega} />
          ) : null}
          {indicador === 'atrasados' ? (
            <ListaOrdensIndicador
              itens={cortesAtrasados}
              vazio="Nenhum corte atrasado."
              destacarData
            />
          ) : null}
          {indicador === 'entregues' ? (
            <ListaFichasEntregues itens={fichasEntregues} onEnviarExpedicao={enviarParaExpedicao} />
          ) : null}
          {indicador === 'expedicao' ? (
            <ListaFichasExpedicao itens={fichasExpedicao} onSalvarConferencia={salvarConferencia} />
          ) : null}
          {indicador === 'pagamentos' ? (
            <ListaPagamentosOficina
              grupos={pagamentosOficina}
              total={totalPagamentos}
              indicadores={indicadoresPagamento}
              oficinasPix={oficinasPix}
              onSalvarChavePix={salvarPixOficina}
            />
          ) : null}
        </section>
      ) : null}

      {aba === 'pendentes' ? (
        <section
          className="liberacao-painel"
          role="tabpanel"
          id="painel-liberacao-pendentes"
          aria-labelledby="aba-liberacao-pendentes"
        >
          {fichaPendenteAberta ? (
            renderCard(fichaPendenteAberta, false)
          ) : !carregando && fichas.length === 0 ? (
            <p className="vazio">Nenhuma ficha pendente de liberação à oficina.</p>
          ) : (
            <div className="liberacao-lista">
              {fichas.map((ficha) => (
                <FichaLiberacaoResumo key={ficha.id} ficha={ficha} onAbrir={() => setFichaAbertaId(ficha.id)} />
              ))}
            </div>
          )}
        </section>
      ) : null}

      {aba === 'liberadas' ? (
        <section
          className="liberacao-painel"
          role="tabpanel"
          id="painel-liberacao-liberadas"
          aria-labelledby="aba-liberacao-liberadas"
        >
          {fichaLiberadaAberta ? (
            renderCard(fichaLiberadaAberta, true)
          ) : !carregando && liberadas.length === 0 ? (
            <p className="vazio">Nenhuma ficha liberada ainda.</p>
          ) : (
            <div className="liberacao-lista">
              {liberadas.map((ficha) => (
                <FichaLiberacaoResumo key={`lib-${ficha.id}`} ficha={ficha} onAbrir={() => setFichaAbertaId(ficha.id)} />
              ))}
            </div>
          )}
        </section>
      ) : null}
    </div>
  );
}

function rotuloIndicador(indicador: IndicadorProducao): string {
  if (indicador === 'andamento') return 'Em andamento';
  if (indicador === 'atrasados') return 'Cortes atrasados';
  if (indicador === 'entregues') return 'Entregues';
  if (indicador === 'expedicao') return 'Expedição';
  return 'Pagamentos / Oficinas';
}

function rotuloProducaoOficina(producao: FichaAndamento['producao']): string {
  if (producao === 'entregue') return 'Entregue';
  if (producao === 'atrasado') return 'Atrasado';
  return 'Em andamento';
}

function classeProducaoOficina(producao: FichaAndamento['producao']): string {
  if (producao === 'entregue') return 'pill pill--entregue';
  if (producao === 'atrasado') return 'pill pill--atrasado';
  return 'pill pill--andamento';
}

function CelulaPagamentoOficina({ pagamento }: { pagamento: PagamentoOficinaFicha }) {
  return (
    <div className="liberacao-pagamento-celula">
      <span className={`pill pill--pag-${pagamento.status}`}>{STATUS_PAGAMENTO_OFICINA_LABEL[pagamento.status]}</span>
      {pagamento.status === 'parcial' ? (
        <small>
          pago {formatarMoedaBr(pagamento.valor_pago)} · saldo {formatarMoedaBr(pagamento.saldo)}
        </small>
      ) : null}
    </div>
  );
}

function TabelaFichasOficina({
  itens,
  ariaTabela,
  ariaLinha,
  vazio,
  mostrarFiltroProducao = true,
  renderAcao,
}: {
  itens: FichaAndamento[];
  ariaTabela: string;
  ariaLinha: (item: FichaAndamento) => string;
  vazio: string;
  mostrarFiltroProducao?: boolean;
  renderAcao: (item: FichaAndamento) => ReactNode;
}) {
  const [busca, setBusca] = useState('');
  const [produto, setProduto] = useState('');
  const [oficina, setOficina] = useState('');
  const [status, setStatus] = useState('');
  const [statusPagamento, setStatusPagamento] = useState('');
  const produtos = useMemo(
    () =>
      [...new Set(itens.map((item) => item.modelo).filter((nome) => nome && nome !== '—'))].sort((a, b) =>
        a.localeCompare(b, 'pt-BR'),
      ),
    [itens],
  );
  const oficinas = useMemo(
    () =>
      [...new Set(itens.map((item) => item.oficina).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'pt-BR')),
    [itens],
  );
  const filtradas = itens.filter((item) => {
    const termo = busca.trim().toLocaleLowerCase('pt-BR');
    if (termo) {
      const alvo = `${item.codigo} ${item.referencia} ${item.modelo}`.toLocaleLowerCase('pt-BR');
      if (!alvo.includes(termo)) return false;
    }
    if (produto && item.modelo !== produto) return false;
    if (oficina && item.oficina !== oficina) return false;
    if (status && item.producao !== status) return false;
    if (statusPagamento && item.pagamento.status !== statusPagamento) return false;
    return true;
  });

  if (itens.length === 0) return <p className="vazio">{vazio}</p>;

  return (
    <div className="liberacao-andamento">
      <div className="filtros filtros--andamento">
        <input
          aria-label="Pesquisar por OC, REF e modelo"
          placeholder="Pesquisar por OC, REF ou modelo"
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
        />
        <select aria-label="Filtrar por produto" value={produto} onChange={(e) => setProduto(e.target.value)}>
          <option value="">Todos os produtos</option>
          {produtos.map((nome) => (
            <option key={nome} value={nome}>
              {nome}
            </option>
          ))}
        </select>
        <select aria-label="Filtrar por oficina" value={oficina} onChange={(e) => setOficina(e.target.value)}>
          <option value="">Todas as oficinas</option>
          {oficinas.map((nome) => (
            <option key={nome} value={nome}>
              {nome}
            </option>
          ))}
        </select>
        {mostrarFiltroProducao ? (
          <select aria-label="Filtrar por status" value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">Todos os status</option>
            <option value="andamento">Em andamento</option>
            <option value="atrasado">Atrasado</option>
          </select>
        ) : null}
        <select
          aria-label="Filtrar por status de pagamento"
          value={statusPagamento}
          onChange={(e) => setStatusPagamento(e.target.value)}
        >
          <option value="">Todos os pagamentos</option>
          <option value="pendente">PENDENTE</option>
          <option value="parcial">PARCIAL</option>
          <option value="pago">PAGO</option>
        </select>
      </div>
      <div className="liberacao-andamento__tabela">
        <table className="tabela" aria-label={ariaTabela}>
          <thead>
            <tr>
              <th>OC</th>
              <th>REF</th>
              <th>Modelo / peça</th>
              <th>Costureiro / oficina</th>
              <th>Quantidade</th>
              <th>Produção</th>
              <th>Pagamento</th>
              <th>Data de envio</th>
              <th>Prazo de 10 dias</th>
              <th>Data de entrega</th>
              <th>Ação</th>
            </tr>
          </thead>
          <tbody>
            {filtradas.length === 0 ? (
              <tr>
                <td colSpan={11}>Nenhuma ficha encontrada com esses filtros.</td>
              </tr>
            ) : (
              filtradas.map((item) => (
                <tr key={item.chave} aria-label={ariaLinha(item)}>
                  <td>{item.codigo}</td>
                  <td>{item.referencia || '—'}</td>
                  <td>{item.modelo}</td>
                  <td>{[item.costureiro, item.oficina].filter(Boolean).join(' / ') || '—'}</td>
                  <td>{item.pecas}</td>
                  <td>
                    <span className={classeProducaoOficina(item.producao)}>{rotuloProducaoOficina(item.producao)}</span>
                  </td>
                  <td>
                    <CelulaPagamentoOficina pagamento={item.pagamento} />
                  </td>
                  <td>{formatarDataTela(item.dataEnvio)}</td>
                  <td>{formatarDataTela(item.prazo10)}</td>
                  <td>{item.dataEntrega ? formatarDataHoraTela(item.dataEntrega) : '—'}</td>
                  <td className="liberacao-andamento__acao">{renderAcao(item)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ListaFichasAndamento({
  itens,
  onConfirmarEntrega,
}: {
  itens: FichaAndamento[];
  onConfirmarEntrega: (item: FichaAndamento) => Promise<void>;
}) {
  const [pendente, setPendente] = useState<FichaAndamento | null>(null);
  const [salvandoEntrega, setSalvandoEntrega] = useState(false);
  const [erroEntrega, setErroEntrega] = useState<string | null>(null);

  return (
    <div>
      <TabelaFichasOficina
        itens={itens}
        ariaTabela="Fichas em andamento"
        ariaLinha={(item) => `Ficha em andamento ${item.codigo}`}
        vazio="Nenhuma ficha em andamento."
        renderAcao={(item) =>
          item.producao === 'entregue' ? null : (
            <button
              type="button"
              className="btn-secundario"
              aria-label={`Confirmar entrega da ficha ${item.codigo}`}
              onClick={() => {
                setErroEntrega(null);
                setPendente(item);
              }}
            >
              Confirmar entrega
            </button>
          )
        }
      />
      {pendente ? (
        <div className="liberacao-modal" role="dialog" aria-modal="true" aria-labelledby="confirma-entrega-titulo">
          <div className="liberacao-modal__caixa">
            <p id="confirma-entrega-titulo">Confirma que esta ficha foi entregue pela oficina?</p>
            <p className="dica">
              {pendente.codigo}
              {pendente.oficina ? ` · ${pendente.oficina}` : ''}
            </p>
            {erroEntrega ? <p className="erro">{erroEntrega}</p> : null}
            <div className="liberacao-modal__acoes">
              <button
                type="button"
                className="btn-secundario"
                disabled={salvandoEntrega}
                onClick={() => {
                  if (salvandoEntrega) return;
                  setPendente(null);
                  setErroEntrega(null);
                }}
              >
                Cancelar
              </button>
              <button
                type="button"
                className="btn-primario"
                disabled={salvandoEntrega}
                onClick={() => {
                  void (async () => {
                    try {
                      setSalvandoEntrega(true);
                      setErroEntrega(null);
                      await onConfirmarEntrega(pendente);
                      setPendente(null);
                    } catch (e) {
                      setErroEntrega((e as Error).message);
                    } finally {
                      setSalvandoEntrega(false);
                    }
                  })();
                }}
              >
                {salvandoEntrega ? 'Confirmando…' : 'Confirmar'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function modeloReferenciaPagamento(item: LinhaPagamentoOficina): string {
  if (item.referencia) return `${item.modelo} / ${item.referencia}`;
  return item.modelo;
}

function chavePixDaOficina(oficinasPix: OficinaPixCadastro[], oficina: string): string {
  const chave = oficina.toLocaleLowerCase('pt-BR');
  return oficinasPix.find((item) => item.nome.toLocaleLowerCase('pt-BR') === chave)?.chave_pix ?? '';
}

function ListaPagamentosOficina({
  grupos,
  total,
  indicadores,
  oficinasPix,
  onSalvarChavePix,
}: {
  grupos: GrupoPagamentoOficina[];
  total: number;
  indicadores: { totalPago: number; totalPendente: number; totalParcial: number; saldoAberto: number };
  oficinasPix: OficinaPixCadastro[];
  onSalvarChavePix: (oficina: string, chavePix: string) => Promise<void>;
}) {
  const [chaves, setChaves] = useState<Record<string, string>>({});
  const [salvando, setSalvando] = useState<string | null>(null);
  const [erroPix, setErroPix] = useState<string | null>(null);
  const [pixAberto, setPixAberto] = useState<{
    oficina: string;
    valor: number;
    chave: string;
    codigo: string;
  } | null>(null);
  const [avisoCopia, setAvisoCopia] = useState<string | null>(null);

  if (grupos.length === 0) {
    return <p className="vazio">Nenhuma OC com entrega confirmada para pagamento.</p>;
  }
  const linhas = grupos.flatMap((grupo) => grupo.linhas);
  const pecas = grupos.reduce((soma, grupo) => soma + grupo.pecas, 0);

  function chaveEditada(oficina: string): string {
    return chaves[oficina] ?? chavePixDaOficina(oficinasPix, oficina);
  }

  async function copiarEAbrirBanco(codigo: string) {
    setAvisoCopia(null);
    try {
      await navigator.clipboard?.writeText(codigo);
      setAvisoCopia('Código Pix copiado.');
    } catch {
      setAvisoCopia('Copie o código abaixo e cole no aplicativo do banco.');
    }
    if (typeof navigator.share === 'function') {
      try {
        await navigator.share({ title: 'Pagar via Pix', text: codigo });
      } catch {
        /* usuário cancelou o compartilhamento */
      }
    }
  }

  return (
    <div className="liberacao-andamento liberacao-pagamentos">
      <div className="kpi-grid liberacao-kpis-pagamentos" aria-label="Indicadores de pagamento das oficinas">
        <div className="kpi" aria-label="Total pago às oficinas">
          <span className="kpi__label">Total pago às oficinas</span>
          <strong className="kpi__valor">{formatarMoedaBr(indicadores.totalPago)}</strong>
        </div>
        <div className="kpi" aria-label="Total pendente">
          <span className="kpi__label">Total pendente</span>
          <strong className="kpi__valor">{formatarMoedaBr(indicadores.totalPendente)}</strong>
        </div>
        <div className="kpi" aria-label="Total parcialmente pago">
          <span className="kpi__label">Total parcialmente pago</span>
          <strong className="kpi__valor">{formatarMoedaBr(indicadores.totalParcial)}</strong>
        </div>
        <div className="kpi" aria-label="Saldo total em aberto">
          <span className="kpi__label">Saldo total em aberto</span>
          <strong className="kpi__valor">{formatarMoedaBr(indicadores.saldoAberto)}</strong>
        </div>
      </div>
      <div className="liberacao-andamento__tabela">
        <table className="tabela" aria-label="Pagamentos de oficinas">
          <thead>
            <tr>
              <th>OC</th>
              <th>Oficina</th>
              <th>Costureiro</th>
              <th>Cliente</th>
              <th>Modelo / referência</th>
              <th>Quantidade enviada</th>
              <th>Valor por peça</th>
              <th>Valor total</th>
              <th>Valor pago</th>
              <th>Saldo restante</th>
              <th>Status</th>
              <th>Data do pagamento</th>
            </tr>
          </thead>
          <tbody>
            {linhas.map((item) => (
              <tr key={item.chave} aria-label={`Pagamento ${item.codigo}`}>
                <td>{item.codigo}</td>
                <td>{item.oficina}</td>
                <td>{item.costureiro}</td>
                <td>{item.cliente}</td>
                <td>{modeloReferenciaPagamento(item)}</td>
                <td>{item.pecas}</td>
                <td>{formatarMoedaBr(item.valorPeca)}</td>
                <td>{formatarMoedaBr(item.total)}</td>
                <td>{formatarMoedaBr(item.valorPago)}</td>
                <td>{formatarMoedaBr(item.saldo)}</td>
                <td>
                  <span className={`pill pill--pag-${item.status}`}>{STATUS_PAGAMENTO_OFICINA_LABEL[item.status]}</span>
                </td>
                <td>{item.dataPagamento ? formatarDataTela(item.dataPagamento.slice(0, 10)) : '—'}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            {grupos.map((grupo) => (
              <tr key={grupo.oficina} aria-label={`Total ${grupo.oficina}`}>
                <th scope="row" colSpan={5}>
                  Total {grupo.oficina}
                </th>
                <td>{grupo.pecas}</td>
                <td />
                <td>{formatarMoedaBr(grupo.valor)}</td>
                <td>{formatarMoedaBr(grupo.valorPago)}</td>
                <td>{formatarMoedaBr(grupo.saldo)}</td>
                <td colSpan={2} />
              </tr>
            ))}
            <tr aria-label="Total consolidado">
              <th scope="row" colSpan={5}>
                Total consolidado
              </th>
              <td>{pecas}</td>
              <td />
              <td>{formatarMoedaBr(total)}</td>
              <td>{formatarMoedaBr(indicadores.totalPago + indicadores.totalParcial)}</td>
              <td>{formatarMoedaBr(indicadores.saldoAberto)}</td>
              <td colSpan={2} />
            </tr>
          </tfoot>
        </table>
      </div>
      <div className="liberacao-pix" aria-label="Pix das oficinas">
        {grupos.map((grupo) => (
          <div key={grupo.oficina} className="liberacao-pix__oficina" aria-label={`Pix ${grupo.oficina}`}>
            <div className="liberacao-pix__cabecalho">
              <strong>{grupo.oficina}</strong>
              <span>{formatarMoedaBr(grupo.valor)}</span>
            </div>
            <label>
              Chave Pix
              <input
                aria-label={`Chave Pix ${grupo.oficina}`}
                value={chaveEditada(grupo.oficina)}
                onChange={(e) => setChaves((atual) => ({ ...atual, [grupo.oficina]: e.target.value }))}
                placeholder="CPF, CNPJ, e-mail, telefone ou chave aleatória"
              />
            </label>
            <div className="liberacao-pix__acoes">
              <button
                type="button"
                className="btn-secundario"
                disabled={salvando === grupo.oficina}
                aria-label={`Salvar chave Pix ${grupo.oficina}`}
                onClick={() => {
                  void (async () => {
                    try {
                      setSalvando(grupo.oficina);
                      setErroPix(null);
                      await onSalvarChavePix(grupo.oficina, chaveEditada(grupo.oficina).trim());
                    } catch (e) {
                      setErroPix((e as Error).message);
                    } finally {
                      setSalvando(null);
                    }
                  })();
                }}
              >
                {salvando === grupo.oficina ? 'Salvando…' : 'Salvar chave Pix'}
              </button>
              <button
                type="button"
                className="btn-primario"
                aria-label={`Pagar via Pix ${grupo.oficina}`}
                onClick={() => {
                  try {
                    setErroPix(null);
                    setAvisoCopia(null);
                    const chave = chaveEditada(grupo.oficina).trim();
                    const codigo = montarPixCopiaECola({
                      chave,
                      valor: grupo.valor,
                      nome: grupo.oficina,
                    });
                    setPixAberto({ oficina: grupo.oficina, valor: grupo.valor, chave, codigo });
                  } catch (e) {
                    setErroPix((e as Error).message);
                    setPixAberto(null);
                  }
                }}
              >
                PAGAR VIA PIX
              </button>
            </div>
          </div>
        ))}
        {erroPix ? <p className="erro">{erroPix}</p> : null}
      </div>
      {pixAberto ? (
        <div className="liberacao-modal" role="dialog" aria-modal="true" aria-labelledby="pagar-pix-titulo">
          <div className="liberacao-modal__caixa">
            <p id="pagar-pix-titulo">Pagar {pixAberto.oficina} via Pix</p>
            <p className="dica">Valor: {formatarMoedaBr(pixAberto.valor)}</p>
            <p className="dica">Chave: {pixAberto.chave}</p>
            <label>
              Código copia e cola
              <textarea aria-label="Código Pix copia e cola" readOnly rows={4} value={pixAberto.codigo} />
            </label>
            <p className="dica">
              O pagamento só é autorizado no aplicativo do banco. Esta tela não marca a oficina como paga.
            </p>
            {avisoCopia ? <p className="ok">{avisoCopia}</p> : null}
            <div className="liberacao-modal__acoes">
              <button type="button" className="btn-secundario" onClick={() => setPixAberto(null)}>
                Fechar
              </button>
              <button
                type="button"
                className="btn-secundario"
                onClick={() => void copiarEAbrirBanco(pixAberto.codigo)}
              >
                Copiar código
              </button>
              <button
                type="button"
                className="btn-primario"
                onClick={() => void copiarEAbrirBanco(pixAberto.codigo)}
              >
                Abrir banco
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function ListaFichasEntregues({
  itens,
  onEnviarExpedicao,
}: {
  itens: FichaAndamento[];
  onEnviarExpedicao: (item: FichaAndamento) => Promise<void>;
}) {
  const [pendente, setPendente] = useState<FichaAndamento | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [erroEnvio, setErroEnvio] = useState<string | null>(null);
  return (
    <div>
      <TabelaFichasOficina
        itens={itens}
        ariaTabela="Fichas entregues"
        ariaLinha={(item) => `OC entregue ${item.codigo}`}
        vazio="Nenhuma ficha entregue."
        mostrarFiltroProducao={false}
        renderAcao={(item) =>
          item.encaminhadoEm ? (
            <span className="pill pill--enviada-expedicao">Enviada para Expedição</span>
          ) : (
            <button
              type="button"
              className="btn-primario"
              aria-label={`Enviar ${item.codigo} para expedição`}
              onClick={() => {
                setErroEnvio(null);
                setPendente(item);
              }}
            >
              Enviar para expedição
            </button>
          )
        }
      />
      {pendente ? (
        <div className="liberacao-modal" role="dialog" aria-modal="true" aria-labelledby="confirma-expedicao-titulo">
          <div className="liberacao-modal__caixa">
            <p id="confirma-expedicao-titulo">Encaminhar esta OC para expedição?</p>
            <p className="dica">
              {pendente.codigo}
              {pendente.oficina ? ` · ${pendente.oficina}` : ''}
            </p>
            {erroEnvio ? <p className="erro">{erroEnvio}</p> : null}
            <div className="liberacao-modal__acoes">
              <button
                type="button"
                className="btn-secundario"
                disabled={salvando}
                onClick={() => {
                  if (salvando) return;
                  setPendente(null);
                  setErroEnvio(null);
                }}
              >
                Cancelar
              </button>
              <button
                type="button"
                className="btn-primario"
                disabled={salvando}
                onClick={() => {
                  void (async () => {
                    try {
                      setSalvando(true);
                      setErroEnvio(null);
                      await onEnviarExpedicao(pendente);
                      setPendente(null);
                    } catch (e) {
                      setErroEnvio((e as Error).message);
                    } finally {
                      setSalvando(false);
                    }
                  })();
                }}
              >
                {salvando ? 'Encaminhando…' : 'Confirmar'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function rotuloStatusExpedicao(status: StatusExpedicao | null, conferido = false): string {
  if (status === 'conferido' || (conferido && (!status || status === 'pronto_envio'))) return 'Conferido';
  if (!status) return 'Pronto para envio';
  return STATUS_EXPEDICAO_LABEL[status] ?? status;
}

function inteiroPecasTela(valor: string): number | null {
  const t = valor.trim().replace(/\s/g, '').replace(',', '.');
  if (!t) return null;
  const n = Number(t);
  if (!Number.isFinite(n) || n < 0 || Math.abs(n - Math.round(n)) > 1e-9) return null;
  return Math.round(n);
}

function textoDiferencaPecas(enviadas: number, conferidas: number): string {
  const diferenca = conferidas - enviadas;
  if (diferenca === 0) return '0 peças';
  const sinal = diferenca > 0 ? '+' : '';
  return `${sinal}${diferenca} peças`;
}

function ListaFichasExpedicao({
  itens,
  onSalvarConferencia,
}: {
  itens: FichaAndamento[];
  onSalvarConferencia: (item: FichaAndamento, pecasConferidas: number) => Promise<void>;
}) {
  const [valores, setValores] = useState<Record<number, string>>({});
  const [salvandoId, setSalvandoId] = useState<number | null>(null);
  const [sucessoId, setSucessoId] = useState<number | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    setValores((atual) => {
      const proximo = { ...atual };
      for (const item of itens) {
        if (proximo[item.ordemId] === undefined) {
          proximo[item.ordemId] = String(item.pecasConferidas ?? item.pecasEnviadas);
        }
      }
      return proximo;
    });
  }, [itens]);

  if (itens.length === 0) return <p className="vazio">Nenhuma OC em expedição.</p>;

  return (
    <div className="liberacao-lista" aria-label="OCs em expedição">
      {itens.map((item) => {
        const digitado = valores[item.ordemId] ?? String(item.pecasConferidas ?? item.pecasEnviadas);
        const conferidasDigitadas = inteiroPecasTela(digitado);
        const diferenca =
          conferidasDigitadas == null ? '' : textoDiferencaPecas(item.pecasEnviadas, conferidasDigitadas);
        const conferido = Boolean(item.conferidoEm) || item.statusExpedicao === 'conferido';
        const pillStatus =
          item.statusExpedicao === 'conferido' ||
          (conferido && (item.statusExpedicao === 'pronto_envio' || !item.statusExpedicao))
            ? 'conferido'
            : (item.statusExpedicao ?? 'pronto_envio');
        return (
          <article
            key={item.chave}
            className="liberacao-conferencia"
            aria-label={`OC em expedição ${item.codigo}`}
          >
            <div className="liberacao-conferencia__topo">
              <div>
                <span className="liberacao-lista__titulo">
                  {item.codigo} · {item.oficina || '—'}
                </span>
                <span className="liberacao-lista__meta">
                  {item.modelo}
                  {item.referencia ? ` · REF ${item.referencia}` : ''}
                  {item.costureiro ? ` · ${item.costureiro}` : ''}
                  {item.encaminhadoEm ? ` · encaminhada em ${formatarDataHoraTela(item.encaminhadoEm)}` : ''}
                </span>
              </div>
              <span className={`pill pill--${pillStatus}`}>
                {rotuloStatusExpedicao(item.statusExpedicao, conferido)}
              </span>
            </div>
            <div className="liberacao-conferencia__form">
              <div className="liberacao-conferencia__campo">
                <span className="liberacao-conferencia__rotulo">Quantidade enviada pela oficina</span>
                <strong aria-label="Quantidade enviada pela oficina">{item.pecasEnviadas} peças</strong>
              </div>
              <label className="liberacao-conferencia__campo">
                <span className="liberacao-conferencia__rotulo">Quantidade conferida</span>
                <input
                  type="number"
                  min={0}
                  step={1}
                  inputMode="numeric"
                  value={digitado}
                  aria-label={`Quantidade conferida da ${item.codigo}`}
                  disabled={salvandoId === item.ordemId}
                  onChange={(e) => {
                    setValores((atual) => ({ ...atual, [item.ordemId]: e.target.value }));
                    setErro(null);
                  }}
                />
              </label>
              <div className="liberacao-conferencia__campo">
                <span className="liberacao-conferencia__rotulo">Diferença</span>
                <strong
                  aria-label={`Diferença da ${item.codigo}`}
                  className={
                    conferidasDigitadas == null || conferidasDigitadas === item.pecasEnviadas
                      ? 'liberacao-conferencia__diferenca'
                      : conferidasDigitadas < item.pecasEnviadas
                        ? 'liberacao-conferencia__diferenca liberacao-conferencia__diferenca--negativa'
                        : 'liberacao-conferencia__diferenca liberacao-conferencia__diferenca--positiva'
                  }
                >
                  {diferenca || '—'}
                </strong>
              </div>
              <div className="liberacao-conferencia__acao">
                <button
                  type="button"
                  className="btn-primario"
                  disabled={salvandoId === item.ordemId}
                  aria-label={`Salvar conferência da ${item.codigo}`}
                  onClick={() => {
                    const pecas = inteiroPecasTela(digitado);
                    if (pecas == null) {
                      setErro('Informe a quantidade conferida em peças inteiras, igual ou maior que zero.');
                      return;
                    }
                    setSalvandoId(item.ordemId);
                    setErro(null);
                    void onSalvarConferencia(item, pecas)
                      .then(() => setSucessoId(item.ordemId))
                      .catch((e) => setErro((e as Error).message))
                      .finally(() => setSalvandoId(null));
                  }}
                >
                  {salvandoId === item.ordemId ? 'Salvando…' : 'Salvar conferência'}
                </button>
              </div>
            </div>
            {sucessoId === item.ordemId ? (
              <p className="ok" role="status" aria-live="polite">
                Conferência salva com sucesso!
              </p>
            ) : null}
            {item.conferidoEm ? (
              <p className="liberacao-conferencia__auditoria">
                Conferida por {item.conferidoPorNome || 'responsável'} em {formatarDataHoraTela(item.conferidoEm)}
              </p>
            ) : null}
          </article>
        );
      })}
      {erro ? <p className="erro">{erro}</p> : null}
    </div>
  );
}

function ListaOrdensIndicador({
  itens,
  vazio,
  destacarData = false,
}: {
  itens: OrdemProducao[];
  vazio: string;
  destacarData?: boolean;
}) {
  if (itens.length === 0) return <p className="vazio">{vazio}</p>;
  return (
    <div className="liberacao-lista">
      {itens.map((ordem) => {
        const etapa = etapaLinhaProducao(ordem.status, ordem.ordem_corte?.status_processo ?? null);
        return (
          <div key={ordem.id} className="liberacao-lista__item liberacao-lista__item--estatico">
            <span className="liberacao-lista__titulo">
              {ordem.ordem_corte?.codigo || ordem.codigo || `OP ${ordem.id}`} · {ordem.cliente || '—'}
            </span>
            <span className="liberacao-lista__meta">
              {ordem.produto || '—'}
              {ordem.referencia ? ` · REF ${ordem.referencia}` : ''}
              {` · ${ordem.quantidade} peças`}
              {etapa ? ` · ${ETAPA_LINHA_LABEL[etapa]}` : ` · ${STATUS_OP_LABEL[ordem.status] ?? ordem.status}`}
              {destacarData ? ` · previsão ${formatarDataTela(dataIso(ordem.data_prevista))}` : ''}
            </span>
          </div>
        );
      })}
    </div>
  );
}

function FichaLiberacaoResumo({ ficha, onAbrir }: { ficha: FichaLiberacao; onAbrir: () => void }) {
  const pecas = ficha.grade.reduce((soma, celula) => soma + celula.quantidade, 0);
  const oficina = ficha.liberacao?.oficina.trim() || ficha.oficinas?.find((item) => item.oficina.trim())?.oficina.trim();
  const total = pecas * (Number(ficha.liberacao?.valor_peca) || 0);
  const pagamento = ficha.liberacao ? pagamentoDaFicha(ficha, total) : null;
  return (
    <button type="button" className="liberacao-lista__item" aria-label={`Abrir ficha ${ficha.codigo}`} onClick={onAbrir}>
      <span className="liberacao-lista__titulo">
        {ficha.codigo} · {ficha.cliente || '—'}
      </span>
      <span className="liberacao-lista__meta">
        {ficha.modelo || ficha.produto || '—'}
        {ficha.referencia ? ` · REF ${ficha.referencia}` : ''}
        {` · ${pecas} peças`}
        {oficina ? ` · ${oficina}` : ''}
        {pagamento
          ? ` · ${STATUS_PAGAMENTO_OFICINA_LABEL[pagamento.status]} · pago ${formatarMoedaBr(pagamento.valor_pago)} · saldo ${formatarMoedaBr(pagamento.saldo)}`
          : ''}
      </span>
    </button>
  );
}

function FichaLiberacaoCard({
  ficha,
  form,
  oficinasOpcoes,
  salvando,
  cadastrando,
  liberada = false,
  onFechar,
  onChange,
  onCadastrarOficina,
  onConfirmar,
  aviamentos,
  statusAviamentos,
  onAviamentoChange,
  onAdicionarAviamento,
  onRemoverAviamento,
}: {
  ficha: FichaLiberacao;
  form: FormularioFicha;
  oficinasOpcoes: string[];
  salvando: boolean;
  cadastrando: boolean;
  liberada?: boolean;
  onFechar: () => void;
  onChange: (campo: keyof FormularioFicha, valor: string) => void;
  onCadastrarOficina: () => void;
  onConfirmar: () => void;
  aviamentos: LinhaAviamento[];
  statusAviamentos?: 'salvando' | 'salvo' | 'erro';
  onAviamentoChange: (indice: number, campo: keyof LinhaAviamento, valor: string) => void;
  onAdicionarAviamento: () => void;
  onRemoverAviamento: (indice: number) => void;
}) {
  const tamanhos = useMemo(() => tamanhosDaFicha(ficha), [ficha]);
  const cores = useMemo(() => {
    if (ficha.linhas?.length) return ficha.linhas.map((linha) => linha.cor).filter(Boolean);
    return [...new Set(ficha.grade.map((celula) => celula.cor).filter(Boolean))];
  }, [ficha]);
  const totaisTamanho = tamanhos.map((tamanho) =>
    cores.reduce((soma, cor) => soma + quantidadeCelula(ficha, cor, tamanho), 0),
  );
  const totalGeral = ficha.grade.reduce((soma, celula) => soma + celula.quantidade, 0);
  const listaCostureiros = ficha.costureiros ?? [];
  const listaOficinas = [...oficinasOpcoes, ...(ficha.oficinas_opcoes ?? [])].filter(
    (nome, idx, arr) => arr.findIndex((item) => item.toLocaleLowerCase('pt-BR') === nome.toLocaleLowerCase('pt-BR')) === idx,
  );

  return (
    <article className="card liberacao-ficha" aria-label={`Ficha ${ficha.codigo}`}>
      <header className="liberacao-ficha__cabecalho">
        <div>
          <h3>
            {ficha.codigo} · {ficha.cliente || '—'}
          </h3>
          <p className="dica">
            {ficha.ordem_codigo ?? `OP ${ficha.ordem_id}`}
            {ficha.referencia ? ` · REF ${ficha.referencia}` : ''}
          </p>
        </div>
        <button type="button" className="btn-secundario" onClick={onFechar}>
          Voltar à lista
        </button>
      </header>

      <dl className="ficha-setor__dados">
        <div>
          <dt>Cliente</dt>
          <dd>{ficha.cliente || '—'}</dd>
        </div>
        <div>
          <dt>Modelo</dt>
          <dd>{ficha.modelo || ficha.produto || '—'}</dd>
        </div>
        <div>
          <dt>Referência</dt>
          <dd>{ficha.referencia || '—'}</dd>
        </div>
        <div>
          <dt>Cores</dt>
          <dd>{coresDaFicha(ficha)}</dd>
        </div>
        <div>
          <dt>Quantidade total</dt>
          <dd>{totalGeral}</dd>
        </div>
        <div>
          <dt>Data de liberação para oficina</dt>
          <dd>{formatarDataTela(form.data)}</dd>
        </div>
        <div>
          <dt>Data de retirada</dt>
          <dd>{formatarDataTela(form.data_retirada)}</dd>
        </div>
        <div>
          <dt>Oficina</dt>
          <dd>{form.oficina.trim() || '—'}</dd>
        </div>
        <div>
          <dt>Costureiro</dt>
          <dd>{form.costureiro.trim() || '—'}</dd>
        </div>
        <div>
          <dt>Valor por peça</dt>
          <dd>{form.valor.trim() ? `R$ ${form.valor.trim()}` : '—'}</dd>
        </div>
      </dl>

      <div className="liberacao-ficha__grade">
        <table className="tabela" aria-label={`Grade ${ficha.codigo}`}>
          <thead>
            <tr>
              <th>Cor</th>
              {tamanhos.map((tamanho) => (
                <th key={tamanho}>{tamanho}</th>
              ))}
              <th>Total</th>
            </tr>
          </thead>
          <tbody>
            {cores.map((cor) => {
              const qtds = tamanhos.map((tamanho) => quantidadeCelula(ficha, cor, tamanho));
              const total = qtds.reduce((soma, n) => soma + n, 0);
              const detalhes = ficha.linhas?.find((linha) => linha.cor === cor)?.detalhes;
              return (
                <tr key={cor}>
                  <td>
                    {cor}
                    {detalhes ? <span className="dica"> · {detalhes}</span> : null}
                  </td>
                  {qtds.map((n, i) => (
                    <td key={tamanhos[i]}>{n || '—'}</td>
                  ))}
                  <td>{total}</td>
                </tr>
              );
            })}
            <tr>
              <th>Total</th>
              {totaisTamanho.map((n, i) => (
                <th key={tamanhos[i]}>{n || '—'}</th>
              ))}
              <th>{totalGeral}</th>
            </tr>
          </tbody>
        </table>
      </div>

      <dl className="ficha-setor__dados">
        <div>
          <dt>Informações da ficha original</dt>
          <dd>{ficha.informacoes_oficina || ficha.observacoes || '—'}</dd>
        </div>
        <div>
          <dt>Costureiros (ficha)</dt>
          <dd>{ficha.informacoes_costureiros || '—'}</dd>
        </div>
        <div>
          <dt>Acabamento</dt>
          <dd>{ficha.informacoes_acabamento || '—'}</dd>
        </div>
        <div>
          <dt>Composição / tecido</dt>
          <dd>
            {ficha.composicao || '—'}
            {ficha.tecido_nome ? ` · ${ficha.tecido_nome}` : ''}
          </dd>
        </div>
      </dl>

      <section className="liberacao-ficha__aviamentos" aria-label={`Aviamentos ${ficha.codigo}`}>
        <h4>AVIAMENTOS</h4>
        <p className="dica">
          Preencha os aviamentos usados nesta ficha. Oficina, costureiro, preço e datas ficam no bloco abaixo.
        </p>
        <table className="tabela">
          <thead>
            <tr>
              <th>Descrição do aviamento</th>
              <th>Quantidade</th>
              <th>Unidade</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {aviamentos.map((linha, indice) => {
              const unidades = UNIDADES_AVIAMENTO.includes(linha.unidade)
                ? UNIDADES_AVIAMENTO
                : [...UNIDADES_AVIAMENTO, linha.unidade];
              return (
                <tr key={`${ficha.id}-avia-${indice}`}>
                  <td>
                    <input
                      aria-label={`Descrição do aviamento ${indice + 1} ${ficha.codigo}`}
                      value={linha.descricao}
                      onChange={(e) => onAviamentoChange(indice, 'descricao', e.target.value)}
                      placeholder="Ex.: Elástico 3 cm"
                    />
                  </td>
                  <td>
                    <input
                      aria-label={`Quantidade do aviamento ${indice + 1} ${ficha.codigo}`}
                      inputMode="decimal"
                      value={linha.quantidade}
                      onChange={(e) => onAviamentoChange(indice, 'quantidade', e.target.value)}
                      placeholder="0"
                    />
                  </td>
                  <td>
                    <select
                      aria-label={`Unidade do aviamento ${indice + 1} ${ficha.codigo}`}
                      value={linha.unidade}
                      onChange={(e) => onAviamentoChange(indice, 'unidade', e.target.value)}
                    >
                      {unidades.map((unidade) => (
                        <option key={unidade} value={unidade}>
                          {unidade}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td>
                    <button
                      type="button"
                      className="btn-remover-texto"
                      aria-label={`Remover aviamento ${indice + 1} ${ficha.codigo}`}
                      onClick={() => onRemoverAviamento(indice)}
                    >
                      Remover
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <div className="liberacao-ficha__aviamentos-acoes">
          <button
            type="button"
            className="btn-secundario"
            aria-label={`Adicionar aviamento ${ficha.codigo}`}
            onClick={onAdicionarAviamento}
          >
            Adicionar aviamento
          </button>
          {statusAviamentos === 'salvando' ? <p className="dica">Salvando aviamentos…</p> : null}
          {statusAviamentos === 'salvo' ? <p className="ok">Aviamentos gravados nesta ficha.</p> : null}
          {statusAviamentos === 'erro' ? <p className="erro">Não foi possível gravar os aviamentos.</p> : null}
        </div>
      </section>

      <form
        className="liberacao-ficha__acoes"
        onSubmit={(event) => {
          event.preventDefault();
          if (!liberada) onConfirmar();
        }}
      >
        <label>
          Data de liberação para oficina
          <input
            aria-label={`Data de liberação ${ficha.codigo}`}
            type="date"
            required
            readOnly={liberada}
            value={form.data}
            onChange={(e) => onChange('data', e.target.value)}
          />
        </label>
        <label>
          Data de retirada
          <input
            aria-label={`Data de retirada ${ficha.codigo}`}
            type="date"
            readOnly={liberada}
            value={form.data_retirada}
            onChange={(e) => onChange('data_retirada', e.target.value)}
          />
        </label>
        <label>
          Oficina
          <input
            aria-label={`Oficina ${ficha.codigo}`}
            list={`oficinas-${ficha.id}`}
            value={form.oficina}
            readOnly={liberada}
            onChange={(e) => onChange('oficina', e.target.value)}
            placeholder="Selecione ou cadastre a oficina"
          />
          <datalist id={`oficinas-${ficha.id}`}>
            {listaOficinas.map((nome) => (
              <option key={nome} value={nome} />
            ))}
          </datalist>
        </label>
        {liberada ? null : (
          <button type="button" className="btn-secundario" disabled={cadastrando || salvando} onClick={onCadastrarOficina}>
            {cadastrando ? 'Cadastrando…' : 'Cadastrar oficina'}
          </button>
        )}
        <label>
          Costureiro
          <input
            aria-label={`Costureiro ${ficha.codigo}`}
            list={`costureiros-${ficha.id}`}
            value={form.costureiro}
            readOnly={liberada}
            onChange={(e) => onChange('costureiro', e.target.value)}
            placeholder="Selecione ou informe o costureiro"
          />
          <datalist id={`costureiros-${ficha.id}`}>
            {listaCostureiros.map((nome) => (
              <option key={nome} value={nome} />
            ))}
          </datalist>
        </label>
        <label>
          Valor por peça (R$)
          <input
            aria-label={`Valor por peça ${ficha.codigo}`}
            inputMode="decimal"
            value={form.valor}
            readOnly={liberada}
            onChange={(e) => onChange('valor', e.target.value)}
            placeholder="0,00"
          />
        </label>
        {liberada ? (
          <p className="ok">Ficha liberada. Oficina, costureiro, valor e datas gravados na ficha.</p>
        ) : (
          <button type="submit" className="btn-primario" disabled={salvando}>
            {salvando ? 'Liberando…' : 'Confirmar liberação da ficha'}
          </button>
        )}
        <a className="btn-secundario" href={urlPdfLiberacaoFicha(ficha.ordem_id)}>
          Baixar ficha em PDF / Imprimir
        </a>
      </form>
    </article>
  );
}
