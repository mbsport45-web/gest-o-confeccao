import { describe, expect, it } from 'vitest';
import { crc16Ccitt, montarPixCopiaECola, valorPixReais } from './pixOficina';

describe('Pix da oficina', () => {
  it('gera CRC-16/CCITT-FALSE e o copia e cola com chave e valor exatos', () => {
    expect(crc16Ccitt('123456789')).toBe('29B1');
    expect(valorPixReais(700)).toBe('700.00');
    expect(valorPixReais(3.5)).toBe('3.50');
    const codigo = montarPixCopiaECola({
      chave: '11988887777',
      valor: 700,
      nome: 'Oficina Norte',
    });
    expect(codigo.startsWith('000201')).toBe(true);
    expect(codigo).toContain('br.gov.bcb.pix');
    expect(codigo).toContain('11988887777');
    expect(codigo).toContain('5406700.00');
    expect(codigo).toMatch(/6304[0-9A-F]{4}$/);
    expect(codigo.endsWith(crc16Ccitt(codigo.slice(0, -4)))).toBe(true);
  });

  it('não monta Pix sem chave ou sem valor', () => {
    expect(() => montarPixCopiaECola({ chave: '  ', valor: 10, nome: 'Oficina' })).toThrow(/chave Pix/i);
    expect(() => montarPixCopiaECola({ chave: 'a@b.com', valor: 0, nome: 'Oficina' })).toThrow(/valor/i);
  });
});
