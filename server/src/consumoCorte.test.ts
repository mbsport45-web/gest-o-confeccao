import { describe, expect, it } from 'vitest';
import {
  calcularConsumoCorte,
  camadasAutomaticasPorCor,
  consumoParaBaixa,
  consumoTotalPorCor,
  dadosFaltantesConsumo,
  extrairDadosTecidoTexto,
  larguraParaCm,
  mensagemDadosFaltantes,
  numeroDoTexto,
} from './consumoCorte.js';

describe('cálculo de consumo do corte', () => {
  it('lê 1,60 e 1.60 como 1.6 e converte metros para cm só no cálculo', () => {
    expect(numeroDoTexto('1,60')).toBe(1.6);
    expect(numeroDoTexto('1.60')).toBe(1.6);
    expect(larguraParaCm(1.6, 'm')).toBe(160);
    expect(larguraParaCm(160, 'cm')).toBe(160);
  });

  it('calcula KG com largura em cm convertida para metros e aplica perda percentual', () => {
    const calc = calcularConsumoCorte({
      unidade: 'KG',
      metragemRisco: 2,
      larguraCm: 160,
      gramatura: 180,
      camadas: 10,
      perdaPercentual: 5,
    });
    expect(calc.ok).toBe(true);
    if (!calc.ok) return;
    expect(calc.unidadeControle).toBe('peso');
    expect(calc.consumoCalculado).toBeCloseTo(5.76);
    expect(calc.consumoComPerda).toBeCloseTo(6.048);
    expect(consumoParaBaixa(calc, 6.1)).toBeCloseTo(6.1);
    expect(consumoParaBaixa(calc)).toBeCloseTo(6.048);
  });

  it('recalcula KG com outra largura, gramatura, camadas e perda', () => {
    const calc = calcularConsumoCorte({
      unidade: 'KG',
      metragemRisco: 3,
      larguraCm: 180,
      gramatura: 200,
      camadas: 8,
      perdaPercentual: 10,
    });
    expect(calc.ok).toBe(true);
    if (!calc.ok) return;
    expect(calc.consumoCalculado).toBeCloseTo(8.64);
    expect(calc.consumoComPerda).toBeCloseTo(9.504);
  });

  it('calcula metros com metragem e camadas e aplica a perda', () => {
    const calc = calcularConsumoCorte({
      unidade: 'MT',
      metragemRisco: 4.5,
      camadas: 6,
      perdaPercentual: 5,
    });
    expect(calc.ok).toBe(true);
    if (!calc.ok) return;
    expect(calc.unidadeControle).toBe('metro');
    expect(calc.consumoCalculado).toBeCloseTo(27);
    expect(calc.consumoComPerda).toBeCloseTo(28.35);
  });

  it('calcula metros com outra metragem, camadas e perda', () => {
    const calc = calcularConsumoCorte({
      unidade: 'MT',
      metragemRisco: 2,
      camadas: 10,
      perdaPercentual: 3,
    });
    expect(calc.ok).toBe(true);
    if (!calc.ok) return;
    expect(calc.consumoCalculado).toBeCloseTo(20);
    expect(calc.consumoComPerda).toBeCloseTo(20.6);
  });

  it('pede largura e gramatura só para tecido em KG e informa o dado que falta', () => {
    const semLargura = calcularConsumoCorte({
      unidade: 'KG',
      metragemRisco: 2,
      camadas: 4,
      gramatura: 180,
    });
    const semGramatura = calcularConsumoCorte({
      unidade: 'KG',
      metragemRisco: 2,
      camadas: 4,
      larguraCm: 160,
    });
    expect(semLargura.ok).toBe(false);
    expect(semGramatura.ok).toBe(false);
    if (!semLargura.ok) expect(semLargura.erro).toBe('Falta largura no cadastro do tecido');
    if (!semGramatura.ok) expect(semGramatura.erro).toBe('Falta gramatura no cadastro do tecido');
    expect(mensagemDadosFaltantes(dadosFaltantesConsumo('KG'))).toBe(
      'Falta largura e gramatura no cadastro do tecido',
    );
    expect(calcularConsumoCorte({ unidade: 'MT', metragemRisco: 2, camadas: 4 }).ok).toBe(true);
  });

  it('calcula camadas pela menor quantidade positiva da cor e o consumo por folha', () => {
    expect(camadasAutomaticasPorCor([10, 20, 20, 10])).toBe(10);
    expect(camadasAutomaticasPorCor([0, 20, 8, 15])).toBe(8);
    expect(camadasAutomaticasPorCor([0, 0, 0])).toBe(0);
    expect(consumoTotalPorCor(10, 1.2)).toBe(12);
    expect(consumoTotalPorCor(10, 1.25)).toBe(12.5);
    expect(consumoTotalPorCor(0, 1.2)).toBe(0);
  });

  it('extrai a composição completa com vírgula entre as fibras', () => {
    expect(
      extrairDadosTecidoTexto('Malha 48% algodão, 52% poliéster largura 160 cm').composicao,
    ).toBe('48% algodão e 52% poliéster');
  });
});
