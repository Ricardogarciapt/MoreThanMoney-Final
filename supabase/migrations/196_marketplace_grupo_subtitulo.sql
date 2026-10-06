-- 196 — Marketplace: a frase do CARTÃO DE GRUPO (06/10).
--
-- Num cartão de grupo, o subtítulo da variante principal soa mal ao lado de «desde X» (o do Pack
-- de Scanners dizia «… por mês» num cartão que também vende o vitalício). `grupo_subtitulo` é a
-- frase do grupo: sem periodicidade, igual em todas as variantes do grupo (a rota de gestão
-- propaga-a ao grupo inteiro), e editável no gestor de produtos. Nula = a montra usa um subtítulo
-- neutro (ver `subtituloDoCartao` em lib/marketplace/grupos.ts).
alter table public.marketplace_produtos
  add column if not exists grupo_subtitulo text;

alter table public.marketplace_produtos drop constraint if exists marketplace_produtos_grupo_subtitulo_check;
alter table public.marketplace_produtos add constraint marketplace_produtos_grupo_subtitulo_check
  check (grupo_subtitulo is null or char_length(grupo_subtitulo) between 1 and 120);

-- Os seis grupos de hoje. Cada frase sai da descrição/subtítulo reais do produto — nada inventado,
-- nenhum número, nenhum período.
update public.marketplace_produtos as p
   set grupo_subtitulo = g.frase
  from (values
    ('pack-scanners', 'Todos os scanners MTM no teu TradingView: zonas, níveis e alertas.'),
    ('mtm-sensei-ea', 'O Sensei a correr sozinho no teu MetaTrader 5.'),
    ('sensei-scalp',  'A versão rápida do Sensei, para quem fecha no dia.'),
    ('membro',        'A porta de entrada: academias, sessões ao vivo e a comunidade.'),
    ('premium',       'Tudo o que o Membro tem, mais os sinais e a execução automática.'),
    ('mtm-scanner',   'O scanner de forex da casa no TradingView, sem o resto do pack.')
  ) as g(grupo, frase)
 where p.grupo = g.grupo;
