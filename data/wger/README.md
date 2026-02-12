# Dados de referência wger

Ficheiros necessários do projeto [wger](https://github.com/wger-project/wger), mantidos no repositório para filtros, dropdowns e seed na Supabase.

## Conteúdo

- **categories.json** – Categorias de exercício (Arms, Legs, Abs, Chest, Back, Shoulders, Calves, Cardio).
- **equipment.json** – Equipamento (Barbell, Dumbbell, bodyweight, Kettlebell, etc.).
- **muscles.json** – Músculos com nome e nome_en para exibição.
- **mappings.json** – Mapeamento nome wger → enums do schema Supabase (`exercises.category`, `exercises.equipment`).
- **exercises-seed.json** – Lista de exercícios para seed na tabela `public.exercises` (Supabase).

## Supabase

- O schema está em `scripts/create-wger-inspired-schema.sql` (tabelas `exercises`, `workouts`, `workout_days`, `workout_sets`, `workout_sessions`, `workout_set_logs`, `ingredients`, `meals`, `meal_items`, `weight_entries`, `body_measurements`).
- Para popular exercícios iniciais a partir de `exercises-seed.json`:
  ```bash
  export NEXT_PUBLIC_SUPABASE_URL="https://..."
  export SUPABASE_SERVICE_ROLE_KEY="..."
  node scripts/seed-wger-to-supabase.mjs
  ```
- A API `GET /api/fitness/wger-reference` devolve categorias, equipamento, músculos e mappings para a UI.

## Uso na aplicação

- **API** – `lib/wger-data.ts` (servidor) lê estes JSON e expõe `getWgerCategories()`, `getWgerEquipment()`, `getWgerMuscles()`, `getWgerMappings()`, e funções `wgerCategoryToSchema` / `wgerEquipmentToSchema`.
- **Frontend** – Chamar `GET /api/fitness/wger-reference` para filtros e dropdowns; criar/editar exercícios e planos via APIs que gravam na Supabase.
