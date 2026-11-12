import { useEffect, useMemo, useRef, useState } from 'react';
import {
  atualizarOrdemCorte,
  criarCliente,
  enviarOrdemCorteEnfesto,
  listarAviamentos,
  listarClientes,
  listarCores,
  listarHistoricoOrdemCorte,
  listarMateriasPrimas,
  listarSugestoesFichaCorte,
  listarTamanhos,
  obterOrdemCorte,
  obterRascunhoFichaCorte,
  publicarFichaNova,
  salvarRascunhoFichaCorte,
  urlImpressaoOrdemCorte,
  STATUS_PROCESSO_OC_LABEL,
  type Aviamento,
  type Cliente,
  type CorCadastro,
  type FichaOrdemCortePayload,
  type MateriaPrima,
  type OrdemCorte,
  type OrdemCorteAviamento,
  type StatusProcessoOc,
  type OrdemCorteHistorico,
  type OrdemCorteMaterial,
  type OrdemCorteOficina,
  type SugestaoFichaCorte,
  type TamanhoCadastro,
} from './api';
import { CampoBuscaCadastro } from './CampoBuscaCadastro';
import { DadosTecidoCadastro, type TecidoFichaCampos } from './DadosTecidoCadastro';
import { composicaoMaisCompleta, extrairDadosTecidoTexto, numeroDoTexto } from './consumoCorte';
import { chaveGrade } from './regrasGradeOrdem';

const TAMANHOS_FICHA = ['P', 'M', 'G', 'GG', 'XG'];
const LINHAS_AVIAMENTO_MIN = 8;
const LINHAS_OFICINA_MIN = 4;
const LINHAS_COR_MIN = 4;

type LinhaFicha = {
  cor: string;
  detalhes: string;
  quantidades: Record<string, number>;
};

type FichaEstado = {
  codigo: string;
  cliente: string;
  cliente_id: number | null;
  produto_id: number | null;
  modelo: string;
  composicao: string;
  referencia: string;
  informacoes_oficina: string;
  data_retirada: string;
  informacoes_costureiros: string;
  informacoes_acabamento: string;
  observacoes: string;
  materia_prima_id: number | null;
  tecido_nome: string;
  tecido_cor: string;
  tecido_largura_cm: number | null;
  tecido_largura_unidade: string;
  tecido_gramatura: number | null;
  tecido_unidade: string;
  tecido_numero_rolo: string;
  status_processo: StatusProcessoOc;
  tamanhos: string[];
  linhas: LinhaFicha[];
  aviamentos: OrdemCorteAviamento[];
  oficinas: OrdemCorteOficina[];
  materiais: OrdemCorteMaterial[];
};

function quantidadeCelula(corte: OrdemCorte, cor: string, tamanho: string): number {
  const alvo = chaveGrade(cor, tamanho);
  return corte.grade.find((celula) => chaveGrade(celula.cor, celula.tamanho) === alvo)?.quantidade ?? 0;
}

function completar<T>(lista: T[], minimo: number, vazio: () => T): T[] {
  if (lista.length >= minimo) return lista;
  return [...lista, ...Array.from({ length: minimo - lista.length }, vazio)];
}

function aviamentoVazio(): OrdemCorteAviamento {
  return { aviamento_id: null, descricao: '', quantidade: 0, unidade: 'UN', observacoes: '' };
}

function oficinaVazia(): OrdemCorteOficina {
  return { oficina: '', costureiro: '', observacoes: '' };
}

function estadoDaApi(corte: OrdemCorte): FichaEstado {
  const tamanhos = (corte.tamanhos?.length ? corte.tamanhos : TAMANHOS_FICHA).map((item) => item.trim()).filter(Boolean);
  const cores =
    corte.linhas?.length
      ? corte.linhas
      : [...new Set(corte.grade.map((celula) => celula.cor))].map((cor) => ({ cor, detalhes: '' }));
  const linhas = cores.map((linha) => ({
    cor: linha.cor,
    detalhes: linha.detalhes ?? '',
    quantidades: Object.fromEntries(tamanhos.map((tamanho) => [tamanho, quantidadeCelula(corte, linha.cor, tamanho)])),
  }));
  return {
    codigo: corte.codigo,
    cliente: corte.cliente ?? '',
    cliente_id: corte.cliente_id ?? null,
    produto_id: corte.produto_id ?? null,
    modelo: corte.modelo ?? '',
    composicao: corte.tecido_composicao || corte.composicao || '',
    referencia: corte.referencia ?? '',
    informacoes_oficina: corte.informacoes_oficina ?? '',
    data_retirada: (corte.data_retirada ?? '').slice(0, 10),
    informacoes_costureiros: corte.informacoes_costureiros ?? '',
    informacoes_acabamento: corte.informacoes_acabamento ?? '',
    observacoes: corte.observacoes ?? '',
    materia_prima_id: corte.materia_prima_id ?? null,
    tecido_nome: corte.tecido_nome ?? '',
    tecido_cor: corte.tecido_cor ?? '',
    tecido_largura_cm: corte.tecido_largura_cm ?? null,
    tecido_largura_unidade: corte.tecido_largura_unidade === 'm' ? 'm' : 'cm',
    tecido_gramatura: corte.tecido_gramatura ?? null,
    tecido_unidade: corte.tecido_unidade || 'KG',
    tecido_numero_rolo: corte.tecido_numero_rolo ?? '',
    status_processo: corte.status_processo ?? 'em_preenchimento',
    tamanhos,
    linhas: completar(linhas, LINHAS_COR_MIN, () => ({
      cor: '',
      detalhes: '',
      quantidades: Object.fromEntries(tamanhos.map((tamanho) => [tamanho, 0])),
    })),
    aviamentos: completar(
      (corte.aviamentos ?? []).map((item) => ({
        aviamento_id: item.aviamento_id,
        descricao: item.descricao,
        quantidade: item.quantidade,
        unidade: item.unidade,
        observacoes: item.observacoes ?? '',
      })),
      LINHAS_AVIAMENTO_MIN,
      aviamentoVazio,
    ),
    oficinas: completar(
      (corte.oficinas ?? []).map((item) => ({
        oficina: item.oficina,
        costureiro: item.costureiro,
        observacoes: item.observacoes ?? '',
      })),
      LINHAS_OFICINA_MIN,
      oficinaVazia,
    ),
    materiais: corte.materiais ?? [],
  };
}

