import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

export function diretorioMigracoes(): string {
  return fileURLToPath(new URL('../../migrations/postgres/', import.meta.url));
}

export function arquivosSql(): string[] {
  return readdirSync(diretorioMigracoes())
    .filter((nome) => nome.endsWith('.sql'))
    .sort();
}

export function lerSql(arquivo: string): string {
  return readFileSync(join(diretorioMigracoes(), arquivo), 'utf8');
}

export function ordemCopia(): string[] {
  const bruto = readFileSync(join(diretorioMigracoes(), 'ordem-copia.json'), 'utf8');
  const ordem = JSON.parse(bruto) as unknown;
  if (!Array.isArray(ordem) || ordem.some((item) => typeof item !== 'string')) {
    throw new Error('ordem-copia.json está inválido');
  }
  return ordem;
}
