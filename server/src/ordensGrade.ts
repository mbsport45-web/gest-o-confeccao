import type { AppDatabase } from './db.js';
import { calcularConsumoCorte, consumoParaBaixa } from './consumoCorte.js';
import {
  garantirCliente,
  garantirProduto,
  lerTecidoFicha,
  salvarTecidoFicha,
  tecidoParaConsumo,
} from './fichaCorteCadastro.js';
import { alocarCodigoOc, erroUnicoSqlite } from './ordemCorteCodigo.js';
import { lerConsumosCoresOc, salvarConsumosCoresOc, type ConsumoCorOc } from './consumoCoresOc.js';

export const TAMANHOS_PADRAO = ['P', 'M', 'G', 'GG', 'G1', 'G2', 'G3'] as const;
export const TAMANHOS_FICHA = ['P', 'M', 'G', 'GG', 'XG'] as const;

export const STATUS_PROCESSO_OC = [
  'em_preenchimento',
  'aguardando_enfesto',
  'em_enfesto',
  'em_corte',
  'corte_concluido',
  'encaminhado',
  'entregue',
  'expedicao',
] as const;
export type StatusProcessoOc = (typeof STATUS_PROCESSO_OC)[number];
export const STATUS_PROCESSO_OC_LABEL: Record<StatusProcessoOc, string> = {
  em_preenchimento: 'Em preenchimento',
  aguardando_enfesto: 'Aguardando enfesto e corte',
  em_enfesto: 'Em enfesto',
  em_corte: 'Em corte',
  corte_concluido: 'Corte concluído',
  encaminhado: 'Encaminhado para próxima etapa',
  entregue: 'Entregue pela oficina',
  expedicao: 'Em expedição',
};
export const ACOES_APONTAMENTO_OC = ['iniciar_enfesto', 'iniciar_corte', 'concluir_corte', 'encaminhar'] as const;
export type AcaoApontamentoOc = (typeof ACOES_APONTAMENTO_OC)[number];

export type CelulaGrade = {
  cor: string;
  tamanho: string;
  quantidade: number;
};

export type OrdemCorteLinha = {
  cor: string;
  detalhes: string;
};

export type OrdemCorteAviamento = {
  id: number;
  aviamento_id: number | null;
  descricao: string;
  quantidade: number;
  unidade: string;
  observacoes: string;
};

export type OrdemCorteOficina = {
  id: number;
  oficina: string;
  costureiro: string;
  observacoes: string;
};

export type OrdemCorteMaterial = {
  materia_prima_id: number;
  nome: string;
  codigo: string | null;
  quantidade_total: number;
  unidade: string | null;
  estoque_disponivel: number;
  suficiente: boolean;
};

