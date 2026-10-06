export const STATUS_VALIDOS = [
  'planejada',
  'corte',
  'costura',
  'acabamento',
  'qualidade',
  'embalagem',
  'concluida',
  'cancelada',
  'pendente',
  'em_producao',
] as const;

export type Status = (typeof STATUS_VALIDOS)[number];

export const PRIORIDADES_OP = ['baixa', 'normal', 'alta', 'urgente'] as const;
export type PrioridadeOp = (typeof PRIORIDADES_OP)[number];

export const STATUS_OP_LABEL: Record<Status, string> = {
  planejada: 'Planejada',
  corte: 'Corte',
  costura: 'Costura',
  acabamento: 'Acabamento',
  qualidade: 'Qualidade',
  embalagem: 'Embalagem',
  concluida: 'Concluída',
  cancelada: 'Cancelada',
  pendente: 'Pendente',
  em_producao: 'Em produção',
};

export const PRIORIDADE_OP_LABEL: Record<PrioridadeOp, string> = {
  baixa: 'Baixa',
  normal: 'Normal',
  alta: 'Alta',
  urgente: 'Urgente',
};

export interface OrdemRequisito {
  id?: number;
  ordem_id?: number;
  materia_prima_id: number;
  quantidade_unitaria?: number;
  quantidade_total?: number;
  quantidade?: number;
  unidade?: string | null;
  movimento_id?: number | null;
  nome?: string;
  codigo?: string | null;
  estoque_disponivel?: number;
  suficiente?: boolean;
}

export interface DistribuicaoOp {
  variante_id: number;
  cor: string;
  tamanho: string;
  quantidade: number;
}

export interface OrdemProducao {
  id: number;
  codigo: string | null;
  cliente: string;
  produto: string;
  tamanho: string;
  quantidade: number;
  status: Status;
  prioridade: PrioridadeOp;
  data_prevista: string | null;
  observacoes: string | null;
  responsavel: string | null;
  cliente_id: number | null;
  produto_id: number | null;
  variante_id: number | null;
  referencia: string | null;
  valor_costura: number | null;
  criado_em: string;
  atualizado_em: string | null;
  requisitos?: OrdemRequisito[];
  distribuicao?: DistribuicaoOp[];
}

export interface NovaOrdem {
  cliente?: string;
  produto?: string;
  tamanho?: string;
  quantidade: number;
  status?: Status;
  cliente_id?: number;
  produto_id?: number;
  variante_id?: number;
  codigo?: string;
  prioridade?: PrioridadeOp;
  data_prevista?: string;
  observacoes?: string;
  responsavel?: string;
  requisitos?: Array<{ materia_prima_id: number; quantidade: number }>;
  valor_costura?: number | null;
  distribuicao?: Array<{ variante_id: number; quantidade: number }>;
}

export interface ListaOrdens {
  data: OrdemProducao[];
  pagina: number;
  por_pagina: number;
  total: number;
  total_paginas: number;
}

export interface FiltrosOrdens {
  q?: string;
  status?: string;
  prioridade?: string;
  pagina?: number;
  por_pagina?: number;
}

async function parseError(res: Response): Promise<never> {
  let mensagem = `Erro ${res.status}`;
  try {
    const body = await res.json();
    if (body?.erro) mensagem = body.erro;
  } catch {
    // resposta sem corpo JSON
  }
  throw new Error(mensagem);
}

function apiFetch(input: string, init: RequestInit = {}) {
  return fetch(input, { ...init, credentials: 'include' });
}

export async function listarOrdens(): Promise<OrdemProducao[]> {
  const res = await apiFetch('/api/ordens');
  if (!res.ok) return parseError(res);
  return res.json();
}

export async function listarOrdensPaginado(
  filtros: FiltrosOrdens = {},
): Promise<ListaOrdens> {
  const params = new URLSearchParams();
  if (filtros.q) params.set('q', filtros.q);
  if (filtros.status) params.set('status', filtros.status);
  if (filtros.prioridade) params.set('prioridade', filtros.prioridade);
  if (filtros.pagina) params.set('pagina', String(filtros.pagina));
  if (filtros.por_pagina) params.set('por_pagina', String(filtros.por_pagina));
  const res = await apiFetch(`/api/ordens?${params.toString()}`);
  if (!res.ok) return parseError(res);
  return res.json();
}

export async function obterOrdem(id: number): Promise<OrdemProducao> {
  const res = await apiFetch(`/api/ordens/${id}`);
  if (!res.ok) return parseError(res);
  return res.json();
}

export async function criarOrdem(ordem: NovaOrdem): Promise<OrdemProducao> {
  const res = await apiFetch('/api/ordens', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(ordem),
  });
  if (!res.ok) return parseError(res);
  return res.json();
}

export async function atualizarOrdem(
  id: number,
  dados: Partial<NovaOrdem>,
): Promise<OrdemProducao> {
  const res = await apiFetch(`/api/ordens/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(dados),
  });
  if (!res.ok) return parseError(res);
  return res.json();
}

export async function atualizarStatus(
  id: number,
  status: Status,
): Promise<OrdemProducao> {
  return atualizarOrdem(id, { status });
}

export async function removerOrdem(id: number): Promise<void> {
  const res = await apiFetch(`/api/ordens/${id}`, { method: 'DELETE' });
  if (!res.ok && res.status !== 204) return parseError(res);
}

export const STATUS_PEDIDO = [
  'orcamento',
  'aberto',
  'confirmado',
  'em_producao',
  'pronto',
  'faturado',
  'entregue',
  'cancelado',
] as const;
export type StatusPedido = (typeof STATUS_PEDIDO)[number];
export const STATUS_PEDIDO_LABEL: Record<StatusPedido, string> = {
  orcamento: 'Orçamento',
  aberto: 'Aberto',
  confirmado: 'Confirmado',
  em_producao: 'Em produção',
  pronto: 'Pronto',
  faturado: 'Faturado',
  entregue: 'Entregue',
  cancelado: 'Cancelado',
};

export interface PedidoItemVenda {
  id: number;
  pedido_id: number;
  produto_id: number;
  variante_id: number | null;
  quantidade: number;
  preco_unitario: number;
  desconto: number;
  total: number;
  quantidade_reservada: number;
  produto?: string | null;
  sku?: string | null;
  cor?: string | null;
  tamanho?: string | null;
  ordem_id?: number | null;
  ordem_codigo?: string | null;
  ordem_status?: string | null;
}

export interface PedidoVenda {
  id: number;
  codigo: string | null;
  cliente_id: number;
  data_pedido: string;
  data_prevista: string | null;
  status: StatusPedido;
  prioridade: PrioridadeOp;
  observacoes: string | null;
  subtotal: number;
  desconto: number;
  frete: number;
  total: number;
  criado_em: string;
  atualizado_em: string;
  cliente?: string;
  produtos?: string | null;
  quantidade?: number;
  itens?: PedidoItemVenda[];
  ordens?: Array<{
    id: number;
    codigo: string | null;
    status: string;
    produto: string;
    quantidade: number;
    pedido_item_id: number | null;
  }>;
  financeiro?: {
    id: number;
    status: string;
    valor: number;
    vencimento: string | null;
    descricao: string;
  } | null;
  ops_geradas?: Array<{ id: number; codigo: string }>;
}

export interface PedidoResumo {
  total: number;
  abertos: number;
  confirmados: number;
  em_producao: number;
  prontos: number;
  faturados: number;
  entregues: number;
  atrasados: number;
  total_vendido: number;
}

export type PedidoPayload = {
  cliente_id: number;
  data_pedido?: string;
  data_prevista?: string;
  status?: StatusPedido;
  prioridade?: PrioridadeOp;
  observacoes?: string;
  desconto?: number;
  frete?: number;
  itens?: Array<{
    produto_id: number;
    variante_id?: number;
    quantidade: number;
    preco_unitario: number;
    desconto?: number;
  }>;
};

export async function listarPedidos(
  filtros: {
    q?: string;
    status?: string;
    prioridade?: string;
    cliente_id?: number;
    produto_id?: number;
    de?: string;
    ate?: string;
    pagina?: number;
    por_pagina?: number;
  } = {},
): Promise<ListaPadrao<PedidoVenda> & { totais: { valor: number; quantidade: number } }> {
  const params = new URLSearchParams();
  Object.entries(filtros).forEach(([k, v]) => {
    if (v !== undefined && v !== '') params.set(k, String(v));
  });
  const res = await apiFetch(`/api/pedidos?${params.toString()}`);
  if (!res.ok) return parseError(res);
  return res.json();
}

export async function obterResumoPedidos(filtros: { de?: string; ate?: string } = {}): Promise<PedidoResumo> {
  const params = new URLSearchParams();
  if (filtros.de) params.set('de', filtros.de);
  if (filtros.ate) params.set('ate', filtros.ate);
  const res = await apiFetch(`/api/pedidos/resumo?${params.toString()}`);
  if (!res.ok) return parseError(res);
  return res.json();
}

export async function obterPedido(id: number): Promise<PedidoVenda> {
  const res = await apiFetch(`/api/pedidos/${id}`);
  if (!res.ok) return parseError(res);
  return res.json();
}

export async function criarPedido(dados: PedidoPayload): Promise<PedidoVenda> {
  const res = await apiFetch('/api/pedidos', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(dados),
  });
  if (!res.ok) return parseError(res);
  return res.json();
}

export async function atualizarPedido(
  id: number,
  dados: Partial<PedidoPayload> & { status?: StatusPedido },
): Promise<PedidoVenda> {
  const res = await apiFetch(`/api/pedidos/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(dados),
  });
  if (!res.ok) return parseError(res);
  return res.json();
}

