-- 110 — ÍNDICES DE VELOCIDADE (pedido do dono, 17/09: «acelera consultas de VPS e base de dados»)
--
-- Tudo medido em pg_stat_statements entre 15/09 14:10 (reinício da base) e 17/09 12:37 (46,5 h)
-- e confirmado com EXPLAIN. Cada bloco diz a consulta, quem a faz e o que custava.
--
-- ORDEM: pode aplicar-se a qualquer momento, antes ou depois do código do ramo `rapido` — o código
-- não depende destes índices e os índices não dependem do código.
--
-- BLOQUEIOS: as tabelas são pequenas (a maior tem 52 mil linhas), por isso `create index` normal
-- bloqueia as escritas menos de um segundo e cabe numa transacção. Se preferir zero bloqueio,
-- correr cada `create index` à mão com `concurrently` (fora de transacção) — o resultado é o mesmo.
--
-- Aditiva e idempotente (if not exists / if exists). Não apaga dados.

-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- 1. chat_messages — respostas em thread (a maior leitura sequencial da base: 107 M de linhas lidas)
--
--    O PostgREST embebe `reply_to_message` com `where reply_to_id = <id da mensagem>` e NÃO havia
--    índice nessa coluna (o advisor também o aponta: FK chat_messages_reply_to_id_fkey sem índice).
--    Resultado: por cada uma das 50 mensagens de um canal, uma leitura da tabela INTEIRA (20 mil
--    linhas). Medido: canal premium-ideas, 50 mensagens → 134 ms e 49 453 blocos. Chamadas do chat
--    (components/mobile/chat-channels.tsx e afins): 158 × 329 ms, 84 × 166 ms, 20 × 519 ms.
--    Também serve `signal-tracker.ts`/`t2t-lifecycle.ts` (`.eq('reply_to_id', …)`: 260 × 227 ms).
--    Parcial: só 25% das mensagens são respostas.
create index if not exists chat_messages_reply_to_idx
  on public.chat_messages (reply_to_id)
  where reply_to_id is not null;

--    Últimas mensagens de TODOS os canais (chat-channels.tsx:2615, sem filtro de canal):
--    `is_deleted = false order by created_at desc limit N` → leitura completa + ordenação,
--    91 chamadas × 690 ms. O índice por (canal, data) não serve sem canal.
create index if not exists chat_messages_recentes_idx
  on public.chat_messages (created_at desc)
  where is_deleted = false;

--    RLS da leitura do chat pela app (cliente com sessão): `is_active_member()` é SECURITY DEFINER
--    (não é «inlined») e era chamada UMA VEZ POR LINHA — cada chamada é uma ida à tabela profiles.
--    Medido na tabela real (15 mil linhas não apagadas): 123 ms por linha-a-linha → 4,5 ms com
--    `(select …)`, que o Postgres calcula uma vez por consulta (InitPlan). A regra é a mesma, letra
--    a letra; só muda QUANDO é avaliada. Idem para `auth.uid()` nas duas políticas.
drop policy if exists chat_messages_select on public.chat_messages;
create policy chat_messages_select on public.chat_messages
  for select using (
    (is_deleted = false) and
    case channel_slug
      when 'premium-ideas' then exists (
        select 1 from public.profiles
         where profiles.id = (select auth.uid())
           and profiles.is_active = true
           and (profiles.subscription_plan = 'premium'
                or profiles.member_category = any (array['iq', 'vip'])
                or profiles.user_type = 'admin')
      )
      else (select public.is_active_member())
    end
  );

drop policy if exists chat_messages_admin on public.chat_messages;
create policy chat_messages_admin on public.chat_messages
  for all using (
    exists (
      select 1 from public.profiles
       where profiles.id = (select auth.uid())
         and profiles.user_type = 'admin'
    )
  );

-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- 2. tradingview_signals — avaliação dos alertas (lib/mtm-alerts/evaluate.ts)
--
--    Passagens 1 e 2 lêem os sinais ainda «em aberto» (sem estado, pending, active, be, exit_1..3)
--    por data. Sem índice que filtre o estado → leitura das 24,5 mil linhas: 186 × 1 440 ms
--    (passagem dos perps) e 204 × 129 ms. Só ~5,8 mil estão em aberto e só 177 são perps.
--    O predicado tem de ser o MESMO conjunto que o código usa (openStatus / openKind), senão o
--    planeador não prova que o índice serve e ignora-o.
create index if not exists tradingview_signals_abertos_idx
  on public.tradingview_signals (received_at)
  where (trade_status is null or trade_status in ('pending', 'active', 'be', 'exit_1', 'exit_2', 'exit_3'))
    and (signal_kind is null or signal_kind = 'entry');

--    Passagem 1 (perps): o filtro `ticker ilike '%USDT%' or ticker ilike '%.P'` fica no índice,
--    que passa a ter ~180 entradas em vez de ler todas as abertas.
create index if not exists tradingview_signals_perps_abertos_idx
  on public.tradingview_signals (received_at)
  where (trade_status is null or trade_status in ('pending', 'active', 'be', 'exit_1', 'exit_2', 'exit_3'))
    and (signal_kind is null or signal_kind = 'entry')
    and (ticker ilike '%USDT%' or ticker ilike '%.P');

