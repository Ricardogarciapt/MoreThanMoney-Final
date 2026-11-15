-- RocketNova by MTM no marketplace (08/11/2026): preços do GoldKiller, 50 € semestral e 350 € vitalício.
-- A ficha compra o MESMO plano Stripe do /scanner (lib/marketplace/regras.ts, PLANOS_SCANNER.rocketnova).
begin;
insert into marketplace_produtos (slug,titulo,subtitulo,descricao,tipo,imagem_url,imagens,preco_cents,moeda,periodicidade,estado,activo,dono,checkout_externo_url,recorrente,grupo,variante_nome,variante_ordem,grupo_subtitulo,publicado_em)
values
('rocketnova-semestral','RocketNova by MTM','Médias, estrelas de lançamento e gestão da trade, por 6 meses.',
 E'O RocketNova by MTM lê a tendência com as EMAs 20, 50 e 238 e só dá sinal no cruzamento confirmado ao lado de uma estrela de lançamento. A Rocket Candle, o Volatility Pulse e o Trade Clock dizem-te se há força, volatilidade e sessão. O plano fica fixo na vela: entrada, stop e TP1 a TP4, com stop na entrada depois do TP1 e saída por sinal contrário.\n\nPara Forex, Ouro, índices e cripto, em qualquer timeframe. Alertas JSON com a entrada e os seguimentos da trade.\n\nConteúdo educativo, não constitui consultoria financeira. Não executa ordens nem garante resultados.',
 'aplicacao','https://www.morethanmoney.pt/scanners/rocketnova/poster.jpg','[]'::jsonb,
 5000,'eur','unica','publicado',true,'casa','/scanner#rocketnova',false,'rocketnova','6 meses',1,'O scanner de tendência com gestão da trade da casa no TradingView.',now()),
('rocketnova-vitalicio','RocketNova by MTM · vitalício','O RocketNova, uma vez, para sempre.',
 E'Acesso vitalício ao RocketNova by MTM no TradingView, com as actualizações incluídas. Pagamento único, sem renovação.\n\nConteúdo educativo, não constitui consultoria financeira.',
 'aplicacao','https://www.morethanmoney.pt/scanners/rocketnova/poster.jpg','[]'::jsonb,
 35000,'eur','unica','publicado',true,'casa','/scanner#rocketnova',false,'rocketnova','Vitalício',2,'O scanner de tendência com gestão da trade da casa no TradingView.',now())
on conflict (slug) do nothing;
-- O pack passa a listar o RocketNova.
update marketplace_produtos set subtitulo='Todos os scanners MTM — GoldKiller, Aurum Flow, MTM Scanner, TrendShot, Sensei, Premium Scanner, DEFY e RocketNova — por 35 €/mês.' where slug='scanners-mensal';
commit;
