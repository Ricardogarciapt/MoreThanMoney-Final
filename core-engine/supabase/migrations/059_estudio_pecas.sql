-- 059 — Galeria do estúdio de cartões do admin (/admin/social).
--
-- As peças geradas no estúdio só viviam enquanto o separador estava aberto: um refrescar e o
-- trabalho perdia-se. Cada geração passa a ficar guardada aqui, para se poder reabrir,
-- descarregar, voltar a editar (posições arrastadas) ou apagar.
--
-- Só o service role lê e escreve (via /api/admin/social/estudio-pecas, protegida por
-- requireAdmin). RLS ligado e SEM políticas públicas, de propósito: a chave anon não vê nada.

create table if not exists public.estudio_pecas (
  id uuid primary key default gen_random_uuid(),
  criado_por uuid references auth.users(id) on delete set null,
  handle text not null,
  formato text not null default 'post',
  -- 'cartao' | 'carrossel'
  tipo text not null default 'cartao',
  urls text[] not null default '{}',
  -- os textos das lâminas, como o estúdio os tem (array de strings)
  textos jsonb not null default '[]'::jsonb,
  -- hook, cta, proof, fundo, destaque, destaquePos, destaqueEscala, posicoes, caption
  params jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists estudio_pecas_created_at_idx on public.estudio_pecas (created_at desc);

alter table public.estudio_pecas enable row level security;

revoke all on table public.estudio_pecas from anon, authenticated;
