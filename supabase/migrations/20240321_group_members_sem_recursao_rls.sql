-- 05/10/2026 (aplicada em produção pela Management API nesse dia): a política SELECT de
-- group_members lia a própria group_members → «infinite recursion detected in policy» em TODA
-- a leitura da tabela (73 erros em 2 h nos postgres_logs; o chat de grupos não abria). A
-- verificação passa para funções SECURITY DEFINER, que não passam pela RLS — a forma canónica.
create or replace function public.mtm_e_membro_do_grupo(gid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.group_members gm where gm.group_id = gid and gm.user_id = auth.uid());
$$;
revoke all on function public.mtm_e_membro_do_grupo(uuid) from public;
grant execute on function public.mtm_e_membro_do_grupo(uuid) to authenticated;

create or replace function public.mtm_e_admin_do_grupo(gid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.group_members gm where gm.group_id = gid and gm.user_id = auth.uid() and gm.role in ('admin','moderator'));
$$;
revoke all on function public.mtm_e_admin_do_grupo(uuid) from public;
grant execute on function public.mtm_e_admin_do_grupo(uuid) to authenticated;

drop policy if exists "Users can view members of their groups" on public.group_members;
create policy "Users can view members of their groups" on public.group_members
  for select to authenticated using (public.mtm_e_membro_do_grupo(group_id));

-- A política de INSERT dos admins comparava group_id consigo próprio (sempre verdade) e
-- auto-referia-se; passa a verificar o grupo certo.
drop policy if exists "Group admins can add members" on public.group_members;
create policy "Group admins can add members" on public.group_members
  for insert to authenticated with check (public.mtm_e_admin_do_grupo(group_id));
