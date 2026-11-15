-- 229 — 03/11/2026: completa a troca Premium → Premium II (pedido do Ricardo).
--
-- A 226 só migrou quem COPIAVA (ativo + auto_aceitar). Faltavam:
--   · quem segue o Premium só com avisos (ativo, sem auto_aceitar) no MTM Auto;
--   · as contas MTM Funded (SIM) que seguem a estratégia por `segue_estrategia`.
-- Mesma regra de acesso; quem não tem acesso ao Premium II fica no Premium (Rubens e Lucas, decisão do Ricardo).
begin;
create temporary table _acesso_ii on commit drop as
select pr.id as user_id
from profiles pr
left join mtmauto_users a on a.user_id = pr.id
where lower(coalesce(pr.user_type, '')) = 'admin' or a.papel = 'admin'
   or (pr.is_active is not false and (
        lower(coalesce(pr.user_type, '')) = 'vip'
        or lower(coalesce(pr.member_category, '')) in ('vip', 'iq')
        or lower(coalesce(pr.member_category, '') || ' ' || coalesce(pr.membership_level, '') || ' ' || coalesce(pr.subscription_plan, '')) ~ '(premium|fundador|founder)'))
   or a.subscricao in ('active', 'trialing')
   or a.apple_estado = 'grace' or (a.apple_estado = 'active' and (a.apple_expira_em is null or a.apple_expira_em > now()))
   or pr.broker_verified is true
   or exists (select 1 from telegram_leads t where lower(t.email) = lower(pr.email) and t.stage = 'granted')
   or (a.isento is true and a.motivo_isencao = 'corretora_parceira')
   or exists (select 1 from mtmauto_broker_claims b where b.user_id = pr.id and b.aprovado is true)
   or exists (select 1 from mtmauto_accounts x where x.user_id = pr.id and coalesce(x.demo, false) = false and coalesce(x.plataforma, '') <> 'mtmfunded' and x.servidor ilike '%puprime%' and x.servidor not ilike '%demo%')
   or exists (select 1 from mtmcopy_connections x where x.user_id = pr.id and x.mt5_status <> 'disconnected' and x.mt5_server ilike '%puprime%' and x.mt5_server not ilike '%demo%');

create temporary table _migrar_avisos on commit drop as
select s.* from mtmauto_subscriptions s
join mtmauto_providers p on p.id = s.provider_id and p.slug = 'premium-ouro'
where s.ativo is true and s.user_id in (select user_id from _acesso_ii);

insert into mtmauto_subscriptions (user_id, provider_id, ativo, auto_aceitar, risco_pct, lote_fixo, modo_risco, multiplicador, max_posicoes, be_ativo, be_gatilho, trailing_ativo, saidas_pct, simbolos, conta_id)
select m.user_id, (select id from mtmauto_providers where slug = 'mtm-auto-premium-ii'), true, m.auto_aceitar,
       m.risco_pct, m.lote_fixo, m.modo_risco, m.multiplicador, m.max_posicoes, m.be_ativo, m.be_gatilho, m.trailing_ativo, m.saidas_pct, m.simbolos, m.conta_id
from _migrar_avisos m
on conflict (user_id, provider_id) do update set ativo = true, auto_aceitar = mtmauto_subscriptions.auto_aceitar or excluded.auto_aceitar;

update mtmauto_subscriptions s set ativo = false, auto_aceitar = false from _migrar_avisos m where s.id = m.id;

update mtm_trading_accounts set segue_estrategia = 'mtm-auto-premium-ii', updated_at = now()
where segue_estrategia = 'premium-ouro' and estado = 'ativa' and coalesce(conta_casa, false) = false
  and user_id in (select user_id from _acesso_ii);
commit;
