import { describe, expect, it } from 'vitest';
import {
  adicionarCor,
  adicionarTamanho,
  celulasDaGrade,
  definirQuantidade,
  gradeVazia,
  mensagemGrade,
  removerCor,
  removerTamanho,
  totalCor,
  totalGeral,
  totalTamanho,
} from './gradeOrdem';

describe('grade da ordem de produção', () => {
  it('soma 75 pretas e 75 brancas e exige o total da ordem', () => {
    let grade = gradeVazia(['P', 'M', 'G']);
    grade = adicionarCor(grade, 'Preto');
    grade = adicionarCor(grade, 'preto');
    grade = adicionarCor(grade, 'Branco');
    grade = definirQuantidade(grade, 'Preto', 'P', 25);
    grade = definirQuantidade(grade, 'Preto', 'M', 25);
    grade = definirQuantidade(grade, 'Preto', 'G', 25);
    grade = definirQuantidade(grade, 'Branco', 'P', 20);
    grade = definirQuantidade(grade, 'Branco', 'M', 30);
    grade = definirQuantidade(grade, 'Branco', 'G', 25);

    expect(grade.cores).toEqual(['Preto', 'Branco']);
    expect(totalCor(grade, 'Preto')).toBe(75);
    expect(totalCor(grade, 'Branco')).toBe(75);
    expect(totalTamanho(grade, 'P')).toBe(45);
    expect(totalGeral(grade)).toBe(150);
    expect(mensagemGrade(grade, 150)).toBeNull();
    expect(mensagemGrade(grade, 149)).toBe('A soma da grade (150) difere da quantidade da ordem (149)');
    expect(celulasDaGrade(grade)).toHaveLength(6);
  });

  it('remove cor e tamanho antes de salvar', () => {
    let grade = adicionarTamanho(gradeVazia(['P', 'M']), 'G');
    grade = adicionarCor(adicionarCor(grade, 'Azul'), 'Verde');
    grade = definirQuantidade(grade, 'Azul', 'G', 4);
    grade = removerCor(grade, 'Verde');
    grade = removerTamanho(grade, 'P');
    expect(grade.cores).toEqual(['Azul']);
    expect(grade.tamanhos).toEqual(['M', 'G']);
    expect(totalGeral(grade)).toBe(4);
  });
});