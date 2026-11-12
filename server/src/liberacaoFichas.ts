import type { Router } from 'express';
import { z } from 'zod';
import { avancarOpAposCorte, concluirOpAposEntregaOficina } from './corteInfesto.js';
import type { AppDatabase } from './db.js';
import { sincronizarStatusPedidoFromOps } from './pedidos.js';
import { nomeArquivoPdfOrdemCorte, pdfImpressaoOrdemCorte } from './ordemCortePdf.js';
import {
  htmlImpressaoOrdemCorte,
  obterOrdemCorte,
  registrarApontamentoOrdemCorte,
  registrarHistoricoOrdemCorte,
  type ExtraImpressaoOc,
  type OrdemCorte,
} from './ordensGrade.js';
import { registrarOcDisponivelAposEntrega } from './estampas.js';
import { empresaDaSessao } from './tenant.js';
import {
  encaminharOcParaExpedicao,
  obterExpedicaoOcDaFicha,
  salvarConferenciaExpedicaoOc,
  type ExpedicaoOcRegistro,
} from './expedicao.js';
import { lancarContaPagarOficina, pecasContaPagarOficina } from './financeiro.js';
import { pagamentoDaOc, type PagamentoOficinaLeitura } from './pagamentoOficina.js';

export type LiberacaoFichaRegistro = {
  costureiro: string;
  valor_peca: number;
  referencia: string;
  tipo_peca: string;
  oficina: string;
  oficina_id: number | null;
  data_liberacao: string | null;
  data_retirada: string | null;
  codigo_oc: string;
  liberado_em: string;
  liberado_por: number | null;
  liberado_por_nome: string | null;
  entregue_em: string | null;
  entregue_por: number | null;
  entregue_por_nome: string | null;
};

export type FichaLiberacao = OrdemCorte & {
  valor_peca_sugerido: number | null;
  costureiros: string[];
  oficinas_opcoes: string[];
  liberacao: LiberacaoFichaRegistro | null;
  expedicao: ExpedicaoOcRegistro | null;
  pagamento: PagamentoOficinaLeitura | null;
};

function falha(mensagem: string, status = 400): never {
  throw Object.assign(new Error(mensagem), { status });
}

function tipoPecaDaFicha(corte: OrdemCorte): string {
  return (corte.modelo || corte.produto || '').trim();
}

