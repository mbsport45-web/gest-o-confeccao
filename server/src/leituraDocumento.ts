import { UFS_BRASIL } from './clientes.js';
import { apenasDigitos, cnpjValido, cpfValido } from './cpfCnpj.js';

export const TIPOS_DOCUMENTO = ['nota_fiscal', 'pedido_compra', 'outro'] as const;
export type TipoDocumento = (typeof TIPOS_DOCUMENTO)[number];

export type ItemLido = {
  descricao: string;
  quantidade: number | null;
  unidade: string | null;
  valor_unitario: number | null;
  total: number | null;
};

export type TipoPessoaDocumento = 'juridica' | 'fisica';

export type LeituraDocumento = {
  tipo: TipoDocumento;
  numero: string | null;
  emitente: string | null;
  cnpj: string | null;
  cpf: string | null;
  tipo_pessoa: TipoPessoaDocumento | null;
  nome_fantasia: string | null;
  inscricao_estadual: string | null;
  telefone: string | null;
  whatsapp: string | null;
  email: string | null;
  cep: string | null;
  endereco: string | null;
  numero_endereco: string | null;
  complemento: string | null;
  bairro: string | null;
  cidade: string | null;
  estado: string | null;
  observacoes: string | null;
  data_emissao: string | null;
  total: number | null;
  itens: ItemLido[];
  avisos: string[];
};

const UNIDADES = /^(KG|METRO|METROS|M|MT|UN|PC|PÇ|PEÇA|PECA)$/i;

export function interpretarDocumento(textoBruto: string, tipo: TipoDocumento): LeituraDocumento {
  const texto = textoBruto.replace(/\r/g, '\n').replace(/[ \t]+\n/g, '\n').trim();
  const avisos: string[] = [];
  if (!texto) avisos.push('Não foi possível ler o texto deste PDF.');

  const regiaoEmitente = regiaoDoEmitente(texto);
  const cnpj = primeiroCnpj(regiaoEmitente);
  const cpf = primeiroCpf(regiaoEmitente);
  const numero = numeroDoDocumento(texto, tipo);
  const emitente = emitenteDoTexto(regiaoEmitente);
  const dados = completarDadosEmitente(regiaoEmitente, numero);
  const data = primeiraData(texto);
  const itens = itensDoTexto(texto);
  let total = totalDoTexto(texto);
  if (total == null && itens.length > 0) {
    const soma = itens.reduce((acc, item) => acc + (item.total ?? 0), 0);
    if (soma > 0) total = Math.round(soma * 100) / 100;
  }

  if (tipo === 'nota_fiscal' && !numero) avisos.push('O número da nota fiscal não foi identificado.');
  if (tipo === 'pedido_compra' && !numero) avisos.push('O número do pedido de compra não foi identificado.');
  if (!cnpj && !cpf && tipo !== 'outro') avisos.push('O CNPJ do emitente não foi identificado.');
  if (itens.length === 0) avisos.push('Nenhum item foi identificado. Confira o documento antes de lançar a compra.');

  return {
    tipo,
    numero,
    emitente,
    cnpj,
    cpf,
    tipo_pessoa: cnpj ? 'juridica' : cpf ? 'fisica' : null,
    ...dados,
    data_emissao: data,
    total,
    itens,
    avisos,
  };
}

export function numeroBrasileiro(valor: string): number | null {
  const limpo = valor.trim().replace(/\s/g, '').replace(/^R\$/i, '');
  if (!limpo || !/\d/.test(limpo)) return null;
  let normalizado = limpo;
  if (limpo.includes(',') && limpo.includes('.')) {
    normalizado = limpo.replace(/\./g, '').replace(',', '.');
  } else if (limpo.includes(',')) {
    normalizado = limpo.replace(',', '.');
  }
  const n = Number(normalizado);
  return Number.isFinite(n) ? n : null;
}

export function unidadeCanonico(valor: string | null): string | null {
  if (!valor) return null;
  const u = valor.trim().toUpperCase();
  if (u === 'KG') return 'KG';
  if (u === 'METRO' || u === 'METROS' || u === 'M' || u === 'MT') return 'METRO';
  if (u === 'UN' || u === 'PC' || u === 'PÇ' || u === 'PEÇA' || u === 'PECA') return 'UN';
  return u;
}