export async function gerarOpPedido(
  id: number,
  body: { item_ids?: number[]; forcar?: boolean } = {},
): Promise<PedidoVenda> {
  const res = await apiFetch(`/api/pedidos/${id}/gerar-op`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) return parseError(res);
  return res.json();
}

export async function gerarFinanceiroPedido(
  id: number,
  vencimento?: string,
): Promise<PedidoVenda> {
  const res = await apiFetch(`/api/pedidos/${id}/financeiro`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(vencimento ? { vencimento } : {}),
  });
  if (!res.ok) return parseError(res);
  return res.json();
}

export async function removerPedido(id: number): Promise<void> {
  const res = await apiFetch(`/api/pedidos/${id}`, { method: 'DELETE' });
  if (!res.ok && res.status !== 204) return parseError(res);
}

export async function obterFichaTecnica(
  produtoId: number,
  varianteId?: number,
): Promise<{
  produto_id: number;
  variante_id: number | null;
  itens: Array<{
    materia_prima_id: number;
    quantidade: number;
    unidade: string | null;
    nome: string;
    codigo: string | null;
  }>;
}> {
  const params = new URLSearchParams();
  params.set('produto_id', String(produtoId));
  if (varianteId) params.set('variante_id', String(varianteId));
  const res = await apiFetch(`/api/ordens/ficha-tecnica?${params.toString()}`);
  if (!res.ok) return parseError(res);
  return res.json();
}

export const STATUS_CLIENTE = ['ativo', 'inativo'] as const;
export type StatusCliente = (typeof STATUS_CLIENTE)[number];

export const UFS_BRASIL = [
  'AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA',
  'MT', 'MS', 'MG', 'PA', 'PB', 'PR', 'PE', 'PI', 'RJ', 'RN',
  'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO',
] as const;

export interface Cliente {
  id: number;
  nome: string;
  cpf_cnpj: string | null;
  contato: string | null;
  telefone: string | null;
  whatsapp: string | null;
  email: string | null;
  endereco: string | null;
  cidade: string | null;
  estado: string | null;
  cep: string | null;
  condicao_pagamento: string | null;
  limite_credito: number;
  status: StatusCliente;
  observacoes: string | null;
  criado_em: string;
  atualizado_em: string;
}

export type ClientePayload = {
  nome: string;
  cpf_cnpj?: string;
  contato?: string;
  telefone?: string;
  whatsapp?: string;
  email?: string;
  endereco?: string;
  cidade?: string;
  estado?: string;
  cep?: string;
  condicao_pagamento?: string;
  limite_credito?: number;
  status?: StatusCliente;
  observacoes?: string;
};

export interface ListaClientes {
  data: Cliente[];
  pagina: number;
  por_pagina: number;
  total: number;
  total_paginas: number;
}

export interface FiltrosClientes {
  q?: string;
  status?: StatusCliente | '';
  estado?: string;
  cidade?: string;
  pagina?: number;
  por_pagina?: number;
}

export async function listarClientes(
  filtros: FiltrosClientes = {},
): Promise<ListaClientes> {
  const params = new URLSearchParams();
  if (filtros.q) params.set('q', filtros.q);
  if (filtros.status) params.set('status', filtros.status);
  if (filtros.estado) params.set('estado', filtros.estado);
  if (filtros.cidade) params.set('cidade', filtros.cidade);
  if (filtros.pagina) params.set('pagina', String(filtros.pagina));
  if (filtros.por_pagina) params.set('por_pagina', String(filtros.por_pagina));
  const res = await apiFetch(`/api/clientes?${params.toString()}`);
  if (!res.ok) return parseError(res);
  return res.json();
}

export async function obterCliente(id: number): Promise<Cliente> {
  const res = await apiFetch(`/api/clientes/${id}`);
  if (!res.ok) return parseError(res);
  return res.json();
}

export async function criarCliente(dados: ClientePayload): Promise<Cliente> {
  const res = await apiFetch('/api/clientes', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(dados),
  });
  if (!res.ok) return parseError(res);
  return res.json();
}

export async function atualizarCliente(
  id: number,
  dados: Partial<ClientePayload>,
): Promise<Cliente> {
  const res = await apiFetch(`/api/clientes/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(dados),
  });
  if (!res.ok) return parseError(res);
  return res.json();
}

export async function atualizarStatusCliente(
  id: number,
  status: StatusCliente,
): Promise<Cliente> {
  const res = await apiFetch(`/api/clientes/${id}/status`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status }),
  });
  if (!res.ok) return parseError(res);
  return res.json();
}

export async function removerCliente(id: number): Promise<void> {
  const res = await apiFetch(`/api/clientes/${id}`, { method: 'DELETE' });
  if (!res.ok && res.status !== 204) return parseError(res);
}

export const STATUS_PRODUTO = ['ativo', 'inativo'] as const;
export type StatusProduto = (typeof STATUS_PRODUTO)[number];

export const GENEROS_PRODUTO = [
  'masculino',
  'feminino',
  'unissex',
  'infantil',
] as const;
export type GeneroProduto = (typeof GENEROS_PRODUTO)[number];

export const UNIDADES_PRODUTO = ['UN', 'PC', 'PAR', 'KG', 'MT', 'CX'] as const;

export interface ProdutoVariante {
  id: number;
  produto_id: number;
  cor: string;
  tamanho: string;
  sku: string;
  codigo_barras: string | null;
  preco_venda: number | null;
  preco_atacado: number | null;
  preco_custo: number | null;
  estoque_minimo: number | null;
  status: StatusProduto;
  criado_em: string;
  atualizado_em: string;
}

export interface DadosProducao {
  valor_costura: number | null;
  consumo_tecido: number | null;
  unidade_consumo: string | null;
  observacoes_corte: string | null;
  processos: string | null;
  outros_custos: string | null;
}

export interface Produto {
  id: number;
  sku: string | null;
  referencia: string | null;
  valor_costura: number | null;
  dados_producao?: DadosProducao;
  nome: string;
  descricao: string | null;
  categoria: string | null;
  subcategoria: string | null;
  marca: string | null;
  genero: string | null;
  colecao: string | null;
  cores: string[];
  tamanhos: string[];
  codigo_barras: string | null;
  unidade: string;
  preco_venda: number;
  preco_atacado: number;
  preco_custo: number;
  status: StatusProduto;
  estoque_minimo: number;
  imagem: string | null;
  observacoes: string | null;
  criado_em: string;
  atualizado_em: string;
  variantes: ProdutoVariante[];
}

export type ProdutoPayload = {
  sku?: string;
  referencia?: string;
  valor_costura?: number | null;
  nome: string;
  descricao?: string;
  categoria?: string;
  subcategoria?: string;
  marca?: string;
  genero?: string;
  colecao?: string;
  cores?: string[];
  tamanhos?: string[];
  codigo_barras?: string;
  unidade?: string;
  preco_venda?: number;
  preco_atacado?: number;
  preco_custo?: number;
  status?: StatusProduto;
  estoque_minimo?: number;
  imagem?: string;
  observacoes?: string;
  variantes?: Array<{
    id?: number;
    cor: string;
    tamanho: string;
    sku?: string;
    codigo_barras?: string;
    status?: StatusProduto;
  }>;
};

export interface ListaProdutos {
  data: Produto[];
  pagina: number;
  por_pagina: number;
  total: number;
  total_paginas: number;
}

export interface FiltrosProdutos {
  q?: string;
  status?: StatusProduto | '';
  categoria?: string;
  marca?: string;
  genero?: string;
  colecao?: string;
  pagina?: number;
  por_pagina?: number;
}

export async function listarProdutos(
  filtros: FiltrosProdutos = {},
): Promise<ListaProdutos> {
  const params = new URLSearchParams();
  if (filtros.q) params.set('q', filtros.q);
  if (filtros.status) params.set('status', filtros.status);
  if (filtros.categoria) params.set('categoria', filtros.categoria);
  if (filtros.marca) params.set('marca', filtros.marca);
  if (filtros.genero) params.set('genero', filtros.genero);
  if (filtros.colecao) params.set('colecao', filtros.colecao);
  if (filtros.pagina) params.set('pagina', String(filtros.pagina));
  if (filtros.por_pagina) params.set('por_pagina', String(filtros.por_pagina));
  const res = await apiFetch(`/api/produtos?${params.toString()}`);
  if (!res.ok) return parseError(res);
  return res.json();
}

export async function obterProduto(id: number): Promise<Produto> {
  const res = await apiFetch(`/api/produtos/${id}`);
  if (!res.ok) return parseError(res);
  return res.json();
}

export async function criarProduto(dados: ProdutoPayload): Promise<Produto> {
  const res = await apiFetch('/api/produtos', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(dados),
  });
  if (!res.ok) return parseError(res);
  return res.json();
}

export async function atualizarProduto(
  id: number,
  dados: Partial<ProdutoPayload>,
): Promise<Produto> {
  const res = await apiFetch(`/api/produtos/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(dados),
  });
  if (!res.ok) return parseError(res);
  return res.json();
}

