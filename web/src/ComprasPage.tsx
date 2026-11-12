import { useCallback, useEffect, useState } from 'react';
import {
  STATUS_COMPRA,
  STATUS_COMPRA_LABEL,
  atualizarCompra,
  criarCompra,
  criarFornecedor,
  type ConfirmacaoCompra,
  criarMateriaPrima,
  listarAviamentos,
  listarCompras,
  listarFornecedores,
  listarMateriasPrimas,
  listarProdutos,
  obterCompra,
  processarDocumento,
  receberCompra,
  removerCompra,
  type Aviamento,
  type CompraItem,
  type DocumentoProcessado,
  type Fornecedor,
  type ItemDocumento,
  type MateriaPrima,
  type PedidoCompra,
  type Produto,
  type TipoDocumento,
} from './api';
import { FornecedorImportacao } from './FornecedorImportacao';
import { extrairDadosTecidoTexto } from './consumoCorte';
import type { PayloadFornecedorImportacao } from './regrasFornecedorImportacao';

const moeda = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });

type Modo = 'criar' | 'detalhe' | 'fornecedor' | 'importar' | null;
type ItemForm = { materia_prima_id: string; quantidade: number; custo_unitario: number };
type OpcaoCompra = {
  id: number;
  nome: string;
  unidade: string;
  tipo: 'materia' | 'produto' | 'aviamento';
};

function familiaUnidade(valor: string | null | undefined): string | null {
  const unidade = (valor ?? '').trim().toUpperCase();
  if (!unidade) return null;
  if (unidade === 'KG') return 'KG';
  if (unidade === 'METRO' || unidade === 'METROS' || unidade === 'M' || unidade === 'MT') return 'METRO';
  if (unidade === 'UN' || unidade === 'PC' || unidade === 'PÇ' || unidade === 'PEÇA' || unidade === 'PECA') return 'UN';
  return unidade;
}

function unidadeParaCadastro(valor: string | null | undefined): string {
  const familia = familiaUnidade(valor);
  if (familia === 'KG') return 'KG';
  if (familia === 'METRO') return 'MT';
  if (familia === 'UN') return 'UN';
  return 'UN';
}

function avisoDeUnidade(documento: string | null, cadastro: string | null | undefined): string | null {
  const lida = familiaUnidade(documento);
  const cadastrada = familiaUnidade(cadastro);
  if (lida && cadastrada && lida !== cadastrada) {
    return `A unidade do documento (${lida}) difere da cadastrada (${cadastrada})`;
  }
  return null;
}

const TIPOS_DOCUMENTO: Array<{ id: TipoDocumento; label: string }> = [
  { id: 'nota_fiscal', label: 'Nota Fiscal' },
  { id: 'pedido_compra', label: 'Pedido de Compra' },
  { id: 'outro', label: 'Outro' },
];

const FORM_VAZIO = {
  fornecedor_id: '',
  data_emissao: '',
  data_prevista: '',
  vencimento: '',
  desconto: 0,
  frete: 0,
  observacoes: '',
  itens: [{ materia_prima_id: '', quantidade: 1, custo_unitario: 0 }] as ItemForm[],
};

type VisaoCompras = 'compras' | 'importar' | 'fornecedores';

