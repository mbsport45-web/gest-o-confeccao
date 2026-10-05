import { describe, expect, it } from 'vitest';
import {
  ACAO_LABEL,
  acaoDoPedido,
  moduloDaRota,
  PAPEL_LABEL,
  PAPEIS,
  PAPEIS_CONVITE,
  PERMISSOES,
  temPermissao,
} from './papeis.js';

describe('papéis e permissões por módulo', () => {
  it('define os papéis da empresa e os papéis convidáveis', () => {
    expect([...PAPEIS]).toEqual([
      'proprietario',
      'administrador',
      'financeiro',
      'vendas',
      'estoque',
      'producao',
      'cortador',
    ]);
    expect([...PAPEIS_CONVITE]).toEqual([
      'administrador',
      'financeiro',
      'vendas',
      'estoque',
      'producao',
      'cortador',
    ]);
    expect(PAPEL_LABEL.proprietario).toBe('Proprietário');
    expect(PAPEIS_CONVITE.includes('proprietario' as never)).toBe(false);
  });

  it('dá CRUD completo ao proprietário e ao administrador', () => {
    for (const papel of ['proprietario', 'administrador'] as const) {
      expect(temPermissao(papel, 'equipe', 'excluir')).toBe(true);
      expect(temPermissao(papel, 'financeiro', 'criar')).toBe(true);
      expect(temPermissao(papel, 'ordens', 'editar')).toBe(true);
      expect(temPermissao(papel, 'relatorios', 'visualizar')).toBe(true);
      expect(Object.values(PERMISSOES[papel]).every((a) => a.visualizar && a.criar && a.editar && a.excluir)).toBe(
        true,
      );
    }
  });

  it('restringe financeiro, vendas, estoque e produção aos módulos do papel', () => {
    expect(temPermissao('financeiro', 'financeiro', 'criar')).toBe(true);
    expect(temPermissao('financeiro', 'clientes', 'visualizar')).toBe(true);
    expect(temPermissao('financeiro', 'clientes', 'criar')).toBe(false);
    expect(temPermissao('financeiro', 'ordens', 'visualizar')).toBe(false);
    expect(temPermissao('financeiro', 'equipe', 'visualizar')).toBe(false);

    expect(temPermissao('financeiro', 'assinatura', 'visualizar')).toBe(true);
    expect(temPermissao('financeiro', 'assinatura', 'editar')).toBe(false);

    expect(temPermissao('vendas', 'pedidos', 'excluir')).toBe(true);
    expect(temPermissao('vendas', 'expedicao', 'editar')).toBe(true);
    expect(temPermissao('vendas', 'relatorios', 'visualizar')).toBe(true);
    expect(temPermissao('vendas', 'financeiro', 'visualizar')).toBe(false);
    expect(temPermissao('vendas', 'estoque', 'visualizar')).toBe(false);

    expect(temPermissao('estoque', 'estoque', 'criar')).toBe(true);
    expect(temPermissao('estoque', 'materiais', 'excluir')).toBe(true);
    expect(temPermissao('estoque', 'produtos', 'visualizar')).toBe(true);
    expect(temPermissao('estoque', 'produtos', 'criar')).toBe(false);
    expect(temPermissao('estoque', 'clientes', 'visualizar')).toBe(false);

    expect(temPermissao('producao', 'ordens', 'criar')).toBe(true);
    expect(temPermissao('producao', 'etapas', 'editar')).toBe(true);
    expect(temPermissao('producao', 'produtos', 'visualizar')).toBe(true);
    expect(temPermissao('producao', 'pedidos', 'visualizar')).toBe(false);
    expect(temPermissao('producao', 'equipe', 'visualizar')).toBe(false);
    expect(temPermissao('producao', 'enfesto', 'editar')).toBe(true);
    expect(temPermissao('producao', 'enfesto', 'excluir')).toBe(false);

    expect(temPermissao('cortador', 'enfesto', 'criar')).toBe(true);
    expect(temPermissao('cortador', 'enfesto', 'editar')).toBe(true);
    expect(temPermissao('cortador', 'enfesto', 'excluir')).toBe(false);
    expect(temPermissao('cortador', 'ordens', 'visualizar')).toBe(true);
    expect(temPermissao('cortador', 'financeiro', 'visualizar')).toBe(false);
    expect(temPermissao('cortador', 'equipe', 'visualizar')).toBe(false);
  });

  it('mapeia rota e método HTTP para módulo e ação CRUD', () => {
    expect(moduloDaRota('/api/clientes')).toBe('clientes');
    expect(moduloDaRota('/api/materias-primas/3')).toBe('materiais');
    expect(moduloDaRota('/api/membros/1')).toBe('equipe');
    expect(moduloDaRota('/api/convites')).toBe('equipe');
    expect(moduloDaRota('/api/planos')).toBe('assinatura');
    expect(moduloDaRota('/api/assinatura')).toBe('assinatura');
    expect(moduloDaRota('/api/assinatura/eventos')).toBe('assinatura');
    expect(moduloDaRota('/api/assinatura/pagamento')).toBe('assinatura');
    expect(moduloDaRota('/api/health')).toBeNull();
    expect(moduloDaRota('/api/webhooks/asaas')).toBeNull();

    expect(acaoDoPedido('GET', '/api/clientes')).toBe('visualizar');
    expect(acaoDoPedido('POST', '/api/clientes')).toBe('criar');
    expect(acaoDoPedido('PATCH', '/api/clientes/9')).toBe('editar');
    expect(acaoDoPedido('DELETE', '/api/clientes/9')).toBe('excluir');
    expect(acaoDoPedido('POST', '/api/pedidos/4/gerar-op')).toBe('editar');
    expect(acaoDoPedido('POST', '/api/enfesto/4/cancelar')).toBe('excluir');
    expect(acaoDoPedido('POST', '/api/enfesto/4/finalizar')).toBe('editar');
    expect(acaoDoPedido('POST', '/api/estoque/movimentos')).toBe('criar');
    expect(acaoDoPedido('POST', '/api/etapas/fluxo')).toBe('criar');
    expect(acaoDoPedido('PUT', '/api/ordens/ficha-tecnica')).toBe('editar');
    expect(ACAO_LABEL.excluir).toBe('excluir');
  });
});
