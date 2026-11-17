-- APOIO AO CLIENTE NOS 21 IDIOMAS (17/11/2026).
--
-- · suporte_conversas.idioma: o idioma do site de quem escreve (um dos 21 de lib/i18n/config.ts).
--   Decide as frases fixas do balão e o idioma para onde se traduzem as respostas da equipa.
-- · suporte_mensagens.texto_original: o que a equipa escreveu em português, quando a mensagem
--   seguiu traduzida para o cliente.
-- · suporte_mensagens.texto_pt: a tradução para português das mensagens do cliente e do agente,
--   para o CRM (traduz-se uma vez e fica guardada).

alter table public.suporte_conversas add column if not exists idioma text not null default 'pt';
alter table public.suporte_mensagens add column if not exists texto_original text;
alter table public.suporte_mensagens add column if not exists texto_pt text;
