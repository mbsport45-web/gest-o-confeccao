-- Isolamento por empresa no PostgreSQL.
-- O dono da tabela continua podendo copiar os dados (RLS sem FORCE).
-- A API em execução ainda não usa esta conexão.

CREATE OR REPLACE FUNCTION app_empresa_id() RETURNS integer
LANGUAGE sql
STABLE
AS $$
  SELECT NULLIF(current_setting('app.empresa_id', true), '')::integer;
$$;

-- Consulta de login para uma fase futura, sem mudar a autenticação atual.
CREATE OR REPLACE FUNCTION buscar_usuario_login(p_email text)
RETURNS TABLE (
  id integer,
  empresa_id integer,
  nome text,
  email text,
  senha_hash text,
  papel text,
  status text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id, empresa_id, nome, email, senha_hash, papel, status
  FROM usuarios
  WHERE lower(email) = lower(p_email);
$$;

REVOKE ALL ON FUNCTION buscar_usuario_login(text) FROM PUBLIC;

ALTER TABLE empresas ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS empresas_empresa ON empresas;
CREATE POLICY empresas_empresa ON empresas
  USING (id = app_empresa_id())
  WITH CHECK (id = app_empresa_id());

ALTER TABLE aviamentos ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS aviamentos_empresa ON aviamentos;
CREATE POLICY aviamentos_empresa ON aviamentos
  USING (empresa_id = app_empresa_id())
  WITH CHECK (empresa_id = app_empresa_id());

ALTER TABLE clientes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS clientes_empresa ON clientes;
CREATE POLICY clientes_empresa ON clientes
  USING (empresa_id = app_empresa_id())
  WITH CHECK (empresa_id = app_empresa_id());

ALTER TABLE cores_cadastro ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS cores_cadastro_empresa ON cores_cadastro;
CREATE POLICY cores_cadastro_empresa ON cores_cadastro
  USING (empresa_id = app_empresa_id())
  WITH CHECK (empresa_id = app_empresa_id());

ALTER TABLE documentos_importados ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS documentos_importados_empresa ON documentos_importados;
CREATE POLICY documentos_importados_empresa ON documentos_importados
  USING (empresa_id = app_empresa_id())
  WITH CHECK (empresa_id = app_empresa_id());

ALTER TABLE fornecedores ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS fornecedores_empresa ON fornecedores;
CREATE POLICY fornecedores_empresa ON fornecedores
  USING (empresa_id = app_empresa_id())
  WITH CHECK (empresa_id = app_empresa_id());

ALTER TABLE materias_primas ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS materias_primas_empresa ON materias_primas;
CREATE POLICY materias_primas_empresa ON materias_primas
  USING (empresa_id = app_empresa_id())
  WITH CHECK (empresa_id = app_empresa_id());

ALTER TABLE produtos ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS produtos_empresa ON produtos;
CREATE POLICY produtos_empresa ON produtos
  USING (empresa_id = app_empresa_id())
  WITH CHECK (empresa_id = app_empresa_id());

ALTER TABLE tamanhos_cadastro ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tamanhos_cadastro_empresa ON tamanhos_cadastro;
CREATE POLICY tamanhos_cadastro_empresa ON tamanhos_cadastro
  USING (empresa_id = app_empresa_id())
  WITH CHECK (empresa_id = app_empresa_id());

ALTER TABLE aviamento_variantes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS aviamento_variantes_empresa ON aviamento_variantes;
CREATE POLICY aviamento_variantes_empresa ON aviamento_variantes
  USING (empresa_id = app_empresa_id())
  WITH CHECK (empresa_id = app_empresa_id());

ALTER TABLE pedidos ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS pedidos_empresa ON pedidos;
CREATE POLICY pedidos_empresa ON pedidos
  USING (empresa_id = app_empresa_id())
  WITH CHECK (empresa_id = app_empresa_id());

ALTER TABLE eventos_assinatura ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS eventos_assinatura_empresa ON eventos_assinatura;
CREATE POLICY eventos_assinatura_empresa ON eventos_assinatura
  USING (empresa_id = app_empresa_id())
  WITH CHECK (empresa_id = app_empresa_id());

ALTER TABLE eventos_webhook_pagamento ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS eventos_webhook_pagamento_empresa ON eventos_webhook_pagamento;
CREATE POLICY eventos_webhook_pagamento_empresa ON eventos_webhook_pagamento
  USING (empresa_id = app_empresa_id())
  WITH CHECK (empresa_id = app_empresa_id());

ALTER TABLE usuarios ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS usuarios_empresa ON usuarios;
CREATE POLICY usuarios_empresa ON usuarios
  USING (empresa_id = app_empresa_id())
  WITH CHECK (empresa_id = app_empresa_id());

ALTER TABLE pedidos_compra ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS pedidos_compra_empresa ON pedidos_compra;
CREATE POLICY pedidos_compra_empresa ON pedidos_compra
  USING (empresa_id = app_empresa_id())
  WITH CHECK (empresa_id = app_empresa_id());

ALTER TABLE assinaturas ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS assinaturas_empresa ON assinaturas;
CREATE POLICY assinaturas_empresa ON assinaturas
  USING (empresa_id = app_empresa_id())
  WITH CHECK (empresa_id = app_empresa_id());

ALTER TABLE produto_variantes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS produto_variantes_empresa ON produto_variantes;
CREATE POLICY produto_variantes_empresa ON produto_variantes
  USING (empresa_id = app_empresa_id())
  WITH CHECK (empresa_id = app_empresa_id());

ALTER TABLE aviamento_saldos ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS aviamento_saldos_empresa ON aviamento_saldos;
CREATE POLICY aviamento_saldos_empresa ON aviamento_saldos
  USING (empresa_id = app_empresa_id())
  WITH CHECK (empresa_id = app_empresa_id());

ALTER TABLE expedicoes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS expedicoes_empresa ON expedicoes;
CREATE POLICY expedicoes_empresa ON expedicoes
  USING (empresa_id = app_empresa_id())
  WITH CHECK (empresa_id = app_empresa_id());

ALTER TABLE convites ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS convites_empresa ON convites;
CREATE POLICY convites_empresa ON convites
  USING (empresa_id = app_empresa_id())
  WITH CHECK (empresa_id = app_empresa_id());

ALTER TABLE estoque_saldos ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS estoque_saldos_empresa ON estoque_saldos;
CREATE POLICY estoque_saldos_empresa ON estoque_saldos
  USING (empresa_id = app_empresa_id())
  WITH CHECK (empresa_id = app_empresa_id());

ALTER TABLE ficha_tecnica_itens ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS ficha_tecnica_itens_empresa ON ficha_tecnica_itens;
CREATE POLICY ficha_tecnica_itens_empresa ON ficha_tecnica_itens
  USING (empresa_id = app_empresa_id())
  WITH CHECK (empresa_id = app_empresa_id());

ALTER TABLE pedido_compra_itens ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS pedido_compra_itens_empresa ON pedido_compra_itens;
CREATE POLICY pedido_compra_itens_empresa ON pedido_compra_itens
  USING (empresa_id = app_empresa_id())
  WITH CHECK (empresa_id = app_empresa_id());

ALTER TABLE pedido_itens ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS pedido_itens_empresa ON pedido_itens;
CREATE POLICY pedido_itens_empresa ON pedido_itens
  USING (empresa_id = app_empresa_id())
  WITH CHECK (empresa_id = app_empresa_id());

ALTER TABLE produto_bom_itens ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS produto_bom_itens_empresa ON produto_bom_itens;
CREATE POLICY produto_bom_itens_empresa ON produto_bom_itens
  USING (empresa_id = app_empresa_id())
  WITH CHECK (empresa_id = app_empresa_id());

ALTER TABLE aviamento_movimentos ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS aviamento_movimentos_empresa ON aviamento_movimentos;
CREATE POLICY aviamento_movimentos_empresa ON aviamento_movimentos
  USING (empresa_id = app_empresa_id())
  WITH CHECK (empresa_id = app_empresa_id());

ALTER TABLE estoque_movimentos ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS estoque_movimentos_empresa ON estoque_movimentos;
CREATE POLICY estoque_movimentos_empresa ON estoque_movimentos
  USING (empresa_id = app_empresa_id())
  WITH CHECK (empresa_id = app_empresa_id());

ALTER TABLE ordens_producao ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS ordens_producao_empresa ON ordens_producao;
CREATE POLICY ordens_producao_empresa ON ordens_producao
  USING (empresa_id = app_empresa_id())
  WITH CHECK (empresa_id = app_empresa_id());

ALTER TABLE cortes_infesto ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS cortes_infesto_empresa ON cortes_infesto;
CREATE POLICY cortes_infesto_empresa ON cortes_infesto
  USING (empresa_id = app_empresa_id())
  WITH CHECK (empresa_id = app_empresa_id());

ALTER TABLE etapas_producao ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS etapas_producao_empresa ON etapas_producao;
CREATE POLICY etapas_producao_empresa ON etapas_producao
  USING (empresa_id = app_empresa_id())
  WITH CHECK (empresa_id = app_empresa_id());

ALTER TABLE financeiro_lancamentos ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS financeiro_lancamentos_empresa ON financeiro_lancamentos;
CREATE POLICY financeiro_lancamentos_empresa ON financeiro_lancamentos
  USING (empresa_id = app_empresa_id())
  WITH CHECK (empresa_id = app_empresa_id());

ALTER TABLE ordem_grade ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS ordem_grade_empresa ON ordem_grade;
CREATE POLICY ordem_grade_empresa ON ordem_grade
  USING (empresa_id = app_empresa_id())
  WITH CHECK (empresa_id = app_empresa_id());

ALTER TABLE ordem_requisitos ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS ordem_requisitos_empresa ON ordem_requisitos;
CREATE POLICY ordem_requisitos_empresa ON ordem_requisitos
  USING (empresa_id = app_empresa_id())
  WITH CHECK (empresa_id = app_empresa_id());

ALTER TABLE ordens_corte ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS ordens_corte_empresa ON ordens_corte;
CREATE POLICY ordens_corte_empresa ON ordens_corte
  USING (empresa_id = app_empresa_id())
  WITH CHECK (empresa_id = app_empresa_id());

ALTER TABLE corte_infesto_itens ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS corte_infesto_itens_empresa ON corte_infesto_itens;
CREATE POLICY corte_infesto_itens_empresa ON corte_infesto_itens
  USING (empresa_id = app_empresa_id())
  WITH CHECK (empresa_id = app_empresa_id());

ALTER TABLE ordem_corte_grade ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS ordem_corte_grade_empresa ON ordem_corte_grade;
CREATE POLICY ordem_corte_grade_empresa ON ordem_corte_grade
  USING (empresa_id = app_empresa_id())
  WITH CHECK (empresa_id = app_empresa_id());

ALTER TABLE sessoes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS sessoes_empresa ON sessoes;
CREATE POLICY sessoes_empresa ON sessoes
  USING (usuario_id IN (SELECT id FROM usuarios WHERE empresa_id = app_empresa_id()))
  WITH CHECK (usuario_id IN (SELECT id FROM usuarios WHERE empresa_id = app_empresa_id()));
