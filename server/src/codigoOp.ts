import type { AppDatabase } from './db.js';

export function formatarCodigoOp(numero: number): string {
  return `OP-${String(numero).padStart(2, '0')}`;
}

export function numeroDoCodigoOp(codigo: string | null | undefined): number | null {
  const texto = (codigo ?? '').trim();
  const encontrado = /^OP-(\d+)$/i.exec(texto);
  if (!encontrado) return null;
  const numero = Number(encontrado[1]);
  if (!Number.isInteger(numero) || numero < 1) return null;
  return numero;
}

export function proximoCodigoOp(db: AppDatabase, empresaId: number): string {
  const codigos = db
    .prepare(`SELECT codigo FROM ordens_producao WHERE empresa_id = ?`)
    .all(empresaId) as Array<{ codigo: string | null }>;
  let maior = 0;
  for (const linha of codigos) {
    const numero = numeroDoCodigoOp(linha.codigo);
    if (numero !== null && numero > maior) maior = numero;
  }
  return formatarCodigoOp(maior + 1);
}
