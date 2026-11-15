-- Quantum by MTM no marketplace (08/11/2026): preços do GoldKiller, 50 € semestral e 350 € vitalício.
-- A ficha compra o MESMO plano Stripe do /scanner (lib/marketplace/regras.ts, PLANOS_SCANNER.quantum).
begin;
insert into marketplace_produtos (slug,titulo,subtitulo,descricao,tipo,imagem_url,imagens,preco_cents,moeda,periodicidade,estado,activo,dono,checkout_externo_url,recorrente,grupo,variante_nome,variante_ordem,grupo_subtitulo,publicado_em)
values
('quantum-semestral','Quantum by MTM','Tendência, recuo e painel de força, por 6 meses.',
 E'O Quantum by MTM é um seguidor de tendência que entra em recuos. A linha primária e a seta de fase dão a direção, o painel de força dá uma pontuação de 0 a 100 com uma seta por timeframe, e a entrada nasce quando o preço recua à fita, o oscilador entra na zona e aparece o triângulo ou o ponto na cor da direção. Traz ainda a estrutura HH/HL/LH/LL, linhas de tendência, bandas de volatilidade e os máximos e mínimos das sessões.\n\nPara Forex, Ouro, índices e cripto, em qualquer timeframe. Alertas JSON com entrada, stop e alvo.\n\nConteúdo educativo, não constitui consultoria financeira. Não executa ordens nem garante resultados.',
 'aplicacao','https://www.morethanmoney.pt/scanners/quantum/poster.jpg','[]'::jsonb,
 5000,'eur','unica','publicado',true,'casa','/scanner#quantum',false,'quantum','6 meses',1,'O seguidor de tendência com entradas em recuo da casa no TradingView.',now()),
('quantum-vitalicio','Quantum by MTM · vitalício','O Quantum, uma vez, para sempre.',
 E'Acesso vitalício ao Quantum by MTM no TradingView (painel de preço e oscilador), com as actualizações incluídas. Pagamento único, sem renovação.\n\nConteúdo educativo, não constitui consultoria financeira.',
 'aplicacao','https://www.morethanmoney.pt/scanners/quantum/poster.jpg','[]'::jsonb,
 35000,'eur','unica','publicado',true,'casa','/scanner#quantum',false,'quantum','Vitalício',2,'O seguidor de tendência com entradas em recuo da casa no TradingView.',now())
on conflict (slug) do nothing;
-- O pack passa a listar o Quantum.
update marketplace_produtos set subtitulo='Todos os scanners MTM — GoldKiller, Aurum Flow, MTM Scanner, TrendShot, Sensei, Premium Scanner, DEFY, RocketNova e Quantum — por 35 €/mês.' where slug='scanners-mensal';
commit;
