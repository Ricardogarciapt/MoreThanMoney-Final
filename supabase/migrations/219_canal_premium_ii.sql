-- 27/10/2026 (decisão do Ricardo): canal pago do chat «MTM Auto Premium II» para os alertas do
-- MTM Premium Scanner (webhook ?strategy=premiumscanner, lib/sinais/premium-scanner-webhook.ts).
-- Como o GoldKiller: a mestre 77710365 executa sozinha e os clientes entram só por Tap to Trade.
insert into chat_channels (slug, name, description, parent_slug, position, hidden, icone, cor, etiqueta, leitura, escrita, exige_uid_corretora)
values ('sinais-premium-ii', 'MTM Auto Premium II', 'Alertas do indicador MTM Premium Scanner (XAUUSD 15m): zona, SL e alvos — Tap to Trade', 'sinais', 18, false, '💎', '#E9C46A', 'Premium', 'premium', 'ninguem', true)
on conflict (slug) do nothing;

-- O canal liga-se à estratégia (mapaCanalEstrategia) e entra no Tap to Trade sem rota de cópia.
update mtmauto_providers set canal_chat = 'sinais-premium-ii' where slug = 'mtm-auto-premium-ii';

update site_settings
set value = to_jsonb((
  jsonb_set(
    (value #>> '{}')::jsonb,
    '{t2t_extra_channels}',
    coalesce((value #>> '{}')::jsonb -> 't2t_extra_channels', '[]'::jsonb) || '["sinais-premium-ii"]'::jsonb
  )
)::text)
where key = 'mtmcopy_signal_sources'
  and jsonb_typeof(value) = 'string'
  and not coalesce(((value #>> '{}')::jsonb -> 't2t_extra_channels') ? 'sinais-premium-ii', false);
