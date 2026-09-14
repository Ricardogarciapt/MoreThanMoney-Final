-- 064a — O idioma do videocliper deixa de ser forçado a 'pt' por omissão.
-- Forçar 'pt' numa sessão falada em inglês fazia o Whisper traduzir e as legendas saíam erradas.
-- null = o Whisper detecta a língua falada.
alter table public.videocliper_jobs alter column idioma drop default;
update public.videocliper_jobs set idioma = null where idioma = 'pt';
