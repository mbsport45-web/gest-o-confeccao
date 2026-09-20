import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  corpoInicioPagamento,
  mensagemErroPagamento,
} from './api';
import {
  MSG_CONFIRMADO,
  MSG_PENDENTE,
  MSG_SANDBOX,
  rotuloAcaoPlano,
} from './checkoutPagamento';
import type { PlanoEmpresa } from './api';

const DIR = dirname(fileURLToPath(import.meta.url));

const basico: PlanoEmpresa = {
  codigo: 'basico',
  nome: 'Básico',
  descricao: '',
  ordem: 1,
  limites: {
    usuarios: 3,
    clientes: 50,
    produtos: 30,
    materiais: 50,
    pedidos_mes: 50,
    ordens_mes: 20,
  },
  recursos: {
    expedicao: true,
    financeiro: true,
    relatorios_avancados: false,
    api_externa: false,
    suporte_prioritario: false,
  },
  preco_mensal: 99.9,
  preco_anual: null,
  moeda: 'BRL',
  ciclo: 'mensal',
};

const profissional: PlanoEmpresa = { ...basico, codigo: 'profissional', nome: 'Profissional', ordem: 2, preco_mensal: 149.9 };

describe('payload e mensagens do checkout sandbox', () => {
  it('envia só plano e meio, nunca preço ou empresa_id', () => {
    const corpo = corpoInicioPagamento('profissional', 'PIX');
    expect(corpo).toEqual({ plano: 'profissional', billingType: 'PIX' });
    expect(Object.keys(corpo).sort()).toEqual(['billingType', 'plano']);
    expect(JSON.stringify(corpo)).not.toContain('preco');
    expect(JSON.stringify(corpo)).not.toContain('valor');
    expect(JSON.stringify(corpo)).not.toContain('empresa_id');
    expect(JSON.stringify(corpo)).not.toContain('99.9');
  });

  it('não vaza secrets em erro de pagamento', () => {
    expect(mensagemErroPagamento({ codigo: 'gateway_indisponivel', erro: 'Defina ASAAS_API_KEY' })).toBe(
      'Pagamento de teste indisponível no momento.',
    );
    expect(mensagemErroPagamento({ codigo: 'gateway_erro', erro: 'access_token inválido' })).toBe(
      'Não foi possível iniciar o pagamento de teste. Tente novamente.',
    );
    expect(mensagemErroPagamento({ erro: 'ASAAS_API_KEY vazia' })).toBe(
      'Não foi possível comunicar com o pagamento de teste. Tente novamente.',
    );
  });

  it('identifica upgrade a partir do plano atual', () => {
    expect(rotuloAcaoPlano(basico, basico)).toBe('Plano atual');
    expect(rotuloAcaoPlano(profissional, basico)).toContain('upgrade');
    expect(rotuloAcaoPlano(profissional, basico)).toContain('R$ 149,90/mês');
  });

  it('mantém textos oficiais de sandbox, pendente e confirmado', () => {
    expect(MSG_SANDBOX).toContain('Sandbox');
    expect(MSG_SANDBOX).toContain('Nenhuma cobrança real');
    expect(MSG_PENDENTE).toBe('Pagamento aguardando confirmação.');
    expect(MSG_CONFIRMADO).toBe('Pagamento confirmado. Sua assinatura está ativa.');
  });

  it('tem CSS responsivo para computador, tablet e celular', () => {
    const css = readFileSync(join(DIR, 'styles.css'), 'utf8');
    expect(css).toContain('.planos');
    expect(css).toContain('repeat(3, minmax(0, 1fr))');
    expect(css).toContain('@media (max-width: 1100px)');
    expect(css).toContain('@media (max-width: 720px)');
    expect(css).toMatch(/\.planos[\s\S]*grid-template-columns: 1fr/);
  });
});