export async function atualizarStatusProduto(
  id: number,
  status: StatusProduto,
): Promise<Produto> {
  const res = await apiFetch(`/api/produtos/${id}/status`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status }),
  });
  if (!res.ok) return parseError(res);
  return res.json();
}

export async function removerProduto(id: number): Promise<void> {
  const res = await apiFetch(`/api/produtos/${id}`, { method: 'DELETE' });
  if (!res.ok && res.status !== 204) return parseError(res);
}

export async function atualizarVarianteProduto(
  produtoId: number,
  varianteId: number,
  dados: Partial<ProdutoVariante>,
): Promise<Produto> {
  const res = await apiFetch(`/api/produtos/${produtoId}/variantes/${varianteId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(dados),
  });
  if (!res.ok) return parseError(res);
  return res.json();
}

export async function removerVarianteProduto(
  produtoId: number,
  varianteId: number,
): Promise<void> {
  const res = await apiFetch(`/api/produtos/${produtoId}/variantes/${varianteId}`, {
    method: 'DELETE',
  });
  if (!res.ok && res.status !== 204) return parseError(res);
}

export const STATUS_MATERIA = ['ativo', 'inativo'] as const;
export type StatusMateria = (typeof STATUS_MATERIA)[number];

export const TIPOS_MATERIA = [
  'tecido',
  'linha',
  'aviamento',
  'forro',
  'etiqueta',
  'botao',
  'ziper',
  'elastico',
  'outro',
] as const;
export type TipoMateria = (typeof TIPOS_MATERIA)[number];

export const UNIDADES_MATERIA = ['UN', 'PC', 'MT', 'KG', 'ROLO', 'CX'] as const;

export const TIPO_MATERIA_LABEL: Record<TipoMateria, string> = {
  tecido: 'Tecido',
  linha: 'Linha',
  aviamento: 'Aviamento',
  forro: 'Forro',
  etiqueta: 'Etiqueta',
  botao: 'Botão',
  ziper: 'Zíper',
  elastico: 'Elástico',
  outro: 'Outro',
};

export interface MateriaPrima {
  id: number;
  codigo: string | null;
  nome: string;
  descricao: string | null;
  tipo: TipoMateria;
  categoria: string | null;
  cor: string | null;
  composicao: string | null;
  largura_cm: number | null;
  gramatura: number | null;
  unidade: string;
  custo: number;
  estoque_minimo: number;
  fornecedor: string | null;
  referencia_fornecedor: string | null;
  ncm: string | null;
  status: StatusMateria;
  observacoes: string | null;
  criado_em: string;
  atualizado_em: string;
}

export type MateriaPrimaPayload = {
  codigo?: string;
  nome: string;
  descricao?: string;
  tipo?: TipoMateria;
  categoria?: string;
  cor?: string;
  composicao?: string;
  largura_cm?: number | null;
  gramatura?: number | null;
  unidade?: string;
  custo?: number;
  estoque_minimo?: number;
  fornecedor?: string;
  referencia_fornecedor?: string;
  ncm?: string;
  status?: StatusMateria;
  observacoes?: string;
};

export interface ListaMaterias {
  data: MateriaPrima[];
  pagina: number;
  por_pagina: number;
  total: number;
  total_paginas: number;
}

export interface FiltrosMaterias {
  q?: string;
  status?: StatusMateria | '';
  tipo?: string;
  categoria?: string;
  unidade?: string;
  pagina?: number;
  por_pagina?: number;
}

export async function listarMateriasPrimas(
  filtros: FiltrosMaterias = {},
): Promise<ListaMaterias> {
  const params = new URLSearchParams();
  if (filtros.q) params.set('q', filtros.q);
  if (filtros.status) params.set('status', filtros.status);
  if (filtros.tipo) params.set('tipo', filtros.tipo);
  if (filtros.categoria) params.set('categoria', filtros.categoria);
  if (filtros.unidade) params.set('unidade', filtros.unidade);
  if (filtros.pagina) params.set('pagina', String(filtros.pagina));
  if (filtros.por_pagina) params.set('por_pagina', String(filtros.por_pagina));
  const res = await apiFetch(`/api/materias-primas?${params.toString()}`);
  if (!res.ok) return parseError(res);
  return res.json();
}

export async function obterMateriaPrima(id: number): Promise<MateriaPrima> {
  const res = await apiFetch(`/api/materias-primas/${id}`);
  if (!res.ok) return parseError(res);
  return res.json();
}

export async function criarMateriaPrima(
  dados: MateriaPrimaPayload,
): Promise<MateriaPrima> {
  const res = await apiFetch('/api/materias-primas', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(dados),
  });
  if (!res.ok) return parseError(res);
  return res.json();
}

export async function atualizarMateriaPrima(
  id: number,
  dados: Partial<MateriaPrimaPayload>,
): Promise<MateriaPrima> {
  const res = await apiFetch(`/api/materias-primas/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(dados),
  });
  if (!res.ok) return parseError(res);
  return res.json();
}

export async function atualizarStatusMateriaPrima(
  id: number,
  status: StatusMateria,
): Promise<MateriaPrima> {
  const res = await apiFetch(`/api/materias-primas/${id}/status`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status }),
  });
  if (!res.ok) return parseError(res);
  return res.json();
}

export async function removerMateriaPrima(id: number): Promise<void> {
  const res = await apiFetch(`/api/materias-primas/${id}`, { method: 'DELETE' });
  if (!res.ok && res.status !== 204) return parseError(res);
}

export const UNIDADES_TECIDO = ['KG', 'METRO'] as const;
export type UnidadeTecido = (typeof UNIDADES_TECIDO)[number];

export interface TecidoCategoria {
  id: number;
  nome: string;
  criado_em?: string;
}

export interface Tecido {
  id: number;
  nome: string;
  categoria: string | null;
  unidade: UnidadeTecido;
  unidade_custo: string;
  largura_cm: number | null;
  gramatura: number | null;
  custo: number;
  fornecedor: string | null;
  cor: string | null;
  estoque_minimo: number;
  estoque: number;
  status: StatusMateria;
  empresa_id: number;
  criado_em: string;
  atualizado_em: string;
}

export interface TecidoPayload {
  nome: string;
  categoria: string;
  unidade: UnidadeTecido;
  largura_cm?: number | null;
  gramatura?: number | null;
  custo: number;
  fornecedor?: string;
  cor?: string;
  estoque_inicial?: number;
  estoque_minimo?: number;
  status?: StatusMateria;
}

