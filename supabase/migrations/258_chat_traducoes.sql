-- Tradução automática dos chats e do feed (16/11/2026, pedido do Ricardo: «os chats auto-traduzem
-- correctamente sem erros»). Cada texto é traduzido UMA vez por idioma e fica aqui; os leitores
-- seguintes lêem a cache. Só o service role escreve/lê (RLS ligado, sem políticas).
create table if not exists public.chat_traducoes (
  hash text not null,          -- sha256 do texto original
  idioma text not null,        -- idioma de destino (en, es, fr…)
  traducao text not null,
  mesmo_idioma boolean not null default false,  -- o original já estava neste idioma
  criado_em timestamptz not null default now(),
  primary key (hash, idioma)
);
alter table public.chat_traducoes enable row level security;