--    Criado à mão na queda de 15/09 (primeverse_recent_alerts ordena `desc nulls last`) e nunca
--    passou para uma migração: fica aqui para uma base nova nascer igual à de produção.
create index if not exists idx_tradingview_signals_received_desc_nl
  on public.tradingview_signals (received_at desc nulls last);

-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- 3. mtmcopy_signal_log — monitor T2T (lib/mtmcopy/t2t-price-monitor.ts) e reconciliação
--
--    O monitor corre a cada ~5 s (VPS) e pede as linhas com estado open/ok/active/filled dos
--    últimos 14 dias: 22 221 chamadas × 6 ms. Hoje NÃO existe nenhuma linha nesses estados, mas
--    sem índice por estado o Postgres percorre 14 dias pela data a descartar tudo. A reconciliação
--    (`created_at < corte`, mesmos estados + following) fazia leitura completa: 93 × 400 ms.
--    Índice parcial quase vazio → ambas passam a microssegundos.
create index if not exists mtmcopy_signal_log_vivas_idx
  on public.mtmcopy_signal_log (created_at)
  where status in ('open', 'ok', 'active', 'filled', 'following');

-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- 4. notifications (52 mil linhas, 93 MB)
--
--    a) contador de não lidas do menu (user-dropdown.tsx, app-mobile, member-area; de 30 em 30 s):
--       `user_id = $1 and read = false`, count exacto → 6 445 × 55 ms (o 4.º maior custo total).
--       Utilizadores com 1 300 não lidas. Parcial em read = false: a contagem sai só do índice.
create index if not exists notifications_nao_lidas_idx
  on public.notifications (user_id)
  where read = false;

--    b) painel (notifications-panel.tsx): `user_id = $1 order by created_at desc limit` →
--       ia buscar as 1 300 linhas do utilizador e ordenava: 261 × 190 ms.
create index if not exists notifications_user_recentes_idx
  on public.notifications (user_id, created_at desc);

--    c) aviso de conta bloqueada (lib/mtmcopy/account-health-notice.ts):
--       `type = 'mtmcopy_account_blocked' and created_at >= …` → 46 × 1 950 ms.
create index if not exists notifications_tipo_data_idx
  on public.notifications (type, created_at desc);

--    d) Índices que só custam escrita (18 mil inserções em 46 h):
--       • idx_notifications_read — 0 utilizações; o parcial (a) cobre o mesmo caso por utilizador.
--       • idx_notifications_user_id — coberto por (b), que começa pela mesma coluna.
drop index if exists public.idx_notifications_read;
drop index if exists public.idx_notifications_user_id;

--    e) RLS: TRÊS políticas de SELECT idênticas (`auth.uid() = user_id`) e quatro de UPDATE
--       idênticas. O Postgres avalia todas (OR) e chama auth.uid() por linha em cada uma — o advisor
--       aponta 8 «auth_rls_initplan» nesta tabela. Fica UMA por comando, com `(select auth.uid())`
--       (avaliado uma vez por consulta). A regra é exactamente a mesma: cada utilizador vê, marca e
--       apaga só as suas; as inserções continuam abertas como estavam.
drop policy if exists "Users can view own notifications" on public.notifications;
drop policy if exists "Usuários podem ver suas notificações" on public.notifications;
drop policy if exists "Usuários veem suas notificações" on public.notifications;
drop policy if exists notificacoes_ver_proprias on public.notifications;
create policy notificacoes_ver_proprias on public.notifications
  for select using (user_id = (select auth.uid()));

drop policy if exists "Users can update own notifications" on public.notifications;
drop policy if exists "Usuários atualizam suas notificações" on public.notifications;
drop policy if exists "Usuários marcam como lida" on public.notifications;
drop policy if exists "Usuários podem marcar como lida" on public.notifications;
drop policy if exists notificacoes_actualizar_proprias on public.notifications;
create policy notificacoes_actualizar_proprias on public.notifications
  for update using (user_id = (select auth.uid()));

drop policy if exists "Usuários deletam suas notificações" on public.notifications;
drop policy if exists notificacoes_apagar_proprias on public.notifications;
create policy notificacoes_apagar_proprias on public.notifications
  for delete using (user_id = (select auth.uid()));

-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- 5. Índices duplicados/nunca usados que só pesam nas escritas (advisor «duplicate_index»).
--    Mantém-se sempre o gémeo que TEM utilizações.
drop index if exists public.idx_profiles_email;        -- gémeo: profiles_email_idx (7 usos)
drop index if exists public.idx_profiles_username;     -- gémeo: profiles_username_idx
drop index if exists public.idx_profiles_user_type;    -- gémeo: profiles_user_type_idx (59 usos)
drop index if exists public.profiles_is_active_idx;    -- gémeo: idx_profiles_is_active (870 usos)
drop index if exists public.idx_notification_history_status; -- 0 usos; 2 262 inserções × 23 ms

-- Estatísticas frescas para o planeador escolher já os índices novos.
analyze public.chat_messages;
analyze public.tradingview_signals;
analyze public.mtmcopy_signal_log;
analyze public.notifications;

-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- NÃO incluído (manutenção, fazer à mão numa hora calma): `notifications_pkey` tem 33 MB para
-- 52 mil uuid (~2 MB esperados) e `idx_notifications_created_at` 11 MB — inchaço de apagamentos
-- em massa. `reindex index concurrently public.notifications_pkey;` (e o created_at) devolve o
-- espaço sem bloquear; não pode correr dentro de uma transacção, por isso não vai aqui.
