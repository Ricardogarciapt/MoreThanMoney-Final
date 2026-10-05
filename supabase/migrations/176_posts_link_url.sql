-- 05/10/2026 — o dono pediu que as publicações do feed (/app-mobile?tab=social) tragam a
-- thumbnail do link partilhado. `posts.link_preview` já existia (023) mas era preenchido só
-- pelo browser e só quando o post não tinha média: 31 em 33 posts com URL estavam sem preview.
-- Passa a haver `link_url` (a URL que deu origem ao preview, para a app nativa e para o
-- backfill saberem o que já foi tratado) e o servidor passa a preencher as duas colunas.
ALTER TABLE public.posts
  ADD COLUMN IF NOT EXISTS link_url TEXT;

COMMENT ON COLUMN public.posts.link_url IS 'Primeiro URL do conteúdo; origem de link_preview';

-- A rota POST /api/social/posts escreve em social_posts; fica com as mesmas duas colunas
-- para o mesmo código servir as duas tabelas.
ALTER TABLE public.social_posts
  ADD COLUMN IF NOT EXISTS link_url TEXT,
  ADD COLUMN IF NOT EXISTS link_preview JSONB;

-- Backfill: só interessa a fila «tem link e ainda não tem preview».
CREATE INDEX IF NOT EXISTS posts_sem_link_preview_idx
  ON public.posts (created_at DESC)
  WHERE link_preview IS NULL;
