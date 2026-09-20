import { Router, type RequestHandler } from 'express';
import { z } from 'zod';
import type { AppDatabase } from './db.js';
import { empresaDaSessao } from './tenant.js';

export const CODIGOS_PLANO = ['basico', 'profissional', 'enterprise'] as const;
export type CodigoPlano = (typeof CODIGOS_PLANO)[number];

export const PLANO_PADRAO: CodigoPlano = 'basico';
export const COBRANCA_DESATIVADA = 'desativada' as const;
export const STATUS_ASSINATURA_PADRAO = 'trial' as const;
export const TRIAL_DIAS = 14;
export const CICLO_DIAS = 30;
export const ATRASO_GRACA_DIAS = 7;
export const CICLO_PADRAO = 'mensal' as const;
export const MOEDA_PLANO = 'BRL' as const;

export const TIPOS_OPERACAO_COMERCIAL = ['assinar', 'upgrade', 'downgrade', 'cancelar'] as const;
export type TipoOperacaoComercial = (typeof TIPOS_OPERACAO_COMERCIAL)[number];

export const TIPOS_EVENTO_ASSINATURA = [
  'assinar',
  'upgrade',
  'downgrade',
  'cancelar',
  'regularizar',
  'marcar_atraso',
  'expirar',
] as const;
export type TipoEventoAssinatura = (typeof TIPOS_EVENTO_ASSINATURA)[number];
export type TipoMudancaPlano = 'upgrade' | 'downgrade' | 'manter';

export const STATUS_ASSINATURA = [
  'trial',
  'ativa',
  'past_due',
  'cancelada',
  'expirada',
] as const;
export type StatusAssinatura = (typeof STATUS_ASSINATURA)[number];

export const ACOES_ASSINATURA = [
  'ativar',
  'cancelar',
  'regularizar',
  'reativar',
  'renovar',
  'marcar_atraso',
  'expirar',
] as const;
export type AcaoAssinatura = (typeof ACOES_ASSINATURA)[number];

export const CODIGO_ASSINATURA_BLOQUEADA = 'assinatura_bloqueada' as const;

export const STATUS_ASSINATURA_LABEL: Record<StatusAssinatura, string> = {
  trial: 'Período de avaliação',
  ativa: 'Ativa',
  past_due: 'Em atraso',
  cancelada: 'Cancelada',
  expirada: 'Expirada',
};

export const TRANSICOES_ASSINATURA: Record<
  AcaoAssinatura,
  { de: StatusAssinatura[]; para: StatusAssinatura }
> = {
  ativar: { de: ['trial'], para: 'ativa' },
  cancelar: { de: ['trial', 'ativa', 'past_due'], para: 'cancelada' },
  regularizar: { de: ['past_due'], para: 'ativa' },
  reativar: { de: ['cancelada'], para: 'ativa' },
  renovar: { de: ['expirada'], para: 'ativa' },
  marcar_atraso: { de: ['ativa'], para: 'past_due' },
  expirar: { de: ['trial', 'past_due', 'cancelada'], para: 'expirada' },
};

export const ACAO_ASSINATURA_LABEL: Record<AcaoAssinatura, string> = {
  ativar: 'Ativar assinatura',
  cancelar: 'Cancelar assinatura',
  regularizar: 'Regularizar atraso',
  reativar: 'Reativar assinatura',
  renovar: 'Renovar assinatura',
  marcar_atraso: 'Simular atraso',
  expirar: 'Simular expiração',
};

export function isStatusAssinatura(valor: unknown): valor is StatusAssinatura {
  return typeof valor === 'string' && (STATUS_ASSINATURA as readonly string[]).includes(valor);
}

