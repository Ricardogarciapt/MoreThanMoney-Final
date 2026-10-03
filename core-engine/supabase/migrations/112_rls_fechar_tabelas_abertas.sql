-- 112 · Fechar as tabelas que ainda estavam abertas à chave anon
--
-- PORQUÊ
-- A chave anon vai no JavaScript do site e nas apps. A auditoria de 2026-09-17 (a mesma da 111)
-- encontrou políticas que, com essa chave, deixavam qualquer pessoa:
--   * CRÍTICO — mlm_commissions, mlm_nodes, mlm_ranks, mlm_settings: políticas `*_service_role`
--     FOR ALL USING (true) WITH CHECK (true) para `public` (faltava TO service_role). Dava para ler
--     todas as comissões e a árvore, criar comissões a si próprio, mudar a percentagem, etc.
--     Estas políticas nem sequer fazem falta: o service_role tem BYPASSRLS.
--   * CRÍTICO — ai_agent_interactions, ai_sessions, ai_user_insights: FOR ALL USING (true) para `public`.
--   * ALTO — funded_precos_pedidos: ler/inserir/actualizar (true) para authenticated.
--     telegram_messages: INSERT e UPDATE (true) para `public`.
--   * MÉDIO — notification_history, activity_logs, ai_recommendations: INSERT (true) para `public`
--     (histórico de push e registo de actividade forjáveis por qualquer um).
--
-- QUEM LÊ/ESCREVE LEGITIMAMENTE (levantado a 2026-09-17) e porque nada disto parte:
--   * Todo o código do site que toca nestas tabelas usa service_role (getSupabaseAdmin): rotas
--     /api/admin/mlm/*, /api/mlm/dashboard, lib/mlm-*, webhooks Stripe/Apple, crons,
--     /api/notifications/send-push, /api/cron/notifications-prune, /api/admin/stats,
--     /api/mtmfunded/simulado/precos, lib/mtmfunded/simulado/pedidos-precos.ts.
--     O motor services/funded-motor e a edge function calendly-webhook (activity_logs) também.
--     Os logs da API das últimas 24 h confirmam: todos os pedidos a estas tabelas vêm com service_role.
--   * Apps nativas (iOS MTMSupabase.swift, Android MtmSupabase.kt, mtm-auto, mtm-auto-ios):
--     não usam nenhuma destas tabelas.
--   * Funções: log_activity, log_admin_activity, get_recent_activity_logs, get_user_ai_* são
--     SECURITY DEFINER e já só executáveis por service_role. O trigger mlm_increment_direct_count
--     (INVOKER) só corre quando o servidor insere em mlm_nodes (service_role).
--   * ai_*, telegram_messages: vazias e sem código que as use.
-- Ficam as leituras «do próprio» (inofensivas e úteis se um dia o cliente as usar) e a leitura
-- pública de mlm_ranks/mlm_settings (configuração, não dados pessoais).

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. MLM · só o servidor escreve; cada membro lê o seu nó e as suas comissões
-- ─────────────────────────────────────────────────────────────────────────────
drop policy if exists mlm_commissions_service_role on public.mlm_commissions;
drop policy if exists mlm_nodes_service_role on public.mlm_nodes;
drop policy if exists mlm_ranks_service_role on public.mlm_ranks;
drop policy if exists mlm_settings_service_role on public.mlm_settings;

drop policy if exists mlm_commissions_member_read on public.mlm_commissions;
create policy mlm_commissions_member_read on public.mlm_commissions
  for select to authenticated
  using (beneficiary_id = (select auth.uid()));

drop policy if exists mlm_nodes_member_read on public.mlm_nodes;
create policy mlm_nodes_member_read on public.mlm_nodes
  for select to authenticated
  using (user_id = (select auth.uid()));

-- Sem política de escrita a RLS já bloqueia, mas sem GRANT o erro é imediato e não depende
-- de alguém voltar a criar uma política larga.
revoke insert, update, delete on public.mlm_commissions, public.mlm_nodes,
  public.mlm_ranks, public.mlm_settings from anon, authenticated;
revoke select on public.mlm_commissions, public.mlm_nodes from anon;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. IA · só o servidor escreve; cada utilizador lê o que é seu
-- ─────────────────────────────────────────────────────────────────────────────
drop policy if exists "System can manage AI interactions" on public.ai_agent_interactions;
drop policy if exists "System can manage AI sessions" on public.ai_sessions;
drop policy if exists "System can manage AI insights" on public.ai_user_insights;
drop policy if exists "System can insert recommendations" on public.ai_recommendations;

drop policy if exists "Users can view their own AI interactions" on public.ai_agent_interactions;
create policy "Users can view their own AI interactions" on public.ai_agent_interactions
  for select to authenticated using (user_id = (select auth.uid()));

drop policy if exists "Users can view their own AI sessions" on public.ai_sessions;
create policy "Users can view their own AI sessions" on public.ai_sessions
  for select to authenticated using (user_id = (select auth.uid()));

drop policy if exists "Users can view their own AI insights" on public.ai_user_insights;
create policy "Users can view their own AI insights" on public.ai_user_insights
  for select to authenticated using (user_id = (select auth.uid()));

drop policy if exists "Users can view their own AI recommendations" on public.ai_recommendations;
create policy "Users can view their own AI recommendations" on public.ai_recommendations
  for select to authenticated using (user_id = (select auth.uid()));

-- Aceitar/rejeitar a própria recomendação. Faltava o WITH CHECK: dava para passar a linha
-- para outro user_id.
drop policy if exists "Users can update their recommendations" on public.ai_recommendations;
create policy "Users can update their recommendations" on public.ai_recommendations
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

revoke select, insert, update, delete on public.ai_agent_interactions, public.ai_sessions,
  public.ai_user_insights, public.ai_recommendations from anon;
revoke insert, update, delete on public.ai_agent_interactions, public.ai_sessions,
  public.ai_user_insights from authenticated;
revoke insert, delete on public.ai_recommendations from authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. funded_precos_pedidos · fila interna site → motor, só service_role
-- ─────────────────────────────────────────────────────────────────────────────
-- O authenticated só tinha GRANT de SELECT (064), por isso as políticas de escrita estavam
-- mortas; a leitura (true) mostrava a qualquer membro que símbolos os outros pedem. Ninguém
-- a lê com sessão. RLS ligada e sem políticas = só o service_role.
drop policy if exists funded_precos_pedidos_ler on public.funded_precos_pedidos;
drop policy if exists funded_precos_pedidos_inserir on public.funded_precos_pedidos;
drop policy if exists funded_precos_pedidos_atualizar on public.funded_precos_pedidos;
revoke all on public.funded_precos_pedidos from anon, authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. telegram_messages · só o servidor escreve (a leitura pública fica como está)
-- ─────────────────────────────────────────────────────────────────────────────
drop policy if exists "Server can insert telegram messages" on public.telegram_messages;
drop policy if exists "Server can update telegram messages" on public.telegram_messages;
revoke insert, update, delete on public.telegram_messages from anon, authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. notification_history · só o servidor cria (send-push)
-- ─────────────────────────────────────────────────────────────────────────────
drop policy if exists "Sistema cria histórico" on public.notification_history;
-- Havia duas políticas de leitura iguais (com e sem acentos); fica uma.
drop policy if exists "Usuarios veem seu historico" on public.notification_history;

drop policy if exists "Usuários veem seu histórico" on public.notification_history;
create policy "Usuários veem seu histórico" on public.notification_history
  for select to authenticated using (user_id = (select auth.uid()));

-- Marcar como lida/clicada. Com WITH CHECK para não se poder mudar o dono da linha.
drop policy if exists "Usuários atualizam seu histórico" on public.notification_history;
create policy "Usuários atualizam seu histórico" on public.notification_history
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

revoke select, insert, update, delete on public.notification_history from anon;
revoke insert, delete on public.notification_history from authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 6. activity_logs · só o servidor e os admins
-- ─────────────────────────────────────────────────────────────────────────────
drop policy if exists "System can insert activity logs" on public.activity_logs;
-- Duas políticas de leitura iguais; fica uma.
drop policy if exists "Admins can view all activity logs" on public.activity_logs;

drop policy if exists "Admins can view activity logs" on public.activity_logs;
create policy "Admins can view activity logs" on public.activity_logs
  for select to authenticated
  using (exists (
    select 1 from public.profiles p
    where p.id = (select auth.uid()) and p.user_type = 'admin'
  ));

drop policy if exists "Admins can insert activity logs" on public.activity_logs;
create policy "Admins can insert activity logs" on public.activity_logs
  for insert to authenticated
  with check (exists (
    select 1 from public.profiles p
    where p.id = (select auth.uid()) and p.user_type = 'admin'
  ));

revoke select, insert, update, delete on public.activity_logs from anon;
revoke update, delete on public.activity_logs from authenticated;
