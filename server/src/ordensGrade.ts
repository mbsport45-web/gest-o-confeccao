import type { AppDatabase } from './db.js';

export const TAMANHOS_PADRAO = ['P', 'M', 'G', 'GG', 'G1', 'G2', 'G3'] as const;

export type CelulaGrade = {
  cor: string;
  tamanho: string;
  quantidade: number;
};

export type OrdemCorte = {
  id: number;
  empresa_id: number;
  codigo: string;
  ordem_id: number;
  cliente: string;
  produto: string;
  quantidade: number;
  prioridade: string | null;
  data_prevista: string | null;
  responsavel: string | null;
  observacoes: string | null;
  cliente_id: number | null;
  produto_id: number | null;
  criado_em: string;
  grade: CelulaGrade[];
};

function chave(cor: string, tamanho: string): string {
  return `${cor.trim().toLocaleLowerCase('pt-BR')}|${tamanho.trim().toLocaleLowerCase('pt-BR')}`;
}

export function validarGrade(grade: CelulaGrade[], quantidade: number): string | null {
  if (grade.length === 0) return 'Informe a grade de cores e tamanhos';
  const vistas = new Set<string>();
  let soma = 0;
  for (const celula of grade) {
    const cor = celula.cor.trim();
    const tamanho = celula.tamanho.trim();
    if (!cor || !tamanho) return 'Informe a grade de cores e tamanhos';
    if (!Number.isInteger(celula.quantidade) || celula.quantidade < 0) {
      return 'A quantidade de cada combinação deve ser um número inteiro maior ou igual a zero';
    }
    const id = chave(cor, tamanho);
    if (vistas.has(id)) return 'A grade tem combinação de cor e tamanho repetida';
    vistas.add(id);
    soma += celula.quantidade;
  }
  if (soma !== quantidade) {
    return `A soma da grade (${soma}) difere da quantidade da ordem (${quantidade})`;
  }
  return null;
}

export function resumoTamanhos(grade: CelulaGrade[]): string {
  const nomes: string[] = [];
  for (const celula of grade) {
    const tamanho = celula.tamanho.trim();
    if (!nomes.some((atual) => atual.toLocaleLowerCase('pt-BR') === tamanho.toLocaleLowerCase('pt-BR'))) {
      nomes.push(tamanho);
    }
  }
  return nomes.join(', ') || 'U';
}

export function garantirTamanhosPadrao(db: AppDatabase, empresaId: number) {
  const inserir = db.prepare(
    `INSERT OR IGNORE INTO tamanhos_cadastro (empresa_id, nome, ordem) VALUES (?, ?, ?)`,
  );
  TAMANHOS_PADRAO.forEach((nome, indice) => inserir.run(empresaId, nome, indice + 1));
}

export function listarTamanhos(db: AppDatabase, empresaId: number) {
  garantirTamanhosPadrao(db, empresaId);
  return db
    .prepare(
      `SELECT id, nome, ordem FROM tamanhos_cadastro
        WHERE empresa_id = ?
        ORDER BY ordem ASC, id ASC`,
    )
    .all(empresaId) as Array<{ id: number; nome: string; ordem: number }>;
}

export function criarTamanho(db: AppDatabase, empresaId: number, nome: string) {
  const limpo = nome.trim();
  garantirTamanhosPadrao(db, empresaId);
  const existente = db
    .prepare(
      `SELECT id, nome, ordem FROM tamanhos_cadastro
        WHERE empresa_id = ? AND lower(nome) = lower(?)`,
    )
    .get(empresaId, limpo) as { id: number; nome: string; ordem: number } | undefined;
  if (existente) return { ...existente, ja_existia: true };
  const ordem = (
    db.prepare('SELECT ifnull(MAX(ordem), 0) AS n FROM tamanhos_cadastro WHERE empresa_id = ?').get(empresaId) as {
      n: number;
    }
  ).n + 1;
  const info = db
    .prepare('INSERT INTO tamanhos_cadastro (empresa_id, nome, ordem) VALUES (?, ?, ?)')
    .run(empresaId, limpo, ordem);
  return { id: Number(info.lastInsertRowid), nome: limpo, ordem, ja_existia: false };
}

function coresDosProdutos(db: AppDatabase, empresaId: number): string[] {
  const variantes = db
    .prepare(
      `SELECT DISTINCT v.cor AS nome
         FROM produto_variantes v
         JOIN produtos p ON p.id = v.produto_id
        WHERE p.empresa_id = ? AND trim(v.cor) != ''`,
    )
    .all(empresaId) as Array<{ nome: string }>;
  const produtos = db
    .prepare('SELECT cores FROM produtos WHERE empresa_id = ?')
    .all(empresaId) as Array<{ cores: string }>;
  const extras: string[] = [];
  for (const produto of produtos) {
    try {
      const lista = JSON.parse(produto.cores) as unknown;
      if (!Array.isArray(lista)) continue;
      for (const item of lista) {
        if (typeof item === 'string' && item.trim()) extras.push(item.trim());
      }
    } catch {
      // cadastro antigo sem JSON de cores
    }
  }
  return [...variantes.map((item) => item.nome), ...extras];
}

