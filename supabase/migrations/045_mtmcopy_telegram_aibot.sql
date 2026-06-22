-- MTMcopier: bot admin canónico @MoreThanMoney_aibot (descoberta de canais + webhooks)
ALTER TABLE telegram_config
  ADD COLUMN IF NOT EXISTS bot_username text;

COMMENT ON COLUMN telegram_config.bot_username IS 'Username Telegram do bot admin MTMcopier (@MoreThanMoney_aibot)';

UPDATE telegram_config
SET
  bot_username = 'MoreThanMoney_aibot',
  is_active = true,
  updated_at = NOW()
WHERE bot_username IS NULL OR bot_username ILIKE '%copier%';

INSERT INTO site_settings (key, value, description)
VALUES (
  'mtmcopy_telegram_bot',
  '{"username":"MoreThanMoney_aibot","role":"admin_channel_discovery"}',
  'Bot admin MTMcopier — descoberta de canais e webhooks (não usar Copierbot)'
)
ON CONFLICT (key) DO UPDATE SET
  value = EXCLUDED.value,
  description = EXCLUDED.description,
  updated_at = NOW();
