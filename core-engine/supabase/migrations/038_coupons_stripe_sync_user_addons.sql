-- Sync cupões MTM ↔ Stripe + coluna checkout_source para admin

ALTER TABLE coupons
  ADD COLUMN IF NOT EXISTS stripe_coupon_id text,
  ADD COLUMN IF NOT EXISTS stripe_promotion_code_id text;

CREATE INDEX IF NOT EXISTS idx_coupons_stripe_promo ON coupons(stripe_promotion_code_id);

COMMENT ON COLUMN coupons.stripe_coupon_id IS 'ID do cupão no Stripe (percent_off / duration)';
COMMENT ON COLUMN coupons.stripe_promotion_code_id IS 'ID do promotion code Stripe usado no checkout';
