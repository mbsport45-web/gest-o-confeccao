import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  PRIORIDADE_OP_LABEL,
  PRIORIDADES_OP,
  STATUS_OP_LABEL,
  STATUS_VALIDOS,
  atualizarOrdem,
  atualizarStatus,
  criarCliente,
  criarOrdem,
  criarOrdemCorte,
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
  type AssinaturaEmpresa,
  type Cliente,
  type CorCadastro,
  type MateriaPrima,
  type OrdemProducao,
  type PrioridadeOp,
  type Produto,
  type Status,
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
  type GradeValor,
} from './gradeOrdem';

type ModoPainel = 'criar' | 'editar' | 'detalhe' | null;

type ReqLinha = { materia_prima_id: string; quantidade: number };

const FORM_VAZIO = {
  clienteId: '',
  produtoId: '',
  quantidade: 1,
  prioridade: 'normal' as PrioridadeOp,
  data_prevista: '',
  responsavel: '',
  observacoes: '',
  requisitos: [] as ReqLinha[],
};

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
  const [materias, setMaterias] = useState<MateriaPrima[]>([]);
  const [catalogoCores, setCatalogoCores] = useState<CorCadastro[]>([]);
  const [catalogoTamanhos, setCatalogoTamanhos] = useState<TamanhoCadastro[]>([]);
  const [grade, setGrade] = useState<GradeValor>(gradeVazia());
  const [criandoCorte, setCriandoCorte] = useState(false);
  const [textoCliente, setTextoCliente] = useState('');
  const [textoProduto, setTextoProduto] = useState('');
  const [rotuloCliente, setRotuloCliente] = useState('');
  const [rotuloProduto, setRotuloProduto] = useState('');
  const [nomeCliente, setNomeCliente] = useState('');
  const [nomeProduto, setNomeProduto] = useState('');
  const [referenciaProduto, setReferenciaProduto] = useState('');
  const [cadastroCliente, setCadastroCliente] = useState(false);
  const [cadastroProduto, setCadastroProduto] = useState(false);
  const [novoCliente, setNovoCliente] = useState({ nome: '', cpf_cnpj: '', telefone: '' });
  const [novoProduto, setNovoProduto] = useState({ nome: '', sku: '' });
  const [erroCliente, setErroCliente] = useState<string | null>(null);
  const [erroProduto, setErroProduto] = useState<string | null>(null);
  const [salvandoCliente, setSalvandoCliente] = useState(false);
  const [salvandoProduto, setSalvandoProduto] = useState(false);
  const produtoGradeRef = useRef<string | null>(null);

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

  useEffect(() => {
    listarMateriasPrimas({ por_pagina: 100, status: 'ativo' })
      .then((lista) => setMaterias(lista.data))
      .catch(() => undefined);
    listarCores()
      .then(setCatalogoCores)
      .catch(() => undefined);
    listarTamanhos()
      .then(setCatalogoTamanhos)
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

  const tamanhosIniciais = useMemo(() => {
    const padrao = catalogoTamanhos
      .filter((tamanho) => (TAMANHOS_PADRAO as readonly string[]).includes(tamanho.nome))
      .map((tamanho) => tamanho.nome);
    return padrao.length ? padrao : [...TAMANHOS_PADRAO];
  }, [catalogoTamanhos]);

  useEffect(() => {
    if (modo !== 'criar' || !form.produtoId) return;
    const produtoId = Number(form.produtoId);
    obterFichaTecnica(produtoId)
      .then((ficha) => {
        setForm((atual) => {
          if (String(atual.produtoId) !== String(produtoId)) return atual;
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
  }, [modo, form.produtoId]);

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
    setNomeCliente('');
    setNomeProduto('');
    setReferenciaProduto('');
    setCadastroCliente(false);
    setCadastroProduto(false);
    setNovoCliente({ nome: '', cpf_cnpj: '', telefone: '' });
    setNovoProduto({ nome: '', sku: '' });
    setErroCliente(null);
    setErroProduto(null);
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
      quantidade: ordem.quantidade,
      prioridade: ordem.prioridade || 'normal',
      data_prevista: ordem.data_prevista ? ordem.data_prevista.slice(0, 10) : '',
      responsavel: ordem.responsavel ?? '',
      observacoes: ordem.observacoes ?? '',
      requisitos: (ordem.requisitos ?? []).map((r) => ({
        materia_prima_id: String(r.materia_prima_id),
        quantidade: r.quantidade_unitaria ?? r.quantidade ?? 1,
      })),
    });
    setGrade(gradeDaOrdem(ordem.grade, tamanhosIniciais));
    const rotuloDaOrdem = ordem.referencia ? `${ordem.referencia} — ${ordem.produto}` : ordem.produto;
    setTextoCliente(ordem.cliente);
    setRotuloCliente(ordem.cliente);
    setNomeCliente(ordem.cliente);
    setTextoProduto(rotuloDaOrdem);
    setRotuloProduto(rotuloDaOrdem);
    setNomeProduto(ordem.produto);
    setReferenciaProduto(ordem.referencia ?? '');
    setCadastroCliente(false);
    setCadastroProduto(false);
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
    return {
      cliente: cliente?.nome || nomeCliente,
      produto: produto?.nome || nomeProduto,
      quantidade: Number(form.quantidade),
      cliente_id: form.clienteId ? Number(form.clienteId) : undefined,
      produto_id: form.produtoId ? Number(form.produtoId) : undefined,
      prioridade: form.prioridade,
      data_prevista: form.data_prevista || undefined,
      responsavel: form.responsavel,
      observacoes: form.observacoes,
      requisitos,
      grade: celulasDaGrade(grade),
    };
  }

  async function salvarClienteNovo() {
    if (!novoCliente.nome.trim()) {
      setErroCliente('Informe o nome ou a razão social');
      return;
    }
    try {
      setSalvandoCliente(true);
      const criado = await criarCliente({
        nome: novoCliente.nome.trim(),
        cpf_cnpj: novoCliente.cpf_cnpj.trim() || undefined,
        telefone: novoCliente.telefone.trim() || undefined,
      });
      setClientes((lista) => [criado, ...lista.filter((item) => item.id !== criado.id)]);
      setForm((atual) => ({ ...atual, clienteId: String(criado.id) }));
      setTextoCliente(criado.nome);
      setRotuloCliente(criado.nome);
      setNomeCliente(criado.nome);
      setNovoCliente({ nome: '', cpf_cnpj: '', telefone: '' });
      setCadastroCliente(false);
      setErroCliente(null);
    } catch (err) {
      setErroCliente((err as Error).message);
    } finally {
      setSalvandoCliente(false);
    }
  }

  async function salvarProdutoNovo() {
    if (!novoProduto.nome.trim()) {
      setErroProduto('Informe o nome do produto');
      return;
    }
    try {
      setSalvandoProduto(true);
      const criado = await criarProduto({
        nome: novoProduto.nome.trim(),
        sku: novoProduto.sku.trim() || undefined,
      });
      setProdutos((lista) => [criado, ...lista.filter((item) => item.id !== criado.id)]);
      setForm((atual) => ({ ...atual, produtoId: String(criado.id) }));
      const rotulo = criado.sku ? `${criado.sku} — ${criado.nome}` : criado.nome;
      setTextoProduto(rotulo);
      setRotuloProduto(rotulo);
      setNomeProduto(criado.nome);
      setReferenciaProduto(criado.sku ?? '');
      setNovoProduto({ nome: '', sku: '' });
      setCadastroProduto(false);
      setErroProduto(null);
    } catch (err) {
      setErroProduto((err as Error).message);
    } finally {
      setSalvandoProduto(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.clienteId) {
      setErro('Selecione ou cadastre o cliente');
      return;
    }
    if (!form.produtoId) {
      setErro('Selecione ou cadastre o produto');
      return;
    }
    const avisoGrade = mensagemGrade(grade, Number(form.quantidade));
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
        await criarOrdem({ ...dados, status: 'planejada' });
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

  async function handleCriarCorte() {
    if (!detalhe) return;
    try {
      setCriandoCorte(true);
      await criarOrdemCorte(detalhe.id);
      setDetalhe(await obterOrdem(detalhe.id));
      setErro(null);
    } catch (err) {
      setErro((err as Error).message);
    } finally {
      setCriandoCorte(false);
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
                rotulo: cliente.cpf_cnpj ? `${cliente.nome} · ${cliente.cpf_cnpj}` : cliente.nome,
              }))}
              textoNovo="Cadastrar novo cliente"
              cadastroAberto={cadastroCliente}
              onTexto={setTextoCliente}
              onSelecionar={(id) => {
                const cliente = clientes.find((item) => String(item.id) === id);
                setForm((atual) => ({ ...atual, clienteId: id }));
                if (cliente) {
                  const rotulo = cliente.cpf_cnpj ? `${cliente.nome} · ${cliente.cpf_cnpj}` : cliente.nome;
                  setRotuloCliente(rotulo);
                  setNomeCliente(cliente.nome);
                  setTextoCliente(rotulo);
                }
                if (!id) {
                  setRotuloCliente('');
                  setNomeCliente('');
                }
              }}
              onAbrirCadastro={() => {
                setCadastroCliente(true);
                setErroCliente(null);
              }}
              onFecharCadastro={() => setCadastroCliente(false)}
            >
              <label>
                Nome / razão social
                <input
                  value={novoCliente.nome}
                  aria-label="Nome do novo cliente"
                  onChange={(e) => setNovoCliente({ ...novoCliente, nome: e.target.value })}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') e.preventDefault();
                  }}
                />
              </label>
              <label>
                CPF / CNPJ
                <input
                  value={novoCliente.cpf_cnpj}
                  aria-label="CPF ou CNPJ do novo cliente"
                  placeholder="Somente números ou formatado"
                  onChange={(e) => setNovoCliente({ ...novoCliente, cpf_cnpj: e.target.value })}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') e.preventDefault();
                  }}
                />
              </label>
              <label>
                Telefone
                <input
                  value={novoCliente.telefone}
                  aria-label="Telefone do novo cliente"
                  onChange={(e) => setNovoCliente({ ...novoCliente, telefone: e.target.value })}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') e.preventDefault();
                  }}
                />
              </label>
              <div className="busca-cadastro__acoes">
                <button type="button" disabled={salvandoCliente} onClick={() => void salvarClienteNovo()}>
                  {salvandoCliente ? 'Salvando…' : 'Salvar cliente'}
                </button>
                <button type="button" className="btn-secundario" onClick={() => setCadastroCliente(false)}>
                  Cancelar
                </button>
              </div>
              {erroCliente && <p className="erro">{erroCliente}</p>}
            </CampoBuscaCadastro>
            <CampoBuscaCadastro
              rotulo="Produto"
              placeholder="Pesquisar por nome ou SKU"
              texto={textoProduto}
              selecionadoId={form.produtoId}
              selecionadoRotulo={rotuloProduto}
              opcoes={produtos.map((produto) => ({
                id: produto.id,
                rotulo: produto.sku ? `${produto.sku} — ${produto.nome}` : produto.nome,
              }))}
              textoNovo="Cadastrar novo produto"
              cadastroAberto={cadastroProduto}
              onTexto={setTextoProduto}
              onSelecionar={(id) => {
                const produto = produtos.find((item) => String(item.id) === id);
                setForm((atual) => ({ ...atual, produtoId: id }));
                if (produto) {
                  const rotulo = produto.sku ? `${produto.sku} — ${produto.nome}` : produto.nome;
                  setRotuloProduto(rotulo);
                  setNomeProduto(produto.nome);
                  setReferenciaProduto(produto.sku ?? '');
                  setTextoProduto(rotulo);
                }
                if (!id) {
                  setRotuloProduto('');
                  setNomeProduto('');
                  setReferenciaProduto('');
                }
              }}
              onAbrirCadastro={() => {
                setCadastroProduto(true);
                setErroProduto(null);
              }}
              onFecharCadastro={() => setCadastroProduto(false)}
            >
              <label>
                Nome do produto
                <input
                  value={novoProduto.nome}
                  aria-label="Nome do novo produto"
                  onChange={(e) => setNovoProduto({ ...novoProduto, nome: e.target.value })}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') e.preventDefault();
                  }}
                />
              </label>
              <label>
                SKU / referência
                <input
                  value={novoProduto.sku}
                  aria-label="SKU do novo produto"
                  placeholder="Ex.: CAM-POLO"
                  onChange={(e) => setNovoProduto({ ...novoProduto, sku: e.target.value })}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') e.preventDefault();
                  }}
                />
              </label>
              <div className="busca-cadastro__acoes">
                <button type="button" disabled={salvandoProduto} onClick={() => void salvarProdutoNovo()}>
                  {salvandoProduto ? 'Salvando…' : 'Salvar produto'}
                </button>
                <button type="button" className="btn-secundario" onClick={() => setCadastroProduto(false)}>
                  Cancelar
                </button>
              </div>
              {erroProduto && <p className="erro">{erroProduto}</p>}
            </CampoBuscaCadastro>
            <label>
              Referência
              <input readOnly value={produtoSel?.sku ?? referenciaProduto} placeholder="SKU do produto selecionado" />
            </label>
            <GradeOrdem
              grade={grade}
              quantidadeOrdem={Number(form.quantidade) || 0}
              catalogoCores={catalogoCores}
              catalogoTamanhos={catalogoTamanhos}
              onChange={setGrade}
              onBuscarCores={(busca) => {
                listarCores(busca).then(setCatalogoCores).catch(() => undefined);
              }}
            />
            <div className="form__row">
              <label>
                Quantidade
                <input
                  required
                  type="number"
                  min={1}
                  step={1}
                  value={form.quantidade}
                  onChange={(e) =>
                    setForm({ ...form, quantidade: Number(e.target.value) })
                  }
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

            <button type="submit" disabled={salvando || Boolean(mensagemGrade(grade, Number(form.quantidade) || 0))}>
              {salvando ? 'Salvando…' : modo === 'editar' ? 'Salvar alterações' : 'Criar OP'}
            </button>
          </form>
        </section>
      ) : detalhe ? (
        <section className="card card--grade">
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
                {detalhe.produto}
                {detalhe.referencia ? ` · ${detalhe.referencia}` : ''}
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
          <h3 className="subtitulo">Grade planejada</h3>
          <GradeResumo celulas={detalhe.grade ?? []} />
          <h3 className="subtitulo">Ordem de corte</h3>
          {detalhe.ordem_corte ? (
            <>
              <p className="dica">
                {detalhe.ordem_corte.codigo} · {detalhe.ordem_corte.quantidade} peças
              </p>
              <GradeResumo celulas={detalhe.ordem_corte.grade} />
            </>
          ) : (
            <button type="button" disabled={criandoCorte} onClick={() => void handleCriarCorte()}>
              {criandoCorte ? 'Criando…' : 'Criar ordem de corte'}
            </button>
          )}
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
