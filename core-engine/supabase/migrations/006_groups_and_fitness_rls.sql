-- =====================================================
-- Migração 006: RLS para grupos (chats) e fitness
-- Para que grupos e treinos/planos alimentares padrão
-- apareçam após executar os scripts.
-- =====================================================

-- ---------- 1. GRUPOS (group_conversations) ----------
-- Garantir que utilizadores autenticados veem grupos
-- com is_public OU is_mobile_visible (não apenas membros).

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'group_conversations'
  ) THEN
    -- Atualizar política de visualização para incluir is_mobile_visible
    DROP POLICY IF EXISTS "Anyone can view public groups" ON public.group_conversations;
    CREATE POLICY "Anyone can view public groups" ON public.group_conversations
      FOR SELECT
      USING (
        is_public = TRUE OR
        is_mobile_visible = TRUE OR
        EXISTS (
          SELECT 1 FROM public.group_members
          WHERE group_id = group_conversations.id
          AND user_id = auth.uid()
        )
      );
    RAISE NOTICE 'Política group_conversations (public/mobile_visible) atualizada.';
  END IF;
END $$;

-- ---------- 2. WORKOUTS (treinos) ----------
-- Se a tabela existir e RLS estiver ativo, garantir políticas.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'workouts'
  ) THEN
    ALTER TABLE public.workouts ENABLE ROW LEVEL SECURITY;

    DROP POLICY IF EXISTS "Users see own workouts" ON public.workouts;
    CREATE POLICY "Users see own workouts" ON public.workouts
      FOR SELECT USING (auth.uid() = user_id OR is_template = TRUE);

    DROP POLICY IF EXISTS "Users create own workouts" ON public.workouts;
    CREATE POLICY "Users create own workouts" ON public.workouts
      FOR INSERT WITH CHECK (auth.uid() = user_id);

    DROP POLICY IF EXISTS "Users update own workouts" ON public.workouts;
    CREATE POLICY "Users update own workouts" ON public.workouts
      FOR UPDATE USING (auth.uid() = user_id);

    DROP POLICY IF EXISTS "Users delete own workouts" ON public.workouts;
    CREATE POLICY "Users delete own workouts" ON public.workouts
      FOR DELETE USING (auth.uid() = user_id);

    RAISE NOTICE 'Políticas workouts criadas/atualizadas.';
  END IF;
END $$;

-- ---------- 3. WORKOUT_DAYS ----------
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'workout_days'
  ) THEN
    ALTER TABLE public.workout_days ENABLE ROW LEVEL SECURITY;

    DROP POLICY IF EXISTS "Users see own workout data" ON public.workout_days;
    CREATE POLICY "Users see own workout data" ON public.workout_days
      FOR SELECT USING (
        EXISTS (SELECT 1 FROM public.workouts WHERE id = workout_days.workout_id AND (user_id = auth.uid() OR is_template = TRUE))
      );

    DROP POLICY IF EXISTS "Users manage own workout days" ON public.workout_days;
    CREATE POLICY "Users manage own workout days" ON public.workout_days
      FOR ALL
      USING (EXISTS (SELECT 1 FROM public.workouts WHERE id = workout_days.workout_id AND user_id = auth.uid()))
      WITH CHECK (EXISTS (SELECT 1 FROM public.workouts WHERE id = workout_days.workout_id AND user_id = auth.uid()));

    RAISE NOTICE 'Políticas workout_days criadas/atualizadas.';
  END IF;
END $$;

-- ---------- 4. MEALS (planos alimentares) ----------
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'meals'
  ) THEN
    ALTER TABLE public.meals ENABLE ROW LEVEL SECURITY;

    DROP POLICY IF EXISTS "Users see own meals" ON public.meals;
    CREATE POLICY "Users see own meals" ON public.meals
      FOR SELECT USING (auth.uid() = user_id);

    DROP POLICY IF EXISTS "Users manage own meals" ON public.meals;
    CREATE POLICY "Users manage own meals" ON public.meals
      FOR ALL
      USING (auth.uid() = user_id)
      WITH CHECK (auth.uid() = user_id);

    RAISE NOTICE 'Políticas meals criadas/atualizadas.';
  END IF;
END $$;
