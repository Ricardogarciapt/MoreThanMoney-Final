-- Sensei Scanner: novo grupo Telegram (-1003853860780) substitui Ideias de Forex (-1003716578747)
UPDATE site_settings
SET value = regexp_replace(
  regexp_replace(
    value::text,
    '-1003716578747',
    '-1003853860780',
    'g'
  ),
  '"sender_chat_id"\s*:\s*"-1003716578747"',
  '"sender_chat_id": "-1003853860780"',
  'g'
)::jsonb
WHERE key = 'mtmcopy_signal_sources'
  AND value::text LIKE '%-1003716578747%';

INSERT INTO mtmcopy_telegram_discovered (chat_id, title, username, chat_type, last_message_at, updated_at)
VALUES (
  '-1003853860780',
  'MoreThanMoney Sensei Scanner',
  NULL,
  'supergroup',
  NOW(),
  NOW()
)
ON CONFLICT (chat_id) DO UPDATE SET
  title = EXCLUDED.title,
  chat_type = EXCLUDED.chat_type,
  updated_at = NOW();
