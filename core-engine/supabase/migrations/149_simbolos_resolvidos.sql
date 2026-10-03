-- Onde fica escrito o que a resolução automática de símbolos já decidiu para cada conta.
--
-- PORQUÊ AQUI: `metaapi_simbolos_cache` já é a tabela por-conta do catálogo de símbolos, e já é
-- ela que carrega o travão de quota da MetaApi (`metaapi_quota_bloqueio_ate`). Pôr a resolução ao
-- lado do catálogo de onde ela saiu evita uma segunda tabela a dizer o mesmo com outro prazo.
--
-- PORQUÊ GUARDAR: sem isto a escolha é recalculada a cada ordem, e o desempate depende da
-- FREQUÊNCIA dos sufixos na conta. Basta a corretora acrescentar meia dúzia de símbolos com outro
-- sufixo para o vencedor mudar — e a mesma estratégia passava a abrir noutro instrumento sem que
-- ninguém tivesse mudado nada. Guardada, a escolha só muda quando o símbolo deixa de existir.
--
-- NÃO substitui `copia_rotas.mapa_simbolos`: esse é a decisão humana e manda sempre.
-- Formato: { "XAUUSD": "XAUUSD.r", "US30": "US30-VIP" } — canónico → símbolo real da conta.

alter table public.metaapi_simbolos_cache
  add column if not exists simbolos_resolvidos jsonb not null default '{}'::jsonb;

comment on column public.metaapi_simbolos_cache.simbolos_resolvidos is
  'Canónico → símbolo da corretora resolvido automaticamente. O mapa manual da rota manda sobre isto.';
