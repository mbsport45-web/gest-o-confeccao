import type { AppDatabase } from '../db.js';

function garantirColuna(db: AppDatabase, tabela: string, coluna: string, ddl: string) {
  const cols = db.prepare(`PRAGMA table_info(${tabela})`).all() as Array<{ name: string }>;
  if (!cols.some((col) => col.name === coluna)) {
    db.exec(ddl);
  }
}

export function aplicarSchemaPagamentos(db: AppDatabase) {
  garantirColuna(db, 'assinaturas', 'asaas_customer_id', 'ALTER TABLE assinaturas ADD COLUMN asaas_customer_id TEXT');
  garantirColuna(
    db,
    'assinaturas',
    'asaas_subscription_id',
    'ALTER TABLE assinaturas ADD COLUMN asaas_subscription_id TEXT',
  );
  garantirColuna(db, 'assinaturas', 'payment_provider', 'ALTER TABLE assinaturas ADD COLUMN payment_provider TEXT');
  garantirColuna(
    db,
    'assinaturas',
    'payment_provider_status',
    'ALTER TABLE assinaturas ADD COLUMN payment_provider_status TEXT',
  );
  garantirColuna(
    db,
    'eventos_assinatura',
    'referencia_externa',
    'ALTER TABLE eventos_assinatura ADD COLUMN referencia_externa TEXT',
  );

  db.exec(`
    CREATE UNIQUE INDEX IF NOT EXISTS assinaturas_asaas_customer_unique
      ON assinaturas (asaas_customer_id)
      WHERE asaas_customer_id IS NOT NULL AND asaas_customer_id != '';
    CREATE UNIQUE INDEX IF NOT EXISTS assinaturas_asaas_subscription_unique
      ON assinaturas (asaas_subscription_id)
      WHERE asaas_subscription_id IS NOT NULL AND asaas_subscription_id != '';

    CREATE TABLE IF NOT EXISTS eventos_webhook_pagamento (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      provedor TEXT NOT NULL DEFAULT 'asaas',
      evento_id TEXT NOT NULL UNIQUE,
      tipo TEXT NOT NULL,
      empresa_id INTEGER REFERENCES empresas(id),
      payload_json TEXT NOT NULL,
      processado INTEGER NOT NULL DEFAULT 0,
      processado_em TEXT,
      erro TEXT,
      criado_em TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS eventos_webhook_pagamento_empresa
      ON eventos_webhook_pagamento (empresa_id, id);
  `);
}
