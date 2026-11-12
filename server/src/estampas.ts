import { Router } from 'express';
import { z } from 'zod';
import type { AppDatabase } from './db.js';
import { aplicarEmpresa, empresaDaSessao } from './tenant.js';

export const TIPOS_ESTAMPA = ['amostra', 'corte'] as const;
export type TipoEstampa = (typeof TIPOS_ESTAMPA)[number];

export type CelulaEstampa = {
  cor: string;
  tamanho: string;
  quantidade: number;
};

export type OcDisponivelEstampa = {
  id: number;
  origem: 'oc' | 'manual';
  ordem_corte_id: number | null;
  ordem_id: number | null;
  codigo_oc: string;
  tipo: TipoEstampa;
  modelo: string;
  referencia: string;
  peca: string;
  tipo_peca: string;
  quantidade: number;
  cores: string[];
  tamanhos: string[];
  grade: CelulaEstampa[];
  costureiro: string;
  oficina: string;
  produto_id: number | null;
  imagem: string | null;
  categoria: string | null;
  observacoes: string;
  entregue_em: string | null;
  atualizado_em: string;
};

type FichaEntregue = {
  ordem_corte_id: number;
  ordem_id: number;
  codigo_oc: string;
  modelo: string;
  referencia: string;
  peca: string;
  quantidade: number;
  produto_id: number | null;
  costureiro: string;
  oficina: string;
  entregue_em: string;
};

type LinhaEstampa = {
  id: number;
  ordem_corte_id: number;
  ordem_id: number;
  codigo_oc: string;
  tipo: string;
  modelo: string;
  referencia: string;
  peca: string;
  quantidade: number;
  cores: string;
  tamanhos: string;
  grade: string;
  costureiro: string;
  oficina: string;
  produto_id: number | null;
  imagem: string | null;
  observacoes: string | null;
  entregue_em: string | null;
  atualizado_em: string;
};

type LinhaAmostraManual = {
  id: number;
  modelo: string;
  peca: string;
  referencia: string;
  tipo_peca: string;
  cor: string;
  tamanho: string;
  quantidade: number;
  observacoes: string;
  imagem: string | null;
  atualizado_em: string;
};

function listaJson(valor: string | null | undefined): string[] {
  try {
    const parsed = JSON.parse(valor || '[]') as unknown;
    return Array.isArray(parsed) ? parsed.map((item) => String(item)).filter(Boolean) : [];
  } catch {
    return [];
  }
}

function gradeJson(valor: string | null | undefined): CelulaEstampa[] {
  try {
    const parsed = JSON.parse(valor || '[]') as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((item) => {
        const row = item as { cor?: unknown; tamanho?: unknown; quantidade?: unknown };
        return {
          cor: String(row.cor ?? '').trim(),
          tamanho: String(row.tamanho ?? '').trim(),
          quantidade: Number(row.quantidade) || 0,
        };
      })
      .filter((item) => item.cor && item.tamanho);
  } catch {
    return [];
  }
}

function catalogoDoModelo(
  db: AppDatabase,
  empresaId: number,
  produtoId: number | null,
  referencia: string,
  modelo: string,
): { id: number; imagem: string | null; categoria: string | null } | null {
  if (produtoId) {
    const porId = db
      .prepare(
        `SELECT id, imagem, categoria FROM produtos WHERE empresa_id = ? AND id = ?`,
      )
      .get(empresaId, produtoId) as
      | { id: number; imagem: string | null; categoria: string | null }
      | undefined;
    if (porId) return porId;
  }
  if (referencia.trim()) {
    const porSku = db
      .prepare(
        `SELECT id, imagem, categoria FROM produtos
          WHERE empresa_id = ? AND sku IS NOT NULL AND lower(sku) = lower(?)
          LIMIT 1`,
      )
      .get(empresaId, referencia.trim()) as
      | { id: number; imagem: string | null; categoria: string | null }
      | undefined;
    if (porSku) return porSku;
  }
  if (modelo.trim()) {
    const porNome = db
      .prepare(
        `SELECT id, imagem, categoria FROM produtos
          WHERE empresa_id = ? AND lower(nome) = lower(?)
          ORDER BY id ASC LIMIT 1`,
      )
      .get(empresaId, modelo.trim()) as
      | { id: number; imagem: string | null; categoria: string | null }
      | undefined;
    if (porNome) return porNome;
  }
  return null;
}

