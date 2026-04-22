-- Migração: Adicionar colunas de odds completas e margem do bookmaker
-- Executar no Supabase SQL Editor: https://supabase.com/dashboard → SQL Editor

ALTER TABLE betting_predictions
  ADD COLUMN IF NOT EXISTS odd_draw numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS odd_1x numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS odd_away numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS bk_margin numeric DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS match_result text CHECK (match_result IN ('W', 'D', 'L')),
  ADD COLUMN IF NOT EXISTS result_home_score integer,
  ADD COLUMN IF NOT EXISTS result_away_score integer;
