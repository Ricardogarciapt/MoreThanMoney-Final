-- 147 — HARMONIZAÇÃO 29/09 (decisão do dono), em dois assuntos independentes:
--
--   A) A **Aurum Flow passa a ser só CRIPTO** e os chats que a nomeiam desaparecem: fica um canal
--      só, «Ideias de Cripto», alimentado pelo Telegram «Ideias de Perpétuos Cripto»
--      (-1004363723837), que é exactamente a fonte que a rota `canonical-aurum-flow` já usava.
--   B) O **PrimeVerse fica só com o fxEdge**: o canal passa a «MTM Auto Edge» e a King e a Wolf
--      saem das listas vivas.
--
-- CORRER DEPOIS DO DEPLOY do código que acompanha esta migração (mesma regra da 118): o código
-- novo já escreve e lê os nomes novos.
--
-- ⚠️ NADA SE APAGA com histórico. As mensagens mudam de `channel_slug` e os canais antigos ficam
-- ESCONDIDOS. Os ids das mensagens mantêm-se, por isso as aceitações T2T
-- (`mtmcopy_signal_log.chat_message_id`), as threads (`reply_to_id`) e os desfechos continuam
-- ligados. A única linha que se apaga é um canal AUTO-GERADO com ZERO mensagens (passo 1.4).
--
-- ⚠️ O SLUG `aurum-flow` MANTÉM-SE de propósito. Só o NOME muda. Mudá-lo obrigava a reescrever
-- ~95 ficheiros, 1010 mensagens de histórico, o tracking, a config guardada e as apps NATIVAS
-- (iOS/Android), que não se recompilam a partir deste repositório — uma harmonização a meio é
-- pior do que nenhuma. O slug é interno; o que o membro lê é o nome.

-- ══ PASSO 1 · CRIPTO: um canal só, «Ideias de Cripto» ═══════════════════════════════════════
begin;

-- 1.1 · O que ainda restava no slug antigo vai para o canal único. A migração 118 já tinha feito
--       esta mudança uma vez; chegaram mensagens depois disso, por o `cripto-perps` ter ficado
--       vivo como canal extra do T2T.
update public.chat_messages        set channel_slug = 'aurum-flow' where channel_slug = 'cripto-perps';
update public.mtmcopy_signal_log   set channel_key  = 'aurum-flow' where channel_key  = 'cripto-perps';
update public.mtmcopy_signal_tracking set channel_slug = 'aurum-flow' where channel_slug = 'cripto-perps';

-- 1.2 · O canal único. Deixa de dizer «Aurum Flow» e deixa de prometer ouro.
--       ₿ + âmbar: é o mesmo par ícone/cor que o canal «Aprender Criptomoedas» já usa, para a
--       cripto se ler como uma família só na lista de canais.
update public.chat_channels
   set name        = 'Ideias de Cripto',
       description = 'Sinais de perpétuos cripto (Aurum Flow ORB) — do Telegram «Ideias de Perpétuos Cripto»',
       etiqueta    = 'Cripto',
       icone       = '₿',
       cor         = '#F59E0B',
       hidden      = false
 where slug = 'aurum-flow';

-- 1.3 · O slug antigo fica como arquivo escondido (já sem mensagens depois do 1.1). NÃO se apaga
--       aqui: apagá-lo é decisão do dono e vai à parte, na lista que lhe foi entregue.
update public.chat_channels
   set name     = 'Arquivo · cripto-perps (migrado para Ideias de Cripto)',
       hidden   = true,
       etiqueta = null
 where slug = 'cripto-perps';

-- 1.4 · `t2t-canonical-aurum-flow`: canal AUTO-GERADO, ZERO mensagens, nunca usado.
--       Nasceu de `deriveProviderChannelSlug()` (`t2t-` + id da rota) porque a rota
--       `canonical-aurum-flow` não tinha `app_channel` nem `sender_channel` mapeado — o fallback
--       inventava um canal só dela. Apagar sem o 1.5 fá-lo-ia voltar na sincronização seguinte,
--       por isso os dois passos andam juntos.
delete from public.chat_channels
 where slug = 't2t-canonical-aurum-flow'
   and not exists (select 1 from public.chat_messages where channel_slug = 't2t-canonical-aurum-flow');

