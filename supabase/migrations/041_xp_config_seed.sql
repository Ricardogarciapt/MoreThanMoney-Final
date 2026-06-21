-- Seed xp_config com valores por omissão (ignora se já existir)
INSERT INTO xp_config (action_type, xp_amount, description)
VALUES
  ('onboarding_step_completed', 50, 'Passo Fast Start concluído'),
  ('fast_start_completed', 200, 'Fast Start 100% completo'),
  ('chat_message_sent', 5, 'Mensagem no chat'),
  ('live_chat_message', 8, 'Mensagem na live'),
  ('live_session_watch', 15, 'Assistir live'),
  ('social_create_post', 15, 'Publicar no feed'),
  ('social_like_post', 3, 'Like no feed'),
  ('social_create_comment', 8, 'Comentário no feed'),
  ('login_daily', 10, 'Login diário')
ON CONFLICT (action_type) DO NOTHING;
