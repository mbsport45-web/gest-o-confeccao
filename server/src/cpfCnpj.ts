export function apenasDigitos(valor: string): string {
  return valor.replace(/\D/g, '');
}

function todosIguais(digitos: string): boolean {
  return /^(\d)\1+$/.test(digitos);
}

export function cpfValido(digitos: string): boolean {
  if (digitos.length !== 11 || todosIguais(digitos)) return false;

  let soma = 0;
  for (let i = 0; i < 9; i += 1) soma += Number(digitos[i]) * (10 - i);
  let resto = (soma * 10) % 11;
  if (resto === 10) resto = 0;
  if (resto !== Number(digitos[9])) return false;

  soma = 0;
  for (let i = 0; i < 10; i += 1) soma += Number(digitos[i]) * (11 - i);
  resto = (soma * 10) % 11;
  if (resto === 10) resto = 0;
  return resto === Number(digitos[10]);
}

export function cnpjValido(digitos: string): boolean {
  if (digitos.length !== 14 || todosIguais(digitos)) return false;

  const pesos1 = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
  const pesos2 = [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];

  const dv = (pesos: number[]) => {
    const soma = pesos.reduce((acc, peso, i) => acc + Number(digitos[i]) * peso, 0);
    const resto = soma % 11;
    return resto < 2 ? 0 : 11 - resto;
  };

  return dv(pesos1) === Number(digitos[12]) && dv(pesos2) === Number(digitos[13]);
}

export function cpfCnpjValido(valor: string): boolean {
  const digitos = apenasDigitos(valor);
  if (digitos.length === 11) return cpfValido(digitos);
  if (digitos.length === 14) return cnpjValido(digitos);
  return false;
}
