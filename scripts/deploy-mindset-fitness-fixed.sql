-- =====================================================
-- SCRIPT DE DEPLOY: Sistema Mindset & Fitness (CORRIGIDO)
-- =====================================================
-- Execute este script no Supabase SQL Editor
-- Este script é idempotente e corrige problemas de ordem

-- Verificar e criar extensões necessárias
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- =====================================================
-- LIMPAR TABELAS EXISTENTES (se necessário)
-- =====================================================
-- Descomenta as linhas abaixo se precisares de recriar tudo do zero
-- DROP TABLE IF EXISTS public.workout_sessions CASCADE;
-- DROP TABLE IF EXISTS public.workouts CASCADE;
-- DROP TABLE IF EXISTS public.meals CASCADE;
-- DROP TABLE IF EXISTS public.mindset_sessions CASCADE;
-- DROP TABLE IF EXISTS public.fitness_goals CASCADE;
-- DROP TABLE IF EXISTS public.mindset_goals CASCADE;

-- =====================================================
-- 1. TABELA: workouts (Treinos) - DEVE SER CRIADA PRIMEIRO
-- =====================================================
CREATE TABLE IF NOT EXISTS public.workouts (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  trainer_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  workout_type VARCHAR(50) NOT NULL CHECK (workout_type IN ('strength', 'cardio', 'flexibility', 'endurance', 'hiit', 'custom')),
  difficulty VARCHAR(20) DEFAULT 'beginner' CHECK (difficulty IN ('beginner', 'intermediate', 'advanced')),
  duration_minutes INTEGER,
  exercises JSONB NOT NULL DEFAULT '[]'::jsonb,
  instructions TEXT,
  is_default BOOLEAN DEFAULT FALSE,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Índices para workouts
CREATE INDEX IF NOT EXISTS idx_workouts_user_id ON public.workouts(user_id);
CREATE INDEX IF NOT EXISTS idx_workouts_trainer_id ON public.workouts(trainer_id);
CREATE INDEX IF NOT EXISTS idx_workouts_is_default ON public.workouts(is_default) WHERE is_default = TRUE;
CREATE INDEX IF NOT EXISTS idx_workouts_is_active ON public.workouts(is_active) WHERE is_active = TRUE;

-- =====================================================
-- 2. TABELA: workout_sessions (Sessões de Treino)
-- =====================================================
-- Garantir que a tabela workouts existe antes de criar workout_sessions
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'workouts') THEN
    RAISE EXCEPTION 'Tabela workouts não existe. Execute o script completo na ordem correta.';
  END IF;
END $$;

-- Se workout_sessions já existe mas sem workout_id, recriar
DROP TABLE IF EXISTS public.workout_sessions CASCADE;

CREATE TABLE public.workout_sessions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  workout_id UUID NOT NULL REFERENCES public.workouts(id) ON DELETE CASCADE,
  started_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  duration_minutes INTEGER,
  exercises_completed JSONB DEFAULT '[]'::jsonb,
  notes TEXT,
  rating INTEGER CHECK (rating >= 1 AND rating <= 5),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Índices para workout_sessions
CREATE INDEX IF NOT EXISTS idx_workout_sessions_user_id ON public.workout_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_workout_sessions_workout_id ON public.workout_sessions(workout_id);
CREATE INDEX IF NOT EXISTS idx_workout_sessions_started_at ON public.workout_sessions(started_at DESC);

