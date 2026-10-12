export const TAMANHOS_PADRAO = ['P', 'M', 'G', 'GG', 'G1', 'G2', 'G3'] as const;

export type CelulaGrade = {
  cor: string;
  tamanho: string;
  quantidade: number;
};

export type GradeValor = {
  cores: string[];
  tamanhos: string[];
  quantidades: Record<string, number>;
};

export function chaveGrade(cor: string, tamanho: string): string {
  return `${cor.trim().toLocaleLowerCase('pt-BR')}|${tamanho.trim().toLocaleLowerCase('pt-BR')}`;
}

export function gradeVazia(tamanhos: string[] = [...TAMANHOS_PADRAO]): GradeValor {
  return { cores: [], tamanhos: [...tamanhos], quantidades: {} };
}

export function gradeDaOrdem(celulas: CelulaGrade[] | undefined, tamanhosPadrao: string[]): GradeValor {
  if (!celulas?.length) return gradeVazia(tamanhosPadrao);
  const cores: string[] = [];
  const tamanhos: string[] = [];
  const quantidades: Record<string, number> = {};
  for (const celula of celulas) {
    if (!cores.some((cor) => cor.toLocaleLowerCase('pt-BR') === celula.cor.toLocaleLowerCase('pt-BR'))) {
      cores.push(celula.cor);
    }
    if (
      !tamanhos.some((tamanho) => tamanho.toLocaleLowerCase('pt-BR') === celula.tamanho.toLocaleLowerCase('pt-BR'))
    ) {
      tamanhos.push(celula.tamanho);
    }
    quantidades[chaveGrade(celula.cor, celula.tamanho)] = celula.quantidade;
  }
  return { cores, tamanhos, quantidades };
}

export function celulasDaGrade(grade: GradeValor): CelulaGrade[] {
  const celulas: CelulaGrade[] = [];
  for (const cor of grade.cores) {
    for (const tamanho of grade.tamanhos) {
      celulas.push({
        cor,
        tamanho,
        quantidade: grade.quantidades[chaveGrade(cor, tamanho)] ?? 0,
      });
    }
  }
  return celulas;
}

export function totalCor(grade: GradeValor, cor: string): number {
  return grade.tamanhos.reduce(
    (soma, tamanho) => soma + (grade.quantidades[chaveGrade(cor, tamanho)] ?? 0),
    0,
  );
}

export function totalTamanho(grade: GradeValor, tamanho: string): number {
  return grade.cores.reduce((soma, cor) => soma + (grade.quantidades[chaveGrade(cor, tamanho)] ?? 0), 0);
}

export function totalGeral(grade: GradeValor): number {
  return grade.cores.reduce((soma, cor) => soma + totalCor(grade, cor), 0);
}

export function definirQuantidade(
  grade: GradeValor,
  cor: string,
  tamanho: string,
  quantidade: number,
): GradeValor {
  return {
    ...grade,
    quantidades: {
      ...grade.quantidades,
      [chaveGrade(cor, tamanho)]: Number.isFinite(quantidade) ? quantidade : 0,
    },
  };
}

function jaTem(lista: string[], nome: string): boolean {
  const chave = nome.trim().toLocaleLowerCase('pt-BR');
  return lista.some((item) => item.toLocaleLowerCase('pt-BR') === chave);
}

export function adicionarCor(grade: GradeValor, nome: string): GradeValor {
  const limpo = nome.trim();
  if (!limpo || jaTem(grade.cores, limpo)) return grade;
  return { ...grade, cores: [...grade.cores, limpo] };
}

export function removerCor(grade: GradeValor, nome: string): GradeValor {
  const quantidades = { ...grade.quantidades };
  for (const tamanho of grade.tamanhos) delete quantidades[chaveGrade(nome, tamanho)];
  return {
    ...grade,
    cores: grade.cores.filter((cor) => cor.toLocaleLowerCase('pt-BR') !== nome.trim().toLocaleLowerCase('pt-BR')),
    quantidades,
  };
}