export interface TecidoMovimento {
  id: number;
  tipo: 'entrada' | 'saida' | 'ajuste';
  quantidade: number;
  unidade: string | null;
  custo: number | null;
  saldo_anterior: number;
  saldo_posterior: number;
  motivo: string | null;
  usuario_id: number | null;
  usuario_nome: string | null;
  referencia_tipo: string | null;
  referencia_id: number | null;
  criado_em: string;
}

export async function listarCategoriasTecido(): Promise<TecidoCategoria[]> {
  const res = await apiFetch('/api/tecidos/categorias');
  if (!res.ok) return parseError(res);
  const body = (await res.json()) as { data: TecidoCategoria[] };
  return body.data;
}

export async function criarCategoriaTecido(nome: string): Promise<TecidoCategoria> {
  const res = await apiFetch('/api/tecidos/categorias', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ nome }),
  });
  if (!res.ok) return parseError(res);
  return res.json();
}

export async function listarTecidos(params: {
  q?: string;
  pagina?: number;
  por_pagina?: number;
  categoria?: string;
  unidade?: string;
  status?: string;
} = {}): Promise<{ data: Tecido[]; total: number; pagina: number; total_paginas: number }> {
  const query = new URLSearchParams();
  if (params.q) query.set('q', params.q);
  if (params.pagina) query.set('pagina', String(params.pagina));
  if (params.por_pagina) query.set('por_pagina', String(params.por_pagina));
  if (params.categoria) query.set('categoria', params.categoria);
  if (params.unidade) query.set('unidade', params.unidade);
  if (params.status) query.set('status', params.status);
  const res = await apiFetch(`/api/tecidos?${query.toString()}`);
  if (!res.ok) return parseError(res);
  return res.json();
}

export async function criarTecido(dados: TecidoPayload): Promise<Tecido> {
  const res = await apiFetch('/api/tecidos', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(dados),
  });
  if (!res.ok) return parseError(res);
  return res.json();
}

export async function atualizarTecido(
  id: number,
  dados: Partial<Omit<TecidoPayload, 'estoque_inicial'>>,
): Promise<Tecido> {
  const res = await apiFetch(`/api/tecidos/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(dados),
  });
  if (!res.ok) return parseError(res);
  return res.json();
}

export async function atualizarStatusTecido(id: number, status: StatusMateria): Promise<Tecido> {
  const res = await apiFetch(`/api/tecidos/${id}/status`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status }),
  });
  if (!res.ok) return parseError(res);
  return res.json();
}

export async function listarMovimentosTecido(id: number): Promise<TecidoMovimento[]> {
  const res = await apiFetch(`/api/tecidos/${id}/movimentos`);
  if (!res.ok) return parseError(res);
  const body = (await res.json()) as { data: TecidoMovimento[] };
  return body.data;
}

export async function movimentarTecido(
  id: number,
  dados: {
    tipo: 'entrada' | 'saida' | 'ajuste';
    quantidade: number;
    unidade: UnidadeTecido;
    custo?: number;
    motivo?: string;
  },
): Promise<{ tecido: Tecido; movimento: TecidoMovimento }> {
  const res = await apiFetch(`/api/tecidos/${id}/movimentos`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(dados),
  });
  if (!res.ok) return parseError(res);
  return res.json();
}

export type StatusEnfesto = 'pendente' | 'em_enfesto' | 'finalizado' | 'cancelado';

export interface Enfesto {
  id: number;
  ordem_id: number;
  produto_id: number | null;
  referencia: string | null;
  produto_nome: string | null;
  cor: string;
  quantidade_pecas: number;
  tecido_id: number | null;
  tecido_nome: string | null;
  folhas: number | null;
  comprimento: number | null;
  metragem: number | null;
  peso: number | null;
  observacoes: string | null;
  status: StatusEnfesto;
  unidade: string | null;
  quantidade_consumida: number | null;
  custo_unitario: number | null;
  custo_total: number | null;
  saldo_anterior: number | null;
  saldo_posterior: number | null;
  movimento_id: number | null;
  usuario_id: number | null;
  usuario_nome: string | null;
  finalizado_em: string | null;
  criado_em: string;
}

export interface CorEnfesto {
  cor: string;
  quantidade_pecas: number;
  tamanhos: Array<{ tamanho: string; quantidade: number }>;
  grade_persistida: boolean;
  status: StatusEnfesto;
  enfesto: Enfesto | null;
}

export async function listarEnfestoOrdem(ordemId: number): Promise<{
  ordem: { id: number; codigo: string | null; produto: string; referencia: string | null; quantidade: number };
  cores: CorEnfesto[];
}> {
  const res = await apiFetch(`/api/enfesto?ordem_id=${ordemId}`);
  if (!res.ok) return parseError(res);
  return res.json();
}

export async function abrirEnfesto(ordemId: number, cor: string): Promise<Enfesto> {
  const res = await apiFetch('/api/enfesto', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ordem_id: ordemId, cor }),
  });
  if (!res.ok) return parseError(res);
  return res.json();
}

export async function finalizarEnfesto(
  id: number,
  dados: {
    tecido_id: number;
    folhas: number;
    comprimento: number;
    metragem?: number | null;
    peso?: number | null;
    observacoes?: string;
    unidade: UnidadeTecido;
  },
): Promise<Enfesto> {
  const res = await apiFetch(`/api/enfesto/${id}/finalizar`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(dados),
  });
  if (!res.ok) return parseError(res);
  return res.json();
}

export async function cancelarEnfesto(id: number): Promise<Enfesto> {
  const res = await apiFetch(`/api/enfesto/${id}/cancelar`, { method: 'POST' });
  if (!res.ok) return parseError(res);
  return res.json();
}

export const TIPOS_MOVIMENTO = ['entrada', 'saida', 'ajuste'] as const;
export type TipoMovimento = (typeof TIPOS_MOVIMENTO)[number];

export const TIPO_MOVIMENTO_LABEL: Record<TipoMovimento, string> = {
  entrada: 'Entrada',
  saida: 'Saída',
  ajuste: 'Ajuste',
};

export interface EstoqueSaldo {
  id: number;
  tipo: 'variante' | 'produto' | 'materia';
  produto_id: number | null;
  variante_id: number | null;
  materia_prima_id: number | null;
  quantidade: number;
  criado_em: string;
  atualizado_em: string;
  nome: string;
  codigo: string | null;
  detalhe: string | null;
  unidade: string;
  estoque_minimo: number;
  abaixo_minimo: boolean;
  movimentos?: EstoqueMovimento[];
}

export interface EstoqueMovimento {
  id: number;
  saldo_id: number;
  tipo: TipoMovimento;
  quantidade: number;
  saldo_anterior: number;
  saldo_posterior: number;
  motivo: string | null;
  observacoes: string | null;
  produto_id: number | null;
  variante_id: number | null;
  materia_prima_id: number | null;
  criado_em: string;
  nome?: string;
  codigo?: string | null;
}

export interface ListaEstoque {
  data: EstoqueSaldo[];
  pagina: number;
  por_pagina: number;
  total: number;
  total_paginas: number;
}

export interface ListaMovimentos {
  data: EstoqueMovimento[];
  pagina: number;
  por_pagina: number;
  total: number;
  total_paginas: number;
}

export interface FiltrosEstoque {
  q?: string;
  tipo?: string;
  abaixo_minimo?: boolean;
  pagina?: number;
  por_pagina?: number;
}

export interface NovoMovimento {
  tipo: TipoMovimento;
  quantidade: number;
  variante_id?: number;
  produto_id?: number;
  materia_prima_id?: number;
  motivo?: string;
  observacoes?: string;
}

export async function listarEstoque(
  filtros: FiltrosEstoque = {},
): Promise<ListaEstoque> {
  const params = new URLSearchParams();
  if (filtros.q) params.set('q', filtros.q);
  if (filtros.tipo) params.set('tipo', filtros.tipo);
  if (filtros.abaixo_minimo) params.set('abaixo_minimo', 'true');
  if (filtros.pagina) params.set('pagina', String(filtros.pagina));
  if (filtros.por_pagina) params.set('por_pagina', String(filtros.por_pagina));
  const res = await apiFetch(`/api/estoque?${params.toString()}`);
  if (!res.ok) return parseError(res);
  return res.json();
}

export async function obterEstoque(id: number): Promise<EstoqueSaldo> {
  const res = await apiFetch(`/api/estoque/${id}`);
  if (!res.ok) return parseError(res);
  return res.json();
}

export async function listarMovimentosEstoque(
  filtros: {
    q?: string;
    tipo?: string;
    saldo_id?: number;
    pagina?: number;
    por_pagina?: number;
  } = {},
): Promise<ListaMovimentos> {
  const params = new URLSearchParams();
  if (filtros.q) params.set('q', filtros.q);
  if (filtros.tipo) params.set('tipo', filtros.tipo);
  if (filtros.saldo_id) params.set('saldo_id', String(filtros.saldo_id));
  if (filtros.pagina) params.set('pagina', String(filtros.pagina));
  if (filtros.por_pagina) params.set('por_pagina', String(filtros.por_pagina));
  const res = await apiFetch(`/api/estoque/movimentos?${params.toString()}`);
  if (!res.ok) return parseError(res);
  return res.json();
}

export async function criarMovimentoEstoque(
  dados: NovoMovimento,
): Promise<{ movimento: EstoqueMovimento; saldo: EstoqueSaldo }> {
  const res = await apiFetch('/api/estoque/movimentos', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(dados),
  });
  if (!res.ok) return parseError(res);
  return res.json();
}

export const TIPOS_ETAPA = [
  'corte',
  'costura',
  'acabamento',
  'qualidade',
  'embalagem',
] as const;
export type TipoEtapa = (typeof TIPOS_ETAPA)[number];

export const STATUS_ETAPA = [
  'pendente',
  'em_andamento',
  'concluida',
  'cancelada',
] as const;
export type StatusEtapa = (typeof STATUS_ETAPA)[number];

export const TIPO_ETAPA_LABEL: Record<TipoEtapa, string> = {
  corte: 'Corte',
  costura: 'Costura',
  acabamento: 'Acabamento',
  qualidade: 'Controle de qualidade',
  embalagem: 'Embalagem',
};

export const STATUS_ETAPA_LABEL: Record<StatusEtapa, string> = {
  pendente: 'Pendente',
  em_andamento: 'Em andamento',
  concluida: 'Concluída',
  cancelada: 'Cancelada',
};

export interface EtapaProducao {
  id: number;
  ordem_id: number;
  tipo: TipoEtapa;
  sequencia: number;
  status: StatusEtapa;
  responsavel: string | null;
  iniciado_em: string | null;
  finalizado_em: string | null;
  observacoes: string | null;
  criado_em: string;
  atualizado_em: string;
  ordem_codigo: string | null;
  cliente: string;
  produto: string;
  tamanho: string;
  ordem_quantidade: number;
}

export interface ListaEtapas {
  data: EtapaProducao[];
  pagina: number;
  por_pagina: number;
  total: number;
  total_paginas: number;
}

export interface FiltrosEtapas {
  q?: string;
  status?: string;
  tipo?: string;
  ordem_id?: number;
  pagina?: number;
  por_pagina?: number;
}

export async function listarEtapas(
  filtros: FiltrosEtapas = {},
): Promise<ListaEtapas> {
  const params = new URLSearchParams();
  if (filtros.q) params.set('q', filtros.q);
  if (filtros.status) params.set('status', filtros.status);
  if (filtros.tipo) params.set('tipo', filtros.tipo);
  if (filtros.ordem_id) params.set('ordem_id', String(filtros.ordem_id));
  if (filtros.pagina) params.set('pagina', String(filtros.pagina));
  if (filtros.por_pagina) params.set('por_pagina', String(filtros.por_pagina));
  const res = await apiFetch(`/api/etapas?${params.toString()}`);
  if (!res.ok) return parseError(res);
  return res.json();
}

export async function obterEtapa(id: number): Promise<EtapaProducao> {
  const res = await apiFetch(`/api/etapas/${id}`);
  if (!res.ok) return parseError(res);
  return res.json();
}

export async function gerarFluxoEtapas(
  ordemId: number,
  responsavel?: string,
): Promise<{ ordem_id: number; data: EtapaProducao[] }> {
  const res = await apiFetch('/api/etapas/fluxo', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ordem_id: ordemId, responsavel }),
  });
  if (!res.ok) return parseError(res);
  return res.json();
}

export async function atualizarEtapa(
  id: number,
  dados: {
    status?: StatusEtapa;
    responsavel?: string;
    observacoes?: string;
  },
): Promise<EtapaProducao> {
  const res = await apiFetch(`/api/etapas/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(dados),
  });
  if (!res.ok) return parseError(res);
  return res.json();
}

