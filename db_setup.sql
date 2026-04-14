-- Cria a Tabela da Carteira (Wallet)
CREATE TABLE IF NOT EXISTS wallets (
  id integer PRIMARY KEY DEFAULT 1,
  balance numeric NOT NULL DEFAULT 100.00,
  currency text NOT NULL DEFAULT 'EUR',
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Insere logo o teu balanço mágico inicial de 100 euros (se ainda não existir)
INSERT INTO wallets (id, balance) VALUES (1, 100.00) ON CONFLICT DO NOTHING;

-- Cria a Tabela onde os teus Boletins (Múltiplas Globais) ficam gravados
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
-- Cria a Tabela de Previsões (Onde o teu scraper local guarda os jogos)
CREATE TABLE IF NOT EXISTS betting_predictions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  team_home text NOT NULL,
  team_away text NOT NULL,
  odd numeric NOT NULL,
  time text NOT NULL,
  confidence integer NOT NULL,
  reasoning text,
  session_id text,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);