export function politicaDaAssinatura(status: StatusAssinatura) {
  const operacional = status === 'trial' || status === 'ativa';
  const acoes = (Object.keys(TRANSICOES_ASSINATURA) as AcaoAssinatura[]).filter((acao) =>
    TRANSICOES_ASSINATURA[acao].de.includes(status),
  );
  if (operacional) {
    return {
      leitura: true,
      operacional: true,
      trocar_plano: true,
      permite: [
        'Ler os dados da empresa',
        'Criar, editar e excluir cadastros e produção dentro dos limites do plano',
        'Trocar de plano',
        'Gerenciar o status da assinatura',
      ],
      bloqueia: ['Cobrança real (catálogo com preço mensal; gateway ainda desativado)'],
      acoes,
    };
  }
  const bloqueia = [
    'Criar, editar ou excluir cadastros, pedidos, OPs e demais dados operacionais',
    'Trocar de plano enquanto a assinatura não estiver operacional',
    'Aceitar novos convites',
  ];
  const permite = [
    'Entrar na empresa e ler os dados já gravados',
    'Ver o plano, o uso e o status da assinatura',
    'Regularizar, reativar ou renovar (assinatura mensal preparada, sem gateway nesta etapa)',
  ];
  return {
    leitura: true,
    operacional: false,
    trocar_plano: false,
    permite,
    bloqueia,
    acoes,
  };
}

export function mensagemAssinaturaBloqueada(status: StatusAssinatura): string {
  const label = STATUS_ASSINATURA_LABEL[status];
  return `Assinatura ${label.toLowerCase()}: os dados da empresa continuam acessíveis em leitura. Regularize, reative ou renove o plano para voltar a operar.`;
}

export function corpoAssinaturaBloqueada(status: StatusAssinatura) {
  return {
    erro: mensagemAssinaturaBloqueada(status),
    codigo: CODIGO_ASSINATURA_BLOQUEADA,
    status,
    operacional: false,
  };
}

export type LimitesPlano = {
  usuarios: number | null;
  clientes: number | null;
  produtos: number | null;
  materiais: number | null;
  pedidos_mes: number | null;
  ordens_mes: number | null;
};

export const CHAVES_LIMITE = [
  'usuarios',
  'clientes',
  'produtos',
  'materiais',
  'pedidos_mes',
  'ordens_mes',
] as const;
export type ChaveLimite = (typeof CHAVES_LIMITE)[number];

export const LIMITE_LABEL: Record<ChaveLimite, string> = {
  usuarios: 'usuários',
  clientes: 'clientes',
  produtos: 'produtos',
  materiais: 'matérias-primas',
  pedidos_mes: 'pedidos deste mês',
  ordens_mes: 'ordens de produção deste mês',
};

export type UsoLimite = {
  atual: number;
  maximo: number | null;
  atingido: boolean;
};

export type UsoPlano = Record<ChaveLimite, UsoLimite>;

export const CODIGO_LIMITE_PLANO = 'limite_plano' as const;

export type RecursosPlano = {
  expedicao: boolean;
  financeiro: boolean;
  relatorios_avancados: boolean;
  api_externa: boolean;
  suporte_prioritario: boolean;
};

export type PlanoCatalogo = {
  codigo: CodigoPlano;
  nome: string;
  descricao: string;
  ordem: number;
  preco_mensal: number;
  preco_anual: number | null;
  moeda: typeof MOEDA_PLANO;
  limites: LimitesPlano;
  recursos: RecursosPlano;
};

export const PLANOS_CATALOGO: PlanoCatalogo[] = [
  {
    codigo: 'basico',
    nome: 'Básico',
    descricao: 'Operação inicial da confecção, com limites para cadastros e produção.',
    ordem: 1,
    preco_mensal: 99.9,
    preco_anual: null,
    moeda: MOEDA_PLANO,
    limites: {
      usuarios: 3,
      clientes: 50,
      produtos: 30,
      materiais: 50,
      pedidos_mes: 50,
      ordens_mes: 20,
    },
    recursos: {
      expedicao: true,
      financeiro: true,
      relatorios_avancados: false,
      api_externa: false,
      suporte_prioritario: false,
    },
  },
  {
    codigo: 'profissional',
    nome: 'Profissional',
    descricao: 'Volume maior de cadastros, pedidos e relatórios avançados.',
    ordem: 2,
    preco_mensal: 149.9,
    preco_anual: null,
    moeda: MOEDA_PLANO,
    limites: {
      usuarios: 15,
      clientes: 500,
      produtos: 200,
      materiais: 300,
      pedidos_mes: 500,
      ordens_mes: 200,
    },
    recursos: {
      expedicao: true,
      financeiro: true,
      relatorios_avancados: true,
      api_externa: false,
      suporte_prioritario: false,
    },
  },
  {
    codigo: 'enterprise',
    nome: 'Enterprise',
    descricao: 'Sem limite prático de uso, com API e suporte prioritário.',
    ordem: 3,
    preco_mensal: 199.9,
    preco_anual: null,
    moeda: MOEDA_PLANO,
    limites: {
      usuarios: null,
      clientes: null,
      produtos: null,
      materiais: null,
      pedidos_mes: null,
      ordens_mes: null,
    },
    recursos: {
      expedicao: true,
      financeiro: true,
      relatorios_avancados: true,
      api_externa: true,
      suporte_prioritario: true,
    },
  },
];

