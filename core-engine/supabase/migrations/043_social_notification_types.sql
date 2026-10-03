-- Tipos in-app para likes, comentários e menções no social feed

ALTER TABLE notifications DROP CONSTRAINT IF EXISTS notifications_type_check;

ALTER TABLE notifications ADD CONSTRAINT notifications_type_check CHECK (
  type IN (
    'dca_opportunity',
    'dca_daily',
    'price_alert',
    'system',
    'portfolio',
    'chat_message',
    'social_post',
    'social_interaction',
    'social_mention',
    'live_session',
    'trade_ideas',
    'telegram_forward',
    'mtmcopy_signal',
    'admin_notification',
    'subscription_expiry',
    'access_validation_pending',
    'cron_marker',
    'stripe_skool_pending',
    'stripe_skool_revoke',
    'new_member',
    'new_sale',
    'new_client',
    'new_affiliate',
    'team_renewal',
    'rank_up'
  )
);
