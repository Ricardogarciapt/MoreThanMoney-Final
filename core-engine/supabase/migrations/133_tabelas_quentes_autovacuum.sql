-- 133 — As tabelas QUENTES passam a arrumar-se sozinhas
--
-- PORQUÊ
-- 25/09: o site devolvia 504 (MIDDLEWARE_INVOCATION_TIMEOUT) e a base de dados respondia em 33s ao
-- auth e em 126s ao PostgREST, com 14 ligações e 2 consultas activas. Não era volume de pedidos: a
-- instância não tinha CPU para responder. Quem lho comia são estas tabelas —
--
--   funded_precos          194 linhas  ·  3 498 270 UPDATEs
--   metaapi_snapshot         5 linhas  ·  1 355 656 UPDATEs
--   mtm_trading_accounts   173 linhas  ·  1 008 529 UPDATEs
--   gestao_real_pulso        1 linha   ·    169 684 UPDATEs
--
-- — tabelas minúsculas reescritas milhões de vezes pelo motor no VPS.
--
-- O QUE ISTO MUDA (e o que NÃO muda)
-- Não reduz o número de escritas: isso mexe no motor, que executa ordens reais, e é decisão à
-- parte. Reduz o CUSTO de cada uma.
--
--  · autovacuum por LIMIAR e não por percentagem. Por omissão o Postgres só arruma quando 20% das
--    linhas estão mortas; numa tabela de 5 linhas esse limiar nunca chega ao valor útil, e ela
--    vive permanentemente inchada. Medido antes desta migração: gestao_real_pulso tinha 1 linha
--    viva em 296 kB, e funded_precos 80 linhas mortas para 194 vivas.
--
--  · fillfactor abaixo de 100. Deixa espaço livre em cada página para o Postgres actualizar a
--    linha NO MESMO sítio (HOT update), sem ter de tocar nos índices. É exactamente o padrão de
--    escrita do motor: sempre as mesmas linhas, sempre a mudar. O fillfactor só vale para páginas
--    novas, por isso o efeito entra à medida que as tabelas se reescrevem — nestas, depressa.
--
-- Arrumar mais vezes custa trabalho; nestas tabelas cada arrumação é de uns quilobytes, e o que se
-- evita é que cada UPDATE tenha de percorrer páginas cheias de versões mortas.

alter table funded_precos          set (autovacuum_vacuum_scale_factor = 0, autovacuum_vacuum_threshold = 50,  autovacuum_analyze_scale_factor = 0, autovacuum_analyze_threshold = 200, fillfactor = 70);
alter table metaapi_snapshot       set (autovacuum_vacuum_scale_factor = 0, autovacuum_vacuum_threshold = 25,  autovacuum_analyze_scale_factor = 0, autovacuum_analyze_threshold = 200, fillfactor = 70);
alter table gestao_real_pulso      set (autovacuum_vacuum_scale_factor = 0, autovacuum_vacuum_threshold = 25,  autovacuum_analyze_scale_factor = 0, autovacuum_analyze_threshold = 200, fillfactor = 70);
alter table servicos_pulso         set (autovacuum_vacuum_scale_factor = 0, autovacuum_vacuum_threshold = 25,  autovacuum_analyze_scale_factor = 0, autovacuum_analyze_threshold = 200, fillfactor = 70);
alter table mtm_trading_accounts   set (autovacuum_vacuum_scale_factor = 0, autovacuum_vacuum_threshold = 100, autovacuum_analyze_scale_factor = 0, autovacuum_analyze_threshold = 500, fillfactor = 80);
alter table metaapi_simbolos_cache set (autovacuum_vacuum_scale_factor = 0, autovacuum_vacuum_threshold = 25,  autovacuum_analyze_scale_factor = 0, autovacuum_analyze_threshold = 200, fillfactor = 70);
alter table funded_precos_pedidos  set (autovacuum_vacuum_scale_factor = 0, autovacuum_vacuum_threshold = 50,  autovacuum_analyze_scale_factor = 0, autovacuum_analyze_threshold = 200, fillfactor = 70);

-- NOTA sobre a limpeza de histórico, para não se repetir a investigação:
-- procurei linhas antigas para apagar em notifications, notification_history e
-- funded_equity_snapshots. Não há NENHUMA com mais de 30 dias — as rotinas de retenção já fazem o
-- trabalho. Os 77 MB da notifications são inchaço, não histórico: se um dia forem precisos de
-- volta, o que os recupera é VACUUM FULL / REINDEX, não um DELETE.
