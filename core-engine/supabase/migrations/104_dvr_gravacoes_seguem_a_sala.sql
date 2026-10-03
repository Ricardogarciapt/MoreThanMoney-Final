-- 104 — AS GRAVAÇÕES SEGUEM A SALA, NÃO O EDUCADOR
--
-- O painel de gravações do studio (`/api/live-sessions/dvr`) filtrava por
-- `lms_dvr_jobs.educator_id`, que o `on_dvr` copia da sala quando o ficheiro chega do SRS. Numa
-- sala de gravação sem formador — a «Introdução» — esse campo nasce a null de propósito, e o
-- resultado era invisível de um lado e vazio do outro: o dono gravava, o vídeo subia sozinho ao
-- YouTube, e no painel não aparecia nada. As acções (preparar, enviar para o YouTube, apagar)
-- davam 404 pelo mesmo motivo — todas procuravam o job pelo educador.
--
-- HAVIA DOIS CAMINHOS. PORQUE É QUE ESTE.
--
-- O curto era o `on_dvr` gravar o OPERADOR em `lms_dvr_jobs.educator_id` quando a sala não tem
-- educador. Uma linha, e o painel voltava a encontrar a gravação. Mas esse campo não é só um
-- filtro: `/api/admin/live-sessions/dvr` junta-o a `lms_educators` para dizer DE QUEM é cada
-- gravação, e o /admin agrupa a árvore por academia → educador → sala. O dono passaria a aparecer
-- listado como formador de uma sala que fez questão de não ter formador nenhum — exactamente a
-- colagem que a migração 101 existiu para desfazer.
--
-- Ficou o outro: o painel passou a perguntar QUE SALAS É QUE ESTA PESSOA OPERA
-- (`lms_streams.operador_educator_id`, migração 101) e a procurar os jobs por `stream_id`. A
-- gravação pertence à sala — `lms_dvr_jobs.stream_id` é único desde a 057, é uma por sala — e o
-- significado de `educator_id` fica intacto.
--
-- Esta migração não muda dados nem estrutura: só escreve na base a regra que o código passou a
-- seguir, para que o próximo a ler o schema não volte a colar as duas coisas. É idempotente e não
-- tem transacção porque não há nada que possa ficar a meio.

comment on column public.lms_dvr_jobs.educator_id is
  'QUEM APARECE como formador da sala no momento da gravação (copiado de lms_streams.educator_id) — é para mostrar, não para autorizar. Null nas salas de gravação, que não têm formador. Quem pode ver e gerir a gravação decide-se pela SALA: ver lms_streams.operador_educator_id e idsDasSalasQueOpera() em lib/lms-sala-introducao.ts.';

comment on column public.lms_dvr_jobs.stream_id is
  'A sala a que esta gravação pertence. É a chave real do DVR (única desde a migração 057: uma gravação por sala) e é por aqui que o painel do studio e as acções encontram o job.';

notify pgrst, 'reload schema';
