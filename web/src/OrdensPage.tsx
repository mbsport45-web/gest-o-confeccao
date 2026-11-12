import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  PRIORIDADE_OP_LABEL,
  PRIORIDADES_OP,
  STATUS_OP_LABEL,
  atualizarOrdem,
  atualizarStatus,
  criarCliente,
  criarCor,
  criarOrdem,
  criarOrdemCorte,
  criarProduto,
  listarClientes,
  listarCores,
  listarMateriasPrimas,
  listarOrdens,
  listarProdutos,
  listarTamanhos,
  obterOrdem,
  obterPainelProducao,
  removerOrdem,
  type AssinaturaEmpresa,
  type Cliente,
  type CorCadastro,
  type MateriaPrima,
  type OrdemProducao,
  type PainelProducao,
  type PrioridadeOp,
  type Produto,
  type Status,
  type TamanhoCadastro,
} from './api';
import { AvisoLimite, podeCriarNoPlano } from './AvisoLimite';
import { CampoBuscaCadastro } from './CampoBuscaCadastro';
import { GradeOrdem, GradeResumo } from './GradeOrdem';
import { OrdemCorteFichaPage } from './OrdemCorteFichaPage';
import {
  TAMANHOS_PADRAO,
  celulasDaGrade,
  gradeAoTrocarProduto,
  gradeDaOrdem,
  gradeVazia,
  mensagemGrade,
  type GradeValor,
} from './regrasGradeOrdem';
import { etapaLinhaProducao, totaisPorEtapaVazios } from './linhaProducao';

type ModoPainel = 'criar' | 'editar' | 'detalhe' | null;

