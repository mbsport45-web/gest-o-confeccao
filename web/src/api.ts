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
