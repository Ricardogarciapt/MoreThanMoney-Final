-- ─────────────────────────────────────────────────────────────────────────────────────────────────
-- 185 — A DM AO COMENTADOR SAI SOZINHA, E EXPIRA ÀS 48 H (decisão do dono, 06/10 F4).
--
-- A F2 (182) tinha posto a DM do setter do Instagram em `pendente` à espera de aprovação. O dono
-- reverteu: quem comenta iniciou o contacto, por isso a DM sai logo a seguir ao comentário. Se o
-- envio falhar, o cron `ig-funnel` reenvia até 48 h depois do comentário; passadas as 48 h a linha
-- fica `expirado` e nunca sai. `pendente` passa a querer dizer «falhou, por reenviar».
-- Ver lib/envios-aprovacao.ts (`dm_ao_comentador`) e lib/instagram/setter.ts (`reenviarDm`).
-- ─────────────────────────────────────────────────────────────────────────────────────────────────
alter table public.ig_setter_rascunhos drop constraint if exists ig_setter_rascunhos_estado_check;
alter table public.ig_setter_rascunhos add constraint ig_setter_rascunhos_estado_check
  check (estado in ('rascunho','pendente','aprovado','enviado','falhou','expirado','descartado','encerrado'));
