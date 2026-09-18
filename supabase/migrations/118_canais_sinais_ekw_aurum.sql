-- 118 — DADOS DOS CANAIS DE SINAIS (18/09): «Sinais PrimeVerse» arquivado, canal «MTM Auto
-- Edge/Wolf/King», e Aurum Flow fundida com os Perpétuos de Cripto.
--
-- CORRER DEPOIS DO DEPLOY do ramo chats-sinais-t2t (o código novo já publica no sítio certo).
-- Três passos, cada um no seu bloco; o 3.º só quando o canal Edge/Wolf/King já estiver a receber.
-- Nada se apaga: as mensagens mudam de canal (channel_slug) e os canais antigos ficam ESCONDIDOS.
-- Os ids das mensagens mantêm-se, por isso as aceitações T2T (mtmcopy_signal_log.chat_message_id),
-- as threads (reply_to_id) e os resultados continuam ligados.

-- ── PASSO 1 · Arquivar o «Sinais PrimeVerse» ─────────────────────────────────
-- O slug `sinais-scanner-mtm` passa a ser o canal «MTM Auto Edge/Wolf/King». Tudo o que lá está
-- de ANTES (sinais de todos os traders da fonte, com o nome dela) vai para um canal de arquivo
-- escondido. O mesmo para os sinais dessa fonte que caíram nos canais de índices/forex/perpétuos,
-- e as respostas deles.
begin;

insert into public.chat_channels (slug, name, description, parent_slug, position, hidden)
values ('arquivo-sinais-externos', 'Arquivo · sinais externos (até 18/09)',
        'Histórico do antigo canal de sinais de traders externos. Escondido das apps.', 'sinais', 90, true)
on conflict (slug) do update set hidden = true;

-- O corte: a primeira entrada no formato novo (📌 MTM Auto Edge/King/Wolf). Sem nenhuma ainda,
-- corta-se agora (tudo o que existe é antigo).
with corte as (
  select coalesce(
    (select min(created_at) from public.chat_messages
      where channel_slug = 'sinais-scanner-mtm'
        and content ~ '^\S+ \S+ · (COMPRA|VENDA)\n📌 MTM Auto (Edge|King|Wolf) ·'),
    now()) as em
)
update public.chat_messages m
   set channel_slug = 'arquivo-sinais-externos'
  from corte
 where m.channel_slug = 'sinais-scanner-mtm'
   and m.created_at < corte.em;

-- Sinais dessa fonte noutros canais (marcador antigo) + as respostas a eles + as linhas
-- «✅ ENTRY HIT · PAR 🔵 COMPRA · trader» que a rota antiga postava soltas.
with raizes as (
  select id from public.chat_messages
   where channel_slug in ('trade-ideas', 'trade-ideas-setup', 'cripto-perps')
     and content ilike '%PrimeVerse%'
)
update public.chat_messages m
   set channel_slug = 'arquivo-sinais-externos'
 where m.id in (select id from raizes)
    or m.reply_to_id in (select id from raizes)
    or (m.channel_slug in ('trade-ideas', 'trade-ideas-setup', 'cripto-perps')
        and m.content ~ '^✅ ENTRY HIT · \S+ \S+ \S+ · [A-Za-z0-9_.-]+\n');

update public.chat_channels
   set name = 'MTM Auto Edge/Wolf/King',
       description = 'Estratégias MTM Auto Edge, King e Wolf — Tap to Trade',
       icone = coalesce(icone, '🏆'),
       escrita = coalesce(escrita, 'ninguem')
 where slug = 'sinais-scanner-mtm';

commit;

-- ── PASSO 2 · Aurum Flow & Perpétuos: um canal só (`aurum-flow`) ──────────────
-- As mensagens dos Perpétuos de Cripto passam para o canal da Aurum Flow; o `cripto-perps` fica
-- escondido (histórico preservado). No iOS: a build 76 esconde o canal inteiro pelo nome
-- («Perpétuos»); a build nova mostra-o sem «& Perpétuos» e tira o cripto mensagem a mensagem.
begin;

update public.chat_messages set channel_slug = 'aurum-flow' where channel_slug = 'cripto-perps';

update public.chat_channels
   set name = 'MTM Auto Aurum Flow & Perpétuos',
       description = 'Estratégia Aurum Flow — ouro e perpétuos — Tap to Trade',
       position = 15,
       hidden = false,
       icone = coalesce(icone, '⚡'),
       escrita = coalesce(escrita, 'ninguem')
 where slug = 'aurum-flow';

update public.chat_channels set hidden = true where slug = 'cripto-perps';

-- Aceitações/seguimentos T2T gravados com o canal antigo continuam a ser geridos pelo id da
-- mensagem; o canal só serve para mostrar — alinha-se para os ecrãs de histórico.
update public.mtmcopy_signal_log set channel_key = 'aurum-flow' where channel_key = 'cripto-perps';

-- Fontes T2T sem rota própria: o canal fundido entra (o antigo fica até ao fim das posições).
-- ⚠️ `value` desta chave é uma STRING JSON (memória «t2t-fontes-config-guardada»).
update public.site_settings
   set value = to_jsonb((
         jsonb_set(
           (value #>> '{}')::jsonb,
           '{t2t_extra_channels}',
           (select coalesce(jsonb_agg(distinct x), '[]'::jsonb)
              from jsonb_array_elements_text(
                     coalesce(((value #>> '{}')::jsonb)->'t2t_extra_channels', '[]'::jsonb) || '["aurum-flow"]'::jsonb) x)
         )
       )::text),
       updated_at = now()
 where key = 'mtmcopy_signal_sources'
   and jsonb_typeof(value) = 'string';

commit;

-- ── PASSO 3 · Mostrar o «MTM Auto Edge/Wolf/King» (quando já estiver a receber) ─
-- Verificar antes:
--   select created_at, left(content, 80) from chat_messages
--    where channel_slug = 'sinais-scanner-mtm' order by created_at desc limit 5;
-- (devem aparecer entradas «🔵 XAUUSD · COMPRA / 📌 MTM Auto Edge · Novo sinal»)
update public.chat_channels set hidden = false where slug = 'sinais-scanner-mtm';
