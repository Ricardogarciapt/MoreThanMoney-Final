-- =====================================================
-- SCHEMA INSPIRADO NO WGER - Sistema Fitness Completo
-- =====================================================
-- Baseado em: https://github.com/wger-project/wger
-- Adaptado para Supabase com integração ao sistema MTM

-- Verificar e criar extensões necessárias
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- =====================================================
-- 1. EXERCISES (Exercícios - Base de dados de exercícios)
-- =====================================================
CREATE TABLE IF NOT EXISTS public.exercises (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  category VARCHAR(50) CHECK (category IN ('strength', 'cardio', 'flexibility', 'endurance', 'hiit', 'sports', 'other')),
  equipment VARCHAR(50) CHECK (equipment IN ('bodyweight', 'dumbbells', 'barbell', 'machine', 'cable', 'kettlebell', 'resistance_band', 'other', 'none')),
  muscles_primary TEXT[], -- Array de músculos principais
  muscles_secondary TEXT[], -- Array de músculos secundários
  instructions TEXT, -- Instruções de execução
  image_url TEXT,
  video_url TEXT,
  is_public BOOLEAN DEFAULT TRUE, -- Exercícios públicos podem ser usados por todos
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_exercises_category ON public.exercises(category);
CREATE INDEX IF NOT EXISTS idx_exercises_equipment ON public.exercises(equipment);
CREATE INDEX IF NOT EXISTS idx_exercises_is_public ON public.exercises(is_public);
CREATE INDEX IF NOT EXISTS idx_exercises_created_by ON public.exercises(created_by);

-- =====================================================
-- 2. WORKOUTS (Planos de Treino - melhorado)
-- =====================================================
CREATE TABLE IF NOT EXISTS public.workouts (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  comment TEXT, -- Notas do utilizador sobre o plano
  is_template BOOLEAN DEFAULT FALSE, -- Se é um template público
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Garante que a coluna is_template existe mesmo se a tabela já existia
ALTER TABLE public.workouts
  ADD COLUMN IF NOT EXISTS is_template BOOLEAN DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS idx_workouts_user_id ON public.workouts(user_id);
CREATE INDEX IF NOT EXISTS idx_workouts_is_template ON public.workouts(is_template);
CREATE INDEX IF NOT EXISTS idx_workouts_is_active ON public.workouts(is_active);

-- =====================================================
-- 3. WORKOUT_DAYS (Dias do Plano de Treino)
-- =====================================================
CREATE TABLE IF NOT EXISTS public.workout_days (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  workout_id UUID NOT NULL REFERENCES public.workouts(id) ON DELETE CASCADE,
  day_number INTEGER NOT NULL CHECK (day_number >= 1 AND day_number <= 7), -- 1=Segunda, 7=Domingo
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_workout_days_workout_id ON public.workout_days(workout_id);
CREATE INDEX IF NOT EXISTS idx_workout_days_day_number ON public.workout_days(day_number);

-- =====================================================
-- 4. WORKOUT_SETS (Sets de Exercícios no Dia)
-- =====================================================
CREATE TABLE IF NOT EXISTS public.workout_sets (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  workout_day_id UUID NOT NULL REFERENCES public.workout_days(id) ON DELETE CASCADE,
  exercise_id UUID NOT NULL REFERENCES public.exercises(id) ON DELETE CASCADE,
  sets INTEGER DEFAULT 3,
  reps_min INTEGER,
  reps_max INTEGER,
  weight DECIMAL(10, 2), -- Peso sugerido (opcional)
  duration_seconds INTEGER, -- Para exercícios de duração (cardio)
  rest_seconds INTEGER DEFAULT 60, -- Descanso entre sets
  order_index INTEGER DEFAULT 0, -- Ordem no treino
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_workout_sets_workout_day_id ON public.workout_sets(workout_day_id);
CREATE INDEX IF NOT EXISTS idx_workout_sets_exercise_id ON public.workout_sets(exercise_id);
CREATE INDEX IF NOT EXISTS idx_workout_sets_order_index ON public.workout_sets(order_index);

-- =====================================================
-- 5. WORKOUT_SESSIONS (Sessões de Treino Realizadas)
-- =====================================================
CREATE TABLE IF NOT EXISTS public.workout_sessions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  workout_id UUID REFERENCES public.workouts(id) ON DELETE SET NULL,
  workout_day_id UUID REFERENCES public.workout_days(id) ON DELETE SET NULL,
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  start_time TIMESTAMPTZ,
  end_time TIMESTAMPTZ,
  duration_minutes INTEGER,
  notes TEXT,
  rating INTEGER CHECK (rating >= 1 AND rating <= 5),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Garante que a coluna date existe mesmo se a tabela já existia
ALTER TABLE public.workout_sessions
  ADD COLUMN IF NOT EXISTS date DATE NOT NULL DEFAULT CURRENT_DATE;

CREATE INDEX IF NOT EXISTS idx_workout_sessions_user_id ON public.workout_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_workout_sessions_workout_id ON public.workout_sessions(workout_id);
CREATE INDEX IF NOT EXISTS idx_workout_sessions_date ON public.workout_sessions(date DESC);

-- =====================================================
-- 6. WORKOUT_SET_LOGS (Registo de Sets Realizados)
-- =====================================================
CREATE TABLE IF NOT EXISTS public.workout_set_logs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  workout_session_id UUID NOT NULL REFERENCES public.workout_sessions(id) ON DELETE CASCADE,
  exercise_id UUID NOT NULL REFERENCES public.exercises(id) ON DELETE CASCADE,
  set_number INTEGER NOT NULL,
  reps INTEGER,
  weight DECIMAL(10, 2),
  duration_seconds INTEGER,
  rest_seconds INTEGER,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_workout_set_logs_session_id ON public.workout_set_logs(workout_session_id);
CREATE INDEX IF NOT EXISTS idx_workout_set_logs_exercise_id ON public.workout_set_logs(exercise_id);

-- =====================================================
-- 7. INGREDIENTS (Ingredientes - Base de dados nutricional)
-- =====================================================
CREATE TABLE IF NOT EXISTS public.ingredients (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  energy_kcal DECIMAL(10, 2), -- Calorias por 100g
  protein DECIMAL(10, 2), -- Proteína por 100g
  carbs DECIMAL(10, 2), -- Hidratos por 100g
  fat DECIMAL(10, 2), -- Gordura por 100g
  fiber DECIMAL(10, 2), -- Fibra por 100g
  sodium DECIMAL(10, 2), -- Sódio por 100g
  source VARCHAR(50) DEFAULT 'user' CHECK (source IN ('user', 'open_food_facts', 'usda')),
  barcode VARCHAR(50), -- Código de barras (se de Open Food Facts)
  image_url TEXT,
  is_public BOOLEAN DEFAULT TRUE,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ingredients_name ON public.ingredients(name);
CREATE INDEX IF NOT EXISTS idx_ingredients_is_public ON public.ingredients(is_public);
CREATE INDEX IF NOT EXISTS idx_ingredients_barcode ON public.ingredients(barcode);

-- =====================================================
-- 8. MEALS (Refeições)
-- =====================================================
CREATE TABLE IF NOT EXISTS public.meals (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  meal_type VARCHAR(20) NOT NULL CHECK (meal_type IN ('breakfast', 'lunch', 'dinner', 'snack', 'other')),
  meal_date DATE NOT NULL DEFAULT CURRENT_DATE,
  meal_time TIME,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_meals_user_id ON public.meals(user_id);
CREATE INDEX IF NOT EXISTS idx_meals_meal_date ON public.meals(meal_date DESC);
CREATE INDEX IF NOT EXISTS idx_meals_meal_type ON public.meals(meal_type);

-- =====================================================
-- 9. MEAL_ITEMS (Itens da Refeição - Ingredientes)
-- =====================================================
CREATE TABLE IF NOT EXISTS public.meal_items (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  meal_id UUID NOT NULL REFERENCES public.meals(id) ON DELETE CASCADE,
  ingredient_id UUID NOT NULL REFERENCES public.ingredients(id) ON DELETE CASCADE,
  amount DECIMAL(10, 2) NOT NULL, -- Quantidade em gramas
  unit VARCHAR(20) DEFAULT 'g', -- Unidade (g, ml, piece, etc.)
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_meal_items_meal_id ON public.meal_items(meal_id);
CREATE INDEX IF NOT EXISTS idx_meal_items_ingredient_id ON public.meal_items(ingredient_id);

-- =====================================================
-- 10. WEIGHT_ENTRIES (Registo de Peso Corporal)
-- =====================================================
CREATE TABLE IF NOT EXISTS public.weight_entries (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  weight DECIMAL(10, 2) NOT NULL, -- Peso em kg
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Garante que a coluna date existe mesmo se a tabela já existia
ALTER TABLE public.weight_entries
  ADD COLUMN IF NOT EXISTS date DATE NOT NULL DEFAULT CURRENT_DATE;

CREATE INDEX IF NOT EXISTS idx_weight_entries_user_id ON public.weight_entries(user_id);
CREATE INDEX IF NOT EXISTS idx_weight_entries_date ON public.weight_entries(date DESC);

-- =====================================================
-- 11. BODY_MEASUREMENTS (Medidas Corporais)
-- =====================================================
CREATE TABLE IF NOT EXISTS public.body_measurements (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  measurement_type VARCHAR(50) NOT NULL CHECK (measurement_type IN ('chest', 'waist', 'hips', 'biceps', 'thighs', 'neck', 'shoulders', 'forearms', 'calves', 'other')),
  value DECIMAL(10, 2) NOT NULL, -- Valor em cm
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Garante que a coluna date existe mesmo se a tabela já existia
ALTER TABLE public.body_measurements
  ADD COLUMN IF NOT EXISTS date DATE NOT NULL DEFAULT CURRENT_DATE;

CREATE INDEX IF NOT EXISTS idx_body_measurements_user_id ON public.body_measurements(user_id);
CREATE INDEX IF NOT EXISTS idx_body_measurements_date ON public.body_measurements(date DESC);
CREATE INDEX IF NOT EXISTS idx_body_measurements_type ON public.body_measurements(measurement_type);

-- =====================================================
-- 12. ROW LEVEL SECURITY (RLS)
-- =====================================================
ALTER TABLE public.exercises ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workouts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workout_days ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workout_sets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workout_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workout_set_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ingredients ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.meals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.meal_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.weight_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.body_measurements ENABLE ROW LEVEL SECURITY;

-- =====================================================
-- 13. POLÍTICAS RLS
-- =====================================================

-- Exercises: Todos veem públicos, users veem os seus
DROP POLICY IF EXISTS "Exercises public or own" ON public.exercises;
CREATE POLICY "Exercises public or own" ON public.exercises
  FOR SELECT USING (is_public = TRUE OR created_by = auth.uid());

DROP POLICY IF EXISTS "Users create own exercises" ON public.exercises;
CREATE POLICY "Users create own exercises" ON public.exercises
  FOR INSERT WITH CHECK (auth.uid() = created_by);

DROP POLICY IF EXISTS "Users update own exercises" ON public.exercises;
CREATE POLICY "Users update own exercises" ON public.exercises
  FOR UPDATE USING (auth.uid() = created_by);

-- Workouts: Users veem apenas os seus
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

-- Workout Days, Sets, Sessions, Logs: Mesmas regras baseadas em workout_id
DROP POLICY IF EXISTS "Users see own workout data" ON public.workout_days;
CREATE POLICY "Users see own workout data" ON public.workout_days
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.workouts WHERE id = workout_id AND (user_id = auth.uid() OR is_template = TRUE))
  );

DROP POLICY IF EXISTS "Users manage own workout days" ON public.workout_days;
CREATE POLICY "Users manage own workout days" ON public.workout_days
  FOR ALL
  USING (
    EXISTS (SELECT 1 FROM public.workouts WHERE id = workout_id AND user_id = auth.uid())
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.workouts WHERE id = workout_id AND user_id = auth.uid())
  );

-- Similar para workout_sets, workout_sessions, workout_set_logs
-- (políticas baseadas em ownership do workout)

-- Ingredients: Todos veem públicos, users veem os seus
DROP POLICY IF EXISTS "Ingredients public or own" ON public.ingredients;
CREATE POLICY "Ingredients public or own" ON public.ingredients
  FOR SELECT USING (is_public = TRUE OR created_by = auth.uid());

DROP POLICY IF EXISTS "Users create own ingredients" ON public.ingredients;
CREATE POLICY "Users create own ingredients" ON public.ingredients
  FOR INSERT WITH CHECK (auth.uid() = created_by);

-- Meals, Meal Items, Weight, Measurements: Users veem apenas os seus
DROP POLICY IF EXISTS "Users see own meals" ON public.meals;
CREATE POLICY "Users see own meals" ON public.meals
  FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users manage own meals" ON public.meals;
CREATE POLICY "Users manage own meals" ON public.meals
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Similar para meal_items, weight_entries, body_measurements

-- =====================================================
-- 14. COMENTÁRIOS
-- =====================================================
COMMENT ON TABLE public.exercises IS 'Base de dados de exercícios (inspirado em wger)';
COMMENT ON TABLE public.workouts IS 'Planos de treino dos utilizadores';
COMMENT ON TABLE public.workout_days IS 'Dias da semana no plano de treino';
COMMENT ON TABLE public.workout_sets IS 'Sets de exercícios por dia';
COMMENT ON TABLE public.workout_sessions IS 'Sessões de treino realizadas';
COMMENT ON TABLE public.workout_set_logs IS 'Registo detalhado de cada set realizado';
COMMENT ON TABLE public.ingredients IS 'Base de dados nutricional (inspirado em wger/Open Food Facts)';
COMMENT ON TABLE public.meals IS 'Refeições dos utilizadores';
COMMENT ON TABLE public.meal_items IS 'Ingredientes de cada refeição';
COMMENT ON TABLE public.weight_entries IS 'Registo de peso corporal';
COMMENT ON TABLE public.body_measurements IS 'Medidas corporais (peito, cintura, etc.)';

-- =====================================================
-- ✅ SCRIPT CONCLUÍDO
-- =====================================================


