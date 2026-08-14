-- ============================================================================
-- MercadoERP — Migração inicial (0001)
-- PostgreSQL 15+ · UUID PKs · Soft delete · Multi-tenant (empresa_id)
-- Rode sempre dentro de uma transação: psql -f 0001_init.sql
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";   -- gen_random_uuid()

-- ─────────────────────────────────────────────
-- Tipos ENUM (domínio fiscal)
-- ─────────────────────────────────────────────
CREATE TYPE ambiente_enum        AS ENUM ('homologacao', 'producao');
CREATE TYPE modelo_nf_enum        AS ENUM ('55', '65');
CREATE TYPE regime_enum           AS ENUM ('1', '2', '3');
CREATE TYPE crt_enum              AS ENUM ('1', '2', '3');
CREATE TYPE role_enum             AS ENUM ('dono', 'gerente', 'atendente');
CREATE TYPE status_nota_enum      AS ENUM (
  'RASCUNHO', 'VALIDADA', 'XML_GERADO', 'ASSINADA',
  'FILA_ENVIO', 'ENVIADA', 'PROCESSANDO',
  'AUTORIZADA', 'REJEITADA', 'CANCELADA', 'DENEGADA', 'INUTILIZADA'
);
CREATE TYPE forma_pagamento_enum  AS ENUM ('DINHEIRO','PIX','DEBITO','CREDITO','FIADO','SEM_PAGAMENTO');
CREATE TYPE tipo_evento_enum      AS ENUM ('110111','110110','210200','210210','210220','210240');
CREATE TYPE status_evento_enum   AS ENUM ('pendente','autorizado','rejeitado');
CREATE TYPE status_cert_enum     AS ENUM ('valido','expirado','invalido');
CREATE TYPE unidade_enum         AS ENUM ('un','kg','lt','cx','pct','ml','g');
CREATE TYPE origem_enum          AS ENUM ('0','1','2','3','4','5','6','7','8');

-- ─────────────────────────────────────────────
-- 1. empresas
-- ─────────────────────────────────────────────
CREATE TABLE empresas (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cnpj          VARCHAR(14) UNIQUE NOT NULL,
  ie            VARCHAR(20),
  razao_social  VARCHAR(255) NOT NULL,
  crt           crt_enum NOT NULL DEFAULT '1',
  uf            CHAR(2) NOT NULL,
  ambiente      ambiente_enum NOT NULL DEFAULT 'homologacao',
  regime        regime_enum NOT NULL DEFAULT '1',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at    TIMESTAMPTZ
);

-- ─────────────────────────────────────────────
-- 2. usuarios
-- ─────────────────────────────────────────────
CREATE TABLE usuarios (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id    UUID NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  nome          VARCHAR(255) NOT NULL,
  email         VARCHAR(255) NOT NULL,
  senha_hash    VARCHAR(255) NOT NULL,            -- Argon2
  role          role_enum NOT NULL DEFAULT 'atendente',
  refresh_token VARCHAR(255),
  ativo         BOOLEAN NOT NULL DEFAULT TRUE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at    TIMESTAMPTZ,
  UNIQUE (empresa_id, email)
);

-- ─────────────────────────────────────────────
-- 3. certificados
-- ─────────────────────────────────────────────
CREATE TABLE certificados (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id      UUID NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  alias           VARCHAR(100) NOT NULL,
  arquivo_uri     TEXT NOT NULL,                  -- caminho criptografado AES-256
  validade        TIMESTAMPTZ NOT NULL,
  status          status_cert_enum NOT NULL DEFAULT 'valido',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (empresa_id, alias)
);
-- senha do PFX NÃO é persistida — gerenciada via Secret Manager

