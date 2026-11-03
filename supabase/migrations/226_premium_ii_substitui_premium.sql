-- 03/11/2026 (pedido do Ricardo): quem copia o MTM Auto Premium (mestre 77296149) passa a copiar o
-- MTM Auto Premium II (mestre MTM Funded 77710365). O Premium continua no catálogo do MTM Auto para
-- quem o quiser seguir.
--
-- Acesso (lib/acesso-estrategias.ts): Premium II só para Premium (65 €) ou acima, assinantes pagos
-- do MTM Auto ou corretora validada. Quem copia o Premium SEM esse acesso fica no Premium (não perde
-- a cópia por causa da troca).
--
-- As rotas (copia_rotas) são DERIVADAS: aqui muda-se só o DESEJO (mtmauto_subscriptions e
-- mtmcopy_connections.strategy_lots) e a sincronização das rotas faz o resto. Rotas do Premium com
-- posições abertas ficam activas e pausadas até essas posições fecharem (planoDeEscrita.retirar).

begin;

-- 1. A estratégia Premium II passa a copiar para clientes (antes só a mestre executava).
update mestres_estrategias
set modo = 'live', t2t_modo = 'live', incluir_mtmauto = true,
    mtmauto_cortado_em = coalesce(mtmauto_cortado_em, now()),
    notas = coalesce(notas, '') || ' · 03/11: live para clientes — substitui o MTM Auto Premium nas cópias (pedido do Ricardo)',
    updated_at = now()
where slug = 'mtm-auto-premium-ii';

-- 2. Quem tem acesso ao Premium II (mesma regra de lib/acesso-estrategias-servidor.ts).
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

-- 3. MTM Auto: subscrição Premium a copiar (ativo + auto_aceitar) → Premium II com a mesma configuração.
create temporary table _migrar_auto on commit drop as
select s.*
from mtmauto_subscriptions s
join mtmauto_providers p on p.id = s.provider_id and p.slug = 'premium-ouro'
where s.ativo is true and s.auto_aceitar is true
  and s.user_id in (select user_id from _acesso_ii);

insert into mtmauto_subscriptions (user_id, provider_id, ativo, auto_aceitar, risco_pct, lote_fixo, modo_risco, multiplicador, max_posicoes, be_ativo, be_gatilho, trailing_ativo, saidas_pct, simbolos, conta_id)
select m.user_id, (select id from mtmauto_providers where slug = 'mtm-auto-premium-ii'), true, true,
       m.risco_pct, m.lote_fixo, m.modo_risco, m.multiplicador, m.max_posicoes, m.be_ativo, m.be_gatilho, m.trailing_ativo, m.saidas_pct, m.simbolos, m.conta_id
from _migrar_auto m
on conflict (user_id, provider_id) do update
set ativo = true, auto_aceitar = true,
    risco_pct = excluded.risco_pct, lote_fixo = excluded.lote_fixo, modo_risco = excluded.modo_risco,
    multiplicador = excluded.multiplicador, max_posicoes = excluded.max_posicoes, be_ativo = excluded.be_ativo,
    be_gatilho = excluded.be_gatilho, trailing_ativo = excluded.trailing_ativo, saidas_pct = excluded.saidas_pct,
    simbolos = excluded.simbolos, conta_id = coalesce(excluded.conta_id, mtmauto_subscriptions.conta_id);

update mtmauto_subscriptions s
set ativo = false, auto_aceitar = false
from _migrar_auto m
where s.id = m.id;

-- 4. Site: strategy_lots {"premium-ouro": …} → {"mtm-auto-premium-ii": …} (o mesmo lote).
update mtmcopy_connections c
set strategy_lots = (c.strategy_lots - 'premium-ouro') || jsonb_build_object('mtm-auto-premium-ii', c.strategy_lots -> 'premium-ouro'),
    copyfactory_strategy_pick = case when c.copyfactory_strategy_pick in ('Hvmg', 'MxsR', '9gsL') then null else c.copyfactory_strategy_pick end,
    updated_at = now()
where c.strategy_lots ? 'premium-ouro'
  and c.mt5_status <> 'disconnected'
  and c.user_id in (select user_id from _acesso_ii);

commit;
