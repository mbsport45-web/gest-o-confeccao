import type { RequestHandler } from 'express';

export const PAPEIS = [
  'proprietario',
  'administrador',
  'financeiro',
  'vendas',
  'estoque',
  'producao',
] as const;
export type Papel = (typeof PAPEIS)[number];

export const PAPEIS_CONVITE = [
  'administrador',
  'financeiro',
  'vendas',
  'estoque',
  'producao',
] as const;
export type PapelConvite = (typeof PAPEIS_CONVITE)[number];

export const MODULOS = [
  'equipe',
  'clientes',
  'produtos',
  'materiais',
  'estoque',
  'pedidos',
  'expedicao',
  'ordens',
  'etapas',
  'fornecedores',
  'compras',
  'financeiro',
  'relatorios',
  'assinatura',
] as const;
export type Modulo = (typeof MODULOS)[number];

export const ACOES = ['visualizar', 'criar', 'editar', 'excluir'] as const;
export type Acao = (typeof ACOES)[number];

export type AcoesModulo = Record<Acao, boolean>;
export type MatrizModulos = Record<Modulo, AcoesModulo>;

export const PAPEL_LABEL: Record<Papel, string> = {
  proprietario: 'Proprietário',
  administrador: 'Administrador',
  financeiro: 'Financeiro',
  vendas: 'Vendas',
  estoque: 'Estoque',
  producao: 'Produção',
};

export const MODULO_LABEL: Record<Modulo, string> = {
  equipe: 'a equipe',
  clientes: 'clientes',
  produtos: 'produtos',
  materiais: 'materiais',
  estoque: 'estoque',
  pedidos: 'pedidos',
  expedicao: 'expedição',
  ordens: 'ordens de produção',
  etapas: 'etapas de produção',
  fornecedores: 'fornecedores',
  compras: 'compras',
  financeiro: 'o financeiro',
  relatorios: 'relatórios',
  assinatura: 'o plano da empresa',
};

export const ACAO_LABEL: Record<Acao, string> = {
  visualizar: 'visualizar',
  criar: 'criar',
  editar: 'editar',
  excluir: 'excluir',
};

const CRUD: AcoesModulo = { visualizar: true, criar: true, editar: true, excluir: true };
const LER: AcoesModulo = { visualizar: true, criar: false, editar: false, excluir: false };
const NADA: AcoesModulo = { visualizar: false, criar: false, editar: false, excluir: false };

export const PREFIXOS_MODULO: Array<{ prefixo: string; modulo: Modulo }> = [
  { prefixo: '/api/membros', modulo: 'equipe' },
  { prefixo: '/api/convites', modulo: 'equipe' },
  { prefixo: '/api/clientes', modulo: 'clientes' },
  { prefixo: '/api/estampas', modulo: 'clientes' },
  { prefixo: '/api/produtos', modulo: 'produtos' },
  { prefixo: '/api/materias-primas', modulo: 'materiais' },
  { prefixo: '/api/aviamentos', modulo: 'materiais' },
  { prefixo: '/api/estoque', modulo: 'estoque' },
  { prefixo: '/api/pedidos', modulo: 'pedidos' },
  { prefixo: '/api/expedicao', modulo: 'expedicao' },
  { prefixo: '/api/ordens', modulo: 'ordens' },
  { prefixo: '/api/etapas', modulo: 'etapas' },
  { prefixo: '/api/fornecedores', modulo: 'fornecedores' },
  { prefixo: '/api/compras', modulo: 'compras' },
  { prefixo: '/api/financeiro', modulo: 'financeiro' },
  { prefixo: '/api/relatorios', modulo: 'relatorios' },
  { prefixo: '/api/planos', modulo: 'assinatura' },
  { prefixo: '/api/assinatura', modulo: 'assinatura' },
];

function vazio(): MatrizModulos {
  return Object.fromEntries(MODULOS.map((m) => [m, { ...NADA }])) as MatrizModulos;
}

function marcar(base: MatrizModulos, modulos: readonly Modulo[], acoes: AcoesModulo) {
  for (const modulo of modulos) base[modulo] = { ...acoes };
  return base;
}

function matrizTotal(): MatrizModulos {
  return marcar(vazio(), MODULOS, CRUD);
}