function estadoVazio(): FichaEstado {
  const tamanhos = [...TAMANHOS_FICHA];
  return {
    codigo: '',
    cliente: '',
    cliente_id: null,
    produto_id: null,
    modelo: '',
    composicao: '',
    referencia: '',
    informacoes_oficina: '',
    data_retirada: '',
    informacoes_costureiros: '',
    informacoes_acabamento: '',
    observacoes: '',
    materia_prima_id: null,
    tecido_nome: '',
    tecido_cor: '',
    tecido_largura_cm: null,
    tecido_largura_unidade: 'cm',
    tecido_gramatura: null,
    tecido_unidade: 'KG',
    tecido_numero_rolo: '',
    status_processo: 'em_preenchimento',
    tamanhos,
    linhas: completar([], LINHAS_COR_MIN, () => ({
      cor: '',
      detalhes: '',
      quantidades: Object.fromEntries(tamanhos.map((tamanho) => [tamanho, 0])),
    })),
    aviamentos: completar([], LINHAS_AVIAMENTO_MIN, aviamentoVazio),
    oficinas: completar([], LINHAS_OFICINA_MIN, oficinaVazia),
    materiais: [],
  };
}

function payloadDaFicha(ficha: FichaEstado): FichaOrdemCortePayload {
  return {
    ...(ficha.codigo.trim() ? { codigo: ficha.codigo.trim() } : {}),
    cliente: ficha.cliente,
    cliente_id: ficha.cliente_id,
    produto_id: ficha.produto_id,
    modelo: ficha.modelo,
    composicao: ficha.composicao || ficha.tecido_nome,
    referencia: ficha.referencia,
    tecido_nome: ficha.tecido_nome,
    tecido_cor: ficha.tecido_cor,
    tecido_largura_cm: ficha.tecido_largura_cm,
    tecido_largura_unidade: ficha.tecido_largura_unidade,
    tecido_gramatura: ficha.tecido_gramatura,
    tecido_unidade: ficha.tecido_unidade,
    tecido_numero_rolo: ficha.tecido_numero_rolo,
    informacoes_oficina: ficha.informacoes_oficina,
    data_retirada: ficha.data_retirada || null,
    informacoes_costureiros: ficha.informacoes_costureiros,
    informacoes_acabamento: ficha.informacoes_acabamento,
    observacoes: ficha.observacoes || null,
    materia_prima_id: ficha.materia_prima_id,
    tamanhos: ficha.tamanhos,
    linhas: ficha.linhas
      .filter((linha) => linha.cor.trim())
      .map((linha) => ({ cor: linha.cor, detalhes: linha.detalhes })),
    grade: ficha.linhas
      .filter((linha) => linha.cor.trim())
      .flatMap((linha) =>
        ficha.tamanhos.map((tamanho) => ({
          cor: linha.cor,
          tamanho,
          quantidade: Number(linha.quantidades[tamanho] || 0),
        })),
      ),
    aviamentos: ficha.aviamentos
      .filter((item) => item.descricao.trim())
      .map((item) => ({
        aviamento_id: item.aviamento_id,
        descricao: item.descricao.trim(),
        quantidade: Number(item.quantidade || 0),
        unidade: item.unidade,
        observacoes: item.observacoes ?? '',
      })),
    oficinas: ficha.oficinas
      .filter((item) => item.oficina.trim() || item.costureiro.trim() || (item.observacoes ?? '').trim())
      .map((item) => ({
        oficina: item.oficina.trim(),
        costureiro: item.costureiro.trim(),
        observacoes: item.observacoes ?? '',
      })),
  } as FichaOrdemCortePayload;
}

function totalLinha(linha: LinhaFicha, tamanhos: string[]): number {
  return tamanhos.reduce((soma, tamanho) => soma + Number(linha.quantidades[tamanho] || 0), 0);
}

function aplicarTecidoCadastro(ficha: FichaEstado, tecido: MateriaPrima): FichaEstado {
  const extraido = extrairDadosTecidoTexto([tecido.descricao, tecido.observacoes].filter(Boolean).join(' '));
  const composicaoCadastro = composicaoMaisCompleta(tecido.composicao, extraido.composicao, tecido.descricao);
  const corCadastro = (tecido.cor ?? '').trim();
  let linhas = ficha.linhas;
  if (corCadastro) {
    const existe = linhas.some(
      (linha) => linha.cor.trim().toLocaleLowerCase('pt-BR') === corCadastro.toLocaleLowerCase('pt-BR'),
    );
    if (!existe) {
      const vazia = linhas.findIndex((linha) => !linha.cor.trim());
      if (vazia >= 0) {
        linhas = linhas.map((linha, idx) => (idx === vazia ? { ...linha, cor: corCadastro } : linha));
      }
    }
  }
  return {
    ...ficha,
    materia_prima_id: tecido.id,
    composicao: composicaoCadastro || tecido.nome,
    tecido_nome: tecido.nome,
    tecido_cor: corCadastro,
    tecido_largura_cm: tecido.largura_cm ?? extraido.larguraCm,
    tecido_largura_unidade: 'cm',
    tecido_gramatura: tecido.gramatura ?? extraido.gramatura,
    tecido_unidade: (tecido.unidade || extraido.unidade || 'KG').toUpperCase(),
    linhas,
  };
}

