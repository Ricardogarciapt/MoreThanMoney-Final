-- 237 — Períodos grátis com subscrição Stripe (06/11/2026)
--
-- Trial Premium de 3 dias SEM cartão e campanha 90 dias (cupão 90DAYSPREVIOUSXP: Membro durante
-- 90 dias, depois Premium a 65 €/mês). A fonte de verdade é a subscrição no Stripe; esta tabela é
-- o espelho que o admin, o backoffice e o MLM lêem. Escrita só pelo webhook (service role).

create table if not exists public.periodos_gratis (
  stripe_subscription_id text primary key,
  user_id uuid references public.profiles(id) on delete set null,
  stripe_customer_id text,
  origem text not null check (origem in ('trial_3d', 'campanha_90d')),
  inicio timestamptz,
  fim timestamptz,
  estado text not null default 'a_decorrer'
    check (estado in ('a_decorrer', 'convertido', 'terminado_sem_pagamento', 'cancelado')),
  tem_metodo_pagamento boolean not null default false,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

create index if not exists periodos_gratis_user_idx on public.periodos_gratis (user_id);
create index if not exists periodos_gratis_estado_fim_idx on public.periodos_gratis (estado, fim);

alter table public.periodos_gratis enable row level security;
-- Sem policies: só o service role lê e escreve.

-- O cupão da campanha. O nome público não cita nenhuma plataforma.
-- Nasce INACTIVO: com o código antigo em produção, o cupão válido dava o 1.º mês a 35 € em vez
-- dos 90 dias. Activa-se depois do merge:
--   update public.coupons set is_active = true where code = '90DAYSPREVIOUSXP';
insert into public.coupons (code, type, discount_value, plan_override, description, is_active)
values (
  '90DAYSPREVIOUSXP',
  'campanha_90d',
  90,
  'app_member',
  'Campanha 90 dias para quem já tem experiência noutras plataformas de educação digital: Membro com a app MTM System, nada cobrado nos 90 dias, depois Premium a 65 €/mês.',
  false
)
on conflict (code) do update
  set type = excluded.type,
      discount_value = excluded.discount_value,
      plan_override = excluded.plan_override,
      description = excluded.description,
      updated_at = now();
