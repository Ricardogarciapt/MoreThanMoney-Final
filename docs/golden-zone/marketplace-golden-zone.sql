-- Golden Zone by MTM no marketplace (08/11/2026): preços do GoldKiller, 50 € semestral e 350 € vitalício.
-- A ficha compra o MESMO plano Stripe do /scanner (lib/marketplace/regras.ts, PLANOS_SCANNER['golden-zone']).
begin;
insert into marketplace_produtos (slug,titulo,subtitulo,descricao,tipo,imagem_url,imagens,preco_cents,moeda,periodicidade,estado,activo,dono,checkout_externo_url,recorrente,grupo,variante_nome,variante_ordem,grupo_subtitulo,publicado_em)
values
('golden-zone-semestral','Golden Zone by MTM','Níveis psicológicos, zona de ação e plano completo no ouro, por 6 meses.',
 E'A Golden Zone é o scanner de scalping de ouro da MTM. Desenha os níveis psicológicos de 5 em 5 $ e, quando uma vela fecha para lá de um nível a favor da tendência, marca o visto amarelo e a zona de 1 $ centrada nesse nível. Só quando o preço recua à zona de ação é que dá os parâmetros: invalidação a 1,5 $ (150 pontos), Saída 1 a +1,5 $ e Saída 2 a +3 $. Bandeira branca na Saída 1; cada visto novo apaga o anterior.\n\nPensado para o XAUUSD em 5 minutos. Alertas JSON por evento, prontos para webhook.\n\nConteúdo educativo, não constitui consultoria financeira. Não executa ordens nem garante resultados.',
 'aplicacao','https://www.morethanmoney.pt/scanners/golden-zone/poster.jpg','[]'::jsonb,
 5000,'eur','unica','publicado',true,'casa','/scanner#goldenzone',false,'golden-zone','6 meses',1,'O scanner de scalping de ouro da casa no TradingView.',now()),
('golden-zone-vitalicio','Golden Zone by MTM · vitalício','A Golden Zone, uma vez, para sempre.',
 E'Acesso vitalício à Golden Zone by MTM no TradingView, com as actualizações incluídas. Pagamento único, sem renovação.\n\nConteúdo educativo, não constitui consultoria financeira.',
 'aplicacao','https://www.morethanmoney.pt/scanners/golden-zone/poster.jpg','[]'::jsonb,
 35000,'eur','unica','publicado',true,'casa','/scanner#goldenzone',false,'golden-zone','Vitalício',2,'O scanner de scalping de ouro da casa no TradingView.',now())
on conflict (slug) do nothing;
-- O pack passa a listar a Golden Zone.
update marketplace_produtos set subtitulo='Todos os scanners MTM — GoldKiller, Aurum Flow, MTM Scanner, TrendShot, Sensei, Premium Scanner, DEFY, RocketNova, Quantum e Golden Zone — por 35 €/mês.' where slug='scanners-mensal';
commit;