export async function removerEtapa(id: number): Promise<void> {
  const res = await apiFetch(`/api/etapas/${id}`, { method: 'DELETE' });
  if (!res.ok && res.status !== 204) return parseError(res);
}

export const STATUS_COMPRA = [
  'rascunho',
  'aberta',
  'parcial',
  'recebida',
  'cancelada',
] as const;
export type StatusCompra = (typeof STATUS_COMPRA)[number];
export const STATUS_COMPRA_LABEL: Record<StatusCompra, string> = {
  rascunho: 'Rascunho',
  aberta: 'Aberta',
  parcial: 'Parcial',
  recebida: 'Recebida',
  cancelada: 'Cancelada',
};

export interface Fornecedor {
  id: number;
  codigo: string | null;
  nome: string;
  cpf_cnpj: string | null;
  contato: string | null;
  telefone: string | null;
  email: string | null;
  cidade: string | null;
  estado: string | null;
  condicao_pagamento: string | null;
  status: 'ativo' | 'inativo';
}

export interface CompraItem {
  id: number;
  compra_id: number;
  materia_prima_id: number | null;
  produto_id: number | null;
  variante_id: number | null;
  quantidade: number;
  quantidade_recebida: number;
  custo_unitario: number;
  total: number;
  unidade: string | null;
  nome?: string | null;
  codigo?: string | null;
}

export interface PedidoCompra {
  id: number;
  codigo: string | null;
  fornecedor_id: number;
  data_emissao: string;
  data_prevista: string | null;
  status: StatusCompra;
  observacoes: string | null;
  subtotal: number;
  desconto: number;
  frete: number;
  total: number;
  forma_pagamento: string | null;
  condicao_pagamento: string | null;
  vencimento: string | null;
  fornecedor?: string;
  itens?: CompraItem[];
}

export interface ListaPadrao<T> {
  data: T[];
  pagina: number;
  por_pagina: number;
  total: number;
  total_paginas: number;
}

export async function listarFornecedores(
  filtros: { q?: string; status?: string; pagina?: number; por_pagina?: number } = {},
): Promise<ListaPadrao<Fornecedor>> {
  const params = new URLSearchParams();
  if (filtros.q) params.set('q', filtros.q);
  if (filtros.status) params.set('status', filtros.status);
  if (filtros.pagina) params.set('pagina', String(filtros.pagina));
  if (filtros.por_pagina) params.set('por_pagina', String(filtros.por_pagina));
  const res = await apiFetch(`/api/fornecedores?${params.toString()}`);
  if (!res.ok) return parseError(res);
  return res.json();
}

export async function criarFornecedor(dados: {
  nome: string;
  cpf_cnpj?: string;
  contato?: string;
  telefone?: string;
  cidade?: string;
  estado?: string;
  condicao_pagamento?: string;
}): Promise<Fornecedor> {
  const res = await apiFetch('/api/fornecedores', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(dados),
  });
  if (!res.ok) return parseError(res);
  return res.json();
}

export async function listarCompras(
  filtros: {
    q?: string;
    status?: string;
    fornecedor_id?: number;
    de?: string;
    ate?: string;
    pagina?: number;
    por_pagina?: number;
  } = {},
): Promise<ListaPadrao<PedidoCompra>> {
  const params = new URLSearchParams();
  if (filtros.q) params.set('q', filtros.q);
  if (filtros.status) params.set('status', filtros.status);
  if (filtros.fornecedor_id) params.set('fornecedor_id', String(filtros.fornecedor_id));
  if (filtros.de) params.set('de', filtros.de);
  if (filtros.ate) params.set('ate', filtros.ate);
  if (filtros.pagina) params.set('pagina', String(filtros.pagina));
  if (filtros.por_pagina) params.set('por_pagina', String(filtros.por_pagina));
  const res = await apiFetch(`/api/compras?${params.toString()}`);
  if (!res.ok) return parseError(res);
  return res.json();
}

