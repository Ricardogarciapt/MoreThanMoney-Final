-- SniperPro by MTM no marketplace (08/11/2026): preços do GoldKiller, 50 € semestral e 350 € vitalício.
-- A ficha compra o MESMO plano Stripe do /scanner (lib/marketplace/regras.ts, PLANOS_SCANNER.sniperpro).
begin;
insert into marketplace_produtos (slug,titulo,subtitulo,descricao,tipo,imagem_url,imagens,preco_cents,moeda,periodicidade,estado,activo,dono,checkout_externo_url,recorrente,grupo,variante_nome,variante_ordem,grupo_subtitulo,publicado_em)
values
('sniperpro-semestral','SniperPro by MTM','Bandas, trend screener, nuvem Kalman, pivots e níveis-chave, por 6 meses.',
 E'O SniperPro by MTM junta num só estudo as bandas de exaustão a 1.5, 2 e 2.5 desvios, um trend screener com onze médias adaptativas e a tabela de tendência, estado e força, uma nuvem Kalman que pinta as velas, Supertrend, Parabolic SAR, etiquetas de exaustão por volume, pivots S1–S7 / R1–R7 e níveis-chave. O painel SniperPro Asst lê o momento com um RSI alisado, bandas de retest e divergências. Os sinais saem com pontuação e o plano por alerta: entrada, stop e três alvos.\n\nPara Forex, Ouro, índices e cripto, em qualquer timeframe.\n\nConteúdo educativo, não constitui consultoria financeira. Não executa ordens nem garante resultados.',
 'aplicacao','https://www.morethanmoney.pt/scanners/sniperpro/poster.jpg','[]'::jsonb,
 5000,'eur','unica','publicado',true,'casa','/scanner#sniperpro',false,'sniperpro','6 meses',1,'O painel de preço completo da casa no TradingView, com o painel de momento.',now()),
('sniperpro-vitalicio','SniperPro by MTM · vitalício','O SniperPro, uma vez, para sempre.',
 E'Acesso vitalício ao SniperPro by MTM e ao SniperPro Asst no TradingView, com as actualizações incluídas. Pagamento único, sem renovação.\n\nConteúdo educativo, não constitui consultoria financeira.',
 'aplicacao','https://www.morethanmoney.pt/scanners/sniperpro/poster.jpg','[]'::jsonb,
 35000,'eur','unica','publicado',true,'casa','/scanner#sniperpro',false,'sniperpro','Vitalício',2,'O painel de preço completo da casa no TradingView, com o painel de momento.',now())
on conflict (slug) do nothing;
-- O pack passa a listar o SniperPro.
update marketplace_produtos set subtitulo='Todos os scanners MTM — GoldKiller, Aurum Flow, MTM Scanner, TrendShot, Sensei, Premium Scanner, DEFY, RocketNova e SniperPro — por 35 €/mês.' where slug='scanners-mensal';
commit;
