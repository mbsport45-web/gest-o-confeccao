import type { AppDatabase } from './db.js';

const CODIGO_OC = /^(?:OC-)?(\d+)$/i;

export function numeroDeCodigoOc(codigo: string | null | undefined): number | null {
  if (!codigo) return null;
  const encontrado = CODIGO_OC.exec(codigo.trim());
  if (!encontrado) return null;
  const numero = Number(encontrado[1]);
  if (!Number.isInteger(numero) || numero <= 0) return null;
  return numero;
}

export function formatarCodigoOc(numero: number): string {
  return `OC-${String(numero).padStart(2, '0')}`;
}

export function erroUnicoSqlite(err: unknown): boolean {
  return err instanceof Error && /UNIQUE/i.test(err.message);
}

function numeroOcCadastrado(db: AppDatabase, empresaId: number, numero: number): boolean {
  const cadastrados = db
    .prepare('SELECT codigo FROM ordens_corte WHERE empresa_id = ?')
    .all(empresaId) as Array<{ codigo: string }>;
  return cadastrados.some((item) => numeroDeCodigoOc(item.codigo) === numero);
}

export function maiorNumeroOcEmpresa(db: AppDatabase, empresaId: number): number {
  let maior = 0;
  const sequencia = db
    .prepare('SELECT ultimo FROM ordens_corte_sequencia WHERE empresa_id = ?')
    .get(empresaId) as { ultimo: number } | undefined;
  if (sequencia?.ultimo) maior = Math.max(maior, Number(sequencia.ultimo) || 0);

  const cadastrados = db
    .prepare('SELECT codigo FROM ordens_corte WHERE empresa_id = ?')
    .all(empresaId) as Array<{ codigo: string }>;
  for (const item of cadastrados) {
    const numero = numeroDeCodigoOc(item.codigo);
    if (numero) maior = Math.max(maior, numero);
  }
  return maior;
}

export function codigoRascunhoReservadoValido(
  db: AppDatabase,
  empresaId: number,
  codigo: string | null | undefined,
): boolean {
  const numero = numeroDeCodigoOc(codigo);
  if (!numero) return false;
  if (numeroOcCadastrado(db, empresaId, numero)) return false;
  const sequencia = db
    .prepare('SELECT ultimo FROM ordens_corte_sequencia WHERE empresa_id = ?')
    .get(empresaId) as { ultimo: number } | undefined;
  const ultimo = Number(sequencia?.ultimo) || 0;
  if (ultimo > 0) return numero <= ultimo;
  return numero === maiorNumeroOcEmpresa(db, empresaId) + 1;
}

function gravarSequencia(db: AppDatabase, empresaId: number, ultimo: number) {
  db.prepare(
    `INSERT INTO ordens_corte_sequencia (empresa_id, ultimo) VALUES (?, ?)
     ON CONFLICT(empresa_id) DO UPDATE SET ultimo = excluded.ultimo`,
  ).run(empresaId, ultimo);
}

/** Caller must already hold a write lock (immediate transaction). */
export function alocarCodigoOc(
  db: AppDatabase,
  empresaId: number,
  preferido?: string | null,
): string {
  const solicitado = (preferido ?? '').trim();
  const numeroPreferido = numeroDeCodigoOc(solicitado);
  const teto = maiorNumeroOcEmpresa(db, empresaId) + 1;
  if (numeroPreferido && !numeroOcCadastrado(db, empresaId, numeroPreferido) && numeroPreferido <= teto) {
    gravarSequencia(db, empresaId, Math.max(teto - 1, numeroPreferido));
    return formatarCodigoOc(numeroPreferido);
  }

  let numero = maiorNumeroOcEmpresa(db, empresaId);
  while (true) {
    numero += 1;
    if (!numeroOcCadastrado(db, empresaId, numero)) {
      gravarSequencia(db, empresaId, numero);
      return formatarCodigoOc(numero);
    }
  }
}

export function reservarProximoCodigoOc(db: AppDatabase, empresaId: number): string {
  return db.transaction(() => alocarCodigoOc(db, empresaId)).immediate();
}
