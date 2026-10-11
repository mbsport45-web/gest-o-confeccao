import type { DocumentoProcessado } from './api';

export type TipoPessoaForm = '' | 'juridica' | 'fisica';

export type FormFornecedorImportacao = {
  tipo_pessoa: TipoPessoaForm;
  nome: string;
  nome_fantasia: string;
  cpf_cnpj: string;
  inscricao_estadual: string;
  telefone: string;
  whatsapp: string;
  email: string;
  cep: string;
  endereco: string;
  numero: string;
  complemento: string;
  bairro: string;
  cidade: string;
  estado: string;
  observacoes: string;
};

export type PayloadFornecedorImportacao = {
  tipo_pessoa: 'juridica' | 'fisica';
  nome: string;
  nome_fantasia?: string;
  cpf_cnpj?: string;
  inscricao_estadual?: string;
  telefone?: string;
  whatsapp?: string;
  email?: string;
  cep?: string;
  endereco?: string;
  numero?: string;
  complemento?: string;
  bairro?: string;
  cidade?: string;
  estado?: string;
  observacoes?: string;
};

const VAZIO: FormFornecedorImportacao = {
  tipo_pessoa: '',
  nome: '',
  nome_fantasia: '',
  cpf_cnpj: '',
  inscricao_estadual: '',
  telefone: '',
  whatsapp: '',
  email: '',
  cep: '',
  endereco: '',
  numero: '',
  complemento: '',
  bairro: '',
  cidade: '',
  estado: '',
  observacoes: '',
};

function texto(valor: string | null | undefined): string {
  return valor?.trim() ?? '';
}

export function preencherFormularioSemSobrescrever(
  atual: FormFornecedorImportacao,
  leitura: Parameters<typeof formularioFornecedorDaLeitura>[0],
  editados: ReadonlySet<keyof FormFornecedorImportacao>,
): FormFornecedorImportacao {
  const vindo = formularioFornecedorDaLeitura(leitura);
  const proximo = { ...atual };
  (Object.keys(vindo) as Array<keyof FormFornecedorImportacao>).forEach((campo) => {
    if (editados.has(campo) || atual[campo].trim() || !vindo[campo]) return;
    if (campo === 'tipo_pessoa') proximo.tipo_pessoa = vindo.tipo_pessoa;
    else proximo[campo] = vindo[campo];
  });
  return proximo;
}

export function formularioFornecedorDaLeitura(
  leitura: Pick<
    DocumentoProcessado,
    | 'emitente'
    | 'cnpj'
    | 'cpf'
    | 'tipo_pessoa'
    | 'nome_fantasia'
    | 'inscricao_estadual'
    | 'telefone'
    | 'whatsapp'
    | 'email'
    | 'cep'
    | 'endereco'
    | 'numero_endereco'
    | 'complemento'
    | 'bairro'
    | 'cidade'
    | 'estado'
    | 'observacoes'
  >,
): FormFornecedorImportacao {
  const tipo = leitura.tipo_pessoa === 'juridica' || leitura.tipo_pessoa === 'fisica'
    ? leitura.tipo_pessoa
    : '';
  return {
    ...VAZIO,
    tipo_pessoa: tipo,
    nome: texto(leitura.emitente),
    nome_fantasia: texto(leitura.nome_fantasia),
    cpf_cnpj: texto(leitura.cnpj) || texto(leitura.cpf),
    inscricao_estadual: texto(leitura.inscricao_estadual),
    telefone: texto(leitura.telefone),
    whatsapp: texto(leitura.whatsapp),
    email: texto(leitura.email),
    cep: texto(leitura.cep),
    endereco: texto(leitura.endereco),
    numero: texto(leitura.numero_endereco),
    complemento: texto(leitura.complemento),
    bairro: texto(leitura.bairro),
    cidade: texto(leitura.cidade),
    estado: texto(leitura.estado),
    observacoes: texto(leitura.observacoes),
  };
}

export function dadosParaCadastro(form: FormFornecedorImportacao): PayloadFornecedorImportacao | null {
  if (form.tipo_pessoa !== 'juridica' && form.tipo_pessoa !== 'fisica') return null;
  const nome = form.nome.trim();
  if (!nome) return null;
  const dados: PayloadFornecedorImportacao = { tipo_pessoa: form.tipo_pessoa, nome };
  const opcionais: Partial<Record<Exclude<keyof PayloadFornecedorImportacao, 'tipo_pessoa' | 'nome'>, string>> = {
    nome_fantasia: form.nome_fantasia,
    cpf_cnpj: form.cpf_cnpj,
    telefone: form.telefone,
    whatsapp: form.whatsapp,
    email: form.email,
    cep: form.cep,
    endereco: form.endereco,
    numero: form.numero,
    complemento: form.complemento,
    bairro: form.bairro,
    cidade: form.cidade,
    estado: form.estado,
    observacoes: form.observacoes,
  };
  if (form.tipo_pessoa === 'juridica') opcionais.inscricao_estadual = form.inscricao_estadual;
  for (const campo of Object.keys(opcionais) as Array<keyof typeof opcionais>) {
    const limpo = opcionais[campo]?.trim();
    if (limpo) dados[campo] = limpo;
  }
  return dados;
}
