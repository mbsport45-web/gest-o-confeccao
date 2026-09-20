import { createHash, timingSafeEqual } from 'node:crypto';
import type { Request, Response } from 'express';
import type { AppDatabase } from '../db.js';
import { ASAAS_WEBHOOK_HEADER } from './config.js';
import { localizarEmpresaDoEvento, processarEventoGateway, sanitizarPayloadWebhook } from './servico.js';
import type { PaymentGateway } from './tipos.js';

function tokensIguais(recebido: string, esperado: string): boolean {
  const a = createHash('sha256').update(recebido).digest();
  const b = createHash('sha256').update(esperado).digest();
  return timingSafeEqual(a, b);
}

function headerToken(req: Request): string {
  const bruto = req.header(ASAAS_WEBHOOK_HEADER) ?? req.header('Asaas-Access-Token') ?? '';
  return Array.isArray(bruto) ? bruto[0] : bruto;
}

export function createAsaasWebhookHandler(
  db: AppDatabase,
  opcoes: { token: string; gateway?: PaymentGateway | null },
) {
  return (req: Request, res: Response) => {
    const esperado = opcoes.token?.trim() ?? '';
    if (!esperado) {
      return res.status(401).json({ erro: 'Webhook Asaas não configurado' });
    }
    const recebido = headerToken(req);
    if (!recebido || !tokensIguais(recebido, esperado)) {
      return res.status(401).json({ erro: 'Token de webhook inválido' });
    }

    const corpo = req.body;
    const interpretado = opcoes.gateway
      ? opcoes.gateway.interpretarWebhook(corpo)
      : {
          id: String((corpo as { id?: string })?.id ?? ''),
          event: String((corpo as { event?: string })?.event ?? ''),
          dateCreated: (corpo as { dateCreated?: string })?.dateCreated,
          payment: (corpo as { payment?: Record<string, unknown> })?.payment ?? null,
          subscription: (corpo as { subscription?: Record<string, unknown> })?.subscription ?? null,
          checkout: (corpo as { checkout?: Record<string, unknown> })?.checkout ?? null,
        };

    if (!interpretado.id || !interpretado.event) {
      return res.status(400).json({ erro: 'Evento Asaas sem id ou event' });
    }

    const payload = JSON.stringify(sanitizarPayloadWebhook(corpo ?? {}));
    const empresaId = localizarEmpresaDoEvento(db, interpretado);

    const insert = db.prepare(
      `INSERT OR IGNORE INTO eventos_webhook_pagamento
         (provedor, evento_id, tipo, empresa_id, payload_json, processado)
       VALUES ('asaas', ?, ?, ?, ?, 0)`,
    );
    const resultado = insert.run(interpretado.id, interpretado.event, empresaId, payload);

    const row = db
      .prepare('SELECT id, processado FROM eventos_webhook_pagamento WHERE evento_id = ?')
      .get(interpretado.id) as { id: number; processado: number } | undefined;

    if (!row) {
      return res.status(500).json({ erro: 'Falha ao persistir evento' });
    }

    if (row.processado === 1) {
      return res.status(200).json({ ok: true, duplicado: true, id: interpretado.id });
    }

    try {
      if (empresaId) {
        const assinatura = db
          .prepare('SELECT empresa_id FROM assinaturas WHERE empresa_id = ?')
          .get(empresaId) as { empresa_id: number } | undefined;
        if (!assinatura) {
          throw new Error('evento não pertence a uma empresa conhecida');
        }
        processarEventoGateway(db, empresaId, interpretado);
      }
      db.prepare(
        `UPDATE eventos_webhook_pagamento
            SET processado = 1, processado_em = datetime('now'), erro = NULL
          WHERE id = ?`,
      ).run(row.id);
    } catch (erro) {
      const mensagem = erro instanceof Error ? erro.message : 'erro ao processar webhook';
      db.prepare(`UPDATE eventos_webhook_pagamento SET erro = ? WHERE id = ?`).run(mensagem, row.id);
      return res.status(500).json({ erro: 'Falha ao processar evento' });
    }

    return res.status(200).json({
      ok: true,
      id: interpretado.id,
      duplicado: resultado.changes === 0,
      persistido: true,
    });
  };
}
