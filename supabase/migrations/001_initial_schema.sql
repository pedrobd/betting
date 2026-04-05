-- ============================================================
-- BETANO ANALYSIS ENGINE - Supabase Initial Schema
-- Migration: 001_initial_schema.sql
-- ============================================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================
-- TABLE: banca
-- Stores current bankroll state
-- ============================================================
CREATE TABLE IF NOT EXISTS banca (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  saldo_atual   NUMERIC(12, 2)  NOT NULL DEFAULT 0.00,
  moeda         VARCHAR(3)      NOT NULL DEFAULT 'EUR',
  data_atualizacao TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  saldo_inicio_dia NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
  perda_diaria_atual NUMERIC(12, 2) NOT NULL DEFAULT 0.00
);

-- Ensure only one bankroll row (singleton pattern)
CREATE UNIQUE INDEX IF NOT EXISTS banca_singleton ON banca ((true));

-- Seed initial bankroll record (1000€)
INSERT INTO banca (saldo_atual, moeda, saldo_inicio_dia, perda_diaria_atual)
VALUES (1000.00, 'EUR', 1000.00, 0.00)
ON CONFLICT DO NOTHING;

-- ============================================================
-- TABLE: historico_apostas
-- Full audit trail of all bets placed
-- ============================================================
CREATE TABLE IF NOT EXISTS historico_apostas (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  jogo            VARCHAR(255)    NOT NULL,
  estrategia      VARCHAR(100)    NOT NULL, -- 'dutching' | 'funil_cantos'
  stake           NUMERIC(10, 2)  NOT NULL,
  odd             NUMERIC(8, 4)   NOT NULL,
  resultado       VARCHAR(10)     CHECK (resultado IN ('win', 'loss', 'pending', 'void')),
  lucro_prejuizo  NUMERIC(10, 2)  DEFAULT 0.00,
  api_fixture_id  INTEGER,        -- API-Football fixture ID for auto-update
  data_aposta     TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
  data_resultado  TIMESTAMPTZ,
  metadata        JSONB           DEFAULT '{}'::jsonb
);

-- Index for cron job result updates
CREATE INDEX IF NOT EXISTS idx_historico_fixture ON historico_apostas (api_fixture_id)
  WHERE resultado = 'pending';

CREATE INDEX IF NOT EXISTS idx_historico_estrategia ON historico_apostas (estrategia, data_aposta DESC);

-- ============================================================
-- TABLE: oportunidades
-- Detected opportunities queue
-- ============================================================
CREATE TABLE IF NOT EXISTS oportunidades (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tipo_estrategia  VARCHAR(100)  NOT NULL, -- 'dutching_resultado_correto' | 'funil_cantos'
  msg_alerta       TEXT          NOT NULL,
  valor_sugerido_euro NUMERIC(10, 2) NOT NULL,
  api_fixture_id   INTEGER,
  status           VARCHAR(20)   NOT NULL DEFAULT 'ativa' CHECK (status IN ('ativa', 'executada', 'expirada', 'recusada')),
  criada_em        TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  expira_em        TIMESTAMPTZ,
  metadata         JSONB         DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_oportunidades_status ON oportunidades (status, criada_em DESC);
CREATE INDEX IF NOT EXISTS idx_oportunidades_fixture ON oportunidades (api_fixture_id);

-- ============================================================
-- TABLE: daily_snapshot (auto-managed by cron)
-- Daily bankroll snapshots for stop-loss calculation
-- ============================================================
CREATE TABLE IF NOT EXISTS daily_snapshot (
  id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  data_snapshot  DATE            NOT NULL DEFAULT CURRENT_DATE,
  saldo_inicio   NUMERIC(12, 2)  NOT NULL,
  saldo_fim      NUMERIC(12, 2),
  total_apostas  INTEGER         DEFAULT 0,
  resultado_dia  NUMERIC(12, 2)  DEFAULT 0.00
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_snapshot_date ON daily_snapshot (data_snapshot);

-- ============================================================
-- FUNCTION: update_daily_loss
-- Recalculates daily loss on every bet update
-- ============================================================
CREATE OR REPLACE FUNCTION update_daily_loss()
RETURNS TRIGGER AS $$
DECLARE
  v_saldo_inicio NUMERIC;
  v_perda_atual  NUMERIC;
BEGIN
  -- Get today's opening balance
  SELECT saldo_inicio_dia INTO v_saldo_inicio FROM banca LIMIT 1;

  -- Calculate today's profit/loss from resolved bets
  SELECT COALESCE(SUM(lucro_prejuizo), 0) INTO v_perda_atual
  FROM historico_apostas
  WHERE resultado IN ('win', 'loss')
    AND DATE(data_resultado) = CURRENT_DATE;

  -- Update banca with current daily loss
  UPDATE banca
  SET perda_diaria_atual = CASE WHEN v_perda_atual < 0 THEN ABS(v_perda_atual) ELSE 0 END,
      data_atualizacao = NOW();

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE TRIGGER trg_update_daily_loss
AFTER INSERT OR UPDATE ON historico_apostas
FOR EACH ROW
EXECUTE FUNCTION update_daily_loss();

-- ============================================================
-- FUNCTION: reset_daily_snapshot
-- Called by cron at midnight to reset daily counters
-- ============================================================
CREATE OR REPLACE FUNCTION reset_daily_snapshot()
RETURNS VOID AS $$
DECLARE
  v_saldo NUMERIC;
BEGIN
  SELECT saldo_atual INTO v_saldo FROM banca LIMIT 1;

  -- Insert yesterday's snapshot
  INSERT INTO daily_snapshot (data_snapshot, saldo_inicio, saldo_fim)
  VALUES (CURRENT_DATE - INTERVAL '1 day', v_saldo, v_saldo)
  ON CONFLICT (data_snapshot) DO UPDATE SET saldo_fim = EXCLUDED.saldo_fim;

  -- Reset daily counters
  UPDATE banca
  SET saldo_inicio_dia = v_saldo,
      perda_diaria_atual = 0.00,
      data_atualizacao = NOW();
END;
$$ LANGUAGE plpgsql;
