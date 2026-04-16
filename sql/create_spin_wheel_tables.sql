CREATE TABLE IF NOT EXISTS players (
  id BIGSERIAL PRIMARY KEY,
  mobile_number TEXT NOT NULL UNIQUE,
  display_name TEXT,
  total_coins INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS rewards (
  id BIGSERIAL PRIMARY KEY,
  reward_key TEXT NOT NULL UNIQUE,
  label TEXT NOT NULL,
  reward_type TEXT NOT NULL,
  coin_value INTEGER NOT NULL DEFAULT 0,
  probability INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS spin_events (
  id BIGSERIAL PRIMARY KEY,
  player_id BIGINT NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  reward_id BIGINT REFERENCES rewards(id) ON DELETE SET NULL,
  reward_key TEXT NOT NULL,
  reward_label TEXT NOT NULL,
  coin_value INTEGER NOT NULL DEFAULT 0,
  spin_date DATE NOT NULL DEFAULT CURRENT_DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS transfer_requests (
  id BIGSERIAL PRIMARY KEY,
  player_id BIGINT NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  coins_requested INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_spin_events_player_date
  ON spin_events(player_id, spin_date);

CREATE INDEX IF NOT EXISTS idx_transfer_requests_player_status
  ON transfer_requests(player_id, status);

INSERT INTO rewards (reward_key, label, reward_type, coin_value, probability, is_active)
VALUES
  ('better_luck', 'Better Luck Next Time', 'message', 0, 40, TRUE),
  ('10_coins', '10 Coins', 'coins', 10, 30, TRUE),
  ('20_coins', '20 Coins', 'coins', 20, 15, TRUE),
  ('50_coins', '50 Coins', 'coins', 50, 10, TRUE),
  ('100_coins', '100 Coins', 'coins', 100, 4, TRUE),
  ('airpods', 'AirPods', 'prize', 0, 1, TRUE)
ON CONFLICT (reward_key) DO NOTHING;