export function ComprasPage({
  visao = 'compras',
  onIrImportar,
}: {
  visao?: VisaoCompras;
  onIrImportar?: () => void;
} = {}) {
  const [compras, setCompras] = useState<PedidoCompra[]>([]);
  const [pagina, setPagina] = useState(1);
  const [totalPaginas, setTotalPaginas] = useState(1);
  const [total, setTotal] = useState(0);
  const [q, setQ] = useState('');
  const [qDebounced, setQDebounced] = useState('');
  const [statusFiltro, setStatusFiltro] = useState('');
  const [fornecedorFiltro, setFornecedorFiltro] = useState('');
  const [de, setDe] = useState('');
  const [ate, setAte] = useState('');
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [modo, setModo] = useState<Modo>(null);
  const [form, setForm] = useState(FORM_VAZIO);
  const [detalhe, setDetalhe] = useState<PedidoCompra | null>(null);
  const [receber, setReceber] = useState<Record<number, number>>({});
  const [salvando, setSalvando] = useState(false);
  const [fornecedores, setFornecedores] = useState<Fornecedor[]>([]);
  const [materias, setMaterias] = useState<MateriaPrima[]>([]);
  const [produtos, setProdutos] = useState<Produto[]>([]);
  const [aviamentos, setAviamentos] = useState<Aviamento[]>([]);
  const [novoForn, setNovoForn] = useState({ nome: '', cidade: '', estado: 'SP' });
  const [arquivoPdf, setArquivoPdf] = useState<File | null>(null);
  const [tipoDocumento, setTipoDocumento] = useState<TipoDocumento>('nota_fiscal');
  const [arrastandoPdf, setArrastandoPdf] = useState(false);
  const [leitura, setLeitura] = useState<DocumentoProcessado | null>(null);
  const [fornecedorDoc, setFornecedorDoc] = useState('');
  const [fornecedorEscolhido, setFornecedorEscolhido] = useState(false);
  const [materiaNova, setMateriaNova] = useState<{ indice: number; nome: string } | null>(null);
  const [avisoFornecedor, setAvisoFornecedor] = useState<string | null>(null);
  const [formaPagamento, setFormaPagamento] = useState<'' | 'a_vista' | 'a_prazo'>('');
  const [vencimentoDoc, setVencimentoDoc] = useState('');
  const [parcelasDoc, setParcelasDoc] = useState<Array<{ vencimento: string; valor: string }>>([]);
  const [confirmacao, setConfirmacao] = useState<ConfirmacaoCompra | null>(null);

  const opcoes: OpcaoCompra[] = [
    ...materias.map((materia) => ({
      id: materia.id,
      nome: materia.nome,
      unidade: materia.unidade,
      tipo: 'materia' as const,
    })),
    ...produtos
      .filter((produto) => produto.variantes.length === 0)
      .map((produto) => ({
        id: produto.id,
        nome: produto.nome,
        unidade: produto.unidade,
        tipo: 'produto' as const,
      })),
    ...aviamentos.flatMap((aviamento) =>
      aviamento.variantes
        .filter((variante) => variante.status === 'ativo' && aviamento.status === 'ativo')
        .map((variante) => ({
          id: variante.id,
          nome: [aviamento.nome, aviamento.modelo, aviamento.marca, variante.cor, variante.tamanho]
            .filter(Boolean)
            .join(' · '),
          unidade: aviamento.unidade,
          tipo: 'aviamento' as const,
        })),
    ),
  ];

  useEffect(() => {
    const t = setTimeout(() => {
      setQDebounced(q);
      setPagina(1);
    }, 300);
    return () => clearTimeout(t);
  }, [q]);

  useEffect(() => {
    setPagina(1);
  }, [statusFiltro, fornecedorFiltro, de, ate]);

  useEffect(() => {
    listarFornecedores({ por_pagina: 100 }).then((l) => setFornecedores(l.data)).catch(() => undefined);
    listarMateriasPrimas({ por_pagina: 100 }).then((l) => setMaterias(l.data)).catch(() => undefined);
    listarProdutos({ por_pagina: 100, status: 'ativo' }).then((l) => setProdutos(l.data)).catch(() => undefined);
    listarAviamentos({ por_pagina: 100, status: 'ativo' }).then((l) => setAviamentos(l.data)).catch(() => undefined);
  }, []);

  const recarregar = useCallback(async () => {
    try {
      setCarregando(true);
      const lista = await listarCompras({
        q: qDebounced,
        status: statusFiltro,
        fornecedor_id: fornecedorFiltro ? Number(fornecedorFiltro) : undefined,
        de: de || undefined,
        ate: ate || undefined,
        pagina,
        por_pagina: 10,
      });
      setCompras(lista.data);
      setTotal(lista.total);
      setTotalPaginas(lista.total_paginas);
      setErro(null);
    } catch (e) {
      setErro((e as Error).message);
    } finally {
      setCarregando(false);
    }
  }, [qDebounced, statusFiltro, fornecedorFiltro, de, ate, pagina]);

  useEffect(() => {
    void recarregar();
  }, [recarregar]);

  async function abrirDetalhe(id: number) {
    const c = await obterCompra(id);
    setDetalhe(c);
    const mapa: Record<number, number> = {};
    for (const item of c.itens ?? []) {
      mapa[item.id] = Math.max(0, item.quantidade - item.quantidade_recebida);
    }
    setReceber(mapa);
    setModo('detalhe');
  }

  async function handleSalvar(e: React.FormEvent) {
    e.preventDefault();
    try {
      setSalvando(true);
      const itens = form.itens
        .filter((i) => i.materia_prima_id)
        .map((i) => ({
          materia_prima_id: Number(i.materia_prima_id),
          quantidade: Number(i.quantidade),
          custo_unitario: Number(i.custo_unitario),
        }));
      await criarCompra({
        fornecedor_id: Number(form.fornecedor_id),
        data_emissao: form.data_emissao || undefined,
        data_prevista: form.data_prevista || undefined,
        vencimento: form.vencimento || undefined,
        desconto: Number(form.desconto) || 0,
        frete: Number(form.frete) || 0,
        observacoes: form.observacoes || undefined,
        itens,
      });
      setForm(FORM_VAZIO);
      setModo(null);
      setErro(null);
      await recarregar();
    } catch (err) {
      setErro((err as Error).message);
    } finally {
      setSalvando(false);
    }
  }

  async function handleAbrir(id: number) {
    try {
      await atualizarCompra(id, { status: 'aberta' });
      await abrirDetalhe(id);
      await recarregar();
    } catch (err) {
      setErro((err as Error).message);
    }
  }

  async function handleReceber() {
    if (!detalhe) return;
    try {
      setSalvando(true);
      const itens = (detalhe.itens ?? [])
        .map((i) => ({ item_id: i.id, quantidade: Number(receber[i.id] || 0) }))
        .filter((i) => i.quantidade > 0);
      const atualizada = await receberCompra(detalhe.id, itens);
      setDetalhe(atualizada);
      setErro(null);
      await recarregar();
    } catch (err) {
      setErro((err as Error).message);
    } finally {
      setSalvando(false);
    }
  }

  async function handleFornecedor(e: React.FormEvent) {
    e.preventDefault();
    try {
      setSalvando(true);
      const criado = await criarFornecedor(novoForn);
      setFornecedores((atual) => [...atual, criado].sort((a, b) => a.nome.localeCompare(b.nome)));
      setForm((f) => ({ ...f, fornecedor_id: String(criado.id) }));
      setNovoForn({ nome: '', cidade: '', estado: 'SP' });
      setModo(visao === 'fornecedores' ? null : 'criar');
      setErro(null);
    } catch (err) {
      setErro((err as Error).message);
    } finally {
      setSalvando(false);
    }
  }

  useEffect(() => {
    if (visao !== 'importar') return;
    setArquivoPdf(null);
    setTipoDocumento('nota_fiscal');
    setLeitura(null);
    setFornecedorDoc('');
    setFornecedorEscolhido(false);
    setMateriaNova(null);
    setAvisoFornecedor(null);
    setArrastandoPdf(false);
    setModo('importar');
    setErro(null);
  }, [visao]);

  function abrirImportar() {
    setArquivoPdf(null);
    setTipoDocumento('nota_fiscal');
    setLeitura(null);
    setFornecedorDoc('');
    setFornecedorEscolhido(false);
    setMateriaNova(null);
    setAvisoFornecedor(null);
    setArrastandoPdf(false);
    setModo('importar');
    setErro(null);
  }

  function aceitarPdf(arquivo: File | null) {
    if (!arquivo) return;
    const pdf = arquivo.type === 'application/pdf' || arquivo.name.toLowerCase().endsWith('.pdf');
    if (!pdf) {
      setErro('Envie um arquivo PDF');
      return;
    }
    setErro(null);
    setArquivoPdf(arquivo);
    setLeitura(null);
  }

  async function processarPdf() {
    if (!arquivoPdf) {
      setErro('Selecione o PDF');
      return;
    }
    try {
      setSalvando(true);
      setErro(null);
      const conteudo = await arquivoPdf.arrayBuffer();
      const bytes = new Uint8Array(conteudo);
      let binario = '';
      for (const byte of bytes) binario += String.fromCharCode(byte);
      const documento = await processarDocumento({
        tipo: tipoDocumento,
        nome_arquivo: arquivoPdf.name,
        conteudo_base64: btoa(binario),
      });
      setLeitura(documento);
      setFornecedorDoc(documento.fornecedor ? String(documento.fornecedor.id) : '');
      setFornecedorEscolhido(false);
      setMateriaNova(null);
      setAvisoFornecedor(null);
      setFormaPagamento('');
      setVencimentoDoc('');
      setParcelasDoc([]);
      setConfirmacao(null);
    } catch (err) {
      setErro((err as Error).message);
    } finally {
      setSalvando(false);
    }
  }

  useEffect(() => {
    if (!leitura || fornecedorDoc || fornecedorEscolhido) return;
    const digitos = (leitura.cnpj || leitura.cpf || '').replace(/\D/g, '');
    if (!digitos) return;
    const local = fornecedores.find(
      (fornecedor) => (fornecedor.cpf_cnpj ?? '').replace(/\D/g, '') === digitos,
    );
    if (local) setFornecedorDoc(String(local.id));
  }, [leitura, fornecedores, fornecedorDoc, fornecedorEscolhido]);

  function atualizarItemLido(indice: number, patch: Partial<ItemDocumento>) {
    setLeitura((atual) => {
      if (!atual) return atual;
      const itens = atual.itens.map((item, i) => (i === indice ? { ...item, ...patch } : item));
      return { ...atual, itens };
    });
  }

  function vincularFornecedorImportado(fornecedor: Fornecedor, jaExistia: boolean) {
    setFornecedores((atual) => {
      if (atual.some((item) => item.id === fornecedor.id)) return atual;
      return [...atual, fornecedor].sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
    });
    setFornecedorDoc(String(fornecedor.id));
    setForm((atual) => ({ ...atual, fornecedor_id: String(fornecedor.id) }));
    setLeitura((atual) => (
      atual ? { ...atual, fornecedor: { id: fornecedor.id, nome: fornecedor.nome } } : atual
    ));
    setAvisoFornecedor(
      jaExistia
        ? 'Fornecedor já cadastrado com este CPF/CNPJ. O cadastro existente foi vinculado a esta importação.'
        : null,
    );
    setErro(null);
  }

  async function salvarFornecedorDaImportacao(dados: PayloadFornecedorImportacao) {
    const digitos = (dados.cpf_cnpj ?? '').replace(/\D/g, '');
    const local = digitos
      ? fornecedores.find((fornecedor) => (fornecedor.cpf_cnpj ?? '').replace(/\D/g, '') === digitos)
      : undefined;
    if (local) {
      vincularFornecedorImportado(local, true);
      return;
    }
    try {
      setSalvando(true);
      const criado = await criarFornecedor(dados);
      vincularFornecedorImportado(criado, false);
    } catch (err) {
      const duplicado = (err as Error & { fornecedor?: Fornecedor }).fornecedor;
      if (duplicado) {
        vincularFornecedorImportado(duplicado, true);
        return;
      }
      setErro((err as Error).message);
    } finally {
      setSalvando(false);
    }
  }

  function itemVinculado(item: ItemDocumento): boolean {
    return item.materia_prima_id != null || item.produto_id != null || item.aviamento_variante_id != null;
  }

  function opcaoDoItem(item: ItemDocumento): OpcaoCompra | undefined {
    return opcoes.find((opcao) => {
      if (item.aviamento_variante_id) return opcao.tipo === 'aviamento' && opcao.id === item.aviamento_variante_id;
      if (item.produto_id) return opcao.tipo === 'produto' && opcao.id === item.produto_id;
      return opcao.tipo === 'materia' && opcao.id === item.materia_prima_id;
    });
  }

  function vinculoValido(item: ItemDocumento): boolean {
    if (!itemVinculado(item)) return false;
    return avisoDeUnidade(item.unidade, opcaoDoItem(item)?.unidade) == null;
  }

  async function cadastrarMateriaDoItem(indice: number) {
    const item = leitura?.itens[indice];
    const nome = materiaNova?.indice === indice ? materiaNova.nome.trim() : item?.descricao.trim();
    if (!item || !nome) return;
    const familia = familiaUnidade(item.unidade);
    try {
      setSalvando(true);
      const extraido = extrairDadosTecidoTexto(item.descricao);
      const unidade = unidadeParaCadastro(item.unidade) || extraido.unidade || 'UN';
      const criada = await criarMateriaPrima({
        nome: nome.slice(0, 200),
        tipo: familia === 'KG' || familia === 'METRO' ? 'tecido' : 'outro',
        unidade,
        custo: item.valor_unitario ?? 0,
        composicao: extraido.composicao || undefined,
        largura_cm: extraido.larguraCm,
        gramatura: extraido.gramatura,
      });
      setMaterias((atual) => [...atual, criada].sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR')));
      atualizarItemLido(indice, {
        materia_prima_id: criada.id,
        produto_id: null,
        aviamento_variante_id: null,
        nome_cadastro: criada.nome,
        aviso: null,
      });
      setMateriaNova(null);
      setErro(null);
    } catch (err) {
      setErro((err as Error).message);
    } finally {
      setSalvando(false);
    }
  }

  async function confirmarEntradaDoDocumento() {
    if (!leitura) return;
    if (leitura.ja_importado) {
      setErro('Este documento já foi importado');
      return;
    }
    const pendentes = leitura.itens.filter((item) => !vinculoValido(item));
    if (!fornecedorDoc) {
      setErro('Selecione o fornecedor da compra');
      return;
    }
    if (leitura.itens.length === 0) {
      setErro('Nenhum item foi identificado. Confira o documento antes de lançar a compra.');
      return;
    }
    if (pendentes.length > 0) {
      setErro('Vincule os itens ao cadastro antes de confirmar a entrada no estoque');
      return;
    }
    if (!formaPagamento) {
      setErro('Informe se o pagamento é à vista ou a prazo');
      return;
    }
    const parcelas = parcelasDoc
      .filter((parcela) => parcela.vencimento && Number(parcela.valor) > 0)
      .map((parcela) => ({ vencimento: parcela.vencimento, valor: Number(parcela.valor) }));
    if (formaPagamento === 'a_prazo' && !vencimentoDoc && parcelas.length === 0) {
      setErro('Informe o vencimento ou as parcelas da conta a prazo');
      return;
    }
    const itens = leitura.itens
      .filter((item) => item.quantidade && item.quantidade > 0)
      .map((item) => ({
        materia_prima_id: item.produto_id || item.aviamento_variante_id ? undefined : item.materia_prima_id ?? undefined,
        produto_id: item.aviamento_variante_id ? undefined : item.produto_id ?? undefined,
        aviamento_variante_id: item.aviamento_variante_id ?? undefined,
        quantidade: item.quantidade ?? 0,
        custo_unitario: item.valor_unitario ?? 0,
        unidade: opcaoDoItem(item)?.unidade,
      }));
    if (itens.length === 0) {
      setErro('Nenhum item reconhecido com quantidade para entrar no estoque');
      return;
    }
    const observacoes = [
      `Importado de ${leitura.nome_arquivo}.`,
      leitura.numero ? `Documento ${leitura.numero}.` : '',
    ]
      .filter(Boolean)
      .join(' ');
    try {
      setSalvando(true);
      const compra = await criarCompra({
        fornecedor_id: Number(fornecedorDoc),
        data_emissao: leitura.data_emissao ?? undefined,
        documento_importado_id: leitura.id,
        observacoes,
        confirmar: true,
        forma_pagamento: formaPagamento,
        vencimento: formaPagamento === 'a_prazo' ? vencimentoDoc || parcelas[0]?.vencimento : undefined,
        parcelas: formaPagamento === 'a_prazo' && parcelas.length > 0 ? parcelas : undefined,
        itens,
      });
      setConfirmacao(compra.confirmacao ?? null);
      setErro(null);
      await recarregar();
      await abrirDetalhe(compra.id);
    } catch (err) {
      setErro((err as Error).message);
    } finally {
      setSalvando(false);
    }
  }

  function fecharImportacao() {
    if (visao === 'importar') {
      setArquivoPdf(null);
      setTipoDocumento('nota_fiscal');
      setLeitura(null);
      setFornecedorDoc('');
      setAvisoFornecedor(null);
      setFormaPagamento('');
      setVencimentoDoc('');
      setParcelasDoc([]);
      setConfirmacao(null);
      setArrastandoPdf(false);
      setDetalhe(null);
      setModo('importar');
      setErro(null);
      return;
    }
    setModo(null);
  }

  return (
    <main className="app__main app__main--compras">
      {visao === 'compras' && (
      <section className="card card--wide">
        <div className="card__head">
          <h2>Compras</h2>
          <div className="card__head-acoes">
            <span className="badge">
              {total} compra{total === 1 ? '' : 's'}
            </span>
            <button
              type="button"
              className="btn-secundario"
              onClick={() => (onIrImportar ? onIrImportar() : abrirImportar())}
            >
              Importar PDF
            </button>
            <button type="button" className="btn-secundario" onClick={() => { setForm(FORM_VAZIO); setModo('criar'); }}>
              Nova compra
            </button>
          </div>
        </div>

        <div className="filtros filtros--compras">
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar código ou fornecedor…" aria-label="Buscar compras" />
          <select value={statusFiltro} onChange={(e) => setStatusFiltro(e.target.value)} aria-label="Filtrar status">
            <option value="">Todos os status</option>
            {STATUS_COMPRA.map((s) => (
              <option key={s} value={s}>{STATUS_COMPRA_LABEL[s]}</option>
            ))}
          </select>
          <select value={fornecedorFiltro} onChange={(e) => setFornecedorFiltro(e.target.value)} aria-label="Filtrar fornecedor">
            <option value="">Todos os fornecedores</option>
            {fornecedores.map((f) => (
              <option key={f.id} value={f.id}>{f.nome}</option>
            ))}
          </select>
          <input type="date" value={de} onChange={(e) => setDe(e.target.value)} aria-label="Data inicial" />
          <input type="date" value={ate} onChange={(e) => setAte(e.target.value)} aria-label="Data final" />
        </div>

        {erro && <p className="erro">{erro}</p>}
        {carregando ? (
          <p className="vazio">Carregando…</p>
        ) : compras.length === 0 ? (
          <p className="vazio">Nenhuma compra. Cadastre um fornecedor e crie o primeiro pedido.</p>
        ) : (
          <table className="tabela">
            <thead>
              <tr>
                <th>Código</th>
                <th>Fornecedor</th>
                <th>Emissão</th>
                <th>Status</th>
                <th>Total</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {compras.map((c) => (
                <tr key={c.id}>
                  <td>{c.codigo}</td>
                  <td>{c.fornecedor}</td>
                  <td>{c.data_emissao?.slice(0, 10).split('-').reverse().join('/')}</td>
                  <td><span className={`pill pill--${c.status}`}>{STATUS_COMPRA_LABEL[c.status]}</span></td>
                  <td>{moeda.format(c.total)}</td>
                  <td className="acoes">
                    <button type="button" onClick={() => { setConfirmacao(null); void abrirDetalhe(c.id); }}>Ver</button>
                    {c.status === 'rascunho' && (
                      <button type="button" className="btn-remover-texto" onClick={() => void removerCompra(c.id).then(recarregar).catch((e) => setErro(e.message))}>
                        Excluir
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        <div className="paginacao">
          <span>{total} registro{total === 1 ? '' : 's'}</span>
          <div>
            <button type="button" disabled={pagina <= 1} onClick={() => setPagina((p) => p - 1)}>Anterior</button>
            <span>Página {pagina} de {totalPaginas}</span>
            <button type="button" disabled={pagina >= totalPaginas} onClick={() => setPagina((p) => p + 1)}>Próxima</button>
          </div>
        </div>
      </section>
      )}

      {visao === 'fornecedores' && (
        <section className="card card--wide">
          <div className="card__head">
            <h2>Fornecedores</h2>
            <div className="card__head-acoes">
              <span className="badge">
                {fornecedores.length} fornecedor{fornecedores.length === 1 ? '' : 'es'}
              </span>
              <button type="button" className="btn-secundario" onClick={() => setModo('fornecedor')}>
                Novo fornecedor
              </button>
            </div>
          </div>
          {erro && <p className="erro">{erro}</p>}
          {fornecedores.length === 0 ? (
            <p className="vazio">Nenhum fornecedor cadastrado.</p>
          ) : (
            <table className="tabela">
              <thead>
                <tr>
                  <th>Nome</th>
                  <th>CPF/CNPJ</th>
                  <th>Telefone</th>
                  <th>Cidade</th>
                  <th>Estado</th>
                </tr>
              </thead>
              <tbody>
                {fornecedores.map((fornecedor) => (
                  <tr key={fornecedor.id}>
                    <td>{fornecedor.nome}</td>
                    <td>{fornecedor.cpf_cnpj || '—'}</td>
                    <td>{fornecedor.telefone || '—'}</td>
                    <td>{fornecedor.cidade || '—'}</td>
                    <td>{fornecedor.estado || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      )}

      {modo === 'importar' && visao !== 'fornecedores' && (
        <section className="card">
          <div className="card__head">
            <h2>Importar documento</h2>
            <button type="button" className="btn-fechar" onClick={fecharImportacao}>×</button>
          </div>
          {erro && <p className="erro">{erro}</p>}
          <div
            className={`importar-pdf${arrastandoPdf ? ' importar-pdf--ativo' : ''}`}
            onDragOver={(e) => {
              e.preventDefault();
              setArrastandoPdf(true);
            }}
            onDragLeave={() => setArrastandoPdf(false)}
            onDrop={(e) => {
              e.preventDefault();
              setArrastandoPdf(false);
              aceitarPdf(e.dataTransfer.files[0] ?? null);
            }}
          >
            Arraste o PDF aqui
            {arquivoPdf && <span className="dica">{arquivoPdf.name}</span>}
          </div>
          <p className="importar-ou">ou</p>
          <div className="importar-arquivo">
            <span id="pdf-compra-rotulo">Selecionar arquivo</span>
            <input
              id="pdf-compra"
              aria-labelledby="pdf-compra-rotulo"
              type="file"
              accept="application/pdf,.pdf"
              onChange={(e) => {
                aceitarPdf(e.target.files?.[0] ?? null);
              }}
            />
          </div>
          <fieldset className="importar-tipo">
            <legend>Tipo</legend>
            {TIPOS_DOCUMENTO.map((tipo) => (
              <label key={tipo.id}>
                <input
                  type="radio"
                  name="tipo-documento"
                  checked={tipoDocumento === tipo.id}
                  onChange={() => setTipoDocumento(tipo.id)}
                />
                {tipo.label}
              </label>
            ))}
          </fieldset>
          <button type="button" disabled={salvando || !arquivoPdf} onClick={() => void processarPdf()}>
            {salvando ? 'Processando…' : 'Processar documento'}
          </button>
          {leitura && (
            <div className="importar-leitura">
              <h3>Conferência</h3>
              <dl className="detalhe">
                <div><dt>Arquivo</dt><dd>{leitura.nome_arquivo}</dd></div>
                <div><dt>Número</dt><dd>{leitura.numero || '—'}</dd></div>
                <div><dt>Emitente</dt><dd>{leitura.emitente || '—'}</dd></div>
                {leitura.tipo_pessoa && (
                  <div><dt>Tipo de pessoa</dt><dd>{leitura.tipo_pessoa === 'fisica' ? 'Física' : 'Jurídica'}</dd></div>
                )}
                {leitura.nome_fantasia && <div><dt>Nome fantasia</dt><dd>{leitura.nome_fantasia}</dd></div>}
                <div><dt>CNPJ</dt><dd>{leitura.cnpj || '—'}</dd></div>
                {leitura.cpf && <div><dt>CPF</dt><dd>{leitura.cpf}</dd></div>}
                {leitura.inscricao_estadual && <div><dt>Inscrição estadual</dt><dd>{leitura.inscricao_estadual}</dd></div>}
                {leitura.telefone && <div><dt>Telefone</dt><dd>{leitura.telefone}</dd></div>}
                {leitura.email && <div><dt>E-mail</dt><dd>{leitura.email}</dd></div>}
                {leitura.cep && <div><dt>CEP</dt><dd>{leitura.cep}</dd></div>}
                {(leitura.endereco || leitura.numero_endereco || leitura.complemento) && (
                  <div>
                    <dt>Endereço</dt>
                    <dd>{[leitura.endereco, leitura.numero_endereco, leitura.complemento].filter(Boolean).join(', ')}</dd>
                  </div>
                )}
                {leitura.bairro && <div><dt>Bairro</dt><dd>{leitura.bairro}</dd></div>}
                {leitura.cidade && <div><dt>Cidade</dt><dd>{leitura.cidade}</dd></div>}
                {leitura.estado && <div><dt>UF</dt><dd>{leitura.estado}</dd></div>}
                <div><dt>Data</dt><dd>{leitura.data_emissao ? leitura.data_emissao.split('-').reverse().join('/') : '—'}</dd></div>
                <div><dt>Total</dt><dd>{leitura.total == null ? '—' : moeda.format(leitura.total)}</dd></div>
              </dl>
              <p className="dica">
                {leitura.itens.filter(vinculoValido).length} vinculado(s),{' '}
                {leitura.itens.filter((item) => !vinculoValido(item)).length} sem vínculo válido.
                Processar o PDF apenas lê a nota. A entrada no estoque e o título financeiro só nascem
                ao confirmar, com o pagamento informado.
              </p>
              {leitura.avisos.map((aviso) => (
                <p key={aviso} className="dica">{aviso}</p>
              ))}
              {leitura.texto && (
                <details className="texto-extraido">
                  <summary>Texto extraído do PDF</summary>
                  <pre>{leitura.texto}</pre>
                </details>
              )}
              <label>
                Fornecedor
                <select
                  value={fornecedorDoc}
                  onChange={(e) => {
                    setFornecedorEscolhido(true);
                    setFornecedorDoc(e.target.value);
                  }}
                >
                  <option value="">Selecione</option>
                  {fornecedores.map((fornecedor) => (
                    <option key={fornecedor.id} value={fornecedor.id}>{fornecedor.nome}</option>
                  ))}
                </select>
              </label>
              <FornecedorImportacao
                key={leitura.id}
                leitura={leitura}
                selecionado={Boolean(fornecedorDoc)}
                salvando={salvando}
                aviso={avisoFornecedor}
                onCadastrar={salvarFornecedorDaImportacao}
              />
              {leitura.itens.length > 0 && (
                <table className="tabela tabela--compacta">
                  <thead>
                    <tr>
                      <th>Item do documento</th>
                      <th>Qtd.</th>
                      <th>Unidade</th>
                      <th>Valor</th>
                      <th>Cadastro</th>
                    </tr>
                  </thead>
                  <tbody>
                    {leitura.itens.map((item, indice) => {
                      const valorCadastro = item.aviamento_variante_id
                        ? `aviamento:${item.aviamento_variante_id}`
                        : item.produto_id
                          ? `produto:${item.produto_id}`
                          : item.materia_prima_id
                            ? `materia:${item.materia_prima_id}`
                            : '';
                      return (
                        <tr key={`${item.descricao}-${indice}`}>
                          <td>
                            {item.descricao}
                            {item.aviso && <div className="dica">{item.aviso}</div>}
                          </td>
                          <td>{item.quantidade ?? '—'}</td>
                          <td>{item.unidade ?? '—'}</td>
                          <td>{item.valor_unitario == null ? '—' : moeda.format(item.valor_unitario)}</td>
                          <td>
                            <select
                              aria-label={`Cadastro de ${item.descricao}`}
                              value={valorCadastro}
                              onChange={(e) => {
                                const [tipo, idTexto] = e.target.value.split(':');
                                const id = idTexto ? Number(idTexto) : null;
                                const opcao = opcoes.find((atual) => atual.tipo === tipo && atual.id === id);
                                atualizarItemLido(indice, {
                                  materia_prima_id: tipo === 'materia' ? id : null,
                                  produto_id: tipo === 'produto' ? id : null,
                                  aviamento_variante_id: tipo === 'aviamento' ? id : null,
                                  nome_cadastro: opcao?.nome ?? null,
                                  aviso: opcao ? avisoDeUnidade(item.unidade, opcao.unidade) : null,
                                });
                              }}
                            >
                              <option value="">Selecione</option>
                              {opcoes.map((opcao) => (
                                <option key={`${opcao.tipo}-${opcao.id}`} value={`${opcao.tipo}:${opcao.id}`}>
                                  {opcao.tipo === 'produto'
                                    ? `${opcao.nome} (produto)`
                                    : opcao.tipo === 'aviamento'
                                      ? `${opcao.nome} (aviamento)`
                                      : `${opcao.nome} (${familiaUnidade(opcao.unidade) ?? opcao.unidade})`}
                                </option>
                              ))}
                            </select>
                            {materiaNova?.indice === indice ? (
                              <div className="item-novo">
                                <label>
                                  Nova matéria-prima
                                  <input
                                    value={materiaNova.nome}
                                    onChange={(e) => setMateriaNova({ indice, nome: e.target.value })}
                                  />
                                </label>
                                <p className="dica">Unidade de controle: {familiaUnidade(item.unidade) ?? item.unidade ?? '—'}</p>
                                <button type="button" disabled={salvando || !materiaNova.nome.trim()} onClick={() => void cadastrarMateriaDoItem(indice)}>
                                  Salvar matéria-prima
                                </button>
                                <button type="button" className="btn-secundario" onClick={() => setMateriaNova(null)}>Cancelar</button>
                              </div>
                            ) : (
                              <button
                                type="button"
                                className="btn-secundario"
                                onClick={() => setMateriaNova({ indice, nome: item.descricao })}
                              >
                                Cadastrar matéria-prima
                              </button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
              <fieldset className="importar-tipo">
                <legend>Pagamento da nota</legend>
                <label>
                  <input
                    type="radio"
                    name="forma-pagamento-nota"
                    checked={formaPagamento === 'a_vista'}
                    onChange={() => setFormaPagamento('a_vista')}
                  />
                  À vista
                </label>
                <label>
                  <input
                    type="radio"
                    name="forma-pagamento-nota"
                    checked={formaPagamento === 'a_prazo'}
                    onChange={() => setFormaPagamento('a_prazo')}
                  />
                  A prazo
                </label>
              </fieldset>
              {formaPagamento === 'a_prazo' && (
                <div className="form">
                  <label>
                    Vencimento
                    <input
                      type="date"
                      aria-label="Vencimento da nota"
                      value={vencimentoDoc}
                      onChange={(e) => setVencimentoDoc(e.target.value)}
                    />
                  </label>
                  {parcelasDoc.map((parcela, indice) => (
                    <div className="form__row" key={indice}>
                      <label>
                        Vencimento parcela {indice + 1}
                        <input
                          type="date"
                          aria-label={`Vencimento da parcela ${indice + 1}`}
                          value={parcela.vencimento}
                          onChange={(e) => {
                            const atual = [...parcelasDoc];
                            atual[indice] = { ...parcela, vencimento: e.target.value };
                            setParcelasDoc(atual);
                          }}
                        />
                      </label>
                      <label>
                        Valor parcela {indice + 1}
                        <input
                          type="number"
                          min={0.01}
                          step={0.01}
                          aria-label={`Valor da parcela ${indice + 1}`}
                          value={parcela.valor}
                          onChange={(e) => {
                            const atual = [...parcelasDoc];
                            atual[indice] = { ...parcela, valor: e.target.value };
                            setParcelasDoc(atual);
                          }}
                        />
                      </label>
                    </div>
                  ))}
                  <button
                    type="button"
                    className="btn-secundario"
                    onClick={() => setParcelasDoc([...parcelasDoc, { vencimento: '', valor: '' }])}
                  >
                    Adicionar parcela
                  </button>
                </div>
              )}
              <div className="documento-acoes">
                <button
                  type="button"
                  disabled={salvando || leitura.ja_importado || !fornecedorDoc}
                  onClick={() => void confirmarEntradaDoDocumento()}
                >
                  {salvando ? 'Confirmando…' : 'Confirmar entrada no estoque'}
                </button>
              </div>
            </div>
          )}
        </section>
      )}

      {visao === 'compras' && modo === 'criar' && (
        <section className="card">
          <div className="card__head">
            <h2>Nova compra</h2>
            <button type="button" className="btn-fechar" onClick={() => setModo(null)}>×</button>
          </div>
          <form className="form" onSubmit={(e) => void handleSalvar(e)}>
            <label>
              Fornecedor
              <select required value={form.fornecedor_id} onChange={(e) => setForm({ ...form, fornecedor_id: e.target.value })}>
                <option value="">Selecione</option>
                {fornecedores.map((f) => (
                  <option key={f.id} value={f.id}>{f.nome}</option>
                ))}
              </select>
            </label>
            <button type="button" className="btn-secundario" onClick={() => setModo('fornecedor')}>Novo fornecedor</button>
            <div className="form__row">
              <label>Emissão<input type="date" value={form.data_emissao} onChange={(e) => setForm({ ...form, data_emissao: e.target.value })} /></label>
              <label>Previsão<input type="date" value={form.data_prevista} onChange={(e) => setForm({ ...form, data_prevista: e.target.value })} /></label>
            </div>
            <label>Vencimento<input type="date" value={form.vencimento} onChange={(e) => setForm({ ...form, vencimento: e.target.value })} /></label>
            <div className="form__row">
              <label>Desconto<input type="number" min={0} step={0.01} value={form.desconto} onChange={(e) => setForm({ ...form, desconto: Number(e.target.value) })} /></label>
              <label>Frete<input type="number" min={0} step={0.01} value={form.frete} onChange={(e) => setForm({ ...form, frete: Number(e.target.value) })} /></label>
            </div>
            <p className="subtitulo">Itens</p>
            {form.itens.map((item, idx) => (
              <div className="form__row" key={idx}>
                <label>
                  Material
                  <select
                    required
                    value={item.materia_prima_id}
                    onChange={(e) => {
                      const itens = [...form.itens];
                      const mat = materias.find((m) => m.id === Number(e.target.value));
                      itens[idx] = {
                        ...item,
                        materia_prima_id: e.target.value,
                        custo_unitario: mat?.custo ?? item.custo_unitario,
                      };
                      setForm({ ...form, itens });
                    }}
                  >
                    <option value="">Selecione</option>
                    {materias.map((m) => (
                      <option key={m.id} value={m.id}>{m.nome}</option>
                    ))}
                  </select>
                </label>
                <label>
                  Qtd.
                  <input type="number" min={0.01} step={0.01} value={item.quantidade} onChange={(e) => {
                    const itens = [...form.itens];
                    itens[idx] = { ...item, quantidade: Number(e.target.value) };
                    setForm({ ...form, itens });
                  }} />
                </label>
                <label>
                  Custo
                  <input type="number" min={0} step={0.01} value={item.custo_unitario} onChange={(e) => {
                    const itens = [...form.itens];
                    itens[idx] = { ...item, custo_unitario: Number(e.target.value) };
                    setForm({ ...form, itens });
                  }} />
                </label>
              </div>
            ))}
            <button
              type="button"
              className="btn-secundario"
              onClick={() => setForm({ ...form, itens: [...form.itens, { materia_prima_id: '', quantidade: 1, custo_unitario: 0 }] })}
            >
              Adicionar item
            </button>
            <label>Observações<textarea value={form.observacoes} onChange={(e) => setForm({ ...form, observacoes: e.target.value })} /></label>
            <button type="submit" disabled={salvando}>{salvando ? 'Salvando…' : 'Salvar rascunho'}</button>
          </form>
        </section>
      )}

      {modo === 'fornecedor' && (
        <section className="card">
          <div className="card__head">
            <h2>Novo fornecedor</h2>
            <button type="button" className="btn-fechar" onClick={() => setModo(visao === 'fornecedores' ? null : 'criar')}>×</button>
          </div>
          <form className="form" onSubmit={(e) => void handleFornecedor(e)}>
            <label>Nome<input required value={novoForn.nome} onChange={(e) => setNovoForn({ ...novoForn, nome: e.target.value })} /></label>
            <label>Cidade<input value={novoForn.cidade} onChange={(e) => setNovoForn({ ...novoForn, cidade: e.target.value })} /></label>
            <button type="submit" disabled={salvando}>Cadastrar</button>
          </form>
        </section>
      )}

      {modo === 'detalhe' && detalhe && (
        <section className="card">
          <div className="card__head">
            <h2>{detalhe.codigo}</h2>
            <button type="button" className="btn-fechar" onClick={fecharImportacao}>×</button>
          </div>
          <dl className="detalhe">
            <div><dt>Fornecedor</dt><dd>{detalhe.fornecedor}</dd></div>
            {detalhe.documento_nome && (
              <div>
                <dt>Documento</dt>
                <dd>
                  {detalhe.documento_nome}
                  {detalhe.documento_numero ? ` · ${detalhe.documento_numero}` : ''}
                </dd>
              </div>
            )}
            <div><dt>Status</dt><dd>{STATUS_COMPRA_LABEL[detalhe.status]}</dd></div>
            <div><dt>Subtotal</dt><dd>{moeda.format(detalhe.subtotal)}</dd></div>
            <div><dt>Desconto</dt><dd>{moeda.format(detalhe.desconto)}</dd></div>
            <div><dt>Frete</dt><dd>{moeda.format(detalhe.frete)}</dd></div>
            <div><dt>Total</dt><dd>{moeda.format(detalhe.total)}</dd></div>
          </dl>
          {confirmacao && (
            <div className="confirmacao-nota">
              <h3>Nota confirmada</h3>
              <p className="dica">
                A compra foi lançada. O material já está no estoque
                {confirmacao.financeiro.length ? ' e o título foi enviado para Contas a Pagar.' : '.'}
              </p>
              {confirmacao.estoque.length > 0 && (
                <table className="tabela tabela--compacta" aria-label="Entradas no estoque">
                  <thead>
                    <tr>
                      <th>Material</th>
                      <th>Cor</th>
                      <th>Entrada</th>
                      <th>Saldo</th>
                    </tr>
                  </thead>
                  <tbody>
                    {confirmacao.estoque.map((item, indice) => (
                      <tr key={`${item.materia_prima_id}-${indice}`}>
                        <td>{item.nome}</td>
                        <td>{item.cor || '—'}</td>
                        <td>{item.quantidade} {item.unidade}</td>
                        <td>{item.saldo} {item.unidade}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
              {confirmacao.financeiro.length > 0 && (
                <table className="tabela tabela--compacta" aria-label="Contas a pagar">
                  <thead>
                    <tr>
                      <th>Descrição</th>
                      <th>Vencimento</th>
                      <th>Valor</th>
                    </tr>
                  </thead>
                  <tbody>
                    {confirmacao.financeiro.map((titulo) => (
                      <tr key={titulo.id}>
                        <td>{titulo.descricao}</td>
                        <td>
                          {titulo.vencimento
                            ? titulo.vencimento.slice(0, 10).split('-').reverse().join('/')
                            : '—'}
                        </td>
                        <td>{moeda.format(titulo.valor)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}
          <table className="tabela tabela--compacta">
            <thead>
              <tr>
                <th>Item</th>
                <th>Qtd.</th>
                <th>Recebido</th>
                <th>Custo</th>
                {(detalhe.status === 'aberta' || detalhe.status === 'parcial') && <th>Receber</th>}
              </tr>
            </thead>
            <tbody>
              {(detalhe.itens ?? []).map((i: CompraItem) => (
                <tr key={i.id}>
                  <td>{i.nome}<div className="dica">{i.codigo}</div></td>
                  <td>{i.quantidade}</td>
                  <td>{i.quantidade_recebida}</td>
                  <td>{moeda.format(i.custo_unitario)}</td>
                  {(detalhe.status === 'aberta' || detalhe.status === 'parcial') && (
                    <td>
                      <input
                        type="number"
                        min={0}
                        step={0.01}
                        value={receber[i.id] ?? 0}
                        onChange={(e) => setReceber({ ...receber, [i.id]: Number(e.target.value) })}
                        aria-label={`Receber ${i.nome}`}
                      />
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
          <div className="detalhe__acoes">
            {detalhe.status === 'rascunho' && (
              <button type="button" className="btn-secundario" onClick={() => void handleAbrir(detalhe.id)}>Abrir compra</button>
            )}
            {(detalhe.status === 'aberta' || detalhe.status === 'parcial') && (
              <button type="button" className="btn-secundario" disabled={salvando} onClick={() => void handleReceber()}>
                {salvando ? 'Recebendo…' : 'Receber no estoque'}
              </button>
            )}
          </div>
        </section>
      )}
    </main>
  );
}
