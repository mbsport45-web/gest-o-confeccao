import { larguraParaCm, numeroDoTexto } from './consumoCorte.js';
import type { AppDatabase } from './db.js';
import {
  alocarCodigoOc,
  codigoRascunhoReservadoValido,
  formatarCodigoOc,
  numeroDeCodigoOc,
} from './ordemCorteCodigo.js';

export type TecidoFicha = {
  materia_prima_id: number | null;
  nome: string;
  cor: string;
  largura_cm: number | string | null;
  largura_unidade: string;
  gramatura: number | string | null;
  composicao: string;
  unidade: string;
  numero_rolo: string;
};

export type SugestaoFichaCorte = {
  id: string;
  rotulo: string;
  produto_id: number | null;
  nome: string;
  sku: string;
  modelo: string;
  referencia: string;
  imagem: string | null;
};

function slug(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40)
    .toUpperCase();
}

function nuloNumero(valor: number | string | null | undefined): number | null {
  return numeroDoTexto(valor);
}

function unidadeLargura(valor: string | null | undefined): string {
  return (valor || 'cm').trim().toLowerCase() === 'm' ? 'm' : 'cm';
}

export function garantirCliente(
  db: AppDatabase,
  empresaId: number,
  entrada: { cliente_id?: number | null; cliente?: string | null },
): { id: number; nome: string } | null {
  if (entrada.cliente_id) {
    const existente = db
      .prepare('SELECT id, nome FROM clientes WHERE id = ? AND empresa_id = ?')
      .get(entrada.cliente_id, empresaId) as { id: number; nome: string } | undefined;
    if (existente) return existente;
  }
  const nome = (entrada.cliente ?? '').trim();
  if (!nome) return null;
  const mesmoNome = db
    .prepare(
      `SELECT id, nome FROM clientes
        WHERE empresa_id = ? AND lower(nome) = lower(?)
        ORDER BY id ASC LIMIT 1`,
    )
    .get(empresaId, nome) as { id: number; nome: string } | undefined;
  if (mesmoNome) return mesmoNome;
  const info = db
    .prepare(
      `INSERT INTO clientes (empresa_id, nome, status)
       VALUES (?, ?, 'ativo')`,
    )
    .run(empresaId, nome);
  return { id: Number(info.lastInsertRowid), nome };
}

export function garantirProduto(
  db: AppDatabase,
  empresaId: number,
  entrada: { produto_id?: number | null; modelo?: string | null; referencia?: string | null },
): { id: number; nome: string; sku: string | null } | null {
  if (entrada.produto_id) {
    const existente = db
      .prepare('SELECT id, nome, sku FROM produtos WHERE id = ? AND empresa_id = ?')
      .get(entrada.produto_id, empresaId) as { id: number; nome: string; sku: string | null } | undefined;
    if (existente) return existente;
  }
  const referencia = (entrada.referencia ?? '').trim();
  const modelo = (entrada.modelo ?? '').trim();
  if (referencia) {
    const porSku = db
      .prepare(
        `SELECT id, nome, sku FROM produtos
          WHERE empresa_id = ? AND sku IS NOT NULL AND lower(sku) = lower(?)
          LIMIT 1`,
      )
      .get(empresaId, referencia) as { id: number; nome: string; sku: string | null } | undefined;
    if (porSku) return porSku;
  }
  if (modelo) {
    const porNome = db
      .prepare(
        `SELECT id, nome, sku FROM produtos
          WHERE empresa_id = ? AND lower(nome) = lower(?)
          ORDER BY id ASC LIMIT 1`,
      )
      .get(empresaId, modelo) as { id: number; nome: string; sku: string | null } | undefined;
    if (porNome) return porNome;
  }
  if (!modelo) return null;
  let sku = referencia || slug(modelo) || 'MODELO';
  const usado = db
    .prepare(
      `SELECT id FROM produtos WHERE empresa_id = ? AND sku IS NOT NULL AND lower(sku) = lower(?) LIMIT 1`,
    )
    .get(empresaId, sku) as { id: number } | undefined;
  if (usado) sku = `${sku}-${Date.now().toString().slice(-4)}`;
  const info = db
    .prepare(
      `INSERT INTO produtos (empresa_id, sku, nome, unidade, status, cores, tamanhos)
       VALUES (?, ?, ?, 'UN', 'ativo', '[]', '[]')`,
    )
    .run(empresaId, sku, modelo);
  return { id: Number(info.lastInsertRowid), nome: modelo, sku };
}