export type OrdemCorteHistorico = {
  id: number;
  usuario_id: number | null;
  usuario_nome: string | null;
  acao: string;
  resumo: string;
  payload?: unknown;
  criado_em: string;
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
  modelo: string;
  composicao: string;
  referencia: string;
  informacoes_oficina: string;
  data_retirada: string | null;
  informacoes_costureiros: string;
  informacoes_acabamento: string;
  atualizado_em: string;
  status_processo: StatusProcessoOc;
  ordem_codigo: string | null;
  ordem_status: string | null;
  tecido_nome: string | null;
  tecido_unidade: string | null;
  tecido_cor?: string | null;
  tecido_largura_cm?: number | null;
  tecido_largura_unidade?: string | null;
  tecido_gramatura?: number | null;
  tecido_numero_rolo?: string | null;
  tecido_composicao?: string | null;
  materia_prima_id: number | null;
  enviado_enfesto_em: string | null;
  enviado_enfesto_por: number | null;
  enviado_por_nome: string | null;
  iniciado_enfesto_em: string | null;
  iniciado_enfesto_por: number | null;
  iniciado_enfesto_por_nome: string | null;
  iniciado_corte_em: string | null;
  iniciado_corte_por: number | null;
  iniciado_corte_por_nome: string | null;
  concluido_corte_em: string | null;
  concluido_corte_por: number | null;
  concluido_corte_por_nome: string | null;
  consumo_real: number | null;
  consumo_unidade: string | null;
  quantidade_cortada: number | null;
  perdas: number | null;
  observacoes_corte: string | null;
  consumos_cores?: ConsumoCorOc[];
  tamanhos: string[];
  linhas: OrdemCorteLinha[];
  aviamentos: OrdemCorteAviamento[];
  oficinas: OrdemCorteOficina[];
  materiais: OrdemCorteMaterial[];
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
      db.prepare(
        `UPDATE ordem_corte_grade SET cor = ?
          WHERE empresa_id = ? AND lower(cor) = lower(?)`,
      ).run(nome, empresaId, atual.nome);
      db.prepare(
        `UPDATE ordem_corte_linhas SET cor = ?
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

function nomesUnicos(valores: string[]): string[] {
  const vistos: string[] = [];
  for (const valor of valores) {
    const nome = valor.trim();
    if (!nome) continue;
    if (!vistos.some((atual) => atual.toLocaleLowerCase('pt-BR') === nome.toLocaleLowerCase('pt-BR'))) {
      vistos.push(nome);
    }
  }
  return vistos;
}

export function parseTamanhosGrade(valor: unknown, grade: CelulaGrade[]): string[] {
  const lidos: string[] = [];
  if (typeof valor === 'string' && valor.trim()) {
    try {
      const parsed = JSON.parse(valor) as unknown;
      if (Array.isArray(parsed)) {
        for (const item of parsed) if (typeof item === 'string') lidos.push(item);
      }
    } catch {
      // cadastro antigo sem JSON
    }
  }
  const base = lidos.length ? lidos : [...TAMANHOS_FICHA];
  return nomesUnicos([...base, ...grade.map((celula) => celula.tamanho)]);
}

function lerLinhasCorte(
  db: AppDatabase,
  empresaId: number,
  ordemCorteId: number,
  grade: CelulaGrade[],
): OrdemCorteLinha[] {
  const linhas = db
    .prepare(
      `SELECT cor, detalhes FROM ordem_corte_linhas
        WHERE empresa_id = ? AND ordem_corte_id = ?
        ORDER BY id ASC`,
    )
    .all(empresaId, ordemCorteId) as OrdemCorteLinha[];
  if (linhas.length) return linhas;
  return nomesUnicos(grade.map((celula) => celula.cor)).map((cor) => ({ cor, detalhes: '' }));
}

function lerAviamentosCorte(
  db: AppDatabase,
  empresaId: number,
  ordemCorteId: number,
): OrdemCorteAviamento[] {
  return db
    .prepare(
      `SELECT id, aviamento_id, descricao, quantidade, unidade, observacoes
         FROM ordem_corte_aviamentos
        WHERE empresa_id = ? AND ordem_corte_id = ?
        ORDER BY id ASC`,
    )
    .all(empresaId, ordemCorteId) as OrdemCorteAviamento[];
}

function lerMateriaisCorte(
  db: AppDatabase,
  empresaId: number,
  ordemId: number,
): OrdemCorteMaterial[] {
  const rows = db
    .prepare(
      `SELECT
         r.materia_prima_id, m.nome, m.codigo, r.quantidade_total, r.unidade,
         ifnull(s.quantidade, 0) AS estoque_disponivel
       FROM ordem_requisitos r
       JOIN materias_primas m ON m.id = r.materia_prima_id
       LEFT JOIN estoque_saldos s
         ON s.materia_prima_id = r.materia_prima_id AND s.empresa_id = r.empresa_id
      WHERE r.ordem_id = ? AND r.empresa_id = ?
      ORDER BY r.id ASC`,
    )
    .all(ordemId, empresaId) as Array<Omit<OrdemCorteMaterial, 'suficiente'>>;
  return rows.map((row) => ({
    ...row,
    suficiente: row.estoque_disponivel + 1e-9 >= row.quantidade_total,
  }));
}

function lerOficinasCorte(
  db: AppDatabase,
  empresaId: number,
  ordemCorteId: number,
): OrdemCorteOficina[] {
  return db
    .prepare(
      `SELECT id, oficina, costureiro, observacoes
         FROM ordem_corte_oficinas
        WHERE empresa_id = ? AND ordem_corte_id = ?
        ORDER BY id ASC`,
    )
    .all(empresaId, ordemCorteId) as OrdemCorteOficina[];
}

type OrdemCorteLinhaBanco = {
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
  modelo?: string | null;
  composicao?: string | null;
  referencia?: string | null;
  informacoes_oficina?: string | null;
  data_retirada?: string | null;
  informacoes_costureiros?: string | null;
  informacoes_acabamento?: string | null;
  tamanhos_grade?: string | null;
  atualizado_em?: string | null;
  status_processo?: string | null;
  enviado_enfesto_em?: string | null;
  enviado_enfesto_por?: number | null;
  iniciado_enfesto_em?: string | null;
  iniciado_enfesto_por?: number | null;
  iniciado_corte_em?: string | null;
  iniciado_corte_por?: number | null;
  concluido_corte_em?: string | null;
  concluido_corte_por?: number | null;
  consumo_real?: number | null;
  consumo_unidade?: string | null;
  quantidade_cortada?: number | null;
  perdas?: number | null;
  observacoes_corte?: string | null;
  materia_prima_id?: number | null;
};

function statusProcessoOc(valor: string | null | undefined): StatusProcessoOc {
  return STATUS_PROCESSO_OC.includes(valor as StatusProcessoOc)
    ? (valor as StatusProcessoOc)
    : 'em_preenchimento';
}

function nomeUsuario(db: AppDatabase, usuarioId: number | null | undefined): string | null {
  if (!usuarioId) return null;
  const row = db.prepare('SELECT nome FROM usuarios WHERE id = ?').get(usuarioId) as { nome: string } | undefined;
  return row?.nome ?? null;
}

function tecidoDaOc(
  db: AppDatabase,
  empresaId: number,
  linha: OrdemCorteLinhaBanco,
  materiais: OrdemCorteMaterial[],
): { id: number | null; nome: string | null; unidade: string | null } {
  if (linha.materia_prima_id) {
    const materia = db
      .prepare(
        `SELECT id, nome, unidade FROM materias_primas
          WHERE id = ? AND empresa_id = ?`,
      )
      .get(linha.materia_prima_id, empresaId) as { id: number; nome: string; unidade: string } | undefined;
    if (materia) return { id: materia.id, nome: materia.nome, unidade: materia.unidade };
  }
  const primeiro = materiais[0];
  return {
    id: linha.materia_prima_id ?? primeiro?.materia_prima_id ?? null,
    nome: primeiro?.nome ?? null,
    unidade: primeiro?.unidade ?? null,
  };
}

function ordemDaOc(
  db: AppDatabase,
  empresaId: number,
  ordemId: number,
): { codigo: string | null; status: string | null } {
  const ordem = db
    .prepare('SELECT codigo, status FROM ordens_producao WHERE id = ? AND empresa_id = ?')
    .get(ordemId, empresaId) as { codigo: string | null; status: string } | undefined;
  return { codigo: ordem?.codigo ?? null, status: ordem?.status ?? null };
}

function mapCorte(db: AppDatabase, empresaId: number, linha: OrdemCorteLinhaBanco): OrdemCorte {
  const grade = lerGradeCorte(db, empresaId, linha.id);
  const materiais = lerMateriaisCorte(db, empresaId, linha.ordem_id);
  const tecido = tecidoDaOc(db, empresaId, linha, materiais);
  const snapshot = lerTecidoFicha(db, empresaId, linha.id);
  const ordem = ordemDaOc(db, empresaId, linha.ordem_id);
  return {
    id: linha.id,
    empresa_id: linha.empresa_id,
    codigo: linha.codigo,
    ordem_id: linha.ordem_id,
    cliente: linha.cliente,
    produto: linha.produto,
    quantidade: linha.quantidade,
    prioridade: linha.prioridade,
    data_prevista: linha.data_prevista,
    responsavel: linha.responsavel,
    observacoes: linha.observacoes,
    cliente_id: linha.cliente_id,
    produto_id: linha.produto_id,
    criado_em: linha.criado_em,
    modelo: linha.modelo ?? '',
    composicao: linha.composicao ?? '',
    referencia: linha.referencia ?? '',
    informacoes_oficina: linha.informacoes_oficina ?? '',
    data_retirada: linha.data_retirada ?? null,
    informacoes_costureiros: linha.informacoes_costureiros ?? '',
    informacoes_acabamento: linha.informacoes_acabamento ?? '',
    atualizado_em: linha.atualizado_em ?? linha.criado_em,
    status_processo: statusProcessoOc(linha.status_processo),
    ordem_codigo: ordem.codigo,
    ordem_status: ordem.status,
    tecido_nome: snapshot?.nome || tecido.nome,
    tecido_unidade: snapshot?.unidade || tecido.unidade,
    tecido_cor: snapshot?.cor || null,
    tecido_largura_cm: snapshot?.largura_cm ?? null,
    tecido_largura_unidade: snapshot?.largura_unidade ?? 'cm',
    tecido_gramatura: snapshot?.gramatura ?? null,
    tecido_numero_rolo: snapshot?.numero_rolo ?? '',
    tecido_composicao: snapshot?.composicao || null,
    materia_prima_id: snapshot?.materia_prima_id ?? tecido.id,
    enviado_enfesto_em: linha.enviado_enfesto_em ?? null,
    enviado_enfesto_por: linha.enviado_enfesto_por ?? null,
    enviado_por_nome: nomeUsuario(db, linha.enviado_enfesto_por),
    iniciado_enfesto_em: linha.iniciado_enfesto_em ?? null,
    iniciado_enfesto_por: linha.iniciado_enfesto_por ?? null,
    iniciado_enfesto_por_nome: nomeUsuario(db, linha.iniciado_enfesto_por),
    iniciado_corte_em: linha.iniciado_corte_em ?? null,
    iniciado_corte_por: linha.iniciado_corte_por ?? null,
    iniciado_corte_por_nome: nomeUsuario(db, linha.iniciado_corte_por),
    concluido_corte_em: linha.concluido_corte_em ?? null,
    concluido_corte_por: linha.concluido_corte_por ?? null,
    concluido_corte_por_nome: nomeUsuario(db, linha.concluido_corte_por),
    consumo_real: linha.consumo_real ?? null,
    consumo_unidade: linha.consumo_unidade ?? null,
    quantidade_cortada: linha.quantidade_cortada ?? null,
    perdas: linha.perdas ?? null,
    observacoes_corte: linha.observacoes_corte ?? null,
    consumos_cores: lerConsumosCoresOc(db, empresaId, linha.id),
    tamanhos: parseTamanhosGrade(linha.tamanhos_grade, grade),
    linhas: lerLinhasCorte(db, empresaId, linha.id, grade),
    aviamentos: lerAviamentosCorte(db, empresaId, linha.id),
    oficinas: lerOficinasCorte(db, empresaId, linha.id),
    materiais,
    grade,
  };
}

export function obterOrdemCorte(
  db: AppDatabase,
  empresaId: number,
  ordemId: number,
): OrdemCorte | undefined {
  const linha = db
    .prepare('SELECT * FROM ordens_corte WHERE empresa_id = ? AND ordem_id = ?')
    .get(empresaId, ordemId) as OrdemCorteLinhaBanco | undefined;
  return linha ? mapCorte(db, empresaId, linha) : undefined;
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
  codigoPreferido?: string | null,
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
    const codigo = alocarCodigoOc(db, empresaId, codigoPreferido);
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
        codigo,
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
    semearFichaOrdemCorte(db, empresaId, ordemCorteId, ordem);
    registrarHistoricoOrdemCorte(db, empresaId, ordemCorteId, null, 'criar', 'Criou a ficha de produção', {
      codigo,
    });
    return ordemCorteId;
  });
  let ultimoErro: unknown;
  for (let tentativa = 0; tentativa < 8; tentativa += 1) {
    try {
      criar.immediate();
      ultimoErro = null;
      break;
    } catch (err) {
      ultimoErro = err;
      const duplicada = obterOrdemCorte(db, empresaId, ordem.id);
      if (duplicada) return { corte: duplicada, criada: false };
      if (!erroUnicoSqlite(err)) throw err;
      codigoPreferido = null;
    }
  }
  if (ultimoErro) throw ultimoErro;
  const corte = obterOrdemCorte(db, empresaId, ordem.id);
  if (!corte) throw new Error('Ordem de corte não encontrada');
  return { corte, criada: true };
}

export type FichaOrdemCorteEntrada = {
  codigo?: string;
  cliente?: string;
  cliente_id?: number | null;
  produto_id?: number | null;
  modelo?: string;
  composicao?: string;
  referencia?: string;
  informacoes_oficina?: string;
  data_retirada?: string | null;
  informacoes_costureiros?: string;
  informacoes_acabamento?: string;
  observacoes?: string | null;
  materia_prima_id?: number | null;
  tecido_nome?: string;
  tecido_cor?: string;
  tecido_largura_cm?: number | string | null;
  tecido_largura_unidade?: string;
  tecido_gramatura?: number | string | null;
  tecido_unidade?: string;
  tecido_numero_rolo?: string;
  tamanhos?: string[];
  grade?: CelulaGrade[];
  linhas?: OrdemCorteLinha[];
  aviamentos?: Array<{
    aviamento_id?: number | null;
    descricao: string;
    quantidade: number;
    unidade?: string;
    observacoes?: string;
  }>;
  oficinas?: Array<{
    oficina?: string;
    costureiro?: string;
    observacoes?: string;
  }>;
  consumos_cores?: Array<{
    cor: string;
    camadas?: number | null;
    peso_folha?: number | null;
    consumo_total?: number | null;
    unidade?: string | null;
  }>;
};

function semearFichaOrdemCorte(
  db: AppDatabase,
  empresaId: number,
  ordemCorteId: number,
  ordem: {
    id: number;
    produto: string;
    observacoes: string | null;
    data_prevista: string | null;
    produto_id: number | null;
  },
) {
  const produto = ordem.produto_id
    ? (db
        .prepare('SELECT sku, nome FROM produtos WHERE id = ? AND empresa_id = ?')
        .get(ordem.produto_id, empresaId) as { sku: string | null; nome: string } | undefined)
    : undefined;
  const requisitos = db
    .prepare(
      `SELECT r.materia_prima_id, m.nome, m.composicao, m.tipo
         FROM ordem_requisitos r
         JOIN materias_primas m ON m.id = r.materia_prima_id
        WHERE r.ordem_id = ? AND r.empresa_id = ?
        ORDER BY r.id ASC`,
    )
    .all(ordem.id, empresaId) as Array<{
    materia_prima_id: number;
    nome: string;
    composicao: string | null;
    tipo: string;
  }>;
  const tecido =
    requisitos.find((item) => item.tipo === 'tecido' || item.tipo === 'forro') ?? requisitos[0];
  const composicaoSemeada = tecido
    ? (tecido.composicao ?? '').trim() || tecido.nome
    : requisitos
        .map((item) => (item.composicao ?? '').trim() || item.nome)
        .filter(Boolean)
        .join(', ');
  const grade = lerGradeCorte(db, empresaId, ordemCorteId);
  for (const tamanho of TAMANHOS_FICHA) criarTamanho(db, empresaId, tamanho);
  const tamanhos = parseTamanhosGrade(JSON.stringify([...TAMANHOS_FICHA]), grade);
  db.prepare(
    `UPDATE ordens_corte
        SET modelo = ?, composicao = ?, referencia = ?, informacoes_oficina = ?,
            data_retirada = ?, tamanhos_grade = ?, materia_prima_id = ?, atualizado_em = datetime('now')
      WHERE id = ? AND empresa_id = ?`,
  ).run(
    produto?.nome ?? ordem.produto,
    composicaoSemeada,
    produto?.sku ?? '',
    ordem.observacoes ?? '',
    ordem.data_prevista,
    JSON.stringify(tamanhos),
    tecido?.materia_prima_id ?? null,
    ordemCorteId,
    empresaId,
  );
  const inserirLinha = db.prepare(
    `INSERT INTO ordem_corte_linhas (empresa_id, ordem_corte_id, cor, detalhes)
     VALUES (?, ?, ?, '')`,
  );
  for (const cor of nomesUnicos(grade.map((celula) => celula.cor))) {
    criarCor(db, empresaId, cor);
    inserirLinha.run(empresaId, ordemCorteId, cor);
  }
}

export function registrarHistoricoOrdemCorte(
  db: AppDatabase,
  empresaId: number,
  ordemCorteId: number,
  usuarioId: number | null,
  acao: string,
  resumo: string,
  payload: unknown,
) {
  db.prepare(
    `INSERT INTO ordem_corte_historico (
       empresa_id, ordem_corte_id, usuario_id, acao, resumo, payload
     ) VALUES (?, ?, ?, ?, ?, ?)`,
  ).run(empresaId, ordemCorteId, usuarioId, acao, resumo, JSON.stringify(payload ?? {}));
}

export function listarHistoricoOrdemCorte(
  db: AppDatabase,
  empresaId: number,
  ordemId: number,
): OrdemCorteHistorico[] {
  const corte = obterOrdemCorte(db, empresaId, ordemId);
  if (!corte) return [];
  const linhas = db
    .prepare(
      `SELECT h.id, h.usuario_id, u.nome AS usuario_nome, h.acao, h.resumo, h.payload, h.criado_em
         FROM ordem_corte_historico h
         LEFT JOIN usuarios u ON u.id = h.usuario_id
        WHERE h.empresa_id = ? AND h.ordem_corte_id = ?
        ORDER BY h.id DESC`,
    )
    .all(empresaId, corte.id) as Array<OrdemCorteHistorico & { payload: string | null }>;
  return linhas.map((linha) => {
    let payload: unknown = {};
    if (linha.payload) {
      try {
        payload = JSON.parse(linha.payload);
      } catch {
        payload = {};
      }
    }
    return { ...linha, payload };
  });
}

function validarGradeFicha(grade: CelulaGrade[]): string | null {
  const vistas = new Set<string>();
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
  }
  return null;
}

function resumoAlteracoes(antes: OrdemCorte, entrada: FichaOrdemCorteEntrada): string {
  const campos: string[] = [];
  const marcar = (nome: string, mudou: boolean) => {
    if (mudou) campos.push(nome);
  };
  marcar('modelo', entrada.modelo !== undefined && entrada.modelo !== antes.modelo);
  marcar('composição', entrada.composicao !== undefined && entrada.composicao !== antes.composicao);
  marcar('referência', entrada.referencia !== undefined && entrada.referencia !== antes.referencia);
  marcar('informações da oficina', entrada.informacoes_oficina !== undefined);
  marcar('data de retirada', entrada.data_retirada !== undefined);
  marcar('informações dos costureiros', entrada.informacoes_costureiros !== undefined);
  marcar('acabamento', entrada.informacoes_acabamento !== undefined);
  marcar('observações', entrada.observacoes !== undefined && entrada.observacoes !== antes.observacoes);
  marcar('tecido', entrada.materia_prima_id !== undefined && entrada.materia_prima_id !== antes.materia_prima_id);
  marcar('grade', entrada.grade !== undefined);
  marcar('aviamentos', entrada.aviamentos !== undefined);
  marcar('oficinas', entrada.oficinas !== undefined);
  marcar('tamanhos', entrada.tamanhos !== undefined);
  return campos.length ? `Atualizou ${campos.join(', ')}` : 'Atualizou a ficha de produção';
}

export function atualizarFichaOrdemCorte(
  db: AppDatabase,
  empresaId: number,
  ordemId: number,
  entrada: FichaOrdemCorteEntrada,
  usuarioId: number | null,
): OrdemCorte {
  const atual = obterOrdemCorte(db, empresaId, ordemId);
  if (!atual) {
    throw Object.assign(new Error('Ordem de corte não encontrada'), { status: 404 });
  }
  if (entrada.grade) {
    const erroGrade = validarGradeFicha(entrada.grade);
    if (erroGrade) throw Object.assign(new Error(erroGrade), { status: 400 });
  }

  const aplicar = db.transaction(() => {
    if (entrada.modelo !== undefined) {
      db.prepare('UPDATE ordens_corte SET modelo = ? WHERE id = ? AND empresa_id = ?').run(
        entrada.modelo,
        atual.id,
        empresaId,
      );
    }
    if (entrada.composicao !== undefined) {
      db.prepare('UPDATE ordens_corte SET composicao = ? WHERE id = ? AND empresa_id = ?').run(
        entrada.composicao,
        atual.id,
        empresaId,
      );
    }
    if (entrada.referencia !== undefined) {
      db.prepare('UPDATE ordens_corte SET referencia = ? WHERE id = ? AND empresa_id = ?').run(
        entrada.referencia,
        atual.id,
        empresaId,
      );
    }
    if (entrada.informacoes_oficina !== undefined) {
      db.prepare('UPDATE ordens_corte SET informacoes_oficina = ? WHERE id = ? AND empresa_id = ?').run(
        entrada.informacoes_oficina,
        atual.id,
        empresaId,
      );
    }
    if (entrada.data_retirada !== undefined) {
      db.prepare('UPDATE ordens_corte SET data_retirada = ? WHERE id = ? AND empresa_id = ?').run(
        entrada.data_retirada,
        atual.id,
        empresaId,
      );
    }
    if (entrada.informacoes_costureiros !== undefined) {
      db.prepare('UPDATE ordens_corte SET informacoes_costureiros = ? WHERE id = ? AND empresa_id = ?').run(
        entrada.informacoes_costureiros,
        atual.id,
        empresaId,
      );
    }
    if (entrada.informacoes_acabamento !== undefined) {
      db.prepare('UPDATE ordens_corte SET informacoes_acabamento = ? WHERE id = ? AND empresa_id = ?').run(
        entrada.informacoes_acabamento,
        atual.id,
        empresaId,
      );
    }
    if (entrada.observacoes !== undefined) {
      db.prepare('UPDATE ordens_corte SET observacoes = ? WHERE id = ? AND empresa_id = ?').run(
        entrada.observacoes,
        atual.id,
        empresaId,
      );
    }
    if (entrada.materia_prima_id !== undefined) {
      if (entrada.materia_prima_id != null) {
        const materia = db
          .prepare(
            `SELECT id, tipo FROM materias_primas
              WHERE id = ? AND empresa_id = ? AND status = 'ativo'`,
          )
          .get(entrada.materia_prima_id, empresaId) as { id: number; tipo: string } | undefined;
        if (!materia || (materia.tipo !== 'tecido' && materia.tipo !== 'forro')) {
          throw Object.assign(new Error('Tecido não encontrado'), { status: 400 });
        }
      }
      db.prepare('UPDATE ordens_corte SET materia_prima_id = ? WHERE id = ? AND empresa_id = ?').run(
        entrada.materia_prima_id,
        atual.id,
        empresaId,
      );
    }
    if (entrada.tamanhos) {
      const tamanhos = nomesUnicos(entrada.tamanhos);
      for (const tamanho of tamanhos) criarTamanho(db, empresaId, tamanho);
      db.prepare('UPDATE ordens_corte SET tamanhos_grade = ? WHERE id = ? AND empresa_id = ?').run(
        JSON.stringify(tamanhos.length ? tamanhos : [...TAMANHOS_FICHA]),
        atual.id,
        empresaId,
      );
    }

    if (entrada.grade) {
      for (const celula of entrada.grade) {
        criarCor(db, empresaId, celula.cor);
        criarTamanho(db, empresaId, celula.tamanho);
      }
      db.prepare('DELETE FROM ordem_corte_grade WHERE empresa_id = ? AND ordem_corte_id = ?').run(
        empresaId,
        atual.id,
      );
      const inserir = db.prepare(
        `INSERT INTO ordem_corte_grade (empresa_id, ordem_corte_id, cor, tamanho, quantidade)
         VALUES (?, ?, ?, ?, ?)`,
      );
      for (const celula of entrada.grade) {
        inserir.run(empresaId, atual.id, celula.cor.trim(), celula.tamanho.trim(), celula.quantidade);
      }
      const total = entrada.grade.reduce((soma, celula) => soma + celula.quantidade, 0);
      db.prepare('UPDATE ordens_corte SET quantidade = ? WHERE id = ? AND empresa_id = ?').run(
        total,
        atual.id,
        empresaId,
      );
    }

    if (entrada.linhas || entrada.grade) {
      const detalhesPorCor = new Map<string, string>();
      for (const linha of atual.linhas) {
        detalhesPorCor.set(linha.cor.toLocaleLowerCase('pt-BR'), linha.detalhes);
      }
      const linhas = entrada.linhas
        ? entrada.linhas
        : nomesUnicos((entrada.grade ?? atual.grade).map((celula) => celula.cor)).map((cor) => ({
            cor,
            detalhes: detalhesPorCor.get(cor.toLocaleLowerCase('pt-BR')) ?? '',
          }));
      db.prepare('DELETE FROM ordem_corte_linhas WHERE empresa_id = ? AND ordem_corte_id = ?').run(
        empresaId,
        atual.id,
      );
      const inserirLinha = db.prepare(
        `INSERT INTO ordem_corte_linhas (empresa_id, ordem_corte_id, cor, detalhes)
         VALUES (?, ?, ?, ?)`,
      );
      for (const linha of linhas) {
        const cor = linha.cor.trim();
        if (!cor) continue;
        criarCor(db, empresaId, cor);
        inserirLinha.run(empresaId, atual.id, cor, linha.detalhes ?? '');
      }
    }

    if (entrada.aviamentos) {
      db.prepare('DELETE FROM ordem_corte_aviamentos WHERE empresa_id = ? AND ordem_corte_id = ?').run(
        empresaId,
        atual.id,
      );
      const inserirAviamento = db.prepare(
        `INSERT INTO ordem_corte_aviamentos (
           empresa_id, ordem_corte_id, aviamento_id, descricao, quantidade, unidade, observacoes
         ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      );
      for (const item of entrada.aviamentos) {
        const descricao = item.descricao.trim();
        if (!descricao) continue;
        let aviamentoId = item.aviamento_id ?? null;
        let unidade = (item.unidade ?? 'UN').trim() || 'UN';
        if (aviamentoId) {
          const cadastro = db
            .prepare('SELECT id, nome, unidade FROM aviamentos WHERE id = ? AND empresa_id = ?')
            .get(aviamentoId, empresaId) as { id: number; nome: string; unidade: string } | undefined;
          if (!cadastro) {
            throw Object.assign(new Error('Aviamento não encontrado'), { status: 400 });
          }
          aviamentoId = cadastro.id;
          if (!item.unidade) unidade = cadastro.unidade;
        }
        inserirAviamento.run(
          empresaId,
          atual.id,
          aviamentoId,
          descricao,
          item.quantidade,
          unidade,
          item.observacoes ?? '',
        );
      }
    }

    if (entrada.consumos_cores) {
      salvarConsumosCoresOc(db, empresaId, atual.id, entrada.consumos_cores);
    }

    if (entrada.oficinas) {
      db.prepare('DELETE FROM ordem_corte_oficinas WHERE empresa_id = ? AND ordem_corte_id = ?').run(
        empresaId,
        atual.id,
      );
      const inserirOficina = db.prepare(
        `INSERT INTO ordem_corte_oficinas (
           empresa_id, ordem_corte_id, oficina, costureiro, observacoes
         ) VALUES (?, ?, ?, ?, ?)`,
      );
      for (const item of entrada.oficinas) {
        const oficina = (item.oficina ?? '').trim();
        const costureiro = (item.costureiro ?? '').trim();
        const observacoes = (item.observacoes ?? '').trim();
        if (!oficina && !costureiro && !observacoes) continue;
        inserirOficina.run(empresaId, atual.id, oficina, costureiro, observacoes);
      }
    }

    const cliente = garantirCliente(db, empresaId, {
      cliente_id: entrada.cliente_id,
      cliente: entrada.cliente,
    });
    if (cliente) {
      db.prepare(
        `UPDATE ordens_corte SET cliente = ?, cliente_id = ? WHERE id = ? AND empresa_id = ?`,
      ).run(cliente.nome, cliente.id, atual.id, empresaId);
      db.prepare(
        `UPDATE ordens_producao SET cliente = ?, cliente_id = ? WHERE id = ? AND empresa_id = ?`,
      ).run(cliente.nome, cliente.id, atual.ordem_id, empresaId);
    }

    const produto = garantirProduto(db, empresaId, {
      produto_id: entrada.produto_id,
      modelo: entrada.modelo ?? atual.modelo,
      referencia: entrada.referencia ?? atual.referencia,
    });
    if (produto) {
      const modelo = (entrada.modelo ?? produto.nome).trim() || produto.nome;
      const referencia = (entrada.referencia ?? produto.sku ?? '').trim();
      db.prepare(
        `UPDATE ordens_corte
            SET modelo = ?, referencia = ?, produto_id = ?, produto = ?
          WHERE id = ? AND empresa_id = ?`,
      ).run(modelo, referencia, produto.id, modelo, atual.id, empresaId);
      db.prepare(
        `UPDATE ordens_producao SET produto = ?, produto_id = ? WHERE id = ? AND empresa_id = ?`,
      ).run(modelo, produto.id, atual.ordem_id, empresaId);
    }

    if (
      entrada.tecido_nome !== undefined ||
      entrada.tecido_cor !== undefined ||
      entrada.tecido_largura_cm !== undefined ||
      entrada.tecido_largura_unidade !== undefined ||
      entrada.tecido_gramatura !== undefined ||
      entrada.tecido_unidade !== undefined ||
      entrada.tecido_numero_rolo !== undefined ||
      entrada.materia_prima_id !== undefined ||
      entrada.composicao !== undefined
    ) {
      const atualTecido = lerTecidoFicha(db, empresaId, atual.id);
      salvarTecidoFicha(db, empresaId, atual.id, {
        materia_prima_id:
          entrada.materia_prima_id !== undefined
            ? entrada.materia_prima_id
            : (atualTecido?.materia_prima_id ?? atual.materia_prima_id),
        nome: entrada.tecido_nome ?? atualTecido?.nome ?? atual.tecido_nome ?? '',
        cor: entrada.tecido_cor ?? atualTecido?.cor ?? '',
        largura_cm:
          entrada.tecido_largura_cm !== undefined ? entrada.tecido_largura_cm : (atualTecido?.largura_cm ?? null),
        largura_unidade:
          entrada.tecido_largura_unidade ?? atualTecido?.largura_unidade ?? atual.tecido_largura_unidade ?? 'cm',
        gramatura:
          entrada.tecido_gramatura !== undefined ? entrada.tecido_gramatura : (atualTecido?.gramatura ?? null),
        composicao: entrada.composicao ?? atualTecido?.composicao ?? atual.composicao,
        unidade: entrada.tecido_unidade ?? atualTecido?.unidade ?? atual.tecido_unidade ?? 'KG',
        numero_rolo: entrada.tecido_numero_rolo ?? atualTecido?.numero_rolo ?? atual.tecido_numero_rolo ?? '',
      });
    }

    db.prepare(
      `UPDATE ordens_corte SET atualizado_em = datetime('now') WHERE id = ? AND empresa_id = ?`,
    ).run(atual.id, empresaId);
    registrarHistoricoOrdemCorte(
      db,
      empresaId,
      atual.id,
      usuarioId,
      'editar',
      resumoAlteracoes(atual, entrada),
      entrada,
    );
  });
  aplicar();
  const atualizada = obterOrdemCorte(db, empresaId, ordemId);
  if (!atualizada) throw new Error('Ordem de corte não encontrada');
  return atualizada;
}

