import { Router } from 'express';
import { z } from 'zod';
import type { AppDatabase } from './db.js';
import { baixarTecidoEnfesto, UNIDADES_TECIDO, type UnidadeTecido } from './tecidos.js';
import { empresaDaSessao } from './tenant.js';

export const STATUS_ENFESTO = ['pendente', 'em_enfesto', 'finalizado', 'cancelado'] as const;

const dadosSchema = z.object({
  tecido_id: z.number().int().positive().optional(),
  tecido_cor_id: z.number().int().positive().nullable().optional(),
  folhas: z.number().int().positive('informe a quantidade de folhas').optional(),
  comprimento: z.number().positive('informe o comprimento do enfesto').optional(),
  metragem: z.number().min(0).nullable().optional(),
  peso: z.number().min(0).nullable().optional(),
  observacoes: z
    .string()
    .trim()
    .max(2000)
    .optional()
    .or(z.literal(''))
    .transform((v) => (v ? v : undefined)),
  unidade: z.enum(UNIDADES_TECIDO).optional(),
});

const abrirSchema = z.object({
  ordem_id: z.number().int().positive(),
  cor: z.string().trim().min(1).max(80),
});

type ItemGrade = { tamanho: string; quantidade: number };

type GradeCor = {
  cor: string;
  quantidade: number;
  tamanhos: ItemGrade[];
  persistida: boolean;
};

type LinhaGrade = { id: number; cor: string; tamanho: string; quantidade: number };

const TAMANHOS_CANONICOS = ['P', 'M', 'G', 'GG'];

type EnfestoRow = {
  id: number;
  empresa_id: number;
  ordem_id: number;
  produto_id: number | null;
  referencia: string | null;
  produto_nome: string | null;
  cor: string;
  quantidade_pecas: number;
  tecido_id: number | null;
  tecido_cor_id: number | null;
  tecido_cor_nome: string | null;
  folhas: number | null;
  comprimento: number | null;
  metragem: number | null;
  peso: number | null;
  observacoes: string | null;
  status: (typeof STATUS_ENFESTO)[number];
  unidade: string | null;
  quantidade_consumida: number | null;
  custo_unitario: number | null;
  custo_total: number | null;
  saldo_anterior: number | null;
  saldo_posterior: number | null;
  movimento_id: number | null;
  usuario_id: number | null;
  usuario_nome: string | null;
  tecido_nome: string | null;
  finalizado_em: string | null;
  cancelado_em: string | null;
  criado_em: string;
  atualizado_em: string;
};

function norm(valor: string): string {
  return valor.trim().toLowerCase();
}

export function ordenarTamanhos(tamanhos: string[]): string[] {
  const unicos: string[] = [];
  const vistos = new Set<string>();
  for (const item of tamanhos) {
    const chave = norm(item);
    if (!chave || vistos.has(chave)) continue;
    vistos.add(chave);
    unicos.push(item.trim());
  }
  const canonico: string[] = [];
  const usados = new Set<string>();
  for (const preferido of TAMANHOS_CANONICOS) {
    const encontrado = unicos.find((item) => norm(item) === preferido.toLowerCase());
    if (!encontrado) continue;
    canonico.push(encontrado);
    usados.add(norm(encontrado));
  }
  const resto = unicos.filter((item) => !usados.has(norm(item)));
  resto.sort((a, b) => a.localeCompare(b, 'pt-BR', { numeric: true, sensitivity: 'base' }));
  return [...canonico, ...resto];
}

export function somaQuantidades(itens: Array<{ quantidade: number }>): number {
  return itens.reduce((total, item) => total + item.quantidade, 0);
}

export function gradeDaCorFecha(itens: Array<{ quantidade: number }>, planejada: number): boolean {
  if (itens.length === 0) return true;
  return somaQuantidades(itens) === planejada;
}

export function mensagemGradeDivergente(cor: string, soma: number, planejada: number): string {
  return `A soma dos tamanhos de ${cor} (${soma}) é diferente da quantidade planejada (${planejada})`;
}

function ordenarItens(itens: ItemGrade[]): ItemGrade[] {
  const ordem = new Map(ordenarTamanhos(itens.map((item) => item.tamanho)).map((tamanho, indice) => [norm(tamanho), indice]));
  return [...itens].sort((a, b) => (ordem.get(norm(a.tamanho)) ?? 0) - (ordem.get(norm(b.tamanho)) ?? 0));
}

