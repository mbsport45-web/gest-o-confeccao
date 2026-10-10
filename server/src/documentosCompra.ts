import { createHash } from 'node:crypto';
import type { AppDatabase } from './db.js';
import { apenasDigitos } from './cpfCnpj.js';
import {
  interpretarDocumento,
  unidadeCanonico,
  type ItemLido,
  type LeituraDocumento,
  type TipoDocumento,
} from './leituraDocumento.js';
import { textoDoPdf } from './pdfTexto.js';

export type ItemSugerido = ItemLido & {
  materia_prima_id: number | null;
  produto_id: number | null;
  tecido_cor_id: number | null;
  nome_cadastro: string | null;
  aviso: string | null;
};

export type CompraExistente = { id: number; codigo: string | null };

export type DocumentoProcessado = LeituraDocumento & {
  id: number;
  nome_arquivo: string;
  conteudo_hash: string;
  fornecedor: { id: number; nome: string } | null;
  itens: ItemSugerido[];
  ja_importado: boolean;
  compra_existente: CompraExistente | null;
};

type Cadastro = {
  id: number;
  nome: string;
  unidade: string;
  tipo: string;
  cores: Array<{ id: number; nome: string; status: string }>;
};

type ChaveDocumento = {
  conteudo_hash: string;
  tipo: string;
  numero: string | null;
  cnpj: string | null;
};

export function hashDoPdf(pdf: Buffer): string {
  return createHash('sha256').update(pdf).digest('hex');
}

export function entradaExistente(
  db: AppDatabase,
  empresaId: number,
  chave: ChaveDocumento,
): CompraExistente | null {
  const row = db
    .prepare(
      `SELECT c.id, c.codigo
         FROM pedidos_compra c
         JOIN documentos_importados d
           ON d.id = c.documento_importado_id AND d.empresa_id = c.empresa_id
        WHERE c.empresa_id = @empresa_id
          AND c.status != 'cancelada'
          AND (
            d.conteudo_hash = @conteudo_hash
            OR (
              @numero IS NOT NULL
              AND d.numero = @numero
              AND d.tipo = @tipo
              AND ifnull(d.cnpj, '') = ifnull(@cnpj, '')
            )
          )
        ORDER BY c.id DESC
        LIMIT 1`,
    )
    .get({
      empresa_id: empresaId,
      conteudo_hash: chave.conteudo_hash,
      numero: chave.numero,
      tipo: chave.tipo,
      cnpj: chave.cnpj,
    }) as CompraExistente | undefined;
  return row ?? null;
}

export async function processarDocumentoCompra(
  db: AppDatabase,
  empresaId: number,
  usuarioId: number,
  entrada: { tipo: TipoDocumento; nomeArquivo: string; pdf: Buffer },
): Promise<DocumentoProcessado> {
  const texto = await textoDoPdf(entrada.pdf);
  const leitura = interpretarDocumento(texto, entrada.tipo);
  const cadastros = listarCadastros(db, empresaId);
  const itens = leitura.itens.map((item) => sugerirItem(item, cadastros));
  const fornecedor = acharFornecedor(db, empresaId, leitura);
  const conteudoHash = hashDoPdf(entrada.pdf);
  const info = db
    .prepare(
      `INSERT INTO documentos_importados (
         empresa_id, usuario_id, tipo, nome_arquivo, numero, emitente, cnpj,
         data_emissao, total, conteudo_hash, itens_json, avisos_json, texto
       ) VALUES (
         @empresa_id, @usuario_id, @tipo, @nome_arquivo, @numero, @emitente, @cnpj,
         @data_emissao, @total, @conteudo_hash, @itens_json, @avisos_json, @texto
       )`,
    )
    .run({
      empresa_id: empresaId,
      usuario_id: usuarioId,
      tipo: entrada.tipo,
      nome_arquivo: entrada.nomeArquivo.slice(0, 200),
      numero: leitura.numero,
      emitente: leitura.emitente,
      cnpj: leitura.cnpj,
      data_emissao: leitura.data_emissao,
      total: leitura.total,
      conteudo_hash: conteudoHash,
      itens_json: JSON.stringify(itens),
      avisos_json: JSON.stringify(leitura.avisos),
      texto: texto.slice(0, 20000),
    });
  const compraExistente = entradaExistente(db, empresaId, {
    conteudo_hash: conteudoHash,
    tipo: entrada.tipo,
    numero: leitura.numero,
    cnpj: leitura.cnpj,
  });
  if (compraExistente) {
    leitura.avisos.push('Este documento já foi importado.');
  }
  return {
    ...leitura,
    id: Number(info.lastInsertRowid),
    nome_arquivo: entrada.nomeArquivo,
    conteudo_hash: conteudoHash,
    fornecedor,
    itens,
    ja_importado: Boolean(compraExistente),
    compra_existente: compraExistente,
  };
}

