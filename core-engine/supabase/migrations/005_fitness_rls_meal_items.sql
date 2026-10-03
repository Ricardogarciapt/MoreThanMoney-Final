-- =====================================================
-- Políticas RLS em falta para fitness (wger-inspired)
-- O script create-wger-inspired-schema.sql ativa RLS em
-- workout_sets, workout_sessions, workout_set_logs e
-- meal_items mas não cria políticas — sem elas o acesso
-- via anon key falha. Esta migração adiciona as políticas.
-- =====================================================

-- ---------- workout_sets ----------
DROP POLICY IF EXISTS "Users see own workout sets" ON public.workout_sets;
CREATE POLICY "Users see own workout sets" ON public.workout_sets
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.workout_days wd
      JOIN public.workouts w ON w.id = wd.workout_id
      WHERE wd.id = workout_sets.workout_day_id
        AND (w.user_id = auth.uid() OR w.is_template = TRUE)
    )
  );

DROP POLICY IF EXISTS "Users manage own workout sets" ON public.workout_sets;
CREATE POLICY "Users manage own workout sets" ON public.workout_sets
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.workout_days wd
      JOIN public.workouts w ON w.id = wd.workout_id
      WHERE wd.id = workout_sets.workout_day_id AND w.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.workout_days wd
      JOIN public.workouts w ON w.id = wd.workout_id
      WHERE wd.id = workout_sets.workout_day_id AND w.user_id = auth.uid()
    )
  );

-- ---------- workout_sessions ----------
DROP POLICY IF EXISTS "Users see own workout sessions" ON public.workout_sessions;
CREATE POLICY "Users see own workout sessions" ON public.workout_sessions
  FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users manage own workout sessions" ON public.workout_sessions;
CREATE POLICY "Users manage own workout sessions" ON public.workout_sessions
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- ---------- workout_set_logs ----------
DROP POLICY IF EXISTS "Users see own workout set logs" ON public.workout_set_logs;
CREATE POLICY "Users see own workout set logs" ON public.workout_set_logs
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.workout_sessions ws
      WHERE ws.id = workout_set_logs.workout_session_id AND ws.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Users manage own workout set logs" ON public.workout_set_logs;
CREATE POLICY "Users manage own workout set logs" ON public.workout_set_logs
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.workout_sessions ws
      WHERE ws.id = workout_set_logs.workout_session_id AND ws.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.workout_sessions ws
      WHERE ws.id = workout_set_logs.workout_session_id AND ws.user_id = auth.uid()
    )
  );

-- ---------- meal_items (acesso via meal do user) ----------
DROP POLICY IF EXISTS "Users see own meal items" ON public.meal_items;
CREATE POLICY "Users see own meal items" ON public.meal_items
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.meals m WHERE m.id = meal_items.meal_id AND m.user_id = auth.uid())
  );

DROP POLICY IF EXISTS "Users manage own meal items" ON public.meal_items;
CREATE POLICY "Users manage own meal items" ON public.meal_items
  FOR ALL
  USING (
    EXISTS (SELECT 1 FROM public.meals m WHERE m.id = meal_items.meal_id AND m.user_id = auth.uid())
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.meals m WHERE m.id = meal_items.meal_id AND m.user_id = auth.uid())
  );

-- ---------- ingredients: permitir UPDATE nos próprios ----------
DROP POLICY IF EXISTS "Users update own ingredients" ON public.ingredients;
CREATE POLICY "Users update own ingredients" ON public.ingredients
  FOR UPDATE USING (auth.uid() = created_by);

-- ---------- weight_entries ----------
DROP POLICY IF EXISTS "Users manage own weight entries" ON public.weight_entries;
CREATE POLICY "Users manage own weight entries" ON public.weight_entries
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- ---------- body_measurements ----------
DROP POLICY IF EXISTS "Users manage own body measurements" ON public.body_measurements;
CREATE POLICY "Users manage own body measurements" ON public.body_measurements
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
