/** CPF válido só para o sandbox Asaas — único por empresa, sem dados reais. */
function digito(nums: number[]): number {
  const soma = nums.reduce((acc, n, i) => acc + n * (nums.length + 1 - i), 0);
  const resto = (soma * 10) % 11;
  return resto === 10 ? 0 : resto;
}

export function cpfSandboxDaEmpresa(empresaId: number): string {
  const id = Number.isInteger(empresaId) && empresaId > 0 ? empresaId : 1;
  const base = String(100000000 + (id % 89999999)).padStart(9, '0').slice(-9);
  const digits = base.split('').map((d) => Number(d));
  const d1 = digito(digits);
  const d2 = digito([...digits, d1]);
  return [...digits, d1, d2].join('');
}

export function referenciaClienteEmpresa(empresaId: number): string {
  return `empresa:${empresaId}`;
}

export function referenciaAssinaturaEmpresa(empresaId: number, plano: string): string {
  return `assinatura:${empresaId}:${plano}`;
}

export function empresaIdDaReferencia(referencia: string | null | undefined): number | null {
  if (!referencia) return null;
  const cliente = /^empresa:(\d+)$/.exec(referencia);
  if (cliente) return Number(cliente[1]);
  const assinatura = /^assinatura:(\d+):/.exec(referencia);
  if (assinatura) return Number(assinatura[1]);
  return null;
}