export function isCodigoPlano(valor: unknown): valor is CodigoPlano {
  return typeof valor === 'string' && (CODIGOS_PLANO as readonly string[]).includes(valor);
}

export function planoDoCatalogo(codigo: CodigoPlano): PlanoCatalogo {
  const plano = PLANOS_CATALOGO.find((item) => item.codigo === codigo);
  if (!plano) throw new Error(`plano ${codigo} não cadastrado`);
  return plano;
}

export function classificarMudancaPlano(de: CodigoPlano, para: CodigoPlano): TipoMudancaPlano {
  const ordemDe = planoDoCatalogo(de).ordem;
  const ordemPara = planoDoCatalogo(para).ordem;
  if (ordemPara > ordemDe) return 'upgrade';
  if (ordemPara < ordemDe) return 'downgrade';
  return 'manter';
}

export function tipoEventoDaAcao(acao: AcaoAssinatura): TipoEventoAssinatura {
  if (acao === 'ativar' || acao === 'reativar' || acao === 'renovar') return 'assinar';
  if (acao === 'cancelar') return 'cancelar';
  if (acao === 'regularizar') return 'regularizar';
  if (acao === 'marcar_atraso') return 'marcar_atraso';
  return 'expirar';
}

export function formatarPrecoMensal(valor: number | null, moeda: string = MOEDA_PLANO): string {
  if (valor === null) return 'Preço sob consulta';
  const [reais, centavos] = valor.toFixed(2).split('.');
  const simbolo = moeda === 'BRL' ? 'R$' : moeda;
  return `${simbolo} ${reais.replace(/\B(?=(\d{3})+(?!\d))/g, '.')},${centavos}/mês`;
}

const alterarAssinaturaSchema = z
  .object({
    plano: z.enum(CODIGOS_PLANO).optional(),
    acao: z.enum(ACOES_ASSINATURA).optional(),
  })
  .strict()
  .refine((body) => Boolean(body.plano) !== Boolean(body.acao), {
    message: 'Informe plano ou acao',
  });

type PlanoRow = {
  id: number;
  codigo: string;
  nome: string;
  descricao: string;
  ativo: number;
  ordem: number;
  limites_json: string;
  recursos_json: string;
  preco_mensal: number | null;
  moeda: string | null;
};

type EventoAssinaturaRow = {
  id: number;
  empresa_id: number;
  tipo: string;
  de_plano: string | null;
  para_plano: string | null;
  de_status: string | null;
  para_status: string | null;
  ciclo: string;
  moeda: string;
  valor_mensal: number | null;
  cobranca: string;
  gateway: string | null;
  criado_em: string;
};

type AssinaturaRow = {
  id: number;
  empresa_id: number;
  status: string;
  cobranca: string;
  ciclo: string;
  inicia_em: string;
  renova_em: string | null;
  gateway: string | null;
  gateway_assinatura_id: string | null;
  atualizado_em: string;
} & PlanoRow;

function parseJson<T>(texto: string, fallback: T): T {
  try {
    return JSON.parse(texto) as T;
  } catch {
    return fallback;
  }
}

export function mapearPlano(row: {
  codigo: string;
  nome: string;
  descricao: string;
  limites_json: string;
  recursos_json: string;
  ordem?: number;
  preco_mensal?: number | null;
  moeda?: string | null;
}) {
  const catalogo = PLANOS_CATALOGO.find((p) => p.codigo === row.codigo);
  const precoCatalogo = catalogo?.preco_mensal;
  const precoLinha = typeof row.preco_mensal === 'number' ? row.preco_mensal : null;
  return {
    codigo: row.codigo,
    nome: row.nome,
    descricao: row.descricao,
    ordem: row.ordem ?? catalogo?.ordem ?? 0,
    limites: parseJson<LimitesPlano>(row.limites_json, catalogo?.limites ?? PLANOS_CATALOGO[0].limites),
    recursos: parseJson<RecursosPlano>(row.recursos_json, catalogo?.recursos ?? PLANOS_CATALOGO[0].recursos),
    preco_mensal: precoCatalogo ?? precoLinha,
    preco_anual: catalogo?.preco_anual ?? null,
    moeda: row.moeda || catalogo?.moeda || MOEDA_PLANO,
    ciclo: CICLO_PADRAO,
  };
}

