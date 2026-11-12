import { describe, expect, it } from 'vitest';
import {
  calcularConsumoCorte,
  camadasAutomaticasPorCor,
  consumoParaBaixa,
  consumoTotalPorCor,
  dadosFaltantesConsumo,
  dadosTecidoCadastro,
  composicaoMaisCompleta,
  extrairDadosTecidoTexto,
  formatarNumeroDecimal,
  larguraParaCm,
  mensagemDadosFaltantes,
  numeroDoTexto,
} from './consumoCorte';

describe('cálculo de consumo do corte', () => {
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
    expect(calc.consumoCalculado).toBeCloseTo(5.76);
    expect(calc.consumoComPerda).toBeCloseTo(6.048);
    expect(consumoParaBaixa(calc, 6.1)).toBeCloseTo(6.1);
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

  it('calcula KG sem perda quando o percentual é zero', () => {
    const calc = calcularConsumoCorte({
      unidade: 'KG',
      metragemRisco: 1.5,
      larguraCm: 150,
      gramatura: 160,
      camadas: 4,
      perdaPercentual: 0,
    });
    expect(calc.ok).toBe(true);
    if (!calc.ok) return;
    expect(calc.consumoCalculado).toBeCloseTo(1.44);
    expect(calc.consumoComPerda).toBeCloseTo(1.44);
  });

  it('calcula metros com metragem e camadas', () => {
    const calc = calcularConsumoCorte({
      unidade: 'MT',
      metragemRisco: 4.5,
      camadas: 6,
      perdaPercentual: 5,
    });
    expect(calc.ok).toBe(true);
    if (!calc.ok) return;
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

  it('informa largura, gramatura ou os dois quando faltam no cadastro em KG', () => {
    expect(mensagemDadosFaltantes(dadosFaltantesConsumo('KG', null, 180))).toBe(
      'Falta largura no cadastro do tecido',
    );
    expect(mensagemDadosFaltantes(dadosFaltantesConsumo('KG', 160, null))).toBe(
      'Falta gramatura no cadastro do tecido',
    );
    const ambos = calcularConsumoCorte({ unidade: 'KG', metragemRisco: 2, camadas: 4 });
    expect(ambos).toEqual({
      ok: false,
      erro: 'Falta largura e gramatura no cadastro do tecido',
    });
    expect(calcularConsumoCorte({ unidade: 'MT', metragemRisco: 2, camadas: 4 }).ok).toBe(true);
  });

  it('aceita largura 1,60 e 1.60 sem arredondar para 1', () => {
    expect(numeroDoTexto('1,60')).toBe(1.6);
    expect(numeroDoTexto('1.60')).toBe(1.6);
    expect(numeroDoTexto('1,')).toBeNull();
    expect(numeroDoTexto('180,5')).toBe(180.5);
    expect(formatarNumeroDecimal(1.6, 'm')).toBe('1,60');
    expect(formatarNumeroDecimal(160, 'cm')).toBe('160');
    expect(larguraParaCm(1.6, 'm')).toBe(160);
    expect(larguraParaCm(160, 'cm')).toBe(160);
  });

  it('extrai largura, gramatura e composição de texto de nota fiscal', () => {
    const extraido = extrairDadosTecidoTexto(
      'Malha PV largura 160 cm gramatura 180 g/m² 67% poliéster 33% viscose KG',
    );
    expect(extraido.larguraCm).toBe(160);
    expect(extraido.gramatura).toBe(180);
    expect(extraido.composicao).toBe('67% poliéster e 33% viscose');
    expect(extraido.unidade).toBe('KG');
  });

  it('não corta a composição na vírgula e junta as fibras', () => {
    const extraido = extrairDadosTecidoTexto(
      'Tecido 48% algodão, 52% poliéster largura 160 cm gramatura 180 g/m²',
    );
    expect(extraido.composicao).toBe('48% algodão e 52% poliéster');
    expect(
      composicaoMaisCompleta('48% algodão', extraido.composicao, 'Tecido 48% algodão, 52% poliéster'),
    ).toBe('48% algodão e 52% poliéster');
  });

  it('calcula camadas pela menor quantidade positiva da cor e o consumo por folha', () => {
    expect(camadasAutomaticasPorCor([10, 20, 20, 10])).toBe(10);
    expect(camadasAutomaticasPorCor([0, 20, 8, 15])).toBe(8);
    expect(camadasAutomaticasPorCor([0, 0])).toBe(0);
    expect(consumoTotalPorCor(10, 1.2)).toBe(12);
    expect(consumoTotalPorCor(10, 1.25)).toBe(12.5);
  });

  it('lê nome, largura, gramatura, unidade, composição e cor do cadastro original', () => {
    expect(
      dadosTecidoCadastro({
        id: 9,
        nome: 'Malha PV',
        largura_cm: 160,
        gramatura: 180,
        unidade: 'kg',
        composicao: '67% poliéster 33% viscose',
        cor: 'Preto',
      }),
    ).toEqual({
      id: 9,
      nome: 'Malha PV',
      larguraCm: 160,
      gramatura: 180,
      unidade: 'KG',
      unidadeControle: 'peso',
      composicao: '67% poliéster 33% viscose',
      cor: 'Preto',
    });
  });
});
