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
  tecido_cor_id: number | null;
  nome_cadastro: string | null;
  aviso: string | null;
};

export type DocumentoProcessado = LeituraDocumento & {
  id: number;
  nome_arquivo: string;
  fornecedor: { id: number; nome: string } | null;
  itens: ItemSugerido[];
};

type Cadastro = {
  id: number;
  nome: string;
  unidade: string;
  tipo: string;
  cores: Array<{ id: number; nome: string; status: string }>;
};

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
  const info = db
    .prepare(
      `INSERT INTO documentos_importados (
         empresa_id, usuario_id, tipo, nome_arquivo, numero, emitente, cnpj,
         data_emissao, total, itens_json, avisos_json, texto
       ) VALUES (
         @empresa_id, @usuario_id, @tipo, @nome_arquivo, @numero, @emitente, @cnpj,
         @data_emissao, @total, @itens_json, @avisos_json, @texto
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
      itens_json: JSON.stringify(itens),
      avisos_json: JSON.stringify(leitura.avisos),
      texto: texto.slice(0, 20000),
    });
  return {
    ...leitura,
    id: Number(info.lastInsertRowid),
    nome_arquivo: entrada.nomeArquivo,
    fornecedor,
    itens,
  };
}

function listarCadastros(db: AppDatabase, empresaId: number): Cadastro[] {
  const materias = db
    .prepare(
      `SELECT id, nome, unidade, tipo FROM materias_primas
        WHERE empresa_id = ? AND status = 'ativo'`,
    )
    .all(empresaId) as Array<{ id: number; nome: string; unidade: string; tipo: string }>;
  const cores = db
    .prepare('SELECT id, tecido_id, nome, status FROM tecido_cores WHERE empresa_id = ?')
    .all(empresaId) as Array<{ id: number; tecido_id: number; nome: string; status: string }>;
  return materias.map((materia) => ({
    ...materia,
    cores: cores
      .filter((cor) => cor.tecido_id === materia.id)
      .map((cor) => ({ id: cor.id, nome: cor.nome, status: cor.status })),
  }));
}

function sugerirItem(item: ItemLido, cadastros: Cadastro[]): ItemSugerido {
  const descricao = normalizar(item.descricao);
  const ordenados = [...cadastros].sort((a, b) => b.nome.length - a.nome.length);
  const cadastro = ordenados.find((atual) => descricao.includes(normalizar(atual.nome)));
  if (!cadastro) {
    return {
      ...item,
      materia_prima_id: null,
      tecido_cor_id: null,
      nome_cadastro: null,
      aviso: 'Item não encontrado no cadastro',
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
    tecido_cor_id: corId,
    nome_cadastro: cadastro.nome,
    aviso,
  };
}

function acharFornecedor(
  db: AppDatabase,
  empresaId: number,
  leitura: LeituraDocumento,
): { id: number; nome: string } | null {
  const fornecedores = db
    .prepare('SELECT id, nome, cpf_cnpj FROM fornecedores WHERE empresa_id = ? AND status = \'ativo\'')
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
