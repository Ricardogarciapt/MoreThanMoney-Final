# Deploy do Schema Mindset & Fitness no Supabase

## Método 1: Via Supabase Dashboard (Recomendado)

1. Acede ao [Supabase Dashboard](https://app.supabase.com)
2. Seleciona o projeto: `iwscxotvmtkphajmasof`
3. Vai para **SQL Editor**
4. Cria uma nova query
5. Copia e cola o conteúdo do ficheiro `scripts/deploy-mindset-fitness.sql`
6. Clica em **Run** para executar

## Método 2: Via Supabase CLI

Se tiveres o Supabase CLI configurado:

```bash
# Link ao projeto (se ainda não estiver linkado)
supabase link --project-ref iwscxotvmtkphajmasof

# Executar o script SQL
supabase db execute -f scripts/deploy-mindset-fitness.sql
```

## Método 3: Via psql (se tiveres acesso direto)

```bash
psql "postgresql://postgres:[PASSWORD]@[HOST]:5432/postgres" -f scripts/deploy-mindset-fitness.sql
```

## Verificação

Após executar o script, verifica se as tabelas foram criadas:

```sql
-- Verificar tabelas criadas
SELECT table_name 
FROM information_schema.tables 
WHERE table_schema = 'public' 
AND table_name IN ('workouts', 'workout_sessions', 'meals', 'mindset_sessions', 'fitness_goals', 'mindset_goals');

-- Verificar políticas RLS
SELECT tablename, policyname 
FROM pg_policies 
WHERE schemaname = 'public' 
AND tablename IN ('workouts', 'workout_sessions', 'meals', 'mindset_sessions', 'fitness_goals', 'mindset_goals');
```

## Tabelas Criadas

1. **workouts** - Treinos de fitness
2. **workout_sessions** - Sessões de treino completadas
3. **meals** - Journaling de refeições
4. **mindset_sessions** - Sessões de mentoria IA
5. **fitness_goals** - Objetivos de fitness
6. **mindset_goals** - Objetivos de mindset/NWM

## Notas Importantes

- O script é **idempotente** - pode ser executado múltiplas vezes sem problemas
- Todas as tabelas têm **Row Level Security (RLS)** ativado
- As políticas garantem que users só veem seus próprios dados
- Personal Trainers (VIP) podem ver e editar treinos de todos os users

