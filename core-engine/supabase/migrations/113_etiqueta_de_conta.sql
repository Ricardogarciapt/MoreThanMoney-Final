-- 113 — ETIQUETA DE CONTA: o nome próprio que o DONO dá a cada conta (pedido do dono, 17/09)
--
-- «em /webtrader o utilizador deve poder pôr uma ETIQUETA (tag/nome próprio) na sua conta, e essa
--  etiqueta tem de aparecer no resto do sistema de contas.»
--
-- O seletor do WebTrader identifica as contas com o que a corretora dá — login, servidor, «MT5»,
-- «TradeLocker», «F1»/«Active». Quem tem várias contas do mesmo tipo vê linhas iguais e não sabe
-- qual é qual. A etiqueta é texto do dono («Conta grande», «Teste Sensei») e acompanha a conta em
-- todos os sítios onde ela aparece.
--
-- UMA coluna com o MESMO nome nas quatro tabelas onde as contas vivem (não há tabela partilhada):
--   · mtm_trading_accounts  — MTM Funded simuladas/reais
--   · mtmcopy_connections   — ligador do site (TradeLocker e MT5/MT4)
--   · mtmauto_accounts      — contas ligadas na app MTM Auto
--   · webtrader_contas_mt5  — contas MT5 abertas só no WebTrader
--
-- Porque uma coluna nova e não as que já existem (`account_label`, `rotulo`, `nome_exibicao`):
--   · essas são escritas pelo SISTEMA (nome da corretora, rótulo da ligação, nome de exibição do
--     admin) e algumas aparecem em ecrãs de administração — reescrevê-las com texto do utilizador
--     mudava o significado do que lá está hoje e podia apagar dados do admin;
--   · `etiqueta` fica a querer dizer só uma coisa: «o que o dono escreveu». Vazia (NULL) = sem
--     etiqueta, e cada ecrã mostra o nome que já mostrava — nada muda para quem não a usa.
--
-- Regras (lib/contas/etiqueta.ts, a única porta de escrita):
--   máx. 40 caracteres · sem `<` nem `>` (é texto, nunca marcação) · opcional (NULL) · só o dono
--   da conta (ou um admin) a escreve, pela rota PATCH /api/contas/etiqueta com o dono verificado
--   no servidor. O CHECK aqui é a rede de segurança: mesmo uma escrita por outro caminho não pode
--   passar dos 40 nem meter marcação.
--
-- ORDEM: pode aplicar-se ANTES ou DEPOIS do deploy. O código lê a coluna de forma tolerante — nas
-- tabelas lidas com `select('*')` a coluna em falta vem `undefined`, e em mtm_trading_accounts
-- `etiqueta` entrou nas COLUNAS_OPCIONAIS de lib/mtmfunded/numeros-conta.ts, que repete o select
-- sem ela se a base disser que não existe. Sem a migração a etiqueta simplesmente não aparece.
--
-- NÃO mexe em nenhuma coluna existente, nem em saldos, ligações, cópia ou execução.
-- Aditiva e idempotente.

begin;

alter table public.mtm_trading_accounts add column if not exists etiqueta text;
alter table public.mtmcopy_connections  add column if not exists etiqueta text;
alter table public.mtmauto_accounts     add column if not exists etiqueta text;
alter table public.webtrader_contas_mt5 add column if not exists etiqueta text;

comment on column public.mtm_trading_accounts.etiqueta is
  'Etiqueta do DONO da conta (113): nome próprio livre, máx. 40 caracteres, sem <>, NULL = sem etiqueta (mostra-se o nome de sempre). Escrita só em PATCH /api/contas/etiqueta, normalizada por lib/contas/etiqueta.ts.';
comment on column public.mtmcopy_connections.etiqueta is
  'Etiqueta do DONO da conta (113). Não confundir com account_label (rótulo da ligação, escrito pelo sistema) nem audit_label (auditoria).';
comment on column public.mtmauto_accounts.etiqueta is
  'Etiqueta do DONO da conta (113). Não confundir com rotulo/nome_exibicao (nome da corretora e nome posto no admin).';
comment on column public.webtrader_contas_mt5.etiqueta is
  'Etiqueta do DONO da conta (113). Não confundir com rotulo (nome dado ao abrir a conta no WebTrader).';

-- Rede de segurança na base, igual à regra de lib/contas/etiqueta.ts. As linhas que já existem têm
-- todas `etiqueta` a NULL (a coluna acabou de nascer) e NULL passa sempre — a validação é imediata.
do $$
declare
  t text;
begin
  for t in
    select x from unnest(array['mtm_trading_accounts', 'mtmcopy_connections', 'mtmauto_accounts', 'webtrader_contas_mt5']) as x
  loop
    if not exists (
      select 1 from pg_constraint
       where conname = t || '_etiqueta_ck'
         and conrelid = ('public.' || t)::regclass
    ) then
      execute format(
        'alter table public.%I add constraint %I check (etiqueta is null or (length(etiqueta) <= 40 and etiqueta !~ ''[<>]''))',
        t, t || '_etiqueta_ck');
    end if;
  end loop;
end $$;

-- Pára se alguma das quatro tabelas ficou de fora (nome mudado, tabela noutro esquema…).
do $$
declare
  faltam text;
begin
  select string_agg(x, ', ') into faltam
    from unnest(array['mtm_trading_accounts', 'mtmcopy_connections', 'mtmauto_accounts', 'webtrader_contas_mt5']) as x
   where not exists (
     select 1 from information_schema.columns
      where table_schema = 'public' and table_name = x and column_name = 'etiqueta');
  if faltam is not null then
    raise exception '113: tabela(s) sem a coluna etiqueta: %', faltam;
  end if;
end $$;

commit;

notify pgrst, 'reload schema';
