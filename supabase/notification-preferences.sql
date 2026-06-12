-- Preferências de notificação por utilizador (push + in-app)
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS notification_preferences JSONB NOT NULL DEFAULT '{
    "dca": true,
    "chat": true,
    "live_sessions": true,
    "trade_ideas": true,
    "telegram_groups": true
  }'::jsonb;

COMMENT ON COLUMN public.profiles.notification_preferences IS
  'Toggles de notificação: dca, chat, live_sessions, trade_ideas, telegram_groups';
