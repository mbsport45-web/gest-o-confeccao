import { Router } from 'express';
import { z } from 'zod';
import type { AppDatabase } from '../db.js';
import { CODIGOS_PLANO, isCodigoPlano, obterAssinaturaDaEmpresa } from '../planos.js';
import { empresaDaSessao } from '../tenant.js';
import { ErroAsaas } from './asaas.js';
import {
  CODIGO_GATEWAY_ERRO,
  CODIGO_GATEWAY_INDISPONIVEL,
  contratarAssinaturaSandbox,
  montarCheckout,
  obterCheckoutDaEmpresa,
} from './servico.js';
import { FORMAS_COBRANCA_SANDBOX, type PaymentGateway } from './tipos.js';

const contratarSchema = z
  .object({
    plano: z.enum(CODIGOS_PLANO).optional(),
    billingType: z.enum(FORMAS_COBRANCA_SANDBOX).optional(),
  })
  .strict();

function erroGatewayAmigavel() {
  return {
    erro: 'Não foi possível iniciar o pagamento de teste. Tente novamente.',
    codigo: CODIGO_GATEWAY_ERRO,
  };
}

export function createPagamentoAssinaturaRouter(
  db: AppDatabase,
  gateway: PaymentGateway | null,
): Router {
  const router = Router();

  router.get('/pagamento', (req, res) => {
    const empresaId = empresaDaSessao(req);
    res.json(obterCheckoutDaEmpresa(db, empresaId));
  });

  router.post('/pagamento', async (req, res) => {
    if (!gateway) {
      return res.status(503).json({
        erro: 'Pagamento de teste indisponível no momento.',
        codigo: CODIGO_GATEWAY_INDISPONIVEL,
      });
    }
    const parsed = contratarSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      return res.status(400).json({
        erro: 'Dados inválidos',
        detalhes: parsed.error.flatten().fieldErrors,
        form: parsed.error.flatten().formErrors,
      });
    }
    const empresaId = empresaDaSessao(req);
    const ator = req.usuario ? { id: req.usuario.id, nome: req.usuario.nome } : null;
    try {
      const resultado = await contratarAssinaturaSandbox(db, gateway, empresaId, {
        plano: parsed.data.plano && isCodigoPlano(parsed.data.plano) ? parsed.data.plano : undefined,
        billingType: parsed.data.billingType,
        ator,
      });
      if (!resultado.ok) return res.status(resultado.statusHttp).json(resultado.corpo);
      const assinatura = obterAssinaturaDaEmpresa(db, empresaId);
      return res.status(201).json({
        ...assinatura,
        sandbox: {
          provedor: gateway.provedor,
          ambiente: gateway.ambiente,
          customer_id: resultado.cliente.id,
          subscription_id: resultado.assinatura.id,
          valor_mensal: resultado.valor,
          plano: resultado.plano,
          cobranca_real: false,
          billingType: resultado.assinatura.billingType,
        },
        checkout: montarCheckout('pendente', {
          plano: resultado.plano,
          valor_mensal: resultado.valor,
          billingType: parsed.data.billingType ?? 'BOLETO',
        }),
      });
    } catch (erro) {
      const status = erro instanceof ErroAsaas ? erro.statusHttp : 502;
      return res.status(status).json(erroGatewayAmigavel());
    }
  });

  return router;
}