export async function obterCompra(id: number): Promise<PedidoCompra> {
  const res = await apiFetch(`/api/compras/${id}`);
  if (!res.ok) return parseError(res);
  return res.json();
}

export type CompraPayload = {
  fornecedor_id: number;
  data_emissao?: string;
  data_prevista?: string;
  status?: StatusCompra;
  observacoes?: string;
  desconto?: number;
  frete?: number;
  forma_pagamento?: string;
  condicao_pagamento?: string;
  vencimento?: string;
  itens?: Array<{
    materia_prima_id?: number;
    produto_id?: number;
    variante_id?: number;
    quantidade: number;
    custo_unitario: number;
    unidade?: string;
  }>;
};

export async function criarCompra(dados: CompraPayload): Promise<PedidoCompra> {
  const res = await apiFetch('/api/compras', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(dados),
  });
  if (!res.ok) return parseError(res);
  return res.json();
}

export async function atualizarCompra(
  id: number,
  dados: Partial<CompraPayload>,
): Promise<PedidoCompra> {
  const res = await apiFetch(`/api/compras/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(dados),
  });
  if (!res.ok) return parseError(res);
  return res.json();
}

export async function receberCompra(
  id: number,
  itens?: Array<{ item_id: number; quantidade: number }>,
): Promise<PedidoCompra> {
  const res = await apiFetch(`/api/compras/${id}/receber`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(itens ? { itens } : {}),
  });
  if (!res.ok) return parseError(res);
  return res.json();
}

export async function removerCompra(id: number): Promise<void> {
  const res = await apiFetch(`/api/compras/${id}`, { method: 'DELETE' });
  if (!res.ok && res.status !== 204) return parseError(res);
}

export const TIPOS_LANCAMENTO = ['pagar', 'receber'] as const;
export type TipoLancamento = (typeof TIPOS_LANCAMENTO)[number];
export const STATUS_LANCAMENTO = [
  'pendente',
  'pago',
  'recebido',
  'vencido',
  'cancelado',
] as const;
export type StatusLancamento = (typeof STATUS_LANCAMENTO)[number];
export const TIPO_LANCAMENTO_LABEL: Record<TipoLancamento, string> = {
  pagar: 'Contas a pagar',
  receber: 'Contas a receber',
};
export const STATUS_LANCAMENTO_LABEL: Record<StatusLancamento, string> = {
  pendente: 'Pendente',
  pago: 'Pago',
  recebido: 'Recebido',
  vencido: 'Vencido',
  cancelado: 'Cancelado',
};

export interface FinanceiroCategoria {
  id: number;
  nome: string;
  tipo: string;
  status: string;
}

export interface FinanceiroLancamento {
  id: number;
  tipo: TipoLancamento;
  categoria_id: number | null;
  descricao: string;
  valor: number;
  status: StatusLancamento;
  vencimento: string | null;
  data_pagamento: string | null;
  fornecedor_id: number | null;
  cliente_id: number | null;
  compra_id: number | null;
  pedido_id?: number | null;
  observacoes: string | null;
  categoria?: string | null;
  fornecedor?: string | null;
  cliente?: string | null;
  compra_codigo?: string | null;
  pedido_codigo?: string | null;
}

export interface FinanceiroResumo {
  saldo: number;
  contas_pagar: number;
  contas_receber: number;
  vencidos: number;
  previsto: number;
  realizado: number;
  realizado_pagar: number;
  realizado_receber: number;
  fluxo: Array<{ mes: string; entradas: number; saidas: number; saldo: number }>;
  recentes: FinanceiroLancamento[];
}

export async function listarCategoriasFinanceiro(): Promise<{
  data: FinanceiroCategoria[];
  total: number;
}> {
  const res = await apiFetch('/api/financeiro/categorias');
  if (!res.ok) return parseError(res);
  return res.json();
}

export async function obterResumoFinanceiro(filtros: { de?: string; ate?: string } = {}): Promise<FinanceiroResumo> {
  const params = new URLSearchParams();
  if (filtros.de) params.set('de', filtros.de);
  if (filtros.ate) params.set('ate', filtros.ate);
  const res = await apiFetch(`/api/financeiro/resumo?${params.toString()}`);
  if (!res.ok) return parseError(res);
  return res.json();
}

export async function listarLancamentos(
  filtros: {
    q?: string;
    tipo?: string;
    status?: string;
    categoria_id?: number;
    de?: string;
    ate?: string;
    pagina?: number;
    por_pagina?: number;
  } = {},
): Promise<ListaPadrao<FinanceiroLancamento>> {
  const params = new URLSearchParams();
  Object.entries(filtros).forEach(([k, v]) => {
    if (v !== undefined && v !== '') params.set(k, String(v));
  });
  const res = await apiFetch(`/api/financeiro/lancamentos?${params.toString()}`);
  if (!res.ok) return parseError(res);
  return res.json();
}

export async function criarLancamento(dados: {
  tipo: TipoLancamento;
  descricao: string;
  valor: number;
  categoria_id?: number;
  vencimento?: string;
  fornecedor_id?: number;
  cliente_id?: number;
}): Promise<FinanceiroLancamento> {
  const res = await apiFetch('/api/financeiro/lancamentos', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(dados),
  });
  if (!res.ok) return parseError(res);
  return res.json();
}

export async function atualizarLancamento(
  id: number,
  dados: Partial<{ status: StatusLancamento; valor: number; descricao: string }>,
): Promise<FinanceiroLancamento> {
  const res = await apiFetch(`/api/financeiro/lancamentos/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(dados),
  });
  if (!res.ok) return parseError(res);
  return res.json();
}

export async function obterRelatorio(tipo: string, filtros: Record<string, string | number | undefined> = {}) {
  const params = new URLSearchParams();
  Object.entries(filtros).forEach(([k, v]) => {
    if (v !== undefined && v !== '') params.set(k, String(v));
  });
  const res = await apiFetch(`/api/relatorios/${tipo}?${params.toString()}`);
  if (!res.ok) return parseError(res);
  return res.json();
}

export function urlRelatorioCsv(tipo: string, filtros: Record<string, string | undefined> = {}) {
  const params = new URLSearchParams({ formato: 'csv' });
  Object.entries(filtros).forEach(([k, v]) => {
    if (v) params.set(k, v);
  });
  return `/api/relatorios/${tipo}?${params.toString()}`;
}

export const STATUS_EXPEDICAO = ['pronto_envio', 'expedido', 'entregue'] as const;
export type StatusExpedicao = (typeof STATUS_EXPEDICAO)[number];
export const STATUS_EXPEDICAO_LABEL: Record<StatusExpedicao, string> = {
  pronto_envio: 'Pronto para envio',
  expedido: 'Expedido',
  entregue: 'Entregue',
};

export interface ExpedicaoItem {
  pedido_id: number;
  codigo: string | null;
  cliente: string;
  quantidade: number;
  valor: number;
  data_pedido: string;
  data_prevista: string | null;
  pedido_status: StatusPedido;
  expedicao_id: number | null;
  expedicao_status: StatusExpedicao | null;
  status: string;
  data_pronta: string | null;
  data_expedicao: string | null;
  data_entrega: string | null;
  observacoes: string | null;
}

export interface ExpedicaoResumo {
  fila: number;
  prontos_envio: number;
  expedidos: number;
  entregues: number;
}

export async function obterResumoExpedicao(): Promise<ExpedicaoResumo> {
  const res = await apiFetch('/api/expedicao/resumo');
  if (!res.ok) return parseError(res);
  return res.json();
}

export async function listarExpedicao(
  filtros: { q?: string; fila?: string; pagina?: number; por_pagina?: number } = {},
): Promise<ListaPadrao<ExpedicaoItem>> {
  const params = new URLSearchParams();
  Object.entries(filtros).forEach(([k, v]) => {
    if (v !== undefined && v !== '') params.set(k, String(v));
  });
  const res = await apiFetch(`/api/expedicao?${params.toString()}`);
  if (!res.ok) return parseError(res);
  return res.json();
}

export async function marcarProntoEnvio(pedidoId: number): Promise<ExpedicaoItem> {
  const res = await apiFetch(`/api/expedicao/${pedidoId}/pronto-envio`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({}),
  });
  if (!res.ok) return parseError(res);
  return res.json();
}