export const PERMISSOES: Record<Papel, MatrizModulos> = {
  proprietario: matrizTotal(),
  administrador: matrizTotal(),
  financeiro: marcar(marcar(vazio(), ['financeiro'], CRUD), [
    'relatorios',
    'compras',
    'fornecedores',
    'pedidos',
    'clientes',
    'assinatura',
  ], LER),
  vendas: marcar(marcar(vazio(), ['clientes', 'produtos', 'pedidos', 'expedicao'], CRUD), [
    'relatorios',
    'assinatura',
  ], LER),
  estoque: marcar(marcar(vazio(), ['materiais', 'estoque', 'compras', 'fornecedores'], CRUD), [
    'produtos',
    'assinatura',
  ], LER),
  producao: marcar(marcar(vazio(), ['ordens', 'etapas'], CRUD), [
    'produtos',
    'materiais',
    'estoque',
    'clientes',
    'assinatura',
  ], LER),
};

const PAPEIS_ANTIGOS: Record<string, Papel> = {
  dono: 'proprietario',
  admin: 'administrador',
  operador: 'producao',
  consulta: 'vendas',
};

export function migrarPapel(valor: unknown): Papel | null {
  if (typeof valor !== 'string') return null;
  if (isPapel(valor)) return valor;
  return PAPEIS_ANTIGOS[valor] ?? null;
}

export function isPapel(valor: unknown): valor is Papel {
  return typeof valor === 'string' && (PAPEIS as readonly string[]).includes(valor);
}

export function isPapelConvite(valor: unknown): valor is PapelConvite {
  return typeof valor === 'string' && (PAPEIS_CONVITE as readonly string[]).includes(valor);
}

export function temPermissao(papel: string | undefined, modulo: Modulo, acao: Acao): boolean {
  if (!papel || !isPapel(papel)) return false;
  return PERMISSOES[papel][modulo][acao];
}

export function podeEscrever(papel?: string): boolean {
  if (!papel || !isPapel(papel)) return false;
  return Object.values(PERMISSOES[papel]).some((acoes) => acoes.criar || acoes.editar || acoes.excluir);
}

export function podeGerenciarEquipe(papel?: string): boolean {
  return temPermissao(papel, 'equipe', 'visualizar');
}

export function permissoesDoPapel(papel: Papel) {
  const modulos = PERMISSOES[papel];
  return {
    escrever: podeEscrever(papel),
    equipe: podeGerenciarEquipe(papel),
    modulos,
  };
}

export function caminhoDaRequisicao(req: { originalUrl?: string; url?: string; baseUrl?: string; path?: string }) {
  const bruto = req.originalUrl || `${req.baseUrl ?? ''}${req.path ?? req.url ?? ''}`;
  return bruto.split('?')[0];
}

export function moduloDaRota(caminho: string): Modulo | null {
  const encontrado = PREFIXOS_MODULO.find(
    (item) => caminho === item.prefixo || caminho.startsWith(`${item.prefixo}/`),
  );
  return encontrado?.modulo ?? null;
}

export function acaoDoPedido(method: string, caminho: string): Acao {
  const verbo = method.toUpperCase();
  if (verbo === 'GET' || verbo === 'HEAD' || verbo === 'OPTIONS') return 'visualizar';
  if (verbo === 'DELETE') return 'excluir';
  if (verbo === 'PATCH' || verbo === 'PUT') return 'editar';
  if (verbo === 'POST') {
    const prefixo = PREFIXOS_MODULO.find(
      (item) => caminho === item.prefixo || caminho.startsWith(`${item.prefixo}/`),
    )?.prefixo;
    const resto = prefixo ? caminho.slice(prefixo.length).replace(/^\//, '') : '';
    const primeiro = resto.split('/').filter(Boolean)[0];
    if (primeiro && /^\d+$/.test(primeiro)) return 'editar';
    return 'criar';
  }
  return 'editar';
}

export function exigirPermissaoModulo(): RequestHandler {
  return (req, res, next) => {
    const caminho = caminhoDaRequisicao(req);
    const modulo = moduloDaRota(caminho);
    if (!modulo) {
      return res.status(403).json({ erro: 'Sem permissão para este recurso' });
    }
    const acao = acaoDoPedido(req.method, caminho);
    if (temPermissao(req.usuario?.papel, modulo, acao)) return next();
    return res.status(403).json({
      erro: `Sem permissão para ${ACAO_LABEL[acao]} ${MODULO_LABEL[modulo]}`,
      modulo,
      acao,
    });
  };
}

export function requireGerenciarEquipe(): RequestHandler {
  return (req, res, next) => {
    if (podeGerenciarEquipe(req.usuario?.papel)) return next();
    return res.status(403).json({ erro: 'Sem permissão para gerenciar a equipe' });
  };
}