function falhaOc(mensagem: string, status: number): never {
  throw Object.assign(new Error(mensagem), { status });
}

export function motivoImpedeEnvio(corte: OrdemCorte): string | null {
  if (!corte.modelo.trim()) return 'Preencha o modelo antes de enviar para enfesto e corte';
  if (!corte.composicao.trim()) return 'Preencha a composição antes de enviar para enfesto e corte';
  if (!corte.grade.some((celula) => celula.quantidade > 0)) {
    return 'Preencha a grade antes de enviar para enfesto e corte';
  }
  return null;
}

export function enviarOrdemCorteEnfesto(
  db: AppDatabase,
  empresaId: number,
  ordemId: number,
  usuarioId: number | null,
): OrdemCorte {
  const atual = obterOrdemCorte(db, empresaId, ordemId);
  if (!atual) falhaOc('Ordem de corte não encontrada', 404);
  if (atual.status_processo !== 'em_preenchimento') return atual;
  const impedimento = motivoImpedeEnvio(atual);
  if (impedimento) falhaOc(impedimento, 400);
  db.prepare(
    `UPDATE ordens_corte
        SET status_processo = 'aguardando_enfesto',
            enviado_enfesto_em = datetime('now'),
            enviado_enfesto_por = ?,
            atualizado_em = datetime('now')
      WHERE id = ? AND empresa_id = ?`,
  ).run(usuarioId, atual.id, empresaId);
  registrarHistoricoOrdemCorte(
    db,
    empresaId,
    atual.id,
    usuarioId,
    'enviar_enfesto',
    'Enviou a ficha para enfesto e corte',
    { status_processo: 'aguardando_enfesto' },
  );
  const enviada = obterOrdemCorte(db, empresaId, ordemId);
  if (!enviada) falhaOc('Ordem de corte não encontrada', 404);
  return enviada;
}

