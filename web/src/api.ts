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
  criado_em: string;
  atualizado_em: string | null;
  requisitos?: OrdemRequisito[];
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

export interface Produto {
  id: number;
  sku: string | null;
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

export interface SessaoAtual {
  usuario: { id: number; nome: string; email: string; papel: PapelUsuario };
  empresa: { id: number; nome: string; status: string };
  permissoes: { escrever: boolean; equipe: boolean };
}

export const PAPEIS_USUARIO = ['dono', 'admin', 'operador', 'consulta'] as const;
export type PapelUsuario = (typeof PAPEIS_USUARIO)[number];
export const PAPEIS_CONVITE = ['admin', 'operador', 'consulta'] as const;
export type PapelConvite = (typeof PAPEIS_CONVITE)[number];

export const PAPEL_LABEL: Record<PapelUsuario, string> = {
  dono: 'Dono',
  admin: 'Administrador',
  operador: 'Operador',
  consulta: 'Consulta',
};

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

