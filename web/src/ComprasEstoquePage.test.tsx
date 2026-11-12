import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MODULOS, type AcoesModulo, type Modulo, type PermissoesSessao } from './api';
import { ComprasEstoquePage } from './ComprasEstoquePage';

vi.mock('./ComprasPage', () => ({
  ComprasPage: ({ visao }: { visao?: string }) => <div>painel-{visao ?? 'compras'}</div>,
}));

vi.mock('./EstoquePage', () => ({
  EstoquePage: ({ visao }: { visao?: string }) => <div>estoque-{visao ?? 'completo'}</div>,
}));

const base: AcoesModulo = { visualizar: false, criar: false, editar: false, excluir: false };

function permissoes(ativos: Partial<Record<Modulo, Partial<AcoesModulo>>>): PermissoesSessao {
  const modulos = Object.fromEntries(
    MODULOS.map((modulo) => [modulo, { ...base, ...ativos[modulo] }]),
  ) as PermissoesSessao['modulos'];
  return { escrever: true, equipe: false, modulos };
}

const completo = permissoes({
  compras: { visualizar: true, criar: true },
  fornecedores: { visualizar: true, criar: true },
  estoque: { visualizar: true, criar: true },
});

describe('abas de Compras e Estoque', () => {
  afterEach(() => cleanup());

  it('abre as cinco áreas nas telas já existentes', () => {
    render(<ComprasEstoquePage permissoes={completo} />);
    expect(screen.getByRole('tab', { name: 'Compras', selected: true })).toBeTruthy();
    expect(screen.getByText('painel-compras')).toBeTruthy();

    fireEvent.click(screen.getByRole('tab', { name: 'Importar PDF' }));
    expect(screen.getByText('painel-importar')).toBeTruthy();

    fireEvent.click(screen.getByRole('tab', { name: 'Fornecedores' }));
    expect(screen.getByText('painel-fornecedores')).toBeTruthy();

    fireEvent.click(screen.getByRole('tab', { name: 'Estoque de materiais' }));
    expect(screen.getByText('estoque-materiais')).toBeTruthy();

    fireEvent.click(screen.getByRole('tab', { name: 'Movimentações' }));
    expect(screen.getByText('estoque-movimentacoes')).toBeTruthy();
  });

  it('esconde estoque de quem só acessa compras e fornecedores', () => {
    render(<ComprasEstoquePage permissoes={permissoes({
      compras: { visualizar: true },
      fornecedores: { visualizar: true },
    })} />);
    expect(screen.getByRole('tab', { name: 'Compras' })).toBeTruthy();
    expect(screen.getByRole('tab', { name: 'Importar PDF' })).toBeTruthy();
    expect(screen.getByRole('tab', { name: 'Fornecedores' })).toBeTruthy();
    expect(screen.queryByRole('tab', { name: 'Estoque de materiais' })).toBeNull();
    expect(screen.queryByRole('tab', { name: 'Movimentações' })).toBeNull();
  });

  it('mantém Materiais e Produção no menu e tira só a navegação de Estoque', () => {
    const app = readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'App.tsx'), 'utf8');
    expect(app).toContain("label: 'Materiais'");
    expect(app).not.toContain("label: 'Estoque', grupo: 'Produção'");
    expect(app).toContain("label: 'Ordens de Produção'");
    expect(app).toContain("label: 'Liberação Ficha/Oficina'");
    expect(app).toContain("label: 'Compras e Estoque'");
    expect(app).toContain("label: 'Enfesto e Corte'");
    expect(app).toContain("label: 'OCs disponíveis/estampas'");
    expect(app).toContain('<EstoquePage />');
    expect(app).toContain('<MateriasPage');
    expect(app).toContain('<PainelMotivacao />');
  });
});
