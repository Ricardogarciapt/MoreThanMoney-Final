-- 111 · Fechar a escrita pública em chat_messages e notifications
--
-- PORQUÊ
-- A chave anon vai no JavaScript do site e nas apps. Com ela qualquer pessoa podia:
--   * inserir mensagens em QUALQUER canal do chat, em nome de QUALQUER membro
--     (política chat_messages_insert com WITH CHECK (true) para `public`);
--   * criar notificações para QUALQUER utilizador — phishing dentro da app, com título,
--     texto e `data.url` à escolha (duas políticas INSERT com WITH CHECK (true)).
-- Além disso o anon tinha INSERT/UPDATE/DELETE/TRUNCATE/REFERENCES/TRIGGER nas duas tabelas.
--
-- QUEM ESCREVE LEGITIMAMENTE (levantado a 2026-09-17) e porque nada disto parte:
--   * Rotas do site, crons, relays do Telegram, webhook TradingView, motores mtmcopy, a edge
--     function tradingview-webhook: usam service_role → a RLS e os GRANTs de anon/authenticated
--     não lhes tocam.
--   * App iOS nativa (MTMSupabase.sendChatMessage) e app Android nativa (MtmSupabase.sendChatMessage):
--     POST directo a /rest/v1/chat_messages como `authenticated`, com user_id = o próprio,
--     sem telegram_sender/outcome, message_type text|image|video|link|document. Continua a passar.
--   * /api/mentor/tasks: insere em notifications com o cliente da sessão (authenticated) e
--     user_id = o próprio → coberto pela nova política "a própria notificação".
--     (Nota: hoje essa inserção já falha à parte, porque type='mentor' não está em
--     notifications_type_check; a rota ignora o erro. Não é desta migração.)
--   * Trigger notify_alert_triggered (price_alerts, SECURITY INVOKER): quando o próprio utilizador
--     actualiza o seu alerta, insere uma notificação com user_id = NEW.user_id = auth.uid() → coberto.
--   * Trigger notify_signal_subscribers e notify_native_chat_message: SECURITY DEFINER → não dependem
--     destas políticas.
--   * Clientes web (notifications-panel, member-area, social-feed) só fazem UPDATE/DELETE das
--     próprias notificações → as políticas existentes chegam; mantém-se o GRANT ao authenticated.

begin;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. chat_messages · INSERT só do próprio, com acesso ao canal
-- ─────────────────────────────────────────────────────────────────────────────
drop policy if exists chat_messages_insert on public.chat_messages;

create policy chat_messages_insert on public.chat_messages
  for insert
  to authenticated
  with check (
    -- Ninguém escreve em nome de outro. `(select …)` para o Postgres avaliar uma vez por
    -- instrução e não por linha.
    user_id = (select auth.uid())

    -- Colunas que só o servidor preenche. Sem isto um membro podia forjar uma mensagem
    -- «vinda do Telegram» (telegram_sender) ou um resultado de sinal (outcome), que a app
    -- mostra como se fosse do sistema.
    and telegram_sender is null
    and telegram_message_id is null
    and outcome is null
    and coalesce(is_deleted, false) = false
    -- Os mesmos tipos que a rota /api/chat/messages aceita (ALLOWED_MESSAGE_TYPES).
    and coalesce(message_type, 'text') in ('text', 'image', 'video', 'link', 'document')

    -- Acesso de leitura ao canal: exactamente a regra de chat_messages_select.
    -- Se não podes ler o canal, também não escreves nele.
    and case channel_slug
      when 'premium-ideas' then exists (
        select 1 from public.profiles p
        where p.id = (select auth.uid())
          and p.is_active = true
          and (p.subscription_plan = 'premium'
               or p.member_category = any (array['iq', 'vip'])
               or p.user_type = 'admin')
      )
      else (select public.is_active_member())
    end

    -- Canais de sinais: a mesma regra que canWriteChannel (lib/chat-channel-permissions.ts).
    -- Ler o canal não chega para publicar nele — senão qualquer membro activo publicava uma
    -- «ideia» falsa no Trade Ideas, que o resto da malta copia. Só admin e VIP (VIP vive em
    -- dois campos: user_type OU member_category). Os canais só-de-leitura ficam fechados a
    -- todos por aqui; os admins continuam a entrar pela política chat_messages_admin.
    -- Verificado na base: nos últimos 90 dias só admins/VIP publicaram nestes canais pelas
    -- apps nativas (uma mensagem de membro no sensei-scanner em Junho, antes da regra da app).
    and case
      when channel_slug in ('premium-ideas', 'sensei-scanner', 'trade-ideas') then exists (
        select 1 from public.profiles p
        where p.id = (select auth.uid())
          and p.is_active = true
          and (p.user_type in ('admin', 'vip') or p.member_category = 'vip')
      )
      when channel_slug in ('trade-ideas-setup', 'ideias-e-sinais',
                            'sinais-goldkiller', 'sinais-scanner-mtm') then false
      else true
    end
  );

