-- Pré-visualização de links em posts (estilo WhatsApp), quando não há média
ALTER TABLE public.posts
ADD COLUMN IF NOT EXISTS link_preview JSONB;

COMMENT ON COLUMN public.posts.link_preview IS 'Open Graph: url, title, description, image, siteName';
