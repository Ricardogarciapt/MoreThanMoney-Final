-- 06/11/2026: posts republicados no grupo de leads terminavam em «📸 @morethanmoney.pt» e o Telegram
-- ligava «@morethanmoney» a um utilizador estranho. O cron ig-curation repara-os aos poucos e marca aqui.
alter table public.ig_curation_log add column if not exists reparado_em timestamptz;