const NOMES_UF: Record<string, string> = {
  acre: 'AC',
  alagoas: 'AL',
  amapa: 'AP',
  amazonas: 'AM',
  bahia: 'BA',
  ceara: 'CE',
  'distrito federal': 'DF',
  'espirito santo': 'ES',
  goias: 'GO',
  maranhao: 'MA',
  'mato grosso': 'MT',
  'mato grosso do sul': 'MS',
  'minas gerais': 'MG',
  para: 'PA',
  paraiba: 'PB',
  parana: 'PR',
  pernambuco: 'PE',
  piaui: 'PI',
  'rio de janeiro': 'RJ',
  'rio grande do norte': 'RN',
  'rio grande do sul': 'RS',
  rondonia: 'RO',
  roraima: 'RR',
  'santa catarina': 'SC',
  'sao paulo': 'SP',
  sergipe: 'SE',
  tocantins: 'TO',
};

function dadosRotulados(texto: string, numeroDocumento: string | null) {
  const endereco = textoCurto(valorDoRotulo(texto, 'Endere[cç]o|Logradouro'), 300);
  const cidadeBruta = valorDoRotulo(texto, 'Cidade|Munic[íi]pio');
  const cidadePartes = cidadeBruta?.split(/\s*\/\s*/) ?? [];
  const ufNaCidade = cidadePartes[1] ? ufDeTexto(cidadePartes[1]) : null;
  const ufRotulo = valorDoRotulo(texto, 'Estado|UF', (valor) => ufDeTexto(valor) != null);
  return {
    nome_fantasia: textoCurto(valorDoRotulo(texto, 'Nome\\s+fantasia'), 200),
    inscricao_estadual: textoCurto(
      valorDoRotulo(texto, 'Inscri[cç][aã]o\\s+estadual|I\\.?E\\.?', inscricaoUtil),
      20,
    ),
    telefone: telefoneRotulado(texto, 'Telefone|Fone|Tel'),
    whatsapp: telefoneRotulado(texto, 'WhatsApp'),
    email: emailRotulado(texto),
    cep: cepRotulado(texto),
    endereco,
    numero_endereco: numeroEndereco(texto, numeroDocumento),
    complemento: textoCurto(valorDoRotulo(texto, 'Complemento'), 120),
    bairro: textoCurto(valorDoRotulo(texto, 'Bairro'), 200),
    cidade: textoCurto(ufNaCidade ? cidadePartes[0] : cidadeBruta, 200),
    estado: ufDeTexto(ufRotulo) ?? ufNaCidade,
    observacoes: textoCurto(valorDoRotulo(texto, 'Observa[cç][oõ]es?'), 2000),
  };
}

type DadosEmitente = ReturnType<typeof dadosRotulados>;

function completarDadosEmitente(texto: string, numeroDocumento: string | null): DadosEmitente {
  const rotulos = dadosRotulados(texto, numeroDocumento);
  const canhoto = enderecoDoCanhoto(texto);
  const extra = rotulos.endereco
    ? {
        ...canhoto,
        endereco: null,
        numero_endereco: null,
        complemento: null,
        bairro: null,
        cidade: null,
        estado: null,
      }
    : canhoto;
  const dados = preencherVazios(rotulos, extra);
  if (!dados.inscricao_estadual) dados.inscricao_estadual = inscricaoNaLinhaDoCnpj(texto);
  if (!dados.numero_endereco && dados.endereco) {
    const separado = separarLogradouro(dados.endereco);
    if (separado) {
      dados.endereco = textoCurto(separado.endereco, 300);
      dados.numero_endereco = separado.numero.slice(0, 30);
      if (!dados.complemento && separado.complemento) {
        dados.complemento = textoCurto(separado.complemento, 120);
      }
    }
  }
  return dados;
}

function preencherVazios(base: DadosEmitente, extra: Partial<DadosEmitente>): DadosEmitente {
  const saida: DadosEmitente = { ...base };
  for (const chave of Object.keys(extra) as (keyof DadosEmitente)[]) {
    const valor = extra[chave];
    if (saida[chave] == null && valor) saida[chave] = valor;
  }
  return saida;
}

