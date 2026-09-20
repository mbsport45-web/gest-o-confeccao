export const STATUS_VALIDOS = [
  'pendente',
  'em_producao',
  'concluida',
  'cancelada',
] as const;

export type Status = (typeof STATUS_VALIDOS)[number];

export interface OrdemProducao {
  id: number;
  cliente: string;
  produto: string;
  tamanho: string;
  quantidade: number;
  status: Status;
  criado_em: string;
}

export interface NovaOrdem {
  cliente: string;
  produto: string;
  tamanho: string;
  quantidade: number;
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

export async function criarOrdem(ordem: NovaOrdem): Promise<OrdemProducao> {
  const res = await fetch('/api/ordens', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(ordem),
  });
  if (!res.ok) return parseError(res);
  return res.json();
}

export async function atualizarStatus(
  id: number,
  status: Status,
): Promise<OrdemProducao> {
  const res = await fetch(`/api/ordens/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status }),
  });
  if (!res.ok) return parseError(res);
  return res.json();
}

export async function removerOrdem(id: number): Promise<void> {
  const res = await fetch(`/api/ordens/${id}`, { method: 'DELETE' });
  if (!res.ok && res.status !== 204) return parseError(res);
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
