-- Seed xp_config com valores por omissão (ignora se action_type já existir)
INSERT INTO xp_config (action_type, action_name, xp_amount, max_per_day, description)
VALUES
  ('onboarding_step_completed', 'Passo Fast Start concluído', 50, NULL, 'XP ao completar cada passo do Fast Start'),
  ('fast_start_completed', 'Fast Start 100% completo', 200, NULL, 'Bónus ao concluir os 6 passos'),
  ('chat_message_sent', 'Mensagem no chat', 5, 25, 'XP por mensagem nos canais da app'),
  ('live_chat_message', 'Mensagem na live', 8, 20, 'XP por mensagem no chat de live sessions'),
  ('live_session_watch', 'Assistir live', 15, NULL, 'XP por presença na live (cooldown 15 min no código)'),
  ('social_create_post', 'Publicar no feed', 15, 10, 'XP ao criar publicação no feed social'),
  ('social_like_post', 'Like no feed', 3, 30, 'XP ao dar like numa publicação'),
  ('social_create_comment', 'Comentário no feed', 8, 20, 'XP ao comentar numa publicação'),
  ('login_daily', 'Login diário', 10, 1, 'XP por login uma vez por dia')
ON CONFLICT (action_type) DO NOTHING;
