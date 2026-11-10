-- 243 · Executor do pipeline + aprovação humana da DM do setter (10/11/2026)
--
-- 1) Liga o executor do pipeline (lib/vendas/executor-pipeline.ts, cron /api/cron/pipeline-executor).
--    Só envia o que a regra legal deixa (consentimento vivo / soft opt-in / exclusão global / tectos);
--    a lista importada do WhatsApp (sem consentimento) nunca é tocada. Máximo `limite` por corrida.
--    Desligar: update site_settings set value = jsonb_set(value,'{ligado}','false') where key='pipeline_executor';
insert into public.site_settings (key, value, updated_at)
values ('pipeline_executor', '{"ligado": true, "limite": 20, "desde": "2026-11-10"}'::jsonb, now())
on conflict (key) do nothing;

-- 2) A DM do setter do Instagram deixa de sair sozinha: `enviar_dm` desliga (efeito imediato, mesmo
--    com o código antigo) e `aprovacao_dm` faz cada DM pedir OK ao dono no Telegram (botões
--    Enviar/Descartar) assim que o código novo estiver no ar. Voltar ao envio sozinho:
--    enviar_dm = true e aprovacao_dm = false.
update public.site_settings
set value = coalesce(value, '{}'::jsonb) || '{"enviar_dm": false, "aprovacao_dm": true}'::jsonb,
    updated_at = now()
where key = 'ig_setter_persona';
