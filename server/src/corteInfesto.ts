import type { AppDatabase } from './db.js';
import { registrarMovimentoEstoque } from './estoque.js';
import { lerGrade, type CelulaGrade } from './ordensGrade.js';

export type ItemCorteInfesto = {
  cor: string;
  tamanho: string;
  quantidade: number;
};

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
  itens: ItemCorteInfesto[];
};

export type SaldoCorte = {
  cor: string;
  tamanho: string;
  planejado: number;
  cortado: number;
  restante: number;
};

export type ResumoCorteInfesto = {
  grade: CelulaGrade[];
  execucoes: CorteInfesto[];
  saldos: SaldoCorte[];
  concluido: boolean;
};

export type DadosCorteInfesto = {
  materia_prima_id: number;
  cor: string;
  camadas: number;
  metragem?: number;
  peso_real?: number;
  itens: Array<{ tamanho: string; quantidade: number }>;
  autorizar_excedente?: boolean;
};

export type ResultadoCorteInfesto = CorteInfesto & { avancou: boolean };

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

type CorteInfestoRow = Omit<CorteInfesto, 'itens'>;

function chaveCorte(cor: string, tamanho: string) {
  return `${cor.trim().toLocaleLowerCase('pt-BR')}|${tamanho.trim().toLocaleLowerCase('pt-BR')}`;
}

function falha(mensagem: string, status: number): never {
  throw Object.assign(new Error(mensagem), { status });
}

export function consumoPorUnidade(unidade: string): 'metro' | 'peso' {
  const normalizada = unidade.trim().toUpperCase();
  if (normalizada === 'MT' || normalizada === 'M' || normalizada === 'METRO' || normalizada === 'METROS') {
    return 'metro';
  }
  return 'peso';
}

export function quantidadeBaixaEstoque(unidade: string, pesoReal: number, metragem: number) {
  if (consumoPorUnidade(unidade) === 'metro') {
    return { quantidade: metragem, origem: 'metragem' as const };
  }
  return { quantidade: pesoReal, origem: 'peso' as const };
}

function anexarItens(db: AppDatabase, empresaId: number, cortes: CorteInfestoRow[]): CorteInfesto[] {
  if (cortes.length === 0) return [];
  const ids = cortes.map((corte) => corte.id);
  const marcas = ids.map(() => '?').join(', ');
  const itens = db
    .prepare(
      `SELECT corte_infesto_id, cor, tamanho, quantidade
         FROM corte_infesto_itens
        WHERE empresa_id = ? AND corte_infesto_id IN (${marcas})
        ORDER BY id ASC`,
    )
    .all(empresaId, ...ids) as Array<ItemCorteInfesto & { corte_infesto_id: number }>;
  const porCorte = new Map<number, ItemCorteInfesto[]>();
  for (const item of itens) {
    const lista = porCorte.get(item.corte_infesto_id) ?? [];
    lista.push({ cor: item.cor, tamanho: item.tamanho, quantidade: item.quantidade });
    porCorte.set(item.corte_infesto_id, lista);
  }
  return cortes.map((corte) => ({ ...corte, itens: porCorte.get(corte.id) ?? [] }));
}

export function listarCortesInfesto(db: AppDatabase, empresaId: number): CorteInfesto[] {
  const rows = db
    .prepare(`${SELECT} WHERE c.empresa_id = ? ORDER BY c.concluido_em DESC, c.id DESC`)
    .all(empresaId) as CorteInfestoRow[];
  return anexarItens(db, empresaId, rows);
}

export function listarCortesDaOrdem(db: AppDatabase, empresaId: number, ordemId: number): CorteInfesto[] {
  const rows = db
    .prepare(`${SELECT} WHERE c.empresa_id = ? AND c.ordem_id = ? ORDER BY c.id ASC`)
    .all(empresaId, ordemId) as CorteInfestoRow[];
  return anexarItens(db, empresaId, rows);
}

