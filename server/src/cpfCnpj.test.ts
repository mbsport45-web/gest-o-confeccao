import { describe, expect, it } from 'vitest';
import { cnpjValido, cpfCnpjValido, cpfValido } from './cpfCnpj.js';

describe('validação de CPF/CNPJ', () => {
  it('aceita CPF e CNPJ válidos', () => {
    expect(cpfValido('52998224725')).toBe(true);
    expect(cnpjValido('11444777000161')).toBe(true);
    expect(cpfCnpjValido('529.982.247-25')).toBe(true);
    expect(cpfCnpjValido('11.444.777/0001-61')).toBe(true);
  });

  it('rejeita documentos inválidos', () => {
    expect(cpfValido('11111111111')).toBe(false);
    expect(cpfValido('12345678901')).toBe(false);
    expect(cnpjValido('00000000000000')).toBe(false);
    expect(cpfCnpjValido('123')).toBe(false);
  });
});