-- ─────────────────────────────────────────────
-- 4. clientes
-- ─────────────────────────────────────────────
CREATE TABLE clientes (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id     UUID NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  nome           VARCHAR(255) NOT NULL,
  cpf_cnpj       VARCHAR(14),
  telefone       VARCHAR(20),
  email          VARCHAR(255),
  logradouro     VARCHAR(255),
  numero         VARCHAR(20),
  complemento    VARCHAR(100),
  bairro         VARCHAR(100),
  municipio      VARCHAR(100),
  uf             CHAR(2),
  cep            VARCHAR(8),
  saldo_devedor  NUMERIC(14,2) NOT NULL DEFAULT 0,
  limite_credito NUMERIC(14,2) NOT NULL DEFAULT 0,
  status         VARCHAR(10) NOT NULL DEFAULT 'ativo',
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at     TIMESTAMPTZ
);
CREATE INDEX idx_clientes_empresa ON clientes(empresa_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_clientes_cpf_cnpj ON clientes(empresa_id, cpf_cnpj) WHERE deleted_at IS NULL;

-- ─────────────────────────────────────────────
-- 5. categorias
-- ─────────────────────────────────────────────
CREATE TABLE categorias (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id  UUID NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  nome        VARCHAR(100) NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at  TIMESTAMPTZ,
  UNIQUE (empresa_id, nome)
);

-- ─────────────────────────────────────────────
-- 6. transportadora
-- ─────────────────────────────────────────────
CREATE TABLE transportadora (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id  UUID NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  nome        VARCHAR(255) NOT NULL,
  cnpj        VARCHAR(14),
  ie          VARCHAR(20),
  endereco    VARCHAR(255),
  uf          CHAR(2),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at  TIMESTAMPTZ
);

-- ─────────────────────────────────────────────
-- 7. produtos
-- ─────────────────────────────────────────────
CREATE TABLE produtos (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id    UUID NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  categoria_id  UUID REFERENCES categorias(id),
  nome          VARCHAR(255) NOT NULL,
  codigo_barras  VARCHAR(20),
  ncm           CHAR(8) NOT NULL,
  cest          VARCHAR(10),
  cfop          VARCHAR(4) NOT NULL,
  unidade       unidade_enum NOT NULL DEFAULT 'un',
  preco_custo   NUMERIC(14,2) NOT NULL DEFAULT 0,
  preco_venda   NUMERIC(14,2) NOT NULL DEFAULT 0,
  estoque       NUMERIC(14,3) NOT NULL DEFAULT 0,
  estoque_minimo NUMERIC(14,3) NOT NULL DEFAULT 5,
  cst           VARCHAR(3) NOT NULL DEFAULT '00',
  csosn         VARCHAR(3) DEFAULT '102',
  origem        origem_enum NOT NULL DEFAULT '0',
  aliq_icms     NUMERIC(5,2) NOT NULL DEFAULT 0,
  aliq_pis     NUMERIC(5,2) NOT NULL DEFAULT 0,
  aliq_cofins  NUMERIC(5,2) NOT NULL DEFAULT 0,
  aliq_ipi     NUMERIC(5,2) NOT NULL DEFAULT 0,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at    TIMESTAMPTZ
);
CREATE INDEX idx_produtos_empresa ON produtos(empresa_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_produtos_codigobarras ON produtos(empresa_id, codigo_barras) WHERE deleted_at IS NULL;

-- ─────────────────────────────────────────────
-- 8. tributacao
-- ─────────────────────────────────────────────
CREATE TABLE tributacao (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id  UUID NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  produto_id  UUID NOT NULL REFERENCES produtos(id) ON DELETE CASCADE,
  cst         VARCHAR(3) NOT NULL,
  csosn       VARCHAR(3),
  cfop        VARCHAR(4) NOT NULL,
  ncm         CHAR(8) NOT NULL,
  cest        VARCHAR(10),
  origem      origem_enum NOT NULL DEFAULT '0',
  aliq_icms   NUMERIC(5,2) NOT NULL DEFAULT 0,
  aliq_pis    NUMERIC(5,2) NOT NULL DEFAULT 0,
  aliq_cofins NUMERIC(5,2) NOT NULL DEFAULT 0,
  aliq_ipi    NUMERIC(5,2) NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_tributacao_produto ON tributacao(produto_id);

-- ─────────────────────────────────────────────
-- 9. cfop (master data)
-- ─────────────────────────────────────────────
CREATE TABLE cfop (
  codigo    VARCHAR(4) PRIMARY KEY,
  descricao VARCHAR(255) NOT NULL,
  tipo      VARCHAR(1) NOT NULL CHECK (tipo IN ('0','1','2','3')) -- 0=entrada,1=saida...
);

-- ─────────────────────────────────────────────
-- 10. ncm (master data)
-- ─────────────────────────────────────────────
CREATE TABLE ncm (
  codigo      CHAR(8) PRIMARY KEY,
  descricao   VARCHAR(500) NOT NULL,
  aliq_pis    NUMERIC(5,2) DEFAULT 0,
  aliq_cofins NUMERIC(5,2) DEFAULT 0
);

-- ─────────────────────────────────────────────
-- 11. cest (master data)
-- ─────────────────────────────────────────────
CREATE TABLE cest (
  codigo  VARCHAR(10) PRIMARY KEY,
  ncm     CHAR(8) NOT NULL,
  descricao VARCHAR(500) NOT NULL
);

-- ─────────────────────────────────────────────
-- 12. numeracao (controle por empresa/serie/modelo)
-- ─────────────────────────────────────────────
CREATE TABLE numeracao (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id    UUID NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  serie         VARCHAR(3) NOT NULL,
  modelo        modelo_nf_enum NOT NULL,
  ultimo_numero INTEGER NOT NULL DEFAULT 0,
  ano           INTEGER NOT NULL DEFAULT date_part('year', now())::int,
  version       INTEGER NOT NULL DEFAULT 1,      -- lock otimista
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (empresa_id, serie, modelo, ano)
);

-- ─────────────────────────────────────────────
-- 13. notas
-- ─────────────────────────────────────────────
CREATE TABLE notas (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id      UUID NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  cliente_id      UUID REFERENCES clientes(id),
  transportadora_id UUID REFERENCES transportadora(id),
  numero          VARCHAR(9) NOT NULL,
  serie           VARCHAR(3) NOT NULL,
  modelo          modelo_nf_enum NOT NULL,
  chave           CHAR(44),
  forma_emissao   VARCHAR(1) NOT NULL DEFAULT '1',
  protocolo       VARCHAR(20),
  recibo          VARCHAR(20),
  status          status_nota_enum NOT NULL DEFAULT 'RASCUNHO',
  valor_total     NUMERIC(14,2) NOT NULL DEFAULT 0,
  data_emissao    TIMESTAMPTZ NOT NULL DEFAULT now(),
  ambiente        ambiente_enum NOT NULL DEFAULT 'homologacao',
  motivo_rejeicao TEXT,
  usuario_id      UUID REFERENCES usuarios(id),
  venda_id        VARCHAR(36),                    -- referência ao ERP/Base44
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at      TIMESTAMPTZ,
  UNIQUE (empresa_id, serie, modelo, numero)
);
CREATE INDEX idx_notas_empresa_status ON notas(empresa_id, status) WHERE deleted_at IS NULL;
CREATE INDEX idx_notas_chave ON notas(chave);
CREATE INDEX idx_notas_data ON notas(empresa_id, data_emissao DESC) WHERE deleted_at IS NULL;

-- ─────────────────────────────────────────────
-- 14. nota_itens
-- ─────────────────────────────────────────────
CREATE TABLE nota_itens (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nota_id       UUID NOT NULL REFERENCES notas(id) ON DELETE CASCADE,
  produto_id    UUID REFERENCES produtos(id),
  produto_nome  VARCHAR(255) NOT NULL,
  ncm           CHAR(8) NOT NULL,
  cfop          VARCHAR(4) NOT NULL,
  cst           VARCHAR(3) NOT NULL,
  csosn         VARCHAR(3),
  origem        origem_enum NOT NULL DEFAULT '0',
  quantidade    NUMERIC(14,3) NOT NULL,
  valor_unitario NUMERIC(14,2) NOT NULL,
  valor_total   NUMERIC(14,2) NOT NULL,
  aliq_icms     NUMERIC(5,2) NOT NULL DEFAULT 0,
  aliq_pis      NUMERIC(5,2) NOT NULL DEFAULT 0,
  aliq_cofins   NUMERIC(5,2) NOT NULL DEFAULT 0,
  aliq_ipi      NUMERIC(5,2) NOT NULL DEFAULT 0
);
CREATE INDEX idx_nota_itens_nota ON nota_itens(nota_id);

-- ─────────────────────────────────────────────
-- 15. pagamentos
-- ─────────────────────────────────────────────
CREATE TABLE pagamentos (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nota_id      UUID NOT NULL REFERENCES notas(id) ON DELETE CASCADE,
  forma        forma_pagamento_enum NOT NULL,
  valor        NUMERIC(14,2) NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_pagamentos_nota ON pagamentos(nota_id);

-- ─────────────────────────────────────────────
-- 16. eventos (cancelamento, CC-e, manifestação, inutilização)
-- ─────────────────────────────────────────────
CREATE TABLE eventos (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id    UUID NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  nota_id       UUID REFERENCES notas(id) ON DELETE CASCADE,
  chave         CHAR(44),
  tipo          tipo_evento_enum NOT NULL,
  sequencia     INTEGER NOT NULL DEFAULT 1,
  protocolo     VARCHAR(20),
  status        status_evento_enum NOT NULL DEFAULT 'pendente',
  motivo        TEXT,
  xml_uri       TEXT,
  data_registro TIMESTAMPTZ NOT NULL DEFAULT now(),
  correlation_id VARCHAR(36)
);
CREATE INDEX idx_eventos_nota ON eventos(nota_id);

-- ─────────────────────────────────────────────
-- 17. xmls (XMLs enviados/recebidos — append-only)
-- ─────────────────────────────────────────────
CREATE TABLE xmls (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nota_id     UUID REFERENCES notas(id) ON DELETE CASCADE,
  chave       CHAR(44),
  tipo        VARCHAR(20) NOT NULL CHECK (tipo IN ('enviado','autorizado','cancelado','cce','inutilizacao')),
  conteudo    TEXT NOT NULL,
  uri         TEXT,                               -- S3/R2 path (opcional, se não em coluna)
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_xmls_nota ON xmls(nota_id);
CREATE INDEX idx_xmls_chave ON xmls(chave);

-- ─────────────────────────────────────────────
-- 18. danfes
-- ─────────────────────────────────────────────
CREATE TABLE danfes (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nota_id     UUID NOT NULL REFERENCES notas(id) ON DELETE CASCADE,
  chave       CHAR(44) NOT NULL,
  uri         TEXT NOT NULL,                       -- S3/R2 path
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_danfes_nota ON danfes(nota_id);
CREATE UNIQUE INDEX idx_danfes_chave ON danfes(chave);

-- ─────────────────────────────────────────────
-- 19. logs (estruturados)
-- ─────────────────────────────────────────────
CREATE TABLE logs (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id    UUID REFERENCES empresas(id) ON DELETE CASCADE,
  servico       VARCHAR(100) NOT NULL,
  acao          VARCHAR(100) NOT NULL,
  nivel         VARCHAR(10) NOT NULL DEFAULT 'INFO',
  status        VARCHAR(10) NOT NULL DEFAULT 'sucesso',
  mensagem      TEXT,
  payload_hash  VARCHAR(64),
  ip            VARCHAR(45),
  correlation_id VARCHAR(36),
  duracao_ms    INTEGER,
  timestamp     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_logs_correlation ON logs(correlation_id);
CREATE INDEX idx_logs_empresa_data ON logs(empresa_id, timestamp DESC);

-- ─────────────────────────────────────────────
-- 20. auditoria (append-only, imutável)
-- ─────────────────────────────────────────────
CREATE TABLE auditoria (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  correlation_id VARCHAR(36) NOT NULL,
  empresa_id    UUID REFERENCES empresas(id) ON DELETE CASCADE,
  usuario_id    UUID REFERENCES usuarios(id),
  servico       VARCHAR(100) NOT NULL,
  acao          VARCHAR(100) NOT NULL,
  recurso       VARCHAR(100),
  recurso_id    UUID,
  nivel         VARCHAR(10) NOT NULL DEFAULT 'INFO',
  status        VARCHAR(10) NOT NULL DEFAULT 'sucesso',
  payload_hash  VARCHAR(64),
  metadata      JSONB,
  ip            VARCHAR(45),
  duracao_ms    INTEGER,
  timestamp     TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- Append-only: bloqueia UPDATE/DELETE
CREATE OR REPLACE FUNCTION auditoria_immutable() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'auditoria é append-only: operação % não permitida', TG_OP;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER auditoria_no_update BEFORE UPDATE OR DELETE ON auditoria
  FOR EACH ROW EXECUTE FUNCTION auditoria_immutable();
CREATE INDEX idx_auditoria_correlation ON auditoria(correlation_id);
CREATE INDEX idx_auditoria_empresa_data ON auditoria(empresa_id, timestamp DESC);

-- ─────────────────────────────────────────────
-- Trigger automático: updated_at
-- ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION set_updated_at() RETURNS trigger AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$ LANGUAGE plpgsql;
-- Aplicar a todas as tabelas com updated_at
DO $$
DECLARE t TEXT;
BEGIN
  FOR t IN SELECT unnest(ARRAY[
    'empresas','usuarios','clientes','categorias','transportadora','produtos',
    'tributacao','numeracao','notas','certificados'
  ])
  LOOP
    EXECUTE format('CREATE TRIGGER set_updated_at BEFORE UPDATE ON %I
      FOR EACH ROW EXECUTE FUNCTION set_updated_at();', t);
  END LOOP;
END $$;

-- Fim da migração 0001