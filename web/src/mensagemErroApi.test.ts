import { describe, expect, it } from 'vitest';
import { mensagemErroApi } from './api';

describe('mensagens de validação da API', () => {
  it('mostra o campo inválido em vez da mensagem genérica', () => {
    expect(
      mensagemErroApi({
        erro: 'Dados inválidos',
        detalhes: { cpf_cnpj: ['CPF/CNPJ inválido'] },
      }),
    ).toBe('CPF/CNPJ inválido');
    expect(mensagemErroApi({ erro: 'CPF/CNPJ já cadastrado' })).toBe('CPF/CNPJ já cadastrado');
    expect(mensagemErroApi({ erro: 'SKU já cadastrado' })).toBe('SKU já cadastrado');
  });
});
