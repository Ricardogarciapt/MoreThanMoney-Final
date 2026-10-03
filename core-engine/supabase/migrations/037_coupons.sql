-- ── 037_coupons.sql ──────────────────────────────────────────────────────────
-- Tabelas para o sistema de cupões de oferta MTM
-- Suporta: desconto %, meses grátis, subscrição gratuita
-- ─────────────────────────────────────────────────────────────────────────────

-- Tabela principal de cupões
CREATE TABLE IF NOT EXISTS coupons (
  id            uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  code          text        NOT NULL UNIQUE,
  type          text        NOT NULL CHECK (type IN ('discount_pct', 'free_months', 'free_subscription')),
  discount_value numeric    DEFAULT 0 NOT NULL,
  plan_override  text       CHECK (plan_override IN ('app_member', 'premium', 'both')),
  max_uses       integer,
  used_count     integer    DEFAULT 0 NOT NULL,
  valid_from     timestamptz DEFAULT now() NOT NULL,
  valid_until    timestamptz,
  description    text,
  is_active      boolean    DEFAULT true NOT NULL,
  created_at     timestamptz DEFAULT now() NOT NULL,
  updated_at     timestamptz DEFAULT now() NOT NULL
);

-- Rastreio individual de utilizações
CREATE TABLE IF NOT EXISTS coupon_usages (
  id          uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  coupon_id   uuid        NOT NULL REFERENCES coupons(id) ON DELETE CASCADE,
  user_id     uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  used_at     timestamptz DEFAULT now() NOT NULL,
  context     text        DEFAULT 'manual',
  UNIQUE(coupon_id, user_id)
);

-- Índices
CREATE INDEX IF NOT EXISTS idx_coupons_code      ON coupons(code);
CREATE INDEX IF NOT EXISTS idx_coupons_is_active ON coupons(is_active);
CREATE INDEX IF NOT EXISTS idx_coupon_usages_coupon_id ON coupon_usages(coupon_id);
CREATE INDEX IF NOT EXISTS idx_coupon_usages_user_id   ON coupon_usages(user_id);

-- RLS
ALTER TABLE coupons        ENABLE ROW LEVEL SECURITY;
ALTER TABLE coupon_usages  ENABLE ROW LEVEL SECURITY;

-- Admins podem fazer tudo
CREATE POLICY "admin_all_coupons" ON coupons
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.user_type = 'admin'
    )
  );

-- Service role (API routes) pode ler cupões para validação
CREATE POLICY "service_read_coupons" ON coupons
  FOR SELECT USING (true);

-- Service role pode registar utilizações
CREATE POLICY "admin_all_coupon_usages" ON coupon_usages
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.user_type = 'admin'
    )
  );

-- Utilizadores autenticados podem ver as suas próprias utilizações
CREATE POLICY "user_read_own_coupon_usages" ON coupon_usages
  FOR SELECT USING (auth.uid() = user_id);