export async function registrarExpedicao(
  pedidoId: number,
  dados: { data_expedicao?: string; observacoes?: string } = {},
): Promise<ExpedicaoItem> {
  const res = await apiFetch(`/api/expedicao/${pedidoId}/expedir`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(dados),
  });
  if (!res.ok) return parseError(res);
  return res.json();
}

export async function marcarEntrega(
  pedidoId: number,
  dados: { data_entrega?: string } = {},
): Promise<ExpedicaoItem> {
  const res = await apiFetch(`/api/expedicao/${pedidoId}/entregar`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(dados),
  });
  if (!res.ok) return parseError(res);
  return res.json();
}

export const PAPEIS_USUARIO = [
  'proprietario',
  'administrador',
  'financeiro',
  'vendas',
  'estoque',
  'producao',
  'cortador',
] as const;
export type PapelUsuario = (typeof PAPEIS_USUARIO)[number];
export const PAPEIS_CONVITE = [
  'administrador',
  'financeiro',
  'vendas',
  'estoque',
  'producao',
  'cortador',
] as const;
export type PapelConvite = (typeof PAPEIS_CONVITE)[number];

export const MODULOS = [
  'equipe',
  'clientes',
  'produtos',
  'materiais',
  'estoque',
  'pedidos',
  'expedicao',
  'ordens',
  'etapas',
  'enfesto',
  'fornecedores',
  'compras',
  'financeiro',
  'relatorios',
  'assinatura',
] as const;
export type Modulo = (typeof MODULOS)[number];
export type AcaoModulo = 'visualizar' | 'criar' | 'editar' | 'excluir';
export type AcoesModulo = Record<AcaoModulo, boolean>;

export interface PermissoesSessao {
  escrever: boolean;
  equipe: boolean;
  modulos: Record<Modulo, AcoesModulo>;
}

export interface LimitesPlano {
  usuarios: number | null;
  clientes: number | null;
  produtos: number | null;
  materiais: number | null;
  pedidos_mes: number | null;
  ordens_mes: number | null;
}

export type ChaveLimite = keyof LimitesPlano;

export interface UsoLimite {
  atual: number;
  maximo: number | null;
  atingido: boolean;
}

export type UsoPlano = Record<ChaveLimite, UsoLimite>;

export const LIMITE_LABEL: Record<ChaveLimite, string> = {
  usuarios: 'Usuários',
  clientes: 'Clientes',
  produtos: 'Produtos',
  materiais: 'Materiais',
  pedidos_mes: 'Pedidos / mês',
  ordens_mes: 'Ordens / mês',
};

export function limiteAtingido(
  assinatura: AssinaturaEmpresa | undefined,
  chave: ChaveLimite,
): boolean {
  return Boolean(assinatura?.uso?.[chave]?.atingido);
}

export function mensagemLimitePlano(
  assinatura: AssinaturaEmpresa,
  chave: ChaveLimite,
): string | null {
  const item = assinatura.uso?.[chave];
  if (!item?.atingido || item.maximo === null) return null;
  return `Limite do plano ${assinatura.plano.nome} atingido: ${LIMITE_LABEL[chave]} (${item.atual}/${item.maximo}). Faça upgrade do plano para continuar.`;
}

export interface RecursosPlano {
  expedicao: boolean;
  financeiro: boolean;
  relatorios_avancados: boolean;
  api_externa: boolean;
  suporte_prioritario: boolean;
}

export interface PlanoEmpresa {
  codigo: string;
  nome: string;
  descricao: string;
  ordem: number;
  limites: LimitesPlano;
  recursos: RecursosPlano;
  preco_mensal: number | null;
  preco_anual: number | null;
  moeda: string;
  ciclo: string;
}

export interface PoliticaAssinatura {
  leitura: boolean;
  operacional: boolean;
  trocar_plano: boolean;
  permite: string[];
  bloqueia: string[];
  acoes: AcaoAssinatura[];
}

export type StatusAssinatura = 'trial' | 'ativa' | 'past_due' | 'cancelada' | 'expirada';
export type AcaoAssinatura =
  | 'ativar'
  | 'cancelar'
  | 'regularizar'
  | 'reativar'
  | 'renovar'
  | 'marcar_atraso'
  | 'expirar';

export const STATUS_ASSINATURA_LABEL: Record<StatusAssinatura, string> = {
  trial: 'Período de avaliação',
  ativa: 'Ativa',
  past_due: 'Em atraso',
  cancelada: 'Cancelada',
  expirada: 'Expirada',
};

export const ACAO_ASSINATURA_LABEL: Record<AcaoAssinatura, string> = {
  ativar: 'Ativar assinatura',
  cancelar: 'Cancelar assinatura',
  regularizar: 'Regularizar atraso',
  reativar: 'Reativar assinatura',
  renovar: 'Renovar assinatura',
  marcar_atraso: 'Simular atraso',
  expirar: 'Simular expiração',
};

export interface ComercialAssinatura {
  ciclo: 'mensal' | string;
  moeda: string;
  valor_mensal: number | null;
  preco_anual: number | null;
  gateway: string | null;
  cobranca: 'desativada' | string;
  pronta: boolean;
  cobranca_real?: boolean;
  ambiente?: 'sandbox' | null;
  operacoes: Array<'assinar' | 'upgrade' | 'downgrade' | 'cancelar'>;
}

export interface EventoAssinatura {
  id: number;
  tipo: string;
  tipo_label?: string;
  criado_em: string;
  empresa_id?: number;
  usuario: { id: number | null; nome: string } | null;
  de_plano: string | null;
  para_plano: string | null;
  de_plano_nome?: string | null;
  para_plano_nome?: string | null;
  de_status: string | null;
  para_status: string | null;
  de_status_label?: string | null;
  para_status_label?: string | null;
  ciclo: string;
  moeda: string;
  valor_mensal: number | null;
  cobranca: string;
  gateway: string | null;
  referencia_externa?: string | null;
  imutavel?: boolean;
}

export const EVENTO_ASSINATURA_LABEL: Record<string, string> = {
  criacao: 'Criação da assinatura',
  trial_inicio: 'Início do trial',
  trial_fim: 'Fim do trial',
  assinar: 'Assinatura mensal',
  upgrade: 'Upgrade',
  downgrade: 'Downgrade',
  cancelar: 'Cancelamento',
  reativar: 'Reativação',
  renovar: 'Renovação',
  regularizar: 'Regularização',
  marcar_atraso: 'Atraso',
  expirar: 'Expiração',
  pagamento_confirmado: 'Pagamento confirmado',
  pagamento_pendente: 'Pagamento pendente',
  pagamento_vencido: 'Pagamento vencido',
  pagamento_negado: 'Pagamento negado',
  pagamento_cancelado: 'Pagamento cancelado',
};

export function podeVerHistoricoAssinatura(papel?: string): boolean {
  return papel === 'proprietario' || papel === 'administrador';
}

export function formatarDataHora(valor: string): string {
  const normalizado = valor.replace('T', ' ').slice(0, 19);
  const [data, hora = ''] = normalizado.split(' ');
  const [ano, mes, dia] = data.split('-');
  if (!ano || !mes || !dia) return valor;
  return `${dia}/${mes}/${ano}${hora ? ` ${hora}` : ''}`;
}

export function formatarPrecoMensal(valor: number | null, moeda = 'BRL'): string {
  if (valor === null) return 'Preço sob consulta';
  const [reais, centavos] = valor.toFixed(2).split('.');
  const simbolo = moeda === 'BRL' ? 'R$' : moeda;
  return `${simbolo} ${reais.replace(/\B(?=(\d{3})+(?!\d))/g, '.')},${centavos}/mês`;
}

export interface AssinaturaEmpresa {
  status: StatusAssinatura;
  status_label: string;
  cobranca: 'desativada' | string;
  ciclo: string;
  inicia_em: string;
  renova_em: string | null;
  gateway: string | null;
  asaas_customer_id?: string | null;
  asaas_subscription_id?: string | null;
  payment_provider?: string | null;
  payment_provider_status?: string | null;
  plano: PlanoEmpresa;
  comercial: ComercialAssinatura;
  uso: UsoPlano;
  acesso: {
    leitura: boolean;
    operacional: boolean;
    trocar_plano: boolean;
  };
  politica: PoliticaAssinatura;
}