function mapear(
  row: LinhaEstampa,
  catalogo: { imagem: string | null; categoria: string | null } | null,
): OcDisponivelEstampa {
  const tipoPeca = (catalogo?.categoria ?? '').trim();
  return {
    id: row.id,
    origem: 'oc',
    ordem_corte_id: row.ordem_corte_id,
    ordem_id: row.ordem_id,
    codigo_oc: row.codigo_oc,
    tipo: row.tipo === 'corte' ? 'corte' : 'amostra',
    modelo: row.modelo,
    referencia: row.referencia,
    peca: row.peca,
    tipo_peca: tipoPeca,
    quantidade: row.quantidade,
    cores: listaJson(row.cores),
    tamanhos: listaJson(row.tamanhos),
    grade: gradeJson(row.grade),
    costureiro: row.costureiro,
    oficina: row.oficina,
    produto_id: row.produto_id,
    imagem: row.imagem || catalogo?.imagem || null,
    categoria: catalogo?.categoria ?? null,
    observacoes: String(row.observacoes ?? '').trim(),
    entregue_em: row.entregue_em,
    atualizado_em: row.atualizado_em,
  };
}

function mapearManual(row: LinhaAmostraManual): OcDisponivelEstampa {
  const cor = row.cor.trim();
  const tamanho = row.tamanho.trim();
  const quantidade = Number(row.quantidade) || 0;
  return {
    id: row.id,
    origem: 'manual',
    ordem_corte_id: null,
    ordem_id: null,
    codigo_oc: '',
    tipo: 'amostra',
    modelo: row.modelo,
    referencia: row.referencia,
    peca: row.peca || row.modelo,
    tipo_peca: row.tipo_peca,
    quantidade,
    cores: cor ? [cor] : [],
    tamanhos: tamanho ? [tamanho] : [],
    grade: cor && tamanho ? [{ cor, tamanho, quantidade }] : [],
    costureiro: '',
    oficina: '',
    produto_id: null,
    imagem: row.imagem || null,
    categoria: row.tipo_peca || null,
    observacoes: row.observacoes,
    entregue_em: null,
    atualizado_em: row.atualizado_em,
  };
}

function lerGrade(db: AppDatabase, empresaId: number, ordemCorteId: number): CelulaEstampa[] {
  return (
    db
      .prepare(
        `SELECT cor, tamanho, quantidade FROM ordem_corte_grade
          WHERE empresa_id = ? AND ordem_corte_id = ?
          ORDER BY id ASC`,
      )
      .all(empresaId, ordemCorteId) as CelulaEstampa[]
  ).map((celula) => ({
    cor: String(celula.cor ?? '').trim(),
    tamanho: String(celula.tamanho ?? '').trim(),
    quantidade: Number(celula.quantidade) || 0,
  }));
}

function fichaEntregue(
  db: AppDatabase,
  empresaId: number,
  ordemCorteId: number,
): FichaEntregue | null {
  const row = db
    .prepare(
      `SELECT oc.id AS ordem_corte_id, oc.ordem_id, oc.codigo AS codigo_oc,
              oc.modelo, oc.referencia, oc.produto, oc.quantidade, oc.produto_id,
              ifnull(l.costureiro, '') AS costureiro,
              ifnull(l.oficina, '') AS oficina,
              ifnull(l.referencia, '') AS ref_lib,
              l.entregue_em
         FROM ordens_corte oc
         JOIN ordem_corte_liberacoes l
           ON l.ordem_corte_id = oc.id AND l.empresa_id = oc.empresa_id
        WHERE oc.empresa_id = ? AND oc.id = ?
          AND l.entregue_em IS NOT NULL AND trim(l.entregue_em) != ''`,
    )
    .get(empresaId, ordemCorteId) as
    | {
        ordem_corte_id: number;
        ordem_id: number;
        codigo_oc: string;
        modelo: string;
        referencia: string;
        produto: string;
        quantidade: number;
        produto_id: number | null;
        costureiro: string;
        oficina: string;
        ref_lib: string;
        entregue_em: string;
      }
    | undefined;
  if (!row) return null;
  const modelo = (row.modelo || row.produto || '').trim();
  const referencia = (row.referencia || row.ref_lib || '').trim();
  return {
    ordem_corte_id: row.ordem_corte_id,
    ordem_id: row.ordem_id,
    codigo_oc: row.codigo_oc,
    modelo,
    referencia,
    peca: modelo,
    quantidade: Number(row.quantidade) || 0,
    produto_id: row.produto_id,
    costureiro: row.costureiro.trim(),
    oficina: row.oficina.trim(),
    entregue_em: row.entregue_em,
  };
}