function regiaoDoEmitente(texto: string): string {
  const linhas = texto.split('\n');
  const corte = linhas.findIndex((linha) => /^(?:DESTINAT[ÁA]RIO|TRANSPORTADOR)\b/i.test(linha.trim()));
  if (corte <= 0) return texto;
  return linhas.slice(0, corte).join('\n');
}

function enderecoDoCanhoto(texto: string): Partial<DadosEmitente> {
  const linhas = texto.split('\n').map((linha) => linha.trim()).filter(Boolean);
  const inicio = linhas.findIndex((linha) => /RECEBEMOS\s+DE\s+.+\s+OS\s+PRODUTOS/i.test(linha));
  if (inicio < 0) return {};
  const bloco: string[] = [];
  for (const linha of linhas.slice(inicio + 1, inicio + 9)) {
    if (/^(?:DESTINAT[ÁA]RIO|DOCUMENTO\s+AUXILIAR|CONSULTA\b|NF-?e\b|_{4,})/i.test(linha)) break;
    if (/^\d{2}\/\d{2}\/\d{4}$/.test(linha)) break;
    bloco.push(linha);
  }

  let cep: string | null = null;
  let telefone: string | null = null;
  let email: string | null = null;
  let estado: string | null = null;
  let endereco: string | null = null;
  let numero: string | null = null;
  let complemento: string | null = null;
  const restantes: string[] = [];

  for (const linha of bloco) {
    const cepLinha = linha.match(/^CEP\s*[:\-]?\s*(.*)$/i);
    if (cepLinha) {
      const digitos = apenasDigitos(cepLinha[1]);
      if (digitos.length === 8) cep = digitos;
      continue;
    }
    const fone = linha.match(/^(?:TELEFONE|FONE|TEL)\s*[:\-]?\s*(.*)$/i);
    if (fone) {
      const digitos = apenasDigitos(fone[1]);
      if (digitos.length >= 10 && digitos.length <= 15) telefone = digitos;
      continue;
    }
    const emailLinha = linha.match(/^(?:E-?mail\s*[:\-]?\s*)?([A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,})$/i);
    if (emailLinha) {
      email = emailLinha[1];
      continue;
    }
    if (/^[A-Z]{2}$/.test(linha) && (UFS_BRASIL as readonly string[]).includes(linha.toUpperCase())) {
      estado = linha.toUpperCase();
      continue;
    }
    if (!endereco) {
      const separado = separarLogradouro(linha);
      if (separado) {
        endereco = separado.endereco;
        numero = separado.numero;
        complemento = separado.complemento;
        continue;
      }
      if (pareceLogradouro(linha)) {
        endereco = linha;
        continue;
      }
    }
    if (!numero && endereco && /^\d{1,6}[A-Za-z]?$/.test(linha)) {
      numero = linha;
      continue;
    }
    if (/^\d+$/.test(linha) || pareceRotulo(linha) || linha.length > 80) continue;
    restantes.push(linha);
  }

  let bairro: string | null = null;
  let cidade: string | null = null;
  if (restantes.length === 1) cidade = restantes[0];
  if (restantes.length === 2) {
    bairro = restantes[0];
    cidade = restantes[1];
  }

  return {
    telefone,
    email,
    cep,
    endereco: textoCurto(endereco, 300),
    numero_endereco: numero,
    complemento: textoCurto(complemento, 120),
    bairro: textoCurto(bairro, 200),
    cidade: textoCurto(cidade, 200),
    estado,
  };
}

function separarLogradouro(linha: string): { endereco: string; numero: string; complemento: string | null } | null {
  const match = linha.match(/^(.+?),\s*(\d+[A-Za-z]?)\b\s*(?:,\s*|-)?\s*(.*)$/);
  if (!match) return null;
  const endereco = match[1].trim();
  if (endereco.length < 2 || /^\d/.test(endereco) || !/[A-Za-zÀ-ÿ]/.test(endereco) || pareceRotulo(endereco)) {
    return null;
  }
  const complemento = match[3]?.trim() || null;
  return { endereco, numero: match[2], complemento };
}

