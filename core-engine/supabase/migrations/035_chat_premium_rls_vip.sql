-- Alinhar RLS premium-ideas com canReadChannel (vip + admin)

DROP POLICY IF EXISTS chat_messages_select ON chat_messages;

CREATE POLICY chat_messages_select ON chat_messages
  FOR SELECT
  USING (
    is_deleted = false
    AND CASE channel_slug
      WHEN 'premium-ideas' THEN EXISTS (
        SELECT 1 FROM profiles
        WHERE profiles.id = auth.uid()
          AND profiles.is_active = true
          AND (
            profiles.subscription_plan = 'premium'
            OR profiles.member_category IN ('iq', 'vip')
            OR profiles.user_type = 'admin'
          )
      )
      ELSE is_active_member()
    END
  );