export function listarFilaEnfestoCorte(db: AppDatabase, empresaId: number): OrdemCorte[] {
  const linhas = db
    .prepare(
      `SELECT * FROM ordens_corte
        WHERE empresa_id = ? AND status_processo != 'em_preenchimento'
        ORDER BY COALESCE(enviado_enfesto_em, atualizado_em) DESC, id DESC`,
    )
    .all(empresaId) as OrdemCorteLinhaBanco[];
  return linhas.map((linha) => mapCorte(db, empresaId, linha));
}

export type ApontamentoOrdemCorteEntrada = {
  acao: AcaoApontamentoOc;
  consumo_real?: number;
  consumo_unidade?: string;
  quantidade_cortada?: number;
  perdas?: number;
  metragem_risco?: number;
  camadas?: number;
  observacoes_corte?: string;
  materia_prima_id?: number | null;
  consumos_cores?: Array<{
    cor: string;
    camadas?: number | null;
    peso_folha?: number | null;
    consumo_total?: number | null;
    unidade?: string | null;
  }>;
};

const TRANSICOES_APONTAMENTO: Record<AcaoApontamentoOc, { de: StatusProcessoOc[]; para: StatusProcessoOc }> = {
  iniciar_enfesto: { de: ['aguardando_enfesto'], para: 'em_enfesto' },
  iniciar_corte: { de: ['em_enfesto'], para: 'em_corte' },
  concluir_corte: { de: ['em_corte'], para: 'corte_concluido' },
  encaminhar: { de: ['corte_concluido'], para: 'encaminhado' },
};

