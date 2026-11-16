-- 252 · Blocos de fecho do Ricardo (16/11/2026) e chamada de fecho de alto valor.
--
-- O dono: nada antes das 10h30 (ginásio, rotina, aulas das 13h às 15h); blocos de fecho das 15h00
-- às 18h30 e um só bloco noturno das 21h30 às 22h00, este SÓ para high-ticket (vendas a partir de
-- 1.200 €). Nada depois das 22h00 e nunca por cima das aulas que ele dá na plataforma.
--
--  · agenda_tipos.alto_valor — só estes tipos podem usar as janelas marcadas `so_alto_valor`.
--  · agenda_anfitrioes.lms_educador_id — as aulas ao vivo desse educador contam como ocupado.
--  · o tipo «fecho-alto-valor» (30 min, Zoom/WhatsApp com o Ricardo) é para onde o closer manda o
--    que não fecha sozinho.

alter table public.agenda_tipos
  add column if not exists alto_valor boolean not null default false;

alter table public.agenda_anfitrioes
  add column if not exists lms_educador_id uuid;

comment on column public.agenda_tipos.alto_valor is
  'Chamada de fecho de alto valor: é a única que pode usar as janelas com so_alto_valor=true.';
comment on column public.agenda_anfitrioes.lms_educador_id is
  'O educador (lms_educators) que é este anfitrião: as aulas ao vivo dele contam como ocupado no /agendar.';

-- As janelas do Ricardo: segunda a sexta, 15h00–18h30, e 21h30–22h00 só para alto valor.
update public.agenda_anfitrioes
set janelas = '[
  {"dia":1,"inicio":"15:00","fim":"18:30"},{"dia":2,"inicio":"15:00","fim":"18:30"},
  {"dia":3,"inicio":"15:00","fim":"18:30"},{"dia":4,"inicio":"15:00","fim":"18:30"},
  {"dia":5,"inicio":"15:00","fim":"18:30"},
  {"dia":1,"inicio":"21:30","fim":"22:00","so_alto_valor":true},{"dia":2,"inicio":"21:30","fim":"22:00","so_alto_valor":true},
  {"dia":3,"inicio":"21:30","fim":"22:00","so_alto_valor":true},{"dia":4,"inicio":"21:30","fim":"22:00","so_alto_valor":true},
  {"dia":5,"inicio":"21:30","fim":"22:00","so_alto_valor":true}
]'::jsonb,
    lms_educador_id = coalesce(lms_educador_id,
      (select id from public.lms_educators where display_name = 'Ricardo Garcia' order by created_at limit 1)),
    updated_at = now()
where id = '215dd36f-ccd8-43df-9436-29554eceb560';

insert into public.agenda_tipos
  (slug, nome, descricao, para_quem, duracao_min, local, pipeline_estado, pack_previsto, ordem, perguntas, anfitrioes, alto_valor)
values
  ('fecho-alto-valor', 'Conversa com o Ricardo',
   'Uma conversa a dois para desenhar um acompanhamento à tua medida. Sem pressão: sais com uma proposta clara e decides com calma.',
   'Quem procura um acompanhamento individual ou um pacote à medida.',
   30, 'whatsapp', 'qualificado', null, 9,
   '[{"chave":"objetivo","rotulo":"O que queres alcançar nos próximos 12 meses?","tipo":"texto","obrigatoria":true},{"chave":"experiencia","rotulo":"Já negoceias hoje?","tipo":"escolha","opcoes":["Nunca negociei","Comecei há pouco","Já negoceio há mais de um ano"],"obrigatoria":true}]'::jsonb,
   array['215dd36f-ccd8-43df-9436-29554eceb560']::uuid[], true)
on conflict (slug) do update set alto_valor = true, anfitrioes = excluded.anfitrioes;