function numeroMoeda(valor: unknown): number | null {
  if (typeof valor === 'number') return Number.isFinite(valor) && valor >= 0 ? valor : null;
  const t = String(valor ?? '')
    .trim()
    .replace(/\s/g, '')
    .replace(/^R\$/i, '');
  if (!t) return null;
  let normalizado = t;
  if (t.includes(',') && t.includes('.')) {
    const virgulaPorUltimo = t.lastIndexOf(',') > t.lastIndexOf('.');
    normalizado = virgulaPorUltimo ? t.replace(/\./g, '').replace(',', '.') : t.replace(/,/g, '');
  } else {
    normalizado = t.replace(',', '.');
  }
  const n = Number(normalizado);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

function extrasDaLiberacao(
  liberacao: LiberacaoFichaRegistro | null,
  corte?: OrdemCorte,
): ExtraImpressaoOc | undefined {
  if (!liberacao) return undefined;
  const oficinaFicha = corte?.oficinas.find((item) => item.oficina.trim())?.oficina.trim() ?? '';
  const costureiroFicha = corte?.oficinas.find((item) => item.costureiro.trim())?.costureiro.trim() ?? '';
  return {
    costureiro: liberacao.costureiro.trim() || costureiroFicha,
    valor_peca: Number.isFinite(liberacao.valor_peca) ? liberacao.valor_peca : null,
    liberado_em: liberacao.liberado_em,
    oficina: liberacao.oficina.trim() || oficinaFicha,
    data_liberacao: liberacao.data_liberacao || (liberacao.liberado_em ? liberacao.liberado_em.slice(0, 10) : null),
    data_retirada: liberacao.data_retirada || corte?.data_retirada || null,
    codigo_oc: liberacao.codigo_oc.trim() || corte?.codigo || '',
  };
}

export function obterLiberacaoDaOrdem(
  db: AppDatabase,
  empresaId: number,
  corte: OrdemCorte,
): LiberacaoFichaRegistro | null {
  const daFicha = obterLiberacaoFicha(db, empresaId, corte.id);
  if (daFicha) return daFicha;
  const linha = db
    .prepare(
      `SELECT costureiro, valor_peca, referencia, tipo_peca, oficina, data_liberacao,
              codigo_oc, liberado_em, liberado_por, entregue_em, entregue_por, ordem_corte_id
         FROM ordem_corte_liberacoes
        WHERE empresa_id = ? AND ordem_id = ?
        ORDER BY CASE WHEN ordem_corte_id = ? THEN 0 ELSE 1 END, liberado_em DESC, ordem_corte_id DESC
        LIMIT 1`,
    )
    .get(empresaId, corte.ordem_id, corte.id) as
    | {
        costureiro: string;
        valor_peca: number;
        referencia: string;
        tipo_peca: string;
        oficina: string;
        data_liberacao: string | null;
        codigo_oc: string;
        liberado_em: string;
        liberado_por: number | null;
        entregue_em: string | null;
        entregue_por: number | null;
        ordem_corte_id: number;
      }
    | undefined;
  if (!linha || linha.ordem_corte_id !== corte.id) return null;
  return {
    costureiro: linha.costureiro,
    valor_peca: Number(linha.valor_peca) || 0,
    referencia: linha.referencia,
    tipo_peca: linha.tipo_peca,
    oficina: linha.oficina ?? '',
    oficina_id: idOficinaCadastro(db, empresaId, linha.oficina ?? ''),
    data_liberacao: linha.data_liberacao ?? null,
    data_retirada: corte.data_retirada ?? dataRetiradaDaFicha(db, empresaId, corte.id),
    codigo_oc: linha.codigo_oc ?? '',
    liberado_em: linha.liberado_em,
    liberado_por: linha.liberado_por,
    liberado_por_nome: nomeUsuario(db, linha.liberado_por),
    entregue_em: linha.entregue_em ?? null,
    entregue_por: linha.entregue_por ?? null,
    entregue_por_nome: nomeUsuario(db, linha.entregue_por),
  };
}

export function extrasImpressaoLiberacao(
  db: AppDatabase,
  empresaId: number,
  corte: OrdemCorte,
): ExtraImpressaoOc | undefined {
  return extrasDaLiberacao(obterLiberacaoDaOrdem(db, empresaId, corte), corte);
}

function parseDataLiberacao(valor: unknown): string | null {
  const t = String(valor ?? '').trim();
  const iso = t.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (iso) {
    const data = new Date(`${iso[1]}-${iso[2]}-${iso[3]}T12:00:00`);
    if (!Number.isNaN(data.getTime())) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  }
  const br = t.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (br) {
    const data = new Date(`${br[3]}-${br[2]}-${br[1]}T12:00:00`);
    if (!Number.isNaN(data.getTime())) return `${br[3]}-${br[2]}-${br[1]}`;
  }
  return null;
}

function unicosNomes(...listas: Array<Array<{ nome: string } | string>>): string[] {
  const vistos = new Set<string>();
  const nomes: string[] = [];
  for (const lista of listas) {
    for (const item of lista) {
      const nome = (typeof item === 'string' ? item : item.nome).trim();
      if (!nome) continue;
      const chave = nome.toLocaleLowerCase('pt-BR');
      if (vistos.has(chave)) continue;
      vistos.add(chave);
      nomes.push(nome);
    }
  }
  return nomes;
}

function nomeUsuario(db: AppDatabase, usuarioId: number | null): string | null {
  if (!usuarioId) return null;
  const linha = db.prepare('SELECT nome FROM usuarios WHERE id = ?').get(usuarioId) as { nome: string } | undefined;
  return linha?.nome ?? null;
}

function idOficinaCadastro(db: AppDatabase, empresaId: number, nome: string): number | null {
  const limpo = nome.trim();
  if (!limpo) return null;
  const linha = db
    .prepare(
      `SELECT id FROM oficinas_cadastro
        WHERE empresa_id = ? AND lower(trim(nome)) = lower(?)`,
    )
    .get(empresaId, limpo) as { id: number } | undefined;
  return linha?.id ?? null;
}

function dataRetiradaDaFicha(db: AppDatabase, empresaId: number, ordemCorteId: number): string | null {
  const linha = db
    .prepare('SELECT data_retirada FROM ordens_corte WHERE id = ? AND empresa_id = ?')
    .get(ordemCorteId, empresaId) as { data_retirada: string | null } | undefined;
  return linha?.data_retirada ?? null;
}

function persistirLiberacaoNaFicha(
  db: AppDatabase,
  empresaId: number,
  corte: OrdemCorte,
  entrada: { oficina: string; costureiro: string; data_retirada: string | null },
) {
  const existente =
    corte.oficinas.find(
      (item) =>
        item.oficina.trim().toLocaleLowerCase('pt-BR') === entrada.oficina.toLocaleLowerCase('pt-BR') ||
        item.costureiro.trim().toLocaleLowerCase('pt-BR') === entrada.costureiro.toLocaleLowerCase('pt-BR'),
    ) ?? corte.oficinas[0];
  if (existente?.id) {
    db.prepare(
      `UPDATE ordem_corte_oficinas
          SET oficina = ?, costureiro = ?
        WHERE id = ? AND empresa_id = ? AND ordem_corte_id = ?`,
    ).run(entrada.oficina, entrada.costureiro, existente.id, empresaId, corte.id);
  } else {
    db.prepare(
      `INSERT INTO ordem_corte_oficinas (empresa_id, ordem_corte_id, oficina, costureiro, observacoes)
       VALUES (?, ?, ?, ?, '')`,
    ).run(empresaId, corte.id, entrada.oficina, entrada.costureiro);
  }
  if (entrada.data_retirada) {
    db.prepare('UPDATE ordens_corte SET data_retirada = ?, atualizado_em = datetime(\'now\') WHERE id = ? AND empresa_id = ?').run(
      entrada.data_retirada,
      corte.id,
      empresaId,
    );
  }
  if (!(corte.informacoes_costureiros ?? '').trim()) {
    db.prepare(
      `UPDATE ordens_corte
          SET informacoes_costureiros = ?, atualizado_em = datetime('now')
        WHERE id = ? AND empresa_id = ?`,
    ).run(entrada.costureiro, corte.id, empresaId);
  }
}

export function obterLiberacaoFicha(
  db: AppDatabase,
  empresaId: number,
  ordemCorteId: number,
): LiberacaoFichaRegistro | null {
  const linha = db
    .prepare(
      `SELECT costureiro, valor_peca, referencia, tipo_peca, oficina, data_liberacao,
              codigo_oc, liberado_em, liberado_por, entregue_em, entregue_por
         FROM ordem_corte_liberacoes
        WHERE empresa_id = ? AND ordem_corte_id = ?`,
    )
    .get(empresaId, ordemCorteId) as
    | {
        costureiro: string;
        valor_peca: number;
        referencia: string;
        tipo_peca: string;
        oficina: string;
        data_liberacao: string | null;
        codigo_oc: string;
        liberado_em: string;
        liberado_por: number | null;
        entregue_em: string | null;
        entregue_por: number | null;
      }
    | undefined;
  if (!linha) return null;
  return {
    ...linha,
    valor_peca: Number(linha.valor_peca) || 0,
    oficina: linha.oficina ?? '',
    oficina_id: idOficinaCadastro(db, empresaId, linha.oficina ?? ''),
    data_liberacao: linha.data_liberacao ?? null,
    data_retirada: dataRetiradaDaFicha(db, empresaId, ordemCorteId),
    codigo_oc: linha.codigo_oc ?? '',
    liberado_por_nome: nomeUsuario(db, linha.liberado_por),
    entregue_em: linha.entregue_em ?? null,
    entregue_por: linha.entregue_por ?? null,
    entregue_por_nome: nomeUsuario(db, linha.entregue_por),
  };
}

export function listarCostureirosConhecidos(db: AppDatabase, empresaId: number): string[] {
  const dasOficinas = db
    .prepare(
      `SELECT DISTINCT trim(costureiro) AS nome
         FROM ordem_corte_oficinas
        WHERE empresa_id = ? AND trim(costureiro) != ''
        ORDER BY lower(trim(costureiro))`,
    )
    .all(empresaId) as Array<{ nome: string }>;
  const dasLiberacoes = db
    .prepare(
      `SELECT DISTINCT trim(costureiro) AS nome
         FROM ordem_corte_liberacoes
        WHERE empresa_id = ? AND trim(costureiro) != ''
        ORDER BY lower(trim(costureiro))`,
    )
    .all(empresaId) as Array<{ nome: string }>;
  return unicosNomes(dasOficinas, dasLiberacoes);
}

export function listarOficinasCadastradas(db: AppDatabase, empresaId: number): string[] {
  const cadastro = db
    .prepare(
      `SELECT DISTINCT trim(nome) AS nome
         FROM oficinas_cadastro
        WHERE empresa_id = ? AND trim(nome) != ''
        ORDER BY lower(trim(nome))`,
    )
    .all(empresaId) as Array<{ nome: string }>;
  const dasFichas = db
    .prepare(
      `SELECT DISTINCT trim(oficina) AS nome
         FROM ordem_corte_oficinas
        WHERE empresa_id = ? AND trim(oficina) != ''
        ORDER BY lower(trim(oficina))`,
    )
    .all(empresaId) as Array<{ nome: string }>;
  const dasLiberacoes = db
    .prepare(
      `SELECT DISTINCT trim(oficina) AS nome
         FROM ordem_corte_liberacoes
        WHERE empresa_id = ? AND trim(oficina) != ''
        ORDER BY lower(trim(oficina))`,
    )
    .all(empresaId) as Array<{ nome: string }>;
  return unicosNomes(cadastro, dasFichas, dasLiberacoes);
}

export type OficinaPixCadastro = {
  id: number;
  nome: string;
  chave_pix: string;
};

export function cadastrarOficina(
  db: AppDatabase,
  empresaId: number,
  nome: string,
): { nome: string; ja_existia: boolean } {
  const limpo = nome.trim();
  if (!limpo) falha('Informe o nome da oficina');
  const existente = db
    .prepare(
      `SELECT nome FROM oficinas_cadastro
        WHERE empresa_id = ? AND lower(trim(nome)) = lower(?)`,
    )
    .get(empresaId, limpo) as { nome: string } | undefined;
  if (existente) return { nome: existente.nome, ja_existia: true };
  db.prepare('INSERT INTO oficinas_cadastro (empresa_id, nome) VALUES (?, ?)').run(empresaId, limpo);
  return { nome: limpo, ja_existia: false };
}

export function listarOficinasPix(db: AppDatabase, empresaId: number): OficinaPixCadastro[] {
  return db
    .prepare(
      `SELECT id, trim(nome) AS nome, coalesce(trim(chave_pix), '') AS chave_pix
         FROM oficinas_cadastro
        WHERE empresa_id = ? AND trim(nome) != ''
        ORDER BY lower(trim(nome))`,
    )
    .all(empresaId) as OficinaPixCadastro[];
}

export function salvarChavePixOficina(
  db: AppDatabase,
  empresaId: number,
  nome: string,
  chavePix: string,
): OficinaPixCadastro {
  const limpo = nome.trim();
  if (!limpo) falha('Informe o nome da oficina');
  const chave = String(chavePix ?? '').trim();
  cadastrarOficina(db, empresaId, limpo);
  db.prepare(
    `UPDATE oficinas_cadastro
        SET chave_pix = ?
      WHERE empresa_id = ? AND lower(trim(nome)) = lower(?)`,
  ).run(chave, empresaId, limpo);
  const salva = db
    .prepare(
      `SELECT id, trim(nome) AS nome, coalesce(trim(chave_pix), '') AS chave_pix
         FROM oficinas_cadastro
        WHERE empresa_id = ? AND lower(trim(nome)) = lower(?)`,
    )
    .get(empresaId, limpo) as OficinaPixCadastro | undefined;
  if (!salva) falha('Oficina não encontrada', 404);
  return salva;
}

export function valorPecaSugerido(
  db: AppDatabase,
  empresaId: number,
  referencia: string,
  tipoPeca: string,
): number | null {
  const ref = referencia.trim();
  const tipo = tipoPeca.trim();
  if (!ref || !tipo) return null;
  const linha = db
    .prepare(
      `SELECT valor_peca FROM valores_peca_referencia
        WHERE empresa_id = ? AND lower(referencia) = lower(?) AND lower(tipo_peca) = lower(?)`,
    )
    .get(empresaId, ref, tipo) as { valor_peca: number } | undefined;
  if (!linha) return null;
  const valor = Number(linha.valor_peca);
  return Number.isFinite(valor) ? valor : null;
}

function montarFichaLiberacao(
  db: AppDatabase,
  empresaId: number,
  corte: OrdemCorte,
  costureiros: string[],
  oficinasOpcoes: string[],
): FichaLiberacao {
  const tipoPeca = tipoPecaDaFicha(corte);
  const sugerido = valorPecaSugerido(db, empresaId, corte.referencia, tipoPeca);
  const daFicha = corte.oficinas.map((item) => item.costureiro.trim()).filter(Boolean);
  return {
    ...corte,
    valor_peca_sugerido: sugerido,
    costureiros: unicosNomes(daFicha, costureiros),
    oficinas_opcoes: unicosNomes(
      corte.oficinas.map((item) => item.oficina.trim()).filter(Boolean),
      oficinasOpcoes,
    ),
    liberacao: obterLiberacaoFicha(db, empresaId, corte.id),
    expedicao: obterExpedicaoOcDaFicha(db, empresaId, corte.id) ?? null,
    pagamento: pagamentoDaOc(db, empresaId, corte.id),
  };
}

function montarListaFichas(
  db: AppDatabase,
  empresaId: number,
  ids: Array<{ ordem_id: number }>,
): FichaLiberacao[] {
  const costureiros = listarCostureirosConhecidos(db, empresaId);
  const oficinasOpcoes = listarOficinasCadastradas(db, empresaId);
  return ids
    .map((linha) => obterOrdemCorte(db, empresaId, linha.ordem_id))
    .filter((corte): corte is OrdemCorte => Boolean(corte))
    .map((corte) => montarFichaLiberacao(db, empresaId, corte, costureiros, oficinasOpcoes));
}

export function listarFichasPendentesLiberacao(db: AppDatabase, empresaId: number): FichaLiberacao[] {
  const ids = db
    .prepare(
      `SELECT ordem_id FROM ordens_corte
        WHERE empresa_id = ?
          AND status_processo = 'corte_concluido'
          AND id NOT IN (
            SELECT ordem_corte_id FROM ordem_corte_liberacoes WHERE empresa_id = ?
          )
        ORDER BY COALESCE(concluido_corte_em, atualizado_em) DESC, id DESC`,
    )
    .all(empresaId, empresaId) as Array<{ ordem_id: number }>;
  return montarListaFichas(db, empresaId, ids);
}

export function listarFichasLiberadas(db: AppDatabase, empresaId: number): FichaLiberacao[] {
  const ids = db
    .prepare(
      `SELECT o.ordem_id
         FROM ordens_corte o
         JOIN ordem_corte_liberacoes l
           ON l.empresa_id = o.empresa_id AND l.ordem_corte_id = o.id
        WHERE o.empresa_id = ?
        ORDER BY l.liberado_em DESC, o.id DESC
        LIMIT 40`,
    )
    .all(empresaId) as Array<{ ordem_id: number }>;
  return montarListaFichas(db, empresaId, ids);
}

function gravarValorPeca(
  db: AppDatabase,
  empresaId: number,
  referencia: string,
  tipoPeca: string,
  valorPeca: number,
) {
  const ref = referencia.trim();
  const tipo = tipoPeca.trim();
  if (!ref || !tipo) return;
  const existente = db
    .prepare(
      `SELECT referencia, tipo_peca FROM valores_peca_referencia
        WHERE empresa_id = ? AND lower(referencia) = lower(?) AND lower(tipo_peca) = lower(?)`,
    )
    .get(empresaId, ref, tipo) as { referencia: string; tipo_peca: string } | undefined;
  if (existente) {
    db.prepare(
      `UPDATE valores_peca_referencia
          SET valor_peca = ?, atualizado_em = datetime('now')
        WHERE empresa_id = ? AND referencia = ? AND tipo_peca = ?`,
    ).run(valorPeca, empresaId, existente.referencia, existente.tipo_peca);
    return;
  }
  db.prepare(
    `INSERT INTO valores_peca_referencia (empresa_id, referencia, tipo_peca, valor_peca, atualizado_em)
     VALUES (?, ?, ?, ?, datetime('now'))`,
  ).run(empresaId, ref, tipo, valorPeca);
}

export function confirmarLiberacaoFicha(
  db: AppDatabase,
  empresaId: number,
  ordemId: number,
  entrada: {
    costureiro: string;
    valor_peca: unknown;
    oficina: string;
    data_liberacao: unknown;
    data_retirada?: unknown;
  },
  usuarioId: number | null,
): FichaLiberacao {
  const corte = obterOrdemCorte(db, empresaId, ordemId);
  if (!corte) falha('Ordem de corte não encontrada', 404);
  if (corte.status_processo !== 'corte_concluido') {
    falha('Só é possível liberar fichas com o corte concluído', 409);
  }
  if (obterLiberacaoFicha(db, empresaId, corte.id)) {
    falha('Esta ficha já foi liberada para a oficina', 409);
  }
  const costureiro = String(entrada.costureiro ?? '').trim();
  if (!costureiro) falha('Selecione o costureiro');
  const oficina = String(entrada.oficina ?? '').trim();
  if (!oficina) falha('Selecione a oficina');
  const dataLiberacao = parseDataLiberacao(entrada.data_liberacao);
  if (!dataLiberacao) falha('Informe a data de liberação para oficina');
  const valorPeca = numeroMoeda(entrada.valor_peca);
  if (valorPeca == null) falha('Informe o valor por peça em reais');
  const dataRetirada = parseDataLiberacao(entrada.data_retirada) || corte.data_retirada;

  const tipoPeca = tipoPecaDaFicha(corte);
  const aplicar = db.transaction(() => {
    const oficinaSalva = cadastrarOficina(db, empresaId, oficina);
    persistirLiberacaoNaFicha(db, empresaId, corte, {
      oficina: oficinaSalva.nome,
      costureiro,
      data_retirada: dataRetirada,
    });
    db.prepare(
      `INSERT INTO ordem_corte_liberacoes (
         empresa_id, ordem_corte_id, ordem_id, costureiro, valor_peca,
         referencia, tipo_peca, oficina, data_liberacao, codigo_oc,
         liberado_em, liberado_por
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), ?)`,
    ).run(
      empresaId,
      corte.id,
      corte.ordem_id,
      costureiro,
      valorPeca,
      corte.referencia.trim(),
      tipoPeca,
      oficinaSalva.nome,
      dataLiberacao,
      corte.codigo,
      usuarioId,
    );
    gravarValorPeca(db, empresaId, corte.referencia, tipoPeca, valorPeca);
    registrarApontamentoOrdemCorte(db, empresaId, ordemId, { acao: 'encaminhar' }, usuarioId);
    avancarOpAposCorte(db, empresaId, ordemId);
    const liberacao = obterLiberacaoFicha(db, empresaId, corte.id);
    registrarHistoricoOrdemCorte(
      db,
      empresaId,
      corte.id,
      usuarioId,
      'liberar_oficina',
      `Liberou a ficha ${corte.codigo} para ${oficinaSalva.nome} · ${costureiro} · ${valorPeca.toLocaleString('pt-BR', {
        style: 'currency',
        currency: 'BRL',
      })}`,
      {
        codigo_oc: corte.codigo,
        oficina: oficinaSalva.nome,
        oficina_id: idOficinaCadastro(db, empresaId, oficinaSalva.nome),
        costureiro,
        valor_peca: valorPeca,
        data_liberacao: dataLiberacao,
        data_retirada: dataRetirada,
        referencia: corte.referencia,
        tipo_peca: tipoPeca,
        liberado_em: liberacao?.liberado_em ?? null,
      },
    );
  });
  try {
    aplicar();
  } catch (e) {
    const msg = String((e as Error).message);
    if (msg.includes('UNIQUE')) falha('Esta ficha já foi liberada para a oficina', 409);
    throw e;
  }
  const atualizada = obterOrdemCorte(db, empresaId, ordemId);
  if (!atualizada) falha('Ordem de corte não encontrada', 404);
  return montarFichaLiberacao(
    db,
    empresaId,
    atualizada,
    listarCostureirosConhecidos(db, empresaId),
    listarOficinasCadastradas(db, empresaId),
  );
}

export function confirmarEntregaOficina(
  db: AppDatabase,
  empresaId: number,
  ordemId: number,
  usuarioId: number | null,
): FichaLiberacao {
  const corte = obterOrdemCorte(db, empresaId, ordemId);
  if (!corte) falha('Ordem de corte não encontrada', 404);
  const existente = obterLiberacaoFicha(db, empresaId, corte.id);
  if (!existente) falha('Ficha ainda não foi liberada para a oficina', 409);
  if (existente.entregue_em) falha('Esta entrega já foi confirmada', 409);

  const aplicar = db.transaction(() => {
    const resultado = db
      .prepare(
        `UPDATE ordem_corte_liberacoes
            SET entregue_em = datetime('now'), entregue_por = ?
          WHERE empresa_id = ? AND ordem_corte_id = ? AND entregue_em IS NULL`,
      )
      .run(usuarioId, empresaId, corte.id);
    if (resultado.changes === 0) falha('Esta entrega já foi confirmada', 409);
    const liberacao = obterLiberacaoFicha(db, empresaId, corte.id);
    const pecas = pecasContaPagarOficina(
      corte.grade.reduce((soma, celula) => soma + celula.quantidade, 0),
      corte.quantidade,
    );
    lancarContaPagarOficina(db, {
      empresa_id: empresaId,
      ordem_id: corte.ordem_id,
      ordem_corte_id: corte.id,
      codigo_oc: corte.codigo,
      oficina: existente.oficina,
      costureiro: existente.costureiro,
      modelo: corte.modelo || corte.produto || '',
      referencia: existente.referencia || corte.referencia || '',
      pecas,
      valor_peca: Number(existente.valor_peca) || 0,
      entregue_em: liberacao?.entregue_em ?? '',
    });
    registrarHistoricoOrdemCorte(
      db,
      empresaId,
      corte.id,
      usuarioId,
      'confirmar_entrega_oficina',
      `Confirmou a entrega da ficha ${corte.codigo} pela oficina ${existente.oficina}`,
      {
        codigo_oc: corte.codigo,
        oficina: existente.oficina,
        costureiro: existente.costureiro,
        entregue_em: liberacao?.entregue_em ?? null,
      },
    );
    concluirOpAposEntregaOficina(db, empresaId, corte.ordem_id);
    sincronizarStatusPedidoFromOps(db, corte.ordem_id);
  });
  aplicar();
  registrarOcDisponivelAposEntrega(db, empresaId, corte.id);
  const atualizada = obterOrdemCorte(db, empresaId, ordemId);
  if (!atualizada) falha('Ordem de corte não encontrada', 404);
  return montarFichaLiberacao(
    db,
    empresaId,
    atualizada,
    listarCostureirosConhecidos(db, empresaId),
    listarOficinasCadastradas(db, empresaId),
  );
}

export function sincronizarOrdensEntreguesOficina(db: AppDatabase): number {
  const rows = db
    .prepare(
      `SELECT DISTINCT empresa_id, ordem_id
         FROM ordem_corte_liberacoes
        WHERE entregue_em IS NOT NULL AND trim(entregue_em) != ''`,
    )
    .all() as Array<{ empresa_id: number; ordem_id: number }>;
  const aplicar = db.transaction(() => {
    for (const row of rows) {
      concluirOpAposEntregaOficina(db, row.empresa_id, row.ordem_id, { preservarDatas: true });
    }
  });
  aplicar();
  return rows.length;
}

export function salvarAviamentosLiberacao(
  db: AppDatabase,
  empresaId: number,
  ordemId: number,
  entrada: Array<{ descricao?: string; quantidade?: unknown; unidade?: string }>,
): FichaLiberacao {
  const corte = obterOrdemCorte(db, empresaId, ordemId);
  if (!corte) falha('Ordem de corte não encontrada', 404);
  const linhas = (entrada ?? [])
    .map((item) => {
      const descricao = String(item.descricao ?? '').trim();
      const unidade = String(item.unidade ?? 'UN').trim() || 'UN';
      const quantidade = numeroMoeda(item.quantidade) ?? 0;
      return { descricao, unidade, quantidade };
    })
    .filter((item) => item.descricao);
  const gravar = db.transaction(() => {
    db.prepare('DELETE FROM ordem_corte_aviamentos WHERE empresa_id = ? AND ordem_corte_id = ?').run(
      empresaId,
      corte.id,
    );
    const inserir = db.prepare(
      `INSERT INTO ordem_corte_aviamentos (
         empresa_id, ordem_corte_id, aviamento_id, descricao, quantidade, unidade, observacoes
       ) VALUES (?, ?, NULL, ?, ?, ?, '')`,
    );
    for (const item of linhas) {
      inserir.run(empresaId, corte.id, item.descricao, item.quantidade, item.unidade);
    }
  });
  gravar();
  const atualizada = obterOrdemCorte(db, empresaId, ordemId);
  if (!atualizada) falha('Ordem de corte não encontrada', 404);
  return montarFichaLiberacao(
    db,
    empresaId,
    atualizada,
    listarCostureirosConhecidos(db, empresaId),
    listarOficinasCadastradas(db, empresaId),
  );
}

const aviamentosSchema = z.object({
  aviamentos: z
    .array(
      z.object({
        descricao: z.string().max(200).optional().default(''),
        quantidade: z.union([z.number(), z.string()]).optional(),
        unidade: z.string().max(20).optional(),
      }),
    )
    .max(200),
});

const confirmarSchema = z.object({
  costureiro: z.string().trim().min(1).max(200),
  valor_peca: z.union([z.number(), z.string()]),
  oficina: z.string().trim().min(1).max(200),
  data_liberacao: z.string().trim().min(1).max(32),
  data_retirada: z.string().trim().max(32).optional().or(z.literal('')),
});

const conferenciaSchema = z.object({
  pecas_conferidas: z.union([z.number(), z.string()]),
});

const oficinaSchema = z.object({
  nome: z.string().trim().min(1).max(200),
});

const chavePixSchema = z.object({
  nome: z.string().trim().min(1).max(200),
  chave_pix: z.string().trim().max(120),
});

export function registrarRotasLiberacao(router: Router, db: AppDatabase) {
  router.get('/liberacao', (req, res) => {
    const empresaId = empresaDaSessao(req);
    res.json({
      data: listarFichasPendentesLiberacao(db, empresaId),
      liberadas: listarFichasLiberadas(db, empresaId),
      oficinas: listarOficinasCadastradas(db, empresaId),
      oficinas_pix: listarOficinasPix(db, empresaId),
    });
  });

  router.post('/liberacao/oficinas', (req, res) => {
    const parsed = oficinaSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        erro: 'Informe o nome da oficina',
        detalhes: parsed.error.flatten().fieldErrors,
      });
    }
    try {
      const oficina = cadastrarOficina(db, empresaDaSessao(req), parsed.data.nome);
      res.status(oficina.ja_existia ? 200 : 201).json(oficina);
    } catch (e) {
      const err = e as Error & { status?: number };
      return res.status(err.status ?? 400).json({ erro: err.message });
    }
  });

  router.put('/liberacao/oficinas/pix', (req, res) => {
    const parsed = chavePixSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        erro: 'Informe a oficina e a chave Pix',
        detalhes: parsed.error.flatten().fieldErrors,
      });
    }
    try {
      const oficina = salvarChavePixOficina(
        db,
        empresaDaSessao(req),
        parsed.data.nome,
        parsed.data.chave_pix,
      );
      res.json(oficina);
    } catch (e) {
      const err = e as Error & { status?: number };
      return res.status(err.status ?? 400).json({ erro: err.message });
    }
  });

  router.put('/liberacao/:ordemId/aviamentos', (req, res) => {
    const parsed = aviamentosSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        erro: 'Informe os aviamentos da ficha',
        detalhes: parsed.error.flatten().fieldErrors,
      });
    }
    try {
      const ficha = salvarAviamentosLiberacao(
        db,
        empresaDaSessao(req),
        Number(req.params.ordemId),
        parsed.data.aviamentos,
      );
      res.json(ficha);
    } catch (e) {
      const err = e as Error & { status?: number };
      return res.status(err.status ?? 400).json({ erro: err.message });
    }
  });

  router.post('/liberacao/:ordemId/expedicao', (req, res) => {
    try {
      const empresaId = empresaDaSessao(req);
      const ordemId = Number(req.params.ordemId);
      encaminharOcParaExpedicao(db, empresaId, ordemId, req.usuario?.id ?? null);
      const atualizada = obterOrdemCorte(db, empresaId, ordemId);
      if (!atualizada) return res.status(404).json({ erro: 'Ordem de corte não encontrada' });
      res.status(201).json(
        montarFichaLiberacao(
          db,
          empresaId,
          atualizada,
          listarCostureirosConhecidos(db, empresaId),
          listarOficinasCadastradas(db, empresaId),
        ),
      );
    } catch (e) {
      const err = e as Error & { status?: number };
      return res.status(err.status ?? 400).json({ erro: err.message });
    }
  });

  router.post('/liberacao/:ordemId/conferencia', (req, res) => {
    const parsed = conferenciaSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        erro: 'Informe a quantidade conferida',
        detalhes: parsed.error.flatten().fieldErrors,
      });
    }
    try {
      const empresaId = empresaDaSessao(req);
      const ordemId = Number(req.params.ordemId);
      salvarConferenciaExpedicaoOc(
        db,
        empresaId,
        ordemId,
        parsed.data.pecas_conferidas,
        req.usuario?.id ?? null,
      );
      const atualizada = obterOrdemCorte(db, empresaId, ordemId);
      if (!atualizada) return res.status(404).json({ erro: 'Ordem de corte não encontrada' });
      res.json(
        montarFichaLiberacao(
          db,
          empresaId,
          atualizada,
          listarCostureirosConhecidos(db, empresaId),
          listarOficinasCadastradas(db, empresaId),
        ),
      );
    } catch (e) {
      const err = e as Error & { status?: number };
      return res.status(err.status ?? 400).json({ erro: err.message });
    }
  });

  router.post('/liberacao/:ordemId/entrega', (req, res) => {
    try {
      const ficha = confirmarEntregaOficina(
        db,
        empresaDaSessao(req),
        Number(req.params.ordemId),
        req.usuario?.id ?? null,
      );
      res.json(ficha);
    } catch (e) {
      const err = e as Error & { status?: number };
      return res.status(err.status ?? 400).json({ erro: err.message });
    }
  });

  router.post('/liberacao/:ordemId', (req, res) => {
    const parsed = confirmarSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        erro: 'Informe a oficina, a data de liberação, o costureiro e o valor por peça',
        detalhes: parsed.error.flatten().fieldErrors,
      });
    }
    try {
      const ficha = confirmarLiberacaoFicha(
        db,
        empresaDaSessao(req),
        Number(req.params.ordemId),
        parsed.data,
        req.usuario?.id ?? null,
      );
      res.json(ficha);
    } catch (e) {
      const err = e as Error & { status?: number };
      return res.status(err.status ?? 400).json({ erro: err.message });
    }
  });

  router.get('/liberacao/:ordemId/impressao', (req, res) => {
    const empresaId = empresaDaSessao(req);
    const corte = obterOrdemCorte(db, empresaId, Number(req.params.ordemId));
    if (!corte) return res.status(404).json({ erro: 'Ordem de corte não encontrada' });
    res.type('html').send(htmlImpressaoOrdemCorte(corte, extrasImpressaoLiberacao(db, empresaId, corte)));
  });

  router.get('/liberacao/:ordemId/pdf', async (req, res) => {
    const empresaId = empresaDaSessao(req);
    const corte = obterOrdemCorte(db, empresaId, Number(req.params.ordemId));
    if (!corte) return res.status(404).json({ erro: 'Ordem de corte não encontrada' });
    try {
      const extras = extrasImpressaoLiberacao(db, empresaId, corte);
      const pdf = await pdfImpressaoOrdemCorte(corte, extras);
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="${nomeArquivoPdfOrdemCorte(corte.codigo)}"`);
      res.send(pdf);
    } catch (e) {
      const err = e as Error;
      return res.status(500).json({ erro: err.message || 'Não foi possível gerar o PDF da ficha' });
    }
  });
}