-- O anon não tem nada a escrever no chat. SELECT fica: a política de leitura já devolve
-- vazio a quem não tem sessão, e retirar o SELECT mudaria o erro que as apps recebem
-- antes do login (lista vazia → 401/42501).
revoke insert, update, delete, truncate, references, trigger
  on public.chat_messages from anon;
-- authenticated: INSERT (apps nativas) e UPDATE/DELETE (moderação dos admins pela política
-- chat_messages_admin) continuam; TRUNCATE ignora a RLS e não é usado por ninguém.
revoke truncate, references, trigger
  on public.chat_messages from authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. notifications · só o servidor cria para terceiros
-- ─────────────────────────────────────────────────────────────────────────────
drop policy if exists "Sistema cria notificações" on public.notifications;
drop policy if exists "Sistema pode criar notificações" on public.notifications;

-- Os dois caminhos de cliente que existem (rota /api/mentor/tasks com a sessão do
-- utilizador e o trigger de price_alerts) criam sempre notificações para o próprio.
-- Criar uma notificação para si mesmo não serve para enganar ninguém.
drop policy if exists notifications_insert_own on public.notifications;
create policy notifications_insert_own on public.notifications
  for insert
  to authenticated
  with check (user_id = (select auth.uid()));

revoke insert, update, delete, truncate, references, trigger
  on public.notifications from anon;
revoke truncate, references, trigger
  on public.notifications from authenticated;

commit;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. CORRECÇÃO GERAL (secção separada — pode ser retirada sem afectar 1 e 2)
-- ─────────────────────────────────────────────────────────────────────────────
-- PORQUÊ
-- Os privilégios por defeito do schema public (pg_default_acl) dão `arwdDxtm` ao anon e ao
-- authenticated em cada tabela nova. Resultado a 2026-09-17: o anon tem TRUNCATE em 237 das
-- 270 tabelas e o authenticated em 250. O TRUNCATE não passa pela RLS: basta um caminho que
-- execute SQL como esses papéis (uma função SECURITY INVOKER com SQL dinâmico, uma extensão
-- futura) para esvaziar uma tabela inteira. REFERENCES e TRIGGER também não fazem falta a
-- clientes. O PostgREST não expõe nenhum dos três, por isso retirá-los não muda nada para as
-- apps nem para o site. Nenhuma função do schema public usa TRUNCATE (verificado).
--
-- O que NÃO se mexe aqui: SELECT/INSERT/UPDATE/DELETE. Esses são o contrato do PostgREST e
-- cada tabela precisa da sua auditoria de políticas (ver relatório de 2026-09-17: mlm_*,
-- ai_*, telegram_messages, activity_logs, notification_history, funded_precos_pedidos).
--
-- LIMITE: os privilégios por defeito do papel supabase_admin só o supabase_admin os altera;
-- tabelas criadas por ele (raras — o painel e as migrações usam postgres) continuam a nascer
-- com TRUNCATE. Correr este bloco de novo de vez em quando apanha-as.
begin;

revoke truncate, references, trigger
  on all tables in schema public from anon, authenticated;

alter default privileges for role postgres in schema public
  revoke truncate, references, trigger on tables from anon, authenticated;

commit;
