-- Permitir vídeos no chat e leitura para membros VIP activos

ALTER TABLE chat_messages DROP CONSTRAINT IF EXISTS chat_messages_message_type_check;

ALTER TABLE chat_messages ADD CONSTRAINT chat_messages_message_type_check
  CHECK (message_type = ANY (ARRAY['text'::text, 'image'::text, 'video'::text, 'link'::text, 'telegram_forward'::text]));

CREATE OR REPLACE FUNCTION public.is_active_member()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid()
      AND user_type IN ('admin', 'member', 'vip')
      AND is_active = true
  );
$function$;
