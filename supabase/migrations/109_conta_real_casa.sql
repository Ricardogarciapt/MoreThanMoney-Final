-- 109 — CONTA REAL DA CASA: uma marca explícita e única para as contas MTM Funded que o dono
-- declarou reais (decisão de 17/09).
--
-- «estas contas o sistema deve considerar conta real; as de 1K são mesmo 1K sem regras. As de 10K
--  devem estar interligadas com as contas da The Trading Master (providers) … com equidade reflexa e
--  funded de 10%, ou seja 1K; e todas essas contas apresentam negociação real.»
--
-- Porque é uma coluna nova e não `metricas.analise = false`:
--   · `analise` continua a querer dizer «as regras do programa não quebram a conta» (motor da VPS,
--     trigger funded_forcar_analise da 092). Estas contas continuam SEM regras.
--   · `metricas` é regravada pelo motor da VPS a cada minuto (ler → juntar → gravar); uma chave posta
--     aqui podia perder-se nessa janela. A coluna não passa por lá.
--
-- Efeito (código no ramo contas-reais-casa):
--   · aviso do WebTrader e email de entrega → «Conta · MTM Funded · contém negociação real»;
--   · equidade (lib/equidade-mtm.ts): 1K a 100%; espelho de 10K a 10%; a conta-mestre MetaApi que o
--     espelho representa passa a 0% (sem dupla contagem).
--
-- NÃO mexe em saldos, posições, histórico, `metricas`, `conta_casa` nem `sem_regras`. O UPDATE só
-- toca em `conta_real_casa`, que não está na lista de colunas do trigger funded_forcar_analise.
-- As ligações espelho↔mestre (082) já estão feitas nas quatro estratégias; esta migração só
-- confirma que continuam (e pára se não estiverem).
-- Aditiva e idempotente.

begin;

alter table public.mtm_trading_accounts
  add column if not exists conta_real_casa boolean not null default false;

comment on column public.mtm_trading_accounts.conta_real_casa is
  'conta REAL da casa (109, decisão do dono 17/09): negociação real; sem regras continua a vir de metricas.analise. Equidade: 1K a 100%, espelho de estratégia a 10%, mestre representada a 0% (lib/equidade-mtm.ts).';

create index if not exists mtm_trading_accounts_real_casa_idx
  on public.mtm_trading_accounts (id) where conta_real_casa;

-- As 13 contas da captura do WebTrader, do dono (ricardogarciapt@proton.me), MTM Funded simuladas.
update public.mtm_trading_accounts a
   set conta_real_casa = true
 where a.mt5_login in (
         -- 10K — espelhos das estratégias (082)
         '77235875', -- GoldKiller
         '77296149', -- Premium
         '77094082', -- Sensei
         '77579900', -- Aurum Flow
         -- 1K
         '77720210', -- Tap to Trade
         '77549217', -- Todos os sinais
         '77899983', -- Wolf
         '77712101', -- King
         '77733534', -- Edge
         '77400732', -- GoldKiller
         '77748275', -- Aurum Flow
         '77917137', -- Sensei
         '77283960'  -- Premium
       )
   and a.motor = 'sim'
   and a.tipo = 'financiada'
   and a.user_id = (select p.id from public.profiles p where lower(p.email) = 'ricardogarciapt@proton.me' limit 1)
   and not a.conta_real_casa;

do $$
declare
  n int;
  sem_ligacao text;
begin
  -- Só estas 13 (re-correr depois de marcar outras contas não pode falhar).
  select count(*) into n from public.mtm_trading_accounts
   where conta_real_casa
     and mt5_login in ('77235875','77296149','77094082','77579900','77720210','77549217','77899983',
                       '77712101','77733534','77400732','77748275','77917137','77283960');
  if n <> 13 then
    raise exception '109: esperava 13 contas reais da casa, ficaram %', n;
  end if;

  -- Cada espelho de 10K tem de continuar ligado à sua estratégia (082).
  select string_agg(x.login || '→' || x.slug, ', ') into sem_ligacao
    from (values ('77296149', 'premium-ouro'), ('77094082', 'sensei'),
                 ('77579900', 'aurum-flow'), ('77235875', 'Goldkiller')) as x(login, slug)
   where not exists (
     select 1 from public.mtmauto_providers p
       join public.mtm_trading_accounts a on a.id = p.espelho_funded_account_id
      where p.slug = x.slug and a.mt5_login = x.login and a.conta_real_casa);
  if sem_ligacao is not null then
    raise exception '109: espelho(s) sem ligação à estratégia: %', sem_ligacao;
  end if;
end $$;

commit;
