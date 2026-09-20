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

export async function listarOrdens(): Promise<OrdemProducao[]> {
  const res = await fetch('/api/ordens');
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
  const res = await fetch(`/api/ordens?${params.toString()}`);
  if (!res.ok) return parseError(res);
  return res.json();
}

export async function obterOrdem(id: number): Promise<OrdemProducao> {
  const res = await fetch(`/api/ordens/${id}`);
  if (!res.ok) return parseError(res);
  return res.json();
}

export async function criarOrdem(ordem: NovaOrdem): Promise<OrdemProducao> {
  const res = await fetch('/api/ordens', {
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
  const res = await fetch(`/api/ordens/${id}`, {
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
  const res = await fetch(`/api/ordens/${id}`, { method: 'DELETE' });
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
  const res = await fetch(`/api/ordens/ficha-tecnica?${params.toString()}`);
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
  const res = await fetch(`/api/clientes?${params.toString()}`);
  if (!res.ok) return parseError(res);
  return res.json();
}

export async function obterCliente(id: number): Promise<Cliente> {
  const res = await fetch(`/api/clientes/${id}`);
  if (!res.ok) return parseError(res);
  return res.json();
}

export async function criarCliente(dados: ClientePayload): Promise<Cliente> {
  const res = await fetch('/api/clientes', {
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
  const res = await fetch(`/api/clientes/${id}`, {
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
  const res = await fetch(`/api/clientes/${id}/status`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status }),
  });
  if (!res.ok) return parseError(res);
  return res.json();
}

export async function removerCliente(id: number): Promise<void> {
  const res = await fetch(`/api/clientes/${id}`, { method: 'DELETE' });
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
  const res = await fetch(`/api/produtos?${params.toString()}`);
  if (!res.ok) return parseError(res);
  return res.json();
}

export async function obterProduto(id: number): Promise<Produto> {
  const res = await fetch(`/api/produtos/${id}`);
  if (!res.ok) return parseError(res);
  return res.json();
}

export async function criarProduto(dados: ProdutoPayload): Promise<Produto> {
  const res = await fetch('/api/produtos', {
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
  const res = await fetch(`/api/produtos/${id}`, {
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
  const res = await fetch(`/api/produtos/${id}/status`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status }),
  });
  if (!res.ok) return parseError(res);
  return res.json();
}

export async function removerProduto(id: number): Promise<void> {
  const res = await fetch(`/api/produtos/${id}`, { method: 'DELETE' });
  if (!res.ok && res.status !== 204) return parseError(res);
}

export async function atualizarVarianteProduto(
  produtoId: number,
  varianteId: number,
  dados: Partial<ProdutoVariante>,
): Promise<Produto> {
  const res = await fetch(`/api/produtos/${produtoId}/variantes/${varianteId}`, {
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
  const res = await fetch(`/api/produtos/${produtoId}/variantes/${varianteId}`, {
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
  const res = await fetch(`/api/materias-primas?${params.toString()}`);
  if (!res.ok) return parseError(res);
  return res.json();
}

export async function obterMateriaPrima(id: number): Promise<MateriaPrima> {
  const res = await fetch(`/api/materias-primas/${id}`);
  if (!res.ok) return parseError(res);
  return res.json();
}

export async function criarMateriaPrima(
  dados: MateriaPrimaPayload,
): Promise<MateriaPrima> {
  const res = await fetch('/api/materias-primas', {
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
  const res = await fetch(`/api/materias-primas/${id}`, {
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
  const res = await fetch(`/api/materias-primas/${id}/status`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status }),
  });
  if (!res.ok) return parseError(res);
  return res.json();
}

export async function removerMateriaPrima(id: number): Promise<void> {
  const res = await fetch(`/api/materias-primas/${id}`, { method: 'DELETE' });
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
  const res = await fetch(`/api/estoque?${params.toString()}`);
  if (!res.ok) return parseError(res);
  return res.json();
}

export async function obterEstoque(id: number): Promise<EstoqueSaldo> {
  const res = await fetch(`/api/estoque/${id}`);
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
  const res = await fetch(`/api/estoque/movimentos?${params.toString()}`);
  if (!res.ok) return parseError(res);
  return res.json();
}

export async function criarMovimentoEstoque(
  dados: NovoMovimento,
): Promise<{ movimento: EstoqueMovimento; saldo: EstoqueSaldo }> {
  const res = await fetch('/api/estoque/movimentos', {
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
  const res = await fetch(`/api/etapas?${params.toString()}`);
  if (!res.ok) return parseError(res);
  return res.json();
}

export async function obterEtapa(id: number): Promise<EtapaProducao> {
  const res = await fetch(`/api/etapas/${id}`);
  if (!res.ok) return parseError(res);
  return res.json();
}

export async function gerarFluxoEtapas(
  ordemId: number,
  responsavel?: string,
): Promise<{ ordem_id: number; data: EtapaProducao[] }> {
  const res = await fetch('/api/etapas/fluxo', {
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
  const res = await fetch(`/api/etapas/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(dados),
  });
  if (!res.ok) return parseError(res);
  return res.json();
}

export async function removerEtapa(id: number): Promise<void> {
  const res = await fetch(`/api/etapas/${id}`, { method: 'DELETE' });
  if (!res.ok && res.status !== 204) return parseError(res);
}
