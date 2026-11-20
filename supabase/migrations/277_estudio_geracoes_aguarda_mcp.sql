-- 20/11/2026: reels cinemáticos geram o gémeo com os créditos do PLANO HeyGen (via MCP, rotina diária),
-- porque a chave da API não tem saldo. O cron deixa o pedido em 'aguarda_mcp'; a rotina gera e passa-o a 'a_gerar'.
alter table public.estudio_geracoes drop constraint if exists estudio_geracoes_estado_check;
alter table public.estudio_geracoes add constraint estudio_geracoes_estado_check
  check (estado = any (array['fila','a_gerar','pronto','erro','cancelado','aguarda_mcp']));
