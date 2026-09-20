export const ASAAS_PROVEDOR = 'asaas' as const;
export const ASAAS_AMBIENTE = 'sandbox' as const;
export const ASAAS_SANDBOX_HOST = 'api-sandbox.asaas.com';
export const ASAAS_SANDBOX_BASE_PADRAO = `https://${ASAAS_SANDBOX_HOST}/v3`;
export const ASAAS_WEBHOOK_HEADER = 'asaas-access-token';

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

export function lerConfiguracaoAsaas(
  env: NodeJS.ProcessEnv = process.env,
): ConfiguracaoAsaas | null {
  const apiKey = env.ASAAS_API_KEY?.trim() ?? '';
  const webhookToken = env.ASAAS_WEBHOOK_TOKEN?.trim() ?? '';
  const baseUrl = normalizarBaseUrlAsaas(env.ASAAS_BASE_URL);
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
