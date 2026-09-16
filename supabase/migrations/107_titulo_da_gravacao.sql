-- 107 — TÍTULO DE CADA GRAVAÇÃO NA SALA DE GRAVAÇÃO (pedido do dono, 16/09)
--
-- Na sala «Introdução» cada gravação sobe ao YouTube com o nome da sala, e com várias sessões na
-- mesma playlist deixa de se saber qual é qual. O dono passa a escrever o título no studio antes
-- de carregar em «Iniciar transmissão». A playlist não muda.
--
--  • `lms_streams.gravacao_titulo` — o título escrito ao iniciar (só nas salas de gravação).
--  • `lms_dvr_jobs.titulo` — copiado pelo `on_dvr` quando o ficheiro chega. Copiado nesse momento,
--    e não lido na hora do upload, para que duas gravações seguidas não troquem de nome.
--
-- ORDEM: aplicar ANTES do deploy. A rota on-dvr e o worker passam a pedir estas colunas; sem elas
-- o PostgREST devolve erro, a rota on-dvr (que nunca bloqueia o SRS) responde «0» e a gravação é
-- ignorada em silêncio.
--
-- Aditiva e idempotente.

alter table public.lms_streams add column if not exists gravacao_titulo text;
alter table public.lms_dvr_jobs add column if not exists titulo text;

comment on column public.lms_streams.gravacao_titulo is
  'Título da próxima/actual gravação numa sala de gravação (nunca_ao_vivo). Escrito ao iniciar a transmissão no studio.';
comment on column public.lms_dvr_jobs.titulo is
  'Título próprio desta gravação (copiado de lms_streams.gravacao_titulo pelo on_dvr). Manda sobre o nome da sala no YouTube; a playlist não muda.';

notify pgrst, 'reload schema';
