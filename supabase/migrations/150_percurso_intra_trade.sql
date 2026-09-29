-- 150 · A GRAVAÇÃO DO PERCURSO DENTRO DA TRADE
--
-- PORQUÊ: hoje `mtmcopy_signal_tracking` guarda UM número do caminho — `peak_pips`, o máximo. Com
-- só isso, qualquer simulação de trailing é `max(resultado, pico − distância)`, uma fórmula que
-- NUNCA piora quando se aperta a distância. Logo «quanto mais apertado melhor» não é um resultado:
-- é um artefacto de não se saber por onde o preço andou entre o pico e o fim.
--
-- O QUE ISTO ACRESCENTA
--   · `percurso` — série grosseira do caminho: [{t, p, pico}] em segundos epoch, preço e pico em
--     pips até àquele instante. Amostrada pelo tracker de 1 minuto, com tecto de linhas para a
--     coluna não crescer sem fim.
--   · `saidas`   — uma linha por SAÍDA (cada alvo, o stop, o break-even): [{nivel, em, pico, recuo}],
--     onde `recuo` é quanto o preço já tinha recuado DESDE O PICO no momento daquela saída. É este
--     campo que torna o trailing decidível: sem ele não se sabe se um stop a seguir o preço teria
--     sido tocado antes ou depois do alvo.
--
-- Ambas jsonb e ambas NULL por omissão — as 1 339 linhas que já existem ficam honestamente vazias
-- (não se inventa percurso para trás) e o código trata `null` como «ainda não se gravou».
--
-- SEM ÍNDICES de propósito: ninguém filtra por estes campos, só se lêem pela linha. Um índice GIN
-- aqui era peso de escrita a cada minuto por cada sinal activo, a troco de nada.

alter table public.mtmcopy_signal_tracking
  add column if not exists percurso jsonb,
  add column if not exists saidas jsonb;

comment on column public.mtmcopy_signal_tracking.percurso is
  'Caminho do preço dentro da trade: [{t: epoch_s, p: preço, pico: pips}]. Amostra grosseira do tracker de 1 min, com tecto de linhas. NULL nas linhas anteriores a esta migração.';

comment on column public.mtmcopy_signal_tracking.saidas is
  'Uma linha por saída: [{nivel, em, pico, recuo}] — `recuo` = pips já perdidos desde o pico no momento da saída. É o que torna o trailing decidível.';
