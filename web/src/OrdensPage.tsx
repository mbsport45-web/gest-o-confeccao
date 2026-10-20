import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  PRIORIDADE_OP_LABEL,
  PRIORIDADES_OP,
  STATUS_OP_LABEL,
  STATUS_VALIDOS,
  atualizarOrdem,
  atualizarStatus,
  criarCliente,
  criarCor,
  criarOrdem,
  criarProduto,
  listarClientes,
  listarCores,
  listarMateriasPrimas,
  listarOrdensPaginado,
  listarProdutos,
  listarTamanhos,
  obterFichaTecnica,
  obterOrdem,
  removerOrdem,
  temPermissao,
  type Cliente,
  type CorCadastro,
  type MateriaPrima,
  type OrdemProducao,
  type PermissoesSessao,
  type PrioridadeOp,
  type Produto,
  type Status,
  type AssinaturaEmpresa,
  type TamanhoCadastro,
} from './api';
import { AvisoLimite, podeCriarNoPlano } from './AvisoLimite';
import { CampoBuscaCadastro } from './CampoBuscaCadastro';
import { GradeOrdem, GradeResumo } from './GradeOrdem';
import {
  TAMANHOS_PADRAO,
  celulasDaGrade,
  gradeAoTrocarProduto,
  gradeDaOrdem,
  gradeVazia,
  mensagemGrade,
  totalGeral,
  type GradeValor,
} from './gradeOrdem';

type ModoPainel = 'criar' | 'editar' | 'detalhe' | null;

type ReqLinha = { materia_prima_id: string; quantidade: number };

const FORM_VAZIO = {
  clienteId: '',
  produtoId: '',
  varianteId: '',
  quantidade: 0,
  prioridade: 'normal' as PrioridadeOp,
  data_prevista: '',
  responsavel: '',
  observacoes: '',
  referencia: '',
  requisitos: [] as ReqLinha[],
};

const NOVO_CLIENTE_VAZIO = { nome: '', cpf_cnpj: '', telefone: '' };
const NOVO_PRODUTO_VAZIO = { nome: '', sku: '' };

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

function rotuloDoCliente(cliente: Cliente) {
  return cliente.cpf_cnpj ? `${cliente.nome} · ${cliente.cpf_cnpj}` : cliente.nome;
}

function rotuloDoProduto(produto: Produto) {
  return produto.sku ? `${produto.sku} — ${produto.nome}` : produto.nome;
}

function formatarData(valor: string | null): string {
  if (!valor) return '—';
  const d = valor.slice(0, 10);
  const [y, m, day] = d.split('-');
  if (!y || !m || !day) return valor;
  return `${day}/${m}/${y}`;
}

