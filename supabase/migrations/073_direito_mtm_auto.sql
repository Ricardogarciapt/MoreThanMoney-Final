-- 073 · DIREITO AO MTM AUTO — UMA REGRA, NUM SÍTIO SÓ
--
-- Fase 1 da consolidação MTM Copy → MTM Auto. Até aqui a mesma pergunta ("este cliente pode ter
-- cópia automática?") tinha quatro respostas: getMtmcopySubscription e carregarDireitos no site,
-- podeVerMtmAuto na ponte da app-mobile, e temAcesso + membroDoMtm na app MTM Auto. Discordavam:
-- a app MTM Auto dava acesso ao Membro (app_member), o site não; o site aceitava um checkout do
-- MTM Copy sem data; e uma isenção 'cliente_mtm' gravada uma vez nunca mais era revista, mesmo
-- depois de a pessoa deixar de pagar.
--
-- A regra (decisão do dono, 2026-09-15), por ordem:
--   1. suspenso no MTM Auto               → NÃO (manda em tudo)
--   2. admin (site ou MTM Auto)           → sim · 'admin'
--   3. subscrição Stripe do MTM Auto      → sim · 'mtmauto_stripe'  (active/trialing)
--   4. subscrição App Store do MTM Auto   → sim · 'mtmauto_apple'   (grace, ou active dentro do prazo)
--   5. MTM Copy legado, pago e DATADO     → sim · 'legado_mtmcopy'  (expires_at > agora; sem data não conta)
--   6. isenção gravada no MTM Auto        → sim · 'mtmauto_isento'  (EXCEPTO motivo 'cliente_mtm': essa é
--                                           derivada do perfil do site e revê-se sempre, nos pontos 8–10)
--   7. acesso manual/cupão dentro do prazo → sim · 'mtmauto_manual'
--   Do perfil do site (só se user_type <> 'inactive' E is_active — o `inactive` perde tudo):
--   8. VIP (user_type OU member_category)  → sim · 'vip'
--   9. Premium/Fundador activo e no prazo  → sim · 'premium'
--  10. Membro (app_member) activo          → sim · 'membro_mtm' SÓ se p_app_member_sem_acesso = false
--                                           (flag MTMAUTO_APP_MEMBER_SEM_ACESSO; por defeito o Membro NÃO tem)
--   caso contrário                         → NÃO · 'nenhum'
--
-- Espelhada em TypeScript (lib/entitlements.ts no site, lib/direito.ts no MTM Auto) para os testes
-- e como recurso se esta função ainda não existir. Mudar a regra = mudar os três + os testes.
--
-- SECURITY DEFINER e só para service_role: diz o plano de qualquer utilizador, não pode ficar ao
-- alcance da chave anon (ver a lição das RPC definer abertas ao público).

create or replace function public.direito_mtm_auto(
  p_user uuid,
  p_app_member_sem_acesso boolean default true
)
returns table(tem boolean, motivo text)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  p record;
  a record;
  agora timestamptz := now();
  tipo text;
  categoria text;
  plano text;
  nivel text;
  estado_ok boolean;
  no_prazo boolean;
begin
  select pr.user_type, pr.member_category, pr.subscription_plan, pr.membership_level, pr.is_active,
         pr.subscription_status, pr.subscription_expires_at,
         pr.mtmcopy_subscription_active, pr.mtmcopy_subscription_expires_at
    into p
    from profiles pr
   where pr.id = p_user;

  select u.papel, u.subscricao, u.isento, u.motivo_isencao, u.acesso_manual, u.acesso_ate, u.suspenso,
         u.apple_estado, u.apple_expira_em
    into a
    from mtmauto_users u
   where u.user_id = p_user;

  -- 1. Suspensão
  if coalesce(a.suspenso, false) then
    return query select false, 'suspenso'::text; return;
  end if;

  tipo := lower(coalesce(p.user_type, ''));
  categoria := lower(coalesce(p.member_category, ''));
  plano := lower(coalesce(p.subscription_plan, ''));
  nivel := lower(coalesce(p.membership_level, ''));

  -- 2. Admin
  if tipo = 'admin' or coalesce(a.papel, '') = 'admin' then
    return query select true, 'admin'::text; return;
  end if;

  -- 3. Stripe do MTM Auto
  if coalesce(a.subscricao, '') in ('active', 'trialing') then
    return query select true, 'mtmauto_stripe'::text; return;
  end if;

  -- 4. App Store do MTM Auto
  if coalesce(a.apple_estado, '') = 'grace'
     or (coalesce(a.apple_estado, '') = 'active' and (a.apple_expira_em is null or a.apple_expira_em > agora)) then
    return query select true, 'mtmauto_apple'::text; return;
  end if;

  -- 5. MTM Copy legado: pago e com data
  if coalesce(p.mtmcopy_subscription_active, false)
     and p.mtmcopy_subscription_expires_at is not null
     and p.mtmcopy_subscription_expires_at > agora then
    return query select true, 'legado_mtmcopy'::text; return;
  end if;

  -- 6. Isenção gravada (a 'cliente_mtm' não conta: revê-se abaixo, pelo perfil de hoje)
  if coalesce(a.isento, false) and coalesce(a.motivo_isencao, '') <> 'cliente_mtm' then
    return query select true, 'mtmauto_isento'::text; return;
  end if;

  -- 7. Acesso manual / cupão
  if coalesce(a.acesso_manual, false) and (a.acesso_ate is null or a.acesso_ate > agora) then
    return query select true, 'mtmauto_manual'::text; return;
  end if;

  -- 8–10. Perfil do site. `inactive` ou is_active = false fecham tudo o que vem do site.
  if p.user_type is not null and tipo <> 'inactive' and coalesce(p.is_active, false) then
    if tipo = 'vip' or categoria = 'vip' then
      return query select true, 'vip'::text; return;
    end if;

    estado_ok := lower(coalesce(p.subscription_status, '')) not in ('canceled', 'unpaid', 'incomplete_expired');
    no_prazo := p.subscription_expires_at is null or p.subscription_expires_at > agora;

    if estado_ok and no_prazo and (
         plano like '%premium%' or plano like '%founder%' or plano like '%fundador%' or plano like '%elite%'
         or categoria like '%premium%' or categoria like '%fundador%'
         or nivel like '%premium%' or nivel like '%founder%' or nivel like '%fundador%'
       ) then
      return query select true, 'premium'::text; return;
    end if;

    if not coalesce(p_app_member_sem_acesso, true)
       and estado_ok and no_prazo
       and (plano like '%app_member%' or plano like '%membro%' or categoria like '%membro%') then
      return query select true, 'membro_mtm'::text; return;
    end if;
  end if;

  return query select false, 'nenhum'::text;
end;
$$;

revoke all on function public.direito_mtm_auto(uuid, boolean) from public;
revoke all on function public.direito_mtm_auto(uuid, boolean) from anon;
revoke all on function public.direito_mtm_auto(uuid, boolean) from authenticated;
grant execute on function public.direito_mtm_auto(uuid, boolean) to service_role;

comment on function public.direito_mtm_auto(uuid, boolean) is
  'Fase 1 MTM Copy→MTM Auto: direito único à cópia automática (site + app MTM Auto). Espelho TS em lib/entitlements.ts e mtm-auto lib/direito.ts.';
