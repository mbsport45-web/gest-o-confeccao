import { join } from 'node:path';
import { backupSqlite } from './backupSqlite.js';
import { lerDatabaseUrl } from './conexao.js';
import { lerContagens } from './contagens.js';
import { ordemCopia } from './arquivos.js';
import { copiarSqliteParaPostgres } from './copiar.js';
import Database from 'better-sqlite3';

function argumento(nome: string): string | undefined {
  const indice = process.argv.indexOf(nome);
  if (indice === -1) return undefined;
  return process.argv[indice + 1];
}

function temFlag(nome: string): boolean {
  return process.argv.includes(nome);
}

function caminhoBackup(informado: string | undefined): string {
  if (informado) return informado;
  const carimbo = new Date().toISOString().replace(/[:.]/g, '-');
  return join('data', 'backups', `gestao-confeccao-${carimbo}.sqlite`);
}

async function main(): Promise<void> {
  const origem = argumento('--origem') ?? process.env.DB_PATH ?? 'data/gestao-confeccao.sqlite';
  const backup = caminhoBackup(argumento('--backup'));
  if (temFlag('--somente-backup')) {
    await backupSqlite(origem, backup);
    const db = new Database(backup, { readonly: true, fileMustExist: true });
    try {
      const contagens = lerContagens(db, ordemCopia());
      const total = contagens.reduce((soma, item) => soma + item.linhas, 0);
      process.stdout.write(
        `Backup criado em ${backup}. ${contagens.length} tabelas, ${total} linhas. O SQLite original não foi alterado. A API continua em DB_PATH.\n`,
      );
    } finally {
      db.close();
    }
    return;
  }

  const databaseUrl = lerDatabaseUrl();
  const relatorio = await copiarSqliteParaPostgres({
    origem,
    destinoBackup: backup,
    databaseUrl,
    substituirPostgres: temFlag('--substituir-postgres'),
  });
  const total = relatorio.contagens.reduce((soma, item) => soma + item.linhas, 0);
  process.stdout.write(
    [
      `Backup: ${relatorio.backup}`,
      `Tabelas conferidas: ${relatorio.contagens.length}`,
      `Linhas copiadas: ${total}`,
      `Soma dos saldos: ${relatorio.somaSaldos}`,
      `Soma dos movimentos: ${relatorio.somaMovimentos}`,
      'Divergências: nenhuma',
      'A API continua no SQLite (DB_PATH). DATABASE_URL foi usado só nesta cópia.',
      'Para voltar: não restaure nada. O arquivo original permanece e a API não mudou de banco.',
      'Para desfazer só o PostgreSQL: apague o banco de destino. Não apague o SQLite.',
      '',
    ].join('\n'),
  );
}

main().catch((erro: unknown) => {
  const mensagem = erro instanceof Error ? erro.message : String(erro);
  process.stderr.write(`${mensagem}\n`);
  process.exitCode = 1;
});
