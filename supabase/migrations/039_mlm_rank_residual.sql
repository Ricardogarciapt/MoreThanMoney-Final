-- ============================================================
-- 039_mlm_rank_residual.sql
-- Residual mensal de rank + colunas MLM em comissões
-- ============================================================

-- Colunas usadas pelo webhook Stripe (idempotência / payout)
ALTER TABLE mlm_commissions
  ADD COLUMN IF NOT EXISTS stripe_invoice_id TEXT,
  ADD COLUMN IF NOT EXISTS source_amount_cents BIGINT,
  ADD COLUMN IF NOT EXISTS payout_status TEXT DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS stripe_transfer_id TEXT;

CREATE INDEX IF NOT EXISTS mlm_commissions_stripe_invoice_idx
  ON mlm_commissions(stripe_invoice_id)
  WHERE stripe_invoice_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS mlm_commissions_rank_residual_month_idx
  ON mlm_commissions(beneficiary_id, created_at)
  WHERE type = 'rank_residual';

-- Tipo rank_residual no enum de comissões
ALTER TABLE mlm_commissions DROP CONSTRAINT IF EXISTS mlm_commissions_type_check;
ALTER TABLE mlm_commissions
  ADD CONSTRAINT mlm_commissions_type_check
  CHECK (type IN (
    'direct_referral',
    'rank_bonus',
    'monthly_residual',
    'rank_residual',
    'free_pack'
  ));

-- Residual directo do sponsor: 50%
UPDATE mlm_settings
SET direct_commission_pct = 50.00,
    updated_at = NOW()
WHERE id = 1
  AND direct_commission_pct < 50;