-- 1.5 · A rota canónica passa a dizer em que canal publica, e chama-se pelo nome novo.
--       ⚠️ `value` desta chave é uma STRING JSON dentro de jsonb (memória «t2t-fontes-config-guardada»)
--       e é a CONFIGURAÇÃO GUARDADA que manda — mudar o código não chega. A cache é de 30 s.
--       NOTA: não se mexe em `symbols_execute_only`. O bloqueio do ouro faz-se no ROTEAMENTO do
--       webhook (um alerta Aurum não-cripto é descartado antes de chegar à execução), que não
--       depende de adivinhar como é que cada corretora escreve os símbolos de cripto.
update public.site_settings
   set value = to_jsonb((
         jsonb_set(
           (value #>> '{}')::jsonb,
           '{provider_routes}',
           (select jsonb_agg(
                     case when r->>'id' = 'canonical-aurum-flow'
                          then r || jsonb_build_object(
                                 'app_channel', 'aurum-flow',
                                 'label', 'MTM Aurum Flow Cripto',
                                 'tag',   'MTM Aurum Flow Cripto')
                          else r end
                     order by idx)
              from jsonb_array_elements(((value #>> '{}')::jsonb)->'provider_routes')
                   with ordinality t(r, idx))
         )
       )::text),
       updated_at = now()
 where key = 'mtmcopy_signal_sources'
   and jsonb_typeof(value) = 'string';

-- 1.6 · O provider/estratégia diz o que é. A perna de OURO da Aurum (50 XAUUSD + 1 NAS100) está
--       calada desde 02/09; o lado cripto (BTC/ETH) é o que continuou a produzir. O nome passa a
--       dizê-lo em vez de prometer as duas coisas.
update public.mtmauto_providers
   set nome      = 'MTM Aurum Flow Cripto',
       descricao = 'Aurum Flow ORB em perpétuos cripto. O ouro saiu da estratégia a 29/09.'
 where slug in ('aurum-flow', 'golden-moves');

commit;

-- ══ PASSO 2 · PRIMEVERSE: fica só o fxEdge ══════════════════════════════════════════════════
begin;

-- 2.1 · O canal deixa de anunciar três estratégias quando só publica uma.
update public.chat_channels
   set name        = 'MTM Auto Edge',
       description = 'Estratégia MTM Auto Edge (fxEdge) — Tap to Trade',
       etiqueta    = 'Edge'
 where slug = 'sinais-scanner-mtm';

-- 2.2 · A Wolf e a King ficam DESLIGADAS. `executar.ts` recusa qualquer estratégia com
--       `ativo = false`, por isso isto fecha a execução na origem.
--
--       Verificado antes de desligar (29/09): NENHUM cliente fica a meio de uma posição aberta.
--       As 9 execuções que existem são todas do próprio Ricardo, nas contas MTM Funded dele
--       (Wolf 77899983 · King 77712101), todas em estado `pending` e com `broker_position_id`
--       NULO — nunca chegaram a abrir na corretora. O único outro subscritor da Wolf não tem
--       conta ligada (`conta_id` nulo), logo não tem execução nenhuma.
--
--       NÃO se preenche `apagado_em`: apagar a estratégia esconde o histórico dela no painel, e
--       isso é decisão do dono. Desligada basta para não abrir mais nada.
update public.mtmauto_providers
   set ativo = false
 where slug in ('mtm-auto-wolf', 'mtm-auto-king');

-- 2.3 · Execução directa do relay: só a assinatura `fxedge`.
--       (`primeverse_execution` é jsonb normal — ao contrário da chave do passo 1.5.)
update public.site_settings
   set value = value
             || jsonb_build_object('trader', 'fxedge', 'traders', jsonb_build_array('fxedge')),
       updated_at = now()
 where key = 'primeverse_execution';

commit;

-- ── Verificação ──────────────────────────────────────────────────────────────────────────────
-- select slug, name, etiqueta, hidden from chat_channels
--  where slug in ('aurum-flow','cripto-perps','t2t-canonical-aurum-flow','sinais-scanner-mtm');
-- select slug, nome, ativo from mtmauto_providers
--  where slug in ('aurum-flow','mtm-auto-edge','mtm-auto-wolf','mtm-auto-king');
-- select r->>'id', r->>'label', r->>'app_channel'
--   from site_settings, jsonb_array_elements(((value #>> '{}')::jsonb)->'provider_routes') r
--  where key = 'mtmcopy_signal_sources';