function pareceLogradouro(linha: string): boolean {
  return /^(?:R\.?|RUA|AV\.?|AVENIDA|AL\.?|ALAMEDA|TV\.?|TRAVESSA|ROD\.?|RODOVIA|EST\.?|ESTRADA|PC\.?|PRA[CÇ]A|LARGO|VIA)\b/i.test(
    linha,
  );
}

function inscricaoNaLinhaDoCnpj(texto: string): string | null {
  for (const bruta of texto.split('\n')) {
    const match = bruta.trim().match(/^(\d{2,14})\s+(?:\d{2,14}\s+)?(\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2})$/);
    if (!match || !cnpjValido(apenasDigitos(match[2]))) continue;
    if (!inscricaoUtil(match[1])) continue;
    return match[1];
  }
  return null;
}

function inscricaoUtil(valor: string): boolean {
  const limpo = valor.trim();
  if (/^ISENTO$/i.test(limpo)) return true;
  if (!/^[\d./-]{2,20}$/.test(limpo)) return false;
  const digitos = apenasDigitos(limpo);
  return digitos.length >= 2 && digitos.length <= 14 && !cnpjValido(digitos);
}

function valorDoRotulo(
  texto: string,
  rotulo: string,
  aceita: (valor: string) => boolean = valorAceitavel,
): string | null {
  const linhas = texto.split('\n').map((linha) => linha.trim()).filter(Boolean);
  const separado = new RegExp(`^(?:${rotulo})\\s*[:\\-]\\s*(.+)$`, 'i');
  const junto = new RegExp(`^(?:${rotulo})\\s+(.+)$`, 'i');
  const sozinho = new RegExp(`^(?:${rotulo})\\s*[:\\-]?$`, 'i');
  for (let indice = 0; indice < linhas.length; indice += 1) {
    const linha = linhas[indice];
    const porSeparador = linha.match(separado);
    if (porSeparador?.[1]) {
      const valor = limparTrecho(porSeparador[1]);
      if (valor && aceita(valor)) return valor;
    }
    const porEspaco = linha.match(junto);
    if (porEspaco?.[1]) {
      const valor = limparTrecho(porEspaco[1]);
      if (valor && aceita(valor)) return valor;
    }
    if (!sozinho.test(linha)) continue;
    const proxima = linhas[indice + 1];
    if (!proxima || pareceRotulo(proxima)) continue;
    const valor = limparTrecho(proxima);
    if (valor && aceita(valor)) return valor;
  }
  return null;
}

function limparTrecho(valor: string): string {
  return valor.split(/\s{2,}|\|/)[0].trim();
}

function valorAceitavel(valor: string): boolean {
  const texto = valor.trim();
  if (texto.length < 2 || texto.length > 300 || pareceRotulo(texto)) return false;
  if (!/\d/.test(texto) && /\b(?:CNPJ|CPF|INSCRI|BAIRRO|MUNIC[IÍ]PIO|CEP|TELEFONE|FONE)\b/i.test(texto)) {
    return false;
  }
  return true;
}

function pareceRotulo(linha: string): boolean {
  const texto = linha.trim().replace(/[:\-]\s*$/, '').trim();
  return /^(?:CNPJ(?:\s*\/\s*CPF)?|CPF|CEP|UF|FONE(?:\s*\/\s*FAX)?|TELEFONE|TEL|E-?MAIL|WHATSAPP|INSCRI[CÇ][AÃ]O(?:\s+ESTADUAL)?|I\.?E\.?|ENDERE[CÇ]O|LOGRADOURO|BAIRRO|CIDADE|MUNIC[IÍ]PIO|COMPLEMENTO|N[ÚU]MERO(?:\s+DA\s+NOTA)?|N[º°]|NOME\s+FANTASIA|FANTASIA|RAZ[AÃ]O\s+SOCIAL|FORNECEDOR|EMITENTE|DESTINAT[ÁA]RIO|TRANSPORTADOR|CHAVE\s+DE\s+ACESSO|NATUREZA\s+DA\s+OPERA[CÇ][AÃ]O|S[ÉE]RIE|NF-?E|OBSERVA[CÇ][OÕ]ES?)$/i.test(
    texto,
  );
}