function mapaCortado(execucoes: CorteInfesto[]) {
  const mapa = new Map<string, number>();
  for (const corte of execucoes) {
    for (const item of corte.itens) {
      const chave = chaveCorte(item.cor, item.tamanho);
      mapa.set(chave, (mapa.get(chave) ?? 0) + item.quantidade);
    }
  }
  return mapa;
}

function gradeCoberta(grade: CelulaGrade[], cortado: Map<string, number>) {
  const positivas = grade.filter((celula) => celula.quantidade > 0);
  return (
    positivas.length > 0 &&
    positivas.every(
      (celula) => (cortado.get(chaveCorte(celula.cor, celula.tamanho)) ?? 0) >= celula.quantidade,
    )
  );
}

export function resumirCorteInfesto(
  db: AppDatabase,
  empresaId: number,
  ordemId: number,
): ResumoCorteInfesto {
  const grade = lerGrade(db, empresaId, ordemId);
  const execucoes = listarCortesDaOrdem(db, empresaId, ordemId);
  const cortado = mapaCortado(execucoes);
  const saldos = grade.map((celula) => {
    const feito = cortado.get(chaveCorte(celula.cor, celula.tamanho)) ?? 0;
    return {
      cor: celula.cor,
      tamanho: celula.tamanho,
      planejado: celula.quantidade,
      cortado: feito,
      restante: celula.quantidade - feito,
    };
  });
  return { grade, execucoes, saldos, concluido: gradeCoberta(grade, cortado) };
}

