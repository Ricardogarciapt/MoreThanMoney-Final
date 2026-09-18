-- PREMIUM PELA MESTRE SIM — configuração (NÃO CORRIDO; rever antes).
--
-- Mestre do Premium = conta SIM da casa «espelho Premium 10K»
--   mtm_trading_accounts 1c6a3789-6981-465e-8d28-375a4079a352 (MTM Funded, login 77296149, motor sim)
--   = mtmauto_providers.espelho_funded_account_id do provider premium-ouro (0dcaa42d-ef4b-431f-9090-901267a10e74).
-- Sinal: Signal Master Elite → gmi-relay (VPS) → /api/telegram/relay-post → processador → lib/mestres/servidor/premium.ts
-- Propagação: serviço VPS mtm-copia-contas (rotas copia_rotas mestres=true, estrategia_slug='premium-ouro').
--
-- CopyFactory do Premium: Hvmg (conta MT5 a21178c2 — a VIVA, 3 subscritores a 18/09: 9c7f56d3 «Mario Oliveira
-- FXIFY», b5ed2646 «Pedro Goncalves», 215653b1 «Rúben Daniel Sousa») + MxsR (530d2e07, já não existe na
-- CopyFactory mas ainda está em copyfactory_strategy_pick e na rota canonical-premium-signals) + 9gsL (apagada).
--
-- Tudo nasce em SOMBRA:
--   sinal_modo='sombra' → cada sinal Premium grava em mestres_sinais o que a mestre abriria (lote, gestão); não abre.
--                         O legado continua exactamente como está (só se corta com sinal_modo='live').
--   modo='sombra'       → propagação mestre → clientes só regista (mestres_ordens estado 'sombra').
--   t2t_modo='sombra'   → aceites T2T do chat Premium registam o que o motor faria; o T2T de sempre executa.
--   incluir_mtmauto=false → as contas MTM Auto ficam de fora (o premium-ouro está ativo=false no MTM Auto desde 17/09).
--
-- Gestão na mestre = sinais_config do premium-ouro (lida em cada sinal, sem cópia aqui):
--   {"perfil":"zona","beGatilhoPips":25,"beOffsetPips":2,"trailingInicioPips":30,"trailingDistanciaPips":15,"trailingPassoPips":3}
--   saídas por omissão 50% no TP1 + 25% no TP2 + resto com trailing até ao último TP; lote 0,01 por 1 000 de saldo.
--
-- Idempotente: repetir não muda uma linha que já esteja em live.

begin;

do $$
declare
  v_prov record;
  v_conta record;
begin
  select id, slug, espelho_funded_account_id, apagado_em into v_prov
    from public.mtmauto_providers where id = '0dcaa42d-ef4b-431f-9090-901267a10e74';
  if v_prov.id is null or v_prov.slug <> 'premium-ouro' or v_prov.apagado_em is not null then
    raise exception 'provider premium-ouro (0dcaa42d) não encontrado ou apagado';
  end if;
  if v_prov.espelho_funded_account_id is distinct from '1c6a3789-6981-465e-8d28-375a4079a352'::uuid then
    raise exception 'o espelho do premium-ouro já não é a 1c6a3789 (é %) — rever antes de ligar', v_prov.espelho_funded_account_id;
  end if;
  select id, motor, estado into v_conta from public.mtm_trading_accounts where id = '1c6a3789-6981-465e-8d28-375a4079a352';
  if v_conta.id is null or v_conta.motor <> 'sim' or v_conta.estado <> 'ativa' then
    raise exception 'conta mestre 1c6a3789 não é uma conta simulada activa';
  end if;
end $$;

insert into public.mestres_estrategias
  (provider_id, slug, conta_mestre_id, modo, sinal_modo, t2t_modo, incluir_mtmauto, copyfactory_ids, max_atraso_abertura_s, notas)
values
  ('0dcaa42d-ef4b-431f-9090-901267a10e74', 'premium-ouro', '1c6a3789-6981-465e-8d28-375a4079a352',
   'sombra', 'sombra', 'sombra', false, array['Hvmg', 'MxsR', '9gsL'], 30,
   'Premium pela mestre SIM (espelho Premium 10K) — sinal SME via relay-post; ligado em sombra por scripts/mestres/premium-ligar.sql')
on conflict (provider_id) do update
   set conta_mestre_id = excluded.conta_mestre_id,
       copyfactory_ids = excluded.copyfactory_ids,
       modo            = case when public.mestres_estrategias.modo = 'live' then public.mestres_estrategias.modo else 'sombra' end,
       sinal_modo      = case when public.mestres_estrategias.sinal_modo = 'live' then public.mestres_estrategias.sinal_modo else 'sombra' end,
       t2t_modo        = case when public.mestres_estrategias.t2t_modo = 'live' then public.mestres_estrategias.t2t_modo else 'sombra' end,
       notas           = excluded.notas;

-- conferir
select slug, conta_mestre_id, modo, sinal_modo, t2t_modo, incluir_mtmauto, copyfactory_ids, copyfactory_cortado_em
  from public.mestres_estrategias where slug = 'premium-ouro';

commit;

-- ════════════════════════════════════════════════════════════════════════════════════════════════════
-- PASSOS SEGUINTES (NÃO fazem parte deste ficheiro — um de cada vez, pela ordem, ver o relatório):
--
-- (A) LIVE — só depois do corte da CopyFactory (scripts/mestres/cortar-copyfactory.ts --estrategia premium-ouro --aplicar)
--     e SEM posições Premium abertas pela rota antiga:
--
--   select count(*) from mtmcopy_premium_active where status = 'open';               -- tem de dar 0
--   select count(*) from mtmcopy_premium_pending where status = 'pending';           -- tem de dar 0
--   select copyfactory_cortado_em from mestres_estrategias where slug = 'premium-ouro'; -- não pode ser null
--
--   begin;
--   update mtmauto_providers set espelho_provider_ativo = false where slug = 'premium-ouro';   -- o código também o desliga
--   update mestres_estrategias set sinal_modo = 'live', modo = 'live' where slug = 'premium-ouro';
--   insert into mestres_contas (conta_chave, conta_ref, user_id, modo)
--     select distinct on (destino_chave) destino_chave, destino_ref, user_id, 'live'
--       from copia_rotas where mestres and tipo_rota = 'estrategia' and estrategia_slug = 'premium-ouro' and ativa
--     on conflict (conta_chave) do update set modo = 'live';
--   commit;
--
-- (B) ROLLBACK (≤ 5 s no site, ≤ 2 s no VPS):
--   npx tsx scripts/mestres/kill.ts on        -- se houver ordens a sair mal
--   update mestres_estrategias set sinal_modo = 'sombra', modo = 'sombra' where slug = 'premium-ouro';
--   -- o legado volta sozinho (execução directa por grupo Telegram; a rota MT5 canonical-premium-signals continua
--   -- enabled=false como estava). Para voltar à CopyFactory Hvmg:
--   update mestres_estrategias set copyfactory_cortado_em = null where slug = 'premium-ouro';
--   -- + re-subscrever no admin «MTM Auto · Cópia › Estratégias» (Re-sync com releitura).
--   update mtmauto_providers set espelho_provider_ativo = true where slug = 'premium-ouro';  -- só se se quiser o espelho da MT5 de volta