export function upsertOcDisponivelEstampa(
  db: AppDatabase,
  empresaId: number,
  ordemCorteId: number,
): OcDisponivelEstampa | null {
  const ficha = fichaEntregue(db, empresaId, ordemCorteId);
  if (!ficha) return null;
  const grade = lerGrade(db, empresaId, ordemCorteId);
  const cores = [...new Set(grade.map((item) => item.cor).filter(Boolean))];
  const tamanhos = [...new Set(grade.map((item) => item.tamanho).filter(Boolean))];
  const catalogo = catalogoDoModelo(
    db,
    empresaId,
    ficha.produto_id,
    ficha.referencia,
    ficha.modelo,
  );
  const produtoId = catalogo?.id ?? ficha.produto_id;
  const existente = db
    .prepare(
      `SELECT id, imagem FROM ocs_disponiveis_estampas
        WHERE empresa_id = ? AND ordem_corte_id = ?`,
    )
    .get(empresaId, ordemCorteId) as { id: number; imagem: string | null } | undefined;

  if (existente) {
    db.prepare(
      `UPDATE ocs_disponiveis_estampas SET
         ordem_id = @ordem_id,
         codigo_oc = @codigo_oc,
         modelo = @modelo,
         referencia = @referencia,
         peca = @peca,
         quantidade = @quantidade,
         cores = @cores,
         tamanhos = @tamanhos,
         grade = @grade,
         costureiro = @costureiro,
         oficina = @oficina,
         produto_id = @produto_id,
         imagem = CASE WHEN imagem IS NOT NULL AND trim(imagem) != '' THEN imagem ELSE @imagem END,
         entregue_em = @entregue_em,
         atualizado_em = datetime('now')
       WHERE id = @id AND empresa_id = @empresa_id`,
    ).run({
      id: existente.id,
      empresa_id: empresaId,
      ordem_id: ficha.ordem_id,
      codigo_oc: ficha.codigo_oc,
      modelo: ficha.modelo,
      referencia: ficha.referencia,
      peca: ficha.peca,
      quantidade: ficha.quantidade,
      cores: JSON.stringify(cores),
      tamanhos: JSON.stringify(tamanhos),
      grade: JSON.stringify(grade),
      costureiro: ficha.costureiro,
      oficina: ficha.oficina,
      produto_id: produtoId,
      imagem: catalogo?.imagem ?? null,
      entregue_em: ficha.entregue_em,
    });
  } else {
    db.prepare(
      `INSERT INTO ocs_disponiveis_estampas (
         empresa_id, ordem_corte_id, ordem_id, codigo_oc, tipo, modelo, referencia, peca,
         quantidade, cores, tamanhos, grade, costureiro, oficina, produto_id, imagem, entregue_em
       ) VALUES (
         @empresa_id, @ordem_corte_id, @ordem_id, @codigo_oc, 'amostra', @modelo, @referencia, @peca,
         @quantidade, @cores, @tamanhos, @grade, @costureiro, @oficina, @produto_id, @imagem, @entregue_em
       )`,
    ).run({
      empresa_id: empresaId,
      ordem_corte_id: ficha.ordem_corte_id,
      ordem_id: ficha.ordem_id,
      codigo_oc: ficha.codigo_oc,
      modelo: ficha.modelo,
      referencia: ficha.referencia,
      peca: ficha.peca,
      quantidade: ficha.quantidade,
      cores: JSON.stringify(cores),
      tamanhos: JSON.stringify(tamanhos),
      grade: JSON.stringify(grade),
      costureiro: ficha.costureiro,
      oficina: ficha.oficina,
      produto_id: produtoId,
      imagem: catalogo?.imagem ?? null,
      entregue_em: ficha.entregue_em,
    });
  }
  return obterOcDisponivel(db, empresaId, ordemCorteId);
}