function textoCurto(valor: string | null | undefined, limite: number): string | null {
  const texto = valor?.trim();
  if (!texto) return null;
  return texto.slice(0, limite);
}

function telefoneRotulado(texto: string, rotulo: string): string | null {
  const bruto = valorDoRotulo(texto, rotulo, (valor) => {
    const digitos = apenasDigitos(valor);
    return digitos.length >= 10 && digitos.length <= 15;
  });
  if (!bruto) return null;
  const digitos = apenasDigitos(bruto);
  return digitos.length >= 10 && digitos.length <= 15 ? digitos : null;
}

function emailRotulado(texto: string): string | null {
  const bruto = valorDoRotulo(texto, 'E-?mail', (valor) => /@/.test(valor));
  if (!bruto) return null;
  const email = bruto.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
  return email ? email[0] : null;
}

function cepRotulado(texto: string): string | null {
  const bruto = valorDoRotulo(texto, 'CEP', (valor) => apenasDigitos(valor).length === 8);
  if (!bruto) return null;
  const digitos = apenasDigitos(bruto);
  return digitos.length === 8 ? digitos : null;
}

function numeroEndereco(texto: string, numeroDocumento: string | null): string | null {
  const linhas = texto
    .split('\n')
    .map((linha) => linha.trim())
    .filter((linha) => linha && !/n[úu]mero\s+da\s+nota/i.test(linha));
  const bruto = valorDoRotulo(linhas.join('\n'), 'N[úu]mero|N[º°]', (valor) => {
    const limpo = limparTrecho(valor);
    return limpo.length > 0 && limpo.length <= 30 && limpo !== numeroDocumento && !pareceRotulo(limpo);
  });
  if (!bruto || bruto === numeroDocumento) return null;
  return bruto.slice(0, 30);
}

function ufDeTexto(valor: string | null | undefined): string | null {
  if (!valor) return null;
  const semAcento = valor
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLocaleLowerCase('pt-BR')
    .trim();
  const primeiro = semAcento.split(/[\s,;/|-]+/)[0]?.toUpperCase();
  if (primeiro && (UFS_BRASIL as readonly string[]).includes(primeiro)) return primeiro;
  return NOMES_UF[semAcento] ?? NOMES_UF[semAcento.split(/\s+-\s+/)[0] ?? ''] ?? null;
}

function primeiroCpf(texto: string): string | null {
  const linhas = texto.split('\n').map((linha) => linha.trim()).filter(Boolean);
  for (let indice = 0; indice < linhas.length; indice += 1) {
    const linha = linhas[indice];
    const achado = linha.match(/\bCPF\b\s*[:\-]?\s*(\d{3}\.?\d{3}\.?\d{3}-?\d{2})/i);
    if (achado) {
      const resto = linha.slice((achado.index ?? 0) + achado[0].length);
      if (/\d/.test(resto)) continue;
      const digitos = apenasDigitos(achado[1]);
      if (cpfValido(digitos)) return digitos;
      continue;
    }
    if (!/^CPF\s*[:\-]?$/i.test(linha)) continue;
    const candidato = (linhas[indice + 1] ?? '').match(/^(\d{3}\.?\d{3}\.?\d{3}-?\d{2})$/);
    if (!candidato) continue;
    const digitos = apenasDigitos(candidato[1]);
    if (cpfValido(digitos)) return digitos;
  }
  return null;
}

function primeiroCnpj(texto: string): string | null {
  const encontrados = texto.match(/(?<!\d)\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}(?!\d)/g) ?? [];
  for (const candidato of encontrados) {
    const digitos = apenasDigitos(candidato);
    if (digitos.length === 14 && cnpjValido(digitos)) return digitos;
  }
  return null;
}