-- =====================================================
-- 3. TABELA: meals (Refeições - Journaling)
-- =====================================================
CREATE TABLE IF NOT EXISTS public.meals (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  meal_type VARCHAR(20) NOT NULL CHECK (meal_type IN ('breakfast', 'lunch', 'dinner', 'snack', 'other')),
  meal_date DATE NOT NULL,
  meal_time TIME,
  foods JSONB NOT NULL DEFAULT '[]'::jsonb,
  total_calories DECIMAL(10, 2),
  total_protein DECIMAL(10, 2),
  total_carbs DECIMAL(10, 2),
  total_fats DECIMAL(10, 2),
  ai_analysis TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Índices para meals
CREATE INDEX IF NOT EXISTS idx_meals_user_id ON public.meals(user_id);
CREATE INDEX IF NOT EXISTS idx_meals_meal_date ON public.meals(meal_date DESC);
CREATE INDEX IF NOT EXISTS idx_meals_meal_type ON public.meals(meal_type);

-- =====================================================
-- 4. TABELA: mindset_sessions (Sessões de Mentoria)
-- =====================================================
CREATE TABLE IF NOT EXISTS public.mindset_sessions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  mentor_type VARCHAR(50) NOT NULL CHECK (mentor_type IN ('warren_buffett', 'eric_worre', 'grant_cardone', 'daniel_g', 'rich_dad_poor_dad', 'custom')),
  session_type VARCHAR(50) NOT NULL CHECK (session_type IN ('mindset', 'nwm', 'finance', 'personal_development', 'goal_setting')),
  user_message TEXT NOT NULL,
  ai_response TEXT NOT NULL,
  context JSONB DEFAULT '{}'::jsonb,
  rating INTEGER CHECK (rating >= 1 AND rating <= 5),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Índices para mindset_sessions
CREATE INDEX IF NOT EXISTS idx_mindset_sessions_user_id ON public.mindset_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_mindset_sessions_mentor_type ON public.mindset_sessions(mentor_type);
CREATE INDEX IF NOT EXISTS idx_mindset_sessions_created_at ON public.mindset_sessions(created_at DESC);

-- =====================================================
-- 5. TABELA: fitness_goals (Objetivos de Fitness)
-- =====================================================
CREATE TABLE IF NOT EXISTS public.fitness_goals (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  goal_type VARCHAR(50) NOT NULL CHECK (goal_type IN ('weight_loss', 'weight_gain', 'muscle_gain', 'endurance', 'flexibility', 'general_health', 'custom')),
  target_value DECIMAL(10, 2),
  current_value DECIMAL(10, 2),
  unit VARCHAR(20),
  target_date DATE,
  description TEXT,
  is_active BOOLEAN DEFAULT TRUE,
  achieved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Índices para fitness_goals
CREATE INDEX IF NOT EXISTS idx_fitness_goals_user_id ON public.fitness_goals(user_id);
CREATE INDEX IF NOT EXISTS idx_fitness_goals_is_active ON public.fitness_goals(is_active) WHERE is_active = TRUE;

-- =====================================================
-- 6. TABELA: mindset_goals (Objetivos de Mindset/NWM)
-- =====================================================
CREATE TABLE IF NOT EXISTS public.mindset_goals (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  goal_type VARCHAR(50) NOT NULL CHECK (goal_type IN ('income', 'network_building', 'personal_development', 'financial_freedom', 'custom')),
  target_value DECIMAL(10, 2),
  current_value DECIMAL(10, 2),
  unit VARCHAR(20),
  target_date DATE,
  description TEXT,
  is_active BOOLEAN DEFAULT TRUE,
  achieved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Índices para mindset_goals
CREATE INDEX IF NOT EXISTS idx_mindset_goals_user_id ON public.mindset_goals(user_id);
CREATE INDEX IF NOT EXISTS idx_mindset_goals_is_active ON public.mindset_goals(is_active) WHERE is_active = TRUE;

-- =====================================================
-- 7. ROW LEVEL SECURITY (RLS)
-- =====================================================
ALTER TABLE public.workouts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workout_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.meals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mindset_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fitness_goals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mindset_goals ENABLE ROW LEVEL SECURITY;

-- =====================================================
-- 8. POLÍTICAS RLS
-- =====================================================

-- Remover políticas antigas se existirem
DROP POLICY IF EXISTS "Users see own workouts and defaults" ON public.workouts;
DROP POLICY IF EXISTS "Users create own workouts" ON public.workouts;
DROP POLICY IF EXISTS "Users update own workouts" ON public.workouts;
DROP POLICY IF EXISTS "Users delete own workouts" ON public.workouts;

DROP POLICY IF EXISTS "Users see own workout sessions" ON public.workout_sessions;
DROP POLICY IF EXISTS "Users create own workout sessions" ON public.workout_sessions;
DROP POLICY IF EXISTS "Users update own workout sessions" ON public.workout_sessions;

DROP POLICY IF EXISTS "Users see own meals" ON public.meals;
DROP POLICY IF EXISTS "Users create own meals" ON public.meals;
DROP POLICY IF EXISTS "Users update own meals" ON public.meals;
DROP POLICY IF EXISTS "Users delete own meals" ON public.meals;

DROP POLICY IF EXISTS "Users see own mindset sessions" ON public.mindset_sessions;
DROP POLICY IF EXISTS "Users create own mindset sessions" ON public.mindset_sessions;

DROP POLICY IF EXISTS "Users see own fitness goals" ON public.fitness_goals;
DROP POLICY IF EXISTS "Users manage own fitness goals" ON public.fitness_goals;

DROP POLICY IF EXISTS "Users see own mindset goals" ON public.mindset_goals;
DROP POLICY IF EXISTS "Users manage own mindset goals" ON public.mindset_goals;

-- Workouts: Users veem seus treinos e treinos padrão, trainers veem todos
CREATE POLICY "Users see own workouts and defaults" ON public.workouts
  FOR SELECT USING (
    auth.uid() = user_id 
    OR is_default = TRUE 
    OR auth.uid() = trainer_id
    OR EXISTS (
      SELECT 1 FROM public.profiles 
      WHERE id = auth.uid() 
      AND (user_type = 'admin' OR membership_level = 'vip')
    )
  );

CREATE POLICY "Users create own workouts" ON public.workouts
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users update own workouts" ON public.workouts
  FOR UPDATE USING (auth.uid() = user_id OR auth.uid() = trainer_id OR EXISTS (
    SELECT 1 FROM public.profiles 
    WHERE id = auth.uid() 
    AND (user_type = 'admin' OR membership_level = 'vip')
  ));

CREATE POLICY "Users delete own workouts" ON public.workouts
  FOR DELETE USING (auth.uid() = user_id OR EXISTS (
    SELECT 1 FROM public.profiles 
    WHERE id = auth.uid() 
    AND (user_type = 'admin' OR membership_level = 'vip')
  ));

-- Workout Sessions: Users veem apenas suas sessões
CREATE POLICY "Users see own workout sessions" ON public.workout_sessions
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users create own workout sessions" ON public.workout_sessions
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users update own workout sessions" ON public.workout_sessions
  FOR UPDATE USING (auth.uid() = user_id);

-- Meals: Users veem apenas suas refeições
CREATE POLICY "Users see own meals" ON public.meals
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users create own meals" ON public.meals
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users update own meals" ON public.meals
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users delete own meals" ON public.meals
  FOR DELETE USING (auth.uid() = user_id);

-- Mindset Sessions: Users veem apenas suas sessões
CREATE POLICY "Users see own mindset sessions" ON public.mindset_sessions
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users create own mindset sessions" ON public.mindset_sessions
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Fitness Goals: Users veem apenas seus objetivos
CREATE POLICY "Users see own fitness goals" ON public.fitness_goals
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users manage own fitness goals" ON public.fitness_goals
  FOR ALL USING (auth.uid() = user_id);

-- Mindset Goals: Users veem apenas seus objetivos
CREATE POLICY "Users see own mindset goals" ON public.mindset_goals
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users manage own mindset goals" ON public.mindset_goals
  FOR ALL USING (auth.uid() = user_id);

-- =====================================================
-- 9. COMENTÁRIOS
-- =====================================================
COMMENT ON TABLE public.workouts IS 'Treinos de fitness - podem ser criados por users ou trainers';
COMMENT ON TABLE public.workout_sessions IS 'Sessões de treino completadas pelos users';
COMMENT ON TABLE public.meals IS 'Journaling de refeições com análise de IA';
COMMENT ON TABLE public.mindset_sessions IS 'Sessões de mentoria com IA usando personalidades famosas';
COMMENT ON TABLE public.fitness_goals IS 'Objetivos de fitness dos users';
COMMENT ON TABLE public.mindset_goals IS 'Objetivos de mindset e Network Marketing';

-- =====================================================
-- ✅ SCRIPT CONCLUÍDO
-- =====================================================

