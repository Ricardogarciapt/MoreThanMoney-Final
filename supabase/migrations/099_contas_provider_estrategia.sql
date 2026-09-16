-- 098 — A CONTA MESTRE DE CADA ESTRATÉGIA É UM DADO, NÃO CÓDIGO.
--
-- Incidente 2026-09-16: as estratégias da casa não abriam sinais nenhuns. As contas provider MT5
-- existiam — o agente do VPS criou uma por estratégia na The Trading Master (19036 Premium,
-- 19037 Sensei, 19038 GoldKiller, 19040 Aurum Flow, 19042 MTM Scanner) e estão ligadas à MetaApi —
-- mas o código apontava para as contas ANTIGAS, apagadas a 15/09 e postas a `null` nas constantes
-- `CANONICAL_*_ACCOUNT_ID` para parar o estrangulamento do token. `null` quer dizer «não executa»:
-- o sinal chegava, a rota não tinha conta, nada abria. Sem posições na mestre, o espelho (070)
-- também não tinha nada para levar às contas MTM Funded dos seguidores — daí «as MTM Funded não
-- receberam nada».
--
-- A correcção vive no código (lib/mtmcopy/contas-provider-estrategia.ts): a conta resolve-se da
-- BASE, por `mtm_trading_accounts.provider_slug`, com `mtmauto_providers.metaapi_account_id` como
-- verificação cruzada e as constantes como último recurso. Esta migração só põe a base em
-- condições de responder depressa e de forma inequívoca a essa pergunta.
--
-- Aditiva e idempotente. Não mexe em dinheiro, não liga nem desliga nenhuma estratégia.

begin;

-- ── 1. a pergunta «qual é a conta desta estratégia?» tem de ser barata ───────
create index if not exists mtm_trading_accounts_provider_slug_idx
  on public.mtm_trading_accounts (provider_slug)
  where tipo = 'provider' and provider_slug is not null;

comment on column public.mtm_trading_accounts.provider_slug is
  'estratégia (mtmauto_providers.slug) a que esta conta serve de MESTRE. Em contas tipo=provider é '
  'a fonte de verdade do id MetaApi da estratégia — ver lib/mtmcopy/contas-provider-estrategia.ts. '
  'Quem cria estas contas é o agente MT5 do VPS; nunca voltar a escrever ids à mão no código.';

-- Duas contas provider VIVAS para a mesma estratégia é ambiguidade: quem executa? O índice deixa
-- a situação acontecer (uma conta nova pode conviver um dia com a antiga) mas o código escolhe a
-- que bate certo com o provider e, não havendo, a mais recente — e REPORTA a divergência.
create index if not exists mtm_trading_accounts_provider_metaapi_idx
  on public.mtm_trading_accounts (metaapi_account_id)
  where tipo = 'provider' and metaapi_account_id is not null;

-- ── 2. reconciliar mtmauto_providers com a conta provider viva ──────────────
-- O provider é o que o painel do MTM Auto e o ESPELHO (070, services/funded-motor/
-- espelho-estrategias.ts) lêem para saber que conta seguir. Enquanto apontar para uma conta
-- apagada, as contas MTM Funded com `segue_estrategia` não seguem nada — foi metade do incidente.
--
-- Só se corrige quando a conta provider existe, está ativa e tem id MetaApi. Nada é inventado.
update public.mtmauto_providers p
   set metaapi_account_id = c.metaapi_account_id,
       updated_at = now()
  from public.mtm_trading_accounts c
 where lower(c.provider_slug) = lower(p.slug)
   and c.tipo = 'provider'
   and c.estado = 'ativa'
   and c.motor = 'mt5'
   and c.metaapi_account_id is not null
   and p.apagado_em is null
   and p.metaapi_account_id is distinct from c.metaapi_account_id;

-- ── 3. deixar escrito quem NÃO executa ──────────────────────────────────────
-- O MTM Scanner tem conta (19042) e não negoceia — decisão do dono. Fica na coluna para não voltar
-- a parecer esquecimento; o código repete-a em SLUGS_QUE_NAO_EXECUTAM.
comment on column public.mtmauto_providers.metaapi_account_id is
  'conta MESTRE da estratégia na MetaApi. Reconciliada com mtm_trading_accounts (tipo=provider, '
  'provider_slug) — a conta do VPS é a que negoceia. O MTM Scanner tem conta e NÃO executa.';

commit;