const FORM_VAZIO = {
  clienteId: '',
  produtoId: '',
  quantidade: 1,
  prioridade: 'normal' as PrioridadeOp,
  data_prevista: '',
  responsavel: '',
  observacoes: '',
  tecidoId: '',
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

function situacaoCadastro(ordem: OrdemProducao): 'Planejada' | 'Em andamento' | 'Entregue' | 'Cancelada' {
  if (ordem.status === 'cancelada') return 'Cancelada';
  if (ordem.status === 'concluida') return 'Entregue';
  if (etapaLinhaProducao(ordem.status, ordem.ordem_corte?.status_processo ?? null)) return 'Em andamento';
  return 'Planejada';
}

export function OrdensPage({
  sessao,
  visao = 'producao',
  onIrProducao,
}: {
  sessao: { assinatura: AssinaturaEmpresa };
  visao?: 'producao' | 'criar-oc';
  onIrProducao?: () => void;
}) {
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
  const [painel, setPainel] = useState<PainelProducao>({
    totais: { cadastradas: 0, andamento: 0, entregues: 0 },
    por_etapa: totaisPorEtapaVazios(),
    etapa: 'corte',
    andamento: [],
  });
  const [verTodasOrdens, setVerTodasOrdens] = useState(false);
  const [todasOrdens, setTodasOrdens] = useState<OrdemProducao[]>([]);
  const [carregandoTodas, setCarregandoTodas] = useState(false);
  const verTodasOrdensRef = useRef(false);
  verTodasOrdensRef.current = verTodasOrdens;
  const [criandoCorte, setCriandoCorte] = useState(false);
  const [fichaAberta, setFichaAberta] = useState(false);
  const [fichaNova, setFichaNova] = useState(false);
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
    listarTamanhos()
      .then(setCatalogoTamanhos)
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    listarCores()
      .then(setCatalogoCores)
      .catch(() => undefined);
  }, []);

  const carregarTodasOrdens = useCallback(async () => {
    setCarregandoTodas(true);
    try {
      setTodasOrdens(await listarOrdens());
    } finally {
      setCarregandoTodas(false);
    }
  }, []);

  const recarregar = useCallback(async () => {
    try {
      const producao = await obterPainelProducao();
      setPainel(producao);
      if (verTodasOrdensRef.current) await carregarTodasOrdens();
      setErro(null);
    } catch (e) {
      setErro((e as Error).message);
    }
  }, [carregarTodasOrdens]);

  useEffect(() => {
    recarregar();
  }, [recarregar]);

  const produtoSel = useMemo(
    () => produtos.find((p) => String(p.id) === form.produtoId),
    [produtos, form.produtoId],
  );
  const tecidosCadastro = useMemo(
    () => materias.filter((item) => item.tipo === 'tecido' || item.tipo === 'forro'),
    [materias],
  );
  const tecidoSel = useMemo(
    () => tecidosCadastro.find((item) => String(item.id) === form.tecidoId),
    [tecidosCadastro, form.tecidoId],
  );

  const tamanhosIniciais = useMemo(() => {
    const padrao = catalogoTamanhos
      .filter((tamanho) => (TAMANHOS_PADRAO as readonly string[]).includes(tamanho.nome))
      .map((tamanho) => tamanho.nome);
    return padrao.length ? padrao : [...TAMANHOS_PADRAO];
  }, [catalogoTamanhos]);

  useEffect(() => {
    if (modo !== 'criar') return;
    if (produtoGradeRef.current === form.produtoId) return;
    produtoGradeRef.current = form.produtoId;
    if (!form.produtoId) return;
    const produto = produtos.find((item) => String(item.id) === form.produtoId);
    setGrade((atual) => gradeAoTrocarProduto(atual, produto?.cores ?? [], tamanhosIniciais));
  }, [modo, form.produtoId, produtos, tamanhosIniciais]);

  function abrirCriar() {
    if (!podeCriarNoPlano(sessao.assinatura, 'ordens_mes')) {
      setFichaAberta(false);
      setFichaNova(false);
      return;
    }
    setEditandoId(null);
    setDetalhe(null);
    setModo(null);
    setFichaNova(true);
    setFichaAberta(true);
    setErro(null);
  }

  useEffect(() => {
    if (visao === 'criar-oc') {
      abrirCriar();
      return;
    }
    if (fichaNova) {
      setFichaAberta(false);
      setFichaNova(false);
    }
  }, [visao]);

  async function abrirDetalhe(id: number) {
    try {
      let ordem = await obterOrdem(id);
      if (!ordem.ordem_corte) {
        await criarOrdemCorte(id);
        ordem = await obterOrdem(id);
      }
      setDetalhe(ordem);
      setFichaNova(false);
      setFichaAberta(true);
      setEditandoId(null);
      setModo('detalhe');
      setErro(null);
    } catch (err) {
      setErro((err as Error).message);
    }
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
      tecidoId: ordem.requisitos?.[0]?.materia_prima_id ? String(ordem.requisitos[0].materia_prima_id) : '',
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
    setFichaAberta(false);
    setFichaNova(false);
    setModo('editar');
  }

  function payloadDoForm() {
    const cliente = clientes.find((c) => String(c.id) === form.clienteId);
    const produto = produtos.find((p) => String(p.id) === form.produtoId);
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
      ...(form.tecidoId
        ? { requisitos: [{ materia_prima_id: Number(form.tecidoId), quantidade: 1 }] }
        : {}),
      grade: celulasDaGrade(grade),
    };
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
      setFichaAberta(true);
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
        setFichaAberta(false);
        setFichaNova(false);
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

  function abrirTodasOrdens() {
    onIrProducao?.();
    if (verTodasOrdens) {
      setVerTodasOrdens(false);
      return;
    }
    setVerTodasOrdens(true);
    void carregarTodasOrdens()
      .then(() => setErro(null))
      .catch((e) => setErro((e as Error).message));
  }

  const painelCheio = visao === 'producao' && !modo && !fichaAberta;
  const mostrarPainelProducao = visao === 'producao' && !fichaAberta && modo !== 'editar';

  return (
    <main
      className={`app__main app__main--ordens${fichaAberta ? ' app__main--ficha-oc' : ''}${
        painelCheio ? ' app__main--ordens-solo' : ''
      }`}
    >
      {mostrarPainelProducao ? (
      <div className="ordens-painel">
      {erro && <p className="erro">{erro}</p>}
      <section className="kpi-grid ordens-kpis" aria-label="Indicadores de produção">
        <button
          type="button"
          className={verTodasOrdens ? 'kpi kpi--ativa' : 'kpi'}
          aria-label="Total de ordens"
          aria-pressed={verTodasOrdens}
          onClick={abrirTodasOrdens}
        >
          <span className="kpi__label">Total de ordens</span>
          <strong className="kpi__valor">{painel.totais.cadastradas}</strong>
          <span className="kpi__dica">Cadastradas nesta empresa</span>
        </button>
        <div className="kpi">
          <span className="kpi__label">Em andamento</span>
          <strong className="kpi__valor">{painel.totais.andamento}</strong>
          <span className="kpi__dica">Na linha de produção</span>
        </div>
        <div className="kpi">
          <span className="kpi__label">Entregues</span>
          <strong className="kpi__valor">{painel.totais.entregues}</strong>
          <span className="kpi__dica">Ordens concluídas</span>
        </div>
      </section>

      {verTodasOrdens ? (
        <section className="card" aria-label="Todas as ordens cadastradas">
          <div className="card__head">
            <h2>Todas as ordens</h2>
            <span className="badge">{todasOrdens.length} cadastradas</span>
          </div>
          <p className="dica">Planejadas, em andamento e entregues.</p>
          {carregandoTodas ? (
            <p className="vazio">Carregando ordens…</p>
          ) : todasOrdens.length === 0 ? (
            <p className="vazio">Nenhuma ordem cadastrada.</p>
          ) : (
            <div className="liberacao-andamento__tabela">
              <table className="tabela" aria-label="Lista de todas as ordens">
                <thead>
                  <tr>
                    <th>OP</th>
                    <th>OC</th>
                    <th>Cliente</th>
                    <th>Produto</th>
                    <th>Qtd.</th>
                    <th>Situação</th>
                    <th>Status</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {todasOrdens.map((ordem) => (
                    <tr key={ordem.id}>
                      <td>{ordem.codigo ?? `OP-${ordem.id}`}</td>
                      <td>{ordem.ordem_corte?.codigo ?? '—'}</td>
                      <td>{ordem.cliente}</td>
                      <td>
                        {ordem.produto}
                        {ordem.ordem_corte?.referencia || ordem.referencia ? (
                          <div className="dica">
                            Ref. {ordem.ordem_corte?.referencia?.trim() || ordem.referencia}
                          </div>
                        ) : null}
                      </td>
                      <td>{ordem.quantidade}</td>
                      <td>{situacaoCadastro(ordem)}</td>
                      <td>
                        <span className={`pill pill--${ordem.status}`}>{STATUS_OP_LABEL[ordem.status]}</span>
                      </td>
                      <td className="acoes">
                        <button type="button" onClick={() => void abrirDetalhe(ordem.id)}>
                          Abrir
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      ) : null}
      </div>
      ) : null}

      {visao === 'criar-oc' && !fichaAberta ? (
        <section className="card">
          <h2>Criar OC</h2>
          <AvisoLimite assinatura={sessao.assinatura} chave="ordens_mes" />
          {erro && <p className="erro">{erro}</p>}
          <p className="dica">Preencha a ficha da ordem de corte. Ao enviar, ela entra em Corte em andamento.</p>
        </section>
      ) : null}

      {modo === 'editar' ? (
        <section className="card card--grade">
          <div className="card__head">
            <h2>Editar OP</h2>
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
                imagem: produto.imagem,
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
              onCadastrarCor={cadastrarCorNaOrdem}
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

            <h3 className="subtitulo">Tecido da ordem</h3>
            <p className="dica">
              Selecione o tecido cadastrado. A composição entra na ficha da ordem de corte e pode ser editada lá.
              A criação não consulta nem baixa estoque.
            </p>
            <label>
              Tecido cadastrado
              <select
                aria-label="Tecido cadastrado"
                value={form.tecidoId}
                onChange={(e) => setForm({ ...form, tecidoId: e.target.value })}
              >
                <option value="">Selecionar tecido cadastrado</option>
                {tecidosCadastro.map((tecido) => (
                  <option key={tecido.id} value={tecido.id}>
                    {tecido.codigo ? `${tecido.codigo} — ` : ''}
                    {tecido.nome}
                  </option>
                ))}
              </select>
            </label>
            {tecidoSel ? (
              <p className="dica">
                Composição do cadastro: {(tecidoSel.composicao ?? '').trim() || tecidoSel.nome}
              </p>
            ) : null}

            <button type="submit" disabled={salvando || Boolean(mensagemGrade(grade, Number(form.quantidade) || 0))}>
              {salvando ? 'Salvando…' : 'Salvar alterações'}
            </button>
          </form>
        </section>
      ) : fichaAberta && (fichaNova || detalhe) ? (
        <OrdemCorteFichaPage
          ordemId={fichaNova ? null : detalhe!.id}
          onVoltar={() => {
            const eraNova = fichaNova;
            setFichaAberta(false);
            setFichaNova(false);
            setDetalhe(null);
            if (eraNova) onIrProducao?.();
            void recarregar();
          }}
          onPublicada={() => {
            setFichaAberta(false);
            setFichaNova(false);
            setDetalhe(null);
            setModo(null);
            onIrProducao?.();
            void recarregar();
          }}
        />
      ) : detalhe ? (
        <section className="card card--grade">
          <div className="card__head">
            <h2>{detalhe.codigo ?? `OP ${detalhe.id}`}</h2>
            <button
              type="button"
              className="btn-fechar"
              onClick={() => {
                setDetalhe(null);
                setFichaAberta(false);
              }}
            >
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
          <p className="dica">A ordem de corte é a ficha de produção desta OP. Um único registro.</p>
          {detalhe.ordem_corte ? (
            <>
              <p className="dica">
                {detalhe.ordem_corte.codigo} · {detalhe.ordem_corte.quantidade} peças
              </p>
              <GradeResumo celulas={detalhe.ordem_corte.grade} />
              <button type="button" onClick={() => setFichaAberta(true)}>
                Abrir ordem de corte
              </button>
            </>
          ) : (
            <button type="button" disabled={criandoCorte} onClick={() => void handleCriarCorte()}>
              {criandoCorte ? 'Criando…' : 'Criar ordem de corte'}
            </button>
          )}
          <h3 className="subtitulo">Materiais da OP</h3>
          <p className="dica">O saldo é consultivo. A baixa do tecido acontece só na conclusão do corte.</p>
          {!detalhe.requisitos?.length ? (
            <p className="dica">Nenhum tecido selecionado nesta OP.</p>
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
      ) : null}
    </main>
  );
}
