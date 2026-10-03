-- 120 — O ADMIN passa a ser a única fonte do visual dos canais (ícone, cor, etiqueta).
-- Até aqui o chat web caía na tabela fixa do código (chat-channel-meta.ts) quando o admin estava vazio,
-- e a app nativa (3.7.6) mostrava só o que o admin tem — por isso divergiam. Copia-se o visual atual
-- para o admin SÓ onde está vazio (não pisa nada configurado) e esconde-se o canal de perpétuos,
-- fundido na Aurum Flow a 18/09.

update public.chat_channels c
   set icone    = coalesce(nullif(trim(c.icone), ''), v.icone),
       cor      = coalesce(nullif(trim(c.cor), ''), v.cor),
       etiqueta = coalesce(nullif(trim(c.etiqueta), ''), v.etiqueta)
  from (values
  ($v$ideias-e-sinais$v$, $v$🌊$v$, $v$#2DD4BF$v$, $v$Forex Swings$v$),
  ($v$geral$v$, $v$💬$v$, $v$#38BDF8$v$, $v$Aberto$v$),
  ($v$trading$v$, $v$📈$v$, $v$#D2A63C$v$, $v$Aberto$v$),
  ($v$trade-ideas$v$, $v$📊$v$, $v$#60A5FA$v$, $v$Ideias$v$),
  ($v$trade-ideas-setup$v$, $v$📡$v$, $v$#26A5E4$v$, $v$Sensei$v$),
  ($v$premium-ideas$v$, $v$💎$v$, $v$#A78BFA$v$, $v$Premium$v$),
  ($v$sensei-scanner$v$, $v$🧠$v$, $v$#22D3EE$v$, $v$IA$v$),
  ($v$sinais-goldkiller$v$, $v$🥇$v$, $v$#D2A63C$v$, $v$GoldKiller$v$),
  ($v$sinais-scanner-mtm$v$, $v$🏆$v$, $v$#F59E0B$v$, $v$Estratégias$v$),
  ($v$aurum-flow$v$, $v$⚡$v$, $v$#FBBF24$v$, $v$Aurum Flow$v$),
  ($v$cripto$v$, $v$₿$v$, $v$#F59E0B$v$, $v$Aberto$v$),
  ($v$etf-stocks$v$, $v$📈$v$, $v$#6366F1$v$, $v$Aberto$v$),
  ($v$social-ugc$v$, $v$🎬$v$, $v$#EC4899$v$, $v$Aberto$v$),
  ($v$ia$v$, $v$🤖$v$, $v$#22D3EE$v$, $v$Aberto$v$),
  ($v$fitness$v$, $v$💪$v$, $v$#34D399$v$, $v$Aberto$v$),
  ($v$mindset$v$, $v$🧠$v$, $v$#A78BFA$v$, $v$Aberto$v$),
  ($v$lideranca$v$, $v$🚀$v$, $v$#F59E0B$v$, $v$Aberto$v$)
  ) as v(slug, icone, cor, etiqueta)
 where c.slug = v.slug;

update public.chat_channels set hidden = true where slug = 'cripto-perps';