export function registrarApontamentoOrdemCorte(
  db: AppDatabase,
  empresaId: number,
  ordemId: number,
  entrada: ApontamentoOrdemCorteEntrada,
  usuarioId: number | null,
): OrdemCorte {
  const atual = obterOrdemCorte(db, empresaId, ordemId);
  if (!atual) falhaOc('Ordem de corte não encontrada', 404);
  const transicao = TRANSICOES_APONTAMENTO[entrada.acao];
  if (atual.status_processo === transicao.para) {
    return atual;
  }
  if (!transicao.de.includes(atual.status_processo)) {
    falhaOc(
      `Não é possível ${entrada.acao.replaceAll('_', ' ')} com a ficha ${STATUS_PROCESSO_OC_LABEL[atual.status_processo].toLowerCase()}`,
      409,
    );
  }

  const materiaPrimaId = entrada.materia_prima_id === undefined ? atual.materia_prima_id : entrada.materia_prima_id;
  let consumoUnidade = entrada.consumo_unidade ?? atual.consumo_unidade ?? atual.tecido_unidade;
  let consumoFinal = entrada.consumo_real ?? null;
  if (entrada.acao === 'concluir_corte' && entrada.consumos_cores) {
    salvarConsumosCoresOc(db, empresaId, atual.id, entrada.consumos_cores);
    const somaCores = lerConsumosCoresOc(db, empresaId, atual.id).reduce(
      (soma, item) => soma + (Number(item.consumo_total) || 0),
      0,
    );
    if (somaCores > 0) consumoFinal = somaCores;
  }
  if (materiaPrimaId) {
    const materia = db
      .prepare(
        `SELECT id, unidade, tipo, largura_cm, gramatura FROM materias_primas
          WHERE id = ? AND empresa_id = ? AND status = 'ativo'`,
      )
      .get(materiaPrimaId, empresaId) as
      | { id: number; unidade: string; tipo: string; largura_cm: number | null; gramatura: number | null }
      | undefined;
    if (!materia || (materia.tipo !== 'tecido' && materia.tipo !== 'forro')) {
      falhaOc('Tecido não encontrado', 400);
    }
    const snapshot = lerTecidoFicha(db, empresaId, atual.id);
    const paraConsumo = tecidoParaConsumo(snapshot, materia);
    consumoUnidade = entrada.consumo_unidade ?? paraConsumo.unidade;
    if (entrada.acao === 'concluir_corte' && !(Number(consumoFinal) > 0)) {
      const calc = calcularConsumoCorte({
        unidade: paraConsumo.unidade,
        metragemRisco: Number(entrada.metragem_risco) || 0,
        larguraCm: paraConsumo.larguraCm,
        gramatura: paraConsumo.gramatura,
        camadas: Number(entrada.camadas) || 0,
        perdaPercentual: Number(entrada.perdas) || 0,
      });
      if (calc.ok) {
        consumoFinal = consumoParaBaixa(calc, entrada.consumo_real);
      } else if (!(Number(entrada.consumo_real) > 0)) {
        falhaOc(calc.erro, 400);
      }
    }
  }

  if (entrada.acao === 'concluir_corte' && !(Number(consumoFinal) > 0)) {
    falhaOc('Informe o consumo real de tecido ou a metragem do risco', 400);
  }

  const quantidadeCortada =
    entrada.quantidade_cortada ??
    atual.quantidade_cortada ??
    atual.grade.reduce((soma, celula) => soma + celula.quantidade, 0);

  db.prepare(
    `UPDATE ordens_corte
        SET status_processo = @status_processo,
            iniciado_enfesto_em = CASE WHEN @marcar_enfesto = 1 THEN datetime('now') ELSE iniciado_enfesto_em END,
            iniciado_enfesto_por = CASE WHEN @marcar_enfesto = 1 THEN @usuario_id ELSE iniciado_enfesto_por END,
            iniciado_corte_em = CASE WHEN @marcar_corte = 1 THEN datetime('now') ELSE iniciado_corte_em END,
            iniciado_corte_por = CASE WHEN @marcar_corte = 1 THEN @usuario_id ELSE iniciado_corte_por END,
            concluido_corte_em = CASE WHEN @marcar_conclusao = 1 THEN datetime('now') ELSE concluido_corte_em END,
            concluido_corte_por = CASE WHEN @marcar_conclusao = 1 THEN @usuario_id ELSE concluido_corte_por END,
            consumo_real = CASE WHEN @marcar_conclusao = 1 THEN @consumo_real ELSE consumo_real END,
            consumo_unidade = CASE WHEN @marcar_conclusao = 1 THEN @consumo_unidade ELSE consumo_unidade END,
            quantidade_cortada = CASE WHEN @marcar_conclusao = 1 THEN @quantidade_cortada ELSE quantidade_cortada END,
            perdas = CASE WHEN @marcar_conclusao = 1 THEN @perdas ELSE perdas END,
            observacoes_corte = CASE WHEN @marcar_conclusao = 1 THEN @observacoes_corte ELSE observacoes_corte END,
            materia_prima_id = CASE WHEN @materia_prima_id IS NULL THEN materia_prima_id ELSE @materia_prima_id END,
            atualizado_em = datetime('now')
      WHERE id = @id AND empresa_id = @empresa_id`,
  ).run({
    status_processo: transicao.para,
    marcar_enfesto: entrada.acao === 'iniciar_enfesto' ? 1 : 0,
    marcar_corte: entrada.acao === 'iniciar_corte' ? 1 : 0,
    marcar_conclusao: entrada.acao === 'concluir_corte' ? 1 : 0,
    usuario_id: usuarioId,
    consumo_real: consumoFinal,
    consumo_unidade: consumoUnidade ?? null,
    quantidade_cortada: quantidadeCortada,
    perdas: entrada.perdas ?? atual.perdas ?? 0,
    observacoes_corte: entrada.observacoes_corte ?? atual.observacoes_corte ?? '',
    materia_prima_id: materiaPrimaId,
    id: atual.id,
    empresa_id: empresaId,
  });

  const resumo =
    entrada.acao === 'iniciar_enfesto'
      ? 'Registrou o início do enfesto'
      : entrada.acao === 'iniciar_corte'
        ? 'Registrou o início do corte'
        : entrada.acao === 'concluir_corte'
          ? 'Concluiu o corte da ficha'
          : 'Encaminhou a ficha para a próxima etapa';
  registrarHistoricoOrdemCorte(db, empresaId, atual.id, usuarioId, entrada.acao, resumo, entrada);
  const atualizada = obterOrdemCorte(db, empresaId, ordemId);
  if (!atualizada) falhaOc('Ordem de corte não encontrada', 404);
  return atualizada;
}