export function concluirCorteInfesto(
  db: AppDatabase,
  empresaId: number,
  ordemId: number,
  dados: DadosCorteInfesto,
): ResultadoCorteInfesto {
  const ordem = db
    .prepare(
      `SELECT id, codigo, status, quantidade, empresa_id
         FROM ordens_producao WHERE id = ? AND empresa_id = ?`,
    )
    .get(ordemId, empresaId) as
    | { id: number; codigo: string | null; status: string; quantidade: number; empresa_id: number }
    | undefined;
  if (!ordem) falha('Ordem de produção não encontrada', 404);
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

  const grade = lerGrade(db, empresaId, ordemId);
  if (!grade.some((celula) => celula.quantidade > 0)) {
    falha('Esta OP não tem grade de cores e tamanhos', 400);
  }

  const cor = dados.cor.trim();
  if (!cor) falha('Informe a cor', 400);
  const corGrade = grade.find(
    (celula) => celula.cor.toLocaleLowerCase('pt-BR') === cor.toLocaleLowerCase('pt-BR'),
  );
  if (!corGrade) falha('A cor precisa estar na grade da ordem', 400);
  const corSalva = corGrade.cor;
  const daCor = grade.filter(
    (celula) => celula.cor.toLocaleLowerCase('pt-BR') === corSalva.toLocaleLowerCase('pt-BR'),
  );

  if (!Array.isArray(dados.itens) || dados.itens.length === 0) {
    falha('Informe as quantidades cortadas por tamanho', 400);
  }
  const vistos = new Set<string>();
  const normalizados: ItemCorteInfesto[] = [];
  for (const item of dados.itens) {
    const tamanho = item.tamanho.trim();
    if (!tamanho) falha('Informe o tamanho', 400);
    if (!Number.isInteger(item.quantidade) || item.quantidade < 0) {
      falha('A quantidade cortada de cada tamanho deve ser um número inteiro maior ou igual a zero', 400);
    }
    const chaveTamanho = tamanho.toLocaleLowerCase('pt-BR');
    if (vistos.has(chaveTamanho)) falha('Tamanho repetido no corte', 400);
    vistos.add(chaveTamanho);
    const celula = daCor.find(
      (opcao) => opcao.tamanho.toLocaleLowerCase('pt-BR') === chaveTamanho,
    );
    if (!celula) falha('O tamanho precisa estar na grade desta cor', 400);
    normalizados.push({ cor: celula.cor, tamanho: celula.tamanho, quantidade: item.quantidade });
  }
  if (!normalizados.some((item) => item.quantidade > 0)) {
    falha('Informe a quantidade cortada de ao menos um tamanho', 400);
  }

  const jaCortado = mapaCortado(listarCortesDaOrdem(db, empresaId, ordemId));
  if (!dados.autorizar_excedente) {
    for (const item of normalizados) {
      const planejado = daCor.find((celula) => celula.tamanho === item.tamanho)?.quantidade ?? 0;
      const acumulado = (jaCortado.get(chaveCorte(item.cor, item.tamanho)) ?? 0) + item.quantidade;
      if (acumulado > planejado) {
        falha(
          `O tamanho ${item.tamanho} ultrapassa o planejado (${planejado}). Autorize o excedente para registrar este corte.`,
          409,
        );
      }
    }
  }

  if (!Number.isInteger(dados.camadas) || dados.camadas < 1) {
    falha('Informe o número de camadas do enfesto', 400);
  }
  const controle = consumoPorUnidade(materia.unidade);
  const metragem = dados.metragem ?? 0;
  const pesoReal = dados.peso_real ?? 0;
  if (controle === 'metro' && !(metragem > 0)) {
    falha('Informe a metragem consumida', 400);
  }
  if (controle === 'peso' && !(pesoReal > 0)) {
    falha('Informe o peso real consumido', 400);
  }

  const quantidadePecas = normalizados.reduce((soma, item) => soma + item.quantidade, 0);
  const baixa = quantidadeBaixaEstoque(materia.unidade, pesoReal, metragem);
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
  const baixaAnterior = db
    .prepare(
      `SELECT movimento_id FROM cortes_infesto
        WHERE empresa_id = ? AND ordem_id = ? AND materia_prima_id = ?
          AND quantidade_baixada > 0 AND movimento_id IS NOT NULL
        ORDER BY id ASC
        LIMIT 1`,
    )
    .get(empresaId, ordemId, materia.id) as { movimento_id: number } | undefined;
  let movimentoId = jaBaixado?.movimento_id ?? baixaAnterior?.movimento_id ?? null;
  let quantidadeBaixada = 0;

  if (movimentoId == null) {
    const movimento = registrarMovimentoEstoque(db, empresaId, {
      tipo: 'saida',
      quantidade: baixa.quantidade,
      materia_prima_id: materia.id,
      motivo: `Corte ${ordem.codigo ?? `OP ${ordem.id}`}`,
      observacoes: `${corSalva} · ${dados.camadas} camadas · ${baixa.quantidade} ${materia.unidade}`,
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
      quantidadePecas,
      dados.camadas,
      metragem,
      pesoReal,
      quantidadeBaixada,
      materia.unidade,
      movimentoId,
    );
  const corteId = Number(info.lastInsertRowid);
  const inserirItem = db.prepare(
    `INSERT INTO corte_infesto_itens (empresa_id, corte_infesto_id, cor, tamanho, quantidade)
     VALUES (?, ?, ?, ?, ?)`,
  );
  for (const item of normalizados) {
    inserirItem.run(empresaId, corteId, item.cor, item.tamanho, item.quantidade);
  }

  const execucoes = listarCortesDaOrdem(db, empresaId, ordemId);
  const avancou = gradeCoberta(grade, mapaCortado(execucoes));
  if (avancou) {
    db.prepare(
      `UPDATE ordens_producao
          SET status = 'costura', atualizado_em = datetime('now')
        WHERE id = ? AND empresa_id = ?`,
    ).run(ordemId, empresaId);
    avancarEtapasAposCorte(db, empresaId, ordemId);
  }

  const salvo = listarCortesDaOrdem(db, empresaId, ordemId).find((corte) => corte.id === corteId);
  if (!salvo) falha('Não foi possível registrar o corte', 500);
  return { ...salvo, avancou };
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
