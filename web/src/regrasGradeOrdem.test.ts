import { describe, expect, it } from 'vitest';
import {
  adicionarCor,
  adicionarTamanho,
  celulasDaGrade,
  definirQuantidade,
  gradeAoTrocarProduto,
  gradeDaOrdem,
  gradeVazia,
  mensagemGrade,
  moverTamanho,
  removerCor,
  removerTamanho,
  renomearCor,
  renomearTamanho,
  tamanhosDaCor,
  tamanhosEfetivos,
  totalCor,
  totalGeral,
  totalTamanho,
} from './regrasGradeOrdem';

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

  it('renomeia cor e tamanho e reorganiza as colunas sem perder quantidades', () => {
    let grade = adicionarCor(gradeVazia(['P', 'M']), 'Verde musgo');
    grade = definirQuantidade(grade, 'Verde musgo', 'M', 8);
    grade = renomearCor(grade, 'Verde musgo', 'Oliva');
    grade = renomearTamanho(grade, 'M', '42');
    grade = moverTamanho(grade, '42', -1);
    expect(grade.cores).toEqual(['Oliva']);
    expect(grade.tamanhos).toEqual(['42', 'P']);
    expect(totalCor(grade, 'Oliva')).toBe(8);
    expect(renomearCor(grade, 'Oliva', 'oliva').cores).toEqual(['oliva']);
    const repetida = adicionarCor(grade, 'Areia');
    expect(renomearCor(repetida, 'Areia', 'Oliva')).toBe(repetida);
  });

  it('mostra só os tamanhos com quantidade na cor da ficha', () => {
    const grade = gradeDaOrdem(
      [
        { cor: 'Preto', tamanho: 'P', quantidade: 0 },
        { cor: 'Preto', tamanho: 'M', quantidade: 3 },
        { cor: 'Preto', tamanho: 'G', quantidade: 1 },
        { cor: 'Preto', tamanho: 'GG', quantidade: 0 },
        { cor: 'Branco', tamanho: 'P', quantidade: 0 },
        { cor: 'Branco', tamanho: 'M', quantidade: 2 },
        { cor: 'Branco', tamanho: 'G', quantidade: 0 },
        { cor: 'Branco', tamanho: 'GG', quantidade: 0 },
      ],
      ['P', 'M', 'G', 'GG', 'XG'],
    );
    expect(tamanhosEfetivos(grade)).toEqual(['M', 'G']);
    expect(tamanhosDaCor(grade, 'Preto')).toEqual(['M', 'G']);
    expect(tamanhosDaCor(grade, 'Branco')).toEqual(['M']);
  });

  it('mantém a grade já preenchida ao trocar o produto', () => {
    const preenchida = definirQuantidade(adicionarCor(gradeVazia(['P']), 'Verde musgo'), 'Verde musgo', 'P', 4);
    expect(gradeAoTrocarProduto(preenchida, ['Preto'], ['M'])).toBe(preenchida);
    const vazia = gradeVazia(['P', 'M']);
    expect(gradeAoTrocarProduto(vazia, ['Azul'], ['P', 'M']).cores).toEqual(['Azul']);
  });
});