-- 060 — Pré-visualizações dos clips propostos (videocliper).
--
-- Antes, um clipe só tinha imagem e vídeo DEPOIS de aprovado e cortado — decidia-se às cegas,
-- pelo texto. O worker passa a gerar, logo a seguir à análise, um frame e uma versão leve
-- (540x960, com as legendas) de cada proposta. preview_estado null = por fazer.
alter table public.videocliper_clips
  add column if not exists preview_url text,
  add column if not exists preview_estado text check (preview_estado in ('a_fazer','feito','erro')),
  add column if not exists preview_erro text;
