-- Tracking de resultados reais nas previsões
ALTER TABLE betting_predictions
  ADD COLUMN IF NOT EXISTS match_result text CHECK (match_result IN ('W', 'D', 'L')),
  ADD COLUMN IF NOT EXISTS result_home_score integer,
  ADD COLUMN IF NOT EXISTS result_away_score integer;
