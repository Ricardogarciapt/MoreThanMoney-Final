-- Liga RLS na tabela legacy public.users (a única de 11 que ainda tinha RLS off).
-- Padrão "server-only": SEM políticas permissivas -> anon/authenticated ficam em
-- default-deny; apenas o service role (rotas server-side) e funções SECURITY DEFINER
-- continuam a passar.
--
-- Pré-requisito: as rotas que liam/escreviam esta tabela com o cliente ANÓNIMO foram
-- corrigidas para (a) derivar o utilizador da sessão autenticada e (b) usar o cliente
-- service role. Ver app/api/profile/update e app/api/profile/role-request (agora
-- apontam para public.profiles, a tabela de perfis real).

alter table public.users enable row level security;