export function marcarOrdemCorteEncaminhada(db: AppDatabase, empresaId: number, ordemId: number) {
  db.prepare(
    `UPDATE ordens_corte
        SET status_processo = 'encaminhado', atualizado_em = datetime('now')
      WHERE empresa_id = ? AND ordem_id = ?
        AND status_processo NOT IN ('em_preenchimento', 'entregue', 'expedicao')`,
  ).run(empresaId, ordemId);
}

function escaparHtml(valor: string): string {
  return valor
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function celulaGrade(corte: OrdemCorte, cor: string, tamanho: string): number {
  const alvo = chave(cor, tamanho);
  const encontrada = corte.grade.find((celula) => chave(celula.cor, celula.tamanho) === alvo);
  return encontrada?.quantidade ?? 0;
}

function completarImpressao<T>(lista: T[], minimo: number, vazio: T): T[] {
  const saida = [...lista];
  while (saida.length < minimo) saida.push(vazio);
  return saida.length ? saida : [vazio];
}

export type ExtraImpressaoOc = {
  costureiro?: string;
  valor_peca?: number | null;
  liberado_em?: string | null;
  oficina?: string;
  data_liberacao?: string | null;
  data_retirada?: string | null;
  codigo_oc?: string;
};

export function formatarMoedaBr(valor: number | null | undefined): string {
  if (valor == null || !Number.isFinite(Number(valor))) return '';
  const [inteiro, centavos] = Number(valor).toFixed(2).split('.');
  const milhar = inteiro.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return `R$ ${milhar},${centavos}`;
}

export function formatarDataBr(valor: string | null | undefined): string {
  const t = String(valor ?? '').trim();
  const iso = t.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[3]}/${iso[2]}/${iso[1]}`;
  return t;
}

export function oficinasParaImpressao(corte: OrdemCorte, extras?: ExtraImpressaoOc): OrdemCorteOficina[] {
  const lista = corte.oficinas.map((item) => ({ ...item }));
  const oficina = (extras?.oficina ?? '').trim();
  const costureiro = (extras?.costureiro ?? '').trim();
  if (oficina || costureiro) {
    const idx = lista.findIndex((item) => {
      const mesmaOficina = oficina && item.oficina.trim().toLocaleLowerCase('pt-BR') === oficina.toLocaleLowerCase('pt-BR');
      const mesmoCostureiro =
        costureiro && item.costureiro.trim().toLocaleLowerCase('pt-BR') === costureiro.toLocaleLowerCase('pt-BR');
      return mesmaOficina || mesmoCostureiro || (!item.oficina.trim() && !item.costureiro.trim());
    });
    if (idx >= 0) {
      lista[idx] = {
        ...lista[idx],
        oficina: oficina || lista[idx].oficina,
        costureiro: costureiro || lista[idx].costureiro,
      };
    } else {
      lista.unshift({ id: 0, oficina, costureiro, observacoes: '' });
    }
  }
  return completarImpressao(lista, 4, { id: 0, oficina: '', costureiro: '', observacoes: '' });
}

export function htmlImpressaoOrdemCorte(corte: OrdemCorte, extras?: ExtraImpressaoOc): string {
  const tamanhos = corte.tamanhos.length ? corte.tamanhos : [...TAMANHOS_FICHA];
  const cores = completarImpressao(
    corte.linhas.length
      ? corte.linhas
      : nomesUnicos(corte.grade.map((celula) => celula.cor)).map((cor) => ({ cor, detalhes: '' })),
    6,
    { cor: '', detalhes: '' },
  );
  const totalGeral = corte.grade.reduce((soma, celula) => soma + celula.quantidade, 0);
  const totaisTamanho = tamanhos.map((tamanho) =>
    cores.reduce((soma, linha) => soma + celulaGrade(corte, linha.cor, tamanho), 0),
  );
  const linhasGrade = cores
    .map((linha) => {
      const qtds = tamanhos.map((tamanho) => celulaGrade(corte, linha.cor, tamanho));
      const total = qtds.reduce((soma, n) => soma + n, 0);
      return `<tr>
        <td>${escaparHtml(linha.cor)}</td>
        ${qtds.map((n) => `<td class="num">${n || ''}</td>`).join('')}
        <td>${escaparHtml(linha.detalhes)}</td>
        <td class="num">${total || ''}</td>
      </tr>`;
    })
    .join('');
  const aviamentos = completarImpressao(corte.aviamentos, 10, {
    id: 0,
    aviamento_id: null,
    descricao: '',
    quantidade: 0,
    unidade: '',
    observacoes: '',
  })
    .map((item) => {
      const descricao = [item.descricao, item.observacoes].filter((parte) => String(parte ?? '').trim()).join(' — ');
      return `<tr>
        <td>${escaparHtml(descricao)}</td>
        <td class="num">${item.quantidade || ''}</td>
        <td>${escaparHtml(item.unidade)}</td>
      </tr>`;
    })
    .join('');
  const oficinas = oficinasParaImpressao(corte, extras)
    .map(
      (item) => `<tr>
        <td>${escaparHtml(item.oficina)}</td>
        <td>${escaparHtml(item.costureiro)}</td>
        <td>${escaparHtml(item.observacoes)}</td>
      </tr>`,
    )
    .join('');
  const observacoes = (corte.observacoes ?? '').trim()
    ? `<tr>
        <td colspan="2">
          <div class="lab">Observações</div>
          <div class="bloco">${escaparHtml(corte.observacoes ?? '')}</div>
        </td>
      </tr>`
    : '';

  const temLiberacao = Boolean(
    extras?.costureiro ||
      extras?.oficina ||
      extras?.data_liberacao ||
      extras?.liberado_em ||
      extras?.valor_peca != null,
  );
  const blocoLiberacao = temLiberacao
    ? `<table class="oc-data">
          <tr>
            <td>
              <div class="lab">Data de liberação</div>
              <div class="val">${escaparHtml(formatarDataBr(extras?.data_liberacao || extras?.liberado_em))}</div>
            </td>
            <td>
              <div class="lab">Valor por peça</div>
              <div class="val">${escaparHtml(formatarMoedaBr(extras?.valor_peca))}</div>
            </td>
          </tr>
        </table>`
    : '';

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8">
  <title>${escaparHtml(corte.codigo)} — Ficha de produção</title>
  <style>
    @page { size: A4; margin: 8mm; }
    body { font-family: Arial, Helvetica, sans-serif; color: #111; background: #fff; margin: 0; }
    .folha { width: 100%; border-collapse: collapse; border: 2px solid #000; }
    .folha > tbody > tr > td { border: 1px solid #000; padding: 0; vertical-align: top; }
    .lab { font-size: 10px; font-weight: 800; letter-spacing: 0.05em; text-transform: uppercase; padding: 3px 6px 2px; }
    .val { font-size: 13px; min-height: 22px; padding: 4px 6px; border-top: 1px solid #000; }
    .centro { text-align: center; background: #efefef; border-bottom: 1px solid #000; }
    .inner { width: 100%; border-collapse: collapse; }
    .inner th, .inner td { border: 1px solid #000; padding: 4px 5px; font-size: 11px; height: 22px; }
    .inner th { background: #efefef; text-transform: uppercase; font-size: 10px; }
    .num { text-align: center; width: 38px; }
    .bloco { min-height: 46px; white-space: pre-wrap; padding: 4px 6px 6px; font-size: 12px; }
    .acab .bloco { min-height: 88px; }
    .modelo { width: 72%; }
    .ref { width: 28%; }
    .avia { width: 58%; }
    .dir { width: 42%; }
    .oc-data { width: 100%; border-collapse: collapse; }
    .oc-data td { width: 50%; border: 1px solid #000; padding: 0; vertical-align: top; }
  </style>
</head>
<body>
  <table class="folha">
    <tr>
      <td colspan="2">
        <div class="lab">Cliente</div>
        <div class="val">${escaparHtml(corte.cliente)}</div>
      </td>
    </tr>
    <tr>
      <td class="modelo">
        <div class="lab">Modelo</div>
        <div class="val">${escaparHtml(corte.modelo)}</div>
      </td>
      <td class="ref">
        <div class="lab">REF</div>
        <div class="val">${escaparHtml(corte.referencia)}</div>
      </td>
    </tr>
    <tr>
      <td colspan="2">
        <div class="lab">Composição</div>
        <div class="val">${escaparHtml(corte.composicao)}</div>
      </td>
    </tr>
    <tr>
      <td class="avia">
        <div class="lab centro">Aviamentos</div>
        <table class="inner">
          <tr><th>Descrição</th><th>Qtd</th><th>Un</th></tr>
          ${aviamentos}
        </table>
      </td>
      <td class="dir">
        <div class="lab centro">Oficina — Costureiro</div>
        <table class="inner">
          <tr><th>Oficina</th><th>Costureiro</th><th>Obs</th></tr>
          ${oficinas}
        </table>
        ${blocoLiberacao}
        <div class="lab">Informações para oficina</div>
        <div class="bloco">${escaparHtml(corte.informacoes_oficina)}</div>
        <table class="oc-data">
          <tr>
            <td>
              <div class="lab">O.C.</div>
              <div class="val">${escaparHtml(extras?.codigo_oc || corte.codigo)}</div>
            </td>
            <td>
              <div class="lab">Data de retirada</div>
              <div class="val">${escaparHtml(formatarDataBr(corte.data_retirada || extras?.data_retirada))}</div>
            </td>
          </tr>
        </table>
        <div class="lab">Informações dos costureiros</div>
        <div class="bloco">${escaparHtml(corte.informacoes_costureiros)}</div>
      </td>
    </tr>
    <tr>
      <td colspan="2">
        <table class="inner">
          <tr>
            <th>Cores</th>
            ${tamanhos.map((tamanho) => `<th class="num">${escaparHtml(tamanho)}</th>`).join('')}
            <th>Detalhes</th>
            <th class="num">Total</th>
          </tr>
          ${linhasGrade}
          <tr>
            <th>Total</th>
            ${totaisTamanho.map((n) => `<th class="num">${n || ''}</th>`).join('')}
            <th></th>
            <th class="num">${totalGeral}</th>
          </tr>
        </table>
      </td>
    </tr>
    <tr>
      <td colspan="2" class="acab">
        <div class="lab">Informações acabamento</div>
        <div class="bloco">${escaparHtml(corte.informacoes_acabamento)}</div>
      </td>
    </tr>
    ${observacoes}
  </table>
  <script>window.addEventListener('load', function () { setTimeout(function () { window.print(); }, 250); });</script>
</body>
</html>`;
}
