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
  cor_sugerida: string | null;
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

const LIGACOES = new Set(['com', 'de', 'da', 'do', 'das', 'dos', 'para', 'sem', 'e', 'em', 'ao', 'a']);

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
        cor_sugerida: null,
        aviso: 'Item não encontrado no cadastro',
      };
    }
    return {
      ...item,
      materia_prima_id: null,
      produto_id: produto.id,
      tecido_cor_id: null,
      nome_cadastro: produto.nome,
      cor_sugerida: null,
      aviso: avisoDeUnidade(item.unidade, produto.unidade),
    };
  }
  const avisoUnidade = avisoDeUnidade(item.unidade, cadastro.unidade);
  let corId: number | null = null;
  let corNova: string | null = null;
  let aviso = avisoUnidade;
  if (cadastro.tipo === 'tecido') {
    const cor = [...cadastro.cores]
      .sort((a, b) => b.nome.length - a.nome.length)
      .find((atual) => atual.status === 'ativo' && temPalavra(descricao, normalizar(atual.nome)));
    if (cor) {
      corId = cor.id;
    } else {
      corNova = corSugerida(item.descricao, cadastro.nome);
      if (corNova) aviso = `Cadastre a cor ${corNova} neste tecido`;
      else if (cadastro.cores.some((atual) => atual.status === 'ativo')) aviso = 'Selecione a cor do tecido';
    }
  }
  return {
    ...item,
    materia_prima_id: cadastro.id,
    produto_id: null,
    tecido_cor_id: corId,
    nome_cadastro: cadastro.nome,
    cor_sugerida: corNova,
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

function corSugerida(descricao: string, nomeCadastro: string): string | null {
  const usadas = new Set(normalizar(nomeCadastro).split(' ').filter(Boolean));
  const restantes = descricao.split(/\s+/).filter((palavra) => {
    const normal = normalizar(palavra).replace(/[^a-z0-9]/g, '');
    if (!normal || usadas.has(normal) || LIGACOES.has(normal) || /^\d/.test(normal)) return false;
    return true;
  });
  if (restantes.length === 0 || restantes.length > 3) return null;
  const nome = restantes.join(' ').trim();
  const unidade = unidadeCanonico(nome);
  if (nome.length < 2 || nome.length > 40 || unidade === 'KG' || unidade === 'METRO' || unidade === 'UN') {
    return null;
  }
  return nome;
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