export function adicionarTamanho(grade: GradeValor, nome: string): GradeValor {
  const limpo = nome.trim();
  if (!limpo || jaTem(grade.tamanhos, limpo)) return grade;
  return { ...grade, tamanhos: [...grade.tamanhos, limpo] };
}

function renomearLista(lista: string[], atual: string, novo: string): string[] | null {
  const limpo = novo.trim();
  const atualChave = atual.trim().toLocaleLowerCase('pt-BR');
  if (!limpo) return null;
  const novoChave = limpo.toLocaleLowerCase('pt-BR');
  if (atualChave !== novoChave && jaTem(lista, limpo)) return null;
  return lista.map((item) => (item.toLocaleLowerCase('pt-BR') === atualChave ? limpo : item));
}

export function renomearCor(grade: GradeValor, atual: string, novo: string): GradeValor {
  const cores = renomearLista(grade.cores, atual, novo);
  if (!cores) return grade;
  const limpo = novo.trim();
  if (limpo === atual) return grade;
  const quantidades = { ...grade.quantidades };
  for (const tamanho of grade.tamanhos) {
    const origem = chaveGrade(atual, tamanho);
    const destino = chaveGrade(limpo, tamanho);
    if (origem === destino) continue;
    quantidades[destino] = quantidades[origem] ?? 0;
    delete quantidades[origem];
  }
  return { ...grade, cores, quantidades };
}

export function renomearTamanho(grade: GradeValor, atual: string, novo: string): GradeValor {
  const tamanhos = renomearLista(grade.tamanhos, atual, novo);
  if (!tamanhos) return grade;
  const limpo = novo.trim();
  if (limpo === atual) return grade;
  const quantidades = { ...grade.quantidades };
  for (const cor of grade.cores) {
    const origem = chaveGrade(cor, atual);
    const destino = chaveGrade(cor, limpo);
    if (origem === destino) continue;
    quantidades[destino] = quantidades[origem] ?? 0;
    delete quantidades[origem];
  }
  return { ...grade, tamanhos, quantidades };
}

export function moverTamanho(grade: GradeValor, nome: string, deslocamento: -1 | 1): GradeValor {
  const indice = grade.tamanhos.findIndex(
    (tamanho) => tamanho.toLocaleLowerCase('pt-BR') === nome.trim().toLocaleLowerCase('pt-BR'),
  );
  const destino = indice + deslocamento;
  if (indice < 0 || destino < 0 || destino >= grade.tamanhos.length) return grade;
  const tamanhos = [...grade.tamanhos];
  const [item] = tamanhos.splice(indice, 1);
  tamanhos.splice(destino, 0, item);
  return { ...grade, tamanhos };
}

export function removerTamanho(grade: GradeValor, nome: string): GradeValor {
  const quantidades = { ...grade.quantidades };
  for (const cor of grade.cores) delete quantidades[chaveGrade(cor, nome)];
  return {
    ...grade,
    tamanhos: grade.tamanhos.filter(
      (tamanho) => tamanho.toLocaleLowerCase('pt-BR') !== nome.trim().toLocaleLowerCase('pt-BR'),
    ),
    quantidades,
  };
}

export function mensagemGrade(grade: GradeValor, quantidadeOrdem: number): string | null {
  if (grade.cores.length === 0 || grade.tamanhos.length === 0) {
    return 'Informe a grade de cores e tamanhos';
  }
  for (const cor of grade.cores) {
    for (const tamanho of grade.tamanhos) {
      const quantidade = grade.quantidades[chaveGrade(cor, tamanho)] ?? 0;
      if (!Number.isInteger(quantidade) || quantidade < 0) {
        return 'A quantidade de cada combinação deve ser um número inteiro maior ou igual a zero';
      }
    }
  }
  const soma = totalGeral(grade);
  if (soma !== quantidadeOrdem) {
    return `A soma da grade (${soma}) difere da quantidade da ordem (${quantidadeOrdem})`;
  }
  return null;
}
