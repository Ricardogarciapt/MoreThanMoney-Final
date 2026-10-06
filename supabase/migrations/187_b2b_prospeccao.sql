-- 187 · PROSPEÇÃO B2B PELO EMAIL PROFISSIONAL (06/10/2026)
--
-- Base legal: Lei 41/2004, art. 13.º-A, n.º 2 — o regime de opt-out aplica-se a PESSOAS COLECTIVAS.
-- Pode-se escrever primeiro ao endereço profissional de uma empresa desde que a mensagem identifique
-- a MTM e traga forma de sair; quem sai entra na exclusão GLOBAL e nunca mais é contactado.
--
-- Tudo aqui é só service role: RLS ligado e sem políticas, e sem privilégios para anon/authenticated.

-- 1. A LISTA DE EXCLUSÃO GLOBAL. Igual à da 183 (motor dos agentes) — se a 183 já correu, isto não
--    mexe em nada; se ainda não correu, nasce aqui com o mesmo formato e a 183 encontra-a pronta.
create table if not exists public.contacto_exclusao (
  identificador text primary key,
  canal_origem text,
  pedido_em timestamptz not null default now(),
  nota text
);
alter table public.contacto_exclusao enable row level security;
revoke all on public.contacto_exclusao from anon, authenticated;

create or replace function public.contacto_exclusao_nao_se_apaga() returns trigger
language plpgsql as $$
begin
  raise exception 'Quem pediu para sair não volta a ser contactado: a exclusão não se apaga (%).', old.identificador;
end $$;
drop trigger if exists contacto_exclusao_nao_se_apaga on public.contacto_exclusao;
create trigger contacto_exclusao_nao_se_apaga
  before delete on public.contacto_exclusao
  for each row execute function public.contacto_exclusao_nao_se_apaga();

-- 2. OS PROSPECTOS. Um por email; a URL de onde o email foi tirado é obrigatória (é a prova de que
--    o endereço foi publicado pela própria empresa para contacto).
create table if not exists public.b2b_prospectos (
  id uuid primary key default gen_random_uuid(),
  empresa text not null,
  site text,
  segmento text not null check (segmento in ('ib_afiliado','comunidade','criador','escola','prop_firm')),
  pais text not null default 'PT' check (pais in ('PT','BR')),
  email text not null,
  email_tipo text not null default 'generico' check (email_tipo in ('generico','comercial_publicado')),
  fonte_url text not null check (fonte_url ~* '^https?://'),
  fonte_verificada_em timestamptz,
  identificacao text,
  pessoa_colectiva boolean not null default false,
  estado text not null default 'novo' check (estado in ('novo','contactado','respondeu','reuniao','fechado','excluido')),
  agente text not null default 'AG-CLOSER',
  toques int not null default 0 check (toques between 0 and 3),
  ultimo_toque_em timestamptz,
  respondeu_em timestamptz,
  nota text,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  constraint b2b_prospectos_email_minusculo check (email = lower(email))
);
create unique index if not exists b2b_prospectos_email_uidx on public.b2b_prospectos (email);
create index if not exists b2b_prospectos_fila_idx on public.b2b_prospectos (estado, toques, ultimo_toque_em);
alter table public.b2b_prospectos enable row level security;
revoke all on public.b2b_prospectos from anon, authenticated;

-- 3. O REGISTO DE CADA ENVIO, COM A BASE LEGAL. Sai, fica na fila ou é bloqueado — grava-se sempre.
create table if not exists public.b2b_envios (
  id uuid primary key default gen_random_uuid(),
  prospecto_id uuid references public.b2b_prospectos(id) on delete set null,
  email text not null,
  toque int not null check (toque between 1 and 3),
  assunto text,
  texto text,
  agente text not null,
  base_legal text not null default 'b2b_pessoa_colectiva' check (base_legal = 'b2b_pessoa_colectiva'),
  decisao text not null check (decisao in ('sai','fila','bloqueado')),
  motivo text not null,
  enviado_em timestamptz,
  erro text,
  criado_em timestamptz not null default now()
);
create index if not exists b2b_envios_dia_idx on public.b2b_envios (criado_em desc) where decisao = 'sai';
create index if not exists b2b_envios_prospecto_idx on public.b2b_envios (prospecto_id, toque);
alter table public.b2b_envios enable row level security;
revoke all on public.b2b_envios from anon, authenticated;

-- 4. A configuração: começa DESLIGADA; liga-se no painel (ou por SQL) depois das guardas.
insert into public.site_settings (key, value, description)
select 'b2b_prospeccao',
       jsonb_build_object('ligado', false, 'tecto_dia', 20, 'intervalo_seg', 12, 'primeiro_lote', 10,
                          'dias_entre_toques', jsonb_build_array(0, 4, 7)),
       'Prospeção B2B por email profissional: interruptor, tecto diário total, intervalo entre envios.'
where not exists (select 1 from public.site_settings where key = 'b2b_prospeccao');