function aplicarSugestaoProduto(ficha: FichaEstado, sugestao: SugestaoFichaCorte): FichaEstado {
  return {
    ...ficha,
    produto_id: sugestao.produto_id,
    modelo: sugestao.modelo || ficha.modelo,
    referencia: sugestao.referencia || ficha.referencia,
  };
}

function motivoImpedeEnvioFicha(ficha: FichaEstado, total: number, nova: boolean): string | null {
  if (nova && !ficha.cliente.trim()) return 'Preencha o cliente antes de enviar para enfesto e corte';
  if (!ficha.modelo.trim()) return 'Preencha o modelo antes de enviar para enfesto e corte';
  if (!ficha.composicao.trim()) return 'Preencha a composição antes de enviar para enfesto e corte';
  if (total <= 0) return 'Preencha a grade antes de enviar para enfesto e corte';
  return null;
}

export function OrdemCorteFichaPage({
  ordemId = null,
  onVoltar,
  onPublicada,
}: {
  ordemId?: number | null;
  onVoltar: () => void;
  onPublicada?: () => void;
}) {
  const [persistidaId, setPersistidaId] = useState<number | null>(ordemId ?? null);
  const [ficha, setFicha] = useState<FichaEstado | null>(null);
  const [historico, setHistorico] = useState<OrdemCorteHistorico[]>([]);
  const [aviamentosCadastro, setAviamentosCadastro] = useState<Aviamento[]>([]);
  const [tecidosCadastro, setTecidosCadastro] = useState<MateriaPrima[]>([]);
  const [tecidoSelecionado, setTecidoSelecionado] = useState('');
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [sugestoes, setSugestoes] = useState<{ modelos: SugestaoFichaCorte[]; referencias: SugestaoFichaCorte[] }>({
    modelos: [],
    referencias: [],
  });
  const [cadastroCliente, setCadastroCliente] = useState(false);
  const [novoCliente, setNovoCliente] = useState({ nome: '', cpf_cnpj: '', telefone: '' });
  const [catalogoCores, setCatalogoCores] = useState<CorCadastro[]>([]);
  const [catalogoTamanhos, setCatalogoTamanhos] = useState<TamanhoCadastro[]>([]);
  const [novaCor, setNovaCor] = useState('');
  const [novoTamanho, setNovoTamanho] = useState('');
  const [status, setStatus] = useState<'carregando' | 'idle' | 'salvando' | 'salvo' | 'erro'>('carregando');
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const pularAutosave = useRef(true);
  const versao = useRef(0);

  useEffect(() => {
    setPersistidaId(ordemId ?? null);
  }, [ordemId]);

  useEffect(() => {
    let ativo = true;
    async function carregar() {
      try {
        const tecidosVazio = {
          data: [] as MateriaPrima[],
          pagina: 1,
          por_pagina: 200,
          total: 0,
          total_paginas: 1,
        };
        if (ordemId == null) {
          const [aviamentos, tecidos, cores, tamanhos, clientesLista, catalogo, rascunho] = await Promise.all([
            listarAviamentos({ por_pagina: 200 }),
            listarMateriasPrimas({ status: 'ativo', por_pagina: 200 }).catch(() => tecidosVazio),
            listarCores(),
            listarTamanhos(),
            listarClientes({ status: 'ativo', por_pagina: 50 }).catch(() => ({ data: [] as Cliente[] })),
            listarSugestoesFichaCorte().catch(() => ({ modelos: [], referencias: [] })),
            obterRascunhoFichaCorte().catch(() => ({ payload: null })),
          ]);
          if (!ativo) return;
          pularAutosave.current = true;
          const base = estadoVazio();
          const salvo = (rascunho.payload ?? null) as Partial<FichaEstado> | null;
          setFicha(salvo ? { ...base, ...salvo, status_processo: 'em_preenchimento' } : base);
          setHistorico([]);
          setAviamentosCadastro(aviamentos.data);
          setTecidosCadastro(
            tecidos.data.filter((item) => item.tipo === 'tecido' || item.tipo === 'forro'),
          );
          setTecidoSelecionado(salvo?.materia_prima_id ? String(salvo.materia_prima_id) : '');
          setClientes(clientesLista.data);
          setSugestoes(catalogo);
          setCatalogoCores(cores);
          setCatalogoTamanhos(tamanhos);
          setStatus('idle');
          setErro(null);
          return;
        }
        const [corte, hist, aviamentos, tecidos, cores, tamanhos, clientesLista, catalogo] = await Promise.all([
          obterOrdemCorte(ordemId),
          listarHistoricoOrdemCorte(ordemId),
          listarAviamentos({ por_pagina: 200 }),
          listarMateriasPrimas({ status: 'ativo', por_pagina: 200 }).catch(() => tecidosVazio),
          listarCores(),
          listarTamanhos(),
          listarClientes({ status: 'ativo', por_pagina: 50 }).catch(() => ({ data: [] as Cliente[] })),
          listarSugestoesFichaCorte().catch(() => ({ modelos: [], referencias: [] })),
        ]);
        if (!ativo) return;
        pularAutosave.current = true;
        setFicha(estadoDaApi(corte));
        setHistorico(hist);
        setAviamentosCadastro(aviamentos.data);
        setTecidosCadastro(
          tecidos.data.filter((item) => item.tipo === 'tecido' || item.tipo === 'forro'),
        );
        setTecidoSelecionado(corte.materia_prima_id ? String(corte.materia_prima_id) : '');
        setClientes(clientesLista.data);
        setSugestoes(catalogo);
        setCatalogoCores(cores);
        setCatalogoTamanhos(tamanhos);
        setStatus('idle');
        setErro(null);
      } catch (err) {
        if (!ativo) return;
        setErro((err as Error).message);
        setStatus('erro');
      }
    }
    void carregar();
    return () => {
      ativo = false;
    };
  }, [ordemId]);

  useEffect(() => {
    if (!ficha) return;
    const t = window.setTimeout(() => {
      listarClientes({ q: ficha.cliente.trim(), por_pagina: 20, status: 'ativo' })
        .then((lista) => setClientes(lista.data))
        .catch(() => undefined);
    }, 250);
    return () => window.clearTimeout(t);
  }, [ficha?.cliente]);

  useEffect(() => {
    if (!ficha) return;
    if (pularAutosave.current) {
      pularAutosave.current = false;
      return;
    }
    const atual = ++versao.current;
    const timer = window.setTimeout(() => {
      void (async () => {
        try {
          setStatus('salvando');
          if (persistidaId == null) {
            await salvarRascunhoFichaCorte(ficha);
            if (versao.current !== atual) return;
            setStatus('salvo');
            setErro(null);
            return;
          }
          const salva = await atualizarOrdemCorte(persistidaId, payloadDaFicha(ficha));
          if (versao.current !== atual) return;
          pularAutosave.current = true;
          setFicha((atualFicha) => {
            if (!atualFicha) return estadoDaApi(salva);
            return {
              ...atualFicha,
              codigo: salva.codigo,
              cliente: salva.cliente ?? atualFicha.cliente,
              cliente_id: salva.cliente_id ?? atualFicha.cliente_id,
              produto_id: salva.produto_id ?? atualFicha.produto_id,
              materia_prima_id: salva.materia_prima_id ?? atualFicha.materia_prima_id,
              status_processo: salva.status_processo ?? atualFicha.status_processo,
              materiais: salva.materiais ?? atualFicha.materiais,
            };
          });
          setHistorico(await listarHistoricoOrdemCorte(persistidaId));
          setStatus('salvo');
          setErro(null);
        } catch (err) {
          if (versao.current !== atual) return;
          setErro((err as Error).message);
          setStatus('erro');
        }
      })();
    }, 700);
    return () => window.clearTimeout(timer);
  }, [ficha, persistidaId]);

  async function enviarParaEnfesto() {
    if (!ficha || enviando) return;
    const total = ficha.linhas.reduce((soma, linha) => soma + totalLinha(linha, ficha.tamanhos), 0);
    const motivo = motivoImpedeEnvioFicha(ficha, total, persistidaId == null);
    if (motivo) {
      setErro(motivo);
      return;
    }
    setEnviando(true);
    setErro(null);
    try {
      let enviada: OrdemCorte;
      pularAutosave.current = true;
      if (persistidaId == null) {
        const publicada = await publicarFichaNova({
          cliente: ficha.cliente,
          cliente_id: ficha.cliente_id ?? undefined,
          ficha: payloadDaFicha(ficha),
        });
        enviada = publicada.corte;
        setPersistidaId(publicada.ordem.id);
      } else {
        enviada = await enviarOrdemCorteEnfesto(persistidaId);
      }
      setFicha(estadoDaApi(enviada));
      if (enviada.ordem_id) {
        setHistorico(await listarHistoricoOrdemCorte(enviada.ordem_id));
      }
      setStatus('salvo');
      onPublicada?.();
    } catch (err) {
      setErro((err as Error).message);
      setStatus('erro');
    } finally {
      setEnviando(false);
    }
  }

  const totaisTamanho = useMemo(() => {
    if (!ficha) return {};
    return Object.fromEntries(
      ficha.tamanhos.map((tamanho) => [
        tamanho,
        ficha.linhas.reduce((soma, linha) => soma + Number(linha.quantidades[tamanho] || 0), 0),
      ]),
    );
  }, [ficha]);
  const totalGeral = useMemo(
    () => (ficha ? ficha.linhas.reduce((soma, linha) => soma + totalLinha(linha, ficha.tamanhos), 0) : 0),
    [ficha],
  );

  if (!ficha) {
    return (
      <section className="card ficha-oc">
        <p className="dica">{status === 'carregando' ? 'Carregando ficha…' : erro ?? 'Ficha indisponível.'}</p>
        <button type="button" className="btn-secundario" onClick={onVoltar}>
          Voltar
        </button>
      </section>
    );
  }

  const fotoModelo =
    sugestoes.modelos.find((item) => item.produto_id === ficha.produto_id && item.imagem)?.imagem ||
    sugestoes.referencias.find((item) => item.produto_id === ficha.produto_id && item.imagem)?.imagem ||
    '';

  return (
    <section className="card ficha-oc">
      <div className="ficha-oc__toolbar ficha-oc__no-print">
        <div>
          <h2>
            {persistidaId == null
              ? 'Ordem de corte · Nova ficha'
              : `Ordem de corte · ${ficha.codigo}`}
          </h2>
          <p className="dica" aria-live="polite">
            <span className={`pill pill--oc-${ficha.status_processo}`}>
              {STATUS_PROCESSO_OC_LABEL[ficha.status_processo]}
            </span>{' '}
            {status === 'salvando'
              ? 'Salvando…'
              : status === 'salvo'
                ? 'Alterações salvas'
                : persistidaId == null
                  ? 'Preencha a ficha. A OP e a ordem de corte são gravadas ao enviar para enfesto e corte.'
                  : 'A ordem de corte é a ficha de produção. Alterações salvam neste registro.'}
          </p>
        </div>
        <div className="ficha-oc__acoes">
          {ficha.status_processo === 'em_preenchimento' ? (
            <button
              type="button"
              className="btn-primario"
              onClick={() => void enviarParaEnfesto()}
              disabled={enviando || status === 'carregando'}
            >
              {enviando ? 'Enviando…' : 'Enviar para enfesto e corte'}
            </button>
          ) : null}
          {persistidaId != null ? (
            <a
              className="btn-secundario"
              href={urlImpressaoOrdemCorte(persistidaId)}
              target="_blank"
              rel="noreferrer"
            >
              Imprimir / PDF
            </a>
          ) : null}
          <button type="button" className="btn-secundario" onClick={onVoltar}>
            {persistidaId == null ? 'Voltar à lista' : 'Voltar à OP'}
          </button>
        </div>
      </div>
      {erro ? <p className="dica dica--erro ficha-oc__no-print">{erro}</p> : null}

      {ficha.materiais.length > 0 ? (
        <div className="ficha-oc__materiais ficha-oc__no-print">
          <h3>Tecidos e materiais da OP</h3>
          <p className="dica">O saldo é consultivo. A baixa do tecido acontece só na conclusão do corte.</p>
          <table className="tabela tabela--compacta">
            <thead>
              <tr>
                <th>Material</th>
                <th>Necessário</th>
                <th>Estoque</th>
              </tr>
            </thead>
            <tbody>
              {ficha.materiais.map((item) => (
                <tr key={item.materia_prima_id}>
                  <td>
                    {item.codigo ? `${item.codigo} — ` : ''}
                    {item.nome}
                  </td>
                  <td>
                    {item.quantidade_total} {item.unidade}
                  </td>
                  <td>
                    <span className={item.suficiente ? 'pill pill--ativo' : 'pill pill--inativo'}>
                      {item.estoque_disponivel} {item.unidade}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      <div className="ficha-oc__folha" aria-label="Ficha de produção">
        <header className="ficha-papel__cab">
          <div className="ficha-papel__campo ficha-papel__campo--cliente">
            <CampoBuscaCadastro
              rotulo="Cliente"
              placeholder="Pesquisar cliente cadastrado"
              texto={ficha.cliente}
              selecionadoId={ficha.cliente_id ? String(ficha.cliente_id) : ''}
              selecionadoRotulo={ficha.cliente}
              opcoes={clientes.map((item) => ({
                id: item.id,
                rotulo: item.cpf_cnpj ? `${item.nome} · ${item.cpf_cnpj}` : item.nome,
                texto: item.nome,
              }))}
              textoNovo="Cadastrar novo cliente"
              cadastroAberto={cadastroCliente}
              onTexto={(valor) => setFicha({ ...ficha, cliente: valor, cliente_id: null })}
              onSelecionar={(id) => {
                const escolhido = clientes.find((item) => String(item.id) === id);
                setFicha({ ...ficha, cliente_id: id ? Number(id) : null, cliente: escolhido?.nome ?? ficha.cliente });
              }}
              onAbrirCadastro={() => {
                setNovoCliente({ nome: ficha.cliente, cpf_cnpj: '', telefone: '' });
                setCadastroCliente(true);
              }}
              onFecharCadastro={() => setCadastroCliente(false)}
            >
              <label>
                Nome / razão social
                <input
                  aria-label="Nome do novo cliente"
                  value={novoCliente.nome}
                  onChange={(e) => setNovoCliente({ ...novoCliente, nome: e.target.value })}
                />
              </label>
              <button
                type="button"
                className="btn-primario"
                onClick={() => {
                  void (async () => {
                    if (!novoCliente.nome.trim()) return;
                    const criado = await criarCliente({
                      nome: novoCliente.nome.trim(),
                      cpf_cnpj: novoCliente.cpf_cnpj.trim() || undefined,
                      telefone: novoCliente.telefone.trim() || undefined,
                    });
                    setClientes((lista) => [criado, ...lista.filter((item) => item.id !== criado.id)]);
                    setFicha({ ...ficha, cliente: criado.nome, cliente_id: criado.id });
                    setCadastroCliente(false);
                  })();
                }}
              >
                Salvar cliente
              </button>
            </CampoBuscaCadastro>
          </div>
          {fotoModelo ? (
            <div className="ficha-papel__campo ficha-papel__campo--foto">
              <span>Foto do modelo</span>
              <img src={fotoModelo} alt={ficha.modelo || 'Modelo'} />
            </div>
          ) : null}
          <div className="ficha-papel__campo ficha-papel__campo--modelo">
            <CampoBuscaCadastro
              rotulo="Modelo"
              placeholder="Pesquisar ou digitar modelo"
              texto={ficha.modelo}
              selecionadoId={ficha.produto_id ? String(ficha.produto_id) : ''}
              selecionadoRotulo={ficha.modelo}
              opcoes={sugestoes.modelos.map((item) => ({
                id: item.id,
                rotulo: item.rotulo,
                texto: item.modelo,
                imagem: item.imagem,
              }))}
              cadastroAberto={false}
              onTexto={(valor) => setFicha({ ...ficha, modelo: valor, produto_id: null })}
              onSelecionar={(id) => {
                const sugestao = sugestoes.modelos.find((item) => item.id === id);
                if (sugestao) setFicha(aplicarSugestaoProduto(ficha, sugestao));
              }}
              onAbrirCadastro={() => undefined}
              onFecharCadastro={() => undefined}
            />
          </div>
          <div className="ficha-papel__campo ficha-papel__campo--ref">
            <CampoBuscaCadastro
              rotulo="Referência"
              placeholder="Pesquisar ou digitar referência"
              texto={ficha.referencia}
              selecionadoId={ficha.produto_id ? `ref-${ficha.produto_id}` : ''}
              selecionadoRotulo={ficha.referencia}
              opcoes={sugestoes.referencias.map((item) => ({
                id: item.id,
                rotulo: item.rotulo,
                texto: item.referencia,
                imagem: item.imagem,
              }))}
              cadastroAberto={false}
              onTexto={(valor) => setFicha({ ...ficha, referencia: valor })}
              onSelecionar={(id) => {
                const sugestao = sugestoes.referencias.find((item) => item.id === id);
                if (sugestao) setFicha(aplicarSugestaoProduto(ficha, sugestao));
              }}
              onAbrirCadastro={() => undefined}
              onFecharCadastro={() => undefined}
            />
          </div>
          <label className="ficha-papel__campo ficha-papel__campo--comp">
            Composição
            <select
              className="ficha-oc__no-print"
              aria-label="Tecido cadastrado"
              value={tecidoSelecionado}
              onChange={(e) => {
                const id = e.target.value;
                setTecidoSelecionado(id);
                const tecido = tecidosCadastro.find((item) => String(item.id) === id);
                if (!tecido) return;
                setFicha(aplicarTecidoCadastro(ficha, tecido));
              }}
            >
              <option value="">Selecionar tecido cadastrado</option>
              {tecidosCadastro.map((tecido) => (
                <option key={tecido.id} value={tecido.id}>
                  {tecido.codigo ? `${tecido.codigo} — ` : ''}
                  {tecido.nome}
                </option>
              ))}
            </select>
            <input
              value={ficha.composicao}
              onChange={(e) => setFicha({ ...ficha, composicao: e.target.value })}
              aria-label="Composição"
            />
          </label>
        </header>
        <DadosTecidoCadastro
          className="ficha-oc__no-print"
          tecido={{
            nome: ficha.tecido_nome,
            cor: ficha.tecido_cor,
            largura_cm: ficha.tecido_largura_cm,
            largura_unidade: ficha.tecido_largura_unidade,
            gramatura: ficha.tecido_gramatura,
            composicao: ficha.composicao,
            unidade: ficha.tecido_unidade,
            numero_rolo: ficha.tecido_numero_rolo,
          }}
          onChange={(campo, valor) => {
            if (campo === 'composicao') {
              setFicha({ ...ficha, composicao: valor });
              return;
            }
            if (campo === 'largura_cm' || campo === 'gramatura') {
              setFicha({
                ...ficha,
                [campo === 'largura_cm' ? 'tecido_largura_cm' : 'tecido_gramatura']:
                  valor === '' ? null : numeroDoTexto(valor),
              });
              return;
            }
            if (campo === 'largura_unidade') {
              setFicha({ ...ficha, tecido_largura_unidade: valor === 'm' ? 'm' : 'cm' });
              return;
            }
            if (campo === 'numero_rolo') {
              setFicha({ ...ficha, tecido_numero_rolo: valor });
              return;
            }
            setFicha({ ...ficha, [`tecido_${campo}`]: valor } as FichaEstado);
          }}
        />

        <div className="ficha-papel__meio">
          <section className="ficha-papel__quadro ficha-papel__aviamentos" aria-label="Aviamentos">
            <h3>Aviamentos</h3>
            <div className="ficha-papel__tabela-wrap">
            <table className="ficha-papel__tabela">
              <thead>
                <tr>
                  <th className="ficha-oc__no-print">Cadastro</th>
                  <th>Descrição</th>
                  <th>Qtd</th>
                  <th>Un</th>
                  <th className="ficha-oc__no-print"></th>
                </tr>
              </thead>
              <tbody>
                {ficha.aviamentos.map((item, idx) => (
                  <tr key={`av-${idx}`}>
                    <td className="ficha-oc__no-print">
                      <select
                        aria-label={`Aviamento cadastrado ${idx + 1}`}
                        value={item.aviamento_id ?? ''}
                        onChange={(e) => {
                          const aviamentos = [...ficha.aviamentos];
                          const id = Number(e.target.value) || null;
                          const cadastro = aviamentosCadastro.find((av) => av.id === id);
                          aviamentos[idx] = {
                            ...item,
                            aviamento_id: id,
                            descricao: cadastro?.nome ?? item.descricao,
                            unidade: cadastro?.unidade ?? item.unidade,
                            quantidade:
                              cadastro?.consumo_por_peca != null ? cadastro.consumo_por_peca * totalGeral : item.quantidade,
                          };
                          setFicha({ ...ficha, aviamentos });
                        }}
                      >
                        <option value="">Livre</option>
                        {aviamentosCadastro.map((av) => (
                          <option key={av.id} value={av.id}>
                            {av.codigo ? `${av.codigo} — ` : ''}
                            {av.nome}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td>
                      <input
                        aria-label={`Descrição do aviamento ${idx + 1}`}
                        value={item.descricao}
                        onChange={(e) => {
                          const aviamentos = [...ficha.aviamentos];
                          aviamentos[idx] = { ...item, descricao: e.target.value };
                          setFicha({ ...ficha, aviamentos });
                        }}
                      />
                    </td>
                    <td>
                      <input
                        type="number"
                        min={0}
                        step="0.01"
                        aria-label={`Quantidade do aviamento ${idx + 1}`}
                        value={item.quantidade || ''}
                        onChange={(e) => {
                          const aviamentos = [...ficha.aviamentos];
                          aviamentos[idx] = { ...item, quantidade: Number(e.target.value) };
                          setFicha({ ...ficha, aviamentos });
                        }}
                      />
                    </td>
                    <td>
                      <input
                        aria-label={`Unidade do aviamento ${idx + 1}`}
                        value={item.unidade}
                        onChange={(e) => {
                          const aviamentos = [...ficha.aviamentos];
                          aviamentos[idx] = { ...item, unidade: e.target.value };
                          setFicha({ ...ficha, aviamentos });
                        }}
                      />
                    </td>
                    <td className="ficha-oc__no-print">
                      <button
                        type="button"
                        className="btn-remover-texto"
                        onClick={() => setFicha({ ...ficha, aviamentos: ficha.aviamentos.filter((_, i) => i !== idx) })}
                      >
                        ×
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            </div>
            <button
              type="button"
              className="btn-secundario ficha-oc__no-print"
              onClick={() => setFicha({ ...ficha, aviamentos: [...ficha.aviamentos, aviamentoVazio()] })}
            >
              Adicionar aviamento
            </button>
          </section>

          <aside className="ficha-papel__direita">
            <section className="ficha-papel__quadro" aria-label="Oficina - Costureiro">
              <h3>Oficina — Costureiro</h3>
              <div className="ficha-papel__tabela-wrap">
                <table className="ficha-papel__tabela">
                  <thead>
                    <tr>
                      <th>Oficina</th>
                      <th>Costureiro</th>
                      <th>Obs</th>
                      <th className="ficha-oc__no-print"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {ficha.oficinas.map((item, idx) => (
                      <tr key={`of-${idx}`}>
                        <td>
                          <input
                            aria-label={`Oficina ${idx + 1}`}
                            value={item.oficina}
                            onChange={(e) => {
                              const oficinas = [...ficha.oficinas];
                              oficinas[idx] = { ...item, oficina: e.target.value };
                              setFicha({ ...ficha, oficinas });
                            }}
                          />
                        </td>
                        <td>
                          <input
                            aria-label={`Costureiro ${idx + 1}`}
                            value={item.costureiro}
                            onChange={(e) => {
                              const oficinas = [...ficha.oficinas];
                              oficinas[idx] = { ...item, costureiro: e.target.value };
                              setFicha({ ...ficha, oficinas });
                            }}
                          />
                        </td>
                        <td>
                          <input
                            aria-label={`Observações da oficina ${idx + 1}`}
                            value={item.observacoes ?? ''}
                            onChange={(e) => {
                              const oficinas = [...ficha.oficinas];
                              oficinas[idx] = { ...item, observacoes: e.target.value };
                              setFicha({ ...ficha, oficinas });
                            }}
                          />
                        </td>
                        <td className="ficha-oc__no-print">
                          <button
                            type="button"
                            className="btn-remover-texto"
                            onClick={() => setFicha({ ...ficha, oficinas: ficha.oficinas.filter((_, i) => i !== idx) })}
                          >
                            ×
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <button
                type="button"
                className="btn-secundario ficha-oc__no-print"
                onClick={() => setFicha({ ...ficha, oficinas: [...ficha.oficinas, oficinaVazia()] })}
              >
                Adicionar oficina
              </button>
            </section>

            <label className="ficha-papel__quadro ficha-papel__bloco">
              Informações para oficina
              <textarea
                aria-label="Informações para oficina"
                value={ficha.informacoes_oficina}
                onChange={(e) => setFicha({ ...ficha, informacoes_oficina: e.target.value })}
              />
            </label>

            <div className="ficha-papel__oc-data">
              <label className="ficha-papel__quadro ficha-papel__campo">
                O.C.
                <input
                  aria-label="Número da O.C."
                  value={ficha.codigo}
                  readOnly
                  title="Número gerado automaticamente"
                />
              </label>
              <label className="ficha-papel__quadro ficha-papel__campo">
                Data de retirada
                <input
                  type="date"
                  aria-label="Data de retirada"
                  value={ficha.data_retirada}
                  onChange={(e) => setFicha({ ...ficha, data_retirada: e.target.value })}
                />
              </label>
            </div>

            <label className="ficha-papel__quadro ficha-papel__bloco">
              Informações dos costureiros
              <textarea
                aria-label="Informações dos costureiros"
                value={ficha.informacoes_costureiros}
                onChange={(e) => setFicha({ ...ficha, informacoes_costureiros: e.target.value })}
              />
            </label>
          </aside>
        </div>

        <section className="ficha-papel__quadro ficha-papel__grade" aria-label="Grade de produção">
          <div className="ficha-papel__grade-topo ficha-oc__no-print">
            <div className="ficha-oc__grade-acoes ficha-oc__no-print">
              <label>
                Adicionar cor
                <input
                  list="ficha-cores"
                  aria-label="Nova cor da grade"
                  value={novaCor}
                  onChange={(e) => setNovaCor(e.target.value)}
                />
              </label>
              <datalist id="ficha-cores">
                {catalogoCores.map((cor) => (
                  <option key={cor.id ?? cor.nome} value={cor.nome} />
                ))}
              </datalist>
              <button
                type="button"
                onClick={() => {
                  const nome = novaCor.trim();
                  if (!nome) return;
                  const livre = ficha.linhas.findIndex((linha) => !linha.cor.trim());
                  if (livre >= 0) {
                    const linhas = [...ficha.linhas];
                    linhas[livre] = {
                      ...linhas[livre],
                      cor: nome,
                      quantidades: Object.fromEntries(ficha.tamanhos.map((t) => [t, linhas[livre].quantidades[t] || 0])),
                    };
                    setFicha({ ...ficha, linhas });
                  } else if (
                    !ficha.linhas.some((linha) => linha.cor.toLocaleLowerCase('pt-BR') === nome.toLocaleLowerCase('pt-BR'))
                  ) {
                    setFicha({
                      ...ficha,
                      linhas: [
                        ...ficha.linhas,
                        { cor: nome, detalhes: '', quantidades: Object.fromEntries(ficha.tamanhos.map((t) => [t, 0])) },
                      ],
                    });
                  }
                  setNovaCor('');
                }}
              >
                Adicionar cor
              </button>
              <label>
                Adicionar tamanho
                <input
                  list="ficha-tamanhos"
                  aria-label="Novo tamanho da grade"
                  value={novoTamanho}
                  onChange={(e) => setNovoTamanho(e.target.value)}
                />
              </label>
              <datalist id="ficha-tamanhos">
                {catalogoTamanhos.map((tamanho) => (
                  <option key={tamanho.id} value={tamanho.nome} />
                ))}
              </datalist>
              <button
                type="button"
                onClick={() => {
                  const nome = novoTamanho.trim().toUpperCase();
                  if (!nome) return;
                  if (ficha.tamanhos.some((atual) => atual.toLocaleLowerCase('pt-BR') === nome.toLocaleLowerCase('pt-BR'))) {
                    return;
                  }
                  setFicha({
                    ...ficha,
                    tamanhos: [...ficha.tamanhos, nome],
                    linhas: ficha.linhas.map((linha) => ({
                      ...linha,
                      quantidades: { ...linha.quantidades, [nome]: 0 },
                    })),
                  });
                  setNovoTamanho('');
                }}
              >
                Adicionar tamanho
              </button>
            </div>
          </div>
          <div className="ficha-oc__grade-scroll">
            <table className="ficha-papel__tabela ficha-papel__tabela--grade">
              <thead>
                <tr>
                  <th>Cores</th>
                  {ficha.tamanhos.map((tamanho) => (
                    <th key={tamanho}>
                      {tamanho}
                      <button
                        type="button"
                        className="btn-remover-texto ficha-oc__no-print"
                        aria-label={`Remover tamanho ${tamanho}`}
                        onClick={() =>
                          setFicha({
                            ...ficha,
                            tamanhos: ficha.tamanhos.filter((item) => item !== tamanho),
                            linhas: ficha.linhas.map((linha) => {
                              const quantidades = { ...linha.quantidades };
                              delete quantidades[tamanho];
                              return { ...linha, quantidades };
                            }),
                          })
                        }
                      >
                        ×
                      </button>
                    </th>
                  ))}
                  <th>Detalhes</th>
                  <th>Total</th>
                  <th className="ficha-oc__no-print"></th>
                </tr>
              </thead>
              <tbody>
                {ficha.linhas.map((linha, idx) => (
                  <tr key={`cor-${idx}`}>
                    <td>
                      <input
                        aria-label={`Cor ${idx + 1}`}
                        list="ficha-cores"
                        value={linha.cor}
                        onChange={(e) => {
                          const linhas = [...ficha.linhas];
                          linhas[idx] = { ...linha, cor: e.target.value };
                          setFicha({ ...ficha, linhas });
                        }}
                      />
                    </td>
                    {ficha.tamanhos.map((tamanho) => (
                      <td key={tamanho}>
                        <input
                          type="number"
                          min={0}
                          aria-label={`Quantidade ${linha.cor || `linha ${idx + 1}`} ${tamanho}`}
                          value={linha.quantidades[tamanho] || ''}
                          onChange={(e) => {
                            const linhas = [...ficha.linhas];
                            linhas[idx] = {
                              ...linha,
                              quantidades: { ...linha.quantidades, [tamanho]: Number(e.target.value) },
                            };
                            setFicha({ ...ficha, linhas });
                          }}
                        />
                      </td>
                    ))}
                    <td>
                      <input
                        aria-label={`Detalhes ${linha.cor || `linha ${idx + 1}`}`}
                        value={linha.detalhes}
                        onChange={(e) => {
                          const linhas = [...ficha.linhas];
                          linhas[idx] = { ...linha, detalhes: e.target.value };
                          setFicha({ ...ficha, linhas });
                        }}
                      />
                    </td>
                    <td className="ficha-papel__num">{totalLinha(linha, ficha.tamanhos) || ''}</td>
                    <td className="ficha-oc__no-print">
                      <button
                        type="button"
                        className="btn-remover-texto"
                        onClick={() => setFicha({ ...ficha, linhas: ficha.linhas.filter((_, i) => i !== idx) })}
                      >
                        Remover
                      </button>
                    </td>
                  </tr>
                ))}
                <tr className="ficha-papel__total">
                  <th>Total</th>
                  {ficha.tamanhos.map((tamanho) => (
                    <th key={tamanho}>{totaisTamanho[tamanho] || ''}</th>
                  ))}
                  <th></th>
                  <th aria-label="Total geral da grade">{totalGeral}</th>
                  <th className="ficha-oc__no-print"></th>
                </tr>
              </tbody>
            </table>
          </div>
        </section>

        <label className="ficha-papel__quadro ficha-papel__acabamento">
          Informações acabamento
          <textarea
            aria-label="Informações de acabamento"
            value={ficha.informacoes_acabamento}
            onChange={(e) => setFicha({ ...ficha, informacoes_acabamento: e.target.value })}
          />
        </label>
        <label className="ficha-papel__quadro ficha-papel__bloco">
          Observações
          <textarea
            aria-label="Observações da ficha"
            value={ficha.observacoes}
            onChange={(e) => setFicha({ ...ficha, observacoes: e.target.value })}
          />
        </label>
      </div>

      <section className="ficha-oc__historico ficha-oc__no-print">
        <h3>Histórico de alterações</h3>
        {!historico.length ? (
          <p className="dica">Ainda sem alterações registradas.</p>
        ) : (
          <ul>
            {historico.map((item) => (
              <li key={item.id}>
                <strong>{item.acao}</strong> · {item.resumo} · {item.usuario_nome ?? 'sistema'} · {item.criado_em}
              </li>
            ))}
          </ul>
        )}
      </section>
    </section>
  );
}
