import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  PRIORIDADE_OP_LABEL,
  PRIORIDADES_OP,
  STATUS_OP_LABEL,
  STATUS_VALIDOS,
  atualizarOrdem,
  atualizarStatus,
  atualizarStatusProduto,
  criarOrdem,
  criarProduto,
  listarClientes,
  listarMateriasPrimas,
  listarOrdensPaginado,
  listarProdutosAtivos,
  obterFichaTecnica,
  obterOrdem,
  obterProduto,
  removerOrdem,
  salvarFichaTecnica,
  type Cliente,
  type MateriaPrima,
  type OrdemProducao,
  type PrioridadeOp,
  type Produto,
  type Status,
  type AssinaturaEmpresa,
} from './api';
import { AvisoLimite, podeCriarNoPlano } from './AvisoLimite';
import {
  GradeDistribuicao,
  SeletorBusca,
  TabelaDistribuicao,
  distribuicaoFechaOp,
  eixosDasVariantes,
  somaGrade,
} from './DistribuicaoCorte';
import { SeletorProduto, ordenarProdutos, produtoPeloNome } from './SeletorProduto';

type ModoPainel = 'criar' | 'editar' | 'detalhe' | null;

type ReqLinha = { materia_prima_id: string; quantidade: number };

const FORM_VAZIO = {
  clienteId: '',
  produtoId: '',
  referencia: '',
  valorCostura: '' as number | '',
  varianteId: '',
  quantidade: 1,
  prioridade: 'normal' as PrioridadeOp,
  data_prevista: '',
  responsavel: '',
  observacoes: '',
  requisitos: [] as ReqLinha[],
  grade: {} as Record<string, number>,
  gradeEditada: false,
  coresSelecionadas: [] as string[],
  tamanhosSelecionados: [] as string[],
};

const MODELO_VAZIO = {
  nome: '',
  referencia: '',
  valorCostura: '' as number | '',
  cores: '',
  tamanhos: '',
  materiais: [] as ReqLinha[],
};

function parseLista(texto: string): string[] {
  const unique: string[] = [];
  for (const raw of texto.split(/[,;]/)) {
    const item = raw.trim();
    if (!item) continue;
    if (!unique.some((atual) => atual.toLowerCase() === item.toLowerCase())) unique.push(item);
  }
  return unique;
}

function normCor(valor: string): string {
  return valor.trim().toLowerCase();
}

function eixosDoProduto(produto: Produto) {
  return eixosDasVariantes(produto.variantes, produto.cores, produto.tamanhos);
}

function coresDoProduto(produto: Produto): string[] {
  return eixosDoProduto(produto).cores;
}

function tamanhosDoProduto(produto: Produto): string[] {
  return eixosDoProduto(produto).tamanhos;
}

function corSelecionada(cores: string[], cor: string): boolean {
  return cores.some((item) => normCor(item) === normCor(cor));
}

function coresDaOrdem(ordem: OrdemProducao): string[] {
  const cores: string[] = [];
  for (const item of ordem.distribuicao ?? []) {
    if (item.quantidade <= 0) continue;
    if (!cores.some((cor) => normCor(cor) === normCor(item.cor))) cores.push(item.cor);
  }
  return cores;
}

const STATUS_NOVOS: Status[] = [
  'planejada',
  'corte',
  'costura',
  'acabamento',
  'qualidade',
  'embalagem',
  'concluida',
  'cancelada',
];

function formatarData(valor: string | null): string {
  if (!valor) return '—';
  const d = valor.slice(0, 10);
  const [y, m, day] = d.split('-');
  if (!y || !m || !day) return valor;
  return `${day}/${m}/${y}`;
}