function obterOcDisponivel(
  db: AppDatabase,
  empresaId: number,
  ordemCorteId: number,
): OcDisponivelEstampa | null {
  const row = db
    .prepare(
      `SELECT * FROM ocs_disponiveis_estampas WHERE empresa_id = ? AND ordem_corte_id = ?`,
    )
    .get(empresaId, ordemCorteId) as LinhaEstampa | undefined;
  if (!row) return null;
  const catalogo = catalogoDoModelo(db, empresaId, row.produto_id, row.referencia, row.modelo);
  return mapear(row, catalogo);
}

export function registrarOcDisponivelAposEntrega(
  db: AppDatabase,
  empresaId: number,
  ordemCorteId: number,
): void {
  try {
    upsertOcDisponivelEstampa(db, empresaId, ordemCorteId);
  } catch {
    // A entrega da ficha não pode falhar por causa deste módulo.
  }
}

export function completarOcsDisponiveis(
  db: AppDatabase,
  empresaId: number,
): { importados: number; atualizados: number; disponiveis: number } {
  const entregues = db
    .prepare(
      `SELECT oc.id
         FROM ordens_corte oc
         JOIN ordem_corte_liberacoes l
           ON l.ordem_corte_id = oc.id AND l.empresa_id = oc.empresa_id
        WHERE oc.empresa_id = ?
          AND l.entregue_em IS NOT NULL AND trim(l.entregue_em) != ''
        ORDER BY datetime(l.entregue_em) DESC, oc.id DESC`,
    )
    .all(empresaId) as Array<{ id: number }>;
  let importados = 0;
  let atualizados = 0;
  const aplicar = db.transaction(() => {
    for (const row of entregues) {
      const existia = db
        .prepare(
          `SELECT id FROM ocs_disponiveis_estampas WHERE empresa_id = ? AND ordem_corte_id = ?`,
        )
        .get(empresaId, row.id) as { id: number } | undefined;
      const gravado = upsertOcDisponivelEstampa(db, empresaId, row.id);
      if (!gravado) continue;
      if (existia) atualizados += 1;
      else importados += 1;
    }
  });
  aplicar();
  const disponiveis = (
    db
      .prepare(`SELECT COUNT(*) AS n FROM ocs_disponiveis_estampas WHERE empresa_id = ?`)
      .get(empresaId) as { n: number }
  ).n;
  return { importados, atualizados, disponiveis };
}