export type CorCadastro = {
  id: number | null;
  nome: string;
  codigo: string | null;
  hex: string | null;
};

export type CorSalva = {
  id: number;
  nome: string;
  codigo: string | null;
  hex: string | null;
  ja_existia?: boolean;
};

type CorEntrada = {
  nome: string;
  codigo?: string | null;
  hex?: string | null;
};

function normalizarCodigo(valor: string | null | undefined): string | null {
  const limpo = valor?.trim() ?? '';
  return limpo || null;
}

export function normalizarHex(valor: string | null | undefined): string | null {
  const limpo = valor?.trim() ?? '';
  if (!limpo) return null;
  const completo = limpo.match(/^#?([0-9a-fA-F]{6})$/);
  if (completo) return `#${completo[1].toUpperCase()}`;
  const curto = limpo.match(/^#?([0-9a-fA-F]{3})$/);
  if (curto) {
    const [r, g, b] = curto[1].toUpperCase().split('');
    return `#${r}${r}${g}${g}${b}${b}`;
  }
  throw Object.assign(new Error('Identificação visual inválida. Use uma cor no formato #RRGGBB'), {
    status: 400,
  });
}

function lerCor(db: AppDatabase, empresaId: number, id: number): CorSalva | undefined {
  return db
    .prepare(
      `SELECT id, nome, codigo, hex FROM cores_cadastro
        WHERE id = ? AND empresa_id = ?`,
    )
    .get(id, empresaId) as CorSalva | undefined;
}

function codigoEmUso(db: AppDatabase, empresaId: number, codigo: string, ignorarId?: number) {
  const linha = db
    .prepare(
      `SELECT id FROM cores_cadastro
        WHERE empresa_id = ? AND lower(codigo) = lower(?) AND id != ?`,
    )
    .get(empresaId, codigo, ignorarId ?? 0) as { id: number } | undefined;
  return Boolean(linha);
}

export function listarCores(db: AppDatabase, empresaId: number, busca = ''): CorCadastro[] {
  const cadastradas = db
    .prepare(
      `SELECT id, nome, codigo, hex FROM cores_cadastro
        WHERE empresa_id = ?
        ORDER BY nome COLLATE NOCASE`,
    )
    .all(empresaId) as CorSalva[];
  const porNome = new Map<string, CorCadastro>();
  for (const cor of [
    ...cadastradas,
    ...coresDosProdutos(db, empresaId).map((nome) => ({
      id: null,
      nome,
      codigo: null,
      hex: null,
    })),
  ]) {
    const chaveNome = cor.nome.trim().toLocaleLowerCase('pt-BR');
    if (!chaveNome || porNome.has(chaveNome)) continue;
    porNome.set(chaveNome, {
      id: cor.id,
      nome: cor.nome.trim(),
      codigo: cor.codigo,
      hex: cor.hex,
    });
  }
  const termo = busca.trim().toLocaleLowerCase('pt-BR');
  return [...porNome.values()]
    .filter((cor) => {
      if (!termo) return true;
      return (
        cor.nome.toLocaleLowerCase('pt-BR').includes(termo) ||
        (cor.codigo ?? '').toLocaleLowerCase('pt-BR').includes(termo)
      );
    })
    .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
}

export function criarCor(db: AppDatabase, empresaId: number, entrada: string | CorEntrada): CorSalva {
  const dados = typeof entrada === 'string' ? { nome: entrada } : entrada;
  const nome = dados.nome.trim();
  if (!nome) throw Object.assign(new Error('Informe o nome da cor'), { status: 400 });
  const codigo = normalizarCodigo(dados.codigo);
  const hex = normalizarHex(dados.hex);
  const existente = db
    .prepare(
      `SELECT id, nome, codigo, hex FROM cores_cadastro
        WHERE empresa_id = ? AND lower(nome) = lower(?)`,
    )
    .get(empresaId, nome) as CorSalva | undefined;
  if (existente) return { ...existente, ja_existia: true };
  if (codigo && codigoEmUso(db, empresaId, codigo)) {
    throw Object.assign(new Error('Código já cadastrado'), { status: 409 });
  }
  const info = db
    .prepare('INSERT INTO cores_cadastro (empresa_id, nome, codigo, hex) VALUES (?, ?, ?, ?)')
    .run(empresaId, nome, codigo, hex);
  return { id: Number(info.lastInsertRowid), nome, codigo, hex, ja_existia: false };
}

function corEmUso(db: AppDatabase, empresaId: number, nome: string): boolean {
  const grade = db
    .prepare('SELECT 1 AS ok FROM ordem_grade WHERE empresa_id = ? AND lower(cor) = lower(?) LIMIT 1')
    .get(empresaId, nome) as { ok: number } | undefined;
  if (grade) return true;
  const corte = db
    .prepare(
      'SELECT 1 AS ok FROM ordem_corte_grade WHERE empresa_id = ? AND lower(cor) = lower(?) LIMIT 1',
    )
    .get(empresaId, nome) as { ok: number } | undefined;
  if (corte) return true;
  const variante = db
    .prepare(
      `SELECT 1 AS ok
         FROM produto_variantes v
         JOIN produtos p ON p.id = v.produto_id
        WHERE p.empresa_id = ? AND lower(v.cor) = lower(?)
        LIMIT 1`,
    )
    .get(empresaId, nome) as { ok: number } | undefined;
  if (variante) return true;
  const produtos = db
    .prepare('SELECT cores FROM produtos WHERE empresa_id = ?')
    .all(empresaId) as Array<{ cores: string }>;
  const chaveNome = nome.trim().toLocaleLowerCase('pt-BR');
  for (const produto of produtos) {
    try {
      const lista = JSON.parse(produto.cores) as unknown;
      if (!Array.isArray(lista)) continue;
      if (
        lista.some(
          (item) => typeof item === 'string' && item.trim().toLocaleLowerCase('pt-BR') === chaveNome,
        )
      ) {
        return true;
      }
    } catch {
      // cadastro antigo sem JSON de cores
    }
  }
  return false;
}

export function editarCor(db: AppDatabase, empresaId: number, id: number, entrada: CorEntrada): CorSalva {
  const atual = lerCor(db, empresaId, id);
  if (!atual) throw Object.assign(new Error('Cor não encontrada'), { status: 404 });
  const nome = entrada.nome.trim();
  if (!nome) throw Object.assign(new Error('Informe o nome da cor'), { status: 400 });
  const codigo = normalizarCodigo(entrada.codigo);
  const hex = normalizarHex(entrada.hex);
  const nomeDup = db
    .prepare(
      `SELECT id FROM cores_cadastro
        WHERE empresa_id = ? AND lower(nome) = lower(?) AND id != ?`,
    )
    .get(empresaId, nome, id) as { id: number } | undefined;
  if (nomeDup) throw Object.assign(new Error('Já existe uma cor com este nome'), { status: 409 });
  if (codigo && codigoEmUso(db, empresaId, codigo, id)) {
    throw Object.assign(new Error('Código já cadastrado'), { status: 409 });
  }
  const aplicar = db.transaction(() => {
    db.prepare(
      `UPDATE cores_cadastro SET nome = ?, codigo = ?, hex = ?
        WHERE id = ? AND empresa_id = ?`,
    ).run(nome, codigo, hex, id, empresaId);
    if (atual.nome !== nome) {
      db.prepare(
        `UPDATE ordem_grade SET cor = ?
          WHERE empresa_id = ? AND lower(cor) = lower(?)`,
      ).run(nome, empresaId, atual.nome);
    }
  });
  aplicar();
  return { id, nome, codigo, hex };
}

export function excluirCor(db: AppDatabase, empresaId: number, id: number) {
  const atual = lerCor(db, empresaId, id);
  if (!atual) throw Object.assign(new Error('Cor não encontrada'), { status: 404 });
  if (corEmUso(db, empresaId, atual.nome)) {
    throw Object.assign(new Error('Esta cor está em uso e não pode ser excluída'), { status: 409 });
  }
  db.prepare('DELETE FROM cores_cadastro WHERE id = ? AND empresa_id = ?').run(id, empresaId);
}

export function lerGrade(db: AppDatabase, empresaId: number, ordemId: number): CelulaGrade[] {
  return db
    .prepare(
      `SELECT cor, tamanho, quantidade FROM ordem_grade
        WHERE empresa_id = ? AND ordem_id = ?
        ORDER BY id ASC`,
    )
    .all(empresaId, ordemId) as CelulaGrade[];
}

export function gravarGrade(
  db: AppDatabase,
  empresaId: number,
  ordemId: number,
  grade: CelulaGrade[],
) {
  for (const celula of grade) {
    criarCor(db, empresaId, celula.cor);
    criarTamanho(db, empresaId, celula.tamanho);
  }
  const substituir = db.transaction(() => {
    db.prepare('DELETE FROM ordem_grade WHERE empresa_id = ? AND ordem_id = ?').run(empresaId, ordemId);
    const inserir = db.prepare(
      `INSERT INTO ordem_grade (empresa_id, ordem_id, cor, tamanho, quantidade)
       VALUES (?, ?, ?, ?, ?)`,
    );
    for (const celula of grade) {
      inserir.run(empresaId, ordemId, celula.cor.trim(), celula.tamanho.trim(), celula.quantidade);
    }
  });
  substituir();
}

function lerGradeCorte(db: AppDatabase, empresaId: number, ordemCorteId: number): CelulaGrade[] {
  return db
    .prepare(
      `SELECT cor, tamanho, quantidade FROM ordem_corte_grade
        WHERE empresa_id = ? AND ordem_corte_id = ?
        ORDER BY id ASC`,
    )
    .all(empresaId, ordemCorteId) as CelulaGrade[];
}

function mapCorte(
  db: AppDatabase,
  empresaId: number,
  linha: Omit<OrdemCorte, 'grade'>,
): OrdemCorte {
  return { ...linha, grade: lerGradeCorte(db, empresaId, linha.id) };
}

export function obterOrdemCorte(
  db: AppDatabase,
  empresaId: number,
  ordemId: number,
): OrdemCorte | undefined {
  const linha = db
    .prepare('SELECT * FROM ordens_corte WHERE empresa_id = ? AND ordem_id = ?')
    .get(empresaId, ordemId) as Omit<OrdemCorte, 'grade'> | undefined;
  return linha ? mapCorte(db, empresaId, linha) : undefined;
}

function proximoCodigoCorte(db: AppDatabase, empresaId: number): string {
  const codigos = db
    .prepare('SELECT codigo FROM ordens_corte WHERE empresa_id = ?')
    .all(empresaId) as Array<{ codigo: string }>;
  let maior = 0;
  for (const item of codigos) {
    const numero = /^OC-(\d+)$/.exec(item.codigo);
    if (numero) maior = Math.max(maior, Number(numero[1]));
  }
  return `OC-${String(maior + 1).padStart(2, '0')}`;
}

export function criarOuObterOrdemCorte(
  db: AppDatabase,
  empresaId: number,
  ordem: {
    id: number;
    cliente: string;
    produto: string;
    quantidade: number;
    prioridade: string | null;
    data_prevista: string | null;
    responsavel: string | null;
    observacoes: string | null;
    cliente_id: number | null;
    produto_id: number | null;
  },
): { corte: OrdemCorte; criada: boolean } {
  const existente = obterOrdemCorte(db, empresaId, ordem.id);
  if (existente) return { corte: existente, criada: false };
  const grade = lerGrade(db, empresaId, ordem.id);
  if (grade.length === 0) {
    throw Object.assign(
      new Error('Grave a grade de cores e tamanhos antes de criar a ordem de corte'),
      { status: 400 },
    );
  }
  const criar = db.transaction(() => {
    const info = db
      .prepare(
        `INSERT INTO ordens_corte (
           empresa_id, codigo, ordem_id, cliente, produto, quantidade, prioridade,
           data_prevista, responsavel, observacoes, cliente_id, produto_id
         ) VALUES (
           @empresa_id, @codigo, @ordem_id, @cliente, @produto, @quantidade, @prioridade,
           @data_prevista, @responsavel, @observacoes, @cliente_id, @produto_id
         )`,
      )
      .run({
        empresa_id: empresaId,
        codigo: proximoCodigoCorte(db, empresaId),
        ordem_id: ordem.id,
        cliente: ordem.cliente,
        produto: ordem.produto,
        quantidade: ordem.quantidade,
        prioridade: ordem.prioridade,
        data_prevista: ordem.data_prevista,
        responsavel: ordem.responsavel,
        observacoes: ordem.observacoes,
        cliente_id: ordem.cliente_id,
        produto_id: ordem.produto_id,
      });
    const ordemCorteId = Number(info.lastInsertRowid);
    const inserir = db.prepare(
      `INSERT INTO ordem_corte_grade (empresa_id, ordem_corte_id, cor, tamanho, quantidade)
       VALUES (?, ?, ?, ?, ?)`,
    );
    for (const celula of grade) inserir.run(empresaId, ordemCorteId, celula.cor, celula.tamanho, celula.quantidade);
    return ordemCorteId;
  });
  try {
    criar();
  } catch (err) {
    const duplicada = obterOrdemCorte(db, empresaId, ordem.id);
    if (duplicada && err instanceof Error && /UNIQUE/i.test(err.message)) {
      return { corte: duplicada, criada: false };
    }
    throw err;
  }
  const corte = obterOrdemCorte(db, empresaId, ordem.id);
  if (!corte) throw new Error('Ordem de corte não encontrada');
  return { corte, criada: true };
}
