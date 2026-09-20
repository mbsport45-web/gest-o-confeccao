import Database from 'better-sqlite3';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

export type AppDatabase = ReturnType<typeof createDatabase>;

/**
 * Creates and initializes a SQLite database connection.
 *
 * Pass `:memory:` for an ephemeral database (used by tests). For normal runs a
 * file path is used so production orders survive server restarts.
 */
export function createDatabase(location: string) {
  if (location !== ':memory:') {
    mkdirSync(dirname(location), { recursive: true });
  }

  const db = new Database(location);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  db.exec(`
    CREATE TABLE IF NOT EXISTS ordens_producao (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      cliente TEXT NOT NULL,
      produto TEXT NOT NULL,
      tamanho TEXT NOT NULL,
      quantidade INTEGER NOT NULL,
      status TEXT NOT NULL DEFAULT 'pendente',
      criado_em TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS clientes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nome TEXT NOT NULL,
      cpf_cnpj TEXT,
      contato TEXT,
      telefone TEXT,
      whatsapp TEXT,
      email TEXT,
      endereco TEXT,
      cidade TEXT,
      estado TEXT,
      cep TEXT,
      condicao_pagamento TEXT,
      limite_credito REAL NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'ativo',
      observacoes TEXT,
      criado_em TEXT NOT NULL DEFAULT (datetime('now')),
      atualizado_em TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE UNIQUE INDEX IF NOT EXISTS clientes_cpf_cnpj_unique
      ON clientes (cpf_cnpj)
      WHERE cpf_cnpj IS NOT NULL AND cpf_cnpj != '';

    -- Cadastro de produtos (base para ficha técnica/BOM, matérias-primas,
    -- estoque, pedidos de venda e ordens de produção).
    CREATE TABLE IF NOT EXISTS produtos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      sku TEXT,
      nome TEXT NOT NULL,
      descricao TEXT,
      categoria TEXT,
      subcategoria TEXT,
      marca TEXT,
      genero TEXT,
      colecao TEXT,
      cores TEXT NOT NULL DEFAULT '[]',
      tamanhos TEXT NOT NULL DEFAULT '[]',
      codigo_barras TEXT,
      unidade TEXT NOT NULL DEFAULT 'UN',
      preco_venda REAL NOT NULL DEFAULT 0,
      preco_atacado REAL NOT NULL DEFAULT 0,
      preco_custo REAL NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'ativo',
      estoque_minimo INTEGER NOT NULL DEFAULT 0,
      imagem TEXT,
      observacoes TEXT,
      criado_em TEXT NOT NULL DEFAULT (datetime('now')),
      atualizado_em TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE UNIQUE INDEX IF NOT EXISTS produtos_sku_unique
      ON produtos (sku)
      WHERE sku IS NOT NULL AND sku != '';

    CREATE UNIQUE INDEX IF NOT EXISTS produtos_codigo_barras_unique
      ON produtos (codigo_barras)
      WHERE codigo_barras IS NOT NULL AND codigo_barras != '';

    -- Variantes cor × tamanho, cada uma com SKU e código de barras únicos.
    -- estoque e pedidos futuros devem apontar para produto_variantes.id.
    CREATE TABLE IF NOT EXISTS produto_variantes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      produto_id INTEGER NOT NULL REFERENCES produtos(id) ON DELETE CASCADE,
      cor TEXT NOT NULL,
      tamanho TEXT NOT NULL,
      sku TEXT NOT NULL,
      codigo_barras TEXT,
      preco_venda REAL,
      preco_atacado REAL,
      preco_custo REAL,
      estoque_minimo INTEGER,
      status TEXT NOT NULL DEFAULT 'ativo',
      criado_em TEXT NOT NULL DEFAULT (datetime('now')),
      atualizado_em TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE (produto_id, cor, tamanho)
    );

    CREATE UNIQUE INDEX IF NOT EXISTS produto_variantes_sku_unique
      ON produto_variantes (sku);

    CREATE UNIQUE INDEX IF NOT EXISTS produto_variantes_codigo_barras_unique
      ON produto_variantes (codigo_barras)
      WHERE codigo_barras IS NOT NULL AND codigo_barras != '';

    -- Matérias-primas (base para ficha técnica/BOM, estoque e compras).
    CREATE TABLE IF NOT EXISTS materias_primas (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      codigo TEXT,
      nome TEXT NOT NULL,
      descricao TEXT,
      tipo TEXT NOT NULL DEFAULT 'tecido',
      categoria TEXT,
      cor TEXT,
      composicao TEXT,
      largura_cm REAL,
      gramatura REAL,
      unidade TEXT NOT NULL DEFAULT 'UN',
      custo REAL NOT NULL DEFAULT 0,
      estoque_minimo REAL NOT NULL DEFAULT 0,
      fornecedor TEXT,
      referencia_fornecedor TEXT,
      ncm TEXT,
      status TEXT NOT NULL DEFAULT 'ativo',
      observacoes TEXT,
      criado_em TEXT NOT NULL DEFAULT (datetime('now')),
      atualizado_em TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE UNIQUE INDEX IF NOT EXISTS materias_primas_codigo_unique
      ON materias_primas (codigo)
      WHERE codigo IS NOT NULL AND codigo != '';

    -- Saldos atuais. Um registro por variante, produto simples ou matéria-prima.
    CREATE TABLE IF NOT EXISTS estoque_saldos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tipo TEXT NOT NULL,
      produto_id INTEGER REFERENCES produtos(id),
      variante_id INTEGER REFERENCES produto_variantes(id),
      materia_prima_id INTEGER REFERENCES materias_primas(id),
      quantidade REAL NOT NULL DEFAULT 0,
      criado_em TEXT NOT NULL DEFAULT (datetime('now')),
      atualizado_em TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE UNIQUE INDEX IF NOT EXISTS estoque_saldos_variante_unique
      ON estoque_saldos (variante_id)
      WHERE variante_id IS NOT NULL;

    CREATE UNIQUE INDEX IF NOT EXISTS estoque_saldos_produto_unique
      ON estoque_saldos (produto_id)
      WHERE tipo = 'produto' AND produto_id IS NOT NULL AND variante_id IS NULL;

    CREATE UNIQUE INDEX IF NOT EXISTS estoque_saldos_materia_unique
      ON estoque_saldos (materia_prima_id)
      WHERE materia_prima_id IS NOT NULL;

    -- Histórico de entradas, saídas e ajustes.
    CREATE TABLE IF NOT EXISTS estoque_movimentos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      saldo_id INTEGER NOT NULL REFERENCES estoque_saldos(id),
      tipo TEXT NOT NULL,
      quantidade REAL NOT NULL,
      saldo_anterior REAL NOT NULL,
      saldo_posterior REAL NOT NULL,
      motivo TEXT,
      observacoes TEXT,
      produto_id INTEGER REFERENCES produtos(id),
      variante_id INTEGER REFERENCES produto_variantes(id),
      materia_prima_id INTEGER REFERENCES materias_primas(id),
      criado_em TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- BOM / ficha técnica por produto (variante opcional).
    CREATE TABLE IF NOT EXISTS produto_bom_itens (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      produto_id INTEGER NOT NULL REFERENCES produtos(id) ON DELETE CASCADE,
      variante_id INTEGER REFERENCES produto_variantes(id) ON DELETE CASCADE,
      materia_prima_id INTEGER NOT NULL REFERENCES materias_primas(id),
      quantidade REAL NOT NULL DEFAULT 1,
      unidade TEXT
    );

    CREATE UNIQUE INDEX IF NOT EXISTS produto_bom_variante_unique
      ON produto_bom_itens (variante_id, materia_prima_id)
      WHERE variante_id IS NOT NULL;

    CREATE UNIQUE INDEX IF NOT EXISTS produto_bom_produto_unique
      ON produto_bom_itens (produto_id, materia_prima_id)
      WHERE variante_id IS NULL;

    -- Requisitos de material copiados para cada OP.
    CREATE TABLE IF NOT EXISTS ordem_requisitos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ordem_id INTEGER NOT NULL REFERENCES ordens_producao(id) ON DELETE CASCADE,
      materia_prima_id INTEGER NOT NULL REFERENCES materias_primas(id),
      quantidade_unitaria REAL NOT NULL,
      quantidade_total REAL NOT NULL,
      unidade TEXT,
      movimento_id INTEGER REFERENCES estoque_movimentos(id),
      UNIQUE (ordem_id, materia_prima_id)
    );

    -- Etapas do fluxo de produção vinculadas a uma OP.
    CREATE TABLE IF NOT EXISTS etapas_producao (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ordem_id INTEGER NOT NULL REFERENCES ordens_producao(id) ON DELETE CASCADE,
      tipo TEXT NOT NULL,
      sequencia INTEGER NOT NULL,
      status TEXT NOT NULL DEFAULT 'pendente',
      responsavel TEXT,
      iniciado_em TEXT,
      finalizado_em TEXT,
      observacoes TEXT,
      criado_em TEXT NOT NULL DEFAULT (datetime('now')),
      atualizado_em TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE (ordem_id, sequencia),
      UNIQUE (ordem_id, tipo)
    );
  `);

  const ordemCols = db
    .prepare(`PRAGMA table_info(ordens_producao)`)
    .all() as { name: string }[];
  if (!ordemCols.some((col) => col.name === 'cliente_id')) {
    db.exec(
      `ALTER TABLE ordens_producao ADD COLUMN cliente_id INTEGER REFERENCES clientes(id)`,
    );
  }
  if (!ordemCols.some((col) => col.name === 'produto_id')) {
    db.exec(
      `ALTER TABLE ordens_producao ADD COLUMN produto_id INTEGER REFERENCES produtos(id)`,
    );
  }
  if (!ordemCols.some((col) => col.name === 'variante_id')) {
    db.exec(
      `ALTER TABLE ordens_producao ADD COLUMN variante_id INTEGER REFERENCES produto_variantes(id)`,
    );
  }

  const extras: Array<{ name: string; ddl: string }> = [
    { name: 'codigo', ddl: 'ALTER TABLE ordens_producao ADD COLUMN codigo TEXT' },
    {
      name: 'prioridade',
      ddl: `ALTER TABLE ordens_producao ADD COLUMN prioridade TEXT NOT NULL DEFAULT 'normal'`,
    },
    { name: 'data_prevista', ddl: 'ALTER TABLE ordens_producao ADD COLUMN data_prevista TEXT' },
    { name: 'observacoes', ddl: 'ALTER TABLE ordens_producao ADD COLUMN observacoes TEXT' },
    { name: 'responsavel', ddl: 'ALTER TABLE ordens_producao ADD COLUMN responsavel TEXT' },
    { name: 'atualizado_em', ddl: 'ALTER TABLE ordens_producao ADD COLUMN atualizado_em TEXT' },
  ];
  const nomes = new Set(ordemCols.map((col) => col.name));
  for (const extra of extras) {
    if (!nomes.has(extra.name)) db.exec(extra.ddl);
  }

  db.exec(`
    UPDATE ordens_producao
       SET codigo = 'OP-' || printf('%04d', id)
     WHERE codigo IS NULL OR trim(codigo) = '';
    UPDATE ordens_producao
       SET atualizado_em = criado_em
     WHERE atualizado_em IS NULL OR trim(atualizado_em) = '';
  `);
  db.exec(`
    CREATE UNIQUE INDEX IF NOT EXISTS ordens_producao_codigo_unique
      ON ordens_producao (codigo)
      WHERE codigo IS NOT NULL AND codigo != '';
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS fornecedores (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      codigo TEXT,
      nome TEXT NOT NULL,
      cpf_cnpj TEXT,
      contato TEXT,
      telefone TEXT,
      email TEXT,
      endereco TEXT,
      cidade TEXT,
      estado TEXT,
      cep TEXT,
      condicao_pagamento TEXT,
      status TEXT NOT NULL DEFAULT 'ativo',
      observacoes TEXT,
      criado_em TEXT NOT NULL DEFAULT (datetime('now')),
      atualizado_em TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE UNIQUE INDEX IF NOT EXISTS fornecedores_cpf_cnpj_unique
      ON fornecedores (cpf_cnpj)
      WHERE cpf_cnpj IS NOT NULL AND cpf_cnpj != '';

    CREATE UNIQUE INDEX IF NOT EXISTS fornecedores_codigo_unique
      ON fornecedores (codigo)
      WHERE codigo IS NOT NULL AND codigo != '';

    CREATE TABLE IF NOT EXISTS pedidos_compra (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      codigo TEXT,
      fornecedor_id INTEGER NOT NULL REFERENCES fornecedores(id),
      data_emissao TEXT NOT NULL,
      data_prevista TEXT,
      status TEXT NOT NULL DEFAULT 'rascunho',
      observacoes TEXT,
      subtotal REAL NOT NULL DEFAULT 0,
      desconto REAL NOT NULL DEFAULT 0,
      frete REAL NOT NULL DEFAULT 0,
      total REAL NOT NULL DEFAULT 0,
      forma_pagamento TEXT,
      condicao_pagamento TEXT,
      vencimento TEXT,
      criado_em TEXT NOT NULL DEFAULT (datetime('now')),
      atualizado_em TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE UNIQUE INDEX IF NOT EXISTS pedidos_compra_codigo_unique
      ON pedidos_compra (codigo)
      WHERE codigo IS NOT NULL AND codigo != '';

    CREATE TABLE IF NOT EXISTS pedido_compra_itens (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      compra_id INTEGER NOT NULL REFERENCES pedidos_compra(id) ON DELETE CASCADE,
      materia_prima_id INTEGER REFERENCES materias_primas(id),
      produto_id INTEGER REFERENCES produtos(id),
      variante_id INTEGER REFERENCES produto_variantes(id),
      quantidade REAL NOT NULL,
      quantidade_recebida REAL NOT NULL DEFAULT 0,
      custo_unitario REAL NOT NULL,
      total REAL NOT NULL,
      unidade TEXT,
      criado_em TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS financeiro_categorias (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nome TEXT NOT NULL UNIQUE,
      tipo TEXT NOT NULL DEFAULT 'ambos',
      status TEXT NOT NULL DEFAULT 'ativo',
      criado_em TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS financeiro_lancamentos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tipo TEXT NOT NULL,
      categoria_id INTEGER REFERENCES financeiro_categorias(id),
      descricao TEXT NOT NULL,
      valor REAL NOT NULL,
      status TEXT NOT NULL DEFAULT 'pendente',
      vencimento TEXT,
      data_pagamento TEXT,
      fornecedor_id INTEGER REFERENCES fornecedores(id),
      cliente_id INTEGER REFERENCES clientes(id),
      compra_id INTEGER REFERENCES pedidos_compra(id),
      ordem_id INTEGER REFERENCES ordens_producao(id),
      observacoes TEXT,
      criado_em TEXT NOT NULL DEFAULT (datetime('now')),
      atualizado_em TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE UNIQUE INDEX IF NOT EXISTS financeiro_lancamentos_compra_unique
      ON financeiro_lancamentos (compra_id)
      WHERE compra_id IS NOT NULL AND tipo = 'pagar';

    CREATE TABLE IF NOT EXISTS pedidos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      codigo TEXT,
      cliente_id INTEGER NOT NULL REFERENCES clientes(id),
      data_pedido TEXT NOT NULL,
      data_prevista TEXT,
      status TEXT NOT NULL DEFAULT 'orcamento',
      prioridade TEXT NOT NULL DEFAULT 'normal',
      observacoes TEXT,
      subtotal REAL NOT NULL DEFAULT 0,
      desconto REAL NOT NULL DEFAULT 0,
      frete REAL NOT NULL DEFAULT 0,
      total REAL NOT NULL DEFAULT 0,
      criado_em TEXT NOT NULL DEFAULT (datetime('now')),
      atualizado_em TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE UNIQUE INDEX IF NOT EXISTS pedidos_codigo_unique
      ON pedidos (codigo)
      WHERE codigo IS NOT NULL AND codigo != '';

    CREATE TABLE IF NOT EXISTS pedido_itens (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      pedido_id INTEGER NOT NULL REFERENCES pedidos(id) ON DELETE CASCADE,
      produto_id INTEGER NOT NULL REFERENCES produtos(id),
      variante_id INTEGER REFERENCES produto_variantes(id),
      quantidade INTEGER NOT NULL,
      preco_unitario REAL NOT NULL,
      desconto REAL NOT NULL DEFAULT 0,
      total REAL NOT NULL,
      quantidade_reservada INTEGER NOT NULL DEFAULT 0,
      criado_em TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS expedicoes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      pedido_id INTEGER NOT NULL UNIQUE REFERENCES pedidos(id) ON DELETE CASCADE,
      status TEXT NOT NULL DEFAULT 'pronto_envio',
      data_pronta TEXT,
      data_expedicao TEXT,
      data_entrega TEXT,
      observacoes TEXT,
      criado_em TEXT NOT NULL DEFAULT (datetime('now')),
      atualizado_em TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS expedicoes_status ON expedicoes (status);
  `);

  const finCols = db
    .prepare(`PRAGMA table_info(financeiro_lancamentos)`)
    .all() as { name: string }[];
  if (!finCols.some((col) => col.name === 'pedido_id')) {
    db.exec(
      `ALTER TABLE financeiro_lancamentos ADD COLUMN pedido_id INTEGER REFERENCES pedidos(id)`,
    );
  }
  db.exec(`
    CREATE UNIQUE INDEX IF NOT EXISTS financeiro_lancamentos_pedido_unique
      ON financeiro_lancamentos (pedido_id)
      WHERE pedido_id IS NOT NULL AND tipo = 'receber';
  `);

  const ordemAtual = db
    .prepare(`PRAGMA table_info(ordens_producao)`)
    .all() as { name: string }[];
  if (!ordemAtual.some((col) => col.name === 'pedido_id')) {
    db.exec(
      `ALTER TABLE ordens_producao ADD COLUMN pedido_id INTEGER REFERENCES pedidos(id)`,
    );
  }
  if (!ordemAtual.some((col) => col.name === 'pedido_item_id')) {
    db.exec(
      `ALTER TABLE ordens_producao ADD COLUMN pedido_item_id INTEGER REFERENCES pedido_itens(id)`,
    );
  }

  db.exec(`
    INSERT OR IGNORE INTO financeiro_categorias (nome, tipo) VALUES
      ('Compras', 'pagar'),
      ('Frete', 'pagar'),
      ('Vendas', 'receber'),
      ('Serviços', 'ambos'),
      ('Outros', 'ambos');
  `);

  return db;
}