export function salvarTecidoFicha(
  db: AppDatabase,
  empresaId: number,
  ordemCorteId: number,
  tecido: TecidoFicha,
) {
  db.prepare(
    `INSERT INTO ordem_corte_tecido_ficha (
       empresa_id, ordem_corte_id, materia_prima_id, nome, cor, largura_cm, gramatura, composicao, unidade,
       largura_unidade, numero_rolo
     ) VALUES (
       @empresa_id, @ordem_corte_id, @materia_prima_id, @nome, @cor, @largura_cm, @gramatura, @composicao, @unidade,
       @largura_unidade, @numero_rolo
     )
     ON CONFLICT(empresa_id, ordem_corte_id) DO UPDATE SET
       materia_prima_id = excluded.materia_prima_id,
       nome = excluded.nome,
       cor = excluded.cor,
       largura_cm = excluded.largura_cm,
       gramatura = excluded.gramatura,
       composicao = excluded.composicao,
       unidade = excluded.unidade,
       largura_unidade = excluded.largura_unidade,
       numero_rolo = excluded.numero_rolo`,
  ).run({
    empresa_id: empresaId,
    ordem_corte_id: ordemCorteId,
    materia_prima_id: tecido.materia_prima_id,
    nome: tecido.nome.trim(),
    cor: tecido.cor.trim(),
    largura_cm: nuloNumero(tecido.largura_cm),
    gramatura: nuloNumero(tecido.gramatura),
    composicao: tecido.composicao.trim(),
    unidade: (tecido.unidade || 'KG').trim().toUpperCase() || 'KG',
    largura_unidade: unidadeLargura(tecido.largura_unidade),
    numero_rolo: (tecido.numero_rolo ?? '').trim().slice(0, 80),
  });
}

export function lerTecidoFicha(
  db: AppDatabase,
  empresaId: number,
  ordemCorteId: number,
): TecidoFicha | null {
  const linha = db
    .prepare(
      `SELECT materia_prima_id, nome, cor, largura_cm, gramatura, composicao, unidade, largura_unidade, numero_rolo
         FROM ordem_corte_tecido_ficha
        WHERE empresa_id = ? AND ordem_corte_id = ?`,
    )
    .get(empresaId, ordemCorteId) as
    | {
        materia_prima_id: number | null;
        nome: string;
        cor: string;
        largura_cm: number | null;
        gramatura: number | null;
        composicao: string;
        unidade: string;
        largura_unidade: string;
        numero_rolo: string;
      }
    | undefined;
  if (!linha) return null;
  return {
    materia_prima_id: linha.materia_prima_id ?? null,
    nome: linha.nome ?? '',
    cor: linha.cor ?? '',
    largura_cm: linha.largura_cm ?? null,
    largura_unidade: unidadeLargura(linha.largura_unidade),
    gramatura: linha.gramatura ?? null,
    composicao: linha.composicao ?? '',
    unidade: linha.unidade || 'KG',
    numero_rolo: linha.numero_rolo ?? '',
  };
}

export function tecidoParaConsumo(
  ficha: TecidoFicha | null,
  materia?: { unidade?: string | null; largura_cm?: number | null; gramatura?: number | null } | null,
): { unidade: string; larguraCm: number | null; gramatura: number | null } {
  return {
    unidade: ficha?.unidade || materia?.unidade || 'KG',
    larguraCm: larguraParaCm(nuloNumero(ficha?.largura_cm ?? materia?.largura_cm), ficha?.largura_unidade),
    gramatura: nuloNumero(ficha?.gramatura ?? materia?.gramatura),
  };
}

export function listarSugestoesFichaCorte(
  db: AppDatabase,
  empresaId: number,
): { modelos: SugestaoFichaCorte[]; referencias: SugestaoFichaCorte[] } {
  const produtos = db
    .prepare(
      `SELECT id, nome, ifnull(sku, '') AS sku, imagem
         FROM produtos
        WHERE empresa_id = ? AND status = 'ativo'
        ORDER BY datetime(atualizado_em) DESC, id DESC
        LIMIT 250`,
    )
    .all(empresaId) as Array<{ id: number; nome: string; sku: string; imagem: string | null }>;
  const fotoPorProduto = new Map(produtos.map((produto) => [produto.id, produto.imagem ?? null]));
  const fichas = db
    .prepare(
      `SELECT modelo, referencia, produto_id
         FROM ordens_corte
        WHERE empresa_id = ?
          AND (trim(modelo) != '' OR trim(referencia) != '')
        ORDER BY datetime(atualizado_em) DESC, id DESC
        LIMIT 250`,
    )
    .all(empresaId) as Array<{ modelo: string; referencia: string; produto_id: number | null }>;

  const modelos = new Map<string, SugestaoFichaCorte>();
  const referencias = new Map<string, SugestaoFichaCorte>();

  function gravarModelo(item: SugestaoFichaCorte) {
    const chave = item.nome.trim().toLocaleLowerCase('pt-BR');
    if (!chave || modelos.has(chave)) return;
    modelos.set(chave, item);
  }
  function gravarReferencia(item: SugestaoFichaCorte) {
    const chave = item.referencia.trim().toLocaleLowerCase('pt-BR');
    if (!chave || referencias.has(chave)) return;
    referencias.set(chave, item);
  }

  for (const produto of produtos) {
    const item: SugestaoFichaCorte = {
      id: `p-${produto.id}`,
      rotulo: produto.sku ? `${produto.sku} — ${produto.nome}` : produto.nome,
      produto_id: produto.id,
      nome: produto.nome,
      sku: produto.sku,
      modelo: produto.nome,
      referencia: produto.sku,
      imagem: produto.imagem ?? null,
    };
    gravarModelo(item);
    gravarReferencia(item);
  }
  for (const ficha of fichas) {
    const item: SugestaoFichaCorte = {
      id: `oc-${ficha.modelo}-${ficha.referencia}`,
      rotulo: ficha.referencia ? `${ficha.referencia} — ${ficha.modelo}` : ficha.modelo,
      produto_id: ficha.produto_id,
      nome: ficha.modelo,
      sku: ficha.referencia,
      modelo: ficha.modelo,
      referencia: ficha.referencia,
      imagem: ficha.produto_id ? fotoPorProduto.get(ficha.produto_id) ?? null : null,
    };
    gravarModelo(item);
    gravarReferencia(item);
  }

  return {
    modelos: [...modelos.values()].slice(0, 250),
    referencias: [...referencias.values()].slice(0, 250),
  };
}

