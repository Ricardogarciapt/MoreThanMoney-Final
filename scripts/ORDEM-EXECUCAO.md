# Ordem de execução dos scripts (Supabase)

Para os **grupos de chat** (Social, Crypto, Forex, Trade) e os **treinos/planos alimentares padrão** aparecerem:

## 1. Sistema de grupos (chats)

No **SQL Editor** do Supabase, por esta ordem:

1. **`create-group-messages-system.sql`**  
   Cria as tabelas `group_conversations`, `group_members`, coluna `group_id` em `messages` e políticas RLS.

2. **`create-default-groups.sql`**  
   Cria os 4 grupos: Trade Chat, Crypto Chat, Forex Chat, Social Chat (com `is_public` e `is_mobile_visible` = true).

## 2. Fitness (treinos e refeições)

3. **`create-wger-inspired-schema.sql`**  
   Cria as tabelas `workouts`, `workout_days`, `meals`, etc. e políticas RLS.

## 3. Migrações RLS

4. **Migração 005** (`supabase/migrations/005_fitness_rls_meal_items.sql`)  
   Políticas para `workout_sets`, `workout_sessions`, `workout_set_logs`, `meal_items`, `weight_entries`, `body_measurements`.

5. **Migração 006** (`supabase/migrations/006_groups_and_fitness_rls.sql`)  
   Ajusta RLS dos grupos (ver grupos com `is_mobile_visible`) e garante políticas em `workouts`, `workout_days`, `meals`.

Se usares apenas o Dashboard: corre 005 e 006 no SQL Editor (copiando o conteúdo dos ficheiros).

## Resumo

| Objetivo              | Scripts / migrações |
|-----------------------|---------------------|
| Chats a aparecer      | 1 → 2 → 6           |
| Treinos/refeições     | 3 → 5 → 6           |

Depois de executar 006, os grupos e os treinos/planos alimentares padrão (criados pelo bootstrap em `/mindset-fitness`) devem passar a aparecer.