export function mapearEventoAssinatura(row: EventoAssinaturaRow) {
  return {
    id: row.id,
    tipo: row.tipo as TipoEventoAssinatura,
    de_plano: row.de_plano,
    para_plano: row.para_plano,
    de_status: row.de_status,
    para_status: row.para_status,
    ciclo: row.ciclo,
    moeda: row.moeda,
    valor_mensal: row.valor_mensal,
    cobranca: row.cobranca,
    gateway: row.gateway,
    criado_em: row.criado_em,
  };
}

export function mapearAssinatura(row: AssinaturaRow) {
  const status: StatusAssinatura = isStatusAssinatura(row.status) ? row.status : 'ativa';
  const politica = politicaDaAssinatura(status);
  const plano = mapearPlano(row);
  return {
    status,
    status_label: STATUS_ASSINATURA_LABEL[status],
    cobranca: COBRANCA_DESATIVADA,
    ciclo: row.ciclo || CICLO_PADRAO,
    inicia_em: row.inicia_em,
    renova_em: row.renova_em,
    gateway: null as string | null,
    plano,
    comercial: {
      ciclo: CICLO_PADRAO,
      moeda: plano.moeda,
      valor_mensal: plano.preco_mensal,
      preco_anual: plano.preco_anual,
      gateway: null as string | null,
      cobranca: COBRANCA_DESATIVADA,
      pronta: false,
      operacoes: [...TIPOS_OPERACAO_COMERCIAL],
    },
    acesso: {
      leitura: politica.leitura,
      operacional: politica.operacional,
      trocar_plano: politica.trocar_plano,
    },
    politica,
  };
}

function contar(db: AppDatabase, sql: string, empresaId: number): number {
  return (db.prepare(sql).get(empresaId) as { n: number }).n;
}

export function contarUso(db: AppDatabase, empresaId: number): Record<ChaveLimite, number> {
  const usuarios = contar(db, 'SELECT COUNT(*) AS n FROM usuarios WHERE empresa_id = ?', empresaId);
  const convitesPendentes = contar(
    db,
    `SELECT COUNT(*) AS n FROM convites WHERE empresa_id = ? AND status = 'pendente'`,
    empresaId,
  );
  return {
    usuarios: usuarios + convitesPendentes,
    clientes: contar(db, 'SELECT COUNT(*) AS n FROM clientes WHERE empresa_id = ?', empresaId),
    produtos: contar(db, 'SELECT COUNT(*) AS n FROM produtos WHERE empresa_id = ?', empresaId),
    materiais: contar(db, 'SELECT COUNT(*) AS n FROM materias_primas WHERE empresa_id = ?', empresaId),
    pedidos_mes: contar(
      db,
      `SELECT COUNT(*) AS n FROM pedidos
        WHERE empresa_id = ? AND strftime('%Y-%m', criado_em) = strftime('%Y-%m', 'now')`,
      empresaId,
    ),
    ordens_mes: contar(
      db,
      `SELECT COUNT(*) AS n FROM ordens_producao
        WHERE empresa_id = ? AND strftime('%Y-%m', criado_em) = strftime('%Y-%m', 'now')`,
      empresaId,
    ),
  };
}

export function montarUso(db: AppDatabase, empresaId: number, limites: LimitesPlano): UsoPlano {
  const atual = contarUso(db, empresaId);
  const uso = {} as UsoPlano;
  for (const chave of CHAVES_LIMITE) {
    const maximo = limites[chave];
    const n = atual[chave];
    uso[chave] = {
      atual: n,
      maximo,
      atingido: maximo !== null && n >= maximo,
    };
  }
  return uso;
}

export function mensagemLimiteAtingido(
  planoNome: string,
  chave: ChaveLimite,
  atual: number,
  maximo: number,
): string {
  return `Limite do plano ${planoNome} atingido: ${LIMITE_LABEL[chave]} (${atual}/${maximo}). Faça upgrade do plano para continuar.`;
}