function gradeDaOrdem(db: AppDatabase, ordemId: number, empresaId: number): GradeCor[] | null {
  const ordem = db
    .prepare(
      `SELECT id, quantidade, variante_id FROM ordens_producao WHERE id = ? AND empresa_id = ?`,
    )
    .get(ordemId, empresaId) as
    | { id: number; quantidade: number; variante_id: number | null }
    | undefined;
  if (!ordem) return null;

  const linhas = db
    .prepare(
      `SELECT cor, tamanho, quantidade
         FROM ordem_distribuicao
        WHERE ordem_id = ? AND empresa_id = ?
        ORDER BY id`,
    )
    .all(ordemId, empresaId) as Array<{ cor: string; tamanho: string; quantidade: number }>;

  if (linhas.length) {
    const grupos = new Map<string, GradeCor>();
    for (const linha of linhas) {
      const chave = norm(linha.cor);
      const atual = grupos.get(chave) ?? {
        cor: linha.cor,
        quantidade: 0,
        tamanhos: [],
        persistida: true,
      };
      atual.quantidade += linha.quantidade;
      atual.tamanhos.push({ tamanho: linha.tamanho, quantidade: linha.quantidade });
      grupos.set(chave, atual);
    }
    return [...grupos.values()]
      .filter((grupo) => grupo.quantidade > 0)
      .map((grupo) => ({ ...grupo, tamanhos: ordenarItens(grupo.tamanhos) }));
  }

  if (ordem.variante_id) {
    const variante = db
      .prepare(
        `SELECT cor, tamanho FROM produto_variantes WHERE id = ? AND empresa_id = ?`,
      )
      .get(ordem.variante_id, empresaId) as { cor: string; tamanho: string } | undefined;
    if (variante) {
      return [
        {
          cor: variante.cor,
          quantidade: ordem.quantidade,
          tamanhos: [{ tamanho: variante.tamanho, quantidade: ordem.quantidade }],
          persistida: false,
        },
      ];
    }
  }

  return [{ cor: 'Única', quantidade: ordem.quantidade, tamanhos: [], persistida: false }];
}

function linhasDaCor(db: AppDatabase, ordemId: number, empresaId: number, cor: string): LinhaGrade[] {
  return db
    .prepare(
      `SELECT id, cor, tamanho, quantidade
         FROM ordem_distribuicao
        WHERE ordem_id = ? AND empresa_id = ? AND lower(trim(cor)) = lower(trim(?))
        ORDER BY id`,
    )
    .all(ordemId, empresaId, cor) as LinhaGrade[];
}

function avancarOrdemAposCorte(db: AppDatabase, ordemId: number, empresaId: number) {
  const ordem = db
    .prepare(`SELECT status FROM ordens_producao WHERE id = ? AND empresa_id = ?`)
    .get(ordemId, empresaId) as { status: string } | undefined;
  if (!ordem || !['planejada', 'pendente', 'corte'].includes(ordem.status)) return;

  const grade = gradeDaOrdem(db, ordemId, empresaId) ?? [];
  const cores = grade.filter((item) => item.persistida && item.quantidade > 0);
  if (!cores.length) return;

  const finalizada = db.prepare(
    `SELECT 1 AS ok FROM enfestos
      WHERE empresa_id = ? AND ordem_id = ? AND lower(trim(cor)) = lower(trim(?))
        AND status = 'finalizado'
      LIMIT 1`,
  );
  const pendente = cores.some(
    (item) => !finalizada.get(empresaId, ordemId, item.cor),
  );
  if (pendente) return;

  db.prepare(
    `UPDATE ordens_producao
        SET status = 'costura', atualizado_em = datetime('now')
      WHERE id = ? AND empresa_id = ? AND status IN ('planejada', 'pendente', 'corte')`,
  ).run(ordemId, empresaId);
}

function consumoDaUnidade(unidade: UnidadeTecido, dados: { peso?: number | null; metragem?: number | null }) {
  if (unidade === 'KG') {
    if (!dados.peso || dados.peso <= 0) {
      return { ok: false as const, erro: 'Informe o peso real utilizado em KG' };
    }
    return { ok: true as const, quantidade: dados.peso };
  }
  if (!dados.metragem || dados.metragem <= 0) {
    return { ok: false as const, erro: 'Informe a metragem real utilizada em METRO' };
  }
  return { ok: true as const, quantidade: dados.metragem };
}

