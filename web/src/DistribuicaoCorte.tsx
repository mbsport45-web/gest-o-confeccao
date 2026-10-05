import type { DistribuicaoOp, ProdutoVariante } from './api';

const ORDEM_TAMANHO = ['PP', 'P', 'M', 'G', 'GG', 'XG', 'EG', 'XXG', 'EXG'];

function compararTamanho(a: string, b: string): number {
  const ia = ORDEM_TAMANHO.indexOf(a.toUpperCase());
  const ib = ORDEM_TAMANHO.indexOf(b.toUpperCase());
  if (ia !== -1 || ib !== -1) {
    if (ia === -1) return 1;
    if (ib === -1) return -1;
    return ia - ib;
  }
  const na = Number(a);
  const nb = Number(b);
  if (!Number.isNaN(na) && !Number.isNaN(nb)) return na - nb;
  return a.localeCompare(b, 'pt-BR');
}

function ordenarEixo(preferidos: string[], presentes: string[], comparar: (a: string, b: string) => number): string[] {
  const norm = (valor: string) => valor.trim().toLowerCase();
  const usados = new Set<string>();
  const saida: string[] = [];
  for (const item of preferidos) {
    const encontrado = presentes.find((atual) => norm(atual) === norm(item));
    if (encontrado && !usados.has(norm(encontrado))) {
      usados.add(norm(encontrado));
      saida.push(encontrado);
    }
  }
  const resto = presentes.filter((item) => !usados.has(norm(item))).sort(comparar);
  return [...saida, ...resto];
}

export function varianteDaCelula(
  variantes: ProdutoVariante[],
  cor: string,
  tamanho: string,
): ProdutoVariante | undefined {
  const norm = (valor: string) => valor.trim().toLowerCase();
  return variantes.find(
    (variante) => norm(variante.cor) === norm(cor) && norm(variante.tamanho) === norm(tamanho),
  );
}

export function eixosDasVariantes(
  variantes: ProdutoVariante[],
  coresPreferidas: string[] = [],
  tamanhosPreferidos: string[] = [],
) {
  return {
    cores: ordenarEixo(coresPreferidas, variantes.map((v) => v.cor), (a, b) => a.localeCompare(b, 'pt-BR')),
    tamanhos: ordenarEixo(tamanhosPreferidos, variantes.map((v) => v.tamanho), compararTamanho),
  };
}

export function somaGrade(valores: Record<string, number>): number {
  return Object.values(valores).reduce((total, quantidade) => total + (Number.isFinite(quantidade) ? quantidade : 0), 0);
}

export function TabelaDistribuicao({
  itens,
  coresPreferidas = [],
  tamanhosPreferidos = [],
}: {
  itens: DistribuicaoOp[];
  coresPreferidas?: string[];
  tamanhosPreferidos?: string[];
}) {
  const cores = ordenarEixo(coresPreferidas, itens.map((item) => item.cor), (a, b) => a.localeCompare(b, 'pt-BR'));
  const tamanhos = ordenarEixo(
    tamanhosPreferidos,
    itens.map((item) => item.tamanho),
    compararTamanho,
  );
  const celula = (cor: string, tamanho: string) =>
    itens.find(
      (item) =>
        item.cor.trim().toLowerCase() === cor.trim().toLowerCase() &&
        item.tamanho.trim().toLowerCase() === tamanho.trim().toLowerCase(),
    );
  const totalCor = (cor: string) =>
    itens
      .filter((item) => item.cor.trim().toLowerCase() === cor.trim().toLowerCase())
      .reduce((total, item) => total + item.quantidade, 0);
  const totalTamanho = (tamanho: string) =>
    itens
      .filter((item) => item.tamanho.trim().toLowerCase() === tamanho.trim().toLowerCase())
      .reduce((total, item) => total + item.quantidade, 0);
  const totalGeral = itens.reduce((total, item) => total + item.quantidade, 0);

  if (!itens.length) return null;

  return (
    <div className="grade-corte">
      <table className="tabela tabela--compacta grade-corte__tabela">
        <thead>
          <tr>
            <th>Cor</th>
            {tamanhos.map((tamanho) => (
              <th key={tamanho}>{tamanho}</th>
            ))}
            <th>Total</th>
          </tr>
        </thead>
        <tbody>
          {cores.map((cor) => (
            <tr key={cor}>
              <th scope="row">{cor}</th>
              {tamanhos.map((tamanho) => (
                <td key={tamanho}>{celula(cor, tamanho)?.quantidade ?? 0}</td>
              ))}
              <td className="grade-total">{totalCor(cor)}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <th scope="row">Total</th>
            {tamanhos.map((tamanho) => (
              <td key={tamanho} className="grade-total">
                {totalTamanho(tamanho)}
              </td>
            ))}
            <td className="grade-total">{totalGeral}</td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

export function GradeDistribuicao({
  variantes,
  cores,
  tamanhos,
  valores,
  onChange,
}: {
  variantes: ProdutoVariante[];
  cores: string[];
  tamanhos: string[];
  valores: Record<string, number>;
  onChange: (varianteId: number, quantidade: number) => void;
}) {
  const { cores: linhas, tamanhos: colunas } = eixosDasVariantes(variantes, cores, tamanhos);
  const quantidadeDe = (varianteId: number) => valores[String(varianteId)] ?? 0;
  const totalCor = (cor: string) =>
    colunas.reduce((total, tamanho) => {
      const variante = varianteDaCelula(variantes, cor, tamanho);
      return total + (variante ? quantidadeDe(variante.id) : 0);
    }, 0);
  const totalTamanho = (tamanho: string) =>
    linhas.reduce((total, cor) => {
      const variante = varianteDaCelula(variantes, cor, tamanho);
      return total + (variante ? quantidadeDe(variante.id) : 0);
    }, 0);
  const totalGeral = variantes.reduce((total, variante) => total + quantidadeDe(variante.id), 0);

  return (
    <div className="grade-corte">
      <table className="tabela tabela--compacta grade-corte__tabela">
        <thead>
          <tr>
            <th>Cor</th>
            {colunas.map((tamanho) => (
              <th key={tamanho}>{tamanho}</th>
            ))}
            <th>Total</th>
          </tr>
        </thead>
        <tbody>
          {linhas.map((cor) => (
            <tr key={cor}>
              <th scope="row">{cor}</th>
              {colunas.map((tamanho) => {
                const variante = varianteDaCelula(variantes, cor, tamanho);
                if (!variante) return <td key={tamanho}>—</td>;
                return (
                  <td key={tamanho}>
                    <input
                      aria-label={`${cor} ${tamanho}`}
                      type="number"
                      min={0}
                      step={1}
                      value={quantidadeDe(variante.id)}
                      onChange={(e) => {
                        const bruto = e.target.value;
                        const quantidade = bruto === '' ? 0 : Math.max(0, Math.trunc(Number(bruto)));
                        onChange(variante.id, Number.isFinite(quantidade) ? quantidade : 0);
                      }}
                    />
                  </td>
                );
              })}
              <td className="grade-total">{totalCor(cor)}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <th scope="row">Total</th>
            {colunas.map((tamanho) => (
              <td key={tamanho} className="grade-total">
                {totalTamanho(tamanho)}
              </td>
            ))}
            <td className="grade-total">{totalGeral}</td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}