export type BloqueioLimite = {
  erro: string;
  codigo: typeof CODIGO_LIMITE_PLANO;
  limite: { chave: ChaveLimite; atual: number; maximo: number; plano: string };
  upgrade: true;
};

export type ResultadoLimite =
  | { ok: true }
  | { ok: false; corpo: BloqueioLimite };

export function avaliarLimite(
  db: AppDatabase,
  empresaId: number,
  chave: ChaveLimite,
  incremento = 1,
  ocupacao?: number,
): ResultadoLimite {
  garantirAssinatura(db, empresaId);
  const row = db.prepare(`${ASSINATURA_SELECT} WHERE a.empresa_id = ?`).get(empresaId) as
    | AssinaturaRow
    | undefined;
  if (!row) throw new Error('assinatura não encontrada');
  const plano = mapearPlano(row);
  const maximo = plano.limites[chave];
  if (maximo === null) return { ok: true };
  const atual = ocupacao ?? contarUso(db, empresaId)[chave];
  if (atual + incremento > maximo) {
    return {
      ok: false,
      corpo: {
        erro: mensagemLimiteAtingido(plano.nome, chave, atual, maximo),
        codigo: CODIGO_LIMITE_PLANO,
        limite: { chave, atual, maximo, plano: plano.codigo },
        upgrade: true,
      },
    };
  }
  return { ok: true };
}

export function exigirLimite(
  db: AppDatabase,
  chave: ChaveLimite,
  incremento = 1,
): RequestHandler {
  return (req, res, next) => {
    const resultado = avaliarLimite(db, empresaDaSessao(req), chave, incremento);
    if (!resultado.ok) {
      return res.status(409).json(resultado.corpo);
    }
    next();
  };
}

function vencidaEm(renovaEm: string | null, agora: string): boolean {
  return Boolean(renovaEm && renovaEm <= agora);
}

export function sincronizarAssinatura(db: AppDatabase, empresaId: number) {
  garantirAssinatura(db, empresaId);
  const row = db.prepare(`${ASSINATURA_SELECT} WHERE a.empresa_id = ?`).get(empresaId) as
    | AssinaturaRow
    | undefined;
  if (!row) return;
  const status = isStatusAssinatura(row.status) ? row.status : 'ativa';
  const agora = (db.prepare(`SELECT datetime('now') AS n`).get() as { n: string }).n;
  const deveExpirar =
    (status === 'trial' || status === 'past_due' || status === 'cancelada') &&
    vencidaEm(row.renova_em, agora);
  if (!deveExpirar) return;
  const dePlano = isCodigoPlano(row.codigo) ? row.codigo : PLANO_PADRAO;
  const valor = planoDoCatalogo(dePlano).preco_mensal;
  db.prepare(
    `UPDATE assinaturas
        SET status = 'expirada', cobranca = 'desativada', gateway = NULL, gateway_assinatura_id = NULL,
            atualizado_em = datetime('now')
      WHERE empresa_id = ?`,
  ).run(empresaId);
  registrarEventoAssinatura(db, empresaId, {
    tipo: 'expirar',
    de_plano: dePlano,
    para_plano: dePlano,
    de_status: status,
    para_status: 'expirada',
    valor_mensal: valor,
  });
}

