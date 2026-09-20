export const ASAAS_PROVEDOR = 'asaas' as const;
export const ASAAS_AMBIENTE = 'sandbox' as const;
export const ASAAS_SANDBOX_HOST = 'api-sandbox.asaas.com';
export const ASAAS_SANDBOX_BASE_PADRAO = `https://${ASAAS_SANDBOX_HOST}/v3`;
export const ASAAS_WEBHOOK_HEADER = 'asaas-access-token';

/** Nomes oficiais primeiro. Os aliases cobrem typos já injetados no Cloud Agent. */
export const NOMES_ASAAS_API_KEY = ['ASAAS_API_KEY', 'ASAAS_APi_KEY'] as const;
export const NOMES_ASAAS_BASE_URL = ['ASAAS_BASE_URL', 'ASSAS_BASE_URL'] as const;

const HOSTS_PRODUCAO = new Set(['api.asaas.com', 'www.asaas.com', 'asaas.com']);

export class ConfiguracaoAsaasInvalida extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ConfiguracaoAsaasInvalida';
  }
}

export type ConfiguracaoAsaas = {
  baseUrl: string;
  apiKey: string;
  webhookToken: string;
  provedor: typeof ASAAS_PROVEDOR;
  ambiente: typeof ASAAS_AMBIENTE;
};

function hostnameDe(url: string): string {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    throw new ConfiguracaoAsaasInvalida('ASAAS_BASE_URL inválida');
  }
}

export function ehHostProducaoAsaas(host: string): boolean {
  return HOSTS_PRODUCAO.has(host.toLowerCase());
}

export function normalizarBaseUrlAsaas(valor: string | undefined): string {
  const bruto = (valor || ASAAS_SANDBOX_BASE_PADRAO).trim().replace(/\/+$/, '');
  if (!bruto) return ASAAS_SANDBOX_BASE_PADRAO;
  let url: URL;
  try {
    url = new URL(bruto.includes('://') ? bruto : `https://${bruto}`);
  } catch {
    throw new ConfiguracaoAsaasInvalida('ASAAS_BASE_URL inválida');
  }
  if (url.protocol !== 'https:') {
    throw new ConfiguracaoAsaasInvalida('ASAAS_BASE_URL deve usar HTTPS no sandbox');
  }
  const host = url.hostname.toLowerCase();
  if (ehHostProducaoAsaas(host)) {
    throw new ConfiguracaoAsaasInvalida(
      'ASAAS_BASE_URL aponta para produção. Esta integração aceita somente o sandbox (api-sandbox.asaas.com).',
    );
  }
  if (host !== ASAAS_SANDBOX_HOST) {
    throw new ConfiguracaoAsaasInvalida(
      `ASAAS_BASE_URL deve ser https://${ASAAS_SANDBOX_HOST}/v3 (sandbox). Host recebido: ${host}`,
    );
  }
  const caminho = url.pathname.replace(/\/+$/, '') || '/v3';
  const comVersao = caminho === '' || caminho === '/' ? '/v3' : caminho.startsWith('/v3') ? caminho : `/v3${caminho}`;
  return `https://${ASAAS_SANDBOX_HOST}${comVersao === '/v3' ? '/v3' : comVersao}`;
}

export function recusarUrlProducao(url: string): void {
  const host = hostnameDe(url);
  if (ehHostProducaoAsaas(host) || host.includes('api.asaas.com')) {
    throw new ConfiguracaoAsaasInvalida('Chamada à API de produção do Asaas é bloqueada');
  }
  if (host !== ASAAS_SANDBOX_HOST) {
    throw new ConfiguracaoAsaasInvalida(`Somente ${ASAAS_SANDBOX_HOST} é permitido`);
  }
}

export function primeiroEnv(
  env: NodeJS.ProcessEnv,
  nomes: readonly string[],
): { nome: string; valor: string } | null {
  for (const nome of nomes) {
    const valor = env[nome]?.trim() ?? '';
    if (valor) return { nome, valor };
  }
  return null;
}

export type StatusConfigAsaas = {
  ambiente: typeof ASAAS_AMBIENTE;
  cobranca_real: false;
  configurado: boolean;
  host: typeof ASAAS_SANDBOX_HOST;
  base_url: string;
  api_key_configurada: boolean;
  origem_api_key: string | null;
  origem_base_url: string;
};

export function statusConfiguracaoAsaas(env: NodeJS.ProcessEnv = process.env): StatusConfigAsaas {
  const chave = primeiroEnv(env, NOMES_ASAAS_API_KEY);
  const base = primeiroEnv(env, NOMES_ASAAS_BASE_URL);
  let baseUrl = ASAAS_SANDBOX_BASE_PADRAO;
  let origemBase = base?.nome ?? 'padrao';
  try {
    baseUrl = normalizarBaseUrlAsaas(base?.valor);
  } catch {
    origemBase = base?.nome ? `${base.nome}_invalida` : 'invalida';
  }
  return {
    ambiente: ASAAS_AMBIENTE,
    cobranca_real: false,
    configurado: Boolean(chave),
    host: ASAAS_SANDBOX_HOST,
    base_url: baseUrl,
    api_key_configurada: Boolean(chave),
    origem_api_key: chave?.nome ?? null,
    origem_base_url: origemBase,
  };
}

export function lerConfiguracaoAsaas(
  env: NodeJS.ProcessEnv = process.env,
): ConfiguracaoAsaas | null {
  const chave = primeiroEnv(env, NOMES_ASAAS_API_KEY);
  const base = primeiroEnv(env, NOMES_ASAAS_BASE_URL);
  const webhookToken = env.ASAAS_WEBHOOK_TOKEN?.trim() ?? '';
  const apiKey = chave?.valor ?? '';
  const baseUrl = normalizarBaseUrlAsaas(base?.valor);
  if (!apiKey) return null;
  if (webhookToken && webhookToken === apiKey) {
    throw new ConfiguracaoAsaasInvalida(
      'ASAAS_WEBHOOK_TOKEN não pode ser a API Key do Asaas. Use um authToken exclusivo do webhook.',
    );
  }
  return {
    baseUrl,
    apiKey,
    webhookToken,
    provedor: ASAAS_PROVEDOR,
    ambiente: ASAAS_AMBIENTE,
  };
}

export function exigirConfiguracaoAsaas(env: NodeJS.ProcessEnv = process.env): ConfiguracaoAsaas {
  const cfg = lerConfiguracaoAsaas(env);
  if (!cfg) {
    throw new ConfiguracaoAsaasInvalida('ASAAS_API_KEY não configurada (sandbox)');
  }
  return cfg;
}
