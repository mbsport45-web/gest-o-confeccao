import { Router } from 'express';
import { z } from 'zod';
import type { AppDatabase } from './db.js';
import { empresaDaSessao } from './tenant.js';

export const CODIGOS_PLANO = ['basico', 'profissional', 'enterprise'] as const;
export type CodigoPlano = (typeof CODIGOS_PLANO)[number];

export const PLANO_PADRAO: CodigoPlano = 'basico';
export const COBRANCA_DESATIVADA = 'desativada' as const;

export type LimitesPlano = {
  usuarios: number | null;
  clientes: number | null;
  produtos: number | null;
  materiais: number | null;
  pedidos_mes: number | null;
  ordens_mes: number | null;
};

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
  limites: LimitesPlano;
  recursos: RecursosPlano;
};

export const PLANOS_CATALOGO: PlanoCatalogo[] = [
  {
    codigo: 'basico',
    nome: 'Básico',
    descricao: 'Operação inicial da confecção, com limites para cadastros e produção.',
    ordem: 1,
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

const alterarPlanoSchema = z
  .object({
    plano: z.enum(CODIGOS_PLANO),
  })
  .strict();

type PlanoRow = {
  id: number;
  codigo: string;
  nome: string;
  descricao: string;
  ativo: number;
  ordem: number;
  limites_json: string;
  recursos_json: string;
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
}) {
  const catalogo = PLANOS_CATALOGO.find((p) => p.codigo === row.codigo);
  return {
    codigo: row.codigo,
    nome: row.nome,
    descricao: row.descricao,
    limites: parseJson<LimitesPlano>(row.limites_json, catalogo?.limites ?? PLANOS_CATALOGO[0].limites),
    recursos: parseJson<RecursosPlano>(row.recursos_json, catalogo?.recursos ?? PLANOS_CATALOGO[0].recursos),
    preco_mensal: null as number | null,
    preco_anual: null as number | null,
  };
}

export function mapearAssinatura(row: AssinaturaRow) {
  return {
    status: row.status,
    cobranca: row.cobranca,
    ciclo: row.ciclo,
    inicia_em: row.inicia_em,
    renova_em: row.renova_em,
    gateway: row.gateway,
    plano: mapearPlano(row),
  };
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
  `);

  const upsert = db.prepare(
    `INSERT INTO planos (codigo, nome, descricao, ativo, ordem, limites_json, recursos_json)
     VALUES (@codigo, @nome, @descricao, 1, @ordem, @limites_json, @recursos_json)
     ON CONFLICT(codigo) DO UPDATE SET
       nome = excluded.nome,
       descricao = excluded.descricao,
       ativo = 1,
       ordem = excluded.ordem,
       limites_json = excluded.limites_json,
       recursos_json = excluded.recursos_json`,
  );
  for (const plano of PLANOS_CATALOGO) {
    upsert.run({
      codigo: plano.codigo,
      nome: plano.nome,
      descricao: plano.descricao,
      ordem: plano.ordem,
      limites_json: JSON.stringify(plano.limites),
      recursos_json: JSON.stringify(plano.recursos),
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
    `INSERT INTO assinaturas (empresa_id, plano_id, status, cobranca, ciclo)
     VALUES (?, ?, 'ativa', 'desativada', 'mensal')`,
  ).run(empresaId, plano.id);
}

const ASSINATURA_SELECT = `
  SELECT
    a.id, a.empresa_id, a.status, a.cobranca, a.ciclo, a.inicia_em, a.renova_em,
    a.gateway, a.gateway_assinatura_id, a.atualizado_em,
    p.id AS plano_pk, p.codigo, p.nome, p.descricao, p.ativo, p.ordem, p.limites_json, p.recursos_json
    FROM assinaturas a
    JOIN planos p ON p.id = a.plano_id
`;

export function obterAssinaturaDaEmpresa(db: AppDatabase, empresaId: number) {
  garantirAssinatura(db, empresaId);
  const row = db.prepare(`${ASSINATURA_SELECT} WHERE a.empresa_id = ?`).get(empresaId) as
    | AssinaturaRow
    | undefined;
  if (!row) throw new Error('assinatura não encontrada');
  return mapearAssinatura(row);
}

export function listarPlanos(db: AppDatabase) {
  const rows = db
    .prepare(
      `SELECT codigo, nome, descricao, limites_json, recursos_json
         FROM planos WHERE ativo = 1 ORDER BY ordem, id`,
    )
    .all() as PlanoRow[];
  return rows.map(mapearPlano);
}

export function createPlanosRouter(db: AppDatabase): Router {
  const router = Router();
  router.get('/', (_req, res) => {
    res.json({ data: listarPlanos(db), cobranca: COBRANCA_DESATIVADA });
  });
  return router;
}

export function createAssinaturaRouter(db: AppDatabase): Router {
  const router = Router();

  router.get('/', (req, res) => {
    res.json(obterAssinaturaDaEmpresa(db, empresaDaSessao(req)));
  });

  router.patch('/', (req, res) => {
    const parsed = alterarPlanoSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        erro: 'Dados inválidos',
        detalhes: parsed.error.flatten().fieldErrors,
      });
    }
    const empresaId = empresaDaSessao(req);
    const plano = db
      .prepare('SELECT id FROM planos WHERE codigo = ? AND ativo = 1')
      .get(parsed.data.plano) as { id: number } | undefined;
    if (!plano) return res.status(404).json({ erro: 'Plano não encontrado' });
    garantirAssinatura(db, empresaId);
    db.prepare(
      `UPDATE assinaturas
          SET plano_id = ?, cobranca = 'desativada', gateway = NULL, gateway_assinatura_id = NULL,
              atualizado_em = datetime('now')
        WHERE empresa_id = ?`,
    ).run(plano.id, empresaId);
    res.json(obterAssinaturaDaEmpresa(db, empresaId));
  });

  return router;
}