export function OrdensPage({
  sessao,
  onOpCriada,
}: {
  sessao: { assinatura: AssinaturaEmpresa; permissoes?: PermissoesSessao };
  onOpCriada?: (ordem: OrdemProducao) => void;
}) {
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
  const [materias, setMaterias] = useState<MateriaPrima[]>([]);
  const [catalogoCores, setCatalogoCores] = useState<CorCadastro[]>([]);
  const [catalogoTamanhos, setCatalogoTamanhos] = useState<TamanhoCadastro[]>([]);
  const [grade, setGrade] = useState<GradeValor>(gradeVazia());
  const [textoCliente, setTextoCliente] = useState('');
  const [textoProduto, setTextoProduto] = useState('');
  const [rotuloCliente, setRotuloCliente] = useState('');
  const [rotuloProduto, setRotuloProduto] = useState('');
  const [cadastroClienteAberto, setCadastroClienteAberto] = useState(false);
  const [cadastroProdutoAberto, setCadastroProdutoAberto] = useState(false);
  const [novoCliente, setNovoCliente] = useState(NOVO_CLIENTE_VAZIO);
  const [novoProduto, setNovoProduto] = useState(NOVO_PRODUTO_VAZIO);
  const [salvandoCadastro, setSalvandoCadastro] = useState(false);
  const produtoGradeRef = useRef<string | null>(null);
  const podeCadastrarCliente =
    temPermissao(sessao.permissoes, 'clientes', 'criar') &&
    podeCriarNoPlano(sessao.assinatura, 'clientes');
  const podeCadastrarProduto =
    temPermissao(sessao.permissoes, 'produtos', 'criar') &&
    podeCriarNoPlano(sessao.assinatura, 'produtos');

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
    listarMateriasPrimas({ por_pagina: 100, status: 'ativo' })
      .then((lista) => setMaterias(lista.data))
      .catch(() => undefined);
    listarTamanhos()
      .then(setCatalogoTamanhos)
      .catch(() => undefined);
    listarCores()
      .then(setCatalogoCores)
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    const t = setTimeout(() => {
      listarClientes({ q: textoCliente.trim(), por_pagina: 20, status: 'ativo' })
        .then((lista) => setClientes(lista.data))
        .catch(() => undefined);
    }, 300);
    return () => clearTimeout(t);
  }, [textoCliente]);

  useEffect(() => {
    const t = setTimeout(() => {
      listarProdutos({ q: textoProduto.trim(), por_pagina: 20, status: 'ativo' })
        .then((lista) => setProdutos(lista.data))
        .catch(() => undefined);
    }, 300);
    return () => clearTimeout(t);
  }, [textoProduto]);

  const tamanhosIniciais = useMemo(() => {
    const padrao = catalogoTamanhos
      .filter((tamanho) => (TAMANHOS_PADRAO as readonly string[]).includes(tamanho.nome))
      .map((tamanho) => tamanho.nome);
    return padrao.length ? padrao : [...TAMANHOS_PADRAO];
  }, [catalogoTamanhos]);

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
  const quantidadeCalculada = totalGeral(grade);
  const avisoGrade = mensagemGrade(grade, quantidadeCalculada);

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

  useEffect(() => {
    if (modo !== 'criar') return;
    if (produtoGradeRef.current === form.produtoId) return;
    produtoGradeRef.current = form.produtoId;
    if (!form.produtoId) return;
    const produto = produtos.find((item) => String(item.id) === form.produtoId);
    setGrade((atual) => gradeAoTrocarProduto(atual, produto?.cores ?? [], tamanhosIniciais));
  }, [modo, form.produtoId, produtos, tamanhosIniciais]);

  function abrirCriar() {
    if (!podeCriarNoPlano(sessao.assinatura, 'ordens_mes')) return;
    setForm(FORM_VAZIO);
    produtoGradeRef.current = null;
    setTextoCliente('');
    setTextoProduto('');
    setRotuloCliente('');
    setRotuloProduto('');
    setCadastroClienteAberto(false);
    setCadastroProdutoAberto(false);
    setNovoCliente(NOVO_CLIENTE_VAZIO);
    setNovoProduto(NOVO_PRODUTO_VAZIO);
    setGrade(gradeVazia(tamanhosIniciais));
    setEditandoId(null);
    setDetalhe(null);
    setModo('criar');
    setErro(null);
  }

  async function abrirDetalhe(id: number) {
    const ordem = await obterOrdem(id);
    setDetalhe(ordem);
    setEditandoId(null);
    setModo('detalhe');
  }

  async function abrirEditar(id: number) {
    const ordem = await obterOrdem(id);
    setForm({
      clienteId: ordem.cliente_id ? String(ordem.cliente_id) : '',
      produtoId: ordem.produto_id ? String(ordem.produto_id) : '',
      varianteId: ordem.variante_id ? String(ordem.variante_id) : '',
      quantidade: ordem.quantidade,
      prioridade: ordem.prioridade || 'normal',
      data_prevista: ordem.data_prevista ? ordem.data_prevista.slice(0, 10) : '',
      responsavel: ordem.responsavel ?? '',
      observacoes: ordem.observacoes ?? '',
      referencia: ordem.referencia ?? '',
      requisitos: (ordem.requisitos ?? []).map((r) => ({
        materia_prima_id: String(r.materia_prima_id),
        quantidade: r.quantidade_unitaria ?? r.quantidade ?? 1,
      })),
    });
    setGrade(gradeDaOrdem(ordem.grade, tamanhosIniciais));
    const produtoDaOrdem = produtos.find((item) => item.id === ordem.produto_id);
    setTextoCliente(ordem.cliente);
    setRotuloCliente(ordem.cliente);
    setTextoProduto(produtoDaOrdem ? rotuloDoProduto(produtoDaOrdem) : ordem.produto);
    setRotuloProduto(produtoDaOrdem ? rotuloDoProduto(produtoDaOrdem) : ordem.produto);
    setEditandoId(id);
    setDetalhe(null);
    setModo('editar');
  }

  function payloadDoForm() {
    const cliente = clientes.find((c) => String(c.id) === form.clienteId);
    const produto = produtos.find((p) => String(p.id) === form.produtoId);
    const variante = produto?.variantes.find((v) => String(v.id) === form.varianteId);
    const requisitos = form.requisitos
      .filter((r) => r.materia_prima_id)
      .map((r) => ({
        materia_prima_id: Number(r.materia_prima_id),
        quantidade: Number(r.quantidade),
      }));
    const celulas = celulasDaGrade(grade);
    return {
      cliente: cliente?.nome ?? '',
      produto: produto?.nome ?? '',
      tamanho: variante?.tamanho ?? (produto && produto.variantes.length === 0 ? 'U' : ''),
      quantidade: quantidadeCalculada,
      cliente_id: form.clienteId ? Number(form.clienteId) : undefined,
      produto_id: form.produtoId ? Number(form.produtoId) : undefined,
      variante_id: celulas.length ? undefined : form.varianteId ? Number(form.varianteId) : undefined,
      prioridade: form.prioridade,
      data_prevista: form.data_prevista || undefined,
      responsavel: form.responsavel,
      observacoes: form.observacoes,
      referencia: form.referencia.trim(),
      requisitos,
      grade: celulas,
    };
  }

  function aplicarCliente(cliente: Cliente) {
    setClientes((atual) => (atual.some((item) => item.id === cliente.id) ? atual : [cliente, ...atual]));
    setForm((atual) => ({ ...atual, clienteId: String(cliente.id) }));
    setRotuloCliente(rotuloDoCliente(cliente));
    setTextoCliente(rotuloDoCliente(cliente));
    setCadastroClienteAberto(false);
    setNovoCliente(NOVO_CLIENTE_VAZIO);
  }

  function aplicarProduto(produto: Produto) {
    setProdutos((atual) => (atual.some((item) => item.id === produto.id) ? atual : [produto, ...atual]));
    setForm((atual) => ({
      ...atual,
      produtoId: String(produto.id),
      varianteId: '',
      requisitos: [],
      referencia: produto.sku ?? '',
    }));
    setRotuloProduto(rotuloDoProduto(produto));
    setTextoProduto(rotuloDoProduto(produto));
    setCadastroProdutoAberto(false);
    setNovoProduto(NOVO_PRODUTO_VAZIO);
  }

  async function salvarNovoCliente() {
    if (!novoCliente.nome.trim()) {
      setErro('Informe o nome do cliente');
      return;
    }
    try {
      setSalvandoCadastro(true);
      const criado = await criarCliente({
        nome: novoCliente.nome.trim(),
        cpf_cnpj: novoCliente.cpf_cnpj.trim() || undefined,
        telefone: novoCliente.telefone.trim() || undefined,
      });
      aplicarCliente(criado);
      setErro(null);
    } catch (err) {
      setErro((err as Error).message);
    } finally {
      setSalvandoCadastro(false);
    }
  }

  async function salvarNovoProduto() {
    if (!novoProduto.nome.trim()) {
      setErro('Informe o nome do produto');
      return;
    }
    try {
      setSalvandoCadastro(true);
      const criado = await criarProduto({
        nome: novoProduto.nome.trim(),
        sku: novoProduto.sku.trim() || undefined,
      });
      aplicarProduto(criado);
      setErro(null);
    } catch (err) {
      setErro((err as Error).message);
    } finally {
      setSalvandoCadastro(false);
    }
  }

  async function cadastrarCorNaOrdem(dados: { nome: string; codigo?: string; hex?: string | null }) {
    const cor = await criarCor(dados);
    setCatalogoCores((atual) => {
      const restante = atual.filter(
        (item) => item.nome.toLocaleLowerCase('pt-BR') !== cor.nome.toLocaleLowerCase('pt-BR'),
      );
      return [...restante, cor].sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
    });
    return cor;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.clienteId) {
      setErro('Selecione um cliente cadastrado');
      return;
    }
    if (!form.produtoId) {
      setErro('Selecione um produto cadastrado');
      return;
    }
    if (avisoGrade) {
      setErro(avisoGrade);
      return;
    }
    try {
      setSalvando(true);
      const dados = payloadDoForm();
      if (editandoId) {
        await atualizarOrdem(editandoId, dados);
      } else {
        const criada = await criarOrdem({ ...dados, status: 'planejada' });
        setForm(FORM_VAZIO);
        setGrade(gradeVazia(tamanhosIniciais));
        setModo(null);
        setEditandoId(null);
        setErro(null);
        if (onOpCriada) {
          onOpCriada(criada);
          return;
        }
        await recarregar();
        listarCores().then(setCatalogoCores).catch(() => undefined);
        listarTamanhos().then(setCatalogoTamanhos).catch(() => undefined);
        return;
      }
      setForm(FORM_VAZIO);
      setGrade(gradeVazia(tamanhosIniciais));
      setModo(null);
      setEditandoId(null);
      setErro(null);
      await recarregar();
      listarCores().then(setCatalogoCores).catch(() => undefined);
      listarTamanhos().then(setCatalogoTamanhos).catch(() => undefined);
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
            placeholder="Buscar código, referência, cliente, produto…"
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
                  <td>{o.codigo ?? `OP-${o.id}`}</td>
                  <td>{o.cliente}</td>
                  <td>
                    {o.produto}
                    <div className="dica">
                      {o.referencia ? `${o.referencia} · ` : ''}
                      {o.tamanho}
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
        <section className="card card--grade">
          <div className="card__head">
            <h2>{modo === 'editar' ? 'Editar OP' : 'Nova ordem de produção'}</h2>
            <button type="button" className="btn-fechar" onClick={() => setModo(null)}>
              ×
            </button>
          </div>
          <form className="form" onSubmit={handleSubmit}>
            <CampoBuscaCadastro
              rotulo="Cliente"
              placeholder="Pesquisar por nome, CPF/CNPJ ou telefone"
              texto={textoCliente}
              selecionadoId={form.clienteId}
              selecionadoRotulo={rotuloCliente}
              opcoes={clientes.map((cliente) => ({
                id: cliente.id,
                rotulo: rotuloDoCliente(cliente),
              }))}
              onTexto={setTextoCliente}
              onSelecionar={(id) => {
                const cliente = clientes.find((item) => String(item.id) === id);
                if (cliente) aplicarCliente(cliente);
                else {
                  setForm((atual) => ({ ...atual, clienteId: '' }));
                  setRotuloCliente('');
                }
              }}
              textoNovo={podeCadastrarCliente ? 'Cadastrar novo cliente' : undefined}
              cadastroAberto={cadastroClienteAberto}
              onAbrirCadastro={
                podeCadastrarCliente
                  ? () => {
                      setNovoCliente({
                        nome: textoCliente.trim(),
                        cpf_cnpj: '',
                        telefone: '',
                      });
                      setCadastroClienteAberto(true);
                    }
                  : undefined
              }
              onFecharCadastro={() => setCadastroClienteAberto(false)}
            >
              <div className="form">
                <label>
                  Nome
                  <input
                    aria-label="Nome do novo cliente"
                    value={novoCliente.nome}
                    onChange={(e) => setNovoCliente({ ...novoCliente, nome: e.target.value })}
                  />
                </label>
                <div className="form__row">
                  <label>
                    CPF/CNPJ
                    <input
                      aria-label="CPF/CNPJ do novo cliente"
                      value={novoCliente.cpf_cnpj}
                      onChange={(e) => setNovoCliente({ ...novoCliente, cpf_cnpj: e.target.value })}
                    />
                  </label>
                  <label>
                    Telefone
                    <input
                      aria-label="Telefone do novo cliente"
                      value={novoCliente.telefone}
                      onChange={(e) => setNovoCliente({ ...novoCliente, telefone: e.target.value })}
                    />
                  </label>
                </div>
                <div className="form__row">
                  <button
                    type="button"
                    disabled={salvandoCadastro || !novoCliente.nome.trim()}
                    onClick={() => void salvarNovoCliente()}
                  >
                    {salvandoCadastro ? 'Salvando…' : 'Salvar cliente'}
                  </button>
                  <button
                    type="button"
                    className="btn-secundario"
                    onClick={() => {
                      setCadastroClienteAberto(false);
                      setNovoCliente(NOVO_CLIENTE_VAZIO);
                    }}
                  >
                    Cancelar
                  </button>
                </div>
              </div>
            </CampoBuscaCadastro>
            <CampoBuscaCadastro
              rotulo="Produto"
              placeholder="Pesquisar por nome ou SKU"
              texto={textoProduto}
              selecionadoId={form.produtoId}
              selecionadoRotulo={rotuloProduto}
              opcoes={produtos.map((produto) => ({
                id: produto.id,
                rotulo: rotuloDoProduto(produto),
              }))}
              onTexto={setTextoProduto}
              onSelecionar={(id) => {
                const produto = produtos.find((item) => String(item.id) === id);
                if (produto) aplicarProduto(produto);
                else {
                  setForm((atual) => ({ ...atual, produtoId: '', varianteId: '', requisitos: [] }));
                  setRotuloProduto('');
                }
              }}
              textoNovo={podeCadastrarProduto ? 'Cadastrar novo produto' : undefined}
              cadastroAberto={cadastroProdutoAberto}
              onAbrirCadastro={
                podeCadastrarProduto
                  ? () => {
                      setNovoProduto({ nome: textoProduto.trim(), sku: '' });
                      setCadastroProdutoAberto(true);
                    }
                  : undefined
              }
              onFecharCadastro={() => setCadastroProdutoAberto(false)}
            >
              <div className="form">
                <label>
                  Nome
                  <input
                    aria-label="Nome do novo produto"
                    value={novoProduto.nome}
                    onChange={(e) => setNovoProduto({ ...novoProduto, nome: e.target.value })}
                  />
                </label>
                <label>
                  SKU
                  <input
                    aria-label="SKU do novo produto"
                    value={novoProduto.sku}
                    onChange={(e) => setNovoProduto({ ...novoProduto, sku: e.target.value })}
                    placeholder="Usado como referência inicial da OP"
                  />
                </label>
                <div className="form__row">
                  <button
                    type="button"
                    disabled={salvandoCadastro || !novoProduto.nome.trim()}
                    onClick={() => void salvarNovoProduto()}
                  >
                    {salvandoCadastro ? 'Salvando…' : 'Salvar produto'}
                  </button>
                  <button
                    type="button"
                    className="btn-secundario"
                    onClick={() => {
                      setCadastroProdutoAberto(false);
                      setNovoProduto(NOVO_PRODUTO_VAZIO);
                    }}
                  >
                    Cancelar
                  </button>
                </div>
              </div>
            </CampoBuscaCadastro>
            <label>
              Referência
              <input
                aria-label="Referência"
                value={form.referencia}
                onChange={(e) => setForm({ ...form, referencia: e.target.value })}
                placeholder="SKU do produto ou referência da OP"
              />
            </label>
            {produtoSel && produtoSel.variantes.length > 0 && (
              <label>
                Variante
                <select
                  value={form.varianteId}
                  onChange={(e) =>
                    setForm({ ...form, varianteId: e.target.value, requisitos: [] })
                  }
                >
                  <option value="">Selecione (opcional com a grade)</option>
                  {produtoSel.variantes.map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.sku} — {v.cor} / {v.tamanho}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <GradeOrdem
              grade={grade}
              quantidadeOrdem={quantidadeCalculada}
              catalogoCores={catalogoCores}
              catalogoTamanhos={catalogoTamanhos}
              onChange={setGrade}
              onCadastrarCor={cadastrarCorNaOrdem}
            />
            <div className="form__row">
              <label>
                Quantidade total (soma da grade)
                <input
                  readOnly
                  aria-label="Quantidade total (soma da grade)"
                  type="number"
                  min={0}
                  step={1}
                  value={quantidadeCalculada}
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

            <h3 className="subtitulo">Requisitos de material (BOM)</h3>
            <p className="dica">Quantidade por peça. O total usa a quantidade da OP. O estoque é consultado ao avançar para corte.</p>
            {form.requisitos.map((linha, idx) => (
              <div className="form__row" key={idx}>
                <label>
                  Matéria-prima
                  <select
                    value={linha.materia_prima_id}
                    onChange={(e) => {
                      const requisitos = [...form.requisitos];
                      requisitos[idx] = { ...linha, materia_prima_id: e.target.value };
                      setForm({ ...form, requisitos });
                    }}
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
                <label>
                  Qtd. por peça
                  <input
                    type="number"
                    min={0.01}
                    step="0.01"
                    value={linha.quantidade}
                    onChange={(e) => {
                      const requisitos = [...form.requisitos];
                      requisitos[idx] = { ...linha, quantidade: Number(e.target.value) };
                      setForm({ ...form, requisitos });
                    }}
                  />
                </label>
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

            <button type="submit" disabled={salvando || Boolean(avisoGrade) || !form.clienteId || !form.produtoId}>
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
                {detalhe.produto} · {detalhe.tamanho}
              </dd>
            </div>
            <div>
              <dt>Referência</dt>
              <dd>{detalhe.referencia || '—'}</dd>
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
          <h3 className="subtitulo">Grade planejada</h3>
          <GradeResumo celulas={detalhe.grade ?? []} />
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