export function OrdensPage({ sessao }: { sessao: { assinatura: AssinaturaEmpresa } }) {
  const [ordens, setOrdens] = useState<OrdemProducao[]>([]);
  const [pagina, setPagina] = useState(1);
  const [totalPaginas, setTotalPaginas] = useState(1);
  const [total, setTotal] = useState(0);
  const [q, setQ] = useState('');
  const [qDebounced, setQDebounced] = useState('');
  const [statusFiltro, setStatusFiltro] = useState('');
  const [prioridadeFiltro, setPrioridadeFiltro] = useState('');
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [modo, setModo] = useState<ModoPainel>(null);
  const [form, setForm] = useState(FORM_VAZIO);
  const [editandoId, setEditandoId] = useState<number | null>(null);
  const [detalhe, setDetalhe] = useState<OrdemProducao | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [produtos, setProdutos] = useState<Produto[]>([]);
  const [materiais, setMateriais] = useState<MateriaPrima[]>([]);
  const [novoModelo, setNovoModelo] = useState(false);
  const [modelo, setModelo] = useState(MODELO_VAZIO);
  const [aviso, setAviso] = useState<string | null>(null);
  const [reativarId, setReativarId] = useState<number | null>(null);
  const [codigoGerado, setCodigoGerado] = useState<string | null>(null);

  useEffect(() => {
    const t = setTimeout(() => {
      setQDebounced(q);
      setPagina(1);
    }, 300);
    return () => clearTimeout(t);
  }, [q]);

  useEffect(() => {
    setPagina(1);
  }, [statusFiltro, prioridadeFiltro]);

  useEffect(() => {
    listarClientes({ por_pagina: 100, status: 'ativo' })
      .then((lista) => setClientes(lista.data))
      .catch(() => undefined);
    listarProdutosAtivos()
      .then((lista) => setProdutos(ordenarProdutos(lista)))
      .catch(() => undefined);
    listarMateriasPrimas({ por_pagina: 100, status: 'ativo' })
      .then((lista) => setMateriais(lista.data))
      .catch(() => undefined);
  }, []);

  const recarregar = useCallback(async () => {
    try {
      setCarregando(true);
      const lista = await listarOrdensPaginado({
        q: qDebounced,
        status: statusFiltro,
        prioridade: prioridadeFiltro,
        pagina,
        por_pagina: 8,
      });
      setOrdens(lista.data);
      setTotal(lista.total);
      setTotalPaginas(lista.total_paginas);
      setErro(null);
    } catch (e) {
      setErro((e as Error).message);
    } finally {
      setCarregando(false);
    }
  }, [qDebounced, statusFiltro, prioridadeFiltro, pagina]);

  useEffect(() => {
    recarregar();
  }, [recarregar]);

  const produtoSel = useMemo(
    () => produtos.find((p) => String(p.id) === form.produtoId),
    [produtos, form.produtoId],
  );

  useEffect(() => {
    if (modo !== 'criar' || !form.produtoId) return;
    const produtoId = Number(form.produtoId);
    const varianteId = form.varianteId ? Number(form.varianteId) : undefined;
    obterFichaTecnica(produtoId, varianteId)
      .then((ficha) => {
        setForm((atual) => {
          if (String(atual.produtoId) !== String(produtoId)) return atual;
          if ((atual.varianteId || '') !== (varianteId ? String(varianteId) : '')) return atual;
          if (atual.requisitos.length) return atual;
          return {
            ...atual,
            requisitos: ficha.itens.map((i) => ({
              materia_prima_id: String(i.materia_prima_id),
              quantidade: i.quantidade,
            })),
          };
        });
      })
      .catch(() => undefined);
  }, [modo, form.produtoId, form.varianteId]);

  function abrirCriar() {
    if (!podeCriarNoPlano(sessao.assinatura, 'ordens_mes')) return;
    setForm(FORM_VAZIO);
    setModelo(MODELO_VAZIO);
    setNovoModelo(false);
    setAviso(null);
    setReativarId(null);
    setEditandoId(null);
    setDetalhe(null);
    setModo('criar');
    setErro(null);
    listarProdutosAtivos()
      .then((lista) => setProdutos(ordenarProdutos(lista)))
      .catch(() => undefined);
  }

  async function abrirDetalhe(id: number) {
    const ordem = await obterOrdem(id);
    setDetalhe(ordem);
    setEditandoId(null);
    setModo('detalhe');
  }

  async function abrirEditar(id: number) {
    const ordem = await obterOrdem(id);
    let produto = produtos.find((item) => item.id === ordem.produto_id);
    if (ordem.produto_id && !produto) {
      try {
        produto = await obterProduto(ordem.produto_id);
        incluirProduto(produto);
      } catch {
        produto = undefined;
      }
    }
    const grade = Object.fromEntries(
      (ordem.distribuicao ?? []).map((item) => [String(item.variante_id), item.quantidade]),
    ) as Record<string, number>;
    let coresSelecionadas: string[] = [];
    let tamanhosSelecionados: string[] = [];
    const itensComQuantidade = (ordem.distribuicao ?? []).filter((item) => item.quantidade > 0);
    if (itensComQuantidade.length) {
      const eixos = eixosDasVariantes(
        produto?.variantes ?? [],
        produto?.cores ?? [],
        produto?.tamanhos ?? [],
      );
      coresSelecionadas = eixos.cores.filter((cor) =>
        corSelecionada(
          itensComQuantidade.map((item) => item.cor),
          cor,
        ),
      );
      tamanhosSelecionados = eixos.tamanhos.filter((tamanho) =>
        corSelecionada(
          itensComQuantidade.map((item) => item.tamanho),
          tamanho,
        ),
      );
      if (!coresSelecionadas.length) {
        coresSelecionadas = [...new Set(itensComQuantidade.map((item) => item.cor))];
      }
      if (!tamanhosSelecionados.length) {
        tamanhosSelecionados = [...new Set(itensComQuantidade.map((item) => item.tamanho))];
      }
    } else if (produto && ordem.variante_id) {
      const variante = produto.variantes.find((item) => item.id === ordem.variante_id);
      if (variante) {
        coresSelecionadas = [variante.cor];
        tamanhosSelecionados = [variante.tamanho];
        grade[String(variante.id)] = ordem.quantidade;
      }
    }
    setForm({
      clienteId: ordem.cliente_id ? String(ordem.cliente_id) : '',
      produtoId: ordem.produto_id ? String(ordem.produto_id) : '',
      referencia: ordem.referencia ?? produto?.referencia ?? produto?.sku ?? '',
      valorCostura: ordem.valor_costura ?? produto?.valor_costura ?? '',
      varianteId: '',
      quantidade: ordem.quantidade,
      prioridade: ordem.prioridade || 'normal',
      data_prevista: ordem.data_prevista ? ordem.data_prevista.slice(0, 10) : '',
      responsavel: ordem.responsavel ?? '',
      observacoes: ordem.observacoes ?? '',
      requisitos: (ordem.requisitos ?? []).map((r) => ({
        materia_prima_id: String(r.materia_prima_id),
        quantidade: r.quantidade_unitaria ?? r.quantidade ?? 1,
      })),
      grade,
      gradeEditada: (ordem.distribuicao ?? []).length > 0,
      coresSelecionadas,
      tamanhosSelecionados,
    });
    setEditandoId(id);
    setDetalhe(null);
    setModo('editar');
  }

  function payloadDoForm() {
    const cliente = clientes.find((c) => String(c.id) === form.clienteId);
    const produto = produtos.find((p) => String(p.id) === form.produtoId);
    const requisitos = form.requisitos
      .filter((r) => r.materia_prima_id)
      .map((r) => ({
        materia_prima_id: Number(r.materia_prima_id),
        quantidade: Number(r.quantidade),
      }));
    const usaGrade = Boolean(produto && produto.variantes.length > 0);
    const variantesDaCor = usaGrade
      ? produto!.variantes.filter(
          (item) =>
            corSelecionada(form.coresSelecionadas, item.cor) &&
            corSelecionada(form.tamanhosSelecionados, item.tamanho),
        )
      : [];
    const distribuicao = usaGrade
      ? variantesDaCor.map((item) => ({
          variante_id: item.id,
          quantidade: form.grade[String(item.id)] ?? 0,
        }))
      : editandoId
        ? []
        : undefined;
    return {
      cliente: cliente?.nome ?? '',
      produto: produto?.nome ?? '',
      tamanho: produto && produto.variantes.length === 0 ? 'U' : undefined,
      quantidade: Number(form.quantidade),
      cliente_id: form.clienteId ? Number(form.clienteId) : undefined,
      produto_id: form.produtoId ? Number(form.produtoId) : undefined,
      prioridade: form.prioridade,
      data_prevista: form.data_prevista || undefined,
      responsavel: form.responsavel,
      observacoes: form.observacoes,
      requisitos,
      valor_costura: form.valorCostura === '' ? null : Number(form.valorCostura),
      referencia: form.referencia.trim() || null,
      distribuicao,
    };
  }

  function incluirProduto(produto: Produto) {
    setProdutos((atual) =>
      ordenarProdutos([produto, ...atual.filter((item) => item.id !== produto.id)]),
    );
  }

  function aplicarProduto(produtoId: string, produtoInformado?: Produto) {
    const produto = produtoInformado ?? produtos.find((item) => String(item.id) === produtoId);
    if (produto) incluirProduto(produto);
    setNovoModelo(false);
    setAviso(null);
    setReativarId(null);
    setForm({
      ...form,
      produtoId,
      varianteId: '',
      requisitos: [],
      grade: {},
      gradeEditada: false,
      coresSelecionadas: produto ? coresDoProduto(produto) : [],
      tamanhosSelecionados: produto ? tamanhosDoProduto(produto) : [],
      referencia: produto ? (produto.referencia ?? produto.sku ?? '') : '',
      valorCostura: produto?.valor_costura ?? '',
    });
  }

  async function usarProdutoExistente(id: number) {
    const existente = await obterProduto(id);
    if (existente.status === 'inativo') {
      setReativarId(existente.id);
      setErro(`${existente.nome} já está cadastrado e está inativo.`);
      return;
    }
    aplicarProduto(String(existente.id), existente);
    setAviso(`${existente.nome} já está cadastrado. O cadastro existente foi selecionado.`);
  }

  async function reativarModelo() {
    if (!reativarId) return;
    const ativo = await atualizarStatusProduto(reativarId, 'ativo');
    aplicarProduto(String(ativo.id), ativo);
    setAviso(`${ativo.nome} foi reativado e selecionado nesta OP.`);
  }

  async function cadastrarModelo() {
    const nome = modelo.nome.trim();
    if (!nome) {
      setErro('Informe o nome do produto ou modelo.');
      return;
    }
    const achado = produtoPeloNome(produtos, nome);
    if (achado) {
      aplicarProduto(String(achado.id), achado);
      setAviso(`${achado.nome} já está cadastrado. O cadastro existente foi selecionado.`);
      return;
    }
    try {
      setSalvando(true);
      setErro(null);
      const criado = await criarProduto({
        nome,
        referencia: modelo.referencia.trim() || undefined,
        valor_costura: modelo.valorCostura === '' ? null : Number(modelo.valorCostura),
        cores: parseLista(modelo.cores),
        tamanhos: parseLista(modelo.tamanhos),
      });
      const materiaisNovos = modelo.materiais.filter(
        (item) => item.materia_prima_id && Number(item.quantidade) > 0,
      );
      if (materiaisNovos.length) {
        await salvarFichaTecnica({
          produto_id: criado.id,
          itens: materiaisNovos.map((item) => ({
            materia_prima_id: Number(item.materia_prima_id),
            quantidade: Number(item.quantidade),
          })),
        });
      }
      aplicarProduto(String(criado.id), criado);
      setModelo(MODELO_VAZIO);
      setAviso(`${criado.nome} foi cadastrado e já pode ser usado nas próximas ordens.`);
    } catch (err) {
      const falha = err as Error & { produtoId?: number };
      if (falha.produtoId) {
        await usarProdutoExistente(falha.produtoId);
        return;
      }
      setErro(falha.message);
    } finally {
      setSalvando(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    try {
      setSalvando(true);
      if (produtoSel && produtoSel.variantes.length > 0) {
        if (!form.coresSelecionadas.length) {
          throw new Error('Selecione ao menos uma cor');
        }
        if (!form.tamanhosSelecionados.length) {
          throw new Error('Selecione ao menos um tamanho');
        }
        const soma = somaGrade(form.grade);
        if (soma !== Number(form.quantidade)) {
          throw new Error(
            `A soma da distribuição (${soma}) deve ser igual à quantidade da OP (${Number(form.quantidade)})`,
          );
        }
      }
      const dados = payloadDoForm();
      if (!dados.produto_id || !dados.produto) {
        throw new Error('Selecione um produto ou modelo cadastrado.');
      }
      if (editandoId) {
        await atualizarOrdem(editandoId, dados);
      } else {
        const criada = await criarOrdem({ ...dados, status: 'planejada' });
        setCodigoGerado(criada.codigo);
      }
      setForm(FORM_VAZIO);
      setModo(null);
      setEditandoId(null);
      setErro(null);
      await recarregar();
    } catch (err) {
      setErro((err as Error).message);
    } finally {
      setSalvando(false);
    }
  }

  async function handleStatus(id: number, status: Status) {
    try {
      await atualizarStatus(id, status);
      if (detalhe?.id === id) setDetalhe(await obterOrdem(id));
      await recarregar();
    } catch (err) {
      setErro((err as Error).message);
    }
  }

  async function handleRemover(id: number) {
    if (!window.confirm('Excluir esta ordem de produção?')) return;
    try {
      await removerOrdem(id);
      if (detalhe?.id === id || editandoId === id) {
        setDetalhe(null);
        setModo(null);
        setEditandoId(null);
      }
      await recarregar();
    } catch (err) {
      setErro((err as Error).message);
    }
  }

  const statusesSelect = (atual?: Status) => {
    const base = [...STATUS_NOVOS];
    if (atual && !base.includes(atual)) base.unshift(atual);
    return base;
  };

  function alternarEixo(eixo: 'cor' | 'tamanho', valor: string) {
    if (!produtoSel) return;
    const campo = eixo === 'cor' ? 'coresSelecionadas' : 'tamanhosSelecionados';
    const atual = form[campo];
    const marcada = corSelecionada(atual, valor);
    const proximos = marcada
      ? atual.filter((item) => normCor(item) !== normCor(valor))
      : [...atual, valor];
    const grade = { ...form.grade };
    if (marcada) {
      for (const variante of produtoSel.variantes) {
        const texto = eixo === 'cor' ? variante.cor : variante.tamanho;
        if (normCor(texto) === normCor(valor)) grade[String(variante.id)] = 0;
      }
    }
    setForm({
      ...form,
      [campo]: proximos,
      grade,
      varianteId: '',
    });
  }

  const variantesGrade = produtoSel
    ? produtoSel.variantes.filter(
        (item) =>
          corSelecionada(form.coresSelecionadas, item.cor) &&
          corSelecionada(form.tamanhosSelecionados, item.tamanho),
      )
    : [];
  const coresEscolhidas = produtoSel
    ? coresDoProduto(produtoSel).filter((cor) => corSelecionada(form.coresSelecionadas, cor))
    : [];
  const tamanhosEscolhidos = produtoSel
    ? tamanhosDoProduto(produtoSel).filter((tamanho) =>
        corSelecionada(form.tamanhosSelecionados, tamanho),
      )
    : [];
  const gradeIncompleta = Boolean(
    produtoSel &&
      produtoSel.variantes.length > 0 &&
      !distribuicaoFechaOp(
        Number(form.quantidade),
        somaGrade(form.grade),
        coresEscolhidas.length,
        tamanhosEscolhidos.length,
      ),
  );

  return (
    <main className="app__main app__main--ordens">
      <section className="card card--wide">
        <div className="card__head">
          <h2>Ordens de produção</h2>
          <div className="card__head-acoes">
            <span className="badge">
              {total} OP{total === 1 ? '' : 's'}
            </span>
            <button
              type="button"
              className="btn-secundario"
              onClick={abrirCriar}
              disabled={!podeCriarNoPlano(sessao.assinatura, 'ordens_mes')}
            >
              Nova OP
            </button>
          </div>
        </div>
        <AvisoLimite assinatura={sessao.assinatura} chave="ordens_mes" />

        <div className="filtros filtros--ordens">
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar código, cliente, produto…"
            aria-label="Buscar ordens"
          />
          <select
            value={statusFiltro}
            onChange={(e) => setStatusFiltro(e.target.value)}
            aria-label="Filtrar status"
          >
            <option value="">Todos os status</option>
            {STATUS_VALIDOS.map((s) => (
              <option key={s} value={s}>
                {STATUS_OP_LABEL[s]}
              </option>
            ))}
          </select>
          <select
            value={prioridadeFiltro}
            onChange={(e) => setPrioridadeFiltro(e.target.value)}
            aria-label="Filtrar prioridade"
          >
            <option value="">Todas as prioridades</option>
            {PRIORIDADES_OP.map((p) => (
              <option key={p} value={p}>
                {PRIORIDADE_OP_LABEL[p]}
              </option>
            ))}
          </select>
        </div>

        {erro && <p className="erro">{erro}</p>}
        {codigoGerado && <p className="dica">Ordem {codigoGerado} criada.</p>}

        {carregando ? (
          <p className="vazio">Carregando…</p>
        ) : ordens.length === 0 ? (
          <p className="vazio">Nenhuma ordem de produção. Crie a primeira ao lado.</p>
        ) : (
          <table className="tabela">
            <thead>
              <tr>
                <th>Código</th>
                <th>Cliente</th>
                <th>Produto</th>
                <th>Qtd.</th>
                <th>Prioridade</th>
                <th>Previsão</th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {ordens.map((o) => (
                <tr key={o.id}>
                  <td>{o.codigo ?? '—'}</td>
                  <td>{o.cliente}</td>
                  <td>
                    {o.produto}
                    <div className="dica">
                      {o.tamanho}
                      {o.variante_id ? '' : ''}
                    </div>
                  </td>
                  <td>{o.quantidade}</td>
                  <td>{PRIORIDADE_OP_LABEL[o.prioridade] ?? o.prioridade}</td>
                  <td>{formatarData(o.data_prevista)}</td>
                  <td>
                    <select
                      className={`status status--${o.status}`}
                      value={o.status}
                      aria-label={`Status da OP ${o.codigo ?? o.id}`}
                      onChange={(e) => handleStatus(o.id, e.target.value as Status)}
                    >
                      {statusesSelect(o.status).map((s) => (
                        <option key={s} value={s}>
                          {STATUS_OP_LABEL[s]}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="acoes">
                    <button type="button" onClick={() => abrirDetalhe(o.id)}>
                      Ver
                    </button>
                    <button type="button" onClick={() => abrirEditar(o.id)}>
                      Editar
                    </button>
                    <button
                      type="button"
                      className="btn-remover-texto"
                      onClick={() => handleRemover(o.id)}
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

      {modo === 'criar' || modo === 'editar' ? (
        <section className="card">
          <div className="card__head">
            <h2>{modo === 'editar' ? 'Editar OP' : 'Nova ordem de produção'}</h2>
            <button type="button" className="btn-fechar" onClick={() => setModo(null)}>
              ×
            </button>
          </div>
          <form className="form" onSubmit={handleSubmit}>
            <label>
              Cliente
              <select
                required
                value={form.clienteId}
                onChange={(e) => setForm({ ...form, clienteId: e.target.value })}
              >
                <option value="">Selecione</option>
                {clientes.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nome}
                  </option>
                ))}
              </select>
            </label>
            <SeletorProduto
              produtos={produtos}
              selecionadoId={form.produtoId}
              onSelecionar={(id) => aplicarProduto(id)}
              onNovo={() => {
                setNovoModelo(true);
                setErro(null);
                setAviso(null);
              }}
            />
            {aviso && <p className="dica">{aviso}</p>}
            {reativarId && (
              <button type="button" className="btn-secundario" onClick={() => reativarModelo()}>
                Reativar e usar nesta OP
              </button>
            )}
            {novoModelo && (
              <div className="novo-modelo">
                <h3 className="subtitulo">Novo produto/modelo</h3>
                <p className="dica">
                  O nome fica salvo para esta empresa e aparece nas próximas ordens. A referência é
                  outro dado, como 10234 para a Bermuda.
                </p>
                <label>
                  Nome
                  <input
                    aria-label="Nome do novo produto"
                    value={modelo.nome}
                    onChange={(e) => setModelo({ ...modelo, nome: e.target.value })}
                    placeholder="Ex.: Camiseta com trançador"
                  />
                </label>
                <div className="form__row">
                  <label>
                    Referência
                    <input
                      aria-label="Referência do novo produto"
                      value={modelo.referencia}
                      onChange={(e) => setModelo({ ...modelo, referencia: e.target.value })}
                      placeholder="Ex.: 10234"
                    />
                  </label>
                  <label>
                    Costura padrão (R$/peça)
                    <input
                      aria-label="Costura padrão do novo produto"
                      type="number"
                      min={0}
                      step="0.01"
                      value={modelo.valorCostura}
                      onChange={(e) =>
                        setModelo({
                          ...modelo,
                          valorCostura: e.target.value === '' ? '' : Number(e.target.value),
                        })
                      }
                    />
                  </label>
                </div>
                <label>
                  Cores
                  <input
                    aria-label="Cores do novo produto"
                    value={modelo.cores}
                    onChange={(e) => setModelo({ ...modelo, cores: e.target.value })}
                    placeholder="Preto, Branco"
                  />
                </label>
                <label>
                  Tamanhos
                  <input
                    aria-label="Tamanhos do novo produto"
                    value={modelo.tamanhos}
                    onChange={(e) => setModelo({ ...modelo, tamanhos: e.target.value })}
                    placeholder="P, M, G, GG"
                  />
                </label>
                {modelo.materiais.map((linha, indice) => (
                  <div className="form__row" key={`modelo-material-${indice}`}>
                    <label>
                      Material previsto
                      <select
                        aria-label={`Material do novo produto ${indice + 1}`}
                        value={linha.materia_prima_id}
                        onChange={(e) =>
                          setModelo({
                            ...modelo,
                            materiais: modelo.materiais.map((item, posicao) =>
                              posicao === indice
                                ? { ...item, materia_prima_id: e.target.value }
                                : item,
                            ),
                          })
                        }
                      >
                        <option value="">Selecione</option>
                        {materiais.map((materia) => (
                          <option key={materia.id} value={materia.id}>
                            {materia.nome}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label>
                      Qtd por peça
                      <input
                        aria-label={`Quantidade do material do novo produto ${indice + 1}`}
                        type="number"
                        min={0.001}
                        step="0.001"
                        value={linha.quantidade}
                        onChange={(e) =>
                          setModelo({
                            ...modelo,
                            materiais: modelo.materiais.map((item, posicao) =>
                              posicao === indice
                                ? { ...item, quantidade: Number(e.target.value) }
                                : item,
                            ),
                          })
                        }
                      />
                    </label>
                  </div>
                ))}
                <button
                  type="button"
                  className="btn-secundario"
                  onClick={() =>
                    setModelo({
                      ...modelo,
                      materiais: [...modelo.materiais, { materia_prima_id: '', quantidade: 1 }],
                    })
                  }
                >
                  Adicionar material ao modelo
                </button>
                <button type="button" disabled={salvando} onClick={() => cadastrarModelo()}>
                  {salvando ? 'Salvando…' : 'Salvar produto'}
                </button>
              </div>
            )}
            <label>
              Referência desta OP
              <input
                value={form.referencia}
                onChange={(e) => setForm({ ...form, referencia: e.target.value })}
                placeholder="Ex.: 10234"
              />
            </label>
            {produtoSel && (
              <p className="dica">
                {produtoSel.nome}. A referência, a costura, as cores, os tamanhos e os materiais do
                cadastro entram como sugestão e podem ser ajustados nesta OP.
                {produtoSel.valor_costura == null
                  ? ' Costura padrão ainda não informada.'
                  : ` Costura padrão ${produtoSel.valor_costura.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })} por peça.`}
              </p>
            )}
            <label>
              Valor da costura desta OP (R$/peça)
              <input
                type="number"
                min={0}
                step="0.01"
                value={form.valorCostura}
                onChange={(e) =>
                  setForm({
                    ...form,
                    valorCostura: e.target.value === '' ? '' : Number(e.target.value),
                  })
                }
                placeholder="Vem do cadastro do produto"
              />
            </label>
            {produtoSel && produtoSel.valor_costura != null && form.valorCostura !== produtoSel.valor_costura && (
              <p className="dica">
                O padrão desta referência continua {produtoSel.valor_costura.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })} por peça. O valor desta OP fica só nela.
              </p>
            )}
            <div className="form__row">
              <label>
                Quantidade total
                <input
                  required
                  type="number"
                  min={1}
                  step={1}
                  value={form.quantidade}
                  onChange={(e) => setForm({ ...form, quantidade: Number(e.target.value) })}
                />
              </label>
              <label>
                Prioridade
                <select
                  value={form.prioridade}
                  onChange={(e) =>
                    setForm({ ...form, prioridade: e.target.value as PrioridadeOp })
                  }
                >
                  {PRIORIDADES_OP.map((p) => (
                    <option key={p} value={p}>
                      {PRIORIDADE_OP_LABEL[p]}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <div className="form__row">
              <label>
                Data prevista
                <input
                  type="date"
                  value={form.data_prevista}
                  onChange={(e) => setForm({ ...form, data_prevista: e.target.value })}
                />
              </label>
              <label>
                Responsável
                <input
                  value={form.responsavel}
                  onChange={(e) => setForm({ ...form, responsavel: e.target.value })}
                  placeholder="Operador ou setor"
                />
              </label>
            </div>
            <label>
              Observações
              <textarea
                rows={2}
                value={form.observacoes}
                onChange={(e) => setForm({ ...form, observacoes: e.target.value })}
              />
            </label>

            {produtoSel && produtoSel.variantes.length > 0 && (
              <>
                <h3 className="subtitulo">Seleção de cores</h3>
                <SeletorBusca
                  rotulo="Cores"
                  opcoes={coresDoProduto(produtoSel)}
                  selecionados={form.coresSelecionadas}
                  onToggle={(cor) => alternarEixo('cor', cor)}
                  placeholder="Pesquisar cor cadastrada"
                />
                <h3 className="subtitulo">Seleção de tamanhos</h3>
                <SeletorBusca
                  rotulo="Tamanhos"
                  opcoes={tamanhosDoProduto(produtoSel)}
                  selecionados={form.tamanhosSelecionados}
                  onToggle={(tamanho) => alternarEixo('tamanho', tamanho)}
                  placeholder="Pesquisar tamanho cadastrado"
                />
                <h3 className="subtitulo">Distribuição cor × tamanho</h3>
                <p className="dica">
                  Os tamanhos aparecem na ordem P, M, G e GG. O total de cada cor é a soma dos
                  tamanhos dela. A soma de todas as cores precisa ser igual à quantidade total da OP.
                </p>
                {coresEscolhidas.length === 0 || tamanhosEscolhidos.length === 0 ? (
                  <p className="erro">Selecione ao menos uma cor e um tamanho.</p>
                ) : (
                  <GradeDistribuicao
                    variantes={variantesGrade}
                    cores={coresEscolhidas}
                    tamanhos={tamanhosEscolhidos}
                    valores={form.grade}
                    onChange={(varianteId, quantidade) => {
                      setForm({
                        ...form,
                        grade: { ...form.grade, [String(varianteId)]: quantidade },
                        gradeEditada: true,
                      });
                    }}
                  />
                )}
                {distribuicaoFechaOp(
                  Number(form.quantidade),
                  somaGrade(form.grade),
                  coresEscolhidas.length,
                  tamanhosEscolhidos.length,
                ) ? (
                  <p className="dica">Total geral: {Number(form.quantidade)} peças.</p>
                ) : (
                  <p className="erro">
                    A soma da distribuição ({somaGrade(form.grade)}) deve ser igual à quantidade da OP (
                    {Number(form.quantidade)}).
                  </p>
                )}
              </>
            )}
            {produtoSel && produtoSel.variantes.length === 0 && (
              <p className="dica">
                Este produto ainda não tem cores e tamanhos. A OP fica com a quantidade total informada.
              </p>
            )}

            <h3 className="subtitulo">Materiais e tecidos previstos</h3>
            <p className="dica">
              Quantidade por peça. A ficha técnica do produto entra nesta lista e pode ser ajustada
              só nesta OP. No enfesto, o cortador informa o consumo real e o estoque baixa na unidade
              do tecido.
            </p>
            {form.requisitos.map((linha, indice) => (
              <div className="form__row" key={`${linha.materia_prima_id}-${indice}`}>
                <label>
                  Material
                  <select
                    aria-label={`Material previsto ${indice + 1}`}
                    value={linha.materia_prima_id}
                    onChange={(e) => {
                      const requisitos = form.requisitos.map((item, posicao) =>
                        posicao === indice ? { ...item, materia_prima_id: e.target.value } : item,
                      );
                      setForm({ ...form, requisitos });
                    }}
                  >
                    <option value="">Selecione</option>
                    {[...materiais]
                      .sort(
                        (a, b) =>
                          Number(b.tipo === 'tecido') - Number(a.tipo === 'tecido') ||
                          a.nome.localeCompare(b.nome, 'pt-BR'),
                      )
                      .map((materia) => (
                        <option key={materia.id} value={materia.id}>
                          {materia.tipo === 'tecido' ? 'Tecido · ' : ''}
                          {materia.nome} · {materia.unidade}
                        </option>
                      ))}
                  </select>
                </label>
                <label>
                  Qtd por peça
                  <input
                    aria-label={`Quantidade do material ${indice + 1}`}
                    type="number"
                    min={0.001}
                    step="0.001"
                    value={linha.quantidade}
                    onChange={(e) => {
                      const requisitos = form.requisitos.map((item, posicao) =>
                        posicao === indice
                          ? { ...item, quantidade: Number(e.target.value) }
                          : item,
                      );
                      setForm({ ...form, requisitos });
                    }}
                  />
                </label>
                <button
                  type="button"
                  className="btn-remover-texto"
                  onClick={() =>
                    setForm({
                      ...form,
                      requisitos: form.requisitos.filter((_, posicao) => posicao !== indice),
                    })
                  }
                >
                  Remover
                </button>
              </div>
            ))}
            <button
              type="button"
              className="btn-secundario"
              onClick={() =>
                setForm({
                  ...form,
                  requisitos: [...form.requisitos, { materia_prima_id: '', quantidade: 1 }],
                })
              }
            >
              Adicionar material
            </button>

            <button
              type="submit"
              disabled={salvando || gradeIncompleta}
            >
              {salvando ? 'Salvando…' : modo === 'editar' ? 'Salvar alterações' : 'Criar OP'}
            </button>
          </form>
        </section>
      ) : detalhe ? (
        <section className="card">
          <div className="card__head">
            <h2>{detalhe.codigo ?? `OP ${detalhe.id}`}</h2>
            <button type="button" className="btn-fechar" onClick={() => setDetalhe(null)}>
              ×
            </button>
          </div>
          <dl className="detalhe">
            <div>
              <dt>Cliente</dt>
              <dd>{detalhe.cliente}</dd>
            </div>
            <div>
              <dt>Produto</dt>
              <dd>
                {detalhe.referencia ? `${detalhe.referencia} — ` : ''}
                {detalhe.produto}
                {detalhe.distribuicao?.length ? '' : ` · ${detalhe.tamanho}`}
              </dd>
            </div>
            {coresDaOrdem(detalhe).length > 0 && (
              <div>
                <dt>Cores</dt>
                <dd>{coresDaOrdem(detalhe).join(', ')}</dd>
              </div>
            )}
            <div>
              <dt>Costura desta OP</dt>
              <dd>
                {detalhe.valor_costura == null
                  ? '—'
                  : detalhe.valor_costura.toLocaleString('pt-BR', {
                      style: 'currency',
                      currency: 'BRL',
                    }) + ' / peça'}
              </dd>
            </div>
            <div>
              <dt>Quantidade</dt>
              <dd>{detalhe.quantidade}</dd>
            </div>
            <div>
              <dt>Prioridade</dt>
              <dd>{PRIORIDADE_OP_LABEL[detalhe.prioridade] ?? detalhe.prioridade}</dd>
            </div>
            <div>
              <dt>Previsão</dt>
              <dd>{formatarData(detalhe.data_prevista)}</dd>
            </div>
            <div>
              <dt>Responsável</dt>
              <dd>{detalhe.responsavel ?? '—'}</dd>
            </div>
            <div>
              <dt>Status</dt>
              <dd>{STATUS_OP_LABEL[detalhe.status]}</dd>
            </div>
            <div>
              <dt>Observações</dt>
              <dd>{detalhe.observacoes ?? '—'}</dd>
            </div>
          </dl>
          {detalhe.distribuicao && detalhe.distribuicao.length > 0 && (
            <>
              <h3 className="subtitulo">Distribuição de corte</h3>
              <TabelaDistribuicao
                itens={detalhe.distribuicao}
                coresPreferidas={
                  produtos.find((item) => item.id === detalhe.produto_id)?.cores ?? []
                }
                tamanhosPreferidos={
                  produtos.find((item) => item.id === detalhe.produto_id)?.tamanhos ?? []
                }
              />
            </>
          )}
          <label>
            Alterar status
            <select
              className={`status status--${detalhe.status}`}
              value={detalhe.status}
              onChange={(e) => handleStatus(detalhe.id, e.target.value as Status)}
            >
              {statusesSelect(detalhe.status).map((s) => (
                <option key={s} value={s}>
                  {STATUS_OP_LABEL[s]}
                </option>
              ))}
            </select>
          </label>
          <h3 className="subtitulo">Materiais da OP</h3>
          {!detalhe.requisitos?.length ? (
            <p className="dica">Sem BOM vinculado a este produto/variante.</p>
          ) : (
            <table className="tabela tabela--compacta">
              <thead>
                <tr>
                  <th>Material</th>
                  <th>Total</th>
                  <th>Estoque</th>
                </tr>
              </thead>
              <tbody>
                {detalhe.requisitos.map((r) => (
                  <tr key={r.id ?? r.materia_prima_id}>
                    <td>
                      {r.codigo ? `${r.codigo} — ` : ''}
                      {r.nome}
                    </td>
                    <td>
                      {r.quantidade_total} {r.unidade}
                    </td>
                    <td>
                      <span className={r.suficiente ? 'pill pill--ativo' : 'pill pill--inativo'}>
                        {r.estoque_disponivel} {r.unidade}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <div className="detalhe__acoes">
            <button type="button" onClick={() => abrirEditar(detalhe.id)}>
              Editar
            </button>
            <button
              type="button"
              className="btn-remover-texto"
              onClick={() => handleRemover(detalhe.id)}
            >
              Excluir
            </button>
          </div>
        </section>
      ) : (
        <section className="card">
          <h2>Detalhe da OP</h2>
          <p className="dica">Selecione uma ordem na lista ou clique em Nova OP.</p>
        </section>
      )}
    </main>
  );
}