function objetoPayload(payload: unknown): Record<string, unknown> {
  return payload && typeof payload === 'object' && !Array.isArray(payload)
    ? { ...(payload as Record<string, unknown>) }
    : {};
}

function codigoReservadoDoPayload(payload: unknown): string | null {
  const numero = numeroDeCodigoOc(typeof payload === 'object' && payload && 'codigo' in payload
    ? String((payload as { codigo?: unknown }).codigo ?? '')
    : '');
  return numero ? formatarCodigoOc(numero) : null;
}

function gravarPayloadRascunho(
  db: AppDatabase,
  empresaId: number,
  usuarioId: number,
  payload: unknown,
) {
  db.prepare(
    `INSERT INTO ordem_corte_rascunhos (empresa_id, usuario_id, payload, atualizado_em)
     VALUES (?, ?, ?, datetime('now'))
     ON CONFLICT(empresa_id, usuario_id) DO UPDATE SET
       payload = excluded.payload,
       atualizado_em = datetime('now')`,
  ).run(empresaId, usuarioId, JSON.stringify(payload ?? {}));
}

export function salvarRascunhoFicha(
  db: AppDatabase,
  empresaId: number,
  usuarioId: number,
  payload: unknown,
) {
  db.transaction(() => {
    const atual = lerRascunhoFicha(db, empresaId, usuarioId);
    const dados = objetoPayload(payload);
    const atualValido = codigoRascunhoReservadoValido(db, empresaId, codigoReservadoDoPayload(atual?.payload));
    const enviadoValido = codigoRascunhoReservadoValido(db, empresaId, codigoReservadoDoPayload(dados));
    dados.codigo = atualValido
      ? codigoReservadoDoPayload(atual?.payload)
      : enviadoValido
        ? codigoReservadoDoPayload(dados)
        : alocarCodigoOc(db, empresaId);
    gravarPayloadRascunho(db, empresaId, usuarioId, dados);
  }).immediate();
}

export function lerRascunhoFicha(
  db: AppDatabase,
  empresaId: number,
  usuarioId: number,
): { payload: unknown; atualizado_em: string } | null {
  const linha = db
    .prepare(
      `SELECT payload, atualizado_em
         FROM ordem_corte_rascunhos
        WHERE empresa_id = ? AND usuario_id = ?`,
    )
    .get(empresaId, usuarioId) as { payload: string; atualizado_em: string } | undefined;
  if (!linha) return null;
  try {
    return { payload: JSON.parse(linha.payload), atualizado_em: linha.atualizado_em };
  } catch {
    return { payload: {}, atualizado_em: linha.atualizado_em };
  }
}

export function garantirCodigoRascunho(
  db: AppDatabase,
  empresaId: number,
  usuarioId: number,
): { payload: unknown; atualizado_em: string } {
  return db.transaction(() => {
    const atual = lerRascunhoFicha(db, empresaId, usuarioId);
    const codigoAtual = codigoReservadoDoPayload(atual?.payload);
    if (atual && codigoAtual && codigoRascunhoReservadoValido(db, empresaId, codigoAtual)) {
      const payload = objetoPayload(atual.payload);
      if (payload.codigo === codigoAtual) {
        return { payload, atualizado_em: atual.atualizado_em };
      }
      payload.codigo = codigoAtual;
      gravarPayloadRascunho(db, empresaId, usuarioId, payload);
      return lerRascunhoFicha(db, empresaId, usuarioId) ?? { payload, atualizado_em: atual.atualizado_em };
    }
    const dados = objetoPayload(atual?.payload);
    dados.codigo = alocarCodigoOc(db, empresaId);
    gravarPayloadRascunho(db, empresaId, usuarioId, dados);
    return lerRascunhoFicha(db, empresaId, usuarioId) ?? {
      payload: dados,
      atualizado_em: new Date().toISOString(),
    };
  }).immediate();
}

export function apagarRascunhoFicha(db: AppDatabase, empresaId: number, usuarioId: number) {
  db.prepare('DELETE FROM ordem_corte_rascunhos WHERE empresa_id = ? AND usuario_id = ?').run(
    empresaId,
    usuarioId,
  );
}