export function listarOcsDisponiveis(
  db: AppDatabase,
  empresaId: number,
  filtros: { q?: string; tipo?: string },
): { data: OcDisponivelEstampa[]; totais: { disponiveis: number } } {
  const where = ['e.empresa_id = @empresa_id'];
  const params: Record<string, string | number> = { empresa_id: empresaId };
  const tipo = String(filtros.tipo ?? '').trim();
  if (tipo) {
    where.push(`ifnull(p.categoria, '') LIKE @tipo`);
    params.tipo = `%${tipo}%`;
  }
  const q = String(filtros.q ?? '').trim();
  if (q) {
    where.push(
      `(e.codigo_oc LIKE @q OR e.modelo LIKE @q OR e.referencia LIKE @q
        OR e.peca LIKE @q OR e.costureiro LIKE @q OR e.oficina LIKE @q)`,
    );
    params.q = `%${q}%`;
  }
  const rows = db
    .prepare(
      `SELECT e.* FROM ocs_disponiveis_estampas e
         LEFT JOIN produtos p ON p.id = e.produto_id AND p.empresa_id = e.empresa_id
        WHERE ${where.join(' AND ')}
        ORDER BY datetime(e.entregue_em) DESC, e.id DESC`,
    )
    .all(params) as LinhaEstampa[];
  const ocs = rows.map((row) => {
    const catalogo = catalogoDoModelo(db, empresaId, row.produto_id, row.referencia, row.modelo);
    return mapear(row, catalogo);
  });
  const refsOc = new Set(
    ocs.map((item) => item.referencia.trim().toLowerCase()).filter(Boolean),
  );
  const manuaisWhere = ['empresa_id = @empresa_id'];
  if (tipo) {
    manuaisWhere.push(`tipo_peca LIKE @tipo`);
  }
  if (q) {
    manuaisWhere.push(
      `(modelo LIKE @q OR peca LIKE @q OR referencia LIKE @q OR tipo_peca LIKE @q
        OR cor LIKE @q OR tamanho LIKE @q OR observacoes LIKE @q)`,
    );
  }
  const manuais = (
    db
      .prepare(
        `SELECT * FROM amostras_cadastro
          WHERE ${manuaisWhere.join(' AND ')}
          ORDER BY datetime(atualizado_em) DESC, id DESC`,
      )
      .all(params) as LinhaAmostraManual[]
  )
    .map(mapearManual)
    .filter((item) => {
      const ref = item.referencia.trim().toLowerCase();
      return !ref || !refsOc.has(ref);
    });
  const data = [...manuais, ...ocs].sort((a, b) => {
    const ta = a.atualizado_em || '';
    const tb = b.atualizado_em || '';
    if (ta === tb) return b.id - a.id;
    return ta < tb ? 1 : -1;
  });
  const disponiveis = (
    db
      .prepare(`SELECT COUNT(*) AS n FROM ocs_disponiveis_estampas WHERE empresa_id = ?`)
      .get(empresaId) as { n: number }
  ).n;
  return { data, totais: { disponiveis } };
}

export function atualizarFotoEstampa(
  db: AppDatabase,
  empresaId: number,
  id: number,
  imagem: string,
): OcDisponivelEstampa {
  const atual = db
    .prepare(`SELECT ordem_corte_id FROM ocs_disponiveis_estampas WHERE empresa_id = ? AND id = ?`)
    .get(empresaId, id) as { ordem_corte_id: number } | undefined;
  if (!atual) {
    throw Object.assign(new Error('Registro não encontrado'), { status: 404 });
  }
  db.prepare(
    `UPDATE ocs_disponiveis_estampas
        SET imagem = ?, atualizado_em = datetime('now')
      WHERE empresa_id = ? AND id = ?`,
  ).run(imagem, empresaId, id);
  const lido = obterOcDisponivel(db, empresaId, atual.ordem_corte_id);
  if (!lido) throw Object.assign(new Error('Registro não encontrado'), { status: 404 });
  return lido;
}

const imagemSchema = z.object({
  imagem: z.string().trim().max(1_500_000, 'imagem muito grande'),
});

const amostraSchema = z.object({
  modelo: z.string().trim().min(1, 'Informe o nome do modelo/peça').max(200),
  referencia: z.string().trim().max(80).optional().default(''),
  tipo_peca: z.string().trim().max(80).optional().default(''),
  cor: z.string().trim().max(80).optional().default(''),
  tamanho: z.string().trim().max(40).optional().default(''),
  quantidade: z.coerce.number().int().min(0).max(1_000_000).optional().default(0),
  observacoes: z.string().trim().max(2000).optional().default(''),
  imagem: z.string().trim().max(1_500_000, 'imagem muito grande').nullable().optional(),
});

const amostraParcialSchema = amostraSchema.partial().refine(
  (data) => Object.values(data).some((valor) => valor !== undefined),
  { message: 'Informe ao menos um campo para atualizar' },
);

function obterAmostraManual(db: AppDatabase, empresaId: number, id: number): OcDisponivelEstampa {
  const row = db
    .prepare(`SELECT * FROM amostras_cadastro WHERE empresa_id = ? AND id = ?`)
    .get(empresaId, id) as LinhaAmostraManual | undefined;
  if (!row) throw Object.assign(new Error('Amostra não encontrada'), { status: 404 });
  return mapearManual(row);
}

