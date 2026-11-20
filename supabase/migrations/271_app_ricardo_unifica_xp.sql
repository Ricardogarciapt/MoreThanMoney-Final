-- App do Ricardo deixa de ter contas e XP próprios: passa a usar a conta MoreThanMoney (Supabase Auth)
-- e o XP de sempre (user_xp / xp_log). rg_app_membros fica a «carteira» de cada conta: moedas,
-- sequência e dias activos. As patentes substituem os níveis de 1000 XP em todo o ecossistema.
-- (Tabelas vazias quando isto correu: sem dados a migrar.)

drop table if exists rg_app_sessoes;

alter table rg_app_membros drop column if exists pass_hash;
alter table rg_app_membros drop column if exists xp;
alter table rg_app_membros drop column if exists email;
alter table rg_app_membros drop column if exists nome;
alter table rg_app_membros drop column if exists telefone;
alter table rg_app_membros alter column id drop default;
alter table rg_app_membros drop constraint if exists rg_app_membros_perfil;
alter table rg_app_membros add constraint rg_app_membros_perfil foreign key (id) references profiles(id) on delete cascade;

-- XP das missões entra no mesmo registo que o chat, o feed e as lives.
insert into xp_config (action_type, action_name, xp_amount, max_per_day, description) values
  ('missao_concluida', 'Missão do dia', 20, null, 'XP de cada missão da app do Ricardo (valor vem da própria missão; tecto diário na economia da app)'),
  ('missao_dia_completo', 'Dia completo', 10, 1, 'Bónus por fazer as três missões do dia')
on conflict (action_type) do nothing;

-- Níveis passam a patentes (12): current_level = índice da patente + 1.
create or replace function mtm_patente_nivel(xp int) returns int language sql immutable as $$
  select case
    when xp >= 15000 then 12 when xp >= 11500 then 11 when xp >= 8800 then 10 when xp >= 6500 then 9
    when xp >= 4700 then 8 when xp >= 3300 then 7 when xp >= 2200 then 6 when xp >= 1400 then 5
    when xp >= 800 then 4 when xp >= 400 then 3 when xp >= 150 then 2 else 1 end
$$;
update user_xp set current_level = mtm_patente_nivel(coalesce(total_xp, 0)), updated_at = now();

-- Moedas somadas de forma atómica (missões, subidas de patente e devoluções escrevem ao mesmo tempo).
create or replace function rg_app_somar_moedas(p_id uuid, p_n int) returns int language sql security definer set search_path = public as $$
  update rg_app_membros set moedas = greatest(0, moedas + p_n) where id = p_id returning moedas
$$;
revoke all on function rg_app_somar_moedas(uuid, int) from public, anon, authenticated;
