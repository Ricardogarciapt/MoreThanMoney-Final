-- ============================================================
-- 026_mlm_system.sql
-- Sistema MLM Binário — MoreThanMoney
-- ============================================================

-- ── 1. Adicionar colunas MLM à tabela profiles ──────────────
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS mlm_sponsor_username TEXT,
  ADD COLUMN IF NOT EXISTS mlm_rank_id INT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS mlm_total_earned NUMERIC DEFAULT 0;

-- ── 2. mlm_settings (singleton, id=1) ───────────────────────
CREATE TABLE IF NOT EXISTS mlm_settings (
  id                     INT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  is_active              BOOLEAN DEFAULT false,
  direct_commission_pct  NUMERIC(5,2) DEFAULT 20.00,
  created_at             TIMESTAMPTZ DEFAULT NOW(),
  updated_at             TIMESTAMPTZ DEFAULT NOW()
);

-- Garantir que existe sempre exatamente uma linha
INSERT INTO mlm_settings (id, is_active, direct_commission_pct)
VALUES (1, false, 20.00)
ON CONFLICT (id) DO NOTHING;

-- RLS
ALTER TABLE mlm_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "mlm_settings_service_role" ON mlm_settings;
CREATE POLICY "mlm_settings_service_role"
  ON mlm_settings FOR ALL
  USING (true)
  WITH CHECK (true);

-- ── 3. mlm_ranks ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS mlm_ranks (
  id                  SERIAL PRIMARY KEY,
  name                TEXT NOT NULL,
  slug                TEXT UNIQUE NOT NULL,
  left_requirement    INT DEFAULT 0,
  right_requirement   INT DEFAULT 0,
  direct_requirement  INT DEFAULT 0,
  rank_bonus          NUMERIC(10,2) DEFAULT 0,
  monthly_residual    NUMERIC(10,2) DEFAULT 0,
  free_pack_months    INT DEFAULT 0,
  color               TEXT DEFAULT '#D2A63C',
  icon                TEXT DEFAULT '⭐',
  sort_order          INT DEFAULT 0,
  created_at          TIMESTAMPTZ DEFAULT NOW(),
  updated_at          TIMESTAMPTZ DEFAULT NOW()
);

-- RLS
ALTER TABLE mlm_ranks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "mlm_ranks_service_role" ON mlm_ranks;
CREATE POLICY "mlm_ranks_service_role"
  ON mlm_ranks FOR ALL
  USING (true)
  WITH CHECK (true);

-- Seed ranks
INSERT INTO mlm_ranks (name, slug, left_requirement, right_requirement, direct_requirement, rank_bonus, monthly_residual, free_pack_months, color, icon, sort_order)
VALUES
  ('Membro',          'membro',         0,   0,   0,  0,      0,       0, '#6B7280', '👤', 0),
  ('Cliente Ativo',   'cliente_ativo',   0,   0,   2,  0,      0,       1, '#10B981', '✅', 1),
  ('Distribuidor',    'distribuidor',    7,   7,   0,  500,    200,     0, '#3B82F6', '📦', 2),
  ('Líder',           'lider',          15,  15,   0,  1000,   1000,    0, '#8B5CF6', '🏆', 3),
  ('Gestor',          'gestor',         40,  40,   0,  2500,   2500,    0, '#F59E0B', '💼', 4),
  ('Diretor',         'diretor',       125, 125,   0,  7500,   7500,    0, '#EF4444', '🎯', 5),
  ('Embaixador',      'embaixador',    300, 300,   0,  20000,  20000,   0, '#D2A63C', '👑', 6)
ON CONFLICT (slug) DO NOTHING;

-- ── 4. mlm_nodes ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS mlm_nodes (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id              UUID UNIQUE NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  sponsor_id           UUID REFERENCES profiles(id) ON DELETE SET NULL,
  parent_node_id       UUID REFERENCES mlm_nodes(id) ON DELETE SET NULL,
  position             TEXT CHECK (position IN ('left', 'right')),
  left_child_id        UUID,
  right_child_id       UUID,
  left_count           INT DEFAULT 0,
  right_count          INT DEFAULT 0,
  rank_id              INT DEFAULT 0,
  total_direct         INT DEFAULT 0,
  total_earned         NUMERIC(10,2) DEFAULT 0,
  pending_commissions  NUMERIC(10,2) DEFAULT 0,
  created_at           TIMESTAMPTZ DEFAULT NOW(),
  updated_at           TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS mlm_nodes_user_id_idx    ON mlm_nodes(user_id);
CREATE INDEX IF NOT EXISTS mlm_nodes_sponsor_id_idx ON mlm_nodes(sponsor_id);

-- RLS
ALTER TABLE mlm_nodes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "mlm_nodes_service_role" ON mlm_nodes;
CREATE POLICY "mlm_nodes_service_role"
  ON mlm_nodes FOR ALL
  USING (true)
  WITH CHECK (true);

-- ── 5. mlm_commissions ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS mlm_commissions (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  beneficiary_id    UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  from_user_id      UUID REFERENCES profiles(id) ON DELETE SET NULL,
  type              TEXT NOT NULL CHECK (type IN ('direct_referral', 'rank_bonus', 'monthly_residual', 'free_pack')),
  amount            NUMERIC(10,2) NOT NULL DEFAULT 0,
  currency          TEXT DEFAULT 'EUR',
  source_plan       TEXT,
  stripe_session_id TEXT,
  status            TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'paid', 'cancelled')),
  notes             TEXT,
  created_at        TIMESTAMPTZ DEFAULT NOW(),
  approved_at       TIMESTAMPTZ,
  paid_at           TIMESTAMPTZ
);

-- Indexes
CREATE INDEX IF NOT EXISTS mlm_commissions_beneficiary_idx ON mlm_commissions(beneficiary_id);
CREATE INDEX IF NOT EXISTS mlm_commissions_status_idx      ON mlm_commissions(status);

-- RLS
ALTER TABLE mlm_commissions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "mlm_commissions_service_role" ON mlm_commissions;
CREATE POLICY "mlm_commissions_service_role"
  ON mlm_commissions FOR ALL
  USING (true)
  WITH CHECK (true);