function listarCadastros(db: AppDatabase, empresaId: number): Cadastro[] {
  const materias = db
    .prepare(
      `SELECT id, nome, unidade, tipo FROM materias_primas
        WHERE empresa_id = ? AND status = 'ativo'`,
    )
    .all(empresaId) as Array<{ id: number; nome: string; unidade: string; tipo: string }>;
  const cores = tabelaDeCores(db)
    ? (db
        .prepare('SELECT id, tecido_id, nome, status FROM tecido_cores WHERE empresa_id = ?')
        .all(empresaId) as Array<{ id: number; tecido_id: number; nome: string; status: string }>)
    : [];
  const produtos = db
    .prepare(
      `SELECT p.id, p.nome, p.unidade,
              (SELECT COUNT(*) FROM produto_variantes v WHERE v.produto_id = p.id) AS variantes
         FROM produtos p
        WHERE p.empresa_id = ? AND p.status = 'ativo'`,
    )
    .all(empresaId) as Array<{ id: number; nome: string; unidade: string; variantes: number }>;
  return [
    ...materias.map((materia) => ({
      ...materia,
      cores: cores
        .filter((cor) => cor.tecido_id === materia.id)
        .map((cor) => ({ id: cor.id, nome: cor.nome, status: cor.status })),
    })),
    ...produtos
      .filter((produto) => produto.variantes === 0)
      .map((produto) => ({
        id: produto.id,
        nome: produto.nome,
        unidade: produto.unidade,
        tipo: 'produto',
        cores: [],
      })),
  ];
}

function sugerirItem(item: ItemLido, cadastros: Cadastro[]): ItemSugerido {
  const descricao = normalizar(item.descricao);
  const materias = cadastros
    .filter((atual) => atual.tipo !== 'produto')
    .sort((a, b) => b.nome.length - a.nome.length);
  const cadastro = materias.find((atual) => descricao.includes(normalizar(atual.nome)));
  if (!cadastro) {
    const produto = cadastros
      .filter((atual) => atual.tipo === 'produto')
      .sort((a, b) => b.nome.length - a.nome.length)
      .find((atual) => descricao.includes(normalizar(atual.nome)));
    if (!produto) {
      return {
        ...item,
        materia_prima_id: null,
        produto_id: null,
        tecido_cor_id: null,
        nome_cadastro: null,
        aviso: 'Item não encontrado no cadastro',
      };
    }
    return {
      ...item,
      materia_prima_id: null,
      produto_id: produto.id,
      tecido_cor_id: null,
      nome_cadastro: produto.nome,
      aviso: avisoDeUnidade(item.unidade, produto.unidade),
    };
  }
  const unidadeDoc = unidadeCanonico(item.unidade);
  const unidadeCadastro = cadastro.unidade?.trim().toUpperCase() || null;
  let aviso: string | null = null;
  if (unidadeDoc && unidadeCadastro && unidadeDoc !== unidadeCadastro) {
    aviso = `A unidade do documento (${unidadeDoc}) difere da cadastrada (${unidadeCadastro})`;
  }
  let corId: number | null = null;
  if (cadastro.tipo === 'tecido' && cadastro.cores.length > 0) {
    const cor = [...cadastro.cores]
      .sort((a, b) => b.nome.length - a.nome.length)
      .find((atual) => atual.status === 'ativo' && temPalavra(descricao, normalizar(atual.nome)));
    if (!cor) {
      return {
        ...item,
        materia_prima_id: null,
        produto_id: null,
        tecido_cor_id: null,
        nome_cadastro: cadastro.nome,
        aviso: 'Selecione a cor do tecido',
      };
    }
    corId = cor.id;
  }
  return {
    ...item,
    materia_prima_id: cadastro.id,
    produto_id: null,
    tecido_cor_id: corId,
    nome_cadastro: cadastro.nome,
    aviso,
  };
}

function avisoDeUnidade(unidadeItem: string | null, unidadeCadastro: string | null): string | null {
  const unidadeDoc = unidadeCanonico(unidadeItem);
  const cadastrada = unidadeCadastro?.trim().toUpperCase() || null;
  if (unidadeDoc && cadastrada && unidadeDoc !== cadastrada) {
    return `A unidade do documento (${unidadeDoc}) difere da cadastrada (${cadastrada})`;
  }
  return null;
}

function acharFornecedor(
  db: AppDatabase,
  empresaId: number,
  leitura: LeituraDocumento,
): { id: number; nome: string } | null {
  const fornecedores = db
    .prepare(`SELECT id, nome, cpf_cnpj FROM fornecedores WHERE empresa_id = ? AND status = 'ativo'`)
    .all(empresaId) as Array<{ id: number; nome: string; cpf_cnpj: string | null }>;
  if (leitura.cnpj) {
    const peloCnpj = fornecedores.find((fornecedor) => apenasDigitos(fornecedor.cpf_cnpj ?? '') === leitura.cnpj);
    if (peloCnpj) return { id: peloCnpj.id, nome: peloCnpj.nome };
  }
  if (leitura.emitente) {
    const alvo = normalizar(leitura.emitente);
    const peloNome = fornecedores.find((fornecedor) => {
      const nome = normalizar(fornecedor.nome);
      return nome.length >= 4 && (alvo.includes(nome) || nome.includes(alvo));
    });
    if (peloNome) return { id: peloNome.id, nome: peloNome.nome };
  }
  return null;
}

function tabelaDeCores(db: AppDatabase): boolean {
  const row = db
    .prepare(`SELECT 1 AS ok FROM sqlite_master WHERE type = 'table' AND name = 'tecido_cores'`)
    .get() as { ok: number } | undefined;
  return Boolean(row);
}

function normalizar(valor: string): string {
  return valor
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLocaleLowerCase('pt-BR')
    .replace(/\s+/g, ' ')
    .trim();
}

function temPalavra(texto: string, palavra: string): boolean {
  if (!palavra) return false;
  const escapada = palavra.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(?:^|\\s)${escapada}(?:\\s|$)`).test(texto);
}
