-- O cortador publica na conta da casa: o estilo por omissão passa a ser o da MoreThanMoney
-- (ouro #D2A63C, assinatura @morethanmoney.pt), não o ciano do @ricardogarciapt (ordem do dono, 1/11/2026).
-- Os clips já renderizados têm o estilo queimado no ficheiro e ficam como estão; os que ainda vão
-- ao ffmpeg saem com a marca certa.
alter table public.videocliper_jobs alter column estilo set default 'morethanmoney';
update public.videocliper_jobs set estilo = 'morethanmoney', updated_at = now() where estilo = 'ricardogarciapt';
update public.videocliper_clips set estilo = null where estilo = 'ricardogarciapt';
