-- 191 — Radar de leads: só conteúdo fresco (06/10, pedido do dono).
--
-- O radar guardava os posts sem a data de publicação, e o balde `top_media` trazia posts de semanas.
-- A lista ordenava por pontuação, por isso os velhos e populares ficavam no topo. Passa a guardar a
-- data do post (`timestamp` da Graph API) e a lista e a fila só mostram o que tem até 3 dias.

alter table public.ig_radar_prospetos add column if not exists publicado_em timestamptz;
create index if not exists ig_radar_prospetos_frescos
  on public.ig_radar_prospetos (publicado_em desc) where estado = 'pendente';

-- O que está pendente sem data: os populares têm idade desconhecida (podem ter meses) e os
-- frescos encontrados há mais de 2 dias já passaram da conversa. Arquivam-se, não se apagam.
update public.ig_radar_prospetos
   set estado = 'expirado'
 where estado = 'pendente'
   and publicado_em is null
   and (origem = 'popular' or encontrado_em < now() - interval '2 days');