function numeroDoDocumento(texto: string, tipo: TipoDocumento): string | null {
  if (tipo === 'nota_fiscal' || tipo === 'outro') {
    const danfe =
      texto.match(/(\d{3}\.\d{3}\.\d{3})\s*N(?!\d)/i) ??
      texto.match(/\bN[º°o]\s*[:.]?\s*(\d{3}\.\d{3}\.\d{3})\b/i);
    if (danfe) return danfe[1];
    const nota =
      texto.match(/NF[- ]?e\b[^\d]{0,24}(\d{1,9})/i) ??
      texto.match(/N[úu]mero(?:\s+da\s+nota)?\s*[:.]?\s*(\d{1,9})/i) ??
      texto.match(/Nota\s+Fiscal\s*(?:n[º°o.]*)?\s*[:.]?\s*(\d{1,9})/i);
    if (nota) return nota[1];
  }
  if (tipo === 'pedido_compra' || tipo === 'outro') {
    const pedido = texto.match(
      /Pedido(?:\s+de\s+compra)?\s*(?:n[º°o.]*)?\s*[:.]?\s*([A-Z0-9][A-Z0-9./-]{0,20})/i,
    );
    if (pedido && !/^de$/i.test(pedido[1])) return pedido[1];
  }
  return null;
}

function emitenteDoTexto(texto: string): string | null {
  const rotulado = valorDoRotulo(texto, 'Fornecedor|Emitente|Raz[aã]o\\s+Social', (valor) => {
    const nome = valor.replace(/\s*CNPJ.*$/i, '').trim();
    return nome.length >= 2 && nome.length <= 160 && !pareceRotulo(nome) && !/\bCNPJ\b/i.test(nome);
  });
  if (rotulado) {
    const nome = rotulado.replace(/\s*CNPJ.*$/i, '').trim();
    if (nome.length >= 2 && nome.length <= 160) return nome;
  }
  const recebidos = texto.match(/RECEBEMOS\s+DE\s+(.+?)\s+OS\s+PRODUTOS/i);
  if (recebidos) {
    const nome = recebidos[1].replace(/\s+/g, ' ').trim();
    if (nome.length >= 2 && nome.length <= 160) return nome;
  }
  for (const bruta of texto.split('\n')) {
    const danfe = bruta.trim().match(/^(.+?)\s+DANFE$/i);
    if (!danfe) continue;
    const nome = danfe[1].replace(/\s+/g, ' ').trim();
    if (nome.length >= 2 && nome.length <= 160 && !pareceRotulo(nome)) return nome;
  }
  return null;
}

function primeiraData(texto: string): string | null {
  const datas = texto.matchAll(/\b(\d{2})\/(\d{2})\/(\d{4})\b/g);
  for (const data of datas) {
    const dia = Number(data[1]);
    const mes = Number(data[2]);
    const ano = Number(data[3]);
    if (mes >= 1 && mes <= 12 && dia >= 1 && dia <= 31 && ano >= 2000 && ano <= 2100) {
      return `${data[3]}-${data[2]}-${data[1]}`;
    }
  }
  return null;
}

function totalDoTexto(texto: string): number | null {
  const encontrados = [
    ...texto.matchAll(
      /(?:Valor\s+total(?:\s+da\s+nota)?|Total\s+da\s+nota|Total\s+geral|Total)\s*[:\-]?\s*R?\$?\s*(\d{1,3}(?:\.\d{3})*,\d{2}|\d+[.,]\d{2})/gi,
    ),
  ];
  if (encontrados.length === 0) return null;
  return numeroBrasileiro(encontrados[encontrados.length - 1][1]);
}

function itensDoTexto(texto: string): ItemLido[] {
  const linhas = texto.split('\n').map((linha) => linha.trim());
  const itens: ItemLido[] = [];
  for (let indice = 0; indice < linhas.length; indice += 1) {
    const linha = linhas[indice];
    if (!linha || linha.length < 3) continue;
    const porBarra = itemPorBarra(linha);
    const porColunas = porBarra ? null : itemPorColunas(linha);
    const danfe = porBarra || porColunas ? null : itemDanfe(linha);
    const item = porBarra ?? porColunas ?? danfe;
    if (!item) continue;
    if (danfe) {
      const extra = continuacaoDeDescricao(linhas[indice + 1] ?? '');
      if (extra) {
        item.descricao = `${item.descricao} ${extra}`.replace(/\s+/g, ' ').trim();
        indice += 1;
      }
      if (item.descricao.length < 2) continue;
    }
    itens.push(item);
  }
  return itens;
}