export function assinaturaOperacional(assinatura: AssinaturaEmpresa | undefined): boolean {
  return Boolean(assinatura?.acesso?.operacional);
}

export interface SessaoAtual {
  usuario: { id: number; nome: string; email: string; papel: PapelUsuario };
  empresa: { id: number; nome: string; status: string };
  assinatura: AssinaturaEmpresa;
  permissoes: PermissoesSessao;
}

export const PAPEL_LABEL: Record<PapelUsuario, string> = {
  proprietario: 'Proprietário',
  administrador: 'Administrador',
  financeiro: 'Financeiro',
  vendas: 'Vendas',
  estoque: 'Estoque',
  producao: 'Produção',
  cortador: 'Cortador',
};

export function temPermissao(
  permissoes: PermissoesSessao | undefined,
  modulo: Modulo | Modulo[],
  acao: AcaoModulo = 'visualizar',
): boolean {
  if (!permissoes?.modulos) return false;
  const lista = Array.isArray(modulo) ? modulo : [modulo];
  return lista.some((item) => permissoes.modulos[item]?.[acao]);
}

export function moduloSomenteLeitura(
  permissoes: PermissoesSessao | undefined,
  modulo: Modulo | Modulo[],
): boolean {
  return temPermissao(permissoes, modulo, 'visualizar') && !temPermissao(permissoes, modulo, 'criar');
}

export interface MembroEmpresa {
  id: number;
  nome: string;
  email: string;
  papel: PapelUsuario;
  status: 'ativo' | 'inativo';
  criado_em: string;
  atualizado_em: string;
}

export interface ConviteEmpresa {
  id: number;
  email: string;
  papel: PapelConvite;
  status: 'pendente' | 'aceito' | 'cancelado' | 'expirado';
  expira_em: string;
  criado_em: string;
  aceito_em: string | null;
  token?: string;
  caminho?: string;
}

export interface ConvitePublico {
  email: string;
  papel: PapelConvite;
  empresa: { id: number; nome: string };
  expira_em: string;
}

export async function obterSessao(): Promise<SessaoAtual | null> {
  const res = await apiFetch('/api/me');
  if (res.status === 401) return null;
  if (!res.ok) return parseError(res);
  return res.json();
}

export async function registrarUsuario(dados: {
  nome: string;
  email: string;
  senha: string;
  empresa?: string;
  convite?: string;
}): Promise<SessaoAtual> {
  const res = await apiFetch('/api/auth/registrar', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(dados),
  });
  if (!res.ok) return parseError(res);
  return res.json();
}

export async function obterConvitePublico(token: string): Promise<ConvitePublico> {
  const res = await apiFetch(`/api/auth/convite/${encodeURIComponent(token)}`);
  if (!res.ok) return parseError(res);
  return res.json();
}

export async function listarMembros(): Promise<{ data: MembroEmpresa[]; total: number }> {
  const res = await apiFetch('/api/membros');
  if (!res.ok) return parseError(res);
  return res.json();
}

export async function atualizarMembro(
  id: number,
  dados: { papel?: PapelConvite; status?: 'ativo' | 'inativo' },
): Promise<MembroEmpresa> {
  const res = await apiFetch(`/api/membros/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(dados),
  });
  if (!res.ok) return parseError(res);
  return res.json();
}

export async function listarConvites(): Promise<{ data: ConviteEmpresa[]; total: number }> {
  const res = await apiFetch('/api/convites');
  if (!res.ok) return parseError(res);
  return res.json();
}

export async function criarConvite(dados: {
  email: string;
  papel: PapelConvite;
}): Promise<ConviteEmpresa> {
  const res = await apiFetch('/api/convites', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(dados),
  });
  if (!res.ok) return parseError(res);
  return res.json();
}

export async function cancelarConvite(id: number): Promise<void> {
  const res = await apiFetch(`/api/convites/${id}`, { method: 'DELETE' });
  if (!res.ok && res.status !== 204) return parseError(res);
}

export async function listarPlanos(): Promise<{
  data: PlanoEmpresa[];
  cobranca: string;
  ciclo: string;
  moeda: string;
  gateway: string | null;
}> {
  const res = await apiFetch('/api/planos');
  if (!res.ok) return parseError(res);
  return res.json();
}

export async function obterAssinatura(): Promise<AssinaturaEmpresa> {
  const res = await apiFetch('/api/assinatura');
  if (!res.ok) return parseError(res);
  return res.json();
}

export async function listarEventosAssinatura(): Promise<{
  data: EventoAssinatura[];
  cobranca: string;
  ciclo: string;
  gateway: string | null;
}> {
  const res = await apiFetch('/api/assinatura/eventos');
  if (!res.ok) return parseError(res);
  return res.json();
}

export async function alterarPlano(codigo: string): Promise<AssinaturaEmpresa> {
  return alterarAssinatura({ plano: codigo });
}

export async function alterarAssinatura(body: {
  plano?: string;
  acao?: AcaoAssinatura;
}): Promise<AssinaturaEmpresa> {
  const res = await apiFetch('/api/assinatura', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) return parseError(res);
  return res.json();
}

export const MEIOS_PAGAMENTO_SANDBOX = ['PIX', 'BOLETO'] as const;
export type MeioPagamentoSandbox = (typeof MEIOS_PAGAMENTO_SANDBOX)[number];

export type EstadoCheckoutPagamento =
  | 'nenhum'
  | 'pendente'
  | 'confirmado'
  | 'falhou'
  | 'cancelada';

export interface CheckoutPagamento {
  confirmado: boolean;
  estado: EstadoCheckoutPagamento;
  mensagem: string;
  ambiente: 'sandbox';
  cobranca_real: false;
  meios?: MeioPagamentoSandbox[];
  plano?: string;
  valor_mensal?: number | null;
  billingType?: MeioPagamentoSandbox | string;
  assinatura?: AssinaturaEmpresa;
}

export interface InicioPagamentoSandbox extends AssinaturaEmpresa {
  sandbox: {
    provedor: string;
    ambiente: 'sandbox' | string;
    customer_id: string;
    subscription_id: string;
    valor_mensal: number;
    plano: string;
    cobranca_real: false;
    billingType?: string;
  };
  checkout: CheckoutPagamento;
}

export function corpoInicioPagamento(
  plano: string,
  billingType: MeioPagamentoSandbox,
): { plano: string; billingType: MeioPagamentoSandbox } {
  return { plano, billingType };
}

export function mensagemErroPagamento(corpo: { erro?: string; codigo?: string } | null): string {
  if (corpo?.codigo === 'gateway_indisponivel') {
    return 'Pagamento de teste indisponível no momento.';
  }
  if (corpo?.codigo === 'gateway_erro') {
    return 'Não foi possível iniciar o pagamento de teste. Tente novamente.';
  }
  const texto = corpo?.erro ?? '';
  if (
    texto &&
    !texto.includes('ASAAS') &&
    !texto.includes('API_KEY') &&
    !texto.includes('access_token')
  ) {
    return texto;
  }
  return 'Não foi possível comunicar com o pagamento de teste. Tente novamente.';
}

export async function iniciarPagamentoSandbox(input: {
  plano: string;
  billingType: MeioPagamentoSandbox;
}): Promise<InicioPagamentoSandbox> {
  const corpo = corpoInicioPagamento(input.plano, input.billingType);
  const res = await apiFetch('/api/assinatura/pagamento', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(corpo),
  });
  if (!res.ok) {
    let parsed: { erro?: string; codigo?: string } | null = null;
    try {
      parsed = (await res.json()) as { erro?: string; codigo?: string };
    } catch {
      parsed = null;
    }
    throw new Error(mensagemErroPagamento(parsed));
  }
  return res.json();
}

export async function obterCheckoutPagamento(): Promise<CheckoutPagamento> {
  const res = await apiFetch('/api/assinatura/pagamento');
  if (!res.ok) return parseError(res);
  return res.json();
}

export async function entrar(dados: { email: string; senha: string }): Promise<SessaoAtual> {
  const res = await apiFetch('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(dados),
  });
  if (!res.ok) return parseError(res);
  return res.json();
}

export async function sair(): Promise<void> {
  const res = await apiFetch('/api/auth/logout', { method: 'POST' });
  if (!res.ok && res.status !== 204) return parseError(res);
}

