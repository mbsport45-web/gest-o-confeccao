import type { Request } from 'express';

export function empresaDaSessao(req: Request): number {
  const id = req.usuario?.empresaId;
  if (typeof id !== 'number' || !Number.isInteger(id) || id < 1) {
    throw new Error('sessão sem empresa');
  }
  return id;
}

export function aplicarEmpresa(
  where: string[],
  params: Record<string, string | number>,
  req: Request,
  coluna = 'empresa_id',
): number {
  const empresaId = empresaDaSessao(req);
  where.unshift(`${coluna} = @empresa_id`);
  params.empresa_id = empresaId;
  return empresaId;
}
