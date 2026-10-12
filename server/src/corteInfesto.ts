import type { AppDatabase } from './db.js';
import { registrarMovimentoEstoque } from './estoque.js';
import { lerGrade } from './ordensGrade.js';

export type CorteInfesto = {
  id: number;
  empresa_id: number;
  ordem_id: number;
  materia_prima_id: number;
  cor: string;
  quantidade_pecas: number;
  camadas: number;
  metragem: number;
  peso_real: number;
  quantidade_baixada: number;
  unidade_baixa: string;
  movimento_id: number | null;
  concluido_em: string;
  tecido: string;
  unidade: string;
  ordem_codigo: string | null;
  cliente: string;
  produto: string;
  status_ordem: string;
};

export type DadosCorteInfesto = {
  materia_prima_id: number;
  cor: string;
  quantidade_pecas: number;
  camadas: number;
  metragem: number;
  peso_real: number;
};

const STATUS_PODE_CORTAR = new Set(['planejada', 'pendente', 'corte']);
const TECIDOS = new Set(['tecido', 'forro']);

const SELECT = `
  SELECT
    c.id, c.empresa_id, c.ordem_id, c.materia_prima_id, c.cor,
    c.quantidade_pecas, c.camadas, c.metragem, c.peso_real,
    c.quantidade_baixada, c.unidade_baixa, c.movimento_id, c.concluido_em,
    m.nome AS tecido, m.unidade,
    o.codigo AS ordem_codigo, o.cliente, o.produto, o.status AS status_ordem
  FROM cortes_infesto c
  JOIN materias_primas m ON m.id = c.materia_prima_id
  JOIN ordens_producao o ON o.id = c.ordem_id
`;

export function quantidadeBaixaEstoque(unidade: string, pesoReal: number, metragem: number) {
  const normalizada = unidade.trim().toUpperCase();
  if (normalizada === 'MT' || normalizada === 'M' || normalizada === 'METRO') {
    return { quantidade: metragem, origem: 'metragem' as const };
  }
  return { quantidade: pesoReal, origem: 'peso' as const };
}

export function listarCortesInfesto(db: AppDatabase, empresaId: number): CorteInfesto[] {
  return db
    .prepare(`${SELECT} WHERE c.empresa_id = ? ORDER BY c.concluido_em DESC, c.id DESC`)
    .all(empresaId) as CorteInfesto[];
}

export function obterCorteInfesto(
  db: AppDatabase,
  empresaId: number,
  ordemId: number,
): CorteInfesto | undefined {
  return db
    .prepare(`${SELECT} WHERE c.empresa_id = ? AND c.ordem_id = ?`)
    .get(empresaId, ordemId) as CorteInfesto | undefined;
}

function falha(mensagem: string, status: number): never {
  throw Object.assign(new Error(mensagem), { status });
}

