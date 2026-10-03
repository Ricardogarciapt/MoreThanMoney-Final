-- 108 — SOMBRA DAS ESTRATÉGIAS: o que uma estratégia DESLIGADA teria feito, dia a dia (pedido do dono, 16/09)
--
-- O MTM Scanner foi desligado a 11/09 (`mtmauto_providers.ativo = false`, 27 perdas seguidas na
-- conta-mestre 19042). O dono quer medi-lo antes de decidir se volta a executar: sem abrir nada,
-- registar o que TERIA sido executado (o gate do webhook, com as regras de hoje) e como teria
-- acabado (replay em velas M15 com a gestão de `configDoProvider`). Código: lib/mtmauto/sombra;
-- quem escreve: o serviço services/sombra-estrategias na VPS, uma vez por dia (06:30 UTC).
--
--  • `estrategia_sombra_dia` — UMA linha por estratégia e dia (UTC). O serviço reescreve os últimos
--    dias num único upsert por corrida (as trades de ontem ainda podem estar abertas: `definitivo`
--    só fica true quando nenhuma ficou por resolver). Só a service role escreve e lê (RLS ligada e
--    sem políticas); o Centro de Controlo lê pelo servidor.
--  • `mtmauto_providers.sinais_config.modo = 'sombra'` no Scanner — ETIQUETA para o painel, nada
--    mais. Quem decide a execução é `ativo` (e `SLUGS_QUE_NAO_EXECUTAM` no código); nenhum executor
--    lê `modo`. `ativo` NÃO é tocado aqui e continua false.
--
-- ORDEM: aplicar antes de ligar o serviço. Sem a tabela o Centro mostra «migração 108 por aplicar»
-- e o serviço falha a escrita (sai com erro no journal, não toca em mais nada).
--
-- Aditiva e idempotente.

create table if not exists public.estrategia_sombra_dia (
  estrategia text not null,
  dia date not null,
  trades integer not null default 0,
  vitorias integer not null default 0,
  r_total numeric not null default 0,
  r_medio numeric,
  pior_sequencia numeric not null default 0,
  perdas_seguidas integer not null default 0,
  exposicao_max integer not null default 0,
  abertas integer not null default 0,
  definitivo boolean not null default false,
  gestao jsonb not null default '{}'::jsonb,
  detalhe jsonb not null default '{}'::jsonb,
  atualizado_em timestamptz not null default now(),
  primary key (estrategia, dia)
);

alter table public.estrategia_sombra_dia enable row level security;

comment on table public.estrategia_sombra_dia is
  'Sombra diária de uma estratégia que NÃO executa: trades que teriam passado o gate do webhook e o seu resultado em velas M15 (lib/mtmauto/sombra). Escrita 1x/dia pelo serviço VPS sombra-estrategias.';
comment on column public.estrategia_sombra_dia.estrategia is 'slug em mtmauto_providers (ex.: mtm-scanner)';
comment on column public.estrategia_sombra_dia.dia is 'dia UTC em que os sinais chegaram';
comment on column public.estrategia_sombra_dia.r_total is 'soma dos resultados em R (1R = entrada com spread → stop já alargado ao mínimo da fonte)';
comment on column public.estrategia_sombra_dia.pior_sequencia is 'maior queda acumulada em R dentro do dia (≤ 0)';
comment on column public.estrategia_sombra_dia.perdas_seguidas is 'maior número de perdas seguidas dentro do dia';
comment on column public.estrategia_sombra_dia.exposicao_max is 'máximo de posições abertas ao mesmo tempo num instante em que abriu uma trade deste dia (conta as que vinham de trás)';
comment on column public.estrategia_sombra_dia.definitivo is 'true quando nenhuma trade do dia ficou por resolver; até lá o serviço volta a medir o dia';
comment on column public.estrategia_sombra_dia.gestao is 'a gestão usada (configDoProvider na hora da medição), legível';
comment on column public.estrategia_sombra_dia.detalhe is 'ideias, passaram_gate, fora_por_motivo, exposição (moeda, hora), risco somado, por_simbolo, motivos de fecho';

update public.mtmauto_providers
   set sinais_config = coalesce(sinais_config, '{}'::jsonb) || '{"modo":"sombra"}'::jsonb
 where slug = 'mtm-scanner'
   and coalesce(sinais_config->>'modo', '') <> 'sombra';

comment on column public.mtmauto_providers.sinais_config is
  'Gestão por estratégia lida por configDoProvider (lib/mtmfunded/estrategias-sinais/calculo.ts). A chave "modo" (ex.: "sombra") é só uma etiqueta para o painel: quem decide se a estratégia executa é a coluna ativo.';

notify pgrst, 'reload schema';