export function aplicarAcaoAssinatura(
  db: AppDatabase,
  empresaId: number,
  acao: AcaoAssinatura,
): { ok: true } | { ok: false; statusHttp: number; corpo: Record<string, unknown> } {
  sincronizarAssinatura(db, empresaId);
  const row = db.prepare(`${ASSINATURA_SELECT} WHERE a.empresa_id = ?`).get(empresaId) as
    | AssinaturaRow
    | undefined;
  if (!row) return { ok: false, statusHttp: 404, corpo: { erro: 'Assinatura não encontrada' } };
  const atual: StatusAssinatura = isStatusAssinatura(row.status) ? row.status : 'ativa';
  const regra = TRANSICOES_ASSINATURA[acao];
  if (!regra.de.includes(atual)) {
    return {
      ok: false,
      statusHttp: 409,
      corpo: {
        erro: `Não é possível ${ACAO_ASSINATURA_LABEL[acao].toLowerCase()} a partir do status ${STATUS_ASSINATURA_LABEL[atual].toLowerCase()}.`,
        codigo: 'transicao_invalida',
        de: atual,
        acao,
      },
    };
  }
  const proximo = regra.para;
  let renovaSql = 'renova_em';
  if (proximo === 'ativa') {
    renovaSql = `datetime('now', '+${CICLO_DIAS} days')`;
  } else if (proximo === 'past_due') {
    renovaSql = `datetime('now', '+${ATRASO_GRACA_DIAS} days')`;
  } else if (proximo === 'expirada') {
    renovaSql = `datetime('now')`;
  }
  db.prepare(
    `UPDATE assinaturas
        SET status = ?, cobranca = 'desativada', gateway = NULL, gateway_assinatura_id = NULL,
            inicia_em = CASE WHEN ? IN ('ativa', 'trial') THEN datetime('now') ELSE inicia_em END,
            renova_em = ${renovaSql},
            atualizado_em = datetime('now')
      WHERE empresa_id = ?`,
  ).run(proximo, proximo, empresaId);
  const planoAtual = isCodigoPlano(row.codigo) ? row.codigo : PLANO_PADRAO;
  registrarEventoAssinatura(db, empresaId, {
    tipo: tipoEventoDaAcao(acao),
    de_plano: planoAtual,
    para_plano: planoAtual,
    de_status: atual,
    para_status: proximo,
    valor_mensal: planoDoCatalogo(planoAtual).preco_mensal,
  });
  return { ok: true };
}

export function exigirAssinaturaOperacional(db: AppDatabase): RequestHandler {
  return (req, res, next) => {
    const metodo = req.method.toUpperCase();
    if (metodo === 'GET' || metodo === 'HEAD' || metodo === 'OPTIONS') return next();
    const caminho = (req.originalUrl || req.path || '').split('?')[0];
    if (
      caminho === '/api/assinatura' ||
      caminho.startsWith('/api/assinatura/') ||
      caminho === '/api/planos' ||
      caminho.startsWith('/api/planos/')
    ) {
      return next();
    }
    const empresaId = empresaDaSessao(req);
    sincronizarAssinatura(db, empresaId);
    const assinatura = obterAssinaturaDaEmpresa(db, empresaId);
    if (assinatura.acesso.operacional) return next();
    return res.status(403).json(corpoAssinaturaBloqueada(assinatura.status));
  };
}

function garantirColuna(db: AppDatabase, tabela: string, coluna: string, ddl: string) {
  const cols = db.prepare(`PRAGMA table_info(${tabela})`).all() as Array<{ name: string }>;
  if (!cols.some((col) => col.name === coluna)) {
    db.exec(ddl);
  }
}

function registrarEventoAssinatura(
  db: AppDatabase,
  empresaId: number,
  evento: {
    tipo: TipoEventoAssinatura;
    de_plano: string | null;
    para_plano: string | null;
    de_status: string | null;
    para_status: string | null;
    valor_mensal: number | null;
  },
) {
  db.prepare(
    `INSERT INTO eventos_assinatura (
        empresa_id, tipo, de_plano, para_plano, de_status, para_status,
        ciclo, moeda, valor_mensal, cobranca, gateway
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)`,
  ).run(
    empresaId,
    evento.tipo,
    evento.de_plano,
    evento.para_plano,
    evento.de_status,
    evento.para_status,
    CICLO_PADRAO,
    MOEDA_PLANO,
    evento.valor_mensal,
    COBRANCA_DESATIVADA,
  );
}

