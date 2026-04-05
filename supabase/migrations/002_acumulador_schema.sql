-- ============================================================
-- BETANO ENGINE — Acumulador de Golos Schema
-- Migration: 002_acumulador_schema.sql
-- ============================================================

-- ============================================================
-- TABLE: acumulador_ciclos
-- Tracks each €5→€1000 progression cycle
-- ============================================================
CREATE TABLE IF NOT EXISTS acumulador_ciclos (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  stake_inicio     NUMERIC(10, 2)  NOT NULL DEFAULT 5.00,
  stake_atual      NUMERIC(10, 2)  NOT NULL DEFAULT 5.00,
  objetivo         NUMERIC(10, 2)  NOT NULL DEFAULT 1000.00,
  status           VARCHAR(20)     NOT NULL DEFAULT 'ativo'
                   CHECK (status IN ('ativo', 'concluido', 'perdido')),
  total_apostas    INTEGER         NOT NULL DEFAULT 0,
  criado_em        TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
  concluido_em     TIMESTAMPTZ
);

-- Only one active cycle at a time
CREATE UNIQUE INDEX IF NOT EXISTS idx_ciclo_ativo
  ON acumulador_ciclos (status)
  WHERE status = 'ativo';

CREATE INDEX IF NOT EXISTS idx_ciclos_historico
  ON acumulador_ciclos (criado_em DESC);

-- ============================================================
-- TABLE: acumulador_apostas
-- Each individual accumulator bet within a cycle
-- ============================================================
CREATE TABLE IF NOT EXISTS acumulador_apostas (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ciclo_id         UUID            NOT NULL REFERENCES acumulador_ciclos(id) ON DELETE CASCADE,
  stake            NUMERIC(10, 2)  NOT NULL,
  odd_total        NUMERIC(10, 4)  NOT NULL,
  selecoes         JSONB           NOT NULL DEFAULT '[]'::jsonb,
  -- selecoes: [{fixture_id, jogo, mercado, odd, probabilidade_estimada}]
  resultado        VARCHAR(10)     DEFAULT 'pending'
                   CHECK (resultado IN ('win', 'loss', 'pending', 'void')),
  retorno          NUMERIC(10, 2)  DEFAULT 0.00,
  lucro_prejuizo   NUMERIC(10, 2)  DEFAULT 0.00,
  criada_em        TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
  data_resultado   TIMESTAMPTZ,
  metadata         JSONB           DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_apostas_ciclo
  ON acumulador_apostas (ciclo_id, criada_em DESC);

CREATE INDEX IF NOT EXISTS idx_apostas_pending
  ON acumulador_apostas (resultado)
  WHERE resultado = 'pending';

-- ============================================================
-- Seed first active cycle (€5 start)
-- ============================================================
INSERT INTO acumulador_ciclos (id, stake_inicio, stake_atual, objetivo, status, total_apostas)
VALUES (gen_random_uuid(), 5.00, 5.00, 1000.00, 'ativo', 0)
ON CONFLICT DO NOTHING;
