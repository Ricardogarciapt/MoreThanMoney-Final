-- 139 — As colunas das exportações que o importador estava a deitar fora
--
-- O dono perguntou se não se tinha perdido nenhum dado das contas de corretora. Os ficheiros
-- estavam íntegros (218 contas, nenhuma repetida), mas o IMPORTADOR guardava só parte das colunas:
-- 13 de 20 na PU Prime, 11 de 18 na VT Markets, 13 de 17 na Hantec.
--
-- A perda que mais custava era o `ID de usuário`. É o campo que agrupa várias contas à MESMA
-- pessoa: sem ele, as 33 contas da PU Prime parecem 33 clientes quando são NOVE pessoas com várias
-- contas cada. Um painel que diz 33 onde há 9 não está a arredondar — está a contar outra coisa, e
-- saíam decisões de negócio daqui.

alter table public.ib_contas add column if not exists cliente_externo_id text;
alter table public.ib_contas add column if not exists jornada text;
alter table public.ib_contas add column if not exists levantamentos_usd numeric;
alter table public.ib_contas add column if not exists tier text;
alter table public.ib_contas add column if not exists campanha text;
alter table public.ib_contas add column if not exists pais text;
alter table public.ib_contas add column if not exists lucro numeric;
alter table public.ib_contas add column if not exists credito numeric;
alter table public.ib_contas add column if not exists ultimo_instrumento text;

-- Porque é que cada uma ficou:
--  · `cliente_externo_id` — agrupa contas por pessoa (PU Prime «ID de usuário», VT «User ID»).
--  · `jornada` — «Financiada», «Trading em 30 dias». Diz se a conta está viva, e é disso que
--    depende valer a pena falar com a pessoa esta semana ou daqui a três meses.
--  · `levantamentos_usd` — sem eles, «depositou 6300» esconde que também levantou 7710. Há uma
--    conta na Hantec exactamente assim, e o líquido dela é negativo.
--  · `tier` — o nível do IB que trouxe a conta: distingue um cliente nosso de um cliente de um
--    sub-IB nosso, e daí sai quem recebe o quê.
--  · `campanha` — «morethanmoney» aparece em duas contas da PU Prime: são as únicas que sabemos
--    terem vindo de nós.

create index if not exists ib_contas_cliente_externo_idx
  on public.ib_contas (corretora, cliente_externo_id)
  where cliente_externo_id is not null;
