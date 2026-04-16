-- Migração: Adicionar colunas de xG, EV e Value Bet
ALTER TABLE betting_predictions
  ADD COLUMN IF NOT EXISTS home_form text,
  ADD COLUMN IF NOT EXISTS away_form text,
  ADD COLUMN IF NOT EXISTS home_pos integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS away_pos integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS odd_trend text DEFAULT 'stable',
  ADD COLUMN IF NOT EXISTS home_xg numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS away_xg numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS ev numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS is_value_bet boolean DEFAULT false;

-- Schema completo (para criação limpa)
-- Cria a Tabela da Carteira (Wallet)
CREATE TABLE IF NOT EXISTS wallets (
  id integer PRIMARY KEY DEFAULT 1,
  balance numeric NOT NULL DEFAULT 100.00,
  currency text NOT NULL DEFAULT 'EUR',
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

INSERT INTO wallets (id, balance) VALUES (1, 100.00) ON CONFLICT DO NOTHING;

-- Boletins
CREATE TABLE IF NOT EXISTS bet_slips (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  wallet_id integer REFERENCES wallets(id) DEFAULT 1,
  matches jsonb NOT NULL,
  stake numeric NOT NULL,
  total_odd numeric NOT NULL,
  potential_return numeric NOT NULL,
  status text NOT NULL DEFAULT 'PENDING',
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Previsões (schema completo atualizado)
CREATE TABLE IF NOT EXISTS betting_predictions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  team_home text NOT NULL,
  team_away text NOT NULL,
  odd numeric NOT NULL,
  time text NOT NULL,
  confidence numeric NOT NULL,
  reasoning text,
  session_id text,
  home_form text,
  away_form text,
  home_pos integer DEFAULT 0,
  away_pos integer DEFAULT 0,
  odd_trend text DEFAULT 'stable',
  home_xg numeric DEFAULT 0,
  away_xg numeric DEFAULT 0,
  ev numeric DEFAULT 0,
  is_value_bet boolean DEFAULT false,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  CONSTRAINT unique_match UNIQUE (team_home, team_away, time)
);