function itemDanfe(linha: string): ItemLido | null {
  const match = linha.match(
    /^(\d{2})\s+(\d{4})\s+(KG|METRO|METROS|M|MT|UN|PC|PÇ|PEÇA|PECA)\s+(\d{1,3}(?:\.\d{3})+,\d+|\d+,\d+)\s+(\d{1,3}(?:\.\d{3})+,\d+|\d+,\d+)\s+(\d{1,3}(?:\.\d{3})+,\d{2}|\d+,\d{2})\b(.*)$/i,
  );
  if (!match) return null;
  const quantidade = numeroBrasileiro(match[4]);
  const valor = numeroBrasileiro(match[5]);
  const total = numeroBrasileiro(match[6]);
  if (quantidade == null || quantidade <= 0) return null;
  const descricao = descricaoAposNumeros(match[7]);
  if (!descricao) return null;
  return {
    descricao,
    quantidade,
    unidade: unidadeCanonico(match[3]),
    valor_unitario: valor,
    total: total ?? (valor != null ? Math.round(quantidade * valor * 100) / 100 : null),
  };
}

function descricaoAposNumeros(resto: string): string {
  const texto = resto.match(/[A-Za-zÀ-ÿ].*$/)?.[0] ?? '';
  return texto.replace(/\s+/g, ' ').trim();
}

function continuacaoDeDescricao(linha: string): string | null {
  if (!linha || linha.length < 3 || itemDanfe(linha) || itemPorColunas(linha)) return null;
  if (/^(?:resolu|nr\s+fci|dados\s+adicionais|informa|consulta|pedido\s+-|cliente\s+-)/i.test(linha)) {
    return null;
  }
  if (/^[0-9A-Z][0-9A-Z./-]{4,}$/.test(linha)) return null;
  if (/c\.i\s+\d/i.test(linha)) return null;
  if (!/[A-Za-zÀ-ÿ]{3,}/.test(linha)) return null;
  return linha.replace(/\s+/g, ' ').trim();
}

function itemPorBarra(linha: string): ItemLido | null {
  if (!linha.includes('|')) return null;
  const partes = linha.split('|').map((parte) => parte.trim()).filter(Boolean);
  if (partes.length < 3) return null;
  const descricao = partes[0].replace(/^item\s*[:\-]\s*/i, '').trim();
  const quantidade = numeroBrasileiro(partes[1]);
  const unidade = UNIDADES.test(partes[2]) ? unidadeCanonico(partes[2]) : null;
  const valor = partes[3] ? numeroBrasileiro(partes[3]) : null;
  const totalInformado = partes[4] ? numeroBrasileiro(partes[4]) : null;
  if (!descricao || quantidade == null) return null;
  return {
    descricao,
    quantidade,
    unidade,
    valor_unitario: valor,
    total: totalInformado ?? (valor != null ? Math.round(quantidade * valor * 100) / 100 : null),
  };
}

function itemPorColunas(linha: string): ItemLido | null {
  const match = linha.match(
    /^(.+?)\s+(\d+(?:[.,]\d+)?)\s+(KG|METRO|METROS|M|MT|UN|PC|PÇ|PEÇA|PECA)\s+(\d{1,3}(?:\.\d{3})*,\d{2}|\d+[.,]\d{2})(?:\s+(\d{1,3}(?:\.\d{3})*,\d{2}|\d+[.,]\d{2}))?$/i,
  );
  if (!match) return null;
  const descricao = match[1].replace(/^\d+\s+/, '').trim();
  if (descricao.length < 2 || /^(descri[cç][aã]o|quantidade|valor|item)$/i.test(descricao)) return null;
  const quantidade = numeroBrasileiro(match[2]);
  const valor = numeroBrasileiro(match[4]);
  const total = match[5] ? numeroBrasileiro(match[5]) : valor != null && quantidade != null
    ? Math.round(quantidade * valor * 100) / 100
    : null;
  return {
    descricao,
    quantidade,
    unidade: unidadeCanonico(match[3]),
    valor_unitario: valor,
    total,
  };
}
