-- 254 · Trial com cartão e áudios por momento (16/11/2026).
--
--  · periodos_gratis.lembrete_enviado_em — o trial de 3 dias passou a pedir o cartão à entrada
--    (decisão do dono, 16/11). Antes da primeira cobrança vai um email a lembrar a data, o valor e
--    como cancelar; esta coluna garante que vai uma só vez.
--  · ig_dm_log.audio_motivo — que áudio na voz do Ricardo saiu com esta resposta
--    ('quebra_gelo' ou 'fecho'). No máximo dois por conversa.

alter table public.periodos_gratis
  add column if not exists lembrete_enviado_em timestamptz;

alter table public.ig_dm_log
  add column if not exists audio_motivo text
    check (audio_motivo is null or audio_motivo in ('quebra_gelo', 'fecho'));

create index if not exists ig_dm_log_sender_audio_idx
  on public.ig_dm_log (sender_id) where audio_motivo is not null;