function ocComMesmaRef(db: AppDatabase, empresaId: number, referencia: string): boolean {
  const ref = referencia.trim();
  if (!ref) return false;
  const row = db
    .prepare(
      `SELECT id FROM ocs_disponiveis_estampas
        WHERE empresa_id = ? AND lower(trim(referencia)) = lower(?)
        LIMIT 1`,
    )
    .get(empresaId, ref) as { id: number } | undefined;
  return Boolean(row);
}

function acharManualExistente(
  db: AppDatabase,
  empresaId: number,
  dados: { modelo: string; referencia: string; cor: string; tamanho: string },
  exceptoId?: number,
): { id: number } | undefined {
  const ref = dados.referencia.trim();
  if (ref) {
    return db
      .prepare(
        `SELECT id FROM amostras_cadastro
          WHERE empresa_id = ? AND lower(trim(referencia)) = lower(?)
            AND (? IS NULL OR id != ?)
          LIMIT 1`,
      )
      .get(empresaId, ref, exceptoId ?? null, exceptoId ?? 0) as { id: number } | undefined;
  }
  return db
    .prepare(
      `SELECT id FROM amostras_cadastro
        WHERE empresa_id = ?
          AND lower(trim(modelo)) = lower(?)
          AND lower(trim(cor)) = lower(?)
          AND lower(trim(tamanho)) = lower(?)
          AND trim(referencia) = ''
          AND (? IS NULL OR id != ?)
        LIMIT 1`,
    )
    .get(
      empresaId,
      dados.modelo.trim(),
      dados.cor.trim(),
      dados.tamanho.trim(),
      exceptoId ?? null,
      exceptoId ?? 0,
    ) as { id: number } | undefined;
}

export function criarAmostraManual(
  db: AppDatabase,
  empresaId: number,
  bruto: z.infer<typeof amostraSchema>,
): OcDisponivelEstampa {
  if (ocComMesmaRef(db, empresaId, bruto.referencia)) {
    throw Object.assign(new Error('Já existe uma amostra desta REF importada pela OC'), {
      status: 409,
    });
  }
  const existente = acharManualExistente(db, empresaId, bruto);
  if (existente) {
    return atualizarAmostraManual(db, empresaId, existente.id, bruto);
  }
  const resultado = db
    .prepare(
      `INSERT INTO amostras_cadastro (
         empresa_id, modelo, peca, referencia, tipo_peca, cor, tamanho, quantidade, observacoes, imagem
       ) VALUES (
         @empresa_id, @modelo, @peca, @referencia, @tipo_peca, @cor, @tamanho, @quantidade, @observacoes, @imagem
       )`,
    )
    .run({
      empresa_id: empresaId,
      modelo: bruto.modelo,
      peca: bruto.modelo,
      referencia: bruto.referencia,
      tipo_peca: bruto.tipo_peca,
      cor: bruto.cor,
      tamanho: bruto.tamanho,
      quantidade: bruto.quantidade,
      observacoes: bruto.observacoes,
      imagem: bruto.imagem ?? null,
    });
  return obterAmostraManual(db, empresaId, Number(resultado.lastInsertRowid));
}

export function atualizarAmostraManual(
  db: AppDatabase,
  empresaId: number,
  id: number,
  parciais: z.infer<typeof amostraParcialSchema>,
): OcDisponivelEstampa {
  const atual = obterAmostraManual(db, empresaId, id);
  const proximo = {
    modelo: parciais.modelo ?? atual.modelo,
    referencia: parciais.referencia ?? atual.referencia,
    tipo_peca: parciais.tipo_peca ?? atual.tipo_peca,
    cor: parciais.cor ?? atual.cores[0] ?? '',
    tamanho: parciais.tamanho ?? atual.tamanhos[0] ?? '',
    quantidade: parciais.quantidade ?? atual.quantidade,
    observacoes: parciais.observacoes ?? atual.observacoes,
    imagem: parciais.imagem === undefined ? atual.imagem : parciais.imagem,
  };
  if (ocComMesmaRef(db, empresaId, proximo.referencia)) {
    throw Object.assign(new Error('Já existe uma amostra desta REF importada pela OC'), {
      status: 409,
    });
  }
  const outro = acharManualExistente(db, empresaId, proximo, id);
  if (outro) {
    throw Object.assign(new Error('Já existe uma amostra com estes dados'), { status: 409 });
  }
  db.prepare(
    `UPDATE amostras_cadastro SET
       modelo = @modelo,
       peca = @peca,
       referencia = @referencia,
       tipo_peca = @tipo_peca,
       cor = @cor,
       tamanho = @tamanho,
       quantidade = @quantidade,
       observacoes = @observacoes,
       imagem = CASE
         WHEN @imagem_enviada = 1 THEN @imagem
         ELSE imagem
       END,
       atualizado_em = datetime('now')
     WHERE empresa_id = @empresa_id AND id = @id`,
  ).run({
    id,
    empresa_id: empresaId,
    modelo: proximo.modelo,
    peca: proximo.modelo,
    referencia: proximo.referencia,
    tipo_peca: proximo.tipo_peca,
    cor: proximo.cor,
    tamanho: proximo.tamanho,
    quantidade: proximo.quantidade,
    observacoes: proximo.observacoes,
    imagem: proximo.imagem,
    imagem_enviada: parciais.imagem === undefined ? 0 : 1,
  });
  return obterAmostraManual(db, empresaId, id);
}

