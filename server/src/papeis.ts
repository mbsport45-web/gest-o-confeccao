import type { RequestHandler } from 'express';

export const PAPEIS = ['dono', 'admin', 'operador', 'consulta'] as const;
export type Papel = (typeof PAPEIS)[number];

export const PAPEIS_CONVITE = ['admin', 'operador', 'consulta'] as const;
export type PapelConvite = (typeof PAPEIS_CONVITE)[number];

export const PAPEL_LABEL: Record<Papel, string> = {
  dono: 'Dono',
  admin: 'Administrador',
  operador: 'Operador',
  consulta: 'Consulta',
};

export function isPapel(valor: unknown): valor is Papel {
  return typeof valor === 'string' && (PAPEIS as readonly string[]).includes(valor);
}

export function podeEscrever(papel?: string): boolean {
  return papel === 'dono' || papel === 'admin' || papel === 'operador';
}

export function podeGerenciarEquipe(papel?: string): boolean {
  return papel === 'dono' || papel === 'admin';
}

export function permissoesDoPapel(papel: Papel) {
  return {
    escrever: podeEscrever(papel),
    equipe: podeGerenciarEquipe(papel),
  };
}

export function bloquearConsultaEmEscrita(): RequestHandler {
  return (req, res, next) => {
    if (req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS') {
      return next();
    }
    if (podeEscrever(req.usuario?.papel)) return next();
    return res.status(403).json({ erro: 'Seu perfil é somente leitura' });
  };
}

export function requireGerenciarEquipe(): RequestHandler {
  return (req, res, next) => {
    if (podeGerenciarEquipe(req.usuario?.papel)) return next();
    return res.status(403).json({ erro: 'Sem permissão para gerenciar a equipe' });
  };
}
