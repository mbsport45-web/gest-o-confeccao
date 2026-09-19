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