export function aplicarSchemaPlanos(db: AppDatabase) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS planos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      codigo TEXT NOT NULL UNIQUE,
      nome TEXT NOT NULL,
      descricao TEXT NOT NULL,
      ativo INTEGER NOT NULL DEFAULT 1,
      ordem INTEGER NOT NULL DEFAULT 0,
      limites_json TEXT NOT NULL,
      recursos_json TEXT NOT NULL,
      preco_mensal REAL,
      moeda TEXT NOT NULL DEFAULT 'BRL',
      criado_em TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS assinaturas (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      empresa_id INTEGER NOT NULL UNIQUE REFERENCES empresas(id),
      plano_id INTEGER NOT NULL REFERENCES planos(id),
      status TEXT NOT NULL DEFAULT 'ativa',
      cobranca TEXT NOT NULL DEFAULT 'desativada',
      ciclo TEXT NOT NULL DEFAULT 'mensal',
      inicia_em TEXT NOT NULL DEFAULT (datetime('now')),
      renova_em TEXT,
      gateway TEXT,
      gateway_assinatura_id TEXT,
      criado_em TEXT NOT NULL DEFAULT (datetime('now')),
      atualizado_em TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS assinaturas_plano ON assinaturas (plano_id);

    CREATE TABLE IF NOT EXISTS eventos_assinatura (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      empresa_id INTEGER NOT NULL REFERENCES empresas(id),
      tipo TEXT NOT NULL,
      de_plano TEXT,
      para_plano TEXT,
      de_status TEXT,
      para_status TEXT,
      ciclo TEXT NOT NULL DEFAULT 'mensal',
      moeda TEXT NOT NULL DEFAULT 'BRL',
      valor_mensal REAL,
      cobranca TEXT NOT NULL DEFAULT 'desativada',
      gateway TEXT,
      criado_em TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS eventos_assinatura_empresa
      ON eventos_assinatura (empresa_id, id);
  `);

  garantirColuna(db, 'planos', 'preco_mensal', 'ALTER TABLE planos ADD COLUMN preco_mensal REAL');
  garantirColuna(db, 'planos', 'moeda', `ALTER TABLE planos ADD COLUMN moeda TEXT NOT NULL DEFAULT 'BRL'`);

  const upsert = db.prepare(
    `INSERT INTO planos (codigo, nome, descricao, ativo, ordem, limites_json, recursos_json, preco_mensal, moeda)
     VALUES (@codigo, @nome, @descricao, 1, @ordem, @limites_json, @recursos_json, @preco_mensal, @moeda)
     ON CONFLICT(codigo) DO UPDATE SET
       nome = excluded.nome,
       descricao = excluded.descricao,
       ativo = 1,
       ordem = excluded.ordem,
       limites_json = excluded.limites_json,
       recursos_json = excluded.recursos_json,
       preco_mensal = excluded.preco_mensal,
       moeda = excluded.moeda`,
  );
  for (const plano of PLANOS_CATALOGO) {
    upsert.run({
      codigo: plano.codigo,
      nome: plano.nome,
      descricao: plano.descricao,
      ordem: plano.ordem,
      limites_json: JSON.stringify(plano.limites),
      recursos_json: JSON.stringify(plano.recursos),
      preco_mensal: plano.preco_mensal,
      moeda: plano.moeda,
    });
  }

  const empresas = db.prepare('SELECT id FROM empresas').all() as Array<{ id: number }>;
  for (const empresa of empresas) {
    garantirAssinatura(db, empresa.id);
  }
}

export function garantirAssinatura(db: AppDatabase, empresaId: number, codigo: CodigoPlano = PLANO_PADRAO) {
  const atual = db.prepare('SELECT id FROM assinaturas WHERE empresa_id = ?').get(empresaId);
  if (atual) return;
  const plano = db
    .prepare('SELECT id FROM planos WHERE codigo = ?')
    .get(codigo) as { id: number } | undefined;
  if (!plano) throw new Error(`plano ${codigo} não cadastrado`);
  db.prepare(
    `INSERT INTO assinaturas (empresa_id, plano_id, status, cobranca, ciclo, renova_em)
     VALUES (?, ?, 'trial', 'desativada', 'mensal', datetime('now', '+${TRIAL_DIAS} days'))`,
  ).run(empresaId, plano.id);
}

const ASSINATURA_SELECT = `
  SELECT
    a.id, a.empresa_id, a.status, a.cobranca, a.ciclo, a.inicia_em, a.renova_em,
    a.gateway, a.gateway_assinatura_id, a.atualizado_em,
    p.id AS plano_pk, p.codigo, p.nome, p.descricao, p.ativo, p.ordem, p.limites_json, p.recursos_json,
    p.preco_mensal, p.moeda
    FROM assinaturas a
    JOIN planos p ON p.id = a.plano_id
`;

export function obterAssinaturaDaEmpresa(db: AppDatabase, empresaId: number) {
  sincronizarAssinatura(db, empresaId);
  const row = db.prepare(`${ASSINATURA_SELECT} WHERE a.empresa_id = ?`).get(empresaId) as
    | AssinaturaRow
    | undefined;
  if (!row) throw new Error('assinatura não encontrada');
  const assinatura = mapearAssinatura(row);
  return {
    ...assinatura,
    uso: montarUso(db, empresaId, assinatura.plano.limites),
  };
}

export function listarPlanos(db: AppDatabase) {
  const rows = db
    .prepare(
      `SELECT codigo, nome, descricao, ordem, limites_json, recursos_json, preco_mensal, moeda
         FROM planos WHERE ativo = 1 ORDER BY ordem, id`,
    )
    .all() as PlanoRow[];
  return rows.map(mapearPlano);
}

export function listarEventosAssinatura(db: AppDatabase, empresaId: number) {
  const rows = db
    .prepare(
      `SELECT id, empresa_id, tipo, de_plano, para_plano, de_status, para_status,
              ciclo, moeda, valor_mensal, cobranca, gateway, criado_em
         FROM eventos_assinatura
        WHERE empresa_id = ?
        ORDER BY id DESC`,
    )
    .all(empresaId) as EventoAssinaturaRow[];
  return rows.map(mapearEventoAssinatura);
}

export function createPlanosRouter(db: AppDatabase): Router {
  const router = Router();
  router.get('/', (_req, res) => {
    res.json({
      data: listarPlanos(db),
      cobranca: COBRANCA_DESATIVADA,
      ciclo: CICLO_PADRAO,
      moeda: MOEDA_PLANO,
      gateway: null,
    });
  });
  return router;
}

export function createAssinaturaRouter(db: AppDatabase): Router {
  const router = Router();

  router.get('/', (req, res) => {
    res.json(obterAssinaturaDaEmpresa(db, empresaDaSessao(req)));
  });

  router.get('/eventos', (req, res) => {
    res.json({
      data: listarEventosAssinatura(db, empresaDaSessao(req)),
      cobranca: COBRANCA_DESATIVADA,
      ciclo: CICLO_PADRAO,
      gateway: null,
    });
  });

  router.patch('/', (req, res) => {
    const parsed = alterarAssinaturaSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        erro: 'Dados inválidos',
        detalhes: parsed.error.flatten().fieldErrors,
        form: parsed.error.flatten().formErrors,
      });
    }
    const empresaId = empresaDaSessao(req);
    sincronizarAssinatura(db, empresaId);

    if (parsed.data.acao) {
      const resultado = aplicarAcaoAssinatura(db, empresaId, parsed.data.acao);
      if (!resultado.ok) return res.status(resultado.statusHttp).json(resultado.corpo);
      return res.json(obterAssinaturaDaEmpresa(db, empresaId));
    }

    const atual = obterAssinaturaDaEmpresa(db, empresaId);
    if (!atual.acesso.trocar_plano) {
      return res.status(403).json(corpoAssinaturaBloqueada(atual.status));
    }
    const codigoDestino = parsed.data.plano;
    if (!codigoDestino) return res.status(400).json({ erro: 'Informe plano ou acao' });
    const tipo = isCodigoPlano(atual.plano.codigo)
      ? classificarMudancaPlano(atual.plano.codigo, codigoDestino)
      : 'upgrade';
    if (tipo === 'manter') {
      return res.json(obterAssinaturaDaEmpresa(db, empresaId));
    }
    const plano = db
      .prepare('SELECT id FROM planos WHERE codigo = ? AND ativo = 1')
      .get(codigoDestino) as { id: number } | undefined;
    if (!plano) return res.status(404).json({ erro: 'Plano não encontrado' });
    db.prepare(
      `UPDATE assinaturas
          SET plano_id = ?, cobranca = 'desativada', gateway = NULL, gateway_assinatura_id = NULL,
              atualizado_em = datetime('now')
        WHERE empresa_id = ?`,
    ).run(plano.id, empresaId);
    registrarEventoAssinatura(db, empresaId, {
      tipo,
      de_plano: atual.plano.codigo,
      para_plano: codigoDestino,
      de_status: atual.status,
      para_status: atual.status,
      valor_mensal: planoDoCatalogo(codigoDestino).preco_mensal,
    });
    res.json(obterAssinaturaDaEmpresa(db, empresaId));
  });

  return router;
}
