-- PASSO 1: Executar no Supabase SQL Editor
-- Dashboard: https://supabase.com/dashboard → teu projeto → SQL Editor

-- Opção A (mais simples): Desligar RLS na tabela
ALTER TABLE betting_predictions DISABLE ROW LEVEL SECURITY;

-- Opção B (mais seguro): Adicionar policy que permite tudo via service_role
-- CREATE POLICY "Allow all" ON betting_predictions FOR ALL USING (true) WITH CHECK (true);

-- PASSO 2: Adicionar colunas novas (odd 1X e empate)
ALTER TABLE betting_predictions
  ADD COLUMN IF NOT EXISTS odd_draw numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS odd_1x numeric DEFAULT 0;

-- VERIFICAR: Ver se há dados na tabela
SELECT COUNT(*) FROM betting_predictions;
SELECT team_home, team_away, odd, confidence, created_at 
FROM betting_predictions 
ORDER BY created_at DESC 
LIMIT 10;