export function concluirCorteInfesto(
  db: AppDatabase,
  empresaId: number,
  ordemId: number,
  dados: DadosCorteInfesto,
): CorteInfesto {
  const ordem = db
    .prepare(
      `SELECT id, codigo, status, quantidade, empresa_id
         FROM ordens_producao WHERE id = ? AND empresa_id = ?`,
    )
    .get(ordemId, empresaId) as
    | { id: number; codigo: string | null; status: string; quantidade: number; empresa_id: number }
    | undefined;
  if (!ordem) falha('Ordem de produção não encontrada', 404);
  if (obterCorteInfesto(db, empresaId, ordemId)) {
    falha('O corte desta OP já foi concluído', 409);
  }
  if (!STATUS_PODE_CORTAR.has(ordem.status)) {
    falha('Esta OP não está em uma etapa que permita concluir o corte', 409);
  }

  const materia = db
    .prepare(
      `SELECT id, nome, unidade, tipo, status FROM materias_primas
        WHERE id = ? AND empresa_id = ?`,
    )
    .get(dados.materia_prima_id, empresaId) as
    | { id: number; nome: string; unidade: string; tipo: string; status: string }
    | undefined;
  if (!materia || materia.status !== 'ativo') falha('Tecido não encontrado', 400);
  if (!TECIDOS.has(materia.tipo)) falha('Selecione um tecido do estoque de matérias-primas', 400);

  const cor = dados.cor.trim();
  if (!cor) falha('Informe a cor', 400);
  const grade = lerGrade(db, empresaId, ordemId).filter((celula) => celula.quantidade > 0);
  const cores = [...new Set(grade.map((celula) => celula.cor))];
  const corGrade = cores.find((item) => item.toLocaleLowerCase('pt-BR') === cor.toLocaleLowerCase('pt-BR'));
  if (cores.length > 0 && !corGrade) falha('A cor precisa estar na grade da ordem', 400);
  const corSalva = corGrade ?? cor;

  if (!Number.isInteger(dados.quantidade_pecas) || dados.quantidade_pecas < 1) {
    falha('Informe a quantidade de peças', 400);
  }
  if (dados.quantidade_pecas > ordem.quantidade) {
    falha('A quantidade de peças não pode passar da quantidade da ordem', 400);
  }
  if (!Number.isInteger(dados.camadas) || dados.camadas < 1) {
    falha('Informe o número de camadas do enfesto', 400);
  }
  if (!(dados.metragem > 0) || !(dados.peso_real > 0)) {
    falha('Informe a metragem e o peso real consumido', 400);
  }

  const baixa = quantidadeBaixaEstoque(materia.unidade, dados.peso_real, dados.metragem);
  const requisitos = db
    .prepare(
      `SELECT id, materia_prima_id, quantidade_total, movimento_id
         FROM ordem_requisitos
        WHERE empresa_id = ? AND ordem_id = ? AND materia_prima_id = ?
        ORDER BY id ASC`,
    )
    .all(empresaId, ordemId, materia.id) as Array<{
    id: number;
    materia_prima_id: number;
    quantidade_total: number;
    movimento_id: number | null;
  }>;
  const jaBaixado = requisitos.find((item) => item.movimento_id);
  let movimentoId = jaBaixado?.movimento_id ?? null;
  let quantidadeBaixada = 0;

  if (!jaBaixado) {
    const movimento = registrarMovimentoEstoque(db, empresaId, {
      tipo: 'saida',
      quantidade: baixa.quantidade,
      materia_prima_id: materia.id,
      motivo: `Corte ${ordem.codigo ?? `OP ${ordem.id}`}`,
      observacoes: `${corSalva} · ${dados.camadas} camadas · ${dados.metragem} m · ${dados.peso_real} kg`,
    });
    if (!movimento.ok) falha(movimento.erro, movimento.status);
    movimentoId = movimento.movimentoId;
    quantidadeBaixada = baixa.quantidade;
    const atualizar = db.prepare(
      `UPDATE ordem_requisitos
          SET movimento_id = ?, quantidade_total = ?
        WHERE id = ? AND empresa_id = ?`,
    );
    requisitos.forEach((item, indice) => {
      atualizar.run(movimentoId, indice === 0 ? baixa.quantidade : 0, item.id, empresaId);
    });
  }

  const info = db
    .prepare(
      `INSERT INTO cortes_infesto (
         empresa_id, ordem_id, materia_prima_id, cor, quantidade_pecas, camadas,
         metragem, peso_real, quantidade_baixada, unidade_baixa, movimento_id
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      empresaId,
      ordemId,
      materia.id,
      corSalva,
      dados.quantidade_pecas,
      dados.camadas,
      dados.metragem,
      dados.peso_real,
      quantidadeBaixada,
      materia.unidade,
      movimentoId,
    );

  db.prepare(
    `UPDATE ordens_producao
        SET status = 'costura', atualizado_em = datetime('now')
      WHERE id = ? AND empresa_id = ?`,
  ).run(ordemId, empresaId);
  avancarEtapasAposCorte(db, empresaId, ordemId);

  const salvo = obterCorteInfesto(db, empresaId, ordemId);
  if (!salvo || salvo.id !== Number(info.lastInsertRowid)) falha('Não foi possível registrar o corte', 500);
  return salvo;
}

function avancarEtapasAposCorte(db: AppDatabase, empresaId: number, ordemId: number) {
  const etapas = db
    .prepare(
      `SELECT id, tipo, status FROM etapas_producao
        WHERE empresa_id = ? AND ordem_id = ?
        ORDER BY sequencia ASC, id ASC`,
    )
    .all(empresaId, ordemId) as Array<{ id: number; tipo: string; status: string }>;
  if (etapas.length === 0) return;
  const corte = etapas.find((etapa) => etapa.tipo === 'corte');
  const costura = etapas.find((etapa) => etapa.tipo === 'costura');
  if (corte && corte.status !== 'concluida' && corte.status !== 'cancelada') {
    db.prepare(
      `UPDATE etapas_producao
          SET status = 'concluida',
              iniciado_em = coalesce(iniciado_em, datetime('now')),
              finalizado_em = datetime('now'),
              atualizado_em = datetime('now')
        WHERE id = ? AND empresa_id = ?`,
    ).run(corte.id, empresaId);
  }
  const outraAndamento = etapas.find(
    (etapa) => etapa.status === 'em_andamento' && etapa.tipo !== 'corte' && etapa.tipo !== 'costura',
  );
  if (costura && costura.status === 'pendente' && !outraAndamento) {
    db.prepare(
      `UPDATE etapas_producao
          SET status = 'em_andamento',
              iniciado_em = coalesce(iniciado_em, datetime('now')),
              atualizado_em = datetime('now')
        WHERE id = ? AND empresa_id = ?`,
    ).run(costura.id, empresaId);
  }
}

export function estornarCortesInfesto(db: AppDatabase, empresaId: number, ordemId: number) {
  const cortes = db
    .prepare(
      `SELECT id, movimento_id, quantidade_baixada, ordem_id
         FROM cortes_infesto
        WHERE empresa_id = ? AND ordem_id = ? AND quantidade_baixada > 0 AND movimento_id IS NOT NULL`,
    )
    .all(empresaId, ordemId) as Array<{
    id: number;
    movimento_id: number;
    quantidade_baixada: number;
  }>;
  for (const corte of cortes) {
    const ligado = db
      .prepare(
        `SELECT id FROM ordem_requisitos
          WHERE empresa_id = ? AND ordem_id = ? AND movimento_id = ?`,
      )
      .get(empresaId, ordemId, corte.movimento_id) as { id: number } | undefined;
    if (ligado) continue;
    const ordem = db
      .prepare('SELECT codigo FROM ordens_producao WHERE id = ? AND empresa_id = ?')
      .get(ordemId, empresaId) as { codigo: string | null };
    const materia = db
      .prepare('SELECT materia_prima_id FROM cortes_infesto WHERE id = ?')
      .get(corte.id) as { materia_prima_id: number };
    const entrada = registrarMovimentoEstoque(db, empresaId, {
      tipo: 'entrada',
      quantidade: corte.quantidade_baixada,
      materia_prima_id: materia.materia_prima_id,
      motivo: `Estorno corte ${ordem.codigo ?? `OP ${ordemId}`}`,
    });
    if (!entrada.ok) falha(entrada.erro, entrada.status);
    db.prepare(
      `UPDATE cortes_infesto SET quantidade_baixada = 0 WHERE id = ? AND empresa_id = ?`,
    ).run(corte.id, empresaId);
  }
}