export function atualizarFotoAmostraManual(
  db: AppDatabase,
  empresaId: number,
  id: number,
  imagem: string,
): OcDisponivelEstampa {
  obterAmostraManual(db, empresaId, id);
  db.prepare(
    `UPDATE amostras_cadastro
        SET imagem = ?, atualizado_em = datetime('now')
      WHERE empresa_id = ? AND id = ?`,
  ).run(imagem, empresaId, id);
  return obterAmostraManual(db, empresaId, id);
}

export function createEstampasRouter(db: AppDatabase) {
  const router = Router();

  router.get('/', (req, res) => {
    const empresaId = aplicarEmpresa([], {}, req);
    const lista = listarOcsDisponiveis(db, empresaId, {
      q: String(req.query.q ?? ''),
      tipo: String(req.query.tipo ?? ''),
    });
    res.json(lista);
  });

  router.post('/completar', (req, res) => {
    const resultado = completarOcsDisponiveis(db, empresaDaSessao(req));
    res.json(resultado);
  });

  router.post('/amostras', (req, res) => {
    const parsed = amostraSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        erro: 'Informe os dados da amostra',
        detalhes: parsed.error.flatten().fieldErrors,
      });
    }
    try {
      res.status(201).json(criarAmostraManual(db, empresaDaSessao(req), parsed.data));
    } catch (e) {
      const err = e as Error & { status?: number };
      return res.status(err.status ?? 400).json({ erro: err.message });
    }
  });

  router.patch('/amostras/:id', (req, res) => {
    const parsed = amostraParcialSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        erro: 'Informe os dados da amostra',
        detalhes: parsed.error.flatten().fieldErrors,
      });
    }
    try {
      res.json(
        atualizarAmostraManual(db, empresaDaSessao(req), Number(req.params.id), parsed.data),
      );
    } catch (e) {
      const err = e as Error & { status?: number };
      return res.status(err.status ?? 400).json({ erro: err.message });
    }
  });

  router.patch('/amostras/:id/imagem', (req, res) => {
    const parsed = imagemSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        erro: 'Informe a imagem',
        detalhes: parsed.error.flatten().fieldErrors,
      });
    }
    try {
      res.json(
        atualizarFotoAmostraManual(
          db,
          empresaDaSessao(req),
          Number(req.params.id),
          parsed.data.imagem,
        ),
      );
    } catch (e) {
      const err = e as Error & { status?: number };
      return res.status(err.status ?? 400).json({ erro: err.message });
    }
  });

  router.patch('/:id/imagem', (req, res) => {
    const parsed = imagemSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        erro: 'Informe a imagem',
        detalhes: parsed.error.flatten().fieldErrors,
      });
    }
    try {
      res.json(
        atualizarFotoEstampa(db, empresaDaSessao(req), Number(req.params.id), parsed.data.imagem),
      );
    } catch (e) {
      const err = e as Error & { status?: number };
      return res.status(err.status ?? 400).json({ erro: err.message });
    }
  });

  return router;
}
