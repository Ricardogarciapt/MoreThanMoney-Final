-- Conteúdo pronto a publicar para os educadores (22/11/2026).
-- Cada linha é um «pacote» (guião de reel, carrossel, stories, capas) que um educador publica na
-- conta DELE. Começa com o Ruben Pereira, em francês (vive em França).
-- Quem escreve: a tarefa agendada do thread «Criar conteúdo em francês para o Ruben publicar».
-- Quem entrega: o leitor da caixa de DMs (/api/cron/dm-caixa) chama lib/educadores/conteudo.ts,
-- que manda o link do pacote por e-mail e, se a janela da Meta estiver aberta, por DM da
-- @morethanmoney.pt. Nada sai enquanto site_settings.educador_conteudo.envio_ativo não for true.
create table if not exists public.educador_conteudo (
  id uuid primary key default gen_random_uuid(),
  educador text not null,                 -- chave em site_settings.educador_conteudo.educadores (ex.: 'ruben')
  lingua text not null default 'fr',
  data date not null,                     -- dia para que o pacote foi pensado
  tema text,
  pacote jsonb not null,                  -- { reel, carrossel, stories, capas, cta } (ver lib/educadores/conteudo.ts)
  estado text not null default 'pronto' check (estado in ('rascunho','pronto','entregue','publicado','erro')),
  entregar_apos timestamptz not null default now(),
  entregue_email_em timestamptz,
  entregue_dm_em timestamptz,
  entregue_telegram_em timestamptz,
  erro text,
  criado_em timestamptz not null default now(),
  unique (educador, data, lingua)
);

create index if not exists educador_conteudo_pendentes on public.educador_conteudo (estado, entregar_apos);

alter table public.educador_conteudo enable row level security;
-- Sem políticas: só a service role (servidor) lê e escreve.

insert into public.site_settings (key, value)
values ('educador_conteudo', jsonb_build_object(
  'envio_ativo', false,
  'educadores', jsonb_build_object(
    'ruben', jsonb_build_object(
      'nome', 'Ruben Pereira',
      'email', 'imrubenfp@gmail.com',
      'ig_handle', null,
      'igsid', null,
      'telegram_chat_id', null,
      'lingua', 'fr',
      'foto', '/educadores/ruben/retrato.jpg'
    )
  )
))
on conflict (key) do nothing;
