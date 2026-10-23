-- 207 — Seguidoras SIM nas rotas das mestres (23/10/2026).
--
-- As rotas «só manuais» da 206 (mestre Premium 77296149 → seguidoras premium-ouro) têm destino
-- `funded:`. Em produção só as rotas `mestres=true` escrevem (MESTRES_ESCRITA=1; COPIA_ESCRITA está
-- desligado), por isso estas rotas passam a ser das mestres. O motor das mestres lê o modo por conta
-- em mestres_contas, que até aqui só aceitava contas site/auto/wt — passa a aceitar `funded:` também.
-- tipo_rota fica 'conta': sincronizarRotasDaEstrategia só gere 'estrategia' e não lhes toca.

alter table public.mestres_contas drop constraint if exists mestres_contas_conta_ref_check;
alter table public.mestres_contas add constraint mestres_contas_conta_ref_check
  check (conta_ref ~ '^(site|auto|wt|funded):[0-9a-f-]{36}$');

insert into public.mestres_contas (conta_chave, conta_ref, user_id, modo, max_posicoes, max_risco_total_pct, notas)
select destino_chave, destino_ref, user_id, 'live', 10, 6,
       'Seguidora Premium · cópia das trades manuais da 77296149 · 23/10'
  from public.copia_rotas
 where origem_chave = 'mtmfunded:1c6a3789-6981-465e-8d28-375a4079a352' and so_manuais
on conflict (conta_chave) do nothing;

update public.copia_rotas set mestres = true
 where origem_chave = 'mtmfunded:1c6a3789-6981-465e-8d28-375a4079a352' and so_manuais;
