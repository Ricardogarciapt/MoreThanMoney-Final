-- 27/10/2026 (pedido do Ricardo): canal pago do chat para os alertas do MTM Premium Scanner,
-- publicados pelo webhook ?strategy=premiumscanner como «MTM Premium II» (lib/sinais/premium-scanner-webhook.ts).
insert into chat_channels (slug, name, description, parent_slug, position, hidden, icone, cor, etiqueta, leitura, escrita, exige_uid_corretora)
values ('sinais-premium-scanner', 'MTM Premium II', 'Alertas do indicador MTM Premium Scanner (XAUUSD 15m): zona, SL e alvos, com seguimento por preço', 'sinais', 18, false, '💎', '#E9C46A', 'Premium', 'premium', 'ninguem', true)
on conflict (slug) do nothing;
