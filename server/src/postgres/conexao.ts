import pg from 'pg';

const PREFIXO = /^postgres(ql)?:\/\//;

/**
 * A API em execução não chama esta função. Só o script de cópia usa DATABASE_URL.
 * A senha fica na variável de ambiente, nunca no código.
 */
export function lerDatabaseUrl(env: NodeJS.ProcessEnv = process.env): string {
  const url = env.DATABASE_URL?.trim() ?? '';
  if (!url) {
    throw new Error(
      'DATABASE_URL não está definida. A API continua no SQLite indicado por DB_PATH. Defina DATABASE_URL apenas no ambiente, para o script de cópia.',
    );
  }
  if (!PREFIXO.test(url)) {
    throw new Error('DATABASE_URL deve começar com postgres:// ou postgresql://');
  }
  return url;
}

export function criarPool(databaseUrl: string): pg.Pool {
  return new pg.Pool({ connectionString: databaseUrl, max: 1 });
}