export function createEnfestoRouter(db: AppDatabase): Router {
  const router = Router();

  const getEnfesto = db.prepare(
    `SELECT e.*, u.nome AS usuario_nome, m.nome AS tecido_nome, tc.nome AS tecido_cor_nome
       FROM enfestos e
       LEFT JOIN usuarios u ON u.id = e.usuario_id
       LEFT JOIN materias_primas m ON m.id = e.tecido_id AND m.empresa_id = e.empresa_id
       LEFT JOIN tecido_cores tc ON tc.id = e.tecido_cor_id AND tc.empresa_id = e.empresa_id
      WHERE e.id = ? AND e.empresa_id = ?`,
  );
  const ativoPorCor = db.prepare(
    `SELECT id FROM enfestos
      WHERE empresa_id = ? AND ordem_id = ? AND lower(trim(cor)) = lower(trim(?))
        AND status != 'cancelado'
      LIMIT 1`,
  );

  function ler(id: number, empresaId: number): EnfestoRow | undefined {
    return getEnfesto.get(id, empresaId) as EnfestoRow | undefined;
  }

  function retratoOrdem(ordemId: number, empresaId: number) {
    return db
      .prepare(
        `SELECT id, codigo, produto, referencia, produto_id, quantidade
           FROM ordens_producao WHERE id = ? AND empresa_id = ?`,
      )
      .get(ordemId, empresaId) as
      | {
          id: number;
          codigo: string | null;
          produto: string;
          referencia: string | null;
          produto_id: number | null;
          quantidade: number;
        }
      | undefined;
  }

  router.get('/', (req, res) => {
    const ordemId = Number(req.query.ordem_id ?? 0);
    if (!ordemId) return res.status(400).json({ erro: 'ordem_id é obrigatório' });
    const empresaId = empresaDaSessao(req);
    const ordem = retratoOrdem(ordemId, empresaId);
    if (!ordem) return res.status(404).json({ erro: 'Ordem de produção não encontrada' });
    const grade = gradeDaOrdem(db, ordemId, empresaId) ?? [];
    const cores = grade.map((item) => {
      const ativo = ativoPorCor.get(empresaId, ordemId, item.cor) as { id: number } | undefined;
      const enfesto = ativo ? ler(ativo.id, empresaId) : undefined;
      return {
        cor: item.cor,
        quantidade_pecas: enfesto?.quantidade_pecas ?? item.quantidade,
        tamanhos: item.tamanhos,
        grade_persistida: item.persistida,
        status: enfesto?.status ?? 'pendente',
        enfesto: enfesto ?? null,
      };
    });
    res.json({ ordem, cores });
  });

  router.post('/', (req, res) => {
    const parsed = abrirSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        erro: 'Dados inválidos',
        detalhes: parsed.error.flatten().fieldErrors,
      });
    }
    const empresaId = empresaDaSessao(req);
    const ordem = retratoOrdem(parsed.data.ordem_id, empresaId);
    if (!ordem) return res.status(404).json({ erro: 'Ordem de produção não encontrada' });
    const grade = gradeDaOrdem(db, ordem.id, empresaId) ?? [];
    const cor = grade.find((item) => norm(item.cor) === norm(parsed.data.cor));
    if (!cor) return res.status(400).json({ erro: 'Essa cor não está na distribuição da OP' });

    const existente = ativoPorCor.get(empresaId, ordem.id, cor.cor) as { id: number } | undefined;
    if (existente) return res.json(ler(existente.id, empresaId));

    const info = db
      .prepare(
        `INSERT INTO enfestos (
           empresa_id, ordem_id, produto_id, referencia, produto_nome, cor, quantidade_pecas, status
         ) VALUES (
           @empresa_id, @ordem_id, @produto_id, @referencia, @produto_nome, @cor, @quantidade_pecas, 'em_enfesto'
         )`,
      )
      .run({
        empresa_id: empresaId,
        ordem_id: ordem.id,
        produto_id: ordem.produto_id,
        referencia: ordem.referencia,
        produto_nome: ordem.produto,
        cor: cor.cor,
        quantidade_pecas: cor.quantidade,
      });
    res.status(201).json(ler(Number(info.lastInsertRowid), empresaId));
  });

  router.get('/:id', (req, res) => {
    const row = ler(Number(req.params.id), empresaDaSessao(req));
    if (!row) return res.status(404).json({ erro: 'Enfesto não encontrado' });
    res.json(row);
  });

  router.patch('/:id', (req, res) => {
    const parsed = dadosSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        erro: 'Dados inválidos',
        detalhes: parsed.error.flatten().fieldErrors,
      });
    }
    const empresaId = empresaDaSessao(req);
    const atual = ler(Number(req.params.id), empresaId);
    if (!atual) return res.status(404).json({ erro: 'Enfesto não encontrado' });
    if (atual.status !== 'em_enfesto' && atual.status !== 'pendente') {
      return res.status(409).json({ erro: 'Enfesto finalizado ou cancelado não pode ser alterado' });
    }
    const data = parsed.data;
    if (data.tecido_id) {
      const tecido = db
        .prepare(
          `SELECT id, unidade FROM materias_primas
            WHERE id = ? AND empresa_id = ? AND tipo = 'tecido' AND unidade IN ('KG', 'METRO')`,
        )
        .get(data.tecido_id, empresaId) as { id: number; unidade: UnidadeTecido } | undefined;
      if (!tecido) return res.status(404).json({ erro: 'Tecido não encontrado' });
      if (data.unidade && data.unidade !== tecido.unidade) {
        return res.status(400).json({
          erro: `A baixa precisa usar a unidade de controle do tecido (${tecido.unidade})`,
        });
      }
    }
    db.prepare(
      `UPDATE enfestos SET
         tecido_id = @tecido_id,
         tecido_cor_id = @tecido_cor_id,
         folhas = @folhas,
         comprimento = @comprimento,
         metragem = @metragem,
         peso = @peso,
         observacoes = @observacoes,
         status = 'em_enfesto',
         atualizado_em = datetime('now')
       WHERE id = @id AND empresa_id = @empresa_id`,
    ).run({
      id: atual.id,
      empresa_id: empresaId,
      tecido_id: data.tecido_id ?? atual.tecido_id,
      tecido_cor_id:
        data.tecido_cor_id === undefined ? atual.tecido_cor_id : data.tecido_cor_id,
      folhas: data.folhas ?? atual.folhas,
      comprimento: data.comprimento ?? atual.comprimento,
      metragem: data.metragem === undefined ? atual.metragem : data.metragem,
      peso: data.peso === undefined ? atual.peso : data.peso,
      observacoes: data.observacoes === undefined ? atual.observacoes : data.observacoes,
    });
    res.json(ler(atual.id, empresaId));
  });

  router.post('/:id/finalizar', (req, res) => {
    const parsed = dadosSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      return res.status(400).json({
        erro: 'Dados inválidos',
        detalhes: parsed.error.flatten().fieldErrors,
      });
    }
    const empresaId = empresaDaSessao(req);
    const usuarioId = req.usuario!.id;
    const id = Number(req.params.id);

    try {
      const resultado = db.transaction(() => {
        const atual = ler(id, empresaId);
        if (!atual) return { ok: false as const, status: 404, erro: 'Enfesto não encontrado' };
        if (atual.status === 'finalizado') {
          return { ok: false as const, status: 409, erro: 'Este enfesto já foi finalizado' };
        }
        if (atual.status === 'cancelado') {
          return { ok: false as const, status: 409, erro: 'Enfesto cancelado não pode ser finalizado' };
        }

        const data = parsed.data;
        const tecidoId = data.tecido_id ?? atual.tecido_id;
        const folhas = data.folhas ?? atual.folhas;
        const comprimento = data.comprimento ?? atual.comprimento;
        const metragem = data.metragem === undefined ? atual.metragem : data.metragem;
        const peso = data.peso === undefined ? atual.peso : data.peso;
        const observacoes = data.observacoes === undefined ? atual.observacoes : data.observacoes;

        if (!tecidoId) return { ok: false as const, status: 400, erro: 'Selecione o tecido utilizado' };
        if (!folhas || folhas <= 0) {
          return { ok: false as const, status: 400, erro: 'Informe a quantidade de folhas' };
        }
        if (!comprimento || comprimento <= 0) {
          return { ok: false as const, status: 400, erro: 'Informe o comprimento do enfesto' };
        }

        const tecido = db
          .prepare(
            `SELECT id, unidade, custo, nome FROM materias_primas
              WHERE id = ? AND empresa_id = ? AND tipo = 'tecido' AND unidade IN ('KG', 'METRO')`,
          )
          .get(tecidoId, empresaId) as
          | { id: number; unidade: UnidadeTecido; custo: number; nome: string }
          | undefined;
        if (!tecido) return { ok: false as const, status: 404, erro: 'Tecido não encontrado' };
        if (data.unidade && data.unidade !== tecido.unidade) {
          return {
            ok: false as const,
            status: 400,
            erro: `A baixa precisa usar a unidade de controle do tecido (${tecido.unidade})`,
          };
        }

        const consumo = consumoDaUnidade(tecido.unidade, { peso, metragem });
        if (!consumo.ok) return { ok: false as const, status: 400, erro: consumo.erro };

        const linhas = linhasDaCor(db, atual.ordem_id, empresaId, atual.cor);
        if (linhas.length && !gradeDaCorFecha(linhas, atual.quantidade_pecas)) {
          return {
            ok: false as const,
            status: 400,
            erro: mensagemGradeDivergente(atual.cor, somaQuantidades(linhas), atual.quantidade_pecas),
          };
        }

        const reservado = db
          .prepare(
            `UPDATE enfestos SET status = 'finalizado', atualizado_em = datetime('now')
              WHERE id = ? AND empresa_id = ? AND status IN ('pendente', 'em_enfesto')`,
          )
          .run(id, empresaId);
        if (reservado.changes !== 1) {
          return { ok: false as const, status: 409, erro: 'Este enfesto já foi finalizado' };
        }

        const ordem = retratoOrdem(atual.ordem_id, empresaId);
        const tecidoCorId = data.tecido_cor_id === undefined ? atual.tecido_cor_id : data.tecido_cor_id;
        const baixa = baixarTecidoEnfesto(db, empresaId, usuarioId, {
          tecido_id: tecido.id,
          tecido_cor_id: tecidoCorId,
          quantidade: consumo.quantidade,
          referencia_id: atual.id,
          motivo: `Enfesto ${ordem?.codigo ?? atual.ordem_id} ${atual.cor}`,
        });
        if (!baixa.ok) {
          throw Object.assign(new Error(baixa.erro), { status: baixa.status, negocio: true });
        }

        const movimento = db
          .prepare(
            `SELECT saldo_anterior, saldo_posterior, custo, unidade, criado_em
               FROM estoque_movimentos WHERE id = ? AND empresa_id = ?`,
          )
          .get(baixa.movimentoId, empresaId) as {
          saldo_anterior: number;
          saldo_posterior: number;
          custo: number | null;
          unidade: string | null;
          criado_em: string;
        };
        const custoUnitario = movimento.custo ?? tecido.custo;
        db.prepare(
          `UPDATE enfestos SET
             tecido_id = @tecido_id,
             tecido_cor_id = @tecido_cor_id,
             folhas = @folhas,
             comprimento = @comprimento,
             metragem = @metragem,
             peso = @peso,
             observacoes = @observacoes,
             unidade = @unidade,
             quantidade_consumida = @quantidade_consumida,
             custo_unitario = @custo_unitario,
             custo_total = @custo_total,
             saldo_anterior = @saldo_anterior,
             saldo_posterior = @saldo_posterior,
             movimento_id = @movimento_id,
             usuario_id = @usuario_id,
             finalizado_em = datetime('now'),
             atualizado_em = datetime('now')
           WHERE id = @id AND empresa_id = @empresa_id`,
        ).run({
          id,
          empresa_id: empresaId,
          tecido_id: tecido.id,
          tecido_cor_id: tecidoCorId ?? null,
          folhas,
          comprimento,
          metragem,
          peso,
          observacoes,
          unidade: tecido.unidade,
          quantidade_consumida: consumo.quantidade,
          custo_unitario: custoUnitario,
          custo_total: Math.round(consumo.quantidade * custoUnitario * 100) / 100,
          saldo_anterior: movimento.saldo_anterior,
          saldo_posterior: movimento.saldo_posterior,
          movimento_id: baixa.movimentoId,
          usuario_id: usuarioId,
        });
        avancarOrdemAposCorte(db, atual.ordem_id, empresaId);
        return { ok: true as const };
      })();

      if (!resultado.ok) return res.status(resultado.status).json({ erro: resultado.erro });
      res.json(ler(id, empresaId));
    } catch (err) {
      const falha = err as Error & { status?: number; negocio?: boolean };
      if (falha.negocio) return res.status(falha.status ?? 409).json({ erro: falha.message });
      throw err;
    }
  });

  router.post('/:id/cancelar', (req, res) => {
    const empresaId = empresaDaSessao(req);
    const atual = ler(Number(req.params.id), empresaId);
    if (!atual) return res.status(404).json({ erro: 'Enfesto não encontrado' });
    if (atual.status === 'finalizado') {
      return res.status(409).json({ erro: 'Enfesto finalizado não pode ser cancelado' });
    }
    if (atual.status === 'cancelado') return res.json(atual);
    db.prepare(
      `UPDATE enfestos SET status = 'cancelado', cancelado_em = datetime('now'), atualizado_em = datetime('now')
        WHERE id = ? AND empresa_id = ? AND status != 'finalizado'`,
    ).run(atual.id, empresaId);
    res.json(ler(atual.id, empresaId));
  });

  return router;
}
