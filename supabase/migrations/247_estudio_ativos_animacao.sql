-- 247 · Animação das imagens dos ativos do estúdio (o editor do Mac anima a imagem por cima do take).
-- auto = o editor escolhe pelo contexto do segmento; sem = imagem parada.
alter table public.estudio_ativos
  add column if not exists animacao text not null default 'auto'
    check (animacao in ('auto', 'sem', 'zoom_in', 'zoom_out', 'pan_esq', 'pan_dir', 'sobe'));
